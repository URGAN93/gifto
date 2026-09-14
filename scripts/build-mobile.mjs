import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });
// Explicit allowlist: never package SQL, work files, credentials, or node_modules.
for (const name of ['assets', 'css', 'js', 'pages']) {
  await cp(new URL(`../${name}`, import.meta.url), new URL(name, dist), { recursive: true });
}
await cp(new URL('../index.html', import.meta.url), new URL('index.html', dist));
await build({ absWorkingDir: root, entryPoints: ['mobile/entry.mjs'], bundle: true,
  outfile: 'dist/js/native.js', format: 'iife', platform: 'browser', target: ['es2022'],
  minify: true, legalComments: 'eof' });
const pages = ['index.html', ...(await readdir(new URL('pages/', dist))).filter(name => name.endsWith('.html')).map(name => `pages/${name}`)];
for (const page of pages) {
  const file = new URL(page, dist);
  const prefix = page.startsWith('pages/') ? '../' : '';
  let html = await readFile(file, 'utf8');
  html = html.replace(/(<meta\s+name="viewport"\s+content=")([^"]*)("\s*\/?\s*>)/i, (_, start, content, end) =>
    start + (content.includes('viewport-fit=cover') ? content : `${content}, viewport-fit=cover`) + end);
  const cdn = /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"\s*><\/script>/g;
  // Informational policy/support pages intentionally have no runtime SDK.
  if (!html.match(cdn)) { await writeFile(file, html); continue; }
  html = html.replace(cdn, `<script src="${prefix}js/native.js?v=20260915"></script>`)
    .replace(/<link[^>]+rel="manifest"[^>]*>/g, '')
    .replace(/<script[^>]+src="[^\"]*js\/pwa\.js[^\"]*"[^>]*><\/script>/g, '');
  await writeFile(file, html);
}
console.log(`Built ${pages.length} shared screens into dist; source web pages unchanged.`);
