// 키메라 실험 7차: 유전자 누적 + 불안정도 탈피(자폭 뒤 심장 계승) + 돌격조.
// 한 판의 목적: 봉쇄 초소를 탈피 폭발로 모두 부수고, 나타난 대장을 잡는다. 구역마다 키메라는 처음부터 키운다.
// 규칙만 담는다(화면·DOM 없음). 같은 시드면 같은 판이 나온다.
(function (root) {
  'use strict';
  const W = 18, H = 30, DURATION = 90, MAX_LEVEL = 10;
  const KINDS = ['beast', 'armor', 'ranger'];
  // 대장 종류: 구역마다 갑주, 맹수, 사수 순으로 돈다(돌격조처럼)
  const BOSS_ORDER = ['armor', 'beast', 'ranger'];
  // 구역별 잡몹 종류 비율(나머지는 갑주). 구역 번호로 돈다(1, 4, 7…은 0번, 2, 5…는 1번, 3, 6…은 2번). 0번이 예전 foeMixEarly/foeMixLate 그대로
  const FOE_MIXES = [
    { early: { beast: 0.5, ranger: 0.25 }, late: { beast: 0.42, ranger: 0.28 } },
    { early: { beast: 0.38, ranger: 0.37 }, late: { beast: 0.34, ranger: 0.38 } },   // 사수가 많다
    { early: { beast: 0.4, ranger: 0.2 }, late: { beast: 0.32, ranger: 0.22 } },     // 갑주가 많다
  ];

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
    // 익은 채(80~99%) 들고 있으면 대가: 초마다 최대 체력의 frenzyDrain만큼 샌다. 그렇게 쓰러지면 일어날 때까지 터뜨릴 수 없다(2026-11-16 사용자 결정)
    frenzyDrain: 0.05,
    // 다 익은 폭발의 종류별 특수 효과(2026-11-22 8차 지시서). 거리·반경은 다 익은 폭발 반경(R)의 배수.
    // 사수: 집속탄 n발을 R*dist에 깔고 t0~t1초에 차례로 터뜨린다(반경 R*r, 잡몹 즉사, 돌격조·대장은 본 폭발 피해의 frac, 초소는 그대로).
    // 맹수: t초 동안 반경 R*r 소용돌이가 돌진하지 않는 적과 혼을 가운데로 끈다(초당 거리). 갑주: 네크로맨서가 t초 동안 모든 피해를 받지 않는다.
    special: {
      ranger: { n: 5, dist: 0.95, r: 0.55, t0: 0.25, t1: 0.4, frac: 0.25 },
      beast: { t: 3, r: 1.45, pullFoe: 4.5, pullSoul: 7 },
      armor: { t: 4 },
    },
    // mega_special 변이를 가지면 바뀌는 값(사수 발 수, 맹수 시간·반경, 갑주 시간과 막을 때마다 반경 안 적을 미는 거리)
    megaSpecial: { rangerN: 8, beastT: 4.5, beastR: 1.8, armorT: 6, pushR: 2.5, push: 1.5 },
    // 초소 변이(2026-11-22 8차 지시서 2단계). 초소를 부술 때마다 판이 멈추고 셋 중 하나를 고른다. 판 안에서만 간다.
    mut: { pick: 3, chainT: 0.15, chainR: 2.4, gluttonyInst: 0.5, gluttonyR: 0.3, bloodHeal: 20, bloodStunR: 3.5, bloodStun: 1.2,
      madFrenzyMul: 2, fastInst: 40, fastT: 5, fastMul: 2, breakerCharge: 0.5, breakerBossCap: 0.5, twinDx: 0.55, twinKeep: 0.5,
      leapCd: 0.15, vortexR: 0.15, wallT: 1, quakeDmg: 0.2, volleyCd: 0.15, clusterR: 0.15 },   // twinKeep: 쌍둥이 심장의 둘째 심장이 담는 유전자 비율(탈피 보너스 없음, 2026-11-22 사용자: 너무 세다)
    blastRadius: 3.2, blastEliteFrac: 0.1, blastKnock: 3, blastStun: 1.2,
    rushSpeed: 14, rushMax: 1.0, rushReach: 10, rushBigBonus: 1.5,   // 뛰어들 수 있는 거리, 큰 표적에게 주는 거리 덤
    // 덜 익은 폭탄(불안정도 80% 미만)은 약하고 대가가 있다: 반경이 좁고, 잡몹을 즉사시키지 못하고, 심장이 유전자를 덜 지킨다
    blastMinRadius: 0.5, blastWeakMul: 3, heartWeakKeep: 0.6,
    heartWeakWait: 3,          // 덜 익은 채 터진 심장은 식을 때까지(최대 3초) 주울 수 없다
    postMinCharge: 0.5,        // 불안정도 40% 미만의 폭발은 초소에 통하지 않는다
    feedGap: 0.35, feedGapAfterRebirth: 0.8,           // 흡수 사이의 실제 시간 간격(초). 혼 더미 위에서 한꺼번에 먹지 않게
    heartTtl: 12, heartFullFor: 4, heartMinKeep: 0.8,   // 심장은 4초 안에 주우면 유전자 100%, 12초째에는 80%
    moltBonus: 0.1, mutantBonus: 0.2,
    statPerGene: 0.35,
    eliteFirst: 20, eliteEvery: 25, eliteWarn: 1.5,   // 돌격조는 20초에 처음, 그 뒤 25초마다
    eliteEveryLate: 18,        // 90초(DURATION) 뒤에 나온 돌격조부터 다음 돌격조까지의 간격(마지막 초소를 남겨 두고 오래 끌지 않게)
    postHits: 2, postRange: 4.2, postDmg: 3, postCd: 1.5,   // 초소: 폭발 두 번(불안정도가 찬 폭발은 한 번)에 부서진다
    bossHp: 600, bossBlastCap: 0.35,                   // 대장: 폭발 한 번에 최대 체력의 35%까지만
    // 맹수 대장: 겨누는 시간이 짧고, 돌진 뒤 gap초에 한 번 더(chain번) 돌진한 다음 보통 간격으로 돌아간다.
    // 사수 대장: every초마다 1등급 수비대 n마리를 둘레(r)에 부른다.
    bossBeast: { aimTime: 0.6, gap: 1.5, chain: 1 }, bossRanger: { every: 6, n: 3, r: 1.8 },
    // Lap 2+ (district 4+): weaker assist pattern added to the boss (districtScale also rises, so softer than lap-1 originals).
    // armor/beast boss: summon n grade-1 escorts every `every` s. ranger boss: after a charge, chain more charges with `gap` s (normal aim time).
    bossLap: { armor: { every: 8, n: 2, r: 1.8 }, beast: { every: 10, n: 2, r: 1.8 }, ranger: { chain: 1, gap: 3 } },
    // District 1 armor boss (lap 0 only): three phases. hp <= at[0] -> phase 2 (roar, then bossLap.armor escorts), hp <= at[1] -> phase 3 (roar, then chain charges).
    // Each shift happens once. roar: seconds the boss stands still. weakMul: chimera (non-blast) damage while stunned by a barricade hit (blasts keep bossBlastCap).
    // Lap 1+ bosses keep their own patterns from full hp (no phases, no weak point).
    // summon: phase 2 escorts, bossLap.armor with a longer gap and fewer escorts (set below CFG, bossLap.armor itself is untouched); first call waits a full gap after the roar.
    // chainGap: >= bossLap.ranger.gap and < rechargeEvery, so the district 1 boss stays softer than lap 1+ bosses.
    bossPhase: { at: [0.66, 0.33], roar: 1.6, weakMul: 2, chain: 1, chainGap: 4, summon: null },
    // 돌격조 종류별 pattern(대장 pattern 코드를 같이 쓴다). 1구역 난이도를 지키려 bossLap보다 약하게: 맹수 돌격조는 돌진 뒤 gap초(< rechargeEvery)에 chain번 더,
    // 사수 돌격조는 every초마다 1등급 escort n마리를 둘레 r에 부른다. 갑주 돌격조는 pattern 없음(예전 그대로)
    eliteBeast: { chain: 1, gap: 4 }, eliteRanger: { every: 12, n: 1, r: 1.5 },
    // Summon post (district 2+): one post per game calls n grade-1 escorts every `every` s while the necromancer is inside its firing range (eliteRanger values)
    postSummon: { every: 12, n: 1, r: 1.5 },
    districtScale: 0.25,                               // 구역이 하나 오를 때마다 적의 체력과 피해가 이만큼 더
    // 골드: 판마다(이기든 지든) 부순 초소 하나에 perPost, 구역을 처음 정복하면 perClear를 더 받는다(2026-11-16 사용자 결정).
    // 골드로 사는 강화: 소환수 능력치(종류마다 따로, 그 종류의 모든 소환수에 붙는다)와 네크로맨서 체력.
    // geneRefund·geneMaxOld: 예전 '시작 맹수 유전자' 강화 한 단계에 쓴 골드와 그 상한(그 강화를 없애며 돌려준다, 2026-11-17)
    // 돌격조 처치 수마다 perElite, 대장을 잡으면 perBoss를 더 받는다(이기든 지든, 판이 끝날 때 earn이 준다)
    // statCost/hpCost: progressive price table, indexed by the level already owned (0..max-1); cheap first levels, later levels cost more.
    // rangeRefund: the old flat price (3) paid per removed melee range level, refunded when an old save is read.
    gold: { perPost: 1, perClear: 3, perElite: 1, perBoss: 2, statCost: [2, 3, 4, 5, 6], statMax: 5, hpCost: [2, 2, 3, 3, 4, 4, 5, 5], hpStep: 10, hpMax: 8, rangeRefund: 3, geneRefund: 3, geneMaxOld: 8, seedCost: 4, seedMax: 1, seedPerClear: 1 },   // seedCost/seedMax: one-shot mutation seed (buy before a run, at most 1 held). seedPerClear: seeds given on a first conquest (capped at seedMax)
    // 능력치 강화 한 단계: 체력·공격력·이속·사거리는 그만큼 오르고, 간격·받는 피해는 (1+값)으로 나눈다
    statStep: { hp: 0.15, dmg: 0.15, cd: 0.1, spd: 0.08, range: 0.12, leap: 0.12, quake: 0.12, taken: 0.1 },
    // Shop list per kind (same slot order). Only ranger keeps range; beast buys leap (skill cooldown), armor buys quake (shockwave).
    // leap: skillCd / (1 + leap*lv), never below skillCdMin. quake: shockwave dmg x(1 + quake*lv), needs hits - floor(lv/every) hits (>= minHits).
    statKinds: { beast: ['hp', 'dmg', 'cd', 'spd', 'leap', 'taken'], armor: ['hp', 'dmg', 'cd', 'spd', 'quake', 'taken'], ranger: ['hp', 'dmg', 'cd', 'spd', 'range', 'taken'] },
    skillCdMin: 1.5, shock: { hits: 4, every: 2, minHits: 2 },
    eliteHp: 260, eliteHpStep: 0.5,
    chargeSpeed: 13, chargeDmg: 25, eliteDmg: 12, rechargeEvery: 7, aimTime: 1.2,
    spawnStart: 4.5, spawnEnd: 2.7, foeGradeMul: 1.35,
    // Mid (grade 2) spawn chance per lap: lap = floor((district - 1) / 3). Lap 0 keeps 30% (18-50 s) / 50% (50 s+); each lap adds midLapStep, capped at midMax
    midLapStep: 0.10, midMax: 0.70,
    // 무리와 수비대(2026-11-22 9차 지시서). 1등급 잡몹은 한 지점에 뭉쳐 나온다: early초 전에는 early[0]~[1]마리, 그 뒤 late[0]~[1]마리. 무리 잡몹의 체력·공격력은 hp·dmg배.
    // 지시서 값(간격 2.6~1.5초, 4~5마리, 체력 0.75배)은 봇 1구역 정복 33→4/40이라 사용자가 간격·마릿수·스탯을 다시 정함(2026-11-22).
    // 초소마다 둘레(guardR0~guardR1)에 1등급 수비대 guardN마리. 네크로맨서가 그 초소 guardWake 안에 오거나 맞기 전까지 서 있다.
    // 1등급 잡몹은 aggroR 안에 키메라가 있으면 네크로맨서 대신 가장 가까운 키메라를 친다.
    pack: { early: [2, 3], late: [3, 4], earlyT: 15, r: 1.2, hp: 0.6, dmg: 0.55 }, foeCap: 48,
    // Zone 1 three acts (district 1 only): every broken post sends one alarm wave next to it (packAt pack of pack + packStep*(postsDown-1) grade-1 foes
    // plus `mid` grade-2 makeFoe), placed `off` beyond the post (away from the necromancer). The wave ignores foeCap so it is never dropped.
    acts: 3, alarm: { pack: 2, packStep: 1, mid: 1, r: 1.2, off: 2.5 },
    guard: { n: 5, r0: 1.5, r1: 2.4, wake: 6.5 }, aggroR: 3.5,
    subKnock: 1.2, multiKill: 3,
    // Barricades (BARRICADE_LAYOUTS): min distance from every post spot of the layout and from the start point, min open gap to walls and between barricades, max half-thickness of the thin side
    barricade: { clearPost: 3.2, clearStart: 4, gap: 1.6, thin: 0.45 },
    // 평타 타격감(2026-11-22 사용자 요청): 잡몹(돌격조·대장 빼고)은 맞으면 종류별 거리만큼 밀리고 stagger초 멈칫한다.
    // swing·flash는 화면용 시간(공격 몸짓, 맞은 적의 번쩍임)
    hit: { knock: { beast: 0.18, armor: 0.35, ranger: 0.12 }, stagger: 0.12, swing: 0.18, flash: 0.1 },
    // 잡몹 종류의 비율(나머지는 갑주). 처음부터 셋 다 나와 첫 소환부터 종류를 고를 수 있다(2026-11-16 사용자 결정, 전에는 10초까지 군견만)
    foeMixes: FOE_MIXES, foeMixEarly: FOE_MIXES[0].early, foeMixLate: FOE_MIXES[0].late, foeMixLateAt: 35,
  };
  CFG.bossPhase.summon = Object.assign({}, CFG.bossLap.armor, { every: 12, n: 1 });   // phase 2 escorts of the district 1 armor boss
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
  // 초소 변이 카드. max: 같은 카드를 몇 번까지 가질 수 있는지(없으면 제한 없음)
  const MUTS = {
    twin_heart: { name: '쌍둥이 심장', desc: '익은 폭발 시 유전자 절반짜리 심장이 하나 더 떨어진다', max: 1 },
    chain_fuse: { name: '연쇄 도화선', desc: '폭발로 죽은 잡몹이 작은 연쇄 폭발을 일으킨다', max: 1 },
    gluttony: { name: '과식 본능', desc: '혼 불안정도 +50%, 익은 폭발 반경 +30%' },
    blood_heart: { name: '흡혈 심장', desc: '심장을 주우면 네크로맨서 체력 +20, 주변 적 기절' },
    mad_blood: { name: '광폭 유지', desc: '과부하 체력 감소 없음, 광기 화력 2배', max: 1 },
    mega_special: { name: '특수 폭발 증폭', desc: '집속탄·소용돌이·방벽이 크게 강해진다', max: 1 },
    fast_molt: { name: '고속 재연성', desc: '심장 계승 시 불안정도 40%로 시작, 5초간 공속·이속 2배', max: 1 },
    post_breaker: { name: '공성 특화', desc: '덜 익은 폭발(40%+)도 초소를 바로 부순다, 대장 폭발 상한 50%', max: 1 },
    // Per-kind cards (max 1 each, conservative). They only scale existing skillCd / CFG.special / shockwave numbers via mutN (CFG.mut.leapCd..clusterR).
    beast_leap: { name: '맹수 도약 강화', desc: '맹수 도약 간격 -15%, 소용돌이 반경 +15%', max: 1 },
    armor_bulwark: { name: '갑주 방벽 강화', desc: '갑주 방벽 +1초, 충격파 피해 +20%', max: 1 },
    ranger_volley: { name: '사수 일제 사격 강화', desc: '사수 일제 사격 간격 -15%, 집속탄 반경 +15%', max: 1 },
  };
  const MUT_IDS = Object.keys(MUTS);
  const mutN = (g, id) => (g.muts && g.muts[id]) || 0;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function geneTotal(u) { return u.genes.beast + u.genes.armor + u.genes.ranger; }
  // 등급: 유전자 2개에 2, 5개에 3, 10개에 4 … 82개에 10. 높을수록 많이 먹어야 오른다.
  function levelOf(u) { return Math.min(MAX_LEVEL, 1 + Math.floor(Math.sqrt(geneTotal(u) - 1))); }
  function radiusOf(u) { return 0.5 + 0.09 * (levelOf(u) - 1); }
  function isFrenzy(u) { return u.inst >= CFG.frenzyAt; }
  // 주 유전자(종류)는 소환할 때 밟은 혼으로 정해지고 끝까지 바뀌지 않는다(2026-11-15 사용자 결정: 군견 혼이 많아 모두 맹수로 바뀌던 문제).
  // 심장으로 깨어나도 같은 종류. 다른 유전자는 섞인 유전자로만 붙는다.

  // 능력과 기술은 모두 유전자 개수에서 나온다. 주 유전자가 몸과 기술을, 섞인 유전자가 그 변형을 정한다.
  const NO_UP = { hp: 0, dmg: 0, cd: 0, spd: 0, range: 0, leap: 0, quake: 0, taken: 0 };
  function stats(u) {
    const g = u.genes, b = BASE[u.main], total = geneTotal(u), q0 = u.up || NO_UP, ss = CFG.statStep, kl = CFG.statKinds[u.main], q = {};
    for (const k in NO_UP) q[k] = kl.includes(k) && Number.isFinite(q0[k]) ? q0[k] : 0;   // only upgrades this kind can buy (melee: no range)
    const sb = u.main === 'beast' ? 0 : g.beast, sa = u.main === 'armor' ? 0 : g.armor, sr = u.main === 'ranger' ? 0 : g.ranger;
    const m = (1 + CFG.statPerGene * (total - 1)) * (1 + CFG.moltBonus * u.molts) * (u.mutant ? 1 + CFG.mutantBonus : 1);
    const fz = isFrenzy(u) ? (u.mad ? CFG.mut.madFrenzyMul : CFG.frenzyMul) : 1, hz = u.hasteT > 0 ? CFG.mut.fastMul : 1;   // mad: 광폭 유지 변이, hasteT: 고속 재연성
    return {
      level: levelOf(u), total,
      maxHp: b.hp * m * (1 + 0.15 * sa) * (1 + ss.hp * q.hp),
      dmg: b.dmg * m * fz * (1 + ss.dmg * q.dmg),
      cd: b.cd / ((1 + 0.06 * sb) * fz * hz * (1 + ss.cd * q.cd)),
      spd: b.spd * (1 + 0.06 * sb) * hz * (1 + ss.spd * q.spd),
      range: b.range * (1 + ss.range * q.range), ranged: u.main === 'ranger',
      taken: b.taken / ((1 + 0.12 * sa) * (1 + ss.taken * q.taken)),
      taunt: u.main === 'armor',
      lifesteal: Math.min(0.3, 0.05 * sb),             // 맹수 섞임: 흡혈
      skillCd: Math.min(b.skillCd / (1 + 0.12 * sb), Math.max(CFG.skillCdMin, b.skillCd / ((1 + 0.12 * sb) * (1 + ss.leap * q.leap)))),   // 맹수 섞임: 기술이 빨리 돈다 (+ leap upgrade, floor skillCdMin)
      quakeHits: Math.max(CFG.shock.minHits, CFG.shock.hits - Math.floor(q.quake / CFG.shock.every)), quakeMul: 1 + ss.quake * q.quake,   // armor shockwave upgrade
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
      up: (g.statUp && g.statUp[main]) || null,   // 골드로 산 그 종류의 능력치 강화
      mad: mutN(g, 'mad_blood') > 0, hasteT: 0,
    };
    u.r = radiusOf(u);
    u.hp = stats(u).maxHp;
    g.maxLevel = Math.max(g.maxLevel, levelOf(u));
    return u;
  }

  // 초소 자리: 시작 지점(아래쪽)에서 먼 순서. 가장 가까운 것도 사격 범위의 두 배쯤 떨어져 있다.
  const POST_SPOTS = [[4, 16], [14, 13], [8, 7.5], [15, 4.5], [3, 3.5], [9, 1.5]];
  // 초소 자리 표: 구역 번호로 돈다(잡몹 비율과 같게). 표마다 시작 지점에서 가까운 순서이고, 가장 가까운 것도 postRange의 두 배 넘게 떨어져 있다. 0번이 예전 POST_SPOTS 그대로
  const POST_LAYOUTS = [
    POST_SPOTS,
    [[14, 17], [4, 12.5], [11, 8], [3, 5], [15, 3], [8, 1.5]],
    [[9, 15.5], [3, 11], [15, 9], [9, 5.5], [2.5, 2.5], [15.5, 2]],
  ];
  const tableIdx = (district, n) => { const d = Math.floor(+district); return ((Number.isFinite(d) && d >= 1 ? d : 1) - 1) % n; };
  function postSpotsFor(district) { return POST_LAYOUTS[tableIdx(district, POST_LAYOUTS.length)]; }
  // Barricade table: cycles by district like POST_LAYOUTS (district 1, 4, 7... use index 0). Row = [center x, center y, half width hw, half height hh] (axis-aligned box).
  // In a game they appear as g.obstacles = [{ x, y, hw, hh }] (renderers read this directly). Necromancer, foes and chimeras cannot pass; rushing chimeras, souls and hearts can.
  // Each box keeps CFG.barricade.clearPost from all post spots of its layout, clearStart from the start point, gap from walls/each other; thin side <= thin (items on it stay pickable).
  const BARRICADE_LAYOUTS = [
    [[14.5, 20, 1.2, 0.4], [3.5, 22, 0.4, 1.2], [3.5, 10.5, 1.2, 0.4]],
    [[4, 20, 1.2, 0.4], [10, 13, 0.4, 1.2], [15, 10.5, 1, 0.4]],
    [[13.5, 21, 1.2, 0.4], [4.5, 18, 0.4, 1.2], [13, 13.5, 0.4, 1]],
  ];
  function barricadesFor(district) { return BARRICADE_LAYOUTS[tableIdx(district, BARRICADE_LAYOUTS.length)]; }
  const boxDist = (b, x, y) => Math.hypot(Math.max(0, Math.abs(x - b.x) - b.hw), Math.max(0, Math.abs(y - b.y) - b.hh));
  // Push circle o (x, y, r) out of box b. Returns true if it overlapped.
  function pushOutOf(o, b) {
    const r = o.r || 0, cx = clamp(o.x, b.x - b.hw, b.x + b.hw), cy = clamp(o.y, b.y - b.hh, b.y + b.hh);
    const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d >= r) return false;
    if (d > 1e-6) { o.x = cx + dx / d * r; o.y = cy + dy / d * r; return true; }
    const L = o.x - (b.x - b.hw), R = b.x + b.hw - o.x, T = o.y - (b.y - b.hh), B = b.y + b.hh - o.y, m = Math.min(L, R, T, B);   // center inside: leave by the nearest side
    if (m === L) o.x = b.x - b.hw - r; else if (m === R) o.x = b.x + b.hw + r; else if (m === T) o.y = b.y - b.hh - r; else o.y = b.y + b.hh + r;
    return true;
  }
  function blockObstacles(g, o) { let hit = false; for (const b of g.obstacles || []) if (pushOutOf(o, b)) hit = true; return hit; }
  // Entry fraction (0..1) of segment into box b grown by m, or -1 if it misses.
  function boxHit(x0, y0, x1, y1, b, m) {
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[x0, x1 - x0, b.x - b.hw - m, b.x + b.hw + m], [y0, y1 - y0, b.y - b.hh - m, b.y + b.hh + m]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return -1; continue; }
      let a = (lo - p) / d, c = (hi - p) / d;
      if (a > c) { const s = a; a = c; c = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  // moveToward, but if a barricade blocks the straight line, head for the first corner of the shortest path around it (so walkers never stall against it).
  function walkToward(g, o, tx, ty, d) {
    const r = o.r || 0;
    let hb = null, ht = 2, mt = 0, wx = tx, wy = ty;
    for (const b of g.obstacles || []) {
      const m = Math.min(0.7 * r, boxDist(b, tx, ty) - 0.05);
      if (m < 0) continue;   // target hugs this barricade: go straight, the push-out slides along it
      const t = boxHit(o.x, o.y, tx, ty, b, m);
      if (t >= 0 && t < ht) { ht = t; hb = b; mt = m; }
    }
    if (hb) {
      const m = r + 0.15, P = [], T = { x: tx, y: ty }, see = (a, c) => boxHit(a.x, a.y, c.x, c.y, hb, mt) < 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.push({ x: hb.x + sx * (hb.hw + m), y: hb.y + sy * (hb.hh + m) });
      const D = P.map(c => (see(o, c) ? dist(o, c) : 1e9)), first = [0, 1, 2, 3], done = [];
      let best = 1e9, pick = -1;
      for (let k = 0; k < 4; k++) {   // tiny Dijkstra over the four corners
        let i = -1;
        for (let j = 0; j < 4; j++) if (!done[j] && (i < 0 || D[j] < D[i])) i = j;
        if (D[i] >= 1e9) break;
        done[i] = true;
        if (see(P[i], T) && D[i] + dist(P[i], T) < best) { best = D[i] + dist(P[i], T); pick = first[i]; }
        for (let j = 0; j < 4; j++) if (!done[j] && see(P[i], P[j]) && D[i] + dist(P[i], P[j]) < D[j]) { D[j] = D[i] + dist(P[i], P[j]); first[j] = first[i]; }
      }
      if (pick >= 0) { wx = P[pick].x; wy = P[pick].y; }
    }
    moveToward(o, wx, wy, d);
  }
  function foeMixFor(district, late) { const m = FOE_MIXES[tableIdx(district, FOE_MIXES.length)]; return late ? m.late : m.early; }
  const archOf = (mix, r) => (r < mix.beast ? 'beast' : r < mix.beast + mix.ranger ? 'ranger' : 'armor');

  // opts.district: 몇 번째 구역인지(1부터). 키메라는 구역마다 맹수 하나로 처음부터 키운다.
  // opts.start: 골드로 산 시작 강화 { genes: 시작 맹수에 더할 유전자 수, hp: 네크로맨서 체력 단계 }. 불안정도는 늘 0으로 시작한다.
  // 능력치 강화 단계를 범위 안의 정수로 읽는다: { beast: { hp, dmg, cd, spd, range, taken }, armor: {...}, ranger: {...} }
  function statUpOf(o) {
    const out = {};
    for (const k of KINDS) {
      out[k] = {};
      for (const s of CFG.statKinds[k]) {
        const v = o && o[k] ? Math.floor(+o[k][s]) : 0;
        out[k][s] = Number.isFinite(v) ? clamp(v, 0, CFG.gold.statMax) : 0;
      }
    }
    return out;
  }

  function newGame(seed, opts) {
    opts = opts || {};
    const district = Math.max(1, opts.district || 1);
    const g = {
      W, H, DURATION, t: 0, over: null, rand: mulberry(seed || 1), nextUid: 1,
      necro: { x: W / 2, y: H - 3.5, hp: 100, maxHp: 100, r: 0.5, hurt: 0, shieldT: 0 },   // shieldT: 갑주 방벽이 남은 시간
      units: [], enemies: [], souls: [], hearts: [], fx: [], events: [],
      clusters: [], vortexes: [],   // 사수 집속탄(터지기를 기다림), 맹수 소용돌이
      muts: {}, choice: null, choiceQ: 0,   // 가진 변이(횟수), 고르는 중인 카드 셋(있으면 판이 멈춘다), 아직 못 고른 초소 수
      pinned: null,             // 먹일 대상으로 찍어 둔 키메라(없으면 혼에 가장 가까운 키메라)
      link: null,               // 지금 연결된 혼과 키메라(화면의 예고선)
      feedT: 0,                 // 0이 되어야 다음 혼을 먹일 수 있다(실제 시간)
      eliteIdx: 0, eliteAt: CFG.eliteFirst, eliteAtIdx: 0, spawnT: 1.2,   // eliteAt: 다음 돌격조 시각, eliteAtIdx: 그 시각이 몇 번째 돌격조의 것인지
      kills: 0, raised: 0, absorbs: 0, molts: 0, rebirths: 0, eliteKills: 0, blocks: 0, maxLevel: 1,
      ripeBlasts: 0, firstFeedT: null, firstRipeT: null,   // 지표: 다 익은 폭발 수, 처음 먹인 시각, 처음 다 익은 폭발 시각
      district, scale: 1 + CFG.districtScale * (district - 1),
      posts: [], postsTotal: 0, postsDown: 0, boss: null,
      // acts: zone 1 three-act rules on. alarms: alarm waves so far, alarm: last act shift info for banners ({ wave, act, acts, postsDown, postsTotal, x, y, t, foes, last })
      // eliteRush: the next elite was pulled forward so one shows up before the last post falls
      acts: district === 1, alarms: 0, alarm: null, eliteRush: false,
      obstacles: barricadesFor(district).map(b => ({ x: b[0], y: b[1], hw: b[2], hh: b[3] })),   // barricades (copied per game)
    };
    // 네크로맨서는 직접 싸우지 못한다. 유전자 하나짜리 맹수 하나와 시작한다.
    const step = (v, max) => { const n = Math.floor(+(v || 0)); return Number.isFinite(n) ? clamp(n, 0, max) : 0; };
    const st = opts.start || {};
    g.necro.maxHp = g.necro.hp = 100 + CFG.gold.hpStep * step(st.hp, CFG.gold.hpMax);   // 골드로 산 체력
    g.statUp = statUpOf(st.stat);   // 골드로 산 소환수 능력치(종류마다)
    // opts.starter: 첫 소환수 종류('beast' | 'armor' | 'ranger'). 없거나 KINDS에 없는 값이면 맹수(예전 그대로)
    const starter = KINDS.includes(opts.starter) ? opts.starter : 'beast';
    g.starter = starter;
    const sg = {}; sg[starter] = 1;
    g.units.push(makeUnit(g, sg, starter, g.necro.x, g.necro.y + 1.5));   // 그 종류의 골드 강화(statUp)가 그대로 붙는다
    // 봉쇄 초소: 구역이 오를수록 많아진다(셋에서 다섯까지)
    // 구역은 아래에서 시작해 위로 밀고 올라간다. 가까운 초소부터 놓는다.
    const spots = postSpotsFor(district);
    const count = Math.min(5, 2 + district);
    for (let i = 0; i < count; i++) g.posts.push({ post: true, x: spots[i][0], y: spots[i][1], r: 0.9, hp: CFG.postHits, maxHp: CFG.postHits, cd: 1, dead: false });
    g.postsTotal = count;
    // From district 2 the farthest post is the summon post; from lap 3 (district 7+) the second farthest one too.
    // No rand used, so the rest of the layout (posts, guards) is unchanged for the same seed
    const summonPosts = district < 2 ? 0 : Math.floor((district - 1) / 3) >= 2 ? 2 : 1;
    for (let k = 1; k <= summonPosts; k++) { const sp = g.posts[count - k]; sp.summon = CFG.postSummon; sp.summonT = CFG.postSummon.every; }
    // 초소 수비대: 1등급 잡몹이 초소 둘레에 모여 서 있다
    const gd = CFG.guard;
    for (const p of g.posts) for (let i = 0; i < gd.n; i++) {
      const a = (i / gd.n + g.rand() * 0.15) * Math.PI * 2, d = gd.r0 + (gd.r1 - gd.r0) * g.rand();
      const r = g.rand(), arch = archOf(foeMixFor(district, false), r);
      const e = makeFoe(g, arch, 1, clamp(p.x + Math.cos(a) * d, 0.6, W - 0.6), clamp(p.y + Math.sin(a) * d, 0.6, H - 0.6), 1);
      e.guard = true; e.home = p;
      g.enemies.push(e);
    }
    // opts.mutSeed: a gold-bought mutation seed was spent on this run -> one 3-card pick before play (same g.choiceQ/drawChoice/chooseMut flow as posts)
    if (opts.mutSeed) { g.choiceQ++; drawChoice(g); }
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

  // 돌격조 다음 간격: 90초(DURATION) 전에 나온 돌격조 뒤에는 eliteEvery, 그 뒤에는 eliteEveryLate
  const eliteGap = at => (at >= DURATION ? CFG.eliteEveryLate : CFG.eliteEvery);
  // idx번째 돌격조의 시각(eliteFirst부터 eliteGap을 차례로 더한다)
  function eliteTimeOf(idx) {
    let t = CFG.eliteFirst;
    for (let k = 0, n = Math.min(Math.max(0, Math.floor(+idx) || 0), 10000); k < n; k++) t += eliteGap(t);
    return t;
  }
  // One elite appears at the board edge in 'warn' mode (spawn() on its timetable, or actShift() when the last post fell before it showed up)
  function spawnElite(g) {
    {
      const p = edgePoint(g, 9), hp = CFG.eliteHp * (1 + CFG.eliteHpStep * Math.min(g.eliteIdx, 4)) * g.scale, arch = KINDS[(g.eliteIdx + tableIdx(g.district, KINDS.length)) % KINDS.length];   // kind order starts shifted by district (1: beast, 2: armor, 3: ranger, then cycles); hp step stays by eliteIdx
      const chainMax = arch === 'beast' ? CFG.eliteBeast.chain : 0, summon = arch === 'ranger' ? CFG.eliteRanger : null;
      g.enemies.push({
        chainMax, chainGap: chainMax ? CFG.eliteBeast.gap : 0, chainLeft: chainMax, summon, summonT: summon ? summon.every : 0,
        elite: true, arch, g: 3, x: p.x, y: p.y, hp, maxHp: hp, dmg: CFG.eliteDmg * g.scale, r: 0.95,
        cd: 0.5, face: 0, stun: 0, bleed: 0, bleedT: 0,
        mode: 'warn', modeT: CFG.eliteWarn, dx: 0, dy: 0, run: 0, runMax: 0, hitNecro: false, hitUnits: {}, rechargeT: CFG.rechargeEvery,
      });
      g.eliteIdx++;
      if (g.eliteRush) { g.eliteRush = false; g.eliteAt = eliteTimeOf(g.eliteIdx); }   // pulled-forward elite: the rest keep the normal timetable (no extra, no duplicate)
      else g.eliteAt += eliteGap(g.eliteAt);
      g.eliteAtIdx = g.eliteIdx;
      g.events.push('warn');
    }
  }
  function spawn(g, dt) {
    // 돌격조: 정해진 시각의 1.5초 전에 경고와 함께 화면 끝에 나타난다
    if (g.eliteAtIdx !== g.eliteIdx) { g.eliteAt = eliteTimeOf(g.eliteIdx); g.eliteAtIdx = g.eliteIdx; }   // eliteIdx가 eliteAtIdx와 다르면 그 번호의 시각을 따른다
    if (g.t >= g.eliteAt - CFG.eliteWarn) spawnElite(g);
    g.spawnT -= dt;
    if (g.spawnT > 0 || g.enemies.length >= CFG.foeCap) return;
    const c = spawnCurve(g), r = g.rand(), r2 = g.rand();
    g.spawnT = c.gap * (0.8 + 0.4 * g.rand());
    const mix = foeMixFor(g.district, c.late);
    const arch = r < mix.beast ? 'beast' : r < mix.beast + mix.ranger ? 'ranger' : 'armor';
    let grade = 1;
    if (c.tEff >= 18) grade = r2 < 1 - c.mid ? 1 : 2;
    const p = edgePoint(g, 7);
    if (grade === 2) { g.enemies.push(makeFoe(g, arch, 2, p.x, p.y, 1)); return; }   // 중형은 예전처럼 하나씩
    // 1등급은 한 지점에 무리로(체력은 낮게)
    const pk = CFG.pack, [lo, hi] = c.tEff < pk.earlyT ? pk.early : pk.late, n = lo + Math.floor(g.rand() * (hi - lo + 1));
    packAt(g, arch, p.x, p.y, n, pk.r);
  }
  // Zone 1 acts: effective spawn time = max(real time, DURATION * postsDown / postsTotal), so each broken post lifts the curve one step.
  // Other districts (or g.acts false) use real time only, exactly as before.
  function spawnTimeOf(g) {
    return g.acts && g.postsTotal > 0 ? Math.max(g.t, DURATION * Math.min(g.postsDown, g.postsTotal) / g.postsTotal) : g.t;
  }
  // Current act (1..CFG.acts) in zone 1, 0 elsewhere
  function actOf(g) { return g.acts ? Math.min(CFG.acts, 1 + (g.postsDown || 0)) : 0; }
  // Spawn curve (no rand): gap = base interval before the random 0.8~1.2 factor, mid = grade-2 chance once tEff >= 18 (midP = chance right now)
  function spawnCurve(g) {
    const tEff = spawnTimeOf(g), k = Math.min(1, tEff / DURATION);
    const lap = Math.max(0, Math.floor(((g.district || 1) - 1) / 3)), mid = Math.min(CFG.midMax, (tEff < 50 ? 0.3 : 0.5) + CFG.midLapStep * lap);
    return { act: actOf(g), tEff, k, gap: CFG.spawnStart + (CFG.spawnEnd - CFG.spawnStart) * k, mid, midP: tEff >= 18 ? mid : 0, late: tEff >= CFG.foeMixLateAt };
  }
  // Zone 1 act shift on a broken post p (called once on the live -> dead switch): alarm wave, banner info, and the elite pull before the last post
  function actShift(g, p) {
    const A = CFG.alarm, n = g.necro, c = spawnCurve(g), d = dist(p, n), ux = d > 1e-6 ? (p.x - n.x) / d : 0, uy = d > 1e-6 ? (p.y - n.y) / d : -1;
    const x = clamp(p.x + ux * A.off, 0.6, W - 0.6), y = clamp(p.y + uy * A.off, 0.6, H - 0.6), mix = foeMixFor(g.district, c.late), wave = g.alarms + 1;
    const foes = packAt(g, archOf(mix, g.rand()), x, y, A.pack + A.packStep * Math.max(0, g.postsDown - 1), A.r, Infinity);
    for (let i = 0; i < A.mid; i++) { const e = makeFoe(g, archOf(mix, g.rand()), 2, x, y, 1); g.enemies.push(e); foes.push(e); }
    for (const e of foes) e.alarm = wave;
    g.alarms = wave;
    // elite: 'rush' = first elite pulled forward (shows up eliteWarn later), 'now' = it came in right now, null = nothing changed
    g.alarm = { wave, act: c.act, acts: CFG.acts, postsDown: g.postsDown, postsTotal: g.postsTotal, x, y, t: g.t, foes: foes.length, last: g.postsDown >= g.postsTotal, elite: null };
    g.events.push('alarm');
    // No elite yet and only the last post is left (or none): bring the first elite in now (warned as usual)
    if (g.eliteIdx === 0 && g.postsDown >= g.postsTotal - 1 && g.eliteAt - CFG.eliteWarn > g.t) { g.eliteAt = g.t + CFG.eliteWarn; g.eliteRush = true; g.alarm.elite = 'rush'; }
    // The last post fell and still no elite (the last two posts fell in the same step, or before the pulled elite showed up):
    // spawn it right here, before the boss (explode calls spawnBoss after this). Treated as the pulled elite, so the rest keep the normal timetable
    if (g.eliteIdx === 0 && g.postsDown >= g.postsTotal) { g.eliteRush = true; spawnElite(g); g.alarm.elite = 'now'; }
  }
  // 1등급 무리를 한 지점(x, y) 둘레 r 안에 놓는다(무리 잡몹 체력·공격력). 놓은 잡몹을 돌려준다
  // cap: enemy limit (default foeCap; the zone 1 alarm wave passes Infinity)
  function packAt(g, arch, x, y, n, r, cap) {
    const pk = CFG.pack, out = [], lim = cap === undefined ? CFG.foeCap : cap;
    for (let i = 0; i < n && g.enemies.length < lim; i++) {
      const a = i / n * Math.PI * 2 + g.rand(), d = r * Math.sqrt(g.rand());
      const e = makeFoe(g, arch, 1, clamp(x + Math.cos(a) * d, 0.6, W - 0.6), clamp(y + Math.sin(a) * d, 0.6, H - 0.6), pk.hp, pk.dmg);
      g.enemies.push(e); out.push(e);
    }
    return out;
  }
  // 연속 돌진·소환 pattern: 대장과 돌격조가 같이 쓴다.
  // chain charges: beast boss by arch, others (bosses with assist flag, beast elites) by chainMax/chainGap
  const bossChainOf = e => (e.boss && e.arch === 'beast' ? CFG.bossBeast.chain : e.chainMax || 0);
  const bossGapOf = e => (e.boss && e.arch === 'beast' ? CFG.bossBeast.gap : e.chainGap);
  // 사수 대장은 arch로, 나머지(보조 pattern 대장, 사수 돌격조)는 summon 값으로 every초마다 1등급 escort를 부른다
  const summonOf = b => (b.boss && b.arch === 'ranger' ? CFG.bossRanger : b.summon);
  function summonTick(g, b, dt) {
    const o = summonOf(b);
    if (!o) return;
    b.summonT -= dt;
    if (b.summonT > 0) return;
    b.summonT = o.every;
    const r = g.rand(), arch = archOf(foeMixFor(g.district, false), r);
    for (const e of packAt(g, arch, b.x, b.y, o.n, o.r)) e.escort = true;
  }
  // Phase shifts of the phased boss (district 1 armor). Runs every step (also while stunned), each threshold only once, never back.
  function bossPhaseTick(g, b) {
    if (!b.phases || b.dead) return;
    const P = CFG.bossPhase, f = b.hp / b.maxHp;
    while (b.phase < 3 && f <= P.at[b.phase - 1]) {
      b.phase++; b.roarT = P.roar; b.roars++;
      if (b.mode !== 'chase') { b.mode = 'chase'; b.rechargeT = CFG.rechargeEvery; }   // drop a pending warn/aim/charge so no charge fires right after the roar
      if (b.phase === 2) { b.summon = P.summon; b.summonT = P.summon.every; }   // first escorts one full gap after the roar (timer paused while roaring)
      else { b.chainMax = P.chain; b.chainGap = P.chainGap; b.chainLeft = P.chain; }
      g.events.push('roar');
    }
  }
  function bossSummon(g, dt) {
    const b = g.boss;
    if (b && !b.dead) { bossPhaseTick(g, b); if (!(b.roarT > 0)) summonTick(g, b, dt); }   // no summon timer while roaring
    for (const e of g.enemies.slice()) if (e.elite && !e.boss && !e.dead) summonTick(g, e, dt);
  }
  function makeFoe(g, arch, grade, x, y, hpMul, dmgMul) {
    const f = FOE[arch], m = Math.pow(CFG.foeGradeMul, grade - 1), hp = f.hp * m * (grade === 2 ? 1.6 : 1) * g.scale * hpMul;
    return { elite: false, arch, g: grade, x, y, hp, maxHp: hp, dmg: f.dmg * m * g.scale * (dmgMul || 1), r: f.r + 0.12 * (grade - 1), cd: 0.4, face: 0, stun: 0, bleed: 0, bleedT: 0 };
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
    if (u && e.weak && e.stun > 0) dmg *= CFG.bossPhase.weakMul;   // weak point: only chimera attacks (blasts pass no unit)
    e.hp -= dmg; e.guard = false;   // 수비대는 맞으면 깨어난다
    if (u) e.flash = CFG.hit.flash;   // 키메라에게 맞으면 화면에서 잠깐 번쩍인다
    if (u && s && s.lifesteal > 0 && u.down <= 0) u.hp = Math.min(s.maxHp, u.hp + dmg * s.lifesteal);
    if (e.hp <= 0) killEnemy(g, e);
  }
  function hurtUnit(g, u, dmg) {
    if (u.state !== 'ok' || u.down > 0) return;
    const s = stats(u);
    if (s.taken < 0.99) g.fx.push({ k: 'block', x: u.x, y: u.y, face: u.face, r: u.r, t: 0.18 });
    u.hp -= dmg * s.taken;
    u.hitsTaken++;
    if (u.hp <= 0) { u.hp = 0; u.down = 6; u.drained = isFrenzy(u); g.fx.push({ k: 'down', x: u.x, y: u.y, t: 0.5 }); }
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
  // Skill cooldown after a skill: beast_leap / ranger_volley cut it (never below skillCdMin, never above the plain value)
  function skillCdOf(g, u, s) {
    const k = u.main === 'beast' ? mutN(g, 'beast_leap') * CFG.mut.leapCd : u.main === 'ranger' ? mutN(g, 'ranger_volley') * CFG.mut.volleyCd : 0;
    return k > 0 ? Math.min(s.skillCd, Math.max(CFG.skillCdMin, s.skillCd * (1 - k))) : s.skillCd;
  }
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
      u.skillT = skillCdOf(g, u, s);
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
      u.skillT = skillCdOf(g, u, s);
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
      damageEnemy(g, e, s.dmg * 1.5 * s.quakeMul * (1 + CFG.mut.quakeDmg * mutN(g, 'armor_bulwark')), u, s);
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
    if (c.inst < 0) { u.inst = 0; u.mutant = true; } else u.inst += c.inst * (1 + CFG.mut.gluttonyInst * mutN(g, 'gluttony'));
    const after = stats(u).maxHp;
    if (u.down > 0 && c.heal > 0) { u.down = 0; u.drained = false; }
    u.hp = Math.min(after, Math.max(u.hp, u.hp + (after - before)) + after * c.heal);
    u.r = radiusOf(u); u.pop = 0.5;
    g.absorbs++; if (g.firstFeedT === null) g.firstFeedT = g.t;
    g.maxLevel = Math.max(g.maxLevel, levelOf(u));
    g.fx.push({ k: 'absorb', x: soul.x, y: soul.y, uid: u.uid, type: soul.type, q: soul.q, t: 0.35 });
    g.events.push(soul.q === 3 ? 'purify' : 'absorb');
    if (!wasFrenzy && isFrenzy(u)) { g.events.push('frenzy'); g.fx.push({ k: 'ripe', uid: u.uid, x: u.x, y: u.y, t: 0.6 }); }
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
    const c = g.units.filter(canBlast).sort((a, b) => (b.inst - a.inst) || (geneTotal(a) - geneTotal(b)))[0];
    return c ? { unit: c, target: pickBlastTarget(g, c) } : null;
  }
  // 익은 채(80~99%) 쓰러진 키메라는(체력이 새서든 맞아서든) 일어날 때까지 터뜨릴 수 없다
  const canBlast = u => u.state === 'ok' && !(u.drained && u.down > 0);
  function startMolt(g, u) {
    if (!canBlast(u)) return false;
    const best = pickBlastTarget(g, u);
    u.state = 'rush'; u.rushT = 0; u.down = 0; u.target = best;
    u.charge = Math.min(1, u.inst / CFG.frenzyAt);   // 폭발의 세기는 터지는 순간의 불안정도로 정해진다
    u.tx = best ? best.x : u.x; u.ty = best ? best.y : u.y;
    g.events.push('rush');
    return true;
  }
  function explode(g, u) {
    const c = u.charge || 0, st = stats(u);   // c: 0(불안정도 0%) ~ 1(80% 이상)
    const R = CFG.blastRadius * (CFG.blastMinRadius + (1 - CFG.blastMinRadius) * c) * (c >= 1 ? 1 + CFG.mut.gluttonyR * mutN(g, 'gluttony') : 1);
    const bossCap = mutN(g, 'post_breaker') ? CFG.mut.breakerBossCap : CFG.bossBlastCap, chain = mutN(g, 'chain_fuse') > 0, k0 = g.kills;
    const eliteFrac = CFG.blastEliteFrac + (1 - CFG.blastEliteFrac) * c;
    for (const e of g.enemies) {
      if (e.dead || dist(e, u) > R + e.r) continue;
      if (e.elite) {
        if (e.mode !== 'charge') knock(e, u.x, u.y, CFG.blastKnock);
        e.stun = Math.max(e.stun, CFG.blastStun);
        if (e.mode === 'charge' || e.mode === 'aim' || e.mode === 'warn') { e.mode = 'chase'; e.rechargeT = CFG.rechargeEvery; e.chainLeft = bossChainOf(e); }
        damageEnemy(g, e, e.maxHp * (e.boss ? bossCap * (0.1 + 0.9 * c) : eliteFrac) + 0.01, null, null);
      } else {
        if (c >= 1) killEnemy(g, e);                              // 다 익은 폭탄: 잡몹 즉사
        else damageEnemy(g, e, st.dmg * (CFG.blastWeakMul + 4 * c), null, null);   // 덜 익은 폭탄: 평타 몇 대 값
        if (chain && e.dead) chainAt(g, e);
      }
    }
    // 초소는 폭발로만 부서진다. 불안정도가 찬 폭발은 한 번에, 아니면 두 번.
    for (const p of g.posts) {
      if (p.dead || dist(p, u) > R + p.r) continue;
      const hit = c >= 1 || (c >= CFG.mut.breakerCharge && mutN(g, 'post_breaker')) ? CFG.postHits : c >= CFG.postMinCharge ? 1 : 0;
      if (!hit) { g.events.push('postbounce'); g.fx.push({ k: 'block', x: p.x, y: p.y, face: Math.atan2(u.y - p.y, u.x - p.x), r: p.r, t: 0.25 }); continue; }
      p.hp -= hit;
      if (p.hp <= 0) {
        p.dead = true; g.postsDown++;
        // Broken post leaves one pure core soul (q: 3) on its spot, same shape as killEnemy. Only on the live -> dead switch, so never twice
        g.souls.push({ x: clamp(p.x, 0.8, W - 0.8), y: clamp(p.y, 0.8, H - 0.8), type: u.main, q: 3, ttl: CFG.soulTtl * 1.5 });
        g.fx.push({ k: 'postfall', x: p.x, y: p.y, t: 0.9 });
        g.events.push('postdown');
        if (g.acts) actShift(g, p);
        if (g.postsDown >= g.postsTotal && !g.boss) spawnBoss(g);
        g.choiceQ++;
      } else g.events.push('posthit');
    }
    const heart = (dx, twin) => ({ x: clamp(u.x + dx, 0.8, W - 0.8), y: clamp(u.y, 0.8, H - 0.8), genes: Object.assign({}, u.genes), main: u.main, molts: u.molts + (c >= 1 && !twin ? 1 : 0), mutant: u.mutant, keep: (CFG.heartWeakKeep + (1 - CFG.heartWeakKeep) * c) * (twin ? CFG.mut.twinKeep : 1), wait: CFG.heartWeakWait * (1 - c), age: 0, ttl: CFG.heartTtl });
    if (c >= 1 && mutN(g, 'twin_heart')) g.hearts.push(heart(-CFG.mut.twinDx), heart(CFG.mut.twinDx, true));   // 쌍둥이 심장: 둘째는 유전자 절반, 탈피 보너스 없음
    else g.hearts.push(heart(0));
    g.units = g.units.filter(x => x !== u);
    if (g.pinned === u.uid) g.pinned = null;
    g.molts++;
    if (c >= 1) { g.ripeBlasts++; if (g.firstRipeT === null) g.firstRipeT = g.t; specialBlast(g, u, R); }
    const kills = g.kills - k0;
    g.fx.push({ k: 'boom', x: u.x, y: u.y, r: R, weak: c < 1, kills, t: c < 1 ? 0.4 : 0.7 });
    g.events.push(c < 1 ? 'boomweak' : 'boom');
    if (kills >= CFG.multiKill) g.events.push('multikill');   // 연출용: 익은 폭발과 덜 익은 폭발을 다르게 보이고 들리게
    drawChoice(g);
  }
  // 연쇄 도화선: 폭발로 죽은 잡몹 자리에 작은 폭발을 예약한다. 그 작은 폭발로 죽은 잡몹은 다시 잇지 않는다(한 번만 연쇄)
  function chainAt(g, e) { g.clusters.push({ x: e.x, y: e.y, r: CFG.mut.chainR, frac: 0, t: CFG.mut.chainT, isChain: true }); }
  // 초소를 부순 수만큼 카드를 고른다(한 번에 셋, 같은 카드 없이, 다 가진 카드는 빼고). 판이 끝났으면 고르지 않는다.
  function drawChoice(g) {
    while (!g.choice && !g.over && g.choiceQ > 0) {
      g.choiceQ--;
      const pool = MUT_IDS.filter(id => !(MUTS[id].max && mutN(g, id) >= MUTS[id].max));
      if (!pool.length) continue;
      const pick = [];
      while (pick.length < CFG.mut.pick && pool.length) pick.push(pool.splice(Math.floor(g.rand() * pool.length), 1)[0]);
      g.choice = pick;
      g.events.push('choice');
    }
  }
  function chooseMut(g, id) {
    if (!g.choice || !g.choice.includes(id)) return false;
    g.muts[id] = mutN(g, id) + 1;
    if (id === 'mad_blood') for (const u of g.units) u.mad = true;
    g.choice = null;
    g.events.push('mutpick');
    drawChoice(g);   // 한 폭발로 초소를 둘 부쉈으면 이어서 한 번 더
    return true;
  }
  // 다 익은 폭발만: 주 유전자에 따라 특수 효과가 하나 더 붙는다
  function specialBlast(g, u, R) {
    const sp = CFG.special, mega = mutN(g, 'mega_special') > 0, M = CFG.megaSpecial;
    if (u.main === 'ranger') {
      const o = sp.ranger, n = mega ? M.rangerN : o.n;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / n;
        g.clusters.push({ x: clamp(u.x + Math.cos(a) * R * o.dist, 0.4, W - 0.4), y: clamp(u.y + Math.sin(a) * R * o.dist, 0.4, H - 0.4), r: R * o.r * (1 + CFG.mut.clusterR * mutN(g, 'ranger_volley')), frac: o.frac, t: o.t0 + (o.t1 - o.t0) * i / Math.max(1, n - 1) });
      }
    } else if (u.main === 'beast') {
      const t = mega ? M.beastT : sp.beast.t;
      g.vortexes.push({ x: u.x, y: u.y, r: R * (mega ? M.beastR : sp.beast.r) * (1 + CFG.mut.vortexR * mutN(g, 'beast_leap')), t, maxT: t });
    } else if (u.main === 'armor') g.necro.shieldT = Math.max(g.necro.shieldT, (mega ? M.armorT : sp.armor.t) + CFG.mut.wallT * mutN(g, 'armor_bulwark'));
  }
  // 집속탄 하나가 터진다: 잡몹은 즉사, 돌격조·대장은 본 폭발 피해의 일부, 초소는 건드리지 않는다
  function subBoom(g, b) {
    const k0 = g.kills;
    for (const e of g.enemies) {
      if (e.dead || dist(e, b) > b.r + e.r) continue;
      if (e.elite) { if (b.frac > 0) damageEnemy(g, e, e.maxHp * (e.boss ? (mutN(g, 'post_breaker') ? CFG.mut.breakerBossCap : CFG.bossBlastCap) : 1) * b.frac + 0.01, null, null); }
      else { killEnemy(g, e); if (!b.isChain && mutN(g, 'chain_fuse')) chainAt(g, e); }
      if (!e.dead && !(e.elite && e.mode === 'charge')) knock(e, b.x, b.y, CFG.subKnock);   // 살아남은 적은 살짝 밀린다
    }
    const kills = g.kills - k0;
    g.fx.push({ k: 'subboom', x: b.x, y: b.y, r: b.r, chain: !!b.isChain, kills, t: 0.35 });
    g.events.push('subboom');
    if (kills >= CFG.multiKill) g.events.push('multikill');
  }
  // 갑주 방벽이 네크로맨서에게 오는 공격 하나를 막는다
  function shieldBlock(g, src) {
    const n = g.necro;
    g.fx.push({ k: 'block', x: n.x, y: n.y, face: Math.atan2(src.y - n.y, src.x - n.x), r: n.r + 0.3, t: 0.25 });
    g.events.push('shieldblock');
    if (mutN(g, 'mega_special')) {   // 증폭된 방벽: 막을 때마다 둘레의 적을 밀어낸다
      const M = CFG.megaSpecial;
      for (const e of g.enemies) if (!e.dead && !(e.elite && e.mode === 'charge') && dist(e, n) < M.pushR + e.r) knock(e, n.x, n.y, M.push);
    }
  }
  // 초소를 다 부수면 대장이 나타난다. 돌격조처럼 예고하고 달려들지만 훨씬 단단하다.
  function spawnBoss(g) {
    const p = edgePoint(g, 9), hp = CFG.bossHp * g.scale, arch = BOSS_ORDER[((g.district || 1) - 1) % BOSS_ORDER.length];
    // lap: 0 for districts 1-3, 1 for 4-6, ... Lap 1+ adds a weaker assist pattern per boss kind
    const lap = Math.max(0, Math.floor(((g.district || 1) - 1) / 3)), L = CFG.bossLap, extra = lap >= 1;
    const summon = extra && arch !== 'ranger' ? L[arch] : null, chainMax = extra && arch === 'ranger' ? L.ranger.chain : 0;
    const phases = arch === 'armor' && lap === 0;
    g.boss = {
      // phase 1..3, phaseAt: hp thresholds (null = no phases), roarT: roar time left, roars: shifts so far, weak: weak point open (barricade stun)
      phases, phase: 1, phaseAt: phases ? CFG.bossPhase.at : null, roarT: 0, roars: 0, weak: false,
      lap, summon, chainMax, chainGap: chainMax ? L.ranger.gap : 0,
      chainLeft: arch === 'beast' ? CFG.bossBeast.chain : chainMax, summonT: summon ? summon.every : CFG.bossRanger.every,   // 남은 연속 돌진 횟수, 수비대를 부를 때까지 남은 시간
      elite: true, boss: true, arch, g: 3, x: p.x, y: p.y, hp, maxHp: hp, dmg: CFG.eliteDmg * 1.4 * g.scale, r: 1.35,
      cd: 0.5, face: 0, stun: 0, bleed: 0, bleedT: 0,
      mode: 'warn', modeT: CFG.eliteWarn + 0.8, dx: 0, dy: 0, run: 0, runMax: 0, hitNecro: false, hitUnits: {}, rechargeT: CFG.rechargeEvery,
    };
    g.enemies.push(g.boss);
    g.events.push('boss');
    return g.boss;
  }

  // 손으로 터뜨린다: 불안정도가 가장 높은(같으면 유전자가 가장 적은) 키메라가 뛰어든다.
  function detonate(g) {
    if (g.over || g.choice) return false;
    const c = g.units.filter(canBlast).sort((a, b) => (b.inst - a.inst) || (geneTotal(a) - geneTotal(b)));
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
    if (mutN(g, 'fast_molt')) { u.inst = CFG.mut.fastInst; u.hasteT = CFG.mut.fastT; }
    u.hp = stats(u).maxHp; u.pop = 0.8;
    g.units.push(u);
    g.rebirths++;
    bloodHeart(g, h);
    g.maxLevel = Math.max(g.maxLevel, levelOf(u));
    g.fx.push({ k: 'rebirth', x: u.x, y: u.y, t: 0.6 });
    g.events.push('rebirth');
    return u;
  }

  // 흡혈 심장: 심장을 주우면(계승이든 삼키든) 네크로맨서가 회복하고 둘레의 적이 기절한다
  function bloodHeart(g, h) {
    const k = mutN(g, 'blood_heart'), n = g.necro;
    if (!k) return;
    if (n.hp > 0) n.hp = Math.min(n.maxHp, n.hp + CFG.mut.bloodHeal * k);
    for (const e of g.enemies) if (!e.dead && dist(e, h) < CFG.mut.bloodStunR + e.r) e.stun = Math.max(e.stun, CFG.mut.bloodStun);
  }
  function feedTarget(g, item) {
    const ok = g.units.filter(u => u.state === 'ok');
    if (!ok.length) return null;
    const p = g.pinned === null ? null : ok.find(u => u.uid === g.pinned);
    if (p) return p;
    return ok.slice().sort((a, b) => dist(a, item) - dist(b, item))[0];
  }

  function step(g, dtReal, inp) {
    if (g.over || g.choice) return;   // 변이를 고르는 동안 판이 멈춘다
    const n = g.necro;
    // 네크로맨서는 느려진 동안에도 제 속도로 움직인다(느려진 세상 속에서 고를 틈이 생긴다)
    let mx = (inp && inp.x) || 0, my = (inp && inp.y) || 0;
    const mm = Math.hypot(mx, my);
    if (mm > 1) { mx /= mm; my /= mm; }
    n.x = clamp(n.x + mx * NECRO_SPEED * dtReal, 0.6, W - 0.6);
    n.y = clamp(n.y + my * NECRO_SPEED * dtReal, 0.6, H - 0.6);
    blockObstacles(g, n);

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
    n.shieldT = Math.max(0, n.shieldT - dt);
    spawn(g, dt);
    bossSummon(g, dt);

    for (const u of g.units.slice()) {
      const idx = g.units.indexOf(u);
      u.pop = Math.max(0, u.pop - dt);
      if (u.hasteT > 0) u.hasteT = Math.max(0, u.hasteT - dt);
      if (u.swing > 0) u.swing = Math.max(0, u.swing - dt);
      if (u.state === 'rush') {
        if (u.target && !u.target.dead) { u.tx = u.target.x; u.ty = u.target.y; }
        u.rushT += dt;
        moveToward(u, u.tx, u.ty, CFG.rushSpeed * dt);
        if (Math.hypot(u.tx - u.x, u.ty - u.y) < 0.6 || u.rushT >= CFG.rushMax) explode(g, u);
        continue;
      }
      if (u.down > 0) {
        u.down -= dt;
        if (u.down <= 0) {
          u.down = 0; u.drained = false; u.hp = stats(u).maxHp * 0.5; u.pop = 0.3;
          // 익은 채 쓰러져 있는 동안 먹어 100%가 됐으면 막혀 있던 탈피를 일어나는 순간 한다
          if (u.inst >= 100) startMolt(g, u);
        }
        continue;
      }
      const s = stats(u);
      if (isFrenzy(u) && !u.mad) {
        u.hp -= s.maxHp * CFG.frenzyDrain * dt;
        if (u.hp <= 0) { u.hp = 0; u.down = 6; u.drained = true; g.fx.push({ k: 'down', x: u.x, y: u.y, t: 0.5 }); g.events.push('drained'); continue; }
      }
      u.cd -= dt;
      let best = null, bd = 1e9;
      for (const e of g.enemies) {
        if (e.dead || dist(e, n) > LEASH) continue;
        const d = dist(e, n);   // 호위: 네크로맨서에게 가장 가까운 적부터
        if (d < bd) { bd = d; best = e; }
      }
      if (best) bd = dist(best, u);
      if (u.main === 'armor') { if (u.hitsTaken >= s.quakeHits) shockwave(g, u, s); }
      else if (best) { u.skillT -= dt; if (u.skillT <= 0 && useSkill(g, u, s, best, bd)) bd = dist(best, u); }
      if (best && !best.dead) {
        const reach = s.range + best.r + u.r;
        if (bd > reach) walkToward(g, u, best.x, best.y, s.spd * dt);
        else u.face = Math.atan2(best.y - u.y, best.x - u.x);
        if (bd <= reach + 0.1 && u.cd <= 0) {
          u.cd = s.cd; u.swing = CFG.hit.swing;
          if (s.ranged) g.fx.push({ k: 'shot', x: u.x, y: u.y, tx: best.x, ty: best.y, arch: 'ranger', uid: u.uid, t: 0.16 });
          else g.fx.push({ k: 'hit', x: best.x, y: best.y, big: s.level >= 3, uid: u.uid, t: 0.15 });
          g.events.push('hit:' + u.main);
          damageEnemy(g, best, s.dmg, u, s);
          if (!best.dead && !best.elite) {   // 평타 타격감: 잡몹은 밀리고 잠깐 멈칫한다
            knock(best, u.x, u.y, CFG.hit.knock[u.main]);
            best.stun = Math.max(best.stun, CFG.hit.stagger);
          }
        }
      } else if (!best) {
        const a = Math.PI / 2 + idx * Math.PI * 2 / 3;
        const tx = n.x + Math.cos(a) * (1.3 + u.r), ty = n.y + Math.sin(a) * (1.3 + u.r);
        if (Math.hypot(tx - u.x, ty - u.y) > 0.15) walkToward(g, u, tx, ty, s.spd * dt);
      }
    }

    // 사수 집속탄: 시간이 되면 터진다
    for (const b of g.clusters.slice()) { b.t -= dt; if (b.t <= 0) subBoom(g, b); }
    g.clusters = g.clusters.filter(b => b.t > 0);
    // 맹수 소용돌이: 돌진하지 않는 적과 바닥의 혼을 가운데로 끈다
    for (const v of g.vortexes) {
      v.t -= dt;
      const pull = (o, sp) => { const d = dist(o, v); if (d <= v.r && d > 1e-3) { const f = o.face; moveToward(o, v.x, v.y, Math.min(d, sp * dt)); if (f !== undefined) o.face = f; } };
      for (const e of g.enemies) if (!e.dead && !(e.elite && e.mode === 'charge')) pull(e, CFG.special.beast.pullFoe);
      for (const s of g.souls) pull(s, CFG.special.beast.pullSoul);
    }
    g.vortexes = g.vortexes.filter(v => v.t > 0);

    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      if (e.bleedT > 0) { e.bleedT -= dt; damageEnemy(g, e, e.bleed * dt, null, null); if (e.dead) continue; }
      const roaring = e.roarT > 0;
      if (roaring) e.roarT = Math.max(0, e.roarT - dt);
      if (e.stun > 0) { e.stun -= dt; if (e.stun <= 0) e.weak = false; continue; }
      if (roaring) continue;   // roaring boss stands still
      if (e.guard) { if (dist(e.home, n) < CFG.guard.wake || e.home.dead) e.guard = false; else continue; }   // 수비대: 초소 곁에 서 있다
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
        if (blockObstacles(g, e)) {   // hit a barricade: charge stops like an armor block
          e.stun = 1.5; stopped = true;
          if (e.phases) e.weak = true;
          g.fx.push({ k: 'clash', x: e.x, y: e.y, t: 0.4 });
          g.events.push('barricade');
        }
        for (const u of stopped ? [] : g.units) {
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
          e.hitNecro = true;
          if (n.shieldT > 0) shieldBlock(g, e);
          else {
            n.hp -= CFG.chargeDmg; n.hurt = 0.4;
            knock(n, e.x, e.y, 1.5);
            g.events.push('necrohit');
          }
        }
        const out = e.x < 0.6 || e.x > W - 0.6 || e.y < 0.6 || e.y > H - 0.6;
        e.x = clamp(e.x, 0.6, W - 0.6); e.y = clamp(e.y, 0.6, H - 0.6);
        if (stopped || out || e.run >= e.runMax) {
          e.mode = 'chase';
          if (e.chainLeft > 0) { e.chainLeft--; e.rechargeT = bossGapOf(e); }   // 맹수 대장·맹수 돌격조 등: 한 번 더 돌진
          else { e.rechargeT = CFG.rechargeEvery; e.chainLeft = bossChainOf(e); }
        }
        continue;
      }
      if (e.elite) {
        e.rechargeT -= dt;
        if (e.rechargeT <= 0) { e.mode = 'aim'; e.modeT = e.boss && e.arch === 'beast' ? CFG.bossBeast.aimTime : CFG.aimTime; g.events.push('warn'); continue; }
      }
      const f = e.elite ? { range: 0.35, spd: 3.2, cd: 1.1 } : FOE[e.arch];
      // 적은 네크로맨서를 노린다. 길을 막은 키메라나 적을 끄는 갑주가 있으면 그쪽과 싸운다.
      let tgt = n, isNecro = true, td = dist(e, n);
      for (const u of g.units) {
        if (u.down > 0 || u.state !== 'ok') continue;
        const d = dist(e, u);
        const pull = Math.max(u.main === 'armor' ? 4 : (e.arch === 'ranger' && !e.elite ? 0 : u.r + e.r + 0.5), !e.elite && e.g === 1 ? CFG.aggroR : 0);   // 1등급 잡몹은 가까운 키메라에게 붙는다
        if (d < pull && (isNecro || d < td)) { tgt = u; isNecro = false; td = d; }
      }
      const reach = f.range + tgt.r + e.r, shooter = e.arch === 'ranger' && !e.elite;
      if (td > reach * (shooter ? 0.9 : 1)) walkToward(g, e, tgt.x, tgt.y, f.spd * dt);
      else e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      if (td <= reach + 0.1 && e.cd <= 0) {
        e.cd = f.cd;
        if (shooter) g.fx.push({ k: 'shot', x: e.x, y: e.y, tx: tgt.x, ty: tgt.y, arch: 'danger', t: 0.12 });
        if (isNecro) { if (n.shieldT > 0) shieldBlock(g, e); else { n.hp -= e.dmg; n.hurt = 0.25; } }
        else hurtUnit(g, tgt, e.dmg);
      }
    }

    // 초소는 가까이 온 네크로맨서를 쏜다. 폭탄을 끌고 다가가는 길이 위험해진다.
    for (const p of g.posts) {
      if (p.dead) continue;
      p.cd -= dt;
      if (p.summon && dist(p, n) < CFG.postRange) summonTick(g, p, dt);   // summon post: its timer runs only while the necromancer is in range
      if (p.cd <= 0 && dist(p, n) < CFG.postRange) {
        p.cd = CFG.postCd;
        if (n.shieldT > 0) shieldBlock(g, p); else { n.hp -= CFG.postDmg * g.scale; n.hurt = 0.2; }
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

    // Barricades push out the necromancer, foes and chimeras (rushing chimeras jump over).
    if (g.obstacles && g.obstacles.length) { blockObstacles(g, n); for (const o of bodies) blockObstacles(g, o); }

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
          const after = stats(tgt).maxHp;
          tgt.hp = Math.min(after, Math.max(tgt.hp, tgt.hp + (after - before))); tgt.r = radiusOf(tgt); tgt.pop = 0.6;
          g.absorbs++; g.maxLevel = Math.max(g.maxLevel, levelOf(tgt));
          g.fx.push({ k: 'absorb', x: h.x, y: h.y, uid: tgt.uid, type: h.main, q: 3, t: 0.35 });
          g.events.push('absorb');
          bloodHeart(g, h);
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
  // 저장 모양: { v: 1, best: 정복한 가장 높은 구역(최고 기록), cur: 지금 진행(제목 화면의 시작 구역은 cur+1), gold,
  //   up: { hp: 네크로맨서 체력 단계, stat: { beast|armor|ranger: { hp, dmg, cd, spd, range, taken } } } }.
  // hp·cur가 없던 저장은 hp 0, cur=best로 읽는다. 골드는 best를 넘는 구역에만 주므로, cur를 1구역으로 되돌려도 다시 받지 않는다.
  // 예전 저장의 up.genes(시작 맹수 유전자 강화)는 없앴다: 읽을 때 그 단계에 쓴 골드를 돌려준다. 다시 쓰는 저장에는 genes가 없어 두 번 돌려주지 않는다.
  const SAVE_V = 1, MAX_DISTRICT = Number.MAX_SAFE_INTEGER;   // 저장값 검증용 상한(사실상 없음)
  const wholeNum = (v, max) => (Number.isFinite(+v) ? clamp(Math.floor(+v), 0, max) : 0);
  const upOf = up => ({ hp: wholeNum(up && up.hp, CFG.gold.hpMax), stat: statUpOf(up && up.stat) });   // 늘 새 객체(깊은 복사)
  const seedOf = s => wholeNum(s && s.seed, CFG.gold.seedMax);   // mutation seeds held (old saves without the field read as 0)
  function freshSave() { return { v: SAVE_V, best: 0, cur: 0, gold: 0, up: upOf(null), seed: 0 }; }
  // 저장 글을 읽는다. 깨졌으면 기본값. 새 저장이 없을 때만 옛 최고 기록(legacyBest)을 옮기고 그만큼 골드를 소급해 준다.
  // Old saves could buy range for melee kinds (beast, armor). That upgrade is gone: refund the old flat price (rangeRefund) per level (capped at statMax).
  // upOf() drops the key, so a re-saved file has nothing left to refund (no double refund).
  const meleeRangeRefund = up => ['beast', 'armor'].reduce((sum, k) => sum + wholeNum(up && up.stat && up.stat[k] && up.stat[k].range, CFG.gold.statMax) * CFG.gold.rangeRefund, 0);
  function loadSave(text, legacyBest) {
    if (text !== null && text !== undefined) {   // 빈 글도 '있었는데 깨진 저장'이다
      try {
        const o = JSON.parse(text);
        if (o && o.v === SAVE_V) {
          const best = wholeNum(o.best, MAX_DISTRICT), refund = wholeNum(o.up && o.up.genes, CFG.gold.geneMaxOld) * CFG.gold.geneRefund + meleeRangeRefund(o.up);
          return { v: SAVE_V, best, cur: o.cur === undefined ? best : wholeNum(o.cur, best), gold: wholeNum(o.gold, MAX_DISTRICT) + refund, up: upOf(o.up), seed: seedOf(o) };
        }
      } catch (e) { /* 깨진 저장은 기본값으로 */ }
      return freshSave();   // 새 저장이 있었는데 깨졌으면 옛 기록으로 다시 옮기지 않는다(소급이 되풀이되지 않게)
    }
    const s = freshSave(), b = wholeNum(legacyBest, MAX_DISTRICT);
    s.best = s.cur = b; s.gold = b * CFG.gold.perClear;
    return s;
  }
  // 구역을 정복했다: 진행(cur)을 올린다. 처음 정복한 구역이면 best도 올리고 골드를 준다(둘을 함께). 이미 깬 구역이면 골드 없음.
  const curOf = save => (Number.isFinite(save.cur) ? save.cur : save.best);
  function clearDistrict(save, district) {
    const d = Math.floor(+district), cur = curOf(save);
    if (!Number.isFinite(d) || (d <= save.best && d <= cur)) return { save, gained: 0, seedGained: false };
    const gained = d > save.best ? (d - save.best) * CFG.gold.perClear : 0;
    // First conquest only (gained > 0): one mutation seed, capped at seedMax (already full: stays at seedMax, no gold instead).
    const held = seedOf(save), seed = gained > 0 ? Math.min(CFG.gold.seedMax, held + wholeNum(CFG.gold.seedPerClear, CFG.gold.seedMax)) : held;
    return { save: { v: SAVE_V, best: Math.max(save.best, d), cur: Math.max(cur, d), gold: save.gold + gained, up: upOf(save.up), seed }, gained, seedGained: seed > held };
  }
  // 판이 끝났다: 부순 초소만큼 골드를 더한다(이기든 지든). 처음 정복의 골드는 clear가 따로 준다.
  // 돌격조 처치 수(eliteKills)마다 perElite, 대장을 잡았으면(bossKilled) perBoss를 더한다. 둘을 빼고 부르면 예전 그대로
  // Run-end gold split per item (posts / elites / boss). earn sums exactly these, so the split always matches gained.
  const runCnt = v => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
  function earnParts(posts, eliteKills, bossKilled) {
    const G = CFG.gold, p = runCnt(posts), e = runCnt(eliteKills), b = bossKilled === true;
    return { posts: { count: p, gold: p * G.perPost }, elites: { count: e, gold: e * G.perElite }, boss: { killed: b, gold: b ? G.perBoss : 0 } };
  }
  // Result-screen facts of a finished game g (no save change): posts broken, elites killed (boss not counted), boss reached / killed / hp left.
  function runSummary(g) {
    g = g || {};
    const b = g.boss || null, bossKilled = !!(b && b.dead), total = runCnt(g.postsTotal), down = Math.min(total, runCnt(g.postsDown));
    const maxHp = b ? Math.max(1, Math.round(b.maxHp)) : 0, hp = b && !bossKilled ? clamp(Math.ceil(b.hp), 0, maxHp) : 0;
    return {
      over: g.over || null, won: g.over === 'win', lost: g.over === 'lose', district: g.district,
      postsDown: down, postsTotal: total, postsLeft: total - down,
      eliteKills: Math.max(0, runCnt(g.eliteKills) - (bossKilled ? 1 : 0)),
      bossReached: !!b, bossKilled, bossHp: b ? hp : null, bossMaxHp: b ? maxHp : null, bossHpFrac: b ? hp / maxHp : null,
    };
  }
  // Settle a finished run the same way the end screen does (earn, then clear on a win). Returns the new save, the total gained,
  // and items in show order: posts, elites, boss, clear (first conquest bonus), seed. Sum of item gold === gained. run: runSummary(g) or g itself.
  function settle(save, run) {
    const r = run && run.necro ? runSummary(run) : run || {}, won = r.won === true;
    const q = earnParts(r.postsDown, r.eliteKills, r.bossKilled), e = earn(save, r.postsDown, r.eliteKills, r.bossKilled);
    let out = e.save, clearGold = 0, seedGained = false;
    if (won) { const c = clearDistrict(out, r.district); out = c.save; clearGold = c.gained; seedGained = !!c.seedGained; }
    const items = [
      { id: 'posts', count: q.posts.count, gold: q.posts.gold },
      { id: 'elites', count: q.elites.count, gold: q.elites.gold },
      { id: 'boss', count: q.boss.killed ? 1 : 0, gold: q.boss.gold },
      { id: 'clear', count: clearGold > 0 ? 1 : 0, gold: clearGold },
      { id: 'seed', count: Math.max(0, seedOf(out) - seedOf(e.save)), gold: 0 },
    ];
    return { save: out, gained: e.gained + clearGold, seedGained, won, firstClear: clearGold > 0, items, run: r };
  }
  function earn(save, posts, eliteKills, bossKilled) {
    const q = earnParts(posts, eliteKills, bossKilled), gained = q.posts.gold + q.elites.gold + q.boss.gold;
    if (!gained) return { save, gained: 0 };
    return { save: { v: SAVE_V, best: save.best, cur: curOf(save), gold: save.gold + gained, up: upOf(save.up), seed: seedOf(save) }, gained };
  }
  // 진행만 1구역으로 되돌린다. 최고 기록·골드·강화는 그대로(이미 받은 구역의 골드는 다시 받지 않는다).
  function restart(save) { return { v: SAVE_V, best: save.best, cur: 0, gold: save.gold, up: upOf(save.up), seed: seedOf(save) }; }
  // 살 수 있는 강화: 'hp'(네크로맨서 체력), '종류.능력치'(예: 'armor.taken')
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function upKey(key) {
    if (key === 'hp') return { max: CFG.gold.hpMax, cost: CFG.gold.hpCost };
    if (key === 'seed') return { seed: true, max: CFG.gold.seedMax, cost: CFG.gold.seedCost };
    const [k, s] = String(key).split('.');
    return KINDS.includes(k) && own(CFG.statStep, s) && CFG.statKinds[k].includes(s) ? { k, s, max: CFG.gold.statMax, cost: CFG.gold.statCost } : null;
  }
  function upLevel(save, key) {
    const u = upKey(key), up = upOf(save.up);
    return !u ? 0 : u.seed ? seedOf(save) : u.k ? up.stat[u.k][u.s] : up.hp;
  }
  // Price of the next level. Tables are indexed by the owned level (a level past the table uses its last price); plain numbers are flat prices.
  const priceAt = (t, lv) => (Array.isArray(t) ? t[Math.min(lv, t.length - 1)] : t);
  function upCost(save, key) { const u = upKey(key); if (!u) return null; const lv = upLevel(save, key); return lv >= u.max ? null : priceAt(u.cost, lv); }
  // 강화 한 단계를 산다: 골드를 빼고 단계를 올리는 것을 함께. 못 사면 까닭을 돌려준다.
  function buy(save, key) {
    const cost = upCost(save, key);
    if (cost === null) return { ok: false, save, reason: 'max' };
    if (save.gold < cost) return { ok: false, save, reason: 'gold' };
    const u = upKey(key), up = upOf(save.up);
    if (u.seed) return { ok: true, save: { v: SAVE_V, best: save.best, cur: curOf(save), gold: save.gold - cost, up, seed: seedOf(save) + 1 } };
    if (u.k) up.stat[u.k][u.s]++; else up.hp++;
    return { ok: true, save: { v: SAVE_V, best: save.best, cur: curOf(save), gold: save.gold - cost, up, seed: seedOf(save) } };
  }
  // Spend the held mutation seed when a run starts. ok:false (same save object) when none is held.
  function useSeed(save) {
    const n = seedOf(save);
    if (n < 1) return { ok: false, save };
    return { ok: true, save: { v: SAVE_V, best: save.best, cur: curOf(save), gold: save.gold, up: upOf(save.up), seed: n - 1 } };
  }
  const Save = { fresh: freshSave, load: loadSave, clear: clearDistrict, earn, restart, cost: upCost, level: upLevel, buy, useSeed, settle, earnParts };

  const api = { W, H, DURATION, MAX_LEVEL, KINDS, CFG, newGame, step, stats, geneTotal, levelOf, isFrenzy, heartKeep, scaleGenes, detonate, pin, absorb, feedTarget, spawnBoss, nextBlast, spawnCurve, actOf, MUTS, chooseMut, Save, runSummary, POST_LAYOUTS, postSpotsFor, foeMixFor, BARRICADE_LAYOUTS, barricadesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChimeraSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
