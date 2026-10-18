const fs = require('node:fs');
const file = 'dare.html';
let html = fs.readFileSync(file, 'utf8');
function replaceOnce(old, next) {
  if (!html.includes(old)) throw new Error('Missing replacement: ' + old.slice(0, 90));
  html = html.replace(old, next);
}
function replaceRange(start, end, next) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Missing range: ' + start);
  html = html.slice(0, a) + next + html.slice(b);
}
const css = String.raw`<style>
/* Finger-follow paging, using the same translate3d and direction lock as biz-calendar-fixed. */
body{overflow:hidden}
#main{position:relative;display:block;width:100%;max-width:1100px;height:calc(100dvh - var(--directory-nav-height,64px));min-width:0;margin:0 auto;padding:0;overflow:hidden;touch-action:pan-y pinch-zoom}
#main>section,#detailContent>.detail-page{position:absolute;inset:0;width:100%;min-width:0;max-width:none;overflow-x:hidden;overflow-y:auto;background:var(--bg);touch-action:pan-y pinch-zoom;overscroll-behavior-x:none;backface-visibility:hidden;transform:translate3d(100%,0,0)}
#main>section{padding:46px 26px 28px}
#main>#view-members,#detailContent>#detail-basic{transform:translate3d(0,0,0)}
#detailContent{position:relative;display:block;width:100%;min-width:0;padding:0;overflow:hidden;touch-action:pan-y pinch-zoom}
#detailContent>.detail-page{padding:10px 12px;overscroll-behavior-y:contain}
.swipe-page.is-sliding{transition:transform .26s cubic-bezier(.22,.72,.25,1)}
.swipe-page.is-moving{will-change:transform}
.swipe-page[inert]{pointer-events:none}
.floating-search-tools[hidden]{display:none!important}
@media(max-width:900px){#main>section{padding:29px 16px 28px}}
@media(max-width:600px){#main>section{padding:22px 12px 28px}#detailContent>.detail-page{padding:8px}}
@media(prefers-reduced-motion:reduce){.swipe-page.is-sliding{transition-duration:.08s}}
@media print{body{overflow:visible!important}}
#pwaInstallDialog{width:min(380px,calc(100% - 28px));max-height:calc(100dvh - 32px);overflow-y:auto}
#pwaInstallInstructions{margin:-8px 0 12px;color:var(--muted);font-size:13px}
#pwaInstallInstructions ol{margin:0;padding-left:22px}#pwaInstallInstructions li+li{margin-top:8px}
</style>`;
const styleStart = html.lastIndexOf('<style>', html.indexOf('</head>'));
html = html.slice(0, styleStart) + css + html.slice(html.indexOf('</style>', styleStart) + 8);
replaceOnce('<main>', '<main id="main">');
const detailMarkup = html.match(/<dialog class="detail" id="detail"[\s\S]*?<\/dialog>/)?.[0];
if (!detailMarkup) throw new Error('Detail dialog not found');
replaceOnce(detailMarkup, '');
replaceOnce('</main>', '</main>' + detailMarkup);

