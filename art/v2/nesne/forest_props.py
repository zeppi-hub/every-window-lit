"""Four props the hands touch in the forest (S09) and the cold fire (S10), one GLB each:

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/nesne/forest_props.py -- <prop> <out.glb> [--preview dir]

prop:
  burlap_sack        the wet sack hung doubled over a forked stick: fork (origin on the ground),
                     fork_top (where the sack hangs), sack (origin at the top of the fold, where the
                     hand takes it). The burlap's weave is drawn here (colour and normal map) so it
                     reads as cloth from 0.6 m by lantern light.
  pull_stake         the brass stake on the street post's arm: bracket (cast-iron guide and clamp,
                     origin where the stake's foot rests), stake (origin at the middle of its 8 cm
                     ring; it comes 0.2 m up and stays in the guide).
  hurricane_lantern  a storm lantern 0.3 m tall: the glass is its own node and material, `glass`;
                     origin at the base; bail_top is where it hangs.
  gold_brick_wall    a 1 x 1 x 0.25 m piece of an old gold brick wall that tiles every way; origin at
                     the middle of its foot.

three.js metres, Y up. Poly Haven (CC0): bark_brown_02 for the stick, the normal map of red_brick_03
for the bricks (their colour and metal are drawn from its brick/mortar layout here).
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
PROP, OUT = A[0], A[1]
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


def bm_torus(c, R, r, axis='Z', seg=16, rseg=6, arc=2 * math.pi, start=0.0):
    """A ring (or an arc of one) in three.js; axis is the three.js axis it turns about."""
    bm = bmesh.new()
    full = abs(arc - 2 * math.pi) < 1e-6
    n = seg if full else seg + 1
    rings = []
    for i in range(n):
        a = start + arc * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            rr = R + r * math.cos(b)
            p = (rr * math.cos(a), rr * math.sin(a), r * math.sin(b))
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


def merge(bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        b.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    return out


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
    e.empty_display_size = 0.05
    COLL.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
    return e


def image(name, arr, non_color=False):
    """A packed Blender image from an (h, w, 3) array in 0..1, row 0 at the bottom."""
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(arr, 0, 1)
    img.pixels[:] = px.ravel()
    img.pack()
    return img


def load(path, size):
    img = bpy.data.images.load(path)
    if max(img.size) > size:
        img.scale(size, size)
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3].astype(np.float64)


def material(name, colour, normal=None, orm=None, rough=0.6, metal=0.0, normal_strength=1.0, double=False):
    m = lib.new_material(name)
    nt = m.node_tree
    b = lib._principled(m)
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = colour
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if normal is not None:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if orm is not None:
        to = nt.nodes.new('ShaderNodeTexImage')
        to.image = orm
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(to.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    else:
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
    m.use_backface_culling = not double
    return m


def periodic_blur(a, r):
    out = a.copy()
    for _ in range(2):
        acc = np.zeros_like(out)
        for d in range(-r, r + 1):
            acc += np.roll(out, d, 0)
        out = acc / (2 * r + 1)
        acc = np.zeros_like(out)
        for d in range(-r, r + 1):
            acc += np.roll(out, d, 1)
        out = acc / (2 * r + 1)
    return out


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], 2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


# ------------------------------------------------------------------ burlap
BURLAP_TILE = 0.128          # metres of cloth per picture


def burlap_maps(n=512, P=8, seed=3):
    """A tiling burlap weave, wet and dark: coarse warp and weft (one thread every 2 mm), each
    thread its own width and shade with thick slubs, the threads going over and under, fuzz."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    k = n // P
    kx, ky = (x // P).astype(int), (y // P).astype(int)
    fx, fy = x / P - kx, y / P - ky
    slub = lambda: periodic_blur(rng.random((1, n)) * 2 - 1, 6)[0] * 1.6       # along one thread
    sl_w = np.stack([slub() for _ in range(k)])                                 # warp slubs (along y)
    sl_f = np.stack([slub() for _ in range(k)])                                 # weft slubs (along x)
    ww = 0.58 + 0.22 * rng.random(k)
    wf = 0.58 + 0.22 * rng.random(k)
    hw = np.clip(ww[kx] / 2 * (1 + 0.35 * sl_w[kx, y.astype(int)]), 0.18, 0.49)
    hf = np.clip(wf[ky] / 2 * (1 + 0.35 * sl_f[ky, x.astype(int)]), 0.18, 0.49)
    warp = np.sqrt(np.clip(1 - ((fx - 0.5) / hw) ** 2, 0, 1))
    weft = np.sqrt(np.clip(1 - ((fy - 0.5) / hf) ** 2, 0, 1))
    over = (kx + ky) % 2 == 0                                                   # warp over weft here
    arch_w = 0.7 + 0.3 * np.cos(math.pi * (fy - 0.5) * 1.6)                   # a thread rises over a crossing
    arch_f = 0.7 + 0.3 * np.cos(math.pi * (fx - 0.5) * 1.6)
    hwarp = warp * np.where(over, arch_w, 0.55 * arch_w)
    hweft = weft * np.where(over, 0.55 * arch_f, arch_f)
    h = np.maximum(hwarp, hweft)
    on_warp = hwarp >= hweft
    fuzz = periodic_blur(rng.random((n, n)), 1) - 0.5
    h = np.clip(h + fuzz * 0.18, 0, 1.2)
    # colour: each thread its own shade of wet jute; the gaps between threads dark
    base = np.array([0.30, 0.225, 0.14])
    shade_w = 0.82 + 0.3 * rng.random(k)
    shade_f = 0.78 + 0.3 * rng.random(k)
    shade = np.where(on_warp, shade_w[kx], shade_f[ky]) * (1 + 0.12 * np.where(on_warp, sl_w[kx, y.astype(int)], sl_f[ky, x.astype(int)]))
    blotch = periodic_blur(rng.random((n, n)), 24)                              # wetter patches
    blotch = (blotch - blotch.mean()) / (blotch.std() + 1e-6)
    wet = np.clip(0.88 - 0.1 * blotch, 0.65, 1.05)
    lit = 0.55 + 0.6 * np.clip(h, 0, 1)
    col = base[None, None, :] * (shade * lit * wet)[:, :, None]
    gap = np.clip(1 - h * 3, 0, 1)
    col = col * (1 - gap[:, :, None]) + np.array([0.05, 0.035, 0.02])[None, None, :] * gap[:, :, None]
    nrm = normal_from_height(h, 2.2)
    # wet sheen on the thread tops, rough in the gaps
    rough = np.clip(0.62 - 0.18 * h + 0.25 * gap, 0.35, 0.95)
    orm = np.stack([np.ones_like(h), rough, np.zeros_like(h)], 2)
    return col, nrm, orm


def burlap_sack():
    root = empty('burlap_sack')
    bark = lib.pbr('fork_bark', 'bark_brown_02', 512, 256, tint=(0.6, 0.55, 0.5))
    col, nrm, orm = burlap_maps()
    burlap = material('wet_burlap', image('burlap_col', col), image('burlap_nor', nrm, True), image('burlap_orm', orm, True), double=True)
    TOP = 0.80                      # fork_top: the middle of the fold's top
    R = 0.022                       # the fold's radius round the stick
    # the forked stick: the stem driven into the ground, a crotch at 0.77, one tine on up and leaning,
    # the other nearly level to the right, through the sack's fold
    stem = []
    pts = [(-0.200, -0.07, 0.0), (-0.196, 0.15, 0.004), (-0.203, 0.40, 0.0), (-0.199, 0.62, -0.004), (-0.204, 0.765, 0.0)]
    rad = [0.024, 0.022, 0.02, 0.018, 0.017]
    for i in range(len(pts) - 1):
        stem.append(bm_tube(pts[i], pts[i + 1], rad[i], rad[i + 1], seg=9, caps=(i == 0)))
    stem.append(bm_tube((-0.204, 0.765, 0.0), (-0.222, 0.86, 0.012), 0.016, 0.012, seg=8, caps=False))
    stem.append(bm_tube((-0.222, 0.86, 0.012), (-0.232, 0.93, 0.02), 0.012, 0.006, seg=8))
    stem.append(bm_tube((-0.204, 0.765, 0.0), (-0.12, TOP - R + 0.002, 0.0), 0.015, 0.013, seg=8, caps=False))
    stem.append(bm_tube((-0.12, TOP - R + 0.002, 0.0), (0.215, TOP - R + 0.012, 0.0), 0.013, 0.008, seg=8))
    stem.append(bm_tube((-0.199, 0.47, 0.0), (-0.165, 0.5, 0.03), 0.009, 0.007, seg=6))        # a cut side twig
    stem.append(bm_lathe((-0.2, 0, 0), [(0.0, -0.005), (0.06, -0.005), (0.075, 0.0), (0.05, 0.012), (0.026, 0.02), (0.0, 0.02)], 9))  # earth heaped round it
    fork = obj('fork', [(merge(stem[:-1]), bark), (stem[-1], lib.flat('fork_earth', (0.09, 0.07, 0.05), rough=0.95))], root, smooth=True)
    lib.box_uv(fork, 6.0)
    empty('fork_top', T(0, TOP, 0), root)
    # the sack: one sheet doubled over the tine, the front half 0.42 down, the back 0.32, soft pleats
    # deepening toward the hems, the halves splaying a little apart, the hems uneven
    W, DF, DB = 0.30, 0.42, 0.32
    NU = 16
    path = []                                  # (y, z, along) in the sack's frame, origin at the fold's top
    nf, na, nb = 26, 8, 20
    for i in range(nf + 1):
        y = -DF + (DF - R) * i / nf
        path.append((y, R, 'f', (y + R) / -(DF - R) if DF > R else 0))
    for i in range(1, na):
        th = math.pi * i / na
        path.append((-R + R * math.sin(th), R * math.cos(th), 'a', 0.0))
    for i in range(nb + 1):
        y = -R - (DB - R) * i / nb
        path.append((y, -R, 'b', (-R - y) / (DB - R)))
    rng = np.random.default_rng(11)
    hem_f = periodic_blur(rng.random((1, NU + 1)) - 0.5, 1)[0] * 0.03
    hem_b = periodic_blur(rng.random((1, NU + 1)) - 0.5, 1)[0] * 0.03
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    grid = []
    along = 0.0
    prev = None
    for (y, z, part, t) in path:
        if prev is not None:
            along += math.hypot(y - prev[0], z - prev[1])
        prev = (y, z)
        row = []
        for j in range(NU + 1):
            u = j / NU
            x = (u - 0.5) * W
            tt = max(0.0, t) ** 1.15
            if part == 'f':
                xx = x * (1 - 0.07 * tt)
                zz = z + 0.035 * tt + (0.006 + 0.016 * tt) * math.sin(2 * math.pi * x / 0.105 + 0.7) + 0.006 * tt * math.sin(2 * math.pi * x / 0.043 + 1.9)
                yy = y + hem_f[j] * tt ** 3 - 0.012 * tt * math.cos(2 * math.pi * x / 0.105 + 0.7)
            elif part == 'b':
                xx = x * (1 - 0.05 * tt)
                zz = z - 0.025 * tt - (0.005 + 0.013 * tt) * math.sin(2 * math.pi * x / 0.12 + 2.3)
                yy = y + hem_b[j] * tt ** 3 - 0.01 * tt * math.cos(2 * math.pi * x / 0.12 + 2.3)
            else:
                xx, yy, zz = x, y, z
            row.append((bm.verts.new(T(xx, yy, zz)), u * W / BURLAP_TILE, along / BURLAP_TILE))
        grid.append(row)
    for i in range(len(grid) - 1):
        for j in range(NU):
            a, b, c, d = grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]
            f = bm.faces.new((a[0], b[0], c[0], d[0]))
            for loop, src in zip(f.loops, (a, b, c, d)):
                loop[uvl].uv = (src[1], src[2])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # face the front half's outside toward +z (the player)
    sack = obj('sack', [(bm, burlap)], root, T(0, TOP, 0), smooth=True)
    sack.data.uv_layers[0].name = 'UVMap'
    return root, [('front', tuple(T(0.25, 0.95, 0.75)), tuple(T(0, 0.62, 0)), 30), ('near', tuple(T(0.12, 0.78, 0.42)), tuple(T(0, 0.62, 0)), 30)]


