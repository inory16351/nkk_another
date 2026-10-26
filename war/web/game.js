// 쥐 전쟁 시뮬 — 전투 규칙 · 턴 흐름 · 고양이 AI · 분대 기록(영구 사망 · 성장)
// 화면 그리기와 입력은 view.js. 둘이 같이 쓰는 상태는 G.

const G = {
  world: null, units: [], turn: 'rat', round: 1, sel: null,
  mode: 'idle', // idle | move | target | tile | busy | over
  ability: null, targetIdx: 0, hoverTile: null,
  shells: 0, log: [], vis: new Set(), over: null, t: 0,
};

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (msg, kind = '') => { G.log.unshift({ msg, kind, t: G.t }); G.log.length = Math.min(G.log.length, 7); };

// ── 분대 기록 (localStorage): 죽은 쥐는 다시 못 씀, 살아남으면 경험치 · 계급 ──
const RANKS = [
  { name: '이병', xp: 0, aim: 0, hp: 0 },
  { name: '일병', xp: 2, aim: 4, hp: 0 },
  { name: '상병', xp: 5, aim: 7, hp: 1 },
  { name: '병장', xp: 9, aim: 10, hp: 1 },
  { name: '하사', xp: 14, aim: 14, hp: 2 },
];
const rankOf = (xp) => RANKS.reduce((r, R, i) => (xp >= R.xp ? i : r), 0);
const RECRUITS = ['쥬드', '미르코', '레나', '토비', '아벨', '사샤', '니코', '이다', '파벨', '루카', '엘사', '보리스', '야나', '오토', '미샤'];
const HEAD_TINTS = ['none', 'brightness(0.62) saturate(0.8)', 'brightness(1.25) saturate(0.55)', 'sepia(0.4) brightness(1.08)', 'hue-rotate(-12deg) brightness(0.85)'];

const Roster = {
  key: 'war_roster_v1',
  load() {
    try { const r = JSON.parse(localStorage.getItem(this.key)); if (r && r.squad) return r; } catch (e) { /* 새로 */ }
    return null;
  },
  save(r) { try { localStorage.setItem(this.key, JSON.stringify(r)); } catch (e) { /* 저장 못 해도 진행 */ } },
  fresh() {
    return {
      battles: 0,
      squad: MAP.rats.map((r, i) => ({ id: 'r' + i, name: r.name, cls: r.cls, xp: 0, kills: 0, missions: 0, tint: i })),
      fallen: [], used: MAP.rats.map((r) => r.name),
    };
  },
  // 빈자리는 이병으로 채움
  fill(r) {
    const need = ['rifleman', 'gunner', 'sniper', 'engineer'];
    while (r.squad.length < 4) {
      const have = r.squad.map((s) => s.cls);
      const cls = need.find((c) => !have.includes(c)) || 'rifleman';
      const name = RECRUITS.find((n) => !r.used.includes(n)) || '신병' + (r.used.length + 1);
      r.used.push(name);
      r.squad.push({ id: 'r' + Date.now() + r.squad.length, name, cls, xp: 0, kills: 0, missions: 0, tint: rnd(0, HEAD_TINTS.length - 1) });
    }
    return r;
  },
};

// ── 유닛 ──
let UID = 0;
function makeUnit(side, cls, x, z, extra = {}) {
  const def = CLASSES[cls];
  const rank = side === 'rat' ? RANKS[rankOf(extra.xp || 0)] : RANKS[0];
  const u = {
    id: ++UID, side, cls, def, x, z, px: x, pz: z,
    name: extra.name || def.name,
    maxHp: def.hp + rank.hp, hp: def.hp + rank.hp, aim: def.aim + rank.aim,
    ap: 0, ammo: WEAPONS[def.weapon].clip, grenades: def.grenades || 0, medkits: def.medkits || 0,
    alive: true, overwatch: false, hunker: false, suppressedBy: null, suppressing: null, moved: false,
    active: side === 'rat', pod: extra.pod || null, seen: side === 'rat',
    // 기록
    rosterId: extra.rosterId, xp: extra.xp || 0, kills: 0,
    // 그리기
    fdx: 0, fdz: side === 'rat' ? -1 : 1, st: { seed: Math.random() * 6 }, face: null, faceT: 0,
    tint: extra.tint || 'none', cut: null, hide: {}, corpse: false, deathT: 0,
  };
  return u;
}

