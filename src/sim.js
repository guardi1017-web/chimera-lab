// 키메라 실험 6차: 유전자 누적 + 불안정도 탈피(자폭 뒤 심장 계승) + 돌격병.
// 규칙만 담는다(화면·DOM 없음). 같은 시드면 같은 판이 나온다.
(function (root) {
  'use strict';
  const W = 18, H = 30, DURATION = 90, MAX_LEVEL = 10;
  const KINDS = ['beast', 'armor', 'ranger'];

  // 밸런스 값은 여기 모은다.
  const CFG = {
    maxUnits: 3,
    absorbRange: 3.2,          // 자리가 찼을 때 이 안의 혼에 다가가면 느려지고 연결선이 생긴다
    pickRadius: 1.1,
    slowScale: 0.25, slowMax: 1.6, slowRecharge: 0.6,   // 느려짐은 실제 시간으로 최대 1.6초, 벗어나 있으면 다시 찬다
    // 혼의 품질: 1 불량(잡몹), 2 신선(중형), 3 순혈 코어(돌격병)
    soul: {
      1: { gene: 1, inst: 30, heal: 0 },
      2: { gene: 2, inst: 15, heal: 0.5 },
      3: { gene: 3, inst: -1, heal: 1 },   // inst -1 = 불안정도를 0으로 식힌다
    },
    soulTtl: 10, soulCap: 12,
    frenzyAt: 80, frenzyMul: 1.5,
    blastRadius: 3.2, blastEliteFrac: 0.45, blastKnock: 3, blastStun: 1.2,
    rushSpeed: 14, rushMax: 1.0,
    feedGap: 0.35, feedGapAfterRebirth: 0.8,           // 흡수 사이의 실제 시간 간격(초). 혼 더미 위에서 한꺼번에 먹지 않게
    heartTtl: 12, heartFullFor: 4, heartMinKeep: 0.8,   // 심장은 4초 안에 주우면 유전자 100%, 12초째에는 80%
    moltBonus: 0.1, mutantBonus: 0.2,
    statPerGene: 0.35,
    eliteTimes: [20, 45, 70], eliteWarn: 1.5, eliteHp: 260, eliteHpStep: 0.5,
    chargeSpeed: 13, chargeDmg: 30, eliteDmg: 14, rechargeEvery: 7, aimTime: 1.2,
    spawnStart: 1.5, spawnEnd: 0.8, foeGradeMul: 1.35,
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

  function newGame(seed) {
    const g = {
      W, H, DURATION, t: 0, over: null, rand: mulberry(seed || 1), nextUid: 1,
      necro: { x: W / 2, y: H * 0.6, hp: 100, maxHp: 100, r: 0.5, hurt: 0 },
      units: [], enemies: [], souls: [], hearts: [], fx: [], events: [],
      pinned: null,             // 먹일 대상으로 찍어 둔 키메라(없으면 혼에 가장 가까운 키메라)
      link: null,               // 지금 연결된 혼과 키메라(화면의 예고선)
      slowing: false, slowLeft: CFG.slowMax,
      feedT: 0,                 // 0이 되어야 다음 혼을 먹일 수 있다(실제 시간)
      eliteIdx: 0, spawnT: 1.2,
      kills: 0, raised: 0, absorbs: 0, molts: 0, rebirths: 0, eliteKills: 0, blocks: 0, maxLevel: 1,
    };
    // 네크로맨서는 직접 싸우지 못한다. 맹수 하나를 데리고 시작한다.
    g.units.push(makeUnit(g, { beast: 1 }, 'beast', g.necro.x, g.necro.y + 1.5));
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
    // 돌격병: 정해진 시각의 1.5초 전에 경고와 함께 화면 끝에 나타난다
    if (g.eliteIdx < CFG.eliteTimes.length && g.t >= CFG.eliteTimes[g.eliteIdx] - CFG.eliteWarn) {
      const p = edgePoint(g, 9), hp = CFG.eliteHp * (1 + CFG.eliteHpStep * g.eliteIdx);
      g.enemies.push({
        elite: true, arch: KINDS[g.eliteIdx % 3], g: 3, x: p.x, y: p.y, hp, maxHp: hp, dmg: CFG.eliteDmg, r: 0.95,
        cd: 0.5, face: 0, stun: 0, bleed: 0, bleedT: 0,
        mode: 'warn', modeT: CFG.eliteWarn, dx: 0, dy: 0, run: 0, runMax: 0, hitNecro: false, hitUnits: {}, rechargeT: CFG.rechargeEvery,
      });
      g.eliteIdx++;
      g.events.push('warn');
    }
    g.spawnT -= dt;
    if (g.spawnT > 0 || g.enemies.length >= 36) return;
    const k = g.t / DURATION, r = g.rand(), r2 = g.rand();
    g.spawnT = (CFG.spawnStart + (CFG.spawnEnd - CFG.spawnStart) * k) * (0.8 + 0.4 * g.rand());
    let arch = 'beast';
    if (g.t >= 10 && g.t < 35) arch = r < 0.6 ? 'beast' : 'ranger';
    else if (g.t >= 35) arch = r < 0.42 ? 'beast' : r < 0.7 ? 'ranger' : 'armor';
    let grade = 1;
    if (g.t >= 18) grade = r2 < (g.t < 50 ? 0.7 : 0.5) ? 1 : 2;
    const n = arch === 'beast' && grade === 1 && g.t > 30 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p = edgePoint(g, 7), f = FOE[arch], m = Math.pow(CFG.foeGradeMul, grade - 1), hp = f.hp * m * (grade === 2 ? 1.6 : 1);
      g.enemies.push({ elite: false, arch, g: grade, x: p.x, y: p.y, hp, maxHp: hp, dmg: f.dmg * m, r: f.r + 0.12 * (grade - 1), cd: 0.4, face: 0, stun: 0, bleed: 0, bleedT: 0 });
    }
  }

  function killEnemy(g, e) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    g.kills++;
    if (e.elite) { g.eliteKills++; g.events.push('elitedown'); }
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
  function absorb(g, u, soul) {
    const c = CFG.soul[soul.q], before = stats(u).maxHp, wasFrenzy = isFrenzy(u);
    u.genes[soul.type] += c.gene;
    refreshMain(u);
    if (c.inst < 0) { u.inst = 0; u.mutant = true; } else u.inst += c.inst;
    const after = stats(u).maxHp;
    if (u.down > 0 && c.heal > 0) u.down = 0;
    u.hp = Math.min(after, Math.max(u.hp, u.hp + (after - before)) + after * c.heal);
    u.r = radiusOf(u); u.pop = 0.5;
    g.absorbs++;
    g.maxLevel = Math.max(g.maxLevel, levelOf(u));
    g.fx.push({ k: 'absorb', x: soul.x, y: soul.y, uid: u.uid, type: soul.type, q: soul.q, t: 0.35 });
    g.events.push(soul.q === 3 ? 'purify' : 'absorb');
    if (!wasFrenzy && isFrenzy(u)) g.events.push('frenzy');
    if (u.inst >= 100) startMolt(g, u);
  }

  // 탈피: 가장 붐비는 적 무리로 뛰어들어 터진다.
  function startMolt(g, u) {
    if (u.state !== 'ok') return false;
    let best = null, score = 0;
    for (const e of g.enemies) {
      if (e.dead || dist(e, u) > 10) continue;
      let n = 0;
      for (const o of g.enemies) if (!o.dead && dist(o, e) < CFG.blastRadius) n += o.elite ? 4 : 1;
      if (n > score) { score = n; best = e; }
    }
    u.state = 'rush'; u.rushT = 0; u.down = 0; u.target = best;
    u.charge = Math.min(1, u.inst / CFG.frenzyAt);   // 폭발의 세기는 터지는 순간의 불안정도로 정해진다
    u.tx = best ? best.x : u.x; u.ty = best ? best.y : u.y;
    g.events.push('rush');
    return true;
  }
  function explode(g, u) {
    const eliteFrac = CFG.blastEliteFrac + (1 - CFG.blastEliteFrac) * (u.charge || 0);
    for (const e of g.enemies) {
      if (e.dead || dist(e, u) > CFG.blastRadius + e.r) continue;
      if (e.elite) {
        if (e.mode !== 'charge') knock(e, u.x, u.y, CFG.blastKnock);
        e.stun = Math.max(e.stun, CFG.blastStun);
        if (e.mode === 'charge' || e.mode === 'aim' || e.mode === 'warn') { e.mode = 'chase'; e.rechargeT = CFG.rechargeEvery; }
        damageEnemy(g, e, e.maxHp * eliteFrac + 0.01, null, null);
      } else killEnemy(g, e);
    }
    g.hearts.push({ x: clamp(u.x, 0.8, W - 0.8), y: clamp(u.y, 0.8, H - 0.8), genes: Object.assign({}, u.genes), main: u.main, molts: u.molts, mutant: u.mutant, age: 0, ttl: CFG.heartTtl });
    g.units = g.units.filter(x => x !== u);
    if (g.pinned === u.uid) g.pinned = null;
    g.molts++;
    g.fx.push({ k: 'boom', x: u.x, y: u.y, r: CFG.blastRadius, t: 0.5 });
    g.events.push('boom');
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
  function heartKeep(h) { return h.age <= CFG.heartFullFor ? 1 : Math.max(CFG.heartMinKeep, 1 - (1 - CFG.heartMinKeep) * (h.age - CFG.heartFullFor) / (CFG.heartTtl - CFG.heartFullFor)); }
  // 심장 계승: 터지기 전의 유전자를 물려받은 새 키메라가 불안정도 0으로 깨어난다.
  function rebirth(g, h) {
    const genes = scaleGenes(h.genes, h.main, heartKeep(h));
    const u = makeUnit(g, genes, h.main, h.x, h.y);
    u.molts = h.molts + 1; u.mutant = h.mutant;
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

    // 자리가 찼을 때: 가까운 혼(또는 심장)과 먹일 키메라를 잇고, 세상을 늦춘다
    const full = g.units.length >= CFG.maxUnits;
    g.link = null; g.linkItem = null;   // linkItem: 연결선이 가리키는 바로 그 혼(또는 심장). 자리가 찼을 때는 이것만 먹는다
    if (full) {
      let near = null, nd = CFG.absorbRange;
      for (const it of g.hearts.concat(g.souls)) { const d = dist(it, n) - (it.genes ? 0.8 : 0); if (d < nd) { nd = d; near = it; } }
      const tgt = near ? feedTarget(g, near) : null;
      if (near && tgt) { g.link = { x: near.x, y: near.y, uid: tgt.uid }; g.linkItem = near; }
    }
    if (g.link && g.slowLeft > 0) { g.slowing = true; g.slowLeft -= dtReal; }
    else { g.slowing = false; if (!g.link) g.slowLeft = Math.min(CFG.slowMax, g.slowLeft + CFG.slowRecharge * dtReal); }
    const dt = dtReal * (g.slowing ? CFG.slowScale : 1);
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

    // 서로 겹치지 않게 살짝 민다(돌진 중인 돌격병과 뛰어드는 키메라는 뺀다).
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
      h.ttl -= dt; h.age += dt;
      if (h.ttl <= 0 || dist(h, n) >= CFG.pickRadius) continue;
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
        g.units.push(u); g.raised++;
        g.fx.push({ k: 'raise', x: u.x, y: u.y, arch: s.type, t: 0.45 });
        g.events.push('raise');
        s.ttl = 0;
      } else if (g.feedT <= 0 && s === g.linkItem) {
        const tgt = feedTarget(g, s);
        if (tgt) { absorb(g, tgt, s); s.ttl = 0; g.feedT = CFG.feedGap; }
      }
    }
    g.souls = g.souls.filter(s => s.ttl > 0);
    g.hearts = g.hearts.filter(h => h.ttl > 0);
    g.enemies = g.enemies.filter(e => !e.dead);
    for (const f of g.fx) f.t -= dt;
    g.fx = g.fx.filter(f => f.t > 0);

    if (n.hp <= 0) { n.hp = 0; g.over = 'lose'; g.events.push('lose'); }
    else if (g.t >= DURATION) { g.t = DURATION; g.over = 'win'; g.events.push('win'); }
  }

  const api = { W, H, DURATION, MAX_LEVEL, KINDS, CFG, newGame, step, stats, geneTotal, levelOf, isFrenzy, heartKeep, scaleGenes, detonate, pin, absorb, feedTarget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChimeraSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
