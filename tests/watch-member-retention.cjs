// Reopening a fresh page simulates closing the APK session. No live data is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH});
  const context=await browser.newContext({viewport:{width:396,height:396},timezoneId:'Asia/Tokyo'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.endsWith('/watch-firebase.js'))return route.fulfill({contentType:'application/javascript',body:'window.WatchFirebase={async start(){}};'});
    if(url.endsWith('/native-bridge.js'))return route.fulfill({contentType:'application/javascript',body:''});
    return url.startsWith(origin)?route.continue():route.abort();
  });
  async function open(time){const page=await context.newPage();await page.clock.install({time:new Date(time)});await page.goto(origin+'/watch/index.html');await page.waitForFunction(()=>sharedConnected);return page;}
  try{
    let page=await open('2026-10-31T02:30:00+09:00');
    await page.evaluate(()=>openRouteEditor(null,{id:'night-member',name:'深夜メンバー'}));
    await page.locator('.route-editor-choice').nth(0).click();
    await page.locator('.route-editor-choice').nth(2).click();
    await page.locator('#saveRouteEditor').click();
    assert.equal(await page.evaluate(()=>controller.getCast('night-member').dayAddedOn),'2026-10-30');
    const snapshot=await page.evaluate(()=>structuredClone(controller.getCast('night-member')));
    await page.close();
    page=await open('2026-10-31T02:31:00+09:00');
    assert.deepEqual(await page.evaluate(()=>structuredClone(controller.getCast('night-member'))),snapshot,'closing and reopening must preserve the member and selected route');
    // Also repair entries saved by the previous midnight-based implementation.
    await page.evaluate(()=>{
      const cast=controller.getCast('night-member');
      cast.dayAddedOn='2026-10-31';delete cast.dayDateVersion;delete cast.dayAddedAt;store.save(controller.state);
    });
    await page.close();
    page=await open('2026-10-31T05:59:00+09:00');
    assert.equal(await page.evaluate(()=>controller.getCast('night-member').dayAddedOn),'2026-10-30');
    await page.close();
    page=await open('2026-10-31T06:00:00+09:00');
    assert.equal(await page.evaluate(()=>controller.getCast('night-member')),null,'the member must roll over only at the configured time');
    assert.equal(await page.evaluate(()=>controller.state.dayMemberHistory.filter(entry=>entry.castId==='night-member').length),1,'rollover must retain history exactly once');
    await page.evaluate(()=>openRouteEditor(null,{id:'before-time-change',name:'時刻変更前のメンバー'}));
    await page.locator('.route-editor-choice').nth(0).click();await page.locator('#saveRouteEditor').click();
    assert.equal(await page.evaluate(()=>controller.getCast('before-time-change').dayAddedOn),'2026-10-31');
    await page.evaluate(()=>{managerOpen=true;render();});
    await page.locator('#dayRolloverTab').click();await page.locator('#openDayRolloverDial').click();
    await page.evaluate(()=>{selectRolloverValue('hour',9,true);selectRolloverValue('minute',30,true);});
    await page.locator('#saveDayRolloverDial').click();
    assert.ok(await page.evaluate(()=>controller.getCast('before-time-change')),'changing the boundary must not prematurely remove an existing member');
    await page.evaluate(()=>openRouteEditor(null,{id:'custom-day-member',name:'設定時刻の確認'}));
    await page.locator('.route-editor-choice').nth(0).click();await page.locator('#saveRouteEditor').click();
    assert.equal(await page.evaluate(()=>controller.getCast('custom-day-member').dayAddedOn),'2026-10-30');
    await page.close();
    page=await open('2026-10-31T09:29:00+09:00');
    assert.ok(await page.evaluate(()=>controller.getCast('custom-day-member')));
    assert.ok(await page.evaluate(()=>controller.getCast('before-time-change')));
    await page.close();
    page=await open('2026-10-31T09:30:00+09:00');
    assert.equal(await page.evaluate(()=>controller.getCast('custom-day-member')),null);
    assert.equal(await page.evaluate(()=>controller.getCast('before-time-change')),null);
    console.log('Member survives restart overnight; legacy dates repaired; 06:00/custom rollover and history: PASS');
  }finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
