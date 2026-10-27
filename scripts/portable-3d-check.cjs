const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const {version}=require('../package.json');
(async()=>{
 const executable=path.resolve(process.env.BISTRO_EXE||`release/${version}/BugBistro-${version}-Windows-x64.exe`);
 const data=path.resolve('.electron-test/portable-3d'),out=path.resolve('prototypes/overlook/qa');
 await fs.mkdir(data,{recursive:true});await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({windowMode:'normal'}));
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const env={...process.env,BISTRO_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;delete env.BISTRO_START_NORMAL;
 const child=spawn(executable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let exit=false,code,browser,page;const errors=[],checks=[];
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-12000)});
 child.on('error',e=>errors.push(e.message));child.on('exit',value=>{exit=true;code=value});
 try{
  const endpoint=`http://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<90;i++){if(exit)throw new Error('便携程序提前退出：'+code);try{const response=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(800)});if(response.ok){ready=true;break}}catch{}await delay(1000)}
  assert.ok(ready,'便携程序未就绪');browser=await chromium.connectOverCDP(endpoint);page=browser.contexts()[0].pages()[0];assert.ok(page);
  page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>demo?.info().renderer.calls>0&&document.body.classList.contains('native-app'),null,{timeout:30000});
  assert.ok(page.url().startsWith('file:'));assert.ok(page.url().includes('/bistro/'));
  await page.waitForFunction(async()=>(await bistro.appStatus()).mode==='desktop',null,{timeout:60000});
  // 挂载中的 mode 会先变化，需等输入模块就绪后的界面通知。
  await page.waitForFunction(()=>document.body.classList.contains('desktop-mode'),null,{timeout:60000});
  assert.equal((await page.evaluate(()=>bistro.appStatus())).version,version);
  assert.equal(await page.locator('.stats').isVisible(),false);assert.equal(await page.locator('#arrival-toast').isVisible(),false);
  assert.equal(browser.contexts()[0].pages().length,1);
  if(process.env.BISTRO_UI==='1'){console.log('请检查真实桌面默认背景画面，检查后按回车继续；页面截图不能代替此检查');process.stdin.resume();await new Promise(resolve=>process.stdin.once('data',resolve));process.stdin.pause()}
  await page.evaluate(()=>bistro.openSettings());const settings=browser.contexts()[0].pages().find(p=>p.url().endsWith('/settings.html'));assert.ok(settings);
  await settings.waitForFunction(()=>!document.querySelector('#vehicles').disabled);
  const login=await settings.evaluate(()=>bistro.loginSettings());assert.equal(login.supported,true);assert.equal(path.resolve(login.path),executable);
  assert.equal((await page.evaluate(()=>bistro.appStatus())).mode,'desktop');await settings.evaluate(()=>bistro.hideSettings());
  checks.push('启动默认成为桌面背景、设置为独立窗口、自启动指向原始便携EXE');
  await page.evaluate(()=>bistro.windowAction('restore'));await page.evaluate(()=>demo.pause());
  const point=await page.evaluate(()=>demo.point(-6.2,1.28,-1.75));await page.mouse.click(point.x,point.y);assert.equal(await page.locator('#veil').isVisible(),true);await page.locator('#close').click();
  checks.push('便携EXE自行解压、本地3D渲染、场景点击');
  await page.screenshot({path:path.join(out,'portable-window.png')});
  const state=await page.evaluate(()=>bistro.windowAction('desktop'));assert.equal(state.mode,'embedded');await delay(1200);
  assert.equal((await page.evaluate(()=>bistro.settings())).windowMode,'desktop');
  await page.screenshot({path:path.join(out,'portable-desktop.png')});
  await page.evaluate(()=>bistro.windowAction('restore'));assert.equal((await page.evaluate(()=>bistro.settings())).windowMode,'normal');
  checks.push('便携包内PowerShell模块可用、真实桌面挂载及恢复');
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>bistro.windowAction('close')).catch(()=>{});
  for(let i=0;i<20&&!exit;i++)await delay(500);
  assert.ok(exit,'退出后便携启动器不得残留');assert.equal(code,0);checks.push('退出成功且启动器无残留');
  await fs.writeFile(path.join(out,'portable-3d-result.json'),JSON.stringify({date:new Date().toISOString(),executable,checks,errors,exitCode:code,physicalInput:false,physicalDesktopScreenshot:false,forcedSoftwareRendering:false},null,2));
  console.log('便携版验收通过：'+checks.join('；'));
 }catch(e){console.error('便携程序输出：'+output);throw e}finally{
  if(page&&!exit)await page.evaluate(()=>bistro.quit()).catch(()=>{});
  if(browser)await browser.close();
  for(let i=0;i<20&&!exit;i++)await delay(500);
  if(!exit){child.kill();console.error('测试启动器未响应退出，已停止本次启动的启动器进程')}
 }
})().catch(e=>{console.error('便携验收失败：',e);process.exitCode=1});
