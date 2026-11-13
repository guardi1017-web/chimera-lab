// 봇으로 90초 판을 돌려 본다: 예외·NaN이 없는지, 합성하는 쪽이 더 잘 버티는지, 규칙이 말한 대로인지.
const S = require('./src/sim.js');

// policy: 'fuse'(같은 등급이 둘이면 합성, 막히면 낮은 것을 삼킴) / 'nofuse'(되살리기만) / 'none'
function bot(g, policy) {
  const n = g.necro; let x = 0, y = 0;
  for (const e of g.enemies) {
    const dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy) + 0.01;
    if (d < 6) { x += dx / (d * d) * 2; y += dy / (d * d) * 2; }
  }
  if (policy !== 'none') {
    const want = g.souls.filter(s => g.necro.mp >= S.costOf(s.g));
    if (policy === 'fuse') {
      let pair = null;
      for (const a of g.units) for (const b of g.units) if (a !== b && a.g === b.g) pair = [a, b];
      if (pair) { S.tapUnit(g, pair[0].uid); S.tapUnit(g, pair[1].uid); }
      else if (g.units.length === S.CFG.maxUnits && want.length) {
        const s = g.units.slice().sort((a, b) => a.g - b.g);
        S.tapUnit(g, s[0].uid); S.tapUnit(g, s[2].uid);
      }
    }
    const useful = want.filter(sl => g.units.length <= 1 || g.units.some(u => u.g === sl.g));
    if (g.units.length < S.CFG.maxUnits && useful.length) {
      let b = null, bd = 1e9;
      for (const p of useful) { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < bd) { bd = d; b = p; } }
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
    for (const u of g.units) if (u.g < 1 || u.g > S.MAX_GRADE || !S.MON[u.g][u.arch]) throw new Error('표에 없는 몬스터');
  }
  return g;
}
const label = { fuse: '합성함        ', nofuse: '되살리기만    ', none: '아무것도 안 함' };
for (const policy of ['fuse', 'nofuse', 'none']) {
  let win = 0, t = 0, kills = 0, raised = 0, fus = 0, great = 0, fail = 0, absorb = 0, maxG = 0, found = 0; const N = 40;
  for (let s = 1; s <= N; s++) {
    const g = run(s, policy);
    if (g.over === 'win') win++;
    t += g.t; kills += g.kills; raised += g.raised; fus += g.fusions; great += g.greats; fail += g.fails; absorb += g.absorbs; maxG += g.maxGrade; found += Object.keys(g.found).length;
  }
  console.log(`${label[policy]} 승 ${win}/${N} · 버틴 시간 ${(t / N).toFixed(1)}초 · 잡은 적 ${(kills / N).toFixed(1)} · 되살림 ${(raised / N).toFixed(1)} · 합성 ${(fus / N).toFixed(1)}(대성공 ${(great / N).toFixed(1)}, 실패 ${(fail / N).toFixed(1)}) · 삼킴 ${(absorb / N).toFixed(1)} · 최고 등급 ${(maxG / N).toFixed(1)} · 만난 종 ${(found / N).toFixed(1)}`);
}

// 규칙 확인
{
  const mk = () => { const g = S.newGame(5); g.necro.mp = 10; return g; };
  const give = (g, arch, grade) => { g.souls.push({ x: g.necro.x, y: g.necro.y, arch, g: grade, ttl: 5 }); S.step(g, 1 / 60, { x: 0, y: 0 }); };
  let g = mk(); give(g, 'beast', 1);
  if (g.units.length !== 2 || g.necro.mp !== 8) throw new Error('되살리기: 자리와 MP(등급 × 2)');
  give(g, 'beast', 3); give(g, 'beast', 3);
  if (g.units.length !== 3 || g.souls.length !== 1) throw new Error('MP가 모자라면 혼은 남는다');

  // 같은 등급 합성의 세 결과를 확률 값으로 강제해 본다
  const fuseWith = (great, fail, defA, defB) => {
    const g = mk(); give(g, 'beast', 1);
    const [a, b] = g.units; a.defects = defA; b.defects = defB;
    const keep = [S.CFG.greatChance, S.CFG.failChance];
    S.CFG.greatChance = great; S.CFG.failChance = fail;
    S.tapUnit(g, a.uid); const r = S.tapUnit(g, b.uid);
    [S.CFG.greatChance, S.CFG.failChance] = keep;
    return { r, u: g.units[0], g };
  };
  let o = fuseWith(0, 0, [], []);
  if (o.r !== 'normal' || o.u.g !== 2 || o.g.units.length !== 1 || o.u.defects.length) throw new Error('보통: 1등급 둘 → 2등급 하나');
  o = fuseWith(1, 0, [], []);
  if (o.r !== 'great' || o.u.g !== 3) throw new Error('대성공: 두 등급 오른다');
  o = fuseWith(0, 1, [], []);
  if (o.r !== 'fail' || o.u.g !== 2 || o.u.defects.length !== 1) throw new Error('실패: 다음 등급 + 흠 하나');
  const lame = { uid: 0, g: 2, arch: 'beast', defects: ['lame'] }, fine = { uid: 0, g: 2, arch: 'beast', defects: [] };
  if (!(S.stats(lame).spd < S.stats(fine).spd)) throw new Error('절름발이는 느려야 한다');
  o = fuseWith(0, 0, ['lame'], ['oneeye']);
  if (o.u.defects.length !== 2) throw new Error('흠은 다음 합성에도 따라간다(둘 다)');
  if (!/절름발이/.test(S.nameOf(o.u)) || !/외눈/.test(S.nameOf(o.u))) throw new Error('이름에 흠이 붙는다');

  // 등급이 다르면 높은 쪽이 삼킨다
  g = mk(); give(g, 'beast', 1);
  g.units[0].g = 3; g.units[0].hp = 1;
  S.tapUnit(g, g.units[1].uid); const r = S.tapUnit(g, g.units[0].uid);
  if (r !== 'absorb' || g.units.length !== 1 || g.units[0].g !== 3 || g.units[0].hp < 100) throw new Error('다른 등급: 높은 쪽이 남고 체력이 찬다');
  console.log('규칙 확인: 되살리기와 MP, 보통·대성공·실패, 흠이 따라감, 다른 등급 삼킴');
}
const a = run(7, 'fuse'), b = run(7, 'fuse');
if (a.kills !== b.kills || a.t !== b.t) throw new Error('같은 시드인데 결과가 다르다');
console.log('재현성 확인: 같은 시드 같은 결과');
