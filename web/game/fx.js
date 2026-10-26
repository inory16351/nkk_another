// 이펙트 (HANDOFF 6절): 스프라이트 이펙트 엔진 + 기술별 연출 묶음
//  스프라이트 = 그림 한 장을 크기 · 알파 곡선 · 회전 · 속도 · 중력으로 움직임. 'lighter' 합성 · 뒤/앞 레이어 · 색 입힘(캐시)
//  화면 = 플래시 · 배경 어둡게(dim) · 히트스톱(시간 배율)
//  좌표는 전장(월드) 좌표 — battle.draw 의 카메라 변환 안에서 그림
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, k) => a + (b - a) * k;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const easeOut = (u) => 1 - (1 - u) * (1 - u);
  const easeIn = (u) => u * u;
  // 꺾은선 곡선: keys = [[u, 값], ...]
  const track = (keys, u) => {
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) { const [u0, v0] = keys[i - 1], [u1, v1] = keys[i]; return v0 + (v1 - v0) * (u - u0) / (u1 - u0 || 1); }
    return keys[keys.length - 1][1];
  };
  // 숫자 = 고정 · [시작, 끝] = 보간 · [[u, 값], ...] = 곡선
  const val = (v, u, ease) => !Array.isArray(v) ? v : typeof v[0] === 'number' ? lerp(v[0], v[1], (ease || easeOut)(u)) : track(v, u);

  // 그림: main.js 가 'fx:<키>' 로 불러옴 (build_single.js 는 이 문자열 경로를 찾아 품음)
  //  k_* = NKK 기사 초필살기 이펙트
  const SRC = {
    k_arc: '../art/fx/k/fx_arc.png', k_beam: '../art/fx/k/fx_beam.png', k_boom1: '../art/fx/k/fx_boom1.png',
    k_boom2: '../art/fx/k/fx_boom2.png', k_boom3: '../art/fx/k/fx_boom3.png', k_burst: '../art/fx/k/fx_burst.png',
    k_charge: '../art/fx/k/fx_charge.png', k_column: '../art/fx/k/fx_column.png', k_cutline: '../art/fx/k/fx_cutline.png',
    k_dots: '../art/fx/k/fx_dots.png', k_flash: '../art/fx/k/fx_flash.png', k_ghostsword: '../art/fx/k/fx_ghostsword.png',
    k_hit1: '../art/fx/k/fx_hit1.png', k_hit2: '../art/fx/k/fx_hit2.png', k_hit3: '../art/fx/k/fx_hit3.png',
    k_lightring: '../art/fx/k/fx_lightring.png', k_mote: '../art/fx/k/fx_mote.png', k_motes: '../art/fx/k/fx_motes.png',
    k_pillar: '../art/fx/k/fx_pillar.png', k_ring: '../art/fx/k/fx_ring.png', k_ripple: '../art/fx/k/fx_ripple.png',
    k_shards: '../art/fx/k/fx_shards.png', k_slash: '../art/fx/k/fx_slash.png', k_slashwave: '../art/fx/k/fx_slashwave.png',
    k_sparks: '../art/fx/k/fx_sparks.png', k_streak: '../art/fx/k/fx_streak.png', k_wave: '../art/fx/k/fx_wave.png',
    dot: '../art/fx/dot.png', puff: '../art/fx/puff.png', crumbs: '../art/fx/crumbs.png', smoke: '../art/fx/smoke.png',
    flame: '../art/fx/flame.png', bolt_b: '../art/fx/bolt_b.png',
    shard_a: '../art/fx/shard_a.png', shard_b: '../art/fx/shard_b.png', shard_c: '../art/fx/shard_c.png',
  };

  const A_FADE = [[0, 0], [0.1, 1], [0.6, 1], [1, 0]];
  const A_OUT = [[0, 1], [1, 0]];
  const A_POP = [[0, 1], [0.55, 1], [1, 0]];
  const HOLD = (k) => [[0, 0], [0.08, 1], [k, 1], [1, 0]]; // k 까지 유지 후 사라짐

  // 무기 궤적 색 (병과별, 적 = 붉은색)
  const TRAIL = { knight: '255,214,110', lancer: '140,195,255', archer: '190,255,170', mage: '190,150,255', priest: '255,240,200' };

  class FX {
    constructor(battle) {
      this.b = battle; this.img = battle.g.img;
      this.list = []; this.tasks = []; this.trails = []; this.projs = [];
      this.flashA = 0; this.flashC = '#fff'; this.flashDecay = 4;
      this.dimV = 0; this.dimT = 0; this.stop = 0;
      this.tints = new Map();
    }

    // ───────── 엔진
    // 색 입힘: 흑백 → 색 곱하기 → 원래 알파. 키+색마다 한 번만 만듦
    tinted(key, col) {
      const id = key + '|' + col;
      let c = this.tints.get(id);
      if (c) return c;
      const im = this.img['fx:' + key];
      if (!im) return null;
      c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d');
      x.filter = 'grayscale(1) brightness(1.25)'; x.drawImage(im, 0, 0); x.filter = 'none';
      x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0);
      this.tints.set(id, c);
      return c;
    }
    // 스프라이트 하나. o: w(화면 폭 px) · sx · sy · a(알파 곡선) · alpha · life · delay · vx · vy · g(중력) · drag · rot · vr
    //  ax · ay(기준점 0~1) · layer('back'|'front') · blend('lighter') · tint · flip · seq(연속 그림 장수)
    //  follow() → [x, y] 매 프레임 따라감 · to(→[x, y] 또는 함수) 쪽으로 빨려 듦 · upd(e, u) 직접 조정
    add(key, x, y, o = {}) {
      const e = Object.assign({ key, x, y, x0: x, y0: y, vx: 0, vy: 0, g: 0, drag: 0, life: 0.4, w: 100, sx: 1, sy: 1, a: A_FADE, alpha: 1, rot: 0, vr: 0, ax: 0.5, ay: 0.5, layer: 'front' }, o);
      e.t = -(o.delay || 0);
      this.list.push(e);
      return e;
    }
    // 일정 간격으로 fn(u) 부름 (u = 0~1 진행)
    every(gap, life, fn, delay = 0) { this.tasks.push({ gap, life, fn, t: -delay, acc: gap }); }
    flash(col = '#fff', a = 0.8, decay = 4) { this.flashC = col; this.flashA = Math.max(this.flashA, a); this.flashDecay = decay; }
    dim(v) { this.dimT = v; }
    hitstop(s) { this.stop = Math.max(this.stop, s); }
    shake(v) { this.b.cam.shake = Math.max(this.b.cam.shake, v); }
    // 칼끝 (없으면 손 · 머리 위)
    tip(u) {
      const M = u.M, p = M ? u.rig.point(M, 'weapon', 'tip') || u.rig.point(M, 'foreArm', 'grip') : null;
      if (p) return this.b.screenToWorld(p[0], p[1]);
      const [x, y, rr] = this.b.pos(u);
      return [x, y - window.FIELD.H_BASE * window.FIELD.rowS(rr) * u.size * 0.8];
    }

    // 시간 진행. 돌려주는 값 = 히트스톱이 반영된 dt (유닛 · 이펙트가 씀)
    step(dt) {
      let sdt = dt;
      if (this.stop > 0) { this.stop -= dt; sdt = dt * 0.04; }
      this.flashA = Math.max(0, this.flashA - dt * this.flashDecay);
      this.dimV += (this.dimT - this.dimV) * Math.min(1, dt * 5);
      for (const k of this.tasks) {
        k.t += sdt;
        if (k.t < 0) continue;
        k.acc += sdt;
        while (k.acc >= k.gap) { k.acc -= k.gap; k.fn(clamp(k.t / k.life, 0, 1)); }
      }
      this.tasks = this.tasks.filter((k) => k.t < k.life);
      for (const e of this.list) {
        e.t += sdt;
        if (e.t < 0) continue;
        const u = clamp(e.t / e.life, 0, 1);
        if (e.follow) { [e.x, e.y] = e.follow(); }
        else if (e.to) { const [hx, hy] = typeof e.to === 'function' ? e.to() : e.to; const k = easeIn(u); e.x = lerp(e.x0, hx, k); e.y = lerp(e.y0, hy, k); }
        else {
          e.vy += e.g * sdt;
          if (e.drag) { const d = Math.exp(-e.drag * sdt); e.vx *= d; e.vy *= d; }
          e.x += e.vx * sdt; e.y += e.vy * sdt;
        }
        e.rot += e.vr * sdt;
        if (e.upd) e.upd(e, u);
      }
      this.list = this.list.filter((e) => e.t < e.life);
      for (const p of this.projs) this.stepProj(p, sdt);
      this.projs = this.projs.filter((p) => p.t < p.life);
      for (const tr of this.trails) tr.t += sdt;
      this.trails = this.trails.filter((tr) => tr.t < tr.until + 0.2);
      return sdt;
    }
    draw(ctx, layer) {
      for (const e of this.list) {
        if (e.t < 0 || e.layer !== layer) continue;
        const u = clamp(e.t / e.life, 0, 1);
        const im = e.seq ? this.img[`fx:${e.key}_${Math.min(e.seq, 1 + Math.floor(u * e.seq))}`] : e.tint ? this.tinted(e.key, e.tint) : this.img['fx:' + e.key];
        if (!im) continue;
        const a = track(e.a, u) * e.alpha;
        if (a <= 0.004) continue;
        const s = val(e.w, u, e.ease) / im.width;
        ctx.save();
        ctx.globalAlpha = Math.min(1, a);
        if (e.blend) ctx.globalCompositeOperation = e.blend;
        ctx.translate(e.x, e.y);
        if (e.rot) ctx.rotate(e.rot);
        ctx.scale((e.flip ? -1 : 1) * s * val(e.sx, u, e.ease), s * val(e.sy, u, e.ease));
        ctx.drawImage(im, -im.width * e.ax, -im.height * e.ay);
        ctx.restore();
      }
      if (layer === 'front') this.drawProjs(ctx);
    }
    // 화면 고정: 배경 어둡게 (유닛 그리기 전) · 플래시 (맨 위)
    drawDim(ctx) {
      if (this.dimV < 0.01) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createRadialGradient(800, 520, 200, 800, 520, 980);
      g.addColorStop(0, `rgba(10,12,30,${this.dimV * 0.8})`); g.addColorStop(1, `rgba(2,3,10,${Math.min(0.95, this.dimV * 1.25)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1600, 900);
      ctx.restore();
    }
    drawFlash(ctx) {
      if (this.flashA < 0.01) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, this.flashA); ctx.fillStyle = this.flashC; ctx.fillRect(0, 0, 1600, 900);
      ctx.restore();
    }

    // ───────── 무기 궤적: 칼끝 자취를 가산 합성 띠로 (바깥 병과 색 + 안쪽 흰 심)
    trail(u, until, wide = 1) {
      const col = u.side === 'ally' ? TRAIL[u.kind] || TRAIL.knight : '255,120,95';
      this.trails.push({ u, pts: [], until, t: 0, col, wide });
    }
    drawTrails(ctx) {
      const LIFE = 0.17;
      for (const tr of this.trails) {
        const u = tr.u;
        if (tr.t <= tr.until && u.M) {
          const tip = u.rig.point(u.M, 'weapon', 'tip'), grip = u.rig.point(u.M, 'weapon', 'pivot');
          if (tip && grip) {
            const a = this.b.screenToWorld(tip[0], tip[1]), b = this.b.screenToWorld(grip[0], grip[1]);
            const last = tr.pts[tr.pts.length - 1];
            if (!last || Math.hypot(a[0] - last.a[0], a[1] - last.a[1]) > 1) tr.pts.push({ a, b, t: tr.t });
          }
        }
        tr.pts = tr.pts.filter((p) => tr.t - p.t < LIFE);
        if (tr.pts.length < 2) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [inner, col, k0] of [[1 - 0.6 * tr.wide, tr.col, 0.8], [0.18 * tr.wide, '255,255,255', 0.9]]) {
          for (let i = 1; i < tr.pts.length; i++) {
            const p0 = tr.pts[i - 1], p1 = tr.pts[i], age = clamp((tr.t - p1.t) / LIFE, 0, 1);
            const m0 = [lerp(p0.a[0], p0.b[0], 1 - inner), lerp(p0.a[1], p0.b[1], 1 - inner)];
            const m1 = [lerp(p1.a[0], p1.b[0], 1 - inner), lerp(p1.a[1], p1.b[1], 1 - inner)];
            ctx.fillStyle = `rgba(${col},${k0 * (1 - age) * (1 - age)})`;
            ctx.beginPath(); ctx.moveTo(p0.a[0], p0.a[1]); ctx.lineTo(p1.a[0], p1.a[1]); ctx.lineTo(m1[0], m1[1]); ctx.lineTo(m0[0], m0[1]); ctx.closePath(); ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    // ───────── 투사체: p = { kind: bolt|orb|fire|zapline, sx, sy, ex, ey, dur, arc }
    proj(p) {
      Object.assign(p, { t: 0, acc: 0, x: p.sx, y: p.sy, ang: Math.atan2(p.ey - p.sy, p.ex - p.sx), life: p.dur + (p.kind === 'zapline' ? 0.22 : 0) });
      this.projs.push(p);
      if (p.kind === 'zapline') this.add('dot', p.sx, p.sy, { tint: '#9fe4ff', blend: 'lighter', w: [40, 110], life: 0.25, a: A_OUT });
      if (p.kind === 'orb') this.add('k_flash', p.sx, p.sy, { tint: '#c9a8ff', blend: 'lighter', w: [30, 90], life: 0.2, a: A_OUT });
    }
    stepProj(p, dt) {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const nx = lerp(p.sx, p.ex, k), ny = lerp(p.sy, p.ey, k) - Math.sin(k * Math.PI) * p.arc;
      if (Math.hypot(nx - p.x, ny - p.y) > 0.5) p.ang = Math.atan2(ny - p.y, nx - p.x);
      p.x = nx; p.y = ny;
      if (p.t > p.dur) return;
      p.acc += dt;
      const gap = p.kind === 'bolt' ? 0.012 : 0.02;
      while (p.acc >= gap) {
        p.acc -= gap;
        if (p.kind === 'bolt') this.add('k_streak', p.x, p.y, { rot: p.ang, ax: 0.85, w: 80, sy: 0.5, life: 0.12, a: A_OUT, alpha: 0.5, tint: '#e8f4ff' });
        else if (p.kind === 'orb') this.add('k_mote', p.x + rnd(-6, 6), p.y + rnd(-6, 6), { tint: '#d4bcff', blend: 'lighter', w: rnd(12, 24), vx: rnd(-40, 40), vy: rnd(-60, 10), vr: rnd(-6, 6), life: rnd(0.25, 0.4), a: A_POP });
        else if (p.kind === 'fire') {
          this.add('flame', p.x + rnd(-8, 8), p.y + rnd(-8, 8), { w: rnd(30, 48), vy: rnd(-90, -40), vx: -Math.cos(p.ang) * 60, life: rnd(0.25, 0.4), a: A_OUT, rot: p.ang + Math.PI / 2 });
          if (Math.random() < 0.3) this.add('smoke', p.x, p.y, { w: rnd(30, 50), vy: -50, life: 0.6, a: [[0, 0], [0.2, 0.5], [1, 0]] });
        }
      }
    }
    drawProjs(ctx) {
      const im = this.img;
      for (const p of this.projs) {
        if (p.kind === 'zapline') { this.bolt(ctx, p.sx, p.sy, p.x, p.y, p.t > p.dur ? 1 - (p.t - p.dur) / 0.22 : 1); continue; }
        if (p.t > p.dur) continue;
        ctx.save(); ctx.translate(p.x, p.y);
        if (p.kind === 'bolt') {
          const a = im['fx:arrow'], s = 66 / a.width;
          ctx.rotate(p.ang); ctx.drawImage(a, -a.width * s * 0.6, -a.height * s / 2, a.width * s, a.height * s);
        } else if (p.kind === 'fire') {
          const a = im['fx:fireball'], s = 104 / a.width;
          ctx.rotate(p.ang); ctx.drawImage(a, -a.width * s * 0.72, -a.height * s / 2, a.width * s, a.height * s);
        } else {  // 마력탄: 보라 빛 + 도는 섬광
          ctx.globalCompositeOperation = 'lighter';
          const g = this.tinted('dot', '#b48cff'), s = 74 / g.width;
          ctx.drawImage(g, -g.width * s / 2, -g.height * s / 2, g.width * s, g.height * s);
          const f = this.tinted('k_flash', '#e4d4ff'), s2 = 34 / f.width;
          ctx.rotate(p.t * 9); ctx.drawImage(f, -f.width * s2 / 2, -f.height * s2 / 2, f.width * s2, f.height * s2);
        }
        ctx.restore();
      }
    }
    // 번개: 굵은 반투명 + 가는 흰 선 이중, 곁가지 몇 개 (매 프레임 새로 흔들림)
    bolt(ctx, x0, y0, x1, y1, a = 1) {
      if (a <= 0) return;
      const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 28));
      const pts = [[x0, y0]];
      const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
      for (let i = 1; i < n; i++) { const k = i / n, j = rnd(-1, 1) * 22; pts.push([lerp(x0, x1, k) + nx / L * j, lerp(y0, y1, k) + ny / L * j]); }
      pts.push([x1, y1]);
      const branches = [];
      for (let i = 1; i < n - 1; i++) if (Math.random() < 0.35) {
        const [bx, by] = pts[i], ang = Math.atan2(y1 - y0, x1 - x0) + rnd(-1.3, 1.3), len = rnd(25, 60);
        branches.push([[bx, by], [bx + Math.cos(ang) * len * 0.5 + rnd(-8, 8), by + Math.sin(ang) * len * 0.5 + rnd(-8, 8)], [bx + Math.cos(ang) * len, by + Math.sin(ang) * len]]);
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const line = (P) => { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const q of P.slice(1)) ctx.lineTo(q[0], q[1]); ctx.stroke(); };
      ctx.strokeStyle = `rgba(110,200,255,${0.35 * a})`; ctx.lineWidth = 16; line(pts);
      ctx.strokeStyle = `rgba(160,225,255,${0.7 * a})`; ctx.lineWidth = 6; line(pts); for (const b of branches) line(b);
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.2; line(pts); ctx.lineWidth = 1.2; for (const b of branches) line(b);
      ctx.restore();
    }

    // ───────── 기술별 연출 (x, y = 맞는 자리 · sc = 줄 크기)
    // 파편: 작은 그림들이 튀어 오르고 떨어짐
    debris(x, y, sc, n, o = {}) {
      const keys = o.keys || ['k_mote'];
      for (let i = 0; i < n; i++) {
        const dir = o.dir || (Math.random() < 0.5 ? -1 : 1);
        this.add(pick(keys), x + rnd(-10, 10) * sc, y + rnd(-10, 10) * sc, {
          w: rnd(o.w0 || 12, o.w1 || 24) * sc, vx: (dir * rnd(120, o.speed || 420) + rnd(-90, 90)) * sc, vy: rnd(-480, -140) * sc, g: 1400 * sc,
          vr: rnd(-10, 10), rot: rnd(0, 6.28), life: rnd(0.35, 0.6), a: A_POP, tint: o.tint, blend: o.blend, delay: o.delay,
        });
      }
    }
    // 타격: kind = cut(베기) · pierce(찌르기 · 볼트) · blunt(둔기) · magic · holy
    impact(x, y, sc, o = {}) {
      const dir = o.dir || 1, crit = !!o.crit, kind = o.kind || 'cut';
      this.hitstop(crit ? 0.12 : 0.055);
      this.shake(crit ? 22 : 10);
      const tint = kind === 'magic' ? '#c9a8ff' : o.tint;
      if (crit) {
        this.flash('#fff', 0.3, 5);
        this.add('k_burst', x, y, { w: [120 * sc, 340 * sc], life: 0.32, a: A_OUT, blend: 'lighter', alpha: 0.75, rot: rnd(0, 0.6), tint });
      }
      this.add(crit ? 'k_hit2' : pick(['k_hit1', 'k_hit3']), x, y, { w: [100 * sc, (crit ? 250 : 170) * sc], life: crit ? 0.3 : 0.22, a: A_POP, rot: rnd(-0.4, 0.4), tint });
      if (kind === 'cut' || kind === 'holy') {
        this.add('k_arc', x - dir * 10 * sc, y, { w: [150 * sc, 210 * sc], sx: [0.7, 1.1], flip: dir < 0, rot: dir * rnd(-0.5, -0.2), life: 0.2, a: A_OUT, tint });
      } else if (kind === 'pierce') {
        this.add('k_streak', x, y, { w: [80 * sc, 190 * sc], flip: dir < 0, ax: 0.8, life: 0.18, a: A_OUT, alpha: 0.85, tint });
      } else if (kind === 'blunt') {
        this.add('k_ring', x, y, { w: [50 * sc, 170 * sc], life: 0.25, a: A_OUT, tint: '#fff0c8' });
      } else if (kind === 'magic') {
        this.add('dot', x, y, { w: [60 * sc, 200 * sc], life: 0.3, a: A_OUT, blend: 'lighter', tint: '#b48cff' });
      }
      this.add('k_sparks', x + dir * 12 * sc, y, { w: [90 * sc, (crit ? 230 : 160) * sc], life: 0.24, a: A_OUT, flip: dir < 0, tint });
      this.debris(x, y, sc, crit ? 10 : 5, { dir, tint, blend: kind === 'magic' ? 'lighter' : undefined });
    }
    // 화염구 폭발 한 칸 (y = 발밑)
    explosion(x, y, sc, delay = 0) {
      this.add('explosion', x, y - 55 * sc, { seq: 6, w: 230 * sc, life: 0.6, a: [[0, 1], [0.8, 1], [1, 0]], delay });
      this.add('k_boom2', x, y + 10 * sc, { ay: 0.85, w: [150 * sc, 250 * sc], life: 0.42, a: A_POP, delay });
      this.add('k_ring', x, y, { sy: 0.36, w: [60 * sc, 320 * sc], life: 0.42, a: A_OUT, tint: '#ffb060', layer: 'back', delay });
      for (let i = 0; i < 3; i++) this.add('smoke', x + rnd(-40, 40) * sc, y - rnd(40, 90) * sc, { w: rnd(70, 110) * sc, vy: rnd(-60, -30), vx: rnd(-20, 20), life: rnd(0.9, 1.3), a: [[0, 0], [0.2, 0.6], [1, 0]], delay: delay + 0.18 + i * 0.05 });
      this.add('crumbs', x, y, { w: 130 * sc, sy: 0.45, tint: '#3b2a20', life: 1.6, a: [[0, 0], [0.1, 0.7], [0.7, 0.7], [1, 0]], layer: 'back', delay });
      this.debris(x, y - 40 * sc, sc, 4, { keys: ['flame'], w0: 16, w1: 30, delay });
    }
    // 치유 (y = 발밑)
    heal(x, y, sc, h) {
      this.add('k_lightring', x, y, { w: [70 * sc, 230 * sc], life: 0.9, a: A_FADE, blend: 'lighter', alpha: 0.8, tint: '#b6ffb0', layer: 'back' });
      this.add('k_column', x, y + 6 * sc, { ay: 1, w: 95 * sc, sy: [0.2, 1.1], life: 1.0, a: A_FADE, blend: 'lighter', alpha: 0.55, tint: '#9dffb4', layer: 'back' });
      for (let i = 0; i < 3; i++) this.add('heart', x + rnd(-30, 30) * sc, y - h * rnd(0.4, 0.75), { tint: '#8dffaa', w: rnd(26, 38) * sc, vy: -90 * sc, life: 0.9, a: A_FADE, delay: i * 0.12 });
      this.every(0.04, 0.6, () => this.add('k_mote', x + rnd(-45, 45) * sc, y - rnd(0, h * 0.5), { tint: '#d8ffd0', blend: 'lighter', w: rnd(12, 22) * sc, vy: rnd(-180, -90) * sc, life: rnd(0.5, 0.8), a: A_FADE }));
    }
    // 버프 · 격려 (y = 발밑)
    buff(x, y, sc, h, col = '#ffd65a') {
      this.add('k_ring', x, y, { sy: 0.36, w: [60 * sc, 210 * sc], life: 0.7, a: A_FADE, blend: 'lighter', tint: col, layer: 'back' });
      this.add('k_lightring', x, y - h * 0.5, { w: [40 * sc, 140 * sc], life: 0.5, a: A_OUT, blend: 'lighter', alpha: 0.6, tint: col });
      this.every(0.05, 0.5, () => this.add('k_mote', x + rnd(-40, 40) * sc, y - rnd(0, h * 0.6), { tint: col, blend: 'lighter', w: rnd(12, 22) * sc, vy: rnd(-170, -90) * sc, life: rnd(0.45, 0.7), a: A_FADE }));
    }
    // 보스 호령: 붉은 빛살 + 퍼지는 링 + 흔들림
    warcry(x, y, sc, h) {
      this.shake(24); this.flash('#ff3020', 0.22, 3);
      this.add('k_beam', x, y - h * 0.55, { tint: '#ff5a40', blend: 'lighter', w: [120 * sc, 460 * sc], life: 0.9, a: A_FADE, alpha: 0.55, vr: 0.8, layer: 'back' });
      for (let i = 0; i < 2; i++) this.add('k_ring', x, y, { sy: 0.38, tint: '#ff4a3a', w: [80 * sc, 520 * sc], life: 0.6, a: A_OUT, blend: 'lighter', layer: 'back', delay: i * 0.18 });
    }
    // 얼음 덫 (y = 발밑)
    ice(x, y, sc) {
      this.add('dot', x, y - 30 * sc, { tint: '#9be8ff', blend: 'lighter', w: [60 * sc, 200 * sc], life: 0.4, a: A_OUT });
      this.add('k_ring', x, y, { sy: 0.36, w: [50 * sc, 200 * sc], tint: '#9be8ff', life: 0.5, a: A_OUT, layer: 'back' });
      this.debris(x, y - 20 * sc, sc, 9, { keys: ['shard_a', 'shard_b', 'shard_c'], tint: '#b4ecff', w0: 18, w1: 34, speed: 260 });
      this.add('puff', x, y - 10 * sc, { w: [60 * sc, 130 * sc], life: 0.5, a: A_OUT, alpha: 0.6, tint: '#e8f8ff' });
    }
    // 방벽이 막음
    shield(x, y, sc) {
      this.add('k_ring', x, y, { w: [80 * sc, 200 * sc], tint: '#9fd0ff', blend: 'lighter', life: 0.4, a: A_OUT });
      this.add('k_flash', x, y, { w: [60 * sc, 150 * sc], tint: '#cfe6ff', blend: 'lighter', life: 0.25, a: A_OUT, alpha: 0.7 });
      this.hitstop(0.05); this.shake(8);
    }
    // 연기 펑 (퇴장 · 순간이동)
    poof(x, y, sc, col) {
      this.add('poof', x, y - 50 * sc, { seq: 6, w: 200 * sc, life: 0.55, a: [[0, 1], [0.8, 1], [1, 0]] });
      if (col) this.every(0.03, 0.3, () => this.add('k_mote', x + rnd(-40, 40) * sc, y - rnd(20, 110) * sc, { tint: col, blend: 'lighter', w: rnd(10, 20) * sc, vy: rnd(-140, -60), life: 0.5, a: A_POP }));
    }
    // 발밑 흙먼지
    dust(x, y, sc, n = 1, big = false) {
      for (let i = 0; i < n; i++) this.add('puff', x + rnd(-14, 14) * sc, y - 4 * sc, { w: [(big ? 50 : 30) * sc, (big ? 120 : 64) * sc], vx: rnd(-40, 40), vy: -18, life: 0.42, a: [[0, 0.45], [1, 0]], tint: '#d9c7a4', layer: 'back' });
    }
    // 일직선 베기 파도 (성검 해방 · 꿰뚫기): x0 → x1, y = 몸 높이, gy = 땅
    waveRow(x0, x1, y, gy, sc, dir, dur, o = {}) {
      const len = Math.abs(x1 - x0), tint = o.tint, big = o.big ? 1 : 0.7;
      const prog = (e) => clamp(e.t / dur, 0, 1);
      const front = this.add('k_wave', x0, y, { w: 250 * sc * big, ax: 0.75, flip: dir < 0, tint, life: dur + 0.2, a: HOLD(dur / (dur + 0.2)), upd: (e) => { e.x = lerp(x0, x1, easeOut(prog(e))); } });
      if (o.big) this.add('dot', x0, y, { tint: '#ffe39a', blend: 'lighter', w: 230 * sc, life: dur + 0.15, a: HOLD(0.8), alpha: 0.7, follow: () => [front.x, front.y] });
      const band = (key, yy, layer, alpha, extra = 0) => this.add(key, x0, yy, { w: len, ax: 0, flip: dir < 0, tint, layer, alpha, life: dur + 0.45 + extra, a: HOLD(dur / (dur + 0.45 + extra)), upd: (e) => { e.sx = Math.max(0.01, Math.abs(front.x - x0) / len); } });
      band('k_slashwave', y + 8 * sc, 'front', o.big ? 0.9 : 0.7);
      band('k_cutline', gy, 'back', 0.95, 0.4);
      this.every(0.018, dur, () => this.add('k_streak', front.x - dir * 30 * sc, front.y + rnd(-26, 26) * sc, { w: rnd(90, 150) * sc * big, flip: dir < 0, ax: 0.9, vx: -dir * 160, life: 0.18, a: A_OUT, alpha: 0.75, tint }));
      this.add('k_ripple', (x0 + x1) / 2, gy, { w: len * 1.05, sy: [0.3, 1], life: 0.7, a: A_FADE, alpha: 0.6, tint, layer: 'back', delay: dur * 0.5 });
      if (o.big) this.add('k_shards', (x0 + x1) / 2, y - 20 * sc, { w: len, flip: dir < 0, vy: -50, life: 0.55, a: A_POP, delay: dur * 0.7, tint });
      return front;
    }

    // ───────── 성검 해방 (전체 순서). onCell(r, c) = 파도가 지나는 칸마다 피해 처리
    async holyblade(a, rows, dir, reach, onCell) {
      const F = window.FIELD, b = this.b, sleep = (s) => new Promise((ok) => setTimeout(ok, s * 1000));
      const [ax, ay] = b.pos(a), sc = F.rowS(a.r), h = F.H_BASE * sc * a.size;
      const tip = () => this.tip(a);
      // ① 모으기: 어둠 + 발밑 빛 고리 + 뒤 빛기둥 + 빛 알갱이가 칼끝으로 + 칼끝 회전 (cheer 자세)
      b.cam.tx = ax + dir * 40; b.cam.ty = ay - 110; b.cam.tz = 1.42;
      this.dim(0.62);
      a.player.set('cheer');
      this.add('k_lightring', ax, ay, { w: [60 * sc, 330 * sc], life: 1.1, a: A_FADE, blend: 'lighter', alpha: 0.9, layer: 'back' });
      this.add('k_pillar', ax, ay + 8 * sc, { ay: 1, w: 170 * sc, sy: [0.05, 1.3], life: 2.7, a: HOLD(0.85), blend: 'lighter', alpha: 0.5, layer: 'back' });
      this.add('k_column', ax, ay + 8 * sc, { ay: 1, w: 92 * sc, sy: [0.2, 1.5], life: 2.7, a: HOLD(0.85), blend: 'lighter', alpha: 0.55, layer: 'back' });
      this.add('dot', ax, ay, { tint: '#ffe9a0', blend: 'lighter', w: [60 * sc, 230 * sc], life: 2.5, a: HOLD(0.9), alpha: 0.85, follow: tip });
      this.add('k_charge', ax, ay, { w: [50 * sc, 170 * sc], vr: 7, life: 2.5, a: HOLD(0.9), blend: 'lighter', alpha: 0.95, follow: tip });
      this.every(0.025, 0.95, () => {
        const [tx, ty] = tip(), ang = rnd(0, 6.28), r = rnd(140, 280) * sc;
        this.add(pick(['k_mote', 'k_mote', 'dot']), tx + Math.cos(ang) * r, ty + Math.sin(ang) * r * 0.8, { w: rnd(12, 28) * sc, to: tip, life: rnd(0.35, 0.55), a: [[0, 0], [0.25, 1], [1, 0.5]], blend: 'lighter', tint: '#fff0b0' });
        b.cam.shake = Math.max(b.cam.shake, 3);
      });
      await sleep(0.95);
      // ② 컷인 (UI)
      await b.g.ui.cutin();
      // ③ 내려베기: 맞는 순간 흰 플래시 · 히트스톱 · 큰 흔들림
      const MO = window.MOTIONS;
      a.player.set('attack');
      this.trail(a, MO.attack.hitAt(a.weapon) + 0.14, 1.4);
      await sleep(MO.attack.hitAt(a.weapon));
      const [tx, ty] = tip();
      this.flash('#fff', 0.95, 3.2); this.hitstop(0.14); this.shake(36);
      this.add('k_burst', tx, ty, { w: [120 * sc, 460 * sc], life: 0.38, a: A_OUT, blend: 'lighter' });
      this.add('k_flash', tx, ty, { w: [80 * sc, 320 * sc], life: 0.3, a: A_OUT, blend: 'lighter' });
      this.add('k_boom1', ax + dir * 80 * sc, ay + 12 * sc, { ay: 0.85, w: [160 * sc, 300 * sc], life: 0.45, a: A_POP });
      this.dust(ax + dir * 60 * sc, ay, sc, 4, true);
      await sleep(0.14);
      // ④ 파도: 줄마다 앞으로 진행, 지나는 칸마다 터짐 + 피해
      const STEP = 0.085, dur = STEP * (reach + 0.5);
      for (const r of rows) {
        const s = F.rowS(r), x0 = F.cellX(a.c, r) + dir * 40 * s, x1 = F.cellX(a.c + dir * (reach + 0.5), r);
        this.waveRow(x0, x1, F.ROW_Y[r] - 60 * s, F.ROW_Y[r], s, dir, dur, { big: true });
      }
      const ex = F.cellX(a.c + dir * reach, a.r);
      this.every(0.016, dur, (k) => { b.cam.tx = lerp(ax + dir * 40, (ax + ex) / 2, easeOut(k)); b.cam.tz = lerp(1.42, 1.12, k); });
      b.cam.ty = ay - 80;
      for (let i = 1; i <= reach; i++) {
        await sleep(STEP);
        for (const r of rows) {
          const c = a.c + dir * i;
          if (c < 0 || c >= F.COLS) continue;
          const s = F.rowS(r), x = F.cellX(c, r), y = F.ROW_Y[r];
          this.add('k_boom1', x, y + 8 * s, { ay: 0.85, w: [110 * s, 190 * s], life: 0.4, a: A_POP });
          this.add('k_burst', x, y - 60 * s, { w: [60 * s, 200 * s], life: 0.25, a: A_OUT, blend: 'lighter', alpha: 0.7 });
          this.dust(x, y, s, 2, true);
          const hit = onCell(r, c);
          if (hit) {
            this.add(pick(['k_hit2', 'k_hit3']), x, y - 70 * s * hit.size, { w: [120 * s, 260 * s], life: 0.3, a: A_POP, rot: rnd(-0.3, 0.3) });
            this.add('k_sparks', x, y - 70 * s * hit.size, { w: [100 * s, 220 * s], life: 0.26, a: A_OUT, flip: dir < 0 });
            this.debris(x, y - 60 * s, s, 6, { dir, keys: ['shard_a', 'shard_b', 'shard_c', 'k_mote'], tint: '#fff0b8', w0: 14, w1: 28 });
            this.shake(18);
          }
        }
      }
      await sleep(0.3);
      // ⑤ 마무리: 빛 고리 + 떠오르는 빛 알갱이, 어둠 걷힘
      this.add('k_lightring', ax, ay, { w: [80 * sc, 360 * sc], life: 0.9, a: A_FADE, blend: 'lighter', alpha: 0.8, layer: 'back' });
      this.every(0.04, 0.7, () => this.add('k_mote', ax + rnd(-60, 60) * sc, ay - rnd(0, h * 0.8), { tint: '#fff0b0', blend: 'lighter', w: rnd(12, 24) * sc, vy: rnd(-180, -90) * sc, life: rnd(0.5, 0.8), a: A_FADE }));
      this.dim(0);
      await sleep(0.55);
    }
  }

  window.FX = FX;
  window.FX_SRC = SRC;
})();
