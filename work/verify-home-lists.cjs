const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const code=source.slice(source.indexOf('async function setupHomeWishlistStatus'),source.indexOf('async function setupContribution'));
const sorting=source.slice(source.indexOf('function sortWishlistProducts'),source.indexOf('function renderProducts'));
async function test(lists,fail=false){
  const status={hidden:true,innerHTML:'',querySelectorAll:()=>[]},primary={style:{}},loaded=[];
  const products={new:[{id:'new-one',name:'NEW',price:10000,status:'open'}],old:[{id:'old-one',name:'OLD1',price:50000,status:'closed'},{id:'old-two',name:'OLD2',price:30000,status:'proof_posted'}]};
  const ctx={document:{querySelector:s=>s==='[data-home-wishlist-status]'?status:s==='[data-home-primary-action]'?primary:null},
    window:{giftoDb:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:table=>{assert.equal(table,'wishlists');return{select:()=>({eq:(key,id)=>{assert.equal(key,'owner_id');assert.equal(id,'owner');return{order:async()=>({data:lists,error:fail?new Error('offline'):null})};}})};}}},
    loadRemoteWishlist:async(owner,id)=>{assert.equal(owner,'owner');assert.ok(id);loaded.push(id);return{wishlist:{category:id==='new'?'support':'birthday'},products:products[id]};},
    GIFT_CATEGORIES:{birthday:{label:'생일 선물'},support:{label:'응원 모금'}},
    escapeHtml:String,won:String,encodeURIComponent,localStorage:{setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null},console};
  vm.createContext(ctx);vm.runInContext(sorting+code,ctx);await ctx.setupHomeWishlistStatus();
  if(fail){assert.ok(status.textContent.includes('불러오지 못'));assert.equal(loaded.length,0);}
  else if(lists.length){assert.deepEqual(loaded,['new','old']);assert.equal((status.innerHTML.match(/class="home-wishlist-card"/g)||[]).length,3);assert.ok(status.innerHTML.indexOf('OLD1')<status.innerHTML.indexOf('OLD2'));assert.ok(status.innerHTML.indexOf('OLD2')<status.innerHTML.indexOf('NEW'));for(const id of ['new-one','old-one','old-two'])assert.ok(status.innerHTML.includes('product='+id+'&owner=owner&from=home'));}
  else assert.equal(status.hidden,true);
  assert.equal(primary.style.visibility,'visible');
  if(lists.length && !fail){
    assert.equal((status.innerHTML.match(/class="home-proof-hint"/g)||[]).length,1);
    assert.ok(status.innerHTML.includes('생일 선물<em class="home-proof-hint">인증 대기</em></p>'));
    assert.equal((status.innerHTML.match(/<p>생일 선물/g)||[]).length,2);
    assert.equal((status.innerHTML.match(/<p>응원 모금<\/p>/g)||[]).length,1);
    assert.ok(!status.innerHTML.includes('나의 위시리스트'));
  }
}
Promise.all([test([{id:'new'},{id:'old'}]),test([]),test([],true)]).then(()=>console.log('PASS: two lists with 1+2 items render all 3 by price, correct participation links, empty and query-error states')).catch(e=>{console.error(e);process.exitCode=1;});
