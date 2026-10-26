"""리그 v4 (혼합): 겉모습 = 원본 통그림에서 잘라낸 부위, 가려진 곳 = 캐릭터별 부위 시트로 채움

1) 원본을 부위별로 나눔 (rig_src.json 규칙, tools/rig_cut.py 와 같음)
2) 시트 부위를 원본 뼈(어깨→팔꿈치 등)에 맞춰 원본 좌표로 옮겨 놓음
3) 팔 · 다리: 원본 영역을 시트 부위 모양 안으로 제한 (가슴 장식 등이 팔에 딸려 가지 않게) → 넘친 픽셀은 몸통 · 골반으로
4) 부위 그림 = 시트 부위(가려진 곳에만: 그리는 순서상 위 부위가 덮던 자리) + 그 위에 원본 픽셀
   → 기본 자세는 원본과 똑같고, 움직일 때 드러나는 자리는 같은 캐릭터 시트 그림
5) 먼 쪽 팔 = 시트의 먼 팔 (평소엔 몸 뒤라 안 보임)

사용: python tools/hybrid_rig.py art/<id> [...]   → parts3/ · rig.json · rig.js · _hybrid.png(검토)
"""
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import assemble as A
import rig_cut
import make_rig_src
from rig_cut import key_magenta

SCALE = 0.5
LIMBS = {'upperArm': 'torso', 'foreArm': 'torso', 'thighN': 'hips', 'shinN': 'hips', 'thighF': 'hips', 'shinF': 'hips'}
# 시트 부위의 끝 관절 이름 (피벗 → 끝)
END = {'upperArm': 'elbow', 'foreArm': 'grip', 'upperArmF': 'elbow', 'foreArmF': 'grip', 'thighN': 'knee', 'thighF': 'knee',
       'shinN': 'sole', 'shinF': 'sole', 'torso': 'neck', 'weapon': 'tip'}


def similarity(sa, sb, ra, rb, s_clamp=None):
    """시트 점 sa→sb 를 원본 점 ra→rb 에 맞추는 2×3 행렬 (크기 · 회전 · 이동)"""
    sv, rv = np.subtract(sb, sa), np.subtract(rb, ra)
    s = math.hypot(*rv) / max(1e-6, math.hypot(*sv))
    if s_clamp:
        s = float(np.clip(s, *s_clamp))
    a = math.atan2(rv[1], rv[0]) - math.atan2(sv[1], sv[0])
    c, sn = math.cos(a) * s, math.sin(a) * s
    M = np.array([[c, -sn, 0.0], [sn, c, 0.0]])
    M[:, 2] = np.array(ra) - M[:, :2] @ np.array(sa)
    return M


