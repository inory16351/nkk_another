# 기사 쥐 외전 — 인수인계 (HANDOFF)

마지막 갱신: 2026-10-26 밤. 커밋 전 (사용자: "다른 에이전트 작업 끝나면 한 번에 커밋").

## 0. 꼭 지킬 규칙 (사용자 지시)
- 설명 · 코드 주석은 **한국어**. 결정할 게 생기면 **선택지로 질문**하고 진행.
- 기사 쥐 = **스토리 고유 캐릭터 1마리** (영입 · 생성 불가).
- 캐릭터 · 적 · 배경은 모두 **아서왕풍 중세 판타지**. 그림체 = 원작 NKK 처럼 **외곽선 없는 플랫**(그림자 1톤 + 하이라이트 1톤).
- 그림은 **NKK 리소스 먼저**, 없으면 생성. 코드로 그림 그리기 금지 (자르기 · 키잉 · 크기 조정은 됨).
- **Codex 사용 한도 소진** → 지금은 **옆 브라우저(Claude 인앱 브라우저)의 ChatGPT** 로 그림 생성 후 다운로드해서 씀 (5절).
- 리그는 캐릭터마다 **부위 시트를 따로** 뽑고(부위 재활용 금지), 겉모습은 **원본 통그림에서 잘라낸 부위**, 가려진 곳만 부위 시트로 채움.
- 쓰러짐처럼 리깅으로 힘든 동작은 **통그림 컷 시트**.

## 1. 문서
| 파일 | 내용 |
|---|---|
| `JRPG 느낌 신작 게임 기획.md` | 사용자 원래 가안 |
| `기사 쥐 외전 기획서.md` (v0.3) | 전체 기획: 프리코네 뷰 · 5줄 × 14칸 · 세계관 · 성장 · 거점 |
| `전투 시스템 설계.md` | 사용자 전투 메모 |
| `전투 시스템 기획서.md` (v0.1) | 전투 규칙 · 능력치 · 병과 5 · 스킬 트리 · 적 5 · 웹 빌드 계획 |
| `기사 쥐 외전 기획서 v0.3.pptx` | PPT (v0.2 는 옛 쿼터뷰 판) |
| `README.md` | 실행 · 도구 사용법 (리그 부분은 v1 설명이라 일부 옛 내용 — 이 문서가 최신) |

※ `plane/`, `war/`, `전쟁 시뮬레이션 게임.md`, `쥐 비행기 게임.md` 는 **다른 세션 작업** — 건드리지 말 것.

## 2. 실행
```bash
node tools/serve.js          # http://localhost:5320/web/game.html (게임) · /web/index.html (리그 뷰어)
node tools/build_single.js   # → build/기사쥐_외전.html (단일, 그림 webp 내장 ~4MB)
node tools/build_single.js web/index.html build/기사쥐_리그뷰어.html
```
- Python 은 이 PC 에 없음 → `C:/Project/underworld-proto/.venv/Scripts/python.exe -I` 사용 (numpy · Pillow · scipy · cv2).
- 게임 확인용: 콘솔 `__game.startBattle(0~4)`, `__game.battle`, `__game.goBase()`. 저장 = localStorage `nkk_another_save_v1`.
- 브라우저 탭이 가려지면 rAF 가 멈춤 → 캡처 전 `__demo.tick()`(뷰어) 또는 화면을 앞으로.

## 3. 게임 (web/)
- `game.html` + `game/data.js`(병과 · 스킬 · 적 · 스테이지 · 건물 표) · `game/battle.js`(전투) · `game/main.js`(화면 흐름 · UI · 저장) · `rig_engine.js` · `motions.js`.
- 흐름: 타이틀 → 거점(건물 6) → 지도(스테이지 5) → 편성 → 전투 → 결과(경험치 · 계급업 스킬 2택) → 저장.
- 전투 규칙: 진영 교대 턴, 이동(쪼개 씀) + 행동 + 보조 행동, 전면 −15 / 측면 +10 / 등 뒤 +25, 사기, 빈사 · 구출, 영구 사망, 기사 쥐 기절(별) 2턴, 패배 시 동료 전원 상실.
- 아군: 기사 쥐(고유) · 창기병 · 석궁(사냥꾼) · 마법사 · 수녀. 적: 창 보병 · 석궁병 · 고양이 척후 · 흑묘 기사 · 보스 철갑 기사단장.
- UI 키트(`art/ui/`): 패널 · 버튼 4색 · 리본 · 슬롯 · 재화 아이콘. CSS `border-image` 로 입힘 (`game.html` 끝 부분).

