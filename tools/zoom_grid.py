"""확대 격자: python tools/zoom_grid.py art/<id> x0 y0 x1 y1 [out]  → 25px 격자 + 좌표"""
import sys
from PIL import Image, ImageDraw
root, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
out = sys.argv[6] if len(sys.argv) > 6 else root + '/_zoom.png'
im = Image.open(root + '/full_side.png').convert('RGB').crop((x0, y0, x1, y1))
k = max(1, 900 // max(x1 - x0, y1 - y0)) if max(x1 - x0, y1 - y0) < 900 else 1
im = im.resize((im.width * k, im.height * k), Image.NEAREST)
d = ImageDraw.Draw(im)
for x in range((x0 // 25 + 1) * 25, x1, 25):
    d.line([((x - x0) * k, 0), ((x - x0) * k, im.height)], fill=(0, 0, 0) if x % 100 == 0 else (60, 60, 60), width=2 if x % 100 == 0 else 1)
for y in range((y0 // 25 + 1) * 25, y1, 25):
    d.line([(0, (y - y0) * k), (im.width, (y - y0) * k)], fill=(0, 0, 0) if y % 100 == 0 else (60, 60, 60), width=2 if y % 100 == 0 else 1)
for x in range((x0 // 50 + 1) * 50, x1, 50):
    for y in range((y0 // 50 + 1) * 50, y1, 50):
        d.text(((x - x0) * k + 2, (y - y0) * k + 2), f'{x},{y}', fill=(255, 255, 255))
im.save(out)
