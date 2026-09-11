const DEFAULT_PRODUCTS = [];
const GIFT_CATEGORIES = {
  birthday: {icon:'🎂', label:'생일 선물', title:'나의 생일 선물', note:'생일에 받고 싶은 선물을 모아봤어요. 함께해 주는 마음만으로도 고마워요 🎁'},
  support: {icon:'💛', label:'응원 모금', title:'따뜻한 응원을 모아요', note:'따뜻한 마음을 모아 응원해 주세요.'},
  celebration: {icon:'✨', label:'기념 선물', title:'기념하고 싶은 순간', note:'함께 축하해 주는 마음을 모아 주세요.'},
  housewarming: {icon:'🏠', label:'집들이 선물', title:'새 집에 필요한 선물', note:'새로운 시작을 위한 선물을 함께 골라 주세요.'},
  together: {icon:'🎁', label:'함께 선물', title:'함께 전하는 선물', note:'소중한 마음을 모아 특별한 선물을 준비해요.'}
};
const storageKey = 'gifto-no-account-wishlist';
const getProducts = () => {
  try {
    const products = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(products) ? products.filter(product => !['airpods', 'watch', 'shoes'].includes(product.id)) : DEFAULT_PRODUCTS;
  } catch { return DEFAULT_PRODUCTS; }
};
const saveProducts = products => localStorage.setItem(storageKey, JSON.stringify(products));
const appData = { products: getProducts() };
const paymentInfoKey = 'gifto-no-account-payment-info';
const wishlistStateKey = 'gifto-no-account-wishlist-state';
const getPaymentInfo = () => { try { return JSON.parse(localStorage.getItem(paymentInfoKey)) || {}; } catch { return {}; } };
const savePaymentInfo = info => localStorage.setItem(paymentInfoKey, JSON.stringify(info));
const getWishlistState = () => { try { return JSON.parse(localStorage.getItem(wishlistStateKey)) || {shared:false}; } catch { return {shared:false}; } };
const saveWishlistState = state => localStorage.setItem(wishlistStateKey, JSON.stringify(state));
const sharedProfiles = {};
const ownerId = new URLSearchParams(location.search).get('owner') || '';
const activeProfile = sharedProfiles[ownerId] || { name: 'GIFTO 친구', initial: 'G', countdown: '', eventDate: '', eventEmoji: '🎁', avatar: 'avatar-blue', products: [] };
const won = value => `₩ ${value.toLocaleString('ko-KR')}`;
const parseMoney = value => Number(String(value || '').replace(/[^\d]/g, '')) || 0;
function setupMoneyInput(input) {
  if (!input) return;
  const paint = () => {
    const amount = parseMoney(input.value);
    input.value = amount ? amount.toLocaleString('ko-KR') : '';
  };
  input.addEventListener('input', paint);
  paint();
}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isUuid = value => /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value || '');
const remoteWishlistCache = new Map();
const contributionChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('gifto-contribution-updates') : null;
function announceContributionChange(owner) {
  clearRemoteWishlist(owner);
  contributionChannel?.postMessage({type:'contribution-confirmed', owner});
}
async function loadRemoteWishlist(owner) {
  if (!isUuid(owner)) throw new Error('INVALID_OWNER');
  if (remoteWishlistCache.has(owner)) return remoteWishlistCache.get(owner);
  let {data: profile, error: profileError} = await window.giftoDb.from('profiles').select('id,display_name,avatar_url,kakao_pay_qr_url,kakao_pay_url').eq('id', owner).single();
  // Keep existing shared links usable until the optional QR-link migration runs.
  if (profileError?.code === '42703') {
    ({data: profile, error: profileError} = await window.giftoDb.from('profiles').select('id,display_name,avatar_url,kakao_pay_qr_url').eq('id', owner).single());
  }
  if (profileError || !profile) throw new Error('PROFILE_NOT_FOUND');
  const {data: wishlist, error: wishlistError} = await window.giftoDb.from('wishlists').select('id,title,note').eq('owner_id', owner).eq('is_public', true).order('created_at', {ascending:false}).limit(1).maybeSingle();
  if (wishlistError || !wishlist) throw new Error('WISHLIST_NOT_FOUND');
  const {data: rows, error: itemError} = await window.giftoDb.from('wishlist_items').select('id,name,price,product_url,image_url,emoji,color,position,status,shared_at,closed_at,proof_image_url,proof_message,proof_published_at,contributions(id,contributor_name,amount,status,created_at,confirmed_at)').eq('wishlist_id', wishlist.id).order('position');
  if (itemError) throw itemError;
  const products = (rows || []).map(row => {
    const confirmed = (row.contributions || []).filter(contribution => contribution.status === 'confirmed');
    return {id:row.id, dbId:row.id, name:row.name, price:row.price, productUrl:row.product_url || '', imageUrl:row.image_url || '', emoji:row.emoji, color:row.color, status:row.status || 'draft', sharedAt:row.shared_at, closedAt:row.closed_at, proofImageUrl:row.proof_image_url || '', proofMessage:row.proof_message || '', proofPublishedAt:row.proof_published_at, raised:confirmed.reduce((sum, contribution) => sum + contribution.amount, 0), supporters:confirmed.length, contributors:confirmed, allContributions:row.contributions || [], hasContributions:(row.contributions || []).length > 0};
  });
  const loaded = {profile, wishlist, products}; remoteWishlistCache.set(owner, loaded); return loaded;
}
function clearRemoteWishlist(owner) { remoteWishlistCache.delete(owner); }
async function getOrCreateOwnWishlist(user, details = {}) {
  const {data: existing, error: readError} = await window.giftoDb.from('wishlists').select('id,title,note').eq('owner_id', user.id).order('created_at', {ascending:false}).limit(1).maybeSingle();
  if (readError) throw readError;
  const title = details.title || existing?.title || (user.user_metadata?.name || user.user_metadata?.nickname || '나') + '의 생일 선물';
  if (existing) {
    const {data, error} = await window.giftoDb.from('wishlists').update({title, note:details.note ?? existing.note ?? null, is_public:true}).eq('id', existing.id).select('id,title,note').single();
    if (error) throw error;
    return data;
  }
  const {data, error} = await window.giftoDb.from('wishlists').insert({owner_id:user.id, title, note:details.note || null, is_public:true}).select('id,title,note').single();
  if (error) throw error;
  return data;
}

function renderProducts() {
  document.querySelectorAll('[data-my-product-count]').forEach(count => { count.textContent = appData.products.length; });
  document.querySelectorAll('[data-product-list]').forEach(list => {
    const isPublic = list.dataset.public === 'true';
    const products = isPublic ? (ownerId ? activeProfile.products : appData.products) : appData.products;
    if (!products.length) {
      list.innerHTML = '<div class="empty-state">아직 추가한 선물이 없어요.</div>';
      return;
    }
    list.innerHTML = products.map(rawProduct => {
      const product = {...rawProduct, name:escapeHtml(rawProduct.name), imageUrl:escapeHtml(rawProduct.imageUrl), emoji:escapeHtml(rawProduct.emoji), color:escapeHtml(rawProduct.color), id:encodeURIComponent(rawProduct.id)};
      const percent = Math.min(100, Math.round(product.raised / product.price * 100));
      const closed = product.status === 'closed' || product.status === 'proof_posted' || product.isClosed;
      const draft = product.status === 'draft';
      const statusText = product.status === 'proof_posted' ? '선물 인증 완료' : closed ? '마감된 선물' : draft ? '준비 중' : '마음이 모이는 중';
      const actionText = closed ? (product.status === 'proof_posted' ? '인증 보기' : '마감됨') : draft && isPublic ? '준비 중' : (isPublic ? '함께 선물하기' : '참여 보기');
      const actionClass = closed || (draft && isPublic) ? 'card-button is-disabled' : 'card-button';
      return `<article class="product-card">
        <div class="product-image" style="--image-bg:${product.color}">${product.emoji}${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : ''}</div>
        <div class="product-body"><div class="product-top"><div><h3 class="product-name">${product.name}</h3><span class="product-price">${won(product.price)}</span></div><div class="product-tags"><span class="product-state state-${product.status || 'open'}">${statusText}</span><span class="tag">${product.supporters}명 참여</span></div></div>
        <div class="progress-label"><span>${percent}% 모였어요</span><strong>${won(product.raised)} <small>/ ${product.price.toLocaleString()}원</small></strong></div><div class="progress"><i style="width:${percent}%"></i></div>
        <div class="card-bottom"><span>${closed ? '마음이 모였어요' : draft ? '공개 준비 중' : '마음을 모아 선물해요'}</span><a class="${actionClass}" href="${closed ? (product.status === 'proof_posted' ? `thankyou.html?product=${product.id}${isPublic ? `&owner=${ownerId}` : ''}` : '#') : draft && isPublic ? '#' : `contribute.html?product=${product.id}${isPublic ? `&owner=${ownerId}` : ''}`}">${actionText}</a></div></div></article>`;
    }).join('');
  });
}

