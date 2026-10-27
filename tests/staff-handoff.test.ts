import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
function model(avoidance=true){
 const context=vm.createContext({})
 for(const file of ['layout','street','walking','model'])vm.runInContext(readFileSync(new URL('../prototypes/overlook/'+file+'.js',import.meta.url),'utf8'),context)
 const m=new context.BistroModel({seed:false,avoidance});m.auto=false;return m
}
describe('员工交接节奏',()=>{
 it.each([false,true])('取放各不超过0.3秒，仍完成交接（避让=%s）',avoidance=>{
  const m=model(avoidance);m.addOrder();const previous:any={},spans:any[]=[]
  for(let i=0;i<2400;i++){
   m.tick(.025)
   for(const id of ['runner','waiter'])if(previous[id]?.phase!==m[id].phase){
    if(previous[id])spans.push({id,phase:previous[id].phase,seconds:m.time-previous[id].start})
    previous[id]={phase:m[id].phase,start:m.time}
   }
  }
  const handoffs=spans.filter(s=>['pickup','putdown'].includes(s.phase));expect(handoffs).toHaveLength(4)
  for(const s of handoffs){expect(s.seconds).toBeGreaterThan(0);expect(s.seconds).toBeLessThanOrEqual(.3+1e-8)}
  expect(m.orders[0].delivery).toBe('done');expect(m.orders[0].servedAt).toBeGreaterThan(m.orders[0].closedAt)
 })
 it('真实行走到达后立即交接或返程，不等待名义路程计时',()=>{
  const m=model();for(let i=0;i<6;i++)m.addOrder()
  let stalled=0
  for(let i=0;i<4800;i++){
   m.tick(.025)
   for(const id of ['runner','waiter'])if(['travel','return'].includes(m[id].phase)&&m.walking.pose(id).arrived)stalled++
  }
  expect(stalled).toBe(0);expect(m.orders.filter((o:any)=>o.delivery==='done')).toHaveLength(6)
 })
})

it('取放动作有连续抬手和俯身，下一阶段复位',async()=>{
 await import('../prototypes/overlook/layout.js')
 const {Restaurant}=await import('../prototypes/overlook/scene.js')
 const part=()=>({position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},visible:false})
 const parts={body:part(),head:part(),arms:[part(),part()],legs:[part(),part()],tray:part(),tool:part()}
 const root={userData:{parts}},pose=Restaurant.prototype.pose
 pose.call({},root,0,'pickup',0);const start=parts.arms[0].rotation.x
 pose.call({},root,0,'pickup',.5);expect(parts.body.rotation.x).toBeGreaterThan(0)
 pose.call({},root,0,'pickup',1);expect(parts.arms[0].rotation.x).not.toBe(start)
 pose.call({},root,0,'putdown',.5);expect(parts.body.rotation.x).toBeGreaterThan(0)
 pose.call({},root,0,'idle');expect(parts.body.rotation.x).toBe(0);expect(parts.tray.position.z).toBe(.64)
})

it('离场边界允许并排通过，不争抢同一个不可见终点',()=>{
 const m=model()
 for(const z of [7.5,8.25]){
  m._spawn();const guest=m.guests.at(-1),actor=m.walking.actors.get(guest.id)
  actor.x=-27.8;actor.z=z
  m._move(guest,'leaving',[[-27.8,z],[-28,7.8]])
 }
 m.tick(.025);expect(m.guests).toHaveLength(0)
})