const rats = () => G.units.filter((u) => u.side === 'rat' && u.alive);
const cats = () => G.units.filter((u) => u.side === 'cat' && u.alive);
const enemiesOf = (u) => G.units.filter((o) => o.alive && o.side !== u.side);
const friendsOf = (u) => G.units.filter((o) => o.alive && o.side === u.side);

function startBattle() {
  UID = 0;
  G.world = World.create(MAP);
  G.units = [];
  G.world.units = G.units;
  G.roster = Roster.fill(Roster.load() || Roster.fresh());
  const spots = MAP.rats.map((r) => [r.x, r.z]);
  G.roster.squad.slice(0, 4).forEach((s, i) => {
    const u = makeUnit('rat', s.cls, spots[i][0], spots[i][1], { name: s.name, xp: s.xp, rosterId: s.id, tint: HEAD_TINTS[s.tint % HEAD_TINTS.length] });
    G.units.push(u);
  });
  for (const c of MAP.cats) {
    const u = makeUnit('cat', c.cls, c.x, c.z, { pod: c.pod });
    if (c.cls === 'officer') u.tint = 'brightness(0.8) contrast(1.15)';
    if (c.cls === 'mgcat') u.tint = 'sepia(0.25) brightness(0.92)';
    G.units.push(u);
  }
  G.shells = MAP.mortarShells;
  G.turn = 'rat'; G.round = 1; G.over = null; G.log = [];
  G.stats = { kills: 0, lost: 0 };
  beginTurn('rat');
  updateVision();
  say(MAP.name + ' — 언덕 위 박격포를 먼저 차지하라', 'title');
}

// ── 시야 ──
function updateVision() {
  const w = G.world;
  G.vis = new Set();
  for (const r of rats()) {
    const s = World.sightOf(w, r);
    for (const t of w.tiles) {
      if (Math.hypot(t.x - r.x, t.z - r.z) <= s && World.los(w, r, t)) G.vis.add(t.z * w.W + t.x);
    }
  }
  // 무리 깨우기: 서로 보이면 그 무리 전부
  const wake = new Set();
  for (const c of cats()) {
    const seenNow = G.vis.has(c.z * w.W + c.x);
    if (seenNow && !c.seen) c.seen = true;
    c.visible = seenNow;
    if (!c.active && (seenNow || rats().some((r) => World.canSee(w, c, r)))) wake.add(c.pod);
  }
  return wake;
}

// 무리가 깨면 엑스컴처럼 엄폐물로 흩어짐 (공짜 이동)
async function wakePods(pods) {
  for (const pod of pods) {
    const group = cats().filter((c) => c.pod === pod && !c.active);
    if (!group.length) continue;
    for (const c of group) c.active = true;
    say(`고양이 무리 발견! (${group.length})`, 'warn');
    View.focus(group[0], 0.5);
    await sleep(350);
    for (const c of group) {
      const spot = bestTile(c, c.def.mob, true);
      if (spot && (spot.x !== c.x || spot.z !== c.z)) await moveUnit(c, spot.path, { scamper: true });
    }
  }
}

