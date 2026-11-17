"""Draws the circus prints: striped tent canvas, the painted ring curb, pedestal
paint, bunting colours, and the safety net (with transparent holes).
  python3 -P art/v2/tools/textures_sirk.py <out_dir>
Writes sirk.png (1024 x 1024, regions in sirk.json), the tiling canvas.png, curb.png and pole.png,
and net.png (512 x 512 RGBA).
"""
import json, math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
random.seed(5)
img = Image.new('RGB', (1024, 1024), (200, 190, 170))
d = ImageDraw.Draw(img)
R = {}
RED, CREAM, BLUE, GOLD = (168, 28, 34), (236, 226, 200), (30, 60, 130), (214, 170, 60)


def grain(box, amount=10):
    x0, y0, w, h = box
    px = img.load()
    for j in range(y0, y0 + h):
        for i in range(x0, x0 + w):
            n = random.randint(-amount, amount)
            r, g, b = px[i, j]
            px[i, j] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))


# Tent canvas: vertical stripes with a darker seam, 512 x 512 at (0, 0); repeats across.
for s in range(8):
    c = RED if s % 2 == 0 else CREAM
    d.rectangle([s * 64, 0, s * 64 + 63, 511], fill=c)
    d.line([s * 64, 0, s * 64, 511], fill=(90, 60, 50), width=2)
grain((0, 0, 512, 512), 9)
R['canvas'] = (0, 0, 512, 512)
# Ring curb: red and white blocks with a gold line, 512 x 128 at (512, 0).
for s in range(8):
    d.rectangle([512 + s * 64, 0, 512 + s * 64 + 63, 127], fill=RED if s % 2 == 0 else CREAM)
d.rectangle([512, 0, 1023, 10], fill=GOLD)
d.rectangle([512, 117, 1023, 127], fill=GOLD)
grain((512, 0, 512, 128), 7)
R['curb'] = (512, 0, 512, 128)
# Pedestal drum: blue with gold stars, 512 x 128 at (512, 128).
d.rectangle([512, 128, 1023, 255], fill=BLUE)
for k in range(6):
    cx, cy, r = 512 + 42 + k * 85, 192, 26
    pts = [(cx + (r if i % 2 == 0 else r * 0.42) * math.cos(math.radians(-90 + i * 36)), cy + (r if i % 2 == 0 else r * 0.42) * math.sin(math.radians(-90 + i * 36))) for i in range(10)]
    d.polygon(pts, fill=GOLD)
d.rectangle([512, 128, 1023, 136], fill=GOLD)
d.rectangle([512, 247, 1023, 255], fill=GOLD)
R['drum'] = (512, 128, 512, 128)
# Bunting and solid colours, 64 x 64 each along y = 256.
for i, c in enumerate([RED, CREAM, BLUE, GOLD, (40, 120, 60), (230, 120, 30), (20, 20, 22), (120, 90, 60)]):
    d.rectangle([512 + i * 64, 256, 512 + i * 64 + 63, 319], fill=c)
    R[f'solid_{i}'] = (512 + i * 64, 256, 64, 64)
# Painted pole: spiral red/cream, 512 x 128 at (512, 320).
for k in range(0, 600, 40):
    d.polygon([(512 + k, 320), (512 + k + 20, 320), (512 + k - 108, 447), (512 + k - 128, 447)], fill=RED)
R['pole'] = (512, 320, 512, 128)
# Bleacher skirt: dark red velvet-like panel with gold trim, 512 x 128 at (512, 448).
d.rectangle([512, 448, 1023, 575], fill=(110, 20, 28))
d.rectangle([512, 448, 1023, 460], fill=GOLD)
grain((512, 448, 512, 128), 6)
R['skirt'] = (512, 448, 512, 128)
img.save(os.path.join(OUT, 'sirk.png'))
# Tiling pieces as their own images (UVs wrap around the tent and the ring).
img.crop((0, 0, 512, 512)).save(os.path.join(OUT, 'canvas.png'))
img.crop((512, 0, 1024, 128)).save(os.path.join(OUT, 'curb.png'))
img.crop((512, 320, 1024, 448)).save(os.path.join(OUT, 'pole.png'))
json.dump({'size': [1024, 1024], 'regions': R}, open(os.path.join(OUT, 'sirk.json'), 'w'), indent=1)

# Net: knotted diamond mesh, transparent between the cords.
N = 512
net = Image.new('RGBA', (N, N), (0, 0, 0, 0))
nd = ImageDraw.Draw(net)
step = 256
cord = (232, 220, 190, 255)
for k in range(-N, 2 * N, step):
    nd.line([(k, 0), (k + N, N)], fill=cord, width=26)
    nd.line([(k, N), (k + N, 0)], fill=cord, width=26)
for j in range(0, N + step, step // 2):
    for i in range(0, N + step, step):
        o = (step // 2) if (j // (step // 2)) % 2 else 0
        nd.ellipse([i + o - 22, j - 22, i + o + 22, j + 22], fill=(210, 196, 164, 255))
net.save(os.path.join(OUT, 'net.png'))
print('wrote sirk.png, net.png')
