import { AUTH_CALLBACK, AUTH_PENDING_KEY, callbackResult, safeDestination, validPending } from './policy.mjs';

// Dependency injection keeps callback tests completely offline (no real accounts).
export function createNativeAuth({ auth, app, browser, storage, root, navigate, notify, resetButton, now = Date.now }) {
  let completing = false;
  let ready;
  async function handleUrl(value) {
    const result = callbackResult(value);
    if (!result || completing) return false;
    const pending = validPending(storage.getItem(AUTH_PENDING_KEY), now());
    if (!pending) return false;
    completing = true;
    try {
      if (result.error) throw new Error('OAuth cancelled');
      const { data, error } = await auth.exchangeCodeForSession(result.code);
      if (error || !data?.session) throw error || new Error('No session');
      storage.removeItem(AUTH_PENDING_KEY);
      await browser.close().catch(() => {}); // Android Custom Tabs may close themselves.
      navigate(safeDestination(pending.next, root));
      return true;
    } catch {
      storage.removeItem(AUTH_PENDING_KEY);
      await browser.close().catch(() => {});
      notify('로그인을 완료하지 못했어요. 앱에서 카카오 로그인을 다시 시작해 주세요.');
      return false;
    } finally { completing = false; resetButton(); }
  }
  function init() {
    if (!ready) ready = (async () => {
      await app.addListener('appUrlOpen', ({ url }) => { void handleUrl(url); });
      await browser.addListener('browserFinished', resetButton);
      const launch = await app.getLaunchUrl();
      if (launch?.url) await handleUrl(launch.url);
    })();
    return ready;
  }
  return {
    init, handleUrl,
    get completing() { return completing; },
    async login(next) {
      await init();
      storage.setItem(AUTH_PENDING_KEY, JSON.stringify({ next: safeDestination(next, root), startedAt: now() }));
      try {
        const { data, error } = await auth.signInWithOAuth({ provider: 'kakao', options: {
          redirectTo: AUTH_CALLBACK, skipBrowserRedirect: true
        } });
        if (error || !data?.url) throw error || new Error('No OAuth URL');
        if (new URL(data.url).protocol !== 'https:') throw new Error('Invalid OAuth URL');
        await browser.open({ url: data.url });
      } catch (error) { storage.removeItem(AUTH_PENDING_KEY); resetButton(); throw error; }
    }
  };
}
