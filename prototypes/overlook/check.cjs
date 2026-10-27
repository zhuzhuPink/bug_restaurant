'use strict';
const { chromium } = require('../../node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'qa');
fs.mkdirSync(output, { recursive: true });
const results = { checks: [], errors: [], screenshots: [] };
const pass = name => { results.checks.push(name); console.log('通过：' + name); };
const { spawn } = require('node:child_process');
const server = spawn(process.execPath, [path.join(__dirname, '../../node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5183', '--strictPort'], { cwd: __dirname, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => server.kill());
(async () => {
  require('./walking-check.cjs').checkWalking();
  pass('人物连续行走、避让与椅侧进出九组专项回归');
  await require('./environment-check.cjs').checkEnvironment();
  require('./street-check.cjs').checkStreet();
  pass('门口、长椅、道路几何与人车红绿灯专项回归');
  checkModel();
  await checkTraffic();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('本地验收服务启动超时')), 15000);
    server.stdout.on('data', chunk => { if (chunk.toString().includes('Local:')) { clearTimeout(timer); resolve(); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('本地验收服务退出：' + code)); });
  });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => results.errors.push(error.message));
    await page.goto('http://127.0.0.1:5183/');
    await page.waitForFunction(() => document.querySelector('canvas').dataset.ready === 'true' && window.demo?.info().renderer.calls > 0);
    await page.evaluate(() => demo.pause());
    await page.locator('[data-view=angled]').click();
    await page.waitForTimeout(400);
    pass('本地 HTTP 启动与 WebGL 实际渲染');

    await page.screenshot({ path: path.join(output, 'overview.png'), fullPage: true });
    results.screenshots.push('overview.png');
    const time = await page.evaluate(() => demo.snapshot().time);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => demo.snapshot().time), time);
    pass('暂停冻结模拟时间与角色动画');
    let state = await page.evaluate(() => demo.snapshot());
    assert.equal(state.counts.todo + state.counts.cooking + state.counts.closed, state.orders.length);
    pass('业务状态总数与全部订单一致，待上餐是独立展示子集');
    await page.locator('#add').click();
    assert.equal((await page.evaluate(() => demo.snapshot().orders.length)), state.orders.length + 1);
    pass('新增模拟 Bug');
    const geometry = await page.evaluate(() => demo.inspect());
    assert.ok(geometry.room.width * geometry.room.depth > 17.1 * 12.5 * 1.25);
    assert.equal(geometry.tables.length, 4);
    assert.equal(geometry.chairs.length, 8);
    assert.ok(geometry.pass.position[0] - geometry.pass.width / 2 - Math.max(...geometry.tables.map(table => table[0] + .94)) > 2.8);
    assert.ok(geometry.tables[1][2] - geometry.tables[0][2] >= 4.5);
    assert.ok(geometry.tables[2][0] - geometry.tables[1][0] >= 4 - 1e-6);
    geometry.chairs.forEach((chair, index) => {
      const table = geometry.tables[Math.floor(index / 2)];
      const dx = table[0] - chair.position[0], dz = table[2] - chair.position[2];
      assert.ok(Math.sin(chair.rotation) * dx + Math.cos(chair.rotation) * dz > 0, '椅子必须面向对应餐桌');
    });
    pass('场地再扩约三成、四桌布局、出餐通道净距大于 2.8、全部椅子面朝餐桌');
    for (let i = 0; i < 5; i++) {
      const geometry = await page.evaluate(() => { demo.advance(.1); return demo.inspect(); });
      assert.equal(geometry.toolAttached, true);
      assert.ok(geometry.gripDistance < 1e-6, '锅铲握持原点须始终与手重合');
      assert.equal(geometry.flames.visible, true);
      assert.equal(geometry.flames.count, 24);
    }
    pass('厨师动作各帧手与锅铲持续相连，两个炉头均有火焰');
    const transport = await page.evaluate(() => {
      let previous = demo.inspect().runner.position;
      let maxStep = 0, carried = 0, emptyReturn = 0;
      const phases = new Set();
      for (let i = 0; i < 30; i++) {
        const state = demo.advance(.4), runner = demo.inspect().runner;
        phases.add(state.runner.phase);
        maxStep = Math.max(maxStep, Math.hypot(runner.position[0] - previous[0], runner.position[2] - previous[2]));
        previous = runner.position;
        if (runner.carrying) {
          if (state.orders.find(order => order.id === state.runner.orderId)?.status !== 'todo') throw new Error('食材未交接就提前开始烹饪');
          carried++;
        }
        if (state.runner.phase === 'return' && !runner.carrying) emptyReturn++;
      }
      demo.reset(); demo.pause(); demo.advance(0);
      return { maxStep, carried, emptyReturn, phases: [...phases] };
    });
    assert.ok(transport.maxStep < .75, '搬运路线及往返交接必须连续，不能瞬移');
    assert.ok(transport.carried > 0 && transport.emptyReturn > 0);
    for (const phase of ['pickup', 'travel', 'putdown', 'return']) assert.ok(transport.phases.includes(phase));
    pass('备料服务员取料、端食材、灶台交接及空手返回连续，搬运中保持等待备料状态');


    for (const key of ['todo', 'cooking', 'ready', 'closed']) {
      await page.locator(`.stat[data-filter="${key}"]`).click();
      assert.equal(await page.locator('.order').count(), Number(await page.locator('#count-' + key).textContent()));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#veil').isVisible(), false);
    }
    pass('全部统计卡、详情列表计数与 Escape 关闭一致');
    // 独立验证家具射线命中，避免上一段上菜气泡或人物遮住桌面测试点。
    await page.evaluate(() => { demo.reset(); demo.pause(); demo.advance(7); });
    for (const [point, title] of [
      [[-6.1, 1.28, -1.45], '1 号桌'], [[-6.1, 1.28, 3.95], '2 号桌'], [[-1.5, 1.28, 3.95], '3 号桌'], [[-1.5, 1.28, -1.45], '4 号桌'],
      [[3, 1.29, .7], '等待上菜'], [[6.62, 2.1, -5.3], '等待备料'], [[6.8, 1.72, .25], '正在烹饪']
    ]) {
      const position = await page.evaluate(xyz => demo.point(...xyz), point);
      await page.mouse.click(position.x, position.y);
      await page.waitForFunction(() => !document.querySelector('#veil').hidden);
      assert.equal(await page.locator('#veil').isVisible(), true, title + ' 应当可点击');
      assert.ok((await page.locator('#panel-title').textContent()).includes(title), title + ' 实际打开：' + await page.locator('#panel-title').textContent());
      await page.keyboard.press('Escape');
    }
    pass('四张餐桌、备菜区、出餐台、灶台的 3D 射线点击');
    for (const variant of ['front', 'angled']) {
      await page.locator(`[data-view="${variant}"]`).click();
      await page.waitForTimeout(250);
      for (const [key, title, point] of [
        ['todo', '等待备料', [3.7, 1.4, -6.1]],
        ['cooking', '正在烹饪', [6.8, 1.72, .25]],
        ['ready', '等待上菜', [3, 1.29, .7]]
      ]) {
        for (const target of ['surface', 'label', 'keyboard']) {
          if (target === 'surface') {
            const position = await page.evaluate(xyz => demo.point(...xyz), point);
            await page.mouse.move(position.x, position.y);
            await page.waitForFunction(() => document.querySelector('#scene').style.cursor === 'pointer');
            await page.mouse.click(position.x, position.y);
          } else {
            const button = page.locator(`#labels [data-filter="${key}"]`);
            if (target === 'keyboard') { await button.focus(); await page.keyboard.press('Enter'); }
            else {
              await page.mouse.move(10, 400);
              const before = await button.boundingBox();
              await button.hover();
              const after = await button.boundingBox();
              assert.ok(Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1, '区域标签悬停时不应跳位');
              await button.click();
            }
          }
          await page.waitForFunction(() => !document.querySelector('#veil').hidden, null, { timeout: 5000 }).catch(async error => {
            console.log('未打开区域', variant, key, target, await page.locator(`#labels [data-filter="${key}"]`).evaluate(el => ({ html:el.outerHTML, handler:el.onclick?.toString(), focus:document.activeElement?.outerHTML.slice(0,200) })));
            await page.screenshot({ path:path.join(output,'click-failure.png') });
            throw error;
          });
          assert.equal(await page.locator('#veil').isVisible(), true, `${variant}/${key}/${target}`);
          assert.equal(await page.locator('#panel-title').textContent(), title);
          const expected = await page.evaluate(key => demo.snapshot().orders.filter(o => key === 'ready' ? ['waiting', 'serving'].includes(o.delivery) : o.status === key).map(o => o.id), key);
          assert.deepEqual(await page.locator('.order > small:first-child').allTextContents(), expected);
          assert.ok((await page.locator('.order .status').allTextContents()).every(status => key === 'ready' ? status.includes('等待上餐展示') : status.startsWith(title)));
          await page.keyboard.press('Escape');
        }
      }
    }
    pass('双视角下三个工作区实体、标签和键盘均打开正确状态与 Bug ID 明细');

    await page.locator('#scene-settings').click();
    await page.locator('#animate').uncheck();
    assert.equal(await page.evaluate(() => demo.info().animated), false);
    assert.equal(await page.evaluate(() => demo.inspect().flames.visible), true);
    const frozen = await page.evaluate(() => { demo.advance(0); return demo.inspect().flames.heights; });
    await page.evaluate(() => demo.advance(.2));
    assert.deepEqual(await page.evaluate(() => demo.inspect().flames.heights), frozen);
    await page.locator('#show-stats').uncheck();
    assert.equal(await page.locator('.stats').isVisible(), false);
    await page.locator('#show-stats').check();
    await page.locator('#animate').check();
    await page.keyboard.press('Escape');
    pass('角色动画开关和统计栏隐藏');
    await page.locator('#speed').click();
    assert.equal(await page.evaluate(() => demo.snapshot().speed), 2);
    await page.locator('#auto').click();
    assert.equal(await page.evaluate(() => demo.snapshot().auto), false);
    await page.locator('#reset').click();
    await page.evaluate(() => demo.pause());
    state = await page.evaluate(() => demo.snapshot());
    assert.equal(state.speed, 1); assert.equal(state.auto, true);
    pass('倍速、自动来单与重置');
    await checkNewVisuals(page);
    await page.locator('#auto').click();
    await page.evaluate(() => demo.advance(180));
    state = await page.evaluate(() => demo.snapshot());
    assert.equal(state.counts.closed, state.orders.length);
    assert.equal(state.counts.todo + state.counts.cooking + state.counts.ready, 0);
    assert.equal(await page.evaluate(() => demo.inspect().flames.visible), false);
    pass('业务完成与上餐展示独立推进，顾客离店与双服务员完整闭环');
    await page.locator('#reset').click(); await page.evaluate(() => demo.pause());
    for (const [variant, index] of [['front', 1], ['angled', 0]]) {
      await page.locator(`[data-view="${variant}"]`).click(); await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => demo.info().camera), index);
      assert.ok(page.url().includes('variant=' + variant));
      assert.equal(await page.locator(`[data-view="${variant}"]`).getAttribute('aria-pressed'), 'true');
      if (index === 1) {
        const camera = await page.evaluate(() => demo.info());
        assert.deepEqual(camera.cameraPosition, [0, 22, 27]);
        assert.deepEqual(camera.cameraUp, [0, 1, 0]);
      }
      await page.screenshot({ path: path.join(output, 'view-' + variant + '.png') });
      results.screenshots.push('view-' + variant + '.png');
    }
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => demo.info().camera), 1);
    await page.reload(); await page.waitForFunction(() => window.demo?.info().renderer.calls > 0);
    assert.equal(await page.evaluate(() => demo.info().camera), 1);
    await page.evaluate(() => demo.pause());
    await page.locator('[data-view=angled]').click();
    await page.locator('#home').click();
    assert.equal(await page.evaluate(() => demo.info().camera), 0);
    pass('摆正视角保留俯角与立面、双视角切换、键盘、URL 持续及斜视角归位');
    await page.locator('#scene-settings').click();
    await page.locator('#show-exterior').uncheck();
    assert.equal(await page.evaluate(() => demo.info().exterior), false);
    await page.locator('#show-exterior').check();
    assert.equal(await page.evaluate(() => demo.info().exterior), true);
    await page.keyboard.press('Escape');
    pass('街区外景可独立开关，不改变餐馆及 Mock 数据');
    for (const [width, height] of [[1920,1080], [1600,900], [1280,720]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => Math.abs(document.querySelector('#scene').getBoundingClientRect().width - innerWidth) < 1 && Math.abs(document.querySelector('#scene').getBoundingClientRect().height - innerHeight) < 1);
      const rect = await page.locator('#scene').boundingBox();
      assert.ok(Math.abs(rect.width - width) < 1 && Math.abs(rect.height - height) < 1);
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, scrollX, scrollY }));
      assert.ok(viewport.scrollWidth === width && viewport.scrollHeight === height, JSON.stringify(viewport));
      for (const variant of ['angled','front']) {
        await page.locator(`[data-view="${variant}"]`).click(); await page.waitForTimeout(100);
        await page.locator('.stat[data-filter="todo"]').click();
        assert.equal(await page.locator('#veil').isVisible(), true);
        await page.keyboard.press('Escape');
        for (const key of ['todo', 'cooking', 'ready']) {
          await page.locator(`#labels [data-filter="${key}"]`).click();
          assert.equal(await page.locator('#veil').isVisible(), true);
          await page.keyboard.press('Escape');
        }
      }
    }
    pass('仅 16:9 电脑：1920×1080、1600×900、1280×720 全屏同比缩放且无滚动条');
    await page.setViewportSize({ width:1600, height:900 });
    for (const variant of ['angled','front']) {
      await page.locator(`[data-view="${variant}"]`).click();
      await page.locator('#preview').click();
      assert.equal(await page.evaluate(() => demo.info().preview), true);
      assert.equal(await page.locator('.stats').isVisible(), false);
      assert.equal(await page.locator('.control-dock').isVisible(), false);
      assert.equal(await page.locator('#exit-preview').isVisible(), true);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(output, 'wallpaper-' + variant + '.png') });
      results.screenshots.push('wallpaper-' + variant + '.png');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => demo.info().preview), false);
    }
    pass('两种视角的纯场景桌面预览及 Esc 安全退出');
    await page.locator('#scene-fullscreen').click(); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
    await page.evaluate(() => document.exitFullscreen());
    pass('全屏按钮进入真实浏览器全屏并可退出');
    assert.deepEqual(results.errors, []);
  } finally { await browser.close(); server.kill(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('验收完成：' + results.checks.length + ' 项');
})().catch(error => {
  server.kill();
  results.errors.push(error.stack);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.error(error); process.exitCode = 1;
});

