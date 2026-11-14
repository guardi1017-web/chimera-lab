// 6차 규칙을 확인하고, 봇으로 90초 판을 돌려 예외·NaN이 없는지 본다.
const S = require('./src/sim.js');
const C = S.CFG;
const eq = (a, b, msg) => { if (a !== b) throw new Error(msg + ' (기대 ' + b + ', 실제 ' + a + ')'); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };

// ---- 규칙 ----
{
  const fresh = () => { const g = S.newGame(5); g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.postsTotal = 0; return g; };   // 적도 초소도 없는 빈 판
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
  eq(u.genes.beast, 1, '유전자는 종류별로 쌓인다'); eq(u.genes.ranger, 2, '유전자는 종류별로 쌓인다'); eq(u.main, 'ranger', '가장 많은 유전자가 주 유전자');
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
    ok(g.units.length === 3 && g.hearts.length === 0 && g.units[1].genes.beast === 4 && g.units[1].main === 'beast', '만석 심장: 찍어 둔 키메라가 유전자를 삼킨다');
  }

  // 주 유전자가 바뀌어 최대 체력이 줄어도 체력은 음수가 되지 않는다
  {
    const g = fresh(); soulAt(g, 'armor', 1); soulAt(g, 'ranger', 1);
    const a = g.units[1]; g.pinned = a.uid; a.hp = 10;
    soulAt(g, 'ranger', 1); soulAt(g, 'ranger', 1);
    ok(a.main === 'ranger' && a.hp >= 10 && a.hp <= S.stats(a).maxHp, '주 유전자가 바뀌어도 체력은 깎이지 않는다 (hp=' + a.hp.toFixed(1) + ')');
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
    };
    const g = fresh(); g.units = [];
    const p1 = { post: true, x: 4, y: 5, r: 0.9, hp: C.postHits, maxHp: C.postHits, cd: 99, dead: false }, p2 = { post: true, x: 14, y: 5, r: 0.9, hp: C.postHits, maxHp: C.postHits, cd: 99, dead: false };
    g.posts = [p1, p2]; g.postsTotal = 2;
    blastAt(g, p1, 10); ok(!p1.dead && p1.hp === C.postHits, '불안정도 40% 미만의 폭발은 초소에 통하지 않는다');
    blastAt(g, p1, 45); ok(!p1.dead && p1.hp === 1, '반쯤 익은 폭발: 초소가 한 번 깎인다');
    blastAt(g, p1, 45); ok(p1.dead && g.postsDown === 1 && !g.boss, '두 번째에 부서진다. 아직 대장은 없다');
    blastAt(g, p2, 90); ok(p2.dead && g.postsDown === 2, '불안정도가 찬 폭발: 한 번에 부서진다');
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
  console.log('규칙 확인: 되살리기, 흡수와 불안정도, 과부하, 탈피 폭발, 심장 계승, 수동 자폭, 연결, 돌격조와 갑주 방어');
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
function run(seed, policy) {
  const g = S.newGame(seed), mem = { last: -9 };
  let guard = 0;
  while (!g.over) {
    S.step(g, 1 / 60, bot(g, policy, mem));
    g.events.length = 0;
    if (++guard > 60 * 1200) throw new Error('판이 끝나지 않는다');
    if (g.t > 240) { g.over = 'timeout'; break; }   // 4분 안에 못 끝내면 진 것으로 센다
    for (const o of [g.necro, ...g.units, ...g.enemies]) {
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.hp)) throw new Error('NaN at t=' + g.t);
    }
    if (g.units.length > S.CFG.maxUnits) throw new Error('키메라가 셋을 넘었다');
    for (const u of g.units) {
      if (u.state === 'ok' && u.inst >= 100) throw new Error('100%인데 터지지 않았다');
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
const a = run(7, 'play'), b = run(7, 'play');
if (a.kills !== b.kills || a.t !== b.t) throw new Error('같은 시드인데 결과가 다르다');
console.log('재현성 확인: 같은 시드 같은 결과');
