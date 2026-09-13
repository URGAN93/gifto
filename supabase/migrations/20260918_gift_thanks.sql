-- Run after 20260917_proof_photos.sql. Notifications are GIFTO inbox messages, not Kakao messages.
begin;
create table if not exists public.gift_thanks (
 contribution_id uuid primary key references public.contributions(id) on delete cascade,
 method text not null check (method in ('waiting_account','in_app','manual')),
 message text not null default '',
 sent_at timestamptz,
 read_at timestamptz
);
alter table public.gift_thanks enable row level security;
revoke all on public.gift_thanks from public, anon, authenticated;
grant select on public.gift_thanks to authenticated;
drop policy if exists "thanks visible to participants and owners" on public.gift_thanks;
create policy "thanks visible to participants and owners" on public.gift_thanks for select to authenticated using (
 exists(select 1 from public.contributions c join public.wishlist_items i on i.id=c.item_id
 join public.wishlists w on w.id=i.wishlist_id where c.id=contribution_id
 and (c.contributor_id=auth.uid() or w.owner_id=auth.uid()))
);
create or replace function public.send_gift_thanks(p_item uuid, p_contribution uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare proof text; linked integer; waiting integer;
begin
 select i.proof_message into proof from public.wishlist_items i join public.wishlists w on w.id=i.wishlist_id
 where i.id=p_item and w.owner_id=auth.uid() and i.status='proof_posted' for update of i;
 if not found then raise exception 'NOT_OWNER_OR_NO_PROOF'; end if;
 -- Lock recipient records too, so a simultaneous guest claim cannot miss delivery.
 perform 1 from public.contributions c where c.item_id=p_item and c.status='confirmed' order by c.id for update;
 insert into public.gift_thanks(contribution_id,method,message,sent_at)
 select c.id,case when c.contributor_id is null then 'waiting_account' else 'in_app' end,
 coalesce(proof,''),case when c.contributor_id is null then null else now() end
 from public.contributions c where c.item_id=p_item and c.status='confirmed'
 and (p_contribution is null or c.id=p_contribution)
 on conflict(contribution_id) do nothing;
 select count(*) filter(where t.method='in_app'),count(*) filter(where t.method='waiting_account') into linked,waiting
 from public.gift_thanks t join public.contributions c on c.id=t.contribution_id
 where c.item_id=p_item and c.status='confirmed' and (p_contribution is null or c.id=p_contribution);
 return jsonb_build_object('delivered',linked,'waiting',waiting);
end $$;
create or replace function public.mark_gift_thanks_manual(p_contribution uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare proof text;
begin
 select i.proof_message into proof from public.contributions c join public.wishlist_items i on i.id=c.item_id
 join public.wishlists w on w.id=i.wishlist_id where c.id=p_contribution and w.owner_id=auth.uid()
 and c.status='confirmed' and i.status='proof_posted' and c.contributor_id is null for update of c;
 if not found then raise exception 'NOT_OWNER_OR_NOT_GUEST'; end if;
 insert into public.gift_thanks(contribution_id,method,message,sent_at) values(p_contribution,'manual',coalesce(proof,''),now())
 on conflict(contribution_id) do update set method='manual',sent_at=now() where gift_thanks.method='waiting_account';
end $$;
create or replace function public.deliver_claimed_gift_thanks()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.contributor_id is null and new.contributor_id is not null and new.status='confirmed' then
 update public.gift_thanks set method='in_app',sent_at=now() where contribution_id=new.id and method='waiting_account';
 end if;
 return new;
end $$;
drop trigger if exists deliver_claimed_gift_thanks on public.contributions;
create trigger deliver_claimed_gift_thanks after update of contributor_id on public.contributions
for each row execute function public.deliver_claimed_gift_thanks();
create or replace function public.my_gift_thanks()
returns table(item_id uuid,item_name text,sender_name text,message text,sent_at timestamptz,read_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select i.id,i.name,p.display_name,t.message,max(t.sent_at),
 case when bool_and(t.read_at is not null) then max(t.read_at) else null end
 from public.gift_thanks t join public.contributions c on c.id=t.contribution_id
 join public.wishlist_items i on i.id=c.item_id join public.wishlists w on w.id=i.wishlist_id
 join public.profiles p on p.id=w.owner_id
 where c.contributor_id=auth.uid() and c.status='confirmed' and t.method='in_app'
 group by i.id,i.name,p.display_name,t.message order by max(t.sent_at) desc;
$$;
create or replace function public.read_gift_thanks(p_item uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
 update public.gift_thanks t set read_at=coalesce(t.read_at,now()) from public.contributions c
 where c.id=t.contribution_id and c.item_id=p_item and c.contributor_id=auth.uid() and t.method='in_app';
$$;
revoke all on function public.send_gift_thanks(uuid,uuid),public.mark_gift_thanks_manual(uuid),public.deliver_claimed_gift_thanks(),public.my_gift_thanks(),public.read_gift_thanks(uuid) from public,anon;
grant execute on function public.send_gift_thanks(uuid,uuid),public.mark_gift_thanks_manual(uuid),public.my_gift_thanks(),public.read_gift_thanks(uuid) to authenticated;
commit;
