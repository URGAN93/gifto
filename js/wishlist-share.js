(() => {
  let qrReady;
  function loadQr() {
    if (window.qrcode) return Promise.resolve();
    if (!qrReady) qrReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      script.onload = resolve; script.onerror = () => { qrReady = null; reject(new Error('QR을 준비하지 못했어요. 다시 시도해 주세요.')); };
      document.head.append(script);
    });
    return qrReady;
  }
  function loadImage(url) {
    return new Promise(resolve => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), 5000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = url;
    });
  }
  window.createWishlistShareImage = async (remote, url) => {
    await loadQr(); await document.fonts.ready;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    const fitText = (text, x, y, width, size, color = '#111827') => {
      ctx.font = '700 ' + size + 'px sans-serif'; ctx.fillStyle = color;
      let value = String(text || '');
      while (value.length && ctx.measureText(value).width > width) value = value.slice(0, -1);
      if (value !== String(text || '')) value = value.slice(0, -1) + '…';
      ctx.fillText(value, x, y);
    };
    ctx.fillStyle = '#faf9f6'; ctx.fillRect(0, 0, 1080, 1080);
    fitText('GIFTO', 64, 80, 400, 32);
    const label = {birthday:'생일 선물', support:'응원 모금', celebration:'기념 선물', housewarming:'집들이 선물', together:'함께 선물'}[remote.wishlist.category] || '선물 리스트';
    fitText(label, 64, 145, 952, 28, '#786c58');
    fitText(remote.wishlist.title, 64, 213, 952, 48);
    fitText(remote.wishlist.deadline_at ? remote.wishlist.deadline_at.replace(/-/g, '.') + ' 마감' : '소중한 마음을 함께 모아요', 64, 258, 952, 24, '#6b7280');
    const publicProducts = sortWishlistProducts(remote.products, true).filter(p => p.status === 'open' && !p.isClosed);
    const products = publicProducts.slice(0, 4);
    const images = await Promise.all(products.map(p => p.imageUrl ? loadImage(p.imageUrl) : null));
    products.forEach((p, i) => {
      const large = products.length === 1;
      const width = large ? 952 : 464;
      const height = large ? 448 : 216;
      const x = large ? 64 : 64 + i % 2 * 488;
      const y = large ? 298 : 298 + Math.floor(i / 2) * 232;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#e8e5df'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
      const photoWidth = large ? width - 64 : 150;
      const photoHeight = large ? 290 : 156;
      const photoX = x + (large ? 32 : 18), photoY = y + 18;
      const image = images[i];
      if (image) {
        const scale = Math.min(photoWidth / image.width, photoHeight / image.height);
        ctx.drawImage(image, photoX + (photoWidth - image.width * scale) / 2, photoY + (photoHeight - image.height * scale) / 2, image.width * scale, image.height * scale);
      } else {
        ctx.textAlign = 'center';
        fitText(p.emoji || '🎁', photoX + photoWidth / 2, photoY + photoHeight / 2 + 30, photoWidth, large ? 100 : 64);
        ctx.textAlign = 'left';
      }
      if (large) ctx.textAlign = 'center';
      fitText(p.name, large ? x + width / 2 : x + 188, y + (large ? 355 : 88), large ? width - 40 : 256, 27);
      fitText(Number(p.price).toLocaleString('ko-KR') + '원', large ? x + width / 2 : x + 188, y + (large ? 398 : 134), large ? width - 40 : 256, 24, '#6b7280');
      ctx.textAlign = 'left';
    });
    if (!products.length) fitText('현재 공개 중인 선물이 없어요', 80, 520, 920, 40);
    fitText(publicProducts.length > 4 ? '외 ' + (publicProducts.length - 4) + '개 · 전체 선물은 링크에서 확인해 주세요' : '전체 선물 ' + publicProducts.length + '개 · 마음을 더해 주세요', 64, 807, 760, 26);
    const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    const count = qr.getModuleCount(), cell = Math.floor(190 / (count + 8)), side = (count + 8) * cell;
    const qx = 1016 - side, qy = 1050 - side;
    ctx.fillStyle = '#fff'; ctx.fillRect(qx, qy, side, side);
    ctx.fillStyle = '#111';
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) ctx.fillRect(qx + (col + 4) * cell, qy + (row + 4) * cell, cell, cell);
    fitText('선물보다 더 소중한 마음', 64, 930, 690, 32);
    fitText('QR을 스캔하면 이 리스트로 연결돼요 →', 64, 980, 690, 24, '#6b7280');
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지를 저장하지 못했어요.')), 'image/png'));
  };
  window.openWishlistShare = async remote => {
    const url = new URL('https://urgan93.github.io/gifto/pages/wishlist.html');
    url.searchParams.set('owner', remote.profile.id); url.searchParams.set('list', remote.wishlist.id);
    const dialog = document.createElement('dialog'); dialog.className = 'wishlist-share-dialog';
    dialog.innerHTML = '<button type="button" data-close>닫기 ✕</button><h2>이 리스트 공유하기</h2><p>마감되지 않은 공개 상품을 최대 4개 담아요. 전체 리스트는 링크나 QR로 볼 수 있어요.</p><p data-status role="status">공유 이미지를 만드는 중…</p><img hidden alt="위시리스트 공유 이미지 미리보기" /><div class="wishlist-share-actions"><button type="button" class="button button-primary" data-link>링크 복사하기</button><button type="button" class="button button-ghost" data-save disabled>이미지 저장하기</button></div><p>인스타 스토리에 사진을 올리고, ‘링크’ 스티커에 복사한 주소를 붙여넣어 주세요.</p><input data-copy-fallback readonly hidden aria-label="공유 링크 — 길게 눌러 복사하세요" />';
    document.body.append(dialog); dialog.showModal();
    let imageUrl;
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { if (imageUrl) URL.revokeObjectURL(imageUrl); dialog.remove(); });
    dialog.querySelector('[data-link]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(url.href);
        dialog.querySelector('[data-status]').textContent = '링크를 복사했어요.';
      } catch {
        const field = dialog.querySelector('[data-copy-fallback]');
        field.value = url.href; field.hidden = false; field.focus(); field.select();
        dialog.querySelector('[data-status]').textContent = '자동 복사가 안 됐어요. 아래 링크를 길게 눌러 복사해 주세요.';
      }
    };
    try {
      const blob = await window.createWishlistShareImage(remote, url.href);
      if (!dialog.open) return;
      imageUrl = URL.createObjectURL(blob);
      const img = dialog.querySelector('img'); img.src = imageUrl; img.hidden = false;
      dialog.querySelector('[data-status]').textContent = '1080 × 1080 · 진행 금액은 이미지에 포함하지 않아요.';
      const save = dialog.querySelector('[data-save]'); save.disabled = false;
      if (window.giftoNative?.isNative) save.textContent = '이미지 공유 / 저장';
      save.onclick = async () => {
        if (window.giftoNative?.isNative) {
          save.disabled = true;
          try { await window.giftoNative.shareImage(blob); }
          catch { dialog.querySelector('[data-status]').textContent = '공유를 완료하지 못했어요. 다시 누르거나 링크를 복사해 주세요.'; }
          finally { save.disabled = false; }
          return;
        }
        const link = document.createElement('a'); link.href = imageUrl; link.download = 'gifto-wishlist.png'; document.body.append(link); link.click(); link.remove();
      };
    } catch (error) { dialog.querySelector('[data-status]').textContent = error.message + ' 링크 공유는 사용할 수 있어요.'; }
  };
})();
