(function (root) {
  'use strict';
  const L = root.BistroLayout;
  const EPSILON = 1e-9;
  const TITLES = ['修复登录后跳转异常', '处理列表筛选不生效', '修复详情页重复请求'];
  const RUNNER_SECONDS = { pickup: .25, travel: 3.6, putdown: .25, waiting: Infinity, return: 3.6 };
  const WAITER_SECONDS = { pickup: .25, travel: 4.5, putdown: .3, return: 4.5 };
  const GUEST_SECONDS = { sitting: .7, waiting: Infinity, delivery: Infinity, eat: 8, happy: 1.2, standing: .7, queued: Infinity };

  class BistroModel {
    constructor({ seed = true, seats = 4, avoidance = true } = {}) {
      if (!Number.isInteger(seats) || seats < 1 || seats > 4) throw new RangeError('桌数必须为 1～4');
      this._seatCount = seats;
      this._seed = Boolean(seed); this._avoidance = avoidance;
      this.limits = { waiting: 3, vehicles: 2 };
      this.reset();
    }
    get speed() { return this._speed; }
    set speed(value) {
      if (![.5, 1, 2].includes(value)) throw new RangeError('速度必须为 0.5、1 或 2');
      this._speed = value;
    }
    reset() {
      this.time = 0; this.speed = 1; this.paused = false; this.auto = true;
      this.orders = []; this.guests = []; this._remainder = 0;
      const enabled = this.street?.enabled ?? true;
      this.street = new root.BistroStreet.Junction(); this.street.enabled = enabled;
      this.walking = new root.BistroWalking({ avoidance: this._avoidance, walkable: (x, z, actor) => L.walkable(x, z) && this.street.walkable(x, z, actor), canMove: actor => this.street.canMove(actor), gate: true });
      this.walking.add('runner', L.supply[0]); this.walking.add('waiter', L.pickup);
      this.walking.add('chef', [5.48, -.35]);
      this.chef = { orderId: null, elapsed: 0 };
      this.runner = { phase: 'idle', orderId: null, elapsed: 0 };
      this.waiter = { phase: 'idle', orderId: null, seat: null, side: 0, elapsed: 0 };
      this.seats = Array.from({ length: this._seatCount }, (_, index) => ({ index, guestId: null, orderId: null, side: 0, phase: 'empty' }));
      this._orderId = 0; this._guestId = 0; this._eventId = 0; this._nextSeat = 0;
      this._randomSeed = 1741; this._nextAutoAt = 10; this._events = []; this.mergedArrivals = 0;
      if (this._seed) for (let i = 0; i < 3; i++) this.addOrder();
    }
    setLimits(values) {
      for (const [key, max] of [['waiting', 6], ['vehicles', 10]]) {
        if (values[key] === undefined) continue;
        if (!Number.isInteger(values[key]) || values[key] < 0 || values[key] > max) throw new RangeError(`${key === 'waiting' ? '候位' : '车辆'}上限须为 0～${max} 的整数`);
      }
      Object.assign(this.limits, Object.fromEntries(Object.entries(values).filter(([key]) => key === 'waiting' || key === 'vehicles')));
    }
    _random() {
      this._randomSeed = (Math.imul(this._randomSeed, 1664525) + 1013904223) >>> 0;
      return this._randomSeed / 4294967296;
    }
    addOrder(title) {
      const n = this._orderId++;
      const order = { id: `MOCK-${String(n + 1).padStart(3, '0')}`, title: title === undefined ? TITLES[n % 3] : String(title), kind: ['rice', 'noodle', 'dumpling'][n % 3], status: 'todo', delivery: 'none', createdAt: this.time, closedAt: null, servedAt: null, seat: null };
      this.orders.push(order);
      if (!this._spawn()) this.mergedArrivals++;
      this._event(`新增 Bug ${order.id}：${order.title}`);
      return order;
    }
    _event(text) {
      this._events.push({ id: `EVENT-${++this._eventId}`, time: this.time, text });
      if (this._events.length > 8) this._events.shift();
    }
    _order(id) { return this.orders.find(o => o.id === id); }
    _move(guest, phase, path) {
      guest.phase = phase; guest.elapsed = 0; guest.path = path.map(p => [...p]);
      guest.duration = Math.max(.1, L.length(path) / 3.2);
      this.walking.follow(guest.id, path, 3.2);
    }
    _spawn() {
      if (this.guests.length >= this._seatCount + this.limits.waiting) return false;
      const inbound = this.guests.filter(g => ['arriving', 'queued'].includes(g.phase));
      if (this.limits.waiting === 0 && (inbound.length || !this.seats.some(s => s.guestId === null))) return false;
      const slots = Math.max(1, this.limits.waiting);
      const slot = Array.from({ length: slots }, (_, i) => i).find(i => !inbound.some(g => g.slot === i));
      if (slot === undefined) return false;
      const guest = { id: `GUEST-${++this._guestId}`, variant: this._guestId % 4, slot, table: null, side: 0, orderId: null };
      const path = L.arrival(slot).map(p => [...p]);
      // New arrivals start in distinct off-screen positions, never on top of an existing walker.
      while ([...this.walking.actors.values()].some(a => Math.hypot(a.x - path[0][0], a.z - path[0][1]) < 1.1)) path[0][0] += 1.1;
      this.walking.add(guest.id, path[0]);
      this._move(guest, 'arriving', path);
      this.guests.push(guest);
      return true;
    }
    _travelling(phase) { return ['arriving', 'entering', 'leavingSeat', 'leaving', 'travel', 'return'].includes(phase); }
    _ready(actor, id, durations) {
      // 避让路径可能短于名义路线，到达后直接交接，不再原地等计时。
      return this._travelling(actor.phase) ? this.walking.pose(id).arrived : actor.elapsed >= durations[actor.phase] - EPSILON;
    }
    _staffMove(id, path, seconds) { this.walking.follow(id, path, L.length(path) / seconds); }
    _duration(guest) { return GUEST_SECONDS[guest.phase] ?? guest.duration; }
    _settleGuests() {
      for (const g of [...this.guests]) {
        const pose = this.walking.pose(g.id);
        // 画面外出口是一条边界，不是需要所有顾客精确重合的单点。
        const departed = g.phase === 'leaving' && pose.x <= L.departure.at(-1)[0] + .5;
        if (this._travelling(g.phase) ? !pose.arrived && !departed : g.elapsed < this._duration(g) - EPSILON) continue;
        g.elapsed = 0;
        if (g.phase === 'arriving') g.phase = 'queued';
        else if (g.phase === 'entering') g.phase = 'sitting';
        else if (g.phase === 'sitting') g.phase = 'waiting';
        else if (g.phase === 'eat') { g.phase = 'happy'; this._order(g.orderId).delivery = 'done'; }
        else if (g.phase === 'happy') { g.phase = 'standing'; g.orderId = null; }
        else if (g.phase === 'standing') this._move(g, 'leavingSeat', [L.seat(g.table, g.side).point, L.seat(g.table, g.side).approach]);
        else if (g.phase === 'leavingSeat') {
          const s = this.seats[g.table]; s.guestId = null; s.orderId = null; s.phase = 'empty';
          this._move(g, 'leaving', L.exit(g.table, g.side));
        } else if (g.phase === 'leaving') { this.walking.remove(g.id); this.guests.splice(this.guests.indexOf(g), 1); }
      }
      const waiting = this.guests.filter(g => g.phase === 'queued');
      for (const g of waiting) {
        const seat = Array.from({ length: this.seats.length }, (_, i) => this.seats[(this._nextSeat + i) % this.seats.length]).find(s => s.guestId === null);
        const queuedCount = this.guests.filter(x => ['arriving', 'queued'].includes(x.phase)).length;
        if (this.guests.length > this._seatCount + this.limits.waiting || (!seat && queuedCount > this.limits.waiting)) {
          this._move(g, 'leaving', [L.queue(g.slot), [L.queue(g.slot)[0], 8.65], ...L.departure]);
        } else if (seat) {
          g.table = seat.index; g.side = this._random() < .5 ? 0 : 1;
          seat.guestId = g.id; seat.side = g.side; seat.phase = 'reserved';
          this._nextSeat = (seat.index + 1) % this.seats.length;
          this._move(g, 'entering', L.entrance(g.slot, g.table, g.side));
        }
      }
      for (const g of this.guests) {
        if (g.table !== null && this.seats[g.table].guestId === g.id) this.seats[g.table].phase = g.phase;
      }
    }
    _settle() {
      this._settleGuests();
      if (this.chef.orderId !== null && this.chef.elapsed >= 7 - EPSILON) {
        const order = this._order(this.chef.orderId);
        order.status = 'closed'; order.closedAt = this.time; order.delivery = 'waiting';
        this._event(`${order.id} 已完成，餐点等待展示`);
        this.chef = { orderId: null, elapsed: 0 };
      }
      const w = this.waiter;
      if (w.phase !== 'idle' && this._ready(w, 'waiter', WAITER_SECONDS)) {
        w.elapsed = 0;
        if (w.phase === 'pickup') { w.phase = 'travel'; this._staffMove('waiter', L.delivery(w.seat, w.side), WAITER_SECONDS.travel); }
        else if (w.phase === 'travel') w.phase = 'putdown';
        else if (w.phase === 'putdown') {
          const order = this._order(w.orderId), s = this.seats[w.seat];
          const g = this.guests.find(g => g.id === s.guestId);
          order.delivery = 'eating'; order.servedAt = this.time;
          g.phase = 'eat'; g.elapsed = 0; s.phase = 'eat';
          this._event(`${order.id} 已送到 ${w.seat + 1} 号桌`);
          w.phase = 'return'; w.orderId = null; this._staffMove('waiter', [...L.delivery(w.seat, w.side)].reverse(), WAITER_SECONDS.return);
        } else { w.phase = 'idle'; w.seat = null; }
      }
      if (this.time >= this._nextAutoAt - EPSILON) {
        if (this.auto && this.orders.filter(o => o.status !== 'closed').length < 8) this.addOrder();
        this._nextAutoAt += 10;
      }
      const r = this.runner;
      if (r.phase !== 'idle' && this._ready(r, 'runner', RUNNER_SECONDS)) {
        r.elapsed = 0;
        if (r.phase === 'pickup') { r.phase = 'travel'; this._staffMove('runner', L.supply, RUNNER_SECONDS.travel); }
        else if (r.phase === 'travel') r.phase = 'putdown';
        else if (r.phase === 'putdown') r.phase = 'waiting';
        else if (r.phase === 'return') r.phase = 'idle';
      }
      if (r.phase === 'waiting' && this.chef.orderId === null) {
        const order = this._order(r.orderId); order.status = 'cooking';
        this.chef = { orderId: order.id, elapsed: 0 };
        this._event(`${order.id} 食材已送到灶台，开始制作`);
        r.phase = 'return'; r.elapsed = 0; r.orderId = null; this._staffMove('runner', [...L.supply].reverse(), RUNNER_SECONDS.return);
      }
      if (r.phase === 'idle') {
        const order = this.orders.find(o => o.status === 'todo');
        if (order) { r.phase = 'pickup'; r.orderId = order.id; r.elapsed = 0; }
      }
      if (w.phase === 'idle') {
        const order = this.orders.find(o => o.delivery === 'waiting');
        const g = this.guests.find(g => g.phase === 'waiting');
        if (order && g) {
          order.seat = g.table; order.delivery = 'serving'; g.orderId = order.id; g.phase = 'delivery';
          this.seats[g.table].orderId = order.id; this.seats[g.table].phase = 'delivery';
          Object.assign(w, { phase: 'pickup', orderId: order.id, seat: g.table, side: g.side, elapsed: 0 });
        }
      }
      if (this.orders.some(o => o.delivery === 'waiting') && !this.guests.some(g => ['arriving', 'queued', 'entering', 'sitting', 'waiting'].includes(g.phase))) this._spawn();
    }
    tick(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError('时间必须是非负有限秒数');
      if (this.paused || dt === 0) return;
      this._remainder += dt * this.speed;
      if (!Number.isFinite(this._remainder)) throw new RangeError('模拟时间超出范围');
      this._settle();
      // Fixed simulation steps keep avoidance and phase boundaries deterministic at every render rate.
      while (this._remainder >= .025 - EPSILON) {
        this._remainder -= .025; this.time = Math.round((this.time + .025) * 1e9) / 1e9;
        this.street.tick(.025, this.limits.vehicles, [...this.walking.actors.values()]);
        this.walking.tick(.025);
        if (this.chef.orderId !== null) this.chef.elapsed += .025;
        if (this.runner.phase !== 'idle') this.runner.elapsed += .025;
        if (this.waiter.phase !== 'idle') this.waiter.elapsed += .025;
        for (const g of this.guests) g.elapsed += .025;
        this._settle();
      }
    }
    snapshot() {
      const p = (n, d) => Math.max(0, Math.min(1, n / d));
      const counts = { todo: 0, cooking: 0, ready: 0, closed: 0 };
      for (const o of this.orders) { counts[o.status]++; if (['waiting', 'serving'].includes(o.delivery)) counts.ready++; }
      return {
        time: this.time, street: this.street.snapshot(), orders: this.orders.map(o => ({ ...o })), counts,
        chef: { orderId: this.chef.orderId, progress: p(this.chef.elapsed, 7) },
        runner: { ...this.runner, pose: this.walking.pose('runner'), progress: this.runner.phase === 'waiting' ? 1 : p(this.runner.elapsed, RUNNER_SECONDS[this.runner.phase] || Infinity) },
        waiter: { ...this.waiter, pose: this.walking.pose('waiter'), progress: p(this.waiter.elapsed, WAITER_SECONDS[this.waiter.phase] || Infinity) },
        seats: this.seats.map(s => ({ ...s })),
        guests: this.guests.map(g => ({ ...g, pose: this.walking.pose(g.id), path: g.path.map(p => [...p]), progress: p(g.elapsed, this._duration(g)) })),
        limits: { ...this.limits }, mergedArrivals: this.mergedArrivals,
        paused: this.paused, auto: this.auto, speed: this.speed, events: this._events.map(e => ({ ...e }))
      };
    }
  }
  root.BistroModel = BistroModel;
  if (typeof module !== 'undefined') module.exports = { BistroModel };
})(globalThis);
