/* Browser-safe Supabase configuration. Never add a secret/service_role key. */
window.GIFTO_SUPABASE_URL = 'https://alzjvlbmnhukjwmiaduk.supabase.co';
window.GIFTO_SUPABASE_KEY = 'sb_publishable_3hmo2JM93sr4XSjK6jIa5A_LtR6UXKg';
window.giftoDb = window.supabase.createClient(
  window.GIFTO_SUPABASE_URL,
  window.GIFTO_SUPABASE_KEY
);