def main(root):
    cid = os.path.basename(os.path.normpath(root))
    cfg_path = os.path.join(root, 'joints.json')
    cfg = json.load(open(cfg_path, encoding='utf-8')) if os.path.exists(cfg_path) else {}
    weapon = cfg.get('weapon', 'sword')
    src_path = os.path.join(root, 'rig_src.json')
    if cid in make_rig_src.C:  # 표가 있으면 늘 새로 (표를 고치면 바로 반영)
        json.dump(make_rig_src.build(cid, make_rig_src.C[cid]), open(src_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    V = json.load(open(src_path, encoding='utf-8'))['views']['side']
    B = V['bones']
    full = key_magenta(Image.open(os.path.join(root, V['src'])))
    H, W = full.shape[:2]
    owner, names, alpha = rig_cut.owner_map(root, V)
    idx = {n: i for i, n in enumerate(names)}
    order = [n for n in V['order'] if n in names or n in ('upperArmF', 'foreArmF')]

    # 시트 부위 + 관절
    A.GRIP.clear()
    raw = A.slice_sheet(root)
    J = {n: A.auto_joints(n, a, weapon) for n, a in raw.items() if n != 'tail'}
    for n, over in cfg.get('parts', {}).items():
        J.setdefault(n, {}).update(over)

    def region_bbox(n):
        yy, xx = np.nonzero(owner == idx[n])
        return xx.min(), yy.min(), xx.max(), yy.max()

    # 2) 시트 부위 → 원본 좌표 행렬
    Msheet = {}
    for n in ('upperArm', 'foreArm', 'thighN', 'shinN', 'thighF', 'shinF', 'torso', 'weapon'):
        if n in raw and n in B:
            Msheet[n] = similarity(J[n]['pivot'], J[n][END[n]], B[n]['a'], B[n]['b'])
    # 긴 무기는 시트 굵기가 달라 손 둘레만 쓰므로 그대로
    if 'head' in raw:
        x0, y0, x1, y1 = region_bbox('head')
        Msheet['head'] = similarity(J['head']['pivot'], J['head']['top'], B['head']['a'], [B['head']['a'][0], y0])
    if 'hips' in raw:
        x0, y0, x1, y1 = region_bbox('hips')
        hp = J['hips']['pivot']
        hb = [hp[0], raw['hips'].shape[0]]
        Msheet['hips'] = similarity(hp, hb, B['hips']['a'], [B['hips']['a'][0], y1])
    if 'cape' in raw and 'cape' in B:
        cp = J['cape']['pivot']
        Msheet['cape'] = similarity(cp, [cp[0], raw['cape'].shape[0]], B['cape']['a'], B['cape']['b'])
    # 먼 팔: 가까운 팔 뼈를 뒤 · 위로 조금 옮긴 자리
    off = np.array(cfg.get('farArmOffset', [-28, -10]))
    if 'upperArmF' in raw:
        Msheet['upperArmF'] = similarity(J['upperArmF']['pivot'], J['upperArmF']['elbow'], np.add(B['upperArm']['a'], off), np.add(B['upperArm']['b'], off))
    if 'foreArmF' in raw:
        Msheet['foreArmF'] = similarity(J['foreArmF']['pivot'], J['foreArmF']['grip'], np.add(B['foreArm']['a'], off), np.add(B['foreArm']['b'], off))
    warped = {n: cv2.warpAffine(raw[n], M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)) for n, M in Msheet.items()}

    # 3) 팔 · 다리 영역을 시트 모양 안으로 제한
    own = owner.copy()
    for n, par in LIMBS.items():
        if n in idx and n in warped and par in idx:
            shape = ndimage.binary_dilation(warped[n][..., 3] > 100, iterations=cfg.get('limbGrow', 10))
            body = warped[par][..., 3] > 100 if par in warped else np.zeros_like(shape)
            spill = (own == idx[n]) & ~shape & body  # 몸통 · 골반 모양 안에 있는 것만 넘김 (가슴 장식 등)
            own[spill] = idx[par]

    # 4) 부위 그림 만들기
    pdir = os.path.join(root, 'parts3')
    os.makedirs(pdir, exist_ok=True)
    for f in os.listdir(pdir):
        os.remove(os.path.join(pdir, f))
    pos = {n: i for i, n in enumerate(order)}
    parts = {}
    for n in order:
        later = [m for m in order if pos[m] > pos[n] and m in idx]
        covered = np.isin(own, [idx[m] for m in later]) & alpha  # 위 부위가 덮던 자리
        canvas = np.zeros((H, W, 4), np.uint8)
        if n in warped:
            u = warped[n].copy()
            um = (u[..., 3] > 0) & covered
            # 관절 둘레: 앞 부위 위로도 조금 깔아 이음새가 안 벌어지게
            jr = cfg.get('jointR', 26)
            yy, xx = np.mgrid[0:H, 0:W]
            for jp in ([B[n]['a'], B[n]['b']] if n in B else []):
                um |= (u[..., 3] > 0) & alpha & (np.hypot(xx - jp[0], yy - jp[1]) <= jr)
            if n in ('upperArmF', 'foreArmF'):
                um = u[..., 3] > 0  # 먼 팔: 통째로 (몸 뒤라 평소엔 가려짐)
            canvas[um] = u[um]
        if n in idx:
            m = own == idx[n]
            par = B[n].get('parent')
            cap = B[n].get('cap', V.get('cap', 0))
            if par and cap and par in idx:  # 관절 둘레 부모 픽셀도 조금 (이음새)
                yy, xx = np.mgrid[0:H, 0:W]
                m |= (np.hypot(xx - B[n]['a'][0], yy - B[n]['a'][1]) <= cap) & (own == idx[par])
            if not B[n].get('keep'):
                m |= ndimage.binary_dilation(m, iterations=2) & alpha
            canvas[m] = full[m]
        a = canvas[..., 3] > 8
        if a.sum() < 30:
            continue
        ys, xs = np.nonzero(a)
        g = 2
        x0, y0 = (xs.min() // g) * g, (ys.min() // g) * g
        x1, y1 = -(-(xs.max() + 1) // g) * g, -(-(ys.max() + 1) // g) * g
        im = Image.fromarray(canvas[y0:y1, x0:x1], 'RGBA')
        im = im.resize((max(1, round(im.width * SCALE)), max(1, round(im.height * SCALE))), Image.LANCZOS)
        im.save(os.path.join(pdir, n + '.png'))
        if n in B:
            piv, end, par = B[n]['a'], B[n]['b'], B[n].get('parent')
        elif n == 'upperArmF':
            piv, end, par = np.add(B['upperArm']['a'], off), np.add(B['upperArm']['b'], off), 'torso'
        else:
            piv, end, par = np.add(B['foreArm']['a'], off), np.add(B['foreArm']['b'], off), 'upperArmF'
        parts[n] = {'img': f'parts3/{n}.png', 'w': im.width, 'h': im.height, 'parent': par,
                    'x': x0 * SCALE, 'y': y0 * SCALE, 'pw': [float(piv[0]) * SCALE, float(piv[1]) * SCALE],
                    'end': [float(end[0]) * SCALE, float(end[1]) * SCALE]}
    # v2 형식으로: 이미지 좌표 피벗 · 부모 이미지 좌표의 붙는 자리 · 기본 각도 0
    out = {}
    for n, p in parts.items():
        par = p['parent'] if p['parent'] in parts else None
        q = {'img': p['img'], 'w': p['w'], 'h': p['h'], 'parent': par,
             'pivot': [round(p['pw'][0] - p['x'], 2), round(p['pw'][1] - p['y'], 2)],
             'at': [round(p['pw'][0] - (parts[par]['x'] if par else 0), 2), round(p['pw'][1] - (parts[par]['y'] if par else 0), 2)],
             'rest': 0, 'joints': {'end': [round(p['end'][0] - p['x'], 2), round(p['end'][1] - p['y'], 2)]}}
        out[n] = q
    # 엔진이 쓰는 관절 이름: 무기 끝 · 손 · 머리 꼭대기
    if 'weapon' in out:
        out['weapon']['joints']['tip'] = out['weapon']['joints']['end']
    if 'foreArm' in out:
        out['foreArm']['joints']['grip'] = out['foreArm']['joints']['end']
    if 'head' in out:
        hy = np.nonzero(alpha & (own == idx['head']))[0].min() * SCALE
        out['head']['joints']['top'] = [out['head']['pivot'][0], round(hy - parts['head']['y'], 2)]
    ys, xs = np.nonzero(alpha)
    rig = {'version': 4, 'id': cid, 'weapon': weapon, 'parts': out, 'order': [n for n in order if n in out],
           'ground': [float(V['ground'][0]) * SCALE, float(ys.max()) * SCALE], 'height': float(ys.max() - ys.min()) * SCALE}
    json.dump(rig, open(os.path.join(root, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(root, 'rig.js'), 'w', encoding='utf-8') as f:
        f.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(cid), json.dumps(rig, ensure_ascii=False)))
    imgs = {n: Image.open(os.path.join(root, p['img'])).convert('RGBA') for n, p in out.items()}
    review(root, rig, imgs, full)
    print(cid, '부위', len(out), '키', round(rig['height']))


POSES = {
    '원본': None,
    '기본 자세': {},
    '걷기': {'thighN': -28, 'shinN': 22, 'thighF': 24, 'shinF': 30, 'torso': 4, 'upperArmF': -25, 'tail1': 10, 'tail2': -10, 'tail3': -15},
    '내려베기 예비': {'upperArm': -125, 'foreArm': 20, 'torso': -10, 'head': -6, 'cape': 10, 'upperArmF': -40},
    '팔 내림 · 숙임': {'upperArm': 60, 'foreArm': 20, 'torso': 12, 'head': -8, 'thighN': -16, 'shinN': 20, 'upperArmF': 40, 'foreArmF': -30},
}


def review(root, rig, imgs, full):
    Hh = int(rig['height'] * 1.45) + 60
    Wc = int(rig['height'] * 1.15)
    sheet = Image.new('RGBA', (Wc * len(POSES), Hh), (255, 255, 255, 255))
    ref = Image.fromarray(full, 'RGBA')
    ref = ref.resize((round(ref.width * SCALE), round(ref.height * SCALE)))
    for i, (name, ang) in enumerate(POSES.items()):
        if ang is None:
            sheet.alpha_composite(ref, (int(Wc / 2 - rig['ground'][0]), int(Hh - 30 - rig['ground'][1])))
            continue
        im, _, _ = A.render(rig, imgs, ang, (Wc, Hh), (Wc / 2, Hh - 30))
        sheet.alpha_composite(im, (i * Wc, 0))
    sheet = sheet.resize((int(sheet.width * 520 / Hh), 520), Image.LANCZOS)
    sheet.save(os.path.join(root, '_hybrid.png'))


if __name__ == '__main__':
    for r in sys.argv[1:]:
        main(r)
