// 쥐 전쟁 시뮬 — 아웃게임: 분대 기록 · 모집 · 특성 · 스트레스 · 임무 진행 (localStorage)
// 쥐 하나하나 = 이름 · 얼굴 · 고향 · 사연 · 특성. 죽으면 추모비로. 스트레스는 판을 넘어 남고, 쉬어야 풀림.

const RANKS = [
  { name: '이병', xp: 0, aim: 0, hp: 0 },
  { name: '일병', xp: 2, aim: 3, hp: 0 },
  { name: '상병', xp: 5, aim: 5, hp: 1 },
  { name: '병장', xp: 9, aim: 7, hp: 1 },
  { name: '하사', xp: 14, aim: 9, hp: 2 },
  { name: '중사', xp: 20, aim: 11, hp: 2 },
  { name: '상사', xp: 27, aim: 13, hp: 3 },
  { name: '원사', xp: 35, aim: 15, hp: 3 },
];
const rankOf = (xp) => RANKS.reduce((r, R, i) => (xp >= R.xp ? i : r), 0);

// 얼굴 (art/faces/rat_<n>) 수 · 털빛 (머리 파츠에 거는 필터)
const RAT_FACES = 7;
const FURS = [
  { name: '갈색', f: 'none' },
  { name: '검은 털', f: 'brightness(0.6) saturate(0.7)' },
  { name: '흰 털', f: 'brightness(1.3) saturate(0.35)' },
  { name: '잿빛', f: 'saturate(0.15) brightness(1.05)' },
  { name: '붉은 털', f: 'sepia(0.45) saturate(1.5) hue-rotate(-12deg)' },
  { name: '누런 털', f: 'sepia(0.5) brightness(1.12)' },
];

const NAMES = ['쥬드', '미르코', '레나', '토비', '아벨', '사샤', '니코', '이다', '파벨', '루카', '엘사', '보리스', '야나', '오토', '미샤', '한스', '마리', '코스챠', '일리야', '베라', '폴', '안나', '그레타', '빅토르', '루드비크', '조피아', '타냐', '에밀', '유리', '카밀'];
const HOMES = ['방앗간 마을', '항구 창고', '치즈 공장 뒷골목', '밀밭 둑', '성당 지하', '기차역 하수구', '빵집 다락', '포도밭 돌담', '광산촌', '강가 물레방아'];
const STORIES = [
  '딸에게 매일 편지를 쓴다. 아직 한 통도 못 부쳤다.',
  '전쟁 전엔 빵을 구웠다. 지금도 주머니에 밀가루가 묻어 있다.',
  '형을 찾으러 입대했다.',
  '고양이에게 가족을 잃었다. 말이 없다.',
  '노래를 잘한다. 밤마다 참호에서 흥얼거린다.',
  '첫 월급으로 어머니에게 치즈 한 덩이를 보냈다.',
  '약혼녀의 사진을 철모 안에 붙여 다닌다.',
  '열여섯이라고 속이고 입대했다. 사실 열넷이다.',
  '전쟁이 끝나면 바다를 보러 가겠다고 한다.',
  '시계 수리공이었다. 손이 아직 떨리지 않는다.',
  '도박 빚을 갚으러 왔다. 운이 좋다고 믿는다.',
  '교회 성가대 출신. 기도 없이는 출전하지 않는다.',
];

