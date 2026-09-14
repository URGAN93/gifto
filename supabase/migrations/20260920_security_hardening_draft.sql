-- DRAFT ONLY — do not run on production and do not apply by filename sorting.
-- Prerequisite: the guest-contribution RPC and kakao_pay_url migrations are installed
-- and verified in a dedicated test project. Apply only after the app has changed
-- public profile reads to get_public_profile; the current app still reads profiles.
-- Public profile pages need four fields only.  Stop exposing every profile column
-- (for example birth_date) through the REST table endpoint.
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select to authenticated
using (auth.uid() = id);

create or replace function public.get_public_profile(p_owner uuid)
returns table(id uuid, display_name text, avatar_url text, kakao_pay_qr_url text, kakao_pay_url text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.display_name, p.avatar_url, p.kakao_pay_qr_url, p.kakao_pay_url
  from public.profiles p
  where p.id = p_owner
    and exists (
      select 1 from public.wishlists w where w.owner_id = p_owner and w.is_public
    );
$$;
revoke all on function public.get_public_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

-- All contribution creation and decisions must go through the validated RPCs.
drop policy if exists "signed in users add contributions" on public.contributions;
drop policy if exists "signed in users add contributions to open items" on public.contributions;
revoke insert, update, delete on public.contributions from anon, authenticated;
grant select on public.contributions to anon, authenticated;

-- Trigger and aggregate helpers are not public endpoints. Their triggers keep
-- working after this because the database invokes them internally.
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.prevent_birth_date_change() from public, anon, authenticated;
revoke all on function public.refresh_wishlist_item_progress(uuid) from public, anon, authenticated;
revoke all on function public.refresh_wishlist_item_progress_after_contribution() from public, anon, authenticated;

-- These account-only RPCs must never be callable without a session.
revoke all on function public.claim_gift_contribution(text) from public, anon;
grant execute on function public.claim_gift_contribution(text) to authenticated;
revoke all on function public.decide_gift_contribution(uuid, boolean) from public, anon;
grant execute on function public.decide_gift_contribution(uuid, boolean) to authenticated;
revoke all on function public.my_gift_contributions() from public, anon;
grant execute on function public.my_gift_contributions() to authenticated;

-- Validation after this migration is in supabase/security-tests/. Do not treat a
-- successful SQL execution as a security test; use three real test accounts.
