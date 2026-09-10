// No secrets are returned to the browser. Every request verifies a signed-in user.
const shops = ['samsung.com', 'samsungstore.com', 'apple.com', 'nike.com', 'adidas.co.kr', 'musinsa.com', '29cm.co.kr', 'wconcept.co.kr', 'coupang.com', 'coupang.link', 'smartstore.naver.com', 'brand.naver.com', 'shopping.naver.com', 'naver.me', 'gmarket.co.kr', 'ssg.com', 'lotteon.com', '11st.co.kr', 'oliveyoung.co.kr', 'ikea.com'];
function shopUrl(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !shops.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) throw new Error('UNSUPPORTED_SHOP');
  return url;
}
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, entity) => {
    const named = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};
    if (entity[0] !== '#') return named[entity.toLowerCase()] || match;
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}
function extract(html, base) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (attrs.content && !meta[key]) meta[key] = attrs.content;
  }
  let imageUrl = '';
  try {
    const image = new URL(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || '', base);
    if ((meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image']) && image.protocol === 'https:' && !image.username && !image.password && !image.port && !/^(localhost|\d+\.|\[)/i.test(image.hostname) && image.hostname.includes('.')) imageUrl = image.href;
  } catch { /* Missing/invalid metadata is a normal fallback. */ }
  return { imageUrl, title: (meta['og:title'] || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '')).slice(0, 200) };
}
async function limitedText(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('TOO_LARGE');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder(); let size = 0; let text = '';
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > limit) throw new Error('TOO_LARGE');
      text += decoder.decode(value, {stream:true});
    }
    return text + decoder.decode();
  } finally { await reader.cancel(); }
}
async function preview(value) {
  let url = shopUrl(value);
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await fetch(url, {redirect:'manual', signal, headers:{Accept:'text/html', 'User-Agent':'GIFTO-LinkPreview/1.0'}});
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      const target = response.headers.get('location'); if (!target) throw new Error('NO_PREVIEW');
      try { url = shopUrl(target, url); }
      catch { throw new Error('SHOP_BLOCKED'); }
      continue;
    }
    if ([401,403,429].includes(response.status)) { await response.body?.cancel(); throw new Error('SHOP_BLOCKED'); }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw new Error('NO_PREVIEW'); }
    return extract(await limitedText(response, 2 * 1024 * 1024), url);
  }
  throw new Error('NO_PREVIEW');
}
Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const allowed = origin === 'https://urgan93.github.io' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const headers = {'Content-Type':'application/json', 'Vary':'Origin', 'Access-Control-Allow-Origin':allowed ? origin : 'https://urgan93.github.io', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (origin && !allowed) return reply({error:'ORIGIN_NOT_ALLOWED'}, 403);
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (request.method !== 'POST') return reply({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const token = request.headers.get('authorization');
    if (!token?.startsWith('Bearer ')) return reply({error:'LOGIN_REQUIRED'}, 401);
    const auth = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {headers:{Authorization:token, apikey:Deno.env.get('SUPABASE_ANON_KEY')}, signal:AbortSignal.timeout(5000)});
    if (!auth.ok || !(await auth.json()).id) return reply({error:'LOGIN_REQUIRED'}, 401);
    const body = JSON.parse(await limitedText(request, 8192));
    if (typeof body.url !== 'string' || body.url.length > 4096) return reply({error:'INVALID_URL'}, 400);
    return reply(await preview(body.url));
  } catch (error) {
    return reply({error:['UNSUPPORTED_SHOP','SHOP_BLOCKED'].includes(error.message) ? error.message : 'NO_PREVIEW'}, 422);
  }
});
