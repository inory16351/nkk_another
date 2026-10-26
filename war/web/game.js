// 쥐 전쟁 시뮬 — 전투 규칙 · 턴 흐름 · 고양이 AI · 분대 기록(영구 사망 · 성장)
// 화면 그리기와 입력은 view.js. 둘이 같이 쓰는 상태는 G.

const G = {
  world: null, units: [], turn: 'rat', round: 1, sel: null,
  mode: 'idle', // idle | move | target | tile | busy | over
  ability: null, targetIdx: 0, hoverTile: null,
  shells: 0, log: [], vis: new Set(), over: null, t: 0, ts: 1,
};

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// 슬로 모션(G.ts < 1) 중엔 기다림도 길어짐
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / Math.max(0.05, G.ts || 1)));
const say = (msg, kind = '') => { G.log.unshift({ msg, kind, t: G.t }); G.log.length = Math.min(G.log.length, 7); };

// ── 유닛 ──
let UID = 0;
// 쥐: r = Camp 분대 기록, st = Camp.stats(r). 고양이: CLASSES
function makeUnit(side, cls, x, z, extra = {}) {
  const st = extra.stats;
  const def = st ? { ...st.cls, abil: st.abil, mob: st.mob } : CLASSES[cls];
  const u = {
    id: ++UID, side, cls: st ? st.clsId : cls, def, x, z, px: x, pz: z,
    name: extra.name || def.name,
    maxHp: st ? st.hp : def.hp, hp: st ? st.hp : def.hp, aim: st ? st.aim : def.aim,
    ap: 0, ammo: WEAPONS[def.weapon].clip + (st ? st.clip : 0), clip: WEAPONS[def.weapon].clip + (st ? st.clip : 0),
    grenades: st ? st.grenades : def.grenades || 0, medkits: st ? st.medkits : def.medkits || 0,
    charges: st ? st.charges : 0, cheese: st ? st.cheese : 0, psi: st ? st.psi : 0, flame: (st && st.abil.includes('flame')) || def.flame ? ABILITIES.flame.uses : 0,
    critB: st ? st.crit : 0, defB: st ? st.def : 0, dmgB: st ? st.dmg : 0, healB: st ? st.heal : 0, blast: st ? st.blast : 0, boom: st ? st.boom : 0,
    sight: st ? st.sight : def.sight || 0, climb: st ? st.climb : false, whisker: st ? st.whisker : 0, perks: st ? st.perks : [],
    mob: def.mob, wounds: {}, downed: false,
    alive: true, overwatch: false, hunker: false, suppressedBy: null, suppressing: null, moved: false,
    active: side === 'rat', pod: extra.pod || null, seen: side === 'rat', target: !!extra.target,
    // 스트레스 (쥐만) · 정신 이상 · 버프
    stress: extra.r ? extra.r.stress : 0, broke: null, panic: 0, buffAim: 0, ward: 0, burn: 0, hidden: false, marked: false, used: {},
    // 기록
    r: extra.r || null, rosterId: extra.r ? extra.r.id : null, xp: extra.r ? extra.r.xp : 0, kills: 0,
    // 그리기: 얼굴 · 털 · 병종 모자 (rig.js 가 머리 파츠를 갈아 끼움)
    fdx: 0, fdz: side === 'rat' ? -1 : 1, st: { seed: Math.random() * 6 }, face: null, faceT: 0,
    look: extra.look || null,
    tint: extra.tint || 'none', cut: null, hide: {}, corpse: false, deathT: 0,
  };
  return u;
}

const rats = () => G.units.filter((u) => u.side === 'rat' && u.alive);
const cats = () => G.units.filter((u) => u.side === 'cat' && u.alive);
const enemiesOf = (u) => G.units.filter((o) => o.alive && o.side !== u.side);
const friendsOf = (u) => G.units.filter((o) => o.alive && o.side === u.side);

// 전투 시작: mission = MISSIONS 하나, deploy = 출전할 쥐 id (최대 6)
function startBattle(mission, deploy) {
  UID = 0;
  G.camp = Camp.load() || Camp.fresh();
  G.mission = mission || Camp.current(G.camp);
  const def = missionMap(G.mission);
  G.world = World.create(def);
  G.units = [];
  G.world.units = G.units;
  G.tunnels = []; G.fires = []; G.scan = 0;
  G.world.tunnels = G.tunnels;
  const ids = (deploy || G.camp.deploy).filter((id) => G.camp.squad.some((r) => r.id === id && Camp.ready(r))).slice(0, DEPLOY_MAX);
  if (!ids.length) ids.push(...G.camp.squad.filter(Camp.ready).slice(0, DEPLOY_MAX).map((r) => r.id));
  ids.forEach((id, i) => {
    const r = G.camp.squad.find((q) => q.id === id);
    const [x, z] = def.spawn[i];
    const st = Camp.stats(r, ids);
    for (const t of r.traits) if (TRAITS[t].homesick) r.stress = Math.min(99, r.stress + TRAITS[t].homesick);
    const u = makeUnit('rat', st.clsId, x, z, { name: r.name, r, stats: st, look: { face: r.face, fur: FURS[r.fur].f, hat: st.clsId } });
    u.stress = r.stress;
    G.units.push(u);
  });
  for (const c of def.cats) {
    // 고양이 얼굴: 정해 둔 머리 이름 → 개체 얼굴 번호 (얼룩 · 턱시도 · 뚱보 주황 · 샴 · 흉터 흰 수컷)
    const CAT_FACE = { mackerel: 0, tuxedo: 1, chonk: 2, loaf: 2, boss_ryan: 3, boss_turret: 4, boss_dictator: 4 };
    const u = makeUnit('cat', c.cls, c.x, c.z, { pod: c.pod, target: c.target, look: { face: c.face != null ? c.face : CAT_FACE[c.head] != null ? CAT_FACE[c.head] : null, hat: c.cls } });
    if (c.target) u.name = '표적 · ' + u.name;
    G.units.push(u);
  }
  G.shells = def.mortarShells;
  G.turn = 'rat'; G.round = 1; G.over = null; G.log = []; G.alerted = new Set();
  G.stats = { kills: 0, lost: 0 };
  beginTurn('rat');
  updateVision();
  say(G.mission.name, 'title');
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
  // 무리 깨우기: 가까이서(wakeRange) 서로 보이거나, 맞았으면 그 무리 전부
  const wake = new Set(G.alerted);
  for (const c of cats()) {
    const whisk = rats().some((r) => r.whisker && World.dist(r, c) <= r.whisker);
    const seenNow = G.vis.has(c.z * w.W + c.x) || whisk || G.scan > 0;
    if (seenNow && !c.seen) c.seen = true;
    c.visible = seenNow;
    if (!c.active && rats().some((r) => World.dist(r, c) <= RULES.wakeRange && World.canSee(w, c, r))) wake.add(c.pod);
  }
  return wake;
}

