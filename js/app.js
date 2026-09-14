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
async function loadRemoteWishlist(owner, listId = new URLSearchParams(location.search).get('list')) {
  if (!isUuid(owner)) throw new Error('INVALID_OWNER');
  const cacheId = owner + ':' + (listId || 'latest');
  if (remoteWishlistCache.has(cacheId)) return remoteWishlistCache.get(cacheId);
  let {data: publicProfiles, error: profileError} = await window.giftoDb.rpc('get_public_profile', {p_owner:owner});
  let profile = publicProfiles?.[0] || null;
  // This fallback is only for the brief code-deploy-before-policy-migration window.
  // The migration removes it by denying public table reads.
  if (profileError?.code === 'PGRST202') {
    ({data: profile, error: profileError} = await window.giftoDb.from('profiles').select('id,display_name,avatar_url,kakao_pay_qr_url,kakao_pay_url').eq('id', owner).single());
    if (profileError?.code === '42703') {
      ({data: profile, error: profileError} = await window.giftoDb.from('profiles').select('id,display_name,avatar_url,kakao_pay_qr_url').eq('id', owner).single());
    }
  }
  if (profileError || !profile) throw new Error('PROFILE_NOT_FOUND');
  let listQuery = window.giftoDb.from('wishlists').select('*').eq('owner_id', owner);
  if (listId) listQuery = listQuery.eq('id', listId);
  const {data: wishlist, error: wishlistError} = await listQuery.order('created_at', {ascending:false}).limit(1).maybeSingle();
  if (wishlistError) throw wishlistError;
  if (!wishlist && listId) throw new Error('WISHLIST_NOT_FOUND');
  if (!wishlist) return {profile, wishlist:{}, products:[]};
  const {data: rows, error: itemError} = await window.giftoDb.from('wishlist_items').select('*,contributions(*)').eq('wishlist_id', wishlist.id).order('position');
  if (itemError) throw itemError;
  const products = (rows || []).map(row => {
    const confirmed = (row.contributions || []).filter(contribution => contribution.status === 'confirmed');
    return {id:row.id, dbId:row.id, wishlistId:wishlist.id, name:row.name, price:row.price, productUrl:row.product_url || '', imageUrl:row.image_url || '', emoji:row.emoji, color:row.color, status:row.status || 'draft', sharedAt:row.shared_at, closedAt:row.closed_at, proofImageUrl:row.proof_image_url || '', proofMessage:row.proof_message || '', proofPublishedAt:row.proof_published_at, raised:Number(row.raised_amount ?? confirmed.reduce((sum, contribution) => sum + contribution.amount, 0)), pending:row.pending_amount == null ? null : Number(row.pending_amount), supporters:Number(row.supporter_count ?? confirmed.length), contributors:confirmed, allContributions:row.contributions || [], hasContributions:(row.contributions || []).length > 0};
  });
  const loaded = {profile, wishlist, products}; remoteWishlistCache.set(cacheId, loaded); return loaded;
}
function clearRemoteWishlist(owner) { for (const key of remoteWishlistCache.keys()) if (key.startsWith(owner + ':')) remoteWishlistCache.delete(key); }
async function getOrCreateOwnWishlist(user, details = {}) {
  const {data: existing, error: readError} = await window.giftoDb.from('wishlists').select('id,title,note,category,deadline_at').eq('owner_id', user.id).order('created_at', {ascending:false}).limit(1).maybeSingle();
  if (readError) throw readError;
  const title = details.title || existing?.title || (user.user_metadata?.name || user.user_metadata?.nickname || '나') + '의 생일 선물';
  if (existing) {
    const {data, error} = await window.giftoDb.from('wishlists').update({title, note:details.note ?? existing.note ?? null, category:details.category || existing.category || 'birthday', deadline_at:details.deadlineAt || null, is_public:true}).eq('id', existing.id).select('id,title,note,category,deadline_at').single();
    if (error) throw error;
    return data;
  }
  const {data, error} = await window.giftoDb.from('wishlists').insert({owner_id:user.id, title, note:details.note || null, category:details.category || 'birthday', deadline_at:details.deadlineAt || null, is_public:true}).select('id,title,note,category,deadline_at').single();
  if (error) throw error;
  return data;
}


function renderFundingProgress(product) {
  const confirmed = Math.max(0, Number(product.raised) || 0);
  const pending = product.pending;
  const filled = Math.min(100, confirmed / product.price * 100);
  const waiting = Math.max(0, Math.min(100 - filled, (Number(pending) || 0) / product.price * 100));
  return '<div class="progress funding-progress" aria-label="입금 확인 완료와 확인 대기"><i style="width:' + filled + '%"></i><i class="pending-progress" style="width:' + waiting + '%"></i></div><div class="funding-legend"><span>● 확인 완료 ' + won(confirmed) + '</span><span>● 확인 대기 ' + (pending == null ? '집계 준비 중' : won(pending)) + '</span></div>';
}

function sortWishlistProducts(products, publicOnly = false, ownerView = false) {
  const rank = p => {
    if (p.status === 'draft') return 2;
    const closed = p.isClosed || ['closed', 'proof_posted'].includes(p.status);
    return ownerView ? (closed ? 0 : 1) : (closed ? 1 : 0);
  };
  return products.filter(p => !publicOnly || (p.status && p.status !== 'draft'))
    .sort((a, b) => rank(a) - rank(b) || Number(b.price) - Number(a.price));
}

