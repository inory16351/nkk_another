// 쥐 전쟁 시뮬 — 지하 사령부 (로비): 작전 · 분대 · 모집 · 추모비. 쥐 초상은 리그로 직접 그림
const Lobby = (() => {
  const $ = (id) => document.getElementById(id);
  let tab = 'ops', sel = null, pickMission = null;
  let C = null; // Camp 기록

  // ── 초상: 병종 리그 앞모습 + 얼굴 + 털빛 (상반신) ──
  function rigFor(r) {
    const cls = Camp.classOf(r);
    const base = View.RIG['rat_' + cls] || View.RIG.rat;
    const st = Camp.stats(r);
    if (cls === 'engineer' && st.abil.includes('flame') && View.RIG.rat_engineer_flame) return [View.RIG.rat_engineer_flame, base];
    return [(r.gear && View.RIG[`rat_${cls}_v${r.gear}`]) || base, base];
  }
  function portrait(r, size = 96, opts = {}) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + 'px';
    c.className = 'portrait' + (opts.dead ? ' dead' : '');
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const [R, B] = rigFor(r);
    const h = size * (opts.full ? 0.95 : 3.1), y = opts.full ? size * 0.98 : size * 0.42 + h * 0.875;
    if (opts.dead) g.filter = 'grayscale(1) brightness(0.7)';
    Rig.draw(g, R, size / 2, y, h, { view: 'front', flip: false, st: { seed: 1 }, t: 0, faceIdx: r.face, baseR: B, prost: r.prosthetic, face: opts.dead ? 'dead' : null });
    return c;
  }

  const stressCol = (s) => (s >= STRESS.shaky ? '#c9a3ff' : s >= 35 ? '#a796d0' : '#7d8fa8');
  function stressBar(r) {
    const ss = stressState(r.stress, Camp.breakAt(r));
    return `<div class="stl"><span>스트레스</span><b style="color:${ss.c}">${r.stress} · ${ss.t}</b></div><div class="sbar" title="스트레스 ${r.stress}"><i style="width:${r.stress}%;background:${ss.c}"></i></div>`;
  }
  const traitChips = (r) => r.traits.map((t) => `<span class="chip ${TRAITS[t].rare ? 'rare' : ''}" data-tip-html="<div class='tn'>${TRAITS[t].name}</div><div class='td'>${TRAITS[t].desc}</div>">${TRAITS[t].name}</span>`).join('');
  function status(r) {
    const s = [];
    if (r.lost && r.lost.length) s.push(`<b class="neg">${r.lost.map((p) => (p === 'arm' ? '팔' : '다리')).join(' · ')} 잃음</b>`);
    if (r.afflicted) s.push(`<b class="psy">정신 이상: ${r.afflicted}</b>`);
    if (r.stress >= STRESS.shaky) s.push('<b class="psy">불안 (명중 −10)</b>');
    if (r.grief) s.push(`<span class="dim">${r.grief}를 잃었다</span>`);
    return s.join(' · ');
  }

  // ── 그리기 ──
  function render() {
    C = Camp.load() || Camp.fresh();
    Camp.save(C);
    $('lb-sup').textContent = C.supplies;
    $('lb-bat').textContent = C.battles;
    $('lb-sq').textContent = `${C.squad.length}/${SQUAD_MAX}`;
    for (const b of document.querySelectorAll('#lobby .tab')) b.classList.toggle('on', b.dataset.tab === tab);
    const body = $('lb-body');
    body.innerHTML = '';
    if (tab === 'ops') ops(body);
    else if (tab === 'squad') squad(body);
    else if (tab === 'recruit') recruit(body);
    else memorial(body);
  }

  // 작전: 임무 목록 · 브리핑 · 출전 6자리
  function ops(body) {
    const open = Camp.unlocked(C);
    const cur = Camp.current(C);
    if (!pickMission || !open.includes(pickMission)) pickMission = cur;
    const m = pickMission;
    body.innerHTML = `<div class="ops">
      <div class="missions">${MISSIONS.map((x) => {
        const done = C.done.includes(x.id), lock = !open.includes(x);
        return `<button class="mcard ${x === m ? 'on' : ''} ${lock ? 'lock' : ''} ${done ? 'done' : ''}" data-m="${x.id}" ${lock ? 'disabled' : ''}>
          <div class="mn">${x.name}</div><div class="ms">${lock ? '🔒 이전 작전을 끝내야 열림' : done ? '✓ 완료 · 다시 출격 가능' : x === cur ? '▶ 현재 작전' : ''}</div></button>`;
      }).join('')}</div>
      <div class="brief panel">
        <div class="bh"><h2>${m.name}</h2><span class="reward">보급품 +${m.reward}</span></div>
        <p>${m.brief}</p>
        <div class="obj"><b>목표</b> ${{ elim: '고양이 전멸', officer: '표적 장교 사살', reach: '깃발 칸에 쥐 한 마리 도달' }[m.obj]}
          · <b>적</b> 고양이 ${m.cats.length} · ${m.shells ? `<b>박격포탄</b> ${m.shells}` : ''}</div>
        <h3 class="sec-h go">▶ 출전 <span>${C.deploy.length} / ${DEPLOY_MAX}</span> <small>누르면 대기로</small></h3>
        <div class="slots">${Array.from({ length: DEPLOY_MAX }, (_, i) => `<div class="slot" data-i="${i}"><em>${i + 1}</em></div>`).join('')}</div>
        <h3 class="sec-h rest">■ 대기 <span>${C.squad.length - C.deploy.length}</span> <small>쉬는 쥐는 다음 판 뒤 스트레스 −35 · 누르면 출전</small></h3>
        <div class="bench"></div>
        <div class="go-row"><span class="warn" id="lb-warn"></span><button class="btn big" id="lb-go">출 격</button></div>
      </div></div>`;
    for (const b of body.querySelectorAll('.mcard')) b.onclick = () => { pickMission = MISSIONS.find((x) => x.id === b.dataset.m); render(); };
    const slots = body.querySelectorAll('.slot');
    C.deploy.forEach((id, i) => {
      const r = C.squad.find((q) => q.id === id);
      if (!r || !slots[i]) return;
      slots[i].appendChild(miniCard(r, true));
      slots[i].onclick = () => { C.deploy = C.deploy.filter((x) => x !== id); Camp.save(C); render(); };
    });
    const bench = body.querySelector('.bench');
    for (const r of C.squad.filter((q) => !C.deploy.includes(q.id))) {
      const el = miniCard(r, false);
      el.onclick = () => {
        if (!Camp.ready(r) || C.deploy.length >= DEPLOY_MAX) return;
        C.deploy.push(r.id); Camp.save(C); render();
      };
      bench.appendChild(el);
    }
    const shaky = C.deploy.map((id) => C.squad.find((q) => q.id === id)).filter((r) => r && r.stress >= STRESS.shaky);
    $('lb-warn').textContent = !C.deploy.length ? '출전할 쥐를 고르세요' : shaky.length ? `스트레스 높음: ${shaky.map((r) => r.name).join(', ')} — 쉬게 하는 것도 방법` : '쉬는 쥐는 스트레스가 풀립니다';
    $('lb-go').disabled = !C.deploy.length;
    $('lb-go').onclick = () => go(m);
  }
  function miniCard(r, inSlot) {
    const st = Camp.stats(r);
    const el = document.createElement('div');
    el.className = 'mini' + (inSlot ? ' going' : ' resting') + (Camp.ready(r) ? '' : ' off') + (r.stress >= STRESS.shaky ? ' shaky' : '');
    el.appendChild(portrait(r, 56));
    el.insertAdjacentHTML('beforeend', `<div class="mi"><b>${r.name}</b><span>${RANKS[Camp.rankIdx(r)].name} · ${st.cls.name}</span>${stressBar(r)}${Camp.ready(r) ? '' : '<span class="neg">의수 · 의족 필요</span>'}</div>`);
    el.title = `${r.name} — ${r.story}`;
    return el;
  }

  // 분대: 카드 목록 + 상세 (사연 · 능력치 · 육각 스킬판)
  function squad(body) {
    body.innerHTML = `<div class="squad"><div class="cards"></div><div class="detail panel"></div></div>`;
    const cards = body.querySelector('.cards');
    if (!sel || !C.squad.some((r) => r.id === sel)) sel = C.squad[0] && C.squad[0].id;
    for (const r of C.squad) {
      const st = Camp.stats(r);
      const el = document.createElement('div');
      el.className = 'rcard' + (r.id === sel ? ' on' : '') + (Camp.points(r) > 0 ? ' pts' : '');
      el.appendChild(portrait(r, 72));
      el.insertAdjacentHTML('beforeend', `<div class="ri"><b>${r.name}</b><span>${RANKS[Camp.rankIdx(r)].name} · ${st.cls.name}</span>${stressBar(r)}<div>${traitChips(r)}</div>${Camp.points(r) > 0 ? `<span class="pt">스킬 ${Camp.points(r)}점</span>` : ''}</div>`);
      el.onclick = () => { sel = r.id; render(); };
      cards.appendChild(el);
    }
    const r = C.squad.find((q) => q.id === sel);
    if (r) detail(body.querySelector('.detail'), r);
  }
  function detail(box, r) {
    const st = Camp.stats(r);
    const rank = RANKS[Camp.rankIdx(r)], next = RANKS[Camp.rankIdx(r) + 1];
    box.innerHTML = `<div class="dh"><div class="big"></div><div>
        <h2>${rank.name} ${r.name}</h2>
        <div class="cls">${st.cls.name} <span class="dim">— ${st.cls.desc}</span></div>
        <div class="dim">${r.home} 출신 · 출전 ${r.missions} · 처치 ${r.kills} · 경험 ${r.xp}${next ? ` / ${next.xp}` : ''}</div>
        <p class="story">“${r.story}”</p>
        <div>${traitChips(r)}</div>
        <div class="stress">스트레스 ${stressBar(r)} <span>${r.stress}</span></div>
        <div>${status(r)}</div>
        ${r.lost && r.lost.length ? `<button class="btn" id="lb-limb" ${C.supplies < LIMB_COST ? 'disabled' : ''}>의수 · 의족 달기 (보급품 ${LIMB_COST})</button>` : ''}
      </div></div>
      <div class="stats">${[['체력', st.hp], ['명중', st.aim], ['이동', st.mob], ['시야', '+' + st.sight], ['치명', '+' + st.crit], ['회피', st.def], ['무기', WEAPONS[st.cls.weapon].name]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      <div class="abil-list">${st.abil.map((a) => `<span class="chip" data-tip-ab="${a}">${window.ICONS && ICONS[a] ? `<img src="${UI.iconSrc(a)}" alt="">` : ''}${ABILITIES[a].name}</span>`).join('')}</div>
      <h3>스킬 벌집판 <span class="dim">— 남은 점수 ${Camp.points(r)} · 많이 찍은 갈래가 병종이 됨${r.traits.includes('psychic') ? ' · <b class="psy">영매: 지원+정찰 = 주술사</b>' : ''}</span></h3>
      <div class="hex"></div><div class="hex-tip dim">칸에 마우스를 올리면 효과</div>`;
    box.querySelector('.big').appendChild(portrait(r, 150, { full: true }));
    if ($('lb-limb')) $('lb-limb').onclick = () => { if (Camp.fitLimb(C, r)) render(); };
    hexBoard(box.querySelector('.hex'), r, box.querySelector('.hex-tip'));
  }

  // 육각 벌집판 (SVG)
  function hexBoard(box, r, tip) {
    const S = 30, NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const pos = (q, rr) => [S * 1.5 * q, S * Math.sqrt(3) * (rr + q / 2)];
    const ext = S * 1.5 * Skills.R + S * 2.6; // 바깥에 갈래 이름 자리
    svg.setAttribute('viewBox', `${-ext} ${-ext} ${ext * 2} ${ext * 2}`);
    svg.setAttribute('class', 'hexsvg');
    // 갈래 이름
    SECTORS.forEach((s, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 3, d = ext - 16;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', Math.cos(a) * d); t.setAttribute('y', Math.sin(a) * d + 4);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'sec'); t.setAttribute('fill', s.col);
      t.textContent = s.name;
      svg.appendChild(t);
    });
    const cls = Camp.classOf(r);
    for (const [k, cell] of Skills.cells) {
      const [x, y] = pos(cell.q, cell.r);
      const owned = cell.ring === 0 || r.nodes.includes(k);
      const can = Camp.points(r) > 0 && Skills.canTake(r.nodes, k);
      const pts = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i; return `${x + Math.cos(a) * (S - 2)},${y + Math.sin(a) * (S - 2)}`; }).join(' ');
      const pg = document.createElementNS(NS, 'polygon');
      pg.setAttribute('points', pts);
      const col = cell.sec.length ? SECTORS[cell.sec[0]].col : '#e8e0c8';
      const col2 = cell.sec.length === 2 ? SECTORS[cell.sec[1]].col : col;
      pg.setAttribute('class', 'cell' + (owned ? ' own' : '') + (can ? ' can' : ''));
      pg.setAttribute('style', `--c:${col};--c2:${col2}`);
      svg.appendChild(pg);
      const iconKey = cell.ring === 0 ? null : cell.fx.abil || cell.fx.perk || Object.keys(cell.fx).find((k) => typeof cell.fx[k] === 'number' && window.ICONS && ICONS[k]);
      if (iconKey && window.ICONS && ICONS[iconKey]) {
        const im = document.createElementNS(NS, 'image');
        const sz = cell.fx.abil || cell.fx.perk || cell.fx.name ? S * 1.25 : S * 0.95;
        im.setAttribute('href', UI.iconSrc(iconKey)); im.setAttribute('x', x - sz / 2); im.setAttribute('y', y - sz / 2); im.setAttribute('width', sz); im.setAttribute('height', sz);
        im.setAttribute('class', 'ci' + (owned ? ' own' : can ? ' can' : ''));
        svg.appendChild(im);
      }
      const big = cell.ring === 0;
      if (big) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y + 4); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'ct' + (owned ? ' own' : ''));
        t.textContent = cell.ring === 0 ? RAT_CLASSES[cls].name.slice(0, 3) : (cell.fx.name || '').slice(0, 4);
        svg.appendChild(t);
      }
      const desc = cell.ring === 0 ? `현재 병종: ${RAT_CLASSES[cls].name}` : `${cell.sec.map((s) => SECTORS[s].name).join(' + ')} — ${Skills.fxText(cell.fx)}`;
      pg.addEventListener('mouseenter', () => { tip.textContent = desc + (can ? ' (클릭해서 찍기)' : owned ? ' ✓' : ''); });
      const head = `<div class='tn'>${cell.ring === 0 ? '신병' : cell.fx.name || cell.sec.map((s) => SECTORS[s].name).join(' + ')}</div><div class='tk'>${cell.sec.map((s) => SECTORS[s].name).join(' + ')} 갈래 · ${cell.ring}번째 고리</div>`;
      const body = cell.fx.abil ? UI.tipHTML(cell.fx.abil) : `<div class='td'>${desc}</div>`;
      pg.dataset.tipHtml = `${cell.fx.abil ? '' : head}${body}<div class='${can ? 'tags' : 'tk'}' style='margin-top:6px'>${owned ? '✓ 찍음' : can ? "<span class='tag cnt'>클릭해서 찍기</span>" :'이웃한 칸을 먼저 찍어야 함'}</div>`;
      if (can) pg.addEventListener('click', () => {
        const before = Camp.classOf(r);
        if (Camp.takeNode(C, r, k)) {
          const after = Camp.classOf(r);
          if (after !== before) toast(`${r.name} — ${RAT_CLASSES[after].name}(으)로 길이 정해졌다!`);
          render();
        }
      });
    }
    box.appendChild(svg);
  }

  // 모집
  function recruit(body) {
    body.innerHTML = `<div class="recruit"><div class="rhead"><p>보급품 ${RECRUIT_COST}로 지원자를 받습니다. 분대 최대 ${SQUAD_MAX}마리. 지금 ${C.squad.length}마리.</p>
      <button class="btn" id="lb-ref" ${C.supplies < REFRESH_COST ? 'disabled' : ''}>다른 지원자 (보급품 ${REFRESH_COST})</button></div><div class="cands"></div></div>`;
    const box = body.querySelector('.cands');
    C.recruits.forEach((r, i) => {
      const el = document.createElement('div');
      el.className = 'cand panel';
      el.appendChild(portrait(r, 150, { full: true }));
      el.insertAdjacentHTML('beforeend', `<h2>${r.name}</h2><div class="dim">${r.home} 출신</div><p class="story">“${r.story}”</p><div>${traitChips(r)}</div>
        <div class="dim">${r.traits.map((t) => TRAITS[t].desc).join(' / ')}</div>
        <button class="btn" ${C.supplies < RECRUIT_COST || C.squad.length >= SQUAD_MAX ? 'disabled' : ''}>모집 (보급품 ${RECRUIT_COST})</button>`);
      el.querySelector('button').onclick = () => { if (Camp.recruit(C, i)) { toast(`${r.name} 입대`); render(); } };
      box.appendChild(el);
    });
    $('lb-ref').onclick = () => { if (Camp.refresh(C)) render(); };
  }

  // 추모비
  function memorial(body) {
    if (!C.fallen.length) { body.innerHTML = '<div class="memorial empty"><p>아직 이름이 새겨지지 않았다.</p></div>'; return; }
    body.innerHTML = '<div class="memorial"><h2>추모비</h2><div class="stones"></div></div>';
    const box = body.querySelector('.stones');
    for (const f of [...C.fallen].reverse()) {
      const el = document.createElement('div');
      el.className = 'stone';
      el.appendChild(portrait(f, 64, { dead: true }));
      el.insertAdjacentHTML('beforeend', `<div><b>${f.rank} ${f.name}</b> <span class="dim">${f.cls} · ${f.home} 출신</span>
        <div class="dim">${f.died} — ${f.how} · 출전 ${f.missions + 1} · 처치 ${f.kills}</div><div class="story">“${f.story}”</div></div>`);
      box.appendChild(el);
    }
  }

  function toast(t) {
    const el = $('lb-toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // 출격 → 전투
  function go(m) {
    Camp.save(C);
    hide();
    Music.play('battle');
    View.reset();
    startBattle(m, C.deploy);
    UI.restart(true);
  }
  function show() {
    $('lobby').style.display = 'flex';
    document.body.classList.add('in-lobby');
    Music.play('lobby');
    render();
  }
  function hide() { $('lobby').style.display = 'none'; document.body.classList.remove('in-lobby'); }

  function init() {
    for (const b of document.querySelectorAll('#lobby .tab')) b.onclick = () => { tab = b.dataset.tab; render(); };
    $('lb-reset').onclick = () => { if (confirm('분대 기록을 지우고 처음부터 시작할까요?')) { Camp.reset(); sel = null; pickMission = null; render(); } };
  }
  return { show, hide, init, render, portrait };
})();

