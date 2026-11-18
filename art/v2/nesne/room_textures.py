"""Pictures for the family room (art/v2/nesne/final_props.py):
  python3 -P art/v2/nesne/room_textures.py <out_dir>
wallpaper.png  512 x 512, tiling: cream and dusty green stripes with a small sprig between them
palette.png    256 x 256: flat cells for the room's small things (see final_props.py CELLS) and a
               painted landscape in the top-right quarter for the picture on the back wall
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W = 512
img = Image.new('RGB', (W, W), (226, 214, 186))
d = ImageDraw.Draw(img)
for k in range(8):
    x = k * 64
    d.rectangle([x, 0, x + 21, W], fill=(150, 160, 128))
    d.rectangle([x + 23, 0, x + 25, W], fill=(176, 150, 110))
    for j in range(0, W, 64):
        cx, cy = x + 44, j + 32
        d.line([(cx, cy - 10), (cx, cy + 10)], fill=(120, 132, 100), width=2)
        d.ellipse([cx - 7, cy - 6, cx - 1, cy], fill=(150, 112, 100))
        d.ellipse([cx + 1, cy - 2, cx + 7, cy + 4], fill=(150, 112, 100))
rng = random.Random(3)
noise = Image.new('L', (W // 8, W // 8))
noise.putdata([rng.randint(0, 255) for _ in range(noise.size[0] * noise.size[1])])
noise = noise.resize((W, W), Image.BICUBIC).point(lambda p: int(p * 0.15))
img = Image.composite(Image.new('RGB', (W, W), (190, 176, 150)), img, noise)
img.filter(ImageFilter.GaussianBlur(0.5)).save(os.path.join(OUT, 'wallpaper.png'))

CELLS = [(0.42, 0.26, 0.14), (0.83, 0.6, 0.32), (0.25, 0.25, 0.27), (0.92, 0.91, 0.87), (0.55, 0.13, 0.12), (0.78, 0.6, 0.26),
         (0.2, 0.32, 0.22), (0.95, 0.85, 0.6), (0.16, 0.1, 0.06), (0.6, 0.58, 0.55), (0.3, 0.18, 0.1), (0.75, 0.74, 0.7)]
P = Image.new('RGB', (256, 256), (128, 128, 128))
pd = ImageDraw.Draw(P)
for k, c in enumerate(CELLS):
    x, y = (k % 4) * 32, (k // 4) * 32
    pd.rectangle([x, y, x + 31, y + 31], fill=tuple(int(v * 255) for v in c))
# a small painted landscape, top-right quarter (u 0.5..1, v 0.5..1 in Blender = top of the image here)
pd.rectangle([128, 0, 255, 127], fill=(150, 175, 196))
pd.polygon([(128, 80), (170, 50), (210, 75), (255, 45), (255, 127), (128, 127)], fill=(88, 110, 76))
pd.polygon([(128, 100), (255, 92), (255, 127), (128, 127)], fill=(140, 120, 70))
pd.ellipse([214, 14, 236, 36], fill=(240, 220, 160))
P.save(os.path.join(OUT, 'palette.png'))
print('textures in', OUT)
