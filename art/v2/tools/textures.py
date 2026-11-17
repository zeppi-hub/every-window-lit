"""Draws the v2 textures that are made here, not downloaded: shop signs,
window notices, newspaper racks, street-name plates, awning stripes, the bank
frieze, the factory's painted sign, and the far skyline's window grid.
  python3 -P art/v2/tools/textures.py <out_dir>
Writes signs.png (2048 x 1024) with signs.json (pixel rectangles of every
region, origin top-left) and skyline.png (512 x 512). All text is generic
English; phone numbers use the 555-01xx range kept for fiction.
"""
import json, os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
SANS = os.path.join(HERE, 'fonts', 'DejaVuSansCondensed-Bold.ttf')
NARROW = os.path.join(HERE, 'fonts', 'LiberationSansNarrow-Bold.ttf')
SERIF = os.path.join(HERE, 'fonts', 'DejaVuSerif-Bold.ttf')
os.makedirs(OUT, exist_ok=True)
random.seed(7)
W, H = 2048, 1024
atlas = Image.new('RGB', (W, H), (40, 40, 40))
regions = {}


def font(path, size):
    return ImageFont.truetype(path, size)


def fit(draw, text, path, box_w, box_h, start):
    s = start
    while s > 8:
        f = font(path, s)
        l, t, r, b = draw.textbbox((0, 0), text, font=f)
        if r - l <= box_w and b - t <= box_h:
            return f, (l, t, r, b)
        s -= 2
    return font(path, 8), draw.textbbox((0, 0), text, font=font(path, 8))


def centred(draw, box, text, path, fill, size, pad=0.1, dy=0):
    x, y, w, h = box
    f, (l, t, r, b) = fit(draw, text, path, int(w * (1 - 2 * pad)), int(h * 0.78), size)
    draw.text((x + (w - (r - l)) / 2 - l, y + (h - (b - t)) / 2 - t + dy), text, font=f, fill=fill)


def weather(img, box, amount=10):
    """Adds faint grime so painted panels do not look flat."""
    x, y, w, h = box
    px = img.load()
    for j in range(y, y + h):
        fade = (j - y) / max(1, h)
        for i in range(x, x + w, 1):
            n = random.randint(-amount, amount) - int(fade * amount * 0.6)
            r, g, b = px[i, j]
            px[i, j] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))


def sign(name, box, text, bg, fg, path=SANS, sub=None, border=None):
    d = ImageDraw.Draw(atlas)
    x, y, w, h = box
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=bg)
    if border:
        d.rectangle([x + 6, y + 6, x + w - 7, y + h - 7], outline=border, width=4)
    if sub:
        centred(d, (x, y, w, int(h * 0.72)), text, path, fg, 120, dy=4)
        centred(d, (x, y + int(h * 0.62), w, int(h * 0.36)), sub, NARROW, fg, 40)
    else:
        centred(d, box, text, path, fg, 120)
    weather(atlas, box, 7)
    regions[name] = box


# Rows 0-4: ten shop fascia signs, 1024 x 128 each, two columns (vacant shops use solid_2).
shops = [
    ('bakery', 'BAKERY', (118, 28, 30), (246, 232, 200), 'FRESH BREAD DAILY', (214, 180, 120)),
    ('hardware', 'HARDWARE', (28, 70, 48), (240, 240, 230), 'TOOLS  PAINT  KEYS', None),
    ('pharmacy', 'PHARMACY', (24, 52, 110), (245, 245, 245), None, None),
    ('laundromat', 'LAUNDROMAT', (230, 228, 220), (30, 60, 120), 'COIN WASH  OPEN 7 DAYS', None),
    ('diner', 'DINER', (240, 236, 222), (180, 30, 30), 'BREAKFAST ALL DAY', None),
    ('furniture', 'FURNITURE', (52, 40, 32), (232, 214, 170), None, (200, 170, 110)),
    ('home_loans', 'HOME LOANS', (250, 250, 248), (20, 70, 60), 'LOW RATES  FAST APPROVAL', None),
    ('cafe', 'CAFE', (34, 34, 36), (236, 206, 150), 'COFFEE  TEA  PASTRY', None),
    ('real_estate', 'REAL ESTATE', (26, 46, 80), (240, 240, 240), 'HOMES FOR SALE', None),
    ('grocery', 'GROCERY', (40, 96, 50), (250, 246, 230), 'FRESH PRODUCE', None),
]
for k, (name, text, bg, fg, sub, border) in enumerate(shops):
    col, row = k % 2, k // 2
    sign(name, (col * 1024, row * 128, 1024, 128), text, bg, fg, sub=sub, border=border)

