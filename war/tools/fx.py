"""효과 시트(5줄 × 4칸) → art/out/fx/<이름><n>.png + art/out/fx.js (window.FXART = {이름: [프레임…]})
줄: 총구 불꽃 4 · 폭발 4 · 불길 4 · 연기 4 · (정신 소용돌이 · 방어막 · 불꽃 튐 · 피)

사용: python war/tools/fx.py art/src/gpt/fx_sheet.png
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from rig_cut import key_magenta  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', 'art', 'out')
ROWS = [['flash'] * 4, ['boom'] * 4, ['fire'] * 4, ['smoke'] * 4, ['psi', 'shield', 'spark', 'blood']]


def main(src):
    rgba = key_magenta(Image.open(src))
    H, W = rgba.shape[:2]
    os.makedirs(os.path.join(OUT, 'fx'), exist_ok=True)
    fx = {}
    for r, row in enumerate(ROWS):
        for c, name in enumerate(row):
            cell = rgba[r * H // 5:(r + 1) * H // 5, c * W // 4:(c + 1) * W // 4].copy()
            a = cell[..., 3] > 20
            lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=10))
            if n > 1:  # 가운데 큰 덩어리 + 그 둘레 작은 조각(불티 · 파편)
                sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
                cell[..., 3] = np.where(lab == sizes.argmax() + 1, cell[..., 3], 0)
            ys, xs = np.nonzero(cell[..., 3] > 20)
            crop = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            i = len(fx.get(name, []))
            Image.fromarray(crop, 'RGBA').save(os.path.join(OUT, 'fx', f'{name}{i}.png'))
            fx.setdefault(name, []).append(f'fx/{name}{i}.png')
    with open(os.path.join(OUT, 'fx.js'), 'w', encoding='utf-8') as f:
        f.write('window.FXART = %s;\n' % json.dumps(fx))
    print({k: len(v) for k, v in fx.items()})


if __name__ == '__main__':
    main(sys.argv[1])
