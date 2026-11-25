// 3D 쿼터뷰(현대 도시의 밤). 규칙(sim.js)은 건드리지 않고 판을 그리는 쪽만 맡는다.
// render.js가 window.ChimeraView를 찾아 쓴다. 글자·위쪽 표시·조이스틱·입력은 render.js의 2D 캔버스가 위에 겹쳐 그린다.
// 판 좌표 (x, y) → 3D (x, 높이, y). 카메라는 직교 투영, 45도 돌려 (+x, +y) 쪽에서 내려다본다.
// 그래서 판의 먼 쪽 두 변은 x = 0과 y = 0이고, 키 큰 건물은 그 바깥에만 세운다.
// 폰 성능: 그림자·후처리 없음, 땅 위의 표시는 버퍼 하나로 한 번에 그린다.
import * as THREE from 'three';   // 주소는 페이지의 importmap에 있다(build.cjs)
import { GLTFLoader } from './src/vendor/three/GLTFLoader.js';   // 부속은 로컬 벤더 파일(index.html 기준 상대 경로)
import { clone as cloneSkinned } from './src/vendor/three/SkeletonUtils.js';
import { MeshoptDecoder } from './src/vendor/three/meshopt_decoder.module.js';
// 모델은 meshopt로 모양을 압축하고 그림을 1024로 줄였다(2026-11-19, 11.2MB → 3.4MB). 읽을 때 풀어야 한다.
const newLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const S = window.ChimeraSim;
// 모델 파일이 바뀌면 주소도 바뀌게(폰 브라우저가 예전 모델을 캐시에서 쓰지 않게). build.cjs가 모델 내용으로 채운다
const ASSET_V = '__ASSET_V__';
const css = getComputedStyle(document.documentElement);
const tok = n => css.getPropertyValue(n).trim();
const HEX = {
  ground: tok('--ground'), grid: tok('--grid'), ink: tok('--ink'), dim: tok('--dim'), necro: tok('--necro'),
  bone: tok('--bone'), beast: tok('--beast'), armor: tok('--armor'), ranger: tok('--ranger'), danger: tok('--danger'), great: tok('--great'),
};
const COL = {};
for (const k in HEX) COL[k] = new THREE.Color(HEX[k]);
const SCORCH = new THREE.Color('#3a1a12'), WHITE = new THREE.Color('#ffffff');   // 바닥 그을음, 폭발 섬광
const VIEW_W = 13;                 // 화면 가로에 들어오는 판의 폭(2D와 같다)
const ELEV = 35 * Math.PI / 180;   // 내려다보는 각
const R2 = Math.SQRT1_2;

const cv3 = document.getElementById('game3d');
const dprMax = Math.min(window.devicePixelRatio || 1, 2);
// WebGL을 쓸 수 없거나 렌더러를 만들지 못하면(예외, 컨텍스트 없음) 3D를 접는다. #game3d를 숨겨 검은 바탕이 2D 판을 가리지 않게 하고,
// window.ChimeraView를 만들지 않아 render.js가 2D 판으로 그린다(맨 아래).
let renderer = null, glError = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: dprMax < 2, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('WebGL 컨텍스트를 만들지 못했다');
  renderer.setPixelRatio(dprMax);
  renderer.setClearColor(new THREE.Color('#0c0a11'));
} catch (e) {
  glError = e;
  try { if (renderer) renderer.dispose(); } catch (e2) { /* 반쯤 만든 렌더러: 버린다 */ }
  renderer = null;
  if (cv3) cv3.hidden = true;
}
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const camDir = new THREE.Vector3(Math.cos(ELEV) * R2, Math.sin(ELEV), Math.cos(ELEV) * R2);   // 목표에서 카메라 쪽
let viewW = 1, viewH = 1, cssW = 1, cssH = 1;
const target = new THREE.Vector3(S.W / 2, 0, S.H - 4);
let lastGame = null;

// District themes: same order as the sim's table cycle (tableIdx over POST_LAYOUTS, 3 entries; districts 1/4/7 -> 0, 2/5 -> 1, 3/6 -> 2).
// Only light colors/intensity, ground/sidewalk material colors, background and fog change. Dark and low-saturation so foes, souls and danger marks stay readable.
const THEMES = [
  { key: 'violet', sky: '#8a80b8', low: '#1a1522', hemiI: 1.6, sun: '#ffe6c8', sunI: 1.1, ground: HEX.ground, walk: HEX.grid, bg: '#0c0a11', fog: '#0c0a11' },
  { key: 'teal', sky: '#7fa3b4', low: '#131d1f', hemiI: 1.5, sun: '#d6e8ff', sunI: 1.0, ground: '#111a1d', walk: '#233238', bg: '#081013', fog: '#081013' },
  { key: 'amber', sky: '#b49a80', low: '#211813', hemiI: 1.5, sun: '#ffd4a6', sunI: 1.15, ground: '#1a1512', walk: '#332a24', bg: '#0f0b08', fog: '#0f0b08' },
];
const hemi = new THREE.HemisphereLight(THEMES[0].sky, THEMES[0].low, THEMES[0].hemiI);
scene.add(hemi);
const sun = new THREE.DirectionalLight(THEMES[0].sun, THEMES[0].sunI);
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
  rune: new THREE.TorusGeometry(1.3, 0.08, 6, 28),
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
let groundMat = null, walkMat = null, cityBuilds = 0;   // kept so district themes recolor them without rebuilding the city
function buildCity() {
  cityBuilds++;
  const city = new THREE.Group();
  // 땅: 아스팔트, 판 바깥은 인도
  const ground = mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), groundMat = new THREE.MeshLambertMaterial({ color: COL.ground }), S.W / 2, 0, S.H / 2);
  city.add(ground);
  const walk = walkMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(HEX.grid) });
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
scene.background = new THREE.Color(THEMES[0].bg);
scene.fog = new THREE.Fog(THEMES[0].fog, 70, 150);   // far edge only (board sits about 60 from the camera)
let themeIdx = -1, themeApplied = 0;
// Theme index from the sim's own table cycle: the index of this district's post layout (sim tableIdx), formula as fallback
function themeIdxOf(district) {
  const i = S.POST_LAYOUTS && S.postSpotsFor ? S.POST_LAYOUTS.indexOf(S.postSpotsFor(district)) : -1;
  if (i >= 0) return i % THEMES.length;
  const d = Math.floor(+district);
  return ((Number.isFinite(d) && d >= 1 ? d : 1) - 1) % THEMES.length;
}
// Recolor existing lights, materials, background and fog only (no new objects, city is not rebuilt)
function applyTheme(i) {
  if (i === themeIdx) return false;
  const t = THEMES[i];
  themeIdx = i; themeApplied++;
  hemi.color.set(t.sky); hemi.groundColor.set(t.low); hemi.intensity = t.hemiI;
  sun.color.set(t.sun); sun.intensity = t.sunI;
  groundMat.color.set(t.ground); walkMat.color.set(t.walk);
  scene.background.set(t.bg); scene.fog.color.set(t.fog);
  if (renderer) renderer.setClearColor(scene.background);
  return true;
}
applyTheme(0);

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
if (renderer) for (const kind of ['beast', 'armor', 'ranger']) {
  newLoader().load('assets/chimera-' + kind + '.glb?v=' + ASSET_V, gltf => {
    // 소총수는 사람형 뼈대의 걷기를 쓴다. 팔과 몸통 동작은 둥근 몸을 앞으로 꺾고 앞팔을 늘리므로 다리 회전만 남긴다.
    if (kind === 'ranger') for (const c of gltf.animations) c.tracks = c.tracks.filter(t => /(Thigh|Calf|Foot|Toe).*\.quaternion$/.test(t.name));
    BODY[kind] = gltf;
  }, undefined, () => { /* 없으면 도형 몸 */ });
}
// 소총수 모델(사람형 뼈대)은 눈알이 +x를 본다. 나머지(네발 뼈대)는 앞이 -z라 -90도 돌린다.
const BODY_YAW = { beast: -Math.PI / 2, armor: -Math.PI / 2, ranger: 0 };
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
  const holder = new THREE.Group(); holder.add(root); root.rotation.y = BODY_YAW[kind];
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

