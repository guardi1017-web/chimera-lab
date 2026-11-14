// 키메라 실험 7차: 유전자 누적 + 불안정도 탈피(자폭 뒤 심장 계승) + 돌격조.
// 한 판의 목적: 봉쇄 초소를 탈피 폭발로 모두 부수고, 나타난 대장을 잡는다. 구역마다 키메라는 처음부터 키운다.
// 규칙만 담는다(화면·DOM 없음). 같은 시드면 같은 판이 나온다.
(function (root) {
  'use strict';
  const W = 18, H = 30, DURATION = 90, MAX_LEVEL = 10;
  const KINDS = ['beast', 'armor', 'ranger'];

  // 밸런스 값은 여기 모은다.
  const CFG = {
    maxUnits: 3,
    absorbRange: 3.2,          // 자리가 찼을 때 이 안의 혼에 다가가면 연결선이 생긴다
    pickRadius: 1.1,
    // 혼의 품질: 1 불량(잡몹), 2 신선(중형), 3 순혈 코어(돌격조)
    soul: {
      1: { gene: 1, inst: 24, heal: 0, necro: 1 },
      2: { gene: 2, inst: 12, heal: 0.5, necro: 3 },
      3: { gene: 3, inst: -1, heal: 1, necro: 8 },   // inst -1 = 불안정도를 0으로 식힌다. necro: 혼을 먹이거나 되살릴 때 네크로맨서가 회복하는 양
    },
    soulTtl: 10, soulCap: 12,
    frenzyAt: 80, frenzyMul: 1.5,
    blastRadius: 3.2, blastEliteFrac: 0.1, blastKnock: 3, blastStun: 1.2,
    rushSpeed: 14, rushMax: 1.0, rushReach: 10, rushBigBonus: 1.5,   // 뛰어들 수 있는 거리, 큰 표적에게 주는 거리 덤
    // 덜 익은 폭탄(불안정도 80% 미만)은 약하고 대가가 있다: 반경이 좁고, 잡몹을 즉사시키지 못하고, 심장이 유전자를 덜 지킨다
    blastMinRadius: 0.5, blastWeakMul: 3, heartWeakKeep: 0.6,
    heartWeakWait: 3,          // 덜 익은 채 터진 심장은 식을 때까지(최대 4초) 주울 수 없다
    postMinCharge: 0.5,        // 불안정도 40% 미만의 폭발은 초소에 통하지 않는다
    feedGap: 0.35, feedGapAfterRebirth: 0.8,           // 흡수 사이의 실제 시간 간격(초). 혼 더미 위에서 한꺼번에 먹지 않게
    heartTtl: 12, heartFullFor: 4, heartMinKeep: 0.8,   // 심장은 4초 안에 주우면 유전자 100%, 12초째에는 80%
    moltBonus: 0.1, mutantBonus: 0.2,
    statPerGene: 0.35,
    eliteFirst: 20, eliteEvery: 25, eliteWarn: 1.5,   // 돌격조는 20초에 처음, 그 뒤 25초마다
    postHits: 2, postRange: 4.2, postDmg: 3, postCd: 1.5,   // 초소: 폭발 두 번(불안정도가 찬 폭발은 한 번)에 부서진다
    bossHp: 600, bossBlastCap: 0.35,                   // 대장: 폭발 한 번에 최대 체력의 35%까지만
    districtScale: 0.25,                               // 구역이 하나 오를 때마다 적의 체력과 피해가 이만큼 더
    // 골드: 구역을 처음 정복할 때만 받는다(이미 깬 구역은 0). 판 밖(끝 화면)에서 시작 맹수의 유전자와 네크로맨서 체력을 산다
    gold: { perClear: 3, geneCost: 3, geneMax: 8, hpCost: 3, hpStep: 25, hpMax: 8 },
    eliteHp: 260, eliteHpStep: 0.5,
    chargeSpeed: 13, chargeDmg: 25, eliteDmg: 12, rechargeEvery: 7, aimTime: 1.2,
    spawnStart: 1.8, spawnEnd: 1.05, foeGradeMul: 1.35,
  };
  // 주 유전자별 기본 능력(유전자 1개 기준)
  const BASE = {
    beast:  { hp: 50,  dmg: 7, cd: 0.5, spd: 6.6, range: 0.3, taken: 1,   skillCd: 4 },
    armor:  { hp: 120, dmg: 6, cd: 0.9, spd: 5.6, range: 0.3, taken: 0.7, skillCd: 0 },   // 갑주의 기술은 맞은 횟수로 터진다
    ranger: { hp: 42,  dmg: 7, cd: 0.9, spd: 5.8, range: 5.5, taken: 1,   skillCd: 3.5 },
  };
  const FOE = {
    beast:  { hp: 18, dmg: 4, cd: 0.7, spd: 4.5, range: 0.25, r: 0.42 },
    armor:  { hp: 75, dmg: 8, cd: 1.2, spd: 2.2, range: 0.3,  r: 0.6 },
    ranger: { hp: 18, dmg: 5, cd: 1.8, spd: 2.8, range: 5.5,  r: 0.42 },
  };
  const NECRO_SPEED = 5.0, LEASH = 6.5;

  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function geneTotal(u) { return u.genes.beast + u.genes.armor + u.genes.ranger; }
  // 등급: 유전자 2개에 2, 5개에 3, 10개에 4 … 82개에 10. 높을수록 많이 먹어야 오른다.
  function levelOf(u) { return Math.min(MAX_LEVEL, 1 + Math.floor(Math.sqrt(geneTotal(u) - 1))); }
  function radiusOf(u) { return 0.5 + 0.09 * (levelOf(u) - 1); }
  function isFrenzy(u) { return u.inst >= CFG.frenzyAt; }
  // 주 유전자는 가장 많은 것. 같으면 지금의 주 유전자를 유지한다.
  function refreshMain(u) {
    for (const k of KINDS) if (u.genes[k] > u.genes[u.main]) u.main = k;
  }

  // 능력과 기술은 모두 유전자 개수에서 나온다. 주 유전자가 몸과 기술을, 섞인 유전자가 그 변형을 정한다.
  function stats(u) {
    const g = u.genes, b = BASE[u.main], total = geneTotal(u);
    const sb = u.main === 'beast' ? 0 : g.beast, sa = u.main === 'armor' ? 0 : g.armor, sr = u.main === 'ranger' ? 0 : g.ranger;
    const m = (1 + CFG.statPerGene * (total - 1)) * (1 + CFG.moltBonus * u.molts) * (u.mutant ? 1 + CFG.mutantBonus : 1);
    const fz = isFrenzy(u) ? CFG.frenzyMul : 1;
    return {
      level: levelOf(u), total,
      maxHp: b.hp * m * (1 + 0.15 * sa),
      dmg: b.dmg * m * fz,
      cd: b.cd / ((1 + 0.06 * sb) * fz),
      spd: b.spd * (1 + 0.06 * sb),
      range: b.range, ranged: u.main === 'ranger',
      taken: b.taken / (1 + 0.12 * sa),
      taunt: u.main === 'armor',
      lifesteal: Math.min(0.3, 0.05 * sb),             // 맹수 섞임: 흡혈
      skillCd: b.skillCd / (1 + 0.12 * sb),            // 맹수 섞임: 기술이 빨리 돈다
      knock: (u.main === 'armor' ? 1.2 : 0) + Math.min(2.5, 0.5 * sa),   // 갑주 섞임: 밀치기
      stun: sa >= 2 ? 0.3 : 0,
      shards: Math.min(8, sr),                         // 사수 섞임: 기술을 쓸 때 사방으로 파편
    };
  }

  function makeUnit(g, genes, main, x, y) {
    const u = {
      uid: g.nextUid++, x, y, genes: { beast: genes.beast || 0, armor: genes.armor || 0, ranger: genes.ranger || 0 }, main,
      inst: 0, molts: 0, mutant: false, hp: 0, r: 0.5, cd: 0, skillT: 2, hitsTaken: 0, down: 0, pop: 0.5, face: -Math.PI / 2,
      state: 'ok', rushT: 0, tx: x, ty: y,
    };
    refreshMain(u);
    u.r = radiusOf(u);
    u.hp = stats(u).maxHp;
    g.maxLevel = Math.max(g.maxLevel, levelOf(u));
    return u;
  }

  // 초소 자리: 시작 지점(아래쪽)에서 먼 순서. 가장 가까운 것도 사격 범위의 두 배쯤 떨어져 있다.
  const POST_SPOTS = [[4, 16], [14, 13], [8, 7.5], [15, 4.5], [3, 3.5], [9, 1.5]];

  // opts.district: 몇 번째 구역인지(1부터). 키메라는 구역마다 맹수 하나로 처음부터 키운다.
  // opts.start: 골드로 산 시작 강화 { genes: 시작 맹수에 더할 유전자 수, hp: 네크로맨서 체력 단계 }. 불안정도는 늘 0으로 시작한다.
  function newGame(seed, opts) {
    opts = opts || {};
    const district = Math.max(1, opts.district || 1);
    const g = {
      W, H, DURATION, t: 0, over: null, rand: mulberry(seed || 1), nextUid: 1,
      necro: { x: W / 2, y: H - 3.5, hp: 100, maxHp: 100, r: 0.5, hurt: 0 },
      units: [], enemies: [], souls: [], hearts: [], fx: [], events: [],
      pinned: null,             // 먹일 대상으로 찍어 둔 키메라(없으면 혼에 가장 가까운 키메라)
      link: null,               // 지금 연결된 혼과 키메라(화면의 예고선)
      feedT: 0,                 // 0이 되어야 다음 혼을 먹일 수 있다(실제 시간)
      eliteIdx: 0, spawnT: 1.2,
      kills: 0, raised: 0, absorbs: 0, molts: 0, rebirths: 0, eliteKills: 0, blocks: 0, maxLevel: 1,
      ripeBlasts: 0, firstFeedT: null, firstRipeT: null,   // 지표: 다 익은 폭발 수, 처음 먹인 시각, 처음 다 익은 폭발 시각
      district, scale: 1 + CFG.districtScale * (district - 1),
      posts: [], postsTotal: 0, postsDown: 0, boss: null,
    };
    // 네크로맨서는 직접 싸우지 못한다. 맹수 하나와 시작한다(골드로 산 만큼 유전자가 많다).
    const step = (v, max) => { const n = Math.floor(+(v || 0)); return Number.isFinite(n) ? clamp(n, 0, max) : 0; };
    const st = opts.start || {}, extra = step(st.genes, CFG.gold.geneMax);
    g.necro.maxHp = g.necro.hp = 100 + CFG.gold.hpStep * step(st.hp, CFG.gold.hpMax);   // 골드로 산 체력
    g.units.push(makeUnit(g, { beast: 1 + extra }, 'beast', g.necro.x, g.necro.y + 1.5));
    // 봉쇄 초소: 구역이 오를수록 많아진다(셋에서 다섯까지)
    // 구역은 아래에서 시작해 위로 밀고 올라간다. 가까운 초소부터 놓는다.
    const spots = POST_SPOTS;
    const count = Math.min(5, 2 + district);
    for (let i = 0; i < count; i++) g.posts.push({ post: true, x: spots[i][0], y: spots[i][1], r: 0.9, hp: CFG.postHits, maxHp: CFG.postHits, cd: 1, dead: false });
    g.postsTotal = count;
    return g;
  }

  function moveToward(o, tx, ty, d) {
    const dx = tx - o.x, dy = ty - o.y, m = Math.hypot(dx, dy);
    if (m < 1e-4) return;
    const k = Math.min(1, d / m);
    o.x += dx * k; o.y += dy * k;
    o.face = Math.atan2(dy, dx);
  }
  function knock(e, fromX, fromY, d) {
    const a = Math.atan2(e.y - fromY, e.x - fromX);
    e.x = clamp(e.x + Math.cos(a) * d, 0.4, W - 0.4);
    e.y = clamp(e.y + Math.sin(a) * d, 0.4, H - 0.4);
  }
  function edgePoint(g, minDist) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 8; tries++) {
      const side = Math.floor(g.rand() * 4), u = g.rand();
      x = side === 0 ? 0.6 : side === 1 ? W - 0.6 : u * W;
      y = side === 2 ? 0.6 : side === 3 ? H - 0.6 : u * H;
      if (Math.hypot(x - g.necro.x, y - g.necro.y) > minDist) break;
    }
    return { x, y };
  }

  function spawn(g, dt) {
    // 돌격조: 정해진 시각의 1.5초 전에 경고와 함께 화면 끝에 나타난다
    if (g.t >= CFG.eliteFirst + CFG.eliteEvery * g.eliteIdx - CFG.eliteWarn) {
      const p = edgePoint(g, 9), hp = CFG.eliteHp * (1 + CFG.eliteHpStep * Math.min(g.eliteIdx, 4)) * g.scale;
      g.enemies.push({
        elite: true, arch: KINDS[g.eliteIdx % 3], g: 3, x: p.x, y: p.y, hp, maxHp: hp, dmg: CFG.eliteDmg * g.scale, r: 0.95,
        cd: 0.5, face: 0, stun: 0, bleed: 0, bleedT: 0,
        mode: 'warn', modeT: CFG.eliteWarn, dx: 0, dy: 0, run: 0, runMax: 0, hitNecro: false, hitUnits: {}, rechargeT: CFG.rechargeEvery,
      });
      g.eliteIdx++;
      g.events.push('warn');
    }
    g.spawnT -= dt;
    if (g.spawnT > 0 || g.enemies.length >= 36) return;
    const k = Math.min(1, g.t / DURATION), r = g.rand(), r2 = g.rand();
    g.spawnT = (CFG.spawnStart + (CFG.spawnEnd - CFG.spawnStart) * k) * (0.8 + 0.4 * g.rand());
    let arch = 'beast';
    if (g.t >= 10 && g.t < 35) arch = r < 0.6 ? 'beast' : 'ranger';
    else if (g.t >= 35) arch = r < 0.42 ? 'beast' : r < 0.7 ? 'ranger' : 'armor';
    let grade = 1;
    if (g.t >= 18) grade = r2 < (g.t < 50 ? 0.7 : 0.5) ? 1 : 2;
    const n = arch === 'beast' && grade === 1 && g.t > 30 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p = edgePoint(g, 7), f = FOE[arch], m = Math.pow(CFG.foeGradeMul, grade - 1), hp = f.hp * m * (grade === 2 ? 1.6 : 1) * g.scale;
      g.enemies.push({ elite: false, arch, g: grade, x: p.x, y: p.y, hp, maxHp: hp, dmg: f.dmg * m * g.scale, r: f.r + 0.12 * (grade - 1), cd: 0.4, face: 0, stun: 0, bleed: 0, bleedT: 0 });
    }
  }

  function killEnemy(g, e) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    g.kills++;
    if (e.elite) { g.eliteKills++; g.events.push('elitedown'); }
    if (e.boss && !g.over) { g.over = 'win'; g.events.push('win'); }   // 대장을 잡으면 구역을 차지한다
    g.fx.push({ k: 'die', x: e.x, y: e.y, arch: e.arch, big: e.elite, t: 0.35 });
    const q = e.elite ? 3 : e.g >= 2 ? 2 : 1;
    // 순혈 코어는 개수 제한과 상관없이 반드시 남는다
    if (q === 3 || g.souls.length < CFG.soulCap) {
      g.souls.push({ x: clamp(e.x, 0.8, W - 0.8), y: clamp(e.y, 0.8, H - 0.8), type: e.arch, q, ttl: q === 3 ? CFG.soulTtl * 1.5 : CFG.soulTtl });
    }
  }
  function damageEnemy(g, e, dmg, u, s) {
    if (e.dead) return;
    e.hp -= dmg;
    if (u && s && s.lifesteal > 0 && u.down <= 0) u.hp = Math.min(s.maxHp, u.hp + dmg * s.lifesteal);
    if (e.hp <= 0) killEnemy(g, e);
  }
  function hurtUnit(g, u, dmg) {
    if (u.state !== 'ok' || u.down > 0) return;
    const s = stats(u);
    if (s.taken < 0.99) g.fx.push({ k: 'block', x: u.x, y: u.y, face: u.face, r: u.r, t: 0.18 });
    u.hp -= dmg * s.taken;
    u.hitsTaken++;
    if (u.hp <= 0) { u.hp = 0; u.down = 6; g.fx.push({ k: 'down', x: u.x, y: u.y, t: 0.5 }); }
  }

  // 사수 섞임: 기술을 쓸 때 가까운 적들에게 파편이 날아간다
  function shards(g, u, s) {
    if (s.shards <= 0) return;
    const near = g.enemies.filter(e => !e.dead && dist(e, u) < 4.5).sort((a, b) => dist(a, u) - dist(b, u));
    for (let i = 0; i < s.shards; i++) {
      const a = i * Math.PI * 2 / s.shards, e = near.length ? near[i % near.length] : null;
      g.fx.push({ k: 'shot', x: u.x, y: u.y, tx: e ? e.x : u.x + Math.cos(a) * 3, ty: e ? e.y : u.y + Math.sin(a) * 3, arch: 'ranger', t: 0.2 });
      if (e) damageEnemy(g, e, s.dmg * 0.5, u, s);
    }
  }
  function applyControl(e, u, s) {
    if (e.dead) return;
    if (s.knock > 0 && !(e.elite && e.mode === 'charge')) knock(e, u.x, u.y, e.elite ? s.knock * 0.4 : s.knock);
    if (s.stun > 0) e.stun = Math.max(e.stun, e.elite ? s.stun * 0.5 : s.stun);
  }

  // 주력 기술. 주 유전자가 무엇이냐에 따라 다르다.
  function useSkill(g, u, s, best, bd) {
    if (u.main === 'beast') {
      if (!best || bd > 6) return false;
      // 피의 도약: 적에게 뛰어들어 물어뜯고 출혈을 남긴다
      const a = Math.atan2(best.y - u.y, best.x - u.x), fx0 = { x: u.x, y: u.y };
      u.x = best.x - Math.cos(a) * (best.r + u.r) * 0.9; u.y = best.y - Math.sin(a) * (best.r + u.r) * 0.9; u.face = a;
      g.fx.push({ k: 'leap', x: fx0.x, y: fx0.y, tx: u.x, ty: u.y, t: 0.25 });
      best.bleed = Math.max(best.bleed, s.dmg * 0.5); best.bleedT = 3;
      damageEnemy(g, best, s.dmg * 2.5, u, s);
      applyControl(best, u, s); shards(g, u, s);
      return true;
    }
    if (u.main === 'ranger') {
      if (!best || bd > 6.5) return false;
      // 일제 사격: 바라보는 쪽 부채꼴로 뼈 화살을 연달아 쏜다
      const a = Math.atan2(best.y - u.y, best.x - u.x);
      const cone = g.enemies.filter(e => {
        if (e.dead || dist(e, u) > 7) return false;
        let d = Math.atan2(e.y - u.y, e.x - u.x) - a; d = Math.atan2(Math.sin(d), Math.cos(d));
        return Math.abs(d) < 0.7;
      }).sort((p, q) => dist(p, u) - dist(q, u));
      for (let i = 0; i < 5; i++) {
        const e = cone.length ? cone[i % cone.length] : null, off = (i - 2) * 0.28;
        g.fx.push({ k: 'shot', x: u.x, y: u.y, tx: e ? e.x : u.x + Math.cos(a + off) * 6, ty: e ? e.y : u.y + Math.sin(a + off) * 6, arch: 'ranger', t: 0.22 });
        if (e) { damageEnemy(g, e, s.dmg * 0.8, u, s); applyControl(e, u, s); }
      }
      g.fx.push({ k: 'volley', x: u.x, y: u.y, face: a, t: 0.25 });
      return true;
    }
    return false;
  }
  // 고통의 반격(갑주): 네 번 맞으면 둘레에 충격파가 터진다
  function shockwave(g, u, s) {
    u.hitsTaken = 0;
    const R = 2.6 + u.r;
    for (const e of g.enemies) {
      if (e.dead || dist(e, u) > R) continue;
      damageEnemy(g, e, s.dmg * 1.5, u, s);
      applyControl(e, u, s);
    }
    g.fx.push({ k: 'wave', x: u.x, y: u.y, r: R, t: 0.3 });
    shards(g, u, s);
  }

  // 혼을 먹인다: 유전자가 쌓이고 불안정도가 오른다(순혈 코어는 0으로 식힌다).
  // 혼을 먹이거나 되살리면 네크로맨서도 조금 회복한다(심장은 회복하지 않는다)
  function healNecro(g, q) {
    const n = g.necro;
    if (n.hp > 0) n.hp = Math.min(n.maxHp, n.hp + CFG.soul[q].necro);
  }

  function absorb(g, u, soul) {
    const c = CFG.soul[soul.q], before = stats(u).maxHp, wasFrenzy = isFrenzy(u);
    u.genes[soul.type] += c.gene;
    refreshMain(u);
    if (c.inst < 0) { u.inst = 0; u.mutant = true; } else u.inst += c.inst;
    const after = stats(u).maxHp;
    if (u.down > 0 && c.heal > 0) u.down = 0;
    u.hp = Math.min(after, Math.max(u.hp, u.hp + (after - before)) + after * c.heal);
    u.r = radiusOf(u); u.pop = 0.5;
    g.absorbs++; if (g.firstFeedT === null) g.firstFeedT = g.t;
    g.maxLevel = Math.max(g.maxLevel, levelOf(u));
    g.fx.push({ k: 'absorb', x: soul.x, y: soul.y, uid: u.uid, type: soul.type, q: soul.q, t: 0.35 });
    g.events.push(soul.q === 3 ? 'purify' : 'absorb');
    if (!wasFrenzy && isFrenzy(u)) g.events.push('frenzy');
    if (u.inst >= 100) startMolt(g, u);
  }

  // 탈피: 가장 붐비는 적 무리로 뛰어들어 터진다.
  function pickBlastTarget(g, u) {
    // 뛰어들 곳: 네크로맨서에게 가장 가까운 적. 플레이어가 서 있는 자리로 어디에 터뜨릴지 정한다.
    // 초소·돌격조·대장은 조금 더 멀어도 먼저 고른다(잡몹 한 마리가 폭탄을 가로채지 않게).
    let best = null, bd = 1e9;
    for (const e of g.enemies.concat(g.posts)) {
      if (e.dead || dist(e, u) > CFG.rushReach) continue;
      const d = dist(e, g.necro) - (e.post || e.elite ? CFG.rushBigBonus : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // 지금 두 번 톡톡 치면 누가 어디로 뛰어드는지(화면의 조준 표시용)
  function nextBlast(g) {
    const c = g.units.filter(u => u.state === 'ok').sort((a, b) => (b.inst - a.inst) || (geneTotal(a) - geneTotal(b)))[0];
    return c ? { unit: c, target: pickBlastTarget(g, c) } : null;
  }
  function startMolt(g, u) {
    if (u.state !== 'ok') return false;
    const best = pickBlastTarget(g, u);
    u.state = 'rush'; u.rushT = 0; u.down = 0; u.target = best;
    u.charge = Math.min(1, u.inst / CFG.frenzyAt);   // 폭발의 세기는 터지는 순간의 불안정도로 정해진다
    u.tx = best ? best.x : u.x; u.ty = best ? best.y : u.y;
    g.events.push('rush');
    return true;
  }
  function explode(g, u) {
    const c = u.charge || 0, st = stats(u);   // c: 0(불안정도 0%) ~ 1(80% 이상)
    const R = CFG.blastRadius * (CFG.blastMinRadius + (1 - CFG.blastMinRadius) * c);
    const eliteFrac = CFG.blastEliteFrac + (1 - CFG.blastEliteFrac) * c;
    for (const e of g.enemies) {
      if (e.dead || dist(e, u) > R + e.r) continue;
      if (e.elite) {
        if (e.mode !== 'charge') knock(e, u.x, u.y, CFG.blastKnock);
        e.stun = Math.max(e.stun, CFG.blastStun);
        if (e.mode === 'charge' || e.mode === 'aim' || e.mode === 'warn') { e.mode = 'chase'; e.rechargeT = CFG.rechargeEvery; }
        damageEnemy(g, e, e.maxHp * (e.boss ? CFG.bossBlastCap * (0.1 + 0.9 * c) : eliteFrac) + 0.01, null, null);
      } else if (c >= 1) killEnemy(g, e);                              // 다 익은 폭탄: 잡몹 즉사
      else damageEnemy(g, e, st.dmg * (CFG.blastWeakMul + 4 * c), null, null);   // 덜 익은 폭탄: 평타 몇 대 값
    }
    // 초소는 폭발로만 부서진다. 불안정도가 찬 폭발은 한 번에, 아니면 두 번.
    for (const p of g.posts) {
      if (p.dead || dist(p, u) > R + p.r) continue;
      const hit = c >= 1 ? CFG.postHits : c >= CFG.postMinCharge ? 1 : 0;
      if (!hit) { g.events.push('postbounce'); g.fx.push({ k: 'block', x: p.x, y: p.y, face: Math.atan2(u.y - p.y, u.x - p.x), r: p.r, t: 0.25 }); continue; }
      p.hp -= hit;
      if (p.hp <= 0) {
        p.dead = true; g.postsDown++;
        g.fx.push({ k: 'die', x: p.x, y: p.y, arch: 'armor', big: true, t: 0.35 });
        g.events.push('postdown');
        if (g.postsDown >= g.postsTotal && !g.boss) spawnBoss(g);
      } else g.events.push('posthit');
    }
    g.hearts.push({ x: clamp(u.x, 0.8, W - 0.8), y: clamp(u.y, 0.8, H - 0.8), genes: Object.assign({}, u.genes), main: u.main, molts: u.molts + (c >= 1 ? 1 : 0), mutant: u.mutant, keep: CFG.heartWeakKeep + (1 - CFG.heartWeakKeep) * c, wait: CFG.heartWeakWait * (1 - c), age: 0, ttl: CFG.heartTtl });
    g.units = g.units.filter(x => x !== u);
    if (g.pinned === u.uid) g.pinned = null;
    g.molts++;
    if (c >= 1) { g.ripeBlasts++; if (g.firstRipeT === null) g.firstRipeT = g.t; }
    g.fx.push({ k: 'boom', x: u.x, y: u.y, r: R, weak: c < 1, t: 0.5 });
    g.events.push('boom');
  }
  // 초소를 다 부수면 대장이 나타난다. 돌격조처럼 예고하고 달려들지만 훨씬 단단하다.
  function spawnBoss(g) {
    const p = edgePoint(g, 9), hp = CFG.bossHp * g.scale;
    g.boss = {
      elite: true, boss: true, arch: 'armor', g: 3, x: p.x, y: p.y, hp, maxHp: hp, dmg: CFG.eliteDmg * 1.4 * g.scale, r: 1.35,
      cd: 0.5, face: 0, stun: 0, bleed: 0, bleedT: 0,
      mode: 'warn', modeT: CFG.eliteWarn + 0.8, dx: 0, dy: 0, run: 0, runMax: 0, hitNecro: false, hitUnits: {}, rechargeT: CFG.rechargeEvery,
    };
    g.enemies.push(g.boss);
    g.events.push('boss');
    return g.boss;
  }

  // 손으로 터뜨린다: 불안정도가 가장 높은(같으면 유전자가 가장 적은) 키메라가 뛰어든다.
  function detonate(g) {
    if (g.over) return false;
    const c = g.units.filter(u => u.state === 'ok').sort((a, b) => (b.inst - a.inst) || (geneTotal(a) - geneTotal(b)));
    return c.length ? startMolt(g, c[0]) : false;
  }
  function pin(g, uid) {
    if (g.over || !g.units.some(u => u.uid === uid)) return null;
    g.pinned = g.pinned === uid ? null : uid;
    return g.pinned;
  }

  // 총량을 keep 비율로 줄이되(올림), 종류별 비율은 가능한 한 그대로 둔다.
  function scaleGenes(genes, main, keep) {
    const total = genes.beast + genes.armor + genes.ranger, want = Math.max(1, Math.ceil(total * keep - 1e-9));
    const out = {}, frac = [];
    let sum = 0;
    for (const k of KINDS) { const v = genes[k] * want / total; out[k] = Math.floor(v + 1e-9); sum += out[k]; frac.push([v - out[k], k]); }
    frac.sort((a, b) => b[0] - a[0] || (a[1] === main ? -1 : 1));
    for (let i = 0; sum < want; i++, sum++) out[frac[i % 3][1]]++;
    if (out[main] < 1) { const big = KINDS.slice().sort((a, b) => out[b] - out[a])[0]; out[big]--; out[main]++; }
    return out;
  }
  // 심장이 지키는 유전자 비율 = 터질 때의 익은 정도(60~100%) × 주운 빠르기(100~80%)
  function heartKeep(h) { return (h.keep === undefined ? 1 : h.keep) * (h.age <= CFG.heartFullFor ? 1 : Math.max(CFG.heartMinKeep, 1 - (1 - CFG.heartMinKeep) * (h.age - CFG.heartFullFor) / (CFG.heartTtl - CFG.heartFullFor))); }
  // 심장 계승: 터지기 전의 유전자를 물려받은 새 키메라가 불안정도 0으로 깨어난다.
  function rebirth(g, h) {
    const genes = scaleGenes(h.genes, h.main, heartKeep(h));
    const u = makeUnit(g, genes, h.main, h.x, h.y);
    u.molts = h.molts; u.mutant = h.mutant;   // 탈피 보너스는 다 익은 폭탄으로 터졌을 때만 심장에 실린다
    u.hp = stats(u).maxHp; u.pop = 0.8;
    g.units.push(u);
    g.rebirths++;
    g.maxLevel = Math.max(g.maxLevel, levelOf(u));
    g.fx.push({ k: 'rebirth', x: u.x, y: u.y, t: 0.6 });
    g.events.push('rebirth');
    return u;
  }

  function feedTarget(g, item) {
    const ok = g.units.filter(u => u.state === 'ok');
    if (!ok.length) return null;
    const p = g.pinned === null ? null : ok.find(u => u.uid === g.pinned);
    if (p) return p;
    return ok.slice().sort((a, b) => dist(a, item) - dist(b, item))[0];
  }

  function step(g, dtReal, inp) {
    if (g.over) return;
    const n = g.necro;
    // 네크로맨서는 느려진 동안에도 제 속도로 움직인다(느려진 세상 속에서 고를 틈이 생긴다)
    let mx = (inp && inp.x) || 0, my = (inp && inp.y) || 0;
    const mm = Math.hypot(mx, my);
    if (mm > 1) { mx /= mm; my /= mm; }
    n.x = clamp(n.x + mx * NECRO_SPEED * dtReal, 0.6, W - 0.6);
    n.y = clamp(n.y + my * NECRO_SPEED * dtReal, 0.6, H - 0.6);

    // 자리가 찼을 때: 가까운 혼(또는 심장)과 먹일 키메라를 잇는다
    const full = g.units.length >= CFG.maxUnits;
    g.link = null; g.linkItem = null;   // linkItem: 연결선이 가리키는 바로 그 혼(또는 심장). 자리가 찼을 때는 이것만 먹는다
    if (full) {
      let near = null, nd = CFG.absorbRange;
      for (const it of g.hearts.filter(h => !(h.wait > 0)).concat(g.souls)) { const d = dist(it, n) - (it.genes ? 0.8 : 0); if (d < nd) { nd = d; near = it; } }
      const tgt = near ? feedTarget(g, near) : null;
      if (near && tgt) { g.link = { x: near.x, y: near.y, uid: tgt.uid }; g.linkItem = near; }
    }
    const dt = dtReal;
    g.feedT = Math.max(0, g.feedT - dtReal);

    g.t += dt;
    n.hurt = Math.max(0, n.hurt - dt);
    spawn(g, dt);

    for (const u of g.units.slice()) {
      const idx = g.units.indexOf(u);
      u.pop = Math.max(0, u.pop - dt);
      if (u.state === 'rush') {
        if (u.target && !u.target.dead) { u.tx = u.target.x; u.ty = u.target.y; }
        u.rushT += dt;
        moveToward(u, u.tx, u.ty, CFG.rushSpeed * dt);
        if (Math.hypot(u.tx - u.x, u.ty - u.y) < 0.6 || u.rushT >= CFG.rushMax) explode(g, u);
        continue;
      }
      if (u.down > 0) {
        u.down -= dt;
        if (u.down <= 0) { u.down = 0; u.hp = stats(u).maxHp * 0.5; u.pop = 0.3; }
        continue;
      }
      const s = stats(u);
      u.cd -= dt;
      let best = null, bd = 1e9;
      for (const e of g.enemies) {
        if (e.dead || dist(e, n) > LEASH) continue;
        const d = dist(e, u);
        if (d < bd) { bd = d; best = e; }
      }
      if (u.main === 'armor') { if (u.hitsTaken >= 4) shockwave(g, u, s); }
      else if (best) { u.skillT -= dt; if (u.skillT <= 0 && useSkill(g, u, s, best, bd)) { u.skillT = s.skillCd; bd = dist(best, u); } }
      if (best && !best.dead) {
        const reach = s.range + best.r + u.r;
        if (bd > reach) moveToward(u, best.x, best.y, s.spd * dt);
        else u.face = Math.atan2(best.y - u.y, best.x - u.x);
        if (bd <= reach + 0.1 && u.cd <= 0) {
          u.cd = s.cd;
          if (s.ranged) g.fx.push({ k: 'shot', x: u.x, y: u.y, tx: best.x, ty: best.y, arch: 'ranger', t: 0.16 });
          else g.fx.push({ k: 'hit', x: best.x, y: best.y, big: s.level >= 3, t: 0.15 });
          damageEnemy(g, best, s.dmg, u, s);
        }
      } else if (!best) {
        const a = Math.PI / 2 + idx * Math.PI * 2 / 3;
        const tx = n.x + Math.cos(a) * (1.3 + u.r), ty = n.y + Math.sin(a) * (1.3 + u.r);
        if (Math.hypot(tx - u.x, ty - u.y) > 0.15) moveToward(u, tx, ty, s.spd * dt);
      }
    }

    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.bleedT > 0) { e.bleedT -= dt; damageEnemy(g, e, e.bleed * dt, null, null); if (e.dead) continue; }
      if (e.stun > 0) { e.stun -= dt; continue; }
      e.cd -= dt;
      if (e.elite && e.mode !== 'chase') {
        if (e.mode === 'warn' || e.mode === 'aim') {
          // 예고: 네크로맨서를 겨눈 채 서 있다가 방향을 굳히고 달려든다
          e.face = Math.atan2(n.y - e.y, n.x - e.x);
          e.modeT -= dt;
          if (e.modeT <= 0) {
            const d = Math.max(0.01, dist(e, n));
            e.dx = (n.x - e.x) / d; e.dy = (n.y - e.y) / d; e.run = 0; e.runMax = d + 5; e.hitNecro = false; e.hitUnits = {};
            e.mode = 'charge'; g.events.push('charge');
          }
          continue;
        }
        // 돌진: 굳힌 방향으로 곧장. 2등급 이상 갑주만 받아 내고 나머지는 튕겨 나간다
        const stepLen = CFG.chargeSpeed * dt;
        e.x += e.dx * stepLen; e.y += e.dy * stepLen; e.run += stepLen;
        let stopped = false;
        for (const u of g.units) {
          if (u.state !== 'ok' || u.down > 0 || e.hitUnits[u.uid] || dist(e, u) > e.r + u.r) continue;
          e.hitUnits[u.uid] = true;
          if (u.main === 'armor' && levelOf(u) >= 2) {
            hurtUnit(g, u, CFG.chargeDmg * 0.6);
            e.stun = 1.5; stopped = true; g.blocks++;
            g.fx.push({ k: 'clash', x: (e.x + u.x) / 2, y: (e.y + u.y) / 2, t: 0.4 });
            g.events.push('block');
            break;
          }
          hurtUnit(g, u, CFG.chargeDmg * 0.5);
          knock(u, e.x - e.dy * 0.01, e.y + e.dx * 0.01, 2.2);
        }
        if (!stopped && !e.hitNecro && dist(e, n) < e.r + n.r) {
          e.hitNecro = true; n.hp -= CFG.chargeDmg; n.hurt = 0.4;
          knock(n, e.x, e.y, 1.5);
          g.events.push('necrohit');
        }
        const out = e.x < 0.6 || e.x > W - 0.6 || e.y < 0.6 || e.y > H - 0.6;
        e.x = clamp(e.x, 0.6, W - 0.6); e.y = clamp(e.y, 0.6, H - 0.6);
        if (stopped || out || e.run >= e.runMax) { e.mode = 'chase'; e.rechargeT = CFG.rechargeEvery; }
        continue;
      }
      if (e.elite) {
        e.rechargeT -= dt;
        if (e.rechargeT <= 0) { e.mode = 'aim'; e.modeT = CFG.aimTime; g.events.push('warn'); continue; }
      }
      const f = e.elite ? { range: 0.35, spd: 3.2, cd: 1.1 } : FOE[e.arch];
      // 적은 네크로맨서를 노린다. 길을 막은 키메라나 적을 끄는 갑주가 있으면 그쪽과 싸운다.
      let tgt = n, isNecro = true, td = dist(e, n);
      for (const u of g.units) {
        if (u.down > 0 || u.state !== 'ok') continue;
        const d = dist(e, u);
        const pull = u.main === 'armor' ? 4 : (e.arch === 'ranger' && !e.elite ? 0 : u.r + e.r + 0.5);
        if (d < pull && (isNecro || d < td)) { tgt = u; isNecro = false; td = d; }
      }
      const reach = f.range + tgt.r + e.r, shooter = e.arch === 'ranger' && !e.elite;
      if (td > reach * (shooter ? 0.9 : 1)) moveToward(e, tgt.x, tgt.y, f.spd * dt);
      else e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      if (td <= reach + 0.1 && e.cd <= 0) {
        e.cd = f.cd;
        if (shooter) g.fx.push({ k: 'shot', x: e.x, y: e.y, tx: tgt.x, ty: tgt.y, arch: 'danger', t: 0.12 });
        if (isNecro) { n.hp -= e.dmg; n.hurt = 0.25; }
        else hurtUnit(g, tgt, e.dmg);
      }
    }

    // 초소는 가까이 온 네크로맨서를 쏜다. 폭탄을 끌고 다가가는 길이 위험해진다.
    for (const p of g.posts) {
      if (p.dead) continue;
      p.cd -= dt;
      if (p.cd <= 0 && dist(p, n) < CFG.postRange) {
        p.cd = CFG.postCd;
        n.hp -= CFG.postDmg * g.scale; n.hurt = 0.2;
        g.fx.push({ k: 'shot', x: p.x, y: p.y, tx: n.x, ty: n.y, arch: 'danger', t: 0.14 });
      }
    }

    // 서로 겹치지 않게 살짝 민다(돌진 중인 돌격조와 뛰어드는 키메라는 뺀다).
    const bodies = g.enemies.filter(e => !e.dead && !(e.elite && e.mode === 'charge')).concat(g.units.filter(u => u.down <= 0 && u.state === 'ok'));
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.9;
        if (d < min && d > 1e-4) {
          const push = (min - d) * 0.5, ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        }
      }
    }

    // 심장을 혼보다 먼저 본다. 폭발로 쏟아진 혼이 계승할 자리를 먼저 차지하면 안 된다.
    // 심장: 자리가 비었으면 계승, 찼으면 연결된 키메라가 유전자를 통째로 삼킨다
    for (const h of g.hearts) {
      h.ttl -= dt; h.age += dt; h.wait = Math.max(0, (h.wait || 0) - dt);
      if (h.ttl <= 0 || h.wait > 0 || dist(h, n) >= CFG.pickRadius) continue;
      if (g.units.length < CFG.maxUnits) { rebirth(g, h); h.ttl = 0; g.feedT = CFG.feedGapAfterRebirth; }
      else if (g.feedT <= 0 && h === g.linkItem) {
        const tgt = feedTarget(g, h);
        if (tgt) {
          g.feedT = CFG.feedGap;
          const before = stats(tgt).maxHp, add = scaleGenes(h.genes, h.main, heartKeep(h));
          for (const k of KINDS) tgt.genes[k] += add[k];
          refreshMain(tgt);
          const after = stats(tgt).maxHp;
          tgt.hp = Math.min(after, Math.max(tgt.hp, tgt.hp + (after - before))); tgt.r = radiusOf(tgt); tgt.pop = 0.6;
          g.absorbs++; g.maxLevel = Math.max(g.maxLevel, levelOf(tgt));
          g.fx.push({ k: 'absorb', x: h.x, y: h.y, uid: tgt.uid, type: h.main, q: 3, t: 0.35 });
          g.events.push('absorb');
          h.ttl = 0;
        }
      }
    }
    // 혼: 자리가 비었으면 되살리고, 찼으면 연결된 키메라가 먹는다
    for (const s of g.souls) {
      s.ttl -= dt;
      if (s.ttl <= 0 || dist(s, n) >= CFG.pickRadius) continue;
      if (g.units.length < CFG.maxUnits) {
        const genes = {}; genes[s.type] = s.q === 3 ? 3 : 1;
        const u = makeUnit(g, genes, s.type, s.x, s.y);
        if (s.q === 3) u.mutant = true;
        u.hp = stats(u).maxHp;
        g.units.push(u); g.raised++; healNecro(g, s.q);
        g.fx.push({ k: 'raise', x: u.x, y: u.y, arch: s.type, t: 0.45 });
        g.events.push('raise');
        s.ttl = 0;
      } else if (g.feedT <= 0 && s === g.linkItem) {
        const tgt = feedTarget(g, s);
        if (tgt) {
          if (g.pinned === null) g.pinned = tgt.uid;   // 처음 먹은 키메라가 먹일 대상으로 남는다
          absorb(g, tgt, s); healNecro(g, s.q); s.ttl = 0; g.feedT = CFG.feedGap;
        }
      }
    }
    g.souls = g.souls.filter(s => s.ttl > 0);
    g.hearts = g.hearts.filter(h => h.ttl > 0);
    g.enemies = g.enemies.filter(e => !e.dead);
    for (const f of g.fx) f.t -= dt;
    g.fx = g.fx.filter(f => f.t > 0);

    if (!g.over && n.hp <= 0) { n.hp = 0; g.over = 'lose'; g.events.push('lose'); }
  }

  // ---- 저장(골드와 강화). 순수 함수만: 읽고 쓰는 것은 화면 쪽이 localStorage로 한다 ----
  // 저장 모양: { v: 1, best: 정복한 가장 높은 구역, gold, up: { genes, hp } }(hp가 없던 저장은 0으로 읽는다). 정복은 순서대로만 하므로 best로 처음 정복인지 안다.
  const SAVE_V = 1, MAX_DISTRICT = Number.MAX_SAFE_INTEGER;   // 저장값 검증용 상한(사실상 없음)
  function freshSave() { return { v: SAVE_V, best: 0, gold: 0, up: { genes: 0, hp: 0 } }; }
  const wholeNum = (v, max) => (Number.isFinite(+v) ? clamp(Math.floor(+v), 0, max) : 0);
  // 저장 글을 읽는다. 깨졌으면 기본값. 새 저장이 없을 때만 옛 최고 기록(legacyBest)을 옮기고 그만큼 골드를 소급해 준다.
  function loadSave(text, legacyBest) {
    if (text !== null && text !== undefined) {   // 빈 글도 '있었는데 깨진 저장'이다
      try {
        const o = JSON.parse(text);
        if (o && o.v === SAVE_V) return { v: SAVE_V, best: wholeNum(o.best, MAX_DISTRICT), gold: wholeNum(o.gold, MAX_DISTRICT), up: { genes: wholeNum(o.up && o.up.genes, CFG.gold.geneMax), hp: wholeNum(o.up && o.up.hp, CFG.gold.hpMax) } };
      } catch (e) { /* 깨진 저장은 기본값으로 */ }
      return freshSave();   // 새 저장이 있었는데 깨졌으면 옛 기록으로 다시 옮기지 않는다(소급이 되풀이되지 않게)
    }
    const s = freshSave(), b = wholeNum(legacyBest, MAX_DISTRICT);
    s.best = b; s.gold = b * CFG.gold.perClear;
    return s;
  }
  // 구역을 정복했다: 처음 정복한 구역이면 best를 올리고 골드를 준다(둘을 함께). 이미 깬 구역이면 그대로.
  function clearDistrict(save, district) {
    const d = Math.floor(+district);
    if (!Number.isFinite(d) || d <= save.best) return { save, gained: 0 };
    const gained = (d - save.best) * CFG.gold.perClear;
    return { save: { v: SAVE_V, best: d, gold: save.gold + gained, up: Object.assign({}, save.up) }, gained };
  }
  // 살 수 있는 강화: genes(시작 맹수 유전자), hp(네크로맨서 체력)
  const UP = { genes: { cost: 'geneCost', max: 'geneMax' }, hp: { cost: 'hpCost', max: 'hpMax' } };
  function upCost(save, kind) { const u = UP[kind]; return !u || (save.up[kind] || 0) >= CFG.gold[u.max] ? null : CFG.gold[u.cost]; }
  // 강화 한 단계를 산다: 골드를 빼고 단계를 올리는 것을 함께. 못 사면 까닭을 돌려준다.
  function buy(save, kind) {
    const cost = upCost(save, kind);
    if (cost === null) return { ok: false, save, reason: 'max' };
    if (save.gold < cost) return { ok: false, save, reason: 'gold' };
    const up = Object.assign({}, save.up); up[kind] = (up[kind] || 0) + 1;
    return { ok: true, save: { v: SAVE_V, best: save.best, gold: save.gold - cost, up } };
  }
  const geneCost = save => upCost(save, 'genes'), buyGene = save => buy(save, 'genes');
  const Save = { fresh: freshSave, load: loadSave, clear: clearDistrict, cost: upCost, buy, geneCost, buyGene };

  const api = { W, H, DURATION, MAX_LEVEL, KINDS, CFG, newGame, step, stats, geneTotal, levelOf, isFrenzy, heartKeep, scaleGenes, detonate, pin, absorb, feedTarget, spawnBoss, nextBlast, Save };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChimeraSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