// ── 명중률 ──
function hitInfo(a, b, opts = {}) {
  const w = G.world;
  const wp = WEAPONS[opts.weapon || a.def.weapon];
  const d = World.dist(a, b);
  const parts = [['조준', a.aim]];
  parts.push(['거리', wp.range(Math.round(d))]);
  const cv = World.coverAgainst(w, b, a);
  if (cv.cover) parts.push([cv.cover === 2 ? '높은 엄폐' : '낮은 엄폐', -RULES.coverDef[cv.cover]]);
  if (b.hunker && cv.cover) parts.push(['엎드림', -RULES.hunkerDef]);
  const ha = World.tile(w, a.x, a.z).h, hb = World.tile(w, b.x, b.z).h;
  if (ha > hb) parts.push(['고지', RULES.highGroundAim]);
  if (a.suppressedBy) parts.push(['제압당함', RULES.suppressAim]);
  if (opts.overwatch) parts.push(['경계 사격', RULES.overwatchAim]);
  if (opts.aimed) parts.push(['정조준', 20]);
  if (opts.heavy) parts.push(['중기관총', 0]);
  const off = a.side === 'cat' && cats().some((o) => o.def.aura && o !== a && World.dist(o, a) <= 4);
  if (off) parts.push(['장교 지휘', 10]);
  const hit = Math.max(1, Math.min(99, parts.reduce((s, p) => s + p[1], 0)));
  let crit = wp.crit + (cv.flanked || (!cv.cover && World.coverSides(w, b.x, b.z).length === 0) ? RULES.flankCrit : 0);
  if (!cv.cover && World.coverSides(w, b.x, b.z).length === 0) crit = wp.crit + 15;
  if (cv.flanked) crit = wp.crit + RULES.flankCrit;
  return { hit, crit: Math.min(100, crit), parts, cover: cv.cover, flanked: cv.flanked, dmg: wp.dmg };
}

function canTarget(a, b) {
  return b.alive && (b.side === 'rat' || b.visible || a.side === 'cat') && World.canSee(G.world, a, b);
}

function visibleEnemies(u) {
  return enemiesOf(u).filter((e) => canTarget(u, e));
}

// ── 턴 ──
function beginTurn(side) {
  G.turn = side;
  for (const u of G.units.filter((u) => u.alive && u.side === side)) {
    u.ap = RULES.ap; u.moved = false;
    u.overwatch = false; u.hunker = false;
    if (u.suppressing) { u.suppressing.suppressedBy = null; u.suppressing = null; }
  }
}

async function endRatTurn() {
  if (G.turn !== 'rat' || G.mode === 'busy' || G.over) return;
  G.mode = 'busy'; G.sel = null;
  View.banner('고양이 군 차례', 'cat');
  beginTurn('cat');
  await sleep(900);
  await catTurn();
  if (G.over) return;
  G.round++;
  beginTurn('rat');
  View.banner(`아군 차례 · ${G.round}턴`, 'rat');
  G.mode = 'idle';
  selectNext();
}

function selectNext(from) {
  const list = rats().filter((u) => u.ap > 0);
  if (!list.length) { G.sel = null; return; }
  const i = from ? (list.indexOf(from) + 1) % list.length : 0;
  G.sel = list[i] || list[0];
  G.mode = 'move'; G.ability = null;
  View.focus(G.sel, 0.4);
}

async function afterRatAction(u) {
  checkOver();
  if (G.over) return;
  if (u.ap <= 0 || !u.alive) {
    if (!rats().some((r) => r.ap > 0)) { await sleep(450); return endRatTurn(); }
    selectNext(u);
  } else { G.mode = 'move'; G.ability = null; }
}

function checkOver() {
  if (G.over) return;
  if (!cats().length) finish('win');
  else if (!rats().length) finish('lose');
}

function finish(result) {
  G.over = result; G.mode = 'over';
  // 기록: 살아남은 쥐 경험치 +1, 처치마다 +1. 죽은 쥐는 전사자 명단으로
  const r = G.roster;
  r.battles++;
  const report = [];
  for (const u of G.units.filter((u) => u.side === 'rat')) {
    const s = r.squad.find((q) => q.id === u.rosterId);
    if (!s) continue;
    if (!u.alive) {
      r.fallen.push({ name: s.name, cls: s.cls, rank: RANKS[rankOf(s.xp)].name, kills: s.kills + u.kills, battle: r.battles });
      r.squad = r.squad.filter((q) => q !== s);
      report.push({ name: s.name, dead: true });
      continue;
    }
    const before = rankOf(s.xp);
    s.xp += u.kills + 1 + (result === 'win' ? 1 : 0);
    s.kills += u.kills; s.missions++;
    const after = rankOf(s.xp);
    report.push({ name: s.name, cls: s.cls, xp: s.xp, kills: u.kills, rank: RANKS[after].name, promoted: after > before });
  }
  Roster.save(r);
  G.report = report;
  View.showEnd(result, report);
}

