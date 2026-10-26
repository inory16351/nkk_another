# 쥐들의 전쟁 (가제) — 핸드오프 (2026-10-27)

NKK(찍!찍!!찍!!!) IP 확장 · 2차대전 오마쥬 엑스컴식 턴제 전술 + 다키스트 던전식 스트레스 + 림월드식 특성.
기사 쥐 체스(`web/`) · 비행기(`plane/`)와 **별개 게임**, `war/` 폴더만 씀 (그림 · 소리 · 도구 전부 `war/` 안). 기획 메모: `../전쟁 시뮬레이션 게임.md`.
브랜치는 나누지 않고 **main 에서만** 작업 (사용자 지시). 웹 빌드로 검토 → 유니티는 게임마다 **별도 저장소**로 옮길 예정.

## 실행
```bash
node war/tools/serve.js          # http://localhost:5322/web/index.html  (?hq=1 사령부 바로, ?go=1 전투 바로)
node war/tools/build_single.js   # → war/build/war.html (단일 파일 ~8MB: 스크립트 · 그림(webp) · 배경음 내장, 글꼴만 구글 폰트 링크)
```
데스크톱 앱 미리보기 이름 `war-demo`. 파이썬 = 시스템 `python -I` (Pillow · numpy · scipy · opencv-python-headless · imageio-ffmpeg 설치함).
테스트: 숨은 창이면 rAF 멈춤 → `View.step(dt)` 직접. 테스트 땐 `Camp.save = () => {}` 먼저 (사용자 저장과 localStorage 공유).

## 사용자가 정한 것 (최신)
| 항목 | 결정 |
|---|---|
| 시점 | 돈스타브식 낮은 시점 + 가짜 원근(`FAR` 0.56) + 평평한 판때기 + 배경 층 겹치기. **Q/E 회전 없앰** — 늘 쥐(앞)에서 적(뒤)을 봄 |
| 맵 | 22줄 × 18칸, 뒤로 확장(참호선 · 폐허 마을). **맵 끝이 안 보이게**: 바깥 땅 = 안쪽 땅, 바깥은 늘 안개, 바깥에 경치 소품(탱크 · 성당 · 대포 · 전봇대 …) |
| 안개 | 안 보이는 곳 = 채도 빼기 + 어둡게 + 옅은 연무 두 겹이 흐름 |
| 출전 | 한 판 **최대 6마리** |
| 병종 | **육각 벌집 스킬판**(가운데 신병, 6갈래 사격 · 화력 · 폭파 · 기동 · 지원 · 정찰)을 찍은 방향으로 병종이 정해짐: 저격수 · 기관총 사수 · 공병 · 코만도 · 의무병 · 정찰병 + 혼합 통신병(사격+정찰) · 주술사(지원+정찰, **영매 특성만**). 박격포병 · 바주카병은 뺌 |
| 쥐 테마 능력 | 모든 병종에 하나씩: 잽싼 발 · 쥐구멍 매복 · 찍찍 함성 · 땅굴 · 철조망 갉기 · 폭약(엄폐물 파괴는 공병) · 벽 타기 · 치즈 배급 · 수염 감지 · 쥐떼 전령 · 정신 지배 · 마법 방어막. 화염방사기 = 공병 노드 장비 |
| 개체 애착 | 쥐마다 얼굴(7) · 털 · 고향 · 사연 · 특성 2~3 · 장비 버전 · 흉터/의수 · 스트레스 기록 · 추모비 |
| 스트레스 | 다키스트 던전식. 100(특성으로 80~120) 넘으면 공황 · 광란(아군 사격) · 도주. 쉬면 회복 → 다음 임무에서 쉬게 하는 선택 |
| 엎드리기 | 버튼 없음. 엄폐물 옆에서 안 쏘고 턴을 마치면 자동 |
| 리깅 | 리깅 동작은 유지(사용자 만족). **머리 파츠 = 개체 얼굴 + 병종 군모 한 장**(모자 따로 오려 붙이기는 구멍 생겨서 버림). 앞/뒤 엄폐 웅크림 = **예전 통그림 자세 그대로 머리만 뺀 몸 파츠 + 개체 머리 파츠**. 투척 = 리그, 박격포 = 옆 웅크림 + 박격포 소품 |
| 전투 UI | 하단에 분대 카드 줄, 턴 종료 위에 엑스컴식 작은 행동 아이콘 묶음, 마우스를 올리면 롤식 툴팁 |
| 그림 · 소리 | 그림 = 크롬의 ChatGPT, 배경음 = 크롬의 제미나이 (Codex 안 씀) |

