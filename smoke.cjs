// 합친 2d.html의 화면 코드(render.js, 3D 판과 같은 코드)를 가짜 DOM으로 돌려 예외가 없는지 본다(그림과 소리는 확인하지 못한다).
// 같은 시나리오를 두 경로로, 서로 다른 프로세스에서 따로 돌린다(render.js는 띄울 때 window.ChimeraView를 V로 붙잡고, 시나리오가 sim.js의 CFG도 바꾼다):
//  2d: window.ChimeraView 없음 / 3d: render.js를 띄우기 전에 가짜 window.ChimeraView를 넣는다.
// 그다음 가짜 V가 센티넬 예외를 던지면 삼켜지지 않고 비정상 종료로 이어지는지 스스로 확인한다.
if (!process.env.CHIMERA_SMOKE_VIEW) {
  const { spawnSync } = require('child_process');
  const run = (view, thr) => spawnSync(process.execPath, [__filename], { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { CHIMERA_SMOKE_VIEW: view, CHIMERA_SMOKE_THROW: thr || '' }) });
  // 3d-throw / 3d-noctx: 진짜 src/render3d.js를 가짜 three로 띄우되 WebGLRenderer가 예외를 던지거나 컨텍스트가 없다 → 2D 폴백으로 같은 시나리오
  const LABEL = { '2d': ' (window.ChimeraView 없음)', '3d': ' (가짜 window.ChimeraView)', '3d-throw': ' (WebGLRenderer 생성 예외 → 2D 폴백)', '3d-noctx': ' (WebGL 컨텍스트 없음 → 2D 폴백)' };
  for (const view of ['2d', '3d', '3d-throw', '3d-noctx']) {
    console.log('==== 화면 경로 ' + view + LABEL[view] + ' ====');
    const r = run(view);
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.error || r.status !== 0) { console.error(view + ' 경로 스모크 실패 (종료 코드 ' + r.status + (r.error ? ', ' + r.error.message : '') + ')'); process.exit(r.status || 1); }
  }
  // render: V.render 자체, marks: drawMarks3D 안의 V.toScreen(초소 내구도 높이 2.3)
  for (const thr of ['render', 'marks']) {
    const r = run('3d', thr), mark = 'SMOKE_SENTINEL_' + thr;
    if (r.error) { console.error('센티넬 확인을 띄우지 못했다: ' + r.error.message); process.exit(1); }
    if (r.status === 0 || !String(r.stderr).includes(mark)) { console.error('V 분기 예외(' + mark + ')가 삼켜졌거나 다른 까닭으로 끝났다: 종료 코드 ' + r.status + '\n' + r.stderr); process.exit(1); }
    console.log('V 분기 예외 전파: ' + thr + '에서 던진 센티넬이 비정상 종료(코드 ' + r.status + ')로 이어진다');
  }
  return;
}
const fs = require('fs');
const S = require('./src/sim.js');
// ---- 돌격조 종류별 패턴(규칙만, 시드 고정): 맹수는 짧은 간격의 연속 돌진, 사수는 escort 소환, 갑주는 예전 그대로 ----
if (process.env.CHIMERA_SMOKE_VIEW === '2d') {
  const C = S.CFG, still = { x: 0, y: 0 }, EB = C.eliteBeast, ER = C.eliteRanger, LP = C.bossLap;
  if (!(EB.gap > LP.ranger.gap && EB.gap < C.rechargeEvery && EB.chain <= LP.ranger.chain && ER.every > LP.armor.every && ER.every > LP.beast.every && ER.n < LP.armor.n && ER.n < LP.beast.n)) throw new Error('돌격조 패턴은 bossLap보다 약해야 한다: ' + JSON.stringify({ EB, ER }));
  const eliteOf = idx => {
    const g = S.newGame(4242, { district: 1 }); g.spawnT = 1e9; g.posts = []; g.postsTotal = 0; g.enemies = []; g.units = []; g.necro.hp = g.necro.maxHp = 1e9;
    g.eliteIdx = idx; g.t = C.eliteFirst + C.eliteEvery * idx - C.eliteWarn; S.step(g, 1 / 60, still);
    const e = g.enemies.find(x => x.elite); g.eliteIdx = 99;
    if (!e || e.boss || e.arch !== S.KINDS[idx % 3]) throw new Error('돌격조 ' + idx + '번이 나오지 않았다');
    return { g, e };
  };
  const trace = idx => {
    const { g, e } = eliteOf(idx); e.mode = 'chase'; e.rechargeT = 0.01; e.x = 9; e.y = 6;
    const log = []; let prev = e.mode, n0 = g.enemies.length, adds = 0;
    for (let i = 0; i < 60 * 40 && log.filter(x => x.mode === 'charge').length < 3; i++) {
      S.step(g, 1 / 60, still);
      if (g.enemies.length > n0) adds += g.enemies.length - n0; n0 = g.enemies.length;
      if (e.mode !== prev) { log.push({ mode: e.mode, t: g.t, rechargeT: e.rechargeT }); prev = e.mode; }
    }
    return { log, adds, ch: log.filter(x => x.mode === 'chase'), cg: log.filter(x => x.mode === 'charge') };
  };
  const summons = idx => {
    const { g, e } = eliteOf(idx); e.stun = 1e9; const out = [];
    for (let i = 0; i < Math.round(60 * (ER.every * 2 + 0.5)); i++) { const n0 = g.enemies.length; S.step(g, 1 / 60, still); if (g.enemies.length > n0) out.push({ t: g.t, n: g.enemies.length - n0 }); }
    return { g, e, out };
  };
  // 맹수 돌격조(0번)
  const B = trace(0);
  if (B.cg.length !== 3 || B.ch.length < 2 || B.ch[0].rechargeT !== EB.gap || !(B.cg[1].t - B.ch[0].t < C.rechargeEvery) || B.ch[1].rechargeT !== C.rechargeEvery || B.cg[2].t - B.ch[1].t < C.rechargeEvery - 1e-6) throw new Error('맹수 돌격조 연속 돌진: ' + JSON.stringify(B.log));
  if (B.adds || summons(0).out.length) throw new Error('맹수 돌격조가 소환했다');
  // 갑주 돌격조(1번): 예전 그대로
  const A = trace(1);
  if (A.cg.length !== 3 || A.ch.length < 2 || !A.ch.every(x => x.rechargeT === C.rechargeEvery) || A.adds || summons(1).out.length) throw new Error('갑주 돌격조가 예전과 다르다: ' + JSON.stringify(A.log) + ' / 소환 ' + A.adds);
  // 사수 돌격조(2번): every초마다 escort n마리, 연속 돌진 없음
  const R = summons(2);
  if (R.out.length !== 2 || !R.out.every(a => a.n === ER.n) || Math.abs(R.out[1].t - R.out[0].t - ER.every) > 1 / 60 + 1e-9) throw new Error('사수 돌격조 소환: ' + JSON.stringify(R.out));
  const esc = R.g.enemies.filter(x => x !== R.e);
  if (esc.length !== 2 * ER.n || !esc.every(x => x.escort && x.g === 1 && !x.elite)) throw new Error('사수 돌격조가 부른 것은 1등급 escort여야 한다');
  const RT = trace(2);
  if (!RT.ch.every(x => x.rechargeT === C.rechargeEvery)) throw new Error('사수 돌격조는 연속 돌진하지 않는다: ' + JSON.stringify(RT.log));
  // 같은 시드면 같은 결과
  if (JSON.stringify(trace(0).log) !== JSON.stringify(B.log) || JSON.stringify(summons(2).out) !== JSON.stringify(R.out)) throw new Error('돌격조 패턴이 같은 시드에서 다르다');
  console.log('돌격조 패턴(시드 4242): 맹수 연속 돌진 간격 ' + (B.cg[1].t - B.ch[0].t).toFixed(2) + '초(< ' + C.rechargeEvery + '), 사수 ' + ER.every + '초마다 escort ' + ER.n + '마리, 갑주 예전 그대로');
}
const h = fs.readFileSync('2d.html', 'utf8');
const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
for (const s of scripts) new Function(s);
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
const els = {};
const el = id => {
  const o = {
    id, hidden: false, textContent: '', width: 0, height: 0, className: '', type: '', handlers: {}, kids: [],
    addEventListener(e, f) { (o.handlers[e] = o.handlers[e] || []).push(f); },
    getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760, left: 0, top: 0 }),
    setPointerCapture: noop, focus: noop,
    appendChild(c) { o.kids.push(c); }, setAttribute(k, v) { o['attr:' + k] = String(v); },
  };
  Object.defineProperty(o, 'textContent', { get() { return o._t || ''; }, set(v) { o._t = v; if (v === '') o.kids = []; } });
  return o;
};
const fire = (id, e, arg) => { for (const f of (els[id].handlers[e] || [])) f(arg); };
// 끝 화면 상점: 종류 탭(맹수·갑주·사수)과 능력치 버튼(체력·공격력·간격·이속·사거리·받는 피해 순서)은 코드가 만든다
const tab = i => { for (const f of els.statTabs.kids[i].handlers.click) f({}); };
const statBtn = i => els.statShop.kids[i];
const buyStat = (i = 0) => { for (const f of statBtn(i).handlers.click) f({}); };
const beastHp = () => game.units[0].up && game.units[0].up.hp;
// 가짜 오디오: 호출 횟수만 센다
// 가짜 오디오: 호출 횟수를 세고, 노드 연결(connect)과 gain 값을 기록한다
let tones = 0;
const acs = [];
const node = ac => {
  const n = { outs: [], getChannelData: () => new Float32Array(8), start: noop, stop: noop,
    gain: { value: 1, setValueAtTime(v) { n.gain.value = v; }, exponentialRampToValueAtTime: noop },
    frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop },
    connect(d) { n.outs.push(d); ac.edges.push([n, d]); return d; } };
  return n;
};
function AC() {
  acs.push(this); this.edges = []; this.currentTime = 0; this.sampleRate = 8; this.state = 'running'; this.destination = { dest: true };
  this.createOscillator = () => { tones++; return Object.assign(node(this), { src: 'osc' }); };
  this.createGain = () => Object.assign(node(this), { isGain: true });
  this.createBiquadFilter = () => node(this);
  this.createBufferSource = () => { tones++; return Object.assign(node(this), { src: 'buf' }); };
  this.createBuffer = () => node(this); this.resume = noop;
}
let raf = null, now = 0;
const timers = [], store = {};
const flush = () => { for (const t of timers) if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); } };
const winH = {};
const fireWin = (type, arg) => { for (const f of (winH[type] || [])) f(arg); };
const win = { addEventListener: (t, f) => { (winH[t] = winH[t] || []).push(f); }, devicePixelRatio: 3, matchMedia: () => ({ matches: false }), ChimeraSim: S, AudioContext: AC };
// ---- 화면 경로: 3d면 render.js가 V를 붙잡기 전에(boot 전에) 가짜 window.ChimeraView를 넣는다 ----
const VIEW = process.env.CHIMERA_SMOKE_VIEW, THROW = process.env.CHIMERA_SMOKE_THROW || '';
if (!['2d', '3d', '3d-throw', '3d-noctx'].includes(VIEW)) throw new Error('CHIMERA_SMOKE_VIEW는 2d, 3d, 3d-throw, 3d-noctx: ' + VIEW);
const vcalls = { render: 0, resize: 0, toScreen: 0, toWorld: 0, rotateInput: 0, pxPerUnit: 0, marks: 0, titleRender: 0, pick: 0 };
let vGame = null, vResize = null, vOpts = null;
const VPX = 390 / 13;
// 가짜 카메라는 아래 tap()과 같은 사상을 쓴다(가로 13칸이 390px, 네크로맨서를 따라감). 그래야 같은 시나리오의 톡이 같은 자리를 누른다
const vCam = () => { const n = game.necro, vh = 760 / VPX; return [Math.max(0, Math.min(S.W - 13, n.x - 6.5)), Math.max(0, Math.min(S.H - vh, n.y - vh / 2))]; };
const sentinel = k => { if (THROW === k) throw new Error('SMOKE_SENTINEL_' + k); };
if (VIEW === '3d') win.ChimeraView = {
  render(g, t, opts) {
    vcalls.render++; sentinel('render');
    if (!g || !g.necro || typeof t !== 'number' || !opts || typeof opts.shake !== 'number' || typeof opts.reduced !== 'boolean' || !Array.isArray(opts.scorch) || !(opts.scorchT > 0)) throw new Error('V.render(g, now, { shake, reduced, scorch, scorchT }) 규약이 아니다');
    vGame = g; vOpts = opts; if (opts.title) vcalls.titleRender++;
  },
  resize(w, h) { vcalls.resize++; vResize = [w, h]; },
  pxPerUnit() { vcalls.pxPerUnit++; return VPX; },
  toScreen(x, y, h) {
    vcalls.toScreen++;
    if (h === 2.3) { vcalls.marks++; sentinel('marks'); }   // drawMarks3D의 초소 내구도만 이 높이를 쓴다
    const [cx, cy] = vCam(); return [(x - cx) * VPX, (y - cy) * VPX];
  },
  toWorld(px, py) { vcalls.toWorld++; const [cx, cy] = vCam(); return { x: px / VPX + cx, y: py / VPX + cy }; },
  // 실제 판은 45도 돌리지만, 가짜는 tap()과 같은 좌표계를 지키려고 그대로 돌려준다(형식은 [x, y])
  rotateInput(x, y) { vcalls.rotateInput++; return [x, y]; },
  // title stage tap: left third beast, middle armor, right ranger (the real one ray-casts its own camera)
  pickTitle(px, py) { vcalls.pick++; return px < 130 ? 'beast' : px < 260 ? 'armor' : 'ranger'; },
};
if (VIEW === '2d' && 'ChimeraView' in win) throw new Error('2d 경로에 window.ChimeraView가 있다');
const docH = {};
const fireDoc = type => { for (const f of (docH[type] || [])) f({}); };
const doc = { documentElement: {}, hidden: false, addEventListener: (t, f) => { (docH[t] = docH[t] || []).push(f); }, getElementById: id => els[id] || (els[id] = el(id)), createElement: () => el('created') };
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
// ---- 3D 실패 경로: 진짜 src/render3d.js를 가짜 three로 돌린다(import 줄만 빼고) ----
const r3src = fs.readFileSync('src/render3d.js', 'utf8');
function runRender3D(w, d, glMode) {
  // 어떤 속성을 읽어도, 부르거나 new 해도 자기 자신을 돌려주는 가짜(숫자로 쓰면 0)
  const any = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : any), set: () => true, apply: () => any, construct: () => any });
  function WebGLRenderer() {
    if (glMode === 'throw') throw new Error('Error creating WebGL context.');
    this.getContext = () => (glMode === 'noctx' ? null : {});
    this.dispose = () => { w.smokeDisposed = true; };
    for (const k of ['setPixelRatio', 'setClearColor', 'setSize', 'render']) this[k] = noop;
  }
  // 바리케이드 확인용: Group/Scene(children add/remove/clear), Mesh(geometry), position.set, BoxGeometry(parameters, dispose 횟수)만 실제처럼 기록한다. 나머지 속성은 any로 넘긴다
  const fake = o => new Proxy(o, { get: (t, k) => (k in t ? t[k] : any), set: (t, k, v) => { t[k] = v; return true; } });
  const vec = () => fake({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  function Group() {
    return fake({ children: [], parent: null, position: vec(),
      add(...cs) { for (const c of cs) { if (!this.children.includes(c)) this.children.push(c); c.parent = this; } return this; },
      remove(...cs) { for (const c of cs) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parent = null; } } return this; },
      clear() { for (const c of this.children) c.parent = null; this.children.length = 0; return this; } });
  }
  function Mesh(geometry, material) { return fake({ geometry, material, parent: null, position: vec() }); }
  function BoxGeometry(width, height, depth) { return fake({ parameters: { width, height, depth }, disposed: 0, dispose() { this.disposed++; } }); }
  // 구역 테마 확인용: Color(.v에 마지막 값), 조명(color/groundColor/intensity), Fog, MeshLambertMaterial(color)을 실제처럼 기록한다
  function Color(c) { return fake({ v: c === undefined ? '' : String(c), set(x) { this.v = x && typeof x === 'object' && 'v' in x ? x.v : String(x); return this; }, copy(o) { this.v = o && o.v; return this; }, clone() { return Color(this.v); } }); }
  const light = (a, b, i) => fake({ color: Color(a), groundColor: Color(b), intensity: i, position: vec() });
  function HemisphereLight(a, b, i) { return light(a, b, i); }
  function DirectionalLight(a, i) { return light(a, '', i); }
  function Fog(c, near, far) { return fake({ color: Color(c), near, far }); }
  function MeshLambertMaterial(p) { return fake({ color: Color(p && p.color && p.color.v !== undefined ? p.color.v : '#ffffff'), dispose() {} }); }
  const THREE = new Proxy({ WebGLRenderer, Group, Scene: Group, Mesh, BoxGeometry, Color, HemisphereLight, DirectionalLight, Fog, MeshLambertMaterial }, { get: (t, k) => (k in t ? t[k] : any) });
  const code = "'use strict';\n" + r3src.replace(/^import .*$/gm, '');
  new Function('THREE', 'GLTFLoader', 'cloneSkinned', 'MeshoptDecoder', 'window', 'document', 'getComputedStyle', code)(THREE, any, any, any, w, d, () => ({ getPropertyValue: () => '#aabbcc' }));
}
const FAIL = VIEW === '3d-throw' ? 'throw' : VIEW === '3d-noctx' ? 'noctx' : null;
if (FAIL) {
  // 렌더러가 살아 있으면 3D를 그대로 띄운다(따로 만든 창에서 확인)
  {
    const els2 = {}, w2 = { devicePixelRatio: 2, ChimeraSim: S };
    runRender3D(w2, { documentElement: {}, getElementById: id => els2[id] || (els2[id] = el(id)), createElement: () => el('created') }, 'ok');
    if (!w2.ChimeraView || typeof w2.ChimeraView.render !== 'function' || els2.game3d.hidden || 'ChimeraView3DError' in w2) throw new Error('WebGL이 되는데 3D 판이 뜨지 않았다');
    // 대장 종류별 3D 외형: 진짜 render3d.js의 drawEnemy를 가짜 three로 돌려 종류마다 다른 몸 색·강조색·장식을 쓰는지 본다
    const V3 = w2.ChimeraView, g3 = S.newGame(11, { district: 1 }), R3 = () => V3.render(g3, 1000, { shake: 0, reduced: false, scorch: [], scorchT: 4.5 });
    if (typeof V3._enemyLook !== 'function') throw new Error('3D 적 외형 확인 장치(_enemyLook)가 없다');
    V3.resize(390, 760);
    g3.posts = []; g3.enemies = [];
    const bs = [1, 2, 3].map(d => { g3.district = d; return S.spawnBoss(g3); });
    const elite3 = Object.assign({}, bs[0], { boss: false, arch: 'beast' }), foe3 = { elite: false, arch: 'armor', g: 1, x: 4, y: 4, hp: 9, maxHp: 9, r: 0.6, face: 0, stun: 0, flash: 0 };
    g3.enemies.push(elite3, foe3);
    R3();
    if (bs.map(b => b.arch).join() !== 'armor,beast,ranger') throw new Error('구역 1·2·3 대장 종류: ' + bs.map(b => b.arch).join());
    const looks = bs.map(b => V3._enemyLook(b));
    looks.forEach((l, i) => { if (!l || !l.crown || l.kind !== 'boss:' + bs[i].arch || l.body !== bs[i].arch) throw new Error('3D 대장 외형(' + bs[i].arch + '): ' + JSON.stringify(l)); });
    if (new Set(looks.map(l => l.body)).size !== 3 || new Set(looks.map(l => l.mark)).size !== 3) throw new Error('3D 대장 셋이 서로 구분되지 않는다: ' + JSON.stringify(looks));
    const le = V3._enemyLook(elite3), lf = V3._enemyLook(foe3);
    if (!le || le.body !== 'danger' || le.mark !== 'wedge' || le.crown) throw new Error('3D 돌격조 외형이 바뀌었다: ' + JSON.stringify(le));
    if (!lf || lf.body !== 'armor' || lf.crown) throw new Error('3D 일반 적 외형이 바뀌었다: ' + JSON.stringify(lf));
    bs[0].arch = 'ranger'; R3();
    if (V3._enemyLook(bs[0]).kind !== 'boss:ranger' || V3._enemyLook(bs[0]).mark !== looks[2].mark) throw new Error('arch가 바뀐 대장이 예전 외형을 다시 썼다: ' + JSON.stringify(V3._enemyLook(bs[0])));
    g3.enemies = []; g3.district = 4; const nb = S.spawnBoss(g3); R3();
    if (bs.some(b => V3._enemyLook(b)) || V3._enemyLook(nb).kind !== 'boss:' + nb.arch) throw new Error('구역이 바뀐 뒤 대장 외형: ' + JSON.stringify(V3._enemyLook(nb)));
    if (looks.some(l => l.assist) || V3._enemyLook(nb).assist !== 'summon') throw new Error('3D 대장 보조 패턴: 1~3구역 없음, 4구역 summon: ' + JSON.stringify(looks.map(l => l.assist)) + ' / ' + JSON.stringify(V3._enemyLook(nb)));
    nb.summonT = 0.5; R3();   // summon telegraph path runs without error
    // 3D 바리케이드: 진짜 render3d.js가 g.obstacles마다 충돌 상자와 같은 크기의 메쉬를 만들고, 판·구역이 바뀌면 이전 것을 지우고 다시 만든다
    {
      if (typeof V3._obstacles !== 'function' || typeof V3._obstacleStats !== 'function' || !V3._obsLayer || !V3._scene) throw new Error('3D 바리케이드 확인 장치(_obstacles/_obstacleStats/_obsLayer/_scene)가 없다');
      const O3 = { shake: 0, reduced: false, scorch: [], scorchT: 4.5 }, E = 1e-9, L3 = V3._obsLayer;
      const box = o => (o ? { x: o.x, y: o.y, w: o.w, h: o.h, d: o.d } : o);
      // 실제 씬: 층이 씬의 자식이고, 층의 자식 그룹 위치와 본체 BoxGeometry 치수가 충돌 상자와 같고, geometry는 아직 버려지지 않았다
      const same = (gg, where) => {
        const want = gg.obstacles || [], got = V3._obstacles();
        if (!V3._scene.children.includes(L3) || L3.parent !== V3._scene) throw new Error(where + ' 3D 바리케이드 층이 씬에 없다');
        if (got.length !== want.length || L3.children.length !== want.length) throw new Error(where + ' 3D 바리케이드 개수 ' + got.length + ' (씬 ' + L3.children.length + ') / ' + want.length);
        want.forEach((b, i) => {
          const o = got[i];
          if (!o || Math.abs(o.x - b.x) > E || Math.abs(o.y - b.y) > E || Math.abs(o.w - 2 * b.hw) > E || Math.abs(o.d - 2 * b.hh) > E || !(o.h > 0)) throw new Error(where + ' 3D 바리케이드 ' + i + '이 충돌 상자와 다르다: ' + JSON.stringify(box(o)) + ' / ' + JSON.stringify(b));
          if (o.root.parent !== L3 || o.geos.length !== 3 || o.geos.some(gm => !gm || gm.disposed !== 0)) throw new Error(where + ' 3D 바리케이드 ' + i + '의 메쉬가 씬에 없거나 geometry가 이미 버려졌다');
        });
        return got;
      };
      // 이전 메쉬: 씬에서 빠지고, 각 geometry의 dispose()가 정확히 한 번 불렸다
      const gone = (prev, where) => {
        if (!prev.length) throw new Error(where + ': 앞에 그려 둔 3D 바리케이드가 없어 정리를 확인할 수 없다');
        for (const o of prev) if (L3.children.includes(o.root) || o.root.parent === L3 || o.geos.some(gm => gm.disposed !== 1)) throw new Error(where + ' 이전 3D 바리케이드 메쉬가 씬에 남았거나 geometry dispose가 한 번 불리지 않았다');
      };
      const log = [];
      for (const d of [1, 2, 3]) {
        const gd = S.newGame(20 + d, { district: d }), n = S.barricadesFor(d).length;
        if (!n || !Array.isArray(gd.obstacles) || gd.obstacles.length !== n) throw new Error(d + '구역 g.obstacles: ' + JSON.stringify(gd.obstacles));
        const prev = V3._obstacles(), s0 = V3._obstacleStats(); V3.render(gd, 2000 + d, O3); const s1 = V3._obstacleStats();
        const got = same(gd, d + '구역');
        gone(prev, d + '구역으로 바뀔 때');
        if (s1.live !== n || s1.built - s0.built !== n || s1.disposed - s0.disposed !== s0.live) throw new Error(d + '구역으로 바뀔 때 3D 바리케이드 정리·재생성: ' + JSON.stringify([s0, s1]));
        V3.render(gd, 2100 + d, O3);
        const s2 = V3._obstacleStats(), again = V3._obstacles();
        if (s2.built !== s1.built || s2.disposed !== s1.disposed || again.length !== got.length || again.some((o, i) => o.root !== got[i].root) || got.some(o => o.geos.some(gm => gm.disposed !== 0))) throw new Error('같은 판에서 3D 바리케이드를 다시 만들었다: ' + JSON.stringify([s1, s2]));
        log.push(d + '구역 ' + n + '개');
      }
      const ga = S.newGame(99, { district: 1 }), prevA = V3._obstacles(), s0 = V3._obstacleStats(); V3.render(ga, 3000, O3); const s1 = V3._obstacleStats();
      same(ga, '새 판'); gone(prevA, '새 판이 시작될 때');
      if (s1.live !== ga.obstacles.length || s1.disposed - s0.disposed !== s0.live || s1.built - s0.built !== ga.obstacles.length) throw new Error('새 판이 시작될 때 3D 바리케이드가 남았다: ' + JSON.stringify([s0, s1]));
      const prevE = V3._obstacles();
      ga.obstacles = []; V3.render(ga, 3100, O3);
      if (V3._obstacleStats().live !== 0 || V3._obstacles().length || L3.children.length) throw new Error('g.obstacles가 비었는데 3D 바리케이드가 남았다');
      gone(prevE, 'g.obstacles가 비었을 때');
      delete ga.obstacles; V3.render(ga, 3200, O3);
      if (V3._obstacleStats().live !== 0 || L3.children.length) throw new Error('g.obstacles가 없는데 3D 바리케이드가 남았다');
      console.log('3D 바리케이드: ' + log.join(', ') + ' 충돌 상자와 같은 크기, 구역·새 판마다 이전 메쉬 정리 후 재생성, 같은 판은 그대로, 빈 목록·없음도 예외 없음');
    }
    // 3D 구역 테마: 진짜 render3d.js가 sim의 표 순환(tableIdx, 3종)대로 조명·땅·배경·안개 색을 바꾸고, 도시는 다시 만들지 않는다
    {
      if (typeof V3._theme !== 'function' || !Array.isArray(V3._themes) || V3._themes.length !== 3) throw new Error('3D 구역 테마 확인 장치(_theme/_themes)가 없다');
      const T = V3._themes, O3 = { shake: 0, reduced: false, scorch: [], scorchT: 4.5 }, sceneN = V3._scene.children.length, t0 = V3._theme();
      const vals = t => [t.hemi.color.v, t.hemi.groundColor.v, t.hemi.intensity, t.sun.color.v, t.sun.intensity, t.ground.color.v, t.walk.color.v, t.bg.v, t.fog.color.v];
      const want = th => [th.sky, th.low, th.hemiI, th.sun, th.sunI, th.ground, th.walk, th.bg, th.fog].map(v => (typeof v === 'number' ? v : String(v)));
      if (new Set(T.map(th => JSON.stringify(want(th)))).size !== 3) throw new Error('3D 구역 테마 셋이 서로 다르지 않다');
      const log = [];
      let prevIdx = t0.idx;
      for (const d of [1, 2, 3, 4, 2, 1]) {
        const gd = S.newGame(40 + d, { district: d }), a0 = V3._theme().applied;
        V3.render(gd, 4000 + d, O3);
        const t = V3._theme(), idx = S.POST_LAYOUTS.indexOf(S.postSpotsFor(d));
        if (t.idx !== idx || t.idx !== (d - 1) % 3) throw new Error(d + '구역 테마 번호 ' + t.idx + ' / sim 표 ' + idx);
        if (JSON.stringify(vals(t)) !== JSON.stringify(want(T[idx]))) throw new Error(d + '구역 테마 색이 적용되지 않았다: ' + JSON.stringify(vals(t)) + ' / ' + JSON.stringify(want(T[idx])));
        if (t.applied !== a0 + (idx !== prevIdx ? 1 : 0)) throw new Error(d + '구역 테마 적용 횟수: ' + a0 + ' → ' + t.applied);
        if (t.builds !== 1 || t.ground !== t0.ground || t.walk !== t0.walk || t.hemi !== t0.hemi || t.sun !== t0.sun || t.fog !== t0.fog || t.bg !== t0.bg || V3._scene.children.length !== sceneN) throw new Error(d + '구역 전환 때 도시·조명·재질을 다시 만들었다');
        V3.render(gd, 4100 + d, O3);
        if (V3._theme().applied !== t.applied) throw new Error('같은 구역에서 테마를 다시 적용했다');
        prevIdx = idx; log.push(d + '구역 ' + t.key);
      }
      console.log('3D 구역 테마: ' + log.join(', ') + ' (sim 표 순환과 같은 순서, 기존 조명·땅 재질·배경·안개 색만 갱신, 도시 1번만 생성)');
    }
    // 3D 소환 초소 표시: 1구역은 없음, 2구역 이상은 살아 있는 소환 초소 하나에만, 부수면 기록째 사라지고, 구역·새 판 전환 때 이전 표시가 남지 않는다
    {
      if (typeof V3._postMark !== 'function' || typeof V3._postMarks !== 'function') throw new Error('3D 소환 초소 확인 장치(_postMark/_postMarks)가 없다');
      const O3 = { shake: 0, reduced: false, scorch: [], scorchT: 4.5 }, log = [];
      const check = (gd, where, t) => {
        V3.render(gd, t || 5000, O3);
        const marks = V3._postMarks(), alive = gd.posts.filter(p => !p.dead);
        if (marks.length !== alive.length || marks.some(m => !alive.includes(m.post))) throw new Error(where + ': 3D 초소 기록이 판의 살아 있는 초소와 다르다(이전 판 초소가 남음) ' + marks.length + ' / ' + alive.length);
        for (const p of gd.posts) { const m = V3._postMark(p); if (p.dead ? m !== null : (!m || m.summon !== !!p.summon)) throw new Error(where + ': 3D 초소 소환 표시가 맞지 않는다: ' + JSON.stringify(m) + ' / summon ' + !!p.summon + ' dead ' + !!p.dead); }
        const k = marks.filter(m => m.summon).length; log.push(where + ' ' + k); return k;
      };
      const mk = (seed, d) => S.newGame(seed, { district: d });
      const g1 = mk(51, 1);
      if (g1.posts.some(p => p.summon) || check(g1, '1구역') !== 0) throw new Error('1구역에 3D 소환 초소 표시가 있다');
      const g2 = mk(52, 2), sp = g2.posts.filter(p => p.summon);
      if (sp.length !== 1 || check(g2, '2구역') !== 1) throw new Error('2구역 3D 소환 초소 표시는 하나여야 한다');
      sp[0].summonT = 0.5; check(g2, '2구역 소환 직전', 5100); V3.render(g2, 5200, Object.assign({}, O3, { reduced: true }));
      sp[0].dead = true;
      if (check(g2, '2구역 파괴 후') !== 0 || V3._postMark(sp[0]) !== null) throw new Error('부순 소환 초소의 3D 표시가 남았다');
      if (check(mk(53, 2), '2구역 새 판') !== 1 || check(mk(54, 1), '2→1구역') !== 0) throw new Error('2구역→1구역 전환 뒤 3D 소환 표시가 남았다');
      if (check(mk(55, 2), '2구역 다시') !== 1 || check(mk(56, 3), '2→3구역') !== 1) throw new Error('2구역→3구역 전환 뒤 3D 소환 표시는 새 판의 것 하나여야 한다');
      console.log('3D 소환 초소 표시: ' + log.join(', ') + ' (살아 있는 소환 초소에만, 부수면 사라짐, 구역 전환 때 이전 표시 없음)');
    }
    // 3D 타이틀 무대: 진짜 render3d.js가 따로 만든 장면·카메라에 네크로맨서(뒤 가운데)와 소환수 셋(앞 좌·중·우)을 세우고, 고른 소환수를 앞으로 내보내며, 게임을 시작하면 모두 정리한다
    {
      if (typeof V3._title !== 'function' || typeof V3.pickTitle !== 'function') throw new Error('3D 타이틀 무대 확인 장치(_title/pickTitle)가 없다');
      const gt = S.newGame(61, { district: 1 }), sceneN = V3._scene.children.length, t0 = V3._title();
      if (t0.active || V3.pickTitle(195, 400) !== null) throw new Error('타이틀 전에는 3D 타이틀 무대가 없어야 한다');
      const TO = st => ({ shake: 0, reduced: false, scorch: [], scorchT: 4.5, title: true, starter: st });
      let tt = 8000;
      const run = (st, n) => { for (let i = 0; i < n; i++) V3.render(gt, (tt += 16.7), TO(st)); return V3._title(); };
      const by = (tl, k) => tl.slots.find(s => s.kind === k);
      let t = run('armor', 40);
      if (!t.active || t.builds !== t0.builds + 1 || t.selected !== 'armor' || t.slots.map(s => s.kind).join() !== 'necro,' + S.KINDS.join() || !t.scene || t.scene === V3._scene) throw new Error('3D 타이틀 무대: ' + JSON.stringify(t.slots));
      if (!(by(t, 'beast').x < by(t, 'armor').x && by(t, 'armor').x < by(t, 'ranger').x) || !(by(t, 'necro').z < by(t, 'beast').z)) throw new Error('3D 타이틀 배치(네크로맨서 뒤 가운데, 소환수 앞 좌·중·우): ' + JSON.stringify(t.slots));
      if (!(by(t, 'armor').fwd > 0.9 && by(t, 'armor').z > by(t, 'beast').z + 0.5 && by(t, 'armor').z > by(t, 'ranger').z + 0.5)) throw new Error('고른 갑주가 앞으로 나오지 않았다: ' + JSON.stringify(t.slots));
      if (t.slots.some(s => s.model || !s.fallback)) throw new Error('모델을 불러오기 전에는 도형으로 대신 세운다: ' + JSON.stringify(t.slots));
      if (!t.frame || !(t.frame.dist > 0) || V3._scene.children.length !== sceneN) throw new Error('3D 타이틀 무대가 전투 장면을 건드렸거나 카메라를 잡지 못했다');
      t = run('ranger', 40);
      if (t.builds !== t0.builds + 1 || t.selected !== 'ranger' || !(by(t, 'ranger').fwd > 0.9 && by(t, 'armor').fwd < 0.1)) throw new Error('선택을 바꿨는데 3D 무대가 따라가지 않았다: ' + JSON.stringify(t.slots));
      const pk = V3.pickTitle(195, 500);
      if (pk !== null && !S.KINDS.includes(pk)) throw new Error('pickTitle이 소환수 종류가 아닌 것을 돌려줬다: ' + pk);
      V3.render(gt, (tt += 16.7), { shake: 0, reduced: false, scorch: [], scorchT: 4.5, title: false, starter: 'ranger' });
      t = V3._title();
      if (t.active || t.disposed !== t0.disposed + 1 || t.slots.length || t.scene || V3.pickTitle(195, 500) !== null || V3._scene.children.length !== sceneN) throw new Error('게임을 시작했는데 3D 타이틀 무대가 남았다: ' + JSON.stringify(t));
      V3.render(gt, (tt += 16.7), { shake: 0, reduced: true, scorch: [], scorchT: 4.5 });
      if (V3._title().disposed !== t0.disposed + 1 || V3._title().active) throw new Error('전투 프레임에서 타이틀 무대를 다시 만들거나 두 번 정리했다');
      console.log('3D 타이틀 무대: 네크로맨서 뒤 가운데·소환수 앞 좌중우, 고른 갑주→사수가 앞으로, 로딩 중 도형 대역, 시작하면 장면·카메라·조명 정리(전투 장면 그대로)');
    }
    // 3D boss phase effects (real render3d.js): HP ring ticks at phaseAt, roar shockwave while roarT > 0, weak point only while weak && stun > 0; phaseless boss / foes unchanged
    {
      if (typeof V3._bossFx !== 'function') throw new Error('3D boss phase fx hook (_bossFx) missing');
      const O3 = { shake: 0, reduced: false, scorch: [], scorchT: 4.5 }, OR = Object.assign({}, O3, { reduced: true }), AT = S.CFG.bossPhase.at, gb = S.newGame(71, { district: 1 });
      gb.posts = []; gb.enemies = [];
      const pb = S.spawnBoss(gb); gb.district = 2; const nb2 = S.spawnBoss(gb); gb.district = 1;
      const foe = { elite: false, arch: 'armor', g: 1, x: 4, y: 4, hp: 9, maxHp: 9, r: 0.6, face: 0, stun: 2, flash: 0, weak: true, roarT: 1 };
      gb.enemies.push(foe);
      let t3 = 6000;
      const st = (e, o) => { V3.render(gb, (t3 += 16.7), o || O3); return V3._bossFx(e); };
      if (!pb.phases || nb2.phases || nb2.phaseAt !== null) throw new Error('district 1 boss should be phased, district 2 boss not');
      const calm = st(pb);
      if (!calm || JSON.stringify(calm.ticks) !== JSON.stringify(AT) || calm.roar || calm.weak || !(calm.verts > 0)) throw new Error('3D phased boss calm: ' + JSON.stringify(calm));
      pb.hp = pb.maxHp * 0.5; pb.phase = 2; pb.roars = 1; pb.roarT = S.CFG.bossPhase.roar;
      const roar = st(pb), roarR = st(pb, OR);
      pb.roarT = 0; const half = st(pb);
      pb.weak = true; pb.stun = 1.5; const weak = st(pb), weakR = st(pb, OR);
      pb.weak = false; pb.stun = 0; const after = st(pb);
      pb.stun = 1; const plainStun = st(pb); pb.stun = 0;
      if (!roar.roar || roar.weak || roar.phase !== 2 || !roarR.roar || !(roar.verts > half.verts) || !(roarR.verts > half.verts)) throw new Error('3D roar fx: ' + JSON.stringify([roar, roarR, half]));
      if (half.roar || half.weak || JSON.stringify(half.ticks) !== JSON.stringify(AT)) throw new Error('3D roar did not end: ' + JSON.stringify(half));
      if (!weak.weak || weak.roar || !weakR.weak || !(weak.verts > half.verts) || !(weakR.verts > half.verts)) throw new Error('3D weak point fx: ' + JSON.stringify([weak, weakR, half]));
      if (after.weak || after.roar || after.verts !== half.verts || plainStun.weak || plainStun.verts !== half.verts) throw new Error('3D weak point stayed after the stun / showed on a plain stun: ' + JSON.stringify([after, plainStun, half]));
      const plain = V3._bossFx(nb2);
      if (!plain || plain.ticks.length || plain.roar || plain.weak || plain.verts !== 0) throw new Error('3D phaseless boss got phase fx: ' + JSON.stringify(plain));
      if (V3._bossFx(foe) !== null) throw new Error('3D plain foe got boss phase fx');
      console.log('3D boss phase fx: ticks ' + calm.ticks.join('/') + ', roar decals ' + roar.verts + ' > ' + half.verts + ', weak ' + weak.verts + ' > ' + half.verts + ', gone after the stun, phaseless boss ' + plain.verts);
    }
    console.log('3D 대장 외형: ' + looks.map(l => l.kind + '(' + l.body + '/' + l.accent + '/' + l.mark + ')').join(', ') + ', arch가 바뀌면 다시 만든다');
  }
  runRender3D(win, doc, FAIL);
  if ('ChimeraView' in win) throw new Error('WebGL 실패(' + FAIL + ')인데 window.ChimeraView를 만들었다');
  if (!els.game3d || els.game3d.hidden !== true) throw new Error('WebGL 실패(' + FAIL + ')인데 #game3d를 숨기지 않았다');
  if (!/WebGL/.test(win.ChimeraView3DError || '')) throw new Error('3D 실패 까닭이 남지 않았다: ' + win.ChimeraView3DError);
  if (FAIL === 'noctx' && !win.smokeDisposed) throw new Error('컨텍스트 없는 렌더러를 버리지 않았다');
  console.log('3D 실패(' + FAIL + '): 예외를 잡아 3D를 접고 #game3d 숨김, ChimeraView 없음 → "' + win.ChimeraView3DError + '"');
}
let game = null, lastOpts = null;
const realNew = S.newGame; S.newGame = (seed, opts) => { lastOpts = opts; return (game = realNew(seed, opts)); };
// 화면 코드를 한 번 띄운다. 저장이 막힌 경우처럼 따로 확인할 때는 화면·창 핸들러를 비우고 새로 띄운다.
const boot = storage => new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'localStorage', scripts[1])(
  win, doc, () => ({ getPropertyValue: () => '#aabbcc' }), f => { raf = f; }, { now: () => now },
  (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; }, id => { if (timers[id - 1]) timers[id - 1].f = null; }, storage);
