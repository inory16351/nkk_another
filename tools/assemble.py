"""리그 v2: 캐릭터별 부위 시트(Codex 4×4) → 부위 PNG · 관절 · 기본 자세 → rig.json / rig.js + 검토 시트

부위를 통그림에서 잘라 쓰지 않고, 시트에 따로 그린 온전한 부위를 쓴다 (먼 팔 · 먼 다리도 따로 그림).
관절 = 부위 끝 둥근 부분의 중심 (자동) → 틀리면 art/<id>/joints.json 으로 고침.

joints.json 예:
  {"weapon": "sword", "parts": {"upperArm": {"pivot": [x, y], "elbow": [x, y]}},
   "rest": {"upperArm": -30}, "drop": ["cape"]}
좌표는 부위 PNG(시트에서 잘라 낸 그림, 시트 배율 그대로) 픽셀.

사용: python tools/assemble.py art/<id> [...]
결과: art/<id>/parts2/*.png · rig.json · rig.js · _review2.png
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig_cut import key_magenta

CELLS = ['head', 'torso', 'hips', 'cape', 'upperArm', 'foreArm', 'upperArmF', 'foreArmF',
         'thighN', 'shinN', 'thighF', 'shinF', 'weapon', 'tail', None, None]
# 무기: 손잡이 자리(위에서부터 높이 비율) · 그림 방향 (vertical = 끝이 위, horizontal = 끝이 오른쪽)
WEAPONS = {
    'sword': (0.9, 'vertical'), 'spear': (0.66, 'vertical'), 'staff': (0.5, 'vertical'),
    'mace': (0.78, 'vertical'), 'dagger': (0.84, 'vertical'), 'crossbow': (0.5, 'horizontal'),
}
# 기본 자세 각도 (도, + = 시계 방향). 팔다리는 시트에서 아래로 늘어뜨린 상태가 0
REST = {
    'upperArm': -25, 'foreArm': -65, 'upperArmF': -15, 'foreArmF': -50,
    'thighN': -6, 'shinN': 4, 'thighF': 8, 'shinF': 2, 'cape': 12, 'torso': 0, 'head': 0,
    'tail1': 65, 'tail2': -25, 'tail3': -25,
}
ORDER = ['cape', 'tail3', 'tail2', 'tail1', 'upperArmF', 'foreArmF', 'thighF', 'shinF', 'hips', 'torso',
         'thighN', 'shinN', 'head', 'weapon', 'upperArm', 'foreArm']
SCALE = 1.0
GRIP = {}  # 캐릭터별 손잡이 자리 (joints.json "grip")  # 부위 PNG 저장 배율 (시트 그대로)


def slice_sheet(root):
    """시트 전체에서 그림 덩어리를 찾아, 덩어리 중심이 있는 칸의 부위로 배정 (칸 경계를 넘어 그려져도 안 잘림)"""
    rgba = key_magenta(Image.open(os.path.join(root, 'sheet', 'parts.png')))
    H, W = rgba.shape[:2]
    cw, ch = W / 4, H / 4
    a = rgba[..., 3] > 40
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=3))
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    cms = ndimage.center_of_mass(a, lab, range(1, n + 1))
    groups = {}
    for j in range(n):
        if sizes[j] < 250:
            continue
        cy, cx = cms[j]
        cell = int(cy // ch) * 4 + int(cx // cw)
        groups.setdefault(cell, []).append(j + 1)
    out = {}
    for cell, labs in groups.items():
        name = CELLS[cell] if cell < len(CELLS) else None
        if not name:
            continue
        keep = np.isin(lab, labs) & a
        ys, xs = np.nonzero(keep)
        crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        crop[..., 3] = np.where(keep[ys.min():ys.max() + 1, xs.min():xs.max() + 1], crop[..., 3], 0)
        out[name] = crop
    return out


def mask_of(a):
    return a[..., 3] > 100


def rows_centroid(m, y0, y1):
    ys, xs = np.nonzero(m[max(0, y0):max(1, y1)])
    return float(xs.mean()) if len(xs) else m.shape[1] / 2


def cap_top(m):
    """위쪽 둥근 끝의 중심"""
    ys, xs = np.nonzero(m)
    top = ys.min()
    H = ys.max() - top
    band = m[top:top + max(4, int(H * 0.3))]
    w = band.sum(axis=1).max()
    r = min(w / 2, H * 0.3)
    return [rows_centroid(m, top, top + int(r * 1.6)), top + r * 0.95]


def cap_bottom(m):
    ys, xs = np.nonzero(m)
    bot = ys.max()
    H = bot - ys.min()
    band = m[bot - max(4, int(H * 0.3)):bot]
    w = band.sum(axis=1).max()
    r = min(w / 2, H * 0.3)
    return [rows_centroid(m, int(bot - r * 1.6), bot), bot - r * 0.95]


def auto_joints(name, a, weapon):
    m = mask_of(a)
    H, W = m.shape
    ys, xs = np.nonzero(m)
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    J = {}
    if name == 'head':
        J['pivot'] = [rows_centroid(m, int(bot - H * 0.12), bot), bot - H * 0.05]
        J['top'] = [rows_centroid(m, top, int(top + H * 0.1)), top]
    elif name == 'torso':
        J['pivot'] = [rows_centroid(m, int(bot - H * 0.1), bot), bot - 4]
        J['neck'] = [rows_centroid(m, top, int(top + H * 0.1)), top + 6]
        sx = rows_centroid(m, top, int(top + H * 0.35))
        J['shoulderN'] = [sx + W * 0.06, top + H * 0.2]
        J['shoulderF'] = [sx - W * 0.08, top + H * 0.17]
        J['cape'] = [left + W * 0.22, top + H * 0.06]
    elif name == 'hips':
        cx = rows_centroid(m, top, int(top + H * 0.15))
        J['pivot'] = [cx, top + 6]
        J['hipN'] = [cx - W * 0.1, top + H * 0.42]
        J['hipF'] = [cx + W * 0.1, top + H * 0.4]
        J['tail'] = [left + W * 0.12, top + H * 0.5]
    elif name == 'cape':
        J['pivot'] = [rows_centroid(m, top, int(top + H * 0.08)), top + 6]
    elif name in ('upperArm', 'upperArmF'):
        J['pivot'] = cap_top(m)
        J['elbow'] = cap_bottom(m)
    elif name in ('foreArm', 'foreArmF'):
        J['pivot'] = cap_top(m)
        fy0 = int(bot - H * 0.22)
        J['grip'] = [rows_centroid(m, fy0, bot), (fy0 + bot) / 2]
    elif name in ('thighN', 'thighF'):
        J['pivot'] = cap_top(m)
        J['knee'] = cap_bottom(m)
    elif name in ('shinN', 'shinF'):
        J['pivot'] = cap_top(m)
        J['sole'] = [rows_centroid(m, bot - 6, bot), bot]
    elif name == 'weapon':
        frac, orient = WEAPONS.get(weapon, (0.85, 'vertical'))
        frac = GRIP.get('frac', frac)
        if orient == 'vertical':
            gy = top + H * frac
            J['pivot'] = [rows_centroid(m, int(gy - 6), int(gy + 6)), gy]
            J['tip'] = [rows_centroid(m, top, top + 10), top]
        else:
            gx = left + W * GRIP.get('hfrac', 0.3)
            col = np.nonzero(m[:, int(gx)])[0]
            J['pivot'] = [gx, float(col.mean()) if len(col) else H / 2]
            J['tip'] = [right, H / 2]
    return J


def split_tail(a):
    """꼬리 한 장 → 뿌리에서부터 거리로 3마디. 뿌리 = 왼쪽 위 끝"""
    m = mask_of(a)
    H, W = m.shape

    def bfs(start):
        dist = np.full(m.shape, -1, np.int32)
        q = deque([start]); dist[start] = 0
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and dist[ny, nx] < 0:
                    dist[ny, nx] = dist[y, x] + 1
                    q.append((ny, nx))
        return dist
    ys, xs = np.nonzero(m)
    d = bfs((ys[0], xs[0]))
    A = np.unravel_index(d.argmax(), d.shape)      # 한쪽 끝
    dA = bfs(A)
    B = np.unravel_index(dA.argmax(), dA.shape)    # 반대쪽 끝
    # 뿌리 = 굵은 쪽 끝 (거리 변환 값이 큰 쪽)
    edt = ndimage.distance_transform_edt(m)
    thick = lambda P: edt[(np.abs(np.arange(H)[:, None] - P[0]) < 40) & (np.abs(np.arange(W)[None, :] - P[1]) < 40) & m].max()
    root = A if thick(A) >= thick(B) else B
    dist = dA if root is A else bfs(B)
    L = dist.max()
    cuts = [0, L * 0.34, L * 0.67, L + 1]
    segs, joints = [], []
    for k in range(3):
        band = (dist >= cuts[k]) & (dist < cuts[k + 1])
        grow = ndimage.binary_dilation(band, iterations=10) & m  # 마디끼리 겹침
        seg = a.copy()
        seg[..., 3] = np.where(grow, seg[..., 3], 0)
        segs.append(seg)
        ring = (dist >= max(0, cuts[k] - 2)) & (dist <= cuts[k] + 2)
        yy, xx = np.nonzero(ring)
        joints.append([float(xx.mean()), float(yy.mean())])
    yy, xx = np.nonzero(dist >= L - 3)
    end = [float(xx.mean()), float(yy.mean())]
    return segs, joints, end


def T(x, y):
    return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], float)


def R(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], float)


def matrices(rig, angles):
    P = rig['parts']
    M = {}

    def get(n):
        if n in M:
            return M[n]
        p = P[n]
        m = get(p['parent']) if p['parent'] else np.eye(3)
        m = m @ T(*p['at']) @ R(p['rest'] + angles.get(n, 0)) @ T(-p['pivot'][0], -p['pivot'][1])
        M[n] = m
        return m
    for n in P:
        get(n)
    return M


def render(rig, imgs, angles, size, origin):
    M = matrices(rig, angles)
    W, H = size
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    base = T(*origin) @ T(-rig['ground'][0], -rig['ground'][1])
    for n in rig['order']:
        if n not in rig['parts']:
            continue
        inv = np.linalg.inv(base @ M[n])
        out.alpha_composite(imgs[n].transform((W, H), Image.AFFINE, tuple(inv[:2].flatten()), resample=Image.BICUBIC))
    return out, M, base


def ref_joints(root, cid):
    """원본 통그림(full_side.png)에서 찍은 관절 (tools/make_rig_src.py 표, 없으면 rig_src.json 뼈)"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import make_rig_src
    if cid in make_rig_src.C:
        c = make_rig_src.C[cid]
        wp = [p for poly in c['weapon'] for p in poly]
        return dict(sh=c['sh'], el=c['el'], hand=c['hand'], grip=c['grip'], tip=c['tip'], waist=c['waist'], neck=c['neck'],
                    hipTop=c['hips'][0], legN=c['legN'], legF=c['legF'], head=c['head'], hipsPoly=c['hipsPoly'], weaponPts=wp, ground=c['ground'])
    path = os.path.join(root, 'rig_src.json')
    if not os.path.exists(path):
        return None
    V = json.load(open(path, encoding='utf-8'))['views']['side']
    B = V['bones']
    rule = lambda to: next((r['poly'] for r in V['rules'] if r['to'] == to and 'poly' in r), None)
    return dict(sh=B['upperArm']['a'], el=B['upperArm']['b'], hand=B['foreArm']['b'], grip=B['weapon']['a'], tip=B['weapon']['b'],
                waist=B['torso']['a'], neck=B['torso']['b'], hipTop=B['hips']['a'],
                legN=[B['thighN']['a'], B['thighN']['b'], B['shinN']['b']], legF=[B['thighF']['a'], B['thighF']['b'], B['shinF']['b']],
                head=rule('head'), hipsPoly=rule('hips'), weaponPts=rule('weapon'), ground=V['ground'])


