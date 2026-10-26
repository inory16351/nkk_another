# 쥐 비행기 게임 (가제) · 전투 데모

기사 쥐 외전과는 별개 게임, IP(NKK)만 같음. 기획 메모는 [../쥐 비행기 게임.md](../쥐%20비행기%20게임.md).
슈퍼맨 쥐가 과학자 쥐가 만든 비행기로 하늘을 난다. 적은 연구자료를 노리는 하늘 고양이 · 맹금류.

이 폴더(`plane/`)만 쓰고, 기사 쥐 데모(`web/` · `art/` · `tools/` · 포트 5320)는 건드리지 않는다.

## 실행
```bash
node plane/tools/serve.js
```
→ http://localhost:5321/web/index.html

**단일 HTML** (서버 없이 더블클릭): `node plane/tools/build_single.js` → `plane/build/쥐비행기_전투데모.html`

확인용 주소: `?wave=4` = 그 웨이브부터(4 = 보스), `&god=1` = 무적, `?go=1` = 제목 화면 건너뜀. P = 일시정지.

## 전투 (단계 1: 손맛 검증, 1스테이지만)
- **탑뷰** 자유 공중전. 비행기는 늘 앞으로 날고, **WASD / 방향키 = 날아갈 방향**(그쪽으로 선회), **마우스 = 조준**, 왼쪽 클릭 = 사격(커서 쪽으로), Space = 부스트(게이지)
- **쏘지 않으면 체력 회복**. 하늘에 있는 느낌은 바다 위 그림자 · 위를 지나가는 구름(그림자도 바다에)
- 적: 하늘 고양이(앞질러 겨냥해 3연발, 너무 붙으면 이탈) · 매(빙빙 돌다 → 빨간 점선 + 과녁 예고 → 예고 때 정한 곳으로 급강하, 한 번에 한 마리)
- 보스 고양이 비행선: 일정 거리를 두고 맴돌며 대포 두 문 → 나선 탄막 → 원형 탄 + 졸개 소환, 체력 절반부터 더 빠름
- 떨어뜨리는 것: 톱니(재료) · 치즈 코인(재화) · 렌치(체력 25). 업그레이드는 다음 단계
- **스테이지는 `web/stages.js`** (배경 · 웨이브 · 보스 이름). 우주 같은 새 스테이지 = 여기 하나 추가 + `game.js` 에 그 배경 종류(`bg.type`) 그리기 추가. `?stage=2` 로 고름
- 수치는 `web/game.js` 의 `T` · `FOE`

## 그림 (Codex, NKK 원본 그림체)
| 위치 | 내용 |
|---|---|
| `art/src/prompt_*.txt` · `gen.sh` | Codex 프롬프트 · 생성 (`bash plane/art/src/gen.sh [이름…]`) |
| `art/src/ref_*.png` | 참조: NKK `Rats/Parts/hero` · `scientist` · `Cats/Parts` 를 이어 붙인 것 |
| `art/src/*.png` | Codex 원본 (마젠타 배경) |
| `art/sprites/` | 잘라 낸 게임용 그림 + `sprites.js` (자동 생성) |

```bash
C:/Project/underworld-proto/.venv/Scripts/python.exe -I plane/tools/prep.py
```
마젠타 빼기 → 시트 격자 자르기 → 크기 맞춤. 시트 칸 수 · 게임 속 크기는 `prep.py` 의 `SHEETS`.
그림은 모두 **탑뷰, 기수가 오른쪽** (코드에서 돌림). 처음 만든 옆모습 그림은 `art/src/side/` (탑뷰를 그릴 때 디자인 참조).