boot(ls);
const frames = n => { for (let i = 0; i < n; i++) { now += 16.7; raf(now); flush(); } };
// 대장을 잡으면 승리 연출(약 1.6초) 뒤에 끝 화면이 뜬다: 뜰 때까지 기다린다(최대 4초)
const untilEnd = () => { for (let i = 0; i < 240 && els.end.hidden !== false; i++) frames(1); };
const tap = (wx, wy) => {
  // 판 좌표를 화면 좌표로 바꿔 톡 누른다(가로 13칸이 390px, 카메라는 네크로맨서를 따라간다)
  const px = 390 / 13, vh = 760 / px;
  const camX = Math.max(0, Math.min(S.W - 13, game.necro.x - 6.5)), camY = Math.max(0, Math.min(S.H - vh, game.necro.y - vh / 2));
  const e = { pointerId: 1, clientX: (wx - camX) * px, clientY: (wy - camY) * px };
  fire('game', 'pointerdown', e); fire('game', 'pointerup', e);
};

// 초소·돌격조·대장 골드(판마다)는 뒤의 '초소 골드' 절에서 따로 확인한다. 그 앞의 저장·구매 확인은 처음 정복 골드만 보도록 끈다
// (화면 시드가 시각으로 정해져 앞의 흐름에서 잡는 돌격조 수가 판마다 달라, 켜 두면 기대 잔액이 정해지지 않는다)
const PER_POST = S.CFG.gold.perPost; S.CFG.gold.perPost = 0;
const PER_ELITE = S.CFG.gold.perElite, PER_BOSS = S.CFG.gold.perBoss; S.CFG.gold.perElite = 0; S.CFG.gold.perBoss = 0;
// 처음 정복 보상 씨앗도 끈다: 켜 두면 정복 뒤 다음 판이 씨앗을 써 변이 카드로 멈춰 뒤의 흐름이 어긋난다. '처음 정복 변이 씨앗' 절에서만 켠다
const SEED_CLEAR = S.CFG.gold.seedPerClear; S.CFG.gold.seedPerClear = 0;

// ---- 첫 판: 입력과 흐름 ----
if (els.startBtn.textContent !== '시작') throw new Error('저장이 없으면 제목 버튼은 시작: ' + els.startBtn.textContent);
// 다른 탭이 저장을 바꾸면(storage 이벤트) 제목 버튼이 따라간다. 확인 뒤 되돌린다
store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 4, gold: 0, up: { hp: 0 } });
fireWin('storage', { key: 'chimera-lab-save-v1' });
if (els.startBtn.textContent !== '이어하기 5구역') throw new Error('다른 탭의 저장을 제목 버튼이 따라가지 않았다: ' + els.startBtn.textContent);
fireWin('storage', { key: 'other-key' });
if (els.startBtn.textContent !== '이어하기 5구역') throw new Error('다른 키의 storage 이벤트에 반응했다');
delete store['chimera-lab-save-v1'];
fireWin('storage', { key: 'chimera-lab-save-v1' });
if (els.startBtn.textContent !== '시작') throw new Error('되돌린 저장을 따라가지 않았다: ' + els.startBtn.textContent);
fire('startBtn', 'click', { fake: 'event' });
frames(5);
if (game.district !== 1 || game.units.length !== 1) throw new Error('시작 버튼으로 1구역이 열리지 않았다');
let pins = 0, booms = 0, sawLink = false;
for (let i = 0; i < 60 * 40; i++) {
  frames(1);
  game.necro.hp = 100;   // 흐름을 끝까지 보려고 죽지 않게 한다
  game.postsTotal = 99;   // 이 흐름에서는 대장이 나오지 않게 한다(억지로 먹여 키운 키메라가 대장을 잡으면 정복이 저장되어 뒤의 확인이 어긋난다)
  if (game.link) sawLink = true;
  if (game.choice) { frames(22); for (const f of els.mutList.kids[0].handlers.click) f({}); }   // 초소가 부서져 변이 카드가 뜨면 잠금이 풀린 뒤 첫 장을 고른다
  if (i % 90 === 20) game.souls.push({ x: game.necro.x + 2, y: game.necro.y, type: S.KINDS[(i / 90 | 0) % 3], q: 1 + ((i / 90 | 0) % 3), ttl: 6 });
  if (i % 90 === 21) { const s = game.souls[game.souls.length - 1]; game.necro.x = s.x - 1.5; game.necro.y = s.y; }
  if (i % 90 === 40) { const s = game.souls[game.souls.length - 1]; if (s) { game.necro.x = s.x; game.necro.y = s.y; } }
  if (i % 90 === 45 && game.hearts.length) { const hrt = game.hearts[0]; game.necro.x = hrt.x; game.necro.y = hrt.y; }
  if (i % 400 === 60 && game.units.length) { const before = game.pinned; tap(game.units[0].x, game.units[0].y); now += 360; flush(); if (game.pinned !== before) pins++; }
  if (i % 400 === 250 && game.units.length) { const before = game.molts; tap(game.necro.x + 3, game.necro.y + 3); now += 120; tap(game.necro.x + 3, game.necro.y + 3); if (game.units.some(u => u.state === 'rush') || game.molts > before) booms++; }
}
if (!pins || !booms || !sawLink || !tones) throw new Error('입력·연결선·소리 가운데 동작하지 않는 것이 있다');

