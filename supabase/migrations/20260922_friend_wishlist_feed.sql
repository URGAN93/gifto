-- Apply after 20260921_friend_wishlists.sql and existing wishlist deadline migration.
begin;
create table if not exists public.hidden_friend_wishlists (
  user_id uuid not null references public.profiles(id) on delete cascade,
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  primary key(user_id, wishlist_id)
);
alter table public.hidden_friend_wishlists enable row level security;
revoke all on public.hidden_friend_wishlists from public, anon, authenticated;

create or replace function public.set_friend_wishlist_hidden(p_list uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_hidden is null then raise exception 'LOGIN_REQUIRED'; end if;
  if not p_hidden then
    delete from public.hidden_friend_wishlists where user_id=auth.uid() and wishlist_id=p_list;
    return;
  end if;
  if not exists (
    select 1 from public.wishlists w join public.friendships f
    on (f.member_a=auth.uid() and f.member_b=w.owner_id) or (f.member_b=auth.uid() and f.member_a=w.owner_id)
    where w.id=p_list and w.is_public
  ) then raise exception 'FRIEND_LIST_NOT_FOUND'; end if;
  insert into public.hidden_friend_wishlists values(auth.uid(),p_list) on conflict do nothing;
end;
$$;
revoke all on function public.set_friend_wishlist_hidden(uuid,boolean) from public, anon;
grant execute on function public.set_friend_wishlist_hidden(uuid,boolean) to authenticated;

create or replace function public.my_friend_wishlist_feed()
returns table(owner_id uuid, display_name text, list_id uuid, title text, deadline_at date,
  image_url text, item_count bigint, hidden boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select w.owner_id,p.display_name,w.id,w.title,w.deadline_at,
    (select i.image_url from public.wishlist_items i where i.wishlist_id=w.id and i.status<>'draft' and i.image_url is not null order by i.position,i.id limit 1),
    (select count(*) from public.wishlist_items i where i.wishlist_id=w.id and i.status<>'draft'),
    exists(select 1 from public.hidden_friend_wishlists h where h.user_id=auth.uid() and h.wishlist_id=w.id)
  from public.wishlists w join public.profiles p on p.id=w.owner_id
  where w.is_public and exists (
    select 1 from public.friendships f where
      (f.member_a=auth.uid() and f.member_b=w.owner_id) or (f.member_b=auth.uid() and f.member_a=w.owner_id)
  )
  order by case when w.deadline_at < (now() at time zone 'Asia/Seoul')::date then 1 else 0 end,
    w.deadline_at asc nulls last,w.created_at desc,w.id;
$$;
revoke all on function public.my_friend_wishlist_feed() from public, anon;
grant execute on function public.my_friend_wishlist_feed() to authenticated;
commit;
