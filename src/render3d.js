// 3D 쿼터뷰(현대 도시의 밤). 규칙(sim.js)은 건드리지 않고 판을 그리는 쪽만 맡는다.
// render.js가 window.ChimeraView를 찾아 쓴다. 글자·위쪽 표시·조이스틱·입력은 render.js의 2D 캔버스가 위에 겹쳐 그린다.
// 판 좌표 (x, y) → 3D (x, 높이, y). 카메라는 직교 투영, 45도 돌려 (+x, +y) 쪽에서 내려다본다.
// 그래서 판의 먼 쪽 두 변은 x = 0과 y = 0이고, 키 큰 건물은 그 바깥에만 세운다.
// 폰 성능: 그림자·후처리 없음, 땅 위의 표시는 버퍼 하나로 한 번에 그린다.
import * as THREE from 'three';   // 주소는 페이지의 importmap에 있다(build.cjs)
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const S = window.ChimeraSim;
const css = getComputedStyle(document.documentElement);
const tok = n => css.getPropertyValue(n).trim();
const HEX = {
  ground: tok('--ground'), grid: tok('--grid'), ink: tok('--ink'), dim: tok('--dim'), necro: tok('--necro'),
  bone: tok('--bone'), beast: tok('--beast'), armor: tok('--armor'), ranger: tok('--ranger'), danger: tok('--danger'), great: tok('--great'),
};
const COL = {};
for (const k in HEX) COL[k] = new THREE.Color(HEX[k]);
const VIEW_W = 13;                 // 화면 가로에 들어오는 판의 폭(2D와 같다)
const ELEV = 35 * Math.PI / 180;   // 내려다보는 각
const R2 = Math.SQRT1_2;

const cv3 = document.getElementById('game3d');
const dprMax = Math.min(window.devicePixelRatio || 1, 2);
const renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: dprMax < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(dprMax);
renderer.setClearColor(new THREE.Color('#0c0a11'));
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const camDir = new THREE.Vector3(Math.cos(ELEV) * R2, Math.sin(ELEV), Math.cos(ELEV) * R2);   // 목표에서 카메라 쪽
let viewW = 1, viewH = 1, cssW = 1, cssH = 1;
const target = new THREE.Vector3(S.W / 2, 0, S.H - 4);
let lastGame = null;

scene.add(new THREE.HemisphereLight(0x8a80b8, 0x1a1522, 1.6));
const sun = new THREE.DirectionalLight(0xffe6c8, 1.1);
sun.position.set(-6, 12, 4); scene.add(sun);

// ---- 재료와 모양(함께 쓴다) ----
const lam = {}, bas = {};
const lambert = k => lam[k] || (lam[k] = new THREE.MeshLambertMaterial({ color: COL[k] }));
const basic = k => bas[k] || (bas[k] = new THREE.MeshBasicMaterial({ color: COL[k] }));
const GEO = {
  horn: new THREE.ConeGeometry(0.95, 2.3, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4),   // 맹수: 앞(+x)을 향한 뿔
  box: new THREE.BoxGeometry(1.7, 1.5, 1.7),                                               // 갑주: 상자
  ball: new THREE.SphereGeometry(1, 14, 10),                                               // 사수: 공
  spike: new THREE.ConeGeometry(0.2, 0.85, 4),
  plate: new THREE.BoxGeometry(0.28, 0.9, 0.55),
  eye: new THREE.SphereGeometry(0.24, 10, 8),
  pupil: new THREE.SphereGeometry(0.11, 8, 6),
  cyl: new THREE.CylinderGeometry(0.5, 0.55, 1, 10),
  hex: new THREE.CylinderGeometry(1, 1.12, 1.5, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  wedge: new THREE.ConeGeometry(0.35, 0.9, 4).rotateZ(-Math.PI / 2),
  heart: new THREE.OctahedronGeometry(0.5, 0),
  tetra: new THREE.TetrahedronGeometry(1, 0),
  cube: new THREE.BoxGeometry(1.3, 1.3, 1.3),
  orb: new THREE.SphereGeometry(1, 10, 8),
  dot: new THREE.SphereGeometry(1, 8, 6),
  barrel: new THREE.BoxGeometry(0.9, 0.12, 0.12),
};
const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; };

