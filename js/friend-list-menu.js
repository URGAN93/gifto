// Only show this action for a signed-in friend's list, never for arbitrary links.
(async () => {
  const list = new URLSearchParams(location.search).get('list');
  if (!list || !window.giftoDb) return;
  try {
    const {data: auth} = await window.giftoDb.auth.getSession();
    if (!auth?.session) return;
    const {data, error} = await window.giftoDb.rpc('my_friend_wishlist_feed');
    if (error) return;
    const row = data?.find(item => item.list_id === list);
    if (!row) return;
    const menu = document.createElement('div');
    menu.className = 'section compact';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-ghost';
    const label = () => row.hidden ? '숨긴 리스트 다시 표시' : '리스트 숨기기';
    button.textContent = label();
    button.onclick = async () => {
      button.disabled = true;
      try {
        const {error} = await window.giftoDb.rpc('set_friend_wishlist_hidden', {p_list:list, p_hidden:!row.hidden});
        if (error) throw error;
        row.hidden = !row.hidden;
        button.textContent = label();
      } catch { button.textContent = '저장 실패 · 다시 시도'; }
      finally { button.disabled = false; }
    };
    menu.append(button);
    document.querySelector('.wish-hero')?.after(menu);
  } catch { /* The public list remains available even if the menu cannot load. */ }
})();
