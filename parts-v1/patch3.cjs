// 3차 손질: 키메라를 톡 누르면 그 키메라가 다음 부위를 받는다.
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
  ["      spawnT: 1.2, kills: 0, picked: 0, spawned: 0,", "      spawnT: 1.2, kills: 0, picked: 0, spawned: 0,\n      target: null,   // 부위를 받을 키메라(없으면 빈 칸 먼저)"],
  ["    let c = g.chimeras.find(c => !c.parts[p.slot]);\n    if (!c) {",
   "    let c = g.target === null ? g.chimeras.find(c => !c.parts[p.slot]) : (g.chimeras[g.target].parts[p.slot] === p.type ? null : g.chimeras[g.target]);\n    if (!c && g.target === null) {"],
  ["  const api = { W, H, DURATION, SLOTS, ENEMY, newGame, step, stats, partCount };",
   "  // 같은 키메라를 다시 고르면 지정이 풀린다.\n  function setTarget(g, id) { g.target = g.target === id ? null : id; }\n\n  const api = { W, H, DURATION, SLOTS, ENEMY, newGame, step, stats, partCount, setTarget };"],
]);
patch('src/render.js', [
  ["  const VIEW_W = 12;", "  const VIEW_W = 13;"],
  ["    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };",
   "    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, at: performance.now(), far: 0 };"],
  ["    stick.x = e.clientX; stick.y = e.clientY;\n  });",
   "    stick.x = e.clientX; stick.y = e.clientY;\n    stick.far = Math.max(stick.far, Math.hypot(stick.x - stick.x0, stick.y - stick.y0));\n  });"],
  ["  const lift = e => { if (stick && e.pointerId === stick.id) stick = null; };\n  cv.addEventListener('pointerup', lift);",
   "  const lift = e => { if (stick && e.pointerId === stick.id) stick = null; };\n  // 짧게 톡 누른 것은 이동이 아니라 고르기다: 가까운 키메라가 다음 부위를 받는다.\n  cv.addEventListener('pointerup', e => {\n    if (!stick || e.pointerId !== stick.id || mode !== 'play') return;\n    if (performance.now() - stick.at < 280 && stick.far < 12) {\n      const r = cv.getBoundingClientRect();\n      const wx = (e.clientX - r.left) * dpr / scale + camX, wy = (e.clientY - r.top) * dpr / scale + camY;\n      let best = null, bd = 1.8;\n      for (const c of g.chimeras) { const d = Math.hypot(c.x - wx, c.y - wy); if (d < bd) { bd = d; best = c; } }\n      if (best) S.setTarget(g, best.id);\n    }\n  });\n  cv.addEventListener('pointerup', lift);"],
  ["    for (const c of g.chimeras) drawChimera(c);",
   "    for (const c of g.chimeras) drawChimera(c);\n    // 부위를 받을 키메라: 도는 점선 고리\n    if (g.target !== null) {\n      const c = g.chimeras[g.target];\n      ctx.save(); ctx.strokeStyle = COL.necro; ctx.lineWidth = 0.12; ctx.setLineDash([0.35, 0.25]);\n      ctx.lineDashOffset = reduced ? 0 : -now / 400;\n      circle(c.x, c.y, c.r + 0.55); ctx.stroke(); ctx.restore();\n    }"],
  ["      ctx.globalAlpha = c.down > 0 ? 0.35 : 1;\n      ctx.fillStyle = COL.bone; ctx.beginPath(); ctx.arc(x0 + 10, y0, 10, 0, Math.PI * 2); ctx.fill();",
   "      ctx.globalAlpha = c.down > 0 ? 0.35 : 1;\n      if (g.target === i) { ctx.strokeStyle = COL.necro; ctx.lineWidth = 2; ctx.strokeRect(x0 - 4, y0 - 15, 84, 30); }\n      ctx.fillStyle = COL.bone; ctx.beginPath(); ctx.arc(x0 + 10, y0, 10, 0, Math.PI * 2); ctx.fill();"],
]);
patch('src/page.html', [
  ["    <p class=\"note\">세모는 머리, 막대는 팔, 점 둘은 다리. 줍기 싫은 부위는 밟지 않고 지나간다.</p>",
   "    <p class=\"note\">세모는 머리, 막대는 팔, 점 둘은 다리. 키메라를 톡 누르면 그 키메라가 다음 부위를 받는다. 다시 누르면 풀린다.</p>"],
]);
console.log('patched');
