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
};

// 맵 기호: . 풀밭  , 진흙  = 길  o 포탄 구덩이
//   낮은 엄폐 S 모래주머니  C 상자     높은 엄폐 W 벽돌 벽  T 죽은 나무  R 트럭 잔해  H 돌집 벽
//   X 철조망 (못 지나감, 엄폐 아님)   M 박격포 진지   G 기관총 진지 (올라선 칸 = 낮은 엄폐)
const MAP = {
  name: '1장 · 언덕 위의 박격포',
  rows: [
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
  // 언덕 (높이 1): 가운데 타원
  hill: { cx: 9, cz: 6.6, rx: 4.3, rz: 2.4 },
  rats: [
    { cls: 'rifleman', name: '쥬드',   head: 'brownrat',   x: 3, z: 12 },
    { cls: 'gunner',   name: '미르코', head: 'blackrat',   x: 5, z: 13 },
    { cls: 'sniper',   name: '레나',   head: 'fieldmouse', x: 1, z: 13 },
    { cls: 'engineer', name: '토비',   head: 'labrat',     x: 6, z: 12 },
  ],
  // pod = 같이 깨어나는 무리
  cats: [
    { cls: 'trooper', head: 'mackerel',      x: 2, z: 3, pod: 'A' },
    { cls: 'trooper', head: 'tuxedo',        x: 4, z: 2, pod: 'A' },
    { cls: 'mgcat',   head: 'boss_turret',   x: 14, z: 2, pod: 'B' },
    { cls: 'trooper', head: 'chonk',         x: 16, z: 1, pod: 'B' },
    { cls: 'officer', head: 'boss_dictator', x: 11, z: 1, pod: 'C' },
    { cls: 'trooper', head: 'boss_ryan',     x: 13, z: 1, pod: 'C' },
    { cls: 'trooper', head: 'loaf',          x: 8, z: 3, pod: 'D' },
    { cls: 'mgcat',   head: 'mackerel',      x: 12, z: 4, pod: 'D' },
  ],
  mortarShells: 3,
};

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
