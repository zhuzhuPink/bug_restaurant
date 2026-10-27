// 车辆模拟由模型统一推进，这里只复用车辆外观并同步红绿灯。
export class Traffic {
  constructor(restaurant) {
    this.host = restaurant;
    this.cars = [];
    this.state = { active: 0, allocated: 0, cars: [], signal: null };
  }
  create() {
    const r = this.host, i = this.cars.length;
    const root = r.group(0, -.69, 0, r.exterior);
    r.box(1.65, .4, .85, ['#de9679', '#e4c47c', '#86afb2', '#9eb484', '#c3a0b4'][i % 5], 0, .42, 0, root, .16);
    r.box(.83, .38, .72, '#e9e0c4', -.06, .77, 0, root, .14);
    r.box(.85, .23, .035, '#5c8d90', -.06, .79, -.365, root);
    r.box(.85, .23, .035, '#5c8d90', -.06, .79, .365, root);
    for (const x of [-.51, .51]) for (const z of [-.43, .43]) {
      const wheel = r.cylinder(.19, .12, '#465650', x, .22, z, root);
      wheel.rotation.x = Math.PI / 2;
    }
    for (const z of [-.25, .25]) r.box(.035, .12, .17, '#f9e7af', .83, .47, z, root);
    root.traverse(object => { object.castShadow = false; object.receiveShadow = false; });
    root.visible = false;
    const car = { root, active: false, lane: 0, progress: 0, stoppedAt: null };
    this.cars.push(car);
    return car;
  }
  update(state) {
    const traffic = state.street;
    if (!traffic) return;
    while (this.cars.length < traffic.allocated) this.create();
    for (const car of this.cars) car.root.visible = false;
    for (const car of traffic.cars) {
      const actor = this.cars[car.id];
      actor.root.visible = true;
      actor.root.position.set(...car.position);
      actor.root.rotation.y = car.angle;
    }
    this.host.updateSignals(traffic.signal);
    this.state = traffic;
  }
  inspect() { return this.state; }
}
