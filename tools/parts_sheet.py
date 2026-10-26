"""부위 확인 시트: art/<id>/parts/side/*.png 를 체크무늬 위에 하나씩 늘어놓음 → art/<id>/_parts_sheet.png"""
import json, os, sys
from PIL import Image, ImageDraw

def main(root):
    rig = json.load(open(os.path.join(root, 'rig.json'), encoding='utf-8'))
    V = rig['views']['side']
    names = [n for n in V['order'] if n in V['parts'] and not V['parts'][n].get('dark')]
    ims = [(n, Image.open(os.path.join(root, V['parts'][n]['img'])).convert('RGBA')) for n in names]
    W = 1400; x = y = 0; rowh = 0; pos = []
    for n, im in ims:
        if x + im.width > W: x = 0; y += rowh + 30; rowh = 0
        pos.append((n, im, x, y)); x += im.width + 16; rowh = max(rowh, im.height)
    H = y + rowh + 30
    sheet = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for yy in range(0, H, 16):
        for xx in range(0, W, 16):
            if (xx // 16 + yy // 16) % 2: d.rectangle([xx, yy, xx + 15, yy + 15], fill=(225, 225, 232, 255))
    for n, im, px, py in pos:
        sheet.alpha_composite(im, (px, py + 16))
        d.text((px, py), n, fill=(200, 30, 30, 255))
    sheet.save(os.path.join(root, '_parts_sheet.png'))

if __name__ == '__main__':
    for r in sys.argv[1:]: main(r)
