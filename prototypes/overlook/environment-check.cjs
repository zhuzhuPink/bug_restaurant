const assert = require('node:assert/strict');
async function checkEnvironment() {
  await import('./layout.js');
  await import('./street.js');
  const THREE = await import('./node_modules/three/build/three.module.js');
  const { Restaurant } = await import('./scene.js');
  const r = Object.create(Restaurant.prototype);
  Object.assign(r, { scene: new THREE.Scene(), materials: new Map(), geometries: new Map() });
  r.text = () => new THREE.Group();
  r.buildExterior(); r.buildRoom(); r.scene.updateMatrixWorld(true);
  const meshes = color => { const list = []; r.scene.traverse(o => { if (o.isMesh && o.material.color.getHexString() === color) list.push(o); }); return list; };
  const bounds = object => new THREE.Box3().setFromObject(object);
  const center = object => bounds(object).getCenter(new THREE.Vector3());
  const failures = [];
  const check = (name, fn) => { try { fn(); console.log('通过：' + name); } catch (e) { failures.push(name + '：' + e.message); } };
  check('门垫与门口中心对齐', () => assert.ok(Math.abs(center(meshes('91a98b')[0]).x - r.door.position.x) < .001));
  check('单扇门关闭可覆盖门洞且上下留缝合理', () => {
    const leaf = meshes('9fb9a4')[0], hinge = leaf.parent, angle = hinge.rotation.y;
    hinge.rotation.y = 0; r.scene.updateMatrixWorld(true);
    const b = bounds(leaf), posts = meshes('638d7b').filter(o => bounds(o).max.y - bounds(o).min.y > 2);
    const opening = [bounds(posts[0]).max.x, bounds(posts[1]).min.x];
    const top = meshes('638d7b').find(o => bounds(o).max.x - bounds(o).min.x > 2);
    assert.ok(Math.abs(b.min.x - opening[0]) < .07 && Math.abs(b.max.x - opening[1]) < .07);
    assert.ok(bounds(top).min.y - b.max.y > .005 && bounds(top).min.y - b.max.y < .07);
    assert.ok(b.min.y >= .04 && b.min.y < .1);
    hinge.rotation.y = angle; r.scene.updateMatrixWorld(true);
  });
  check('室外两张长椅背靠餐馆、面向马路', () => {
    const seats = meshes('aa845d'), backs = meshes('b99465');
    assert.equal(seats.length, 2);
    seats.forEach((seat, i) => assert.ok(center(backs[i]).z < center(seat).z));
  });
  check('西侧房屋包含屋檐整体退让人行道', () => {
    const house = meshes('d3b6a1')[0].parent, b = bounds(house);
    const westWalk = meshes('d9ceb4').map(bounds).filter(w => w.max.x < -16 && w.max.z > 0 && w.min.z < 0);
    assert.ok(westWalk.length > 0);
    assert.ok(b.max.x <= Math.min(...westWalk.map(w => w.min.x)) - .3, '墙体、屋檐和窗台均应退在人行道之外');
  });
  check('路口车行道连通、人行道不横穿道路', () => {
    const sidewalks = meshes('d9ceb4').map(bounds);
    for (const [x, z] of [[-14, 11], [-14, 8.05], [-14, 13.95], [-11.05, 11]])
      assert.ok(!sidewalks.some(b => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z), `人行道错误占用车行道 ${x},${z}`);
  });
  check('四向斑马线铺满路宽且不叠加道路虚线', () => {
    const stripes = meshes('efe9ce').map(bounds), dashes = meshes('f5e8c5').map(bounds);
    const groups = [stripes.filter(b => b.max.x < -16.3), stripes.filter(b => b.min.x > -11.7), stripes.filter(b => b.max.z < 8.7), stripes.filter(b => b.min.z > 13.3)];
    groups.forEach((group, index) => {
      for (const bar of group) {
        const dx = bar.max.x - bar.min.x, dz = bar.max.z - bar.min.z;
        assert.ok(index < 2 ? dx >= 1.19 && dz < .5 : dz >= 1.19 && dx < .5, '白条应沿车行方向延伸、并排铺满横向路宽，不能画成长横线');
      }
      assert.equal(group.length, 7);
      const b = group.reduce((a, v) => a.union(v), new THREE.Box3());
      assert.ok(Math.max(b.max.x - b.min.x, b.max.z - b.min.z) >= 4.59);
    });
    for (const stripe of stripes) for (const dash of dashes)
      assert.ok(stripe.max.x <= dash.min.x || dash.max.x <= stripe.min.x || stripe.max.z <= dash.min.z || dash.max.z <= stripe.min.z, '虚线不得穿过斑马线');
  });
  r.geometries.forEach(g => g.dispose()); r.materials.forEach(m => m.dispose());
  assert.deepEqual(failures, []);
}
if (require.main === module) checkEnvironment().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { checkEnvironment };
