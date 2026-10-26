// 전투 데모를 단일 HTML 로: 스크립트를 안에 넣고 그림은 data URI 로 품음 (서버 없이 더블클릭)
// 사용: node plane/tools/build_single.js  → plane/build/쥐비행기_전투데모.html
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'build', '쥐비행기_전투데모.html');

const read = (p) => fs.readFileSync(p, 'utf8');
const dataUri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

const assets = {};
const sprites = JSON.parse(read(path.join(ROOT, 'art/sprites/sprites.json')));
for (const frames of Object.values(sprites)) for (const f of frames) assets['../art/sprites/' + f.img] = dataUri(path.join(ROOT, 'art/sprites', f.img));

let html = read(path.join(WEB, 'index.html'));
let first = true;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = read(path.join(WEB, src)).replace(/<\/script/gi, '<\\/script');
  const pre = first ? `<script>window.__ASSETS = ${JSON.stringify(assets)};</script>\n` : '';
  first = false;
  return `${pre}<script>\n${code}\n</script>`;
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(OUT, (fs.statSync(OUT).size / 1048576).toFixed(1) + ' MB', Object.keys(assets).length + '개 그림');
