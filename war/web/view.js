// 쥐 전쟁 시뮬 — 화면 (돈스타브식 낮은 시점 + 가짜 원근 + 겹겹이 쌓은 평평한 그림 층) · 효과 · 입력 · 소리
// Q / E = 카메라 90° 회전. 세계 좌표(x, z) → 회전 좌표(rx, rz) → 평면 판 px → 원근 → 화면. 그림(소품 · 병사)은 늘 정면을 보는 판때기.
// 원근은 맵에 고정 (카메라를 옮겨도 사다리꼴 모양은 그대로, 대신 배경 층들이 서로 다른 속도로 움직임)
const TW = 72, TD = 34, EL = 26; // 칸 가로 · 칸 깊이(평면 판 세로) · 높이 1 의 px. TD 가 작을수록 시점이 낮음
const UNIT_H = 118; // 서 있는 병사 화면 키 (줌 1, 맨 앞 줄)
const FAR = 0.68;   // 맵 맨 뒤 줄의 크기 배율 (맨 앞 줄 = 1)

const View = (() => {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  const cam = { x: 0, y: 0, z: 1.0, tx: null, ty: null };
  const tweens = [];
  const fx = [];      // 위에 그리는 효과 (화면-세계 좌표)
  const stains = [];  // 바닥 핏자국 · 그을음
  const gibs = [];    // 떨어져 나간 부위
  let shake = 0, shx = 0, shy = 0, fade = 0;
  const IM = {};
  const RIG = {};
  let ground = null;
  let rot = 0;
  const self = { groundDirty: true };

  // ── 좌표 ──
  function toR(x, z) {
    const w = G.world;
    if (rot === 1) return [w.D - 1 - z, x];
    if (rot === 2) return [w.W - 1 - x, w.D - 1 - z];
    if (rot === 3) return [z, w.W - 1 - x];
    return [x, z];
  }
  function fromR(rx, rz) {
    const w = G.world;
    if (rot === 1) return [rz, w.D - 1 - rx];
    if (rot === 2) return [w.W - 1 - rx, w.D - 1 - rz];
    if (rot === 3) return [w.W - 1 - rz, rx];
    return [rx, rz];
  }
  const dirR = (dx, dz) => (rot === 1 ? [-dz, dx] : rot === 2 ? [-dx, -dz] : rot === 3 ? [dz, -dx] : [dx, dz]);
  const dimsR = () => (rot % 2 ? [G.world.D, G.world.W] : [G.world.W, G.world.D]);
  // ── 가짜 원근: 평면 판 (fx, fy) → 화면-세계 px. 앞 끝(fy = nearY)은 1배, 뒤로 갈수록 F/(F + 거리) 로 작아짐 ──
  // 세로 자리는 배율을 적분한 값이라 줄 사이 간격도 같이 좁아짐. 회전하면 맵 가로 · 세로가 바뀌므로 다시 계산
  const persp = { cx: 0, nearY: 1, F: 1, rot: -1 };
  function setPersp() {
    const [RW, RD] = dimsR();
    persp.cx = (RW * TW) / 2; persp.nearY = RD * TD; persp.F = (RD * TD * FAR) / (1 - FAR); persp.rot = rot;
  }
  const scaleAt = (fy) => persp.F / (persp.F + persp.nearY - fy);
  const projY = (fy) => persp.nearY - persp.F * Math.log((persp.F + persp.nearY - fy) / persp.F);
  function proj(fx, fy, up = 0) { const s = scaleAt(fy); return { x: persp.cx + (fx - persp.cx) * s, y: projY(fy) - up * s, s }; }
  function unproj(X, Y) {
    const dz = persp.F * (Math.exp((persp.nearY - Y) / persp.F) - 1);
    const s = persp.F / (persp.F + dz);
    return { fx: persp.cx + (X - persp.cx) / s, fy: persp.nearY - dz, s };
  }
  // 세계 (x, z, 높이) → 화면-세계 px + 그 자리 크기 배율 s. d = 깊이(정렬용)
  function P(x, z, h = 0) { const [rx, rz] = toR(x, z); const p = proj((rx + 0.5) * TW, (rz + 0.5) * TD, h * EL); p.d = rz; return p; }
  // 원근 전 평면 판 자리 (바닥 그림을 굽는 데만)
  function Pf(x, z) { const [rx, rz] = toR(x, z); return { x: (rx + 0.5) * TW, y: (rz + 0.5) * TD }; }
  // 화면-세계 y → 깊이 (회전 좌표 rz)
  const depthAt = (y) => unproj(persp.cx, y).fy / TD - 0.5;
  // 칸 윗면 사다리꼴 [왼위, 오위, 오아래, 왼아래] (안쪽 여백 inset px)
  function tileQuad(t, inset = 0) {
    const [rx, rz] = toR(t.x, t.z), up = t.h * EL;
    const x0 = rx * TW + inset, x1 = (rx + 1) * TW - inset, y0 = rz * TD + inset, y1 = (rz + 1) * TD - inset;
    return [proj(x0, y0, up), proj(x1, y0, up), proj(x1, y1, up), proj(x0, y1, up)];
  }
  function quadPath(q) { ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y); ctx.closePath(); }
  // 위 · 아래 변이 가로인 사다리꼴 안에 점이 있나
  function inQuad(q, x, y) {
    if (y < q[0].y || y > q[3].y) return false;
    const k = (y - q[0].y) / Math.max(1e-6, q[3].y - q[0].y);
    return x >= q[0].x + (q[3].x - q[0].x) * k && x <= q[1].x + (q[2].x - q[1].x) * k;
  }
  const tileH = (x, z) => { const t = World.tile(G.world, Math.round(x), Math.round(z)); return t ? t.h : 0; };
  function unitHeight(u) {
    const x0 = Math.floor(u.px), z0 = Math.floor(u.pz);
    const a = u.px - x0, b = u.pz - z0;
    const h00 = tileH(x0, z0), h10 = tileH(x0 + 1, z0), h01 = tileH(x0, z0 + 1), h11 = tileH(x0 + 1, z0 + 1);
    return (h00 * (1 - a) + h10 * a) * (1 - b) + (h01 * (1 - a) + h11 * a) * b;
  }
  const foot = (u) => { const p = P(u.px, u.pz, unitHeight(u)); p.y += 6 * p.s; return p; };
  const camMatrix = () => new DOMMatrix([cam.z * DPR, 0, 0, cam.z * DPR, (W / 2 - (cam.x + shx) * cam.z) * DPR, (H / 2 - (cam.y + shy) * cam.z) * DPR]);
  function screenToWorld(mx, my) { return { x: (mx - W / 2) / cam.z + cam.x, y: (my - H / 2) / cam.z + cam.y }; }
  // 칸 고르기: 윗면 사다리꼴, 언덕이면 남쪽 옆면도. 앞(아래) 줄 · 높은 칸이 이김
  function pickTile(mx, my) {
    const p = screenToWorld(mx, my);
    let best = null, bd = -999;
    for (const t of G.world.tiles) {
      const [rx, rz] = toR(t.x, t.z);
      const q = tileQuad(t);
      let hit = inQuad(q, p.x, p.y), face = false;
      if (!hit && t.h > 0) {
        const [xs, zs] = fromR(rx, rz + 1);
        const south = World.tile(G.world, xs, zs);
        if (!south || south.h < t.h) {
          const bot = [q[3], q[2], proj(rx * TW + TW, (rz + 1) * TD), proj(rx * TW, (rz + 1) * TD)];
          hit = face = inQuad([bot[0], bot[1], bot[2], bot[3]], p.x, p.y);
        }
      }
      if (hit) {
        const d = rz * 10 + (t.h > 0 ? 5 : 0) + (face ? 2 : 0);
        if (d > bd) { best = t; bd = d; }
      }
    }
    return best;
  }

  function clampCam() {
    if (!G.world) return;
    const [RW, RD] = dimsR();
    const nearL = proj(0, RD * TD).x, nearR = proj(RW * TW, RD * TD).x;
    const padX = Math.max(TW * 1.2, (W * 0.22) / cam.z);
    const top = projY(0) - Math.max(TD * 1.0, (H * 0.15) / cam.z);
    const bottom = Math.max(top, projY(RD * TD) - (H * 0.3) / cam.z);
    cam.x = Math.max(nearL - padX, Math.min(nearR + padX, cam.x));
    cam.y = Math.max(top, Math.min(bottom, cam.y));
  }

  // 병사 그림 방향: 세계 방향을 카메라 기준으로 돌려 앞 · 옆 · 뒤 고름
  function viewOf(u) {
    const [dx, dz] = dirR(u.fdx || 0, u.fdz || 0);
    if (u.forceSide) return { view: 'side', flip: dx < 0 || (dx === 0 && dz < 0) };
    if (Math.abs(dx) >= Math.abs(dz) * 0.75) return { view: 'side', flip: dx < 0 };
    return { view: dz > 0 ? 'front' : 'back', flip: false };
  }

  // ── 로드 ──
  async function load() {
    const A = window.ART;
    const L = (k, a) => Rig.loadImage('../art/out/' + a.img).then((im) => (IM[k] = im));
    const jobs = [];
    for (const [n, a] of Object.entries(A.props || {})) jobs.push(L('prop_' + n, a));
    for (const [n, a] of Object.entries(A.terrain || {})) jobs.push(L('ter_' + n, a));
    for (const [n, a] of Object.entries(A.backdrop || {})) jobs.push(L('bd_' + n, a));
    for (const [n, a] of Object.entries(A.weapons || {})) jobs.push(L('wp_' + n, a));
    jobs.push(Rig.load('rat').then((r) => (RIG.rat = r)), Rig.load('cat').then((r) => (RIG.cat = r)));
    jobs.push(Rig.loadImage('../art/nkk/cat_boss_fuhrer.png').then((im) => (IM.boss_fuhrer = im)));
    await Promise.all(jobs);
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }

  // ── 카메라 회전 (Q / E) ──
  function rotate(dir) {
    if (!G.world) return;
    // 지금 화면 가운데의 세계 점을 기억 → 회전 후 같은 점을 가운데로
    // 화면-세계 점 → 세계 칸 좌표 (높이는 무시: 언덕 위 자국은 조금 어긋날 수 있음)
    const remap = (x, y) => { const f = unproj(x, y); return fromR(f.fx / TW - 0.5, f.fy / TD - 0.5); };
    const c = remap(cam.tx != null ? cam.tx : cam.x, cam.ty != null ? cam.ty : cam.y);
    // 바닥 자국 · 조각은 바닥 자리(gy 또는 y)로 옮기고 높이 차이는 그대로
    const items = [...stains, ...gibs, ...fx.filter((f) => f.x != null)].map((o) => {
      const base = o.gy != null ? o.gy : o.y;
      return { o, w: remap(o.x, base), up: base - o.y };
    });
    rot = (rot + dir + 4) % 4;
    setPersp();
    for (const { o, w, up } of items) {
      const p = P(w[0], w[1]);
      o.x = p.x;
      if (o.gy != null) o.gy = p.y;
      o.y = p.y - up;
    }
    const p = P(c[0], c[1]);
    cam.x = p.x; cam.y = p.y; cam.tx = null; cam.ty = null;
    fade = 1;
    self.groundDirty = true;
  }

  // ── 바닥 (회전마다 한 번 그려 둠) ──
  // 바닥 무늬는 낮은 시점이라 세로로 눌러 깜 (squash). 언덕 옆면(cliff)은 서 있는 면이라 그대로
  function pattern(g, name, scale, squash = name !== 'cliff') {
    const p = g.createPattern(IM['ter_' + name], 'repeat');
    p.setTransform(new DOMMatrix().scale(scale, scale * (squash ? 0.72 : 1)));
    return p;
  }
  // 평면 판 그림 src (픽셀 (sx, sy) = 판 (ox + sx·kx, oy + sy·ky)) 을 가로 띠로 잘라 원근 사다리꼴로 다시 그림
  // fyMin 위로는 버림. 결과 { c, x, y } = 화면-세계 px 자리
  function warp(src, ox, oy, kx, ky, fyMin = -Infinity) {
    const fy0 = Math.max(oy, fyMin), fy1 = oy + src.height * ky;
    const fxL = ox, fxR = ox + src.width * kx;
    const xs = [proj(fxL, fy0).x, proj(fxL, fy1).x, proj(fxR, fy0).x, proj(fxR, fy1).x];
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yTop = projY(fy0), yBot = projY(fy1);
    const c = document.createElement('canvas');
    c.width = Math.ceil(xMax - xMin) + 2; c.height = Math.ceil(yBot - yTop) + 2;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    const step = Math.max(1, Math.round(2 / ky)); // 띠 하나 ≈ 판 2px
    for (let sy = Math.max(0, Math.floor((fy0 - oy) / ky)); sy < src.height; sy += step) {
      const n = Math.min(step, src.height - sy);
      const a = oy + sy * ky, b = a + n * ky, s = scaleAt((a + b) / 2);
      const y0 = projY(a) - yTop, y1 = projY(b) - yTop;
      g.drawImage(src, 0, sy, src.width, n, persp.cx + (fxL - persp.cx) * s - xMin, y0, src.width * kx * s, y1 - y0 + 0.6);
    }
    return { c, x: xMin, y: yTop };
  }
  function buildGround() {
    const w = G.world;
    const [RW, RD] = dimsR();
    const PX = 16 * TW, PY = 6 * TW; // 옆 여백은 넓게: 원근으로 뒤 줄이 좁아져도 화면 옆까지 땅이 이어지게
    const c = document.createElement('canvas');
    c.width = RW * TW + PX * 2; c.height = RD * TD + PY * 2;
    const g = c.getContext('2d');
    g.translate(PX, PY);
    // 맵 밖: 조금 어두운 들판이 이어지고, 맵 들판은 가장자리를 흐리게 깎아 얹음 (판때기 테두리 없음)
    // TOP 위로는 땅을 안 그림 → 뒤 배경 층(능선 · 울타리)이 비침
    const TOP = -TD * 1.4;
    g.fillStyle = pattern(g, 'grass', 0.8);
    g.fillRect(-PX, TOP, c.width, c.height);
    g.fillStyle = pattern(g, 'wet', 0.9);
    g.globalAlpha = 0.45; // 맵 밖은 같은 풀밭에 어두운 들판을 반쯤 섞음 → 경계 없이 조금 어둡게
    g.fillRect(-PX, TOP, c.width, c.height);
    g.globalAlpha = 1;
    const field = document.createElement('canvas');
    field.width = c.width; field.height = c.height;
    const f = field.getContext('2d');
    f.translate(PX, PY);
    f.fillStyle = pattern(f, 'grass', 0.8);
    f.fillRect(-PX, TOP, c.width, c.height);
    f.globalCompositeOperation = 'destination-in';
    f.filter = `blur(${TW * 0.5}px)`;
    f.fillStyle = '#000';
    f.fillRect(-TW * 0.5, TOP, RW * TW + TW, RD * TD - TOP + TD * 0.5);
    f.filter = 'none';
    g.drawImage(field, -PX, -PY);
    let seed = 7;
    const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = pattern(g, 'dry', 0.8);
    g.globalAlpha = 0.55; // 마른 풀 얼룩은 옅게 → 풀밭에 스며들게
    for (let i = 0; i < 18; i++) blob(g, (rr() * (RW + 2) - 1) * TW, rr() * (RD + 1) * TD, 50 + rr() * 70, 26 + rr() * 30, rr);
    g.globalAlpha = 1;
    for (const t of w.tiles) {
      const p = Pf(t.x, t.z);
      if (t.ground === 'mud') { g.fillStyle = pattern(g, 'mud', 0.7); blob(g, p.x, p.y, TW * 0.8, TD * 0.8, rr); }
    }
    // 길: 이웃 길 칸 쪽으로는 끝까지 이어 그린 모양을 흐리게 → 끊김 없는 한 줄기 (회전해도)
    const isRoad = (rx, rz) => { if (rx < 0 || rz < 0 || rx >= RW || rz >= RD) return false; const [x, z] = fromR(rx, rz); return World.tile(w, x, z).ground === 'road'; };
    const road = document.createElement('canvas');
    road.width = c.width; road.height = c.height;
    const rg = road.getContext('2d');
    rg.translate(PX, PY);
    rg.filter = 'blur(4px)';
    rg.fillStyle = '#000';
    for (let rz = 0; rz < RD; rz++) for (let rx = 0; rx < RW; rx++) {
      if (!isRoad(rx, rz)) continue;
      const l = isRoad(rx - 1, rz) ? 0 : TW * 0.12, r = isRoad(rx + 1, rz) ? 0 : TW * 0.12;
      const u = isRoad(rx, rz - 1) ? 0 : TD * 0.16, d = isRoad(rx, rz + 1) ? 0 : TD * 0.16;
      rg.fillRect(rx * TW + l, rz * TD + u, TW - l - r, TD - u - d);
    }
    rg.filter = 'none';
    rg.globalCompositeOperation = 'source-in';
    const roadPat = pattern(rg, 'road', 0.6);
    if (rot % 2) roadPat.setTransform(new DOMMatrix().scale(0.6).rotate(90)); // 길이 화면 세로로 서면 바퀴 자국도 세로로
    rg.fillStyle = roadPat;
    rg.fillRect(-PX, -PY, road.width, road.height);
    g.drawImage(road, -PX, -PY);
    for (const t of w.tiles) if (t.ground === 'crater') { const p = Pf(t.x, t.z); crater(g, p.x, p.y); }
    // 언덕: 화면 기준 남쪽 땅에 그림자 → 화면 줄 순서로 옆면 · 윗면
    const hR = (rx, rz) => { if (rx < 0 || rz < 0 || rx >= RW || rz >= RD) return 0; const [x, z] = fromR(rx, rz); return World.tile(w, x, z).h; };
    g.fillStyle = 'rgba(25,20,14,0.38)';
    for (let rz = 0; rz < RD; rz++) for (let rx = 0; rx < RW; rx++) {
      if (hR(rx, rz) && !hR(rx, rz + 1)) g.fillRect(rx * TW - 4, (rz + 1) * TD - 2, TW + 14, TD * 0.45);
    }
    for (let rz = 0; rz < RD; rz++) {
      for (let rx = 0; rx < RW; rx++) {
        if (!hR(rx, rz)) continue;
        const x0 = rx * TW, y0 = rz * TD - EL;
        g.fillStyle = pattern(g, 'cliff', EL * 1.6 / 256);
        if (!hR(rx, rz + 1)) g.fillRect(x0 - 1, y0 + TD, TW + 2, EL);
        if (!hR(rx - 1, rz)) g.fillRect(x0 - 6, y0 + 4, 7, TD + EL - 4);
        if (!hR(rx + 1, rz)) g.fillRect(x0 + TW - 1, y0 + 4, 7, TD + EL - 4);
        g.fillStyle = pattern(g, 'dry', 0.8);
        g.fillRect(x0 - 1, y0, TW + 2, TD + 1);
        g.fillStyle = 'rgba(236,226,180,0.16)';
        g.fillRect(x0 - 1, y0, TW + 2, TD + 1);
      }
    }
    g.fillStyle = 'rgba(120,128,70,0.85)';
    for (let rz = 0; rz < RD; rz++) for (let rx = 0; rx < RW; rx++) {
      if (hR(rx, rz) && !hR(rx, rz + 1)) g.fillRect(rx * TW - 1, rz * TD - EL + TD - 4, TW + 2, 5);
    }
    // 북쪽 끝: 위로 갈수록 땅을 투명하게 → 중간 배경 층에 녹아듦
    const fadeTop = g.createLinearGradient(0, TOP, 0, -TD * 0.15);
    fadeTop.addColorStop(0, 'rgba(0,0,0,1)');
    fadeTop.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fadeTop;
    g.fillRect(-PX, TOP - 1, c.width, -TD * 0.15 - TOP + 1);
    g.globalCompositeOperation = 'source-over';
    ground = warp(c, -PX, -PY, 1, 1, TOP - 2);
    self.groundDirty = false;
  }
  // 시야 안개: 회전 좌표 칸 하나 = 1px (맵 밖 한 줄은 투명) → 부드럽게 늘린 평면 그림 → 원근으로 굽혀 둠. 언덕 높이는 무시
  const FOG_K = 4; // 늘린 평면 그림 1px = 판 4px
  const fog = { c: document.createElement('canvas'), vis: null, rot: -1, img: null };
  function buildFog() {
    const [RW, RD] = dimsR();
    const c = fog.c;
    c.width = RW + 2; c.height = RD + 2;
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        const rx = px - 1, rz = py - 1;
        const inside = rx >= 0 && rz >= 0 && rx < RW && rz < RD;
        const [x, z] = inside ? fromR(rx, rz) : [0, 0];
        const i = (py * c.width + px) * 4;
        img.data[i] = 28; img.data[i + 1] = 24; img.data[i + 2] = 20;
        img.data[i + 3] = inside && !G.vis.has(z * G.world.W + x) ? 82 : 0;
      }
    }
    g.putImageData(img, 0, 0);
    const flat = document.createElement('canvas');
    flat.width = ((RW + 2) * TW) / FOG_K; flat.height = ((RD + 2) * TD) / FOG_K;
    const f = flat.getContext('2d');
    f.imageSmoothingEnabled = true;
    f.drawImage(c, 0, 0, flat.width, flat.height);
    fog.img = warp(flat, -TW, -TD, FOG_K, FOG_K);
    fog.vis = G.vis; fog.rot = rot;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function blob(g, cx, cy, rx, ry, rr) {
    g.beginPath();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, k = 0.75 + rr() * 0.4;
      const px = cx + Math.cos(a) * rx * k, py = cy + Math.sin(a) * ry * k;
      if (i === 0) g.moveTo(px, py); else g.quadraticCurveTo(cx + Math.cos(a - 0.35) * rx * 1.05, cy + Math.sin(a - 0.35) * ry * 1.05, px, py);
    }
    g.closePath(); g.fill();
  }
  function crater(g, cx, cy) {
    g.fillStyle = '#4b3f31'; g.beginPath(); g.ellipse(cx, cy, TW * 0.48, TD * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f2820'; g.beginPath(); g.ellipse(cx, cy + 2, TW * 0.32, TD * 0.26, 0, 0, Math.PI * 2); g.fill();
  }

  // ── 소품 (칸 가로 배수). 판때기라 회전해도 같은 그림 ──
  const PROP_W = { S: 1.12, C: 0.86, W: 1.25, T: 1.3, X: 1.12, M: 1.0, G: 1.2, R: 3.0, H: 1.25 };
  function drawProp(t, alpha) {
    const a = window.ART.props[t.prop];
    const im = IM['prop_' + t.prop];
    if (!a || !im) return;
    let wTiles = PROP_W[t.prop];
    if (t.prop === 'R') {
      // 트럭은 가로 3칸: 가운데 칸에서만. 옆으로 돌리면 화면에서 세로로 서므로 좁게
      const L = World.tile(G.world, t.x - 1, t.z), Rt = World.tile(G.world, t.x + 1, t.z);
      if (!(L && L.prop === 'R' && Rt && Rt.prop === 'R')) return;
      if (rot % 2) wTiles = 1.6;
    }
    const p = P(t.x, t.z, t.h);
    const k = ((wTiles * TW) / a.w) * p.s;
    const y = p.y + TD * 0.32 * p.s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, p.x - a.pivot[0] * k, y - a.pivot[1] * k, a.w * k, a.h * k);
    ctx.globalAlpha = 1;
  }

  // ── 매 프레임 ──
  function frame(dt) {
    G.t += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt * 1000;
      const k = Math.min(1, tw.t / tw.ms);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.done(); }
    }
    const pan = 520 * dt / cam.z;
    if (keys.a || keys.arrowleft) { cam.x -= pan; cam.tx = null; }
    if (keys.d || keys.arrowright) { cam.x += pan; cam.tx = null; }
    if (keys.w || keys.arrowup) { cam.y -= pan; cam.ty = null; }
    if (keys.s || keys.arrowdown) { cam.y += pan; cam.ty = null; }
    if (cam.tx != null) { cam.x += (cam.tx - cam.x) * Math.min(1, dt * 5); cam.y += (cam.ty - cam.y) * Math.min(1, dt * 5); }
    clampCam();
    shake = Math.max(0, shake - dt * 30);
    shx = (Math.random() - 0.5) * shake; shy = (Math.random() - 0.5) * shake;
    fade = Math.max(0, fade - dt * 4);
    for (const u of G.units) {
      u.st.recoil = Math.max(0, (u.st.recoil || 0) - dt * 7);
      u.st.hit = Math.max(0, (u.st.hit || 0) - dt * 3.5);
      u.st.aim = Math.min(1, Math.max(0, (u.st.aim || 0) + (u.aiming ? dt * 6 : -dt * 2.5)));
      if (u.faceT > 0) { u.faceT -= dt; if (u.faceT <= 0 && u.alive) u.face = null; }
      const wantCrouch = u.alive && u.inCover && u.st.walk == null && !u.aiming ? 1 : 0;
      u.st.crouch = (u.st.crouch || 0) + (wantCrouch - (u.st.crouch || 0)) * Math.min(1, dt * 8);
    }
    updateParticles(dt);
    draw();
    UI.update();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 하늘 그라데이션 (어두운 회갈색 포연 하늘)
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    sky.addColorStop(0, '#5f594b');
    sky.addColorStop(0.5, '#8c8572');
    sky.addColorStop(1, '#b5ad95');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (!G.world) return;
    if (persp.rot !== rot) setPersp();
    if (self.groundDirty || !ground) buildGround();

    // ── 맵 뒤 층: 먼 도시 → 먼 언덕 → 먼 들판 → 가까운 들판 (뒤일수록 작고 느리고 흐림) ──
    // 각 층 아래쪽은 앞 층 윗부분 뒤에 숨음. 가까운 들판 아래 띠(맵 바닥 색)는 맵 바닥 윗끝 흐림 뒤로 들어감
    const edgeY = (projY(-TD * 0.15) - cam.y) * cam.z + H / 2;
    let bottom = edgeY + 4 * cam.z;
    const stack = [];
    for (const L of BACK_LAYERS) {
      const im = IM['bd_' + L.img];
      if (!im) continue;
      const k = L.k * cam.z, h = im.height * k;
      stack.push({ L, im, k, bottom });
      bottom -= h * L.hide;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      const { L, im, k, bottom: b } = stack[i];
      layer(im, L.rate, b, k, L.alpha, rot * (im.width / 4) + L.shift);
      // 공기 원근: 뒤 층 위에 하늘색을 얇게 덮어 더 멀어 보이게
      if (L.haze) { ctx.fillStyle = `rgba(181,173,149,${L.haze})`; ctx.fillRect(0, b - im.height * k - 2, W, im.height * k + 2); }
    }

    // ── 맵: 바닥 · 자국 · 시야 안개 · 표시 ──
    const M = camMatrix();
    ctx.setTransform(M);
    ctx.drawImage(ground.c, ground.x, ground.y);
    for (const s of stains) drawStain(s);
    // 시야 밖 어둡게: 칸마다 1px 짜리 그림을 늘리고 원근으로 굽혀 경계를 부드럽게 (네모 칸이 안 보이게)
    if (fog.vis !== G.vis || fog.rot !== rot) buildFog();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fog.img.c, fog.img.x, fog.img.y);
    overlays();
    // 소품 · 병사 · 조각을 화면 깊이 순으로
    const list = [];
    for (const t of G.world.tiles) if (t.prop) list.push({ d: toR(t.x, t.z)[1] + 0.3, t });
    for (const u of G.units) {
      if (u.side === 'cat' && u.alive && !u.visible && !G.over) continue;
      list.push({ d: toR(u.px, u.pz)[1] + (u.alive ? 0.35 : 0.1), u });
    }
    for (const g of gibs) list.push({ d: depthAt(g.gy) - 0.4, g });
    list.sort((a, b) => a.d - b.d);
    for (const it of list) {
      if (it.t) drawProp(it.t, propAlpha(it.t));
      else if (it.u) drawUnit(it.u);
      else drawGib(it.g);
    }
    for (const f of fx) drawFx(f);

    // ── 맵 앞 층: 카메라 바로 앞 가림 실루엣 (가장 빠르게 움직임, 화면 아래에 붙음) ──
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const front = IM.bd_front;
    if (front) {
      const k = Math.max(0.45, H / 1500);
      layer(front, 1.45, H + front.height * k * 0.28 - cam.y * 0.12 * cam.z, k, 0.96, rot * (front.width / 4));
    }
    if (fade > 0) { ctx.fillStyle = `rgba(30,26,20,${fade * 0.7})`; ctx.fillRect(0, 0, W, H); }
  }

  // 맵 뒤 층 (뒤 → 앞 순서로 쌓임). k = 줌 1 에서 크기, rate = 카메라 따라 움직이는 정도 (맵 = 1),
  // hide = 이 층 높이 중 다음(뒤) 층이 가려지는 비율, haze = 공기 원근으로 덮는 하늘색 진하기
  // 들판은 같은 그림을 두 번 (가깝게 · 멀게) 써서 층을 늘림. 크기는 맵 맨 뒤 소품(모래주머니 ≈ 55px)보다 작게
  const BACK_LAYERS = [
    { img: 'field', k: 0.26, rate: 0.78, hide: 0.5, alpha: 1, haze: 0, shift: 0 },
    { img: 'field', k: 0.19, rate: 0.55, hide: 0.5, alpha: 1, haze: 0.22, shift: 517 },
    { img: 'hills', k: 0.26, rate: 0.36, hide: 0.55, alpha: 1, haze: 0.3, shift: 0 },
    { img: 'far', k: 0.3, rate: 0.16, hide: 0.6, alpha: 0.95, haze: 0.38, shift: 0 },
  ];

  // 가로로 이어 붙이는 층 하나. bottomY = 화면 px (층 아래 끝)
  function layer(im, rate, bottomY, k, alpha, shift) {
    const w = im.width * k, h = im.height * k;
    let off = (W / 2 - (cam.x + shift) * rate * cam.z) % w;
    if (off > 0) off -= w;
    ctx.globalAlpha = alpha;
    for (let x = off; x < W; x += w) ctx.drawImage(im, x, bottomY - h, w + 1, h);
    ctx.globalAlpha = 1;
  }

  // 높은 엄폐물 뒤(화면 기준)에 병사가 있으면 반투명
  function propAlpha(t) {
    const pr = PROPS[t.prop];
    if (!pr.sightBlock && t.prop !== 'G') return 1;
    const [tx, tz] = toR(t.x, t.z);
    const span = t.prop === 'R' && rot % 2 === 0 ? 2 : 1;
    for (const u of G.units) {
      if (!u.alive || (u.side === 'cat' && !u.visible)) continue;
      const [ux, uz] = toR(u.px, u.pz);
      if (uz < tz + 0.1 && tz - uz <= 2.2 && Math.abs(ux - tx) <= span) return 0.42;
    }
    const h = G.hoverTile;
    if (h) { const [hx, hz] = toR(h.x, h.z); if (hz < tz && tz - hz <= 2 && Math.abs(hx - tx) <= 1) return 0.55; }
    return 1;
  }

  // 이동 범위 · 경로 · 엄폐 방패 · 폭발 범위 · 선택 고리
  function overlays() {
    const u = G.sel;
    if (G.turn !== 'rat' || !u || !u.alive) return;
    const w = G.world;
    if (G.mode === 'move' && u.ap > 0) {
      const R = World.reach(w, u, u.mob * u.ap);
      for (const [k, c] of R.keys) {
        if (!c) continue;
        ctx.fillStyle = c <= u.mob ? 'rgba(120,190,240,0.13)' : 'rgba(240,200,90,0.11)';
        quadPath(tileQuad(w.tiles[k], 3)); ctx.fill();
      }
      const h = G.hoverTile;
      if (h && R.cost(h.x, h.z)) {
        const path = R.path(h.x, h.z);
        ctx.strokeStyle = R.cost(h.x, h.z) <= u.mob ? '#8fd0ff' : '#ffd36b';
        ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        const s = P(u.x, u.z, tileH(u.x, u.z)); ctx.moveTo(s.x, s.y);
        for (const p of path) { const q = P(p.x, p.z, tileH(p.x, p.z)); ctx.lineTo(q.x, q.y); }
        ctx.stroke();
        ctx.lineWidth = 2; quadPath(tileQuad(h, 3)); ctx.stroke();
        shields(h.x, h.z);
      }
    }
    if (G.mode === 'tile' && G.hoverTile) {
      const A = ABILITIES[G.ability];
      const h = G.hoverTile;
      const ok = tileTargetOk(u, G.ability, h);
      ctx.fillStyle = ok ? 'rgba(255,120,60,0.28)' : 'rgba(120,120,120,0.2)';
      for (const t of w.tiles) if (Math.hypot(t.x - h.x, t.z - h.z) <= A.radius) { quadPath(tileQuad(t, 2)); ctx.fill(); }
    }
    ring(u, '#8fd0ff');
    if (G.mode === 'target') { const t = UI.currentTarget(); if (t) ring(t, '#ff6b5b'); }
  }
  function shields(x, z) {
    const c = P(x, z, tileH(x, z));
    for (const s of World.coverSides(G.world, x, z)) {
      const [dx, dz] = dirR(s.dx, s.dz);
      ctx.save();
      ctx.translate(c.x + dx * TW * 0.42 * c.s, c.y + (dz * TD * 0.42 - 6) * c.s);
      ctx.scale(c.s, c.s);
      ctx.fillStyle = s.cover === 2 ? '#8fd0ff' : '#cfe8ff';
      ctx.beginPath();
      ctx.moveTo(-7, -8); ctx.lineTo(7, -8); ctx.lineTo(7, 0); ctx.quadraticCurveTo(6, 7, 0, 10); ctx.quadraticCurveTo(-6, 7, -7, 0); ctx.closePath();
      ctx.fill();
      if (s.cover === 1) { ctx.fillStyle = 'rgba(30,40,50,0.55)'; ctx.fillRect(-7, -8, 14, 8); }
      ctx.restore();
    }
  }
  function ring(u, color) {
    const p = foot(u);
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, TW * 0.34 * p.s, TD * 0.3 * p.s, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // 병사: 서 있는 줄의 원근 배율로 발 밑을 중심으로 줄여 그림 (리그 · 체력 막대 · 표시 전부)
  function drawUnit(u) {
    const f = foot(u);
    ctx.save();
    ctx.translate(f.x, f.y); ctx.scale(f.s, f.s); ctx.translate(-f.x, -f.y);
    drawUnitAt(u, f.x, f.y);
    ctx.restore();
  }
  function drawUnitAt(u, x, y) {
    const R = RIG[u.side === 'rat' ? 'rat' : 'cat'];
    const v = viewOf(u);
    if (u.alive) {
      ctx.fillStyle = 'rgba(25,20,15,0.28)';
      ctx.beginPath(); ctx.ellipse(x, y, TW * 0.3, TD * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    }
    let cut = u.cut;
    // 엄폐 웅크림: 옆모습은 리그, 앞 · 뒤는 통그림 컷 (총 든 채 앞 · 뒤로 웅크리기는 리그로 어려움)
    if (!cut && u.alive && u.inCover && u.st.walk == null && !u.aiming && v.view !== 'side' && (u.st.crouch || 0) > 0.6) cut = 'cover_' + v.view;
    const drawn = Rig.draw(ctx, R, x, y, UNIT_H * (u.def.aura ? 1.05 : 1), {
      view: v.view, flip: v.flip, st: u.st, t: G.t, hide: u.hide, face: u.face, tint: u.tint, cut,
    });
    if (drawn) { u._drawn = drawn; u._view = v; }
    if (u.downed) {
      // 쓰러짐 표시: 누운 몸 위에 깜빡이는 붉은 십자
      ctx.globalAlpha = 0.55 + Math.sin(G.t * 5) * 0.35;
      ctx.fillStyle = u.side === 'rat' ? '#ff6b5b' : '#ffb0a0';
      ctx.fillRect(x - 3, y - 58, 6, 18); ctx.fillRect(x - 9, y - 52, 18, 6);
      ctx.globalAlpha = 1;
    }
    if (!u.alive) return;
    const top = y - UNIT_H - 14;
    const n = u.maxHp, pw = 7, gap = 2, tw = n * (pw + gap) - gap;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < u.hp ? (u.side === 'rat' ? '#8fd0ff' : '#ff6b5b') : 'rgba(20,18,15,0.55)';
      ctx.fillRect(x - tw / 2 + i * (pw + gap), top, pw, 6);
    }
    let ix = x + tw / 2 + 6;
    const icon = (txt, col) => { ctx.fillStyle = col; ctx.font = 'bold 11px sans-serif'; ctx.fillText(txt, ix, top + 7); ix += 14; };
    if (u.overwatch) icon('◉', '#8fd0ff');
    if (u.hunker) icon('▼', '#8fd0ff');
    if (u.suppressedBy) icon('✖', '#ffb84a');
    if (u.side === 'cat' && !u.active) icon('?', '#ffcf4a'); // 아직 눈치 못 챔
    if (u.wounds.arm) icon('팔', '#ff6b5b');
    if (u.wounds.leg) icon('다리', '#ff6b5b');
    if (u.side === 'rat' && u.ap > 0 && G.turn === 'rat') for (let i = 0; i < u.ap; i++) { ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.arc(x - tw / 2 + i * 9 + 3, top - 8, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  // ── 효과 ──
  function muzzlePoint(u) {
    const { x, y, s } = foot(u);
    const v = viewOf(u);
    if (v.view === 'side') return { x: x + (v.flip ? -1 : 1) * UNIT_H * 0.55 * s, y: y - UNIT_H * 0.55 * s };
    return { x: x + (v.view === 'front' ? 8 : -8) * s, y: y - UNIT_H * (v.view === 'front' ? 0.5 : 0.75) * s };
  }
  const chest = (u) => { const p = foot(u); return { x: p.x, y: p.y - UNIT_H * 0.55 * p.s, s: p.s }; };

  function muzzle(a, b, hit) {
    const m = muzzlePoint(a), c = chest(b);
    const miss = hit ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 70, y: (Math.random() - 0.3) * 50 };
    fx.push({ type: 'flash', x: m.x, y: m.y, life: 0.07, t: 0 });
    fx.push({ type: 'tracer', x0: m.x, y0: m.y, x1: c.x + miss.x, y1: c.y + miss.y, life: 0.12, t: 0 });
    if (!hit) for (let i = 0; i < 3; i++) fx.push({ type: 'dust', x: c.x + miss.x, y: c.y + miss.y + 30, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, life: 0.5, t: 0, r: 5 + Math.random() * 5 });
    shake = Math.max(shake, 2);
  }
  // 피: 평평한 검붉은 덩어리 두 톤
  function blood(u, n) {
    const c = chest(u), gy = foot(u).y;
    for (let i = 0; i < n; i++) fx.push({ type: 'blood', x: c.x, y: c.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 180, gy: gy + (Math.random() - 0.3) * 14, r: 2 + Math.random() * 3.5, col: Math.random() < 0.6 ? '#7a1018' : '#9a1c24', life: 2, t: 0 });
  }
  function popup(u, txt, col) {
    const c = chest(u);
    fx.push({ type: 'text', x: c.x, y: c.y - UNIT_H * 0.55 * c.s, txt, col, life: 1.2, t: 0 });
  }
  function explosion(tx, tz, radius) {
    const { x, y, s } = P(tx, tz, tileH(tx, tz));
    fx.push({ type: 'boom', x, y, r: radius * TW * 0.9 * s, life: 0.45, t: 0 });
    for (let i = 0; i < 9; i++) fx.push({ type: 'smoke', x: x + (Math.random() - 0.5) * TW * 1.4 * s, y: y - Math.random() * 20 * s, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, r: (14 + Math.random() * 18) * s, life: 1.8 + Math.random(), t: 0 });
    for (let i = 0; i < 12; i++) fx.push({ type: 'chunk', x, y: y - 10 * s, vx: (Math.random() - 0.5) * 380 * s, vy: (-200 - Math.random() * 260) * s, gy: y + (Math.random() - 0.5) * TD * s, r: (3 + Math.random() * 4) * s, col: Math.random() < 0.5 ? '#4b3f31' : '#6b5a44', life: 1.6, t: 0 });
    stains.push({ type: 'scorch', x, y, r: radius * TW * 0.55 * s });
    shake = 14;
  }
  function debris(x, z, prop) {
    const c = P(x, z, tileH(x, z));
    const col = prop === 'S' ? ['#a08a5e', '#7f6c48'] : ['#7a6440', '#5a4a30'];
    for (let i = 0; i < 10; i++) fx.push({ type: 'chunk', x: c.x, y: c.y - 20, vx: (Math.random() - 0.5) * 300, vy: -150 - Math.random() * 200, gy: c.y + (Math.random() - 0.5) * TD * 0.8, r: 4 + Math.random() * 6, col: col[i % 2], life: 2.5, t: 0 });
  }

  function updateParticles(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.vx != null) {
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.type === 'blood' || f.type === 'chunk') {
          f.vy += 900 * dt;
          if (f.y >= f.gy) { stains.push({ type: f.type === 'blood' ? 'drop' : 'chunk', x: f.x, y: f.gy, r: f.r, col: f.col }); fx.splice(i, 1); continue; }
        } else { f.vy *= 0.98; f.vx *= 0.98; }
      }
      if (f.t >= f.life) fx.splice(i, 1);
    }
    if (stains.length > 500) stains.splice(0, stains.length - 500);
    for (const g of gibs) {
      if (g.rest) continue;
      g.vy += 1300 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.rot += g.vr * dt;
      if (g.y >= g.gy) {
        g.y = g.gy; g.vy *= -0.32; g.vx *= 0.55; g.vr *= 0.5;
        if (Math.abs(g.vy) < 60) { g.rest = true; stains.push({ type: 'pool', x: g.x, y: g.gy + 4, r: 8, grow: 14 }); }
      }
      if (!g.rest && Math.random() < 0.5) fx.push({ type: 'blood', x: g.x, y: g.y, vx: (Math.random() - 0.5) * 40, vy: 0, gy: g.gy + 3, r: 1.5 + Math.random() * 2, col: '#7a1018', life: 1, t: 0 });
    }
    for (const s of stains) if (s.grow && s.r < s.grow) s.r += dt * 9;
  }

  function drawFx(f) {
    const k = f.t / f.life;
    if (f.type === 'flash') {
      ctx.fillStyle = '#ffe9a0'; star(f.x, f.y, 16, 6, 7); ctx.fill();
      ctx.fillStyle = '#ffb63c'; star(f.x, f.y, 9, 4, 7); ctx.fill();
    } else if (f.type === 'tracer') {
      ctx.strokeStyle = `rgba(255,226,140,${1 - k})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke();
    } else if (f.type === 'blood' || f.type === 'chunk' || f.type === 'proj') {
      ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    } else if (f.type === 'dust') {
      ctx.fillStyle = `rgba(150,135,110,${0.7 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k), 0, Math.PI * 2); ctx.fill();
    } else if (f.type === 'smoke') {
      ctx.fillStyle = `rgba(85,80,72,${0.55 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k * 1.2), 0, Math.PI * 2); ctx.fill();
    } else if (f.type === 'boom') {
      const r = f.r * (0.4 + k * 0.8);
      ctx.fillStyle = `rgba(232,120,40,${1 - k})`; ctx.beginPath(); ctx.ellipse(f.x, f.y - r * 0.3, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,214,110,${1 - k})`; ctx.beginPath(); ctx.ellipse(f.x, f.y - r * 0.3, r * 0.55, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    } else if (f.type === 'text') {
      ctx.font = 'bold 18px "Noto Sans KR", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,16,12,0.7)'; ctx.fillText(f.txt, f.x + 1.5, f.y - k * 34 + 1.5);
      ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y - k * 34);
      ctx.textAlign = 'left';
    }
  }
  function star(x, y, R, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, d = i % 2 ? r : R; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    ctx.closePath();
  }
  function drawStain(s) {
    if (s.type === 'scorch') { ctx.fillStyle = 'rgba(30,26,22,0.45)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (s.type === 'drop') { ctx.fillStyle = s.col; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * 1.4, s.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (s.type === 'chunk') { ctx.fillStyle = s.col; ctx.fillRect(s.x - s.r, s.y - s.r * 0.6, s.r * 2, s.r * 1.2); }
    else if (s.type === 'pool') {
      ctx.fillStyle = '#6a0e16'; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * 1.6, s.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#86141e'; ctx.beginPath(); ctx.ellipse(s.x - s.r * 0.3, s.y - 1, s.r * 0.9, s.r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawGib(g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.transform(g.m.a, g.m.b, g.m.c, g.m.d, 0, 0);
    ctx.drawImage(g.im, -g.w / 2, -g.h / 2, g.w, g.h);
    ctx.restore();
  }

  // 부위 떼어 내기 (신체 절단): 지금 그려진 부위 행렬 → 세계 쪽 조각
  function detach(u, part, power) {
    const d = u._drawn;
    if (!d || !d.V.parts[part]) return;
    const p = d.V.parts[part], m = d.M[part];
    const inv = camMatrix().inverse();
    const c = inv.transformPoint(m.transformPoint(new DOMPoint(p.x + p.w / 2, p.y + p.h / 2)));
    const s = cam.z * DPR;
    const R = RIG[u.side === 'rat' ? 'rat' : 'cat'];
    const dir = u._view && u._view.flip ? 1 : -1;
    const gy = foot(u).y + (Math.random() - 0.5) * 16;
    gibs.push({
      im: R.img[u._view.view][part], w: p.w, h: p.h, m: { a: m.a / s, b: m.b / s, c: m.c / s, d: m.d / s },
      x: c.x, y: c.y, rot: 0,
      vx: dir * (120 + Math.random() * 160) * power, vy: -(260 + Math.random() * 220) * power, vr: (Math.random() - 0.5) * 14, gy,
    });
    u.hide[part] = 1;
    for (let i = 0; i < 16; i++) fx.push({ type: 'blood', x: c.x, y: c.y, vx: dir * Math.random() * 160, vy: -120 - Math.random() * 220, gy: gy + (Math.random() - 0.4) * 18, r: 2 + Math.random() * 3.5, col: Math.random() < 0.6 ? '#7a1018' : '#9a1c24', life: 2, t: 0 });
  }

  async function die(u, gore) {
    u.st.walk = null; u.inCover = false; u.aiming = false;
    // arm · leg = 살아서 쓰러질 때 잘린 부위 (game.js downUnit)
    const parts = { decap: ['head'], sever: ['arm'], burst: ['head', 'arm', 'shinN'], arm: ['arm'], leg: ['shinN'] }[gore] || [];
    let cut = false;
    await tween(1000, (k) => {
      u.st.death = k;
      if (!cut && k > 0.12 && parts.length) { cut = true; for (const p of parts) detach(u, p, gore === 'burst' ? 1.3 : 1); }
    });
    u.st.death = 1;
    const f = foot(u);
    stains.push({ type: 'pool', x: f.x + (u._view && u._view.flip ? 30 : -30) * f.s, y: f.y + 2, r: 6 * f.s, grow: 22 * f.s });
  }

  // ── 던지기 · 포탄 ──
  async function lob(a, tx, tz, ms) {
    const m = muzzlePoint(a), e = P(tx, tz, tileH(tx, tz));
    const f = { type: 'proj', x: m.x, y: m.y, r: 5, col: '#4c5a30', life: 99, t: 0 };
    fx.push(f);
    await tween(ms, (k) => { f.x = m.x + (e.x - m.x) * k; f.y = m.y + (e.y - m.y) * k - Math.sin(k * Math.PI) * 140; });
    fx.splice(fx.indexOf(f), 1);
  }
  async function shell(a, tx, tz, ms) {
    const m = muzzlePoint(a), e = P(tx, tz, tileH(tx, tz));
    fx.push({ type: 'flash', x: m.x, y: m.y - 20, life: 0.1, t: 0 });
    const f = { type: 'proj', x: m.x, y: m.y, r: 4, col: '#2c2c26', life: 99, t: 0 };
    fx.push(f);
    await tween(ms * 0.4, (k) => { f.y = m.y - k * 500; });
    focus({ x: tx, z: tz });
    await tween(ms * 0.6, (k) => { f.x = e.x; f.y = e.y - (1 - k) * 600; });
    fx.splice(fx.indexOf(f), 1);
  }

  async function aim(u, ms) { u.aiming = true; await sleep(ms); setTimeout(() => (u.aiming = false), 500); }
  function tween(ms, fn) { return new Promise((done) => tweens.push({ ms: Math.max(1, ms), t: 0, fn, done })); }

  function focus(u) {
    const p = P(u.px != null ? u.px : u.x, u.pz != null ? u.pz : u.z);
    cam.tx = p.x; cam.ty = p.y - Math.max(UNIT_H * 0.4, 95 / cam.z);
    clampCam();
  }
  function focusPair(a, b) {
    const ax = a.px != null ? a.px : a.x, az = a.pz != null ? a.pz : a.z;
    const bx = b.px != null ? b.px : b.x, bz = b.pz != null ? b.pz : b.z;
    const p = P((ax + bx) / 2, (az + bz) / 2);
    cam.tx = p.x; cam.ty = p.y - Math.max(UNIT_H * 0.4, 95 / cam.z);
    clampCam();
  }

  // ── 입력 ──
  const keys = {};
  let drag = null;
  function bindInput() {
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === 'q') return rotate(-1);
      if (k === 'e') return rotate(1);
      UI.key(e);
    });
    window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
    cv.addEventListener('mousemove', (e) => {
      if (drag) {
        cam.x = drag.cx - (e.clientX - drag.x) / cam.z;
        cam.y = drag.cy - (e.clientY - drag.y) / cam.z;
        cam.tx = null;
        clampCam();
        return;
      }
      G.hoverTile = G.world ? pickTile(e.clientX, e.clientY) : null;
      UI.hover(e.clientX, e.clientY);
    });
    cv.addEventListener('mousedown', (e) => { if (e.button === 2 || e.button === 1) { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; e.preventDefault(); } });
    window.addEventListener('mouseup', () => (drag = null));
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); UI.cancel(); });
    cv.addEventListener('click', (e) => { if (G.world) UI.click(pickTile(e.clientX, e.clientY), e); });
    cv.addEventListener('wheel', (e) => { cam.z = Math.max(0.6, Math.min(2.2, cam.z * (e.deltaY > 0 ? 0.9 : 1.1))); clampCam(); e.preventDefault(); }, { passive: false });
  }

  function unitAtScreen(mx, my) {
    const p = screenToWorld(mx, my);
    let best = null, bd = -1;
    for (const u of G.units) {
      if (!u.alive || (u.side === 'cat' && !u.visible)) continue;
      const f = foot(u);
      if (Math.abs(p.x - f.x) < TW * 0.48 * f.s && p.y <= f.y + 6 * f.s && p.y >= f.y - (UNIT_H + 24) * f.s && f.d > bd) { best = u; bd = f.d; }
    }
    return best;
  }

  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    frame(dt);
    requestAnimationFrame(loop);
  }
  // 다음 전투: 지난 판 핏자국 · 조각 · 효과 지우기
  function reset() {
    fx.length = 0; stains.length = 0; gibs.length = 0;
    shake = 0; self.groundDirty = true;
    setPersp();
  }
  function start() {
    resize(); bindInput();
    const [RW, RD] = dimsR();
    setPersp();
    const c = proj((RW * TW) * 0.5, (RD * TD) * 0.55);
    cam.x = c.x; cam.y = c.y;
    clampCam();
    requestAnimationFrame(loop);
  }

  return Object.assign(self, {
    step: frame, // 테스트용: 숨은 창(rAF 멈춤)에서 프레임 직접 돌리기
    load, start, reset, tween, focus, focusPair, muzzle, blood, popup, explosion, debris, die, lob, shell, aim, rotate, viewOf, unitAtScreen,
    banner: (t, s) => UI.banner(t, s), showEnd: (r, rep) => UI.showEnd(r, rep), IM, RIG, cam,
  });
})();

// ── 소리 (WebAudio 합성: 총 · 폭발) ──
const Sound = (() => {
  let ac = null;
  const ctx = () => (ac || (ac = new (window.AudioContext || window.webkitAudioContext)()));
  function noise(dur, freq, gain, q = 0.7) {
    try {
      const a = ctx();
      const n = a.createBufferSource();
      const b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
      n.buffer = b;
      const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
      const g = a.createGain(); g.gain.value = gain;
      n.connect(f); f.connect(g); g.connect(a.destination); n.start();
    } catch (e) { /* 소리 없이 */ }
  }
  return {
    shot: (w) => noise(w === 'sniper' ? 0.35 : w === 'shotgun' ? 0.3 : 0.16, w === 'sniper' ? 2600 : 1800, 0.35),
    boom: () => noise(1.2, 380, 0.9),
    mortar: () => noise(0.25, 700, 0.5),
    hit: () => noise(0.08, 900, 0.2),
    death: () => noise(0.2, 500, 0.15),
    reload: () => noise(0.05, 4000, 0.12),
  };
})();
