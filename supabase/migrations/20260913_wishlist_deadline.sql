-- Optional deadline for a shared wishlist. Null means no deadline.
alter table public.wishlists
  add column if not exists deadline_at date;
