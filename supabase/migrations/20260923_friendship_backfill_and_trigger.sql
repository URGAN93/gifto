-- Run after 20260921_friend_wishlists.sql and 20260922_friend_wishlist_feed.sql.
-- Friendships represent account-linked participation, not payment verification.
-- Guest display names alone NEVER establish an identity or a friendship.
begin;

create or replace function public.link_contribution_friendship()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare recipient_id uuid;
begin
  if new.contributor_id is null then return new; end if;

  select w.owner_id into recipient_id
  from public.wishlist_items i
  join public.wishlists w on w.id = i.wishlist_id
  where i.id = new.item_id;

  if recipient_id is not null and recipient_id <> new.contributor_id then
    insert into public.friendships(member_a, member_b)
    values (least(recipient_id, new.contributor_id),
            greatest(recipient_id, new.contributor_id))
    on conflict (member_a, member_b) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.link_contribution_friendship() from public, anon, authenticated;

-- Covers both signed-in submissions and subsequent guest receipt claims.
-- The existing claim function can also insert the pair safely (same unique key).
drop trigger if exists link_contribution_friendship on public.contributions;
create trigger link_contribution_friendship
after insert or update of contributor_id on public.contributions
for each row execute function public.link_contribution_friendship();

-- Repair old, already-account-linked participation; do not match by name.
-- Preserve existing pairs, hidden-list preferences, and contribution records.
insert into public.friendships(member_a, member_b)
select distinct least(c.contributor_id, w.owner_id),
                greatest(c.contributor_id, w.owner_id)
from public.contributions c
join public.wishlist_items i on i.id = c.item_id
join public.wishlists w on w.id = i.wishlist_id
where c.contributor_id is not null
  and w.owner_id is not null
  and c.contributor_id <> w.owner_id
on conflict (member_a, member_b) do nothing;

commit;
