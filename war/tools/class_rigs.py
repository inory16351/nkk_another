"""병종 · 얼굴 몸 시트(기본 쥐 시트와 같은 자리 · 자세로 뽑은 것) → 각자 리그 파츠.

art/src/gpt/<종>_cls_<병종>.png  → art/<종>_<병종>/  (몸 파츠: 복장 · 장비)   종 = rat | cat
art/src/gpt/<종>_face_<n>.png    → art/<종>_face<n>/ (머리 파츠만 씀: 개체 얼굴)
뼈 · 영역은 기본(art/<종>/rig_src.json) 그대로. 옆모습 팔 영역만 긴 총(저격총 등)까지 넓힘.

사용: python war/tools/class_rigs.py [이름...]   (이름 없으면 전부)
"""
import glob
import json
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
import rig_cut  # noqa: E402
import slice_body  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
ART = os.path.join(ROOT, 'art')


def jobs():
    out = []
    for p in sorted(glob.glob(os.path.join(ART, 'src', 'gpt', '*_cls_*.png')) + sorted(glob.glob(os.path.join(ART, 'src', 'gpt', '*_face_*.png')))):
        m = re.match(r'(rat|cat)_(cls|face)_(.+)\.png', os.path.basename(p))
        if m:
            out.append((p, m.group(1), f'{m.group(1)}_{m.group(3)}' if m.group(2) == 'cls' else f'{m.group(1)}_face{m.group(3)}'))
    return out


def drop_strays(path):
    """칸 가장자리에 걸린 옆 칸 그림 조각(총 끝 등)을 마젠타로 지움. 몸통 덩어리(가장 큰 것)는 남김."""
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int32)
    fg = (np.minimum(a[..., 0], a[..., 2]) - a[..., 1]) < 120
    lab, n = ndimage.label(fg)
    if n <= 1:
        return
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    big = sizes.argmax() + 1
    edge = set(np.unique(np.concatenate([lab[:, :3].ravel(), lab[:, -3:].ravel()]))) - {0, big}
    out = a.copy()
    for k in edge:
        if sizes[k - 1] < sizes.max() * 0.15:
            out[lab == k] = (255, 0, 255)
    Image.fromarray(out.astype(np.uint8)).save(path)


def base_src(sp):
    base = json.load(open(os.path.join(ART, sp, 'rig_src.json'), encoding='utf-8'))
    # 긴 총 · 바깥으로 뻗은 장비가 팔과 같이 돌게 옆모습 팔 영역을 칸 끝까지
    for r in base['views']['side']['rules']:
        if r['to'] == 'arm':
            r['poly'] = [[226, 340], [512, 340], [512, 480], [226, 480]] if sp == 'rat' else [[128, 268], [262, 268], [300, 362], [512, 340], [512, 560], [262, 535], [252, 470], [128, 470]]
    return base


def main(names):
    bases = {sp: base_src(sp) for sp in ('rat', 'cat')}
    for src, sp, name in jobs():
        base = bases[sp]
        if names and name not in names:
            continue
        out = os.path.join(ART, name)
        slice_body.main(src, out)
        for v in ('front', 'side', 'back'):
            drop_strays(os.path.join(out, f'full_{v}.png'))
        json.dump(base, open(os.path.join(out, 'rig_src.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        rig_cut.main(out)
        for g in glob.glob(os.path.join(out, '_grid_*.png')):
            os.remove(g)


if __name__ == '__main__':
    main(sys.argv[1:])
