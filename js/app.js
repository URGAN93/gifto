/*
 * Demo data is intentionally centralized. Replace this object with an API/JSON
 * repository later (for example: services/wishlist-service.js + Supabase calls).
 */
const DEFAULT_PRODUCTS = [
    { id: 'airpods', name: 'AirPods Pro', price: 359000, raised: 190000, supporters: 6, emoji: '🎧', color: '#eef5ff' },
    { id: 'watch', name: 'Galaxy Watch', price: 329000, raised: 120000, supporters: 4, emoji: '⌚', color: '#f4f0ff' },
    { id: 'shoes', name: 'Nike 운동화', price: 159000, raised: 75000, supporters: 3, emoji: '👟', color: '#fff4ed' }
];
/* No-account mode keeps data in this browser only. A Supabase repository can
 * later replace these two functions without changing the page renderers. */
const storageKey = 'gifto-no-account-wishlist';
const getProducts = () => { try { return JSON.parse(localStorage.getItem(storageKey)) || DEFAULT_PRODUCTS; } catch { return DEFAULT_PRODUCTS; } };
const saveProducts = products => localStorage.setItem(storageKey, JSON.stringify(products));
const appData = { products: getProducts() };
/* Public profile data: separate owners prevent every birthday card opening
 * the current user's wishlist. This maps directly to future profile tables. */
const sharedProfiles = {
  seongmin: { name: '심성민', initial: 'S', countdown: 'D-12', avatar: 'avatar-blue', products: appData.products },
  jiyoon: { name: '지윤', initial: 'J', countdown: 'D-4', avatar: 'avatar-peach', products: [
    { id: 'jiyoon-bag', name: 'COS 미니 크로스백', price: 135000, raised: 80000, supporters: 3, emoji: '👜', color: '#fff4ef' },
    { id: 'jiyoon-book', name: '독서등', price: 68000, raised: 20000, supporters: 1, emoji: '💡', color: '#fff9e9' }
  ] },
  minji: { name: '민지', initial: 'M', countdown: 'D-6', avatar: 'avatar-lilac', products: [
    { id: 'minji-camera', name: '인스탁스 미니', price: 159000, raised: 95000, supporters: 4, emoji: '📷', color: '#f2f0ff' },
    { id: 'minji-candle', name: '향초 세트', price: 49000, raised: 35000, supporters: 2, emoji: '🕯️', color: '#fff7ec' }
  ] }
};
const ownerId = new URLSearchParams(location.search).get('owner') || 'seongmin';
const activeProfile = sharedProfiles[ownerId] || sharedProfiles.seongmin;
const won = value => `₩ ${value.toLocaleString('ko-KR')}`;

function renderProducts() {
  document.querySelectorAll('[data-product-list]').forEach(list => {
    const isPublic = list.dataset.public === 'true';
    const products = isPublic ? activeProfile.products : appData.products;
    list.innerHTML = products.map(product => {
      const percent = Math.round(product.raised / product.price * 100);
      return `<article class="product-card">
        <div class="product-image" style="--image-bg:${product.color}">${product.emoji}${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : ''}</div>
        <div class="product-body"><div class="product-top"><div><h3 class="product-name">${product.name}</h3><span class="product-price">${won(product.price)}</span></div><span class="tag">${product.supporters}명 참여</span></div>
        <div class="progress-label"><span>${percent}% 모였어요</span><strong>${won(product.raised)} <small>/ ${product.price.toLocaleString()}원</small></strong></div><div class="progress"><i style="width:${percent}%"></i></div>
        <div class="card-bottom"><span>마음을 모아 선물해요</span><a class="card-button" href="contribute.html?product=${product.id}${isPublic ? `&owner=${ownerId}` : ''}">${isPublic ? '함께 선물하기' : '참여 보기'}</a></div></div></article>`;
    }).join('');
  });
}

function setupContribution() {
  const selected = document.querySelector('[data-selected-product]');
  if (!selected) return;
  const id = new URLSearchParams(location.search).get('product') || 'airpods';
  const product = activeProfile.products.find(item => item.id === id) || activeProfile.products[0];
  selected.innerHTML = `<div class="product-image" style="--image-bg:${product.color}">${product.emoji}</div><div class="product-body"><h2 class="product-name">${product.name}</h2><span class="product-price">${won(product.price)} · ${Math.round(product.raised/product.price*100)}% 모였어요</span></div>`;
  document.querySelector('[data-recipient-name]').textContent = `${activeProfile.name}에게 마음을 전해요`;
  const input = document.querySelector('#custom-amount'); const link = document.querySelector('[data-complete-link]');
  const methods = document.querySelector('[data-transfer-methods]'); let selectedMethod = '';
  document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-amount]').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
    const custom = button.dataset.amount === 'custom'; input.classList.toggle('visible', custom);
    if (!custom) input.value = button.dataset.amount;
    methods.hidden = false;
    link.textContent = '송금 방법 선택하기';
    if (custom) input.focus();
  }));
  input?.addEventListener('input', () => { if (input.value > 0) methods.hidden = false; });
  document.querySelectorAll('[data-transfer]').forEach(button => button.addEventListener('click', () => {
    selectedMethod = button.dataset.transfer;
    document.querySelectorAll('[data-transfer]').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected'); link.classList.remove('is-disabled');
    link.textContent = `${button.querySelector('strong').textContent}로 송금하기`;
    link.href = `complete.html?product=${product.id}&amount=${input.value || 0}&owner=${ownerId}&method=${selectedMethod}`;
  }));
  // This records only a 'sent' claim. It deliberately does not increase the
  // gift total; the recipient must confirm the actual incoming transfer.
  link.addEventListener('click', () => {
    const amount = Number(input.value) || 0;
    if (!amount || !selectedMethod) return;
  });
}

