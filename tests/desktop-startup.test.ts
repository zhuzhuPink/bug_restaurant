import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {EventEmitter} from 'node:events'
import vm from 'node:vm'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8')

function fixture(options:{normal?:boolean,showError?:boolean,inputError?:boolean,prepareError?:boolean}={}){
 const events:string[]=[],handlers=new Map<string,Function>()
 const ipc=Object.assign(new EventEmitter(),{handle:(name:string,fn:Function)=>handlers.set(name,fn)})
 let bounds={x:0,y:0,width:1440,height:810}
 class Window extends EventEmitter{
  webContents=Object.assign(new EventEmitter(),{session:{webRequest:{onHeadersReceived(){}}},setWindowOpenHandler(){},send(channel:string,value:any){if(channel==='window:prepare'){events.push('prepare:'+value.mode);queueMicrotask(()=>{events.push('paint:'+value.mode);ipc.emit('window:prepared',{sender:this,senderFrame:this.mainFrame},value.id,options.prepareError?'画面准备失败':null)})}} ,mainFrame:{}})
  setSize(width:number,height:number){bounds={...bounds,width,height}}
  getBounds(){return {...bounds}}
  setBounds(value:typeof bounds){events.push('bounds');bounds={...value}}
  getNativeWindowHandle(){return Buffer.from([1,0,0,0,0,0,0,0])}
  isMaximized(){return false}
  isMinimized(){return false}
  setAlwaysOnTop(){} setSkipTaskbar(){} setIgnoreMouseEvents(){} setMinimumSize(){}
  setAspectRatio(){} center(){} setMenuBarVisibility(){}
  async loadFile(){events.push('load')}
  showInactive(){events.push('showInactive');if(options.showError)throw Error('显示失败')}
  hide(){events.push('hide')}
  show(){events.push('show')}
  focus(){events.push('focus')}
 }
 const app=Object.assign(new EventEmitter(),{isPackaged:false,commandLine:{appendSwitch:(key:string,value:string)=>events.push('switch:'+key+'='+value)},getPath:()=>'/test',setPath(){},requestSingleInstanceLock:()=>false,quit(){}})
 const deps:Record<string,unknown>={
  electron:{app,BrowserWindow:Window,ipcMain:ipc,Menu:{buildFromTemplate:(items:unknown)=>items},Tray:class{setToolTip(){}setContextMenu(){}on(){}displayBalloon(){events.push('balloon')}},nativeImage:{createFromPath:()=>({resize(){return this}})},safeStorage:{isEncryptionAvailable:()=>false},screen:{getDisplayMatching:()=>({bounds:{x:0,y:0,width:1440,height:900},workArea:{width:1440,height:900}}),dipToScreenRect:(_:unknown,value:unknown)=>value,on(){}},globalShortcut:{register(){}}},
  'node:fs/promises':{readFile:async()=>{throw Error('不存在')},mkdir:async()=>{},writeFile:async()=>{},rename:async()=>{}},
  'node:child_process':{execFile:(_exe:string,args:string[],_options:unknown,callback:Function)=>{const action=args[args.indexOf('-Action')+1];events.push(action);callback(null,{stdout:JSON.stringify({style:1,exStyle:2,mode:action==='restore'?'normal':'embedded',visible:true,hostVisible:true})})}},
  './preferences.cjs':{validate:()=>({windowSize:'normal',windowMode:'normal',alwaysOnTop:false}),endpointURL(){}},
  './scene-settings.cjs':require('../electron/scene-settings.cjs'),
  './desktop-input.cjs':{startDesktopInput:()=>{events.push('input');return {ready:options.inputError?Promise.reject(Error('输入失败')):Promise.resolve(),stop(){events.push('stopInput')}}}},
  './login.cjs':{createLogin:()=>({})},
  './updates.cjs':require('../electron/updates.cjs')
 }
 // execFile 的 promisify 返回结构必须和 Node 的自定义包装一致。
 const execFile=(deps['node:child_process'] as {execFile:Function}).execFile
 Object.defineProperty(execFile,require('node:util').promisify.custom,{value:async(...args:unknown[])=>new Promise((resolve,reject)=>execFile(...args,(error:unknown,value:unknown)=>error?reject(error):resolve(value)))})
 const context=vm.createContext({require:(name:string)=>deps[name]??require(name),__dirname:'/test/electron',Buffer,process:{platform:'win32',pid:1,env:options.normal?{BISTRO_START_NORMAL:'1'}:{}},console:{log(){},warn(){},error(){}},setInterval:()=>1,clearInterval(){},clearTimeout,setTimeout:(fn:Function,ms:number)=>{if(ms===1500){queueMicrotask(()=>fn());return 1}return setTimeout(()=>fn(),ms)}})
 vm.runInContext(source+'\nglobalThis.fixture={createWindow,changeMode,getMode:()=>mode}',context)
 return {events,start:()=>context.fixture.createWindow(),mode:(next:string)=>context.fixture.changeMode(next),getMode:()=>context.fixture.getMode()}
}

