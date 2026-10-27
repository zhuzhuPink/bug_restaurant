const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function checkStreet() {
  const c = {}; vm.createContext(c);
  for (const f of ['layout', 'street', 'walking', 'model']) vm.runInContext(fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8'), c);
  const { Junction, lanes, road } = c.BistroStreet;
  const junction = new Junction(), phases = new Set();
  let redStops = 0, greens = 0, clearCars = 0;
  for (let i = 0; i < 12000; i++) {
    const before = new Map(junction.cars.filter(car => car.active).map(car => [car.id, { ...car }]));
    junction.tick(.025, 10); const state = junction.snapshot(), lights = state.signal;
    phases.add(lights.phase);
    assert.ok(!(lights.horizontal === 'green' && lights.vertical === 'green'));
    if (lights.pedestrian === 'green') assert.equal(lights.horizontal + lights.vertical, 'redred');
    for (const car of state.cars) {
      const old = before.get(car.id), stop = lanes[car.lane].crossing - road.stop;
      if (old?.lane !== car.lane || old.progress > car.progress) continue;
      if (old.progress <= stop + 1e-6 && car.progress > stop + 1e-6) { assert.equal(lights[car.road], 'green', '车辆仅能绿灯越过停车线'); greens++; }
      if (car.stopped && Math.abs(car.progress - stop) < 1e-6) redStops++;
      if (lights.pedestrian === 'green') assert.ok(car.progress <= stop + 1e-6 || car.progress >= lanes[car.lane].crossing + road.stop, '行人绿灯前必须清空车道');
      if (lights[car.road] !== 'green' && old.progress > stop + 1e-6 && car.progress > old.progress) clearCars++;
    }
  }
  assert.equal(phases.size, 8); assert.ok(redStops > 0 && greens > 0 && clearCars > 0);
  const jam = new Junction(); jam.phase = 7; jam.elapsed = 1;
  for (let i = 0; i < 200; i++) jam.tick(.025, 10, [{ x: -14, z: 7.8 }]);
  assert.equal(jam.lights().phase, 'walk-clear', '行人未清空不得因计时到点放车');
  jam.tick(.025, 10, []); assert.equal(jam.lights().phase, 'horizontal');
  console.log('通过：八段信号周期、红灯停车、绿灯放行、黄灯清空、行人独立相位及占用清空保护');
  const model = new c.BistroModel({ seed: false }); model.auto = false; model.setLimits({ vehicles: 10 });
  // 使用真正的行走控制器穿越北侧斑马线，覆盖灯变红时仍在过街的情况。
  for (let i = 0; i < 5; i++) {
    const id = 'CROSS-' + i;
    model.walking.add(id, [-10.8 + i * .9, 7.8]);
    model.walking.follow(id, [[-11.25, 7.8], [-16.75, 7.8], [-22 - i * .9, 7.8]], 1.1);
  }
  let waits = 0, entries = 0, inRoadOnRed = false;
  for (let i = 0; i < 7000; i++) {
    const before = new Map([...model.walking.actors].map(([id, a]) => [id, { x: a.x, z: a.z }]));
    model.tick(.025); const traffic = model.street.snapshot();
    for (const [id, a] of model.walking.actors) {
      if (!id.startsWith('CROSS-')) continue;
      const old = before.get(id), crossing = model.street.crossing(a);
      if (crossing && !model.street.crossing(old)) { assert.equal(traffic.signal.pedestrian, 'green', '行人红灯不得进入道路'); entries++; }
      if (!a.moving && !a.arrived && traffic.signal.pedestrian === 'red') waits++;
      if (crossing && traffic.signal.pedestrian === 'red') inRoadOnRed = true;
      if (crossing) assert.ok(Math.abs(a.z - 7.8) <= .58, '过街必须保持在斑马线范围内');
      for (const car of traffic.cars) {
        const half = car.road === 'horizontal' ? [.85, .5] : [.5, .85];
        assert.ok(Math.abs(a.x - car.position[0]) >= half[0] + .36 || Math.abs(a.z - car.position[2]) >= half[1] + .36, '人车不可重叠');
      }
    }
  }
  assert.equal(entries, 5); assert.ok(waits > 0 && inRoadOnRed);
  for (const [id, a] of model.walking.actors) if (id.startsWith('CROSS-')) assert.ok(a.arrived, '所有行人最终完成过街');
  const single = new c.BistroModel({ seed: false }); single.auto = false; single.addOrder(); single.tick(3);
  const paused = JSON.stringify(single.street.snapshot()); single.paused = true; single.tick(50); assert.equal(JSON.stringify(single.street.snapshot()), paused);
  single.paused = false; single.street.enabled = false; single.tick(3); assert.equal(JSON.stringify(single.street.snapshot()), paused);
  single.street.enabled = true; single.tick(1); assert.notEqual(JSON.stringify(single.street.snapshot()), paused);
  console.log('通过：五名真实行人红灯等候、绿灯过街、未走完延迟放车、全程人车不重叠及暂停/关闭冻结');
}
if (require.main === module) checkStreet();
module.exports = { checkStreet };
