"""
Finds the sun in the rendered IBL panorama and prints the matching three.js
DirectionalLight rotation, so live geometry is lit from where the painted sky
shows the sun. Run: blender -b -P art/panorama/sun_direction.py -- public/env/ombrisa_ibl.hdr
"""
import math
import sys

import bpy

path = sys.argv[sys.argv.index("--") + 1]
image = bpy.data.images.load(path)
width, height = image.size
pixels = image.pixels[:]
best, best_index = -1.0, 0
for i in range(0, len(pixels), 4):
    luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
    if luminance > best:
        best, best_index = luminance, i // 4
px, py = best_index % width, best_index // width  # Blender rows start at the bottom
u, v = (px + 0.5) / width, (py + 0.5) / height
# Camera looks along three.js +x with three.js +z to its right (see build_far_town.py).
phi = (u - 0.5) * 2 * math.pi
theta = (v - 0.5) * math.pi
sun = (math.cos(theta) * math.cos(phi), math.sin(theta), math.cos(theta) * math.sin(phi))
light = tuple(-c for c in sun)  # the direction the light travels
# IWSDK lights shine along their local -z; rotationDeg is three.js XYZ Euler.
psi = math.asin(-light[0])
pitch = math.atan2(light[1], -light[2])
print("[sun] pixel", px, py, "luminance", round(best, 1))
print("[sun] direction to sun (three.js)", tuple(round(c, 3) for c in sun))
print("[sun] rotationDeg", [round(math.degrees(pitch), 2), round(math.degrees(psi), 2), 0])
