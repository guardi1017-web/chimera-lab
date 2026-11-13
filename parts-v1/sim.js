// 키메라 실험: 규칙만 담는다(화면·DOM 없음). 같은 시드면 같은 판이 나온다.
(function (root) {
  'use strict';
  const W = 18, H = 30, DURATION = 90;
  const SLOTS = ['head', 'arm', 'leg'];
  const ENEMY = {
    wolf:   { hp: 16, spd: 4.5, dmg: 4,  cd: 0.7, range: 0.25, r: 0.42 },
    knight: { hp: 80, spd: 2.0, dmg: 10, cd: 1.2, range: 0.3,  r: 0.62 },
    archer: { hp: 20, spd: 2.8, dmg: 5,  cd: 1.8, range: 5.5,  r: 0.42 },
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

  function partCount(c) { return SLOTS.reduce((n, s) => n + (c.parts[s] ? 1 : 0), 0); }

  // 부위가 키메라를 어떻게 바꾸는지는 여기 한 곳에만 있다.
  function stats(c) {
    const p = c.parts;
    const s = { maxHp: 70, spd: 5.8, dmg: 8, cd: 0.8, range: 0.3, taken: 1, taunt: false, knock: 0, ranged: false };
    if (p.arm === 'wolf') s.dmg += 5;                         // 발톱
    if (p.arm === 'knight') s.taken = 0.5;                    // 방패
    if (p.arm === 'archer') { s.ranged = true; s.range = 6; } // 활
    if (p.head === 'wolf') s.cd *= 0.5;                       // 물어뜯기 연타
    if (p.head === 'knight') s.maxHp += 70;                   // 투구
    if (p.head === 'archer') s.dmg *= 1.6;                    // 매의 눈
    if (p.leg === 'wolf') s.spd *= 1.5;                       // 질주
    if (p.leg === 'knight') { s.taunt = true; s.knock = 0.9; } // 버티고 서서 적을 끈다
    if (p.leg === 'archer') s.range += 2;                     // 긴 다리로 멀리 닿는다
    return s;
  }

  function newGame(seed) {
    const g = {
      W, H, DURATION, t: 0, over: null, rand: mulberry(seed || 1),
      necro: { x: W / 2, y: H * 0.6, hp: 100, maxHp: 100, r: 0.5, hurt: 0 },
      chimeras: [], enemies: [], parts: [], fx: [],
      spawnT: 1.2, kills: 0, picked: 0, spawned: 0,
      target: null,   // 부위를 받을 키메라(없으면 빈 칸 먼저)
    };
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + i * Math.PI * 2 / 3;
      g.chimeras.push({
        id: i, x: g.necro.x + Math.cos(a) * 1.5, y: g.necro.y + Math.sin(a) * 1.5,
        hp: 70, r: 0.7, parts: { head: null, arm: null, leg: null }, at: { head: -1, arm: -1, leg: -1 },
        cd: 0, down: 0, pop: 0, face: -Math.PI / 2,
      });
    }
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
    g.spawnT = (1.45 - 0.82 * k) * (0.8 + 0.4 * g.rand());
    let type = 'wolf';
    if (g.t >= 12 && g.t < 38) type = r < 0.65 ? 'wolf' : 'archer';
    else if (g.t >= 38) type = r < 0.45 ? 'wolf' : r < 0.72 ? 'archer' : 'knight';
    const n = type === 'wolf' && g.t > 30 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 6; tries++) {
        const side = Math.floor(g.rand() * 4), u = g.rand();
        x = side === 0 ? 0.4 : side === 1 ? W - 0.4 : u * W;
        y = side === 2 ? 0.4 : side === 3 ? H - 0.4 : u * H;
        if (Math.hypot(x - g.necro.x, y - g.necro.y) > 7) break;
      }
      const def = ENEMY[type];
      g.enemies.push({ type, x, y, hp: def.hp, maxHp: def.hp, r: def.r, cd: 0.4, face: 0 });
      g.spawned++;
    }
  }

  function hurtChimera(g, c, dmg) {
    const s = stats(c);
    if (s.taken < 1) g.fx.push({ k: 'block', x: c.x, y: c.y, face: c.face, r: c.r, t: 0.18 });
    c.hp -= dmg * s.taken;
    if (c.hp <= 0) { c.hp = 0; c.down = 6; g.fx.push({ k: 'down', x: c.x, y: c.y, t: 0.5 }); }
  }

  function killEnemy(g, e) {
    g.kills++;
    g.fx.push({ k: 'die', x: e.x, y: e.y, type: e.type, t: 0.35 });
    // 처음 세 마리는 반드시 부위를 떨어뜨린다. 붙는 것을 바로 보게 하려는 것이다.
    if ((g.kills <= 3 || g.rand() < 0.55) && g.parts.length < 8) {
      const slot = SLOTS[Math.floor(g.rand() * 3)];
      g.parts.push({ x: clamp(e.x, 0.8, W - 0.8), y: clamp(e.y, 0.8, H - 0.8), type: e.type, slot, ttl: 10 });
    }
  }

  function pickup(g, p) {
    // 빈 칸이 있는 키메라 먼저, 없으면 그 칸을 가장 오래 쓴 키메라(같은 부위는 건너뛴다).
    let c = g.target === null ? g.chimeras.find(c => !c.parts[p.slot]) : (g.chimeras[g.target].parts[p.slot] === p.type ? null : g.chimeras[g.target]);
    if (!c && g.target === null) {
      c = g.chimeras.filter(c => c.parts[p.slot] !== p.type).sort((a, b) => a.at[p.slot] - b.at[p.slot])[0];
    }
    if (!c) {
      g.necro.hp = Math.min(g.necro.maxHp, g.necro.hp + 5);
      g.fx.push({ k: 'heal', x: g.necro.x, y: g.necro.y, t: 0.4 });
      return;
    }
    const before = stats(c).maxHp;
    c.parts[p.slot] = p.type; c.at[p.slot] = g.t;
    const after = stats(c).maxHp;
    if (c.down <= 0) c.hp = Math.min(after, c.hp + (after - before) + 15);
    c.r = 0.7 + 0.12 * partCount(c);
    c.pop = 0.6;
    g.picked++;
    g.fx.push({ k: 'attach', x: p.x, y: p.y, tx: c.x, ty: c.y, type: p.type, id: c.id, t: 0.45 });
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

    for (const c of g.chimeras) {
      c.pop = Math.max(0, c.pop - dt);
      if (c.down > 0) {
        c.down -= dt;
        if (c.down <= 0) {
          c.down = 0; c.hp = stats(c).maxHp * 0.5;
          g.fx.push({ k: 'attach', x: c.x, y: c.y, tx: c.x, ty: c.y, type: 'bone', id: c.id, t: 0.3 });
        }
        continue;
      }
      const s = stats(c);
      c.cd -= dt;
      let best = null, bd = 1e9;
      for (const e of g.enemies) {
        if (e.hp <= 0 || dist(e, n) > LEASH) continue;
        const d = dist(e, c);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const reach = s.range + best.r + c.r;
        if (bd > reach) moveToward(c, best.x, best.y, s.spd * dt);
        else c.face = Math.atan2(best.y - c.y, best.x - c.x);
        if (bd <= reach + 0.1 && c.cd <= 0) {
          c.cd = s.cd;
          best.hp -= s.dmg;
          if (s.ranged) g.fx.push({ k: 'shot', x: c.x, y: c.y, tx: best.x, ty: best.y, type: 'archer', t: 0.2 });
          else g.fx.push({ k: 'hit', x: best.x, y: best.y, t: 0.15, bite: c.parts.head === 'wolf', claw: c.parts.arm === 'wolf' });
          if (s.knock > 0) g.fx.push({ k: 'knock', x: c.x, y: c.y, r: c.r, t: 0.2 });
          if (s.knock > 0 && best.hp > 0) {
            const a = Math.atan2(best.y - c.y, best.x - c.x);
            best.x = clamp(best.x + Math.cos(a) * s.knock, 0.4, W - 0.4);
            best.y = clamp(best.y + Math.sin(a) * s.knock, 0.4, H - 0.4);
          }
          if (best.hp <= 0) killEnemy(g, best);
        }
      } else {
        const a = Math.PI / 2 + c.id * Math.PI * 2 / 3;
        const tx = n.x + Math.cos(a) * 1.5, ty = n.y + Math.sin(a) * 1.5;
        if (Math.hypot(tx - c.x, ty - c.y) > 0.15) moveToward(c, tx, ty, s.spd * dt);
      }
    }

    for (const e of g.enemies) {
      if (e.hp <= 0) continue;
      const def = ENEMY[e.type];
      e.cd -= dt;
      // 적은 네크로맨서를 노린다. 길을 막은 키메라나 적을 끄는 키메라가 있으면 그쪽과 싸운다.
      let tgt = n, isNecro = true, td = dist(e, n);
      for (const c of g.chimeras) {
        if (c.down > 0) continue;
        const d = dist(e, c);
        const pull = stats(c).taunt ? 5 : (e.type === 'archer' ? 0 : c.r + e.r + 0.5);
        if (d < pull && (isNecro || d < td)) { tgt = c; isNecro = false; td = d; }
      }
      const reach = def.range + tgt.r + e.r;
      if (td > reach * (e.type === 'archer' ? 0.9 : 1)) moveToward(e, tgt.x, tgt.y, def.spd * dt);
      else e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      if (td <= reach + 0.1 && e.cd <= 0) {
        e.cd = def.cd;
        if (e.type === 'archer') g.fx.push({ k: 'shot', x: e.x, y: e.y, tx: tgt.x, ty: tgt.y, type: 'danger', t: 0.12 });
        if (isNecro) { n.hp -= def.dmg; n.hurt = 0.25; }
        else hurtChimera(g, tgt, def.dmg);
      }
    }

    // 서로 겹치지 않게 살짝 민다.
    const bodies = g.enemies.filter(e => e.hp > 0).concat(g.chimeras.filter(c => c.down <= 0));
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

    for (const p of g.parts) {
      p.ttl -= dt;
      if (p.ttl > 0 && dist(p, n) < PICK_RADIUS) { pickup(g, p); p.ttl = 0; }
    }
    g.parts = g.parts.filter(p => p.ttl > 0);
    g.enemies = g.enemies.filter(e => e.hp > 0);
    for (const f of g.fx) f.t -= dt;
    g.fx = g.fx.filter(f => f.t > 0);

    if (n.hp <= 0) { n.hp = 0; g.over = 'lose'; }
    else if (g.t >= DURATION) { g.t = DURATION; g.over = 'win'; }
  }

  // 같은 키메라를 다시 고르면 지정이 풀린다.
  function setTarget(g, id) { g.target = g.target === id ? null : id; }

  const api = { W, H, DURATION, SLOTS, ENEMY, newGame, step, stats, partCount, setTarget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChimeraSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