describe('桌面背景启动显示',()=>{
 it('启动前固定简体中文，与单语言安装包一致',async()=>{
  const app=fixture();await app.start();expect(app.events[0]).toBe('switch:lang=zh-CN')
 })
 it('原生挂载后通知 Electron 显示，不抢焦点或弹出普通窗口',async()=>{
  const app=fixture();await app.start()
  expect(app.events).toContain('showInactive')
  expect(app.events.indexOf('attach')).toBeLessThan(app.events.indexOf('showInactive'))
  expect(app.events.indexOf('input')).toBeLessThan(app.events.indexOf('attach'))
  expect(app.events).not.toContain('show');expect(app.events).not.toContain('focus')
  expect(app.getMode()).toBe('embedded')
 })
 it('普通窗口与背景往返时，每次挂载均走 Electron 显示流程',async()=>{
  const app=fixture({normal:true});await app.start();expect(app.events).toContain('show')
  await app.mode('desktop');await app.mode('normal');await app.mode('desktop')
  expect(app.events.filter(event=>event==='showInactive')).toHaveLength(2)
  expect(app.events.filter(event=>event==='restore')).toHaveLength(1)
  expect(app.getMode()).toBe('embedded')
 })
 it('显示失败时还原原生挂载，重试失败后保留普通窗口',async()=>{
  const app=fixture({showError:true});await app.start()
  expect(app.events.filter(event=>event==='restore')).toHaveLength(3)
  expect(app.events).toContain('show');expect(app.events).toContain('balloon')
  expect(app.getMode()).toBe('normal')
 })
 it('输入助手启动失败仍可回退，不遗留桌面子窗口',async()=>{
  const app=fixture({inputError:true});await app.start()
  expect(app.events.filter(event=>event==='restore')).toHaveLength(3)
  expect(app.events).toContain('show');expect(app.getMode()).toBe('normal')
 })
})

 describe('背景切换首帧',()=>{
 it('先隐藏再调整画幅，纯场景绘制完成后才允许原生挂载',async()=>{
  const app=fixture({normal:true});await app.start();app.events.length=0;await app.mode('desktop');
  expect(app.events.indexOf('hide')).toBeGreaterThanOrEqual(0);
  expect(app.events.indexOf('hide')).toBeLessThan(app.events.indexOf('bounds'));
  expect(app.events.indexOf('paint:desktop')).toBeGreaterThanOrEqual(0);
  expect(app.events.indexOf('paint:desktop')).toBeLessThan(app.events.indexOf('attach'));
 })
 it('恢复普通窗口也先准备界面，不显示残留背景布局',async()=>{
  const app=fixture();await app.start();app.events.length=0;await app.mode('normal');
  expect(app.events.indexOf('paint:normal')).toBeGreaterThanOrEqual(0);
  expect(app.events.indexOf('paint:normal')).toBeLessThan(app.events.indexOf('show'));
 })
 it('纯场景准备失败时不挂载，保留普通窗口',async()=>{
  const app=fixture({prepareError:true});await app.start();
  expect(app.events).not.toContain('attach');expect(app.events).toContain('show');expect(app.getMode()).toBe('normal');
 })
 })
