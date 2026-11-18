"""The hatch set the player leans over in S13 (the ship's well), one GLB:

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/gemi/ambar.py -- <out.glb> [--preview dir]

Laid out in the game's frame for this spot (three.js metres): the root's origin is the player's
eye, +x right, +y up, -z ahead (toward the bulwark). Three materials: wet old deck wood (Poly Haven
old_wood_floor, darkened, low roughness), a small painted palette (iron, brass, red paint, white,
rope) and warm lantern glass. Nodes as the scene asked for (see README.md, "Hatch set").
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
OUT = A[0]
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else ''
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
lib.reset()
COLL = lib.collection('ambar')


def T(x, y, z):
    """three.js -> Blender."""
    return Vector((x, -z, y))


# ------------------------------------------------------------------ materials
WOOD = lib.pbr('ambar_wet_wood', 'old_wood_floor', 1024, 512, tint=(0.5, 0.44, 0.38), rough=0.32, metal=0.0)
CELLS = {'iron': (0.07, 0.07, 0.08), 'brass': (0.78, 0.57, 0.26), 'red': (0.52, 0.05, 0.05), 'white': (0.9, 0.89, 0.84),
         'rope': (0.52, 0.42, 0.28), 'dark': (0.03, 0.025, 0.02), 'brass_dark': (0.45, 0.32, 0.14), 'glass_rim': (0.2, 0.2, 0.2)}
_pal = bpy.data.images.new('ambar_palette', 64, 64, alpha=False)
_px = []
_names = list(CELLS)
for j in range(64):
    for i in range(64):
        k = (j // 16) * 4 + (i // 16)
        c = CELLS[_names[k]] if k < len(_names) else (0.5, 0.5, 0.5)
        _px += [c[0], c[1], c[2], 1.0]
_pal.pixels = _px
_pal.pack()
PAL = lib.new_material('ambar_paint_metal')
_b = lib._principled(PAL)
_t = PAL.node_tree.nodes.new('ShaderNodeTexImage')
_t.image = _pal
_t.interpolation = 'Closest'
PAL.node_tree.links.new(_t.outputs['Color'], _b.inputs['Base Color'])
_b.inputs['Roughness'].default_value = 0.45
_b.inputs['Metallic'].default_value = 0.35
GLASS = lib.flat('ambar_lantern_glass', (1.0, 0.78, 0.45), rough=0.2, emissive=(1.0, 0.7, 0.35))
lib._principled(GLASS).inputs['Emission Strength'].default_value = 3.0


def cell_uv(name):
    k = _names.index(name)
    return ((k % 4) * 16 + 8) / 64, ((k // 4) * 16 + 8) / 64


# ------------------------------------------------------------------ helpers (three.js coordinates in, Blender meshes out)
def bm_box(lo, hi):
    """Axis box between two three.js corners."""
    a, b = T(*lo), T(*hi)
    mn = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    mx = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=mx - mn, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(mn + mx) / 2, verts=bm.verts)
    return bm


def bm_tube(p0, p1, r0, r1=None, seg=10, caps=True):
    r1 = r0 if r1 is None else r1
    a, b = T(*p0), T(*p1)
    bm = bmesh.new()
    ln = (b - a).length
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=ln)
    bmesh.ops.translate(bm, vec=(0, 0, ln / 2), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=a, verts=bm.verts)
    return bm


def bm_torus(c, R, r, axis='Y', seg=16, rseg=6, arc=2 * math.pi):
    """A ring in three.js: axis is the three.js axis the ring turns about."""
    bm = bmesh.new()
    full = abs(arc - 2 * math.pi) < 1e-6
    n = seg if full else seg + 1
    rings = []
    for i in range(n):
        a = arc * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            rr = R + r * math.cos(b)
            p = (rr * math.cos(a), rr * math.sin(a), r * math.sin(b))      # ring in the local xy plane
            if axis == 'Y':
                p = (p[0], p[2], p[1])
            elif axis == 'X':
                p = (p[2], p[0], p[1])
            ring.append(bm.verts.new(T(c[0] + p[0], c[1] + p[1], c[2] + p[2])))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg):
            bm.faces.new((rings[i][j], rings[(i + 1) % n][j], rings[(i + 1) % n][(j + 1) % rseg], rings[i][(j + 1) % rseg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_lathe(c, profile, seg=16):
    """profile: (radius, y) points in three.js, spun about the vertical through c."""
    bm = bmesh.new()
    rings = []
    for r, y in profile:
        rings.append([bm.verts.new(T(c[0] + r * math.cos(2 * math.pi * k / seg), c[1] + y, c[2] + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def merge(bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        b.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    return out


def paint(bm, cell):
    uv = bm.loops.layers.uv.verify()
    u = cell_uv(cell)
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = u
    return bm


def obj(name, parts, parent=None, loc=None):
    """parts: list of (bmesh, material, cell or None). One object, one material slot per material."""
    mats = []
    out = bmesh.new()
    for bm, mat, cell in parts:
        if cell:
            paint(bm, cell)
        if mat not in mats:
            mats.append(mat)
        idx = mats.index(mat)
        for f in bm.faces:
            f.material_index = idx
        me = bpy.data.meshes.new('tmp')
        bm.to_mesh(me)
        bm.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    out.to_mesh(me)
    out.free()
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    if parent is not None:
        o.parent = parent
    if loc is not None:
        o.location = loc
    return o


def wood_uv(o, scale=1.0):
    lib.box_uv(o, scale)


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    COLL.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
    return e


def recentre(bm, c):
    """Move a bmesh built in the root frame so that three.js point c is its origin."""
    bmesh.ops.translate(bm, vec=-T(*c), verts=bm.verts)
    return bm


# ------------------------------------------------------------------ the hatch
root = empty('ambar')
X0, X1, Z0, Z1, TOP, W = -0.55, 0.50, -0.20, -0.74, -0.36, 0.05
walls = [bm_box((X0 - W, -0.94, Z0), (X1 + W, TOP, Z0 + W)),            # near wall (toward the player), down to the deck
         bm_box((X0 - W, -1.47, Z1 - W), (X1 + W, TOP, Z1)),            # far wall
         bm_box((X0 - W, -1.47, Z1 - W), (X0, TOP, Z0 + W)),            # left
         bm_box((X1, -1.47, Z1 - W), (X1 + W, TOP, Z0 + W))]            # right
co = obj('coaming', [(merge(walls), WOOD, None)], root)
wood_uv(co, 2.5)
# red stripe 2 cm at y -0.40 round the inside; brass strip with white notches on the far inner wall at y -0.58
stripe = [bm_box((X0, -0.41, Z0 - 0.002), (X1, -0.39, Z0)), bm_box((X0, -0.41, Z1), (X1, -0.39, Z1 + 0.002)),
          bm_box((X0, -0.41, Z1), (X0 + 0.002, -0.39, Z0)), bm_box((X1 - 0.002, -0.41, Z1), (X1, -0.39, Z0))]
brass = [bm_box((X0 + 0.02, -0.595, Z1), (X1 - 0.02, -0.565, Z1 + 0.004))]
notches = []
x = X0 + 0.03
while x < X1 - 0.02:
    notches.append(bm_box((x - 0.002, -0.588, Z1 + 0.004), (x + 0.002, -0.572, Z1 + 0.0055)))
    x += 0.045
trim = obj('coaming_paint', [(merge(stripe), PAL, 'red'), (merge(brass), PAL, 'brass'), (merge(notches), PAL, 'white')], co)

# runners: two iron rails at y -0.36 along x -0.99..0.55, two posts at the left end down to the deck
rails = [bm_box((-0.99, -0.38, -0.18), (0.55, -0.36, -0.15)), bm_box((-0.99, -0.38, -0.79), (0.55, -0.36, -0.76))]
posts = [bm_box((-0.99, -0.94, -0.185), (-0.95, -0.38, -0.145)), bm_box((-0.99, -0.94, -0.795), (-0.95, -0.38, -0.755))]
stops = [bm_box((-0.99, -0.36, -0.18), (-0.975, -0.33, -0.15)), bm_box((-0.99, -0.36, -0.79), (-0.975, -0.33, -0.76))]
obj('runners', [(merge(rails + stops), PAL, 'iron'), (merge(posts), WOOD, None)], root)

# the sliding cover: two planks wide with a gap line, two battens across, its own centre as origin
CC = (-0.29, -0.345, -0.47)
boards = [bm_box((CC[0] - 0.26, CC[1] - 0.015, CC[2] - 0.33), (CC[0] - 0.003, CC[1] + 0.015, CC[2] + 0.33)),
          bm_box((CC[0] + 0.003, CC[1] - 0.015, CC[2] - 0.33), (CC[0] + 0.26, CC[1] + 0.015, CC[2] + 0.33))]
battens = [bm_box((CC[0] - 0.25, CC[1] + 0.015, CC[2] + dz - 0.025), (CC[0] + 0.25, CC[1] + 0.035, CC[2] + dz + 0.025)) for dz in (-0.24, 0.24)]
cover_parts = [recentre(merge(boards + battens), CC)]
cover = obj('cover', [(cover_parts[0], WOOD, None)], root, T(*CC))
wood_uv(cover, 3.0)
# cover_handle: a horn cleat and a rope loop on the cover's right edge, at (0.24, 0.055, 0.09) from its centre
hc = (0.0, 0.0, 0.0)
cleat = [bm_box((-0.012, -0.04, -0.06), (0.012, -0.01, 0.06)),            # base
         bm_tube((0, -0.01, -0.07), (0, -0.01, 0.07), 0.011, 0.007, seg=8)]  # horns
loop = [bm_torus((0.035, -0.035, 0.0), 0.035, 0.008, axis='Z', seg=14, rseg=5)]
handle = obj('cover_handle', [(merge(cleat), PAL, 'iron'), (merge(loop), PAL, 'rope')], cover, T(0.24, 0.055, 0.09))

# lantern on its iron bracket: post 0.56 tall with an arm; the lantern's origin is the hook's hanging point
post_root = empty('lantern_post', T(0.78, -0.94, -0.55), root)
bracket = [bm_tube((0, 0, 0), (0, 0.56, 0), 0.014, seg=8), bm_tube((0, 0.54, 0), (-0.2, 0.54, 0), 0.011, seg=8),
           bm_tube((0, 0.42, 0), (-0.12, 0.54, 0), 0.008, seg=6), bm_box((-0.05, 0, -0.05), (0.05, 0.015, 0.05)),
           bm_torus((-0.2, 0.525, 0), 0.015, 0.004, axis='Z', seg=10, rseg=4)]
obj('lantern_post_iron', [(merge(bracket), PAL, 'iron')], post_root)


def lantern(name, parent, loc):
    e = empty(name, loc, parent)
    frame = [bm_torus((0, -0.012, 0), 0.012, 0.0035, axis='Z', seg=10, rseg=4),                 # ring on the hook
             bm_tube((0, -0.024, 0), (0, -0.06, 0), 0.004, seg=6),
             bm_lathe((0, 0, 0), [(0.0, -0.06), (0.03, -0.065), (0.065, -0.095), (0.07, -0.1), (0.0, -0.1)], 14),  # cap
             bm_lathe((0, 0, 0), [(0.0, -0.22), (0.072, -0.22), (0.072, -0.235), (0.0, -0.24)], 14)]               # base
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        frame.append(bm_tube((0.066 * math.cos(a), -0.1, 0.066 * math.sin(a)), (0.066 * math.cos(a), -0.22, 0.066 * math.sin(a)), 0.005, seg=6))
    frame.append(bm_torus((0, -0.16, 0), 0.068, 0.004, axis='Y', seg=16, rseg=4))
    glass = [bm_lathe((0, 0, 0), [(0.0, -0.1), (0.055, -0.105), (0.062, -0.16), (0.055, -0.215), (0.0, -0.22)], 14)]
    obj(f'{name}_body', [(merge(frame), PAL, 'brass_dark'), (merge(glass), GLASS, None)], e)
    return e


lantern('lantern', post_root, T(-0.2, 0.51, 0))

# ship's bell: brass, origin at the suspension on top, 0.11 tall
bell = empty('bell', T(0.62, -0.2, -0.85), root)
bb = [bm_torus((0, -0.008, 0), 0.008, 0.003, axis='Z', seg=10, rseg=4),
      bm_lathe((0, 0, 0), [(0.0, -0.016), (0.022, -0.017), (0.03, -0.03), (0.034, -0.06), (0.042, -0.09), (0.052, -0.105), (0.054, -0.11), (0.046, -0.108), (0.0, -0.1)], 18)]
clapper = [bm_tube((0, -0.02, 0), (0, -0.095, 0), 0.003, seg=6), bm_lathe((0, 0, 0), [(0.0, -0.09), (0.01, -0.095), (0.0, -0.105)], 8)]
obj('bell_brass', [(merge(bb), PAL, 'brass'), (merge(clapper), PAL, 'iron')], bell)

# float gauge: a board 0.11 x 0.46 facing the player, top 22 % red, bottom 14 % brass, ticks between; origin its middle
gauge = empty('gauge', T(-0.75, -0.62, -0.47), root)
GW, GH = 0.11, 0.46
board = [bm_box((-GW / 2, -GH / 2, -0.012), (GW / 2, GH / 2, 0.0))]
red = [bm_box((-GW / 2 + 0.004, GH / 2 - GH * 0.22, 0.0), (GW / 2 - 0.004, GH / 2 - 0.004, 0.002))]
brassband = [bm_box((-GW / 2 + 0.004, -GH / 2 + 0.004, 0.0), (GW / 2 - 0.004, -GH / 2 + GH * 0.14, 0.002))]
ticks = []
y = -GH / 2 + GH * 0.14 + 0.02
k = 0
while y < GH / 2 - GH * 0.22 - 0.01:
    w = 0.05 if k % 4 == 0 else 0.028
    ticks.append(bm_box((-GW / 2 + 0.008, y - 0.0018, 0.0), (-GW / 2 + 0.008 + w, y + 0.0018, 0.002)))
    y += 0.02
    k += 1
g = obj('gauge_board', [(merge(board), WOOD, None), (merge(red), PAL, 'red'), (merge(brassband), PAL, 'brass'), (merge(ticks), PAL, 'white')], gauge)
lib.box_uv(g, 6.0)
# pointer: a 9 cm arrow pointing left (-x), its origin at the tip, sitting just right of the board
pointer = empty('gauge_pointer', T(GW / 2 + 0.005, 0.0, 0.006), gauge)
bmp = bmesh.new()
pts = [(0, 0), (0.025, 0.014), (0.025, 0.005), (0.09, 0.005), (0.09, -0.005), (0.025, -0.005), (0.025, -0.014)]
top = [bmp.verts.new(T(x, y, 0.004)) for x, y in pts]
bot = [bmp.verts.new(T(x, y, -0.004)) for x, y in pts]
bmp.faces.new(top)
bmp.faces.new(list(reversed(bot)))
for i in range(len(pts)):
    j = (i + 1) % len(pts)
    bmp.faces.new((top[i], top[j], bot[j], bot[i]))
bmesh.ops.recalc_face_normals(bmp, faces=bmp.faces)
obj('gauge_pointer_brass', [(bmp, PAL, 'brass')], pointer)

# step lamp: a 5 cm brass oil lamp with a glowing chimney; origin at its foot
step = empty('step_lamp', T(-0.4, -0.94, -0.12), root)
sl = [bm_lathe((0, 0, 0), [(0.0, 0.0), (0.022, 0.0), (0.024, 0.006), (0.016, 0.014), (0.02, 0.022), (0.009, 0.026), (0.0, 0.026)], 12),
      bm_torus((0.027, 0.012, 0), 0.008, 0.002, axis='Z', seg=8, rseg=4)]
chim = [bm_lathe((0, 0, 0), [(0.0, 0.026), (0.008, 0.026), (0.011, 0.038), (0.007, 0.05), (0.0, 0.05)], 10)]
obj('step_lamp_brass', [(merge(sl), PAL, 'brass'), (merge(chim), GLASS, None)], step)

# bell post: an iron bracket standing on the coaming's far wall, its foot (origin) at (0.52, -0.36, -0.765),
# 0.46 tall, the arm 0.12 to -x at the top with a shackle at its end (the bell hangs there)
bpost = empty('bell_post', T(0.52, TOP, -0.765), root)
bp = [bm_box((-0.035, 0.0, -0.022), (0.035, 0.01, 0.022)),                       # foot plate on the coaming
      bm_lathe((0, 0, 0), [(0.0, 0.01), (0.02, 0.01), (0.016, 0.03), (0.012, 0.04)], 10),
      bm_tube((0, 0.03, 0), (0, 0.46, 0), 0.011, 0.009, seg=10),
      bm_tube((0, 0.448, 0), (-0.12, 0.448, 0), 0.008, seg=8),                  # the arm
      bm_tube((0, 0.36, 0), (-0.085, 0.446, 0), 0.005, seg=6),                  # brace under it
      bm_lathe((0, 0, 0), [(0.0, 0.455), (0.013, 0.455), (0.013, 0.468), (0.0, 0.472)], 10),   # cap where the feather iron rises
      bm_torus((-0.12, 0.43, 0), 0.011, 0.0035, axis='Z', seg=10, rseg=4)]      # shackle for the bell
for sx in (-0.025, 0.025):
    for sz in (-0.013, 0.013):
        bp.append(bm_lathe((sx, 0, sz), [(0.0, 0.01), (0.005, 0.01), (0.004, 0.015), (0.0, 0.016)], 6))   # bolt heads
obj('bell_post_iron', [(merge(bp), PAL, 'iron')], bpost)

# feather hook: a thin iron rising 0.23 from the post's top, turned over in a small crook (about 7 cm of iron)
# toward -x, a 6 cm cord from its end; the feather hangs at the cord's end, feather_hook_end, (0.47, 0.262, -0.765)
fhook = empty('feather_hook', T(0.52, TOP + 0.46, -0.765), root)
fh = [bm_tube((0, 0.0, 0), (0, 0.23, 0), 0.0045, seg=6)]
prev = (0.0, 0.23, 0.0)
for i in range(1, 9):
    a = math.pi * i / 8                                                           # over the top, from +x to -x
    pt = (-0.025 + 0.025 * math.cos(a), 0.23 + 0.025 * math.sin(a) - 0.008 * (i / 8) ** 2, 0.0)
    fh.append(bm_tube(prev, pt, 0.004, seg=6))
    prev = pt
end_y = 0.262 - (TOP + 0.46)                                                      # the cord's end, in the hook's frame
cord = [bm_tube((prev[0], prev[1], 0), (prev[0], end_y + 0.004, 0), 0.0022, seg=5),
        bm_lathe((prev[0], 0, 0), [(0.0, end_y - 0.002), (0.0045, end_y + 0.002), (0.004, end_y + 0.008), (0.0, end_y + 0.011)], 6)]   # knot
obj('feather_hook_iron', [(merge(fh), PAL, 'iron'), (merge(cord), PAL, 'rope')], fhook)
empty('feather_hook_end', T(prev[0], end_y, 0), fhook)

# wash port in the bulwark: a riveted iron frame round a 0.32 x 0.12 opening, centre (origin) at
# (-0.20, -0.36, -0.915), facing the player (+z); the opening is a dark plate just in front of the
# bulwark's face (hide wash_port_hole if the bulwark itself is cut open there)
wport = empty('wash_port', T(-0.20, TOP, -0.915), root)
OW, OH, FW, FD = 0.32, 0.12, 0.028, 0.014
frame = [bm_box((-OW / 2 - FW, OH / 2, 0), (OW / 2 + FW, OH / 2 + FW, FD)),          # top
         bm_box((-OW / 2 - FW, -OH / 2 - FW, 0), (OW / 2 + FW, -OH / 2, FD + 0.006)),  # sill, a little proud
         bm_box((-OW / 2 - FW, -OH / 2, 0), (-OW / 2, OH / 2, FD)),
         bm_box((OW / 2, -OH / 2, 0), (OW / 2 + FW, OH / 2, FD))]
rv = []
for k in range(7):
    x = -OW / 2 - FW / 2 + (OW + FW) * k / 6
    for y in (OH / 2 + FW / 2, -OH / 2 - FW / 2):
        b = bmesh.new()
        bmesh.ops.create_uvsphere(b, u_segments=6, v_segments=3, radius=0.0045)
        bmesh.ops.scale(b, vec=(1, 1, 0.6), verts=b.verts)
        bmesh.ops.translate(b, vec=T(x, y, FD + (0.006 if y < 0 else 0.0)), verts=b.verts)
        rv.append(b)
obj('wash_port_frame', [(merge(frame + rv), PAL, 'iron')], wport)
hole = bm_box((-OW / 2, -OH / 2, 0.001), (OW / 2, OH / 2, 0.004))
obj('wash_port_hole', [(hole, PAL, 'dark')], wport)

# ------------------------------------------------------------------ export
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
lib.write_json(os.path.join(HERE, 'stats_ambar.json'), {'triangles': t, 'draw_calls': calls, 'materials': 3, 'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS ambar', t, calls)
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    views = [('eye', (0.0, 0.0, 0.0), tuple(T(-0.1, -0.6, -0.5)), 18), ('side', tuple(T(1.6, 0.1, 0.6)), tuple(T(-0.1, -0.6, -0.5)), 30)]
    lib.render_views(views, PREVIEW, 'ambar', HDRI, size=(800, 600), samples=24, world_strength=0.25, sun_energy=0.8)
print('DONE', OUT)