// ---- 땅 위의 표시: 고리·선·원판을 삼각형으로 쌓아 한 번에 그린다 ----
class Decals {
  constructor(cap, h) {
    this.cap = cap; this.h = h; this.n = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4);
    const geo = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pa); geo.setAttribute('color', this.ca);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(S.W / 2, 0, S.H / 2), 200);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
  }
  reset() { this.n = 0; }
  v(x, z, c, a, y) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = a;
  }
  quad(ax, az, bx, bz, cx, cz, dx, dz, c, a, y) {
    if (this.n + 6 > this.cap) return;
    this.v(ax, az, c, a, y); this.v(bx, bz, c, a, y); this.v(cx, cz, c, a, y);
    this.v(ax, az, c, a, y); this.v(cx, cz, c, a, y); this.v(dx, dz, c, a, y);
  }
  line(x1, z1, x2, z2, w, c, a, y) {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1e-6, nx = -dz / L * w / 2, nz = dx / L * w / 2;
    this.quad(x1 + nx, z1 + nz, x2 + nx, z2 + nz, x2 - nx, z2 - nz, x1 - nx, z1 - nz, c, a, y == null ? this.h : y);
  }
  dashLine(x1, z1, x2, z2, w, dash, gap, off, c, a, y) {
    const L = Math.hypot(x2 - x1, z2 - z1); if (L < 1e-6) return;
    const ux = (x2 - x1) / L, uz = (z2 - z1) / L, per = dash + gap;
    for (let s = -((off % per) + per) % per; s < L; s += per) {
      const s0 = Math.max(0, s), s1 = Math.min(L, s + dash);
      if (s1 > s0) this.line(x1 + ux * s0, z1 + uz * s0, x1 + ux * s1, z1 + uz * s1, w, c, a, y);
    }
  }
  // 고리. 각도는 2D 판과 같다(0이 +x, 시계 방향이 +y 쪽)
  ring(x, z, r, w, c, a, a0, a1, y) {
    if (r <= 0) return;
    a0 = a0 || 0; a1 = a1 == null ? Math.PI * 2 : a1;
    const segs = Math.max(6, Math.min(64, Math.ceil(Math.abs(a1 - a0) * r * 4))), r0 = Math.max(0, r - w / 2), r1 = r + w / 2, yy = y == null ? this.h : y;
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + (a1 - a0) * i / segs, t1 = a0 + (a1 - a0) * (i + 1) / segs, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      this.quad(x + c0 * r0, z + s0 * r0, x + c0 * r1, z + s0 * r1, x + c1 * r1, z + s1 * r1, x + c1 * r0, z + s1 * r0, c, a, yy);
    }
  }
  dashRing(x, z, r, w, dash, gap, off, c, a, y) {
    const per = (dash + gap) / r, d = dash / r;
    for (let t = off / r % per; t < Math.PI * 2 + off / r % per - 1e-6; t += per) this.ring(x, z, r, w, c, a, t, t + d, y);
  }
  disc(x, z, r, c, a, a0, a1, y) {
    a0 = a0 || 0; a1 = a1 == null ? Math.PI * 2 : a1;
    const segs = Math.max(8, Math.min(64, Math.ceil(Math.abs(a1 - a0) * r * 3))), yy = y == null ? this.h : y;
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + (a1 - a0) * i / segs, t1 = a0 + (a1 - a0) * (i + 1) / segs;
      if (this.n + 3 > this.cap) return;
      this.v(x, z, c, a, yy); this.v(x + Math.cos(t0) * r, z + Math.sin(t0) * r, c, a, yy); this.v(x + Math.cos(t1) * r, z + Math.sin(t1) * r, c, a, yy);
    }
  }
  flush() {
    this.geo.setDrawRange(0, this.n);
    this.pa.clearUpdateRanges(); this.pa.addUpdateRange(0, this.n * 3); this.pa.needsUpdate = true;
    this.ca.clearUpdateRanges(); this.ca.addUpdateRange(0, this.n * 4); this.ca.needsUpdate = true;
  }
}
const dec = new Decals(48000, 0.03);
dec.mesh.renderOrder = 2;
scene.add(dec.mesh);

