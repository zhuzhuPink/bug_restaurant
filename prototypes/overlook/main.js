import { Restaurant } from './scene.js';
import { connectDesktop } from './desktop-client.js';
import { fitViewport } from './viewport.js';

// Two disposable camera variants on the same scene; the Mock model owns both delivery workers.
const $ = id => document.getElementById(id);
const variants = ['angled', 'front'];
function scaleViewport() {
  const view = fitViewport(innerWidth, innerHeight);
  const style = document.documentElement.style;
  style.setProperty('--view-scale', view.scale);
  style.setProperty('--desktop-width', `${view.width}px`);
  style.setProperty('--desktop-height', `${view.height}px`);
}
scaleViewport();
window.addEventListener('resize', scaleViewport);
const names = { todo: '等待备料', cooking: '正在烹饪', ready: '等待上菜', closed: '本轮已完成' };
const model = new globalThis.BistroModel();
let restaurant, filter, focusBefore, last = performance.now(), lastDraw = 0, lastUi = 0, dirty = true;
const format = time => `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;

function reset() {
  model.reset();
  model.tick(20);
  for (let i = 0; i < 3; i++) model.addOrder();
  dirty = true;
}

function list(snapshot) {
  const orders = snapshot.orders.filter(order => typeof filter === 'number' ? order.seat === filter
    : filter?.startsWith('bug:') ? order.id === filter.slice(4)
    : filter === 'ready' ? ['waiting', 'serving'].includes(order.delivery) : order.status === filter);
  $('orders').replaceChildren();
  if (!orders.length) {
    const p = document.createElement('p');
    p.className = 'empty'; p.textContent = '这里暂时没有 Bug，小店可以歇一会儿。';
    $('orders').append(p);
  }
  for (const order of orders) {
    const row = document.createElement('article'); row.className = 'order';
    const id = document.createElement('small'); id.textContent = order.id;
    const status = document.createElement('small'); status.className = 'status'; status.textContent = names[order.status] + (order.delivery === 'waiting' || order.delivery === 'serving' ? ' · 等待上餐展示' : order.delivery === 'eating' ? ' · 正在用餐' : '');
    const title = document.createElement('b'); title.textContent = order.title;
    const time = document.createElement('small'); time.textContent = `来单 ${format(order.createdAt)}${order.closedAt === null ? '' : ` · 已完成 ${format(order.closedAt)}`}`;
    if (order.servedAt !== null) time.textContent += ` · 已上桌 ${format(order.servedAt)}`;
    row.append(id, status, title, time); $('orders').append(row);
  }
}

function open(value) {
  filter = value; focusBefore = document.activeElement;
  $('panel-title').textContent = typeof value === 'number' ? `${value + 1} 号桌 · Bug 记录` : value.startsWith('bug:') ? '本次餐点 · Bug 明细' : names[value];
  $('veil').hidden = false; list(model.snapshot()); $('close').focus();
}

function close() {
  $('veil').hidden = true; focusBefore?.focus();
}

function ui(s = model.snapshot()) {
  for (const key of Object.keys(names)) $('count-' + key).textContent = s.counts[key];
  $('opening').textContent = s.paused ? '小店休息中' : '小店营业中';
  $('pause').textContent = s.paused ? '▷ 继续' : 'Ⅱ 暂停';
  $('auto').firstChild.textContent = s.auto ? '自动来单 ' : '停止来单 ';
  $('auto').setAttribute('aria-pressed', String(s.auto));
  $('speed').textContent = `${s.speed}× 速度`;
  $('clock').textContent = `${format(s.time)} / 模拟营业`;
  $('log').replaceChildren();
  for (const event of s.events.slice(-2).reverse()) {
    const row = document.createElement('div'), time = document.createElement('time');
    time.textContent = format(event.time);
    row.append(time, document.createTextNode(event.text)); $('log').append(row);
  }
  $('waiting-value').textContent = `${s.limits.waiting} 人`;
  $('vehicle-value').textContent = `${s.limits.vehicles} 辆`;
  $('waiting-current').textContent = `候位 ${s.guests.filter(g => g.phase === 'queued').length} 人 / 顾客共 ${s.guests.length} 人 · 总目标上限 ${4 + s.limits.waiting}`;
  $('vehicle-current').textContent = `当前 ${restaurant?.traffic.inspect().active || 0} 辆 / 两路共用上限 ${s.limits.vehicles} 辆`;
  $('arrival-toast').hidden = s.mergedArrivals === 0;
  $('arrival-toast').textContent = `新增 Bug +${s.mergedArrivals} · 已合并来客提示`;
  if (!$('veil').hidden) list(s);
}

try {
  restaurant = new Restaurant($('scene'), $('labels'));
  $('scene').dataset.ready = 'true';
} catch (error) {
  $('fallback').hidden = false;
  $('scene').dataset.ready = 'error';
  console.error('餐馆 3D 场景初始化失败：', error);
}
reset(); ui();
document.querySelectorAll('[data-filter]').forEach(button => { button.onclick = () => open(button.dataset.filter); });
$('close').onclick = close;
$('veil').onclick = event => { if (event.target === $('veil')) close(); };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (!$('veil').hidden) close(); $('settings-panel').hidden = true; setPreview(false); }
  if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.target.closest('input, textarea, select, [contenteditable]') && $('veil').hidden) { setView(variants[(restaurant.cameraIndex + 1) % 2]); }
  if (event.key === 'Tab' && !$('veil').hidden) { event.preventDefault(); $('close').focus(); }
});
for (const [id, action] of Object.entries({
  add: () => model.addOrder(),
  pause: () => { model.paused = !model.paused; },
  auto: () => { model.auto = !model.auto; },
  speed: () => { model.speed = model.speed === 1 ? 2 : model.speed === 2 ? .5 : 1; },
  reset
})) $(id).onclick = () => { action(); dirty = true; ui(); };
function setView(variant) {
  const index = variants.indexOf(variant);
  if (index < 0 || !restaurant) return;
  restaurant.setCamera(index);
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === variant)));
  $('view-tag').textContent = index === 0 ? '斜摆视角 · 街区外景' : '摆正视角 · 保留立面';
  const url = new URL(location.href); url.searchParams.set('variant', variant); history.replaceState(null, '', url);
  dirty = true;
}
function setPreview(enabled) {
  document.body.classList.toggle('preview', enabled);
  $('preview').setAttribute('aria-pressed', String(enabled));
  $('exit-preview').hidden = !enabled;
  if (enabled) $('settings-panel').hidden = true;
}
document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => setView(button.dataset.view); });
$('camera').onclick = () => setView(variants[(restaurant.cameraIndex + 1) % 2]);
$('home').onclick = () => setView('angled');
$('preview').onclick = () => setPreview(true);
$('exit-preview').onclick = () => setPreview(false);
setView(new URLSearchParams(location.search).get('variant') || 'angled');
$('show-exterior').onchange = event => { if (restaurant) restaurant.exterior.visible = event.target.checked; model.street.enabled = Boolean(restaurant?.exterior.visible && restaurant?.animated); dirty = true; };
$('settings').onclick = () => { $('settings-panel').hidden = !$('settings-panel').hidden; };
$('animate').onchange = event => { if (restaurant) restaurant.animated = event.target.checked; model.street.enabled = Boolean(restaurant?.exterior.visible && restaurant?.animated); dirty = true; };
$('show-stats').onchange = event => { document.querySelector('.stats').hidden = !event.target.checked; };
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { $('clock').textContent = '请使用窗口最大化查看'; }
};
for (const [id, key] of [['waiting-limit', 'waiting'], ['vehicle-limit', 'vehicles']]) {
  $(id).oninput = event => { model.setLimits({ [key]: Number(event.target.value) }); dirty = true; ui(); };
}
document.addEventListener('fullscreenchange', () => {
  document.body.classList.toggle('fullscreen-mode', Boolean(document.fullscreenElement));
  dirty = true;
});
$('scene-settings').onclick = () => $('settings').click();
$('scene-fullscreen').onclick = () => $('fullscreen').click();
$('stage').onclick = event => {
  const bubble = event.target.closest('[data-bug]');
  if (bubble) { open('bug:' + bubble.dataset.bug); return; }
  if (event.target.closest('[data-filter]')) return;
  const hit = restaurant?.hit(event.clientX, event.clientY);
  if (hit !== null && hit !== undefined) open(hit);
};
$('stage').onpointermove = event => {
  if (event.target.closest('[data-bug]')) return;
  const hit = restaurant?.hit(event.clientX, event.clientY);
  $('scene').style.cursor = hit === null || hit === undefined ? 'default' : 'pointer';
};
new ResizeObserver(() => { dirty = true; }).observe($('stage'));
document.addEventListener('visibilitychange', () => { last = performance.now(); dirty = true; });

function frame(now) {
  const dt = Math.min(Math.max(0, (now - last) / 1000), .1); last = now;
  if (!document.hidden) {
    model.tick(dt);
    if (restaurant && (dirty || !model.paused) && now - lastDraw >= (restaurant.animated ? 1000 / 30 : 200)) {
      restaurant.render(model.snapshot()); lastDraw = now; dirty = false;
    }
    if (now - lastUi > 250) { ui(); lastUi = now; }
  }
  requestAnimationFrame(frame);
}
// Read-only state and deterministic Mock controls for local acceptance checks.
globalThis.demo = {
  snapshot: () => model.snapshot(),
  configure: values => { model.setLimits(values); $('waiting-limit').value = model.limits.waiting; $('vehicle-limit').value = model.limits.vehicles; dirty = true; ui(); },
  pause: () => { model.paused = true; dirty = true; ui(); },
  reset: () => { reset(); ui(); },
  advance: seconds => {
    const paused = model.paused; model.paused = false; model.tick(seconds); model.paused = paused;
    restaurant?.render(model.snapshot()); ui(); return model.snapshot();
  },
  inspect: () => restaurant?.inspect(),
  point: (x, y, z) => restaurant?.project(x, y, z),
  info: () => ({ camera: restaurant?.cameraIndex, cameraPosition: restaurant?.camera.position.toArray(), cameraUp: restaurant?.camera.up.toArray(), renderer: restaurant?.renderer.info.render, animated: restaurant?.animated, exterior: restaurant?.exterior.visible, preview: document.body.classList.contains('preview') })
};
requestAnimationFrame(frame);

if (restaurant) connectDesktop({model,restaurant,ui,setView,dirty:()=>{dirty=true;}}).catch(error=>console.error('原生界面初始化失败：',error));