# The bank frieze: bronze capitals on dark stone, 2048 x 128 across row 8.
d = ImageDraw.Draw(atlas)
box = (0, 1024 - 128, 1024, 128)
d.rectangle([0, box[1], 1023, 1023], fill=(178, 170, 156))
centred(d, (0, box[1] + 4, 1024, 124), 'SAVINGS  BANK', SERIF, (92, 80, 62), 120, pad=0.06)
centred(d, (0, box[1], 1024, 128), 'SAVINGS  BANK', SERIF, (66, 56, 44), 120, pad=0.06)
weather(atlas, box, 6)
regions['bank_frieze'] = box

# The factory's painted sign: faded white letters on soot-dark brick red.
box = (1024, 1024 - 128, 1024, 128)
d.rectangle([1024, box[1], 2047, 1023], fill=(96, 44, 34))
centred(d, box, 'GEAR WORKS  PLANT No. 2', NARROW, (226, 220, 206), 110, pad=0.04)
weather(atlas, box, 18)
regions['factory'] = box

# Row 7 (y 896..1023 used above). Row 6 (y 768..895): notices and small plates.
y0 = 768
def notice(name, x, w, h, bg, lines):
    d = ImageDraw.Draw(atlas)
    d.rectangle([x, y0, x + w - 1, y0 + h - 1], fill=bg)
    n = len(lines)
    for i, (text, fg, path) in enumerate(lines):
        centred(d, (x, y0 + i * h // n, w, h // n), text, path, fg, 60, pad=0.08)
    weather(atlas, (x, y0, w, h), 5)
    regions[name] = (x, y0, w, h)

notice('for_lease', 0, 128, 128, (244, 242, 236), [('FOR', (200, 20, 20), SANS), ('LEASE', (200, 20, 20), SANS), ('555-0148', (20, 20, 20), NARROW)])
notice('closing_sale', 128, 128, 128, (250, 214, 40), [('CLOSING', (20, 20, 20), SANS), ('SALE', (200, 20, 20), SANS), ('ALL MUST GO', (20, 20, 20), NARROW)])
notice('open', 256, 128, 128, (20, 20, 20), [('', (0, 0, 0), SANS), ('OPEN', (240, 40, 40), SANS), ('', (0, 0, 0), SANS)])
notice('closed', 384, 128, 128, (236, 234, 228), [('SORRY', (20, 20, 20), NARROW), ('CLOSED', (20, 20, 20), SANS), ('', (0, 0, 0), SANS)])
notice('for_sale', 512, 128, 128, (250, 250, 250), [('FOR', (20, 60, 140), SANS), ('SALE', (20, 60, 140), SANS), ('555-0172', (20, 20, 20), NARROW)])
notice('news_kiosk', 640, 384, 128, (24, 70, 50), [('NEWS', (246, 236, 200), SANS)])
# Street-name plates, 256 x 64, two per row.
for i, text in enumerate(['MAIN ST', 'MILL ST', 'BANK ST', 'ELM ST']):
    x = 1024 + (i % 2) * 256
    y = y0 + (i // 2) * 64
    d.rectangle([x, y, x + 255, y + 63], fill=(20, 100, 60))
    d.rectangle([x + 3, y + 3, x + 252, y + 60], outline=(235, 240, 235), width=2)
    centred(d, (x, y, 256, 64), text, SANS, (240, 245, 240), 40, pad=0.08)
    regions['street_' + text.split()[0].lower()] = (x, y, 256, 64)
# Awning stripes: red/cream and green/cream, 256 x 128 each.
for i, (c1, c2) in enumerate([((150, 30, 32), (236, 226, 204)), ((30, 84, 56), (230, 224, 204))]):
    x = 1536 + i * 256
    for s in range(8):
        d.rectangle([x + s * 32, y0, x + s * 32 + 31, y0 + 127], fill=c1 if s % 2 == 0 else c2)
    weather(atlas, (x, y0, 256, 128), 8)
    regions['awning_' + ('red' if i == 0 else 'green')] = (x, y0, 256, 128)
# Newspapers and magazines in a rack, row y 640..767 (1024 wide): generic mastheads only.
y1 = 640
covers = [('THE DAILY', (245, 243, 236)), ('CITY NEWS', (240, 238, 230)), ('MORNING', (244, 240, 228)), ('THE DAILY', (245, 243, 236)),
          ('MONEY', (30, 60, 120)), ('HOME', (200, 60, 50)), ('SPORT', (240, 180, 30)), ('WEEKLY', (60, 120, 70))]
for i, (title, bg) in enumerate(covers):
    x = i * 128
    d.rectangle([x + 2, y1 + 2, x + 125, y1 + 125], fill=bg)
    dark = sum(bg) < 400
    ink = (245, 245, 245) if dark else (25, 25, 25)
    centred(d, (x, y1 + 4, 128, 30), title, SERIF if not dark else SANS, ink, 26, pad=0.06)
    if not dark:
        d.line([x + 8, y1 + 36, x + 120, y1 + 36], fill=(60, 60, 60), width=2)
        d.rectangle([x + 10, y1 + 42, x + 64, y1 + 84], fill=(150, 150, 150))
        for k in range(10):
            d.line([x + 70, y1 + 44 + k * 7, x + 118, y1 + 44 + k * 7], fill=(120, 120, 120), width=2)
        for k in range(4):
            d.line([x + 10, y1 + 92 + k * 8, x + 118, y1 + 92 + k * 8], fill=(120, 120, 120), width=2)
    else:
        d.rectangle([x + 14, y1 + 40, x + 114, y1 + 112], fill=tuple(min(255, c + 40) for c in bg))
regions['news_rack'] = (0, y1, 1024, 128)
# Plain fascia for awning sides and kiosk trim (solid colours), right of the rack.
for i, c in enumerate([(24, 70, 50), (118, 28, 30), (46, 44, 42), (232, 228, 220)]):
    x = 1024 + i * 64
    d.rectangle([x, y1, x + 63, y1 + 127], fill=c)
    regions[f'solid_{i}'] = (x, y1, 64, 128)
atlas.save(os.path.join(OUT, 'signs.png'))
json.dump({'size': [W, H], 'regions': regions}, open(os.path.join(OUT, 'signs.json'), 'w'), indent=1)

# Skyline: office-tower facade, 8 x 8 window cells with mullions, mixed blinds.
S = 512
sky = Image.new('RGB', (S, S), (70, 78, 88))
d = ImageDraw.Draw(sky)
cell = S // 8
for j in range(8):
    for i in range(8):
        x, y = i * cell, j * cell
        g = random.choice([(46, 56, 70), (52, 62, 76), (60, 70, 84), (88, 96, 104), (40, 48, 60)])
        d.rectangle([x + 5, y + 6, x + cell - 6, y + cell - 10], fill=g)
        if random.random() < 0.25:
            d.rectangle([x + 5, y + 6, x + cell - 6, y + 6 + random.randint(6, 30)], fill=(150, 150, 140))
sky = sky.filter(ImageFilter.GaussianBlur(0.6))
sky.save(os.path.join(OUT, 'skyline.png'))
print('wrote', OUT, len(regions), 'regions')
