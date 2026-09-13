const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const code=source.slice(source.indexOf('async function requireWishlistPaymentSetup'),source.indexOf('async function setupCreateWishlist'));
(async()=>{
  for(const [qr,error,allowed] of [['https://example.com/qr.png',null,true],['',null,false],['  ',null,false],[null,null,false],['old',{message:'offline'},false]]){
    const ctx={window:{giftoDb:{from:()=>({select:()=>({eq:(key,id)=>{assert.equal(key,'id');assert.equal(id,'owner');return {maybeSingle:async()=>({data:{kakao_pay_qr_url:qr},error})};}})})}}};
    vm.createContext(ctx);vm.runInContext(code,ctx);
    if(allowed)await ctx.requireWishlistPaymentSetup('owner');
    else await assert.rejects(ctx.requireWishlistPaymentSetup('owner'));
  }
  console.log('PASS: saved QR required, empty/whitespace/missing QR and database errors blocked');
})().catch(e=>{console.error(e);process.exitCode=1;});
