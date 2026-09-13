const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/app.js','utf8'),html=fs.readFileSync('pages/thankyou.html','utf8');
const code=src.slice(src.indexOf('async function setupThankYou'),src.indexOf('async function setupParticipants'));
const elements=new Map();
function element(key){if(!elements.has(key))elements.set(key,{value:'',files:[],hidden:true,innerHTML:'',events:{},classList:{add(){},toggle(){}},querySelector:s=>element(key+s),querySelectorAll(){return [...this.innerHTML.matchAll(/data-remove-proof="(\d+)"/g)].map(m=>{const e=element('remove'+m[1]);e.dataset={removeProof:m[1]};return e;});},addEventListener(type,fn){this.events[type]=fn;},click(){this.clicked=(this.clicked||0)+1;},closest:()=>element('section')});return elements.get(key);}
const item={id:'item',wishlist_id:'list',status:'closed',name:'테스트'};
const ctx={document:{querySelector:element},URLSearchParams,location:{search:'?product=item'},isUuid:()=>true,window:{giftoDb:{from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='wishlist_items'?item:{owner_id:'owner'}})})})}),auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})}}},compressProductPhoto:async()=>({url:'data:image/png;base64,test'}),showToast:msg=>{ctx.toast=msg;}};
(async()=>{
ctx.escapeHtml=s=>s;
ctx.setupProofBack=()=>{};
vm.createContext(ctx);vm.runInContext(code,ctx);await ctx.setupThankYou();
element('[data-photo-upload]').events.click();assert.equal(element('#thanks-photo').clicked,1);
element('[data-thanks-choose]').events.click();assert.equal(element('#thanks-photo').clicked,2);
element('[data-thanks-camera]').events.click();assert.equal(element('#thanks-camera').clicked,1);
await element('[data-thanks-submit]').events.click();assert.ok(ctx.toast.includes('사진 또는'));
for(const selector of ['#thanks-photo','#thanks-camera']){
const input=element(selector);input.files=[{}];await input.events.change({currentTarget:input});
assert.match(element('[data-thanks-photo-preview]').innerHTML,/data:image\/png;base64,test/);assert.equal(element('[data-thanks-photo-preview]').hidden,false);assert.equal(input.value,'');
}
const count=()=>[...element('[data-thanks-photo-preview]').innerHTML.matchAll(/<figure>/g)].length;
const choose=async files=>{const input=element('#thanks-photo');input.files=files;await input.events.change({currentTarget:input});};
assert.equal(count(),2);
await choose([{}, {}, {}]);assert.equal(count(),5);assert.equal(element('[data-thanks-choose]').disabled,true);
await choose([{}]);assert.equal(count(),5);assert.match(ctx.toast,/최대 5장/);
element('remove1').events.click();assert.equal(count(),4);assert.equal(element('[data-thanks-choose]').disabled,false);
const compress=ctx.compressProductPhoto;ctx.compressProductPhoto=async()=>{throw Error('bad image');};await choose([{}]);assert.equal(count(),4);ctx.compressProductPhoto=compress;
await choose([{}]);assert.equal(count(),5);
assert.equal(element('[data-photo-upload]').hidden,true);
while(count())element('remove0').events.click();assert.equal(element('[data-photo-upload]').hidden,false);assert.equal(element('[data-thanks-photo-preview]').hidden,true);
item.proof_image_url='legacy';await ctx.setupThankYou();assert.equal(count(),1);assert.match(element('[data-thanks-photo-preview]').innerHTML,/legacy/);
assert.ok(!code.includes('/5장'));
assert.match(html,/id="thanks-photo"[^>]*multiple/);
assert.match(html,/<div[^>]*data-thanks-photo-preview/);
assert.ok(src.includes('setupThankYou().catch('),'initialization must actually run');
assert.match(html, /id="thanks-camera"[^>]*capture="environment"/);
assert.ok(!html.match(/id="thanks-photo"[^>]*capture=/));
console.log('PASS (mock DOM): camera/gallery, batch selection, previews, max 5, delete/re-add, failed image, legacy photo, empty save, no fraction label');
})().catch(e=>{console.error(e);process.exitCode=1;});