// ---- 도시(한 번만 만든다) ----
function windowTexture(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#1c1827'; x.fillRect(0, 0, 64, 128);
  const lit = ['#f2d35e', '#f5c46a', '#d9e2ff', '#a99cff'];
  for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) {
    const on = rnd() < 0.32;
    x.fillStyle = on ? lit[Math.floor(rnd() * lit.length)] : '#2a2536';
    x.globalAlpha = on ? 0.55 + rnd() * 0.35 : 1;
    x.fillRect(k * 16 + 4, r * 16 + 4, 8, 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}
function buildCity() {
  const city = new THREE.Group();
  // 땅: 아스팔트, 판 바깥은 인도
  const ground = mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: COL.ground }), S.W / 2, 0, S.H / 2);
  city.add(ground);
  const walk = new THREE.MeshLambertMaterial({ color: new THREE.Color(HEX.grid) });
  const sideL = mesh(new THREE.BoxGeometry(3, 0.18, S.H + 3), walk, -1.5, 0.09, S.H / 2 - 1.5);
  const sideT = mesh(new THREE.BoxGeometry(S.W, 0.18, 3), walk, S.W / 2, 0.09, -1.5);
  const sideR = mesh(new THREE.BoxGeometry(2, 0.12, S.H + 2), walk, S.W + 1, 0.06, S.H / 2 + 1);
  const sideB = mesh(new THREE.BoxGeometry(S.W + 2, 0.12, 2), walk, S.W / 2 + 1, 0.06, S.H + 1);
  city.add(sideL, sideT, sideR, sideB);
  // 차선과 횡단보도: 정지한 표시라 따로 한 번만 쌓는다
  const lanes = new Decals(6000, 0.01);
  lanes.line(0.12, 0, 0.12, S.H, 0.12, COL.dim, 0.5); lanes.line(S.W - 0.12, 0, S.W - 0.12, S.H, 0.12, COL.dim, 0.5);
  lanes.line(S.W / 2 - 0.12, 0, S.W / 2 - 0.12, S.H, 0.08, COL.great, 0.45); lanes.line(S.W / 2 + 0.12, 0, S.W / 2 + 0.12, S.H, 0.08, COL.great, 0.45);
  for (const lx of [S.W / 4, S.W * 3 / 4]) lanes.dashLine(lx, 0, lx, S.H, 0.1, 1.2, 1.4, 0, COL.ink, 0.22);
  for (const cy of [10.5, 21]) for (let x = 0.8; x < S.W - 0.5; x += 1.1) lanes.line(x, cy - 0.9, x, cy + 0.9, 0.55, COL.ink, 0.13);
  lanes.flush(); lanes.mesh.renderOrder = 1; city.add(lanes.mesh);
  // 건물: 판의 먼 쪽 두 변(x < 0, y < 0) 바깥에만. 가까운 쪽은 비워 판을 가리지 않는다
  const texs = [windowTexture(11), windowTexture(29), windowTexture(57)];
  const roof = new THREE.MeshLambertMaterial({ color: new THREE.Color('#14111b') });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const building = (x, z, w, d, h) => {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    // 면마다 창 크기가 같도록 UV를 넓이에 맞춘다(무늬 한 장이 가로 4, 세로 8)
    for (let f = 0; f < 6; f++) {
      const fw = f < 2 ? d : w, fh = f === 2 || f === 3 ? d : h;
      for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * fw / 4, uv.getY(i) * fh / 8); }
    }
    const fac = new THREE.MeshBasicMaterial({ map: texs[Math.floor(rnd() * texs.length)] });
    const b = new THREE.Mesh(geo, [fac, fac, roof, roof, fac, fac]);
    b.position.set(x, h / 2, z); city.add(b);
    return b;
  };
  for (let z = -3; z < S.H + 6;) { const d = 3 + Math.floor(rnd() * 3), w = 4 + Math.floor(rnd() * 4), h = 6 + Math.floor(rnd() * 9); building(-3.4 - w / 2, z + d / 2, w, d, h); z += d + 0.4; }
  for (let x = -3; x < S.W + 6;) { const w = 3 + Math.floor(rnd() * 3), d = 4 + Math.floor(rnd() * 4), h = 6 + Math.floor(rnd() * 9); building(x + w / 2, -3.4 - d / 2, w, d, h); x += w + 0.4; }
  // 네온 간판: 건물 앞면에 붙은 빛나는 막대
  const neon = [['necro', -3.35, 4, 'z'], ['danger', -3.35, 13, 'z'], ['ranger', -3.35, 22, 'z'], ['beast', 3, -3.35, 'x'], ['armor', 12, -3.35, 'x']];
  for (const [k, x, z, ax] of neon) {
    const m = mesh(ax === 'z' ? new THREE.BoxGeometry(0.12, 0.7, 2.2) : new THREE.BoxGeometry(2.2, 0.7, 0.12), basic(k), x, 3.2 + rnd() * 1.5, z);
    city.add(m);
  }
  // 가로등: 인도 위, 먼 쪽 두 변
  const pole = new THREE.MeshLambertMaterial({ color: new THREE.Color('#3a3445') }), lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const glow = new Decals(3000, 0.015);
  const lamp = (x, z) => {
    city.add(mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), pole, x, 1.3, z));
    city.add(mesh(lampGeo, basic('great'), x, 2.65, z));
    glow.disc(x + 0.9, z + 0.9, 2.2, COL.great, 0.07);
  };
  for (let z = 2; z < S.H; z += 7) lamp(-0.8, z);
  for (let x = 3; x < S.W; x += 7) lamp(x, -0.8);
  glow.flush(); glow.mesh.renderOrder = 1; city.add(glow.mesh);
  return city;
}
scene.add(buildCity());

// ---- 움직이는 것들: 판의 물체마다 3D 물체 하나. 사라지면 지운다 ----
const live = new Map();
const layer = new THREE.Group(); scene.add(layer);
function sync(obj, make) {
  let rec = live.get(obj);
  if (!rec) { rec = make(); live.set(obj, rec); layer.add(rec.root); }
  rec.seen = true;
  return rec;
}
function sweep() {
  for (const [k, rec] of live) {
    if (rec.seen) { rec.seen = false; continue; }
    layer.remove(rec.root);
    if (rec.dispose) rec.dispose();
    live.delete(k);
  }
}
const faceToY = a => -a;   // 판의 각(atan2(dy, dx)) → 3D의 y축 회전

// 키메라: 주 유전자가 몸(맹수 뿔 / 갑주 상자 / 사수 공), 섞인 유전자가 개수만큼 붙는다(가시·장갑판·눈알)
// 키메라 몸 모델(Tripo3D, 네발 뼈대와 걷기 동작). 주 유전자마다 하나씩. 아직 없거나 못 불러오면 도형 몸을 쓴다.
// 모델의 앞은 -z, 키는 약 0.82, 길이 1로 온다. 게임은 +x가 앞이므로 -90도 돌려 놓는다.
const BODY = {};
for (const kind of ['beast']) {
  new GLTFLoader().load('assets/chimera-' + kind + '.glb', gltf => { BODY[kind] = gltf; }, undefined, () => { /* 없으면 도형 몸 */ });
}
const BODY_LEN = 3.4;   // 판 위의 몸 길이 = 반지름 × 이 값(밤 도로에서 묻히지 않게 도형 몸보다 조금 크게)
function makeBodyModel(kind) {
  const src = BODY[kind], root = cloneSkinned(src.scene), mats = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = o.material.clone();   // 키메라마다 붉어지는 정도가 다르다
    o.material.transparent = true;
    if (o.material.map) { o.material.emissiveMap = o.material.map; o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = 0.5; }
    mats.push(o.material);
  });
  const holder = new THREE.Group(); holder.add(root); root.rotation.y = -Math.PI / 2;
  const mixer = new THREE.AnimationMixer(root), walk = src.animations[0] ? mixer.clipAction(src.animations[0]) : null;
  if (walk) walk.play();
  return { holder, mats, mixer, walk };
}

