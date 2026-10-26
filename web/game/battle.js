// 전투 (전투 시스템 기획서 v0.1): 5줄 × 14칸 · 진영 교대 턴 · 이동(쪼개 씀) + 행동 + 보조 행동
// 방향 판정: 전면 −15 / 측면(위 · 아래) +10 · 치명 +10 / 등 뒤 +25 · 치명 +25
(function () {
  const D = window.DATA, MO = window.MOTIONS;
  const ROWS = 5, COLS = 14;
  const ROW_Y = [470, 560, 650, 742, 835];
  const ROW_S = [0.78, 0.84, 0.9, 0.95, 1.0];
  const CELL_W = 104;
  const H_BASE = 150; // 앞줄 쥐 화면 키 (px)
  const sleep = (s) => new Promise((ok) => setTimeout(ok, s * 1000));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const cellX = (c, r) => 800 + (c - (COLS - 1) / 2) * CELL_W * ROW_S[r];
  const rowS = (rr) => { const i = Math.floor(rr), k = rr - i; return i >= ROWS - 1 ? ROW_S[ROWS - 1] : ROW_S[i] + (ROW_S[i + 1] - ROW_S[i]) * k; };
  const rowY = (rr) => { const i = Math.floor(rr), k = rr - i; return i >= ROWS - 1 ? ROW_Y[ROWS - 1] : ROW_Y[i] + (ROW_Y[i + 1] - ROW_Y[i]) * k; };
  const manhattan = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);

  class Battle {
    constructor(game, stage, squad) {
      this.g = game; this.stage = stage;
      this.units = []; this.fx = []; this.pops = []; this.trails = [];
      this.cells = {}; // 'r,c' → { ice, fire }
      this.cam = { x: 800, y: 600, z: 1, tx: 800, ty: 600, tz: 1, shake: 0 };
      this.turn = 1; this.phase = 'ally'; this.busy = false; this.sel = null; this.mode = null; this.hover = null;
      this.result = null; this.banner = null; this.logs = [];
      this.kills = {}; this.resUsed = false;
      // 아군 배치: 왼쪽 3열
      const spots = [[2, 2], [1, 1], [3, 1], [0, 2], [4, 2], [2, 0]];
      squad.forEach((m, i) => this.addUnit('ally', m.cls, spots[i][0], spots[i][1], m));
      for (const [kind, r, c] of stage.enemies) this.addUnit('foe', kind, r, c, null);
      this.startAllyPhase(true);
    }

    // ───────── 유닛
    addUnit(side, kind, r, c, member) {
      const def = side === 'ally' ? D.CLASSES[kind] : D.ENEMIES[kind];
      const rig = this.g.rigs[def.art];
      const lv = member ? member.rank : 1;
      const grow = def.grow || {};
      const st = Object.assign({}, def.base);
      if (member) {
        for (const k of Object.keys(grow)) st[k] += grow[k] * (lv - 1);
        st.atk += member.gear || 0; st.def += (member.gear || 0) * 4;
      }
      const picks = member ? member.picks : [];
      const passives = new Set(picks.filter((s) => D.SKILLS[s].kind === 'passive'));
      if (passives.has('hunter')) st.move += 1;
      const skills = side === 'ally'
        ? [def.attack, def.signature, ...picks.filter((s) => D.SKILLS[s].kind !== 'passive')]
        : def.skills.slice();
      const u = {
        id: member ? member.id : kind + '_' + r + '_' + c, side, kind, def, member, rig, name: member ? member.name : def.name,
        r, c, face: side === 'ally' ? 1 : -1, base: st, hp: member ? Math.max(1, Math.round(st.hp * (member.hpPct ?? 1))) : st.hp, max: st.hp,
        skills, passives, cds: {}, buffs: [], morale: member ? member.morale : 60, status: 'ok', down: 0, stun: 0,
        move: 0, act: 0, bonus: 0, moved: 0, done: false, stance: null,
        player: new Player(), size: def.size || 1, flash: 0, dx: 0, alpha: 1, walk: null, weapon: def.weapon,
      };
      this.units.push(u);
      return u;
    }
    at(r, c) { return this.units.find((u) => u.r === r && u.c === c && u.status !== 'dead' && u.status !== 'gone'); }
    inside(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
    standing(u) { return u.status === 'ok'; }
    foesOf(u) { return this.units.filter((v) => v.side !== u.side && this.standing(v)); }
    alliesOf(u) { return this.units.filter((v) => v.side === u.side && v.status !== 'dead' && v.status !== 'gone'); }
    pos(u) {
      if (u.walk) return u.walk;
      return [cellX(u.c, u.r) + u.dx, ROW_Y[u.r], u.r];
    }
    stat(u, k) {
      let v = u.base[k] || 0;
      for (const b of u.buffs) if (b[k]) v += b[k];
      if (k === 'def' && u.side === 'ally') {  // 진형 유지: 위 · 아래 칸에 창기병
        for (const o of this.alliesOf(u)) if (o !== u && o.passives.has('formation') && o.c === u.c && Math.abs(o.r - u.r) === 1) v += 15;
      }
      if (k === 'atk') { let pct = 0; for (const b of u.buffs) if (b.atkPct) pct += b.atkPct; v *= 1 + pct / 100; }
      return v;
    }
    moraleTier(u) {
      if (u.side !== 'ally') return 0;
      return u.morale >= 80 ? 1 : u.morale < 20 ? -2 : u.morale < 40 ? -1 : 0;
    }
    addMorale(u, v) { if (u.side === 'ally') u.morale = clamp(u.morale + v, 0, 100); }
    cd(u, s) {
      const sk = D.SKILLS[s];
      let n = sk.cd || 0;
      if (u.passives.has('merlinsPupil') && n > 0) n = Math.max(1, n - 1);
      return n;
    }
    log(t) { this.logs.unshift(t); this.logs.length = Math.min(this.logs.length, 7); this.g.ui.log(this.logs); }

    // ───────── 턴
    startAllyPhase(first) {
      this.phase = 'ally';
      for (const u of this.units) {
        if (u.side !== 'ally') continue;
        if (!first) this.tickUnit(u);
      }
      for (const u of this.units.filter((v) => v.side === 'ally')) {
        u.move = u.status === 'ok' ? this.stat(u, 'move') : 0;
        u.act = 1; u.bonus = 1; u.moved = 0; u.done = u.status !== 'ok'; u.stance = null;
        u.guarding = false;
        if (u.status === 'ok' && this.moraleTier(u) === -2 && Math.random() < 0.5) {  // 공포: 웅크림
          u.act = 0; this.pop(u, '공포!', '#c9b3ff'); this.log(`${u.name}: 공포에 질려 웅크림 (행동 불가)`);
        }
      }
      this.banner = { text: first ? this.stage.name : `${this.turn}턴 · 아군 차례`, t: 0, small: !first };
      this.g.ui.battleHud(this);
    }
    tickUnit(u) {
      for (const k of Object.keys(u.cds)) if (u.cds[k] > 0) u.cds[k]--;
      u.buffs = u.buffs.filter((b) => --b.turns > 0);
      if (u.frozen) { u.frozen--; }
      if (u.status === 'down') {
        u.down--;
        if (u.down <= 0) this.kill(u);
        else this.log(`${u.name}: 빈사 — ${u.down}턴 안에 구출해야 함`);
      }
      if (u.status === 'stun') {
        u.stun--;
        if (u.stun <= 0) {
          u.status = 'ok';
          u.hp = Math.ceil(u.max * (u.passives.has('unbreakable') ? 0.5 : 0.3));
          u.player.set('cheer'); setTimeout(() => u.player.name === 'cheer' && u.player.set('idle'), 1200);
          this.pop(u, '기상!', '#ffd65a'); this.log(`${u.name} 다시 일어남!`);
        }
      }
    }
    endUnit(u) { u.done = true; if (this.sel === u) this.select(null); this.checkAllDone(); }
    checkAllDone() {
      if (this.phase !== 'ally' || this.result) return;
      if (this.units.filter((v) => v.side === 'ally' && this.standing(v) && !v.done).length === 0) setTimeout(() => this.enemyPhase(), 450);
    }
    async endTurn() {
      if (this.busy || this.phase !== 'ally') return;
      for (const u of this.units) if (u.side === 'ally' && this.standing(u) && u.act) u.guarding = true; // 행동 안 쓰면 방어
      this.enemyPhase();
    }

    // ───────── 선택 · 대상
    select(u) {
      this.sel = u; this.mode = null;
      this.g.ui.skillbar(this, u);
    }
    usable(u, s) {
      const sk = D.SKILLS[s];
      if (sk.kind === 'passive') return false;
      if ((u.cds[s] || 0) > 0) return false;
      if (sk.cost === 'bonus' ? !u.bonus : !u.act) return false;
      if (sk.needStill && u.moved && !u.passives.has('hunter')) return false;
      return true;
    }
    reach(u) {  // 이동 가능한 칸 (BFS)
      const dist = new Map([[u.r + ',' + u.c, 0]]), prev = new Map(), q = [[u.r, u.c]];
      const lim = u.frozen ? 0 : u.move;
      while (q.length) {
        const [r, c] = q.shift(), d = dist.get(r + ',' + c);
        if (d >= lim) continue;
        if (d > 0 && this.cells[r + ',' + c]?.ice) continue;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc, k = nr + ',' + nc;
          if (!this.inside(nr, nc) || dist.has(k) || this.at(nr, nc)) continue;
          dist.set(k, d + 1); prev.set(k, [r, c]); q.push([nr, nc]);
        }
      }
      return { dist, prev };
    }
    pathTo(u, r, c) {
      const { dist, prev } = this.reach(u);
      if (!dist.has(r + ',' + c)) return null;
      const p = []; let cur = [r, c];
      while (cur[0] !== u.r || cur[1] !== u.c) { p.unshift(cur); cur = prev.get(cur[0] + ',' + cur[1]); }
      return p;
    }
    // 스킬 s 를 u 가 (from 칸에서) 쓸 때 고를 수 있는 칸들 → [{r, c, unit?}]
    targets(u, s, from) {
      const sk = D.SKILLS[s], o = from || u, out = [];
      const foe = (v) => v && v.side !== u.side && this.standing(v);
      const friend = (v) => v && v.side === u.side && v.status !== 'dead' && v.status !== 'gone';
      const shape = sk.shape;
      if (sk.kind === 'attack' || (sk.kind === 'aoe' && shape !== 'line')) {
        if (shape === 'melee4') {
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = this.at(o.r + dr, o.c + dc); if (foe(v)) out.push({ r: v.r, c: v.c, unit: v }); }
        } else if (shape === 'row') {
          const reach = (sk.reach || 1) + (u.passives.has('longSpear') && (s === 'spearPoke' || s === 'chargeLance') ? 1 : 0);
          for (const dir of [1, -1]) for (let i = 1; i <= reach; i++) { const v = this.at(o.r, o.c + dir * i); if (foe(v)) out.push({ r: v.r, c: v.c, unit: v }); }
        } else if (shape === 'range') {
          const max = (sk.max || 1) + (u.passives.has('sniper') && sk.ranged ? 2 : 0);
          if (sk.area) {  // 범위 마법: 빈 칸도 고를 수 있음
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const d = Math.abs(r - o.r) + Math.abs(c - o.c); if (d >= (sk.min || 1) && d <= max) out.push({ r, c, unit: this.at(r, c) }); }
          } else {
            for (const v of this.foesOf(u)) {
              const d = Math.abs(v.r - o.r) + Math.abs(v.c - o.c);
              if (d < (sk.min || 1) - (sk.min > 1 ? 1 : 0) || d > max) continue; // 원거리는 인접도 가능 (명중 −20)
              if (sk.firstInRow) {  // 첫 줄 명중: 같은 줄 가장 가까운 적만
                if (v.r !== o.r) continue;
                const dir = Math.sign(v.c - o.c);
                let blocked = false;
                for (let c = o.c + dir; c !== v.c; c += dir) if (foe(this.at(o.r, c))) blocked = true;
                if (blocked) continue;
              }
              out.push({ r: v.r, c: v.c, unit: v });
            }
          }
        }
      } else if (sk.kind === 'aoe' && shape === 'line') {
        for (const dir of [1, -1]) for (let i = 1; i <= sk.reach; i++) if (this.inside(o.r, o.c + dir * i)) out.push({ r: o.r, c: o.c + dir * i, dir, unit: this.at(o.r, o.c + dir * i) });
      } else if (sk.kind === 'heal' || (sk.kind === 'buff' && sk.shape === 'ally')) {
        for (const v of this.alliesOf(u)) if (manhattan(v, o) <= sk.max && (sk.kind === 'heal' || v.status === 'ok')) out.push({ r: v.r, c: v.c, unit: v });
      } else if (sk.kind === 'buff' || sk.kind === 'stance') {
        out.push({ r: o.r, c: o.c, unit: u });
      } else if (sk.kind === 'dash') {
        for (const dir of [1, -1]) if (this.inside(o.r, o.c + dir)) out.push({ r: o.r, c: o.c + dir, dir });
      } else if (sk.kind === 'teleport' || sk.kind === 'trap') {
        const max = sk.max || 4;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const d = Math.abs(r - o.r) + Math.abs(c - o.c); if (d >= 1 && d <= max && !this.at(r, c)) out.push({ r, c }); }
      } else if (sk.kind === 'rescue') {
        for (const v of this.alliesOf(u)) if (v.status === 'down' && manhattan(v, o) === 1) out.push({ r: v.r, c: v.c, unit: v });
      }
      return out;
    }
    // 범위 기술이 맞히는 칸
    areaCells(u, s, t) {
      const sk = D.SKILLS[s];
      if (sk.shape === 'line') {
        const rows = (s === 'holyblade' && u.passives.has('excalibur')) ? [u.r - 1, u.r, u.r + 1] : [u.r];
        const reach = sk.reach, out = [];
        for (const r of rows) for (let i = 1; i <= reach; i++) if (this.inside(r, u.c + t.dir * i)) out.push([r, u.c + t.dir * i]);
        return out;
      }
      if (sk.area === 'cross') {
        if (u.passives.has('grandMagic')) { const o = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) o.push([t.r + dr, t.c + dc]); return o.filter(([r, c]) => this.inside(r, c)); }
        return [[t.r, t.c], [t.r - 1, t.c], [t.r + 1, t.c], [t.r, t.c - 1], [t.r, t.c + 1]].filter(([r, c]) => this.inside(r, c));
      }
      if (sk.area === 'vert3') return [[t.r, t.c], [t.r - 1, t.c], [t.r + 1, t.c]].filter(([r, c]) => this.inside(r, c));
      return [[t.r, t.c]];
    }

    // ───────── 명중 · 피해 계산
    facing(att, tgt) {
      if (att.r !== tgt.r) return 'side';
      return Math.sign(att.c - tgt.c) === tgt.face ? 'front' : 'back';
    }
    odds(att, tgt, s) {
      const sk = D.SKILLS[s];
      const parts = [];
      let hit = 75 + this.stat(att, 'aim') - this.stat(tgt, 'eva');
      if (this.stat(att, 'aim')) parts.push(['명중', this.stat(att, 'aim')]);
      if (this.stat(tgt, 'eva')) parts.push(['대상 회피', -this.stat(tgt, 'eva')]);
      let crit = this.stat(att, 'crit');
      const f = this.facing(att, tgt);
      if (!sk.noFacing) {
        if (f === 'front') { hit -= 15; parts.push(['전면', -15]); if (tgt.def.frontGuard) { hit -= tgt.def.frontGuard; parts.push(['방패', -tgt.def.frontGuard]); } }
        else if (f === 'side') { hit += 10; crit += 10; parts.push(['측면', 10]); }
        else { hit += 25; crit += 25; parts.push(['등 뒤', 25]); }
      }
      const mt = this.moraleTier(att);
      if (mt === 1) { hit += 10; crit += 10; parts.push(['사기 고양', 10]); }
      if (mt < 0) { hit -= 10; parts.push(['사기 저하', -10]); }
      if (sk.aimMod) { hit += sk.aimMod; parts.push([sk.name, sk.aimMod]); }
      if (sk.critMod) crit += sk.critMod;
      if (sk.ranged && manhattan(att, tgt) === 1) { hit -= 20; parts.push(['너무 가까움', -20]); }
      if (tgt.guarding) { hit -= 10; parts.push(['방어 중', -10]); }
      if (att.passives.has('execute') && tgt.hp <= tgt.max * 0.3) crit = 100;
      return { hit: clamp(Math.round(hit), 5, 100), crit: clamp(Math.round(crit), 0, 100), facing: f, parts };
    }
    damage(att, tgt, s, crit, extraMult = 1) {
      const sk = D.SKILLS[s];
      let base = this.stat(att, 'atk') * (sk.mult || 1) * extraMult * rnd(0.9, 1.1);
      if (sk.perMoved) base *= 1 + sk.perMoved * att.moved;
      if (att.passives.has('sniper') && sk.ranged && !att.moved) base *= 1.2;
      if (sk.firstInRow) base *= 1.4;
      if (sk.vsCat && tgt.def.race === 'cat') base *= sk.vsCat;
      let pen = (att.base.pen || 0) + (sk.pen || 0);
      if (att.passives.has('apBolt') && (s === 'shot' || s === 'aimedShot' || s === 'doubleShot')) pen += 30;
      if (att.passives.has('kingsBlade') && this.facing(att, tgt) !== 'front') pen += 50;
      const def = this.stat(tgt, 'def') * (1 - clamp(pen, 0, 100) / 100);
      let dmg = base * 100 / (100 + def);
      if (crit) dmg *= (this.stat(att, 'critDmg') + (att.passives.has('headshot') ? 75 : 0)) / 100;
      if (tgt.guarding) dmg *= 0.7;
      if (tgt.stance === 'spearWall' && tgt.passives.has('ironWall')) dmg *= 0.6;
      return Math.max(1, Math.round(dmg));
    }

    // ───────── 실행
    async moveUnit(u, path) {
      this.busy = true;
      u.player.set('walk');
      for (const [r, c] of path) {
        if (c !== u.c) u.face = Math.sign(c - u.c);
        const [x0, y0] = this.pos(u);
        const fr = u.r;
        for (let i = 1; i <= 12; i++) {
          await sleep(0.017);
          const k = i / 12;
          u.walk = [x0 + (cellX(c, r) - x0) * k, y0 + (ROW_Y[r] - y0) * k, fr + (r - fr) * k];
        }
        u.walk = null; u.r = r; u.c = c;
        u.move--; u.moved++;
        const cell = this.cells[r + ',' + c];
        if (cell?.fire && u.side === 'foe') { this.hurt(cell.owner, u, Math.round(this.stat(cell.owner, 'atk') * 0.5), false, '불'); }
        if (cell?.ice && u.side === 'foe') { u.frozen = 1; u.move = 0; delete cell.ice; this.pop(u, '얼어붙음', '#9be8ff'); this.log(`${u.name}: 얼음 덫에 걸림`); break; }
        if (u.side === 'foe' && await this.reactions(u)) { if (!this.standing(u)) break; }
        if (!this.standing(u)) break;
      }
      if (u.player.name === 'walk') u.player.set('idle');
      this.busy = false;
    }
    // 적이 움직일 때: 창벽 · 매복 사격
    async reactions(mover) {
      let hit = false;
      for (const a of this.units.filter((v) => v.side === 'ally' && this.standing(v) && v.stance)) {
        if (a.stance === 'spearWall') {
          const rows = a.passives.has('spearForest') ? [a.r - 1, a.r, a.r + 1] : [a.r];
          const d = (mover.c - a.c) * a.face;
          if (rows.includes(mover.r) && d >= 1 && d <= 2) { a.stance = null; this.log(`${a.name}: 창벽!`); await this.attack(a, mover, 'spearPoke', { reaction: true }); hit = true; }
        } else if (a.stance === 'ambush') {
          const max = 6 + (a.passives.has('sniper') ? 2 : 0);
          if (manhattan(a, mover) <= max) { a.stance = null; this.log(`${a.name}: 매복 사격!`); await this.attack(a, mover, 'shot', { reaction: true }); hit = true; }
        }
        if (!this.standing(mover)) break;
      }
      return hit;
    }
    spend(u, s) {
      const sk = D.SKILLS[s];
      if (sk.cost === 'bonus') u.bonus = 0; else { u.act = 0; u.guarding = false; }
      const n = this.cd(u, s); if (n) u.cds[s] = n + 1; // 다음 차례 시작에 −1 되므로 +1
    }
    async useSkill(u, s, t) {
      const sk = D.SKILLS[s];
      this.busy = true; this.mode = null;
      if (t && t.c !== u.c) u.face = Math.sign(t.c - u.c);
      this.spend(u, s);
      this.g.ui.skillbar(this, u);
      if (sk.kind === 'attack') {
        if (sk.chain) await this.chain(u, t.unit, s);
        else for (let i = 0; i < (sk.shots || 1); i++) if (this.standing(t.unit)) await this.attack(u, t.unit, s, { second: i > 0 });
      } else if (sk.kind === 'aoe') await this.aoe(u, s, t);
      else if (sk.kind === 'heal') await this.heal(u, s, t.unit);
      else if (sk.kind === 'buff') await this.buff(u, s, t.unit);
      else if (sk.kind === 'stance') { u.stance = sk.stance; await this.play(u, 'guard', 0.5); this.pop(u, sk.name, '#9fd0ff'); this.log(`${u.name}: ${sk.name}`); u.player.set('guard'); }
      else if (sk.kind === 'dash') await this.dash(u, s, t.dir);
      else if (sk.kind === 'teleport') { this.fxAt('poof', ...this.pos(u), 0.8); u.r = t.r; u.c = t.c; this.fxAt('poof', ...this.pos(u), 0.8); await sleep(0.3); }
      else if (sk.kind === 'trap') { this.cells[t.r + ',' + t.c] = { ...(this.cells[t.r + ',' + t.c] || {}), ice: true }; await this.play(u, 'attack', 0.6); this.fxAt('zap', cellX(t.c, t.r), ROW_Y[t.r] - 20, 0.8); this.log(`${u.name}: 얼음 덫 설치`); }
      else if (sk.kind === 'rescue') { await this.play(u, 'channel', 0.6); const v = t.unit; v.status = 'ok'; v.hp = Math.ceil(v.max * 0.25); v.player.set('idle'); this.pop(v, '구출!', '#7dffa0'); this.log(`${u.name} → ${v.name} 구출`); this.addMorale(v, 10); }
      this.busy = false;
      this.checkEnd();
      if (u.side === 'ally') {
        if (!u.act && !u.bonus && u.move <= 0) this.endUnit(u);
        else this.g.ui.skillbar(this, u);
      }
    }
    async play(u, motion, wait) { u.player.set(motion); await sleep(wait); }
    focus(a, b, z = 1.32) { const [ax, ay] = this.pos(a), [bx, by] = this.pos(b); this.cam.tx = (ax + bx) / 2; this.cam.ty = (ay + by) / 2 - 70; this.cam.tz = z; }
    unfocus() { this.cam.tx = 800; this.cam.ty = 600; this.cam.tz = 1; }

    async attack(a, t, s, opt = {}) {
      const sk = D.SKILLS[s];
      if (t.c !== a.c) a.face = Math.sign(t.c - a.c);
      if (!opt.second) { this.focus(a, t); await sleep(0.2); }
      const motion = a.weapon === 'cast' && !sk.ranged && s !== 'chaliceBash' && s !== 'holySmite' ? 'channel' : 'attack';
      a.player.set(motion);
      this.trails.push({ u: a, pts: [], until: MO[motion].hitAt(a.weapon) + 0.12, t: 0 });
      await sleep(MO[motion].hitAt(a.weapon));
      const o = this.odds(a, t, s);
      const hitRoll = Math.random() * 100 < o.hit;
      if (sk.ranged) await this.projectile(a, t, sk.proj || (a.weapon === 'shoot' ? 'bolt' : 'orb'));
      const [tx, ty] = this.pos(t), sc = rowS(t.r);
      if (hitRoll) {
        const crit = Math.random() * 100 < o.crit;
        const dmg = this.damage(a, t, s, crit);
        this.fxAt(sk.fx === 'bolt' ? 'zap' : 'hit', tx, ty - 70 * sc * t.size, 0.75 * sc * (crit ? 1.4 : 1));
        if (!sk.ranged) this.fxAt('slash', tx - 10, ty - 75 * sc * t.size, 0.5 * sc, -0.4);
        this.hurt(a, t, dmg, crit, null, s);
        if (sk.debuff && this.standing(t)) { t.buffs.push({ ...sk.debuff }); this.pop(t, '명중 −30', '#ffb3a8', 0.25); }
        if (sk.push && this.standing(t)) await this.push(a, t, sk.push);
        // 반격 태세
        if (!opt.reaction && !sk.ranged && t.stance === 'riposte' && this.standing(t) && manhattan(t, a) === 1) {
          t.stance = null; this.log(`${t.name}: 반격!`); await sleep(0.3); await this.attack(t, a, D.CLASSES[t.kind]?.attack || 'slash', { reaction: true });
        }
      } else if (sk.graze) {
        const dmg = Math.max(1, Math.round(this.damage(a, t, s, false) * 0.25));
        this.pop(t, '스침', '#d6dcea', -0.2); this.hurt(a, t, dmg, false);
      } else {
        t.dodge = 0.45; this.pop(t, '빗나감', '#d6dcea');
        this.log(`${a.name} → ${t.name}: 빗나감 (${o.hit}%)`);
      }
      await sleep(0.55);
      if (!opt.second) this.unfocus();
    }
    async chain(a, first, s) {
      const sk = D.SKILLS[s];
      await this.attack(a, first, s);
      let last = first; const hit = new Set([first]);
      for (const m of sk.chain) {
        const next = this.foesOf(a).filter((v) => !hit.has(v) && manhattan(v, last) <= 2).sort((x, y) => manhattan(x, last) - manhattan(y, last))[0];
        if (!next) break;
        hit.add(next);
        await this.projectile({ ...last, fromUnit: last }, next, 'zapline');
        const dmg = this.damage(a, next, s, false, m / sk.mult);
        const [x, y] = this.pos(next); this.fxAt('zap', x, y - 70 * rowS(next.r) * next.size, 0.7);
        this.hurt(a, next, dmg, false, null, s);
        last = next; await sleep(0.25);
      }
    }
    async aoe(a, s, t) {
      const sk = D.SKILLS[s];
      const cells = this.areaCells(a, s, t);
      if (sk.cutin) await this.g.ui.cutin();
      const [fx, fy] = cells.length ? [cellX(cells[0][1], cells[0][0]), ROW_Y[cells[0][0]]] : this.pos(a);
      this.cam.tx = (this.pos(a)[0] + fx) / 2; this.cam.ty = this.pos(a)[1] - 80; this.cam.tz = 1.15;
      const motion = a.weapon === 'cast' ? 'attack' : 'attack';
      a.player.set(motion);
      this.trails.push({ u: a, pts: [], until: MO.attack.hitAt(a.weapon) + 0.12, t: 0 });
      await sleep(MO.attack.hitAt(a.weapon));
      if (sk.proj) await this.projectile(a, { r: t.r, c: t.c, size: 1 }, 'fire');
      this.cam.shake = sk.cutin ? 28 : 16;
      let i = 0;
      for (const [r, c] of cells) {
        const x = cellX(c, r), y = ROW_Y[r], sc = rowS(r);
        this.fxAt(sk.fx === 'fire' ? 'explosion' : 'slash', x, y - 50 * sc, (sk.fx === 'fire' ? 0.9 : 0.6) * sc, sk.fx === 'fire' ? 0 : -0.3, i * 0.04);
        if (s === 'fireball' && a.passives.has('fireField')) this.cells[r + ',' + c] = { ...(this.cells[r + ',' + c] || {}), fire: 2, owner: a };
        const v = this.at(r, c);
        if (v && this.standing(v) && (v.side !== a.side || sk.friendly)) {
          const o = this.odds(a, v, s);
          if (Math.random() * 100 < o.hit) this.hurt(a, v, this.damage(a, v, s, Math.random() * 100 < o.crit), false, null, s);
          else if (sk.graze) this.hurt(a, v, Math.max(1, Math.round(this.damage(a, v, s, false) * 0.25)), false);
          else { v.dodge = 0.45; this.pop(v, '빗나감', '#d6dcea'); }
        }
        i++;
      }
      await sleep(0.8);
      this.unfocus();
    }
    async heal(a, s, t) {
      const sk = D.SKILLS[s];
      a.player.set('channel');
      await sleep(0.45);
      const tgts = a.passives.has('healLight') ? this.alliesOf(a).filter((v) => manhattan(v, t) <= 1) : [t];
      for (const v of tgts) {
        let amt = Math.round(this.stat(a, 'atk') * sk.mult * (a.passives.has('grailMiracle') ? 1.6 : 1));
        if (v.status === 'down') { v.status = 'ok'; v.hp = Math.ceil(v.max * 0.25); v.player.set('idle'); this.pop(v, '일어남!', '#7dffa0'); }
        else if (v.status === 'ok') { v.hp = Math.min(v.max, v.hp + amt); this.pop(v, '+' + amt, '#7dffa0'); }
        if (a.passives.has('grailGuard')) v.buffs.push({ def: 20, turns: 2 });
        const [x, y] = this.pos(v); this.fxAt('heal', x, y - 70 * rowS(v.r) * v.size, 0.6 * rowS(v.r));
      }
      this.log(`${a.name}: 치유`);
      await sleep(0.6);
    }
    async buff(a, s, t) {
      const sk = D.SKILLS[s];
      a.player.set(s === 'rally' || s === 'prayer' || s === 'e_warcry' ? 'cheer' : 'channel');
      await sleep(0.5);
      let tgts = [t];
      if (sk.shape === 'all') tgts = this.alliesOf(a).filter((v) => this.standing(v));
      else if (sk.radius) tgts = this.alliesOf(a).filter((v) => this.standing(v) && manhattan(v, a) <= sk.radius);
      else if (sk.rows) tgts = this.alliesOf(a).filter((v) => this.standing(v) && Math.abs(v.r - a.r) <= sk.rows);
      if (sk.taunt) { for (const f of this.foesOf(a)) if (manhattan(f, a) <= sk.taunt) f.taunt = a; this.pop(a, '도발!', '#ff9a7a'); }
      for (const v of tgts) {
        const b = { ...sk.buff };
        if (b.morale) { this.addMorale(v, b.morale); delete b.morale; }
        if (b.cleanse) { v.buffs = v.buffs.filter((x) => !(x.aim < 0)); delete b.cleanse; }
        if (Object.keys(b).length > 1) v.buffs.push(b);
        const [x, y] = this.pos(v); this.fxAt('ring', x, y - 40 * rowS(v.r), 0.45 * rowS(v.r));
      }
      this.pop(a, sk.name, '#ffd65a', -0.2); this.log(`${a.name}: ${sk.name}`);
      await sleep(0.7);
      if (a.player.name === 'cheer') a.player.set('idle');
    }
    async dash(a, s, dir) {
      const sk = D.SKILLS[s];
      a.face = dir;
      let moved = 0;
      while (moved < sk.reach && this.inside(a.r, a.c + dir) && !this.at(a.r, a.c + dir)) {
        await this.moveUnit(a, [[a.r, a.c + dir]]); moved++; a.move++; a.moved--;
      }
      const t = this.at(a.r, a.c + dir);
      if (t && t.side !== a.side && this.standing(t)) await this.attack(a, t, s);
    }
    async push(a, t, n) {
      const dir = Math.sign(t.c - a.c) || (t.r > a.r ? 0 : 0);
      for (let i = 0; i < n; i++) {
        const nc = t.c + dir, nr = t.r + (dir ? 0 : Math.sign(t.r - a.r));
        if (!this.inside(nr, nc) || this.at(nr, nc)) {  // 부딪침
          this.hurt(a, t, Math.max(1, Math.round(this.stat(a, 'atk') * 0.4)), false, '쿵!');
          this.cam.shake = 14; break;
        }
        const x0 = cellX(t.c, t.r);
        t.pushing = true;
        for (let k = 1; k <= 6; k++) { await sleep(0.016); t.dx = (cellX(nc, nr) - x0) * k / 6; }
        t.dx = 0; t.pushing = false; t.r = nr; t.c = nc;
      }
    }
    async projectile(a, t, kind) {
      const from = a.fromUnit ? this.pos(a.fromUnit) : null;
      let sx, sy;
      if (from) { sx = from[0]; sy = from[1] - 70 * rowS(from[2]); }
      else {
        const M = a.M, p = M ? a.rig.point(M, 'weapon', 'tip') || a.rig.point(M, 'foreArm', 'grip') : null;
        [sx, sy] = p ? this.screenToWorld(p[0], p[1]) : [this.pos(a)[0], this.pos(a)[1] - 80];
      }
      const ex = cellX(t.c, t.r), ey = ROW_Y[t.r] - 70 * rowS(t.r) * (t.size || 1);
      const d = Math.hypot(ex - sx, ey - sy), dur = clamp(d / 1500, 0.12, 0.45);
      const p = { kind, sx, sy, ex, ey, t: 0, dur, arc: kind === 'fire' ? 80 : kind === 'bolt' ? 18 : 30 };
      this.fx.push({ proj: p, t: 0, life: dur });
      await sleep(dur);
    }
    hurt(a, t, dmg, crit, label, s) {
      if (t.buffs.some((b) => b.shield)) { t.buffs = t.buffs.filter((b) => !b.shield); this.pop(t, '방벽!', '#9fd0ff'); return; }
      t.hp = Math.max(0, t.hp - dmg);
      t.flash = 0.14;
      this.cam.shake = Math.max(this.cam.shake, crit ? 18 : 10);
      this.pop(t, (label ? label + ' ' : '') + '−' + dmg + (crit ? '!' : ''), crit ? '#ffd65a' : '#ffffff', 0, crit);
      if (crit) this.addMorale(t, -10);
      this.log(`${a.name} → ${t.name}: ${dmg}${crit ? ' (치명타)' : ''}`);
      if (t.hp > 0) { if (t.player.name !== 'stun') t.player.set('hit'); return; }
      // 쓰러짐
      if (a.side !== t.side) {
        this.kills[a.id] = (this.kills[a.id] || 0) + 1;
        this.addMorale(a, 10);
        if (a.passives.has('manaDrain')) for (const k of Object.keys(a.cds)) a.cds[k] = Math.max(0, a.cds[k] - 1);
      }
      if (t.side === 'ally') {
        if (t.kind === 'knight') {
          t.status = 'stun'; t.stun = t.passives.has('unbreakable') ? 1 : 2; t.player.set('stun');
          this.log(`${t.name} 기절! (${t.stun}턴 뒤 일어남)`); this.pop(t, '기절', '#ffd65a', -0.3);
          for (const v of this.alliesOf(t)) this.addMorale(v, -10);
        } else {
          t.status = 'down'; t.down = 3; t.player.set('death');
          this.log(`${t.name} 빈사! 3턴 안에 구출`);
          for (const v of this.alliesOf(t)) this.addMorale(v, -8);
        }
      } else {
        t.status = 'dying'; t.player.set('death'); t.dying = 0;
        if (t.def.boss) this.log(`${t.name} 쓰러짐!`);
      }
    }
    kill(u) {
      // 부활의 기도 (전투당 1회)
      const pr = this.units.find((v) => v.side === 'ally' && this.standing(v) && v.passives.has('resurrect'));
      if (pr && !this.resUsed) { this.resUsed = true; u.status = 'ok'; u.hp = Math.ceil(u.max * 0.3); u.player.set('idle'); this.pop(u, '부활의 기도!', '#ffd65a'); this.log(`${pr.name}: 부활의 기도 → ${u.name}`); return; }
      u.status = 'dead'; u.dyingOut = 0;
      this.log(`${u.name} 전사…`);
      for (const v of this.alliesOf(u)) this.addMorale(v, -20);
    }

    checkEnd() {
      if (this.result) return;
      if (!this.units.some((u) => u.side === 'foe' && (u.status === 'ok'))) this.finish(true);
      else if (!this.units.some((u) => u.side === 'ally' && this.standing(u))) this.finish(false);
    }
    finish(win) {
      this.result = { win };
      this.select(null);
      this.banner = { text: win ? '승리!' : '패배…', t: 0 };
      if (win) for (const u of this.units) if (u.side === 'ally' && this.standing(u)) u.player.set('cheer');
      setTimeout(() => this.g.battleEnd(this), 2200);
    }

    // ───────── 적 차례
    async enemyPhase() {
      if (this.phase !== 'ally' || this.result) return;
      this.phase = 'foe'; this.select(null);
      this.banner = { text: '적 차례', t: 0, small: true };
      this.g.ui.battleHud(this);
      for (const f of this.units.filter((u) => u.side === 'foe')) this.tickUnit(f);
      for (const k of Object.keys(this.cells)) { const c = this.cells[k]; if (c.fire && --c.fire <= 0) delete c.fire; }
      await sleep(0.8);
      for (const f of this.units.filter((u) => u.side === 'foe' && this.standing(u))) {
        if (this.result || !this.standing(f)) continue;
        f.move = f.frozen ? 0 : this.stat(f, 'move'); f.act = 1; f.bonus = 1; f.moved = 0;
        await this.ai(f);
        f.taunt = null;
        await sleep(0.2);
      }
      if (this.result) return;
      this.turn++;
      this.startAllyPhase(false);
      this.checkEnd();
    }
    async ai(f) {
      // 보스: 2턴마다 호령
      if (f.def.boss && this.turn % 2 === 1 && !(f.cds.e_warcry > 0)) { this.spend(f, 'e_warcry'); await this.buff(f, 'e_warcry', f); }
      const s = f.skills.find((x) => D.SKILLS[x].kind === 'attack' || D.SKILLS[x].kind === 'aoe');
      const allies = this.foesOf(f);
      if (!allies.length) return;
      const { dist, prev } = this.reach(f);
      let best = null;
      for (const k of dist.keys()) {
        const [r, c] = k.split(',').map(Number);
        const from = { r, c };
        for (const t of this.targets(f, s, from)) {
          if (!t.unit) continue;
          if (f.taunt && this.standing(f.taunt) && t.unit !== f.taunt && this.targets(f, s, from).some((x) => x.unit === f.taunt)) continue;
          const tmp = { ...f, r, c };
          const o = this.odds(tmp, t.unit, s);
          let score = o.hit / 100 * this.damage(tmp, t.unit, s, false) * (1 + o.crit / 200);
          if (t.unit.hp <= score) score += 20;               // 마무리
          if (f.def.ai === 'flanker' && o.facing === 'back') score += 15;
          if (f.def.ai === 'ranged') score += manhattan(from, t.unit) * 0.5; // 멀리서 쏘기
          if (f.def.boss && t.unit.kind === 'knight') score += 8;
          if (t.unit === f.taunt) score += 50;
          score -= dist.get(k) * 0.05;
          if (!best || score > best.score) best = { score, r, c, t };
        }
      }
      if (best) {
        if (best.r !== f.r || best.c !== f.c) { const p = this.pathTo(f, best.r, best.c); if (p) await this.moveUnit(f, p); }
        if (!this.standing(f)) return;
        const t = this.targets(f, s).find((x) => x.unit === best.t.unit);
        if (t) { this.spend(f, s); if (D.SKILLS[s].kind === 'aoe') await this.aoe(f, s, t); else await this.attack(f, t.unit, s); }
        this.checkEnd();
        return;
      }
      // 칠 수 없으면 가장 가까운 아군 쪽으로
      let go = null, gd = 1e9;
      for (const k of dist.keys()) {
        const [r, c] = k.split(',').map(Number);
        for (const a of allies) {
          const d = Math.abs(a.r - r) + Math.abs(a.c - c) + (f.def.ai === 'ranged' && a.r !== r ? 1 : 0);
          if (d < gd) { gd = d; go = [r, c]; }
        }
      }
      if (go && (go[0] !== f.r || go[1] !== f.c)) { const p = this.pathTo(f, go[0], go[1]); if (p) await this.moveUnit(f, p); }
    }

    // ───────── 입력
    screenToWorld(sx, sy) { const cam = this.cam; return [(sx - 800) / cam.z + cam.x, (sy - 600) / cam.z + cam.y]; }
    cellAt(mx, my) {
      const [x, y] = this.screenToWorld(mx, my);
      let best = null, bd = 1e9;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const d = Math.hypot((x - cellX(c, r)) / ROW_S[r], (y - ROW_Y[r]) * 1.25);
        if (d < bd) { bd = d; best = { r, c }; }
      }
      return bd < 70 ? best : null;
    }
    // 화면에서 유닛 몸통 클릭도 그 칸으로
    unitAt(mx, my) {
      const [x, y] = this.screenToWorld(mx, my);
      let best = null;
      for (const u of this.units) {
        if (u.status === 'dead' || u.status === 'gone') continue;
        const [ux, uy, rr] = this.pos(u), h = H_BASE * rowS(rr) * u.size;
        if (Math.abs(x - ux) < h * 0.32 && y < uy + 10 && y > uy - h) if (!best || rr > best.r) best = u;
      }
      return best;
    }
    onMove(mx, my) {
      const u = this.unitAt(mx, my), raw = this.cellAt(mx, my);
      this.hover = u ? { r: u.r, c: u.c } : raw;
      if (this.mode && this.sel && raw) {  // 대상 고르는 중엔 대상이 되는 칸 우선
        const ts = this.targets(this.sel, this.mode);
        if (!ts.some((x) => x.r === this.hover?.r && x.c === this.hover?.c) && ts.some((x) => x.r === raw.r && x.c === raw.c)) this.hover = raw;
      }
      this.g.ui.tip(this, mx, my);
    }
    async onClick(mx, my) {
      if (this.busy || this.phase !== 'ally' || this.result) return;
      const u0 = this.unitAt(mx, my);
      const cell = u0 ? { r: u0.r, c: u0.c } : this.cellAt(mx, my);
      if (!cell) return;
      const occ = this.at(cell.r, cell.c);
      const sel = this.sel;
      if (sel && this.mode) {  // 대상 고르기: 몸통 아래 칸 · 커서 아래 칸 둘 다 봄 (큰 캐릭터가 윗줄 칸을 가림)
        const ts = this.targets(sel, this.mode), raw = this.cellAt(mx, my);
        const t = ts.find((x) => x.r === cell.r && x.c === cell.c) || (raw && ts.find((x) => x.r === raw.r && x.c === raw.c));
        if (t) { await this.useSkill(sel, this.mode, t); return; }
        this.mode = null; this.g.ui.skillbar(this, sel); return;
      }
      if (occ && occ.side === 'ally' && this.standing(occ) && !occ.done) { this.select(occ); return; }
      if (sel && !occ) {
        const p = this.pathTo(sel, cell.r, cell.c);
        if (p && p.length) { await this.moveUnit(sel, p); if (!sel.act && !sel.bonus && sel.move <= 0) this.endUnit(sel); else this.g.ui.skillbar(this, sel); }
        return;
      }
      if (sel && occ && occ.side === 'foe') {  // 기본 공격 바로
        const s = sel.skills[0];
        if (this.usable(sel, s) && this.targets(sel, s).some((x) => x.unit === occ)) { await this.useSkill(sel, s, { r: occ.r, c: occ.c, unit: occ }); }
      }
    }
    setMode(s) {
      if (!this.sel || this.busy) return;
      const sk = D.SKILLS[s];
      if (sk.kind === 'buff' && sk.shape !== 'ally' || sk.kind === 'stance') { this.useSkill(this.sel, s, { r: this.sel.r, c: this.sel.c, unit: this.sel }); return; }
      this.mode = this.mode === s ? null : s;
      this.g.ui.skillbar(this, this.sel);
    }

    // ───────── 그리기
    update(dt) {
      for (const u of this.units) {
        u.player.step(dt, u.weapon);
        u.flash = Math.max(0, u.flash - dt);
        if (u.dodge > 0) { u.dodge -= dt; u.dx = -u.face * 45 * Math.sin(Math.max(0, u.dodge) / 0.45 * Math.PI); } else if (!u.pushing) u.dx = 0;
        if (u.status === 'dying') { u.dying += dt; if (u.dying > 1.6) u.alpha = Math.max(0, 1 - (u.dying - 1.6) / 0.6); if (u.dying > 2.2) { u.status = 'gone'; this.checkEnd(); } }
        if (u.status === 'dead') { u.dyingOut = (u.dyingOut || 0) + dt; u.alpha = Math.max(0, 1 - u.dyingOut / 1.2); }
      }
      const cam = this.cam;
      cam.x += (cam.tx - cam.x) * Math.min(1, dt * 5); cam.y += (cam.ty - cam.y) * Math.min(1, dt * 5); cam.z += (cam.tz - cam.z) * Math.min(1, dt * 5);
      cam.shake = Math.max(0, cam.shake - dt * 70);
      if (this.banner) this.banner.t += dt;
    }
    draw(ctx, dt) {
      const W = 1600, H = 900, cam = this.cam;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const shx = (Math.random() - 0.5) * cam.shake, shy = (Math.random() - 0.5) * cam.shake;
      const bg = this.g.img['stage:' + this.stage.bg];
      ctx.save();
      const bz = 1 + (cam.z - 1) * 0.5;
      ctx.translate(800 + shx, 600 + shy); ctx.scale(bz, bz); ctx.translate(-(800 + (cam.x - 800) * 0.6), -(600 + (cam.y - 600) * 0.6));
      const bs = Math.max(W / bg.width, H / bg.height) * 1.04;
      ctx.drawImage(bg, (W - bg.width * bs) / 2, (H - bg.height * bs) / 2 - 10, bg.width * bs, bg.height * bs);
      ctx.restore();
      ctx.translate(800 + shx, 600 + shy); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
      this.drawCells(ctx);
      // 유닛: 뒷줄부터
      const list = this.units.filter((u) => u.status !== 'gone' && u.alpha > 0).map((u) => ({ u, p: this.pos(u) })).sort((a, b) => a.p[2] - b.p[2] || a.p[0] - b.p[0]);
      for (const { u, p } of list) this.drawUnit(ctx, u, p);
      this.drawTrails(ctx, dt);
      this.drawFx(ctx, dt);
      this.drawPops(ctx, dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawBanner(ctx);
    }
    cellShape(ctx, r, c, fill, stroke, lw = 2) {
      const x = cellX(c, r), y = ROW_Y[r], w = CELL_W * ROW_S[r] * 0.47, h = 38 * ROW_S[r];
      ctx.beginPath();
      ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - h, x, y - h); ctx.quadraticCurveTo(x + w, y - h, x + w, y);
      ctx.quadraticCurveTo(x + w, y + h, x, y + h); ctx.quadraticCurveTo(x - w, y + h, x - w, y); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }
    drawCells(ctx) {
      if (this.result) return;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r + ',' + c];
        const z = c < 3 ? 'rgba(80,150,255,.10)' : c > COLS - 4 ? 'rgba(255,90,80,.09)' : 'rgba(255,255,255,.05)';
        this.cellShape(ctx, r, c, cell?.ice ? 'rgba(150,220,255,.45)' : cell?.fire ? 'rgba(255,120,40,.45)' : z, 'rgba(255,255,255,.16)', 1);
      }
      const u = this.sel;
      if (!u || this.phase !== 'ally' || this.busy) return;
      if (this.mode) {
        const ts = this.targets(u, this.mode);
        const sk = D.SKILLS[this.mode];
        for (const t of ts) this.cellShape(ctx, t.r, t.c, t.unit && t.unit.side !== u.side ? 'rgba(255,70,60,.32)' : 'rgba(255,214,90,.25)', t.unit && t.unit.side !== u.side ? '#ff5a4a' : '#ffd65a', 2);
        if (this.hover) {  // 범위 미리보기
          const t = ts.find((x) => x.r === this.hover.r && x.c === this.hover.c);
          if (t && (sk.kind === 'aoe')) for (const [r, c] of this.areaCells(u, this.mode, t)) this.cellShape(ctx, r, c, 'rgba(255,140,40,.35)', '#ffae5a', 3);
        }
      } else if (u.move > 0) {
        const { dist } = this.reach(u);
        for (const k of dist.keys()) { const [r, c] = k.split(',').map(Number); if (r !== u.r || c !== u.c) this.cellShape(ctx, r, c, 'rgba(70,150,255,.3)', 'rgba(140,200,255,.8)'); }
        if (u.act) for (const t of this.targets(u, u.skills[0])) this.cellShape(ctx, t.r, t.c, 'rgba(255,70,60,.25)', '#ff5a4a', 2);
      } else if (u.act) for (const t of this.targets(u, u.skills[0])) this.cellShape(ctx, t.r, t.c, 'rgba(255,70,60,.25)', '#ff5a4a', 2);
      this.cellShape(ctx, u.r, u.c, 'rgba(255,214,90,.35)', '#ffd65a', 3);
      if (this.hover) this.cellShape(ctx, this.hover.r, this.hover.c, null, '#ffffff', 2);
    }
    drawUnit(ctx, u, [x, y, rr]) {
      const s = rowS(rr), h = H_BASE * s * u.size;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(x, y, 32 * s * u.size, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
      let filter = '';
      if (u.flash > 0) filter += ' brightness(2.4)';
      if (this.phase === 'ally' && u.side === 'ally' && u.done && this.standing(u) && !this.result) filter += ' grayscale(.55) brightness(.85)';
      const flip = u.face < 0;
      if (u.player.name === 'death') {
        const A = this.g.anims[u.def.art];
        if (A) this.drawAnim(ctx, u, A, x, y, h, flip, filter, u.status === 'down' ? 0.9 : u.alpha);
      } else {
        u.M = u.rig.draw(ctx, u.player.pose(u.weapon), x, y, h, flip, { filter: filter || 'none', alpha: u.alpha });
        if (MO[u.player.name]?.stars) this.drawStars(ctx, u, h);
      }
      // 체력 · 상태
      if (u.status === 'dead' || u.status === 'dying') return;
      const bw = 60 * s, by = y - h * 1.08 - 6;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - bw / 2 - 2, by - 2, bw + 4, 9 * s + 4);
      ctx.fillStyle = u.side === 'ally' ? (u.status === 'ok' ? '#5fd068' : '#8d96ad') : '#ef5a4a';
      ctx.fillRect(x - bw / 2, by, bw * (u.hp / u.max), 9 * s);
      ctx.font = `700 ${Math.round(13 * s)}px "Malgun Gothic", sans-serif`; ctx.textAlign = 'center';
      const tags = [];
      if (u.status === 'down') tags.push(`빈사 ${u.down}`);
      if (u.status === 'stun') tags.push(`기절 ${u.stun}`);
      if (u.stance) tags.push(D.SKILLS[u.stance === 'spearWall' ? 'spearWall' : u.stance === 'ambush' ? 'ambush' : 'riposte'].name);
      if (u.buffs.some((b) => b.shield)) tags.push('방벽');
      if (u.frozen) tags.push('얼음');
      if (u.side === 'ally' && u.status === 'ok') { const m = this.moraleTier(u); if (m === 1) tags.push('고양'); if (m === -1) tags.push('동요'); if (m === -2) tags.push('공포'); }
      if (tags.length) { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(tags.join(' · '), x, by - 6); ctx.fillStyle = '#ffe9a8'; ctx.fillText(tags.join(' · '), x, by - 6); }
    }
    drawAnim(ctx, u, A, x, y, h, flip, filter, alpha) {
      const t = u.player.t;
      const T = A.times; let i = 0, acc = 0;
      while (i < T.length - 1 && T[i] > 0 && t >= acc + T[i]) { acc += T[i]; i++; }
      const f = A.frames[i], im = this.g.img['anim:' + u.def.art + ':' + i];
      const k = h / u.rig.height;
      const push = -90 * window.motionTrack([[0, 0], [0.12, 0.25], [0.32, 0.8], [0.5, 1]], t);
      ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -k : k, k); ctx.translate(push, 0);
      if (filter) ctx.filter = filter;
      ctx.globalAlpha = alpha;
      ctx.drawImage(im, -f.pivot[0], -f.pivot[1], f.w, f.h);
      ctx.restore();
    }
    drawStars(ctx, u, h) {
      const top = u.rig.point(u.M, 'head', 'top');
      if (!top) return;
      const [wx, wy] = this.screenToWorld(top[0], top[1]);
      const im = this.g.img['fx:star'], t = u.player.t, R = h * 0.28;
      for (let i = 0; i < 3; i++) {
        const a = t * 3.2 + i * 2.094, z = Math.sin(a);
        const s = (h * 0.13 * (0.85 + 0.25 * z)) / im.width;
        ctx.save(); ctx.globalAlpha = 0.7 + 0.3 * (z + 1) / 2;
        ctx.translate(wx + Math.cos(a) * R, wy - 10 + z * R * 0.28); ctx.rotate(t * 4 + i);
        ctx.filter = 'sepia(1) saturate(5) hue-rotate(5deg) brightness(1.1)';
        ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s);
        ctx.restore();
      }
    }
    // 무기 궤적: 공격 동작 동안 칼끝 자취를 띠로
    drawTrails(ctx, dt) {
      for (const tr of this.trails) {
        tr.t += dt;
        const u = tr.u;
        if (tr.t <= tr.until && u.M) {
          const tip = u.rig.point(u.M, 'weapon', 'tip'), grip = u.rig.point(u.M, 'weapon', 'pivot');
          if (tip && grip) {
            const a = this.screenToWorld(tip[0], tip[1]), b = this.screenToWorld(grip[0], grip[1]);
            const mid = [b[0] + (a[0] - b[0]) * 0.45, b[1] + (a[1] - b[1]) * 0.45];
            tr.pts.push({ a, m: mid, t: tr.t });
          }
        }
        tr.pts = tr.pts.filter((p) => tr.t - p.t < 0.16);
        if (tr.pts.length < 2) continue;
        const col = u.side === 'ally' ? '255,240,190' : '255,170,160';
        for (let i = 1; i < tr.pts.length; i++) {
          const p0 = tr.pts[i - 1], p1 = tr.pts[i], age = (tr.t - p1.t) / 0.16;
          ctx.fillStyle = `rgba(${col},${0.75 * (1 - age)})`;
          ctx.beginPath(); ctx.moveTo(p0.a[0], p0.a[1]); ctx.lineTo(p1.a[0], p1.a[1]); ctx.lineTo(p1.m[0], p1.m[1]); ctx.lineTo(p0.m[0], p0.m[1]); ctx.closePath(); ctx.fill();
        }
      }
      this.trails = this.trails.filter((tr) => tr.t < tr.until + 0.2);
    }
    fxAt(kind, x, y, s = 1, rot = 0, delay = 0) { this.fx.push({ kind, x, y, s, rot, t: -delay, life: kind === 'ring' || kind === 'heal' ? 0.7 : kind === 'slash' ? 0.25 : 0.36 }); }
    drawFx(ctx, dt) {
      const im = this.g.img;
      for (const e of this.fx) {
        e.t += dt;
        if (e.t < 0) continue;
        const u = e.t / e.life;
        if (e.proj) {
          const p = e.proj, k = Math.min(1, u);
          const x = p.sx + (p.ex - p.sx) * k, y = p.sy + (p.ey - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
          const ang = Math.atan2(p.ey - p.sy - Math.cos(k * Math.PI) * p.arc * Math.PI * 0.6, p.ex - p.sx);
          if (p.kind === 'zapline') { ctx.strokeStyle = 'rgba(180,230,255,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.sx, p.sy); for (let i = 1; i <= 6; i++) ctx.lineTo(p.sx + (x - p.sx) * i / 6 + (Math.random() - 0.5) * 18, p.sy + (y - p.sy) * i / 6 + (Math.random() - 0.5) * 18); ctx.stroke(); continue; }
          const img = p.kind === 'bolt' ? im['fx:arrow'] : p.kind === 'fire' ? im['fx:fireball'] : im['fx:bolt'];
          const sc = p.kind === 'bolt' ? 0.32 : 0.38;
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.kind === 'orb' ? e.t * 8 : ang);
          ctx.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc);
          ctx.restore();
          continue;
        }
        let img, s = e.s, a = 1;
        if (e.kind === 'hit' || e.kind === 'explosion' || e.kind === 'zap' || e.kind === 'poof') img = im[`fx:${e.kind}_${Math.min(6, 1 + Math.floor(u * 6))}`];
        else if (e.kind === 'slash') { img = im['fx:slash']; a = 1 - u; s *= 0.9 + 0.4 * u; }
        else if (e.kind === 'ring') { img = im['fx:ring']; a = 1 - u; s *= 0.6 + 0.8 * u; }
        else if (e.kind === 'heal') { img = im['fx:heart']; a = 1 - u; s *= 0.8 + 0.3 * u; }
        if (!img) continue;
        ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(e.x, e.y - (e.kind === 'heal' ? 40 * u : 0)); if (e.rot) ctx.rotate(e.rot);
        if (e.kind === 'ring') ctx.filter = 'sepia(1) saturate(4) hue-rotate(5deg)';
        if (e.kind === 'heal') ctx.filter = 'hue-rotate(110deg) saturate(1.4)';
        ctx.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
        ctx.restore();
      }
      this.fx = this.fx.filter((e) => e.t < e.life);
    }
    pop(u, text, color, delay = 0, big = false) { const [x, y] = this.pos(u); this.pops.push({ text, color, x, y: y - H_BASE * rowS(u.r) * u.size - 20, t: -delay, big }); }
    drawPops(ctx, dt) {
      ctx.textAlign = 'center';
      for (const p of this.pops) {
        p.t += dt;
        if (p.t < 0) continue;
        const u = p.t / 1.2;
        ctx.globalAlpha = u < 0.75 ? 1 : Math.max(0, 1 - (u - 0.75) / 0.25);
        ctx.font = `800 ${p.big ? 40 : 30}px "Malgun Gothic", sans-serif`;
        ctx.lineWidth = 6; ctx.strokeStyle = '#2a1410';
        const y = p.y - 36 * Math.min(1, u * 3);
        ctx.strokeText(p.text, p.x, y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, y);
        ctx.globalAlpha = 1;
      }
      this.pops = this.pops.filter((p) => p.t < 1.2);
    }
    drawBanner(ctx) {
      const b = this.banner;
      if (!b) return;
      const u = b.t;
      const a = this.result ? Math.min(1, u / 0.3) : u < 0.2 ? u / 0.2 : u > 1.2 ? Math.max(0, 1 - (u - 1.2) / 0.3) : 1;
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(16,20,32,.72)';
      const big = !b.small;
      ctx.fillRect(0, 450 - (big ? 70 : 40), 1600, big ? 140 : 80);
      ctx.font = `800 ${big ? 70 : 40}px "Malgun Gothic", sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = this.result ? (this.result.win ? '#ffd65a' : '#ff8a7a') : '#fff';
      ctx.fillText(b.text, 800, 450 + (big ? 24 : 14));
      ctx.globalAlpha = 1;
    }
  }

  // 동작 재생기
  class Player {
    constructor() { this.set('idle'); this.t0 = Math.random() * 10; }
    set(n) { this.name = n; this.t = 0; }
    step(dt, w) {
      this.t += dt;
      const m = MO[this.name];
      if (m && !m.loop && this.t >= m.dur(w)) this.set('idle');
    }
    pose(w) { return MO[this.name].f(this.t + (this.name === 'idle' ? this.t0 : 0), w); }
  }

  window.Battle = Battle;
  window.BattlePlayer = Player;
  window.FIELD = { ROWS, COLS, H_BASE };
})();
