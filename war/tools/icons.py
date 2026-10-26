"""스킬 · 능력 아이콘 시트(6 × 6) → art/out/icons/<이름>.png + art/out/icons.js (window.ICONS = {이름: 경로})
능력 버튼 · 스킬 벌집판 칸에 씀.

사용: python war/tools/icons.py art/src/gpt/skill_icons.png
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
GRID = [
    ['shoot', 'aimed', 'suppress', 'grenade', 'overwatch', 'hunker'],
    ['reload', 'firstaid', 'knife', 'flame', 'charge', 'gnaw'],
    ['tunnel', 'scurry', 'ambush', 'warcry', 'cheese', 'mark'],
    ['command', 'radioscan', 'dominate', 'ward', 'mortar', 'heavy'],
    ['aim', 'hp', 'mob', 'sight', 'crit', 'def'],
    ['dmg', 'clip', 'blast', 'medkits', 'revive', 'psi'],
]
# 같은 그림을 쓰는 다른 이름
ALIAS = {'grenades': 'grenade', 'boom': 'blast', 'heal': 'firstaid', 'closeq': 'knife', 'sentry': 'overwatch', 'ghost': 'ambush',
         'charges': 'charge', 'burn': 'flame', 'lightmortar': 'mortar'}


def main(src):
    rgba = key_magenta(Image.open(src))
    H, W = rgba.shape[:2]
    os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
    icons = {}
    for r, row in enumerate(GRID):
        for c, name in enumerate(row):
            cell = rgba[r * H // 6:(r + 1) * H // 6, c * W // 6:(c + 1) * W // 6].copy()
            a = cell[..., 3] > 30
            lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=8))
            if n > 1:
                sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
                cell[..., 3] = np.where(lab == sizes.argmax() + 1, cell[..., 3], 0)
            ys, xs = np.nonzero(cell[..., 3] > 30)
            crop = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            im = Image.fromarray(crop, 'RGBA')
            im.thumbnail((128, 128), Image.LANCZOS)
            sq = Image.new('RGBA', (128, 128))
            sq.alpha_composite(im, ((128 - im.width) // 2, (128 - im.height) // 2))
            sq.save(os.path.join(OUT, 'icons', name + '.png'))
            icons[name] = f'icons/{name}.png'
    for k, v in ALIAS.items():
        icons[k] = icons[v]
    with open(os.path.join(OUT, 'icons.js'), 'w', encoding='utf-8') as f:
        f.write('window.ICONS = %s;\n' % json.dumps(icons))
    print('아이콘', len(icons))


if __name__ == '__main__':
    main(sys.argv[1])
