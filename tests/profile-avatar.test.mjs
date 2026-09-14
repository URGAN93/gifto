import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const authSource = readFileSync('js/supabase.js', 'utf8');
const helpers = authSource.slice(authSource.indexOf('function isKakaoProfileAvatarUrl'), authSource.indexOf('async function restoreAuthNavigation'));
const appSource = readFileSync('js/app.js', 'utf8');
const setup = appSource.slice(appSource.indexOf('async function setupProfileAvatar'), appSource.indexOf('function setupProfileEdit'));
const oldUrl = 'http://k.kakaocdn.net/dn/old/img_640x640.jpg';
const freshUrl = 'https://k.kakaocdn.net/dn/current/img_640x640.jpg';
const upload = 'data:image/jpeg;base64,YQ==';
const userSession = () => ({ user: { id: 'avatar-test-user', user_metadata: { full_name: '테스트', avatar_url: freshUrl }, identities: [] } });
const cacheKey = 'gifto-profile-avatar:avatar-test-user';

class Element {
  children = [];
  listeners = {};
  style = {};
  nodes = new Map();
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ''; }
  replaceChildren(...children) { this.text = ''; this.children = children; }
  append(child) { this.children.push(child); }
  contains(child) { return this.children.includes(child); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  fire(type) { return this.listeners[type]?.({ currentTarget: this, target: this }); }
  click() { return this.fire('click'); }
  remove() { this.removed = true; }
  querySelector(selector) {
    if (selector === 'img') return this.children.find(child => child.tag === 'img') || null;
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector);
  }
}

function fixture({ profile = { avatar_url: oldUrl, display_name: '테스트' }, error = null, cached, session = userSession(), saveError = null } = {}) {
  const storage = new Map(cached === undefined ? [] : [[cacheKey, cached]]);
  const avatar = new Element(), toggle = new Element(), accountName = new Element(), body = new Element();
  accountName.textContent = '테스트';
  const writes = [], toasts = [];
  const context = {
    URL, wishlistTitleInput: null,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: {
      body,
      createElement: tag => Object.assign(new Element(), { tag }),
      querySelector: selector => ({ '[data-profile-avatar-toggle]': toggle, '[data-account-name]': accountName })[selector] || null,
      querySelectorAll: selector => ({ '[data-account-avatar]': [avatar], '[data-account-name]': [accountName] })[selector] || []
    },
    window: { giftoDb: {
      auth: { getSession: async () => ({ data: { session } }) },
      from: table => {
        assert.equal(table, 'profiles');
        return {
          select: () => ({ eq: (_column, id) => {
            assert.equal(id, session.user.id);
            return { maybeSingle: async () => ({ data: profile, error }) };
          } }),
          update: value => ({ eq: async (_column, id) => { writes.push({ ...value, id }); return { error: saveError }; } })
        };
      }
    } },
    compressProductPhoto: async () => ({ url: upload }),
    showToast: message => toasts.push(message),
    clearRemoteWishlist() {}, contributionChannel: null
  };
  vm.createContext(context);
  vm.runInContext(helpers + '\n' + setup, context);
  return { context, avatar, toggle, storage, writes, toasts, session,
    open: async () => { await toggle.click(); return body.children.at(-1); } };
}

test('avatar upgrades only known Kakao HTTP hosts; preserves HTTPS and uploads', () => {
  const { context: c } = fixture();
  assert.equal(c.normalizeProfileAvatarUrl(oldUrl), oldUrl.replace('http:', 'https:'));
  assert.equal(c.normalizeProfileAvatarUrl('http://img1.kakaocdn.net/a.jpg?x=1'), 'https://img1.kakaocdn.net/a.jpg?x=1');
  assert.equal(c.normalizeProfileAvatarUrl('http://profile.kakao.com/a.jpg'), 'https://profile.kakao.com/a.jpg');
  assert.equal(c.normalizeProfileAvatarUrl(freshUrl), freshUrl);
  assert.equal(c.normalizeProfileAvatarUrl(upload), upload);
  assert.equal(c.normalizeProfileAvatarUrl('http://example.test/a.jpg'), 'http://example.test/a.jpg');
  for (const value of ['https://kakaocdn.net.evil.test/a', 'http://notkakao.com/a', 'http://k.kakaocdn.net:8888/a']) {
    assert.equal(c.isKakaoProfileAvatarUrl(value), false);
  }
  for (const value of ['javascript:alert(1)', 'file:///photo.jpg', 'https://user:secret@k.kakaocdn.net/a', null, {}]) {
    assert.equal(c.normalizeProfileAvatarUrl(value), '');
  }
});

test('broken Kakao image retries current account metadata, then shows one initial', () => {
  const f = fixture();
  f.context.renderProfileAvatar(f.avatar, oldUrl, '테스트', f.session);
  let photo = f.avatar.querySelector('img');
  assert.equal(photo.src, oldUrl.replace('http:', 'https:'));
  assert.equal(photo.alt, ''); // no clipped long alt text while loading
  photo.fire('error');
  photo = f.avatar.querySelector('img');
  assert.equal(photo.src, freshUrl);
  photo.fire('error');
  assert.equal(f.avatar.querySelector('img'), null);
  assert.equal(f.avatar.textContent, '테');
  assert.deepEqual(f.writes, []);
});

