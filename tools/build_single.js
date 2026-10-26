// 페이지를 단일 HTML 로: 스크립트를 안에 넣고, 쓰는 그림은 data URI 로 품음 (서버 없이 더블클릭으로 열림)
// 사용: node tools/build_single.js [web/game.html] [build/기사쥐_외전.html]
//  그림 찾기: 넣는 스크립트 · HTML 안의 "../art/....png" 문자열 + RIGS/ANIMS 의 부위 · 컷 + 게임이 경로를 조립하는 그림(아래 EXTRA)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, process.argv[2] || 'web/game.html');
const OUT = path.join(ROOT, process.argv[3] || 'build/기사쥐_외전.html');
const WEB = path.dirname(PAGE);

const read = (p) => fs.readFileSync(p, 'utf8');
const assets = {};
const want = new Set();
const add = (rel) => { if (fs.existsSync(path.join(WEB, rel))) want.add(rel); };

let html = read(PAGE);
const scripts = [];
html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => { scripts.push(src); return m; });
for (const src of scripts) {
  const code = read(path.join(WEB, src));
  for (const m of code.matchAll(/\.\.\/art\/[\w/.-]+\.png/g)) add(m[0]);
  // art/<id>/rig.js · anims.js → 부위 · 컷 그림
  const id = (src.match(/\.\.\/art\/([^/]+)\/(rig|anims)\.js$/) || [])[1];
  if (id && src.endsWith('rig.js')) { const rig = JSON.parse(read(path.join(ROOT, 'art', id, 'rig.json'))); for (const p of Object.values(rig.parts || {})) add(`../art/${id}/${p.img}`); }
  if (id && src.endsWith('anims.js')) { const A = JSON.parse(read(path.join(ROOT, 'art', id, 'anims.json'))); for (const a of Object.values(A)) for (const f of a.frames) add(`../art/${id}/${f.img}`); }
}
// main.js 가 반복문으로 경로를 만드는 그림
const EXTRA = [];
for (let i = 1; i <= 5; i++) EXTRA.push(`../art/stages/stage${i}.png`);
for (let i = 0; i < 6; i++) EXTRA.push(`../art/base/b/${i}.png`);
for (const n of ['arrow', 'fireball', 'ring', 'heart', 'slash', 'star', 'bolt_a']) EXTRA.push(`../art/fx/${n}.png`);
for (const k of ['hit', 'explosion', 'zap', 'poof']) for (let i = 1; i <= 6; i++) EXTRA.push(`../art/fx/${k}_${i}.png`);
EXTRA.forEach(add);

for (const m of html.matchAll(/src="(\.\.\/art\/[^"]+\.png)"/g)) add(m[1]);
for (const m of html.matchAll(/url\('(\.\.\/art\/[^']+\.png)'\)/g)) add(m[1]);
for (const n of ['ic_cheese', 'ic_scrap', 'ic_medal']) add(`../art/ui/${n}.png`);
// 줄인 webp 로 (tools/pack_images.py)
const PY = process.env.PY || 'C:/Project/underworld-proto/.venv/Scripts/python.exe';
require('child_process').execFileSync(PY, ['-I', path.join(__dirname, 'pack_images.py')], { input: [...want].join(' ') });
for (const rel of want) {
  const c = path.join(ROOT, 'build', 'cache', path.relative(ROOT, path.normalize(path.join(WEB, rel)))) + '.webp';
  assets[rel] = 'data:image/webp;base64,' + fs.readFileSync(c).toString('base64');
}
html = html.replace(/src="(\.\.\/art\/[^"]+\.png)"/g, (m, rel) => `src="${assets[rel] || rel}"`);
html = html.replace(/url\('(\.\.\/art\/[^']+\.png)'\)/g, (m, rel) => `url('${assets[rel] || rel}')`);
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