// 한 번 톡의 대상은 누른 순간의 키메라다
{
  if (game.over) throw new Error('앞의 흐름에서 판이 끝나면 안 된다: ' + game.over);
  while (game.units.length < 2) { game.souls.push({ x: game.necro.x, y: game.necro.y, type: 'armor', q: 1, ttl: 5 }); frames(2); }
  for (const u of game.units) u.state = 'ok';
  const a = game.units[0], b = game.units[1];
  // 네크로맨서가 판 맨 위에 있으면 누를 자리가 위쪽 키메라 칸과 겹쳐 칸이 먼저 눌린다. 판 가운데에서 확인한다
  game.necro.x = S.W / 2; game.necro.y = S.H / 2; frames(1);   // 카메라가 새 자리를 따라오게 한 번 그린다
  a.x = game.necro.x + 2; a.y = game.necro.y; b.x = game.necro.x - 2; b.y = game.necro.y;
  // 셋째 키메라가 누를 자리 근처에 있으면 그쪽이 찍힌다(판에 따라 가끔 실패하던 까닭). 멀리 치워 둔다
  for (const u of game.units) if (u !== a && u !== b) { u.x = game.necro.x; u.y = game.necro.y + (game.necro.y < S.H / 2 ? 4 : -4); }
  if (game.pinned === a.uid) game.pinned = null;
  tap(a.x, a.y);
  const ax = a.x, ay = a.y; a.x = b.x; a.y = b.y; b.x = ax; b.y = ay;
  now += 360; flush();
  if (game.pinned !== a.uid) throw new Error('한 번 톡이 누른 순간의 키메라가 아니라 나중 위치의 키메라를 찍었다');
  // 위쪽 칸을 눌러도 찍힌다
  const e = { pointerId: 1, clientX: 16 + (Math.min(104, (390 - 32 - 56) / 3) + 6) * 1 + 20, clientY: 56 };
  fire('game', 'pointerdown', e); fire('game', 'pointerup', e);
  if (game.pinned !== game.units[1].uid) throw new Error('위쪽 칸을 눌러도 찍히지 않는다');
  now += 400; flush();
  // 320ms 간격의 두 번 톡톡도 자폭으로 읽힌다
  const before = game.molts;
  tap(game.necro.x + 3, game.necro.y + 3); now += 320; tap(game.necro.x + 3, game.necro.y + 3);
  if (!(game.units.some(u => u.state === 'rush') || game.molts > before)) throw new Error('320ms 간격의 두 번 톡톡이 자폭으로 읽히지 않는다 ' + JSON.stringify({ choice: game.choice, st: game.units.map(u => u.state + u.down), over: game.over }));
}
console.log('입력 확인: 찍기 ' + pins + '번, 자폭 ' + booms + '번, 연결선, 누른 순간의 키메라, 위쪽 칸, 320ms 두 번 톡톡, 소리 호출 ' + tones + '번');

// ---- 목적을 이뤄 구역을 차지하고, 키메라를 골라 다음 구역으로 ----
game.postsTotal = game.posts.length;
// 화면 시드가 시각으로 정해져 판마다 다르다: 기다리는 동안 죽지 않게 하고, 그사이 초소가 부서져 카드가 떴으면 고른다
const pickCards = () => { while (game.choice) { frames(22); for (const f of els.mutList.kids[0].handlers.click) f({}); } };
game.necro.hp = game.necro.maxHp = 1e6;
frames(120); pickCards();
for (const u of game.units) u.state = 'ok';
for (const p of game.posts) p.dead = true;
game.postsDown = game.postsTotal;
const boss = S.spawnBoss(game);
frames(3);
boss.hp = 0.5; boss.bleed = 100; boss.bleedT = 1;
// 큰 폭발 직후면 화면이 hitstop으로 판을 잠깐 멈춘다(그동안 step 없음): 고정 3프레임이 아니라 끝날 때까지 기다린다(최대 2초)
for (let i = 0; i < 120 && game.over !== 'win'; i++) frames(1);
untilEnd();
if (game.over !== 'win' || els.end.hidden !== false) throw new Error('대장을 잡았는데 끝 화면이 뜨지 않았다');
if (!/1구역 정복/.test(els.endTitle.textContent)) throw new Error('정복 제목이 아니다: ' + els.endTitle.textContent);
const readSave = () => JSON.parse(store['chimera-lab-save-v1']);
if (readSave().best !== 1 || readSave().gold !== S.CFG.gold.perClear) throw new Error('처음 정복했는데 골드·기록이 저장되지 않았다: ' + store['chimera-lab-save-v1']);
if (els.endGold.textContent !== S.CFG.gold.perClear + '골드 (+' + S.CFG.gold.perClear + ')') throw new Error('끝 화면의 골드 표시: ' + els.endGold.textContent);
if (els.statTabs.kids.length !== 3 || els.statShop.kids.length !== 6) throw new Error('상점: 종류 탭 셋, 능력치 버튼 여섯: ' + els.statTabs.kids.length + ' / ' + els.statShop.kids.length);
if (els.statTabs.kids[0]['attr:aria-pressed'] !== 'true' || els.statTabs.kids[1]['attr:aria-pressed'] !== 'false') throw new Error('처음 탭은 맹수');
{
  const tabNames = els.statTabs.kids.map(b => b.textContent);
  if (tabNames.join() !== '맹수,갑주,사수' || tabNames.some(t => /소총수/.test(t))) throw new Error('상점 탭 이름은 맹수·갑주·사수(소총수 아님): ' + tabNames.join());
  console.log('상점 탭 이름: ' + tabNames.join('·'));
}
if (statBtn(0).disabled) throw new Error('골드가 있는데 능력치를 살 수 없다');
buyStat(0);
// 강화 가격은 단계별 표(sim의 CFG.gold.statCost/hpCost, 지금 가진 단계로 찾는다)
const SCOST = lv => S.CFG.gold.statCost[lv], HCOST = lv => S.CFG.gold.hpCost[lv];
if (readSave().gold !== S.CFG.gold.perClear - SCOST(0) || readSave().up.stat.beast.hp !== 1) throw new Error('사도 골드·단계가 바뀌지 않았다: ' + store['chimera-lab-save-v1']);
if (!statBtn(0).disabled || !statBtn(5).disabled) throw new Error('골드가 모자란데 살 수 있게 보인다');
if (!/^체력 \+15%\n3골드 · 1\/5단계$/.test(statBtn(0).textContent) || !/^받는 피해 -10%/.test(statBtn(5).textContent)) throw new Error('능력치 버튼 글: ' + statBtn(0).textContent + ' / ' + statBtn(5).textContent);
tab(1);
if (els.statTabs.kids[1]['attr:aria-pressed'] !== 'true' || !/ 0\/5단계$/.test(statBtn(0).textContent)) throw new Error('갑주 탭: 단계는 종류마다 따로: ' + statBtn(0).textContent);
tab(0);
// 상점 목록은 종류마다: 사수만 사거리, 맹수는 도약 간격, 갑주는 충격파(같은 자리)
{
  const view = i => { tab(i); return els.statShop.kids.map(b => ({ key: b['attr:data-key'], text: b.textContent, hidden: b.hidden })); };
  const [vb, va, vr] = [0, 1, 2].map(view); tab(0);
  const keys = v => v.map(x => x.key).join(), pct = k => Math.round(S.CFG.statStep[k] * 100);
  if (keys(vb) !== S.CFG.statKinds.beast.join() || keys(va) !== S.CFG.statKinds.armor.join() || keys(vr) !== S.CFG.statKinds.ranger.join()) throw new Error('탭마다 종류별 강화 목록: ' + keys(vb) + ' / ' + keys(va) + ' / ' + keys(vr));
  if ([vb, va].some(v => v.some(x => x.key === 'range' || /^사거리/.test(x.text)))) throw new Error('맹수·갑주 탭에 사거리 버튼이 있다');
  if (!vr.some(x => x.key === 'range' && x.text.startsWith('사거리 +' + pct('range') + '%\n'))) throw new Error('사수 탭에 사거리 버튼이 없다');
  if (!vb.some(x => x.key === 'leap' && x.text.startsWith('도약 간격 -' + pct('leap') + '%\n')) || !va.some(x => x.key === 'quake' && x.text.startsWith('충격파 +' + pct('quake') + '%\n'))) throw new Error('맹수 도약 간격·갑주 충격파 버튼: ' + vb.map(x => x.text).join('|') + ' / ' + va.map(x => x.text).join('|'));
  if (vr.some(x => /^(도약 간격|충격파)/.test(x.text)) || [vb, va, vr].some(v => v.some(x => x.hidden))) throw new Error('사수 탭에 근접 강화가 있거나 숨은 버튼이 있다');
  console.log('종류별 상점: 맹수 "' + vb[4].text.split('\n')[0] + '", 갑주 "' + va[4].text.split('\n')[0] + '", 사수 "' + vr[4].text.split('\n')[0] + '"');
}
console.log('골드: 처음 정복 +' + S.CFG.gold.perClear + ', 맹수 체력 1단계 구매, 버튼 "' + statBtn(0).textContent.replace('\n', ' / ') + '"');
// 다른 탭이 그 사이에 강화를 더 사고 골드를 남겼다. 이 탭은 그것을 덮어쓰지 않고 이어받아야 한다
const GC = SCOST(2);   // 아래에서 맹수 체력은 2단계에서 3단계로 산다
store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 1, gold: GC + 2, up: { stat: { beast: { hp: 2 } } } });
fireWin('storage', { key: 'chimera-lab-save-v1' });
if (els.endGold.textContent !== (GC + 2) + '골드' || !/ 2\/5단계$/.test(statBtn(0).textContent)) throw new Error('다른 탭의 저장을 끝 화면이 따라가지 않았다: ' + els.endGold.textContent + ' / ' + statBtn(0).textContent);
const nextBtn = els.aceList.kids;
if (nextBtn.length !== 1 || els.aceList.hidden) throw new Error('다음 구역 버튼이 없다');
console.log('구역 정복 화면: ' + els.endTitle.textContent + ' · 초소 ' + els.endPosts.textContent + ' · 최고 ' + els.endBest.textContent + ' · 버튼 "' + nextBtn[0].textContent + '", "' + els.againBtn.textContent + '"');
for (const f of nextBtn[0].handlers.click) f({});
frames(3);
if (game.district !== 2) throw new Error('다음 구역으로 넘어가지 않았다');
if (lastOpts.squad || lastOpts.ace) throw new Error('키메라를 데려가면 안 된다');
if (game.units.length !== 1 || S.geneTotal(game.units[0]) !== 1 || beastHp() !== 2) throw new Error('다른 탭에서 산 강화까지 넣어 맹수 하나(체력 2단계)로 시작해야 한다: ' + beastHp());
if (els.end.hidden !== true) throw new Error('다음 구역이 시작됐는데 끝 화면이 남아 있다');
if (game.posts.length !== 4) throw new Error('2구역의 초소는 넷이어야 한다');
console.log('다음 구역: ' + game.district + '구역, 초소 ' + game.posts.length + '곳, 맹수 하나(다른 탭의 강화까지 체력 2단계)로 처음부터');

// ---- 지면 그 구역을 다시. 골드·강화는 남고, 패배 화면에서도 산다 ----
game.necro.hp = 0;
frames(3);
if (game.over !== 'lose' || els.end.hidden !== false) throw new Error('쓰러졌는데 끝 화면이 뜨지 않았다');
if (els.aceList.hidden !== true) throw new Error('졌는데 다음 구역 버튼이 보인다');
if (readSave().best !== 1 || readSave().gold !== GC + 2 || readSave().up.stat.beast.hp !== 2) throw new Error('지면 기록·골드·강화가 바뀌면 안 된다: ' + store['chimera-lab-save-v1']);
if (els.endGold.textContent !== (GC + 2) + '골드' || statBtn(0).disabled) throw new Error('패배 화면에서 남은 골드로 살 수 있어야 한다: ' + els.endGold.textContent);
console.log('패배 화면: ' + els.endTitle.textContent + ' · 최고 ' + els.endBest.textContent + ' · ' + els.endGold.textContent + ' · 버튼 "' + els.againBtn.textContent + '"');
buyStat(0);
if (readSave().gold !== 2 || readSave().up.stat.beast.hp !== 3) throw new Error('패배 화면 구매: ' + store['chimera-lab-save-v1']);
fire('againBtn', 'click', { fake: 'event' });
frames(3);
if (game.district !== 2 || game.units.length !== 1 || beastHp() !== 3) throw new Error('다시 하기가 2구역을 강화된 맹수 하나(체력 3단계)로 열지 않았다');
console.log('다시 하기: 쓰러진 2구역을 강화된 맹수(체력 3단계)로 다시. 지면 기록·골드·강화는 그대로, 패배 화면에서도 구매');

// ---- 2구역을 처음 정복 → 골드, 그다음 "1구역부터 다시"도 강화된 맹수로 ----
for (const p of game.posts) p.dead = true;
game.postsDown = game.postsTotal;
const boss2 = S.spawnBoss(game); frames(3);
boss2.hp = 0.5; boss2.bleed = 100; boss2.bleedT = 1; frames(3); untilEnd();
if (game.over !== 'win' || readSave().best !== 2 || readSave().gold !== 2 + S.CFG.gold.perClear) throw new Error('2구역 정복 저장: ' + store['chimera-lab-save-v1']);
fire('againBtn', 'click', { fake: 'event' });
frames(3);
if (game.district !== 1 || beastHp() !== 3) throw new Error('"1구역부터 다시"가 강화된 맹수로 1구역을 열지 않았다');
for (const p of game.posts) p.dead = true;
game.postsDown = game.postsTotal;
const boss3 = S.spawnBoss(game); frames(3);
boss3.hp = 0.5; boss3.bleed = 100; boss3.bleedT = 1; frames(3); untilEnd();
if (game.over !== 'win' || readSave().best !== 2 || readSave().gold !== 2 + S.CFG.gold.perClear || els.endGold.textContent !== (2 + S.CFG.gold.perClear) + '골드') throw new Error('이미 깬 1구역을 다시 깨면 골드가 없어야 한다: ' + store['chimera-lab-save-v1']);
console.log('2구역 처음 정복 +' + S.CFG.gold.perClear + '골드, "1구역부터 다시"도 강화된 맹수, 이미 깬 1구역은 골드 없음');

// ---- 저장이 막힌 경우: 세션마다 새로 띄워 따로 확인한다(한 세션의 메모리 전용 모드가 다른 확인을 가리지 않게) ----
const freshSession = storage => {
  for (const k of Object.keys(els)) delete els[k];
  for (const k of Object.keys(winH)) delete winH[k];
  for (const k of Object.keys(docH)) delete docH[k];
  timers.length = 0;
  boot(storage);
  frames(2);
};
const winNow = () => {
  for (const p of game.posts) p.dead = true;
  game.postsDown = game.postsTotal;
  const b = S.spawnBoss(game); frames(3); b.hp = 0.5; b.bleed = 100; b.bleedT = 1; frames(3); untilEnd();
  if (game.over !== 'win') throw new Error('정복하지 못했다');
};
const PC = S.CFG.gold.perClear;
const base = JSON.stringify(S.Save.load(JSON.stringify({ v: 1, best: 1, cur: 1, gold: 5, up: { hp: 0, stat: { beast: { hp: 2 } } } }), null));   // 새 저장 모양 그대로(띄울 때 정리해 다시 쓰지 않게)

// 읽기가 막히면(예외) '저장 없음'으로 보지 않고 이 세션의 골드·강화를 지킨다
{
  store['chimera-lab-save-v1'] = base;
  let getCalls = 0, setCalls = 0, readBroken = false;
  const lsR = { getItem: k => { getCalls++; if (readBroken) throw new Error('SecurityError'); return k in store ? store[k] : null; }, setItem: (k, v) => { setCalls++; store[k] = v; } };
  freshSession(lsR);
  if (els.startBtn.textContent !== '이어하기 2구역') throw new Error('읽기 세션 제목: ' + els.startBtn.textContent);
  fire('startBtn', 'click', {}); frames(3);
  readBroken = true; const g0 = getCalls;
  winNow();   // 정복 처리 직전 다시 읽기가 실패한다
  if (getCalls === g0) throw new Error('읽기 실패 경로를 타지 않았다');
  if (els.endGold.textContent !== (5 + PC) + '골드 (+' + PC + ')') throw new Error('읽기 실패에 골드가 사라졌다: ' + els.endGold.textContent);
  buyStat(0);
  if (els.endGold.textContent !== (5 + PC - GC) + '골드') throw new Error('읽기 실패 중 구매: ' + els.endGold.textContent);
  for (const f of els.aceList.kids[0].handlers.click) f({}); frames(3);
  if (game.district !== 3 || beastHp() !== 3) throw new Error('읽기 실패 중에도 산 강화로 시작해야 한다: ' + beastHp());
  if (store['chimera-lab-save-v1'] !== base) throw new Error('읽기에 실패한 세션이 저장소를 바꿨다: ' + store['chimera-lab-save-v1']);
  console.log('저장 읽기 실패: 골드·강화는 이 세션의 메모리로 이어지고, 저장소는 건드리지 않는다');
}

// 쓰기가 막혀도(사생활 모드·용량) 이 세션의 골드·강화는 지워지지 않고, 저장소가 살아나도 다른 탭의 저장을 덮어쓰지 않는다
{
  store['chimera-lab-save-v1'] = base;
  let setCalls = 0, writeBroken = true;
  const lsW = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { setCalls++; if (writeBroken) throw new Error('QuotaExceededError'); store[k] = v; } };
  freshSession(lsW);
  if (setCalls < 1) throw new Error('쓰기 실패 경로를 타지 않았다');
  fire('startBtn', 'click', {}); frames(3);
  if (game.district !== 2 || beastHp() !== 2) throw new Error('쓰기 세션 시작: ' + game.district + ' / ' + beastHp());
  winNow();
  if (els.endGold.textContent !== (5 + PC) + '골드 (+' + PC + ')') throw new Error('쓰기 실패 중 정복 골드: ' + els.endGold.textContent);
  buyStat(0);
  if (els.endGold.textContent !== (5 + PC - GC) + '골드') throw new Error('쓰기 실패 중 구매하자 골드가 사라졌다: ' + els.endGold.textContent);
  for (const f of els.aceList.kids[0].handlers.click) f({}); frames(3);
  if (game.district !== 3 || beastHp() !== 3) throw new Error('쓰기 실패 중에도 산 강화로 시작해야 한다: ' + beastHp());
  if (store['chimera-lab-save-v1'] !== base) throw new Error('쓰기가 막혔는데 저장소가 바뀌었다');
  // 저장소가 살아나고 다른 탭이 저장을 바꿔도(storage 이벤트) 이 세션은 따라가지도, 덮어쓰지도 않는다
  writeBroken = false;
  const other = JSON.stringify({ v: 1, best: 9, gold: 1, up: { stat: { beast: { hp: 5 } } } });
  store['chimera-lab-save-v1'] = other;
  game.necro.hp = 0; frames(3);
  const shown = els.endGold.textContent;
  fireWin('storage', { key: 'chimera-lab-save-v1' });
  if (els.endGold.textContent !== shown || shown !== (5 + PC - GC) + '골드') throw new Error('쓰기에 실패했던 세션이 다른 탭의 저장을 따라갔다: ' + els.endGold.textContent);
  buyStat(0);
  fire('againBtn', 'click', { fake: 'event' }); frames(3);
  if (store['chimera-lab-save-v1'] !== other) throw new Error('쓰기에 실패했던 세션이 다른 탭의 저장을 덮어썼다: ' + store['chimera-lab-save-v1']);
  console.log('저장 쓰기 실패: 이 세션의 골드·강화는 그대로 이어지고, 저장소가 살아나도 다른 탭의 저장을 따라가거나 덮어쓰지 않는다');
}

// ---- 네크로맨서 체력 강화: 끝 화면에서 사면 다음 판의 최대 체력이 오른다 ----
{
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 3, gold: 6, up: {} });   // 체력 강화가 없던 저장
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  if (game.district !== 4 || game.necro.maxHp !== 100) throw new Error('체력 강화 전 4구역: ' + game.necro.maxHp);
  game.necro.hp = 0; frames(3);
  if (els.buyHp.disabled || !/지금 100/.test(els.buyHp.textContent)) throw new Error('패배 화면의 체력 구매 버튼: ' + els.buyHp.textContent);
  fire('buyHp', 'click', {}); fire('buyHp', 'click', {});
  const sv = readSave();
  if (sv.gold !== 6 - HCOST(0) - HCOST(1) || sv.up.hp !== 2 || sv.up.stat.beast.hp !== 0) throw new Error('체력 구매 저장: ' + store['chimera-lab-save-v1']);
  if (!els.buyHp.disabled) throw new Error('골드가 없는데 체력을 살 수 있게 보인다');
  fire('againBtn', 'click', { fake: 'event' }); frames(3);
  const want = 100 + 2 * S.CFG.gold.hpStep;
  if (game.district !== 4 || game.necro.maxHp !== want || game.necro.hp > want) throw new Error('체력 강화가 다음 판에 들어가지 않았다: ' + game.necro.maxHp);
  console.log('네크로맨서 체력: 패배 화면에서 2단계 구매 → 4구역을 최대 체력 ' + want + '에서 다시, 버튼 "' + els.buyHp.textContent + '"');
}

// ---- 1구역으로 되돌리기: 제목 화면에서 두 번 눌러야 되고, 진행만 0, 골드·강화·최고 기록은 그대로 ----
{
  delete store['chimera-lab-save-v1'];
  freshSession(ls);
  if (!els.resetBtn.hidden) throw new Error('1구역이면 되돌리기 버튼이 없어야 한다');
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 3, cur: 3, gold: 6, up: { hp: 1, stat: { armor: { taken: 1 } } } });
  freshSession(ls);
  if (els.resetBtn.hidden || els.startBtn.textContent !== '이어하기 4구역') throw new Error('되돌리기 전 제목: ' + els.startBtn.textContent + ' / 버튼 숨김 ' + els.resetBtn.hidden);
  fire('resetBtn', 'click', {});
  if (readSave().cur !== 3 || els.startBtn.textContent !== '이어하기 4구역') throw new Error('한 번만 눌렀는데 되돌렸다');
  now += 3100; flush();   // 3초 지나면 확인이 풀린다
  fire('resetBtn', 'click', {});
  if (readSave().cur !== 3) throw new Error('확인이 풀린 뒤 한 번 누름에 되돌렸다');
  fire('resetBtn', 'click', {});
  const sv = readSave();
  if (sv.cur !== 0 || sv.best !== 3 || sv.gold !== 6 || sv.up.stat.armor.taken !== 1 || sv.up.hp !== 1) throw new Error('되돌리기 저장: ' + store['chimera-lab-save-v1']);
  if (els.startBtn.textContent !== '시작' || !els.resetBtn.hidden) throw new Error('되돌린 뒤 제목: ' + els.startBtn.textContent);
  fire('startBtn', 'click', {}); frames(3);
  if (game.district !== 1 || game.necro.maxHp !== 100 + S.CFG.gold.hpStep || game.statUp.armor.taken !== 1) throw new Error('되돌린 뒤 1구역이 강화와 함께 시작해야 한다');
  winNow();
  if (readSave().cur !== 1 || readSave().gold !== 6 || els.endGold.textContent !== '6골드' || els.endBest.textContent !== '3구역') throw new Error('되돌린 뒤 1구역 정복: 골드 없이 진행만: ' + store['chimera-lab-save-v1'] + ' / ' + els.endGold.textContent);
  console.log('1구역으로 되돌리기: 두 번 눌러야 되고, 진행만 0 → 다시 깬 1구역은 골드 없이 진행만 오른다');
}

