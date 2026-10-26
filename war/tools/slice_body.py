"""3방향 몸 시트(3칸 × 1줄) → art/<id>/full_front · full_side · full_back.png + 격자 확인 그림

사용: python war/tools/slice_body.py war/art/src/gpt/rat_body.png war/art/rat
"""
import os
import sys

from PIL import Image, ImageDraw


def main(src, out):
    os.makedirs(out, exist_ok=True)
    im = Image.open(src).convert('RGB')
    W, H = im.size
    cw = W // 3
    for i, v in enumerate(['front', 'side', 'back']):
        cell = im.crop((i * cw, 0, (i + 1) * cw, H))
        cell.save(os.path.join(out, f'full_{v}.png'))
        g = cell.copy()
        d = ImageDraw.Draw(g)
        for x in range(0, cw, 25):
            d.line([(x, 0), (x, H)], fill=(255, 255, 255) if x % 100 else (0, 0, 0), width=1)
        for y in range(0, H, 25):
            d.line([(0, y), (cw, y)], fill=(255, 255, 255) if y % 100 else (0, 0, 0), width=1)
        for x in range(0, cw, 100):
            for y in range(0, H, 100):
                d.text((x + 2, y + 2), f'{x},{y}', fill=(0, 0, 0))
        g.save(os.path.join(out, f'_grid_{v}.png'))
    print('저장', out)


if __name__ == '__main__':
    main(*sys.argv[1:3])
