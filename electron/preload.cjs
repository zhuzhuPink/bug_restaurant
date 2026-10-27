const {contextBridge,ipcRenderer}=require('electron')
const modeCallbacks=new Set()
let pendingMode
function prepareMode(request){
 if(!modeCallbacks.size){pendingMode=request;return}
 try{
  for(const callback of modeCallbacks)callback(request.mode)
  requestAnimationFrame(()=>requestAnimationFrame(()=>ipcRenderer.send('window:prepared',request.id)))
 }catch{ipcRenderer.send('window:prepared',request.id,'场景布局准备失败')}
}
ipcRenderer.on('window:prepare',(_event,request)=>prepareMode(request))
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args)
contextBridge.exposeInMainWorld('bistro',Object.freeze({
 platform:process.platform,
 appStatus:()=>invoke('app:status'),openSettings:()=>invoke('app:open-settings'),hideSettings:()=>invoke('app:hide-settings'),quit:()=>invoke('app:quit'),
 updateStatus:()=>invoke('updates:get'),checkUpdate:()=>invoke('updates:check'),downloadUpdate:()=>invoke('updates:download'),installUpdate:()=>invoke('updates:install'),
 onUpdateChanged:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('updates:changed',listener);return ()=>ipcRenderer.removeListener('updates:changed',listener)},
 loginSettings:()=>invoke('login:get'),setLogin:enabled=>invoke('login:set',enabled),
 onSceneSettingsChanged:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('scene:changed',listener);return ()=>ipcRenderer.removeListener('scene:changed',listener)},
 sceneSettings:()=>invoke('scene:get'),saveSceneSettings:value=>invoke('scene:save',value),
 onDesktopInput:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('desktop:input',listener);return ()=>ipcRenderer.removeListener('desktop:input',listener)},
 onDesktopWarning:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('desktop:warning',listener);return ()=>ipcRenderer.removeListener('desktop:warning',listener)},
 onWindowModeChanged:callback=>{const listener=(_event,mode)=>callback(mode);modeCallbacks.add(callback);ipcRenderer.on('window:mode',listener);if(pendingMode){const request=pendingMode;pendingMode=null;prepareMode(request)}return ()=>{modeCallbacks.delete(callback);ipcRenderer.removeListener('window:mode',listener)}},
 settings:()=>invoke('settings:get'),saveSettings:(settings,token)=>invoke('settings:save',settings,token),fetchBugs:()=>invoke('bugs:fetch'),loadMock:()=>invoke('mock:load'),saveMock:items=>invoke('mock:save',items),windowAction:action=>invoke('window:action',action)
}))
