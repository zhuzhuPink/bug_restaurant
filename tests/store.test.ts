import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {useBistro} from '../src/store'
import {defaults} from '../src/model'
let b:ReturnType<typeof useBistro>
let saved:any=null
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-22T09:00:00+08:00'));saved=null;vi.stubGlobal('window',{bistro:{settings:vi.fn(async()=>({...defaults})),saveSettings:vi.fn(async(s:any)=>s),loadMock:vi.fn(async()=>saved),saveMock:vi.fn(async(s:any)=>{saved=s}),fetchBugs:vi.fn(async()=>[])}});b=useBistro()})
afterEach(()=>{b.destroy();vi.useRealTimers();vi.unstubAllGlobals()})
describe('模拟餐馆状态',()=>{
 it('初始化后可以接单与完整推进',async()=>{await b.init();b.add();expect(b.stats.value.todo).toBe(6);const id=b.items.value.at(-1)!.id;b.advance(id);expect(b.stats.value.doing).toBe(5);b.advance(id);expect(b.stats.value.ready).toBe(4);b.advance(id);expect(b.stats.value.closed).toBe(7);await Promise.resolve();expect(window.bistro!.saveMock).toHaveBeenCalled()})
 it('自动演示既接单也推进，而非永远新增',async()=>{await b.init();await vi.advanceTimersByTimeAsync(32000);expect(b.items.value).toHaveLength(19);expect(b.stats.value.closed).toBeGreaterThan(6);expect(b.stats.value.doing).toBe(4)})
 it('关闭动画不影响自动数据流转',async()=>{await b.init();b.settings.value.animations=false;await vi.advanceTimersByTimeAsync(16000);expect(b.items.value).toHaveLength(19);expect(b.stats.value.ready).toBe(4)})
 it('暂停自动演示不新增或推进',async()=>{await b.init();b.settings.value.autoDemo=false;await vi.advanceTimersByTimeAsync(32000);expect(b.stats.value).toEqual({todo:5,doing:4,ready:3,closed:6})})
 it('设置弹窗打开时暂停演示',async()=>{await b.init();b.settingsOpen.value=true;await vi.advanceTimersByTimeAsync(16000);expect(b.items.value).toHaveLength(18)})
 it('积压触发忙乱，重置后恢复',async()=>{await b.init();expect(b.chefMood.value).toBe('busy');b.add(14);expect(b.chefMood.value).toBe('panic');b.reset();expect(b.chefMood.value).toBe('busy');expect(b.items.value).toHaveLength(18)})
 it('同步失败保留数据，重试后清除提示',async()=>{await b.init();b.simulateFailure();expect(b.error.value).toContain('上次成功');expect(b.items.value).toHaveLength(18);const request=b.sync();await vi.advanceTimersByTimeAsync(200);await request;expect(b.error.value).toBe('')})
 it('保存进度后新增不会重复 ID',async()=>{saved=[{id:'BUG-100',title:'旧订单',status:'todo',updatedAt:new Date().toISOString()}];await b.init();b.add();expect(b.items.value.at(-1)!.id).toBe('BUG-101')})
 it('HTTP 校验失败不覆盖有效快照',async()=>{await b.init();b.settings.value.source='http';vi.mocked(window.bistro!.fetchBugs).mockResolvedValue([{bad:true}]);await b.sync();expect(b.error.value).toBeTruthy();expect(b.items.value).toHaveLength(18)})
 it('切换源时丢弃旧 HTTP 响应',async()=>{await b.init();let finish!:(v:any)=>void;vi.mocked(window.bistro!.fetchBugs).mockImplementation(()=>new Promise(r=>finish=r));b.settings.value.source='http';const fetching=b.sync();const save=b.saveSettings({...defaults,autoDemo:false});await Promise.resolve();finish([{id:'HTTP-1',title:'过时结果',status:'todo',updatedAt:new Date().toISOString()}]);await fetching;await vi.advanceTimersByTimeAsync(250);await save;expect(b.items.value.some(x=>x.id==='HTTP-1')).toBe(false);expect(b.settings.value.source).toBe('mock')})
})
