# 쥐들의 전쟁 (가제) — 핸드오프 (2026-10-26)

NKK(찍!찍!!찍!!!) IP 확장 · 2차대전 오마쥬 엑스컴식 턴제 전술. 기사 쥐(`web/` · 5320) · 비행기(`plane/` · 5321)와 **별개 게임**, `war/` 폴더만 쓴다. 기획 메모: `../전쟁 시뮬레이션 게임.md`.

## 실행
```bash
node war/tools/serve.js
```
→ http://localhost:5322/web/index.html (`?go=1` = 시작 화면 건너뜀). 데스크톱 앱 미리보기 이름 `war-demo` (`.claude/launch.json`).

## 사용자가 정한 것
| 항목 | 결정 |
|---|---|
| 시점 | 돈스타브식 기울인 탑뷰 격자 + 평평한 그림 판때기 레이어. **Q/E = 90° 회전** |
| 원근감 | 뒤: 먼 폐허 스카이라인 · 언덕 실루엣 2겹 시차 + 먼 줄 안개 / 앞: 가까운 잔해 실루엣 층(빠른 시차) |
| 캐릭터 | 사람 비율 몸 + 쥐 머리(슈피겔만 『쥐』), **앞 · 옆 · 뒤 3방향 리그** |
| 그림체 | NKK 원본 플랫. 쥐 눈 = **검은 점**(눈썹 · 흰자 넣은 만화풍은 "불쾌한 골짜기"라 거절 → `art/src/gpt/rat_body_expr.png` 는 안 씀) |
| 표정 | 피격 · 공격 때 **눈 점 모양만** 바꿈 (`rig.js drawFace`: hit = `>`, attack = 납작한 점 + 눈꺼풀, dead = ×) |
| 리깅 | **리깅으로 되는 건 최대한 리깅**: 대기 숨쉬기 · 걷기 · 조준 · 반동 · 피격 · 옆모습 웅크림 · 쓰러짐 · 신체 절단. 통그림 컷은 앞/뒤 엄폐 웅크림 · 수류탄 투척 · 박격포 조작만 |
| 턴 | 진영 교대(엑스컴): 행동력 2, 사격 등은 턴 끝, 경계 사격, 제압 |
| 표현 | 피 · **신체 절단 허용**(참수 · 팔 · 터짐), 피는 평평한 검붉은 덩어리 2톤 |
| 분대 | **영구 사망**(죽은 쥐 재사용 불가 · 전사자 명단), **엑스컴식 성장**(경험치 → 계급 이병~하사, 명중 · 체력 보너스) — `localStorage war_roster_v1` |
| 범위 | 지금은 **전투 1판 데모**. 손맛 OK 전에 캠페인 · 기지 · 장비 화면 만들지 말 것 |

## 파일
| 위치 | 내용 |
|---|---|
| `web/data.js` | 무기 · 능력 · 병과(쥐 4 + 고양이 3) · 맵(18×14 문자열, 언덕 타원) · 규칙 수치 |
| `web/world.js` | 칸 · 높이 · 시야(LOS, 높은 엄폐 옆에서 몸 내밀기) · 방향별 엄폐 · 길찾기 |
| `web/game.js` | 턴 흐름 · 명중률 · 사격 · 폭발 · 사망 · 고양이 AI(칸 점수 · 진지 선점 · 수류탄 · 제압) · 분대 기록 |
| `web/rig.js` | 컷아웃 리그 그리기 + 동작(pose) + 눈 점 표정 + 통그림 컷 교체 |
| `web/view.js` | 화면: 회전 좌표 · 바닥 굽기 · 배경 층 · 깊이 정렬 · 가림 반투명 · 효과(총구 · 피 · 폭발 · 절단 조각) · 입력 · 합성 소리 |
| `web/ui.js` · `index.html` | HUD(분대 카드 · 능력 버튼 · 명중 분해 · 기록 · 배너 · 시작/끝 화면) |
| `art/src/gpt/*.png` | ChatGPT 원본 시트 (rat/cat_body · rat/cat_poses · props · weapons · terrain · backdrop) |
| `art/rat` · `art/cat` | `full_*.png`(시트 3칸) · `rig_src.json`(관절 · 영역) · `parts/` · `rig.json/js` |
| `art/out/` | `prep.py` 결과(자세 컷 · 소품 · 무기 · 지형 · 배경 층) + `assets.js` |
| `art/nkk/` | NKK 원본 머리 그림 (총통 고양이 `cat_boss_fuhrer` = 시작 화면) |
| `tools/` | `serve.js` · `slice_body.py` · `rig_cut.py`(기사 쥐 것 복사 + 'light' 색) · `prep.py` |

