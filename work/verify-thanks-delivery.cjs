const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/gift-thanks.js','utf8');
class Element {
 constructor(){this.children=[];this.fields={};this.dataset={};}
 append(e){this.children.push(e);}
 prepend(e){this.children.unshift(e);}
 querySelector(s){return this.fields[s]??=new Element();}
 querySelectorAll(){return this.rows||[];}
 addEventListener(type,fn){this[type]=fn;}
 showModal(){} close(){} remove(){}
}
(async()=>{
let dialog,calls=[],shared=0,refresh=0,result={delivered:1,waiting:1},fail=false;
const records=[{contribution_id:'sent',method:'in_app',read_at:null},{contribution_id:'manual',method:'manual'},{contribution_id:'waiting',method:'waiting_account'}];
const ctx={window:{addEventListener(){},giftoDb:{rpc:async(name,args)=>{calls.push({name,args});return fail?{error:Error('missing migration')}:{data:result};},from:()=>({select:()=>({in:async()=>({data:records})})})}},document:{querySelector:()=>null,createElement:()=>new Element(),body:{append(e){dialog=e;}}},confirm:()=>true,showToast(){},shareGiftThanks:async()=>{shared++;},setupParticipants:async()=>{refresh++;}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const api=ctx.window.giftoThanks;
assert.match(api.deliveryLabel(records[0]),/안 읽음/);assert.match(api.deliveryLabel({...records[0],read_at:'now'}),/읽음/);assert.match(api.deliveryLabel(records[1]),/직접 표시/);assert.match(api.deliveryLabel(records[2]),/가입 연결 대기/);
api.open('item','선물',()=>{shared++;});assert.equal(calls.length,0,'opening never sends');
await dialog.querySelector('[data-link]').onclick();assert.equal(shared,1);assert.equal(calls.length,0,'sharing never marks delivered');
await dialog.querySelector('[data-send]').onclick();assert.equal(calls[0].name,'send_gift_thanks');assert.match(dialog.querySelector('[data-result]').textContent,/전달 1건/);
fail=true;await dialog.querySelector('[data-send]').onclick();assert.match(dialog.querySelector('[data-result]').textContent,/SQL/);assert.equal(dialog.querySelector('[data-send]').disabled,false);fail=false;
const entries=['sent','manual','waiting','new','pending'].map(id=>({id,status:id==='pending'?'pending':'confirmed',contributor_id:id==='new'?'account':null}));
const view=new Element();view.rows=entries.map(e=>{const li=new Element();li.dataset.contributionId=e.id;return li;});
await api.decorate(view,{id:'item',status:'proof_posted',name:'선물'},entries);
const summary=view.children[0];assert.match(summary.innerHTML,/전달 전 2건/);
summary.querySelector('[data-unthanked-only]').onchange({target:{checked:true}});assert.deepEqual(view.rows.map(r=>!!r.hidden),[true,true,false,false,true]);
const guestActions=view.rows[2].children[0].children;assert.equal(guestActions.length,2);
let before=calls.length;await guestActions[0].onclick();assert.equal(calls.length,before);assert.equal(shared,2);
await guestActions[1].onclick();assert.equal(calls.at(-1).name,'mark_gift_thanks_manual');assert.equal(refresh,1);
await view.rows[3].children[0].children[0].onclick();assert.equal(calls.at(-1).args.p_contribution,'new');assert.equal(refresh,2);
const sql=fs.readFileSync('supabase/migrations/20260918_gift_thanks.sql','utf8');
assert.match(sql,/enable row level security/);assert.match(sql,/w.owner_id=auth.uid\(\)/);assert.match(sql,/c.status='confirmed'/);assert.match(sql,/on conflict\(contribution_id\) do nothing/);assert.match(sql,/after update of contributor_id/);assert.match(sql,/c.contributor_id=auth.uid\(\)/);
for(const page of ['wishlist','participants','thankyou','my-page'])assert.match(fs.readFileSync(`pages/${page}.html`,'utf8'),/gift-thanks.js\?v=20260997/);
console.log('PASS (mock DOM/RPC + SQL static checks): explicit send, status/filter, manual confirmation, guest link does not mark delivery, per-entry send, errors, module wiring');
})().catch(e=>{console.error(e);process.exitCode=1;});
