"""머리 없는 웅크린 몸 시트(앞 · 뒤 두 칸) → 리그의 웅크림 파츠.

앞 · 뒤 시점 엄폐 웅크림 때 rig.js 가 몸 파츠들 대신 이 한 장을 그리고, 그 위 목 자리에 개체 머리 파츠(head_f<n>)를 얹음.
크기: 목 → 발 높이 = 서 있는 리그 목 → 땅 의 67%. 발 = 리그 땅 자리.
→ art/<리그>/parts/<front|back>/crouch.png + rig.json views[시점].crouch = {img, x, y, w, h, neck}

사용: python war/tools/crouch.py art/src/gpt/crouch_rat.png rat
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


def shoulder(alpha, frac=0.18):
    ys = np.nonzero(alpha.any(1))[0]
    top, bot = ys.min(), ys.max()
    band = alpha[top:top + max(2, int((bot - top) * frac))]
    xs = np.nonzero(band.any(0))[0]
    return top, bot, xs.min(), xs.max() + 1


def main(src, rig_name):
    d = os.path.join(ART, rig_name)
    rig = json.load(open(os.path.join(d, 'rig.json'), encoding='utf-8'))
    rgba = key_magenta(Image.open(src))
    H, W = rgba.shape[:2]
    for i, v in enumerate(('front', 'back')):
        half = rgba[:, i * W // 2:(i + 1) * W // 2].copy()
        a = half[..., 3] > 30
        lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=3))
        if n > 1:  # 가장 큰 덩어리(몸)만
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            half[..., 3] = np.where(lab == sizes.argmax() + 1, half[..., 3], 0)
        ys, xs = np.nonzero(half[..., 3] > 30)
        body = half[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        V = rig['views'][v]
        # 크기: 웅크린 몸(목 → 발) = 서 있는 리그 목 → 땅 의 67%
        stand = V['ground'][1] - V['parts']['head']['pivot'][1]
        ys2 = np.nonzero((body[..., 3] > 60).any(1))[0]
        s = stand * 0.67 / max(1, ys2.max() - ys2.min())
        im = Image.fromarray(body, 'RGBA')
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        im.save(os.path.join(d, 'parts', v, 'crouch.png'))
        # 목: 위쪽 40% 안의 살색(분홍) 덩어리 중 가장 위 = 목 토막 (총 끝이 더 높이 있어도 안 헷갈리게)
        arr = np.asarray(im).astype(np.int32)
        r_, g_, b_, al = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
        if rig_name.startswith('cat'):  # 고양이 목 = 회색 털
            pink = (al > 120) & (np.abs(r_ - g_) < 14) & (np.abs(g_ - b_) < 14) & (r_ > 105) & (r_ < 215)
        else:
            pink = (al > 120) & (r_ > 190) & (r_ - g_ > 20) & (r_ - b_ > 10) & (g_ > 110)
        pink[int(im.height * 0.4):] = False
        lab, n = ndimage.label(pink)
        if n:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            cands = [k + 1 for k in range(n) if sizes[k] >= 25]
            k = min(cands or [int(np.argmax(sizes)) + 1], key=lambda k: np.nonzero(lab == k)[0].min())
            ys3, xs3 = np.nonzero(lab == k)
            nx, ny = (xs3.min() + xs3.max()) / 2, ys3.min() + (ys3.max() - ys3.min()) * 0.6
        else:
            nx, ny = im.width / 2, 8
        gx, gy = V['ground']
        x0 = gx - nx  # 머리가 발 자리 바로 위
        y0 = gy - im.height
        # 예전 엄폐 통그림 자세: 앞 웅크림은 고개를 옆으로 돌림 → 옆 머리 파츠, 뒤 웅크림 → 뒤 머리 파츠
        V['crouch'] = {'img': f'parts/{v}/crouch.png', 'x': round(float(x0), 2), 'y': round(float(y0), 2), 'w': im.width, 'h': im.height,
                       'neck': [round(float(x0 + nx), 2), round(float(y0 + ny), 2)], 'head': 'side' if v == 'front' else 'back'}
        print(v, '배율', round(s, 3), V['crouch'])
    json.dump(rig, open(os.path.join(d, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(d, 'rig.js'), 'w', encoding='utf-8') as fp:
        fp.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(rig_name), json.dumps(rig, ensure_ascii=False)))
    bundle()


if __name__ == '__main__':
    main(*sys.argv[1:3])
