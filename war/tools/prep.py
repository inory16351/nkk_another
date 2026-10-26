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
            # 둑 칸은 위 8% 를 깎음 (윗칸 길 그림이 칸 경계를 넘어 내려와 있음)
            top = cy * H // 2 + (H // 2 * 8 // 100 if name == 'cliff' else 2)
            t = im.crop((cx * W // 3 + 2, top, (cx + 1) * W // 3 - 2, (cy + 1) * H // 2 - 2)).resize((256, 256), Image.LANCZOS)
            t.save(os.path.join(OUT, 'terrain', name + '.png'))
            A['terrain'][name] = {'img': f'terrain/{name}.png', 'w': 256, 'h': 256}
        print('terrain', len(TERRAIN))
    # 배경 층 (소품과 같은 그림체, 위→아래 4줄): 먼 도시 · 먼 언덕 · 맵 바로 뒤 들판 · 앞 가림
    # 줄 경계는 마젠타만 있는 가로줄로 찾음. backdrop.png(예전 3줄)는 안 씀
    f = os.path.join(SRC, 'layers.png')
    if os.path.exists(f):
        # 연기 · 철조망 · 풍차 날개처럼 마젠타와 섞인 반투명 부분: 무채색 그림이 마젠타 위에 겹쳤다고 보고 풀어냄
        # (key_magenta 는 옅게 섞인 연기를 불투명 보라로 남기고, 분홍기 지우기는 가는 철조망을 통째로 지웠음)
        src = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        m = np.clip(np.minimum(src[..., 0], src[..., 2]) - src[..., 1], 0, 255)
        alpha = 1.0 - m / 255.0
        alpha = np.clip((alpha - 0.1) / 0.9, 0, 1)  # 배경 마젠타의 잡티 걷기
        mag = np.array([255.0, 0.0, 255.0])
        rgb = (src - (1.0 - alpha)[..., None] * mag) / np.maximum(alpha, 0.05)[..., None]
        rgb = np.clip(np.where(alpha[..., None] > 0.02, rgb, 0), 0, 255)
        rgba = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
        filled = (rgba[..., 3] > 40).mean(axis=1) > 0.02
        runs, y = [], 0
        while y < len(filled):
            if filled[y]:
                s = y
                while y < len(filled) and filled[y]:
                    y += 1
                if y - s > 60:
                    runs.append((s, y))
            y += 1
        names = ['far', 'hills', 'field', 'front']
        if len(runs) != len(names):
            raise SystemExit(f'layers.png 줄 {len(runs)}개 (4개여야 함): {runs}')
        out = os.path.join(OUT, 'backdrop')
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            os.remove(os.path.join(out, old))
        A['backdrop'] = {}
        for name, (y0, y1) in zip(names, runs):
            strip = np.ascontiguousarray(rgba[y0:y1])
            Image.fromarray(strip, 'RGBA').save(os.path.join(out, name + '.png'))
            A['backdrop'][name] = {'img': f'backdrop/{name}.png', 'w': strip.shape[1], 'h': strip.shape[0]}
        print('backdrop', len(names))
    json.dump(A, open(os.path.join(OUT, 'assets.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, 'assets.js'), 'w', encoding='utf-8') as fh:
        fh.write('window.ART = %s;\n' % json.dumps(A, ensure_ascii=False))
    # 리그도 JS 로 (rig_cut 이 쓴 rig.js 는 이름만 다름)
    print('저장', OUT)


if __name__ == '__main__':
    main()
