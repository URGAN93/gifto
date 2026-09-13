-- Delete an eligible item and its now-empty list atomically.
-- Existing empty lists are intentionally left untouched.
create or replace function public.delete_empty_gift_item(p_item uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_list uuid;
  v_owner uuid;
  v_raised bigint;
  v_deleted_list boolean := false;
begin
  if auth.uid() is null then raise exception '로그인 후 삭제해 주세요.'; end if;
  select wishlist_id into v_list from public.wishlist_items where id = p_item;
  if v_list is null then raise exception '상품이 이미 삭제되었어요.'; end if;
  -- Serialize deletes in this list and block concurrent FK-backed item inserts.
  select owner_id into v_owner from public.wishlists where id = v_list for update;
  if v_owner is distinct from auth.uid() then raise exception '내 상품만 삭제할 수 있어요.'; end if;
  select raised_amount into v_raised from public.wishlist_items where id = p_item for update;
  if not found then raise exception '상품이 이미 삭제되었어요.'; end if;
  if coalesce(v_raised, 0) > 0 or exists(select 1 from public.contributions where item_id = p_item) then
    raise exception '입금 확인 대기 또는 참여 기록이 있어 삭제할 수 없어요.';
  end if;
  delete from public.wishlist_items where id = p_item;
  if not exists(select 1 from public.wishlist_items where wishlist_id = v_list) then
    delete from public.wishlists where id = v_list;
    v_deleted_list := true;
  end if;
  return jsonb_build_object('item_id', p_item, 'list_id', v_list, 'list_deleted', v_deleted_list);
end;
$$;
revoke all on function public.delete_empty_gift_item(uuid) from public, anon;
grant execute on function public.delete_empty_gift_item(uuid) to authenticated;
