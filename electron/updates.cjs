const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const UPDATE_ROOT='http://124.220.98.33:9000/private/bug_restaurant/';
const MAX_MANIFEST=64*1024,MAX_INSTALLER=512*1024*1024;
function versionParts(value){
 if(typeof value!=='string'||!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value))throw new Error('版本名称必须为 x.y.z 格式');
 const parts=value.split('.').map(Number);
 if(parts.join('.')!==value)throw new Error('版本名称不能包含前导零');
 return parts;
}
function compareVersion(a,b){const left=versionParts(a),right=versionParts(b);for(let i=0;i<3;i++)if(left[i]!==right[i])return Math.sign(left[i]-right[i]);return 0}
function installerName(version){versionParts(version);return `BugBistro-${version}-Setup-x64.exe`}
function validateManifest(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('版本文件格式无效');
 const {versionCode,versionName,sha256,notes}=raw;
 if(!Number.isSafeInteger(versionCode)||versionCode<1)throw new Error('versionCode 必须为正整数');
 versionParts(versionName);
 if(typeof sha256!=='string'||!/^([a-f0-9]{64})$/i.test(sha256))throw new Error('版本文件缺少有效的 SHA-256');
 if(typeof notes!=='string'||notes.length>12000)throw new Error('更新说明格式无效或过长');
 return {versionCode,versionName,sha256:sha256.toLowerCase(),notes};
}
async function fileHash(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex')}
async function readBody(response,limit,onChunk){
 if(Number(response.headers.get('content-length'))>limit)throw new Error('更新文件超过大小上限');
 if(!response.body)throw new Error('更新服务返回空响应');
 const reader=response.body.getReader();let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new Error('更新文件超过大小上限');await onChunk(value,size)}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 if(!size)throw new Error('更新服务返回空文件');
}
function createUpdater({current,cacheDir,fetch:request=globalThis.fetch,enabled=true,onChange=()=>{},checkTimeout=10000,downloadTimeout=30*60*1000,maxInstaller=MAX_INSTALLER}){
 versionParts(current.version);
 if(!Number.isSafeInteger(current.versionCode)||current.versionCode<1)throw new Error('本地 versionCode 无效');
 let latest=null,downloaded=null,busy=null,controller=null,stopped=false;
 let state={phase:enabled?'idle':'disabled',message:enabled?'点击检查更新，不会在启动时联网。':'更新功能已关闭',progress:null,checkedAt:null};
 const get=()=>({...state,enabled,currentVersion:current.version,currentCode:current.versionCode,latestVersion:latest?.versionName||null,notes:latest?.notes||'',insecure:UPDATE_ROOT.startsWith('http:'),canDownload:enabled&&!busy&&!!latest&&!downloaded,canInstall:enabled&&!busy&&!!downloaded});
 const emit=()=>onChange(get());
 const set=patch=>{state={...state,...patch};emit()};
 function run(phase,job){
  if(!enabled||stopped)return Promise.resolve(get());
  if(busy)return busy;
  busy=Promise.resolve().then(job).catch(error=>set({phase:'error',message:error.message||'更新操作失败，请重试',progress:null})).finally(()=>{busy=null;emit()}).then(get);
  set({phase,progress:null});return busy;
 }
 async function fetchFile(url,timeout,consume){
  const active=controller=new AbortController();
  const timer=setTimeout(()=>active.abort(),timeout);let response;
  try{
   response=await request(url,{signal:active.signal,redirect:'error',cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   if(!response.ok){
    await response.body?.cancel().catch(()=>{});
    if(response.status===401||response.status===403)throw new Error('更新服务拒绝访问（HTTP '+response.status+'），请允许匿名读取 private/bug_restaurant/ 下的更新文件；客户端不会保存 S3 密钥。');
    if(response.status===404)throw new Error('更新文件尚未发布（HTTP 404），请上传安装包和 latest.json。');
    throw new Error('更新服务返回 HTTP '+response.status);
   }
   return await consume(response);
  }catch(error){
   if(active.signal.aborted)throw new Error(stopped?'更新操作已取消':'更新请求超时，请检查网络后重试');
   if(error instanceof TypeError)throw new Error('无法连接更新服务，请检查网络；更新地址不允许重定向');
   throw error;
  }finally{clearTimeout(timer);await response?.body?.cancel().catch(()=>{});if(controller===active)controller=null}
 }
 function check(){
  if(busy||!enabled||stopped)return busy||Promise.resolve(get());
  latest=null;downloaded=null;
  return run('checking',async()=>{
   set({message:'正在检查更新…'});
   const manifest=await fetchFile(UPDATE_ROOT+'latest.json',checkTimeout,async response=>{
    const chunks=[];await readBody(response,MAX_MANIFEST,chunk=>chunks.push(Buffer.from(chunk)));
    let raw;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''))}catch{throw new Error('latest.json 不是有效的 JSON 版本文件')}
    return validateManifest(raw);
   });
   const newer=compareVersion(manifest.versionName,current.version)>0;
   if(newer&&manifest.versionCode<=current.versionCode||!newer&&manifest.versionCode>current.versionCode)throw new Error('版本号与 versionCode 不一致，请发布者检查版本文件');
   if(newer)latest=manifest;
   set({phase:newer?'available':'current',checkedAt:new Date().toISOString(),message:newer?'发现新版本 v'+manifest.versionName:'当前已是最新版本 v'+current.version});
  });
 }
 function download(){
  if(busy||!enabled||stopped)return busy||Promise.resolve(get());
  if(!latest)return Promise.resolve(get());
  if(downloaded)return Promise.resolve(get());
  const release=latest;
  return run('downloading',async()=>{
   const target=path.join(cacheDir,release.sha256.slice(0,16)+'-'+installerName(release.versionName)),partial=target+'.part';
   let handle;
   try{
    set({message:'正在下载安装包…',progress:0});await fs.mkdir(cacheDir,{recursive:true});
    handle=await fs.open(partial,'w');const hash=createHash('sha256');let lastProgress=0;
    await fetchFile(UPDATE_ROOT+installerName(release.versionName),downloadTimeout,async response=>{
     const total=Number(response.headers.get('content-length'));
     await readBody(response,maxInstaller,async(chunk,size)=>{
      await handle.writeFile(chunk);hash.update(chunk);
      const progress=total>0?Math.min(99,Math.floor(size/total*100)):null;
      if(progress!==lastProgress){lastProgress=progress;set({progress})}
     });
    });
    await handle.close();handle=null;
    if(hash.digest('hex')!==release.sha256)throw new Error('安装包 SHA-256 校验失败，已丢弃下载文件，请重新下载或联系发布者');
    await fs.rename(partial,target);downloaded=target;
    set({phase:'ready',progress:100,message:'安装包 SHA-256 校验通过，点击“退出并安装”继续。'});
   }finally{await handle?.close().catch(()=>{});await fs.unlink(partial).catch(()=>{})}
  });
 }
 function install(confirm,launch){
  if(busy||!enabled||stopped)return busy||Promise.resolve(get());
  if(!downloaded||!latest)return Promise.resolve(get());
  return run('installing',async()=>{
   set({message:'正在确认安装…'});
   if(!await confirm(get())){set({phase:'ready',message:'已取消安装，已校验的安装包仍可使用。'});return}
   // 安装前重新校验缓存；只启动本模块生成的本地路径，不接受渲染进程传入路径或 URL。
   try{if(await fileHash(downloaded)!==latest.sha256)throw new Error('安装包校验失败')}catch{downloaded=null;throw new Error('本地安装包缺失或已变化，请重新下载')}
   await launch(downloaded);set({message:'安装程序已启动，小餐馆即将退出。'});
  });
 }
 function stop(){stopped=true;controller?.abort()}
 return {get,check,download,install,stop};
}
module.exports={UPDATE_ROOT,installerName,validateManifest,compareVersion,fileHash,createUpdater};
