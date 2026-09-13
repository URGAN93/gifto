const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/app.js','utf8');
const code=src.slice(src.indexOf('async function deleteEmptyProduct'),src.indexOf('async function shareWishlist'));
async function check(last,count=0,error=null){
  let calls=0,redirect=null;
  const ctx={window:{giftoDb:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:table=>({select:()=>({eq:()=>table==='contributions'?Promise.resolve({count}):{maybeSingle:async()=>({data:{wishlist_id:'list',raised_amount:0}}),single:async()=>({data:{owner_id:'owner'}})}})}),rpc:async(name,args)=>{calls++;assert.equal(name,'delete_empty_gift_item');assert.equal(args.p_item,'item');return{data:error?null:{item_id:'item',list_deleted:last},error};}}},clearRemoteWishlist(){},localStorage:{removeItem(){}},appData:{products:[{id:'item'},{id:'other'}]},location:{replace:url=>{redirect=url;}}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  if(count || error){await assert.rejects(ctx.deleteEmptyProduct('item'));assert.equal(redirect,null);assert.equal(ctx.appData.products.length,2);assert.equal(calls,count?0:1);}
  else {assert.equal(await ctx.deleteEmptyProduct('item'),last);assert.equal(redirect,last?'my-page.html':null);assert.equal(ctx.appData.products.length,1);}
}
Promise.all([check(true),check(false),check(true,1),check(true,0,{code:'PGRST202'})]).then(()=>console.log('PASS (mocked RPC): last-item redirect, other items preserved, participation blocks delete, missing migration fails without local removal')).catch(e=>{console.error(e);process.exitCode=1;});