// ── 행동 ──
// 바라보는 방향은 세계 방향(fdx, fdz)으로만 기억. 앞 · 옆 · 뒤 그림은 카메라 회전에 따라 view.js 가 고름
function faceToward(u, x, z) {
  const dx = x - u.px, dz = z - u.pz, L = Math.hypot(dx, dz);
  if (L > 1e-3) { u.fdx = dx / L; u.fdz = dz / L; }
}

async function moveUnit(u, path, opts = {}) {
  if (!path || !path.length) return;
  const w = G.world;
  u.overwatch = false; u.hunker = false; u.cut = null;
  for (const step of path) {
    faceToward(u, step.x, step.z);
    const sx = u.px, sz = u.pz;
    const dur = (Math.hypot(step.x - sx, step.z - sz) / (opts.scamper ? 5.2 : 4.2)) * 1000;
    await View.tween(dur, (k) => { u.px = sx + (step.x - sx) * k; u.pz = sz + (step.z - sz) * k; u.st.walk = (u.st.walk || 0) + 0.035; });
    u.x = step.x; u.z = step.z; u.px = u.x; u.pz = u.z;
    const wake = updateVision();
    // 경계 사격 (제압당한 채 움직여도)
    for (const e of enemiesOf(u)) {
      if (!u.alive) break;
      const react = (e.overwatch || e.suppressing === u) && e.ammo > 0 && World.canSee(w, e, u) && World.dist(e, u) <= WEAPONS[e.def.weapon].clip * 0 + 12;
      if (react) {
        e.overwatch = false;
        say(`${e.name} 반응 사격!`, 'warn');
        await shoot(e, u, { overwatch: true });
      }
    }
    if (!u.alive) break;
    if (u.side === 'rat' && wake.size) { u.st.walk = null; await wakePods(wake); updateVision(); break; }
  }
  u.st.walk = null;
  u.moved = true;
  idleFacing(u);
}

// 서 있을 때 방향: 가장 가까운 보이는 적 쪽, 엄폐물 옆이면 웅크림
function idleFacing(u) {
  if (!u.alive) return;
  const foes = enemiesOf(u).filter((e) => u.side === 'cat' ? true : e.seen);
  let tgt = null, best = 1e9;
  for (const e of foes) { const d = World.dist(u, e); if (d < best) { best = d; tgt = e; } }
  if (tgt) faceToward(u, tgt.x, tgt.z);
  else { u.fdx = 0; u.fdz = u.side === 'rat' ? -1 : 1; }
  const cv = tgt ? World.coverAgainst(G.world, u, tgt) : { cover: World.coverSides(G.world, u.x, u.z).length ? 1 : 0 };
  u.inCover = cv.cover > 0;
}

function spendAP(u, ab) {
  if (ABILITIES[ab].end) u.ap = 0; else u.ap -= ABILITIES[ab].ap;
}

