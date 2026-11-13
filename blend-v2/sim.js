// 키메라 실험 2: 잡은 적을 소환수로 되살리고, 소환수 둘을 합성해 더 센 하나로 만든다.
// 규칙만 담는다(화면·DOM 없음). 같은 시드면 같은 판이 나온다.
(function (root) {
  'use strict';
  const W = 18, H = 30, DURATION = 90;
  const KINDS = ['bone', 'wolf', 'knight', 'archer'];
  const ENEMY = {
    wolf:   { hp: 16, spd: 4.5, dmg: 4,  cd: 0.7, range: 0.25, r: 0.42 },
    knight: { hp: 80, spd: 2.0, dmg: 10, cd: 1.2, range: 0.3,  r: 0.62 },
    archer: { hp: 20, spd: 2.8, dmg: 5,  cd: 1.8, range: 5.5,  r: 0.42 },
  };
  // 밸런스 값은 여기 모은다.
  const CFG = {
    maxUnits: 3,
    maxMp: 10, startMp: 3, mpPerKill: 0.5,
    cost: { wolf: 2, archer: 3, knight: 5 },   // 되살리는 데 드는 MP
    greatChance: 0.2,   // 합성 대성공: 재료 하나가 덤으로 더 들어간다
    failChance: 0,      // 합성 실패(재료 하나를 잃음). 지금은 쓰지 않는다
    synergy: 0.15,      // 합쳐진 재료 하나마다 전체 능력이 이만큼 더 오른다
    enemyHpGrowth: 0.8, // 판이 끝날 때 적 체력이 (1 + 이 값)배
    spawnStart: 1.5, spawnEnd: 0.65,           // 적이 나오는 간격(초): 판 처음과 끝
    soulTtl: 9,
  };
  const NECRO_SPEED = 5.0, LEASH = 6.5, PICK_RADIUS = 1.1;

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

  function essCount(u) { return u.ess.bone + u.ess.wolf + u.ess.knight + u.ess.archer; }

  // 섞임: 소환수는 "무엇이 몇 개 들어갔는가"로만 정해진다. 능력과 모습 모두 여기서 나온다.
  function stats(u) {
    const e = u.ess, n = essCount(u), syn = 1 + CFG.synergy * (n - 1);
    return {
      n,
      maxHp: (40 * e.bone + 45 * e.wolf + 110 * e.knight + 40 * e.archer) * syn,
      dmg: (5 * e.bone + 7 * e.wolf + 6 * e.knight + 6 * e.archer) * syn,
      cd: Math.max(0.3, 0.8 / (1 + 0.35 * e.wolf)),                         // 늑대: 빨리 문다
      spd: Math.max(5.2, 5.6 * (1 + 0.12 * Math.min(e.wolf, 3)) * (1 - 0.04 * e.knight)),
      ranged: e.archer > 0,                                                 // 궁수: 멀리서 쏜다
      range: e.archer > 0 ? Math.min(7, 4.5 + 0.7 * e.archer) : 0.3,
      taken: 1 / (1 + 0.3 * e.knight),                                      // 기사: 덜 아프다
      taunt: e.knight >= 2,                                                 // 기사 둘 이상: 적을 끈다
      knock: e.knight > 0 ? 0.6 : 0,
    };
  }
  function radiusOf(n) { return 0.55 + 0.17 * Math.pow(n - 1, 0.7); }

  function makeUnit(g, ess, x, y) {
    const u = { uid: g.nextUid++, x, y, ess: Object.assign({ bone: 0, wolf: 0, knight: 0, archer: 0 }, ess), hp: 0, r: 0.55, cd: 0, down: 0, pop: 0.5, face: -Math.PI / 2, great: false };
    u.r = radiusOf(essCount(u));
    u.hp = stats(u).maxHp;
    return u;
  }

  function newGame(seed) {
    const g = {
      W, H, DURATION, t: 0, over: null, rand: mulberry(seed || 1), nextUid: 1,
      necro: { x: W / 2, y: H * 0.6, hp: 100, maxHp: 100, r: 0.5, hurt: 0, mp: CFG.startMp, maxMp: CFG.maxMp },
      units: [], enemies: [], souls: [], fx: [],
      selected: null,           // 합성하려고 먼저 고른 소환수의 uid
      spawnT: 1.2, kills: 0, raised: 0, fusions: 0, greats: 0, maxN: 1,
    };
    // 네크로맨서는 직접 싸우지 못한다. 해골 하나를 데리고 시작한다.
    g.units.push(makeUnit(g, { bone: 1 }, g.necro.x, g.necro.y + 1.5));
    return g;
  }

  function moveToward(o, tx, ty, d) {
    const dx = tx - o.x, dy = ty - o.y, m = Math.hypot(dx, dy);
    if (m < 1e-4) return;
    const k = Math.min(1, d / m);
    o.x += dx * k; o.y += dy * k;
    o.face = Math.atan2(dy, dx);
  }

  function spawn(g, dt) {
    g.spawnT -= dt;
    if (g.spawnT > 0 || g.enemies.length >= 36) return;
    const k = g.t / DURATION, r = g.rand();
    g.spawnT = (CFG.spawnStart + (CFG.spawnEnd - CFG.spawnStart) * k) * (0.8 + 0.4 * g.rand());
    let type = 'wolf';
    if (g.t >= 12 && g.t < 35) type = r < 0.65 ? 'wolf' : 'archer';
    else if (g.t >= 35) type = r < 0.42 ? 'wolf' : r < 0.7 ? 'archer' : 'knight';
    const n = type === 'wolf' && g.t > 30 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 6; tries++) {
        const side = Math.floor(g.rand() * 4), u = g.rand();
        x = side === 0 ? 0.4 : side === 1 ? W - 0.4 : u * W;
        y = side === 2 ? 0.4 : side === 3 ? H - 0.4 : u * H;
        if (Math.hypot(x - g.necro.x, y - g.necro.y) > 7) break;
      }
      const def = ENEMY[type], hp = def.hp * (1 + CFG.enemyHpGrowth * k);
      g.enemies.push({ type, x, y, hp, maxHp: hp, r: def.r, cd: 0.4, face: 0 });
    }
  }

  function hurtUnit(g, u, dmg) {
    const s = stats(u);
    if (s.taken < 0.99) g.fx.push({ k: 'block', x: u.x, y: u.y, face: u.face, r: u.r, t: 0.18 });
    u.hp -= dmg * s.taken;
    if (u.hp <= 0) { u.hp = 0; u.down = 6; g.fx.push({ k: 'down', x: u.x, y: u.y, t: 0.5 }); }
  }

  function killEnemy(g, e) {
    g.kills++;
    g.necro.mp = Math.min(g.necro.maxMp, g.necro.mp + CFG.mpPerKill);
    g.fx.push({ k: 'die', x: e.x, y: e.y, type: e.type, t: 0.35 });
    if (g.souls.length < 10) g.souls.push({ x: clamp(e.x, 0.8, W - 0.8), y: clamp(e.y, 0.8, H - 0.8), type: e.type, ttl: CFG.soulTtl });
  }

  function canRaise(g, soul) { return g.units.length < CFG.maxUnits && g.necro.mp >= CFG.cost[soul.type]; }

  // 혼을 밟으면 소환수로 되살린다. 자리가 없거나 MP가 모자라면 혼은 그대로 남는다.
  function raise(g, soul) {
    if (!canRaise(g, soul)) return false;
    g.necro.mp -= CFG.cost[soul.type];
    const ess = {}; ess[soul.type] = 1;
    const u = makeUnit(g, ess, soul.x, soul.y);
    g.units.push(u);
    g.raised++;
    g.fx.push({ k: 'raise', x: u.x, y: u.y, type: soul.type, t: 0.45 });
    return true;
  }

  // 합성: a와 b가 b의 자리에서 하나가 된다. 들어간 것이 모두 섞이고, 자리가 하나 빈다.
  function fuse(g, a, b) {
    const ha = stats(a).maxHp, hb = stats(b).maxHp, ratio = (a.hp + b.hp) / (ha + hb);
    for (const k of KINDS) a.ess[k] += b.ess[k];
    const present = KINDS.filter(k => a.ess[k] > 0);
    const roll = g.rand();
    let result = 'normal';
    if (roll < CFG.failChance) {
      const k = present[Math.floor(g.rand() * present.length)];
      if (essCount(a) > 1) { a.ess[k]--; result = 'fail'; }
    } else if (roll < CFG.failChance + CFG.greatChance) {
      a.ess[present[Math.floor(g.rand() * present.length)]]++;
      a.great = true; result = 'great'; g.greats++;
    }
    a.x = b.x; a.y = b.y; a.down = 0; a.cd = 0.3; a.pop = 0.7;
    a.r = radiusOf(essCount(a));
    a.hp = stats(a).maxHp * Math.max(0.6, ratio);
    g.units = g.units.filter(u => u !== b);
    g.selected = null;
    g.fusions++;
    g.maxN = Math.max(g.maxN, essCount(a));
    g.fx.push({ k: 'fuse', x: a.x, y: a.y, r: a.r, result, t: 0.6 });
    return result;
  }

  // 소환수를 톡 누른다: 첫 번째는 고르기, 다른 소환수를 또 누르면 둘을 합성한다.
  function tapUnit(g, uid) {
    if (g.over) return null;
    const u = g.units.find(u => u.uid === uid);
    if (!u) return null;
    if (g.selected === null) { g.selected = uid; return 'select'; }
    if (g.selected === uid) { g.selected = null; return 'clear'; }
    const a = g.units.find(x => x.uid === g.selected);
    if (!a) { g.selected = uid; return 'select'; }
    return fuse(g, a, u);
  }

  function step(g, dt, inp) {
    if (g.over) return;
    g.t += dt;
    const n = g.necro;
    let mx = (inp && inp.x) || 0, my = (inp && inp.y) || 0;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    n.x = clamp(n.x + mx * NECRO_SPEED * dt, 0.6, W - 0.6);
    n.y = clamp(n.y + my * NECRO_SPEED * dt, 0.6, H - 0.6);
    n.hurt = Math.max(0, n.hurt - dt);

    spawn(g, dt);

    g.units.forEach((u, idx) => {
      u.pop = Math.max(0, u.pop - dt);
      if (u.down > 0) {
        u.down -= dt;
        if (u.down <= 0) { u.down = 0; u.hp = stats(u).maxHp * 0.5; u.pop = 0.3; }
        return;
      }
      const s = stats(u);
      u.cd -= dt;
      let best = null, bd = 1e9;
      for (const e of g.enemies) {
        if (e.hp <= 0 || dist(e, n) > LEASH) continue;
        const d = dist(e, u);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const reach = s.range + best.r + u.r;
        if (bd > reach) moveToward(u, best.x, best.y, s.spd * dt);
        else u.face = Math.atan2(best.y - u.y, best.x - u.x);
        if (bd <= reach + 0.1 && u.cd <= 0) {
          u.cd = s.cd;
          best.hp -= s.dmg;
          if (s.ranged) g.fx.push({ k: 'shot', x: u.x, y: u.y, tx: best.x, ty: best.y, type: 'archer', t: 0.2 });
          else g.fx.push({ k: 'hit', x: best.x, y: best.y, wolf: u.ess.wolf > 0, t: 0.15 });
          if (s.knock > 0 && best.hp > 0) {
            const a = Math.atan2(best.y - u.y, best.x - u.x);
            best.x = clamp(best.x + Math.cos(a) * s.knock, 0.4, W - 0.4);
            best.y = clamp(best.y + Math.sin(a) * s.knock, 0.4, H - 0.4);
          }
          if (best.hp <= 0) killEnemy(g, best);
        }
      } else {
        const a = Math.PI / 2 + idx * Math.PI * 2 / 3;
        const tx = n.x + Math.cos(a) * (1.3 + u.r), ty = n.y + Math.sin(a) * (1.3 + u.r);
        if (Math.hypot(tx - u.x, ty - u.y) > 0.15) moveToward(u, tx, ty, s.spd * dt);
      }
    });

    for (const e of g.enemies) {
      if (e.hp <= 0) continue;
      const def = ENEMY[e.type];
      e.cd -= dt;
      // 적은 네크로맨서를 노린다. 길을 막은 소환수나 적을 끄는 소환수가 있으면 그쪽과 싸운다.
      let tgt = n, isNecro = true, td = dist(e, n);
      for (const u of g.units) {
        if (u.down > 0) continue;
        const d = dist(e, u);
        const pull = stats(u).taunt ? 5 : (e.type === 'archer' ? 0 : u.r + e.r + 0.5);
        if (d < pull && (isNecro || d < td)) { tgt = u; isNecro = false; td = d; }
      }
      const reach = def.range + tgt.r + e.r;
      if (td > reach * (e.type === 'archer' ? 0.9 : 1)) moveToward(e, tgt.x, tgt.y, def.spd * dt);
      else e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      if (td <= reach + 0.1 && e.cd <= 0) {
        e.cd = def.cd;
        if (e.type === 'archer') g.fx.push({ k: 'shot', x: e.x, y: e.y, tx: tgt.x, ty: tgt.y, type: 'danger', t: 0.12 });
        if (isNecro) { n.hp -= def.dmg; n.hurt = 0.25; }
        else hurtUnit(g, tgt, def.dmg);
      }
    }

    // 서로 겹치지 않게 살짝 민다.
    const bodies = g.enemies.filter(e => e.hp > 0).concat(g.units.filter(u => u.down <= 0));
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

    for (const s of g.souls) {
      s.ttl -= dt;
      if (s.ttl > 0 && dist(s, n) < PICK_RADIUS && raise(g, s)) s.ttl = 0;
    }
    g.souls = g.souls.filter(s => s.ttl > 0);
    g.enemies = g.enemies.filter(e => e.hp > 0);
    for (const f of g.fx) f.t -= dt;
    g.fx = g.fx.filter(f => f.t > 0);

    if (n.hp <= 0) { n.hp = 0; g.over = 'lose'; }
    else if (g.t >= DURATION) { g.t = DURATION; g.over = 'win'; }
  }

  const api = { W, H, DURATION, KINDS, ENEMY, CFG, newGame, step, stats, essCount, canRaise, tapUnit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChimeraSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
