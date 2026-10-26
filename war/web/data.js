// 쥐 전쟁 시뮬 — 데이터 (무기 · 병과 · 맵)
// 수치는 여기서만 고친다. 거리 = 칸, 명중 = %.

// 거리별 명중 보정 (d = 칸 거리)
const WEAPONS = {
  rifle:   { name: '소총',     dmg: [3, 5], clip: 4, crit: 10, range: (d) => (d <= 2 ? 10 : d <= 8 ? 0 : -(d - 8) * 3) },
  lmg:     { name: '경기관총', dmg: [3, 5], clip: 3, crit: 5,  range: (d) => -5 + (d <= 8 ? 0 : -(d - 8) * 3) },
  sniper:  { name: '저격소총', dmg: [4, 6], clip: 3, crit: 25, range: (d) => (d <= 3 ? -25 : d <= 6 ? -5 : 5) },
  shotgun: { name: '산탄총',   dmg: [4, 7], clip: 2, crit: 20, range: (d) => (d <= 2 ? 30 : d <= 4 ? 15 : d <= 7 ? 0 : -(d - 7) * 8) },
  smg:     { name: '기관단총', dmg: [2, 4], clip: 3, crit: 10, range: (d) => (d <= 3 ? 15 : d <= 6 ? 5 : d <= 9 ? 0 : -(d - 9) * 5) },
  hmg:     { name: '중기관총', dmg: [4, 6], clip: 99, crit: 10, range: (d) => 15 + (d <= 10 ? 0 : -(d - 10) * 3) },
};

// 능력: ap = 필요한 행동력, end = 쓰면 턴 끝
const ABILITIES = {
  shoot:     { name: '사격',     key: '1', ap: 1, end: true,  target: 'enemy' },
  aimed:     { name: '정조준',   key: '2', ap: 2, end: true,  target: 'enemy', desc: '명중 +20, 피해 +1 (이동하지 않았을 때만)' },
  suppress:  { name: '제압 사격', key: '2', ap: 1, end: true,  target: 'enemy', desc: '탄 2발. 대상 명중 −30, 움직이면 반응 사격' },
  grenade:   { name: '수류탄',   key: '3', ap: 1, end: true,  target: 'tile', range: 9, radius: 1.5, dmg: [3, 4], desc: '낮은 엄폐물을 부숨' },
  firstaid:  { name: '응급 처치', key: '4', ap: 1, end: false, target: 'ally', heal: 4, desc: '붙어 있는 아군 체력 +4' },
  overwatch: { name: '경계',     key: '5', ap: 1, end: true,  target: 'self', desc: '적이 시야 안에서 움직이면 사격 (명중 −10)' },
  hunker:    { name: '엎드리기', key: '6', ap: 1, end: true,  target: 'self', desc: '다음 턴까지 방어 +25' },
  reload:    { name: '재장전',   key: 'r', ap: 1, end: false, target: 'self' },
  mortar:    { name: '박격포',   key: 'm', ap: 2, end: true,  target: 'tile', range: 16, radius: 1.5, dmg: [4, 5], desc: '분대가 보는 곳 어디든. 포탄 공유' },
  heavy:     { name: '중기관총', key: 'h', ap: 1, end: true,  target: 'enemy', desc: '진지의 중기관총 (명중 +15)' },
  // ── 병종 · 스킬판 능력 (쥐 테마) ──
  scurry:    { name: '잽싼 발',   ap: 1, end: false, target: 'tile', range: 3, desc: '3칸 안으로 쪼르르. 경계 사격을 안 맞음' },
  ambush:    { name: '쥐구멍 매복', ap: 1, end: true, target: 'self', desc: '엄폐물 옆에서 숨음: 쏘기 전까지 고양이에게 안 보임' },
  warcry:    { name: '찍찍 함성', ap: 0, end: false, target: 'self', once: true, desc: '4칸 안 아군 이번 턴 명중 +10, 스트레스 −10 (전투당 1번)' },
  charge:    { name: '폭약',     ap: 1, end: true,  target: 'tile', range: 1.5, desc: '붙은 엄폐물 · 벽 · 트럭까지 날려 버림' },
  gnaw:      { name: '철조망 갉기', ap: 1, end: false, target: 'tile', range: 1.5, desc: '붙은 철조망을 갉아 끊음' },
  tunnel:    { name: '땅굴 파기', ap: 2, end: true,  target: 'tile', range: 7, once: true, desc: '지금 칸 ↔ 고른 칸 땅굴. 아군은 입구에서 출구로 1걸음 (전투당 1번)' },
  flame:     { name: '화염방사기', ap: 1, end: true, target: 'tile', range: 3.2, radius: 1.1, dmg: [3, 4], uses: 2, desc: '엄폐 무시 불길 + 다음 턴 화상. 낮은 엄폐물도 태움' },
  knife:     { name: '칼',       ap: 1, end: true,  target: 'enemy', melee: true, desc: '붙은 적을 칼로 (명중 +30). 소리 안 남' },
  cheese:    { name: '치즈 배급', ap: 1, end: false, target: 'ally', desc: '붙은 아군 스트레스 −25 · 제압 · 공황 풀림' },
  mark:      { name: '표적 지정', ap: 1, end: false, target: 'enemy', desc: '이번 판 동안 그 적에게 아군 명중 +15' },
  command:   { name: '쥐떼 전령', ap: 1, end: true, target: 'ally', far: true, desc: '시야 안 아군 하나 행동력 +1' },
  radioscan: { name: '무전 탐지', ap: 1, end: false, target: 'self', once: true, desc: '맵의 모든 고양이 위치를 이번 턴 동안 드러냄 (전투당 1번)' },
  dominate:  { name: '정신 지배', ap: 2, end: true, target: 'enemy', psi: 2, desc: '적 하나를 2턴 동안 아군처럼 조종 (정신력 2)' },
  ward:      { name: '마법 방어막', ap: 1, end: false, target: 'ally', far: true, psi: 1, desc: '아군 하나에 피해 4 막는 방어막 (정신력 1)' },
};