async function shoot(a, b, opts = {}) {
  const info = hitInfo(a, b, opts);
  const wp = WEAPONS[opts.heavy ? 'hmg' : a.def.weapon];
  faceToward(a, b.x, b.z);
  if (!opts.overwatch) View.focusPair(a, b);
  a.face = 'attack'; a.faceT = 1.2;
  await View.aim(a, 380);
  if (!opts.heavy) a.ammo = Math.max(0, a.ammo - 1);
  const roll = Math.random() * 100;
  const hit = roll < info.hit;
  const crit = hit && Math.random() * 100 < info.crit;
  const shots = a.def.weapon === 'lmg' || a.def.weapon === 'smg' || opts.heavy ? 3 : 1;
  for (let i = 0; i < shots; i++) {
    View.muzzle(a, b, hit);
    Sound.shot(a.def.weapon);
    a.st.recoil = 1;
    await sleep(shots > 1 ? 90 : 160);
  }
  if (hit) {
    let dmg = rnd(wp.dmg[0], wp.dmg[1]) + (crit ? RULES.critDmg : 0) + (opts.aimed ? 1 : 0);
    await damage(b, dmg, { crit, from: a, kind: a.def.weapon });
  } else {
    View.popup(b, '빗나감', '#d8d0b8');
    say(`${a.name} → ${b.name} 빗나감 (${info.hit}%)`);
  }
  await sleep(350);
  return hit;
}

async function damage(u, dmg, o = {}) {
  if (!u.alive) return;
  u.hp -= dmg;
  u.face = 'hit'; u.faceT = 1.0;
  u.st.hit = 1;
  View.blood(u, o.crit ? 14 : 8);
  View.popup(u, (o.crit ? '치명타! ' : '') + '−' + dmg, o.crit ? '#ffcf4a' : '#ff6b5b');
  Sound.hit();
  if (o.from) say(`${o.from.name} → ${u.name} ${dmg} 피해${o.crit ? ' (치명타)' : ''}`, u.side === 'rat' ? 'bad' : 'good');
  if (u.hp <= 0) await kill(u, o);
}

async function kill(u, o = {}) {
  u.alive = false; u.hp = 0;
  u.overwatch = false;
  if (u.suppressing) { u.suppressing.suppressedBy = null; u.suppressing = null; }
  if (o.from) o.from.kills++;
  if (u.side === 'cat') G.stats.kills++; else G.stats.lost++;
  say(u.side === 'rat' ? `${u.name} 전사…` : `${u.name} 사살`, u.side === 'rat' ? 'bad' : 'good');
  // 쓰러지는 방향: 쏜 쪽 반대. 옆모습으로 돌려서 리그로 쓰러뜨림
  if (o.from) faceToward(u, o.from.x, o.from.z);
  u.forceSide = true;
  u.cut = null;
  u.face = 'dead';
  // 신체 절단: 폭발 · 치명타 · 산탄총 근접
  let gore = null;
  if (o.kind === 'explosion') gore = Math.random() < 0.6 ? 'burst' : 'sever';
  else if (o.crit && Math.random() < 0.65) gore = Math.random() < 0.5 ? 'decap' : 'sever';
  else if (o.kind === 'shotgun' && Math.random() < 0.4) gore = 'sever';
  u.gore = gore;
  Sound.death();
  await View.die(u, gore);
  u.corpse = true;
  updateVision();
  checkOver();
}

async function throwGrenade(a, tx, tz, opts = {}) {
  faceToward(a, tx, tz);
  a.ap = 0;
  if (!opts.mortar) a.grenades--;
  a.face = 'attack'; a.faceT = 1.6;
  View.focusPair(a, { x: tx, z: tz });
  if (opts.mortar) {
    a.cut = 'mortar';
    await sleep(400);
    Sound.mortar();
    await View.shell(a, tx, tz, 1100);
  } else {
    a.cut = View.viewOf(a).view === 'side' ? 'throw' : null;
    await sleep(250);
    await View.lob(a, tx, tz, 700);
  }
  a.cut = null;
  await explode(tx, tz, opts.mortar ? ABILITIES.mortar : ABILITIES.grenade, a);
}

async function explode(tx, tz, ab, from) {
  const w = G.world;
  View.explosion(tx, tz, ab.radius);
  Sound.boom();
  // 낮은 엄폐물 부서짐
  for (const t of w.tiles) {
    if (Math.hypot(t.x - tx, t.z - tz) <= ab.radius && t.prop && PROPS[t.prop].breakable) {
      View.debris(t.x, t.z, t.prop);
      t.prop = null; t.ground = 'crater';
      View.groundDirty = true;
    } else if (Math.hypot(t.x - tx, t.z - tz) <= 0.6 && !t.prop) { t.ground = 'crater'; View.groundDirty = true; }
  }
  const hits = G.units.filter((u) => u.alive && Math.hypot(u.x - tx, u.z - tz) <= ab.radius);
  await sleep(200);
  await Promise.all(hits.map((u) => damage(u, rnd(ab.dmg[0], ab.dmg[1]), { from, kind: 'explosion' })));
  await sleep(400);
}