const LUNGE = { beast: 0.45, armor: 0.35, ranger: -0.18 };
function drawUnit(u, now, reduced) {
  const rec = sync(u, makeUnit);
  if (rec.sig !== unitSig(u)) { disposeOwn(rec.body); buildUnitBody(rec, u); }
  const heat = Math.min(1, u.inst / 100), frenzy = S.isFrenzy(u);
  const amp = reduced ? 0 : (heat > 0.4 ? (heat - 0.4) * 0.16 : 0) * (frenzy ? 1.8 : 1);
  const jx = amp ? Math.sin(now / 23 + u.uid) * amp : 0, jz = amp ? Math.cos(now / 19 + u.uid * 2) * amp : 0;
  const blink = frenzy && !reduced && Math.floor(now / 110) % 2 === 0;
  const r = u.r * (1 + (reduced ? 0 : u.pop * 0.8));
  // 공격 몸짓: 휘두르는 동안 바라보는 쪽으로 나갔다 돌아온다(사수는 반동으로 뒤로)
  const lg = reduced || !(u.swing > 0) ? 0 : Math.sin(Math.PI * (1 - u.swing / S.CFG.hit.swing)) * LUNGE[u.main];
  rec.root.position.set(u.x + jx + Math.cos(u.face) * lg, 0, u.y + jz + Math.sin(u.face) * lg);
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

// 진압 대장: 종류마다 몸 색과 모양이 다르다 (armor: plates, beast: horns, ranger: scope)
const BOSS_LOOK = {
  armor: { body: 'armor', accent: 'danger', mark: 'plates' },
  beast: { body: 'beast', accent: 'danger', mark: 'horns' },
  ranger: { body: 'ranger', accent: 'great', mark: 'scope' },
};
function enemyLook(e) {
  if (e.boss) {
    const b = BOSS_LOOK[e.arch] || BOSS_LOOK.armor, assist = e.lap >= 1 ? [e.summon ? 'summon' : '', e.chainMax > 0 ? 'chain' : ''].filter(Boolean).join('+') : '';
    return { kind: 'boss:' + e.arch, body: b.body, accent: b.accent, mark: b.mark, crown: true, assist };
  }
  if (e.elite) return { kind: 'elite:' + e.arch, body: 'danger', accent: 'ink', mark: 'wedge', crown: false };
  return { kind: 'foe:' + e.arch + ':' + (e.g >= 2 ? 2 : 1), body: e.arch, accent: e.arch === 'armor' ? 'armor' : 'ink', mark: e.g >= 2 ? 'band' : 'none', crown: false };
}
// 적: 군견(맹수), 방패 기동대(갑주), 소총수(사수), 돌격조, 진압 대장. 색과 모양으로 구별한다
function makeEnemy(e, look) {
  look = look || enemyLook(e);
  const root = new THREE.Group(), turn = new THREE.Group(); root.add(turn);
  const m = lambert(look.body), acc = lambert(look.accent);
  if (e.arch === 'beast') {        // 군견: 낮고 긴 몸, 앞으로 내민 머리
    turn.add(mesh(new THREE.BoxGeometry(1.7, 0.8, 0.8), m, 0, 0.55, 0));
    turn.add(mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), m, 1.05, 0.85, 0));
  } else if (e.arch === 'armor') { // 방패 기동대: 몸통과 앞의 방패
    const bodyM = mesh(GEO.cyl, m, 0, 0.8, 0); bodyM.scale.set(1.4, 1.6, 1.4); turn.add(bodyM);
    turn.add(mesh(new THREE.BoxGeometry(0.18, 1.6, 1.7), acc, 0.85, 0.85, 0));
    const head = mesh(GEO.dot, m, 0, 1.85, 0); head.scale.setScalar(0.4); turn.add(head);
  } else {                         // 소총수: 가는 몸, 머리, 총신
    const bodyM = mesh(GEO.cyl, m, 0, 0.75, 0); bodyM.scale.set(1.0, 1.5, 1.0); turn.add(bodyM);
    const head = mesh(GEO.dot, m, 0, 1.7, 0); head.scale.setScalar(0.38); turn.add(head);
    turn.add(mesh(GEO.barrel, lambert('ink'), 0.7, 1.1, 0.2));
  }
  if (e.elite) { const w = mesh(GEO.wedge, lambert('ink'), 1.45, 0.9, 0); turn.add(w); }   // 돌격조: 앞쪽의 쐐기
  if (e.boss) {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 18), basic('great')); crown.rotation.x = Math.PI / 2; crown.position.y = 2.35; turn.add(crown);
    const base = mesh(GEO.cyl, acc, 0, 0.12, 0); base.scale.set(2.1, 0.14, 2.1); turn.add(base);
    if (look.mark === 'plates') { for (const s of [-1, 1]) turn.add(mesh(new THREE.BoxGeometry(0.7, 0.35, 0.55), acc, 0, 1.55, s * 0.8)); }
    else if (look.mark === 'horns') {
      for (const s of [-1, 1]) { const hn = mesh(GEO.spike, acc, 1.15, 1.35, s * 0.22); hn.rotation.z = -0.6; turn.add(hn); }
      for (let i = 0; i < 3; i++) turn.add(mesh(GEO.spike, acc, 0.4 - i * 0.45, 1.3, 0));
    } else if (look.mark === 'scope') {
      turn.add(mesh(GEO.barrel, lambert('ink'), 0.7, 1.1, -0.2));
      turn.add(mesh(GEO.eye, acc, 0.5, 1.32, 0.2));
    }
  }
  if (!e.elite && e.g >= 2) { const band = mesh(GEO.cyl, lambert('ink'), 0, 0.12, 0); band.scale.set(1.9, 0.12, 1.9); turn.add(band); }
  // 맞으면 하얗게 번쩍: 몸을 덮는 흰 공(이 적만의 재질)
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const flash = new THREE.Mesh(GEO.dot, flashMat); flash.position.y = 0.9; flash.visible = false; root.add(flash);
  return { root, turn, flash, flashMat, look, dispose() { flashMat.dispose(); } };
}
// Phased boss (sim spawnBoss: phases, phase, phaseAt, roarT, weak, stun). Ground ring = boss HP with ticks at phaseAt, roar = shockwaves while roarT > 0,
// weak point = gold aura and target brackets only while weak && stun > 0 (sim clears weak when the barricade stun ends). Phaseless bosses: nothing extra.
const ROAR_T = (S.CFG.bossPhase && S.CFG.bossPhase.roar) || 1.6;
const bossTicksOf = e => (e && e.boss && e.phases && Array.isArray(e.phaseAt) ? e.phaseAt.filter(f => Number.isFinite(f) && f > 0 && f < 1) : []);
function drawBossFx(e, rec, now, reduced) {
  const n0 = dec.n, ticks = bossTicksOf(e), roar = e.roarT > 0, weak = !!e.weak && e.stun > 0, H = 0.05;
  const f = Math.max(0, Math.min(1, e.hp / e.maxHp));
  if (ticks.length) {
    const R = e.r + 0.85, a0 = -Math.PI / 2;
    dec.ring(e.x, e.y, R, 0.14, COL.grid, 0.85, 0, Math.PI * 2, H);
    if (f > 0) dec.ring(e.x, e.y, R, 0.14, COL.danger, 0.95, a0, a0 + Math.PI * 2 * f, H + 0.005);
    for (const t of ticks) {
      const a = a0 + Math.PI * 2 * t, c = Math.cos(a), s = Math.sin(a);
      dec.line(e.x + c * (R - 0.24), e.y + s * (R - 0.24), e.x + c * (R + 0.24), e.y + s * (R + 0.24), 0.1, f <= t ? COL.dim : COL.great, 1, H + 0.01);
    }
  }
  if (roar) {
    const k = Math.max(0, Math.min(1, e.roarT / ROAR_T)), el = Math.max(0, ROAR_T - e.roarT);
    dec.disc(e.x, e.y, e.r + 1.2, COL.danger, 0.16 + 0.22 * k, 0, Math.PI * 2, H - 0.01);
    if (reduced) dec.ring(e.x, e.y, e.r + 1.6, 0.18, COL.danger, 0.9, 0, Math.PI * 2, H + 0.02);
    else for (let i = 0; i < 3; i++) { const q = (el * 1.4 + i / 3) % 1; dec.ring(e.x, e.y, e.r + 0.4 + q * 3.6, 0.22 * (1 - q) + 0.05, i % 2 ? COL.great : COL.danger, (1 - q) * 0.95, 0, Math.PI * 2, H + 0.02 + i * 0.002); }
  }
  if (weak) {
    const p = reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 120), rot = reduced ? 0 : now / 350, R = e.r + 0.45 + 0.25 * p;
    dec.disc(e.x, e.y, e.r + 0.35, COL.great, 0.22 * p, 0, Math.PI * 2, H - 0.005);
    for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; dec.ring(e.x, e.y, R, 0.16, COL.great, 0.95, a + 0.25, a + Math.PI / 2 - 0.25, H + 0.03); }
    dec.dashRing(e.x, e.y, e.r + 1.2, 0.08, 0.3, 0.2, reduced ? 0 : -now / 300, COL.ink, 0.8, H + 0.03);
  }
  rec.bossFx = { ticks: ticks.slice(), roar, weak, phase: e.phase || 1, verts: dec.n - n0 };
  return rec.bossFx;
}
// Body glow of a roaring (red pulse) or weak-point (gold) boss, using the hit-flash ball when no hit flash is showing
function bossGlow(e, rec, now, reduced) {
  const roar = e.roarT > 0, weak = !!e.weak && e.stun > 0;
  if (!roar && !weak) return;
  rec.flash.visible = true;
  rec.flashMat.color.copy(roar ? COL.danger : COL.great);
  rec.flashMat.opacity = roar ? (reduced ? 0.35 : 0.2 + 0.3 * Math.abs(Math.sin(now / 70))) : (reduced ? 0.3 : 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(now / 120)));
  rec.flash.scale.setScalar(1.3);
}
function drawEnemy(e, now, reduced) {
  const look = enemyLook(e), old = live.get(e);
  if (old && old.look.kind !== look.kind) { layer.remove(old.root); if (old.dispose) old.dispose(); live.delete(e); }   // arch changed: rebuild
  const rec = sync(e, () => makeEnemy(e, look));
  const fl = e.flash > 0 ? e.flash / S.CFG.hit.flash : 0, sh = fl && !reduced ? 0.08 * fl : 0;   // 맞으면 번쩍이고 살짝 떤다
  rec.root.position.set(e.x + (sh ? (Math.random() - 0.5) * sh : 0), 0, e.y + (sh ? (Math.random() - 0.5) * sh : 0));
  const roarK = e.boss && e.roarT > 0 && !reduced ? Math.abs(Math.sin(now / 70)) : 0;   // roaring boss swells in pulses
  rec.root.scale.setScalar(e.r / 0.5 * 0.5 * (1 + (reduced ? 0 : 0.22 * fl) + 0.08 * roarK));   // 맞은 순간 살짝 부푼다
  rec.flash.visible = fl > 0; if (fl > 0) { rec.flashMat.opacity = Math.min(1, 0.4 + fl); rec.flash.scale.setScalar(1.1); rec.flashMat.color.copy(WHITE); }
  else if (e.boss) bossGlow(e, rec, now, reduced);
  rec.turn.rotation.y = faceToY(e.face);
  if (e.elite && (e.mode === 'warn' || e.mode === 'aim')) {   // 돌진 예고: 겨눈 방향으로 붉은 길
    const a = e.face, L = 40, w = 0.9 + (reduced ? 0 : 0.25 * Math.sin(now / 60));
    dec.line(e.x, e.y, e.x + Math.cos(a) * L, e.y + Math.sin(a) * L, e.r * 2 * w, COL.danger, 0.28);
  }
  if (e.boss) {
    drawBossFx(e, rec, now, reduced);
    dec.ring(e.x, e.y, e.r + 0.25, 0.16, COL[look.body], 0.9);
    dec.dashRing(e.x, e.y, e.r + 0.5, 0.08, 0.35, 0.25, reduced ? 0 : now / 400, COL[look.accent], 0.8);
    if (e.summon && e.summonT < 1.2) {   // lap 2+ assist summon telegraph (same as 2D)
      const k = 1 - Math.max(0, e.summonT) / 1.2;
      dec.dashRing(e.x, e.y, e.r + 0.6 + (1 - k) * 0.8, 0.12, 0.35, 0.25, reduced ? 0 : now / 300, COL.great, 0.4 + 0.5 * k);
    }
  }
  dec.disc(e.x, e.y, e.r * 0.95, COL.ground, 0.45, 0, Math.PI * 2, 0.02);   // 발밑 그림자 대신 어두운 원(그림자는 쓰지 않는다)
}

