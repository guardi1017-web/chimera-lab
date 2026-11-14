// src의 파일을 한 장으로 합친다.
// index.html: 3D 쿼터뷰 판(GitHub Pages의 첫 화면, 2026-11-14 사용자 확인 뒤 바꿈). 2d.html: 예전 2D 판(비교와 smoke.cjs용).
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const head = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n<meta name="theme-color" content="#15121c">\n</head>\n<body>\n';
const tail = '\n</body>\n</html>\n';
const src = read('page.html');

const page = src
  .replace('/*__SIM__*/', () => read('sim.js'))
  .replace('/*__RENDER__*/', () => read('render.js'));
fs.writeFileSync(path.join(__dirname, '2d.html'), head + page + tail);

// 3D: WebGL 캔버스(#game3d)를 밑에 깔고, 지금의 2D 캔버스(#game)를 투명하게 위에 겹친다.
// 모듈 스크립트는 적힌 순서대로 돈다: render3d.js가 window.ChimeraView를 만든 뒤 render.js가 그것을 쓴다.
// three와 그 부속(GLTFLoader)을 같은 판(0.170.0)으로 CDN에서 받는다. 모듈보다 먼저 와야 한다.
const IMPORTMAP = '<script type="importmap">\n{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }\n</script>\n';
const marks = ['<canvas id="game" aria-label="키메라 실험 판"></canvas>', '</style>', '<script>\n/*__RENDER__*/\n</script>'];
for (const m of marks) if (!src.includes(m)) throw new Error('page.html에서 찾지 못했다: ' + m);
const page3d = src
  .replace(marks[0], '<canvas id="game3d" aria-hidden="true"></canvas>\n  ' + marks[0])
  .replace(marks[1], '  #game3d { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }\n  #game { position: relative; z-index: 1; }\n  .veil { z-index: 2; }\n' + marks[1])
  .replace(marks[2], () => IMPORTMAP + '<script type="module">\n' + read('render3d.js') + '\n</script>\n<script type="module">\n' + read('render.js') + '\n</script>')
  .replace('/*__SIM__*/', () => read('sim.js'));
fs.writeFileSync(path.join(__dirname, 'index.html'), head + page3d + tail);
console.log('index.html(3D) ' + page3d.length + '자, 2d.html ' + page.length + '자');
