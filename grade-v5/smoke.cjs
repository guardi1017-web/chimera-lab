// 합친 index.html의 화면 코드를 가짜 DOM으로 돌려 예외가 없는지 본다(그림은 확인하지 못한다).
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
let raf = null;
const store = {};
const win = { addEventListener: noop, devicePixelRatio: 3, matchMedia: () => ({ matches: false }), ChimeraSim: S };
const doc = { documentElement: {}, getElementById: id => els[id] || (els[id] = el(id)), createElement: () => el('x') };
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
let game = null;
const realNew = S.newGame; S.newGame = seed => (game = realNew(seed));
new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'localStorage', scripts[1])(win, doc, () => ({ getPropertyValue: () => '#fff' }), f => { raf = f; }, ls);
ev['startBtn:click'][0]();
let t = 0, fused = 0;
const tapAt = (wx, wy) => {
  // 판 좌표를 화면 좌표로 바꿔 톡 누른다(가로 13칸이 390px, 카메라는 네크로맨서를 따라간다)
  const px = 390 / 13, vh = 760 / px;
  const camX = Math.max(0, Math.min(S.W - 13, game.necro.x - 6.5)), camY = Math.max(0, Math.min(S.H - vh, game.necro.y - vh / 2));
  const e = { pointerId: 1, clientX: (wx - camX) * px, clientY: (wy - camY) * px };
  ev['game:pointerdown'][0](e); for (const f of ev['game:pointerup']) f(e);
};
for (let i = 0; i < 60 * 130; i++) {
  t += 16.7; raf(t);
  if (els.end.hidden === false) break;
  // 혼을 공짜로 되살려 자리를 채운 뒤 화면을 눌러 합성해 본다
  if (i % 120 === 60) { game.necro.mp = 10; game.necro.hp = 100; game.souls.push({ x: game.necro.x, y: game.necro.y, arch: S.ARCHS[(i / 120 | 0) % 3], g: 1 + ((i / 240 | 0) % 2), ttl: 3 }); }
  if (i % 120 === 90 && game.units.length >= 2) {
    const before = game.fusions + game.absorbs;
    tapAt(game.units[0].x, game.units[0].y); tapAt(game.units[1].x, game.units[1].y);
    if (game.fusions + game.absorbs > before) fused++;
  }
}
console.log('화면 코드 실행 확인 · 화면을 눌러 합성·삼킴 ' + fused + '번 · 끝 화면=' + (els.end.hidden === false) + ' · ' + els.endTitle.textContent + ' ' + els.endTime.textContent + ' · 합성 ' + els.endFused.textContent + ' · 최고 ' + els.endGrade.textContent + ' · 도감 ' + els.endDex.textContent);
console.log(els.endNew.textContent);
if (fused < 3) throw new Error('화면 누르기로 합성이 되지 않는다');
if (!store['chimera-lab-dex-v1']) throw new Error('도감이 저장되지 않았다');
