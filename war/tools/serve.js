// 쥐 전쟁 시뮬 전용 로컬 서버 (기사 쥐 5320 · 비행기 5321 과 따로): node war/tools/serve.js [포트=5322]
// → http://localhost:5322/web/index.html
// POST /upload?name=<파일.png> = 브라우저(ChatGPT 창)에서 만든 그림을 art/src/gpt/ 에 저장
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 5322);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Private-Network': 'true' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method === 'POST' && url.pathname === '/upload') {
    const name = path.basename(url.searchParams.get('name') || '');
    if (!/^[\w.-]+\.(png|jpg|webp)$/.test(name)) { res.writeHead(400, CORS); return res.end('이름'); }
    const dir = path.join(ROOT, 'art', 'src', 'gpt');
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(path.join(dir, name), buf);
      console.log('저장', name, buf.length);
      res.writeHead(200, CORS); res.end('ok ' + buf.length);
    });
    return;
  }
  // 폼 POST (application/x-www-form-urlencoded: name, data=base64) — fetch 가 막힌 페이지에서도 됨
  if (req.method === 'POST' && url.pathname === '/upload-form') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const f = new URLSearchParams(Buffer.concat(chunks).toString());
      const name = path.basename(f.get('name') || '');
      if (!/^[\w.-]+\.(png|jpg|webp)$/.test(name)) { res.writeHead(400); return res.end('이름'); }
      const buf = Buffer.from((f.get('data') || '').replace(/^data:[^,]+,/, ''), 'base64');
      const dir = path.join(ROOT, 'art', 'src', 'gpt');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), buf);
      console.log('저장', name, buf.length);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<meta charset=utf-8>저장됨 ${name} ${buf.length} bytes <script>setTimeout(()=>history.back(),300)</script>`);
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/web/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, CORS); return res.end('없음 ' + p); }
    res.writeHead(200, { ...CORS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}/web/index.html`));
