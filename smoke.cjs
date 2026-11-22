// 합친 2d.html의 화면 코드(render.js, 3D 판과 같은 코드)를 가짜 DOM으로 돌려 예외가 없는지 본다(그림과 소리는 확인하지 못한다).
const fs = require('fs');
const S = require('./src/sim.js');
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
// 끝 화면 상점: 종류 탭(맹수·갑주·소총수)과 능력치 버튼(체력·공격력·간격·이속·사거리·받는 피해 순서)은 코드가 만든다
const tab = i => { for (const f of els.statTabs.kids[i].handlers.click) f({}); };
const statBtn = i => els.statShop.kids[i];
const buyStat = (i = 0) => { for (const f of statBtn(i).handlers.click) f({}); };
const beastHp = () => game.units[0].up && game.units[0].up.hp;
// 가짜 오디오: 호출 횟수만 센다
let tones = 0;
const node = () => new Proxy({}, { get: (t, k) => (k === 'frequency' || k === 'gain' ? { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop } : k === 'getChannelData' ? () => new Float32Array(8) : noop), set: () => true });
function AC() { this.currentTime = 0; this.sampleRate = 8; this.state = 'running'; this.destination = {}; this.createOscillator = () => { tones++; return node(); }; this.createGain = node; this.createBiquadFilter = node; this.createBufferSource = () => { tones++; return node(); }; this.createBuffer = node; this.resume = noop; }
let raf = null, now = 0;
const timers = [], store = {};
const flush = () => { for (const t of timers) if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); } };
const winH = {};
const fireWin = (type, arg) => { for (const f of (winH[type] || [])) f(arg); };
const win = { addEventListener: (t, f) => { (winH[t] = winH[t] || []).push(f); }, devicePixelRatio: 3, matchMedia: () => ({ matches: false }), ChimeraSim: S, AudioContext: AC };
const doc = { documentElement: {}, getElementById: id => els[id] || (els[id] = el(id)), createElement: () => el('created') };
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
let game = null, lastOpts = null;
const realNew = S.newGame; S.newGame = (seed, opts) => { lastOpts = opts; return (game = realNew(seed, opts)); };
// 화면 코드를 한 번 띄운다. 저장이 막힌 경우처럼 따로 확인할 때는 화면·창 핸들러를 비우고 새로 띄운다.
const boot = storage => new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'localStorage', scripts[1])(
  win, doc, () => ({ getPropertyValue: () => '#aabbcc' }), f => { raf = f; }, { now: () => now },
  (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; }, id => { if (timers[id - 1]) timers[id - 1].f = null; }, storage);
boot(ls);
const frames = n => { for (let i = 0; i < n; i++) { now += 16.7; raf(now); flush(); } };
const tap = (wx, wy) => {
  // 판 좌표를 화면 좌표로 바꿔 톡 누른다(가로 13칸이 390px, 카메라는 네크로맨서를 따라간다)
  const px = 390 / 13, vh = 760 / px;
  const camX = Math.max(0, Math.min(S.W - 13, game.necro.x - 6.5)), camY = Math.max(0, Math.min(S.H - vh, game.necro.y - vh / 2));
  const e = { pointerId: 1, clientX: (wx - camX) * px, clientY: (wy - camY) * px };
  fire('game', 'pointerdown', e); fire('game', 'pointerup', e);
};

// 초소 골드(판마다 부순 초소당)는 맨 끝 절에서 따로 확인한다. 그 앞의 저장·구매 확인은 처음 정복 골드만 보도록 끈다
const PER_POST = S.CFG.gold.perPost; S.CFG.gold.perPost = 0;

