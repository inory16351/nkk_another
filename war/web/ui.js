// 쥐 전쟁 시뮬 — HUD (DOM): 분대 카드 · 능력 버튼 · 명중률 · 기록 · 배너 · 시작/끝 화면
const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let targets = [];

  const ICON = { shoot: '🎯', aimed: '🔭', suppress: '〰', grenade: '💣', firstaid: '✚', overwatch: '◉', hunker: '▼', reload: '⟳', mortar: '⤒', heavy: '⋙',
    scurry: '💨', ambush: '🕳', warcry: '📢', charge: '🧨', gnaw: '🦷', tunnel: '⛏', flame: '🔥', knife: '🗡', cheese: '🧀', mark: '◎', command: '🐀', radioscan: '📻', dominate: '🌀', ward: '🛡' };

  // ── 롤식 툴팁 ──
  const FLAVOR = {
    scurry: '쥐는 도망칠 줄 안다. 그래서 오래 산다.', ambush: '고양이는 구멍 안을 보지 못한다.', warcry: '찍! 찍찍! 찍찍찍!', gnaw: '이빨은 쇠보다 끈질기다.',
    tunnel: '땅 밑은 언제나 쥐의 영토였다.', cheese: '전쟁 중에도 치즈는 치즈다.', command: '전령은 작고 빠르고, 셀 수 없이 많다.', dominate: '눈을 마주치는 순간, 그 고양이는 더 이상 고양이가 아니다.',
    ward: '보이지 않는 막이 총알을 삼킨다.', knife: '총소리는 무리를 깨운다. 칼은 깨우지 않는다.', flame: '불은 엄폐물을 가리지 않는다.',
  };
  function tipHTML(ab, why, count) {
    const A = ABILITIES[ab];
    if (!A) return '';
    const tags = [];
    tags.push(A.ap ? `<span class="tag ap">행동력 ${A.ap}</span>` : '<span class="tag free">행동력 없이</span>');
    tags.push(A.end ? '<span class="tag end">쓰면 턴 끝</span>' : '<span class="tag free">턴 계속</span>');
    if (A.psi) tags.push(`<span class="tag psi">정신력 ${A.psi}</span>`);
    if (A.once) tags.push('<span class="tag cnt">전투당 1번</span>');
    if (count != null && count !== '') tags.push(`<span class="tag cnt">남은 횟수 ${count}</span>`);
    if (A.range) tags.push(`<span class="tag">사거리 ${A.range}칸</span>`);
    if (A.radius) tags.push(`<span class="tag">범위 ${A.radius}칸</span>`);
    if (A.dmg) tags.push(`<span class="tag">피해 ${A.dmg[0]}–${A.dmg[1]}</span>`);
    const icon = window.ICONS && ICONS[ab] ? `<img src="${iconSrc(ab)}" alt="">` : '';
    return `<div class="th">${icon}<div><div class="tn">${A.name}</div><div class="tk">${A.key ? '단축키 ' + A.key.toUpperCase() : ''}</div></div></div>
      <div class="tags">${tags.join('')}</div><div class="td">${A.desc || ''}</div>${why ? `<div class="tw">✖ ${why}</div>` : ''}${FLAVOR[ab] ? `<div class="tf">“${FLAVOR[ab]}”</div>` : ''}`;
  }
  function bindTips() {
    const tt = document.getElementById('tt');
    let cur = null;
    const place = (e) => {
      const r = tt.getBoundingClientRect();
      let x = e.clientX + 18, y = e.clientY - r.height - 12;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 18;
      if (y < 8) y = e.clientY + 22;
      tt.style.left = x + 'px'; tt.style.top = y + 'px';
    };
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip-ab], [data-tip-html]');
      if (el === cur) return;
      cur = el;
      if (!el) { tt.style.display = 'none'; return; }
      tt.innerHTML = el.dataset.tipHtml || tipHTML(el.dataset.tipAb, el.dataset.why, el.dataset.count);
      tt.style.display = 'block';
      place(e);
    });
    document.addEventListener('mousemove', (e) => { if (cur) place(e); });
  }
  bindTips();

  // 아이콘 그림 주소 (단일 HTML 이면 data URI)
  function iconSrc(k) { const p = '../art/out/' + ICONS[k]; return (window.__ASSETS && window.__ASSETS[p]) || p; }
  function currentTarget() { return targets[G.targetIdx % Math.max(1, targets.length)] || null; }

  function useAbility(ab) {
    const u = G.sel;
    if (!u || G.turn !== 'rat' || G.mode === 'busy') return;
    const it = abilitiesOf(u).find((a) => a.ab === ab);
    if (!it || !it.ok) return;
    const A = ABILITIES[ab];
    if (A.target === 'self') return doAbility(u, ab);
    if (A.target === 'enemy' || A.target === 'ally') {
      targets = abilityTargets(u, ab);
      if (A.target === 'enemy') targets.sort((a, b) => hitInfo(u, b).hit - hitInfo(u, a).hit);
      else targets.sort((a, b) => (a.downed ? -1 : 0) - (b.downed ? -1 : 0) || a.hp / a.maxHp - b.hp / b.maxHp);
      if (!targets.length) return;
      G.targetIdx = 0; G.mode = 'target'; G.ability = ab;
      View.focusPair(u, targets[0]);
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
    if (hitU && hitU.side === 'rat' && hitU.ap > 0 && hitU.panic <= 0) { G.sel = hitU; G.mode = 'move'; View.focus(hitU); return; }
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
    if (e.code === 'KeyR') return useAbility('reload'); // 한글 입력 상태(ㄱ)에서도
    const n = /^Digit\d$/.test(e.code) ? +e.code[5] : parseInt(k, 10);
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
    const A = ABILITIES[G.ability] || ABILITIES.shoot;
    if (G.mode === 'target' && A.target === 'ally' || (G.mode === 'target' && !['shoot', 'aimed', 'heavy', 'knife'].includes(G.ability))) {
      tip.style.display = 'block';
      tip.innerHTML = `<div class="tip-h"><b>${A.name} → ${b.name}</b> <span>체력 ${b.hp}/${b.maxHp}</span></div><div class="tip-d">${A.desc || ''}</div><div class="tip-k">클릭 · Enter 사용 / Tab 다음 대상 / Esc 취소</div>`;
      return;
    }
    const info = hitInfo(a, b, { aimed: G.ability === 'aimed', heavy: G.ability === 'heavy', knife: G.ability === 'knife' });
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
    $('shells').textContent = G.shells ? `박격포탄 ${G.shells}` : '';
    const objSig = JSON.stringify(objectiveText()) + G.round;
    if ($('mission')._sig !== objSig) {
      $('mission')._sig = objSig;
      $('mission').innerHTML = `<div class="mh">${G.mission.name}</div>${objectiveText().map(([t, ok]) => `<div class="mo ${ok ? 'ok' : ''}">${ok ? '☑' : '☐'} ${t}</div>`).join('')}<div class="mr">${G.round}턴 · 보상 보급품 ${G.mission.reward}</div>`;
    }
    $('log').innerHTML = G.log.map((l) => `<div class="l ${l.kind}">${l.msg}</div>`).join('');
    renderTip();
    // 분대 카드 + 능력 버튼 (바뀔 때만 다시 그림)
    const u = G.sel;
    const abil = u && G.turn === 'rat' ? abilitiesOf(u) : [];
    const sig = JSON.stringify([G.units.filter((x) => x.side === 'rat').map((x) => [x.hp, x.ap, x.alive, x.downed, x.ammo, x.overwatch, x.hunker, x.wounds, x.stress, x.panic, x.hidden, x.ward]), u && u.id, abil.map((a) => [a.ab, a.ok, a.count]), G.mode, G.ability, G.turn]);
    if (sig === lastBar) return;
    lastBar = sig;
    $('squad').innerHTML = G.units.filter((x) => x.side === 'rat' && x.r).map((x) => {
      const rank = RANKS[rankOf(x.xp)].name;
      const ss = stressState(x.stress, Camp.breakAt(x.r));
      const done = x.alive && G.turn === 'rat' && x.ap <= 0;
      return `<div class="card ${x === u ? 'sel' : ''} ${x.alive ? '' : 'dead'} ${done ? 'done' : ''}" data-id="${x.id}"><div class="pf"></div>
        ${x === u ? '<div class="now">▶ 지금 명령</div>' : done ? '<div class="now done">행동 끝</div>' : ''}
        <div class="nm">${rank} ${x.name}</div><div class="cl">${x.def.name}</div>
        <div class="stl"><span>스트레스</span><b style="color:${ss.c}">${x.stress} · ${ss.t}</b></div>
        <div class="sbar" title="스트레스 ${x.stress}"><i style="width:${x.stress}%;background:${ss.c}"></i></div>
        <div class="hp">${Array.from({ length: x.maxHp }, (_, i) => `<i class="${i < x.hp ? 'on' : ''}"></i>`).join('')}</div>
        <div class="st">${x.alive ? `탄 ${x.ammo}/${WEAPONS[x.def.weapon].clip} · ${'●'.repeat(x.ap)}${'○'.repeat(Math.max(0, 2 - x.ap))}` : x.downed ? '<span class="neg">쓰러짐 — 확인사살 위험</span>' : '전사'}</div>
        ${Object.keys(x.wounds).length ? `<div class="st neg">${Object.entries(x.wounds).map(([p, v]) => `${PART_NAME[p]} ${v > 1 ? '잘림' : '부상'}`).join(' · ')}</div>` : ''}
      </div>`;
    }).join('');
    for (const el of document.querySelectorAll('#squad .card')) {
      const x = G.units.find((q) => q.id === +el.dataset.id);
      if (x && x.r) el.querySelector('.pf').appendChild(Lobby.portrait(x.r, 44, { dead: !x.alive && !x.downed }));
      el.onclick = () => { const x = G.units.find((q) => q.id === +el.dataset.id); if (x && x.alive && x.ap > 0 && G.turn === 'rat' && G.mode !== 'busy') { G.sel = x; G.mode = 'move'; View.focus(x); } };
    }
    $('abil').innerHTML = abil.map((a, i) => {
      const A = ABILITIES[a.ab];
      const on = (G.mode === 'target' || G.mode === 'tile') && G.ability === a.ab;
      return `<button class="ab ${a.ok ? '' : 'off'} ${on ? 'on' : ''} ${A.psi ? 'psi' : ''}" data-ab="${a.ab}" data-tip-ab="${a.ab}" data-why="${a.why || ''}" data-count="${a.count != null ? a.count : ''}">
        <span class="ic">${window.ICONS && ICONS[a.ab] ? `<img src="${iconSrc(a.ab)}" alt="">` : ICON[a.ab] || '•'}</span><span class="an">${A.name}${a.count != null ? ` ×${a.count}` : ''}</span><span class="hk">${i + 1}</span></button>`;
    }).join('');
    for (const b of document.querySelectorAll('#abil .ab')) b.onclick = () => useAbility(b.dataset.ab);
    $('abil').classList.toggle('many', abil.length > 7); // 스킬이 많으면 2열로
    // 선택한 쥐: 큰 초상 · 병종 · 체력 · 탄 · 스트레스 · 특성
    const sp = $('selp');
    if (u && u.r) {
      sp.style.display = '';
      sp.innerHTML = `<div class="big"></div><div><div class="nm">${RANKS[rankOf(u.xp)].name} ${u.name}</div><div class="cl">${u.def.name}</div>
        <div class="st">체력 ${u.hp}/${u.maxHp} · 탄 ${u.ammo}/${u.clip}${u.psi ? ` · 정신력 ${u.psi}` : ''}</div>
        <div class="stl" style="width:170px"><span>스트레스</span><b style="color:${stressState(u.stress, Camp.breakAt(u.r)).c}">${u.stress} · ${stressState(u.stress, Camp.breakAt(u.r)).t}</b></div>
        <div class="sbar" style="width:170px" title="스트레스"><i style="width:${u.stress}%;background:${stressState(u.stress, Camp.breakAt(u.r)).c}"></i></div>
        <div class="tr">${u.r.traits.map((t) => `<span class="chip ${TRAITS[t].rare ? 'rare' : ''}" title="${TRAITS[t].desc}">${TRAITS[t].name}</span>`).join('')}</div></div>`;
      sp.querySelector('.big').appendChild(Lobby.portrait(u.r, 76));
    } else if (u && u.controlled) {
      sp.innerHTML = `<div><div class="nm">${u.name}</div><div class="cl psy">정신 지배 중 · ${u.controlled}턴</div></div>`;
    } else sp.style.display = 'none';
    // 선택한 쥐가 없으면 (고양이 차례 등) 행동 패널을 숨김
    $('bar').classList.toggle('none', !(u && G.turn === 'rat'));
    $('endturn').disabled = G.turn !== 'rat' || G.mode === 'busy';
  }

  function banner(text, side) {
    const b = $('banner');
    b.textContent = text; b.className = 'show ' + side;
    clearTimeout(b._t); b._t = setTimeout(() => (b.className = ''), 1400);
  }

  function showEnd(result, out) {
    const rep = out.report;
    $('end').style.display = 'flex';
    $('end').innerHTML = `<div class="panel endp">
      <h1 class="${result}">${result === 'win' ? '작전 성공' : '작전 실패'}</h1>
      <p>${G.mission.name} — ${result === 'win' ? '고양이들이 물러갔다.' : '분대가 무너졌다. 살아 돌아온 쥐는 많지 않다.'} 보급품 +${out.reward}</p>
      <div class="reps"></div>
      ${out.drafted ? `<p class="dim">빈자리를 채우려고 징집병 ${out.drafted}마리가 사령부에 도착했다.</p>` : ''}
      <div class="btns"><button class="btn big" id="tohq">사령부로</button></div>
    </div>`;
    const box = $('end').querySelector('.reps');
    for (const x of rep) {
      const el = document.createElement('div');
      el.className = 'rep' + (x.dead ? ' dead' : '');
      el.appendChild(Lobby.portrait(x.r, 52, { dead: x.dead }));
      const notes = [];
      if (x.dead) notes.push(`<b class="neg">전사 — ${x.how || ''}</b> <span class="dim">“${x.r.story}”</span>`);
      else {
        notes.push(`처치 ${x.kills}`);
        if (x.promoted) notes.push('<b class="gold">진급! 스킬 1점</b>');
        if (x.downed) notes.push('<span class="neg">쓰러졌다 살아남음</span>');
        if (x.severed.length) notes.push(`<b class="neg">${x.severed.map((p) => PART_NAME[p]).join(' · ')} 잃음 → 의수 · 의족 필요</b>`);
        if (x.broke) notes.push(`<b class="psy">정신 이상: ${x.broke}</b>`);
        notes.push(`스트레스 <b style="color:${x.r.stress >= STRESS.shaky ? '#c9a3ff' : 'inherit'}">${x.r.stress}</b>`);
      }
      el.insertAdjacentHTML('beforeend', `<div><b>${RANKS[rankOf(x.r.xp)].name} ${x.r.name}</b><div>${notes.join(' · ')}</div></div>`);
      box.appendChild(el);
    }
    $('tohq').onclick = () => { $('end').style.display = 'none'; Lobby.show(); };
  }

  // 전투 시작 직후 (사령부에서 출격)
  function restart() {
    lastBar = '';
    $('mission')._sig = null;
    selectNext();
    banner('아군 차례 · 1턴', 'rat');
  }

  return { update, click, key, hover, cancel, banner, showEnd, currentTarget, restart, iconSrc, tipHTML };
})();
