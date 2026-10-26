# 마젠타 배경 시트(기본 3열 × 2행) → PNG 여러 장 (투명 배경, 여백 잘라냄)
# 사용: python tools/cut_pieces.py <시트.png> <출력 폴더> <이름들(쉼표)> [열 수] [행 수]
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

src, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
COLS = int(sys.argv[4]) if len(sys.argv) > 4 else 3
ROWS = int(sys.argv[5]) if len(sys.argv) > 5 else 2
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
# 마젠타 정도: R · B 높고 G 낮음
mag = np.clip(((r + b) / 2 - g - 60) / 120, 0, 1)
alpha = 1 - mag
# 가장자리 마젠타 번짐 빼기: 반투명 픽셀의 R · B 를 G 쪽으로 당김
spill = np.clip(np.minimum(r, b) - g, 0, None) * mag
rgb = im.copy()
rgb[..., 0] -= spill; rgb[..., 2] -= spill
rgb = np.clip(rgb, 0, 255)
solid = alpha > 0.5
lab, n = ndimage.label(ndimage.binary_closing(solid, iterations=3))
H, W = solid.shape
os.makedirs(out, exist_ok=True)
for i, name in enumerate(names):
    cx, cy = (i % COLS), (i // COLS)
    x0, x1, y0, y1 = cx * W // COLS, (cx + 1) * W // COLS, cy * H // ROWS, (cy + 1) * H // ROWS
    # 칸 안에서 가장 큰 덩어리 + 그 칸에 걸친 덩어리들
    cell = lab[y0:y1, x0:x1]
    ids, cnt = np.unique(cell[cell > 0], return_counts=True)
    keep = ids[cnt > 400]
    m = np.isin(lab, keep)
    # 옆 칸 그림과 맞닿아 한 덩어리가 돼도 이 칸 안쪽만 쓰고, 칸 안에서 다시 나눠 큰 덩어리만 (옆 그림 끄트머리 버림)
    inside = np.zeros_like(m); inside[y0:y1, x0:x1] = True
    m &= inside
    sub, k = ndimage.label(m)
    if k > 1:
        sizes = ndimage.sum(m, sub, range(1, k + 1))
        m = np.isin(sub, [j + 1 for j, v in enumerate(sizes) if v >= sizes.max() * 0.2])
    ys, xs = np.nonzero(m)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    a = (alpha * m)[by0:by1, bx0:bx1]
    tile = np.dstack([rgb[by0:by1, bx0:bx1], a * 255]).astype(np.uint8)
    pad = 6
    canvas = np.zeros((tile.shape[0] + pad * 2, tile.shape[1] + pad * 2, 4), np.uint8)
    canvas[pad:-pad, pad:-pad] = tile
    Image.fromarray(canvas).save(os.path.join(out, name + '.png'))
    print(name, canvas.shape[1], 'x', canvas.shape[0])
