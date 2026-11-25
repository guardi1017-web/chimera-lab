// 6차 규칙을 확인하고, 봇으로 90초 판을 돌려 예외·NaN이 없는지 본다.
const S = require('./src/sim.js');
const C = S.CFG;
const eq = (a, b, msg) => { if (a !== b) throw new Error(msg + ' (기대 ' + b + ', 실제 ' + a + ')'); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const approx = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) throw new Error(msg + ' (기대 ' + b + ', 실제 ' + a + ')'); };

// ---- 합친 결과물이 src와 같은지(node build.cjs): index.html에는 render3d.js·render.js, 2d.html에는 render.js ----
{
  const fs = require('fs'), path = require('path'), rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const idx = rd('index.html'), d2 = rd('2d.html'), r = rd('src/render.js'), r3 = rd('src/render3d.js').split('__ASSET_V__');
  ok(r3.length === 2 && idx.includes(r3[0]) && idx.includes(r3[1]), 'index.html이 src/render3d.js와 다르다(node build.cjs)');
  ok(idx.includes(r) && d2.includes(r), 'index.html·2d.html이 src/render.js와 다르다(node build.cjs)');
  ok(idx.includes('<canvas id="game3d"') && !d2.includes('game3d"'), '#game3d 캔버스는 3D 판(index.html)에만 있다');
  console.log('빌드 확인: index.html·2d.html이 src와 같다');
}

// ---- home screen (src/page.html): logo + clear stage, no veil/prose; rules moved to the controls panel; CTA label from save.cur + 1 ----
{
  const fs = require('fs'), path = require('path'), rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const page = rd('src/page.html'), rj = rd('src/render.js');
  const sec = id => { const i = page.indexOf('id="' + id + '"'); if (i < 0) return ''; return page.slice(page.lastIndexOf('<section', i), page.indexOf('</section>', i) + 10); };
  const home = sec('title'), help = sec('helpModal');
  ok(home.startsWith('<section class="home" id="title"'), '홈 화면(#title)은 덮개(.veil)가 아니라 .home이다');
  ok(home.includes('<h1 class="logo">키메라 실험실</h1>') && home.includes('id="homeStage"'), '홈 화면: 큰 로고와 투명 무대 영역');
  ok(!/class="goal"|class="how"|class="kinds"|봉쇄된 서울/.test(home), '홈 화면에 줄글·규칙·종류 이름표가 남았다');
  const iS = home.indexOf('id="startBtn" class="cta"'), iR = home.indexOf('class="iconRow"'), row = home.slice(iR), at = id => row.indexOf('id="' + id + '"');
  ok(iS > 0 && iR > iS, '주 버튼(.cta) 아래에 아이콘 줄');
  ok(at('shopBtn') >= 0 && at('shopBtn') < at('soundBtn') && at('soundBtn') < at('helpBtn'), '아이콘 줄: 강화·소리·조작법');
  const how = help.slice(help.indexOf('<ol class="how">'), help.indexOf('</ol>'));
  ok(help.startsWith('<section class="veil" id="helpModal"') && help.includes(' hidden>') && how.split('<li>').length - 1 === 5 && help.includes('class="goal"') && help.includes('id="helpClose"'), '조작법 패널(#helpModal)에 규칙 5줄·안내·닫기 버튼');
  const hc = page.indexOf('.home {');
  ok(hc > 0 && !page.slice(hc, page.indexOf('}', hc)).includes('var(--veil)'), '홈 화면 배경은 불투명 덮개 색이 아니다');
  ok(rj.includes("const ctaLabel = cur => (cur > 0 ? '이어하기 ' + (cur + 1) + '구역' : '시작');") && rj.includes('startBtn.textContent = ctaLabel(save.cur);'), '주 버튼 문구: save.cur + 1 기반 이어하기 N구역 / 시작');
  ok(rj.includes('window.ChimeraTitle = {') && rj.includes('function selectStarter(k, source)'), '첫 소환수 선택 훅');
  eq(S.Save.load(null, null).cur, 0, '저장이 없으면 cur 0(시작)');
  eq(S.Save.load(JSON.stringify({ v: 1, best: 4, gold: 0, up: { hp: 0 } }), null).cur + 1, 5, '옛 저장(best 4)은 이어하기 5구역');
  console.log('홈 화면 확인: 덮개·줄글 없음, 로고·투명 무대, 주 버튼 아래 강화·소리·조작법, 규칙 5줄은 조작법 패널, 문구는 save.cur + 1');
}

