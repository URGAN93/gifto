const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const app = fs.readFileSync('js/app.js', 'utf8');
const share = fs.readFileSync('js/wishlist-share.js', 'utf8');
const context = {URLSearchParams, location:{search:''}};
vm.createContext(context);
vm.runInContext(app.slice(app.indexOf('function sortWishlistProducts('), app.indexOf('async function setupHomeWishlistStatus')), context);
const products = [
  {id:'cheap', price:10000, status:'open', raised:0},
  {id:'reached', price:300000, status:'open', raised:300000},
  {id:'draft', price:900000, status:'draft', raised:0},
  {id:'expensive', price:100000, status:'open', raised:0, pending:200000},
  {id:'closed', price:500000, status:'closed', raised:0},
  {id:'proof', price:200000, status:'proof_posted', raised:0}
].map(p=>({...p,name:p.id,imageUrl:'',emoji:'',color:'',supporters:0}));
const ids = list => Array.from(list, p=>p.id);
assert.deepEqual(ids(context.sortWishlistProducts(products)), ['reached','expensive','cheap','closed','proof','draft']);
assert.deepEqual(ids(context.sortWishlistProducts(products,true)), ['reached','expensive','cheap','closed','proof']);
assert.equal(products[0].id,'cheap','sorting must not mutate caller array');
const list={dataset:{public:'false'},innerHTML:''};
Object.assign(context,{appData:{products},activeProfile:{products},ownerId:'owner',escapeHtml:String,won:String,encodeURIComponent,renderFundingProgress:()=>'',document:{querySelectorAll:s=>s==='[data-product-list]'?[list]:[]}});
context.renderProducts();
assert.deepEqual(ids(context.appData.products),['closed','proof','reached','expensive','cheap','draft']);
assert.ok(list.innerHTML.indexOf('>expensive<') < list.innerHTML.indexOf('>cheap<'));
assert.equal((list.innerHTML.match(/class="proof-alert"/g)||[]).length,0,'no extra alert row inside product cards');
for (const id of ['closed','proof','reached']) {
  assert.ok(list.innerHTML.includes('class="card-button" href="participants.html?product='+id+'">참여 보기'));
}
list.dataset.public='true';context.renderProducts();
assert.ok(!list.innerHTML.includes('>draft<'));
assert.ok(!list.innerHTML.includes('proof-alert'),'public must not show owner reminders');
assert.ok(!list.innerHTML.includes('participants.html'));
assert.ok(list.innerHTML.includes('class="card-button is-disabled" href="#">마감됨'));
assert.ok(list.innerHTML.includes('class="card-button" href="thankyou.html?product=proof&owner=owner&list=">인증 보기'));
assert.ok(list.innerHTML.indexOf('>cheap<') < list.innerHTML.indexOf('>closed<'));
context.URL = URL;
vm.runInContext(app.slice(app.indexOf('function getProductPurchaseUrl'), app.indexOf('function setupWishlistEditing')), context);
assert.equal(context.getProductPurchaseUrl({productUrl:'https://example.com/item'}),'https://www.coupang.com/');
for (const productUrl of ['', 'javascript:alert(1)', 'invalid']) {
  assert.equal(context.getProductPurchaseUrl({productUrl,name:'선물 & 시계'}),'https://www.coupang.com/');
}
assert.ok(share.includes("sortWishlistProducts(remote.products, true).filter(p => p.status === 'open' && !p.isClosed)"));
assert.ok(share.includes('링크 복사하기'));assert.ok(share.includes('이미지 저장하기'));
assert.ok(!share.includes('data-image-share'));assert.ok(!share.includes('navigator.share'));
assert.ok(share.includes('navigator.clipboard.writeText(url.href)'));
assert.ok(share.includes('qr.addData(url)'));
assert.ok(share.includes("fitText(label, 64, 145"), 'category caption must not repeat the nickname');
assert.ok(!share.includes("remote.profile.display_name + '님의 '"));
assert.match(share, /class="wishlist-share-actions"><button[^>]*data-link>링크 복사하기<\/button><button[^>]*data-save disabled>이미지 저장하기<\/button><\/div>/);
const css = fs.readFileSync('css/style.css','utf8');
assert.match(css, /\.wishlist-share-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
console.log('PASS: price/status ordering, pending not treated as confirmed, drafts private, editing array aligned, shared ordering, copy/save and QR retained');