// ---- 제목 화면의 '강화': 끝 화면과 같은 상점(#shop)을 제목에서 열어 사고, 산 강화로 판을 시작한다. 끝 화면 상점도 그대로 ----
{
  const S0 = SCOST(0), HC = HCOST(0), G0 = 2 * S0 + HC + 1, SK = 'chimera-lab-save-v1';
  store[SK] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: G0, up: { hp: 0 } });
  freshSession(ls);
  if (els.shopBtn.textContent !== '강화' || els.titleShop.hidden !== true) throw new Error('제목의 강화 버튼과 닫힌 상점: ' + els.shopBtn.textContent + ' / ' + els.titleShop.hidden);
  if (els.titleGold.textContent !== G0 + '골드') throw new Error('제목의 골드 표시: ' + els.titleGold.textContent);
  fire('shopBtn', 'click', {});
  if (els.titleShop.hidden !== false || els.shopBtn.textContent !== '강화 접기' || els.shopBtn['attr:aria-expanded'] !== 'true') throw new Error('강화 버튼이 상점을 열지 않았다');
  if (!els.titleShop.kids.includes(els.shop)) throw new Error('끝 화면의 상점(#shop)을 제목으로 옮기지 않았다');
  if (els.statTabs.kids.length !== 3 || els.statShop.kids.length !== 6) throw new Error('상점을 새로 만들었다: ' + els.statTabs.kids.length + ' / ' + els.statShop.kids.length);
  if (statBtn(0).disabled || els.buyHp.disabled) throw new Error('제목 상점에서 골드가 있는데 살 수 없다');
  buyStat(0);
  if (readSave().gold !== G0 - S0 || readSave().up.stat.beast.hp !== 1 || els.titleGold.textContent !== (G0 - S0) + '골드') throw new Error('제목에서 산 맹수 체력: ' + store[SK] + ' / ' + els.titleGold.textContent);
  tab(1); buyStat(5); fire('buyHp', 'click', {});
  const left = G0 - 2 * S0 - HC;
  if (readSave().gold !== left || readSave().up.stat.armor.taken !== 1 || readSave().up.hp !== 1 || els.titleGold.textContent !== left + '골드') throw new Error('제목에서 산 갑주·체력: ' + store[SK] + ' / ' + els.titleGold.textContent);
  if (!statBtn(0).disabled || !els.buyHp.disabled) throw new Error('골드가 모자란데 제목 상점에서 살 수 있게 보인다');
  // 다른 탭이 골드를 남기면 제목 상점과 골드 표시가 따라간다(지금 갑주 탭)
  store[SK] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: GC, up: { hp: 1, stat: { beast: { hp: 2 }, armor: { taken: 1 } } } });
  fireWin('storage', { key: SK });
  if (els.titleGold.textContent !== GC + '골드' || statBtn(0).disabled || !/ 1\/5단계$/.test(statBtn(5).textContent) || els.startBtn.textContent !== '이어하기 2구역') throw new Error('다른 탭의 저장을 제목 상점이 따라가지 않았다: ' + els.titleGold.textContent + ' / ' + statBtn(0).disabled);
  tab(0); buyStat(0);
  if (readSave().gold !== 0 || readSave().up.stat.beast.hp !== 3) throw new Error('다른 탭의 강화를 이어받아 사야 한다: ' + store[SK]);
  fire('shopBtn', 'click', {});
  if (els.titleShop.hidden !== true || els.shopBtn.textContent !== '강화') throw new Error('강화 버튼을 다시 누르면 상점을 접어야 한다');
  fire('startBtn', 'click', {}); frames(3);
  const st = lastOpts && lastOpts.start;
  if (game.district !== 2 || !st || st.hp !== 1 || st.stat.beast.hp !== 3 || st.stat.armor.taken !== 1) throw new Error('제목에서 산 강화가 newGame의 start에 들어가지 않았다: ' + JSON.stringify(st));
  if (beastHp() !== 3 || game.necro.maxHp !== 100 + S.CFG.gold.hpStep || game.statUp.armor.taken !== 1) throw new Error('제목에서 산 강화가 판에 들어가지 않았다: ' + beastHp() + ' / ' + game.necro.maxHp);
  // 끝 화면이 뜨면 상점은 끝 화면 자리로 돌아가 그대로 동작한다
  game.necro.hp = 0; frames(3);
  if (els.end.hidden !== false || !els.endShop.kids.includes(els.shop) || els.titleShop.hidden !== true || els.endGold.textContent !== '0골드') throw new Error('끝 화면에 상점이 돌아오지 않았다: ' + els.endGold.textContent);
  if (!statBtn(0).disabled) throw new Error('끝 화면: 골드 0인데 살 수 있게 보인다');
  store[SK] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: SCOST(3), up: { hp: 1, stat: { beast: { hp: 3 }, armor: { taken: 1 } } } });
  fireWin('storage', { key: SK });
  if (statBtn(0).disabled || els.endGold.textContent !== SCOST(3) + '골드') throw new Error('끝 화면의 storage 동기화가 바뀌었다: ' + els.endGold.textContent);
  buyStat(0);
  if (readSave().gold !== 0 || readSave().up.stat.beast.hp !== 4) throw new Error('끝 화면 구매: ' + store[SK]);
  fire('againBtn', 'click', {}); frames(3);
  if (game.district !== 2 || beastHp() !== 4) throw new Error('끝 화면에서 산 강화로 다시 시작하지 않았다: ' + beastHp());
  console.log('제목의 강화: 같은 상점(#shop)을 제목으로 옮겨 맹수 체력·갑주 받는 피해·네크로맨서 체력 구매 → 골드 ' + G0 + '→' + left + ', 다른 탭 저장 동기화, 시작한 판에 강화 반영, 끝 화면으로 돌아간 상점도 그대로');
}

// ---- 첫 소환수 종류: 제목·끝 화면의 맹수·갑주·사수 버튼으로 고르면 newGame({ starter })로 그 종류 하나로 시작한다 ----
{
  const SK = 'chimera-lab-save-v1';
  store[SK] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  const rowsOk = () => {
    for (const id of ['titleStarter', 'endStarter']) {
      const row = els[id];
      if (!row || row.kids.length !== 3 || row.kids.map(b => b['attr:data-starter']).join() !== 'beast,armor,ranger' || row.kids.map(b => b.textContent).join() !== '맹수,갑주,사수') throw new Error(id + ' 종류 버튼 셋(맹수·갑주·사수): ' + (row ? row.kids.map(b => b.textContent).join() : '없음'));
    }
  };
  const pressed = id => els[id].kids.filter(b => b['attr:aria-pressed'] === 'true').map(b => b['attr:data-starter']).join();
  const shown = k => { if (pressed('titleStarter') !== k || pressed('endStarter') !== k) throw new Error('선택 표시가 ' + k + '가 아니다: ' + pressed('titleStarter') + ' / ' + pressed('endStarter')); };
  const pick = (id, k) => { const b = els[id].kids.find(x => x['attr:data-starter'] === k); for (const f of b.handlers.click) f({}); shown(k); };
  const check = (k, where) => {
    const u = game.units[0];
    if (!lastOpts || lastOpts.starter !== k || game.starter !== k || game.units.length !== 1 || u.main !== k || u.genes[k] !== 1 || S.geneTotal(u) !== 1) throw new Error(where + ': ' + k + ' 하나로 시작해야 한다: ' + JSON.stringify({ opt: lastOpts && lastOpts.starter, starter: game.starter, main: u && u.main, n: game.units.length }));
  };
  const lose = () => { game.necro.hp = 0; frames(3); if (game.over !== 'lose' || els.end.hidden !== false) throw new Error('끝 화면이 뜨지 않았다'); };
  rowsOk(); shown('beast');
  fire('startBtn', 'click', {}); frames(3); check('beast', '고르지 않고 시작');
  lose();
  pick('endStarter', 'armor');
  fire('againBtn', 'click', {}); frames(3); check('armor', '끝 화면에서 갑주');
  lose();
  pick('endStarter', 'ranger');
  fire('againBtn', 'click', {}); frames(3); check('ranger', '끝 화면에서 사수');
  lose();
  fire('againBtn', 'click', {}); frames(3); check('ranger', '다시 고르지 않으면 고른 종류 그대로');
  lose();
  pick('endStarter', 'beast');
  fire('againBtn', 'click', {}); frames(3); check('beast', '끝 화면에서 맹수');
  freshSession(ls); rowsOk(); shown('beast');
  pick('titleStarter', 'armor');
  fire('startBtn', 'click', {}); frames(3); check('armor', '제목에서 갑주');
  freshSession(ls);
  pick('titleStarter', 'ranger');
  fire('startBtn', 'click', {}); frames(3); check('ranger', '제목에서 사수');
  freshSession(ls);
  pick('titleStarter', 'ranger'); pick('titleStarter', 'beast');
  fire('startBtn', 'click', {}); frames(3); check('beast', '제목에서 사수 뒤 맹수');
  console.log('첫 소환수 종류: 기본 맹수, 끝 화면 갑주·사수·맹수, 제목 갑주·사수·맹수 선택이 newGame({ starter })와 g.units[0].main·g.starter로 이어진다');
}

// ---- home screen: logo + clear stage (no veil, no prose), thumb CTA from save.cur + 1, icon row (shop/sound/controls), controls panel, first-summon hook ----
{
  const SK = 'chimera-lab-save-v1';
  const sec = id => { const i = h.indexOf('id="' + id + '"'); if (i < 0) return ''; return h.slice(h.lastIndexOf('<section', i), h.indexOf('</section>', i) + 10); };
  const home = sec('title'), help = sec('helpModal'), how = help.slice(help.indexOf('<ol class="how">'), help.indexOf('</ol>'));
  if (!home || home.slice(0, home.indexOf('>')).includes('veil') || !home.includes('<h1 class="logo">키메라 실험실</h1>') || !home.includes('id="homeStage"')) throw new Error('홈 화면: 덮개 없이 큰 로고와 투명 무대: ' + home.slice(0, 160));
  if (/class="goal"|class="how"|class="kinds"|봉쇄된 서울/.test(home)) throw new Error('홈 화면에 설명 줄글·규칙·종류 이름표가 남았다');
  const iS = home.indexOf('id="startBtn" class="cta"'), iR = home.indexOf('class="iconRow"'), row = home.slice(iR), at = id => row.indexOf('id="' + id + '"');
  if (!(iS > 0 && iR > iS) || !(at('shopBtn') >= 0 && at('shopBtn') < at('soundBtn') && at('soundBtn') < at('helpBtn'))) throw new Error('주 버튼 아래 줄이 강화·소리·조작법 아이콘 줄이 아니다');
  if (!help.includes('class="veil"') || how.split('<li>').length - 1 !== 5 || !help.includes('class="goal"') || !help.includes('id="helpClose"')) throw new Error('조작법 패널에 규칙 5줄·안내·닫기 버튼이 없다');
  const hc = h.indexOf('.home {');
  if (hc < 0 || h.slice(hc, h.indexOf('}', hc)).includes('var(--veil)')) throw new Error('홈 화면 배경이 불투명 덮개 색이다');
  delete store[SK];
  freshSession(ls);
  if (els.title.hidden !== false || els.helpModal.hidden !== true || els.startBtn.textContent !== '시작') throw new Error('처음 홈 화면: ' + els.startBtn.textContent + ' / 조작법 숨김 ' + els.helpModal.hidden);
  if (VIEW === '3d' && !(vOpts && vOpts.title === true && vOpts.starter === 'beast')) throw new Error('홈 화면의 V.render에 title·starter가 없다');
  // controls panel: button opens, close button / Escape / outside tap / button again close it
  fire('helpBtn', 'click', {});
  if (els.helpModal.hidden !== false || els.helpBtn['attr:aria-expanded'] !== 'true') throw new Error('조작법 버튼이 패널을 열지 않았다');
  fire('helpClose', 'click', {});
  if (els.helpModal.hidden !== true || els.helpBtn['attr:aria-expanded'] !== 'false') throw new Error('확인 버튼이 조작법 패널을 닫지 않았다');
  fire('helpBtn', 'click', {}); fireWin('keydown', { key: 'Escape' }); fireWin('keyup', { key: 'Escape' });
  if (els.helpModal.hidden !== true) throw new Error('Escape가 조작법 패널을 닫지 않았다');
  fire('helpBtn', 'click', {}); fire('helpModal', 'click', { target: els.helpModal });
  if (els.helpModal.hidden !== true) throw new Error('바깥을 눌러도 조작법 패널이 닫히지 않았다');
  fire('helpBtn', 'click', {}); fire('helpBtn', 'click', {});
  if (els.helpModal.hidden !== true) throw new Error('조작법 버튼을 다시 누르면 닫혀야 한다');
  // icon row: shop opens/closes the shared shop, sound toggles
  fire('shopBtn', 'click', {});
  if (els.titleShop.hidden !== false || !els.titleShop.kids.includes(els.shop)) throw new Error('아이콘 줄의 강화가 상점을 열지 않았다');
  fire('shopBtn', 'click', {});
  if (els.titleShop.hidden !== true) throw new Error('강화를 다시 누르면 접혀야 한다');
  const snd0 = els.soundBtn['attr:aria-pressed'];
  fire('soundBtn', 'click', {});
  if (els.soundBtn['attr:aria-pressed'] === snd0) throw new Error('아이콘 줄의 소리 버튼이 바뀌지 않았다');
  fire('soundBtn', 'click', {});
  if (els.soundBtn['attr:aria-pressed'] !== snd0) throw new Error('소리 버튼을 다시 누르면 돌아와야 한다');
  // first-summon hook (stage 2 wires 3D model taps / 2D fallback stage into it)
  const T = win.ChimeraTitle, got = [];
  if (!T || T.get() !== 'beast' || T.kinds.join() !== S.KINDS.join() || T.isOpen() !== true) throw new Error('첫 소환수 선택 훅(window.ChimeraTitle)이 없다');
  const off = T.onSelect((k, src) => got.push(k + ':' + src));
  const pressedK = id => els[id].kids.filter(b => b['attr:aria-pressed'] === 'true').map(b => b['attr:data-starter']).join();
  if (T.select('ranger') !== true || T.get() !== 'ranger' || pressedK('titleStarter') !== 'ranger' || pressedK('endStarter') !== 'ranger' || els.title['attr:data-starter'] !== 'ranger') throw new Error('훅으로 고른 사수가 버튼·제목 상태에 반영되지 않았다');
  if (VIEW === '3d') { frames(1); if (vOpts.starter !== 'ranger') throw new Error('훅으로 고른 종류가 V.render에 가지 않았다'); }
  if (T.select('dragon') !== false || T.get() !== 'ranger') throw new Error('없는 종류를 받아들였다');
  for (const f of els.titleStarter.kids.find(b => b['attr:data-starter'] === 'armor').handlers.click) f({});
  if (T.get() !== 'armor' || got.join() !== 'ranger:stage,armor:button') throw new Error('선택 알림: ' + got.join());
  off(); T.select('ranger');
  if (got.length !== 2 || T.get() !== 'ranger') throw new Error('구독을 끊었는데 알림이 왔다');
  // CTA starts with the picked kind and closes the home screen and the controls panel
  fire('helpBtn', 'click', {});
  fire('startBtn', 'click', {}); frames(3);
  if (game.district !== 1 || game.starter !== 'ranger' || game.units[0].main !== 'ranger' || els.title.hidden !== true || els.helpModal.hidden !== true || T.isOpen()) throw new Error('시작 버튼이 고른 사수로 판을 열고 홈·조작법을 닫아야 한다');
  if (T.select('armor') !== false || T.get() !== 'ranger') throw new Error('판 중에는 훅으로 바꾸지 않는다');
  fire('helpBtn', 'click', {});
  if (els.helpModal.hidden !== true) throw new Error('판 중에 조작법 패널이 열렸다');
  if (VIEW === '3d' && vOpts.title !== false) throw new Error('판 중 V.render의 title은 false');
  // saved progress: '이어하기 N구역' with N = save.cur + 1, and the CTA opens that district
  for (const cur of [1, 2]) {
    store[SK] = JSON.stringify({ v: 1, best: cur, cur, gold: 0, up: { hp: 0 } });
    freshSession(ls);
    if (els.startBtn.textContent !== '이어하기 ' + (cur + 1) + '구역') throw new Error('저장 cur ' + cur + '의 주 버튼: ' + els.startBtn.textContent);
    fire('startBtn', 'click', {}); frames(3);
    if (game.district !== cur + 1 || els.title.hidden !== true) throw new Error('이어하기가 ' + (cur + 1) + '구역을 열지 않았다: ' + game.district);
  }
  console.log('홈 화면: 덮개·줄글 없이 로고·투명 무대, 주 버튼 "시작"/"이어하기 N구역"(save.cur + 1), 아이콘 줄 강화·소리·조작법, 조작법 패널 열기·닫기, 소환수 선택 훅(ChimeraTitle) → start()');
}

// ---- 타이틀 무대(2단계): 3D는 캔버스 탭을 V.pickTitle로, 2D(2d.html·WebGL 없음)는 원화 무대를 그려 탭으로 고른다.
// 둘 다 window.ChimeraTitle과 같은 선택이고 start()가 그 소환수로 판을 연다. 조작법 패널: 배경 홈 inert, Tab 가두기, 닫으면 포커스 복원 ----
{
  delete store['chimera-lab-save-v1'];
  freshSession(ls);
  const T = win.ChimeraTitle, R2 = win.ChimeraRender2D, got = [];
  const off = T.onSelect((k, src) => got.push(k + ':' + src));
  const tapXY = (x, y) => { const e = { pointerId: 21, clientX: x, clientY: y }; fire('game', 'pointerdown', e); fire('game', 'pointerup', e); };
  let want, blocked;
  if (VIEW === '3d') {
    const p0 = vcalls.pick;
    tapXY(330, 500);
    if (vcalls.pick !== p0 + 1 || T.get() !== 'ranger' || got.join() !== 'ranger:stage') throw new Error('3D 무대 탭이 V.pickTitle로 사수를 고르지 않았다: ' + got.join());
    tapXY(60, 500); frames(1);
    if (T.get() !== 'beast' || vOpts.title !== true || vOpts.starter !== 'beast') throw new Error('3D 무대 탭으로 고른 맹수가 V.render에 가지 않았다');
    want = 'beast'; blocked = [330, 500];
  } else {
    const st = R2 && R2.titleStage && R2.titleStage();
    if (!st || st.drawn < 1 || st.slots.length !== 1 + S.KINDS.length || st.slots[0].k !== 'necro' || st.slots.slice(1).map(s => s.k).join() !== S.KINDS.join()) throw new Error('2D 타이틀 무대가 그려지지 않았다: ' + JSON.stringify(st && st.slots));
    if (st.art.length !== 0 || st.fallback !== st.slots.length) throw new Error('이미지가 없는 가짜 DOM에서는 도형으로 대신 그려야 한다: ' + JSON.stringify([st.art, st.fallback]));
    for (const k of ['armor', 'ranger', 'beast']) {
      const s = R2.titleStage().slots.find(x => x.k === k);
      tapXY(s.x, s.foot - s.h * 0.5); frames(30);
      const after = R2.titleStage(), me = after.slots.find(x => x.k === k), others = after.slots.filter(x => x.k !== k && x.k !== 'necro');
      if (T.get() !== k || els.title['attr:data-starter'] !== k) throw new Error('2D 무대 탭이 ' + k + '를 고르지 않았다: ' + T.get());
      if (!(after.fwd[k] > 0.9) || others.some(o => after.fwd[o.k] > 0.1) || others.some(o => !(me.foot > o.foot && me.h > o.h))) throw new Error('고른 소환수가 앞으로 나와 커져야 한다: ' + JSON.stringify(after.slots));
    }
    if (got.join() !== 'armor:stage,ranger:stage,beast:stage') throw new Error('2D 무대 선택 알림: ' + got.join());
    tapXY(195, 4);
    if (T.get() !== 'beast' || got.length !== 3) throw new Error('빈 하늘을 눌렀는데 선택이 바뀌었다');
    T.select('armor', 'test'); frames(30);
    if (!(R2.titleStage().fwd.armor > 0.9) || R2.titleStage().fwd.beast > 0.1) throw new Error('훅으로 고른 갑주가 2D 무대에서 앞으로 나오지 않았다');
    const rs = R2.titleStage().slots.find(x => x.k === 'ranger');
    want = 'armor'; blocked = [rs.x, rs.foot - rs.h * 0.5];
  }
  // controls panel: home inert and Tab kept inside while open; stage taps ignored; focus back to the help button on close
  doc.activeElement = null;
  for (const id of ['helpClose', 'helpBtn', 'startBtn']) els[id].focus = () => { doc.activeElement = els[id]; };
  els.helpModal.querySelectorAll = () => [els.helpClose];
  els.helpModal.contains = x => x === els.helpModal || x === els.helpClose;
  const key = (k, shift) => { const ev = { key: k, shiftKey: !!shift, prevented: false, preventDefault() { ev.prevented = true; } }; fireWin('keydown', ev); fireWin('keyup', ev); return ev; };
  if (els.title.inert === true) throw new Error('조작법이 닫혀 있는데 홈이 inert다');
  fire('helpBtn', 'click', {});
  if (els.helpModal.hidden || els.title.inert !== true || doc.activeElement !== els.helpClose) throw new Error('조작법을 열면 홈이 inert이고 포커스가 패널 안에 있어야 한다');
  let ev = key('Tab');
  if (!ev.prevented || doc.activeElement !== els.helpClose) throw new Error('Tab이 조작법 패널 밖으로 나갔다');
  doc.activeElement = els.startBtn; ev = key('Tab', true);
  if (!ev.prevented || doc.activeElement !== els.helpClose) throw new Error('Shift+Tab이 배경 홈 버튼에 머물렀다');
  doc.activeElement = els.startBtn;
  for (const f of docH.focusin || []) f({ target: els.startBtn });
  if (doc.activeElement !== els.helpClose) throw new Error('배경으로 새어 나간 포커스를 패널로 되돌리지 않았다');
  tapXY(blocked[0], blocked[1]);
  if (T.get() !== want) throw new Error('조작법 패널이 열린 동안 무대 탭이 선택을 바꿨다');
  key('Escape');
  if (!els.helpModal.hidden || els.title.inert !== false || doc.activeElement !== els.helpBtn) throw new Error('조작법을 닫으면 inert를 풀고 포커스를 조작법 버튼으로 돌려야 한다');
  ev = key('Tab');
  if (ev.prevented) throw new Error('조작법이 닫힌 뒤에도 Tab을 막았다');
  delete doc.activeElement;
  off();
  // start() opens the run with the stage pick and leaves the stage
  fire('startBtn', 'click', {}); frames(3);
  if (game.starter !== want || game.units[0].main !== want || els.title.hidden !== true || T.isOpen()) throw new Error('무대에서 고른 ' + want + '로 판이 열리지 않았다: ' + game.starter);
  if (VIEW === '3d' && vOpts.title !== false) throw new Error('판을 시작했는데 V.render가 아직 타이틀이다');
  console.log('타이틀 무대(' + VIEW + '): 탭으로 첫 소환수 선택·ChimeraTitle 동기화·앞으로 나와 강조, 조작법 패널 inert·Tab 가두기·포커스 복원, start()가 고른 ' + want + '로 판을 연다');
}

// ---- 변이 씨앗: 상점 버튼으로 사고(가격·보유 표시, 중복 거부), 판을 시작하면 씨앗을 써 변이 카드 셋이 뜬다 ----
{
  const SK = 'chimera-lab-save-v1', SC = S.CFG.gold.seedCost;
  store[SK] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: SC + 1, up: { hp: 0 } });   // 씨앗 필드가 없던 저장
  freshSession(ls);
  if (readSave().seed !== 0 || readSave().gold !== SC + 1) throw new Error('옛 저장의 씨앗은 0: ' + store[SK]);
  if (els.buySeed.disabled || !els.buySeed.textContent.includes(SC + '골드') || !/보유 0\/1/.test(els.buySeed.textContent)) throw new Error('씨앗 버튼(가격·보유): ' + els.buySeed.textContent);
  fire('shopBtn', 'click', {});
  fire('buySeed', 'click', {});
  if (readSave().seed !== 1 || readSave().gold !== 1 || !els.buySeed.disabled || !/보유 1\/1/.test(els.buySeed.textContent) || els.titleGold.textContent !== '1골드') throw new Error('씨앗 구매: ' + store[SK] + ' / ' + els.buySeed.textContent);
  store[SK] = JSON.stringify(Object.assign(readSave(), { gold: 99 })); fireWin('storage', { key: SK });
  if (!els.buySeed.disabled) throw new Error('씨앗이 있으면 버튼이 막혀야 한다');
  fire('buySeed', 'click', {});
  if (readSave().seed !== 1 || readSave().gold !== 99) throw new Error('씨앗 중복 구매가 막히지 않았다: ' + store[SK]);
  fire('shopBtn', 'click', {});
  fire('startBtn', 'click', {}); frames(2);
  if (!lastOpts.mutSeed || readSave().seed !== 0 || !Array.isArray(game.choice) || game.choice.length !== 3 || els.mutModal.hidden || els.mutList.kids.length !== 3) throw new Error('씨앗으로 시작하면 씨앗 0, 카드 셋: ' + store[SK] + ' / ' + JSON.stringify(game.choice));
  frames(22);
  const id = game.choice[0];
  for (const f of els.mutList.kids[0].handlers.click) f({});
  if (game.choice || game.muts[id] !== 1 || !els.mutModal.hidden) throw new Error('씨앗 카드를 고르면 판이 시작해야 한다');
  const t1 = game.t; frames(2);
  if (!(game.t > t1)) throw new Error('씨앗 카드를 고른 뒤 판이 가지 않는다');
  game.necro.hp = 0; frames(3);
  fire('againBtn', 'click', {}); frames(2);
  if (lastOpts.mutSeed || game.choice || readSave().seed !== 0) throw new Error('씨앗이 없으면 예전처럼 시작해야 한다');
  console.log('변이 씨앗: 상점에서 ' + SC + '골드로 구매(중복 거부), 판 시작에 써서 카드 셋, 다음 판은 예전 그대로');
}

