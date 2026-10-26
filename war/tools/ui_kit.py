"""UI 키트 시트 → art/out/ui/<이름>.png (요소마다 잘라서). CSS border-image 로 패널 · 버튼에 씀 (index.html).

사용: python war/tools/ui_kit.py art/src/gpt/ui_kit.png
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from rig_cut import key_magenta  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', 'art', 'out', 'ui')
# 위 → 아래, 왼 → 오른 순서
NAMES = ['panel', 'panel_sq', 'header', 'btn', 'btn_hi', 'btn_off', 'btn_red', 'ring', 'slot', 'tag', 'rope', 'bar', 'bar_fill']


def main(src):
    rgba = key_magenta(Image.open(src))
    a = rgba[..., 3] > 40
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=4))
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = [k + 1 for k in range(n) if sizes[k] > 1500]
    boxes = []
    for k in keep:
        ys, xs = np.nonzero((lab == k) & a)
        boxes.append([ys.min(), ys.max() + 1, xs.min(), xs.max() + 1])
    # 줄 묶기: 세로 가운데가 비슷하면 같은 줄
    boxes.sort(key=lambda b: (b[0] + b[1]) / 2)
    rows, cur = [], []
    for b in boxes:
        if cur and (b[0] + b[1]) / 2 - (cur[-1][0] + cur[-1][1]) / 2 > 30 and b[0] > max(c[1] for c in cur) - 20:
            rows.append(cur); cur = []
        cur.append(b)
    rows.append(cur)
    ordered = [b for r in rows for b in sorted(r, key=lambda b: b[2])]
    os.makedirs(OUT, exist_ok=True)
    for name, (y0, y1, x0, x1) in zip(NAMES, ordered):
        Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA').save(os.path.join(OUT, name + '.png'))
        print(name, x1 - x0, y1 - y0)
    print('조각', len(ordered), '이름', len(NAMES))


if __name__ == '__main__':
    main(sys.argv[1])