function unitSig(u) {
  const gn = u.genes;
  return u.main + (BODY[u.main] ? '@' : '') + (u.mutant ? '*' : '') + '|' + Math.min(u.main === 'beast' ? 0 : gn.beast, 12) + '|' + Math.min(u.main === 'armor' ? 0 : gn.armor, 8) + '|' + Math.min(u.main === 'ranger' ? 0 : gn.ranger, 8) + '|' + Math.min(gn[u.main], 5);
}
function makeUnit() {
  const root = new THREE.Group(), body = new THREE.Group(), turn = new THREE.Group();
  root.add(turn); turn.add(body);
  const skin = new THREE.MeshLambertMaterial({ color: COL.bone.clone(), transparent: true });
  const pin = mesh(GEO.cone, basic('necro')); pin.rotation.x = Math.PI; pin.scale.set(0.45, 0.5, 0.45); root.add(pin);
  const rec = { root, turn, body, skin, pin, sig: '', model: null, px: null, py: null };
  rec.dispose = () => { skin.dispose(); dropModel(rec); };
  return rec;
}
function dropModel(rec) {
  if (!rec.model) return;
  rec.turn.remove(rec.model.holder);
  rec.model.mixer.stopAllAction();
  for (const m of rec.model.mats) m.dispose();
  rec.model = null;
}
function buildUnitBody(rec, u) {
  const b = rec.body, gn = u.genes;
  b.clear();
  dropModel(rec);
  // 주 유전자의 몸: 모델이 있으면 모델, 없으면 도형(뿔/상자/공)
  if (BODY[u.main]) { rec.model = makeBodyModel(u.main); rec.turn.add(rec.model.holder); }
  else b.add(mesh(u.main === 'beast' ? GEO.horn : u.main === 'armor' ? GEO.box : GEO.ball, rec.skin));
  // 주 유전자가 쌓일수록 몸에 같은 색의 띠가 겹친다(도형 몸일 때만)
  for (let i = 1; i < (rec.model ? 0 : Math.min(gn[u.main], 5)); i++) {
    const band = mesh(GEO.cyl, lambert(u.main), 0, -0.55 + i * 0.28, 0); band.scale.set(1.9 - i * 0.05, 0.07, 1.9 - i * 0.05);
    if (u.main === 'beast') { band.scale.set(1.2, 0.07, 1.2); band.position.set(-0.3, -0.35 + i * 0.18, 0); }
    b.add(band);
  }
  if (u.mutant) { const halo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 6, 24), basic('great')); halo.rotation.x = Math.PI / 2; halo.position.y = 0.95; halo.userData.own = true; b.add(halo); }
  const sb = u.main === 'beast' ? 0 : gn.beast, sa = u.main === 'armor' ? 0 : gn.armor, sr = u.main === 'ranger' ? 0 : gn.ranger;
  const spikes = Math.min(sb, 12);
  for (let i = 0; i < spikes; i++) {   // 맹수 섞임: 등과 옆구리의 가시
    const a = Math.PI + (i - (spikes - 1) / 2) * 0.42, sp = mesh(GEO.spike, lambert('beast'), Math.cos(a) * 0.95, 0.35 + (i % 2) * 0.25, -Math.sin(a) * 0.95);
    sp.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0 + 0.3); b.add(sp);
  }
  const plates = Math.min(sa, 8);
  for (let i = 0; i < plates; i++) {   // 갑주 섞임: 앞을 두르는 장갑판
    const a = (i - (plates - 1) / 2) * 0.46, pl = mesh(GEO.plate, lambert('armor'), Math.cos(a) * 1.22, 0, -Math.sin(a) * 1.22);
    pl.rotation.y = a; b.add(pl);
  }
  const eyes = Math.min(sr, 8);
  for (let i = 0; i < eyes; i++) {     // 사수 섞임: 몸에 돋은 눈알
    const a = i * Math.PI * 2 / Math.max(eyes, 3), ex = Math.cos(a) * 0.78, ez = -Math.sin(a) * 0.78, ey = 0.45 + (i % 2) * 0.2;
    b.add(mesh(GEO.eye, lambert('ranger'), ex, ey, ez));
    b.add(mesh(GEO.pupil, basic('ground'), ex * 1.22, ey + 0.05, ez * 1.22));
  }
  rec.sig = unitSig(u);
}
function disposeOwn(group) { group.traverse(o => { if (o.userData.own && o.geometry) o.geometry.dispose(); }); }

