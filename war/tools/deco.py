"""맵 바깥 경치 소품 시트(3×3) → art/out/deco/<이름>.png + art/out/deco.js (window.DECO = {이름: {img, w, h, pivot, tiles}})

사용: python war/tools/deco.py art/src/gpt/deco_props.png
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
# 칸 순서대로 이름 · 화면 가로 칸 수
NAMES = [('tank', 2.4), ('church', 2.2), ('artillery', 2.2), ('pole', 1.3), ('farmhouse', 2.4), ('trees', 2.0), ('cart', 1.8), ('chimney', 1.2), ('plane', 2.6)]


def main(src):
    rgba = key_magenta(Image.open(src))
    H, W = rgba.shape[:2]
    os.makedirs(os.path.join(OUT, 'deco'), exist_ok=True)
    deco = {}
    for i, (name, tiles) in enumerate(NAMES):
        r, c = divmod(i, 3)
        cell = rgba[r * H // 3:(r + 1) * H // 3, c * W // 3:(c + 1) * W // 3].copy()
        a = cell[..., 3] > 30
        lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=6))
        if n > 1:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            cell[..., 3] = np.where(lab == sizes.argmax() + 1, cell[..., 3], 0)
        ys, xs = np.nonzero(cell[..., 3] > 30)
        crop = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray(crop, 'RGBA')
        im.save(os.path.join(OUT, 'deco', name + '.png'))
        deco[name] = {'img': f'deco/{name}.png', 'w': im.width, 'h': im.height, 'pivot': [im.width / 2, im.height * 0.94], 'tiles': tiles}
    with open(os.path.join(OUT, 'deco.js'), 'w', encoding='utf-8') as f:
        f.write('window.DECO = %s;\n' % json.dumps(deco, ensure_ascii=False))
    print('경치', len(deco))


if __name__ == '__main__':
    main(sys.argv[1])
