const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

(async()=>{
 const root=path.resolve('dist/bistro'),out=path.resolve('.electron-test/wallpaper-view');
 await fs.mkdir(out,{recursive:true});
 const server=http.createServer(async(req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{
   const body=await fs.readFile(file);
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body);
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 const errors=[],checks=[];
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>window.demo?.info().renderer.calls>0);
  await page.evaluate(()=>{demo.pause();document.querySelector('#add').click()});
  assert.equal(await page.locator('.stats').isVisible(),true);
  assert.equal(await page.locator('#arrival-toast').isVisible(),true);
  await page.locator('#scene-fullscreen').click();
  await page.waitForFunction(()=>document.body.classList.contains('fullscreen-mode'));
  assert.equal(await page.locator('.stats').isVisible(),false);
  await page.evaluate(()=>document.exitFullscreen());
  await page.waitForFunction(()=>!document.body.classList.contains('fullscreen-mode'));
  assert.equal(await page.locator('.stats').isVisible(),true);
  checks.push('真实全屏事件隐藏统计，退出后恢复普通界面');
  await page.evaluate(()=>document.body.classList.add('desktop-mode'));
  for(const [width,height] of [[1600,900],[1920,1200],[2874,1392],[3440,1440],[3840,1080],[1080,1920]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(({width,height})=>{
    const r=document.querySelector('#scene').getBoundingClientRect();
    return Math.abs(r.x)<1&&Math.abs(r.y)<1&&Math.abs(r.width-width)<1&&Math.abs(r.height-height)<1;
   },{width,height});
   assert.equal(await page.locator('.stats').isVisible(),false);
   assert.equal(await page.locator('#arrival-toast').isVisible(),false);
   // 即使设置广播再次打开统计，背景也不能显示状态卡片。
   await page.locator('.stats').evaluate(e=>e.hidden=false);
   assert.equal(await page.locator('.stats').isVisible(),false);
   const point=await page.evaluate(()=>demo.point(3.6,1.85,-5.55));
   await page.mouse.click(point.x,point.y);
   assert.equal(await page.locator('#veil').isVisible(),true);
   await page.locator('#close').click();
   await page.waitForFunction(()=>{
    const state=demo.snapshot(),pose=state.waiter.pose;
    const bubble=document.querySelector(`[data-bug="${state.waiter.orderId}"]`);
    if(!bubble)return false;
    const head=demo.point(pose.x,2.08,pose.z),r=bubble.getBoundingClientRect();
    const scale=Math.min(innerWidth/1600,innerHeight/900);
    return Math.abs(r.x+r.width/2-head.x)<100*scale&&Math.abs(r.bottom-head.y)<200*scale;
   });
   await page.screenshot({path:path.join(out,`${width}x${height}.png`)});
   checks.push(`${width}×${height} 背景画布无空边、统计及新增提示隐藏、备料区可点击`);
  }
  for(const view of ['angled','front']){
   await page.locator(`[data-view=${view}]`).evaluate(e=>e.click());
   for(const filter of ['todo','cooking','ready']){
    await page.locator(`#labels [data-filter=${filter}]`).click();
    assert.equal(await page.locator('#veil').isVisible(),true);
    await page.locator('#close').click();
   }
  }
  checks.push('两种视角下备料、烹饪、出餐三个区域均可打开明细');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({date:new Date().toISOString(),checks,errors,softwareRenderingForced:false,physicalDesktop:false},null,2));
  console.log('通过：'+checks.join('；'));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error('背景显示验收失败：',e);process.exitCode=1});
