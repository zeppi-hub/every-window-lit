"""
Pictures for the small props, drawn here (no outside sources):
  python3 art/v2/nesne/textures.py <out_dir>
dial.png (pocket watch), cards.png (card atlas: 1 back + 11 faces), sold.png, plate.png
(company sign without words), page.png (notebook page with pasted clippings), cloth.png
(book cover), grille.png (microphone heads), fountain_fall.png (the fountain's falling water, with alpha).
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'fonts')
SERIF = os.path.join(FONTS, 'DejaVuSerif-Bold.ttf')
SANS = os.path.join(FONTS, 'DejaVuSansCondensed-Bold.ttf')
INK = (34, 30, 27)
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
random.seed(5)


def noise(img, amount, blur=0.0):
    w, h = img.size
    n = Image.effect_noise((w, h), amount).convert('L')
    if blur:
        n = n.filter(ImageFilter.GaussianBlur(blur))
    return Image.composite(img, Image.new('RGB', img.size, (0, 0, 0)), n.point(lambda v: 225 + v // 9)).convert('RGB')


def dial():
    S = 1024
    c = S / 2
    img = Image.new('RGB', (S, S), (238, 230, 210))
    d = ImageDraw.Draw(img)
    for r in range(int(c), 0, -4):   # soft enamel glow, lighter in the middle
        t = r / c
        col = tuple(int(a * (1 - 0.06 * t ** 2)) for a in (244, 237, 220))
        d.ellipse([c - r, c - r, c + r, c + r], fill=col)
    d.ellipse([c - 500, c - 500, c + 500, c + 500], outline=INK, width=6)
    d.ellipse([c - 470, c - 470, c + 470, c + 470], outline=INK, width=3)
    for i in range(60):   # minute track
        a = math.radians(i * 6)
        r0 = 470 if i % 5 else 448
        d.line([(c + r0 * math.sin(a), c - r0 * math.cos(a)), (c + 500 * math.sin(a), c - 500 * math.cos(a))], fill=INK, width=8 if i % 5 == 0 else 4)
    font = ImageFont.truetype(SERIF, 96)
    for i, s in enumerate(['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']):
        a = math.radians(i * 30)
        if i == 6:
            continue   # the small seconds dial sits at six
        tile = Image.new('RGBA', (260, 130), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        tw = td.textlength(s, font=font)
        td.text(((260 - tw) / 2, 4), s, font=font, fill=INK)
        tile = tile.rotate(-i * 30, expand=True, resample=Image.BICUBIC)
        r = 365
        x, y = c + r * math.sin(a), c - r * math.cos(a)
        img.paste(tile, (int(x - tile.width / 2), int(y - tile.height / 2)), tile)
    sx, sy, sr = c, c + 250, 92   # small seconds
    d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], outline=INK, width=4, fill=(236, 228, 208))
    for i in range(60):
        a = math.radians(i * 6)
        r0 = sr - (22 if i % 5 == 0 else 12)
        d.line([(sx + r0 * math.sin(a), sy - r0 * math.cos(a)), (sx + sr * math.sin(a), sy - sr * math.cos(a))], fill=INK, width=4 if i % 5 == 0 else 2)
    img.save(os.path.join(OUT, 'dial.png'))


SUITS = {'S': ('♠', INK), 'H': ('♥', (176, 28, 36)), 'D': ('♦', (176, 28, 36)), 'C': ('♣', INK)}
FACES = [('A', 'S'), ('K', 'H'), ('Q', 'D'), ('J', 'C'), ('10', 'S'), ('9', 'H'), ('7', 'D'), ('5', 'C'), ('3', 'S'), ('2', 'H'), ('A', 'D')]
CW, CH = 256, 341


def card_back():
    img = Image.new('RGB', (CW, CH), (248, 245, 238))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([10, 10, CW - 11, CH - 11], 14, fill=(150, 30, 38))
    step = 18
    for k in range(-CH, CW + CH, step):
        d.line([(k, 14), (k + CH, 14 + CH)], fill=(184, 58, 64), width=3)
        d.line([(k, CH - 14), (k + CH, CH - 14 - CH)], fill=(184, 58, 64), width=3)
    d.rounded_rectangle([10, 10, CW - 11, CH - 11], 14, outline=(248, 245, 238), width=0)
    mask = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(mask).rounded_rectangle([18, 18, CW - 19, CH - 19], 10, fill=255)
    base = Image.new('RGB', (CW, CH), (248, 245, 238))
    ImageDraw.Draw(base).rounded_rectangle([10, 10, CW - 11, CH - 11], 14, fill=(150, 30, 38))
    base.paste(img, (0, 0), mask)
    ImageDraw.Draw(base).rounded_rectangle([18, 18, CW - 19, CH - 19], 10, outline=(248, 245, 238), width=4)
    return base


def card_face(rank, suit):
    sym, col = SUITS[suit]
    img = Image.new('RGB', (CW, CH), (250, 248, 242))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([3, 3, CW - 4, CH - 4], 14, outline=(200, 196, 188), width=3)
    f_rank = ImageFont.truetype(SANS, 44)
    f_small = ImageFont.truetype(SANS, 34)
    f_big = ImageFont.truetype(SANS, 150 if rank in 'AKQJ' else 64)
    for flip in (False, True):
        tile = Image.new('RGBA', (70, 100), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        tw = td.textlength(rank, font=f_rank)
        td.text(((70 - tw) / 2, 0), rank, font=f_rank, fill=col)
        sw = td.textlength(sym, font=f_small)
        td.text(((70 - sw) / 2, 48), sym, font=f_small, fill=col)
        if flip:
            tile = tile.rotate(180)
            img.paste(tile, (CW - 82, CH - 112), tile)
        else:
            img.paste(tile, (12, 12), tile)
    if rank in 'AKQJ':
        label = sym if rank == 'A' else rank
        tw = d.textlength(label, font=f_big)
        d.text(((CW - tw) / 2, CH / 2 - 100), label, font=f_big, fill=col)
        if rank != 'A':
            d.rectangle([60, 70, CW - 60, CH - 70], outline=col, width=4)
    else:
        n = int(rank)
        cols = 2 if n > 3 else 1
        per = math.ceil(n / cols)
        for i in range(n):
            cx = CW / 2 if cols == 1 else (CW / 2 - 50 if i < per else CW / 2 + 50)
            j = i if i < per else i - per
            m = per if i < per else n - per
            cy = 80 + (CH - 160) * (j + 0.5) / m
            sw = d.textlength(sym, font=f_big)
            d.text((cx - sw / 2, cy - 40), sym, font=f_big, fill=col)
    return img


def cards():
    atlas = Image.new('RGB', (1024, 1024), (250, 248, 242))
    cells = [card_back()] + [card_face(r, s) for r, s in FACES]
    for i, im in enumerate(cells):
        atlas.paste(im, ((i % 4) * CW, (i // 4) * CH))
    atlas.save(os.path.join(OUT, 'cards.png'))


def sold():
    W, H = 1024, 366
    img = Image.new('RGB', (W, H), (246, 243, 236))
    d = ImageDraw.Draw(img)
    d.rectangle([14, 14, W - 15, H - 15], outline=(168, 26, 30), width=22)
    font = ImageFont.truetype(SANS, 250)
    tw = d.textlength('SOLD', font=font)
    d.text(((W - tw) / 2, 30), 'SOLD', font=font, fill=(168, 26, 30))
    for x, y in ((44, 44), (W - 44, 44), (44, H - 44), (W - 44, H - 44)):
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(150, 150, 146), outline=(90, 90, 86), width=2)
    noise(img, 18).save(os.path.join(OUT, 'sold.png'))


def plate():
    W, H = 1024, 366
    img = Image.new('RGB', (W, H), (24, 36, 58))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, H - 1], outline=(196, 160, 88), width=18)
    d.rectangle([26, 26, W - 27, H - 27], outline=(150, 118, 60), width=4)
    # The mark: a bird on a perch, in brass, at the left. The right is left plain for the name.
    gold = (204, 168, 96)
    d.rounded_rectangle([70, 250, 290, 266], 6, fill=gold)
    d.line([(110, 266), (110, 300)], fill=gold, width=10)
    d.line([(250, 266), (250, 300)], fill=gold, width=10)
    d.ellipse([132, 128, 238, 240], fill=gold)
    d.ellipse([196, 92, 258, 152], fill=gold)
    d.polygon([(254, 112), (286, 124), (254, 134)], fill=gold)
    d.polygon([(140, 200), (86, 236), (150, 226)], fill=gold)
    d.ellipse([224, 112, 236, 124], fill=(24, 36, 58))
    d.line([(170, 238), (170, 252)], fill=gold, width=8)
    d.line([(200, 238), (200, 252)], fill=gold, width=8)
    noise(img, 10).save(os.path.join(OUT, 'plate.png'))


def page():
    W, H = 768, 1024
    img = Image.new('RGB', (W, H), (232, 222, 196))
    img = noise(img, 30, 0.6)
    d = ImageDraw.Draw(img, 'RGBA')
    for (x0, y0, x1, y1, rot) in ((60, 70, 700, 330, -1.2), (90, 380, 680, 640, 0.8), (50, 690, 710, 960, -0.6)):
        clip = Image.new('RGBA', (x1 - x0, y1 - y0), (214, 210, 198, 255))
        cd = ImageDraw.Draw(clip)
        cw = clip.width
        cd.rectangle([18, 16, cw - 18, 96], fill=(206, 202, 190, 255))   # headline space (the game writes here)
        cols = 3
        for c in range(cols):
            cx0 = 18 + c * (cw - 36) / cols + 6
            cx1 = 18 + (c + 1) * (cw - 36) / cols - 6
            for y in range(116, clip.height - 18, 14):
                ln = cx1 - cx0 - (random.random() * 40 if random.random() < 0.2 else 0)
                cd.line([(cx0, y), (cx0 + ln, y)], fill=(120, 116, 108, 255), width=5)
        clip = clip.rotate(rot, expand=True, resample=Image.BICUBIC)
        shadow = Image.new('RGBA', clip.size, (0, 0, 0, 0))
        shadow.putalpha(clip.getchannel('A').point(lambda a: a // 5))
        img.paste((0, 0, 0), (x0 + 5, y0 + 6), shadow.getchannel('A'))
        img.paste(clip, (x0, y0), clip)
        for tx, ty in ((x0 + 10, y0 - 6), (x1 - 70, y1 - 20)):
            d.rectangle([tx, ty, tx + 64, ty + 26], fill=(236, 224, 170, 150))
    img.save(os.path.join(OUT, 'page.png'))


def cloth():
    img = Image.new('RGB', (512, 512), (46, 62, 52))
    d = ImageDraw.Draw(img)
    for y in range(0, 512, 3):
        d.line([(0, y), (511, y)], fill=(40, 55, 46), width=1)
    for x in range(0, 512, 3):
        d.line([(x, 0), (x, 511)], fill=(52, 69, 58), width=1)
    noise(img, 40, 0.8).save(os.path.join(OUT, 'cloth.png'))


def grille():
    img = Image.new('RGB', (256, 256), (70, 70, 72))
    d = ImageDraw.Draw(img)
    for y in range(0, 256, 8):
        for x in range(0, 256, 8):
            d.ellipse([x + 1, y + 1, x + 6, y + 6], fill=(18, 18, 20))
    img.save(os.path.join(OUT, 'grille.png'))


def plaque_1933():
    W, H = 512, 320
    img = Image.new('RGB', (W, H), (150, 112, 58))
    d = ImageDraw.Draw(img)
    d.rectangle([8, 8, W - 9, H - 9], outline=(96, 66, 30), width=10)
    d.rectangle([26, 26, W - 27, H - 27], outline=(190, 150, 86), width=3)
    font = ImageFont.truetype(SERIF, 150)
    tw = d.textlength('1933', font=font)
    d.text(((W - tw) / 2 + 3, 72 + 3), '1933', font=font, fill=(90, 62, 28))
    d.text(((W - tw) / 2, 72), '1933', font=font, fill=(206, 168, 100))
    for x, y in ((40, 40), (W - 40, 40), (40, H - 40), (W - 40, H - 40)):
        d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=(110, 80, 40))
    noise(img, 30).save(os.path.join(OUT, 'plaque_1933.png'))


def water_line():
    W, H = 512, 326
    img = Image.new('RGB', (W, H), (128, 92, 50))
    d = ImageDraw.Draw(img)
    d.rectangle([6, 6, W - 7, H - 7], outline=(84, 58, 28), width=8)
    mid = H // 2
    d.line([(20, mid), (W - 20, mid)], fill=(214, 176, 108), width=8)   # the line: the water's height
    for k in range(3):   # waves under it
        y = mid + 40 + k * 34
        pts = [(x, y + 10 * math.sin(x / 26.0 + k)) for x in range(40, W - 40, 4)]
        d.line(pts, fill=(196, 156, 92), width=6)
    font = ImageFont.truetype(SERIF, 72)
    tw = d.textlength('2008', font=font)
    d.text(((W - tw) / 2, 50), '2008', font=font, fill=(206, 168, 100))
    d.polygon([(30, mid - 16), (30, mid + 16), (56, mid)], fill=(214, 176, 108))
    d.polygon([(W - 30, mid - 16), (W - 30, mid + 16), (W - 56, mid)], fill=(214, 176, 108))
    noise(img, 30).save(os.path.join(OUT, 'water_line.png'))


def burlap():
    img = Image.new('RGB', (512, 512), (150, 122, 84))
    d = ImageDraw.Draw(img)
    for y in range(0, 512, 6):
        d.line([(0, y), (511, y)], fill=(126, 100, 66), width=2)
    for x in range(0, 512, 6):
        d.line([(x, 0), (x, 511)], fill=(170, 142, 100), width=2)
    noise(img, 50, 0.7).save(os.path.join(OUT, 'burlap.png'))


def ivy_colours():
    img = Image.new('RGB', (64, 16), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, c in enumerate([(46, 92, 34), (62, 110, 40), (34, 74, 30), (84, 120, 46)]):
        d.rectangle([i * 16, 0, i * 16 + 15, 15], fill=c)
    img.save(os.path.join(OUT, 'ivy_colours.png'))


def net_inlay():
    """A brass net set into the cobbles (S29): lines only, transparent elsewhere; tile it on the ground."""
    S = 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    step = 128
    for k in range(-S, 2 * S, step):
        for (a, b) in (((k, 0), (k + S, S)), ((k, S), (k + S, 0))):
            d.line([a, b], fill=(120, 92, 46, 255), width=22)
            d.line([a, b], fill=(196, 160, 92, 255), width=12)
    for x in range(0, S + 1, step):
        for y in range(0, S + 1, step):
            d.ellipse([x - 16, y - 16, x + 16, y + 16], fill=(170, 134, 70, 255))
    img.save(os.path.join(OUT, 'net_inlay.png'))


def fountain_fall():
    """Falling water for the fountain's sheets and jet: streaks that tile left to right; glassy where the
    water leaves the lip (top), white foam where it lands (bottom). Alpha is the water's thickness."""
    W, H = 128, 256
    rng = random.Random(11)
    waves = [(k, rng.uniform(0.3, 1.0) / k ** 0.6, rng.uniform(0, 2 * math.pi)) for k in range(3, 24)]
    total = sum(a for _, a, _ in waves)

    def streak(x):
        return 0.5 + 0.5 * sum(a * math.sin(2 * math.pi * k * x / W + p) for k, a, p in waves) / total

    img = Image.new('RGBA', (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        wob = 0.7 * math.sin(y / 31.0) + 0.25 * math.sin(y / 9.0)   # falling water barely sways
        for x in range(W):
            s = max(0.0, min(1.0, (streak(x + wob) - 0.55) / 0.25)) ** 1.5   # thin strands; the sheet between is clear
            grain = rng.uniform(-0.03, 0.03)
            if t < 0.07:   # the smooth sheet leaving the lip
                a = 0.3 + 0.2 * s
            else:
                a = 0.07 + 0.6 * s
            if t > 0.9:   # a little foam where it lands
                a += 0.25 * (t - 0.9) / 0.1
            c = tuple(min(255, int(v + 30 * s)) for v in (212, 230, 240))
            a = max(0.0, min(1.0, a + grain))
            px[x, y] = (*c, int(255 * a))
    img.save(os.path.join(OUT, 'fountain_fall.png'))


plaque_1933()
water_line()
burlap()
ivy_colours()
net_inlay()
dial()
cards()
sold()
plate()
page()
cloth()
grille()
fountain_fall()
print('wrote textures to', OUT)
