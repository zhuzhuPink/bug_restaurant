import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {EventEmitter} from 'node:events'
import vm from 'node:vm'
const source=readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8')
function fixture(){
 const frames:Function[]=[],sent:unknown[][]=[]
 const ipc=Object.assign(new EventEmitter(),{invoke(){},send:(...args:unknown[])=>sent.push(args)})
 let bridge:any
 vm.runInNewContext(source,{require:()=>({contextBridge:{exposeInMainWorld:(_key:string,value:unknown)=>{bridge=value}},ipcRenderer:ipc}),process:{platform:'win32'},requestAnimationFrame:(fn:Function)=>frames.push(fn)})
 return {ipc,sent,bridge,frame:()=>frames.shift()?.()}
}
describe('背景显示准备桥接',()=>{
 it('场景尚未就绪时缓存请求，布局处理后等待两帧再确认',()=>{
  const app=fixture(),modes:string[]=[]
  app.ipc.emit('window:prepare',{}, {id:4,mode:'desktop'})
  expect(app.sent).toEqual([])
  app.bridge.onWindowModeChanged((mode:string)=>modes.push(mode))
  expect(modes).toEqual(['desktop']);expect(app.sent).toEqual([])
  app.frame();expect(app.sent).toEqual([]);app.frame()
  expect(app.sent).toEqual([['window:prepared',4]])
 })
 it('场景准备异常明确报告失败，不假报画面完成',()=>{
  const app=fixture();app.bridge.onWindowModeChanged(()=>{throw Error('测试失败')})
  app.ipc.emit('window:prepare',{}, {id:5,mode:'desktop'})
  expect(app.sent).toEqual([['window:prepared',5,'场景布局准备失败']])
 })
 it('普通模式通知正常转发，取消订阅后不再调用',()=>{
  const app=fixture(),modes:string[]=[]
  const stop=app.bridge.onWindowModeChanged((mode:string)=>modes.push(mode))
  app.ipc.emit('window:mode',{},'normal');stop();app.ipc.emit('window:mode',{},'desktop')
  expect(modes).toEqual(['normal'])
 })
})