// 쥐 능력 실행 (view.js 에서 부름)
async function doAbility(u, ab, target) {
  if (G.mode === 'busy') return;
  G.mode = 'busy';
  try {
    if (ab === 'shoot') { spendAP(u, ab); await shoot(u, target); }
    else if (ab === 'aimed') { spendAP(u, ab); await shoot(u, target, { aimed: true }); }
    else if (ab === 'heavy') { spendAP(u, ab); await shoot(u, target, { heavy: true }); }
    else if (ab === 'suppress') {
      spendAP(u, ab);
      u.ammo = Math.max(0, u.ammo - 1);
      target.suppressedBy = u; u.suppressing = target;
      faceToward(u, target.x, target.z);
      View.focusPair(u, target);
      for (let i = 0; i < 6; i++) { View.muzzle(u, target, false); Sound.shot('lmg'); u.st.recoil = 1; await sleep(80); }
      View.popup(target, '제압됨', '#ffb84a');
      say(`${u.name}: ${target.name} 제압 사격`);
      await sleep(400);
    } else if (ab === 'grenade') await throwGrenade(u, target.x, target.z);
    else if (ab === 'mortar') { G.shells--; await throwGrenade(u, target.x, target.z, { mortar: true }); }
    else if (ab === 'overwatch') { spendAP(u, ab); u.overwatch = true; View.popup(u, '경계', '#8fd0ff'); say(`${u.name} 경계`); }
    else if (ab === 'hunker') { spendAP(u, ab); u.hunker = true; View.popup(u, '엎드림', '#8fd0ff'); }
    else if (ab === 'reload') { spendAP(u, ab); u.ammo = WEAPONS[u.def.weapon].clip; View.popup(u, '재장전', '#d8d0b8'); Sound.reload(); await sleep(350); }
    else if (ab === 'firstaid') {
      spendAP(u, ab); u.medkits--;
      target.hp = Math.min(target.maxHp, target.hp + ABILITIES.firstaid.heal);
      View.popup(target, '+' + ABILITIES.firstaid.heal, '#7fdc8a');
      say(`${u.name} → ${target.name} 응급 처치`, 'good');
      await sleep(350);
    }
  } finally {
    if (G.mode === 'busy') G.mode = 'move';
  }
  idleFacing(u);
  await afterRatAction(u);
}

async function doMove(u, x, z) {
  if (G.mode === 'busy') return;
  const R = World.reach(G.world, u, u.def.mob * u.ap);
  const c = R.cost(x, z);
  if (c == null || c === 0) return;
  G.mode = 'busy';
  u.ap -= c <= u.def.mob ? 1 : 2;
  await moveUnit(u, R.path(x, z));
  G.mode = 'move';
  for (const r of rats()) idleFacing(r);
  await afterRatAction(u);
}