async function setupHomeWishlistStatus() {
  const status = document.querySelector('[data-home-wishlist-status]');
  if (!status || !window.giftoDb) return;
  const primaryAction = document.querySelector('[data-home-primary-action]');
  const revealPrimaryAction = () => { if (primaryAction) primaryAction.style.visibility = 'visible'; };
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (!auth.session) { revealPrimaryAction(); return; }
  const cacheKey = 'gifto-home-wishlist-status';
  const reveal = async products => {
    status.hidden = true;
    status.innerHTML = `<div class="home-wishlist-list">${products.map((product, index) => { const percent = product.price ? Math.min(100, Math.round((product.raised || 0) / product.price * 100)) : 0; return `<a href="pages/participants.html?product=${encodeURIComponent(product.id)}&from=home" class="home-wishlist-card"><div class="home-wishlist-image" style="--image-bg:${escapeHtml(product.color || '#f2f7ff')}">${escapeHtml(product.emoji || '🎁')}${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />` : ''}</div><div><p>${index === 0 ? '나의 위시리스트 현황' : '나의 위시리스트'}</p><strong>${escapeHtml(product.name)}</strong><span>${won(product.raised || 0)} 모임 · ${percent}% · ${product.supporters || 0}명 참여</span></div><b>›</b></a>`; }).join('')}</div>`;
    const images = [...status.querySelectorAll('img')].filter(image => !image.complete);
    if (images.length) await Promise.race([Promise.all(images.map(image => new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))), new Promise(resolve => setTimeout(resolve, 700))]);
    status.hidden = false;
    status.querySelectorAll('.home-wishlist-card').forEach(card => card.addEventListener('click', () => {
      sessionStorage.setItem('gifto-home-scroll-y', String(window.scrollY));
      sessionStorage.setItem('gifto-participants-from-home', '1');
    }));
  };
  let cached;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch {}
  let products = [];
  try {
    const remote = await loadRemoteWishlist(auth.session.user.id);
    products = remote.products;
  } catch {
    products = cached?.ownerId === auth.session.user.id && Array.isArray(cached.products) ? cached.products : appData.products;
  }
  if (!products.length) { revealPrimaryAction(); return; }
  await reveal(products);
  try { localStorage.setItem(cacheKey, JSON.stringify({ownerId:auth.session.user.id, products})); } catch {}
  const create = document.querySelector('[data-auth-destination="pages/create.html"]');
  if (create) { create.href = 'pages/create.html'; create.childNodes[0].nodeValue = '+ 위시리스트 추가하기 '; }
  revealPrimaryAction();
  const savedScroll = Number(sessionStorage.getItem('gifto-home-scroll-y'));
  if (Number.isFinite(savedScroll) && savedScroll > 0) {
    sessionStorage.removeItem('gifto-home-scroll-y');
    requestAnimationFrame(() => window.scrollTo(0, savedScroll));
  }
}

async function setupContribution() {
  const selected = document.querySelector('[data-selected-product]');
  if (!selected) return;
  const id = new URLSearchParams(location.search).get('product');
  if (isUuid(ownerId)) {
    try {
      const remote = await loadRemoteWishlist(ownerId);
      activeProfile.name = remote.profile.display_name || 'GIFTO 친구';
      activeProfile.products = remote.products;
      activeProfile.paymentInfo = {kakaoQr:remote.profile.kakao_pay_qr_url || '', kakaoUrl:remote.profile.kakao_pay_url || ''};
    } catch { selected.innerHTML = '<p class="empty-state">위시리스트를 불러오지 못했어요.</p>'; return; }
  }
  const sourceProducts = ownerId ? activeProfile.products : appData.products;
  const product = sourceProducts.find(item => item.id === id) || sourceProducts[0];
  if (!product) {
    selected.innerHTML = '<p class="empty-state">이 선물을 찾지 못했어요.</p>';
    return;
  }
  if (product.status && product.status !== 'open') {
    selected.innerHTML = '<p class="empty-state">이 선물은 마감되었거나 아직 공개 전이에요.</p>';
    return;
  }
  selected.innerHTML = `<div class="product-image" style="--image-bg:${product.color}">${product.emoji}</div><div class="product-body"><h2 class="product-name">${product.name}</h2><span class="product-price">${won(product.price)} · ${Math.round(product.raised/product.price*100)}% 모였어요</span></div>`;
  document.querySelector('[data-recipient-name]').textContent = `${activeProfile.name}에게 마음을 전해요`;
  const input = document.querySelector('#custom-amount');
  const sendButton = document.querySelector('[data-kakao-send]');
  const reportButton = document.querySelector('[data-report-sent]');
  const amountStep = document.querySelector('[data-amount-after-payment]');
  const fallback = document.querySelector('[data-qr-fallback]');
  const getContributionPaymentInfo = () => ownerId === 'seongmin' ? getPaymentInfo() : (activeProfile.paymentInfo || {});
  const returnKey = 'gifto-returning-from-kakao';
  const showAmountStep = () => { amountStep.hidden = false; fallback.hidden = true; sendButton.hidden = true; input.focus(); };
  const resumeAfterKakao = () => {
    if (sessionStorage.getItem(returnKey) !== product.id) return;
    sessionStorage.removeItem(returnKey); showAmountStep();
  };
  if (sessionStorage.getItem(returnKey) === product.id) resumeAfterKakao();
  window.addEventListener('pageshow', resumeAfterKakao);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAfterKakao(); });
  sendButton.addEventListener('click', async () => {
    const paymentInfo = getContributionPaymentInfo();
    if (!paymentInfo.kakaoQr) { showToast('아직 카카오페이 송금 QR이 등록되지 않았어요.'); return; }
    sendButton.disabled = true; sendButton.textContent = '카카오페이 연결 중…';
    const url = paymentInfo.kakaoUrl || await decodeQrPayload(paymentInfo.kakaoQr);
    if (url && isKakaoPayLink(url)) {
      fallback.innerHTML = '<strong>카카오페이로 이동할게요</strong><p>카카오페이에서 송금한 뒤, 브라우저의 뒤로가기 또는 앱 전환으로 GIFTO에 돌아와 주세요. 돌아오면 금액 입력 화면이 자동으로 열립니다.</p>';
      fallback.hidden = false; sendButton.hidden = true;
      const open = document.createElement('button'); open.type = 'button'; open.className = 'button button-primary'; open.textContent = '카카오페이 열기';
      open.addEventListener('click', () => { sessionStorage.setItem(returnKey, product.id); location.href = url; });
      fallback.append(open);
      return;
    }
    sessionStorage.setItem(returnKey, product.id);
    fallback.innerHTML = '<strong>카카오페이 QR 송금</strong><p>카카오톡에서 코드 스캔을 열고 QR을 스캔해 송금해 주세요. GIFTO로 돌아오면 금액 입력 화면이 자동으로 열립니다.</p><img alt="카카오페이 송금 QR 코드" />';
    fallback.querySelector('img').src = paymentInfo.kakaoQr;
    fallback.hidden = false; sendButton.hidden = true;
    const returned = document.createElement('button'); returned.type = 'button'; returned.className = 'button button-primary'; returned.textContent = '송금 후 돌아왔어요';
    returned.addEventListener('click', showAmountStep); fallback.append(returned);
  });
  reportButton.addEventListener('click', () => {
    const amount = Number(input.value);
    if (!Number.isFinite(amount) || amount <= 0) { input.focus(); showToast('보낸 금액을 입력해 주세요.'); return; }
    reportContribution(product, amount).then(() => {
      location.href = `complete.html?product=${encodeURIComponent(product.id)}&amount=${amount}&owner=${encodeURIComponent(ownerId)}&method=kakao`;
    }).catch(error => showToast(error.message || '송금 완료 처리를 하지 못했어요.'));
  });
}
async function reportContribution(product, amount) {
  if (!product.dbId) {
    const pending = {productId:product.id, ownerId, amount, name:activeProfile.name, createdAt:Date.now(), status:'pending'};
    localStorage.setItem('gifto-pending-contribution', JSON.stringify(pending)); return;
  }
  const {data: auth, error: authError} = await window.giftoDb.auth.getSession();
  if (authError || !auth.session) throw new Error('송금 완료 처리는 로그인 후 할 수 있어요.');
  const metadata = auth.session.user.user_metadata || {};
  const {data: profile} = await window.giftoDb.from('profiles').select('display_name').eq('id', auth.session.user.id).maybeSingle();
  if (profile?.display_name) localStorage.setItem('gifto-display-name:' + auth.session.user.id, profile.display_name);
  const name = profile?.display_name || metadata.full_name || metadata.name || metadata.nickname || 'GIFTO 친구';
  const {error} = await window.giftoDb.from('contributions').insert({item_id:product.dbId, contributor_id:auth.session.user.id, contributor_name:name, amount, status:'pending'});
  if (error) throw new Error('송금 완료 처리를 하지 못했어요.');
}
async function decodeQrPayload(imageDataUrl) {
  if (!imageDataUrl) return '';
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = imageDataUrl; });
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({formats:['qr_code']});
      const value = (await detector.detect(image))[0]?.rawValue || '';
      if (value) return value;
    }
    if (!window.jsQR) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
    if (!window.jsQR) return '';
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts:'attemptBoth'})?.data || '';
  } catch { return ''; }
}
function isKakaoPayLink(value) {
  try {
    const url = new URL(value);
    if (['kakaotalk:','kakaopay:'].includes(url.protocol)) return true;
    return url.protocol === 'https:' && /(^|\.)(kakao\.com|kakaopay\.com)$/i.test(url.hostname);
  } catch { return false; }
}
async function ensureCloudShare(user) {
  let details = {};
  try { details = JSON.parse(localStorage.getItem('gifto-wishlist-details:' + user.id)) || {}; } catch {}
  const wishlist = await getOrCreateOwnWishlist(user, details);
  const {data: storedItems, error: itemsError} = await window.giftoDb.from('wishlist_items').select('id').eq('wishlist_id', wishlist.id).limit(1);
  if (itemsError) throw itemsError;
  if (!(storedItems || []).length && appData.products.length) {
    const rows = appData.products.filter(product => !product.dbId).map((product, position) => ({
      wishlist_id:wishlist.id, name:product.name, price:product.price, product_url:product.productUrl || null,
      image_url:product.imageUrl || null, emoji:product.emoji || '🎁', color:product.color || '#f2f7ff', position
    }));
    if (rows.length) {
      const {error} = await window.giftoDb.from('wishlist_items').insert(rows);
      if (error) throw error;
    }
  }
  clearRemoteWishlist(user.id);
  return wishlist;
}

function setupSmallInteractions() {
  document.querySelectorAll('[data-copy-share]').forEach(button => button.addEventListener('click', async () => {
    const {data} = await window.giftoDb.auth.getSession();
    const shareOwner = ownerId || data.session?.user.id;
    if (!shareOwner) { showToast('로그인 후 내 위시리스트를 공유해 주세요.'); return; }
    if (!ownerId && data.session) {
      button.disabled = true; button.textContent = '공개 링크 준비 중…';
      try {
        const wishlist = await ensureCloudShare(data.session.user);
        const {data: openItems, error} = await window.giftoDb.from('wishlist_items').select('id').eq('wishlist_id', wishlist.id).eq('status', 'open').limit(1);
        if (error) throw error;
        if (!(openItems || []).length) {
          button.disabled = false; button.textContent = '↗ 내 위시리스트 공유하기';
          showToast('먼저 상품에서 공개 시작을 눌러 주세요.');
          return;
        }
      }
      catch { button.disabled = false; button.textContent = '↗ 내 위시리스트 공유하기'; showToast('공개 위시리스트를 만들지 못했어요.'); return; }
      button.disabled = false; button.textContent = '↗ 내 위시리스트 공유하기';
    }
    let category = 'birthday';
    try { category = JSON.parse(localStorage.getItem('gifto-wishlist-details:' + shareOwner) || '{}').category || category; } catch {}
    const shareUrl = new URL('wishlist.html?owner=' + encodeURIComponent(shareOwner) + '&category=' + encodeURIComponent(category), location.href).href;
    try { await navigator.clipboard.writeText(shareUrl); saveWishlistState({...getWishlistState(), shared:true}); showToast('위시리스트 링크가 복사되었어요!'); }
    catch { showToast('링크를 복사하지 못했어요. 주소창의 주소를 복사해 주세요.'); }
  }));
  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => {
    showToast(button.dataset.toast);
  }));
  setupThankYou();
  const completeTitle = document.querySelector('[data-complete-title]');
  if (completeTitle) {
    const params = new URLSearchParams(location.search); const amount = Number(params.get('amount')) || 0;
    document.querySelector('[data-complete-title]').innerHTML = activeProfile.name + '님에게<br />마음을 보냈어요';
    document.querySelector('[data-complete-amount]').textContent = won(amount);
    document.querySelector('[data-complete-status]').textContent = activeProfile.name + '님의 입금 확인 전';
  }
}
function setupKakaoLogin() {
  const button = document.querySelector('[data-kakao-login]');
  if (!button || !window.giftoDb) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = '카카오로 이동 중…';
    const message = document.querySelector('[data-auth-message]');
    try {
    const { data, error } = await window.giftoDb.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: window.giftoLoginUrl,
        skipBrowserRedirect: true
      }
    });
    if (error || !data.url) throw error || new Error('Missing login URL');
    // Replace the login entry; the callback also replaces itself with home.
    window.location.replace(data.url);
    } catch (error) {
      button.disabled = false;
      button.textContent = '카카오로 시작하기';
      message.textContent = '로그인을 시작하지 못했어요. 카카오 설정을 다시 확인해 주세요.';
    }
  });
}
function showTransferGuide(type, value) {
  const methods = document.querySelector('[data-transfer-methods]');
  let guide = methods.querySelector('[data-transfer-guide]');
  if (!guide) { guide = document.createElement('div'); guide.className = 'transfer-guide'; guide.dataset.transferGuide = ''; methods.append(guide); }
  if (type === 'kakao') {
    guide.innerHTML = '<strong>카카오페이 코드송금</strong><p>카카오톡에서 코드 스캔을 열고 아래 QR을 스캔해 송금해 주세요.</p><img alt="카카오페이 송금 QR 코드" />';
    guide.querySelector('img').src = value;
  } else {
    const service = type === 'toss' ? '토스' : '네이버페이';
    guide.innerHTML = '<strong>' + service + ' 송금 정보</strong><p>' + service + ' 앱에서 아래 정보로 송금해 주세요.</p><button type="button">정보 복사</button><code></code>';
    guide.querySelector('code').textContent = value;
    guide.querySelector('button').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(value); showToast('송금 정보를 복사했어요.'); }
      catch { showToast('송금 정보를 길게 눌러 복사해 주세요.'); }
    });
  }
}
function setupPaymentSettings() {
  const form = document.querySelector('[data-payment-settings]');
  if (!form) return;
  const info = getPaymentInfo();
  const kakao = document.querySelector('#payment-kakao');
  const section = form.closest('.payment-settings');
  section.querySelector('h2').textContent = '카카오페이 송금 설정';
  section.querySelector('.settings-copy').textContent = 'QR을 설정하면 친구가 함께하기에서 바로 카카오페이로 이동할 수 있어요.';
  kakao.type = 'file'; kakao.accept = 'image/*'; kakao.value = ''; kakao.className = 'sr-only';
  kakao.previousElementSibling.textContent = '카카오페이 송금 QR';
  const configured = document.createElement('div'); configured.className = 'payment-configured'; configured.hidden = true;
  configured.innerHTML = '<div><strong>카카오페이 송금 설정 완료</strong><span>친구가 바로 송금할 수 있어요.</span></div><button type="button">설정 확인·변경</button>';
  section.querySelector('.settings-copy').insertAdjacentElement('afterend', configured);
  const configuredButton = configured.querySelector('button');
  let editing = false;
  configuredButton.addEventListener('click', () => {
    editing = !editing;
    form.hidden = !editing;
    configuredButton.textContent = editing ? '접기' : '설정 확인·변경';
  });
  const setConfigured = ready => {
    configured.hidden = !ready;
    editing = false;
    form.hidden = ready;
    configuredButton.textContent = '설정 확인·변경';
  };
  const picker = document.createElement('button');
  picker.type = 'button'; picker.className = 'photo-picker'; picker.textContent = '🖼 사진첩에서 QR 고르기';
  picker.addEventListener('click', () => kakao.click());
  kakao.insertAdjacentElement('afterend', picker);
  const help = document.createElement('p'); help.className = 'field-help'; help.textContent = '카카오페이 코드송금 QR 이미지를 골라 주세요. 금액을 지정하지 않은 QR을 등록해 주세요.';
  picker.insertAdjacentElement('afterend', help);
  setConfigured(!!info.kakaoQr);
  window.giftoDb.auth.getSession().then(async ({data}) => {
    if (!data.session) return;
    const {data: profile} = await window.giftoDb.from('profiles').select('kakao_pay_qr_url').eq('id', data.session.user.id).maybeSingle();
    if (profile?.kakao_pay_qr_url) setConfigured(true);
  });
  const preview = document.createElement('img'); preview.className = 'payment-qr-preview'; preview.alt = '등록한 카카오페이 송금 QR';
  if (info.kakaoQr) { preview.src = info.kakaoQr; picker.insertAdjacentElement('afterend', preview); }
  kakao.addEventListener('change', () => {
    const file = kakao.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { preview.src = reader.result; picker.insertAdjacentElement('afterend', preview); };
    reader.readAsDataURL(file);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const save = async qr => {
      const kakaoQr = qr || info.kakaoQr || '';
      const decoded = await decodeQrPayload(kakaoQr);
      const nextInfo = {kakaoQr, kakaoUrl:isKakaoPayLink(decoded) ? decoded : ''};
      const {data} = await window.giftoDb.auth.getSession();
      if (!data.session) { showToast('공유하려면 카카오 계정으로 로그인한 뒤 QR을 저장해 주세요.'); return; }
      const {data: savedProfile, error} = await window.giftoDb
        .from('profiles')
        .update({kakao_pay_qr_url:kakaoQr || null, kakao_pay_url:nextInfo.kakaoUrl || null})
        .eq('id', data.session.user.id)
        .select('id,kakao_pay_qr_url,kakao_pay_url')
        .maybeSingle();
      if (error || !savedProfile?.kakao_pay_qr_url) {
        showToast('공유용 QR 저장에 실패했어요. 로그인 상태를 확인한 뒤 다시 저장해 주세요.');
        return;
      }
      savePaymentInfo(nextInfo);
      setConfigured(true);
      showToast('카카오페이 송금 설정을 저장했어요.');
    };
    const file = kakao.files[0];
    if (!file) { save(''); return; }
    const reader = new FileReader(); reader.onload = () => save(reader.result); reader.readAsDataURL(file);
  });
}
async function setupBirthdaySettings() {
  const form = document.querySelector('[data-birthday-form]');
  if (!form || !window.giftoDb) return;
  const month = document.querySelector('#birthday-month');
  const day = document.querySelector('#birthday-day');
  const locked = document.querySelector('[data-birthday-locked]');
  month.innerHTML = '<option value="">월</option>' + Array.from({length:12}, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('');
  const setDays = () => {
    const max = month.value ? new Date(2000, Number(month.value), 0).getDate() : 0;
    day.disabled = !max;
    day.innerHTML = '<option value="">일</option>' + Array.from({length:max}, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('');
  };
  month.addEventListener('change', setDays);
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (!auth.session) { form.hidden = true; return; }
  const {data: profile} = await window.giftoDb.from('profiles').select('birth_date').eq('id', auth.session.user.id).single();
  if (profile?.birth_date) {
    const [, savedMonth, savedDay] = profile.birth_date.split('-');
    form.hidden = true; locked.hidden = false; locked.textContent = `${Number(savedMonth)}월 ${Number(savedDay)}일 · 한 번 저장한 생일은 바꿀 수 없어요.`;
    return;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!month.value || !day.value) { showToast('생일 월과 일을 골라 주세요.'); return; }
    const button = form.querySelector('button'); button.disabled = true; button.textContent = '저장 중…';
    const birthDate = `2000-${String(month.value).padStart(2, '0')}-${String(day.value).padStart(2, '0')}`;
    const {error} = await window.giftoDb.from('profiles').update({birth_date:birthDate}).eq('id', auth.session.user.id).is('birth_date', null);
    if (error) { button.disabled = false; button.textContent = '생일 저장'; showToast('생일을 저장하지 못했어요.'); return; }
    form.hidden = true; locked.hidden = false; locked.textContent = `${Number(month.value)}월 ${Number(day.value)}일 · 한 번 저장한 생일은 바꿀 수 없어요.`; showToast('생일을 저장했어요.');
  });
}
async function setupDisplayName() {
  const toggle = document.querySelector('[data-display-name-toggle]');
  if (!toggle || !window.giftoDb) return;
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (!auth.session) { toggle.hidden = true; return; }
  const {data: profile} = await window.giftoDb.from('profiles').select('display_name').eq('id', auth.session.user.id).maybeSingle();
  toggle.addEventListener('click', () => {
    const layer = document.createElement('div'); layer.className = 'display-name-layer';
    layer.innerHTML = `<form class="display-name-modal"><div class="product-editor-heading"><h2>닉네임 수정</h2><button type="button" aria-label="닫기" data-close-name>×</button></div><p>친구와 공유 페이지에 보여질 닉네임이에요.</p><label class="field-label" for="display-name">닉네임</label><input id="display-name" class="text-field" maxlength="20" value="${escapeHtml(profile?.display_name || document.querySelector('[data-account-name]')?.textContent || '')}" /><button class="button button-primary" type="submit">저장</button></form>`;
    const close = () => layer.remove();
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    layer.querySelector('[data-close-name]').addEventListener('click', close);
    const input = layer.querySelector('#display-name');
    layer.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (name.length < 1 || name.length > 20) { showToast('이름은 1~20자로 입력해 주세요.'); return; }
      const button = layer.querySelector('[type="submit"]'); button.disabled = true; button.textContent = '저장 중…';
      const {error} = await window.giftoDb.from('profiles').update({display_name:name}).eq('id', auth.session.user.id);
      if (error) { button.disabled = false; button.textContent = '저장'; showToast('이름을 저장하지 못했어요.'); return; }
      document.querySelectorAll('[data-account-name]').forEach(element => { element.textContent = name; });
      localStorage.setItem('gifto-display-name:' + auth.session.user.id, name);
      document.querySelectorAll('[data-account-avatar]').forEach(element => { if (!element.querySelector('img')) element.textContent = Array.from(name)[0]; });
      clearRemoteWishlist(auth.session.user.id); contributionChannel?.postMessage({type:'profile-updated', owner:auth.session.user.id});
      close(); showToast('닉네임을 저장했어요.');
    });
    document.body.append(layer); input.focus(); input.select();
  });
}
async function setupProfileAvatar() {
  const toggle = document.querySelector('[data-profile-avatar-toggle]');
  if (!toggle || !window.giftoDb) return;
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (!auth.session) { toggle.hidden = true; return; }
  const {data: profile} = await window.giftoDb.from('profiles').select('avatar_url,display_name').eq('id', auth.session.user.id).maybeSingle();
  const name = profile?.display_name || document.querySelector('[data-account-name]')?.textContent || 'G';
  localStorage.setItem('gifto-profile-avatar:' + auth.session.user.id, profile?.avatar_url || '');
  const paintAvatar = url => {
    document.querySelectorAll('[data-account-avatar]').forEach(avatar => {
      avatar.replaceChildren();
      if (/^(https?:\/\/|data:image\/)/i.test(url || '')) { const image = document.createElement('img'); image.alt = name + ' 프로필 사진'; image.src = url; avatar.append(image); }
      else avatar.textContent = Array.from(name)[0];
    });
  };
  paintAvatar(profile?.avatar_url || '');
  toggle.addEventListener('click', () => {
    let pendingUrl = profile?.avatar_url || '';
    const layer = document.createElement('div'); layer.className = 'display-name-layer';
    layer.innerHTML = `<section class="profile-avatar-modal"><div class="product-editor-heading"><h2>프로필 사진</h2><button type="button" aria-label="닫기" data-close-avatar>×</button></div><div class="avatar avatar-large avatar-blue" data-avatar-preview>${Array.from(name)[0]}</div><p>사진을 쓰지 않으면 이름 첫 글자로 표시돼요.</p><button type="button" class="photo-picker" data-avatar-picker>🖼 사진첩에서 고르기</button><input class="sr-only" type="file" accept="image/*" data-avatar-file /><button type="button" class="button button-ghost" data-remove-avatar>사진 없이 사용</button><button type="button" class="button button-primary" data-save-avatar>저장</button></section>`;
    const close = () => layer.remove(); const preview = layer.querySelector('[data-avatar-preview]');
    const paintPreview = () => { preview.replaceChildren(); if (/^(https?:\/\/|data:image\/)/i.test(pendingUrl || '')) { const image = document.createElement('img'); image.alt = '선택한 프로필 사진'; image.src = pendingUrl; preview.append(image); } else preview.textContent = Array.from(name)[0]; };
    paintPreview();
    layer.addEventListener('click', event => { if (event.target === layer) close(); }); layer.querySelector('[data-close-avatar]').addEventListener('click', close);
    const input = layer.querySelector('[data-avatar-file]'); layer.querySelector('[data-avatar-picker]').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => { const file = input.files[0]; if (!file) return; try { const result = await compressProductPhoto(file); pendingUrl = result.url; paintPreview(); } catch (error) { showToast(error.message || '사진을 읽지 못했어요.'); } });
    layer.querySelector('[data-remove-avatar]').addEventListener('click', () => { pendingUrl = ''; paintPreview(); });
    layer.querySelector('[data-save-avatar]').addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true; button.textContent = '저장 중…';
      const {error} = await window.giftoDb.from('profiles').update({avatar_url:pendingUrl || null}).eq('id', auth.session.user.id);
      if (error) { button.disabled = false; button.textContent = '저장'; showToast('프로필 사진을 저장하지 못했어요.'); return; }
      localStorage.setItem('gifto-profile-avatar:' + auth.session.user.id, pendingUrl || ''); paintAvatar(pendingUrl); clearRemoteWishlist(auth.session.user.id); contributionChannel?.postMessage({type:'profile-updated', owner:auth.session.user.id}); close(); showToast(pendingUrl ? '프로필 사진을 저장했어요.' : '프로필 사진 없이 표시할게요.');
    });
    document.body.append(layer);
  });
}
function setupProfileEdit() {
  const button = document.querySelector('[data-profile-edit]');
  if (!button) return;
  button.addEventListener('click', () => {
    const layer = document.createElement('div'); layer.className = 'display-name-layer';
    layer.innerHTML = `<section class="profile-edit-sheet"><div class="product-editor-heading"><h2>프로필 편집</h2><button type="button" aria-label="닫기" data-close-profile-edit>×</button></div><p>GIFTO에서 친구에게 보여질 정보를 설정해요.</p><button type="button" data-open-nickname><span>✎</span><div><strong>닉네임 수정</strong><small>공유 페이지와 참여 내역에 표시돼요.</small></div><b>›</b></button><button type="button" data-open-avatar><span>◉</span><div><strong>프로필 사진</strong><small>사진을 쓰지 않으면 이니셜로 표시돼요.</small></div><b>›</b></button></section>`;
    const close = () => layer.remove();
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    layer.querySelector('[data-close-profile-edit]').addEventListener('click', close);
    layer.querySelector('[data-open-nickname]').addEventListener('click', () => { close(); document.querySelector('[data-display-name-toggle]')?.click(); });
    layer.querySelector('[data-open-avatar]').addEventListener('click', () => { close(); document.querySelector('[data-profile-avatar-toggle]')?.click(); });
    document.body.append(layer);
  });
}
function showToast(message) {
  const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('show')); setTimeout(() => toast.remove(), 1800);
}
function setupWishlistEditing() {
  const list = document.querySelector('[data-product-list][data-editable="true"]');
  if (!list) return;
  list.querySelectorAll('.product-card').forEach((card, index) => {
    const product = appData.products[index];
    if (product.dbId) {
      const action = card.querySelector('.card-button');
      if (action) {
        action.href = 'participants.html?product=' + encodeURIComponent(product.id);
        action.textContent = '참여 보기';
        action.addEventListener('click', () => {
          sessionStorage.setItem('gifto-mypage-scroll-y', String(window.scrollY));
          sessionStorage.setItem('gifto-participants-from-mypage', '1');
        });
      }
      const actions = document.createElement('div'); actions.className = 'product-actions';
      const status = product.status || 'draft';
      if (status === 'draft') {
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'product-edit'; edit.textContent = '수정'; edit.addEventListener('click', () => openProductEditor(product));
        const publish = document.createElement('button'); publish.type = 'button'; publish.className = 'product-close'; publish.textContent = '공개 시작'; publish.addEventListener('click', () => publishProduct(product));
        actions.append(edit, publish);
      } else if (status === 'open') {
        const editPhoto = document.createElement('button'); editPhoto.type = 'button'; editPhoto.className = 'product-edit'; editPhoto.textContent = '수정'; editPhoto.addEventListener('click', () => openProductEditor(product));
        const close = document.createElement('button'); close.type = 'button'; close.className = 'product-close'; close.textContent = '마감'; close.addEventListener('click', () => closeProduct(product));
        actions.append(editPhoto, close);
      } else if (status === 'closed') {
        const state = document.createElement('button'); state.type = 'button'; state.className = 'product-delete is-locked'; state.textContent = '마감됨'; state.disabled = true;
        const proof = document.createElement('a'); proof.className = 'product-close product-proof-link'; proof.href = 'thankyou.html?product=' + encodeURIComponent(product.id); proof.textContent = '인증 남기기';
        actions.append(state, proof);
      } else {
        const state = document.createElement('button'); state.type = 'button'; state.className = 'product-delete is-locked'; state.textContent = '인증 완료'; state.disabled = true;
        const proof = document.createElement('a'); proof.className = 'product-edit product-proof-link'; proof.href = 'thankyou.html?product=' + encodeURIComponent(product.id); proof.textContent = '인증 보기';
        actions.append(state, proof);
      }
      card.append(actions);
      return;
    }
    const actions = document.createElement('div'); actions.className = 'product-actions';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'product-delete'; button.textContent = '삭제';
    button.addEventListener('click', () => {
      const product = appData.products[index];
      if (!confirm(product.name + '을(를) 위시리스트에서 삭제할까요?')) return;
      appData.products.splice(index, 1); saveProducts(appData.products); renderProducts(); setupWishlistEditing();
      const count = document.querySelector('[data-my-product-count]'); if (count) count.textContent = appData.products.length;
      showToast('상품을 삭제했어요.');
    });
    const action = card.querySelector('.card-button');
    if (action) { action.href = 'participants.html?product=' + encodeURIComponent(product.id); action.textContent = '참여 보기'; }
    const hasContributions = (product.contributors && product.contributors.length) || product.supporters > 0 || product.raised > 0;
    const isLocked = getWishlistState().shared || hasContributions;
    if (product.isClosed) {
      button.textContent = '마감됨'; button.disabled = true; button.classList.add('is-locked'); actions.append(button); card.append(actions);
      if (action) { action.textContent = '마감됨'; action.classList.add('is-disabled'); }
    } else if (isLocked) {
      button.textContent = '진행 중'; button.disabled = true; button.classList.add('is-locked');
      const close = document.createElement('button'); close.type = 'button'; close.className = 'product-close'; close.textContent = '마감';
      close.addEventListener('click', () => {
        if (!confirm(product.name + '을(를) 마감할까요? 마감 후에는 참여할 수 없어요.')) return;
        product.isClosed = true; saveProducts(appData.products); renderProducts(); setupWishlistEditing(); showToast('이 상품을 마감했어요.');
      });
      actions.append(close, button); card.append(actions);
    } else {
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'product-edit'; edit.textContent = '수정';
      edit.addEventListener('click', () => openProductEditor(product));
      actions.append(edit, button); card.append(actions);
    }
  });
}
function openProductEditor(product) {
  let pendingImage = product.imageUrl || '';
  const photoOnly = (product.status || 'draft') !== 'draft';
  const layer = document.createElement('div');
  layer.className = 'product-editor-layer';
  layer.innerHTML = `<section class="product-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
    <div class="product-editor-heading"><h2 id="product-editor-title">${photoOnly ? '상품 사진 수정' : '상품 수정'}</h2><button type="button" aria-label="닫기" data-close-editor>×</button></div>
    ${photoOnly ? `<p class="field-help">공개 후에는 상품 사진만 수정할 수 있어요.</p><div class="editor-product-summary"><strong>${escapeHtml(product.name)}</strong><span>${won(product.price)}</span></div>` : `<label class="field-label" for="edit-product-name">상품 이름</label><input id="edit-product-name" class="text-field" value="${escapeHtml(product.name)}" /><label class="field-label" for="edit-product-price">가격</label><input id="edit-product-price" class="text-field" inputmode="numeric" type="text" value="${Number(product.price) ? Number(product.price).toLocaleString('ko-KR') : ''}" placeholder="예: 100,000" />`}
    <label class="field-label">상품 사진 <span class="optional">선택</span></label><button type="button" class="photo-picker" data-editor-photo-picker>🖼 사진첩에서 고르기</button><input id="edit-product-photo" class="sr-only" type="file" accept="image/*" />
    <p class="field-help" data-editor-photo-status>새 사진을 선택하면 저장 전에 미리 볼 수 있어요.</p>
    <img class="product-photo-preview" data-editor-photo-preview ${pendingImage ? `src="${escapeHtml(pendingImage)}"` : ''} alt="상품 사진 미리보기" ${pendingImage ? '' : 'hidden'} />
    <button type="button" class="button button-ghost" data-remove-background ${pendingImage ? '' : 'hidden'}>배경 제거 미리보기</button><div class="background-preview" data-background-preview hidden><img alt="배경 제거 결과" /><div><button type="button" data-apply-background>적용</button><button type="button" data-cancel-background>원본 유지</button></div></div>
    <button type="button" class="button button-primary" data-save-product>${photoOnly ? '사진 저장' : '수정 저장'}</button>
    ${product.dbId && (product.status || 'draft') === 'draft' ? '<button type="button" class="editor-delete" data-delete-product>이 상품 삭제</button>' : ''}
  </section>`;
  const close = () => layer.remove();
  if (!photoOnly) setupMoneyInput(layer.querySelector('#edit-product-price'));
  layer.addEventListener('click', event => { if (event.target === layer) close(); });
  layer.querySelector('[data-close-editor]').addEventListener('click', close);
  const photoInput = layer.querySelector('#edit-product-photo');
  const photoPreview = layer.querySelector('[data-editor-photo-preview]');
  const photoStatus = layer.querySelector('[data-editor-photo-status]');
  const removeButton = layer.querySelector('[data-remove-background]');
  layer.querySelector('[data-editor-photo-picker]').addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0]; if (!file) return;
    photoStatus.textContent = '사진 크기를 줄이고 있어요…'; photoInput.disabled = true;
    try { const result = await compressProductPhoto(file); pendingImage = result.url; photoPreview.src = pendingImage; photoPreview.hidden = false; removeButton.hidden = false; photoStatus.textContent = `사진 준비 완료 · ${Math.ceil(result.bytes / 1024)}KB`; }
    catch (error) { photoStatus.textContent = error.message || '사진을 읽지 못했어요.'; }
    finally { photoInput.disabled = false; }
  });
  if (removeButton) {
    removeButton.addEventListener('click', async () => {
      removeButton.disabled = true; removeButton.textContent = '배경을 지우는 중…';
      try {
        const image = await removeProductBackground(pendingImage);
        const preview = layer.querySelector('[data-background-preview]');
        preview.querySelector('img').src = image; preview.hidden = false;
        layer.querySelector('[data-apply-background]').onclick = () => { pendingImage = image; photoPreview.src = image; photoPreview.hidden = false; preview.hidden = true; removeButton.disabled = false; removeButton.textContent = '배경 제거 미리보기'; photoStatus.textContent = '배경 제거 결과를 저장할 수 있어요.'; };
        layer.querySelector('[data-cancel-background]').onclick = () => { preview.hidden = true; removeButton.disabled = false; removeButton.textContent = '배경 제거 미리보기'; };
        removeButton.textContent = '배경 제거 완료';
      } catch (error) { showToast(error.message || '배경을 지우지 못했어요.'); removeButton.disabled = false; removeButton.textContent = '배경 제거 미리보기'; }
    });
  }
  layer.querySelector('[data-save-product]').addEventListener('click', async () => {
    const name = photoOnly ? product.name : layer.querySelector('#edit-product-name').value.trim();
    const price = photoOnly ? product.price : parseMoney(layer.querySelector('#edit-product-price').value);
    if (!name || !Number.isFinite(price) || price <= 0) { showToast('상품 이름과 0원보다 큰 가격을 입력해 주세요.'); return; }
    product.name = name; product.price = price; product.productUrl = ''; product.imageUrl = pendingImage;
    try {
      if (product.dbId) {
        const {error} = await window.giftoDb.from('wishlist_items').update(photoOnly ? {image_url:pendingImage || null} : {name, price, product_url:null, image_url:pendingImage || null}).eq('id', product.dbId);
        if (error) throw error;
        await hydrateMyRemoteWishlist();
      } else { saveProducts(appData.products); renderProducts(); setupWishlistEditing(); }
      close(); showToast(photoOnly ? '상품 사진을 수정했어요.' : '상품 정보를 수정했어요.');
    }
    catch { showToast('저장하지 못했어요. 브라우저 저장공간을 확인해 주세요.'); }
  });
  layer.querySelector('[data-delete-product]')?.addEventListener('click', async () => {
    if (!confirm(product.name + '을(를) 위시리스트에서 삭제할까요?')) return;
    const remove = layer.querySelector('[data-delete-product]'); remove.disabled = true; remove.textContent = '삭제 중…';
    const {error} = await window.giftoDb.from('wishlist_items').delete().eq('id', product.dbId).eq('status', 'draft');
    if (error) { remove.disabled = false; remove.textContent = '이 상품 삭제'; showToast('상품을 삭제하지 못했어요.'); return; }
    close(); await hydrateMyRemoteWishlist(); showToast('상품을 삭제했어요.');
  });
  document.body.append(layer);
  (photoOnly ? layer.querySelector('[data-editor-photo-picker]') : layer.querySelector('#edit-product-name')).focus();
}
async function removeProductBackground(image) {
  if (!image.startsWith('data:image/')) throw new Error('직접 올린 사진에서만 배경 제거를 사용할 수 있어요.');
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (!auth.session) throw new Error('로그인 후 사용할 수 있어요.');
  const {data, error} = await window.giftoDb.functions.invoke('remove-background', {body:{image}});
  if (error) { try { throw new Error((await error.context.json()).message); } catch (reason) { throw reason instanceof Error ? reason : new Error('배경을 지우지 못했어요.'); } }
  if (!data?.image) throw new Error(data?.message || '배경을 지우지 못했어요.');
  return data.image;
}
async function publishProduct(product) {
  if (!confirm('공개를 시작할까요? 공개 후에는 상품 정보 수정과 삭제는 할 수 없고, 사진만 바꿀 수 있어요.')) return;
  const {error} = await window.giftoDb.from('wishlist_items').update({status:'open', shared_at:new Date().toISOString()}).eq('id', product.dbId).eq('status', 'draft');
  if (error) { showToast('공개를 시작하지 못했어요.'); return; }
  await hydrateMyRemoteWishlist();
  showToast('공개를 시작했어요. 이제 친구가 함께할 수 있어요.');
}
async function closeProduct(product) {
  if (!confirm('목표 금액이 모두 모이지 않아도 마감할 수 있어요. 이 상품을 마감할까요?')) return;
  const {error} = await window.giftoDb.from('wishlist_items').update({status:'closed', closed_at:new Date().toISOString()}).eq('id', product.dbId).eq('status', 'open');
  if (error) { showToast('마감하지 못했어요.'); return; }
  await hydrateMyRemoteWishlist();
  showToast('마감했어요. 선물을 준비한 뒤 인증을 남겨 주세요.');
}
async function setupThankYou() {
  const upload = document.querySelector('[data-photo-upload]');
  if (!upload || !window.giftoDb) return;
  const itemId = new URLSearchParams(location.search).get('product');
  if (!isUuid(itemId)) { upload.closest('.thankyou').innerHTML = '<div class="empty-state">인증할 상품을 찾지 못했어요.</div>'; return; }
  const [{data:item}, {data:auth}] = await Promise.all([
    window.giftoDb.from('wishlist_items').select('id,name,wishlist_id,status,proof_image_url,proof_message').eq('id', itemId).single(),
    window.giftoDb.auth.getSession()
  ]);
  if (!item) { upload.closest('.thankyou').innerHTML = '<div class="empty-state">선물 인증을 불러오지 못했어요.</div>'; return; }
  const {data:list} = await window.giftoDb.from('wishlists').select('owner_id').eq('id', item.wishlist_id).single();
  const isOwner = !!auth.session && list?.owner_id === auth.session.user.id;
  if (!isOwner) {
    if (item.status !== 'proof_posted') { upload.closest('.thankyou').innerHTML = '<div class="empty-state">아직 선물 인증을 준비하고 있어요.</div>'; return; }
    upload.closest('.thankyou').innerHTML = `<p class="eyebrow">GIFT STORY</p><h1>${escapeHtml(item.name)}</h1><img class="proof-image" src="${escapeHtml(item.proof_image_url)}" alt="선물 인증 사진" /><div class="thanks-preview"><div class="avatar avatar-blue">G</div><div><strong>함께해 준 마음에 감사해요</strong><p>${escapeHtml(item.proof_message || '')}</p></div></div>`;
    return;
  }
  if (!['closed', 'proof_posted'].includes(item.status)) { upload.closest('.thankyou').innerHTML = '<div class="empty-state">마감한 내 상품에서만 선물 인증을 남길 수 있어요.</div>'; return; }
  document.querySelector('[data-thankyou-product]').textContent = item.name;
  const message = document.querySelector('#thanks');
  message.value = item.proof_message || '다들 고마워! 정말 잘 쓸게. 💙';
  const file = document.querySelector('#thanks-photo');
  const photoStatus = document.querySelector('[data-thanks-photo-status]');
  let imageUrl = item.proof_image_url || '';
  const refreshPhoto = () => {
    if (!imageUrl) return;
    upload.classList.add('uploaded');
    upload.querySelector('span').textContent = '✓';
    upload.querySelector('strong').textContent = '선물 사진이 준비됐어요';
  };
  refreshPhoto();
  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files[0]; if (!chosen) return;
    photoStatus.textContent = '사진 크기를 줄이고 있어요…';
    try { const result = await compressProductPhoto(chosen); imageUrl = result.url; refreshPhoto(); photoStatus.textContent = '사진 준비 완료'; }
    catch (error) { photoStatus.textContent = error.message || '사진을 읽지 못했어요.'; }
  });
  const save = document.querySelector('[data-thanks-submit]');
  save.addEventListener('click', async () => {
    if (!imageUrl) { showToast('선물 사진을 한 장 남겨 주세요.'); return; }
    const text = message.value.trim(); if (!text) { showToast('감사 메시지를 적어 주세요.'); return; }
    save.disabled = true; save.textContent = '인증 저장 중…';
    const {error} = await window.giftoDb.from('wishlist_items').update({status:'proof_posted', proof_image_url:imageUrl, proof_message:text, proof_published_at:new Date().toISOString()}).eq('id', item.id);
    if (error) { save.disabled = false; save.textContent = '인증 저장하고 공유하기'; showToast('인증을 저장하지 못했어요.'); return; }
    const {count} = await window.giftoDb.from('contributions').select('id', {count:'exact', head:true}).eq('item_id', item.id).eq('status', 'confirmed');
    const preview = document.querySelector('.thanks-preview');
    preview.hidden = false; preview.querySelector('strong').textContent = item.name + ' 선물 인증'; preview.querySelector('p').textContent = text; preview.querySelector('span').textContent = `함께해 준 ${count || 0}명에게 감사 링크를 보낼 수 있어요.`;
    save.disabled = false; save.textContent = '카카오톡으로 감사 링크 공유';
    save.onclick = async () => {
      const url = new URL('wishlist.html?owner=' + encodeURIComponent(auth.session.user.id), location.href).href;
      const shareText = `${item.name} 선물이 도착했어요 🎁\n${text}\n${url}`;
      if (navigator.share) {
        try { await navigator.share({title:'GIFTO 선물 인증', text:shareText, url}); return; }
        catch (shareError) { if (shareError?.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(shareText); showToast('감사 메시지와 링크를 복사했어요. 카카오톡에 붙여넣어 주세요.'); }
      catch { showToast('카카오톡으로 보낼 링크를 준비하지 못했어요.'); }
    };
    showToast('선물 인증을 저장했어요.');
  });
}
async function setupParticipants() {
  const view = document.querySelector('[data-participants]');
  const page = document.querySelector('[data-participants-page]');
  if (!view) return;
  const params = new URLSearchParams(location.search);
  const id = params.get('product');
  const cameFromHome = params.get('from') === 'home' || sessionStorage.getItem('gifto-participants-from-home') === '1' || document.referrer.includes('/index.html');
  const cameFromMyPage = sessionStorage.getItem('gifto-participants-from-mypage') === '1' || document.referrer.includes('/pages/my-page.html');
  if (cameFromHome || cameFromMyPage) {
    const back = document.querySelector('.topbar .back');
    if (back) back.addEventListener('click', event => {
      event.preventDefault();
      if (history.length > 1) history.back();
      else location.href = cameFromHome ? '../index.html' : 'my-page.html';
    });
    sessionStorage.removeItem('gifto-participants-from-home');
    sessionStorage.removeItem('gifto-participants-from-mypage');
  }
  if (!isUuid(id)) {
    const product = appData.products.find(item => item.id === id) || appData.products[0];
    const contributors = product?.contributors || [];
    document.querySelector('[data-participant-product]').textContent = product?.name || '상품';
    document.querySelector('[data-participant-total]').textContent = won(product?.raised || 0);
    document.querySelector('[data-participant-count]').textContent = contributors.length + '명 참여';
    view.innerHTML = contributors.length ? contributors.map(item => '<li><span class="contributor-avatar">' + escapeHtml(item.name).slice(0, 1) + '</span><strong>' + escapeHtml(item.name) + '</strong><span>' + won(item.amount) + '</span></li>').join('') : '<li class="empty-contributors">아직 함께한 친구가 없어요.</li>';
    if (page) page.hidden = false;
    return;
  }
  try {
    const {data: item, error: itemError} = await window.giftoDb.from('wishlist_items').select('id,wishlist_id').eq('id', id).single();
    if (itemError || !item) throw new Error('ITEM_NOT_FOUND');
    const {data: wishlist, error: wishlistError} = await window.giftoDb.from('wishlists').select('owner_id').eq('id', item.wishlist_id).single();
    if (wishlistError || !wishlist?.owner_id) throw new Error('WISHLIST_NOT_FOUND');
    clearRemoteWishlist(wishlist.owner_id);
    const remote = await loadRemoteWishlist(wishlist.owner_id);
    const product = remote.products.find(entry => entry.id === id);
    if (!product) throw new Error('PRODUCT_NOT_FOUND');
    const contributions = (product.allContributions || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const confirmed = contributions.filter(entry => entry.status === 'confirmed');
    const raised = confirmed.reduce((sum, entry) => sum + entry.amount, 0);
    const percent = product.price ? Math.min(100, Math.round(raised / product.price * 100)) : 0;
    document.querySelector('[data-participant-product]').textContent = product.name;
    document.querySelector('[data-participant-total]').textContent = won(confirmed.reduce((sum, entry) => sum + entry.amount, 0));
    document.querySelector('[data-participant-count]').textContent = confirmed.length + '명 참여';
    const card = document.querySelector('[data-participant-card]');
    if (card) card.innerHTML = `<div class="participant-product-image" style="--image-bg:${escapeHtml(product.color || '#f2f7ff')}">${escapeHtml(product.emoji || '🎁')}${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />` : ''}</div><div><p>선물 목표 금액</p><strong>${won(product.price)}</strong><span>${won(raised)} 모임 · ${percent}% 달성</span><div class="progress"><i style="width:${percent}%"></i></div></div>`;
    view.innerHTML = contributions.length ? contributions.map(entry => {
      const confirmedDate = entry.confirmed_at ? new Date(entry.confirmed_at) : null;
      const dateLabel = confirmedDate && !Number.isNaN(confirmedDate.getTime()) ? (confirmedDate.getMonth() + 1) + '월 ' + confirmedDate.getDate() + '일 확인' : '확인 완료';
      const state = entry.status === 'pending' ? '<em class="contribution-pending">입금 확인 대기</em>' : '<em class="contribution-confirmed">' + dateLabel + '</em>';
      return '<li><span class="contributor-avatar">' + escapeHtml(entry.contributor_name).slice(0,1) + '</span><strong>' + escapeHtml(entry.contributor_name) + '</strong><span>' + won(entry.amount) + '</span>' + state + '</li>';
    }).join('') : '<li class="empty-contributors">아직 함께한 친구가 없어요.</li>';
    if (page) page.hidden = false;
  } catch (error) {
    console.error('GIFTO participants failed to load', error);
    view.innerHTML = '<li class="empty-contributors">참여 내역을 불러오지 못했어요. 새로고침 후 다시 확인해 주세요.</li>';
    if (page) page.hidden = false;
  }
}
async function setupPendingConfirmations() {
  const section = document.querySelector('[data-pending-confirmations]');
  const badge = document.querySelector('[data-pending-badge]');
  if (!section || !window.giftoDb) return;
  const render = async () => {
    const {data: auth} = await window.giftoDb.auth.getSession();
    if (!auth.session) { section.hidden = true; badge?.setAttribute('hidden', ''); return; }
    // Public wishlist data is readable even when an old browser session cannot
    // resolve the owner's item list through the chained RLS query.
    clearRemoteWishlist(auth.session.user.id);
    const remote = await loadRemoteWishlist(auth.session.user.id);
    const items = remote.products || [];
    const itemById = new Map(items.map(item => [item.id, item]));
    const rows = items.flatMap(item => (item.allContributions || [])
      .filter(entry => entry.status === 'pending')
      .map(entry => ({...entry, item_id:item.id})));
    if (!rows.length) { section.hidden = true; badge?.setAttribute('hidden', ''); return; }
    section.hidden = false;
    badge?.removeAttribute('hidden');
    badge.textContent = String(rows.length);
    section.innerHTML = `<div class="section-heading"><div><p class="eyebrow">입금 확인</p><h2>확인할 송금 <span class="count">${rows.length}</span></h2></div></div><p class="settings-copy">실제 입금을 확인한 뒤 ‘받았어요’를 눌러 주세요.</p><ul class="pending-confirmation-list">${rows.map(row => { const item = itemById.get(row.item_id); return `<li><span class="contributor-avatar">${escapeHtml(row.contributor_name).slice(0,1)}</span><div><strong>${escapeHtml(row.contributor_name)}님이 ${escapeHtml(item?.name || '선물')}에 함께했어요</strong><small>${won(row.amount)} · 입금 확인 대기</small></div><button type="button" class="confirm-contribution" data-confirm-pending="${row.id}">받았어요</button></li>`; }).join('')}</ul>`;
    section.querySelectorAll('[data-confirm-pending]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = '확인 중…';
      const {error} = await window.giftoDb.from('contributions').update({status:'confirmed', confirmed_at:new Date().toISOString()}).eq('id', button.dataset.confirmPending).eq('status', 'pending');
      if (error) { button.disabled = false; button.textContent = '받았어요'; showToast('입금 확인을 처리하지 못했어요.'); return; }
      announceContributionChange(auth.session.user.id); await render(); await hydrateMyRemoteWishlist(); showToast('입금을 확인했어요. 진행률에 반영됐어요.');
    }));
  };
  try { await render(); } catch { section.hidden = true; badge?.setAttribute('hidden', ''); }
}
async function setupHomePendingBadge() {
  const badge = document.querySelector('.pending-anchor [data-pending-badge]');
  if (!badge || !window.giftoDb) return;
  try {
    const {data: auth} = await window.giftoDb.auth.getSession();
    if (!auth.session) return;
    clearRemoteWishlist(auth.session.user.id);
    const remote = await loadRemoteWishlist(auth.session.user.id);
    const count = remote.products.reduce((sum, item) => sum + (item.allContributions || []).filter(entry => entry.status === 'pending').length, 0);
    if (count) { badge.textContent = String(count); badge.removeAttribute('hidden'); }
  } catch {}
}
async function paintPendingConfirmationSection(products, owner) {
  const section = document.querySelector('[data-pending-confirmations]');
  if (!section) return;
  const rows = (products || []).flatMap(item => (item.allContributions || [])
    .filter(entry => entry.status === 'pending')
    .map(entry => ({...entry, item})));
  if (!rows.length) { section.hidden = true; return; }
  section.hidden = false;
  section.innerHTML = `<div class="section-heading"><div><p class="eyebrow">입금 확인</p><h2>확인할 송금 <span class="count">${rows.length}</span></h2></div></div><p class="settings-copy">실제 입금을 확인한 뒤 ‘받았어요’를 눌러 주세요.</p><ul class="pending-confirmation-list">${rows.map(row => `<li><span class="contributor-avatar">${escapeHtml(row.contributor_name).slice(0,1)}</span><div><strong>${escapeHtml(row.contributor_name)}님이 ${escapeHtml(row.item.name)}에 함께했어요</strong><small>${won(row.amount)} · 입금 확인 대기</small></div><button type="button" class="confirm-contribution" data-confirm-pending="${row.id}">받았어요</button></li>`).join('')}</ul>`;
  section.querySelectorAll('[data-confirm-pending]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = '확인 중…';
    const {error} = await window.giftoDb.from('contributions').update({status:'confirmed', confirmed_at:new Date().toISOString()}).eq('id', button.dataset.confirmPending).eq('status', 'pending');
    if (error) { button.disabled = false; button.textContent = '받았어요'; showToast('입금 확인을 처리하지 못했어요.'); return; }
    announceContributionChange(owner); await hydrateMyRemoteWishlist(); showToast('입금을 확인했어요. 진행률에 반영됐어요.');
  }));
}
async function hydrateMyRemoteWishlist() {
  const list = document.querySelector('[data-product-list][data-editable="true"]');
  if (!list || !window.giftoDb) return;
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (!auth.session) return;
  try {
    const productKey = name => String(name || '').replace(/\s+/g, '').toLowerCase();
    const localPhotoByName = new Map(appData.products.map(product => [productKey(product.name), product.imageUrl]).filter(([, imageUrl]) => imageUrl));
    document.querySelectorAll('[data-product-list] .product-card').forEach(card => {
      const name = card.querySelector('.product-name')?.textContent;
      const image = card.querySelector('.product-image img')?.src;
      if (name && image) localPhotoByName.set(productKey(name), image);
    });
    clearRemoteWishlist(auth.session.user.id);
    const remote = await loadRemoteWishlist(auth.session.user.id);
    appData.products = remote.products.map(product => ({...product, imageUrl: product.imageUrl || localPhotoByName.get(productKey(product.name)) || ''}));
    renderProducts();
    setupWishlistEditing();
    await paintPendingConfirmationSection(remote.products, auth.session.user.id);
    const savedScroll = Number(sessionStorage.getItem('gifto-mypage-scroll-y'));
    if (Number.isFinite(savedScroll) && savedScroll > 0) {
      sessionStorage.removeItem('gifto-mypage-scroll-y');
      requestAnimationFrame(() => window.scrollTo(0, savedScroll));
    }
  } catch {
    // A first-time user has no cloud wishlist yet, so local drafts remain visible.
  }
}
async function setupPublicProfile() {
  if (!document.querySelector('[data-owner-title]')) return;
  const avatar = document.querySelector('[data-owner-avatar]');
  try {
    const {data, error} = await window.giftoDb.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    const isMine = !!user && (!ownerId || ownerId === user.id);
    let profile;
    let ownerView = false;
    let details = {};
    if (sharedProfiles[ownerId]) {
      profile = {display_name: activeProfile.name, avatar_url: ''};
      details = {title: activeProfile.name + '의 생일 선물', note: '생일에 받고 싶은 선물을 모아봤어요. 함께해 주는 마음만으로도 고마워요 🎁'};
    } else if (isMine && isUuid(ownerId)) {
      const remote = await loadRemoteWishlist(ownerId);
      profile = remote.profile;
      details = {title:remote.wishlist.title, note:remote.wishlist.note};
      activeProfile.products = remote.products;
      ownerView = true;
    } else if (isMine) {
      const metadata = user.user_metadata || {};
      const kakao = user.identities?.find(item => item.provider === 'kakao')?.identity_data || {};
      profile = {display_name: metadata.full_name || metadata.name || metadata.nickname || metadata.preferred_username || kakao.full_name || kakao.name || 'GIFTO 사용자', avatar_url: metadata.avatar_url || metadata.picture || kakao.avatar_url || kakao.picture};
      try { details = JSON.parse(localStorage.getItem('gifto-wishlist-details:' + user.id)) || {}; } catch {}
      activeProfile.products = appData.products;
    } else {
      const remote = await loadRemoteWishlist(ownerId);
      profile = remote.profile;
      details = {title:remote.wishlist.title, note:remote.wishlist.note};
      activeProfile.products = remote.products;
    }
    const name = profile.display_name || 'GIFTO 사용자';
    activeProfile.name = name;
    activeProfile.paymentInfo = {kakaoQr:profile.kakao_pay_qr_url || '', kakaoUrl:profile.kakao_pay_url || ''};
    avatar.textContent = Array.from(name)[0];
    if (/^(https?:\/\/|data:image\/)/i.test(profile.avatar_url || '')) {
      const image = document.createElement('img'); image.alt = name + ' 프로필 사진';
      image.addEventListener('error', () => { avatar.textContent = Array.from(name)[0]; });
      image.src = profile.avatar_url; avatar.replaceChildren(image);
    }
    const title = details.title || name + '의 생일 선물';
    document.title = title + ' | GIFTO';
    document.querySelector('[data-owner-countdown]').textContent = name + '님께 전하는 선물';
    document.querySelector('[data-owner-title]').textContent = title;
    document.querySelector('[data-owner-copy]').textContent = details.note ?? '생일에 받고 싶은 선물을 모아봤어요. 함께해 주는 마음만으로도 고마워요 🎁';
    renderProducts();
    if (ownerView) {
      document.querySelectorAll('[data-public="true"] .card-button').forEach((button, index) => {
        const product = activeProfile.products[index];
        button.textContent = '참여 보기';
        button.href = 'participants.html?product=' + encodeURIComponent(product.id);
      });
    }
  } catch {
    avatar.textContent = 'G';
    document.querySelector('[data-owner-title]').textContent = '위시리스트를 불러오지 못했어요';
    document.querySelector('[data-owner-countdown]').textContent = '';
    document.querySelector('[data-owner-copy]').textContent = ownerId ? '공유 링크를 확인한 뒤 다시 열어 주세요.' : '로그인 후 내 위시리스트를 확인해 주세요.';
  }
  document.querySelector('.wish-hero').nextElementSibling.querySelector('.count').textContent = (ownerId ? activeProfile.products : appData.products).length;
  if (!document.querySelector('[data-public="true"] .card-button')?.textContent.includes('참여')) document.querySelectorAll('[data-public="true"] .card-button').forEach(button => { button.textContent = '함께하기'; });
}
function setupFriendList() {
  const list = document.querySelector('[data-friend-list]');
  if (!list) return;
  list.innerHTML = '';
  const profiles = Object.entries(sharedProfiles);
  if (!profiles.length) {
    list.innerHTML = '<div class="empty-state">아직 공개된 친구 위시리스트가 없어요.</div>';
    return;
  }
  profiles
    .sort(([, first], [, second]) => Number(first.countdown.slice(2)) - Number(second.countdown.slice(2)))
    .forEach(([id, profile]) => {
      const isMine = id === 'seongmin';
      const card = document.createElement('a'); card.className = 'birthday-card'; card.href = isMine ? 'pages/my-page.html' : 'pages/wishlist.html?owner=' + encodeURIComponent(id);
      const avatar = document.createElement('div'); avatar.className = 'avatar ' + profile.avatar; avatar.textContent = profile.initial;
      const details = document.createElement('div'); const name = document.createElement('strong'); const date = document.createElement('span');
      name.textContent = isMine ? profile.name + ' (나)' : profile.name; date.textContent = isMine ? '내 위시리스트 관리하기' : profile.countdown + ' · ' + profile.eventDate; details.append(name, date);
      const emoji = document.createElement('em'); emoji.textContent = profile.eventEmoji; card.append(avatar, details, emoji); list.append(card);
    });
}
function setupWishlistCategory() {
  const picker = document.querySelector('[data-category-picker]');
  if (!picker) return () => 'birthday';
  const title = document.querySelector('#list-title');
  const note = document.querySelector('#list-note');
  let selected = localStorage.getItem('gifto-draft-category') || 'birthday';
  const apply = category => {
    selected = GIFT_CATEGORIES[category] ? category : 'birthday';
    localStorage.setItem('gifto-draft-category', selected);
    picker.querySelectorAll('button').forEach(button => button.classList.toggle('selected', button.dataset.category === selected));
    const template = GIFT_CATEGORIES[selected];
    if (title && !title.dataset.userEdited) title.value = template.title;
    if (note && !note.dataset.userEdited) note.value = template.note;
  };
  note?.addEventListener('input', () => { note.dataset.userEdited = 'true'; });
  picker.querySelectorAll('button').forEach(button => button.addEventListener('click', () => apply(button.dataset.category)));
  apply(selected);
  return () => selected;
}
function setupCreateWishlist() {
  const addButton = document.querySelector('[data-add-product]');
  if (!addButton) return;
  const getCategory = setupWishlistCategory();
  let selectedEmoji = '🎁';
  let uploadedPhoto = '';
  let photoBusy = false;
  const updatePhotoButtons = () => { addButton.disabled = photoBusy; };
  let photoVersion = 0;
  const photoInput = document.querySelector('#new-product-photo');
  const photoPreview = document.querySelector('[data-product-photo-preview]');
  const photoStatus = document.querySelector('[data-photo-status]');
  const removePhoto = document.querySelector('[data-remove-product-photo]');
  document.querySelector('[data-new-photo-picker]').addEventListener('click', () => photoInput.click());
  const clearPhoto = () => {
    photoVersion += 1; uploadedPhoto = ''; photoInput.value = '';
    photoPreview.hidden = true; photoPreview.removeAttribute('src'); removePhoto.hidden = true;
    photoStatus.textContent = 'JPG·PNG·WebP 사진을 올려 주세요. 크기와 용량을 자동으로 줄여요.';
  };
  removePhoto.addEventListener('click', clearPhoto);
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    const version = ++photoVersion;
    uploadedPhoto = ''; photoPreview.hidden = true; removePhoto.hidden = true;
    photoBusy = true; updatePhotoButtons(); photoStatus.textContent = '사진 크기를 줄이고 있어요…';
    try {
      const result = await compressProductPhoto(file);
      if (version !== photoVersion) return;
      uploadedPhoto = result.url; photoPreview.src = uploadedPhoto; photoPreview.hidden = false; removePhoto.hidden = false;
      photoStatus.textContent = `사진 준비 완료 · ${Math.ceil(result.bytes / 1024)}KB`;
    } catch (error) {
      if (version === photoVersion) { photoInput.value = ''; photoStatus.textContent = error.message; }
    } finally { if (version === photoVersion) { photoBusy = false; updatePhotoButtons(); } }
  });
  const name = document.querySelector('#new-product-name');
  const price = document.querySelector('#new-product-price');
  setupMoneyInput(price);
  const draftList = document.querySelector('[data-draft-products]');
  const showDrafts = () => { draftList.innerHTML = appData.products.map(item => `<div class="draft-product">${item.imageUrl ? `<img class="draft-product-thumb" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />` : `<span class="draft-product-thumb draft-product-emoji">${escapeHtml(item.emoji)}</span>`}<strong>${escapeHtml(item.name)}</strong><small>${won(item.price)}</small></div>`).join(''); };
  showDrafts();
  (async () => {
    const {data: auth} = await window.giftoDb.auth.getSession();
    if (!auth.session) return;
    try {
      const remote = await loadRemoteWishlist(auth.session.user.id);
      appData.products = remote.products;
      document.querySelector('#list-title').value = remote.wishlist.title || document.querySelector('#list-title').value;
      if (remote.wishlist.note) document.querySelector('#list-note').value = remote.wishlist.note;
      showDrafts();
    } catch {
      // First wishlist: keep locally prepared draft products until the first save.
    }
  })();
  document.querySelectorAll('[data-emoji]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-emoji]').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected'); selectedEmoji = button.dataset.emoji;
  }));
  addButton.addEventListener('click', async () => {
    const productName = name.value.trim(); const productPrice = parseMoney(price.value);
    if (!productName || !Number.isFinite(productPrice) || productPrice <= 0) { showToast('상품 이름과 0원보다 큰 가격을 입력해 주세요.'); return; }
    addButton.textContent = '대표 이미지 확인 중…'; addButton.disabled = true;
    const imageUrl = uploadedPhoto;
    const nextProducts = [...appData.products, { id: `custom-${Date.now()}`, name: productName, price: productPrice, raised: 0, supporters: 0, emoji: selectedEmoji, color: '#f2f7ff', productUrl: '', imageUrl }];
    try { saveProducts(nextProducts); }
    catch { showToast('브라우저 저장공간이 부족해요. 입력한 내용은 유지했어요.'); addButton.disabled = false; addButton.textContent = '상품 목록에 추가'; return; }
    appData.products = nextProducts; name.value = ''; price.value = ''; clearPhoto(); showDrafts();
    addButton.textContent = imageUrl ? '이미지와 함께 추가됐어요 ✓' : '아이콘으로 추가됐어요 ✓'; addButton.disabled = false; setTimeout(() => { addButton.textContent = '상품 목록에 추가'; }, 1500);
  });
  document.querySelector('[data-save-wishlist]').addEventListener('click', async event => {
    event.preventDefault();
    try {
      const {data, error} = await window.giftoDb.auth.getSession();
      if (error || !data.session) { location.href = 'login.html'; return; }
      const saveButton = event.currentTarget; saveButton.classList.add('is-disabled'); saveButton.textContent = '저장 중…';
      const details = {title:document.querySelector('#list-title').value.trim(), note:document.querySelector('#list-note').value.trim(), category:getCategory()};
      localStorage.setItem('gifto-wishlist-details:' + data.session.user.id, JSON.stringify(details));
      const wishlist = await getOrCreateOwnWishlist(data.session.user, details);
      // Older projects can still save while the category migration is waiting to run.
      await window.giftoDb.from('wishlists').update({category:details.category}).eq('id', wishlist.id);
      const drafts = appData.products.filter(product => !product.dbId);
      if (drafts.length) {
        const {data: added, error: itemError} = await window.giftoDb.from('wishlist_items').insert(drafts.map((product, position) => ({
          wishlist_id:wishlist.id, name:product.name, price:product.price, product_url:product.productUrl || null,
          image_url:product.imageUrl || null, emoji:product.emoji || '🎁', color:product.color || '#f2f7ff', position
        }))).select('id,name,price,product_url,image_url,emoji,color,position');
        if (itemError) throw itemError;
        appData.products = appData.products.filter(product => product.dbId).concat((added || []).map(product => ({...product, dbId:product.id, raised:0, supporters:0, contributors:[]})));
      }
      saveProducts(appData.products);
      localStorage.setItem('gifto-wishlist-details:' + data.session.user.id, JSON.stringify(details));
      clearRemoteWishlist(data.session.user.id);
      location.href = `wishlist.html?owner=${encodeURIComponent(data.session.user.id)}`;
    } catch { showToast('저장하지 못했어요. 저장공간과 연결 상태를 확인해 주세요.'); }
  });
}
async function compressProductPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 파일을 선택해 주세요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하 사진을 선택해 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('사진을 읽지 못했어요. 다른 파일을 선택해 주세요.')); img.src = url; });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    let result;
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      result = canvas.toDataURL('image/jpeg', quality);
      if ((result.length - result.indexOf(',') - 1) * 0.75 <= 200 * 1024) break;
    }
    return { url: result, bytes: Math.ceil((result.length - result.indexOf(',') - 1) * 0.75) };
  } finally { URL.revokeObjectURL(url); }
}
async function getProductPreview(url) {
  if (!/^https:\/\//i.test(url)) throw new Error('https://로 시작하는 상품 링크를 넣어 주세요.');
  if (!window.giftoDb) throw new Error('연결을 확인한 뒤 다시 시도해 주세요.');
  const { data: auth } = await window.giftoDb.auth.getSession();
  if (!auth.session) throw new Error('상품 사진을 가져오려면 먼저 로그인해 주세요.');
  const { data, error } = await window.giftoDb.functions.invoke('product-preview', { body: {url} });
  if (error) {
    let reason = '';
    try { reason = (await error.context.json()).error; } catch {}
    if (reason === 'UNSUPPORTED_SHOP') throw new Error('아직 지원하지 않는 쇼핑몰이에요. 사진을 직접 올려 주세요.');
    if (reason === 'SHOP_BLOCKED') throw new Error('쇼핑몰의 접속 대기 또는 자동 접근 제한으로 사진을 가져올 수 없어요. 아래에서 직접 올려 주세요.');
    throw new Error('사진을 가져오지 못했어요. 잠시 후 다시 시도하거나 직접 올려 주세요.');
  }
  return data || {};
}
setupFriendList(); setupPublicProfile(); renderProducts(); setupWishlistEditing(); setupContribution(); setupParticipants(); setupPaymentSettings(); setupBirthdaySettings(); setupDisplayName(); setupProfileAvatar(); setupProfileEdit(); setupPendingConfirmations(); setupHomePendingBadge(); setupCreateWishlist(); setupKakaoLogin(); hydrateMyRemoteWishlist(); setupHomeWishlistStatus();
contributionChannel?.addEventListener('message', event => {
  if (!['contribution-confirmed', 'profile-updated'].includes(event.data?.type)) return;
  if (ownerId && event.data.owner === ownerId) setupPublicProfile();
  hydrateMyRemoteWishlist();
});
