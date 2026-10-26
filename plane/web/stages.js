// 스테이지 데이터: 배경 · 웨이브 · 보스. 새 스테이지(우주 등)는 여기에 하나 더 넣고, 배경 종류(bg.type)만 game.js 에 그리기를 추가.
// 웨이브: [[적 종류, 수], ...] — 적 종류는 game.js 의 FOE
window.STAGES = [
  {
    id: 'sea',
    name: '1스테이지 · 바다 위 하늘',
    bg: { type: 'sea', color: '#5b9fcf', deep: '#5699ca', wave: 'rgba(255,255,255,.38)', islands: 0.28 },
    waves: [
      [['cat', 3]],
      [['cat', 2], ['hawk', 2]],
      [['cat', 4], ['hawk', 3]],
      [['boss', 1]],
    ],
    bossName: '고양이 비행선',
  },
];
