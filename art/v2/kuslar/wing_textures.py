"""
Open-wing pictures for rig_bird.py, drawn here:  python3 art/v2/kuslar/wing_textures.py <out_dir>
The picture spans the wing's box: u from the shoulder (0) to the tip (1), v from the trailing
edge (0) to the leading edge (1). Feathers run from the leading edge back and out.
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W, H = 512, 256
random.seed(4)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def paint(name, colour_at, lead):
    """Top of the picture = leading edge. Rows: small coverts, larger coverts, then long flight feathers."""
    img = Image.new('RGB', (W, H), colour_at(0.5, 0.2))
    d = ImageDraw.Draw(img)
    n = 22   # flight feathers, inner (left) to outer (right)
    fw = W / n * 1.5
    for i in range(n):
        t = (i + 0.5) / n
        x = W * t
        lean = 30 * max(0.0, t - 0.5) / 0.5       # outer primaries lean out toward the tip
        col = colour_at(t, 0.2)
        top_y, bot_y = H * 0.42, H + 10
        poly = [(x - fw / 2, top_y), (x + fw / 2, top_y), (x + fw / 2 + lean, bot_y - fw / 2), (x + lean, bot_y), (x - fw / 2 + lean, bot_y - fw / 2)]
        d.polygon(poly, fill=col, outline=shade(col, 0.55))
        d.line([(x, top_y), (x + lean, bot_y)], fill=shade(col, 0.7), width=2)
    for row, (y0, size, v) in enumerate(((0.30, 46, 0.45), (0.16, 34, 0.7), (0.04, 24, 0.9))):
        step = size * 0.8
        k = 0
        x = -size
        while x < W * (1.0 - 0.18 * row) + size:
            t = max(0.0, x / W)
            col = colour_at(t, v)
            yy = H * y0 + (k % 2) * 4
            d.rounded_rectangle([x - size / 2, yy, x + size / 2, yy + size * 1.35], radius=size // 2, fill=col, outline=shade(col, 0.6))
            x += step
            k += 1
    d.rectangle([0, 0, W, int(H * 0.04)], fill=lead)
    img.filter(ImageFilter.GaussianBlur(0.5)).save(os.path.join(OUT, name))


def magpie(t, v):
    if v < 0.3 and t > 0.55:   # white inner webs of the primaries, black tips
        return (222, 222, 216) if t < 0.9 else (14, 16, 20)
    if v < 0.3:
        return (20, 34, 62)    # blue-black secondaries
    return (16, 18, 24) if v > 0.6 else (22, 40, 60)


def macaw(t, v):
    if v > 0.6:
        return (198, 32, 30)   # red lesser and median coverts
    if v > 0.35:
        return (236, 192, 40) if t < 0.5 else ((96, 160, 60) if t < 0.7 else (40, 90, 180))   # yellow greater coverts, green tips
    return (32, 74, 178) if t > 0.2 else (46, 116, 176)        # blue flight feathers


paint('magpie_wing.png', magpie, (10, 12, 16))
paint('parrot_wing.png', macaw, (196, 28, 30))
print('wrote wings to', OUT)
