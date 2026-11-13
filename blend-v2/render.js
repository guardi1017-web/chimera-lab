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
    bone: C('--bone'), wolf: C('--wolf'), knight: C('--knight'), archer: C('--archer'), danger: C('--danger'), great: C('--great'),
  };
  const NAME = { bone: '해골', wolf: '늑대', knight: '기사', archer: '궁수' };
  const ORDER = ['knight', 'wolf', 'archer', 'bone'];
  const titleEl = document.getElementById('title'), endEl = document.getElementById('end');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VIEW_W = 13;   // 화면 가로에 들어오는 판의 폭

  let g = null, mode = 'title', inp = { x: 0, y: 0 }, stick = null, keys = {}, last = 0;
  let scale = 1, dpr = 1, camX = 0, camY = 0, slow = 0, seed = (Date.now() % 100000) + 1;

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
        if (!reduced && (res === 'normal' || res === 'great' || res === 'fail')) slow = res === 'great' ? 0.6 : 0.35;
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
  // 적과 혼이 같은 모양을 쓴다: 늑대는 화살촉, 기사는 네모, 궁수는 마름모.
  function shape(type, r) {
    ctx.beginPath();
    if (type === 'wolf') { ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, r * 0.85); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r * 0.85); ctx.closePath(); }
    else if (type === 'knight') { ctx.rect(-r, -r, r * 2, r * 2); }
    else { ctx.moveTo(r * 1.2, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 1.2, 0); ctx.lineTo(0, -r); ctx.closePath(); }
  }

  // 소환수의 모습은 들어간 재료에서 나온다: 기사는 갑옷 띠, 늑대는 주둥이와 귀, 궁수는 등의 가시와 활.
  function drawUnit(u, now) {
    const e = u.ess, k = 1 + (reduced ? 0 : u.pop * 0.9), r = u.r * k;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.globalAlpha = u.down > 0 ? 0.3 : 1;
    ctx.rotate(u.face);
    if (e.archer > 0) {
      ctx.strokeStyle = COL.archer; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
      const q = Math.min(e.archer * 2 + 1, 9);
      for (let i = 0; i < q; i++) {
        const a = Math.PI + (i - (q - 1) / 2) * 0.28;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.lineTo(Math.cos(a) * r * (1.45 + 0.08 * e.archer), Math.sin(a) * r * (1.45 + 0.08 * e.archer)); ctx.stroke();
      }
    }
    ctx.fillStyle = COL.bone; circle(0, 0, r); ctx.fill();
    ctx.strokeStyle = u.great ? COL.great : COL.ground; ctx.lineWidth = u.great ? 0.12 : 0.06; ctx.stroke();
    if (e.knight > 0) {
      ctx.strokeStyle = COL.knight; ctx.lineCap = 'butt';
      const bands = Math.min(e.knight, 4);
      ctx.lineWidth = r * 0.16;
      for (let i = 0; i < bands; i++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.34 + 0.2 * i), -1.25, 1.25); ctx.stroke(); }
      if (e.knight >= 2) { ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.arc(0, 0, r * 1.2, -0.8, 0.8); ctx.stroke(); }
    }
    if (e.wolf > 0) {
      const L = 0.45 + 0.22 * Math.min(e.wolf, 4);
      ctx.fillStyle = COL.wolf;
      ctx.beginPath(); ctx.moveTo(r * (1 + L), 0); ctx.lineTo(r * 0.75, r * 0.5); ctx.lineTo(r * 0.75, -r * 0.5); ctx.closePath(); ctx.fill();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.5, s * r * 0.45); ctx.lineTo(r * 0.15, s * r * (0.95 + 0.1 * Math.min(e.wolf, 4))); ctx.lineTo(r * 0.85, s * r * 0.6); ctx.closePath(); ctx.fill(); }
    }
    if (e.archer > 0) {
      ctx.strokeStyle = COL.archer; ctx.lineWidth = r * 0.14;
      ctx.beginPath(); ctx.arc(r * 0.55, r * 0.95, r * 0.6, -1.2, 1.2); ctx.stroke();
    }
    if (e.wolf === 0 && e.knight === 0 && e.archer === 0) { ctx.fillStyle = COL.dim; circle(r * 0.5, 0, r * 0.28); ctx.fill(); }
    ctx.restore();

    // 무엇이 몇 개 들어갔는지: 머리 위 점
    const n = S.essCount(u), shown = Math.min(n, 12), dr = 0.11, gap = 0.27;
    let i = 0;
    for (const kind of ORDER) {
      for (let c = 0; c < u.ess[kind] && i < shown; c++, i++) {
        ctx.fillStyle = COL[kind];
        circle(u.x + (i - (shown - 1) / 2) * gap, u.y - u.r - 0.3, dr); ctx.fill();
      }
    }
    const mh = S.stats(u).maxHp;
    if (u.down <= 0 && u.hp < mh) bar(u.x, u.y - u.r - 0.62, Math.max(1, u.r * 1.6), u.hp / mh, COL.bone);
    if (u.down > 0) {
      ctx.strokeStyle = COL.bone; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 0.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.down / 6)); ctx.stroke();
    }
  }

  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.face);
    ctx.fillStyle = COL[e.type]; ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.07;
    shape(e.type, e.r); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (e.hp < e.maxHp) bar(e.x, e.y - e.r - 0.35, 0.9, e.hp / e.maxHp, COL.danger);
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
      const ok = S.canRaise(g, s), cost = S.CFG.cost[s.type];
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.globalAlpha = ok ? 1 : 0.35;
      ctx.strokeStyle = COL[s.type]; ctx.lineWidth = 0.1;
      ctx.setLineDash([0.22, 0.16]); ctx.lineDashOffset = reduced ? 0 : -now / 500;
      shape(s.type, 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.necro;
      for (let i = 0; i < cost; i++) ctx.fillRect((i - (cost - 1) / 2) * 0.24 - 0.08, 0.78, 0.16, 0.16);
      ctx.restore();
    }

    for (const e of g.enemies) drawEnemy(e);

    // 합성하려고 고른 소환수: 도는 고리, 그리고 합칠 수 있는 다른 소환수까지의 선
    const sel = g.selected === null ? null : g.units.find(u => u.uid === g.selected);
    if (sel) {
      ctx.save(); ctx.strokeStyle = COL.necro; ctx.lineWidth = 0.07; ctx.setLineDash([0.2, 0.2]);
      for (const u of g.units) { if (u !== sel) { ctx.beginPath(); ctx.moveTo(sel.x, sel.y); ctx.lineTo(u.x, u.y); ctx.stroke(); } }
      ctx.lineWidth = 0.13; ctx.setLineDash([0.35, 0.25]); ctx.lineDashOffset = reduced ? 0 : -now / 400;
      circle(sel.x, sel.y, sel.r + 0.5); ctx.stroke(); ctx.restore();
    }
    for (const u of g.units) drawUnit(u, now);

    ctx.fillStyle = n.hurt > 0 ? COL.danger : COL.necro;
    circle(n.x, n.y, n.r); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.08; circle(n.x, n.y, n.r + 0.16); ctx.stroke();
    ctx.fillStyle = COL.ground; circle(n.x, n.y, 0.16); ctx.fill();

    for (const f of g.fx) {
      if (f.k === 'hit') { ctx.strokeStyle = f.wolf ? COL.wolf : COL.ink; ctx.lineWidth = f.wolf ? 0.13 : 0.08; circle(f.x, f.y, 0.25 + (0.15 - f.t) * 4); ctx.stroke(); }
      else if (f.k === 'shot') { ctx.strokeStyle = COL[f.type]; ctx.lineWidth = f.type === 'archer' ? 0.16 : 0.07; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'die') { ctx.strokeStyle = COL[f.type]; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.4 + (0.35 - f.t) * 3); ctx.stroke(); }
      else if (f.k === 'block') { ctx.strokeStyle = COL.knight; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.45, f.face - 1.1, f.face + 1.1); ctx.stroke(); }
      else if (f.k === 'raise') { ctx.strokeStyle = COL[f.type]; ctx.lineWidth = 0.14; circle(f.x, f.y, 0.5 + (0.45 - f.t) * 3); ctx.stroke(); }
      else if (f.k === 'fuse') {
        const k = 1 - f.t / 0.6, col = f.result === 'great' ? COL.great : f.result === 'fail' ? COL.danger : COL.necro;
        ctx.strokeStyle = col; ctx.lineWidth = f.result === 'great' ? 0.28 : 0.18;
        circle(f.x, f.y, f.r + 0.2 + k * 2.2); ctx.stroke();
        ctx.lineWidth = 0.08; circle(f.x, f.y, f.r + 0.2 + k * 4); ctx.stroke();
        if (f.result === 'great') {
          for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * (f.r + 0.4 + k), f.y + Math.sin(a) * (f.r + 0.4 + k)); ctx.lineTo(f.x + Math.cos(a) * (f.r + 1.1 + k * 2.4), f.y + Math.sin(a) * (f.r + 1.1 + k * 2.4)); ctx.stroke(); }
        }
      }
      else if (f.k === 'down') { ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.6 + (0.5 - f.t) * 2); ctx.stroke(); }
    }

    // 화면 고정 표시: 남은 시간, 체력, MP, 소환수 자리
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      ctx.beginPath(); ctx.arc(w - pad - 10 - i * 26, 76, 9, 0, Math.PI * 2);
      if (i < S.CFG.maxUnits - g.units.length) { ctx.strokeStyle = COL.dim; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = COL.bone; ctx.fill(); }
    }
    ctx.font = '600 14px ' + C('--font-body'); ctx.textBaseline = 'middle'; ctx.fillStyle = COL.ink;
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
    document.getElementById('endTitle').textContent = g.over === 'win' ? '버텼다' : '쓰러졌다';
    document.getElementById('endTime').textContent = g.t.toFixed(0) + '초';
    document.getElementById('endKills').textContent = g.kills + '마리';
    document.getElementById('endRaised').textContent = g.raised + '마리';
    document.getElementById('endFused').textContent = g.fusions + '번' + (g.greats ? ' (대성공 ' + g.greats + '번)' : '');
    const ul = document.getElementById('endUnits');
    ul.textContent = '';
    g.units.forEach(u => {
      const li = document.createElement('li');
      li.textContent = ORDER.filter(k => u.ess[k] > 0).map(k => NAME[k] + ' ' + u.ess[k]).join(' · ');
      ul.appendChild(li);
    });
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
