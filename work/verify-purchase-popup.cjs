const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/app.js','utf8');
const code=src.slice(src.indexOf('function getProductPurchaseUrl'),src.indexOf('function setupWishlistEditing'));
for(const partner of ['', 'https://link.coupang.com/a/test-fixture', 'https://link.coupang.com/a/g02Vps6BQ4']){
  const fields={};let opened=false,closed=false;
  const dialog={querySelector:s=>fields[s]??=( {addEventListener(type,fn){this[type]=fn;}} ),addEventListener(){},close(){closed=true;},showModal(){opened=true;}};
  const ctx={URL,document:{createElement:()=>dialog,body:{append(){}}}};
  const testCode = partner === 'https://link.coupang.com/a/g02Vps6BQ4' ? code : code.replace(/const GIFTO_COUPANG_PARTNER_URL = '[^']*';/,'const GIFTO_COUPANG_PARTNER_URL = '+JSON.stringify(partner)+';');
  vm.createContext(ctx);vm.runInContext(testCode,ctx);
  ctx.openProductPurchase({name:'테스트'});
  assert.ok(opened);assert.equal(fields['[data-purchase-go]'].href,partner||'https://www.coupang.com/');
  assert.equal(fields['[data-purchase-go]'].textContent,'쿠팡으로 이동');
  assert.ok(fields['[data-purchase-copy]'].textContent.includes('이에 따른 일정액의 수수료를 제공받습니다.'));
  assert.equal(fields['[data-purchase-copy]'].textContent.includes('제휴 연결 준비 중'), !partner);
  fields['[data-purchase-close]'].onclick();assert.ok(closed);
}
assert.ok(!src.includes("badge.textContent = '미완료'"));
assert.ok(src.includes("proof.setAttribute('aria-label', '구매 인증하기 — 아직 인증을 남기지 않았어요')"));
console.log('PASS (mock DOM): plain/affiliate destinations and disclosure, cancel closes, red-dot accessible label');
