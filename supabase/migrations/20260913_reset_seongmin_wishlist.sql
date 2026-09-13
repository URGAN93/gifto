-- User-requested reset: removes only the verified starter wishlist and its
-- cascading items/contributions. The profile and Kakao login remain intact.
delete from public.wishlists
where id = 'a06e05ba-8c99-4c0d-8dfd-09c2030682bb'
  and owner_id = 'a01888fb-5c9e-4bcb-906c-06a7ad4c979e';
