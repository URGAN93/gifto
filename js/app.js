const DEFAULT_PRODUCTS = [];
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
  const {data: profile, error: profileError} = await window.giftoDb.from('profiles').select('id,display_name,avatar_url').eq('id', owner).single();
  if (profileError || !profile) throw new Error('PROFILE_NOT_FOUND');
  const {data: wishlist, error: wishlistError} = await window.giftoDb.from('wishlists').select('id,title,note').eq('owner_id', owner).eq('is_public', true).order('created_at', {ascending:false}).limit(1).maybeSingle();
  if (wishlistError || !wishlist) throw new Error('WISHLIST_NOT_FOUND');
  const {data: rows, error: itemError} = await window.giftoDb.from('wishlist_items').select('id,name,price,product_url,image_url,emoji,color,position,contributions(id,contributor_name,amount,status,created_at)').eq('wishlist_id', wishlist.id).order('position');
  if (itemError) throw itemError;
  const products = (rows || []).map(row => {
    const confirmed = (row.contributions || []).filter(contribution => contribution.status === 'confirmed');
    return {id:row.id, dbId:row.id, name:row.name, price:row.price, productUrl:row.product_url || '', imageUrl:row.image_url || '', emoji:row.emoji, color:row.color, raised:confirmed.reduce((sum, contribution) => sum + contribution.amount, 0), supporters:confirmed.length, contributors:confirmed, hasContributions:(row.contributions || []).length > 0};
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
      const percent = Math.round(product.raised / product.price * 100);
      return `<article class="product-card">
        <div class="product-image" style="--image-bg:${product.color}">${product.emoji}${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : ''}</div>
        <div class="product-body"><div class="product-top"><div><h3 class="product-name">${product.name}</h3><span class="product-price">${won(product.price)}</span></div><span class="tag">${product.supporters}명 참여</span></div>
        <div class="progress-label"><span>${percent}% 모였어요</span><strong>${won(product.raised)} <small>/ ${product.price.toLocaleString()}원</small></strong></div><div class="progress"><i style="width:${percent}%"></i></div>
        <div class="card-bottom"><span>마음을 모아 선물해요</span><a class="card-button" href="contribute.html?product=${product.id}${isPublic ? `&owner=${ownerId}` : ''}">${isPublic ? '함께 선물하기' : '참여 보기'}</a></div></div></article>`;
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
  const reveal = async product => {
    const percent = product.price ? Math.round((product.raised || 0) / product.price * 100) : 0;
    status.hidden = true;
    status.innerHTML = `<a href="pages/my-page.html" class="home-wishlist-card"><div class="home-wishlist-image" style="--image-bg:${escapeHtml(product.color || '#f2f7ff')}">${escapeHtml(product.emoji || '🎁')}${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />` : ''}</div><div><p>나의 위시리스트 현황</p><strong>${escapeHtml(product.name)}</strong><span>${won(product.raised || 0)} 모임 · ${percent}% · ${product.supporters || 0}명 참여</span></div><b>›</b></a>`;
    const image = status.querySelector('img');
    if (image && !image.complete) await Promise.race([new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }), new Promise(resolve => setTimeout(resolve, 700))]);
    status.hidden = false;
  };
  let cached;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch {}
  if (cached?.ownerId === auth.session.user.id && cached.product) await reveal(cached.product);
  let products = [];
  try {
    const remote = await loadRemoteWishlist(auth.session.user.id);
    products = remote.products;
  } catch {
    products = appData.products;
  }
  if (!products.length) { revealPrimaryAction(); return; }
  const product = products[0];
  const nextSnapshot = JSON.stringify(product);
  if (JSON.stringify(cached?.product) !== nextSnapshot) await reveal(product);
  try { localStorage.setItem(cacheKey, JSON.stringify({ownerId:auth.session.user.id, product})); } catch {}
  const create = document.querySelector('[data-auth-destination="pages/create.html"]');
  if (create) { create.href = 'pages/my-page.html'; create.childNodes[0].nodeValue = '내 위시리스트 관리 '; }
  revealPrimaryAction();
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
    } catch { selected.innerHTML = '<p class="empty-state">위시리스트를 불러오지 못했어요.</p>'; return; }
  }
  const sourceProducts = ownerId ? activeProfile.products : appData.products;
  const product = sourceProducts.find(item => item.id === id) || sourceProducts[0];
  if (!product) {
    selected.innerHTML = '<p class="empty-state">이 선물을 찾지 못했어요.</p>';
    return;
  }
  selected.innerHTML = `<div class="product-image" style="--image-bg:${product.color}">${product.emoji}</div><div class="product-body"><h2 class="product-name">${product.name}</h2><span class="product-price">${won(product.price)} · ${Math.round(product.raised/product.price*100)}% 모였어요</span></div>`;
  document.querySelector('[data-recipient-name]').textContent = `${activeProfile.name}에게 마음을 전해요`;
  const input = document.querySelector('#custom-amount');
  const sendButton = document.querySelector('[data-kakao-send]');
  const reportButton = document.querySelector('[data-report-sent]');
  const amountStep = document.querySelector('[data-amount-after-payment]');
  const fallback = document.querySelector('[data-qr-fallback]');
  const paymentInfo = ownerId === 'seongmin' ? getPaymentInfo() : (activeProfile.paymentInfo || {});
  const returnKey = 'gifto-returning-from-kakao';
  const showAmountStep = () => { amountStep.hidden = false; fallback.hidden = true; sendButton.hidden = true; input.focus(); };
  if (sessionStorage.getItem(returnKey) === product.id) { sessionStorage.removeItem(returnKey); showAmountStep(); }
  sendButton.addEventListener('click', async () => {
    if (!paymentInfo.kakaoQr) { showToast('아직 카카오페이 송금 QR이 등록되지 않았어요.'); return; }
    sendButton.disabled = true; sendButton.textContent = '카카오페이 연결 중…';
    const url = paymentInfo.kakaoUrl || await decodeQrPayload(paymentInfo.kakaoQr);
    if (url && isKakaoPayLink(url)) {
      sessionStorage.setItem(returnKey, product.id);
      location.href = url;
      return;
    }
    fallback.innerHTML = '<strong>카카오페이 QR 송금</strong><p>카카오톡에서 코드 스캔을 열고 QR을 스캔해 송금해 주세요. 송금 뒤 이 화면으로 돌아오면 금액을 입력할 수 있어요.</p><img alt="카카오페이 송금 QR 코드" />';
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
  const name = metadata.full_name || metadata.name || metadata.nickname || 'GIFTO 친구';
  const {error} = await window.giftoDb.from('contributions').insert({item_id:product.dbId, contributor_id:auth.session.user.id, contributor_name:name, amount, status:'pending'});
  if (error) throw new Error('송금 완료 처리를 하지 못했어요.');
}
async function decodeQrPayload(imageDataUrl) {
  if (!imageDataUrl || !('BarcodeDetector' in window)) return '';
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = imageDataUrl; });
    const detector = new BarcodeDetector({formats:['qr_code']});
    return (await detector.detect(image))[0]?.rawValue || '';
  } catch { return ''; }
}
function isKakaoPayLink(value) {
  try { const url = new URL(value); return ['https:','kakaotalk:','kakaopay:'].includes(url.protocol) && /(kakao\.com|kakaopay\.com)$/i.test(url.hostname); }
  catch { return false; }
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
      try { await ensureCloudShare(data.session.user); }
      catch { button.disabled = false; button.textContent = '↗ 내 위시리스트 공유하기'; showToast('공개 위시리스트를 만들지 못했어요.'); return; }
      button.disabled = false; button.textContent = '↗ 내 위시리스트 공유하기';
    }
    const shareUrl = new URL('wishlist.html?owner=' + encodeURIComponent(shareOwner), location.href).href;
    try { await navigator.clipboard.writeText(shareUrl); saveWishlistState({...getWishlistState(), shared:true}); showToast('위시리스트 링크가 복사되었어요!'); }
    catch { showToast('링크를 복사하지 못했어요. 주소창의 주소를 복사해 주세요.'); }
  }));
  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => {
    showToast(button.dataset.toast);
  }));
  const upload = document.querySelector('[data-photo-upload]');
  upload?.addEventListener('click', () => { upload.classList.add('uploaded'); upload.innerHTML = '<span>📷</span><strong>선물 사진이 추가되었어요</strong><small>프로토타입용 미리보기</small>'; });
  document.querySelector('[data-thanks-submit]')?.addEventListener('click', event => { const preview = document.querySelector('.thanks-preview'); preview.hidden = false; event.currentTarget.textContent = '공유되었어요 ✓'; event.currentTarget.disabled = true; });
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
  form.closest('.payment-settings').querySelector('h2').textContent = '송금 정보 설정';
  form.closest('.payment-settings').querySelector('.settings-copy').textContent = '카카오페이 코드송금 QR을 등록해 주세요.';
  kakao.type = 'file'; kakao.accept = 'image/*'; kakao.value = '';
  kakao.previousElementSibling.textContent = '카카오페이 송금 QR';
  const help = document.createElement('p'); help.className = 'field-help'; help.textContent = '내 카카오페이 코드송금 QR 이미지를 저장한 뒤, 위에서 파일을 선택해 주세요. 금액을 지정하지 않은 QR을 등록해 주세요.';
  kakao.insertAdjacentElement('afterend', help);
  const preview = document.createElement('img'); preview.className = 'payment-qr-preview'; preview.alt = '등록한 카카오페이 송금 QR';
  if (info.kakaoQr) { preview.src = info.kakaoQr; kakao.insertAdjacentElement('afterend', preview); }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const save = qr => { savePaymentInfo({ kakaoQr: qr || info.kakaoQr || '' }); showToast('카카오페이 QR을 저장했어요.'); };
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
      if (action) { action.href = 'participants.html?product=' + encodeURIComponent(product.id); action.textContent = '참여 보기'; }
      const remoteAction = document.createElement('div'); remoteAction.className = 'product-actions';
      if (product.hasContributions || product.raised > 0 || product.supporters > 0) {
        const state = document.createElement('button'); state.type = 'button'; state.className = 'product-delete is-locked';
        state.textContent = '진행 중'; state.disabled = true; remoteAction.append(state);
      } else {
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'product-edit'; edit.textContent = '수정'; edit.addEventListener('click', () => openProductEditor(product));
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'product-delete'; remove.textContent = '삭제';
        remove.addEventListener('click', async () => {
          if (!confirm(product.name + '을(를) 위시리스트에서 삭제할까요?')) return;
          remove.disabled = true;
          const {error} = await window.giftoDb.from('wishlist_items').delete().eq('id', product.dbId);
          if (error) { remove.disabled = false; showToast('상품을 삭제하지 못했어요.'); return; }
          await hydrateMyRemoteWishlist(); showToast('상품을 삭제했어요.');
        });
        remoteAction.append(edit, remove);
      }
      card.append(remoteAction);
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
  const layer = document.createElement('div');
  layer.className = 'product-editor-layer';
  layer.innerHTML = `<section class="product-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
    <div class="product-editor-heading"><h2 id="product-editor-title">상품 수정</h2><button type="button" aria-label="닫기" data-close-editor>×</button></div>
    <label class="field-label" for="edit-product-name">상품 이름</label><input id="edit-product-name" class="text-field" value="${escapeHtml(product.name)}" />
    <label class="field-label" for="edit-product-price">가격</label><input id="edit-product-price" class="text-field" inputmode="numeric" type="number" min="1" value="${Number(product.price) || ''}" />
    <label class="field-label" for="edit-product-url">상품 링크 <span class="optional">선택</span></label><input id="edit-product-url" class="text-field" type="url" value="${escapeHtml(product.productUrl || '')}" placeholder="https://..." />
    <label class="field-label">상품 사진 <span class="optional">선택</span></label><button type="button" class="photo-picker" data-editor-photo-picker>🖼 사진첩에서 고르기</button><input id="edit-product-photo" class="sr-only" type="file" accept="image/*" />
    <p class="field-help" data-editor-photo-status>새 사진을 선택하면 저장 전에 미리 볼 수 있어요.</p>
    <img class="product-photo-preview" data-editor-photo-preview ${pendingImage ? `src="${escapeHtml(pendingImage)}"` : ''} alt="상품 사진 미리보기" ${pendingImage ? '' : 'hidden'} />
    <button type="button" class="button button-ghost" data-remove-background ${pendingImage ? '' : 'hidden'}>배경 제거 미리보기</button><div class="background-preview" data-background-preview hidden><img alt="배경 제거 결과" /><div><button type="button" data-apply-background>적용</button><button type="button" data-cancel-background>원본 유지</button></div></div>
    <button type="button" class="button button-primary" data-save-product>수정 저장</button>
  </section>`;
  const close = () => layer.remove();
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
    const name = layer.querySelector('#edit-product-name').value.trim();
    const price = Number(layer.querySelector('#edit-product-price').value);
    const url = layer.querySelector('#edit-product-url').value.trim();
    if (!name || !Number.isFinite(price) || price <= 0) { showToast('상품 이름과 0원보다 큰 가격을 입력해 주세요.'); return; }
    if (url) { try { const parsed = new URL(url); if (parsed.protocol !== 'https:') throw new Error(); } catch { showToast('상품 링크는 https:// 주소로 넣어 주세요.'); return; } }
    product.name = name; product.price = price; product.productUrl = url; product.imageUrl = pendingImage;
    try {
      if (product.dbId) {
        const {error} = await window.giftoDb.from('wishlist_items').update({name, price, product_url:url || null, image_url:pendingImage || null}).eq('id', product.dbId);
        if (error) throw error;
        await hydrateMyRemoteWishlist();
      } else { saveProducts(appData.products); renderProducts(); setupWishlistEditing(); }
      close(); showToast('상품 정보를 수정했어요.');
    }
    catch { showToast('저장하지 못했어요. 브라우저 저장공간을 확인해 주세요.'); }
  });
  document.body.append(layer);
  layer.querySelector('#edit-product-name').focus();
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
async function setupParticipants() {
  const view = document.querySelector('[data-participants]');
  if (!view) return;
  const id = new URLSearchParams(location.search).get('product');
  if (!isUuid(id)) {
    const product = appData.products.find(item => item.id === id) || appData.products[0];
    const contributors = product?.contributors || [];
    document.querySelector('[data-participant-product]').textContent = product?.name || '상품';
    document.querySelector('[data-participant-total]').textContent = won(product?.raised || 0);
    document.querySelector('[data-participant-count]').textContent = contributors.length + '명 참여';
    view.innerHTML = contributors.length ? contributors.map(item => '<li><span class="contributor-avatar">' + escapeHtml(item.name).slice(0, 1) + '</span><strong>' + escapeHtml(item.name) + '</strong><span>' + won(item.amount) + '</span></li>').join('') : '<li class="empty-contributors">아직 함께한 친구가 없어요.</li>';
    return;
  }
  try {
    const {data: item, error: itemError} = await window.giftoDb.from('wishlist_items').select('id,name,price,wishlist_id').eq('id', id).single();
    if (itemError || !item) throw new Error('ITEM_NOT_FOUND');
    const [{data: list}, {data: contributions}, {data: auth}] = await Promise.all([
      window.giftoDb.from('wishlists').select('owner_id').eq('id', item.wishlist_id).single(),
      window.giftoDb.from('contributions').select('id,contributor_name,amount,status,created_at').eq('item_id', id).order('created_at'),
      window.giftoDb.auth.getSession()
    ]);
    const isOwner = auth.session?.user.id === list?.owner_id;
    const confirmed = (contributions || []).filter(entry => entry.status === 'confirmed');
    document.querySelector('[data-participant-product]').textContent = item.name;
    document.querySelector('[data-participant-total]').textContent = won(confirmed.reduce((sum, entry) => sum + entry.amount, 0));
    document.querySelector('[data-participant-count]').textContent = confirmed.length + '명 참여';
    view.innerHTML = (contributions || []).length ? (contributions || []).map(entry => `<li><span class="contributor-avatar">${escapeHtml(entry.contributor_name).slice(0,1)}</span><strong>${escapeHtml(entry.contributor_name)}</strong><span>${won(entry.amount)}</span>${entry.status === 'pending' ? `<em class="contribution-pending">입금 확인 대기</em>${isOwner ? `<button type="button" class="confirm-contribution" data-confirm-contribution="${entry.id}">받았어요</button>` : ''}` : '<em class="contribution-confirmed">확인 완료</em>'}</li>`).join('') : '<li class="empty-contributors">아직 함께한 친구가 없어요.</li>';
    view.querySelectorAll('[data-confirm-contribution]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = '확인 중…';
      const {error} = await window.giftoDb.from('contributions').update({status:'confirmed', confirmed_at:new Date().toISOString()}).eq('id', button.dataset.confirmContribution).eq('status', 'pending');
      if (error) { button.disabled = false; button.textContent = '받았어요'; showToast('입금 확인을 처리하지 못했어요.'); return; }
      announceContributionChange(list.owner_id); await setupParticipants(); showToast('입금을 확인했어요. 진행률에 반영됐어요.');
    }));
  } catch {
    view.innerHTML = '<li class="empty-contributors">참여 내역을 불러오지 못했어요.</li>';
  }
}
async function setupPendingConfirmations() {
  const section = document.querySelector('[data-pending-confirmations]');
  const badge = document.querySelector('[data-pending-badge]');
  if (!section || !window.giftoDb) return;
  const render = async () => {
    const {data: auth} = await window.giftoDb.auth.getSession();
    if (!auth.session) { section.hidden = true; badge?.setAttribute('hidden', ''); return; }
    const {data: lists, error: listError} = await window.giftoDb.from('wishlists').select('id').eq('owner_id', auth.session.user.id);
    if (listError || !(lists || []).length) { section.hidden = true; badge?.setAttribute('hidden', ''); return; }
    const {data: items, error: itemError} = await window.giftoDb.from('wishlist_items').select('id,name').in('wishlist_id', lists.map(list => list.id));
    if (itemError || !(items || []).length) { section.hidden = true; badge?.setAttribute('hidden', ''); return; }
    const itemById = new Map(items.map(item => [item.id, item]));
    const {data: rows, error: contributionError} = await window.giftoDb.from('contributions').select('id,item_id,contributor_name,amount,created_at').in('item_id', items.map(item => item.id)).eq('status', 'pending').order('created_at');
    if (contributionError || !(rows || []).length) { section.hidden = true; badge?.setAttribute('hidden', ''); return; }
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
    avatar.textContent = Array.from(name)[0];
    if (/^https?:\/\//i.test(profile.avatar_url || '')) {
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
function setupCreateWishlist() {
  const addButton = document.querySelector('[data-add-product]');
  if (!addButton) return;
  let selectedEmoji = '🎁';
  let uploadedPhoto = '';
  let linkPhoto = '';
  let previewedLink = '';
  let linkBusy = false;
  let photoBusy = false;
  const updatePhotoButtons = () => { addButton.disabled = linkBusy || photoBusy; };
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
  const name = document.querySelector('#new-product-name'); const productUrl = document.querySelector('#new-product-url');
  const linkStatus = document.querySelector('[data-link-photo-status]');
  const fetchPhoto = document.querySelector('[data-fetch-product-photo]');
  const loadLinkPhoto = async () => {
    if (linkBusy) return;
    const value = productUrl.value.trim();
    if (!value) return;
    linkBusy = true; fetchPhoto.disabled = true; updatePhotoButtons();
    linkStatus.textContent = '상품 링크에서 대표 이미지를 확인하고 있어요…';
    try {
      const result = await getProductPreview(value);
      if (productUrl.value.trim() !== value) return;
      previewedLink = value; linkPhoto = result.imageUrl || '';
      if (!name.value.trim() && result.title) name.value = result.title;
      if (linkPhoto && !uploadedPhoto) { photoPreview.src = linkPhoto; photoPreview.hidden = false; }
      linkStatus.textContent = linkPhoto ? '대표 이미지를 가져왔어요. 직접 올린 사진이 있으면 그 사진을 사용해요.' : '대표 사진을 찾지 못했어요. 아래에서 사진을 직접 올려 주세요.';
    } catch (error) {
      if (productUrl.value.trim() === value) linkStatus.textContent = error.message;
    } finally { linkBusy = false; fetchPhoto.disabled = false; updatePhotoButtons(); }
  };
  fetchPhoto.addEventListener('click', loadLinkPhoto);
  productUrl.addEventListener('input', () => { linkPhoto = ''; previewedLink = ''; if (!uploadedPhoto) { photoPreview.hidden = true; photoPreview.removeAttribute('src'); } });
  productUrl.addEventListener('change', loadLinkPhoto);
  photoPreview.addEventListener('error', () => { photoPreview.hidden = true; if (!uploadedPhoto) { linkPhoto = ''; linkStatus.textContent = '쇼핑몰에서 사진 표시를 막았어요. 직접 사진을 올려 주세요.'; } });
  const price = document.querySelector('#new-product-price');
  const draftList = document.querySelector('[data-draft-products]');
  const showDrafts = () => { draftList.innerHTML = appData.products.map(item => `<div class="draft-product">${item.imageUrl ? `<img width="48" height="48" style="object-fit:contain" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />` : `<span>${escapeHtml(item.emoji)}</span>`}<strong>${escapeHtml(item.name)}</strong><small>${won(item.price)}</small></div>`).join(''); };
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
    const productName = name.value.trim(); const productPrice = Number(price.value);
    if (!productName || !Number.isFinite(productPrice) || productPrice <= 0) { showToast('상품 이름과 0원보다 큰 가격을 입력해 주세요.'); return; }
    addButton.textContent = '대표 이미지 확인 중…'; addButton.disabled = true;
    const imageUrl = uploadedPhoto || (previewedLink === productUrl.value.trim() ? linkPhoto : '');
    const nextProducts = [...appData.products, { id: `custom-${Date.now()}`, name: productName, price: productPrice, raised: 0, supporters: 0, emoji: selectedEmoji, color: '#f2f7ff', productUrl: productUrl.value.trim(), imageUrl }];
    try { saveProducts(nextProducts); }
    catch { showToast('브라우저 저장공간이 부족해요. 입력한 내용은 유지했어요.'); addButton.disabled = false; addButton.textContent = '상품 목록에 추가'; return; }
    appData.products = nextProducts; name.value = ''; price.value = ''; productUrl.value = ''; clearPhoto(); showDrafts();
    addButton.textContent = imageUrl ? '이미지와 함께 추가됐어요 ✓' : '아이콘으로 추가됐어요 ✓'; addButton.disabled = false; setTimeout(() => { addButton.textContent = '상품 목록에 추가'; }, 1500);
  });
  document.querySelector('[data-save-wishlist]').addEventListener('click', async event => {
    event.preventDefault();
    try {
      const {data, error} = await window.giftoDb.auth.getSession();
      if (error || !data.session) { location.href = 'login.html'; return; }
      const saveButton = event.currentTarget; saveButton.classList.add('is-disabled'); saveButton.textContent = '저장 중…';
      const details = {title:document.querySelector('#list-title').value.trim(), note:document.querySelector('#list-note').value.trim()};
      const wishlist = await getOrCreateOwnWishlist(data.session.user, details);
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
setupFriendList(); setupPublicProfile(); renderProducts(); setupWishlistEditing(); setupContribution(); setupSmallInteractions(); setupPaymentSettings(); setupBirthdaySettings(); setupPendingConfirmations(); setupCreateWishlist(); setupKakaoLogin(); hydrateMyRemoteWishlist(); setupHomeWishlistStatus();
contributionChannel?.addEventListener('message', event => {
  if (event.data?.type !== 'contribution-confirmed') return;
  if (ownerId && event.data.owner === ownerId) setupPublicProfile();
  hydrateMyRemoteWishlist();
});
