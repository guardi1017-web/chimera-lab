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
    bone: C('--bone'), wolf: C('--wolf'), knight: C('--knight'), archer: C('--archer'), danger: C('--danger'),
  };
  const NAME = { wolf: '늑대', knight: '기사', archer: '궁수' };
  const SLOT_NAME = { head: '머리', arm: '팔', leg: '다리' };
  const titleEl = document.getElementById('title'), endEl = document.getElementById('end');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let g = null, mode = 'title', inp = { x: 0, y: 0 }, stick = null, keys = {}, last = 0;
  const VIEW_W = 13;   // 화면 가로에 들어오는 판의 폭. 판 전체(18)보다 좁혀 모든 것이 크게 보인다.
  let slow = 0, lastPicked = 0, camX = 0, camY = 0;
  let scale = 1, ox = 0, oy = 0, dpr = 1, seed = (Date.now() % 100000) + 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    scale = cv.width / VIEW_W;
    ox = (cv.width - S.W * scale) / 2;
    oy = (cv.height - S.H * scale) / 2;
  }
  window.addEventListener('resize', resize);

  function start() {
    g = S.newGame(seed++);
    lastPicked = 0; slow = 0;
    mode = 'play';
    titleEl.hidden = true; endEl.hidden = true;
    inp.x = inp.y = 0; stick = null;
  }
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('againBtn').addEventListener('click', start);

  // 화면 아무 곳이나 누르고 끌면 그 방향으로 움직인다.
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
  const lift = e => { if (stick && e.pointerId === stick.id) stick = null; };
  // 짧게 톡 누른 것은 이동이 아니라 고르기다: 가까운 키메라가 다음 부위를 받는다.
  cv.addEventListener('pointerup', e => {
    if (!stick || e.pointerId !== stick.id || mode !== 'play') return;
    if (performance.now() - stick.at < 280 && stick.far < 12) {
      const r = cv.getBoundingClientRect();
      const wx = (e.clientX - r.left) * dpr / scale + camX, wy = (e.clientY - r.top) * dpr / scale + camY;
      let best = null, bd = 1.8;
      for (const c of g.chimeras) { const d = Math.hypot(c.x - wx, c.y - wy); if (d < bd) { bd = d; best = c; } }
      if (best) S.setTarget(g, best.id);
    }
  });
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
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

  function drawPartGlyph(slot, r) {
    // 머리는 세모, 팔은 막대, 다리는 점 둘. 색이 아니라 모양으로도 칸을 구별한다.
    ctx.beginPath();
    if (slot === 'head') { ctx.moveTo(0, -r); ctx.lineTo(r * 0.9, r * 0.7); ctx.lineTo(-r * 0.9, r * 0.7); ctx.closePath(); ctx.fill(); }
    else if (slot === 'arm') { ctx.rect(-r, -r * 0.3, r * 2, r * 0.6); ctx.fill(); }
    else { circle(-r * 0.55, 0, r * 0.4); ctx.fill(); circle(r * 0.55, 0, r * 0.4); ctx.fill(); }
  }

  function drawChimera(c) {
    const p = c.parts, k = 1 + (reduced ? 0 : c.pop * 0.9), r = c.r * k;
    // 늑대 다리는 달릴 때 잔상이 남는다
    if (p.leg === 'wolf' && c.down <= 0 && !reduced) {
      ctx.fillStyle = COL.wolf;
      for (const d of [0.7, 1.3]) { ctx.globalAlpha = 0.25 / d; circle(c.x - Math.cos(c.face) * d * r, c.y - Math.sin(c.face) * d * r, r * 0.8); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.globalAlpha = c.down > 0 ? 0.3 : 1;
    ctx.rotate(c.face);
    // 다리: 몸 아래에 깔린다
    if (p.leg === 'wolf') {
      ctx.fillStyle = COL.wolf;
      for (const [lx, ly] of [[-0.6, -0.8], [-0.6, 0.8], [0.5, -0.8], [0.5, 0.8]]) { ctx.beginPath(); ctx.ellipse(lx * r, ly * r, r * 0.42, r * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.leg === 'knight') {
      ctx.strokeStyle = COL.knight; ctx.lineWidth = r * 0.34; circle(0, 0, r * 1.08); ctx.stroke();
    } else if (p.leg === 'archer') {
      ctx.strokeStyle = COL.archer; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * 0.2, s * r * 0.6); ctx.lineTo(-r * 1.7, s * r * 1.1); ctx.stroke(); }
    }
    // 몸
    ctx.fillStyle = COL.bone; circle(0, 0, r); ctx.fill();
    ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.06; ctx.stroke();
    // 몸에 찍힌 번호 점: 위쪽 표시의 몇 번째 키메라인지 알 수 있다
    ctx.fillStyle = COL.ground;
    for (let i = 0; i <= c.id; i++) { circle(-r * 0.45, (i - c.id / 2) * r * 0.36, r * 0.11); ctx.fill(); }
    // 팔
    if (p.arm === 'wolf') {
      ctx.fillStyle = COL.wolf;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.2, s * r * 0.9); ctx.lineTo(r * 1.35, s * r * 1.0); ctx.lineTo(r * 0.5, s * r * 1.35); ctx.closePath(); ctx.fill(); }
    } else if (p.arm === 'knight') {
      ctx.strokeStyle = COL.knight; ctx.lineWidth = r * 0.3; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.3, -0.9, 0.9); ctx.stroke();
    } else if (p.arm === 'archer') {
      ctx.strokeStyle = COL.archer; ctx.lineWidth = r * 0.16;
      ctx.beginPath(); ctx.arc(r * 0.5, r * 1.0, r * 0.75, -1.2, 1.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.77, r * 0.3); ctx.lineTo(r * 0.77, r * 1.7); ctx.stroke();
    }
    // 머리
    if (p.head === 'wolf') {
      ctx.fillStyle = COL.wolf;
      ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * 0.5, r * 0.55); ctx.lineTo(r * 0.5, -r * 0.55); ctx.closePath(); ctx.fill();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.45, s * r * 0.25); ctx.lineTo(r * 0.2, s * r * 0.85); ctx.lineTo(r * 0.75, s * r * 0.5); ctx.closePath(); ctx.fill(); }
    } else if (p.head === 'knight') {
      ctx.fillStyle = COL.knight; ctx.fillRect(r * 0.35, -r * 0.5, r * 0.9, r);
      ctx.fillStyle = COL.ground; ctx.fillRect(r * 0.95, -r * 0.32, r * 0.12, r * 0.64);
    } else if (p.head === 'archer') {
      ctx.fillStyle = COL.archer; circle(r * 0.7, 0, r * 0.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.4); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(r * 0.3, r * 0.4); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = COL.dim; circle(r * 0.55, 0, r * 0.28); ctx.fill();
    }
    ctx.restore();
    // 체력(다쳤을 때만)
    const mh = S.stats(c).maxHp;
    if (c.down <= 0 && c.hp < mh) bar(c.x, c.y - c.r - 0.45, 1.0, c.hp / mh, COL.bone);
    if (c.down > 0) {
      ctx.strokeStyle = COL.bone; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 0.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - c.down / 6)); ctx.stroke();
    }
  }

  function bar(x, y, w, f, col) {
    ctx.fillStyle = COL.grid; ctx.fillRect(x - w / 2, y, w, 0.12);
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 0.12);
  }

  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.face);
    ctx.fillStyle = COL[e.type]; ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.07;
    const r = e.r;
    ctx.beginPath();
    if (e.type === 'wolf') { ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, r * 0.85); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r * 0.85); ctx.closePath(); }
    else if (e.type === 'knight') { ctx.rect(-r, -r, r * 2, r * 2); }
    else { ctx.moveTo(r * 1.2, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 1.2, 0); ctx.lineTo(0, -r); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    ctx.restore();
    if (e.hp < e.maxHp) bar(e.x, e.y - e.r - 0.35, 0.9, e.hp / e.maxHp, COL.danger);
  }

  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!g) return;
    const vh = cv.height / scale;
    camX = Math.max(0, Math.min(S.W - VIEW_W, g.necro.x - VIEW_W / 2));
    camY = vh >= S.H ? (S.H - vh) / 2 : Math.max(0, Math.min(S.H - vh, g.necro.y - vh / 2));
    ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
    // 바닥: 판의 경계와 옅은 격자
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 0.03;
    for (let x = 0; x <= S.W; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke(); }
    for (let y = 0; y <= S.H; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.W, y); ctx.stroke(); }
    ctx.lineWidth = 0.08; ctx.strokeRect(0, 0, S.W, S.H);

    // 떨어진 부위
    for (const p of g.parts) {
      if (p.ttl < 3 && Math.floor(now / 120) % 2 === 0) continue;
      const pulse = reduced ? 1 : 1 + 0.12 * Math.sin(now / 160 + p.x);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.strokeStyle = COL[p.type]; ctx.lineWidth = 0.12; circle(0, 0, 0.7 * pulse); ctx.stroke();
      ctx.fillStyle = COL[p.type]; drawPartGlyph(p.slot, 0.36);
      ctx.restore();
    }

    for (const e of g.enemies) drawEnemy(e);
    for (const c of g.chimeras) drawChimera(c);
    // 부위를 받을 키메라: 도는 점선 고리
    if (g.target !== null) {
      const c = g.chimeras[g.target];
      ctx.save(); ctx.strokeStyle = COL.necro; ctx.lineWidth = 0.12; ctx.setLineDash([0.35, 0.25]);
      ctx.lineDashOffset = reduced ? 0 : -now / 400;
      circle(c.x, c.y, c.r + 0.55); ctx.stroke(); ctx.restore();
    }

    // 네크로맨서
    const n = g.necro;
    ctx.fillStyle = n.hurt > 0 ? COL.danger : COL.necro;
    circle(n.x, n.y, n.r); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.08; circle(n.x, n.y, n.r + 0.16); ctx.stroke();
    ctx.fillStyle = COL.ground; circle(n.x, n.y, 0.16); ctx.fill();

    // 효과
    for (const f of g.fx) {
      if (f.k === 'hit') {
        ctx.strokeStyle = f.bite || f.claw ? COL.wolf : COL.ink; ctx.lineWidth = f.bite || f.claw ? 0.14 : 0.08;
        circle(f.x, f.y, 0.25 + (0.15 - f.t) * (f.claw ? 6 : 3)); ctx.stroke();
      }
      else if (f.k === 'block') { ctx.strokeStyle = COL.knight; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.5, f.face - 1.1, f.face + 1.1); ctx.stroke(); }
      else if (f.k === 'knock') { ctx.strokeStyle = COL.knight; ctx.lineWidth = 0.1; circle(f.x, f.y, f.r + 0.3 + (0.2 - f.t) * 5); ctx.stroke(); }
      else if (f.k === 'shot') { ctx.strokeStyle = COL[f.type]; ctx.lineWidth = f.type === 'archer' ? 0.16 : 0.07; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'die') { ctx.strokeStyle = COL[f.type]; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.4 + (0.35 - f.t) * 3); ctx.stroke(); }
      else if (f.k === 'attach') {
        const c = g.chimeras[f.id], col = COL[f.type] || COL.bone, k = 1 - f.t / 0.45;
        ctx.strokeStyle = col; ctx.lineWidth = 0.2;
        ctx.beginPath(); ctx.moveTo(f.x + (c.x - f.x) * k, f.y + (c.y - f.y) * k); ctx.lineTo(c.x, c.y); ctx.stroke();
        circle(c.x, c.y, c.r + 0.3 + k * 1.8); ctx.stroke();
        ctx.lineWidth = 0.08; circle(c.x, c.y, c.r + 0.3 + k * 3.2); ctx.stroke();
      }
      else if (f.k === 'heal') { ctx.strokeStyle = COL.necro; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.7 + (0.4 - f.t) * 2); ctx.stroke(); }
      else if (f.k === 'down') { ctx.strokeStyle = COL.danger; ctx.lineWidth = 0.1; circle(f.x, f.y, 0.6 + (0.5 - f.t) * 2); ctx.stroke(); }
    }

    // 화면 고정 표시: 남은 시간, 네크로맨서 체력, 키메라 셋의 부위
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cv.width / dpr, pad = 16;
    const bw = w - pad * 2;
    ctx.fillStyle = COL.grid; ctx.fillRect(pad, 12, bw, 6);
    ctx.fillStyle = COL.ink; ctx.fillRect(pad, 12, bw * (1 - g.t / S.DURATION), 6);
    ctx.fillStyle = COL.grid; ctx.fillRect(pad, 24, bw, 10);
    ctx.fillStyle = n.hp / n.maxHp < 0.3 ? COL.danger : COL.necro; ctx.fillRect(pad, 24, bw * n.hp / n.maxHp, 10);
    ctx.font = '600 14px ' + C('--font-body'); ctx.textBaseline = 'top'; ctx.fillStyle = COL.ink;
    ctx.textAlign = 'right'; ctx.fillText(Math.ceil(S.DURATION - g.t) + '초', w - pad, 48);
    ctx.textAlign = 'left';
    g.chimeras.forEach((c, i) => {
      const x0 = pad + i * 92, y0 = 56;
      ctx.globalAlpha = c.down > 0 ? 0.35 : 1;
      if (g.target === i) { ctx.strokeStyle = COL.necro; ctx.lineWidth = 2; ctx.strokeRect(x0 - 4, y0 - 15, 84, 30); }
      ctx.fillStyle = COL.bone; ctx.beginPath(); ctx.arc(x0 + 10, y0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COL.ground;
      for (let d = 0; d <= i; d++) { ctx.beginPath(); ctx.arc(x0 + 10 + (d - i / 2) * 6, y0, 2, 0, Math.PI * 2); ctx.fill(); }
      S.SLOTS.forEach((s, j) => {
        ctx.save(); ctx.translate(x0 + 34 + j * 18, y0);
        ctx.fillStyle = c.parts[s] ? COL[c.parts[s]] : COL.grid;
        drawPartGlyph(s, 7);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    });

    // 조이스틱
    if (stick) {
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
    document.getElementById('endParts').textContent = g.picked + '개';
    const ul = document.getElementById('endChimeras');
    ul.textContent = '';
    g.chimeras.forEach((c, i) => {
      const li = document.createElement('li');
      const got = S.SLOTS.filter(s => c.parts[s]).map(s => NAME[c.parts[s]] + ' ' + SLOT_NAME[s]);
      li.textContent = '키메라 ' + (i + 1) + ': ' + (got.length ? got.join(', ') : '맨몸');
      ul.appendChild(li);
    });
    endEl.hidden = false;
    document.getElementById('againBtn').focus();
  }

  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    // 부위가 붙는 순간 잠깐 느려진다. 무엇이 어디에 붙었는지 볼 틈을 준다.
    if (g && g.picked !== lastPicked) { lastPicked = g.picked; if (!reduced) slow = 0.28; }
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
