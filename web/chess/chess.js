// 기사 쥐 체스 — 로그라이크 덱빌딩 & 체스말 피규어 판 위 전투
//  판 = 위에서 비스듬히 본 8×8 (3D 원근 + 체크무늬 보드)
//  기물 = 체스말을 쥐 · 고양이로 변형한 체스 피규어 (art/chess/fig/*.png) + 3D 받침대
//  로그라이크: 기본 병사(들쥐 폰) 8명으로 시작, 판마다 영구 결손(Permadeath), 클리어 시 말 영입/강화/회복 선택!

(async function () {
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), ctx = cv.getContext('2d'), wrap = $('#wrap');
  const W = 1600, H = 900, N = 8;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rad = (d) => d * Math.PI / 180;
  const ease = (u) => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;

  function fit() { const k = Math.min(innerWidth / W, innerHeight / H); wrap.style.transform = `translate(-50%, -50%) scale(${k})`; }
  addEventListener('resize', fit); fit();
  const mouse = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };

  // ───────── 기물 정의 & 스킬 데이터
  const TYPES = {
    king:   { name: '왕', mark: '♚' },
    queen:  { name: '여왕', mark: '♛' },
    knight: { name: '나이트', mark: '♞' },
    bishop: { name: '비숍', mark: '♝' },
    rook:   { name: '룩', mark: '♜' },
    pawn:   { name: '폰', mark: '♟' },
  };

  const UNITS = {
    ally: {
      pawn:   { art: 'fieldmouse', name: '들쥐 병사', hp: 1, atk: 1, abil: '끝 줄 도달 시 기사/비숍/룩/퀸 승급', skillName: '돌격 찌르기', skillDesc: '앞 1칸의 적을 이동하지 않고 직접 찌릅니다.', skillCd: 2 },
      knight: { art: 'knight', name: '기사 쥐', hp: 3, atk: 2, abil: '기병 돌격: 적 처치 시 1회 추가 이동', skillName: '성검 해방', skillDesc: '전방 2칸 직선 관통 공격을 가합니다.', skillCd: 3 },
      bishop: { art: 'wizard', name: '마법사 쥐', hp: 2, atk: 1, abil: '마력 탄환: 대각선 2칸 적을 제자리에서 사격', skillName: '화염구', skillDesc: '지정 칸 및 십자 주변 칸에 화염 폭발을 일으킵니다.', skillCd: 3 },
      rook:   { art: 'viking', name: '바이킹 쥐', hp: 3, atk: 2, abil: '방패벽: 판마다 최초 1회 피격 피해 무효', skillName: '성벽 돌진', skillDesc: '직선으로 돌진하며 부딪힌 적에게 피해 + 1칸 밀침.', skillCd: 3 },
      queen:  { art: 'ratqueen', name: '쥐 여왕', hp: 3, atk: 2, abil: '우아함: 공격 후 인접 빈 칸으로 재배치 가능', skillName: '왕실 칙령', skillDesc: '적 1기를 1턴간 결박하여 행동 불가로 만듭니다.', skillCd: 3 },
      king:   { art: 'ratking', name: '쥐 왕', hp: 4, atk: 2, abil: '왕의 위엄: 인접 아군 피격 시 피해 -1', skillName: '왕의 호령', skillDesc: '이번 전투 동안 모든 아군의 공격력을 +1 합니다.', skillCd: 4 },
    },
    foe: {
      pawn:   { art: 'cat_pawn', name: '식빵 고양이', hp: 1, atk: 1, abil: '체스 폰: 전진 및 대각선 타격' },
      knight: { art: 'cat_knight', name: '닌자 고양이', hp: 2, atk: 2, abil: '기습: 나이트 L자 도약 공격' },
      bishop: { art: 'cat_bishop', name: '불 마법 고양이', hp: 2, atk: 2, abil: '화염술: 대각선 원거리 화염탄' },
      rook:   { art: 'cat_rook', name: '성채 고양이', hp: 3, atk: 2, abil: '단단함: 룩 돌진 및 높은 내구도' },
      queen:  { art: 'cat_queen', name: '마녀 고양이', hp: 3, atk: 2, abil: '저주: 흑마법 원거리 타격' },
      king:   { art: 'cat_king', name: '독재 고양이 킹', hp: 6, atk: 2, abil: '철권 통치: 3턴마다 식빵 고양이 폰 소환' },
    }
  };

  const PX = 0.0034, FOOT = 0.045;

  // ───────── 그림 · 이펙트 불러오기
  const IMG = {}, FIG = {};
  const opt = (src) => loadImage(src).catch(() => null);
  const jobs = [];

  for (const side of Object.values(UNITS)) {
    for (const u of Object.values(side)) {
      jobs.push(loadImage(`../../art/chess/fig/${u.art}.png`).then((x) => (FIG[u.art] = x)));
    }
  }
  jobs.push(opt('../../art/chess/board.png').then((x) => (IMG.board = x)));
  jobs.push(opt('../../art/chess/wall.png').then((x) => (IMG.wall = x)));
  jobs.push(opt('../../art/chess/bg.png').then((x) => (IMG.bg = x)));
  jobs.push(opt('../../art/stages/stage1.png').then((x) => (IMG.stage = x)));
  jobs.push(loadImage('../../art/fx/heart.png').then((x) => (IMG.heart = x)));

  const FX = {};
  for (const n of ['hit1', 'hit2', 'hit3', 'sparks', 'arc', 'slash', 'burst', 'charge', 'wave', 'beam', 'ripple', 'lightring']) {
    jobs.push(opt(`../../art/fx/k/fx_${n}.png`).then((x) => (FX['k_' + n] = x)));
  }
  for (const n of ['fireball', 'flame', 'bolt_b', 'puff', 'smoke', 'crumbs']) {
    jobs.push(opt(`../../art/fx/${n}.png`).then((x) => (FX[n] = x)));
  }
  for (const k of ['explosion', 'poof']) {
    for (let i = 1; i <= 6; i++) jobs.push(opt(`../../art/fx/${k}_${i}.png`).then((x) => (FX[`${k}_${i}`] = x)));
  }

  await Promise.all(jobs);

  // ───────── 카메라 · 3D 투시
  const cam = { yaw: 0, pitch: 46, ty: 0, tp: 46, D: 15, F: 1500, cx: 800, cy: 470, z: 1, focus: null, fx: 0, fz: 0 };
  const P3 = (X, Y, Z) => {
    const c = Math.cos(rad(cam.yaw)), s = Math.sin(rad(cam.yaw)), cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
    const xr = X * c + Z * s, zr = -X * s + Z * c;
    const up = zr * sp + Y * cp, depth = cam.D + zr * cp - Y * sp, k = cam.F / depth;
    return [cam.cx + xr * k, cam.cy - up * k, k, depth];
  };
  const cellXZ = (col, row) => [col - 3.5, row - 3.5];

  function unproject(sx, sy) {
    const cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch)), c = Math.cos(rad(cam.yaw)), s = Math.sin(rad(cam.yaw));
    const v = (cam.cy - sy) / cam.F, zr = v * cam.D / (sp - v * cp), depth = cam.D + zr * cp, xr = (sx - cam.cx) / cam.F * depth;
    return [xr * c - zr * s, xr * s + zr * c];
  }

  function autofit() {
    cam.F = 1000; cam.cy = 450; cam.cx = 800;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [X, Z] of [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]]) {
      for (const Y of [0, -1.05]) { const [x, y] = P3(X, Y, Z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    for (const [X, Z] of [[-3.5, 3.5], [3.5, 3.5]]) {
      const [x, y] = P3(X, 2.0, Z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const k = Math.min((W - 160) / (x1 - x0), (H - 120) / (y1 - y0));
    cam.F *= k;
    cam.cx = 800 - ((x0 + x1) / 2 - 800) * k;
    cam.cy = 450 - ((y0 + y1) / 2 - 450) * k + 34;
  }

  // ───────── 증강 (2 · 4층을 깨면 3개 중 1개, 런 끝날 때까지 유지). 그림 = art/chess/aug/<id>.png (ChatGPT)
  const AUGS = {
    cheeseArmor: { name: '치즈 갑옷', desc: '모든 아군 최대 체력 +1 (매 판 시작 시)' },
    sharpFangs:  { name: '날카로운 앞니', desc: '모든 아군 공격력 +1' },
    firstStrike: { name: '선제 돌격', desc: '판마다 아군의 첫 공격 피해 +2' },
    mousehole:   { name: '쥐구멍 증원', desc: '판마다 임시 들쥐 병사 2명이 함께 싸움 (덱에는 안 남음)' },
    knightHonor: { name: '기사의 명예', desc: '아군이 적을 쓰러뜨리면 체력 1 회복' },
    warDrum:     { name: '전쟁 북', desc: '모든 스킬 쿨다운 −1 (최소 1)' },
    holyGrail:   { name: '성배', desc: '판을 이기면 살아남은 기물 전원 체력 완전 회복' },
    thornArmor:  { name: '가시 갑옷', desc: '아군이 맞고 살아남으면 공격한 적에게 1 피해' },
    catTrap:     { name: '고양이 덫', desc: '판 시작 시 적 2마리 체력 −1' },
  };
  const AUG_STAGES = [2, 4];
  const AUGIMG = {};
  for (const id of Object.keys(AUGS)) jobs.push(opt(`../../art/chess/aug/${id}.png`).then((x) => (AUGIMG[id] = x)));
  await Promise.all(jobs);
  const hasAug = (id) => run.augs.includes(id);

  // ───────── 로그라이크 런 & 스테이지 데이터
  let idGen = 1;
  const run = {
    stage: 1,
    maxStage: 5,
    deck: [], // 영구 보존되는 플레이어 기물 덱
    augs: [], // 고른 증강 id
  };

  const STAGES = [
    {
      floor: 1,
      name: '고양이 척후 구역',
      desc: '앞쪽을 순찰 중인 식빵 고양이 폰 4마리가 가로막고 있습니다.',
      foes: [
        { type: 'pawn', col: 2, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 3, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 4, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 5, row: 6, hp: 1, atk: 1 },
      ]
    },
    {
      floor: 2,
      name: '고양이 순찰 진지',
      desc: '신속한 닌자 고양이 나이트가 이끄는 순찰조입니다.',
      foes: [
        { type: 'pawn', col: 1, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 2, row: 6, hp: 1, atk: 1 },
        { type: 'knight', col: 3, row: 7, hp: 2, atk: 2 },
        { type: 'pawn', col: 4, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 5, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 6, row: 6, hp: 1, atk: 1 },
      ]
    },
    {
      floor: 3,
      name: '흑묘 정예 주둔지',
      desc: '불 마법 고양이와 성채 고양이가 지원하는 정예 부대입니다.',
      foes: [
        { type: 'pawn', col: 1, row: 6, hp: 1, atk: 1 },
        { type: 'bishop', col: 2, row: 7, hp: 2, atk: 2 },
        { type: 'pawn', col: 3, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 4, row: 6, hp: 1, atk: 1 },
        { type: 'rook', col: 5, row: 7, hp: 3, atk: 2 },
        { type: 'pawn', col: 6, row: 6, hp: 1, atk: 1 },
      ]
    },
    {
      floor: 4,
      name: '고양이 왕실 근위대',
      desc: '마녀 고양이 퀸과 호위 기사들이 방어선을 치고 있습니다.',
      foes: [
        { type: 'pawn', col: 0, row: 6, hp: 1, atk: 1 },
        { type: 'knight', col: 1, row: 7, hp: 2, atk: 2 },
        { type: 'bishop', col: 2, row: 7, hp: 2, atk: 2 },
        { type: 'queen', col: 3, row: 7, hp: 3, atk: 2 },
        { type: 'rook', col: 6, row: 7, hp: 3, atk: 2 },
        { type: 'pawn', col: 3, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 4, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 7, row: 6, hp: 1, atk: 1 },
      ]
    },
    {
      floor: 5,
      name: '성채 심층 — 독재 고양이 킹',
      desc: '흑묘 기사단의 군주 독재 고양이 킹과의 최종 결전!',
      boss: true,
      foes: [
        { type: 'king', col: 4, row: 7, hp: 6, atk: 2, isBoss: true },
        { type: 'queen', col: 3, row: 7, hp: 3, atk: 2 },
        { type: 'rook', col: 0, row: 7, hp: 3, atk: 2 },
        { type: 'rook', col: 7, row: 7, hp: 3, atk: 2 },
        { type: 'knight', col: 1, row: 7, hp: 2, atk: 2 },
        { type: 'bishop', col: 5, row: 7, hp: 2, atk: 2 },
        { type: 'pawn', col: 2, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 3, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 4, row: 6, hp: 1, atk: 1 },
        { type: 'pawn', col: 5, row: 6, hp: 1, atk: 1 },
      ]
    }
  ];

  // ───────── 전투 상태 & 배치
  let pieces = [], sel = null, hover = null, hoverCell = null, anims = [], marks = [];
  let boardFx = [], projectiles = [], dmgPops = [], combat = null, flashA = 0, shake = 0, puffs = [];
  let turn = 'ally', busy = false, result = null, turnBanner = 0;
  let skillTargetMode = false, skillTargetMarks = [];

  const at = (c, r) => pieces.find((p) => p.col === c && p.row === r && p.hp > 0);
  const inside = (c, r) => c >= 0 && r >= 0 && c < N && r < N;

  // 런 시작 (기본 병사 8명으로 덱 구성)
  function startNewRun() {
    run.stage = 1;
    run.deck = [];
    run.augs = []; run.augPicked = {};
    for (let i = 0; i < 8; i++) {
      run.deck.push({
        id: 'ally_' + (idGen++),
        type: 'pawn',
        level: 1,
        atk: 1,
        hp: 1,
        maxHp: 1,
        kills: 0,
        cooldown: 0,
      });
    }
    $('#modal-gameover').style.display = 'none';
    $('#modal-victory').style.display = 'none';
    $('#modal-reward').style.display = 'none';
    $('#modal-aug').style.display = 'none';
    loadStage(run.stage);
  }

  // 스테이지 배치
  function loadStage(stageNum) {
    pieces = []; sel = null; hover = null; anims = []; marks = []; boardFx = []; projectiles = []; dmgPops = []; combat = null; tweens = []; props = []; scrFx = [];
    turn = 'ally'; busy = false; result = null; skillTargetMode = false; skillTargetMarks = [];

    const st = STAGES[stageNum - 1];
    $('#st-floor').textContent = st.floor;
    $('#st-name').textContent = st.name;
    $('#st-ally-cnt').textContent = run.deck.length;
    $('#st-foe-cnt').textContent = st.foes.length;

    // 아군 덱 배치 (폰은 row 1, 다른 기물은 row 0)
    let pawnCols = [0, 1, 2, 3, 4, 5, 6, 7];
    let backCols = [0, 1, 2, 3, 4, 5, 6, 7];
    let pIdx = 0, bIdx = 0;

    for (const d of run.deck) {
      let c, r;
      if (d.type === 'pawn') {
        if (pIdx < 8) { c = pawnCols[pIdx++]; r = 1; }
        else { c = backCols[bIdx++]; r = 0; }
      } else {
        if (bIdx < 8) { c = backCols[bIdx++]; r = 0; }
        else { c = pawnCols[pIdx++]; r = 1; }
      }
      const u = UNITS.ally[d.type];
      pieces.push({
        id: d.id,
        deckRef: d,
        side: 'ally',
        type: d.type,
        col: c, row: r,
        x: c, z: r, y: 0,
        def: u,
        img: FIG[u.art],
        level: d.level,
        atk: d.atk,
        hp: d.hp,
        maxHp: d.maxHp,
        cooldown: d.cooldown || 0,
        shieldWall: d.type === 'rook',
        face: 1,
        seed: Math.random() * 9,
        flash: 0, alpha: 1, lift: 0, hop: 0, tilt: 0,
        stunned: 0,
      });
    }

    // 적 부대 배치
    for (const f of st.foes) {
      const u = UNITS.foe[f.type];
      pieces.push({
        side: 'foe',
        type: f.type,
        col: f.col, row: f.row,
        x: f.col, z: f.row, y: 0,
        def: u,
        img: FIG[u.art],
        level: 1,
        atk: f.atk || u.atk || 1,
        hp: f.hp,
        maxHp: f.hp,
        isBoss: !!f.isBoss,
        face: -1,
        seed: Math.random() * 9,
        flash: 0, alpha: 1, lift: 0, hop: 0, tilt: 0,
        stunned: 0,
      });
    }

    // 증강 적용 (이번 판에만: 덱 값은 안 바뀜)
    const allies = pieces.filter((p) => p.side === 'ally');
    if (hasAug('cheeseArmor')) for (const p of allies) { p.maxHp += 1; p.hp += 1; }
    if (hasAug('sharpFangs')) for (const p of allies) p.atk += 1;
    if (hasAug('mousehole')) {
      let n = 0;
      for (const r of [1, 0, 2]) for (let c = 0; c < N && n < 2; c++) {
        if (at(c, r)) continue;
        const u = UNITS.ally.pawn;
        pieces.push({ side: 'ally', type: 'pawn', col: c, row: r, x: c, z: r, y: 0, def: u, img: FIG[u.art], level: 1, atk: 1 + (hasAug('sharpFangs') ? 1 : 0), hp: 1, maxHp: 1, cooldown: 0, temp: true, face: 1, seed: Math.random() * 9, flash: 0.4, alpha: 1, lift: 0, hop: 0, tilt: 0, stunned: 0 });
        dust(c, r, 6); n++;
      }
    }
    if (hasAug('catTrap')) {
      const fs = pieces.filter((p) => p.side === 'foe' && p.hp > 1).sort(() => Math.random() - 0.5).slice(0, 2);
      for (const f of fs) { f.hp -= 1; f.flash = 0.5; popDmgNumber('덫! -1', f); }
    }
    firstStrikeUsed = false;
    drawAugBar();

    turnBanner = 1.2;
    updateInfo();
  }
  let firstStrikeUsed = false;
  // 고른 증강 아이콘 줄 (스테이지 바 아래)
  function drawAugBar() {
    const el = $('#aug-bar');
    if (!el) return;
    el.innerHTML = run.augs.map((id) => `<div class="aug-chip" title="${AUGS[id].name} — ${AUGS[id].desc}">${AUGIMG[id] ? `<img src="../../art/chess/aug/${id}.png" alt="">` : '✦'}<span>${AUGS[id].name}</span></div>`).join('');
  }

  // ───────── 체스 이동 규칙
  function moves(p) {
    if (p.stunned > 0) return [];
    const out = [], fwd = p.side === 'ally' ? 1 : -1;
    const tryAdd = (c, r) => {
      if (!inside(c, r)) return false;
      const o = at(c, r);
      if (!o) { out.push({ c, r }); return true; }
      if (o.side !== p.side) out.push({ c, r, hit: o });
      return false;
    };
    const ray = (dirs) => {
      for (const [dc, dr] of dirs) {
        for (let i = 1; i < N; i++) if (!tryAdd(p.col + dc * i, p.row + dr * i)) break;
      }
    };
    const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const m = p.type;

    if (m === 'rook') ray(ORTHO);
    else if (m === 'bishop') ray(DIAG);
    else if (m === 'queen') ray([...ORTHO, ...DIAG]);
    else if (m === 'king') {
      for (const [dc, dr] of [...ORTHO, ...DIAG]) tryAdd(p.col + dc, p.row + dr);
    } else if (m === 'knight') {
      for (const [dc, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) tryAdd(p.col + dc, p.row + dr);
    } else if (m === 'pawn') {
      const r1 = p.row + fwd;
      if (inside(p.col, r1) && !at(p.col, r1)) {
        out.push({ c: p.col, r: r1 });
        const start = p.side === 'ally' ? 1 : 6;
        if (p.row === start && !at(p.col, r1 + fwd)) out.push({ c: p.col, r: r1 + fwd });
      }
      for (const dc of [-1, 1]) {
        const o = at(p.col + dc, r1);
        if (o && o.side !== p.side) out.push({ c: p.col + dc, r: r1, hit: o });
      }
    }
    return out;
  }

  // ───────── 애니메이션 & 이펙트 유틸
  const hop = (p, c, r, high, customDur, customHigh) => new Promise((done) => anims.push({
    p, fx: p.x, fz: p.z, tx: c, tz: r, t: 0,
    dur: customDur != null ? customDur : (high ? 0.44 : 0.32),
    high: customHigh != null ? customHigh : (high ? 1.4 : 0.5),
    back: false, done
  }));

  function land(p) { shake = Math.max(shake, 6); dust(p.col, p.row, 5); }

  function dust(col, row, n = 5) {
    for (let i = 0; i < n; i++) {
      puffs.push({
        x: col + (Math.random() - 0.5) * 0.4,
        z: row + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.8,
        vz: (Math.random() - 0.5) * 0.8,
        t: 0
      });
    }
  }

  function boardFxAdd(key, x, y, z, o = {}) {
    const img = o.seq ? FX[key + '_1'] : FX[key];
    if (img) {
      boardFx.push(Object.assign({
        key, img, x, y, z,
        life: 0.4, w: 1.0,
        rot: 0, vr: 0, vx: 0, vy: 0, vz: 0,
        flip: false, add: false, t: -(o.delay || 0)
      }, o));
    }
  }

  function popDmgNumber(text, p) {
    dmgPops.push({ text: String(text), x: p.x - 3.5, y: 1.6, z: p.z - 3.5, t: 0, life: 0.85 });
  }

  function launchProjectile(a, d, kind) {
    return new Promise((done) => {
      projectiles.push({
        kind,
        img: kind === 'fire' ? FX.fireball : (FX.k_charge || FX.flame),
        fx: a.x - 3.5, fz: a.z - 3.5, fy: 0.75,
        tx: d.col - 3.5, tz: d.row - 3.5, ty: 0.65,
        x: a.x - 3.5, z: a.z - 3.5, y: 0.75,
        t: 0, dur: 0.34, w: kind === 'fire' ? 1.1 : 0.85,
        done
      });
    });
  }

  // ───────── 전투 액션 (캣 체스처럼 기물마다 고유 동작)
  //  기물 그림에서 팔이 튀어나와 휘두름. 팔 그림 = art/chess/arm/<id>.png (ChatGPT, 어깨 = 왼쪽 끝 · 오른쪽을 향해 누움)
  //  잡으면 피니시: 쥐가 잡으면 치즈 바퀴가 떨어져 납작, 고양이가 잡으면 상자를 씌움
  const ARM_OF = { fieldmouse: 'mouse', knight: 'knight', wizard: 'wizard', viking: 'viking', ratqueen: 'queen', ratking: 'king', cat_pawn: 'catpaw', cat_knight: 'ninja', cat_queen: 'witch', cat_bishop: 'witch', cat_king: 'dictator' };
  const STYLE_OF = { fieldmouse: 'punch', cat_pawn: 'punch', knight: 'slash', cat_knight: 'slash', cat_king: 'slash', ratking: 'smash', viking: 'bash', wizard: 'cast', ratqueen: 'cast', cat_queen: 'cast', cat_bishop: 'cast', cat_rook: 'slam' };
  const ARM = {}, PROP = {}, BODY = {}, BASE = {};
  const canPop = (p) => !!(BODY[p.def.art] && BASE[p.def.art]);
  // 몸 그림에서 앞 어깨 자리 (그림 왼쪽 위 기준 0~1, 원래 보는 방향 기준). 없으면 기본값
  const SHOULDER = { ratking: [0.938, 0.464], ratqueen: [0.825, 0.486], knight: [0.828, 0.52], wizard: [0.582, 0.464], viking: [0.851, 0.497], fieldmouse: [0.81, 0.534],
    cat_king: [0.37, 0.5], cat_queen: [0.443, 0.514], cat_knight: [0.433, 0.43], cat_bishop: [0.382, 0.475], cat_rook: [0.3, 0.55], cat_pawn: [0.541, 0.659] };
  {
    const armJobs = [];
    for (const id of new Set(Object.values(ARM_OF))) armJobs.push(opt(`../../art/chess/arm/${id}.png`).then((x) => (ARM[id] = x)));
    for (const id of ['box', 'cheese']) armJobs.push(opt(`../../art/chess/arm/${id}.png`).then((x) => (PROP[id] = x)));
    // 튀어나오는 몸 (art/chess/body/<art>.png, 앞팔 없음) · 빈 받침 (art/chess/base/<art>.png)
    for (const art of Object.keys(FIG)) {
      armJobs.push(opt(`../../art/chess/body/${art}.png`).then((x) => (BODY[art] = x)));
      armJobs.push(opt(`../../art/chess/base/${art}.png`).then((x) => (BASE[art] = x)));
    }
    await Promise.all(armJobs);
  }
  // 시간 진행에 묶인 보간 (히트스톱 때 같이 멈춤)
  let tweens = [], props = [];
  const tween = (dur, fn) => new Promise((done) => tweens.push({ t: 0, dur, fn, done }));
  const wait = (s) => tween(s, () => {});
  const scr = (p, y = 0) => P3(p.x - 3.5, y, p.z - 3.5);
  const shoulderOf = (p) => p.shoulder || scr(p, 0.9);
  function aimAt(a, d) { const s0 = shoulderOf(a), t = scr(d, 0.8); return Math.atan2(t[1] - s0[1], t[0] - s0[0]); }

  async function onBoardCombat(a, d) {
    combat = { a, d };
    if (cam.z < 1.05) { cam.fx = (a.x + d.x) / 2 - 3.5; cam.fz = (a.z + d.z) / 2 - 3.5; }
    const dx = d.col - a.col, dz = d.row - a.row;
    a.face = dx !== 0 ? Math.sign(dx) : (a.side === 'ally' ? 1 : -1);
    d.face = -a.face;
    let style = STYLE_OF[a.def.art] || 'punch'; const armId = ARM_OF[a.def.art];
    const s = Math.cos(aimAt(a, d)) >= 0 ? 1 : -1; // 화면에서 오른쪽(+1) · 왼쪽(−1)으로 침
    // 다가가기: 칸을 벗어나 상대 바로 옆(같은 줄, 화면 가로로 0.85칸)에 서서 마주 보고 침 → 앞뒤로 안 겹침
    const approach = (k, dur = 0.24, high = 0.45) => { const side = Math.cos(aimAt(a, d)) >= 0 ? 1 : -1; a.face = side; d.face = -side; return hop(a, d.x - side * 0.85 * Math.min(1, k / 0.5), lerp(a.z, d.z, Math.min(1, k / 0.5)), false, dur, high); };
    const armOn = (ang, ext = 1) => { a.arm = { id: armId, ang, ext, vis: 0 }; return tween(0.12, (u) => { a.arm.vis = ease(u); }); };
    const armOff = () => a.arm ? tween(0.14, (u) => { if (a.arm) a.arm.vis = 1 - u; }).then(() => { a.arm = null; }) : Promise.resolve();
    const swing = (from, to, dur, extTo) => { const e0 = a.arm.ext; return tween(dur, (u) => { const k = u * u; a.arm.ang = lerp(from, to, k); if (extTo != null) a.arm.ext = lerp(e0, extTo, k); }); };

    // ① 기물마다 고유 동작 (팔 리그 · 받침째 움직임 · 튀어나오기를 섞음). 끝나면 hit 종류를 돌려줌 → ③ 에서 이펙트
    const MOVES = {
      // 들쥐 병사: 깡총 다가가 원투 펀치 + 마지막 어퍼컷
      fieldmouse: async () => {
        await approach(0.5);
        const aim = aimAt(a, d);
        await armOn(aim, 0.5);
        for (const [e, da] of [[1.25, 0.15], [1.1, -0.15]]) { await tween(0.06, (u) => { a.arm.ext = lerp(0.5, e, u); a.arm.ang = aim + s * da; }); boardFxAdd('k_hit1', d.x - 3.5, 0.8, d.z - 3.5, { w: 0.8, life: 0.15, add: true }); d.flash = 0.2; shake = Math.max(shake, 4); await tween(0.06, (u) => { a.arm.ext = lerp(e, 0.5, u); }); }
        await tween(0.08, (u) => { a.arm.ang = lerp(aim + s * 0.6, aim - s * 0.5, u); a.arm.ext = lerp(0.6, 1.45, u); a.y = 0.25 * u; });  // 어퍼컷
        return 'punch';
      },
      // 기사 쥐: 말 받침째 L자로 크게 도약 → 착지하며 다시 뛰어 검을 내려벰
      knight: async () => {
        const side = Math.cos(aimAt(a, d)) >= 0 ? 1 : -1;
        await hop(a, d.x - side * 0.85, d.z, true, 0.4, 1.6);
        const aim = aimAt(a, d);
        a.tilt = -side * 0.2;
        await armOn(aim - side * 2.0, 1.1);
        await tween(0.12, (u) => { a.y = 0.7 * Math.sin(u * Math.PI / 2); a.arm.ang = aim - side * 2.2; });
        await tween(0.09, (u) => { a.y = 0.7 * (1 - u); a.arm.ang = lerp(aim - side * 2.2, aim + side * 0.6, u * u); });
        a.tilt = side * 0.3;
        return 'slash';
      },
      // 마법사 쥐: 제자리에서 지팡이를 치켜들고 모아서 화염구
      wizard: async () => {
        const up = -Math.PI / 2 + s * 0.35;
        await armOn(up, 0.9);
        a.lift = 0.2;
        await tween(0.35, () => { if (a.arm?.tip && Math.random() < 0.7) scrFxAdd('k_charge', a.arm.tip[0], a.arm.tip[1], { w: [30, 100], life: 0.25, add: true, rot: Math.random() * 6 }); });
        await swing(up, aimAt(a, d), 0.09);
        await launchProjectile(a, d, 'fire');
        a.lift = 0;
        return 'fire';
      },
      // 바이킹 쥐: 방패를 앞세우고 성탑째 돌진 → 상대를 밀쳐냄
      viking: async () => {
        const aim = aimAt(a, d);
        await armOn(aim, 0.55);
        await tween(0.12, (u) => { a.tilt = -s * 0.15 * u; });  // 웅크림
        await Promise.all([approach(0.72, 0.15, 0.1), tween(0.15, (u) => { a.arm.ext = lerp(0.55, 0.95, u); })]);
        a.tilt = s * 0.2;
        const fx0 = d.x; tween(0.2, (u) => { d.x = fx0 + s * 0.35 * Math.sin(u * Math.PI); });  // 밀려났다 돌아옴
        return 'bash';
      },
      // 쥐 여왕: 받침에서 우아하게 떠올라 홀을 세 번 휘둘러 빛 탄환
      ratqueen: async () => {
        if (canPop(a)) a.popped = true;
        await tween(0.25, (u) => { a.lift = 1.0 * ease(u); });
        const aim0 = aimAt(a, d);
        await armOn(aim0 - s * 0.8, 0.9);
        for (let i = 0; i < 3; i++) {
          await swing(aim0 - s * 0.8, aim0 + s * 0.3, 0.08);
          launchProjectile(a, d, 'magic');
          await swing(aim0 + s * 0.3, aim0 - s * 0.8, 0.07);
        }
        await wait(0.36);
        return 'magic';
      },
      // 쥐 왕: 받침째 크게 뛰어올라 망치로 내려찍기
      ratking: async () => {
        await approach(0.45);
        const aim = aimAt(a, d);
        await armOn(aim - s * 2.4, 1.1);
        await tween(0.24, (u) => { a.y = Math.sin(u * Math.PI / 2) * 0.9; a.arm.ang = lerp(aim - s * 2.4, aim - s * 2.8, u); });
        await tween(0.1, (u) => { a.y = 0.9 * (1 - u); a.arm.ang = lerp(aim - s * 2.8, aim + s * 0.7, u * u); });
        boardFxAdd('k_lightring', d.x - 3.5, 0.05, d.z - 3.5, { w: 2.8, life: 0.45, add: true });
        return 'smash';
      },
      // 식빵 고양이: 냥냥 펀치 연타 (발톱 할퀴기 4번)
      cat_pawn: async () => {
        await approach(0.5);
        const aim = aimAt(a, d);
        await armOn(aim, 0.7);
        for (let i = 0; i < 4; i++) {
          const da = (i % 2 ? 0.5 : -0.5) * s;
          await tween(0.05, (u) => { a.arm.ang = aim + da * (1 - 2 * u); a.arm.ext = 0.7 + 0.5 * Math.sin(u * Math.PI); });
          boardFxAdd('k_sparks', d.x - 3.5, 0.75 + (i % 2) * 0.15, d.z - 3.5, { w: 0.7, life: 0.15, flip: i % 2 === 1 });
          d.flash = 0.2; d.tilt = s * 0.08 * (i % 2 ? 1 : -1);
        }
        return 'claw';
      },
      // 닌자 고양이: 연기와 함께 사라졌다가 상대 등 뒤에 나타나 베기
      cat_knight: async () => {
        boardFxAdd('poof', a.x - 3.5, 0.5, a.z - 3.5, { seq: 6, w: 1.6, life: 0.35 });
        a.alpha = 0;
        await wait(0.2);
        const side = Math.cos(aimAt(a, d)) >= 0 ? 1 : -1;
        a.x = d.x + side * 0.85; a.z = d.z; a.face = -side; d.face = side;  // 등 뒤
        boardFxAdd('poof', a.x - 3.5, 0.5, a.z - 3.5, { seq: 6, w: 1.4, life: 0.3 });
        a.alpha = 1;
        const aim = aimAt(a, d), s2 = Math.cos(aim) >= 0 ? 1 : -1;
        await armOn(aim - s2 * 1.6, 1.15);
        await swing(aim - s2 * 1.6, aim + s2 * 0.7, 0.08);
        boardFxAdd('k_slash', d.x - 3.5, 0.7, d.z - 3.5, { w: 1.8, life: 0.2, rot: -s2 * 0.4, add: true });
        return 'slash';
      },
      // 불 마법 고양이: 횃불 지팡이로 화염탄 3연발
      cat_bishop: async () => {
        const up = -Math.PI / 2 - s * 0.2;
        await armOn(up, 0.9);
        for (let i = 0; i < 3; i++) { await swing(up, aimAt(a, d), 0.07); launchProjectile(a, d, 'fire'); await swing(aimAt(a, d), up, 0.08); }
        await wait(0.36);
        return 'fire';
      },
      // 뚱냥이: 성탑에서 튀어나와 높이 날아 배치기 (깔아뭉갬)
      cat_rook: async () => {
        if (canPop(a)) a.popped = true;
        await hop(a, d.col, d.row, false, 0.45, 2.4);
        d.sq = 0.3;
        return 'slam';
      },
      // 마녀 고양이: 지팡이를 빙글 돌려 저주 구슬
      cat_queen: async () => {
        const aim = aimAt(a, d);
        await armOn(aim - s * 1.2, 0.9);
        await tween(0.3, (u) => { a.arm.ang = aim - s * 1.2 + Math.sin(u * Math.PI * 4) * 0.5; if (a.arm.tip && Math.random() < 0.5) scrFxAdd('k_charge', a.arm.tip[0], a.arm.tip[1], { w: [20, 70], life: 0.2, add: true }); });
        await swing(aim - s * 1.2, aim, 0.08);
        await launchProjectile(a, d, 'magic');
        return 'magic';
      },
      // 독재 고양이 킹: 지휘봉 호령 후 내려치기
      cat_king: async () => {
        await approach(0.5);
        const aim = aimAt(a, d);
        await armOn(-Math.PI / 2, 1.0);
        popDmgNumber('돌격!', a);
        await tween(0.25, (u) => { a.arm.ang = -Math.PI / 2 + Math.sin(u * Math.PI * 3) * 0.25; });
        await swing(aim - s * 1.8, aim + s * 0.5, 0.1);
        return 'slash';
      },
    };
    style = await (MOVES[a.def.art] || MOVES.fieldmouse)();

    // ③ 맞음
    let dmg = Math.max(1, a.atk);
    if (a.side === 'ally' && hasAug('firstStrike') && !firstStrikeUsed) { firstStrikeUsed = true; dmg += 2; popDmgNumber('선제 돌격!', a); }
    if (d.shieldWall) {
      d.shieldWall = false;
      dmg = 0;
      popDmgNumber('방패 방어!', d);
      boardFxAdd('k_lightring', d.col - 3.5, 0.6, d.row - 3.5, { w: 1.8, life: 0.4, add: true });
    } else {
      d.hp -= dmg;
      popDmgNumber(`-${dmg}`, d);
    }
    const hx = d.x - 3.5, hz = d.z - 3.5;
    const big = style === 'smash' || style === 'slam' || d.hp <= 0;
    if (style === 'punch') { boardFxAdd('k_hit1', hx, 0.75, hz, { w: 1.4, life: 0.22, add: true }); boardFxAdd('k_sparks', hx, 0.7, hz, { w: 1.2, life: 0.3, flip: s < 0 }); }
    else if (style === 'slash') { boardFxAdd('k_arc', hx, 0.75, hz, { w: 1.9, life: 0.26, flip: s < 0, add: true }); boardFxAdd('k_slash', hx, 0.7, hz, { w: 1.5, life: 0.22, rot: s * 0.6, add: true }); }
    else if (style === 'smash' || style === 'slam') { boardFxAdd('k_burst', hx, 0.5, hz, { w: 2.2, life: 0.32, add: true }); dust(d.col, d.row, 12); }
    else if (style === 'bash') boardFxAdd('k_hit3', hx, 0.7, hz, { w: 1.6, life: 0.28, add: true });
    else if (style === 'claw') { boardFxAdd('k_hit3', hx, 0.75, hz, { w: 1.5, life: 0.25, add: true }); boardFxAdd('k_sparks', hx, 0.7, hz, { w: 1.4, life: 0.3 }); }
    else if (style === 'magic') { boardFxAdd('k_burst', hx, 0.7, hz, { w: 1.9, life: 0.3, add: true }); boardFxAdd('k_lightring', hx, 0.4, hz, { w: 1.8, life: 0.4, add: true }); }
    else if (style === 'fire') { boardFxAdd('explosion', hx, 0.7, hz, { seq: 6, w: 1.9, life: 0.45, add: true }); boardFxAdd('smoke', hx, 0.4, hz, { w: 1.4, life: 0.5, vy: 0.6 }); }
    boardFxAdd('k_hit2', hx, 0.75, hz, { w: big ? 1.8 : 1.2, life: 0.25, add: true });
    d.flash = 0.5;
    hitstop = big ? 0.14 : 0.08;
    flashA = big ? 0.35 : 0.12;
    shake = Math.max(shake, (big ? 18 : 9) + dmg * 2);
    // 맞은 쪽 휘청 (뒤로 젖혔다 돌아옴) · 납작했다 펴짐
    const knock = tween(0.4, (u) => { d.tilt = s * 0.45 * Math.sin(u * Math.PI) * (1 - u); d.sq = lerp(d.sq ?? 1, 1, u); });
    await wait(0.18);

    // ④ 정리 / 피니시
    if (d.hp <= 0) {
      if (a.side === 'ally' && hasAug('knightHonor') && a.hp < a.maxHp) { a.hp += 1; popDmgNumber('+1 회복', a); }
      await armOff();
      await finisher(a, d);
      await knock;
      // 받침으로 돌아간 뒤 점령 이동
      await popIn(a);
      await hop(a, d.col, d.row, false, 0.24, 0.35);
      a.col = d.col; a.row = d.row; a.x = a.col; a.z = a.row; a.tilt = 0;
      land(a);
      if (a.side === 'ally' && a.deckRef) {
        a.deckRef.kills = (a.deckRef.kills || 0) + 1;
        if (a.type === 'knight') { popDmgNumber('돌격 연속 행동!', a); combat = null; return { kill: true, extraTurn: true }; }
      }
      combat = null;
      return { kill: true };
    }
    // 가시 갑옷: 맞고 살아남은 아군이 1 되돌려 줌
    if (d.side === 'ally' && a.side === 'foe' && hasAug('thornArmor') && dmg > 0) {
      a.hp -= 1; a.flash = 0.5; popDmgNumber('가시 -1', a);
      boardFxAdd('k_sparks', a.x - 3.5, 0.6, a.z - 3.5, { w: 1.1, life: 0.3, add: true });
      if (a.hp <= 0) { a.arm = null; a.popped = false; a.x = a.col; a.z = a.row; a.y = 0; a.dying = 0; boardFxAdd('poof', a.x - 3.5, 0.5, a.z - 3.5, { seq: 6, w: 1.6, life: 0.4 }); combat = null; return { kill: false, attackerDied: true }; }
    }
    await armOff();
    await knock;
    a.tilt = 0;
    await popIn(a, style === 'slam' ? 1.2 : 0.6);
    combat = null;
    return { kill: false };
  }
  // 몸이 받침(원래 칸)으로 뛰어 돌아가 쏙 들어감
  async function popIn(a, high = 0.6) {
    if (a.x !== a.col || a.z !== a.row || a.popped) {
      await hop(a, a.col, a.row, false, 0.26, a.popped ? Math.max(high, 0.9) : 0.32);
      a.x = a.col; a.z = a.row;
    }
    if (a.popped) {
      await tween(0.12, (u) => { a.baseSq = 1 - 0.2 * Math.sin(u * Math.PI); a.sq = 1 - 0.3 * Math.sin(u * Math.PI); });
      a.popped = false; a.sq = 1; a.baseSq = 1;
    }
    a.tilt = 0; a.lift = 0; a.alpha = 1;
    land(a);
  }

  // 피니시: 쥐 → 치즈 바퀴 낙하 (고양이 납작), 고양이 → 상자 씌우기 (쥐가 갇혀 들썩이다 사라짐)
  async function finisher(a, d) {
    const id = a.side === 'ally' ? 'cheese' : 'box', img = PROP[id];
    if (!img) { d.dying = 0; boardFxAdd('poof', d.x - 3.5, 0.5, d.z - 3.5, { seq: 6, w: 1.6, life: 0.4 }); return wait(0.3); }
    const pr = { img, x: d.x - 3.5, z: d.z - 3.5, y: 3.2, w: id === 'box' ? 1.05 : 0.95, sq: 1, alpha: 1, rot: 0 };
    props.push(pr);
    await tween(0.26, (u) => { pr.y = lerp(3.2, id === 'box' ? 0 : 0.55, u * u); });
    shake = Math.max(shake, 14); dust(d.col, d.row, 10);
    if (id === 'cheese') {
      d.sq = 0.22;  // 납작
      await tween(0.16, (u) => { pr.sq = 1 - 0.25 * Math.sin(u * Math.PI); });
      popDmgNumber('납작!', d);
      await wait(0.25);
    } else {
      d.alpha = 0;  // 상자 안에 갇힘
      for (let i = 0; i < 2; i++) await tween(0.16, (u) => { pr.rot = 0.12 * Math.sin(u * Math.PI * 2); pr.y = 0.08 * Math.sin(u * Math.PI); });
      popDmgNumber('냥!', d);
    }
    boardFxAdd('poof', pr.x, 0.5, pr.z, { seq: 6, w: 1.8, life: 0.45 });
    d.dying = 0; d.alpha = 0;
    await tween(0.2, (u) => { pr.alpha = 1 - u; });
    props = props.filter((q) => q !== pr);
  }

  // 화면 좌표 이펙트 (팔 끝 등)
  let scrFx = [];
  function scrFxAdd(key, x, y, o = {}) { const img = FX[key]; if (img) scrFx.push(Object.assign({ img, x, y, t: 0, life: 0.3, w: [40, 80], rot: 0, add: false }, o)); }

  // ───────── 액티브 스킬 실행
  async function executeSkill(p, target) {
    if (p.cooldown > 0) return;
    busy = true; sel = null; marks = []; skillTargetMode = false; skillTargetMarks = [];
    p.cooldown = Math.max(1, p.def.skillCd - (hasAug('warDrum') ? 1 : 0));
    if (p.deckRef) p.deckRef.cooldown = p.cooldown;

    const [tx, tz] = [target.c, target.r];

    if (p.type === 'pawn') {
      // 돌격 찌르기: 앞 칸 적에게 직접 타격
      const targetPiece = at(tx, tz);
      if (targetPiece) {
        p.tilt = 0.4;
        boardFxAdd('k_slash', tx - 3.5, 0.6, tz - 3.5, { w: 1.6, life: 0.3, add: true });
        boardFxAdd('k_sparks', tx - 3.5, 0.6, tz - 3.5, { w: 1.4, life: 0.35, add: true });
        targetPiece.hp -= p.atk;
        popDmgNumber(`-${p.atk}`, targetPiece);
        targetPiece.flash = 0.5;
        shake = 8;
        await new Promise((r) => setTimeout(r, 260));
        p.tilt = 0;
        if (targetPiece.hp <= 0) {
          targetPiece.dying = 0;
          boardFxAdd('poof', tx - 3.5, 0.5, tz - 3.5, { seq: 6, w: 1.6, life: 0.4 });
        }
      }
    } else if (p.type === 'knight') {
      // 성검 해방: 전방 2칸 직선 관통
      boardFxAdd('k_beam', p.col - 3.5, 0.6, p.row - 3.5, { w: 2.4, life: 0.45, add: true });
      boardFxAdd('k_wave', tx - 3.5, 0.4, tz - 3.5, { w: 2.2, life: 0.4, add: true });
      shake = 12;
      for (let step = 1; step <= 2; step++) {
        const nr = p.row + step;
        const targetPiece = at(p.col, nr);
        if (targetPiece && targetPiece.side !== p.side) {
          targetPiece.hp -= p.atk;
          popDmgNumber(`-${p.atk}`, targetPiece);
          targetPiece.flash = 0.5;
          boardFxAdd('k_hit2', p.col - 3.5, 0.6, nr - 3.5, { w: 1.5, life: 0.3, add: true });
          if (targetPiece.hp <= 0) {
            targetPiece.dying = 0;
            boardFxAdd('poof', p.col - 3.5, 0.5, nr - 3.5, { seq: 6, w: 1.6, life: 0.4 });
          }
        }
      }
      await new Promise((r) => setTimeout(r, 380));
    } else if (p.type === 'bishop') {
      // 화염구: 목표 및 십자 주변 폭발
      await launchProjectile(p, { col: tx, row: tz }, 'fire');
      boardFxAdd('explosion', tx - 3.5, 0.6, tz - 3.5, { seq: 6, w: 2.2, life: 0.5, add: true });
      shake = 10;
      const cells = [[tx, tz, p.atk], [tx + 1, tz, 1], [tx - 1, tz, 1], [tx, tz + 1, 1], [tx, tz - 1, 1]];
      for (const [cx, cz, dmg] of cells) {
        const targetPiece = at(cx, cz);
        if (targetPiece && targetPiece.side !== p.side) {
          targetPiece.hp -= dmg;
          popDmgNumber(`-${dmg}`, targetPiece);
          targetPiece.flash = 0.5;
          if (targetPiece.hp <= 0) {
            targetPiece.dying = 0;
            boardFxAdd('poof', cx - 3.5, 0.5, cz - 3.5, { seq: 6, w: 1.5, life: 0.4 });
          }
        }
      }
      await new Promise((r) => setTimeout(r, 360));
    } else if (p.type === 'rook') {
      // 성벽 돌진: 직선 돌진 + 밀침
      await hop(p, tx, tz, false, 0.28, 0.3);
      p.col = tx; p.row = tz; p.x = tx; p.z = tz; land(p);
      const enemy = at(target.hitCol, target.hitRow);
      if (enemy) {
        enemy.hp -= p.atk;
        popDmgNumber(`-${p.atk}`, enemy);
        enemy.flash = 0.5;
        shake = 10;
        // 밀침 (뒤 칸이 비어있으면 1칸 후퇴)
        const pushR = enemy.row + 1;
        if (inside(enemy.col, pushR) && !at(enemy.col, pushR)) {
          enemy.row = pushR; enemy.z = pushR;
        }
        if (enemy.hp <= 0) {
          enemy.dying = 0;
          boardFxAdd('poof', enemy.col - 3.5, 0.5, enemy.row - 3.5, { seq: 6, w: 1.6, life: 0.4 });
        }
      }
      await new Promise((r) => setTimeout(r, 260));
    } else if (p.type === 'queen') {
      // 왕실 칙령: 지정 적 1턴 결박
      const targetPiece = at(tx, tz);
      if (targetPiece) {
        targetPiece.stunned = 1;
        popDmgNumber('결박 기절!', targetPiece);
        boardFxAdd('k_lightring', tx - 3.5, 0.7, tz - 3.5, { w: 1.8, life: 0.6, add: true });
        shake = 6;
      }
      await new Promise((r) => setTimeout(r, 300));
    } else if (p.type === 'king') {
      // 왕의 호령: 모든 아군 공격력 +1 버프
      boardFxAdd('k_lightring', p.col - 3.5, 0.1, p.row - 3.5, { w: 4.5, life: 0.7, add: true });
      shake = 8;
      for (const ally of pieces.filter((q) => q.side === 'ally' && q.hp > 0)) {
        ally.atk += 1;
        popDmgNumber('공격력 +1!', ally);
        ally.flash = 0.4;
      }
      await new Promise((r) => setTimeout(r, 350));
    }

    checkBattleEnd();
    if (!result) {
      endTurn();
    }
  }

  // ───────── 기물 행동 처리 (이동 / 일반 공격)
  async function act(p, m) {
    busy = true; sel = null; marks = []; skillTargetMode = false;
    let extraTurn = false;

    if (m.hit) {
      const outcome = await onBoardCombat(p, m.hit);
      if (outcome.extraTurn) extraTurn = true;
    } else {
      await hop(p, m.c, m.r, p.type === 'knight');
      p.col = m.c; p.row = m.r;
      land(p);
    }

    // 폰 승급: 적 끝 줄 도달 시 퀸으로 승급
    if (p.type === 'pawn' && p.row === (p.side === 'ally' ? N - 1 : 0)) {
      p.type = 'queen';
      p.def = UNITS[p.side].queen;
      p.img = FIG[p.def.art];
      p.maxHp = Math.max(p.maxHp, 3);
      p.hp = p.maxHp;
      p.atk = Math.max(p.atk, 2);
      if (p.deckRef) {
        p.deckRef.type = 'queen';
        p.deckRef.maxHp = p.maxHp;
        p.deckRef.hp = p.hp;
        p.deckRef.atk = p.atk;
      }
      boardFxAdd('k_lightring', p.col - 3.5, 0.05, p.row - 3.5, { w: 2.2, life: 0.6, add: true });
      boardFxAdd('k_burst', p.col - 3.5, 0.75, p.row - 3.5, { w: 1.8, life: 0.45, add: true });
      popDmgNumber('여왕 승급!', p);
    }

    busy = false;
    checkBattleEnd();

    if (!result) {
      if (p.side === 'ally' && extraTurn) {
        // 기사 돌격 보너스 턴: 아군 차례 유지
        updateInfo();
      } else {
        endTurn();
      }
    }
  }

  function endTurn() {
    for (const p of pieces.filter((q) => q.side === turn && q.hp > 0)) if (p.stunned > 0) p.stunned--;
    turn = turn === 'ally' ? 'foe' : 'ally';
    turnBanner = 1.0;

    // 턴 교대 시 스킬 쿨다운 및 기절 감소
    for (const p of pieces.filter((q) => q.side === turn && q.hp > 0)) {
      if (p.cooldown > 0) {
        p.cooldown--;
        if (p.deckRef) p.deckRef.cooldown = p.cooldown;
      }
    }

    updateInfo();
    if (turn === 'foe') setTimeout(aiMove, 550);
  }

  // ───────── 전투 종료 및 런 진행 (영구 결손 & 보상)
  function checkBattleEnd() {
    const aliveAllies = pieces.filter((p) => p.side === 'ally' && p.hp > 0);
    const aliveFoes = pieces.filter((p) => p.side === 'foe' && p.hp > 0);

    $('#st-ally-cnt').textContent = aliveAllies.length;
    $('#st-foe-cnt').textContent = aliveFoes.length;

    // 패배: 아군 기물 전멸
    if (aliveAllies.length === 0) {
      result = 'foe';
      busy = true;
      setTimeout(showGameOverModal, 600);
      return;
    }

    // 승리: 적 기물 전멸 (또는 보스 격파)
    const boss = pieces.find((p) => p.isBoss);
    if (aliveFoes.length === 0 || (boss && boss.hp <= 0)) {
      result = 'ally';
      busy = true;

      // 영구 결손(Permadeath) 적용: 사망한 기물은 영구 덱에서 제거!
      run.deck = run.deck.filter((item) => {
        const live = pieces.find((p) => p.deckRef === item && p.hp > 0);
        if (live) {
          // 판 안의 버프(호령 · 증강)는 덱에 안 남김: 체력만 이어 감, 성배 = 완전 회복
          item.hp = hasAug('holyGrail') ? item.maxHp : clamp(live.hp, 1, item.maxHp);
          return true;
        }
        return false;
      });

      if (run.stage >= run.maxStage) {
        // 5층 최종 보스 격파 완료!
        setTimeout(showVictoryModal, 700);
      } else {
        // 스테이지 클리어 보상 선택 창 표시
        setTimeout(showRewardModal, 700);
      }
    }
  }

  function showGameOverModal() {
    $('#gameover-text').innerHTML = `모든 체스말을 잃었습니다.<br>도달한 층: <b>${run.stage}층</b>`;
    $('#modal-gameover').style.display = 'flex';
  }

  function showVictoryModal() {
    $('#modal-victory').style.display = 'flex';
  }

  function showRewardModal() {
    const modal = $('#modal-reward');
    const container = $('#reward-cards');
    container.innerHTML = '';
    $('#upgrade-list').style.display = 'none';

    // 1. 새 기물 영입 카드
    const recruitPool = ['knight', 'bishop', 'rook', 'queen'];
    const pickType = recruitPool[Math.floor(Math.random() * recruitPool.length)];
    const u = UNITS.ally[pickType];

    const cardRecruit = document.createElement('div');
    cardRecruit.className = 'reward-card';
    cardRecruit.innerHTML = `
      <div class="card-icon"><img src="../../art/chess/fig/${u.art}.png" alt="${u.name}"></div>
      <div class="card-name">${u.name} 영입</div>
      <div class="card-type">${TYPES[pickType].mark} ${TYPES[pickType].name} 추가</div>
      <div class="card-stats">
        <span class="badge atk">⚔️ ${u.atk}</span>
        <span class="badge hp">❤️ ${u.hp}</span>
      </div>
      <div class="card-desc" style="margin-top:8px;">${u.abil}</div>
    `;
    cardRecruit.onclick = () => {
      run.deck.push({
        id: 'ally_' + (idGen++),
        type: pickType,
        level: 1,
        atk: u.atk,
        hp: u.hp,
        maxHp: u.hp,
        kills: 0,
        cooldown: 0
      });
      advanceNextStage();
    };
    container.appendChild(cardRecruit);

    // 2. 기물 강화 카드
    const cardUpgrade = document.createElement('div');
    cardUpgrade.className = 'reward-card';
    cardUpgrade.innerHTML = `
      <div class="card-icon" style="font-size: 52px; display: flex; align-items: center; justify-content: center;">🌟</div>
      <div class="card-name">기물 강화</div>
      <div class="card-type">공격력 +1 & 체력 +1</div>
      <div class="card-desc">아군 기물 중 1개를 선택하여 공격력과 최대 체력을 영구 상승시키고 체력을 완전 회복합니다.</div>
    `;
    cardUpgrade.onclick = () => {
      showUpgradeSublist();
    };
    container.appendChild(cardUpgrade);

    // 3. 전원 정비 & 지원병 카드
    const cardHeal = document.createElement('div');
    cardHeal.className = 'reward-card';
    cardHeal.innerHTML = `
      <div class="card-icon" style="font-size: 52px; display: flex; align-items: center; justify-content: center;">🩹</div>
      <div class="card-name">정비 및 지원병</div>
      <div class="card-type">전원 회복 & 폰 +1</div>
      <div class="card-desc">모든 생존 기물의 체력을 최대로 치료하고, 새로운 들쥐 병사 1명을 부대에 충원합니다.</div>
    `;
    cardHeal.onclick = () => {
      for (const item of run.deck) item.hp = item.maxHp;
      run.deck.push({
        id: 'ally_' + (idGen++),
        type: 'pawn',
        level: 1,
        atk: 1,
        hp: 1,
        maxHp: 1,
        kills: 0,
        cooldown: 0
      });
      advanceNextStage();
    };
    container.appendChild(cardHeal);

    modal.style.display = 'flex';
  }

  function showUpgradeSublist() {
    const list = $('#upgrade-list');
    const items = $('#upgrade-items');
    items.innerHTML = '';
    list.style.display = 'block';

    for (const d of run.deck) {
      const u = UNITS.ally[d.type];
      const row = document.createElement('div');
      row.className = 'upgrade-item';
      row.innerHTML = `
        <div>
          <b>${u.name}</b> (★ Lv.${d.level}) · ⚔️ ${d.atk} → <span style="color:#ff7675;">${d.atk + 1}</span> · ❤️ ${d.hp}/${d.maxHp} → <span style="color:#2ecc71;">${d.maxHp + 1}</span>
        </div>
        <button style="padding:4px 12px; font-weight:700; background:#f39c12; border:none; border-radius:6px; cursor:pointer;">선택</button>
      `;
      row.onclick = () => {
        d.level += 1;
        d.atk += 1;
        d.maxHp += 1;
        d.hp = d.maxHp;
        advanceNextStage();
      };
      items.appendChild(row);
    }
  }

  function advanceNextStage() {
    $('#modal-reward').style.display = 'none';
    if (AUG_STAGES.includes(run.stage) && !run.augPicked?.[run.stage]) { showAugModal(); return; }
    $('#modal-aug').style.display = 'none';
    run.stage++;
    loadStage(run.stage);
  }
  // 증강 고르기: 아직 없는 것 중 3개
  function showAugModal() {
    const pool = Object.keys(AUGS).filter((id) => !run.augs.includes(id)).sort(() => Math.random() - 0.5).slice(0, 3);
    const box = $('#aug-cards');
    box.innerHTML = '';
    for (const id of pool) {
      const a = AUGS[id], card = document.createElement('div');
      card.className = 'reward-card aug-card';
      card.innerHTML = `<div class="card-icon">${AUGIMG[id] ? `<img src="../../art/chess/aug/${id}.png" alt="">` : '✦'}</div><div class="card-name">${a.name}</div><div class="card-desc">${a.desc}</div>`;
      card.onclick = () => { run.augs.push(id); run.augPicked = { ...(run.augPicked || {}), [run.stage]: true }; advanceNextStage(); };
      box.appendChild(card);
    }
    $('#modal-aug').style.display = 'flex';
  }

  // ───────── 상대 AI 로직
  const VAL = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
  const threatened = (side, c, r) => pieces.some((q) => q.side !== side && q.hp > 0 && moves(q).some((m) => m.c === c && m.r === r));

  function aiMove() {
    if (result) return;
    let best = null;
    const foes = pieces.filter((q) => q.side === 'foe' && q.hp > 0 && q.stunned <= 0);

    for (const p of foes) {
      const pMoves = moves(p);
      for (const m of pMoves) {
        let score = Math.random() * 0.5;
        if (m.hit) {
          const willKill = m.hit.hp <= p.atk;
          score += VAL[m.hit.type] * (willKill ? 12 : 4);
        }
        if (threatened('foe', p.col, p.row)) score += VAL[p.type] * 1.5;
        if (threatened('foe', m.c, m.r)) score -= VAL[p.type] * 2.0;
        score += (7 - m.r) * 0.1; // 전진 선호

        if (!best || score > best.score) best = { p, m, score };
      }
    }

    if (best) {
      act(best.p, best.m);
    } else {
      endTurn();
    }
  }

  // ───────── 화면 기물 및 판 클릭 판정
  function cellAt(mx, my) {
    const [X, Z] = unproject(mx, my);
    const c = Math.round(X + 3.5), r = Math.round(Z + 3.5);
    return inside(c, r) && Math.abs(X + 3.5 - c) <= 0.5 && Math.abs(Z + 3.5 - r) <= 0.5 ? { c, r } : null;
  }

  function pieceAt(mx, my) {
    let best = null;
    for (const p of pieces) {
      if (p.hp <= 0 || !p.box) continue;
      const [x0, y0, x1, y1] = p.box;
      if (mx >= x0 && mx <= x1 && my >= y0 && my <= y1) {
        if (!best || p.depth < best.depth) best = p;
      }
    }
    return best;
  }

  // ───────── 그리기
  const COL = { light: '#e3cf9f', dark: '#6d7a5c', frame: '#c2ad86', side: ['#5b5349', '#4a433b', '#38322c'] };
  function poly(pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }
  const quad = (x0, z0, x1, z1, y = 0) => [P3(x0, y, z0), P3(x1, y, z0), P3(x1, y, z1), P3(x0, y, z1)];

  function texQuad(img, sx, sy, sw, sh, p0, p1, p2, p3) {
    const tri = (a, b, c, ua, va, ub, vb, uc, vc) => {
      ctx.save();
      const gx = (a[0] + b[0] + c[0]) / 3, gy = (a[1] + b[1] + c[1]) / 3;
      const grow = (q) => { const dx = q[0] - gx, dy = q[1] - gy, l = Math.hypot(dx, dy) || 1; return [q[0] + dx / l * 0.8, q[1] + dy / l * 0.8]; };
      const [A, Bq, C] = [grow(a), grow(b), grow(c)];
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.lineTo(C[0], C[1]); ctx.closePath();
      ctx.clip();
      const den = ua * (vb - vc) + ub * (vc - va) + uc * (va - vb);
      const m11 = (a[0] * (vb - vc) + b[0] * (vc - va) + c[0] * (va - vb)) / den;
      const m12 = (a[1] * (vb - vc) + b[1] * (vc - va) + c[1] * (va - vb)) / den;
      const m21 = (a[0] * (uc - ub) + b[0] * (ua - uc) + c[0] * (ub - ua)) / den;
      const m22 = (a[1] * (uc - ub) + b[1] * (ua - uc) + c[1] * (ub - ua)) / den;
      const dx = (a[0] * (ub * vc - uc * vb) + b[0] * (uc * va - ua * vc) + c[0] * (ua * vb - ub * va)) / den;
      const dy = (a[1] * (ub * vc - uc * vb) + b[1] * (uc * va - ua * vc) + c[1] * (ua * vb - ub * va)) / den;
      ctx.transform(m11, m12, m21, m22, dx, dy);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    tri(p0, p1, p2, sx, sy, sx + sw, sy, sx + sw, sy + sh);
    tri(p0, p2, p3, sx, sy, sx + sw, sy + sh, sx, sy + sh);
  }

  function drawBackground() {
    const im = IMG.bg || IMG.stage, s = Math.max(W / im.width, H / im.height) * 1.06;
    ctx.save(); ctx.filter = IMG.bg ? 'brightness(0.9)' : 'blur(6px) brightness(0.55) saturate(0.85)';
    ctx.drawImage(im, (W - im.width * s) / 2 - cam.yaw * 2, (H - im.height * s) / 2, im.width * s, im.height * s);
    ctx.restore();
    const g = ctx.createRadialGradient(800, 470, 300, 800, 470, 1000);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawBoard() {
    const B = 4.5, T = 1.0;
    ctx.save(); ctx.filter = 'blur(18px)'; poly(quad(-B - 0.3, -B - 0.5, B + 0.5, B + 0.3, -T - 0.02), 'rgba(0,0,0,.5)'); ctx.restore();
    const c = Math.cos(rad(cam.yaw)), s = Math.sin(rad(cam.yaw));
    const edges = [[[-B, -B], [B, -B], [0, -1]], [[B, -B], [B, B], [1, 0]], [[B, B], [-B, B], [0, 1]], [[-B, B], [-B, -B], [-1, 0]]];
    for (const [[ax, az], [bx, bz], [nx, nz]] of edges) {
      const zr = -nx * s + nz * c, xr = nx * c + nz * s;
      if (zr >= 0) continue;
      if (IMG.wall) {
        const im = IMG.wall, n = Math.round(2 * B / T), sw = im.width / 3;
        for (let i = 0; i < n; i++) {
          const k0 = i / n, k1 = (i + 1) / n;
          const x0 = lerp(ax, bx, k0), z0 = lerp(az, bz, k0), x1 = lerp(ax, bx, k1), z1 = lerp(az, bz, k1);
          texQuad(im, sw * (i % 3), 0, sw, im.height, P3(x0, 0.02, z0), P3(x1, 0.02, z1), P3(x1, -T, z1), P3(x0, -T, z0));
        }
        if (xr > 0.3) poly([P3(ax, 0, az), P3(bx, 0, bz), P3(bx, -T, bz), P3(ax, -T, az)], 'rgba(0,0,0,.25)');
      } else poly([P3(ax, 0, az), P3(bx, 0, bz), P3(bx, -T, bz), P3(ax, -T, az)], xr < 0 ? COL.side[0] : COL.side[1]);
    }
    poly(quad(-B, -B, B, B), COL.frame);
    poly(quad(-4.08, -4.08, 4.08, 4.08), '#8e7c5f');
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const [X, Z] = cellXZ(col, r);
      const p0 = P3(X - 0.5, 0, Z + 0.5), p1 = P3(X + 0.5, 0, Z + 0.5), p2 = P3(X + 0.5, 0, Z - 0.5), p3 = P3(X - 0.5, 0, Z - 0.5);
      if (IMG.board) { const cw = IMG.board.width / N, ch = IMG.board.height / N; texQuad(IMG.board, col * cw, (N - 1 - r) * ch, cw, ch, p0, p1, p2, p3); }
      else poly([p0, p1, p2, p3], (r + col) % 2 === 1 ? COL.light : COL.dark);
    }
    ctx.fillStyle = 'rgba(255,240,210,.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      const a = P3(i - 3.5, 0, -4.29), b = P3(-4.29, 0, i - 3.5);
      ctx.font = `700 ${Math.round(a[2] * 0.2)}px "Malgun Gothic"`; ctx.fillText('abcdefgh'[i], a[0], a[1]);
      ctx.font = `700 ${Math.round(b[2] * 0.2)}px "Malgun Gothic"`; ctx.fillText(String(i + 1), b[0], b[1]);
    }
  }

  function drawMarks(t) {
    if (hoverCell && !anims.length) {
      const [X, Z] = cellXZ(hoverCell.c, hoverCell.r);
      poly(quad(X - 0.5, Z - 0.5, X + 0.5, Z + 0.5), 'rgba(255,255,255,.16)', 'rgba(255,255,255,.7)', 2);
    }
    if (sel) {
      const [X, Z] = cellXZ(sel.col, sel.row);
      poly(quad(X - 0.5, Z - 0.5, X + 0.5, Z + 0.5), 'rgba(255,214,90,.38)', '#ffd65a', 3);
    }
    for (const m of marks) {
      const [X, Z] = cellXZ(m.c, m.r);
      if (m.hit) {
        poly(quad(X - 0.46, Z - 0.46, X + 0.46, Z + 0.46), 'rgba(255,70,60,.32)', '#ff5a4a', 3);
        continue;
      }
      const pts = [];
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * 6.283;
        pts.push(P3(X + Math.cos(a) * 0.15, 0, Z + Math.sin(a) * 0.15));
      }
      poly(pts, `rgba(255,236,170,${0.55 + 0.15 * Math.sin(t * 5)})`, 'rgba(90,60,20,.5)', 1.5);
    }
    // 스킬 타겟 마커 (보라색 / 청록색)
    for (const sm of skillTargetMarks) {
      const [X, Z] = cellXZ(sm.c, sm.r);
      poly(quad(X - 0.46, Z - 0.46, X + 0.46, Z + 0.46), 'rgba(155,89,182,0.35)', '#9b59b6', 3);
    }
  }

  function shadow(X, Z, lift, r = 0.36) {
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; pts.push(P3(X + 0.06 + Math.cos(a) * r, 0, Z - 0.08 + Math.sin(a) * r * 0.9)); }
    ctx.save(); ctx.filter = 'blur(5px)'; poly(pts, `rgba(0,0,0,${0.5 / (1 + lift * 1.5)})`); ctx.restore();
  }

  // 팔: 어깨에서 ang 방향으로 (그림은 오른쪽을 향해 누워 있음). 왼쪽을 칠 땐 위아래를 뒤집어 손등이 위로
  function drawArm(p, sx, sy, k) {
    const A = p.arm, img = ARM[A.id];
    const len = 0.9 * k, L = len * A.ext * A.vis;
    A.tip = [sx + Math.cos(A.ang) * L, sy + Math.sin(A.ang) * L];
    if (!img) return;
    const hgt = len * img.height / img.width * A.vis;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    if (p.flash > 0) ctx.filter = `brightness(${1 + p.flash * 6})`;
    ctx.translate(sx, sy); ctx.rotate(A.ang);
    if (Math.cos(A.ang) < -0.05) ctx.scale(1, -1);
    ctx.drawImage(img, -L * 0.06, -hgt / 2, L, hgt);
    ctx.restore();
  }
  // 떨어지는 소품 (치즈 바퀴 · 상자)
  function drawProps() {
    for (const pr of props) {
      const [x, y, k] = P3(pr.x, pr.y, pr.z), w = pr.w * k, h = w * pr.img.height / pr.img.width * pr.sq;
      ctx.save(); ctx.globalAlpha = pr.alpha; ctx.translate(x, y); ctx.rotate(pr.rot);
      ctx.drawImage(pr.img, -w / 2, -h, w, h);
      ctx.restore();
    }
  }
  function drawScrFx() {
    for (const e of scrFx) {
      const u = clamp(e.t / e.life, 0, 1), w = lerp(e.w[0], e.w[1], u), h = w * e.img.height / e.img.width;
      ctx.save(); ctx.globalAlpha = 1 - u; if (e.add) ctx.globalCompositeOperation = 'lighter';
      ctx.translate(e.x, e.y); ctx.rotate(e.rot); ctx.drawImage(e.img, -w / 2, -h / 2, w, h); ctx.restore();
    }
  }

  // 튀어나온 동안 원래 칸에 남는 빈 받침
  function drawBase(p) {
    const im = BASE[p.def.art]; if (!im) return;
    const X = p.col - 3.5, Z = p.row - 3.5, [fx, fy, k] = P3(X, 0, Z);
    const scaleMod = (p.isBoss ? 1.4 : 1.0) * (p.type === 'king' ? 1.15 : (p.type === 'queen' ? 1.08 : 1.0));
    // 빈 받침은 시트 배율이 달라 체스 말 그림 폭의 0.72 로 맞춤
    const w = FIG[p.def.art].width * 0.72 * PX * k * scaleMod, h = w * im.height / im.width, bs = p.baseSq ?? 1;
    shadow(X, Z, 0, 0.34);
    ctx.save(); ctx.translate(fx, fy - 4); ctx.scale(1 / Math.sqrt(bs), bs);
    ctx.drawImage(im, -w / 2, -h * (1 - FOOT), w, h);
    ctx.restore();
  }

  // ───────── 기물 피규어 그리기 (체스말 변형 피규어 art/chess/fig/*.png)
  function drawPiece(p, t) {
    const X = p.x - 3.5, Z = p.z - 3.5, Y = p.y + p.lift;
    shadow(X, Z, Y, 0.38);
    const [fx, fy, k] = P3(X, Y, Z);
    const isSel = p === sel, isHover = p === hover;


    // 2. 체스말 피규어 렌더링
    const im = (p.popped && BODY[p.def.art]) || p.img || (p.def && FIG[p.def.art]) || (UNITS[p.side] && UNITS[p.side][p.type] && FIG[UNITS[p.side][p.type].art]);
    if (!im) return;
    const native = p.side === 'ally' ? 1 : -1, flip = (p.face != null ? p.face : native) !== native;
    const scaleMod = (p.isBoss ? 1.4 : 1.0) * (p.type === 'king' ? 1.15 : (p.type === 'queen' ? 1.08 : 1.0));
    // 몸 그림은 시트가 달라 배율이 다름 → 원래 체스 말 높이의 0.8 로 맞춤
    const hRef = (p.popped ? FIG[p.def.art].height * 0.8 : im.height) * PX * k * scaleMod;
    const h = hRef, w = hRef * im.width / im.height;

    const br = Math.sin(t * 2.2 + p.seed);
    const sq = p.sq ?? 1;  // 납작 (맞음 · 깔림)
    const sy = (1 + 0.02 * br + 0.08 * p.hop) * sq;
    const sx = (1 - 0.01 * br - 0.04 * p.hop) / Math.sqrt(sq);
    let rot = (flip ? -1 : 1) * 0.03 * Math.sin(t * 1.5 + p.seed) + p.tilt;

    if (p.dying != null) {
      rot += (flip ? 1 : -1) * 1.35 * Math.min(1, p.dying / 0.35);
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    if (p.flash > 0) ctx.filter = `brightness(${1 + p.flash * 6})`;
    ctx.translate(fx, fy - 4);
    ctx.rotate(rot);
    ctx.scale(flip ? -sx : sx, sy);
    ctx.drawImage(im, -w / 2, -h * (1 - FOOT), w, h);
    ctx.restore();

    // 어깨 = 몸 윗부분, 보는 쪽으로 살짝 (팔은 여기서 뻗음)
    const fs = p.face != null ? p.face : native;
    if (p.popped) {  // 몸 그림의 앞 어깨
      const sh = SHOULDER[p.def.art] || [0.58, 0.4], top = fy - 4 - h * (1 - FOOT) * sy;
      p.shoulder = [fx + (sh[0] - 0.5) * w * sx * (flip ? -1 : 1), top + sh[1] * h * sy];
    } else p.shoulder = [fx + fs * w * 0.16 + Math.sin(rot) * h * 0.55, fy - 4 - h * 0.56 * sy * Math.cos(rot)];
    p.armK = k;

    p.box = [fx - w * 0.45, fy - h, fx + w * 0.45, fy + 8];
    p.head = [fx, fy - h - 14, k];

    // 기절 표시
    if (p.stunned > 0) {
      ctx.save();
      ctx.font = '700 24px "Malgun Gothic"';
      ctx.fillStyle = '#f1c40f';
      ctx.textAlign = 'center';
      ctx.fillText('💫 기절', fx, fy - h - 38);
      ctx.restore();
    }
  }

  // 하트 그림 색 입힘 (빨강 = 남은 체력, 회색 = 깎인 체력)
  const tintHeart = (col) => {
    const im = IMG.heart, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = col; x.globalAlpha = 0.85; x.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const HEART = { red: tintHeart('#e8473c'), gray: tintHeart('#4a4552') };
  // 기물 머리 위 뱃지 (레벨 별 · 공격력 · 체력)
  function drawPieceBadges(p, x, y, k) {
    if (p.hp <= 0 || p.dying != null) return;
    const isFocused = p === hover || p === sel || p.hp < p.maxHp || p.atk > 1 || p.level > 1;
    if (!isFocused && p.side === 'foe') return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. 레벨 별 (Lv.2 이상)
    if (p.level > 1) {
      ctx.font = '800 16px "Malgun Gothic"';
      ctx.fillStyle = '#ffd359';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const stars = p.level === 2 ? '★★' : '★★★';
      ctx.strokeText(stars, x, y - 22);
      ctx.fillText(stars, x, y - 22);
    }

    // 2. 공격력 뱃지
    if (p.atk > 1) {
      ctx.font = '800 13px "Malgun Gothic"';
      ctx.fillStyle = '#ff7675';
      ctx.strokeStyle = '#220808';
      ctx.lineWidth = 3;
      ctx.strokeText(`⚔️${p.atk}`, x - 32, y);
      ctx.fillText(`⚔️${p.atk}`, x - 32, y);
    }

    // 3. 체력 하트
    const w = k * 0.15, gap = w * 0.92, x0 = x - (p.maxHp - 1) * gap / 2;
    for (let i = 0; i < p.maxHp; i++) {
      const im = i < p.hp ? HEART.red : HEART.gray;
      ctx.drawImage(im, x0 + i * gap - w / 2, y - w * 0.45, w, w * im.height / im.width);
    }

    ctx.restore();
  }

  // ───────── 단일 이펙트 렌더링
  function drawSingleFx(e) {
    const [sx, sy, k] = P3(e.x, e.y, e.z);
    const u = clamp(e.t / e.life, 0, 1);
    const w = e.w * 130 * (k / 180), h = w * e.img.height / e.img.width;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(e.rot);
    if (e.flip) ctx.scale(-1, 1);
    ctx.globalAlpha = Math.sin(u * Math.PI);
    if (e.add) ctx.globalCompositeOperation = 'lighter';
    const im = e.seq ? FX[`${e.key}_${Math.min(e.seq, 1 + Math.floor(u * e.seq))}`] : e.img;
    if (im) ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawSingleProj(pr) {
    const [sx, sy, k] = P3(pr.x, pr.y, pr.z);
    const w = pr.w * 130 * (k / 180), h = w * pr.img.height / pr.img.width;
    ctx.save();
    ctx.translate(sx, sy);
    if (pr.kind === 'magic') {
      ctx.rotate(T * 12);
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.drawImage(pr.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawDamageNumbers() {
    for (const dp of dmgPops) {
      const [sx, sy] = P3(dp.x, dp.y, dp.z);
      const u = dp.t / dp.life;
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, u - 0.6) / 0.4;
      ctx.font = '900 44px "Malgun Gothic"';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#1b0906';
      ctx.strokeText(dp.text, sx, sy);
      ctx.fillStyle = dp.text.includes('+') ? '#2ecc71' : (dp.text.includes('!') ? '#ffd359' : '#ff5a4a');
      ctx.fillText(dp.text, sx, sy);
      ctx.restore();
    }
  }

  function drawPuffs(dt) {
    for (const d of puffs) {
      d.t += dt; d.x += d.vx * dt; d.z += d.vz * dt; d.vx *= 0.9; d.vz *= 0.9;
      const [x, y, k] = P3(d.x - 3.5, 0.05 + d.t * 0.4, d.z - 3.5), a = Math.max(0, 1 - d.t / 0.45);
      ctx.fillStyle = `rgba(232,220,196,${0.6 * a})`; ctx.beginPath(); ctx.arc(x, y, k * (0.05 + d.t * 0.12), 0, 6.283); ctx.fill();
    }
    puffs = puffs.filter((d) => d.t < 0.45);
  }

  // ───────── 좌측 UI 정보 패널 갱신
  function updateInfo() {
    const p = hover || sel;
    const nameEl = $('#info-name'), typeEl = $('#info-type'), starsEl = $('#info-stars');
    const atkEl = $('#info-atk'), hpEl = $('#info-hp'), descEl = $('#info-desc');
    const figImg = $('#info-fig'), skillBox = $('#skill-box'), skillBtn = $('#skill-btn');

    if (!p) {
      nameEl.textContent = '체스말 선택 대기';
      typeEl.textContent = '말을 클릭하여 이동 및 스킬 확인';
      starsEl.textContent = '—';
      atkEl.textContent = '—';
      hpEl.textContent = '—';
      descEl.innerHTML = '내 기물(쥐)을 클릭하면 갈 수 있는 칸(파란색)과 공격 칸(빨간색)이 표시됩니다.';
      figImg.src = '../../art/chess/fig/fieldmouse.png';
      skillBox.style.display = 'none';
      return;
    }

    figImg.src = `../../art/chess/fig/${p.def.art}.png`;
    nameEl.textContent = p.def.name;
    typeEl.textContent = `${TYPES[p.type].mark} ${TYPES[p.type].name} · ${p.side === 'ally' ? '쥐 왕국' : '흑묘 기사단'}`;
    starsEl.textContent = `★ Lv.${p.level || 1}`;
    atkEl.textContent = `⚔️ ${p.atk}`;
    hpEl.textContent = `❤️ ${p.hp}/${p.maxHp}`;
    descEl.innerHTML = `<b>특수능력</b><br>${p.def.abil || '없음'}`;

    if (p.side === 'ally' && p.def.skillName) {
      skillBox.style.display = 'block';
      if (p.cooldown > 0) {
        skillBtn.disabled = true;
        skillBtn.className = '';
        skillBtn.textContent = `⏳ ${p.def.skillName} (쿨다운 ${p.cooldown}턴)`;
      } else {
        skillBtn.disabled = false;
        skillBtn.className = skillTargetMode ? 'active' : '';
        skillBtn.textContent = `⚡ 스킬: ${p.def.skillName} (${skillTargetMode ? '취소' : '준비됨'})`;
      }
      $('#skill-tip').textContent = p.def.skillDesc;
    } else {
      skillBox.style.display = 'none';
    }
  }

  // 스킬 타겟 모드 토글
  function toggleSkillMode() {
    if (!sel || sel.side !== 'ally' || sel.cooldown > 0) return;
    skillTargetMode = !skillTargetMode;
    skillTargetMarks = [];

    if (skillTargetMode) {
      marks = [];
      const p = sel;
      // 기물별 스킬 타겟 칸 산출
      if (p.type === 'pawn') {
        const nr = p.row + 1;
        if (inside(p.col, nr) && at(p.col, nr)?.side === 'foe') skillTargetMarks.push({ c: p.col, r: nr });
      } else if (p.type === 'knight') {
        for (let s = 1; s <= 2; s++) {
          const nr = p.row + s;
          if (inside(p.col, nr)) skillTargetMarks.push({ c: p.col, r: nr });
        }
      } else if (p.type === 'bishop') {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (Math.hypot(c - p.col, r - p.row) <= 3.2 && at(c, r)?.side === 'foe') skillTargetMarks.push({ c, r });
        }
      } else if (p.type === 'rook') {
        for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          for (let s = 1; s < N; s++) {
            const nc = p.col + dc * s, nr = p.row + dr * s;
            if (!inside(nc, nr)) break;
            const o = at(nc, nr);
            if (o) {
              if (o.side === 'foe') skillTargetMarks.push({ c: nc - dc, r: nr - dr, hitCol: nc, hitRow: nr });
              break;
            }
          }
        }
      } else if (p.type === 'queen') {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (Math.hypot(c - p.col, r - p.row) <= 3.5 && at(c, r)?.side === 'foe') skillTargetMarks.push({ c, r });
        }
      } else if (p.type === 'king') {
        skillTargetMarks.push({ c: p.col, r: p.row });
      }
    } else {
      if (sel) marks = moves(sel);
    }
    updateInfo();
  }

  // ───────── 이벤트 리스너
  $('#skill-btn').addEventListener('click', toggleSkillMode);
  $('#btn-restart').addEventListener('click', startNewRun);
  $('#btn-gameover-retry').addEventListener('click', startNewRun);
  $('#btn-victory-retry').addEventListener('click', startNewRun);

  let lastMouse = [800, 450];
  cv.addEventListener('mousemove', (e) => { lastMouse = mouse(e); });

  cv.addEventListener('click', (e) => {
    if (busy || turn !== 'ally' || anims.length || combat) return;
    const [mx, my] = mouse(e);
    const p = pieceAt(mx, my);
    const cell = cellAt(mx, my);

    if (skillTargetMode && sel) {
      if (cell) {
        const target = skillTargetMarks.find((sm) => sm.c === cell.c && sm.r === cell.r);
        if (target) {
          executeSkill(sel, target);
          return;
        }
      }
      skillTargetMode = false;
      skillTargetMarks = [];
      updateInfo();
    }

    if (sel) {
      if (cell) {
        const m = marks.find((mk) => mk.c === cell.c && mk.r === cell.r);
        if (m) {
          act(sel, m);
          return;
        }
      }
      if (p && p.side === 'ally') {
        sel = p;
        marks = moves(p);
        updateInfo();
        return;
      }
      sel = null; marks = [];
      updateInfo();
    } else {
      if (p && p.side === 'ally') {
        sel = p;
        marks = moves(p);
        updateInfo();
      }
    }
  });

  const yawInput = $('#yaw'), pitchInput = $('#pitch');
  yawInput.value = cam.yaw; pitchInput.value = cam.pitch;
  yawInput.addEventListener('input', () => (cam.ty = +yawInput.value));
  pitchInput.addEventListener('input', () => (cam.tp = +pitchInput.value));

  addEventListener('keydown', (e) => {
    if (e.key === 'q' || e.key === 'Q') { cam.ty = clamp(cam.ty - 10, -30, 30); yawInput.value = cam.ty; }
    if (e.key === 'e' || e.key === 'E') { cam.ty = clamp(cam.ty + 10, -30, 30); yawInput.value = cam.ty; }
    if (e.key === 'r' || e.key === 'R') startNewRun();
  });

  // ───────── 루프 & 애니메이션
  let last = performance.now(), T = 0, hitstop = 0;

  function step(dt) {
    T += dt;
    cam.yaw += (cam.ty - cam.yaw) * Math.min(1, dt * 6);
    cam.pitch += (cam.tp - cam.pitch) * Math.min(1, dt * 6);
    autofit();
    // 전투 중엔 두 기물 사이로 당겨 확대 (캣 체스처럼)
    const zt = combat ? 1.9 : 1;
    if (combat) { cam.fx = lerp(cam.fx, (combat.a.x + combat.d.x) / 2 - 3.5, Math.min(1, dt * 8)); cam.fz = lerp(cam.fz, (combat.a.z + combat.d.z) / 2 - 3.5, Math.min(1, dt * 8)); }
    cam.z += (zt - cam.z) * Math.min(1, dt * (combat ? 7 : 4));
    if (cam.z > 1.003) {
      const k = Math.min(1, (cam.z - 1) / 0.9), p0 = P3(cam.fx, 0.6, cam.fz);
      cam.F *= cam.z; cam.cx = 800 + (cam.cx - 800) * cam.z; cam.cy = 450 + (cam.cy - 450) * cam.z;
      const p1 = P3(cam.fx, 0.6, cam.fz);
      cam.cx += lerp(p0[0], 800, k) - p1[0]; cam.cy += lerp(p0[1], 520, k) - p1[1];
    }

    for (const a of anims) {
      a.t += dt;
      const u = clamp(a.t / a.dur, 0, 1), p = a.p;
      const k = a.back ? (u < 0.5 ? ease(u * 2) : ease((1 - u) * 2)) : ease(u);
      p.x = lerp(a.fx, a.tx, k); p.z = lerp(a.fz, a.tz, k);
      p.y = Math.sin((a.back ? k : u) * Math.PI) * a.high * (a.back ? 0.5 : 1);
      p.hop = u < 1 ? Math.sin(u * Math.PI) : 0;
      if (u >= 1) {
        p.x = a.back ? a.fx : a.tx; p.z = a.back ? a.fz : a.tz; p.y = 0; p.hop = 0;
        a.end = true; a.done && a.done();
      }
    }
    anims = anims.filter((a) => !a.end);

    for (const p of pieces) {
      p.flash = Math.max(0, p.flash - dt);
      p.lift += ((p === sel ? 0.18 : p === hover ? 0.07 : 0) - p.lift) * Math.min(1, dt * 12);
      if (p.dying != null) {
        p.dying += dt;
        p.alpha = Math.max(0, 1 - p.dying / 0.45);
      }
    }
    pieces = pieces.filter((p) => !(p.dying != null && p.dying > 0.45));
    shake = Math.max(0, shake - dt * 38);

    for (const e of boardFx) {
      e.t += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; e.rot += e.vr * dt;
    }
    boardFx = boardFx.filter((e) => e.t < e.life);

    for (const tw of tweens) { tw.t += dt; const u = clamp(tw.t / tw.dur, 0, 1); tw.fn(u); if (u >= 1) { tw.end = true; tw.done(); } }
    tweens = tweens.filter((tw) => !tw.end);
    for (const e of scrFx) e.t += dt;
    scrFx = scrFx.filter((e) => e.t < e.life);
    for (const pr of projectiles) {
      pr.t += dt;
      const u = clamp(pr.t / pr.dur, 0, 1);
      pr.x = lerp(pr.fx, pr.tx, u); pr.z = lerp(pr.fz, pr.tz, u);
      pr.y = lerp(pr.fy, pr.ty, u) + Math.sin(u * Math.PI) * 0.45;
      if (Math.random() < 0.5) {
        boardFxAdd('puff', pr.x, pr.y, pr.z, { w: 0.35, life: 0.22, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15, vz: (Math.random() - 0.5) * 0.15 });
      }
      if (u >= 1 && !pr.ended) { pr.ended = true; pr.done && pr.done(); }
    }
    projectiles = projectiles.filter((pr) => !pr.ended);

    for (const dp of dmgPops) { dp.t += dt; dp.y += dt * 0.7; }
    dmgPops = dmgPops.filter((dp) => dp.t < dp.life);

    flashA = Math.max(0, flashA - dt * 3);
    turnBanner = Math.max(0, turnBanner - dt);

    const [mx, my] = lastMouse;
    hover = anims.length || combat ? null : pieceAt(mx, my);
    hoverCell = hover ? { c: hover.col, r: hover.row } : cellAt(mx, my);
    cv.style.cursor = hover || (hoverCell && marks.some((m) => m.c === hoverCell.c && m.r === hoverCell.r)) ? 'pointer' : 'default';
  }

  function draw(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.imageSmoothingQuality = 'high';
    drawBackground();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBoard();
    drawMarks(T);

    // 3D 깊이(Depth) 정렬
    const renderables = [];
    for (const p of pieces) {
      renderables.push({ type: 'piece', obj: p, depth: P3(p.x - 3.5, 0, p.z - 3.5)[3] });
      if (p.popped) renderables.push({ type: 'base', obj: p, depth: P3(p.col - 3.5, 0, p.row - 3.5)[3] + 0.01 });
    }
    for (const e of boardFx) {
      if (e.t < 0) continue;
      renderables.push({ type: 'fx', obj: e, depth: P3(e.x, e.y, e.z)[3] });
    }
    for (const pr of projectiles) {
      renderables.push({ type: 'proj', obj: pr, depth: P3(pr.x, pr.y, pr.z)[3] });
    }
    renderables.sort((a, b) => b.depth - a.depth);

    for (const item of renderables) {
      if (item.type === 'piece') {
        item.obj.depth = item.depth;
        drawPiece(item.obj, T);
      } else if (item.type === 'base') {
        drawBase(item.obj);
      } else if (item.type === 'fx') {
        drawSingleFx(item.obj);
      } else if (item.type === 'proj') {
        drawSingleProj(item.obj);
      }
    }

    drawPuffs(dt);
    for (const p of pieces) if (p.arm && p.arm.vis > 0.01 && p.shoulder) drawArm(p, p.shoulder[0], p.shoulder[1], p.armK);
    drawProps();
    drawScrFx();
    drawDamageNumbers();

    // 머리 위 뱃지 (레벨 · 공격력 · 하트)
    for (const p of pieces) {
      if (p.head && p.hp > 0 && p.dying == null) {
        drawPieceBadges(p, p.head[0], p.head[1], p.head[2]);
      }
    }

    drawTurn();
  }

  function drawTurn() {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!result) {
      const ally = turn === 'ally', el = $('#st-turn');
      if (el && el.dataset.t !== turn) { el.dataset.t = turn; el.textContent = ally ? '내 차례' : '상대 차례'; el.className = ally ? 'ally' : 'foe'; }

      if (turnBanner > 0 && !combat) {
        const a = Math.min(1, turnBanner / 0.3, (1.0 - turnBanner) / 0.2);
        ctx.globalAlpha = a; ctx.fillStyle = 'rgba(10,12,22,.65)'; ctx.fillRect(0, 410, W, 80);
        ctx.font = '900 46px "Malgun Gothic"'; ctx.fillStyle = ally ? '#9fd0ff' : '#ffb0a0'; ctx.fillText(ally ? '내 차례' : '상대 차례', 800, 452);
      }
    }
    ctx.restore();
  }

  function frame(now) {
    const tNow = (typeof now === 'number' && Number.isFinite(now)) ? now : performance.now();
    let dt = Math.min(0.05, Math.max(0.001, (tNow - last) / 1000));
    if (!Number.isFinite(dt)) dt = 0.016;
    last = tNow;
    if (hitstop > 0) {
      hitstop -= dt;
      dt *= 0.06;
    }
    step(dt); draw(dt);
    requestAnimationFrame(frame);
  }

  // 런 시작!
  startNewRun();
  requestAnimationFrame(frame);

  window.__chess = {
    get pieces() { return pieces; },
    get run() { return run; },
    get turn() { return turn; },
    get result() { return result; },
    get combat() { return combat; },
    act, moves, executeSkill, startNewRun, advanceNextStage,
    UNITS, FIG,
    tick: (dt = 0.016) => { step(dt); draw(dt); }
  };
})().catch((e) => {
  document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#f66;padding:16px;position:relative;z-index:9">${e.stack || e}</pre>`);
  throw e;
});
