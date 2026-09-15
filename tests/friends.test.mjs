import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('home limits to nine, has no card menus, swipes to all, and filters hidden lists', async()=>{
  const el=()=>({children:[],attrs:{},dataset:{},style:{},addEventListener(){},scrollTo({left}){this.scrollLeft=left;this.onscroll?.()},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},setAttribute(k,v){this.attrs[k]=v},hasAttribute(k){return k in this.attrs}});
  const host=el(), hiddenTab=el(), visibleTab=el(); hiddenTab.dataset.friendsTab='hidden'; visibleTab.dataset.friendsTab='visible';
  const rows=Array.from({length:12},(_,i)=>({list_id:String(i),owner_id:'friend',title:'List '+i,hidden:false}));
  let fail=false;
  const ctx={URL,document:{currentScript:{src:'https://example.test/js/friends.js'},createElement:el,querySelector:()=>host,querySelectorAll:()=>[visibleTab,hiddenTab]},window:{addEventListener(){},giftoDb:{auth:{getSession:async()=>({data:{session:{user:{id:'me'}}}})},rpc:async(name,args)=>{if(name==='my_friend_wishlist_feed')return {data:rows};if(fail)return {error:{}};return {};}}}};
  vm.runInNewContext(readFileSync('js/friends.js','utf8'),ctx);
  await ctx.window.giftoFriends.refresh();
  assert.deepEqual(host.children[0].children.map(p=>p.children.length),[3,3,3,1]);
  assert.equal(host.children[0].children[0].children[0].children.length,1);
  let opened=0;ctx.window.giftoFriendsOpenAll=()=>opened++;
  const track=host.children[0];track.children.forEach((page,i)=>page.offsetLeft=i*400);
  track.scrollLeft=800;track.onscroll();assert.equal(opened,0);
  track.scrollLeft=1200;track.onscroll();track.onscroll();assert.equal(opened,0);
  track.onpointerdown({clientX:200,clientY:0});track.onpointerup({clientX:100,clientY:0});assert.equal(track.scrollLeft,0);
  track.onpointerdown({clientX:100,clientY:0});track.onpointerup({clientX:200,clientY:0});assert.equal(track.scrollLeft,1200);
  assert.match(track.children[3].children[0].href,/pages\/friends.html$/);
  rows[0].hidden=true;
  host.attrs['data-friends-full']=''; await ctx.window.giftoFriends.refresh();
  assert.equal(host.children.length,11);
  hiddenTab.onclick();assert.equal(host.children.length,1);
  rows[0].hidden=false;
  visibleTab.onclick();assert.equal(host.children.length,12);
  delete host.attrs['data-friends-full'];
  for (const count of [3,2,1]) {
    rows.splice(count);
    await ctx.window.giftoFriends.refresh();
    assert.deepEqual(host.children[0].children.map(page=>page.children.length),[count,1]);
    const small=host.children[0];small.children.forEach((page,i)=>page.offsetLeft=i*400);small.scrollLeft=0;
    for(const direction of [1,-1]) for(let i=0;i<4;i++) {
      small.onpointerdown({clientX:100,clientY:0});small.onpointerup({clientX:100-direction*80,clientY:0});
      assert.equal(small.scrollLeft,i%2===0?400:0);
    }
  }
  assert.match(readFileSync('css/style.css','utf8'), /\[data-friend-list\] \.friend-more\{min-height:0;align-content:center;justify-items:center\}/);
});
