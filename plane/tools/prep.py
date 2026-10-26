"""Codex 원본 그림(art/src, 마젠타 배경) → 게임용 스프라이트(art/sprites) + sprites.js

- 마젠타를 투명으로, 가장자리 마젠타 번짐 제거
- 시트는 격자로 나눔. same=True 면 모든 칸을 같은 상자로 잘라(날갯짓 컷) 몸 위치가 흔들리지 않음
- 크기: 가로가 (게임 속 가로 × 2) 가 되게 (화면에서 0.5배로 그려 선명하게)
- 그림은 모두 탑뷰, 기수가 오른쪽

사용: python -I plane/tools/prep.py
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', 'art')
SRC = os.path.join(ART, 'src')
OUT = os.path.join(ART, 'sprites')

# 이름: (열, 행, 게임 속 가로 px, 같은 상자로 자르기)
SHEETS = {
    'player': (1, 1, 125, False),
    'e_cat': (1, 1, 130, False),
    'e_hawk': (2, 1, 120, True),
    'boss': (1, 1, 480, False),
    'items': (2, 2, 46, False),
    'clouds': (2, 2, 380, False),
    'islands': (2, 2, 560, False),
}
SCALE = 2


def key_magenta(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g  # 마젠타 정도
    alpha = np.clip((190.0 - m) / 90.0, 0.0, 1.0)
    spill = (1.0 - alpha)[..., None]
    mag = np.array([255.0, 0.0, 255.0])
    rgb = np.where(alpha[..., None] > 0.02, (a - spill * mag) / np.maximum(alpha[..., None], 0.02), 0)
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255.0]).astype(np.uint8)


def bbox(alpha, thr=40):
    ys, xs = np.where(alpha > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):  # 옛 결과 지움 (이름이 바뀐 그림이 남지 않게)
        os.remove(os.path.join(OUT, f))
    meta = {}
    for name, (cols, rows, width, same) in SHEETS.items():
        p = os.path.join(SRC, name + '.png')
        if not os.path.exists(p):
            print('없음', name)
            continue
        rgba = key_magenta(Image.open(p))
        H, W = rgba.shape[:2]
        cw, ch = W // cols, H // rows
        cells = [rgba[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] for r in range(rows) for c in range(cols)]
        boxes = [bbox(c[..., 3]) for c in cells]
        if same:
            u = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
            boxes = [u] * len(cells)
        frames = []
        k = width * SCALE / (boxes[0][2] - boxes[0][0])  # 첫 칸 기준 배율 (같은 시트는 같은 배율)
        for i, (c, b) in enumerate(zip(cells, boxes)):
            pad = 3
            x0, y0, x1, y1 = max(b[0] - pad, 0), max(b[1] - pad, 0), min(b[2] + pad, cw), min(b[3] + pad, ch)
            im = Image.fromarray(c[y0:y1, x0:x1], 'RGBA')
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            fn = f'{name}_{i}.png'
            im.save(os.path.join(OUT, fn))
            frames.append({'img': fn, 'w': im.width / SCALE, 'h': im.height / SCALE})
        meta[name] = frames
        print(name, [(f['w'], f['h']) for f in frames])
    with open(os.path.join(OUT, 'sprites.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, 'sprites.js'), 'w', encoding='utf-8') as f:
        f.write('window.SPRITES = ' + json.dumps(meta, ensure_ascii=False) + ';\n')


if __name__ == '__main__':
    main()