// 무리가 깨면 엑스컴처럼 엄폐물로 흩어짐 (공짜 이동)
async function wakePods(pods) {
  for (const pod of pods) {
    G.alerted.delete(pod);
    const group = cats().filter((c) => c.pod === pod && !c.active);
    if (!group.length) continue;
    for (const c of group) c.active = true;
    say(`고양이 무리 발견! (${group.length})`, 'warn');
    View.focus(group[0], 0.5);
    await sleep(350);
    for (const c of group) {
      const spot = bestTile(c, c.mob, true);
      if (spot && (spot.x !== c.x || spot.z !== c.z)) await moveUnit(c, spot.path, { scamper: true });
    }
  }
}

// ── 명중률 ──
function hitInfo(a, b, opts = {}) {
  const w = G.world;
  const wp = WEAPONS[opts.weapon || (opts.heavy ? 'hmg' : a.def.weapon)];
  const d = World.dist(a, b);
  const parts = [['조준', a.aim]];
  parts.push(['거리', wp.range(Math.round(d))]);
  const cv = opts.knife ? { cover: 0, flanked: false } : World.coverAgainst(w, b, a);
  if (cv.cover) parts.push([cv.cover === 2 ? '높은 엄폐' : '낮은 엄폐', -RULES.coverDef[cv.cover]]);
  if (b.hunker && cv.cover) parts.push(['엎드림', -RULES.hunkerDef]);
  const ha = World.tile(w, a.x, a.z).h, hb = World.tile(w, b.x, b.z).h;
  if (ha > hb) parts.push(['고지', RULES.highGroundAim]);
  if (a.suppressedBy) parts.push(['제압당함', RULES.suppressAim]);
  if (a.wounds && a.wounds.arm) parts.push(['팔 부상', -RULES.armWoundAim]);
  if (opts.overwatch) parts.push(['경계 사격', RULES.overwatchAim]);
  if (opts.aimed) parts.push(['정조준', 20]);
  if (opts.knife) parts.push(['칼', 30]);
  if (a.buffAim) parts.push(['함성', a.buffAim]);
  if (b.marked && a.side === 'rat') parts.push(['표적 지정', 15]);
  if (a.perks && a.perks.includes('closeq') && d <= 4) parts.push(['근접 사격', 15]);
  if (opts.overwatch && a.perks && a.perks.includes('sentry')) parts.push(['노련한 경계', -RULES.overwatchAim]);
  if (b.defB) parts.push(['회피', -b.defB]);
  if (a.side === 'rat' && rats().some((o) => o !== a && Camp.has(o.r, 'leader') && World.dist(o, a) <= 3)) parts.push(['지휘관 곁', 5]);
  if (Camp.has(a.r, 'loner') && !rats().some((o) => o !== a && World.dist(o, a) <= 3)) parts.push(['외톨이', 10]);
  if (a.r && a.r.traits.includes('sibling') && a.r.sibling && G.units.some((o) => o.rosterId === a.r.sibling && !o.alive && !o.downed)) parts.push(['복수심', 15]);
  const off = a.side === 'cat' && cats().some((o) => o.def.aura && o !== a && World.dist(o, a) <= 4);
  if (off) parts.push(['장교 지휘', 10]);
  const hit = Math.max(1, Math.min(99, parts.reduce((s, p) => s + p[1], 0)));
  let crit = wp.crit + (cv.flanked || (!cv.cover && World.coverSides(w, b.x, b.z).length === 0) ? RULES.flankCrit : 0);
  if (!cv.cover && World.coverSides(w, b.x, b.z).length === 0) crit = wp.crit + 15;
  if (cv.flanked) crit = wp.crit + RULES.flankCrit;
  crit += a.critB || 0;
  return { hit, crit: Math.min(100, crit), parts, cover: cv.cover, flanked: cv.flanked, dmg: wp.dmg };
}

function canTarget(a, b) {
  if (b.hidden && a.side === 'cat') return false;
  return b.alive && (b.side === 'rat' || b.visible || a.side === 'cat') && World.canSee(G.world, a, b);
}

function visibleEnemies(u) {
  return enemiesOf(u).filter((e) => canTarget(u, e));
}

// ── 턴 ──
function beginTurn(side) {
  G.turn = side;
  if (side === 'rat') {
    G.scan = 0;
    // 지배 끝난 고양이는 돌아감
    for (const u of G.units) if (u.controlled && --u.controlled <= 0) { u.side = 'cat'; u.active = true; u.tint = 'none'; View.popup(u, '정신 돌아옴', '#ff9f8f'); say(`${u.name} 지배 풀림`, 'warn'); }
  }
  for (const u of G.units.filter((u) => u.alive && u.side === side)) {
    u.ap = RULES.ap; u.moved = false;
    u.overwatch = false; u.hunker = false; u.buffAim = 0; u.fired = false;
    if (u.suppressing) { u.suppressing.suppressedBy = null; u.suppressing = null; }
    if (u.panic > 0) { u.panic--; u.ap = 0; View.popup(u, '공황 — 움직이지 못함', '#c9a3ff'); }
    if (side === 'rat' && u.r && Camp.has(u.r, 'smoker') && G.round > 1) addStress(u, -TRAITS.smoker.smoke);
  }
}

// 불 · 화상: 턴이 바뀔 때 (불 난 칸 위 · 화상 입은 유닛)
async function burnTick() {
  for (const f of G.fires) f.turns--;
  G.fires = G.fires.filter((f) => f.turns > 0);
  for (const u of G.units.filter((u) => u.alive && (u.burn > 0 || G.fires.some((f) => f.x === u.x && f.z === u.z)))) {
    u.burn = Math.max(0, u.burn - 1);
    View.popup(u, '화상', '#ff9a3c');
    await damage(u, 1 + (u.burnB || 0), { kind: 'fire', part: 'torso' });
  }
}

