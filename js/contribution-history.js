// Guest receipts are bearer secrets. Keep them out of URLs, logs and public rows.
(() => {
  const key = 'gifto-contribution-receipts-v1';
  const read = () => { try { const rows = JSON.parse(localStorage.getItem(key)); return Array.isArray(rows) ? rows : []; } catch { return []; } };
  const save = rows => localStorage.setItem(key, JSON.stringify(rows));
  const statusText = status => ({pending:'입금 확인 대기', confirmed:'입금 확인 완료', cancelled:'입금 미확인 · 거절됨'}[status] || '확인 중');
  const money = value => Number(value).toLocaleString('ko-KR') + '원';
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let claiming;
  const api = window.giftoContributions = {
    async submit(product, amount, attemptId, recipient) {
      const rows = read();
      let receipt = rows.find(row => row.attemptId === attemptId);
      if (!receipt) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        receipt = {attemptId, token:Array.from(bytes, n => n.toString(16).padStart(2, '0')).join(''),
          amount, itemId:product.id, recipient, createdAt:Date.now()};
        rows.push(receipt);
        // Persist before sending: retry after a lost response reuses the same key.
        save(rows);
      }
      if (receipt.amount !== amount || receipt.itemId !== product.id) throw new Error('금액을 다시 선택해 주세요.');
      const {data, error} = await window.giftoDb.rpc('submit_gift_contribution', {
        p_item:product.id, p_amount:amount, p_token:receipt.token
      });
      if (error) throw new Error('송금 내역을 저장하지 못했어요. 잠시 후 다시 눌러 주세요.');
      receipt.id = data; save(rows);
      return data;
    },
    async claim() {
      if (claiming) return claiming;
      claiming = (async () => {
        const {data: auth} = await window.giftoDb.auth.getSession();
        if (!auth.session) return;
        // Refetch before each write so receipts created in another tab survive.
        for (const receipt of read().filter(row => row.token)) {
          const {data, error} = await window.giftoDb.rpc('claim_gift_contribution', {p_token:receipt.token});
          if (!error) save(read().map(row => row.attemptId === receipt.attemptId
            ? {...row, id:data, token:null, accountId:auth.session.user.id} : row));
        }
      })();
      try { await claiming; } finally { claiming = null; }
    },
    async render() {
      const complete = document.querySelector('[data-complete-title]');
      const history = document.querySelector('[data-sent-history]');
      const {data: auth} = await window.giftoDb.auth.getSession();
      if (auth.session) await api.claim();
      if (!complete && !history) return;
      let records = [], loadError;
      if (auth.session) {
        const result = await window.giftoDb.rpc('my_gift_contributions');
        records = result.data || []; loadError = result.error;
      }
      if (complete) {
        const receiptId = new URLSearchParams(location.search).get('receipt');
        const record = records.find(row => row.id === receiptId);
        const receipt = read().find(row => row.id === receiptId);
        complete.textContent = '마음을 전해주셔서 고마워요';
        document.querySelector('[data-complete-amount]').textContent = money(record?.amount ?? receipt?.amount ?? 0);
        document.querySelector('[data-complete-status]').textContent = record ? statusText(record.status) : '입금 확인 대기';
        document.querySelector('.complete-card .eyebrow').textContent = record ? statusText(record.status) : '입금 확인 대기';
        document.querySelector('.waiting-copy').textContent = record?.status === 'cancelled' ? '받는 분이 입금을 확인하지 못했어요. 실제로 송금했다면 받는 분에게 확인해 주세요.'
          : record?.status === 'confirmed' ? '받는 분이 입금을 확인했어요. 마음을 전해주셔서 고마워요.'
          : '실제 송금 내역을 받는 분이 확인하면 반영돼요.';
        const cta = document.querySelector('[data-receipt-login]');
        cta.replaceChildren();
        const text = document.createElement('p');
        const name = record?.recipient_name || receipt?.recipient || '친구';
        text.textContent = auth.session ? (loadError ? '내역을 불러오지 못했어요. 마이페이지에서 다시 확인해 주세요.' : '내 계정에서 보낸 마음과 확인 상태를 볼 수 있어요.')
          : '지금 카카오로 로그인하면 ' + name + '님에게 보낸 내역을 나중에도 찾아볼 수 있어요.';
        const link = document.createElement('a'); link.className = 'button button-primary';
        link.textContent = auth.session ? '내가 보낸 마음 보기' : '카카오로 내역 저장하기';
        const next = 'pages/complete.html' + location.search;
        link.href = auth.session ? 'my-page.html#sent-history' : 'login.html?next=' + encodeURIComponent(next);
        cta.append(text, link);
        if (!auth.session) {
          const note = document.createElement('p'); note.className = 'field-help';
          note.textContent = '같은 브라우저에서 로그인해 주세요. 로그인 전에 브라우저 데이터를 지우면 내역 연결이 어려워요.';
          cta.append(note);
        } else if (read().some(row => row.id === receiptId && row.token)) {
          text.textContent = '내역 연결이 아직 완료되지 않았어요.';
          const retry = document.createElement('button'); retry.className = 'button button-ghost'; retry.textContent = '내역 연결 다시 시도';
          retry.onclick = () => api.render(); cta.append(retry);
        }
      }
      if (history) {
        if (!auth.session) { history.innerHTML = '<p class="empty-state">로그인하면 내가 보낸 마음을 볼 수 있어요.</p>'; return; }
        if (loadError) { history.innerHTML = '<p class="empty-state">내역을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>'; return; }
        history.innerHTML = records.length ? records.map(row => '<article class="sent-record"><strong>' + safe(row.recipient_name) + '님 · ' + safe(row.item_name) + '</strong><p>' + money(row.amount) + ' · ' + statusText(row.status) + '</p><small>' + new Date(row.created_at).toLocaleDateString('ko-KR') + '</small></article>').join('')
          : '<p class="empty-state">아직 보낸 마음이 없어요.</p>';
      }
    }
  };
  api.render().catch(() => {
    const history = document.querySelector('[data-sent-history]');
    if (history) history.textContent = '내역을 불러오지 못했어요. 새로고침 후 다시 확인해 주세요.';
  });
  window.addEventListener('pageshow', () => api.render().catch(() => {}));
})();
