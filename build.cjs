// src의 세 파일을 한 장으로 합친다.
// index.html은 폰 브라우저에서 바로 열리는 완전한 페이지(GitHub Pages용)다.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const page = read('page.html')
  .replace('/*__SIM__*/', () => read('sim.js'))
  .replace('/*__RENDER__*/', () => read('render.js'));
fs.writeFileSync(path.join(__dirname, 'index.html'),
  '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n<meta name="theme-color" content="#15121c">\n</head>\n<body>\n' + page + '\n</body>\n</html>\n');
console.log('index.html ' + page.length + '자');
