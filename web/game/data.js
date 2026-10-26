// 게임 데이터 (전투 시스템 기획서 v0.1). 나중에 엑셀 → JSON 으로 옮길 표들.
// 글자는 화면에 보이는 이름 · 설명만, 내부 id 는 화면에 안 보임.
(function () {
  // 무기 종류 → 동작 묶음 (motions.js)
  // swing = 베기 · thrust = 찌르기 · shoot = 사격 · cast = 시전 · stab = 단검
  const CLASSES = {
    knight: {
      name: '기사 쥐', title: '원탁의 막내 기사', race: 'rat', art: 'knight', weapon: 'swing', unique: true,
      base: { hp: 32, atk: 9, def: 30, crit: 10, critDmg: 150, pen: 0, move: 4, aim: 5, eva: 5 },
      grow: { hp: 4, atk: 1, def: 3, aim: 2 },
      attack: 'slash', signature: 'holyblade',
      tree: [['rally', 'taunt'], ['shieldDash', 'riposte'], ['oath', 'excalibur'], ['unbreakable', 'kingsBlade']],
    },
    lancer: {
      name: '창기병 쥐', title: '전열 · 경계', race: 'rat', art: 'lancer', weapon: 'thrust',
      base: { hp: 26, atk: 7, def: 25, crit: 5, critDmg: 150, pen: 0, move: 4, aim: 5, eva: 5 },
      grow: { hp: 4, atk: 1, def: 3, aim: 1 },
      attack: 'spearPoke', signature: 'spearWall',
      tree: [['chargeLance', 'formation'], ['impale', 'shove'], ['longSpear', 'ironWall'], ['spearForest', 'execute']],
    },
    archer: {
      name: '숲지기 석궁 생쥐', title: '원거리 딜', race: 'rat', art: 'archer', weapon: 'shoot',
      base: { hp: 18, atk: 8, def: 10, crit: 15, critDmg: 150, pen: 0, move: 4, aim: 15, eva: 10 },
      grow: { hp: 2, atk: 1, def: 1, aim: 3 },
      attack: 'shot', signature: 'aimedShot',
      tree: [['sniper', 'hunter'], ['doubleShot', 'apBolt'], ['ambush', 'flashBolt'], ['pierceBolt', 'headshot']],
    },
    mage: {
      name: '견습 마법사 쥐', title: '범위 · 마법', race: 'rat', art: 'mage', weapon: 'cast',
      base: { hp: 16, atk: 9, def: 5, crit: 5, critDmg: 150, pen: 0, move: 3, aim: 10, eva: 5 },
      grow: { hp: 2, atk: 2, def: 1, aim: 2 },
      attack: 'manaBolt', signature: 'fireball',
      tree: [['chainLightning', 'iceTrap'], ['manaDrain', 'fireField'], ['blink', 'barrier'], ['grandMagic', 'merlinsPupil']],
    },
    priest: {
      name: '성배 수녀 생쥐', title: '회복 · 지원', race: 'rat', art: 'priest', weapon: 'cast',
      base: { hp: 20, atk: 5, def: 15, crit: 5, critDmg: 150, pen: 0, move: 4, aim: 5, eva: 10 },
      grow: { hp: 3, atk: 1, def: 2, aim: 1 },
      attack: 'chaliceBash', signature: 'heal',
      tree: [['bless', 'purify'], ['healLight', 'grailGuard'], ['holySmite', 'prayer'], ['resurrect', 'grailMiracle']],
    },
  };
  // 화면 키 배율 (쥐 = 1)
  for (const c of Object.values(CLASSES)) c.size = c.size || 1;
  const RECRUITABLE = ['lancer', 'archer', 'mage', 'priest'];

  // 스킬: kind = attack | aoe | heal | buff | stance | dash | teleport | trap | passive
  // cost = act(행동) | bonus(보조) · cd = 쿨다운 턴 · shape = 대상 칸 모양
  //   melee4 = 상하좌우 1칸 · row(n) = 같은 줄 n칸 · range(a,b) = 맨해튼 a~b · ally(n) · self
  const SKILLS = {
    // 기본 공격
    slash:      { name: '베기', cost: 'act', cd: 0, kind: 'attack', shape: 'melee4', mult: 1.0, desc: '근접 상하좌우 1칸' },
    spearPoke:  { name: '찌르기', cost: 'act', cd: 0, kind: 'attack', shape: 'row', reach: 2, mult: 1.0, desc: '같은 줄 2칸까지 (사이 관통)' },
    shot:       { name: '사격', cost: 'act', cd: 0, kind: 'attack', shape: 'range', min: 2, max: 6, mult: 1.0, ranged: true, desc: '사거리 2~6' },
    manaBolt:   { name: '마력탄', cost: 'act', cd: 0, kind: 'attack', shape: 'range', min: 2, max: 5, mult: 0.9, ranged: true, noFacing: true, proj: 'orb', desc: '사거리 2~5 · 방향 보정 없음' },
    chaliceBash:{ name: '성배 내려치기', cost: 'act', cd: 0, kind: 'attack', shape: 'melee4', mult: 0.8, desc: '근접' },
    // 고유
    holyblade:  { name: '성검 해방', cost: 'act', cd: 4, kind: 'aoe', shape: 'line', reach: 5, mult: 1.4, graze: true, cutin: true, desc: '같은 줄 앞 5칸 일직선 · 스침 있음' },
    spearWall:  { name: '창벽', cost: 'bonus', cd: 2, kind: 'stance', stance: 'spearWall', desc: '다음 턴까지 앞 2칸에 들어오는 첫 적을 찌름' },
    aimedShot:  { name: '조준 사격', cost: 'act', cd: 2, kind: 'attack', shape: 'range', min: 2, max: 6, mult: 1.0, ranged: true, aimMod: 25, critMod: 20, needStill: true, desc: '명중 +25 · 치명 +20%p (이동 안 한 턴)' },
    fireball:   { name: '화염구', cost: 'act', cd: 3, kind: 'aoe', shape: 'range', min: 1, max: 4, area: 'cross', mult: 1.0, friendly: true, fx: 'fire', proj: 'orb', desc: '사거리 4 · 십자 5칸 · 아군도 맞음' },
    heal:       { name: '치유', cost: 'act', cd: 2, kind: 'heal', shape: 'ally', max: 3, mult: 1.6, desc: '사거리 3 · 공격력×1.6 회복 · 빈사 아군 일으킴' },
    // 기사 쥐
    rally:      { name: '격려', cost: 'bonus', cd: 3, kind: 'buff', shape: 'self', radius: 2, buff: { morale: 15, aim: 15, turns: 1 }, desc: '2칸 안 아군 사기 +15 · 명중 +15' },
    taunt:      { name: '도발', cost: 'bonus', cd: 3, kind: 'buff', shape: 'self', taunt: 3, desc: '3칸 안 적이 다음 턴 기사 쥐만 노림' },
    shieldDash: { name: '방패 돌진', cost: 'act', cd: 3, kind: 'dash', reach: 3, mult: 1.0, push: 1, desc: '가로 3칸 돌진 · 첫 적 1칸 밀침' },
    riposte:    { name: '반격 태세', cost: 'bonus', cd: 2, kind: 'stance', stance: 'riposte', desc: '다음 턴까지 근접 공격 받으면 반격' },
    oath:       { name: '원탁의 맹세', cost: 'bonus', cd: 4, kind: 'buff', shape: 'self', rows: 1, buff: { def: 30, turns: 2 }, desc: '같은 줄 · 위아래 줄 아군 방어 +30 (2턴)' },
    excalibur:  { name: '엑스칼리버', kind: 'passive', desc: '성검 해방이 위 · 아래 줄까지 (3줄)' },
    unbreakable:{ name: '불굴', kind: 'passive', desc: '기절 1턴 · 기상 시 체력 50%' },
    kingsBlade: { name: '왕의 검', kind: 'passive', desc: '등 뒤 · 측면 공격 시 방어력 무시 +50%' },
    // 창기병
    chargeLance:{ name: '돌격 창', cost: 'act', cd: 3, kind: 'attack', shape: 'row', reach: 2, mult: 1.0, perMoved: 0.15, desc: '이번 턴 이동한 칸 × 15% 피해 추가' },
    formation:  { name: '진형 유지', kind: 'passive', desc: '위 · 아래 칸 아군 방어 +15' },
    impale:     { name: '꿰뚫기', cost: 'act', cd: 3, kind: 'aoe', shape: 'line', reach: 3, mult: 1.0, pen: 50, desc: '같은 줄 3칸 관통 · 방어력 무시 50%' },
    shove:      { name: '밀쳐내기', cost: 'act', cd: 2, kind: 'attack', shape: 'melee4', mult: 0.8, push: 2, desc: '맞은 적 2칸 밀침 · 부딪치면 추가 피해' },
    longSpear:  { name: '긴 창', kind: 'passive', desc: '찌르기 사거리 3칸' },
    ironWall:   { name: '철벽', kind: 'passive', desc: '창벽 중 받는 피해 −40%' },
    spearForest:{ name: '창의 숲', kind: 'passive', desc: '창벽이 위 · 아래 줄까지' },
    execute:    { name: '처형 찌르기', kind: 'passive', desc: '체력 30% 이하 적에게 치명타 확정' },
    // 석궁
    sniper:     { name: '저격수', kind: 'passive', desc: '사거리 +2 · 이동 안 한 턴 피해 +20%' },
    hunter:     { name: '사냥꾼', kind: 'passive', desc: '이동력 +1 · 조준 사격 이동 후에도 가능' },
    doubleShot: { name: '연사', cost: 'act', cd: 3, kind: 'attack', shape: 'range', min: 2, max: 6, mult: 0.7, shots: 2, ranged: true, desc: '두 발 (각 0.7)' },
    apBolt:     { name: '철갑 볼트', kind: 'passive', desc: '사격 방어력 무시 +30%' },
    ambush:     { name: '매복 사격', cost: 'bonus', cd: 3, kind: 'stance', stance: 'ambush', desc: '적 차례에 사거리 안으로 움직인 첫 적에게 사격' },
    flashBolt:  { name: '섬광 볼트', cost: 'act', cd: 3, kind: 'attack', shape: 'range', min: 2, max: 6, mult: 0.6, ranged: true, debuff: { aim: -30, turns: 1 }, desc: '맞은 적 명중 −30 (1턴)' },
    pierceBolt: { name: '관통 볼트', kind: 'passive', desc: '사격이 같은 줄 일직선 모든 적 (같은 줄일 때)' },
    headshot:   { name: '헤드샷', kind: 'passive', desc: '치명타 피해 +75%' },
    // 마법사
    chainLightning: { name: '번개 사슬', cost: 'act', cd: 3, kind: 'attack', shape: 'range', min: 2, max: 5, mult: 0.8, chain: [0.6, 0.6], ranged: true, noFacing: true, fx: 'bolt', desc: '첫 적 + 2칸 안 적 2명에게 튐' },
    iceTrap:    { name: '얼음 덫', cost: 'act', cd: 3, kind: 'trap', shape: 'range', min: 1, max: 4, desc: '칸 하나 얼림 · 들어온 적 다음 턴 이동 0' },
    manaDrain:  { name: '마력 흡수', kind: 'passive', desc: '처치 시 모든 쿨다운 −1' },
    fireField:  { name: '화염 지대', kind: 'passive', desc: '화염구 맞은 칸 1턴 불탐' },
    blink:      { name: '순간이동', cost: 'bonus', cd: 3, kind: 'teleport', max: 4, desc: '4칸 안 빈 칸으로' },
    barrier:    { name: '마력 방벽', cost: 'bonus', cd: 4, kind: 'buff', shape: 'ally', max: 4, buff: { shield: 1, turns: 3 }, desc: '아군 1명 다음 피해 1회 무효' },
    grandMagic: { name: '대마법', kind: 'passive', desc: '화염구 범위 3×3' },
    merlinsPupil:{ name: '멀린의 제자', kind: 'passive', desc: '모든 쿨다운 −1' },
    // 사제
    bless:      { name: '축복', cost: 'bonus', cd: 3, kind: 'buff', shape: 'ally', max: 3, buff: { aim: 15, crit: 10, turns: 2 }, desc: '아군 명중 +15 · 치명 +10%p (2턴)' },
    purify:     { name: '정화', cost: 'bonus', cd: 2, kind: 'buff', shape: 'ally', max: 3, buff: { cleanse: 1, morale: 20, turns: 1 }, desc: '해로운 효과 제거 · 사기 +20' },
    healLight:  { name: '치유의 빛', kind: 'passive', desc: '치유가 십자 범위 아군까지' },
    grailGuard: { name: '성배의 가호', kind: 'passive', desc: '치유 받은 아군 방어 +20 (1턴)' },
    holySmite:  { name: '신성한 일격', cost: 'act', cd: 3, kind: 'attack', shape: 'melee4', mult: 1.6, vsCat: 2, desc: '근접 1.6배 · 고양이형 2배' },
    prayer:     { name: '기도', cost: 'bonus', cd: 4, kind: 'buff', shape: 'all', buff: { morale: 15, turns: 1 }, desc: '아군 전원 사기 +15' },
    resurrect:  { name: '부활의 기도', kind: 'passive', desc: '전투당 1회 · 쓰러진 아군을 체력 30%로' },
    grailMiracle:{ name: '성배의 기적', kind: 'passive', desc: '치유량 +60%' },
    // 공통 행동
    rescue:     { name: '구출', cost: 'act', cd: 0, kind: 'rescue', desc: '옆 칸 빈사 아군을 체력 25%로 일으킴' },
    // 적
    e_pike:     { name: '창 찌르기', cost: 'act', cd: 0, kind: 'attack', shape: 'row', reach: 2, mult: 1.0 },
    e_bolt:     { name: '석궁', cost: 'act', cd: 0, kind: 'attack', shape: 'range', min: 2, max: 6, mult: 1.0, ranged: true, firstInRow: true },
    e_stab:     { name: '단검', cost: 'act', cd: 0, kind: 'attack', shape: 'melee4', mult: 1.0 },
    e_mace:     { name: '철퇴', cost: 'act', cd: 0, kind: 'attack', shape: 'melee4', mult: 1.0, pen: 30 },
    e_cleave:   { name: '대검 휘두르기', cost: 'act', cd: 0, kind: 'aoe', shape: 'melee4', area: 'vert3', mult: 1.0 },
    e_warcry:   { name: '호령', cost: 'bonus', cd: 2, kind: 'buff', shape: 'all', buff: { atkPct: 20, turns: 1 } },
  };

  const ENEMIES = {
    h_spear:  { name: '창 보병', race: 'human', art: 'h_spear', weapon: 'thrust', size: 1.3, base: { hp: 22, atk: 7, def: 25, crit: 5, critDmg: 150, pen: 0, move: 3, aim: 0, eva: 0 }, skills: ['e_pike'] },
    h_xbow:   { name: '석궁병', race: 'human', art: 'h_xbow', weapon: 'shoot', size: 1.3, base: { hp: 16, atk: 8, def: 10, crit: 10, critDmg: 150, pen: 0, move: 3, aim: 5, eva: 5 }, skills: ['e_bolt'], ai: 'ranged' },
    c_scout:  { name: '고양이 척후', race: 'cat', art: 'c_scout', weapon: 'stab', size: 1.1, base: { hp: 15, atk: 7, def: 5, crit: 25, critDmg: 150, pen: 0, move: 5, aim: 10, eva: 25 }, skills: ['e_stab'], ai: 'flanker' },
    c_knight: { name: '흑묘 기사', race: 'cat', art: 'c_knight', weapon: 'swing', size: 1.15, base: { hp: 30, atk: 8, def: 45, crit: 5, critDmg: 150, pen: 0, move: 3, aim: 0, eva: 0 }, skills: ['e_mace'], frontGuard: 15 },
    h_boss:   { name: '철갑 기사단장 강철수', race: 'human', art: 'h_boss', weapon: 'swing', size: 1.6, boss: true, base: { hp: 90, atk: 11, def: 50, crit: 10, critDmg: 160, pen: 0, move: 3, aim: 5, eva: 0 }, skills: ['e_cleave', 'e_warcry'], ai: 'boss' },
  };

  // 스테이지: 적 = [종류, 줄, 칸]
  const STAGES = [
    { id: 1, name: '불타는 국경 마을', bg: 'stage1', desc: '불타는 마을에서 침입한 인간 보병을 몰아내라.', enemies: [['h_spear', 1, 11], ['h_spear', 2, 12], ['h_spear', 3, 11], ['c_scout', 4, 13]], reward: { cheese: 80, scrap: 2, medal: 0 }, map: [0.22, 0.62] },
    { id: 2, name: '버려진 요새', bg: 'stage2', desc: '옛 기사단 요새를 점령한 적을 소탕하라.', enemies: [['h_spear', 1, 10], ['h_spear', 3, 10], ['h_xbow', 0, 13], ['h_xbow', 4, 13]], reward: { cheese: 100, scrap: 3, medal: 1 }, map: [0.38, 0.42] },
    { id: 3, name: '보급로 습격', bg: 'stage3', desc: '적 보급대를 습격하라. 석궁병을 조심할 것.', enemies: [['h_xbow', 1, 12], ['h_xbow', 3, 12], ['h_spear', 2, 10], ['c_scout', 0, 11], ['c_scout', 4, 11]], reward: { cheese: 120, scrap: 4, medal: 0 }, map: [0.55, 0.6] },
    { id: 4, name: '고양이 척후대', bg: 'stage4', desc: '숲에 숨어든 흑묘 기사단 척후대를 섬멸하라.', enemies: [['c_scout', 0, 12], ['c_scout', 2, 13], ['c_scout', 4, 12], ['c_knight', 1, 10], ['c_knight', 3, 10]], reward: { cheese: 140, scrap: 4, medal: 1 }, map: [0.7, 0.36] },
    { id: 5, name: '철갑 기사단장 강철수', bg: 'stage5', boss: true, desc: '성문 앞의 철갑 기사단장을 쓰러뜨려라!', enemies: [['h_boss', 2, 12], ['h_spear', 1, 10], ['h_spear', 3, 10], ['h_xbow', 0, 13], ['h_xbow', 4, 13], ['c_knight', 2, 9]], reward: { cheese: 200, scrap: 6, medal: 2 }, map: [0.86, 0.55] },
  ];

  const BUILDINGS = [
    { id: 'training', name: '훈련장', desc: '새 쥐를 영입해 키운다 (병과 선택).', sprite: 0 },
    { id: 'smithy', name: '대장간', desc: '대원의 무기 · 갑옷을 강화한다.', sprite: 1 },
    { id: 'tavern', name: '치즈 주점', desc: '치즈 한 바퀴! 대원 전원의 사기를 회복한다.', sprite: 2 },
    { id: 'chapel', name: '사원', desc: '부상당한 대원을 치료해 바로 출격할 수 있게 한다.', sprite: 3 },
    { id: 'warroom', name: '작전실', desc: '원탁 회의. 분대 인원을 늘린다.', sprite: 4 },
    { id: 'gate', name: '출격', desc: '지도를 펼치고 출격한다.', sprite: 5 },
  ];

  const COSTS = { recruit: 60, tavern: 20, chapel: 30, smith: (lv) => ({ cheese: 30 + lv * 20, scrap: 1 + lv }), warroom: [null, null, null, null, 1, 2] };
  const RANK_XP = [0, 0, 5, 14, 26, 40];       // 계급 n 이 되는 누적 경험치
  const RANK_NAME = ['', '견습', '종자', '기사', '기사장', '원탁'];
  const NAMES = ['치즈볼', '깨물이', '살랑이', '꼬리별', '도토리', '쫑긋', '버터', '모카', '보리', '호두', '찍순이', '수염돌', '말랑', '토실', '앵두', '귀요미', '콩떡', '바삭이', '솜뭉치', '날쌘돌'];

  window.DATA = { CLASSES, RECRUITABLE, SKILLS, ENEMIES, STAGES, BUILDINGS, COSTS, RANK_XP, RANK_NAME, NAMES };
})();