function drawUnit(u, now, reduced) {
  const rec = sync(u, makeUnit);
  if (rec.sig !== unitSig(u)) { disposeOwn(rec.body); buildUnitBody(rec, u); }
  const heat = Math.min(1, u.inst / 100), frenzy = S.isFrenzy(u);
  const amp = reduced ? 0 : (heat > 0.4 ? (heat - 0.4) * 0.16 : 0) * (frenzy ? 1.8 : 1);
  const jx = amp ? Math.sin(now / 23 + u.uid) * amp : 0, jz = amp ? Math.cos(now / 19 + u.uid * 2) * amp : 0;
  const blink = frenzy && !reduced && Math.floor(now / 110) % 2 === 0;
  const r = u.r * (1 + (reduced ? 0 : u.pop * 0.8));
  rec.root.position.set(u.x + jx, 0, u.y + jz);
  rec.turn.rotation.y = faceToY(u.face);
  rec.body.scale.setScalar(r);
  rec.body.position.y = r * 0.95;
  if (blink) rec.skin.color.copy(COL.danger); else rec.skin.color.copy(COL.bone).lerp(COL.danger, heat * 0.85);
  rec.skin.opacity = u.down > 0 ? 0.3 : 1;
  if (rec.model) {
    const m = rec.model;
    m.holder.scale.setScalar(r * BODY_LEN);
    // 불안정도가 오르면 몸이 붉게 물든다(과부하면 깜박인다). 쓰러져 있으면 흐리다
    for (const mat of m.mats) {
      mat.color.setRGB(1, 1, 1).lerp(COL.danger, blink ? 0.9 : heat * 0.7);
      mat.emissiveIntensity = blink ? 0.8 : 0.5 + heat * 0.25;
      mat.opacity = u.down > 0 ? 0.3 : 1;
    }
    // 움직일 때만 걷는다(멈추면 걷기를 멈춘 자세)
    const moved = rec.px !== null && Math.hypot(u.x - rec.px, u.y - rec.py) > 0.002;
    rec.px = u.x; rec.py = u.y;
    const dt = rec.lastT == null ? 0 : Math.min(0.05, (now - rec.lastT) / 1000); rec.lastT = now;
    if (m.walk) m.walk.timeScale = moved || u.state === 'rush' ? 1.6 : 0;
    m.mixer.update(dt);
  }
  const pinned = g.pinned === u.uid;
  rec.pin.visible = pinned;
  if (pinned) rec.pin.position.set(0, r * 2.1 + 0.55 + (reduced ? 0 : Math.sin(now / 200) * 0.08), 0);
  // 발밑: 주 유전자 색 고리(변이는 금빛), 불안정도 고리
  dec.ring(u.x, u.y, u.r + 0.12, 0.1, u.mutant ? COL.great : COL[u.main], u.down > 0 ? 0.3 : 0.9);
  if (u.inst > 0 && u.state === 'ok') dec.ring(u.x, u.y, u.r + 0.38, frenzy ? 0.16 : 0.1, COL.danger, 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * heat);
  if (u.down > 0) dec.ring(u.x, u.y, u.r + 0.25, 0.08, COL.bone, 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.down / 6));
  if (u.state === 'rush') dec.line(u.x, u.y, u.tx, u.ty, 0.2, COL.danger, 0.9);
}

// 적: 군견(맹수), 방패 기동대(갑주), 소총수(사수), 돌격조, 진압 대장. 색과 모양으로 구별한다
function makeEnemy(e) {
  const root = new THREE.Group(), turn = new THREE.Group(); root.add(turn);
  const k = e.elite ? 'danger' : e.arch, m = lambert(k);
  if (e.arch === 'beast') {        // 군견: 낮고 긴 몸, 앞으로 내민 머리
    turn.add(mesh(new THREE.BoxGeometry(1.7, 0.8, 0.8), m, 0, 0.55, 0));
    turn.add(mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), m, 1.05, 0.85, 0));
  } else if (e.arch === 'armor') { // 방패 기동대: 몸통과 앞의 방패
    const bodyM = mesh(GEO.cyl, m, 0, 0.8, 0); bodyM.scale.set(1.4, 1.6, 1.4); turn.add(bodyM);
    turn.add(mesh(new THREE.BoxGeometry(0.18, 1.6, 1.7), e.elite ? lambert('ink') : lambert('armor'), 0.85, 0.85, 0));
    const head = mesh(GEO.dot, m, 0, 1.85, 0); head.scale.setScalar(0.4); turn.add(head);
  } else {                         // 소총수: 가는 몸, 머리, 총신
    const bodyM = mesh(GEO.cyl, m, 0, 0.75, 0); bodyM.scale.set(1.0, 1.5, 1.0); turn.add(bodyM);
    const head = mesh(GEO.dot, m, 0, 1.7, 0); head.scale.setScalar(0.38); turn.add(head);
    turn.add(mesh(GEO.barrel, lambert('ink'), 0.7, 1.1, 0.2));
  }
  if (e.elite) { const w = mesh(GEO.wedge, lambert('ink'), 1.45, 0.9, 0); turn.add(w); }   // 돌격조: 앞쪽의 쐐기
  if (e.boss) { const crown = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 18), basic('great')); crown.rotation.x = Math.PI / 2; crown.position.y = 2.35; turn.add(crown); }
  if (!e.elite && e.g >= 2) { const band = mesh(GEO.cyl, lambert('ink'), 0, 0.12, 0); band.scale.set(1.9, 0.12, 1.9); turn.add(band); }
  return { root, turn };
}
function drawEnemy(e, now, reduced) {
  const rec = sync(e, () => makeEnemy(e));
  rec.root.position.set(e.x, 0, e.y);
  rec.root.scale.setScalar(e.r / 0.5 * 0.5);
  rec.turn.rotation.y = faceToY(e.face);
  if (e.elite && (e.mode === 'warn' || e.mode === 'aim')) {   // 돌진 예고: 겨눈 방향으로 붉은 길
    const a = e.face, L = 40, w = 0.9 + (reduced ? 0 : 0.25 * Math.sin(now / 60));
    dec.line(e.x, e.y, e.x + Math.cos(a) * L, e.y + Math.sin(a) * L, e.r * 2 * w, COL.danger, 0.28);
  }
  dec.disc(e.x, e.y, e.r * 0.95, COL.ground, 0.45, 0, Math.PI * 2, 0.02);   // 발밑 그림자 대신 어두운 원(그림자는 쓰지 않는다)
}

