-- Category for the purpose of a GIFTO list.
alter table public.wishlists
  add column if not exists category text not null default 'birthday'
  check (category in ('birthday', 'support', 'celebration', 'housewarming', 'together'));
