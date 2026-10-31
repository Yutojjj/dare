const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {createSeedState}=require('../watch/watch-core.js');
function setup(){
  const urls=[],documentEvents={},windowEvents={};
  const location={search:'?native=gecko',set href(value){urls.push(value);}};
  const document={hidden:false,body:{classList:{add(){}}},getElementById:()=>({append(){}}),addEventListener:(name,fn)=>documentEvents[name]=fn};
  const window={addEventListener:(name,fn)=>windowEvents[name]=fn};
  vm.runInNewContext(fs.readFileSync('watch/native-bridge.js','utf8'),{window,document,location,URLSearchParams,encodeURIComponent,setTimeout(){throw new Error('Native alarm sync must not be deferred');}});
  return {api:window.DareWatchNative,urls,document,documentEvents,windowEvents};
}
function payload(url){return JSON.parse(new URL(url).searchParams.get('payload'));}
test('native reservations are sent immediately and the latest timer is resent before close',()=>{
  const ui=setup(),state=createSeedState();
  ui.api.syncTimers(JSON.stringify(state));assert.equal(ui.urls.length,1);
  state.timers['cast-aoi'].paused=true;state.timers['cast-aoi'].pausedRemainingMs=45000;
  ui.api.syncTimers(JSON.stringify(state));assert.equal(ui.urls.length,2);
  ui.document.hidden=true;ui.documentEvents.visibilitychange();
  assert.equal(payload(ui.urls.at(-1)).timers['cast-aoi'].paused,true);
  ui.windowEvents.pagehide();assert.equal(ui.urls.length,4);
  ui.api.syncTimers(JSON.stringify(state));assert.equal(ui.urls.length,4,'duplicate snapshots should not repeatedly cross the bridge');
});
test('long histories cannot crowd out the alarm payload, settings or table names',()=>{
  const ui=setup(),state=createSeedState();
  state.dayMemberHistory=[{notes:'x'.repeat(1100000)}];
  state.casts[0].history=[{notes:'x'.repeat(1100000)}];
  state.casts[0].dayAdded=true;state.casts[0].dayAddedOn='2026-10-30';
  state.notificationSettings={endEnabled:true,vibration:true,advanceSecondsList:[30,60]};state.dayRolloverTime='09:30';
  ui.api.syncTimers(JSON.stringify(state));
  assert.ok(ui.urls[0].length<15000);
  const snapshot=payload(ui.urls[0]);
  assert.equal(snapshot.dayRolloverTime,'09:30');assert.deepEqual(snapshot.notificationSettings,state.notificationSettings);
  assert.equal(snapshot.casts[0].dayAddedOn,'2026-10-30');assert.equal(snapshot.floors[0].name,'1階');
  assert.equal(snapshot.casts[0].history,undefined);assert.equal(snapshot.dayMemberHistory,undefined);
});
