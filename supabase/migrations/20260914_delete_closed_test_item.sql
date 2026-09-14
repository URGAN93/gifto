-- Test-only cleanup for a list owner. This intentionally removes the closed
-- item's contribution rows as well, so repeated end-to-end tests can restart.
create or replace function public.delete_closed_test_gift_item(p_item uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_list uuid; v_owner uuid; v_deleted_list boolean := false;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select i.wishlist_id into v_list from public.wishlist_items i where i.id = p_item for update;
  if v_list is null then raise exception '상품이 이미 삭제되었어요.'; end if;
  select owner_id into v_owner from public.wishlists where id = v_list for update;
  if v_owner is distinct from auth.uid() then raise exception '내 상품만 삭제할 수 있어요.'; end if;
  if not exists(select 1 from public.wishlist_items where id = p_item and status = 'closed') then
    raise exception '마감된 테스트 상품만 삭제할 수 있어요.';
  end if;
  delete from public.wishlist_items where id = p_item;
  if not exists(select 1 from public.wishlist_items where wishlist_id = v_list) then
    delete from public.wishlists where id = v_list;
    v_deleted_list := true;
  end if;
  return jsonb_build_object('item_id', p_item, 'list_id', v_list, 'list_deleted', v_deleted_list);
end;
$$;
revoke all on function public.delete_closed_test_gift_item(uuid) from public, anon;
grant execute on function public.delete_closed_test_gift_item(uuid) to authenticated;
