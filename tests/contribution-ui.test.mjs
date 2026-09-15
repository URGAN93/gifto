import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('js/app.js','utf8');
const code=source.slice(source.indexOf('async function setupContribution()'),source.indexOf('async function decodeQrPayload'));
test('contribution keeps friend/list context and hides custom input on preset selection',async()=>{
 const element=()=>({hidden:false,value:'',dataset:{},handlers:{},attrs:{},querySelector(){return null},classList:{values:{},toggle(key,value){this.values[key]=value}},setAttribute(key,value){this.attrs[key]=value},focus(){},addEventListener(name,fn){this.handlers[name]=fn}});
 const elements=new Map();
 const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)};
 const presets=[10000,30000,50000].map(amount=>Object.assign(element(),{dataset:{amount:String(amount)}}));
 const ctx={URLSearchParams,location:{search:'?product=gift&owner=friend&list=original-list'},ownerId:'friend',isUuid:()=>false,
 activeProfile:{name:'Friend',products:[{id:'gift',wishlistId:'original-list',status:'open',price:100000,raised:0,imageUrl:'https://example.test/cutout.png'}]},
 escapeHtml:v=>String(v||''),won:n=>String(n),sessionStorage:{getItem:()=>null},
 document:{querySelector:get,querySelectorAll:()=>presets,addEventListener(){}},
 window:{addEventListener(){},giftoDb:{auth:{getSession:async()=>({data:{session:{user:{id:'me'}}}})}}}};
 vm.runInNewContext(code,ctx);await ctx.setupContribution();
 assert.equal(get('.topbar .back').href,'wishlist.html?owner=friend&list=original-list');
 assert.match(get('[data-selected-product]').innerHTML, /src="https:\/\/example.test\/cutout.png"/);
 assert.match(get('[data-selected-product]').innerHTML, /contribution-photo/);
 get('[data-custom-amount]').handlers.click();assert.equal(get('[data-custom-amount-card]').hidden,false);
 assert.equal(get('[data-custom-amount]').classList.values['is-selected'],true);
 assert.equal(get('[data-kakao-send]').disabled,true);
 get('#custom-amount').value='10,000';get('#custom-amount').handlers.input();
 assert.equal(presets[0].classList.values['is-selected'],false);
 get('#custom-amount').value='20,000';get('#custom-amount').handlers.input();
 for(const preset of presets){
   get('[data-custom-amount]').handlers.click();preset.handlers.click();
   assert.equal(get('[data-custom-amount-card]').hidden,true);
   assert.equal(get('#custom-amount').value,'');
   assert.equal(get('[data-custom-amount]').attrs['aria-pressed'],'false');
   assert.equal(preset.classList.values['is-selected'],true);
   assert.equal(get('[data-kakao-send]').textContent,preset.dataset.amount+' 보내기');
 }
});
test('preset labels use full won amounts',()=>{
 const html=readFileSync('pages/contribute.html','utf8');
 for(const amount of ['10,000원','30,000원','50,000원'])assert.ok(html.includes(amount));
});
