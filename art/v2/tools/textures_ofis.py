"""Draws the office and press-room prints: the leader's seal, the press backdrop,
a fictional national flag, a brass nameplate, a city map, two TV screens, book
spines and a rug. All generic English, no real country, person or brand.
  python3 -P art/v2/tools/textures_ofis.py <out_dir>
Writes ofis.png (2048 x 1024) and ofis.json (pixel rectangles, origin top-left).
"""
import json, math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
SANS = os.path.join(HERE, 'fonts', 'DejaVuSansCondensed-Bold.ttf')
NARROW = os.path.join(HERE, 'fonts', 'LiberationSansNarrow-Bold.ttf')
SERIF = os.path.join(HERE, 'fonts', 'DejaVuSerif-Bold.ttf')
random.seed(11)
W, H = 2048, 1024
img = Image.new('RGB', (W, H), (30, 30, 34))
d = ImageDraw.Draw(img)
R = {}
NAVY, GOLD, CREAM = (22, 34, 64), (196, 160, 82), (236, 228, 206)


def f(path, size):
    return ImageFont.truetype(path, size)


def text_c(box, text, path, size, fill):
    x, y, w, h = box
    s = size
    while s > 6:
        ft = f(path, s)
        l, t, r, b = d.textbbox((0, 0), text, font=ft)
        if r - l <= w * 0.92 and b - t <= h * 0.8:
            break
        s -= 2
    d.text((x + (w - (r - l)) / 2 - l, y + (h - (b - t)) / 2 - t), text, font=ft, fill=fill)


def arc_text(cx, cy, radius, text, size, fill, start=-150, end=150):
    """Letters along an arc, spaced by their own widths."""
    ft = f(SERIF, size)
    widths = [d.textlength(ch, font=ft) + size * 0.08 for ch in text]
    total = sum(widths)
    span = end - start
    acc = 0.0
    for ch, w in zip(text, widths):
        mid = start + span * (acc + w / 2) / total
        acc += w
        ang = math.radians(mid - 90)
        x, y = cx + radius * math.cos(ang), cy + radius * math.sin(ang)
        tile = Image.new('RGBA', (size * 2, size * 2), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        l, t, r, b = td.textbbox((0, 0), ch, font=ft)
        td.text((size - (r - l) / 2 - l, size - (b - t) / 2 - t), ch, font=ft, fill=fill)
        tile = tile.rotate(-math.degrees(ang) - 90, resample=Image.BICUBIC)
        img.paste(tile, (int(x - size), int(y - size)), tile)


def seal(x, y, s, bg=NAVY):
    """The leader's seal: gold rings, an arc of text, a laurel and a star. Square region s x s."""
    d.rectangle([x, y, x + s - 1, y + s - 1], fill=bg)
    cx, cy, r = x + s / 2, y + s / 2, s * 0.46
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=GOLD, width=max(2, s // 64))
    d.ellipse([cx - r * 0.72, cy - r * 0.72, cx + r * 0.72, cy + r * 0.72], outline=GOLD, width=max(2, s // 90))
    arc_text(cx, cy, r * 0.86, 'OFFICE OF THE PRIME MINISTER', max(10, int(s * 0.07)), GOLD, -130, 130)
    # Laurel: two arcs of leaves.
    for side in (-1, 1):
        for k in range(9):
            a = math.radians(200 + k * 14) if side < 0 else math.radians(-20 - k * 14)
            lx, ly = cx + r * 0.55 * math.cos(a), cy - r * 0.55 * math.sin(a) + r * 0.05
            d.ellipse([lx - s * 0.022, ly - s * 0.012, lx + s * 0.022, ly + s * 0.012], fill=GOLD)
    # Five-pointed star.
    pts = []
    for k in range(10):
        rr = r * (0.3 if k % 2 == 0 else 0.12)
        a = math.radians(-90 + k * 36)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) - r * 0.04))
    d.polygon(pts, fill=GOLD)


# Seal, 512 x 512 at (0, 0).
seal(0, 0, 512)
R['seal'] = (0, 0, 512, 512)
# Press backdrop: navy with a faint seal pattern and the words, 1024 x 512 at (512, 0).
x0, y0 = 512, 0
d.rectangle([x0, y0, x0 + 1023, y0 + 511], fill=(18, 28, 54))
for j in range(2):
    for i in range(4):
        cx, cy = x0 + 128 + i * 256, y0 + 128 + j * 256
        d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], outline=(34, 48, 84), width=6)
        d.ellipse([cx - 48, cy - 48, cx + 48, cy + 48], outline=(34, 48, 84), width=3)
R['backdrop'] = (x0, y0, 1024, 512)
# Flag (fictional): forest green field, white ring, gold stripe at the hoist. 512 x 256 at (1536, 0).
x0, y0 = 1536, 0
d.rectangle([x0, y0, x0 + 511, y0 + 255], fill=(24, 82, 56))
d.rectangle([x0, y0, x0 + 70, y0 + 255], fill=GOLD)
d.ellipse([x0 + 230, y0 + 58, x0 + 370, y0 + 198], outline=(240, 240, 236), width=18)
R['flag'] = (x0, y0, 512, 256)
# Brass nameplate, 512 x 128 at (1536, 256).
x0, y0 = 1536, 256
for k in range(128):
    c = int(150 + 50 * math.sin(k / 128 * math.pi))
    d.line([x0, y0 + k, x0 + 511, y0 + k], fill=(c, int(c * 0.8), int(c * 0.45)))