## 파일
| 위치 | 내용 |
|---|---|
| `web/data.js` | 무기 · 능력(쥐 테마 포함) · 고양이 병종 5(소총 · 기관총 · 장교 · 저격 · 화염) · 맵 2종 · 임무 4 · `missionMap()`(좌우 반전) · 규칙 |
| `web/skills.js` | 육각판(반지름 3, 37칸) · 갈래 · 칸 효과 `NODE_FX` · 병종 `RAT_CLASSES` · `Skills.classOf/canTake/totals` |
| `web/camp.js` | 아웃게임 기록 `war_camp_v2`: 분대 · 모집 · 특성(30종, 상충 쌍) · 스트레스 · 계급(이병~원사) · 임무 진행 · 판 결과 정산 |
| `web/game.js` | 턴 · 명중(특성 · 버프 · 표적 · 근접) · 능력 실행 · 스트레스/정신 이상 · 불 · 땅굴 · 지배 · 고양이 AI(화염병 포함) · 목표(전멸 · 표적 · 깃발) |
| `web/world.js` | 칸 · 언덕(여러 개) · 시야 · 엄폐 · 길찾기(땅굴 · 벽 타기) |
| `web/rig.js` | 리그 그리기: 병종 리그 + 개체 머리(`head_f<n>`) + 웅크림 몸(`crouch`) + 의수 · 의족 빛 + 장비 버전(`baseR`) |
| `web/view.js` | 화면 · 원근 · 바닥 굽기 · 경치 · 안개 · 그림자 · 효과(그림 시트) · 시네마틱(치명 슬로 · 줌 · 레터박스 · 히트스톱) · 입력 |
| `web/ui.js` | 전투 HUD · 롤식 툴팁 · 끝 화면 / `web/lobby.js` 사령부(작전 · 분대 · 모집 · 추모비) + 배경음 `Music` |
| `art/rigs.js` | 모든 리그 묶음 (`tools/hats.py bundle` 이 만듦) |
| `art/<종>_<병종>[_v1|_v2|_flame]/` | 병종 · 장비 버전 리그. 병종 기본 리그에 `parts/<시점>/head_f<n>.png`(개체 머리) · `crouch.png` |
| `art/out/` | 소품 · 지형 · 배경 층 · `deco/`(경치) · `fx/`(효과) · `icons/`(스킬 아이콘) · `ui/`(UI 키트) · `lobby_bg.jpg` |
| `art/audio/` | `lobby.mp3` · `battle.mp3` (제미나이 생성, mp4 → imageio-ffmpeg 로 변환) |
| `art/src/gpt/` | ChatGPT 원본 시트 전부 (아래 파이프라인의 입력) |

## 그림 파이프라인 (크롬 ChatGPT)
- 받기: 페이지에 `__prep(name)` → 빨간 버튼 클릭 → 폼 POST `localhost:5322/upload-form` → `art/src/gpt/`. 음악(제미나이)은 CSP 때문에 `<a download>` → `~/Downloads/*.tmp` → 옮겨서 변환
- 병종 몸: 기본 시트(`rat_body.png` / `cat_body.png`)를 틀로 "같은 자리 · 자세, 옷만 바꿈" → `rat_cls_<병종>.png` → `python -I war/tools/class_rigs.py` (자르기 · 리그)
- 개체 머리: 병종 시트 + 얼굴 참조(`ref_rat_faces.png`)로 7줄 × 3칸 머리 시트 → `tools/head_sheet.py <시트> <리그> <줄수>` (모자 위 40% 폭 · 윗선으로 맞춤). 고양이는 5줄
- 웅크림: `crouch_rat.png`(예전 통그림 자세, 머리 없음)을 병종 시트로 옷만 바꿔 → `tools/crouch.py <시트> <리그>` (목 = 위쪽 살색/회색 덩어리)
- 장비 버전: 병종 시트 → 버전 A/B → `rat_cls_<병종>_v1|_v2.png` → class_rigs. 머리 · 웅크림은 병종 기본 리그 것을 씀
- 경치 `tools/deco.py` · 효과 `tools/fx.py` · 아이콘 `tools/icons.py` · UI 키트 `tools/ui_kit.py`
- 검토: `tools/compose_check.py`, 리그 합성 확인 이미지는 `docs/check/`

