import { Restaurant } from './scene.js';

// Two disposable camera variants on the same scene; the Mock model owns both delivery workers.
const $ = id => document.getElementById(id);
const variants = ['angled', 'front'];
function scaleViewport() {
  document.documentElement.style.setProperty('--view-scale', Math.min(innerWidth / 1600, innerHeight / 900));
}
scaleViewport();
window.addEventListener('resize', scaleViewport);
const names = { todo: '等待备料', cooking: '正在烹饪', ready: '等待上菜', closed: '本轮已上桌' };
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
  const orders = snapshot.orders.filter(order => typeof filter === 'number' ? order.seat === filter : order.status === filter);
  $('orders').replaceChildren();
  if (!orders.length) {
    const p = document.createElement('p');
    p.className = 'empty'; p.textContent = '这里暂时没有 Bug，小店可以歇一会儿。';
    $('orders').append(p);
  }
  for (const order of orders) {
    const row = document.createElement('article'); row.className = 'order';
    const id = document.createElement('small'); id.textContent = order.id;
    const status = document.createElement('small'); status.className = 'status'; status.textContent = names[order.status];
    const title = document.createElement('b'); title.textContent = order.title;
    const time = document.createElement('small'); time.textContent = `来单 ${format(order.createdAt)}${order.closedAt === null ? '' : ` · 已上桌 ${format(order.closedAt)}`}`;
    row.append(id, status, title, time); $('orders').append(row);
  }
}

function open(value) {
  filter = value; focusBefore = document.activeElement;
  $('panel-title').textContent = typeof value === 'number' ? `${value + 1} 号桌 · Bug 记录` : names[value];
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
$('home').onclick = () => setView('front');
$('preview').onclick = () => setPreview(true);
$('exit-preview').onclick = () => setPreview(false);
setView(new URLSearchParams(location.search).get('variant') || 'front');
$('show-exterior').onchange = event => { if (restaurant) restaurant.exterior.visible = event.target.checked; dirty = true; };
$('settings').onclick = () => { $('settings-panel').hidden = !$('settings-panel').hidden; };
$('animate').onchange = event => { if (restaurant) restaurant.animated = event.target.checked; dirty = true; };
$('show-stats').onchange = event => { document.querySelector('.stats').hidden = !event.target.checked; };
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { $('clock').textContent = '请使用窗口最大化查看'; }
};
$('scene-settings').onclick = () => $('settings').click();
$('scene-fullscreen').onclick = () => $('fullscreen').click();
$('stage').onclick = event => {
  if (event.target.closest('[data-filter]')) return;
  const hit = restaurant?.hit(event.clientX, event.clientY);
  if (hit !== null && hit !== undefined) open(hit);
};
$('stage').onpointermove = event => {
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