def ang(v):
    return math.degrees(math.atan2(v[1], v[0]))


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def resize_np(a, kx, ky=None):
    ky = kx if ky is None else ky
    im = Image.fromarray(a, 'RGBA')
    return np.asarray(im.resize((max(1, round(im.width * kx)), max(1, round(im.height * ky))), Image.LANCZOS))


def main(root, _again=True):
    cid = os.path.basename(os.path.normpath(root))
    cfg_path = os.path.join(root, 'joints.json')
    cfg = json.load(open(cfg_path, encoding='utf-8')) if os.path.exists(cfg_path) else {}
    weapon = cfg.get('weapon', 'sword')
    GRIP.clear()
    if 'grip' in cfg:
        GRIP['frac'] = cfg['grip']
    raw = slice_sheet(root)
    for d in cfg.get('drop', []):
        raw.pop(d, None)
    pdir = os.path.join(root, 'parts2')
    os.makedirs(pdir, exist_ok=True)
    for f in os.listdir(pdir):
        os.remove(os.path.join(pdir, f))
    J, imgs_np = {}, {}
    R = ref_joints(root, cid) if cfg.get('fit', True) else None
    FIT = {}
    if R:
        # 손잡이 자리: 원본 무기에서 손잡이가 끝에서 얼마나 떨어졌나
        wp = np.array(R['weaponPts'], float)
        if WEAPONS.get(weapon, (0, 'vertical'))[1] == 'vertical':
            y0, y1 = wp[:, 1].min(), wp[:, 1].max()
            GRIP['frac'] = float(np.clip((R['grip'][1] - y0) / max(1, y1 - y0), 0.2, 0.95))
        else:
            x0, x1 = wp[:, 0].min(), wp[:, 0].max()
            GRIP['hfrac'] = float(np.clip((R['grip'][0] - x0) / max(1, x1 - x0), 0.05, 0.9))
        J0 = {n: auto_joints(n, a, weapon) for n, a in raw.items() if n != 'tail'}
        k = {}
        # 원본을 부위별로 나눈 영역(rig_src 규칙)의 실제 길이 ↔ 시트 부위 길이
        import rig_cut
        src_path = os.path.join(root, 'rig_src.json')
        if not os.path.exists(src_path):
            import make_rig_src
            json.dump(make_rig_src.build(cid, make_rig_src.C[cid]), open(src_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        V = json.load(open(src_path, encoding='utf-8'))['views']['side']
        owner, names, _ = rig_cut.owner_map(root, V)
        def region(n):
            if n not in names:
                return None
            yy, xx = np.nonzero(owner == names.index(n))
            return (xx, yy) if len(xx) > 50 else None
        def extent(n, axis_from=None, axis_to=None):
            r = region(n)
            if r is None:
                return None
            xx, yy = r
            if axis_from is None:
                return yy.max() - yy.min() + 1
            v = np.subtract(axis_to, axis_from); v = v / np.hypot(*v)
            proj = (xx - axis_from[0]) * v[0] + (yy - axis_from[1]) * v[1]
            return proj.max() - proj.min() + 1
        sh_ = lambda n: raw[n].shape[0]
        e = extent('head');  k['head'] = e / sh_('head') if e else 1
        e = extent('torso'); k['torso'] = e / sh_('torso') if e else 1
        e = extent('foreArm', R['el'], R['hand']); k['foreArm'] = e / sh_('foreArm') if e else k['torso']
        e = extent('shinN'); k['shinN'] = e / sh_('shinN') if e else k['torso']
        e = extent('shinF'); kF = e / sh_('shinF') if e and 'shinF' in raw else k['shinN']
        k['shinN'] = (k['shinN'] + kF) / 2  # 두 다리는 같은 크기
        lim = lambda v: float(np.clip(v, k['torso'] * 0.6, k['torso'] * 1.2))  # 측정이 튀면 몸통 기준으로 묶음
        k['foreArm'], k['shinN'] = lim(k['foreArm']), lim(k['shinN'])
        k['upperArm'] = k['foreArm']
        k['thighN'] = k['shinN']
        k['weapon'] = dist(R['grip'], R['tip']) / dist(J0['weapon']['pivot'], J0['weapon']['tip'])
        k['thighF'], k['shinF'] = k['thighN'], k['shinN']
        k['upperArmF'], k['foreArmF'] = k['upperArm'], k['foreArm']
        k['hips'] = k['cape'] = k['tail'] = k['torso']
        def width(n):
            r = region(n)
            if r is None:
                return None
            xx, yy = r
            # 위 · 아래 끝 10% 를 뺀 행들의 폭 (목 · 허리 끝 조각 제외)
            lo, hi = np.percentile(yy, 10), np.percentile(yy, 90)
            sel = (yy >= lo) & (yy <= hi)
            return np.percentile(xx[sel], 97) - np.percentile(xx[sel], 3)
        def sheet_width(a):
            al = a[..., 3] > 100
            ys2, xs2 = np.nonzero(al)
            lo, hi = np.percentile(ys2, 10), np.percentile(ys2, 90)
            sel = (ys2 >= lo) & (ys2 <= hi)
            return np.percentile(xs2[sel], 97) - np.percentile(xs2[sel], 3)
        KX = {}
        for n in ('torso', 'hips'):
            w = width(n)
            if w and n in raw:
                KX[n] = float(np.clip(w / sheet_width(raw[n]), k['torso'] * 0.8, k['torso'] * 1.7))
        for n, v in k.items():
            if n in raw:
                if n in KX and not (n == 'hips' and cfg.get('longRobe')):
                    eh = extent(n) if n == 'hips' else None
                    raw[n] = resize_np(raw[n], KX[n], max(v, (eh / raw[n].shape[0]) if eh else v) if n == 'hips' else v)
                elif n == 'hips' and cfg.get('longRobe'):  # 긴 옷: 세로는 원본 옷 길이에 맞춤
                    eh = extent('hips') or (max(p[1] for p in R['hipsPoly']) - min(p[1] for p in R['hipsPoly']))
                    raw[n] = resize_np(raw[n], KX.get('hips', v), eh / raw[n].shape[0])
                elif n == 'weapon' and v > k['foreArm'] * 1.3:  # 긴 무기: 길이만 맞추고 굵기는 손 쪽
                    thin = max(k['foreArm'] * 1.15, v * {'sword': 0.7, 'mace': 0.6, 'dagger': 0.8, 'crossbow': 0.6}.get(weapon, 0.45))
                    vert = WEAPONS.get(weapon, (0, 'vertical'))[1] == 'vertical'
                    raw[n] = resize_np(raw[n], thin, v) if vert else resize_np(raw[n], v, thin)
                else:
                    raw[n] = resize_np(raw[n], v)
        FIT = {n: round(v, 3) for n, v in k.items()}
    for n, k in cfg.get('scale', {}).items():  # 시트에서 작게 · 크게 그려진 부위 비율 맞춤
        if n in raw:
            im = Image.fromarray(raw[n], 'RGBA')
            kx = ky = k
            if n == 'weapon' and k > 1.4:  # 긴 무기: 길이만 늘리고 굵기는 조금만
                if WEAPONS.get(weapon, (0, 'vertical'))[1] == 'vertical':
                    kx = 1.0 + (k - 1.0) * 0.35
                else:
                    ky = 1.0 + (k - 1.0) * 0.35
            raw[n] = np.asarray(im.resize((max(1, round(im.width * kx)), max(1, round(im.height * ky))), Image.LANCZOS))
    for n, (kx, ky) in cfg.get('scaleXY', {}).items():  # 가로 · 세로 따로 (긴 로브 등)
        if n in raw:
            im = Image.fromarray(raw[n], 'RGBA')
            raw[n] = np.asarray(im.resize((max(1, round(im.width * kx)), max(1, round(im.height * ky))), Image.LANCZOS))
    for n, a in raw.items():
        if n == 'tail':
            segs, tj, end = split_tail(a)
            for k in range(3):
                nm = f'tail{k + 1}'
                imgs_np[nm] = segs[k]
                J[nm] = {'pivot': tj[k], 'next': tj[k + 1] if k < 2 else end}
            continue
        imgs_np[n] = a
        J[n] = auto_joints(n, a, weapon)
    rest_fit = {}
    if R:
        # 기본 자세 각도 = 원본 뼈 방향 − 시트 부위 방향 (부모 기준으로)
        absA = {}
        absA['torso'] = ang(np.subtract(R['neck'], R['waist'])) - ang(np.subtract(J['torso']['neck'], J['torso']['pivot']))
        absA['upperArm'] = ang(np.subtract(R['el'], R['sh'])) - ang(np.subtract(J['upperArm']['elbow'], J['upperArm']['pivot']))
        absA['foreArm'] = ang(np.subtract(R['hand'], R['el'])) - ang(np.subtract(J['foreArm']['grip'], J['foreArm']['pivot']))
        absA['weapon'] = ang(np.subtract(R['tip'], R['grip'])) - ang(np.subtract(J['weapon']['tip'], J['weapon']['pivot']))
        for side, leg in (('N', R['legN']), ('F', R['legF'])):
            absA['thigh' + side] = ang(np.subtract(leg[1], leg[0])) - ang(np.subtract(J['thigh' + side]['knee'], J['thigh' + side]['pivot']))
            absA['shin' + side] = ang(np.subtract(leg[2], leg[1])) - ang(np.subtract(J['shin' + side]['sole'], J['shin' + side]['pivot']))
        wrap = lambda d: (d + 180) % 360 - 180
        rest_fit = {
            'torso': wrap(absA['torso']), 'head': 0,
            'upperArm': wrap(absA['upperArm'] - absA['torso']), 'foreArm': wrap(absA['foreArm'] - absA['upperArm']),
            'weapon': wrap(absA['weapon'] - absA['foreArm']),
            'thighN': wrap(absA['thighN']), 'shinN': wrap(absA['shinN'] - absA['thighN']),
            'thighF': wrap(absA['thighF']), 'shinF': wrap(absA['shinF'] - absA['thighF']),
        }
        rest_fit['upperArmF'] = rest_fit['upperArm'] + 12
        rest_fit['foreArmF'] = rest_fit['foreArm'] - 20

        def to_local(P, origin_ref, origin_local, a):  # 원본 점 → 부위 좌표 (부위가 기운 만큼 되돌림)
            v = np.subtract(P, origin_ref)
            c, sn = math.cos(math.radians(-a)), math.sin(math.radians(-a))
            return [origin_local[0] + c * v[0] - sn * v[1], origin_local[1] + sn * v[0] + c * v[1]]
        J['torso']['shoulderN'] = to_local(R['sh'], R['waist'], J['torso']['pivot'], absA['torso'])
        J['torso']['shoulderF'] = [J['torso']['shoulderN'][0] - 22, J['torso']['shoulderN'][1] - 6]
        J['torso']['neck'] = to_local(R['neck'], R['waist'], J['torso']['pivot'], absA['torso'])
        J['hips']['hipN'] = to_local(R['legN'][0], R['hipTop'], J['hips']['pivot'], 0)
        J['hips']['hipF'] = to_local(R['legF'][0], R['hipTop'], J['hips']['pivot'], 0)
        J['hips']['waist'] = to_local(R['waist'], R['hipTop'], J['hips']['pivot'], 0)
    for n, over in cfg.get('parts', {}).items():  # 손으로 고친 관절
        J.setdefault(n, {}).update(over)

    attach = {  # 부위: (부모, 부모의 관절 이름)
        'torso': ('hips', 'waist' if R else 'pivot'), 'head': ('torso', 'neck'), 'cape': ('torso', 'cape'),
        'upperArm': ('torso', 'shoulderN'), 'foreArm': ('upperArm', 'elbow'), 'weapon': ('foreArm', 'grip'),
        'upperArmF': ('torso', 'shoulderF'), 'foreArmF': ('upperArmF', 'elbow'),
        'thighN': ('hips', 'hipN'), 'shinN': ('thighN', 'knee'), 'thighF': ('hips', 'hipF'), 'shinF': ('thighF', 'knee'),
        'tail1': ('hips', 'tail'), 'tail2': ('tail1', 'next'), 'tail3': ('tail2', 'next'),
    }
    rest = dict(REST)
    w_orient = WEAPONS.get(weapon, (0, 'vertical'))[1]
    if 'tail1' in J:  # 첫 마디가 뒤(왼쪽) 조금 아래로, 끝으로 갈수록 위로 휨
        v = np.subtract(J['tail1']['next'], J['tail1']['pivot'])
        rest['tail1'] = math.degrees(math.atan2(cfg.get('tailDrop', 0.1), -1.0) - math.atan2(v[1], v[0]))
        for k in ('tail2', 'tail3'):
            v1 = np.subtract(J[k]['next'], J[k]['pivot'])
            v0 = np.subtract(J[k]['pivot'], J['tail1' if k == 'tail2' else 'tail2']['pivot'])
            rest[k] = cfg.get('tailCurl', -18) - math.degrees(math.atan2(v1[1], v1[0]) - math.atan2(v0[1], v0[0]))
    rest.update(rest_fit)
    rest.update(cfg.get('rest', {}))
    # 무기는 세상 기준으로 똑바로 (세로 무기 = 끝이 위, 석궁 = 오른쪽)
    if 'weapon' not in cfg.get('rest', {}) and not rest_fit:
        rest['weapon'] = -(rest['upperArm'] + rest['foreArm']) + (0 if w_orient == 'vertical' else 0)
    parts = {}
    for n, a in imgs_np.items():
        im = Image.fromarray(a, 'RGBA')
        im.save(os.path.join(pdir, n + '.png'))
        par, jn = attach.get(n, (None, None))
        if par and par not in J:
            continue
        parts[n] = {
            'img': f'parts2/{n}.png', 'w': im.width, 'h': im.height, 'parent': par,
            'pivot': [round(float(v), 1) for v in J[n]['pivot']],
            'at': [round(float(v), 1) for v in J[par][jn]] if par else [0, 0],
            'rest': rest.get(n, 0),
        }
        for k, v in J[n].items():
            if k != 'pivot':
                parts[n].setdefault('joints', {})[k] = [round(float(v[0]), 1), round(float(v[1]), 1)]
    order = list(ORDER)
    if cfg.get('robe', True):  # 치마 · 튜닉 · 로브: 가까운 허벅지도 옷 뒤로
        for n in ('thighN', 'shinN'):
            order.remove(n)
            order.insert(order.index('hips'), n)
    rig = {'version': 2, 'id': cid, 'weapon': weapon, 'parts': parts, 'order': [n for n in order if n in parts], 'ground': [0, 0]}
    imgs = {n: Image.open(os.path.join(root, p['img'])).convert('RGBA') for n, p in parts.items()}
    # 땅선: 기본 자세에서 가장 낮은 발바닥 · 몸 가운데
    M = matrices(rig, {})
    pts = []
    for leg in ('shinN', 'shinF'):
        if leg in parts:
            s = parts[leg]['joints']['sole']
            pts.append(M[leg] @ np.array([s[0], s[1], 1.0]))
    gy = max(p[1] for p in pts)
    hp = M['hips'] @ np.array([parts['hips']['pivot'][0], parts['hips']['pivot'][1], 1.0])
    rig['ground'] = [round(float(hp[0]), 1), round(float(gy), 1)]
    # 키: 땅선 ~ 머리 꼭대기
    ht = M['head'] @ np.array([*parts['head']['joints']['top'], 1.0])
    rig['height'] = round(float(gy - ht[1]), 1)
    json.dump(rig, open(os.path.join(root, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(root, 'rig.js'), 'w', encoding='utf-8') as f:
        f.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(cid), json.dumps(rig, ensure_ascii=False)))
    if _again and cfg.get('weaponLen') and 'weapon' in parts:
        wl = max(parts['weapon']['w'], parts['weapon']['h'])
        k = cfg['weaponLen'] * rig['height'] / wl * cfg.get('scale', {}).get('weapon', 1.0)
        cfg.setdefault('scale', {})['weapon'] = round(k, 3)
        cfg.pop('weaponLen')
        json.dump(cfg, open(cfg_path, 'w', encoding='utf-8'), ensure_ascii=False)
        return main(root, False)
    review(root, rig, imgs)
    print(cid, '키', rig['height'], '부위', len(parts), '맞춤' if R else '수동', FIT)


POSES = {
    '기본 자세': {},
    '걷기': {'thighN': -28, 'shinN': 22, 'thighF': 24, 'shinF': 30, 'torso': 4, 'upperArmF': -20, 'tail1': 10, 'tail2': -10, 'tail3': -15},
    '내려베기 예비': {'upperArm': -120, 'foreArm': 30, 'torso': -10, 'head': -6, 'cape': 10, 'upperArmF': -35},
    '앞으로 숙인 대기': {'thighN': -16, 'shinN': 20, 'thighF': 12, 'shinF': 8, 'torso': 10, 'head': -8, 'upperArm': 28, 'weapon': 30, 'upperArmF': 30, 'foreArmF': -40},
}


def review(root, rig, imgs):
    H = int(rig['height'] * 1.5) + 80
    Wc = int(rig['height'] * 1.3)
    panels = []
    # 1) 부위 + 관절 점
    P = rig['parts']
    pw = Wc * (len(POSES) + 1)
    sheet = Image.new('RGBA', (pw, 620), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    x = y = 10; rowh = 0
    for n in rig['order']:
        im = imgs[n]
        k = min(1.0, 280 / max(im.width, im.height))
        sm = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
        if x + sm.width > pw - 10:
            x = 10; y += rowh + 26; rowh = 0
        sheet.alpha_composite(sm, (x, y + 14))
        d.text((x, y), n, fill=(200, 30, 30, 255))
        p = P[n]
        for kname, pt in [('pivot', p['pivot'])] + list(p.get('joints', {}).items()):
            px, py = x + pt[0] * k, y + 14 + pt[1] * k
            col = (255, 40, 90, 255) if kname == 'pivot' else (20, 150, 255, 255)
            d.ellipse([px - 5, py - 5, px + 5, py + 5], fill=col, outline=(255, 255, 255, 255))
        x += sm.width + 18; rowh = max(rowh, sm.height + 14)
    panels.append(sheet.crop((0, 0, pw, min(620, y + rowh + 30))))
    # 2) 자세들 + 원본
    row = Image.new('RGBA', (Wc * (len(POSES) + 1), H), (255, 255, 255, 255))
    dr = ImageDraw.Draw(row)
    ref = Image.open(os.path.join(root, 'full_side.png')).convert('RGBA')
    ref = Image.fromarray(key_magenta(ref), 'RGBA')
    k = rig['height'] / 1300
    ref = ref.resize((int(ref.width * k), int(ref.height * k)))
    row.alpha_composite(ref, (int(Wc / 2 - ref.width / 2), H - 40 - ref.height))
    dr.text((10, 10), '원본(참고)', fill=(200, 30, 30, 255))
    for i, (name, ang) in enumerate(POSES.items()):
        im, M, base = render(rig, imgs, ang, (Wc, H), (Wc / 2, H - 40))
        row.alpha_composite(im, ((i + 1) * Wc, 0))
        dr.text(((i + 1) * Wc + 10, 10), name, fill=(200, 30, 30, 255))
        if i == 0 and False:  # 기본 자세에 관절 점 (끔: 원본과 비교 방해)
            for n, p in P.items():
                q = base @ M[n] @ np.array([p['pivot'][0], p['pivot'][1], 1.0])
                dr.ellipse([(i + 1) * Wc + q[0] - 4, q[1] - 4, (i + 1) * Wc + q[0] + 4, q[1] + 4], fill=(255, 40, 90, 255))
    panels.append(row)
    Wt = max(p.width for p in panels)
    out = Image.new('RGBA', (Wt, sum(p.height for p in panels)), (255, 255, 255, 255))
    yy = 0
    for p in panels:
        out.alpha_composite(p, (0, yy)); yy += p.height
    # 기본 자세 · 걷기 크게 (원본과 나란히)
    big = row.crop((0, 0, Wc * 3, H))
    big = big.resize((int(big.width * 900 / H), 900), Image.LANCZOS)
    big.save(os.path.join(root, '_rest.png'))
    if out.width > 1800:
        out = out.resize((1800, int(out.height * 1800 / out.width)), Image.LANCZOS)
    out.save(os.path.join(root, '_review2.png'))


if __name__ == '__main__':
    for r in sys.argv[1:]:
        main(r)
