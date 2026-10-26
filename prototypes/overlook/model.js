(function (root) {
  'use strict';

  const EPSILON = 1e-9;
  const KINDS = ['rice', 'noodle', 'dumpling'];
  const TITLES = ['修复登录后跳转异常', '处理列表筛选不生效', '修复详情页重复请求'];
  const RUNNER_SECONDS = { pickup: 1, travel: 3.6, putdown: 1, waiting: Infinity, return: 3.6 };
  const WAITER_SECONDS = { pickup: 1.2, travel: 4.5, putdown: 1.2, return: 4.5 };

  class BistroModel {
    constructor({ seed = true, seats = 4 } = {}) {
      if (!Number.isInteger(seats) || seats < 1) throw new RangeError('桌数必须是正整数');
      this._seatCount = seats;
      this._seed = Boolean(seed);
      this.reset();
    }

    get speed() {
      return this._speed;
    }

    set speed(value) {
      if (![0.5, 1, 2].includes(value)) {
        throw new RangeError('speed 必须是 0.5、1 或 2');
      }
      this._speed = value;
    }

    reset() {
      this.time = 0;
      this.speed = 1;
      this.paused = false;
      this.auto = true;
      this.orders = [];
      this.chef = { orderId: null, elapsed: 0 };
      this.runner = { phase: 'idle', orderId: null, elapsed: 0 };
      this.waiter = { phase: 'idle', orderId: null, seat: null, elapsed: 0 };
      this.seats = Array.from({ length: this._seatCount }, (_, index) => ({
        index, orderId: null, phase: 'empty', elapsed: 0
      }));
      this._orderId = 0;
      this._eventId = 0;
      this._nextSeat = 0;
      this._nextAutoAt = 10;
      this._events = [];
      if (this._seed) {
        for (let index = 0; index < 3; index += 1) this.addOrder();
      }
    }

    addOrder(title) {
      const sequence = this._orderId++;
      const order = {
        id: `MOCK-${String(sequence + 1).padStart(3, '0')}`,
        title: title === undefined ? TITLES[sequence % 3] : String(title),
        kind: KINDS[sequence % 3],
        status: 'todo',
        createdAt: this.time,
        closedAt: null,
        seat: null
      };
      this.orders.push(order);
      this._event(`新增订单 ${order.id}：${order.title}`);
      return order;
    }

    _event(text) {
      this._events.push({ id: `EVENT-${++this._eventId}`, time: this.time, text });
      if (this._events.length > 8) this._events.shift();
    }

    _order(id) {
      return this.orders.find(order => order.id === id);
    }

    // Finish timed transitions before assigning either worker new work.
    _settle() {
      for (const seat of this.seats) {
        if (seat.phase === 'eat' && seat.elapsed >= 8 - EPSILON) {
          seat.phase = 'happy';
          seat.elapsed = 0;
          this._event(`${seat.orderId} 用餐结束`);
        } else if (seat.phase === 'happy' && seat.elapsed >= 2 - EPSILON) {
          this._event(`座位 ${seat.index + 1} 已释放`);
          seat.phase = 'empty';
          seat.orderId = null;
          seat.elapsed = 0;
        }
      }

      if (this.chef.orderId !== null && this.chef.elapsed >= 7 - EPSILON) {
        const order = this._order(this.chef.orderId);
        order.status = 'ready';
        this._event(`${order.id} 制作完成`);
        this.chef = { orderId: null, elapsed: 0 };
      }

      const waiter = this.waiter;
      if (waiter.phase !== 'idle' && waiter.elapsed >= WAITER_SECONDS[waiter.phase] - EPSILON) {
        waiter.elapsed = 0;
        if (waiter.phase === 'pickup') {
          waiter.phase = 'travel';
        } else if (waiter.phase === 'travel') {
          waiter.phase = 'putdown';
        } else if (waiter.phase === 'putdown') {
          const order = this._order(waiter.orderId);
          order.status = 'closed';
          order.closedAt = this.time;
          const seat = this.seats[waiter.seat];
          seat.orderId = order.id;
          seat.phase = 'eat';
          seat.elapsed = 0;
          this._event(`${order.id} 已上桌，本次 Mock 会话关闭一单`);
          waiter.phase = 'return';
          waiter.orderId = null;
          // Retain the destination while returning, so the visual path is continuous.
        } else {
          waiter.phase = 'idle';
          waiter.seat = null;
        }
      }

      if (this.time >= this._nextAutoAt - EPSILON) {
        if (this.auto && this.orders.filter(order => order.status !== 'closed').length < 8) {
          this.addOrder();
        }
        this._nextAutoAt += 10;
      }

      const runner = this.runner;
      if (runner.phase !== 'idle' && runner.elapsed >= RUNNER_SECONDS[runner.phase] - EPSILON) {
        runner.elapsed = 0;
        if (runner.phase === 'pickup') runner.phase = 'travel';
        else if (runner.phase === 'travel') runner.phase = 'putdown';
        else if (runner.phase === 'putdown') runner.phase = 'waiting';
        else if (runner.phase === 'return') runner.phase = 'idle';
      }
      // Only the physical handoff can start cooking; carried ingredients stay in todo.
      if (runner.phase === 'waiting' && this.chef.orderId === null) {
        const order = this._order(runner.orderId);
        order.status = 'cooking';
        this.chef = { orderId: order.id, elapsed: 0 };
        this._event(`${order.id} 食材已送到灶台，开始制作`);
        runner.phase = 'return';
        runner.elapsed = 0;
        runner.orderId = null;
      }
      if (runner.phase === 'idle') {
        const order = this.orders.find(item => item.status === 'todo');
        if (order) {
          runner.phase = 'pickup';
          runner.orderId = order.id;
          runner.elapsed = 0;
          this._event(`${order.id} 开始从备料区取料`);
        }
      }
      if (waiter.phase === 'idle') {
        const order = this.orders.find(item => item.status === 'ready');
        const seat = Array.from({ length: this.seats.length }, (_, i) => this.seats[(this._nextSeat + i) % this.seats.length])
          .find(item => item.phase === 'empty');
        if (order && seat) {
          this._nextSeat = (seat.index + 1) % this.seats.length;
          // Keep status ready during delivery; the sole waiter reserves this seat.
          order.seat = seat.index;
          waiter.phase = 'pickup';
          waiter.orderId = order.id;
          waiter.seat = seat.index;
          waiter.elapsed = 0;
          this._event(`${order.id} 开始取餐，前往座位 ${seat.index + 1}`);
        }
      }
    }

    tick(dt) {
      if (!Number.isFinite(dt) || dt < 0) {
        throw new RangeError('dt 必须是非负有限秒数');
      }
      if (this.paused || dt === 0) return;
      const target = this.time + dt * this.speed;
      if (!Number.isFinite(target)) throw new RangeError('模拟时间超出范围');
      this._settle();
      while (target - this.time > EPSILON) {
        let step = Math.min(0.1, target - this.time, this._nextAutoAt - this.time);
        if (this.chef.orderId !== null) step = Math.min(step, 7 - this.chef.elapsed);
        if (this.runner.phase !== 'idle') step = Math.min(step, RUNNER_SECONDS[this.runner.phase] - this.runner.elapsed);
        if (this.waiter.phase !== 'idle') {
          step = Math.min(step, WAITER_SECONDS[this.waiter.phase] - this.waiter.elapsed);
        }
        for (const seat of this.seats) {
          if (seat.phase !== 'empty') {
            step = Math.min(step, (seat.phase === 'eat' ? 8 : 2) - seat.elapsed);
          }
        }
        this.time += step;
        if (this.chef.orderId !== null) this.chef.elapsed += step;
        if (this.runner.phase !== 'idle') this.runner.elapsed += step;
        if (this.waiter.phase !== 'idle') this.waiter.elapsed += step;
        for (const seat of this.seats) {
          if (seat.phase !== 'empty') seat.elapsed += step;
        }
        this._settle();
      }
      this.time = target;
    }

    snapshot() {
      const progress = (elapsed, duration) => Math.max(0, Math.min(1, elapsed / duration));
      const counts = { todo: 0, cooking: 0, ready: 0, closed: 0 };
      for (const order of this.orders) counts[order.status] += 1;
      return {
        time: this.time,
        orders: this.orders.map(({ id, title, kind, status, createdAt, closedAt, seat }) => ({
          id, title, kind, status, createdAt, closedAt, seat
        })),
        counts,
        chef: {
          orderId: this.chef.orderId,
          progress: this.chef.orderId === null ? 0 : progress(this.chef.elapsed, 7)
        },
        runner: {
          phase: this.runner.phase,
          orderId: this.runner.orderId,
          progress: this.runner.phase === 'waiting' ? 1 : this.runner.phase === 'idle' ? 0 : progress(this.runner.elapsed, RUNNER_SECONDS[this.runner.phase])
        },
        waiter: {
          phase: this.waiter.phase,
          orderId: this.waiter.orderId,
          seat: this.waiter.seat,
          progress: this.waiter.phase === 'idle' ? 0 : progress(this.waiter.elapsed, WAITER_SECONDS[this.waiter.phase])
        },
        seats: this.seats.map(({ index, orderId, phase, elapsed }) => ({
          index, orderId, phase,
          progress: phase === 'empty' ? 0 : progress(elapsed, phase === 'eat' ? 8 : 2)
        })),
        paused: this.paused,
        auto: this.auto,
        speed: this.speed,
        events: this._events.map(event => ({ ...event }))
      };
    }
  }

  root.BistroModel = BistroModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = BistroModel;
})(globalThis);
