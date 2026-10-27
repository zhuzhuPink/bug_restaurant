const {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,safeStorage,screen,globalShortcut,dialog,shell}=require('electron')
const fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process')
const {promisify}=require('node:util'),run=promisify(execFile)
const {validate,endpointURL}=require('./preferences.cjs')
const sceneConfig=require('./scene-settings.cjs')
const {startDesktopInput}=require('./desktop-input.cjs')
const login=require('./login.cjs').createLogin(app)
const {createUpdater}=require('./updates.cjs')
// 安装包仅带简体中文资源，启动时固定语言，避免依赖系统语言回退。
app.commandLine.appendSwitch('lang','zh-CN')
if(process.env.BISTRO_DATA_DIR) app.setPath('userData',path.resolve(process.env.BISTRO_DATA_DIR))
let win,settingsWin,tray,starting=true,preferences,token='',mode='normal',quitting=false,normalBounds,modeBusy=false,nativeState,desktopDisplay,hostTimer,modeRequest=0
let sceneSettings=sceneConfig.validate(),desktopInput,sceneQueue=Promise.resolve()
let updater
function updates(){
 if(!updater)updater=createUpdater({current:require('../package.json'),cacheDir:path.join(app.getPath('userData'),'updates'),enabled:process.platform==='win32'&&process.env.BISTRO_DISABLE_UPDATES!=='1',onChange:value=>{if(settingsWin&&!settingsWin.isDestroyed())settingsWin.webContents.send('updates:changed',value)}})
 return updater
}
async function installUpdate(){
 return updates().install(async value=>{
  const result=await dialog.showMessageBox(settingsWin||win,{type:'warning',title:'安装小餐馆更新',message:'退出小餐馆并安装 v'+value.latestVersion+'？',detail:'安装包 SHA-256 已核对。当前更新源使用 HTTP，校验只能检查文件与版本清单一致，不能证明发布者身份；清单和安装包都可能在传输中被篡改。仅在信任当前网络和发布者时继续。安装将退出小餐馆；便携版或目录版将转为安装版。',buttons:['取消','退出并安装'],defaultId:0,cancelId:0,noLink:true});return result.response===1
 },async file=>{const error=await shell.openPath(file);if(error)throw new Error('无法启动安装程序：'+error);app.quit()})
}
const scenePath=()=>path.join(app.getPath('userData'),'scene.json')
const nativeScript=name=>app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron',name):path.join(__dirname,name)
async function syncDesktopInput(preparing=false){
 desktopInput?.stop();desktopInput=null
 if((mode!=='embedded'&&!preparing)||!sceneSettings.interactive)return
 const input=desktopInput=startDesktopInput(nativeScript('desktop-input.ps1'),process.pid,event=>{
  if(mode!=='embedded'||!win||quitting)return
  const [width,height]=win.webContents.getOwnerBrowserWindow().getContentSize()
  const x=(event.x-desktopDisplay.X)*width/desktopDisplay.Width,y=(event.y-desktopDisplay.Y)*height/desktopDisplay.Height
  if(x>=0&&y>=0&&x<width&&y<height)win.webContents.send('desktop:input',{type:event.type,x,y,delta:event.delta||0})
 },error=>{console.warn('桌面点击交互已停止：',error.message);win?.webContents.send('desktop:warning','桌面点击交互已停止，请从托盘恢复窗口后重新挂载。');desktopInput?.stop();desktopInput=null})
 try{await input.ready}catch(e){if(desktopInput===input){input.stop();desktopInput=null}throw e}
}
const configPath=()=>path.join(app.getPath('userData'),'settings.json')
const tokenPath=()=>path.join(app.getPath('userData'),'credential.bin')
const mockPath=()=>path.join(app.getPath('userData'),'mock.json')
async function readJSON(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return fallback}}
async function writeJSON(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2),'utf8');await fs.rename(tmp,file)}
function publicSettings(){return {...preferences,windowMode:mode==='normal'?'normal':mode==='borderless'?'borderless':'desktop',hasToken:!!token}}
function handle(){const b=win.getNativeWindowHandle();return (b.length>=8?b.readBigUInt64LE():BigInt(b.readUInt32LE())).toString()}
async function nativeDesktop(action,options={}){
 if(action==='attach' && process.env.BISTRO_DISABLE_DESKTOP_HOST==='1')throw new Error('已禁用原生桌面宿主')
 if(process.platform!=='win32')throw new Error('此桌面模式仅支持 Windows')
 const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','desktop.ps1'):path.join(__dirname,'desktop.ps1'),'-Handle',handle(),'-Action',action]
 for(const [key,value] of Object.entries(options))args.push('-'+key,String(value))
 const result=await run('powershell.exe',args,{windowsHide:true,timeout:18000,maxBuffer:32768,encoding:'utf8'})
 return JSON.parse(result.stdout.trim())
}
function resizeWindow(){const widths={compact:1066,normal:1440,large:1600};const area=screen.getDisplayMatching(win.getBounds()).workArea;const w=Math.min(widths[preferences.windowSize],area.width,Math.floor(area.height*16/9));win.setSize(w,Math.round(w*9/16));win.setAspectRatio(16/9);win.center()}
async function announceMode(){preferences.windowMode=mode==='embedded'?'desktop':mode;await writeJSON(configPath(),preferences);win.webContents.send('window:mode',publicSettings().windowMode);settingsWin?.webContents.send('window:mode',publicSettings().windowMode)}
// 确认隐藏窗口已绘制目标布局，避免原生挂载显示上一帧窗口工具栏。
function prepareMode(next){
 const id=++modeRequest
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);ipcMain.removeListener('window:prepared',ready)}
  const ready=(event,request,error)=>{if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||request!==id)return;cleanup();error?reject(new Error(error)):resolve()}
  const timer=setTimeout(()=>{cleanup();reject(new Error('场景显示准备超时'))},8000)
  ipcMain.on('window:prepared',ready);win.webContents.send('window:prepare',{id,mode:next})
 })
}
async function restore(){
 win.hide()
 desktopInput?.stop();desktopInput=null
 if(mode==='embedded')await nativeDesktop('restore',{Style:nativeState?.style||0,ExStyle:nativeState?.exStyle||0})
 mode='normal';nativeState=null;clearInterval(hostTimer);win.setMinimumSize(960,540);win.setIgnoreMouseEvents(false);win.setSkipTaskbar(false);win.setAlwaysOnTop(preferences.alwaysOnTop)
 if(normalBounds)win.setBounds(normalBounds);else resizeWindow()
 await prepareMode('normal');win.show();win.focus();await announceMode();return {mode,message:'已恢复普通窗口'}
}
function monitorHost(){
 clearInterval(hostTimer);hostTimer=setInterval(async()=>{
  if(mode!=='embedded'||modeBusy||!win||quitting)return
  modeBusy=true
  try{const state=await nativeDesktop('inspect');if(state.mode!=='embedded'||!state.hostVisible||!state.visible){await nativeDesktop('attach',desktopDisplay);console.log('桌面宿主已重新连接')}}
  catch{try{await restore();tray?.displayBalloon({title:'小餐馆已恢复窗口',content:'桌面宿主发生变化，请从托盘重新设置为桌面背景。'})}catch{console.warn('桌面宿主恢复失败，请用托盘或 Ctrl+Shift+B 恢复')}}
  finally{modeBusy=false}
 },30000)
}
async function desktop(){
 if(mode==='embedded')return {mode,message:'已处于动态桌面背景模式'}
 normalBounds=win.getBounds();win.hide();if(win.isMaximized())win.unmaximize()
 const display=screen.getDisplayMatching(normalBounds),bounds=display.bounds,physical=screen.dipToScreenRect(null,bounds)
 desktopDisplay={X:physical.x,Y:physical.y,Width:physical.width,Height:physical.height}
 win.setAlwaysOnTop(false);win.setSkipTaskbar(true);win.setIgnoreMouseEvents(true,{forward:true});win.setMinimumSize(0,0);win.setBounds(bounds)
 try{
  await prepareMode('desktop')
  // 两个辅助进程并行准备；挂载前输入回调仍被模式检查拦截。
  const inputReady=syncDesktopInput(true);inputReady.catch(()=>{})
  nativeState=await nativeDesktop('attach',desktopDisplay);mode='embedded'
  // 原生宿主只改变 HWND 可见性，仍需通知 Electron 呈现页面；挂载后显示可避免普通窗口闪现或抢焦点。
  win.showInactive()
  await inputReady;await announceMode();monitorHost();return {mode,message:'已挂到桌面图标后方，空白处单击可交互；托盘或 Ctrl+Shift+B 恢复'}
 }
 catch(e){desktopInput?.stop();desktopInput=null;if(mode==='embedded'){await nativeDesktop('restore',{Style:nativeState?.style||0,ExStyle:nativeState?.exStyle||0});mode='normal';nativeState=null;}win.setMinimumSize(960,540);win.setIgnoreMouseEvents(false);win.setSkipTaskbar(false);win.setBounds(normalBounds);win.setAlwaysOnTop(preferences.alwaysOnTop);await prepareMode('normal').catch(()=>{});if(!starting)win.show();console.warn('桌面挂载失败：',e.message);throw new Error('未能挂载 Windows 桌面，已保留普通窗口；请确认 Explorer 正常运行后重试。未使用置底窗口冒充桌面背景。')}
}
async function changeMode(next){if(modeBusy)throw new Error('窗口模式正在切换，请稍候');modeBusy=true;try{if(next==='desktop')return await desktop();if(mode==='embedded')await restore();mode=next;win.setIgnoreMouseEvents(false);if(win.isMinimized())win.restore();win.show();win.focus();await announceMode();return {mode,message:next==='normal'?'已恢复普通窗口':'已切换无边框窗口'}}finally{modeBusy=false}}
function trusted(event){const owner=[win,settingsWin].find(w=>w&&!w.isDestroyed()&&event.sender===w.webContents);if(!owner||event.senderFrame!==owner.webContents.mainFrame)throw new Error('来源窗口不受信任')}
function register(name,fn){ipcMain.handle(name,async(event,...args)=>{trusted(event);return fn(...args)})}
register('scene:get',()=>({...sceneSettings}))
register('scene:save',raw=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('场景设置格式无效')
 const task=sceneQueue.then(async()=>{const next=sceneConfig.validate({...sceneSettings,...raw}),previous=sceneSettings;sceneSettings=next;try{if(previous.interactive!==next.interactive)await syncDesktopInput();await writeJSON(scenePath(),sceneConfig.serialize(next));for(const window of [win,settingsWin])if(window&&!window.isDestroyed())window.webContents.send('scene:changed',next);return {...next}}catch(e){sceneSettings=previous;await syncDesktopInput().catch(()=>{});throw e}})
 sceneQueue=task.catch(()=>{});return task
})
register('app:status',()=>({mode:publicSettings().windowMode,version:app.getVersion(),switching:modeBusy}))
register('app:open-settings',()=>openSettings())
register('app:hide-settings',()=>{settingsWin?.hide()})
register('app:quit',()=>{app.quit()})
register('updates:get',()=>updates().get())
register('updates:check',()=>updates().check())
register('updates:download',()=>updates().download())
register('updates:install',()=>installUpdate())
register('login:get',()=>login.get())
register('login:set',enabled=>login.set(enabled))
register('settings:get',()=>publicSettings())
register('settings:save',async(raw,newToken)=>{
 const next=validate(raw)
 if(next.source==='http')endpointURL(next.endpoint)
 if(newToken!==undefined){if(typeof newToken!=='string'||newToken.length>8192)throw new Error('令牌格式无效');if(newToken && !safeStorage.isEncryptionAvailable())throw new Error('系统加密不可用，不能安全保存令牌；可使用不需要令牌的数据源');if(newToken)await fs.writeFile(tokenPath(),safeStorage.encryptString(newToken));else await fs.rm(tokenPath(),{force:true});token=newToken}
 await changeMode(next.windowMode);preferences=next
 if(mode==='normal'||mode==='borderless')win.setAlwaysOnTop(next.alwaysOnTop)
 if(mode==='normal'||mode==='borderless')resizeWindow();await writeJSON(configPath(),preferences);return publicSettings()
})
register('bugs:fetch',async()=>{
 const url=endpointURL(preferences.endpoint),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000)
 try{
  const response=await fetch(url,{headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},signal:controller.signal,redirect:'error'})
  if(!response.ok)throw new Error(`数据源返回 HTTP ${response.status}`)
  if(Number(response.headers.get('content-length')||0)>4*1024*1024)throw new Error('响应超过 4 MB 上限')
  const reader=response.body.getReader();let length=0,chunks=[]
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024){await reader.cancel();throw new Error('响应超过 4 MB 上限')}chunks.push(value)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new Error('数据源响应不是有效 JSON')}
 }catch(e){if(e.name==='AbortError')throw new Error('同步超时，请检查数据源或网络');if(e.message==='fetch failed')throw new Error('暂时无法连接数据源，请检查地址和网络');throw e}finally{clearTimeout(timeout)}
})
register('mock:load',async()=>readJSON(mockPath(),null))
register('mock:save',async items=>{if(!Array.isArray(items)||items.length>10000||Buffer.byteLength(JSON.stringify(items))>4*1024*1024)throw new Error('模拟数据超出限制');await writeJSON(mockPath(),items)})
register('window:action',async action=>{
 if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(action==='close')win.close();else if(action==='restore')return changeMode('normal');else if(action==='desktop')return changeMode('desktop');else throw new Error('未知窗口操作')
 return {mode}
})
async function openRenderer(legacy=false){await changeMode('normal');await win.loadFile(path.join(__dirname,legacy?'../dist/index.html':'../dist/bistro/index.html'))}
async function openSettings(){
 if(!settingsWin||settingsWin.isDestroyed()){
  settingsWin=new BrowserWindow({width:1120,height:630,minWidth:960,minHeight:540,show:false,title:'Bug 小餐馆 · 设置',backgroundColor:'#f5f4eb',icon:path.join(__dirname,'../build/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}})
  settingsWin.setAspectRatio(16/9);settingsWin.setMenuBarVisibility(false)
  settingsWin.webContents.setWindowOpenHandler(()=>({action:'deny'}));settingsWin.webContents.on('will-navigate',event=>event.preventDefault())
  settingsWin.on('close',event=>{if(!quitting){event.preventDefault();settingsWin.hide()}})
  settingsWin.on('closed',()=>{settingsWin=null})
  await settingsWin.loadFile(path.join(__dirname,'../dist/bistro/settings.html'))
 }
 if(settingsWin.isMinimized())settingsWin.restore();settingsWin.show();settingsWin.focus();return {opened:true}
}
async function createWindow(){
 sceneSettings=sceneConfig.load(await readJSON(scenePath(),{}));await writeJSON(scenePath(),sceneConfig.serialize(sceneSettings));preferences=validate(await readJSON(configPath(),{}))
 try{if(safeStorage.isEncryptionAvailable())token=safeStorage.decryptString(await fs.readFile(tokenPath()))}catch{}
 win=new BrowserWindow({width:1440,height:810,minWidth:960,minHeight:540,frame:false,show:false,backgroundColor:'#f6f3ec',title:'Bug 小餐馆',icon:path.join(__dirname,'../build/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false}})
 resizeWindow();win.setMenuBarVisibility(false);win.setAlwaysOnTop(preferences.alwaysOnTop)
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault())
 win.webContents.session.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'"]}}))
 await win.loadFile(path.join(__dirname,'../dist/bistro/index.html'))
 const image=nativeImage.createFromPath(path.join(__dirname,'../build/icon.png')).resize({width:24,height:24})
 tray=new Tray(image);tray.setToolTip('Bug 小餐馆 · 桌面后台运行')
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:'打开界面',click:()=>openSettings().catch(e=>console.warn('设置界面打开失败：',e.message))},
  {label:'检查更新',click:()=>openSettings().then(()=>updates().check()).catch(e=>console.warn('检查更新失败：',e.message))},
  {type:'separator'},
  {label:'设为桌面背景',click:()=>changeMode('desktop').catch(e=>tray.displayBalloon({title:'桌面背景设置失败',content:e.message}))},
  {label:'恢复普通窗口（故障排查）',click:()=>changeMode('normal').catch(()=>win.show())},
  {label:'数据看板（旧版 HTTP 兼容）',click:()=>openRenderer(true).catch(e=>console.warn('看板打开失败：',e.message))},
  {label:'返回 3D 桌面场景',click:()=>openRenderer().then(()=>changeMode('desktop')).catch(e=>console.warn('返回桌面失败：',e.message))},
  {type:'separator'},
  {label:'退出小餐馆',click:()=>app.quit()}
 ]));tray.on('double-click',()=>openSettings().catch(e=>console.warn('设置界面打开失败：',e.message)))
 globalShortcut.register('CommandOrControl+Shift+B',()=>changeMode('normal').catch(()=>win.show()))
 screen.on('display-metrics-changed',()=>{if(mode==='embedded')changeMode('normal').then(()=>changeMode('desktop')).catch(()=>console.warn('显示器变化后请重新设置桌面背景'))})
 if(process.env.BISTRO_START_NORMAL==='1')win.show();else{
  let failure;for(let attempt=0;attempt<3;attempt++){try{await changeMode('desktop');failure=null;break}catch(e){failure=e;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500))}}
  if(failure){win.show();tray.displayBalloon({title:'桌面挂载暂不可用',content:'已保留普通窗口，可从托盘重试。'+failure.message})}
 }
 starting=false
 win.on('closed',()=>{win=null;if(!quitting)app.quit()})
}
if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',()=>{if(win)openSettings().catch(e=>console.warn('设置界面打开失败：',e.message))});app.whenReady().then(createWindow).catch(e=>{console.error('应用启动失败：',e.message);app.quit()})}
app.on('before-quit',()=>{quitting=true;updater?.stop();desktopInput?.stop();desktopInput=null;clearInterval(hostTimer);globalShortcut.unregisterAll();tray?.destroy()})
app.on('window-all-closed',()=>app.quit())
