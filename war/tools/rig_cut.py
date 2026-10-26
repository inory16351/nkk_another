"""인간형 쥐 리그 부위 자르기.

art/<id>/rig_src.json (뼈 · 영역 규칙) + 시점별 통그림(마젠타 배경)
  → art/<id>/parts/<시점>/<부위>.png + art/<id>/rig.json

사용: python tools/rig_cut.py art/knight [시점...]

부위 배정 순서
  1) rules 를 위에서부터: 다각형(poly) · 색(color) · y 범위 조건에 맞는 픽셀을 그 부위(to)로
     to 가 목록이면 그 뼈들 중 가장 가까운 뼈로
  2) 남은 픽셀은 default 뼈들 중 (선분까지 거리 − bias) 가 가장 작은 뼈로
관절 겹침: 부모가 있는 부위는 피벗 둘레 cap 반경 안의 부모 픽셀도 함께 가짐 → 돌려도 틈이 안 생김
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
import cv2


def key_magenta(img):
    """마젠타 배경을 투명으로, 가장자리 마젠타 번짐은 걷어 낸다."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g  # 마젠타 정도
    alpha = np.clip((190.0 - m) / 90.0, 0.0, 1.0)
    # 반투명 가장자리: 마젠타 성분을 빼서 색 되살림
    spill = (1.0 - alpha)[..., None]
    mag = np.array([255.0, 0.0, 255.0])
    rgb = np.where(alpha[..., None] > 0.02, (a - spill * mag) / np.maximum(alpha[..., None], 0.02), 0)
    rgb = np.clip(rgb, 0, 255)
    out = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    return out


def poly_mask(poly, w, h):
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in poly], fill=1)
    return np.asarray(im).astype(bool)


def color_mask(rgba, name):
    r, g, b = (rgba[..., i].astype(np.int32) for i in range(3))
    if name == 'red':
        return (r > 150) & (r - g > 90) & (r - b > 80)
    if name == 'pink':
        # 살 · 꼬리 분홍 (금색 손잡이는 b 가 낮아서 빠짐)
        return (r > 200) & (r - g > 25) & (r - b > 15) & (g > 120) & (b > 110)
    if name == 'notred':
        return ~((r > 150) & (r - g > 90) & (r - b > 80))
    if name == 'dark':
        return np.maximum(np.maximum(r, g), b) < 95
    if name == 'light':
        # 밝은 회색 털 (고양이 꼬리) — 채도 낮고 밝음
        return (np.minimum(np.minimum(r, g), b) > 118) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 12)
    if name == 'notpink':
        return ~color_mask(rgba, 'pink')
    if name == 'sword':
        # 칼날 흰색 · 무늬 파랑 · 손잡이 금색만 (뒤에 겹친 귀 · 헬멧 가장자리 제외)
        white = np.minimum(np.minimum(r, g), b) > 175
        blue = (b > r + 40) & (b > 120)
        gold = (r > 170) & (g > 110) & (b < 130) & (r - b > 70)
        return (white | blue | gold) & ~color_mask(rgba, 'pink')
    raise ValueError('모르는 색 조건 ' + name)