// ---- 첫 판: 입력과 흐름 ----
if (els.startBtn.textContent !== '1구역으로') throw new Error('저장이 없으면 제목 버튼은 1구역: ' + els.startBtn.textContent);
// 다른 탭이 저장을 바꾸면(storage 이벤트) 제목 버튼이 따라간다. 확인 뒤 되돌린다
store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 4, gold: 0, up: { hp: 0 } });
fireWin('storage', { key: 'chimera-lab-save-v1' });
if (els.startBtn.textContent !== '5구역으로') throw new Error('다른 탭의 저장을 제목 버튼이 따라가지 않았다: ' + els.startBtn.textContent);
fireWin('storage', { key: 'other-key' });
if (els.startBtn.textContent !== '5구역으로') throw new Error('다른 키의 storage 이벤트에 반응했다');
delete store['chimera-lab-save-v1'];
fireWin('storage', { key: 'chimera-lab-save-v1' });
if (els.startBtn.textContent !== '1구역으로') throw new Error('되돌린 저장을 따라가지 않았다: ' + els.startBtn.textContent);
fire('startBtn', 'click', { fake: 'event' });
frames(5);
if (game.district !== 1 || game.units.length !== 1) throw new Error('시작 버튼으로 1구역이 열리지 않았다');
let pins = 0, booms = 0, sawLink = false;
for (let i = 0; i < 60 * 40; i++) {
  frames(1);
  game.necro.hp = 100;   // 흐름을 끝까지 보려고 죽지 않게 한다
  game.postsTotal = 99;   // 이 흐름에서는 대장이 나오지 않게 한다(억지로 먹여 키운 키메라가 대장을 잡으면 정복이 저장되어 뒤의 확인이 어긋난다)
  if (game.link) sawLink = true;
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
  if (!(game.units.some(u => u.state === 'rush') || game.molts > before)) throw new Error('320ms 간격의 두 번 톡톡이 자폭으로 읽히지 않는다');
}
console.log('입력 확인: 찍기 ' + pins + '번, 자폭 ' + booms + '번, 연결선, 누른 순간의 키메라, 위쪽 칸, 320ms 두 번 톡톡, 소리 호출 ' + tones + '번');

// ---- 목적을 이뤄 구역을 차지하고, 키메라를 골라 다음 구역으로 ----
game.postsTotal = game.posts.length;
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
const readSave = () => JSON.parse(store['chimera-lab-save-v1']);
if (readSave().best !== 1 || readSave().gold !== S.CFG.gold.perClear) throw new Error('처음 정복했는데 골드·기록이 저장되지 않았다: ' + store['chimera-lab-save-v1']);
if (els.endGold.textContent !== S.CFG.gold.perClear + '골드 (+' + S.CFG.gold.perClear + ')') throw new Error('끝 화면의 골드 표시: ' + els.endGold.textContent);
if (els.statTabs.kids.length !== 3 || els.statShop.kids.length !== 6) throw new Error('상점: 종류 탭 셋, 능력치 버튼 여섯: ' + els.statTabs.kids.length + ' / ' + els.statShop.kids.length);
if (els.statTabs.kids[0]['attr:aria-pressed'] !== 'true' || els.statTabs.kids[1]['attr:aria-pressed'] !== 'false') throw new Error('처음 탭은 맹수');
if (statBtn(0).disabled) throw new Error('골드가 있는데 능력치를 살 수 없다');
buyStat(0);
if (readSave().gold !== S.CFG.gold.perClear - S.CFG.gold.statCost || readSave().up.stat.beast.hp !== 1) throw new Error('사도 골드·단계가 바뀌지 않았다: ' + store['chimera-lab-save-v1']);
if (!statBtn(0).disabled || !statBtn(5).disabled) throw new Error('골드가 모자란데 살 수 있게 보인다');
if (!/^체력 \+15%\n3골드 · 1\/5단계$/.test(statBtn(0).textContent) || !/^받는 피해 -10%/.test(statBtn(5).textContent)) throw new Error('능력치 버튼 글: ' + statBtn(0).textContent + ' / ' + statBtn(5).textContent);
tab(1);
if (els.statTabs.kids[1]['attr:aria-pressed'] !== 'true' || !/ 0\/5단계$/.test(statBtn(0).textContent)) throw new Error('갑주 탭: 단계는 종류마다 따로: ' + statBtn(0).textContent);
tab(0);
console.log('골드: 처음 정복 +' + S.CFG.gold.perClear + ', 맹수 체력 1단계 구매, 버튼 "' + statBtn(0).textContent.replace('\n', ' / ') + '"');
// 다른 탭이 그 사이에 강화를 더 사고 골드를 남겼다. 이 탭은 그것을 덮어쓰지 않고 이어받아야 한다
const GC = S.CFG.gold.statCost;
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
boss2.hp = 0.5; boss2.bleed = 100; boss2.bleedT = 1; frames(3);
if (game.over !== 'win' || readSave().best !== 2 || readSave().gold !== 2 + S.CFG.gold.perClear) throw new Error('2구역 정복 저장: ' + store['chimera-lab-save-v1']);
fire('againBtn', 'click', { fake: 'event' });
frames(3);
if (game.district !== 1 || beastHp() !== 3) throw new Error('"1구역부터 다시"가 강화된 맹수로 1구역을 열지 않았다');
for (const p of game.posts) p.dead = true;
game.postsDown = game.postsTotal;
const boss3 = S.spawnBoss(game); frames(3);
boss3.hp = 0.5; boss3.bleed = 100; boss3.bleedT = 1; frames(3);
if (game.over !== 'win' || readSave().best !== 2 || readSave().gold !== 2 + S.CFG.gold.perClear || els.endGold.textContent !== (2 + S.CFG.gold.perClear) + '골드') throw new Error('이미 깬 1구역을 다시 깨면 골드가 없어야 한다: ' + store['chimera-lab-save-v1']);
console.log('2구역 처음 정복 +' + S.CFG.gold.perClear + '골드, "1구역부터 다시"도 강화된 맹수, 이미 깬 1구역은 골드 없음');

