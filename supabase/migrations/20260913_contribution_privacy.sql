-- Keep the public progress visible without exposing other participants' names or amounts.
alter table public.wishlist_items
  add column if not exists raised_amount integer not null default 0,
  add column if not exists supporter_count integer not null default 0;

create or replace function public.refresh_wishlist_item_progress(target_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.wishlist_items
  set raised_amount = coalesce((select sum(amount) from public.contributions where item_id = target_item_id and status = 'confirmed'), 0),
      supporter_count = (select count(*) from public.contributions where item_id = target_item_id and status = 'confirmed')
  where id = target_item_id;
end;
$$;

create or replace function public.refresh_wishlist_item_progress_after_contribution()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_wishlist_item_progress(coalesce(new.item_id, old.item_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists contributions_refresh_item_progress on public.contributions;
create trigger contributions_refresh_item_progress
after insert or update of amount, status or delete on public.contributions
for each row execute procedure public.refresh_wishlist_item_progress_after_contribution();

update public.wishlist_items i
set raised_amount = coalesce((select sum(c.amount) from public.contributions c where c.item_id = i.id and c.status = 'confirmed'), 0),
    supporter_count = (select count(*) from public.contributions c where c.item_id = i.id and c.status = 'confirmed');

drop policy if exists "contributions readable with item" on public.contributions;
create policy "owners and contributors read only their contributions"
on public.contributions for select
using (
  contributor_id = auth.uid()
  or exists (
    select 1 from public.wishlist_items i
    join public.wishlists w on w.id = i.wishlist_id
    where i.id = item_id and w.owner_id = auth.uid()
  )
);
