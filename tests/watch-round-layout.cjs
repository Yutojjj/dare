// Isolated visual check: Firebase and the native bridge are replaced; live data is never accessed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[ext]||'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH});
  try{
    const page=await browser.newPage({viewport:{width:396,height:396},hasTouch:true});
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(url.endsWith('/watch-firebase.js'))return route.fulfill({contentType:'application/javascript',body:'window.WatchFirebase={async start(){},async readPerformance(){return {members:[{id:"cast-aoi"}]};}};'});
      if(url.endsWith('/native-bridge.js'))return route.fulfill({contentType:'application/javascript',body:'window.__nativeSync=[];window.DareWatchNative={syncTimers:raw=>window.__nativeSync.push(JSON.parse(raw))};'});
      return url.startsWith(origin)?route.continue():route.abort();
    });
    await page.goto(origin+'/watch/index.html');
    await page.evaluate(()=>{controller.state=new WatchCore.WatchController(WatchCore.createWatchStore(null)).state;render();});
    const add=await page.locator('#openMemberAddButton').boundingBox();
    assert.ok(add.y>340&&add.width>=390,'addition must cover the bottom arc');
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-home.png')});
    const nameFonts=[];
    for(const size of ['small','medium','large']){
      nameFonts.push(await page.evaluate(size=>{
        homeCardSize=size;controller.state.casts[0].name='あいうえおかきくけこ長い名前';render();
        const name=document.querySelector('.cast-card-name');const style=getComputedStyle(name);
        if(style.textOverflow==='ellipsis'||style.whiteSpace==='nowrap')throw new Error('member name is truncated');
        return style.fontSize;
      },size));
    }
    assert.equal(new Set(nameFonts).size,1,'member name font must not change across display sizes');
    const wrapped=await page.evaluate(()=>{
      controller.state.casts[0].name='非常に長い名前を省略せず表示するための確認'.repeat(3);render();
      const name=document.querySelector('.cast-card-name'),row=name.closest('.cast-list-row');
      return {nameBottom:name.getBoundingClientRect().bottom,rowBottom:row.getBoundingClientRect().bottom};
    });
    assert.ok(wrapped.nameBottom<=wrapped.rowBottom+1,'long names must expand the row instead of overlapping the next member');
    await page.evaluate(()=>{homeCardSize='small';render();});
    await page.evaluate(()=>openCast(controller.state.casts[0].id));
    const next=await page.locator('#nextTableAction').boundingBox();
    assert.ok(next.y>340&&next.width>=390,'next-table action must cover the bottom arc');
    assert.equal(await page.locator('#undoMoveButton').count(),0);
    assert.equal(await page.locator('#performanceInputButton').isVisible(),true);
    assert.equal(await page.locator('#timerPresets').isVisible(),false);
    assert.equal(await page.locator('#timerPresets button').count(),4);
    assert.equal(await page.locator('#openMemberAddButton').isVisible(),false);
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-detail.png')});
    await page.setViewportSize({width:225,height:225});
    await page.locator('#timerDisplay').click();
    assert.equal(await page.locator('#timerAdjustDialog').isVisible(),true);
    const beforeAdjust=await page.evaluate(()=>controller.getRemainingMs(controller.state.casts[0].id));
    await page.locator('#addOneMinute').click();
    const afterAdjust=await page.evaluate(()=>controller.getRemainingMs(controller.state.casts[0].id));
    assert.ok(afterAdjust-beforeAdjust>59000,'modal adjustment must add one minute');
    for(const width of [225,396]){
      await page.setViewportSize({width,height:width});
      const buttons=await page.locator('.timer-adjust-grid button').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
      assert.ok(buttons.every(b=>b.h>=width*.13&&Math.hypot(b.x-width/2,b.y-width/2)<width/2),'adjust buttons must be large and inside the watch');
    }
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-adjust.png')});
    await page.evaluate(()=>document.dispatchEvent(new Event('dare-watch-back')));
    await page.waitForTimeout(230);
    assert.equal(await page.locator('#timerAdjustDialog').isVisible(),false);
    assert.equal(await page.locator('#detailScreen').isVisible(),true);
    await page.setViewportSize({width:225,height:225});
    assert.equal(await page.locator('#resetTimerButton').count(),0);
    const play=await page.locator('#pauseTimerButton').boundingBox(),controlRow=await page.locator('#timerControls').boundingBox();
    assert.ok(Math.abs(play.width-controlRow.width)<1,'play/pause button must fill the entire row');
    await page.evaluate(()=>{window.__nativeSync=[];});
    await page.locator('#pauseTimerButton').click();
    assert.equal(await page.locator('#pauseTimerButton').getAttribute('aria-label'),'再開');
    assert.equal(await page.evaluate(()=>window.__nativeSync.at(-1).timers['cast-aoi'].paused),true,'pause must immediately reach native alarms without a remote callback');
    await page.locator('#pauseTimerButton').click();
    assert.equal(await page.locator('#pauseTimerButton').getAttribute('aria-label'),'一時停止');
    assert.equal(await page.evaluate(()=>window.__nativeSync.at(-1).timers['cast-aoi'].paused),false,'resume must immediately reach native alarms without a remote callback');
    await page.evaluate(()=>openRouteEditor(controller.state.casts[0]));
    assert.equal(await page.locator('.route-editor-table-grid').count(),2);
    assert.deepEqual(await page.locator('.route-editor-floor').allTextContents(),['1階','2階']);
    const tableChoice=await page.locator('.route-editor-choice').first().boundingBox();
    assert.ok(tableChoice.height>=225*.14,'table choices must be large enough for touch');
    const lastTable=page.locator('.route-editor-floor-section').last().locator('.route-editor-choice').last();
    await lastTable.scrollIntoViewIfNeeded();
    const routeScroll=await page.locator('#routeEditorChoices').evaluate(el=>el.scrollTop);
    assert.ok(routeScroll>0,'later floors must be reachable by vertical scrolling');
    await lastTable.click();
    assert.ok(await page.evaluate(()=>routeDraft.includes('table-10')));
    assert.ok(Math.abs(await page.locator('#routeEditorChoices').evaluate(el=>el.scrollTop)-routeScroll)<2,'selecting a table must preserve scroll position');
    await page.locator('#routeEditorChoices').evaluate(el=>{el.scrollTop=0;});
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-route.png')});
    await page.evaluate(()=>closeRouteEditor());
    await page.evaluate(()=>{const cast=controller.state.casts[0];cast.name='ゆう';cast.currentTableId='table-8';cast.destinationTableId='table-7';requestTableMove(cast);});
    assert.deepEqual(await page.locator('#actionConfirmMessage span').allTextContents(),['ゆう','2階・8卓','↓','2階・7卓']);
    for(const width of [225,396]){
      await page.setViewportSize({width,height:width});
      const lines=await page.locator('#actionConfirmMessage span').evaluateAll(items=>items.map(item=>{const b=item.getBoundingClientRect();return {y:b.y,bottom:b.bottom,font:parseFloat(getComputedStyle(item).fontSize)};}));
      assert.ok(lines.slice(1).every((line,i)=>lines[i].bottom<=line.y),'movement confirmation lines must not overlap');
      assert.ok(lines[1].font>=width*.07,'table names must be large and clear');
      const button=await page.locator('#approveActionConfirm').boundingBox();assert.ok(lines.at(-1).bottom<button.y);
    }
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-move-confirm.png')});
    await page.evaluate(()=>closeActionConfirmation());
    await page.evaluate(()=>{openActionConfirmation('削除の確認','確認用',()=>{});});
    assert.equal(await page.locator('#actionConfirmDialog').evaluate(el=>el.classList.contains('table-move-confirmation')),false,'deletion must keep its ordinary confirmation layout');
    await page.evaluate(()=>closeActionConfirmation());
    await page.evaluate(()=>openPerformanceInput(controller.state.casts[0]));
    await page.waitForFunction(()=>document.querySelectorAll('.performance-row').length===2);
    for(const width of [225,396]){
      await page.setViewportSize({width,height:width});
      const title=await page.locator('#performanceTitle').boundingBox(),date=await page.locator('#performanceDate').boundingBox(),label=await page.locator('.performance-row strong').first().boundingBox();
      assert.ok(title.y+title.height<date.y,'performance date must sit below its title');
      assert.ok(date.y+date.height<label.y,'member and date must not overlap the first metric label');
    }
    const lastStep=await page.locator('.performance-stepper').last().boundingBox();
    const save=await page.locator('#savePerformance').boundingBox();assert.ok(lastStep.y+lastStep.height<save.y);
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-performance.png')});
    await page.evaluate(()=>closePerformance());
    await page.setViewportSize({width:225,height:225});
    await page.evaluate(()=>openTimerDialog());
    await page.evaluate(()=>setWheelValue('seconds',30,true));
    assert.equal(await page.locator('#secondWheel .selected').textContent(),'30');
    await page.evaluate(()=>{timerChoices=[300,330,420,720];renderTimer(controller.state.casts[0]);});
    for(const width of [225,396]){
      await page.setViewportSize({width,height:width});
      const readout=await page.locator('#wheelTimeReadout').boundingBox(),message=await page.locator('#timerConfigMessage').boundingBox(),actions=await page.locator('#timerDialog .timer-dialog-actions').boundingBox(),choices=await page.locator('#timerSavedChoices').boundingBox();
      assert.ok(readout.y+readout.height<=message.y+1,'time readout must not overlap the status');
      assert.ok(message.y+message.height<=actions.y+1,'status must not overlap timer actions');
      assert.ok(actions.y+actions.height<choices.y,'saved choices must appear below actions');
      assert.equal(await page.locator('#timerSavedChoices button').count(),4);
      const corners=await page.locator('#timerSavedChoices button').evaluateAll(buttons=>buttons.flatMap(button=>{const b=button.getBoundingClientRect();return [[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]];}));
      assert.ok(corners.every(([x,y])=>Math.hypot(x-width/2,y-width/2)<=width/2),'delete buttons must fit inside the round screen');
    }
    const timerBefore=await page.evaluate(()=>JSON.stringify(controller.state.timers));
    await page.getByRole('button',{name:'5分30秒候補を削除',exact:true}).click();
    assert.equal(await page.locator('#timerSavedChoices button').count(),3);
    assert.equal(await page.evaluate(()=>JSON.stringify(controller.state.timers)),timerBefore,'removing a shortcut must not modify a running timer');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('watchTimerChoicesV2'))),[300,420,720]);
    await page.evaluate(()=>{setWheelValue('minutes',5,true);setWheelValue('seconds',30,true);});
    await page.locator('#saveTimerChoice').click();
    assert.equal(await page.locator('#timerSavedChoices button').count(),4);
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-wheel.png')});
    await page.evaluate(()=>closeTimerDialog());
    await page.evaluate(()=>showHome());
    for(const mode of ['tables','name','time']){
      await page.locator('#homeFilterButton').click();
      assert.equal(await page.locator('#homeFilterButton').getAttribute('data-mode'),mode);
      if(mode==='name')assert.equal(await page.locator('#homeFilterButton text').textContent(),'あ');
      if(mode==='time')assert.equal(await page.locator('#homeFilterButton circle').count(),1);
    }
    await page.setViewportSize({width:396,height:396});
    await page.evaluate(()=>openMemberActions(controller.state.casts[0].id));
    const modal=await page.locator('#memberActionsDialog').boundingBox();assert.equal(modal.height,396);
    await page.evaluate(()=>{
      const event=(type,x)=>{const touch=new Touch({identifier:1,target:document.body,clientX:x,clientY:198});document.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));};
      event('touchstart',80);event('touchmove',220);event('touchend',220);
    });
    await page.waitForTimeout(250);assert.equal(await page.locator('#memberActionsDialog').isVisible(),false);
    await page.evaluate(()=>{managerOpen=true;render();});
    await page.locator('#dayRolloverTab').click();
    await page.locator('#openDayRolloverDial').click();
    assert.equal(await page.locator('#rolloverHourWheel .wheel-option').count(),24);
    assert.equal(await page.locator('#rolloverMinuteWheel .wheel-option').count(),60);
    for(const width of [225,396]){
      await page.setViewportSize({width,height:width});
      await page.evaluate(()=>{selectRolloverValue('hour',9,true);selectRolloverValue('minute',30,true);});
      const header=await page.locator('#dayRolloverTitle').boundingBox(),dial=await page.locator('#dayRolloverDialog .time-wheel-picker').boundingBox(),readout=await page.locator('#rolloverTimeReadout').boundingBox(),saveClock=await page.locator('#saveDayRolloverDial').boundingBox();
      assert.ok(header.y+header.height<dial.y,'rollover title and dials must not overlap');
      assert.ok(dial.y+dial.height<readout.y&&readout.y+readout.height<saveClock.y,'rollover dials, readout and save must not overlap');
    }
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-rollover-clock.png')});
    await page.locator('#saveDayRolloverDial').click();
    assert.equal(await page.locator('#dayRolloverDialog').isVisible(),false);
    assert.equal(await page.locator('#openDayRolloverDial').textContent(),'09:30');
    assert.equal(await page.evaluate(()=>localStorage.getItem('watch-day-rollover-v1')),'09:30');
    await page.locator('#openDayRolloverDial').click();
    await page.evaluate(()=>{selectRolloverValue('hour',23,true);selectRolloverValue('minute',59,true);
      const event=(type,x)=>{const touch=new Touch({identifier:1,target:document.body,clientX:x,clientY:198});document.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));};
      event('touchstart',80);event('touchmove',220);event('touchend',220);
    });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#dayRolloverDialog').isVisible(),false);
    assert.equal(await page.locator('#manageScreen').isVisible(),true,'swiping back must preserve the settings screen');
    assert.equal(await page.evaluate(()=>localStorage.getItem('watch-day-rollover-v1')),'09:30','swiping without save must discard dial changes');
    await page.evaluate(()=>{const cast=controller.state.casts[0];controller.startTimerDuration(cast.id,1000,Date.now()-2000);controller.tick();renderTimer(cast);});
    assert.equal(await page.locator('#timerNotice').textContent(),'','expired timer must not show an extra time-up caption');
    assert.equal(await page.locator('#watchToast').isVisible(),false,'expiry must not show an in-app red banner');
    assert.equal(await page.evaluate(()=>controller.state.timers[controller.state.casts[0].id].alerted),true,'expiry handling must still run');
    await page.evaluate(()=>{const cast=controller.state.casts[0];controller.startTimerDuration(cast.id,60000,Date.now()-31000);alertSettings.advanceSecondsList=[30];const end=controller.state.timers[cast.id].endsAt;previousRemaining.set(cast.id,{end,remaining:31000});checkAdvanceAlerts();});
    assert.equal(await page.locator('#watchToast').isVisible(),false,'advance warning must not show an in-app red banner');
    assert.equal(await page.evaluate(()=>advanceAlertsSent.has(`${controller.state.casts[0].id}|30`)),true);
    console.log('Round home/detail geometry and full-screen modal swipe: PASS');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