// 쥐 분대 (사람 비율 몸 + 쥐 머리)
const CLASSES = {
  rifleman: { name: '소총수',     hp: 6, aim: 68, mob: 6, weapon: 'rifle',   grenades: 1, abil: ['shoot', 'grenade', 'overwatch', 'hunker'] },
  gunner:   { name: '기관총 사수', hp: 7, aim: 60, mob: 5, weapon: 'lmg',     abil: ['shoot', 'suppress', 'overwatch', 'hunker'] },
  sniper:   { name: '저격수',     hp: 5, aim: 74, mob: 6, weapon: 'sniper',  sight: 2, abil: ['shoot', 'aimed', 'overwatch', 'hunker'] },
  engineer: { name: '공병',       hp: 6, aim: 64, mob: 7, weapon: 'shotgun', grenades: 2, medkits: 2, abil: ['shoot', 'grenade', 'firstaid', 'overwatch', 'hunker'] },
  // 고양이 군
  trooper:  { name: '고양이 소총병',   hp: 5, aim: 60, mob: 6, weapon: 'smg', grenades: 1, abil: ['shoot', 'grenade', 'overwatch', 'hunker'] },
  mgcat:    { name: '고양이 기관총병', hp: 6, aim: 55, mob: 5, weapon: 'lmg', abil: ['shoot', 'suppress', 'overwatch', 'hunker'] },
  officer:  { name: '고양이 장교',     hp: 8, aim: 65, mob: 6, weapon: 'smg', aura: 10, abil: ['shoot', 'overwatch', 'hunker'] },
  catsniper: { name: '고양이 저격병',  hp: 4, aim: 72, mob: 5, weapon: 'sniper', sight: 2, abil: ['shoot', 'overwatch', 'hunker'] },
  catflame:  { name: '고양이 화염병',  hp: 6, aim: 55, mob: 6, weapon: 'smg', flame: true, abil: ['shoot', 'flame', 'hunker'] },
};