// 특성: 모집 때 1~2개. stress = 스트레스 받는 배율, 나머지는 능력치 더하기
const TRAITS = {
  brave:    { name: '용감함',  desc: '스트레스 −30%', stress: 0.7 },
  coward:   { name: '겁쟁이',  desc: '스트레스 +30% · 회피 +5', stress: 1.3, def: 5 },
  veteran:  { name: '노병',    desc: '명중 +5 · 처음 스트레스 25', aim: 5, startStress: 25 },
  tough:    { name: '튼튼함',  desc: '체력 +1', hp: 1 },
  marksman: { name: '사격 재능', desc: '명중 +5', aim: 5 },
  nimble:   { name: '날쌤',    desc: '이동 +1', mob: 1 },
  drinker:  { name: '술꾼',    desc: '판 끝나면 스트레스 −10 · 명중 −3', aim: -3, unwind: 10 },
  homesick: { name: '향수병',  desc: '출전할 때마다 스트레스 +8', homesick: 8 },
  pious:    { name: '신앙심',  desc: '쉴 때 스트레스 두 배로 풀림', rest: 2 },
  sibling:  { name: '형제',    desc: '같이 출전하면 명중 +8. 한쪽이 죽으면…', aim: 0 },
  psychic:  { name: '영매',    desc: '정신의 목소리를 들음 — 주술사가 될 수 있음', rare: true },
  // ── 림월드식 성격 ──
  bloodlust:  { name: '피에 굶주림', desc: '처치하면 스트레스 −15 · 피 · 절단을 봐도 아무렇지 않음', killRelief: 15, stressBy: { gore: 0 } },
  squeamish:  { name: '비위 약함', desc: '피 · 절단을 보면 스트레스 두 배', stressBy: { gore: 2, dead: 1.3 } },
  pyrophobe:  { name: '불 공포증', desc: '불길 근처에서 스트레스 세 배', stressBy: { fire: 3 } },
  psychopath: { name: '사이코패스', desc: '동료가 죽어도 흔들리지 않음 · 아무도 이 쥐를 좋아하지 않음', stressBy: { dead: 0, gore: 0, downed: 0.3 } },
  ironwill:   { name: '강철 의지', desc: '스트레스 120 에서야 무너짐', breakAt: 20 },
  nervous:    { name: '예민함',    desc: '스트레스 80 에서 무너짐', breakAt: -20 },
  optimist:   { name: '낙천가',    desc: '판 끝나면 스트레스 −10', unwind: 10 },
  pessimist:  { name: '비관론자',  desc: '판 끝나면 스트레스 +8', unwind: -8 },
  quick:      { name: '빠른 학습', desc: '경험치 1.5배', xp: 1.5 },
  slowwit:    { name: '굼뜬 머리', desc: '경험치 0.7배', xp: 0.7 },
  lucky:      { name: '행운아',    desc: '치명 +5 · 회피 +5', crit: 5, def: 5 },
  careful:    { name: '꼼꼼함',    desc: '팔을 다쳐도 재장전을 실수하지 않음', careful: true },
  clumsy:     { name: '덤벙댐',    desc: '재장전 10% 실패 · 수류탄 하나 더', clumsy: true, grenades: 1 },
  leader:     { name: '타고난 지휘관', desc: '3칸 안 아군 명중 +5 · 스트레스 −20%', leader: true },
  loner:      { name: '외톨이',    desc: '3칸 안에 아군이 없으면 명중 +10', loner: true },
  smoker:     { name: '골초',      desc: '매 턴 스트레스 −3 · 체력 −1', smoke: 3, hp: -1 },
  glutton:    { name: '치즈 귀신', desc: '치즈 배급을 받으면 두 배로 풀림', glutton: true },
  sluggish:   { name: '느림보',    desc: '이동 −1 · 체력 +1', mob: -1, hp: 1 },
  sharpears:  { name: '밝은 귀',   desc: '시야 +1', sight: 1 },
};
// 같이 가질 수 없는 특성
const TRAIT_CLASH = [['brave', 'coward'], ['ironwill', 'nervous'], ['optimist', 'pessimist'], ['quick', 'slowwit'], ['bloodlust', 'squeamish'], ['leader', 'loner'], ['nimble', 'sluggish'], ['careful', 'clumsy'], ['psychopath', 'sibling'], ['brave', 'nervous'], ['coward', 'ironwill']];
const clashes = (a, b) => TRAIT_CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const STRESS = {
  hit: 8, crit: 12, downed: 20, allyDead: 22, siblingDead: 45, gore: 8, suppressed: 6, panicNear: 6,
  kill: -6, win: -12, cheese: -25, rest: -35, warcry: -10,
  breakAt: 100, after: 70, // 무너지면 이 값으로 내려감
  shaky: 60,               // 이 위로 출전하면 '불안' (명중 −10)
};

// 스트레스 상태 글자 · 색
function stressState(s, cap = STRESS.breakAt) {
  if (s >= cap - 15) return { t: '붕괴 직전', c: '#ff7aa8' };
  if (s >= STRESS.shaky) return { t: '불안', c: '#c9a3ff' };
  if (s >= 35) return { t: '긴장', c: '#e8c66a' };
  return { t: '안정', c: '#9fd6a0' };
}

const RECRUIT_COST = 35, REFRESH_COST = 8, LIMB_COST = 50, SQUAD_MAX = 12, DEPLOY_MAX = 6;

