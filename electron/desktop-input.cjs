const {spawn}=require('node:child_process');
const readline=require('node:readline');
// 辅助进程只报告桌面空白区域输入，不拦截鼠标、不读取图标文本。
function startDesktopInput(script,parentPid,onInput,onError) {
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ParentPid',String(parentPid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stopped=false,ready=false;
 const lines=readline.createInterface({input:child.stdout});
 let resolveReady,rejectReady;
 const pending=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
 const timeout=setTimeout(()=>fail(new Error('桌面交互启动超时')),15000);
 const fail=e=>{if(stopped)return;clearTimeout(timeout);if(!ready)rejectReady(e);else onError(e)};
 lines.on('line',line=>{try{const event=JSON.parse(line);if(event.type==='ready'){ready=true;clearTimeout(timeout);resolveReady();return}if(['click','wheel'].includes(event.type)&&Number.isFinite(event.x)&&Number.isFinite(event.y))onInput(event)}catch{}});
 child.on('error',fail);
 let error='';child.stderr.on('data',chunk=>{error=(error+chunk).slice(-1800)});
 child.on('exit',()=>{if(!stopped)fail(new Error(error||'桌面交互进程已结束'))});
 return {ready:pending,stop(){if(stopped)return;stopped=true;clearTimeout(timeout);if(!ready)rejectReady(new Error('桌面交互启动已取消'));lines.close();child.kill()}};
}
module.exports={startDesktopInput};
