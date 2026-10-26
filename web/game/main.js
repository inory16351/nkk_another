// 기사 쥐 외전 — 화면 흐름: 타이틀 → 거점 → 지도 → 편성 → 전투 → 결과
(async function () {
  const D = window.DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const cv = $('#cv'), ctx = cv.getContext('2d'), ui = $('#ui'), wrap = $('#wrap');
  const SAVE_KEY = 'nkk_another_save_v1';

  // 화면 맞춤 (1600×900 고정 → 창 크기에 맞게)
  function fit() {
    const k = Math.min(innerWidth / 1600, innerHeight / 900);
    wrap.style.transform = `scale(${k}) translate(-50%, -50%)`;
    wrap.style.left = '50%'; wrap.style.top = '50%';
    wrap.style.transformOrigin = '0 0';
    wrap.style.transform = `translate(-50%, -50%) scale(${k})`;
    wrap.style.transformOrigin = '50% 50%';
  }
  addEventListener('resize', fit); fit();
  const mouse = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 1600 / r.width, (e.clientY - r.top) * 900 / r.height]; };

  // ───────── 그림 불러오기
  const G = { img: {}, rigs: {}, anims: {}, ui: null };
  const jobs = [];
  const load = (key, src) => jobs.push(loadImage(src).then((im) => (G.img[key] = im)));
  for (const [id, data] of Object.entries(window.RIGS)) jobs.push(new Rig(data, `../art/${id}/`).load().then((r) => (G.rigs[id] = r)));
  for (const [id, A] of Object.entries(window.ANIMS || {})) {
    if (!A.death) continue;
    G.anims[id] = A.death;
    A.death.frames.forEach((f, i) => load(`anim:${id}:${i}`, `../art/${id}/${f.img}`));
  }
  for (let i = 1; i <= 5; i++) load('stage:stage' + i, `../art/stages/stage${i}.png`);
  load('base:bg', '../art/base/base_bg.png'); load('base:map', '../art/base/worldmap.png');
  for (let i = 0; i < 6; i++) load('base:b' + i, `../art/base/b/${i}.png`);
  for (const n of ['arrow', 'fireball', 'ring', 'heart', 'slash', 'star']) load('fx:' + n, `../art/fx/${n}.png`);
  load('fx:bolt', '../art/fx/bolt_a.png');
  for (const k of ['hit', 'explosion', 'zap', 'poof']) for (let i = 1; i <= 6; i++) load(`fx:${k}_${i}`, `../art/fx/${k}_${i}.png`);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1600, 900);
  ctx.fillStyle = '#fff'; ctx.font = '28px "Malgun Gothic"'; ctx.textAlign = 'center'; ctx.fillText('불러오는 중…', 800, 450);
  await Promise.all(jobs);

  // ───────── 저장
  let S = null;
  const newMember = (cls, name) => ({ id: cls === 'knight' ? 'knight' : 'm' + (S.nextId++), cls, name, rank: 1, xp: 0, picks: [], gear: 0, morale: 70, injured: 0, alive: true });
  function newGame() {
    S = { cheese: 120, scrap: 0, medal: 0, squadMax: 4, cleared: [], roster: [], nextId: 1 };
    S.roster.push(newMember('knight', '기사 쥐'), newMember('lancer', '보리'), newMember('archer', '도토리'), newMember('priest', '모카'));
    save();
  }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 못 해도 진행 */ } };
  function loadSave() { try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  const alive = () => S.roster.filter((m) => m.alive);
  const rankFromXp = (xp) => { let r = 1; for (let i = 2; i < D.RANK_XP.length; i++) if (xp >= D.RANK_XP[i]) r = i; return r; };
  const pending = (m) => Math.max(0, (m.rank - 1) - m.picks.length);

  // ───────── UI 도우미
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const clearUI = () => { ui.innerHTML = ''; };
  const icon = (n) => `<img src="${(window.__ASSETS && window.__ASSETS['../art/ui/' + n + '.png']) || '../art/ui/' + n + '.png'}" alt="">`;
  const resBar = () => ui.appendChild(el(`<div class="res"><span>${icon('ic_cheese')} 치즈 <b>${S.cheese}</b></span><span>${icon('ic_scrap')} 고철 <b>${S.scrap}</b></span><span>${icon('ic_medal')} 훈장 <b>${S.medal}</b></span></div>`));
  const statLine = (cls, m) => {
    const c = D.CLASSES[cls], b = { ...c.base };
    if (m) { for (const k of Object.keys(c.grow)) b[k] += c.grow[k] * (m.rank - 1); b.atk += m.gear; b.def += m.gear * 4; }
    return `<div class="stats"><span>체력 <b>${b.hp}</b></span><span>공격 <b>${b.atk}</b></span><span>방어 <b>${b.def}</b></span><span>치명 <b>${b.crit}%</b></span><span>이동 <b>${b.move}</b></span><span>명중 <b>${b.aim}</b></span><span>회피 <b>${b.eva}</b></span><span>치명피해 <b>${b.critDmg}%</b></span><span>방무 <b>${b.pen}%</b></span></div>`;
  };
  const skillCard = (s, cls = '') => { const k = D.SKILLS[s]; return `<div class="sk ${cls}" data-s="${s}"><b>${k.name}${k.cost ? ` <span class="tag">${k.cost === 'bonus' ? '보조' : '행동'}${k.cd ? ' · 쿨 ' + k.cd : ''}</span>` : ' <span class="tag gold">지속</span>'}</b>${k.desc || ''}</div>`; };
  function treeHtml(m, pickable) {
    const c = D.CLASSES[m.cls];
    let h = `<div class="tree"><div class="rk">기본</div>${skillCard(c.attack, 'on')}${skillCard(c.signature, 'on')}`;
    c.tree.forEach((pair, i) => {
      const rank = i + 2, chosen = m.picks[i];
      h += `<div class="rk">${D.RANK_NAME[rank]}</div>`;
      for (const s of pair) {
        let cl = chosen ? (chosen === s ? 'on' : 'off') : (m.rank >= rank && pickable && m.picks.length === i ? 'pick' : 'off');
        h += skillCard(s, cl);
      }
    });
    return h + '</div>';
  }
  function bindPicks(root, m, after) {
    root.querySelectorAll('.sk.pick').forEach((d) => d.addEventListener('click', () => { m.picks.push(d.dataset.s); save(); after(); }));
  }
  function panel(html, cls = 'center', style = '') {
    const p = el(`<div class="panel ${cls}" style="${style}"><button class="close">닫기</button>${html}</div>`);
    p.querySelector('.close').addEventListener('click', () => p.remove());
    ui.appendChild(p);
    return p;
  }

  // ───────── 장면
  let scene = null, hoverB = -1, battle = null;
  const BLD = [ // 거점 건물 자리 (발밑 가운데) · 크기
    { x: 260, y: 600, w: 300 }, { x: 600, y: 560, w: 270 }, { x: 960, y: 560, w: 280 },
    { x: 1300, y: 600, w: 260 }, { x: 470, y: 840, w: 300 }, { x: 1150, y: 840, w: 280 },
  ];
  const baseChars = []; // 거점에서 서성이는 대원

  function goTitle() {
    scene = 'title'; clearUI();
    const has = !!loadSave();
    const d = el(`<div class="title"><h1>기사 쥐 외전</h1><p>원탁의 막내 기사, 쥐 왕국을 지켜라</p><div class="btns">${has ? '<button class="primary" id="tContinue">이어하기</button>' : ''}<button ${has ? '' : 'class="primary"'} id="tNew">새로 시작</button></div></div>`);
    ui.appendChild(d);
    if (has) $('#tContinue').addEventListener('click', () => { S = loadSave(); goBase(); });
    $('#tNew').addEventListener('click', () => { newGame(); goBase(); });
  }

  function goBase() {
    scene = 'base'; clearUI(); resBar();
    baseChars.length = 0;
    alive().slice(0, 6).forEach((m, i) => baseChars.push({ m, x: 690 + i * 70, y: 700 + (i % 2) * 24, face: i % 2 ? -1 : 1, p: new BattlePlayer() }));
    D.BUILDINGS.forEach((b, i) => ui.appendChild(el(`<div class="bld-label" style="left:${BLD[i].x}px;top:${BLD[i].y + 6}px">${b.name}</div>`)));
    const rb = el('<button style="position:absolute;left:18px;top:14px;font-size:16px">📜 대원 명부</button>');
    rb.addEventListener('click', () => rosterPanel());
    ui.appendChild(rb);
    const warn = alive().filter((m) => pending(m) > 0).length;
    if (warn) ui.appendChild(el(`<div style="position:absolute;left:150px;top:20px;color:#ffd65a;font-weight:700">새 스킬을 고를 대원 ${warn}명 (명부에서 선택)</div>`));
  }
  function refreshBase() { const keep = [...ui.querySelectorAll('.panel')].length; goBase(); return keep; }

  function rosterPanel(selId) {
    const list = alive();
    const sel = list.find((m) => m.id === selId) || list[0];
    const p = panel(`<h2>대원 명부</h2><div class="sub">분대 최대 ${S.squadMax}명 · 계급이 오르면 스킬 둘 중 하나를 고름 (엑스컴식)</div>
      <div style="display:flex;gap:16px"><div class="list" style="width:330px">${list.map((m) => `<div class="row ${m === sel ? 'sel' : ''}" data-id="${m.id}"><div class="grow"><div class="nm">${m.name}${m.cls === 'knight' ? '<span class="tag gold">주인공</span>' : ''}${pending(m) ? '<span class="tag gold">스킬 선택!</span>' : ''}${m.injured ? '<span class="tag red">부상</span>' : ''}</div><div class="meta">${D.CLASSES[m.cls].name} · ${D.RANK_NAME[m.rank]} · 경험 ${m.xp} · 사기 ${m.morale}</div></div></div>`).join('')}</div>
      <div style="width:700px"><h2 style="font-size:20px">${sel.name} <span class="tag">${D.CLASSES[sel.cls].name}</span> <span class="tag">${D.RANK_NAME[sel.rank]}</span> <span class="tag">장비 +${sel.gear}</span></h2>${statLine(sel.cls, sel)}${treeHtml(sel, true)}</div></div>`, 'center', 'width:1100px');
    p.querySelectorAll('.row').forEach((r) => r.addEventListener('click', () => { p.remove(); rosterPanel(r.dataset.id); }));
    bindPicks(p, sel, () => { p.remove(); goBase(); rosterPanel(sel.id); });
  }

  function buildingPanel(i) {
    const b = D.BUILDINGS[i];
    if (b.id === 'gate') { goMap(); return; }
    let html = `<h2>${b.name}</h2><div class="sub">${b.desc}</div>`;
    let after = null;
    if (b.id === 'training') {
      html += `<div class="list">${D.RECRUITABLE.map((cls) => { const c = D.CLASSES[cls]; return `<div class="row"><div class="grow"><div class="nm">${c.name} <span class="tag">${c.title}</span></div>${statLine(cls)}<div class="meta" style="margin-top:4px">고유: ${D.SKILLS[c.signature].name} — ${D.SKILLS[c.signature].desc}</div></div><button class="gold" data-cls="${cls}" ${S.cheese < D.COSTS.recruit || alive().length >= 10 ? 'disabled' : ''}>영입 🧀${D.COSTS.recruit}</button></div>`; }).join('')}</div><div class="sub" style="margin-top:8px">기사 쥐는 스토리 고유 캐릭터라 영입할 수 없음 · 대원 최대 10명</div>`;
      after = (p) => p.querySelectorAll('button[data-cls]').forEach((bt) => bt.addEventListener('click', () => {
        S.cheese -= D.COSTS.recruit;
        const used = new Set(S.roster.map((m) => m.name));
        const name = D.NAMES.find((n) => !used.has(n)) || '쥐' + S.nextId;
        const m = newMember(bt.dataset.cls, name); S.roster.push(m); save();
        p.remove(); goBase(); buildingPanel(i);
        toast(`${name} (${D.CLASSES[m.cls].name}) 입단!`);
      }));
    } else if (b.id === 'smithy') {
      html += `<div class="list">${alive().map((m) => { const c = D.COSTS.smith(m.gear); return `<div class="row"><div class="grow"><div class="nm">${m.name} <span class="tag">장비 +${m.gear}</span></div><div class="meta">${D.CLASSES[m.cls].name} · 강화마다 공격 +1 · 방어 +4</div></div><button class="gold" data-id="${m.id}" ${m.gear >= 3 || S.cheese < c.cheese || S.scrap < c.scrap ? 'disabled' : ''}>${m.gear >= 3 ? '최대' : `강화 🧀${c.cheese} ⚙${c.scrap}`}</button></div>`; }).join('')}</div>`;
      after = (p) => p.querySelectorAll('button[data-id]').forEach((bt) => bt.addEventListener('click', () => {
        const m = S.roster.find((x) => x.id === bt.dataset.id), c = D.COSTS.smith(m.gear);
        S.cheese -= c.cheese; S.scrap -= c.scrap; m.gear++; save(); p.remove(); goBase(); buildingPanel(i);
      }));
    } else if (b.id === 'tavern') {
      html += `<div class="list">${alive().map((m) => `<div class="row"><div class="grow"><div class="nm">${m.name}</div><div class="meta">사기 ${m.morale} ${m.morale >= 80 ? '(고양: 명중 · 치명 +10)' : m.morale < 40 ? '(저하)' : ''}</div></div></div>`).join('')}</div><div class="btns"><button class="gold" id="tvBuy" ${S.cheese < D.COSTS.tavern ? 'disabled' : ''}>치즈 한 바퀴 돌리기 🧀${D.COSTS.tavern} (전원 사기 80)</button></div>`;
      after = (p) => $('#tvBuy', p).addEventListener('click', () => { S.cheese -= D.COSTS.tavern; for (const m of alive()) m.morale = Math.max(m.morale, 80); save(); p.remove(); goBase(); buildingPanel(i); toast('치즈 파티! 모두 기운이 난다'); });
    } else if (b.id === 'chapel') {
      const inj = alive().filter((m) => m.injured);
      html += inj.length ? `<div class="list">${inj.map((m) => `<div class="row"><div class="grow"><div class="nm">${m.name} <span class="tag red">부상</span></div><div class="meta">다음 출격에 나갈 수 없음</div></div><button class="gold" data-id="${m.id}" ${S.cheese < D.COSTS.chapel ? 'disabled' : ''}>치료 🧀${D.COSTS.chapel}</button></div>`).join('')}</div>` : '<div class="sub">부상당한 대원이 없다.</div>';
      const dead = S.roster.filter((m) => !m.alive);
      if (dead.length) html += `<div class="sub" style="margin-top:12px">추모비: ${dead.map((m) => m.name).join(', ')}</div>`;
      after = (p) => p.querySelectorAll('button[data-id]').forEach((bt) => bt.addEventListener('click', () => { const m = S.roster.find((x) => x.id === bt.dataset.id); S.cheese -= D.COSTS.chapel; m.injured = 0; save(); p.remove(); goBase(); buildingPanel(i); }));
    } else if (b.id === 'warroom') {
      const next = S.squadMax + 1, need = D.COSTS.warroom[next];
      html += `<div class="sub">지금 분대 인원: <b>${S.squadMax}명</b></div>${next <= 6 ? `<div class="btns"><button class="gold" id="wrUp" ${S.medal < need || S.cheese < 100 ? 'disabled' : ''}>분대 ${next}명으로 늘리기 🎖${need} 🧀100</button></div>` : '<div class="sub">최대 인원</div>'}`;
      after = (p) => $('#wrUp', p)?.addEventListener('click', () => { S.medal -= need; S.cheese -= 100; S.squadMax = next; save(); p.remove(); goBase(); buildingPanel(i); });
    }
    const p = panel(html, 'center', 'width:760px');
    after && after(p);
  }
  function toast(t) { const d = el(`<div class="panel" style="left:50%;top:90px;transform:translateX(-50%);padding:10px 20px;font-weight:700">${t}</div>`); ui.appendChild(d); setTimeout(() => d.remove(), 1800); }

  // 지도
  function goMap() {
    scene = 'map'; clearUI(); resBar();
    const back = el('<button style="position:absolute;left:18px;top:14px;font-size:16px">← 거점으로</button>');
    back.addEventListener('click', goBase); ui.appendChild(back);
    D.STAGES.forEach((st, i) => {
      const open = i === 0 || S.cleared.includes(D.STAGES[i - 1].id);
      const done = S.cleared.includes(st.id);
      const n = el(`<div class="node" style="left:${st.map[0] * 1600}px;top:${st.map[1] * 900}px"><button class="${open ? (st.boss ? 'primary' : 'gold') : 'lock'}" ${open ? '' : 'disabled'}>${st.id}. ${st.name}${done ? ' ✓' : ''}</button></div>`);
      n.querySelector('button').addEventListener('click', () => stagePanel(st));
      ui.appendChild(n);
    });
  }
  function stagePanel(st) {
    const done = S.cleared.includes(st.id);
    const ens = {}; for (const [k] of st.enemies) ens[k] = (ens[k] || 0) + 1;
    const r = st.reward, mul = done ? 0.5 : 1;
    const ready = alive().filter((m) => !m.injured);
    const pick = new Set(ready.filter((m) => m.cls === 'knight').map((m) => m.id));
    for (const m of ready) if (pick.size < S.squadMax) pick.add(m.id);
    const p = panel(`<h2>${st.id}. ${st.name}</h2><div class="sub">${st.desc}</div>
      <div class="sub">적: ${Object.entries(ens).map(([k, n]) => `${D.ENEMIES[k].name} ×${n}`).join(' · ')}</div>
      <div class="sub">보상: 🧀${Math.round(r.cheese * mul)} ⚙${Math.round(r.scrap * mul)} 🎖${done ? 0 : r.medal}${done ? ' (다시 하기: 절반)' : ''}</div>
      <h2 style="font-size:18px;margin-top:10px">분대 편성 (<span id="cnt"></span>/${S.squadMax})</h2>
      <div class="list" id="sq" style="max-height:330px">${alive().map((m) => `<div class="row ${m.injured ? '' : ''}" data-id="${m.id}"><input type="checkbox" ${pick.has(m.id) ? 'checked' : ''} ${m.injured || m.cls === 'knight' ? 'disabled' : ''}><div class="grow"><div class="nm">${m.name}${m.cls === 'knight' ? '<span class="tag gold">필수</span>' : ''}${m.injured ? '<span class="tag red">부상</span>' : ''}</div><div class="meta">${D.CLASSES[m.cls].name} · ${D.RANK_NAME[m.rank]} · 사기 ${m.morale}</div></div></div>`).join('')}</div>
      <div class="btns"><button class="primary" id="go">출격!</button></div>`, 'center', 'width:640px');
    const cnt = () => { const n = p.querySelectorAll('#sq input:checked').length; $('#cnt', p).textContent = n; $('#go', p).disabled = n === 0 || n > S.squadMax; };
    p.querySelectorAll('#sq input').forEach((c) => c.addEventListener('change', cnt)); cnt();
    $('#go', p).addEventListener('click', () => {
      const ids = [...p.querySelectorAll('#sq input:checked')].map((c) => c.closest('.row').dataset.id);
      const squad = ids.map((id) => S.roster.find((m) => m.id === id));
      squad.sort((a, b) => (a.cls === 'knight' ? -1 : b.cls === 'knight' ? 1 : 0));
      startBattle(st, squad);
    });
  }

  // 전투
  function startBattle(st, squad) {
    scene = 'battle'; clearUI();
    battle = new Battle(G, st, squad);
    battle.squad = squad;
  }
  G.battleEnd = function (b) {
    const win = b.result.win, st = b.stage, done = S.cleared.includes(st.id);
    const lines = [];
    const rw = { cheese: 0, scrap: 0, medal: 0 };
    if (win) {
      const mul = done ? 0.5 : 1;
      rw.cheese = Math.round(st.reward.cheese * mul); rw.scrap = Math.round(st.reward.scrap * mul); rw.medal = done ? 0 : st.reward.medal;
      S.cheese += rw.cheese; S.scrap += rw.scrap; S.medal += rw.medal;
      if (!done) S.cleared.push(st.id);
    }
    for (const m of b.squad) {
      const u = b.units.find((x) => x.member === m);
      let died = u.status === 'dead' || (!win && m.cls !== 'knight');
      if (!win && m.cls !== 'knight') died = true;  // 패배: 기사 쥐 외 출격 대원 전원 상실
      if (died) { m.alive = false; lines.push(`<div class="row"><div class="grow"><div class="nm">${m.name} <span class="tag red">전사</span></div></div></div>`); continue; }
      const kills = b.kills[u.id] || 0;
      const gain = 2 + kills * 3 + (win ? 2 : 0);
      const oldRank = m.rank;
      m.xp += gain; m.rank = rankFromXp(m.xp);
      m.morale = Math.max(0, Math.min(100, u.morale + (win ? 5 : -15)));
      m.injured = u.status === 'down' || u.hp < u.max * 0.35 ? 1 : 0;
      lines.push(`<div class="row"><div class="grow"><div class="nm">${m.name} <span class="tag">${D.RANK_NAME[m.rank]}</span>${m.rank > oldRank ? '<span class="tag gold">계급 상승!</span>' : ''}${m.injured ? '<span class="tag red">부상</span>' : ''}</div><div class="meta">경험 +${gain} (처치 ${kills}) · 사기 ${m.morale}</div></div></div>`);
    }
    save();
    clearUI();
    const ups = b.squad.filter((m) => m.alive && pending(m) > 0);
    const p = panel(`<h2>${win ? '승리!' : '패배…'}</h2><div class="sub">${win ? `보상: 🧀${rw.cheese} ⚙${rw.scrap} 🎖${rw.medal}` : '기사 쥐는 간신히 거점으로 돌아왔다. 함께 나간 대원들은 돌아오지 못했다…'}</div>
      <div class="list">${lines.join('')}</div>${ups.length ? `<div class="sub" style="margin-top:10px;color:#ffd65a">계급이 오른 대원은 새 스킬을 골라야 한다 (명부에서도 가능)</div><div id="ups"></div>` : ''}
      <div class="btns"><button class="primary" id="back">거점으로</button></div>`, 'center', 'width:820px');
    p.querySelector('.close').remove();
    const drawUps = () => {
      const box = $('#ups', p); if (!box) return;
      box.innerHTML = ups.filter((m) => pending(m) > 0).map((m) => `<div style="margin-top:8px"><b>${m.name}</b> — ${D.RANK_NAME[m.picks.length + 2]} 스킬 선택${treeHtml(m, true)}</div>`).join('');
      box.querySelectorAll('.sk.pick').forEach((d) => d.addEventListener('click', () => {
        const name = d.closest('div[style]').querySelector('b').textContent;
        const m = ups.find((x) => x.name === name); m.picks.push(d.dataset.s); save(); drawUps();
      }));
    };
    drawUps();
    $('#back', p).addEventListener('click', () => { battle = null; goBase(); });
  };

  // ───────── 전투 UI
  G.ui = {
    log(lines) { const d = $('#log'); if (d) d.innerHTML = lines.map((l) => `<div>${l}</div>`).join(''); },
    battleHud(b) {
      if (!$('#turn')) {
        ui.appendChild(el('<div id="turn"></div>'));
        ui.appendChild(el('<div id="log"></div>'));
        ui.appendChild(el('<div id="tip"></div>'));
        const sb = el('<div id="skillbar"></div>'); ui.appendChild(sb);
        const be = el('<button id="btEnd" class="primary">턴 종료</button>'); be.addEventListener('click', () => b.endTurn()); ui.appendChild(be);
        const rt = el('<button style="position:absolute;left:18px;top:14px">후퇴 (패배 처리)</button>');
        rt.addEventListener('click', () => { if (confirm('후퇴하면 패배로 처리되어 기사 쥐 외 출격 대원을 잃습니다. 후퇴할까요?')) b.finish(false); });
        ui.appendChild(rt);
      }
      $('#turn').style.display = 'block'; $('#log').style.display = 'block';
      $('#turn').textContent = `${b.turn}턴 · ${b.phase === 'ally' ? '아군 차례' : '적 차례'} · ${b.stage.name}`;
      $('#btEnd').style.display = b.phase === 'ally' ? 'block' : 'none';
    },
    skillbar(b, u) {
      const sb = $('#skillbar'); if (!sb) return;
      if (!u || b.phase !== 'ally') { sb.style.display = 'none'; return; }
      sb.style.display = 'flex';
      const list = [...u.skills];
      if (b.targets(u, 'rescue').length) list.push('rescue');
      sb.innerHTML = `<div class="who"><b>${u.name}</b><small>${D.CLASSES[u.kind].name} · 체력 ${u.hp}/${u.max}</small><small>이동 ${u.move} · 행동 ${u.act ? '●' : '○'} · 보조 ${u.bonus ? '●' : '○'}</small><small>사기 ${u.morale}</small></div>` +
        list.map((s) => { const k = D.SKILLS[s], ok = b.usable(u, s) && (k.kind !== 'rescue' || b.targets(u, s).length); const cd = u.cds[s] || 0; return `<button class="sbtn ${b.mode === s ? 'on' : ''}" data-s="${s}" ${ok ? '' : 'disabled'} title="${k.desc || ''}">${k.name}<small>${k.cost === 'bonus' ? '보조' : '행동'}${k.cd ? ' · 쿨 ' + k.cd : ''}${cd > 1 ? ` <span class="cd">(${cd - 1}턴)</span>` : ''}</small><small>${k.desc || ''}</small></button>`; }).join('') +
        `<button class="sbtn" data-x="turn" ${u.bonus ? '' : 'disabled'}>방향 돌리기<small>보조</small><small>등 뒤를 내주지 않게</small></button><button class="sbtn" data-x="end">이 대원 끝<small>남은 행동 = 방어</small></button>`;
      sb.querySelectorAll('button[data-s]').forEach((bt) => bt.addEventListener('click', () => b.setMode(bt.dataset.s)));
      sb.querySelector('[data-x=turn]').addEventListener('click', () => { u.face *= -1; u.bonus = 0; G.ui.skillbar(b, u); });
      sb.querySelector('[data-x=end]').addEventListener('click', () => { if (u.act) u.guarding = true; b.endUnit(u); });
    },
    tip(b, mx, my) {
      const tip = $('#tip'); if (!tip) return;
      const h = b.hover, v = h && b.at(h.r, h.c);
      if (!v || b.busy) { tip.style.display = 'none'; return; }
      let html = `<b>${v.name}</b><br>체력 ${v.hp}/${v.max} · 방어 ${Math.round(b.stat(v, 'def'))} · 회피 ${b.stat(v, 'eva')}`;
      const u = b.sel;
      if (u && v.side !== u.side && b.phase === 'ally') {
        const s = b.mode || u.skills[0], sk = D.SKILLS[s];
        if (sk.kind === 'attack' || sk.kind === 'aoe') {
          const o = b.odds(u, v, s);
          const dmg = b.damage(u, v, s, false);
          const can = b.targets(u, s).some((t) => t.unit === v || (sk.kind === 'aoe'));
          html += `<br><span style="color:#ffd65a">${sk.name}: 명중 ${o.hit}% · 치명 ${o.crit}% · 피해 약 ${dmg}</span>`;
          html += `<br><small>${o.parts.map(([n, x]) => `${n} ${x > 0 ? '+' : ''}${x}`).join(' · ')}</small>`;
          if (!can) html += '<br><small style="color:#ff9a8a">지금 자리에서는 닿지 않음</small>';
        }
      }
      tip.innerHTML = html; tip.style.display = 'block';
      tip.style.left = Math.min(1600 - 260, mx + 18) + 'px'; tip.style.top = Math.max(10, my - 80) + 'px';
    },
    cutin() {
      return new Promise(async (ok) => {
        const c = $('#cutin'); c.style.display = 'block';
        for (let i = 0; i <= 26; i++) {
          const u = i / 26, k = u < 0.25 ? 1 - u / 0.25 : u > 0.85 ? (u - 0.85) / 0.15 : 0;
          $('.face', c).style.transform = `translateX(${k * 60}%)`; $('.bgimg', c).style.transform = `translateX(${-k * 30}%)`;
          c.style.opacity = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
          await new Promise((r) => setTimeout(r, 42));
        }
        c.style.display = 'none'; ok();
      });
    },
  };

  // ───────── 입력
  cv.addEventListener('mousemove', (e) => {
    const [x, y] = mouse(e);
    if (scene === 'battle' && battle) battle.onMove(x, y);
    if (scene === 'base') { hoverB = bldAt(x, y); cv.style.cursor = hoverB >= 0 ? 'pointer' : 'default'; }
  });
  cv.addEventListener('click', (e) => {
    const [x, y] = mouse(e);
    if (scene === 'battle' && battle) battle.onClick(x, y);
    if (scene === 'base' && !ui.querySelector('.panel')) { const i = bldAt(x, y); if (i >= 0) buildingPanel(i); }
  });
  addEventListener('keydown', (e) => {
    if (scene === 'battle' && battle) {
      if (e.key === 'Escape') { battle.mode = null; battle.select(null); }
      if (e.key === ' ' || e.key === 'Enter') battle.endTurn();
    }
  });
  function bldAt(x, y) {
    for (let i = BLD.length - 1; i >= 0; i--) {
      const b = BLD[i], im = G.img['base:b' + i], h = b.w * im.height / im.width;
      if (x > b.x - b.w / 2 && x < b.x + b.w / 2 && y > b.y - h && y < b.y) return i;
    }
    return -1;
  }

  // ───────── 그리기
  function drawCover(im, dim = 0) {
    const s = Math.max(1600 / im.width, 900 / im.height);
    ctx.drawImage(im, (1600 - im.width * s) / 2, (900 - im.height * s) / 2, im.width * s, im.height * s);
    if (dim) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(0, 0, 1600, 900); }
  }
  let titlePlayer = new BattlePlayer();
  function drawBase(dt, t) {
    drawCover(G.img['base:bg']);
    const order = [0, 1, 2, 3, 4, 5];
    for (const i of order) {
      const b = BLD[i], im = G.img['base:b' + i], h = b.w * im.height / im.width;
      ctx.save();
      if (hoverB === i) { ctx.filter = 'brightness(1.18) drop-shadow(0 0 12px rgba(255,214,90,.9))'; }
      ctx.drawImage(im, b.x - b.w / 2, b.y - h, b.w, h);
      ctx.restore();
    }
    for (const c of baseChars) {
      c.p.step(dt, D.CLASSES[c.m.cls].weapon);
      const rig = G.rigs[D.CLASSES[c.m.cls].art];
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
      rig.draw(ctx, c.p.pose(D.CLASSES[c.m.cls].weapon), c.x, c.y, 110, c.face < 0);
    }
  }
  let last = performance.now(), T = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1;
    if (scene === 'title') {
      drawCover(G.img['base:bg'], 0.35);
      titlePlayer.step(dt, 'swing');
      if (titlePlayer.name === 'idle' && Math.floor(T) % 6 === 0 && T % 1 < dt) titlePlayer.set('attack');
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(800, 820, 90, 18, 0, 0, Math.PI * 2); ctx.fill();
      G.rigs.knight.draw(ctx, titlePlayer.pose('swing'), 800, 820, 330, false);
    } else if (scene === 'base') drawBase(dt, T);
    else if (scene === 'map') drawCover(G.img['base:map']);
    else if (scene === 'battle' && battle) { battle.update(dt); battle.draw(ctx, dt); }
    requestAnimationFrame(frame);
  }
  window.__game = { get S() { return S; }, get battle() { return battle; }, G, goBase, goMap, startBattle: (i) => startBattle(D.STAGES[i], alive().slice(0, S.squadMax)) };
  goTitle();
  requestAnimationFrame(frame);
})().catch((e) => { document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#f66;padding:16px;position:relative;z-index:9">${e.stack || e}</pre>`); throw e; });
