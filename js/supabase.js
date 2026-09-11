/* Browser-safe Supabase configuration. Never add a secret/service_role key. */
window.GIFTO_SUPABASE_URL = 'https://alzjvlbmnhukjwmiaduk.supabase.co';
window.GIFTO_SUPABASE_KEY = 'sb_publishable_3hmo2JM93sr4XSjK6jIa5A_LtR6UXKg';
window.giftoDb = window.supabase.createClient(
  window.GIFTO_SUPABASE_URL,
  window.GIFTO_SUPABASE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

// Resolve from this script so Live Server and GitHub Pages use the same routes.
const giftoRoot = new URL('../', document.currentScript.src);
window.giftoHomeUrl = new URL('index.html', giftoRoot).href;
window.giftoLoginUrl = new URL('pages/login.html', giftoRoot).href;
const wishlistTitleInput = document.querySelector('#list-title');
wishlistTitleInput?.addEventListener('input', () => { wishlistTitleInput.dataset.userEdited = 'true'; });
function renderAuthNavigation(session) {
  renderAccountProfile(session);
  document.querySelectorAll('[data-auth-destination]').forEach(link => {
    link.href = session
      ? new URL(link.dataset.authDestination, giftoRoot).href
      : window.giftoLoginUrl;
  });
  if (session && location.pathname === new URL(window.giftoLoginUrl).pathname) {
    location.replace(window.giftoHomeUrl);
  }
}
function renderAccountProfile(session) {
  const metadata = session?.user?.user_metadata || {};
  const kakao = session?.user?.identities?.find(identity => identity.provider === 'kakao')?.identity_data || {};
  const savedName = session ? localStorage.getItem('gifto-display-name:' + session.user.id) : null;
  const name = savedName || [metadata.full_name, metadata.name, metadata.nickname, metadata.preferred_username,
    kakao.full_name, kakao.name, kakao.nickname].find(value => typeof value === 'string' && value.trim()) || 'GIFTO 사용자';
  const savedAvatar = session ? localStorage.getItem('gifto-profile-avatar:' + session.user.id) : null;
  const avatarUrl = savedAvatar !== null ? savedAvatar : [metadata.avatar_url, metadata.picture, kakao.avatar_url, kakao.picture]
    .find(value => typeof value === 'string' && /^https?:\/\//i.test(value));
  if (session && wishlistTitleInput && wishlistTitleInput.dataset.userEdited !== 'true') {
    wishlistTitleInput.value = name + '의 생일 선물';
  }
  document.querySelectorAll('[data-account-name]').forEach(element => {
    element.textContent = session ? name : '로그인이 필요해요';
    document.title = session ? name + '의 페이지 | GIFTO' : '내 페이지 | GIFTO';
  });
  document.querySelectorAll('[data-account-avatar]').forEach(element => {
    element.textContent = session ? Array.from(name)[0] : 'G';
    if (!session || !avatarUrl) return;
    const photo = document.createElement('img');
    photo.alt = name + ' 프로필 사진';
    photo.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
    photo.addEventListener('error', () => { element.textContent = Array.from(name)[0]; });
    photo.src = avatarUrl;
    element.replaceChildren(photo);
  });
}
async function restoreAuthNavigation() {
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
