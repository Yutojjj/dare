const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup({latest='new',hidden=false,editing=false,offline=false}={}){
 let reloads=0,checks=0;const jobs=[],listeners={},home={hidden:editing},face={inert:false};
 const document={hidden,querySelector:()=>({content:'old'}),getElementById:id=>id==='homeScreen'?home:face,querySelectorAll:()=>[],addEventListener:(event,fn)=>listeners[event]=fn};
 vm.runInNewContext(fs.readFileSync('watch/update-check.js','utf8'),{document,location:{protocol:'https:',pathname:'/watch/index.html',reload:()=>reloads++},window:{addEventListener(){}},Date,AbortController,DOMParser:class{parseFromString(){return {querySelector:()=>({content:latest})};}},MutationObserver:class{observe(){}},fetch:async()=>{checks++;if(offline)throw Error();return {ok:true,text:async()=>'<html>'};},setTimeout:(fn,delay)=>{if(delay!==8000)jobs.push(fn);return jobs.length;},clearTimeout(){}});
 return {home,listeners,run:async()=>{await jobs.shift()?.();},reloads:()=>reloads,checks:()=>checks};
}
test('a newer published screen reloads a ready home screen',async()=>{const s=setup();await s.run();assert.equal(s.reloads(),1);});
test('an editing screen waits until returning home',async()=>{const s=setup({editing:true});await s.run();assert.equal(s.reloads(),0);s.home.hidden=false;s.listeners.click();await s.run();assert.equal(s.reloads(),1);});
test('no update or offline keeps the current screen',async()=>{for(const args of [{latest:'old'},{offline:true}]){const s=setup(args);await s.run();assert.equal(s.reloads(),0);}});
test('a hidden watch does not perform an update request',async()=>{const s=setup({hidden:true});await s.run();assert.equal(s.checks(),0);});