function makePost() {
  const root = new THREE.Group();
  const body = mesh(GEO.hex, lambert('dim'), 0, 0.75, 0); root.add(body);
  const top = mesh(new THREE.CylinderGeometry(0.75, 1, 0.35, 6), lambert('ink'), 0, 1.68, 0); root.add(top);
  const light = new THREE.Mesh(GEO.dot, new THREE.MeshBasicMaterial({ color: COL.great.clone() })); light.scale.setScalar(0.24); light.position.y = 2.0; root.add(light);
  // Summon post mark (p.summon): violet rune ring around the hex and a floating violet crystal. Always built (shared geometry/material),
  // shown only while the post lives and has summon. Dead posts are not synced, so sweep() drops the whole record.
  const mark = new THREE.Group(), halo = mesh(GEO.rune, basic('necro'), 0, 1.1, 0), gem = mesh(GEO.heart, basic('necro'), 0, 2.6, 0);
  halo.rotation.x = Math.PI / 2; gem.scale.setScalar(0.5); mark.add(halo, gem); mark.visible = false; root.add(mark);
  return { root, light, mark, gem, kind: 'post', dispose() { light.material.dispose(); } };
}
function drawPost(p, n, now, reduced) {
  if (p.dead) { dec.ring(p.x, p.y, p.r, 0.12, COL.grid, 1); dec.disc(p.x, p.y, p.r, COL.grid, 0.35); return; }
  const rec = sync(p, makePost);
  rec.root.position.set(p.x, 0, p.y); rec.root.scale.setScalar(p.r / 0.9 * 0.9);
  rec.light.material.color.copy(Math.floor(now / 400) % 2 ? COL.danger : COL.great);
  const sm = !!p.summon;
  rec.mark.visible = sm;
  if (sm) {   // violet aura + turning rune ring on the ground, gold ring closing in before escorts (same telegraph as the boss)
    const warn = p.summonT < 1.2 ? 1 - Math.max(0, p.summonT) / 1.2 : 0;
    if (!reduced) { rec.mark.rotation.y = now / 900; rec.gem.position.y = 2.6 + Math.sin(now / 260) * 0.12; }
    dec.disc(p.x, p.y, p.r + 0.6, COL.necro, 0.25 + 0.25 * warn, 0, Math.PI * 2, 0.025);
    dec.dashRing(p.x, p.y, p.r + 0.42, 0.14, 0.4, 0.22, reduced ? 0 : now / 500, COL.necro, 1, 0.04);
    if (warn > 0) dec.dashRing(p.x, p.y, p.r + 0.6 + (1 - warn) * 0.8, 0.12, 0.35, 0.25, reduced ? 0 : now / 300, COL.great, 0.4 + 0.5 * warn, 0.045);
  }
  // 사정거리: 네크로맨서가 안에 있으면 진하다
  const inside = Math.hypot(p.x - n.x, p.y - n.y) < S.CFG.postRange;
  dec.disc(p.x, p.y, S.CFG.postRange, COL.danger, inside ? 0.16 : 0.06);
  dec.dashRing(p.x, p.y, S.CFG.postRange, inside ? 0.12 : 0.08, 0.45, 0.3, reduced ? 0 : now / 700, COL.danger, inside ? 0.95 : 0.55);
}