// ---- 저장이 막힌 경우: 세션마다 새로 띄워 따로 확인한다(한 세션의 메모리 전용 모드가 다른 확인을 가리지 않게) ----
const freshSession = storage => {
  for (const k of Object.keys(els)) delete els[k];
  for (const k of Object.keys(winH)) delete winH[k];
  timers.length = 0;
  boot(storage);
  frames(2);
};
const winNow = () => {
  for (const p of game.posts) p.dead = true;
  game.postsDown = game.postsTotal;
  const b = S.spawnBoss(game); frames(3); b.hp = 0.5; b.bleed = 100; b.bleedT = 1; frames(3);
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
  if (els.startBtn.textContent !== '2구역으로') throw new Error('읽기 세션 제목: ' + els.startBtn.textContent);
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
  if (sv.gold !== 6 - 2 * S.CFG.gold.hpCost || sv.up.hp !== 2 || sv.up.stat.beast.hp !== 0) throw new Error('체력 구매 저장: ' + store['chimera-lab-save-v1']);
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
  if (els.resetBtn.hidden || els.startBtn.textContent !== '4구역으로') throw new Error('되돌리기 전 제목: ' + els.startBtn.textContent + ' / 버튼 숨김 ' + els.resetBtn.hidden);
  fire('resetBtn', 'click', {});
  if (readSave().cur !== 3 || els.startBtn.textContent !== '4구역으로') throw new Error('한 번만 눌렀는데 되돌렸다');
  now += 3100; flush();   // 3초 지나면 확인이 풀린다
  fire('resetBtn', 'click', {});
  if (readSave().cur !== 3) throw new Error('확인이 풀린 뒤 한 번 누름에 되돌렸다');
  fire('resetBtn', 'click', {});
  const sv = readSave();
  if (sv.cur !== 0 || sv.best !== 3 || sv.gold !== 6 || sv.up.stat.armor.taken !== 1 || sv.up.hp !== 1) throw new Error('되돌리기 저장: ' + store['chimera-lab-save-v1']);
  if (els.startBtn.textContent !== '1구역으로' || !els.resetBtn.hidden) throw new Error('되돌린 뒤 제목: ' + els.startBtn.textContent);
  fire('startBtn', 'click', {}); frames(3);
  if (game.district !== 1 || game.necro.maxHp !== 100 + S.CFG.gold.hpStep || game.statUp.armor.taken !== 1) throw new Error('되돌린 뒤 1구역이 강화와 함께 시작해야 한다');
  winNow();
  if (readSave().cur !== 1 || readSave().gold !== 6 || els.endGold.textContent !== '6골드' || els.endBest.textContent !== '3구역') throw new Error('되돌린 뒤 1구역 정복: 골드 없이 진행만: ' + store['chimera-lab-save-v1'] + ' / ' + els.endGold.textContent);
  console.log('1구역으로 되돌리기: 두 번 눌러야 되고, 진행만 0 → 다시 깬 1구역은 골드 없이 진행만 오른다');
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

// ---- 초소 골드: 이기든 지든 부순 초소 하나에 perPost. 처음 정복이면 perClear를 더 ----
{
  S.CFG.gold.perPost = PER_POST;
  const PP = PER_POST;
  store['chimera-lab-save-v1'] = JSON.stringify({ v: 1, best: 1, cur: 1, gold: 0, up: { hp: 0 } });
  freshSession(ls);
  fire('startBtn', 'click', {}); frames(3);   // 2구역
  game.posts[0].dead = true; game.posts[1].dead = true; game.postsDown = 2;
  game.necro.hp = 0; frames(3);
  if (game.over !== 'lose' || readSave().gold !== 2 * PP || els.endGold.textContent !== (2 * PP) + '골드 (+' + 2 * PP + ')') throw new Error('지면서 초소 둘: ' + store['chimera-lab-save-v1'] + ' / ' + els.endGold.textContent);
  fire('againBtn', 'click', {}); frames(3);
  game.necro.hp = 0; frames(3);
  if (readSave().gold !== 2 * PP || els.endGold.textContent !== (2 * PP) + '골드') throw new Error('초소 없이 지면 골드 없음: ' + els.endGold.textContent);
  fire('againBtn', 'click', {}); frames(3);
  winNow();   // 2구역 처음 정복: 초소 넷 + 처음 정복
  const want = 2 * PP + 4 * PP + PC;
  if (readSave().gold !== want || readSave().best !== 2 || els.endGold.textContent !== want + '골드 (+' + (4 * PP + PC) + ')') throw new Error('처음 정복 골드: ' + store['chimera-lab-save-v1'] + ' / ' + els.endGold.textContent);
  fire('againBtn', 'click', {}); frames(3);   // 1구역부터 다시: 이미 깬 구역은 초소 골드만
  winNow();
  if (readSave().gold !== want + 3 * PP) throw new Error('이미 깬 1구역: 초소 골드만: ' + store['chimera-lab-save-v1']);
  console.log('초소 골드: 지면서 초소 둘 +' + 2 * PP + ', 초소 없이 지면 0, 2구역 처음 정복 +' + (4 * PP + PC) + ', 이미 깬 1구역 +' + 3 * PP);
}

// ---- 진 끝 화면에서 한 구역 내려가기: 초소 골드를 모으고, 이기면 다시 진 구역으로. 진행 기록은 내려가지 않는다 ----
{
  const PP = S.CFG.gold.perPost;
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
  if (sv.cur !== 3 || sv.best !== 3 || sv.gold !== game.postsTotal * PP) throw new Error('내려간 3구역 정복: 초소 골드만, 진행은 그대로: ' + store['chimera-lab-save-v1']);
  if (!els.downBtn.hidden) throw new Error('이긴 끝 화면에는 내려가기 버튼이 없다');
  if (els.aceList.kids.length !== 1 || els.aceList.kids[0].textContent !== '4구역으로') throw new Error('내려간 구역을 이기면 다시 4구역으로: ' + (els.aceList.kids[0] || {}).textContent);
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
