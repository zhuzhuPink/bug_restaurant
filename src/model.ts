export const stages = ['todo', 'doing', 'ready', 'closed'] as const
export type Stage = typeof stages[number]
export interface Bug { id: string; title: string; status: Stage; assignee: string; createdAt: string; updatedAt: string; closedAt?: string; priority: 'high' | 'normal' | 'low' }
export interface Settings { source: 'mock' | 'http'; endpoint: string; animations: boolean; showStats: boolean; autoDemo: boolean; refreshSeconds: number; threshold: number; windowSize: 'compact' | 'normal' | 'large'; windowMode: 'normal' | 'borderless' | 'desktop'; alwaysOnTop: boolean; hasToken?: boolean }
export const defaults: Settings = { source: 'mock', endpoint: '', animations: true, showStats: true, autoDemo: true, refreshSeconds: 60, threshold: 8, windowSize: 'normal', windowMode: 'normal', alwaysOnTop: false }
export const labels: Record<Stage, { name: string; zone: string; verb: string; hint: string; color: string; dish: string }> = {
 todo: { name: '待处理', zone: '等待备菜', verb: '开始烹饪', hint: '新订单已送达，等待厨师开工', color: '#b4644c', dish: 'dish_todo' },
 doing: { name: '处理中', zone: '正在烹饪', verb: '完成出餐', hint: '厨师正在认真处理每一份订单', color: '#ba862f', dish: 'dish_cooking' },
 ready: { name: '已修复 / 暂不解决', zone: '做好待上桌', verb: '送到餐桌', hint: '菜品已出锅，等待确认并关闭', color: '#66896b', dish: 'dish_ready' },
 closed: { name: '今日关闭', zone: '今天已上桌', verb: '已完成', hint: '今天关闭的 Bug，都是一份好消息', color: '#688da1', dish: 'dish_served' }
}
const aliases: Record<string, Stage> = { todo:'todo',new:'todo','未开始':'todo','新建':'todo','待处理':'todo',doing:'doing',in_progress:'doing','处理中':'doing',ready:'ready',resolved:'ready',wontfix:'ready','已修复':'ready','暂不解决':'ready',closed:'closed','已关闭':'closed' }
export function normalizeItems(input: unknown): Bug[] {
 const rows = Array.isArray(input) ? input : (input && typeof input === 'object' && 'items' in input ? (input as { items: unknown }).items : null)
 if (!Array.isArray(rows) || rows.length > 10000) throw new Error('数据应为 Bug 数组或 { items: [...] }，最多 10000 条')
 const found = new Map<string, Bug>()
 const date = (value: unknown, field: string) => { if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) throw new Error(`${field} 不是有效日期`); return new Date(value).toISOString() }
 for (const raw of rows) {
  if (!raw || typeof raw !== 'object') throw new Error('Bug 条目不是对象')
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id.trim() || r.id.length > 160 || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 1000) throw new Error('Bug 的 id 或 title 无效')
  const status = typeof r.status === 'string' && Object.hasOwn(aliases,r.status.toLowerCase()) ? aliases[r.status.toLowerCase()] : undefined
  if (!status) throw new Error(`Bug ${r.id.slice(0,40)} 的状态无法识别`)
  const updatedAt = date(r.updatedAt, 'updatedAt')
  const item: Bug = { id:r.id.trim(), title:r.title.trim(), status, assignee:typeof r.assignee === 'string' ? r.assignee.slice(0,100) : '未分配', createdAt:r.createdAt ? date(r.createdAt,'createdAt') : updatedAt, updatedAt, priority: r.priority === 'high' || r.priority === 'low' ? r.priority : 'normal' }
  if (status === 'closed') item.closedAt = date(r.closedAt, 'closedAt')
  const previous = found.get(item.id)
  if (!previous || Date.parse(item.updatedAt) >= Date.parse(previous.updatedAt)) found.set(item.id,item)
 }
 return [...found.values()]
}
export function isToday(value: string | undefined, now = new Date()): boolean {
 if (!value) return false
 const d = new Date(value)
 return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}
export function groupBugs(items: Bug[], now = new Date()): Record<Stage, Bug[]> {
 const result: Record<Stage, Bug[]> = { todo:[], doing:[], ready:[], closed:[] }
 for (const item of items) if (item.status !== 'closed' || isToday(item.closedAt,now)) result[item.status].push(item)
 return result
}
export interface Change { id: string; title: string; from?: Stage; to: Stage }
export function changesSince(before: Bug[], after: Bug[]): Change[] {
 const old = new Map(before.map(b => [b.id,b]))
 return after.filter(b => !old.has(b.id) || old.get(b.id)!.status !== b.status).map(b => ({id:b.id,title:b.title,from:old.get(b.id)?.status,to:b.status}))
}
const titles = ['登录后头像偶尔没有更新','筛选条件切换后列表未刷新','修正深色模式下的文字对比度','上传图片时缺少进度提示','修复报表导出的日期格式','页面返回后滚动位置丢失','长标题在小窗口下显示不全','优化空数据状态的提示','设置保存后没有及时生效','订单详情加载时出现闪烁','搜索结果中的高亮位置偏移','修复时区切换后的日期显示','快捷键与系统操作冲突','提示气泡挡住了操作按钮','网络恢复后需要重新拉取数据','窗口缩放后图标轻微模糊','通知角标未在已读后清除','修正重复提交的边界情况']
const names = ['林晓', '阿川', '小满', '陈可']
export function newBug(n: number, now = new Date()): Bug { return { id:`BUG-${String(n).padStart(3,'0')}`,title:titles[(n-1)%titles.length]!,status:'todo',assignee:names[(n-1)%names.length]!,createdAt:now.toISOString(),updatedAt:now.toISOString(),priority:n%5===0?'high':n%4===0?'low':'normal' } }
export function seedBugs(now = new Date()): Bug[] {
 return Array.from({length:18},(_,i) => {const b=newBug(i+1,now);b.status=i<5?'todo':i<9?'doing':i<12?'ready':'closed'; if(b.status==='closed') b.closedAt=now.toISOString();return b})
}
export function advanceBug(b: Bug, now = new Date()): Bug { const next=stages[Math.min(3, stages.indexOf(b.status)+1)]!;return {...b,status:next,updatedAt:now.toISOString(),...(next==='closed'?{closedAt:now.toISOString()}:{})} }
export function validateSettings(value: Partial<Settings>): Settings {
 const merged={...defaults,...value}
 return {...merged, alwaysOnTop:typeof merged.alwaysOnTop==='boolean'?merged.alwaysOnTop:false, source:merged.source==='http'?'http':'mock', animations:typeof merged.animations==='boolean'?merged.animations:true, showStats:typeof merged.showStats==='boolean'?merged.showStats:true, autoDemo:typeof merged.autoDemo==='boolean'?merged.autoDemo:true, refreshSeconds:Number.isFinite(merged.refreshSeconds)?Math.min(3600,Math.max(5,Math.round(merged.refreshSeconds))):60, threshold:Number.isFinite(merged.threshold)?Math.min(999,Math.max(1,Math.round(merged.threshold))):8, windowSize:['compact','normal','large'].includes(merged.windowSize)?merged.windowSize:'normal',windowMode:['normal','borderless','desktop'].includes(merged.windowMode)?merged.windowMode:'normal',endpoint:typeof merged.endpoint==='string'?merged.endpoint:''}
}
export const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}.png`
