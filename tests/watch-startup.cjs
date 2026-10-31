// Isolated startup timing and edit-lock test. No live service is contacted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),core=require('../watch/watch-core.js');
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH});
  try{
    for(const cached of [true,false]){
      const page=await browser.newPage({viewport:{width:396,height:396}});
      const seed=core.createSeedState();seed.casts[0].name='前回の一覧';
      await page.addInitScript(({cached,seed})=>{if(cached)localStorage.setItem('watch-confirmed-state-v1',JSON.stringify(seed));},{cached,seed});
      await page.route('**/*',async route=>{
        const url=route.request().url();
        if(url.endsWith('firebase-app-compat.js')){
          await new Promise(resolve=>setTimeout(resolve,600));
          return route.fulfill({contentType:'application/javascript',body:'window.firebase={apps:[],initializeApp:()=>({})};'});
        }
        if(url.endsWith('firebase-firestore-compat.js'))return route.fulfill({contentType:'application/javascript',body:`
          window.__writes=[];
          firebase.firestore=()=>({collection:()=>({doc:name=>({
            get:()=>new Promise((resolve,reject)=>{window.__acceptRemote=state=>resolve({exists:true,data:()=>({state})});window.__rejectRemote=()=>reject(new Error('offline'));}),
            set:value=>{window.__writes.push(value);return Promise.resolve();},onSnapshot:()=>()=>{}
          })})});firebase.firestore.FieldValue={serverTimestamp:()=>0};
        `});
        if(url.endsWith('native-bridge.js'))return route.fulfill({contentType:'application/javascript',body:'window.__nativeSync=[];window.DareWatchNative={syncTimers:raw=>window.__nativeSync.push(JSON.parse(raw))};'});
        return url.startsWith(origin)?route.continue():route.abort();
      });
      await page.goto(origin+'/watch/index.html',{waitUntil:'domcontentloaded'});
      if(cached){
        await page.waitForFunction(()=>!document.getElementById('watchBoot'),{timeout:1500});
        assert.equal(await page.locator('#watchFace').evaluate(el=>el.inert),true);
        assert.match(await page.locator('#homeScreen').innerText(),/前回の一覧/);
        assert.equal(await page.locator('#openMemberAddButton').innerText(),'最新データを確認中…');
        const button=await page.locator('#openMemberAddButton').boundingBox();
        await page.mouse.click(button.x+button.width/2,button.y+button.height/2);
        assert.equal(await page.locator('#memberPickerDialog').evaluate(el=>el.hidden),true,'cached roster must not permit edits before reconciliation');
      }else assert.equal(await page.locator('#watchBoot').count(),1);
      await page.waitForFunction(()=>typeof window.__acceptRemote==='function');
      assert.deepEqual(await page.evaluate(()=>window.__writes),[],'cached display must never be uploaded during startup');
      assert.deepEqual(await page.evaluate(()=>window.__nativeSync),[],'unconfirmed cached timers must never be reserved as new alarms');
      if(cached){
        await page.evaluate(()=>window.__rejectRemote());
        await page.waitForFunction(()=>document.getElementById('openMemberAddButton').textContent==='接続待ち・表示のみ');
        assert.equal(await page.locator('#watchFace').evaluate(el=>el.inert),true);
        await page.evaluate(()=>window.dispatchEvent(new Event('online')));
        await page.waitForFunction(()=>startupMessage==='接続待ち・表示のみ'&&connectTask!==null);
      }
      const latest=structuredClone(seed);latest.casts[0].name='最新の一覧';
      await page.evaluate(latest=>window.__acceptRemote(latest),latest);
      await page.waitForFunction(()=>!document.getElementById('watchBoot')&&!document.getElementById('watchFace').inert);
      assert.match(await page.locator('#homeScreen').innerText(),/最新の一覧/);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('watch-confirmed-state-v1')).casts[0].name),'最新の一覧');
      await page.close();
    }
    console.log('Cached screen before network, first-launch loading, edit lock and server reconciliation: PASS');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