d.rectangle([x0 + 6, y0 + 6, x0 + 505, y0 + 121], outline=(110, 84, 40), width=3)
text_c((x0, y0, 512, 128), 'THE PRIME MINISTER', SERIF, 60, (60, 44, 20))
R['nameplate'] = (x0, y0, 512, 128)
# Podium plaque text, 512 x 128 at (1536, 384).
x0, y0 = 1536, 384
d.rectangle([x0, y0, x0 + 511, y0 + 127], fill=NAVY)
text_c((x0, y0, 512, 128), 'PRESS BRIEFING', SERIF, 56, GOLD)
R['briefing'] = (x0, y0, 512, 128)
# City map, 512 x 512 at (0, 512): generic grid, a river, a park; no names.
x0, y0 = 0, 512
d.rectangle([x0, y0, x0 + 511, y0 + 511], fill=(232, 224, 200))
d.polygon([(x0, y0 + 360), (x0 + 200, y0 + 300), (x0 + 512, y0 + 380), (x0 + 512, y0 + 430), (x0 + 200, y0 + 350), (x0, y0 + 410)], fill=(150, 184, 204))
for k in range(0, 512, 38):
    d.line([x0 + k, y0, x0 + k + 20, y0 + 512], fill=(250, 248, 240), width=6)
    d.line([x0, y0 + k, x0 + 512, y0 + k - 12], fill=(250, 248, 240), width=6)
d.rectangle([x0 + 230, y0 + 150, x0 + 300, y0 + 210], fill=(150, 190, 130))
d.rectangle([x0 + 6, y0 + 6, x0 + 505, y0 + 505], outline=(70, 60, 40), width=6)
R['map'] = (x0, y0, 512, 512)
# Two TV screens, 512 x 288 each, at (512, 512) and (1024, 512).
for i, (title, sub) in enumerate((('LIVE', 'PRESS BRIEFING  |  CAPITAL'), ('MARKETS', 'TRADING HALTED FOR 15 MINUTES'))):
    x0, y0 = 512 + i * 512, 512
    for k in range(288):
        c = int(30 + 40 * k / 288)
        d.line([x0, y0 + k, x0 + 511, y0 + k], fill=(c // 2, c // 2 + 6, c + 20))
    if i == 0:
        seal(x0 + 196, y0 + 40, 120, bg=(20, 26, 46))
    else:
        pts = [(x0 + 30 + k * 20, y0 + 70 + int(60 * (k / 22) ** 1.6) + random.randint(-8, 8)) for k in range(23)]
        d.line(pts, fill=(230, 60, 50), width=5)
    d.rectangle([x0, y0 + 200, x0 + 511, y0 + 287], fill=(160, 24, 30) if i == 1 else (24, 40, 90))
    text_c((x0 + 10, y0 + 204, 180, 40), title, SANS, 34, (255, 255, 255))
    text_c((x0 + 10, y0 + 244, 492, 40), sub, NARROW, 30, (255, 255, 255))
    R[f'tv_{i}'] = (x0, y0, 512, 288)
# Book spines, 512 x 224 at (1536, 512).
x0, y0 = 1536, 512
x = x0
while x < x0 + 512:
    w = random.randint(12, 30)
    c = random.choice([(90, 30, 30), (30, 50, 90), (40, 70, 45), (120, 100, 70), (60, 40, 30), (150, 130, 90), (30, 30, 34)])
    d.rectangle([x, y0, x + w - 1, y0 + 223], fill=c)
    for band in (30, 190):
        d.rectangle([x, y0 + band, x + w - 1, y0 + band + 6], fill=GOLD if random.random() < 0.6 else (200, 190, 160))
    x += w
R['books'] = (x0, y0, 512, 224)
# Rug, 512 x 288 at (1536, 736): deep red field, gold border, a medallion.
x0, y0 = 1536, 736
d.rectangle([x0, y0, x0 + 511, y0 + 287], fill=(110, 26, 32))
d.rectangle([x0 + 14, y0 + 14, x0 + 497, y0 + 273], outline=GOLD, width=10)
d.rectangle([x0 + 34, y0 + 34, x0 + 477, y0 + 253], outline=(60, 20, 26), width=6)
d.ellipse([x0 + 186, y0 + 74, x0 + 326, y0 + 214], outline=GOLD, width=8)
R['rug'] = (x0, y0, 512, 288)
# Solid swatches, 64 x 64, along (0..) y 1024-64 inside the map row's right? Put at (512, 800).
for i, c in enumerate([NAVY, GOLD, CREAM, (20, 20, 22), (240, 240, 236)]):
    x0, y0 = 512 + i * 64, 832
    d.rectangle([x0, y0, x0 + 63, y0 + 63], fill=c)
    R[f'solid_{i}'] = (x0, y0, 64, 64)
img = img.filter(ImageFilter.GaussianBlur(0.4))
img.save(os.path.join(OUT, 'ofis.png'))
json.dump({'size': [W, H], 'regions': R}, open(os.path.join(OUT, 'ofis.json'), 'w'), indent=1)
print('wrote ofis.png', len(R))
