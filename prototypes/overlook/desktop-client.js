export async function connectDesktop({model,restaurant,ui,setView,dirty}) {
 const bridge=window.bistro;if(!bridge?.sceneSettings)return;
 const $=id=>document.getElementById(id);
 document.body.classList.add('native-app');
 document.title='Bug 小餐馆';
 document.querySelector('.world-brand small').textContent='Windows 桌面版 · 16:9';
 document.querySelector('.panel-hint').textContent='当前为本地模拟数据，不会修改真实项目。';
 const notice=document.createElement('div');notice.className='native-notice';notice.hidden=true;document.body.append(notice);
 let timer;
 function tell(message){notice.textContent=message;notice.hidden=false;clearTimeout(timer);timer=setTimeout(()=>notice.hidden=true,6500)}
 const drag=document.createElement('div');drag.className='window-drag';document.body.append(drag);
 const controls=document.createElement('div');controls.className='window-controls';
 for(const [action,label] of [['minimize','—'],['maximize','□'],['close','×']]){
  const button=document.createElement('button');button.textContent=label;button.title={minimize:'最小化',maximize:'最大化 / 还原',close:'退出小餐馆'}[action];
  button.onclick=()=>bridge.windowAction(action).catch(e=>tell(e.message));controls.append(button);
 }
 document.body.append(controls);
 const check=document.createElement('label');check.innerHTML='<input id="desktop-interactive" type="checkbox" checked> 桌面空白处单击交互';
 $('settings-panel').insertBefore(check,$('settings-panel').querySelector('p'));
 $('settings-panel').querySelector('p').textContent='设置自动保存。车辆两路共用 0～10 辆额度。桌面图标、拖动、右键和任务栏保留原行为；空白处单击餐馆可查看明细。Ctrl+Shift+B 或托盘恢复窗口。普通窗口保留 16:9；背景按屏幕比例扩展街区，隐藏统计卡片与新增提示。';
 const settingsClose=document.createElement('button');settingsClose.textContent='收起设置';settingsClose.className='native-button';settingsClose.onclick=()=>$('settings-panel').hidden=true;$('settings-panel').append(settingsClose);
 function apply(saved){
 model.setLimits({waiting:saved.waiting,vehicles:saved.vehicles});model.auto=saved.auto;
 $('waiting-limit').value=saved.waiting;$('vehicle-limit').value=saved.vehicles;
 for(const [id,key] of [['animate','animated'],['show-stats','stats'],['show-exterior','exterior'],['desktop-interactive','interactive']])$(id).checked=saved[key];
 restaurant.animated=saved.animated;restaurant.exterior.visible=saved.exterior;model.street.enabled=saved.animated&&saved.exterior;
 document.querySelector('.stats').hidden=!saved.stats;setView(saved.view);ui();dirty();
 }
 bridge.onSceneSettingsChanged(apply);apply(await bridge.sceneSettings());
 $('settings').onclick=$('scene-settings').onclick=()=>bridge.openSettings().catch(e=>tell(e.message));
 let queue=Promise.resolve();
 function save(){
  const value={waiting:model.limits.waiting,vehicles:model.limits.vehicles,view:restaurant.cameraIndex===0?'angled':'front',animated:restaurant.animated,exterior:restaurant.exterior.visible,stats:$('show-stats').checked,interactive:$('desktop-interactive').checked,auto:model.auto};
  queue=queue.catch(()=>{}).then(()=>bridge.saveSceneSettings(value)).catch(e=>tell('设置保存失败：'+e.message));
 }
 for(const id of ['waiting-limit','vehicle-limit','animate','show-stats','show-exterior','desktop-interactive'])$(id).addEventListener('change',save);
 for(const button of document.querySelectorAll('[data-view],#camera,#home,#auto'))button.addEventListener('click',save);
 function modeChanged(mode){
  const desktop=mode==='desktop';document.body.classList.toggle('desktop-mode',desktop);document.body.classList.remove('preview');
  $('preview').textContent='设为桌面背景';$('exit-preview').hidden=!desktop;$('exit-preview').textContent='恢复普通窗口';
  window.dispatchEvent(new Event('resize'));restaurant.resize();restaurant.render(model.snapshot());dirty();
 }
 $('preview').onclick=async()=>{try{const result=await bridge.windowAction('desktop');tell(result.message)}catch(e){tell(e.message)}};
 $('exit-preview').onclick=()=>bridge.windowAction('restore').catch(e=>tell(e.message));
 bridge.onWindowModeChanged(modeChanged);bridge.onDesktopWarning(tell);
 modeChanged((await bridge.settings()).windowMode);
 bridge.onDesktopInput(event=>{
  if(!document.body.classList.contains('desktop-mode'))return;
  const target=document.elementFromPoint(event.x,event.y);if(!target)return;
  if(event.type==='wheel'){
   let scroll=target;while(scroll&&scroll.scrollHeight<=scroll.clientHeight)scroll=scroll.parentElement;
   if(scroll)scroll.scrollTop-=event.delta;return;
  }
  if(event.type!=='click')return;
  if(target instanceof HTMLInputElement&&target.type==='range'){
   const bounds=target.getBoundingClientRect(),min=Number(target.min),max=Number(target.max),step=Number(target.step)||1;
   target.value=String(Math.min(max,Math.max(min,Math.round((min+(max-min)*(event.x-bounds.left)/bounds.width)/step)*step)));
   target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));
  }else target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:event.x,clientY:event.y,view:window}));
 });
}
