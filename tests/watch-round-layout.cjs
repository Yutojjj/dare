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
      if(url.endsWith('/watch-firebase.js'))return route.fulfill({contentType:'application/javascript',body:'window.WatchFirebase={start(){}};'});
      if(url.endsWith('/native-bridge.js'))return route.fulfill({contentType:'application/javascript',body:''});
      return url.startsWith(origin)?route.continue():route.abort();
    });
    await page.goto(origin+'/watch/index.html');
    await page.evaluate(()=>{controller.state=new WatchCore.WatchController(WatchCore.createWatchStore(null)).state;render();});
    const add=await page.locator('#openMemberAddButton').boundingBox();
    assert.ok(add.y>340&&add.width>=390,'addition must cover the bottom arc');
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-home.png')});
    await page.evaluate(()=>openCast(controller.state.casts[0].id));
    const next=await page.locator('#nextTableAction').boundingBox();
    assert.ok(next.y>340&&next.width>=390,'next-table action must cover the bottom arc');
    assert.equal(await page.locator('#undoMoveButton').isVisible(),true);
    assert.equal(await page.locator('#openMemberAddButton').isVisible(),false);
    await page.screenshot({path:path.join(root,'watch-android/preview-isolated-detail.png')});
    await page.evaluate(()=>openMemberActions(controller.state.casts[0].id));
    const modal=await page.locator('#memberActionsDialog').boundingBox();assert.equal(modal.height,396);
    await page.evaluate(()=>{
      const event=(type,x)=>{const touch=new Touch({identifier:1,target:document.body,clientX:x,clientY:198});document.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));};
      event('touchstart',5);event('touchmove',160);event('touchend',160);
    });
    await page.waitForTimeout(250);assert.equal(await page.locator('#memberActionsDialog').isVisible(),false);
    console.log('Round home/detail geometry and full-screen modal swipe: PASS');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
