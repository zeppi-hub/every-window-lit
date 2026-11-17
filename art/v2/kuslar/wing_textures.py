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


def feathers(d, colour_at, count=34):
    # long flight feathers: from the leading edge band back toward the trailing edge, fanning outward
    for i in range(count):
        t = i / (count - 1)
        x0 = W * (0.05 + 0.9 * t)
        y0 = H * 0.55
        ang = math.radians(100 - 55 * t)   # inner feathers point back, outer ones point out to the tip
        ln = H * (0.75 + 0.35 * t)
        x1, y1 = x0 + math.cos(ang) * ln * (0.3 + 0.9 * t), y0 + math.sin(ang) * ln * -1 + ln
        col = colour_at(t, 0.3)
        d.line([(x0, y0), (x1, min(H + 40, y1))], fill=col, width=int(W / count * 1.6))
        d.line([(x0, y0), (x1, min(H + 40, y1))], fill=tuple(max(0, c - 40) for c in col), width=2)


def coverts(d, colour_at, rows=3):
    for r in range(rows):
        y = H * (0.62 + 0.12 * r)
        for i in range(26):
            x = W * (i / 25) * (0.7 - 0.1 * r)
            col = colour_at(x / W, 0.65 + 0.12 * r)
            d.ellipse([x - 14, y - 10, x + 14, y + 12], fill=col, outline=tuple(max(0, c - 35) for c in col))


def paint(name, colour_at, lead):
    img = Image.new('RGB', (W, H), colour_at(0.5, 0.3))
    d = ImageDraw.Draw(img)
    # the picture's v runs bottom (trailing edge) to top (leading edge); PIL y runs down, so draw flipped
    feathers(d, colour_at)
    coverts(d, colour_at)
    d.rectangle([0, int(H * 0.9), W, H], fill=lead)
    img = img.transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(0.6))
    img.save(os.path.join(OUT, name))


def magpie(t, v):
    if v < 0.5 and t > 0.55:   # white inner webs of the primaries, black tips
        return (225, 225, 220) if t < 0.92 else (12, 14, 18)
    return (14, 22, 40) if v < 0.5 else (10, 12, 16)


def macaw(t, v):
    if v > 0.72:
        return (200, 30, 30)   # red lesser coverts
    if v > 0.55 and t < 0.75:
        return (232, 190, 40) if t < 0.55 else (70, 150, 70)   # yellow greater coverts, green tips
    return (30, 70, 175) if t > 0.25 else (40, 110, 170)       # blue flight feathers


paint('magpie_wing.png', magpie, (10, 12, 16))
paint('parrot_wing.png', macaw, (196, 28, 30))
print('wrote wings to', OUT)
