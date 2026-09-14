import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('../js/supabase.js', import.meta.url), 'utf8');
const url = code.match(/GIFTO_SUPABASE_URL = '([^']+)'/)[1];
const key = code.match(/GIFTO_SUPABASE_KEY = '([^']+)'/)[1];
// Read-only public Auth settings; no sign-in, table reads, writes, or secret output.
const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
console.log(`Supabase Auth settings HTTP ${response.status}`);
if (!response.ok) process.exitCode = 1;
else { const settings = await response.json(); console.log(`Kakao provider enabled: ${settings.external?.kakao === true}`); }
