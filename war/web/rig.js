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
    rat: { tall: 470, eyes: { side: [[137.5, 64]], front: [[112.5, 64], [150, 64]] }, eyeR: 6, dot: true, noExpr: [3, 4] },
    cat: { tall: 470, eyes: { side: [[139, 66.5]], front: [[118.5, 66], [152.5, 66]] }, eyeR: 7, dot: false },
  };

  const loaded = {};
  // sp = 리그 이름 (rat · rat_sniper · rat_face3 · cat …). 종 = 앞 단어
  async function load(sp) {
    if (loaded[sp]) return loaded[sp];
    const data = window.RIGS[sp];
    if (!data) return null;
    const kind = sp.split('_')[0];
    const base = `../art/${sp}/`;
    const img = {};
    const jobs = [];
    for (const [vn, V] of Object.entries(data.views)) {
      img[vn] = {};
      for (const [pn, p] of Object.entries(V.parts)) {
        jobs.push(loadImage(base + p.img).then((im) => (img[vn][pn] = im)));
        // 개체 머리 (모자 포함): parts/<시점>/head_f<n>.png
        for (let f = 0; f < (p.faces || 0); f++) jobs.push(loadImage(`${base}parts/${vn}/head_f${f}.png`).then((im) => (img[vn]['head_f' + f] = im)));
      }
      if (V.crouch) jobs.push(loadImage(base + V.crouch.img).then((im) => (img[vn].crouch = im)));
      (V.throw || []).forEach((f, i) => jobs.push(loadImage(base + f.img).then((im) => (img[vn]['throw' + i] = im))));
    }
    await Promise.all(jobs);
    // 앞 웅크림: 목 위로 삐죽 나온 총 끝만 따로 → 머리 위에 한 번 더 그림 (총이 얼굴 앞에 오게)
    for (const [vn, V] of Object.entries(data.views)) if (vn === 'front' && img[vn].crouch) img[vn].crouchTop = overNeck(img[vn].crouch, V.crouch);
    // 눈 옆 털 색 (표정 바꿀 때 점을 덮는 색)
    const fur = {};
    for (const vn of ['side', 'front']) {
      const e = (SPECIES[kind].eyes[vn] || [])[0];
      const head = img[vn] && img[vn].head;
      const P = data.views[vn] && data.views[vn].parts.head;
      if (!e || !head) continue;
      const c = document.createElement('canvas');
      c.width = head.width; c.height = head.height;
      const g = c.getContext('2d');
      g.drawImage(head, 0, 0);
      let px = [122, 94, 72];
      try { px = g.getImageData(Math.round(e[0] - P.x + SPECIES[kind].eyeR * 2.2), Math.round(e[1] - P.y + 2), 1, 1).data; } catch (err) { /* file:// 에선 못 읽음 */ }
      fur[vn] = `rgb(${px[0]},${px[1]},${px[2]})`;
    }
    const cuts = {};
    const A = (window.ART || {})[kind] || {};
    await Promise.all(Object.entries(A).map(([n, a]) => loadImage('../art/out/' + a.img).then((im) => (cuts[n] = { ...a, im }))));
    return (loaded[sp] = { data, img, fur, cuts, sp, kind });
  }

  // 웅크린 몸 그림에서 목보다 위에 있는 덩어리 중 목(살색 토막)에 안 붙은 것만 남긴 그림. 없으면 null
  function overNeck(im, C) {
    const w = im.width, h = im.height, sx = w / C.w, sy = h / C.h;
    const nx = Math.round((C.neck[0] - C.x) * sx), cut = Math.round((C.neck[1] - C.y) * sy) - 6;
    if (cut <= 0) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, w, cut); } catch (err) { return null; } // file:// 에선 못 읽음
    const A = (x, y) => d.data[(y * w + x) * 4 + 3] > 40;
    const seen = new Uint8Array(w * cut);
    // 목 토막: 자른 줄에서 목 x 에 가장 가까운 불투명 점부터 퍼짐 → 지움
    const stack = [];
    for (let r = 0; r < w; r++) {
      if (nx - r >= 0 && A(nx - r, cut - 1)) { stack.push(nx - r, cut - 1); break; }
      if (nx + r < w && A(nx + r, cut - 1)) { stack.push(nx + r, cut - 1); break; }
    }
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= cut || seen[y * w + x] || !A(x, y)) continue;
      seen[y * w + x] = 1;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    let any = false;
    for (let i = 0; i < w * cut; i++) { if (seen[i]) d.data[i * 4 + 3] = 0; else if (d.data[i * 4 + 3]) any = true; }
    if (!any) return null;
    g.clearRect(0, 0, w, h);
    g.putImageData(d, 0, 0);
    return c;
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
  // o.faceIdx = 개체 얼굴 번호 (병종 리그의 head_f<n> 파츠)
  function draw(ctx, R, x, y, h, o) {
    const sp = SPECIES[R.kind];
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
    // 앞 · 뒤 웅크림: 웅크린 몸 그림 + 목에 머리 파츠 (숨쉬기 · 맞으면 움찔)
    const B = o.baseR || R; // 머리 · 웅크림을 가진 병종 기본 리그
    // 웅크린 몸: 병종 것 → 없으면 같은 종 기본 리그 것 (머리는 늘 병종 것)
    const CB = B.data.views[o.view].crouch ? B : loaded[R.kind] && loaded[R.kind].data.views[o.view].crouch ? loaded[R.kind] : B;
    const st = o.st || {};
    // 앞 · 뒤 던지기: 머리 없는 던지기 몸 그림(들어올림 → 던짐) + 목에 머리 파츠
    const TB = [R, B, loaded[R.kind]].find((r) => r && r.data.views[o.view].throw && r.img[o.view].throw1);
    if (st.throwK && o.view !== 'side' && TB && st.death == null) {
      const tk = st.throwK, f = tk < 0.5 ? 0 : 1, T = TB.data.views[o.view].throw[f];
      // 들어올리며 뒤로 젖힘 → 던지며 앞으로 숙임 (앞모습: 앞 = 아래로 숙임, 뒷모습도 같은 방향 느낌)
      const lean = f ? Math.sin((tk - 0.5) * 2 * Math.PI) * 5 : -Math.sin(tk * Math.PI) * 3;
      const hd = B.data.views[o.view].parts.head, him = (o.faceIdx != null && B.img[o.view]['head_f' + o.faceIdx]) || B.img[o.view].head;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(o.flip ? -k : k, k);
      ctx.translate(-V.ground[0], -V.ground[1]);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.translate(V.ground[0], V.ground[1]); ctx.rotate(rad(lean * 0.3)); ctx.translate(-V.ground[0], -V.ground[1]);
      ctx.drawImage(TB.img[o.view]['throw' + f], T.x, T.y, T.w, T.h);
      ctx.translate(T.neck[0], T.neck[1] + Math.abs(lean));
      ctx.rotate(rad(lean));
      ctx.translate(-hd.pivot[0], -hd.pivot[1]);
      if (o.tint) ctx.filter = o.tint;
      ctx.drawImage(him, hd.x, hd.y, hd.w, hd.h);
      ctx.filter = 'none';
      if (o.face && !(SPECIES[R.kind].noExpr || []).includes(o.faceIdx)) drawFace(ctx, B, o.view, o.face);
      ctx.restore();
      return null;
    }
    const C = CB.data.views[o.view].crouch;
    if (C && CB.img[o.view].crouch && (st.crouch || 0) > 0.55 && st.death == null) {
      const br = Math.sin((o.t || 0) * 2.2 + (st.seed || 0));
      const hv = C.head || o.view; // 머리 파츠 시점
      const hd = B.data.views[hv].parts.head, him = (o.faceIdx != null && B.img[hv]['head_f' + o.faceIdx]) || B.img[hv].head;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(o.flip ? -k : k, k);
      ctx.translate(-V.ground[0] - (st.hit || 0) * 6, -V.ground[1]);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.drawImage(CB.img[o.view].crouch, C.x, C.y + br * 1.2, C.w, C.h);
      const body = ctx.getTransform(), top = CB.img[o.view].crouchTop;
      ctx.translate(C.neck[0], C.neck[1] + br * 1.6 + (st.hit || 0) * 4);
      ctx.rotate(rad(br * 0.8 - (st.hit || 0) * 6));
      ctx.translate(-hd.pivot[0], -hd.pivot[1]);
      if (o.tint) ctx.filter = o.tint;
      ctx.drawImage(him, hd.x, hd.y, hd.w, hd.h);
      ctx.filter = 'none';
      if (o.face && !(SPECIES[R.kind].noExpr || []).includes(o.faceIdx)) drawFace(ctx, B, hv, o.face);
      if (top) { ctx.setTransform(body); ctx.drawImage(top, C.x, C.y + br * 1.2, C.w, C.h); }
      ctx.restore();
      return null;
    }
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
      // 머리: 개체 얼굴(o.faceIdx) 파츠가 있으면 그것 (병종 모자를 쓴 채로 그려 둔 그림)
      const im = n === 'head' && o.faceIdx != null && (R.img[o.view]['head_f' + o.faceIdx] || (B.img[o.view] && B.img[o.view]['head_f' + o.faceIdx])) || R.img[o.view][n];
      const prost = o.prost && ((o.prost.includes('arm') && n === 'arm') || (o.prost.includes('leg') && (n === 'shinN' || n === 'legR')));
      if (o.tint && n === 'head') ctx.filter = o.tint;
      if (prost) ctx.filter = n === 'arm' ? 'grayscale(1) brightness(0.85) contrast(1.3)' : 'sepia(1) saturate(1.6) brightness(0.62)';
      ctx.drawImage(im, p.x, p.y, p.w, p.h);
      if ((o.tint && n === 'head') || prost) ctx.filter = 'none';
      if (n === 'head' && o.face && !(SPECIES[R.kind].noExpr || []).includes(o.faceIdx)) drawFace(ctx, R, o.view, o.face);
    }
    ctx.restore();
    return { M, V };
  }

  // 눈 점 표정: 점을 털색으로 덮고 다른 모양으로
  function drawFace(ctx, R, view, face) {
    const sp = SPECIES[R.kind];
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
