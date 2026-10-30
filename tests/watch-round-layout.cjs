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
      if(url.endsWith('/native-bridge.js'))return route.fulfill({contentType:'application/javascript',body:''});
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
    assert.equal(await page.locator('#undoMoveButton').isVisible(),true);
    assert.equal(await page.locator('#timerPresets button').count(),4);
    assert.equal(await page.locator('#openMemberAddButton').isVisible(),false);
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-detail.png')});
    await page.setViewportSize({width:225,height:225});
    const presetBoxes=await page.locator('#timerPresets button').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().y));
    assert.ok(Math.max(...presetBoxes)-Math.min(...presetBoxes)<1,'small watch presets must stay on one row');
    const reset=await page.locator('#resetTimerButton svg').boundingBox(); assert.ok(reset.width<18,'reset icon must scale with the watch');
    await page.evaluate(()=>openRouteEditor(controller.state.casts[0]));
    assert.equal(await page.locator('.route-editor-table-grid').count(),1);
    assert.equal(await page.locator('.route-choice-floor').count(),10);
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-route.png')});
    await page.evaluate(()=>closeRouteEditor());
    await page.evaluate(()=>openPerformanceInput(controller.state.casts[0]));
    await page.waitForFunction(()=>document.querySelectorAll('.performance-row').length===2);
    const lastStep=await page.locator('.performance-stepper').last().boundingBox();
    const save=await page.locator('#savePerformance').boundingBox();assert.ok(lastStep.y+lastStep.height<save.y);
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-performance.png')});
    await page.evaluate(()=>closePerformance());
    await page.evaluate(()=>openTimerDialog());
    await page.evaluate(()=>setWheelValue('seconds',30,true));
    assert.equal(await page.locator('#secondWheel .selected').textContent(),'30');
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-wheel.png')});
    await page.evaluate(()=>closeTimerDialog());
    await page.setViewportSize({width:396,height:396});
    await page.evaluate(()=>openMemberActions(controller.state.casts[0].id));
    const modal=await page.locator('#memberActionsDialog').boundingBox();assert.equal(modal.height,396);
    await page.evaluate(()=>{
      const event=(type,x)=>{const touch=new Touch({identifier:1,target:document.body,clientX:x,clientY:198});document.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));};
      event('touchstart',80);event('touchmove',220);event('touchend',220);
    });
    await page.waitForTimeout(250);assert.equal(await page.locator('#memberActionsDialog').isVisible(),false);
    console.log('Round home/detail geometry and full-screen modal swipe: PASS');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