function checkModel() {
  const sandbox = {};
  const vm = require('node:vm'); vm.createContext(sandbox);
  for (const file of ['layout.js', 'street.js', 'walking.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), sandbox);
  const Model = sandbox.BistroModel;
  const single = new Model({ seed: false }); single.auto = false; single.addOrder();
  single.tick(1.1);
  assert.equal(single.snapshot().runner.phase, 'travel');
  assert.equal(single.snapshot().orders[0].status, 'todo');
  assert.equal(single.snapshot().chef.orderId, null);
  for (let i = 0; i < 400 && single.runner.phase !== 'putdown'; i++) single.tick(.025);
  assert.equal(single.snapshot().runner.phase, 'putdown');
  assert.equal(single.snapshot().orders[0].status, 'todo');
  single.tick(.25);
  assert.equal(single.snapshot().runner.phase, 'return');
  assert.equal(single.snapshot().orders[0].status, 'cooking');
  assert.equal(single.snapshot().chef.orderId, single.orders[0].id);
  single.paused = true;
  const frozen = JSON.stringify(single.snapshot()); single.tick(10);
  assert.equal(JSON.stringify(single.snapshot()), frozen);
  pass('Mock 必须完成食材交接后才能烹饪，暂停冻结搬运阶段');
  const makeBatch = () => {
    const model = new Model({ seed: false }); model.auto = false;
    for (let i = 0; i < 8; i++) model.addOrder();
    return model;
  };
  const batch = makeBatch(); batch.tick(130);
  assert.equal(batch.snapshot().counts.closed, 8);
  assert.equal(new Set(batch.orders.map(order => order.seat)).size, 4);
  assert.equal(batch.snapshot().runner.phase, 'idle');
  const split = makeBatch();
  for (let i = 0; i < 1300; i++) split.tick(.1);
  assert.equal(JSON.stringify(split.orders.map(order => [order.status, order.seat, Math.round(order.closedAt * 1000)])), JSON.stringify(batch.orders.map(order => [order.status, order.seat, Math.round(order.closedAt * 1000)])));
  batch.reset(); assert.equal(batch.seats.length, 4); assert.equal(batch.runner.phase, 'idle');
  pass('四张桌子均能实际接餐，双服务员闭环及大步长与逐帧模拟一致');
  const stress = new Model({ seed: false }); stress.auto = false; stress.setLimits({ waiting: 6 });
  for (let i = 0; i < 100; i++) stress.addOrder('压力测试 ' + i);
  let maxGuests = 0, maxQueue = 0; const sides = new Set(), phases = new Set();
  for (let i = 0; i < 6000; i++) {
    stress.tick(.1); const s = stress.snapshot();
    maxGuests = Math.max(maxGuests, s.guests.length);
    maxQueue = Math.max(maxQueue, s.guests.filter(g => g.phase === 'queued').length);
    const occupied = s.seats.filter(s => s.guestId !== null);
    assert.equal(new Set(occupied.map(s => s.guestId)).size, occupied.length);
    for (const g of s.guests) { phases.add(g.phase); if (g.table !== null) sides.add(g.side); if (['arriving', 'queued', 'entering', 'sitting', 'waiting'].includes(g.phase)) assert.equal(g.orderId, null); }
    if (i === 1200) stress.setLimits({ waiting: 0 });
  }
  assert.ok(maxGuests <= 10); assert.ok(maxQueue <= 6); assert.ok(stress.guests.length <= 4);
  assert.equal(sides.size, 2);
  for (const phase of ['arriving','entering','sitting','waiting','eat','standing','leavingSeat','leaving']) assert.ok(phases.has(phase), phase);
  assert.ok(stress.mergedArrivals > 0);
  pass('百单压力下顾客总量受限、无拼桌、随机方向、完整进出与调低候位自然收敛');
  const independent = new Model({ seed: false }); independent.auto = false;
  independent.setLimits({ waiting: 0 });
  const a = independent.addOrder('长期未完成 A'), b = independent.addOrder('后来先完成 B');
  // Simulate an external completion arriving out of order, without starting the Mock cook.
  b.status = 'closed'; b.closedAt = 0; b.delivery = 'waiting';
  independent.runner.phase = 'waiting'; independent.runner.orderId = a.id;
  independent.chef = { orderId: a.id, elapsed: -1000 };
  independent.tick(40);
  assert.equal(a.status, 'todo'); assert.equal(b.delivery, 'done'); assert.ok(b.servedAt !== null);
  assert.equal(b.closedAt, 0);
  pass('先来未完成 Bug 不锁桌，后完成餐点可以先上，完成时间不等待展示');
  const full = new Model({ seed: false }); full.auto = false;
  for (let i = 0; i < 8; i++) full.addOrder();
  full.tick(130);
  assert.equal(full.orders.filter(o => o.status === 'closed').length, 8);
  assert.ok(full.orders.every(o => o.closedAt <= o.servedAt));
  full.paused = true; const before = JSON.stringify(full.snapshot()); full.tick(60); assert.equal(JSON.stringify(full.snapshot()), before);
  full.reset(); assert.equal(full.limits.waiting, 3);
  pass('Bug 完成与用餐展示分离，暂停冻结全部顾客，重置清理临时关联');

}

async function checkNewVisuals(page) {
  await page.locator('[data-view=front]').click();
  await page.locator('#scene-settings').click();
  assert.equal(await page.locator('#vehicle-limit').getAttribute('max'), '10');
  for (const [id, value, key] of [['waiting-limit', 6, 'waiting'], ['vehicle-limit', 10, 'vehicles'], ['waiting-limit', 0, 'waiting'], ['waiting-limit', 3, 'waiting']]) {
    await page.locator('#' + id).fill(String(value));
    assert.equal(await page.evaluate(key => demo.snapshot().limits[key], key), value);
  }
  await page.keyboard.press('Escape');
  pass('设置界面候位 0～6 人、车辆 0～10 辆即时配置');
  await page.evaluate(() => { for (let i = 0; i < 16; i++) demo.advance(.4); });
  for (const variant of ['front', 'angled']) {
    await page.locator(`[data-view=${variant}]`).click();
    await page.evaluate(() => demo.advance(0));
    const bubbles = await page.evaluate(() => ({ bubbles: demo.inspect().bubbles, orders: demo.snapshot().orders }));
    assert.ok(bubbles.bubbles.length > 0);
    for (const bubble of bubbles.bubbles) assert.equal(bubble.title, bubbles.orders.find(o => o.id === bubble.id).title);
    const first = page.locator('.bug-bubble').first();
    const compact = await first.evaluate(node => {
      const span = node.querySelector('span'), original = span.textContent;
      span.textContent = '这是一个用于检查长名称不会撑大气泡的很长的 Bug 标题';
      const result = { width: node.offsetWidth, height: node.offsetHeight, ellipsis: getComputedStyle(span).textOverflow, clipped: span.scrollWidth > span.clientWidth, caption: getComputedStyle(node.querySelector('small')).display };
      span.textContent = original;
      return result;
    });
    assert.ok(compact.width <= 136 && compact.height <= 30);
    assert.equal(compact.ellipsis, 'ellipsis'); assert.ok(compact.clipped); assert.equal(compact.caption, 'none');
    const title = await first.locator('span').textContent();
    await first.click();
    assert.equal(await page.locator('.order').count(), 1);
    assert.equal(await page.locator('.order b').textContent(), title);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(output, `customers-${variant}.png`) });
    results.screenshots.push(`customers-${variant}.png`);
  }
  pass('双视角紧凑单行气泡、长标题省略、准确关联 Bug 并点击打开独立明细');
  await page.locator('#preview').click();
  assert.ok(await page.locator('.bug-bubble').first().isVisible());
  await page.keyboard.press('Escape');
  pass('桌面预览保留人物餐点气泡');
  const traffic = await page.evaluate(() => {
    for (let i = 0; i < 30; i++) demo.advance(.4);
    return demo.inspect().traffic;
  });
  assert.equal(traffic.active, 10); assert.equal(traffic.allocated, 10);
  assert.ok(traffic.cars.some(c => c.lane === 0) && traffic.cars.some(c => c.lane === 1));
  assert.ok(traffic.cars.some(c => c.road === 'horizontal') && traffic.cars.some(c => c.road === 'vertical'));
  pass('横竖道路共用十辆总额度、双向行驶、车辆资源池有界');
  await page.locator('#scene-settings').click();
  await page.locator('#show-exterior').uncheck();
  const frozen = await page.evaluate(() => { const before = demo.inspect().traffic; demo.advance(4); return { before, after: demo.inspect().traffic }; });
  assert.deepEqual(frozen.after, frozen.before);
  await page.locator('#show-exterior').check();
  await page.locator('#animate').uncheck();
  const stopped = await page.evaluate(() => { const before = demo.inspect().traffic; demo.advance(4); return { before, after: demo.inspect().traffic }; });
  assert.deepEqual(stopped.after, stopped.before);
  await page.locator('#animate').check();
  await page.locator('#vehicle-limit').fill('0');
  assert.equal(await page.evaluate(() => demo.inspect().traffic.active), 10, '调低不能强删车辆');
  await page.keyboard.press('Escape');
  // 模型内部仍按固定步推进；这里只绘制最终帧，避免软件 WebGL 堆积 200 次绘制而饿死动画回调。
  const drained = await page.evaluate(() => { demo.advance(80); return demo.inspect().traffic; });
  assert.equal(drained.active, 0); assert.equal(drained.allocated, 10);
  pass('车辆隐藏/动画关闭冻结，调低上限自然退场，设为零停止补充');
  await page.locator('#reset').click(); await page.evaluate(() => { demo.pause(); demo.configure({ vehicles: 2 }); });
}