# ------------------------------------------------------------------ pull stake
def pull_stake():
    root = empty('pull_stake')
    iron = lib.flat('lamp_cast_iron', (0.05, 0.065, 0.055), rough=0.45, metal=0.5)        # as street_lamp.glb
    brass = lib.flat('stake_brass', (0.83, 0.62, 0.28), rough=0.26, metal=0.6)
    # the guide: a cast-iron sleeve the stake slides in, its foot (origin) where the stake rests, the
    # bore open at the top; a clamp to +z that takes the post's arm, with two bolts
    REST = 0.26                                  # the ring's middle above the origin at rest
    sleeve = [bm_lathe((0, 0, 0), [(0.0, -0.03), (0.022, -0.03), (0.03, -0.022), (0.03, -0.012), (0.024, -0.006), (0.021, 0.02),
                                    (0.02, 0.17), (0.026, 0.18), (0.031, 0.192), (0.031, 0.205), (0.0125, 0.205), (0.0125, 0.16)], 14)]
    for k in range(3):                           # cast ribs down the sleeve
        a = math.pi / 2 + (k - 1) * 0.9
        sleeve.append(bm_box((0.019 * math.cos(a) - 0.003, 0.02, 0.019 * math.sin(a) - 0.003), (0.019 * math.cos(a) + 0.003, 0.17, 0.019 * math.sin(a) + 0.003)))
    clamp = [bm_box((-0.008, 0.085, 0.015), (0.008, 0.11, 0.072)),                        # web from the sleeve
             bm_tube((0, 0.0975, 0.03), (0, 0.0975, 0.072), 0.016, 0.012, seg=10),          # its round boss
             bm_box((-0.026, 0.072, 0.072), (0.026, 0.124, 0.082)),                         # front jaw
             bm_box((-0.026, 0.072, 0.128), (0.026, 0.124, 0.138)),                         # back jaw (the arm passes between)
             bm_box((-0.026, 0.118, 0.072), (0.026, 0.124, 0.138))]                         # bridge over the arm
    for sx in (-0.019, 0.019):
        clamp.append(bm_tube((sx, 0.08, 0.066), (sx, 0.08, 0.144), 0.0032, seg=6))      # bolts through both jaws
    nuts = []
    for sx in (-0.019, 0.019):
        for z0, z1 in ((0.064, 0.072), (0.138, 0.146)):
            nuts.append(bm_tube((sx, 0.08, z0), (sx, 0.08, z1), 0.0062, seg=6))
    bracket = obj('bracket', [(merge(sleeve + clamp + nuts), iron)], root, smooth=False)
    # the stake: an 8 cm ring (its middle the origin), a turned shoulder, the shaft to its foot 0.26 below
    stake_e = empty('stake', T(0, REST, 0), root)
    ring = [bm_torus((0, 0, 0), 0.033, 0.007, axis='Z', seg=24, rseg=8)]
    body = [bm_lathe((0, 0, 0), [(0.0, -0.033), (0.006, -0.034), (0.009, -0.04), (0.015, -0.046), (0.016, -0.054), (0.012, -0.06),
                                  (0.011, -0.07), (0.011, -0.25), (0.008, -0.258), (0.0, -0.26)], 12)]
    obj('stake_brass', [(merge(ring + body), brass)], stake_e, smooth=True)
    return root, [('front', tuple(T(0.3, 0.35, 0.45)), tuple(T(0, 0.15, 0.03)), 30)]


