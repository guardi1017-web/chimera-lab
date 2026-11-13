// 합친 index.html의 화면 코드를 가짜 DOM으로 돌려 예외가 없는지 본다(그림과 소리는 확인하지 못한다).
const fs = require('fs');
const S = require('./src/sim.js');
const h = fs.readFileSync('index.html', 'utf8');
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
    appendChild(c) { o.kids.push(c); },
  };
  Object.defineProperty(o, 'textContent', { get() { return o._t || ''; }, set(v) { o._t = v; if (v === '') o.kids = []; } });
  return o;
};
const fire = (id, e, arg) => { for (const f of (els[id].handlers[e] || [])) f(arg); };
// 가짜 오디오: 호출 횟수만 센다
let tones = 0;
const node = () => new Proxy({}, { get: (t, k) => (k === 'frequency' || k === 'gain' ? { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop } : k === 'getChannelData' ? () => new Float32Array(8) : noop), set: () => true });
function AC() { this.currentTime = 0; this.sampleRate = 8; this.state = 'running'; this.destination = {}; this.createOscillator = () => { tones++; return node(); }; this.createGain = node; this.createBiquadFilter = node; this.createBufferSource = () => { tones++; return node(); }; this.createBuffer = node; this.resume = noop; }
let raf = null, now = 0;
const timers = [], store = {};
const flush = () => { for (const t of timers) if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); } };
const win = { addEventListener: noop, devicePixelRatio: 3, matchMedia: () => ({ matches: false }), ChimeraSim: S, AudioContext: AC };
const doc = { documentElement: {}, getElementById: id => els[id] || (els[id] = el(id)), createElement: () => el('created') };
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
let game = null, lastOpts = null;
const realNew = S.newGame; S.newGame = (seed, opts) => { lastOpts = opts; return (game = realNew(seed, opts)); };
new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'localStorage', scripts[1])(
  win, doc, () => ({ getPropertyValue: () => '#aabbcc' }), f => { raf = f; }, { now: () => now },
  (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; }, id => { if (timers[id - 1]) timers[id - 1].f = null; }, ls);
const frames = n => { for (let i = 0; i < n; i++) { now += 16.7; raf(now); flush(); } };
const tap = (wx, wy) => {
  // 판 좌표를 화면 좌표로 바꿔 톡 누른다(가로 13칸이 390px, 카메라는 네크로맨서를 따라간다)
  const px = 390 / 13, vh = 760 / px;
  const camX = Math.max(0, Math.min(S.W - 13, game.necro.x - 6.5)), camY = Math.max(0, Math.min(S.H - vh, game.necro.y - vh / 2));
  const e = { pointerId: 1, clientX: (wx - camX) * px, clientY: (wy - camY) * px };
  fire('game', 'pointerdown', e); fire('game', 'pointerup', e);
};

// ---- 첫 판: 입력과 흐름 ----
fire('startBtn', 'click', { fake: 'event' });
frames(5);
if (game.district !== 1 || game.units.length !== 1) throw new Error('시작 버튼으로 1구역이 열리지 않았다');
let pins = 0, booms = 0, sawSlow = false, sawLink = false;
for (let i = 0; i < 60 * 40; i++) {
  frames(1);
  game.necro.hp = 100;   // 흐름을 끝까지 보려고 죽지 않게 한다
  if (game.slowing) sawSlow = true;
  if (game.link) sawLink = true;
  if (i % 90 === 20) game.souls.push({ x: game.necro.x + 2, y: game.necro.y, type: S.KINDS[(i / 90 | 0) % 3], q: 1 + ((i / 90 | 0) % 3), ttl: 6 });
  if (i % 90 === 21) { const s = game.souls[game.souls.length - 1]; game.necro.x = s.x - 1.5; game.necro.y = s.y; }
  if (i % 90 === 40) { const s = game.souls[game.souls.length - 1]; if (s) { game.necro.x = s.x; game.necro.y = s.y; } }
  if (i % 90 === 45 && game.hearts.length) { const hrt = game.hearts[0]; game.necro.x = hrt.x; game.necro.y = hrt.y; }
  if (i % 400 === 60 && game.units.length) { const before = game.pinned; tap(game.units[0].x, game.units[0].y); now += 360; flush(); if (game.pinned !== before) pins++; }
  if (i % 400 === 250 && game.units.length) { const before = game.molts; tap(game.necro.x + 3, game.necro.y + 3); now += 120; tap(game.necro.x + 3, game.necro.y + 3); if (game.units.some(u => u.state === 'rush') || game.molts > before) booms++; }
}
if (!pins || !booms || sawSlow || !sawLink || !tones) throw new Error('입력·연결선·소리 가운데 동작하지 않는 것이 있다(또는 느려짐이 남아 있다)');

