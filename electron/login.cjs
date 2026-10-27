const path=require('node:path');
function createLogin(app,env=process.env,platform=process.platform) {
 const executable=()=>env.PORTABLE_EXECUTABLE_FILE||app.getPath('exe');
 function get(){
  const supported=platform==='win32'&&app.isPackaged;
  if(!supported)return {supported:false,enabled:false,path:'',message:'开机自启动仅在 Windows 正式程序中可设置'};
  const target=executable(),state=app.getLoginItemSettings({path:target,args:[]});
  return {supported:true,enabled:state.openAtLogin&&state.executableWillLaunchAtLogin!==false,path:target,message:'开机登录后自动运行，并直接作为桌面背景'};
 }
 function set(enabled){
  if(typeof enabled!=='boolean')throw new Error('开机自启动开关格式无效');
  if(!get().supported)throw new Error('请在 Windows 正式程序中设置开机自启动');
  const target=executable();if(!path.isAbsolute(target)||path.extname(target).toLowerCase()!=='.exe')throw new Error('启动程序路径无效');
  // 便携版必须注册原始 EXE，不注册临时解压目录中的程序。
  app.setLoginItemSettings({openAtLogin:enabled,enabled,path:target,args:[]});
  const result=get();if(result.enabled!==enabled)throw new Error('系统未接受开机自启动设置，请检查系统启动项策略');
  return result;
 }
 return {get,set};
}
module.exports={createLogin};
