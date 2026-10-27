import {describe,it,expect} from 'vitest'
import fs from 'node:fs'
import {frameAt,along,guestState,waiterState,seats,servicePath} from '../src/scene/timeline'
describe('逐帧播放器',()=>{
 const clip={count:3,durations:[80,120,200],loop:true}
 it('尊重每帧时长并循环',()=>{expect([0,79,80,199,200,399,400].map(t=>frameAt(clip,t))).toEqual([0,0,1,1,2,2,0])})
 it('单次动作停留末帧且负时间安全',()=>{expect(frameAt({...clip,loop:false},900)).toBe(2);expect(frameAt(clip,-10)).toBe(0)})
})
describe('连续营业调度',()=>{
 it('三桌错相：可同时看见等餐、吃饭与客人进出',()=>{const states=new Set<string>();for(let t=0;t<144;t+=.1)for(let i=0;i<3;i++)states.add(guestState(t,i).state);expect([...states].sort()).toEqual(['absent','eat','enter','happy','leave','order','sit_down','stand_up','wait'])})
 it('送达后才开始吃饭，每次送餐对应正确桌位',()=>{for(let i=0;i<3;i++){expect(waiterState(i*24+9.8).index).toBe(i);expect(guestState(i*24+9.8,i).state).toBe('wait');expect(guestState(i*24+10.5,i).state).toBe('eat')}})
 it('服务员绕开柜台，角色数量固定不随订单增殖',()=>{expect(seats.length).toBe(3);for(let t=0;t<144;t+=.05){const {x,y}=waiterState(t).position;expect(x>866&&x<1975&&y<826).toBe(false)}})
 it('每条服务路径往返连续且不跳跃',()=>{for(let i=0;i<3;i++){const path=servicePath(i);expect(along(path,0)).toMatchObject(path[0]!);expect(along(path,1)).toMatchObject(path.at(-1)!)}for(let t=.05;t<144;t+=.05){const a=waiterState(t-.05).position,b=waiterState(t).position;expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(30)}})
 it('运行清单引用全部存在，帧数和时长完整',()=>{const root=new URL('../public/scene-v3/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root),'utf8'));expect(Object.keys(manifest.clips)).toHaveLength(76);for(const clip of Object.values(manifest.clips) as any[]){expect(fs.existsSync(new URL(clip.file,root))).toBe(true);expect(clip.durations).toHaveLength(clip.count)}expect(fs.existsSync(new URL(manifest.background,root))).toBe(true)})
})
