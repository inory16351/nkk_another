"""검토용: 병종 몸 파츠 + 개체 얼굴 + 병종 모자를 기본 자세로 겹친 통 이미지 ↔ 원본 병종 시트를 나란히.

사용: python war/tools/compose_check.py <병종> <얼굴 번호> [출력.png]
"""
import json
import os
import sys

from PIL import Image

ART = os.path.join(os.path.dirname(__file__), '..', 'art')


def compose(cls, face):
    R = json.load(open(os.path.join(ART, f'rat_{cls}' if cls != 'recruit' else 'rat', 'rig.json'), encoding='utf-8'))
    F = json.load(open(os.path.join(ART, f'rat_face{face}', 'rig.json'), encoding='utf-8'))
    d = os.path.join(ART, f'rat_{cls}' if cls != 'recruit' else 'rat')
    out = []
    for v in ('front', 'side', 'back'):
        V = R['views'][v]
        c = Image.new('RGBA', (V['w'], V['h']), (60, 60, 60, 255))
        for n in V['order']:
            p = V['parts'][n]
            if n == 'head':
                fp = F['views'][v]['parts']['head']
                c.alpha_composite(Image.open(os.path.join(ART, f'rat_face{face}', fp['img'])), (round(fp['x']), round(fp['y'])))
                if p.get('hat'):
                    c.alpha_composite(Image.open(os.path.join(d, p['hat'])), (round(p['x']), round(p['y'])))
                continue
            c.alpha_composite(Image.open(os.path.join(d, p['img'])), (round(p['x']), round(p['y'])))
        orig = Image.open(os.path.join(d, f'full_{v}.png')).convert('RGB').resize((V['w'], V['h']))
        out += [orig, c.convert('RGB')]
    W = sum(i.width for i in out)
    sheet = Image.new('RGB', (W, out[0].height))
    x = 0
    for i in out:
        sheet.paste(i, (x, 0)); x += i.width
    return sheet


if __name__ == '__main__':
    cls, face = sys.argv[1], sys.argv[2]
    compose(cls, face).save(sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.environ.get('TMP', '.'), f'cmp_{cls}_{face}.jpg'), quality=80)
