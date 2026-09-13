-- Run after the existing item lifecycle and contribution privacy migrations.
begin;
-- Retain private participant histories even if the older broad read policy exists.
drop policy if exists "contributions readable with item" on public.contributions;
drop policy if exists "owners and contributors read only their contributions" on public.contributions;
create policy "owners and contributors read only their contributions"
on public.contributions for select using (
  contributor_id = auth.uid() or exists (
    select 1 from public.wishlist_items i join public.wishlists w on w.id = i.wishlist_id
    where i.id = item_id and w.owner_id = auth.uid()
  )
);
-- Raw receipt secrets never appear on contributions (which owners can read).
create table if not exists public.contribution_receipts (
  token_hash text primary key,
  contribution_id uuid not null unique references public.contributions(id) on delete cascade
);
alter table public.contribution_receipts enable row level security;
revoke all on public.contribution_receipts from public, anon, authenticated;

create or replace function public.submit_gift_contribution(p_item uuid, p_amount integer, p_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt_hash text; existing public.contributions; result_id uuid; display_name text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_amount is null or p_amount < 1 then
    raise exception 'INVALID_REQUEST';
  end if;
  receipt_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  -- Serialize retries of the same receipt, including requests from two tabs.
  perform pg_advisory_xact_lock(hashtextextended(receipt_hash, 0));
  select c.* into existing from public.contribution_receipts r
    join public.contributions c on c.id = r.contribution_id where r.token_hash = receipt_hash;
  if found then
    if existing.item_id <> p_item or existing.amount <> p_amount then raise exception 'RECEIPT_MISMATCH'; end if;
    return existing.id;
  end if;
  perform 1 from public.wishlist_items i join public.wishlists w on w.id = i.wishlist_id
    where i.id = p_item and i.status = 'open' and w.is_public for share of i;
  if not found then raise exception 'ITEM_NOT_OPEN'; end if;
  select p.display_name into display_name from public.profiles p where p.id = auth.uid();
  insert into public.contributions(item_id, contributor_id, contributor_name, amount, status)
    values (p_item, auth.uid(), coalesce(display_name, '비회원 참여자'), p_amount, 'pending') returning id into result_id;
  insert into public.contribution_receipts values(receipt_hash, result_id);
  return result_id;
end;
$$;
revoke all on function public.submit_gift_contribution(uuid, integer, text) from public;
grant execute on function public.submit_gift_contribution(uuid, integer, text) to anon, authenticated;

create or replace function public.claim_gift_contribution(p_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare target_id uuid; current_owner uuid; display_name text;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_RECEIPT'; end if;
  select r.contribution_id into target_id from public.contribution_receipts r
    where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if target_id is null then raise exception 'RECEIPT_NOT_FOUND'; end if;
  select c.contributor_id into current_owner from public.contributions c where c.id = target_id for update;
  if current_owner is not null and current_owner <> auth.uid() then raise exception 'RECEIPT_ALREADY_CLAIMED'; end if;
  select p.display_name into display_name from public.profiles p where p.id = auth.uid();
  update public.contributions set contributor_id = auth.uid(), contributor_name = coalesce(display_name, contributor_name)
    where id = target_id;
  return target_id;
end;
$$;
revoke all on function public.claim_gift_contribution(text) from public;
grant execute on function public.claim_gift_contribution(text) to authenticated;

create or replace function public.decide_gift_contribution(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_accept is null then raise exception 'LOGIN_REQUIRED'; end if;
  update public.contributions c
    set status = case when p_accept then 'confirmed' else 'cancelled' end,
        confirmed_at = case when p_accept then now() else null end
    where c.id = p_id and c.status = 'pending' and exists (
      select 1 from public.wishlist_items i join public.wishlists w on w.id = i.wishlist_id
      where i.id = c.item_id and w.owner_id = auth.uid()
    );
  if not found then raise exception 'NOT_PENDING_OR_NOT_OWNER'; end if;
end;
$$;
revoke all on function public.decide_gift_contribution(uuid, boolean) from public;
grant execute on function public.decide_gift_contribution(uuid, boolean) to authenticated;

create or replace function public.my_gift_contributions()
returns table(id uuid, amount integer, status text, created_at timestamptz, item_name text,
  recipient_name text, owner_id uuid, list_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.amount, c.status, c.created_at, i.name, p.display_name, w.owner_id, w.id
  from public.contributions c join public.wishlist_items i on i.id = c.item_id
  join public.wishlists w on w.id = i.wishlist_id join public.profiles p on p.id = w.owner_id
  where c.contributor_id = auth.uid() order by c.created_at desc;
$$;
revoke all on function public.my_gift_contributions() from public;
grant execute on function public.my_gift_contributions() to authenticated;
commit;
