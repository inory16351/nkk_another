// 단일 HTML 빌드: node war/tools/build_single.js → war/build/war.html
// web/index.html 의 <script src> 를 전부 안에 넣고, 그림은 data URI 로 window.__ASSETS 에 넣음 (Rig.loadImage 가 먼저 찾음)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'build', 'war.html');

const read = (p) => fs.readFileSync(p, 'utf8');
const fromWeb = (ref) => path.normalize(path.join(WEB, ref));

// 그림 목록: assets.js(ART) · rig.js(RIGS) 를 돌려서 경로를 뽑음 (view.js · rig.js 와 같은 규칙)
const sb = { window: {} };
vm.createContext(sb);
for (const f of ['art/out/assets.js', 'art/rat/rig.js', 'art/cat/rig.js']) vm.runInContext(read(path.join(ROOT, f)), sb);
const refs = new Set(['../art/nkk/cat_boss_fuhrer.png']);
const ART = sb.window.ART;
for (const group of Object.values(ART)) for (const a of Object.values(group)) refs.add('../art/out/' + a.img);
for (const [sp, R] of Object.entries(sb.window.RIGS)) {
  for (const V of Object.values(R.views)) for (const p of Object.values(V.parts)) refs.add(`../art/${sp}/${p.img}`);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const assets = {};
let bytes = 0;
for (const ref of refs) {
  const buf = fs.readFileSync(fromWeb(ref));
  bytes += buf.length;
  assets[ref] = `data:${MIME[path.extname(ref)]};base64,${buf.toString('base64')}`;
}

const inline = (code) => code.replace(/<\/script/gi, '<\\/script');
let html = read(path.join(WEB, 'index.html'));
let first = true;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  let s = `<script>\n${inline(read(fromWeb(src)))}\n</script>`;
  if (first) { s = `<script>window.__ASSETS = ${JSON.stringify(assets)};</script>\n` + s; first = false; }
  return s;
});
if (/<script src=/.test(html)) throw new Error('못 넣은 script 가 남음');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`${path.relative(process.cwd(), OUT)} — 그림 ${refs.size}개 (${(bytes / 1048576).toFixed(1)}MB) · 전체 ${(Buffer.byteLength(html) / 1048576).toFixed(1)}MB`);