## 확인된 것
- 사령부 → 출격 → 전투 → 결과 → 사령부, 콘솔 에러 없음. 자동 플레이로 여러 턴(사격 · 수류탄 · 함성 · 고양이 턴 · 스트레스) 에러 없음
- 개체 머리 7 × 병종 9, 고양이 머리 5 × 병종 4, 웅크림(쥐 9 · 고양이 3+), 단일 HTML 빌드

## 남은 그림 대기열 (ChatGPT 이미지 한도로 멈춤 — 2026-10-27 16:27 이후 재개)
크롬 ChatGPT 대화 "WW2 Sprite Sheet Design"(병종 시트 그림체)에서, 매번 해당 시트를 첨부하고 아래 프롬프트로 생성 → `art/src/gpt/<파일>` 로 저장 → 처리 명령.
- 장비 버전 A (`rat_cls_<병종>_v1.png`): 프롬프트 = "GEAR VARIANT A of this newly attached class sheet. Keep EXACTLY the same canvas, 3 views, positions, pose, proportions, head, helmet, tail and the same class identity and weapon type held the same way. Change only details so a second soldier of this class looks different: darker olive uniform shade, a rolled blanket strapped on top of the pack, a canteen on the right hip, an extra ammo bandolier worn diagonally, a slightly different model of the same weapon. Same flat 2-3 tone style, no outlines, no texture, solid pure magenta #FF00FF background."
- 장비 버전 B (`rat_cls_<병종>_v2.png`): "GEAR VARIANT B … lighter faded khaki uniform shade, a knotted neck scarf, sleeves rolled up, two document pouches on the chest, a small folding shovel on the belt, a different model of the same weapon …" (나머지 문장 A 와 같음)
- 대상: engineer v1 · v2, commando v1 · v2, medic v1 · v2, scout v1 · v2, radio v1 · v2, shaman v1 · v2, 소총수(첨부 `rat_body.png`, 파일 이름 `rat_cls_recruit_v1/v2.png` → 리그 이름 `rat_recruit_v1/v2`) — 처리: `python -I war/tools/class_rigs.py rat_<병종>_v1` 후 `python -I war/tools/hats.py bundle`
- 공병 화염방사기 (`rat_cls_engineer_flame.png`, 첨부 `rat_cls_engineer.png`): "FLAMETHROWER VERSION of this newly attached combat engineer sheet. Keep EXACTLY the same canvas, 3 views, positions, pose, proportions, head, helmet and tail. Replace the rifle with a WW2 flamethrower wand held in the same hands at the same angle, with a small pilot flame at the nozzle and a hose running to two fuel tanks strapped on the back instead of the backpack; add a leather apron and a gas mask bag. …" → class_rigs `rat_engineer_flame`
- 고양이 웅크림 (`crouch_cat_catsniper.png` · `crouch_cat_catflame.png`, 첨부 `crouch_cat.png` + `cat_cls_<병종>.png`): "SPRITE EDIT. Attached: (1) two HEADLESS crouching cat soldier body parts …, (2) a cat class soldier sheet. Redraw image (1) EXACTLY … change the clothes and equipment to match … Keep them HEADLESS …" → `python -I war/tools/crouch.py art/src/gpt/crouch_cat_<병종>.png cat_<병종>`
- 소총수 버전: 리그 이름이 `rat_recruit_v1` 이면 `view.js rigOf` 가 `rat_recruit_v<n>` 을 찾음 (기본 `rat` 리그의 머리 · 웅크림을 씀)

## 남은 것 / 알려진 문제
- 장비 버전 A/B: 저격 · 기관총은 완료, 나머지 병종은 생성 중이었음 (없으면 기본 복장으로 나옴 — 깨지지 않음)
- 사람 손 플레이로 밸런스(스트레스 증가량 · 특성 수치 · 임무 난이도) 확인 필요
- 의수 · 의족은 지금 파츠 색만 바꿈 (전용 파츠 그림 미생성)
- 고양이 저격병 · 화염병 웅크림은 생성 중이었음 (없으면 고양이 기본 웅크림)
- 앞 웅크림에서 총이 얼굴 앞이 아니라 뒤에 그려짐 (몸 파츠 위에 머리를 그려서)
- 글꼴은 구글 폰트 링크라 오프라인 단일 HTML 에선 기본 글꼴로 대체됨
