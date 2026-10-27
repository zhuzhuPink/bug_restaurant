const {chromium}=require('playwright')
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict')
const {spawn}=require('node:child_process')
const root=path.resolve(__dirname,'..'),out=path.join(root,'work','scene-v3-portable')
const executable=process.env.PORTABLE_EXE||path.join(root,'release','preview-v3','BugBistro-1.1.0-preview-Windows-x64.exe')
const data=path.join(root,'.electron-test','portable-'+Date.now()),checks=[],samples=[],errors=[]
let child,browser,page,exited=false,exitCode
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port}
async function check(name,fn){await fn();checks.push(name);console.log('通过：'+name)}
async function main(){
 await fs.mkdir(out,{recursive:true});const port=await freePort(),env={...process.env,BISTRO_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE
 child=spawn(executable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore'})
 child.once('error',e=>{errors.push(e.message);exited=true});child.once('exit',code=>{exited=true;exitCode=code})
 const endpoint=`http://127.0.0.1:${port}`;let connected=false
 for(let i=0;i<120;i++){if(exited)throw new Error('便携启动器提前退出，退出码：'+exitCode);try{const r=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(800)});if(r.ok){connected=true;break}}catch{}await delay(1000)}
 if(!connected)throw new Error('便携版调试端口未就绪，不能据此认定程序已启动')
 browser=await chromium.connectOverCDP(endpoint);page=browser.contexts()[0].pages()[0];if(!page)throw new Error('没有找到便携版主页面');page.on('pageerror',e=>errors.push(e.message))
 await check('便携EXE自解压启动、离线Mock及全部动画图集加载',async()=>{await page.waitForFunction(()=>document.querySelector('[data-testid="scene-canvas"]')?.dataset.ready==='true',null,{timeout:45000});const s=await page.evaluate(()=>window.bistro.settings());await page.evaluate(s=>window.bistro.saveSettings({...s,autoDemo:false,windowMode:'normal'}),s);const count=await page.getByTestId('count-todo').textContent();assert.ok(Number(count)>0);assert.equal(await page.locator('img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),true)})
 await check('便携版动画持续前进',async()=>{const time=Number(await page.getByTestId('scene-canvas').getAttribute('data-time'));await delay(1500);assert.ok(Number(await page.getByTestId('scene-canvas').getAttribute('data-time'))>time)})
 await page.screenshot({path:path.join(out,'01-portable.png'),scale:'css'})
 if(process.env.PORTABLE_UI==='1'){
  console.log('便携版已就绪，等待UI进入桌面模式并恢复（最多5分钟）。')
  let previous='';for(let i=0;i<300;i++){if(exited)throw new Error('UI验收前程序已退出');const state=await page.evaluate(async()=>({mode:(await window.bistro.settings()).windowMode,time:document.querySelector('[data-testid="scene-canvas"]')?.dataset.time}));if(state.mode!==previous){samples.push({...state,date:new Date().toISOString()});previous=state.mode;console.log('观察到窗口模式：'+state.mode)}if(samples.some(s=>s.mode==='desktop')&&samples.at(-1)?.mode==='normal'&&samples.length>=3)break;await delay(1000)}
  assert.ok(samples.some(s=>s.mode==='desktop'),'未观察到UI进入桌面');assert.equal(samples.at(-1)?.mode,'normal','未观察到UI恢复普通窗口');checks.push('真实UI进入桌面并恢复普通窗口')
 }else{
  await check('便携版真实桌面模式与恢复',async()=>{const r=await page.evaluate(()=>window.bistro.windowAction('desktop'));assert.equal(r.mode,'embedded');await delay(1500);assert.equal((await page.evaluate(()=>window.bistro.settings())).windowMode,'desktop');await page.screenshot({path:path.join(out,'02-desktop.png'),scale:'css'});await page.evaluate(()=>window.bistro.windowAction('restore'));assert.equal((await page.evaluate(()=>window.bistro.settings())).windowMode,'normal')})
 }
 await check('便携版新增订单可交互',async()=>{const before=Number(await page.getByTestId('count-todo').textContent());await page.getByRole('button',{name:/新来一单/}).click();await page.waitForFunction(n=>Number(document.querySelector('[data-testid="count-todo"]').textContent)===n+1,before)})
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'03-restored.png'),scale:'css'})
 await page.evaluate(()=>window.bistro.windowAction('close')).catch(()=>{});for(let i=0;i<30&&!exited;i++)await delay(1000);assert.equal(exited,true,'退出后便携启动器不应残留');assert.equal(exitCode,0);checks.push('正常退出，无便携启动器残留')
 const report={date:new Date().toISOString(),executable,ui:process.env.PORTABLE_UI==='1',checks,samples,errors,exitCode};await fs.writeFile(path.join(out,'portable-result.json'),JSON.stringify(report,null,2));console.log('便携验收完成：'+checks.length+'项；退出码 '+exitCode)
}
main().catch(e=>{console.error('便携验收失败：',e);process.exitCode=1}).finally(async()=>{if(page&&!exited){try{await page.evaluate(()=>window.bistro.windowAction('close'))}catch{}}try{await browser?.close()}catch{}})
