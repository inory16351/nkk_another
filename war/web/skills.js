// 쥐 전쟁 시뮬 — 육각 벌집 스킬판 · 병종 결정
// 가운데 '신병' 칸에서 시작해 이웃 칸으로만 넓혀 감. 판은 여섯 갈래(위부터 시계 방향):
//   0 사격 · 1 화력 · 2 폭파 · 3 기동 · 4 지원 · 5 정찰
// 많이 찍은 갈래가 병종을 정함 (2칸 이상). 사격+정찰 · 지원+정찰을 비슷하게 찍으면 혼합 병종(통신병 · 주술사).
// 진급할 때마다 1점 (신병은 1점 들고 시작).

const SECTORS = [
  { name: '사격', col: '#d9c36a' },
  { name: '화력', col: '#d9824a' },
  { name: '폭파', col: '#c8563f' },
  { name: '기동', col: '#6fa8d8' },
  { name: '지원', col: '#7fbf8a' },
  { name: '정찰', col: '#9b86c9' },
];

// 병종: 무기 · 기본치 · 기본 능력. 판의 갈래로 정해짐 (from = 갈래 번호, 혼합은 두 개)
const RAT_CLASSES = {
  recruit:  { name: '소총수',     from: [],     hp: 6, aim: 65, mob: 6, weapon: 'rifle',   grenades: 1, abil: ['shoot', 'grenade', 'scurry', 'overwatch'], desc: '아직 길이 정해지지 않은 신병. 잽싼 발로 위기를 피함' },
  sniper:   { name: '저격수',     from: [0],    hp: 5, aim: 72, mob: 6, weapon: 'sniper',  sight: 2, abil: ['shoot', 'ambush', 'overwatch'], desc: '쥐구멍에 숨어 먼 거리 한 발. 가까우면 약함' },
  gunner:   { name: '기관총 사수', from: [1],    hp: 7, aim: 60, mob: 5, weapon: 'lmg',     abil: ['shoot', 'suppress', 'warcry', 'overwatch'], desc: '연사 · 제압. 찍찍 함성으로 분대 사기를 올림' },
  engineer: { name: '공병',       from: [2],    hp: 6, aim: 64, mob: 6, weapon: 'rifle',   grenades: 2, charges: 2, abil: ['shoot', 'grenade', 'charge', 'gnaw', 'overwatch'], desc: '폭약으로 벽까지 날리고, 철조망을 갉아 끊고, 땅굴을 팜' },
  commando: { name: '코만도',     from: [3],    hp: 6, aim: 66, mob: 7, weapon: 'smg',     grenades: 1, def: 5, climb: true, abil: ['shoot', 'knife', 'grenade', 'overwatch'], desc: '벽을 타고 넘어 파고들어 칼로 끝냄. 칼은 소리가 안 남' },
  medic:    { name: '의무병',     from: [4],    hp: 6, aim: 62, mob: 6, weapon: 'smg',     medkits: 2, cheese: 2, abil: ['shoot', 'firstaid', 'cheese', 'overwatch'], desc: '동료를 살려 내고 치즈로 정신을 차리게 함' },
  scout:    { name: '정찰병',     from: [5],    hp: 5, aim: 66, mob: 7, weapon: 'rifle',   sight: 2, whisker: 3, abil: ['shoot', 'mark', 'overwatch'], desc: '수염으로 벽 너머 적을 느끼고 표적을 찍어 줌' },
  radio:    { name: '통신병',     from: [0, 5], hp: 6, aim: 63, mob: 6, weapon: 'smg',     abil: ['shoot', 'command', 'radioscan', 'overwatch'], desc: '사격 + 정찰: 쥐떼 전령으로 멀리 있는 아군까지 지휘 · 무전 탐지' },
  shaman:   { name: '주술사',     from: [4, 5], hp: 5, aim: 60, mob: 6, weapon: 'smg',     psi: 3, abil: ['shoot', 'dominate', 'ward', 'overwatch'], desc: '지원 + 정찰: 적의 정신을 붙잡아 조종하고, 아군에게 마법 방어막' },
};