// 한 번 톡의 대상은 누른 순간의 키메라다
{
  while (game.units.length < 2) { game.souls.push({ x: game.necro.x, y: game.necro.y, type: 'armor', q: 1, ttl: 5 }); frames(2); }
  for (const u of game.units) u.state = 'ok';
  const a = game.units[0], b = game.units[1];
  a.x = game.necro.x + 2; a.y = game.necro.y; b.x = game.necro.x - 2; b.y = game.necro.y;
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
  if (!(game.units.some(u => u.state === 'rush') || game.molts > before)) throw new Error('320ms 간격의 두 번 톡톡이 자폭으로 읽히지 않는다');
}
console.log('입력 확인: 찍기 ' + pins + '번, 자폭 ' + booms + '번, 연결선, 누른 순간의 키메라, 위쪽 칸, 320ms 두 번 톡톡, 소리 호출 ' + tones + '번');

// ---- 목적을 이뤄 구역을 차지하고, 키메라를 골라 다음 구역으로 ----
frames(120);
for (const u of game.units) u.state = 'ok';
for (const p of game.posts) p.dead = true;
game.postsDown = game.postsTotal;
const boss = S.spawnBoss(game);
frames(3);
boss.hp = 0.5; boss.bleed = 100; boss.bleedT = 1;
frames(3);
if (game.over !== 'win' || els.end.hidden !== false) throw new Error('대장을 잡았는데 끝 화면이 뜨지 않았다');
if (!/1구역 정복/.test(els.endTitle.textContent)) throw new Error('정복 제목이 아니다: ' + els.endTitle.textContent);
const nextBtn = els.aceList.kids;
if (nextBtn.length !== 1 || els.aceList.hidden) throw new Error('다음 구역 버튼이 없다');
console.log('구역 정복 화면: ' + els.endTitle.textContent + ' · 초소 ' + els.endPosts.textContent + ' · 최고 ' + els.endBest.textContent + ' · 버튼 "' + nextBtn[0].textContent + '", "' + els.againBtn.textContent + '"');
for (const f of nextBtn[0].handlers.click) f({});
frames(3);
if (game.district !== 2) throw new Error('다음 구역으로 넘어가지 않았다');
if (lastOpts.squad || lastOpts.ace) throw new Error('키메라를 데려가면 안 된다');
if (game.units.length !== 1 || S.geneTotal(game.units[0]) !== 1) throw new Error('다음 구역은 맹수 하나로 처음부터 시작해야 한다');
if (els.end.hidden !== true) throw new Error('다음 구역이 시작됐는데 끝 화면이 남아 있다');
if (game.posts.length !== 4) throw new Error('2구역의 초소는 넷이어야 한다');
console.log('다음 구역: ' + game.district + '구역, 초소 ' + game.posts.length + '곳, 맹수 하나로 처음부터');

// ---- 지면 그 구역을 다시 ----
game.necro.hp = 0;
frames(3);
if (game.over !== 'lose' || els.end.hidden !== false) throw new Error('쓰러졌는데 끝 화면이 뜨지 않았다');
if (els.aceList.hidden !== true) throw new Error('졌는데 다음 구역 버튼이 보인다');
console.log('패배 화면: ' + els.endTitle.textContent + ' · 최고 ' + els.endBest.textContent + ' · 버튼 "' + els.againBtn.textContent + '"');
fire('againBtn', 'click', { fake: 'event' });
frames(3);
if (game.district !== 2 || game.units.length !== 1 || S.geneTotal(game.units[0]) !== 1) throw new Error('다시 하기가 2구역을 처음부터 열지 않았다');
if (store['chimera-lab-best-v1'] !== '1') throw new Error('최고 기록이 저장되지 않았다: ' + store['chimera-lab-best-v1']);
console.log('다시 하기: 쓰러진 2구역을 맹수 하나로 다시. 최고 기록 저장 확인');
