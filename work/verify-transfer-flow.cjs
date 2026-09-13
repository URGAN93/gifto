const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict'), crypto = require('node:crypto').webcrypto;
const source = fs.readFileSync('js/app.js','utf8');
const flow = source.slice(source.indexOf('async function setupContribution()'),source.indexOf('async function decodeQrPayload'));
function element() {
  return {hidden:false,disabled:false,value:'',children:[],listeners:{},classList:{toggle(){}},
    setAttribute(){},addEventListener(k,fn){this.listeners[k]=fn;},append(...nodes){this.children.push(...nodes);},
    replaceChildren(){this.children=[];},querySelectorAll(){return this.children.filter(n=>n.type==='button');},
    set innerHTML(value){this.html=value;this.children=[];},get innerHTML(){return this.html;},focus(){}};
}
async function testFlow(answer, raised = 0) {
  const nodes = new Map(), storage = new Map(), events = {};
  const get = key => {if(!nodes.has(key)) nodes.set(key,element());return nodes.get(key);};
  storage.set('gifto-transfer-attempt:owner:item',JSON.stringify({id:'attempt',amount:30000,phase:'away'}));
  let submits = 0;
  const ctx={URLSearchParams,crypto,location:{search:'?product=item'},ownerId:'owner',
    activeProfile:{name:'받는친구',products:[{id:'item',dbId:'item',status:'open',price:100000,raised,name:'선물',wishlistId:'list'}]},
    isUuid:()=>false,won:String,
    document:{querySelector:get,querySelectorAll:()=>[],addEventListener(k,fn){events[k]=fn;},createElement:element,hidden:false},
    window:{addEventListener(k,fn){events[k]=fn;},giftoContributions:{async submit(p,amount){assert.equal(amount,30000);submits++;return 'receipt';}}},
    sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    showToast:message=>{throw Error(message);}
  };
  vm.createContext(ctx);vm.runInContext(flow,ctx);await ctx.setupContribution();
  assert.equal(submits,0,'return must not register a transfer');
  const buttons = get('[data-qr-fallback]').children;
  assert.deepEqual(Array.from(buttons,b=>b.textContent),['송금했어요','아직 안 보냈어요']);
  events.pageshow(); events.visibilitychange(); assert.equal(submits,0);
  await buttons[answer ? 0 : 1].onclick();
  assert.equal(submits,answer ? 1 : 0);
  if(answer) assert.ok(ctx.location.href.includes('receipt=receipt'));
  else { assert.equal(get('#custom-amount').value,'30000'); assert.equal(storage.size,0); }
}
async function testReceipt() {
  const memory = new Map(); let session = null, calls = [], fail = true;
  const ctx={crypto,Uint8Array,console,location:{search:''},
    document:{querySelector:()=>null},localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},
    window:{addEventListener(){},giftoDb:{auth:{getSession:async()=>({data:{session}})},
      async rpc(name,args) {calls.push({name,args});if(name==='claim_gift_contribution') return {data:'receipt'};
        if(fail){fail=false;return {error:{message:'lost response'}};}return {data:'receipt'};}
    }}
  };
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/contribution-history.js','utf8'),ctx);
  const api=ctx.window.giftoContributions;
  await assert.rejects(api.submit({id:'item'},30000,'attempt','친구'));
  assert.equal(await api.submit({id:'item'},30000,'attempt','친구'),'receipt');
  assert.equal(calls[0].args.p_token,calls[1].args.p_token,'retry must reuse secret');
  assert.equal(calls[0].args.p_token.length,64);
  session={user:{id:'account'}};
  await api.claim();
  const receipts=JSON.parse(memory.get('gifto-contribution-receipts-v1'));
  assert.equal(receipts[0].accountId,'account');assert.equal(receipts[0].token,null);
}
Promise.all([testFlow(true),testFlow(false),testFlow(true,150000),testReceipt()]).then(()=>console.log('PASS: return does not submit; yes submits even above goal; no preserves amount; retry reuses receipt; login claims receipt')).catch(error=>{console.error(error);process.exitCode=1;});
