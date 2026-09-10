const allowedOrigins = new Set(['https://urgan93.github.io']);
function cors(request: Request) {
  const origin = request.headers.get('origin') || '';
  const allowed = allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  return {
    allowed,
    headers: {
      'Content-Type': 'application/json',
      'Vary': 'Origin',
      'Access-Control-Allow-Origin': allowed ? origin : 'https://urgan93.github.io',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  };
}
function reply(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {status, headers});
}
function dataUrlToBlob(value: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('INVALID_IMAGE');
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  if (bytes.byteLength > 400 * 1024) throw new Error('IMAGE_TOO_LARGE');
  return new Blob([bytes], {type: match[1]});
}
Deno.serve(async request => {
  const {allowed, headers} = cors(request);
  if (request.headers.get('origin') && !allowed) return reply({error:'ORIGIN_NOT_ALLOWED'}, 403, headers);
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (request.method !== 'POST') return reply({error:'METHOD_NOT_ALLOWED'}, 405, headers);
  try {
    const token = request.headers.get('authorization');
    if (!token?.startsWith('Bearer ')) return reply({error:'LOGIN_REQUIRED'}, 401, headers);
    const auth = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {headers:{Authorization:token, apikey:Deno.env.get('SUPABASE_ANON_KEY')!}, signal:AbortSignal.timeout(5000)});
    if (!auth.ok || !(await auth.json()).id) return reply({error:'LOGIN_REQUIRED'}, 401, headers);
    const {image} = await request.json();
    if (typeof image !== 'string' || image.length > 560000) throw new Error('INVALID_IMAGE');
    const form = new FormData();
    form.append('image_file', dataUrlToBlob(image), 'product-image.jpg');
    form.append('size', 'preview');
    form.append('format', 'png');
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {method:'POST', headers:{'X-Api-Key':Deno.env.get('REMOVE_BG_API_KEY')!}, body:form, signal:AbortSignal.timeout(30000)});
    if (!response.ok) {
      const reason = await response.text();
      if (response.status === 402) throw new Error('NO_CREDITS');
      console.error('remove.bg failed', response.status, reason.slice(0, 300));
      throw new Error('REMOVE_FAILED');
    }
    const output = new Uint8Array(await response.arrayBuffer());
    if (output.byteLength > 900 * 1024) throw new Error('REMOVE_FAILED');
    let binary = ''; for (const byte of output) binary += String.fromCharCode(byte);
    return reply({image:'data:image/png;base64,' + btoa(binary)}, 200, headers);
  } catch (error) {
    const messages: Record<string, string> = {
      LOGIN_REQUIRED:'로그인이 필요해요.', IMAGE_TOO_LARGE:'400KB 이하 사진으로 다시 시도해 주세요.', INVALID_IMAGE:'사진을 읽지 못했어요.', NO_CREDITS:'remove.bg 크레딧이 없어요.', REMOVE_FAILED:'배경을 지우지 못했어요. 잠시 후 다시 시도해 주세요.',
    };
    const code = error instanceof Error ? error.message : 'REMOVE_FAILED';
    return reply({error:code, message:messages[code] || messages.REMOVE_FAILED}, code === 'LOGIN_REQUIRED' ? 401 : 422, headers);
  }
});
