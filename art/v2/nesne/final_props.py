"""Props for the last scenes (S11, S16, S30-S31) and the bank (S15-S16), one GLB each:

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/nesne/final_props.py -- <prop> <out.glb> <tex_dir> [--preview dir]

prop: street_lamp | family_room | flood_glass | round_lamp. tex_dir holds wallpaper.png and palette.png from room_textures.py.
three.js metres, Y up; textures from Poly Haven (CC0): old_wood_floor, dark_paneled_wood, red_brick_03.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
PROP, OUT, TEX = A[0], A[1], A[2]
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else ''
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
lib.reset()
COLL = lib.collection(PROP)


def T(x, y, z):
    return Vector((x, -z, y))


def bm_box(lo, hi):
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


def bm_lathe(c, profile, seg=16):
    bm = bmesh.new()
    rings = [[bm.verts.new(T(c[0] + r * math.cos(2 * math.pi * k / seg), c[1] + y, c[2] + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)] for r, y in profile]
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
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


def set_uv(bm, uv):
    lay = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[lay].uv = uv
    return bm


def obj(name, parts, parent=None, loc=None, smooth=False):
    mats, out = [], bmesh.new()
    for bm, mat in parts:
        if mat not in mats:
            mats.append(mat)
        for f in bm.faces:
            f.material_index = mats.index(mat)
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
        p.use_smooth = smooth
    if parent is not None:
        o.parent = parent
    if loc is not None:
        o.location = loc
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    COLL.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
    return e


# ------------------------------------------------------------------ street lamp
def street_lamp():
    """2.7 m, 1930s cast iron: fluted base, tapering post, a scrolled arm 0.5 m to the side (+x)
    with one lantern; the lantern's glass is lamp_glass (its own material, for the light)."""
    root = empty('street_lamp')
    iron = lib.flat('lamp_cast_iron', (0.05, 0.065, 0.055), rough=0.45, metal=0.5)
    glass = lib.flat('lamp_glass_warm', (1.0, 0.86, 0.6), rough=0.15, emissive=(1.0, 0.78, 0.45))
    lib._principled(glass).inputs['Emission Strength'].default_value = 2.5
    post = [bm_lathe((0, 0, 0), [(0.0, 0.0), (0.16, 0.0), (0.16, 0.05), (0.13, 0.07), (0.12, 0.22), (0.1, 0.26), (0.085, 0.3), (0.075, 0.42),
                                 (0.08, 0.45), (0.06, 0.5), (0.05, 2.35), (0.06, 2.37), (0.06, 2.42), (0.045, 2.44), (0.03, 2.6), (0.045, 2.62), (0.0, 2.7)], 14)]
    # flutes on the base: eight thin ribs
    for k in range(8):
        a = 2 * math.pi * k / 8
        post.append(bm_box((0.118 * math.cos(a) - 0.008, 0.07, 0.118 * math.sin(a) - 0.008), (0.118 * math.cos(a) + 0.008, 0.22, 0.118 * math.sin(a) + 0.008)))
    # the arm: out 0.5 m to +x at 2.38 m, a scroll under it, the lantern's hanger at its end
    post.append(bm_tube((0.04, 2.38, 0), (0.5, 2.38, 0), 0.018, seg=8))
    sc = []
    for i in range(10):
        t0, t1 = i / 10, (i + 1) / 10
        def p(t):
            a = math.pi * 1.5 * t
            r = 0.16 * (1 - 0.6 * t)
            return (0.06 + 0.2 * t + r * math.sin(a) * 0.5, 2.36 - r * (1 - math.cos(a)) * 0.6, 0)
        sc.append(bm_tube(p(t0), p(t1), 0.011, seg=6))
    post += sc
    post.append(bm_tube((0.5, 2.38, 0), (0.5, 2.3, 0), 0.012, seg=8))
    # the lantern: a square cap and a base in iron, four corner bars
    lx, ly = 0.5, 2.06
    post.append(bm_lathe((lx, 0, 0), [(0.0, 2.3), (0.03, 2.29), (0.15, 2.22), (0.16, 2.2), (0.0, 2.2)], 4))
    post.append(bm_lathe((lx, 0, 0), [(0.0, 1.9), (0.11, 1.9), (0.13, 1.93), (0.0, 1.935)], 4))
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        post.append(bm_tube((lx + 0.125 * math.cos(a) * 0.71, 1.93, 0.125 * math.sin(a) * 0.71), (lx + 0.15 * math.cos(a) * 0.71, 2.2, 0.15 * math.sin(a) * 0.71), 0.008, seg=5))
    obj('street_lamp_iron', [(merge(post), iron)], root, smooth=True)
    g = bm_lathe((lx, 0, 0), [(0.0, 1.935), (0.12, 1.935), (0.145, 2.2), (0.0, 2.2)], 4)
    obj('lamp_glass', [(g, glass)], root)
    return root, [('front', tuple(T(1.4, 1.6, 3.0)), tuple(T(0.2, 1.4, 0)), 35)]


