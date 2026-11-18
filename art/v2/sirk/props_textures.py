"""Pictures for the circus props (art/v2/sirk/props.py), drawn here:
  python3 -P art/v2/sirk/props_textures.py <out_dir>

cannon_col.png   red lacquer with gold scrollwork; u runs round the barrel (top at u = 0.5), v along it
cannon_arm.png   glTF ORM: R occlusion 1, G roughness, B metalness (gold 0.55, lacquer 0.05: the tent has no environment map)
rope_col.png     a three-strand twisted rope, tiling along v
tape_col.png     leather grip wrap, tiling along v
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
RED = (128, 18, 28)
RED_HI = (168, 32, 40)
GOLD = (222, 170, 72)
GOLD_DK = (150, 104, 36)


def spiral(d, cx, cy, r0, turns, sign, width, col, steps=90):
    """A curl: a spiral of decreasing radius, drawn as a thick polyline."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = sign * t * turns * 2 * math.pi
        r = r0 * (1 - 0.85 * t)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    for i in range(len(pts) - 1):
        w = max(1, int(width * (1 - 0.6 * i / len(pts))))
        d.line([pts[i], pts[i + 1]], fill=col, width=w)


def scroll_panel(d, x0, y0, w, h, col, seed):
    """One symmetric panel of scrollwork about its vertical middle line: a stem, two big
    C-scrolls at the foot, two smaller ones above, leaves between, a fleur at the top."""
    cx = x0 + w / 2
    sw = max(3, int(w * 0.055))
    d.line([(cx, y0 + 0.12 * h), (cx, y0 + 0.9 * h)], fill=col, width=sw)
    for side in (-1, 1):
        # big curl at the foot, rolling outward then back in
        spiral(d, cx + side * w * 0.24, y0 + h * 0.72, w * 0.22, 1.4, side, w * 0.06, col)
        d.line([(cx, y0 + h * 0.86), (cx + side * w * 0.2, y0 + h * 0.9)], fill=col, width=sw)
        # smaller curl in the middle, rolling the other way
        spiral(d, cx + side * w * 0.2, y0 + h * 0.42, w * 0.15, 1.3, -side, w * 0.05, col)
        d.line([(cx, y0 + h * 0.5), (cx + side * w * 0.12, y0 + h * 0.56)], fill=col, width=sw)
        # leaves along the stem
        for t, s in ((0.28, 0.09), (0.58, 0.11)):
            lx = cx + side * w * 0.09
            ly = y0 + h * t
            d.polygon([(cx, ly - h * 0.03), (lx + side * w * s, ly + h * 0.02), (cx, ly + h * 0.06)], fill=col)
    # fleur at the top and a bead at the foot
    d.polygon([(cx, y0 + 0.01 * h), (cx - w * 0.09, y0 + 0.13 * h), (cx, y0 + 0.1 * h), (cx + w * 0.09, y0 + 0.13 * h)], fill=col)
    d.ellipse([cx - w * 0.06, y0 + 0.9 * h, cx + w * 0.06, y0 + 0.99 * h], fill=col)


def cannon():
    W, H = 1024, 1024
    col = Image.new('RGB', (W, H), RED)
    d = ImageDraw.Draw(col)
    mask = Image.new('L', (W, H), 0)
    m = ImageDraw.Draw(mask)
    # three panels along the barrel (v), centred on the top line (u = 0.5) and on both sides (u = 0.17, 0.83)
    for i, (v0, v1) in enumerate(((0.06, 0.30), (0.36, 0.64), (0.70, 0.94))):
        for j, uc in enumerate((0.5, 0.17, 0.83)):
            pw = 0.3 * W
            scroll_panel(m, uc * W - pw / 2, v0 * H, pw, (v1 - v0) * H, 255, seed=i * 3 + j)
    # thin gold borders round each panel band
    for v in (0.03, 0.33, 0.67, 0.97):
        m.rectangle([0, v * H - 3, W, v * H + 3], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    gold = Image.new('RGB', (W, H), GOLD)
    # a darker edge inside the gold, like engraving
    edge = mask.filter(ImageFilter.FIND_EDGES).point(lambda p: min(255, p * 3))
    gold_dk = Image.new('RGB', (W, H), GOLD_DK)
    col = Image.composite(gold, col, mask)
    col = Image.composite(gold_dk, col, edge)
    # gentle mottling in the lacquer
    rng = random.Random(4)
    noise = Image.new('L', (W // 16, H // 16))
    noise.putdata([rng.randint(0, 255) for _ in range(noise.size[0] * noise.size[1])])
    noise = noise.resize((W, H), Image.BICUBIC).point(lambda p: int(p * 0.12))
    hi = Image.new('RGB', (W, H), RED_HI)
    col = Image.composite(hi, col, Image.composite(Image.new('L', (W, H), 0), noise, mask))
    col.save(os.path.join(OUT, 'cannon_col.png'))
    # ORM: lacquer rough 0.32 metal 0.05; gold rough 0.28 metal 0.55
    arm = Image.merge('RGB', (Image.new('L', (W, H), 255),
                              Image.composite(Image.new('L', (W, H), 72), Image.new('L', (W, H), 82), mask),
                              Image.composite(Image.new('L', (W, H), 140), Image.new('L', (W, H), 12), mask)))
    arm.resize((512, 512)).save(os.path.join(OUT, 'cannon_arm.png'))


def rope():
    W, H = 128, 512
    img = Image.new('RGB', (W, H), (150, 128, 86))
    d = ImageDraw.Draw(img)
    # three strands: bright diagonal bands with dark grooves between, 8 twists over the tile
    period = H / 8
    for k in range(-2, 30):
        y = k * period / 3
        for dy, c in ((0, (200, 178, 128)), (period / 3 * 0.75, (96, 78, 48))):
            pts = [(0, y + dy), (W, y + dy + period * 0.55)]
            d.line(pts, fill=c, width=int(period / 3 * (0.55 if c[0] > 150 else 0.25)))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    img.save(os.path.join(OUT, 'rope_col.png'))


def tape():
    W, H = 64, 256
    img = Image.new('RGB', (W, H), (74, 47, 28))
    d = ImageDraw.Draw(img)
    for k in range(-2, 20):
        y = k * 16
        d.line([(0, y), (W, y + 10)], fill=(40, 25, 15), width=3)
        d.line([(0, y + 3), (W, y + 13)], fill=(104, 70, 44), width=2)
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    img.save(os.path.join(OUT, 'tape_col.png'))


cannon()
rope()
tape()
print('textures in', OUT)