// 맵 기호: . 풀밭  , 진흙  = 길  o 포탄 구덩이
//   낮은 엄폐 S 모래주머니  C 상자     높은 엄폐 W 벽돌 벽  T 죽은 나무  R 트럭 잔해  H 돌집 벽
//   X 철조망 (못 지나감, 엄폐 아님)   M 박격포 진지   G 기관총 진지 (올라선 칸 = 낮은 엄폐)
// z = 0 이 맨 뒤(북쪽, 고양이 후방), 쥐는 맨 앞 줄에서 시작. 18 × 22
const MAPS = {
  // 언덕 위 박격포 + 뒤쪽 참호선 · 폐허 마을
  hill: {
    rows: [
      'T.HH....T....HH..T',
      '..H..C.....,...H..',
      '.......WW.....C...',
      '..==============..',
      '.S..C.......S...T.',
      '....,..o.......,..',
      'XXX..SSSS..SSSS.XX',
      '..........o.......',
      'T...HH......RRR..T',
      '....H.....C.......',
      '.WW......S...SGS..',
      '......C.....,.....',
      '.T.......XXX...T..',
      '....S.......,..C..',
      '..C...S..M..S.....',
      '.......,..........',
      '.T....S...,.S.....',
      '....C......XX..W..',
      '..S.....T.....WW..',
      '........=====.....',
      '=======.....======',
      '..T......C........',
    ],
    hills: [{ cx: 9, cz: 14.6, rx: 4.3, rz: 2.4 }],
    spawn: [[3, 20], [5, 21], [1, 21], [6, 20], [4, 21], [7, 21]],
  },
  // 철도역 마을: 가운데 철길, 집 벽 골목, 뒤쪽 기관총 진지
  station: {
    rows: [
      'HHH..T.....HHHH..T',
      'H.C......C....H...',
      'H.....S.G...S.....',
      '..T.......,....C..',
      '==================',
      '..o....RRR....o...',
      '.S...C......S..C..',
      '....WW....XX....WW',
      '.T..W..........W..',
      '......S..o..S.....',
      '..C.......,....T..',
      '.....HH....HH.....',
      '.S...H......H..S..',
      '..,.....o.....,...',
      '....S.....C.......',
      'T.......RRR.....T.',
      '..XX..........XX..',
      '.....C....S.......',
      '..T........,....C.',
      '.....=====.....T..',
      '=====.....=====...',
      '..C.....T.........',
    ],
    hills: [{ cx: 9, cz: 9.2, rx: 2.6, rz: 1.5 }],
    spawn: [[1, 21], [3, 21], [5, 20], [6, 21], [4, 21], [7, 20]],
  },
};

