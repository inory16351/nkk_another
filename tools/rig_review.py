"""리그 검토 시트: 원본 · 부위 배정 · 기본 자세(원본과 같아야 함) · 꺾은 자세 3개 → art/<id>/_review.png

꺾은 자세에서 관절 이음새(틈 · 겹친 조각 · 잘린 옷)가 자연스러운지 본다.
웹 엔진(rig_engine.js)과 같은 계산: 부모 행렬 × 피벗 기준 회전, 각도 + = 시계 방향.
사용: python tools/rig_review.py art/<id> [...]
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

POSES = {
    '기본': {},
    '걷기': {'thighF': -28, 'shinF': 22, 'thighN': 24, 'shinN': 34, 'torso': 4, 'tail1': 10, 'tail2': -10, 'tail3': -15, 'upperArmF': -20},
    '내려베기 예비': {'upperArm': -120, 'foreArm': 10, 'weapon': 20, 'torso': -10, 'head': -6, 'cape': 10, 'upperArmF': -35, 'thighF': 8},
    '앞으로 숙인 대기': {'thighF': -16, 'shinF': 20, 'thighN': 12, 'shinN': 8, 'torso': 10, 'head': -8, 'upperArm': 28, 'foreArm': -12, 'weapon': 30, 'upperArmF': 40, 'foreArmF': -55, 'tail1': 6, 'tail2': -6, 'tail3': -10},
}


def T(x, y):
    return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], float)


def R(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], float)


def render(root, V, imgs, angles, W, H, ox, oy):
    M = {}

    def get(n):
        if n in M:
            return M[n]
        p = V['parts'][n]
        m = get(p['parent']) if p['parent'] and p['parent'] in V['parts'] else T(ox, oy)
        a = angles.get(n, 0)
        if a:
            m = m @ T(*p['pivot']) @ R(a) @ T(-p['pivot'][0], -p['pivot'][1])
        M[n] = m
        return m

    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for n in V['order']:
        if n not in V['parts']:
            continue
        p = V['parts'][n]
        full = get(n) @ T(p['x'], p['y'])
        inv = np.linalg.inv(full)
        layer = imgs[n].transform((W, H), Image.AFFINE, tuple(inv[:2].flatten()), resample=Image.BICUBIC)
        out.alpha_composite(layer)
    return out, M


def main(root):
    rig = json.load(open(os.path.join(root, 'rig.json'), encoding='utf-8'))
    V = rig['views']['side']
    imgs = {}
    for n, p in V['parts'].items():
        im = Image.open(os.path.join(root, p['img'])).convert('RGBA')
        if p.get('dark'):
            a = im.getchannel('A')
            im = ImageEnhance.Brightness(im.convert('RGB')).enhance(p['dark']).convert('RGBA')
            im.putalpha(a)
        imgs[n] = im
    W, H = V['w'] + 260, V['h'] + 120
    ox, oy = 130, 80
    panels = []
    src = Image.open(os.path.join(root, 'full_side.png')).convert('RGBA').resize((V['w'], V['h']))
    a = Image.new('RGBA', (W, H)); a.alpha_composite(src, (ox, oy)); panels.append(('원본', a))
    asg = Image.open(os.path.join(root, '_assign_side.png')).convert('RGBA').resize((V['w'], V['h']))
    b = Image.new('RGBA', (W, H)); b.alpha_composite(asg, (ox, oy)); panels.append(('부위 배정', b))
    for name, ang in POSES.items():
        im, M = render(root, V, imgs, ang, W, H, ox, oy)
        panels.append((name, im))
    cols = 3
    rows = (len(panels) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * W, rows * H), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(panels):
        x, y = (i % cols) * W, (i // cols) * H
        for yy in range(y, y + H, 20):
            for xx in range(x, x + W, 20):
                if ((xx - x) // 20 + (yy - y) // 20) % 2:
                    d.rectangle([xx, yy, xx + 19, yy + 19], fill=(228, 230, 236, 255))
        sheet.alpha_composite(im, (x, y))
        d.rectangle([x, y, x + W - 1, y + H - 1], outline=(150, 150, 160, 255))
        d.text((x + 10, y + 8), name, fill=(200, 30, 30, 255))
    sheet = sheet.resize((sheet.width * 2 // 3, sheet.height * 2 // 3), Image.LANCZOS)
    sheet.save(os.path.join(root, '_review.png'))


if __name__ == '__main__':
    for r in sys.argv[1:]:
        main(r)
