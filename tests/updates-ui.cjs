const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),{createHash}=require('node:crypto');
const {_electron}=require('playwright');
const pkg=require('../package.json');
(async()=>{
 const payload=Buffer.from('MZ 仅用于更新流程回归，禁止执行'),sha256=createHash('sha256').update(payload).digest('hex');
 const parts=pkg.version.split('.').map(Number);parts[2]++;const newer=parts.join('.');
 let mode='new',requests=0,reply;
 const server=http.createServer((req,res)=>{
  requests++;
  if(mode==='denied'){res.writeHead(403);res.end('AccessDenied');return}
  if(req.url.endsWith('/latest.json')){
   const current=mode==='current';res.writeHead(200,{'Content-Type':'application/json'});
   const send=()=>res.end(JSON.stringify({versionCode:pkg.versionCode+(current?0:1),versionName:current?pkg.version:newer,sha256,notes:'新增更新检查\n<img src=x onerror="window.injected=true">'}));
   if(mode==='pending')reply=send;else send();
  }else{res.writeHead(200,{'Content-Length':payload.length});res.end(mode==='bad'?Buffer.alloc(payload.length,65):payload)}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const data=path.resolve('.electron-test','updates-ui-'+Date.now());await fs.mkdir(data,{recursive:true});
 const env={...process.env,BISTRO_DATA_DIR:data,BISTRO_START_NORMAL:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.BISTRO_DISABLE_UPDATES;
 let app;
 try{
  app=await _electron.launch({...(process.env.BISTRO_EXE?{executablePath:path.resolve(process.env.BISTRO_EXE)}:{}),args:[...(process.env.BISTRO_EXE?[]:['.'])],cwd:process.cwd(),env,timeout:60000});
  assert.equal(await app.evaluate(({app})=>app.getLocale()),'zh-CN','程序应使用简体中文');
  const page=await app.firstWindow();await page.waitForFunction(()=>window.bistro&&window.demo?.info().renderer.calls>0);
  await app.evaluate(({dialog,shell},base)=>{
   const request=globalThis.fetch;globalThis.fetch=(url,options)=>{if(!String(url).startsWith('http://124.220.98.33:9000/private/bug_restaurant/'))throw Error('非预期更新地址');return request(base+new URL(url).pathname,options)};
   globalThis.updateTest={confirm:false,dialogs:[],launches:[]};
   dialog.showMessageBox=async(_owner,options)=>{globalThis.updateTest.dialogs.push(options);return {response:globalThis.updateTest.confirm?1:0}};
   shell.openPath=async file=>{globalThis.updateTest.launches.push(file);return '测试拦截：未执行安装包'};
  },'http://127.0.0.1:'+server.address().port);
  const event=app.waitForEvent('window');await page.evaluate(()=>bistro.openSettings());const settings=await event,errors=[];settings.on('pageerror',e=>errors.push(e.message));
  await settings.waitForFunction(()=>!document.querySelector('#update-check').disabled);
  assert.equal(requests,0,'启动和打开设置不得自动联网');
  const window=await app.browserWindow(settings);
  for(const size of [[960,540],[1120,630]]){
   await window.evaluate((win,size)=>win.setSize(...size),size);
   await settings.waitForFunction(()=>{const r=document.querySelector('#update-check-top').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight});
   assert.equal(await settings.evaluate(()=>document.querySelector('main').scrollLeft),0);
  }
  await settings.screenshot({path:path.join(data,'settings-top.png')});
  mode='pending';const before=requests;await settings.locator('#update-check-top').click();
  await settings.waitForFunction(()=>document.querySelector('#update-check').disabled&&document.querySelector('#update-check-top').disabled&&document.querySelector('#update-check-top').textContent==='正在检查…');
  assert.equal(requests,before+1,'顶部检查按钮只发送一次请求');
  assert.ok(reply,'检查请求应已到达模拟服务');reply();reply=null;
  await settings.waitForFunction(()=>!document.querySelector('#update-check-top').disabled&&!document.querySelector('#update-download').hidden);
  assert.equal(await settings.evaluate(()=>{const r=document.querySelector('#update-status').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),true,'顶部检查后结果应在可视区域');
  mode='denied';await settings.locator('#update-check').click();await settings.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('403'));
  assert.equal(await settings.locator('#update-download').isVisible(),false);
  mode='current';await settings.locator('#update-check').click();await settings.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('已是最新'));
  mode='new';await settings.locator('#update-check').click();await settings.waitForFunction(()=>!document.querySelector('#update-download').hidden);
  assert.equal(await settings.locator('#update-notes img').count(),0,'远程说明只能作为文本显示');assert.equal(await settings.evaluate(()=>!!window.injected),false);
  await settings.locator('#updates').scrollIntoViewIfNeeded();await settings.screenshot({path:path.join(data,'update-available.png')});
  mode='bad';await settings.locator('#update-download').click();await settings.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('校验失败'));
  assert.equal(await settings.locator('#update-install').isVisible(),false);
  mode='new';await settings.locator('#update-download').click();await settings.waitForFunction(()=>!document.querySelector('#update-install').hidden);
  await settings.locator('#update-install').click();await settings.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('已取消安装'));
  assert.equal(await app.evaluate(()=>globalThis.updateTest.launches.length),0);
  await app.evaluate(()=>{globalThis.updateTest.confirm=true});await settings.locator('#update-install').click();await settings.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('测试拦截'));
  const result=await app.evaluate(()=>globalThis.updateTest);assert.equal(result.launches.length,1);
  assert.equal(result.dialogs[0].defaultId,0);assert.ok(result.dialogs[0].detail.includes('HTTP'));assert.ok(result.launches[0].startsWith(path.join(data,'updates')+path.sep));
  assert.deepEqual(await fs.readFile(result.launches[0]),payload);assert.deepEqual(errors,[]);
  console.log('更新界面回归通过：首屏顶部入口、双入口忙碌同步、结果自动定位、启动不联网、403、无更新、新版本、纯文本说明、坏包拒绝、下载校验、取消安装及启动失败保留当前程序。未执行真实安装包。');
  console.log('设置界面截图：'+path.join(data,'update-available.png'));
 }finally{if(reply)reply();if(app)await app.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error('更新界面验收失败：',error);process.exitCode=1});
