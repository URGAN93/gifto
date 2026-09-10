/*
 * Demo data is intentionally centralized. Replace this object with an API/JSON
 * repository later (for example: services/wishlist-service.js + Supabase calls).
 */
const DEFAULT_PRODUCTS = [
    { id: 'airpods', name: 'AirPods Pro', price: 359000, raised: 190000, supporters: 6, emoji: '🎧', color: '#eef5ff', contributors: [{ name: '지윤', amount: 50000 }, { name: '민지', amount: 40000 }, { name: '도현', amount: 30000 }, { name: '유나', amount: 30000 }, { name: '현우', amount: 20000 }, { name: '수빈', amount: 20000 }] },
    { id: 'watch', name: 'Galaxy Watch', price: 329000, raised: 120000, supporters: 4, emoji: '⌚', color: '#f4f0ff', contributors: [{ name: '지윤', amount: 30000 }, { name: '도현', amount: 30000 }, { name: '유나', amount: 30000 }, { name: '수빈', amount: 30000 }] },
    { id: 'shoes', name: 'Nike 운동화', price: 159000, raised: 75000, supporters: 3, emoji: '👟', color: '#fff4ed', contributors: [{ name: '민지', amount: 30000 }, { name: '현우', amount: 25000 }, { name: '수빈', amount: 20000 }] }
];
/* No-account mode keeps data in this browser only. A Supabase repository can
 * later replace these two functions without changing the page renderers. */
const storageKey = 'gifto-no-account-wishlist';
const getProducts = () => { try { return JSON.parse(localStorage.getItem(storageKey)) || DEFAULT_PRODUCTS; } catch { return DEFAULT_PRODUCTS; } };
const saveProducts = products => localStorage.setItem(storageKey, JSON.stringify(products));
const appData = { products: getProducts() };
const paymentInfoKey = 'gifto-no-account-payment-info';
const getPaymentInfo = () => { try { return JSON.parse(localStorage.getItem(paymentInfoKey)) || {}; } catch { return {}; } };
const savePaymentInfo = info => localStorage.setItem(paymentInfoKey, JSON.stringify(info));
/* Public profile data: separate owners prevent every birthday card opening
 * the current user's wishlist. This maps directly to future profile tables. */