// ---- 처음 정복 변이 씨앗: 씨앗 0으로 처음 정복하면 1개, 끝 화면에 '변이 씨앗 획득' 한 줄. 이미 1개거나 다시 깬 구역·패배면 줄 없음 ----
{
  const SK = 'chimera-lab-save-v1', line = () => (els.aceAsk.hidden ? '' : els.aceAsk.textContent), LINE = '변이 씨앗 획득';
  if (!(SEED_CLEAR >= 1)) throw new Error('처음 정복 씨앗이 꺼져 있다: ' + SEED_CLEAR);
  S.CFG.gold.seedPerClear = SEED_CLEAR;
  try {
    store[SK] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: 0, up: { hp: 0 }, seed: 0 });
    freshSession(ls);
    fire('startBtn', 'click', {}); frames(2);
    if (game.district !== 2 || game.choice || lastOpts.mutSeed) throw new Error('씨앗 0으로 2구역 시작: ' + game.district);
    winNow();
    if (readSave().seed !== 1 || readSave().best !== 2 || game.seedGained !== true || line() !== LINE) throw new Error('(1) 씨앗 0으로 처음 정복: ' + store[SK] + ' / "' + line() + '"');
    if (!/보유 1\/1/.test(els.buySeed.textContent)) throw new Error('받은 씨앗이 상점 보유 수에 보이지 않는다: ' + els.buySeed.textContent);
    for (const f of els.aceList.kids[0].handlers.click) f({}); frames(2);
    if (game.district !== 3 || !lastOpts.mutSeed || readSave().seed !== 0 || !Array.isArray(game.choice)) throw new Error('받은 씨앗을 다음 판 시작에 써야 한다: ' + store[SK]);
    frames(22); for (const f of els.mutList.kids[0].handlers.click) f({});
    if (game.choice) throw new Error('씨앗 카드를 고르지 못했다');
    store[SK] = JSON.stringify(Object.assign(readSave(), { seed: 1 }));   // 판 도중 다른 탭이 씨앗을 샀다(보유 1)
    winNow();
    if (readSave().seed !== 1 || readSave().best !== 3 || game.seedGained !== false || line() !== '') throw new Error('(2) 씨앗 1로 처음 정복: 1 유지, 줄 없음: ' + store[SK] + ' / "' + line() + '"');
    store[SK] = JSON.stringify({ v: 1, best: 3, cur: 0, gold: 0, up: { hp: 0 }, seed: 0 });
    freshSession(ls);
    fire('startBtn', 'click', {}); frames(2);
    if (game.district !== 1 || game.choice) throw new Error('되돌린 진행의 1구역 시작: ' + game.district);
    winNow();
    if (readSave().seed !== 0 || readSave().cur !== 1 || game.seedGained !== false || line() !== '') throw new Error('(3) 이미 깬 구역 재정복: 씨앗 그대로: ' + store[SK] + ' / "' + line() + '"');
    fire('againBtn', 'click', {}); frames(2);
    game.necro.hp = 0; frames(3);
    if (game.over !== 'lose' || line() !== '' || readSave().seed !== 0) throw new Error('지면 씨앗 줄이 없어야 한다: "' + line() + '"');
    console.log('처음 정복 변이 씨앗: 씨앗 0 → 1과 "' + LINE + '" 한 줄, 보유 1이면 1 유지·줄 없음, 이미 깬 구역·패배는 그대로');
  } finally { S.CFG.gold.seedPerClear = 0; }
}

// ---- 예전 '시작 맹수 유전자' 강화는 없앴다: 띄울 때 쓴 골드를 돌려주고, 다시 띄워도 두 번 돌려주지 않는다 ----
{
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 2, cur: 2, gold: 1, up: { genes: 4, hp: 1 } });
  freshSession(ls);
  const want = 1 + 4 * S.CFG.gold.geneRefund;
  if (readSave().gold !== want || readSave().up.genes !== undefined || readSave().up.hp !== 1) throw new Error('유전자 강화 환불: ' + store['chimera-lab-save-v1']);
  freshSession(ls);
  if (readSave().gold !== want) throw new Error('다시 띄우자 또 돌려줬다: ' + store['chimera-lab-save-v1']);
  fire('startBtn', 'click', {}); frames(3);
  if (S.geneTotal(game.units[0]) !== 1) throw new Error('예전 유전자 강화가 남아 있다');
  console.log('예전 유전자 강화: 4단계 → ' + 4 * S.CFG.gold.geneRefund + '골드로 돌려주고, 다시 띄워도 한 번만');
}

// ---- 예전 근접(맹수·갑주) 사거리 강화는 없앴다: 띄울 때 쓴 골드를 돌려주고, 사수 사거리는 그대로, 다시 띄워도 한 번만 ----
{
  const SK = 'chimera-lab-save-v1', GC2 = S.CFG.gold.rangeRefund, B0 = SCOST(0);
  store[SK] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: 1, up: { hp: 0, stat: { beast: { hp: 1, range: 3 }, armor: { range: 2 }, ranger: { range: 4 } } } });
  freshSession(ls);
  const want = 1 + 5 * GC2, sv = readSave();
  if (sv.gold !== want || 'range' in sv.up.stat.beast || 'range' in sv.up.stat.armor || sv.up.stat.ranger.range !== 4 || sv.up.stat.beast.hp !== 1) throw new Error('근접 사거리 환불: ' + store[SK]);
  if (els.titleGold.textContent !== want + '골드') throw new Error('환불한 골드가 제목에 보이지 않는다: ' + els.titleGold.textContent);
  freshSession(ls);
  if (readSave().gold !== want) throw new Error('다시 띄우자 근접 사거리를 또 돌려줬다: ' + store[SK]);
  fire('shopBtn', 'click', {}); tab(0);
  buyStat(S.CFG.statKinds.beast.indexOf('leap'));
  if (readSave().up.stat.beast.leap !== 1 || readSave().gold !== want - B0) throw new Error('맹수 도약 간격 구매: ' + store[SK]);
  tab(1); buyStat(S.CFG.statKinds.armor.indexOf('quake'));
  if (readSave().up.stat.armor.quake !== 1 || readSave().gold !== want - 2 * B0) throw new Error('갑주 충격파 구매: ' + store[SK]);
  tab(0); fire('shopBtn', 'click', {});
  freshSession(ls);
  if (readSave().gold !== want - 2 * B0) throw new Error('산 뒤 다시 띄우자 골드가 바뀌었다: ' + store[SK]);
  fire('startBtn', 'click', {}); frames(3);
  const u = game.units[0], plain = S.stats(Object.assign({}, u, { up: null }));
  if (game.statUp.beast.leap !== 1 || game.statUp.armor.quake !== 1 || 'range' in game.statUp.beast || game.statUp.ranger.range !== 4) throw new Error('판에 들어간 강화: ' + JSON.stringify(game.statUp));
  if (!(Math.abs(S.stats(u).skillCd - plain.skillCd / (1 + S.CFG.statStep.leap)) < 1e-9)) throw new Error('산 도약 강화가 판의 맹수에 들어가지 않았다: ' + S.stats(u).skillCd);
  console.log('예전 근접 사거리: 맹수 3·갑주 2단계 → ' + 5 * GC2 + '골드로 돌려주고 다시 띄워도 한 번만, 사수 사거리 4단계 그대로, 도약 간격·충격파 구매가 판에 들어간다');
}

// ---- 초소 골드: 이기든 지든 부순 초소 하나에 perPost. 처음 정복이면 perClear를 더 ----
{
  S.CFG.gold.perPost = PER_POST; S.CFG.gold.perElite = PER_ELITE; S.CFG.gold.perBoss = PER_BOSS;
  const PP = PER_POST, PE = PER_ELITE, PB = PER_BOSS;
  if (!(PE > 0) || !(PB > 0)) throw new Error('돌격조·대장 골드가 켜져 있어야 한다: ' + PE + ' / ' + PB);
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);   // 2구역
  game.posts[0].dead = true; game.posts[1].dead = true; game.postsDown = 2; game.eliteKills = 3;   // 지면서 초소 둘과 돌격조 셋
  game.necro.hp = 0; frames(3);
  const lost = 2 * PP + 3 * PE;
  if (game.over !== 'lose' || readSave().gold !== lost || els.endGold.textContent !== lost + '골드 (+' + lost + ')') throw new Error('지면서 초소 둘·돌격조 셋: ' + store['chimera-lab-save-v1'] + ' / ' + els.endGold.textContent);
  fire('againBtn', 'click', {}); frames(3);
  game.necro.hp = 0; frames(3);
  if (readSave().gold !== lost || els.endGold.textContent !== lost + '골드') throw new Error('초소·돌격조 없이 지면 골드 없음: ' + els.endGold.textContent);
  fire('againBtn', 'click', {}); frames(3);
  winNow();   // 2구역 처음 정복: 초소 넷 + 대장(돌격조 처치 수에 든 대장은 한 번만) + 처음 정복
  const want = lost + 4 * PP + PB + PC;
  if (readSave().gold !== want || readSave().best !== 2 || els.endGold.textContent !== want + '골드 (+' + (4 * PP + PB + PC) + ')') throw new Error('처음 정복 골드: ' + store['chimera-lab-save-v1'] + ' / ' + els.endGold.textContent);
  fire('againBtn', 'click', {}); frames(3);   // 1구역부터 다시: 이미 깬 구역은 초소·대장 골드만(정복 골드 없음)
  winNow();
  if (readSave().gold !== want + 3 * PP + PB || els.endGold.textContent !== (want + 3 * PP + PB) + '골드 (+' + (3 * PP + PB) + ')') throw new Error('이미 깬 1구역: 초소·대장 골드만: ' + store['chimera-lab-save-v1'] + ' / ' + els.endGold.textContent);
  console.log('초소·돌격조·대장 골드: 지면서 초소 둘·돌격조 셋 +' + lost + ', 없이 지면 0, 2구역 처음 정복 +' + (4 * PP + PB + PC) + ', 이미 깬 1구역 +' + (3 * PP + PB));
}

// ---- 진 끝 화면에서 한 구역 내려가기: 초소 골드를 모으고, 이기면 다시 진 구역으로. 진행 기록은 내려가지 않는다 ----
{
  const PP = S.CFG.gold.perPost, PB = S.CFG.gold.perBoss;
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 3, cur: 3, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  if (game.district !== 4) throw new Error('내려가기: 4구역에서 시작해야 한다');
  game.necro.hp = 0; frames(3);
  if (els.downBtn.hidden || !/^3구역으로 내려가기/.test(els.downBtn.textContent)) throw new Error('진 4구역 끝 화면에 내려가기 버튼: ' + els.downBtn.hidden + ' / ' + els.downBtn.textContent);
  fire('downBtn', 'click', {}); frames(3);
  if (game.district !== 3 || els.end.hidden !== true) throw new Error('내려가기가 3구역을 열지 않았다: ' + game.district);
  winNow();
  const sv = readSave();
  if (sv.cur !== 3 || sv.best !== 3 || sv.gold !== game.postsTotal * PP + PB) throw new Error('내려간 3구역 정복: 초소·대장 골드만(정복 골드 없음), 진행은 그대로: ' + store['chimera-lab-save-v1']);
  if (!els.downBtn.hidden) throw new Error('이긴 끝 화면에는 내려가기 버튼이 없다');
  if (els.aceList.kids.length !== 1 || els.aceList.kids[0].textContent !== '다음 구역 → 4구역') throw new Error('내려간 구역을 이기면 다시 4구역으로: ' + (els.aceList.kids[0] || {}).textContent);
  for (const f of els.aceList.kids[0].handlers.click) f({}); frames(3);
  if (game.district !== 4) throw new Error('다시 4구역');
  // 1구역에서 지면 내려갈 곳이 없다
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  game.necro.hp = 0; frames(3);
  if (!els.downBtn.hidden) throw new Error('1구역에서 지면 내려가기 버튼이 없어야 한다');
  console.log('내려가기: 4구역에서 지면 "3구역으로 내려가기" → 3구역 정복은 초소 골드 +' + sv.gold + '만, 진행 그대로 → "4구역으로". 1구역에서는 버튼 없음');
}

// ---- 초소 변이 3지선다: 판이 멈추고 카드 셋, 뜬 직후 0.35초 잠금, 고르면 다시 간다 ----
{
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  game.spawnT = 1e9; game.eliteIdx = 99; game.posts.forEach(p => { p.cd = 99; });
  // 끌던 중에 초소가 부서진다(카드가 뜬다)
  const d = { pointerId: 7, clientX: 200, clientY: 500 };
  fire('game', 'pointerdown', d); fire('game', 'pointermove', { pointerId: 7, clientX: 260, clientY: 500 }); frames(2);
  game.choice = ['twin_heart', 'gluttony', 'chain_fuse'];
  frames(1);
  const cards = els.mutList.kids;
  if (els.mutModal.hidden || cards.length !== 3) throw new Error('변이 모달이 카드 셋으로 떠야 한다: ' + els.mutModal.hidden + ' / ' + cards.length);
  if (cards[1].kids[0].textContent !== '과식 본능' || !cards[1].kids[1].textContent) throw new Error('카드에 이름과 설명: ' + cards[1].kids[0].textContent);
  const t0 = game.t, x0 = game.necro.x;
  fire('game', 'pointermove', { pointerId: 7, clientX: 330, clientY: 500 });
  frames(5);
  if (game.t !== t0 || game.necro.x !== x0) throw new Error('고르는 동안 판과 네크로맨서가 멈춰야 한다');
  if (!cards.every(b => b.disabled)) throw new Error('뜬 직후에는 카드가 잠겨 있어야 한다');
  for (const f of cards[0].handlers.click) f({});
  if (!game.choice || game.muts.twin_heart) throw new Error('0.35초 안에 누른 카드는 무시해야 한다');
  frames(20);   // 약 0.42초 뒤
  if (cards.some(b => b.disabled)) throw new Error('0.35초 뒤에는 카드가 풀려야 한다');
  const before = tones;
  for (const f of cards[1].handlers.click) f({});
  if (game.choice || game.muts.gluttony !== 1 || !els.mutModal.hidden || tones <= before) throw new Error('고르면 변이가 붙고 모달이 닫히고 소리가 난다');
  fire('game', 'pointerup', { pointerId: 7, clientX: 330, clientY: 500 });
  frames(5);
  if (!(game.t > t0) || game.necro.x !== x0) throw new Error('고른 뒤 판이 다시 가고, 끌던 손가락은 이어지지 않는다');
  // 한 번에 초소 둘: 두 번 이어서 뜬다
  game.choice = ['twin_heart', 'mad_blood', 'chain_fuse']; game.choiceQ = 1; frames(1); frames(22);
  for (const f of els.mutList.kids[0].handlers.click) f({}); frames(1);
  if (els.mutModal.hidden || els.mutList.kids.length !== 3 || els.mutList.kids[0].disabled !== true) throw new Error('초소 둘이면 다음 셋이 잠긴 채 이어서 떠야 한다');
  console.log('변이 3지선다: 판 멈춤, 끌던 입력 끊김, 0.35초 잠금(먼저 누른 카드 무시), 고르면 소리와 함께 다시 간다, 초소 둘이면 두 번');
}

// ---- 앱이 뒤로 가면(document.hidden) 판이 멈추고 '눌러서 계속': S.step 없음, 끌던 입력 끊김, 0.35초 잠금, 한 번 눌러 이어 한다 ----
{
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  const hide = h => { doc.hidden = h; fireDoc('visibilitychange'); };
  const pm = () => els.pauseModal;
  hide(true); frames(3); hide(false); frames(1);
  if (!pm().hidden) throw new Error('제목 화면에서 숨겼다 돌아왔는데 멈춤 덮개가 떴다');
  fire('startBtn', 'click', {}); frames(3);
  if (!pm().hidden) throw new Error('판을 시작했는데 멈춤 덮개가 남아 있다');
  game.spawnT = 1e9; game.eliteIdx = 99; game.posts.forEach(p => { p.cd = 99; });
  game.necro.hp = game.necro.maxHp = 1e6;
  // 끌면서 오른쪽 키도 누른 채 앱이 뒤로 간다
  fire('game', 'pointerdown', { pointerId: 9, clientX: 200, clientY: 500 }); fire('game', 'pointermove', { pointerId: 9, clientX: 260, clientY: 500 });
  fireWin('keydown', { key: 'ArrowRight' }); frames(2);
  let steps = 0; const realStep = S.step;
  S.step = function () { steps++; return realStep.apply(this, arguments); };
  try {
    frames(1);
    if (!steps) throw new Error('판이 가는 동안 S.step이 불리지 않는다(확인 장치가 틀렸다)');
    hide(true);
    if (pm().hidden || els.resumeBtn.disabled !== true) throw new Error('숨으면 잠긴 멈춤 덮개가 떠야 한다: ' + pm().hidden + ' / ' + els.resumeBtn.disabled);
    const t0 = game.t, x0 = game.necro.x; steps = 0;
    fire('game', 'pointermove', { pointerId: 9, clientX: 330, clientY: 500 });
    fire('game', 'pointerdown', { pointerId: 10, clientX: 100, clientY: 400 }); fire('game', 'pointermove', { pointerId: 10, clientX: 180, clientY: 400 });
    frames(60);
    if (steps || game.t !== t0 || game.necro.x !== x0) throw new Error('숨은 동안 S.step이 불렸거나 판이 움직였다: step ' + steps);
    fireDoc('visibilitychange');   // 숨김 알림이 한 번 더 와도 덮개는 하나, 상태는 그대로
    if (pm().hidden || steps) throw new Error('두 번째 숨김 알림에 상태가 꼬였다');
    hide(false);
    if (pm().hidden || els.resumeBtn.disabled !== true) throw new Error('돌아온 직후에는 덮개가 잠겨 있어야 한다');
    fire('pauseModal', 'click', {}); frames(5);
    if (pm().hidden || steps || game.t !== t0) throw new Error('0.35초 안에 누른 것은 무시해야 한다');
    frames(20);   // 돌아온 지 약 0.42초
    if (els.resumeBtn.disabled) throw new Error('0.35초 뒤에는 덮개가 풀려야 한다');
    fire('pauseModal', 'click', {});
    if (!pm().hidden) throw new Error('한 번 누르면 덮개가 닫혀야 한다');
    frames(1);
    if (steps !== 1 || !(game.t - t0 > 0 && game.t - t0 <= 0.05 + 1e-9)) throw new Error('재개 첫 프레임: step ' + steps + ', dt ' + (game.t - t0));
    frames(10);
    if (game.necro.x !== x0) throw new Error('재개 뒤 끌던 손가락이나 눌려 있던 키가 이어졌다');
    fire('game', 'pointerup', { pointerId: 9, clientX: 330, clientY: 500 }); fire('game', 'pointerup', { pointerId: 10, clientX: 180, clientY: 400 });
    // 변이 카드가 떠 있을 때 숨으면 덮개를 겹치지 않고, 돌아오면 카드를 다시 0.35초 잠근다
    game.choice = ['twin_heart', 'gluttony', 'chain_fuse']; frames(1); frames(22);
    if (els.mutModal.hidden || els.mutList.kids.some(b => b.disabled)) throw new Error('변이 카드가 떠서 풀려야 한다');
    hide(true); frames(10);
    if (!pm().hidden) throw new Error('변이 카드 위에 멈춤 덮개가 겹쳐 떴다');
    hide(false);
    const cards = els.mutList.kids;
    if (els.mutModal.hidden || cards.length !== 3 || !cards.every(b => b.disabled)) throw new Error('돌아오면 변이 카드를 다시 잠가야 한다');
    for (const f of cards[0].handlers.click) f({});
    if (!game.choice) throw new Error('다시 잠긴 카드가 눌렸다');
    frames(22); for (const f of els.mutList.kids[0].handlers.click) f({});
    if (game.choice || !els.mutModal.hidden || !pm().hidden) throw new Error('카드를 고르면 판이 다시 가야 한다');
    const t1 = game.t; frames(2);
    if (!(game.t > t1)) throw new Error('카드를 고른 뒤 판이 가지 않는다');
    // 끝 화면에서는 숨어도 덮개가 없다
    game.necro.hp = 0; frames(3);
    hide(true); frames(2);
    if (!pm().hidden || els.end.hidden) throw new Error('끝 화면에서 숨었는데 멈춤 덮개가 떴다');
    hide(false);
  } finally { S.step = realStep; doc.hidden = false; }
  console.log('뒤로 가면 멈춤: 숨은 동안 S.step 0번, 끌던 입력·키 끊김, 돌아온 직후 0.35초 잠금, 한 번 눌러 재개(dt 점프 없음), 변이 카드와 겹치지 않음, 제목·끝 화면은 그대로');
}

// ---- 폭발 손맛: 한 번에 여섯 이상 잡으면 "N KILL!!" 글자가 뜨고 사라진다. 판(규칙)은 같은 시드면 같다 ----
{
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  game.spawnT = 1e9; game.eliteIdx = 99; game.enemies = []; game.posts = []; game.postsTotal = 0;
  const texts = []; ctx.fillText = t => { texts.push(t); };
  const u = game.units[0]; u.main = 'armor'; u.inst = 85; u.x = game.necro.x; u.y = game.necro.y - 3;
  S.detonate(game);
  for (let i = 0; i < 7; i++) game.enemies.push({ elite: false, arch: 'beast', g: 1, x: u.x + (i - 3) * 0.4, y: u.y, hp: 9, maxHp: 9, dmg: 0, r: 0.42, cd: 99, face: 0, stun: 99, bleed: 0, bleedT: 0 });
  frames(10);
  if (!texts.includes('7 KILL!!')) throw new Error('일곱을 한 번에 잡으면 "7 KILL!!": ' + texts.filter(t => /KILL/.test(t)).join(','));
  frames(60); texts.length = 0; frames(10);   // 약 1.3초 뒤
  if (texts.some(t => /KILL/.test(t))) throw new Error('처치 수 글자는 1초 안에 사라져야 한다');
  delete ctx.fillText;
  console.log('폭발 손맛: 한 번에 7마리 → "7 KILL!!" 글자, 1초 안에 사라짐');
}