function setupSmallInteractions() {
  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => {
    const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = button.dataset.toast; document.body.append(toast);
    requestAnimationFrame(() => toast.classList.add('show')); setTimeout(() => toast.remove(), 1800);
  }));
  const upload = document.querySelector('[data-photo-upload]');
  upload?.addEventListener('click', () => { upload.classList.add('uploaded'); upload.innerHTML = '<span>📷</span><strong>선물 사진이 추가되었어요</strong><small>프로토타입용 미리보기</small>'; });
  document.querySelector('[data-thanks-submit]')?.addEventListener('click', event => { const preview = document.querySelector('.thanks-preview'); preview.hidden = false; event.currentTarget.textContent = '공유되었어요 ✓'; event.currentTarget.disabled = true; });
  const sentConfirm = document.querySelector('[data-sent-confirm]');
  if (sentConfirm) {
    const params = new URLSearchParams(location.search); const amount = Number(params.get('amount')) || 0;
    const methodNames = { kakao: '카카오페이', toss: '토스', naver: 'Npay' };
    document.querySelector('[data-complete-amount]').textContent = won(amount);
    document.querySelector('[data-complete-method]').textContent = methodNames[params.get('method')] || '송금 수단';
    sentConfirm.addEventListener('click', () => { sentConfirm.hidden = true; document.querySelector('[data-waiting-copy]').hidden = false; });
  }
}
function setupPublicProfile() {
  if (!document.querySelector('[data-owner-title]')) return;
  document.title = `${activeProfile.name}의 위시리스트 | GIFTO`;
  const avatar = document.querySelector('[data-owner-avatar]');
  avatar.textContent = activeProfile.initial;
  avatar.className = `avatar avatar-large ${activeProfile.avatar}`;
  document.querySelector('[data-owner-countdown]').textContent = `${activeProfile.name}의 특별한 날까지 ${activeProfile.countdown}`;
  document.querySelector('[data-owner-title]').textContent = `${activeProfile.name}의 위시리스트`;
  document.querySelector('[data-owner-copy]').innerHTML = `${activeProfile.name}이 정말 받고 싶은 선물들이에요.<br />마음을 모아 함께 선물해 보세요.`;
  document.querySelector('.wish-hero').nextElementSibling.querySelector('.count').textContent = activeProfile.products.length;
}
function setupCreateWishlist() {
  const addButton = document.querySelector('[data-add-product]');
  if (!addButton) return;
  let selectedEmoji = '🎁';
  const name = document.querySelector('#new-product-name'); const productUrl = document.querySelector('#new-product-url');
  const price = document.querySelector('#new-product-price');
  const draftList = document.querySelector('[data-draft-products]');
  const showDrafts = () => { draftList.innerHTML = appData.products.map(item => `<div class="draft-product"><span>${item.emoji}</span><strong>${item.name}</strong><small>${won(item.price)}</small></div>`).join(''); };
  showDrafts();
  document.querySelectorAll('[data-emoji]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-emoji]').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected'); selectedEmoji = button.dataset.emoji;
  }));
  addButton.addEventListener('click', async () => {
    const productName = name.value.trim(); const productPrice = Number(price.value);
    if (!productName || !productPrice) { name.focus(); return; }
    addButton.textContent = '대표 이미지 확인 중…'; addButton.disabled = true;
    const imageUrl = await getProductImage(productUrl.value.trim());
    appData.products.push({ id: `custom-${Date.now()}`, name: productName, price: productPrice, raised: 0, supporters: 0, emoji: selectedEmoji, color: '#f2f7ff', productUrl: productUrl.value.trim(), imageUrl });
    saveProducts(appData.products); name.value = ''; price.value = ''; productUrl.value = ''; showDrafts();
    addButton.textContent = imageUrl ? '이미지와 함께 추가됐어요 ✓' : '아이콘으로 추가됐어요 ✓'; addButton.disabled = false; setTimeout(() => { addButton.textContent = '상품 목록에 추가'; }, 1500);
  });
  document.querySelector('[data-save-wishlist]').addEventListener('click', () => saveProducts(appData.products));
}
/* Best-effort preview for static mode. Most retailer pages block browser fetches
 * (CORS); production should move this to a secure server/Edge Function. */
async function getProductImage(url) {
  if (!url || !/^https:\/\//i.test(url)) return '';
  try {
    const response = await fetch(url); const html = await response.text();
    const documentFragment = new DOMParser().parseFromString(html, 'text/html');
    return documentFragment.querySelector('meta[property="og:image"]')?.content || '';
  } catch { return ''; }
}
setupPublicProfile(); renderProducts(); setupContribution(); setupSmallInteractions(); setupCreateWishlist();
