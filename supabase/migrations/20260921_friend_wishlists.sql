-- A guest becomes a GIFTO friend only after they prove ownership of their
-- receipt by signing in and claiming it. The pair is stored once regardless
-- of who later contributes to whom.
begin;

create table if not exists public.friendships (
  member_a uuid not null references public.profiles(id) on delete cascade,
  member_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);
alter table public.friendships enable row level security;
revoke all on public.friendships from public, anon, authenticated;

create or replace function public.claim_gift_contribution(p_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare target_id uuid; current_owner uuid; display_name text; recipient_id uuid;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_RECEIPT'; end if;
  select r.contribution_id into target_id from public.contribution_receipts r
    where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if target_id is null then raise exception 'RECEIPT_NOT_FOUND'; end if;
  select c.contributor_id, w.owner_id into current_owner, recipient_id
    from public.contributions c
    join public.wishlist_items i on i.id = c.item_id
    join public.wishlists w on w.id = i.wishlist_id
    where c.id = target_id for update of c;
  if current_owner is not null and current_owner <> auth.uid() then raise exception 'RECEIPT_ALREADY_CLAIMED'; end if;
  select p.display_name into display_name from public.profiles p where p.id = auth.uid();
  update public.contributions set contributor_id = auth.uid(), contributor_name = coalesce(display_name, contributor_name)
    where id = target_id;
  if recipient_id is not null and recipient_id <> auth.uid() then
    insert into public.friendships(member_a, member_b)
      values (least(recipient_id, auth.uid()), greatest(recipient_id, auth.uid()))
      on conflict do nothing;
  end if;
  return target_id;
end;
$$;
revoke all on function public.claim_gift_contribution(text) from public, anon;
grant execute on function public.claim_gift_contribution(text) to authenticated;

create or replace function public.my_friend_wishlists()
returns table(owner_id uuid, display_name text, avatar_url text, list_id uuid, title text, category text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with friends as (
    select case when f.member_a = auth.uid() then f.member_b else f.member_a end as id
    from public.friendships f
    where auth.uid() in (f.member_a, f.member_b)
  ), latest_public_lists as (
    select distinct on (w.owner_id) w.owner_id, w.id, w.title, w.category, w.created_at
    from public.wishlists w
    join friends f on f.id = w.owner_id
    where w.is_public
    order by w.owner_id, w.created_at desc
  )
  select l.owner_id, p.display_name, p.avatar_url, l.id, l.title, l.category, l.created_at
  from latest_public_lists l join public.profiles p on p.id = l.owner_id
  order by l.created_at desc;
$$;
revoke all on function public.my_friend_wishlists() from public, anon;
grant execute on function public.my_friend_wishlists() to authenticated;

commit;
