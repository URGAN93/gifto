import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('js/app.js', 'utf8');
const code = source.slice(source.indexOf('async function setupHomeWishlistStatus'), source.indexOf('async function setupContribution'));

for (const kind of ['own', 'other', 'expired', 'offline']) {
  test(`home snapshot: ${kind}`, async () => {
    let finish;
    const response = new Promise(resolve => { finish = resolve; });
    const status = {hidden:true, innerHTML:'', querySelectorAll:()=>[], append(node){this.notice=node.textContent;}};
    const primary = {style:{}};
    const storage = new Map([['gifto-home-wishlist-status', JSON.stringify({
      ownerId:kind === 'other' ? 'someone-else' : 'me',
      savedAt:Date.now() - (kind === 'expired' ? 90000000 : 0),
      products:[{id:'cached', name:'Cached gift', price:1000}]
    })]]);
    const context = vm.createContext({
      document:{querySelector:s=>s==='[data-home-wishlist-status]'?status:s==='[data-home-primary-action]'?primary:null, createElement:()=>({})},
      window:{giftoDb:{auth:{getSession:async()=>({data:{session:{user:{id:'me'}}}})},
        from:()=>({select:()=>({eq:()=>({order:()=>response})})})}},
      localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
      sessionStorage:{getItem:()=>null},sortWishlistProducts:p=>p,
      GIFT_CATEGORIES:{},escapeHtml:String,won:String,encodeURIComponent,
    });
    vm.runInContext(code, context);
    const pending = context.setupHomeWishlistStatus();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(!status.hidden, kind === 'own' || kind === 'offline', 'show only recent own cache before network resolves');
    assert.equal(primary.style.visibility, 'visible');
    finish(kind === 'offline' ? {error:new Error('offline')} : {data:[]});
    await pending;
    if (kind === 'offline') {
      assert.match(status.innerHTML, /Cached gift/);
      assert.match(status.notice, /최신 내역/);
    } else {
      assert.equal(status.hidden, true, 'server deletion replaces cached list');
      assert.equal(storage.has('gifto-home-wishlist-status'), false);
    }
  });
}