def seg_dist(xs, ys, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy or 1.0
    t = np.clip(((xs - ax) * dx + (ys - ay) * dy) / L2, 0, 1)
    px, py = ax + t * dx, ay + t * dy
    return np.hypot(xs - px, ys - py)


def nearest(bones, names, xs, ys):
    """names 뼈들 중 가장 가까운 뼈 번호 (names 기준 인덱스)."""
    d = np.stack([seg_dist(xs, ys, bones[n]['a'], bones[n]['b']) - bones[n].get('bias', 0) for n in names])
    return np.argmin(d, axis=0)


def clean_islands(owner, alpha, n_parts, ratio=0.2, keep=()):
    """부위 본체와 떨어진 작은 조각(칼날 테두리 · 귀 가장자리 등)을 맞닿은 부위로 넘긴다.
    keep 부위(검처럼 손에 가려 두 동강 난 것)는 조각을 그대로 둔다."""
    for _ in range(3):
        moved = 0
        for k in range(n_parts):
            if k in keep:
                continue
            lab, n = ndimage.label(owner == k)
            if n <= 1:
                continue
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            big = sizes.max()
            for c in np.nonzero(sizes < big * ratio)[0]:
                comp = lab == (c + 1)
                ring = ndimage.binary_dilation(comp, iterations=2) & ~comp & alpha
                nb = owner[ring]
                nb = nb[(nb >= 0) & (nb != k)]
                if len(nb):
                    owner[comp] = np.bincount(nb).argmax()
                    moved += 1
        if not moved:
            break


def build_view(root, vname, V, scale):
    src = Image.open(os.path.join(root, V['src']))
    rgba = key_magenta(src)
    H, W = rgba.shape[:2]
    alpha = rgba[..., 3] > 10
    bones = V['bones']
    names = list(bones.keys())
    owner = np.full((H, W), -1, np.int32)
    idx = {n: i for i, n in enumerate(names)}
    ys, xs = np.mgrid[0:H, 0:W]

    for rule in V.get('rules', []):
        m = alpha & (owner < 0)
        if 'poly' in rule:
            pm = poly_mask(rule['poly'], W, H)
            if rule.get('grow'):
                pm = ndimage.binary_dilation(pm, iterations=rule['grow'])
            m &= pm
        if 'color' in rule:
            m &= color_mask(rgba, rule['color'])
        if 'y' in rule:
            m &= (ys >= rule['y'][0]) & (ys <= rule['y'][1])
        if 'x' in rule:
            m &= (xs >= rule['x'][0]) & (xs <= rule['x'][1])
        to = rule['to']
        if isinstance(to, str):
            owner[m] = idx[to]
        else:
            sel = np.nonzero(m)
            k = nearest(bones, to, xs[sel].astype(np.float32), ys[sel].astype(np.float32))
            owner[sel] = np.array([idx[to[j]] for j in k]) if len(k) else owner[sel]

    rest = np.nonzero(alpha & (owner < 0))
    dflt = V['default']
    k = nearest(bones, dflt, xs[rest].astype(np.float32), ys[rest].astype(np.float32))
    owner[rest] = np.array([idx[dflt[j]] for j in k])
    clean_islands(owner, alpha, len(names), keep={idx[n] for n in names if bones[n].get('keep')})

    # 가려진 자리 메우기: 팔이 몸통 앞에 있던 자리는 몸통 그림에 구멍 → 팔을 들면 보임.
    # fill = {부위: {"from": [가린 부위...], "poly": 범위}} → 그 자리를 주변 색으로 칠해 부위에 더함
    fill_img, fill_mask = {}, {}
    for n, F in V.get('fill', {}).items():
        hole = np.isin(owner, [idx[f] for f in F['from']]) & alpha
        if 'poly' in F:
            hole &= poly_mask(F['poly'], W, H)
        rgb = np.ascontiguousarray(rgba[..., :3])
        # 다른 부위 색이 번지지 않게: 칠할 부위 + 구멍만 남기고 나머지도 모름으로 둠
        known = owner == idx[n]
        unknown = (hole | ~known).astype(np.uint8) * 255
        filled = cv2.inpaint(rgb, unknown, 12, cv2.INPAINT_TELEA)
        out = rgba.copy()
        out[hole, :3] = filled[hole]
        out[hole, 3] = 255
        fill_img[n], fill_mask[n] = out, hole

    out_dir = os.path.join(root, 'parts', vname)
    os.makedirs(out_dir, exist_ok=True)
    parts = {}
    inv = 1.0 / scale
    for n in names:
        B = bones[n]
        m = owner == idx[n]
        par = B.get('parent')
        cap = B.get('cap', V.get('cap', 0))
        if par and cap:
            near = np.hypot(xs - B['a'][0], ys - B['a'][1]) <= cap
            m = m | (near & (owner == idx[par]))
        # 이웃과 몇 px 겹치게: 따로 줄이면 생기는 반투명 이음선 막기
        if not B.get('keep'):
            m = m | (ndimage.binary_dilation(m, iterations=V.get('overlap', 3)) & alpha)
        # 받침: 위에 그려지는 부위의 아래쪽 띠를 같이 가짐 → 위 부위가 기울어도 틈이 안 보임
        U = V.get('under', {}).get(n)
        if U:
            m = m | (np.isin(owner, [idx[f] for f in U['from'] if f in idx]) & poly_mask(U['poly'], W, H))
        src_img = rgba
        if n in fill_mask:
            m = m | fill_mask[n]
            src_img = fill_img[n]
        if not m.any():
            print(f'  [{vname}] {n}: 픽셀 없음')
            continue
        yy, xx = np.nonzero(m)
        # 자르는 칸을 배율 격자에 맞춰 위치 · 크기가 정확히 맞게
        g = max(1, round(inv))
        x0, y0 = (xx.min() // g) * g, (yy.min() // g) * g
        x1, y1 = -(-(xx.max() + 1) // g) * g, -(-(yy.max() + 1) // g) * g
        crop = src_img[y0:y1, x0:x1].copy()
        crop[..., 3] = np.where(m[y0:y1, x0:x1], crop[..., 3], 0)
        im = Image.fromarray(crop, 'RGBA')
        sw, sh = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
        im = im.resize((sw, sh), Image.LANCZOS)
        im.save(os.path.join(out_dir, n + '.png'))
        parts[n] = {
            'parent': par,
            'pivot': [round(B['a'][0] * scale, 2), round(B['a'][1] * scale, 2)],
            'end': [round(B['b'][0] * scale, 2), round(B['b'][1] * scale, 2)],
            'img': f'parts/{vname}/{n}.png',
            'x': round(x0 * scale, 2), 'y': round(y0 * scale, 2), 'w': sw, 'h': sh,
        }
    # 복제 부위: 그림에 안 보이는 먼 쪽 팔다리 = 가까운 쪽을 어둡게 복사 (underworld 방식)
    for cn, Cl in V.get('clones', {}).items():
        src = parts[Cl['from']]
        if 'pivot' in Cl:
            d = [Cl['pivot'][0] * scale - src['pivot'][0], Cl['pivot'][1] * scale - src['pivot'][1]]
        else:  # 부모 복제와 같은 만큼 옮김
            d = V['clones'][Cl['parent']]['_d']
        Cl['_d'] = d
        parts[cn] = dict(src, parent=Cl['parent'], dark=Cl.get('dark', 0.7),
                         pivot=[src['pivot'][0] + d[0], src['pivot'][1] + d[1]],
                         end=[src['end'][0] + d[0], src['end'][1] + d[1]],
                         x=round(src['x'] + d[0], 2), y=round(src['y'] + d[1], 2))
    # 배정 결과 확인용 그림
    rng = np.random.default_rng(3)
    pal = rng.integers(40, 255, (len(names), 3))
    dbg = np.zeros((H, W, 3), np.uint8) + 255
    sel = owner >= 0
    dbg[sel] = pal[owner[sel]]
    dim = Image.fromarray(dbg)
    d = ImageDraw.Draw(dim)
    for n in names:
        a, b = bones[n]['a'], bones[n]['b']
        d.line([tuple(a), tuple(b)], fill=(0, 0, 0), width=4)
        d.ellipse([a[0] - 7, a[1] - 7, a[0] + 7, a[1] + 7], fill=(0, 0, 0))
        d.text((a[0] + 9, a[1] - 6), n, fill=(0, 0, 0))
    dim.save(os.path.join(root, f'_assign_{vname}.png'))
    return {
        'w': round(W * scale), 'h': round(H * scale),
        'ground': [round(V['ground'][0] * scale, 2), round(V['ground'][1] * scale, 2)],
        'order': V['order'], 'parts': parts,
    }


def main(root, *views):
    spec = json.load(open(os.path.join(root, 'rig_src.json'), encoding='utf-8'))
    scale = spec.get('scale', 1.0)
    rig_path = os.path.join(root, 'rig.json')
    rig = json.load(open(rig_path, encoding='utf-8')) if os.path.exists(rig_path) else {}
    rig['scale'] = scale
    rig.setdefault('views', {})
    for vname, V in spec['views'].items():
        if views and vname not in views:
            continue
        print('자르기', vname)
        rig['views'][vname] = build_view(root, vname, V, scale)
    json.dump(rig, open(rig_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # 웹에서 file:// 로도 열리게 JS 로도 씀
    with open(os.path.join(root, 'rig.js'), 'w', encoding='utf-8') as f:
        f.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(os.path.basename(os.path.normpath(root))), json.dumps(rig, ensure_ascii=False)))
    print('저장', rig_path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('사용: python tools/rig_cut.py art/<id> [시점...]')
    main(sys.argv[1], *sys.argv[2:])
