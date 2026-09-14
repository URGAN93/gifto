-- A confirmed contribution can finish a gift.  Keep already-pending transfers
-- reviewable, but prevent any new transfer reports after that point.
begin;

drop function if exists public.submit_gift_contribution(uuid, integer, text);
create function public.submit_gift_contribution(
  p_item uuid, p_amount integer, p_token text, p_contributor_name text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt_hash text; existing public.contributions; result_id uuid; display_name text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_amount is null or p_amount < 1000 or p_amount % 1000 <> 0 then
    raise exception 'INVALID_REQUEST';
  end if;
  receipt_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
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
  if auth.uid() is null and length(trim(coalesce(p_contributor_name, ''))) not between 1 and 20 then
    raise exception 'GUEST_NAME_REQUIRED';
  end if;
  insert into public.contributions(item_id, contributor_id, contributor_name, amount, status)
    values (p_item, auth.uid(), coalesce(display_name, nullif(trim(p_contributor_name), ''), '비회원 참여자'), p_amount, 'pending')
    returning id into result_id;
  insert into public.contribution_receipts values(receipt_hash, result_id);
  return result_id;
end;
$$;
revoke all on function public.submit_gift_contribution(uuid, integer, text, text) from public;
grant execute on function public.submit_gift_contribution(uuid, integer, text, text) to anon, authenticated;

create or replace function public.decide_gift_contribution(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_item uuid; target_price integer; confirmed_total integer;
begin
  if auth.uid() is null or p_accept is null then raise exception 'LOGIN_REQUIRED'; end if;
  select i.id, i.price into target_item, target_price
    from public.contributions c join public.wishlist_items i on i.id = c.item_id
    join public.wishlists w on w.id = i.wishlist_id
    where c.id = p_id and c.status = 'pending' and w.owner_id = auth.uid()
    for update of i;
  if target_item is null then raise exception 'NOT_PENDING_OR_NOT_OWNER'; end if;
  update public.contributions set status = case when p_accept then 'confirmed' else 'cancelled' end,
    confirmed_at = case when p_accept then now() else null end
    where id = p_id and status = 'pending';
  if not found then raise exception 'NOT_PENDING_OR_NOT_OWNER'; end if;
  if p_accept then
    select coalesce(sum(amount), 0) into confirmed_total from public.contributions
      where item_id = target_item and status = 'confirmed';
    if confirmed_total >= target_price then
      update public.wishlist_items set status = 'closed', closed_at = coalesce(closed_at, now())
        where id = target_item and status = 'open';
    end if;
  end if;
end;
$$;
revoke all on function public.decide_gift_contribution(uuid, boolean) from public;
grant execute on function public.decide_gift_contribution(uuid, boolean) to authenticated;
commit;