// ---- BGM (src/render.js makeMusic): Web Audio만, master 아래 bgm 버스, 소리 끔 = 음악 노드 0개, 홈/막/대장/포효/승패, 멈춤·숨김 뒤 제자리 재개 ----
{
  const fs = require('fs'), path = require('path');
  const rj = fs.readFileSync(path.join(__dirname, 'src/render.js'), 'utf8');
  const a = rj.indexOf('/*BGM>*/'), b = rj.indexOf('/*<BGM*/');
  ok(a > 0 && b > a, 'src/render.js에 BGM 블록(/*BGM>*/ ~ /*<BGM*/)이 없다');
  const body = rj.slice(a, b);
  ok(!/\.(mp3|ogg|wav|m4a)\b|fetch\(|XMLHttpRequest|decodeAudioData|https?:/.test(body), 'BGM이 외부 음원 파일이나 네트워크를 쓴다');
  ok(rj.includes('const Music = makeMusic(Sound, S);') && rj.includes('Music.event(ev);') && (rj.match(/Music\.update\(musicState\(\)\);/g) || []).length === 2, 'render.js가 BGM을 프레임·숨김·사건에 잇지 않았다');
  const makeMusic = new Function(body + ' return makeMusic;')();
  const made = { osc: 0, buf: 0, gain: 0, buffer: 0 }, freqs = [];
  const ac = { currentTime: 0, sampleRate: 100, destination: { dest: true }, edges: [] };
  const node = extra => { const n = Object.assign({ outs: [], at: null, stops: [], connect(d) { n.outs.push(d); ac.edges.push([n, d]); return d; }, start(t) { n.at = t; }, stop(t) { n.stops.push(t); } }, extra); return n; };
  const param = () => { const p = { value: 0, setValueAtTime(v) { p.value = v; }, exponentialRampToValueAtTime() {} }; return p; };
  ac.createOscillator = () => { made.osc++; const f = v => { freqs.push(v); }; return node({ src: 'osc', frequency: { value: 0, setValueAtTime: f, exponentialRampToValueAtTime: f } }); };
  ac.createBufferSource = () => { made.buf++; return node({ src: 'buf' }); };
  ac.createGain = () => { made.gain++; return node({ isGain: true, gain: param() }); };
  ac.createBuffer = (ch, n) => { made.buffer++; return { getChannelData: () => new Float32Array(n) }; };
  const master = { isGain: true, outs: [], gain: { value: 1 } };
  const Snd = { ac, master, bgm: null, muted: true };
  const Mu = makeMusic(Snd, S), D = () => Mu.debug();
  const total = () => made.osc + made.buf + made.gain + made.buffer;
  const run = (st, sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { ac.currentTime += 1 / 60; Mu.update(st); } };
  const play = (g, extra) => Object.assign({ mode: 'play', g, paused: false, hidden: false, victory: false }, extra || {});
  const voices = (st, sec) => { const c0 = D().count; run(st, sec); const c1 = D().count, out = {}; for (const k in c1) if (c1[k] - (c0[k] || 0) > 0) out[k] = c1[k] - (c0[k] || 0); return out; };

  // 1) 소리 끔: 제목·막·대장·포효·승리 어디서도 음악용 노드(오실레이터·버퍼소스·게인·버퍼)가 하나도 생기지 않는다. 상태만 따라간다
  const gm = S.newGame(31, { district: 1 });
  run({ mode: 'title', g: gm }, 2); eq(D().theme, 'home', '끈 채 제목 화면 테마');
  run(play(gm), 2); eq(D().theme, 'act', '끈 채 1막 테마');
  Mu.event('alarm'); gm.postsDown = 2; run(play(gm), 1); eq(D().layers, 3, '끈 채 3막 레이어 상태');
  Mu.event('boss'); S.spawnBoss(gm); Mu.event('roar'); gm.boss.roars = 1; run(play(gm), 2);
  ok(D().theme === 'boss' && D().intensity === 1, '끈 채 대장전·포효 상태: ' + JSON.stringify(D()));
  Mu.event('win'); run(play(gm, { victory: true }), 2); eq(D().theme, 'win', '끈 채 승리 테마');
  eq(total(), 0, '소리를 끈 동안 음악 노드가 생겼다'); ok(Snd.bgm === null && ac.edges.length === 0 && D().nodes === 0, '소리를 끈 동안 bgm 버스나 연결이 생겼다');
  Snd.muted = false; run(play(gm, { victory: true }), 1);
  eq(total(), 0, '끈 채 끝난 판의 승리 음이 켠 뒤에 늦게 울렸다');

  // 2) 켬: 제목 화면 밤거리 테마. bgm 버스는 master 아래 하나, 효과음(master 직결)보다 낮다, destination에 바로 잇지 않는다
  const g1 = S.newGame(32, { district: 1 });
  run({ mode: 'title', g: g1 }, 3);
  const hv = D();
  ok(hv.theme === 'home' && hv.playing && hv.nodes > 0 && hv.count.pad > 0 && hv.count.bell > 0 && !hv.count.kick, '제목 화면 테마: ' + JSON.stringify(hv.count));
  ok(Snd.bgm && Snd.bgm.isGain && Snd.bgm.outs.length === 1 && Snd.bgm.outs[0] === master, 'bgm 버스는 master 아래 GainNode 하나여야 한다');
  ok(Snd.bgm.gain.value > 0 && Snd.bgm.gain.value <= 0.5, 'bgm 버스 게인은 효과음(1)보다 낮아야 한다: ' + Snd.bgm.gain.value);
  ok(!ac.edges.some(e => e[1] === ac.destination), '음악이 destination에 바로 이어졌다');
  ok(ac.edges.filter(e => e[0].src).every(e => e[0].outs[0].outs[0] === Snd.bgm), '모든 음악 소리는 bgm 버스를 지나야 한다');

  // 3) 1막 북+베이스 → 초소마다 레이어 추가(S.actOf와 같다), 경보에 크래시
  const v1 = voices(play(g1), 3);
  ok(D().theme === 'act' && D().layers === 1 && S.actOf(g1) === 1, '1막 상태: ' + JSON.stringify(D()));
  ok(v1.kick && v1.snare && v1.bass && !v1.arp && !v1.lead, '1막은 북+베이스만: ' + JSON.stringify(v1));
  g1.postsDown = 1; Mu.event('alarm');
  const v2 = voices(play(g1), 3);
  ok(D().layers === 2 && S.actOf(g1) === 2 && v2.arp && v2.hat && v2.crash && v2.bass && !v2.lead, '2막: 아르페지오·하이햇 추가, 경보 크래시: ' + JSON.stringify(v2));
  g1.postsDown = 2;
  const v3 = voices(play(g1), 4);
  ok(D().layers === 3 && S.actOf(g1) === 3 && v3.lead && v3.arp && v3.kick && v3.bass, '3막: 리드 추가: ' + JSON.stringify(v3));

  // 4) 대장 등장 → 대장전, 포효마다 빨라지고 강해진다
  const boss = S.spawnBoss(g1);
  const vb = voices(play(g1), 3), b0 = D().bpm;
  ok(D().theme === 'boss' && D().intensity === 0 && vb.bass && vb.kick && vb.stab && !vb.lead, '대장전 음악: ' + JSON.stringify(vb));
  Mu.event('roar'); boss.roars = 1;
  const vr = voices(play(g1), 3), b1 = D().bpm;
  ok(D().intensity === 1 && b1 > b0 && vr.lead, '포효 1: 강도 1, 템포 상승, 리드: ' + b0 + ' -> ' + b1);
  Mu.event('roar'); boss.roars = 2; run(play(g1), 2);
  ok(D().intensity === 2 && D().bpm > b1, '포효 2: 강도 2, 템포 더 상승: ' + D().bpm);

  // 5) 일시정지·숨김: 바로 멈추고(예약 소리 끊음) 그동안 노드 0개, 아직 울리지 않은 예약 박은 되돌려 돌아오면 그 박부터 잇는다
  for (const k of ['paused', 'hidden']) {
    const s0 = D().step, p0 = D().played, ahead = D().booked;
    ok(ahead >= 1, k + ': lookahead 예약이 없다');
    Mu.update(play(g1, { [k]: true }));
    const n0 = total(), s1 = D().step, p1 = D().played;
    ok(!D().playing && D().live === 0 && D().booked === 0, k + ': 음악이 멈추지 않았다');
    ok(p1 === p0 - ahead && s1 === (s0 - ahead + 32) % 32, k + ': 울리지 않은 예약 박이 소진된 채 남았다: ' + s0 + ' -> ' + s1);
    run(play(g1, { [k]: true }), 3);
    ok(total() === n0 && D().step === s1 && D().played === p1, k + ': 멈춘 동안 음악이 예약됐다');
    Mu.update(play(g1));
    const k1 = D().played - p1;
    ok(D().playing && D().theme === 'boss' && k1 >= 1 && D().step === (s1 + k1) % 32, k + ': 제자리에서 다시 잇지 않았다: ' + s1 + ' / ' + D().step);
  }

  // 6) 판 중에 소리를 끄면 바로 끊기고 새 노드가 없다
  Snd.muted = true; Mu.update(play(g1));
  const nm = total();
  ok(!D().playing && D().live === 0, '판 중에 끄면 음악이 멈춰야 한다');
  run(play(g1), 2); eq(total(), nm, '판 중에 끈 뒤 음악 노드가 생겼다');
  Snd.muted = false;

  // 7) 승리: 마무리 음 한 번, 그 뒤(결과 화면 포함) 조용. 홈으로 가면 홈 테마
  g1.over = 'win'; Mu.event('win');
  const vw = voices(play(g1, { victory: true }), 0.5);
  ok(D().theme === 'win' && vw.win > 0 && !vw.bass && !vw.kick, '승리 음: ' + JSON.stringify(vw));
  const nw = total(); run(play(g1, { victory: true }), 3); run({ mode: 'over', g: g1 }, 2);
  ok(total() === nw && D().theme === 'win', '승리 음 뒤에는 조용해야 한다');
  const vh = voices({ mode: 'title', g: g1 }, 3);
  ok(D().theme === 'home' && vh.pad > 0, '홈으로 돌아가면 홈 테마');

  // 8) 새 판은 1막·강도 0부터, 패배는 마무리 음 한 번 뒤 조용
  const g2 = S.newGame(33, { district: 1 });
  run(play(g2), 1);
  ok(D().theme === 'act' && D().intensity === 0 && D().layers === 1, '새 판은 1막·강도 0부터: ' + JSON.stringify(D()));
  g2.over = 'lose'; Mu.event('lose');
  const vl = voices(play(g2), 0.5);
  ok(D().theme === 'lose' && vl.lose > 0 && !vl.kick, '패배 음: ' + JSON.stringify(vl));
  const nl = total(); run(play(g2), 3); run({ mode: 'over', g: g2 }, 2);
  eq(total(), nl, '패배 음 뒤에는 조용해야 한다');

  // 9) 폰 스피커: 음악의 모든 음높이(베이스·북 포함)가 200Hz 이상
  const fmin = freqs.reduce((m, v) => Math.min(m, v), Infinity);
  ok(freqs.length > 0 && fmin >= 200, '음악 음높이가 200Hz 아래로 내려갔다: ' + fmin);
  console.log('BGM 확인: 소리 끔 = 음악 노드 0개, bgm 버스(게인 ' + Snd.bgm.gain.value + ') master 아래, 홈 → 1막(북+베이스) → 2·3막 레이어, 대장전 템포 ' + b0 + ' → ' + b1 + ' → ' + D().bpm + '(포효), 승리·패배 음 뒤 조용, 멈춤·숨김 제자리 재개, 최저음 ' + fmin.toFixed(1) + 'Hz');
}

// ---- BGM 예약 시각: 모의 노드가 start(t)/stop(t)를 적는다. Sound.ac === null인 홈에서 첫 입력·소리 켜기로 시작, 멈춤·숨김 뒤 울리지 않은 박 보존, 끊긴 승패 음 복구 ----
{
  const fs = require('fs'), path = require('path');
  const rj = fs.readFileSync(path.join(__dirname, 'src/render.js'), 'utf8');
  const block = (a, b) => { const i = rj.indexOf(a), j = rj.indexOf(b); ok(i > 0 && j > i, 'src/render.js에 ' + a + ' 블록이 없다'); return rj.slice(i, j); };
  const makeMusic = new Function(block('/*BGM>*/', '/*<BGM*/') + ' return makeMusic;')();
  const sndSrc = block('/*SND>*/', '/*<SND*/');
  ok(rj.includes("soundBtn.addEventListener('click', () => { Sound.toggle(); refreshSound(); Music.wake(musicState()); });"), '홈 소리 버튼이 Music.wake(Sound.on)에 이어지지 않았다');
  ok(rj.includes("for (const type of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(type, () => { Music.wake(musicState()); }, true);"), '첫 사용자 입력이 Music.wake에 이어지지 않았다');
  const SK = 'chimera-lab-sound-v1';
  const play = (g, extra) => Object.assign({ mode: 'play', g, paused: false, hidden: false, victory: false }, extra || {});
  const home = { mode: 'title', g: null, paused: false, hidden: false, victory: false };
  // 실제 render.js의 Sound 객체 + 가짜 AudioContext(처음엔 suspended, 모든 노드의 start/stop 시각 기록)
  function rig(store) {
    const nodes = [], made = [];
    function FakeAC() {
      const ac = this;
      ac.currentTime = 0; ac.sampleRate = 100; ac.state = 'suspended'; ac.destination = { dest: true };
      const node = extra => { const n = Object.assign({ outs: [], at: null, stops: [], connect(d) { n.outs.push(d); return d; }, start(t) { n.at = t === undefined ? ac.currentTime : t; }, stop(t) { n.stops.push(t === undefined ? ac.currentTime : t); } }, extra); return n; };
      const param = () => { const p = { value: 0, setValueAtTime(v) { p.value = v; }, exponentialRampToValueAtTime() {} }; return p; };
      ac.resume = () => { ac.state = 'running'; return Promise.resolve(); };
      ac.createGain = () => node({ isGain: true, gain: param() });
      ac.createOscillator = () => { const n = node({ src: 'osc', type: 'sine', f: null }); n.frequency = { value: 0, setValueAtTime(v) { if (n.f === null) n.f = v; }, exponentialRampToValueAtTime() {} }; nodes.push(n); return n; };
      ac.createBufferSource = () => { const n = node({ src: 'buf' }); nodes.push(n); return n; };
      ac.createBuffer = (ch, n) => ({ getChannelData: () => new Float32Array(n) });
      made.push(ac);
    }
    const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const Sound = new Function('window', 'localStorage', sndSrc + ' return Sound;')({ AudioContext: FakeAC }, ls);
    Sound.load();
    const Mu = makeMusic(Sound, S);
    const tick = (st, sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { if (Sound.ac && Sound.ac.state === 'running') Sound.ac.currentTime += 1 / 60; Mu.update(st); } };
    return { Sound, Mu, made, nodes, tick, D: () => Mu.debug() };
  }
  const lastStop = n => n.stops[n.stops.length - 1];
  const sounded = n => n.at !== null && n.at < lastStop(n);

  // (a) 최초 홈(Sound.ac === null): 틱만으로는 아무것도 없고, 첫 입력(wake)이 Sound.on으로 AudioContext를 만들어 재개하고 홈 테마를 바로 시작한다
  {
    const R = rig({});
    R.tick(home, 1);
    ok(R.Sound.ac === null && R.made.length === 0 && R.nodes.length === 0 && R.D().theme === 'home' && !R.D().playing, '최초 홈 상태: ' + JSON.stringify(R.D()));
    ok(R.Mu.wake(home) === true && R.made.length === 1 && R.Sound.ac === R.made[0] && R.Sound.ac.state === 'running' && R.Sound.master, '첫 입력이 AudioContext를 만들고 재개하지 않았다');
    const n1 = R.nodes.length, c1 = R.D().count;
    ok(n1 > 0 && R.D().playing && c1.pad > 0 && c1.bass > 0 && R.nodes.every(n => n.at >= 0.05 - 1e-9), '첫 입력 즉시 홈 테마가 시작되지 않았다: ' + JSON.stringify(c1));
    R.tick(home, 4);
    ok(R.nodes.length > n1 && R.D().count.bell > 0 && R.nodes.filter(sounded).length > 0, '홈 테마가 이어지지 않았다');
    R.Mu.wake(home); R.Mu.wake(home); eq(R.made.length, 1, '다음 입력이 AudioContext를 또 만들었다');
    R.Sound.toggle(); R.Mu.wake(home);
    const tOff = R.Sound.ac.currentTime, nOff = R.nodes.length;
    ok(R.Sound.muted && !R.D().playing && R.D().live === 0 && R.Sound.master.gain.value === 0 && R.nodes.every(n => lastStop(n) <= tOff + 1e-9), '홈에서 끄면 바로 멈춰야 한다');
    R.tick(home, 2); R.Mu.wake(home); eq(R.nodes.length, nOff, '홈에서 끈 동안 음악 노드가 생겼다');
    R.Sound.toggle(); R.Mu.wake(home); R.tick(home, 4);
    ok(!R.Sound.muted && R.D().playing && R.Sound.master.gain.value === 1 && R.nodes.length > nOff && R.nodes.slice(nOff).every(n => n.at > tOff), '홈에서 다시 켜면 홈 테마가 다시 시작돼야 한다');
  }

  // (b) 음소거 저장: 홈 진입·입력·틱 동안 AudioContext도 음악 노드도 없다. 판 시작(Sound.on)으로 컨텍스트가 생겨도 음악 노드 0개. 소리 켜기 → 바로 홈 테마
  {
    const store = { [SK]: '1' }, R = rig(store);
    ok(R.Sound.muted, '저장된 음소거를 읽지 않았다');
    R.tick(home, 1); for (let i = 0; i < 5; i++) R.Mu.wake(home); R.tick(home, 1);
    ok(R.Sound.ac === null && R.made.length === 0 && R.nodes.length === 0, '음소거 홈에서 입력에 오디오가 생겼다');
    R.Sound.toggle();
    ok(R.Mu.wake(home) === true && store[SK] === '0' && R.made.length === 1 && R.D().playing && R.D().count.pad > 0, '음소거 홈에서 소리를 켜면 홈 테마가 바로 시작돼야 한다');
    const M2 = rig({ [SK]: '1' }), g = S.newGame(36, { district: 1 });
    M2.Sound.on(); M2.tick(play(g), 2); M2.Mu.wake(play(g)); S.spawnBoss(g); M2.tick(play(g), 1);
    ok(M2.made.length === 1 && M2.Sound.master.gain.value === 0 && M2.nodes.length === 0 && M2.D().nodes === 0, '음소거 판에서 음악 노드가 생겼다');
  }

  // (c) lookahead 예약 뒤 몇 박이 울리기 전에 멈춤·숨김 → 그 박은 취소되지만 되돌려져, 재개하면 멈추지 않은 판과 같은 박 순서로 잇는다(건너뜀 없음)
  {
    const riff = R => R.nodes.filter(n => n.src === 'osc' && n.type === 'sawtooth' && sounded(n)).sort((a, b) => a.at - b.at).map(n => Math.round(n.f));
    const mk = () => { const R = rig({}), g = S.newGame(41, { district: 1 }); R.Mu.wake(home); S.spawnBoss(g); return { R, g, st: play(g) }; };
    const A = mk(); A.R.tick(A.st, 3.5);
    const ref = riff(A.R);
    for (const k of ['paused', 'hidden']) {
      const B = mk(); B.R.tick(B.st, 1);
      const tP = B.R.Sound.ac.currentTime, d0 = B.R.D(), ahead = B.R.nodes.filter(n => n.at >= tP);
      ok(d0.theme === 'boss' && d0.booked >= 2 && ahead.length > 0, k + ': lookahead 예약이 없다: ' + JSON.stringify(d0));
      B.R.Mu.update(play(B.g, { [k]: true }));
      ok(ahead.every(n => lastStop(n) <= n.at), k + ': 아직 울리지 않은 예약 음이 취소되지 않았다');
      ok(B.R.D().played === d0.played - d0.booked && B.R.D().step === (d0.step - d0.booked + 32) % 32 && B.R.D().booked === 0, k + ': 울리지 않은 박이 소진된 채 남았다: ' + d0.step + ' -> ' + B.R.D().step);
      const before = riff(B.R), nP = B.R.nodes.length;
      ok(before.length > 0 && before.every((f, i) => f === ref[i]), k + ': 멈추기 전 박 순서가 다르다');
      B.R.tick(play(B.g, { [k]: true }), 0.7); eq(B.R.nodes.length, nP, k + ': 멈춘 동안 음악 노드가 생겼다');
      B.R.tick(B.st, 1.8);
      const got = riff(B.R);
      ok(got.length >= before.length + 10 && got.length <= ref.length && got.every((f, i) => f === ref[i]), k + ': 재개 뒤 울리지 않은 박을 건너뛰었다: ' + got.join(',') + ' / ' + ref.slice(0, got.length).join(','));
    }
  }

  // (d) 승리·패배 마무리 음이 끝나기 전에 숨김·멈춤 → M.stung에 막히지 않고 재개 때 마무리 음 전체가 다시 울린다. 다 울린 뒤에는 다시 울리지 않는다
  for (const [k, end] of [['hidden', 'win'], ['hidden', 'lose'], ['paused', 'win']]) {
    const R = rig({}), g = S.newGame(51, { district: 1 }), tag = k + '/' + end;
    R.Mu.wake(home); R.tick(play(g), 0.5);
    g.over = end; R.Mu.event(end);
    const st = play(g, { victory: end === 'win' }), off = Object.assign({}, st, { [k]: true }), i0 = R.nodes.length;
    R.tick(st, 0.2);
    const first = R.nodes.slice(i0), tH = R.Sound.ac.currentTime;
    ok(R.D().theme === end && R.D().stung && first.some(n => n.at < tH) && first.some(n => n.at >= tH), tag + ': 마무리 음이 반쯤 울린 상태가 아니다');
    R.Mu.update(off);
    ok(!R.D().stung && !R.D().playing && first.every(n => lastStop(n) <= Math.max(tH, n.at) + 1e-9), tag + ': 끊긴 마무리 음이 M.stung에 막혔다');
    R.tick(off, 1); eq(R.nodes.length, i0 + first.length, tag + ': 숨긴 동안 음악 노드가 생겼다');
    const i1 = R.nodes.length; R.tick(st, 3);
    const again = R.nodes.slice(i1), dur = end === 'win' ? 1.2 : 1.6;
    const tri = again.filter(n => n.type === 'triangle').sort((a, b) => a.at - b.at), lastTri = tri[tri.length - 1];
    ok(again.length === first.length && again.every(n => n.stops.length === 1 && sounded(n)) && lastTri && lastStop(lastTri) - lastTri.at >= dur && R.D().stung, tag + ': 재개 때 마무리 음이 끝까지 다시 울리지 않았다');
    R.tick(off, 0.5); R.tick(st, 2); R.tick({ mode: 'over', g }, 1);
    eq(R.nodes.length, i1 + again.length, tag + ': 다 울린 마무리 음이 다시 울렸다');
  }
  // 끈 채 끊긴 마무리 음은 다시 켜도 늦게 울리지 않는다(기존 규칙 유지)
  {
    const R = rig({}), g = S.newGame(52, { district: 1 });
    R.Mu.wake(home); R.tick(play(g), 0.5); g.over = 'win'; R.Mu.event('win');
    const st = play(g, { victory: true }); R.tick(st, 0.2);
    R.Sound.toggle(); R.Mu.wake(st); const nM = R.nodes.length; R.tick(st, 1);
    R.Sound.toggle(); R.Mu.wake(st); R.tick(st, 3);
    eq(R.nodes.length, nM, '끈 채 끊긴 마무리 음이 켠 뒤에 늦게 울렸다');
  }
  console.log('BGM 예약 시각 확인: 최초 홈(Sound.ac null) 첫 입력·소리 켜기로 홈 테마 즉시, 음소거 노드 0개, 멈춤·숨김 뒤 울리지 않은 박 보존(박 순서 동일), 끊긴 승패 음 재개·중복 없음');
}

// ---- title stage (stage 2): 3D street stage from the existing GLBs, 2D art stage from the existing PNGs, controls panel focus trap ----
{
  const fs = require('fs'), path = require('path'), rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const r3 = rd('src/render3d.js'), rj = rd('src/render.js'), idx = rd('index.html'), d2 = rd('2d.html');
  for (const f of ['assets/necromancer.glb', 'assets/chimera-beast.glb', 'assets/chimera-armor.glb', 'assets/chimera-ranger.glb', 'art/necromancer.png', 'art/chimera-beast.png', 'art/chimera-armor.png', 'art/chimera-ranger.png'])
    ok(fs.existsSync(path.join(__dirname, f)), '타이틀 무대가 쓰는 기존 에셋이 없다: ' + f);
  ok(r3.includes("newLoader().load('assets/necromancer.glb?v=' + ASSET_V") && r3.includes("'assets/chimera-' + kind + '.glb?v=' + ASSET_V"), '3D 타이틀 무대는 기존 GLB 4개를 쓴다');
  ok(r3.includes('function renderTitle(now, opts)') && r3.includes('if (opts && opts.title) { renderTitle(now, opts); return; }') && r3.includes('if (stage) disposeTitle();'), 'V.render: title이면 타이틀 무대, 아니면 무대를 정리하고 전투');
  ok(r3.includes('const m = makeBodyModel(s.kind);') && r3.includes('cloneSkinned(hero.src.scene)'), '3D 타이틀 무대는 makeBodyModel과 주인공 모델을 다시 쓴다');
  ok(r3.includes('new THREE.Raycaster()') && r3.includes('pickTitle(px, py) {') && r3.includes('view._title = () =>'), '3D 타이틀 무대 탭 판정(Raycaster + 화면 폴백)과 확인 장치');
  for (const k of ['necromancer', 'chimera-beast', 'chimera-armor', 'chimera-ranger']) ok(rj.includes("'art/" + k + ".png'"), '2D 타이틀 무대가 원화 art/' + k + '.png를 쓰지 않는다');
  ok(rj.includes('function drawTitleStage2D(now)') && rj.includes("if (mode === 'title') drawTitleStage2D(now); else drawWorld2D(now);") && rj.includes("selectStarter(k, 'stage')") && rj.includes('V.pickTitle(px, py)'), '2D 타이틀 무대·무대 탭 선택·3D 탭 연결');
  ok(rj.includes('titleEl.inert = !!open;') && rj.includes('function trapHelpFocus(e)') && rj.includes("else if (e.key === 'Tab') trapHelpFocus(e);"), '조작법 패널: 배경 홈 inert와 Tab 가두기');
  ok(idx.includes('function renderTitle(now, opts)') && idx.includes('function drawTitleStage2D(now)') && d2.includes('function drawTitleStage2D(now)') && !d2.includes('function renderTitle('), '빌드 결과물에 타이틀 무대가 들어 있다(2d.html에는 3D 무대 없음)');
  console.log('타이틀 무대 확인: 기존 GLB 4개·원화 4장, V.render title 분기와 정리, Raycaster 탭, 2D 원화 무대, 조작법 inert·Tab 가두기');
}

// ---- 로컬 Three.js 0.170.0 벤더 파일(python src/vendor/sync_three.py → src/vendor/three) ----
{
  const fs = require('fs'), path = require('path'), cp = require('child_process');
  const dir = path.join(__dirname, 'src', 'vendor', 'three'), inside = path.resolve(dir) + path.sep;
  const rdv = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const MAIN = { 'three.module.min.js': 'WebGLRenderer', 'GLTFLoader.js': 'GLTFLoader', 'SkeletonUtils.js': 'clone', 'meshopt_decoder.module.js': 'MeshoptDecoder' };
  for (const f of Object.keys(MAIN).concat('LICENSE')) {
    const p = path.join(dir, f);
    ok(fs.existsSync(p) && fs.statSync(p).isFile(), '벤더 파일이 없다: src/vendor/three/' + f + ' (python src/vendor/sync_three.py)');
    const s = rdv(f);
    ok(s.trim().length > 0, '벤더 파일이 비었다: ' + f);
    ok(!/^\s*</.test(s) && !/<!doctype\s+html|<html[\s>]/i.test(s.slice(0, 4096)), '벤더 파일이 HTML 오류 페이지다: ' + f);
  }
  for (const [f, sym] of Object.entries(MAIN)) {
    const s = rdv(f);
    ok(new RegExp('\\b' + sym + '\\b').test(s) && new RegExp('\\bexport\\b[^;]*\\b' + sym + '\\b').test(s), f + ': 핵심 심볼 ' + sym + '을(를) 내보내지 않는다');
  }
  ok(/["']170["']/.test(rdv('three.module.min.js')), 'three.module.min.js가 0.170.0(REVISION 170)이 아니다');
  ok(!fs.existsSync(path.join(dir, 'three.core.min.js')), 'three@0.170.0에는 three.core.min.js가 없어야 한다');

  // Node의 ESM 파서로 구문만 검사한다(bare specifier 'three'는 풀지 않는다)
  const esmCheck = src => cp.spawnSync(process.execPath, ['--input-type=module', '--check'], { input: src, encoding: 'utf8', maxBuffer: 64 << 20 });
  const chk = r => !r.error && r.status === 0;
  ok(chk(esmCheck("import * as T from 'three';\nexport const v = T;\n")), 'ESM 구문 검사기: 올바른 모듈을 통과시키지 못한다');
  ok(!chk(esmCheck('export {')) && !chk(esmCheck('return 1;')), 'ESM 구문 검사기: 잘못된 모듈 구문을 잡지 못한다');

  // 주석이 아닌 import / export ... from 문의 specifier
  const SPEC = /(?:^|[;}\n])\s*(?:import\b\s*(?:[\w$*{},\s]*?from\s*)?|export\b[\w$*{},\s]*?from\s*)(['"])([^'"\n]+)\1/gm;
  const specsOf = src => Array.from(src.matchAll(SPEC), m => m[2]);
  const sample = "// import a from 'https://x.test/a.js'\n/**\n * import { b } from 'https://cdn.jsdelivr.net/npm/b.js';\n */\nimport {\n\tA,\n\tB\n} from 'three';\nimport './side.js';\nexport { c } from \"../c.js\";\nconst s = 'see https://unpkg.com';\nexport { A };\n";
  eq(JSON.stringify(specsOf(sample)), JSON.stringify(['three', './side.js', '../c.js']), 'import 추출: 주석은 빼고 실제 문만 읽는다');
  ok(specsOf(rdv('GLTFLoader.js')).includes('three') && specsOf(rdv('SkeletonUtils.js')).includes('three'), 'GLTFLoader.js·SkeletonUtils.js에서 three 임포트를 찾지 못했다');
  const URLISH = /^[a-z][a-z0-9+.-]*:|^\/\/|cdn\.jsdelivr\.net|unpkg\.com|\/npm\//i;
  const seen = new Set(), queue = Object.keys(MAIN);
  while (queue.length) {
    const f = queue.shift(); if (seen.has(f)) continue; seen.add(f);
    const src = rdv(f), r = esmCheck(src);
    ok(chk(r), f + ': ES 모듈 구문 오류\n' + ((r.error && r.error.message) || r.stderr || ''));
    for (const spec of specsOf(src)) {
      ok(!URLISH.test(spec), f + ': import/export에 외부 URL이 있다: ' + spec);
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const abs = path.resolve(path.dirname(path.join(dir, f)), spec);
        ok(abs.startsWith(inside) && fs.existsSync(abs) && fs.statSync(abs).isFile(), f + ': 상대 임포트가 src/vendor/three 안의 파일이 아니다: ' + spec);
        queue.push(path.relative(dir, abs));
      } else ok(spec === 'three', f + ": bare specifier는 'three'만 쓴다: " + spec);
    }
  }

  const lic = rdv('LICENSE');
  ok(/MIT License/.test(lic) && /three\.js authors/i.test(lic) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(lic), 'LICENSE: Three.js MIT 라이선스 전문이 없다');
  ok((lic.match(/Permission is hereby granted, free of charge/g) || []).length >= 2, 'LICENSE: Three.js와 meshoptimizer의 MIT 허가 문구가 둘 다 있어야 한다');
  ok(/meshoptimizer/i.test(lic) && /meshopt_decoder/.test(lic) && /Copyright \(c\)[^\n]*Arseny Kapoulkine/i.test(lic), 'LICENSE: meshoptimizer(meshopt_decoder) MIT 저작권 고지가 없다');
  console.log('벤더 확인: three@0.170.0 로컬 파일 ' + seen.size + '개(ES 모듈·상대 임포트·외부 URL 없음)와 MIT 라이선스');
}

// ---- 외부 CDN 없이 로컬 벤더만: importmap과 src/render3d.js의 import가 src/vendor/three의 실제 파일로 풀린다 ----
{
  const fs = require('fs'), path = require('path'), rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const vdir = path.resolve(__dirname, 'src', 'vendor', 'three') + path.sep;
  const isFile = p => fs.existsSync(p) && fs.statSync(p).isFile();
  const CDN = /cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs\.cloudflare\.com|cdn\.skypack\.dev|jspm\.io|fonts\.googleapis\.com|fonts\.gstatic\.com/i, URL = /^[a-z][a-z0-9+.-]*:|^\/\//i;
  ok(CDN.test('https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700') && CDN.test('https://fonts.gstatic.com/s/gowunbatang/v1/x.woff2'), 'CDN 정규식: Google Fonts 주소를 잡지 못한다');
  const idx = rd('index.html'), bsrc = rd('build.cjs'), r3 = rd('src/render3d.js');
  for (const [f, s] of [['build.cjs', bsrc], ['src/render3d.js', r3], ['index.html', idx], ['2d.html', rd('2d.html')], ['src/page.html', rd('src/page.html')]]) ok(!CDN.test(s), f + ': 외부 CDN 주소가 남아 있다');
  ok(!/https?:\/\//i.test(bsrc) && !/https?:\/\//i.test(r3), 'build.cjs·src/render3d.js에 외부 http(s) 주소가 있다');

  // importmap: 하나, JSON, "three" → 로컬 파일, 모든 대상이 src/vendor/three 안의 실제 파일
  const maps = Array.from(idx.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g), m => m[1]);
  eq(maps.length, 1, 'index.html의 importmap은 하나');
  let map; try { map = JSON.parse(maps[0]); } catch (e) { throw new Error('index.html의 importmap이 JSON이 아니다: ' + e.message); }
  ok(map && map.imports && typeof map.imports === 'object' && !Array.isArray(map.imports) && Object.keys(map).every(k => k === 'imports'), 'importmap은 imports 객체만 가진다');
  eq(map.imports.three, './src/vendor/three/three.module.min.js', 'importmap의 three');
  for (const [k, v] of Object.entries(map.imports)) {
    ok(typeof v === 'string' && !URL.test(v) && !CDN.test(v) && v.startsWith('./'), 'importmap ' + k + ': 로컬 상대 경로가 아니다: ' + v);
    const abs = path.resolve(__dirname, v);
    if (k.endsWith('/')) ok(v.endsWith('/') && (abs + path.sep).startsWith(vdir) && fs.existsSync(abs) && fs.statSync(abs).isDirectory(), 'importmap ' + k + ': src/vendor/three 안의 폴더가 아니다: ' + v);
    else ok(abs.startsWith(vdir) && isFile(abs), 'importmap ' + k + ': src/vendor/three 안의 실제 파일이 아니다: ' + v);
  }
  // index.html의 importmap은 build.cjs의 IMPORTMAP 그대로이고 모듈보다 먼저 온다
  const im = /const IMPORTMAP = ('(?:[^'\\\n]|\\.)*');/.exec(bsrc);
  ok(im, 'build.cjs에서 IMPORTMAP을 찾지 못했다');
  const IM = new Function('return ' + im[1])();
  ok(idx.includes(IM + '<script type="module">\n'), 'index.html의 importmap이 build.cjs와 다르다(node build.cjs)');

  // src/render3d.js의 import 지정자 → importmap(정확히/접두) 또는 index.html(저장소 루트) 기준 상대 경로 → 실제 벤더 파일
  const SPEC = /(?:^|[;}\n])\s*(?:import\b\s*(?:[\w$*{},\s]*?from\s*)?|export\b[\w$*{},\s]*?from\s*)(['"])([^'"\n]+)\1/gm;
  const specsOf = src => Array.from(src.matchAll(SPEC), m => m[2]);
  const resolveSpec = spec => {
    if (URL.test(spec)) return null;
    if (spec.startsWith('./') || spec.startsWith('../')) return path.resolve(__dirname, spec);
    if (Object.prototype.hasOwnProperty.call(map.imports, spec)) return path.resolve(__dirname, map.imports[spec]);
    let best = null;
    for (const k of Object.keys(map.imports)) if (k.endsWith('/') && spec.startsWith(k) && (!best || k.length > best.length)) best = k;
    return best ? path.resolve(__dirname, map.imports[best] + spec.slice(best.length)) : null;
  };
  ok(resolveSpec('https://cdn.jsdelivr.net/npm/three/x.js') === null && resolveSpec('three/addons/loaders/GLTFLoader.js') === null && resolveSpec('nope') === null, 'import 해석기: 외부 URL·모르는 지정자를 풀면 안 된다');
  const specs = specsOf(r3), got = new Set();
  ok(specs.length >= 4, 'src/render3d.js에서 import를 찾지 못했다: ' + JSON.stringify(specs));
  for (const spec of specs) {
    ok(!URL.test(spec) && !CDN.test(spec), 'src/render3d.js: import에 외부 URL이 있다: ' + spec);
    const abs = resolveSpec(spec);
    ok(abs && abs.startsWith(vdir) && isFile(abs), 'src/render3d.js: import가 src/vendor/three의 실제 파일로 풀리지 않는다: ' + spec);
    got.add(path.basename(abs));
  }
  for (const f of ['three.module.min.js', 'GLTFLoader.js', 'SkeletonUtils.js', 'meshopt_decoder.module.js']) ok(got.has(f), 'src/render3d.js가 ' + f + '을(를) 쓰지 않는다');
  // index.html에 인라인된 3D 모듈의 import가 src/render3d.js와 같고, 어느 모듈에도 외부 URL import가 없다
  const mods = Array.from(idx.matchAll(/<script type="module">\n([\s\S]*?)\n<\/script>/g), m => m[1]);
  ok(mods.length >= 1, 'index.html에 모듈 스크립트가 없다');
  eq(JSON.stringify(specsOf(mods[0])), JSON.stringify(specs), 'index.html 3D 모듈의 import가 src/render3d.js와 다르다(node build.cjs)');
  for (const m of mods) for (const spec of specsOf(m)) ok(!URL.test(spec) && resolveSpec(spec), 'index.html 모듈 import가 로컬로 풀리지 않는다: ' + spec);
  console.log('로컬 벤더 확인: CDN 없음, importmap three → ' + map.imports.three + ', src/render3d.js import ' + specs.length + '개 모두 src/vendor/three로 풀림');
}

// ---- 로컬 글꼴(python src/vendor/sync_fonts.py → src/vendor/fonts, 네트워크 없이 확인) ----
{
  const fs = require('fs'), path = require('path'), rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const FONTS = { 'GowunBatang-Bold.subset.woff2': ['Gowun Batang', '700'], 'GowunDodum-Regular.subset.woff2': ['Gowun Dodum', '400'] };
  const want = JSON.stringify(Object.keys(FONTS).map(f => './src/vendor/fonts/' + f).sort());
  const faces = s => Array.from(s.matchAll(/@font-face\s*\{([^}]*)\}/g), m => m[1]);
  const urlsOf = s => faces(s).flatMap(b => Array.from(b.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g), m => m[2]));
  const page = rd('src/page.html'), pf = faces(page);
  eq(pf.length, 2, 'src/page.html의 @font-face 수');
  eq(JSON.stringify(urlsOf(page).sort()), want, 'src/page.html @font-face의 로컬 url()');
  for (const b of pf) {
    const f = path.basename(/url\(\s*['"]?([^'")\s]+)/.exec(b)[1]), [fam, w] = FONTS[f];
    ok(/font-display\s*:\s*swap\b/.test(b), f + ': font-display: swap이 없다');
    ok(/format\(\s*['"]woff2['"]\s*\)/.test(b), f + ": format('woff2')가 없다");
    ok(new RegExp("font-family\\s*:\\s*['\"]" + fam + "['\"]").test(b) && new RegExp('font-weight\\s*:\\s*' + w + '\\b').test(b) && /font-style\s*:\s*normal\b/.test(b), f + ': ' + fam + ' ' + w + ' normal이 아니다');
  }
  const sizes = [];
  for (const f of Object.keys(FONTS)) {
    const p = path.join(__dirname, 'src', 'vendor', 'fonts', f);
    ok(fs.existsSync(p) && fs.statSync(p).isFile(), '글꼴 파일이 없다: src/vendor/fonts/' + f + ' (python src/vendor/sync_fonts.py)');
    const buf = fs.readFileSync(p);
    ok(buf.length > 0 && buf.length < 2000000, f + ': 크기가 0초과 2,000,000바이트 미만이 아니다 (' + buf.length + ')');
    eq(buf.subarray(0, 4).toString('latin1'), 'wOF2', f + ': woff2 머리');
    sizes.push(f + ' ' + buf.length + 'B');
  }
  for (const f of ['index.html', '2d.html']) {
    const s = rd(f);
    eq(JSON.stringify(urlsOf(s).sort()), want, f + ': @font-face url()이 src/page.html과 다르다(python src/vendor/build_pages.py)');
    ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(s), f + ': Google Fonts 주소가 남아 있다');
  }
  const lic = rd('src/vendor/fonts/LICENSE');
  for (const k of ['SIL OPEN FONT LICENSE', 'Version 1.1', 'Gowun Batang', 'Gowun Dodum']) ok(lic.includes(k), 'src/vendor/fonts/LICENSE에 ' + k + '이(가) 없다');
  const have = new Set(Array.from(rd('src/vendor/fonts/chars.txt'))), missing = new Set();
  for (const f of ['src/page.html', 'src/render.js', 'src/sim.js', 'src/render3d.js'])
    for (const ch of rd(f)) if (ch !== '\ufeff' && ch.codePointAt(0) > 0x7f && !have.has(ch)) missing.add(ch);
  ok(missing.size === 0, 'src/vendor/fonts/chars.txt에 빠진 글자 ' + missing.size + '개: ' + Array.from(missing).join('') + ' (python src/vendor/sync_fonts.py 후 python src/vendor/build_pages.py)');
  console.log('글꼴 확인: 로컬 서브셋 ' + sizes.join(', ') + ', 글자 ' + have.size + '자, SIL OFL 1.1, Google Fonts 주소 없음');
}

// ---- 규칙 ----
{
  const fresh = () => { const g = S.newGame(5); g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.postsTotal = 0; g.enemies = []; g.obstacles = []; return g; };   // 적도 초소도(수비대도) 바리케이드도 없는 빈 판
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
      ok(g.hearts[0].keep === 1 && g.hearts[0].molts === 1 && g.hearts[1].keep === M.twinKeep && g.hearts[1].molts === 0, '쌍둥이 심장: 둘째는 유전자 절반, 탈피 보너스 없음');
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
    // 종류별 변이 카드 셋(맹수·갑주·사수, 각 한 번만): 기존 수치에 배율만 붙는다
    {
      for (const id of ['beast_leap', 'armor_bulwark', 'ranger_volley']) ok(S.MUTS[id] && S.MUTS[id].max === 1 && typeof S.MUTS[id].name === 'string' && S.MUTS[id].name && typeof S.MUTS[id].desc === 'string' && S.MUTS[id].desc, '종류별 카드는 이름·설명이 있고 한 번만: ' + id);
      eq(Object.keys(S.MUTS).length, 11, '변이 카드 수');
      const gv = fresh(); gv.muts.beast_leap = 1; bombAt(gv, 'beast', 85, 9, 15); run(gv, 2);
      ok(gv.vortexes[0].maxT === C.special.beast.t && Math.abs(gv.vortexes[0].r - C.blastRadius * C.special.beast.r * (1 + M.vortexR)) < 1e-9, '맹수 카드: 소용돌이 반경 +15%, 시간 그대로');
      const gc = fresh(); gc.muts.ranger_volley = 1; bombAt(gc, 'ranger', 85, 9, 15); run(gc, 2);
      ok(gc.clusters.length === C.special.ranger.n && gc.clusters.every(b => Math.abs(b.r - C.blastRadius * C.special.ranger.r * (1 + M.clusterR)) < 1e-9 && b.frac === C.special.ranger.frac), '사수 카드: 집속탄 반경 +15%, 발 수·피해 그대로');
      const gw = fresh(); gw.muts.armor_bulwark = 1; bombAt(gw, 'armor', 85, 9, 15); run(gw, 2);
      const gw0 = fresh(); bombAt(gw0, 'armor', 85, 9, 15); run(gw0, 2);
      ok(gw0.necro.shieldT > 0, '카드 없이도 방벽이 선다');
      approx(gw.necro.shieldT - gw0.necro.shieldT, M.wallT, 1e-9, '갑주 카드: 방벽 +1초');
      // 충격파 피해 +20%
      const quake = mut => {
        const g = fresh(); if (mut) g.muts.armor_bulwark = 1;
        const u = g.units[0]; u.main = 'armor'; u.genes = { beast: 0, armor: 3, ranger: 0 }; u.inst = 0; u.hitsTaken = 99;
        const e = foe(g, u.x + 2, u.y, { hp: 1e4, maxHp: 1e4 });
        S.step(g, 1 / 60, still);
        ok(u.hitsTaken === 0, '충격파가 터졌다');
        return 1e4 - e.hp;
      };
      const q0 = quake(false), q1 = quake(true);
      ok(q0 > 0, '충격파가 적에게 닿는다');
      approx(q1 / q0, 1 + M.quakeDmg, 1e-9, '갑주 카드: 충격파 피해 +20%');
      // 기술 간격: 카드가 없으면 그대로, 있으면 -15%(skillCdMin 아래로는 안 간다)
      const cdAfter = (main, mut) => {
        const g = fresh(); if (mut) g.muts[main === 'beast' ? 'beast_leap' : 'ranger_volley'] = 1;
        const u = g.units[0]; u.main = main; u.genes = { beast: 0, armor: 0, ranger: 0 }; u.genes[main] = 3; u.inst = 0; u.skillT = 0;
        foe(g, u.x, u.y - 3, { hp: 1e4, maxHp: 1e4 });
        const want = S.stats(u).skillCd;
        S.step(g, 1 / 60, still);
        return [u.skillT, want];
      };
      for (const [main, cut] of [['beast', M.leapCd], ['ranger', M.volleyCd]]) {
        const [b0, w0] = cdAfter(main, false), [b1, w1] = cdAfter(main, true);
        approx(b0, w0, 1e-9, main + ': 카드가 없으면 기술 간격 그대로');
        approx(b1, Math.max(C.skillCdMin, w1 * (1 - cut)), 1e-9, main + ' 카드: 기술 간격 -15%');
      }
      // 5구역(초소 다섯) + 씨앗 하나 = 여섯 번 골라도 매번 카드 셋이 나온다
      for (let seed = 1; seed <= 20; seed++) {
        const g = S.newGame(seed, { district: 5, mutSeed: true });
        eq(g.postsTotal, 5, '5구역 초소 다섯');
        g.choiceQ += 5;
        for (let i = 0; i < 6; i++) {
          ok(Array.isArray(g.choice) && g.choice.length === 3 && new Set(g.choice).size === 3 && g.choice.every(id => S.MUTS[id] && !(S.MUTS[id].max && (g.muts[id] || 0) >= S.MUTS[id].max)), '5구역 ' + (i + 1) + '번째 고르기: 카드 셋 (시드 ' + seed + ', ' + JSON.stringify(g.choice) + ')');
          const pick = g.choice.find(id => S.MUTS[id].max === 1) || g.choice[0];
          ok(S.chooseMut(g, pick), '고를 수 있다');
        }
        ok(g.choice === null && g.choiceQ === 0, '여섯 번 고르면 끝난다');
      }
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
  g = S.newGame(9); g.spawnT = 1e9; g.posts = []; g.postsTotal = 0; g.obstacles = [];
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
  // 초소를 폭발로 부수면 그 자리에 순혈 코어(q: 3) 혼이 하나 남는다. 이미 부서진 초소는 다시 남기지 않는다
  {
    // 갑주로 시작: 다 익은 갑주 폭발은 방벽만 걸고 소용돌이가 없어 같은 S.step 안에서 새 혼이 끌려가지 않는다(생성 좌표를 그대로 본다)
    const g = S.newGame(3, { starter: 'armor' }); g.spawnT = 1e9; g.eliteIdx = 99; g.enemies = []; g.obstacles = [];
    for (const o of g.posts) o.cd = 99;
    const p = g.posts[0], u = g.units[0], q3 = () => g.souls.filter(s => s.q === 3);
    eq(u.main, 'armor', '갑주 키메라로 시작한다');
    eq(g.district, 1, '1구역 판'); eq(q3().length, 0, '처음에는 순혈 코어 혼이 없다');
    u.x = p.x + 1; u.y = p.y; u.inst = 90;
    ok(S.detonate(g), '익은 키메라가 초소로 뛰어든다');
    for (let i = 0; i < 90 && g.units.indexOf(u) >= 0; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(p.dead && g.postsDown === 1, '다 익은 폭발로 초소가 부서진다');
    eq(q3().length, 1, '부서진 초소가 순혈 코어 혼을 하나 남긴다');
    const cs = q3()[0];
    const px = Math.min(Math.max(p.x, 0.8), S.W - 0.8), py = Math.min(Math.max(p.y, 0.8), S.H - 0.8);
    ok(Math.hypot(cs.x - px, cs.y - py) < 1e-9 && cs.type === 'armor' && cs.ttl > 0 && cs.ttl <= C.soulTtl * 1.5 && Object.keys(cs).sort().join() === 'q,ttl,type,x,y', '혼은 초소 자리에, killEnemy와 같은 모양으로: ' + JSON.stringify(cs));
    // 이미 부서진 초소 곁에서 다시 터뜨려도 혼이 더 나오지 않는다(남은 혼은 비우고 소환용 1등급 혼 하나만 둔다)
    g.choice = null; g.posts = [p]; g.feedT = 0; g.souls = [];
    g.souls.push({ x: g.necro.x, y: g.necro.y, type: 'beast', q: 1, ttl: 5 }); S.step(g, 1 / 60, { x: 0, y: 0 });
    const u2 = g.units[g.units.length - 1]; u2.x = p.x + 0.5; u2.y = p.y; u2.inst = 90;
    ok(S.detonate(g), '두 번째 키메라가 터진다');
    for (let i = 0; i < 90 && g.units.indexOf(u2) >= 0; i++) S.step(g, 1 / 60, { x: 0, y: 0 });
    ok(g.units.indexOf(u2) < 0 && g.postsDown === 1, '두 번째 폭발: 부서진 초소는 다시 세지 않는다');
    eq(q3().length, 0, '이미 부서진 초소는 혼을 다시 남기지 않는다');
  }
  // 대장 종류: 구역마다 갑주 → 맹수 → 사수. 맹수 대장은 연속 돌진, 사수 대장은 수비대 소환
  {
    const still = { x: 0, y: 0 }, BB = C.bossBeast, BR = C.bossRanger;
    const quietBoss = d => { const g = S.newGame(3, { district: d }); g.obstacles = []; g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.postsTotal = 0; g.enemies = []; g.units = []; g.necro.hp = g.necro.maxHp = 1e9; return { g, b: S.spawnBoss(g) }; };
    eq(JSON.stringify([1, 2, 3, 4, 5, 6].map(d => quietBoss(d).b.arch)), JSON.stringify(['armor', 'beast', 'ranger', 'armor', 'beast', 'ranger']), '대장 종류: 1·2·3구역 갑주·맹수·사수, 4구역부터 다시');
    const trace = d => {
      const { g, b } = quietBoss(d); b.mode = 'chase'; b.rechargeT = 0.01; b.x = 9; b.y = 6;
      const log = []; let prev = b.mode;
      for (let i = 0; i < 60 * 40 && log.filter(x => x.mode === 'charge').length < 3; i++) {
        S.step(g, 1 / 60, still);
        if (b.mode !== prev) { log.push({ mode: b.mode, t: g.t, rechargeT: b.rechargeT, modeT: b.modeT }); prev = b.mode; }
      }
      return log;
    };
    // 갑주 대장: 예전 그대로 한 번 돌진하고 rechargeEvery
    {
      const L = trace(1), ch = L.filter(x => x.mode === 'chase'), aims = L.filter(x => x.mode === 'aim');
      ok(L.filter(x => x.mode === 'charge').length === 3 && ch.length === 2, '갑주 대장: 돌진 셋 (' + L.map(x => x.mode).join(',') + ')');
      ok(ch.every(x => x.rechargeT === C.rechargeEvery) && aims.every(x => x.modeT === C.aimTime), '갑주 대장: 돌진마다 보통 간격, 보통 겨눔');
    }
    // 맹수 대장: 짧게 겨누고, 첫 돌진 뒤 짧은 간격으로 한 번 더, 그다음 보통 간격
    {
      const L = trace(2), ch = L.filter(x => x.mode === 'chase'), cg = L.filter(x => x.mode === 'charge'), aims = L.filter(x => x.mode === 'aim');
      ok(BB.aimTime < C.aimTime && L[0].mode === 'aim' && aims.every(x => x.modeT === BB.aimTime), '맹수 대장: 겨누는 시간이 짧다');
      ok(cg.length === 3 && ch.length === 2, '맹수 대장: 돌진 셋 (' + L.map(x => x.mode).join(',') + ')');
      ok(ch[0].rechargeT === BB.gap && BB.gap < C.rechargeEvery, '맹수 대장: 첫 돌진 뒤 짧은 재돌진 간격');
      ok(cg[1].t - ch[0].t < C.rechargeEvery, '맹수 대장: rechargeEvery보다 빨리 한 번 더 돌진 (' + (cg[1].t - ch[0].t).toFixed(2) + '초)');
      eq(ch[1].rechargeT, C.rechargeEvery, '맹수 대장: 연속 돌진 뒤에는 보통 간격');
      ok(cg[2].t - ch[1].t >= C.rechargeEvery - 1e-6, '맹수 대장: 연속 돌진은 한 번뿐(무한 연타 아님)');
    }
    // 사수 대장: every초마다 1등급 잡몹 n마리
    {
      const { g, b } = quietBoss(3); b.stun = 1e9;
      const adds = [];
      for (let i = 0; i < Math.round(60 * (BR.every * 2 + 0.5)); i++) { const n0 = g.enemies.length; S.step(g, 1 / 60, still); if (g.enemies.length > n0) adds.push({ t: g.t, n: g.enemies.length - n0 }); }
      eq(adds.length, 2, '사수 대장: ' + (BR.every * 2 + 0.5) + '초 동안 두 번 소환');
      ok(adds.every(a => a.n === BR.n), '사수 대장: 한 번에 ' + BR.n + '마리 (' + adds.map(a => a.n).join(',') + ')');
      approx(adds[0].t, BR.every, 1 / 60 + 1e-9, '사수 대장: 첫 소환 시각');
      approx(adds[1].t - adds[0].t, BR.every, 1 / 60 + 1e-9, '사수 대장: 소환 간격');
      const mins = g.enemies.filter(e => e !== b);
      ok(mins.length === 2 * BR.n && mins.every(e => e.g === 1 && !e.elite && !e.boss), '사수 대장: 부른 것은 1등급 잡몹');
      ok(quietBoss(1).b.summonT > 0 && (() => { const q = quietBoss(1); q.b.stun = 1e9; for (let i = 0; i < 60 * (BR.every + 1); i++) S.step(q.g, 1 / 60, still); return q.g.enemies.length === 1; })(), '갑주 대장은 소환하지 않는다');
    }
  }
  // 2바퀴째(4구역부터) 대장 보조 패턴: 갑주·맹수는 약한 수비대 소환, 사수는 연속 돌진. 1~3구역은 그대로
  {
    const still = { x: 0, y: 0 }, BB = C.bossBeast, BR = C.bossRanger, LP = C.bossLap;
    const qb = d => { const g = S.newGame(3, { district: d }); g.obstacles = []; g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.postsTotal = 0; g.enemies = []; g.units = []; g.necro.hp = g.necro.maxHp = 1e9; return { g, b: S.spawnBoss(g) }; };
    const adds = (d, secs) => { const { g, b } = qb(d); b.stun = 1e9; const out = []; for (let i = 0; i < Math.round(60 * secs); i++) { const n0 = g.enemies.length; S.step(g, 1 / 60, still); if (g.enemies.length > n0) out.push({ t: g.t, n: g.enemies.length - n0 }); } return { g, b, out }; };
    const trace = d => {
      const { g, b } = qb(d); b.mode = 'chase'; b.rechargeT = 0.01; b.x = 9; b.y = 6;
      const log = []; let prev = b.mode;
      for (let i = 0; i < 60 * 40 && log.filter(x => x.mode === 'charge').length < 3; i++) {
        S.step(g, 1 / 60, still);
        if (b.mode !== prev) { log.push({ mode: b.mode, t: g.t, rechargeT: b.rechargeT, modeT: b.modeT }); prev = b.mode; }
      }
      return log;
    };
    ok(LP.armor.n < BR.n && LP.armor.every > BR.every && LP.beast.n < BR.n && LP.beast.every > BR.every && LP.ranger.gap > BB.gap, '2바퀴째 보조 패턴은 원래 패턴보다 약하다');
    // 1~3구역: 보조 패턴 없음, 예전 그대로
    for (const d of [1, 2, 3]) { const b = qb(d).b; ok(b.lap === 0 && !b.summon && b.chainMax === 0, d + '구역 대장: 보조 패턴 없음'); }
    eq(adds(1, BR.every * 2 + 1).out.length, 0, '1구역 갑주 대장은 소환하지 않는다');
    eq(adds(2, BR.every * 2 + 1).out.length, 0, '2구역 맹수 대장은 소환하지 않는다');
    { const L = trace(3), ch = L.filter(x => x.mode === 'chase');
      ok(ch.length === 2 && ch.every(x => x.rechargeT === C.rechargeEvery), '3구역 사수 대장: 연속 돌진 없음 (' + L.map(x => x.mode).join(',') + ')'); }
    // 4구역 갑주 대장: 갑주 돌진 그대로 + 약한 수비대 소환
    {
      const { g, b, out } = adds(4, LP.armor.every * 2 + 0.5);
      ok(b.arch === 'armor' && b.lap === 1 && b.summon === LP.armor, '4구역: 갑주 대장에 소환 플래그');
      eq(out.length, 2, '4구역 갑주 대장: 두 번 소환');
      ok(out.every(a => a.n === LP.armor.n), '4구역 갑주 대장: 한 번에 ' + LP.armor.n + '마리 (' + out.map(a => a.n).join(',') + ')');
      approx(out[0].t, LP.armor.every, 1 / 60 + 1e-9, '4구역 갑주 대장: 첫 소환 시각');
      const es = g.enemies.filter(e => e !== b);
      ok(es.length === 2 * LP.armor.n && es.every(e => e.escort && e.g === 1 && !e.elite), '4구역 갑주 대장: escort 1등급 수비대');
      const L = trace(4), ch = L.filter(x => x.mode === 'chase'), aims = L.filter(x => x.mode === 'aim');
      ok(ch.length === 2 && ch.every(x => x.rechargeT === C.rechargeEvery) && aims.every(x => x.modeT === C.aimTime), '4구역 갑주 대장: 돌진은 예전 갑주 그대로');
    }
    // 5구역 맹수 대장: 연속 돌진 + 약한 수비대 소환
    {
      const { b, out } = adds(5, LP.beast.every * 2 + 0.5);
      ok(b.arch === 'beast' && b.summon === LP.beast && out.length === 2 && out.every(a => a.n === LP.beast.n), '5구역 맹수 대장: 약한 수비대 소환 (' + out.map(a => a.n).join(',') + ')');
      const L = trace(5), ch = L.filter(x => x.mode === 'chase'), aims = L.filter(x => x.mode === 'aim');
      ok(ch.length === 2 && ch[0].rechargeT === BB.gap && ch[1].rechargeT === C.rechargeEvery && aims.every(x => x.modeT === BB.aimTime), '5구역 맹수 대장: 연속 돌진 그대로 (' + L.map(x => x.mode).join(',') + ')');
    }
    // 6구역 사수 대장: 소환 그대로 + 연속 돌진(긴 간격)
    {
      const { b, out } = adds(6, BR.every * 2 + 0.5);
      ok(b.arch === 'ranger' && b.chainMax === LP.ranger.chain && out.length === 2 && out.every(a => a.n === BR.n), '6구역 사수 대장: 소환은 그대로');
      const L = trace(6), ch = L.filter(x => x.mode === 'chase'), cg = L.filter(x => x.mode === 'charge'), aims = L.filter(x => x.mode === 'aim');
      ok(cg.length === 3 && ch.length === 2 && ch[0].rechargeT === LP.ranger.gap && ch[1].rechargeT === C.rechargeEvery, '6구역 사수 대장: 한 번 더 돌진 (' + L.map(x => x.mode).join(',') + ')');
      ok(aims.every(x => x.modeT === C.aimTime) && cg[2].t - ch[1].t >= C.rechargeEvery - 1e-6, '6구역 사수 대장: 보통 겨눔, 연속 돌진은 한 번뿐');
    }
    // 7구역부터도 같은 보조 패턴
    { const b7 = qb(7).b, b8 = qb(8).b, b9 = qb(9).b;
      ok(b7.arch === 'armor' && b7.summon === LP.armor && b8.arch === 'beast' && b8.summon === LP.beast && b9.arch === 'ranger' && b9.chainMax === LP.ranger.chain && !b9.summon, '7~9구역: 보조 패턴 일관'); }
  }
  // 구역별 초소 배치 표와 잡몹 비율 표
  {
    const sx = S.W / 2, sy = S.H - 3.5, dS = p => Math.hypot(p[0] - sx, p[1] - sy), still = { x: 0, y: 0 };
    const L = S.POST_LAYOUTS;
    ok(Array.isArray(L) && L.length >= 2 && L.length <= 3, '초소 배치 표는 2~3개');
    eq(JSON.stringify(L[0]), JSON.stringify([[4, 16], [14, 13], [8, 7.5], [15, 4.5], [3, 3.5], [9, 1.5]]), '0번 배치 표는 예전 POST_SPOTS 그대로');
    { const g0 = S.newGame(3); approx(g0.necro.x, sx, 1e-9, '시작 지점 x'); approx(g0.necro.y, sy, 1e-9, '시작 지점 y'); }
    L.forEach((T, i) => {
      ok(T.length >= 5, i + '번 배치 표: 다섯 구역까지 쓸 자리가 있다');
      for (let k = 1; k < T.length; k++) ok(dS(T[k]) >= dS(T[k - 1]), i + '번 배치 표: 시작 지점에서 가까운 순서 (' + k + ')');
      const m = Math.min(...T.map(dS));
      ok(m >= C.postRange * 2, i + '번 배치 표: 가장 가까운 초소도 postRange*2 이상 (' + m.toFixed(2) + ')');
      ok(T.every(p => p[0] > 0.9 && p[0] < S.W - 0.9 && p[1] > 0.9 && p[1] < S.H - 0.9), i + '번 배치 표: 판 안');
    });
    // 실제 판의 초소가 구역 번호의 표에서 나오고, 서로 다르다
    const first3 = g => JSON.stringify(g.posts.slice(0, 3).map(p => [p.x, p.y]));
    const gs = [1, 2, 3, 4, 5, 6].map(d => S.newGame(3, { district: d }));
    gs.forEach((g, i) => {
      const T = S.postSpotsFor(i + 1);
      ok(g.posts.every((p, k) => p.x === T[k][0] && p.y === T[k][1]), (i + 1) + '구역: 초소가 그 구역의 배치 표에서 나온다');
      ok(g.posts.every(p => Math.hypot(p.x - g.necro.x, p.y - g.necro.y) >= C.postRange * 2), (i + 1) + '구역: 초소가 시작 지점에서 postRange*2 이상');
    });
    ok(first3(gs[0]) !== first3(gs[1]) && first3(gs[1]) !== first3(gs[2]) && first3(gs[0]) !== first3(gs[2]), '1·2·3구역의 초소 배치가 서로 다르다');
    ok(first3(gs[3]) === first3(gs[0]) && first3(gs[4]) === first3(gs[1]) && first3(gs[5]) === first3(gs[2]), '4구역부터 배치 표가 다시 돈다');
    // 같은 시드·같은 구역이면 초소와 수비대가 똑같다
    const snap = g => JSON.stringify({ p: g.posts.map(p => [p.x, p.y]), e: g.enemies.map(e => [e.arch, e.x, e.y, e.hp]) });
    for (const d of [1, 2, 3, 4, 5]) for (const seed of [1, 7, 42]) eq(snap(S.newGame(seed, { district: d })), snap(S.newGame(seed, { district: d })), '재현성: 시드 ' + seed + ', ' + d + '구역');
    ok(snap(S.newGame(1, { district: 2 })) !== snap(S.newGame(2, { district: 2 })), '시드가 다르면 수비대 자리가 다르다');
    // 잡몹 비율 표: 구역 번호로 고른다
    ok(S.foeMixFor(1, false) === C.foeMixEarly && S.foeMixFor(1, true) === C.foeMixLate, '1구역 비율은 예전 foeMixEarly/foeMixLate 그대로');
    ok(Array.isArray(C.foeMixes) && C.foeMixes.length >= 2 && C.foeMixes.length <= 3, '잡몹 비율 표는 2~3개');
    for (let d = 1; d <= 6; d++) {
      const m = C.foeMixes[(d - 1) % C.foeMixes.length];
      ok(S.foeMixFor(d, false) === m.early && S.foeMixFor(d, true) === m.late, d + '구역: 비율 표 선택');
      for (const x of [m.early, m.late]) ok(x.beast >= 0 && x.ranger >= 0 && x.beast + x.ranger <= 1, d + '구역: 비율이 0~1');
    }
    ok(JSON.stringify(C.foeMixes[0]) !== JSON.stringify(C.foeMixes[1]) && JSON.stringify(C.foeMixes[1]) !== JSON.stringify(C.foeMixes[2]), '구역마다 비율이 다르다');
    // 실제 스폰이 그 구역의 비율을 쓴다(rand를 고정해 종류를 맞춘다)
    const archFor = (mix, v) => v < mix.beast ? 'beast' : v < mix.beast + mix.ranger ? 'ranger' : 'armor';
    const spawned = (d, v, t) => { const g = S.newGame(5, { district: d }); g.enemies = []; g.posts = []; g.postsTotal = 0; g.eliteIdx = 99; g.necro.hp = 1e9; g.rand = () => v; g.t = t; g.spawnT = 0; S.step(g, 1 / 600, still); return g.enemies; };
    let varied = 0;
    for (const v of [0.1, 0.36, 0.45, 0.55, 0.65, 0.69]) for (const late of [false, true]) {
      const seen = new Set();
      for (const d of [1, 2, 3]) {
        const es = spawned(d, v, late ? 40 : 0), want = archFor(S.foeMixFor(d, late), v);
        ok(es.length > 0 && es.every(e => e.arch === want), d + '구역 ' + (late ? '후반' : '초반') + ' 스폰(' + v + '): ' + want + ' (실제 ' + es.map(e => e.arch).join(',') + ')');
        seen.add(want);
      }
      if (seen.size > 1) varied++;
    }
    ok(varied > 0, '같은 난수에서 구역마다 다른 종류가 나온다');
    // 바퀴(lap)별 중형(2등급) 확률: 위 종류 테스트는 1~3구역·t 0/40(18초 전이거나 중형 30% 밴드, v<0.7)이라 4구역 이상 변경과 겹치지 않는다
    eq(C.midLapStep, 0.10, '바퀴당 중형 확률 증가폭'); eq(C.midMax, 0.70, '중형 확률 상한');
    const mids = es => es.filter(e => e.g === 2).length, gradeAt = (d, v, t) => { const es = spawned(d, v, t); ok(es.length > 0, d + '구역 스폰 있음'); return mids(es) ? 2 : 1; };
    // 1~3구역(lap 0)은 예전 그대로: 18~50초 30%(r2>=0.7), 50초 이후 50%(r2>=0.5), 18초 전은 1등급만
    for (const d of [1, 2, 3]) {
      eq(gradeAt(d, 0.69, 30), 1, d + '구역 t=30 r2=0.69: 1등급'); eq(gradeAt(d, 0.71, 30), 2, d + '구역 t=30 r2=0.71: 중형');
      eq(gradeAt(d, 0.49, 60), 1, d + '구역 t=60 r2=0.49: 1등급'); eq(gradeAt(d, 0.51, 60), 2, d + '구역 t=60 r2=0.51: 중형');
    }
    // 같은 r2(0.45), t=60: 1구역은 1등급 무리, 4구역(lap 1, 60%)은 중형 하나
    const e1 = spawned(1, 0.45, 60), e4 = spawned(4, 0.45, 60);
    ok(e1.length > 1 && mids(e1) === 0, '1구역 t=60 r2=0.45: 1등급 무리 (중형 ' + mids(e1) + ')');
    ok(e4.length === 1 && mids(e4) === 1, '4구역 t=60 r2=0.45: 중형 하나 (실제 ' + e4.map(e => e.g).join(',') + ')');
    // 18~50초 밴드도 바퀴마다 오른다: 4구역 40%(r2>=0.6)
    eq(gradeAt(1, 0.65, 30), 1, '1구역 t=30 r2=0.65: 1등급'); eq(gradeAt(4, 0.65, 30), 2, '4구역 t=30 r2=0.65: 중형');
    eq(gradeAt(4, 0.55, 30), 1, '4구역 t=30 r2=0.55: 1등급(40%를 넘지 않는다)');
    // 상한 0.70: 7구역(0.5+0.2)과 10구역(0.5+0.3 → 0.7)은 같은 경계 r2=0.3
    for (const d of [7, 10, 13]) { eq(gradeAt(d, 0.29, 60), 1, d + '구역 t=60 r2=0.29: 상한 0.70이라 1등급'); eq(gradeAt(d, 0.31, 60), 2, d + '구역 t=60 r2=0.31: 중형'); }
    eq(gradeAt(10, 0.25, 30), 1, '10구역 t=30 r2=0.25: 0.3+0.3=0.6 → 1등급'); eq(gradeAt(10, 0.45, 30), 2, '10구역 t=30 r2=0.45: 중형');
    // 18초 전은 어느 구역이든 1등급만
    for (const d of [4, 10]) eq(gradeAt(d, 0.99, 10), 1, d + '구역 t=10: 1등급만');
    console.log('규칙 확인: 바퀴별 중형 확률(+0.10/lap, 상한 0.70), 1~3구역은 예전 그대로');
    // 수비대도 그 구역의 초반 비율을 쓴다(여러 시드의 비율)
    const share = (d, arch) => { let n = 0, k = 0; for (let s = 1; s <= 40; s++) for (const e of S.newGame(s, { district: d }).enemies) if (e.guard) { n++; if (e.arch === arch) k++; } return k / n; };
    ok(share(2, 'ranger') > share(1, 'ranger') + 0.05, '2구역 수비대는 사수가 더 많다');
    ok(share(3, 'armor') > share(1, 'armor') + 0.05, '3구역 수비대는 갑주가 더 많다');
  }
  console.log('규칙 확인: 구역별 초소 배치 표(거리 postRange*2 이상·구역마다 다름·재현성)와 잡몹 비율 표');
  console.log('규칙 확인: 초소 폭파, 대장, 구역 정복, 다음 구역은 처음부터');

  // ---- 바리케이드: 구역별 표, 배치 안전, 이동 차단, 돌진 저지 ----
  {
    const BL = S.BARRICADE_LAYOUTS, CB = C.barricade, still = { x: 0, y: 0 };
    const bd = (b, x, y) => Math.hypot(Math.max(0, Math.abs(x - b.x) - b.hw), Math.max(0, Math.abs(y - b.y) - b.hh));   // 직사각형과 점 사이
    const gap = (a, b) => Math.hypot(Math.max(0, Math.abs(a.x - b.x) - a.hw - b.hw), Math.max(0, Math.abs(a.y - b.y) - a.hh - b.hh));
    ok(Array.isArray(BL) && BL.length === 3, '바리케이드 표는 셋');
    ok(JSON.stringify(BL[0]) !== JSON.stringify(BL[1]) && JSON.stringify(BL[1]) !== JSON.stringify(BL[2]) && JSON.stringify(BL[0]) !== JSON.stringify(BL[2]), '구역마다 바리케이드 배치가 다르다');
    for (let d = 1; d <= 6; d++) {
      const g = S.newGame(3, { district: d }), T = S.barricadesFor(d), spots = S.postSpotsFor(d), O = g.obstacles;
      ok(T === BL[(d - 1) % 3] && O.length === T.length && O.length >= 2 && O.length <= 3, d + '구역: 바리케이드 2~3개, 그 구역 표에서');
      O.forEach((b, i) => {
        const w = d + '구역 바리케이드 ' + i + ': ';
        ok(b.x === T[i][0] && b.y === T[i][1] && b.hw === T[i][2] && b.hh === T[i][3], w + '표 그대로');
        ok(b.hw > 0 && b.hh > 0 && Math.min(b.hw, b.hh) <= CB.thin, w + '얇다');
        ok(spots.every(p => bd(b, p[0], p[1]) >= CB.clearPost) && g.posts.every(p => bd(b, p.x, p.y) >= CB.clearPost), w + '초소와 겹치지 않는다');
        ok(bd(b, g.necro.x, g.necro.y) >= CB.clearStart && g.units.every(u => bd(b, u.x, u.y) > u.r), w + '시작 지점과 겹치지 않는다');
        ok(g.enemies.every(e => bd(b, e.x, e.y) > e.r), w + '수비대와 겹치지 않는다');
        ok(b.x - b.hw >= CB.gap && S.W - b.x - b.hw >= CB.gap && b.y - b.hh >= CB.gap && S.H - b.y - b.hh >= CB.gap, w + '벽과 사이가 비어 있다');
        O.forEach((c, j) => { if (j > i) ok(gap(b, c) >= CB.gap, w + j + '번과 사이가 비어 있다'); });
      });
      // 초소로 가는 길이 막히지 않는다: 시작 지점에서 초소 자리를 차례로 곧장 밀고 가도 닿고, 바리케이드에 들어가지 않는다
      g.spawnT = 1e9; g.eliteIdx = 99; g.enemies = []; g.units = []; g.necro.hp = 1e9;
      const route = g.posts.map(p => [p.x, p.y]), n = g.necro; g.posts = [];
      let inside = false;
      for (const [px, py] of route) {
        for (let i = 0; i < 60 * 8 && Math.hypot(px - n.x, py - n.y) > 0.3; i++) {
          const dx = px - n.x, dy = py - n.y, m = Math.hypot(dx, dy);
          S.step(g, 1 / 60, { x: dx / m, y: dy / m });
          if (O.some(b => bd(b, n.x, n.y) < n.r - 1e-6)) inside = true;
        }
        ok(Math.hypot(px - n.x, py - n.y) <= 0.3, d + '구역: 초소 자리 (' + px + ', ' + py + ')까지 길이 열려 있다');
      }
      ok(!inside, d + '구역: 초소로 가는 동안 바리케이드에 들어가지 않는다');
    }
    const wall = { x: 9, y: 22, hw: 2.5, hh: 0.4 }, top = wall.y - wall.hh, bot = wall.y + wall.hh;
    // 네크로맨서: 똑바로 밀면 막히고, 비스듬히 밀면 미끄러져 돌아 나간다
    { const g = fresh(), n = g.necro; g.units = []; g.obstacles = [wall]; n.x = 9; n.y = 24;
      let inside = false;
      for (let i = 0; i < 60; i++) { S.step(g, 1 / 60, { x: 0, y: -1 }); if (bd(wall, n.x, n.y) < n.r - 1e-6) inside = true; }
      ok(!inside && Math.abs(n.y - (bot + n.r)) < 1e-6 && Math.abs(n.x - 9) < 1e-9, '네크로맨서: 바리케이드를 뚫고 가지 못한다');
      for (let i = 0; i < 180 && n.y > top - n.r; i++) { S.step(g, 1 / 60, { x: 0.7, y: -1 }); if (bd(wall, n.x, n.y) < n.r - 1e-6) inside = true; }
      ok(!inside && n.y <= top - n.r + 1e-6, '네크로맨서: 비스듬히 밀면 끼지 않고 돌아 나간다'); }
    // 적: 바리케이드를 지나가지 못하고, 돌아서 네크로맨서에게 닿는다(바로 뒤에 있어도 끼어 서지 않는다)
    { const g = fresh(), n = g.necro; g.units = []; g.obstacles = [wall]; n.x = 9; n.y = 25; n.hp = 1e9;
      const e = foe(g, 8, 19, { stun: 0, cd: 99, dmg: 0 });
      let inside = false, i = 0;
      for (; i < 240 && Math.hypot(e.x - n.x, e.y - n.y) > 1.6; i++) { S.step(g, 1 / 60, still); if (bd(wall, e.x, e.y) < e.r - 1e-6) inside = true; }
      ok(!inside, '적: 바리케이드를 지나가지 못한다');
      ok(Math.hypot(e.x - n.x, e.y - n.y) <= 1.6, '적: 바리케이드를 돌아 네크로맨서에게 닿는다 (' + (i / 60).toFixed(2) + '초)'); }
    // 돌진 중인 돌격조·대장이 바리케이드에 부딪히면 멈추고 chase, 기절 1.5(갑주 저지와 같다)
    const rush = mk => {
      const g = fresh(), n = g.necro; g.units = []; n.hp = 100;
      const b = { x: n.x, y: n.y - 5, hw: 2, hh: 0.4 }; g.obstacles = [b];
      const e = mk(g); e.x = n.x; e.y = n.y - 11; e.mode = 'warn'; e.modeT = 0.01; e.stun = 0;
      let charged = false;
      for (let i = 0; i < 120 && !(charged && e.mode !== 'charge'); i++) { S.step(g, 1 / 60, still); if (e.mode === 'charge') charged = true; }
      return { g, e, b, n, charged };
    };
    for (const [name, mk] of [['돌격조', g => foe(g, 0, 0, { elite: true, arch: 'armor', g: 3, hp: 999, maxHp: 999, r: 0.95, dmg: 0, hitUnits: {}, rechargeT: 99, chainLeft: 0 })], ['대장', g => S.spawnBoss(g)]]) {
      const { g, e, b, n, charged } = rush(mk);
      ok(charged && e.mode === 'chase', name + ': 바리케이드에 부딪히면 돌진이 끝나고 chase (' + e.mode + ')');
      eq(e.stun, 1.5, name + ': 바리케이드에 부딪히면 기절 1.5');
      ok(e.stun > 0 && g.events.includes('barricade'), name + ': 부딪힘 이벤트');
      ok(e.y <= b.y - b.hh - e.r + 1e-6 && bd(b, e.x, e.y) >= e.r - 1e-6, name + ': 바리케이드 앞에서 멈춘다');
      eq(n.hp, 100, name + ': 바리케이드 뒤의 네크로맨서는 맞지 않는다');
    }
  }
  console.log('규칙 확인: 바리케이드(구역별 표·초소/시작 지점과 겹침 없음·길 열림·네크로맨서/적 차단·돌아가기·돌진 저지 기절)');

  // ---- 1구역 갑주 대장 3단계: 66%·33% 1회성 전환, 포효 경직, 2단계 수비대, 3단계 연속 돌진, 기절 중 평타 약점 ----
  {
    const still = { x: 0, y: 0 }, P = C.bossPhase, LA = C.bossLap.armor;
    const qb = d => { const g = S.newGame(3, { district: d }); g.obstacles = []; g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.postsTotal = 0; g.enemies = []; g.units = []; g.necro.hp = g.necro.maxHp = 1e9; return { g, b: S.spawnBoss(g) }; };
    const roars = g => g.events.filter(x => x === 'roar').length;
    ok(P.at[0] === 0.66 && P.at[1] === 0.33 && P.weakMul > 1, '단계 문턱 66%·33%, 약점 배율 > 1');
    {
      const { g, b } = qb(1);
      ok(b.arch === 'armor' && b.lap === 0 && b.phases && b.phase === 1 && b.roarT === 0 && b.roars === 0 && b.weak === false && !b.summon && b.chainMax === 0, '1구역 갑주 대장: 1단계로 시작(소환·연속 돌진 없음)');
      b.mode = 'chase'; b.rechargeT = 99; b.x = 9; b.y = 6;
      b.hp = b.maxHp * 0.7; S.step(g, 1 / 60, still); eq(b.phase, 1, '체력 70%: 아직 1단계');
      b.hp = b.maxHp * 0.6; S.step(g, 1 / 60, still);
      ok(b.phase === 2 && b.roars === 1 && roars(g) === 1 && b.roarT > 0, '체력 66% 이하: 2단계, 포효');
      ok(b.summon === P.summon && b.chainMax === 0, '2단계: 수비대 소환 켜짐, 연속 돌진은 아직');
      ok(LA.every === 8 && LA.n === 2 && P.summon !== LA && P.summon.r === LA.r && P.summon.every > LA.every && P.summon.n >= 1 && P.summon.n <= LA.n, '2단계 소환: bossLap.armor 기반, 더 긴 주기(bossLap.armor 원본 그대로)');
      const tShift = g.t;
      b.rechargeT = 0.01; const x0 = b.x, y0 = b.y;
      for (let i = 0; i < Math.floor(60 * P.roar) - 5; i++) S.step(g, 1 / 60, still);
      ok(b.mode === 'chase' && b.x === x0 && b.y === y0 && b.roarT > 0 && g.enemies.length === 1 && b.summonT === P.summon.every, '포효하는 동안 멈춰 있고 소환 시계도 멈춘다');
      for (let i = 0; i < 30; i++) S.step(g, 1 / 60, still);
      b.mode = 'chase'; b.rechargeT = 99;
      ok(b.roarT === 0 && g.enemies.length === 1 && b.summonT < P.summon.every && b.summonT > P.summon.every - 1, '포효 직후에는 바로 부르지 않고 소환 주기를 기다린다');
      let tE = null;
      for (let i = 0; i < 60 * (P.summon.every + 2) && tE === null; i++) { S.step(g, 1 / 60, still); if (g.enemies.some(e => e.escort)) tE = g.t; }
      ok(tE !== null && Math.abs(tE - tShift - P.roar - P.summon.every) < 0.1, '포효 + 소환 주기 뒤 첫 수비대 (' + (tE === null ? '없음' : (tE - tShift).toFixed(2)) + '초)');
      ok(g.enemies.filter(e => e.escort && e.g === 1 && !e.elite).length === P.summon.n, '수비대 ' + P.summon.n + '마리 (' + (g.enemies.length - 1) + ')');
      b.hp = b.maxHp * 0.5; S.step(g, 1 / 60, still);
      ok(b.phase === 2 && b.roars === 1 && roars(g) === 1, '2단계 전환은 한 번뿐');
      b.hp = b.maxHp * 0.3; S.step(g, 1 / 60, still);
      ok(b.phase === 3 && b.roars === 2 && roars(g) === 2 && b.roarT > 0, '체력 33% 이하: 3단계, 포효');
      ok(b.chainMax === P.chain && b.chainGap === P.chainGap && b.chainLeft === P.chain && b.summon === P.summon, '3단계: 연속 돌진 켜짐, 수비대 소환 유지');
      b.hp = b.maxHp * 0.1; S.step(g, 1 / 60, still); b.hp = b.maxHp * 0.9; S.step(g, 1 / 60, still);
      ok(b.phase === 3 && b.roars === 2 && roars(g) === 2, '3단계 전환도 한 번뿐, 체력이 올라도 되돌아가지 않는다');
    }
    // 한 번에 33% 아래로: 두 단계를 차례로 한 번씩
    {
      const { g, b } = qb(1); b.mode = 'chase'; b.rechargeT = 99;
      b.hp = b.maxHp * 0.2; S.step(g, 1 / 60, still);
      ok(b.phase === 3 && b.roars === 2 && roars(g) === 2 && b.summon === P.summon && b.chainMax === P.chain, '한 번에 33% 아래: 2·3단계가 한 번씩');
      for (let i = 0; i < 60 * 5; i++) S.step(g, 1 / 60, still);
      eq(roars(g), 2, '그 뒤 포효는 더 없다');
    }
    // 단계 전환이 진행 중인 돌진 예고(warn)를 취소한다
    {
      const { g, b } = qb(1); b.mode = 'warn'; b.modeT = 0.05;
      b.hp = b.maxHp * 0.6; S.step(g, 1 / 60, still);
      ok(b.phase === 2 && b.mode === 'chase' && b.rechargeT === C.rechargeEvery, '예고 중 전환: 돌진 예고 취소');
      for (let i = 0; i < Math.ceil(60 * P.roar) + 5; i++) S.step(g, 1 / 60, still);
      ok(b.mode === 'chase', '포효 직후 바로 돌진하지 않는다');
    }
    // 3단계 돌진: 첫 돌진 뒤 chainGap초에 한 번 더, 그다음 보통 간격
    {
      const { g, b } = qb(1); b.mode = 'chase'; b.rechargeT = 99;
      b.hp = b.maxHp * 0.2; S.step(g, 1 / 60, still);
      for (let i = 0; i < Math.ceil(60 * P.roar) + 5; i++) S.step(g, 1 / 60, still);
      b.summonT = 1e9; b.mode = 'chase'; b.rechargeT = 0.01; b.x = 9; b.y = 6;
      const log = []; let prev = b.mode;
      for (let i = 0; i < 60 * 40 && log.filter(x => x.mode === 'charge').length < 3; i++) {
        S.step(g, 1 / 60, still);
        if (b.mode !== prev) { log.push({ mode: b.mode, t: g.t, rechargeT: b.rechargeT }); prev = b.mode; }
      }
      const ch = log.filter(x => x.mode === 'chase');
      ok(log.filter(x => x.mode === 'charge').length === 3 && ch.length === 2, '3단계: 돌진 셋 (' + log.map(x => x.mode).join(',') + ')');
      ok(ch[0].rechargeT === P.chainGap && P.chainGap < C.rechargeEvery && P.chainGap >= C.bossLap.ranger.gap && ch[1].rechargeT === C.rechargeEvery, '3단계: 첫 돌진 뒤 짧은 간격으로 한 번 더, 그다음 보통 간격');
    }
    // 4구역 이상(lap >= 1): 단계 없음, 처음부터 수비대 소환(약화되지 않음)
    {
      const { g, b } = qb(4);
      ok(!b.phases && b.phaseAt === null && b.summon === LA && LA.every < P.summon.every, '4구역 갑주 대장: 단계 없이 처음부터 수비대 소환(1구역 2단계보다 잦다)');
      b.hp = b.maxHp * 0.2; S.step(g, 1 / 60, still);
      ok(b.phase === 1 && b.roars === 0 && roars(g) === 0 && b.summon === LA && b.chainMax === 0, '4구역 갑주 대장: 패턴 그대로(전환·포효 없음)');
      for (const d of [2, 3]) ok(!qb(d).b.phases, d + '구역 대장: 단계 없음');
    }
    // 약점: 바리케이드 기절 동안 평타만 배율, 폭발은 bossBlastCap 그대로
    const hitBar = d => {
      const q = qb(d), { g, b } = q, n = g.necro;
      g.obstacles = [{ x: n.x, y: n.y - 5, hw: 2, hh: 0.4 }];
      b.x = n.x; b.y = n.y - 11; b.mode = 'warn'; b.modeT = 0.01; b.stun = 0;
      let charged = false;
      for (let i = 0; i < 120 && !(charged && b.mode !== 'charge'); i++) { S.step(g, 1 / 60, still); if (b.mode === 'charge') charged = true; }
      n.y = b.y + 3;
      return q;
    };
    const adj = (g, b) => { const u = S.newGame(5).units[0]; u.x = b.x + b.r + u.r; u.y = b.y; u.cd = 0; u.skillT = 99; g.units.push(u); return u; };
    {
      const { g, b } = hitBar(1);
      ok(b.mode === 'chase' && b.stun === 1.5 && b.weak === true, '1구역 갑주 대장: 바리케이드 기절 중 약점 노출');
      const u = adj(g, b); let hp0 = b.hp; S.step(g, 1 / 60, still);
      approx(hp0 - b.hp, S.stats(u).dmg * P.weakMul, 1e-6, '약점 노출 중 평타: 배율 적용');
      u.cd = 99;
      for (let i = 0; i < 200 && b.stun > 0; i++) S.step(g, 1 / 60, still);
      ok(b.stun <= 0 && b.weak === false, '기절이 끝나면 약점도 닫힌다');
      u.x = b.x + b.r + u.r; u.y = b.y; u.cd = 0; u.skillT = 99; hp0 = b.hp; S.step(g, 1 / 60, still);
      approx(hp0 - b.hp, S.stats(u).dmg, 1e-6, '기절이 아니면 평타 배율 없음');
    }
    {
      const { g, b } = hitBar(1), u = adj(g, b); u.cd = 99; u.inst = 100;
      ok(b.weak && b.stun > 0, '폭발 확인 전: 약점 노출 중');
      const hp0 = b.hp; ok(S.detonate(g), '터뜨리기');
      for (let i = 0; i < 90 && g.units.indexOf(u) >= 0; i++) S.step(g, 1 / 60, still);
      ok(g.units.indexOf(u) < 0, '키메라가 터졌다');
      approx(hp0 - b.hp, b.maxHp * C.bossBlastCap + 0.01, 1e-6, '약점 노출 중 폭발: bossBlastCap 그대로(배율 없음)');
    }
    {
      const { b } = hitBar(4);
      ok(b.stun === 1.5 && b.weak === false, '4구역 대장: 바리케이드 기절해도 약점 노출 없음');
    }
  }
  console.log('규칙 확인: 1구역 갑주 대장 3단계(66%·33% 1회 전환·포효 경직·2단계 수비대·3단계 연속 돌진·기절 중 평타 약점)');

  // ---- 골드와 시작 강화 ----
  {
    const G = C.gold, V = S.Save;
    let r, r0, b0;
    // 소환수 능력치 강화: 그 종류의 모든 소환수에 붙는다(시작 맹수, 혼으로 되살린 것, 심장 계승). 유전자는 늘 1에서 시작
    {
      const SS = C.statStep, plain = S.newGame(3).units[0], ps = S.stats(plain);
      eq(S.geneTotal(plain), 1, '시작 맹수는 유전자 1');
      eq(S.geneTotal(S.newGame(3, { start: { genes: 5 } }).units[0]), 1, '예전 시작 유전자 강화는 더 없다');
      const up = { beast: { hp: 2, dmg: 1, cd: 3, spd: 1, range: 2, leap: 2, taken: 4 }, armor: { taken: 5 } };   // beast.range는 무시된다(근접 사거리 강화 없음)
      const g1 = S.newGame(3, { start: { stat: up } }), u1 = g1.units[0], s1 = S.stats(u1);
      approx(s1.maxHp, ps.maxHp * (1 + 2 * SS.hp), 1e-9, '체력 강화');
      ok(u1.hp === s1.maxHp, '강화된 최대 체력으로 시작');
      approx(s1.dmg, ps.dmg * (1 + SS.dmg), 1e-9, '공격력 강화');
      approx(s1.cd, ps.cd / (1 + 3 * SS.cd), 1e-9, '간격 강화: 짧아진다');
      approx(s1.spd, ps.spd * (1 + SS.spd), 1e-9, '이속 강화');
      eq(s1.range, ps.range, '맹수(근접)에는 사거리 강화가 붙지 않는다');
      ok(!('range' in g1.statUp.beast) && !('range' in g1.statUp.armor) && g1.statUp.ranger.range === 0, '근접 종류의 강화 목록에는 사거리가 없다');
      approx(s1.skillCd, ps.skillCd / (1 + 2 * SS.leap), 1e-9, '맹수 도약 강화: 도약 간격이 짧아진다');
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
      // 종류별 강화 목록: 사수만 사거리, 맹수는 도약(skillCd), 갑주는 충격파(발동 횟수·피해)
      {
        const K = C.statKinds, SH = C.shock, MX = C.gold.statMax, still = { x: 0, y: 0 };
        ok(K.ranger.includes('range') && !K.beast.includes('range') && !K.armor.includes('range') && K.beast.includes('leap') && K.armor.includes('quake') && !K.ranger.includes('leap') && !K.ranger.includes('quake'), '종류별 강화 목록');
        ok(S.KINDS.every(k => K[k].length === 6 && K[k][5] === 'taken' && K[k].every(s => SS[s] > 0)), '목록은 종류마다 여섯 칸, 같은 자리');
        const bare = (stat, main) => { const g = S.newGame(3, { start: { stat } }); g.spawnT = 1e9; g.eliteIdx = 99; g.posts = []; g.enemies = []; const u = g.units[0]; u.main = main; u.up = g.statUp[main]; u.hp = S.stats(u).maxHp; return { g, u }; };
        const dummy = (x, y, elite) => ({ elite, arch: 'armor', g: 1, x, y, hp: 1e9, maxHp: 1e9, dmg: 0, r: 0.6, cd: 99, face: 0, stun: 1e9, bleed: 0, bleedT: 0 });
        approx(S.stats(bare({ ranger: { range: 3 } }, 'ranger').u).range, S.stats(bare({}, 'ranger').u).range * (1 + 3 * SS.range), 1e-9, '사수 사거리 강화는 그대로');
        // 맹수 도약: stats와 실제 도약 횟수
        const b0 = bare({}, 'beast'), b5 = bare({ beast: { leap: MX, range: MX } }, 'beast');
        approx(S.stats(b5.u).skillCd, Math.max(C.skillCdMin, S.stats(b0.u).skillCd / (1 + MX * SS.leap)), 1e-9, '맹수 도약 최대 강화');
        eq(S.stats(b5.u).range, S.stats(b0.u).range, '맹수에 넣은 사거리 단계는 무시');
        ok(S.stats(b5.u).skillCd < S.stats(b0.u).skillCd && S.stats(b5.u).skillCd >= C.skillCdMin, '도약 간격은 줄되 하한 밑으로는 안 간다');
        { const keep = SS.leap; SS.leap = 100; try { eq(S.stats(b5.u).skillCd, C.skillCdMin, '도약 간격 하한'); } finally { SS.leap = keep; } }
        const leaps = o => { const seen = new Set(); o.g.enemies.push(dummy(o.g.necro.x, o.g.necro.y - 3, true)); o.u.x = o.g.necro.x; o.u.y = o.g.necro.y + 1; for (let i = 0; i < 60 * 20; i++) { S.step(o.g, 1 / 60, still); for (const f of o.g.fx) if (f.k === 'leap') seen.add(f); } return seen.size; };
        const n0 = leaps(b0), n5 = leaps(b5);
        ok(n0 >= 4 && n5 > n0 + 1, '도약 강화가 실제 판의 도약 횟수를 늘린다 (20초 ' + n0 + ' → ' + n5 + ')');
        // 갑주 충격파: 발동 횟수와 피해
        eq(S.stats(bare({}, 'armor').u).quakeHits, SH.hits, '강화 없는 갑주는 ' + SH.hits + '번 맞아야 충격파');
        for (let lv = 0; lv <= MX; lv++) { const h = S.stats(bare({ armor: { quake: lv } }, 'armor').u).quakeHits; ok(h >= SH.minHits && h === Math.max(SH.minHits, SH.hits - Math.floor(lv / SH.every)), '충격파 발동 횟수 ' + lv + '단계: ' + h); }
        const lowHits = S.stats(bare({ armor: { quake: MX } }, 'armor').u).quakeHits;
        ok(lowHits < SH.hits, '최대 강화면 더 적게 맞아도 충격파');
        const wave = (lv, hits) => { const o = bare(lv ? { armor: { quake: lv } } : {}, 'armor'), e = dummy(o.u.x + 1.5, o.u.y, false); o.g.enemies.push(e); o.u.cd = 99; o.u.hitsTaken = hits; S.step(o.g, 1 / 60, still); return { fired: o.g.fx.some(f => f.k === 'wave'), left: o.u.hitsTaken, lost: 1e9 - e.hp }; };
        const w0 = wave(0, lowHits), w5 = wave(MX, lowHits);
        ok(!w0.fired && w0.left === lowHits && w0.lost === 0, '강화 없는 갑주는 ' + lowHits + '번 맞아서는 충격파가 없다');
        ok(w5.fired && w5.left === 0 && w5.lost > 0, '충격파 강화 갑주는 ' + lowHits + '번 맞으면 실제 판에서 충격파');
        const f0 = wave(0, SH.hits), f5 = wave(MX, SH.hits);
        ok(f0.fired && f5.fired, '4번 맞으면 둘 다 충격파');
        approx(f5.lost, f0.lost * (1 + MX * SS.quake), 1e-3, '충격파 강화는 충격파 피해를 늘린다');
        console.log('종류별 강화: 맹수 도약 20초 ' + n0 + '→' + n5 + '번, 갑주 충격파 ' + SH.hits + '→' + lowHits + '번 맞으면, 피해 x' + (f5.lost / f0.lost).toFixed(2));
      }
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
    // 예전 근접(맹수·갑주) 사거리 강화: 그 단계에 쓴 골드를 돌려주고 칸을 지운다. 사수 사거리는 그대로
    {
      const old = { v: 1, best: 2, cur: 2, gold: 1, up: { hp: 1, stat: { beast: { hp: 2, range: 3 }, armor: { range: 2, taken: 1 }, ranger: { range: 4 } } } };
      const l1 = V.load(JSON.stringify(old), null);
      eq(l1.gold, 1 + 5 * G.rangeRefund, '근접 사거리 5단계(맹수 3 + 갑주 2)를 예전 고정 가격으로 돌려준다');
      ok(!('range' in l1.up.stat.beast) && !('range' in l1.up.stat.armor) && l1.up.stat.ranger.range === 4 && l1.up.stat.beast.hp === 2 && l1.up.stat.armor.taken === 1 && l1.up.hp === 1 && l1.up.stat.beast.leap === 0 && l1.up.stat.armor.quake === 0 && l1.best === 2 && l1.cur === 2, '근접 사거리 칸만 지우고 나머지는 그대로');
      eq(V.load(JSON.stringify(l1), null).gold, l1.gold, '돌려준 저장을 다시 읽어도 두 번 돌려주지 않는다(근접 사거리)');
      const b1 = V.buy(V.earn(l1, 2).save, 'beast.leap');
      ok(b1.ok && b1.save.up.stat.beast.leap === 1, '맹수 도약 강화를 산다');
      const l2 = V.load(JSON.stringify(b1.save), null);
      ok(l2.gold === l1.gold + 2 * G.perPost - G.statCost[0] && l2.up.stat.beast.leap === 1, '벌고 사서 다시 저장·읽어도 환불이 되풀이되지 않는다');
      eq(V.load(JSON.stringify({ v: 1, best: 0, gold: 0, up: { stat: { beast: { range: 99 }, armor: { range: 'x' } } } }), null).gold, G.statMax * G.rangeRefund, '돌려주는 골드는 강화 상한까지만');
      eq(V.load(JSON.stringify({ v: 1, best: 0, gold: 0, up: { genes: 2, stat: { armor: { range: 1 } } } }), null).gold, 2 * G.geneRefund + G.rangeRefund, '유전자 환불과 근접 사거리 환불은 함께');
      for (const bad of ['beast.range', 'armor.range', 'ranger.leap', 'ranger.quake', 'beast.quake', 'armor.leap']) ok(V.cost(V.fresh(), bad) === null && !V.buy({ v: 1, best: 0, gold: 99, up: {} }, bad).ok, '그 종류에 없는 강화는 못 산다: ' + bad);
      for (const good of ['ranger.range', 'beast.leap', 'armor.quake']) ok(V.buy({ v: 1, best: 0, gold: 99, up: {} }, good).ok, '그 종류의 강화는 산다: ' + good);
    }
    b0 = V.buy({ v: 1, best: 2, gold: G.hpCost[0], up: { hp: 0 } }, 'hp');
    ok(b0.ok && b0.save.gold === 0 && b0.save.up.hp === 1 && b0.save.up.stat.beast.hp === 0, '체력을 사면 골드가 줄고 체력 단계만 오른다');
    ok(!V.buy({ v: 1, best: 9, gold: 99, up: { hp: G.hpMax } }, 'hp').ok, '체력 강화 상한');
    for (const bad of ['nope', 'beast', 'beast.nope', 'nope.hp', '__proto__.hp', 'beast.__proto__', 'beast.toString', 'genes'])
      ok(!V.buy({ v: 1, best: 9, gold: 99, up: {} }, bad).ok && V.cost({ v: 1, best: 9, gold: 99, up: {} }, bad) === null, '모르는 강화는 못 산다: ' + bad);
    { const s0 = { v: 1, best: 2, gold: G.statCost[2] * 2, up: { hp: 1, stat: { armor: { taken: 2 } } } };
      const r1 = V.buy(s0, 'armor.taken');
      ok(r1.ok && r1.save.gold === G.statCost[2] && r1.save.up.stat.armor.taken === 3 && r1.save.up.hp === 1 && s0.up.stat.armor.taken === 2, '능력치를 사면 그 칸만 오르고, 원래 저장은 그대로');
      ok(V.level(r1.save, 'armor.taken') === 3 && V.level(r1.save, 'ranger.taken') === 0, '단계는 종류마다 따로');
      const top = { v: 1, best: 2, gold: 99, up: { stat: { ranger: { range: G.statMax } } } };
      ok(!V.buy(top, 'ranger.range').ok && V.cost(top, 'ranger.range') === null && V.buy(top, 'ranger.dmg').ok, '능력치 상한은 칸마다');
      ok(!V.buy({ v: 1, best: 2, gold: G.statCost[0] - 1, up: {} }, 'beast.dmg').ok, '골드가 모자라면 능력치를 못 산다'); }
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
    // 돌격조·대장 처치 골드: 돌격조 하나에 perElite(기본 1), 대장에 perBoss(기본 2). 새 저장 필드는 없다
    { eq(G.perElite, 1, '돌격조 처치 골드 기본값'); eq(G.perBoss, 2, '대장 처치 골드 기본값');
      const s0 = { v: 1, best: 2, cur: 2, gold: 1, up: { hp: 1 } }, e = V.earn(s0, 2, 3, true);
      eq(e.gained, 2 * G.perPost + 3 * G.perElite + G.perBoss, '초소 2·돌격조 3·대장: 골드 합');
      eq(e.save.gold, 1 + e.gained, '받은 골드가 저장에 더해진다');
      ok(e.save.cur === 2 && e.save.best === 2 && e.save.up.hp === 1 && s0.gold === 1, '진행·기록·강화는 그대로, 원래 저장은 안 바뀜');
      eq(JSON.stringify(Object.keys(e.save).sort()), JSON.stringify(['best', 'cur', 'gold', 'seed', 'up', 'v']), '저장 모양: 돌격조·대장 골드로 생긴 새 필드는 없다(seed는 변이 씨앗)');
      eq(V.earn(s0, 2).gained, 2 * G.perPost, '새 인자를 빼면 예전처럼 초소 골드만');
      eq(V.earn(s0, 0, 4).gained, 4 * G.perElite, '돌격조만 잡아도 골드');
      eq(V.earn(s0, 0, 0, true).gained, G.perBoss, '대장만 잡아도 골드');
      ok(V.earn(s0, 0, 0, false).save === s0 && V.earn(s0, 0, 'x').gained === 0 && V.earn(s0, 0, -3).gained === 0 && V.earn(s0, 0, 0, 'yes').gained === 0, '돌격조 0·이상한 값·대장 아님: 골드 없음');
      // 첫 정복과 함께: earn 뒤 clear가 perClear를 더한다(끝 화면의 '(+받은 골드)'와 같은 순서)
      const f = V.fresh(), a = V.earn(f, 3, 2, true), c = V.clear(a.save, 1);
      eq(a.gained + c.gained, 3 * G.perPost + 2 * G.perElite + G.perBoss + G.perClear, '1구역 첫 정복: 초소·돌격조·대장·정복 골드 합');
      eq(c.save.gold, a.gained + c.gained, '첫 정복 판의 골드가 모두 저장된다');
      const again = V.clear(V.earn(c.save, 3, 2, true).save, 1);
      eq(again.save.gold - c.save.gold, 3 * G.perPost + 2 * G.perElite + G.perBoss, '이미 깬 구역: 정복 골드 없이 초소·돌격조·대장 골드만');
      // 대장을 잡으면 g.boss.dead이고 돌격조 처치 수에도 하나 들어간다(끝 화면은 그 하나를 빼고 넘긴다)
      const gb = fresh(), boss = S.spawnBoss(gb); boss.mode = 'chase'; boss.stun = 99; boss.hp = 0.5; boss.bleed = 100; boss.bleedT = 1;
      S.step(gb, 1 / 60, { x: 0, y: 0 });
      ok(boss.dead && gb.boss === boss && gb.over === 'win' && gb.eliteKills === 1, '대장 처치: g.boss.dead, 승리, eliteKills 1');
      const bk = !!(gb.boss && gb.boss.dead);
      eq(V.earn(V.fresh(), gb.postsDown, gb.eliteKills - (bk ? 1 : 0), bk).gained, G.perBoss, '대장만 잡은 판: 대장 골드가 한 번만'); }
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
    let b = V.buy({ v: 1, best: 2, gold: G.statCost[0] - 1, up: {} }, 'beast.hp');
    ok(!b.ok && b.reason === 'gold' && b.save.gold === G.statCost[0] - 1, '골드가 모자라면 못 산다');
    b = V.buy({ v: 1, best: 2, gold: G.statCost[0] + 1, up: {} }, 'beast.hp');
    ok(b.ok && b.save.gold === 1 && b.save.up.stat.beast.hp === 1 && b.save.best === 2, '사면 골드가 줄고 단계가 오른다');
    b = V.buy({ v: 1, best: 9, gold: 999, up: { stat: { beast: { hp: G.statMax } } } }, 'beast.hp');
    ok(!b.ok && b.reason === 'max', '상한이면 못 산다');
    // ---- 단계별 누진 가격표: Save.cost는 지금 단계의 표 값, 최고 단계에서 null, buy는 그 값만큼 정확히 뺀다 ----
    {
      const ST = G.statCost, HT = G.hpCost, sum = t => t.reduce((a, c) => a + c, 0);
      eq(JSON.stringify(ST), JSON.stringify([2, 3, 4, 5, 6]), '능력치 가격표(0~4단계)');
      ok(ST.length === G.statMax && ST.every((c, i) => Number.isInteger(c) && c > 0 && (i === 0 || c > ST[i - 1])), '능력치 가격표: 단계마다 하나, 오를수록 비싸다');
      ok(Array.isArray(HT) && HT.length === G.hpMax && HT.every((c, i) => Number.isInteger(c) && c > 0 && (i === 0 || c >= HT[i - 1])), '체력 가격표: 단계마다 하나, 내려가지 않는다: ' + JSON.stringify(HT));
      ok(ST[0] < 3 && HT[0] < 3, '첫 단계는 예전 고정 가격(3)보다 싸다');
      for (const key of ['beast.hp', 'beast.dmg', 'armor.taken', 'ranger.range', 'beast.leap', 'armor.quake']) {
        const [k, s] = key.split('.');
        for (let lv = 0; lv <= G.statMax; lv++) eq(V.cost({ v: 1, best: 1, cur: 1, gold: 99, up: { stat: { [k]: { [s]: lv } } } }, key), lv < G.statMax ? ST[lv] : null, key + ' ' + lv + '단계 가격');
        let cur = { v: 1, best: 1, cur: 1, gold: sum(ST), up: {} };
        for (let lv = 0; lv < G.statMax; lv++) {
          const r = V.buy(cur, key);
          ok(r.ok && r.save.gold === cur.gold - ST[lv] && V.level(r.save, key) === lv + 1, key + ' ' + lv + '→' + (lv + 1) + '단계 구매는 ' + ST[lv] + '골드를 뺀다');
          cur = r.save;
        }
        ok(cur.gold === 0 && V.cost(cur, key) === null && V.buy(Object.assign({}, cur, { gold: 99 }), key).reason === 'max', key + ': 표 합계로 최고 단계까지 사고, 최고 단계에서는 null');
      }
      const lv3 = { v: 1, best: 1, cur: 1, gold: ST[3] - 1, up: { stat: { beast: { dmg: 3 } } } }, r3 = V.buy(lv3, 'beast.dmg');
      ok(!r3.ok && r3.reason === 'gold' && r3.save === lv3, '3단계 가격보다 1 모자라면 못 산다');
      ok(V.buy(Object.assign({}, lv3, { gold: ST[3] }), 'beast.dmg').save.gold === 0, '3단계 가격이면 정확히 0이 남는다');
      for (let lv = 0; lv <= G.hpMax; lv++) eq(V.cost({ v: 1, best: 1, gold: 99, up: { hp: lv } }, 'hp'), lv < G.hpMax ? HT[lv] : null, '체력 ' + lv + '단계 가격');
      let h = { v: 1, best: 1, cur: 1, gold: sum(HT), up: {} };
      for (let lv = 0; lv < G.hpMax; lv++) { const r = V.buy(h, 'hp'); ok(r.ok && r.save.gold === h.gold - HT[lv] && r.save.up.hp === lv + 1, '체력 ' + lv + '단계 구매는 ' + HT[lv] + '골드'); h = r.save; }
      ok(h.gold === 0 && V.cost(h, 'hp') === null, '체력 최고 단계에서는 null');
      // 예전 저장(단계만 저장됨): 그대로 읽히고, 다음 가격은 저장된 단계에서 나온다
      const old = V.load(JSON.stringify({ v: 1, best: 3, cur: 3, gold: 10, up: { hp: 4, stat: { beast: { hp: 2 }, armor: { taken: 5 } } } }), null);
      ok(old.gold === 10 && old.up.hp === 4 && old.up.stat.beast.hp === 2 && old.up.stat.armor.taken === 5, '예전 저장의 골드·단계는 그대로');
      ok(V.cost(old, 'beast.hp') === ST[2] && V.cost(old, 'armor.taken') === null && V.cost(old, 'hp') === HT[4] && V.cost(old, 'ranger.dmg') === ST[0], '예전 저장의 다음 가격은 저장된 단계의 표 값');
      eq(V.cost(V.fresh(), 'seed'), G.seedCost, '변이 씨앗은 고정 가격 그대로');
      console.log('누진 가격표: 능력치 ' + JSON.stringify(ST) + ' (합 ' + sum(ST) + '), 체력 ' + JSON.stringify(HT) + ' (합 ' + sum(HT) + ')');
    }
    // ---- 변이 씨앗: 3~5골드 고정 가격, 한 개까지, 판 시작 때 써서 변이 3지선다 한 번 ----
    {
      const SC = G.seedCost;
      ok(Number.isInteger(SC) && SC >= 3 && SC <= 5 && G.seedMax === 1, '씨앗 가격 3~5골드, 최대 1개: ' + SC + ' / ' + G.seedMax);
      // (3) 씨앗 필드가 없는 옛 저장: 씨앗 0, 강화·골드는 그대로
      const old = V.load(JSON.stringify({ v: 1, best: 2, cur: 2, gold: 7, up: { hp: 2, stat: { beast: { hp: 3 }, armor: { taken: 1 } } } }), null);
      ok(old.seed === 0 && old.gold === 7 && old.up.hp === 2 && old.up.stat.beast.hp === 3 && old.up.stat.armor.taken === 1 && old.best === 2 && old.cur === 2, '옛 저장(씨앗 없음): 씨앗 0, 골드·강화·진행 그대로: ' + JSON.stringify(old));
      ok(V.fresh().seed === 0 && V.load(null, null).seed === 0 && V.load(null, '2').seed === 0 && V.load('{x', null).seed === 0, '새 저장·옛 기록·깨진 저장: 씨앗 0');
      eq(V.load(JSON.stringify({ v: 1, best: 0, gold: 0, up: {}, seed: 99 }), null).seed, 1, '씨앗 수는 최대 1까지');
      eq(V.load(JSON.stringify({ v: 1, best: 0, gold: 0, up: {}, seed: 'x' }), null).seed, 0, '이상한 씨앗 값은 0');
      // (1) 구매: 골드 차감, 씨앗 1, 중복·부족 거부
      const s0 = { v: 1, best: 1, cur: 1, gold: SC + 2, up: { hp: 1 } };
      ok(V.cost(s0, 'seed') === SC && V.level(s0, 'seed') === 0, '씨앗 가격과 보유 수');
      const b1 = V.buy(s0, 'seed');
      ok(b1.ok && b1.save.gold === 2 && b1.save.seed === 1 && b1.save.up.hp === 1 && b1.save.best === 1 && b1.save.cur === 1 && s0.seed === undefined && s0.gold === SC + 2, '씨앗 구매: 골드가 가격만큼 줄고 씨앗 1, 원래 저장은 그대로');
      const b2 = V.buy(Object.assign({}, b1.save, { gold: 99 }), 'seed');
      ok(!b2.ok && b2.reason === 'max' && b2.save.seed === 1 && b2.save.gold === 99 && V.cost(b1.save, 'seed') === null, '이미 하나 있으면 또 못 산다');
      const b3 = V.buy({ v: 1, best: 0, gold: SC - 1, up: {} }, 'seed');
      ok(!b3.ok && b3.reason === 'gold' && b3.save.gold === SC - 1 && !b3.save.seed, '골드가 모자라면 씨앗을 못 산다');
      let k = V.earn(b1.save, 2).save; k = V.clear(k, 2).save; k = V.restart(k);
      const kb = V.buy(k, 'beast.hp');
      ok(kb.ok && kb.save.seed === 1 && V.load(JSON.stringify(kb.save), null).seed === 1, '벌기·정복·되돌리기·강화 구매·저장 읽기를 지나도 씨앗은 남는다');
      // (2) 판 시작: 씨앗을 쓰고(0, 저장 반영) g.choice 3장
      const u1 = V.useSeed(b1.save);
      ok(u1.ok && u1.save.seed === 0 && u1.save.gold === b1.save.gold && u1.save.up.hp === 1 && b1.save.seed === 1 && V.load(JSON.stringify(u1.save), null).seed === 0, '판 시작에 씨앗을 쓰면 0(다시 읽어도 0)');
      const u0 = V.useSeed(u1.save);
      ok(!u0.ok && u0.save === u1.save, '씨앗이 없으면 쓰지 않는다');
      ok(V.buy(Object.assign({}, u1.save, { gold: SC }), 'seed').ok, '쓴 뒤에는 다시 살 수 있다');
      const gs = S.newGame(7, { district: 2, start: { hp: 1 }, mutSeed: u1.ok });
      ok(Array.isArray(gs.choice) && gs.choice.length === 3 && new Set(gs.choice).size === 3 && gs.choice.every(id => S.MUTS[id]) && gs.choiceQ === 0 && gs.events.includes('choice'), '씨앗으로 시작한 판: 변이 카드 셋이 열린다: ' + JSON.stringify(gs.choice));
      const t0 = gs.t, x0 = gs.necro.x;
      S.step(gs, 0.1, { x: 1, y: 0 });
      ok(gs.t === t0 && gs.necro.x === x0 && !S.detonate(gs), '고르는 동안 판이 멈춘다');
      const pick = gs.choice[1];
      ok(!S.chooseMut(gs, 'nope') && S.chooseMut(gs, pick) && gs.choice === null && gs.muts[pick] === 1 && gs.events.includes('mutpick'), '변이 하나를 고르고 시작한다');
      S.step(gs, 0.1, { x: 0, y: 0 });
      ok(gs.t > t0, '고른 뒤 판이 간다');
      const gn = S.newGame(7, { district: 2, start: { hp: 1 } }), gf = S.newGame(7, { district: 2, start: { hp: 1 }, mutSeed: V.useSeed(V.fresh()).ok }), gs2 = S.newGame(7, { district: 2, start: { hp: 1 }, mutSeed: true });
      ok(gn.choice === null && gn.choiceQ === 0 && !Object.keys(gn.muts).length && gf.choice === null && gf.choiceQ === 0, '씨앗이 없으면 예전 시작 그대로(카드 없음)');
      const lay = gg => JSON.stringify([gg.enemies.map(e => [e.x, e.y, e.arch]), gg.posts.map(p => [p.x, p.y]), gg.units.length, gg.necro.maxHp]);
      eq(lay(gs2), lay(gn), '씨앗은 판의 배치를 바꾸지 않는다');
      eq(JSON.stringify(S.newGame(7, { district: 2, mutSeed: true }).choice), JSON.stringify(gs2.choice), '같은 시드면 같은 씨앗 카드');
      console.log('변이 씨앗: ' + SC + '골드, 최대 1개, 옛 저장 씨앗 0, 판 시작에 써서 카드 ' + gs2.choice.join('/'));
      // ---- 처음 정복 보상 씨앗: clearDistrict가 gained > 0일 때만 씨앗 하나(seedMax까지) ----
      {
        eq(G.seedPerClear, 1, '처음 정복 씨앗 기본값 1');
        const c1 = V.clear({ v: 1, best: 1, cur: 1, gold: 0, up: { hp: 1 }, seed: 0 }, 2);
        ok(c1.gained === G.perClear && c1.save.seed === 1 && c1.seedGained === true && c1.save.best === 2 && c1.save.gold === G.perClear && c1.save.up.hp === 1, '(1) 씨앗 0으로 처음 정복: 씨앗 1, 획득 기록: ' + JSON.stringify(c1));
        ok(V.load(JSON.stringify(c1.save), null).seed === 1 && V.useSeed(c1.save).ok, '(1) 받은 씨앗은 저장되고 다음 판에 쓴다');
        eq(JSON.stringify(Object.keys(c1.save).sort()), JSON.stringify(['best', 'cur', 'gold', 'seed', 'up', 'v']), '처음 정복 씨앗: 새 저장 필드 없음');
        const c2 = V.clear({ v: 1, best: 1, cur: 1, gold: 0, up: {}, seed: 1 }, 2);
        ok(c2.gained === G.perClear && c2.save.seed === 1 && c2.seedGained === false && c2.save.gold === G.perClear, '(2) 씨앗 1로 처음 정복: 1 유지, 획득 표시 없음, 골드 대체 없음: ' + JSON.stringify(c2));
        const c3 = V.clear({ v: 1, best: 2, cur: 0, gold: 0, up: {}, seed: 0 }, 1), c4 = V.clear({ v: 1, best: 2, cur: 2, gold: 0, up: {}, seed: 0 }, 2);
        ok(c3.gained === 0 && c3.save.seed === 0 && c3.seedGained === false && c3.save.cur === 1, '(3) 되돌린 뒤 이미 깬 구역 정복: 씨앗 그대로 0: ' + JSON.stringify(c3));
        ok(c4.gained === 0 && c4.save.seed === 0 && c4.seedGained === false, '(3) 이미 깬 구역을 다시 이김: 씨앗 그대로 0');
        const c5 = V.clear(V.fresh(), 'x');
        ok(c5.save.seed === 0 && c5.seedGained === false, '이상한 구역 번호: 씨앗 없음');
        const c6 = V.clear({ v: 1, best: 0, cur: 0, gold: 0, up: {}, seed: 0 }, 3);
        eq(c6.save.seed, 1, '여러 구역을 한 번에 넘어도 씨앗은 seedMax까지');
      }
    }
  }
  console.log('규칙 확인: 골드(처음 정복만), 소환수 능력치·네크로맨서 체력 강화, 예전 유전자 강화 환불, 저장 읽기·소급·깨진 저장, 구매');
  console.log('규칙 확인: 되살리기, 흡수와 불안정도, 과부하, 탈피 폭발, 심장 계승, 수동 자폭, 연결, 돌격조와 갑주 방어, 종류별 특수 폭발(집속탄·소용돌이·방벽), 초소 변이 3지선다(멈춤·결정론·연쇄 한 번·카드 11종, 5구역 6번 고르기), 수비대·무리·어그로 분리·호위·처치 수, 평타 타격감');
}

// ---- 결과 화면 데이터: 항목별 보상(Save.settle)과 진행 요약(runSummary). 경제 규칙은 그대로(earn→clear와 같은 값) ----
{
  const V = S.Save, G = C.gold, sumGold = r => r.items.reduce((a, it) => a + it.gold, 0);
  const ids = r => r.items.map(it => it.id).join(',');
  // 끝 화면(render.js)이 지금 하는 그대로: earn(대장은 돌격조 수에서 뺀다) 뒤 이기면 clear
  const legacy = (sv, gg) => {
    const bk = !!(gg.boss && gg.boss.dead), e = V.earn(sv, gg.postsDown, gg.eliteKills - (bk ? 1 : 0), bk);
    let s = e.save, gained = e.gained, seed = false;
    if (gg.over === 'win') { const r = V.clear(s, gg.district); s = r.save; gained += r.gained; seed = !!r.seedGained; }
    return { save: s, gained, seed };
  };
  const breakAll = gg => { for (const p of gg.posts) p.dead = true; gg.postsDown = gg.postsTotal; };
  const check = (sv, gg, tag) => {
    const before = JSON.stringify(sv), run = S.runSummary(gg), r = V.settle(sv, run), L = legacy(sv, gg);
    eq(ids(r), 'posts,elites,boss,clear,seed', tag + ': 항목 순서');
    eq(r.gained, L.gained, tag + ': settle의 gained = 예전 earn+clear');
    eq(sumGold(r), r.gained, tag + ': 항목 골드 합 = gained');
    eq(JSON.stringify(r.save), JSON.stringify(L.save), tag + ': 저장 결과가 예전 흐름과 같다');
    eq(r.save.gold - (+sv.gold || 0), r.gained, tag + ': 저장에 반영된 골드 = gained');
    eq(r.seedGained, L.seed, tag + ': 씨앗 획득이 예전과 같다');
    eq(JSON.stringify(Object.keys(r.save).sort()), JSON.stringify(['best', 'cur', 'gold', 'seed', 'up', 'v']), tag + ': 저장 모양 그대로');
    eq(JSON.stringify(sv), before, tag + ': 원래 저장은 안 바뀐다');
    eq(JSON.stringify(V.settle(sv, gg)), JSON.stringify(r), tag + ': 판(g)을 그대로 넘겨도 같다');
    return { run, r };
  };
  const item = (r, id) => r.items.find(it => it.id === id);
  // (1) 첫 정복: 초소 다 부수고 돌격조 2, 대장 처치
  const g1 = S.newGame(11, { district: 1 });
  breakAll(g1); g1.eliteKills = 2;
  const b1 = S.spawnBoss(g1); b1.mode = 'chase'; b1.stun = 99; b1.hp = 0.5; b1.bleed = 100; b1.bleedT = 1;
  S.step(g1, 1 / 60, { x: 0, y: 0 });
  ok(g1.over === 'win' && b1.dead && g1.eliteKills === 3, '첫 정복 판 준비: 승리, 대장 처치');
  const f = check(V.fresh(), g1, '첫 정복');
  ok(f.run.won && !f.run.lost && f.run.bossReached && f.run.bossKilled && f.run.bossHp === 0 && f.run.eliteKills === 2 && f.run.postsDown === g1.postsTotal && f.run.postsLeft === 0, '첫 정복 요약: ' + JSON.stringify(f.run));
  eq(item(f.r, 'posts').gold, g1.postsTotal * G.perPost, '첫 정복: 초소 골드'); eq(item(f.r, 'elites').gold, 2 * G.perElite, '첫 정복: 돌격조 골드');
  eq(item(f.r, 'boss').gold, G.perBoss, '첫 정복: 대장 골드'); eq(item(f.r, 'clear').gold, G.perClear, '첫 정복: 덤');
  ok(f.r.firstClear && f.r.seedGained && item(f.r, 'seed').count === 1 && item(f.r, 'seed').gold === 0, '첫 정복: 변이 씨앗 1');
  // (2) 재정복: 같은 구역을 다시 이김 -> 덤·씨앗 없이 초소·돌격조·대장만
  const again = check(f.r.save, g1, '재정복');
  ok(!again.r.firstClear && item(again.r, 'clear').gold === 0 && item(again.r, 'seed').count === 0 && !again.r.seedGained && again.r.gained === g1.postsTotal * G.perPost + 2 * G.perElite + G.perBoss, '재정복: 덤 없음');
  // 씨앗을 이미 가진 첫 정복: 덤 골드는 받고 씨앗은 0개
  const full = check({ v: 1, best: 0, cur: 0, gold: 0, up: {}, seed: 1 }, g1, '씨앗 가득 첫 정복');
  ok(full.r.firstClear && item(full.r, 'seed').count === 0 && !full.r.seedGained, '씨앗이 차 있으면 씨앗 항목 0');
  // (3) 대장 전 패배: 초소 하나만 부수고 쓰러짐
  const g2 = S.newGame(12, { district: 2 });
  g2.posts[0].dead = true; g2.postsDown = 1; g2.necro.hp = 0;
  S.step(g2, 1 / 60, { x: 0, y: 0 });
  ok(g2.over === 'lose' && !g2.boss, '초소 단계 패배 준비');
  const l = check({ v: 1, best: 1, cur: 1, gold: 5, up: { hp: 1 }, seed: 0 }, g2, '초소 단계 패배');
  ok(l.run.lost && !l.run.won && l.run.postsDown === 1 && l.run.postsTotal === g2.postsTotal && l.run.postsLeft === g2.postsTotal - 1 && !l.run.bossReached && !l.run.bossKilled && l.run.bossHp === null && l.run.bossMaxHp === null && l.run.bossHpFrac === null, '초소 단계 패배 요약: ' + JSON.stringify(l.run));
  ok(l.r.gained === G.perPost && item(l.r, 'clear').gold === 0 && item(l.r, 'boss').gold === 0 && !l.r.won, '초소 단계 패배: 초소 골드만');
  // (4) 대장전 패배: 대장 체력을 일부 남기고 쓰러짐
  const g3 = S.newGame(13, { district: 1 });
  breakAll(g3); g3.eliteKills = 1;
  const b3 = S.spawnBoss(g3); b3.stun = 99; b3.hp = b3.maxHp * 0.4 + 0.3; g3.necro.hp = 0;
  S.step(g3, 1 / 60, { x: 0, y: 0 });
  ok(g3.over === 'lose' && !b3.dead, '대장전 패배 준비');
  const lb = check(V.fresh(), g3, '대장전 패배');
  ok(lb.run.lost && lb.run.bossReached && !lb.run.bossKilled && lb.run.bossHp === Math.ceil(b3.hp) && lb.run.bossMaxHp === Math.round(b3.maxHp) && lb.run.eliteKills === 1 && lb.run.postsLeft === 0, '대장전 패배 요약: ' + JSON.stringify(lb.run));
  approx(lb.run.bossHpFrac, lb.run.bossHp / lb.run.bossMaxHp, 1e-12, '대장 체력 비율');
  ok(lb.run.bossHp > 0 && lb.run.bossHp < lb.run.bossMaxHp, '대장 잔여 체력은 0과 최대 사이');
  ok(lb.r.gained === g3.postsTotal * G.perPost + G.perElite && item(lb.r, 'clear').gold === 0 && item(lb.r, 'boss').gold === 0 && item(lb.r, 'seed').count === 0, '대장전 패배: 정복 덤·대장 골드 없음');
  // 이상한 입력: 골드 0, 저장 그대로
  const z = V.fresh(), zr = V.settle(z, null);
  ok(zr.save === z && zr.gained === 0 && sumGold(zr) === 0, '빈 판 정보: 골드 없음');
  eq(JSON.stringify(V.earnParts(3, 2, true)), JSON.stringify({ posts: { count: 3, gold: 3 * G.perPost }, elites: { count: 2, gold: 2 * G.perElite }, boss: { killed: true, gold: G.perBoss } }), 'earnParts 모양');
  console.log('결과 화면 데이터: 첫 정복·재정복·초소 단계 패배·대장전 패배에서 항목 합 = gained, 진행 요약 확인');
}

// ---- 시작 소환수 종류(opts.starter) ----
{
  const lay = gg => JSON.stringify([gg.enemies.map(e => [e.x, e.y, e.arch]), gg.posts.map(p => [p.x, p.y]), gg.obstacles, gg.necro.maxHp]);
  const g0 = S.newGame(5), gNo = S.newGame(5, {});
  eq(g0.units.length, 1, '시작 소환수는 하나');
  eq(g0.units[0].main, 'beast', 'starter를 빼면 맹수로 시작');
  eq(gNo.units[0].main, 'beast', 'opts에 starter가 없으면 맹수로 시작');
  eq(g0.starter, 'beast', '기본 시작 종류 기록은 beast');
  for (const k of S.KINDS) {
    const g = S.newGame(5, { starter: k }), u = g.units[0];
    eq(g.units.length, 1, k + ' 시작: 소환수 하나');
    eq(u.main, k, k + ' 시작: 주 유전자');
    eq(g.starter, k, k + ' 시작: 시작 종류 기록');
    eq(S.geneTotal(u), 1, k + ' 시작: 유전자 1개');
    eq(u.genes[k], 1, k + ' 시작: 그 종류 유전자 1개');
    eq(u.inst, 0, k + ' 시작: 불안정도 0');
    approx(u.hp, S.stats(u).maxHp, 1e-9, k + ' 시작: 체력 가득');
    eq(lay(g), lay(g0), k + ' 시작: 판 배치는 시작 종류와 상관없다');
  }
  for (const bad of ['dragon', '', null, 3, 'Beast', 'constructor', {}]) {
    const g = S.newGame(5, { starter: bad });
    ok(g.units[0].main === 'beast' && g.starter === 'beast' && g.units[0].genes.beast === 1, '잘못된 starter(' + JSON.stringify(bad) + ')는 맹수로 폴백');
  }
  // 시작 종류의 골드 강화(statKinds)가 붙고, 다른 종류의 강화는 붙지 않는다
  const st = { stat: { armor: { hp: 2 }, ranger: { range: 3 }, beast: { dmg: 4 } } };
  const ga = S.newGame(5, { starter: 'armor', start: st }), ga0 = S.newGame(5, { starter: 'armor' });
  eq(ga.units[0].up.hp, 2, '갑주 시작: 갑주 체력 강화가 붙는다');
  approx(S.stats(ga.units[0]).maxHp, S.stats(ga0.units[0]).maxHp * (1 + C.statStep.hp * 2), 1e-9, '갑주 시작: 강화한 체력');
  approx(S.stats(ga.units[0]).dmg, S.stats(ga0.units[0]).dmg, 1e-9, '갑주 시작: 맹수 공격력 강화는 붙지 않는다');
  const gr = S.newGame(5, { starter: 'ranger', start: st }), gr0 = S.newGame(5, { starter: 'ranger' });
  approx(S.stats(gr.units[0]).range, S.stats(gr0.units[0]).range * (1 + C.statStep.range * 3), 1e-9, '사수 시작: 사거리 강화가 붙는다');
  const gb = S.newGame(5, { start: st }), gb0 = S.newGame(5);
  approx(S.stats(gb.units[0]).dmg, S.stats(gb0.units[0]).dmg * (1 + C.statStep.dmg * 4), 1e-9, '맹수 시작(기본): 맹수 공격력 강화가 붙는다');
  // 시작 종류가 달라도 판이 문제없이 돈다
  for (const k of S.KINDS) {
    const g = S.newGame(11, { starter: k, district: 2 });
    for (let i = 0; i < 300 && !g.over; i++) S.step(g, 0.05, { x: 0, y: 0 });
    ok(Number.isFinite(g.necro.hp) && g.units.every(u => Number.isFinite(u.hp) && Number.isFinite(u.x)), k + ' 시작: 판이 NaN 없이 돈다');
  }
  console.log('규칙 확인: 시작 소환수 종류(맹수·갑주·사수, 기본·잘못된 값은 맹수, 종류별 강화 연동)');
}

// ---- 소환 초소(2구역부터 초소 하나가 사격 범위 안의 네크로맨서에게 1등급 escort를 부른다) ----
{
  const still = { x: 0, y: 0 }, PS = C.postSummon, ER = C.eliteRanger;
  ok(PS && PS.every === ER.every && PS.n === ER.n, '소환 초소 설정은 사수 돌격조 기준(every, n)');
  eq(S.newGame(3, { district: 1 }).posts.filter(p => p.summon).length, 0, '1구역에는 소환 초소가 없다');
  for (const d of [2, 3, 4, 5, 6]) {
    const ps = S.newGame(3, { district: d }).posts.filter(p => p.summon);
    eq(ps.length, 1, d + '구역: 소환 초소는 정확히 하나');
    ok(ps[0].summon === PS && ps[0].summonT === PS.every, d + '구역: 소환 초소 타이머는 every로 시작');
  }
  const setup = () => { const g = S.newGame(3, { district: 2 }); g.spawnT = 1e9; g.eliteIdx = 99; g.enemies = []; g.units = []; g.obstacles = []; g.necro.hp = g.necro.maxHp = 1e9; return { g, p: g.posts.find(q => q.summon) }; };
  const escorts = g => g.enemies.filter(e => e.escort && !e.dead).length;
  const run = (g, secs) => { for (let i = 0; i < Math.round(60 * secs); i++) S.step(g, 1 / 60, still); };
  const inRange = (g, p) => { g.necro.x = p.x; g.necro.y = Math.min(S.H - 0.6, p.y + 2); ok(Math.hypot(p.x - g.necro.x, p.y - g.necro.y) < C.postRange, '네크로맨서가 소환 초소 사격 범위 안'); };
  // 사격 범위 밖: 소환하지 않고 타이머도 돌지 않는다
  { const { g, p } = setup(); ok(Math.hypot(p.x - g.necro.x, p.y - g.necro.y) > C.postRange, '시작 지점은 소환 초소 범위 밖'); run(g, PS.every + 1); eq(escorts(g), 0, '범위 밖에서는 소환하지 않는다'); eq(p.summonT, PS.every, '범위 밖에서는 타이머가 돌지 않는다'); }
  // 범위 안: every초마다 n마리 escort, 초소 사격은 그대로. 파괴되면 더는 늘지 않는다
  {
    const { g, p } = setup(); inRange(g, p);
    run(g, PS.every + 0.5);
    eq(escorts(g), PS.n, '범위 안 every초 뒤 escort ' + PS.n + '마리');
    ok(g.enemies.every(e => e.escort && e.g === 1 && !e.elite), '소환된 것은 1등급 escort');
    ok(g.necro.hp < g.necro.maxHp, '소환 초소도 예전처럼 네크로맨서를 쏜다');
    run(g, PS.every);
    eq(escorts(g), 2 * PS.n, '한 번 더 every초 뒤 escort가 또 는다');
    p.dead = true;
    const k = escorts(g);
    run(g, PS.every * 2 + 1);
    eq(escorts(g), k, '소환 초소가 부서진 뒤에는 escort가 늘지 않는다');
  }
  // foeCap 상한을 넘지 않는다
  {
    const { g, p } = setup(); inRange(g, p);
    for (let i = 0; i < C.foeCap; i++) g.enemies.push({ elite: false, arch: 'armor', g: 1, x: 2 + (i % 12), y: 24 + Math.floor(i / 12) * 0.9, hp: 1e9, maxHp: 1e9, dmg: 0, r: 0.4, cd: 9, face: 0, stun: 1e9, bleed: 0, bleedT: 0 });
    run(g, PS.every + 0.5);
    eq(g.enemies.length, C.foeCap, '소환 초소도 foeCap을 넘지 않는다');
    eq(escorts(g), 0, 'foeCap이 차 있으면 escort를 놓지 않는다');
  }
  console.log('규칙 확인: 소환 초소(1구역 없음, 2구역부터 하나, 범위 안에서만 escort 소환, 파괴 뒤 멈춤, foeCap 준수)');
}

// ---- 3바퀴째(7구역)부터 소환 초소 둘: 가장 먼 초소(count-1)와 두 번째로 먼 초소(count-2). 난수를 더 쓰지 않는다 ----
{
  const still = { x: 0, y: 0 }, PS = C.postSummon;
  const idxs = g => g.posts.map((p, i) => (p.summon ? i : -1)).filter(i => i >= 0);
  for (const d of [2, 3, 4, 5, 6]) {
    const g = S.newGame(5, { district: d });
    eq(JSON.stringify(idxs(g)), JSON.stringify([g.postsTotal - 1]), d + '구역: 소환 초소는 가장 먼 초소 하나');
  }
  for (const d of [7, 8, 9, 10, 13]) {
    const g = S.newGame(5, { district: d }), n = g.postsTotal;
    eq(JSON.stringify(idxs(g)), JSON.stringify([n - 2, n - 1]), d + '구역: 소환 초소는 count-1, count-2 둘');
    ok(g.posts.filter(p => p.summon).every(p => p.summon === PS && p.summonT === PS.every), d + '구역: 두 소환 초소 모두 postSummon, 타이머 every');
  }
  // 같은 시드: 같은 표를 쓰는 구역(4↔7, 5↔8, 6↔9)은 초소 자리·수비대 자리·종류와 그 뒤 난수가 같다(소환 지정이 rand를 쓰지 않는다)
  const layout = g => JSON.stringify({ posts: g.posts.map(p => [p.x, p.y, p.hp]), guards: g.enemies.map(e => [e.arch, e.x, e.y, e.guard, g.posts.indexOf(e.home)]), next: g.rand() });
  for (const [a, b] of [[4, 7], [5, 8], [6, 9]]) for (const seed of [1, 7, 99]) {
    eq(layout(S.newGame(seed, { district: b })), layout(S.newGame(seed, { district: a })), a + '구역↔' + b + '구역 시드 ' + seed + ': 초소·수비대 자리와 다음 난수가 같다');
  }
  eq(layout(S.newGame(42, { district: 7 })), layout(S.newGame(42, { district: 7 })), '7구역 같은 시드는 같은 판');
  // 두 소환 초소가 각자 범위 안에서만 escort를 부르고, 파괴되면 그 초소만 멈춘다. foeCap 준수
  const setup = () => { const g = S.newGame(3, { district: 7 }); g.spawnT = 1e9; g.eliteIdx = 99; g.enemies = []; g.units = []; g.obstacles = []; g.necro.hp = g.necro.maxHp = 1e9; return { g, sp: g.posts.filter(q => q.summon) }; };
  const escorts = g => g.enemies.filter(e => e.escort && !e.dead).length;
  const run = (g, secs) => { for (let i = 0; i < Math.round(60 * secs); i++) S.step(g, 1 / 60, still); };
  const near = (g, p) => { g.necro.x = p.x; g.necro.y = Math.min(S.H - 0.6, p.y + 2); };
  {
    const { g, sp } = setup();
    eq(sp.length, 2, '7구역 소환 초소 둘');
    ok(Math.hypot(sp[0].x - sp[1].x, sp[0].y - sp[1].y) > 2 * C.postRange, '두 소환 초소는 사격 범위가 겹치지 않을 만큼 떨어져 있다');
    for (const [i, p] of sp.entries()) {
      const o = sp[1 - i];
      g.enemies = []; p.summonT = o.summonT = PS.every; near(g, p);
      ok(Math.hypot(p.x - g.necro.x, p.y - g.necro.y) < C.postRange && Math.hypot(o.x - g.necro.x, o.y - g.necro.y) > C.postRange, '네크로맨서가 소환 초소 ' + i + ' 범위 안, 다른 하나는 밖');
      run(g, PS.every + 0.5);
      eq(escorts(g), PS.n, '소환 초소 ' + i + ': every초 뒤 escort ' + PS.n + '마리');
      eq(o.summonT, PS.every, '범위 밖의 다른 소환 초소 타이머는 돌지 않는다');
    }
    sp[0].dead = true; g.enemies = []; near(g, sp[0]); run(g, PS.every * 2 + 1);
    eq(escorts(g), 0, '부서진 소환 초소는 escort를 부르지 않는다');
    g.enemies = []; near(g, sp[1]); sp[1].summonT = PS.every; run(g, PS.every + 0.5);
    eq(escorts(g), PS.n, '남은 소환 초소는 계속 escort를 부른다');
  }
  for (const i of [0, 1]) {
    const { g, sp } = setup(); near(g, sp[i]);
    for (let k = 0; k < C.foeCap; k++) g.enemies.push({ elite: false, arch: 'armor', g: 1, x: 2 + (k % 12), y: 24 + Math.floor(k / 12) * 0.9, hp: 1e9, maxHp: 1e9, dmg: 0, r: 0.4, cd: 9, face: 0, stun: 1e9, bleed: 0, bleedT: 0 });
    run(g, PS.every + 0.5);
    eq(g.enemies.length, C.foeCap, '7구역 소환 초소 ' + i + '도 foeCap을 넘지 않는다');
  }
  console.log('규칙 확인: 7구역부터 소환 초소 둘(count-1, count-2), 2~6구역은 하나, 같은 시드 배치 불변, 각자 범위 안 소환·파괴 뒤 멈춤·foeCap 준수');
}

// ---- 90초(DURATION) 뒤 돌격조 간격 단축: 다음 돌격조 시각 g.eliteAt ----
{
  const still = { x: 0, y: 0 }, EL = C.eliteEveryLate, tol = 1 / 60 + 1e-6;
  ok(EL > 0 && EL < C.eliteEvery, '90초 뒤 돌격조 간격(eliteEveryLate)은 기존 간격보다 짧다');
  { const g0 = S.newGame(7); eq(g0.eliteAt, C.eliteFirst, '새 판의 다음 돌격조 시각은 eliteFirst'); eq(g0.eliteIdx, 0, '새 판의 돌격조 번호는 0'); }
  const record = seed => {
    const g = S.newGame(seed); g.spawnT = 1e9; g.posts = []; g.postsTotal = 0; g.enemies = []; g.units = []; g.obstacles = []; g.necro.hp = g.necro.maxHp = 1e12;
    const out = [];
    while (g.t < 170 && !g.over) {
      const k = g.eliteIdx, at = g.eliteAt;
      S.step(g, 1 / 60, still);
      if (g.eliteIdx > k) { const e = g.enemies.filter(x => x.elite).pop(); out.push({ t: g.t, at, arch: e.arch, x: e.x, y: e.y, hp: e.hp }); }
    }
    return { out, g };
  };
  const { out: a, g } = record(11), { out: b } = record(11);
  eq(JSON.stringify(a), JSON.stringify(b), '같은 시드면 돌격조 등장 시각·종류·자리가 같다');
  // 90초 전: 예전 공식(eliteFirst + eliteEvery * idx)과 같은 시각
  let pre = 0;
  for (let i = 0; C.eliteFirst + C.eliteEvery * i < S.DURATION; i++, pre++) {
    const oldT = C.eliteFirst + C.eliteEvery * i;
    ok(a[i], i + '번째 돌격조가 나온다');
    approx(a[i].at, oldT, 1e-9, i + '번째 돌격조 시각은 예전과 같다');
    approx(a[i].t, oldT - C.eliteWarn, tol, i + '번째 돌격조는 예전처럼 eliteWarn초 전에 나타난다');
    ok(a[i].t < S.DURATION, i + '번째 돌격조는 90초 전에 나온다');
  }
  ok(pre >= 1, '90초 전에 돌격조가 적어도 하나 나온다');
  // 90초를 넘긴 뒤: 처음 넘은 돌격조 시각은 예전 그대로, 그다음부터 eliteEveryLate 간격
  const j = a.findIndex(e => e.at >= S.DURATION);
  eq(j, pre, '90초 전 돌격조 다음이 90초 뒤 첫 돌격조');
  approx(a[j].at, C.eliteFirst + C.eliteEvery * j, 1e-9, '90초를 처음 넘긴 돌격조 시각은 예전 간격으로 정해진다');
  ok(a.length - j >= 3, '170초까지 90초 뒤 돌격조가 여럿 나온다(' + (a.length - j) + ')');
  for (let i = j + 1; i < a.length; i++) {
    approx(a[i].at - a[i - 1].at, EL, 1e-9, i + '번째 돌격조: 90초 뒤에는 eliteEveryLate 간격');
    approx(a[i].t, a[i].at - C.eliteWarn, tol, i + '번째 돌격조는 eliteAt의 eliteWarn초 전에 나타난다');
    ok(a[i].at < C.eliteFirst + C.eliteEvery * i, i + '번째 돌격조가 예전보다 빨리 나온다');
  }
  eq(g.eliteAt, a[a.length - 1].at + EL, '다음 돌격조 시각 상태가 마지막 돌격조 + eliteEveryLate');
  { const g2 = S.newGame(11); eq(g2.eliteAt, C.eliteFirst, '다시 시작한 판은 eliteAt이 eliteFirst로 돌아간다'); eq(g2.eliteIdx, 0, '다시 시작한 판은 돌격조 번호가 0'); }
  // eliteIdx를 밖에서 정하면(smoke.cjs처럼) 그 번호의 시각에 나오고, 99로 두면 나오지 않는다
  { const g3 = S.newGame(4); g3.spawnT = 1e9; g3.enemies = []; g3.eliteIdx = 2; g3.t = C.eliteFirst + C.eliteEvery * 2 - C.eliteWarn; S.step(g3, 1 / 60, still); eq(g3.enemies.filter(e => e.elite).length, 1, 'eliteIdx를 2로 두면 그 시각에 돌격조가 나온다'); eq(g3.eliteAt, C.eliteFirst + C.eliteEvery * 3, '그다음 시각은 eliteIdx 3의 시각'); }
  { const g4 = S.newGame(4); g4.spawnT = 1e9; g4.enemies = []; g4.eliteIdx = 99; g4.t = 300; S.step(g4, 1 / 60, still); eq(g4.enemies.filter(e => e.elite).length, 0, 'eliteIdx 99면 돌격조가 나오지 않는다'); }
  console.log('규칙 확인: 돌격조 시각(90초 전 예전 그대로, 90초 뒤 ' + EL + '초 간격, 같은 시드 같은 판, 새 판 초기화)');
  // 위 기록(record)은 기본 1구역 판이다: 1구역 순서(맹수→갑주→사수)가 그대로인지 함께 본다
  for (let i = 0; i < Math.min(3, a.length); i++) eq(a[i].arch, S.KINDS[i % 3], '1구역 기록의 ' + i + '번째 돌격조 종류는 예전 그대로');
}

// ---- 구역별 돌격조 시작 순서: 1구역 맹수, 2구역 갑주, 3구역 사수부터(4구역은 1구역처럼 다시 돈다) ----
{
  const still = { x: 0, y: 0 };
  const eliteAt = (d, idx) => {
    const g = S.newGame(4242, { district: d }); g.spawnT = 1e9; g.posts = []; g.postsTotal = 0; g.enemies = []; g.units = []; g.obstacles = []; g.necro.hp = g.necro.maxHp = 1e9;
    g.eliteIdx = idx; g.t = C.eliteFirst + C.eliteEvery * idx - C.eliteWarn; S.step(g, 1 / 60, still);
    const els = g.enemies.filter(e => e.elite && !e.boss);
    eq(els.length, 1, d + '구역 ' + idx + '번 돌격조가 하나 나온다');
    return { g, e: els[0] };
  };
  const want = { 1: ['beast', 'armor', 'ranger'], 2: ['armor', 'ranger', 'beast'], 3: ['ranger', 'beast', 'armor'], 4: ['beast', 'armor', 'ranger'] };
  for (const d of [1, 2, 3, 4]) {
    const got = [0, 1, 2].map(idx => {
      const { g, e } = eliteAt(d, idx);
      approx(e.maxHp, C.eliteHp * (1 + C.eliteHpStep * Math.min(idx, 4)) * g.scale, 1e-9, d + '구역 ' + idx + '번 돌격조 체력 단계는 eliteIdx 그대로');
      eq(e.chainMax, e.arch === 'beast' ? C.eliteBeast.chain : 0, d + '구역 맹수 돌격조만 연속 돌진');
      ok(e.arch === 'ranger' ? e.summon === C.eliteRanger : e.summon === null, d + '구역 사수 돌격조만 escort 소환');
      return e.arch;
    });
    eq(got.join(','), want[d].join(','), d + '구역 돌격조 순서');
  }
  // 1구역 순서는 예전 공식(KINDS[idx % 3])과 같다(smoke.cjs의 1구역 검증과 맞는다)
  for (let idx = 0; idx < 6; idx++) eq(eliteAt(1, idx).e.arch, S.KINDS[idx % 3], '1구역 ' + idx + '번 돌격조는 예전 그대로');
  console.log('규칙 확인: 구역별 돌격조 시작 순서(1 맹수, 2 갑주, 3 사수, 4 다시 맹수), 체력 단계·pattern 불변');
}

// ---- 1구역 3막: 초소 함락마다 경보 웨이브 1회, 막이 오르면 스폰 압박 상승, 마지막 초소 전 돌격조 ----
{
  const still = { x: 0, y: 0 }, A = C.alarm;
  const setup = (seed, d) => { const g = S.newGame(seed, { district: d || 1, starter: 'armor' }); g.spawnT = 1e9; g.enemies = []; g.units = []; g.obstacles = []; g.necro.hp = g.necro.maxHp = 1e12; for (const p of g.posts) p.cd = 99; return g; };
  const boomAt = (g, p, before) => {
    g.enemies = g.enemies.filter(e => e.elite); g.units = []; g.hearts = []; g.souls = []; g.feedT = 0; g.choice = null;
    g.souls.push({ x: g.necro.x, y: g.necro.y, type: 'armor', q: 1, ttl: 5 }); S.step(g, 1 / 60, still);
    const u = g.units[g.units.length - 1]; ok(u, '폭발용 키메라를 되살린다');
    u.x = p.x + 1; u.y = p.y; u.inst = 90;
    if (before) before(g);
    g.events.length = 0;
    ok(S.detonate(g), '익은 키메라가 초소로 뛰어든다');
    for (let i = 0; i < 90 && g.units.indexOf(u) >= 0; i++) S.step(g, 1 / 60, still);
    ok(p.dead, '다 익은 폭발로 초소가 부서진다');
    const ev = g.events.slice(); g.choice = null; return ev;
  };
  // (1) 초소 함락당 경보 웨이브 정확히 1회(foeCap이 차 있어도), 같은 시드 같은 웨이브
  const playAlarms = seed => {
    const g = setup(seed); g.eliteIdx = 99;
    ok(g.acts === true && g.alarms === 0 && g.alarm === null && S.spawnCurve(g).act === 1, '1구역은 3막 규칙으로 1막에서 시작한다');
    const log = [];
    for (let i = 0; i < g.posts.length; i++) {
      const p = g.posts[i], last = i === g.posts.length - 1;
      const fill = last ? gg => { for (let k = 0; k < C.foeCap; k++) gg.enemies.push({ elite: false, arch: 'armor', g: 1, x: 2 + (k % 12), y: 24 + Math.floor(k / 12) * 0.9, hp: 1e9, maxHp: 1e9, dmg: 0, r: 0.4, cd: 9, face: 0, stun: 1e9, bleed: 0, bleedT: 0 }); } : null;
      const ev = boomAt(g, p, fill);
      eq(ev.filter(e => e === 'alarm').length, 1, (i + 1) + '번째 초소 함락: 경보 이벤트 한 번');
      eq(g.alarms, i + 1, (i + 1) + '번째 초소 함락: 경보 웨이브 수');
      const al = g.alarm, want = A.pack + A.packStep * i + A.mid, wave = g.enemies.filter(e => e.alarm === i + 1);
      ok(al && al.wave === i + 1 && al.postsDown === i + 1 && al.postsTotal === g.postsTotal && al.act === Math.min(C.acts, i + 2) && al.acts === C.acts && al.last === last && al.foes === want, '막 전환 정보: ' + JSON.stringify(al));
      eq(wave.length, want, (i + 1) + '번째 경보 웨이브 마릿수(무리 + 중형)');
      eq(wave.filter(e => e.g === 2).length, A.mid, (i + 1) + '번째 경보 웨이브의 중형 수');
      ok(wave.every(e => Math.hypot(e.x - p.x, e.y - p.y) <= A.off + A.r + 1), (i + 1) + '번째 경보 웨이브는 부순 초소 주변에 나온다');
      if (last) { ok(g.enemies.length > C.foeCap, 'foeCap이 차 있어도 경보 웨이브가 빠지지 않는다'); ok(g.boss, '마지막 초소 뒤 대장'); }
      log.push(JSON.stringify(al) + JSON.stringify(wave.map(e => [e.arch, e.g, e.x, e.y])));
    }
    g.events.length = 0;
    for (let i = 0; i < 120; i++) { g.choice = null; S.step(g, 1 / 60, still); }
    ok(g.alarms === g.postsTotal && !g.events.includes('alarm'), '초소가 다 부서진 뒤에는 경보 웨이브가 더 나오지 않는다');
    return log;
  };
  eq(JSON.stringify(playAlarms(41)), JSON.stringify(playAlarms(41)), '같은 시드면 경보 웨이브가 같다');
  // (2) 막이 오르면 스폰 간격이 짧아지고 중형 확률이 오른다. 2구역은 그대로
  {
    const g = setup(5); g.t = 5;
    const c = [0, 1, 2].map(k => { g.postsDown = k; return S.spawnCurve(g); });
    eq(c.map(x => x.act).join(), '1,2,3', '부순 초소 수에 따른 막');
    ok(c[1].gap < c[0].gap && c[2].gap < c[1].gap, '막이 오를수록 스폰 간격이 짧다: ' + c.map(x => x.gap).join());
    ok(c[1].midP > c[0].midP && c[2].midP > c[1].midP, '막이 오를수록 중형 확률이 높다: ' + c.map(x => x.midP).join());
    g.t = 80; g.postsDown = 1; eq(S.spawnCurve(g).tEff, 80, '시간 진행도가 더 크면 시간을 따른다');
    const g2 = setup(5, 2); g2.t = 5; const c2 = JSON.stringify(S.spawnCurve(g2)); g2.postsDown = 3;
    ok(JSON.stringify(S.spawnCurve(g2)) === c2 && S.spawnCurve(g2).act === 0 && !g2.acts, '2구역은 초소를 부숴도 스폰 곡선이 그대로');
    const spawned = (k, acts) => { const h = setup(5); h.eliteIdx = 99; h.acts = acts; h.posts.forEach((p, i) => { if (i < k) p.dead = true; }); h.postsDown = k; h.rand = () => 0.6; h.t = 5; h.spawnT = 0; S.step(h, 1 / 600, still); return h; };
    const h1 = spawned(0, true), h3 = spawned(2, true), hOff = spawned(2, false);
    ok(h1.enemies.length === 3 && h1.enemies.every(e => e.g === 1), '1막(5초): 1등급 무리');
    ok(h3.enemies.length === 1 && h3.enemies[0].g === 2, '3막(5초): 같은 굴림에서 중형이 나온다');
    ok(h3.spawnT < h1.spawnT, '3막의 다음 스폰이 더 빠르다');
    ok(hOff.enemies.length === 3 && hOff.spawnT === h1.spawnT, '3막 규칙을 끄면 예전 곡선');
  }
  // (3) 마지막 초소 전에 돌격조가 반드시 나오고, 그 뒤 시각표는 예전 그대로(중복 없음)
  {
    const g = setup(61);
    ok(g.eliteIdx === 0 && g.eliteRush === false, '새 판: 돌격조 당김 없음');
    boomAt(g, g.posts[0]);
    ok(!g.eliteRush && g.eliteAt === C.eliteFirst, '첫 초소로는 돌격조를 당기지 않는다');
    boomAt(g, g.posts[1]);
    ok(g.t < C.eliteFirst - C.eliteWarn && g.eliteRush && g.eliteIdx === 0, '마지막 초소만 남으면 첫 돌격조를 당긴다');
    S.step(g, 1 / 60, still);
    ok(g.eliteIdx === 1 && g.enemies.filter(e => e.elite && !e.boss).length === 1 && !g.posts[2].dead && !g.boss, '마지막 초소를 부수기 전에 돌격조가 나온다');
    ok(!g.eliteRush && g.eliteAt === C.eliteFirst + C.eliteEvery, '당긴 뒤 다음 돌격조는 예전 시각표(1번)');
    while (g.t < C.eliteFirst + C.eliteEvery - C.eliteWarn - 0.05) { S.step(g, 1 / 60, still); if (g.eliteIdx !== 1) throw new Error('당긴 돌격조 뒤 중복 돌격조가 나왔다 t=' + g.t); }
    for (let i = 0; i < 12; i++) S.step(g, 1 / 60, still);
    eq(g.eliteIdx, 2, '다음 돌격조는 예전 시각에 나온다');
    const d2 = setup(61, 2);
    for (let i = 0; i < 3; i++) boomAt(d2, d2.posts[i]);
    S.step(d2, 1 / 60, still);
    ok(d2.eliteIdx === 0 && !d2.eliteRush && d2.alarms === 0 && !d2.enemies.some(e => e.alarm), '2구역은 경보 웨이브·돌격조 당김이 없다');
  }
  // (4) N1 리뷰 P2: 남은 초소 둘이 같은 step에 연달아 터져도 마지막 초소(대장) 전에 돌격조가 정확히 한 번 나오고, 그 뒤 시각표는 예전 그대로
  const sameFrame = seed => {
    const g = setup(seed);
    boomAt(g, g.posts[0]);
    ok(g.postsDown === 1 && g.eliteIdx === 0 && !g.eliteRush, '동시 함락 준비: 첫 초소만 부서졌다');
    g.enemies = []; g.units = []; g.hearts = []; g.souls = []; g.feedT = 0; g.choice = null; g.choiceQ = 0;
    g.necro.hp = g.necro.maxHp = 1e9;
    for (let i = 0; i < 2; i++) g.souls.push({ x: g.necro.x, y: g.necro.y, type: 'armor', q: 1, ttl: 5 });
    S.step(g, 1 / 60, still);
    eq(g.units.length, 2, '동시 함락 준비: 폭탄 둘');
    const p1 = g.posts[1], p2 = g.posts[2];
    g.units.forEach((u, i) => { const p = i ? p2 : p1; u.state = 'rush'; u.rushT = 0; u.charge = 1; u.inst = 90; u.target = p; u.x = p.x + 0.3; u.y = p.y; u.tx = p.x; u.ty = p.y; });
    g.enemies = []; g.events.length = 0;
    S.step(g, 1 / 60, still);
    ok(p1.dead && p2.dead && g.postsDown === g.postsTotal && g.boss, '같은 step에 남은 초소 둘이 함락되고 대장이 나온다');
    const ev = g.events.slice(), elites = g.enemies.filter(e => e.elite && !e.boss);
    eq(ev.filter(e => e === 'alarm').length, 2, '동시 함락: 경보 이벤트 두 번');
    ok(elites.length === 1 && g.eliteIdx === 1, '동시 함락에도 돌격조가 한 번 나온다: eliteIdx=' + g.eliteIdx + ' elites=' + elites.length);
    ok(ev.indexOf('warn') >= 0 && ev.indexOf('boss') > ev.indexOf('warn') && g.enemies.indexOf(elites[0]) < g.enemies.indexOf(g.boss), '돌격조가 대장(마지막 초소 함락)보다 먼저 나온다: ' + ev.join());
    ok(elites[0].mode === 'warn' && g.alarm.last && g.alarm.elite === 'now', '돌격조는 예고와 함께, 막 전환 정보에 즉시 출현 표시: ' + JSON.stringify(g.alarm));
    ok(!g.eliteRush && g.eliteAtIdx === 1 && g.eliteAt === C.eliteFirst + C.eliteEvery, '즉시 나온 돌격조 뒤 다음 돌격조는 예전 시각표(1번)');
    const sig = JSON.stringify([elites[0].arch, elites[0].x, elites[0].y, g.boss.x, g.boss.y, g.alarm]);
    while (g.t < C.eliteFirst + C.eliteEvery - C.eliteWarn - 0.05 && !g.over) { g.choice = null; S.step(g, 1 / 60, still); if (g.eliteIdx !== 1) throw new Error('동시 함락 뒤 중복 돌격조가 나왔다 t=' + g.t); }
    return sig;
  };
  eq(sameFrame(61), sameFrame(61), '같은 시드면 동시 함락 돌격조가 같다');
  sameFrame(7);
  console.log('규칙 확인: 1구역 3막(초소마다 경보 웨이브 1회·foeCap 무시, 막별 스폰 간격·중형 확률, 마지막 초소 전 돌격조(같은 step 동시 함락 포함), 2구역 불변)');
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
function run(seed, policy, opts, prefer, prep) {
  const g = S.newGame(seed, opts), mem = { last: -9 };
  if (prep) prep(g);
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
// 회귀: 바리케이드가 1구역 봇('익혀서 터뜨림') 정복을 크게 떨어뜨리지 않는다(바리케이드를 뺀 같은 시드와 비교)
{
  const N = 40; let wNo = 0, wOb = 0;
  for (let s = 1; s <= N; s++) {
    if (run(s, 'play', undefined, undefined, g => { g.obstacles = []; }).over === 'win') wNo++;
    if (run(s, 'play').over === 'win') wOb++;
  }
  const tol = Math.max(6, Math.ceil(wNo * 0.25));
  if (wOb < wNo - tol) throw new Error('바리케이드로 1구역 봇 정복이 크게 떨어졌다 ' + wNo + ' → ' + wOb + '/' + N);
  console.log('회귀 확인: 1구역 봇 정복 바리케이드 없음 ' + wNo + '/' + N + ' → 있음 ' + wOb + '/' + N + ' (허용 하락 ' + tol + ')');
}
// 회귀: 1구역 3막(경보 웨이브·막 스폰)이 봇 정복률과 평균 판 길이를 크게 바꾸지 않는다(3막을 끈 같은 시드와 비교)
{
  const N = 40; let wOff = 0, wOn = 0, tOff = 0, tOn = 0, al = 0;
  for (let s = 1; s <= N; s++) {
    const a = run(s, 'play', undefined, undefined, g => { g.acts = false; }), b = run(s, 'play');
    if (a.over === 'win') wOff++;
    if (b.over === 'win') wOn++;
    tOff += a.t; tOn += b.t; al += b.alarms;
    if (a.alarms !== 0) throw new Error('3막을 끈 판에서 경보 웨이브가 나왔다');
    if (b.alarms !== b.postsDown) throw new Error('경보 웨이브 수(' + b.alarms + ')가 부순 초소 수(' + b.postsDown + ')와 다르다 seed ' + s);
  }
  const tol = Math.max(6, Math.ceil(wOff * 0.25));
  if (wOn < wOff - tol) throw new Error('3막으로 1구역 봇 정복이 크게 떨어졌다 ' + wOff + ' → ' + wOn + '/' + N);
  if (tOn / N > tOff / N * 1.25 + 10) throw new Error('3막으로 1구역 평균 판 길이가 크게 늘었다 ' + (tOff / N).toFixed(1) + ' → ' + (tOn / N).toFixed(1) + '초');
  console.log('회귀 확인: 1구역 3막 끔 ' + wOff + '/' + N + ' (' + (tOff / N).toFixed(1) + '초) → 켬 ' + wOn + '/' + N + ' (' + (tOn / N).toFixed(1) + '초), 경보 웨이브 ' + (al / N).toFixed(1) + '회/판');
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
  const boughtFor = d => { let gold = (d - 1) * (G.perClear + 3 * G.perPost), k = 0; while (k < G.statMax && gold >= G.statCost[k] * 6) { gold -= G.statCost[k] * 6; k++; } return k; };
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
