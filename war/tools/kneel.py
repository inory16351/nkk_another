"""무릎 꿇은 다리 시트(앞 · 뒤 두 칸) → art/<종>/parts/<front|back>/kneel.png + rig.json 의 시점에 kneel 표시.
앞 · 뒤 시점 웅크림 때 리그가 다리 두 파츠 대신 이 한 장을 그림 (rig.js).

사용: python war/tools/kneel.py art/src/gpt/rat_kneel.png rat
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from rig_cut import key_magenta  # noqa: E402
from hats import bundle  # noqa: E402

ART = os.path.join(os.path.dirname(__file__), '..', 'art')


def main(src, sp):
    rgba = key_magenta(Image.open(src))
    H, W = rgba.shape[:2]
    rig_path = os.path.join(ART, sp, 'rig.json')
    rig = json.load(open(rig_path, encoding='utf-8'))
    for i, v in enumerate(('front', 'back')):
        half = rgba[:, i * W // 2:(i + 1) * W // 2]
        ys, xs = np.nonzero(half[..., 3] > 20)
        crop = half[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray(crop, 'RGBA')
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
        im.save(os.path.join(ART, sp, 'parts', v, 'kneel.png'))
        rig['views'][v]['kneel'] = f'parts/{v}/kneel.png'
    json.dump(rig, open(rig_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(ART, sp, 'rig.js'), 'w', encoding='utf-8') as f:
        f.write('window.RIGS = window.RIGS || {}; window.RIGS[%s] = %s;\n' % (json.dumps(sp), json.dumps(rig, ensure_ascii=False)))
    bundle()


if __name__ == '__main__':
    main(*sys.argv[1:3])