// ---- 소리 켜기/끄기: 제목 버튼, master GainNode, 따로 둔 저장 키(chimera-lab-sound-v1) ----
{
  const SK = 'chimera-lab-sound-v1', SAVE = 'chimera-lab-save-v1';
  const ON = '소리 켜짐', OFF = '소리 꺼짐';
  const masterOf = () => {
    const ac = acs[acs.length - 1], into = ac.edges.filter(e => e[1] === ac.destination);
    if (into.length !== 1 || !into[0][0].isGain) throw new Error('ac.destination에는 master GainNode 하나만 이어져야 한다: ' + into.length);
    return { ac, m: into[0][0] };
  };
  const routed = () => {
    const { ac, m } = masterOf(), n0 = ac.edges.length;
    game.events.push('boom'); frames(1);   // boom: tone 셋 + noise 하나
    const fresh = ac.edges.slice(n0);
    if (fresh.some(e => e[1] === ac.destination)) throw new Error('tone·noise가 ac.destination에 바로 이어졌다');
    const reach = n => { for (let i = 0; i < 4 && n; i++) { if (n === m) return true; n = n.outs[0]; } return false; };
    const srcs = [...new Set(fresh.filter(e => e[0].src).map(e => e[0]))];
    if (!srcs.some(s => s.src === 'osc') || !srcs.some(s => s.src === 'buf') || !srcs.every(reach)) throw new Error('tone과 noise가 모두 master를 지나야 한다');
  };
  const btn = () => els.soundBtn;
  store[SAVE] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  delete store[SK];
  freshSession(ls);
  if (btn().textContent !== ON || btn()['attr:aria-pressed'] !== 'true') throw new Error('처음 소리 버튼: ' + btn().textContent);
  const save0 = store[SAVE];
  fire('soundBtn', 'click', {});
  if (store[SK] !== '1' || btn().textContent !== OFF || btn()['attr:aria-pressed'] !== 'false') throw new Error('소리 끄기: ' + store[SK] + ' / ' + btn().textContent);
  if (store[SAVE] !== save0) throw new Error('소리 버튼이 게임 저장을 바꿨다');
  const n0 = acs.length;
  fire('startBtn', 'click', {}); frames(3);
  if (acs.length !== n0 + 1) throw new Error('판을 시작했는데 AudioContext가 없다');
  if (masterOf().m.gain.value !== 0) throw new Error('끈 채 시작했는데 master gain이 0이 아니다: ' + masterOf().m.gain.value);
  routed();
  // 다시 열면 꺼진 채
  freshSession(ls);
  if (btn().textContent !== OFF || btn()['attr:aria-pressed'] !== 'false') throw new Error('다시 열었는데 끈 상태가 남지 않았다: ' + btn().textContent);
  fire('startBtn', 'click', {}); frames(3);
  if (masterOf().m.gain.value !== 0) throw new Error('다시 연 판의 master gain이 0이 아니다');
  fire('soundBtn', 'click', {});
  if (masterOf().m.gain.value !== 1 || store[SK] !== '0' || btn().textContent !== ON) throw new Error('다시 켰는데 master gain이 돌아오지 않았다: ' + masterOf().m.gain.value);
  freshSession(ls);
  if (btn().textContent !== ON) throw new Error('켠 상태가 다시 열 때 남지 않았다');
  fire('startBtn', 'click', {}); frames(3);
  if (masterOf().m.gain.value !== 1) throw new Error('켠 채 연 판의 master gain: ' + masterOf().m.gain.value);
  routed();
  // localStorage가 막혀도 예외 없이 메모리로
  const lsX = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  freshSession(lsX);
  if (btn().textContent !== ON) throw new Error('저장소가 막힌 세션의 소리 버튼: ' + btn().textContent);
  fire('soundBtn', 'click', {});
  if (btn().textContent !== OFF) throw new Error('저장소가 막혀도 소리를 끌 수 있어야 한다');
  fire('startBtn', 'click', {}); frames(3);
  if (masterOf().m.gain.value !== 0) throw new Error('저장소가 막힌 세션: master gain 0이 아니다');
  fire('soundBtn', 'click', {});
  if (masterOf().m.gain.value !== 1) throw new Error('저장소가 막힌 세션: 다시 켜지 않았다');
  delete store[SK];
  console.log('소리 켜기/끄기: 제목 버튼으로 끄면 판의 master gain 0, 다시 열어도 유지, 켜면 1로 복구, tone·noise는 master를 지난다, 저장소가 막혀도 예외 없음');
}

// ---- 대장 종류(armor·beast·ranger)별 2D 구분: 셋을 함께 띄워 예외 없이 그리고, 종류마다 다른 색 키·표식·그리기 순서를 쓴다 ----
if (VIEW === '2d') {
  const R2 = win.ChimeraRender2D;
  if (!R2 || typeof R2.drawEnemy !== 'function' || typeof R2.bossLook !== 'function') throw new Error('2D 대장 확인 장치(window.ChimeraRender2D)가 없다');
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  game.spawnT = 1e9; game.eliteIdx = 99; game.posts = []; game.postsTotal = 0;
  game.necro.hp = game.necro.maxHp = 1e6;
  const d0 = game.district;
  const bs = [1, 2, 3].map(d => { game.district = d; const b = S.spawnBoss(game); b.x = game.necro.x + (d - 2) * 3; b.y = game.necro.y - 4; return b; });
  game.district = d0;
  if (bs.map(b => b.arch).join() !== 'armor,beast,ranger') throw new Error('2D 대장 종류: ' + bs.map(b => b.arch).join());
  frames(5);
  if (game.over) throw new Error('대장 셋을 그리는 동안 판이 끝났다: ' + game.over);
  const REC = ['fill', 'stroke', 'fillRect', 'arc', 'moveTo', 'lineTo', 'rect', 'closePath'], calls = [];
  for (const k of REC) ctx[k] = function () { calls.push(k); };
  const sig = e => { calls.length = 0; R2.drawEnemy(Object.assign({}, e, { x: 5, y: 5, hp: 1, maxHp: 1, stun: 0, flash: 0, mode: 'chase' }), 1000); return calls.join(','); };
  let sigs, looks, eliteSig, foeSig;
  const elite2 = Object.assign({}, bs[1], { boss: false }), foe2 = { elite: false, boss: false, arch: 'beast', g: 1, r: 0.42, face: 0 };
  try { sigs = bs.map(sig); eliteSig = sig(elite2); foeSig = sig(foe2); } finally { for (const k of REC) delete ctx[k]; }
  looks = bs.map(b => R2.bossLook(b));
  looks.forEach((l, i) => { if (!l || l.body !== bs[i].arch) throw new Error('2D 대장 색 키(' + bs[i].arch + '): ' + JSON.stringify(l)); });
  if (new Set(looks.map(l => l.mark)).size !== 3) throw new Error('2D 대장 표식이 종류마다 다르지 않다: ' + JSON.stringify(looks));
  if (new Set(sigs).size !== 3) throw new Error('2D 대장 셋의 그리기가 같다: ' + sigs.join(' | '));
  if (R2.bossLook(elite2) !== null || R2.bossLook(foe2) !== null) throw new Error('돌격조·일반 적에 대장 표식이 붙었다');
  if (eliteSig === sigs[1] || foeSig === sigs[1] || eliteSig === foeSig) throw new Error('2D에서 대장·돌격조·일반 적이 구분되지 않는다');
  console.log('2D 대장 구분: ' + looks.map((l, i) => bs[i].arch + '(' + l.body + '/' + l.accent + '/' + l.mark + ')').join(', ') + ', 돌격조·일반 적과 다른 그리기');
}

// ---- 2바퀴째(4구역 이상) 대장 보조 패턴 표시: 1~3구역은 기존 표시 그대로, 4구역 이상은 이름표·HUD에 보조 패턴 ----
{
  const R2 = win.ChimeraRender2D;
  if (!R2 || typeof R2.bossAssist !== 'function' || typeof R2.bossTag !== 'function') throw new Error('대장 보조 패턴 확인 장치(bossAssist/bossTag)가 없다');
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  game.spawnT = 1e9; game.eliteIdx = 99; game.posts = []; game.postsTotal = 0;
  game.necro.hp = game.necro.maxHp = 1e6;
  game.necro.x = S.W / 2; game.necro.y = S.H / 2; frames(1);
  const TAGS = /수비대 소환|연속 돌진/, texts = [];
  ctx.fillText = t => { texts.push(String(t)); };
  const shot = d => {
    game.enemies = []; game.district = d;
    const b = S.spawnBoss(game); b.x = game.necro.x + 2; b.y = game.necro.y - 3;
    texts.length = 0; frames(2);
    if (game.over) throw new Error(d + '구역 대장을 그리는 동안 판이 끝났다: ' + game.over);
    return { b, all: texts.slice(), tags: texts.filter(t => TAGS.test(t)) };
  };
  const out = {};
  try {
    for (const d of [1, 2, 3]) {
      const r = shot(d);
      if (r.b.lap !== 0 || R2.bossAssist(r.b).length || R2.bossTag(r.b) !== '' || r.tags.length) throw new Error(d + '구역(1바퀴째) 대장에 보조 패턴 표시가 붙었다: ' + JSON.stringify(r.tags));
      if (!r.all.includes(d + '구역')) throw new Error(d + '구역 HUD 표시가 바뀌었다: ' + r.all.join(','));
      out[d] = r.b.arch + ':없음';
    }
    const want = { 4: ['armor', '+수비대 소환', '연속 돌진'], 5: ['beast', '+수비대 소환', '연속 돌진'], 6: ['ranger', '+연속 돌진', '수비대 소환'] };
    for (const d of [4, 5, 6]) {
      const [arch, tag, not] = want[d], r = shot(d);
      if (r.b.arch !== arch || r.b.lap !== 1) throw new Error(d + '구역 대장: ' + r.b.arch + ' / lap ' + r.b.lap);
      if (R2.bossTag(r.b) !== tag) throw new Error(d + '구역 대장 보조 패턴 글: ' + R2.bossTag(r.b));
      const hits = r.tags.filter(t => t === tag).length;
      if (hits < 4 || r.tags.some(t => t.includes(not))) throw new Error(d + '구역(2바퀴째) 대장 이름표·HUD에 "' + tag + '"이 프레임마다 나와야 한다: ' + JSON.stringify(r.tags));
      if (!r.all.includes(d + '구역')) throw new Error(d + '구역 HUD 표시: ' + r.all.join(','));
      if (r.b.summon) { r.b.summonT = 0.5; frames(1); }   // summon telegraph branch
      if (r.b.chainMax) { r.b.chainLeft = 0; r.b.mode = 'warn'; r.b.modeT = 1; frames(1); }   // chain warn path for non-beast boss
      if (game.over) throw new Error(d + '구역 보조 패턴 연출 중 판이 끝났다');
      out[d] = arch + ':' + tag;
    }
  } finally { delete ctx.fillText; }
  console.log('대장 보조 패턴 표시: ' + Object.keys(out).map(d => d + '구역 ' + out[d]).join(', '));
}

// ---- 돌격조 패턴 구간의 화면: 맹수 연속 돌진·사수 escort 소환·갑주 돌진 동안 render.js(drawEnemy·bossAssist·bossTag·drawScreen)가 예외 없이 그린다 ----
// 대장 보조 패턴 이름표(bossTag)는 대장 전용으로 둔다: 돌격조는 이미 돌진 예고 길과 가장자리 '!'로 안내되어, 글을 더 붙이면 판이 붐빈다
{
  const R2 = win.ChimeraRender2D, C = S.CFG, EB = C.eliteBeast, ER = C.eliteRanger;
  if (!R2 || typeof R2.bossAssist !== 'function' || typeof R2.bossTag !== 'function' || typeof R2.drawEnemy !== 'function') throw new Error('돌격조 화면 확인 장치(window.ChimeraRender2D)가 없다');
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);
  game.spawnT = 1e9; game.posts = []; game.postsTotal = 0; game.enemies = []; game.units = []; game.souls = []; game.hearts = [];
  game.necro.hp = game.necro.maxHp = 1e6; game.necro.x = S.W / 2; game.necro.y = S.H / 2;
  for (let idx = 0; idx < 3; idx++) { game.eliteIdx = idx; game.t = C.eliteFirst + C.eliteEvery * idx - C.eliteWarn; frames(1); }
  game.eliteIdx = 99;
  const els3 = S.KINDS.map(k => game.enemies.find(e => e.elite && !e.boss && e.arch === k));
  if (els3.some(e => !e)) throw new Error('돌격조 셋(맹수·갑주·사수)이 화면 판에 나오지 않았다: ' + game.enemies.filter(e => e.elite).map(e => e.arch).join(','));
  const [eb, ea, er] = els3;
  for (const e of els3) e.hp = e.maxHp = 1e9;
  er.summonT = 0.3;
  const TAGS = /수비대 소환|연속 돌진/, texts = [], log = { beast: [], armor: [], ranger: [] }, prev = {};
  for (const e of els3) prev[e.arch] = e.mode;
  let escorts = 0, warnDrawn = 0;
  ctx.fillText = t => { texts.push(String(t)); };
  try {
    for (let i = 0; i < 60 * 20; i++) {
      const n0 = game.enemies.length;
      frames(1);
      if (game.over) throw new Error('돌격조 패턴 구간에서 판이 끝났다: ' + game.over);
      escorts += game.enemies.filter(x => x.escort).length > 0 && game.enemies.length > n0 ? game.enemies.length - n0 : 0;
      for (const e of els3) {
        if (e.mode !== prev[e.arch]) { log[e.arch].push({ mode: e.mode, rechargeT: e.rechargeT }); prev[e.arch] = e.mode; }
        if (e.mode === 'warn' || e.mode === 'aim') { R2.drawEnemy(e, now); warnDrawn++; }   // 돌진 예고 길 분기
        if (R2.bossAssist(e).length || R2.bossTag(e) !== '') throw new Error(e.arch + ' 돌격조에 대장 보조 패턴 표시가 붙었다: ' + R2.bossTag(e));
      }
      const bc = log.beast.filter(x => x.mode === 'chase').length, ac = log.armor.filter(x => x.mode === 'chase').length;
      if (bc >= 2 && ac >= 1 && escorts >= ER.n) break;
    }
  } finally { delete ctx.fillText; }
  const bch = log.beast.filter(x => x.mode === 'chase'), ach = log.armor.filter(x => x.mode === 'chase');
  if (bch.length < 2 || bch[0].rechargeT !== EB.gap || bch[1].rechargeT !== C.rechargeEvery) throw new Error('화면 판의 맹수 돌격조 연속 돌진: ' + JSON.stringify(log.beast));
  if (!ach.length || !ach.every(x => x.rechargeT === C.rechargeEvery)) throw new Error('화면 판의 갑주 돌격조: ' + JSON.stringify(log.armor));
  const esc = game.enemies.filter(x => x.escort);
  if (esc.length < ER.n || !esc.every(x => x.g === 1 && !x.elite && !x.boss)) throw new Error('화면 판의 사수 돌격조 소환: escort ' + esc.length);
  if (!warnDrawn) throw new Error('돌진 예고 그리기 분기를 타지 않았다');
  if (texts.some(t => TAGS.test(t))) throw new Error('돌격조 패턴 구간에 대장 보조 패턴 글이 그려졌다: ' + texts.filter(t => TAGS.test(t)).join(','));
  if (!texts.includes(game.district + '구역')) throw new Error('돌격조 패턴 구간의 HUD 표시가 바뀌었다');
  game.enemies = [];
  console.log('돌격조 패턴 화면: 맹수 연속 돌진(간격 ' + EB.gap + '초 뒤 ' + C.rechargeEvery + '초), 갑주 그대로, 사수 escort ' + esc.length + '마리 동안 render.js 예외 없음, bossAssist·bossTag는 돌격조에 붙지 않음(대장 전용)');
}

// ---- 합친 결과물(index.html·2d.html)에 돌격조 패턴(src/sim.js)과 src/render.js가 그대로 들어 있는지, 합친 sim이 실제로 돌격조 패턴을 쓰는지 ----
if (VIEW === '2d') {
  const simSrc = fs.readFileSync('src/sim.js', 'utf8'), renSrc = fs.readFileSync('src/render.js', 'utf8');
  for (const [name, page] of [['2d.html', h], ['index.html', fs.readFileSync('index.html', 'utf8')]]) {
    if (!page.includes(simSrc) || !page.includes(renSrc)) throw new Error(name + '이 src/sim.js·src/render.js와 다르다(python src/vendor/build_pages.py)');
    for (const k of ['CFG.eliteBeast', 'CFG.eliteRanger', 'bossChainOf', 'bossGapOf', 'summonTick', 'bossSummon', 'bossAssist', 'bossTag']) if (!page.includes(k)) throw new Error(name + '에 돌격조 패턴 코드 ' + k + '이(가) 없다');
    const simScript = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('eliteBeast'));
    if (!simScript) throw new Error(name + '에서 합친 sim 스크립트를 찾지 못했다');
    const w = {}; new Function('window', simScript)(w);
    const BS = w.ChimeraSim, BC = BS && BS.CFG;
    if (!BC || JSON.stringify(BC.eliteBeast) !== JSON.stringify(S.CFG.eliteBeast) || JSON.stringify(BC.eliteRanger) !== JSON.stringify(S.CFG.eliteRanger)) throw new Error(name + ': 합친 sim의 돌격조 설정이 src/sim.js와 다르다');
    const elite = idx => { const g = BS.newGame(4242, { district: 1 }); g.spawnT = 1e9; g.posts = []; g.postsTotal = 0; g.enemies = []; g.eliteIdx = idx; g.t = BC.eliteFirst + BC.eliteEvery * idx - BC.eliteWarn; BS.step(g, 1 / 60, { x: 0, y: 0 }); return g.enemies.find(e => e.elite); };
    const b = elite(0), a = elite(1), r = elite(2);
    if (!b || b.arch !== 'beast' || b.chainMax !== BC.eliteBeast.chain || b.chainGap !== BC.eliteBeast.gap || b.summon) throw new Error(name + ': 합친 sim의 맹수 돌격조 패턴');
    if (!a || a.arch !== 'armor' || a.chainMax !== 0 || a.summon) throw new Error(name + ': 합친 sim의 갑주 돌격조는 예전 그대로여야 한다');
    if (!r || r.arch !== 'ranger' || r.chainMax !== 0 || r.summon !== BC.eliteRanger || !(Math.abs(r.summonT - (BC.eliteRanger.every - 1 / 60)) <= 1e-6)) throw new Error(name + ': 합친 sim의 사수 돌격조 소환 패턴 (summonT ' + (r && r.summonT) + ', 기대 ' + (BC.eliteRanger.every - 1 / 60) + ')');
  }
  console.log('번들 반영: index.html·2d.html에 src/sim.js(돌격조 패턴)와 src/render.js가 그대로 들어 있고, 합친 sim이 맹수 연속 돌진·사수 소환·갑주 그대로를 쓴다');
}

// ---- 2D 바리케이드: render.js가 구역 1~3의 g.obstacles를 충돌 상자 그대로 그리고, 구역이 바뀌면 따라간다 ----
if (VIEW === '2d') {
  const E = 1e-9;
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  // freshSession이 render.js를 다시 띄워 window.ChimeraRender2D를 바꾼다: 새 세션의 것을 잡는다
  const R2 = win.ChimeraRender2D;
  if (!R2 || typeof R2.lastObstacles !== 'function') throw new Error('2D 바리케이드 확인 장치(lastObstacles)가 없다');
  const match = where => {
    if (win.ChimeraRender2D !== R2) throw new Error(where + ': 지금 세션의 2D 렌더러가 아니다');
    const want = game.obstacles || [], got = R2.lastObstacles();
    if (got.length !== want.length) throw new Error(where + ' 2D 바리케이드 개수 ' + got.length + ' / ' + want.length);
    want.forEach((b, i) => { const o = got[i]; if (!o || Math.abs(o.x - (b.x - b.hw)) > E || Math.abs(o.y - (b.y - b.hh)) > E || Math.abs(o.w - 2 * b.hw) > E || Math.abs(o.h - 2 * b.hh) > E) throw new Error(where + ' 2D 바리케이드 ' + i + '이 충돌 상자와 다르다: ' + JSON.stringify(o) + ' / ' + JSON.stringify(b)); });
    return got.length;
  };
  fire('startBtn', 'click', {}); frames(2);
  const seen = [], log = [];
  for (const d of [1, 2, 3]) {
    if (game.district !== d) throw new Error('2D 바리케이드 확인: ' + d + '구역이 아니다: ' + game.district);
    game.necro.hp = game.necro.maxHp = 1e6;
    const n = S.barricadesFor(d).length;
    if (!n || !Array.isArray(game.obstacles) || game.obstacles.length !== n) throw new Error(d + '구역 g.obstacles: ' + JSON.stringify(game.obstacles));
    frames(1); match(d + '구역');
    seen.push(JSON.stringify(R2.lastObstacles())); log.push(d + '구역 ' + n + '개');
    if (d < 3) { winNow(); for (const f of els.aceList.kids[0].handlers.click) f({}); frames(2); }
  }
  if (new Set(seen).size !== 3) throw new Error('구역이 바뀌었는데 2D 바리케이드가 그대로다');
  game.obstacles = []; frames(1);
  if (match('빈 목록') !== 0) throw new Error('g.obstacles가 비었는데 2D 바리케이드를 그렸다');
  delete game.obstacles; frames(1);
  if (R2.lastObstacles().length !== 0) throw new Error('g.obstacles가 없는데 2D 바리케이드를 그렸다');
  console.log('2D 바리케이드: ' + log.join(', ') + ' 충돌 상자 그대로, 구역 전환 때 갱신, 빈 목록·없음도 예외 없음');
}

// ---- 2D 소환 초소 표시: 1구역은 없음, 2구역 이상은 살아 있는 소환 초소 하나에만, 부수면 사라진다. 일반 초소와 그리기가 다르다 ----
if (VIEW === '2d') {
  const runD = d => {
    store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: d - 1, cur: d - 1, gold: 0, up: { hp: 0 } });
    freshSession(ls); fire('startBtn', 'click', {}); frames(2);
    if (game.district !== d) throw new Error('소환 초소 확인: ' + d + '구역이 아니다: ' + game.district);
    game.necro.hp = game.necro.maxHp = 1e6; game.spawnT = 1e9; game.eliteIdx = 99;
    return win.ChimeraRender2D;
  };
  let R2 = runD(1);
  if (!R2 || typeof R2.drawPost !== 'function' || typeof R2.lastPostMarks !== 'function') throw new Error('2D 소환 초소 확인 장치(drawPost/lastPostMarks)가 없다');
  frames(1);
  if (game.posts.some(p => p.summon) || R2.lastPostMarks().length) throw new Error('1구역에 2D 소환 초소 표시가 그려졌다');
  const log = ['1구역 0개'];
  for (const d of [2, 3]) {
    R2 = runD(d); frames(1);
    const sp = game.posts.filter(p => p.summon && !p.dead), mk = R2.lastPostMarks();
    if (sp.length !== 1 || mk.length !== 1 || mk[0].x !== sp[0].x || mk[0].y !== sp[0].y) throw new Error(d + '구역 2D 소환 표시는 소환 초소 하나에만: ' + JSON.stringify(mk));
    if (d === 2) {
      const REC = ['fill', 'stroke', 'fillRect', 'arc', 'moveTo', 'lineTo', 'closePath'], calls = [];
      const base = game.posts.find(p => !p.summon && !p.dead);
      const sig = o => { calls.length = 0; R2.drawPost(Object.assign({}, base, { summon: undefined, summonT: undefined }, o), game.necro, 1000); return calls.join(','); };
      let plain, summ, warnS, deadP, deadS;
      for (const k of REC) ctx[k] = function () { calls.push(k); };
      try {
        plain = sig({}); summ = sig({ summon: S.CFG.postSummon, summonT: 5 }); warnS = sig({ summon: S.CFG.postSummon, summonT: 0.5 });
        deadP = sig({ dead: true }); deadS = sig({ dead: true, summon: S.CFG.postSummon, summonT: 5 });
      } finally { for (const k of REC) delete ctx[k]; }
      if (plain === summ || summ.split(',').length <= plain.split(',').length) throw new Error('2D 소환 초소가 일반 초소와 다르게 그려지지 않는다');
      if (warnS === summ) throw new Error('2D 소환 직전 예고 고리가 그려지지 않는다');
      if (deadP !== deadS) throw new Error('부서진 소환 초소가 부서진 일반 초소와 다르게 그려졌다');
      log.push('일반 ' + plain.split(',').length + '번 / 소환 ' + summ.split(',').length + '번 / 예고 ' + warnS.split(',').length + '번 그리기');
    }
    sp[0].dead = true; frames(1);
    if (game.over) throw new Error(d + '구역 소환 초소 확인 중 판이 끝났다: ' + game.over);
    if (R2.lastPostMarks().length) throw new Error(d + '구역: 부순 소환 초소의 2D 표시가 남았다');
    log.push(d + '구역 1개 → 파괴 후 0개');
  }
  const r3 = fs.readFileSync('src/render3d.js', 'utf8'), ix = fs.readFileSync('index.html', 'utf8');
  if (!r3.split('__ASSET_V__').every(part => ix.includes(part))) throw new Error('index.html이 src/render3d.js와 다르다(node build.cjs)');
  for (const k of ['drawSummonMark', 'lastPostMarks']) if (!h.includes(k) || !ix.includes(k)) throw new Error('번들에 소환 초소 2D 표시 코드 ' + k + '이(가) 없다');
  if (!ix.includes('_postMarks')) throw new Error('index.html에 3D 소환 초소 표시 코드가 없다');
  console.log('2D 소환 초소 표시: ' + log.join(', ') + ', 번들(index.html·2d.html) 반영');
}

