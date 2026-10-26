// 리그 뷰어: 캐릭터를 골라 동작을 크게 재생 (왼쪽 = 원본 기본 자세, 가운데 = 동작, 오른쪽 = 반전 · 작게)
(async function () {
  const $ = (s) => document.querySelector(s);
  const M = window.MOTIONS, D = window.DATA;
  const all = { ...D.CLASSES, ...D.ENEMIES };
  const ids = Object.keys(window.RIGS);
  const rigs = {}, frames = {};
  await Promise.all(ids.map((id) => new Rig(window.RIGS[id], `../art/${id}/`).load().then((r) => (rigs[id] = r))));
  for (const id of ids) {
    const A = window.ANIMS[id]?.death;
    if (A) frames[id] = await Promise.all(A.frames.map((f) => loadImage(`../art/${id}/${f.img}`)));
  }
  const nameOf = (id) => Object.values(all).find((c) => c.art === id)?.name || id;
  const weaponOf = (id) => Object.values(all).find((c) => c.art === id)?.weapon || 'swing';
  $('#who').innerHTML = ids.map((id) => `<option value="${id}">${nameOf(id)}</option>`).join('');
  const qs = new URLSearchParams(location.search);
  if (qs.has('who')) $('#who').value = qs.get('who');
  let motion = qs.get('m') || 'idle', t = 0;
  const freeze = qs.has('t') ? Number(qs.get('t')) : null;
  const keys = [...Object.keys(M).filter((k) => k !== 'rest'), 'death'];
  $('#bar').innerHTML = keys.map((k) => `<button data-m="${k}">${k === 'death' ? '쓰러짐 (통그림)' : M[k].label}</button>`).join(' ');
  document.querySelectorAll('#bar button').forEach((b) => b.addEventListener('click', () => { motion = b.dataset.m; t = 0; }));
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const pose = (m, tt, w) => M[m].f(tt, w);
  function drawAnim(id, tt, x, y, h, flip) {
    const A = window.ANIMS[id].death, T = A.times;
    let i = 0, acc = 0;
    while (i < T.length - 1 && T[i] > 0 && tt >= acc + T[i]) { acc += T[i]; i++; }
    const f = A.frames[i], k = h / rigs[id].height;
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -k : k, k);
    ctx.drawImage(frames[id][i], -f.pivot[0], -f.pivot[1], f.w, f.h); ctx.restore();
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const id = $('#who').value, w = weaponOf(id), rig = rigs[id];
    t = freeze != null ? freeze : t + dt * Number($('#speed').value);
    const m = M[motion];
    if (motion === 'death' ? t > 2.6 : (m && !m.loop && t > m.dur(w) + 0.4)) t = 0;
    document.querySelectorAll('#bar button').forEach((b) => b.classList.toggle('on', b.dataset.m === motion));
    ctx.clearRect(0, 0, cv.width, cv.height);
    const gy = 700, H = 560;
    for (const x of [300, 860, 1360]) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, gy, 130, 20, 0, 0, Math.PI * 2); ctx.fill(); }
    rig.draw(ctx, pose('rest', 0, w), 300, gy, H, false, { bones: $('#bones').checked });
    if (motion === 'death') { drawAnim(id, t, 860, gy, H, false); drawAnim(id, t, 1360, gy, H * 0.6, true); }
    else {
      rig.draw(ctx, pose(motion, t, w), 860, gy, H, false, { bones: $('#bones').checked });
      rig.draw(ctx, pose(motion, t, w), 1360, gy, H * 0.6, true, { filter: 'hue-rotate(200deg) saturate(.7) brightness(.8)' });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})().catch((e) => { document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#f66">${e.stack || e}</pre>`); });