## 그림 파이프라인
1. **생성 = 옆 창 브라우저의 ChatGPT** (사용자 Plus 계정, 이미 로그인됨). Codex CLI 는 이날 한도(21:26 이후 가능)라 안 씀. `art/src/make_prompts.js` · `gen.sh` 는 Codex 용 예비.
   - 참조 그림 첨부: 작은 JPEG 를 base64 로 JS 에 넣어 `input[type=file]` 에 DataTransfer 로 넣음 (fetch/iframe 은 ChatGPT CSP 가 막음)
   - 결과 받기: 이미지 blob → base64 → **폼 POST** `http://localhost:5322/upload-form` → `art/src/gpt/<이름>.png` (브라우저 다운로드 · 클립보드는 안 됨, 로그인 토큰 API 는 권한 거부됨 — 쓰지 말 것). 사용자가 이 작업용 다운로드를 허락함
   - 스타일 참조: 플랫이 부족하면 NKK `Props/gun·dynamite·axe` + `Furniture/furn_cabinet` 묶음을 붙이고 "2-3 tones, no texture" 로 다시 요청 (소품 · 지형은 이렇게 다시 뽑아 통과)
2. 몸 시트 → `python war/tools/slice_body.py war/art/src/gpt/rat_body.png war/art/rat` (격자 `_grid_*.png` 로 좌표 읽기)
3. `rig_src.json` 고치고 → `python war/tools/rig_cut.py war/art/rat` → `_assign_*.png` 확인
4. `python war/tools/prep.py` → `art/out/` (자세 컷은 ChatGPT 가 칸마다 축척을 안 지켜서 `POSE_H` 자세별 키 비율로 맞춤)

파이썬: `C:/Project/underworld-proto/.venv/Scripts/python.exe -I` (numpy · Pillow · scipy · cv2)

## 확인된 것 (브라우저)
- 첫 화면 · 배경 3층 · 언덕(윗면 밝게 + 남쪽 옆면 · 그림자) · 소품 · 쥐 리그 · HUD 렌더, 콘솔 에러 없음
- 이동 → 고양이 무리 발견 → 엄폐로 흩어짐, Q/E 회전 후 이동까지 에러 없음

## 아직 확인 못 한 것 / 알려진 문제
- **한 판 끝까지 플레이 안 해 봄**: 사격 → 사망 · 절단 조각 · 피, 고양이 턴 AI 전체, 박격포 · 중기관총 진지, 승패 화면 · 진급 · 전사자 기록 전부 미검증
- 언덕 위(시야 +2)에 올라가면 맵 전체가 보여 무리 4개가 한꺼번에 깸 → 시야 보너스 +1 로 줄이거나 맵 재배치 검토
- 앞 · 뒤 리그는 팔과 총이 몸통에 붙어 있음(조준은 반동만). 병과별 무기(`art/out/weapons`)는 아직 안 갈아 끼움 — 지금은 모두 소총 그림. 무기 시트 플랫 버전은 ChatGPT 탭에 요청만 해 둠(저장 안 함)
- 고양이 장교 · 기관총병은 같은 그림에 색 필터만. NKK `boss_dictator`(장교 모자) · `boss_turret`(철모) 머리를 쓰는 변형 시트 생성 필요
- 쥐 머리 변형도 색 필터(`HEAD_TINTS`)만
- 사망은 쓰러지는 리그 + 절단만. 통그림 사망 시트는 안 만듦 (리그 우선 결정)
- 회전 시 언덕 위 핏자국은 높이만큼 살짝 어긋날 수 있음
- 단일 HTML 빌드(`build_single.js`) 아직 없음

## 다음 순서 (제안)
1. 한 판 끝까지 플레이하며 위 미검증 항목 확인 · 고치기 → 사용자에게 손맛 확인 받기
2. 무기 플랫 시트 받아 병과별 무기 교체 (옆모습 `arm` 부위의 총을 무기 그림으로)
3. 고양이 장교 · 기관총병 · 쥐 머리 변형 시트
4. 사용자 OK 뒤: 진급 때 능력 고르기, 미션 선택 · 기지 화면
