-- Preserve the original first-photo column for older clients.
begin;
alter table public.wishlist_items add column if not exists proof_image_urls text[];
update public.wishlist_items
set proof_image_urls = case when coalesce(proof_image_url, '') <> '' then array[proof_image_url] else array[]::text[] end
where proof_image_urls is null;
alter table public.wishlist_items alter column proof_image_urls set default array[]::text[];
alter table public.wishlist_items alter column proof_image_urls set not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'wishlist_proof_photos_max5' and conrelid = 'public.wishlist_items'::regclass) then
    alter table public.wishlist_items add constraint wishlist_proof_photos_max5 check (cardinality(proof_image_urls) <= 5);
  end if;
end $$;
commit;
