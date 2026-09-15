import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('completed settings move above privacy in stable payment/birthday order',()=>{
 const source=readFileSync('js/app.js','utf8');
 const payment={dataset:{}}, birthday={dataset:{}}, privacy={before(node){order.splice(order.indexOf(node),1);order.splice(order.indexOf(privacy),0,node)}};
 const activity={};const order=[birthday,payment,activity,privacy];
 const ctx={document:{querySelector:s=>s==='.account-help'?privacy:s==='.payment-settings'?payment:birthday}};
 vm.runInNewContext(source.slice(source.indexOf('function moveCompletedProfileSetting('),source.indexOf('function setupPaymentSettings()')),ctx);
 ctx.moveCompletedProfileSetting(birthday);
 assert.deepEqual(order,[payment,activity,birthday,privacy]);
 ctx.moveCompletedProfileSetting(payment);
 assert.deepEqual(order,[activity,payment,birthday,privacy]);
 ctx.moveCompletedProfileSetting(payment);
 assert.deepEqual(order,[activity,payment,birthday,privacy]);
});
test('received and sent history use separate card feeds',()=>{
 const html=readFileSync('pages/my-page.html','utf8');
 assert.match(html,/id="received-history"[\s\S]*?data-heart-history="received"/);
 assert.match(html,/id="sent-history"(?:(?!<\/section>)[\s\S])*data-heart-history="sent"/);
 assert.ok(!html.includes('받은 감사 인사'));
});
