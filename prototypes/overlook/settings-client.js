const bridge=window.bistro;
const $=id=>document.getElementById(id);
let saved,queue=Promise.resolve(),loginBusy=false;
function tell(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error)}
function apply(value){
 saved=value;
 for(const input of document.querySelectorAll('[data-key]')){
  const key=input.dataset.key;if(input.type==='checkbox')input.checked=value[key];else input.value=value[key];
 }
 $('waiting-value').textContent=value.waiting+' 人';$('vehicles-value').textContent=value.vehicles+' 辆';
}
function showMode(mode){$('mode').textContent=mode==='desktop'?'桌面背景运行中':'普通窗口运行中'}
async function refreshLogin(){const value=await bridge.loginSettings();$('login').checked=value.enabled;$('login').disabled=!value.supported||loginBusy;$('login-hint').textContent=value.message;return value}
for(const input of document.querySelectorAll('[data-key]')){
 input.disabled=true;
 if(input.type==='range')input.oninput=()=>$(input.id+'-value').textContent=input.value+(input.id==='waiting'?' 人':' 辆');
 input.onchange=()=>{
  const patch={[input.dataset.key]:input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value};
  tell('正在保存…');
  queue=queue.catch(()=>{}).then(()=>bridge.saveSceneSettings(patch)).then(value=>{apply(value);tell('已保存 · 已应用到小店')}).catch(e=>{if(saved)apply(saved);tell('保存失败：'+e.message,true)});
 };
}
$('login').onchange=async()=>{
 const enabled=$('login').checked;loginBusy=true;$('login').disabled=true;tell('正在更新 Windows 启动项…');
 try{const value=await bridge.setLogin(enabled);$('login').checked=value.enabled;tell(value.enabled?'已开启开机自启动':'已关闭开机自启动')}
 catch(e){tell('开机自启动设置失败：'+e.message,true);await refreshLogin().catch(()=>{$('login').checked=!enabled})}
 finally{loginBusy=false;await refreshLogin().catch(e=>tell('读取启动项失败：'+e.message,true))}
};
for(const [id,action] of [['desktop','desktop'],['restore','restore']])$(id).onclick=async()=>{
 $(id).disabled=true;
 try{tell((await bridge.windowAction(action)).message)}catch(e){tell(e.message,true)}finally{$(id).disabled=false}
};
$('hide').onclick=()=>bridge.hideSettings().catch(e=>tell(e.message,true));
$('quit').onclick=()=>bridge.quit().catch(e=>tell(e.message,true));
let updateState,updateBusy=false;
function showUpdate(value){
 updateState=value;
 $('update-status').textContent='当前 v'+value.currentVersion+' · '+value.message;
 $('update-status').classList.toggle('error',value.phase==='error');
 $('update-notes').textContent=value.notes;$('update-notes').hidden=!value.notes;
 const busy=updateBusy||['checking','downloading','installing'].includes(value.phase);
 for(const id of ['update-check','update-check-top','update-download','update-install'])$(id).disabled=!value.enabled||busy;
 $('update-check-top').textContent=value.phase==='checking'?'正在检查…':'检查更新';
 $('update-download').hidden=!value.canDownload;$('update-install').hidden=!value.canInstall;
 $('update-progress').hidden=value.phase!=='downloading';
 if(value.progress===null)$('update-progress').removeAttribute('value');else $('update-progress').value=value.progress;
}
for(const [id,method] of [['update-check-top','checkUpdate'],['update-check','checkUpdate'],['update-download','downloadUpdate'],['update-install','installUpdate']])$(id).onclick=async()=>{
 if(updateBusy||!updateState?.enabled)return;
 updateBusy=true;showUpdate(updateState);
 if(id==='update-check-top')$('updates').scrollIntoView({block:'start'});
 try{showUpdate(await bridge[method]())}catch(e){updateState={...updateState,phase:'error',message:'更新操作失败：'+e.message}}
 finally{updateBusy=false;showUpdate(updateState)}
};
if(bridge){
 bridge.onUpdateChanged(showUpdate);
 bridge.updateStatus().then(showUpdate).catch(e=>{$('update-status').textContent='更新功能暂不可用：'+e.message});
 bridge.onSceneSettingsChanged(apply);bridge.onWindowModeChanged(showMode);
 window.addEventListener('focus',()=>refreshLogin().catch(e=>tell(e.message,true)));
 try{const [scene,status]=await Promise.all([bridge.sceneSettings(),bridge.appStatus(),refreshLogin()]);apply(scene);showMode(status.mode);$('version').textContent='v'+status.version+' · 16:9 电脑桌面版';for(const input of document.querySelectorAll('[data-key]'))input.disabled=false;tell('设置已就绪 · 修改后自动保存')}
 catch(e){tell('设置读取失败：'+e.message,true)}
}else tell('请从正式程序的系统托盘打开设置。',true);