# ------------------------------------------------------------------ hurricane lantern
def hurricane_lantern():
    root = empty('hurricane_lantern')
    paint = lib.flat('lantern_paint', (0.07, 0.12, 0.08), rough=0.5, metal=0.35)
    brass = lib.flat('lantern_brass', (0.72, 0.52, 0.24), rough=0.35, metal=0.6)
    glass = lib.flat('glass', (0.82, 0.8, 0.72), rough=0.08, alpha=0.5)
    font = [bm_lathe((0, 0, 0), [(0.0, 0.0), (0.066, 0.0), (0.07, 0.004), (0.07, 0.01), (0.074, 0.018), (0.075, 0.034), (0.07, 0.046),
                                  (0.056, 0.054), (0.05, 0.056), (0.0, 0.058)], 14)]
    # air tubes up the sides from the font to the top, turning in under the cap
    tubes = []
    for s in (-1, 1):
        tubes.append(bm_tube((s * 0.072, 0.03, 0), (s * 0.074, 0.2, 0), 0.0065, seg=6))
        tubes.append(bm_tube((s * 0.074, 0.2, 0), (s * 0.06, 0.222, 0), 0.0065, seg=6))
        tubes.append(bm_tube((s * 0.06, 0.222, 0), (s * 0.04, 0.228, 0), 0.0065, seg=6))
    # globe seat, wire guard, the top and its chimney with vents, the bail
    seat = [bm_lathe((0, 0, 0), [(0.0, 0.058), (0.04, 0.058), (0.042, 0.066), (0.036, 0.07), (0.0, 0.07)], 12)]
    guard = [bm_torus((0, 0.125, 0), 0.06, 0.0018, axis='Y', seg=16, rseg=3)]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        prev = None
        for i in range(5):
            yy = 0.07 + 0.115 * i / 4
            rr = 0.046 + 0.015 * math.sin(math.pi * i / 4)
            p = (rr * math.cos(a), yy, rr * math.sin(a))
            if prev:
                guard.append(bm_tube(prev, p, 0.0018, seg=3, caps=False))
            prev = p
    top = [bm_lathe((0, 0, 0), [(0.0, 0.186), (0.04, 0.186), (0.05, 0.194), (0.056, 0.2), (0.05, 0.21), (0.036, 0.226), (0.026, 0.232),
                                 (0.022, 0.248), (0.03, 0.252), (0.03, 0.257), (0.018, 0.266), (0.0, 0.268)], 12)]
    for k in range(8):
        a = 2 * math.pi * k / 8
        top.append(bm_box((0.0235 * math.cos(a) - 0.003, 0.236, 0.0235 * math.sin(a) - 0.003), (0.0235 * math.cos(a) + 0.003, 0.246, 0.0235 * math.sin(a) + 0.003)))
    bail = [bm_torus((0, 0.205, 0), 0.08, 0.0022, axis='Z', seg=14, rseg=4, arc=math.pi, start=0.0)]
    for s in (-1, 1):
        bail.append(bm_torus((s * 0.08, 0.205, 0), 0.006, 0.0018, axis='X', seg=8, rseg=4))      # eyes on the tubes
    burner = [bm_lathe((0, 0, 0), [(0.0, 0.07), (0.018, 0.07), (0.02, 0.078), (0.014, 0.086), (0.008, 0.094), (0.0, 0.095)], 10),
              bm_box((-0.006, 0.093, -0.0012), (0.006, 0.101, 0.0012)),                         # the wick
              bm_tube((0.022, 0.072, 0.0), (0.045, 0.072, 0.0), 0.0025, seg=5),                 # wick winder
              bm_tube((0.045, 0.066, 0.0), (0.045, 0.078, 0.0), 0.005, seg=8)]
    obj('lantern_body', [(merge(font + tubes + seat + top + bail), paint), (merge(guard + burner), brass)], root, smooth=True)
    g = bm_lathe((0, 0, 0), [(0.034, 0.068), (0.046, 0.086), (0.054, 0.112), (0.055, 0.13), (0.05, 0.158), (0.04, 0.18), (0.036, 0.188)], 14)
    obj('glass', [(g, glass)], root, smooth=True)
    empty('bail_top', T(0, 0.285, 0), root)
    return root, [('front', tuple(T(0.35, 0.3, 0.6)), tuple(T(0, 0.14, 0)), 30)]


