// Delivery means saved in the recipient's GIFTO inbox, not a push/Kakao delivery.
(() => {
 const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const unavailable = '감사 알림을 처리하지 못했어요. 새 SQL 적용 여부와 연결 상태를 확인해 주세요.';
 async function rpc(name,args) {
  const {data,error}=await window.giftoDb.rpc(name,args);
  if(error) throw error;
  return data;
 }
 function deliveryLabel(row) {
  if(row?.method==='in_app') return row.read_at ? '감사 알림 읽음' : '감사 알림 전달 완료 · 안 읽음';
  if(row?.method==='manual') return '링크 전달 완료 · 직접 표시';
  return row?.method==='waiting_account' ? '아직 전달 전 · 가입 연결 대기' : '아직 감사 전달 전';
 }
 const api=window.giftoThanks={
  deliveryLabel,
  open(itemId,name,shareLink) {
   const dialog=document.createElement('dialog');dialog.className='wishlist-share-dialog thanks-dialog';
   dialog.innerHTML='<button type="button" data-close>닫기</button><h2>마음 전하기</h2><p>입금 확인된 친구에게 감사 인사와 선물 인증을 전해요.</p><button type="button" class="button button-primary" data-send>연결된 친구에게 감사 알림 보내기</button><p class="field-help">GIFTO 안에 알림이 저장돼요. 카카오톡 메시지나 휴대폰 푸시는 아니에요. 미가입자는 나중에 같은 브라우저에서 계정을 연결하면 받을 수 있어요.</p><button type="button" class="button button-ghost" data-link>미가입자에게 링크 공유하기</button><a class="button button-ghost" data-people>전달 현황 보기</a><p data-result role="status"></p>';
   dialog.querySelector('[data-people]').href='participants.html?product='+encodeURIComponent(itemId);
   const send=dialog.querySelector('[data-send]'),result=dialog.querySelector('[data-result]');
   send.onclick=async()=>{
    send.disabled=true;result.textContent='감사 알림을 보내고 있어요…';
    try {const data=await rpc('send_gift_thanks',{p_item:itemId});result.textContent=`감사 알림 전달 ${data.delivered}건 · 가입 연결 대기 ${data.waiting}건 (이미 전달한 내역 포함)`;send.textContent='전달 현황 갱신';}
    catch {result.textContent=unavailable;}
    finally {send.disabled=false;}
   };
   dialog.querySelector('[data-link]').onclick=()=>shareLink();
   dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>dialog.remove());
   document.body.append(dialog);dialog.showModal();
  },
  async decorate(view,item,entries) {
   if(item.status!=='proof_posted')return;
   const confirmed=entries.filter(e=>e.status==='confirmed');
   if(!confirmed.length)return;
   let rows;
   try {
    const result=await window.giftoDb.from('gift_thanks').select('contribution_id,method,sent_at,read_at').in('contribution_id',confirmed.map(e=>e.id));
    if(result.error)throw result.error;rows=result.data||[];
   } catch {
    const note=document.createElement('li');note.className='empty-contributors';note.textContent='감사 전달 현황을 불러오지 못했어요. SQL 적용 여부와 연결 상태를 확인해 주세요.';view.append(note);return;
   }
   const byId=new Map(rows.map(r=>[r.contribution_id,r]));
   const pending=confirmed.filter(e=>!['in_app','manual'].includes(byId.get(e.id)?.method));
   const summary=document.createElement('li');summary.className='thanks-summary';
   summary.innerHTML=`<strong>아직 감사 전달 전 ${pending.length}건</strong><small>입금 확인된 참여 내역 기준 · 알림 전달과 읽음은 달라요.</small><label><input type="checkbox" data-unthanked-only /> 아직 전달 전만 보기</label>`;
   view.prepend(summary);
   summary.querySelector('[data-unthanked-only]').onchange=event=>{
    view.querySelectorAll('[data-contribution-id]').forEach(li=>{
     li.hidden=event.target.checked&&!pending.some(e=>e.id===li.dataset.contributionId);
    });
   };
   for(const li of view.querySelectorAll('[data-contribution-id]')) {
    const entry=confirmed.find(e=>e.id===li.dataset.contributionId);if(!entry)continue;
    const row=byId.get(entry.id),done=['in_app','manual'].includes(row?.method);
    const box=document.createElement('div');box.className='thanks-delivery';
    box.innerHTML=`<span class="${done?'thanks-done':'thanks-pending'}">${safe(deliveryLabel(row))}</span>`;
    if(!done){
     const action=document.createElement('button');action.type='button';action.textContent=entry.contributor_id?'감사 알림 보내기':'링크 공유';
     action.onclick=async()=>{
      if(!entry.contributor_id){await shareGiftThanks(item.id,item.name,item.proof_message||'');return;}
      action.disabled=true;
      try {await rpc('send_gift_thanks',{p_item:item.id,p_contribution:entry.id});await setupParticipants();}
      catch {showToast(unavailable);action.disabled=false;}
     };box.append(action);
     if(!entry.contributor_id){
      const mark=document.createElement('button');mark.type='button';mark.textContent='전달했어요';
      mark.onclick=async()=>{
       if(!confirm('이 친구에게 감사 링크를 직접 전달했나요? 공유창을 여는 것만으로는 전달되지 않아요.'))return;
       mark.disabled=true;
       try {await rpc('mark_gift_thanks_manual',{p_contribution:entry.id});await setupParticipants();}
       catch {showToast(unavailable);mark.disabled=false;}
      };box.append(mark);
     }
    }
    li.append(box);
   }
  },
  async inbox() {
   const section=document.querySelector('[data-thanks-inbox]');if(!section||!window.giftoDb)return;
   const {data:auth}=await window.giftoDb.auth.getSession();
   if(!auth.session){section.hidden=true;return;}
   section.hidden=false;
   const content=section.querySelector('[data-thanks-messages]');
   try {
    await window.giftoContributions?.claim();
    const rows=await rpc('my_gift_thanks',{});
    content.innerHTML=rows.length?rows.map(row=>`<article class="sent-record"><strong>${row.read_at?'':'● '}${safe(row.sender_name)}님의 감사 인사가 도착했어요</strong><p>${safe(row.item_name)}</p><p>${safe(row.message||'함께해 준 마음에 감사해요.')}</p><a href="thankyou.html?product=${encodeURIComponent(row.item_id)}" data-read-thanks="${safe(row.item_id)}">선물 인증 보기</a></article>`).join(''):'<p class="empty-state">아직 도착한 감사 인사가 없어요.</p>';
    content.querySelectorAll('[data-read-thanks]').forEach(link=>link.addEventListener('click',async event=>{
     if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
     event.preventDefault();
     try {await rpc('read_gift_thanks',{p_item:link.dataset.readThanks});} catch {}
     location.href=link.href;
    }));
   }catch {content.textContent='감사 알림을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.';}
  }
 };
 api.inbox().catch(()=>{});
 window.addEventListener('pageshow',()=>api.inbox().catch(()=>{}));
})();