// ── 스트레스 (쥐만). 100 이 넘으면 무너짐: 공황(그 자리에서 굳음) · 광란(가까운 아무나 쏨) · 도주 ──
function addStress(u, n, why) {
  if (!u || u.side !== 'rat' || !u.r || !u.alive || u.controlled) return;
  const before = u.stress, cap = Camp.breakAt(u.r);
  const lead = n > 0 && rats().some((o) => o !== u && Camp.has(o.r, 'leader') && World.dist(o, u) <= 3) ? 0.8 : 1;
  u.stress = Math.max(0, Math.min(cap, u.stress + (n > 0 ? Math.round(n * Camp.stressMul(u.r, why) * lead) : n)));
  if (n > 0 && u.stress - before >= 6) View.popup(u, `스트레스 +${u.stress - before}`, '#c9a3ff');
  if (u.stress >= cap && !u.broke) u.broke = why || true; // 실제로 무너지는 건 그 쥐 차례 (breakdowns)
}
// 아군이 당한 걸 본 쥐들
function witness(victim, n, why) {
  for (const r of rats()) {
    if (r === victim) continue;
    const sib = victim.r && r.r && r.r.sibling === victim.rosterId;
    if (sib || World.dist(r, victim) <= 7) addStress(r, sib && why === 'dead' ? STRESS.siblingDead : n, sib && why === 'dead' ? 'sibling' : why);
  }
}
const BREAKS = [
  { id: 'panic', name: '공황', w: 50, desc: '몸이 굳어 버림' },
  { id: 'frenzy', name: '광란', w: 25, desc: '눈에 보이는 아무나 쏨' },
  { id: 'flee', name: '도주', w: 25, desc: '적에게서 달아남' },
];
async function breakdowns() {
  for (const u of rats().filter((u) => u.broke && u.r)) {
    const roll = Math.random() * 100;
    let acc = 0, B = BREAKS[0];
    for (const b of BREAKS) { acc += b.w; if (roll < acc) { B = b; break; } }
    u.broke = null; u.brokeName = B.name;
    u.stress = STRESS.after;
    View.focus(u); View.slowmo(0.6, 0.35);
    View.popup(u, `${B.name}!`, '#c9a3ff');
    say(`${u.name} 정신이 무너졌다 — ${B.name} (${B.desc})`, 'bad');
    u.face = 'hit'; u.faceT = 2;
    witness(u, STRESS.panicNear, 'panic');
    await sleep(900);
    if (B.id === 'panic') { u.panic = 1; u.ap = 0; }
    else if (B.id === 'frenzy') {
      const all = G.units.filter((o) => o !== u && o.alive && World.canSee(G.world, u, o) && (o.side === 'rat' || o.visible));
      const t = all.sort((a, b) => World.dist(u, a) - World.dist(u, b))[0];
      if (t && u.ammo > 0) { say(`${u.name}이(가) ${t.name}에게 총을 겨눈다!`, 'bad'); await shoot(u, t); }
      u.ap = 0;
    } else {
      const R = World.reach(G.world, u, u.mob);
      let best = null;
      for (const [k] of R.keys) {
        const x = k % G.world.W, z = Math.floor(k / G.world.W);
        const d = Math.min(...cats().map((c) => Math.hypot(c.x - x, c.z - z)), 99);
        if (!best || d > best.d) best = { x, z, d };
      }
      if (best) await moveUnit(u, R.path(best.x, best.z));
      u.ap = 0;
    }
  }
}


