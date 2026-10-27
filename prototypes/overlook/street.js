(function (root) {
  'use strict';
  const road = { x: -14, z: 11, width: 4.6, crossing: 3.2, stripeWidth: 1.2, stop: 5.3 };
  const lanes = [
    { road: 'horizontal', direction: 1, fixed: 9.85, crossing: 14, angle: 0 },
    { road: 'vertical', direction: 1, fixed: -15.1, crossing: 39, angle: -Math.PI / 2 },
    { road: 'horizontal', direction: -1, fixed: 12.05, crossing: 42, angle: Math.PI },
    { road: 'vertical', direction: -1, fixed: -12.9, crossing: 17, angle: Math.PI / 2 }
  ];
  const phases = [
    ['horizontal', 8], ['horizontal-yellow', 2], ['horizontal-clear', 1],
    ['vertical', 8], ['vertical-yellow', 2], ['vertical-clear', 1],
    ['walk', 6], ['walk-clear', 1]
  ];
  const SPEED = 2.8, GAP = 3.1;
  class Junction {
    constructor() {
      this.enabled = true; this.clock = 0; this.elapsed = 0; this.phase = 0;
      this.cars = []; this.nextSpawn = 0; this.nextLane = 0;
    }
    lights() {
      const name = phases[this.phase][0];
      return { phase: name, horizontal: name === 'horizontal' ? 'green' : name === 'horizontal-yellow' ? 'yellow' : 'red',
        vertical: name === 'vertical' ? 'green' : name === 'vertical-yellow' ? 'yellow' : 'red', pedestrian: name === 'walk' ? 'green' : 'red' };
    }
    crossing(a) { return a.x > road.x - 2.7 && a.x < road.x + 2.7 && Math.abs(a.z - (road.z - road.crossing)) < 1; }
    walkable(x, z, actor) {
      if (x <= road.x - 2.7 || x >= road.x + 2.7) return true;
      if (Math.abs(z - (road.z - road.crossing)) > road.stripeWidth / 2 - .02) return false;
      return this.lights().pedestrian === 'green' || Boolean(actor && this.crossing(actor));
    }
    canMove(a) {
      const goal = a.detour[0] || a.path[a.index];
      if (!goal || this.crossing(a) || this.lights().pedestrian === 'green') return true;
      const east = a.x >= road.x + 2.7 && a.x <= road.x + 3.2 && goal.x < road.x + 2.7;
      const west = a.x <= road.x - 2.7 && a.x >= road.x - 3.2 && goal.x > road.x - 2.7;
      return !(east || west);
    }
    tick(dt, target, walkers = []) {
      if (!this.enabled) return;
      this.clock += dt; this.elapsed += dt;
      const name = phases[this.phase][0];
      // 清空相位不按超时强行放行：已进入路口的车辆、行人必须先走完。
      const occupied = this.cars.some(c => c.active && c.progress > lanes[c.lane].crossing - road.stop + 1e-6 && c.progress < lanes[c.lane].crossing + road.stop) || walkers.some(a => this.crossing(a));
      if (this.elapsed >= phases[this.phase][1] - 1e-9 && (!name.endsWith('clear') || !occupied)) {
        this.phase = (this.phase + 1) % phases.length; this.elapsed = 0;
      }
      const lights = this.lights(), travel = SPEED * dt;
      for (let index = 0; index < lanes.length; index++) {
        const lane = lanes[index], cars = this.cars.filter(c => c.active && c.lane === index).sort((a, b) => b.progress - a.progress);
        let leader = Infinity;
        for (const car of cars) {
          const stop = lane.crossing - road.stop;
          let next = Math.min(car.progress + travel, leader - GAP);
          if (lights[lane.road] !== 'green' && car.progress <= stop + 1e-6) next = Math.min(next, stop);
          car.stopped = next < car.progress + travel - 1e-6;
          car.progress = Math.max(car.progress, next); leader = car.progress;
          if (car.progress > 56) car.active = false;
        }
      }
      if (this.cars.filter(c => c.active).length >= target || this.clock < this.nextSpawn) return;
      for (let offset = 0; offset < lanes.length; offset++) {
        const lane = (this.nextLane + offset) % lanes.length;
        if (this.cars.some(c => c.active && c.lane === lane && c.progress < GAP)) continue;
        let car = this.cars.find(c => !c.active);
        if (!car && this.cars.length < 10) { car = { id: this.cars.length }; this.cars.push(car); }
        if (!car) return;
        Object.assign(car, { active: true, lane, progress: 0, stopped: false });
        this.nextLane = (lane + 1) % lanes.length; this.nextSpawn = this.clock + .85;
        break;
      }
    }
    snapshot() {
      return { clock: this.clock, signal: this.lights(), active: this.cars.filter(c => c.active).length, allocated: this.cars.length,
        cars: this.cars.filter(c => c.active).map(c => {
          const lane = lanes[c.lane], along = lane.direction * (c.progress - 28);
          return { id: c.id, lane: c.lane, road: lane.road, direction: lane.direction, angle: lane.angle, progress: c.progress, stopped: c.stopped,
            position: [lane.road === 'horizontal' ? along : lane.fixed, -.69, lane.road === 'vertical' ? along : lane.fixed] };
        }) };
    }
  }
  root.BistroStreet = { road, lanes, Junction };
})(globalThis);
