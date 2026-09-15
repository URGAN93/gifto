(() => {
  const root = new URL('../', document.currentScript.src);
  let rows = [], tab = 'visible', generation = 0;
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
  const fullUrl = new URL('pages/friends.html', root).href;
  function deadline(row) {
    if (!row.deadline_at) return '마감일 미정';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(String(row.deadline_at).slice(0, 10) + 'T00:00:00');
    const days = Math.round((end.getTime() - today.getTime()) / 86400000);
    return days < 0 ? '마감일 지남' : days === 0 ? '오늘 마감' : `D-${days}`;
  }
  function card(row) {
    const article = node('article', '', 'friend-card');
    const link = node('a', '', 'friend-card-link');
    const url = new URL('pages/wishlist.html', root);
    url.searchParams.set('owner', row.owner_id); url.searchParams.set('list', row.list_id);
    link.href = url.href;
    const thumb = node('div', '🎁', 'friend-thumb');
    if (row.image_url) {
      try { const src = new URL(row.image_url); if (['https:', 'data:'].includes(src.protocol)) {
        const img = node('img'); img.src = src.href; img.alt = ''; img.loading = 'lazy';
        thumb.textContent = ''; thumb.className = 'friend-thumb friend-thumb-photo';
        img.onerror = () => { thumb.replaceChildren(); thumb.textContent = '🎁'; thumb.className = 'friend-thumb'; };
        thumb.append(img);
      } } catch {}
    }
    const copy = node('div', '', 'friend-copy');
    copy.append(node('small', row.display_name || 'GIFTO 친구'), node('strong', row.title || '위시리스트'), node('span', `${deadline(row)} · 상품 ${row.item_count || 0}개`));
    link.append(thumb, copy); article.append(link);
    return article;
  }
  function render() {
    const host = document.querySelector('[data-friend-list]'); if (!host) return;
    host.replaceChildren();
    const full = host.hasAttribute('data-friends-full');
    document.querySelectorAll('[data-friends-tab]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.friendsTab === tab)); button.onclick = () => { tab = button.dataset.friendsTab; render(); }; });
    const visible = rows.filter(row => Boolean(row.hidden) === (full && tab === 'hidden'));
    if (!visible.length) { host.append(node('p', full && tab === 'hidden' ? '숨긴 리스트가 없어요.' : '아직 공개된 친구 위시리스트가 없어요.', 'empty-state')); return; }
    if (full) { visible.forEach(row => host.append(card(row))); return; }
    const track = node('div', '', 'friend-track'); track.setAttribute('aria-label', '친구 위시리스트 페이지');
    const selected = visible.slice(0, 9);
    for (let i = 0; i < selected.length; i += 3) {
      const page = node('div', '', 'friend-page'); selected.slice(i, i + 3).forEach(row => page.append(card(row))); track.append(page);
    }
    const last = node('div', '', 'friend-page friend-more'); const more = node('a', '친구 위시리스트 전체 보기 →', 'button button-ghost'); more.href = fullUrl; last.append(more); track.append(last);
    host.append(track);
    const nav = node('div', '', 'friend-pages');
    Array.from(track.children).forEach((page, i) => { const button = node('button', i === track.children.length - 1 ? '전체' : String(i + 1)); button.type = 'button'; button.setAttribute('aria-label', `${i + 1} 페이지`); button.onclick = () => track.scrollTo({left:page.offsetLeft - track.children[0].offsetLeft, behavior:'smooth'}); nav.append(button); });
    Array.from(nav.children).forEach((button,i) => { button.textContent = ''; button.setAttribute('aria-current', String(i === 0)); });
    const pages = Array.from(track.children);
    let active = 0, start = null, suppressClickUntil = 0, targetLeft = null;
    track.style.touchAction = 'pan-y';
    track.tabIndex = 0;
    const move = step => {
      const next = active + step;
      active = (next + pages.length) % pages.length;
      targetLeft = pages[active].offsetLeft-pages[0].offsetLeft;
      if (track.scrollWidth && track.clientWidth) targetLeft = Math.min(targetLeft,track.scrollWidth-track.clientWidth);
      track.scrollTo({left:targetLeft, behavior:next < 0 || next >= pages.length ? 'instant' : 'smooth'});
    };
    track.onpointerdown = event => {
      if (event.isPrimary === false || event.button > 0) return;
      start = {x:event.clientX, y:event.clientY};
    };
    track.onpointermove = event => {
      if (!start || Math.abs(event.clientX-start.x) < 12) return;
      if (Math.abs(event.clientX-start.x) > Math.abs(event.clientY-start.y)) {
        track.setPointerCapture?.(event.pointerId);
      }
    };
    track.onpointerup = event => {
      if (!start) return;
      const dx = event.clientX-start.x, dy = event.clientY-start.y;
      start = null;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
        suppressClickUntil = Date.now()+500;
        move(dx < 0 ? 1 : -1);
      }
    };
    track.onpointercancel = () => { start = null; };
    track.ondragstart = event => event.preventDefault();
    track.addEventListener('click', event => {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    track.onkeydown = event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    track.onscroll = () => {
      const nearest = pages.reduce((best,page,i) => Math.abs(page.offsetLeft-pages[0].offsetLeft-track.scrollLeft) < Math.abs(pages[best].offsetLeft-pages[0].offsetLeft-track.scrollLeft) ? i : best,0);
      if (targetLeft !== null && Math.abs(track.scrollLeft-targetLeft) <= 2) targetLeft = null;
      if (targetLeft === null) active = nearest;
      Array.from(nav.children).forEach((button,i)=>button.setAttribute('aria-current',String(i===nearest)));
    };
    host.append(nav, node('p', '옆으로 넘겨 친구의 소식을 만나보세요', 'friend-swipe-hint'));
  }
  async function refresh() {
    const host = document.querySelector('[data-friend-list]'); if (!host) return;
    const current = ++generation;
    host.replaceChildren(node('p', '친구 리스트를 불러오는 중이에요.', 'field-help'));
    try {
      const {data, error:authError} = await window.giftoDb.auth.getSession();
      if (authError) throw authError;
      if (!data.session) { if (current === generation) host.replaceChildren(node('p', '로그인하면 친구 위시리스트를 볼 수 있어요.', 'empty-state')); return; }
      await window.giftoContributions?.claim();
      const {data:result, error} = await window.giftoDb.rpc('my_friend_wishlist_feed');
      if (error) throw error;
      if (current !== generation) return;
      rows = result || []; render();
    } catch { if (current === generation) { host.replaceChildren(node('p', '친구 리스트를 불러오지 못했어요.', 'empty-state')); const retry = node('button', '다시 시도', 'button button-ghost'); retry.onclick = refresh; host.append(retry); } }
  }
  window.giftoFriends = {refresh};
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
})();
