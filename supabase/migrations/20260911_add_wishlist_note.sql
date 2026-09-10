-- Run once in Supabase Dashboard > SQL Editor.
alter table public.wishlists add column if not exists note text;
