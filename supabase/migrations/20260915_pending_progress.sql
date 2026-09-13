-- Only the aggregate is public; individual contributions remain protected by RLS.
begin;
alter table public.wishlist_items add column if not exists pending_amount bigint not null default 0;
create or replace function public.refresh_wishlist_item_progress(target_item_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.wishlist_items
  set raised_amount = coalesce((select sum(amount) from public.contributions where item_id = target_item_id and status = 'confirmed'), 0),
      pending_amount = coalesce((select sum(amount) from public.contributions where item_id = target_item_id and status = 'pending'), 0),
      supporter_count = (select count(*) from public.contributions where item_id = target_item_id and status = 'confirmed')
  where id = target_item_id;
end;
$$;
update public.wishlist_items i set pending_amount =
  coalesce((select sum(c.amount) from public.contributions c where c.item_id = i.id and c.status = 'pending'), 0);
commit;
