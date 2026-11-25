// 화면, 입력, 소리. 규칙은 sim.js에 있고 여기서는 상태를 그리고 사건을 소리로 바꾼다.
(function () {
  'use strict';
  const S = window.ChimeraSim;
  // 3D 판(3d.html)이면 판을 그리는 쪽을 넘겨받는다. 없으면 지금의 2D 판이다.
  // V: render(g, now, opts) / resize(w, h) / toScreen(x, y, h) → [px, py] / toWorld(px, py) → {x, y} / rotateInput(x, y) → [x, y]
  const V = window.ChimeraView || null;
  // 3D 판(index.html)인데 V가 없으면(WebGL을 못 쓰거나 render3d.js·three를 띄우지 못함) 2D 판으로 그린다.
  // 밑에 깔린 #game3d(검은 WebGL 바탕)는 숨긴다. 2d.html에는 #game3d가 없다.
  const cv3 = V ? null : document.getElementById('game3d');
  if (cv3) cv3.hidden = true;
  window.ChimeraRenderMode = V ? '3d' : cv3 ? '2d-fallback' : '2d';
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const C = n => css.getPropertyValue(n).trim();
  const COL = {
    ground: C('--ground'), grid: C('--grid'), ink: C('--ink'), dim: C('--dim'), necro: C('--necro'),
    bone: C('--bone'), beast: C('--beast'), armor: C('--armor'), ranger: C('--ranger'), danger: C('--danger'), great: C('--great'),
  };
  const FONT = C('--font-body');
  const titleEl = document.getElementById('title'), endEl = document.getElementById('end');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VIEW_W = 13;   // 화면 가로에 들어오는 판의 폭
  const TAP_MS = 340;  // 이 안에 한 번 더 치면 두 번 톡톡(자폭), 아니면 한 번 톡(찍기)

  let g = null, mode = 'title', inp = { x: 0, y: 0 }, stick = null, keys = {}, last = 0;
  let retryDistrict = 1;   // 끝 화면의 '다시' 버튼이 여는 구역
  let starter = 'beast';   // first summon kind picked on the title/end screens (default beast)
  let subN = 0, subT = -1e9, shieldSndT = 0;   // 집속탄 피치 계단과 마지막으로 터진 시각, 방벽 소리 간격
  // 폭발 손맛(화면만): 바닥 그을음, 튀는 파편, 처치 수 글자. 규칙(sim)과 따로 Math.random을 쓴다(같은 시드 같은 판은 그대로)
  let scorch = [], debris = [], popups = [], seenFx = new WeakSet();
  const SCORCH_T = 4.5, DEBRIS_T = 0.45, POPUP_T = 0.9;
  const hitSndT = {};   // 평타 소리: 종류마다 0.06초에 한 번만
  // 공격 몸짓: 휘두르는 동안 바라보는 쪽으로 나갔다 돌아온다(사수는 반동으로 뒤로)
  const LUNGE = { beast: 0.45, armor: 0.35, ranger: -0.18 };
  const lungeOf = u => (reduced || !(u.swing > 0) ? 0 : Math.sin(Math.PI * (1 - u.swing / S.CFG.hit.swing)) * LUNGE[u.main]);
  // Boss kill (g.over 'win'): conquest sequence before the result screen. Length in real seconds; effects run slowed (VIC_SLOW).
  const VIC_S = 1.6, VIC_SLOW = 0.3, VIC_FLASH = 0.6, VIC_STOP = 0.35, VIC_SHAKE = 1.4;
  const victoryEl = document.getElementById('victoryBanner');
  let victory = null, endCount = 0, vnow = 0;
  hideVictory();
  let flash = 0, hitstop = 0;   // 익은 폭발 연출: 화면 번쩍임, 판을 잠깐 멈춤(그림만, 규칙은 그대로)
  let scale = 1, dpr = 1, camX = 0, camY = 0, shake = 0, beatT = 0, lastTap = null, seed = (Date.now() % 100000) + 1;

  // ---- 소리: 외부 파일 없이 Web Audio로 만든다. 첫 터치(시작 버튼) 뒤에만 켜진다. ----
  // 소리는 모두 master 하나를 지난다(끄면 gain 0). 켜고 끈 것은 게임 저장과 다른 키에 둔다.
  /*SND>*/
  const SOUND_KEY = 'chimera-lab-sound-v1';
  const Sound = {
    ac: null, master: null, bgm: null, muted: false,   // bgm: music bus under master, made by the BGM engine on its first unmuted note
    on() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!this.ac && AC) this.ac = new AC();
        if (this.ac && !this.master) { this.master = this.ac.createGain(); this.master.connect(this.ac.destination); }
        this.apply();
        if (this.ac && this.ac.state === 'suspended') this.ac.resume();
      } catch (e) { this.ac = null; this.master = null; this.bgm = null; }
    },
    apply() { if (this.master) this.master.gain.value = this.muted ? 0 : 1; },
    load() { let v = null; try { v = localStorage.getItem(SOUND_KEY); } catch (e) { v = null; } this.muted = v === '1'; this.apply(); },
    setMuted(m) {
      this.muted = !!m; this.apply();
      try { localStorage.setItem(SOUND_KEY, this.muted ? '1' : '0'); } catch (e) { /* 저장소가 막혀도 이 세션은 메모리로 */ }
      return this.muted;
    },
    toggle() { return this.setMuted(!this.muted); },
    tone(type, f0, f1, dur, vol, delay) {
      const ac = this.ac, out = this.master; if (!ac || !out) return;
      const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), v = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(v); v.connect(out); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, cutoff) {
      const ac = this.ac, out = this.master; if (!ac || !out) return;
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; v.gain.value = vol;
      src.connect(f); f.connect(v); v.connect(out); src.start();
    },
    absorb() { this.tone('sawtooth', 150, 400, 0.08, 0.18); },                    // 혼이 빨려 드는 짧은 스윕
    beat() { this.tone('sine', 70, 45, 0.12, 0.35); this.tone('sine', 62, 40, 0.12, 0.25, 0.16); },   // 과부하: 심장 박동
    boom() { this.tone('square', 420, 90, 0.04, 0.22); this.noise(0.45, 0.6, 1200); this.tone('sine', 90, 28, 0.5, 0.7); this.tone('sine', 55, 25, 0.6, 0.4, 0.05); },   // 익은 폭발: 날카로운 크랙(퍽) 뒤에 크고 긴 쿠웅
    fizz() { this.noise(0.15, 0.2, 500); this.tone('sine', 140, 70, 0.12, 0.15); },   // 덜 익은 폭발: 피식
    ripe() { this.tone('sine', 440, 880, 0.18, 0.16); },   // 80%를 넘는 순간
    siren() { for (let i = 0; i < 3; i++) this.tone('square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.13, 0.12, i * 0.17); },   // 돌격조 예고
    raise() { this.tone('triangle', 300, 520, 0.1, 0.14); },
    purify() { this.tone('sine', 520, 1040, 0.25, 0.2); this.tone('sine', 780, 1560, 0.25, 0.12, 0.05); },
    rebirth() { this.tone('triangle', 200, 800, 0.22, 0.22); this.tone('sine', 400, 1200, 0.2, 0.12, 0.1); },
    clash() { this.noise(0.12, 0.35, 3000); this.tone('square', 220, 110, 0.15, 0.15); },
    hurt() { this.tone('sawtooth', 180, 60, 0.18, 0.25); },
    rush() { this.tone('sawtooth', 300, 900, 0.2, 0.12); },
    sub(i) { const f = 150 + Math.min(i, 10) * 35; this.noise(0.12, 0.3, 900); this.tone('sine', f, f * 0.4, 0.12, 0.35); },   // 집속탄·연쇄: 짧은 퍽. 0.6초 안에 이어 터질수록 한 계단씩 높아진다
    shield() { this.tone('triangle', 900, 600, 0.08, 0.07); },
    roar() { this.tone('sawtooth', 120, 50, 0.55, 0.3); this.noise(0.45, 0.35, 700); this.tone('square', 240, 90, 0.3, 0.08, 0.05); },   // phased boss roar (phase shift)
    // 평타: 맹수 물기(짧은 찢는 소리), 갑주 쿠당(낮게), 사수 탕(짧고 높게). 자주 나니 작게
    hit(kind) {
      // 폰 스피커는 200Hz 아래를 거의 못 낸다: 셋 다 들리는 높이에서 모양을 다르게 한다
      if (kind === 'beast') { this.tone('triangle', 760, 360, 0.035, 0.16); this.tone('triangle', 640, 300, 0.035, 0.13, 0.05); }   // 맹수: 짧게 두 번 '착-착' 물기
      else if (kind === 'armor') { this.tone('square', 330, 320, 0.13, 0.07); this.tone('square', 497, 480, 0.1, 0.05); this.tone('sine', 220, 110, 0.08, 0.15); }   // 갑주: 쇠가 울리는 '깡'
      else { this.noise(0.07, 0.22, 3200); this.tone('sawtooth', 1500, 200, 0.05, 0.06); }   // 사수: 잡음이 큰 '탕'
    },   // 갑주 방벽이 막았다: 가볍게 팅
  };
  /*<SND*/

  // ---- BGM: procedural zone music from oscillators and noise only (no audio files, no network). ----
  // Own bus Sound.bgm (GainNode, BGM_VOL) under Sound.master: mute (master gain 0) covers it and SFX stay on top.
  // Phone speakers barely play below 200 Hz (see Sound.hit): every music pitch, bass and drums included, stays at 200 Hz or more.
  // Lookahead scheduler: update() runs every frame and books steps up to LOOK seconds ahead on the audio clock.
  // Muted, paused, hidden or no AudioContext yet: nothing is booked and no music node is created. The step index is kept, so play resumes in place.
  // Stopping cancels booked nodes but gives back every step whose start time is still ahead of ac.currentTime (see halt), so no beat is skipped.
  // Home has no Sound.on of its own: wake() (first gesture, home sound button) makes / resumes the AudioContext when unmuted.
  // Themes: home (title, night street), act (drums+bass, +arp/hats, +lead per zone act), boss (faster per roar), win/lose stinger then silence.
  /*BGM>*/
  function makeMusic(Sound, S) {
    const BGM_VOL = 0.32, LOOK = 0.3, LEAD = 0.05, MIN_F = 200, MAX_ROAR = 3;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    // C minor throughout; the lowest note used is Ab3 (208 Hz)
    const HOME = {
      bpm: 70, len: 64, roots: [60, 56, 65, 59], chords: [[60, 63, 67], [56, 60, 63], [56, 60, 65], [59, 62, 67]],
      bell: { 2: 84, 7: 79, 12: 82, 20: 80, 26: 75, 34: 77, 39: 80, 44: 79, 52: 74, 58: 79 },
    };
    const ACT = {
      bpm: 104, len: 64, roots: [60, 56, 63, 58], chords: [[60, 63, 67], [56, 60, 63], [63, 67, 70], [58, 62, 65]],
      lead: { 0: 72, 4: 75, 6: 74, 8: 72, 12: 67, 16: 68, 20: 72, 24: 75, 28: 74, 32: 75, 36: 79, 38: 77, 40: 75, 44: 70, 48: 74, 52: 72, 56: 70, 58: 74, 60: 67 },
    };
    const BOSS = {
      bpm: 128, len: 32, stab: [[72, 75, 78], [73, 77, 80]],
      riff: [60, 60, 72, 60, 61, 60, 63, 60, 60, 60, 72, 60, 66, 65, 63, 61, 60, 60, 72, 60, 61, 60, 63, 60, 60, 60, 72, 60, 67, 66, 65, 63],
    };
    const LOOP = { home: HOME, act: ACT, boss: BOSS };
    const M = { theme: null, step: 0, nextT: 0, played: 0, playing: false, layers: 1, intensity: 0, end: null, stung: false, fill: false,
      game: null, live: [], nodes: 0, count: {}, buf: null, bufAc: null, booked: [], stingEnd: 0 };
    const bpmOf = th => (LOOP[th] ? LOOP[th].bpm + (th === 'boss' ? 8 * M.intensity : 0) : 0);
    function bus() {
      if (!Sound.bgm) { const b = Sound.ac.createGain(); b.gain.value = BGM_VOL; b.connect(Sound.master); Sound.bgm = b; }
      return Sound.bgm;
    }
    function keep(src, end, name) { M.live.push({ src, end }); M.nodes++; M.count[name] = (M.count[name] || 0) + 1; }
    function tone(name, type, f0, f1, t, dur, vol, att) {
      const ac = Sound.ac, o = ac.createOscillator(), v = ac.createGain(), a = Math.min(att || 0.005, dur * 0.5);
      const fa = Math.max(MIN_F, f0), fb = Math.max(MIN_F, f1);
      o.type = type; o.frequency.setValueAtTime(fa, t);
      if (fb !== fa) o.frequency.exponentialRampToValueAtTime(fb, t + dur);
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + a); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(v); v.connect(bus()); o.start(t); o.stop(t + dur + 0.02);
      keep(o, t + dur + 0.02, name);
    }
    const note = (name, type, m, t, dur, vol, att) => tone(name, type, mtof(m), mtof(m), t, dur, vol, att);
    function hiss(name, t, dur, vol) {
      const ac = Sound.ac;
      if (!M.buf || M.bufAc !== ac) {   // one second of bright noise (first difference of white noise), made once per context
        const n = Math.max(1, Math.floor(ac.sampleRate)), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
        let p = 0;
        for (let i = 0; i < d.length; i++) { const r = Math.random() * 2 - 1; d[i] = (r - p) * 0.5; p = r; }
        M.buf = b; M.bufAc = ac;
      }
      const src = ac.createBufferSource(), v = ac.createGain();
      src.buffer = M.buf; v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(v); v.connect(bus()); src.start(t); src.stop(t + dur + 0.02);
      keep(src, t + dur + 0.02, name);
    }
    function kick(t) { tone('kick', 'triangle', 330, 200, t, 0.11, 0.22); hiss('kick', t, 0.015, 0.05); }   // high punchy kick: audible on phones
    function snare(t) { hiss('snare', t, 0.12, 0.12); tone('snare', 'triangle', 300, 220, t, 0.07, 0.07); }
    function hat(t, vol) { hiss('hat', t, 0.035, vol); }
    function playStep(th, s, t, sd) {
      const i = s % 16, bar = Math.floor(s / 16);
      if (M.fill && th !== 'home') { M.fill = false; hiss('crash', t, 0.6, 0.08); tone('tom', 'triangle', 420, 260, t, 0.18, 0.12); }   // alarm / boss entry accent
      if (th === 'home') {   // dark night street: slow pad, soft pulse, sparse bell with an echo
        if (i === 0) for (const m of HOME.chords[bar]) note('pad', 'triangle', m, t, sd * 16, 0.04, sd * 4);
        if (i === 0 || i === 10) note('bass', 'triangle', HOME.roots[bar], t, sd * 5, 0.07, 0.02);
        const b = HOME.bell[s];
        if (b) { note('bell', 'sine', b, t, sd * 6, 0.045); note('bell', 'sine', b, t + sd * 3, sd * 4, 0.015); }
        if (i === 4 || i === 12) hat(t, 0.02);
        return;
      }
      if (th === 'act') {   // act 1: drums + bass, act 2: + arp and hats, act 3: + lead and busier drums
        const L = M.layers, root = ACT.roots[bar], ch = ACT.chords[bar];
        if (i === 0 || i === 8 || (L >= 3 && i === 10)) kick(t);
        if (i === 4 || i === 12) snare(t);
        if (i % 2 === 0) note('bass', 'sawtooth', root + (i === 6 || i === 14 ? 12 : 0), t, sd * 1.6, 0.075);
        if (L >= 2) { note('arp', 'square', ch[s % 3] + (i % 8 === 7 ? 24 : 12), t, sd * 0.9, 0.026); if (i % 4 === 2) hat(t, 0.05); }
        if (L >= 3) { const m = ACT.lead[s]; if (m) note('lead', 'sawtooth', m, t, sd * 3.5, 0.04, 0.02); if (i % 2 === 1) hat(t, 0.03); }
        return;
      }
      const k = M.intensity;   // boss: four-on-the-floor, semitone riff, stabs; each roar adds tempo and layers
      if (i % 4 === 0 || (k >= 2 && (i === 14 || i === 15))) kick(t);
      if (i === 4 || i === 12) snare(t);
      if (i % 2 === 1 || k >= 1) hat(t, 0.035);
      note('bass', 'sawtooth', BOSS.riff[s], t, sd * 0.85, 0.07);
      if (k >= 2 && i % 2 === 0) note('bass', 'square', BOSS.riff[s] + 12, t, sd * 0.7, 0.025);
      if (i === 0) for (const m of BOSS.stab[bar]) note('stab', 'square', m, t, sd * 2, 0.03);
      if (k >= 1 && (i === 0 || i === 8)) tone('lead', 'square', mtof(k >= 2 ? 84 : 79), mtof(k >= 2 ? 83 : 78), t, sd * 7, 0.035, 0.01);
      if (k >= 3) note('arp', 'square', BOSS.stab[bar][s % 3] + 12, t, sd * 0.8, 0.02);
    }
    function sting(th, t) {
      if (th === 'win') {   // conquest: rising major arpeggio
        [60, 64, 67, 72].forEach((m, j) => { note('win', 'triangle', m, t + j * 0.12, j === 3 ? 1.2 : 0.3, 0.12); note('win', 'square', m + 12, t + j * 0.12, j === 3 ? 0.9 : 0.2, 0.025); });
        hiss('win', t + 0.36, 0.5, 0.06);
      } else {   // defeat: slow falling minor line over a held low note
        [67, 63, 60, 59].forEach((m, j) => note('lose', 'triangle', m, t + j * 0.3, j === 3 ? 1.6 : 0.5, 0.1, 0.02));
        note('lose', 'sawtooth', 56, t, 1.9, 0.035, 0.3);
      }
    }
    function cut(at) { for (const l of M.live) { try { l.src.stop(at); } catch (e) { /* already stopped */ } } M.live = []; }
    // Stop now. keep (pause / hide, not mute): booked steps whose start time is still ahead of ac.currentTime were never heard, so they are
    // given back (M.step / M.played rewind, a pending fill accent too) and resume plays them in place; an end stinger cut before its last
    // note ended is armed again so resume plays it (never once it has finished).
    function halt(keep) {
      const ac = Sound.ac;
      if (ac) {
        const now = ac.currentTime;
        if (keep !== false) {
          const left = M.booked.filter(b => b.t >= now);
          if (left.length) { M.step = left[0].step; M.played -= left.length; if (left.some(b => b.fill)) M.fill = true; }
          if (M.stung && now < M.stingEnd) M.stung = false;
        }
        cut(now);
      }
      M.booked = []; M.playing = false;
    }
    function want(st) {
      const g = st.g;
      if (st.mode === 'title') { M.end = null; return 'home'; }
      if (!g) return null;
      if (!M.end && g.over) M.end = g.over === 'win' ? 'win' : 'lose';
      if (!M.end && st.victory) M.end = 'win';
      if (M.end) return M.end;
      if (st.mode !== 'play') return null;
      const b = g.boss;
      if (b && !b.dead && b.hp > 0) { M.intensity = Math.max(M.intensity, Math.min(MAX_ROAR, b.roars || 0)); return 'boss'; }
      const a = S && S.actOf ? S.actOf(g) : 0;
      M.layers = a > 0 ? a : Math.min(3, 1 + (g.postsDown || 0));
      return 'act';
    }
    // st: { mode, g, paused, hidden, victory }
    function update(st) {
      st = st || {};
      if (st.g !== M.game) { M.game = st.g || null; M.intensity = 0; M.end = null; M.layers = 1; M.fill = false; }
      const th = want(st), ac = Sound.ac;
      if (th !== M.theme) { if (ac) cut(ac.currentTime + 0.02); M.theme = th; M.step = 0; M.stung = false; M.stingEnd = 0; M.booked = []; M.nextT = 0; M.playing = false; }
      if ((th === 'win' || th === 'lose') && Sound.muted) M.stung = true;   // muted at the end: no late stinger after unmuting
      const run = !!(th && ac && Sound.master) && !Sound.muted && !st.paused && !st.hidden;
      if (!run) { if (M.playing || M.live.length) halt(!Sound.muted); return; }
      const now = ac.currentTime;
      M.live = M.live.filter(l => l.end > now);
      M.booked = M.booked.filter(b => b.t >= now);   // started on the audio clock: spent
      if (!M.playing || M.nextT < now) { M.playing = true; M.nextT = now + LEAD; }   // (re)start or after a stall: same step, fresh time
      if (th === 'win' || th === 'lose') {
        if (!M.stung) { M.stung = true; const i0 = M.live.length; sting(th, M.nextT); M.stingEnd = M.live.slice(i0).reduce((m, l) => Math.max(m, l.end), M.nextT); }
        return;
      }
      const T = LOOP[th], sd = 60 / bpmOf(th) / 4;
      for (let n = 0; M.nextT < now + LOOK && n < 64; n++) { const f = M.fill; playStep(th, M.step, M.nextT, sd); M.booked.push({ step: M.step, t: M.nextT, fill: f && !M.fill }); M.step = (M.step + 1) % T.len; M.played++; M.nextT += sd; }
    }
    function event(ev) {
      if (ev === 'roar') M.intensity = Math.min(MAX_ROAR, M.intensity + 1);
      else if (ev === 'alarm' || ev === 'boss') M.fill = true;
      else if (ev === 'win' || ev === 'lose') M.end = ev;
    }
    const debug = () => ({ theme: M.theme, playing: M.playing, step: M.step, played: M.played, layers: M.layers, intensity: M.intensity, bpm: bpmOf(M.theme),
      end: M.end, stung: M.stung, stingEnd: M.stingEnd, booked: M.booked.length, live: M.live.length, nodes: M.nodes, count: Object.assign({}, M.count) });
    // User gesture / home sound button: unmuted only, make or resume the AudioContext (Sound.on) and run the current theme at once.
    // Muted: no Sound.on and no music node; update() then just stops what is playing.
    function wake(st) {
      if (!Sound.muted && (!Sound.ac || !Sound.master || Sound.ac.state !== 'running')) Sound.on();
      update(st);
      return !!(Sound.ac && Sound.master && !Sound.muted);
    }
    return { update, event, halt, wake, debug };
  }
  /*<BGM*/
  const Music = makeMusic(Sound, S);
  const musicState = () => ({ mode, g, paused, hidden: !!document.hidden, victory: !!victory });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    scale = cv.width / VIEW_W;
    if (V) V.resize(r.width, r.height);
  }
  window.addEventListener('resize', resize);

  // ---- 저장: 골드와 시작 강화(규칙은 sim.js의 S.Save, 여기서는 localStorage에 읽고 쓴다) ----
  const SAVE_KEY = 'chimera-lab-save-v1', LEGACY_KEY = 'chimera-lab-best-v1';
  // 쓰기에 한 번 실패하면(사생활 모드, 용량 등) 그 뒤로는 메모리의 저장만 믿는다. 다시 읽으면 이 세션의 골드·강화가 지워진다.
  let canStore = true;
  // 그 세션 동안은 쓰기도 멈춘다: 저장소가 다시 살아나도 오래된 메모리 상태로 다른 탭의 저장을 덮어쓰지 않게.
  function persist() { if (!canStore) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { canStore = false; } }
  // 저장을 바꾸기 직전에는 늘 저장소에서 다시 읽는다. 다른 탭에서 산 강화를 오래 열린 탭이 덮어쓰지 않게.
  // 읽기에 실패하면(예외) '저장 없음'과 다르게 다룬다: 메모리의 저장을 지키고, 그 세션은 메모리만 쓴다.
  const reload = () => {
    if (save && !canStore) return;
    let text, legacy;
    try { text = localStorage.getItem(SAVE_KEY); legacy = localStorage.getItem(LEGACY_KEY); }
    catch (e) { canStore = false; if (!save) save = S.Save.fresh(); return; }
    save = S.Save.load(text, legacy);
  };
  let save = null;
  reload();
  persist();   // 옛 기록을 옮겼으면 바로 새 저장으로 남긴다(소급이 되풀이되지 않게)
  const startBtn = document.getElementById('startBtn'), resetBtn = document.getElementById('resetBtn');
  // 제목 화면: 다시 열면 지금 진행의 다음 구역부터. 1구역이 아닐 때만 '1구역으로 되돌리기'를 보인다(두 번 눌러야 된다)
  const RESET_LABEL = '1구역으로 되돌리기 (골드·강화는 그대로)';
  let resetArmed = false, resetTimer = null;
  // Home CTA: '시작' on a fresh run (save.cur 0), otherwise '이어하기 N구역' with N = save.cur + 1 (the district start() opens)
  const ctaLabel = cur => (cur > 0 ? '이어하기 ' + (cur + 1) + '구역' : '시작');
  function refreshTitle() {
    startBtn.textContent = ctaLabel(save.cur);
    resetBtn.hidden = save.cur === 0;
    resetArmed = false; clearTimeout(resetTimer);
    resetBtn.textContent = RESET_LABEL;
  }
  refreshTitle();
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true; resetBtn.textContent = '정말 1구역으로? 한 번 더 누르기';
      resetTimer = setTimeout(() => { resetArmed = false; resetBtn.textContent = RESET_LABEL; }, 3000);
      return;
    }
    reload();
    save = S.Save.restart(save); persist();
    refreshTitle();
    startBtn.focus();
  });
  window.addEventListener('storage', e => {   // 다른 탭이 저장을 바꾸면 따라간다
    if (e.key !== SAVE_KEY) return;
    reload();
    if (mode === 'title') { refreshTitle(); refreshGold(0); }   // 제목 화면의 강화 상점과 골드도 따라간다
    else if (mode === 'over') refreshGold(lastGained);
  });

  // ---- In-play guidance (sim untouched): district 1 goal banner, plus one short line the first time each moment happens ----
  // Seen tips live under their own storage key (not the game save). Marked seen when actually shown; blocked storage = memory only.
  const TIP_KEY = 'chimera-lab-tips-v1', BANNER_S = 3.2, TIP_S = 3.4;
  const TIPS = {
    absorb: '혼을 먹이면 불안정도가 찬다',
    frenzy: '과부하: 익은 채 오래 들면 체력이 샌다',
    ripe: '80% 익었다! 두 번 톡톡 쳐서 터뜨려라',
    boom: '익은 폭발은 초소와 대장도 무너뜨린다',
    rebirth: '심장을 밟아 유전자를 물려받았다',
    postdown: '초소 하나를 부쉈다 · 남은 초소로 가라',
  };
  const hasTip = k => Object.prototype.hasOwnProperty.call(TIPS, k);
  const bannerEl = document.getElementById('goalBanner'), tipEl = document.getElementById('tipLine');
  const tipSeen = {};
  let tipQ = [], tipT = 0, bannerT = 0;
  function loadTips() {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(TIP_KEY) || '[]'); } catch (e) { v = null; }
    if (Array.isArray(v)) for (const k of v) if (hasTip(k)) tipSeen[k] = true;
  }
  function saveTips() { try { localStorage.setItem(TIP_KEY, JSON.stringify(Object.keys(tipSeen))); } catch (e) { /* memory only */ } }
  function tip(k) {
    if (!hasTip(k) || tipSeen[k] || tipQ.includes(k)) return false;
    tipQ.push(k);
    return true;
  }
  // ---- Boss intro cut and big boss HUD (view only, sim untouched) ----
  // On the 'boss' event the camera pans from the necromancer to the boss, holds, then eases back to normal tracking.
  // camFocus() is the one focus both views use: drawWorld2D (camX/camY) and V.render(opts.focus) in 3D.
  // #bossHud (src/page.html) replaces the old 7px strip in the top band: title/name tag and a thick HP bar with quarter ticks.
  const CUT_PAN = 0.6, CUT_HOLD = 1.1, CUT_BACK = 0.7;
  const BOSS_NAME = { armor: '방패 진압 대장', beast: '군견 진압 대장', ranger: '저격 진압 대장' };
  const bossHudEl = document.getElementById('bossHud'), bossTitleEl = document.getElementById('bossTitle'), bossNameEl = document.getElementById('bossName');
  const bossBarEl = document.getElementById('bossBar'), bossFillEl = document.getElementById('bossFill'), bossHpEl = document.getElementById('bossHpText');
  let bossCut = null, bossKey = '';
  // Phased boss (sim spawnBoss: phases, phase, phaseAt, roarT, roars, weak, stun): HP bar phase ticks at phaseAt, roar effects while roarT > 0,
  // weak point only while a barricade stun is on (weak && stun > 0; sim clears weak when that stun ends). Phaseless bosses and other foes: no ticks, no effects.
  const bossStateEl = document.getElementById('bossState'), bossTicksEl = document.getElementById('bossTicks');
  const ROAR_T = (S.CFG.bossPhase && S.CFG.bossPhase.roar) || 1.6;
  const ROAR_TEXT = '\uD3EC\uD6A8!', PHASE_TEXT = '\uB2E8\uACC4', WEAK_TEXT = '\uC57D\uC810 \uB178\uCD9C \u00B7 \uD3C9\uD0C0 \uAE30\uD68C';
  const bossTicks = e => (e && e.boss && e.phases && Array.isArray(e.phaseAt) ? e.phaseAt.filter(f => Number.isFinite(f) && f > 0 && f < 1) : []);
  const bossRoaring = e => !!(e && e.boss && e.roarT > 0);
  const bossWeak = e => !!(e && e.boss && e.weak && e.stun > 0);
  const bossFxOf = e => (e && e.boss ? { ticks: bossTicks(e), roar: bossRoaring(e), weak: bossWeak(e), phase: e.phase || 1 } : null);
  let drawnBossFx = [];
  const easeIO = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const liveBoss = () => { const b = g && g.boss; return b && !b.dead && b.hp > 0 && g.enemies.includes(b) ? b : null; };
  const belowBossHud = y => (bossHudEl.hidden ? y : Math.max(y, 192));   // edge markers stay clear of the boss HUD
  function startBossCut() { const b = liveBoss(); bossCut = b ? { t: 0, k: 0, phase: 'pan', boss: b } : null; bossStep(); }
  function cutStep(dt) {
    if (!bossCut) return;
    if (g.over || liveBoss() !== bossCut.boss) { bossCut = null; return; }   // boss gone / killed / replaced, or the run is over
    if (!g.choice) bossCut.t += dt;   // the mutation pick freezes the cut
    const t = bossCut.t, t2 = CUT_PAN + CUT_HOLD;
    if (t >= t2 + CUT_BACK) { bossCut = null; return; }
    bossCut.phase = t < CUT_PAN ? 'pan' : t < t2 ? 'hold' : 'back';
    bossCut.k = t < CUT_PAN ? easeIO(t / CUT_PAN) : t < t2 ? 1 : 1 - easeIO((t - t2) / CUT_BACK);
  }
  function camFocus() {
    const n = g.necro, c = mode === 'play' ? bossCut : null, k = c ? c.k : 0;
    if (!(k > 0)) return { x: n.x, y: n.y, k: 0 };
    const b = c.boss;
    return { x: n.x + (b.x - n.x) * k, y: n.y + (b.y - n.y) * k, k };
  }
  function hideBoss() { bossKey = ''; bossHudEl.hidden = true; bossStateEl.hidden = true; bossStateEl.textContent = ''; bossTicksEl.textContent = ''; }
  function bossStep() {
    const b = mode === 'play' ? liveBoss() : null;
    if (!b) { hideBoss(); return; }
    const f = Math.max(0, Math.min(1, b.hp / b.maxHp)), pct = Math.round(f * 100), hp = Math.ceil(Math.max(0, b.hp)), max = Math.ceil(b.maxHp);
    const fx = bossFxOf(b), state = fx.roar ? 'roar' : fx.weak ? 'weak' : '';
    const key = g.district + '|' + b.arch + '|' + hp + '|' + max + '|' + fx.ticks.join(',') + '|' + fx.phase + '|' + state;
    if (key === bossKey && !bossHudEl.hidden) return;
    bossKey = key;
    bossTitleEl.textContent = g.district + '구역 대장';
    bossNameEl.textContent = BOSS_NAME[b.arch] || BOSS_NAME.armor;
    if (bossFillEl.style) bossFillEl.style.width = (f * 100).toFixed(2) + '%';
    bossBarEl.setAttribute('aria-valuenow', String(pct));
    bossHpEl.textContent = hp + ' / ' + max + ' · ' + pct + '%';
    bossHudEl.setAttribute('data-arch', b.arch);
    bossHudEl.setAttribute('data-phased', fx.ticks.length ? '1' : '0');
    bossHudEl.setAttribute('data-phase', String(fx.phase));
    bossHudEl.setAttribute('data-state', state);
    bossStateEl.textContent = fx.roar ? ROAR_TEXT + ' ' + fx.phase + PHASE_TEXT : fx.weak ? WEAK_TEXT : '';
    bossStateEl.hidden = !state;
    bossTicksEl.textContent = '';
    for (const t of fx.ticks) {   // phase thresholds on the big bar (66% / 33% for district 1, any list the sim gives)
      const m = document.createElement('i');
      m.className = 'phaseTick';
      m.setAttribute('data-at', String(Math.round(t * 100)));
      m.setAttribute('data-passed', f <= t ? '1' : '0');
      if (m.style) m.style.left = (t * 100).toFixed(2) + '%';
      bossTicksEl.appendChild(m);
    }
    bossHudEl.hidden = false;
  }
  function hideHud() { bannerT = 0; tipT = 0; tipQ = []; bannerEl.hidden = true; tipEl.hidden = true; bossCut = null; hideBoss(); }
  function startHud() {
    hideHud(); loadTips();
    if (g.district !== 1) return;
    bannerEl.textContent = '1구역: 봉쇄 초소 ' + g.postsTotal + '개를 무너뜨려라';
    bannerEl.setAttribute('data-kind', 'goal'); bannerEl.hidden = false; bannerT = BANNER_S;
  }
  // Zone 1 act shift banner: sim actShift sets g.alarm and pushes 'alarm' once per broken post. Same #goalBanner and timer as the goal banner
  // (frozen under the mutation pick, hidden by hideHud), tinted by data-kind="alarm": progress + alarm, then the elite / boss notice.
  const ACT_S = 2.8;
  function actText(a) {
    const head = a.postsDown + '/' + a.postsTotal + ' 초소 함락';
    if (a.last) return head + ' · ' + (a.elite ? '돌격조와 대장 출현!' : '대장 출현!');
    return head + ', 경보! · ' + (a.elite ? '돌격조 접근' : a.act + '막 증원이 온다');
  }
  function actBanner() {
    const a = g && g.acts ? g.alarm : null;
    if (!a) return false;
    bannerEl.textContent = actText(a); bannerEl.setAttribute('data-kind', 'alarm');
    bannerEl.hidden = false; bannerT = ACT_S;   // hud() hides it again while the mutation pick is open
    return true;
  }
  function hud(dt) {
    // Mutation pick (g.choice) covers the board: hide guidance and freeze its timers/queue so nothing is consumed or saved unseen
    if (g.choice) { bannerEl.hidden = true; tipEl.hidden = true; return; }
    if (bannerT > 0) bannerEl.hidden = false;   // restore what the pick interrupted
    if (tipT > 0) tipEl.hidden = false;
    if (bannerT > 0 && (bannerT -= dt) <= 0) { bannerT = 0; bannerEl.hidden = true; }
    if (g.units.some(u => u.state === 'ok' && S.isFrenzy(u))) tip('ripe');   // gauge reached 80%
    if (tipT > 0 && (tipT -= dt) <= 0) { tipT = 0; tipEl.hidden = true; }
    if (tipT <= 0 && tipQ.length) {
      const k = tipQ.shift();
      tipSeen[k] = true; saveTips();
      tipEl.textContent = TIPS[k]; tipEl.setAttribute('data-tip', k); tipEl.hidden = false; tipT = TIP_S;
    }
  }
  loadTips(); hideHud();

  // opts: { district }. 없으면 아직 못 깬 다음 구역. 어느 경로로 시작하든 골드로 산 시작 강화를 넣는다.
  function start(opts) {
    Sound.on();
    reload();
    const district = opts && opts.district ? opts.district : save.cur + 1;
    // An explicit opts.starter wins (and becomes the shown selection); otherwise the kind picked on the title/end screen.
    if (opts && S.KINDS.includes(opts.starter)) selectStarter(opts.starter, 'start');
    else refreshStarter();
    // A held mutation seed is spent (and saved) here; the run then opens one 3-card mutation pick before play.
    const sd = S.Save.useSeed(save);
    if (sd.ok) { save = sd.save; persist(); }
    g = S.newGame(seed++, { district, start: { hp: save.up.hp, stat: save.up.stat }, mutSeed: sd.ok, starter });
    mode = 'play'; shake = 0; flash = 0; hitstop = 0; lastTap = null; victory = null; hideVictory();
    titleEl.hidden = true; endEl.hidden = true; mutEl.hidden = true; mutFor = null;
    rwStop(); endStep = 0;   // a restart drops any pending result-screen reveal timer
    setHelp(false);
    paused = false; pauseEl.hidden = true;
    scorch = []; debris = []; popups = []; subN = 0;
    startHud();
    inp.x = inp.y = 0; stick = null;
  }
  document.getElementById('startBtn').addEventListener('click', () => start());
  document.getElementById('againBtn').addEventListener('click', () => start({ district: retryDistrict }));
  const downBtn = document.getElementById('downBtn');
  let downDistrict = 0;   // 진 끝 화면의 '내려가기' 버튼이 여는 구역(0이면 버튼 없음)
  downBtn.addEventListener('click', () => { if (downDistrict) start({ district: downDistrict }); });

  // 누르고 끌면 이동. 두 번 톡톡 치면 자폭(탈피). 키메라를 한 번 톡 누르면 먹일 대상으로 찍는다.
  cv.addEventListener('pointerdown', e => {
    if (mode === 'title') { titleTap(e); return; }   // home: tapping a summon on the stage picks the first summon
    if (mode !== 'play' || paused || victory) return;   // 멈춤 덮개가 떠 있으면 새로 끌지 않는다
    cv.setPointerCapture(e.pointerId);
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, at: performance.now(), far: 0 };
  });
  cv.addEventListener('pointermove', e => {
    if (!stick || e.pointerId !== stick.id) return;
    stick.x = e.clientX; stick.y = e.clientY;
    stick.far = Math.max(stick.far, Math.hypot(stick.x - stick.x0, stick.y - stick.y0));
  });
  // 위쪽 키메라 칸 셋의 자리(화면 좌표). 그리기와 누르기가 같은 값을 쓴다.
  function hudSlots(w) {
    const pad = 16, slotW = Math.min(104, (w - pad * 2 - 56) / 3), out = [];
    for (let i = 0; i < S.CFG.maxUnits; i++) out.push({ x: pad + i * (slotW + 6), y: 44, w: slotW, h: 24 });
    return out;
  }
  function tapAt(cx, cy) {
    const now = performance.now();
    if (lastTap && now - lastTap.t < TAP_MS) {
      clearTimeout(lastTap.timer); lastTap = null;
      S.detonate(g);
      return;
    }
    const r = cv.getBoundingClientRect();
    const hud = hudSlots(r.width);
    for (let i = 0; i < hud.length; i++) {
      const b = hud[i], lx = cx - r.left, ly = cy - r.top;
      if (g.units[i] && lx >= b.x - 4 && lx <= b.x + b.w + 4 && ly >= b.y - 14 && ly <= b.y + b.h + 22) { S.pin(g, g.units[i].uid); return; }
    }
    const wp = V ? V.toWorld(cx - r.left, cy - r.top) : null;
    const wx = wp ? wp.x : (cx - r.left) * dpr / scale + camX, wy = wp ? wp.y : (cy - r.top) * dpr / scale + camY;
    const game = g;
    // 누른 순간 손가락 아래에 있던 키메라를 기억해 둔다(확정될 때는 이미 움직였을 수 있다)
    let best = null, bd = 1e9;
    for (const u of g.units) { const d = Math.hypot(u.x - wx, u.y - wy) - u.r; if (d < 1.0 && d < bd) { bd = d; best = u; } }
    const uid = best ? best.uid : null;
    lastTap = { t: now, timer: setTimeout(() => {
      lastTap = null;
      if (game !== g || mode !== 'play' || uid === null) return;
      S.pin(g, uid);
    }, TAP_MS) };
  }
  cv.addEventListener('pointerup', e => {
    if (!stick || e.pointerId !== stick.id) return;
    if (mode === 'play' && performance.now() - stick.at < 300 && stick.far < 14) tapAt(e.clientX, e.clientY);
    stick = null;
  });
  cv.addEventListener('pointercancel', e => { if (stick && e.pointerId === stick.id) stick = null; });
  window.addEventListener('keydown', e => {
    if (!helpEl.hidden) { if (e.key === 'Escape') setHelp(false); else if (e.key === 'Tab') trapHelpFocus(e); return; }
    if (paused) { if (e.key === 'Enter' || e.key === ' ') resumePlay(); return; }   // 멈춘 동안의 키는 판에 넣지 않는다
    keys[e.key] = true; if (e.key === ' ' && mode === 'play' && !victory) S.detonate(g);
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  function readInput() {
    let x = 0, y = 0;
    if (stick) {
      const R = 56;
      x = (stick.x - stick.x0) / R; y = (stick.y - stick.y0) / R;
      const m = Math.hypot(x, y);
      if (m < 0.15) { x = 0; y = 0; } else if (m > 1) { x /= m; y /= m; }
    }
    if (keys.ArrowLeft || keys.a) x -= 1;
    if (keys.ArrowRight || keys.d) x += 1;
    if (keys.ArrowUp || keys.w) y -= 1;
    if (keys.ArrowDown || keys.s) y += 1;
    if (V) { const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } [x, y] = V.rotateInput(x, y); }   // 화면 위쪽으로 끌면 화면 위쪽으로 간다
    inp.x = x; inp.y = y;
  }

  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function bar(x, y, w, f, col) {
    ctx.fillStyle = COL.grid; ctx.fillRect(x - w / 2, y, w, 0.14);
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 0.14);
  }
  // 유전자는 모양으로도 구별한다: 맹수 세모, 갑주 네모, 사수 원.
  function shape(kind, r) {
    ctx.beginPath();
    if (kind === 'beast') { ctx.moveTo(r * 1.25, 0); ctx.lineTo(-r * 0.85, r * 1.0); ctx.lineTo(-r * 0.85, -r * 1.0); ctx.closePath(); }
    else if (kind === 'armor') ctx.rect(-r * 0.92, -r * 0.92, r * 1.84, r * 1.84);
    else ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  function mix(c1, c2, k) {
    const p = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    if (!/^#[0-9a-f]{6}$/i.test(c1) || !/^#[0-9a-f]{6}$/i.test(c2)) return k > 0.5 ? c2 : c1;
    const a = p(c1), b = p(c2);
    return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
  }
  // 판 좌표 → 화면 좌표(CSS px). h는 땅에서의 높이(3D에서만 쓴다)
  const scr = (x, y, h) => V ? V.toScreen(x, y, h || 0) : [(x - camX) * scale / dpr, (y - camY) * scale / dpr];

  // 키메라: 주 유전자가 몸의 모양이고, 섞인 유전자가 개수만큼 몸에 들러붙는다
  // (맹수 가시, 갑주 장갑판, 사수 눈알). 불안정도가 오르면 붉게 달아오르고 떤다.
  function drawUnit(u, now) {
    const gn = u.genes, k = 1 + (reduced ? 0 : u.pop * 0.8), r = u.r * k, frenzy = S.isFrenzy(u);
    const heat = Math.min(1, u.inst / 100);
    const amp = reduced ? 0 : (heat > 0.4 ? (heat - 0.4) * 0.16 : 0) * (frenzy ? 1.8 : 1);
    const jx = amp ? Math.sin(now / 23 + u.uid) * amp : 0, jy = amp ? Math.cos(now / 19 + u.uid * 2) * amp : 0;
    const blink = frenzy && !reduced && Math.floor(now / 110) % 2 === 0;
    ctx.save();
    const lg = lungeOf(u);
    ctx.translate(u.x + jx + Math.cos(u.face) * lg, u.y + jy + Math.sin(u.face) * lg);
    ctx.globalAlpha = u.down > 0 ? 0.3 : 1;
    ctx.rotate(u.face);
    const sb = u.main === 'beast' ? 0 : gn.beast, sa = u.main === 'armor' ? 0 : gn.armor, sr = u.main === 'ranger' ? 0 : gn.ranger;
    // 맹수가 섞였다: 등과 옆구리의 가시
    const spikes = Math.min(sb, 12);
    ctx.fillStyle = COL.beast;
    for (let i = 0; i < spikes; i++) {
      const a = Math.PI + (i - (spikes - 1) / 2) * 0.42;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.16) * r * 0.9, Math.sin(a - 0.16) * r * 0.9);
      ctx.lineTo(Math.cos(a) * r * 1.75, Math.sin(a) * r * 1.75);
      ctx.lineTo(Math.cos(a + 0.16) * r * 0.9, Math.sin(a + 0.16) * r * 0.9);
      ctx.closePath(); ctx.fill();
    }
    // 몸: 불안정도에 따라 뼈 색에서 붉은색으로
    ctx.fillStyle = blink ? COL.danger : mix(COL.bone, COL.danger, heat * 0.85);
    ctx.strokeStyle = u.mutant ? COL.great : COL[u.main]; ctx.lineWidth = r * (u.mutant ? 0.26 : 0.2); ctx.lineJoin = 'round';
    shape(u.main, r); ctx.fill(); ctx.stroke();
    // 주 유전자가 많을수록 몸 안에 같은 모양이 겹겹이 생긴다
    ctx.strokeStyle = COL[u.main]; ctx.lineWidth = r * 0.08;
    for (let i = 1; i < Math.min(gn[u.main], 5); i++) { shape(u.main, r * (1 - i * 0.18)); ctx.stroke(); }
    // 갑주가 섞였다: 앞을 두르는 장갑판
    const plates = Math.min(sa, 8);
    ctx.fillStyle = COL.armor;
    for (let i = 0; i < plates; i++) {
      const a = (i - (plates - 1) / 2) * 0.46;
      ctx.save(); ctx.rotate(a); ctx.fillRect(r * 1.12, -r * 0.2, r * 0.3, r * 0.4); ctx.restore();
    }
    // 사수가 섞였다: 몸에 돋은 눈알
    const eyes = Math.min(sr, 8);
    for (let i = 0; i < eyes; i++) {
      const a = Math.PI / 2 + i * (Math.PI * 2 / Math.max(eyes, 3)), ex = Math.cos(a) * r * 0.62, ey = Math.sin(a) * r * 0.62;
      ctx.fillStyle = COL.ranger; circle(ex, ey, r * 0.2); ctx.fill();
      ctx.fillStyle = COL.ground; circle(ex + r * 0.05, ey, r * 0.08); ctx.fill();
    }
    ctx.restore();

    // 불안정도 고리: 다 차면 터진다
    if (u.inst > 0 && u.state === 'ok') {
      ctx.strokeStyle = COL.danger; ctx.lineWidth = frenzy ? 0.16 : 0.1;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 0.38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * heat); ctx.stroke();
    }
    if (g.pinned === u.uid) {
      ctx.fillStyle = COL.necro;
      ctx.beginPath(); ctx.moveTo(u.x, u.y - u.r - 0.55); ctx.lineTo(u.x - 0.22, u.y - u.r - 0.95); ctx.lineTo(u.x + 0.22, u.y - u.r - 0.95); ctx.closePath(); ctx.fill();
    }
    const mh = S.stats(u).maxHp;
    // 익은 채(80~99%)면 체력이 샌다: 막대를 빨갛게 늘 보이고, 핏방울이 떨어진다.
    if (u.down <= 0 && u.state === 'ok' && frenzy && !u.mad) {   // 광폭 유지면 체력이 새지 않는다
      bar(u.x, u.y + u.r + 0.3, Math.max(1, u.r * 1.6), u.hp / mh, COL.danger);
      if (!reduced) for (let i = 0; i < 3; i++) { const k = (now / 700 + i / 3 + u.uid * 0.37) % 1; ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = COL.danger; circle(u.x + (i - 1) * u.r * 0.5, u.y + u.r * 0.4 + k * 1.1, 0.12); ctx.fill(); ctx.restore(); }
    }
    else if (u.down <= 0 && u.hp < mh && u.state === 'ok') bar(u.x, u.y + u.r + 0.3, Math.max(1, u.r * 1.6), u.hp / mh, COL.bone);
    if (u.down > 0) {
      ctx.strokeStyle = COL.bone; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 0.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.down / 6)); ctx.stroke();
    }
    if (u.state === 'rush') { ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.tx, u.ty); ctx.stroke(); }
  }

  // 진압 대장: 종류마다 몸 색과 모양이 다르다 (armor: shield, beast: horns, ranger: scope)
  const BOSS_LOOK = {
    armor: { body: 'armor', edge: 'danger', accent: 'danger', mark: 'shield' },
    beast: { body: 'beast', edge: 'danger', accent: 'danger', mark: 'horns' },
    ranger: { body: 'ranger', edge: 'danger', accent: 'great', mark: 'scope' },
  };
  const bossLook = e => (e && e.boss ? BOSS_LOOK[e.arch] || BOSS_LOOK.armor : null);
  // Lap 2+ (district 4+) assist pattern, read from the real sim fields (lap, summon, chainMax). Lap 1 bosses: none.
  const bossAssist = e => {
    if (!e || !e.boss || !(e.lap >= 1)) return [];
    const out = [];
    if (e.summon) out.push({ k: 'summon', text: '+수비대 소환' });
    if (e.chainMax > 0) out.push({ k: 'chain', text: '+연속 돌진' });
    return out;
  };
  const bossTag = e => bossAssist(e).map(a => a.text).join(' · ');
  const SUMMON_WARN = 1.2;   // seconds before an assist summon: ring telegraph around the boss
  // Phased boss effects in board units: roar shockwaves and glow under the body, weak point aura under it and target brackets over it.
  function drawBossUnder(e, now) {
    if (bossRoaring(e)) {
      const k = Math.max(0, Math.min(1, e.roarT / ROAR_T)), el = Math.max(0, ROAR_T - e.roarT);
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.22 * k; ctx.fillStyle = COL.danger; circle(e.x, e.y, e.r + 1.2); ctx.fill();
      if (reduced) { ctx.globalAlpha = 0.9; ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.18; circle(e.x, e.y, e.r + 1.6); ctx.stroke(); }
      else for (let i = 0; i < 3; i++) {
        const q = (el * 1.4 + i / 3) % 1;
        ctx.globalAlpha = (1 - q) * 0.95; ctx.strokeStyle = i % 2 ? COL.great : COL.danger; ctx.lineWidth = 0.22 * (1 - q) + 0.05;
        circle(e.x, e.y, e.r + 0.4 + q * 3.6); ctx.stroke();
      }
      ctx.restore();
    }
    if (bossWeak(e)) {
      const p = reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 120);
      ctx.save(); ctx.globalAlpha = 0.25 * p; ctx.fillStyle = COL.great; circle(e.x, e.y, e.r + 0.35); ctx.fill(); ctx.restore();
    }
  }
  function drawBossOver(e, now) {
    if (bossWeak(e)) {
      const p = reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 120), rot = reduced ? 0 : now / 350, R = e.r + 0.45 + 0.25 * p;
      ctx.save(); ctx.strokeStyle = COL.great; ctx.lineWidth = 0.16; ctx.globalAlpha = 0.95;
      for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; ctx.beginPath(); ctx.arc(e.x, e.y, R, a + 0.25, a + Math.PI / 2 - 0.25); ctx.stroke(); }
      ctx.globalAlpha = 0.6 + 0.3 * p; ctx.lineWidth = 0.1; ctx.strokeStyle = COL.ink; ctx.setLineDash([0.3, 0.2]); ctx.lineDashOffset = reduced ? 0 : now / 300;
      circle(e.x, e.y, e.r + 1.2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    if (bossRoaring(e) && !reduced) {
      ctx.save(); ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(now / 70)); ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.14;
      circle(e.x, e.y, e.r * 1.15); ctx.stroke(); ctx.restore();
    }
  }
  function drawEnemy(e, now) {
    if (e.elite && (e.mode === 'warn' || e.mode === 'aim')) {
      // 돌진 예고: 겨눈 방향으로 붉은 길이 깔린다
      const a = e.face, L = 40, w = 0.9 + (reduced ? 0 : 0.25 * Math.sin(now / 60));
      ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = COL.danger; ctx.lineWidth = e.r * 2 * w;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * L, e.y + Math.sin(a) * L); ctx.stroke();
      ctx.restore();
    }
    if (e.boss && e.summon && e.summonT < SUMMON_WARN) {   // assist summon telegraph (any arch with the summon flag)
      const k = 1 - Math.max(0, e.summonT) / SUMMON_WARN;
      ctx.save(); ctx.globalAlpha = 0.4 + 0.5 * k; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.12;
      ctx.setLineDash([0.35, 0.25]); ctx.lineDashOffset = reduced ? 0 : -now / 300;
      circle(e.x, e.y, e.r + 0.6 + (1 - k) * 0.8); ctx.stroke(); ctx.restore();
    }
    if (e.boss) drawBossUnder(e, now);
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.face);
    if (e.boss) {
      const lk = bossLook(e), r = e.r;
      ctx.fillStyle = COL[lk.body]; ctx.strokeStyle = COL[lk.edge]; ctx.lineWidth = 0.16;
      shape(e.arch, r); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL[lk.accent];
      if (lk.mark === 'shield') { ctx.fillRect(r * 0.95, -r * 0.85, r * 0.28, r * 1.7); ctx.fillRect(-r * 0.5, -r * 1.1, r * 0.7, r * 0.22); ctx.fillRect(-r * 0.5, r * 0.88, r * 0.7, r * 0.22); }
      else if (lk.mark === 'horns') { for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.55, s * r * 0.3); ctx.lineTo(r * 1.15, s * r * 0.95); ctx.lineTo(r * 0.25, s * r * 0.6); ctx.closePath(); ctx.fill(); } }
      else { ctx.strokeStyle = COL[lk.accent]; ctx.lineWidth = 0.1; circle(0, 0, r * 0.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 0.6, 0); ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, r * 0.6); ctx.stroke(); }
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.moveTo(r * 1.7, 0); ctx.lineTo(r * 0.9, r * 0.4); ctx.lineTo(r * 0.9, -r * 0.4); ctx.closePath(); ctx.fill();
    } else if (e.elite) {
      ctx.fillStyle = COL.danger; ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.1;
      shape(e.arch, e.r); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.moveTo(e.r * 1.7, 0); ctx.lineTo(e.r * 0.9, e.r * 0.4); ctx.lineTo(e.r * 0.9, -e.r * 0.4); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = COL[e.arch]; ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.07;
      shape(e.arch, e.r); ctx.fill(); ctx.stroke();
      if (e.g >= 2) { ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.06; shape(e.arch, e.r * 0.55); ctx.stroke(); }
    }
    ctx.restore();
    if (e.boss) {   // 대장: 머리 위 금빛 표시
      const cy = e.y - e.r - 0.75;
      ctx.fillStyle = COL.great; ctx.beginPath();
      ctx.moveTo(e.x - 0.45, cy + 0.25); ctx.lineTo(e.x - 0.45, cy - 0.1); ctx.lineTo(e.x - 0.22, cy + 0.08); ctx.lineTo(e.x, cy - 0.22); ctx.lineTo(e.x + 0.22, cy + 0.08); ctx.lineTo(e.x + 0.45, cy - 0.1); ctx.lineTo(e.x + 0.45, cy + 0.25);
      ctx.closePath(); ctx.fill();
    }
    if (e.boss) drawBossOver(e, now);
    if (e.stun > 0) { ctx.strokeStyle = COL.great; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.arc(e.x, e.y - e.r - 0.3, 0.2, now / 90, now / 90 + 4.5); ctx.stroke(); }
    const ticks = e.boss ? bossTicks(e) : [];
    if (e.hp < e.maxHp || ticks.length) {   // phased boss: bar always shown with its phase ticks (passed ones dim)
      const bw = e.elite ? 2 : 0.9, by = e.y - e.r - 0.35, hf = e.hp / e.maxHp;
      bar(e.x, by, bw, hf, COL.danger);
      for (const t of ticks) { ctx.fillStyle = hf <= t ? COL.dim : COL.great; ctx.fillRect(e.x - bw / 2 + bw * t - 0.03, by - 0.05, 0.06, 0.24); }
    }
    if (e.flash > 0) { ctx.save(); ctx.globalAlpha = e.flash / S.CFG.hit.flash * 0.8; ctx.fillStyle = '#fff'; circle(e.x, e.y, e.r * 1.05); ctx.fill(); ctx.restore(); }   // 맞으면 하얗게 번쩍
  }

  function label(text, x, y, size, col) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = COL.ground; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
  }

  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (V) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!g) return;
      V.render(g, now, { shake: reduced ? 0 : shake, reduced, scorch, scorchT: SCORCH_T, title: mode === 'title', starter, focus: mode === 'title' ? null : camFocus() });
    } else {
      ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, cv.width, cv.height);
      if (!g) return;
      if (mode === 'title') drawTitleStage2D(now); else drawWorld2D(now);
    }
    if (flash > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = victory ? Math.min(1, flash / 0.3) * 0.7 : Math.min(1, flash / 0.14) * 0.45; ctx.fillStyle = '#fff6e0'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
    if (mode !== 'title') drawScreen(now);   // home: the board shows through the clear stage without the in-play HUD
  }

  // Barricades: g.obstacles = [{ x, y, hw, hh }] (axis-aligned boxes, see sim.js barricadesFor/pushOutOf).
  // The filled body is exactly the collision box [x-hw, x+hw] x [y-hh, y+hh]; a drop shadow, hazard stripes and an ink edge set it apart from floor, posts and units.
  let drawnObs = [];
  function drawObstacles() {
    const list = g && Array.isArray(g.obstacles) ? g.obstacles : [];
    drawnObs = [];
    for (const b of list) {
      if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !(b.hw > 0) || !(b.hh > 0)) continue;
      const x0 = b.x - b.hw, y0 = b.y - b.hh, w = b.hw * 2, h = b.hh * 2;
      ctx.save();
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#000000'; ctx.fillRect(x0 + 0.12, y0 + 0.16, w, h);   // shadow
      ctx.globalAlpha = 1; ctx.fillStyle = COL.dim; ctx.fillRect(x0, y0, w, h);   // body = collision box
      ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      ctx.strokeStyle = COL.great; ctx.lineWidth = 0.16; ctx.globalAlpha = 0.85;
      for (let s = -h; s < w + h; s += 0.5) { ctx.beginPath(); ctx.moveTo(x0 + s, y0 + h); ctx.lineTo(x0 + s + h, y0); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.08; ctx.strokeRect(x0, y0, w, h);
      drawnObs.push({ x: x0, y: y0, w, h });
    }
  }

  // Post hex outline (body, and the summon post's inner rune hex)
  function hexPath(x, y, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
  // Summon post (p.summon, district 2+): violet (necro) aura, turning dashed rune ring and three runes pointing in, plus the boss-style
  // gold ring closing in just before it calls escorts. Plain posts never get it; dead posts take the early return and lose it.
  let drawnPostMarks = [];
  function drawSummonMark(p, now) {
    const r = p.r, warn = p.summonT < SUMMON_WARN ? 1 - Math.max(0, p.summonT) / SUMMON_WARN : 0, rot = reduced ? 0 : now / 900;
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.25 * warn; ctx.fillStyle = COL.necro; circle(p.x, p.y, r + 0.6); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = COL.necro; ctx.lineWidth = 0.14;
    ctx.setLineDash([0.4, 0.22]); ctx.lineDashOffset = reduced ? 0 : -now / 500;
    circle(p.x, p.y, r + 0.42); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.necro;
    for (let i = 0; i < 3; i++) {
      const a = rot + i * Math.PI * 2 / 3, c = Math.cos(a), s = Math.sin(a), R = r + 0.95;
      ctx.beginPath(); ctx.moveTo(p.x + c * (r + 0.6), p.y + s * (r + 0.6)); ctx.lineTo(p.x + c * R - s * 0.22, p.y + s * R + c * 0.22); ctx.lineTo(p.x + c * R + s * 0.22, p.y + s * R - c * 0.22); ctx.closePath(); ctx.fill();
    }
    if (warn > 0) { ctx.globalAlpha = 0.4 + 0.5 * warn; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.12; circle(p.x, p.y, r + 0.6 + (1 - warn) * 0.8); ctx.stroke(); }
    ctx.restore();
    drawnPostMarks.push({ x: p.x, y: p.y, warn });
  }
  // 봉쇄 초소: 폭발로만 부서진다. 옅은 원이 사격 범위, 위의 칸이 남은 내구도.
  function drawPost(p, n, now) {
    if (p.dead) { ctx.strokeStyle = COL.grid; ctx.lineWidth = 0.1; circle(p.x, p.y, p.r); ctx.stroke(); return; }
    // 사정거리: 이 원 안에 네크로맨서가 들어가면 쏜다. 들어가 있는 동안은 진하게 보인다.
    const inside = Math.hypot(p.x - n.x, p.y - n.y) < S.CFG.postRange;
    ctx.save();
    ctx.globalAlpha = inside ? 0.16 : 0.06; ctx.fillStyle = COL.danger; circle(p.x, p.y, S.CFG.postRange); ctx.fill();
    ctx.globalAlpha = inside ? 0.95 : 0.55; ctx.strokeStyle = COL.danger; ctx.lineWidth = inside ? 0.12 : 0.08;
    ctx.setLineDash([0.45, 0.3]); ctx.lineDashOffset = reduced ? 0 : -now / 700;
    circle(p.x, p.y, S.CFG.postRange); ctx.stroke();
    ctx.restore();
    if (p.summon) drawSummonMark(p, now);
    ctx.fillStyle = COL.dim; ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.1;
    hexPath(p.x, p.y, p.r); ctx.fill(); ctx.stroke();
    if (p.summon) { ctx.strokeStyle = COL.necro; ctx.lineWidth = 0.1; hexPath(p.x, p.y, p.r * 0.62); ctx.stroke(); }
    ctx.fillStyle = Math.floor(now / 400) % 2 ? COL.danger : COL.great; circle(p.x, p.y, 0.22); ctx.fill();
    for (let i = 0; i < p.maxHp; i++) { ctx.fillStyle = i < p.hp ? COL.ink : COL.grid; ctx.fillRect(p.x - 0.45 + i * 0.5, p.y - p.r - 0.5, 0.4, 0.18); }
  }

  function drawWorld2D(now) {
    const vh = cv.height / scale, n = g.necro, fc = camFocus();   // fc: the necromancer, or the boss intro cut blend
    camX = Math.max(0, Math.min(S.W - VIEW_W, fc.x - VIEW_W / 2));
    camY = vh >= S.H ? (S.H - vh) / 2 : Math.max(0, Math.min(S.H - vh, fc.y - vh / 2));
    const shx = shake > 0 && !reduced ? (Math.random() - 0.5) * shake * 1.2 : 0, shy = shake > 0 && !reduced ? (Math.random() - 0.5) * shake * 1.2 : 0;
    ctx.setTransform(scale, 0, 0, scale, (-camX + shx) * scale, (-camY + shy) * scale);

    ctx.strokeStyle = COL.grid; ctx.lineWidth = 0.03;
    for (let x = 0; x <= S.W; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke(); }
    for (let y = 0; y <= S.H; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.W, y); ctx.stroke(); }
    ctx.lineWidth = 0.08; ctx.strokeRect(0, 0, S.W, S.H);

    // 혼: 불량은 작고 흐리다. 신선한 것은 푸른 고리, 순혈 코어는 크고 금빛으로 뛴다.
    // 바닥 그을음: 익은 폭발 자리, 4.5초 동안 옅어진다
    drawObstacles();   // above the floor, below souls/units/UI
    for (const s of scorch) { const a = s.t / SCORCH_T; ctx.save(); ctx.fillStyle = '#3a1a12'; for (let i = 0; i < 3; i++) { ctx.globalAlpha = a * 0.33; circle(s.x, s.y, s.r * (1 - i * 0.28)); ctx.fill(); } ctx.restore(); }
    for (const s of g.souls) {
      if (s.ttl < 3 && Math.floor(now / 120) % 2 === 0) continue;
      const pulse = reduced ? 1 : 1 + 0.1 * Math.sin(now / 150 + s.x);
      ctx.save(); ctx.translate(s.x, s.y);
      if (s.q === 1) { ctx.globalAlpha = 0.6; ctx.fillStyle = COL[s.type]; shape(s.type, 0.26); ctx.fill(); }
      else if (s.q === 2) {
        ctx.fillStyle = COL[s.type]; shape(s.type, 0.36); ctx.fill();
        ctx.strokeStyle = COL.armor; ctx.lineWidth = 0.08; circle(0, 0, 0.62 * pulse); ctx.stroke();
      } else {
        ctx.fillStyle = COL.great; shape(s.type, 0.5); ctx.fill();
        ctx.strokeStyle = COL.great; ctx.lineWidth = 0.12; circle(0, 0, 0.85 * pulse); ctx.stroke();
        ctx.strokeStyle = COL.necro; ctx.lineWidth = 0.07; circle(0, 0, 1.1 * pulse); ctx.stroke();
      }
      ctx.restore();
    }
    // 변이 심장: 터진 키메라가 남긴 것. 고리가 남은 시간이고, 금빛일 때 주우면 유전자를 다 물려받는다.
    for (const h of g.hearts) {
      const pulse = reduced || h.wait > 0 ? 1 : 1 + 0.18 * Math.abs(Math.sin(now / 180)), full = h.age <= S.CFG.heartFullFor && !(h.wait > 0);
      ctx.save(); ctx.translate(h.x, h.y);
      if (h.wait > 0) ctx.globalAlpha = 0.35;   // 덜 익은 채 터진 심장: 식을 때까지 주울 수 없다
      ctx.fillStyle = COL.danger; ctx.strokeStyle = full ? COL.great : COL.ink; ctx.lineWidth = 0.1;
      ctx.beginPath(); ctx.moveTo(0, 0.55 * pulse); ctx.lineTo(0.5 * pulse, 0); ctx.lineTo(0.25 * pulse, -0.4 * pulse); ctx.lineTo(0, -0.18 * pulse); ctx.lineTo(-0.25 * pulse, -0.4 * pulse); ctx.lineTo(-0.5 * pulse, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = full ? COL.great : COL.dim; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(0, 0, 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h.ttl / S.CFG.heartTtl)); ctx.stroke();
      ctx.restore();
    }

    drawnPostMarks = [];
    for (const p of g.posts) drawPost(p, n, now);
    drawnBossFx = [];
    for (const e of g.enemies) { drawEnemy(e, now); if (e.boss) drawnBossFx.push(bossFxOf(e)); }

    // 예고 연결선: 이 혼을 밟으면 누가 먹는지. 먹으면 터질 참이면 붉다.
    if (g.link) {
      const u = g.units.find(x => x.uid === g.link.uid);
      if (u) {
        const soul = g.souls.find(s => s.x === g.link.x && s.y === g.link.y);
        const add = soul ? S.CFG.soul[soul.q].inst * (soul.q === 3 ? 1 : 1 + S.CFG.mut.gluttonyInst * (g.muts.gluttony || 0)) : 0, willPop = add > 0 && u.inst + add >= 100;   // 과식 본능이면 실제처럼 더 오른다
        ctx.save(); ctx.strokeStyle = willPop ? COL.danger : COL.necro; ctx.lineWidth = 0.14; ctx.setLineDash([0.3, 0.2]); ctx.lineDashOffset = reduced ? 0 : -now / 60;
        ctx.beginPath(); ctx.moveTo(g.link.x, g.link.y); ctx.lineTo(u.x, u.y); ctx.stroke();
        ctx.setLineDash([]); circle(u.x, u.y, u.r + 0.6); ctx.stroke(); circle(g.link.x, g.link.y, 0.75); ctx.stroke();
        if (add > 0) { ctx.globalAlpha = 0.45; ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.1; const a0 = -Math.PI / 2 + Math.PI * 2 * Math.min(1, u.inst / 100); ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 0.38, a0, a0 + Math.PI * 2 * Math.min(1 - u.inst / 100, add / 100)); ctx.stroke(); }
        ctx.restore();
      }
    }
    // 조준 표시: 지금 두 번 톡톡 치면 뛰어들 곳. 폭탄이 반 넘게 익었을 때만 보인다(익을수록 진하다).
    {
      const nb = S.nextBlast(g);
      if (nb && nb.target && nb.unit.inst >= 40) {
        const t = nb.target, rr = (t.r || 0.5) + 0.45, ripe = nb.unit.inst >= S.CFG.frenzyAt;
        ctx.save(); ctx.globalAlpha = ripe ? 1 : 0.55; ctx.strokeStyle = COL.danger; ctx.lineWidth = ripe ? 0.13 : 0.08;
        for (let i = 0; i < 4; i++) { const a0 = i * Math.PI / 2 + (reduced ? 0 : now / 500); ctx.beginPath(); ctx.arc(t.x, t.y, rr, a0 + 0.25, a0 + Math.PI / 2 - 0.25); ctx.stroke(); }
        ctx.restore();
      }
    }
    for (const u of g.units) drawUnit(u, now);

    // 맹수 소용돌이: 도는 붉은 고리 두 겹(끝날 무렵 옅어진다)
    for (const v of g.vortexes) {
      const a = Math.min(1, v.t / 0.5), rot = reduced ? 0 : now / 260;
      ctx.save(); ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = COL.danger;
      for (let j = 0; j < 2; j++) { const rr = v.r * (j ? 0.55 : 1), d = j ? -1.6 : 1; ctx.lineWidth = j ? 0.14 : 0.2;
        for (let i = 0; i < 3; i++) { const a0 = rot * d + i * Math.PI * 2 / 3; ctx.beginPath(); ctx.arc(v.x, v.y, rr, a0, a0 + Math.PI * 0.45); ctx.stroke(); } }
      ctx.restore();
    }
    // 사수 집속탄: 터지기 전까지 깜빡이는 점
    for (const b of g.clusters) { ctx.fillStyle = Math.floor(now / 70) % 2 ? COL.danger : COL.beast; circle(b.x, b.y, 0.28); ctx.fill(); }
    ctx.fillStyle = n.hurt > 0 ? COL.danger : COL.necro;
    circle(n.x, n.y, n.r); ctx.fill();
    // 갑주 방벽: 네크로맨서 둘레 두꺼운 푸른 원(1초 남으면 깜빡)
    if (n.shieldT > 0 && !(n.shieldT < 1 && Math.floor(now / 110) % 2)) { ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = COL.armor; ctx.lineWidth = 0.22; circle(n.x, n.y, n.r + 0.55); ctx.stroke(); ctx.restore(); }
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.08; circle(n.x, n.y, n.r + 0.16); ctx.stroke();
    ctx.fillStyle = COL.ground; circle(n.x, n.y, 0.16); ctx.fill();

    for (const f of g.fx) {
      if (f.k === 'hit') { ctx.strokeStyle = COL.ink; ctx.lineWidth = f.big ? 0.14 : 0.08; circle(f.x, f.y, 0.25 + (0.15 - f.t) * (f.big ? 6 : 3)); ctx.stroke(); }
      else if (f.k === 'shot') {
        ctx.strokeStyle = COL[f.arch]; ctx.lineWidth = f.uid ? 0.24 : f.arch === 'ranger' ? 0.14 : 0.07; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
        if (f.uid) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }   // 소환수 사수 탄: 굵고 밝은 심
      }
      else if (f.k === 'die') { ctx.strokeStyle = COL[f.arch]; ctx.lineWidth = f.big ? 0.2 : 0.1; circle(f.x, f.y, 0.4 + (0.35 - f.t) * (f.big ? 8 : 3)); ctx.stroke(); }
      else if (f.k === 'block') { ctx.strokeStyle = COL.armor; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.6, f.face - 1.1, f.face + 1.1); ctx.stroke(); }
      else if (f.k === 'raise') { ctx.strokeStyle = COL[f.arch]; ctx.lineWidth = 0.14; circle(f.x, f.y, 0.5 + (0.45 - f.t) * 3); ctx.stroke(); }
      else if (f.k === 'absorb') {
        const u = g.units.find(x => x.uid === f.uid); if (!u) continue;
        const k = 1 - f.t / 0.35, col = f.q === 3 ? COL.great : COL[f.type];
        ctx.strokeStyle = col; ctx.lineWidth = 0.18;
        ctx.beginPath(); ctx.moveTo(f.x + (u.x - f.x) * k, f.y + (u.y - f.y) * k); ctx.lineTo(u.x, u.y); ctx.stroke();
        ctx.lineWidth = 0.1; circle(u.x, u.y, u.r + 0.3 + k * 1.2); ctx.stroke();
      }
      else if (f.k === 'boom') {
        const k = 1 - f.t / (f.weak ? 0.4 : 0.7), el = (f.weak ? 0.4 : 0.7) - f.t;
        if (!f.weak) {   // 흰 섬광(0.08초) → 붉은 원 → 빠르게 퍼지는 얇은 금빛 충격파 두 겹
          if (el < 0.08) { ctx.save(); ctx.globalAlpha = 1 - el / 0.08; ctx.fillStyle = '#fff'; circle(f.x, f.y, f.r * 0.5); ctx.fill(); ctx.restore(); }
          for (const [sp, tt] of [[2.6, 0.3], [3.6, 0.45]]) if (el < tt) { const q = el / tt; ctx.save(); ctx.globalAlpha = 1 - q; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.09; circle(f.x, f.y, f.r * (0.4 + q * sp)); ctx.stroke(); ctx.restore(); }
        }
        ctx.save(); ctx.globalAlpha = (1 - k) * (f.weak ? 0.25 : 0.75); ctx.fillStyle = f.weak ? COL.dim : COL.danger; circle(f.x, f.y, f.r * (0.4 + k * 0.6)); ctx.fill();
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.weak ? COL.dim : COL.great; ctx.lineWidth = 0.3; circle(f.x, f.y, f.r * (0.3 + k)); ctx.stroke(); ctx.restore();
      }
      else if (f.k === 'wave') { const k = 1 - f.t / 0.3; ctx.strokeStyle = COL.armor; ctx.lineWidth = 0.22 * (1 - k) + 0.05; circle(f.x, f.y, f.r * k); ctx.stroke(); }
      else if (f.k === 'leap') { ctx.strokeStyle = COL.beast; ctx.lineWidth = 0.3 * (f.t / 0.25); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'volley') { ctx.save(); ctx.globalAlpha = f.t / 0.25 * 0.3; ctx.fillStyle = COL.ranger; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, 6.5, f.face - 0.7, f.face + 0.7); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (f.k === 'clash') { const k = 1 - f.t / 0.4; ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.2; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * (0.3 + k), f.y + Math.sin(a) * (0.3 + k)); ctx.lineTo(f.x + Math.cos(a) * (0.9 + k * 2), f.y + Math.sin(a) * (0.9 + k * 2)); ctx.stroke(); } }
      else if (f.k === 'rebirth') { const k = 1 - f.t / 0.6; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.2; circle(f.x, f.y, 0.4 + k * 2.4); ctx.stroke(); ctx.lineWidth = 0.08; circle(f.x, f.y, 0.4 + k * 4); ctx.stroke(); }
      else if (f.k === 'down') { ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.6 + (0.5 - f.t) * 2); ctx.stroke(); }
      else if (f.k === 'ripe') { const u = g.units.find(x => x.uid === f.uid), k = 1 - f.t / 0.6; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.2 * (1 - k) + 0.05; circle(u ? u.x : f.x, u ? u.y : f.y, 0.5 + k * 2.2); ctx.stroke(); }
      else if (f.k === 'subboom') { const k = 1 - f.t / 0.35; ctx.save(); ctx.globalAlpha = (1 - k) * 0.6; ctx.fillStyle = COL.danger; circle(f.x, f.y, f.r * (0.4 + k * 0.6)); ctx.fill(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.18; circle(f.x, f.y, f.r * (0.3 + k * 0.8)); ctx.stroke(); ctx.restore(); }
      else if (f.k === 'postfall') { const k = 1 - f.t / 0.9; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.3 * (1 - k) + 0.06; circle(f.x, f.y, 0.8 + k * 4); ctx.stroke(); }
    }

  }

  // 3D 판에서 화면 좌표로 그리는 것: 체력 막대, 초소 내구도, 기절 표시
  function drawMarks3D(now) {
    const sbar = (x, y, w, f, col) => { ctx.fillStyle = COL.grid; ctx.fillRect(x - w / 2, y, w, 4); ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 4); };
    const ppu = V.pxPerUnit();
    drawnBossFx = [];
    for (const e of g.enemies) {
      const [x, y] = scr(e.x, e.y, e.r * 2.2 + 0.4);
      const ticks = e.boss ? bossTicks(e) : [], bw = (e.elite ? 2 : 0.9) * ppu, hf = e.hp / e.maxHp;
      if (e.hp < e.maxHp || ticks.length) {
        sbar(x, y - 8, bw, hf, COL.danger);
        for (const t of ticks) { ctx.fillStyle = hf <= t ? COL.dim : COL.great; ctx.fillRect(x - bw / 2 + bw * t - 1, y - 10, 2, 8); }
      }
      if (e.boss) drawnBossFx.push(bossFxOf(e));
      if (e.stun > 0) { ctx.strokeStyle = COL.great; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 16, 5, now / 90, now / 90 + 4.5); ctx.stroke(); }
    }
    for (const p of g.posts) {
      if (p.dead) continue;
      const [x, y] = scr(p.x, p.y, 2.3);
      for (let i = 0; i < p.maxHp; i++) { ctx.fillStyle = i < p.hp ? COL.ink : COL.grid; ctx.fillRect(x - 0.45 * ppu + i * 0.5 * ppu, y - 6, 0.4 * ppu, 5); }
    }
    for (const u of g.units) {
      const mh = S.stats(u).maxHp;
      if (u.down > 0 || u.state !== 'ok') continue;
      const [x, y] = scr(u.x, u.y, 0), w = Math.max(1, u.r * 1.6) * ppu, by = y + u.r * ppu * 0.5 + 6;
      // 익은 채(80~99%)면 체력이 샌다: 막대를 빨갛게 늘 보이고, 핏방울이 떨어진다.
      if (S.isFrenzy(u) && !u.mad) {
        const ww = Math.max(36, w * 1.3);
        ctx.fillStyle = COL.grid; ctx.fillRect(x - ww / 2, by, ww, 7);
        ctx.fillStyle = COL.danger; ctx.fillRect(x - ww / 2, by, ww * Math.max(0, u.hp / mh), 7);
        if (!reduced) for (let i = 0; i < 3; i++) { const k = (now / 700 + i / 3 + u.uid * 0.37) % 1; ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.fillStyle = COL.danger; ctx.beginPath(); ctx.arc(x + (i - 1) * ww * 0.3, by + 10 + k * 22, 3.5 * (1 - k * 0.4), 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      }
      else if (u.hp < mh) sbar(x, by, w, u.hp / mh, COL.bone);
    }
  }

  // ---- 2D title stage (2d.html and the no-WebGL fallback) ----
  // A night street with the original art (art/*.png): the necromancer at the back center, the three summons in front (left/center/right).
  // The picked first summon (`starter`, same state as window.ChimeraTitle) steps forward, grows and glows; everyone breathes.
  // Drawing and tapping share stageLayout(). Without images (still loading, blocked, fake DOM) each figure falls back to its game shape.
  const STAGE_ART = { necro: 'art/necromancer.png', beast: 'art/chimera-beast.png', armor: 'art/chimera-armor.png', ranger: 'art/chimera-ranger.png' };
  const stageFwd = {};
  let stageImgs = null, stageT = null, stageDrawn = 0, stageFallback = 0;
  function stageArt() {
    if (stageImgs) return stageImgs;
    stageImgs = {};
    const Img = window.Image;
    for (const k in STAGE_ART) {
      let im = null;
      if (typeof Img === 'function') { try { im = new Img(); im.decoding = 'async'; im.src = STAGE_ART[k]; } catch (e) { im = null; } }
      stageImgs[k] = im;
    }
    return stageImgs;
  }
  const artReady = im => !!(im && im.complete && im.naturalWidth > 0 && im.naturalHeight > 0);
  // Figure slots in canvas CSS px: x, foot (y of the feet), h (height), f (0..1 how far the picked summon has stepped forward)
  function stageLayout() {
    const r = cv.getBoundingClientRect(), w = Math.max(1, r.width || 0), h = Math.max(1, r.height || 0);
    let top = h * 0.2, bot = h * 0.72;
    const hs = document.getElementById('homeStage'), sr = hs && hs.getBoundingClientRect ? hs.getBoundingClientRect() : null;
    if (sr && sr.height > 60) { top = Math.max(0, sr.top - r.top); bot = Math.min(h, sr.top - r.top + sr.height); }
    const bh = Math.max(60, bot - top), n = S.KINDS.length, gap = Math.min(w * 0.3, bh * 0.62);
    const heroH = Math.min(bh * 0.74, w * 0.6), sumH = Math.min(bh * 0.46, gap * 1.05);
    const slots = [{ k: 'necro', i: -1, x: w / 2, foot: top + bh * 0.64, h: heroH, f: 0 }];
    S.KINDS.forEach((k, i) => {
      const f = stageFwd[k] || 0;
      slots.push({ k, i, x: w / 2 + (i - (n - 1) / 2) * gap * (1 - 0.05 * f), foot: top + bh * (0.9 + 0.07 * f), h: sumH * (1 + 0.24 * f), f });
    });
    return { w, h, top, bot, slots };
  }
  function stagePick(px, py) {
    let best = null, bd = Infinity;
    for (const s of stageLayout().slots) {
      if (s.k === 'necro') continue;
      const hw = s.h * 0.5;
      if (px < s.x - hw || px > s.x + hw || py < s.foot - s.h || py > s.foot + s.h * 0.12) continue;
      const d = Math.hypot(px - s.x, py - (s.foot - s.h * 0.5)) - s.f * 20;   // the picked one (in front) wins where boxes overlap
      if (d < bd) { bd = d; best = s.k; }
    }
    return best;
  }
  // Home tap: the 3D stage picks with its own camera (V.pickTitle), the 2D stage with stageLayout(). Ignored while the controls panel is open.
  function titleTap(e) {
    if (mode !== 'title' || !helpEl.hidden) return null;
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const k = V ? (typeof V.pickTitle === 'function' ? V.pickTitle(px, py) : null) : stagePick(px, py);
    if (k && S.KINDS.includes(k)) selectStarter(k, 'stage');
    return k || null;
  }
  function drawTitleStage2D(now) {
    const art = stageArt(), dt = stageT == null ? 0 : Math.min(0.05, Math.max(0, (now - stageT) / 1000));
    stageT = now;
    for (const k of S.KINDS) { const want = k === starter ? 1 : 0, f = stageFwd[k] || 0; stageFwd[k] = reduced ? want : f + (want - f) * Math.min(1, dt * 7); }
    const L = stageLayout(), w = L.w, h = L.h, horizon = L.top + (L.bot - L.top) * 0.5;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0912'; ctx.fillRect(0, 0, w, h);
    // skyline with lit windows (fixed seed: the same street every frame)
    let sd = 23;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let x = -12; x < w + 12;) {
      const bw = 40 + rnd() * 50, bhh = Math.max(60, (horizon - L.top) * (0.6 + rnd() * 0.8) + 30), y0 = horizon - bhh;
      ctx.fillStyle = '#17131f'; ctx.fillRect(x, y0, bw, bhh);
      for (let wy = Math.max(y0 + 10, 4); wy < horizon - 14; wy += 17) for (let wx = x + 7; wx < x + bw - 12; wx += 14) {
        const q = rnd();
        if (q < 0.28) { ctx.globalAlpha = 0.3 + q * 1.5; ctx.fillStyle = q < 0.08 ? '#a99cff' : '#f2d35e'; ctx.fillRect(wx, wy, 6, 8); ctx.globalAlpha = 1; }
      }
      x += bw + 5;
    }
    // neon signs, sidewalk, asphalt with a dashed line, two street lamps
    const neon = ['necro', 'beast', 'armor', 'ranger'];
    for (let i = 0; i < neon.length; i++) {
      const nx = w * (0.12 + i * 0.25), ny = horizon - 46 - (i % 2) * 30, fl = reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 340 + i * 2.1);
      ctx.fillStyle = COL[neon[i]]; ctx.globalAlpha = 0.25 * fl; ctx.fillRect(nx - 30, ny - 14, 60, 30); ctx.globalAlpha = 0.9 * fl; ctx.fillRect(nx - 22, ny - 4, 44, 9);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.grid; ctx.fillRect(0, horizon, w, 10);
    ctx.fillStyle = COL.ground; ctx.fillRect(0, horizon + 10, w, Math.max(0, h - horizon - 10));
    ctx.fillStyle = COL.great; ctx.globalAlpha = 0.35;
    const laneY = horizon + (h - horizon) * 0.42;
    for (let x = 8; x < w; x += 46) ctx.fillRect(x, laneY, 26, 3);
    for (const lx of [w * 0.08, w * 0.92]) {
      ctx.globalAlpha = 1; ctx.fillStyle = '#3a3445'; ctx.fillRect(lx - 2, horizon - 86, 4, 96);
      ctx.fillStyle = COL.great; circle(lx, horizon - 88, 5); ctx.fill(); ctx.globalAlpha = 0.12; circle(lx, horizon - 70, 46); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // figures back to front: necromancer, the summons, the picked one last
    stageFallback = 0;
    for (const s of L.slots.slice().sort((a, b) => a.foot - b.foot)) {
      const im = art[s.k], br = reduced ? 0 : Math.sin(now / 820 + (s.i + 1) * 1.7);
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.ellipse(s.x, s.foot, s.h * 0.32, s.h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      if (s.k !== 'necro' && s.f > 0.02) {   // the picked summon: a glow of its color and a ring at its feet
        const p = reduced ? 1 : 0.85 + 0.15 * Math.sin(now / 260);
        ctx.globalAlpha = 0.22 * s.f * p; ctx.fillStyle = COL[s.k]; circle(s.x, s.foot - s.h * 0.45, s.h * 0.62); ctx.fill();
        ctx.globalAlpha = 0.9 * s.f; ctx.strokeStyle = COL[s.k]; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(s.x, s.foot, s.h * 0.46 * p, s.h * 0.1 * p, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.save();
      ctx.translate(s.x, s.foot);
      ctx.scale(1 - 0.012 * br, 1 + 0.03 * br);   // breathing: a slow swell from the feet up
      ctx.globalAlpha = s.k === 'necro' || s.k === starter ? 1 : 0.8;
      if (artReady(im)) {
        const dh = s.h, dw = dh * im.naturalWidth / im.naturalHeight;
        ctx.drawImage(im, -dw / 2, -dh, dw, dh);
      } else {
        stageFallback++;
        if (s.k === 'necro') {
          ctx.fillStyle = COL.necro; ctx.beginPath(); ctx.moveTo(0, -s.h * 0.78); ctx.lineTo(s.h * 0.24, 0); ctx.lineTo(-s.h * 0.24, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = COL.bone; circle(0, -s.h * 0.82, s.h * 0.09); ctx.fill();
        } else {
          ctx.translate(0, -s.h * 0.42);
          ctx.fillStyle = COL.bone; ctx.strokeStyle = COL[s.k]; ctx.lineWidth = s.h * 0.05; ctx.lineJoin = 'round';
          shape(s.k, s.h * 0.28); ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    stageDrawn++;
  }

  function drawScreen(now) {
    const n = g.necro;
    // 여기부터 화면 좌표(글자가 또렷하게 나오게)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const px = V ? V.pxPerUnit() : scale / dpr, w = cv.width / dpr, hh = cv.height / dpr, pad = 16, bw = w - pad * 2;
    if (V) drawMarks3D(now);
    drawJuice();
    for (const u of g.units) { const [x, y] = scr(u.x, u.y, u.r * 1.1); label(String(S.levelOf(u)), x, y, Math.max(13, u.r * px * 0.9), V ? COL.ink : COL.ground); }
    // boss name tag: only lap 2+ bosses get the assist pattern text above the crown
    for (const e of g.enemies) {
      if (!e.boss || e.dead) continue;
      const tag = bossTag(e), fx = bossFxOf(e), st = fx.roar ? ROAR_TEXT : fx.weak ? WEAK_TEXT : '';
      if (!tag && !st) continue;
      const [bx, by] = V ? scr(e.x, e.y, e.r * 2.2 + 0.4) : scr(e.x, e.y - e.r - 1.3);
      if (tag) label(tag, bx, by - (V ? 28 : 0), 12, COL.great);
      if (st) { const pz = reduced ? 1 : 1 + 0.08 * Math.sin(now / 90); label(st, bx, by - (V ? 28 : 0) - (tag ? 18 : 0) - 4, (fx.roar ? 18 : 14) * pz, fx.roar ? COL.danger : COL.great); }   // roar / weak point call-out over the boss
    }
    // 화면 밖에서 겨누는 돌격조: 가장자리에 느낌표
    for (const e of g.enemies) {
      if (!e.elite || (e.mode !== 'warn' && e.mode !== 'aim')) continue;
      const [qx, qy] = scr(e.x, e.y), ex = Math.max(26, Math.min(w - 26, qx)), ey = Math.max(belowBossHud(100), Math.min(hh - 30, qy));
      if (ex !== qx || ey !== qy) label('!', ex, ey, 34, COL.danger);
    }
    // 다음 목표(가장 가까운 초소, 다 부쉈으면 대장)가 화면 밖이면 가장자리에 표시한다
    {
      const goals = g.posts.filter(p => !p.dead).concat(g.boss && !g.boss.dead ? [g.boss] : []);
      let goal = null, gd = 1e9;
      for (const p of goals) { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < gd) { gd = d; goal = p; } }
      if (goal) {
        const [gx, gy] = scr(goal.x, goal.y), ex = Math.max(30, Math.min(w - 30, gx)), ey = Math.max(belowBossHud(104), Math.min(hh - 34, gy));
        if (ex !== gx || ey !== gy) {
          const a = Math.atan2(gy - ey, gx - ex);
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
          ctx.fillStyle = goal.boss ? COL.danger : COL.great; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, 11); ctx.lineTo(-8, -11); ctx.closePath(); ctx.fill();
          ctx.restore();
          label(Math.round(gd) + 'm', ex, ey + (ey > hh / 2 ? -22 : 22), 12, goal.boss ? COL.danger : COL.great);
        }
      }
    }

    // 화면 고정 표시: 남은 시간, 체력, 키메라 셋의 등급과 불안정도
    // 목적: 초소 칸(부수면 꺼진다)과 그 뒤의 대장 표시
    for (let i = 0; i < g.postsTotal; i++) { ctx.fillStyle = i < g.postsDown ? COL.grid : COL.great; ctx.fillRect(pad + i * 22, 10, 16, 9); }
    ctx.fillStyle = g.boss ? (g.boss.dead ? COL.grid : COL.danger) : COL.grid;
    ctx.beginPath(); ctx.moveTo(pad + g.postsTotal * 22 + 8, 6); ctx.lineTo(pad + g.postsTotal * 22 + 17, 14.5); ctx.lineTo(pad + g.postsTotal * 22 + 8, 23); ctx.lineTo(pad + g.postsTotal * 22 - 1, 14.5); ctx.closePath(); ctx.fill();
    // boss HP: the big DOM bar (#bossHud, bossStep) replaced the old 7px strip here
    ctx.fillStyle = COL.grid; ctx.fillRect(pad, 24, bw, 10);
    ctx.fillStyle = n.hp / n.maxHp < 0.3 ? COL.danger : COL.necro; ctx.fillRect(pad, 24, bw * n.hp / n.maxHp, 10);
    const slots = hudSlots(w);
    for (let i = 0; i < slots.length; i++) {
      const u = g.units[i], x0 = slots[i].x, y0 = slots[i].y, slotW = slots[i].w, sh = slots[i].h;
      ctx.fillStyle = COL.grid; ctx.fillRect(x0, y0, slotW, sh);
      if (!u) continue;
      ctx.fillStyle = COL.danger; ctx.fillRect(x0, y0, slotW * Math.min(1, u.inst / 100), sh);
      ctx.fillStyle = COL.ink; ctx.fillRect(x0 + slotW * 0.8, y0, 1.5, sh);   // 과부하가 시작되는 80% 눈금
      ctx.fillStyle = COL[u.main]; ctx.fillRect(x0, y0 + sh, slotW, 4);
      if (g.pinned === u.uid) { ctx.strokeStyle = COL.necro; ctx.lineWidth = 3; ctx.strokeRect(x0 - 2.5, y0 - 2.5, slotW + 5, sh + 9); }
      ctx.font = '700 13px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.ink; ctx.fillText(S.levelOf(u) + '등급', x0 + 6, y0 + sh / 2 + 0.5);
    }
    ctx.font = '600 14px ' + FONT; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.ink;
    ctx.textAlign = 'right'; ctx.fillText(g.district + '구역', w - pad, 57);
    if (g.boss && !g.boss.dead) {   // HUD: lap 2+ boss assist pattern under the slots (lap 1: nothing new)
      const tag = bossTag(g.boss);
      if (tag) { ctx.font = '700 12px ' + FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.danger; ctx.fillText(tag, w - pad, 86); }
    }

    if (stick && stick.far >= 14) {
      const r = cv.getBoundingClientRect();
      ctx.strokeStyle = COL.dim; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(stick.x0 - r.left, stick.y0 - r.top, 56, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COL.dim; ctx.beginPath(); ctx.arc(stick.x0 - r.left + inp.x * 56, stick.y0 - r.top + inp.y * 56, 18, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 폰 진동(안드로이드 크롬. 아이폰 사파리는 진동을 막아 두어 아무 일도 없다). 진동 모드에서도 손맛이 나게.
  // 익은 폭발만 세게 준다. 덜 익은 폭발에는 주지 않는다(차이를 손으로도 느끼게).
  const buzz = p => { try { if (navigator.vibrate && !document.hidden) navigator.vibrate(p); } catch (e) { /* 막혀 있으면 그냥 넘어간다 */ } };
  // 판에서 일어난 일을 소리와 흔들림으로 바꾼다
  function consumeEvents(dt) {
    for (const ev of g.events) {
      Music.event(ev);   // alarm / boss / roar / win / lose drive the BGM
      if (ev !== 'purify') tip(ev);   // first feed / frenzy / boom / rebirth / postdown. purify (gold soul) drops the gauge: never the absorb tip
      if (ev === 'absorb') Sound.absorb();
      else if (ev === 'purify') Sound.purify();
      else if (ev === 'frenzy') { Sound.ripe(); Sound.beat(); buzz(15); }
      else if (ev === 'boom') { Sound.boom(); buzz([70, 40, 40]); shake = 0.75; if (!reduced) { flash = 0.14; hitstop = 0.07; } }   // 익은 폭발: 크게 흔들고 잠깐 멈추고 번쩍
      else if (ev === 'boomweak') { Sound.fizz(); shake = Math.max(shake, 0.2); }
      else if (ev === 'drained') Sound.hurt();
      else if (ev === 'warn') Sound.siren();
      else if (ev === 'raise') Sound.raise();
      else if (ev === 'rebirth') Sound.rebirth();
      else if (ev === 'block') { Sound.clash(); shake = Math.max(shake, 0.25); }
      else if (ev === 'subboom') { const t = performance.now(); subN = t - subT < 600 ? subN + 1 : 0; subT = t; Sound.sub(subN); buzz(25); shake = Math.max(shake, 0.35); }
      else if (ev.startsWith('hit:')) { const k = ev.slice(4), t = performance.now(); if (!(t - (hitSndT[k] || -1e9) < 60)) { hitSndT[k] = t; Sound.hit(k); } }
      else if (ev === 'multikill') { buzz([90, 30, 60]); shake = Math.max(shake, 1.0); if (!reduced) hitstop = Math.max(hitstop, 0.1); }   // 한 번에 셋 이상: 더 세게
      else if (ev === 'shieldblock') { const t = performance.now(); if (t - shieldSndT > 120) { Sound.shield(); shieldSndT = t; } }   // 여러 발을 한꺼번에 막아도 소리는 0.12초에 한 번
      else if (ev === 'necrohit') { Sound.hurt(); shake = Math.max(shake, 0.3); }
      else if (ev === 'rush') Sound.rush();
      else if (ev === 'postdown') { Sound.clash(); Sound.purify(); buzz([40, 60, 40]); shake = Math.max(shake, 0.6); }
      else if (ev === 'posthit' || ev === 'postbounce') Sound.clash();
      else if (ev === 'boss') { Sound.siren(); shake = Math.max(shake, 0.3); startBossCut(); }
      else if (ev === 'alarm') actBanner();
      else if (ev === 'roar') { Sound.roar(); buzz([60, 40, 60]); shake = Math.max(shake, 0.6); }   // phase shift roar
    }
    g.events.length = 0;
    // 과부하인 키메라가 있는 동안 심장 박동이 이어진다
    beatT -= dt;
    if (beatT <= 0 && g.units.some(u => u.state === 'ok' && S.isFrenzy(u))) { Sound.beat(); beatT = 0.7; }
    shake = Math.max(0, shake - dt);
    flash = Math.max(0, flash - dt);
  }

  // 끝 화면의 골드 줄과 구매 버튼(판 밖에서만 산다).
  // 소환수 능력치: 종류 탭을 고르고, 그 종류의 능력치 하나를 한 단계씩 산다(그 종류의 모든 소환수에 붙는다).
  // Labels for every upgrade key. Each tab shows S.CFG.statKinds[kind] in slot order (melee kinds get leap/quake instead of range).
  const STAT_NAME = { hp: ['체력', '+'], dmg: ['공격력', '+'], cd: ['공격 간격', '-'], spd: ['이동 속도', '+'], range: ['사거리', '+'], leap: ['도약 간격', '-'], quake: ['충격파', '+'], taken: ['받는 피해', '-'] };
  const SLOTS = Math.max.apply(null, S.KINDS.map(k => S.CFG.statKinds[k].length));
  const KIND_NAME = { beast: '맹수', armor: '갑주', ranger: '사수' };
  const tabsEl = document.getElementById('statTabs'), statsEl = document.getElementById('statShop'), hpBtn = document.getElementById('buyHp');
  const titleGoldEl = document.getElementById('titleGold');
  let shopKind = 'beast';
  const tabBtns = S.KINDS.map(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.textContent = KIND_NAME[k];
    b.addEventListener('click', () => { shopKind = k; refreshGold(lastGained); });
    tabsEl.appendChild(b);
    return { k, b };
  });
  const statBtns = Array.from({ length: SLOTS }, () => {
    const b = document.createElement('button'), it = { key: null, b };
    b.type = 'button'; b.className = 'buy stat';
    b.addEventListener('click', () => { if (it.key) buyUp(shopKind + '.' + it.key); });
    statsEl.appendChild(b);
    return it;
  });
  hpBtn.addEventListener('click', () => buyUp('hp'));
  // First summon kind picker: one row next to the title start button, one next to the end screen retry button. Both share `starter`.
  const starterBtns = [];
  for (const id of ['titleStarter', 'endStarter']) {
    const box = document.getElementById(id);
    for (const k of S.KINDS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tab'; b.textContent = KIND_NAME[k];
      b.setAttribute('data-starter', k);
      b.addEventListener('click', () => selectStarter(k, 'button'));
      box.appendChild(b);
      starterBtns.push({ k, b });
    }
  }
  // First-summon selection hook for the title stage (stage 2: tapping a 3D model or the 2D fallback stage calls select).
  // source: 'button' (kind tabs), 'start' (start({ starter })), or whatever the caller passes (default 'stage').
  const starterSubs = [];
  function refreshStarter() { for (const t of starterBtns) t.b.setAttribute('aria-pressed', String(t.k === starter)); titleEl.setAttribute('data-starter', starter); }
  function selectStarter(k, source) {
    if (!S.KINDS.includes(k)) return false;
    const changed = k !== starter;
    starter = k; refreshStarter();
    for (const f of starterSubs.slice()) f(k, source, changed);
    return true;
  }
  window.ChimeraTitle = {
    kinds: S.KINDS.slice(),
    get: () => starter,
    isOpen: () => mode === 'title',
    select: (k, source) => mode !== 'play' && selectStarter(k, source || 'stage'),
    onSelect(f) {
      if (typeof f !== 'function') return () => {};
      starterSubs.push(f);
      return () => { const i = starterSubs.indexOf(f); if (i >= 0) starterSubs.splice(i, 1); };
    },
    start: () => { if (mode === 'title') start(); },
  };
  refreshStarter();
  // Mutation seed button (one-shot, max 1 held). The two escaped glyphs are not in the font subset (chars.txt), so they use the fallback system font.
  const seedBtn = document.getElementById('buySeed'), SEED_NAME = '변이 \uC528\uC557';
  seedBtn.addEventListener('click', () => buyUp('seed'));
  function buyUp(key) {
    reload();
    const r = S.Save.buy(save, key);
    if (r.ok) { save = r.save; persist(); }
    refreshGold(0);   // 사면 '(+받은 골드)' 표시는 지운다
  }
  let lastGained = 0;
  function refreshGold(gained) {
    lastGained = gained;
    document.getElementById('endGold').textContent = save.gold + '골드' + (gained ? ' (+' + gained + ')' : '');
    titleGoldEl.textContent = save.gold + '골드';
    for (const t of tabBtns) t.b.setAttribute('aria-pressed', String(t.k === shopKind));
    const maxS = S.CFG.gold.statMax, slots = S.CFG.statKinds[shopKind];
    statBtns.forEach((it, i) => {
      it.key = slots[i] || null;
      it.b.hidden = !it.key; it.b.setAttribute('data-key', it.key || '');
      if (!it.key) { it.b.disabled = true; return; }
      const key = shopKind + '.' + it.key, k = S.Save.level(save, key), cost = S.Save.cost(save, key), [name, sign] = STAT_NAME[it.key];
      const pct = Math.round(S.CFG.statStep[it.key] * 100);
      it.b.textContent = name + ' ' + sign + pct + '%\n' + (cost === null ? '최대' : cost + '골드') + ' · ' + k + '/' + maxS + '단계';
      it.b.disabled = cost === null || save.gold < cost;
    });
    const k = S.Save.level(save, 'hp'), cost = S.Save.cost(save, 'hp'), now = String(100 + S.CFG.gold.hpStep * k);
    hpBtn.textContent = '네크로맨서 체력 +' + S.CFG.gold.hpStep + ' · ' + (cost === null ? '최대' : cost + '골드') + ' (지금 ' + now + ')';
    hpBtn.disabled = cost === null || save.gold < cost;
    const sc = S.Save.cost(save, 'seed'), sn = S.Save.level(save, 'seed');
    seedBtn.textContent = SEED_NAME + ' (다음 판 시작 때 변이 하나) · ' + (sc === null ? '보유 중' : sc + '골드') + ' · 보유 ' + sn + '/' + S.CFG.gold.seedMax;
    seedBtn.disabled = sc === null || save.gold < sc;
  }
  // 제목 화면의 '강화': 끝 화면과 같은 상점(#shop, 같은 refreshGold·buyUp)을 제목으로 옮겨 보인다. 끝 화면이 뜨면 다시 끝 화면으로 돌려놓는다.
  const shopEl = document.getElementById('shop'), endShopEl = document.getElementById('endShop');
  const titleShopEl = document.getElementById('titleShop'), shopBtn = document.getElementById('shopBtn');
  function setTitleShop(open) {
    if (open) { reload(); titleShopEl.appendChild(shopEl); refreshGold(0); }
    titleShopEl.hidden = !open;
    shopBtn.textContent = open ? '강화 접기' : '강화';
    shopBtn.setAttribute('aria-expanded', String(open));
  }
  shopBtn.addEventListener('click', () => { if (mode === 'title') setTitleShop(titleShopEl.hidden); });
  setTitleShop(false);
  refreshGold(0);
  const soundBtn = document.getElementById('soundBtn');
  function refreshSound() {
    soundBtn.textContent = Sound.muted ? '소리 꺼짐' : '소리 켜짐';
    soundBtn.setAttribute('aria-pressed', String(!Sound.muted));
  }
  Sound.load(); refreshSound();
  soundBtn.addEventListener('click', () => { Sound.toggle(); refreshSound(); Music.wake(musicState()); });   // home: on starts audio + home theme at once, off stops it
  // First user gesture anywhere (home included, where nothing else calls Sound.on): unmuted only, start / resume audio and the current theme
  for (const type of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(type, () => { Music.wake(musicState()); }, true);
  // Controls panel: the old title rules, opened from the home icon row. Closes with its button, Escape, a tap outside, or when a run starts.
  const helpEl = document.getElementById('helpModal'), helpBtn = document.getElementById('helpBtn'), helpClose = document.getElementById('helpClose');
  // While the panel is open the home behind it is inert (out of the Tab order, not clickable) and Tab / Shift+Tab stay inside the panel.
  function helpFocusables() {
    const list = typeof helpEl.querySelectorAll === 'function' ? Array.from(helpEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')) : [];
    const can = list.filter(x => x && !x.disabled && !x.hidden);
    return can.length ? can : [helpClose];
  }
  const inHelp = x => !!x && (x === helpEl || (typeof helpEl.contains === 'function' && helpEl.contains(x)));
  function trapHelpFocus(e) {
    const f = helpFocusables(), first = f[0], lastF = f[f.length - 1], act = document.activeElement, inside = inHelp(act) && act !== helpEl;
    const to = e.shiftKey ? (!inside || act === first ? lastF : null) : (!inside || act === lastF ? first : null);
    if (to) { if (typeof e.preventDefault === 'function') e.preventDefault(); to.focus(); }
  }
  document.addEventListener('focusin', e => { if (!helpEl.hidden && e && e.target && !inHelp(e.target)) helpClose.focus(); });
  function setHelp(open) {
    const was = !helpEl.hidden;
    helpEl.hidden = !open;
    titleEl.inert = !!open;   // set before moving focus: focus cannot land on an inert home
    helpBtn.setAttribute('aria-expanded', String(!!open));
    if (open) helpClose.focus();
    else if (was && mode === 'title') helpBtn.focus();
  }
  helpBtn.addEventListener('click', () => { if (mode === 'title') setHelp(helpEl.hidden); });
  helpClose.addEventListener('click', () => setHelp(false));
  helpEl.addEventListener('click', e => { if (e && e.target === helpEl) setHelp(false); });
  setHelp(false);
  // ---- Result screen in two steps. Step 1: big title, short run record, gold items (sim Save.settle items) revealed one by one
  // with a rising total, or on a loss how far the run got. Step 2: big next/retry button, the shared #shop (endShopEl.appendChild), home.
  // Reveal timers are cleared on a step change, a restart or going home; rwFinish() fills in what is left at once.
  const endStep1El = document.getElementById('endStep1'), endStep2El = document.getElementById('endStep2');
  const rewardListEl = document.getElementById('rewardList'), rewardGoldEl = document.getElementById('rewardGold'), progressEl = document.getElementById('endProgress');
  const endContinueBtn = document.getElementById('endContinue'), homeBtn = document.getElementById('homeBtn'), againBtnEl = document.getElementById('againBtn');
  const RW_FIRST = 350, RW_GAP = 450, RW_COUNT = 6, RW_TICK = 45;
  const RW_NAME = { posts: n => '부순 초소 ' + n + '곳', elites: n => '돌격조 ' + n + '마리', boss: () => '진압 대장', clear: () => '첫 정복 덤', seed: n => SEED_NAME + ' +' + n, none: () => '받은 골드 없음' };
  let rw = null, endStep = 0, endNextBtn = null;
  function rwRow(it) {
    const p = document.createElement('p');
    p.className = 'rw'; p.setAttribute('data-id', it.id); p.setAttribute('data-gold', String(it.gold));
    p.textContent = RW_NAME[it.id](it.count) + (it.gold ? ' +' + it.gold + '골드' : '');
    rewardListEl.appendChild(p); rw.shown.push({ id: it.id, count: it.count, gold: it.gold });
  }
  function rwTotal(n) { rw.total = n; rewardGoldEl.textContent = n + '골드'; }
  function rwNext() {
    const r = rw; if (!r || r.i >= r.q.length) return;
    r.timer = setTimeout(() => { if (rw !== r) return; r.timer = null; const f = r.q[r.i++][1]; f(); rwNext(); }, r.q[r.i][0]);
  }
  function rwStop() { if (rw && rw.timer) { clearTimeout(rw.timer); rw.timer = null; } }
  function rwFinish() { const r = rw; if (!r) return; rwStop(); while (r.i < r.q.length) r.q[r.i++][1](); }
  function playReward(items, target) {
    rwStop();
    rewardListEl.textContent = '';
    const shown = items.filter(it => it.count > 0);
    if (!shown.length) shown.push({ id: 'none', count: 0, gold: 0 });
    rw = { q: [], i: 0, timer: null, shown: [], total: 0, target };
    rwTotal(0);
    let sum = 0;
    shown.forEach((it, k) => {
      rw.q.push([k ? RW_GAP : RW_FIRST, () => rwRow(it)]);
      const from = sum; sum += it.gold;
      if (it.gold) for (let j = 1; j <= RW_COUNT; j++) rw.q.push([RW_TICK, () => rwTotal(from + Math.round(it.gold * j / RW_COUNT))]);
    });
    if (reduced) rwFinish(); else rwNext();
  }
  function progressText(r) {
    const posts = '초소 ' + r.postsDown + ' / ' + r.postsTotal + ' 부숨';
    if (!r.bossReached) return posts + ' · 남은 초소 ' + r.postsLeft + '곳 · 대장을 만나지 못했다';
    return posts + ' · 대장까지 갔다 · 대장 체력 ' + r.bossHp + ' / ' + r.bossMaxHp + ' 남음 (' + Math.round(r.bossHpFrac * 100) + '%)';
  }
  function setEndStep(n) {
    endStep = n;
    endStep1El.hidden = n !== 1; endStep2El.hidden = n !== 2;
    if (n === 2) { rwFinish(); (endNextBtn || againBtnEl).focus(); }
    else if (n === 1) endContinueBtn.focus();
  }
  // Home: back to the title with #shop in its home slot (collapsed). The CTA follows save.cur (next district after a conquest, same one after a loss).
  function goHome() {
    if (mode !== 'over') return;
    rwStop(); endStep = 0;
    mode = 'title'; endEl.hidden = true;
    reload();
    titleShopEl.appendChild(shopEl); setTitleShop(false);
    refreshTitle(); refreshGold(0); refreshStarter();
    titleEl.inert = false; titleEl.hidden = false; stageT = null;
    startBtn.focus();
  }
  endContinueBtn.addEventListener('click', () => { if (mode === 'over') setEndStep(2); });
  homeBtn.addEventListener('click', goHome);
  function showEnd() {
    if (mode !== 'play') return;   // one result screen per run
    mode = 'over'; endCount++;
    victory = null; hideVictory();
    shake = 0; flash = 0; hitstop = 0;
    hideHud();
    mutEl.hidden = true; mutFor = null;
    setTitleShop(false); endShopEl.appendChild(shopEl);   // 제목에서 열었던 상점을 끝 화면 자리로
    const won = g.over === 'win';
    endEl.setAttribute('data-result', won ? 'win' : 'lose');
    document.getElementById('endTitle').textContent = won ? g.district + '구역 정복' : g.district + '구역에서 쓰러졌다';
    document.getElementById('endPosts').textContent = g.postsDown + ' / ' + g.postsTotal;
    document.getElementById('endKills').textContent = g.kills + '마리 (돌격조 ' + g.eliteKills + ')';
    document.getElementById('endMolt').textContent = g.molts + '번 터짐(익은 폭발 ' + g.ripeBlasts + ') · ' + g.rebirths + '번 계승';
    document.getElementById('endLevel').textContent = g.maxLevel + '등급';
    // 부순 초소만큼 골드(이기든 지든). 처음 정복한 구역이면 골드를 더 받고 최고 기록이 오른다(둘을 함께)
    reload();
    // Settle once with sim Save.settle (earn, then clear on a win): its items (posts, elites, boss, first-conquest bonus, seed) sum to gained
    const st = S.Save.settle(save, g); save = st.save;
    const gained = st.gained, seedGot = st.seedGained;
    g.seedGained = seedGot;   // result state: did this run actually earn a mutation seed (first conquest)
    if (gained || won) persist();
    document.getElementById('endBest').textContent = save.best + '구역';
    refreshGold(gained);
    progressEl.hidden = won;   // loss: how far the run got (posts, boss reached, boss hp left)
    progressEl.textContent = won ? '' : progressText(st.run);
    // 이기면 다음 구역으로(키메라는 데려가지 않고 처음부터 키운다). 지면 그 구역을 다시 한다.
    const list = document.getElementById('aceList'), askEl = document.getElementById('aceAsk'), again = document.getElementById('againBtn');
    list.textContent = '';
    // one line only when this run actually earned a mutation seed (escaped glyphs are outside the font subset)
    askEl.textContent = seedGot ? SEED_NAME + ' \uD68D\uB4DD' : ''; askEl.hidden = !seedGot; list.hidden = !won;
    endNextBtn = null;
    if (won) {
      const b = document.createElement('button'), next = g.district + 1;
      b.type = 'button'; b.className = 'cta';
      b.textContent = '다음 구역 → ' + next + '구역';
      b.addEventListener('click', () => start({ district: next }));
      list.appendChild(b); endNextBtn = b;
    }
    retryDistrict = won ? 1 : g.district;
    // 지면 한 구역 아래로 내려가 초소 골드를 모을 수 있다(진행 기록은 내려가지 않아, 거기서 이기면 다시 이 구역으로 간다)
    downDistrict = !won && g.district > 1 ? g.district - 1 : 0;
    downBtn.hidden = !downDistrict;
    if (downDistrict) downBtn.textContent = downDistrict + '구역으로 내려가기 (초소 골드 모으기)';
    again.textContent = won ? '1구역부터 다시' : g.district + '구역 다시';
    again.className = won ? '' : 'solo cta';   // on a loss the retry button is the main action
    endEl.hidden = false;
    playReward(st.items, gained);
    setEndStep(1);
  }

  // 초소를 부수면 판이 멈추고 변이 카드 셋이 뜬다. 끌던 손가락이 바로 카드를 누르지 않게 0.35초 동안 잠근다.
  const mutEl = document.getElementById('mutModal'), mutList = document.getElementById('mutList');
  const MUT_LOCK_MS = 350;
  let mutFor = null, mutAt = 0;   // 모달이 보여 주는 카드 셋(g.choice), 뜬 시각
  function openMut() {
    mutFor = g.choice; mutAt = performance.now();
    cancelInput();
    mutList.textContent = '';
    const btns = g.choice.map(id => {
      const m = S.MUTS[id], b = document.createElement('button'), nm = document.createElement('span'), ds = document.createElement('span'), have = g.muts[id] || 0;
      b.type = 'button'; b.className = 'mut'; b.disabled = true;
      nm.className = 'mutName'; nm.textContent = m.name + (have ? ' (' + (have + 1) + '번째)' : '');
      ds.className = 'mutDesc'; ds.textContent = m.desc;
      b.appendChild(nm); b.appendChild(ds);
      b.addEventListener('click', () => pickMut(id));
      mutList.appendChild(b);
      return b;
    });
    mutEl.hidden = false;
    const forThis = mutFor;
    setTimeout(() => { if (mutFor === forThis) for (const b of btns) b.disabled = false; }, MUT_LOCK_MS);
  }
  function pickMut(id) {
    if (!g.choice || mutFor !== g.choice || performance.now() - mutAt < MUT_LOCK_MS) return;
    if (!S.chooseMut(g, id)) return;
    Sound.purify();
    mutEl.hidden = true; mutFor = null;   // 초소 둘을 한꺼번에 부쉈으면 다음 프레임에 다음 셋이 뜬다
  }
  // 끌던 손가락·눌린 키·한 번 톡 대기를 모두 끊는다(변이 카드와 멈춤 덮개가 함께 쓴다)
  function cancelInput() {
    stick = null; inp.x = inp.y = 0; keys = {};
    if (lastTap) { clearTimeout(lastTap.timer); lastTap = null; }
  }

  // 앱·탭이 뒤로 가면(전화, 알림, 홈) 판을 멈추고 '눌러서 계속' 덮개를 띄운다. 판 안 버튼은 늘리지 않는다.
  // 변이 카드와 같은 규칙: 끌던 입력을 끊고, 보인 직후(돌아온 직후) 0.35초 동안은 눌러도 무시한다.
  const pauseEl = document.getElementById('pauseModal'), resumeBtn = document.getElementById('resumeBtn');
  let paused = false, pauseAt = 0;
  pauseEl.hidden = true;
  function lockPause() {
    const at = pauseAt = performance.now();
    resumeBtn.disabled = true;
    setTimeout(() => { if (paused && pauseAt === at) resumeBtn.disabled = false; }, MUT_LOCK_MS);
  }
  function autoPause() {
    if (mode !== 'play' || paused || !g || g.over) return;
    cancelInput();
    if (g.choice) return;   // 변이 카드가 떠 있으면 판은 이미 멈춰 있다(덮개를 겹치지 않는다). 돌아오면 카드를 다시 잠근다
    paused = true; pauseEl.hidden = false; lockPause();
  }
  function resumePlay() {
    if (!paused || performance.now() - pauseAt < MUT_LOCK_MS) return;
    paused = false; pauseEl.hidden = true;
    cancelInput();
    Sound.on();   // 뒤로 간 사이 멈춘 소리를 이 누름으로 다시 켠다
  }
  pauseEl.addEventListener('click', resumePlay);   // 덮개 어디를 눌러도 된다(잠긴 버튼은 눌리지 않는다)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { autoPause(); Music.update(musicState()); return; }   // stop music at once (rAF stops while hidden)
    if (mode !== 'play') return;
    if (paused) lockPause();
    else if (!victory && g.choice && mutFor === g.choice) openMut();
  });

  // 새로 생긴 폭발에서 그을음·파편·처치 수 글자를 만들고, 있는 것들을 흘려보낸다
  function juice(dt) {
    for (const f of g.fx) {
      if (seenFx.has(f)) continue;
      if ((f.k === 'hit' || f.k === 'shot') && f.uid) {   // 키메라 평타가 닿은 자리에 작은 불꽃
        seenFx.add(f);
        if (reduced) continue;
        const x = f.k === 'shot' ? f.tx : f.x, y = f.k === 'shot' ? f.ty : f.y, n = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 3; debris.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: DEBRIS_T * 0.6, gold: true, s: 0.35 }); }
        continue;
      }
      if (f.k !== 'boom' && f.k !== 'subboom') continue;
      seenFx.add(f);
      const ripe = f.k === 'boom' && !f.weak;
      if (ripe) scorch.push({ x: f.x, y: f.y, r: f.r * 0.8, t: SCORCH_T });
      if ((ripe || f.k === 'subboom') && !reduced) {
        const n = ripe ? 18 + Math.floor(Math.random() * 7) : 8 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = (ripe ? 9 : 6) + Math.random() * (ripe ? 7 : 4);
          debris.push({ x: f.x, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: DEBRIS_T * (0.7 + Math.random() * 0.3), gold: Math.random() < 0.45, s: 0.6 + Math.random() * 0.6 });
        }
      }
      if (f.kills >= S.CFG.multiKill) popups.push({ x: f.x, y: f.y, n: f.kills, t: POPUP_T });
    }
    const fr = Math.exp(-7 * dt);   // 마찰: 빠르게 튀어 나가 금방 멎는다
    for (const d of debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= fr; d.vy *= fr; d.t -= dt; }
    for (const s of scorch) s.t -= dt;
    for (const p of popups) p.t -= dt;
    debris = debris.filter(d => d.t > 0); scorch = scorch.filter(s => s.t > 0); popups = popups.filter(p => p.t > 0);
  }
  // 파편과 처치 수 글자: 화면 좌표로 그린다(2D·3D 같은 코드)
  function drawJuice() {
    const px = V ? V.pxPerUnit() : scale / dpr;
    for (const d of debris) {
      const [x, y] = scr(d.x, d.y, 0.4), k = d.t / DEBRIS_T, w = Math.max(1.5, 0.2 * px * d.s * k);
      ctx.fillStyle = d.gold ? COL.great : COL.danger; ctx.fillRect(x - w / 2, y - w / 2, w, w);
    }
    for (const p of popups) {
      const k = 1 - p.t / POPUP_T, [x, y] = scr(p.x, p.y, 1.5), big = p.n >= 6;
      ctx.save(); ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      label(p.n + ' KILL' + (big ? '!!' : '!'), x, y - 18 - k * 40, (big ? 34 : 26) * (k < 0.12 ? 0.6 + k / 0.3 : 1), big ? COL.great : COL.ink);
      ctx.restore();
    }
  }

  // ---- Conquest sequence (view only, sim untouched): S.step stops (g.over is set), the win is locked, banner, then showEnd once ----
  function hideVictory() { victoryEl.hidden = true; victoryEl.className = 'hudMsg'; victoryEl.textContent = ''; }
  function startVictory() {
    if (victory || !g || g.over !== 'win') return;
    victory = { t: 0, slow: reduced ? 1 : VIC_SLOW, hp: g.necro.hp, district: g.district };
    hideHud();   // boss HUD, intro cut, goal banner, tip line
    mutEl.hidden = true; mutFor = null;
    cancelInput();
    shake = Math.max(shake, VIC_SHAKE);
    if (!reduced) { flash = Math.max(flash, VIC_FLASH); hitstop = Math.max(hitstop, VIC_STOP); }
    Sound.boom(); Sound.rebirth(); buzz([120, 60, 120, 60, 220]);
    victoryEl.textContent = g.district + '구역 정복';
    victoryEl.className = 'hudMsg conquer'; victoryEl.hidden = false;
  }
  function victoryStep(dt) {
    const v = victory;
    if (g.over !== 'win') g.over = 'win';   // nothing turns the conquest into a loss
    if (!(g.necro.hp >= v.hp)) g.necro.hp = v.hp;   // the necromancer cannot be hurt during the sequence
    g.events.length = 0;
    v.t += dt;   // real time: the result screen opens VIC_S seconds later
    let fx = dt * v.slow;   // effects run slowed
    if (hitstop > 0) { hitstop = Math.max(0, hitstop - dt); fx = 0; }
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - fx);
    juice(fx);
    if (v.t >= VIC_S) showEnd();
  }
  const victoryState = () => (victory ? { t: victory.t, slow: victory.slow, district: victory.district, flash, hitstop, shake, banner: !victoryEl.hidden, text: victoryEl.textContent } : null);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    vnow += Math.max(0, now - last) * (victory ? victory.slow : 1);   // drawing clock: slowed during the conquest sequence
    last = now;
    if (mode === 'play' && document.hidden) autoPause();   // 알림을 놓쳐도 숨은 동안은 멈춘다
    if (mode === 'play' && !paused) {   // 멈춘 동안은 S.step을 부르지 않는다. last는 프레임마다 갱신해 재개 때 dt가 튀지 않는다
      readInput();
      if (victory) victoryStep(dt);   // conquest sequence: no S.step, the win is locked
      else {
        if (g.choice) { if (mutFor !== g.choice) openMut(); }
        else if (hitstop > 0) hitstop -= dt;
        else S.step(g, dt, inp);
        consumeEvents(dt);
        if (g.over === 'win') startVictory();   // boss kill: hold the result screen for the sequence
        else {
          cutStep(dt);
          bossStep();
          hud(dt);
          juice(dt);
          if (g.over) showEnd();   // loss: result screen right away
        }
      }
    }
    Music.update(musicState());   // BGM follows mode / pause / hidden every frame
    draw(vnow);
    requestAnimationFrame(frame);
  }

  window.ChimeraRender2D = { victory: victoryState, endCount: () => endCount,
    banner: () => ({ hidden: bannerEl.hidden, text: bannerEl.textContent, kind: bannerEl.getAttribute ? bannerEl.getAttribute('data-kind') : null, t: bannerT }),
    endState: () => ({ step: endStep, items: rw ? rw.shown.map(o => Object.assign({}, o)) : [], total: rw ? rw.total : 0, target: rw ? rw.target : 0, done: !rw || rw.i >= rw.q.length, pending: !!(rw && rw.timer) }), fx: () => ({ flash, hitstop, shake }), bossCut: () => (bossCut ? { t: bossCut.t, k: bossCut.k, phase: bossCut.phase } : null), camFocus: () => (g ? camFocus() : null), drawEnemy, bossLook, bossAssist, bossTag, bossTicks, bossFx: bossFxOf, lastBossFx: () => drawnBossFx.map(o => Object.assign({}, o, { ticks: o.ticks.slice() })), drawObstacles, lastObstacles: () => drawnObs.map(o => Object.assign({}, o)), drawPost, lastPostMarks: () => drawnPostMarks.map(o => Object.assign({}, o)),
    titleStage: () => { const L = stageLayout(), art = stageImgs || {}; return { slots: L.slots.map(s => Object.assign({}, s)), fwd: Object.assign({}, stageFwd), drawn: stageDrawn, fallback: stageFallback, art: Object.keys(STAGE_ART).filter(k => artReady(art[k])), band: [L.top, L.bot], pick: stagePick }; } };   // smoke check hook
  resize();
  g = S.newGame(seed);   // 제목 화면 뒤에 판의 첫 모습을 깔아 둔다
  requestAnimationFrame(frame);
})();