// 혼: 불량은 작고 흐리다. 신선한 것은 푸른 고리, 순혈 코어는 크고 금빛으로 뛴다
// ---- Barricades: g.obstacles = [{ x, y, hw, hh }] (board units, axis-aligned). Board (x, y) -> 3D (x, height, y), so the box footprint is w = 2hw on x and d = 2hh on z, same as sim collision.
// Rebuilt only when the list (new game / district) or its contents change; old meshes are removed and their geometry disposed.
const OBS_H = 1.1;
const obsBodyMat = new THREE.MeshLambertMaterial({ color: COL.dim }), obsBandMat = new THREE.MeshBasicMaterial({ color: COL.great }), obsCapMat = new THREE.MeshLambertMaterial({ color: COL.ink });
const obsLayer = new THREE.Group(); scene.add(obsLayer);
let obsSrc = null, obsKey = '', obsRecs = [];
const obsStats = { built: 0, disposed: 0 };
const validBox = b => b && Number.isFinite(b.x) && Number.isFinite(b.y) && b.hw > 0 && b.hh > 0;
function clearObstacles() {
  for (const r of obsRecs) { obsLayer.remove(r.root); for (const geo of r.geos) geo.dispose(); obsStats.disposed++; }
  obsRecs = [];
}
function syncObstacles(game) {
  const src = game.obstacles, list = Array.isArray(src) ? src.filter(validBox) : [];
  const key = list.map(b => b.x + ',' + b.y + ',' + b.hw + ',' + b.hh).join(';');
  if (src === obsSrc && key === obsKey) return;
  obsSrc = src; obsKey = key;
  clearObstacles();
  for (const b of list) {
    const w = b.hw * 2, d = b.hh * 2, root = new THREE.Group();
    const body = new THREE.BoxGeometry(w, OBS_H, d), band = new THREE.BoxGeometry(w + 0.02, 0.16, d + 0.02), cap = new THREE.BoxGeometry(w, 0.08, d);
    root.add(mesh(body, obsBodyMat, 0, OBS_H / 2, 0), mesh(band, obsBandMat, 0, OBS_H * 0.62, 0), mesh(cap, obsCapMat, 0, OBS_H + 0.04, 0));
    root.position.set(b.x, 0, b.y);
    obsLayer.add(root);
    obsRecs.push({ root, geos: [body, band, cap], box: { x: b.x, y: b.y, hw: b.hw, hh: b.hh, w, d, h: OBS_H } });
    obsStats.built++;
  }
}
function drawObstacleDecals() {   // dark footprint under each barricade (no real shadows)
  for (const r of obsRecs) {
    const b = r.box, x0 = b.x - b.hw, x1 = b.x + b.hw, z0 = b.y - b.hh, z1 = b.y + b.hh, m = 0.14;
    dec.quad(x0 - m, z0 - m, x1 + m, z0 - m, x1 + m, z1 + m, x0 - m, z1 + m, SCORCH, 0.55, 0.02);
  }
}

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
if (renderer) newLoader().load('assets/necromancer.glb?v=' + ASSET_V, gltf => {
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
  hero.root = turn; hero.src = gltf;   // the title stage clones this for its own necromancer
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
  else if (f.k === 'shot') {
    dec.line(f.x, f.y, f.tx, f.ty, f.uid ? 0.24 : f.arch === 'ranger' ? 0.14 : 0.07, COL[f.arch], 1, 0.9);
    if (f.uid) dec.line(f.x, f.y, f.tx, f.ty, 0.08, WHITE, 1, 0.92);   // 소환수 사수 탄: 굵고 밝은 심
  }
  else if (f.k === 'die') dec.ring(f.x, f.y, 0.4 + (0.35 - f.t) * (f.big ? 8 : 3), f.big ? 0.2 : 0.1, COL[f.arch], 1);
  else if (f.k === 'block') dec.ring(f.x, f.y, f.r * 1.6, 0.22, COL.armor, 1, f.face - 1.1, f.face + 1.1, 0.5);
  else if (f.k === 'raise') dec.ring(f.x, f.y, 0.5 + (0.45 - f.t) * 3, 0.14, COL[f.arch], 1);
  else if (f.k === 'absorb') {
    const u = g.units.find(x => x.uid === f.uid); if (!u) return;
    const k = 1 - f.t / 0.35, col = f.q === 3 ? COL.great : COL[f.type];
    dec.line(f.x + (u.x - f.x) * k, f.y + (u.y - f.y) * k, u.x, u.y, 0.18, col, 1, 0.5);
    dec.ring(u.x, u.y, u.r + 0.3 + k * 1.2, 0.1, col, 1);
  } else if (f.k === 'boom' && f.weak) {   // 덜 익은 폭발: 작고 흐린 회색 한 겹
    const k = 1 - f.t / 0.4;
    dec.disc(f.x, f.y, f.r * (0.4 + k * 0.5), COL.dim, (1 - k) * 0.25, 0, Math.PI * 2, H);
    dec.ring(f.x, f.y, f.r * (0.3 + k * 0.8), 0.12, COL.dim, 1 - k, 0, Math.PI * 2, H + 0.01);
  } else if (f.k === 'boom') {   // 익은 폭발: 흰 섬광 → 붉은 원판, 금빛 고리 두 겹, 밖으로 튀는 파편 줄, 빠르게 퍼지는 얇은 충격파 두 겹
    const k = 1 - f.t / 0.7, e = 1 - (1 - k) * (1 - k), el = 0.7 - f.t;
    if (el < 0.08) dec.disc(f.x, f.y, f.r * 0.5, WHITE, 1 - el / 0.08, 0, Math.PI * 2, H + 0.04);
    for (const [sp, tt] of [[2.6, 0.3], [3.6, 0.45]]) if (el < tt) { const q = el / tt; dec.ring(f.x, f.y, f.r * (0.4 + q * sp), 0.09, COL.great, 1 - q, 0, Math.PI * 2, H + 0.05); }
    dec.disc(f.x, f.y, f.r * (0.5 + e * 0.6), COL.danger, (1 - k) * 0.75, 0, Math.PI * 2, H);
    dec.ring(f.x, f.y, f.r * (0.3 + e * 1.1), 0.45 * (1 - k) + 0.08, COL.great, 1 - k, 0, Math.PI * 2, H + 0.01);
    dec.ring(f.x, f.y, f.r * (0.2 + e * 1.6), 0.12, COL.ink, (1 - k) * 0.8, 0, Math.PI * 2, H + 0.02);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + 0.3, r0 = f.r * (0.4 + e * 0.9), r1 = r0 + 0.6 + e * 1.2; dec.line(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0, f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1, 0.16, COL.great, 1 - k, H + 0.03); }
  } else if (f.k === 'ripe') {   // 80%를 넘는 순간: 그 키메라에서 금빛 고리가 한 번 퍼진다
    const u = g.units.find(x => x.uid === f.uid), k = 1 - f.t / 0.6, x = u ? u.x : f.x, y = u ? u.y : f.y;
    dec.ring(x, y, 0.5 + k * 2.2, 0.2 * (1 - k) + 0.05, COL.great, 1 - k);
  } else if (f.k === 'postfall') {   // 초소가 무너진다: 큰 고리 두 겹과 흩어지는 파편
    const k = 1 - f.t / 0.9, e = 1 - (1 - k) * (1 - k);
    dec.ring(f.x, f.y, 0.8 + e * 4, 0.3 * (1 - k) + 0.06, COL.great, 1 - k);
    dec.ring(f.x, f.y, 0.6 + e * 2.4, 0.18, COL.armor, 1 - k);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r0 = 0.5 + e * 1.5, r1 = r0 + 0.5 + e; dec.line(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0, f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1, 0.2, COL.armor, 1 - k); }
  } else if (f.k === 'wave') { const k = 1 - f.t / 0.3; dec.ring(f.x, f.y, f.r * k, 0.22 * (1 - k) + 0.05, COL.armor, 1); }
  else if (f.k === 'leap') dec.line(f.x, f.y, f.tx, f.ty, 0.3 * (f.t / 0.25), COL.beast, 1);
  else if (f.k === 'volley') dec.disc(f.x, f.y, 6.5, COL.ranger, f.t / 0.25 * 0.3, f.face - 0.7, f.face + 0.7);
  else if (f.k === 'clash') { const k = 1 - f.t / 0.4; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; dec.line(f.x + Math.cos(a) * (0.3 + k), f.y + Math.sin(a) * (0.3 + k), f.x + Math.cos(a) * (0.9 + k * 2), f.y + Math.sin(a) * (0.9 + k * 2), 0.2, COL.ink, 1, 0.5); } }
  else if (f.k === 'rebirth') { const k = 1 - f.t / 0.6; dec.ring(f.x, f.y, 0.4 + k * 2.4, 0.2, COL.great, 1); dec.ring(f.x, f.y, 0.4 + k * 4, 0.08, COL.great, 1); }
  else if (f.k === 'down') dec.ring(f.x, f.y, 0.6 + (0.5 - f.t) * 2, 0.1, COL.danger, 1);
  else if (f.k === 'subboom') {   // 집속탄 하나: 작은 붉은 원판과 금빛 고리
    const k = 1 - f.t / 0.35;
    dec.disc(f.x, f.y, f.r * (0.4 + k * 0.6), COL.danger, (1 - k) * 0.6, 0, Math.PI * 2, H);
    dec.ring(f.x, f.y, f.r * (0.3 + k * 0.8), 0.22 * (1 - k) + 0.06, COL.great, 1 - k, 0, Math.PI * 2, H + 0.01);
  }
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

