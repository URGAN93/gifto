import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { handleBack } from '../mobile/back.mjs';

test('Android back respects modal cancellation, closes sheets, then navigates', () => {
  const calls = [];
  let dialogs = [], buttons = [];
  const args = { canGoBack: true, document: { querySelectorAll: selector => selector === 'dialog[open]' ? dialogs : buttons },
    history: { back: () => calls.push('back') }, location: { pathname: '/pages/create.html', replace: url => calls.push(url) },
    app: { minimizeApp: async () => calls.push('minimize') }, root: 'https://localhost/', Event };
  dialogs = [{ dispatchEvent: event => { assert.equal(event.type, 'cancel'); return false; }, close: () => calls.push('close') }];
  handleBack(args); assert.deepEqual(calls, []); // QR guide owns its popstate/scroll restoration
  dialogs[0].dispatchEvent = () => true; handleBack(args); assert.equal(calls.pop(), 'close');
  dialogs = []; buttons = [{ getClientRects: () => [1], click: () => calls.push('sheet') }];
  handleBack(args); assert.equal(calls.pop(), 'sheet');
  buttons = []; handleBack(args); assert.equal(calls.pop(), 'back');
  args.canGoBack = false; handleBack(args); assert.equal(calls.pop(), 'https://localhost/index.html');
  args.location.pathname = '/index.html'; handleBack(args); assert.equal(calls.pop(), 'minimize');
});

const source = readFileSync('js/app.js', 'utf8');
const code = source.slice(source.indexOf('async function compressProductPhoto'), source.indexOf('async function getProductPreview'));
function photoFixture(broken = false) {
  let revoked = 0; const canvas = {};
  const ctx = { URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ },
    Image: class { naturalWidth = 2000; naturalHeight = 1000; set src(_) { queueMicrotask(() => broken ? this.onerror() : this.onload()); } },
    document: { createElement: () => Object.assign(canvas, { getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,YQ==' }) } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { compress: ctx.compressProductPhoto, canvas, revoked: () => revoked };
}
test('photo processing resizes and accepts phone HEIC when the WebView can decode it', async () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', '']) {
    const f = photoFixture(); const output = await f.compress({ type, name: 'photo.jpg', size: 1000 });
    assert.match(output.url, /^data:image\/jpeg/); assert.equal(f.canvas.width, 1000);
    assert.equal(f.canvas.height, 500); assert.equal(f.revoked(), 1);
  }
});
test('photo processing rejects oversized or unsupported inputs and reports HEIC decode failure', async () => {
  const f = photoFixture();
  await assert.rejects(f.compress({ type: 'image/jpeg', size: 21 * 1024 * 1024 }), /20MB/);
  await assert.rejects(f.compress({ type: 'image/svg+xml', size: 1 }), /사진/);
  await assert.rejects(f.compress({ type: '', name: 'payload.html', size: 1 }), /사진/);
  const broken = photoFixture(true);
  await assert.rejects(broken.compress({ type: 'image/heic', size: 1 }), /JPG 또는 PNG/);
  assert.equal(broken.revoked(), 1);
});
test('native thank-you share contains public URL, and web source still uses browser sharing', async () => {
  const shareCode = source.slice(source.indexOf('async function shareGiftThanks'), source.indexOf('function setupProofBack'));
  let shared;
  const ctx = { window: { giftoPublicUrl: path => new URL(path, 'https://urgan93.github.io/gifto/').href,
    giftoNative: { isNative: true, share: async data => { shared = data; } } }, URL,
    location: { href: 'capacitor://localhost/pages/thankyou.html' }, navigator: {}, showToast() {} };
  vm.createContext(ctx); vm.runInContext(shareCode, ctx);
  await ctx.shareGiftThanks('test-id', '선물', '감사합니다');
  assert.equal(shared.url, 'https://urgan93.github.io/gifto/pages/thankyou.html?product=test-id');
  assert.ok(!shared.text.includes('localhost'));
});
