import { describe,it,expect } from 'vitest'
import { createRequire } from 'node:module'
import {normalizeItems,groupBugs,isToday,changesSince,seedBugs,newBug,advanceBug,validateSettings,defaults,stages} from '../src/model'
const require=createRequire(import.meta.url)
const {endpointURL,validate}=require('../electron/preferences.cjs')
const at=new Date('2026-10-22T09:00:00+08:00')
const row=(status='todo')=>({id:'T-1',title:'测试订单',status,updatedAt:at.toISOString(),closedAt:at.toISOString()})
describe('数据契约',()=>{
 it.each([['新建','todo'],['待处理','todo'],['处理中','doing'],['IN_PROGRESS','doing'],['已修复','ready'],['暂不解决','ready'],['已关闭','closed']])('归一化 %s', (input,result)=>expect(normalizeItems([row(input)])[0]!.status).toBe(result))
 it('支持 items 容器和可选字段默认值',()=>{const result=normalizeItems({items:[row()]})[0]!;expect(result.assignee).toBe('未分配');expect(result.createdAt).toBe(result.updatedAt);expect(result.priority).toBe('normal')})
 it('重复 ID 保留更新时间较新项',()=>{expect(normalizeItems([{...row(),title:'新版'}, {...row('doing'),updatedAt:'2026-10-21T00:00:00Z'}])).toMatchObject([{status:'todo',title:'新版'}])})
 it('去重前修剪 ID',()=>expect(normalizeItems([row(),{...row('ready'),id:' T-1 '}])).toHaveLength(1))
 it.each([null,{},'[]',{items:{}},Array(10001).fill(row())])('拒绝非法容器',input=>expect(()=>normalizeItems(input)).toThrow())
 it.each([null,{}, {...row(),id:''},{...row(),title:' '},{...row(),status:'unknown'},{...row(),status:'constructor'},{...row(),status:'__proto__'},{...row(),updatedAt:'bad-date'},{...row('closed'),closedAt:undefined}])('拒绝非法条目',input=>expect(()=>normalizeItems([input])).toThrow())
 it('文本原样保存而非执行 HTML',()=>expect(normalizeItems([{...row(),title:'<img src=x onerror=alert(1)>'}])[0]!.title).toContain('<img'))
})
describe('日期和流程',()=>{
 it('初始四桶计数准确且互斥',()=>{const items=seedBugs(at),groups=groupBugs(items,at);expect(stages.map(s=>groups[s].length)).toEqual([5,4,3,6]);expect(new Set(Object.values(groups).flat().map(b=>b.id)).size).toBe(18)})
 it('今日关闭按本地零点，旧关闭不计入',()=>{const now=new Date(2026,9,22,12);const midnight=new Date(2026,9,22,0);const previous=new Date(midnight.getTime()-1);expect(isToday(midnight.toISOString(),now)).toBe(true);expect(isToday(previous.toISOString(),now)).toBe(false);expect(isToday(undefined,now)).toBe(false);expect(isToday('bad',now)).toBe(false);expect(groupBugs([{...newBug(1,now),status:'closed',closedAt:previous.toISOString()}],now).closed).toHaveLength(0)})
 it('完整流转 todo → doing → ready → closed，不修改旧对象',()=>{const original=newBug(20,at);let item=original;for(const stage of stages.slice(1)){item=advanceBug(item,at);expect(item.status).toBe(stage)}expect(original.status).toBe('todo');expect(item.closedAt).toBe(at.toISOString());expect(advanceBug(item,at).status).toBe('closed')})
 it('快照仅生成新增与状态变化事件',()=>{const original=newBug(1,at);expect(changesSince([original],[{...original,title:'改标题'}])).toEqual([]);expect(changesSince([original],[advanceBug(original,at),newBug(2,at)])).toMatchObject([{id:'BUG-001',from:'todo',to:'doing'},{id:'BUG-002',to:'todo'}])})
})
describe('配置与网络安全',()=>{
 it('主进程和渲染进程默认一致',()=>expect(validate({})).toEqual(defaults))
 it.each([validate,validateSettings])('配置边界及类型兜底',validator=>{const output=validator({threshold:0,refreshSeconds:99999,animations:'yes',windowMode:'unknown',alwaysOnTop:'yes'});expect(output).toMatchObject({threshold:1,refreshSeconds:3600,animations:true,windowMode:'normal',alwaysOnTop:false})})
 it.each(['https://example.com/api','http://127.0.0.1:8080/bugs','http://localhost/bugs','http://[::1]:8080/bugs'])('允许 %s',input=>expect(endpointURL(input).href).toBe(new URL(input).href))
 it.each(['file:///C:/test','http://example.com/api','javascript:alert(1)','https://user:secret@example.com/','not-url'])('拒绝不安全地址 %s',input=>expect(()=>endpointURL(input)).toThrow())
})
