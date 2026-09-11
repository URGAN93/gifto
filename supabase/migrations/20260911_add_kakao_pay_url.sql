-- Run once in Supabase Dashboard > SQL Editor after the base schema.
-- Stores the address decoded from the owner's KakaoPay QR image.
alter table public.profiles add column if not exists kakao_pay_url text;
