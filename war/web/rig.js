// 컷아웃 리그 (tools/rig_cut.py 결과 window.RIGS[종]) + 동작 + 눈 점 표정 + 통그림 컷 교체
// 부위 행렬 = 부모 행렬 × T(피벗) × R(각도) × T(−피벗). 좌표는 리그 그림 px, 각도 + = 시계 방향.
const Rig = (() => {
  const rad = (d) => (d * Math.PI) / 180;
  const IMG = {};
  const loadImage = (src) => IMG[src] || (IMG[src] = new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => fail(new Error('그림 로드 실패 ' + src));
    im.src = (window.__ASSETS && window.__ASSETS[src]) || src;
  }));

  // 종마다: 서 있는 키(리그 px) · 눈 위치(머리 그림 원본 좌표 × 0.5) · 눈 종류
  const SPECIES = {
    rat: { tall: 470, eyes: { side: [[137.5, 64]], front: [[112.5, 64], [150, 64]] }, eyeR: 6, dot: true },
    cat: { tall: 470, eyes: { side: [[139, 66.5]], front: [[118.5, 66], [152.5, 66]] }, eyeR: 7, dot: false },
  };

  const loaded = {};
  async function load(sp) {
    if (loaded[sp]) return loaded[sp];
    const data = window.RIGS[sp];
    const base = `../art/${sp}/`;
    const img = {};
    const jobs = [];
    for (const [vn, V] of Object.entries(data.views)) {
      img[vn] = {};
      for (const [pn, p] of Object.entries(V.parts)) jobs.push(loadImage(base + p.img).then((im) => (img[vn][pn] = im)));
    }
    await Promise.all(jobs);
    // 눈 옆 털 색 (표정 바꿀 때 점을 덮는 색)
    const fur = {};
    for (const vn of ['side', 'front']) {
      const e = (SPECIES[sp].eyes[vn] || [])[0];
      const head = img[vn] && img[vn].head;
      const P = data.views[vn] && data.views[vn].parts.head;
      if (!e || !head) continue;
      const c = document.createElement('canvas');
      c.width = head.width; c.height = head.height;
      const g = c.getContext('2d');
      g.drawImage(head, 0, 0);
      const px = g.getImageData(Math.round(e[0] - P.x + SPECIES[sp].eyeR * 2.2), Math.round(e[1] - P.y + 2), 1, 1).data;
      fur[vn] = `rgb(${px[0]},${px[1]},${px[2]})`;
    }
    const cuts = {};
    const A = (window.ART || {})[sp] || {};
    await Promise.all(Object.entries(A).map(([n, a]) => loadImage('../art/out/' + a.img).then((im) => (cuts[n] = { ...a, im }))));
    return (loaded[sp] = { data, img, fur, cuts, sp });
  }

  // ── 동작: (보기, 시간, 상태) → 각도 · 루트 ──
  // 루트 dy: + = 아래로 (리그 px)
  function pose(view, st, t) {
    const a = {}, root = { dx: 0, dy: 0, rot: 0 }, sc = {}, off = {};
    const side = view === 'side';
    const br = Math.sin(t * 2.2 + (st.seed || 0));
    // 대기 숨쉬기 + 살짝 숙인 전투 자세
    a.torso = side ? 3 + br * 0.8 : br * 0.4;
    a.head = side ? -br * 1.2 : br * 0.6;
    sc.torso = [1, 1 + br * 0.006];
    a.tail = Math.sin(t * 1.4 + 1) * 4;
    if (side) a.arm = br * 0.8;

    if (st.walk != null) {
      const ph = st.walk * Math.PI * 2;
      const s = Math.sin(ph), c = Math.cos(ph);
      root.dy -= Math.abs(c) * 10;
      if (side) {
        a.torso += 5;
        a.thighN = s * 24; a.shinN = Math.max(0, -s) * 32 + 4;
        a.thighF = -s * 24; a.shinF = Math.max(0, s) * 32 + 4;
        a.arm += c * 2;
      } else {
        a.legL = s * 7; a.legR = -s * 7;
        sc.legL = [1, 1 - Math.max(0, s) * 0.08]; sc.legR = [1, 1 - Math.max(0, -s) * 0.08];
        a.torso += s * 1.5;
      }
      a.tail += s * 8;
    }
    if (st.crouch) {
      // 리그 무릎 꿇기 (옆모습): 앞다리는 세우고 뒷다리는 무릎을 땅에
      const k = st.crouch;
      if (side) {
        a.torso = (a.torso || 0) + 16 * k;
        a.head += -10 * k;
        a.thighN = (a.thighN || 0) * (1 - k) - 78 * k; a.shinN = (a.shinN || 0) * (1 - k) + 82 * k;
        a.thighF = (a.thighF || 0) * (1 - k) - 8 * k; a.shinF = (a.shinF || 0) * (1 - k) + 86 * k;
        root.dy += 132 * k;
      } else {
        sc.legL = [1, 1 - 0.42 * k]; sc.legR = [1, 1 - 0.42 * k];
        a.legL = -6 * k; a.legR = 6 * k;
        root.dy += 120 * k;
        a.head += 3 * k;
      }
    }
    if (st.aim) {
      const k = st.aim;
      if (side) { a.arm = (a.arm || 0) - 9 * k; a.head += 4 * k; a.torso += 2 * k; }
    }
    if (st.recoil) {
      const r = st.recoil;
      if (side) { a.arm = (a.arm || 0) - 7 * r; off.arm = [-10 * r, 0]; a.torso -= 2 * r; }
      else root.dy += 6 * r;
    }
    if (st.throwK) {
      const k = st.throwK;
      if (side) { a.arm = (a.arm || 0) - 150 * k * (1 - k) * 4 * 0.5; a.torso -= 8 * Math.sin(k * Math.PI); }
    }
    if (st.hit) {
      const h = st.hit;
      if (side) { a.torso -= 9 * h; a.head -= 12 * h; root.dx -= 10 * h; }
      else { a.torso += 6 * h; a.head -= 8 * h; root.dy -= 4 * h; }
    }
    if (st.death != null) {
      // 쓰러짐: 0~0.25 맞고 젖혀짐 → 0.25~0.6 무릎 꺾임 → 0.6~1 바닥
      const d = st.death;
      const e1 = Math.min(1, d / 0.25), e2 = Math.max(0, Math.min(1, (d - 0.25) / 0.35)), e3 = Math.max(0, Math.min(1, (d - 0.6) / 0.4));
      const ease = (x) => 1 - (1 - x) * (1 - x);
      a.torso -= 14 * e1 - 6 * e2;
      a.head -= 18 * e1;
      if (side) {
        a.thighN = -30 * e2; a.shinN = 50 * e2; a.thighF = -10 * e2; a.shinF = 40 * e2;
        a.arm = (a.arm || 0) + 50 * e2 + 30 * e3;
      }
      root.rot = -88 * ease(e3) - 12 * e2;
      root.dy += 60 * e2 * (1 - e3) + 0;
      root.dx -= 140 * ease(e3) + 30 * e2;
      a.tail += 20 * e3;
    }
    return { a, root, sc, off };
  }

  function matrices(V, P, base) {
    const M = {};
    const get = (n) => {
      if (M[n]) return M[n];
      const p = V.parts[n];
      let m = p.parent && V.parts[p.parent] ? get(p.parent) : base;
      const o = P.off[n];
      if (o) m = m.translate(o[0], o[1]);
      m = m.translate(p.pivot[0], p.pivot[1]).rotate(P.a[n] || 0);
      const s = P.sc[n];
      if (s) m = m.scale(s[0], s[1]);
      M[n] = m.translate(-p.pivot[0], -p.pivot[1]);
      return M[n];
    };
    for (const n of Object.keys(V.parts)) get(n);
    return M;
  }

  // R = load() 결과, (x, y) = 발 밑 화면 자리, h = 화면 키
  // o = { view, flip, st, t, hide: {부위:1}, face: 'hit'|'attack'|null, tint, alpha }
  function draw(ctx, R, x, y, h, o) {
    const sp = SPECIES[R.sp];
    const k = h / sp.tall;
    // 통그림 컷이 정해졌으면 그것만
    if (o.cut && R.cuts[o.cut]) {
      const c = R.cuts[o.cut];
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(o.flip ? -k : k, k);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      if (o.tint) ctx.filter = o.tint;
      ctx.drawImage(c.im, -c.pivot[0], -c.pivot[1], c.w, c.h);
      ctx.restore();
      return null;
    }
    const V = R.data.views[o.view];
    const P = pose(o.view, o.st || {}, o.t || 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(o.flip ? -k : k, k);
    ctx.translate(P.root.dx, P.root.dy);
    if (P.root.rot) ctx.rotate(rad(P.root.rot));
    ctx.translate(-V.ground[0], -V.ground[1]);
    const M = matrices(V, P, ctx.getTransform());
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    for (const n of V.order) {
      const p = V.parts[n];
      if (!p || (o.hide && o.hide[n])) continue;
      ctx.setTransform(M[n]);
      if (o.tint && n === 'head') ctx.filter = o.tint;
      ctx.drawImage(R.img[o.view][n], p.x, p.y, p.w, p.h);
      if (o.tint && n === 'head') ctx.filter = 'none';
      if (n === 'head' && o.face) drawFace(ctx, R, o.view, o.face);
    }
    ctx.restore();
    return { M, V };
  }

  // 눈 점 표정: 점을 털색으로 덮고 다른 모양으로
  function drawFace(ctx, R, view, face) {
    const sp = SPECIES[R.sp];
    const eyes = sp.eyes[view];
    if (!eyes) return;
    const r = sp.eyeR;
    for (const [ex, ey] of eyes) {
      ctx.fillStyle = R.fur[view] || '#7a5e48';
      ctx.beginPath(); ctx.ellipse(ex, ey, r * 1.5, r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1d1712'; ctx.fillStyle = '#1d1712';
      ctx.lineCap = 'round';
      if (face === 'hit') {
        // 질끈 감음: > 모양
        ctx.lineWidth = r * 0.55;
        ctx.beginPath(); ctx.moveTo(ex - r, ey - r * 0.8); ctx.lineTo(ex + r * 0.6, ey); ctx.lineTo(ex - r, ey + r * 0.8); ctx.stroke();
      } else if (face === 'attack') {
        // 가늘게 뜸: 납작한 점 + 비스듬한 눈꺼풀
        ctx.beginPath(); ctx.ellipse(ex, ey + r * 0.25, r * 1.05, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = r * 0.35;
        ctx.beginPath(); ctx.moveTo(ex - r * 1.3, ey - r * 0.9); ctx.lineTo(ex + r * 1.2, ey - r * 0.2); ctx.stroke();
      } else if (face === 'dead') {
        ctx.lineWidth = r * 0.45;
        ctx.beginPath(); ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r); ctx.stroke();
      }
    }
  }

  // 절단용: 부위 하나를 떼어 낼 때 그 부위의 지금 화면 자리 (중심 · 각도)
  function partSnapshot(R, view, drawn, part) {
    if (!drawn) return null;
    const p = drawn.V.parts[part], m = drawn.M[part];
    if (!p || !m) return null;
    const c = m.transformPoint(new DOMPoint(p.x + p.w / 2, p.y + p.h / 2));
    const ax = m.transformPoint(new DOMPoint(p.x + p.w / 2 + 10, p.y + p.h / 2));
    const sx = Math.hypot(ax.x - c.x, ax.y - c.y) / 10;
    return { im: R.img[view][part], w: p.w, h: p.h, x: c.x, y: c.y, rot: Math.atan2(ax.y - c.y, ax.x - c.x), k: sx, flip: m.a * m.d - m.b * m.c < 0 };
  }

  return { load, draw, partSnapshot, loadImage, SPECIES };
})();
