import { ref, computed, watch } from 'vue'
import { defaults, validateSettings, normalizeItems, seedBugs, groupBugs, changesSince, newBug, advanceBug, labels, type Bug, type Settings, type Stage } from './model'
export interface Activity { id:number; text:string; time:string; stage?:Stage }
export function useBistro() {
 const settings=ref<Settings>({...defaults}),items=ref<Bug[]>([]),loading=ref(false),error=ref(''),notice=ref(''),lastSync=ref<Date>(),now=ref(new Date()),activities=ref<Activity[]>([]),view=ref<'hall'|'board'>('hall'),drawer=ref<Stage|null>(null),settingsOpen=ref(false),ready=ref(false)
 let busy=false,revision=0,serial=18,cycle=0,demoCycle=0,logId=0,clock:ReturnType<typeof setInterval>,lastRefresh=Date.now(),lastDemo=Date.now(),toastTimer:ReturnType<typeof setTimeout>,saveChain=Promise.resolve()
 const groups=computed(()=>groupBugs(items.value,now.value))
 const stats=computed(()=>({todo:groups.value.todo.length,doing:groups.value.doing.length,ready:groups.value.ready.length,closed:groups.value.closed.length}))
 const load=computed(()=>stats.value.todo+stats.value.doing)
 const chefMood=computed(()=>load.value>=settings.value.threshold*2?'panic':load.value>=settings.value.threshold?'busy':stats.value.doing?'cooking':'idle')
 const progress=computed(()=>{const total=Object.values(stats.value).reduce((a,b)=>a+b,0);return total?Math.round(stats.value.closed/total*100):0})
 function toast(text:string){notice.value=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>notice.value='',6000)}
 function log(text:string,stage?:Stage){activities.value.unshift({id:++logId,text,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),stage});activities.value=activities.value.slice(0,30)}
 function persistMock(){if(settings.value.source!=='mock')return;const snapshot=JSON.parse(JSON.stringify(items.value));saveChain=saveChain.then(async()=>{if(window.bistro)await window.bistro.saveMock(snapshot);else localStorage.setItem('bistro:mock',JSON.stringify(snapshot))}).catch(()=>toast('模拟进度未能保存，下次启动可能重置'))}
 function replace(next:Bug[],persist=true){const changes=changesSince(items.value,next);items.value=next;for(const c of changes.slice(0,5))log(c.from?`${c.id} · ${labels[c.to].zone}`:`收到新订单 ${c.id}`,c.to);if(changes.length>5)log(`另外 ${changes.length-5} 笔订单已同步`);lastSync.value=new Date();error.value='';if(persist)persistMock()}
 function add(count=1){if(settings.value.source!=='mock')return;const next=[...items.value];if(next.length+count>10000){toast('模拟订单最多保存 10000 笔，请先重置演示');return}for(let i=0;i<count;i++)next.push(newBug(++serial));replace(next);if(count>1)toast(`新增 ${count} 笔订单，厨师进入忙碌状态`)}
 function advance(id?:string){if(settings.value.source!=='mock')return;const order=id?items.value.find(b=>b.id===id):groups.value[(['doing','ready','todo'] as Stage[])[cycle++%3]!][0]||items.value.find(b=>b.status!=='closed');if(!order||order.status==='closed')return;replace(items.value.map(b=>b.id===order.id?advanceBug(b):b))}
 function reset(){if(settings.value.source!=='mock')return;serial=18;cycle=0;demoCycle=0;replace(seedBugs());log('已重新准备今日示例订单');toast('演示已重置')}
 function simulateFailure(){error.value='模拟网络暂时不可用，餐馆继续展示上次成功的数据';log('同步失败 · 已保留餐馆当前进度');toast('已模拟同步失败；点击重新同步即可恢复')}
 async function sync(){if(busy)return;busy=true;loading.value=true;const started=revision;try{if(settings.value.source==='http'){if(!window.bistro)throw new Error('HTTP 数据接入请在桌面应用中使用');const next=normalizeItems(await window.bistro.fetchBugs());if(started!==revision)return;replace(next,false)}else{await new Promise(r=>setTimeout(r,180));lastSync.value=new Date();error.value='';log('模拟数据同步完成')}lastRefresh=Date.now()}catch(e){if(started!==revision)return;error.value=e instanceof Error?e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,''):'同步失败，请稍后重试';log('同步失败 · 保留最后成功数据')}finally{loading.value=false;busy=false;if(started!==revision)void sync()}}
 async function saveSettings(next:Settings,token?:string){
  const validated=validateSettings(next),oldSource=settings.value.source,oldItems=items.value
  settings.value=window.bistro?await window.bistro.saveSettings(JSON.parse(JSON.stringify(validated)),token):validated
  if(!window.bistro)localStorage.setItem('bistro:settings',JSON.stringify(settings.value))
  revision++;if(oldSource!==settings.value.source){if(oldSource==='mock'){saveChain=saveChain.then(async()=>{if(window.bistro)await window.bistro.saveMock(JSON.parse(JSON.stringify(oldItems)));else localStorage.setItem('bistro:mock',JSON.stringify(oldItems))});await saveChain}if(settings.value.source==='mock')await loadMock();else items.value=[]}
  lastDemo=Date.now();lastRefresh=Date.now();settingsOpen.value=false;toast('设置已保存');await sync()
 }
 async function loadMock(){let saved:unknown;try{saved=window.bistro?await window.bistro.loadMock():JSON.parse(localStorage.getItem('bistro:mock')||'null');items.value=saved?normalizeItems(saved):seedBugs()}catch{items.value=seedBugs();toast('模拟进度无法读取，已恢复示例订单')}serial=Math.max(18,...items.value.map(b=>Number(b.id.replace('BUG-',''))||0));lastSync.value=new Date()}
 async function init(){try{settings.value=validateSettings(window.bistro?await window.bistro.settings():JSON.parse(localStorage.getItem('bistro:settings')||'{}'));if(settings.value.source==='mock')await loadMock();else await sync();log('小餐馆已开门，欢迎回来');ready.value=true;clock=setInterval(()=>{now.value=new Date();if(!ready.value||settingsOpen.value)return;if(Date.now()-lastRefresh>=settings.value.refreshSeconds*1000){lastRefresh=Date.now();void sync()}if(settings.value.source==='mock'&&settings.value.autoDemo&&Date.now()-lastDemo>=8000){lastDemo=Date.now();if(demoCycle++%4===0)add();else advance()}},1000)}catch{error.value='初始化失败，请重启应用';ready.value=true}}
 async function windowAction(action:'minimize'|'maximize'|'close'|'restore'|'desktop'){if(!window.bistro){toast('窗口操作请在桌面应用中使用');return}try{const result=await window.bistro.windowAction(action);if(result.message)toast(result.message);if(action==='restore'||action==='desktop')settings.value=await window.bistro.settings()}catch(e){toast(e instanceof Error?e.message:'窗口切换失败')}}
 function destroy(){clearInterval(clock);clearTimeout(toastTimer)}
 watch(()=>settings.value.autoDemo,()=>lastDemo=Date.now())
 return {settings,items,loading,error,notice,lastSync,now,activities,view,drawer,settingsOpen,ready,groups,stats,load,chefMood,progress,toast,log,add,advance,reset,simulateFailure,sync,saveSettings,init,destroy,windowAction}
}
export type Bistro = ReturnType<typeof useBistro>