const sharedProfiles = {
  seongmin: { name: '심성민', initial: 'S', countdown: 'D-12', eventDate: '9월 22일', eventEmoji: '🎂', avatar: 'avatar-blue', products: appData.products },
  jiyoon: { name: '지윤', initial: 'J', countdown: 'D-4', eventDate: '9월 14일', eventEmoji: '🎈', avatar: 'avatar-peach', paymentInfo: { tossInfo: '지윤 · 010-6449-2040', naverInfo: '지윤 · 010-6449-2040' }, products: [
    { id: 'jiyoon-bag', name: 'COS 미니 크로스백', price: 135000, raised: 80000, supporters: 3, emoji: '👜', color: '#fff4ef' },
    { id: 'jiyoon-book', name: '독서등', price: 68000, raised: 20000, supporters: 1, emoji: '💡', color: '#fff9e9' }
  ] },
  minji: { name: '민지', initial: 'M', countdown: 'D-6', eventDate: '9월 16일', eventEmoji: '✨', avatar: 'avatar-lilac', products: [
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
  const paymentInfo = ownerId === 'seongmin' ? getPaymentInfo() : (activeProfile.paymentInfo || {});
  const transferEmpty = document.querySelector('[data-transfer-empty]');
  const transferButtons = document.querySelectorAll('[data-transfer]');
  let availableTransfers = 0;
  transferButtons.forEach(button => {
    const type = button.dataset.transfer;
    if (type !== 'kakao') { button.hidden = true; return; }
    const transferValue = type === 'kakao' ? paymentInfo.kakaoQr : paymentInfo[type + 'Info'];
    button.hidden = !transferValue; if (transferValue) availableTransfers += 1;
    button.querySelector('small').textContent = '송금 정보 보기';
    button.addEventListener('click', () => showTransferGuide(type, transferValue));
  });
  if (!availableTransfers) { transferEmpty.textContent = '아직 등록된 송금 정보가 없어요.'; transferEmpty.hidden = false; }
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
    link.textContent = '송금 후 확인하기';
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
  document.querySelectorAll('[data-copy-share]').forEach(button => button.addEventListener('click', async () => {
    const shareUrl = new URL('wishlist.html?owner=seongmin', location.href).href;
    try { await navigator.clipboard.writeText(shareUrl); showToast('위시리스트 링크가 복사되었어요!'); }
    catch { showToast('링크를 복사하지 못했어요. 주소창의 주소를 복사해 주세요.'); }
  }));
  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => {
    showToast(button.dataset.toast);
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
  const kakao = document.querySelector('#payment-kakao'); const toss = document.querySelector('#payment-toss'); const naver = document.querySelector('#payment-naver');
  form.closest('.payment-settings').querySelector('h2').textContent = '송금 정보 설정';
  form.closest('.payment-settings').querySelector('.settings-copy').textContent = '카카오페이 코드송금 QR을 등록해 주세요.';
  kakao.type = 'file'; kakao.accept = 'image/*'; kakao.value = '';
  toss.hidden = true; naver.hidden = true;
  toss.previousElementSibling.hidden = true; naver.previousElementSibling.hidden = true;
  kakao.previousElementSibling.textContent = '카카오페이 송금 QR';
  toss.previousElementSibling.textContent = '토스 송금 정보';
  naver.previousElementSibling.textContent = '네이버페이 송금 정보';
  const help = document.createElement('p'); help.className = 'field-help'; help.textContent = '카카오톡에서 만든 코드송금 QR을 저장해 올려 주세요.';
  kakao.insertAdjacentElement('afterend', help);
  const preview = document.createElement('img'); preview.className = 'payment-qr-preview'; preview.alt = '등록한 카카오페이 송금 QR';
  if (info.kakaoQr) { preview.src = info.kakaoQr; kakao.insertAdjacentElement('afterend', preview); }
  toss.value = info.tossInfo || ''; naver.value = info.naverInfo || '';
  form.addEventListener('submit', event => {
    event.preventDefault();
    const save = qr => { savePaymentInfo({ kakaoQr: qr || info.kakaoQr || '' }); showToast('카카오페이 QR을 저장했어요.'); };
    const file = kakao.files[0];
    if (!file) { save(''); return; }
    const reader = new FileReader(); reader.onload = () => save(reader.result); reader.readAsDataURL(file);
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
    const button = document.createElement('button'); button.type = 'button'; button.className = 'product-delete'; button.textContent = '삭제';
    button.addEventListener('click', () => {
      const product = appData.products[index];
      if (!confirm(product.name + '을(를) 위시리스트에서 삭제할까요?')) return;
      appData.products.splice(index, 1); saveProducts(appData.products); renderProducts(); setupWishlistEditing();
      const count = document.querySelector('[data-my-product-count]'); if (count) count.textContent = appData.products.length;
      showToast('상품을 삭제했어요.');
    });
    const product = appData.products[index];
    const action = card.querySelector('.card-button');
    if (action) { action.href = 'participants.html?product=' + encodeURIComponent(product.id); action.textContent = '참여 보기'; }
    if ((product.contributors && product.contributors.length) || product.supporters > 0) {
      button.textContent = '진행 중'; button.disabled = true; button.classList.add('is-locked'); card.append(button);
    } else {
      card.append(button);
    }
  });
}
function setupParticipants() {
  const view = document.querySelector('[data-participants]');
  if (!view) return;
  const id = new URLSearchParams(location.search).get('product');
  const product = appData.products.find(item => item.id === id) || appData.products[0];
  const contributors = product.contributors || [];
  document.querySelector('[data-participant-product]').textContent = product.name;
  document.querySelector('[data-participant-total]').textContent = won(product.raised);
  document.querySelector('[data-participant-count]').textContent = contributors.length + '명 참여';
  view.innerHTML = contributors.length ? contributors.map(item => '<li><span class="contributor-avatar">' + item.name.slice(0, 1) + '</span><strong>' + item.name + '</strong><span>' + won(item.amount) + '</span></li>').join('') : '<li class="empty-contributors">아직 함께한 친구가 없어요.</li>';
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
  document.querySelectorAll('[data-public="true"] .card-button').forEach(button => { button.textContent = '함께하기'; });
}
function setupFriendList() {
  const list = document.querySelector('[data-friend-list]');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(sharedProfiles)
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
setupFriendList(); setupPublicProfile(); renderProducts(); setupWishlistEditing(); setupParticipants(); setupContribution(); setupSmallInteractions(); setupPaymentSettings(); setupCreateWishlist();
