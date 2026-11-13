// 2차 손질: 붙은 부위와 달라진 싸움이 폰에서 보이게 한다(화면을 당기고, 키메라를 키우고, 붙는 순간을 강조).
const fs = require('fs');
function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (s.split(a).length !== 2) throw new Error(file + ': 한 번만 나와야 하는 문자열 → ' + a.slice(0, 50));
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(file, s);
}
patch('src/sim.js', [
  ["archer: { hp: 20, spd: 2.8, dmg: 4,  cd: 1.8, range: 7.0,", "archer: { hp: 20, spd: 2.8, dmg: 4,  cd: 1.8, range: 5.5,"],
  ["hp: 70, r: 0.5, parts:", "hp: 70, r: 0.7, parts:"],
  ["c.r = 0.5 + 0.07 * partCount(c);\n    c.pop = 0.5;", "c.r = 0.7 + 0.12 * partCount(c);\n    c.pop = 0.6;"],
  ["type: 'archer', t: 0.12 });", "type: 'archer', t: 0.2 });"],
  ["    c.hp -= dmg * stats(c).taken;", "    const s = stats(c);\n    if (s.taken < 1) g.fx.push({ k: 'block', x: c.x, y: c.y, face: c.face, r: c.r, t: 0.18 });\n    c.hp -= dmg * s.taken;"],
  ["          else g.fx.push({ k: 'hit', x: best.x, y: best.y, t: 0.15 });",
   "          else g.fx.push({ k: 'hit', x: best.x, y: best.y, t: 0.15, bite: c.parts.head === 'wolf', claw: c.parts.arm === 'wolf' });\n          if (s.knock > 0) g.fx.push({ k: 'knock', x: c.x, y: c.y, r: c.r, t: 0.2 });"],
]);
patch('src/render.js', [
  ["  let scale = 1, ox = 0, oy = 0, dpr = 1, seed", "  const VIEW_W = 12;   // 화면 가로에 들어오는 판의 폭. 판 전체(18)보다 좁혀 모든 것이 크게 보인다.\n  let slow = 0, lastPicked = 0, camX = 0, camY = 0;\n  let scale = 1, ox = 0, oy = 0, dpr = 1, seed"],
  ["    scale = Math.min(cv.width / S.W, cv.height / S.H);", "    scale = cv.width / VIEW_W;"],
  ["    g = S.newGame(seed++);\n    mode = 'play';", "    g = S.newGame(seed++);\n    lastPicked = 0; slow = 0;\n    mode = 'play';"],
  ["    const p = c.parts, k = 1 + (reduced ? 0 : c.pop * 0.5), r = c.r * k;", "    const p = c.parts, k = 1 + (reduced ? 0 : c.pop * 0.9), r = c.r * k;\n    // 늑대 다리는 달릴 때 잔상이 남는다\n    if (p.leg === 'wolf' && c.down <= 0 && !reduced) {\n      ctx.fillStyle = COL.wolf;\n      for (const d of [0.7, 1.3]) { ctx.globalAlpha = 0.25 / d; circle(c.x - Math.cos(c.face) * d * r, c.y - Math.sin(c.face) * d * r, r * 0.8); ctx.fill(); }\n      ctx.globalAlpha = 1;\n    }"],
  ["    ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.06; ctx.stroke();\n    // 팔", "    ctx.strokeStyle = COL.ground; ctx.lineWidth = 0.06; ctx.stroke();\n    // 몸에 찍힌 번호 점: 위쪽 표시의 몇 번째 키메라인지 알 수 있다\n    ctx.fillStyle = COL.ground;\n    for (let i = 0; i <= c.id; i++) { circle(-r * 0.45, (i - c.id / 2) * r * 0.36, r * 0.11); ctx.fill(); }\n    // 팔"],
  ["    ctx.setTransform(scale, 0, 0, scale, ox, oy);\n    // 바닥", "    const vh = cv.height / scale;\n    camX = Math.max(0, Math.min(S.W - VIEW_W, g.necro.x - VIEW_W / 2));\n    camY = vh >= S.H ? (S.H - vh) / 2 : Math.max(0, Math.min(S.H - vh, g.necro.y - vh / 2));\n    ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);\n    // 바닥"],
  ["      ctx.strokeStyle = COL[p.type]; ctx.lineWidth = 0.09; circle(0, 0, 0.55 * pulse); ctx.stroke();\n      ctx.fillStyle = COL[p.type]; drawPartGlyph(p.slot, 0.28);",
   "      ctx.strokeStyle = COL[p.type]; ctx.lineWidth = 0.12; circle(0, 0, 0.7 * pulse); ctx.stroke();\n      ctx.fillStyle = COL[p.type]; drawPartGlyph(p.slot, 0.36);"],
  ["      if (f.k === 'hit') { ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.08; circle(f.x, f.y, 0.25 + (0.15 - f.t) * 3); ctx.stroke(); }",
   "      if (f.k === 'hit') {\n        ctx.strokeStyle = f.bite || f.claw ? COL.wolf : COL.ink; ctx.lineWidth = f.bite || f.claw ? 0.14 : 0.08;\n        circle(f.x, f.y, 0.25 + (0.15 - f.t) * (f.claw ? 6 : 3)); ctx.stroke();\n      }\n      else if (f.k === 'block') { ctx.strokeStyle = COL.knight; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.5, f.face - 1.1, f.face + 1.1); ctx.stroke(); }\n      else if (f.k === 'knock') { ctx.strokeStyle = COL.knight; ctx.lineWidth = 0.1; circle(f.x, f.y, f.r + 0.3 + (0.2 - f.t) * 5); ctx.stroke(); }"],
  ["else if (f.k === 'shot') { ctx.strokeStyle = COL[f.type]; ctx.lineWidth = 0.07;", "else if (f.k === 'shot') { ctx.strokeStyle = COL[f.type]; ctx.lineWidth = f.type === 'archer' ? 0.16 : 0.07;"],
  ["        ctx.strokeStyle = col; ctx.lineWidth = 0.12;\n        ctx.beginPath(); ctx.moveTo(f.x + (c.x - f.x) * k, f.y + (c.y - f.y) * k); ctx.lineTo(c.x, c.y); ctx.stroke();\n        circle(c.x, c.y, c.r + 0.3 + k * 0.9); ctx.stroke();",
   "        ctx.strokeStyle = col; ctx.lineWidth = 0.2;\n        ctx.beginPath(); ctx.moveTo(f.x + (c.x - f.x) * k, f.y + (c.y - f.y) * k); ctx.lineTo(c.x, c.y); ctx.stroke();\n        circle(c.x, c.y, c.r + 0.3 + k * 1.8); ctx.stroke();\n        ctx.lineWidth = 0.08; circle(c.x, c.y, c.r + 0.3 + k * 3.2); ctx.stroke();"],
  ["      const x0 = pad + i * 64, y0 = 50;", "      const x0 = pad + i * 92, y0 = 56;"],
  ["      ctx.fillStyle = COL.bone; ctx.beginPath(); ctx.arc(x0 + 8, y0, 7, 0, Math.PI * 2); ctx.fill();", "      ctx.fillStyle = COL.bone; ctx.beginPath(); ctx.arc(x0 + 10, y0, 10, 0, Math.PI * 2); ctx.fill();\n      ctx.fillStyle = COL.ground;\n      for (let d = 0; d <= i; d++) { ctx.beginPath(); ctx.arc(x0 + 10 + (d - i / 2) * 6, y0, 2, 0, Math.PI * 2); ctx.fill(); }"],
  ["        ctx.save(); ctx.translate(x0 + 26 + j * 12, y0);", "        ctx.save(); ctx.translate(x0 + 34 + j * 18, y0);"],
  ["        drawPartGlyph(s, 4.5);", "        drawPartGlyph(s, 7);"],
  ["    ctx.textAlign = 'right'; ctx.fillText(Math.ceil(S.DURATION - g.t) + '초', w - pad, 42);", "    ctx.textAlign = 'right'; ctx.fillText(Math.ceil(S.DURATION - g.t) + '초', w - pad, 48);"],
  ["    const dt = Math.min(0.05, (now - last) / 1000 || 0);\n    last = now;", "    let dt = Math.min(0.05, (now - last) / 1000 || 0);\n    last = now;\n    // 부위가 붙는 순간 잠깐 느려진다. 무엇이 어디에 붙었는지 볼 틈을 준다.\n    if (g && g.picked !== lastPicked) { lastPicked = g.picked; if (!reduced) slow = 0.28; }\n    if (slow > 0) { slow -= dt; dt *= 0.2; }"],
]);
console.log('patched');
