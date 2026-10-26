# 기사 쥐 외전 (가제)

찍!찍!!찍!!!(NKK_PROJECT) IP 확장 · 분대 전술 SRPG. 기획은 [기사 쥐 외전 기획서.md](기사%20쥐%20외전%20기획서.md) (v0.3: 프리코네 뷰 · 5줄 × 14칸 전장). PPT `기사 쥐 외전 기획서 v0.3.pptx` (v0.2 는 옛 쿼터뷰 기준). 데모 캡처는 `docs/shots/`.

## 리그 데모 (단계 0)

```bash
node tools/serve.js
```
→ http://localhost:5320/web/index.html (탭: 리그 보기 · 전장)

**단일 HTML** (서버 없이 더블클릭): `node tools/build_single.js` → `build/기사쥐_리그데모.html` (그림 27장을 data URI 로 품음, 약 10MB). 데모를 고친 뒤 다시 돌릴 것.

확인용 주소: `?m=attack&t=0.38` = 그 동작의 그 순간에 멈춤, `&bones=1` = 뼈 보기, `?page=field` = 전장 탭으로 바로.

## 폴더
| 위치 | 내용 |
|---|---|
| `art/knight/full_side.png` | Codex 옆모습 통그림 (마젠타 배경). 프롬프트 `v2/prompt_full_side.txt`. 앞 · 뒤(`full_front/back.png`)는 v0.3에서 안 씀 |
| `art/knight/rig_src.json` | 뼈(관절 점) · 영역 규칙 · 복제 부위(먼 쪽 팔) · 그리는 순서 |
| `art/knight/parts/` · `rig.json` · `rig.js` | 자르기 결과 (자동 생성) |
| `art/knight/death/` | 쓰러짐 통그림 시트(Codex 2×2) · 잘라 낸 컷 → `anims.json` · `anims.js` |
| `art/field/field.png` | 전장 배경 (Codex) |
| `art/nkk/` | NKK 에서 가져온 컷인 얼굴 · 타격 이펙트 · 기절 별 |
| `web/` | 리그 엔진(`rig_engine.js`) · 동작(`motions.js`) · 데모(`demo.js`) |
| `tools/rig_cut.py` | 통그림 → 부위 PNG + rig.json |
| `tools/cut_frames.py` | 통그림 동작 시트 → 컷 PNG + anims.js |

## 리그 자르기
```bash
python tools/rig_cut.py art/knight
python tools/cut_frames.py art/knight death 2 2 0.9 0.11,0.2,0.16,0
```
(이 PC 에는 python 이 없어서 `C:/Project/underworld-proto/.venv/Scripts/python.exe -I` 로 실행 — numpy · Pillow · scipy 필요)

- 픽셀 배정: `rules` 를 위에서부터(다각형 `poly` · `grow` · 색 `color` · `y`/`x` 범위) → 남은 픽셀은 `default` 뼈 중 가장 가까운 뼈
- 부위 본체와 떨어진 작은 조각은 맞닿은 부위로 자동 이동. 손에 가려 두 동강 난 검은 `"keep": true`
- 관절 겹침 `cap`: 자식 부위가 피벗 둘레의 부모 픽셀도 가짐 → 돌려도 틈 없음 (검은 `"cap": 0`)
- `clones`: 그림에 없는 먼 쪽 팔 = 가까운 팔을 어둡게 복사해 다른 피벗에 붙임
- 통그림 크기: 첫 컷의 몸 면적을 서 있는 리그 몸 면적에 맞춤 × k (Codex가 머리를 크게 그리는 만큼 k 로 줄임)
- 결과 확인: `art/knight/_assign_side.png` (부위별 색), `art/knight/death/_compare.png`

## 새 쥐 만들기 순서
1. NKK `UnityResources/Rats/Parts/<id>` 와 기사 쥐 `full_side.png` 를 참고로 Codex 옆모습 (같은 자세: 칼 든 팔 앞으로, 먼 팔 안 보임, 다리 벌림)
2. 기사 쥐 `rig_src.json` 을 복사해 관절 점 · 영역만 고침 (격자 그림을 깔고 좌표 읽기)
3. `rig_cut.py` → 쓰러짐 시트 Codex → `cut_frames.py` → 데모에서 확인