function renderProducts() {
  // Editing handlers use these same arrays by index: keep their order in sync.
  appData.products = sortWishlistProducts(appData.products, false, true);
  if (activeProfile.products) activeProfile.products = sortWishlistProducts(activeProfile.products);
  document.querySelectorAll('[data-my-product-count], [data-current-list-count]').forEach(count => { count.textContent = appData.products.length; });
  document.querySelectorAll('[data-product-list]').forEach(list => {
    const isPublic = list.dataset.public === 'true';
    const products = isPublic ? sortWishlistProducts(ownerId ? activeProfile.products : appData.products, true) : appData.products;
    if (!products.length) {
      list.innerHTML = '<div class="empty-state">아직 추가한 선물이 없어요.</div>';
      return;
    }
    list.innerHTML = products.map(rawProduct => {
      const product = {...rawProduct, name:escapeHtml(rawProduct.name), imageUrl:escapeHtml(rawProduct.imageUrl), emoji:escapeHtml(rawProduct.emoji), color:escapeHtml(rawProduct.color), id:encodeURIComponent(rawProduct.id)};
      const percent = Math.round(product.raised / product.price * 100);
      const reached = product.raised >= product.price;
      const closed = product.status === 'closed' || product.status === 'proof_posted' || product.isClosed;
      const draft = product.status === 'draft';
      const statusText = product.status === 'proof_posted' ? '선물 인증 완료' : closed ? '마감된 선물' : draft ? '준비 중' : '마음이 모이는 중';
      const proofPosted = product.status === 'proof_posted';
      const actionText = !isPublic ? '참여 보기' : proofPosted ? '인증 보기' : closed ? '마감됨' : reached ? '목표 금액이 모였어요 🎉' : draft ? '준비 중' : '함께 선물하기';
      const actionClass = isPublic && ((closed && !proofPosted) || draft) ? 'card-button is-disabled' : 'card-button';
      const actionHref = !isPublic ? `participants.html?product=${product.id}` : proofPosted ? `thankyou.html?product=${product.id}&owner=${encodeURIComponent(ownerId || '')}&list=${encodeURIComponent(product.wishlistId || '')}` : closed || draft ? '#' : `contribute.html?product=${product.id}&owner=${encodeURIComponent(ownerId || '')}&list=${encodeURIComponent(product.wishlistId || '')}`;
      return `<article class="product-card">
        <div class="product-image" style="--image-bg:${product.color}">${product.emoji}${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : ''}</div>
        <div class="product-body"><div class="product-top"><div><h3 class="product-name">${product.name}</h3><span class="product-price">${won(product.price)}</span></div><div class="product-tags"><span class="product-state state-${product.status || 'open'}">${statusText}</span><span class="tag">${product.supporters}명 참여</span></div></div>
        <div class="progress-label"><span>${percent}% 모였어요</span><strong>${won(product.raised)} <small>/ ${product.price.toLocaleString()}원</small></strong></div>${renderFundingProgress(product)}
<div class="card-bottom"><span>${reached ? '목표 금액이 모였어요 🎉' : closed ? '마음이 모였어요' : draft ? '공개 준비 중' : '마음을 모아 선물해요'}</span><a ${isPublic && reached && !closed ? 'hidden' : ''} class="${actionClass}" href="${actionHref}">${actionText}</a></div></div></article>`;
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
    products = sortWishlistProducts(products, false, true);
    status.hidden = true;
status.innerHTML = `<div class="home-wishlist-list">${products.map(product => { const percent = product.price ? Math.round((product.raised || 0) / product.price * 100) : 0; return `<a href="pages/participants.html?product=${encodeURIComponent(product.id)}&owner=${encodeURIComponent(auth.session.user.id)}&from=home" class="home-wishlist-card"><div class="home-wishlist-image" style="--image-bg:${escapeHtml(product.color || '#f2f7ff')}">${escapeHtml(product.emoji || '🎁')}${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />` : ''}</div><div><p>${escapeHtml(GIFT_CATEGORIES[product.category]?.label || '선물 리스트')}${product.status === 'closed' ? '<em class="home-proof-hint">인증 대기</em>' : ''}</p><strong>${escapeHtml(product.name)}</strong><span>${won(product.raised || 0)} 모임 · ${percent}% · ${product.supporters || 0}명 참여</span></div><b>›</b></a>`; }).join('')}</div>`;
    const images = [...status.querySelectorAll('img')].filter(image => !image.complete);
    if (images.length) await Promise.race([Promise.all(images.map(image => new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))), new Promise(resolve => setTimeout(resolve, 700))]);
    status.hidden = false;
    status.querySelectorAll('.home-wishlist-card').forEach(card => card.addEventListener('click', () => {
      sessionStorage.setItem('gifto-home-scroll-y', String(window.scrollY));
      sessionStorage.setItem('gifto-participants-from-home', '1');
    }));
  };
  let products = [];
  try {
    const {data: lists, error} = await window.giftoDb.from('wishlists').select('id').eq('owner_id', auth.session.user.id).order('created_at', {ascending:false});
    if (error) throw error;
    const wishlists = await Promise.all((lists || []).map(list => loadRemoteWishlist(auth.session.user.id, list.id)));
    products = wishlists.flatMap(remote => remote.products.map(product => ({...product, category:remote.wishlist.category})));
  } catch {
    localStorage.removeItem(cacheKey);
    status.hidden = false;
    status.textContent = '위시리스트를 불러오지 못했어요. 다시 로그인한 뒤 확인해 주세요.';
    revealPrimaryAction();
    return;
  }
  if (!products.length) { status.hidden = true; status.innerHTML = ''; localStorage.removeItem(cacheKey); revealPrimaryAction(); return; }
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
  const product = id ? sourceProducts.find(item => item.id === id) : sourceProducts[0];
  if (!product) {
    selected.innerHTML = '<p class="empty-state">이 선물을 찾지 못했어요.</p>';
    return;
  }
  if (product.status && product.status !== 'open') {
    selected.innerHTML = '<p class="empty-state">이 선물은 마감되었거나 아직 공개 전이에요.</p>';
    return;
  }
  selected.innerHTML = `<div class="product-image" style="--image-bg:${escapeHtml(product.color)}">${escapeHtml(product.emoji)}</div><div class="product-body"><h2 class="product-name">${escapeHtml(product.name)}</h2><span class="product-price">${won(product.price)} · ${Math.round(product.raised/product.price*100)}% 모였어요</span></div>`;
  document.querySelector('[data-recipient-name]').textContent = `${activeProfile.name}에게 마음을 전해요`;
  const input = document.querySelector('#custom-amount');
  const customTrigger = document.querySelector('[data-custom-amount]');
  const customCard = document.querySelector('[data-custom-amount-card]');
  const guestSender = document.querySelector('[data-guest-sender]');
  const guestNameInput = document.querySelector('#guest-sender-name');
  const sendButton = document.querySelector('[data-kakao-send]');
  const fallback = document.querySelector('[data-qr-fallback]');
  const picker = document.querySelector('.contribution-amount-picker');
  const key = 'gifto-transfer-attempt:' + ownerId + ':' + product.id;
  let attempt;
  try { attempt = JSON.parse(sessionStorage.getItem(key)); } catch {}
  let selectedAmount = Number(attempt?.amount) || 0;
  let signedIn = false;
  let reporting = false;
  let goalReached = product.raised >= product.price;
  const showGoalReached = () => {
    picker.hidden = true; sendButton.hidden = true; fallback.hidden = false;
    fallback.innerHTML = '<strong>목표 금액이 모였어요 🎉</strong><p>새 송금은 마감됐어요. 이미 시작한 송금은 복귀 화면에서 등록할 수 있어요.</p>';
  };
  const presets = [...document.querySelectorAll('[data-amount-presets] [data-amount]')];
  const paint = () => {
    presets.forEach(button => {
      const selected = Number(button.dataset.amount) === selectedAmount;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const validAmount = Number.isSafeInteger(selectedAmount) && selectedAmount >= 1000 && selectedAmount <= 2147483647 && selectedAmount % 1000 === 0;
    const validGuestName = signedIn || !!guestNameInput?.value.trim();
    sendButton.disabled = !validAmount || !validGuestName;
    sendButton.textContent = sendButton.disabled ? '금액을 선택해 주세요' : won(selectedAmount) + ' 보내기';
  };
  presets.forEach(button => button.addEventListener('click', () => {
    selectedAmount = Number(button.dataset.amount); input.value = ''; paint();
  }));
  customTrigger?.addEventListener('click', () => {
    customCard.hidden = false;
    input.focus();
  });
  input.addEventListener('input', () => {
    const digits = input.value.replace(/[^0-9]/g, '');
    input.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
    selectedAmount = Number(digits); paint();
  });
  guestNameInput?.addEventListener('input', paint);
  try {
    const {data: auth} = await window.giftoDb.auth.getSession();
    signedIn = !!auth.session;
    guestSender.hidden = signedIn;
  } catch {}
  const storeAttempt = () => sessionStorage.setItem(key, JSON.stringify(attempt));
  const notSent = () => {
    if (reporting) return;
    sessionStorage.removeItem(key); attempt = null;
    fallback.hidden = true; fallback.replaceChildren(); picker.hidden = false; sendButton.hidden = false;
    input.value = selectedAmount ? selectedAmount.toLocaleString('ko-KR') : ''; paint();
    if (goalReached) showGoalReached();
  };
  const reportSent = async () => {
    if (reporting || !attempt) return;
    reporting = true;
    fallback.querySelectorAll('button').forEach(button => button.disabled = true);
    try {
      const receipt = await window.giftoContributions.submit(product, attempt.amount, attempt.id, activeProfile.name, guestNameInput?.value.trim() || '');
      sessionStorage.removeItem(key);
      location.href = 'complete.html?receipt=' + encodeURIComponent(receipt) + '&owner=' + encodeURIComponent(ownerId) + '&list=' + encodeURIComponent(product.wishlistId || '');
    } catch (error) {
      reporting = false;
      fallback.querySelectorAll('button').forEach(button => button.disabled = false);
      showToast(error.message || '저장하지 못했어요. 다시 시도해 주세요.');
    }
  };
  const appendAnswers = () => {
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'button button-primary'; yes.textContent = '송금했어요'; yes.onclick = reportSent;
    const no = document.createElement('button'); no.type = 'button'; no.className = 'button button-ghost'; no.textContent = '아직 안 보냈어요'; no.onclick = notSent;
    fallback.append(yes, no);
  };
  const showConfirmation = () => {
    if (!attempt || reporting) return;
    attempt.phase = 'confirm'; storeAttempt();
    picker.hidden = true; sendButton.hidden = true; fallback.hidden = false;
    fallback.innerHTML = '<strong>마음을 나눠주셔서 고마워요 💛</strong><p>' + won(attempt.amount) + ' 송금을 마치셨나요? 송금 여부를 선택해 주세요.</p>';
    appendAnswers();
  };
  paint();
  if (attempt) showConfirmation();
  else if (goalReached) showGoalReached();
  window.addEventListener('pageshow', () => { if (attempt?.phase === 'away') showConfirmation(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && attempt?.phase === 'away') showConfirmation(); });
  sendButton.addEventListener('click', async () => {
    if (sendButton.disabled || goalReached) return;
    if (selectedAmount % 1000 !== 0) { showToast('1,000원 단위로 입력해 주세요.'); return; }
    if (product.dbId) {
      const {data: fresh, error} = await window.giftoDb.from('wishlist_items').select('raised_amount,price').eq('id', product.dbId).single();
      if (error) { showToast('현재 모금액을 확인하지 못했어요. 다시 시도해 주세요.'); return; }
      if (fresh.raised_amount >= fresh.price) { goalReached = true; showGoalReached(); return; }
    }
    const payment = ownerId === 'seongmin' ? getPaymentInfo() : activeProfile.paymentInfo || {};
    if (!payment.kakaoQr) { showToast('아직 카카오페이 송금 QR이 등록되지 않았어요.'); return; }
    sendButton.disabled = true;
    try {
      const url = payment.kakaoUrl || await decodeQrPayload(payment.kakaoQr);
      attempt = {id:crypto.randomUUID(), amount:selectedAmount, phase:'ready'};
      storeAttempt();
      picker.hidden = true; sendButton.hidden = true; fallback.hidden = false;
      fallback.innerHTML = '<strong>' + won(selectedAmount) + '을 보내 주세요</strong><p>카카오페이에서 같은 금액을 입력해 주세요. GIFTO로 돌아온 뒤 송금 여부를 선택하면 돼요.</p>';
      if (url && isKakaoPayLink(url)) {
        const open = document.createElement('button'); open.type = 'button'; open.className = 'button button-primary'; open.textContent = '카카오페이 열기';
        open.onclick = () => { showConfirmation(); attempt.phase = 'away'; storeAttempt(); location.href = url; };
        fallback.append(open);
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button button-ghost'; cancel.textContent = '아직 안 보냈어요'; cancel.onclick = notSent; fallback.append(cancel);
      } else {
        const qr = document.createElement('img'); qr.src = payment.kakaoQr; qr.alt = '카카오페이 송금 QR 코드'; fallback.append(qr);
        attempt.phase = 'away'; storeAttempt(); appendAnswers();
      }
    } catch { showToast('송금 안내를 열지 못했어요. 다시 시도해 주세요.'); paint(); }
  });
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
  const listId = new URLSearchParams(location.search).get('list');
  if (listId && ownerId) document.querySelectorAll('a[href="wishlist.html"]').forEach(link => {
    link.href = 'wishlist.html?owner=' + encodeURIComponent(ownerId) + '&list=' + encodeURIComponent(listId);
  });
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
    const sharePath = 'pages/wishlist.html?owner=' + encodeURIComponent(shareOwner) + '&category=' + encodeURIComponent(category);
    const shareUrl = window.giftoPublicUrl ? window.giftoPublicUrl(sharePath) : new URL(sharePath.slice(6), location.href).href;
    try { await navigator.clipboard.writeText(shareUrl); saveWishlistState({...getWishlistState(), shared:true}); showToast('위시리스트 링크가 복사되었어요!'); }
    catch { showToast('링크를 복사하지 못했어요. 주소창의 주소를 복사해 주세요.'); }
  }));
  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => {
    showToast(button.dataset.toast);
  }));
}

function setupPaymentReturn() {
  const page = document.querySelector('[data-payment-return]');
  if (!page) return;
  const params = new URLSearchParams(location.search);
  const product = params.get('product') || '';
  const owner = params.get('owner') || '';
  const wishlist = page.querySelector('[data-return-wishlist]');
  wishlist.href = `wishlist.html?owner=${encodeURIComponent(owner)}`;
  page.querySelector('[data-return-kakao-login]').addEventListener('click', () => {
    // The pending contribution token will be claimed after the OAuth callback.
    sessionStorage.setItem('gifto-claim-contribution', JSON.stringify({product, owner, createdAt:Date.now()}));
    location.href = `login.html?next=${encodeURIComponent(`payment-return.html?product=${product}&owner=${owner}`)}`;
  });
}
function setupKakaoLogin() {
  const button = document.querySelector('[data-kakao-login]');
  if (!button || !window.giftoDb) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = '카카오로 이동 중…';
    const message = document.querySelector('[data-auth-message]');
    try {
    if (window.giftoNative?.isNative) { await window.giftoNative.login(); return; }
    const { data, error } = await window.giftoDb.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: location.href,
        skipBrowserRedirect: true
      }
    });
    if (error || !data.url) throw error || new Error('Missing login URL');
    // Replace the login entry; the callback also replaces itself with home.
    window.location.replace(data.url);
    } catch (error) {
      button.disabled = false;
      button.textContent = '카카오로 시작하기';
      if (message) message.textContent = '로그인을 시작하지 못했어요. 카카오 설정을 다시 확인해 주세요.';
    }
  });
}
async function setupMemberOnlyPage() {
  const page = location.pathname.split('/').pop();
  if (!['create.html', 'my-page.html'].includes(page) || !window.giftoDb) return;
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (auth.session) return;
  const creating = page === 'create.html';
  document.querySelector('.app-shell').innerHTML = `<header class="topbar"><a class="back" href="../index.html">←</a><a class="brand" href="../index.html"><span class="brand-mark">G</span> GIFTO</a><span class="topbar-spacer"></span></header><section class="form-page member-gate"><p class="eyebrow">GIFTO ACCOUNT</p><h1>${creating ? '나만의 선물 리스트를<br />만들어 보세요' : '내가 만든 리스트와<br />보낸 마음을 확인하세요'}</h1><p class="form-description">${creating ? '위시리스트를 만들고 친구들과 공유하려면 카카오 로그인이 필요해요.' : '내 리스트, 입금 확인, 보낸 마음 내역은 로그인 후 안전하게 볼 수 있어요.'}</p><a class="button button-primary" href="login.html?next=${encodeURIComponent(page)}">카카오로 로그인하기</a><a class="text-link" href="../index.html">둘러보기로 돌아가기</a></section>`;
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
function setupQrGuideViewer() {
  const link = document.querySelector('.qr-guide a');
  if (!link) return;
  const thumbnail = link.querySelector('img');
  const dialog = document.createElement('dialog');
  dialog.className = 'qr-guide-viewer';
  dialog.setAttribute('aria-label', 'QR 저장 방법 크게 보기');
  dialog.innerHTML = '<button type="button" class="qr-guide-close" aria-label="사진 닫기">✕ 닫기</button><img />';
  const image = dialog.querySelector('img');
  image.src = link.href; image.alt = thumbnail.alt;
  document.body.append(dialog);
  let closing = false;
  let previousOverflow = '';
  const show = () => {
    if (dialog.open) return;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('button').focus();
  };
  const hide = () => {
    if (!dialog.open) return;
    dialog.close(); document.body.style.overflow = previousOverflow;
    closing = false; link.focus();
  };
  const requestClose = () => {
    if (closing || !dialog.open) return;
    if (history.state?.giftoQrGuide) { closing = true; history.back(); }
    else hide();
  };
  link.addEventListener('click', event => {
    event.preventDefault();
    if (dialog.open) return;
    history.pushState({...history.state, giftoQrGuide:true}, '', location.href);
    show();
  });
  dialog.querySelector('button').addEventListener('click', requestClose);
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) requestClose(); });
  window.addEventListener('popstate', () => {
    if (history.state?.giftoQrGuide) show();
    else hide();
  });
  if (history.state?.giftoQrGuide) show();
}
function setupPaymentSettings() {
  setupQrGuideViewer();
  const form = document.querySelector('[data-payment-settings]');
  if (!form) return;
  const info = getPaymentInfo();
  const kakao = document.querySelector('#payment-kakao');
  const section = form.closest('.payment-settings');
  section.id = 'payment-settings';
  if (location.hash === '#payment-settings') requestAnimationFrame(() => section.scrollIntoView({block:'start'}));
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
  const {data: profile, error: profileError} = await window.giftoDb.from('profiles').select('avatar_url,display_name').eq('id', auth.session.user.id).maybeSingle();
  const name = profile?.display_name || document.querySelector('[data-account-name]')?.textContent || 'G';
  const profileLoaded = !profileError && !!profile;
  let currentUrl = profileLoaded ? (profile.avatar_url || '') : getAccountAvatarUrl(auth.session);
  // A failed/missing read is not a request to erase the cached photo.
  if (profileLoaded) localStorage.setItem('gifto-profile-avatar:' + auth.session.user.id, currentUrl);
  const paintAvatar = url => {
    document.querySelectorAll('[data-account-avatar]').forEach(avatar => {
      renderProfileAvatar(avatar, url, name, auth.session);
    });
  };
  paintAvatar(currentUrl);
  toggle.addEventListener('click', () => {
    let pendingUrl = currentUrl;
    let changed = false;
    const layer = document.createElement('div'); layer.className = 'display-name-layer';
    layer.innerHTML = `<section class="profile-avatar-modal"><div class="product-editor-heading"><h2>프로필 사진</h2><button type="button" aria-label="닫기" data-close-avatar>×</button></div><div class="avatar avatar-large avatar-blue" data-avatar-preview>${Array.from(name)[0]}</div><p>사진을 쓰지 않으면 이름 첫 글자로 표시돼요.</p><button type="button" class="photo-picker" data-avatar-picker>🖼 사진첩에서 고르기</button><input class="sr-only" type="file" accept="image/*" data-avatar-file /><button type="button" class="button button-ghost" data-remove-avatar>사진 없이 사용</button><button type="button" class="button button-primary" data-save-avatar>저장</button></section>`;
    const close = () => layer.remove(); const preview = layer.querySelector('[data-avatar-preview]');
    const paintPreview = () => renderProfileAvatar(preview, pendingUrl, name, auth.session);
    paintPreview();
    layer.addEventListener('click', event => { if (event.target === layer) close(); }); layer.querySelector('[data-close-avatar]').addEventListener('click', close);
    const input = layer.querySelector('[data-avatar-file]'); layer.querySelector('[data-avatar-picker]').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => { const file = input.files[0]; if (!file) return; try { const result = await compressProductPhoto(file); pendingUrl = result.url; changed = true; paintPreview(); } catch (error) { showToast(error.message || '사진을 읽지 못했어요.'); } });
    layer.querySelector('[data-remove-avatar]').addEventListener('click', () => { pendingUrl = ''; changed = true; paintPreview(); });
    layer.querySelector('[data-save-avatar]').addEventListener('click', async event => {
      if (!changed) { close(); return; }
      const button = event.currentTarget; button.disabled = true; button.textContent = '저장 중…';
      const {error} = await window.giftoDb.from('profiles').update({avatar_url:pendingUrl || null}).eq('id', auth.session.user.id);
      if (error) { button.disabled = false; button.textContent = '저장'; showToast('프로필 사진을 저장하지 못했어요.'); return; }
      currentUrl = pendingUrl || '';
      localStorage.setItem('gifto-profile-avatar:' + auth.session.user.id, currentUrl); paintAvatar(currentUrl); clearRemoteWishlist(auth.session.user.id); contributionChannel?.postMessage({type:'profile-updated', owner:auth.session.user.id}); close(); showToast(pendingUrl ? '프로필 사진을 저장했어요.' : '프로필 사진 없이 표시할게요.');
    });
    document.body.append(layer);
  });
}
function setupProfileEdit() {
  const button = document.querySelector('[data-profile-edit]');
  if (!button) return;
  button.addEventListener('click', () => {
    const layer = document.createElement('div'); layer.className = 'display-name-layer';
    layer.innerHTML = `<section class="profile-edit-sheet"><div class="product-editor-heading"><h2>프로필 편집</h2><button type="button" aria-label="닫기" data-close-profile-edit>×</button></div><p>GIFTO에서 친구에게 보여질 정보를 설정해요.</p><button type="button" data-open-nickname><span>✎</span><div><strong>닉네임 수정</strong><small>공유 페이지와 참여 내역에 표시돼요.</small></div><b>›</b></button><button type="button" data-open-avatar><span>◉</span><div><strong>프로필 사진</strong><small>사진을 쓰지 않으면 이니셜로 표시돼요.</small></div><b>›</b></button><button class="profile-signout" type="button" data-sign-out><span>↗</span><div><strong>로그아웃</strong><small>이 기기에서만 로그인 정보가 지워져요.</small></div><b>›</b></button></section>`;
    const close = () => layer.remove();
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    layer.querySelector('[data-close-profile-edit]').addEventListener('click', close);
    layer.querySelector('[data-open-nickname]').addEventListener('click', () => { close(); document.querySelector('[data-display-name-toggle]')?.click(); });
    layer.querySelector('[data-open-avatar]').addEventListener('click', () => { close(); document.querySelector('[data-profile-avatar-toggle]')?.click(); });
    layer.querySelector('[data-sign-out]').addEventListener('click', async () => {
      await window.giftoDb.auth.signOut({ scope:'local' });
      location.replace(new URL('../index.html', location.href).href);
    });
    document.body.append(layer);
  });
}
function showToast(message) {
  const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('show')); setTimeout(() => toast.remove(), 1800);
}

async function deleteEmptyProduct(id) {
  const {data: auth, error: authError} = await window.giftoDb.auth.getSession();
  if (authError || !auth.session) throw new Error('다시 로그인한 뒤 삭제해 주세요.');
  const {data: item, error: itemError} = await window.giftoDb.from('wishlist_items').select('*').eq('id', id).maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw new Error('상품이 이미 삭제되었거나 현재 계정에 조회 권한이 없어요.');
  const {data: list, error: listError} = await window.giftoDb.from('wishlists').select('owner_id').eq('id', item.wishlist_id).single();
  if (listError || list?.owner_id !== auth.session.user.id) throw new Error('내 상품만 삭제할 수 있어요.');
  const {count, error: countError} = await window.giftoDb.from('contributions').select('id', {count:'exact', head:true}).eq('item_id', id);
  if (countError) throw countError;
  if (count !== 0 || Number(item.raised_amount) > 0) throw new Error('입금 확인 대기 또는 참여 기록이 있어 삭제할 수 없어요.');
  const {data: removed, error} = await window.giftoDb.rpc('delete_empty_gift_item', {p_item:id});
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('삭제 기능 DB 업데이트가 아직 적용되지 않았어요. 관리자에게 확인해 주세요.');
    throw error;
  }
  if (removed?.item_id !== id) throw new Error('삭제 결과를 확인하지 못했어요. 새로고침 후 확인해 주세요.');
  clearRemoteWishlist(list.owner_id);
  localStorage.removeItem('gifto-home-wishlist-status');
  appData.products = appData.products.filter(product => product.id !== id);
  if (removed.list_deleted) {
    location.replace('my-page.html');
    return true;
  }
  return false;
}

async function deleteClosedTestProduct(product) {
  if (!confirm('테스트용으로 마감한 “' + product.name + '”과(와) 참여 기록을 모두 삭제할까요?\n이 작업은 되돌릴 수 없어요.')) return;
  const {data: removed, error} = await window.giftoDb.rpc('delete_closed_test_gift_item', {p_item:product.dbId});
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('테스트 삭제용 DB 업데이트가 아직 적용되지 않았어요.');
    throw error;
  }
  if (removed?.item_id !== product.dbId) throw new Error('삭제 결과를 확인하지 못했어요. 새로고침 후 확인해 주세요.');
  clearRemoteWishlist(ownerId);
  localStorage.removeItem('gifto-home-wishlist-status');
  if (removed.list_deleted) { location.replace('my-page.html'); return; }
  await hydrateMyRemoteWishlist();
  showToast('마감 상품과 테스트 참여 내역을 삭제했어요.');
}


async function shareWishlist(listId, owner, title) {
  try {
    clearRemoteWishlist(owner);
    const remote = await loadRemoteWishlist(owner, listId);
    await window.openWishlistShare(remote);
  } catch { showToast('공유할 리스트를 불러오지 못했어요. 다시 시도해 주세요.'); }
}
async function setupMyWishlistCollections() {
  const container = document.querySelector('[data-wishlist-collections]');
  if (!container) return;
  const {data: auth} = await window.giftoDb.auth.getSession();
  if (!auth.session) { container.innerHTML = '<a class="button button-ghost" href="login.html">로그인하고 내 리스트 보기</a>'; return; }
  const {data: lists, error} = await window.giftoDb.from('wishlists').select('*,wishlist_items(id,image_url,emoji,status)').eq('owner_id', auth.session.user.id).order('created_at', {ascending:false});
  if (error) { container.textContent = '리스트를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'; return; }
  document.querySelector('[data-list-count]').textContent = lists.length;
  if (!lists.length) { container.innerHTML = '<div class="empty-state">생일, 집들이… 첫 선물 리스트를 만들어 보세요.</div>'; return; }
  container.innerHTML = lists.map(list => {
    const category = GIFT_CATEGORIES[list.category] || GIFT_CATEGORIES.birthday;
    const items = list.wishlist_items || [];
    const target = 'wishlist.html?owner=' + encodeURIComponent(auth.session.user.id) + '&list=' + encodeURIComponent(list.id) + '&from=my-page';
    const deadline = list.deadline_at ? list.deadline_at.replace(/-/g, '.') + ' 마감' : '마감일 없음';
    return '<article class="wishlist-collection"><a class="collection-main" href="' + target + '"><span class="collection-icon">' + category.icon + '</span><div><small>' + category.label + '</small><h3>' + escapeHtml(list.title) + '</h3><p>선물 ' + items.length + '개 · ' + deadline + '</p>' + (items.some(item => item.status === 'closed') ? '<span class="proof-alert">구매 인증 필요 ' + items.filter(item => item.status === 'closed').length + '개</span>' : '') + '</div><span>›</span></a><div class="collection-actions"><a class="button button-ghost" href="create.html?list=' + encodeURIComponent(list.id) + '">＋ 선물 추가</a><button type="button" class="button button-primary" data-share-list="' + list.id + '">공유하기</button></div></article>';
  }).join('');
  container.querySelectorAll('[data-share-list]').forEach(button => {
    const list = lists.find(item => item.id === button.dataset.shareList);
    button.addEventListener('click', () => shareWishlist(list.id, auth.session.user.id, list.title));
  });
}

// Refresh owner reminders when returning from a saved proof via browser back.
window.addEventListener('pageshow', event => {
  if (event.persisted && document.querySelector('[data-home-wishlist-status], [data-wishlist-collections], [data-owner-title], [data-participant-product]')) location.reload();
});

function getProductPurchaseUrl(product) {
  return 'https://www.coupang.com/';
}

// Operator partner ID: AF4761675. An ID is not an issued affiliate URL.
// Set only after the operator supplies a link generated by Coupang Partners.
const GIFTO_COUPANG_PARTNER_URL = 'https://link.coupang.com/a/g02Vps6BQ4';
function openProductPurchase(product) {
  let partnerUrl = '';
  try {
    const candidate = new URL(GIFTO_COUPANG_PARTNER_URL);
    if (candidate.protocol === 'https:' && candidate.hostname === 'link.coupang.com') partnerUrl = candidate.href;
  } catch {}
  const dialog = document.createElement('dialog'); dialog.className = 'wishlist-share-dialog';
  dialog.innerHTML = '<h2>상품 구매하기</h2><p data-purchase-copy></p><p>구매는 원하시는 쇼핑몰에서 자유롭게 하셔도 돼요. 다른 곳에서 구매해도 인증을 남길 수 있어요.</p><div class="wishlist-share-actions"><a class="button button-primary" data-purchase-go target="_blank" rel="noopener noreferrer"></a><button class="button button-ghost" type="button" data-purchase-close>닫기</button></div>';
  const disclosure = '이 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
  dialog.querySelector('[data-purchase-copy]').textContent = partnerUrl ? disclosure : '제휴 연결 준비 중 · 연결 후 적용될 안내: “' + disclosure + '” 현재 버튼은 일반 쿠팡 링크이며 제휴 수익이 발생하지 않습니다.';
  const go = dialog.querySelector('[data-purchase-go]');
  go.href = partnerUrl || getProductPurchaseUrl(product); go.textContent = '쿠팡으로 이동';
  go.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-purchase-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog); dialog.showModal();
}

function setupWishlistEditing() {
  const list = document.querySelector('[data-product-list][data-editable="true"]');
  if (!list) return;
  const removeRemoteProduct = async product => {
    if (product.hasContributions || product.supporters > 0 || product.raised > 0) {
      showToast('참여 또는 입금 확인 대기 건이 있는 상품은 삭제할 수 없어요.');
      return;
    }
    if (!confirm(product.name + '을(를) 삭제할까요?\n마지막 상품이면 리스트도 함께 삭제되고 공유 링크를 더 이상 사용할 수 없어요.')) return;
    try { if (await deleteEmptyProduct(product.dbId)) return; }
    catch (error) { showToast(error.message); return; }
    await hydrateMyRemoteWishlist();
    showToast('상품을 삭제했어요.');
  };
  list.querySelectorAll('.product-card').forEach((card, index) => {
    const product = appData.products[index];
    if (product.dbId) {
      const action = card.querySelector('.card-button');
      if (action) {
        action.href = 'participants.html?product=' + encodeURIComponent(product.id);
        action.textContent = '참여 보기';
        action.classList.remove('is-disabled'); action.hidden = false;
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
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'product-delete'; remove.textContent = '삭제'; remove.addEventListener('click', () => removeRemoteProduct(product));
        actions.append(edit, publish);
      } else if (status === 'open') {
        const editPhoto = document.createElement('button'); editPhoto.type = 'button'; editPhoto.className = 'product-edit'; editPhoto.textContent = '수정'; editPhoto.addEventListener('click', () => openProductEditor(product));
        const close = document.createElement('button'); close.type = 'button'; close.className = 'product-close'; close.textContent = '마감'; close.addEventListener('click', () => closeProduct(product));
        actions.append(editPhoto);
        actions.append(close);
      } else if (status === 'closed') {
        const purchase = document.createElement('a'); purchase.className = 'product-edit'; purchase.textContent = '상품 구매하기';
        purchase.href = getProductPurchaseUrl(product); purchase.target = '_blank'; purchase.rel = 'noopener noreferrer';
        purchase.setAttribute('aria-label', '상품 구매하기 (새 창)');
        purchase.addEventListener('click', event => { event.preventDefault(); openProductPurchase(product); });
        const proof = document.createElement('a'); proof.className = 'product-close product-proof-link'; proof.href = 'thankyou.html?product=' + encodeURIComponent(product.id); proof.textContent = '구매 인증하기';
        proof.classList.add('proof-needed');
        proof.setAttribute('aria-label', '구매 인증하기 — 아직 인증을 남기지 않았어요');
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'product-delete'; remove.textContent = '테스트 삭제';
        remove.addEventListener('click', async () => { try { await deleteClosedTestProduct(product); } catch (error) { showToast(error.message || '삭제하지 못했어요.'); } });
        actions.append(purchase, proof, remove);
      } else {
        const proof = document.createElement('a'); proof.className = 'product-edit product-proof-link'; proof.href = 'thankyou.html?product=' + encodeURIComponent(product.id); proof.textContent = '인증 수정';
        const share = document.createElement('button'); share.type = 'button'; share.className = 'product-close product-thanks-share'; share.textContent = '마음 전하기';
        share.addEventListener('click', () => window.giftoThanks.open(product.id, product.name, () => shareGiftThanks(product.id, product.name, product.proofMessage)));
        actions.append(proof, share);
      }
      card.append(actions);
      return;
    }
    const actions = document.createElement('div'); actions.className = 'product-actions';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'product-delete'; button.textContent = '삭제';
    button.addEventListener('click', () => {
      const product = appData.products[index];
      if (!confirm(product.name + '을(를) 삭제할까요?\n마지막 상품이면 리스트도 함께 삭제되고 공유 링크를 더 이상 사용할 수 없어요.')) return;
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
      if (action) { action.textContent = '참여 보기'; action.classList.remove('is-disabled'); }
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
  const photoOnly = !!(product.hasContributions || product.raised || product.supporters);
  const layer = document.createElement('div');
  layer.className = 'product-editor-layer';
  layer.innerHTML = `<section class="product-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
    <div class="product-editor-heading"><h2 id="product-editor-title">${photoOnly ? '상품 사진 수정' : '상품 수정'}</h2><button type="button" aria-label="닫기" data-close-editor>×</button></div>
    ${photoOnly ? `<p class="field-help">참여 기록이 있는 상품은 사진만 수정할 수 있어요.</p><div class="editor-product-summary"><strong>${escapeHtml(product.name)}</strong><span>${won(product.price)}</span></div>` : `<label class="field-label" for="edit-product-name">상품 이름</label><input id="edit-product-name" class="text-field" value="${escapeHtml(product.name)}" /><label class="field-label" for="edit-product-price">가격</label><input id="edit-product-price" class="text-field" inputmode="numeric" type="text" value="${Number(product.price) ? Number(product.price).toLocaleString('ko-KR') : ''}" placeholder="예: 100,000" />`}
    <label class="field-label">상품 사진 <span class="optional">선택</span></label><button type="button" class="photo-picker" data-editor-photo-picker>🖼 사진첩에서 고르기</button><input id="edit-product-photo" class="sr-only" type="file" accept="image/*" />
    <p class="field-help" data-editor-photo-status>새 사진을 선택하면 저장 전에 미리 볼 수 있어요.</p>
    <img class="product-photo-preview" data-editor-photo-preview ${pendingImage ? `src="${escapeHtml(pendingImage)}"` : ''} alt="상품 사진 미리보기" ${pendingImage ? '' : 'hidden'} />
    <button type="button" class="button button-ghost" data-remove-background ${pendingImage ? '' : 'hidden'}>배경 제거 미리보기</button><div class="background-preview" data-background-preview hidden><img alt="배경 제거 결과" /><div><button type="button" data-apply-background>적용</button><button type="button" data-cancel-background>원본 유지</button></div></div>
    <button type="button" class="button button-primary" data-save-product>${photoOnly ? '사진 저장' : '수정 저장'}</button>
    ${product.dbId && !photoOnly ? '<button type="button" class="editor-delete" data-delete-product>이 상품 삭제</button>' : ''}
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
    if (!confirm(product.name + '을(를) 삭제할까요?\n마지막 상품이면 리스트도 함께 삭제되고 공유 링크를 더 이상 사용할 수 없어요.')) return;
    const remove = layer.querySelector('[data-delete-product]'); remove.disabled = true; remove.textContent = '삭제 중…';
    try { if (await deleteEmptyProduct(product.dbId)) return; }
    catch (error) { remove.disabled = false; remove.textContent = '이 상품 삭제'; showToast(error.message); return; }
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
  if (!confirm('공개를 시작할까요? 참여 기록이 생기면 삭제가 제한돼요.')) return;
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
async function shareGiftThanks(itemId, name, message = '') {
  const path = 'pages/thankyou.html?product=' + encodeURIComponent(itemId);
  const url = window.giftoPublicUrl ? window.giftoPublicUrl(path) : new URL(path.slice(6), location.href).href;
  const text = `${name} 선물이 도착했어요 🎁\n${message.trim()}\n${url}`;
  if (window.giftoNative?.isNative) {
    try { await window.giftoNative.share({title:'GIFTO 선물 인증', text, url}); }
    catch { showToast('공유를 완료하지 못했어요. 다시 시도해 주세요.'); }
    return;
  }
  if (navigator.share) {
    try { await navigator.share({title:'GIFTO 선물 인증', text, url}); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); showToast('감사 메시지와 링크를 복사했어요. 카카오톡에 붙여넣어 주세요.'); }
  catch { showToast('감사 링크를 복사하지 못했어요. 다시 시도해 주세요.'); }
}
function setupProofBack(item, owner) {
  const back = document.querySelector('.topbar .back');
  if (!back) return;
  const fallback = new URL('wishlist.html', location.href);
  fallback.searchParams.set('owner', owner || '');
  fallback.searchParams.set('list', item.wishlist_id);
  back.href = fallback.href;
  try {
    const previous = new URL(document.referrer);
    const allowed = ['wishlist.html', 'participants.html'].map(page => new URL(page, location.href).pathname);
    if (previous.origin !== location.origin || !allowed.includes(previous.pathname)) return;
    back.href = previous.href;
    back.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      if (history.length > 1) { event.preventDefault(); history.back(); }
    });
  } catch {}
}
async function setupThankYou() {
  const upload = document.querySelector('[data-photo-upload]');
  if (!upload || !window.giftoDb) return;
  const itemId = new URLSearchParams(location.search).get('product');
  if (!isUuid(itemId)) { upload.closest('.thankyou').innerHTML = '<div class="empty-state">인증할 상품을 찾지 못했어요.</div>'; return; }
  const [{data:item}, {data:auth}] = await Promise.all([
    window.giftoDb.from('wishlist_items').select('*').eq('id', itemId).single(),
    window.giftoDb.auth.getSession()
  ]);
  if (!item) { upload.closest('.thankyou').innerHTML = '<div class="empty-state">선물 인증을 불러오지 못했어요.</div>'; return; }
  const {data:list} = await window.giftoDb.from('wishlists').select('owner_id').eq('id', item.wishlist_id).single();
  setupProofBack(item, list?.owner_id);
  const isOwner = !!auth.session && list?.owner_id === auth.session.user.id;
  const storedPhotos = (Array.isArray(item.proof_image_urls) && item.proof_image_urls.length ? item.proof_image_urls : item.proof_image_url ? [item.proof_image_url] : []).slice(0, 5);
  if (!isOwner) {
    if (item.status !== 'proof_posted') { upload.closest('.thankyou').innerHTML = '<div class="empty-state">아직 선물 인증을 준비하고 있어요.</div>'; return; }
    upload.closest('.thankyou').innerHTML = `<p class="eyebrow">GIFT STORY</p><h1>${escapeHtml(item.name)}</h1><div class="proof-photo-gallery">${storedPhotos.map((url, index) => `<img class="proof-image" src="${escapeHtml(url)}" alt="선물 인증 사진 ${index + 1}" />`).join('')}</div><div class="thanks-preview"><div class="avatar avatar-blue">G</div><div><strong>함께해 준 마음에 감사해요</strong><p>${escapeHtml(item.proof_message || '')}</p></div></div>`;
    return;
  }
  if (!['closed', 'proof_posted'].includes(item.status)) { upload.closest('.thankyou').innerHTML = '<div class="empty-state">마감한 내 상품에서만 선물 인증을 남길 수 있어요.</div>'; return; }
  document.querySelector('[data-thankyou-product]').textContent = item.name;
  const message = document.querySelector('#thanks');
  message.value = item.proof_message || '';
  message.placeholder = '선물 후기나 감사 인사를 남겨 주세요.';
  const file = document.querySelector('#thanks-photo');
  const camera = document.querySelector('#thanks-camera');
  const previewPhoto = document.querySelector('[data-thanks-photo-preview]');
  const photoStatus = document.querySelector('[data-thanks-photo-status]');
  let photos = [...storedPhotos];
  let photoBusy = false;
  const refreshPhoto = () => {
    upload.classList.toggle('uploaded', photos.length > 0);
    upload.querySelector('span').textContent = photos.length ? '✓' : '🎁';
    upload.hidden = photos.length > 0;
    upload.querySelector('strong').textContent = '선물 사진을 남겨 보세요';
    previewPhoto.hidden = !photos.length;
    previewPhoto.innerHTML = photos.map((url, index) => `<figure><img class="proof-image" src="${escapeHtml(url)}" alt="선물 사진 ${index + 1}" /><button type="button" data-remove-proof="${index}" aria-label="사진 ${index + 1} 삭제">사진 삭제</button></figure>`).join('');
    previewPhoto.querySelectorAll('[data-remove-proof]').forEach(button => button.addEventListener('click', () => {
      if (photoBusy) return;
      photos.splice(Number(button.dataset.removeProof), 1); refreshPhoto();
      photoStatus.textContent = '사진을 삭제했어요. 저장하면 반영돼요.';
    }));
    for (const button of [upload, document.querySelector('[data-thanks-choose]'), document.querySelector('[data-thanks-camera]')]) button.disabled = photoBusy || photos.length >= 5;
  };
  refreshPhoto();
  upload.addEventListener('click', () => file.click());
  document.querySelector('[data-thanks-choose]').addEventListener('click', () => file.click());
  document.querySelector('[data-thanks-camera]').addEventListener('click', () => camera.click());
  const choosePhoto = async event => {
    const input = event.currentTarget;
    const chosen = [...input.files]; if (!chosen.length || photoBusy) return;
    if (chosen.length > 5 - photos.length) { showToast(`최대 5장까지 가능해요. ${5 - photos.length}장 더 선택할 수 있어요.`); input.value = ''; return; }
    photoBusy = true;
    refreshPhoto();
    photoStatus.textContent = '사진 크기를 줄이고 있어요…';
    try {
      const added = [];
      for (const selected of chosen) { const result = await compressProductPhoto(selected); added.push(result.url); }
      photos.push(...added); photoStatus.textContent = photos.length === 5 ? '사진이 모두 준비됐어요. 바꾸려면 사진을 삭제해 주세요.' : '최대 5장 · 사진은 원본 비율을 유지해 저장해요.';
    }
    catch (error) { photoStatus.textContent = error.message || '사진을 읽지 못했어요.'; }
    finally { photoBusy = false; input.value = ''; refreshPhoto(); }
  };
  file.addEventListener('change', choosePhoto);
  camera.addEventListener('change', choosePhoto);
  const save = document.querySelector('[data-thanks-submit]');
  const share = document.querySelector('[data-thanks-share]');
  if (item.status === 'proof_posted' && share) share.hidden = false;
  const shareThanks = async () => {
    window.giftoThanks.open(item.id, item.name, () => shareGiftThanks(item.id, item.name, message.value));
  };
  share?.addEventListener('click', shareThanks);
  save.addEventListener('click', async () => {
    if (photoBusy) { showToast('사진 처리가 끝나면 저장해 주세요.'); return; }
    const text = message.value.trim();
    if (!photos.length && !text) { showToast('사진 또는 감사 인사를 남겨 주세요.'); return; }
    save.disabled = true; save.textContent = '인증 저장 중…';
    const {data: savedProof, error} = await window.giftoDb.from('wishlist_items').update({status:'proof_posted', proof_image_url:photos[0] || '', proof_image_urls:photos, proof_message:text, proof_published_at:new Date().toISOString()}).eq('id', item.id).select('id').maybeSingle();
    if (error?.code === 'PGRST204' || error?.code === '42703') { save.disabled = false; save.textContent = '인증 저장'; showToast('사진 5장 저장용 SQL 업데이트가 필요해요. 작성 내용은 유지돼요.'); return; }
    if (error || !savedProof) { save.disabled = false; save.textContent = '인증 저장'; showToast('인증을 저장하지 못했어요.'); return; }
    clearRemoteWishlist(auth.session.user.id);
    const {count} = await window.giftoDb.from('contributions').select('id', {count:'exact', head:true}).eq('item_id', item.id).eq('status', 'confirmed');
    const preview = document.querySelector('.thanks-preview');
    preview.hidden = false; preview.querySelector('strong').textContent = item.name + ' 선물 인증'; preview.querySelector('p').textContent = text; preview.querySelector('span').textContent = `함께해 준 ${count || 0}명에게 감사 링크를 보낼 수 있어요.`;
    save.disabled = false; save.textContent = '수정 저장';
    if (share) share.hidden = false;
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
    const {data: auth} = await window.giftoDb.auth.getSession();
    const {data: item, error: itemError} = await window.giftoDb.from('wishlist_items').select('*').eq('id', id).maybeSingle();
    if (itemError) throw itemError;
    if (!item) throw new Error('ITEM_NOT_FOUND');
    // Render the item independently of optional profile/list metadata.
    document.querySelector('[data-participant-product]').textContent = item.name;
    const {data: wishlist, error: listError} = await window.giftoDb.from('wishlists').select('owner_id').eq('id', item.wishlist_id).single();
    if (listError) throw listError;
    const wishlistOwner = wishlist.owner_id;
    const {data: entries, error: entriesError} = await window.giftoDb.from('contributions').select('*').eq('item_id', id);
    if (entriesError) throw entriesError;
    const product = {...item, dbId:item.id, imageUrl:item.image_url, allContributions:entries};
    const contributions = (product.allContributions || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const confirmed = contributions.filter(entry => entry.status === 'confirmed');
    const raised = Number(product.raised_amount ?? confirmed.reduce((sum, entry) => sum + entry.amount, 0));
    product.raised = raised; product.pending = product.pending_amount == null ? null : Number(product.pending_amount);
    const percent = product.price ? Math.round(raised / product.price * 100) : 0;
    document.querySelector('[data-participant-product]').textContent = product.name;
    document.querySelector('[data-participant-total]').textContent = won(raised);
    document.querySelector('[data-participant-count]').textContent = confirmed.length + '명 참여';
    const card = document.querySelector('[data-participant-card]');
    if (card) card.innerHTML = `<div class="participant-product-image" style="--image-bg:${escapeHtml(product.color || '#f2f7ff')}">${escapeHtml(product.emoji || '🎁')}${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />` : ''}</div><div><p>선물 목표 금액</p><strong>${won(product.price)}</strong><span>${won(raised)} 모임 · ${percent}% 달성</span><div class="progress"><i style="width:${Math.min(percent, 100)}%"></i></div></div>`;
    view.innerHTML = contributions.length ? contributions.map(entry => {
      const confirmedDate = entry.confirmed_at ? new Date(entry.confirmed_at) : null;
      const dateLabel = confirmedDate && !Number.isNaN(confirmedDate.getTime()) ? (confirmedDate.getMonth() + 1) + '월 ' + confirmedDate.getDate() + '일 확인' : '확인 완료';
      const state = entry.status === 'cancelled' ? '<em class="contribution-pending">입금 미확인 · 거절됨</em>' : entry.status === 'pending' ? '<em class="contribution-pending">입금 확인 대기</em>' : '<em class="contribution-confirmed">' + dateLabel + '</em>';
      return '<li data-contribution-id="' + escapeHtml(entry.id) + '"><span class="contributor-avatar">' + escapeHtml(entry.contributor_name).slice(0,1) + '</span><strong>' + escapeHtml(entry.contributor_name) + '</strong><span>' + won(entry.amount) + '</span>' + state + '</li>';
    }).join('') : '<li class="empty-contributors">아직 함께한 친구가 없어요.</li>';
    const deleteButton = document.querySelector('[data-participant-delete]');
    if (auth?.session?.user?.id === wishlistOwner) await window.giftoThanks?.decorate(view, item, contributions);
    document.querySelector('[data-participant-proof-alert]')?.remove();
    if (auth?.session?.user?.id === wishlistOwner && item.status === 'closed') {
      const notice = document.createElement('a'); notice.dataset.participantProofAlert = '';
      notice.className = 'button button-ghost proof-reminder'; notice.textContent = '● 구매 인증이 필요해요 · 인증하러 가기';
      notice.href = 'thankyou.html?product=' + encodeURIComponent(item.id);
      deleteButton?.before(notice);
    }
    const canDelete = auth?.session?.user?.id === wishlistOwner && contributions.length === 0 && !Number(product.raised_amount);
    if (deleteButton && canDelete) {
      deleteButton.hidden = false;
      deleteButton.addEventListener('click', async () => {
        if (!confirm(product.name + '을(를) 삭제할까요?\n마지막 상품이면 리스트도 함께 삭제되고 공유 링크를 더 이상 사용할 수 없어요.')) return;
        deleteButton.disabled = true; deleteButton.textContent = '삭제 중…';
        try { if (await deleteEmptyProduct(product.dbId)) return; }
        catch (error) { deleteButton.disabled = false; deleteButton.textContent = '이 상품 삭제'; showToast(error.message); return; }
        location.replace('my-page.html');
      });
    }
    if (page) page.hidden = false;
  } catch (error) {
    console.error('GIFTO participants failed to load', error);
    const missing = error.message === 'ITEM_NOT_FOUND';
    if (missing) document.querySelector('[data-participant-product]').textContent = '상품을 찾을 수 없어요';
    document.querySelector('.participants-summary').hidden = true;
    document.querySelector('[data-participant-delete]').hidden = true;
    view.innerHTML = '<li class="empty-contributors">' + (missing ? '삭제되었거나 현재 계정에서 볼 수 없는 상품이에요. 마이페이지에서 목록을 다시 확인해 주세요.' : '참여 내역을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.') + '</li>';
    if (page) page.hidden = false;
  }
}

function setupRejectContributions(section, owner, refresh) {
  section.querySelectorAll('[data-confirm-pending]').forEach(accept => {
    const reject = document.createElement('button'); reject.type = 'button';
    reject.className = 'reject-contribution'; reject.textContent = '거절하기';
    reject.onclick = async () => {
      if (!confirm('실제 입금이 확인되지 않은 내역인가요? 거절하면 보낸 사람에게도 거절 상태로 표시돼요.')) return;
      reject.disabled = true; accept.disabled = true;
      const {error} = await window.giftoDb.rpc('decide_gift_contribution', {p_id:accept.dataset.confirmPending, p_accept:false});
      if (error) { reject.disabled = false; accept.disabled = false; showToast('처리하지 못했어요. 이미 확인된 내역인지 확인해 주세요.'); return; }
      announceContributionChange(owner); await refresh(); showToast('입금 미확인으로 거절했어요.');
    };
    accept.after(reject);
  });
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
    const {data: lists, error: listError} = await window.giftoDb.from('wishlists').select('id').eq('owner_id', auth.session.user.id);
    if (listError) throw listError;
    const allLists = await Promise.all((lists || []).map(list => loadRemoteWishlist(auth.session.user.id, list.id)));
    const items = allLists.flatMap(list => list.products);
    const itemById = new Map(items.map(item => [item.id, item]));
    const rows = items.flatMap(item => (item.allContributions || [])
      .filter(entry => entry.status === 'pending')
      .map(entry => ({...entry, item_id:item.id})));
    if (!rows.length) { section.hidden = true; badge?.setAttribute('hidden', ''); return; }
    section.hidden = false;
    badge?.removeAttribute('hidden');
    if (badge) badge.textContent = String(rows.length);
    section.innerHTML = `<div class="section-heading"><div><p class="eyebrow">입금 확인</p><h2>확인할 송금 <span class="count">${rows.length}</span></h2></div></div><p class="settings-copy">실제 입금을 확인한 뒤 ‘받았어요’를 눌러 주세요.</p><ul class="pending-confirmation-list">${rows.map(row => { const item = itemById.get(row.item_id); return `<li><span class="contributor-avatar">${escapeHtml(row.contributor_name).slice(0,1)}</span><div><strong>${escapeHtml(row.contributor_name)}님이 ${escapeHtml(item?.name || '선물')}에 함께했어요</strong><small>${won(row.amount)} · 입금 확인 대기</small></div><button type="button" class="confirm-contribution" data-confirm-pending="${row.id}">받았어요</button></li>`; }).join('')}</ul>`;
    setupRejectContributions(section, auth.session.user.id, render);
    section.querySelectorAll('[data-confirm-pending]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = '확인 중…';
      const {error} = await window.giftoDb.rpc('decide_gift_contribution', {p_id:button.dataset.confirmPending, p_accept:true});
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
  setupRejectContributions(section, owner, () => hydrateMyRemoteWishlist());
  section.querySelectorAll('[data-confirm-pending]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = '확인 중…';
    const {error} = await window.giftoDb.rpc('decide_gift_contribution', {p_id:button.dataset.confirmPending, p_accept:true});
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
  } catch (error) {
    appData.products = [];
    localStorage.removeItem('gifto-home-wishlist-status');
    list.innerHTML = '<p class="empty-state">위시리스트를 불러오지 못했어요. 다시 로그인한 뒤 확인해 주세요.</p>';
    console.error('GIFTO my wishlist failed to load', error);
  }
}
async function setupPublicProfile() {
  if (!document.querySelector('[data-owner-title]')) return;
  // Keep the explicit entry point even after refresh or a failed data load.
  const back = document.querySelector('.topbar .back');
  if (back && new URLSearchParams(location.search).get('from') === 'my-page') back.href = 'my-page.html';
  const avatar = document.querySelector('[data-owner-avatar]');
  try {
    const {data, error} = await window.giftoDb.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    const isMine = !!user && (!ownerId || ownerId === user.id);
    let profile;
    let ownerView = false;
    let details = {};
    const resolvedOwner = ownerId || user?.id;
    const remote = await loadRemoteWishlist(resolvedOwner);
    profile = remote.profile;
    details = remote.wishlist;
    activeProfile.products = remote.products;
    appData.products = remote.products;
    ownerView = user?.id === resolvedOwner;
    const list = document.querySelector('[data-product-list]');
    if (ownerView) {
      if (back) back.href = 'my-page.html';
      list.dataset.public = 'false'; list.dataset.editable = 'true';
      const controls = document.querySelector('[data-list-owner-actions]');
      controls.hidden = false;
      controls.querySelector('[data-list-add]').href = 'create.html?list=' + encodeURIComponent(remote.wishlist.id);
      controls.querySelector('[data-list-share]').onclick = () => shareWishlist(remote.wishlist.id, resolvedOwner, remote.wishlist.title);
    }
    const name = profile.display_name || 'GIFTO 사용자';
    activeProfile.name = name;
    activeProfile.paymentInfo = {kakaoQr:profile.kakao_pay_qr_url || '', kakaoUrl:profile.kakao_pay_url || ''};
    renderProfileAvatar(avatar, profile.avatar_url, name, ownerView ? data.session : null);
    const title = details.title || name + '의 생일 선물';
    document.title = title + ' | GIFTO';
    const category = GIFT_CATEGORIES[details.category] || GIFT_CATEGORIES.birthday;
    const deadlineText = details.deadline_at ? ` · ${new Date(details.deadline_at + 'T00:00:00').getMonth() + 1}월 ${new Date(details.deadline_at + 'T00:00:00').getDate()}일 마감` : '';
    document.querySelector('[data-owner-countdown]').textContent = `${name}님의 ${category.label}${deadlineText}`;
    document.querySelector('[data-owner-title]').textContent = title;
    document.querySelector('[data-owner-copy]').textContent = details.note ?? '생일에 받고 싶은 선물을 모아봤어요. 함께해 주는 마음만으로도 고마워요 🎁';
    renderProducts();
    if (ownerView) {
      setupWishlistEditing();
      document.querySelectorAll('[data-public="true"] .card-button').forEach((button, index) => {
        const product = activeProfile.products[index];
        button.textContent = '참여 보기';
        button.href = 'participants.html?product=' + encodeURIComponent(product.id);
      });
    }
  } catch (error) {
    const missing = error.message === 'WISHLIST_NOT_FOUND';
    avatar.textContent = 'G';
    document.querySelector('[data-owner-title]').textContent = missing ? '삭제되었거나 볼 수 없는 리스트예요' : '위시리스트를 불러오지 못했어요';
    document.querySelector('[data-owner-countdown]').textContent = '';
    document.querySelector('[data-owner-copy]').textContent = missing ? '리스트가 삭제되었거나 공개가 종료되었어요. 보낸 분에게 새 링크를 요청해 주세요.' : ownerId ? '공유 링크를 확인한 뒤 다시 열어 주세요.' : '로그인 후 내 위시리스트를 확인해 주세요.';
    if (missing) {
      activeProfile.products = []; appData.products = [];
      document.querySelector('[data-list-owner-actions]').hidden = true;
      document.querySelector('[data-product-list]').innerHTML = '';
    }
  }
  document.querySelector('.wish-hero').nextElementSibling.querySelector('.count').textContent = (ownerId ? activeProfile.products : appData.products).length;
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
async function requireWishlistPaymentSetup(userId) {
  const {data: profile, error} = await window.giftoDb.from('profiles').select('kakao_pay_qr_url').eq('id', userId).maybeSingle();
  if (error) throw new Error('송금 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  if (!profile?.kakao_pay_qr_url?.trim()) throw new Error('새 리스트를 만들려면 카카오페이 송금 QR을 먼저 등록해 주세요.');
}

async function setupCreateWishlist() {
  const saveAction = document.querySelector('[data-save-wishlist]');
  if (!saveAction) return;
  const targetListId = new URLSearchParams(location.search).get('list');
  if (!targetListId) {
    const formPage = document.querySelector('.form-page');
    formPage.inert = true;
    saveAction.textContent = '송금 설정 확인 중…';
    try {
      const {data, error} = await window.giftoDb.auth.getSession();
      if (error) throw new Error('로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.');
      if (!data.session) { location.href = 'login.html?next=create.html'; return; }
      await requireWishlistPaymentSetup(data.session.user.id);
      saveAction.innerHTML = '저장하고 공유 페이지 보기 <span>→</span>';
    } catch (error) {
      formPage.innerHTML = '<h1>송금 설정을 먼저 확인해 주세요</h1><p class="form-description">' + escapeHtml(error.message) + '</p><a class="button button-primary" href="my-page.html#payment-settings">카카오페이 송금 설정하기</a><a class="button button-ghost" href="create.html">다시 확인하기</a>';
      return;
    } finally { formPage.inert = false; }
  }
  let savedList = null;
  let initialLoadError = null;
  appData.products = [];
  const getCategory = setupWishlistCategory();
  const addPanel = document.querySelector('.add-product-panel');
  const deadlineField = document.createElement('div');
  deadlineField.innerHTML = '<label class="field-label" for="list-deadline">마감일 <span class="optional">선택</span></label><input id="list-deadline" class="text-field" type="date" /><p class="field-help">비워두면 마감일 없이 진행해요. 설정하면 공유 페이지에 함께 보여요.</p>';
  addPanel?.before(deadlineField);
  const deadline = deadlineField.querySelector('#list-deadline');
  deadline.min = new Date().toISOString().slice(0, 10);
  let selectedEmoji = '🎁';
  let uploadedPhoto = '';
  let photoBusy = false;
  const updatePhotoButtons = () => { saveAction.setAttribute('aria-disabled', String(photoBusy)); removeBackground.disabled = photoBusy; };
  let photoVersion = 0;
  const photoInput = document.querySelector('#new-product-photo');
  const photoPreview = document.querySelector('[data-product-photo-preview]');
  const photoStatus = document.querySelector('[data-photo-status]');
  const removePhoto = document.querySelector('[data-remove-product-photo]');
  const syncPhotoIcon = () => {
    document.querySelectorAll('[data-emoji]').forEach(button => {
      button.disabled = !!uploadedPhoto;
      button.classList.toggle('selected', !uploadedPhoto && button.dataset.emoji === selectedEmoji);
      button.setAttribute('aria-pressed', String(!uploadedPhoto && button.dataset.emoji === selectedEmoji));
    });
  };
  const removeBackground = document.createElement('button');
  removeBackground.type = 'button'; removeBackground.className = 'button button-ghost';
  removeBackground.textContent = '배경 지우기'; removeBackground.hidden = true;
  removeBackground.dataset.newRemoveBackground = '';
  removePhoto.before(removeBackground);
  const backgroundPreview = document.createElement('div');
  backgroundPreview.className = 'background-preview'; backgroundPreview.hidden = true;
  backgroundPreview.innerHTML = '<img alt="배경 제거 결과" /><div><button type="button" data-apply-new-background>적용</button><button type="button" data-keep-new-original>원본 유지</button></div>';
  removeBackground.after(backgroundPreview);
  let processedPhoto = '';
  const resetBackground = () => {
    processedPhoto = ''; backgroundPreview.hidden = true;
    backgroundPreview.querySelector('img').removeAttribute('src');
    removeBackground.textContent = '배경 지우기'; removeBackground.hidden = true;
  };
  removeBackground.addEventListener('click', async () => {
    if (!uploadedPhoto || photoBusy) return;
    const version = photoVersion;
    photoBusy = true; updatePhotoButtons(); removeBackground.textContent = '배경을 지우는 중…';
    try {
      const image = await removeProductBackground(uploadedPhoto);
      if (version !== photoVersion) return;
      processedPhoto = image; backgroundPreview.querySelector('img').src = image;
      backgroundPreview.hidden = false;
      photoStatus.textContent = '배경 제거 결과를 확인하고 적용해 주세요.';
    } catch (error) {
      if (version === photoVersion) photoStatus.textContent = error.message || '배경을 지우지 못했어요. 원본 사진은 유지돼요.';
    } finally {
      if (version === photoVersion) { photoBusy = false; updatePhotoButtons(); removeBackground.textContent = '배경 지우기'; }
    }
  });
  backgroundPreview.querySelector('[data-apply-new-background]').addEventListener('click', () => {
    if (!processedPhoto) return;
    uploadedPhoto = processedPhoto; photoPreview.src = uploadedPhoto;
    backgroundPreview.hidden = true; processedPhoto = '';
    photoStatus.textContent = '배경을 지운 사진을 적용했어요.';
  });
  backgroundPreview.querySelector('[data-keep-new-original]').addEventListener('click', () => {
    backgroundPreview.hidden = true; processedPhoto = '';
    photoStatus.textContent = '원본 사진을 유지했어요.';
  });
  document.querySelector('[data-new-photo-picker]').addEventListener('click', () => photoInput.click());
  const clearPhoto = () => {
    photoVersion += 1; uploadedPhoto = ''; photoInput.value = '';
    syncPhotoIcon();
    resetBackground(); photoBusy = false; updatePhotoButtons();
    photoPreview.hidden = true; photoPreview.removeAttribute('src'); removePhoto.hidden = true;
    photoStatus.textContent = 'JPG·PNG·WebP 사진을 올려 주세요. 크기와 용량을 자동으로 줄여요.';
  };
  removePhoto.addEventListener('click', clearPhoto);
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    const version = ++photoVersion;
    resetBackground();
    uploadedPhoto = ''; photoPreview.hidden = true; removePhoto.hidden = true;
    photoBusy = true; updatePhotoButtons(); photoStatus.textContent = '사진 크기를 줄이고 있어요…';
    try {
      const result = await compressProductPhoto(file);
      if (version !== photoVersion) return;
      uploadedPhoto = result.url; photoPreview.src = uploadedPhoto; photoPreview.hidden = false; removePhoto.hidden = false;
      syncPhotoIcon();
      removeBackground.hidden = false;
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
  const initialWishlistLoad = (async () => {
    const {data: auth} = await window.giftoDb.auth.getSession();
    if (!auth.session) return;
    if (!targetListId) {
      const {data: profile} = await window.giftoDb.from('profiles').select('display_name').eq('id', auth.session.user.id).maybeSingle();
      const title = document.querySelector('#list-title');
      if (!title.dataset.userEdited) title.value = new Date().getFullYear() + ' ' + (profile?.display_name || '나') + '의 ' + GIFT_CATEGORIES[getCategory()].label;
      return;
    }
    try {
      const remote = await loadRemoteWishlist(auth.session.user.id, targetListId);
      savedList = remote.wishlist;
      document.querySelector('.page-title').textContent = '선물 추가';
      document.querySelector('.form-page h1').textContent = '이 리스트에 선물 추가';
      document.querySelector('.form-description').textContent = savedList.title + '에 담을 선물을 입력해 주세요.';
      document.querySelector('#list-title').value = savedList.title;
      document.querySelector('#list-note').value = savedList.note || '';
      deadline.value = savedList.deadline_at || '';
      for (const field of [document.querySelector('#list-title'), document.querySelector('#list-note'), deadline]) field.disabled = true;
      document.querySelector('[data-category-picker]').hidden = true;
      document.querySelector('[data-save-wishlist]').textContent = '이 리스트에 저장하기';
      document.querySelector('.topbar .back').href = 'wishlist.html?owner=' + auth.session.user.id + '&list=' + targetListId;
    } catch (error) {
      initialLoadError = error;
      document.querySelector('.form-description').textContent = '추가할 리스트를 불러오지 못했어요. 마이페이지에서 다시 선택해 주세요.';
    }
  })();
  document.querySelectorAll('[data-emoji]').forEach(button => button.addEventListener('click', () => {
    if (uploadedPhoto) return;
    document.querySelectorAll('[data-emoji]').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected'); selectedEmoji = button.dataset.emoji;
  }));
  document.querySelector('[data-save-wishlist]').addEventListener('click', async event => {
    event.preventDefault();
    const saveButton = event.currentTarget;
    if (saveButton.classList.contains('is-disabled')) return;
    if (photoBusy) { showToast('사진 처리가 끝나면 저장해 주세요.'); return; }
    const saveLabel = saveButton.innerHTML;
    saveButton.classList.add('is-disabled'); saveButton.textContent = '저장 중…';
    try {
      await initialWishlistLoad;
      if (initialLoadError) throw initialLoadError;
      // Include the visible product form even when the intermediate add button
      // was skipped. Never silently save a list without the entered product.
      if (name.value.trim() || price.value.trim() || uploadedPhoto) {
        const productName = name.value.trim(); const productPrice = parseMoney(price.value);
        if (!productName || productPrice <= 0) throw new Error('상품 이름과 가격을 입력해 주세요.');
        appData.products.push({id:`custom-${Date.now()}`, name:productName, price:productPrice,
          raised:0, supporters:0, emoji:uploadedPhoto ? '' : selectedEmoji,
          color:'#f2f7ff', imageUrl:uploadedPhoto, productUrl:''});
        name.value = ''; price.value = ''; clearPhoto(); showDrafts();
      }
      if (!appData.products.length) throw new Error('저장할 상품을 하나 이상 입력해 주세요.');
      const {data, error} = await window.giftoDb.auth.getSession();
      if (error || !data.session) { location.href = 'login.html'; return; }
      // Recheck the saved profile immediately before creating a new list.
      if (!targetListId && !savedList) await requireWishlistPaymentSetup(data.session.user.id);
      if (targetListId && !savedList) throw new Error('추가할 리스트를 다시 선택해 주세요.');
      const details = {title:document.querySelector('#list-title').value.trim(), note:document.querySelector('#list-note').value.trim(), category:getCategory(), deadlineAt:deadline.value || null};
      localStorage.setItem('gifto-wishlist-details:' + data.session.user.id, JSON.stringify(details));
      if (!savedList) {
        const {data: created, error: createError} = await window.giftoDb.from('wishlists').insert({
          owner_id:data.session.user.id, title:details.title || GIFT_CATEGORIES[details.category].title,
          note:details.note, category:details.category, deadline_at:details.deadlineAt, is_public:true
        }).select('*').single();
        if (createError) throw createError;
        savedList = created;
      }
      const wishlist = savedList;
      const drafts = appData.products.filter(product => !product.dbId);
      if (drafts.length) {
        const {data: added, error: itemError} = await window.giftoDb.from('wishlist_items').insert(drafts.map((product, position) => ({
          wishlist_id:wishlist.id, name:product.name, price:product.price, product_url:product.productUrl || null,
          image_url:product.imageUrl || null, emoji:product.imageUrl ? '' : (product.emoji || '🎁'), color:product.color || '#f2f7ff', position,
          status:'open', shared_at:new Date().toISOString()
        }))).select('id,name,price,product_url,image_url,emoji,color,position');
        if (itemError) throw itemError;
        appData.products = appData.products.filter(product => product.dbId).concat((added || []).map(product => ({...product, dbId:product.id, raised:0, supporters:0, contributors:[]})));
      }
      saveProducts(appData.products);
      localStorage.setItem('gifto-wishlist-details:' + data.session.user.id, JSON.stringify(details));
      clearRemoteWishlist(data.session.user.id);
      const saved = await loadRemoteWishlist(data.session.user.id, wishlist.id);
      const savedIds = new Set(saved.products.map(product => product.id));
      if (appData.products.some(product => product.dbId && !savedIds.has(product.dbId))) {
        throw new Error('상품 저장 후 목록을 확인하지 못했어요. 다시 저장해 주세요.');
      }
      location.href = `wishlist.html?owner=${encodeURIComponent(data.session.user.id)}&list=${encodeURIComponent(wishlist.id)}`;
    } catch (error) { showToast(error.message || '저장하지 못했어요. 연결 상태를 확인해 주세요.'); }
    finally { saveButton.classList.remove('is-disabled'); saveButton.innerHTML = saveLabel; }
  });
}
async function compressProductPhoto(file) {
  const supportedType = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type);
  const unnamedType = !file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
  if (!supportedType && !unnamedType) throw new Error('JPG, PNG, WebP 또는 휴대폰 사진을 선택해 주세요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하 사진을 선택해 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('이 기기에서 사진을 읽지 못했어요. JPG 또는 PNG로 바꿔 선택해 주세요.')); img.src = url; });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('사진 크기를 읽지 못했어요.');
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
setupMemberOnlyPage(); setupMyWishlistCollections(); setupFriendList(); setupPublicProfile(); renderProducts(); setupWishlistEditing(); setupContribution(); setupParticipants(); setupPaymentSettings(); setupBirthdaySettings(); setupDisplayName(); setupProfileAvatar(); setupProfileEdit(); setupPendingConfirmations(); setupHomePendingBadge(); setupCreateWishlist(); setupPaymentReturn(); setupKakaoLogin(); hydrateMyRemoteWishlist(); setupHomeWishlistStatus();
setupThankYou().catch(error => {
  console.error('GIFTO proof setup failed', error);
  const section = document.querySelector('.thankyou');
  if (section) section.innerHTML = '<p class="empty-state">선물 인증 화면을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.</p>';
});
contributionChannel?.addEventListener('message', event => {
  if (!['contribution-confirmed', 'profile-updated'].includes(event.data?.type)) return;
  if (ownerId && event.data.owner === ownerId) setupPublicProfile();
  hydrateMyRemoteWishlist();
});