async function endRatTurn() {
  if (G.turn !== 'rat' || G.mode === 'busy' || G.over) return;
  G.mode = 'busy'; G.sel = null;
  for (const r of rats()) {
    if (!r.fired && !r.overwatch && !r.hidden && World.coverSides(G.world, r.x, r.z).length) { r.hunker = true; View.popup(r, '엎드림', '#8fd0ff'); }
  }
  View.banner('고양이 군 차례', 'cat');
  beginTurn('cat');
  await sleep(900);
  await catTurn();
  if (G.over) return;
  await burnTick();
  if (G.over) return;
  G.round++;
  beginTurn('rat');
  View.banner(`아군 차례 · ${G.round}턴`, 'rat');
  await breakdowns();
  checkOver();
  if (G.over) return;
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

// 목표: elim 전멸 · officer 표적 처치 · reach 깃발 칸
function objectiveDone() {
  const m = G.mission;
  if (!cats().length) return true;
  if (m.obj === 'officer') return !G.units.some((u) => u.target && u.alive);
  if (m.obj === 'reach' && G.world.goal) { const g = G.world.goal; return rats().some((r) => !r.controlled && Math.hypot(r.x - g.x, r.z - g.z) <= g.r); }
  return false;
}
function objectiveText() {
  const m = G.mission;
  const left = cats().length;
  if (m.obj === 'officer') return [['표적 장교 사살', !G.units.some((u) => u.target && u.alive)], [`남은 고양이 ${left}`, false]];
  if (m.obj === 'reach') return [['깃발까지 쥐 한 마리', objectiveDone()], [`남은 고양이 ${left}`, left === 0]];
  return [[`고양이 전멸 (남은 ${left})`, left === 0]];
}
function checkOver() {
  if (G.over) return;
  if (objectiveDone()) finish('win');
  else if (!G.units.some((u) => u.side === 'rat' && u.alive && !u.controlled)) finish('lose');
}

function finish(result) {
  G.over = result; G.mode = 'over';
  // 지배당한 고양이는 원래대로
  for (const u of G.units) if (u.controlled) { u.side = 'cat'; u.controlled = 0; }
  const res = G.units.filter((u) => u.side === 'rat' && u.r).map((u) => ({
    id: u.rosterId, alive: u.alive, downed: u.downed, kills: u.kills, stress: u.stress, broke: u.brokeName || null,
    hurt: Object.keys(u.wounds).filter((p) => u.wounds[p] === 1), severed: Object.keys(u.wounds).filter((p) => u.wounds[p] > 1),
    how: u.deathHow || null,
  }));
  const out = Camp.settle(G.camp, G.mission, result === 'win', res);
  G.report = out.report;
  View.showEnd(result, out);
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
    if (u.side === 'cat') for (const r of rats()) if (r.hidden && World.dist(r, u) < 1.6) { r.hidden = false; View.popup(r, '들킴!', '#ff6b5b'); }
    const wake = updateVision();
    // 경계 사격 (제압당한 채 움직여도)
    for (const e of enemiesOf(u)) {
      if (!u.alive) break;
      const react = !opts.quiet && (e.overwatch || e.suppressing === u) && e.ammo > 0 && World.canSee(w, e, u) && World.dist(e, u) <= WEAPONS[e.def.weapon].clip * 0 + 12;
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

// 팔 부상이면 탄창을 떨어뜨려 실패할 때가 있음 (행동력은 이미 씀)
function reload(u) {
  const show = u.side === 'rat' || u.visible;
  if ((u.wounds.arm && !Camp.has(u.r, 'careful') && Math.random() < RULES.armReloadFail) || (Camp.has(u.r, 'clumsy') && Math.random() < 0.1)) {
    if (show) { View.popup(u, '재장전 실패', '#ff6b5b'); say(`${u.name} 재장전 실패 (팔 부상)`, u.side === 'rat' ? 'bad' : 'good'); }
    return false;
  }
  u.ammo = WEAPONS[u.def.weapon].clip;
  if (show) View.popup(u, '재장전', '#d8d0b8');
  return true;
}

function spendAP(u, ab) {
  if (ABILITIES[ab].end) u.ap = 0; else u.ap -= ABILITIES[ab].ap;
}

async function shoot(a, b, opts = {}) {
  const info = hitInfo(a, b, opts);
  const wp = WEAPONS[opts.heavy ? 'hmg' : a.def.weapon];
  faceToward(a, b.x, b.z);
  if (b.side === 'cat' && !b.active) G.alerted.add(b.pod); // 빗나가도 총소리에 깸
  if (!opts.overwatch) View.focusPair(a, b);
  a.face = 'attack'; a.faceT = 1.2;
  await View.aim(a, 380);
  if (!opts.heavy) a.ammo = Math.max(0, a.ammo - 1);
  const roll = Math.random() * 100;
  const hit = roll < info.hit;
  const crit = hit && Math.random() * 100 < info.crit;
  const shots = a.def.weapon === 'lmg' || a.def.weapon === 'smg' || opts.heavy ? 3 : 1;
  let dmg = rnd(wp.dmg[0], wp.dmg[1]) + (crit ? RULES.critDmg : 0) + (opts.aimed ? 1 : 0) + (a.dmgB || 0);
  const lethal = hit && (crit || dmg >= b.hp + (b.ward || 0));
  if (a.hidden) { a.hidden = false; View.popup(a, '매복!', '#8fd0ff'); }
  a.fired = true;
  if (lethal) await View.cinematic(a, b, crit);
  for (let i = 0; i < shots; i++) {
    View.muzzle(a, b, hit, { crit, last: i === shots - 1, weapon: opts.heavy ? 'hmg' : a.def.weapon });
    Sound.shot(opts.heavy ? 'lmg' : a.def.weapon);
    a.st.recoil = 1;
    await sleep(shots > 1 ? 90 : 160);
  }
  if (lethal) await View.bulletTime(b, crit);
  if (hit) {
    await damage(b, dmg, { crit, from: a, kind: a.def.weapon, part: rollHitPart(crit) });
  } else {
    View.popup(b, '빗나감', '#d8d0b8');
    say(`${a.name} → ${b.name} 빗나감 (${info.hit}%)`);
    if (b.side === 'rat') addStress(b, 3, 'shot');
  }
  if (lethal) View.endCinematic();
  await sleep(350);
  return hit;
}

// ── 맞은 부위: 머리 = 즉사, 몸통 = 체력, 팔 · 다리 = 부상 (체력 0 이나 잘림이면 사망 대신 쓰러짐) ──
const PART_NAME = { head: '머리', torso: '몸통', arm: '팔', leg: '다리' };
function rollHitPart(crit) {
  const w = crit ? RULES.hitPartsCrit : RULES.hitParts;
  let r = Math.random() * Object.values(w).reduce((s, v) => s + v, 0);
  for (const [p, v] of Object.entries(w)) { if ((r -= v) < 0) return p; }
  return 'torso';
}

async function damage(u, dmg, o = {}) {
  if (u.downed) return kill(u, o); // 쓰러진 채 또 맞으면 끝
  if (!u.alive) return;
  if (u.ward > 0) {
    const absorbed = Math.min(u.ward, dmg);
    u.ward -= absorbed; dmg -= absorbed;
    View.popup(u, `방어막 −${absorbed}`, '#c9a3ff');
    if (dmg <= 0) return;
  }
  u.hp -= dmg;
  addStress(u, o.crit ? STRESS.crit : STRESS.hit, 'hit');
  if (u.side === 'cat' && !u.active && !o.quiet) G.alerted.add(u.pod);
  u.face = 'hit'; u.faceT = 1.0;
  u.st.hit = 1;
  View.blood(u, o.crit || o.part === 'head' ? 14 : 8);
  const where = o.part && o.part !== 'torso' ? PART_NAME[o.part] + ' ' : '';
  View.popup(u, where + (o.crit ? '치명타! ' : '') + '−' + dmg, o.crit || o.part === 'head' ? '#ffcf4a' : '#ff6b5b');
  Sound.hit();
  if (o.from) say(`${o.from.name} → ${u.name} ${where}${dmg} 피해${o.crit ? ' (치명타)' : ''}`, u.side === 'rat' ? 'bad' : 'good');
  if (o.part === 'head') return kill(u, { ...o, headshot: true });
  if (o.part === 'arm' || o.part === 'leg') {
    const severed = o.crit && Math.random() < RULES.severOnCrit;
    u.wounds[o.part] = Math.max(u.wounds[o.part] || 0, severed ? 2 : 1); // 1 부상 · 2 잘림
    if (o.part === 'leg') u.mob = Math.max(2, Math.floor(u.def.mob * RULES.legWoundMob));
    if (severed || u.hp <= 0) return downUnit(u, { ...o, severed });
    say(`${u.name} ${PART_NAME[o.part]} 부상`, u.side === 'rat' ? 'bad' : 'good');
    return;
  }
  if (u.hp <= 0) await kill(u, o);
}

// 쓰러짐: 행동 불가 · 누움. 적이 확인사살하면 사망, 이긴 채 끝나면 부상자로 살아남음
async function downUnit(u, o = {}) {
  u.alive = false; u.downed = true; u.hp = 0;
  u.overwatch = false; u.hunker = false;
  if (u.suppressing) { u.suppressing.suppressedBy = null; u.suppressing = null; }
  if (o.from) o.from.kills++;
  if (u.side === 'cat') G.stats.kills++; else G.stats.lost++;
  if (u.side === 'rat') { addStress(u, STRESS.downed, 'downed'); witness(u, 12, 'downed'); }
  else if (o.from) addStress(o.from, STRESS.kill);
  say(`${u.name} 쓰러짐!${o.severed ? ` (${PART_NAME[o.part]} 잘림)` : ''}`, u.side === 'rat' ? 'bad' : 'good');
  if (o.from) faceToward(u, o.from.x, o.from.z);
  u.forceSide = true; u.cut = null; u.face = 'hit';
  Sound.death();
  await View.die(u, o.severed ? o.part : null);
  updateVision();
  checkOver();
}

async function kill(u, o = {}) {
  const wasDown = u.downed;
  u.alive = false; u.downed = false; u.hp = 0;
  u.overwatch = false;
  if (u.suppressing) { u.suppressing.suppressedBy = null; u.suppressing = null; }
  u.face = 'dead';
  if (wasDown) {
    // 이미 누워 있음: 넘어지는 동작 없이 피만
    View.blood(u, 10);
    say(u.side === 'rat' ? `${u.name} 전사…` : `${u.name} 사살`, u.side === 'rat' ? 'bad' : 'good');
    if (u.side === 'rat') { u.deathHow = '쓰러진 채 확인사살'; witness(u, STRESS.allyDead + 8, 'dead'); }
    Sound.death();
    u.corpse = true;
    checkOver();
    return;
  }
  if (o.from) o.from.kills++;
  if (u.side === 'cat') G.stats.kills++; else G.stats.lost++;
  if (u.side === 'rat') witness(u, STRESS.allyDead, 'dead');
  else if (o.from) addStress(o.from, STRESS.kill - (o.from.r ? Camp.traitSum(o.from.r, 'killRelief') : 0));
  u.deathHow = o.headshot ? '머리에 총탄' : o.kind === 'explosion' ? '폭발' : o.kind === 'fire' ? '불길' : o.from && o.from.side === 'rat' ? '아군의 총에' : '총탄';
  say(u.side === 'rat' ? `${u.name} 전사…` : `${u.name} 사살`, u.side === 'rat' ? 'bad' : 'good');
  // 쓰러지는 방향: 쏜 쪽 반대. 옆모습으로 돌려서 리그로 쓰러뜨림
  if (o.from) faceToward(u, o.from.x, o.from.z);
  u.forceSide = true;
  u.cut = null;
  // 신체 절단: 머리 명중 · 폭발 · 치명타 · 산탄총 근접
  let gore = null;
  if (o.headshot) gore = o.crit || Math.random() < 0.4 ? 'decap' : null;
  else if (o.kind === 'explosion') gore = Math.random() < 0.6 ? 'burst' : 'sever';
  else if (o.crit && Math.random() < 0.65) gore = Math.random() < 0.5 ? 'decap' : 'sever';
  else if (o.kind === 'shotgun' && Math.random() < 0.4) gore = 'sever';
  u.gore = gore;
  if (gore && u.side === 'rat') witness(u, STRESS.gore, 'gore');
  Sound.death();
  await View.die(u, gore);
  u.corpse = true;
  updateVision();
  checkOver();
}

// 확인사살: 쓰러진 적에게 다가가 쏨 (반드시 맞음)
async function execute(a, b) {
  faceToward(a, b.x, b.z);
  View.focusPair(a, b);
  a.face = 'attack'; a.faceT = 1.2;
  await View.aim(a, 450);
  View.muzzle(a, b, true);
  Sound.shot(a.def.weapon);
  a.st.recoil = 1;
  a.ammo = Math.max(0, a.ammo - 1);
  say(`${a.name}: ${b.name} 확인사살`, b.side === 'rat' ? 'bad' : 'good');
  await sleep(200);
  await kill(b, { from: a, kind: a.def.weapon });
  await sleep(350);
}

async function throwGrenade(a, tx, tz, opts = {}) {
  faceToward(a, tx, tz);
  a.ap = 0;
  if (!opts.mortar) a.grenades--;
  a.face = 'attack'; a.faceT = 1.6;
  View.focusPair(a, { x: tx, z: tz });
  if (opts.mortar) {
    a.mortarT = true;
    await sleep(500);
    Sound.mortar();
    a.st.recoil = 1;
    await View.shell(a, tx, tz, 1100);
  } else {
    await sleep(120);
    await View.lob(a, tx, tz, 700);
  }
  a.mortarT = false;
  await explode(tx, tz, opts.mortar ? ABILITIES.mortar : ABILITIES.grenade, a);
}

async function explode(tx, tz, ab, from, opts = {}) {
  const w = G.world;
  const radius = ab.radius + (from && from.blast ? from.blast : 0);
  View.explosion(tx, tz, radius);
  Sound.boom();
  // 낮은 엄폐물 부서짐 (폭약은 높은 엄폐 · 트럭까지)
  for (const t of w.tiles) {
    const near = Math.hypot(t.x - tx, t.z - tz) <= radius;
    if (near && t.prop && (PROPS[t.prop].breakable || (opts.high && !PROPS[t.prop].emplacement))) {
      if (t.prop === 'R') for (const dx of [-1, 1]) { const o = World.tile(w, t.x + dx, t.z); if (o && o.prop === 'R') { o.prop = null; o.ground = 'crater'; } }
      View.debris(t.x, t.z, t.prop);
      t.prop = null; t.ground = 'crater';
      View.groundDirty = true;
    } else if (Math.hypot(t.x - tx, t.z - tz) <= 0.6 && !t.prop) { t.ground = 'crater'; View.groundDirty = true; }
  }
  const hits = G.units.filter((u) => (u.alive || u.downed) && Math.hypot(u.x - tx, u.z - tz) <= radius);
  await sleep(200);
  await Promise.all(hits.map((u) => damage(u, rnd(ab.dmg[0], ab.dmg[1]) + (from && from.boom ? from.boom : 0), { from, kind: 'explosion' })));
  updateVision();
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
    else if (ab === 'reload') { spendAP(u, ab); reload(u); Sound.reload(); await sleep(350); }
    else if (ab === 'firstaid') {
      spendAP(u, ab); u.medkits--;
      faceToward(u, target.x, target.z);
      if (target.downed) {
        // 구출: 쓰러진 아군을 일으킴
        target.downed = false; target.alive = true; target.hp = 2; target.st.death = null; target.forceSide = false; target.face = null; target.ap = 0;
        View.popup(target, '일어남!', '#7fdc8a');
        say(`${u.name} → ${target.name} 구출!`, 'good');
        addStress(target, -15);
      } else {
        const heal = ABILITIES.firstaid.heal + (u.healB || 0);
        target.hp = Math.min(target.maxHp, target.hp + heal);
        View.popup(target, '+' + heal, '#7fdc8a');
        say(`${u.name} → ${target.name} 응급 처치`, 'good');
      }
      await sleep(350);
    }
    else if (ab === 'knife') {
      spendAP(u, ab);
      const tile = World.tile(G.world, target.x, target.z);
      // 칼: 바로 옆으로 붙어 찌름 (소리 안 남 → 무리를 안 깨움)
      faceToward(u, target.x, target.z);
      View.focusPair(u, target);
      u.face = 'attack'; u.faceT = 1.2;
      u.st.recoil = 1;
      const info = hitInfo(u, target, { knife: true });
      const hit = Math.random() * 100 < info.hit;
      const crit = hit && Math.random() * 100 < info.crit + 20;
      if (hit && (crit || 5 >= target.hp)) await View.cinematic(u, target, true);
      View.slash(u, target);
      await sleep(220);
      if (hit) await damage(target, rnd(4, 6) + (crit ? 2 : 0), { crit, from: u, kind: 'knife', part: crit ? 'head' : 'torso', quiet: true });
      else View.popup(target, '빗나감', '#d8d0b8');
      View.endCinematic();
      if (tile && target.side === 'cat' && !target.active) G.alerted.delete(target.pod);
      await sleep(300);
    }
    else if (ab === 'scurry') {
      spendAP(u, ab);
      const R = World.reach(G.world, u, 3);
      View.popup(u, '쪼르르', '#8fd0ff');
      await moveUnit(u, R.path(target.x, target.z), { quiet: true, scamper: true });
    }
    else if (ab === 'ambush') { spendAP(u, ab); u.hidden = true; u.hunker = false; View.popup(u, '쥐구멍 매복', '#8fd0ff'); say(`${u.name} 매복 — 쏘기 전까지 안 보임`); }
    else if (ab === 'warcry') {
      u.used.warcry = true;
      u.face = 'attack'; u.faceT = 1.5;
      View.shout(u, '찍찍!!');
      for (const f of friendsOf(u)) if (World.dist(f, u) <= 4) { f.buffAim = 10; addStress(f, STRESS.warcry); View.popup(f, '명중 +10', '#ffcf4a'); }
      say(`${u.name} 찍찍 함성! 분대 사기가 오른다`, 'good');
      await sleep(500);
    }
    else if (ab === 'charge') {
      spendAP(u, ab); u.charges--;
      faceToward(u, target.x, target.z);
      View.popup(u, '폭약 설치!', '#ffb84a');
      await sleep(600);
      // 설치하고 한 칸 물러남이 아니라 짧은 도화선: 붙은 칸에 폭발 (자기는 엄폐물 덕에 덜 다침)
      await explode(target.x, target.z, { radius: 0.8, dmg: [3, 4] }, u, { high: true });
    }
    else if (ab === 'gnaw') {
      spendAP(u, ab);
      faceToward(u, target.x, target.z);
      u.face = 'attack'; u.faceT = 1.2;
      View.popup(u, '갉작갉작…', '#d8d0b8');
      for (let i = 0; i < 4; i++) { u.st.recoil = 0.5; await sleep(150); }
      target.prop = null; View.groundDirty = true; View.debris(target.x, target.z, 'X');
      say(`${u.name} 철조망을 갉아 끊음`, 'good');
    }
    else if (ab === 'tunnel') {
      spendAP(u, ab); u.used.tunnel = true;
      View.popup(u, '땅굴 파는 중…', '#d8d0b8');
      View.dig(u.x, u.z); await sleep(700);
      G.tunnels.push([{ x: u.x, z: u.z }, { x: target.x, z: target.z }]);
      View.dig(target.x, target.z); View.groundDirty = true;
      say(`${u.name} 땅굴 완성 — 입구에서 출구까지 한 걸음`, 'good');
      await sleep(400);
    }
    else if (ab === 'flame') {
      spendAP(u, ab); u.flame--;
      faceToward(u, target.x, target.z);
      View.focusPair(u, target);
      u.face = 'attack'; u.faceT = 1.5;
      await View.flame(u, target.x, target.z);
      const r = ABILITIES.flame.radius;
      for (const t of G.world.tiles) {
        if (Math.hypot(t.x - target.x, t.z - target.z) > r) continue;
        G.fires.push({ x: t.x, z: t.z, turns: 2 });
        if (t.prop && PROPS[t.prop].breakable) { View.debris(t.x, t.z, t.prop); t.prop = null; t.ground = 'crater'; View.groundDirty = true; }
      }
      const hits = G.units.filter((o) => (o.alive || o.downed) && Math.hypot(o.x - target.x, o.z - target.z) <= r);
      for (const o of hits) { o.burn = 2; o.burnB = u.burnB || 0; }
      await Promise.all(hits.map((o) => damage(o, rnd(3, 4), { from: u, kind: 'fire', part: 'torso' })));
      updateVision();
      await sleep(300);
    }
    else if (ab === 'cheese') {
      spendAP(u, ab); u.cheese--;
      addStress(target, STRESS.cheese * (Camp.has(target.r, 'glutton') ? 2 : 1));
      target.suppressedBy = null; target.panic = 0;
      View.popup(target, '치즈! 스트레스 −25', '#ffcf4a');
      say(`${u.name} → ${target.name} 치즈 배급`, 'good');
      await sleep(350);
    }
    else if (ab === 'mark') {
      spendAP(u, ab);
      target.marked = true;
      View.popup(target, '표적 지정', '#ffcf4a');
      say(`${u.name}: ${target.name} 표적 지정 (아군 명중 +15)`);
      await sleep(300);
    }
    else if (ab === 'command') {
      spendAP(u, ab);
      target.ap += 1;
      View.rats(u, target);
      View.popup(target, '행동력 +1', '#8fd0ff');
      say(`${u.name} → ${target.name}: 쥐떼 전령이 명령을 전함`, 'good');
      await sleep(400);
    }
    else if (ab === 'radioscan') {
      spendAP(u, ab); u.used.radioscan = true; G.scan = 1;
      View.popup(u, '무전 탐지', '#8fd0ff');
      say(`${u.name}: 무전으로 고양이 위치를 잡았다`, 'good');
    }
    else if (ab === 'dominate') {
      spendAP(u, ab); u.psi -= ABILITIES.dominate.psi;
      faceToward(u, target.x, target.z);
      await View.psi(u, target, '#b07cff');
      if (target.target || Math.random() < 0.15) { View.popup(target, '저항!', '#ff9f8f'); say(`${target.name}이(가) 정신 지배를 버텼다`, 'warn'); }
      else {
        target.side = 'rat'; target.controlled = 2; target.active = true; target.ap = 0; target.overwatch = false;
        target.tint = 'hue-rotate(200deg) saturate(1.4)';
        View.popup(target, '지배됨', '#c9a3ff');
        say(`${u.name}: ${target.name}의 정신을 붙잡았다 (2턴)`, 'good');
      }
      await sleep(400);
    }
    else if (ab === 'ward') {
      spendAP(u, ab); u.psi -= ABILITIES.ward.psi;
      await View.psi(u, target, '#8fd0ff');
      target.ward = 4;
      View.popup(target, '방어막', '#c9a3ff');
      say(`${u.name} → ${target.name} 마법 방어막`, 'good');
      await sleep(300);
    }
    // 자는 무리를 쐈으면 깸
    const wake = updateVision();
    if (wake.size && !G.over) { await wakePods(wake); updateVision(); }
  } finally {
    if (G.mode === 'busy') G.mode = 'move';
  }
  idleFacing(u);
  await afterRatAction(u);
}

async function doMove(u, targetX, targetZ) {
  if (G.mode === 'busy') return;
  const w = G.world;
  const R = World.reach(w, u, u.mob * u.ap);
  let x = targetX, z = targetZ;
  let c = R.cost(x, z);

  // 클릭한 칸이 이동 불가 칸(엄폐물, 장애물, 타 유닛 등)인 경우:
  // 인접 칸(4방향) 중 이동 가능하고 비용이 가장 적은 최적의 칸 자동 탐색
  if (c == null || c === 0) {
    const clickedTile = World.tile(w, targetX, targetZ);
    if (clickedTile) {
      let bestAdj = null, minCost = 999;
      for (const [dx, dz] of World.DIRS4) {
        const nx = targetX + dx, nz = targetZ + dz;
        const ac = R.cost(nx, nz);
        if (ac != null && ac > 0 && ac < minCost) {
          minCost = ac;
          bestAdj = { x: nx, z: nz };
        }
      }
      if (bestAdj) {
        x = bestAdj.x;
        z = bestAdj.z;
        c = minCost;
      }
    }
  }

  if (c == null || c === 0) {
    View.popup(u, '이동 불가', '#ff6b5b');
    return;
  }

  G.mode = 'busy';
  u.ap -= c <= u.mob ? 1 : 2;
  await moveUnit(u, R.path(x, z));
  G.mode = 'move';
  for (const r of rats()) idleFacing(r);
  await afterRatAction(u);
}


// 이 유닛이 지금 쓸 수 있는 능력
const adjacent = (u, pred) => World.DIRS8.map(([dx, dz]) => World.tile(G.world, u.x + dx, u.z + dz)).filter((t) => t && pred(t));
function abilitiesOf(u) {
  const list = [];
  const emp = World.propOf(World.tile(G.world, u.x, u.z));
  for (const ab of u.def.abil) {
    const A = ABILITIES[ab];
    let ok = u.ap >= A.ap, why = '', count = null;
    if (['shoot', 'aimed', 'suppress', 'overwatch'].includes(ab) && u.ammo <= 0) { ok = false; why = '탄 없음'; }
    if (ab === 'aimed' && u.moved) { ok = false; why = '이동함'; }
    if (ab === 'suppress' && u.ammo < 2) { ok = false; why = '탄 2발 필요'; }
    if (ab === 'grenade') { count = u.grenades; if (u.grenades <= 0) { ok = false; why = '없음'; } }
    if (ab === 'firstaid') { count = u.medkits; if (u.medkits <= 0) { ok = false; why = '없음'; } }
    if (ab === 'charge') { count = u.charges; if (u.charges <= 0) { ok = false; why = '없음'; } else if (!adjacent(u, (t) => t.prop && !PROPS[t.prop].emplacement).length) { ok = false; why = '붙은 엄폐물 없음'; } }
    if (ab === 'gnaw' && !adjacent(u, (t) => t.prop === 'X').length) { ok = false; why = '붙은 철조망 없음'; }
    if (ab === 'flame') { count = u.flame; if (u.flame <= 0) { ok = false; why = '연료 없음'; } }
    if (ab === 'cheese') { count = u.cheese; if (u.cheese <= 0) { ok = false; why = '없음'; } else if (!friendsOf(u).some((f) => f !== u && World.dist(f, u) < 1.6)) { ok = false; why = '붙은 아군 없음'; } }
    if (A.psi) { count = u.psi; if (u.psi < A.psi) { ok = false; why = '정신력 부족'; } }
    if (A.once && u.used[ab]) { ok = false; why = '이번 판엔 씀'; }
    if (ab === 'ambush' && !World.coverSides(G.world, u.x, u.z).length) { ok = false; why = '엄폐물 옆에서만'; }
    if (ab === 'knife' && !visibleEnemies(u).some((e) => World.dist(e, u) < 1.6)) { ok = false; why = '붙은 적 없음'; }
    else if (A.target === 'enemy' && !visibleEnemies(u).length) { ok = false; why = why || '대상 없음'; }
    if (ab === 'firstaid' && !friendsOf(u).concat(G.units.filter((o) => o.downed && o.side === u.side)).some((f) => f !== u && World.dist(f, u) < 1.6 && (f.hp < f.maxHp || (f.downed && u.perks.includes('revive'))))) { ok = false; why = why || '붙은 부상자 없음'; }
    if (ab === 'command' && !friendsOf(u).some((f) => f !== u && !f.controlled && World.canSee(G.world, u, f))) { ok = false; why = why || '보이는 아군 없음'; }
    list.push({ ab, ok, why, count });
  }
  list.push({ ab: 'reload', ok: u.ap >= 1 && u.ammo < u.clip, why: '' });
  if (emp && emp.emplacement === 'mortar') list.push({ ab: 'mortar', ok: u.ap >= 2 && G.shells > 0, why: G.shells > 0 ? (u.ap < 2 ? '행동력 2 필요' : '') : '포탄 없음', count: G.shells });
  if (emp && emp.emplacement === 'hmg') list.push({ ab: 'heavy', ok: u.ap >= 1 && visibleEnemies(u).length > 0, why: '' });
  return list;
}
// 능력 대상 고르기 (ui.js): 적 목록 · 아군 목록 · 칸 가능 여부
function abilityTargets(u, ab) {
  const A = ABILITIES[ab];
  if (A.target === 'enemy') return visibleEnemies(u).filter((e) => !A.melee || World.dist(e, u) < 1.6);
  if (A.target === 'ally') {
    const pool = friendsOf(u).concat(ab === 'firstaid' ? G.units.filter((o) => o.downed && o.side === u.side) : []);
    return pool.filter((f) => f !== u && !f.controlled && (A.far ? World.canSee(G.world, u, f) : World.dist(f, u) < 1.6));
  }
  return [];
}
function tileTargetOk(u, ab, t) {
  if (!t) return false;
  const A = ABILITIES[ab];
  if (World.dist(u, t) > A.range) return false;
  if (ab === 'mortar') return G.vis.has(t.z * G.world.W + t.x);
  if (ab === 'charge') return !!t.prop && !PROPS[t.prop].emplacement;
  if (ab === 'gnaw') return t.prop === 'X';
  if (ab === 'scurry') { const R = World.reach(G.world, u, 3); const c = R.cost(t.x, t.z); return c != null && c > 0; }
  if (ab === 'tunnel') return World.walkable(G.world, t.x, t.z) && !World.unitAt(G.world, t.x, t.z) && World.dist(u, t) >= 2;
  return true;
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
  const want = c.def.flame ? 2.8 : c.def.weapon === 'sniper' ? 10 : c.def.weapon === 'smg' ? 4.5 : 7;
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

// 확인사살할 쓰러진 쥐 (보이고 가까운 것)
function downedInReach(c) {
  const list = G.units.filter((r) => r.side === 'rat' && r.downed && World.dist(c, r) <= RULES.executeRange && World.canSee(G.world, c, r));
  return list.sort((a, b) => World.dist(c, a) - World.dist(c, b))[0] || null;
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
    const flankedHere = shots.some((s) => World.coverAgainst(w, c, s.r).flanked);
    if (shots.length && shots[0].h.hit >= 55 && !flankedHere) { await catAttack(c, shots); continue; }
    // 2.5) 좋은 사격이 없으면 쓰러진 쥐 확인사살
    const finishOff = downedInReach(c);
    if (finishOff && c.ammo > 0) { await execute(c, finishOff); continue; }
    // 2.7) 화염병: 불 닿는 거리에 쥐가 있으면 태움
    if (c.flame > 0) {
      const f = clusterTarget(c, ABILITIES.flame.range, 1);
      if (f) { say(`${c.name} 화염 방사!`, 'warn'); await catFlame(c, f.x, f.z); continue; }
    }
    // 3) 수류탄: 두 마리 이상 모였거나 엄폐 뒤 쥐
    if (c.grenades > 0) {
      const g = clusterTarget(c, 9, 2);
      if (g) { say(`${c.name} 수류탄!`, 'warn'); await throwGrenade(c, g.x, g.z); continue; }
    }
    // 4) 더 나은 자리로 이동 후 사격
    const spot = bestTile(c, c.mob, false);
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
    if (c.flame > 0 && c.alive) { const f = clusterTarget(c, ABILITIES.flame.range, 1); if (f) { say(`${c.name} 화염 방사!`, 'warn'); await catFlame(c, f.x, f.z); continue; } }
    const finishAfter = downedInReach(c);
    if (after.length && after[0].h.hit >= 25) await catAttack(c, after);
    else if (finishAfter && c.ammo > 0) await execute(c, finishAfter);
    else { c.overwatch = true; if (c.visible) View.popup(c, '경계', '#ff9f8f'); }
    await sleep(120);
  }
  updateVision();
}

async function catFlame(c, x, z) {
  const prev = G.mode;
  G.mode = 'busy';
  c.ap = 1;
  // 쥐 능력과 같은 처리 (doAbility 안 씀: afterRatAction 을 부르면 안 됨)
  c.flame--;
  faceToward(c, x, z);
  c.face = 'attack'; c.faceT = 1.5;
  View.focusPair(c, { x, z });
  await View.flame(c, x, z);
  for (const t of G.world.tiles) {
    if (Math.hypot(t.x - x, t.z - z) > ABILITIES.flame.radius) continue;
    G.fires.push({ x: t.x, z: t.z, turns: 2 });
    if (t.prop && PROPS[t.prop].breakable) { View.debris(t.x, t.z, t.prop); t.prop = null; t.ground = 'crater'; View.groundDirty = true; }
  }
  const hits = G.units.filter((o) => (o.alive || o.downed) && Math.hypot(o.x - x, o.z - z) <= ABILITIES.flame.radius);
  for (const o of hits) o.burn = 2;
  await Promise.all(hits.map((o) => damage(o, rnd(3, 4), { from: c, kind: 'fire', part: 'torso' })));
  for (const r of rats()) if (World.dist(r, { x, z }) <= 3) addStress(r, 8, 'fire');
  void 0;
  updateVision();
  G.mode = prev;
  await sleep(300);
}

async function catAttack(c, shots) {
  if (c.ammo <= 0) { reload(c); Sound.reload(); await sleep(300); return; }
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