const pager = String.raw`function createSwipePager(viewport,pages,{enabled=()=>true,onPrepare=()=>{},onChange=()=>{}}={}){
 if(!viewport||pages.some(page=>!page))throw new Error('画面の切り替え領域が見つかりません');
 let index=0,gesture=null,frame=0,animationTimer=0,ignoreClickUntil=0,wheelDistance=0,lastWheelAt=0,lastWheelSwitch=-Infinity;
 pages.forEach(page=>{page.hidden=false;page.classList.add('swipe-page')});
 const width=()=>viewport.clientWidth;
 function positions(delta=0,animate=false){
  const pct=width()?delta/width()*100:0;
  pages.forEach((page,i)=>{
   page.classList.toggle('is-sliding',animate);
   page.classList.toggle('is-moving',animate||!!delta);
   page.style.transform='translate3d('+((i-index)*100+pct)+'%,0,0)';
  });
  clearTimeout(animationTimer);
  if(animate)animationTimer=setTimeout(()=>pages.forEach(page=>page.classList.remove('is-sliding','is-moving')),300);
 }
 function active(){pages.forEach((page,i)=>{page.inert=i!==index;page.setAttribute('aria-hidden',String(i!==index))})}
 function stopGesture(){if(frame)cancelAnimationFrame(frame);frame=0;gesture=null}
 function goTo(next,animate=true,notify=false){
  next=Math.max(0,Math.min(pages.length-1,next));
  const previous=index;
  stopGesture();
  index=next;
  active();
  if(notify&&next!==previous)onChange(next);
  positions(0,animate);
  return next!==previous;
 }
 function cancel(animate=true){stopGesture();positions(0,animate)}
 function begin(x,y,target){
  if(!enabled()||target.closest('input,textarea,select,[contenteditable="true"],[data-no-swipe]'))return;
  stopGesture();
  positions();
  gesture={x,y,started:performance.now(),axis:null,delta:0,dragged:false,prepared:-1};
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){if(!uiAudioContext)uiAudioContext=new Audio();if(uiAudioContext.state==='suspended')uiAudioContext.resume().catch(()=>{})}}catch{}
 }
 function drawDrag(){frame=0;if(gesture)positions(gesture.delta)}
 function move(x,y,event){
  if(!gesture)return;
  if(!enabled()){cancel();return}
  const dx=x-gesture.x,dy=y-gesture.y,ax=Math.abs(dx),ay=Math.abs(dy);
  if(!gesture.axis){
   if(ax<8&&ay<8)return;
   if(ax>ay*1.25)gesture.axis='h';
   else if(ay>ax*1.1)gesture.axis='v';
   else return;
  }
  if(gesture.axis!=='h')return;
  if(event.cancelable)event.preventDefault();
  const next=index+(dx<0?1:-1),edge=next<0||next>=pages.length;
  if(!edge&&gesture.prepared!==next){onPrepare(next);gesture.prepared=next}
  gesture.delta=edge?Math.max(-width()*.18,Math.min(width()*.18,dx*.18)):Math.max(-width(),Math.min(width(),dx));
  gesture.dragged=true;
  if(!frame)frame=requestAnimationFrame(drawDrag);
 }
 function end(){
  if(!gesture)return;
  if(!gesture.dragged){stopGesture();return}
  if(frame){cancelAnimationFrame(frame);drawDrag()}
  const delta=gesture.delta,elapsed=Math.max(1,performance.now()-gesture.started),velocity=Math.abs(delta)/elapsed;
  const commit=Math.abs(delta)>width()*.24||(Math.abs(delta)>24&&velocity>.5);
  const next=commit?Math.max(0,Math.min(pages.length-1,index+(delta<0?1:-1))):index;
  ignoreClickUntil=performance.now()+350;
  viewport.getBoundingClientRect();
  if(goTo(next,true,true))playUiSound('swipe');
 }
 viewport.addEventListener('touchstart',event=>{
  if(event.touches.length!==1){cancel();return}
  const point=event.touches[0];begin(point.clientX,point.clientY,event.target);
 },{passive:true});
 viewport.addEventListener('touchmove',event=>{
  if(event.touches.length!==1){cancel();return}
  const point=event.touches[0];move(point.clientX,point.clientY,event);
 },{passive:false});
 viewport.addEventListener('touchend',end,{passive:true});
 viewport.addEventListener('touchcancel',()=>{if(gesture?.dragged)ignoreClickUntil=performance.now()+350;cancel()},{passive:true});
 let mousePointer=null;
 viewport.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='mouse'||event.button!==0)return;
  begin(event.clientX,event.clientY,event.target);
  if(gesture)mousePointer=event.pointerId;
 });
 viewport.addEventListener('pointermove',event=>{
  if(event.pointerId!==mousePointer)return;
  move(event.clientX,event.clientY,event);
  if(gesture?.dragged&&!viewport.hasPointerCapture(event.pointerId))viewport.setPointerCapture(event.pointerId);
 });
 viewport.addEventListener('pointerup',event=>{if(event.pointerId!==mousePointer)return;end();mousePointer=null});
 viewport.addEventListener('pointercancel',event=>{if(event.pointerId===mousePointer){mousePointer=null;cancel()}});
 viewport.addEventListener('dragstart',event=>{if(gesture)event.preventDefault()});
 viewport.addEventListener('click',event=>{if(performance.now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);
 viewport.addEventListener('wheel',event=>{
  if(!enabled()||event.ctrlKey||Math.abs(event.deltaX)<=Math.abs(event.deltaY)*1.25)return;
  if(event.cancelable)event.preventDefault();
  const now=performance.now();
  if(now-lastWheelSwitch<350)return;
  if(now-lastWheelAt>160||Math.sign(wheelDistance)!==Math.sign(event.deltaX))wheelDistance=0;
  wheelDistance+=event.deltaX;lastWheelAt=now;
  if(Math.abs(wheelDistance)<60)return;
  const next=Math.max(0,Math.min(pages.length-1,index+(wheelDistance>0?1:-1)));
  wheelDistance=0;lastWheelSwitch=now;
  if(next!==index){onPrepare(next);if(goTo(next,true,true))playUiSound('swipe')}
 },{passive:false});
 window.addEventListener('resize',()=>cancel(false));
 active();positions();
 return {goTo,cancel};
}
`;
replaceRange('function fitTrackPages(', 'function switchDetailView(', pager);
replaceRange('function switchDetailView(', 'function openMemberAnalysis(', String.raw`function switchDetailView(id,deferAnalysis=false,fromSwipe=false,animate=true){
 const index=detailPageIds.indexOf(id);if(index<0)return;
 if(id!=='analysis')analysisRenderToken++;
 if(id!=='analysis'&&!memberDraft){const member=getMember();if(member){memberDraft=structuredClone(member.months||{});$('monthInput').value=monthNow();showMonth()}}
 if(id==='customers')refreshCustomerLists();
 if(id==='calendar')renderCalendar();
 if(id==='analysis'&&!deferAnalysis)renderAnalysis();
 if(!fromSwipe)detailPager.goTo(index,animate);
 document.querySelectorAll('.detail-nav button').forEach(button=>{
  if(button.dataset.target===id){button.setAttribute('aria-current','page');button.style.backgroundColor='var(--tab-strong)';button.style.color='var(--tab-text)'}
  else{button.removeAttribute('aria-current');button.style.removeProperty('background-color');button.style.removeProperty('color')}
 });
}
`);
replaceRange('function openMemberAnalysis(', 'function shiftMonth(', String.raw`function openMemberAnalysis(id){
 const member=state.members.find(item=>item.id===id);if(!member)return;
 ++analysisRenderToken;activeId=id;memberDraft=null;loadedMonth=null;currentData={};
 $('detailName').textContent=member.name;$('detailAvatar').textContent=initial(member.name);
 $('rankButton').hidden=false;$('memoButton').hidden=false;renderRank();
 $('analysisCards').replaceChildren();$('analysisRangeLabel').textContent='';
 if(!$('detail').open)$('detail').showModal();
 document.querySelectorAll('.detail-page').forEach(page=>page.scrollTop=0);
 switchDetailView('analysis',true,false,false);
 setTimeout(()=>{if($('detail').open&&activeId===id&&!$('detail-analysis').inert)renderAnalysis()},80);
}
function openDetail(id,initialView='basic'){
 activeId=id;const member=getMember();if(!member)return;
 if(initialView==='analysis'){openMemberAnalysis(id);return}
 memberDraft=structuredClone(member.months||{});currentData={};loadedMonth=null;
 $('detailName').textContent=member.name;$('detailAvatar').textContent=initial(member.name);
 $('rankButton').hidden=false;$('memoButton').hidden=false;renderRank();
 $('monthInput').value=monthNow();showMonth();
 if(!$('detail').open)$('detail').showModal();
 document.querySelectorAll('.detail-page').forEach(page=>page.scrollTop=0);
 switchDetailView(initialView,false,false,false);
}
`);
replaceRange('function switchDirectory(', 'function openAnalysisPrintDialog(', String.raw`function switchDirectory(view,fromSwipe=false){
 const index=directoryViewButtons.findIndex(([,key])=>key===view);if(index<0)return;
 if(!fromSwipe)directoryPager.goTo(index);
 directoryTools.forEach(({element,view:owner})=>{element.hidden=owner!==view});
 directoryViewButtons.forEach(([id,key])=>{$(id).classList.toggle('active',view===key);$(id).setAttribute('aria-pressed',String(view===key))});
 if(view==='customers')renderAllCustomers();
 if(view==='calendar')renderOverviewCalendar();
 if(view==='analysis')renderOverviewAnalysis();
}
`);
replaceRange('const directoryViewButtons=', "$('closeOverviewDay').onclick=", String.raw`const directoryViewButtons=[['showMembers','members','view-members'],['showOverviewCalendar','calendar','view-overview-calendar'],['showAllCustomers','customers','view-all-customers'],['showOverviewAnalysis','analysis','view-overview-analysis']];
const directoryTools=[['memberSearchTools','members'],['allCustomerSearchTools','customers'],['overviewAnalysisSearchTools','analysis']].map(([id,view])=>{
 const element=$(id);element.hidden=view!=='members';document.body.append(element);return {element,view};
});
const directoryPager=createSwipePager($('main'),directoryViewButtons.map(([, ,id])=>$(id)),{
 enabled:()=>!document.querySelector('dialog[open]'),
 onPrepare:index=>{const view=directoryViewButtons[index][1];if(view==='calendar')renderOverviewCalendar();if(view==='customers')renderAllCustomers();if(view==='analysis')renderOverviewAnalysis()},
 onChange:index=>switchDirectory(directoryViewButtons[index][1],true)
});
const detailPageIds=['basic','calendar','customers','analysis'];
const detailPager=createSwipePager($('detailContent'),detailPageIds.map(id=>$('detail-'+id)),{
 enabled:()=>$('detail').open&&!document.querySelector('dialog[open]:not(#detail)'),
 onPrepare:index=>{const view=detailPageIds[index];if(view==='calendar')renderCalendar();if(view==='customers')refreshCustomerLists();if(view==='analysis')renderAnalysis()},
 onChange:index=>switchDetailView(detailPageIds[index],false,true)
});
function updateDirectoryHeight(){document.documentElement.style.setProperty('--directory-nav-height',document.querySelector('.directory-nav').getBoundingClientRect().height+'px')}
updateDirectoryHeight();
window.addEventListener('resize',updateDirectoryHeight);
if('ResizeObserver' in window)new ResizeObserver(updateDirectoryHeight).observe(document.querySelector('.directory-nav'));
`);
replaceOnce("$('detail').addEventListener('close',()=>{activeId=null;", "$('detail').addEventListener('close',()=>{detailPager.cancel(false);activeId=null;");
fs.writeFileSync(file,html);
