// 봇으로 90초 판을 돌려 본다: 예외·NaN이 없는지, 합성하는 쪽이 더 잘 버티는지.
const S = require('./src/sim.js');

// policy: 'fuse'(자리가 차면 약한 둘을 합성) / 'nofuse'(되살리기만) / 'none'(아무것도 안 함)
function bot(g, policy) {
  const n = g.necro; let x = 0, y = 0;
  for (const e of g.enemies) {
    const dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy) + 0.01;
    if (d < 6) { x += dx / (d * d) * 2; y += dy / (d * d) * 2; }
  }
  if (policy !== 'none') {
    const want = g.souls.filter(s => g.necro.mp >= S.CFG.cost[s.type]);
    if (policy === 'fuse' && g.units.length === S.CFG.maxUnits && want.length) {
      const two = g.units.slice().sort((a, b) => S.essCount(a) - S.essCount(b)).slice(0, 2);
      S.tapUnit(g, two[0].uid); S.tapUnit(g, two[1].uid);
    }
    if (g.units.length < S.CFG.maxUnits && want.length) {
      let b = null, bd = 1e9;
      for (const p of want) { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < bd) { bd = d; b = p; } }
      if (bd < 10) { x += (b.x - n.x) / bd * 1.6; y += (b.y - n.y) / bd * 1.6; }
    }
  }
  x += (g.W / 2 - n.x) * 0.05; y += (g.H / 2 - n.y) * 0.05;
  return { x, y };
}
function run(seed, policy) {
  const g = S.newGame(seed);
  while (!g.over) {
    S.step(g, 1 / 60, bot(g, policy));
    for (const o of [g.necro, ...g.units, ...g.enemies]) {
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.hp)) throw new Error('NaN at t=' + g.t);
    }
    if (g.units.length > S.CFG.maxUnits) throw new Error('소환수가 셋을 넘었다');
    if (g.necro.mp < 0 || g.necro.mp > g.necro.maxMp) throw new Error('MP 범위 밖');
  }
  return g;
}
const label = { fuse: '합성함   ', nofuse: '되살리기만', none: '아무것도 안 함' };
for (const policy of ['fuse', 'nofuse', 'none']) {
  let win = 0, t = 0, kills = 0, raised = 0, fus = 0, great = 0, maxN = 0; const N = 40;
  for (let s = 1; s <= N; s++) {
    const g = run(s, policy);
    if (g.over === 'win') win++;
    t += g.t; kills += g.kills; raised += g.raised; fus += g.fusions; great += g.greats; maxN += g.maxN;
  }
  console.log(`${label[policy]} 승 ${win}/${N} · 버틴 시간 ${(t / N).toFixed(1)}초 · 잡은 적 ${(kills / N).toFixed(1)} · 되살림 ${(raised / N).toFixed(1)} · 합성 ${(fus / N).toFixed(1)}(대성공 ${(great / N).toFixed(1)}) · 가장 큰 키메라 ${(maxN / N).toFixed(1)}`);
}
// 규칙 확인
{
  const g = S.newGame(5);
  const a = g.units[0];
  g.necro.mp = 10;
  g.souls.push({ x: g.necro.x, y: g.necro.y, type: 'wolf', ttl: 5 });
  S.step(g, 1 / 60, { x: 0, y: 0 });
  if (g.units.length !== 2 || g.necro.mp !== 8) throw new Error('되살리기: 자리와 MP');
  const b = g.units[1], before = S.stats(a).maxHp + S.stats(b).maxHp;
  if (S.tapUnit(g, a.uid) !== 'select') throw new Error('첫 누르기는 고르기');
  const r = S.tapUnit(g, b.uid);
  if (g.units.length !== 1 || g.selected !== null) throw new Error('합성 뒤 하나가 남아야 한다');
  const u = g.units[0];
  if (u.ess.bone < 1 || u.ess.wolf < 1) throw new Error('섞임: 둘의 재료가 모두 들어가야 한다');
  if (S.stats(u).maxHp <= before) throw new Error('합성한 하나가 둘의 합보다 강해야 한다');
  g.necro.mp = 1;
  g.souls.push({ x: g.necro.x, y: g.necro.y, type: 'knight', ttl: 5 });
  S.step(g, 1 / 60, { x: 0, y: 0 });
  if (g.units.length !== 1 || g.souls.length !== 1) throw new Error('MP가 모자라면 혼은 남는다');
  console.log('규칙 확인: 되살리기, 합성(' + r + '), 섞임, MP 부족');
}
const a = run(7, 'fuse'), b = run(7, 'fuse');
if (a.kills !== b.kills || a.t !== b.t) throw new Error('같은 시드인데 결과가 다르다');
console.log('재현성 확인: 같은 시드 같은 결과');
