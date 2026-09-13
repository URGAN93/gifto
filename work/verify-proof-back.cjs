const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/app.js','utf8');
const code=src.slice(src.indexOf('function setupProofBack'),src.indexOf('async function setupThankYou'));
for(const referrer of ['https://example.test/gifto/pages/wishlist.html?owner=me&list=list1','https://example.test/gifto/pages/participants.html?product=item','','https://evil.test/gifto/pages/wishlist.html','https://example.test/other/wishlist.html']){
 let handler,wentBack=false,prevented=false;
 const back={addEventListener:(type,fn)=>{handler=fn;}};
 const ctx={URL,document:{referrer,querySelector:()=>back},location:{href:'https://example.test/gifto/pages/thankyou.html?product=item',origin:'https://example.test'},history:{length:2,back:()=>{wentBack=true;}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);ctx.setupProofBack({wishlist_id:'list1'},'me');
 const valid=referrer.startsWith('https://example.test/gifto/pages/');
 assert.equal(back.href,valid?referrer:'https://example.test/gifto/pages/wishlist.html?owner=me&list=list1');
 if(valid){handler({preventDefault(){prevented=true;}});assert.ok(wentBack&&prevented);wentBack=false;ctx.history.length=1;handler({preventDefault(){}});assert.equal(wentBack,false);}
 else assert.equal(handler,undefined);
}
console.log('PASS (mock navigation): list/participants return, direct-link fallback, external referrer rejected, single history entry');
