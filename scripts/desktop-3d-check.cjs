const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs/promises');
const {_electron}=require('playwright');
(async()=>{
 const env={...process.env,BISTRO_START_NORMAL:'1',BISTRO_DATA_DIR:path.resolve('.electron-test/3d-desktop')};delete env.ELECTRON_RUN_AS_NODE;
 await fs.mkdir(env.BISTRO_DATA_DIR,{recursive:true});await fs.writeFile(path.join(env.BISTRO_DATA_DIR,'settings.json'),JSON.stringify({windowMode:'normal'}));
 const args=['--remote-debugging-port=9347','--enable-unsafe-swiftshader','--use-angle=swiftshader'];if(!process.env.BISTRO_EXE)args.push('.');
 const app=await _electron.launch({...(process.env.BISTRO_EXE?{executablePath:process.env.BISTRO_EXE}:{}),args,cwd:process.cwd(),env,timeout:30000});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error')console.log('页面错误：'+msg.text())});
 app.process().stdout?.on('data',b=>console.log(String(b)));app.process().stderr?.on('data',b=>console.log(String(b)));
 try{
  await page.waitForFunction(()=>window.demo?.info().renderer.calls>0&&document.body.classList.contains('native-app'));
  assert.equal(await page.evaluate(()=>demo.info().camera),0);
  const size=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getContentSize());assert.ok(Math.abs(size[0]/size[1]-16/9)<.005);
  await page.evaluate(()=>demo.pause());await page.locator('#settings-panel').evaluate(e=>e.hidden=false);
  await page.locator('#vehicle-limit').fill('10');await page.locator('#vehicle-limit').dispatchEvent('change');
  await page.waitForFunction(async()=>(await bistro.sceneSettings()).vehicles===10);
  await page.locator('#settings-panel').evaluate(e=>e.hidden=true);
  const point=await page.evaluate(()=>demo.point(-6.2,1.28,-1.75));await page.mouse.click(point.x,point.y);assert.equal(await page.locator('#veil').isVisible(),true);await page.locator('#close').click();
  await page.screenshot({path:path.resolve('prototypes/overlook/qa/native-window.png')});
  console.log('通过：正式本地3D入口、16:9窗体、持久化配置及三区点击');
  const state=await page.evaluate(()=>bistro.windowAction('desktop'));assert.equal(state.mode,'embedded');
  await page.waitForFunction(()=>document.body.classList.contains('desktop-mode'));
  await page.screenshot({path:path.resolve('prototypes/overlook/qa/native-desktop.png')});
  const before=await page.evaluate(()=>demo.snapshot().time);await page.evaluate(()=>document.querySelector('#pause').click());await page.waitForTimeout(1000);assert.ok(await page.evaluate(t=>demo.snapshot().time>t,before),'桌面挂载后模拟应持续运行');await page.evaluate(()=>demo.pause());
  await page.evaluate(()=>bistro.saveSceneSettings({waiting:3,vehicles:10,interactive:false}));await page.evaluate(()=>bistro.saveSceneSettings({waiting:3,vehicles:10,interactive:true}));
  console.log('桌面已挂载，准备物理输入验收；坐标：'+JSON.stringify(point));
  if(process.env.BISTRO_UI==='1'){
   await page.waitForFunction(()=>!document.querySelector('#veil').hidden,null,{timeout:240000});
   console.log('通过：真实桌面输入已打开Bug明细');
   await page.waitForFunction(()=>document.querySelector('#veil').hidden,null,{timeout:120000});
   console.log('通过：真实桌面输入可关闭明细');
  }
  await page.evaluate(()=>bistro.windowAction('restore'));await page.waitForFunction(()=>!document.body.classList.contains('desktop-mode'));
  assert.equal((await page.evaluate(()=>bistro.settings())).windowMode,'normal');
  assert.deepEqual(errors,[]);console.log('通过：桌面挂载、原生输入进程、恢复窗口，无页面错误');
  await fs.writeFile(path.resolve('prototypes/overlook/qa/native-result.json'),JSON.stringify({date:new Date().toISOString(),errors,size,physicalInput:process.env.BISTRO_UI==='1'},null,2));
 }finally{try{await page.evaluate(()=>bistro.windowAction('restore'))}catch{}await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
