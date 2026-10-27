(function (root) {
  'use strict';
  const GAP = .74;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // Swept relative motion prevents crossing even when both people move in one tick.
  const closest = (x, z, vx, vz, horizon) => {
    const vv = vx * vx + vz * vz;
    const t = vv ? Math.max(0, Math.min(horizon, -(x * vx + z * vz) / vv)) : 0;
    return Math.hypot(x + vx * t, z + vz * t);
  };
  class BistroWalking {
    constructor({ walkable = () => true, avoidance = true, gate = false, canMove = () => true } = {}) {
      this.actors = new Map(); this.walkable = walkable; this.avoidance = avoidance; this.gate = gate; this.owner = null; this.canMove = canMove;
    }
    add(id, point) {
      this.actors.set(id, { x: point[0], z: point[1], angle: 0, path: [], index: 0, speed: 0, vx: 0, vz: 0, arrived: true, moving: false, yielding: false, stuck: 0, detour: [] });
    }
    remove(id) { if (this.owner === id) this.owner = null; this.actors.delete(id); }
    follow(id, path, speed) {
      const a = this.actors.get(id);
      a.path = path.map(p => ({ x: p[0], z: p[1] })); a.index = 0; a.speed = speed; a.arrived = false;
      a.gate = null; a.detour = []; a.stuck = 0;
      if (this.gate) {
        const crossing = a.path.findIndex((p, i) => i && ((a.path[i - 1].z < 7 && p.z >= 7) || (a.path[i - 1].z >= 7 && p.z < 7)));
        if (crossing > 0) {
          const inbound = a.path[crossing].z < 7;
          const used = [...this.actors.values()].filter(b => b.gate && b.gate.inbound === inbound).map(b => b.gate.slot);
          let slot = 0; while (used.includes(slot)) slot++;
          const bay = { x: inbound ? 1.9 + slot * .95 : -1 - slot * .95, z: inbound ? 8.3 : 5.6 };
          const entry = { x: .55, z: bay.z }, exit = { x: .55, z: inbound ? 5.6 : 8.3 };
          const prefix = inbound ? [a.path[0]] : a.path.slice(0, crossing);
          if (!inbound) prefix.push({ x: .55, z: 4.9 });
          a.path = [...prefix, bay, entry, exit, ...a.path.slice(crossing).filter((p, i, points) => i === points.length - 1 || (inbound ? p.z < 5.6 : p.z > 8.3 || Math.abs(p.x - .55) > .01))];
          a.gate = { inbound, slot, hold: prefix.length + 1, release: prefix.length + 3 };
        }
      }
      this._next(a);
    }
    _next(a) {
      while (a.index < a.path.length && distance(a, a.path[a.index]) < (a.index === a.path.length - 1 || !this.avoidance ? 1e-7 : .22)) a.index++;
      a.arrived = a.index === a.path.length;
    }
    _walkable(a, x, z) {
      if (this.gate && a.gate && this.actors.get(this.owner) !== a && Math.abs(x - .55) < .9 && z > 6.2 && z < 7.9) return false;
      return this.walkable(x, z, a);
    }
    _clear(a, b, obstacles, actor = a) {
      // 已进入舒适距离时允许向外退出，但不能进一步靠近对方。
      const steps = Math.max(1, Math.ceil(distance(a, b) / .02));
      for (let i = 1; i <= steps; i++) {
        const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
        if (!this._walkable(actor, x, z) || obstacles.some(o => Math.hypot(x - o.x, z - o.z) < Math.min(GAP + .08, distance(a, o) - 1e-7))) return false;
      }
      return true;
    }
    _plan(a, actors) {
      const obstacles = actors.filter(b => b !== a);
      let goal = a.path[a.index];
      // A shared corridor corner is not a destination: bypass it if another person occupies it.
      if (!a.gate && a.index < a.path.length - 1 && obstacles.some(b => distance(goal, b) < GAP + .12)) {
        a.index++; goal = a.path[a.index];
      }
      if (this._clear(a, goal, obstacles)) return [goal];
      const grid = .35, key = (x, z) => x + ':' + z;
      // 网格对齐目标，避免椅侧窄入口恰好落在整行网格之间。
      const sx = Math.round((a.x - goal.x) / grid), sz = Math.round((a.z - goal.z) / grid);
      const minX = Math.min(sx, 0) - 10, maxX = Math.max(sx, 0) + 10;
      const minZ = Math.min(sz, 0) - 10, maxZ = Math.max(sz, 0) + 10;
      const open = [], costs = new Map();
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const x = sx + dx, z = sz + dz, point = { x: goal.x + x * grid, z: goal.z + z * grid };
        if (!this._clear(a, point, obstacles, a)) continue;
        const cost = distance(a, point);
        open.push({ x, z, cost, rank: cost + distance(point, goal), parent: null });
        costs.set(key(x, z), cost);
      }
      for (let count = 0; open.length && count < 3500; count++) {
        let best = 0; for (let i = 1; i < open.length; i++) if (open[i].rank < open[best].rank) best = i;
        const n = open.splice(best, 1)[0], point = { x: goal.x + n.x * grid, z: goal.z + n.z * grid };
        if (distance(point, goal) < .6 && this._clear(point, goal, obstacles, a)) {
          const route = [goal]; let cursor = n;
          while (cursor) { route.unshift({ x: goal.x + cursor.x * grid, z: goal.z + cursor.z * grid }); cursor = cursor.parent; }
          // Smooth the grid path, keeping both furniture and other people outside each segment.
          const smooth = []; let from = a;
          while (route.length) {
            let next = 0; for (let i = route.length - 1; i >= 0; i--) if (this._clear(from, route[i], obstacles, a)) { next = i; break; }
            from = route[next]; smooth.push(from); route.splice(0, next + 1);
          }
          return smooth;
        }
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
          const x = n.x + dx, z = n.z + dz;
          if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
          const cost = n.cost + Math.hypot(dx, dz) * grid, id = key(x, z);
          if (cost >= (costs.get(id) ?? Infinity)) continue;
          const p = { x: goal.x + x * grid, z: goal.z + z * grid };
          if (!this._clear(point, p, obstacles, a)) continue;
          costs.set(id, cost); open.push({ x, z, cost, rank: cost + distance(p, goal), parent: n });
        }
      }
      return [];
    }
    pose(id) {
      const a = this.actors.get(id);
      return { x: a.x, z: a.z, angle: a.angle, arrived: a.arrived, moving: a.moving, yielding: a.yielding };
    }
    tick(dt) {
      const actors = [...this.actors.values()];
      for (const [id, a] of this.actors) {
        if (a.gate && a.index >= a.gate.release && this.owner === id) { this.owner = null; a.gate = null; }
      }
      if (!this.owner) for (const [id, a] of this.actors) {
        if (a.gate && a.index === a.gate.hold) { this.owner = id; break; }
      }
      const previous = actors.map(a => ({ x: a.x, z: a.z, vx: a.vx, vz: a.vz }));
      const chosen = [];
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i]; a.moving = false; a.yielding = false;
        if (a.arrived || !this.canMove(a) || (a.gate && a.index === a.gate.hold && this.actors.get(this.owner) !== a)) { a.yielding = !a.arrived; a.vx = a.vz = 0; chosen[i] = [0, 0]; continue; }
        if (this.avoidance && a.stuck > .45) { a.detour = this._plan(a, actors); a.stuck = 0; }
        while (a.detour.length && distance(a, a.detour[0]) < 1e-7) a.detour.shift();
        const goal = a.detour[0] || a.path[a.index], dx = goal.x - a.x, dz = goal.z - a.z, d = Math.hypot(dx, dz);
        const speed = Math.min(a.speed, d / dt), ux = dx / d, uz = dz / d;
        let best = [0, 0], score = -Infinity;
        const angles = [0, .35, -.35, .7, -.7, 1.05, -1.05, 1.57, -1.57, 2.1, -2.1];
        for (const angle of this.avoidance ? angles : [0]) {
          const vx = (ux * Math.cos(angle) - uz * Math.sin(angle)) * speed;
          const vz = (uz * Math.cos(angle) + ux * Math.sin(angle)) * speed;
          const x = a.x + vx * dt, z = a.z + vz * dt;
          if (!this._clear(a, { x, z }, [], a)) continue;
          let safe = true, risk = 0;
          if (this.avoidance) for (let j = 0; j < actors.length; j++) {
            if (i === j) continue;
            const b = previous[j], bv = chosen[j] || [0, 0];
            const rx = previous[i].x - b.x, rz = previous[i].z - b.z;
            if (closest(rx, rz, vx - bv[0], vz - bv[1], dt) < GAP - 1e-7) { safe = false; break; }
            const future = chosen[j] || [b.vx, b.vz];
            const near = closest(rx, rz, vx - future[0], vz - future[1], Math.min(.65, d / a.speed));
            risk += Math.max(0, .82 - near) * 5;
          }
          if (!safe) continue;
          const value = (d - Math.hypot(goal.x - x, goal.z - z)) / dt - risk - Math.abs(angle) * .025 + (angle > 0 ? .035 : 0);
          if (value > score) { score = value; best = [vx, vz]; }
        }
        if (score < -.15) best = [0, 0];
        [a.vx, a.vz] = best; chosen[i] = best;
        a.x += a.vx * dt; a.z += a.vz * dt;
        a.moving = Math.hypot(...best) > .02;
        a.yielding = !a.moving || Math.abs(a.vx - ux * speed) + Math.abs(a.vz - uz * speed) > .1;
        if (a.moving) a.angle = Math.atan2(a.vx, a.vz);
        a.stuck = a.moving ? Math.max(0, a.stuck - dt * .25) : a.stuck + dt;
        this._next(a);
      }
    }
  }
  root.BistroWalking = BistroWalking;
})(globalThis);
