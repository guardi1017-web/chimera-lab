// 합친 index.html의 화면 코드를 가짜 DOM으로 돌려 예외가 없는지 본다(그림과 소리는 확인하지 못한다).
const fs = require('fs');
const S = require('./src/sim.js');
const h = fs.readFileSync('index.html', 'utf8');
const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
for (const s of scripts) new Function(s);
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
const ev = {}, els = {};
const el = id => ({
  hidden: false, textContent: '', width: 0, height: 0,
  addEventListener: (e, f) => { (ev[id + ':' + e] = ev[id + ':' + e] || []).push(f); },
  getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760, left: 0, top: 0 }),
  setPointerCapture: noop, appendChild: noop, focus: noop,
});
// 가짜 오디오: 호출 횟수만 센다
let tones = 0;
const node = () => new Proxy({}, { get: (t, k) => (k === 'frequency' || k === 'gain' ? { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop } : k === 'getChannelData' ? () => new Float32Array(8) : noop), set: () => true });
function AC() { this.currentTime = 0; this.sampleRate = 8; this.state = 'running'; this.destination = {}; this.createOscillator = () => { tones++; return node(); }; this.createGain = node; this.createBiquadFilter = node; this.createBufferSource = () => { tones++; return node(); }; this.createBuffer = node; this.resume = noop; }
let raf = null, now = 0;
const timers = [];
const win = { addEventListener: noop, devicePixelRatio: 3, matchMedia: () => ({ matches: false }), ChimeraSim: S, AudioContext: AC };
const doc = { documentElement: {}, getElementById: id => els[id] || (els[id] = el(id)), createElement: () => el('x') };
let game = null;
const realNew = S.newGame; S.newGame = seed => (game = realNew(seed));
new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', scripts[1])(
  win, doc, () => ({ getPropertyValue: () => '#aabbcc' }), f => { raf = f; }, { now: () => now },
  (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; }, id => { if (timers[id - 1]) timers[id - 1].f = null; });
