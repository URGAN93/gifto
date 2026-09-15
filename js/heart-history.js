(() => {
  const root = new URL('../', document.currentScript.src);
  const make = (tag, text, cls) => { const el=document.createElement(tag); if(text)el.textContent=text; if(cls)el.className=cls; return el; };
  const labels={received:'받은 마음',sent:'보낸 마음'};
  const states={pending:'입금 확인 대기',confirmed:'입금 확인 완료',cancelled:'입금 미확인 · 거절됨'};
  const url=(page,params)=>{const u=new URL('pages/'+page,root);u.search=new URLSearchParams(params);return u.href;};
  const amount=row=>Number(row.amount).toLocaleString('ko-KR')+'원';
  function details(row) {
    const dialog=make('dialog','','wishlist-share-dialog heart-detail');
    const close=make('button','닫기','button button-ghost');close.type='button';close.onclick=()=>dialog.close();
    const title=make('h2',row.item_name),person=make('p',row.person+'님에게 보낸 마음');
    dialog.append(close,title,person,make('strong',amount(row)),make('p',states[row.status]||'확인 중'));
    const list=make('a','친구 리스트 보기','button button-ghost');list.href=url('wishlist.html',{owner:row.owner_id,list:row.list_id});dialog.append(list);
    if(row.thanks){
      dialog.append(make('h3','선물 인증과 감사 인사'),make('p',row.thanks.message||'함께해 준 마음에 감사해요.'));
      const proof=make('a','선물 인증 사진 보기','button button-primary');proof.href=url('thankyou.html',{product:row.thanks.item_id});
      proof.onclick=()=>{window.giftoDb.rpc('read_gift_thanks',{p_item:row.thanks.item_id}).catch(()=>{});};dialog.append(proof);
    } else dialog.append(make('p',row.thanksUnavailable?'감사 인사를 불러오지 못했어요. 다시 확인해 주세요.':'아직 도착한 선물 인증·감사 인사가 없어요.','field-help'));
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();close.focus();
  }
  function card(row,kind) {
    const el=make(kind==='received'?'a':'button','','heart-card');
    if(kind==='received')el.href=url('participants.html',{product:row.item_id,owner:row.owner_id});
    else {el.type='button';el.onclick=()=>details(row);}
    const copy=make('span','','heart-card-copy');
    copy.append(make('small',row.person+'님'),make('strong',row.item_name),make('span',amount(row)+' · '+(states[row.status]||'확인 중')));
    if(row.created_at)copy.append(make('small',new Date(row.created_at).toLocaleString('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})));
    el.append(copy,make('span','›','heart-chevron'));return el;
  }
  function carousel(host,rows,kind) {
    const track=make('div','','heart-track');track.tabIndex=0;track.setAttribute('aria-label',labels[kind]+' 페이지');
    for(let i=0;i<Math.min(rows.length,9);i+=3){const page=make('div','','heart-page');rows.slice(i,i+3).forEach(row=>page.append(card(row,kind)));track.append(page);}
    const last=make('div','','heart-page heart-more');const more=make('a',labels[kind]+' 전체 보기 →','button button-ghost');more.href=url('heart-history.html',{kind});last.append(more);track.append(last);host.append(track);
    const nav=make('div','','heart-pages'),pages=Array.from(track.children);let active=0,start=null,ignoreClick=0,targetLeft=null;
    const go=index=>{active=(index+pages.length)%pages.length;targetLeft=pages[active].offsetLeft-pages[0].offsetLeft;if(track.scrollWidth&&track.clientWidth)targetLeft=Math.min(targetLeft,track.scrollWidth-track.clientWidth);track.scrollTo({left:targetLeft,behavior:index<0||index>=pages.length?'instant':'smooth'});};
    pages.forEach((page,i)=>{const dot=make('button','','heart-dot');dot.type='button';dot.setAttribute('aria-label',i===pages.length-1?'전체 보기 페이지':`${i+1} 페이지`);dot.setAttribute('aria-current',String(i===0));dot.onclick=()=>go(i);nav.append(dot);});
    track.onscroll=()=>{const nearest=pages.reduce((best,p,i)=>Math.abs(p.offsetLeft-pages[0].offsetLeft-track.scrollLeft)<Math.abs(pages[best].offsetLeft-pages[0].offsetLeft-track.scrollLeft)?i:best,0);if(targetLeft!==null&&Math.abs(track.scrollLeft-targetLeft)<=2)targetLeft=null;if(targetLeft===null)active=nearest;Array.from(nav.children).forEach((dot,i)=>dot.setAttribute('aria-current',String(i===nearest)));};
    track.onpointerdown=e=>{if(e.isPrimary!==false&&!(e.button>0))start={x:e.clientX,y:e.clientY};};
    track.onpointermove=e=>{if(start&&Math.abs(e.clientX-start.x)>12&&Math.abs(e.clientX-start.x)>Math.abs(e.clientY-start.y))track.setPointerCapture?.(e.pointerId);};
    track.onpointerup=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>=40&&Math.abs(dx)>Math.abs(dy)){ignoreClick=Date.now()+500;go(active+(dx<0?1:-1));}};
    track.onpointercancel=()=>{start=null;};track.ondragstart=e=>e.preventDefault();
    track.addEventListener('click',e=>{if(Date.now()<ignoreClick){e.preventDefault();e.stopPropagation();}},true);
    track.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();go(active+(e.key==='ArrowRight'?1:-1));}};
    host.append(nav);
  }
  function render(host,rows,kind) {
    host.replaceChildren();rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    if(!host.hasAttribute('data-heart-full')){
      const now=Date.now(),cutoff=now-14*24*60*60*1000;
      rows=rows.filter(row=>{const time=new Date(row.created_at).getTime();return time>=cutoff&&time<=now;});
      if(!rows.length){host.append(make('p',`최근 2주간 ${labels[kind]}이 없어요.`,'empty-state'));const all=make('a',labels[kind]+' 전체 보기 →','button button-ghost');all.href=url('heart-history.html',{kind});host.append(all);return;}
    }
    if(!rows.length){host.append(make('p',`아직 ${labels[kind]}이 없어요.`,'empty-state'));return;}
    if(!host.hasAttribute('data-heart-full')){carousel(host,rows,kind);return;}
    const label=make('label','상품별 조회','field-label'),select=make('select','','text-field');select.setAttribute('aria-label','상품별 조회');select.append(make('option','모든 상품'));select.children[0].value='';
    const products=new Map();rows.forEach(row=>products.set(row.item_id,{name:row.item_name,person:kind==='sent'?row.person:''}));
    products.forEach((product,id)=>{const option=make('option',product.name+(product.person?' · '+product.person+'님':''));option.value=id;select.append(option);});
    const list=make('div','','heart-full-list');const paint=()=>{list.replaceChildren();rows.filter(row=>!select.value||row.item_id===select.value).forEach(row=>list.append(card(row,kind)));};
    select.onchange=paint;label.append(select);host.append(label,list);paint();
  }
  async function load(kind,owner) {
    if(kind==='received'){
      const {data,error}=await window.giftoDb.from('wishlists').select('id').eq('owner_id',owner);if(error)throw error;
      const lists=await Promise.all((data||[]).map(list=>loadRemoteWishlist(owner,list.id)));
      return lists.flatMap(list=>list.products.flatMap(item=>(item.allContributions||[]).map(row=>({...row,item_id:item.id,item_name:item.name,owner_id:owner,person:row.contributor_name||'비회원'}))));
    }
    // Receipt claiming or optional thanks must not prevent existing history loading.
    try { await window.giftoContributions?.claim(); } catch {}
    const {data,error}=await window.giftoDb.rpc('my_gift_contributions');if(error)throw error;
    // Use the existing authenticated history RPC, avoiding nested relation lookups.
    let ids=new Map(),thanksResult={data:[],error:true};
    try { const result=await window.giftoDb.from('contributions').select('id,item_id').eq('contributor_id',owner);if(!result.error)ids=new Map((result.data||[]).map(row=>[row.id,row.item_id])); } catch {}
    try { thanksResult=await window.giftoDb.rpc('my_gift_thanks'); } catch {}
    const thanks=new Map((thanksResult.data||[]).map(row=>[row.item_id,row]));
    return (data||[]).map(row=>({...row,item_id:ids.get(row.id)||row.id,person:row.recipient_name||'친구',thanks:thanks.get(ids.get(row.id)),thanksUnavailable:!!thanksResult.error}));
  }
  let generation=0;
  async function refresh(){
    const hosts=Array.from(document.querySelectorAll('[data-heart-history]'));if(!hosts.length)return;const current=++generation;
    await Promise.all(hosts.map(async host=>{const kind=host.dataset.heartHistory;host.replaceChildren(make('p','내역을 불러오는 중…','field-help'));
      try{const {data,error}=await window.giftoDb.auth.getSession();if(error)throw error;if(!data.session){host.replaceChildren(make('p','로그인하면 내역을 확인할 수 있어요.'));return;}const rows=await load(kind,data.session.user.id);if(current===generation)render(host,rows,kind);}
      catch{if(current!==generation)return;host.replaceChildren(make('p','내역을 불러오지 못했어요.'));const retry=make('button','다시 시도','button button-ghost');retry.onclick=refresh;host.append(retry);}
    }));
  }
  const full=document.querySelector('[data-heart-full]');if(full){const kind=new URLSearchParams(location.search).get('kind')==='sent'?'sent':'received';full.dataset.heartHistory=kind;document.querySelector('[data-heart-title]').textContent=labels[kind];}
  window.giftoHeartHistory={refresh};refresh();window.addEventListener('pageshow',refresh);
})();
