"""Adds the broadcast corner to the rendered picture: a red LIVE box and a thin lower bar.
  python3 art/v2/nesne/live_bug.py <in.png> <out.jpg>
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'fonts', 'DejaVuSansCondensed-Bold.ttf')
img = Image.open(sys.argv[1]).convert('RGB')
W, H = img.size
d = ImageDraw.Draw(img, 'RGBA')
s = W / 1024
d.rectangle([28 * s, 26 * s, 150 * s, 74 * s], fill=(192, 28, 36, 255))
d.ellipse([40 * s, 42 * s, 56 * s, 58 * s], fill=(255, 255, 255, 255))
d.text((64 * s, 30 * s), 'LIVE', font=ImageFont.truetype(FONT, int(36 * s)), fill=(255, 255, 255, 255))
d.rectangle([0, H - 64 * s, W, H - 22 * s], fill=(14, 22, 38, 210))
d.rectangle([0, H - 64 * s, 12 * s, H - 22 * s], fill=(192, 28, 36, 255))
img.save(sys.argv[2], quality=88)