## 4. 리그 (지금 방식 = v4 혼합)
**`tools/hybrid_rig.py art/<id>`** → `art/<id>/parts3/` · `rig.json` · `rig.js` · `_hybrid.png`(원본 · 기본 · 걷기 · 예비 · 숙임 검토)
1. 원본 `full_side.png` 를 부위로 나눔 — 규칙 = `tools/make_rig_src.py` 의 관절 표 `C[id]` (기사 쥐만 `art/knight/rig_src.json` 직접)
2. 시트 부위(`sheet/parts.png`, 4×4)를 원본 뼈에 맞춰 배치 → 팔 · 다리 영역은 시트 모양 안으로 제한
3. 부위 그림 = 시트(가려졌던 자리 + 관절 둘레만) 위에 원본 픽셀 → 기본 자세 = 원본 그대로
4. 먼 팔 = 시트의 먼 팔
- 관절 좌표 찍기: `_grid.png`(격자) · `tools/zoom_grid.py art/<id> x0 y0 x1 y1` 로 확대해서 표 고침.
- 쓰러짐: `tools/cut_frames.py art/<id> death 2 2 0.85 0.11,0.2,0.16,0` (크기 = 몸 면적 기준).
- 옛 방식 도구(`rig_cut.py` v1, `assemble.py` v2 시트만, `rig_review.py`)는 남아 있음 — `hybrid_rig.py` 가 일부 함수를 씀.
- 알려진 문제: 팔을 크게 들면 몸통 앞에 원본 팔 경계 자국이 조금 보임 (시트 몸통과 원본 색 차이).

## 5. ChatGPT 로 그림 받기 (Codex 대신)
1. 브라우저 탭에서 chatgpt.com, 참고 그림은 base64 를 `window.__refs` 에 넣고 `__attach(name)` 로 숨은 file input 에 넣음 (기사 쥐 = 그림체 기준).
2. 프롬프트 입력 · 전송 → 끝나면(`[data-testid=stop-button]` 없음) 페이지 함수 `__prep('이름.png')` 가 왼쪽 위에 빨간 "받기" 링크를 만듦 → **그 링크를 클릭**(스크립트 클릭은 다운로드 안 됨).
3. 받은 파일은 `~/Downloads/<uuid>.tmp` → `bash tools/grab_latest.sh <크기> <대상 경로>` 로 옮김 (`__prep` 반환값 = 크기).
- 페이지를 새로 열면 `__refs · __attach · __prep · __last · __seen` 을 다시 정의해야 함 (대화 기록 참고).
- 이번에 받은 것: 사냥꾼 · 고양이 척후 · 흑묘 기사의 통그림 · 부위 시트 · 쓰러짐 시트(원본은 각 `_gpt/`, 옛 외곽선판은 `_old_outline/`), UI 키트.
- Codex 프롬프트들은 각 폴더 `prompt_*.txt` 에 남아 있음 (ChatGPT 에도 그대로 쓸 수 있음).

## 6. 진행 중 — 이펙트 고도화 (사용자: "이펙트만 좀 더 깎아서, 성검 해방 이런 거")
이미 한 것: NKK 기사 초필살기 이펙트 33장을 `art/fx/k/` 로 복사 (arc · band · beam · blast · boom1~3 · burst · charge · column · cutline · dots · flamewall · flash · frame · ghostsword · hit1~3 · lightring · mote(s) · pillar · ring · ripple · shards · slash · slashwave · smear · sparks · streak · wave) + `art/fx/` 에 dot · puff · shard_a~c · crumbs · smoke · flame · bolt_b. **코드는 아직 안 고침.**

계획 (`web/game/fx.js` 새로 만들고 `battle.js` 의 `fxAt/drawFx/drawTrails/projectile/attack/aoe/heal/buff/chain` 을 거기로):
- 엔진: 스프라이트 이펙트(크기 · 알파 곡선 · 회전 · 속도 · 중력 · `lighter` 합성 · 뒤/앞 레이어), 색 입힘 캐시, 화면 플래시 · 배경 어둡게(dim) · 히트스톱(dt 배율).
- **성검 해방**: ① 배경 어둡게 + 발밑 lightring 퍼짐 + 뒤 pillar/column + motes 가 칼끝으로 빨려 듦 + 칼끝 charge 회전(0.7초, 기사 `cheer` 자세) ② 컷인(기존) ③ 내려베기 맞는 순간 흰 플래시 · 히트스톱 · 큰 흔들림 ④ slashwave/wave 가 같은 줄을 따라 5칸 진행 + streak 잔상 + 바닥 cutline · ripple, 파도가 지나는 칸마다 hit1~3 + burst + sparks · shards 파편 + boom1, 피해 숫자도 그 박자에 ⑤ 끝에서 lightring + motes 떠오름, 어둠 걷힘. 엑스칼리버(3줄)는 파도 3개.
- 그 외: 근접 타격(히트스톱 · 무기 방향 arc · 파편 · 치명타 burst+플래시), 무기 궤적 띠(가산 합성 · 병과 색), 볼트(streak 꼬리), 마력탄(flash 틴트 + motes 꼬리), 화염구(flame 꼬리 → explosion + boom2 + 충격파 링 + 그을음), 번개 사슬(굵은 반투명 + 가는 흰 선 이중, 가지), 치유(발밑 lightring + column + 하트 · motes 상승), 버프(링 + motes), 얼음 덫(청색 틴트 shards), 보스 호령(붉은 링 + 흔들림), 적 퇴장 poof.
- 끝나면 브라우저로 확인 → `build_single.js` 다시 (fx 경로를 EXTRA 에 추가해야 함: `art/fx/k/*`).

## 7. 커밋 전 정리 권장
`.gitignore` 에: `build/cache/`, `art/**/_*.png`(검토 그림 ~42MB), `art/**/log_*.txt`. `art/` 전체 약 240MB (Codex 원본 · 시트 포함).
