'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
function load() {
  const context = {}; vm.createContext(context);
  for (const file of ['layout.js', 'street.js', 'walking.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  return context;
}
function checkWalking() {
  const { BistroWalking: Walking, BistroModel: Model, BistroLayout: L } = load();
  const trials = [
    { name: '迎面相遇', agents: [['a',[-3,2],[3,2]],['b',[3,2],[-3,2]]] },
    { name: '交叉相遇', agents: [['a',[-3,2],[3,2]],['b',[0,-1],[0,5]]] },
    { name: '同向跟随', agents: [['a',[-3,2],[3,2]],['b',[-4.1,2],[3,3]]] },
    { name: '绕过静止人物', agents: [['a',[-3,2],[3,2]],['b',[0,2],null]] },
    { name: '窄门相向', agents: [['a',[.55,4.5],[.55,8.65]],['b',[.55,8.65],[.55,4.5]]] }
  ];
  for (const trial of trials) {
    const walking = new Walking({ walkable: trial.name === '窄门相向' ? L.walkable : () => true, gate: trial.name === '窄门相向' });
    for (const [id,start,end] of trial.agents) { walking.add(id,start); if(end) walking.follow(id,[start,end],2); }
    let lateral = 0;
    for(let i=0;i<1600;i++) {
      const before=trial.agents.map(([id])=>walking.pose(id)); walking.tick(.025);
      const poses=trial.agents.map(([id])=>walking.pose(id));
      assert.ok(Math.hypot(poses[0].x-poses[1].x,poses[0].z-poses[1].z)>=.72-1e-6,trial.name+' 不得穿模');
      poses.forEach((p,j)=>{ assert.ok(Math.hypot(p.x-before[j].x,p.z-before[j].z)<=.05001,trial.name+' 不得瞬移'); });
      lateral=Math.max(lateral,Math.abs(poses[0].z-2));
    }
    for(const [id,,end] of trial.agents) if(end) assert.equal(walking.pose(id).arrived,true,trial.name+' 不得死锁');
    if(trial.name==='迎面相遇') assert.ok(lateral>.2,'迎面应有侧移表现');
    console.log('通过：'+trial.name+'保持间距、连续移动且最终到达');
  }
  for (let table = 0; table < L.tables.length; table++) for (const side of [0, 1]) for (const avoidance of [true, false]) for (const blocked of [false, true]) {
    if (blocked && !avoidance) continue;
    const seat = L.seat(table, side);
    const walking = new Walking({ walkable: L.walkable, gate: true, avoidance });
    walking.add('guest', L.queue(0));
    if (blocked) walking.add('blocker', seat.approach);
    const checkBacks = pose => {
      for (let t = 0; t < L.tables.length; t++) for (const facing of [0, 1]) {
        const chair = L.seat(t, facing).point;
        const dx = pose.x - chair[0], dz = pose.z - chair[1];
        const across = facing === 0 ? dx : -dz, forward = facing === 0 ? dz : dx;
        assert.ok(!(Math.abs(across) < .53 && forward > -.515 && forward < -.035), `${table + 1}桌方向${side} 不得穿椅背`);
      }
    };
    for (const path of [L.entrance(0, table, side), [seat.point, seat.approach], L.exit(table, side)]) {
      walking.follow('guest', path, 3.2);
      for (let step = 0; step < 2400 && !walking.pose('guest').arrived; step++) {
        const before = walking.pose('guest'); walking.tick(.025);
        const after = walking.pose('guest');
        if (walking.actors.has('blocker')) assert.ok(Math.hypot(after.x - seat.approach[0], after.z - seat.approach[1]) >= .72, '椅侧有人时应避让');
        for (let sample = 0; sample <= 8; sample++) checkBacks({ x: before.x + (after.x - before.x) * sample / 8, z: before.z + (after.z - before.z) * sample / 8 });
      }
      assert.ok(walking.pose('guest').arrived, `${table + 1}桌方向${side}（避让${avoidance}、椅侧阻挡${blocked}）必须完成侧面进出`);
      walking.remove('blocker');
    }
  }
  console.log('通过：四桌两种方向的正常/椅侧有人/关闭避让均完成进出，全程不穿椅背');
  const model=new Model({seed:false,seats:1});model.auto=false;
  model.addOrder('占用桌位');model.tick(6);model.chef.elapsed=-1000;model.tick(24);
  model.addOrder('候位来客');const id=model.guests.at(-1).id;
  let seen=false,previous=model.snapshot().guests.find(g=>g.id===id).pose;
  for(let i=0;i<1600;i++) {
    model.tick(.025);const g=model.snapshot().guests.find(g=>g.id===id);
    assert.ok(Math.hypot(g.pose.x-previous.x,g.pose.z-previous.z)<=.08001,'候位切换不得瞬移');
    if(g.phase==='queued'){seen=true;const target=L.queue(g.slot);assert.ok(Math.hypot(g.pose.x-target[0],g.pose.z-target[1])<1e-6,'候位必须留在候位点');}
    previous=g.pose;
  }
  assert.ok(seen,'必须实际覆盖满桌候位');
  model.paused=true;const paused=JSON.stringify(model.snapshot());model.tick(50);assert.equal(JSON.stringify(model.snapshot()),paused);
  console.log('通过：满桌候位不消失、所有阶段坐标连续、暂停冻结');
  const busy = new Model({ seed: false }); busy.auto = false; busy.setLimits({ waiting: 6 });
  for (let i = 0; i < 12; i++) busy.addOrder('连续性压力 ' + i);
  let minGap = Infinity, maxStep = 0, yielded = false;
  let previousActors = new Map();
  for (let i = 0; i < 9600; i++) {
    busy.tick(.025);
    const actors = [...busy.walking.actors.entries()];
    for (const [id, a] of actors) {
      if (previousActors.has(id)) maxStep = Math.max(maxStep, Math.hypot(a.x - previousActors.get(id).x, a.z - previousActors.get(id).z));
      assert.ok(L.walkable(a.x, a.z), '人物必须留在可通行区域');
      yielded ||= a.yielding;
    }
    for (let j = 0; j < actors.length; j++) for (let k = j + 1; k < actors.length; k++) {
      minGap = Math.min(minGap, Math.hypot(actors[j][1].x - actors[k][1].x, actors[j][1].z - actors[k][1].z));
    }
    const snapshot = busy.snapshot();
    for (const [id, staff, target] of [['runner', snapshot.runner, L.supply.at(-1)], ['waiter', snapshot.waiter, snapshot.waiter.seat === null ? null : L.delivery(snapshot.waiter.seat, snapshot.waiter.side).at(-1)]]) {
      if (staff.phase === 'putdown') assert.ok(Math.hypot(staff.pose.x - target[0], staff.pose.z - target[1]) < 1e-6, id + ' 到达后才可交接');
    }
    for (const o of snapshot.orders) if (o.servedAt !== null) assert.ok(o.closedAt <= o.servedAt, '业务完成不依赖用餐展示');
    previousActors = new Map(actors.map(([id, a]) => [id, { x: a.x, z: a.z }]));
    if (i === 4000) busy.setLimits({ waiting: 0 });
  }
  assert.ok(minGap >= .72 - 1e-6, '顾客与两位服务员、厨师的全程间距');
  assert.ok(maxStep <= .08001, '进出、坐下、起身、所有交接及阶段切换不得瞬移');
  assert.ok(yielded); assert.equal(busy.orders.filter(o => o.delivery === 'done').length, 12, '十二份餐点必须全部展示，不得永久堵塞');
  assert.equal(busy.guests.length, 0, '全部顾客应从门口走出画面');
  console.log(`通过：240 秒逐步验证全部人物间距（最小 ${minGap.toFixed(3)}）、连续性、交接到达及十二单完整离店`);
  const fallback = new Model({ seed: false, avoidance: false }); fallback.auto = false; fallback.addOrder(); fallback.tick(50);
  assert.equal(fallback.orders[0].delivery, 'done', '关闭避让仍可完成展示');
  for (const speed of [.5, 1, 2]) {
    const timed = new Model({ seed: false }); timed.auto = false; timed.speed = speed; timed.addOrder(); timed.tick(2 / speed);
    const standard = new Model({ seed: false }); standard.auto = false; standard.addOrder(); standard.tick(2);
    assert.equal(JSON.stringify(timed.snapshot().guests), JSON.stringify(standard.snapshot().guests), '倍速应统一作用于人物位置');
  }
  console.log('通过：避让关闭兜底、0.5/1/2 倍速位置一致');
  return true;
}
if(require.main===module) checkWalking();
module.exports={checkWalking};
