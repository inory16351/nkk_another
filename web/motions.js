// 리그 v2 동작. 동작 = f(t, w) → 자세 { root, angles, scale }  (w = 무기 종류: swing · thrust · shoot · cast · stab)
// 각도는 기본 자세(rest)에 더하는 값, + = 시계 방향. 오른쪽을 볼 때: 몸통 + = 앞으로 숙임, 팔 − = 앞 · 위로 듦
// 무기는 'world' 로 세상 기준 각도를 주면 팔 각도를 빼서 맞춤 (0 = 끝이 위, 90 = 끝이 앞)
// 쓰러짐처럼 리깅으로 힘든 동작은 통그림 컷(anims.js) — 여기 없음
(function () {
  const S = Math.sin;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;
  function track(keys, u) {
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
        return lerp(v0, v1, ease((u - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  }
  function tail(a, t, amp = 1, sp = 1.6) {
    a.tail1 = (a.tail1 || 0) + 4 * amp * S(t * sp);
    a.tail2 = (a.tail2 || 0) + 8 * amp * S(t * sp - 0.7);
    a.tail3 = (a.tail3 || 0) + 12 * amp * S(t * sp - 1.4);
  }
  // 무기를 세상 기준 각도로: 손에 들린 각도 = 목표 − 팔 각도 합 (기본 자세 무기는 세로)
  function aimWeapon(p, world) {
    const a = p.angles;
    a.weapon = world - (a.upperArm || 0) - (a.foreArm || 0) - (p.root.rot || 0) - (a.torso || 0);
  }
  // 무기 종류별 전투 대기 자세의 팔 · 무기
  const READY = {
    swing:  { upperArm: 16, foreArm: -6, world: 38 },
    thrust: { upperArm: 6, foreArm: 10, world: 78 },
    shoot:  { upperArm: -2, foreArm: 0, world: null },
    cast:   { upperArm: 4, foreArm: 0, world: 6 },
    stab:   { upperArm: 10, foreArm: -10, world: 50 },
  };

  // 전투 대기: 무릎 굽혀 낮추고 상체를 앞으로 숙임 + 숨쉬기. k = 세기
  function ready(t, w = 'swing', k = 1) {
    const b = S(t * 2.4), b2 = S(t * 2.4 - 0.6);
    const R = READY[w] || READY.swing;
    const a = {
      thighN: -12 * k, shinN: 16 * k, thighF: 10 * k, shinF: 6 * k,
      torso: 7 * k + 1.3 * b, head: -6 * k - 1.5 * b2,
      cape: -4 * k + 2 * S(t * 1.3),
      upperArm: R.upperArm * k - 2.5 * b, foreArm: R.foreArm * k,
      upperArmF: 10 * k - 2 * b, foreArmF: -25 * k,
    };
    tail(a, t, 0.8, 1.3);
    const p = { root: { dy: 7 * k + 1.2 * b }, angles: a, scale: { torso: [1 + 0.01 * b, 1 + 0.025 * b] } };
    if (R.world != null) aimWeapon(p, R.world * k);
    return p;
  }
  function add(p, angles = {}, root = {}) {
    for (const [k, v] of Object.entries(angles)) p.angles[k] = (p.angles[k] || 0) + v;
    for (const [k, v] of Object.entries(root)) p.root[k] = k === 'sx' || k === 'sy' ? (p.root[k] || 1) * v : (p.root[k] || 0) + v;
    return p;
  }

  const M = {};
  M.idle = { label: '대기', loop: true, f: (t, w) => ready(t, w) };
  M.rest = { label: '기본 자세', loop: true, f: (t, w) => ready(t, w, 0) };

  M.walk = { label: '걷기', loop: true, f(t, w) {
    const ph = t * 8;
    const p = ready(t, w, 0.5);
    add(p, {
      thighN: -24 * S(ph), thighF: 24 * S(ph),
      shinN: 28 * clamp(S(ph + 1.4), 0, 1), shinF: 28 * clamp(-S(ph + 1.4), 0, 1),
      torso: 4 + 2 * S(ph * 2), upperArmF: -14 * S(ph), cape: -8 + 5 * S(ph * 2),
    }, { dy: -6 * Math.abs(S(ph)) });
    tail(p.angles, t, 1.4, 6);
    if ((READY[w] || {}).world != null) aimWeapon(p, READY[w].world * 0.5);
    return p;
  } };

  // 공격: 무기 종류마다 다름. hitAt = 맞는 순간 (초)
  const ATTACK = {
    swing: { dur: 1.0, hitAt: 0.46, f(u, p) {
      const K = (k) => track(k, u);
      add(p, {
        upperArm: K([[0, 0], [0.38, -130], [0.5, 26], [0.64, 20], [1, 0]]),
        foreArm: K([[0, 0], [0.38, 10], [0.5, 10], [1, 0]]),
        upperArmF: K([[0, 0], [0.38, -40], [0.5, 25], [1, 0]]),
        torso: K([[0, 0], [0.38, -14], [0.5, 14], [0.7, 10], [1, 0]]),
        head: K([[0, 0], [0.38, -4], [0.5, 6], [1, 0]]),
        thighN: K([[0, 0], [0.38, 8], [0.5, -22], [0.75, -18], [1, 0]]),
        cape: K([[0, 0], [0.38, 8], [0.5, -20], [1, 0]]),
      }, { dx: K([[0, 0], [0.38, -40], [0.5, 120], [0.75, 100], [1, 0]]), dy: K([[0, 0], [0.38, -20], [0.5, 15], [1, 0]]) });
      aimWeapon(p, K([[0, 38], [0.38, -40], [0.5, 150], [0.64, 140], [1, 38]]));
    } },
    thrust: { dur: 0.9, hitAt: 0.42, f(u, p) {
      const K = (k) => track(k, u);
      add(p, {
        upperArm: K([[0, 0], [0.32, 30], [0.44, -40], [0.62, -34], [1, 0]]),
        foreArm: K([[0, 0], [0.32, 30], [0.44, -30], [1, 0]]),
        torso: K([[0, 0], [0.32, -6], [0.44, 14], [1, 0]]),
        thighN: K([[0, 0], [0.32, 6], [0.44, -24], [1, 0]]),
      }, { dx: K([[0, 0], [0.32, -50], [0.44, 150], [0.7, 130], [1, 0]]) });
      aimWeapon(p, 82);
    } },
    shoot: { dur: 0.8, hitAt: 0.3, f(u, p) {
      const K = (k) => track(k, u);
      add(p, {
        upperArm: K([[0, 0], [0.25, -8], [0.32, -22], [0.6, -6], [1, 0]]),
        torso: K([[0, 0], [0.25, -2], [0.32, -9], [1, 0]]),
        head: K([[0, 0], [0.25, 3], [0.32, -4], [1, 0]]),
      }, { dx: K([[0, 0], [0.3, 0], [0.34, -45], [0.7, -10], [1, 0]]) });
    } },
    cast: { dur: 1.0, hitAt: 0.5, f(u, p) {
      const K = (k) => track(k, u);
      add(p, {
        upperArm: K([[0, 0], [0.35, -95], [0.5, -50], [0.7, -45], [1, 0]]),
        foreArm: K([[0, 0], [0.35, -10], [0.5, -20], [1, 0]]),
        upperArmF: K([[0, 0], [0.35, -60], [0.5, -80], [1, 0]]),
        torso: K([[0, 0], [0.35, -10], [0.5, 8], [1, 0]]),
        head: K([[0, 0], [0.35, -10], [0.5, 2], [1, 0]]),
      }, { dy: K([[0, 0], [0.35, -25], [0.5, 0], [1, 0]]) });
      aimWeapon(p, K([[0, 6], [0.35, -10], [0.5, 50], [0.7, 45], [1, 6]]));
    } },
    stab: { dur: 0.7, hitAt: 0.34, f(u, p) {
      const K = (k) => track(k, u);
      add(p, {
        upperArm: K([[0, 0], [0.24, 30], [0.36, -30], [1, 0]]),
        foreArm: K([[0, 0], [0.24, 40], [0.36, -25], [1, 0]]),
        torso: K([[0, 0], [0.24, -8], [0.36, 16], [1, 0]]),
        thighN: K([[0, 0], [0.24, 10], [0.36, -26], [1, 0]]),
      }, { dx: K([[0, 0], [0.24, -40], [0.36, 170], [0.6, 150], [1, 0]]), dy: K([[0, 0], [0.24, 10], [0.36, -10], [1, 0]]) });
      aimWeapon(p, 85);
    } },
  };
  M.attack = { label: '공격', loop: false, dur: (w) => (ATTACK[w] || ATTACK.swing).dur, hitAt: (w) => (ATTACK[w] || ATTACK.swing).hitAt,
    f(t, w) {
      const A = ATTACK[w] || ATTACK.swing;
      const p = ready(t, w);
      A.f(clamp(t / A.dur, 0, 1), p);
      tail(p.angles, t, 1.5, 6);
      return p;
    } };

  M.hit = { label: '피격', loop: false, dur: () => 0.6, f(t, w) {
    const u = clamp(t / 0.6, 0, 1);
    const k = Math.exp(-u * 5) * (u < 0.08 ? u / 0.08 : 1);
    const sh = S(t * 70) * Math.exp(-u * 8);
    const p = ready(t, w);
    add(p, { torso: -18 * k, head: -16 * k, upperArm: -14 * k, upperArmF: -30 * k, cape: 12 * k, thighN: 8 * k }, { dx: -60 * k + 12 * sh });
    tail(p.angles, t * 3, 1.5 * k, 3);
    return p;
  } };

  M.guard = { label: '방어', loop: true, f(t, w) {
    const p = ready(t, w);
    add(p, { upperArm: -40, foreArm: -30, upperArmF: -10, torso: -4, head: 3, thighN: -4, shinN: 8 }, { dy: 10 });
    aimWeapon(p, 10);
    return p;
  } };

  M.cheer = { label: '격려', loop: true, f(t, w) {
    const b = Math.abs(S(t * 4));
    const p = ready(t, w, 0.3);
    add(p, { upperArm: -125 - 8 * b, foreArm: 10, upperArmF: -60 * b, torso: -10, head: -14 }, { dy: -30 * b });
    aimWeapon(p, -8);
    return p;
  } };

  // 기절 (기사 쥐): 쓰러지지 않고 고개를 떨군 채 비틀거림 + 머리 위 별 (별은 화면에서 그림)
  M.stun = { label: '기절', loop: true, stars: true, f(t, w) {
    const sw = S(t * 2.2);
    const p = ready(t, w, 0.4);
    add(p, { torso: 18 + 4 * sw, head: 20 + 6 * S(t * 2.2 - 0.5), upperArm: 50, foreArm: 30, upperArmF: 40, foreArmF: 30, thighN: 6, shinN: 10, cape: 8 }, { rot: 3 * sw, dy: 15 });
    aimWeapon(p, 150);
    return p;
  } };

  // 시전 지속 (치유 · 버프): 무기를 높이 듦
  M.channel = { label: '시전', loop: false, dur: () => 0.9, hitAt: () => 0.45, f(t, w) {
    const u = clamp(t / 0.9, 0, 1);
    const k = track([[0, 0], [0.3, 1], [0.8, 1], [1, 0]], u);
    const p = ready(t, w, 1 - 0.6 * k);
    add(p, { upperArm: -105 * k, foreArm: -10 * k, torso: -8 * k, head: -10 * k, upperArmF: -50 * k }, { dy: -15 * k });
    aimWeapon(p, 0);
    return p;
  } };

  window.MOTIONS = M;
  window.motionTrack = track;
})();
