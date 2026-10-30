const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function screen(z=0){return {hidden:false,style:{},z,closed:0,querySelector(){return {click:()=>{this.closed++;this.hidden=true;}};}};}
function setup(dialogs,detail){
  const events={},back={clicked:0,click(){this.clicked++;}};
  const document={body:{classList:{add(){},contains:()=>true}},addEventListener:(name,fn)=>events[name]=fn,
    querySelectorAll:selector=>selector==='.timer-dialog-backdrop'?dialogs:(detail?[detail]:[]),getElementById:()=>back};
  vm.runInNewContext(fs.readFileSync('watch/phone-mode.js','utf8'),{document,location:{pathname:'/watch/index.html',search:'?native=gecko'},URLSearchParams,innerWidth:225,getComputedStyle:item=>({zIndex:String(item.z)}),setTimeout:fn=>fn()});
  return {back,nativeBack(){events['dare-watch-back']();},swipe(end){events.touchstart({touches:[{clientX:5,clientY:100}]});events.touchmove({touches:[{clientX:end,clientY:100}],preventDefault(){}});events.touchend({changedTouches:[{clientX:end,clientY:100}],preventDefault(){}});}};
}
test('back swipe closes only the top modal and preserves the underlying modal',()=>{
  const low=screen(6),high=screen(8),ui=setup([low,high]);ui.swipe(120);
  assert.equal(high.closed,1);assert.equal(low.closed,0);assert.equal(ui.back.clicked,0);assert.equal(high.style.transform,'');
});
test('short drag returns the modal without cancelling edits',()=>{
  const modal=screen(6);setup([modal]).swipe(30);assert.equal(modal.closed,0);assert.equal(modal.style.transform,'');
});
test('detail swipe returns to the member list',()=>{
  const ui=setup([],screen());ui.swipe(120);assert.equal(ui.back.clicked,1);
});
test('native gesture command closes the top modal without touching underlying state',()=>{
  const low=screen(6),high=screen(8),ui=setup([low,high]);ui.nativeBack();
  assert.equal(high.closed,1);assert.equal(low.closed,0);assert.equal(ui.back.clicked,0);
});
test('bundled navigation bridge reports modal state and accepts only back commands',()=>{
  let message,observer;const posted=[],events=[];const element={hidden:true};
  const port={onMessage:{addListener:fn=>message=fn},postMessage:value=>posted.push(value)};
  vm.runInNewContext(fs.readFileSync('watch-android/app/src/webPreview/assets/watch-navigation/navigation.js','utf8'),{
    browser:{runtime:{connectNative:()=>port}},Event,
    document:{readyState:'complete',documentElement:{},querySelectorAll:()=>[element],dispatchEvent:event=>events.push(event.type)},
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}}
  });
  assert.equal(posted[0].canBack,false);element.hidden=false;observer();observer();assert.equal(posted.length,2);assert.equal(posted[1].canBack,true);
  message({type:'other'});message({type:'back'});assert.deepEqual(events,['dare-watch-back']);
});
