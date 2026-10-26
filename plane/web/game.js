// 슈퍼맨 쥐 전투 데모: 탑뷰 자유 공중전
// WASD(방향키) = 가고 싶은 방향 → 비행기가 그쪽으로 선회(늘 앞으로 날아감). 마우스 = 조준, 왼쪽 클릭 = 사격, Space = 부스트.
// 스테이지(stages.js) = 배경 + 웨이브 + 보스. 쏘지 않으면 체력 회복.
(async function () {
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const VW = 1600, VH = 900;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const turnTo = (a, b, max) => a + clamp(angDiff(a, b), -max, max);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // 칸 좌표 → 고정 난수 (섬 · 물결 자리가 매번 같게)
  const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const qs = new URLSearchParams(location.search);

  // ── 그림
  function loadImage(src) {
    return new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error('그림 로드 실패 ' + src));
      im.src = (window.__ASSETS && window.__ASSETS[src]) || src; // 단일 HTML 빌드는 data URI 로 품고 있음
    });
  }
  const SP = {};
  for (const [name, frames] of Object.entries(window.SPRITES)) {
    SP[name] = await Promise.all(frames.map(async (f) => ({ ...f, im: await loadImage('../art/sprites/' + f.img) })));
  }
  // 그림자: 그림을 검게 칠한 사본
  function silhouette(f) {
    const c = document.createElement('canvas');
    c.width = f.im.width; c.height = f.im.height;
    const x = c.getContext('2d');
    x.drawImage(f.im, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#0b2a45';
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  for (const n of ['player', 'e_cat', 'e_hawk', 'boss', 'clouds']) for (const f of SP[n]) f.shadow = silhouette(f);

  // ── 화면 맞춤
  const view = { k: 1 };
  function fit() {
    const s = Math.min(innerWidth / VW, innerHeight / VH);
    cv.style.width = VW * s + 'px';
    cv.style.height = VH * s + 'px';
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(VW * s * dpr);
    cv.height = Math.round(VH * s * dpr);
    view.k = cv.width / VW;
  }
  addEventListener('resize', fit);
  fit();

  // ── 입력
  const input = { mx: VW / 2 + 300, my: VH / 2, fire: false, boost: false, keys: new Set() };
  const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    input.mx = (e.clientX - r.left) / r.width * VW;
    input.my = (e.clientY - r.top) / r.height * VH;
  });
  cv.addEventListener('mousedown', (e) => { if (e.button === 0) input.fire = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (DIRS[e.code]) { input.keys.add(e.code); e.preventDefault(); }
    if (e.code === 'Space') { input.boost = true; e.preventDefault(); }
    if (e.code === 'KeyP') paused = !paused;
  });
  addEventListener('keyup', (e) => { input.keys.delete(e.code); if (e.code === 'Space') input.boost = false; });
  addEventListener('blur', () => { input.fire = false; input.boost = false; input.keys.clear(); });
  function wantDir() {
    let x = 0, y = 0;
    for (const k of input.keys) { x += DIRS[k][0]; y += DIRS[k][1]; }
    return x || y ? Math.atan2(y, x) : null;
  }

  // ── 수치 (전투 손맛 조정은 여기)
  const T = {
    speed: 360, boostSpeed: 640, accel: 3,  // 순항 · 부스트 속도, 속도 따라붙는 빠르기
    turn: 4.2, turnBoost: 2.8,              // 초당 선회(rad)
    hp: 100, regen: 14, regenDelay: 1.4,
    fireRate: 12, bulletSpd: 1050, bulletDmg: 1, inherit: 0.3, // 탄이 비행기 속도를 물려받는 정도
    boostMax: 2.2, boostRecover: 0.8,
    shadow: [26, 38],                       // 그림자 어긋남 (높이감)
  };
  const FOE = {
    cat: { hp: 7, r: 44, spr: 'e_cat', speed: 300, turn: 2.2, gear: 2, coin: 3 },
    hawk: { hp: 5, r: 40, spr: 'e_hawk', speed: 330, turn: 3.0, gear: 1, coin: 2 },
    boss: { hp: 360, r: 160, spr: 'boss', speed: 120, turn: 0.7, gear: 15, coin: 30 },
  };

  // ── 상태
  let S, paused = false;
  const stageIdx = clamp(Number(qs.get('stage') || 1) - 1, 0, STAGES.length - 1);
  function newGame(wave = 0) {
    const st = STAGES[stageIdx];
    S = {
      st, t: 0, wave, waveT: 0, banner: '', bannerT: 0, over: false, win: false, pending: null, winAt: 0,
      cam: { x: 0, y: 0, shake: 0 },
      p: { x: 0, y: 0, vx: T.speed, vy: 0, a: 0, bank: 0, hp: T.hp, hurt: 9, inv: 0, noFire: 9, cd: 0, boost: T.boostMax, flash: 0, aim: 0 },
      foes: [], shots: [], eshots: [], fx: [], drops: [],
      gear: 0, coin: 0, kills: 0, taken: 0, dmgBy: {},
    };
    startWave(wave);
  }
  function startWave(i) {
    const W = S.st.waves;
    S.wave = i;
    S.waveT = 0;
    const isBoss = W[i].some(([k]) => k === 'boss');
    S.banner = isBoss ? `보스 출현! ${S.st.bossName}` : i === 0 ? S.st.name : `WAVE ${i + 1}`;
    S.bannerT = 2.4;
    S.pending = [];
    let delay = 0.8;
    for (const [kind, n] of W[i]) for (let k = 0; k < n; k++) { S.pending.push({ kind, at: delay }); delay += 0.6; }
  }

  // ── 적 만들기: 화면 밖 둘레에서
  function spawn(kind) {
    const p = S.p, D = FOE[kind];
    const a = rnd(0, TAU), r = kind === 'boss' ? 1000 : rnd(950, 1150);
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    const f = { kind, x, y, vx: 0, vy: 0, a: a + Math.PI, hp: D.hp, max: D.hp, r: D.r, hit: 0, cd: rnd(1, 2), st: 'chase', stT: 0, ph: Math.random() * 10, ram: 0 };
    if (kind === 'hawk') { f.st = 'circle'; f.stT = rnd(1.5, 2.5); f.orbit = Math.random() < 0.5 ? 1 : -1; }
    if (kind === 'boss') { f.st = 'enter'; f.pat = 0; f.patT = 0; f.spin = 0; }
    S.foes.push(f);
    return f;
  }

  // ── 총알 · 이펙트
  function burst(x, y, n, col, spd = 260, size = 10, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), s = rnd(0.3, 1) * spd;
      S.fx.push({ type: 'puff', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(0.6, 1.2) * size, life, t: 0, col });
    }
  }
  function boom(x, y, big = 1) {
    S.fx.push({ type: 'ring', x, y, r: 20 * big, life: 0.35, t: 0 });
    burst(x, y, 10 * big, '#ffcf5a', 320 * big, 16 * big, 0.45);
    burst(x, y, 8 * big, '#ef6a3c', 240 * big, 14 * big, 0.55);
    burst(x, y, 6 * big, '#8d8f99', 120 * big, 22 * big, 0.9);
    S.cam.shake = Math.max(S.cam.shake, 10 * big);
  }
  function eshot(x, y, a, spd, opts = {}) {
    S.eshots.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: opts.r || 11, col: opts.col || '#ff5c8a', life: opts.life || 4, t: 0, dmg: opts.dmg || 8, ball: !!opts.ball });
  }
  // 움직이는 대상 앞지르기: 탄속 s 로 쐈을 때 만나는 곳
  function lead(from, to, s) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const t = Math.hypot(dx, dy) / s;
    return Math.atan2(dy + to.vy * t, dx + to.vx * t);
  }
  function hurt(d, src) {
    const p = S.p;
    if (p.inv > 0 || S.over) return;
    if (qs.has('god')) d = 0;
    S.taken += d; S.dmgBy[src] = (S.dmgBy[src] || 0) + d;
    p.hp -= d; p.hurt = 0; p.inv = 0.4;
    S.cam.shake = Math.max(S.cam.shake, 14);
    burst(p.x, p.y, 8, '#ffffff', 220, 9, 0.35);
    if (p.hp <= 0) { p.hp = 0; boom(p.x, p.y, 1.6); endGame(false); }
  }

  // ── 플레이어
  function updPlayer(dt) {
    const p = S.p;
    const want = wantDir();
    const boosting = input.boost && p.boost > 0.05;
    const prevA = p.a;
    if (want != null) p.a = turnTo(p.a, want, (boosting ? T.turnBoost : T.turn) * dt);
    p.bank = lerp(p.bank, clamp(angDiff(prevA, p.a) / dt / T.turn, -1, 1), 1 - Math.exp(-8 * dt)); // 선회할 때 기울임
    if (boosting) p.boost = Math.max(0, p.boost - dt); else p.boost = Math.min(T.boostMax, p.boost + dt * T.boostRecover);
    const sp = boosting ? T.boostSpeed : T.speed;
    const k = 1 - Math.exp(-T.accel * dt);
    p.vx = lerp(p.vx, Math.cos(p.a) * sp, k);
    p.vy = lerp(p.vy, Math.sin(p.a) * sp, k);
    p.x += p.vx * dt; p.y += p.vy * dt;
    // 조준 = 마우스가 가리키는 월드 위치
    p.aim = Math.atan2(input.my - VH / 2 + S.cam.y - p.y, input.mx - VW / 2 + S.cam.x - p.x);
    p.cd -= dt;
    p.noFire += dt;
    if (input.fire && !S.over) {
      p.noFire = 0;
      if (p.cd <= 0) {
        p.cd = 1 / T.fireRate;
        const a = p.aim + rnd(-0.03, 0.03);
        const nx = p.x + Math.cos(p.aim) * 40, ny = p.y + Math.sin(p.aim) * 40;
        S.shots.push({ x: nx, y: ny, vx: Math.cos(a) * T.bulletSpd + p.vx * T.inherit, vy: Math.sin(a) * T.bulletSpd + p.vy * T.inherit, life: 0.8, t: 0 });
        p.flash = 0.05;
      }
    }
    p.flash -= dt;
    if (p.noFire > T.regenDelay && p.hurt > T.regenDelay) p.hp = Math.min(T.hp, p.hp + T.regen * dt);
    p.hurt += dt; p.inv -= dt;
    // 비행운
    if (Math.random() < dt * (boosting ? 40 : 12)) {
      S.fx.push({ type: 'puff', x: p.x - Math.cos(p.a) * 70, y: p.y - Math.sin(p.a) * 70, vx: -p.vx * 0.1, vy: -p.vy * 0.1, r: boosting ? 10 : 6, life: 0.7, t: 0, col: 'rgba(255,255,255,.7)' });
    }
  }

  // ── 적
  function updFoe(f, dt) {
    const p = S.p, D = FOE[f.kind];
    f.hit -= dt; f.stT -= dt; f.cd -= dt; f.ph += dt; f.ram -= dt;
    const d = dist(f, p);
    if (f.kind === 'cat') {
      // 꼬리 물기: 플레이어를 앞질러 겨냥, 너무 붙으면 잠깐 이탈
      let want = lead(f, p, 520);
      if (f.st === 'break') { want = f.breakA; if (f.stT <= 0) f.st = 'chase'; }
      else if (d < 260) { f.st = 'break'; f.stT = 1.2; f.breakA = f.a + (Math.random() < 0.5 ? 1.6 : -1.6); }
      f.a = turnTo(f.a, want, D.turn * dt);
      const s = D.speed * (1 + 0.25 * Math.sin(f.ph * 0.9));
      f.vx = Math.cos(f.a) * s; f.vy = Math.sin(f.a) * s;
      if (f.st === 'chase' && d < 750 && Math.abs(angDiff(f.a, lead(f, p, 520))) < 0.22 && f.cd <= 0) {
        f.cd = rnd(1.4, 2.2);
        f.burst = 3; f.burstT = 0;
      }
      if (f.burst > 0) { f.burstT -= dt; if (f.burstT <= 0) { f.burst--; f.burstT = 0.11; eshot(f.x + Math.cos(f.a) * 55, f.y + Math.sin(f.a) * 55, f.a, 520, { col: '#ff8a3d' }); } }
    } else if (f.kind === 'hawk') {
      // 빙빙 돌다 → 노려봄(예고, 노릴 곳 고정) → 급강하 → 빠져나감. 한 번에 한 마리만
      if (f.st === 'circle') {
        const oa = Math.atan2(f.y - p.y, f.x - p.x) + f.orbit * 1.8 * dt;
        const want = Math.atan2(p.y + Math.sin(oa) * 430 - f.y, p.x + Math.cos(oa) * 430 - f.x);
        f.a = turnTo(f.a, want, D.turn * dt);
        f.vx = Math.cos(f.a) * D.speed; f.vy = Math.sin(f.a) * D.speed;
        if (f.stT <= 0 && d < 800 && !S.foes.some((o) => o.kind === 'hawk' && (o.st === 'aim' || o.st === 'dive'))) {
          f.st = 'aim'; f.stT = 0.9;
          const t = 0.9 + d / 820;
          f.aim = { x: p.x + p.vx * t, y: p.y + p.vy * t };
        }
      } else if (f.st === 'aim') {
        f.vx *= Math.exp(-4 * dt); f.vy *= Math.exp(-4 * dt);
        f.a = turnTo(f.a, Math.atan2(f.aim.y - f.y, f.aim.x - f.x), 8 * dt);
        if (f.stT <= 0) { f.st = 'dive'; f.stT = 0.8; f.vx = Math.cos(f.a) * 820; f.vy = Math.sin(f.a) * 820; }
      } else if (f.st === 'dive') {
        if (f.stT <= 0) { f.st = 'circle'; f.stT = rnd(1.8, 3); }
        if (d < f.r + 20) { hurt(10, 'dive'); f.st = 'circle'; f.stT = 2.5; f.a += Math.PI; }
      }
    } else if (f.kind === 'boss') {
      updBoss(f, dt, d);
    }
    f.x += f.vx * dt; f.y += f.vy * dt;
    // 몸통 박치기
    if (f.kind !== 'boss' && d < f.r + 36 && f.ram <= 0) { f.ram = 1; hurt(5, 'ram'); }
  }

  function updBoss(f, dt, d) {
    const p = S.p;
    const rage = f.hp < f.max * 0.5;
    // 플레이어에게서 일정 거리를 두고 천천히 맴돌며 늘 플레이어 쪽을 봄
    const ang = Math.atan2(f.y - p.y, f.x - p.x) + 0.25 * dt;
    const R = 470;
    const tx = p.x + Math.cos(ang) * R, ty = p.y + Math.sin(ang) * R;
    const k = f.st === 'enter' ? 1.2 : 0.6;
    f.vx = lerp(f.vx, clamp((tx - f.x) * k, -280, 280), 1 - Math.exp(-1.5 * dt));
    f.vy = lerp(f.vy, clamp((ty - f.y) * k, -280, 280), 1 - Math.exp(-1.5 * dt));
    f.a = turnTo(f.a, Math.atan2(p.y - f.y, p.x - f.x), 0.9 * dt);
    if (f.st === 'enter') { if (d < 800) { f.st = 'fight'; f.patT = 1.2; } return; }
    f.patT -= dt;
    const ca = Math.cos(f.a), sa = Math.sin(f.a);
    if (f.patT <= 0) { f.pat = (f.pat + 1) % 3; f.patT = [3.2, 3.6, 2.2][f.pat]; f.cd = 0; }
    if (f.pat === 0) {
      // 대포 두 문: 플레이어가 갈 곳으로 큰 대포알
      if (f.cd <= 0) {
        f.cd = rage ? 0.42 : 0.7;
        f.side = -(f.side || 1);
        const gun = { x: f.x + ca * 200 - sa * 40 * f.side, y: f.y + sa * 200 + ca * 40 * f.side, vx: f.vx, vy: f.vy };
        eshot(gun.x, gun.y, lead(gun, p, 480) + rnd(-0.06, 0.06), 480, { r: 17, col: '#3b3f4a', dmg: 10, ball: true, life: 5 });
        burst(gun.x, gun.y, 4, '#c9c4b8', 120, 12, 0.5);
      }
    } else if (f.pat === 1) {
      // 나선 탄막 (동방식)
      if (f.cd <= 0) {
        f.cd = rage ? 0.11 : 0.16;
        f.spin += rage ? 0.37 : 0.29;
        const n = rage ? 3 : 2;
        for (let i = 0; i < n; i++) eshot(f.x, f.y, f.spin + (i * TAU) / n, 250, { r: 13, col: i % 2 ? '#7aa8ff' : '#ff5c8a', life: 6 });
      }
    } else {
      // 원형 탄 + 졸개 고양이
      if (f.cd <= 0) {
        f.cd = 9;
        const n = rage ? 24 : 16, off = rnd(0, TAU);
        for (let i = 0; i < n; i++) eshot(f.x, f.y, off + (i * TAU) / n, 290, { r: 14, col: '#ffd45c' });
        const cats = S.foes.filter((o) => o.kind === 'cat').length;
        if (cats < 3) for (let i = 0; i < (rage ? 2 : 1); i++) { const c = spawn('cat'); c.x = f.x - ca * 150; c.y = f.y - sa * 150; c.a = f.a + Math.PI + rnd(-0.5, 0.5); }
      }
    }
  }
  // 보스 판정 = 비행선 몸통 타원 (기수 방향으로 김)
  function hitFoe(f, x, y, pad = 0) {
    if (f.kind !== 'boss') return Math.hypot(x - f.x, y - f.y) < f.r + pad;
    const dx = x - f.x, dy = y - f.y, c = Math.cos(f.a), s = Math.sin(f.a);
    const u = (dx * c + dy * s) / (230 + pad), v = (-dx * s + dy * c) / (95 + pad);
    return u * u + v * v < 1;
  }
  function killFoe(f) {
    const D = FOE[f.kind];
    S.kills++;
    boom(f.x, f.y, f.kind === 'boss' ? 3 : 1);
    for (let i = 0; i < D.gear; i++) drop('gear', f);
    for (let i = 0; i < D.coin; i++) drop('coin', f);
    if (Math.random() < (f.kind === 'boss' ? 1 : 0.15)) drop('wrench', f);
    if (f.kind === 'boss') { S.foes.forEach((o) => { if (o !== f && o.hp > 0) { o.hp = 0; boom(o.x, o.y); } }); S.eshots = []; S.winAt = S.t + 1.8; }
  }
  function drop(type, f) {
    const a = rnd(0, TAU), s = rnd(80, 280);
    S.drops.push({ type, x: f.x, y: f.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, ph: rnd(0, TAU) });
  }

  // ── 한 프레임
  function update(dt) {
    S.t += dt;
    S.bannerT -= dt;
    if (!S.over) updPlayer(dt);
    if (S.pending) {
      S.waveT += dt;
      S.pending = S.pending.filter((q) => { if (S.waveT >= q.at) { spawn(q.kind); return false; } return true; });
      if (!S.pending.length) S.pending = null;
    }
    for (const f of S.foes) updFoe(f, dt);
    // 내 총알
    for (const b of S.shots) {
      b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      for (const f of S.foes) {
        if (f.hp > 0 && f.st !== 'enter' && hitFoe(f, b.x, b.y, 6)) {
          f.hp -= T.bulletDmg; f.hit = 0.08; b.t = 99;
          S.fx.push({ type: 'spark', x: b.x, y: b.y, life: 0.12, t: 0, a: Math.atan2(b.vy, b.vx) });
          if (f.hp <= 0) killFoe(f);
          break;
        }
      }
    }
    S.shots = S.shots.filter((b) => b.t < b.life);
    S.foes = S.foes.filter((f) => f.hp > 0);
    // 적 총알
    const p = S.p;
    for (const b of S.eshots) {
      b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (!S.over && Math.hypot(b.x - p.x, b.y - p.y) < b.r + 24) { hurt(b.dmg, b.ball ? 'cannon' : 'bullet'); b.t = 99; }
    }
    S.eshots = S.eshots.filter((b) => b.t < b.life);
    // 떨어진 재료: 가까우면 끌려옴
    for (const q of S.drops) {
      q.t += dt;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
      if (q.t > 0.35 && d < 280 && !S.over) { q.vx = lerp(q.vx, dx / d * 900, 1 - Math.exp(-8 * dt)); q.vy = lerp(q.vy, dy / d * 900, 1 - Math.exp(-8 * dt)); }
      else { q.vx *= Math.exp(-2.5 * dt); q.vy *= Math.exp(-2.5 * dt); }
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (d < 40 && !S.over) {
        q.t = 99;
        if (q.type === 'gear') S.gear++; else if (q.type === 'coin') S.coin++; else p.hp = Math.min(T.hp, p.hp + 25);
        S.fx.push({ type: 'pop', x: q.x, y: q.y, life: 0.25, t: 0 });
      }
    }
    S.drops = S.drops.filter((q) => q.t < 14);
    for (const e of S.fx) { e.t += dt; if (e.vx != null) { e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= Math.exp(-3 * dt); e.vy *= Math.exp(-3 * dt); } }
    S.fx = S.fx.filter((e) => e.t < e.life);
    if (S.winAt && S.t >= S.winAt) { S.winAt = 0; endGame(true); }
    if (!S.over && !S.pending && !S.foes.length && S.wave < S.st.waves.length - 1) startWave(S.wave + 1);
    // 카메라: 플레이어 중심 + 조준 쪽으로 조금
    const c = S.cam;
    const ax = (input.mx - VW / 2) * 0.18, ay = (input.my - VH / 2) * 0.18;
    c.x = lerp(c.x, p.x + p.vx * 0.15 + ax, 1 - Math.exp(-5 * dt));
    c.y = lerp(c.y, p.y + p.vy * 0.15 + ay, 1 - Math.exp(-5 * dt));
    c.shake *= Math.exp(-8 * dt);
  }

  // ── 그리기
  function sprite(name, i, x, y, a, sx = 1, sy = 1, filter = null, shadow = false) {
    const f = SP[name][i];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(sx, sy);
    if (filter) ctx.filter = filter;
    ctx.drawImage(shadow ? f.shadow : f.im, -f.w / 2, -f.h / 2, f.w, f.h);
    ctx.restore();
  }
  // 하늘을 나는 것들의 그림자 (바다 위, 오른쪽 아래로 어긋나게)
  function shadowOf(name, i, x, y, a, sx = 1, sy = 1) {
    ctx.globalAlpha = 0.22;
    sprite(name, i, x + T.shadow[0], y + T.shadow[1], a, sx * 0.92, sy * 0.92, null, true);
    ctx.globalAlpha = 1;
  }

  // 바다: 바탕색 + 깊은 물 얼룩 + 섬 + 물결 (칸마다 고정 난수)
  function drawSea(bg, c) {
    const x0 = c.x - VW / 2 - 40, y0 = c.y - VH / 2 - 40, x1 = x0 + VW + 80, y1 = y0 + VH + 80;
    ctx.fillStyle = bg.color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const G = 700;
    ctx.fillStyle = bg.deep;
    for (let gx = Math.floor(x0 / G) - 1; gx <= Math.floor(x1 / G) + 1; gx++) for (let gy = Math.floor(y0 / G) - 1; gy <= Math.floor(y1 / G) + 1; gy++) {
      const h = hash(gx, gy, 3);
      if (h > 0.55) continue;
      ctx.beginPath();
      ctx.ellipse(gx * G + hash(gx, gy, 4) * G, gy * G + hash(gx, gy, 5) * G, 220 + h * 300, 120 + h * 160, h * 3, 0, TAU);
      ctx.fill();
    }
    const I = 1500;
    for (let gx = Math.floor(x0 / I) - 1; gx <= Math.floor(x1 / I) + 1; gx++) for (let gy = Math.floor(y0 / I) - 1; gy <= Math.floor(y1 / I) + 1; gy++) {
      if ((gx === 0 && gy === 0) || hash(gx, gy, 7) > bg.islands) continue;
      const i = Math.floor(hash(gx, gy, 8) * SP.islands.length);
      const s = 0.7 + hash(gx, gy, 9) * 0.6;
      sprite('islands', i, gx * I + 300 + hash(gx, gy, 10) * (I - 600), gy * I + 300 + hash(gx, gy, 11) * (I - 600), hash(gx, gy, 12) * TAU, s, s);
    }
    // 물결: 짧은 흰 줄이 천천히 반짝
    const Wg = 120;
    ctx.strokeStyle = bg.wave; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let gx = Math.floor(x0 / Wg); gx <= Math.floor(x1 / Wg); gx++) for (let gy = Math.floor(y0 / Wg); gy <= Math.floor(y1 / Wg); gy++) {
      const h = hash(gx, gy, 1);
      if (h > 0.35) continue;
      const ph = Math.sin(S.t * 1.6 + h * 40);
      if (ph < 0) continue;
      const x = gx * Wg + hash(gx, gy, 2) * Wg, y = gy * Wg + h * Wg * 2.5, l = 10 + ph * 16;
      ctx.moveTo(x - l, y); ctx.quadraticCurveTo(x, y - 5, x + l, y);
    }
    ctx.stroke();
  }

  // 구름: 플레이어보다 위 높이 → 화면에서 더 빨리 지나감 (k > 1), 바다에 그림자
  const CLOUDS = [];
  for (let i = 0; i < 14; i++) CLOUDS.push({ x: rnd(0, 6000), y: rnd(0, 6000), s: rnd(0.8, 1.5), i: i % 4, a: rnd(-0.2, 0.2) });
  function cloudPos(cl, c, k) {
    const P = 6000;
    const x = ((cl.x - c.x * k) % P + P) % P - P / 2 + VW / 2;
    const y = ((cl.y - c.y * k) % P + P) % P - P / 2 + VH / 2;
    return [x, y];
  }
  function eachCloud(c, fn) {
    for (const cl of CLOUDS) {
      const [x, y] = cloudPos(cl, c, 1.25);
      const f = SP.clouds[cl.i], w = f.w * cl.s, h = f.h * cl.s;
      if (x < -w - 150 || x > VW + w + 150 || y < -h - 150 || y > VH + h + 150) continue;
      fn(cl, f, x, y, w, h);
    }
  }
  function drawCloudShadows(c) {
    ctx.globalAlpha = 0.12;
    eachCloud(c, (cl, f, x, y, w, h) => { ctx.save(); ctx.translate(x + 70, y + 110); ctx.rotate(cl.a); ctx.drawImage(f.shadow, -w / 2, -h / 2, w, h); ctx.restore(); });
    ctx.globalAlpha = 1;
  }
  function drawClouds(c) {
    ctx.globalAlpha = 0.6;
    eachCloud(c, (cl, f, x, y, w, h) => { ctx.save(); ctx.translate(x, y); ctx.rotate(cl.a); ctx.drawImage(f.im, -w / 2, -h / 2, w, h); ctx.restore(); });
    ctx.globalAlpha = 1;
  }

  function draw() {
    const c = S.cam, p = S.p;
    ctx.setTransform(view.k, 0, 0, view.k, 0, 0);
    const sx = (Math.random() - 0.5) * c.shake, sy = (Math.random() - 0.5) * c.shake;
    ctx.save();
    ctx.translate(VW / 2 - c.x + sx, VH / 2 - c.y + sy);
    if (S.st.bg.type === 'sea') drawSea(S.st.bg, c);
    ctx.restore();
    drawCloudShadows(c);

    ctx.save();
    ctx.translate(VW / 2 - c.x + sx, VH / 2 - c.y + sy);
    // 그림자 먼저 (모두 바다 위)
    for (const f of S.foes) foeSprite(f, true);
    if (!S.over || S.win) shadowOf('player', 0, p.x, p.y, p.a, 1, 1 - Math.abs(p.bank) * 0.25);
    for (const q of S.drops) {
      const i = q.type === 'gear' ? 0 : q.type === 'coin' ? 1 : 2;
      const bob = Math.sin(S.t * 4 + q.ph) * 3;
      if (!(q.t > 11 && Math.sin(q.t * 20) > 0)) sprite('items', i, q.x, q.y + bob, q.type === 'gear' ? S.t * 2 : 0, 0.9, 0.9);
    }
    for (const f of S.foes) foeSprite(f, false);
    // 적 총알: 동방식 둥근 탄 (테두리색 + 흰 속)
    for (const b of S.eshots) {
      ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = b.ball ? 'rgba(255,255,255,.35)' : '#fff';
      ctx.beginPath();
      if (b.ball) ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.35, 0, TAU); else ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU);
      ctx.fill();
    }
    // 플레이어
    if (!S.over || S.win) {
      const blink = p.inv > 0 && Math.sin(S.t * 60) > 0;
      sprite('player', 0, p.x, p.y, p.a, 1, 1 - Math.abs(p.bank) * 0.25, blink ? 'brightness(2)' : null);
      if (p.flash > 0) {
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath(); ctx.arc(p.x + Math.cos(p.aim) * 44, p.y + Math.sin(p.aim) * 44, 11, 0, TAU); ctx.fill();
      }
    }
    // 내 총알: 짧은 노란 줄
    ctx.lineCap = 'round';
    for (const b of S.shots) {
      const l = 0.022;
      ctx.strokeStyle = '#fff6c2'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#ffb627'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const e of S.fx) drawFx(e);
    ctx.restore();
    drawClouds(c);
    drawHud();
  }

  function foeSprite(f, shadow) {
    const white = !shadow && f.hit > 0 ? (f.kind === 'boss' ? 'brightness(1.18)' : 'brightness(1.6)') : null; // 맞으면 살짝 밝게
    const put = shadow ? shadowOf : (n, i, x, y, a, sx, sy) => sprite(n, i, x, y, a, sx, sy, white);
    if (f.kind === 'cat') put('e_cat', 0, f.x, f.y, f.a, 1, 1);
    else if (f.kind === 'hawk') {
      const fr = f.st === 'dive' ? 1 : (Math.sin(f.ph * 13) > 0 ? 0 : 1);
      const a = f.st === 'dive' ? Math.atan2(f.vy, f.vx) : f.a;
      put('e_hawk', fr, f.x, f.y, a, 1, 1);
      if (!shadow && f.st === 'aim' && f.aim) {
        // 급강하 예고: 노리는 곳까지 점선 + 과녁
        ctx.save();
        ctx.setLineDash([14, 12]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(230,60,60,.75)';
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.aim.x, f.aim.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(f.aim.x, f.aim.y, 34 + Math.sin(S.t * 20) * 4, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    } else if (f.kind === 'boss') {
      put('boss', 0, f.x, f.y, f.a + Math.sin(f.ph * 0.8) * 0.02, 1, 1);
    }
  }

  function drawFx(e) {
    const k = e.t / e.life;
    if (e.type === 'puff') {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = e.col;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 + k * 0.6), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (e.type === 'ring') {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 8 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + k * e.r * 5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.type === 'spark') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.a);
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#fff6c2';
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(0, -7); ctx.lineTo(10, 0); ctx.lineTo(0, 7); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    } else if (e.type === 'pop') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, 12 + k * 26, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function bar(x, y, w, h, v, col, back = 'rgba(0,0,0,.35)') {
    ctx.fillStyle = back; roundRect(x, y, w, h, h / 2); ctx.fill();
    if (v > 0) { ctx.fillStyle = col; roundRect(x, y, Math.max(h, w * v), h, h / 2); ctx.fill(); }
  }

  function drawHud() {
    const p = S.p, W = S.st.waves;
    ctx.textBaseline = 'middle';
    // 체력 · 부스트
    ctx.fillStyle = 'rgba(25,35,50,.45)'; roundRect(20, 18, 380, 78, 16); ctx.fill();
    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText('체력', 36, 42);
    bar(92, 32, 290, 20, p.hp / T.hp, p.hp < 30 ? '#ff5a4e' : '#ff8f6b');
    if (p.noFire > T.regenDelay && p.hurt > T.regenDelay && p.hp < T.hp) { ctx.fillStyle = '#b6ffb0'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('회복 중', 300, 42); }
    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('부스트', 36, 74);
    bar(112, 66, 270, 14, p.boost / T.boostMax, '#7fd3ff');
    // 재료
    ctx.fillStyle = 'rgba(25,35,50,.45)'; roundRect(VW - 260, 18, 240, 56, 16); ctx.fill();
    sprite('items', 0, VW - 228, 46, 0, 0.75, 0.75);
    sprite('items', 1, VW - 118, 46, 0, 0.75, 0.75);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText(S.gear, VW - 200, 47); ctx.fillText(S.coin, VW - 90, 47);
    // 웨이브
    ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillText(S.wave === W.length - 1 ? 'BOSS' : `WAVE ${S.wave + 1} / ${W.length - 1}`, VW / 2, 34);
    if (S.bannerT > 0) {
      const a = clamp(S.bannerT / 0.4, 0, 1) * clamp((2.4 - S.bannerT) / 0.25, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(25,35,50,.5)'; ctx.fillRect(0, VH * 0.3 - 44, VW, 88);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 54px sans-serif'; ctx.fillText(S.banner, VW / 2, VH * 0.3);
      ctx.globalAlpha = 1;
    }
    // 보스 체력
    const boss = S.foes.find((f) => f.kind === 'boss');
    if (boss) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(S.st.bossName, VW / 2, VH - 62);
      bar(VW / 2 - 400, VH - 44, 800, 18, boss.hp / boss.max, boss.hp < boss.max / 2 ? '#ff4f6d' : '#ffb03b');
    }
    // 화면 밖 적 화살표
    for (const f of S.foes) {
      const dx = f.x - S.cam.x, dy = f.y - S.cam.y;
      if (Math.abs(dx) < VW / 2 - 20 && Math.abs(dy) < VH / 2 - 20) continue;
      const a = Math.atan2(dy, dx);
      const s = Math.min((VW / 2 - 40) / Math.abs(Math.cos(a) || 1e-6), (VH / 2 - 40) / Math.abs(Math.sin(a) || 1e-6));
      const x = VW / 2 + Math.cos(a) * s, y = VH / 2 + Math.sin(a) * s;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = f.kind === 'boss' ? '#ff4f6d' : f.kind === 'hawk' ? '#c8873a' : '#ff9a3d';
      const z = f.kind === 'boss' ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(18 * z, 0); ctx.lineTo(-10 * z, -13 * z); ctx.lineTo(-4 * z, 0); ctx.lineTo(-10 * z, 13 * z); ctx.fill();
      ctx.restore();
    }
    // 조준점
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(input.mx, input.my, 14, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(input.mx - 22, input.my); ctx.lineTo(input.mx - 8, input.my); ctx.moveTo(input.mx + 8, input.my); ctx.lineTo(input.mx + 22, input.my);
    ctx.moveTo(input.mx, input.my - 22); ctx.lineTo(input.mx, input.my - 8); ctx.moveTo(input.mx, input.my + 8); ctx.lineTo(input.mx, input.my + 22); ctx.stroke();
    if (paused) { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, VW, VH); ctx.fillStyle = '#fff'; ctx.font = 'bold 50px sans-serif'; ctx.fillText('일시정지 (P)', VW / 2, VH / 2); }
  }

  // ── 시작 · 끝
  let running = false;
  function endGame(win) {
    if (S.over) return;
    S.over = true; S.win = win;
    setTimeout(() => {
      $('#resTitle').textContent = win ? '스테이지 클리어!' : '격추당했다…';
      $('#resText').innerHTML = `${win ? `${S.st.bossName} 격파` : `WAVE ${S.wave + 1}에서 추락`}<br>처치 ${S.kills} · 톱니 ${S.gear} · 치즈 코인 ${S.coin}<br><small>(재료로 하는 비행기 업그레이드는 다음 단계)</small>`;
      $('#result').classList.add('on');
    }, win ? 200 : 1300);
  }
  function start() {
    $('#title').classList.remove('on');
    $('#result').classList.remove('on');
    newGame(clamp(Number(qs.get('wave') || 1) - 1, 0, STAGES[stageIdx].waves.length - 1));
    running = true;
  }
  $('#startBtn').addEventListener('click', start);
  $('#againBtn').addEventListener('click', start);

  newGame(0);
  if (qs.has('go') || qs.has('wave')) start();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (running && !paused) update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // 확인용: 상태 보기 · 화면 없이 시간 돌리기 (창이 가려져 rAF 가 느려도 시험 가능)
  window.__S = () => S;
  window.__input = input;
  window.__step = (sec, fn) => { for (let t = 0; t < sec; t += 1 / 60) { if (fn) fn(S); update(1 / 60); } draw(); };
})();