ev['startBtn:click'][0]();
const tap = (wx, wy) => {
  // 판 좌표를 화면 좌표로 바꿔 톡 누른다(가로 13칸이 390px, 카메라는 네크로맨서를 따라간다)
  const px = 390 / 13, vh = 760 / px;
  const camX = Math.max(0, Math.min(S.W - 13, game.necro.x - 6.5)), camY = Math.max(0, Math.min(S.H - vh, game.necro.y - vh / 2));
  const e = { pointerId: 1, clientX: (wx - camX) * px, clientY: (wy - camY) * px };
  ev['game:pointerdown'][0](e); for (const f of ev['game:pointerup']) f(e);
};
let pins = 0, booms = 0, sawSlow = false, sawLink = false;
for (let i = 0; i < 60 * 200; i++) {
  now += 16.7; raf(now);
  for (const t of timers) if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); }
  if (els.end.hidden === false) break;
  game.necro.hp = 100;   // 끝까지 돌려 보려고 죽지 않게 한다
  if (game.slowing) sawSlow = true;
  if (game.link) sawLink = true;
  if (i % 90 === 20) game.souls.push({ x: game.necro.x + 2, y: game.necro.y, type: S.KINDS[(i / 90 | 0) % 3], q: 1 + ((i / 90 | 0) % 3), ttl: 6 });
  if (i % 90 === 21) { const s = game.souls[game.souls.length - 1]; game.necro.x = s.x - 1.5; game.necro.y = s.y; }
  if (i % 90 === 40) { const s = game.souls[game.souls.length - 1]; if (s) { game.necro.x = s.x; game.necro.y = s.y; } }
  if (i % 90 === 45 && game.hearts.length) { const hrt = game.hearts[0]; game.necro.x = hrt.x; game.necro.y = hrt.y; }
  // 한 번 톡: 키메라를 찍는다
  if (i % 400 === 60 && game.units.length) { const before = game.pinned; tap(game.units[0].x, game.units[0].y); now += 360; for (const t of timers) if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); } if (game.pinned !== before) pins++; }
  // 두 번 톡톡: 터뜨린다
  if (i % 400 === 250 && game.units.length) { const before = game.molts + game.units.filter(u => u.state === 'rush').length; tap(game.necro.x + 3, game.necro.y + 3); now += 120; tap(game.necro.x + 3, game.necro.y + 3); if (game.units.some(u => u.state === 'rush') || game.molts > before) booms++; }
}
const endShown = els.end.hidden === false;   // 첫 판의 끝 화면이 떴는지 기억해 둔다
// 새 판을 열어 입력의 경계를 확인한다(앞의 판은 끝났다).
const flush = () => { for (const t of timers) if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); } };
ev['againBtn:click'][0]();
for (let i = 0; i < 10; i++) { now += 16.7; raf(now); }
if (game.over || !game.units.length) throw new Error('새 판이 열리지 않았다');
// 한 번 톡의 대상은 누른 순간의 키메라다: 누른 뒤 그 자리에 다른 키메라가 와도 처음 것이 찍힌다
{
  game.souls.push({ x: game.necro.x, y: game.necro.y, type: 'armor', q: 1, ttl: 5 });
  now += 16.7; raf(now);
  const a = game.units[0], b = game.units[1];
  if (!a || !b) throw new Error('키메라 둘이 필요하다');
  a.x = game.necro.x + 2; a.y = game.necro.y; b.x = game.necro.x - 2; b.y = game.necro.y;
  tap(a.x, a.y);
  const ax = a.x, ay = a.y; a.x = b.x; a.y = b.y; b.x = ax; b.y = ay;   // 둘의 자리를 바꾼다
  now += 360; flush();
  if (game.pinned !== a.uid) throw new Error('한 번 톡이 누른 순간의 키메라가 아니라 나중 위치의 키메라를 찍었다');
}
// 위쪽 키메라 칸을 누르면 그 키메라가 찍힌다
{
  const b = game.units[1];
  const e = { pointerId: 1, clientX: 16 + (Math.min(104, (390 - 32 - 56) / 3) + 6) * 1 + 20, clientY: 56 };
  ev['game:pointerdown'][0](e); for (const f of ev['game:pointerup']) f(e);
  if (game.pinned !== b.uid) throw new Error('위쪽 칸을 눌러도 찍히지 않는다');
  now += 400; flush();
}
// 320ms 간격의 두 번 톡톡도 자폭으로 읽힌다
let edgeChecked = false;
{
  const before = game.molts;
  tap(game.necro.x + 3, game.necro.y + 3); now += 320; tap(game.necro.x + 3, game.necro.y + 3);
  if (!(game.units.some(u => u.state === 'rush') || game.molts > before)) throw new Error('320ms 간격의 두 번 톡톡이 자폭으로 읽히지 않는다');
  edgeChecked = true;
}
if (!edgeChecked) throw new Error('경계 확인이 실행되지 않았다');
console.log('입력 경계 확인: 누른 순간의 키메라가 찍힌다, 320ms 간격의 두 번 톡톡은 자폭');
console.log('화면 코드 실행 확인 · 한 번 톡으로 찍기 ' + pins + '번 · 두 번 톡톡으로 자폭 ' + booms + '번 · 느려짐 ' + sawSlow + ' · 연결선 ' + sawLink + ' · 소리 호출 ' + tones + '번');
console.log('끝 화면=' + endShown + ' · ' + els.endTitle.textContent + ' ' + els.endTime.textContent + ' · 잡은 적 ' + els.endKills.textContent + ' · 먹인 혼 ' + els.endFeed.textContent + ' · 탈피 ' + els.endMolt.textContent + ' · 최고 ' + els.endLevel.textContent);
if (!pins || !booms || !sawSlow || !sawLink || !tones) throw new Error('입력·느려짐·소리 가운데 동작하지 않는 것이 있다');
if (!endShown) throw new Error('끝 화면이 뜨지 않았다');