// 임무: 보상 = 보급품. 하나 끝내면 다음이 열림. mirror = 맵 좌우 뒤집기
// 목표 obj: elim = 고양이 전멸 · officer = 표적(target) 처치 · reach = 깃발 칸(goal)에 쥐가 서기
const MISSIONS = [
  {
    id: 'm1', name: '1장 · 언덕 위의 박격포', map: 'hill', obj: 'elim', reward: 60, shells: 3,
    brief: '언덕 위 버려진 박격포 진지를 차지하고, 참호선까지 고양이 분대를 몰아내라.',
    cats: [
      { cls: 'trooper', head: 'mackerel',      x: 2, z: 11, pod: 'A' },
      { cls: 'trooper', head: 'tuxedo',        x: 4, z: 10, pod: 'A' },
      { cls: 'mgcat',   head: 'boss_turret',   x: 14, z: 10, pod: 'B' },
      { cls: 'trooper', head: 'chonk',         x: 16, z: 9, pod: 'B' },
      { cls: 'officer', head: 'boss_dictator', x: 11, z: 9, pod: 'C' },
      { cls: 'trooper', head: 'boss_ryan',     x: 13, z: 9, pod: 'C' },
      { cls: 'trooper', head: 'loaf',          x: 8, z: 11, pod: 'D' },
      { cls: 'mgcat',   head: 'mackerel',      x: 12, z: 12, pod: 'D' },
      { cls: 'trooper', head: 'tuxedo',        x: 6, z: 5, pod: 'E' },
      { cls: 'trooper', head: 'chonk',         x: 12, z: 5, pod: 'E' },
    ],
  },
  {
    id: 'm2', name: '2장 · 철도역의 장교', map: 'station', obj: 'officer', reward: 80, shells: 0,
    brief: '철도역 뒤 마을에 숨은 고양이 장교를 사살하라. 장교만 쓰러뜨리면 나머지는 흩어진다.',
    cats: [
      { cls: 'trooper', head: 'mackerel',      x: 6, z: 13, pod: 'A' },
      { cls: 'trooper', head: 'loaf',          x: 13, z: 12, pod: 'A' },
      { cls: 'mgcat',   head: 'boss_turret',   x: 8, z: 9, pod: 'B' },
      { cls: 'catflame', head: 'tuxedo',       x: 11, z: 8, pod: 'B' },
      { cls: 'trooper', head: 'chonk',         x: 3, z: 6, pod: 'C' },
      { cls: 'catsniper', head: 'mackerel',    x: 13, z: 5, pod: 'C' },
      { cls: 'officer', head: 'boss_dictator', x: 8, z: 1, pod: 'D', target: true },
      { cls: 'trooper', head: 'boss_ryan',     x: 10, z: 2, pod: 'D' },
      { cls: 'mgcat',   head: 'boss_turret',   x: 8, z: 2, pod: 'D' },
    ],
  },
  {
    id: 'm3', name: '3장 · 참호 돌파', map: 'hill', mirror: true, obj: 'reach', reward: 90, shells: 2,
    goal: { x: 8, z: 1, r: 1 },
    brief: '참호선을 뚫고 폐허 마을의 깃발까지 쥐 한 마리라도 닿게 하라. 다 잡을 필요는 없다.',
    cats: [
      { cls: 'trooper', head: 'mackerel',      x: 2, z: 11, pod: 'A' },
      { cls: 'mgcat',   head: 'boss_turret',   x: 14, z: 10, pod: 'B' },
      { cls: 'trooper', head: 'chonk',         x: 16, z: 9, pod: 'B' },
      { cls: 'trooper', head: 'loaf',          x: 8, z: 11, pod: 'D' },
      { cls: 'trooper', head: 'tuxedo',        x: 6, z: 5, pod: 'E' },
      { cls: 'mgcat',   head: 'mackerel',      x: 12, z: 5, pod: 'E' },
      { cls: 'catflame', head: 'boss_ryan',    x: 9, z: 5, pod: 'E' },
      { cls: 'catsniper', head: 'loaf',        x: 14, z: 1, pod: 'F' },
      { cls: 'officer', head: 'boss_dictator', x: 9, z: 1, pod: 'F' },
      { cls: 'trooper', head: 'tuxedo',        x: 5, z: 2, pod: 'F' },
    ],
  },
  {
    id: 'm4', name: '4장 · 총통의 근위대', map: 'station', mirror: true, obj: 'elim', reward: 120, shells: 0,
    brief: '총통 직속 근위대가 역을 틀어쥐었다. 남김없이 쓸어버려라.',
    cats: [
      { cls: 'trooper', head: 'mackerel',      x: 6, z: 13, pod: 'A' },
      { cls: 'trooper', head: 'loaf',          x: 13, z: 12, pod: 'A' },
      { cls: 'mgcat',   head: 'boss_turret',   x: 8, z: 9, pod: 'B' },
      { cls: 'trooper', head: 'tuxedo',        x: 11, z: 8, pod: 'B' },
      { cls: 'officer', head: 'boss_dictator', x: 10, z: 9, pod: 'B' },
      { cls: 'trooper', head: 'chonk',         x: 3, z: 6, pod: 'C' },
      { cls: 'mgcat',   head: 'mackerel',      x: 13, z: 5, pod: 'C' },
      { cls: 'catflame', head: 'boss_ryan',    x: 9, z: 3, pod: 'C' },
      { cls: 'catsniper', head: 'loaf',        x: 3, z: 1, pod: 'D' },
      { cls: 'officer', head: 'boss_dictator', x: 8, z: 1, pod: 'D' },
      { cls: 'trooper', head: 'boss_ryan',     x: 10, z: 2, pod: 'D' },
      { cls: 'mgcat',   head: 'boss_turret',   x: 8, z: 2, pod: 'D' },
      { cls: 'trooper', head: 'chonk',         x: 4, z: 1, pod: 'D' },
    ],
  },
];

