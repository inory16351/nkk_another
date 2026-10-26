// 쥐 전쟁 시뮬 — HUD (DOM): 분대 카드 · 능력 버튼 · 명중률 · 기록 · 배너 · 시작/끝 화면
const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let targets = [];

  const ICON = { shoot: '🎯', aimed: '🔭', suppress: '〰', grenade: '💣', firstaid: '✚', overwatch: '◉', hunker: '▼', reload: '⟳', mortar: '⤒', heavy: '⋙' };

  function currentTarget() { return targets[G.targetIdx % Math.max(1, targets.length)] || null; }

  function useAbility(ab) {
    const u = G.sel;
    if (!u || G.turn !== 'rat' || G.mode === 'busy') return;
    const it = abilitiesOf(u).find((a) => a.ab === ab);
    if (!it || !it.ok) return;
    const A = ABILITIES[ab];
    if (A.target === 'self') return doAbility(u, ab);
    if (A.target === 'enemy') {
      targets = visibleEnemies(u).sort((a, b) => hitInfo(u, b).hit - hitInfo(u, a).hit);
      G.targetIdx = 0; G.mode = 'target'; G.ability = ab;
      View.focusPair(u, targets[0]);
      return;
    }
    if (A.target === 'ally') {
      const f = friendsOf(u).find((f) => f !== u && f.hp < f.maxHp && World.dist(f, u) < 1.6);
      if (f) doAbility(u, ab, f);
      return;
    }
    if (A.target === 'tile') { G.mode = 'tile'; G.ability = ab; }
  }

  function confirmTarget() {
    const t = currentTarget();
    if (t && G.sel) doAbility(G.sel, G.ability, t);
  }

  function cancel() {
    if (G.mode === 'target' || G.mode === 'tile') { G.mode = 'move'; G.ability = null; if (G.sel) View.focus(G.sel); }
  }

  function click(tile, e) {
    if (G.over || G.turn !== 'rat' || G.mode === 'busy') return;
    const u = G.sel;
    const hitU = View.unitAtScreen(e.clientX, e.clientY);
    if (G.mode === 'target') {
      if (hitU && targets.includes(hitU)) {
        if (currentTarget() === hitU) confirmTarget(); else G.targetIdx = targets.indexOf(hitU);
      } else cancel();
      return;
    }
    if (G.mode === 'tile') {
      if (tileTargetOk(u, G.ability, tile)) doAbility(u, G.ability, tile);
      else cancel();
      return;
    }
    if (hitU && hitU.side === 'rat' && hitU.ap > 0) { G.sel = hitU; G.mode = 'move'; View.focus(hitU); return; }
    if (hitU && hitU.side === 'cat' && u && visibleEnemies(u).includes(hitU)) {
      useAbility('shoot');
      if (G.mode === 'target') G.targetIdx = Math.max(0, targets.indexOf(hitU));
      return;
    }
    if (u && tile && G.mode === 'move') doMove(u, tile.x, tile.z);
  }

  function key(e) {
    const k = e.key.toLowerCase();
    if (k === 'tab') { e.preventDefault(); if (G.mode === 'target') G.targetIdx++; else if (G.turn === 'rat' && G.mode !== 'busy') selectNext(G.sel); return; }
    if (k === 'escape') return cancel();
    if (k === 'enter') { if (G.mode === 'target') confirmTarget(); else endRatTurn(); return; }
    if (k === ' ' && G.sel) { View.focus(G.sel); e.preventDefault(); return; }
    if (!G.sel || G.turn !== 'rat') return;
    const list = abilitiesOf(G.sel);
    if (k === 'r') return useAbility('reload');
    const n = parseInt(k, 10);
    if (n >= 1 && n <= list.length) useAbility(list[n - 1].ab);
  }

  // 명중 미리보기 (대상 고르는 중 · 적 위에 마우스)
  let mouse = { x: 0, y: 0 };
  function hover(x, y) { mouse = { x, y }; }

  function renderTip() {
    const tip = $('tip');
    let a = G.sel, b = null;
    if (G.mode === 'target') b = currentTarget();
    else if (a && G.turn === 'rat' && G.mode === 'move') {
      const h = View.unitAtScreen(mouse.x, mouse.y);
      if (h && h.side === 'cat' && visibleEnemies(a).includes(h)) b = h;
    }
    if (!a || !b) { tip.style.display = 'none'; return; }
    const info = hitInfo(a, b, { aimed: G.ability === 'aimed', heavy: G.ability === 'heavy' });
    const wp = WEAPONS[G.ability === 'heavy' ? 'hmg' : a.def.weapon];
    tip.style.display = 'block';
    tip.innerHTML = `<div class="tip-h"><b>${b.name}</b> <span>체력 ${b.hp}/${b.maxHp}</span></div>
      <div class="tip-big">${info.hit}%<small>명중</small> ${info.crit}%<small>치명</small></div>
      <div class="tip-d">피해 ${wp.dmg[0] + (G.ability === 'aimed' ? 1 : 0)}–${wp.dmg[1] + (G.ability === 'aimed' ? 1 : 0)}${info.flanked ? ' · <b class="warn">측면!</b>' : ''}${b.active ? '' : ' · <b class="warn">눈치 못 챔</b>'}</div>
      ${info.parts.map(([n, v]) => `<div class="tip-r"><span>${n}</span><span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v}</span></div>`).join('')}
      ${G.mode === 'target' ? `<div class="tip-k">클릭 · Enter 발사 / Tab 다음 대상 / Esc 취소</div>` : ''}`;
  }

  let lastBar = '';
  function update() {
    if (!G.world) return;
    $('turn').textContent = G.over ? '' : G.turn === 'rat' ? `아군 차례 · ${G.round}턴` : '고양이 군 차례…';
    $('turn').className = G.turn;
    $('shells').textContent = `박격포탄 ${G.shells}`;
    $('log').innerHTML = G.log.map((l) => `<div class="l ${l.kind}">${l.msg}</div>`).join('');
    renderTip();
    // 분대 카드 + 능력 버튼 (바뀔 때만 다시 그림)
    const u = G.sel;
    const abil = u && G.turn === 'rat' ? abilitiesOf(u) : [];
    const sig = JSON.stringify([G.units.filter((x) => x.side === 'rat').map((x) => [x.hp, x.ap, x.alive, x.downed, x.ammo, x.overwatch, x.hunker, x.wounds]), u && u.id, abil.map((a) => [a.ab, a.ok, a.count]), G.mode, G.ability, G.turn]);
    if (sig === lastBar) return;
    lastBar = sig;
    $('squad').innerHTML = G.units.filter((x) => x.side === 'rat').map((x) => {
      const rank = RANKS[rankOf(x.xp)].name;
      return `<div class="card ${x === u ? 'sel' : ''} ${x.alive ? '' : 'dead'}" data-id="${x.id}">
        <div class="nm">${rank} ${x.name}</div><div class="cl">${x.def.name}</div>
        <div class="hp">${Array.from({ length: x.maxHp }, (_, i) => `<i class="${i < x.hp ? 'on' : ''}"></i>`).join('')}</div>
        <div class="st">${x.alive ? `탄 ${x.ammo}/${WEAPONS[x.def.weapon].clip} · ${'●'.repeat(x.ap)}${'○'.repeat(Math.max(0, 2 - x.ap))}` : x.downed ? '<span class="neg">쓰러짐 — 확인사살 위험</span>' : '전사'}</div>
        ${Object.keys(x.wounds).length ? `<div class="st neg">${Object.entries(x.wounds).map(([p, v]) => `${PART_NAME[p]} ${v > 1 ? '잘림' : '부상'}`).join(' · ')}</div>` : ''}
      </div>`;
    }).join('');
    for (const el of document.querySelectorAll('#squad .card')) {
      el.onclick = () => { const x = G.units.find((q) => q.id === +el.dataset.id); if (x && x.alive && x.ap > 0 && G.turn === 'rat' && G.mode !== 'busy') { G.sel = x; G.mode = 'move'; View.focus(x); } };
    }
    $('abil').innerHTML = abil.map((a, i) => {
      const A = ABILITIES[a.ab];
      const on = (G.mode === 'target' || G.mode === 'tile') && G.ability === a.ab;
      return `<button class="ab ${a.ok ? '' : 'off'} ${on ? 'on' : ''}" data-ab="${a.ab}" title="${A.desc || ''}${a.why ? ' — ' + a.why : ''}">
        <span class="ic">${ICON[a.ab] || '•'}</span><span class="an">${A.name}${a.count != null ? ` ×${a.count}` : ''}</span><span class="hk">${i + 1}</span></button>`;
    }).join('');
    for (const b of document.querySelectorAll('#abil .ab')) b.onclick = () => useAbility(b.dataset.ab);
    $('endturn').disabled = G.turn !== 'rat' || G.mode === 'busy';
  }

  function banner(text, side) {
    const b = $('banner');
    b.textContent = text; b.className = 'show ' + side;
    clearTimeout(b._t); b._t = setTimeout(() => (b.className = ''), 1400);
  }

  const woundText = (x) => {
    const t = [];
    if (x.downed) t.push('쓰러졌다 살아남음');
    if (x.hurt && x.hurt.length) t.push(x.hurt.map((p) => PART_NAME[p]).join(' · ') + ' 부상 (나음)');
    if (x.lost && x.lost.length) t.push(x.lost.map((p) => PART_NAME[p]).join(' · ') + ' 잘림 → ' + x.lost.map((p) => (p === 'arm' ? '의수' : '의족')).join(' · ') + ' 필요');
    return t.length ? ` <span class="neg">· ${t.join(' · ')}</span>` : '';
  };

  function showEnd(result, rep) {
    const r = G.roster;
    $('end').style.display = 'flex';
    $('end').innerHTML = `<div class="panel">
      <h1>${result === 'win' ? '승리' : '패배'}</h1>
      <p>${result === 'win' ? '언덕을 지켜 냈다. 총통의 고양이들이 물러간다.' : '분대가 전멸했다. 총통의 깃발이 언덕에 꽂혔다.'}</p>
      <h3>분대 보고</h3>
      ${rep.map((x) => x.dead ? `<div class="rep dead">✝ ${x.name} — 전사 (다시 돌아오지 않음)</div>`
        : `<div class="rep">${x.rank} ${x.name} · ${CLASSES[x.cls].name} · 처치 ${x.kills} · 경험 ${x.xp}${x.promoted ? ' <b>진급!</b>' : ''}${woundText(x)}</div>`).join('')}
      ${Roster.ready(r).length < r.squad.length ? `<h3>의수 · 의족 대기 (출전 불가)</h3><div class="fallen">${r.squad.filter((s) => s.lost && s.lost.length).map((s) => `${s.name} (${s.lost.map((p) => PART_NAME[p]).join(' · ')})`).join(' · ')}</div>` : ''}
      ${r.fallen.length ? `<h3>전사자 명단</h3><div class="fallen">${r.fallen.map((f) => `${f.rank} ${f.name}`).join(' · ')}</div>` : ''}
      <div class="btns"><button id="again">다음 전투 (빈자리는 신병)</button><button id="reset">분대 처음부터</button></div>
    </div>`;
    $('again').onclick = () => { $('end').style.display = 'none'; restart(); };
    $('reset').onclick = () => { localStorage.removeItem(Roster.key); $('end').style.display = 'none'; restart(); };
  }

  function restart() {
    View.reset();
    startBattle();
    lastBar = '';
    selectNext();
  }

  return { update, click, key, hover, cancel, banner, showEnd, currentTarget, restart };
})();
