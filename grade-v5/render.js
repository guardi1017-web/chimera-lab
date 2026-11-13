// 화면과 입력. 규칙은 sim.js에 있고 여기서는 상태를 그리기만 한다.
(function () {
  'use strict';
  const S = window.ChimeraSim;
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const C = n => css.getPropertyValue(n).trim();
  const COL = {
    ground: C('--ground'), grid: C('--grid'), ink: C('--ink'), dim: C('--dim'), necro: C('--necro'),
    bone: C('--bone'), beast: C('--beast'), armor: C('--armor'), shooter: C('--shooter'), danger: C('--danger'), great: C('--great'),
  };
  const FONT = C('--font-body'), FONT_D = C('--font-display');
  const titleEl = document.getElementById('title'), endEl = document.getElementById('end');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VIEW_W = 13;   // 화면 가로에 들어오는 판의 폭
  const DEX_KEY = 'chimera-lab-dex-v1';

  let g = null, mode = 'title', inp = { x: 0, y: 0 }, stick = null, keys = {}, last = 0;
  let scale = 1, dpr = 1, camX = 0, camY = 0, slow = 0, seed = (Date.now() % 100000) + 1;

  // 도감: 만나 본 몬스터는 이 기기에 남는다(저장이 막혀 있으면 이번 판 것만 보인다).
  function loadDex() { try { return JSON.parse(localStorage.getItem(DEX_KEY)) || {}; } catch (e) { return {}; } }
  function saveDex(d) { try { localStorage.setItem(DEX_KEY, JSON.stringify(d)); } catch (e) { /* 저장 없이도 판은 돈다 */ } }
  let dex = loadDex();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    scale = cv.width / VIEW_W;
  }
  window.addEventListener('resize', resize);

  function start() {
    g = S.newGame(seed++);
    mode = 'play'; slow = 0;
    titleEl.hidden = true; endEl.hidden = true;
    inp.x = inp.y = 0; stick = null;
  }
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);

  // 누르고 끌면 이동, 소환수를 짧게 톡 누르면 고르기(둘을 차례로 누르면 합성).
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
  cv.addEventListener('pointerup', e => {
    if (!stick || e.pointerId !== stick.id) return;
    if (mode === 'play' && performance.now() - stick.at < 300 && stick.far < 14) {
      const r = cv.getBoundingClientRect();
      const wx = (e.clientX - r.left) * dpr / scale + camX, wy = (e.clientY - r.top) * dpr / scale + camY;
      let best = null, bd = 1e9;
      for (const u of g.units) { const d = Math.hypot(u.x - wx, u.y - wy) - u.r; if (d < 1.0 && d < bd) { bd = d; best = u; } }
      if (best) {
        const res = S.tapUnit(g, best.uid);
        if (!reduced && (res === 'normal' || res === 'great' || res === 'fail')) slow = res === 'great' ? 0.8 : 0.5;
      }
    }
    stick = null;
  });
  cv.addEventListener('pointercancel', e => { if (stick && e.pointerId === stick.id) stick = null; });
  window.addEventListener('keydown', e => { keys[e.key] = true; });
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
  // 종류는 모양으로도 구별한다: 맹수는 화살촉, 갑주는 네모, 사수는 마름모.
  function shape(arch, r) {
    ctx.beginPath();
    if (arch === 'beast') { ctx.moveTo(r * 1.35, 0); ctx.lineTo(-r, r * 0.9); ctx.lineTo(-r * 0.45, 0); ctx.lineTo(-r, -r * 0.9); ctx.closePath(); }
    else if (arch === 'armor') { ctx.rect(-r * 0.95, -r * 0.95, r * 1.9, r * 1.9); }
    else { ctx.moveTo(r * 1.25, 0); ctx.lineTo(0, r * 1.05); ctx.lineTo(-r * 1.25, 0); ctx.lineTo(0, -r * 1.05); ctx.closePath(); }
  }
  const sx = x => (x - camX) * scale / dpr, sy = y => (y - camY) * scale / dpr;

  // 소환수: 몸은 뼈 색, 테두리와 장식은 종류 색. 등급이 오를수록 커지고 등의 뿔이 늘어난다.
  function drawUnit(u) {
    const k = 1 + (reduced ? 0 : u.pop * 0.9), r = u.r * k, col = COL[u.arch];
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.globalAlpha = u.down > 0 ? 0.3 : 1;
    ctx.rotate(u.face);
    const horns = Math.min(u.g - 1, 9);
    ctx.strokeStyle = col; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
    for (let i = 0; i < horns; i++) {
      const a = Math.PI + (i - (horns - 1) / 2) * 0.3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(Math.cos(a) * r * 1.55, Math.sin(a) * r * 1.55); ctx.stroke();
    }
    ctx.fillStyle = COL.bone; ctx.strokeStyle = col; ctx.lineWidth = r * 0.2; ctx.lineJoin = 'round';
    shape(u.arch, r); ctx.fill(); ctx.stroke();
    if (u.arch === 'armor') { ctx.lineWidth = r * 0.24; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, -0.8, 0.8); ctx.stroke(); }
    if (u.arch === 'shooter') { ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(r * 0.9, 0, r * 0.75, -1.25, 1.25); ctx.stroke(); }
    if (u.arch === 'beast') { ctx.fillStyle = col; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.2, s * r * 0.45); ctx.lineTo(-r * 0.15, s * r * 1.05); ctx.lineTo(r * 0.55, s * r * 0.6); ctx.closePath(); ctx.fill(); } }
    ctx.restore();

    // 흠: 몸 아래 붉은 표시(절름발이 꺾인 선, 외눈 빗금 친 원, 외팔 막대 하나, 허약 빈 마름모)
    ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.07;
    u.defects.forEach((d, i) => {
      const x = u.x + (i - (u.defects.length - 1) / 2) * 0.42, y = u.y + u.r + 0.42, q = 0.15;
      ctx.beginPath();
      if (d === 'lame') { ctx.moveTo(x - q, y - q); ctx.lineTo(x, y); ctx.lineTo(x - q, y + q); ctx.lineTo(x + q, y + q); }
      else if (d === 'oneeye') { ctx.arc(x, y, q, 0, Math.PI * 2); ctx.moveTo(x - q, y + q); ctx.lineTo(x + q, y - q); }
      else if (d === 'onearm') { ctx.moveTo(x - q, y); ctx.lineTo(x + q, y); }
      else { ctx.moveTo(x, y - q); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath(); }
      ctx.stroke();
    });
    const mh = S.stats(u).maxHp;
    if (u.down <= 0 && u.hp < mh) bar(u.x, u.y - u.r - 0.45, Math.max(1, u.r * 1.6), u.hp / mh, COL.bone);
    if (u.down > 0) {
      ctx.strokeStyle = COL.bone; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 0.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.down / 6)); ctx.stroke();
    }
  }

  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.face);
    ctx.fillStyle = COL[e.arch]; ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.07;
    shape(e.arch, e.r); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (e.hp < e.maxHp) bar(e.x, e.y - e.r - 0.35, 0.9, e.hp / e.maxHp, COL.danger);
  }

  function label(text, x, y, size, col, font) {
    ctx.font = '700 ' + size + 'px ' + (font || FONT);
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
    ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);

    ctx.strokeStyle = COL.grid; ctx.lineWidth = 0.03;
    for (let x = 0; x <= S.W; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke(); }
    for (let y = 0; y <= S.H; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.W, y); ctx.stroke(); }
    ctx.lineWidth = 0.08; ctx.strokeRect(0, 0, S.W, S.H);

    // 혼: 잡은 적의 윤곽. 아래 점은 되살리는 데 드는 MP. 지금 되살릴 수 없으면 흐리다.
    for (const s of g.souls) {
      if (s.ttl < 3 && Math.floor(now / 120) % 2 === 0) continue;
      const ok = S.canRaise(g, s), cost = S.costOf(s.g);
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.globalAlpha = ok ? 1 : 0.35;
      ctx.strokeStyle = COL[s.arch]; ctx.lineWidth = 0.1;
      ctx.setLineDash([0.22, 0.16]); ctx.lineDashOffset = reduced ? 0 : -now / 500;
      shape(s.arch, 0.5 + 0.08 * (s.g - 1)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.necro;
      for (let i = 0; i < cost; i++) ctx.fillRect((i - (cost - 1) / 2) * 0.24 - 0.08, 0.86 + 0.08 * (s.g - 1), 0.16, 0.16);
      ctx.restore();
    }

    for (const e of g.enemies) drawEnemy(e);

    // 고른 소환수: 도는 고리. 같은 등급(합성하면 등급이 오른다)까지는 굵은 선, 다른 등급(삼킨다)까지는 옅은 선.
    const sel = g.selected === null ? null : g.units.find(u => u.uid === g.selected);
    if (sel) {
      ctx.save(); ctx.strokeStyle = COL.necro;
      for (const u of g.units) {
        if (u === sel) continue;
        const same = u.g === sel.g;
        ctx.lineWidth = same ? 0.14 : 0.05; ctx.setLineDash(same ? [] : [0.2, 0.2]); ctx.globalAlpha = same ? 1 : 0.6;
        ctx.beginPath(); ctx.moveTo(sel.x, sel.y); ctx.lineTo(u.x, u.y); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 0.13; ctx.setLineDash([0.35, 0.25]); ctx.lineDashOffset = reduced ? 0 : -now / 400;
      circle(sel.x, sel.y, sel.r + 0.55); ctx.stroke(); ctx.restore();
    }
    for (const u of g.units) drawUnit(u);

    ctx.fillStyle = n.hurt > 0 ? COL.danger : COL.necro;
    circle(n.x, n.y, n.r); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.08; circle(n.x, n.y, n.r + 0.16); ctx.stroke();
    ctx.fillStyle = COL.ground; circle(n.x, n.y, 0.16); ctx.fill();

    for (const f of g.fx) {
      if (f.k === 'hit') { ctx.strokeStyle = COL.ink; ctx.lineWidth = f.big ? 0.14 : 0.08; circle(f.x, f.y, 0.25 + (0.15 - f.t) * (f.big ? 6 : 3)); ctx.stroke(); }
      else if (f.k === 'shot') { ctx.strokeStyle = COL[f.arch]; ctx.lineWidth = f.arch === 'shooter' ? 0.16 : 0.07; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'die') { ctx.strokeStyle = COL[f.arch]; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.4 + (0.35 - f.t) * 3); ctx.stroke(); }
      else if (f.k === 'block') { ctx.strokeStyle = COL.armor; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.6, f.face - 1.1, f.face + 1.1); ctx.stroke(); }
      else if (f.k === 'raise') { ctx.strokeStyle = COL[f.arch]; ctx.lineWidth = 0.14; circle(f.x, f.y, 0.5 + (0.45 - f.t) * 3); ctx.stroke(); }
      else if (f.k === 'miss') { ctx.strokeStyle = COL.dim; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(f.x - 0.2, f.y - 0.2); ctx.lineTo(f.x + 0.2, f.y + 0.2); ctx.moveTo(f.x + 0.2, f.y - 0.2); ctx.lineTo(f.x - 0.2, f.y + 0.2); ctx.stroke(); }
      else if (f.k === 'fuse') {
        const life = f.result === 'absorb' ? 0.5 : 1.1, k = Math.min(1, (life - f.t) / 0.6);
        const col = f.result === 'great' ? COL.great : f.result === 'fail' ? COL.danger : COL.necro;
        if (k < 1) {
          ctx.strokeStyle = col; ctx.lineWidth = f.result === 'great' ? 0.28 : 0.18;
          circle(f.x, f.y, f.r + 0.2 + k * 2.2); ctx.stroke();
          ctx.lineWidth = 0.08; circle(f.x, f.y, f.r + 0.2 + k * 4); ctx.stroke();
          if (f.result === 'great') {
            for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * (f.r + 0.4 + k), f.y + Math.sin(a) * (f.r + 0.4 + k)); ctx.lineTo(f.x + Math.cos(a) * (f.r + 1.1 + k * 2.4), f.y + Math.sin(a) * (f.r + 1.1 + k * 2.4)); ctx.stroke(); }
          }
        }
      }
      else if (f.k === 'down') { ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.6 + (0.5 - f.t) * 2); ctx.stroke(); }
    }

    // 여기부터 화면 좌표(글자가 또렷하게 나오게)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const px = scale / dpr;
    for (const e of g.enemies) if (e.g > 1) label(String(e.g), sx(e.x), sy(e.y), Math.max(11, e.r * px * 0.9), COL.ground);
    for (const s of g.souls) { ctx.globalAlpha = S.canRaise(g, s) ? 1 : 0.4; label(String(s.g), sx(s.x), sy(s.y), 13, COL[s.arch]); ctx.globalAlpha = 1; }
    for (const u of g.units) label(String(u.g), sx(u.x), sy(u.y), Math.max(13, u.r * px * 0.95), COL.ground);
    if (sel) label(S.nameOf(sel), sx(sel.x), sy(sel.y - sel.r) - 26, 15, COL.ink);
    // 합성 결과: 새 몬스터의 이름을 그 자리에서 한 번 보여 준다
    for (const f of g.fx) {
      if (f.k !== 'fuse' || !f.name) continue;
      const col = f.result === 'great' ? COL.great : f.result === 'fail' ? COL.danger : COL.ink;
      const head = f.result === 'great' ? '대성공 · ' + f.grade + '등급' : f.result === 'fail' ? '실패 · ' + f.grade + '등급' : f.grade + '등급';
      label(head, sx(f.x), sy(f.y - f.r) - 52, 13, col);
      label(f.name, sx(f.x), sy(f.y - f.r) - 30, 20, col, FONT_D);
    }

    // 화면 고정 표시: 남은 시간, 체력, MP, 소환수 자리
    const w = cv.width / dpr, pad = 16, bw = w - pad * 2;
    ctx.fillStyle = COL.grid; ctx.fillRect(pad, 12, bw, 6);
    ctx.fillStyle = COL.ink; ctx.fillRect(pad, 12, bw * (1 - g.t / S.DURATION), 6);
    ctx.fillStyle = COL.grid; ctx.fillRect(pad, 24, bw, 10);
    ctx.fillStyle = n.hp / n.maxHp < 0.3 ? COL.danger : COL.necro; ctx.fillRect(pad, 24, bw * n.hp / n.maxHp, 10);
    const seg = 18, sg = 4;
    for (let i = 0; i < n.maxMp; i++) {
      const f = Math.max(0, Math.min(1, n.mp - i));
      ctx.fillStyle = COL.grid; ctx.fillRect(pad + i * (seg + sg), 42, seg, 12);
      ctx.fillStyle = COL.necro; ctx.fillRect(pad + i * (seg + sg), 42, seg * f, 12);
    }
    for (let i = 0; i < S.CFG.maxUnits; i++) {
      ctx.beginPath(); ctx.arc(w - pad - 10 - i * 26, 78, 9, 0, Math.PI * 2);
      if (i < S.CFG.maxUnits - g.units.length) { ctx.strokeStyle = COL.dim; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = COL.bone; ctx.fill(); }
    }
    ctx.font = '600 14px ' + FONT; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.ink;
    ctx.textAlign = 'right'; ctx.fillText(Math.ceil(S.DURATION - g.t) + '초', w - pad, 49);

    if (stick && stick.far >= 14) {
      const r = cv.getBoundingClientRect();
      ctx.strokeStyle = COL.dim; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(stick.x0 - r.left, stick.y0 - r.top, 56, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COL.dim; ctx.beginPath(); ctx.arc(stick.x0 - r.left + inp.x * 56, stick.y0 - r.top + inp.y * 56, 18, 0, Math.PI * 2); ctx.fill();
    }
  }

  function showEnd() {
    mode = 'over';
    const fresh = Object.keys(g.found).filter(k => !dex[k]);
    for (const k of Object.keys(g.found)) dex[k] = true;
    saveDex(dex);
    document.getElementById('endTitle').textContent = g.over === 'win' ? '버텼다' : '쓰러졌다';
    document.getElementById('endTime').textContent = g.t.toFixed(0) + '초';
    document.getElementById('endKills').textContent = g.kills + '마리';
    document.getElementById('endFused').textContent = g.fusions + '번 (대성공 ' + g.greats + ', 실패 ' + g.fails + ')';
    document.getElementById('endGrade').textContent = g.maxGrade + '등급';
    document.getElementById('endDex').textContent = Object.keys(dex).length + ' / ' + (S.MAX_GRADE * S.ARCHS.length) + '종';
    const names = fresh.map(k => { const p = k.split(':'); return p[0] + '등급 ' + S.MON[+p[0]][p[1]]; });
    document.getElementById('endNew').textContent = names.length ? '새로 만난 몬스터: ' + names.join(', ') : '새로 만난 몬스터는 없다.';
    endEl.hidden = false;
    document.getElementById('againBtn').focus();
  }

  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    // 합성하는 순간 잠깐 느려진다. 무엇이 나왔는지 볼 틈을 준다.
    if (slow > 0) { slow -= dt; dt *= 0.2; }
    if (mode === 'play') {
      readInput();
      S.step(g, dt, inp);
      if (g.over) showEnd();
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  resize();
  g = S.newGame(seed);   // 제목 화면 뒤에 판의 첫 모습을 깔아 둔다
  requestAnimationFrame(frame);
})();