// 임무 하나를 전투용 맵 정의로 펼침 (좌우 뒤집기 포함). 반환값 = World.create 가 받는 것
function missionMap(m) {
  const base = MAPS[m.map];
  const W = base.rows[0].length;
  const fx = (x) => (m.mirror ? W - 1 - x : x);
  return {
    name: m.name, obj: m.obj, goal: m.goal ? { ...m.goal, x: fx(m.goal.x) } : null,
    rows: m.mirror ? base.rows.map((r) => [...r].reverse().join('')) : base.rows,
    hills: base.hills.map((h) => ({ ...h, cx: m.mirror ? W - 1 - h.cx : h.cx })),
    spawn: base.spawn.map(([x, z]) => [fx(x), z]),
    cats: m.cats.map((c) => ({ ...c, x: fx(c.x) })),
    mortarShells: m.shells,
  };
}

const PROPS = {
  S: { name: '모래주머니', cover: 1, block: true, breakable: true },
  C: { name: '보급 상자', cover: 1, block: true, breakable: true },
  W: { name: '벽돌 벽', cover: 2, block: true, sightBlock: true },
  T: { name: '죽은 나무', cover: 2, block: true, sightBlock: true },
  R: { name: '트럭 잔해', cover: 2, block: true, sightBlock: true },
  H: { name: '돌집 벽', cover: 2, block: true, sightBlock: true },
  X: { name: '철조망', cover: 0, block: true },
  M: { name: '박격포 진지', cover: 0, block: false, emplacement: 'mortar' },
  G: { name: '기관총 진지', cover: 0, block: false, emplacement: 'hmg', selfCover: 1 },
};

const RULES = {
  ap: 2,
  sight: 8,
  // 맞은 부위 확률 (가중치). 치명타면 머리가 잘 맞음. 머리 = 즉사
  hitParts: { head: 10, torso: 50, arm: 20, leg: 20 },
  hitPartsCrit: { head: 30, torso: 40, arm: 15, leg: 15 },
  severOnCrit: 0.7,     // 팔 · 다리 치명타면 이 확률로 잘림 → 쓰러짐, 의수 · 의족 전엔 출전 못 함
  armWoundAim: 30,      // 팔 부상: 그 판 명중 감소
  armReloadFail: 0.35,  // 팔 부상: 재장전 실패 확률 (행동력은 씀)
  legWoundMob: 0.5,     // 다리 부상: 이동 범위 배율
  executeRange: 7,      // 고양이가 쓰러진 쥐를 확인사살하러 가는 거리
  wakeRange: 6, // 자고 있는 무리는 이 거리 안에서 서로 보여야 깸 (더 멀면 보이기만 함 → 먼저 쏠 수 있음)
  highGroundAim: 20,
  coverDef: [0, 20, 40],
  hunkerDef: 25,
  flankCrit: 40,
  critDmg: 2,
  overwatchAim: -10,
  suppressAim: -30,
  climbCost: 1,
  diagCost: 1.5,
};
