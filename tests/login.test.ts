import {describe,it,expect,vi} from 'vitest'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {createLogin}=require('../electron/login.cjs')
function fixture(options:Record<string,unknown>={}){
 let enabled=false
 const app={isPackaged:true,getPath:vi.fn(()=> 'C:\\Apps\\Bistro\\Bug小餐馆.exe'),getLoginItemSettings:vi.fn(()=>({openAtLogin:enabled,executableWillLaunchAtLogin:enabled})),setLoginItemSettings:vi.fn((value:{openAtLogin:boolean})=>{enabled=value.openAtLogin}),...options}
 return app
}
describe('开机自启动',()=>{
 it('开发环境禁用，不读取或修改系统启动项',()=>{const app=fixture({isPackaged:false}),login=createLogin(app,{},'win32');expect(login.get()).toMatchObject({supported:false,enabled:false});expect(()=>login.set(true)).toThrow('Windows 正式程序');expect(app.getLoginItemSettings).not.toHaveBeenCalled();expect(app.setLoginItemSettings).not.toHaveBeenCalled()})
 it('非Windows平台不启用',()=>{expect(createLogin(fixture(),{},'linux').get().supported).toBe(false)})
 it('便携包使用原始EXE，不注册临时解压目录',()=>{const app=fixture(),exe='D:\\软件\\小餐馆.exe',login=createLogin(app,{PORTABLE_EXECUTABLE_FILE:exe},'win32');expect(login.set(true).enabled).toBe(true);expect(app.setLoginItemSettings).toHaveBeenCalledWith({openAtLogin:true,enabled:true,path:exe,args:[]});expect(app.getLoginItemSettings).toHaveBeenLastCalledWith({path:exe,args:[]});expect(login.set(false).enabled).toBe(false)})
 it('目录版以当前exe注册',()=>{const app=fixture(),login=createLogin(app,{},'win32');login.set(true);expect(app.setLoginItemSettings).toHaveBeenCalledWith(expect.objectContaining({path:app.getPath()}))})
 it('拒绝非布尔和相对路径',()=>{const app=fixture();expect(()=>createLogin(app,{},'win32').set('true')).toThrow('格式无效');expect(()=>createLogin(app,{PORTABLE_EXECUTABLE_FILE:'relative.exe'},'win32').set(true)).toThrow('路径无效');expect(app.setLoginItemSettings).not.toHaveBeenCalled()})
 it('系统禁用时回报真实状态，不虚报成功',()=>{const app=fixture({getLoginItemSettings:()=>({openAtLogin:true,executableWillLaunchAtLogin:false})}),login=createLogin(app,{},'win32');expect(login.get().enabled).toBe(false);expect(()=>login.set(true)).toThrow('系统未接受')})
})
