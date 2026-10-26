// 컷아웃 리그 v2 (tools/assemble.py): 캐릭터별 부위 시트에서 잘라 낸 온전한 부위를 관절에 붙여 그린다.
// 부위 행렬 = 부모 행렬 × 붙는 자리(at) × 회전(기본 rest + 자세 각도) × 크기 × (−피벗). 각도 + = 시계 방향.
(function () {
  const rad = (d) => (d * Math.PI) / 180;

  function loadImage(src) {
    return new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error('그림 로드 실패 ' + src));
      im.src = (window.__ASSETS && window.__ASSETS[src]) || src; // 단일 HTML 빌드는 그림을 data URI 로 품고 있음
    });
  }

  class Rig {
    constructor(data, base) {
      this.data = data;
      this.base = base; // rig.json 이 있는 폴더 (끝에 /)
      this.img = {};
      this.height = data.height;
    }

    async load() {
      await Promise.all(Object.entries(this.data.parts).map(([n, p]) =>
        loadImage(this.base + p.img).then((im) => (this.img[n] = im))));
      return this;
    }

    matrices(pose, base) {
      const P = this.data.parts, ang = pose.angles || {}, off = pose.off || {}, sc = pose.scale || {};
      const M = {};
      const get = (n) => {
        if (M[n]) return M[n];
        const p = P[n];
        let m = p.parent && P[p.parent] ? get(p.parent) : base;
        m = m.translate(p.at[0], p.at[1]);
        const o = off[n];
        if (o) m = m.translate(o[0], o[1]);
        m = m.rotate(p.rest + (ang[n] || 0));
        const s = sc[n];
        if (s) m = m.scale(s[0], s[1]);
        M[n] = m.translate(-p.pivot[0], -p.pivot[1]);
        return M[n];
      };
      for (const n of Object.keys(P)) get(n);
      return M;
    }

    // (x, y) = 화면 발밑 자리, h = 화면에서의 키(px), flip = 왼쪽 보기
    draw(ctx, pose, x, y, h, flip, opts = {}) {
      const r = pose.root || {};
      const k = h / this.height;
      const g = this.data.ground;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flip ? -k : k, k);
      ctx.translate(r.dx || 0, r.dy || 0);
      if (r.rot) ctx.rotate(rad(r.rot));
      ctx.scale(r.sx || 1, r.sy || 1);
      ctx.translate(-g[0], -g[1]);
      const base = ctx.getTransform();
      const M = this.matrices(pose, base);
      if (opts.filter && opts.filter !== 'none') ctx.filter = opts.filter;
      if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
      const P = this.data.parts;
      const order = pose.under ? [...pose.under, ...this.data.order.filter((n) => !pose.under.includes(n))] : this.data.order;
      for (const n of order) {
        const p = P[n];
        if (!p || (pose.hide && pose.hide[n])) continue;
        ctx.setTransform(M[n]);
        ctx.drawImage(this.img[n], 0, 0, p.w, p.h);
      }
      if (opts.bones) {
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        for (const n of order) {
          const p = P[n];
          if (!p) continue;
          ctx.setTransform(M[n]);
          ctx.fillStyle = '#ff3d6e';
          ctx.beginPath(); ctx.arc(p.pivot[0], p.pivot[1], 4 / k, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#10b5ff';
          for (const j of Object.values(p.joints || {})) { ctx.beginPath(); ctx.arc(j[0], j[1], 3 / k, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      ctx.restore();
      return M;
    }

    // 부위의 관절점(이름) 또는 그림 좌표가 화면 어디에 있는지
    point(M, part, joint) {
      const m = M[part], p = this.data.parts[part];
      if (!m || !p) return null;
      const pt = Array.isArray(joint) ? joint : joint === 'pivot' ? p.pivot : (p.joints || {})[joint];
      if (!pt) return null;
      const q = m.transformPoint(new DOMPoint(pt[0], pt[1]));
      return [q.x, q.y];
    }
  }

  window.Rig = Rig;
  window.loadImage = loadImage;
})();
