// 키메라 실험 3: 등급 합성. 같은 등급 둘을 합치면 다음 등급의 몬스터가 무작위로 나온다.
// 규칙만 담는다(화면·DOM 없음). 같은 시드면 같은 판이 나온다.
(function (root) {
  'use strict';
  const W = 18, H = 30, DURATION = 90, MAX_GRADE = 10;
  const ARCHS = ['beast', 'armor', 'shooter'];

  // 몬스터 표: 등급마다 셋(맹수 / 갑주 / 사수). 적도 소환수도 이 표에서 나온다.
  const MON = [
    null,
    { beast: '굶주린 쥐',   armor: '해골 병사',     shooter: '뼈 궁수' },
    { beast: '늑대',        armor: '방패병',        shooter: '석궁병' },
    { beast: '흑랑',        armor: '철갑 기사',     shooter: '독침 사수' },
    { beast: '서리 표범',   armor: '묘지 수호자',   shooter: '저주 사냥꾼' },
    { beast: '그림자 맹수', armor: '강철 골렘',     shooter: '망령 궁수' },
    { beast: '쌍두 사냥개', armor: '흑요석 거인',   shooter: '눈알 마법사' },
    { beast: '만티코어',    armor: '죽음의 기사',   shooter: '리치' },
    { beast: '지옥 사자',   armor: '심연의 수문장', shooter: '뼈 발리스타' },
    { beast: '펜리르',      armor: '타이탄',        shooter: '대리치' },
    { beast: '종말의 짐승', armor: '불멸의 군주',   shooter: '심연의 눈' },
  ];
  // 1등급 기준 능력. 등급이 하나 오를 때마다 체력과 피해가 gradeMul배.
  const BASE = {
    beast:   { hp: 45,  dmg: 7, cd: 0.5, spd: 6.6, range: 0.3, taken: 1,   taunt: false },
    armor:   { hp: 110, dmg: 6, cd: 0.9, spd: 5.4, range: 0.3, taken: 0.7, taunt: true },
    shooter: { hp: 40,  dmg: 7, cd: 0.9, spd: 5.6, range: 5,   taken: 1,   taunt: false },
  };
  const FOE = {
    beast:   { hpK: 0.4, dmg: 4, cd: 0.7, spd: 4.5, range: 0.25, r: 0.42 },
    armor:   { hpK: 0.7, dmg: 8, cd: 1.2, spd: 2.2, range: 0.3,  r: 0.6 },
    shooter: { hpK: 0.45, dmg: 5, cd: 1.8, spd: 2.8, range: 5.5, r: 0.42 },
  };
  // 실패한 합성이 남기는 흠. 다음 합성에도 그대로 따라간다.
  const DEFECTS = {
    lame:   { name: '절름발이', note: '느리다' },
    oneeye: { name: '외눈',     note: '자주 빗나간다' },
    onearm: { name: '외팔',     note: '공격이 느리다' },
    frail:  { name: '허약',     note: '체력이 적다' },
  };
  const CFG = {
    maxUnits: 3,
    maxMp: 10, startMp: 3, mpPerKill: 0.8,      // 적을 잡으면 등급 × 이 값만큼 찬다
    costPerGrade: 2,                            // 되살리는 MP = 등급 × 이 값
    greatChance: 0.15,                          // 대성공: 두 등급 오른다
    failChance: 0.2,                            // 실패: 다음 등급이지만 흠이 하나 생긴다
    gradeMul: 2.2,
    foeGradeMul: 1.35,
    spawnStart: 1.5, spawnEnd: 0.95,
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
  const has = (u, d) => u.defects.indexOf(d) >= 0;

  function nameOf(u) { return u.defects.map(d => DEFECTS[d].name).concat(MON[u.g][u.arch]).join(' '); }
  function radiusOf(g) { return 0.5 + 0.1 * (g - 1); }
  function costOf(g) { return g * CFG.costPerGrade; }

  function stats(u) {
    const b = BASE[u.arch], m = Math.pow(CFG.gradeMul, u.g - 1);
    return {
      maxHp: b.hp * m * (has(u, 'frail') ? 0.65 : 1),
      dmg: b.dmg * m,
      cd: b.cd * (has(u, 'onearm') ? 1.5 : 1),
      spd: b.spd * (has(u, 'lame') ? 0.6 : 1),
      miss: has(u, 'oneeye') ? 0.3 : 0,
      range: b.range, ranged: u.arch === 'shooter', taken: b.taken, taunt: b.taunt,
    };
  }

  function makeUnit(g, grade, arch, defects, x, y) {
    const u = { uid: g.nextUid++, x, y, g: grade, arch, defects: defects.slice(), hp: 0, r: radiusOf(grade), cd: 0, down: 0, pop: 0.5, face: -Math.PI / 2 };
    u.hp = stats(u).maxHp;
    g.found[grade + ':' + arch] = true;
    g.maxGrade = Math.max(g.maxGrade, grade);
    return u;
  }

  function newGame(seed) {
    const g = {
      W, H, DURATION, t: 0, over: null, rand: mulberry(seed || 1), nextUid: 1,
      necro: { x: W / 2, y: H * 0.6, hp: 100, maxHp: 100, r: 0.5, hurt: 0, mp: CFG.startMp, maxMp: CFG.maxMp },
      units: [], enemies: [], souls: [], fx: [],
      selected: null,
      found: {}, maxGrade: 1,
      spawnT: 1.2, kills: 0, raised: 0, fusions: 0, greats: 0, fails: 0, absorbs: 0,
    };
    // 네크로맨서는 직접 싸우지 못한다. 1등급 하나를 데리고 시작한다.
    g.units.push(makeUnit(g, 1, 'armor', [], g.necro.x, g.necro.y + 1.5));
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
    const k = g.t / DURATION, r = g.rand(), r2 = g.rand();
    g.spawnT = (CFG.spawnStart + (CFG.spawnEnd - CFG.spawnStart) * k) * (0.8 + 0.4 * g.rand());
    let arch = 'beast';
    if (g.t >= 12 && g.t < 35) arch = r < 0.65 ? 'beast' : 'shooter';
    else if (g.t >= 35) arch = r < 0.42 ? 'beast' : r < 0.7 ? 'shooter' : 'armor';
    let grade = 1;
    if (g.t >= 18 && g.t < 45) grade = r2 < 0.65 ? 1 : 2;
    else if (g.t >= 45) grade = r2 < 0.35 ? 1 : r2 < 0.75 ? 2 : 3;
    const n = arch === 'beast' && grade === 1 && g.t > 30 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 6; tries++) {
        const side = Math.floor(g.rand() * 4), u = g.rand();
        x = side === 0 ? 0.4 : side === 1 ? W - 0.4 : u * W;
        y = side === 2 ? 0.4 : side === 3 ? H - 0.4 : u * H;
        if (Math.hypot(x - g.necro.x, y - g.necro.y) > 7) break;
      }
      const f = FOE[arch], m = Math.pow(CFG.foeGradeMul, grade - 1), hp = BASE[arch].hp * f.hpK * m;
      g.enemies.push({ arch, g: grade, x, y, hp, maxHp: hp, dmg: f.dmg * m, r: f.r + 0.08 * (grade - 1), cd: 0.4, face: 0 });
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
    g.necro.mp = Math.min(g.necro.maxMp, g.necro.mp + CFG.mpPerKill * e.g);
    g.fx.push({ k: 'die', x: e.x, y: e.y, arch: e.arch, t: 0.35 });
    if (g.souls.length < 10) g.souls.push({ x: clamp(e.x, 0.8, W - 0.8), y: clamp(e.y, 0.8, H - 0.8), arch: e.arch, g: e.g, ttl: CFG.soulTtl });
  }

  function canRaise(g, soul) { return g.units.length < CFG.maxUnits && g.necro.mp >= costOf(soul.g); }

  // 혼을 밟으면 그 적이 같은 등급의 소환수로 되살아난다. 자리나 MP가 모자라면 혼은 남는다.
  function raise(g, soul) {
    if (!canRaise(g, soul)) return false;
    g.necro.mp -= costOf(soul.g);
    const u = makeUnit(g, soul.g, soul.arch, [], soul.x, soul.y);
    g.units.push(u);
    g.raised++;
    g.fx.push({ k: 'raise', x: u.x, y: u.y, arch: u.arch, t: 0.45 });
    return true;
  }

  // 합성. 같은 등급이면 다음 등급의 몬스터가 무작위로 나온다(대성공 +2, 실패는 흠 하나).
  // 등급이 다르면 높은 쪽이 낮은 쪽을 삼켜 체력을 채우고 자리만 비운다.
  function fuse(g, a, b) {
    g.selected = null;
    if (a.g !== b.g) {
      const hi = a.g > b.g ? a : b, lo = hi === a ? b : a;
      hi.hp = stats(hi).maxHp; hi.down = 0; hi.pop = 0.4;
      g.units = g.units.filter(u => u !== lo);
      g.absorbs++;
      g.fx.push({ k: 'fuse', x: hi.x, y: hi.y, r: hi.r, result: 'absorb', name: '', t: 0.5 });
      return 'absorb';
    }
    const roll = g.rand();
    let result = 'normal', grade = a.g + 1;
    const defects = a.defects.slice();
    for (const d of b.defects) if (defects.indexOf(d) < 0) defects.push(d);   // 흠은 둘 다 따라간다
    if (roll < CFG.failChance) {
      const left = Object.keys(DEFECTS).filter(d => defects.indexOf(d) < 0);
      if (left.length) defects.push(left[Math.floor(g.rand() * left.length)]);
      result = 'fail'; g.fails++;
    } else if (roll < CFG.failChance + CFG.greatChance) {
      grade = a.g + 2; result = 'great'; g.greats++;
    }
    grade = Math.min(MAX_GRADE, grade);
    const arch = ARCHS[Math.floor(g.rand() * ARCHS.length)];
    const u = makeUnit(g, grade, arch, defects, b.x, b.y);
    u.pop = 0.7; u.cd = 0.3;
    g.units = g.units.filter(x => x !== a && x !== b);
    g.units.push(u);
    g.fusions++;
    g.fx.push({ k: 'fuse', x: u.x, y: u.y, r: u.r, result, name: nameOf(u), grade, t: 1.1 });
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
          const missed = s.miss > 0 && g.rand() < s.miss;
          if (s.ranged) g.fx.push({ k: 'shot', x: u.x, y: u.y, tx: best.x + (missed ? 0.9 : 0), ty: best.y - (missed ? 0.9 : 0), arch: 'shooter', t: 0.2 });
          else if (!missed) g.fx.push({ k: 'hit', x: best.x, y: best.y, big: u.g >= 3, t: 0.15 });
          if (missed) g.fx.push({ k: 'miss', x: best.x, y: best.y - best.r - 0.3, t: 0.4 });
          else {
            best.hp -= s.dmg;
            if (best.hp <= 0) killEnemy(g, best);
          }
        }
      } else {
        const a = Math.PI / 2 + idx * Math.PI * 2 / 3;
        const tx = n.x + Math.cos(a) * (1.3 + u.r), ty = n.y + Math.sin(a) * (1.3 + u.r);
        if (Math.hypot(tx - u.x, ty - u.y) > 0.15) moveToward(u, tx, ty, s.spd * dt);
      }
    });

    for (const e of g.enemies) {
      if (e.hp <= 0) continue;
      const f = FOE[e.arch];
      e.cd -= dt;
      // 적은 네크로맨서를 노린다. 길을 막은 소환수나 적을 끄는 갑주가 있으면 그쪽과 싸운다.
      let tgt = n, isNecro = true, td = dist(e, n);
      for (const u of g.units) {
        if (u.down > 0) continue;
        const d = dist(e, u);
        const pull = stats(u).taunt ? 4 : (e.arch === 'shooter' ? 0 : u.r + e.r + 0.5);
        if (d < pull && (isNecro || d < td)) { tgt = u; isNecro = false; td = d; }
      }
      const reach = f.range + tgt.r + e.r;
      if (td > reach * (e.arch === 'shooter' ? 0.9 : 1)) moveToward(e, tgt.x, tgt.y, f.spd * dt);
      else e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      if (td <= reach + 0.1 && e.cd <= 0) {
        e.cd = f.cd;
        if (e.arch === 'shooter') g.fx.push({ k: 'shot', x: e.x, y: e.y, tx: tgt.x, ty: tgt.y, arch: 'danger', t: 0.12 });
        if (isNecro) { n.hp -= e.dmg; n.hurt = 0.25; }
        else hurtUnit(g, tgt, e.dmg);
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

  const api = { W, H, DURATION, MAX_GRADE, ARCHS, MON, DEFECTS, CFG, newGame, step, stats, nameOf, costOf, canRaise, tapUnit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChimeraSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
