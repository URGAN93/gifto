-- Run this once in Supabase Dashboard > SQL Editor.
alter table public.wishlist_items
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'open', 'closed', 'proof_posted')),
  add column if not exists shared_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists proof_image_url text,
  add column if not exists proof_message text,
  add column if not exists proof_published_at timestamptz;

update public.wishlist_items
set status = 'open', shared_at = coalesce(shared_at, created_at)
where status = 'draft'
  and exists (select 1 from public.contributions c where c.item_id = public.wishlist_items.id);

drop policy if exists "signed in users add contributions" on public.contributions;
create policy "signed in users add contributions to open items"
on public.contributions for insert
with check (
  contributor_id = auth.uid()
  and exists (
    select 1 from public.wishlist_items i
    join public.wishlists w on w.id = i.wishlist_id
    where i.id = item_id and i.status = 'open' and w.is_public
  )
);