// ---- In-play guidance: district 1 goal banner, one tip per first moment, seen tips kept under their own storage key ----
if (VIEW === '2d') {
  const TK = 'chimera-lab-tips-v1', SK = 'chimera-lab-save-v1', GOAL = '1구역: 봉쇄 초소 3개를 무너뜨려라';
  const ALL = ['absorb', 'frenzy', 'ripe', 'boom', 'rebirth', 'postdown'];
  const B = () => els.goalBanner, T = () => els.tipLine;
  let shown = [], texts = {}, prev = null;
  const watch = n => { for (let i = 0; i < n; i++) { frames(1); const k = T().hidden ? null : T()['attr:data-tip']; if (k && k !== prev) { shown.push(k); texts[k] = T().textContent; } prev = k; } };
  const begin = cur => {
    store[SK] = JSON.stringify({ v: 1, best: cur, cur, gold: 0, up: { hp: 0 } });
    freshSession(ls);
    if (!B() || !T() || !B().hidden || !T().hidden) throw new Error('제목 화면에 판 안 안내가 보인다');
    fire('startBtn', 'click', {});
    game.necro.hp = game.necro.maxHp = 1e6; game.spawnT = 1e9; game.eliteIdx = 99; game.enemies = [];
    shown = []; texts = {}; prev = null;
  };
  const ev = (e, n) => { game.events.push(e); watch(n || 230); };
  const ripe = () => { const u = game.units[0]; u.state = 'ok'; u.inst = 90; watch(1); u.inst = 0; };
  delete store[TK];
  begin(0);
  if (game.district !== 1 || B().hidden || B().textContent !== GOAL) throw new Error('1구역 시작 목표 배너: ' + B().hidden + ' / ' + B().textContent);
  watch(60);
  if (B().hidden) throw new Error('목표 배너가 너무 일찍 사라졌다');
  watch(200);
  if (!B().hidden) throw new Error('목표 배너가 저절로 사라지지 않았다');
  if (shown.length || TK in store) throw new Error('아무 일도 없었는데 안내가 떴다: ' + shown.join());
  ev('absorb'); ev('absorb'); ev('purify');
  game.events.push('frenzy'); ripe(); watch(460);
  ev('boom'); ev('boomweak'); ev('rebirth'); ev('postdown'); ev('boom');
  ripe(); watch(230);
  if (shown.join() !== ALL.join()) throw new Error('처음 겪는 순간마다 한 번씩 떠야 한다: ' + shown.join());
  if (ALL.some(k => !texts[k]) || new Set(ALL.map(k => texts[k])).size !== ALL.length) throw new Error('순간마다 다른 한 줄 안내: ' + JSON.stringify(texts));
  if (!T().hidden) throw new Error('안내가 저절로 사라지지 않았다');
  const saved = JSON.parse(store[TK] || '[]');
  if (saved.slice().sort().join() !== ALL.slice().sort().join()) throw new Error('본 안내 저장(' + TK + '): ' + store[TK]);
  if ('tips' in JSON.parse(store[SK])) throw new Error('안내 기록이 게임 저장에 섞였다');
  // already seen (stored): a new session shows the banner again but none of the tips
  begin(0);
  if (B().hidden || B().textContent !== GOAL) throw new Error('다시 시작한 1구역에도 목표 배너가 떠야 한다');
  for (const e of ['absorb', 'frenzy', 'boom', 'rebirth', 'postdown']) game.events.push(e);
  ripe(); watch(700);
  if (shown.length) throw new Error('이미 본 안내가 다시 떴다: ' + shown.join());
  // empty storage: tips show again once; district 2 has no district 1 banner
  delete store[TK];
  begin(1);
  if (game.district !== 2 || !B().hidden) throw new Error('2구역에는 1구역 목표 배너가 없다: ' + game.district + ' / ' + B().textContent);
  ev('boom'); ev('boom');
  if (shown.join() !== 'boom' || JSON.parse(store[TK]).join() !== 'boom') throw new Error('저장이 비면 안내가 다시 한 번: ' + shown.join() + ' / ' + store[TK]);
  // real post destruction opens the mutation pick: guidance waits under it (no timer, no save) and shows after the pick
  store[TK] = JSON.stringify(ALL.filter(k => k !== 'postdown'));
  begin(0);
  {
    const p = game.posts.find(q => !q.dead), u = game.units[0];
    u.state = 'ok'; u.down = 0; u.x = p.x; u.y = p.y + 0.3; u.inst = 95;
    S.detonate(game);
    for (let i = 0; i < 120 && (!game.choice || els.mutModal.hidden); i++) watch(1);
    if (!game.choice || game.postsDown !== 1 || els.mutModal.hidden) throw new Error('실제 초소 파괴로 변이 선택이 떠야 한다: ' + game.postsDown + ' / ' + JSON.stringify(game.choice));
    watch(240);
    if (shown.length || !T().hidden || !B().hidden || JSON.parse(store[TK]).includes('postdown')) throw new Error('변이 선택이 열린 동안 안내는 숨고 저장되지 않아야 한다: ' + shown.join() + ' / ' + store[TK]);
    pickCards(); watch(2);
    if (shown.join() !== 'postdown' || T().hidden || !JSON.parse(store[TK]).includes('postdown')) throw new Error('변이 선택을 닫은 뒤 postdown 안내가 떠야 한다: ' + shown.join() + ' / ' + store[TK]);
    if (B().hidden) throw new Error('변이 선택에 가려진 목표 배너가 남은 시간만큼 다시 보여야 한다');
    watch(240);
    if (!T().hidden || !B().hidden) throw new Error('변이 선택 뒤 안내·배너가 저절로 사라지지 않았다');
  }
  console.log('판 안 안내: 1구역 목표 배너 "' + GOAL + '" 표시 후 사라짐, 첫 순간 ' + ALL.join('·') + ' 한 번씩, ' + TK + '에 기록해 다시 뜨지 않음, 비우면 다시 한 번, 실제 초소 파괴의 변이 선택 동안 멈췄다가 닫은 뒤 postdown 표시·저장');
}

// ---- 1구역 막 전환 배너: 실제 초소 함락(g.alarm / 'alarm') → #goalBanner에 '1/3 초소 함락, 경보!' 등, 변이 선택 동안 숨었다가 뜨고 저절로 사라진다(2D·3D) ----
if (VIEW === '2d' || VIEW === '3d') {
  const SK = 'chimera-lab-save-v1', TK = 'chimera-lab-tips-v1', B = () => els.goalBanner;
  store[TK] = JSON.stringify(['absorb', 'frenzy', 'ripe', 'boom', 'rebirth', 'postdown']);
  store[SK] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls); fire('startBtn', 'click', {}); frames(2);
  const R2 = win.ChimeraRender2D;
  if (!R2 || typeof R2.banner !== 'function') throw new Error('막 전환 배너 확인 장치(ChimeraRender2D.banner)가 없다');
  game.necro.hp = game.necro.maxHp = 1e6; game.spawnT = 1e9; game.enemies = [];
  if (game.district !== 1 || B().hidden || B()['attr:data-kind'] !== 'goal') throw new Error('막 전환 확인: 1구역 목표 배너로 시작해야 한다');
  frames(240);
  if (!B().hidden) throw new Error('막 전환 확인: 목표 배너가 사라지지 않았다');
  const breakPost = () => {
    game.choice = null; game.enemies = []; game.spawnT = 1e9;
    game.souls.push({ x: game.necro.x, y: game.necro.y, type: 'armor', q: 1, ttl: 5 }); frames(1);
    const p = game.posts.find(q => !q.dead), u = game.units[game.units.length - 1], before = game.postsDown;
    if (!u) throw new Error('막 전환 확인: 폭탄 키메라를 되살리지 못했다');
    u.state = 'ok'; u.down = 0; u.x = p.x; u.y = p.y + 0.3; u.inst = 95;
    if (!S.detonate(game)) throw new Error('막 전환 확인: 터뜨리지 못했다');
    for (let i = 0; i < 120 && game.postsDown === before; i++) frames(1);
    if (game.postsDown !== before + 1 || !game.alarm) throw new Error('막 전환 확인: 실제 초소 함락이 일어나지 않았다 ' + game.postsDown);
    frames(2);
    if (game.choice && !B().hidden) throw new Error('변이 선택 동안 막 전환 배너가 보인다');
    pickCards(); frames(1);
  };
  const shows = (want, where) => {
    const s = R2.banner();
    if (B().hidden || B().textContent !== want || B()['attr:data-kind'] !== 'alarm' || s.hidden || !(s.t > 0)) throw new Error(where + ' 막 전환 배너: ' + B().hidden + ' / ' + B().textContent + ' / ' + B()['attr:data-kind'] + ' (기대 ' + want + ')');
  };
  const fades = where => { frames(200); if (!B().hidden) throw new Error(where + ' 막 전환 배너가 저절로 사라지지 않았다'); };
  breakPost(); shows('1/3 초소 함락, 경보! · 2막 증원이 온다', '첫 초소'); fades('첫 초소');
  breakPost(); shows('2/3 초소 함락, 경보! · 돌격조 접근', '둘째 초소');
  frames(120);
  if (game.eliteIdx !== 1) throw new Error('막 전환 확인: 당긴 돌격조가 나오지 않았다 ' + game.eliteIdx);
  fades('둘째 초소');
  breakPost(); shows('3/3 초소 함락 · 대장 출현!', '마지막 초소');
  if (!game.boss) throw new Error('막 전환 확인: 마지막 초소 뒤 대장이 없다');
  fades('마지막 초소');
  // same-step double fall path (sim alarm.elite === 'now'): the banner names both
  game.alarm = Object.assign({}, game.alarm, { elite: 'now' }); game.events.push('alarm'); frames(1);
  shows('3/3 초소 함락 · 돌격조와 대장 출현!', '동시 함락');
  fades('동시 함락');
  // district 2 has no acts: an 'alarm' event shows nothing
  store[SK] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: 0, up: { hp: 0 } });
  freshSession(ls); fire('startBtn', 'click', {}); frames(2);
  game.alarm = { wave: 1, act: 2, acts: 3, postsDown: 1, postsTotal: game.postsTotal, x: 1, y: 1, t: 0, foes: 3, last: false, elite: null };
  game.events.push('alarm'); frames(1);
  if (game.district !== 2 || !B().hidden) throw new Error('2구역에 막 전환 배너가 떴다: ' + B().textContent);
  console.log('1구역 막 전환 배너(' + VIEW + '): 실제 초소 함락마다 #goalBanner(data-kind=alarm) 1/3·2/3(돌격조 접근)·3/3(대장 출현), 동시 함락 문구, 변이 선택 동안 숨김, 저절로 사라짐, 2구역 없음');
}

// ---- 대장 등장 컷(이동→머묾→복귀), 대장 이름표·큰 체력바, 빈 저장소에서 purify 선행 뒤 absorb 안내(N1 리뷰 P2) ----
if (VIEW === '2d' || VIEW === '3d') {
  const SK = 'chimera-lab-save-v1', TK = 'chimera-lab-tips-v1';
  const fresh = () => {
    store[SK] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
    freshSession(ls); fire('startBtn', 'click', {}); frames(2);
    game.spawnT = 1e9; game.eliteIdx = 99; game.posts = []; game.postsTotal = 0; game.enemies = []; game.units = []; game.souls = []; game.hearts = [];
    game.necro.hp = game.necro.maxHp = 1e6; game.necro.x = 4; game.necro.y = S.H - 4; frames(1);
    return win.ChimeraRender2D;
  };
  let R2 = fresh();
  if (!R2 || typeof R2.bossCut !== 'function' || typeof R2.camFocus !== 'function') throw new Error('대장 등장 컷 확인 장치(bossCut/camFocus)가 없다');
  const HUD = () => els.bossHud, near = (a, b) => Math.abs(a - b) < 1e-6;
  const focusIsNecro = where => {
    const f = R2.camFocus();
    if (!f || f.k !== 0 || !near(f.x, game.necro.x) || !near(f.y, game.necro.y)) throw new Error(where + ': 카메라가 네크로맨서를 따라가지 않는다 ' + JSON.stringify(f));
    if (VIEW === '3d' && (!vOpts.focus || !near(vOpts.focus.x, game.necro.x) || !near(vOpts.focus.y, game.necro.y))) throw new Error(where + ': 3D 카메라 초점이 네크로맨서가 아니다 ' + JSON.stringify(vOpts.focus));
  };
  if (R2.bossCut() || !HUD() || !HUD().hidden) throw new Error('대장이 없는데 등장 컷이나 대장 HUD가 있다');
  focusIsNecro('대장 전');
  const strips = [];
  ctx.fillRect = function (x, y, w, h) { if (y === 11 && h === 7) strips.push(w); };
  let b = S.spawnBoss(game);
  frames(1);
  const c0 = R2.bossCut();
  if (!c0 || c0.phase !== 'pan' || HUD().hidden) throw new Error('대장이 나왔는데 등장 컷·대장 HUD가 시작되지 않았다: ' + JSON.stringify(c0));
  if (!(Math.hypot(b.x - game.necro.x, b.y - game.necro.y) > 3)) throw new Error('대장이 너무 가까워 카메라 이동을 확인할 수 없다');
  const phases = [], ks = [];
  for (let i = 0; i < 400 && R2.bossCut(); i++) {
    const c = R2.bossCut(), f = R2.camFocus();
    if (phases[phases.length - 1] !== c.phase) phases.push(c.phase);
    ks.push(c.k);
    const wx = game.necro.x + (b.x - game.necro.x) * c.k, wy = game.necro.y + (b.y - game.necro.y) * c.k;
    if (!near(f.x, wx) || !near(f.y, wy)) throw new Error('카메라 초점이 네크로맨서와 대장 사이가 아니다: ' + JSON.stringify([f, c]));
    if (c.phase === 'hold' && (!near(f.x, b.x) || !near(f.y, b.y))) throw new Error('머무는 동안 카메라가 대장을 비추지 않는다');
    if (VIEW === '3d' && (!vOpts.focus || !near(vOpts.focus.x, f.x) || !near(vOpts.focus.y, f.y))) throw new Error('3D 판이 대장 등장 컷 초점을 받지 않았다: ' + JSON.stringify(vOpts.focus));
    frames(1);
  }
  const kMax = Math.max(...ks), iMax = ks.indexOf(kMax);
  if (phases.join() !== 'pan,hold,back' || kMax !== 1 || R2.bossCut()) throw new Error('대장 등장 컷은 이동→머묾→복귀여야 한다: ' + phases.join() + ' / 최대 ' + kMax);
  if (!(ks[0] < 0.2 && ks[ks.length - 1] < 0.2 && ks.slice(0, iMax).every((k, i) => i === 0 || k >= ks[i - 1]))) throw new Error('카메라가 부드럽게 갔다 돌아오지 않는다: ' + ks[0] + ' → ' + ks[ks.length - 1]);
  focusIsNecro('등장 컷 뒤');
  if (HUD().hidden) throw new Error('등장 컷이 끝나도 대장이 살아 있으면 대장 HUD가 남아야 한다');
  delete ctx.fillRect;
  if (strips.length) throw new Error('예전 상단 7px 대장 체력 띠가 아직 그려진다: ' + strips.length + '번');
  if (els.bossTitle.textContent !== '1구역 대장' || els.bossName.textContent !== '방패 진압 대장') throw new Error('대장 이름표: ' + els.bossTitle.textContent + ' / ' + els.bossName.textContent);
  const hpOk = where => {
    const pct = Math.round(Math.max(0, Math.min(1, b.hp / b.maxHp)) * 100), txt = Math.ceil(b.hp) + ' / ' + Math.ceil(b.maxHp) + ' · ' + pct + '%';
    if (HUD().hidden || els.bossBar['attr:aria-valuenow'] !== String(pct) || els.bossHpText.textContent !== txt) throw new Error(where + ' 대장 체력바: ' + els.bossBar['attr:aria-valuenow'] + ' / ' + els.bossHpText.textContent + ' (기대 ' + txt + ')');
    return pct;
  };
  const p0 = hpOk('처음');
  b.hp = b.maxHp * 0.5; frames(1); const p1 = hpOk('절반');
  b.hp = b.maxHp * 0.2; frames(1); const p2 = hpOk('20%');
  if (!(p0 > p1 && p1 > p2)) throw new Error('대장 체력바가 HP를 따라 줄지 않는다: ' + [p0, p1, p2].join());
  b.dead = true; frames(1);
  if (!HUD().hidden || R2.bossCut()) throw new Error('대장이 쓰러졌는데 대장 HUD가 남았다');
  // the boss vanishes mid-cut
  b = S.spawnBoss(game); frames(10);
  if (!R2.bossCut() || HUD().hidden) throw new Error('두 번째 대장 등장 컷이 시작되지 않았다');
  game.enemies = game.enemies.filter(e => e !== b); frames(1);
  if (R2.bossCut() || !HUD().hidden) throw new Error('대장이 사라졌는데 등장 컷·대장 HUD가 남았다');
  focusIsNecro('대장이 사라진 뒤');
  // restart mid-cut
  b = S.spawnBoss(game); frames(10);
  if (!R2.bossCut()) throw new Error('재시작 확인용 등장 컷이 시작되지 않았다');
  fire('startBtn', 'click', {}); frames(1);
  if (R2.bossCut() || !HUD().hidden || game.boss) throw new Error('판을 다시 시작했는데 등장 컷·대장 HUD가 남았다');
  focusIsNecro('재시작 뒤');
  // game over mid-cut
  R2 = fresh(); b = S.spawnBoss(game); frames(10);
  if (!R2.bossCut() || HUD().hidden) throw new Error('게임 오버 확인용 등장 컷이 시작되지 않았다');
  game.necro.hp = 0; frames(3);
  if (game.over !== 'lose' || els.end.hidden || R2.bossCut() || !HUD().hidden) throw new Error('게임 오버인데 등장 컷·대장 HUD가 남았다: ' + game.over);
  focusIsNecro('게임 오버 뒤');
  // N1 review P2: empty tip storage, purify first must not show or save the absorb tip; the first real absorb shows it once
  delete store[TK]; R2 = fresh();
  const T = els.tipLine, seen = []; let prev = null, absorbText = '';
  const watch = n => { for (let i = 0; i < n; i++) { frames(1); const k = T.hidden ? null : T['attr:data-tip']; if (k && k !== prev) { seen.push(k); if (k === 'absorb') absorbText = T.textContent; } prev = k; } };
  const absorbSaved = () => { try { return JSON.parse(store[TK] || '[]').includes('absorb'); } catch (e) { return false; } };
  game.events.push('purify'); watch(240);
  if (seen.length || !T.hidden || absorbSaved()) throw new Error('빈 저장소에서 정혈 혼(purify)이 absorb 안내를 띄우거나 기록했다: ' + seen.join() + ' / ' + store[TK]);
  game.events.push('absorb'); watch(240);
  if (seen.join() !== 'absorb' || !absorbSaved() || absorbText !== '혼을 먹이면 불안정도가 찬다') throw new Error('purify 뒤 첫 absorb에 안내가 한 번 떠야 한다: ' + seen.join() + ' / ' + store[TK]);
  game.events.push('purify'); game.events.push('absorb'); watch(240);
  if (seen.join() !== 'absorb') throw new Error('absorb 안내가 두 번 떴다: ' + seen.join());
  console.log('대장 등장 컷(' + VIEW + '): ' + phases.join('→') + ' ' + ks.length + '프레임, 머무는 동안 대장 비춤, 끝나면 네크로맨서 추적' + (VIEW === '3d' ? '(3D opts.focus 연동)' : '') + ', 이름표 "' + els.bossTitle.textContent + ' ' + els.bossName.textContent + '", 큰 체력바 ' + [p0, p1, p2].join('→') + '%, 7px 띠 없음, 대장 사라짐·재시작·게임 오버에 초기화; purify 선행 시 absorb 안내 없음 → 첫 absorb 1회');
}

// ---- Boss phase effects (render.js, every view path): HP bar phase ticks from boss.phaseAt, roar while roarT > 0, weak point only while weak && stun > 0; phaseless boss / foes unchanged ----
{
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls); fire('startBtn', 'click', {}); frames(2);
  const R2 = win.ChimeraRender2D, AT = S.CFG.bossPhase.at, ROAR = S.CFG.bossPhase.roar;
  const WEAK = '\uC57D\uC810 \uB178\uCD9C \u00B7 \uD3C9\uD0C0 \uAE30\uD68C', ROAR_TXT = '\uD3EC\uD6A8!';
  if (!R2 || ['bossTicks', 'bossFx', 'lastBossFx', 'drawEnemy'].some(k => typeof R2[k] !== 'function')) throw new Error('boss phase fx hooks (bossTicks/bossFx/lastBossFx) missing');
  game.spawnT = 1e9; game.eliteIdx = 99; game.posts = []; game.postsTotal = 0; game.enemies = []; game.units = [];
  game.necro.hp = game.necro.maxHp = 1e6; game.necro.x = S.W / 2; game.necro.y = S.H / 2;
  const HUD = els.bossHud, tickAttrs = () => els.bossTicks.kids.map(k => k['attr:data-at'] + ':' + k['attr:data-passed']).join();
  const one = where => { const l = R2.lastBossFx(); if (l.length !== 1) throw new Error(where + ': expected one drawn boss, got ' + JSON.stringify(l)); return l[0]; };
  const realStep = S.step; S.step = () => {};   // hold the board still so each frame shows exactly the state set here
  const log = [];
  try {
    const b = S.spawnBoss(game); b.x = game.necro.x + 2; b.y = game.necro.y - 3;
    frames(2);
    let fx = one('calm');
    if (!b.phases || JSON.stringify(fx.ticks) !== JSON.stringify(AT) || fx.roar || fx.weak) throw new Error('phased boss calm fx: ' + JSON.stringify(fx));
    if (HUD.hidden || HUD['attr:data-phased'] !== '1' || HUD['attr:data-state'] !== '' || !els.bossState.hidden || tickAttrs() !== AT.map(t => Math.round(t * 100) + ':0').join()) throw new Error('boss HUD phase ticks (calm): ' + tickAttrs() + ' / ' + HUD['attr:data-state']);
    log.push('ticks ' + tickAttrs());
    b.hp = b.maxHp * 0.5; b.phase = 2; b.roars = 1; b.roarT = ROAR; game.events.push('roar'); frames(2);
    fx = one('roar');
    if (!fx.roar || fx.weak || fx.phase !== 2 || HUD['attr:data-state'] !== 'roar' || els.bossState.hidden || !els.bossState.textContent.startsWith(ROAR_TXT) || !els.bossState.textContent.includes('2')) throw new Error('roar state: ' + JSON.stringify(fx) + ' / ' + els.bossState.textContent);
    if (tickAttrs() !== '66:1,33:0') throw new Error('passed phase tick not marked at half hp: ' + tickAttrs());
    if (!(R2.fx().shake > 0)) throw new Error('roar event did not shake the screen');
    log.push('roar "' + els.bossState.textContent + '" ' + tickAttrs());
    b.roarT = 0; frames(1);
    fx = one('roar end');
    if (fx.roar || HUD['attr:data-state'] !== '' || !els.bossState.hidden) throw new Error('roar display stayed after roarT ran out');
    b.stun = 1.5; frames(1);   // stun without the weak flag (blast / armor block): no weak point
    fx = one('plain stun');
    if (fx.weak || HUD['attr:data-state'] !== '') throw new Error('weak point shown on a stun without the weak flag');
    b.weak = true; frames(1);
    fx = one('weak');
    if (!fx.weak || fx.roar || HUD['attr:data-state'] !== 'weak' || els.bossState.hidden || els.bossState.textContent !== WEAK) throw new Error('weak point state: ' + JSON.stringify(fx) + ' / ' + els.bossState.textContent);
    log.push('weak "' + els.bossState.textContent + '"');
    // the real sim ends the barricade stun and clears weak: the weak point display goes with it
    S.step = realStep; b.stun = 0.03;
    for (let i = 0; i < 10 && b.stun > 0; i++) frames(1);
    S.step = () => {};
    fx = one('stun over');
    if (b.weak || fx.weak || HUD['attr:data-state'] !== '' || !els.bossState.hidden) throw new Error('weak point stayed after the stun ended: ' + JSON.stringify(fx));
    // direct draw: roar and weak add strokes, phase ticks add one rect each
    const count = (k, e) => { let n = 0; ctx[k] = function () { n++; }; try { R2.drawEnemy(e, 1000); } finally { delete ctx[k]; } return n; };
    const base = Object.assign({}, b, { roarT: 0, weak: false, stun: 0, flash: 0, mode: 'chase', hp: b.maxHp * 0.5 });
    const aCalm = count('arc', base), aRoar = count('arc', Object.assign({}, base, { roarT: ROAR * 0.5 })), aWeak = count('arc', Object.assign({}, base, { weak: true, stun: 1 }));
    if (!(aRoar > aCalm && aWeak > aCalm)) throw new Error('roar / weak point drew nothing extra: ' + [aCalm, aRoar, aWeak].join());
    const rTicks = count('fillRect', base) - count('fillRect', Object.assign({}, base, { phases: false, phaseAt: null }));
    if (rTicks !== AT.length) throw new Error('boss bar phase ticks drawn: ' + rTicks);
    if (!R2.bossFx(Object.assign({}, base, { weak: true, stun: 1 })).weak || R2.bossFx(Object.assign({}, base, { weak: true, stun: 0 })).weak) throw new Error('bossFx weak needs weak && stun > 0');
    // phaseless boss (district 2): no ticks, no roar/weak, quarter-tick HUD as before
    game.enemies = []; game.district = 2; const nb = S.spawnBoss(game); game.district = 1; nb.x = game.necro.x + 2; nb.y = game.necro.y - 3;
    frames(2);
    fx = one('phaseless');
    if (nb.phases || fx.ticks.length || fx.roar || fx.weak || HUD['attr:data-phased'] !== '0' || els.bossTicks.kids.length || HUD['attr:data-state'] !== '') throw new Error('phaseless boss got phase fx: ' + JSON.stringify(fx));
    nb.stun = 1; frames(1);
    if (one('phaseless stun').weak) throw new Error('phaseless boss showed a weak point');
    nb.stun = 0;
    const foe = { elite: false, boss: false, arch: 'beast', g: 1, x: 5, y: 5, r: 0.42, face: 0, hp: 1, maxHp: 2, stun: 1, weak: true, roarT: 1, flash: 0 };
    if (R2.bossFx(foe) !== null || R2.bossTicks(foe).length) throw new Error('plain foe got boss phase fx');
    R2.drawEnemy(foe, 1000); R2.drawEnemy(Object.assign({}, foe, { elite: true, mode: 'chase' }), 1000);
    if (game.over) throw new Error('board ended during the boss phase fx check: ' + game.over);
    log.push('phaseless ok');
  } finally { S.step = realStep; }
  console.log('boss phase fx (' + VIEW + '): ' + log.join(', '));
}

