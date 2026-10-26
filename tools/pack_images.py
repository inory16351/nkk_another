"""단일 HTML 용 그림 줄이기: 경로 목록(stdin, web/ 기준 상대 경로) → build/cache/<같은 경로>.webp
캐릭터 부위 · 컷은 절반 (화면에서 최대 키 ~330px), 배경은 가로 1600 이하. 그리는 크기는 코드가 w·h 로 정하므로 해상도만 줄어듦."""
import os, sys
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
for item in sys.stdin.read().split():
    candidates = [
        os.path.normpath(item),
        os.path.normpath(os.path.join(ROOT, item)),
        os.path.normpath(os.path.join(ROOT, 'web', item)),
        os.path.normpath(os.path.join(ROOT, 'web', 'chess', item))
    ]
    src = None
    for c in candidates:
        if os.path.isfile(c):
            src = c
            break
    if not src:
        continue
    dst = os.path.join(ROOT, 'build', 'cache', os.path.relpath(src, ROOT)) + '.webp'
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        im = Image.open(src)
        nsrc = src.replace('\\', '/')
        if '/parts2/' in nsrc or '/parts3/' in nsrc or '/death/' in nsrc:
            im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS)
        elif im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=86, method=5)
    except Exception as e:
        print(f"Error packing {src}: {e}", file=sys.stderr)
print('ok')