# ------------------------------------------------------------------ gold brick wall
def gold_brick_wall():
    """1 x 1 m faces, 0.25 thick; every face maps whole repeats of the picture, so pieces stacked and
    set side by side join without a seam."""
    root = empty('gold_brick_wall')
    d = os.path.join(lib.CACHE, 'tex', 'red_brick_03')
    src = load(os.path.join(d, 'diff.jpg'), 1024)
    r, g, b = src[:, :, 0], src[:, :, 1], src[:, :, 2]
    mx, mn = src.max(2), src.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    brick = np.clip((sat - 0.18) / 0.22, 0, 1)                    # red brick vs grey mortar
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    ln = (lum - lum[brick > 0.5].mean()) / (lum[brick > 0.5].std() + 1e-6)
    gold_hi, gold_lo = np.array([0.95, 0.74, 0.34]), np.array([0.52, 0.34, 0.1])
    k = np.clip(0.55 + 0.22 * ln, 0, 1)[:, :, None]
    gold = gold_lo * (1 - k) + gold_hi * k
    mortar = np.array([0.2, 0.18, 0.15])[None, None, :] * (0.7 + 0.6 * np.clip(lum / max(lum.mean(), 1e-3), 0, 1.6)[:, :, None] * 0.5)
    col = gold * brick[:, :, None] + mortar * (1 - brick[:, :, None])
    # worn: the old gold dull and grimy where the brick is dark in the photo, bright where rubbed
    rough = np.clip(0.42 - 0.12 * ln, 0.22, 0.7) * brick + 0.92 * (1 - brick)
    metal = 0.6 * brick
    orm = np.stack([np.ones_like(rough), rough, metal], 2)
    nor = load(os.path.join(d, 'nor.jpg'), 1024)
    mat = material('gold_brick', image('gold_brick_col', col), image('gold_brick_nor', nor, True), image('gold_brick_orm', orm, True), normal_strength=1.2)
    for im in ('gold_brick_col', 'gold_brick_nor', 'gold_brick_orm'):
        bpy.data.images[im].scale(512, 512)
        bpy.data.images[im].pack()
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    X, Y, Z = 0.5, 1.0, 0.125
    V = lambda x, y, z: bm.verts.new(T(x, y, z))
    c = {(sx, sy, sz): V(sx * X, sy * Y, sz * Z) for sx in (-1, 1) for sy in (0, 1) for sz in (-1, 1)}

    def face(keys, uvs):
        f = bm.faces.new([c[k] for k in keys])
        for loop, uv in zip(f.loops, uvs):
            loop[uvl].uv = uv
    face([(-1, 0, 1), (1, 0, 1), (1, 1, 1), (-1, 1, 1)], [(0, 0), (1, 0), (1, 1), (0, 1)])            # front (+z)
    face([(1, 0, -1), (-1, 0, -1), (-1, 1, -1), (1, 1, -1)], [(0, 0), (1, 0), (1, 1), (0, 1)])        # back
    face([(1, 0, 1), (1, 0, -1), (1, 1, -1), (1, 1, 1)], [(0, 0), (0.25, 0), (0.25, 1), (0, 1)])      # right end
    face([(-1, 0, -1), (-1, 0, 1), (-1, 1, 1), (-1, 1, -1)], [(0, 0), (0.25, 0), (0.25, 1), (0, 1)])  # left end
    face([(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)], [(0, 0), (1, 0), (1, 0.25), (0, 0.25)])    # top
    face([(-1, 0, -1), (1, 0, -1), (1, 0, 1), (-1, 0, 1)], [(0, 0), (1, 0), (1, 0.25), (0, 0.25)])    # foot
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj('gold_brick_wall_piece', [(bm, mat)], root)
    o.data.uv_layers[0].name = 'UVMap'
    return root, [('front', tuple(T(1.4, 1.1, 2.2)), tuple(T(0, 0.5, 0)), 35)]


top, views = {'burlap_sack': burlap_sack, 'pull_stake': pull_stake, 'hurricane_lantern': hurricane_lantern,
              'gold_brick_wall': gold_brick_wall}[PROP]()
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
lib.write_json(os.path.join(HERE, 'stats', f'{PROP}.json'), {'triangles': t, 'draw_calls': calls, 'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS', PROP, t, calls)
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    if PROP == 'gold_brick_wall':
        # three pieces side by side and two high in the preview, to see the seams
        for i, (dx, dy) in enumerate(((1, 0), (-1, 0), (0, 1), (1, 1), (-1, 1))):
            for o in [o for o in COLL.objects if o.type == 'MESH'][:1]:
                cp = o.copy()
                cp.parent = None
                cp.location = T(dx, dy, 0)
                bpy.context.scene.collection.objects.link(cp)
        views = [('front', tuple(T(1.8, 1.4, 4.2)), tuple(T(0, 1.0, 0)), 40)]
    lib.render_views(views, PREVIEW, PROP, HDRI, size=(800, 600), samples=24, world_strength=0.6)
print('DONE', OUT)
