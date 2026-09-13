const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/app.js','utf8');
const code=src.slice(src.indexOf('async function shareGiftThanks'),src.indexOf('async function setupThankYou'));
(async()=>{
let shared,copied,toast;
const ctx={URL,location:{href:'https://example.test/gifto/pages/wishlist.html'},navigator:{share:async data=>{shared=data;},clipboard:{writeText:async text=>{copied=text;}}},showToast:text=>{toast=text;}};
vm.createContext(ctx);vm.runInContext(code,ctx);
await ctx.shareGiftThanks('test-id','선물','고마워요');assert.equal(shared.url,'https://example.test/gifto/pages/thankyou.html?product=test-id');assert.match(shared.text,/고마워요/);assert.equal(copied,undefined);
ctx.navigator.share=async()=>{throw {name:'AbortError'};};await ctx.shareGiftThanks('id','선물');assert.equal(copied,undefined);
delete ctx.navigator.share;await ctx.shareGiftThanks('id','선물');assert.match(copied,/thankyou.html\?product=id/);assert.match(toast,/복사했어요/);
ctx.navigator.share=async()=>{throw Error('share failed');};copied=undefined;await ctx.shareGiftThanks('id','선물');assert.ok(copied);
assert.ok(src.includes("proof.textContent = '인증 수정'"));assert.ok(src.includes("share.className = 'product-close product-thanks-share'"));assert.ok(!src.includes("state.textContent = '인증 완료'"));
console.log('PASS (mock share API): direct proof URL, share, cancel, clipboard fallback, split card actions');
})().catch(e=>{console.error(e);process.exitCode=1;});
