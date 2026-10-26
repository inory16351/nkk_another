"""맵 그림 자르기: 타일 시트(3×2, 마젠타 배경) → art/map/tiles/*.png + tiles.js, 근경 가림막 키잉.

사용: python tools/slice_map.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig_cut import key_magenta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'map')
NAMES = [['grass', 'dirt', 'stone'], ['crate', 'wall', 'bush']]


def main():
    sheet = Image.open(os.path.join(ROOT, 'tiles_sheet.png'))
    rgba = key_magenta(sheet)
    H, W = rgba.shape[:2]
    cw, ch = W // 3, H // 2
    os.makedirs(os.path.join(ROOT, 'tiles'), exist_ok=True)
    info = {}
    for r in range(2):
        for c in range(3):
            cell = rgba[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            a = cell[..., 3] > 20
            # 옆 칸에서 넘어온 조각은 버리고 가장 큰 덩어리만
            lab, n_lab = ndimage.label(ndimage.binary_dilation(a, iterations=3))
            if n_lab > 1:
                sizes = ndimage.sum(a, lab, range(1, n_lab + 1))
                a &= lab == (int(np.argmax(sizes)) + 1)
                cell = cell.copy()
                cell[..., 3] = np.where(a, cell[..., 3], 0)
            ys, xs = np.nonzero(a)
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            crop = cell[y0:y1, x0:x1]
            n = NAMES[r][c]
            Image.fromarray(crop, 'RGBA').save(os.path.join(ROOT, 'tiles', n + '.png'))
            info[n] = {'img': f'tiles/{n}.png', 'w': int(x1 - x0), 'h': int(y1 - y0)}
            print(n, info[n])
    fg = Image.fromarray(key_magenta(Image.open(os.path.join(ROOT, 'fg_branch.png'))), 'RGBA')
    fg.save(os.path.join(ROOT, 'fg_branch_key.png'))
    with open(os.path.join(ROOT, 'tiles.js'), 'w', encoding='utf-8') as f:
        f.write('window.TILES = %s;\n' % json.dumps(info))


if __name__ == '__main__':
    main()
