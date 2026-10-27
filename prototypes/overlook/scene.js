import * as THREE from 'three';
import { Traffic } from './traffic.js';
import { cameraFrame } from './viewport.js';
import { RoundedBoxGeometry } from './node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';

const P = { cream: '#f5ebcf', ivory: '#fff6e1', wood: '#bd8953', edge: '#93613f', mint: '#76a699', teal: '#426e65', coral: '#db856c', dark: '#384940', metal: '#bac9be' };
const ROOM = { width: 19.1, depth: 14.5 };
const L = globalThis.BistroLayout;
const TABLES = L.tables;
const PICKUP = [1.65, -.05];
const ROUTES = TABLES.map((_, i) => L.delivery(i, 0));
const SUPPLY_ROUTE = L.supply;

export class Restaurant {
  constructor(canvas, labels) {
    this.canvas = canvas;
    this.labels = labels;
    this.materials = new Map();
    this.geometries = new Map();
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera = new THREE.OrthographicCamera(-12, 12, 8, -8, .1, 120);
    this.cameraIndex = 0;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.animated = true;
    this.ambient = new THREE.HemisphereLight('#fff4d8', '#a8b49d', 1.9);
    this.scene.add(this.ambient);
    const sun = new THREE.DirectionalLight('#fff0d6', 3.3);
    sun.position.set(-6, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 });
    sun.shadow.normalBias = .035;
    sun.shadow.bias = -.0002;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#d7ebdf', 1.1);
    fill.position.set(8, 7, -6);
    this.scene.add(fill);
    this.buildExterior();
    this.buildRoom();
    this.buildKitchen();
    this.buildDining();
    this.chef = this.character('chef', '#f4eee0');
    this.chef.position.set(5.48, .03, -.35);
    this.chef.userData.filter = 'cooking';
    this.chef.rotation.y = Math.PI / 2;
    this.waiter = this.character('waiter', '#78a18d');
    this.waiter.userData.filter = 'ready';
    this.waiter.position.set(...[PICKUP[0], .03, PICKUP[1]]);
    this.runner = this.character('runner', '#ce9763');
    this.runner.userData.filter = 'todo';
    this.runner.position.set(SUPPLY_ROUTE[0][0], .03, SUPPLY_ROUTE[0][1]);
    this.guestPool = [];
    this.guestActors = new Map();
    this.traffic = new Traffic(this);
    this.bubbleNodes = new Map();
    this.bubbleLayer = document.createElement('div');
    this.bubbleLayer.id = 'bug-bubbles';
    this.labels.parentElement.append(this.bubbleLayer);
    this.steam = Array.from({ length: 9 }, (_, i) => {
      const puff = this.sphere(.085 + (i % 3) * .02, '#fffaf0', 5.32, 1.65, -.25, this.scene);
      puff.material = new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: .45, depthWrite: false });
      puff.castShadow = false;
      return puff;
    });
    this.notice('prep', '备料区', [3.6, 1.85, -5.55], 'todo');
    this.notice('stove', '烹饪区', [6.8, 2.7, .3], 'cooking');
    this.notice('pass', '出餐区', [3, 1.9, 2.2], 'ready');
    this.setCamera(0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    this.resize();
  }

  material(color, roughness = .75) {
    const key = `${color}/${roughness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    return this.materials.get(key);
  }

  mesh(geometry, color, x, y, z, parent = this.scene) {
    const object = new THREE.Mesh(geometry, this.material(color));
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  box(w, h, d, color, x, y, z, parent = this.scene, radius = .06) {
    const key = `box/${w}/${h}/${d}/${radius}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)));
    return this.mesh(this.geometries.get(key), color, x, y, z, parent);
  }

  sphere(r, color, x, y, z, parent = this.scene) {
    const key = `sphere/${r}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.SphereGeometry(r, 16, 12));
    return this.mesh(this.geometries.get(key), color, x, y, z, parent);
  }

  cylinder(r, h, color, x, y, z, parent = this.scene, top = r) {
    const key = `cylinder/${r}/${h}/${top}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.CylinderGeometry(top, r, h, 24));
    return this.mesh(this.geometries.get(key), color, x, y, z, parent);
  }

  group(x = 0, y = 0, z = 0, parent = this.scene, filter = null) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    parent.add(group);
    if (filter !== null) group.userData.filter = filter;
    return group;
  }

  plant(x, z, scale = 1, y = .03) {
    const pot = this.group(x, y, z);
    pot.scale.setScalar(scale);
    this.cylinder(.27, .44, '#c78c68', 0, .22, 0, pot, .34);
    this.cylinder(.35, .09, '#e2a87c', 0, .45, 0, pot);
    this.cylinder(.29, .015, '#695642', 0, .5, 0, pot);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const leaf = this.sphere(.23, i % 2 ? '#77945a' : '#95ac6b', Math.cos(a) * .19, .73 + i % 3 * .09, Math.sin(a) * .19, pot);
      leaf.scale.set(.65, 1.7, .65);
      leaf.rotation.z = Math.cos(a) * .6;
      leaf.rotation.x = Math.sin(a) * .6;
    }
    return pot;
  }

  text(text, w, h, color, bg, x, y, z, parent = this.scene) {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 256;
    const ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.fillStyle = color;
    ctx.font = '600 76px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 384, 128);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  buildExterior() {
    this.exterior = this.group();
    const outer = this.exterior;
    this.box(160, .18, 160, '#a7b992', 0, -.88, 0, outer);
    this.buildStreets();
    for (let x = -7; x <= 7; x += .8) this.box(.72, .05, .9, '#e7d6b4', x, -.59, 7.9, outer);
    const tree = (x, z, size = 1) => {
      const g = this.group(x, -.65, z, outer); g.scale.setScalar(size);
      this.cylinder(.16, 1.6, '#98714f', 0, .7, 0, g);
      this.sphere(.9, '#7f9f71', 0, 1.95, 0, g);
      this.sphere(.62, '#91af7b', -.4, 2.35, .18, g);
      this.sphere(.65, '#70916c', .5, 1.8, -.1, g);
    };
    [[-10, -8], [-10, 4], [10, 5.8], [10, -5.5], [-3, 13.5], [6, 13.8], [14, 1], [16, 12], [-17, 5], [-20, -5]].forEach(([x,z],i) => tree(x,z, .9 + i % 3 * .15));
    const house = (x, z, w, d, color) => {
      const g = this.group(x, -.65, z, outer);
      this.box(w, 2.7, d, color, 0, 1.35, 0, g, .14);
      this.box(w + .5, .35, d + .5, '#b9896e', 0, 2.8, 0, g, .14);
      this.box(w - .3, .16, d - .3, '#c69978', 0, 3.04, 0, g);
      for (let j = -1; j <= 1; j++) {
        this.box(.72, .95, .08, '#8eb9b2', j * w / 3.5, 1.55, d / 2 + .05, g);
        this.box(.83, .09, .16, '#f0dbb6', j * w / 3.5, 1.05, d / 2 + .09, g);
      }
      this.box(.8, .6, .7, '#c5bca0', .8, 3.35, -.5, g);
    };
    house(-3, -11.2, 6, 3.7, '#dfc5a3');
    house(6, -11.5, 5, 3.8, '#c5c9a8');
    house(-21, -.5, 5, 6, '#d3b6a1');
    house(14, -8.5, 4.8, 4, '#c7c3a1');
    house(16, 4, 4.5, 5, '#d8c6a0');
    // 额外街区只使用静态模型，避免随显示面积增加人物和车辆负载。
    for (const [x, z, w, d] of [
      [-24, -17, 6, 5], [-4, -20, 6, 5], [6, -21, 5, 5], [17, -18, 5, 5],
      [-25, 20, 6, 5], [-5, 20, 6, 5], [6, 21, 5, 5], [18, 20, 5, 5],
      [-29, -5, 5, 6], [-28, 6, 5, 5], [25, -7, 5, 6], [26, 6, 5, 5],
      [-39, -17, 5, 6], [-39, 0, 5, 6], [-39, 20, 5, 6],
      [39, -17, 5, 6], [39, 0, 5, 6], [39, 20, 5, 6],
      [-24, -35, 6, 5], [-4, -35, 6, 5], [8, -35, 6, 5], [22, -35, 6, 5],
      [-24, 36, 6, 5], [-4, 36, 6, 5], [8, 36, 6, 5], [22, 36, 6, 5]
    ]) house(x, z, w, d, (x + z) % 2 ? '#d3c4a5' : '#c5c9a8');
    for (const z of [-27, 28]) {
      for (const [left, right] of [[-55, -17.8], [-10.2, 55]]) {
        this.box(right - left, .08, 2.4, '#d9ceb4', (left + right) / 2, -.65, z, outer);
      }
    }
    [[-24,-25],[-8,-16],[13,-25],[24,-23],[-24,27],[11,27],[24,15],[-32,15],[-33,-12],[33,-12],[33,14]].forEach(([x,z],i) => tree(x,z,.85 + i % 2 * .15));
    // Two benches, a street lamp and flower beds ground the restaurant in a neighbourhood.
    for (const x of [-5.4, 4.3]) {
      const bench = this.group(x, -.65, 8.05, outer);
      this.box(1.6, .12, .42, '#aa845d', 0, .55, 0, bench);
      this.box(1.6, .45, .09, '#b99465', 0, .8, -.21, bench);
      for (const dx of [-.57, .57]) this.box(.09, .5, .36, '#536e60', dx, .3, 0, bench);
    }
    for (const x of [-7.7, 7.9]) {
      this.box(.14, 2.65, .14, '#54766a', x, .68, 8.2, outer);
      this.sphere(.3, '#f6e7b7', x, 2.13, 8.2, outer);
      this.box(1.15, .3, 1.1, '#b3a782', x, -.48, 7.85, outer);
      for (let i = 0; i < 5; i++) this.sphere(.16, i % 2 ? '#dca88e' : '#e9ce8d', x + Math.sin(i * 2.4) * .32, -.13, 7.85 + Math.cos(i * 2.4) * .32, outer);
    }
  }

  buildStreets() {
    const { x, z, width, crossing, stripeWidth, stop } = globalThis.BistroStreet.road;
    const half = width / 2, outer = this.exterior;
    this.box(90, .06, width, '#839295', 0, -.75, z, outer);
    this.box(width, .06, 90, '#839295', x, -.75, 0, outer);
    // 人行道在车行道边缘断开，只在四个街角连接，不能覆盖十字路口。
    for (const [left, right] of [[-45, x - half], [x + half, 45]]) {
      for (const side of [-1, 1]) this.box(right - left, .08, 1.5, '#d9ceb4', (left + right) / 2, -.65, z + side * (half + .75), outer);
    }
    for (const [top, bottom] of [[-45, z - half], [z + half, 45]]) {
      for (const side of [-1, 1]) this.box(1.5, .08, bottom - top, '#d9ceb4', x + side * (half + .75), -.65, (top + bottom) / 2, outer);
    }
    for (const side of [-1, 1]) for (let i = -3; i <= 3; i++) {
      const bar = .46, offset = i * (width - bar) / 6;
      this.box(stripeWidth, .018, bar, '#efe9ce', x + side * crossing, -.705, z + offset, outer);
      this.box(bar, .018, stripeWidth, '#efe9ce', x + offset, -.705, z + side * crossing, outer);
    }
    for (let along = -40; along <= 40; along += 3) {
      if (Math.abs(along - x) > crossing + stripeWidth / 2 + .8) this.box(1.35, .012, .07, '#f5e8c5', along, -.709, z, outer);
      if (Math.abs(along - z) > crossing + stripeWidth / 2 + .8) this.box(.07, .012, 1.35, '#f5e8c5', x, -.709, along, outer);
      for (const side of [-1, 1]) {
        if (Math.abs(along - x) > half) this.box(.025, .01, 1.4, '#c4b79d', along, -.604, z + side * (half + .75), outer);
        if (Math.abs(along - z) > half) this.box(1.4, .01, .025, '#c4b79d', x + side * (half + .75), -.604, along, outer);
      }
    }
    const line = stop - .9;
    for (const side of [-1, 1]) {
      this.box(.1, .018, 2.05, '#f0e4c4', x + side * line, -.705, z + side * 1.1, outer);
      this.box(2.05, .018, .1, '#f0e4c4', x - side * 1.1, -.705, z + side * line, outer);
    }
    this.signals = [];
    for (const [sx, sz, axis, angle] of [
      [x + half + .65, z - line, 'vertical', Math.PI], [x - half - .65, z + line, 'vertical', 0],
      [x + line, z - half - .65, 'horizontal', Math.PI / 2], [x - line, z + half + .65, 'horizontal', -Math.PI / 2]
    ]) {
      const pole = this.group(sx, -.61, sz, outer); pole.rotation.y = angle;
      this.box(.12, 2.3, .12, '#536e60', 0, 1.15, 0, pole);
      this.box(.42, 1.04, .24, '#40584f', 0, 2.42, 0, pole);
      for (const [i, color] of ['red', 'yellow', 'green'].entries()) {
        const lamps = [-.14, .14].map(depth => this.sphere(.105, '#526359', 0, 2.73 - i * .3, depth, pole));
        this.signals.push({ axis, color, lamps });
      }
      this.box(.32, .65, .24, '#40584f', .47, 1.86, 0, pole);
      for (const [i, color] of ['red', 'green'].entries()) {
        const lamps = [-.14, .14].map(depth => this.sphere(.09, '#526359', .47, 2.02 - i * .3, depth, pole));
        this.signals.push({ axis: 'pedestrian', color, lamps });
      }
    }
    this.updateSignals({ horizontal: 'green', vertical: 'red', pedestrian: 'red' });
  }

  updateSignals(signal) {
    const colors = { red: '#f06e59', yellow: '#f4c65f', green: '#7bd193' };
    for (const light of this.signals) {
      const active = signal[light.axis] === light.color;
      const key = 'signal/' + (active ? light.color : 'off');
      if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({
        color: active ? colors[light.color] : '#344c43', emissive: active ? colors[light.color] : '#000000', emissiveIntensity: active ? .8 : 0, roughness: .5
      }));
      for (const lamp of light.lamps) lamp.material = this.materials.get(key);
    }
  }

  buildRoom() {
    this.box(ROOM.width, .48, ROOM.depth, '#7f9a78', 0, -.42, 0, this.scene, .22);
    this.box(18.7, .25, 14.15, '#ba8d59', 0, -.14, 0, this.scene, .11);
    for (let ix = 0; ix < 18; ix++) {
      for (let iz = 0; iz < 14; iz++) {
        const kitchen = ix >= 11;
        const colors = kitchen ? ['#e5e2c4', '#a7c7b4'] : ['#d7b582', '#dabb8c', '#d3ae79'];
        const color = colors[kitchen ? (ix + iz) % 2 : (ix * 7 + iz) % 3];
        this.box(.987, .07, .987, color, ix - 8.5, .005, iz - 6.5, this.scene, .018);
        if (!kitchen) {
          this.box(.012, .003, .88, '#b39363', ix - 8.5 + .28, .043, iz - 6.5, this.scene, .002).castShadow = false;
        }
      }
    }
    this.box(18.55, 2.55, .21, '#f0dfb5', 0, 1.22, -7.02);
    this.box(18.55, .84, .25, '#8fb3a2', 0, .42, -6.97);
    this.box(18.65, .09, .3, '#698f7f', 0, .89, -6.97);
    for (let x = -9; x < 9; x += .7) this.box(.03, .78, .035, '#729987', x, .42, -6.81);
    this.box(.22, 2.5, 14.05, '#ebdbb8', -9.18, 1.2, -.05);
    this.box(.26, .83, 14.05, '#9bb5a0', -9.16, .4, -.05);
    this.box(.3, .09, 14.15, '#6f9079', -9.15, .86, -.05);
    this.box(18.65, .13, .33, '#b89869', 0, 2.53, -7.02);
    this.box(.34, .13, 14.15, '#b89869', -9.18, 2.53, -.05);
    // The two open edges keep furniture and routes readable from the fixed camera.
    this.box(8.7, .12, .15, '#b38b58', -4.9, .07, 7.0);
    this.box(7.6, .12, .15, '#b38b58', 5.45, .07, 7.0);
    this.door = this.group(L.door[0], 0, L.door[1]);
    for (const x of [-1.02, 1.02]) this.box(.15, 2.45, .2, '#638d7b', x, 1.18, 0, this.door);
    this.box(2.2, .17, .23, '#638d7b', 0, 2.4, 0, this.door);
    this.box(1.85, .3, .17, '#ead9ae', 0, 2.67, 0, this.door);
    this.text('欢迎光临', 1.5, .24, '#58745e', null, 0, 2.67, .1, this.door);
    const leaf = this.group(-.925, 0, 0, this.door);
    leaf.rotation.y = Math.PI * .48;
    this.box(1.84, 2.24, .08, '#9fb9a4', .92, 1.18, 0, leaf);
    this.box(1.53, 1.43, .1, '#c0d8ce', .92, 1.43, 0, leaf);
    this.sphere(.06, '#c69d59', 1.63, 1.02, .09, leaf);
    const ramp = this.box(1.9, .12, 1.4, '#c7b591', L.door[0], -.25, 7.55);
    ramp.rotation.x = .38;
    this.box(7.7, .18, .85, '#c7b591', 5.35, -.42, 7.4);
    for (let i = 0; i < 6; i++) this.cylinder(.19, .025, '#eadbb9', 2.2 + i * .94, -.28, 7.4);

    this.box(.15, .12, 14, '#b38b58', 9.05, .07, 0);
    this.window(-4.65, 1.78, -6.85);
    this.box(2.3, 1.32, .1, '#9f754c', -.85, 1.68, -6.8);
    this.box(2.08, 1.12, .05, '#3f5f50', -.85, 1.68, -6.71);
    this.text('今日小馆', 1.55, .43, '#f5e6bc', null, -.85, 1.98, -6.67);
    this.text('煮好每一点进展', 1.65, .4, '#d3d9ac', null, -.85, 1.59, -6.66);
    this.text('—  OPEN  —', 1.5, .27, '#d6c49b', null, -.85, 1.3, -6.66);
    this.plant(-8.3, 6.1, 1.25);
    this.plant(-8.25, -5.7, .85);
    this.plant(8.15, 6.1, 1.15);
    this.box(1.4, .04, .75, '#91a98b', L.door[0], .06, 6.4);
    for (let i = 0; i < 6; i++) this.box(.015, .01, .58, '#bcc5a4', L.door[0] - .525 + i * .21, .09, 6.4);
    this.text('BUG BISTRO', 3.4, .44, '#e9e4c7', null, 0, -.38, 7.28);
    // A few garden stones make the platform feel like a little diorama.
    [[-9.6, 5.7], [-9.7, 4.7], [9.6, 5.4], [-8.5, 7.5], [7.8, 7.5]].forEach(([x, z], i) => {
      const stone = this.sphere(.18, '#bdc7aa', x, -.43, z);
      stone.scale.set(1.7, .6, 1.2);
      if (i % 2) this.plant(x, z, .45, -.45);
    });
  }

  window(x, y, z) {
    this.box(3.25, 1.55, .14, '#c29a67', x, y, z);
    this.box(3.02, 1.31, .07, '#b5d7ce', x, y, z + .09);
    this.sphere(.22, '#f5dc9f', x + .85, y + .3, z + .14).scale.z = .12;
    for (let i = 0; i < 4; i++) {
      const hill = this.sphere(.6, i % 2 ? '#93b898' : '#a5c4a6', x - 1.1 + i * .7, y - .64, z + .16);
      hill.scale.set(1, .7, .05);
    }
    this.box(.09, 1.4, .12, '#f9eccf', x, y, z + .2);
    this.box(3.1, .08, .12, '#f9eccf', x, y, z + .2);
    this.box(3.45, .12, .43, '#bf925f', x, y - .8, z + .14);
    this.box(.48, 1.4, .11, '#e5c788', x - 1.35, y, z + .25);
    this.box(.48, 1.4, .11, '#e5c788', x + 1.35, y, z + .25);
    for (let i = 0; i < 4; i++) this.box(.035, 1.35, .03, '#d5b675', x - 1.52 + i * .12, y, z + .32);
  }

  cabinet(x, z, color = P.mint, w = 1.35) {
    const group = this.group(x, 0, z);
    this.box(w, 1.07, 1.05, color, 0, .59, 0, group);
    this.box(w + .12, .16, 1.18, '#f0e5ce', 0, 1.2, 0, group);
    this.box(w - .18, .75, .035, color, 0, .59, .54, group);
    this.box(.28, .05, .07, '#d7d0ad', 0, .88, .59, group);
    this.box(w - .08, .09, .05, '#5c887a', 0, .16, .55, group);
    return group;
  }

  dish(x, y, z, parent = this.scene, kind = 0) {
    const group = this.group(x, y, z, parent);
    this.cylinder(.31, .06, '#fdf5dc', 0, .03, 0, group);
    this.cylinder(.25, .022, '#d6dfcb', 0, .073, 0, group);
    if (kind % 3 === 0) {
      const rice = this.sphere(.2, '#f4d895', 0, .13, 0, group);
      rice.scale.y = .5;
      for (let i = 0; i < 7; i++) this.sphere(.037, i % 2 ? '#e8a36b' : '#89a35c', Math.sin(i * 2.4) * .13, .18, Math.cos(i * 2.4) * .13, group);
    } else if (kind % 3 === 1) {
      this.cylinder(.22, .12, '#e3b17a', 0, .14, 0, group, .26);
      this.cylinder(.22, .015, '#a67545', 0, .21, 0, group);
      for (let i = 0; i < 5; i++) this.box(.28, .025, .025, '#f4d094', (i - 2) * .014, .24, (i - 2) * .05, group).rotation.y = .4;
      this.sphere(.07, '#79a265', .07, .25, .06, group);
    } else {
      for (let i = 0; i < 3; i++) {
        const bun = this.sphere(.11, '#f8e7c2', Math.sin(i * 2.1) * .12, .15, Math.cos(i * 2.1) * .12, group);
        bun.scale.set(1, .7, .6);
      }
    }
    return group;
  }

  buildKitchen() {
    this.prep = this.group(.5, 0, -2, this.scene, 'todo');
    for (let x = 1.8; x < 5.5; x += 1.4) this.prep.add(this.cabinet(x, -4.15));
    this.box(1.03, .055, .73, '#c09562', 3.2, 1.32, -4.1, this.prep);
    this.ingredients = Array.from({ length: 6 }, (_, i) => {
      const crate = this.group(1.5 + i % 3 * .9, 1.32, -4.2 + Math.floor(i / 3) * .3, this.prep);
      this.box(.55, .09, .37, '#b6ba92', 0, .04, 0, crate);
      for (let j = 0; j < 3; j++) {
        const food = this.sphere(.11, ['#d78759', '#8ea662', '#e7bf70'][i % 3], (j - 1) * .14, .15, 0, crate);
        food.scale.set(.8, 1.1, .85);
      }
      return crate;
    });
    this.box(1.28, 2.35, 1.25, '#d3ded0', 6.12, 1.2, -4.0, this.prep, .13);
    this.box(1.15, 1.32, .06, '#e6e9da', 6.12, 1.57, -3.34, this.prep);
    this.box(1.15, .7, .06, '#c5d4c6', 6.12, .47, -3.34, this.prep);
    this.box(.07, .47, .09, '#86a89a', 5.7, 1.57, -3.27, this.prep);
    this.box(.07, .25, .09, '#86a89a', 5.7, .52, -3.27, this.prep);
    this.box(.18, .19, .01, '#e2b268', 6.35, 1.75, -3.3, this.prep).rotation.z = .15;
    this.box(3.1, .12, .6, '#bb9163', 3.25, 2.1, -4.7, this.prep);
    for (let i = 0; i < 5; i++) {
      this.cylinder(.095, .28 + i % 2 * .08, ['#bb7b51', '#dccba1', '#8eaa89'][i % 3], 2.05 + i * .44, 2.3, -4.65, this.prep);
      this.cylinder(.11, .05, '#866c4d', 2.05 + i * .44, 2.47 + i % 2 * .08, -4.65, this.prep);
    }
    this.prep.attach(this.plant(5.1, -5.65, .4, 2.16));
    this.stove = this.group(6.8, 0, -.35, this.scene, 'cooking');
    this.flames = this.group(0, 0, 0, this.stove);
    this.flameTips = [];
    this.box(1.5, 1.05, 2.65, '#739b8d', 0, .57, 0, this.stove);
    this.box(1.67, .14, 2.8, '#dbddd0', 0, 1.18, 0, this.stove);
    this.box(.035, .69, 1.8, '#547b6e', -.77, .57, 0, this.stove);
    this.box(.04, .48, 1.5, '#435c50', -.8, .62, 0, this.stove);
    this.box(.06, .07, .68, '#b4bfa9', -.85, .93, 0, this.stove);
    for (let z of [-.75, .6]) {
      this.cylinder(.47, .04, '#4e6053', 0, 1.29, z, this.stove);
      this.cylinder(.35, .05, '#d7ae6c', 0, 1.32, z, this.stove);
      this.buildBurner(z);
      this.cylinder(.39, .16, '#464f43', 0, 1.57, z, this.stove, .43);
      this.cylinder(.34, .015, '#ce9361', 0, 1.66, z, this.stove);
      this.box(.61, .09, .13, '#4f5548', -.58, 1.60, z, this.stove).rotation.z = -.12;
      for (let i = 0; i < 5; i++) this.sphere(.075, i % 2 ? '#83a168' : '#e8ba79', Math.sin(i * 2) * .23, 1.70, z + Math.cos(i * 2) * .22, this.stove);
    }
    this.pass = this.group(3, 0, .5, this.scene, 'ready');
    this.box(1.2, 1.05, 3.45, '#d49964', 0, .55, 0, this.pass);
    this.box(1.42, .18, 3.65, '#f5e7c7', 0, 1.18, 0, this.pass);
    for (let z = -1.28; z <= 1.4; z += .66) this.box(.035, .8, .035, '#bb8559', -.61, .61, z, this.pass);
    this.text('出餐', 1.04, .3, '#f6e2b6', '#b1794f', 0, .65, 1.735, this.pass);
    this.readyDishes = Array.from({ length: 4 }, (_, i) => this.dish(0, 1.29, -1.14 + i * .72, this.pass, i));
    this.bell = this.group(-.03, 1.28, 1.5, this.pass);
    this.cylinder(.16, .04, '#9c8e62', 0, .02, 0, this.bell);
    const bell = this.sphere(.13, '#dfbd6a', 0, .055, 0, this.bell);
    bell.scale.y = .6;
    this.sphere(.035, '#9a8151', 0, .16, 0, this.bell);
    // Counter-side props remain outside the waiter's circulation strip.
    this.box(.95, .73, .84, '#acb59c', 5, .4, 4.4);
    this.box(1.1, .09, 1, '#eddfbd', 5, .81, 4.4);
    for (let i = 0; i < 4; i++) this.cylinder(.23, .04, '#f8eed7', 5, .89 + i * .045, 4.4);
    this.plant(6.1, 4.5, .6);
  }

  buildBurner(z) {
    const blue = new THREE.MeshBasicMaterial({ color: '#55baff', toneMapped: false });
    const amber = new THREE.MeshBasicMaterial({ color: '#ff9d26', toneMapped: false });
    const core = new THREE.MeshBasicMaterial({ color: '#ffe6a3', toneMapped: false });
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const flame = this.group(Math.cos(angle) * .4, 1.32, z + Math.sin(angle) * .4, this.flames);
      const base = this.sphere(.065, '#55baff', 0, .04, 0, flame);
      base.material = blue; base.scale.set(1, .8, 1);
      const tip = this.mesh(new THREE.ConeGeometry(.055, .20, 8), '#ff9d26', 0, .12, 0, flame);
      tip.material = amber;
      const center = this.mesh(new THREE.ConeGeometry(.027, .12, 8), '#ffe6a3', 0, .09, .015, flame);
      center.material = core;
      for (const mesh of flame.children) { mesh.castShadow = false; mesh.receiveShadow = false; }
      this.flameTips.push(flame);
    }
  }

  chair(x, z, rotation = 0) {
    const c = this.group(x, 0, z);
    c.rotation.y = rotation;
    this.box(.7, .15, .67, '#cf9a62', 0, .52, 0, c);
    for (let dx of [-.24, .24]) for (let dz of [-.23, .23]) this.box(.09, .46, .09, '#9d7049', dx, .23, dz, c);
    this.box(.7, .58, .11, '#bd8854', 0, .89, -.28, c);
    this.box(.56, .38, .04, '#d3aa73', 0, .91, -.205, c);
    return c;
  }

  buildDining() {
    this.tableDishes = [];
    this.chairs = [];
    this.tables = TABLES.map(([x, z], i) => {
      const table = this.group(x, 0, z, this.scene, i);
      for (let dx of [-.59, .59]) for (let dz of [-.48, .48]) this.box(.14, 1.02, .14, '#a7784a', dx, .53, dz, table);
      this.box(1.88, .22, 1.6, '#bd8c58', 0, 1.07, 0, table, .13);
      this.box(1.82, .08, 1.55, '#dfb97d', 0, 1.2, 0, table, .09);
      this.box(.63, .01, 1.58, '#e8d6af', -.38, 1.25, 0, table, .004);
      this.chairs.push(this.chair(x, z - 1.12), this.chair(x - 1.3, z, Math.PI / 2));
      this.cylinder(.08, .2, '#e1c5a0', -.6, 1.35, -.4, table);
      this.sphere(.11, '#8da46b', -.6, 1.5, -.4, table);
      this.box(.22, .055, .3, '#fcf2da', .55, 1.28, -.4, table).rotation.y = .2;
      this.cylinder(.055, .18, '#c6d5c2', .58, 1.36, .45, table);
      this.tableDishes.push(this.dish(0, 1.27, .05, table, i));
      this.text(String(i + 1).padStart(2, '0'), .3, .23, '#f7e8c6', null, .2, .97, .82, table);
      return table;
    });
    const sideboard = this.cabinet(-2.9, -5.15, '#bba06b', 1.25);
    this.box(.52, .05, .53, '#dbd3ac', 0, 1.31, 0, sideboard);
    for (let i = 0; i < 4; i++) this.cylinder(.18, .04, '#f7e7c5', 0, 1.36 + i * .045, 0, sideboard);
  }

  character(role, color, variant = 0) {
    const root = this.group();
    const body = this.group(0, 0, 0, root);
    const skin = ['#efc69a', '#dfb28a', '#f2cfaa'][variant % 3];
    const torso = this.sphere(.35, color, 0, .78, 0, body);
    torso.scale.set(1, 1.18, .86);
    const apron = this.box(.43, .46, .075, role === 'chef' ? '#ddc9a2' : role !== 'guest' ? '#e6dfb9' : color, 0, .69, .275, body, .08);
    if (role !== 'guest') {
      this.box(.1, .29, .045, '#ede6cb', -.16, .98, .265, body);
      this.box(.1, .29, .045, '#ede6cb', .16, .98, .265, body);
      this.box(.23, .13, .025, role === 'chef' ? '#b49c76' : '#b5c5a0', 0, .65, .322, body);
    } else apron.visible = false;
    const head = this.group(0, 1.27, 0, body);
    this.sphere(.31, skin, 0, 0, 0, head).scale.set(1, 1.02, .94);
    this.sphere(.077, skin, -.3, -.015, 0, head);
    this.sphere(.077, skin, .3, -.015, 0, head);
    for (let x of [-.11, .11]) {
      const eye = this.sphere(.027, '#3f4235', x, .025, .272, head);
      eye.scale.y = 1.25;
      this.sphere(.038, '#e3a48b', x * 1.55, -.06, .25, head).scale.set(1, .5, .3);
    }
    this.sphere(.048, '#dfab80', 0, -.022, .294, head);
    this.box(.07, .018, .015, '#9c7359', 0, -.115, .275, head);
    if (role === 'chef') {
      this.cylinder(.29, .17, '#fff7e9', 0, .3, 0, head);
      for (let i = 0; i < 5; i++) this.sphere(.19, '#fff7e9', Math.sin(i * 1.26) * .19, .46 + i % 2 * .035, Math.cos(i * 1.26) * .15, head);
      this.sphere(.21, '#fff7e9', 0, .51, 0, head);
      this.box(.12, .035, .025, '#6b5140', -.14, .135, .25, head).rotation.z = .12;
      this.box(.12, .035, .025, '#6b5140', .14, .135, .25, head).rotation.z = -.12;
    } else {
      const hair = this.sphere(.313, role === 'waiter' ? '#70533c' : ['#6b5040', '#a67546', '#4c5042'][variant % 3], 0, .11, -.035, head);
      hair.scale.y = .7;
      this.sphere(.12, role === 'waiter' ? '#70533c' : '#6b5040', -.18, .13, .17, head);
      if (role === 'waiter' || role === 'runner') {
        this.cylinder(.29, .12, role === 'runner' ? '#c19466' : '#78957a', 0, .33, 0, head);
        this.box(.48, .045, .25, role === 'runner' ? '#b18155' : '#6c896e', 0, .3, .22, head);
      }
      if (variant === 1) {
        for (let x of [-.115, .115]) {
          const ring = this.mesh(new THREE.TorusGeometry(.074, .009, 6, 16), '#7c6850', x, .028, .289, head);
          ring.castShadow = false;
        }
      }
    }
    const hands = [];
    const arms = [-1, 1].map(sign => {
      const pivot = this.group(sign * .3, .94, 0, body);
      this.sphere(.12, color, sign * .03, -.1, .01, pivot).scale.y = 1.5;
      hands.push(this.sphere(.105, skin, sign * .07, -.27, .055, pivot));
      pivot.rotation.z = sign * .16;
      return pivot;
    });
    const legs = [-1, 1].map(sign => {
      const pivot = this.group(sign * .15, .45, 0, root);
      this.box(.18, .28, .2, role === 'guest' ? '#626e60' : '#5e6e5b', 0, -.11, 0, pivot, .05);
      this.box(.22, .14, .32, '#5c5948', 0, -.32, .055, pivot, .06);
      return pivot;
    });
    const tray = this.group(0, 1.13, .64, body);
    this.cylinder(.39, .035, '#b98f60', 0, 0, 0, tray);
    if (role === 'runner') {
      this.box(.63, .18, .5, '#b88b57', 0, .1, 0, tray);
      for (let i = 0; i < 6; i++) this.sphere(.09, ['#d68d51', '#91a765', '#edcf87'][i % 3], (i % 3 - 1) * .17, .25, Math.floor(i / 3) * .2 - .1, tray);
    } else this.dish(0, .015, 0, tray, 0).scale.setScalar(.87);
    tray.visible = false;
    const tool = this.group(0, 0, 0, hands[1]);
    tool.rotation.x = .25;
    this.box(.065, .065, .64, '#8d6b42', 0, 0, .25, tool);
    this.box(.22, .045, .30, '#bfc6b1', 0, 0, .72, tool);
    for (const x of [-.06, 0, .06]) this.box(.016, .004, .17, '#7a897d', x, .025, .72, tool);
    tool.visible = role === 'chef';
    root.userData.parts = { body, head, arms, hands, legs, tray, tool };
    root.scale.setScalar(role === 'chef' ? 1.23 : 1.15);
    return root;
  }

  pose(root, t, action, progress = 0) {
    const { body, head, arms, legs, tray, tool } = root.userData.parts;
    const walk = action === 'walk' || action === 'carry';
    const handoff = action === 'pickup' || action === 'putdown';
    const carry = action === 'carry' || action === 'hold';
    const p = Math.max(0, Math.min(1, progress)), smooth = p * p * (3 - 2 * p);
    const lift = action === 'pickup' ? smooth : action === 'putdown' ? 1 - smooth : Number(carry);
    const reach = handoff ? Math.sin(p * Math.PI) : 0;
    body.rotation.x = reach * .12;
    tray.position.y = 1.13 - reach * .12;
    tray.position.z = .64 + reach * .14;
    body.position.y = walk ? Math.abs(Math.sin(t * 10)) * .055 : Math.sin(t * 2.5) * .018;
    body.rotation.z = walk ? Math.sin(t * 10) * .035 : 0;
    head.rotation.y = action === 'eat' ? Math.sin(t * 2) * .08 : Math.sin(t * 1.4) * .035;
    for (let i = 0; i < 2; i++) {
      arms[i].position.y = .94 + lift * .29;
      legs[i].rotation.x = walk ? Math.sin(t * 10 + i * Math.PI) * .53 : 0;
      arms[i].rotation.x = handoff ? -1.05 * lift - reach * .15 : carry ? -1.05 : action === 'cook' ? -2.15 + Math.sin(t * 5 + i * 2) * .12 : action === 'eat' ? -.5 + Math.sin(t * 5 + i * 2) * .3 : walk ? Math.sin(t * 10 + i * Math.PI) * -.4 : 0;
    }
    if (tool.visible) {
      // Counter-rotate the wrist: the arm lifts the hand while the spatula reaches into the pan.
      tool.rotation.x = action === 'cook' ? -arms[1].rotation.x - .25 : .7;
      tool.rotation.y = .2;
    }
    tray.visible = carry;
  }

  route(points, progress) {
    const distances = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    let remaining = distances.reduce((a, b) => a + b, 0) * progress;
    for (let i = 0; i < distances.length; i++) {
      if (remaining <= distances[i] || i === distances.length - 1) {
        const fraction = distances[i] ? remaining / distances[i] : 0;
        const a = points[i], b = points[i + 1];
        return { x: THREE.MathUtils.lerp(a[0], b[0], fraction), z: THREE.MathUtils.lerp(a[1], b[1], fraction), angle: Math.atan2(b[0] - a[0], b[1] - a[1]) };
      }
      remaining -= distances[i];
    }
  }

  notice(key, title, xyz, filter) {
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'world-label';
    label.dataset.filter = filter;
    label.setAttribute('aria-label', `${title}，查看 Bug 明细`);
    label.innerHTML = `${title}<em></em>`;
    this.labels.append(label);
    this[key + 'Label'] = { element: label, point: new THREE.Vector3(...xyz), filter };
  }

  setCamera(index) {
    this.cameraIndex = ((index % 2) + 2) % 2;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(...(this.cameraIndex === 1 ? [0, 22, 27] : [12, 20, 24]));
    this.camera.lookAt(0, .2, .2);
    this.camera.updateMatrixWorld();
    this.resize();
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas.parentElement;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    Object.assign(this.camera, cameraFrame(width, height, this.cameraIndex));
    this.camera.updateProjectionMatrix();
  }

  render(state) {
    const t = this.animated ? state.time : 0;
    const chefActive = Boolean(state.chef.orderId);
    this.pose(this.chef, t, chefActive ? 'cook' : 'idle');
    this.flames.visible = chefActive;
    this.flameTips.forEach((flame, i) => {
      flame.scale.y = .88 + Math.sin(t * 12 + i * 1.7) * .2;
      flame.rotation.z = Math.sin(t * 9 + i) * .1;
    });
    const supply = state.runner;
    const carrying = ['travel', 'putdown', 'waiting'].includes(supply.phase);
    this.ingredients.forEach((item, i) => { item.visible = i < Math.min(6, state.counts.todo - Number(carrying)); });
    const supplyPose = supply.pose;
    this.runner.position.set(supplyPose.x, .03, supplyPose.z);
    this.runner.rotation.y = ['idle', 'pickup'].includes(supply.phase) ? Math.PI : supplyPose.angle;
    const supplyAction = this.animated && ['pickup', 'putdown'].includes(supply.phase) ? supply.phase : null;
    this.pose(this.runner, t, supplyAction || (carrying ? supply.pose.moving && this.animated ? 'carry' : 'hold' : supply.pose.moving && this.animated ? 'walk' : 'idle'), supply.progress);
    this.runner.userData.parts.tray.visible = carrying;
    const waiting = state.orders.filter(o => o.delivery === 'waiting').length;
    this.readyDishes.forEach((item, i) => { item.visible = i < waiting; });
    this.steam.forEach((puff, i) => {
      puff.visible = chefActive && this.animated;
      const f = (t * .55 + i / 9) % 1;
      puff.position.set(6.8 + Math.sin(t + i * 1.4) * .16 + f * .22, 1.80 + f * 1.1, i % 2 ? .25 : -1.05);
      puff.scale.setScalar(.5 + f * 1.6);
      puff.material.opacity = (1 - f) * .4;
    });
    const waiter = state.waiter;
    const pose = { ...waiter.pose };
    if (waiter.phase === 'putdown') pose.angle = waiter.side === 0 ? -Math.PI / 2 : Math.PI / 2;
    this.waiter.position.set(pose.x, .03, pose.z);
    this.waiter.rotation.y = pose.angle;
    const carry = ['travel', 'putdown'].includes(waiter.phase);
    const waiterAction = this.animated && ['pickup', 'putdown'].includes(waiter.phase) ? waiter.phase : null;
    this.pose(this.waiter, t, waiterAction || (carry ? waiter.pose.moving && this.animated ? 'carry' : 'hold' : waiter.pose.moving && this.animated ? 'walk' : 'idle'), waiter.progress);
    // A carried plate remains visible even when motion is disabled.
    this.waiter.userData.parts.tray.visible = carry;
    if (!this.animated && carry) this.waiter.userData.parts.arms.forEach(arm => { arm.rotation.x = -1.05; });
    this.renderGuests(state, t);
    this.traffic.update(state, this.animated && this.exterior.visible);
    this.updateBubbles(state);
    this.camera.updateMatrixWorld();
    const { clientWidth: width, clientHeight: height } = this.canvas;
    for (const label of [this.prepLabel, this.stoveLabel, this.passLabel]) {
      const p = label.point.clone().project(this.camera);
      label.element.style.left = `${(p.x + 1) * width / 2}px`;
      label.element.style.top = `${(1 - p.y) * height / 2}px`;
      label.element.querySelector('em').textContent = state.counts[label.filter];
    }
    this.renderer.render(this.scene, this.camera);
  }

  renderGuests(state, t) {
    const active = new Set(state.guests.map(g => g.id));
    for (const [id, actor] of this.guestActors) {
      if (!active.has(id)) { actor.visible = false; this.guestActors.delete(id); }
    }
    this.tableDishes.forEach(dish => { dish.visible = false; });
    for (const g of state.guests) {
      let actor = this.guestActors.get(g.id);
      if (!actor) {
        actor = this.guestPool.find(a => !a.visible);
        if (!actor) {
          actor = this.character('guest', ['#d68d78', '#bba365', '#719aaa', '#c29982'][g.variant], g.variant);
          actor.scale.setScalar(1.04);
          this.guestPool.push(actor);
        }
        actor.visible = true; this.guestActors.set(g.id, actor);
      }
      const seated = ['sitting', 'waiting', 'delivery', 'eat', 'happy', 'standing'].includes(g.phase);
      const s = g.table === null ? null : L.seat(g.table, g.side);
      const pos = { ...g.pose, angle: seated ? s.angle : g.pose.angle };
      let blend = seated ? 1 : 0;
      if (g.phase === 'sitting') blend = g.progress;
      if (g.phase === 'standing') blend = 1 - g.progress;
      const ground = THREE.MathUtils.lerp(.03, -.55, THREE.MathUtils.clamp((pos.z - 7) / .9, 0, 1));
      actor.position.set(pos.x, ground + .18 * blend, pos.z);
      actor.rotation.y = pos.angle;
      actor.userData.filter = g.orderId ? 'bug:' + g.orderId : g.table;
      const walking = g.pose.moving;
      this.pose(actor, this.animated ? t + g.variant : 0, g.phase === 'eat' && this.animated ? 'eat' : walking && this.animated ? 'walk' : 'idle');
      if (seated) actor.userData.parts.legs.forEach(leg => { leg.rotation.x = -Math.PI / 2 * blend; });
      actor.userData.parts.arms.forEach((arm, i) => { arm.rotation.z = g.phase === 'happy' && this.animated ? (i ? -1 : 1) * 2.1 : (i ? 1 : -1) * .16; });
      if (g.phase === 'eat' || g.phase === 'happy') {
        const dish = this.tableDishes[g.table];
        dish.visible = true; dish.position.x = s.dish[0]; dish.position.z = s.dish[1];
      }
    }
  }

  updateBubbles(state) {
    const { clientWidth: stageWidth, clientHeight: stageHeight } = this.canvas;
    const clearTop = document.body.matches('.desktop-mode,.preview,.fullscreen-mode') ? 12 : 185;
    const wanted = [];
    const w = state.waiter;
    if (['pickup', 'travel', 'putdown'].includes(w.phase)) wanted.push({ key: 'waiter', actor: this.waiter, id: w.orderId, caption: '正在上餐' });
    for (const g of state.guests) if (g.phase === 'eat') wanted.push({ key: g.id, actor: this.guestActors.get(g.id), id: g.orderId, caption: '正在享用' });
    const keys = new Set(wanted.map(b => b.key));
    for (const [key, node] of this.bubbleNodes) if (!keys.has(key)) { node.remove(); this.bubbleNodes.delete(key); }
    const occupied = [this.prepLabel, this.stoveLabel, this.passLabel].map(label => {
      const p = label.point.clone().project(this.camera);
      return { x: (p.x + 1) * stageWidth / 2 - 55, y: (1 - p.y) * stageHeight / 2 - 50, w: 110, h: 50 };
    });
    for (const bubble of wanted) {
      const order = state.orders.find(o => o.id === bubble.id);
      if (!order) continue;
      let node = this.bubbleNodes.get(bubble.key);
      if (!node) {
        node = document.createElement('button'); node.type = 'button'; node.className = 'bug-bubble';
        node.append(document.createElement('small'), document.createElement('span'));
        this.bubbleLayer.append(node); this.bubbleNodes.set(bubble.key, node);
      }
      node.dataset.bug = order.id;
      node.title = order.title; node.setAttribute('aria-label', `${bubble.caption}：${order.title}，查看 Bug 明细`);
      node.firstChild.textContent = bubble.caption + ' · ' + order.id;
      node.lastChild.textContent = order.title;
      const p = bubble.actor.position.clone(); p.y += 2.05; p.project(this.camera);
      const headX = (p.x + 1) * stageWidth / 2, headY = (1 - p.y) * stageHeight / 2;
      const width = node.offsetWidth, height = node.offsetHeight;
      let rect;
      for (let row = 0; row < 6; row++) {
        const x = THREE.MathUtils.clamp(headX - width / 2 + (row % 2 ? 35 : 0), 12, stageWidth - width - 12);
        const y = Math.max(clearTop, headY - height - 8 - Math.floor(row / 2) * (height + 12));
        rect = { x, y, w: width, h: height };
        if (!occupied.some(o => rect.x < o.x + o.w + 6 && rect.x + rect.w + 6 > o.x && rect.y < o.y + o.h + 6 && rect.y + rect.h + 6 > o.y)) break;
      }
      occupied.push(rect);
      node.style.left = rect.x + 'px'; node.style.top = rect.y + 'px';
      node.style.setProperty('--stem', `${THREE.MathUtils.clamp(headX - rect.x, 12, width - 12)}px`);
    }
  }

  hit(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const intersections = this.ray.intersectObjects(this.scene.children, true);
    for (const hit of intersections) {
      if (!hit.object.visible) continue;
      let object = hit.object;
      let visible = true, filter = null;
      while (object) {
        if (!object.visible) visible = false;
        if (object.userData.filter !== undefined) filter = object.userData.filter;
        object = object.parent;
      }
      if (!visible) continue;
      // Only the nearest visible surface can be clicked through.
      return filter;
    }
    return null;
  }

  inspect() {
    const { hands, tool } = this.chef.userData.parts;
    this.scene.updateMatrixWorld(true);
    return {
      room: { ...ROOM },
      door: this.door.position.toArray(),
      guests: [...this.guestActors].map(([id, actor]) => ({ id, position: actor.position.toArray(), angle: actor.rotation.y, filter: actor.userData.filter })),
      guestPoolSize: this.guestPool.length,
      traffic: this.traffic.inspect(),
      bubbles: [...this.bubbleNodes.values()].map(n => ({ id: n.dataset.bug, title: n.lastChild.textContent })),
      pass: { position: this.pass.position.toArray(), width: 1.42 },
      runner: { position: this.runner.position.toArray(), carrying: this.runner.userData.parts.tray.visible, route: SUPPLY_ROUTE.map(point => [...point]) },
      deliveryRoutes: ROUTES.map(route => route.map(point => [...point])),
      tables: this.tables.map(table => table.position.toArray()),
      chairs: this.chairs.map(chair => ({ position: chair.position.toArray(), rotation: chair.rotation.y })),
      gripDistance: hands[1].getWorldPosition(new THREE.Vector3()).distanceTo(tool.getWorldPosition(new THREE.Vector3())),
      toolAttached: tool.parent === hands[1],
      flames: { visible: this.flames.visible, count: this.flameTips.length, heights: this.flameTips.map(flame => flame.scale.y) }
    };
  }

  project(x, y, z) {
    const point = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (point.x + 1) * r.width / 2, y: r.top + (1 - point.y) * r.height / 2 };
  }
}