async function checkTraffic() {
  await import('./street.js');
  const traffic = new globalThis.BistroStreet.Junction();
  let maximum = 0, stopped = false;
  const crossed = new Set(), previous = new Map();
  for (let i = 0; i < 6000; i++) {
    traffic.tick(.05, 10);
    const current = traffic.snapshot(); maximum = Math.max(maximum, current.active);
    assert.ok(current.active <= 10 && current.allocated <= 10);
    for (const car of traffic.cars.filter(c => c.active)) {
      if (previous.has(car) && previous.get(car).lane === car.lane && previous.get(car).progress <= car.progress) {
        if (Math.abs(previous.get(car).progress - car.progress) < 1e-6) stopped = true;
        const centers = [14, 39, 42, 17];
        if (previous.get(car).progress < centers[car.lane] && car.progress >= centers[car.lane]) crossed.add(car.lane);
      }
      previous.set(car, { lane: car.lane, progress: car.progress });
    }
    for (let a = 0; a < current.cars.length; a++) for (let b = a + 1; b < current.cars.length; b++) {
      const left = current.cars[a], right = current.cars[b];
      const half = car => car.road === 'horizontal' ? [.85, .5] : [.5, .85];
      const la = half(left), rb = half(right);
      assert.ok(Math.abs(left.position[0] - right.position[0]) >= la[0] + rb[0] + .1 || Math.abs(left.position[2] - right.position[2]) >= la[1] + rb[1] + .1, '横竖路口及同车道车身不得重叠');
      if (left.lane === right.lane) assert.ok(Math.hypot(left.position[0] - right.position[0], left.position[2] - right.position[2]) >= 3.1 - 1e-6, '同车道保持安全车距');
    }
  }
  assert.equal(maximum, 10); assert.equal(crossed.size, 4); assert.ok(stopped, '红灯时应有车辆等候');
  const before = traffic.snapshot(); traffic.enabled = false; traffic.tick(100, 10); assert.deepEqual(traffic.snapshot(), before);
  traffic.enabled = true;
  for (let i = 0; i < 1500; i++) traffic.tick(.1, 0);
  assert.equal(traffic.snapshot().active, 0); assert.equal(traffic.snapshot().allocated, 10);
  const defaults = new globalThis.BistroStreet.Junction();
  for (let i = 0; i < 25; i++) defaults.tick(.1, 2);
  assert.equal(defaults.snapshot().active, 2);
  assert.equal(new Set(defaults.snapshot().cars.map(car => car.road)).size, 2);
  pass('横竖四车道五分钟逐帧无碰撞、红绿灯让行、共用额度及默认两路来车');
}
