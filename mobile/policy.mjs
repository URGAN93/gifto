export const AUTH_CALLBACK = 'com.urganlab.gifto://auth/callback';
export const PUBLIC_ROOT = 'https://urgan93.github.io/gifto/';
export const AUTH_PENDING_KEY = 'gifto-native-oauth-pending';

export function callbackResult(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'com.urganlab.gifto:' || url.hostname !== 'auth' ||
        url.pathname !== '/callback' || url.port || url.username || url.password) return null;
    if (url.searchParams.has('error')) return { error: true };
    const code = url.searchParams.get('code');
    return code ? { code } : null;
  } catch { return null; }
}

export function safeDestination(next, root) {
  const home = new URL('index.html', root).href;
  try {
    if (!next) return home;
    if (/^(my-page|create|wishlist|contribute|complete|participants|payment-return|thankyou)\.html(?:[?#]|$)/.test(next)) next = 'pages/' + next;
    const target = new URL(next, root);
    // URL.origin is "null" for capacitor://, so compare each component.
    const base = new URL(root);
    if (target.protocol !== base.protocol || target.host !== base.host ||
        target.username || target.password || !target.pathname.startsWith(base.pathname)) return home;
    const path = target.pathname.slice(base.pathname.length);
    if (!/^(index\.html|pages\/(my-page|create|wishlist|contribute|complete|participants|payment-return|thankyou)\.html)$/.test(path)) return home;
    return target.href;
  } catch { return home; }
}

export function publicUrl(path) {
  const target = new URL(path, PUBLIC_ROOT);
  if (!target.href.startsWith(PUBLIC_ROOT)) throw new Error('Invalid public route');
  return target.href;
}

export function validPending(raw, now = Date.now()) {
  try {
    const state = JSON.parse(raw);
    return state && Number.isFinite(state.startedAt) && now >= state.startedAt &&
      now - state.startedAt < 30 * 60 * 1000 ? state : null;
  } catch { return null; }
}
