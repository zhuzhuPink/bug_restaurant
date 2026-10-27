import {describe,it,expect} from 'vitest'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {defaults,validate,load,serialize}=require('../electron/scene-settings.cjs')
describe('3D餐馆设置',()=>{
 it('默认斜摆、交互开启、两路共用2辆额度',()=>{expect(validate()).toEqual(defaults);expect(defaults.view).toBe('angled');expect(defaults.interactive).toBe(true)})
 it('只保存已知字段并校验类型',()=>{expect(validate({waiting:'6',vehicles:1.5,view:'top',interactive:'false',script:'x'})).toEqual(defaults)})
 it('候位0～6、车辆0～10，不能扩展车辆额度',()=>{expect(validate({waiting:-1,vehicles:999})).toMatchObject({waiting:0,vehicles:10})})
 it('保留关闭和零值',()=>{expect(validate({waiting:0,vehicles:0,animated:false,exterior:false,stats:false,interactive:false,auto:false,view:'angled'})).toEqual({waiting:0,vehicles:0,animated:false,exterior:false,stats:false,interactive:false,auto:false,view:'angled'})})
})

describe('斜摆默认视角迁移',()=>{
 it('首次启动及旧配置只迁移视角，保留其他设置',()=>{expect(load().view).toBe('angled');expect(load({view:'front',vehicles:7,animated:false})).toMatchObject({view:'angled',vehicles:7,animated:false})})
 it('迁移后手动选回摆正，重启仍保留选择',()=>{expect(load(serialize({...defaults,view:'front'})).view).toBe('front')})
 it('持久化标记不泄漏到场景设置',()=>{expect(load(serialize(defaults))).toEqual(defaults);expect(validate({viewPreset:1})).toEqual(defaults)})
})