function makePost() {
  const root = new THREE.Group();
  const body = mesh(GEO.hex, lambert('dim'), 0, 0.75, 0); root.add(body);
  const top = mesh(new THREE.CylinderGeometry(0.75, 1, 0.35, 6), lambert('ink'), 0, 1.68, 0); root.add(top);
  const light = new THREE.Mesh(GEO.dot, new THREE.MeshBasicMaterial({ color: COL.great.clone() })); light.scale.setScalar(0.24); light.position.y = 2.0; root.add(light);
  return { root, light, dispose() { light.material.dispose(); } };
}
function drawPost(p, n, now, reduced) {
  if (p.dead) { dec.ring(p.x, p.y, p.r, 0.12, COL.grid, 1); dec.disc(p.x, p.y, p.r, COL.grid, 0.35); return; }
  const rec = sync(p, makePost);
  rec.root.position.set(p.x, 0, p.y); rec.root.scale.setScalar(p.r / 0.9 * 0.9);
  rec.light.material.color.copy(Math.floor(now / 400) % 2 ? COL.danger : COL.great);
  // 사정거리: 네크로맨서가 안에 있으면 진하다
  const inside = Math.hypot(p.x - n.x, p.y - n.y) < S.CFG.postRange;
  dec.disc(p.x, p.y, S.CFG.postRange, COL.danger, inside ? 0.16 : 0.06);
  dec.dashRing(p.x, p.y, S.CFG.postRange, inside ? 0.12 : 0.08, 0.45, 0.3, reduced ? 0 : now / 700, COL.danger, inside ? 0.95 : 0.55);
}

// 혼: 불량은 작고 흐리다. 신선한 것은 푸른 고리, 순혈 코어는 크고 금빛으로 뛴다
function makeSoul(s) {
  const mat = new THREE.MeshBasicMaterial({ color: (s.q === 3 ? COL.great : COL[s.type]).clone(), transparent: true, opacity: s.q === 1 ? 0.6 : 1 });
  const m = new THREE.Mesh(s.type === 'beast' ? GEO.tetra : s.type === 'armor' ? GEO.cube : GEO.orb, mat);
  const size = s.q === 1 ? 0.22 : s.q === 2 ? 0.32 : 0.45;
  m.scale.setScalar(size);
  const root = new THREE.Group(); root.add(m);
  return { root, m, mat, dispose() { mat.dispose(); } };
}
function drawSoul(s, now, reduced) {
  const rec = sync(s, () => makeSoul(s));
  const hide = s.ttl < 3 && Math.floor(now / 120) % 2 === 0;
  rec.root.visible = !hide;
  rec.root.position.set(s.x, 0, s.y);
  rec.m.position.y = 0.45 + (reduced ? 0 : Math.sin(now / 300 + s.x) * 0.08);
  if (!reduced) rec.m.rotation.y = now / 700 + s.y;
  if (hide) return;
  const pulse = reduced ? 1 : 1 + 0.1 * Math.sin(now / 150 + s.x);
  if (s.q === 1) dec.disc(s.x, s.y, 0.28, COL[s.type], 0.25);
  else if (s.q === 2) dec.ring(s.x, s.y, 0.62 * pulse, 0.08, COL.armor, 1);
  else { dec.ring(s.x, s.y, 0.85 * pulse, 0.12, COL.great, 1); dec.ring(s.x, s.y, 1.1 * pulse, 0.07, COL.necro, 1); }
}

// 변이 심장: 금빛 테두리일 때 주우면 유전자를 다 물려받는다. 고리가 남은 시간. 덜 익은 것은 흐리다
function makeHeart() {
  const mat = new THREE.MeshLambertMaterial({ color: COL.danger, emissive: COL.danger.clone().multiplyScalar(0.35), transparent: true });
  const m = new THREE.Mesh(GEO.heart, mat);
  const rim = new THREE.Mesh(GEO.heart, new THREE.MeshBasicMaterial({ color: COL.great.clone(), wireframe: true }));
  rim.scale.setScalar(1.12); m.add(rim);
  const root = new THREE.Group(); root.add(m);
  return { root, m, mat, rim, dispose() { mat.dispose(); rim.material.dispose(); } };
}
function drawHeart(h, now, reduced) {
  const rec = sync(h, makeHeart);
  const wait = h.wait > 0, full = h.age <= S.CFG.heartFullFor && !wait;
  const pulse = reduced || wait ? 1 : 1 + 0.18 * Math.abs(Math.sin(now / 180));
  rec.root.position.set(h.x, 0, h.y);
  rec.m.position.y = 0.6; rec.m.scale.set(pulse, pulse * 1.3, pulse);
  if (!reduced) rec.m.rotation.y = now / 500;
  rec.mat.opacity = wait ? 0.35 : 1;
  rec.rim.material.color.copy(full ? COL.great : COL.dim);
  rec.rim.visible = !wait;
  dec.ring(h.x, h.y, 0.9, 0.08, full ? COL.great : COL.dim, wait ? 0.4 : 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h.ttl / S.CFG.heartTtl));
}

// 네크로맨서: 보랏빛 망토(원뿔)와 머리
const necro = new THREE.Group();
const robeMat = new THREE.MeshLambertMaterial({ color: COL.necro.clone() });
const robe = mesh(GEO.cone, robeMat, 0, 0.6, 0); robe.scale.set(1.15, 1.2, 1.15); necro.add(robe);
const headN = mesh(GEO.dot, lambert('bone'), 0, 1.35, 0); headN.scale.setScalar(0.24); necro.add(headN);
scene.add(necro);

