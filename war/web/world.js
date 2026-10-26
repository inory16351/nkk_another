// 쥐 전쟁 시뮬 — 맵 규칙: 칸 · 높이 · 시야(LOS) · 엄폐 · 길찾기
const World = (() => {
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIRS8 = [...DIRS4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function create(def) {
    const D = def.rows.length, W = def.rows[0].length;
    const tiles = [];
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const ch = def.rows[z][x];
        const prop = PROPS[ch] ? ch : null;
        const ground = ch === ',' ? 'mud' : ch === '=' ? 'road' : ch === 'o' ? 'crater' : 'grass';
        const hx = (x - def.hill.cx) / def.hill.rx, hz = (z - def.hill.cz) / def.hill.rz;
        tiles.push({ x, z, prop, ground, h: hx * hx + hz * hz <= 1 ? 1 : 0 });
      }
    }
    return { W, D, tiles, units: [] };
  }

  const tile = (w, x, z) => (x < 0 || z < 0 || x >= w.W || z >= w.D ? null : w.tiles[z * w.W + x]);
  const propOf = (t) => (t && t.prop ? PROPS[t.prop] : null);
  const unitAt = (w, x, z) => w.units.find((u) => u.alive && u.x === x && u.z === z);
  const walkable = (w, x, z) => { const t = tile(w, x, z); return !!t && !(propOf(t) && propOf(t).block); };
  const sightBlocker = (t) => !!(propOf(t) && propOf(t).sightBlock);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // 칸 중심끼리 선을 따라 지나는 칸들 (시작 · 끝 제외)
  function lineTiles(w, ax, az, bx, bz) {
    const out = [], seen = new Set([az * w.W + ax, bz * w.W + bx]);
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = Math.round(ax + (bx - ax) * t), z = Math.round(az + (bz - az) * t);
      const k = z * w.W + x;
      if (!seen.has(k)) { seen.add(k); out.push(tile(w, x, z)); }
    }
    return out;
  }

  function clearLine(w, ax, az, bx, bz) {
    const ha = tile(w, ax, az).h, hb = tile(w, bx, bz).h, top = Math.max(ha, hb);
    for (const t of lineTiles(w, ax, az, bx, bz)) {
      if (!t || sightBlocker(t) || t.h > top) return false;
    }
    return true;
  }

  const nextToHigh = (w, x, z) => DIRS4.some(([dx, dz]) => sightBlocker(tile(w, x + dx, z + dz)));

  // 시야: 직선이 막혀도 높은 엄폐물 옆이면 옆 칸으로 몸을 내밀어 봄 (엑스컴식)
  function los(w, a, b) {
    if (clearLine(w, a.x, a.z, b.x, b.z)) return true;
    const peeks = (p) => [[p.x, p.z], ...(nextToHigh(w, p.x, p.z) ? DIRS4.map(([dx, dz]) => [p.x + dx, p.z + dz]).filter(([x, z]) => walkable(w, x, z)) : [])];
    for (const [ax, az] of peeks(a)) {
      for (const [bx, bz] of peeks(b)) {
        if ((ax !== a.x || az !== a.z || bx !== b.x || bz !== b.z) && clearLine(w, ax, az, bx, bz)) return true;
      }
    }
    return false;
  }

  function sightOf(w, u) {
    return RULES.sight + (u.def.sight || 0) + (tile(w, u.x, u.z).h ? 2 : 0);
  }

  function canSee(w, u, p) {
    return dist(u, p) <= sightOf(w, u) + 0.01 && los(w, u, p);
  }

  // 대상 p 가 from 쪽에서 오는 사격에 대해 받는 엄폐 (0 없음, 1 낮음, 2 높음) + 측면 노출 여부
  function coverAgainst(w, p, from) {
    const vx = from.x - p.x, vz = from.z - p.z, L = Math.hypot(vx, vz) || 1;
    let best = 0, any = 0;
    for (const [dx, dz] of DIRS4) {
      const pr = propOf(tile(w, p.x + dx, p.z + dz));
      if (!pr || !pr.cover) continue;
      any = Math.max(any, pr.cover);
      if ((vx * dx + vz * dz) / L > 0.35) best = Math.max(best, pr.cover);
    }
    const self = propOf(tile(w, p.x, p.z));
    if (self && self.selfCover) { best = Math.max(best, self.selfCover); any = Math.max(any, self.selfCover); }
    return { cover: best, flanked: any > 0 && best === 0 };
  }

  // 한 칸의 네 방향 엄폐 (이동 미리보기 방패 표시용)
  function coverSides(w, x, z) {
    return DIRS4.map(([dx, dz]) => {
      const pr = propOf(tile(w, x + dx, z + dz));
      return { dx, dz, cover: pr ? pr.cover : 0 };
    }).filter((s) => s.cover > 0);
  }

  // 길찾기 (다익스트라, 8방향, 대각선은 모서리 못 자름, 높이 바뀌면 +1)
  function reach(w, u, maxCost) {
    const cost = new Map(), prev = new Map();
    const key = (x, z) => z * w.W + x;
    const start = key(u.x, u.z);
    cost.set(start, 0);
    const open = [[0, u.x, u.z]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [c, x, z] = open.shift();
      if (c > cost.get(key(x, z))) continue;
      const h0 = tile(w, x, z).h;
      for (const [dx, dz] of DIRS8) {
        const nx = x + dx, nz = z + dz;
        if (!walkable(w, nx, nz)) continue;
        if (dx && dz && (!walkable(w, x + dx, z) || !walkable(w, x, z + dz))) continue;
        const o = unitAt(w, nx, nz);
        if (o && o !== u) continue;
        const nc = c + (dx && dz ? RULES.diagCost : 1) + (tile(w, nx, nz).h !== h0 ? RULES.climbCost : 0);
        if (nc > maxCost + 1e-6) continue;
        const k = key(nx, nz);
        if (!cost.has(k) || nc < cost.get(k)) {
          cost.set(k, nc); prev.set(k, key(x, z)); open.push([nc, nx, nz]);
        }
      }
    }
    const path = (x, z) => {
      let k = key(x, z);
      if (!cost.has(k)) return null;
      const out = [];
      while (k !== start) { out.unshift({ x: k % w.W, z: Math.floor(k / w.W) }); k = prev.get(k); }
      return out;
    };
    return { cost: (x, z) => cost.get(key(x, z)), path, keys: cost };
  }

  return { create, tile, propOf, unitAt, walkable, los, canSee, sightOf, coverAgainst, coverSides, reach, dist, DIRS4, DIRS8, sightBlocker };
})();
