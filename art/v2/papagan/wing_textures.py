"""Pictures for the player's own wing, breast and wing-tip feathers (art/v2/papagan/player_wing.py):
  python3 -P art/v2/papagan/wing_textures.py <out_dir>

feathers.png   1024 x 1024 RGBA, four feathers side by side as columns (quill at the bottom, tip at
               the top, transparent round them): 0 blue flight feather (primary, narrow leading
               vane), 1 blue-green secondary, 2 yellow covert with a green tip, 3 red covert.
               Each column is 256 px wide. Colours follow the scarlet macaw of parrot.glb (the
               bird the player sees of herself on the broadcast screen).
breast.png     512 x 512, red breast feathers lying over each other like scales, tiling.
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def feather(w, h, base, tip, lead=0.42, trail=0.58, splits=3, seed=0):
    """One feather in a w x h RGBA tile: quill at the bottom middle, tip at the top. lead and trail
    are the vane's widths on each side of the shaft as shares of the half width."""
    rng = random.Random(seed)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = w / 2
    y_tip, y_vane0 = h * 0.03, h * 0.86
    # the outline: widest a third up, rounded tip
    left, right = [], []
    n = 60
    for i in range(n + 1):
        t = i / n                      # 0 at the vane's foot, 1 at the tip
        y = y_vane0 + (y_tip - y_vane0) * t
        prof = math.sin(math.pi * (0.16 + 0.84 * t)) ** 0.45 * (1 - 0.12 * t)
        left.append((cx - w * 0.5 * lead * prof * 0.95, y))
        right.append((cx + w * 0.5 * trail * prof * 0.95, y))
    poly = left + right[::-1]
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    # splits in the vane: thin notches running diagonally in from the edge
    md = ImageDraw.Draw(mask)
    for k in range(splits):
        t = rng.uniform(0.25, 0.8)
        y = y_vane0 + (y_tip - y_vane0) * t
        side = rng.choice((-1, 1))
        x_edge = cx + side * w * 0.5 * (trail if side > 0 else lead) * 0.9
        md.line([(x_edge + side * 4, y + 10), (cx + side * w * 0.06, y - h * 0.03)], fill=0, width=2)
    # colour: base to tip along the feather, barbs slanting toward the tip
    col = Image.new('RGBA', (w, h))
    cd = ImageDraw.Draw(col)
    for y in range(h):
        t = max(0.0, min(1.0, (y_vane0 - y) / (y_vane0 - y_tip)))
        cd.line([(0, y), (w, y)], fill=lerp(base, tip, t ** 1.4) + (255,))
    barbs = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(barbs)
    for k in range(0, int(h * 1.2), 3):
        y = h - k
        a = rng.randint(10, 26)
        shade = (0, 0, 0, a) if (k // 3) % 2 else (255, 255, 255, a // 2)
        bd.line([(cx, y), (0, y + w * 0.28)], fill=shade, width=1)
        bd.line([(cx, y), (w, y + w * 0.28)], fill=shade, width=1)
    col.alpha_composite(barbs.filter(ImageFilter.GaussianBlur(0.4)))
    # a soft darker edge along the vane
    edge = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    # the shaft and the bare quill below the vane
    cd = ImageDraw.Draw(col)
    shaft = lerp(lerp(base, tip, 0.5), (235, 228, 210), 0.3)
    cd.line([(cx, y_tip + 14), (cx, y_vane0)], fill=shaft + (255,), width=3)
    cd.line([(cx, y_vane0), (cx, h)], fill=(214, 205, 180, 255), width=4)
    ImageDraw.Draw(mask).line([(cx, y_vane0), (cx, h)], fill=255, width=5)
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    img = Image.composite(col, img, mask)
    img.putalpha(mask)
    return img


def feathers():
    W = H = 1024
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    specs = [((32, 92, 168), (14, 38, 96), 0.3, 0.7),        # primary: blue, dark tip, narrow leading vane
             ((38, 126, 160), (20, 70, 140), 0.46, 0.54),     # secondary: blue-green
             ((236, 190, 40), (52, 132, 60), 0.5, 0.5),       # covert: yellow with a green tip
             ((200, 30, 32), (150, 16, 22), 0.5, 0.5)]        # red covert
    for i, (base, tip, lead, trail) in enumerate(specs):
        f = feather(256, H, base, tip, lead, trail, splits=4 if i < 2 else 2, seed=i)
        sheet.alpha_composite(f, (i * 256, 0))
    sheet.save(os.path.join(OUT, 'feathers.png'))


def breast():
    S = 512
    img = Image.new('RGB', (S, S), (150, 20, 26))
    d = ImageDraw.Draw(img)
    rng = random.Random(7)
    rows, cols = 12, 9
    for r in range(rows + 2):
        for c in range(cols + 1):
            x = (c + (0.5 if r % 2 else 0)) * S / cols
            y = r * S / rows - S / rows
            wdt, hgt = S / cols * 0.62, S / rows * 1.25
            base = lerp((205, 34, 36), (176, 24, 30), rng.random())
            for dx in (-S, 0, S):
                for dy in (-S, 0, S):
                    box = [x + dx - wdt, y + dy - hgt * 0.2, x + dx + wdt, y + dy + hgt]
                    d.ellipse(box, fill=lerp(base, (110, 12, 18), 0.35))
                    d.ellipse([box[0] + 3, box[1], box[2] - 3, box[3] - 5], fill=base)
                    d.line([(x + dx, y + dy), (x + dx, y + dy + hgt * 0.8)], fill=lerp(base, (240, 120, 100), 0.3), width=1)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    img.save(os.path.join(OUT, 'breast.png'))


feathers()
breast()
print('textures in', OUT)
