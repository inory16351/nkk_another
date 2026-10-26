"""ChatGPT 시트(art/src/gpt) → 게임용 그림(art/out) + art/out/assets.js

- 통그림 자세(rat_poses · cat_poses, 3×2): 엄폐(옆·앞·뒤) · 무릎 조준 · 투척 · 박격포
  크기 = 컷 몸 면적을 리그 옆모습 몸 면적에 맞춤 (cut_frames.py 방식) × k
- 소품(props, 3×3) · 무기(weapons, 3×2): 칸마다 덩어리를 꼭 맞게 잘라 바닥 가운데 기준점
- 지형(terrain, 3×2): 512 칸 그대로 (앞 5칸 = 바닥 무늬, 6칸 = 언덕 옆면)
- 배경(backdrop, 세로 3줄): 먼 · 중간 · 앞 가림 층, 마젠타 빼고 그대로

사용: python war/tools/prep.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig_cut import key_magenta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'art', 'src', 'gpt')
OUT = os.path.join(ROOT, 'art', 'out')

POSES = ['cover_side', 'cover_front', 'cover_back', 'kneel', 'throw', 'mortar']
POSE_H = {'cover_side': 0.64, 'cover_front': 0.66, 'cover_back': 0.64, 'kneel': 0.68, 'throw': 1.08, 'mortar': 0.62}
PROPS = ['S', 'W', 'T', 'C', 'X', 'M', 'G', 'R', 'H']
WEAPONS = ['rifle', 'lmg', 'sniper', 'smg', 'shotgun', 'grenades']
TERRAIN = ['grass', 'mud', 'road', 'dry', 'wet', 'cliff']


def blobs_in_cells(rgba, cols, rows, min_size=300):
    """칸마다 그 칸에 무게중심이 있는 덩어리들의 마스크."""
    fg = ndimage.binary_opening(rgba[..., 3] > 40, iterations=1)
    H, W = fg.shape
    cw, ch = W / cols, H / rows
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    cms = ndimage.center_of_mass(fg, lab, range(1, n + 1))
    cells = [np.zeros_like(fg) for _ in range(cols * rows)]
    big = [0] * (cols * rows)
    for j in range(n):
        if sizes[j] < min_size:
            continue
        cy, cx = cms[j]
        k = int(cy // ch) * cols + int(cx // cw)
        if 0 <= k < len(cells):
            cells[k] |= lab == j + 1
            big[k] = max(big[k], int(sizes[j]))
    return cells, big


def crop_save(rgba, mask, path, scale=1.0):
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = rgba[y0:y1, x0:x1].copy()
    crop[..., 3] = np.where(mask[y0:y1, x0:x1], crop[..., 3], 0)
    im = Image.fromarray(crop, 'RGBA')
    w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    if scale != 1.0:
        im = im.resize((w, h), Image.LANCZOS)
    im.save(path)
    # 기준점: 맨 아래 15px 줄 불투명 픽셀의 가운데
    band = mask[y1 - 15:y1, x0:x1]
    bx = np.nonzero(band.any(axis=0))[0]
    px = (bx.min() + bx.max()) / 2 if len(bx) else (x1 - x0) / 2
    return {'w': w, 'h': h, 'pivot': [round(px * scale, 1), h]}


def rig_side_area(sp):
    rig = json.load(open(os.path.join(ROOT, 'art', sp, 'rig.json'), encoding='utf-8'))
    area = 0
    for n, p in rig['views']['side']['parts'].items():
        a = np.asarray(Image.open(os.path.join(ROOT, 'art', sp, p['img'])))[..., 3]
        area += int((a > 128).sum())
    return area


def main():
    os.makedirs(OUT, exist_ok=True)
    A = {}
    for sp in ['rat', 'cat']:
        f = os.path.join(SRC, f'{sp}_poses.png')
        if not os.path.exists(f):
            continue
        rgba = key_magenta(Image.open(f))
        cells, big = blobs_in_cells(rgba, 3, 2)
        # ChatGPT 는 칸마다 축척이 달라서, 자세별 키(서 있는 키 470 기준 비율)로 맞춤
        A[sp] = {}
        for i, name in enumerate(POSES):
            ys = np.nonzero(cells[i].any(axis=1))[0]
            sc = 470 * POSE_H[name] / (ys.max() - ys.min() + 1)
            os.makedirs(os.path.join(OUT, sp), exist_ok=True)
            A[sp][name] = dict(crop_save(rgba, cells[i], os.path.join(OUT, sp, name + '.png'), sc), img=f'{sp}/{name}.png')
        print(sp, '자세', len(POSES))
    for key, names, cols, rows in [('props', PROPS, 3, 3), ('weapons', WEAPONS, 3, 2)]:
        f = os.path.join(SRC, key + '.png')
        if not os.path.exists(f):
            continue
        rgba = key_magenta(Image.open(f))
        cells, _ = blobs_in_cells(rgba, cols, rows)
        os.makedirs(os.path.join(OUT, key), exist_ok=True)
        A[key] = {}
        for i, name in enumerate(names):
            if not cells[i].any():
                continue
            A[key][name] = dict(crop_save(rgba, cells[i], os.path.join(OUT, key, name + '.png')), img=f'{key}/{name}.png')
        print(key, len(A[key]))
    f = os.path.join(SRC, 'terrain.png')
    if os.path.exists(f):
        im = Image.open(f).convert('RGB')
        W, H = im.size
        os.makedirs(os.path.join(OUT, 'terrain'), exist_ok=True)
        A['terrain'] = {}
        for i, name in enumerate(TERRAIN):
            cx, cy = i % 3, i // 3
            t = im.crop((cx * W // 3 + 2, cy * H // 2 + 2, (cx + 1) * W // 3 - 2, (cy + 1) * H // 2 - 2)).resize((256, 256), Image.LANCZOS)
            t.save(os.path.join(OUT, 'terrain', name + '.png'))
            A['terrain'][name] = {'img': f'terrain/{name}.png', 'w': 256, 'h': 256}
        print('terrain', len(TERRAIN))
    f = os.path.join(SRC, 'backdrop.png')
    if os.path.exists(f):
        rgba = key_magenta(Image.open(f))
        # 철조망 · 풀 사이 좁은 틈에 남은 분홍 번짐: 분홍기 있는 픽셀은 지우고 테두리 1px 깎음
        src = np.asarray(Image.open(f).convert('RGB')).astype(np.int32)
        pinkish = (src[..., 0] - src[..., 1] > 40) & (src[..., 2] - src[..., 1] > 40)
        a = rgba[..., 3].copy()
        a[pinkish] = 0
        a = np.where(ndimage.binary_erosion(a > 128, iterations=1), a, 0).astype(np.uint8)
        rgba[..., 3] = a
        H = rgba.shape[0]
        os.makedirs(os.path.join(OUT, 'backdrop'), exist_ok=True)
        A['backdrop'] = {}
        for i, name in enumerate(['far', 'mid', 'near']):
            strip = rgba[i * H // 3:(i + 1) * H // 3]
            ys = np.nonzero((strip[..., 3] > 40).any(axis=1))[0]
            strip = strip[ys.min():ys.max() + 1] if len(ys) else strip
            if name == 'near':
                # 가까운 실루엣은 밝기로 3톤만 (풀 끝 색 번짐 없애고 더 평평하게)
                strip = strip.copy()
                lum = strip[..., :3].astype(np.float32).mean(axis=2)
                tones = np.array([[46, 40, 28], [62, 54, 36], [80, 70, 46]], np.uint8)
                idx = np.digitize(lum, [55, 75])
                strip[..., :3] = tones[idx]
            Image.fromarray(np.ascontiguousarray(strip), 'RGBA').save(os.path.join(OUT, 'backdrop', name + '.png'))
            A['backdrop'][name] = {'img': f'backdrop/{name}.png', 'w': strip.shape[1], 'h': strip.shape[0]}
        print('backdrop 3')
    json.dump(A, open(os.path.join(OUT, 'assets.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, 'assets.js'), 'w', encoding='utf-8') as fh:
        fh.write('window.ART = %s;\n' % json.dumps(A, ensure_ascii=False))
    # 리그도 JS 로 (rig_cut 이 쓴 rig.js 는 이름만 다름)
    print('저장', OUT)


if __name__ == '__main__':
    main()
