-- Run once in Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'GIFTO 친구',
  avatar_url text,
  birth_date date,
  intro text,
  kakao_pay_qr_url text,
  created_at timestamptz not null default now()
);
create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '나의 위시리스트',
  note text,
  share_slug text not null unique default encode(gen_random_bytes(9), 'hex'),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  name text not null,
  price integer not null check (price > 0),
  product_url text,
  image_url text,
  emoji text not null default '🎁',
  color text not null default '#f2f7ff',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.wishlist_items(id) on delete cascade,
  contributor_id uuid references public.profiles(id) on delete set null,
  contributor_name text not null,
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.contributions enable row level security;

create policy "profiles readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "public or own lists readable" on public.wishlists for select using (is_public or owner_id = auth.uid());
create policy "users create own lists" on public.wishlists for insert with check (owner_id = auth.uid());
create policy "users update own lists" on public.wishlists for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users delete own lists" on public.wishlists for delete using (owner_id = auth.uid());
create policy "items readable with list" on public.wishlist_items for select using (exists (select 1 from public.wishlists w where w.id = wishlist_id and (w.is_public or w.owner_id = auth.uid())));
create policy "owners manage items" on public.wishlist_items for all using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.owner_id = auth.uid())) with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.owner_id = auth.uid()));
create policy "contributions readable with item" on public.contributions for select using (exists (select 1 from public.wishlist_items i join public.wishlists w on w.id = i.wishlist_id where i.id = item_id and (w.is_public or w.owner_id = auth.uid())));
create policy "signed in users add contributions" on public.contributions for insert with check (contributor_id = auth.uid());
create policy "owners confirm contributions" on public.contributions for update using (exists (select 1 from public.wishlist_items i join public.wishlists w on w.id = i.wishlist_id where i.id = item_id and w.owner_id = auth.uid()));

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'GIFTO 친구'), new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();
