import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const read = file => readFileSync(file, 'utf8');
test('mobile build contains all screens and only bundled startup scripts', () => {
  const pages = ['index.html', ...readdirSync('pages').filter(p => p.endsWith('.html')).map(p => `pages/${p}`)];
  for (const page of pages) {
    const html = read(`dist/${page}`);
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net|js\/pwa\.js|rel="manifest"/);
    const source = read(page);
    if (source.match(/cdn\.jsdelivr\.net\/npm\/@supabase/)) {
      assert.match(html, /js\/native\.js/);
      assert.ok(html.indexOf('js/native.js') < html.indexOf('js/supabase.js'));
      for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
        assert.ok(existsSync(path.resolve('dist', path.dirname(page), src.split('?')[0])), `${page}: ${src}`);
      }
    }
  }
  for (const file of ['.env', 'supabase', 'work', '.git', 'node_modules']) assert.equal(existsSync(`dist/${file}`), false);
});
test('native security config and callback registrations match', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'com.urganlab.gifto');
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.allowNavigation, undefined);
  assert.equal(config.android.allowMixedContent, false);
  const android = read('android/app/src/main/AndroidManifest.xml');
  assert.match(android, /android:allowBackup="false"/);
  assert.match(android, /android:usesCleartextTraffic="false"/);
  assert.match(android, /android:scheme="com.urganlab.gifto" android:host="auth" android:path="\/callback"/);
  assert.doesNotMatch(android, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
  assert.match(read('ios/App/App/Info.plist'), /NSCameraUsageDescription/);
  assert.match(read('ios/App/App/Info.plist'), /CFBundleURLSchemes/);
  const require = createRequire(import.meta.url);
  const project = require('xcode').project('ios/App/App.xcodeproj/project.pbxproj');
  project.parseSync();
  assert.ok(project.generateUuid()); // validates patched uuid dependency too
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /PrivacyInfo\.xcprivacy in Resources/);
  assert.match(read('ios/App/App/PrivacyInfo.xcprivacy'), /C617\.1/);
});
test('Edge Functions allow only explicit native origins and still authenticate', () => {
  for (const name of ['product-preview', 'remove-background']) {
    const code = read(`supabase/functions/${name}/index.ts`);
    assert.match(code, /https:\/\/localhost/);
    assert.match(code, /capacitor:\/\/localhost/);
    assert.match(code, /auth\/v1\/user/);
    assert.match(code, /LOGIN_REQUIRED/);
    assert.doesNotMatch(code, /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/);
  }
});

test('long product editor sheets stay scrollable above Android gesture areas', () => {
  const css = read('css/style.css');
  assert.match(css, /\.product-editor-layer\{(?=[^}]*overflow-y:auto)(?=[^}]*env\(safe-area-inset-bottom\))/);
  assert.match(css, /\.product-editor\{[^}]*max-height:calc\(100dvh[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
});

test('privacy, support, and account-deletion pages use the published support contact', () => {
  for (const page of ['pages/privacy.html', 'pages/support.html', 'pages/delete-account.html']) {
    const html = read(page);
    assert.match(html, /urgan93@gmail\.com/);
    assert.match(html, /<meta name="viewport"/);
  }
  assert.match(read('pages/delete-account.html'), /계정 삭제 요청/);
  assert.match(read('work/privacy-policy-draft.md'), /urgan93@gmail\.com/);
});

test('My Page links to the account and privacy pages', () => {
  const myPage = read('pages/my-page.html');
  for (const route of ['privacy.html', 'support.html', 'delete-account.html']) {
    assert.match(myPage, new RegExp(`href="${route}"`));
  }
});

test('release artifacts exclude server secrets and test-operation folders', () => {
  const files = readdirSync('dist', { recursive: true });
  assert.ok(!files.some(file => String(file).match(/service_role|\.env|security-tests|20260920_security/i)));
});

test('public shared profiles use the restricted RPC, with a temporary migration fallback only', () => {
  const app = read('js/app.js');
  assert.match(app, /rpc\('get_public_profile', \{p_owner:owner\}\)/);
  assert.match(app, /profileError\?\.code === 'PGRST202'/);
  const migration = read('supabase/migrations/20260920_security_hardening_draft.sql');
  assert.match(migration, /drop policy if exists "profiles readable"/);
  assert.match(migration, /revoke insert, update, delete on public\.contributions/);
});
