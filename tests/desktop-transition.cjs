const assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),net=require('node:net'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const fromSource=process.env.BISTRO_SOURCE==='1';
 const exe=path.resolve(fromSource?'node_modules/electron/dist/electron.exe':process.env.BISTRO_EXE||`release/${require('../package.json').version}/win-unpacked/Bug小餐馆.exe`),data=path.resolve('.electron-test/timing-'+Date.now());await fs.mkdir(data,{recursive:true});
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const env={...process.env,BISTRO_DATA_DIR:data};delete env.BISTRO_START_NORMAL;delete env.ELECTRON_RUN_AS_NODE;
 const start=performance.now(),times={executable:exe};let browser,page,exited=false,output='';
 const child=spawn(exe,[...(fromSource?['.']:[]),`--remote-debugging-port=${port}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.on('exit',()=>exited=true);for(const stream of [child.stdout,child.stderr])stream.on('data',v=>output=(output+v).slice(-2500));
 try{
  for(let i=0;i<500;i++){if(exited)throw Error('程序提前退出 '+output);try{const r=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(150)});if(r.ok)break}catch{}await wait(100)}
  times.debugReadyMs=Math.round(performance.now()-start);browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];
  await page.waitForFunction(()=>globalThis.demo?.info().renderer.calls>0);times.sceneReadyMs=Math.round(performance.now()-start);
  let ready=false;for(let i=0;i<600;i++){ready=await page.evaluate(async()=>{const s=await bistro.appStatus();return s.mode==='desktop'&&s.switching===false&&document.visibilityState==='visible'&&document.body.classList.contains('desktop-mode')});if(ready)break;await wait(100)}assert.ok(ready,'桌面模式和交互必须就绪');times.desktopModeMs=Math.round(performance.now()-start);
  await page.evaluate(()=>bistro.openSettings());const settings=browser.contexts()[0].pages().find(p=>p.url().endsWith('/settings.html'));await settings.waitForFunction(()=>!document.querySelector('#vehicles').disabled);await settings.evaluate(()=>bistro.hideSettings());times.settingsReadyMs=Math.round(performance.now()-start);
  assert.equal(await page.evaluate(()=>demo.info().camera),0,'默认使用斜摆视角');
  await page.evaluate(()=>bistro.windowAction('restore'));await page.evaluate(()=>{globalThis.transitionFrames=[];globalThis.trackTransition=true;function tick(){if(!trackTransition)return;transitionFrames.push({visible:!document.hidden,desktop:document.body.classList.contains('desktop-mode'),width:innerWidth,height:innerHeight,buttons:getComputedStyle(document.querySelector('.window-controls')).display,top:getComputedStyle(document.querySelector('.world-top')).display});requestAnimationFrame(tick)}requestAnimationFrame(tick)});
  await page.evaluate(()=>bistro.windowAction('desktop'));await wait(250);times.badFullscreenFrames=await page.evaluate(()=>{trackTransition=false;return transitionFrames.filter(f=>f.visible&&f.width===screen.width&&f.height===screen.height&&(f.buttons!=='none'||f.top!=='none')).length});
  times.transitionFrameCount=await page.evaluate(()=>transitionFrames.length);assert.ok(times.transitionFrameCount>0,'必须实际采集到切换帧');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('desktop-mode')),true);
  assert.equal(times.badFullscreenFrames,0,'背景切换期间不能显示带窗口工具栏的全屏帧');
  if(process.env.BISTRO_UI==='1'){console.log('请观察真实桌面：默认斜摆背景，检查后按回车继续');process.stdin.resume();await new Promise(resolve=>process.stdin.once('data',resolve));process.stdin.pause()}
  console.log(JSON.stringify(times));await fs.writeFile(path.join(data,'result.json'),JSON.stringify(times,null,2));
 }catch(e){console.error('启动测量：',JSON.stringify(times));throw e}finally{if(page&&!exited)await page.evaluate(()=>bistro.quit()).catch(()=>{});if(browser)await browser.close();for(let i=0;i<30&&!exited;i++)await wait(300);if(!exited)child.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
