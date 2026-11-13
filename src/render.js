// 화면, 입력, 소리. 규칙은 sim.js에 있고 여기서는 상태를 그리고 사건을 소리로 바꾼다.
(function () {
  'use strict';
  const S = window.ChimeraSim;
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
  let scale = 1, dpr = 1, camX = 0, camY = 0, shake = 0, beatT = 0, lastTap = null, seed = (Date.now() % 100000) + 1;

  // ---- 소리: 외부 파일 없이 Web Audio로 만든다. 첫 터치(시작 버튼) 뒤에만 켜진다. ----
  const Sound = {
    ac: null,
    on() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!this.ac && AC) this.ac = new AC();
        if (this.ac && this.ac.state === 'suspended') this.ac.resume();
      } catch (e) { this.ac = null; }
    },
    tone(type, f0, f1, dur, vol, delay) {
      const ac = this.ac; if (!ac) return;
      const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), v = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(v); v.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, cutoff) {
      const ac = this.ac; if (!ac) return;
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; v.gain.value = vol;
      src.connect(f); f.connect(v); v.connect(ac.destination); src.start();
    },
    absorb() { this.tone('sawtooth', 150, 400, 0.08, 0.18); },                    // 혼이 빨려 드는 짧은 스윕
    beat() { this.tone('sine', 70, 45, 0.12, 0.35); this.tone('sine', 62, 40, 0.12, 0.25, 0.16); },   // 과부하: 심장 박동
    boom() { this.noise(0.3, 0.5, 900); this.tone('sine', 80, 30, 0.3, 0.6); },   // 탈피 대폭발
    siren() { for (let i = 0; i < 3; i++) this.tone('square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.13, 0.12, i * 0.17); },   // 돌격병 예고
    raise() { this.tone('triangle', 300, 520, 0.1, 0.14); },
    purify() { this.tone('sine', 520, 1040, 0.25, 0.2); this.tone('sine', 780, 1560, 0.25, 0.12, 0.05); },
    rebirth() { this.tone('triangle', 200, 800, 0.22, 0.22); this.tone('sine', 400, 1200, 0.2, 0.12, 0.1); },
    clash() { this.noise(0.12, 0.35, 3000); this.tone('square', 220, 110, 0.15, 0.15); },
    hurt() { this.tone('sawtooth', 180, 60, 0.18, 0.25); },
    rush() { this.tone('sawtooth', 300, 900, 0.2, 0.12); },
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    scale = cv.width / VIEW_W;
  }
  window.addEventListener('resize', resize);

  // opts: 다음 구역으로 갈 때 { district, ace }. 없으면 1구역부터.
  function start(opts) {
    Sound.on();
    g = S.newGame(seed++, opts && opts.district ? opts : null);
    mode = 'play'; shake = 0; lastTap = null;
    titleEl.hidden = true; endEl.hidden = true;
    inp.x = inp.y = 0; stick = null;
  }
  document.getElementById('startBtn').addEventListener('click', () => start());
  document.getElementById('againBtn').addEventListener('click', () => start());

  // 누르고 끌면 이동. 두 번 톡톡 치면 자폭(탈피). 키메라를 한 번 톡 누르면 먹일 대상으로 찍는다.
  cv.addEventListener('pointerdown', e => {
    if (mode !== 'play') return;
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
    const wx = (cx - r.left) * dpr / scale + camX, wy = (cy - r.top) * dpr / scale + camY;
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
  window.addEventListener('keydown', e => { keys[e.key] = true; if (e.key === ' ' && mode === 'play') S.detonate(g); });
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
  const sx = x => (x - camX) * scale / dpr, sy = y => (y - camY) * scale / dpr;

  // 키메라: 주 유전자가 몸의 모양이고, 섞인 유전자가 개수만큼 몸에 들러붙는다
  // (맹수 가시, 갑주 장갑판, 사수 눈알). 불안정도가 오르면 붉게 달아오르고 떤다.
  function drawUnit(u, now) {
    const gn = u.genes, k = 1 + (reduced ? 0 : u.pop * 0.8), r = u.r * k, frenzy = S.isFrenzy(u);
    const heat = Math.min(1, u.inst / 100);
    const amp = reduced ? 0 : (heat > 0.4 ? (heat - 0.4) * 0.16 : 0) * (frenzy ? 1.8 : 1);
    const jx = amp ? Math.sin(now / 23 + u.uid) * amp : 0, jy = amp ? Math.cos(now / 19 + u.uid * 2) * amp : 0;
    const blink = frenzy && !reduced && Math.floor(now / 110) % 2 === 0;
    ctx.save();
    ctx.translate(u.x + jx, u.y + jy);
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
    if (u.down <= 0 && u.hp < mh && u.state === 'ok') bar(u.x, u.y + u.r + 0.3, Math.max(1, u.r * 1.6), u.hp / mh, COL.bone);
    if (u.down > 0) {
      ctx.strokeStyle = COL.bone; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 0.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.down / 6)); ctx.stroke();
    }
    if (u.state === 'rush') { ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.tx, u.ty); ctx.stroke(); }
  }

  function drawEnemy(e, now) {
    if (e.elite && (e.mode === 'warn' || e.mode === 'aim')) {
      // 돌진 예고: 겨눈 방향으로 붉은 길이 깔린다
      const a = e.face, L = 40, w = 0.9 + (reduced ? 0 : 0.25 * Math.sin(now / 60));
      ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = COL.danger; ctx.lineWidth = e.r * 2 * w;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * L, e.y + Math.sin(a) * L); ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.face);
    if (e.elite) {
      ctx.fillStyle = COL.danger; ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.1;
      shape(e.arch, e.r); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.moveTo(e.r * 1.7, 0); ctx.lineTo(e.r * 0.9, e.r * 0.4); ctx.lineTo(e.r * 0.9, -e.r * 0.4); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = COL[e.arch]; ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.07;
      shape(e.arch, e.r); ctx.fill(); ctx.stroke();
      if (e.g >= 2) { ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.06; shape(e.arch, e.r * 0.55); ctx.stroke(); }
    }
    ctx.restore();
    if (e.stun > 0) { ctx.strokeStyle = COL.great; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.arc(e.x, e.y - e.r - 0.3, 0.2, now / 90, now / 90 + 4.5); ctx.stroke(); }
    if (e.hp < e.maxHp) bar(e.x, e.y - e.r - 0.35, e.elite ? 2 : 0.9, e.hp / e.maxHp, COL.danger);
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
    ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!g) return;
    const vh = cv.height / scale, n = g.necro;
    camX = Math.max(0, Math.min(S.W - VIEW_W, n.x - VIEW_W / 2));
    camY = vh >= S.H ? (S.H - vh) / 2 : Math.max(0, Math.min(S.H - vh, n.y - vh / 2));
    const shx = shake > 0 && !reduced ? (Math.random() - 0.5) * shake * 1.2 : 0, shy = shake > 0 && !reduced ? (Math.random() - 0.5) * shake * 1.2 : 0;
    ctx.setTransform(scale, 0, 0, scale, (-camX + shx) * scale, (-camY + shy) * scale);

    ctx.strokeStyle = COL.grid; ctx.lineWidth = 0.03;
    for (let x = 0; x <= S.W; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke(); }
    for (let y = 0; y <= S.H; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.W, y); ctx.stroke(); }
    ctx.lineWidth = 0.08; ctx.strokeRect(0, 0, S.W, S.H);

    // 혼: 불량은 작고 흐리다. 신선한 것은 푸른 고리, 순혈 코어는 크고 금빛으로 뛴다.
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
      const pulse = reduced ? 1 : 1 + 0.18 * Math.abs(Math.sin(now / 180)), full = h.age <= S.CFG.heartFullFor;
      ctx.save(); ctx.translate(h.x, h.y);
      ctx.fillStyle = COL.danger; ctx.strokeStyle = full ? COL.great : COL.ink; ctx.lineWidth = 0.1;
      ctx.beginPath(); ctx.moveTo(0, 0.55 * pulse); ctx.lineTo(0.5 * pulse, 0); ctx.lineTo(0.25 * pulse, -0.4 * pulse); ctx.lineTo(0, -0.18 * pulse); ctx.lineTo(-0.25 * pulse, -0.4 * pulse); ctx.lineTo(-0.5 * pulse, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = full ? COL.great : COL.dim; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(0, 0, 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h.ttl / S.CFG.heartTtl)); ctx.stroke();
      ctx.restore();
    }

    // 봉쇄 초소: 폭발로만 부서진다. 옅은 원이 사격 범위, 위의 칸이 남은 내구도.
    for (const p of g.posts) {
      if (p.dead) { ctx.strokeStyle = COL.grid; ctx.lineWidth = 0.1; circle(p.x, p.y, p.r); ctx.stroke(); continue; }
      ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.06; circle(p.x, p.y, S.CFG.postRange); ctx.stroke(); ctx.restore();
      ctx.fillStyle = COL.dim; ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.1;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = Math.floor(now / 400) % 2 ? COL.danger : COL.great; circle(p.x, p.y, 0.22); ctx.fill();
      for (let i = 0; i < p.maxHp; i++) { ctx.fillStyle = i < p.hp ? COL.ink : COL.grid; ctx.fillRect(p.x - 0.45 + i * 0.5, p.y - p.r - 0.5, 0.4, 0.18); }
    }
    for (const e of g.enemies) drawEnemy(e, now);

    // 예고 연결선: 이 혼을 밟으면 누가 먹는지. 먹으면 터질 참이면 붉다.
    if (g.link) {
      const u = g.units.find(x => x.uid === g.link.uid);
      if (u) {
        const soul = g.souls.find(s => s.x === g.link.x && s.y === g.link.y);
        const add = soul ? S.CFG.soul[soul.q].inst : 0, willPop = add > 0 && u.inst + add >= 100;
        ctx.save(); ctx.strokeStyle = willPop ? COL.danger : COL.necro; ctx.lineWidth = 0.14; ctx.setLineDash([0.3, 0.2]); ctx.lineDashOffset = reduced ? 0 : -now / 60;
        ctx.beginPath(); ctx.moveTo(g.link.x, g.link.y); ctx.lineTo(u.x, u.y); ctx.stroke();
        ctx.setLineDash([]); circle(u.x, u.y, u.r + 0.6); ctx.stroke(); circle(g.link.x, g.link.y, 0.75); ctx.stroke();
        if (add > 0) { ctx.globalAlpha = 0.45; ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.1; const a0 = -Math.PI / 2 + Math.PI * 2 * Math.min(1, u.inst / 100); ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 0.38, a0, a0 + Math.PI * 2 * Math.min(1 - u.inst / 100, add / 100)); ctx.stroke(); }
        ctx.restore();
      }
    }
    for (const u of g.units) drawUnit(u, now);

    ctx.fillStyle = n.hurt > 0 ? COL.danger : COL.necro;
    circle(n.x, n.y, n.r); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.08; circle(n.x, n.y, n.r + 0.16); ctx.stroke();
    ctx.fillStyle = COL.ground; circle(n.x, n.y, 0.16); ctx.fill();

    for (const f of g.fx) {
      if (f.k === 'hit') { ctx.strokeStyle = COL.ink; ctx.lineWidth = f.big ? 0.14 : 0.08; circle(f.x, f.y, 0.25 + (0.15 - f.t) * (f.big ? 6 : 3)); ctx.stroke(); }
      else if (f.k === 'shot') { ctx.strokeStyle = COL[f.arch]; ctx.lineWidth = f.arch === 'ranger' ? 0.14 : 0.07; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
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
        const k = 1 - f.t / 0.5;
        ctx.save(); ctx.globalAlpha = (1 - k) * 0.6; ctx.fillStyle = COL.danger; circle(f.x, f.y, f.r * (0.4 + k * 0.6)); ctx.fill();
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.3; circle(f.x, f.y, f.r * (0.3 + k)); ctx.stroke(); ctx.restore();
      }
      else if (f.k === 'wave') { const k = 1 - f.t / 0.3; ctx.strokeStyle = COL.armor; ctx.lineWidth = 0.22 * (1 - k) + 0.05; circle(f.x, f.y, f.r * k); ctx.stroke(); }
      else if (f.k === 'leap') { ctx.strokeStyle = COL.beast; ctx.lineWidth = 0.3 * (f.t / 0.25); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'volley') { ctx.save(); ctx.globalAlpha = f.t / 0.25 * 0.3; ctx.fillStyle = COL.ranger; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, 6.5, f.face - 0.7, f.face + 0.7); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (f.k === 'clash') { const k = 1 - f.t / 0.4; ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.2; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * (0.3 + k), f.y + Math.sin(a) * (0.3 + k)); ctx.lineTo(f.x + Math.cos(a) * (0.9 + k * 2), f.y + Math.sin(a) * (0.9 + k * 2)); ctx.stroke(); } }
      else if (f.k === 'rebirth') { const k = 1 - f.t / 0.6; ctx.strokeStyle = COL.great; ctx.lineWidth = 0.2; circle(f.x, f.y, 0.4 + k * 2.4); ctx.stroke(); ctx.lineWidth = 0.08; circle(f.x, f.y, 0.4 + k * 4); ctx.stroke(); }
      else if (f.k === 'down') { ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.6 + (0.5 - f.t) * 2); ctx.stroke(); }
    }

    // 여기부터 화면 좌표(글자가 또렷하게 나오게)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const px = scale / dpr, w = cv.width / dpr, hh = cv.height / dpr, pad = 16, bw = w - pad * 2;
    for (const u of g.units) label(String(S.levelOf(u)), sx(u.x), sy(u.y), Math.max(13, u.r * px * 0.9), COL.ground);
    // 화면 밖에서 겨누는 돌격병: 가장자리에 느낌표
    for (const e of g.enemies) {
      if (!e.elite || (e.mode !== 'warn' && e.mode !== 'aim')) continue;
      const ex = Math.max(26, Math.min(w - 26, sx(e.x))), ey = Math.max(100, Math.min(hh - 30, sy(e.y)));
      if (ex !== sx(e.x) || ey !== sy(e.y)) label('!', ex, ey, 34, COL.danger);
    }
    // 다음 목표(가장 가까운 초소, 다 부쉈으면 대장)가 화면 밖이면 가장자리에 표시한다
    {
      const goals = g.posts.filter(p => !p.dead).concat(g.boss && !g.boss.dead ? [g.boss] : []);
      let goal = null, gd = 1e9;
      for (const p of goals) { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < gd) { gd = d; goal = p; } }
      if (goal) {
        const gx = sx(goal.x), gy = sy(goal.y), ex = Math.max(30, Math.min(w - 30, gx)), ey = Math.max(104, Math.min(hh - 34, gy));
        if (ex !== gx || ey !== gy) {
          const a = Math.atan2(gy - ey, gx - ex);
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
          ctx.fillStyle = goal.boss ? COL.danger : COL.great; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, 11); ctx.lineTo(-8, -11); ctx.closePath(); ctx.fill();
          ctx.restore();
          label(Math.round(gd) + 'm', ex, ey + (ey > hh / 2 ? -22 : 22), 12, goal.boss ? COL.danger : COL.great);
        }
      }
    }
    // 느려진 동안: 화면 테두리
    if (g.slowing) { ctx.strokeStyle = COL.necro; ctx.globalAlpha = 0.7; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, hh - 6); ctx.globalAlpha = 1; }

    // 화면 고정 표시: 남은 시간, 체력, 키메라 셋의 등급과 불안정도
    // 목적: 초소 칸(부수면 꺼진다)과 그 뒤의 대장 표시
    for (let i = 0; i < g.postsTotal; i++) { ctx.fillStyle = i < g.postsDown ? COL.grid : COL.great; ctx.fillRect(pad + i * 22, 10, 16, 9); }
    ctx.fillStyle = g.boss ? (g.boss.dead ? COL.grid : COL.danger) : COL.grid;
    ctx.beginPath(); ctx.moveTo(pad + g.postsTotal * 22 + 8, 6); ctx.lineTo(pad + g.postsTotal * 22 + 17, 14.5); ctx.lineTo(pad + g.postsTotal * 22 + 8, 23); ctx.lineTo(pad + g.postsTotal * 22 - 1, 14.5); ctx.closePath(); ctx.fill();
    if (g.boss && !g.boss.dead) { ctx.fillStyle = COL.grid; ctx.fillRect(pad + g.postsTotal * 22 + 26, 11, bw - g.postsTotal * 22 - 26, 7); ctx.fillStyle = COL.danger; ctx.fillRect(pad + g.postsTotal * 22 + 26, 11, (bw - g.postsTotal * 22 - 26) * Math.max(0, g.boss.hp / g.boss.maxHp), 7); }
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

    if (stick && stick.far >= 14) {
      const r = cv.getBoundingClientRect();
      ctx.strokeStyle = COL.dim; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(stick.x0 - r.left, stick.y0 - r.top, 56, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COL.dim; ctx.beginPath(); ctx.arc(stick.x0 - r.left + inp.x * 56, stick.y0 - r.top + inp.y * 56, 18, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 판에서 일어난 일을 소리와 흔들림으로 바꾼다
  function consumeEvents(dt) {
    for (const ev of g.events) {
      if (ev === 'absorb') Sound.absorb();
      else if (ev === 'purify') Sound.purify();
      else if (ev === 'frenzy') Sound.beat();
      else if (ev === 'boom') { Sound.boom(); shake = 0.45; }
      else if (ev === 'warn') Sound.siren();
      else if (ev === 'raise') Sound.raise();
      else if (ev === 'rebirth') Sound.rebirth();
      else if (ev === 'block') { Sound.clash(); shake = Math.max(shake, 0.25); }
      else if (ev === 'necrohit') { Sound.hurt(); shake = Math.max(shake, 0.3); }
      else if (ev === 'rush') Sound.rush();
      else if (ev === 'postdown') { Sound.clash(); Sound.purify(); shake = Math.max(shake, 0.4); }
      else if (ev === 'posthit') Sound.clash();
      else if (ev === 'boss') { Sound.siren(); shake = Math.max(shake, 0.3); }
    }
    g.events.length = 0;
    // 과부하인 키메라가 있는 동안 심장 박동이 이어진다
    beatT -= dt;
    if (beatT <= 0 && g.units.some(u => u.state === 'ok' && S.isFrenzy(u))) { Sound.beat(); beatT = 0.7; }
    shake = Math.max(0, shake - dt);
  }

  const BEST_KEY = 'chimera-lab-best-v1';
  function bestDistrict(reached) {
    let best = 0;
    try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* 저장 없이도 판은 돈다 */ }
    if (reached > best) { best = reached; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* 무시 */ } }
    return best;
  }
  const KIND_NAME = { beast: '맹수', armor: '갑주', ranger: '사수' };
  function showEnd() {
    mode = 'over';
    const won = g.over === 'win';
    document.getElementById('endTitle').textContent = won ? g.district + '구역 정복' : g.district + '구역에서 쓰러졌다';
    document.getElementById('endPosts').textContent = g.postsDown + ' / ' + g.postsTotal;
    document.getElementById('endKills').textContent = g.kills + '마리 (돌격조 ' + g.eliteKills + ')';
    document.getElementById('endMolt').textContent = g.molts + '번 터지고 ' + g.rebirths + '번 계승';
    document.getElementById('endLevel').textContent = g.maxLevel + '등급';
    document.getElementById('endBest').textContent = bestDistrict(won ? g.district : g.district - 1) + '구역';
    const list = document.getElementById('aceList'), askEl = document.getElementById('aceAsk');
    list.textContent = '';
    const alive = won ? g.units.filter(u => u.state === 'ok') : [];
    askEl.hidden = !alive.length; list.hidden = !alive.length;
    if (alive.length) {
      const total = alive.reduce((n, u) => n + S.geneTotal(u), 0), top = Math.max.apply(null, alive.map(u => S.levelOf(u)));
      askEl.textContent = '키메라 ' + alive.length + '마리(가장 높은 ' + top + '등급, 유전자 모두 ' + total + '개)가 그대로 따라간다. 쓰러지면 모두 잃는다.';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = (g.district + 1) + '구역으로';
      const squad = S.squadOf(g), next = g.district + 1;
      b.addEventListener('click', () => start({ district: next, squad }));
      list.appendChild(b);
    }
    document.getElementById('againBtn').textContent = won && alive.length ? '그만하고 1구역부터' : '1구역부터 다시';
    document.getElementById('againBtn').className = won && alive.length ? '' : 'solo';   // 고를 것이 없으면 이 버튼이 주된 행동이다
    endEl.hidden = false;
    document.getElementById('againBtn').focus();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (mode === 'play') {
      readInput();
      S.step(g, dt, inp);   // 느려짐은 규칙 쪽에서 처리한다
      consumeEvents(dt);
      if (g.over) showEnd();
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  resize();
  g = S.newGame(seed);   // 제목 화면 뒤에 판의 첫 모습을 깔아 둔다
  requestAnimationFrame(frame);
})();
