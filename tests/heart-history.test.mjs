import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(){
 const el=tag=>({tag,children:[],attrs:{},dataset:{},append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes},setAttribute(k,v){this.attrs[k]=v},hasAttribute(k){return k in this.attrs},addEventListener(){},scrollTo({left}){this.scrollLeft=left;this.onscroll?.()}});
 const source=readFileSync('js/heart-history.js','utf8');
 const ctx={URL,URLSearchParams,document:{currentScript:{src:'https://example.test/js/heart-history.js'},createElement:el}};
 vm.runInNewContext(source.slice(source.indexOf('\n')+1,source.indexOf('  async function load('))+'\nthis.render=render;',ctx);
 const rows=Array.from({length:12},(_,i)=>({id:String(i),item_id:'item-'+i,item_name:'같은 이름',person:'친구',owner_id:'owner',amount:10000,status:'pending',created_at:new Date(Date.now()-(12-i)*3600000).toISOString()}));
 return {el,ctx,rows};
}
test('history has three cards per page, max nine, loops, and requires all button click',()=>{
 const {el,ctx,rows}=setup(),host=el('div');ctx.render(host,rows,'received');
 const track=host.children[0];assert.deepEqual(track.children.map(p=>p.children.length),[3,3,3,1]);
 assert.equal(track.children[0].children[0].tag,'a');
 assert.match(track.children[0].children[0].href,/product=item-11/);
 assert.match(track.children[3].children[0].href,/heart-history.html\?kind=received/);
 track.children.forEach((p,i)=>p.offsetLeft=i*400);track.scrollLeft=0;
 track.onpointerdown({clientX:0,clientY:0});track.onpointerup({clientX:80,clientY:0});assert.equal(track.scrollLeft,1200);
 track.onpointerdown({clientX:80,clientY:0});track.onpointerup({clientX:0,clientY:0});assert.equal(track.scrollLeft,0);
});
test('full view preserves old rows and filters identical product names by ID',()=>{
 const {el,ctx,rows}=setup(),host=el('div');host.attrs['data-heart-full']='';ctx.render(host,rows,'sent');
 const select=host.children[0].children[0],list=host.children[1];
 assert.equal(select.children.length,13);assert.equal(list.children.length,12);
 select.value='item-0';select.onchange();assert.equal(list.children.length,1);assert.equal(list.children[0].tag,'button');
 select.value='';select.onchange();assert.equal(list.children.length,12);
});
test('received preview shows only last 14 days; full view retains old history',()=>{
 const {el,ctx,rows}=setup(),host=el('div');
 rows[0].created_at=new Date(Date.now()-15*86400000).toISOString();
 ctx.render(host,[rows[0]],'received');assert.equal(host.children[0].textContent,'최근 2주간 받은 마음이 없어요.');assert.match(host.children[1].href,/kind=received/);
 for(const count of [1,2]){ctx.render(host,rows.slice(1,count+1),'received');assert.deepEqual(host.children[0].children.map(page=>page.children.length),[count,1]);}
 host.attrs['data-heart-full']='';ctx.render(host,rows,'received');assert.equal(host.children[1].children.length,12);
 const css=readFileSync('css/style.css','utf8');assert.match(css,/\.heart-more\{[^}]*min-height:0/);
});
test('cancelled sent records survive failures in receipt, relation, and thanks loading',async()=>{
 const source=readFileSync('js/heart-history.js','utf8');
 const ctx={window:{giftoContributions:{claim:async()=>{throw Error('receipt')}},giftoDb:{
 rpc:async name=>{if(name==='my_gift_contributions')return {data:[{id:'record',status:'cancelled',item_name:'선물',recipient_name:'친구'}]};throw Error('thanks');},
 from(){throw Error('relation');}
 }}};
 vm.runInNewContext(source.slice(source.indexOf('  async function load('),source.indexOf('  let generation=0;'))+'\nthis.load=load;',ctx);
 const rows=await ctx.load('sent','me');assert.equal(rows.length,1);assert.equal(rows[0].status,'cancelled');assert.equal(rows[0].thanksUnavailable,true);
});
test('sent preview also uses two weeks, with older records accessible in full view and no swipe hint',()=>{
 const {el,ctx,rows}=setup(),host=el('div');
 rows[0].created_at=new Date(Date.now()-15*86400000).toISOString();
 ctx.render(host,[rows[0]],'sent');
 assert.equal(host.children[0].textContent,'최근 2주간 보낸 마음이 없어요.');
 assert.match(host.children[1].href,/kind=sent/);
 ctx.render(host,[rows[1]],'sent');assert.equal(host.children.length,2);
 host.attrs['data-heart-full']='';ctx.render(host,rows,'sent');assert.equal(host.children[1].children.length,12);
 assert.ok(!readFileSync('js/heart-history.js','utf8').includes('옆으로 넘겨 더 확인해 보세요'));
});
test('both heart carousels loop left and right with either two or four pages',()=>{
 for(const kind of ['sent','received'])for(const count of [1,2,3,9]){
   const {el,ctx,rows}=setup(),host=el('div');ctx.render(host,rows.slice(0,count),kind);
   const track=host.children[0],total=track.children.length;track.children.forEach((page,i)=>page.offsetLeft=i*400);track.scrollLeft=0;
   for(const direction of [1,-1])for(let i=1;i<=total*2;i++){
     track.onpointerdown({clientX:100,clientY:0});track.onpointerup({clientX:100-direction*80,clientY:0});
     assert.equal(track.scrollLeft,((direction*i%total+total)%total)*400);
   }
 }
});
