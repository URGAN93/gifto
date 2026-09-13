const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const code=source.slice(source.indexOf('function renderFundingProgress'),source.indexOf('async function setupHomeWishlistStatus'));
function render(raised,pending){
  const list={dataset:{public:'true'},innerHTML:''};
  const product={id:'item',name:'선물',price:50000,raised,pending,status:'open',supporters:1};
  const ctx={document:{querySelectorAll:s=>s==='[data-product-list]'?[list]:[]},ownerId:'owner',activeProfile:{products:[product]},appData:{products:[product]},escapeHtml:String,won:String,encodeURIComponent};
  vm.createContext(ctx);vm.runInContext(code,ctx);ctx.renderProducts();return list.innerHTML;
}
const waiting=render(20000,10000);
assert.ok(waiting.includes('width:40%'));assert.ok(waiting.includes('width:20%'));
assert.ok(waiting.includes('확인 대기 10000'));assert.ok(!waiting.includes('<a hidden'));
assert.ok(render(50000,0).includes('<a hidden'));
const overflow=render(70000,10000);
assert.ok(overflow.includes('140% 모였어요'));assert.ok(overflow.includes('width:100%'));assert.ok(overflow.includes('<a hidden'));
assert.ok(!render(0,70000).includes('<a hidden'),'pending alone must not block new transfers');
console.log('PASS: confirmed/pending segments; 100% blocks new transfers; 140% remains visible; pending alone does not block');