# ------------------------------------------------------------------ family room
CELLS = ['table_wood', 'bread', 'pot_iron', 'plate_white', 'red_cloth', 'brass', 'dark_green', 'warm', 'dark_wood', 'grey', 'frame_wood', 'shelf_items']


def cell(name):
    k = CELLS.index(name)
    return (((k % 4) * 32 + 16) / 256, 1 - ((k // 4) * 32 + 16) / 256)


def family_room():
    """A family room in a bay: inside 3.0 wide, 2.85 high, 1.7 deep; open front toward +z (the game
    puts the glass there); origin on the floor at the room's middle."""
    root = empty('family_room')
    W2, H, D2 = 1.5, 2.85, 0.85
    paper = lib.textured('room_wallpaper', os.path.join(TEX, 'wallpaper.png'), rough=0.85)
    wood = lib.pbr('room_wood', 'dark_paneled_wood', 1024, 256, rough=0.55, metal=0.0)
    floor_m = lib.pbr('room_floor', 'old_wood_floor', 1024, 256, tint=(0.8, 0.68, 0.55), rough=0.5, metal=0.0)
    brick = lib.pbr('room_brick', 'red_brick_03', 1024, 256, rough=0.85, metal=0.0)
    pal = lib.textured('room_things', os.path.join(TEX, 'palette.png'), rough=0.6)
    glass = lib.flat('room_lamp_glow', (1.0, 0.85, 0.6), rough=0.3, emissive=(1.0, 0.75, 0.42))
    lib._principled(glass).inputs['Emission Strength'].default_value = 3.0
    WAIN = 0.95
    # walls above the wainscot (wallpaper), inner faces only
    walls = [bm_box((-W2, WAIN, -D2 - 0.02), (W2, H, -D2)), bm_box((-W2 - 0.02, WAIN, -D2), (-W2, H, D2)), bm_box((W2, WAIN, -D2), (W2 + 0.02, H, D2))]
    wo = obj('room_walls', [(merge(walls), paper)], root)
    lib.box_uv(wo, 1.6)
    # wainscot, chair rail, skirting, ceiling beams and the window frame in dark panelled wood
    wn = [bm_box((-W2, 0.0, -D2 - 0.03), (W2, WAIN, -D2)), bm_box((-W2 - 0.03, 0.0, -D2), (-W2, WAIN, D2)), bm_box((W2, 0.0, -D2), (W2 + 0.03, WAIN, D2)),
          bm_box((-W2, WAIN, -D2 + 0.0), (W2, WAIN + 0.05, -D2 + 0.03)), bm_box((-W2, WAIN, -D2), (-W2 + 0.03, WAIN + 0.05, D2)), bm_box((W2 - 0.03, WAIN, -D2), (W2, WAIN + 0.05, D2)),
          bm_box((-W2, H, -D2), (W2, H + 0.03, D2))]
    for x in (-0.75, 0.0, 0.75):
        wn.append(bm_box((x - 0.06, H - 0.12, -D2), (x + 0.06, H, D2)))
    # the bay's window frame at the front: sill at 0.75, mullions
    wn += [bm_box((-W2, 0.7, D2), (W2, 0.75, D2 + 0.22)), bm_box((-W2, 2.6, D2), (W2, 2.7, D2 + 0.1)),
           bm_box((-W2, 0.75, D2), (-W2 + 0.08, 2.6, D2 + 0.1)), bm_box((W2 - 0.08, 0.75, D2), (W2, 2.6, D2 + 0.1)),
           bm_box((-0.52, 0.75, D2 + 0.04), (-0.48, 2.6, D2 + 0.08)), bm_box((0.48, 0.75, D2 + 0.04), (0.52, 2.6, D2 + 0.08)),
           bm_box((-W2, 2.0, D2 + 0.04), (W2, 2.04, D2 + 0.08))]
    obj('room_panelling', [(merge(wn), wood)], root).name
    lib.box_uv(bpy.data.objects['room_panelling'], 2.0)
    fl = [bm_box((-W2, -0.02, -D2), (W2, 0.0, D2 + 0.22))]
    fo = obj('room_floor', [(merge(fl), floor_m)], root)
    lib.box_uv(fo, 1.2)
    # outside: brick round the bay and below the sill
    br = [bm_box((-W2 - 0.25, -0.3, D2 + 0.1), (W2 + 0.25, 0.7, D2 + 0.34)), bm_box((-W2 - 0.25, 2.7, D2 + 0.1), (W2 + 0.25, 3.2, D2 + 0.34)),
          bm_box((-W2 - 0.25, 0.7, D2 + 0.1), (-W2, 2.7, D2 + 0.34)), bm_box((W2, 0.7, D2 + 0.1), (W2 + 0.25, 2.7, D2 + 0.34)),
          bm_box((-W2 - 0.35, 0.68, D2 + 0.22), (W2 + 0.35, 0.75, D2 + 0.42))]
    bo = obj('room_brick', [(merge(br), brick)], root)
    lib.box_uv(bo, 1.0)
    # the table with a cloth, bread, a pot and three plates; two chairs; shelf and picture on the back wall
    things = []
    tw = [bm_box((-0.55, 0.7, -0.3), (0.55, 0.74, 0.3))]
    for x in (-0.5, 0.5):
        for z in (-0.25, 0.25):
            tw.append(bm_box((x - 0.025, 0.0, z - 0.025), (x + 0.025, 0.7, z + 0.025)))
    for x in (-0.75, 0.75):
        tw += [bm_box((x - 0.2, 0.44, -0.2), (x + 0.2, 0.47, 0.2))]
        for dx in (-0.17, 0.17):
            for dz in (-0.17, 0.17):
                tw.append(bm_box((x + dx - 0.018, 0.0, dz - 0.018), (x + dx + 0.018, 0.44, dz + 0.018)))
        bx = x + (0.18 if x > 0 else -0.18)
        tw.append(bm_box((bx - 0.02, 0.47, -0.2), (bx + 0.02, 0.95, 0.2)))
    things.append(set_uv(merge(tw), cell('table_wood')))
    things.append(set_uv(bm_box((-0.4, 0.74, -0.31), (0.4, 0.745, 0.31)), cell('red_cloth')))
    things.append(set_uv(bm_lathe((-0.05, 0, 0.05), [(0.0, 0.745), (0.14, 0.745), (0.14, 0.79), (0.0, 0.79)], 10), cell('red_cloth')))
    things.append(set_uv(bm_lathe((0.0, 0, -0.08), [(0.0, 0.745), (0.1, 0.745), (0.11, 0.84), (0.1, 0.86), (0.0, 0.86)], 14), cell('pot_iron')))
    loaf = bm_lathe((-0.28, 0, -0.1), [(0.0, 0.745), (0.07, 0.75), (0.08, 0.78), (0.06, 0.81), (0.0, 0.82)], 10)
    bmesh.ops.scale(loaf, vec=(1.8, 1.0, 1.0), verts=loaf.verts)
    bmesh.ops.translate(loaf, vec=(0.22, 0, 0), verts=loaf.verts)
    things.append(set_uv(loaf, cell('bread')))
    for (x, z) in ((-0.35, 0.18), (0.0, 0.2), (0.35, 0.18)):
        things.append(set_uv(bm_lathe((x, 0, z), [(0.0, 0.745), (0.06, 0.745), (0.1, 0.758), (0.105, 0.762), (0.0, 0.752)], 14), cell('plate_white')))
    shelf = [bm_box((-1.0, 1.55, -D2), (-0.2, 1.58, -D2 + 0.2)), bm_box((-0.95, 1.4, -D2), (-0.92, 1.55, -D2 + 0.18)), bm_box((-0.28, 1.4, -D2), (-0.25, 1.55, -D2 + 0.18))]
    things.append(set_uv(merge(shelf), cell('dark_wood')))
    items = []
    for i, x in enumerate((-0.9, -0.75, -0.62, -0.5, -0.38)):
        items.append(bm_box((x, 1.58, -D2 + 0.04), (x + 0.08, 1.58 + 0.12 + 0.04 * (i % 2), -D2 + 0.12)))
    things.append(set_uv(merge(items[:3]), cell('shelf_items')))
    things.append(set_uv(merge(items[3:]), cell('brass')))
    frame = [bm_box((0.25, 1.35, -D2), (0.95, 1.4, -D2 + 0.04)), bm_box((0.25, 1.85, -D2), (0.95, 1.9, -D2 + 0.04)),
             bm_box((0.25, 1.4, -D2), (0.3, 1.85, -D2 + 0.04)), bm_box((0.9, 1.4, -D2), (0.95, 1.85, -D2 + 0.04))]
    things.append(set_uv(merge(frame), cell('frame_wood')))
    pic = bmesh.new()
    lay = pic.loops.layers.uv.new()
    vs = [pic.verts.new(T(x, y, -D2 + 0.02)) for x, y in ((0.3, 1.4), (0.9, 1.4), (0.9, 1.85), (0.3, 1.85))]
    f = pic.faces.new(vs)
    for l, uv in zip(f.loops, ((0.5, 0.5), (1.0, 0.5), (1.0, 1.0), (0.5, 1.0))):
        l[lay].uv = uv
    things.append(pic)
    # the pendant lamp: a cord, a brass cap, a shade; the bulb is its own glowing piece
    things.append(set_uv(merge([bm_tube((0, H, 0), (0, 2.12, 0), 0.006, seg=6), bm_lathe((0, 0, 0), [(0.0, 2.12), (0.03, 2.11), (0.2, 1.98), (0.21, 1.96), (0.19, 1.96), (0.03, 2.08), (0.0, 2.09)], 16)]), cell('dark_green')))
    obj('room_things', [(merge(things), pal)], root, smooth=False)
    bulb = bm_lathe((0, 0, 0), [(0.0, 2.04), (0.04, 2.02), (0.045, 1.99), (0.03, 1.96), (0.0, 1.955)], 12)
    obj('room_lamp_bulb', [(bulb, glass)], root, smooth=True)
    empty('pendant_bulb', T(0, 1.99, 0), root)
    empty('room_glass_centre', T(0, (0.75 + 2.6) / 2, D2 + 0.06), root)
    return root, [('window', tuple(T(0.3, 1.6, 3.2)), tuple(T(0, 1.2, 0)), 30), ('inside', tuple(T(1.2, 1.7, 0.8)), tuple(T(-0.3, 1.0, -0.6)), 22)]


# ------------------------------------------------------------------ flood glass (the bank, S15-S16)
def flood_glass():
    """A brass-footed glass tube 0.30 m tall and 4.4 cm across, a red enamel cap on top, brass at its
    foot, a brass back stay with a scale (on the -z side, so the scale reads from +z through the
    glass). Origin at the tube's bottom (inside). flood_glass_water: a unit column 1 m tall, 1.8 cm
    in radius, origin at its bottom; scale its y for the water's height (0.30 fills the tube)."""
    root = empty('flood_glass')
    brass = lib.flat('flood_brass', (0.78, 0.57, 0.26), rough=0.32, metal=0.6)
    enamel = lib.flat('flood_red_enamel', (0.55, 0.04, 0.04), rough=0.18)
    white = lib.flat('flood_scale_white', (0.92, 0.9, 0.84), rough=0.5)
    glass = lib.flat('flood_glass_glass', (0.86, 0.93, 0.95), rough=0.04, alpha=0.2)
    water = lib.flat('flood_water', (0.06, 0.2, 0.22), rough=0.08)
    R, H = 0.022, 0.30
    foot = [bm_lathe((0, 0, 0), [(0.0, -0.05), (0.05, -0.05), (0.052, -0.045), (0.046, -0.04), (0.034, -0.034), (0.027, -0.022),
                                  (0.024, -0.012), (0.028, -0.008), (0.026, 0.016), (0.0, 0.016)], 20)]
    collar = [bm_lathe((0, 0, 0), [(0.0, H - 0.014), (0.026, H - 0.014), (0.026, H + 0.004), (0.0, H + 0.004)], 20)]
    cap = [bm_lathe((0, 0, 0), [(0.0, H + 0.004), (0.027, H + 0.004), (0.027, H + 0.012), (0.022, H + 0.026), (0.012, H + 0.034), (0.0, H + 0.036)], 20)]
    knob = [bm_lathe((0, 0, 0), [(0.0, H + 0.035), (0.006, H + 0.036), (0.007, H + 0.042), (0.004, H + 0.048), (0.0, H + 0.049)], 10)]
    # back stay: a flat brass strip from the foot to the collar behind the tube, the scale painted on it
    stay = [bm_box((-0.008, 0.0, -R - 0.012), (0.008, H, -R - 0.009)), bm_box((-0.004, -0.008, -R - 0.012), (0.004, 0.0, -0.01)),
            bm_box((-0.004, H - 0.01, -R - 0.012), (0.004, H, -0.01))]
    ticks = []
    for k in range(1, 15):
        y = H * k / 15
        w = 0.012 if k % 5 == 0 else 0.007
        ticks.append(bm_box((-w / 2, y - 0.0012, -R - 0.009), (w / 2, y + 0.0012, -R - 0.0085)))
    obj('flood_glass_fittings', [(merge(foot + collar + knob + stay), brass), (merge(cap), enamel), (merge(ticks), white)], root, smooth=True)
    tube = bm_tube((0, 0.0, 0), (0, H - 0.002, 0), R, seg=22, caps=False)
    obj('flood_glass_tube', [(tube, glass)], root, smooth=True)
    w = bm_tube((0, 0.0, 0), (0, 1.0, 0), 0.018, seg=18, caps=True)
    obj('flood_glass_water', [(w, water)], root, smooth=True)
    return root, [('front', tuple(T(0.35, 0.3, 0.75)), tuple(T(0, 0.14, 0)), 30)]


# ------------------------------------------------------------------ round lamp (the bank, on the sandbags)
def round_lamp():
    """A small cast-iron lamp post 1.1 m tall with a 17 cm frosted glass globe on top. Origin at the
    post's foot. round_lamp_glass is the globe (its own material, lit by the game)."""
    root = empty('round_lamp')
    iron = lib.flat('lamp_cast_iron', (0.05, 0.065, 0.055), rough=0.45, metal=0.5)
    frost = lib.flat('round_lamp_frost', (0.9, 0.9, 0.86), rough=0.45)
    post = [bm_lathe((0, 0, 0), [(0.0, 0.0), (0.085, 0.0), (0.085, 0.018), (0.07, 0.03), (0.062, 0.07), (0.05, 0.1), (0.038, 0.14),
                                 (0.04, 0.16), (0.03, 0.18), (0.026, 0.9), (0.032, 0.92), (0.032, 0.95), (0.024, 0.97), (0.022, 1.02),
                                 (0.03, 1.04), (0.05, 1.07), (0.058, 1.09), (0.056, 1.1), (0.04, 1.1), (0.0, 1.095)], 14)]
    for k in range(8):
        a = 2 * math.pi * k / 8
        post.append(bm_box((0.058 * math.cos(a) - 0.006, 0.03, 0.058 * math.sin(a) - 0.006), (0.058 * math.cos(a) + 0.006, 0.1, 0.058 * math.sin(a) + 0.006)))
    # four small claws round the globe's neck
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        post.append(bm_tube((0.052 * math.cos(a), 1.095, 0.052 * math.sin(a)), (0.062 * math.cos(a), 1.13, 0.062 * math.sin(a)), 0.004, seg=5))
    obj('round_lamp_iron', [(merge(post), iron)], root, smooth=True)
    g = bmesh.new()
    bmesh.ops.create_uvsphere(g, u_segments=24, v_segments=14, radius=0.085)
    bmesh.ops.delete(g, geom=[v for v in g.verts if v.co.z < -0.078], context='VERTS')     # open neck, hidden in the cup
    bmesh.ops.translate(g, vec=T(0, 1.1 + 0.085 - 0.012, 0), verts=g.verts)
    obj('round_lamp_glass', [(g, frost)], root, smooth=True)
    return root, [('front', tuple(T(0.9, 1.0, 1.9)), tuple(T(0, 0.65, 0)), 35)]


top, views = {'street_lamp': street_lamp, 'family_room': family_room, 'flood_glass': flood_glass, 'round_lamp': round_lamp}[PROP]()
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
lib.write_json(os.path.join(HERE, 'stats', f'{PROP}.json'), {'triangles': t, 'draw_calls': calls, 'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS', PROP, t, calls)
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    if PROP == 'family_room':
        L = bpy.data.objects.new('room_light', bpy.data.lights.new('room_light', 'POINT'))
        L.data.energy = 120
        L.location = T(0, 1.95, 0)
        bpy.context.scene.collection.objects.link(L)
    lib.render_views(views, PREVIEW, PROP, HDRI, size=(800, 600), samples=24, world_strength=0.6 if PROP == 'family_room' else 1.0)
print('DONE', OUT)
