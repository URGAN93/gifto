const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('js/app.js','utf8'),share=fs.readFileSync('js/wishlist-share.js','utf8');
async function check(count){
  const rects=[],texts=[],fills=[],borders=[];
  const canvasContext={fillRect(...r){fills.push(this.fillStyle);if(this.fillStyle==='#ffffff')rects.push(r);},strokeRect(...r){borders.push({color:this.strokeStyle,rect:r});},fillText(t){texts.push(t);},measureText:t=>({width:t.length*12})};
  const canvas={getContext:()=>canvasContext,toBlob:fn=>fn({})};
  const ctx={window:{qrcode:()=>({addData(){},make(){},getModuleCount:()=>21,isDark:()=>false})},document:{fonts:{ready:Promise.resolve()},createElement:()=>canvas}};
  vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function sortWishlistProducts'),app.indexOf('function renderProducts')),ctx);vm.runInContext(share,ctx);
  const products=Array.from({length:count},(_,i)=>({name:'open-'+i,price:i+1,status:'open',emoji:'G'}));
  products.push(...['closed','proof_posted','draft'].map(status=>({status,name:'excluded-'+status,price:9999})));
  await ctx.window.createWishlistShareImage({profile:{display_name:'나'},wishlist:{category:'birthday',title:'테스트'},products},'https://example.com');
  assert.equal(rects.length,Math.min(count,4));assert.ok(!texts.some(t=>t.startsWith('excluded-')));
  assert.equal(fills[0],'#faf9f6');assert.equal(borders.length,rects.length);
  assert.ok(borders.every(b=>b.color==='#e8e5df'));
  if(count===1)assert.deepEqual(rects[0],[64,298,952,448]);
  if(count>=2)for(let i=0;i<rects.length;i++)assert.deepEqual(rects[i],[64+(i%2)*488,298+Math.floor(i/2)*232,464,216]);
  if(count>4)assert.ok(texts.some(t=>t.startsWith('외 '+(count-4)+'개')));
  if(!count)assert.ok(texts.includes('현재 공개 중인 선물이 없어요'));
}
Promise.all([0,1,2,3,4,5].map(check)).then(()=>console.log('PASS: 0–5 open items; single full grid; 2x2 slots; max4; closed/proof/draft excluded')).catch(e=>{console.error(e);process.exitCode=1;});