// 이 유닛이 지금 쓸 수 있는 능력
function abilitiesOf(u) {
  const list = [];
  const emp = World.propOf(World.tile(G.world, u.x, u.z));
  for (const ab of u.def.abil) {
    const A = ABILITIES[ab];
    let ok = u.ap >= A.ap, why = '';
    if (['shoot', 'aimed', 'suppress', 'overwatch'].includes(ab) && u.ammo <= 0) { ok = false; why = '탄 없음'; }
    if (ab === 'aimed' && u.moved) { ok = false; why = '이동함'; }
    if (ab === 'suppress' && u.ammo < 2) { ok = false; why = '탄 2발 필요'; }
    if (ab === 'grenade' && u.grenades <= 0) { ok = false; why = '없음'; }
    if (ab === 'firstaid' && u.medkits <= 0) { ok = false; why = '없음'; }
    if (A.target === 'enemy' && !visibleEnemies(u).length) { ok = false; why = why || '대상 없음'; }
    if (ab === 'firstaid' && !friendsOf(u).some((f) => f !== u && f.hp < f.maxHp && World.dist(f, u) < 1.6)) { ok = false; why = why || '붙은 부상자 없음'; }
    list.push({ ab, ok, why, count: ab === 'grenade' ? u.grenades : ab === 'firstaid' ? u.medkits : null });
  }
  list.push({ ab: 'reload', ok: u.ap >= 1 && u.ammo < WEAPONS[u.def.weapon].clip, why: '' });
  if (emp && emp.emplacement === 'mortar') list.push({ ab: 'mortar', ok: u.ap >= 2 && G.shells > 0, why: G.shells > 0 ? (u.ap < 2 ? '행동력 2 필요' : '') : '포탄 없음', count: G.shells });
  if (emp && emp.emplacement === 'hmg') list.push({ ab: 'heavy', ok: u.ap >= 1 && visibleEnemies(u).length > 0, why: '' });
  return list;
}

// ── 고양이 AI ──
// 칸 점수: 엄폐(보이는 쥐 기준) + 쏠 수 있는지 + 측면 + 진지 − 노출 − 거리
function scoreTile(c, x, z) {
  const w = G.world;
  const p = { x, z };
  let s = 0;
  const foes = rats();
  let bestShot = 0, exposed = 0, nearest = 1e9;
  for (const r of foes) {
    const d = Math.hypot(r.x - x, r.z - z);
    nearest = Math.min(nearest, d);
    const sees = d <= RULES.sight + 1 && World.los(w, r, p);
    if (sees) {
      const cv = World.coverAgainst(w, p, r);
      s += cv.cover * 14;
      if (!cv.cover) exposed++;
      if (cv.flanked) exposed++;
      const fake = { ...c, x, z };
      const hi = hitInfo(fake, r);
      bestShot = Math.max(bestShot, hi.hit + (hi.flanked ? 20 : 0));
    }
  }
  s += bestShot * 0.45;
  s -= exposed * 22;
  // 너무 붙거나 너무 멀지 않게
  const want = c.def.weapon === 'smg' ? 4.5 : 7;
  s -= Math.abs(nearest - want) * 3;
  const pr = World.propOf(World.tile(w, x, z));
  if (pr && pr.emplacement === 'mortar' && G.shells > 0) s += 45;
  if (pr && pr.emplacement === 'hmg') s += 22;
  if (World.tile(w, x, z).h) s += 12;
  return s;
}

function bestTile(c, budget, wantCover) {
  const R = World.reach(G.world, c, budget);
  let best = null;
  for (const [k, cost] of R.keys) {
    const x = k % G.world.W, z = Math.floor(k / G.world.W);
    let s = scoreTile(c, x, z) - cost * 0.6 + Math.random() * 4;
    if (wantCover && !World.coverSides(G.world, x, z).length) s -= 15;
    if (!best || s > best.s) best = { x, z, s, path: R.path(x, z), cost };
  }
  return best;
}