test('successful image gets accessible text and stale events cannot replace a newer avatar', () => {
  const f = fixture();
  f.context.renderProfileAvatar(f.avatar, oldUrl, '테스트', f.session);
  const previous = f.avatar.querySelector('img');
  f.context.renderProfileAvatar(f.avatar, upload, '테스트', f.session);
  const current = f.avatar.querySelector('img');
  previous.fire('error'); previous.fire('load');
  assert.equal(f.avatar.querySelector('img'), current);
  current.fire('load');
  assert.equal(current.alt, '테스트 프로필 사진');
});

test('custom uploads, other users, and explicit no-photo choices never fall back to my Kakao photo', () => {
  const f = fixture({ cached: '' });
  assert.equal(f.context.getAccountAvatarUrl(f.session), '');
  f.context.renderProfileAvatar(f.avatar, '', '테스트', f.session);
  assert.equal(f.avatar.querySelector('img'), null);
  f.context.renderProfileAvatar(f.avatar, upload, '테스트', f.session);
  f.avatar.querySelector('img').fire('error');
  assert.equal(f.avatar.querySelector('img'), null);
  f.context.renderProfileAvatar(f.avatar, oldUrl, '다른 사람', null);
  f.avatar.querySelector('img').fire('error');
  assert.equal(f.avatar.textContent, '다');
  assert.equal(f.avatar.querySelector('img'), null);
});

test('auth rendering uses the same HTTPS and image failure handling', () => {
  const f = fixture({ cached: oldUrl });
  f.context.renderAccountProfile(f.session);
  assert.equal(f.avatar.querySelector('img').src, oldUrl.replace('http:', 'https:'));
  f.context.renderAccountProfile(null);
  assert.equal(f.avatar.textContent, 'G');
  assert.equal(f.avatar.querySelector('img'), null);
});

test('My Page and editor use secure image URLs without modifying stored URLs', async () => {
  const f = fixture();
  await f.context.setupProfileAvatar();
  assert.equal(f.avatar.querySelector('img').src, oldUrl.replace('http:', 'https:'));
  assert.equal(f.storage.get(cacheKey), oldUrl);
  const modal = await f.open();
  const preview = modal.querySelector('[data-avatar-preview]');
  assert.equal(preview.querySelector('img').src, oldUrl.replace('http:', 'https:'));
  preview.querySelector('img').fire('error');
  preview.querySelector('img').fire('error');
  assert.equal(preview.textContent, '테');
  await modal.querySelector('[data-save-avatar]').click();
  assert.deepEqual(f.writes, []); // merely opening/saving is not a photo deletion
});

test('failed or missing profile read preserves cache and falls back to login metadata only when uncached', async () => {
  for (const result of [{ profile: null, error: { message: 'offline' } }, { profile: null }]) {
    for (const cached of [undefined, upload, '']) {
      const f = fixture({ ...result, cached });
      await f.context.setupProfileAvatar();
      assert.equal(f.storage.has(cacheKey), cached !== undefined);
      assert.equal(f.storage.get(cacheKey), cached);
      if (cached === '') assert.equal(f.avatar.querySelector('img'), null);
      else assert.equal(f.avatar.querySelector('img').src, cached ?? freshUrl);
      const modal = await f.open();
      await modal.querySelector('[data-save-avatar]').click();
      assert.deepEqual(f.writes, []);
    }
  }
});

test('a successful empty server profile remains an explicit no-photo choice', async () => {
  const f = fixture({ profile: { avatar_url: null }, cached: oldUrl });
  await f.context.setupProfileAvatar();
  assert.equal(f.storage.get(cacheKey), '');
  assert.equal(f.avatar.querySelector('img'), null);
  f.context.renderAccountProfile(f.session);
  assert.equal(f.avatar.querySelector('img'), null);
});

test('explicit upload/delete require Save, and reopening uses the last saved photo', async () => {
  const f = fixture();
  await f.context.setupProfileAvatar();
  let modal = await f.open();
  const input = modal.querySelector('[data-avatar-file]');
  input.files = [{ type: 'image/jpeg' }];
  await input.fire('change');
  assert.deepEqual(f.writes, []);
  await modal.querySelector('[data-save-avatar]').click();
  assert.deepEqual(f.writes, [{ avatar_url: upload, id: f.session.user.id }]);
  modal = await f.open();
  assert.equal(modal.querySelector('[data-avatar-preview]').querySelector('img').src, upload);
  await modal.querySelector('[data-remove-avatar]').click();
  assert.equal(f.writes.length, 1);
  await modal.querySelector('[data-save-avatar]').click();
  assert.equal(f.writes[1].avatar_url, null);
  assert.equal(f.storage.get(cacheKey), '');
  assert.equal(f.avatar.querySelector('img'), null);
  modal = await f.open();
  assert.equal(modal.querySelector('[data-avatar-preview]').querySelector('img'), null);
});

test('failed save and cancelling the editor preserve the displayed and cached photo', async () => {
  const f = fixture({ saveError: { message: 'offline' } });
  await f.context.setupProfileAvatar();
  const modal = await f.open();
  await modal.querySelector('[data-remove-avatar]').click();
  await modal.querySelector('[data-save-avatar]').click();
  assert.equal(f.storage.get(cacheKey), oldUrl);
  assert.equal(f.avatar.querySelector('img').src, oldUrl.replace('http:', 'https:'));
  assert.match(f.toasts.at(-1), /저장하지 못했어요/);
  await modal.querySelector('[data-close-avatar]').click();
  const reopened = await f.open();
  assert.equal(reopened.querySelector('[data-avatar-preview]').querySelector('img').src, oldUrl.replace('http:', 'https:'));
});
