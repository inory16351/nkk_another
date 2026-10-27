"""머리 없는 던지기 몸 시트(2×2: 윗줄 앞 · 아랫줄 뒤, 왼칸 들어올림 · 오른칸 던짐) → 리그의 던지기 파츠.

앞 · 뒤 시점 수류탄 투척 때 rig.js 가 몸 파츠들 대신 이 그림을 그리고, 목 자리에 개체 머리 파츠(head_f<n>)를 얹음.
크기: 목 → 발 높이 = 서 있는 리그 목 → 땅 × 0.97 (살짝 몸을 낮춘 자세). 발 = 리그 땅 자리.
→ art/<리그>/parts/<front|back>/throw0.png · throw1.png + rig.json views[시점].throw = [{img, x, y, w, h, neck}, …]

사용: python war/tools/throw.py art/src/gpt/throw_rat.png rat
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from rig_cut import key_magenta  # noqa: E402
from hats import bundle  # noqa: E402

ART = os.path.join(os.path.dirname(__file__), '..', 'art')


def biggest(cell):
    a = cell[..., 3] > 30
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=3))
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        cell[..., 3] = np.where(lab == sizes.argmax() + 1, cell[..., 3], 0)
    ys, xs = np.nonzero(cell[..., 3] > 30)
    return cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def neck_of(im, cat):
    """목 = 위쪽 45% 안의 살색 덩어리 중 발 가운데(아래 10% 의 가운데)에 가장 가까운 것 (치켜든 손과 안 헷갈리게)."""
    arr = np.asarray(im).astype(np.int32)
    r_, g_, b_, al = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    if cat:
        skin = (al > 120) & (np.abs(r_ - g_) < 14) & (np.abs(g_ - b_) < 14) & (r_ > 105) & (r_ < 215)
    else:
        skin = (al > 120) & (r_ > 190) & (r_ - g_ > 20) & (r_ - b_ > 10) & (g_ > 110)
    skin[int(im.height * 0.45):] = False
    # 발 가운데 = 아래 8% 불투명 점들의 평균 x (가는 꼬리 끝은 점이 적어 거의 안 끌림)
    fx = np.nonzero(al[int(im.height * 0.92):] > 60)[1]
    foot_x = fx.mean() if len(fx) else im.width / 2
    lab, n = ndimage.label(skin)
    if not n:
        return im.width / 2, 8
    # 발 가운데에서 폭 20% 안쪽 덩어리 중 가장 위 (치켜든 손 · 내민 손은 옆으로 빠져 있음)
    best = None
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < 25:
            continue
        cx = (xs.min() + xs.max()) / 2
        if abs(cx - foot_x) > im.width * 0.2:
            continue
        if best is None or ys.min() < best[0]:
            best = (ys.min(), cx, ys.min() + (ys.max() - ys.min()) * 0.6)
    return (best[1], best[2]) if best else (im.width / 2, 8)


def main(src, rig_name):
    d = os.path.join(ART, rig_name)
    rig = json.load(open(os.path.join(d, 'rig.json'), encoding='utf-8'))
    rgba = key_magenta(Image.open(src))
    H, W = rgba.shape[:2]
    for row, v in enumerate(('front', 'back')):
        V = rig['views'][v]
        stand = V['ground'][1] - V['parts']['head']['pivot'][1]
        frames = []
        for col in range(2):
            body = biggest(rgba[row * H // 2:(row + 1) * H // 2, col * W // 2:(col + 1) * W // 2].copy())
            im0 = Image.fromarray(body, 'RGBA')
            nx0, ny0 = neck_of(im0, rig_name.startswith('cat'))
            s = stand * 0.97 / max(1, im0.height - ny0)
            im = im0.resize((max(1, round(im0.width * s)), max(1, round(im0.height * s))), Image.LANCZOS)
            im.save(os.path.join(d, 'parts', v, f'throw{col}.png'))
            nx, ny = nx0 * s, ny0 * s
            gx, gy = V['ground']
            x0, y0 = gx - nx, gy - im.height
            frames.append({'img': f'parts/{v}/throw{col}.png', 'x': round(float(x0), 2), 'y': round(float(y0), 2), 'w': im.width, 'h': im.height,
                           'neck': [round(float(x0 + nx), 2), round(float(y0 + ny), 2)]})
            print(v, col, '배율', round(s, 3), frames[-1])
        V['throw'] = frames
    json.dump(rig, open(os.path.join(d, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(d, 'rig.js'), 'w', encoding='utf-8') as fp:
        fp.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(rig_name), json.dumps(rig, ensure_ascii=False)))
    bundle()


if __name__ == '__main__':
    main(*sys.argv[1:3])
