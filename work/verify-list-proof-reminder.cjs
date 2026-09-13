const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/app.js','utf8');
const code=src.slice(src.indexOf('async function setupMyWishlistCollections'),src.indexOf('// Refresh owner reminders'));
(async()=>{
  for(const pending of [0,1,2]){
    const container={innerHTML:'',querySelectorAll:()=>[]};
    const lists=[{id:'list',title:'생일',category:'birthday',wishlist_items:[{status:'open'},{status:'proof_posted'},...Array.from({length:pending},()=>({status:'closed'}))]}];
    const ctx={document:{querySelector:s=>s==='[data-wishlist-collections]'?container:{}},window:{giftoDb:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:()=>({select:()=>({eq:()=>({order:async()=>({data:lists})})})})}},GIFT_CATEGORIES:{birthday:{label:'생일 선물',icon:'G'}},encodeURIComponent,escapeHtml:String};
    vm.createContext(ctx);vm.runInContext(code,ctx);await ctx.setupMyWishlistCollections();
    assert.equal(container.innerHTML.includes('class="proof-alert"'),pending>0);
    if(pending)assert.ok(container.innerHTML.includes('구매 인증 필요 '+pending+'개'));
  }
  console.log('PASS (mock DOM): list reminders count 0/1/2; open and proof-posted excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});
