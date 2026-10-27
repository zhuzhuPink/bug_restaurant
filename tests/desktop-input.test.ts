import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {EventEmitter} from 'node:events'
import vm from 'node:vm'
const source=readFileSync(new URL('../electron/desktop-input.cjs',import.meta.url),'utf8')
function fixture(){
 let killed=0,closed=0
 const lines=Object.assign(new EventEmitter(),{close(){closed++}})
 const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),kill(){killed++}})
 const context=vm.createContext({module:{exports:{}},require:(id:string)=>id==='node:child_process'?{spawn:()=>child}:{createInterface:()=>lines},setTimeout:()=>1,clearTimeout(){}})
 vm.runInContext(source,context)
 const errors:unknown[]=[],input=context.module.exports.startDesktopInput('test.ps1',1,()=>{},(e:unknown)=>errors.push(e))
 return {input,lines,child,errors,killed:()=>killed,closed:()=>closed}
}
describe('桌面输入预启动生命周期',()=>{
 it('挂载取消时结束未就绪 Promise，不悬挂模式切换',async()=>{
  const f=fixture();const result=f.input.ready.catch((e:Error)=>e.message)
  f.input.stop();f.input.stop()
  expect(await result).toBe('桌面交互启动已取消');expect(f.killed()).toBe(1);expect(f.closed()).toBe(1)
 })
 it('就绪后正常停止，不误报故障',async()=>{
  const f=fixture();f.lines.emit('line',JSON.stringify({type:'ready'}));await f.input.ready
  f.input.stop();f.child.emit('exit');expect(f.errors).toEqual([])
 })
})
