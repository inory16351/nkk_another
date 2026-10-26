"""병종 머리 = 개체 얼굴 + 병종 모자. 모자 파츠 뽑기.

병종 시트의 머리(헬멧 · 두건 · 위장 철모 …)에서 맨머리 기준 시트(rat_face0 = 헬멧만 벗긴 기본 쥐)와
다른 픽셀만 남기면 모자. 같은 자리 · 같은 크기로 뽑은 시트라 그대로 겹침.
→ art/<종>_<병종>/parts/<시점>/hat.png (병종 head 파츠와 같은 x · y · w · h) + rig.json/js 의 head 에 hat 표시

사용: python war/tools/hats.py [rat|cat]
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from rig_cut import key_magenta, poly_mask  # noqa: E402

ART = os.path.join(os.path.dirname(__file__), '..', 'art')


def face_palette(bare_rgba, head_poly, k=10):
    """맨머리 그림의 머리 영역 색 묶음(털 · 귀 · 코 · 수염 · 눈) — 간단한 k-평균"""
    H, W = bare_rgba.shape[:2]
    m = (bare_rgba[..., 3] > 200) & poly_mask(head_poly, W, H)
    px = bare_rgba[m][:, :3].astype(np.float32)
    rng = np.random.default_rng(1)
    px = px[rng.choice(len(px), min(len(px), 6000), replace=False)]
    cen = px[rng.choice(len(px), k, replace=False)]
    for _ in range(12):
        lab = np.argmin(((px[:, None] - cen[None]) ** 2).sum(-1), 1)
        cen = np.array([px[lab == i].mean(0) if (lab == i).any() else cen[i] for i in range(k)])
    return cen


def hat_mask(cls_rgba, bare_rgba, head_poly):
    H, W = cls_rgba.shape[:2]
    a1 = cls_rgba[..., 3] > 40
    a0 = bare_rgba[..., 3] > 40
    d = np.abs(cls_rgba[..., :3].astype(np.int32) - bare_rgba[..., :3].astype(np.int32)).sum(-1)
    region = poly_mask(head_poly, W, H)
    # 맨머리 색 묶음에서 먼 색 = 모자 (헬멧 색이 털과 같은 자리에 있어도 잡힘)
    pal = face_palette(bare_rgba, head_poly)
    c = cls_rgba[..., :3].astype(np.float32)
    far = np.sqrt(((c[..., None, :] - pal[None, None]) ** 2).sum(-1)).min(-1) > 30
    m = a1 & region & (far | (~a0) | (d > 90))
    m = ndimage.binary_opening(m, iterations=3)  # 안테나 · 끈 같은 가는 줄과 잡음 버림
    # 작은 조각(옷깃 · 털 차이) 버리고 큰 덩어리만
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        m = np.isin(lab, np.nonzero(sizes >= max(300, sizes.max() * 0.15))[0] + 1)
    # 헬멧 색이 털과 비슷해 뚫린 곳 메우기
    # 작은 구멍만 메움 (얼굴을 둘러싼 큰 구멍 = 얼굴은 그대로 둠)
    filled = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=3))
    holes = filled & ~m
    lab, n = ndimage.label(holes)
    if n:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        m |= np.isin(lab, np.nonzero(sizes < 2500)[0] + 1)
    return ndimage.binary_dilation(m, iterations=1) & a1


def main(sp='rat'):
    bare = os.path.join(ART, f'{sp}_face0')
    src = json.load(open(os.path.join(ART, sp, 'rig_src.json'), encoding='utf-8'))
    for d in [os.path.join(ART, sp)] + sorted(glob.glob(os.path.join(ART, f'{sp}_*'))):
        name = os.path.basename(d)
        if '_face' in name or not os.path.exists(os.path.join(d, 'rig.json')):
            continue
        rig = json.load(open(os.path.join(d, 'rig.json'), encoding='utf-8'))
        sc = rig['scale']
        for v, V in src['views'].items():
            head_poly = next(r['poly'] for r in V['rules'] if r['to'] == 'head')
            c = key_magenta(Image.open(os.path.join(d, f'full_{v}.png')))
            b = key_magenta(Image.open(os.path.join(bare, f'full_{v}.png')))
            m = hat_mask(c, b, head_poly)
            P = rig['views'][v]['parts']['head']
            x0, y0 = round(P['x'] / sc), round(P['y'] / sc)
            w0, h0 = round(P['w'] / sc), round(P['h'] / sc)
            crop = c[y0:y0 + h0, x0:x0 + w0].copy()
            crop[..., 3] = np.where(m[y0:y0 + h0, x0:x0 + w0], crop[..., 3], 0)
            Image.fromarray(crop, 'RGBA').resize((P['w'], P['h']), Image.LANCZOS).save(os.path.join(d, 'parts', v, 'hat.png'))
            P['hat'] = f'parts/{v}/hat.png'
        json.dump(rig, open(os.path.join(d, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        with open(os.path.join(d, 'rig.js'), 'w', encoding='utf-8') as f:
            f.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(name), json.dumps(rig, ensure_ascii=False)))
        print('모자', name)
    bundle()


def bundle():
    """art/*/rig.js 를 하나로 → art/rigs.js (index.html 은 이것만 불러옴)"""
    parts = []
    for p in sorted(glob.glob(os.path.join(ART, '*', 'rig.js'))):
        if '_face' in os.path.basename(os.path.dirname(p)):
            continue  # 얼굴 리그는 머리 파츠 시트 만들 때 참조용 (게임에선 병종 리그의 head_f<n> 을 씀)
        parts.append(open(p, encoding='utf-8').read())
    with open(os.path.join(ART, 'rigs.js'), 'w', encoding='utf-8') as f:
        f.write(''.join(parts))
    print('묶음', len(parts))


if __name__ == '__main__':
    if sys.argv[1:] == ['bundle']:
        bundle()
    else:
        main(*(sys.argv[1:] or ['rat']))
