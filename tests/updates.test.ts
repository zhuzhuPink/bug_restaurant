import {describe,it,expect,vi} from 'vitest'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
const require=createRequire(import.meta.url)
const {createUpdater,validateManifest,installerName,UPDATE_ROOT}=require('../electron/updates.cjs')
const payload=Buffer.from('MZ 测试安装包，不执行')
const sha256=createHash('sha256').update(payload).digest('hex')
const current={version:'1.2.5',versionCode:1002005}
const manifest={versionCode:1002006,versionName:'1.2.6',sha256,notes:'修复问题\n新增功能'}
async function fixture(overrides:Record<string,unknown>={}){
 const root=path.resolve('.electron-test');await fs.mkdir(root,{recursive:true});const cacheDir=await fs.mkdtemp(path.join(root,'updates-unit-'))
 const states:any[]=[],request=vi.fn(async(url:string)=>url.endsWith('latest.json')?Response.json(manifest):new Response(payload,{headers:{'Content-Length':String(payload.length)}}))
 const updater=createUpdater({current,cacheDir,fetch:request,onChange:(s:any)=>states.push(s),...overrides})
 return {updater,request,cacheDir,states}
}
describe('S3 更新版本文件',()=>{
 it('沿用用户示例的四个字段，安装包路径固定且不依赖清单中的 URL',()=>{
  expect(validateManifest({...manifest,url:'file:///bad.exe'})).toEqual(manifest)
  expect(UPDATE_ROOT).toBe('http://124.220.98.33:9000/private/bug_restaurant/')
  expect(installerName('1.2.6')).toBe('BugBistro-1.2.6-Setup-x64.exe')
 })
 it.each([null,[],{...manifest,versionCode:0},{...manifest,versionCode:'18'},{...manifest,versionCode:Infinity},{...manifest,sha256:'abc'},{...manifest,versionName:'../../evil'},{...manifest,versionName:'01.2.6'},{...manifest,notes:1},{...manifest,notes:'x'.repeat(12001)}])('拒绝非法清单 %#',value=>expect(()=>validateManifest(value)).toThrow())
 it('初始化及读取状态不联网，只有主动检查才发请求',async()=>{
  const f=await fixture();expect(f.updater.get()).toMatchObject({phase:'idle',currentVersion:'1.2.5'});expect(f.request).not.toHaveBeenCalled()
  const result=await f.updater.check();expect(result).toMatchObject({phase:'available',latestVersion:'1.2.6',canDownload:true,canInstall:false,notes:manifest.notes,insecure:true})
  expect(f.request).toHaveBeenCalledWith(UPDATE_ROOT+'latest.json',expect.objectContaining({redirect:'error',cache:'no-store'}))
 })
 it.each([{...manifest,versionCode:1002005,versionName:'1.2.5'},{...manifest,versionCode:1002004,versionName:'1.2.4'}])('不会下载相同或更旧版本',async value=>{
  const f=await fixture({fetch:vi.fn(async()=>Response.json(value))});expect(await f.updater.check()).toMatchObject({phase:'current',canDownload:false});expect(await f.updater.download()).toMatchObject({phase:'current'})
 })
 it.each([{...manifest,versionCode:1002005},{...manifest,versionName:'1.2.4'}])('拒绝 versionCode 与版本名称矛盾',async value=>{
  const f=await fixture({fetch:async()=>Response.json(value)});expect(await f.updater.check()).toMatchObject({phase:'error',canDownload:false,message:expect.stringContaining('不一致')})
 })
 it.each([403,401,404,503])('明确提示 HTTP %s，不假报最新版本',async status=>{
  const f=await fixture({fetch:async()=>new Response('',{status})});expect(await f.updater.check()).toMatchObject({phase:'error',message:expect.stringContaining('HTTP '+status),canDownload:false})
 })
 it('网络错误和 JSON 解析错误可重试',async()=>{
  const f=await fixture();f.request.mockRejectedValueOnce(new TypeError('fetch failed'));expect((await f.updater.check()).message).toContain('无法连接')
  f.request.mockResolvedValueOnce(new Response('<xml/>'));expect((await f.updater.check()).message).toContain('JSON')
  expect((await f.updater.check()).phase).toBe('available')
 })
 it('限制版本清单大小，包括无 Content-Length 的流',async()=>{
  const f=await fixture({fetch:async()=>new Response('x'.repeat(65537))});expect((await f.updater.check()).message).toContain('大小上限')
 })
 it('重复点击共享正在进行的检查',async()=>{
  let resolve:any;const request=vi.fn(()=>new Promise(r=>{resolve=r})),f=await fixture({fetch:request})
  const first=f.updater.check(),second=f.updater.check();expect(first).toBe(second);await Promise.resolve();resolve(Response.json(manifest));await first;expect(request).toHaveBeenCalledTimes(1)
 })
 it('请求超时可重试，不永久锁住按钮',async()=>{
  const f=await fixture({checkTimeout:15,fetch:(_url:string,{signal}:{signal:AbortSignal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))})
  expect(await f.updater.check()).toMatchObject({phase:'error',message:expect.stringContaining('超时')})
 })
 it('关闭更新功能时不联网、不下载、不安装',async()=>{
  const f=await fixture({enabled:false}),launch=vi.fn(),confirm=vi.fn();await f.updater.check();await f.updater.download();await f.updater.install(confirm,launch)
  expect(f.updater.get().phase).toBe('disabled');expect(f.request).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled();expect(launch).not.toHaveBeenCalled()
 })
})
describe('下载完整性与确认安装',()=>{
 it('下载后校验 SHA-256；取消不执行，确认后只启动缓存的安装包',async()=>{
  const f=await fixture(),launch=vi.fn();await f.updater.check();expect(await f.updater.download()).toMatchObject({phase:'ready',progress:100,canInstall:true})
  expect(f.request.mock.calls[1][0]).toBe(UPDATE_ROOT+'BugBistro-1.2.6-Setup-x64.exe')
  const files=await fs.readdir(f.cacheDir);expect(files).toHaveLength(1);expect(files[0]).toMatch(/-BugBistro-1.2.6-Setup-x64.exe$/)
  expect(await fs.readFile(path.join(f.cacheDir,files[0]))).toEqual(payload)
  expect((await f.updater.install(async()=>false,launch)).phase).toBe('ready');expect(launch).not.toHaveBeenCalled()
  await f.updater.install(async()=>true,launch);expect(launch).toHaveBeenCalledWith(path.join(f.cacheDir,files[0]))
 })
 it('未下载时不能调用安装，重复下载不重复发请求',async()=>{
  const f=await fixture(),confirm=vi.fn(),launch=vi.fn();await f.updater.install(confirm,launch);expect(confirm).not.toHaveBeenCalled()
  await f.updater.check();await f.updater.download();await f.updater.download();expect(f.request).toHaveBeenCalledTimes(2)
 })
 it('校验失败删除半成品，保留重试能力',async()=>{
  const f=await fixture();await f.updater.check();f.request.mockResolvedValueOnce(new Response('坏包'))
  expect(await f.updater.download()).toMatchObject({phase:'error',canDownload:true,canInstall:false,message:expect.stringContaining('SHA-256')});expect(await fs.readdir(f.cacheDir)).toEqual([])
  expect((await f.updater.download()).phase).toBe('ready')
 })
 it.each([true,false])('安装包大小超限时中止并清理（声明长度=%s）',async withLength=>{
  const f=await fixture({maxInstaller:10});await f.updater.check();f.request.mockResolvedValueOnce(new Response(payload,withLength?{headers:{'content-length':String(payload.length)}}:undefined))
  expect((await f.updater.download()).message).toContain('大小上限');expect(await fs.readdir(f.cacheDir)).toEqual([])
 })
 it.each(['tamper','missing'])('安装前再次校验，拒绝 %s 缓存',async action=>{
  const f=await fixture(),launch=vi.fn();await f.updater.check();await f.updater.download();const file=path.join(f.cacheDir,(await fs.readdir(f.cacheDir))[0])
  if(action==='tamper')await fs.writeFile(file,'tampered');else await fs.unlink(file)
  expect(await f.updater.install(async()=>true,launch)).toMatchObject({phase:'error',canInstall:false,canDownload:true});expect(launch).not.toHaveBeenCalled()
 })
 it('安装器启动失败不假报成功，可再次尝试',async()=>{
  const f=await fixture();await f.updater.check();await f.updater.download()
  expect(await f.updater.install(async()=>true,async()=>{throw Error('系统拒绝执行')})).toMatchObject({phase:'error',canInstall:true,message:'系统拒绝执行'})
 })
 it('默认下载超过5分钟仍可继续，30分钟超时后清理并允许重试',async()=>{
  const f=await fixture();await f.updater.check();let started:any,signal:AbortSignal;const ready=new Promise(r=>{started=r})
  f.request.mockImplementationOnce(async(_url:string,options?:any)=>new Promise((_,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(Error('超时')));started()}))
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});const result=f.updater.download()
  try{
   await ready;await vi.advanceTimersByTimeAsync(5*60*1000)
   expect(signal!.aborted).toBe(false);expect(f.updater.get().phase).toBe('downloading')
   await vi.advanceTimersByTimeAsync(25*60*1000-1);expect(signal!.aborted).toBe(false)
   await vi.advanceTimersByTimeAsync(1)
   expect(await result).toMatchObject({phase:'error',canDownload:true,message:expect.stringContaining('超时')})
   expect(await fs.readdir(f.cacheDir)).toEqual([])
  }finally{f.updater.stop();await result;vi.useRealTimers()}
 })
 it('退出时取消下载并清除半成品',async()=>{
  const f=await fixture();await f.updater.check();let started:any;const ready=new Promise(r=>{started=r})
  f.request.mockImplementationOnce(async(_url:string,options?:any)=>new Promise((_,reject)=>{started();options.signal.addEventListener('abort',()=>reject(Error('取消')))}))
  const result=f.updater.download();await ready;f.updater.stop();expect((await result).message).toContain('取消');expect(await fs.readdir(f.cacheDir)).toEqual([])
 })
})
describe('发布清单生成',()=>{
 it('从当前安装包计算真实 hash，输出用户要求的四字段文件',async()=>{
  const f=await fixture(),root=f.cacheDir,dir=path.join(root,'release','1.2.5');await fs.mkdir(dir,{recursive:true})
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({...current,releaseNotes:'本次更新'}));await fs.writeFile(path.join(dir,installerName('1.2.5')),payload)
  const {generate}=require('../scripts/release-update.cjs'),result=await generate(root)
  expect(JSON.parse(await fs.readFile(result.file,'utf8'))).toEqual({versionCode:1002005,versionName:'1.2.5',sha256,notes:'本次更新'})
 })
})