// 주인공 모델(Tripo3D로 만든 assets/necromancer.glb: 뼈대와 서기·걷기 동작. 맞기 동작도 들어 있지만 쓰지 않는다).
// 불러오는 동안이나 불러오지 못하면 위의 원뿔을 그대로 쓴다.
const hero = { root: null, mixer: null, act: {}, cur: null, mats: [], face: -Math.PI / 2, last: null };
const HERO_H = 2.1;    // 판 위의 키(모델은 높이 1로 온다). 키메라보다 조금 크게
new GLTFLoader().load('assets/necromancer.glb', gltf => {
  const root = gltf.scene;
  root.scale.setScalar(HERO_H);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;   // 뼈로 움직이는 몸은 경계가 맞지 않아 잘릴 수 있다
    // 밤 장면에서 묻히지 않게 텍스처를 조금 스스로 빛나게 한다(맞으면 붉게)
    if (o.material.map) { o.material.emissiveMap = o.material.map; o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = 0.35; }
    hero.mats.push(o.material);
  });
  const turn = new THREE.Group(); turn.add(root);
  hero.mixer = new THREE.AnimationMixer(root);
  for (const clip of gltf.animations) hero.act[clip.name] = hero.mixer.clipAction(clip);
  hero.root = turn;
  necro.clear(); necro.add(turn);
}, undefined, () => { /* 모델이 없으면 원뿔로 계속한다 */ });
function playHero(name) {
  const a = hero.act[name];
  if (!a || hero.cur === name) return;
  const prev = hero.cur && hero.act[hero.cur];
  a.reset().play();
  if (prev) prev.crossFadeTo(a, 0.18, false);
  hero.cur = name;
}
function drawHero(n, now) {
  const dt = hero.last == null ? 0 : Math.min(0.05, (now - hero.last) / 1000);
  hero.last = now;
  if (!hero.root) { robeMat.color.copy(n.hurt > 0 ? COL.danger : COL.necro); return; }
  const prevX = hero.px == null ? n.x : hero.px, prevY = hero.py == null ? n.y : hero.py;
  const vx = n.x - prevX, vy = n.y - prevY, moving = Math.hypot(vx, vy) > 0.002;
  hero.px = n.x; hero.py = n.y;
  if (moving) {   // 가는 쪽을 바라본다(모델의 앞은 +x)
    const want = Math.atan2(vy, vx);
    let d = want - hero.face; d = Math.atan2(Math.sin(d), Math.cos(d));
    hero.face += d * Math.min(1, dt * 14);
  }
  hero.root.rotation.y = faceToY(hero.face);
  playHero(moving ? 'walk' : 'idle');
  // 맞으면 몸이 붉게 빛나기만 한다(맞는 자세로 움직이면 어색하다는 사용자 확인)
  for (const m of hero.mats) if (m.emissive) { if (n.hurt > 0) { m.emissive.copy(COL.danger); m.emissiveIntensity = 0.8; } else { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.35; } }
  hero.mixer.update(dt);
}

function drawFx(f) {
  const H = 0.05;
  if (f.k === 'hit') dec.ring(f.x, f.y, 0.25 + (0.15 - f.t) * (f.big ? 6 : 3), f.big ? 0.14 : 0.08, COL.ink, 1);
  else if (f.k === 'shot') dec.line(f.x, f.y, f.tx, f.ty, f.arch === 'ranger' ? 0.14 : 0.07, COL[f.arch], 1, 0.9);
  else if (f.k === 'die') dec.ring(f.x, f.y, 0.4 + (0.35 - f.t) * (f.big ? 8 : 3), f.big ? 0.2 : 0.1, COL[f.arch], 1);
  else if (f.k === 'block') dec.ring(f.x, f.y, f.r * 1.6, 0.22, COL.armor, 1, f.face - 1.1, f.face + 1.1, 0.5);
  else if (f.k === 'raise') dec.ring(f.x, f.y, 0.5 + (0.45 - f.t) * 3, 0.14, COL[f.arch], 1);
  else if (f.k === 'absorb') {
    const u = g.units.find(x => x.uid === f.uid); if (!u) return;
    const k = 1 - f.t / 0.35, col = f.q === 3 ? COL.great : COL[f.type];
    dec.line(f.x + (u.x - f.x) * k, f.y + (u.y - f.y) * k, u.x, u.y, 0.18, col, 1, 0.5);
    dec.ring(u.x, u.y, u.r + 0.3 + k * 1.2, 0.1, col, 1);
  } else if (f.k === 'boom') {
    const k = 1 - f.t / 0.5;
    dec.disc(f.x, f.y, f.r * (0.4 + k * 0.6), f.weak ? COL.dim : COL.danger, (1 - k) * (f.weak ? 0.3 : 0.6), 0, Math.PI * 2, H);
    dec.ring(f.x, f.y, f.r * (0.3 + k), 0.3, f.weak ? COL.dim : COL.great, 1 - k, 0, Math.PI * 2, H + 0.01);
  } else if (f.k === 'wave') { const k = 1 - f.t / 0.3; dec.ring(f.x, f.y, f.r * k, 0.22 * (1 - k) + 0.05, COL.armor, 1); }
  else if (f.k === 'leap') dec.line(f.x, f.y, f.tx, f.ty, 0.3 * (f.t / 0.25), COL.beast, 1);
  else if (f.k === 'volley') dec.disc(f.x, f.y, 6.5, COL.ranger, f.t / 0.25 * 0.3, f.face - 0.7, f.face + 0.7);
  else if (f.k === 'clash') { const k = 1 - f.t / 0.4; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; dec.line(f.x + Math.cos(a) * (0.3 + k), f.y + Math.sin(a) * (0.3 + k), f.x + Math.cos(a) * (0.9 + k * 2), f.y + Math.sin(a) * (0.9 + k * 2), 0.2, COL.ink, 1, 0.5); } }
  else if (f.k === 'rebirth') { const k = 1 - f.t / 0.6; dec.ring(f.x, f.y, 0.4 + k * 2.4, 0.2, COL.great, 1); dec.ring(f.x, f.y, 0.4 + k * 4, 0.08, COL.great, 1); }
  else if (f.k === 'down') dec.ring(f.x, f.y, 0.6 + (0.5 - f.t) * 2, 0.1, COL.danger, 1);
}