async function catTurn() {
  const w = G.world;
  for (const c of cats()) {
    if (!c.active || !c.alive || G.over) continue;
    if (!rats().length) break;
    if (c.visible) View.focus(c, 0.35);
    await sleep(c.visible ? 300 : 60);
    // 1) 진지에 있으면 박격포 · 중기관총
    const emp = World.propOf(World.tile(w, c.x, c.z));
    const shots = visibleEnemies(c).map((r) => ({ r, h: hitInfo(c, r) })).sort((a, b) => (b.h.hit + (b.h.flanked ? 25 : 0)) - (a.h.hit + (a.h.flanked ? 25 : 0)));
    if (emp && emp.emplacement === 'mortar' && G.shells > 0) {
      const tgt = clusterTarget(c);
      if (tgt) { G.shells--; say(`${c.name} 박격포 사격!`, 'warn'); await throwGrenade(c, tgt.x, tgt.z, { mortar: true }); continue; }
    }
    if (emp && emp.emplacement === 'hmg' && shots.length) { await shoot(c, shots[0].r, { heavy: true }); continue; }
    // 2) 지금 자리에서 좋은 사격이면 그대로 쏨
    const here = World.coverAgainst(w, c, rats()[0]);
    if (shots.length && shots[0].h.hit >= 55 && !here.flanked) { await catAttack(c, shots); continue; }
    // 3) 수류탄: 두 마리 이상 모였거나 엄폐 뒤 쥐
    if (c.grenades > 0) {
      const g = clusterTarget(c, 9, 2);
      if (g) { say(`${c.name} 수류탄!`, 'warn'); await throwGrenade(c, g.x, g.z); continue; }
    }
    // 4) 더 나은 자리로 이동 후 사격
    const spot = bestTile(c, c.def.mob, false);
    if (spot && spot.cost > 0) {
      await moveUnit(c, spot.path);
      if (!c.alive) continue;
      if (G.over) return;
    }
    const after = visibleEnemies(c).map((r) => ({ r, h: hitInfo(c, r) })).sort((a, b) => b.h.hit - a.h.hit);
    const emp2 = World.propOf(World.tile(w, c.x, c.z));
    if (emp2 && emp2.emplacement === 'mortar' && G.shells > 0) {
      const tgt = clusterTarget(c);
      if (tgt) { G.shells--; say(`${c.name} 박격포 사격!`, 'warn'); await throwGrenade(c, tgt.x, tgt.z, { mortar: true }); continue; }
    }
    if (after.length && after[0].h.hit >= 25) await catAttack(c, after);
    else { c.overwatch = true; if (c.visible) View.popup(c, '경계', '#ff9f8f'); }
    await sleep(120);
  }
  updateVision();
}

async function catAttack(c, shots) {
  if (c.ammo <= 0) { c.ammo = WEAPONS[c.def.weapon].clip; if (c.visible) View.popup(c, '재장전', '#d8d0b8'); Sound.reload(); await sleep(300); return; }
  const best = shots[0];
  if (c.def.weapon === 'lmg' && best.h.hit < 45 && c.ammo >= 2 && !best.r.suppressedBy) {
    best.r.suppressedBy = c; c.suppressing = best.r; c.ammo--;
    View.focusPair(c, best.r);
    for (let i = 0; i < 6; i++) { View.muzzle(c, best.r, false); Sound.shot('lmg'); c.st.recoil = 1; await sleep(80); }
    View.popup(best.r, '제압됨', '#ffb84a');
    say(`${c.name}: ${best.r.name} 제압 사격`, 'bad');
    await sleep(300);
    return;
  }
  await shoot(c, best.r);
}

// 폭발 대상: 보이는 쥐가 가장 많이 들어가는 칸 (min 마리 이상)
function clusterTarget(c, range = ABILITIES.mortar.range, min = 1) {
  const w = G.world;
  const seenRats = rats().filter((r) => cats().some((o) => World.canSee(w, o, r)));
  let best = null;
  for (const r of seenRats) {
    if (World.dist(c, r) > range) continue;
    for (const [dx, dz] of [[0, 0], ...World.DIRS8]) {
      const x = r.x + dx, z = r.z + dz;
      if (!World.tile(w, x, z)) continue;
      const n = seenRats.filter((o) => Math.hypot(o.x - x, o.z - z) <= 1.5).length;
      const hurtsCat = cats().some((o) => Math.hypot(o.x - x, o.z - z) <= 1.6);
      if (hurtsCat) continue;
      const covered = seenRats.filter((o) => Math.hypot(o.x - x, o.z - z) <= 1.5 && World.coverSides(w, o.x, o.z).length).length;
      const s = n * 10 + covered * 3;
      if (n >= min && (!best || s > best.s)) best = { x, z, s };
    }
  }
  return best;
}
