// 6차 규칙을 확인하고, 봇으로 90초 판을 돌려 예외·NaN이 없는지 본다.
const S = require('./src/sim.js');
const C = S.CFG;
const eq = (a, b, msg) => { if (a !== b) throw new Error(msg + ' (기대 ' + b + ', 실제 ' + a + ')'); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const approx = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) throw new Error(msg + ' (기대 ' + b + ', 실제 ' + a + ')'); };

// ---- 규칙 ----
{
  const fresh = () => { const g = S.newGame(5); g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.postsTotal = 0; g.enemies = []; return g; };   // 적도 초소도(수비대도) 없는 빈 판
  const soulAt = (g, type, q) => { g.feedT = 0; g.souls.push({ x: g.necro.x, y: g.necro.y, type, q, ttl: 5 }); S.step(g, 1 / 60, { x: 0, y: 0 }); };
  const foe = (g, x, y, extra) => { const e = Object.assign({ elite: false, arch: 'beast', g: 1, x, y, hp: 18, maxHp: 18, dmg: 0, r: 0.42, cd: 99, face: 0, stun: 99, bleed: 0, bleedT: 0 }, extra || {}); g.enemies.push(e); return e; };

  // 자리가 비면 혼은 값없이 1등급으로 되살아난다
  let g = fresh();
  soulAt(g, 'armor', 1); soulAt(g, 'ranger', 2);
  eq(g.units.length, 3, '빈 자리에는 되살아난다');
  eq(S.geneTotal(g.units[1]), 1, '되살아난 것은 유전자 1개');
  eq(S.levelOf(g.units[2]), 1, '중형의 혼도 되살릴 때는 1등급');

  // 자리가 차면 연결된 키메라가 먹는다: 불량 +30, 신선 +15와 회복, 순혈은 0으로
  g.pinned = g.units[0].uid;
  const u = g.units[0];
  soulAt(g, 'armor', 1);
  eq(u.inst, C.soul[1].inst, '불량 혼: 불안정도가 오른다'); eq(S.geneTotal(u), 2, '불량 혼: 유전자 +1'); eq(g.units.length, 3, '먹어도 자리는 셋');
  u.hp = 1; soulAt(g, 'ranger', 2);
  eq(u.inst, C.soul[1].inst + C.soul[2].inst, '신선한 혼: 불안정도가 덜 오른다'); eq(S.geneTotal(u), 4, '신선한 혼: 유전자 +2'); ok(u.hp > S.stats(u).maxHp * 0.45, '신선한 혼: 체력 회복');
  eq(u.genes.beast, 1, '유전자는 종류별로 쌓인다'); eq(u.genes.ranger, 2, '유전자는 종류별로 쌓인다'); eq(u.main, 'beast', '종류는 소환한 그대로(사수 유전자가 더 많아도 맹수)');
  const calm = S.stats(u).dmg; u.inst = 85;
  ok(S.isFrenzy(u) && Math.abs(S.stats(u).dmg / calm - 1.5) < 1e-9, '과부하: 피해 1.5배');
  ok(Math.abs(S.stats(u).cd * 1.5 - (u.inst = 0, S.stats(u).cd)) < 1e-9, '과부하: 공격 속도 1.5배');
  u.inst = 85; soulAt(g, 'beast', 3);
  eq(u.inst, 0, '순혈 코어: 불안정도 0'); ok(u.mutant, '순혈 코어: 변이'); eq(S.geneTotal(u), 7, '순혈 코어: 유전자 +3');
  ok(S.stats(u).shards > 0 || u.main !== 'ranger', '섞인 유전자가 기술을 바꾼다');

  // 100%에 닿으면 뛰어들어 터지고, 심장이 남는다
  g = fresh();
  soulAt(g, 'armor', 1); soulAt(g, 'armor', 1);
  const bomb = g.units[0]; g.pinned = bomb.uid; bomb.inst = 80; bomb.genes.beast = 5;
  const near = [foe(g, bomb.x + 1, bomb.y), foe(g, bomb.x + 2, bomb.y + 1), foe(g, bomb.x + 1.5, bomb.y - 1)], far = foe(g, bomb.x, bomb.y - 14);
  const elite = foe(g, bomb.x + 2, bomb.y, { elite: true, hp: 260, maxHp: 260, r: 0.95, mode: 'chase', rechargeT: 99, stun: 0, cd: 99, dmg: 0 });
  soulAt(g, 'beast', 1);
  eq(bomb.state, 'rush', '100%에 닿으면 뛰어든다');
  for (let i = 0; i < 90 && g.units.indexOf(bomb) >= 0; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
  ok(g.units.indexOf(bomb) < 0 && g.units.length === 2, '터지면 자리가 빈다');
  ok(near.every(e => e.dead), '폭발: 둘레의 잡몹은 즉사'); ok(!far.dead, '폭발: 먼 적은 무사');
  ok(elite.dead && g.souls.some(s => s.q === 3), '폭발: 불안정도가 찬 폭탄은 돌격조를 한 방에 잡고 순혈 코어가 남는다');
  eq(g.hearts.length, 1, '터진 자리에 심장이 남는다'); eq(g.hearts[0].genes.beast, 6, '심장은 유전자를 보존한다');
  ok(g.souls.length >= 3, '터져 죽은 잡몹의 혼이 남는다');

  // 심장을 밟으면 유전자를 물려받은 새 키메라가 불안정도 0으로 깨어난다.
  // 폭발로 쏟아진 혼이 같은 자리에 있어도 심장이 먼저다.
  const h = g.hearts[0]; g.necro.x = h.x; g.necro.y = h.y;
  // 폭발 지점에는 혼이 몰려 있다. 심장과 같은 자리에 불량 혼 넷과 순혈 코어를 둔다.
  g.souls = [];
  for (let i = 0; i < 4; i++) g.souls.push({ x: h.x, y: h.y, type: 'beast', q: 1, ttl: 9 });
  g.souls.push({ x: h.x, y: h.y, type: 'armor', q: 3, ttl: 9 });
  const soulsBefore = g.souls.length;
  S.step(g, 1 / 60, { x: 0, y: 0 });
  const reborn = g.units[g.units.length - 1];
  eq(g.rebirths, 1, '혼과 심장을 함께 밟아도 심장이 자리를 차지한다');
  eq(g.units.length, 3, '심장 계승: 새 키메라'); eq(reborn.genes.beast, 6, '4초 안에 주우면 유전자 100%'); eq(reborn.inst, 0, '계승하면 불안정도 0');
  eq(g.souls.length, soulsBefore, '계승한 프레임에는 발밑의 혼을 먹지 않는다'); eq(reborn.state, 'ok', '계승하자마자 다시 터지지 않는다');
  // 그대로 서 있으면 한 번에 하나씩, 간격을 두고 먹는다
  let eaten = 0, maxPerStep = 0;
  for (let i = 0; i < 60; i++) { const b4 = g.souls.length; S.step(g, 1 / 60, { x: 0, y: 0 }); const d = b4 - g.souls.length; eaten += d; maxPerStep = Math.max(maxPerStep, d); }
  ok(maxPerStep === 1 && eaten >= 1 && eaten <= 2, '1초 동안 한 번에 하나씩, 많아야 둘을 먹는다 (먹은 수 ' + eaten + ')');
  // 자리를 뜨면 더 먹지 않는다
  const left = g.souls.length; g.necro.x += 4;
  for (let i = 0; i < 60; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
  ok(g.souls.length === left, '자리를 뜨면 더 먹지 않는다'); eq(reborn.molts, 1, '탈피 횟수가 쌓인다');
  ok(S.heartKeep({ age: 12 }) === C.heartMinKeep && S.heartKeep({ age: 2 }) === 1, '심장은 늦게 주울수록 80%까지 줄어든다');
  for (const gs of [{ beast: 3, armor: 3, ranger: 3 }, { beast: 1, armor: 0, ranger: 0 }, { beast: 7, armor: 2, ranger: 1 }, { beast: 0, armor: 1, ranger: 5 }]) {
    const main = S.KINDS.slice().sort((a, b) => gs[b] - gs[a])[0], out = S.scaleGenes(gs, main, C.heartMinKeep), t0 = gs.beast + gs.armor + gs.ranger, t1 = out.beast + out.armor + out.ranger;
    ok(t1 >= t0 * 0.8 - 1e-9 && t1 <= t0 && out[main] >= 1, '늦은 심장도 유전자 총량의 80% 이상을 지킨다: ' + JSON.stringify(gs) + ' → ' + JSON.stringify(out));
  }

  // 폭발의 세기는 불안정도에 달렸다: 0%에서 터뜨리면 돌격조는 큰 피해와 기절만
  {
    const g = fresh(); soulAt(g, 'armor', 1);
    const b0 = g.units[0];
    const e0 = foe(g, b0.x + 1.5, b0.y, { elite: true, hp: 260, maxHp: 260, r: 0.95, mode: 'chase', rechargeT: 99, stun: 0, cd: 99, dmg: 0 });
    ok(S.detonate(g), '0%에서도 터뜨릴 수 있다');
    for (let i = 0; i < 90 && g.units.indexOf(b0) >= 0; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(!e0.dead && e0.hp < 260 && e0.hp > 260 * 0.8 && e0.stun > 0, '0% 폭발: 돌격조는 조금 깎이고 기절만 한다');
  }

  // 연결선이 가리킨 것을 먹는다: 줍는 범위 안에 혼이 둘이면 가까운 쪽(연결된 쪽)부터
  {
    const g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
    g.pinned = g.units[0].uid; g.feedT = 0;
    const farS = { x: g.necro.x + 0.9, y: g.necro.y, type: 'armor', q: 1, ttl: 9 }, nearS = { x: g.necro.x + 0.1, y: g.necro.y, type: 'ranger', q: 2, ttl: 9 };
    g.souls.push(farS, nearS);   // 먼 것이 배열 앞에 있다
    S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(g.souls.length === 1 && g.souls[0] === farS && g.units[0].genes.ranger === 2, '연결된(가까운) 혼을 먼저 먹는다');
    S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(g.link && g.link.x === farS.x && g.souls.length === 1, '다음 연결선은 남은 혼을 가리키고, 간격이 끝날 때까지 기다린다');
    for (let i = 0; i < 30; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(g.souls.length === 0 && g.units[0].genes.armor === 1, '간격이 끝나면 연결된 그 혼을 먹는다');
    // 심장과 혼이 함께 있으면 연결선도 흡수도 심장이 먼저
    g.feedT = 0;
    const s2 = { x: g.necro.x + 0.1, y: g.necro.y, type: 'armor', q: 1, ttl: 9 }, h2 = { x: g.necro.x + 0.5, y: g.necro.y, genes: { beast: 2, armor: 0, ranger: 0 }, main: 'beast', molts: 0, mutant: false, age: 0, ttl: 12 };
    g.souls.push(s2); g.hearts.push(h2);
    S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(g.hearts.length === 0 && g.souls.length === 1, '자리가 찼을 때 심장과 혼이 함께 있으면 심장을 먼저 삼킨다');
  }

  // 덜 익은 폭탄은 약하고 대가가 있다
  {
    const g = fresh(); soulAt(g, 'armor', 1);
    const b0 = g.units[0]; b0.genes.beast = 10; b0.inst = 0; g.units = [b0];
    const tough = foe(g, b0.x + 1, b0.y, { hp: 9999, maxHp: 9999 }), weakNear = foe(g, b0.x + 1.2, b0.y + 0.3), edge = foe(g, b0.x + 1 + C.blastRadius * 0.8, b0.y);
    g.pinned = null; S.detonate(g);
    eq(b0.state, 'rush', '0%에서도 터뜨릴 수는 있다');
    for (let i = 0; i < 90 && g.units.indexOf(b0) >= 0; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(!tough.dead && tough.hp < 9999, '덜 익은 폭탄: 잡몹을 즉사시키지 못하고 피해만 준다');
    ok(weakNear.dead, '약한 잡몹은 그 피해로도 죽는다');
    ok(!edge.dead && edge.hp === edge.maxHp, '덜 익은 폭탄: 반경이 좁다');
    const h = g.hearts[0];
    ok(Math.abs(h.keep - C.heartWeakKeep) < 1e-9 && h.molts === 0, '덜 익은 폭탄의 심장: 유전자 60%만, 탈피 보너스 없음');
    g.souls = []; g.necro.x = h.x; g.necro.y = h.y; S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(g.hearts.length === 1 && g.units.length === 0, '덜 익은 심장은 식을 때까지 주울 수 없다');
    for (let i = 0; i < 60 * (C.heartWeakWait + 0.2); i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    const rb = g.units[g.units.length - 1];
    ok(S.geneTotal(rb) === Math.ceil(10 * C.heartWeakKeep) && rb.molts === 0, '덜 익은 채 터뜨리면 유전자를 잃는다 (10 → ' + S.geneTotal(rb) + ')');
    // 다 익은 폭탄은 그대로: 넓게, 즉사, 유전자 100%, 탈피 +1
    const g2 = fresh(); soulAt(g2, 'armor', 1);
    const b1 = g2.units[0]; b1.genes.beast = 10; b1.inst = 85; g2.units = [b1];
    const tough2 = foe(g2, b1.x + 1, b1.y, { hp: 9999, maxHp: 9999 }), edge2 = foe(g2, b1.x + 1 + C.blastRadius * 0.8, b1.y);
    g2.pinned = null; S.detonate(g2);
    for (let i = 0; i < 90 && g2.units.indexOf(b1) >= 0; i++) S.step(g2, 1 / 60, { x: 0, y: 0 });
    ok(tough2.dead && edge2.dead, '다 익은 폭탄: 넓은 반경의 잡몹이 즉사한다');
    ok(g2.hearts[0].keep === 1 && g2.hearts[0].molts === 1 && g2.hearts[0].wait === 0, '다 익은 폭탄의 심장: 유전자 100%, 탈피 +1, 바로 주울 수 있다');
  }

  // 자리가 찼을 때 심장을 밟으면 연결된 키메라가 삼킨다
  {
    const g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
    g.pinned = g.units[1].uid;
    g.hearts.push({ x: g.necro.x, y: g.necro.y, genes: { beast: 4, armor: 0, ranger: 0 }, main: 'beast', molts: 2, mutant: false, age: 0, ttl: 12 });
    S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(g.units.length === 3 && g.hearts.length === 0 && g.units[1].genes.beast === 4 && g.units[1].main === 'armor', '만석 심장: 찍어 둔 키메라가 유전자를 삼킨다(종류는 그대로)');
  }

  // 익은 채(80~99%) 들고 있으면 체력이 샌다. 그렇게 쓰러지면 일어날 때까지 터뜨릴 수 없다. 79%면 새지 않는다
  {
    const quiet = g => { g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.enemies = []; };
    const g = fresh(); quiet(g); const u = g.units[0], m = S.stats(u).maxHp;
    u.inst = C.frenzyAt - 1; u.hp = m;
    for (let i = 0; i < 60 * 3; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    eq(u.hp, m, '79%는 체력이 새지 않는다');
    u.inst = 90;
    for (let i = 0; i < 60 * 4; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(Math.abs(u.hp / m - (1 - 4 * C.frenzyDrain)) < 0.02, '익은 채 4초: 최대 체력의 ' + (400 * C.frenzyDrain) + '%가 샌다 (' + (u.hp / m).toFixed(3) + ')');
    for (let i = 0; i < 60 * 20 && !(u.down > 0); i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(u.down > 0 && u.drained, '오래 들고 있으면 쓰러진다');
    ok(!S.detonate(g) && S.nextBlast(g) === null && u.state === 'ok', '쓰러진 동안은 터뜨릴 수 없다');
    for (let i = 0; i < 60 * 7; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(u.down === 0 && !u.drained && S.detonate(g) && u.state === 'rush', '일어나면 다시 터뜨릴 수 있다');
    // 쓰러진 채 먹어 100%가 되면 그때는 못 터지고, 일어나는 순간 터진다(100%에 머무르지 않는다)
    const g2 = fresh(); quiet(g2); const v = g2.units[0];
    v.inst = 90; v.hp = 0.01;
    for (let i = 0; i < 60 && !(v.down > 0); i++) S.step(g2, 1 / 60, { x: 0, y: 0 });
    ok(v.down > 0 && v.drained, '익은 채 쓰러졌다');
    v.inst = 100; S.step(g2, 1 / 60, { x: 0, y: 0 });
    ok(v.state === 'ok' && v.down > 0, '쓰러진 동안은 100%여도 터지지 않는다');
    for (let i = 0; i < 60 * 7 && v.state === 'ok'; i++) S.step(g2, 1 / 60, { x: 0, y: 0 });
    ok(v.state !== 'ok', '일어나는 순간 100%면 터진다');
  }
  // 다른 유전자를 많이 먹어도 종류는 그대로, 체력은 깎이지 않는다
  {
    const g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
    const a = g.units[1]; g.pinned = a.uid; a.hp = 10;
    soulAt(g, 'ranger', 1); soulAt(g, 'ranger', 1);
    ok(a.main === 'armor' && a.genes.ranger > a.genes.armor && a.hp >= 10 && a.hp <= S.stats(a).maxHp, '사수 혼을 더 많이 먹어도 갑주는 갑주 (hp=' + a.hp.toFixed(1) + ')');
    // 심장으로 깨어나도 같은 종류: 사수 유전자가 더 많은 갑주의 심장은 갑주로 깨어난다
    const h = { x: g.necro.x, y: g.necro.y, genes: Object.assign({}, a.genes), main: 'armor', molts: 1, mutant: false, keep: 1, wait: 0, age: 0, ttl: 12 };
    g.units = g.units.filter(x => x !== a); g.hearts.push(h); g.feedT = 0; S.step(g, 1 / 60, { x: 0, y: 0 });
    const re = g.units.find(x => x.genes.ranger === a.genes.ranger && x !== a);
    ok(re && re.main === 'armor', '심장으로 깨어나도 종류는 그대로');
  }

  // 종류별 특수 폭발(다 익은 폭발만)
  {
    const R = C.blastRadius, sp = C.special, dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    // 한 마리만 남긴 판에서 그 키메라를 그 자리에 바로 터뜨린다(가까운 적이 없어 제자리 폭발)
    const blast = (main, inst) => {
      const g = fresh(); const u = g.units[0]; u.main = main; u.genes = { beast: 0, armor: 0, ranger: 0 }; u.genes[main] = 5; u.inst = inst;
      u.x = 9; u.y = 15; S.detonate(g);
      for (let i = 0; i < 90 && g.units.length; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
      return g;
    };
    // 사수: 집속탄 5발이 0.25~0.4초 사이에 차례로 터진다. 잡몹 즉사, 돌격조는 본 폭발의 25%, 초소는 그대로
    {
      const g = fresh(); const u = g.units[0]; u.main = 'ranger'; u.genes = { beast: 0, armor: 0, ranger: 5 }; u.inst = 85; u.x = 9; u.y = 15;
      S.detonate(g);   // 적이 없을 때 눌러 제자리에서 터지게 하고, 적은 그 뒤에 놓는다
      const D = R * sp.ranger.dist, a1 = -Math.PI / 2 + Math.PI * 2 / sp.ranger.n;
      const ring = foe(g, 9, 15 - D - 1, { hp: 9999, maxHp: 9999 });   // 본 폭발 밖, 첫 집속탄 바로 바깥
      const big = foe(g, 9 + (D + 1.2) * Math.cos(a1), 15 + (D + 1.2) * Math.sin(a1), { elite: true, hp: 1000, maxHp: 1000, r: 0.95, mode: 'chase', rechargeT: 99, stun: 99, cd: 99, dmg: 0 });   // 둘째 집속탄에만 닿는다
      g.posts = [{ post: true, x: 9, y: 15 - D - 1.6, r: 0.9, hp: 2, maxHp: 2, cd: 99, dead: false }];
      g.postsTotal = 1;
      let t = 0; while (g.units.length && t < 2) { S.step(g, 1 / 60, { x: 0, y: 0 }); t += 1 / 60; }
      eq(g.clusters.length, sp.ranger.n, '사수 다 익은 폭발: 집속탄 ' + sp.ranger.n + '발');
      ok(!ring.dead, '집속탄이 터지기 전에는 무사하다');
      const fired = [];
      for (let i = 0; i < 40; i++) { g.events = []; S.step(g, 1 / 60, { x: 0, y: 0 }); if (g.events.includes('subboom')) fired.push(i); }
      eq(fired.length, sp.ranger.n, '집속탄은 한 발씩 시차를 두고 터진다');
      ok(fired[fired.length - 1] - fired[0] >= 6, '첫 발과 끝 발 사이에 0.1초 넘는 시차');
      eq(g.clusters.length, 0, '다 터지면 집속탄이 남지 않는다');
      ok(ring.dead, '집속탄: 잡몹은 체력과 상관없이 즉사');
      approx(big.hp, 1000 * (1 - sp.ranger.frac), 1, '집속탄: 돌격조는 본 폭발(최대 체력)의 25%');
      eq(g.posts[0].hp, 2, '집속탄은 초소에 피해를 주지 않는다');
    }
    // 덜 익은 폭발에는 특수 효과가 없다
    for (const m of ['ranger', 'beast', 'armor']) {
      const g = blast(m, 60);
      ok(g.clusters.length === 0 && g.vortexes.length === 0 && g.necro.shieldT === 0, '덜 익은 폭발: 특수 효과 없음 (' + m + ')');
    }
    // 맹수: 소용돌이가 3초 동안 적과 혼을 끈다(돌진 중인 돌격조는 끌지 않는다)
    {
      const g = blast('beast', 85);
      eq(g.vortexes.length, 1, '맹수 다 익은 폭발: 소용돌이');
      const v = g.vortexes[0];
      approx(v.r, R * sp.beast.r, 1e-9, '소용돌이 반경');
      const e = foe(g, v.x + v.r - 0.5, v.y, { stun: 0, cd: 99 }), far = foe(g, v.x + v.r + 2, v.y, { stun: 99 });
      const ch = foe(g, v.x, v.y + v.r - 0.5, { elite: true, hp: 999, maxHp: 999, r: 0.95, mode: 'charge', dx: 0, dy: 0, run: 0, runMax: 99, hitNecro: true, hitUnits: {}, stun: 0, cd: 99 });
      g.souls.push({ x: v.x - v.r + 0.3, y: v.y, type: 'beast', q: 1, ttl: 9 });
      const s = g.souls[g.souls.length - 1], e0 = dist2(e, v), s0 = dist2(s, v), c0 = dist2(ch, v), f0 = far.x;
      for (let i = 0; i < 30; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
      ok(dist2(s, v) < s0 - 2, '소용돌이: 혼을 가운데로 끈다');
      ok(far.x === f0, '소용돌이 밖의 적은 그대로');
      ok(Math.abs(dist2(ch, v) - c0) < 1e-9, '돌진 중인 돌격조는 끌지 않는다');
      ok(dist2(e, v) < e0, '소용돌이: 적을 가운데로 끈다');
      for (let i = 0; i < 60 * 3; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
      eq(g.vortexes.length, 0, '소용돌이는 3초 뒤 사라진다');
    }
    // 갑주: 4초 동안 네크로맨서가 받는 모든 피해(잡몹, 돌격조 돌진, 초소)를 막는다
    {
      const g = blast('armor', 85), n = g.necro;
      approx(n.shieldT, sp.armor.t - 0.1, 0.4, '갑주 다 익은 폭발: 방벽 4초');
      n.hp = 50;
      foe(g, n.x + 0.5, n.y, { stun: 0, cd: 0, dmg: 10 });
      foe(g, n.x - 1, n.y, { elite: true, hp: 999, maxHp: 999, r: 0.95, mode: 'charge', dx: 1, dy: 0, run: 0, runMax: 99, hitNecro: false, hitUnits: {}, stun: 0, cd: 99 });
      g.posts = [{ post: true, x: n.x, y: n.y - 3, r: 0.9, hp: 2, maxHp: 2, cd: 0, dead: false }];
      let blocks = 0;
      for (let i = 0; i < 60 && n.shieldT > 0; i++) { g.events = []; S.step(g, 1 / 60, { x: 0, y: 0 }); blocks += g.events.filter(x => x === 'shieldblock').length; }
      eq(n.hp, 50, '방벽 동안 네크로맨서 체력 그대로');
      ok(blocks >= 3, '잡몹·돌진·초소를 모두 막는다 (막은 수 ' + blocks + ')');
      n.shieldT = 0; g.enemies = []; g.posts[0].cd = 0;
      S.step(g, 1 / 60, { x: 0, y: 0 });
      ok(n.hp < 50, '방벽이 끝나면 다시 맞는다');
    }
  }
  // 초소 변이 3지선다
  {
    const M = C.mut, still = { x: 0, y: 0 };
    const postAt = (g, x, y) => { const p = { post: true, x, y, r: 0.9, hp: C.postHits, maxHp: C.postHits, cd: 99, dead: false }; g.posts.push(p); g.postsTotal = g.posts.length; return p; };
    // 키메라 하나를 (x, y)에 두고 그 자리에서 터뜨린다(적·초소는 그 뒤에 놓는다)
    const bombAt = (g, main, inst, x, y) => {
      const u = g.units[0]; u.main = main; u.genes = { beast: 0, armor: 0, ranger: 0 }; u.genes[main] = 5; u.inst = inst; u.x = x; u.y = y;
      for (const o of g.units) if (o !== u) o.inst = 0;
      g.pinned = null; S.detonate(g); return u;
    };
    const run = (g, n) => { for (let i = 0; i < n; i++) S.step(g, 1 / 60, still); };
    // 초소를 부수면 카드 셋이 나오고, 고를 때까지 판이 멈춘다
    {
      const g = fresh(); bombAt(g, 'beast', 85, 9, 15); postAt(g, 9.5, 15); postAt(g, 9, 30 - 1);
      run(g, 3);
      ok(Array.isArray(g.choice) && g.choice.length === 3 && new Set(g.choice).size === 3 && g.choice.every(id => S.MUTS[id]), '초소를 부수면 서로 다른 카드 셋');
      ok(g.events.includes('choice'), '카드가 나올 때 알린다');
      const t0 = g.t, foeE = foe(g, 9, 5, { stun: 0, cd: 0 }), y0 = foeE.y;
      run(g, 60);
      ok(g.t === t0 && foeE.y === y0, '고르는 동안 판이 완전히 멈춘다');
      ok(!S.chooseMut(g, 'no_such') && g.choice, '없는 카드는 고를 수 없다');
      const other = Object.keys(S.MUTS).find(id => !g.choice.includes(id));
      ok(!S.chooseMut(g, other) && g.choice, '보여 준 셋 밖의 카드는 고를 수 없다');
      const id = g.choice[1]; g.events = [];
      ok(S.chooseMut(g, id) && g.choice === null && g.muts[id] === 1 && g.events.includes('mutpick'), '고르면 그 변이를 가진다');
      run(g, 1); ok(g.t > t0, '고르면 판이 다시 간다');
      // 같은 시드면 같은 카드
      const a = fresh(), b = fresh();
      for (const x of [a, b]) { bombAt(x, 'beast', 85, 9, 15); postAt(x, 9.5, 15); run(x, 3); }
      eq(a.choice.join(), b.choice.join(), '같은 시드면 같은 카드');
    }
    // 한 번에 초소 둘을 부수면 두 번 고른다. 한 번만 가질 수 있는 카드는 다시 나오지 않는다
    {
      const g = fresh(); bombAt(g, 'beast', 85, 9, 15); postAt(g, 10, 15); postAt(g, 8, 15);
      run(g, 3);
      ok(g.choice, '첫째 고르기');
      const first = g.choice.find(id => S.MUTS[id].max === 1) || g.choice[0];
      S.chooseMut(g, first);
      ok(g.choice && g.choice.length === 3, '둘째 고르기가 이어서 나온다');
      if (S.MUTS[first].max === 1) ok(!g.choice.includes(first), '한 번만 가질 수 있는 카드는 다시 나오지 않는다');
      S.chooseMut(g, g.choice[0]); ok(g.choice === null, '다 고르면 판이 간다');
    }
    // 연쇄 도화선: 빽빽한 잡몹 무리에서도 한 번만 이어진다(끝없이 번지지 않는다)
    {
      const g = fresh(); g.muts.chain_fuse = 1; bombAt(g, 'armor', 85, 9, 15);   // 갑주: 소용돌이가 무리를 끌지 않게
      const pack = [];
      for (let i = 0; i < 30; i++) pack.push(foe(g, 9 + (i % 6) * 0.9 - 2.2, 15 + Math.floor(i / 6) * 0.9 - 1.8));
      for (let i = 0; i < 30; i++) pack.push(foe(g, 9 + (i % 6) * 0.9 - 2.2, 18.7 + Math.floor(i / 6) * 0.9));   // 본 폭발 밖 무리
      run(g, 2);
      const firstWave = pack.filter(e => e.dead).length, chains = g.clusters.filter(b => b.isChain).length;
      ok(firstWave > 0 && chains === firstWave, '본 폭발로 죽은 잡몹마다 연쇄 폭발 하나 (' + chains + ')');
      let maxQ = 0; for (let i = 0; i < 60; i++) { S.step(g, 1 / 60, still); maxQ = Math.max(maxQ, g.clusters.length); }
      ok(g.clusters.length === 0 && maxQ <= chains, '연쇄 폭발로 죽은 잡몹은 다시 잇지 않는다');
      ok(pack.some(e => e.dead && e.y > 18.5) && pack.some(e => !e.dead), '연쇄는 한 겹만 번진다');
    }
    // 집속탄으로 죽은 잡몹도 연쇄를 잇는다
    {
      const g = fresh(); g.muts.chain_fuse = 1; bombAt(g, 'ranger', 85, 9, 15); run(g, 2);
      const b = g.clusters[0]; foe(g, b.x, b.y);
      run(g, 30); ok(g.fx.some(f => f.k === 'subboom' && f.chain) || g.clusters.some(c => c.isChain) || g.kills >= 2, '집속탄으로 죽은 잡몹도 연쇄 폭발');
    }
    // 과식 본능: 혼 불안정도 +50%, 익은 폭발 반경 +30%
    {
      const g = fresh(); g.muts.gluttony = 1; soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
      const u = g.units[0]; g.pinned = u.uid; u.inst = 0; soulAt(g, 'beast', 1);
      approx(u.inst, C.soul[1].inst * (1 + M.gluttonyInst), 1e-9, '과식 본능: 불안정도 1.5배');
      const g2 = fresh(); g2.muts.gluttony = 1; bombAt(g2, 'armor', 85, 9, 15); run(g2, 2);
      approx(g2.fx.find(f => f.k === 'boom').r, C.blastRadius * (1 + M.gluttonyR), 1e-9, '과식 본능: 익은 폭발 반경 1.3배');
      const g3 = fresh(); g3.muts.gluttony = 1; bombAt(g3, 'armor', 40, 9, 15); run(g3, 2);
      ok(g3.fx.find(f => f.k === 'boom').r < C.blastRadius, '덜 익은 폭발은 넓어지지 않는다');
    }
    // 쌍둥이 심장: 익은 폭발이면 심장 둘
    {
      const g = fresh(); g.muts.twin_heart = 1; bombAt(g, 'armor', 85, 9, 15); run(g, 2);
      ok(g.hearts.length === 2 && Math.abs(g.hearts[0].x - g.hearts[1].x - 2 * -M.twinDx) < 1e-9, '쌍둥이 심장: 익은 폭발에 심장 둘');
      const g2 = fresh(); g2.muts.twin_heart = 1; bombAt(g2, 'armor', 60, 9, 15); run(g2, 2);
      eq(g2.hearts.length, 1, '덜 익은 폭발은 심장 하나');
    }
    // 흡혈 심장: 심장을 주우면 네크로맨서 +20, 둘레 적 기절
    {
      const g = fresh(); g.muts.blood_heart = 1; const n = g.necro; n.hp = 50; g.units = [];
      const near = foe(g, n.x + 2, n.y, { stun: 0 }), far = foe(g, n.x + 8, n.y, { stun: 0 });
      g.hearts.push({ x: n.x, y: n.y, genes: { beast: 3, armor: 0, ranger: 0 }, main: 'beast', molts: 0, mutant: false, keep: 1, wait: 0, age: 0, ttl: 12 });
      S.step(g, 1 / 60, still);
      ok(g.units.length === 1 && n.hp >= 50 + M.bloodHeal - 5, '흡혈 심장: 계승하면 네크로맨서 회복 (' + n.hp.toFixed(1) + ')');
      ok(near.stun > 1 && far.stun <= 0, '흡혈 심장: 둘레의 적만 기절');
    }
    // 광폭 유지: 익은 채 들어도 체력이 새지 않고 화력 2배
    {
      const g = fresh(); g.spawnT = 1e9; const u = g.units[0]; u.inst = 85; const m = S.stats(u).maxHp; u.hp = m;
      const calm = (u.inst = 0, S.stats(u).dmg); u.inst = 85;
      g.choice = ['mad_blood', 'gluttony', 'twin_heart']; S.chooseMut(g, 'mad_blood');
      run(g, 120);
      ok(u.hp === m && !(u.down > 0), '광폭 유지: 익은 채 2초 들어도 체력 그대로');
      approx(S.stats(u).dmg / calm, M.madFrenzyMul, 1e-9, '광폭 유지: 광기 화력 2배');
      const g2 = fresh(); g2.muts.mad_blood = 1; soulAt(g2, 'armor', 1); ok(g2.units[1].mad, '그 뒤에 되살린 키메라도 광폭 유지');
    }
    // 고속 재연성: 계승하면 불안정도 40%, 5초 동안 공속·이속 2배
    {
      const g = fresh(); g.muts.fast_molt = 1; const n = g.necro; g.units = [];
      g.hearts.push({ x: n.x, y: n.y, genes: { beast: 3, armor: 0, ranger: 0 }, main: 'beast', molts: 0, mutant: false, keep: 1, wait: 0, age: 0, ttl: 12 });
      S.step(g, 1 / 60, still);
      const u = g.units[0], fast = S.stats(u);
      ok(u.inst === M.fastInst && u.hasteT > 4.9, '고속 재연성: 40%에서 시작');
      run(g, 60 * 5 + 2);
      const slow = S.stats(u);
      approx(slow.cd / fast.cd, M.fastMul, 1e-9, '고속 재연성: 공격 간격 절반이 5초 뒤 끝난다'); approx(fast.spd / slow.spd, M.fastMul, 1e-9, '고속 재연성: 이속 2배');
    }
    // 공성 특화: 40% 이상 덜 익은 폭발도 초소를 바로 부수고, 대장 상한 50%
    {
      const g = fresh(); g.muts.post_breaker = 1; bombAt(g, 'beast', 45, 9, 15); const p = postAt(g, 9.4, 15); run(g, 2);
      ok(p.dead, '공성 특화: 45% 폭발로 초소가 한 번에 부서진다');
      const g2 = fresh(); g2.muts.post_breaker = 1; bombAt(g2, 'beast', 20, 9, 15); const p2 = postAt(g2, 9.4, 15); run(g2, 2);
      ok(!p2.dead && p2.hp === C.postHits, '공성 특화: 40% 미만은 그대로 통하지 않는다');
      const g3 = fresh(); g3.muts.post_breaker = 1; bombAt(g3, 'beast', 85, 9, 15);
      const boss = S.spawnBoss(g3); boss.x = 9.5; boss.y = 15; boss.mode = 'chase'; boss.stun = 99; run(g3, 2);
      approx(boss.hp, boss.maxHp * (1 - M.breakerBossCap), 1, '공성 특화: 대장 폭발 상한 50%');
    }
    // 특수 폭발 증폭: 집속탄 8발, 소용돌이 4.5초·반경 1.8배, 방벽 6초
    {
      const g = fresh(); g.muts.mega_special = 1; bombAt(g, 'ranger', 85, 9, 15); run(g, 2); eq(g.clusters.length, C.megaSpecial.rangerN, '증폭: 집속탄 8발');
      const g2 = fresh(); g2.muts.mega_special = 1; bombAt(g2, 'beast', 85, 9, 15); run(g2, 2);
      ok(g2.vortexes[0].maxT === C.megaSpecial.beastT && Math.abs(g2.vortexes[0].r - C.blastRadius * C.megaSpecial.beastR) < 1e-9, '증폭: 소용돌이 4.5초, 반경 1.8배');
      const g3 = fresh(); g3.muts.mega_special = 1; bombAt(g3, 'armor', 85, 9, 15); run(g3, 2);
      ok(g3.necro.shieldT > C.megaSpecial.armorT - 0.1, '증폭: 방벽 6초');
      const n = g3.necro, e = foe(g3, n.x + 0.6, n.y, { stun: 0, cd: 0, dmg: 5 }), d0 = Math.hypot(e.x - n.x, e.y - n.y);
      run(g3, 3);
      ok(Math.hypot(e.x - n.x, e.y - n.y) > d0 + 1, '증폭된 방벽: 막을 때마다 적을 밀어낸다');
    }
  }
  // 9차: 초소 수비대, 무리 스폰, 어그로 분리, 호위, 처치 수
  {
    const still = { x: 0, y: 0 };
    // 수비대: 초소마다 다섯, 1등급, 초소 둘레 1.5~2.4. 네크로맨서가 멀면 서 있다
    {
      const g = S.newGame(9); g.spawnT = 1e9; g.eliteIdx = 99;
      const gs = g.enemies.filter(e => e.guard);
      eq(gs.length, g.posts.length * C.guard.n, '초소마다 수비대 ' + C.guard.n);
      ok(gs.every(e => e.g === 1 && !e.elite && e.home && Math.hypot(e.x - e.home.x, e.y - e.home.y) <= C.guard.r1 + 1e-9 && Math.hypot(e.x - e.home.x, e.y - e.home.y) >= C.guard.r0 - 0.5), '수비대는 1등급, 초소 둘레');
      const pos = gs.map(e => e.x + ',' + e.y).join();
      for (let i = 0; i < 120; i++) S.step(g, 1 / 60, still);
      eq(gs.map(e => e.x + ',' + e.y).join(), pos, '네크로맨서가 멀면 수비대는 움직이지 않는다');
      // 맞은 수비대만 깨어난다
      const hit = gs[0]; hit.bleed = 0.01; hit.bleedT = 0.02; S.step(g, 1 / 60, still);
      const x0 = hit.x, y0 = hit.y; S.step(g, 0.2, still);
      ok(!hit.guard && Math.hypot(hit.x - x0, hit.y - y0) > 0.1 && gs[1].guard, '맞으면 그 수비대만 깨어난다');
      // 네크로맨서가 초소에 다가가면 그 초소의 수비대가 깨어난다
      const home = gs[5].home; g.necro.x = home.x; g.necro.y = home.y + C.guard.wake - 0.5; S.step(g, 1 / 60, still);
      ok(gs.filter(e => e.home === home).every(e => !e.guard) && gs.filter(e => e.home !== home && e !== hit).every(e => e.guard), '다가간 초소의 수비대만 깨어난다');
    }
    // 무리 스폰: 1등급은 한 지점에 뭉쳐 나오고(15초 전 2~3, 뒤 3~4) 체력·공격력이 낮다
    {
      const g = fresh(); g.eliteIdx = 99; g.spawnT = 0; g.necro.hp = 1e9;
      S.step(g, 1 / 60, still);
      const p1 = g.enemies.slice();
      ok(p1.length >= C.pack.early[0] && p1.length <= C.pack.early[1], '15초 전 무리는 2~3마리 (' + p1.length + ')');
      const cx = p1.reduce((a, e) => a + e.x, 0) / p1.length, cy = p1.reduce((a, e) => a + e.y, 0) / p1.length;
      ok(p1.every(e => Math.hypot(e.x - cx, e.y - cy) <= C.pack.r * 2 + 1e-9), '무리는 한 지점에 뭉쳐 나온다');
      const e0 = p1[0];
      const FH = { beast: 18, ranger: 18, armor: 75 }, FD = { beast: 4, ranger: 5, armor: 8 };
      approx(e0.maxHp, FH[e0.arch] * C.pack.hp, 1e-9, '무리 잡몹 체력 0.6배'); approx(e0.dmg, FD[e0.arch] * C.pack.dmg, 1e-9, '무리 잡몹 공격력 0.55배');
      g.enemies = []; g.t = 20; g.spawnT = 0;
      const sizes = [];
      for (let i = 0; i < 40; i++) { const n0 = g.enemies.length; g.spawnT = 0; S.step(g, 1 / 600, still); const add = g.enemies.length - n0; if (add > 1) sizes.push(add); g.enemies = []; }
      ok(sizes.length && sizes.every(n => n >= C.pack.late[0] && n <= C.pack.late[1]), '15초 뒤 무리는 3~4마리 (' + sizes.join(',') + ')');
    }
    // 어그로 분리: 1등급 잡몹은 3.5 안의 키메라를 친다. 2등급은 네크로맨서를 노린다
    {
      const g = fresh(); const n = g.necro, u = g.units[0]; u.x = n.x + 6; u.y = n.y; u.hp = 1e6;
      const small = foe(g, u.x - 3.2, n.y, { stun: 0, cd: 0, dmg: 3 }), mid = foe(g, u.x - 2, n.y + 0.5, { g: 2, stun: 0, cd: 0, dmg: 3 });
      const h0 = n.hp, sx = small.x, mx = mid.x;
      for (let i = 0; i < 6; i++) S.step(g, 1 / 60, still);
      ok(small.x > sx, '1등급 잡몹: 네크로맨서를 두고 3.5 안의 키메라에게 간다');
      ok(mid.x < mx, '2등급: 네크로맨서에게 간다');
      ok(n.hp === h0, '이 사이 네크로맨서는 맞지 않는다');
    }
    // 호위: 키메라는 네크로맨서에게 가장 가까운 적부터 친다
    {
      const g = fresh(); const n = g.necro, u = g.units[0]; u.x = n.x + 3; u.y = n.y; u.cd = 99;
      const nearU = foe(g, u.x + 1, n.y), nearN = foe(g, n.x - 1.5, n.y);
      for (let i = 0; i < 20; i++) S.step(g, 1 / 60, still);
      ok(u.x < n.x + 3 - 0.5 && !nearU.dead, '키메라는 자기 옆 적보다 네크로맨서 옆 적에게 간다');
    }
    // 처치 수: 폭발 fx에 kills, 셋 이상이면 multikill. 집속탄은 살아남은 적을 민다
    {
      const g = fresh(); const u = g.units[0]; u.main = 'armor'; u.inst = 85; u.x = 9; u.y = 15; S.detonate(g);
      for (let i = 0; i < 4; i++) foe(g, 9 + i * 0.5 - 0.75, 15.5);
      S.step(g, 1 / 60, still);
      const b = g.fx.find(f => f.k === 'boom');
      ok(b && b.kills === 4 && g.events.includes('multikill'), '익은 폭발: 처치 4 → multikill');
      const g2 = fresh(); const r = g2.units[0]; r.main = 'ranger'; r.inst = 85; r.x = 9; r.y = 15; S.detonate(g2); S.step(g2, 1 / 60, still);
      const cl = g2.clusters[0], tough = foe(g2, cl.x + 0.8, cl.y, { elite: true, hp: 1e6, maxHp: 1e6, r: 0.95, mode: 'chase', rechargeT: 99, stun: 99, cd: 99, dmg: 0 }), tx = tough.x;
      for (let i = 0; i < 30; i++) S.step(g2, 1 / 60, still);
      ok(tough.x > tx + 0.5 && g2.fx.filter(f => f.k === 'subboom').every(f => typeof f.kills === 'number'), '집속탄: 살아남은 적을 밀고, 처치 수를 넘긴다');
    }
  }
  // 평타 타격감: 잡몹은 맞으면 밀리고 멈칫한다(돌격조는 아니다). 키메라는 휘두르고 적은 번쩍인다(화면용 시간)
  {
    const g = fresh(); const u = g.units[0]; u.x = g.necro.x; u.y = g.necro.y - 2; u.cd = 0;
    const e = foe(g, u.x + u.r + 0.5, u.y, { hp: 999, maxHp: 999, stun: 0 }), x0 = e.x;
    g.events = []; S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(e.hp < 999 && e.x > x0 + C.hit.knock.beast * 0.9 && e.stun > 0 && e.flash > 0 && u.swing > 0, '평타: 잡몹이 밀리고 멈칫하고 번쩍인다, 키메라는 휘두른다');
    ok(g.events.includes('hit:beast'), '평타 소리용 알림(종류별)');
    const g2 = fresh(); const v = g2.units[0]; v.x = g2.necro.x; v.y = g2.necro.y - 2; v.cd = 0;
    const el = foe(g2, v.x + v.r + 0.7, v.y, { elite: true, hp: 999, maxHp: 999, r: 0.95, mode: 'chase', rechargeT: 99, stun: 0, cd: 99 }), ex = el.x;
    S.step(g2, 1 / 60, { x: 0, y: 0 });
    ok(el.hp < 999 && Math.abs(el.x - ex) < 0.1 && !(el.stun > 0), '돌격조는 평타에 밀리거나 멈칫하지 않는다');
  }
  // 뛰어드는 중인 키메라는 혼을 먹지 않는다
  {
    const g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
    const r0 = g.units[0]; g.pinned = r0.uid; foe(g, r0.x, r0.y - 9);
    S.detonate(g);
    const total = S.geneTotal(r0);
    g.souls.push({ x: g.necro.x, y: g.necro.y, type: 'beast', q: 1, ttl: 5 }); S.step(g, 1 / 600, { x: 0, y: 0 });
    ok(r0.state !== 'rush' || S.geneTotal(r0) === total, '뛰어드는 중에는 먹지 않는다');
  }

  // 혼을 먹이거나 되살리면 네크로맨서가 조금 회복한다(최대 체력은 넘지 않고, 심장은 회복하지 않는다)
  {
    const g = fresh(); g.necro.hp = 50;
    soulAt(g, 'armor', 1); eq(g.necro.hp, 50 + C.soul[1].necro, '불량 혼으로 되살리면 회복');
    soulAt(g, 'ranger', 2); eq(g.necro.hp, 50 + C.soul[1].necro + C.soul[2].necro, '신선한 혼으로 되살리면 회복');
    g.pinned = g.units[0].uid; const hp0 = g.necro.hp;
    soulAt(g, 'beast', 1); eq(g.necro.hp, hp0 + C.soul[1].necro, '불량 혼을 먹이면 회복');
    soulAt(g, 'beast', 3); eq(g.necro.hp, hp0 + C.soul[1].necro + C.soul[3].necro, '순혈 코어를 먹이면 크게 회복');
    g.necro.hp = 99; soulAt(g, 'beast', 3); eq(g.necro.hp, 100, '최대 체력은 넘지 않는다');
    g.necro.hp = 50; g.feedT = 0;
    g.hearts.push({ x: g.necro.x, y: g.necro.y, genes: { beast: 2, armor: 0, ranger: 0 }, main: 'beast', molts: 0, mutant: false, age: 0, ttl: 12 });
    S.step(g, 1 / 60, { x: 0, y: 0 }); ok(g.hearts.length === 0 && g.necro.hp === 50, '심장은 회복하지 않는다');
  }

  // 따로 찍지 않아도, 처음 먹은 키메라가 먹일 대상으로 남는다
  {
    const g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
    soulAt(g, 'beast', 1);
    const first = g.units.find(u => S.geneTotal(u) === 2);
    ok(first && g.pinned === first.uid, '처음 먹은 키메라가 찍힌다');
    for (const u of g.units) if (u !== first) { u.x = g.necro.x; u.y = g.necro.y; }
    first.x = g.necro.x + 3;
    soulAt(g, 'beast', 1);
    eq(S.geneTotal(first), 3, '더 가까운 키메라가 있어도 같은 키메라가 계속 먹는다');
  }

  // 어디로 뛰어드나: 네크로맨서에게 가장 가까운 적. 큰 표적은 조금 멀어도 먼저
  {
    const g = fresh(); const u = g.units[0], n = g.necro; u.inst = 90;
    const crowd = [foe(g, n.x - 6, n.y - 4), foe(g, n.x - 6.5, n.y - 4), foe(g, n.x - 6, n.y - 4.5)], nearOne = foe(g, n.x + 2, n.y - 1);
    S.detonate(g); ok(u.target === nearOne, '붐비는 먼 무리가 아니라 가까운 적에게 뛰어든다');
    const g2 = fresh(); const u2 = g2.units[0], n2 = g2.necro; u2.inst = 90;
    const post = { post: true, x: n2.x - 3, y: n2.y - 8, r: 0.9, hp: 2, maxHp: 2, cd: 99, dead: false }; g2.posts = [post];
    const elite = foe(g2, n2.x + 2.5, n2.y, { elite: true, hp: 260, maxHp: 260, r: 0.95, mode: 'chase', rechargeT: 99, stun: 99 });
    S.detonate(g2); ok(u2.target === elite, '돌격조가 가까이 있으면 멀리 있는 초소가 아니라 돌격조에게 뛰어든다');
    const g3 = fresh(); const u3 = g3.units[0], n3 = g3.necro; u3.inst = 90;
    const post3 = { post: true, x: n3.x, y: n3.y - 3, r: 0.9, hp: 2, maxHp: 2, cd: 99, dead: false }; g3.posts = [post3];
    foe(g3, n3.x + 2, n3.y);
    S.detonate(g3); ok(u3.target === post3, '초소 옆에 서 있으면 조금 더 가까운 잡몹이 있어도 초소에게 뛰어든다');
  }

  // 손으로 터뜨리기: 불안정도가 가장 높은 키메라
  g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
  g.units[1].inst = 60; g.units[2].inst = 20;
  ok(S.detonate(g), '더블 탭으로 터뜨릴 수 있다'); eq(g.units[1].state, 'rush', '불안정도가 가장 높은 키메라가 터진다');

  // 연결: 자리가 찼고 혼이 가까우면 연결선이 생긴다(판은 느려지지 않는다)
  g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
  g.souls.push({ x: g.necro.x + 2.5, y: g.necro.y, type: 'beast', q: 1, ttl: 9 });
  const t0 = g.t, x0 = g.necro.x, y0 = g.necro.y;
  S.step(g, 0.1, { x: 0, y: 1 });
  ok(g.link, '자리가 찼고 혼이 가까우면 연결된다');
  ok(Math.abs((g.necro.y - y0) - 0.5) < 1e-9, '네크로맨서는 제 속도로 움직인다');
  ok(Math.abs((g.t - t0) - 0.1) < 1e-9, '판의 시간은 느려지지 않는다');
  ok(Math.abs(g.necro.x - x0) < 1e-9, '옆으로는 움직이지 않았다');
  g.pinned = g.units[2].uid; S.step(g, 0.01, { x: 0, y: 0 });
  eq(g.link.uid, g.units[2].uid, '찍어 둔 키메라가 먹는다');

  // 돌격조: 20초의 1.5초 전에 예고, 달려들고, 잡으면 순혈 코어
  g = S.newGame(9); g.spawnT = 1e9; g.posts = []; g.postsTotal = 0;
  while (g.t < 18.4) S.step(g, 1 / 60, { x: 0, y: 0 });
  ok(!g.enemies.some(e => e.elite), '18.4초에는 아직 없다');
  while (g.t < 18.7) S.step(g, 1 / 60, { x: 0, y: 0 });
  const el = g.enemies.find(e => e.elite);
  ok(el && el.mode === 'warn', '18.5초에 예고와 함께 나타난다');
  g.units = []; g.necro.hp = 100;
  while (el.mode === 'warn') S.step(g, 1 / 60, { x: 0, y: 0 });
  eq(el.mode, 'charge', '예고가 끝나면 달려든다');
  for (let i = 0; i < 240 && el.mode === 'charge'; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
  ok(g.necro.hp <= 100 - C.chargeDmg, '가만히 있으면 들이받힌다');
  eq(el.mode, 'chase', '돌진이 끝나면 쫓아온다');
  el.rechargeT = 0.01; el.stun = 0; S.step(g, 1 / 60, { x: 0, y: 0 });
  eq(el.mode, 'aim', '쫓다가 다시 겨눈다');
  for (let i = 0; i < 120 && el.mode === 'aim'; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
  eq(el.mode, 'charge', '겨눈 뒤 다시 달려든다');
  el.hp = 1; el.bleed = 100; el.bleedT = 1; S.step(g, 1 / 60, { x: 0, y: 0 });
  ok(g.souls.some(s => s.q === 3), '돌격조를 잡으면 순혈 코어가 남는다');

  // 2등급 이상 갑주는 돌진을 받아 내고, 1등급은 튕겨 나간다
  const charge = armorGenes => {
    const g = fresh(), n = g.necro;
    g.units = []; soulAt(g, 'armor', 1);
    const a = g.units[0]; a.genes.armor = armorGenes; a.hp = 1e6; a.x = n.x; a.y = n.y - 3; a.r = 0.6;
    const e = foe(g, n.x, n.y - 9, { elite: true, hp: 999, maxHp: 999, r: 0.95, mode: 'warn', modeT: 0.01, stun: 0, cd: 99, dmg: 0, hitUnits: {}, rechargeT: 99 });
    for (let i = 0; i < 120 && e.mode !== 'chase'; i++) { a.x = n.x; a.y = n.y - 3; S.step(g, 1 / 60, { x: 0, y: 0 }); }
    return g;
  };
  let r = charge(3);
  ok(r.blocks === 1 && r.necro.hp === 100, '2등급 갑주가 길을 막으면 받아 낸다');
  r = charge(1);
  ok(r.blocks === 0 && r.necro.hp < 100, '1등급은 튕겨 나가고 네크로맨서가 맞는다');
  // ---- 목적: 초소 폭파 → 대장 → 구역 정복 ----
  {
    const g0 = S.newGame(3);
    eq(g0.posts.length, 3, '1구역의 초소는 셋'); eq(S.newGame(3, { district: 4 }).posts.length, 5, '구역이 오르면 초소가 늘어 다섯까지');
    for (const d of [1, 2, 3, 4]) { const gd = S.newGame(3, { district: d }); ok(gd.posts.every(p => Math.hypot(p.x - gd.necro.x, p.y - gd.necro.y) > C.postRange + 3), d + '구역: 시작하자마자 초소에 맞지 않는다'); }
    { const gq = S.newGame(3); gq.spawnT = 1e9; gq.eliteIdx = 99; for (let i = 0; i < 300; i++) S.step(gq, 1 / 60, { x: 0, y: 0 }); eq(gq.necro.hp, 100, '가만히 서 있어도 초소에 맞지 않는다'); }
    // 초소는 폭발로만 부서진다: 불안정도가 낮은 폭발은 두 번, 찬 폭발은 한 번
    const blastAt = (g, post, inst) => {
      g.feedT = 0; g.souls.push({ x: g.necro.x, y: g.necro.y, type: 'beast', q: 1, ttl: 5 }); S.step(g, 1 / 60, { x: 0, y: 0 });
      const u = g.units[g.units.length - 1]; u.x = post.x + 1; u.y = post.y; u.inst = inst;
      g.pinned = null; for (const o of g.units) if (o !== u) o.inst = 0;
      S.detonate(g);
      for (let i = 0; i < 90 && g.units.indexOf(u) >= 0; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
      g.hearts = []; g.souls = [];
      g.offered = (g.offered || 0) + (g.choice ? 1 : 0); g.choice = null;   // 변이 카드는 고르지 않고 넘긴다(이 확인은 변이 없이)
    };
    const g = fresh(); g.units = [];
    const p1 = { post: true, x: 4, y: 5, r: 0.9, hp: C.postHits, maxHp: C.postHits, cd: 99, dead: false }, p2 = { post: true, x: 14, y: 5, r: 0.9, hp: C.postHits, maxHp: C.postHits, cd: 99, dead: false };
    g.posts = [p1, p2]; g.postsTotal = 2;
    blastAt(g, p1, 10); ok(!p1.dead && p1.hp === C.postHits, '불안정도 40% 미만의 폭발은 초소에 통하지 않는다');
    blastAt(g, p1, 45); ok(!p1.dead && p1.hp === 1, '반쯤 익은 폭발: 초소가 한 번 깎인다');
    blastAt(g, p1, 45); ok(p1.dead && g.postsDown === 1 && !g.boss, '두 번째에 부서진다. 아직 대장은 없다');
    blastAt(g, p2, 90); ok(p2.dead && g.postsDown === 2, '불안정도가 찬 폭발: 한 번에 부서진다');
    eq(g.offered, 2, '초소를 부술 때마다 변이 카드가 나온다');
    ok(g.boss && g.enemies.indexOf(g.boss) >= 0 && g.boss.mode === 'warn', '초소를 다 부수면 대장이 예고와 함께 나타난다');
    // 대장은 찬 폭발로도 한 번에 죽지 않는다
    const boss = g.boss; boss.mode = 'chase'; boss.stun = 99; boss.x = 9; boss.y = 9;
    blastAt(g, boss, 100);
    ok(!boss.dead && Math.abs(boss.hp - boss.maxHp * (1 - C.bossBlastCap)) < 1, '대장: 다 익은 폭발 한 번에 최대 체력의 35%');
    { const hp0 = boss.hp; blastAt(g, boss, 0); ok(hp0 - boss.hp < boss.maxHp * 0.05, '대장: 덜 익은 폭발은 거의 통하지 않는다'); }
    ok(!g.over, '대장이 살아 있으면 판은 끝나지 않는다');
    boss.hp = 0.5; boss.bleed = 100; boss.bleedT = 1; S.step(g, 1 / 60, { x: 0, y: 0 });
    eq(g.over, 'win', '대장을 잡으면 구역을 차지한다');
    // 버티기만 해서는 이기지 못한다
    const g2 = fresh(); g2.necro.hp = 1e9; for (let i = 0; i < 60 * 100; i++) S.step(g2, 1 / 60, { x: 0, y: 0 });
    ok(!g2.over, '시간이 지나도 이기지 않는다(목적을 이뤄야 한다)');
    // 이어지는 구역: 맹수 하나로 처음부터, 적이 더 세다
    const g3 = S.newGame(3, { district: 3 });
    const a = g3.units[0];
    ok(g3.units.length === 1 && a.main === 'beast' && S.geneTotal(a) === 1 && a.inst === 0 && a.molts === 0, '다음 구역도 맹수 하나로 처음부터 시작한다');
    ok(Math.abs(g3.scale - (1 + 2 * C.districtScale)) < 1e-9 && g3.district === 3, '구역이 오르면 적이 세진다');
  }
  console.log('규칙 확인: 초소 폭파, 대장, 구역 정복, 다음 구역은 처음부터');

  // ---- 골드와 시작 강화 ----
  {
    const G = C.gold, V = S.Save;
    let r, r0, b0;
    // 소환수 능력치 강화: 그 종류의 모든 소환수에 붙는다(시작 맹수, 혼으로 되살린 것, 심장 계승). 유전자는 늘 1에서 시작
    {
      const SS = C.statStep, plain = S.newGame(3).units[0], ps = S.stats(plain);
      eq(S.geneTotal(plain), 1, '시작 맹수는 유전자 1');
      eq(S.geneTotal(S.newGame(3, { start: { genes: 5 } }).units[0]), 1, '예전 시작 유전자 강화는 더 없다');
      const up = { beast: { hp: 2, dmg: 1, cd: 3, spd: 1, range: 2, taken: 4 }, armor: { taken: 5 } };
      const g1 = S.newGame(3, { start: { stat: up } }), u1 = g1.units[0], s1 = S.stats(u1);
      approx(s1.maxHp, ps.maxHp * (1 + 2 * SS.hp), 1e-9, '체력 강화');
      ok(u1.hp === s1.maxHp, '강화된 최대 체력으로 시작');
      approx(s1.dmg, ps.dmg * (1 + SS.dmg), 1e-9, '공격력 강화');
      approx(s1.cd, ps.cd / (1 + 3 * SS.cd), 1e-9, '간격 강화: 짧아진다');
      approx(s1.spd, ps.spd * (1 + SS.spd), 1e-9, '이속 강화');
      approx(s1.range, ps.range * (1 + 2 * SS.range), 1e-9, '사거리 강화');
      approx(s1.taken, ps.taken / (1 + 4 * SS.taken), 1e-9, '받는 피해 강화: 줄어든다');
      // 혼으로 되살린 갑주는 갑주 강화만 받는다
      g1.spawnT = 1e9; g1.eliteIdx = 99; g1.posts = []; g1.feedT = 0;
      g1.souls.push({ x: g1.necro.x, y: g1.necro.y, type: 'armor', q: 1, ttl: 5 }); S.step(g1, 1 / 60, { x: 0, y: 0 });
      const a1 = g1.units.find(u => u.main === 'armor'), aPlain = S.newGame(3);
      aPlain.spawnT = 1e9; aPlain.eliteIdx = 99; aPlain.posts = []; aPlain.feedT = 0;
      aPlain.souls.push({ x: aPlain.necro.x, y: aPlain.necro.y, type: 'armor', q: 1, ttl: 5 }); S.step(aPlain, 1 / 60, { x: 0, y: 0 });
      const a0 = aPlain.units.find(u => u.main === 'armor');
      ok(a1 && a0, '혼으로 갑주를 되살렸다');
      approx(S.stats(a1).taken, S.stats(a0).taken / (1 + 5 * SS.taken), 1e-9, '되살린 갑주: 갑주 강화(받는 피해)');
      approx(S.stats(a1).maxHp, S.stats(a0).maxHp, 1e-9, '되살린 갑주: 맹수 강화(체력)는 받지 않는다');
      // 심장 계승도 같은 종류 강화
      g1.hearts.push({ x: g1.necro.x, y: g1.necro.y, genes: { beast: 2, armor: 0, ranger: 0 }, main: 'beast', molts: 0, mutant: false, age: 0, ttl: 12 });
      g1.units = g1.units.filter(u => u.main !== 'beast'); S.step(g1, 1 / 60, { x: 0, y: 0 });
      const hb = g1.units.find(u => u.main === 'beast');
      ok(hb && hb.up && hb.up.taken === 4, '심장으로 깨어난 맹수도 맹수 강화를 받는다');
      const gx = S.newGame(3, { start: { stat: { beast: { hp: 999, dmg: -3, cd: 'x' }, nope: { hp: 3 } } } });
      ok(gx.statUp.beast.hp === C.gold.statMax && gx.statUp.beast.dmg === 0 && gx.statUp.beast.cd === 0 && !gx.statUp.nope, '능력치 강화: 상한까지만, 이상한 값은 0');
    }
    { const gh = S.newGame(3, { start: { hp: 3 } }); ok(gh.necro.hp === 100 + 3 * G.hpStep && gh.necro.maxHp === gh.necro.hp, '체력 강화: 최대 체력과 시작 체력이 함께 오른다'); }
    eq(S.newGame(3, { start: { hp: 999 } }).necro.maxHp, 100 + G.hpMax * G.hpStep, '체력 강화는 상한까지만');
    eq(S.newGame(3, { start: { hp: 'x' } }).necro.maxHp, 100, '체력 강화: 이상한 값은 0으로');
    { const gh = S.newGame(3, { start: { hp: 2 } }); gh.spawnT = 1e9; gh.eliteIdx = 99; gh.posts = []; gh.necro.hp = gh.necro.maxHp - 1; gh.feedT = 0;
      gh.souls.push({ x: gh.necro.x, y: gh.necro.y, type: 'armor', q: 3, ttl: 5 }); S.step(gh, 1 / 60, { x: 0, y: 0 });
      eq(gh.necro.hp, gh.necro.maxHp, '혼 회복은 강화된 최대 체력까지'); }
    // 저장 읽기: 없으면 새 저장, 옛 최고 기록은 소급 지급, 깨졌으면 기본값(옛 기록으로 다시 옮기지 않는다)
    let sv = V.load(null, null);
    ok(sv.v === 1 && sv.best === 0 && sv.gold === 0 && sv.up.hp === 0 && sv.up.stat.ranger.range === 0 && sv.up.genes === undefined, '저장이 없으면 새 저장');
    sv = V.load(JSON.stringify({ v: 1, best: 2, gold: 4, up: { genes: 3 } }), null);
    ok(sv.gold === 4 + 3 * G.geneRefund && sv.up.genes === undefined && sv.up.hp === 0, '예전 유전자 강화는 쓴 골드로 돌려준다');
    ok(V.load(JSON.stringify(sv), null).gold === sv.gold, '돌려준 저장을 다시 읽어도 두 번 돌려주지 않는다');
    ok(V.load(JSON.stringify({ v: 1, best: 2, gold: 0, up: { genes: 99 } }), null).gold === G.geneMaxOld * G.geneRefund, '돌려주는 골드는 예전 상한까지만');
    b0 = V.buy({ v: 1, best: 2, gold: G.hpCost, up: { hp: 0 } }, 'hp');
    ok(b0.ok && b0.save.gold === 0 && b0.save.up.hp === 1 && b0.save.up.stat.beast.hp === 0, '체력을 사면 골드가 줄고 체력 단계만 오른다');
    ok(!V.buy({ v: 1, best: 9, gold: 99, up: { hp: G.hpMax } }, 'hp').ok, '체력 강화 상한');
    for (const bad of ['nope', 'beast', 'beast.nope', 'nope.hp', '__proto__.hp', 'beast.__proto__', 'beast.toString', 'genes'])
      ok(!V.buy({ v: 1, best: 9, gold: 99, up: {} }, bad).ok && V.cost({ v: 1, best: 9, gold: 99, up: {} }, bad) === null, '모르는 강화는 못 산다: ' + bad);
    { const s0 = { v: 1, best: 2, gold: G.statCost * 2, up: { hp: 1, stat: { armor: { taken: 2 } } } };
      const r1 = V.buy(s0, 'armor.taken');
      ok(r1.ok && r1.save.gold === G.statCost && r1.save.up.stat.armor.taken === 3 && r1.save.up.hp === 1 && s0.up.stat.armor.taken === 2, '능력치를 사면 그 칸만 오르고, 원래 저장은 그대로');
      ok(V.level(r1.save, 'armor.taken') === 3 && V.level(r1.save, 'ranger.taken') === 0, '단계는 종류마다 따로');
      const top = { v: 1, best: 2, gold: 99, up: { stat: { ranger: { range: G.statMax } } } };
      ok(!V.buy(top, 'ranger.range').ok && V.cost(top, 'ranger.range') === null && V.buy(top, 'ranger.dmg').ok, '능력치 상한은 칸마다');
      ok(!V.buy({ v: 1, best: 2, gold: G.statCost - 1, up: {} }, 'beast.dmg').ok, '골드가 모자라면 능력치를 못 산다'); }
    sv = V.load(null, '2');
    ok(sv.best === 2 && sv.gold === 2 * G.perClear, '옛 최고 기록(2구역)은 그만큼 골드를 소급해 준다');
    sv = V.load('{깨짐', '5');
    ok(sv.best === 0 && sv.gold === 0, '새 저장이 깨졌으면 기본값(옛 기록 소급을 되풀이하지 않는다)');
    sv = V.load(JSON.stringify({ v: 1, best: 3, gold: 7, up: { genes: 2 } }), '9');
    ok(sv.best === 3 && sv.gold === 7 + 2 * G.geneRefund, '새 저장이 있으면 옛 기록은 보지 않는다');
    sv = V.load(JSON.stringify({ v: 1, best: -1, gold: 'a', up: { hp: 99, stat: { beast: { hp: 99, dmg: 'x' } } } }), null);
    ok(sv.best === 0 && sv.gold === 0 && sv.up.hp === G.hpMax && sv.up.stat.beast.hp === G.statMax && sv.up.stat.beast.dmg === 0, '이상한 값은 범위 안으로');
    ok(V.load(JSON.stringify({ v: 2, best: 4 }), null).best === 0, '모르는 판의 저장은 기본값');
    sv = V.load('', '2');
    ok(sv.best === 0 && sv.gold === 0, '빈 글의 저장도 깨진 저장이다(옛 기록 소급을 되풀이하지 않는다)');
    r0 = V.clear({ v: 1, best: 999, gold: 0, up: { genes: 0 } }, 1000);
    ok(r0.save.best === 1000 && r0.gained === G.perClear, '999구역을 넘어서도 기록과 골드가 이어진다');
    r0 = V.clear({ v: 1, best: 1e6, gold: 0, up: { genes: 0 } }, 1e6 + 1);
    ok(r0.save.best === 1e6 + 1 && r0.gained === G.perClear, '정복 처리에는 구역 상한이 없다');
    ok(V.clear(V.fresh(), 'x').gained === 0, '이상한 구역 번호는 무시');
    { const big = V.load(null, '333334'); ok(V.load(JSON.stringify(big), null).gold === big.gold, '많이 받은 골드도 다시 읽을 때 잘리지 않는다'); }
    // 정복: 처음 정복한 구역만 골드를 준다
    r = V.clear(V.fresh(), 1);
    ok(r.gained === G.perClear && r.save.best === 1 && r.save.gold === G.perClear, '1구역 처음 정복: 골드');
    const after1 = r.save;
    r = V.clear(after1, 1);
    ok(r.gained === 0 && r.save === after1, '이미 깬 구역을 다시 깨면 골드 없음(쉬운 구역 돌기 차단)');
    r = V.clear(after1, 2);
    ok(r.gained === G.perClear && r.save.best === 2 && after1.best === 1, '다음 구역 정복: 골드, 원래 저장은 그대로');
    // 초소 골드: 부순 초소 하나에 perPost(이기든 지든), 이상한 값은 0
    { const s0 = { v: 1, best: 2, cur: 0, gold: 1, up: { genes: 1, hp: 0 } }, e = V.earn(s0, 3);
      ok(e.gained === 3 * G.perPost && e.save.gold === 1 + 3 * G.perPost && e.save.cur === 0 && e.save.best === 2 && s0.gold === 1, '초소 셋: 골드만 오르고 진행·기록은 그대로');
      ok(V.earn(s0, 0).save === s0 && V.earn(s0, 'x').gained === 0 && V.earn(s0, -2).gained === 0, '초소 0·이상한 값: 골드 없음'); }
    // 1구역으로 되돌리기: 진행(cur)만 0, 최고 기록·골드·강화는 그대로. 다시 깨는 구역은 골드를 또 주지 않는다
    { const s3 = { v: 1, best: 3, cur: 3, gold: 7, up: { hp: 1, stat: { armor: { hp: 2 } } } }, z = V.restart(s3);
      ok(z.cur === 0 && z.best === 3 && z.gold === 7 && z.up.stat.armor.hp === 2 && z.up.hp === 1 && s3.cur === 3, '되돌리기: 진행만 0, 나머지는 그대로(원래 저장은 안 바뀜)');
      let c = V.clear(z, 1);
      ok(c.gained === 0 && c.save.cur === 1 && c.save.best === 3 && c.save.gold === 7, '되돌린 뒤 1구역 정복: 진행만 오르고 골드 없음');
      c = V.clear(V.clear(V.clear(z, 1).save, 2).save, 3);
      ok(c.gained === 0 && c.save.cur === 3 && c.save.gold === 7, '되돌린 뒤 3구역까지 다시: 골드 없음');
      c = V.clear(c.save, 4);
      ok(c.gained === G.perClear && c.save.cur === 4 && c.save.best === 4, '기록을 넘는 구역부터 다시 골드');
      ok(V.load(JSON.stringify(z), null).cur === 0, '되돌린 진행이 다시 읽어도 남는다');
      ok(V.load(JSON.stringify({ v: 1, best: 3, gold: 0, up: {} }), null).cur === 3, 'cur가 없던 저장은 cur=best');
      ok(V.load(JSON.stringify({ v: 1, best: 3, cur: 9, gold: 0, up: {} }), null).cur === 3, 'cur는 best를 넘지 않는다');
      ok(V.load(null, '2').cur === 2, '옛 기록을 옮기면 진행도 그 구역');
      const bz = V.buy({ v: 1, best: 3, cur: 0, gold: 9, up: { hp: 0 } }, 'hp');
      ok(bz.ok && bz.save.cur === 0, '구매가 진행을 바꾸지 않는다'); }
    // 구매: 골드를 빼고 단계를 올리는 것을 함께, 모자라거나 상한이면 거절
    let b = V.buy({ v: 1, best: 2, gold: G.statCost - 1, up: {} }, 'beast.hp');
    ok(!b.ok && b.reason === 'gold' && b.save.gold === G.statCost - 1, '골드가 모자라면 못 산다');
    b = V.buy({ v: 1, best: 2, gold: G.statCost + 1, up: {} }, 'beast.hp');
    ok(b.ok && b.save.gold === 1 && b.save.up.stat.beast.hp === 1 && b.save.best === 2, '사면 골드가 줄고 단계가 오른다');
    b = V.buy({ v: 1, best: 9, gold: 999, up: { stat: { beast: { hp: G.statMax } } } }, 'beast.hp');
    ok(!b.ok && b.reason === 'max', '상한이면 못 산다');
  }
  console.log('규칙 확인: 골드(처음 정복만), 소환수 능력치·네크로맨서 체력 강화, 예전 유전자 강화 환불, 저장 읽기·소급·깨진 저장, 구매');
  console.log('규칙 확인: 되살리기, 흡수와 불안정도, 과부하, 탈피 폭발, 심장 계승, 수동 자폭, 연결, 돌격조와 갑주 방어, 종류별 특수 폭발(집속탄·소용돌이·방벽), 초소 변이 3지선다(멈춤·결정론·연쇄 한 번·카드 8종), 수비대·무리·어그로 분리·호위·처치 수, 평타 타격감');
}

// ---- 봇 ----
// 'play': 혼과 심장을 주우러 다니고, 돌격조가 가까우면 터뜨린다 / 'nomolt': 자리만 채우고 먹이지 않는다 / 'idle'
function bot(g, policy, mem) {
  const n = g.necro; let x = 0, y = 0;
  for (const e of g.enemies) {
    const dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy) + 0.01;
    if (e.elite && (e.mode === 'warn' || e.mode === 'aim' || e.mode === 'charge')) { x += -dy / d * 3; y += dx / d * 3; }   // 돌진은 옆으로 피한다
    else if (d < 6) { x += dx / (d * d) * 2; y += dy / (d * d) * 2; }
  }
  if (policy !== 'idle') {
    const full = g.units.length >= S.CFG.maxUnits;
    const want = g.hearts.concat(policy === 'nomolt' && full ? [] : g.souls);
    let b = null, bd = 1e9;
    for (const p of want) { const d = Math.hypot(p.x - n.x, p.y - n.y) - (p.genes ? 4 : 0) - (p.q === 3 ? 3 : 0); if (d < bd) { bd = d; b = p; } }
    if (b && bd < 10) { const d = Math.hypot(b.x - n.x, b.y - n.y) + 0.01; x += (b.x - n.x) / d * 1.8; y += (b.y - n.y) / d * 1.8; }
    // 'spam': 익히지 않고 틈만 나면 터뜨린다(초소와 대장에게도). 이것이 'play'보다 나으면 안 된다
    if (policy === 'spam' && g.t - mem.last > 1.2 && g.enemies.length) {
      const goal = g.posts.filter(p => !p.dead).concat(g.boss && !g.boss.dead ? [g.boss] : []).sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y))[0];
      if (goal) { const d = Math.hypot(goal.x - n.x, goal.y - n.y) + 0.01; x += (goal.x - n.x) / d * 1.5; y += (goal.y - n.y) / d * 1.5; }
      if (g.units.some(u => u.state === 'ok')) { S.detonate(g); mem.last = g.t; }
    }
    if (policy === 'play') {
      const el = g.enemies.find(e => e.elite && Math.hypot(e.x - n.x, e.y - n.y) < 6 && (e.mode === 'chase' || e.mode === 'aim'));
      if (el && g.t - mem.last > 4 && g.units.some(u => u.state === 'ok' && u.inst >= 45)) { S.detonate(g); mem.last = g.t; }
      const bomb = g.units.filter(u => u.state === 'ok' && u.inst >= 70).sort((a, b) => b.inst - a.inst)[0];
      const goal = g.posts.filter(p => !p.dead).concat(g.boss && !g.boss.dead ? [g.boss] : []).sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y))[0];
      if (bomb && goal) {
        const d = Math.hypot(goal.x - n.x, goal.y - n.y) + 0.01;
        x += (goal.x - n.x) / d * 2.4; y += (goal.y - n.y) / d * 2.4;
        if (Math.hypot(bomb.x - goal.x, bomb.y - goal.y) < 3.4 && g.t - mem.last > 1) { S.detonate(g); mem.last = g.t; }
      }
    }
  }
  x += (g.W / 2 - n.x) * 0.05; y += (g.H - 7 - n.y) * 0.05;   // 할 일이 없으면 시작 지점 근처(초소 사격 밖)에 머문다
  return { x, y };
}
function run(seed, policy, opts, prefer) {
  const g = S.newGame(seed, opts), mem = { last: -9 };
  let guard = 0;
  while (!g.over) {
    if (g.choice) S.chooseMut(g, g.choice.includes(prefer) ? prefer : g.choice[0]);   // 봇은 변이 카드 중 첫 장을 고른다(카드 순서는 시드로 섞인다). prefer가 나오면 그것
    S.step(g, 1 / 60, bot(g, policy, mem));
    g.events.length = 0;
    if (++guard > 60 * 1200) throw new Error('판이 끝나지 않는다');
    if (g.t > 240) { g.over = 'timeout'; break; }   // 4분 안에 못 끝내면 진 것으로 센다
    for (const o of [g.necro, ...g.units, ...g.enemies]) {
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.hp)) throw new Error('NaN at t=' + g.t);
    }
    if (g.units.length > S.CFG.maxUnits) throw new Error('키메라가 셋을 넘었다');
    for (const u of g.units) {
      if (u.state === 'ok' && u.inst >= 100 && !(u.down > 0)) throw new Error('100%인데 터지지 않았다(쓰러진 동안만 예외)');
      if (S.geneTotal(u) < 1 || u.genes[u.main] < 1) throw new Error('유전자가 비었다');
    }
  }
  return g;
}
const label = { play: '익혀서 터뜨림 ', spam: '마구 터뜨림   ', nomolt: '자리만 채움   ', idle: '아무것도 안 함' };
for (const policy of ['play', 'spam', 'nomolt', 'idle']) {
  const N = 40, a = { win: 0, t: 0, kills: 0, absorbs: 0, molts: 0, rebirths: 0, elite: 0, lvl: 0, posts: 0, boss: 0 };
  for (let s = 1; s <= N; s++) {
    const g = run(s, policy);
    if (g.over === 'win') a.win++;
    a.t += g.t; a.kills += g.kills; a.absorbs += g.absorbs; a.molts += g.molts; a.rebirths += g.rebirths; a.elite += g.eliteKills; a.lvl += g.maxLevel; a.posts += g.postsDown; a.boss += g.boss ? 1 : 0;
  }
  const f = v => (v / N).toFixed(1);
  console.log(`${label[policy]} 구역 정복 ${a.win}/${N} · 초소 ${f(a.posts)}/3 · 대장 등장 ${a.boss}판 · 걸린 시간 ${f(a.t)}초 · 잡은 적 ${f(a.kills)} · 흡수 ${f(a.absorbs)} · 탈피 ${f(a.molts)} · 계승 ${f(a.rebirths)} · 돌격조 처치 ${f(a.elite)} · 최고 등급 ${f(a.lvl)}`);
}
// '마구 터뜨림'(익히지 않고 틈만 나면 터뜨림)은 이기면 안 된다. 시작 강화를 다 사고 1구역에 돌아가도
{
  const N = 40;
  const maxStat = {}; for (const k of S.KINDS) { maxStat[k] = {}; for (const st of Object.keys(S.CFG.statStep)) maxStat[k][st] = S.CFG.gold.statMax; }
  for (const opts of [undefined, { district: 1, start: { stat: maxStat, hp: S.CFG.gold.hpMax } }]) {
    let w = 0; for (let s = 1; s <= N; s++) if (run(s, 'spam', opts).over === 'win') w++;
    if (w) throw new Error('마구 터뜨림이 이겼다 ' + w + '/' + N + ' ' + JSON.stringify(opts || {}));
  }
  console.log('구멍 확인: 마구 터뜨림 0/40 (강화 없음, 최대 강화로 1구역)');
}

// 참고: 골드로 산 시작 강화가 구역 배율(+25%)을 얼마나 상쇄하나. 'd구역 시작 때 그때까지 번 골드로 살 수 있는 만큼' vs 강화 없음.
// 재미 판정이 아니다. 지표: 정복, 처음 먹인 시각, 다 익은 폭발 수, 다 익은 폭발 없이 끝난 판, 처음 다 익은 폭발 시각
// 참고: 변이 카드 하나를 나올 때마다 고르면 정복이 얼마나 느나(재미 판정이 아니다). 'play' 봇, 강화 없음
if (process.argv.includes('--muts')) {
  const N = 40;
  console.log('카드 | 1구역 | 2구역 | 3구역');
  for (const id of [null, ...Object.keys(S.MUTS)]) {
    const row = [1, 2, 3].map(d => { let w = 0; for (let s = 1; s <= N; s++) if (run(s, 'play', { district: d }, id).over === 'win') w++; return w + '/' + N; });
    console.log((id ? S.MUTS[id].name : '아무거나(첫 장)') + ' | ' + row.join(' | '));
  }
}
if (process.argv.includes('--gold')) {
  const G = S.CFG.gold, N = 40;
  // d구역까지 번 골드(처음 정복만 셈)를 모든 종류의 체력·공격력에 고르게 쓴 단계 수
  const boughtFor = d => { let gold = (d - 1) * (G.perClear + 3 * G.perPost), k = 0; while (k < G.statMax && gold >= G.statCost * 6) { gold -= G.statCost * 6; k++; } return k; };
  const statFor = k => { const o = {}; for (const kind of S.KINDS) o[kind] = { hp: k, dmg: k }; return o; };
  console.log('구역 | 강화 | 정복 | 처음 먹임 | 익은 폭발 | 익은 폭발 없음 | 처음 익은 폭발');
  for (let d = 1; d <= 6; d++) for (const k of [...new Set([0, boughtFor(d)])]) {
    const a = { win: 0, feed: [], ripe: 0, none: 0, firstRipe: [] };
    for (let s = 1; s <= N; s++) {
      const g = run(s, 'play', { district: d, start: { stat: statFor(k) } });
      if (g.over === 'win') a.win++;
      if (g.firstFeedT !== null) a.feed.push(g.firstFeedT);
      a.ripe += g.ripeBlasts; if (!g.ripeBlasts) a.none++; else a.firstRipe.push(g.firstRipeT);
    }
    const avg = v => v.length ? (v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) + '초' : '-';
    console.log(`${d}구역 | 체력·공격력 +${k} | ${a.win}/${N} | ${avg(a.feed)} | ${(a.ripe / N).toFixed(1)} | ${a.none}/${N} | ${avg(a.firstRipe)}`);
  }
}

const a = run(7, 'play'), b = run(7, 'play');
if (a.kills !== b.kills || a.t !== b.t) throw new Error('같은 시드인데 결과가 다르다');
console.log('재현성 확인: 같은 시드 같은 결과');
