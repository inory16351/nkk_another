// 단일 HTML 빌드: node war/tools/build_single.js → war/build/war.html
// web/index.html 의 <script src> 를 전부 안에 넣고, 그림 · 소리는 data URI 로 window.__ASSETS 에 넣음 (Rig.loadImage · Music 이 먼저 찾음)
// 그림은 용량을 줄이려고 webp 로 바꿔 넣음 (war/build/cache, 파이썬 Pillow)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'build', 'war.html');
const CACHE = path.join(ROOT, 'build', 'cache');

const read = (p) => fs.readFileSync(p, 'utf8');
const fromWeb = (ref) => path.normalize(path.join(WEB, ref));

// 그림 목록: assets.js(ART) · rigs.js(RIGS) · deco.js(DECO) 를 돌려서 경로를 뽑음 (view.js · rig.js 와 같은 규칙)
const sb = { window: {} };
vm.createContext(sb);
for (const f of ['art/out/assets.js', 'art/rigs.js', 'art/out/deco.js', 'art/out/fx.js', 'art/out/icons.js']) vm.runInContext(read(path.join(ROOT, f)), sb);
const refs = new Set(['../art/nkk/cat_boss_fuhrer.png', '../art/out/lobby_bg.jpg', '../art/audio/lobby.mp3', '../art/audio/battle.mp3']);
for (const group of Object.values(sb.window.ART)) for (const a of Object.values(group)) refs.add('../art/out/' + a.img);
for (const a of Object.values(sb.window.DECO || {})) refs.add('../art/out/' + a.img);
for (const fr of Object.values(sb.window.FXART || {})) for (const f of fr) refs.add('../art/out/' + f);
for (const f of Object.values(sb.window.ICONS || {})) refs.add('../art/out/' + f);
for (const [sp, R] of Object.entries(sb.window.RIGS)) {
  for (const [vn, V] of Object.entries(R.views)) {
    for (const p of Object.values(V.parts)) {
      refs.add(`../art/${sp}/${p.img}`);
      for (let f = 0; f < (p.faces || 0); f++) refs.add(`../art/${sp}/parts/${vn}/head_f${f}.png`);
    }
    if (V.crouch) refs.add(`../art/${sp}/${V.crouch.img}`);
  }
}

// png → webp (바뀐 것만)
const pngs = [...refs].filter((r) => r.endsWith('.png'));
const job = path.join(CACHE, '_job.json');
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(job, JSON.stringify(pngs.map((r) => [fromWeb(r), path.join(CACHE, r.replace(/^\.\.\//, '').replace(/[\\/]/g, '__') + '.webp')])));
execFileSync('python', ['-I', '-c', `
import json, os, sys
from PIL import Image
for src, dst in json.load(open(sys.argv[1], encoding='utf-8')):
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        continue
    Image.open(src).save(dst, 'WEBP', quality=88, method=4)
`, job], { stdio: 'inherit' });

const MIME = { '.png': 'image/webp', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const assets = {};
let bytes = 0;
for (const ref of refs) {
  const file = ref.endsWith('.png') ? path.join(CACHE, ref.replace(/^\.\.\//, '').replace(/[\\/]/g, '__') + '.webp') : fromWeb(ref);
  const buf = fs.readFileSync(file);
  bytes += buf.length;
  assets[ref] = `data:${MIME[path.extname(ref)]};base64,${buf.toString('base64')}`;
}

const inline = (code) => code.replace(/<\/script/gi, '<\\/script');
// CSS 의 UI 키트 그림 주소도 data URI 로
const cssUrl = (h) => h.replace(/url\((\.\.\/art\/out\/ui\/[^)]+)\)/g, (_, ref) => `url(data:image/png;base64,${fs.readFileSync(fromWeb(ref)).toString('base64')})`);
let html = cssUrl(read(path.join(WEB, 'index.html')));
let first = true;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  let s = `<script>\n${inline(read(fromWeb(src)))}\n</script>`;
  if (first) { s = `<script>window.__ASSETS = ${JSON.stringify(assets)};</script>\n` + s; first = false; }
  return s;
});
if (/<script src=/.test(html)) throw new Error('못 넣은 script 가 남음');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`${path.relative(process.cwd(), OUT)} — 그림 · 소리 ${refs.size}개 (${(bytes / 1048576).toFixed(1)}MB) · 전체 ${(Buffer.byteLength(html) / 1048576).toFixed(1)}MB`);