// ---- Title stage (home screen) ----
// A night street where the necromancer (back center) and the three summons (front left/center/right) stand and breathe.
// The first summon picked on the title (opts.starter, the same state as window.ChimeraTitle) steps forward under its own light, glow and ring.
// Taps come in through view.pickTitle: a Raycaster against one hit proxy per summon, then the nearest summon on screen as the fallback
// (so a tap also works on the shape stand-ins while the GLB models are still loading). It has its own scene, camera and lights: built on the
// first title frame and fully disposed on the first battle frame, so the battle scene, camera and district theme are never touched.
const TITLE = { gap: 1.75, front: 0.55, back: -1.5, step: 0.95, summon: 1.7, fov: 34, elev: 10 * Math.PI / 180 };
const titleStats = { builds: 0, disposed: 0 };
let stage = null;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), tvec = new THREE.Vector3();
function dropTitleModel(s) {
  if (!s.model) return;
  s.model.mixer.stopAllAction();
  for (const m of s.model.mats) m.dispose();
  s.model = null;
}
// Body of one title figure: the GLB (makeBodyModel for summons, a clone of the hero model for the necromancer) or a shape stand-in
function setTitleBody(s) {
  if (s.body) s.holder.remove(s.body);
  dropTitleModel(s);
  const body = new THREE.Group();
  if (s.kind === 'necro' && hero.src) {
    const root = cloneSkinned(hero.src.scene), mats = [];
    root.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.material = o.material.clone(); mats.push(o.material); });
    const mixer = new THREE.AnimationMixer(root), clip = hero.src.animations.find(c => c.name === 'idle') || hero.src.animations[0];
    if (clip) mixer.clipAction(clip).play();
    body.add(root); s.model = { mixer, mats, walk: null };
  } else if (s.kind !== 'necro' && BODY[s.kind]) {
    const m = makeBodyModel(s.kind);
    if (m.walk) m.walk.timeScale = 0;   // stand in the first pose; the breathing comes from the holder
    m.holder.scale.setScalar(TITLE.summon); body.add(m.holder); s.model = m;
  } else if (s.kind === 'necro') {
    const robeT = mesh(GEO.cone, lambert('necro'), 0, 0.75, 0); robeT.scale.set(0.8, 1.5, 0.8);
    const headT = mesh(GEO.dot, lambert('bone'), 0, 1.7, 0); headT.scale.setScalar(0.26);
    body.add(robeT, headT);
  } else {
    const sh = mesh(s.kind === 'beast' ? GEO.horn : s.kind === 'armor' ? GEO.box : GEO.ball, lambert(s.kind), 0, 0.62, 0); sh.scale.setScalar(0.5);
    body.add(sh);
  }
  body.rotation.y = -Math.PI / 2 + s.yaw;   // model front is +x: turn it toward the camera (+z), summons a little toward the center
  s.body = body; s.fallback = !s.model; s.holder.add(body);
}
function buildTitle() {
  titleStats.builds++;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(TITLE.fov, 1, 0.1, 120);
  const st = { scene: sc, cam, geos: [], mats: [], texs: [], slots: [], hits: [], proxies: new Map(), last: null, sel: null, frame: null };
  const G = x => { st.geos.push(x); return x; }, M = x => { st.mats.push(x); return x; };
  sc.background = new THREE.Color('#07060c');
  sc.fog = new THREE.Fog('#07060c', 14, 40);
  sc.add(new THREE.HemisphereLight('#7c78b8', '#140f1c', 1.15));
  const moon = new THREE.DirectionalLight('#cdd6ff', 0.9); moon.position.set(-4, 8, 6); sc.add(moon);
  // street: asphalt, a sidewalk along the buildings, a dashed center line
  sc.add(mesh(G(new THREE.PlaneGeometry(48, 36).rotateX(-Math.PI / 2)), M(new THREE.MeshLambertMaterial({ color: COL.ground.clone() })), 0, 0, -4));
  sc.add(mesh(G(new THREE.BoxGeometry(48, 0.16, 3)), M(new THREE.MeshLambertMaterial({ color: COL.grid.clone() })), 0, 0.08, -4.6));
  const dashG = G(new THREE.BoxGeometry(1.1, 0.02, 0.1)), dashM = M(new THREE.MeshBasicMaterial({ color: COL.great.clone(), transparent: true, opacity: 0.4 }));
  for (let x = -12; x <= 12; x += 2.4) sc.add(mesh(dashG, dashM, x, 0.012, 2.6));
  // buildings with lit windows behind the sidewalk (same window texture as the battle city)
  const texs = [windowTexture(13), windowTexture(41), windowTexture(73)]; st.texs.push(...texs);
  const roofM = M(new THREE.MeshLambertMaterial({ color: new THREE.Color('#14111b') })), facs = texs.map(t => M(new THREE.MeshBasicMaterial({ map: t })));
  let seed = 19;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = -13; x < 13;) {
    const w = 2.4 + rnd() * 2.4, h = 4.5 + rnd() * 7, d = 2.6, geo = G(new THREE.BoxGeometry(w, h, d)), uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) { const fw = f < 2 ? d : w, fh = f === 2 || f === 3 ? d : h; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * fw / 4, uv.getY(i) * fh / 8); } }
    const fac = facs[Math.floor(rnd() * facs.length)], b = new THREE.Mesh(geo, [fac, fac, roofM, roofM, fac, fac]);
    b.position.set(x + w / 2, h / 2, -7.4); sc.add(b);
    x += w + 0.35;
  }
  const neonG = G(new THREE.BoxGeometry(1.8, 0.5, 0.1));
  for (const [k, x, y] of [['great', -7.0, 3.0], ['necro', -4.2, 3.4], ['beast', -1.3, 4.3], ['armor', 1.6, 3.1], ['ranger', 4.4, 4.0], ['danger', 7.2, 3.6]]) sc.add(mesh(neonG, basic(k), x, y, -6.0));
  const poleG = G(new THREE.BoxGeometry(0.12, 2.8, 0.12)), poleM = M(new THREE.MeshLambertMaterial({ color: new THREE.Color('#3a3445') })), bulbG = G(new THREE.SphereGeometry(0.2, 10, 8));
  for (const lx of [-3.6, 3.6]) {
    sc.add(mesh(poleG, poleM, lx, 1.4, -3.6), mesh(bulbG, basic('great'), lx, 2.85, -3.6));
    const lamp = new THREE.PointLight(HEX.great, 4, 7, 1.5); lamp.position.set(lx, 2.6, -3.2); sc.add(lamp);
  }
  // highlight of the picked summon: ring and glow at its feet, a light of its color above it
  st.ring = mesh(G(new THREE.TorusGeometry(0.95, 0.05, 8, 48)), M(new THREE.MeshBasicMaterial({ color: COL.great.clone(), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })), 0, 0.04, 0);
  st.ring.rotation.x = Math.PI / 2;
  st.glow = mesh(G(new THREE.CircleGeometry(1.15, 40).rotateX(-Math.PI / 2)), M(new THREE.MeshBasicMaterial({ color: COL.great.clone(), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })), 0, 0.02, 0);
  st.spot = new THREE.PointLight(HEX.great, 9, 7, 1.4);
  sc.add(st.ring, st.glow, st.spot);
  // figures: necromancer back center, summons front left/center/right (S.KINDS order), each with an invisible hit proxy
  const proxyG = G(new THREE.CylinderGeometry(0.75, 0.75, 1.6, 10)), proxyM = M(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  const n = S.KINDS.length;
  const add = (kind, x, z, yaw, i) => {
    const s = { kind, x, z, yaw, fwd: 0, phase: 0.4 + i * 1.7, holder: new THREE.Group(), body: null, model: null, fallback: true };
    s.holder.position.set(x, 0, z); sc.add(s.holder); setTitleBody(s); st.slots.push(s);
    return s;
  };
  add('necro', 0, TITLE.back, 0, 0);
  S.KINDS.forEach((k, i) => {
    const s = add(k, (i - (n - 1) / 2) * TITLE.gap, TITLE.front, i === 0 ? 0.75 : i === n - 1 ? -0.75 : 0.5, i + 1);
    const p = mesh(proxyG, proxyM, 0, 0.8, 0); s.holder.add(p); st.hits.push(p); st.proxies.set(p, k);
  });
  return st;
}
// Frame the street in the band between the logo and the buttons (#homeStage), portrait first: everything fits the width
function frameTitle(st) {
  let top = cssH * 0.2, bot = cssH * 0.72;
  const hs = document.getElementById('homeStage'), cr = cv3 && cv3.getBoundingClientRect ? cv3.getBoundingClientRect() : null, hr = hs && hs.getBoundingClientRect ? hs.getBoundingClientRect() : null;
  if (cr && hr && hr.height > 60) { top = Math.max(0, hr.top - cr.top); bot = Math.min(cssH, hr.top - cr.top + hr.height); }
  const band = Math.max(60, bot - top), aspect = cssW / cssH, half = Math.tan(TITLE.fov * Math.PI / 360);
  const visH = Math.max(3.2 * cssH / band, 5.8 / aspect), dist = visH / (2 * half), cam = st.cam, ty = 1.0, tz = -0.3;
  cam.fov = TITLE.fov; cam.aspect = aspect; cam.near = 0.1; cam.far = dist + 60;
  cam.position.set(0, ty + Math.sin(TITLE.elev) * dist, tz + Math.cos(TITLE.elev) * dist);
  cam.lookAt(0, ty, tz);
  cam.setViewOffset(cssW, cssH, 0, -((top + bot) / 2 - cssH / 2), cssW, cssH);   // shift the picture so the street sits in the band
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  st.scene.fog.near = dist + 4; st.scene.fog.far = dist + 30;
  st.frame = { top, bot, dist };
}
function renderTitle(now, opts) {
  if (!stage) stage = buildTitle();
  const st = stage, reduced = !!opts.reduced, sel = S.KINDS.includes(opts.starter) ? opts.starter : S.KINDS[0];
  const dt = st.last == null ? 0 : Math.min(0.05, Math.max(0, (now - st.last) / 1000));
  st.last = now; st.sel = sel;
  frameTitle(st);
  let cur = st.slots[1];
  for (const s of st.slots) {
    if (s.fallback && (s.kind === 'necro' ? hero.src : BODY[s.kind])) setTitleBody(s);   // a model finished loading: swap out the stand-in
    const on = s.kind === sel, want = on ? 1 : 0;
    s.fwd = reduced ? want : s.fwd + (want - s.fwd) * Math.min(1, dt * 7);
    const br = reduced ? 0 : Math.sin(now / 820 + s.phase), k = 1 + 0.14 * s.fwd;   // breathing: a slow swell from the feet up
    s.holder.position.set(s.x * (1 - 0.05 * s.fwd), reduced ? 0 : 0.03 * s.fwd * (1 + Math.sin(now / 300)), s.z + TITLE.step * s.fwd);
    s.holder.scale.set(k * (1 - 0.012 * br), k * (1 + 0.035 * br), k * (1 - 0.012 * br));
    s.holder.rotation.y = reduced ? 0 : Math.sin(now / 2300 + s.phase) * 0.07;
    if (s.model) {
      if (s.kind !== 'necro') for (const m of s.model.mats) {
        m.color.setScalar(0.72 + 0.28 * s.fwd);
        if (m.emissive) m.emissiveIntensity = 0.3 + s.fwd * (0.4 + (reduced ? 0 : 0.12 * Math.sin(now / 260)));
      }
      s.model.mixer.update(dt);
    }
    if (on) cur = s;
  }
  const c = COL[sel], p = reduced ? 1 : 1 + 0.06 * Math.sin(now / 260), hp = cur.holder.position;
  st.ring.position.set(hp.x, 0.04, hp.z); st.ring.scale.setScalar(p); st.ring.material.color.copy(c); st.ring.material.opacity = 0.35 + 0.6 * cur.fwd;
  st.glow.position.set(hp.x, 0.02, hp.z); st.glow.material.color.copy(c); st.glow.material.opacity = 0.3 * cur.fwd * p;
  st.spot.position.set(hp.x, 2.3, hp.z + 0.9); st.spot.color.copy(c); st.spot.intensity = 9 * cur.fwd;
  renderer.render(st.scene, st.cam);
}
function disposeTitle() {
  const st = stage;
  if (!st) return;
  stage = null;
  for (const s of st.slots) dropTitleModel(s);
  for (const x of st.geos) x.dispose();
  for (const x of st.mats) x.dispose();
  for (const x of st.texs) x.dispose();
  st.proxies.clear(); st.hits.length = 0; st.scene.clear();
  titleStats.disposed++;
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
  // Title stage tap (canvas CSS px) -> summon kind or null. Only while the title stage is up.
  pickTitle(px, py) {
    const st = stage;
    if (!st) return null;
    ndc.set(px / cssW * 2 - 1, 1 - py / cssH * 2);
    raycaster.setFromCamera(ndc, st.cam);
    const hits = raycaster.intersectObjects(st.hits, false);
    if (Array.isArray(hits)) for (const h of hits) { const k = st.proxies.get(h.object); if (k) return k; }
    let best = null, bd = Infinity;   // fallback: nearest summon on screen
    for (const s of st.slots) {
      if (s.kind === 'necro') continue;
      const p = s.holder.position;
      tvec.set(p.x, 0.7, p.z).project(st.cam);
      const d = Math.hypot((tvec.x + 1) / 2 * cssW - px, (1 - tvec.y) / 2 * cssH - py);
      if (d < bd) { bd = d; best = s.kind; }
    }
    return bd <= Math.max(44, cssW * 0.16) ? best : null;
  },
  render(game, now, opts) {
    g = game;
    if (opts && opts.title) { renderTitle(now, opts); return; }
    if (stage) disposeTitle();   // the run started: drop the title scene, camera and lights before the first battle frame
    applyTheme(themeIdxOf(g.district));
    const n = g.necro, reduced = opts.reduced;
    // 네크로맨서를 부드럽게 따라가되, 판의 먼 쪽(초소가 있는 쪽)을 조금 더 보여 준다.
    // 가까운 두 변(x = W, y = H) 너머의 빈 땅이 화면을 차지하지 않게 목표를 판 안쪽으로 묶는다
    // Boss intro cut: render.js passes opts.focus (necromancer -> boss blend, same focus as the 2D camera); follow it instead of the necromancer
    const fo = opts.focus && Number.isFinite(opts.focus.x) && Number.isFinite(opts.focus.y) ? opts.focus : n;
    const LOOK = 5, tx = Math.min(S.W - 2, fo.x - LOOK * R2), tz = Math.min(S.H - 4, fo.y - LOOK * R2);
    if (g !== lastGame) { lastGame = g; target.set(tx, 0, tz); }
    target.x += (tx - target.x) * 0.28; target.z += (tz - target.z) * 0.28;
    placeCamera(opts.shake);
    dec.reset();
    syncObstacles(g);
    drawObstacleDecals();
    // 바닥 그을음(화면 쪽이 만든 목록): 익은 폭발 자리, 옅어지며 사라진다
    for (const s of opts.scorch || []) { const a = s.t / opts.scorchT; for (let i = 0; i < 3; i++) dec.disc(s.x, s.y, s.r * (1 - i * 0.28), SCORCH, a * 0.33, 0, Math.PI * 2, 0.02 + i * 0.002); }
    for (const s of g.souls) drawSoul(s, now, reduced);
    for (const h of g.hearts) drawHeart(h, now, reduced);
    for (const p of g.posts) drawPost(p, n, now, reduced);
    for (const e of g.enemies) drawEnemy(e, now, reduced);
    // 예고 연결선: 이 혼을 밟으면 누가 먹는지. 먹으면 터질 참이면 붉다
    if (g.link) {
      const u = g.units.find(x => x.uid === g.link.uid);
      if (u) {
        const soul = g.souls.find(s => s.x === g.link.x && s.y === g.link.y);
        const add = soul ? S.CFG.soul[soul.q].inst * (soul.q === 3 ? 1 : 1 + S.CFG.mut.gluttonyInst * (g.muts.gluttony || 0)) : 0, willPop = add > 0 && u.inst + add >= 100, c = willPop ? COL.danger : COL.necro;   // 과식 본능이면 실제처럼 더 오른다
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
    // 맹수 소용돌이: 도는 붉은 고리 두 겹. 사수 집속탄: 깜빡이는 점. 갑주 방벽: 네크로맨서 둘레 푸른 고리(1초 남으면 깜빡)
    for (const v of g.vortexes) {
      const a = Math.min(1, v.t / 0.5), rot = reduced ? 0 : now / 260;
      for (let j = 0; j < 2; j++) { const rr = v.r * (j ? 0.55 : 1), d = j ? -1.6 : 1;
        for (let i = 0; i < 3; i++) { const a0 = rot * d + i * Math.PI * 2 / 3; dec.ring(v.x, v.y, rr, j ? 0.14 : 0.2, COL.danger, 0.85 * a, a0, a0 + Math.PI * 0.45, 0.06); } }
    }
    for (const b of g.clusters) dec.disc(b.x, b.y, 0.3, Math.floor(now / 70) % 2 ? COL.danger : COL.beast, 1, 0, Math.PI * 2, 0.07);
    if (n.shieldT > 0 && !(n.shieldT < 1 && Math.floor(now / 110) % 2)) dec.ring(n.x, n.y, n.r + 0.55, 0.22, COL.armor, 0.9, 0, Math.PI * 2, 0.08);
    necro.position.set(n.x, 0, n.y);
    drawHero(n, now);
    dec.ring(n.x, n.y, n.r + 0.16, 0.08, COL.ink, 1);
    for (const f of g.fx) drawFx(f);
    sweep();
    dec.flush();
    renderer.render(scene, camera);
  },
};
if (renderer) {
  view._hero = hero;
  // Inspection hooks read the live scene graph: each group in obsLayer.children (position x/z) and its body mesh geometry size (BoxGeometry.parameters)
  view._obstacles = () => obsLayer.children.map(root => {
    const body = root.children[0], p = (body && body.geometry && body.geometry.parameters) || {};
    return { x: root.position.x, y: root.position.z, w: p.width, h: p.height, d: p.depth, root, geos: root.children.map(c => c.geometry) };
  });
  view._obstacleStats = () => ({ built: obsStats.built, disposed: obsStats.disposed, live: obsLayer.children.length });
  view._obsLayer = obsLayer; view._scene = scene;   // 확인용(화면 검사 스크립트가 동작 상태를 읽는다)
  view._enemyLook = e => { const r = live.get(e); return r ? r.look : null; };
  view._bossFx = e => { const r = live.get(e); return r && r.bossFx ? Object.assign({}, r.bossFx, { ticks: r.bossFx.ticks.slice() }) : null; };
  view._postMark = p => { const r = live.get(p); return r && r.kind === 'post' ? { summon: r.mark.visible === true } : null; };
  view._postMarks = () => { const out = []; for (const [k, r] of live) if (r.kind === 'post') out.push({ post: k, summon: r.mark.visible === true }); return out; };
  view._themes = THEMES; view._themeIdxOf = themeIdxOf;
  view._theme = () => ({ idx: themeIdx, key: THEMES[themeIdx].key, applied: themeApplied, builds: cityBuilds, hemi, sun, ground: groundMat, walk: walkMat, fog: scene.fog, bg: scene.background });
  view._title = () => {
    const st = stage;
    return { active: !!st, builds: titleStats.builds, disposed: titleStats.disposed, selected: st ? st.sel : null, scene: st ? st.scene : null, frame: st && st.frame ? Object.assign({}, st.frame) : null,
      slots: st ? st.slots.map(s => ({ kind: s.kind, x: s.holder.position.x, z: s.holder.position.z, fwd: s.fwd, model: !!s.model, fallback: s.fallback })) : [] };
  };
  window.ChimeraView = view;
} else {
  window.ChimeraView3DError = String((glError && glError.message) || glError);
  console.warn('3D 판을 띄우지 못해 2D 판으로 그린다: ' + window.ChimeraView3DError);
}