// ---- 승리 연출(N3): 대장 처치 → 결과 화면은 바로 뜨지 않고 강화된 번쩍임·멈춤·흔들림, 느린 화면, '1구역 정복' 문구 → 1~2초 뒤 showEnd 1회.
// 연출 중에는 판이 멈추고 지지 않는다. 지면 지연 없이 바로 결과 화면. 재시작하면 연출 상태가 깨끗이 지워진다 ----
{
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  freshSession(ls); fire('startBtn', 'click', {}); frames(2);
  const R2 = win.ChimeraRender2D, VB = els.victoryBanner;
  if (!R2 || typeof R2.victory !== 'function' || typeof R2.endCount !== 'function' || typeof R2.fx !== 'function' || !VB) throw new Error('승리 연출 확인 장치(victory/endCount/fx, #victoryBanner)가 없다');
  if (R2.victory() !== null || !VB.hidden) throw new Error('판 시작에 승리 연출이 켜져 있다');
  const calm = () => { game.spawnT = 1e9; game.eliteIdx = 99; game.necro.hp = game.necro.maxHp = 1e6; };
  const killBoss = () => {
    calm();
    for (const p of game.posts) p.dead = true;
    game.postsDown = game.postsTotal;
    const b = S.spawnBoss(game); frames(3);
    b.hp = 0.5; b.bleed = 100; b.bleedT = 1;
    for (let i = 0; i < 120 && game.over !== 'win'; i++) frames(1);
    if (game.over !== 'win') throw new Error('승리 연출 확인: 대장을 잡지 못했다: ' + game.over);
  };
  calm();
  const e0 = R2.endCount();
  killBoss();
  // (a) 처치 직후: 결과 화면은 닫혀 있고, 문구와 강화된 연출이 켜져 있다
  const v0 = R2.victory();
  if (!v0 || els.end.hidden !== true || R2.endCount() !== e0) throw new Error('대장 처치 직후 결과 화면이 바로 열렸다: ' + JSON.stringify(v0));
  if (VB.hidden || VB.textContent !== '1구역 정복' || !v0.banner || VB.className !== 'hudMsg conquer') throw new Error("'1구역 정복' 문구가 보이지 않는다: " + VB.textContent + ' / ' + VB.className);
  if (!(v0.flash > 0.14 && v0.hitstop > 0.1 && v0.shake > 1 && v0.slow > 0 && v0.slow < 1)) throw new Error('강화된 flash·hitstop·shake와 느린 화면이 아니다: ' + JSON.stringify(v0));
  if (!els.goalBanner.hidden || !els.tipLine.hidden || !els.bossHud.hidden || !els.mutModal.hidden || R2.bossCut()) throw new Error('승리 연출에 대장 HUD·등장 컷·안내가 겹쳐 남았다');
  if (VIEW === '3d' && !(vOpts && vOpts.title === false && vOpts.shake > 1)) throw new Error('3D 판이 승리 연출의 흔들림을 받지 않았다: ' + JSON.stringify(vOpts && vOpts.shake));
  // (b) 연출 중: 맞아도(체력 0, lose로 덮어써도) 지지 않고, 판(S.step)은 멈추고, 그리기는 이어진다
  const t0 = game.t, r0 = vcalls.render;
  game.necro.hp = 0; game.over = 'lose';
  frames(30);
  const v1 = R2.victory();
  if (!v1 || game.over !== 'win' || !(game.necro.hp > 0) || els.end.hidden !== true || R2.endCount() !== e0) throw new Error('승리 연출 중에 패배로 바뀌었거나 결과 화면이 열렸다: ' + game.over + ' / ' + game.necro.hp);
  if (game.t !== t0) throw new Error('승리 연출 중에 판(S.step)이 진행됐다: ' + t0 + ' → ' + game.t);
  if (Math.abs(v1.t - 30 * 0.0167) > 0.01 || !(v1.flash > 0.3) || VB.hidden) throw new Error('연출은 실제 시간으로 흐르고 번쩍임은 느리게 줄어야 한다: ' + JSON.stringify(v1));
  if (VIEW === '3d' && vcalls.render - r0 !== 30) throw new Error('승리 연출 중 3D 판 그리기가 멈췄다: ' + (vcalls.render - r0));
  // (c) 1~2초 뒤 승리 결과 화면이 정확히 한 번
  let n = 30;
  for (; n < 300 && els.end.hidden !== false; n++) frames(1);
  const secs = n * 16.7 / 1000;
  if (els.end.hidden !== false || R2.endCount() !== e0 + 1 || !(secs >= 1 && secs <= 2)) throw new Error('승리 결과 화면은 1~2초 뒤 한 번: ' + secs.toFixed(2) + '초, ' + (R2.endCount() - e0) + '번');
  if (els.endTitle.textContent !== '1구역 정복' || R2.victory() !== null || !VB.hidden || VB.textContent !== '') throw new Error('결과 화면이 승리가 아니거나 문구가 남았다: ' + els.endTitle.textContent);
  frames(120);
  if (R2.endCount() !== e0 + 1) throw new Error('showEnd가 두 번 불렸다');
  // (e) 연출 도중 다시 하기: 연출 상태·문구·타이머가 지워지고, 이전 연출이 결과 화면을 열지 않는다
  fire('againBtn', 'click', {}); calm(); frames(2);
  killBoss(); frames(10);
  if (!R2.victory() || VB.hidden) throw new Error('재시작 확인용 승리 연출이 시작되지 않았다');
  const e1 = R2.endCount();
  fire('againBtn', 'click', {}); calm(); frames(2);
  const fx = R2.fx();
  if (R2.victory() !== null || !VB.hidden || VB.className !== 'hudMsg' || VB.textContent !== '' || game.over || fx.flash !== 0 || fx.hitstop !== 0 || els.end.hidden !== true) throw new Error('재시작했는데 승리 연출 상태가 남았다: ' + JSON.stringify([R2.victory(), VB.className, fx, game.over]));
  frames(200);
  if (R2.endCount() !== e1 || els.end.hidden !== true || game.over) throw new Error('재시작 뒤 이전 승리 연출이 결과 화면을 열었다');
  // (d) 패배: 지연 없이 그 프레임에 결과 화면, 정복 문구 없음
  game.necro.hp = 0; frames(1);
  if (game.over !== 'lose' || els.end.hidden !== false || R2.endCount() !== e1 + 1 || R2.victory() !== null || !VB.hidden || VB.textContent !== '' || /정복/.test(els.endTitle.textContent)) throw new Error('패배는 지연·정복 문구 없이 바로 결과 화면이어야 한다: ' + game.over + ' / ' + els.endTitle.textContent);
  console.log('승리 연출(' + VIEW + '): 처치 직후 결과 화면 닫힘·"' + v0.text + '"·flash ' + v0.flash + '·hitstop ' + v0.hitstop + '·shake ' + v0.shake + '·느린 화면 x' + v0.slow + ', 연출 중 패배·판 진행 없음, ' + secs.toFixed(2) + '초 뒤 showEnd 1회, 패배는 즉시, 재시작에 초기화');
}

// ---- 결과 화면 두 단계: 1단계(타이틀·판 기록·항목별 골드 연출·패배 진행도) → 2단계(다음 구역·다시·#shop·홈으로) ----
{
  const SK = 'chimera-lab-save-v1', ES = () => win.ChimeraRender2D.endState();
  const rows = () => els.rewardList.kids.map(k => ({ id: k['attr:data-id'], gold: +k['attr:data-gold'] }));
  const calm = () => { game.spawnT = 1e9; game.eliteIdx = 99; game.necro.hp = game.necro.maxHp = 1e6; };
  const stepIs = (n, where) => { const s = ES(); if (s.step !== n || els.endStep1.hidden !== (n !== 1) || els.endStep2.hidden !== (n !== 2) || els.end.hidden) throw new Error(where + ': 결과 화면 ' + n + '단계가 아니다: ' + JSON.stringify(s)); };
  const watch = where => {
    let prev = -1, ups = 0;
    for (let i = 0; i < 600 && !ES().done; i++) { frames(1); const t = ES().total; if (t < prev) throw new Error(where + ': 골드 숫자가 줄었다 ' + prev + ' → ' + t); if (prev >= 0 && t > prev) ups++; prev = t; }
    if (!ES().done || ES().pending) throw new Error(where + ': 보상 연출이 끝나지 않았다: ' + JSON.stringify(ES()));
    return ups;
  };
  const expect = (before, where) => {
    const st = S.Save.settle(S.Save.load(before, null), S.runSummary(game)), want = st.items.filter(i => i.count > 0).map(i => ({ id: i.id, gold: i.gold }));
    if (!want.length) want.push({ id: 'none', gold: 0 });
    const got = rows(), sum = got.reduce((a, r) => a + r.gold, 0);
    if (JSON.stringify(got) !== JSON.stringify(want) || sum !== st.gained || ES().total !== st.gained || els.rewardGold.textContent !== st.gained + '골드') throw new Error(where + ': 항목별 보상 ' + JSON.stringify(got) + ' / ' + JSON.stringify(want) + ', 합계 ' + sum + ' / ' + st.gained + ' / ' + els.rewardGold.textContent);
    if (readSave().gold - S.Save.load(before, null).gold !== st.gained) throw new Error(where + ': 저장된 골드 증가가 항목 합계와 다르다: ' + store[SK]);
    return st;
  };
  // (A) 1구역 정복: 초소·돌격조·대장·첫 정복 덤·변이 씨앗이 차례로, 골드 숫자가 오르며 저장된 gained에서 멈춘다
  store[SK] = JSON.stringify({ v: 1, best: 0, cur: 0, gold: 0, up: { hp: 0 } });
  S.CFG.gold.seedPerClear = SEED_CLEAR;
  let upsA = 0;
  try {
    freshSession(ls);
    fire('startBtn', 'click', {}); frames(3); calm(); pickCards();
    game.eliteKills = 2;
    const before = store[SK];
    winNow();
    stepIs(1, '정복 직후');
    if (els.endTitle.textContent !== '1구역 정복' || els.end['attr:data-result'] !== 'win' || !els.endProgress.hidden) throw new Error('정복 1단계 타이틀: ' + els.endTitle.textContent);
    if (ES().done || rows().length || ES().total !== 0 || els.rewardGold.textContent !== '0골드') throw new Error('정복 직후 보상은 아직 드러나기 전이어야 한다: ' + JSON.stringify(ES()));
    frames(25);
    if (rows().length !== 1 || rows()[0].id !== 'posts' || !(ES().total > 0) || !(ES().total < ES().target)) throw new Error('보상은 초소부터 하나씩, 골드는 오르는 중이어야 한다: ' + JSON.stringify(ES()));
    upsA = watch('정복');
    expect(before, '정복');
    const ids = rows().map(r => r.id);
    if (!(upsA >= 4) || ids.join() !== ['posts', 'elites', 'boss', 'clear'].concat(SEED_CLEAR > 0 ? ['seed'] : []).join()) throw new Error('정복 보상 순서·골드 증가: ' + ids.join() + ' / 오른 횟수 ' + upsA);
    fire('endContinue', 'click', {});
    stepIs(2, '정복 계속 뒤');
    const nb = els.aceList.kids, sk = els.endShop.kids;
    if (els.aceList.hidden || nb.length !== 1 || nb[0].textContent !== '다음 구역 → 2구역' || !/cta/.test(nb[0].className) || els.againBtn.textContent !== '1구역부터 다시') throw new Error('정복 2단계: 큰 다음 구역 버튼: ' + (nb[0] || {}).textContent);
    if (sk[sk.length - 1] !== els.shop) throw new Error('2단계에 #shop이 결과 화면 자리로 오지 않았다');
    tab(0); if (statBtn(0).disabled) throw new Error('방금 번 골드로 강화할 수 없다');
    buyStat(0);
    if (readSave().up.stat.beast.hp !== 1) throw new Error('2단계 상점 구매: ' + store[SK]);
    fire('homeBtn', 'click', {});
    const tk = els.titleShop.kids;
    if (!els.end.hidden || els.title.hidden || tk[tk.length - 1] !== els.shop || !els.titleShop.hidden || els.startBtn.textContent !== '이어하기 2구역' || readSave().cur !== 1) throw new Error('정복 뒤 홈으로: 홈·#shop 복귀·이어하기 2구역: ' + els.startBtn.textContent + ' / ' + store[SK]);
    frames(60);
    if (!els.end.hidden || ES().pending) throw new Error('홈에 온 뒤 결과 화면 타이머가 남았다');
    fire('startBtn', 'click', {}); frames(3); calm(); pickCards();
    if (game.district !== 2) throw new Error('홈의 이어하기가 2구역을 열지 않았다: ' + game.district);
  } finally { S.CFG.gold.seedPerClear = 0; }
  // (B) 2구역 초소 단계 패배: 진행도, 연출 도중 계속 → 남은 항목·합계를 바로 채우고 타이머 정리, 큰 다시, 홈으로 뒤 이어하기 2구역
  {
    calm(); game.posts[0].dead = true; game.postsDown = 1; game.eliteKills = 1;
    const before = store[SK], tot = game.postsTotal;
    game.necro.hp = 0; frames(3);
    stepIs(1, '초소 단계 패배');
    const p = els.endProgress.textContent;
    if (els.endProgress.hidden || p.indexOf('초소 1 / ' + tot + ' 부숨') < 0 || p.indexOf('남은 초소 ' + (tot - 1) + '곳') < 0 || p.indexOf('대장을 만나지 못했다') < 0 || els.endTitle.textContent !== '2구역에서 쓰러졌다' || els.end['attr:data-result'] !== 'lose') throw new Error('초소 단계 패배 진행도: ' + p + ' / ' + els.endTitle.textContent);
    if (!ES().pending) throw new Error('패배 1단계 보상 연출이 돌고 있어야 한다');
    fire('endContinue', 'click', {});
    stepIs(2, '연출 도중 계속');
    if (ES().pending || !ES().done) throw new Error('연출 도중 전환에 타이머가 남았다: ' + JSON.stringify(ES()));
    expect(before, '초소 단계 패배');
    if (rows().map(r => r.id).join() !== 'posts,elites') throw new Error('초소 단계 패배 보상 항목: ' + JSON.stringify(rows()));
    const n0 = els.rewardList.kids.length, t0 = ES().total; frames(120);
    if (els.rewardList.kids.length !== n0 || ES().total !== t0) throw new Error('전환 뒤 이전 타이머가 항목을 더 붙였다');
    if (els.againBtn.textContent !== '2구역 다시' || !/solo/.test(els.againBtn.className) || !/cta/.test(els.againBtn.className) || !els.aceList.hidden) throw new Error('패배 2단계: 큰 다시 버튼: ' + els.againBtn.textContent + ' / ' + els.againBtn.className);
    fire('homeBtn', 'click', {});
    if (els.title.hidden || !els.end.hidden || els.startBtn.textContent !== '이어하기 2구역' || readSave().cur !== 1) throw new Error('패배 뒤 홈으로: 이어하기 2구역: ' + els.startBtn.textContent);
    fire('startBtn', 'click', {}); frames(3); calm(); pickCards();
    if (game.district !== 2) throw new Error('패배 뒤 홈의 이어하기가 2구역이 아니다: ' + game.district);
  }
  // (C) 대장전 패배: 대장까지 갔고 남은 체력, 초소 골드만, 다시로 같은 구역
  {
    calm(); for (const p of game.posts) p.dead = true; game.postsDown = game.postsTotal;
    const b = S.spawnBoss(game); frames(3); pickCards();
    b.hp = Math.max(1, Math.round(b.maxHp * 0.4));
    const before = store[SK];
    game.necro.hp = 0; frames(3);
    stepIs(1, '대장전 패배');
    const r = S.runSummary(game), p = els.endProgress.textContent;
    if (!r.bossReached || r.bossKilled || p.indexOf('대장까지 갔다') < 0 || p.indexOf('대장 체력 ' + r.bossHp + ' / ' + r.bossMaxHp + ' 남음') < 0 || p.indexOf('초소 ' + r.postsTotal + ' / ' + r.postsTotal + ' 부숨') < 0) throw new Error('대장전 패배 진행도: ' + p + ' / ' + JSON.stringify(r));
    watch('대장전 패배'); expect(before, '대장전 패배');
    if (rows().map(x => x.id).join() !== 'posts') throw new Error('대장전 패배 보상 항목: ' + JSON.stringify(rows()));
    fire('endContinue', 'click', {}); stepIs(2, '대장전 패배 계속 뒤');
    fire('againBtn', 'click', {}); frames(3); calm();
    if (game.district !== 2 || !els.end.hidden) throw new Error('대장전 패배 뒤 다시가 2구역을 열지 않았다');
  }
  // (D) 연출 도중 다시: 이전 결과 화면 타이머가 새 판에서 돌지 않는다
  {
    game.necro.hp = 0; frames(3);
    stepIs(1, '빈 패배');
    if (!ES().pending || els.endProgress.textContent.indexOf('초소 0 / ') < 0) throw new Error('빈 패배 1단계: ' + els.endProgress.textContent);
    fire('againBtn', 'click', {}); calm();
    if (ES().pending || ES().step !== 0 || !els.end.hidden) throw new Error('다시가 연출 타이머를 정리하지 않았다: ' + JSON.stringify(ES()));
    const n0 = els.rewardList.kids.length; frames(120);
    if (els.rewardList.kids.length !== n0 || !els.end.hidden || game.over) throw new Error('다시 뒤 이전 연출 타이머가 돌았다');
  }
  console.log('결과 화면 두 단계: 정복 보상 ' + rows().length + '항목 연출(골드 ' + upsA + '번 오름, 합계=저장 gained), 초소 단계·대장전 패배 진행도, 연출 도중 계속·다시 타이머 정리, 다음 구역·다시·홈으로(#shop 복귀, 이어하기 2구역)');
}

// ---- 3D 실패 경로: render.js가 2D 폴백으로 들어가 #game3d를 숨기고, 2D 바탕을 칠하고, 판이 간다 ----
if (FAIL) {
  let bg = 0;
  ctx.fillRect = function (x, y, w, h) { if (x === 0 && y === 0 && this.fillStyle === '#aabbcc' && w === els.game.width && h === els.game.height && w > 0) bg++; };
  freshSession(ls);   // render3d.js 없이 render.js만 다시 띄워도 #game3d를 스스로 숨기는지
  if (win.ChimeraRenderMode !== '2d-fallback' || els.game3d.hidden !== true) throw new Error('render.js가 2D 폴백으로 들어가지 않았다: ' + win.ChimeraRenderMode + ' / ' + els.game3d.hidden);
  fire('startBtn', 'click', {});
  const t0 = game.t; bg = 0;
  frames(30);
  delete ctx.fillRect;
  if (!(game.t > t0) || game.over) throw new Error('2D 폴백에서 판이 가지 않는다: ' + game.t + ' / ' + game.over);
  if (bg < 30) throw new Error('2D 폴백에서 바탕을 프레임마다 칠하지 않았다: ' + bg);
  console.log('2D 폴백: #game3d 숨김, 바탕 ' + bg + '번 칠함, 판 ' + (game.t - t0).toFixed(2) + '초 진행');
}

// ---- 3d 경로: render.js의 V 전용 분기가 실제로 돌았는지 ----
if (THROW) throw new Error('센티넬(' + THROW + ')을 던질 자리에 닿지 않았다');
if (VIEW === '3d') {
  for (const k of ['render', 'resize', 'toScreen', 'toWorld', 'rotateInput', 'pxPerUnit']) if (!vcalls[k]) throw new Error('V.' + k + '가 한 번도 불리지 않았다: ' + JSON.stringify(vcalls));
  if (!vcalls.marks) throw new Error('drawMarks3D(초소 내구도)가 돌지 않았다');
  if (!vcalls.pick) throw new Error('홈 화면 탭이 V.pickTitle로 가지 않았다: ' + JSON.stringify(vcalls));
  if (!vcalls.titleRender) throw new Error('홈 화면에서 V.render(title: true)가 불리지 않았다: ' + JSON.stringify(vcalls));
  if (vcalls.pxPerUnit < 3 * (vcalls.render - vcalls.titleRender)) throw new Error('홈 화면 밖에서 그릴 때마다 drawScreen·drawMarks3D·drawJuice가 pxPerUnit을 써야 한다: ' + JSON.stringify(vcalls));
  if (!vResize || vResize[0] !== 390 || vResize[1] !== 760) throw new Error('V.resize는 캔버스 CSS 크기로: ' + vResize);
  if (vGame !== game) throw new Error('V.render가 마지막 판을 받지 않았다');
  console.log('3D 분기: 가짜 ChimeraView 호출 ' + JSON.stringify(vcalls));
} else if (Object.values(vcalls).some(n => n)) throw new Error('2d 경로에서 V가 불렸다');
console.log('화면 경로 ' + VIEW + ' 스모크 완료');