// ── 배경음: 로비 · 전투 (art/audio/*.mp3 가 있으면) ──
const Music = (() => {
  const tracks = {};
  let cur = null, vol = 0.45;
  function el(name) {
    if (tracks[name] !== undefined) return tracks[name];
    const src = (window.__ASSETS && window.__ASSETS['../art/audio/' + name + '.mp3']) || '../art/audio/' + name + '.mp3';
    const a = new Audio(src);
    a.loop = true; a.volume = 0;
    a.onerror = () => { tracks[name] = null; };
    return (tracks[name] = a);
  }
  function fadeTo(a, v, ms, done) {
    const from = a.volume, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); a.volume = from + (v - from) * k; if (k < 1) requestAnimationFrame(step); else if (done) done(); };
    step();
  }
  function play(name) {
    if (cur === name) return;
    const old = cur && tracks[cur];
    if (old) fadeTo(old, 0, 700, () => old.pause());
    cur = name;
    const a = el(name);
    if (!a) return;
    a.currentTime = 0;
    a.play().then(() => fadeTo(a, vol, 900)).catch(() => {
      // 자동 재생이 막히면 첫 클릭 때
      const once = () => { window.removeEventListener('pointerdown', once); if (cur === name) a.play().then(() => fadeTo(a, vol, 900)).catch(() => {}); };
      window.addEventListener('pointerdown', once);
    });
  }
  function setVol(v) { vol = v; if (cur && tracks[cur]) tracks[cur].volume = v; }
  return { play, setVol };
})();
