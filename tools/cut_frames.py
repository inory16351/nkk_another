"""통그림 동작 시트(칸 격자, 마젠타 배경) → 컷 PNG + anims.js (underworld cut_death.py 방식)

리깅으로 표현하기 힘든 동작(사망 · 큰 넉백 등)은 컷을 통째로 갈아 끼운다.
- 칸마다 덩어리를 모두 모아(날아가는 검 포함) 꼭 맞게 자름
- 기준점 = 그 칸에서 가장 아래 덩어리 바닥의 가운데 (모든 컷이 같은 땅선)
- 크기 = 첫 컷의 몸(가장 큰 덩어리) 키가 서 있는 리그 키의 k 배가 되게

사용: python tools/cut_frames.py art/knight death [열=2] [행=2] [k=1.0] [초 간격=0.12,0.18,0.14,0]
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig_cut import key_magenta


def main(root, name, cols=2, rows=2, k=1.0, times=None):
    cols, rows, k = int(cols), int(rows), float(k)
    src = os.path.join(root, name, name + '.png')
    rgba = key_magenta(Image.open(src))
    fg = ndimage.binary_opening(rgba[..., 3] > 40, iterations=1)
    H, W = fg.shape
    cw, ch = W // cols, H // rows
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    cms = ndimage.center_of_mass(fg, lab, range(1, n + 1))

    rig = json.load(open(os.path.join(root, 'rig.json'), encoding='utf-8'))
    # 크기 기준 = 몸 면적. 리그 v2 부위(무기 · 먼 팔다리 · 꼬리 제외) 면적 합 ≈ 서 있는 몸 면적
    stand_area = 0
    for pn, p in rig['parts'].items():
        if pn in ('weapon', 'upperArmF', 'foreArmF', 'thighF', 'shinF', 'cape') or pn.startswith('tail'):
            continue
        a = np.asarray(Image.open(os.path.join(root, p['img'])))[..., 3]
        stand_area += int((a > 128).sum())
    frames, scale = [], None
    for i in range(cols * rows):
        cx, cy = i % cols, i // cols
        keep = np.zeros_like(fg)
        big = -1
        for j in range(n):
            if sizes[j] < 400:
                continue
            yy, xx = cms[j]
            if int(xx // cw) == cx and int(yy // ch) == cy:
                keep |= lab == j + 1
                if big < 0 or sizes[j] > sizes[big]:
                    big = j
        ys, xs = np.nonzero(keep)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        if scale is None:
            # 첫 컷의 몸(가장 큰 덩어리, 날아가는 검 제외) 면적을 서 있는 몸 면적에 맞춤
            scale = k * (stand_area / float(sizes[big])) ** 0.5
            print('크기', round(scale, 4), '서 있는 면적', stand_area, '첫 컷 면적', int(sizes[big]))
        crop = rgba[y0:y1, x0:x1].copy()
        crop[..., 3] = np.where(keep[y0:y1, x0:x1], crop[..., 3], 0)
        im = Image.fromarray(crop, 'RGBA')
        w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
        im = im.resize((w, h), Image.LANCZOS)
        out = os.path.join(root, name, f'{i}.png')
        im.save(out)
        # 바닥: 맨 아래 20px 줄의 불투명 픽셀 가운데
        band = keep[y1 - 20:y1, x0:x1]
        bx = np.nonzero(band.any(axis=0))[0]
        px = (bx.min() + bx.max()) / 2 if len(bx) else (x1 - x0) / 2
        frames.append({'img': f'{name}/{i}.png', 'w': w, 'h': h, 'pivot': [round(px * scale, 1), h]})
        print(name, i, w, h)

    times = [float(t) for t in times.split(',')] if times else [0.12] * (len(frames) - 1) + [0]
    path = os.path.join(root, 'anims.json')
    anims = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    anims[name] = {'frames': frames, 'times': times}
    json.dump(anims, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(root, 'anims.js'), 'w', encoding='utf-8') as f:
        f.write('window.ANIMS = window.ANIMS || {}; window.ANIMS[%s] = %s;\n' % (json.dumps(os.path.basename(os.path.normpath(root))), json.dumps(anims, ensure_ascii=False)))


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit('사용: python tools/cut_frames.py art/<id> <동작> [열] [행] [k] [초 간격]')
    main(*sys.argv[1:])
