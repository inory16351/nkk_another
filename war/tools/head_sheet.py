"""병종별 머리 파츠 시트 (개체 N줄 × 앞 · 옆 · 뒤 3칸, 모두 그 병종 모자를 씀) → 병종 리그의 개체 머리 파츠.

각 머리를 병종 리그 head 파츠 칸에 맞춤: 모자 부분(실루엣 위 40%)의 폭 · 가운데 · 윗선을 원래 head 파츠와 같게.
→ art/<리그>/parts/<시점>/head_f<n>.png (head 파츠와 같은 크기) + rig.json head.faces = 개체 수

사용: python war/tools/head_sheet.py art/src/gpt/heads_rat_recruit.png rat [줄 수=7]
     리그 이름: rat (소총수) · rat_sniper · cat_officer …
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
VIEWS = ('front', 'side', 'back')


def cells(rgba, rows):
    """머리 덩어리들 → [줄][칸] 자르기 (RGBA 배열)"""
    # 세로 칸(앞 · 옆 · 뒤)마다: 큰 덩어리 rows 개 = 머리 (위 → 아래). 수염 끝 같은 작은 조각은 가까운 머리에 붙임
    H, W = rgba.shape[:2]
    cols = []
    for c in range(3):
        sub = rgba[:, c * W // 3:(c + 1) * W // 3]
        a = sub[..., 3] > 30
        lab, n = ndimage.label(a)
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        big = (np.argsort(sizes)[::-1][:rows] + 1).tolist()
        cents = {k: ndimage.center_of_mass(lab == k) for k in big}
        big.sort(key=lambda k: cents[k][0])
        owner = np.zeros_like(lab)
        for k in big:
            owner[lab == k] = k
        # 작은 조각 → 세로 거리 가장 가까운 머리
        for k in range(1, n + 1):
            if k in big:
                continue
            cy = ndimage.center_of_mass(lab == k)[0]
            owner[lab == k] = min(big, key=lambda b: abs(cents[b][0] - cy))
        heads = []
        for k in big:
            m = owner == k
            ys, xs = np.nonzero(m)
            crop = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
            crop[..., 3] = np.where(m[ys.min():ys.max() + 1, xs.min():xs.max() + 1], crop[..., 3], 0)
            heads.append(crop)
        cols.append(heads)
    return [[cols[c][r] for c in range(3)] for r in range(rows)]


def cap_box(alpha):
    """실루엣 위 40% (모자 · 귀) 의 가로 범위와 맨 윗줄"""
    ys = np.nonzero(alpha.any(1))[0]
    top, bot = ys.min(), ys.max()
    cut = top + int((bot - top) * 0.4)
    xs = np.nonzero(alpha[top:cut].any(0))[0]
    return top, xs.min(), xs.max() + 1


def main(src, rig_name, rows=7):
    rows = int(rows)
    d = os.path.join(ART, rig_name)
    rig = json.load(open(os.path.join(d, 'rig.json'), encoding='utf-8'))
    grid = cells(key_magenta(Image.open(src)), rows)
    for vi, v in enumerate(VIEWS):
        P = rig['views'][v]['parts']['head']
        ref = np.asarray(Image.open(os.path.join(d, P['img'])).convert('RGBA'))
        rt, rx0, rx1 = cap_box(ref[..., 3] > 60)
        for f in range(rows):
            g = grid[f][vi]
            gt, gx0, gx1 = cap_box(g[..., 3] > 60)
            s = (rx1 - rx0) / max(1, gx1 - gx0)
            im = Image.fromarray(g, 'RGBA')
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
            canvas = Image.new('RGBA', (P['w'], P['h']), (0, 0, 0, 0))
            ox = round((rx0 + rx1) / 2 - (gx0 + gx1) / 2 * s)
            oy = round(rt - gt * s)
            canvas.alpha_composite(im, (ox, oy)) if ox >= 0 and oy >= 0 else canvas.paste(im, (ox, oy), im)
            canvas.save(os.path.join(d, 'parts', v, f'head_f{f}.png'))
        P['faces'] = rows
    json.dump(rig, open(os.path.join(d, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(d, 'rig.js'), 'w', encoding='utf-8') as fp:
        fp.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(rig_name), json.dumps(rig, ensure_ascii=False)))
    bundle()
    print('머리', rig_name, rows)


if __name__ == '__main__':
    main(*sys.argv[1:])
