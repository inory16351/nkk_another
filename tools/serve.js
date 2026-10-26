// 로컬 정적 서버: node tools/serve.js [포트]  → http://localhost:5320/web/index.html
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 5320);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

http.createServer((req, res) => {
  // 다른 페이지(예: ChatGPT 탭)에서 참고 그림을 읽고 결과를 저장할 수 있게
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.end(); return; }
  // 받은 그림 저장: POST /__art?path=art/archer/full_side.png (art/ 아래만)
  if (req.method === 'POST' && req.url.startsWith('/__art')) {
    const rel = new URL(req.url, 'http://x').searchParams.get('path') || '';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(path.join(ROOT, 'art'))) { res.writeHead(403); return res.end(); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.concat(chunks)); res.end('ok ' + rel); });
    return;
  }
  // 캡처 저장: POST /__save?name=파일.png (본문 = PNG) → docs/shots/
  if (req.method === 'POST' && req.url.startsWith('/__save')) {
    const name = path.basename(new URL(req.url, 'http://x').searchParams.get('name') || 'shot.png');
    const dir = path.join(ROOT, 'docs', 'shots');
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/web/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('없음 ' + p); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}/web/index.html`));
