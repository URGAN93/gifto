/* Browser-safe Supabase configuration. Never add a secret/service_role key. */
window.GIFTO_SUPABASE_URL = 'https://alzjvlbmnhukjwmiaduk.supabase.co';
window.GIFTO_SUPABASE_KEY = 'sb_publishable_3hmo2JM93sr4XSjK6jIa5A_LtR6UXKg';
window.giftoDb = window.supabase.createClient(
  window.GIFTO_SUPABASE_URL,
  window.GIFTO_SUPABASE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: !window.giftoNative?.isNative,
    flowType: window.giftoNative?.isNative ? 'pkce' : 'implicit' } }
);
window.giftoNative?.attachAuth(window.giftoDb.auth);

// Resolve from this script so Live Server and GitHub Pages use the same routes.
const giftoRoot = new URL('../', document.currentScript.src);
window.giftoHomeUrl = new URL('index.html', giftoRoot).href;
window.giftoLoginUrl = new URL('pages/login.html', giftoRoot).href;
const wishlistTitleInput = document.querySelector('#list-title');
wishlistTitleInput?.addEventListener('input', () => { wishlistTitleInput.dataset.userEdited = 'true'; });
function renderAuthNavigation(session) {
  if (window.giftoNative?.auth?.completing) return;
  renderAccountProfile(session);
  document.querySelectorAll('[data-auth-destination]').forEach(link => {
    link.href = session
      ? new URL(link.dataset.authDestination, giftoRoot).href
      : window.giftoLoginUrl;
  });
  if (session && location.pathname === new URL(window.giftoLoginUrl).pathname) {
    const next = new URLSearchParams(location.search).get('next');
    let destination = window.giftoHomeUrl;
    try {
      const route = /^(my-page|create|wishlist|contribute|complete|participants|payment-return|thankyou)\.html(?:[?#]|$)/.test(next || '') ? 'pages/' + next : next;
      const target = new URL(route || '', giftoRoot);
      if (next && target.protocol === giftoRoot.protocol && target.host === giftoRoot.host && target.pathname.startsWith(giftoRoot.pathname)) destination = target.href;
    } catch {}
    location.replace(destination);
  }
}
function isKakaoProfileAvatarUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.port &&
      ['kakaocdn.net', 'kakao.com'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch { return false; }
}
function normalizeProfileAvatarUrl(value) {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (/^data:image\//i.test(source)) return source;
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    // Kakao can return HTTP profile URLs. Upgrade only known Kakao hosts;
    // keep native cleartext protection enabled and never rewrite stored data.
    if (url.protocol === 'http:' && isKakaoProfileAvatarUrl(source)) url.protocol = 'https:';
    return url.href;
  } catch { return ''; }
}
function getKakaoAvatarUrls(session) {
  const metadata = session?.user?.user_metadata || {};
  const kakao = session?.user?.identities?.find(identity => identity.provider === 'kakao')?.identity_data || {};
  return [metadata.avatar_url, metadata.picture, kakao.avatar_url, kakao.picture]
    .map(normalizeProfileAvatarUrl).filter(Boolean);
}
function getAccountAvatarUrl(session) {
  if (!session) return '';
  const saved = localStorage.getItem('gifto-profile-avatar:' + session.user.id);
  // Empty is an explicit "no photo" choice, not a reason to restore Kakao's photo.
  return saved !== null ? saved : (getKakaoAvatarUrls(session)[0] || '');
}
function renderProfileAvatar(element, value, name, session) {
  if (!element) return;
  const initial = Array.from(name || 'G')[0];
  const primary = normalizeProfileAvatarUrl(value);
  // An old Kakao URL can expire. Only retry this account's fresh Kakao URLs,
  // never replace an uploaded photo or an explicit no-photo choice.
  const alternatives = isKakaoProfileAvatarUrl(primary)
    ? getKakaoAvatarUrls(session).filter(isKakaoProfileAvatarUrl) : [];
  const urls = [...new Set([primary, ...alternatives].filter(Boolean))];
  const paint = index => {
    element.textContent = initial;
    if (!urls[index]) return;
    const photo = document.createElement('img');
    // Keep long fallback text out of the small circle while the image loads.
    photo.alt = '';
    photo.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
    photo.addEventListener('load', () => {
      if (element.contains(photo)) photo.alt = (name || 'GIFTO 사용자') + ' 프로필 사진';
    });
    photo.addEventListener('error', () => {
      // A late event from an older render must not clear a newer photo.
      if (element.contains(photo)) paint(index + 1);
    });
    element.replaceChildren(photo);
    photo.src = urls[index];
  };
  paint(0);
}
function renderAccountProfile(session) {
  const metadata = session?.user?.user_metadata || {};
  const kakao = session?.user?.identities?.find(identity => identity.provider === 'kakao')?.identity_data || {};
  const savedName = session ? localStorage.getItem('gifto-display-name:' + session.user.id) : null;
  const name = savedName || [metadata.full_name, metadata.name, metadata.nickname, metadata.preferred_username,
    kakao.full_name, kakao.name, kakao.nickname].find(value => typeof value === 'string' && value.trim()) || 'GIFTO 사용자';
  const avatarUrl = getAccountAvatarUrl(session);
  if (session && wishlistTitleInput && wishlistTitleInput.dataset.userEdited !== 'true') {
    wishlistTitleInput.value = name + '의 생일 선물';
  }
  document.querySelectorAll('[data-account-name]').forEach(element => {
    element.textContent = session ? name : '로그인이 필요해요';
    document.title = session ? name + '의 페이지 | GIFTO' : '내 페이지 | GIFTO';
  });
  document.querySelectorAll('[data-account-avatar]').forEach(element => {
    renderProfileAvatar(element, avatarUrl, session ? name : 'G', session);
  });
}
async function restoreAuthNavigation() {
  await window.giftoNative?.ready;
  const { data, error } = await window.giftoDb.auth.getSession();
  // Remove the one temporary account created during the in-development friend test.
  // Real users never enter this branch.
  if (!error && data.session?.user?.id === '0a3a328f-9de4-4137-b76b-72cb29d037f5') {
    await window.giftoDb.auth.signOut({scope:'local'});
    location.replace(window.giftoLoginUrl);
    return;
  }
  if (!error) renderAuthNavigation(data.session);
}
window.giftoDb.auth.onAuthStateChange((_event, session) => renderAuthNavigation(session));
window.addEventListener('pageshow', restoreAuthNavigation);
restoreAuthNavigation();
