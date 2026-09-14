import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAuth } from '../mobile/auth.mjs';
import { AUTH_CALLBACK, AUTH_PENDING_KEY, callbackResult, safeDestination, publicUrl, validPending } from '../mobile/policy.mjs';

test('callback accepts only the exact registered endpoint', () => {
  assert.deepEqual(callbackResult(`${AUTH_CALLBACK}?code=abc`), { code: 'abc' });
  assert.deepEqual(callbackResult(`${AUTH_CALLBACK}?error=access_denied`), { error: true });
  for (const url of ['https://evil.test/?code=x', 'com.urganlab.gifto://evil/callback?code=x',
    'com.urganlab.gifto://auth/callback/extra?code=x', 'com.urganlab.gifto://user@auth/callback?code=x',
    `${AUTH_CALLBACK}#access_token=secret`, AUTH_CALLBACK, 'bad']) assert.equal(callbackResult(url), null);
});
test('native next routes reject foreign hosts, protocols, traversal and login loops', () => {
  for (const root of ['https://localhost/', 'capacitor://localhost/']) {
    const home = `${root}index.html`;
    assert.equal(safeDestination('pages/create.html?list=123', root), `${root}pages/create.html?list=123`);
    assert.equal(safeDestination('create.html?list=123', root), `${root}pages/create.html?list=123`);
    for (const path of ['//evil.test/pages/create.html', 'javascript:alert(1)', 'capacitor://evil/pages/create.html',
      'pages/login.html', 'pages/../secret.html', 'https://evil.test/', null]) assert.equal(safeDestination(path, root), home);
  }
});
test('share links are public, never WebView localhost', () => {
  assert.equal(publicUrl('pages/wishlist.html?owner=a'), 'https://urgan93.github.io/gifto/pages/wishlist.html?owner=a');
  assert.throws(() => publicUrl('https://evil.test/'));
  assert.throws(() => publicUrl('../private'));
});
test('pending login expires and malformed state fails closed', () => {
  assert.equal(validPending('bad'), null);
  assert.equal(validPending(JSON.stringify({ startedAt: 1 }), 1800001), null);
  assert.equal(validPending(JSON.stringify({ startedAt: 9999 }), 1000), null);
});

function fixture({ launch, exchangeError, launchFailure, openFailure } = {}) {
  const map = new Map(); const calls = []; const listeners = {};
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const service = createNativeAuth({
    auth: { signInWithOAuth: async options => { calls.push(['oauth', options]); return { data: { url: 'https://auth.example/authorize' } }; },
      exchangeCodeForSession: async code => { calls.push(['exchange', code]); return exchangeError ? { error: new Error('expired') } : { data: { session: { user: { id: 'test' } } } }; } },
    app: { addListener: async (name, handler) => { listeners[name] = handler; }, getLaunchUrl: async () => { if (launchFailure) throw Error('plugin unavailable'); return launch ? { url: launch } : undefined; } },
    browser: { open: async () => { if (openFailure) throw Error('no browser'); calls.push(['open']); }, close: async () => calls.push(['close']),
      addListener: async (name, handler) => { listeners[name] = handler; } },
    storage, root: 'https://localhost/', navigate: url => calls.push(['navigate', url]), notify: text => calls.push(['notify', text]),
    resetButton: () => calls.push(['reset']), now: () => 1000
  });
  return { service, storage, calls, listeners };
}
test('warm callback exchanges PKCE once and preserves return route', async () => {
  const f = fixture();
  await f.service.login('pages/my-page.html');
  assert.equal(f.calls.find(c => c[0] === 'oauth')[1].options.redirectTo, AUTH_CALLBACK);
  await Promise.all([f.service.handleUrl(`${AUTH_CALLBACK}?code=test`), f.service.handleUrl(`${AUTH_CALLBACK}?code=test`)]);
  assert.equal(f.calls.filter(c => c[0] === 'exchange').length, 1);
  assert.deepEqual(f.calls.find(c => c[0] === 'navigate'), ['navigate', 'https://localhost/pages/my-page.html']);
  assert.equal(f.storage.getItem(AUTH_PENDING_KEY), null);
  assert.equal(await f.service.handleUrl(`${AUTH_CALLBACK}?code=test`), false);
});
test('cold callback restores persisted pending login', async () => {
  const f = fixture({ launch: `${AUTH_CALLBACK}?code=cold` });
  f.storage.setItem(AUTH_PENDING_KEY, JSON.stringify({ startedAt: 900, next: 'pages/create.html' }));
  await f.service.init();
  assert.deepEqual(f.calls.find(c => c[0] === 'navigate'), ['navigate', 'https://localhost/pages/create.html']);
});
test('unsolicited callback cannot create a session', async () => {
  const f = fixture(); await f.service.init();
  assert.equal(await f.service.handleUrl(`${AUTH_CALLBACK}?code=unsolicited`), false);
  assert.equal(f.calls.filter(c => c[0] === 'exchange').length, 0);
});
test('provider error and failed exchange clear pending state and allow retry', async () => {
  for (const callback of [`${AUTH_CALLBACK}?error=access_denied`, `${AUTH_CALLBACK}?code=expired`]) {
    const f = fixture({ exchangeError: true }); await f.service.login('pages/create.html');
    assert.equal(await f.service.handleUrl(callback), false);
    assert.equal(f.storage.getItem(AUTH_PENDING_KEY), null);
    assert.ok(f.calls.some(c => c[0] === 'notify'));
    assert.ok(!f.calls.some(c => c[0] === 'navigate'));
    assert.equal(f.service.completing, false);
  }
});
test('browser cancellation resets UI; opening failure clears pending state', async () => {
  const f = fixture(); await f.service.login(null); f.listeners.browserFinished();
  assert.equal(f.calls.at(-1)[0], 'reset');
  const broken = fixture({ openFailure: true }); await assert.rejects(broken.service.login(null));
  assert.equal(broken.storage.getItem(AUTH_PENDING_KEY), null);
});
