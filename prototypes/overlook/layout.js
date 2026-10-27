(function (root) {
  'use strict';
  const tables = [[-6.2, -2], [-6.2, 3.4], [-1.6, 3.4], [-1.6, -2]];
  const pickup = [1.65, -.05];
  const door = [.55, 7];
  const sidewalk = [.55, 8.65];
  const departure = [[-9.5, 8.65], [-11.25, 7.8], [-16.75, 7.8], [-28, 7.8]];
  const length = points => points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
  const seat = (index, side) => {
    const [x, z] = tables[index % tables.length];
    return side === 0 ? { point: [x, z - 1.12], approach: [x + .95, z - 1.12], angle: 0, dish: [0, -.4] }
      : { point: [x - 1.3, z], approach: [x - 1.3, z + .95], angle: Math.PI / 2, dish: [-.45, 0] };
  };
  const corridor = (index, side) => {
    const [x, z] = tables[index % tables.length], s = seat(index, side);
    return side === 0 ? [[.55, .25], [x + 1.85, .25], [x + 1.85, z - 1.12], s.approach, s.point]
      : [[.55, .25], [x - 2.15, .25], [x - 2.15, z + .95], s.approach, s.point];
  };
  // 椅背阻挡含身体余量；座面保留通行，人物只能从侧边进出。
  const chairBacks = tables.flatMap((_, index) => [0, 1].map(side => {
    const [x, z] = seat(index, side).point;
    return side === 0 ? [x - .55, x + .55, z - .54, z - .02]
      : [x - .54, x - .02, z - .55, z + .55];
  }));
  root.BistroLayout = {
    tables, pickup, door, sidewalk, departure, length, seat, corridor,
    supply: [[3.65, -4.75], [4.9, -4.75], [4.9, -3.25], [6.8, -3.25], [6.8, -2.5]],
    walkable: (x, z) => {
      if (z > 7.7) return z < 9.5;
      if (z > 6.5) return Math.abs(x - .55) < .62 || z > 7.28;
      if (x < -8.85 || x > 9.05 || z < -6.65) return false;
      if (chairBacks.some(([left, right, top, bottom]) => x > left && x < right && z > top && z < bottom)) return false;
      if (tables.some(([tx, tz]) => Math.abs(x - tx) < 1.12 && Math.abs(z - tz) < .82)) return false;
      if (x > 2.05 && x < 3.95 && z > -1.65 && z < 2.7) return false;
      if (x > 5.65 && x < 7.95 && z > -2.03 && z < 1.4) return false;
      return true;
    },
    queue: slot => [2.2 + slot * .94, 7.4],
    arrival: slot => [[28, 8.65], [9.05, 8.65], [9.05, 7.4], [2.2 + slot * .94, 7.4]],
    entrance: (slot, table, side) => [[2.2 + slot * .94, 7.4], [.55, 7.4], door, ...corridor(table, side)],
    exit: (table, side) => [...corridor(table, side).slice(0, -1).reverse(), door, sidewalk, ...departure],
    delivery: (table, side) => {
      const [x, z] = tables[table % tables.length];
      return side === 0 ? [pickup, [1.65, .25], [x + 1.65, .25], [x + 1.65, z - .6]]
        : [pickup, [1.65, .25], [x - 2.15, .25], [x - 2.15, z + .7]];
    }
  };
})(globalThis);