// 칸 효과. 숫자 = 능력치 더하기, abil = 능력 추가, perk = 특수 효과 (game.js 가 읽음)
// 갈래마다: r1 = 첫 칸, r2 = 둘째 줄 꼭짓점(핵심), r3 = 셋째 줄 꼭짓점(정점), side = 셋째 줄 옆 칸 두 개, small = 경계 칸에 섞이는 작은 값
const NODE_FX = [
  { r1: { aim: 5 }, r2: { abil: 'aimed', name: '정조준' }, r3: { crit: 15, name: '명사수' }, side: [{ aim: 5 }, { sight: 1 }], small: { aim: 3 } },
  { r1: { hp: 1 }, r2: { abil: 'suppress', name: '제압 사격' }, r3: { clip: 2, name: '긴 탄띠' }, side: [{ hp: 1 }, { dmg: 1 }], small: { hp: 1 } },
  { r1: { grenades: 1 }, r2: { abil: 'tunnel', name: '땅굴 파기' }, r3: { abil: 'flame', name: '화염방사기 장착' }, side: [{ blast: 0.5, name: '고폭 수류탄' }, { boom: 2, charges: 1, name: '폭파 전문' }], small: { grenades: 1 } },
  { r1: { mob: 1 }, r2: { abil: 'knife', name: '근접 격투' }, r3: { def: 10, mob: 1, name: '날쌘 발' }, side: [{ perk: 'closeq', name: '근접 사격' }, { def: 5 }], small: { def: 3 } },
  { r1: { abil: 'firstaid', medkits: 1, name: '응급 처치' }, r2: { perk: 'revive', name: '구출' }, r3: { heal: 2, name: '야전 의무' }, side: [{ medkits: 1 }, { hp: 1 }], small: { hp: 1 } },
  { r1: { sight: 1 }, r2: { perk: 'sentry', name: '노련한 경계' }, r3: { perk: 'ghost', name: '조용한 발걸음' }, side: [{ sight: 1 }, { abil: 'mark', name: '표적 지정' }], small: { aim: 2 } },
];
const PERK_TEXT = {
  revive: '쓰러진 아군을 응급 처치로 일으킴 (체력 2)',
  closeq: '4칸 안 명중 +15',
  sentry: '경계 사격 명중 감점 없음',
  ghost: '자는 고양이 무리가 3칸 안에서만 깸',
};
const STAT_TEXT = { hp: '체력', aim: '명중', mob: '이동', sight: '시야', crit: '치명', def: '회피', dmg: '피해', clip: '탄창', grenades: '수류탄', medkits: '구급상자', heal: '치료량', blast: '폭발 범위', boom: '폭발 피해', burn: '화상 피해', charges: '폭약', psi: '정신력' };

const Skills = (() => {
  const R = 3;
  // 육각(평평한 윗변) 축 좌표 (q, r). 0번 방향 = 위, 시계 방향
  const DIR = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  const key = (q, r) => q + ',' + r;
  const cells = new Map();
  cells.set(key(0, 0), { q: 0, r: 0, ring: 0, sec: [], fx: {}, title: '신병' });
  for (let k = 1; k <= R; k++) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < k; j++) {
        const q = DIR[i][0] * k + DIR[(i + 2) % 6][0] * j, r = DIR[i][1] * k + DIR[(i + 2) % 6][1] * j;
        const f = j / k, n = (i + 1) % 6;
        const sec = f === 0 ? [i] : f < 0.5 ? [i] : f > 0.5 ? [n] : [i, n];
        const S = NODE_FX[sec[0]];
        let fx;
        if (sec.length === 2) fx = mergeFx(NODE_FX[i].small, NODE_FX[n].small);
        else if (k === 1) fx = S.r1;
        else if (k === 2) fx = S.r2;
        else if (j === 0) fx = S.r3;
        else fx = S.side[f < 0.5 ? 0 : 1];
        cells.set(key(q, r), { q, r, ring: k, sec, fx });
      }
    }
  }
  function mergeFx(a, b) {
    const o = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = (o[k] || 0) + v;
    return o;
  }
  const neighbors = (q, r) => DIR.map(([dq, dr]) => cells.get(key(q + dq, r + dr))).filter(Boolean);

  // 칸 설명 한 줄
  function fxText(fx) {
    const t = [];
    if (fx.name) t.push(fx.name);
    if (fx.abil) t.push(`능력: ${ABILITIES[fx.abil].name}`);
    if (fx.perk) t.push(PERK_TEXT[fx.perk]);
    for (const [k, v] of Object.entries(fx)) if (STAT_TEXT[k] && typeof v === 'number') t.push(`${STAT_TEXT[k]} +${v}`);
    return t.join(' · ');
  }

  // 찍은 칸 목록 (키 문자열 배열) → 갈래별 개수 (경계 칸은 반씩)
  function counts(nodes) {
    const c = [0, 0, 0, 0, 0, 0];
    for (const k of nodes) {
      const cell = cells.get(k);
      if (!cell) continue;
      for (const s of cell.sec) c[s] += 1 / cell.sec.length;
    }
    return c;
  }
  // 병종 정하기
  function classOf(nodes) {
    const c = counts(nodes);
    const order = c.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const [top, second] = order;
    if (top[0] < 2) return 'recruit';
    for (const [id, C] of Object.entries(RAT_CLASSES)) {
      if (C.from.length !== 2) continue;
      const pair = [top[1], second[1]].sort().join();
      if (pair === [...C.from].sort().join() && second[0] >= 2 && second[0] >= top[0] - 1) return id;
    }
    return Object.keys(RAT_CLASSES).find((id) => RAT_CLASSES[id].from.length === 1 && RAT_CLASSES[id].from[0] === top[1]);
  }
  // 찍을 수 있는 칸 = 아직 안 찍었고, 찍은 칸(또는 가운데)과 붙어 있음
  function canTake(nodes, k) {
    if (nodes.includes(k) || !cells.has(k)) return false;
    const cell = cells.get(k);
    return neighbors(cell.q, cell.r).some((n) => n.ring === 0 || nodes.includes(key(n.q, n.r)));
  }
  // 찍은 칸 효과 전부 합치기
  function totals(nodes) {
    const t = { abil: [], perks: [] };
    for (const k of nodes) {
      const fx = (cells.get(k) || {}).fx || {};
      for (const [s, v] of Object.entries(fx)) {
        if (s === 'abil') t.abil.push(v);
        else if (s === 'perk') t.perks.push(v);
        else if (typeof v === 'number') t[s] = (t[s] || 0) + v;
      }
    }
    return t;
  }
  return { cells, key, neighbors, counts, classOf, canTake, totals, fxText, R };
})();
