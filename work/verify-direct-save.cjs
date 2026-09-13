const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf("document.querySelector('[data-save-wishlist]').addEventListener", source.indexOf('function setupCreateWishlist'));
const end = source.indexOf('\n}\nasync function compressProductPhoto', start);
async function check(hasProduct, existing = false) {
  let handler, inserted = [];
  let createdLists = 0;
  const messages = [];
  const button = {innerHTML:'저장', classList:{contains:()=>false, add(){}, remove(){}}};
  const ctx = {
    document:{querySelector(sel) {
      if(sel === '[data-save-wishlist]') return {addEventListener(_, h){handler=h;}};
      return {value:sel === '#list-title' ? '내 선물' : '설명'};
    }},
    photoBusy:false, initialWishlistLoad:Promise.resolve(), initialLoadError:null,
    savedList:existing ? {id:'existing-list', category:'housewarming'} : null, targetListId:existing ? 'existing-list' : null,
    GIFT_CATEGORIES:{birthday:{title:'생일 선물'}},
    name:{value:hasProduct ? '새 시계' : ''}, price:{value:hasProduct ? '100000' : ''},
    uploadedPhoto:hasProduct ? 'photo' : '', selectedEmoji:'🎁', parseMoney:Number,
    appData:{products:[]}, clearPhoto(){}, showDrafts(){},
    window:{giftoDb:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},
      from(table){return {
        update(){return {eq:async()=>({})};},
        insert(rows){
          if(table === 'wishlists') { createdLists++; return {select:()=>({single:async()=>({data:{id:'new-list'}})})}; }
          inserted=rows;return {select:async()=>({data:rows.map((r,i)=>({...r,id:'saved'+i}))})};
        }
      };}
    }},
    getCategory:()=> 'birthday', deadline:{value:'2026-10-01'}, localStorage:{setItem(){}},
    getOrCreateOwnWishlist:async()=>({id:'list'}), saveProducts(){}, clearRemoteWishlist(){},
    loadRemoteWishlist:async(owner, id)=>{assert.equal(id, existing ? 'existing-list' : 'new-list');return {products:[{id:'saved0'}]};}, location:{},
    showToast(message){messages.push(message);}, console
  };
  vm.createContext(ctx); vm.runInContext(source.slice(start,end).trim(),ctx);
  await handler({preventDefault(){},currentTarget:button});
  if(hasProduct) {
    assert.equal(inserted.length,1); assert.equal(inserted[0].name,'새 시계');
    assert.equal(inserted[0].image_url,'photo');
    assert.equal(inserted[0].wishlist_id,existing ? 'existing-list' : 'new-list');
    assert.equal(inserted[0].status,'open');
    assert.equal(createdLists,existing ? 0 : 1);
    assert.equal(ctx.location.href,'wishlist.html?owner=owner&list=' + (existing ? 'existing-list' : 'new-list'));
    assert.equal(messages.length,0);
  } else {
    assert.equal(inserted.length,0); assert.equal(ctx.location.href,undefined);
    assert.ok(messages[0].includes('상품'));
  }
}
Promise.all([check(true),check(false),check(true,true)]).then(()=>console.log('PASS: new list created; add targets existing list without creating or updating list; empty save blocked')).catch(error=>{console.error(error);process.exitCode=1;});