const Camp = (() => {
  const KEY = 'war_camp_v2';
  let seq = 1;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // 새 쥐 한 마리 (모집 후보 · 처음 분대)
  function newRat(c, opts = {}) {
    const used = new Set([...c.squad, ...c.fallen, ...(c.recruits || [])].map((r) => r.name));
    const name = NAMES.find((n) => !used.has(n) && Math.random() < 0.5) || NAMES.find((n) => !used.has(n)) || '신병 ' + (c.made + 1);
    const traits = [];
    if (opts.psychic || Math.random() < 0.15) traits.push('psychic');
    const pool = Object.keys(TRAITS).filter((t) => !TRAITS[t].rare && t !== 'sibling');
    const want = (Math.random() < 0.35 ? 3 : 2) + (traits.includes('psychic') ? 1 : 0);
    for (let guard = 0; traits.length < want && guard < 50; guard++) {
      const t = pick(pool);
      if (!traits.includes(t) && !traits.some((o) => clashes(o, t))) traits.push(t);
    }
    c.made = (c.made || 0) + 1;
    return {
      id: 'r' + Date.now().toString(36) + (seq++),
      name, home: pick(HOMES), story: pick(STORIES), traits,
      face: Math.floor(Math.random() * RAT_FACES), fur: Math.floor(Math.random() * FURS.length), gear: Math.floor(Math.random() * 3),
      xp: 0, nodes: [], kills: 0, missions: 0,
      stress: traits.includes('veteran') ? TRAITS.veteran.startStress : Math.floor(Math.random() * 10),
      lost: [], rested: 0, afflicted: null,
    };
  }

  function fresh() {
    const c = { v: 2, supplies: 60, battles: 0, done: [], squad: [], fallen: [], recruits: [], deploy: [], made: 0, log: [] };
    for (let i = 0; i < 6; i++) c.squad.push(newRat(c, { psychic: i === 5 }));
    // 처음 분대에 형제 한 쌍
    for (const i of [1, 2]) c.squad[i].traits = ['sibling', ...c.squad[i].traits.filter((t) => !clashes(t, 'sibling') && t !== 'sibling')].slice(0, 3);
    c.squad[1].sibling = c.squad[2].id; c.squad[2].sibling = c.squad[1].id;
    c.squad[2].home = c.squad[1].home;
    c.deploy = c.squad.slice(0, DEPLOY_MAX).map((r) => r.id);
    rollRecruits(c);
    return c;
  }
  function load() {
    try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && c.v === 2) return c; } catch (e) { /* 새로 */ }
    return null;
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* 저장 못 해도 진행 */ } }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } }

  function rollRecruits(c) { c.recruits = [newRat(c), newRat(c), newRat(c)]; }

  // ── 한 쥐의 계산된 정보 ──
  const rankIdx = (r) => rankOf(r.xp);
  const points = (r) => 1 + rankIdx(r) - r.nodes.length; // 신병 1점 + 진급마다 1점
  function classOf(r) {
    let cls = Skills.classOf(r.nodes);
    // 주술사는 '영매'만. 아니면 가장 많이 찍은 단일 갈래로
    if (cls === 'shaman' && !r.traits.includes('psychic')) {
      const c = Skills.counts(r.nodes);
      const top = c.indexOf(Math.max(...c));
      cls = Object.keys(RAT_CLASSES).find((id) => RAT_CLASSES[id].from.length === 1 && RAT_CLASSES[id].from[0] === top) || 'recruit';
    }
    return cls;
  }
  const ready = (r) => !(r.lost && r.lost.length);
  const traitSum = (r, k) => r.traits.reduce((s, t) => s + (TRAITS[t][k] || 0), 0);
  const stressMul = (r, why) => r.traits.reduce((m, t) => m * (TRAITS[t].stress || 1) * (why && TRAITS[t].stressBy && TRAITS[t].stressBy[why] != null ? TRAITS[t].stressBy[why] : 1), 1) * (r.afflicted ? 1.25 : 1);
  const breakAt = (r) => STRESS.breakAt + traitSum(r, 'breakAt');
  const has = (r, t) => !!r && r.traits.includes(t);

  // 전투용 능력치: 병종 기본 + 계급 + 스킬판 + 특성
  function stats(r, squadIds = []) {
    const clsId = classOf(r), C = RAT_CLASSES[clsId], R = RANKS[rankIdx(r)], T = Skills.totals(r.nodes);
    const sibling = r.sibling && squadIds.includes(r.sibling) ? 8 : 0;
    const shaky = r.stress >= STRESS.shaky ? -10 : 0;
    const abil = [...new Set([...C.abil, ...T.abil])];
    // 순서: 사격 먼저, 경계 · 엎드리기 끝
    abil.sort((a, b) => (a === 'shoot' ? -1 : b === 'shoot' ? 1 : 0) || (a === 'overwatch' ? 1 : 0) - (b === 'overwatch' ? 1 : 0));
    return {
      clsId, cls: C,
      hp: C.hp + R.hp + (T.hp || 0) + traitSum(r, 'hp'),
      aim: C.aim + R.aim + (T.aim || 0) + traitSum(r, 'aim') + sibling + shaky,
      mob: C.mob + (T.mob || 0) + traitSum(r, 'mob') - (r.lost && r.lost.includes('leg') ? 1 : 0),
      sight: (C.sight || 0) + (T.sight || 0) + traitSum(r, 'sight'),
      crit: (C.crit || 0) + (T.crit || 0) + traitSum(r, 'crit'), def: (C.def || 0) + (T.def || 0) + traitSum(r, 'def'),
      dmg: T.dmg || 0, clip: T.clip || 0, heal: T.heal || 0, blast: (C.blast || 0) + (T.blast || 0), boom: T.boom || 0,
      grenades: (C.grenades || 0) + (T.grenades || 0) + (C.grenades || T.grenades ? traitSum(r, 'grenades') : 0), medkits: (C.medkits || 0) + (T.medkits || 0),
      charges: (C.charges || 0) + (T.charges || 0), cheese: C.cheese || (abil.includes('cheese') ? 2 : 0),
      psi: C.psi || 0, climb: !!C.climb, whisker: C.whisker || 0,
      perks: T.perks, abil, sibling: !!sibling, shaky: !!shaky,
    };
  }

  // ── 모집 · 치료 ──
  function recruit(c, i) {
    if (c.supplies < RECRUIT_COST || c.squad.length >= SQUAD_MAX || !c.recruits[i]) return false;
    c.supplies -= RECRUIT_COST;
    c.squad.push(c.recruits[i]);
    c.recruits.splice(i, 1, newRat(c));
    save(c);
    return true;
  }
  function refresh(c) {
    if (c.supplies < REFRESH_COST) return false;
    c.supplies -= REFRESH_COST; rollRecruits(c); save(c); return true;
  }
  function fitLimb(c, r) {
    if (c.supplies < LIMB_COST || !r.lost.length) return false;
    c.supplies -= LIMB_COST;
    r.prosthetic = [...new Set([...(r.prosthetic || []), ...r.lost])];
    r.lost = [];
    save(c);
    return true;
  }
  function takeNode(c, r, k) {
    if (points(r) <= 0 || !Skills.canTake(r.nodes, k)) return false;
    r.nodes.push(k); save(c); return true;
  }

  // ── 판 끝: 결과 반영 ──
  // res = [{ id, alive, downed, kills, stress, wounds, severed:[...] }], win, mission
  function settle(c, mission, win, res) {
    c.battles++;
    const reward = win ? mission.reward : Math.floor(mission.reward * 0.2);
    c.supplies += reward;
    if (win && !c.done.includes(mission.id)) c.done.push(mission.id);
    const report = [];
    const deployed = new Set(res.map((x) => x.id));
    for (const x of res) {
      const r = c.squad.find((q) => q.id === x.id);
      if (!r) continue;
      const survived = x.alive || (x.downed && win);
      if (!survived) {
        c.squad = c.squad.filter((q) => q !== r);
        c.fallen.push({ ...r, rank: RANKS[rankIdx(r)].name, cls: RAT_CLASSES[classOf(r)].name, died: mission.name, battle: c.battles, how: x.how || '전사', kills: r.kills + x.kills });
        report.push({ r, dead: true, how: x.how });
        // 형제를 잃은 쥐
        const sib = c.squad.find((q) => q.sibling === r.id);
        if (sib) { sib.stress = Math.min(99, sib.stress + 30); sib.grief = r.name; }
        continue;
      }
      const before = rankIdx(r);
      r.xp += Math.round((x.kills + 1 + (win ? 1 : 0)) * r.traits.reduce((m, t) => m * (TRAITS[t].xp || 1), 1));
      r.kills += x.kills; r.missions++;
      r.stress = Math.max(0, Math.min(99, x.stress + (win ? STRESS.win : 0) - traitSum(r, 'unwind')));
      if (x.broke) r.afflicted = x.broke;
      r.rested = 0;
      if (x.severed && x.severed.length) r.lost = [...new Set([...(r.lost || []), ...x.severed])];
      report.push({ r, promoted: rankIdx(r) > before, kills: x.kills, downed: x.downed, hurt: x.hurt || [], severed: x.severed || [], broke: x.broke });
    }
    // 출전 안 한 쥐는 쉼: 스트레스 풀림, 두 판 쉬면 정신 이상도 나음
    for (const r of c.squad) {
      if (deployed.has(r.id)) continue;
      r.stress = Math.max(0, r.stress + STRESS.rest * (traitSum(r, 'rest') || 1));
      r.rested = (r.rested || 0) + 1;
      if (r.rested >= 2) r.afflicted = null;
    }
    c.deploy = c.deploy.filter((id) => c.squad.some((r) => r.id === id));
    save(c);
    return { reward, report };
  }

  // 지금 열린 임무 (깬 것 + 다음 하나)
  const unlocked = (c) => MISSIONS.filter((m, i) => i === 0 || c.done.includes(MISSIONS[i - 1].id));
  const current = (c) => MISSIONS.find((m) => !c.done.includes(m.id)) || MISSIONS[MISSIONS.length - 1];

  return { load, save, fresh, reset, newRat, recruit, refresh, fitLimb, takeNode, settle, stats, classOf, points, ready, rankIdx, stressMul, breakAt, has, traitSum, unlocked, current };
})();