let g = null;
const tmp = new THREE.Vector3();
function placeCamera(shake) {
  camera.position.copy(target).addScaledVector(camDir, 60);
  if (shake > 0) {
    const right = new THREE.Vector3(R2, 0, -R2), up = new THREE.Vector3().crossVectors(right, camDir).normalize();
    camera.position.addScaledVector(right, (Math.random() - 0.5) * shake * 1.2).addScaledVector(up, (Math.random() - 0.5) * shake * 1.2);
  }
  camera.lookAt(tmp.copy(camera.position).sub(camDir));
  camera.updateMatrixWorld();
}

const view = {
  resize(w, h) {
    cssW = Math.max(1, w); cssH = Math.max(1, h);
    renderer.setSize(cssW, cssH, false);
    viewW = VIEW_W; viewH = VIEW_W * cssH / cssW;
    camera.left = -viewW / 2; camera.right = viewW / 2; camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  },
  pxPerUnit() { return cssW / viewW; },
  toScreen(x, y, h) {
    tmp.set(x, h || 0, y).project(camera);
    return [(tmp.x + 1) / 2 * cssW, (1 - tmp.y) / 2 * cssH];
  },
  // 화면을 누른 곳 → 판 좌표. 키메라 몸통 높이(0.5)의 평면과 만나는 점
  toWorld(px, py) {
    const o = new THREE.Vector3(px / cssW * 2 - 1, 1 - py / cssH * 2, -1).unproject(camera), d = camDir.clone().negate(), h = 0.5;
    const t = (h - o.y) / d.y;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  },
  // 조이스틱(화면 기준) → 판의 방향. 화면 오른쪽은 판의 (+x, -y), 화면 위쪽은 (-x, -y)
  rotateInput(x, y) { return [(x + y) * R2, (y - x) * R2]; },
  render(game, now, opts) {
    g = game;
    const n = g.necro, reduced = opts.reduced;
    // 네크로맨서를 부드럽게 따라가되, 판의 먼 쪽(초소가 있는 쪽)을 조금 더 보여 준다.
    // 가까운 두 변(x = W, y = H) 너머의 빈 땅이 화면을 차지하지 않게 목표를 판 안쪽으로 묶는다
    const LOOK = 5, tx = Math.min(S.W - 2, n.x - LOOK * R2), tz = Math.min(S.H - 4, n.y - LOOK * R2);
    if (g !== lastGame) { lastGame = g; target.set(tx, 0, tz); }
    target.x += (tx - target.x) * 0.28; target.z += (tz - target.z) * 0.28;
    placeCamera(opts.shake);
    dec.reset();
    for (const s of g.souls) drawSoul(s, now, reduced);
    for (const h of g.hearts) drawHeart(h, now, reduced);
    for (const p of g.posts) drawPost(p, n, now, reduced);
    for (const e of g.enemies) drawEnemy(e, now, reduced);
    // 예고 연결선: 이 혼을 밟으면 누가 먹는지. 먹으면 터질 참이면 붉다
    if (g.link) {
      const u = g.units.find(x => x.uid === g.link.uid);
      if (u) {
        const soul = g.souls.find(s => s.x === g.link.x && s.y === g.link.y);
        const add = soul ? S.CFG.soul[soul.q].inst : 0, willPop = add > 0 && u.inst + add >= 100, c = willPop ? COL.danger : COL.necro;
        dec.dashLine(g.link.x, g.link.y, u.x, u.y, 0.14, 0.3, 0.2, reduced ? 0 : -now / 60 * 0.5, c, 1, 0.06);
        dec.ring(u.x, u.y, u.r + 0.6, 0.14, c, 1, 0, Math.PI * 2, 0.06); dec.ring(g.link.x, g.link.y, 0.75, 0.14, c, 1, 0, Math.PI * 2, 0.06);
        if (add > 0) { const a0 = -Math.PI / 2 + Math.PI * 2 * Math.min(1, u.inst / 100); dec.ring(u.x, u.y, u.r + 0.38, 0.1, COL.danger, 0.45, a0, a0 + Math.PI * 2 * Math.min(1 - u.inst / 100, add / 100), 0.06); }
      }
    }
    // 조준 표시: 지금 두 번 톡톡 치면 뛰어들 곳(폭탄이 반 넘게 익었을 때만)
    const nb = S.nextBlast(g);
    if (nb && nb.target && nb.unit.inst >= 40) {
      const t = nb.target, rr = (t.r || 0.5) + 0.45, ripe = nb.unit.inst >= S.CFG.frenzyAt;
      for (let i = 0; i < 4; i++) { const a0 = i * Math.PI / 2 + (reduced ? 0 : now / 500); dec.ring(t.x, t.y, rr, ripe ? 0.13 : 0.08, COL.danger, ripe ? 1 : 0.55, a0 + 0.25, a0 + Math.PI / 2 - 0.25, 0.07); }
    }
    for (const u of g.units) drawUnit(u, now, reduced);
    necro.position.set(n.x, 0, n.y);
    drawHero(n, now);
    dec.ring(n.x, n.y, n.r + 0.16, 0.08, COL.ink, 1);
    for (const f of g.fx) drawFx(f);
    sweep();
    dec.flush();
    renderer.render(scene, camera);
  },
};
view._hero = hero;   // 확인용(화면 검사 스크립트가 동작 상태를 읽는다)
window.ChimeraView = view;
