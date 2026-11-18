"""The farm's hand pump set (S21-S23), one GLB per prop:

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/ciftlik/pump_props.py -- <prop> <out.glb> [--preview dir]

prop: yoke_pump (green cast iron) | yoke_pump_rust | tub | flume | keg | ridge

The pump is laid out in the frame pump-set.ts (branch v2-ciftlik) builds it in: origin on the ground
under the seated eye (the eye 1.18 m up), -z ahead, the spout and gauge on the right (+x; mirror the
root's x for the left). three.js metres. Materials: Poly Haven green_metal_rust (as it is for the green
pump, tinted to rust for the rusty one), Poly Haven dark_planks for wood, flat copper, brass, red paint.
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
PROP, OUT = A[0], A[1]
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else ''
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
lib.reset()
COLL = lib.collection(PROP)

EYE = 1.18
BODY_AHEAD, CUP_Y, PIVOT_AHEAD, PIVOT_Y, ARM, BAR_HALF = 0.58, EYE - 0.33, 0.86, EYE - 0.3, 0.47, 0.31


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


def bm_tube(p0, p1, r0, r1=None, seg=12, caps=True):
    r1 = r0 if r1 is None else r1
    a, b = T(*p0), T(*p1)
    bm = bmesh.new()
    ln = (b - a).length
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=ln, calc_uvs=True)
    bmesh.ops.translate(bm, vec=(0, 0, ln / 2), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=a, verts=bm.verts)
    return bm


def bm_torus(c, R, r, axis='Y', seg=20, rseg=6):
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
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
            bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % rseg], rings[i][(j + 1) % rseg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_lathe(c, profile, seg=20, v_scale=1.0):
    """profile: (radius, y) in three.js about the vertical through c; u round, v along the profile."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    rings = []
    for r, y in profile:
        rings.append([bm.verts.new(T(c[0] + r * math.cos(2 * math.pi * k / seg), c[1] + y, c[2] + r * math.sin(2 * math.pi * k / seg))) for k in range(seg + 1)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            f = bm.faces.new((rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]))
            for l, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                l[uv].uv = (profile[ii][1] * v_scale, kk / seg * 3)   # the wood's planks run up the staves
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


def obj(name, parts, parent=None, loc=None, box_uv=0.0, smooth=False):
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
    if box_uv:
        lib.box_uv(o, box_uv)
    if parent is not None:
        o.parent = parent
    if loc is not None:
        o.location = loc
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.04
    COLL.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
    return e


def recentre(bm, c):
    bmesh.ops.translate(bm, vec=-T(*c), verts=bm.verts)
    return bm


WOOD = lambda: lib.pbr('farm_wood', 'dark_planks', 1024, 256, tint=(0.85, 0.72, 0.6), rough=0.7, metal=0.0)  # noqa: E731
BRASS = lambda: lib.flat('farm_brass', (0.78, 0.55, 0.22), rough=0.3, metal=0.55)  # noqa: E731
COPPER = lambda: lib.flat('farm_copper', (0.72, 0.36, 0.2), rough=0.32, metal=0.55)  # noqa: E731
RED = lambda: lib.flat('farm_red_paint', (0.6, 0.06, 0.05), rough=0.5)  # noqa: E731
WATER = lambda: lib.flat('farm_water', (0.32, 0.45, 0.5), rough=0.08, alpha=0.6)  # noqa: E731


def iron(rust):
    if rust:
        return lib.pbr('pump_iron_rust', 'green_metal_rust', 1024, 256, tint=(0.75, 0.42, 0.24), rough=0.85, metal=0.25)
    return lib.pbr('pump_iron_green', 'green_metal_rust', 1024, 256, rough=0.55, metal=0.35)


def yoke_pump(rust=False):
    root = empty('yoke_pump_rust' if rust else 'yoke_pump')
    I, W, B = iron(rust), WOOD(), BRASS()
    # body: flange on the ground, a swelling column, a collar, the open cup with a rolled rim
    body = [bm_lathe((0, 0, -BODY_AHEAD), [(0.15, 0.0), (0.15, 0.035), (0.1, 0.045), (0.092, 0.08), (0.084, 0.3), (0.098, 0.31), (0.098, 0.345),
                                           (0.08, 0.355), (0.075, CUP_Y - 0.075), (0.085, CUP_Y - 0.07), (0.13, CUP_Y - 0.005), (0.13, CUP_Y)], 22),
            bm_lathe((0, 0, -BODY_AHEAD), [(0.118, CUP_Y - 0.002), (0.078, CUP_Y - 0.06), (0.0, CUP_Y - 0.065)], 22),   # the cup's inside floor
            bm_torus((0, CUP_Y, -BODY_AHEAD), 0.13, 0.011, axis='Y', seg=28, rseg=6)]
    # the spout: out to the right, turned down at its end (the stream leaves at x 0.40, y 0.62)
    sy = EYE - 0.5
    body += [bm_tube((0.07, sy, -BODY_AHEAD - 0.01), (0.37, sy, -BODY_AHEAD - 0.04), 0.032, 0.03, seg=12),
             bm_tube((0.4, sy + 0.02, -BODY_AHEAD - 0.04), (0.4, sy - 0.055, -BODY_AHEAD - 0.04), 0.034, 0.03, seg=12),
             bm_torus((0.4, sy - 0.055, -BODY_AHEAD - 0.04), 0.032, 0.006, axis='Y', seg=14, rseg=4)]
    # two posts and the pin
    for x in (-0.2, 0.2):
        body.append(bm_box((x - 0.025, 0.0, -PIVOT_AHEAD - 0.03), (x + 0.025, PIVOT_Y + 0.05, -PIVOT_AHEAD + 0.03)))
        body.append(bm_box((x - 0.05, 0.0, -PIVOT_AHEAD - 0.06), (x + 0.05, 0.03, -PIVOT_AHEAD + 0.06)))
    body.append(bm_tube((-0.25, PIVOT_Y, -PIVOT_AHEAD), (0.25, PIVOT_Y, -PIVOT_AHEAD), 0.014, seg=10))
    for x in (-0.25, 0.25):
        body.append(bm_tube((x - 0.01 * (1 if x > 0 else -1), PIVOT_Y, -PIVOT_AHEAD), (x + 0.012 * (1 if x > 0 else -1), PIVOT_Y, -PIVOT_AHEAD), 0.022, seg=10))
    # the gauge stub and the valve's body on it
    body.append(bm_tube((0.07, EYE - 0.36, -0.57), (0.25, EYE - 0.24, -0.5), 0.012, seg=8))
    body_o = obj('pump_body', [(merge(body), I)], root)
    lib.box_uv(body_o, 2.0)
    # the gauge: copper case 0.16 across, its face to the eye; face separate (UV 0..1) for the game's dial picture
    gauge = empty('gauge', T(0.25, EYE - 0.19, -0.5), root)
    toward = (Vector((0, EYE, 0)) - Vector((0.25, EYE - 0.19, -0.5))).normalized()      # three.js direction to the eye
    yaw = math.atan2(toward.x, toward.z)
    pitch = math.asin(max(-1, min(1, toward.y)))
    gauge.rotation_mode = 'XYZ'
    gauge.rotation_euler = (-pitch, 0, yaw)     # Blender: local -Y (three.js +z, the face) turned to the eye
    case = [bm_lathe((0, 0, 0), [(0.0, -0.03), (0.086, -0.03), (0.088, -0.005), (0.08, 0.0)], 28)]
    # the lathe spins about three.js Y; the gauge's face looks along three.js +z, so turn it
    for v in case[0].verts:
        x, y, z = v.co        # Blender coords (x, -z3, y3); the lathe's axis is Blender Z
        v.co = Vector((x, -z, y))  # axis to Blender -Y (three.js +z, toward the eye)
    rim = bm_torus((0, 0, 0.0), 0.08, 0.008, axis='Z', seg=28, rseg=6)
    obj('gauge_case', [(merge(case + [rim]), COPPER())], gauge)
    fb = bmesh.new()
    uvl = fb.loops.layers.uv.new()
    c = fb.verts.new(T(0, 0, 0.002))
    ring = [fb.verts.new(T(0.074 * math.cos(2 * math.pi * k / 32), 0.074 * math.sin(2 * math.pi * k / 32), 0.002)) for k in range(32)]
    for k in range(32):
        f = fb.faces.new((c, ring[k], ring[(k + 1) % 32]))
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = (0.5 + p.x / 0.148, 0.5 + p.z / 0.148)
    face_mat = lib.flat('gauge_face', (0.93, 0.9, 0.82), rough=0.6)
    obj('gauge_face', [(fb, face_mat)], gauge)
    needle = empty('needle', T(0, 0, 0.006), gauge)
    nb = merge([bm_box((-0.003, -0.008, 0.0), (0.003, 0.058, 0.002)), bm_tube((0, 0, -0.001), (0, 0, 0.004), 0.008, seg=10)])
    obj('needle_hand', [(nb, lib.flat('needle_black', (0.05, 0.04, 0.03), rough=0.5))], needle)
    # the relief valve beside the gauge: brass cock on the stub, its red lever (pivot at the valve)
    va = (0.4, EYE - 0.2, -0.5)
    obj('valve_body', [(merge([bm_tube((va[0], va[1] - 0.07, va[2]), (va[0], va[1], va[2]), 0.022, 0.02, seg=12),
                               bm_tube((0.25, va[1] - 0.05, va[2]), (va[0], va[1] - 0.05, va[2]), 0.01, seg=8)]), B)], root)
    lever = empty('valve_lever', T(*va), root)
    obj('valve_lever_red', [(merge([bm_box((0.0, 0.002, -0.01), (0.075, 0.016, 0.01)), bm_tube((0, 0, 0), (0, 0.02, 0), 0.012, seg=10)]), RED())], lever)
    # the yoke: pivot on the pin; arms toward the eye, the wooden bar at their ends, the bridge and rod over the cup
    yoke = empty('yoke', T(0, PIVOT_Y, -PIVOT_AHEAD), root)
    yk = []
    for x in (-0.2, 0.2):
        yk.append(bm_box((x - 0.016, -0.018, -0.03), (x + 0.016, 0.018, ARM + 0.02)))
        yk.append(bm_box((x - 0.013, 0.0, 0.267), (x + 0.013, 0.17, 0.293)))
    yk.append(bm_tube((-0.215, 0.165, 0.28), (0.215, 0.165, 0.28), 0.014, seg=10))      # the piston bridge
    yk.append(bm_tube((0.0, 0.165, 0.28), (0.0, -0.18, 0.28), 0.011, seg=10))           # the rod down into the cup
    yk.append(bm_lathe((0, -0.19, 0.28), [(0.0, -0.01), (0.03, -0.01), (0.03, 0.01), (0.0, 0.012)], 12))
    for x in (-BAR_HALF, BAR_HALF):
        yk.append(bm_tube((x - 0.0125, 0, ARM), (x + 0.0125, 0, ARM), 0.027, seg=12))
    obj('yoke_iron', [(merge(yk), I)], yoke, box_uv=3.0)
    bar = bm_tube((-BAR_HALF + 0.01, 0, ARM), (BAR_HALF - 0.01, 0, ARM), 0.021, seg=14)
    obj('yoke_bar', [(bar, W)], yoke)
    empty('bar_grip_left', T(-0.2, 0, ARM), yoke)
    empty('bar_grip_right', T(0.2, 0, ARM), yoke)
    # the stream from the spout (hidden until the pump runs) and the points
    st = bm_tube((0.4, sy - 0.06, -BODY_AHEAD - 0.04), (0.4, sy - 0.6, -BODY_AHEAD - 0.04), 0.022, 0.016, seg=10, caps=False)
    obj('pump_water_stream', [(st, WATER())], root)
    empty('pump_spout', T(0.4, sy - 0.06, -BODY_AHEAD - 0.04), root)
    empty('pump_priming_cup', T(0, CUP_Y, -BODY_AHEAD), root)
    views = [('eye', (0.0, 0.0, EYE), tuple(T(0.05, 0.7, -0.6)), 24), ('side', tuple(T(1.3, 1.3, 0.4)), tuple(T(0.0, 0.6, -0.65)), 32)]
    return root, views


def tub():
    """A wooden tub 0.34 x 0.34 x 0.40 of staves with two iron bands; origin on the ground at its middle; water at 0.30."""
    root = empty('tub')
    W, I = WOOD(), lib.flat('band_iron', (0.1, 0.09, 0.08), rough=0.5, metal=0.5)
    st = []
    n = 6
    for side in range(4):
        for k in range(n):
            u0, u1 = -0.17 + 0.34 * k / n + 0.002, -0.17 + 0.34 * (k + 1) / n - 0.002
            if side == 0:
                st.append(bm_box((u0, 0.0, 0.15), (u1, 0.4, 0.17)))
            elif side == 1:
                st.append(bm_box((u0, 0.0, -0.17), (u1, 0.4, -0.15)))
            elif side == 2:
                st.append(bm_box((-0.17, 0.0, u0), (-0.15, 0.4, u1)))
            else:
                st.append(bm_box((0.15, 0.0, u0), (0.17, 0.4, u1)))
    st.append(bm_box((-0.15, 0.0, -0.15), (0.15, 0.03, 0.15)))
    obj('tub_wood', [(merge(st), W)], root, box_uv=4.0)
    bands = []
    for y in (0.07, 0.31):
        bands += [bm_box((-0.175, y, 0.17), (0.175, y + 0.025, 0.176)), bm_box((-0.175, y, -0.176), (0.175, y + 0.025, -0.17)),
                  bm_box((-0.176, y, -0.175), (-0.17, y + 0.025, 0.175)), bm_box((0.17, y, -0.175), (0.176, y + 0.025, 0.175))]
    obj('tub_bands', [(merge(bands), I)], root)
    wb = bm_box((-0.15, 0.295, -0.15), (0.15, 0.3, 0.15))
    obj('tub_water', [(wb, WATER())], root)
    return root, [('three_quarter', tuple(T(0.7, 0.8, 0.9)), tuple(T(0, 0.2, 0)), 35)]


def flume():
    """One metre of wooden flume along -z from its origin (the upstream end), open on top; flume_water a strip on its floor."""
    root = empty('flume')
    W = WOOD()
    parts = [bm_box((-0.16, 0.0, -1.0), (0.16, 0.035, 0.0)), bm_box((-0.16, 0.035, -1.0), (-0.13, 0.22, 0.0)),
             bm_box((0.13, 0.035, -1.0), (0.16, 0.22, 0.0))]
    for z in (-0.12, -0.88):
        parts += [bm_box((-0.18, -0.02, z - 0.03), (0.18, 0.0, z + 0.03)), bm_box((-0.18, 0.0, z - 0.02), (-0.16, 0.24, z + 0.02)), bm_box((0.16, 0.0, z - 0.02), (0.18, 0.24, z + 0.02))]
    obj('flume_wood', [(merge(parts), W)], root, box_uv=3.0)
    wb = bmesh.new()
    uvl = wb.loops.layers.uv.new()
    vs = [wb.verts.new(T(x, 0.06, z)) for x, z in ((-0.13, 0.0), (0.13, 0.0), (0.13, -1.0), (-0.13, -1.0))]
    f = wb.faces.new(vs)
    for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uvl].uv = t
    obj('flume_water', [(wb, WATER())], root)
    return root, [('three_quarter', tuple(T(0.9, 0.7, 0.4)), tuple(T(0, 0.1, -0.5)), 35)]


def keg():
    """The jug's stand: a small hooped barrel 0.76 tall, 0.24 across; origin on the ground at its middle."""
    root = empty('keg')
    W, I = WOOD(), lib.flat('keg_iron', (0.1, 0.09, 0.08), rough=0.5, metal=0.5)
    prof = [(0.0, 0.0), (0.105, 0.0), (0.112, 0.06), (0.12, 0.38), (0.112, 0.7), (0.105, 0.76), (0.0, 0.76)]
    obj('keg_wood', [(bm_lathe((0, 0, 0), prof, 20, v_scale=2.0), W)], root, smooth=True)
    hoops = [bm_torus((0, y, 0), r + 0.004, 0.007, axis='Y', seg=22, rseg=4) for y, r in ((0.06, 0.112), (0.19, 0.117), (0.57, 0.117), (0.7, 0.112))]
    obj('keg_hoops', [(merge(hoops), I)], root)
    return root, [('three_quarter', tuple(T(0.8, 0.9, 1.0)), tuple(T(0, 0.38, 0)), 35)]


def ridge():
    """A ridge of dry earth 0.72 wide and 3.3 long along -z from its origin, 0.18 high, its crest a little rough."""
    root = empty('ridge')
    soil = lib.pbr('ridge_soil', 'dry_mud_field_001', 1024, 256, rough=0.95, metal=0.0)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    nx, nz = 8, 33
    import random
    rng = random.Random(5)
    grid = []
    for j in range(nz + 1):
        z = -3.3 * j / nz
        row = []
        for i in range(nx + 1):
            x = -0.36 + 0.72 * i / nx
            t = 1 - (x / 0.36) ** 2
            y = 0.18 * max(0.0, t) ** 0.8 + (rng.uniform(-0.012, 0.012) if 0 < i < nx else 0.0)
            row.append(bm.verts.new(T(x, max(0.0, y), z)))
        grid.append(row)
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for l in f.loops:
                p = l.vert.co
                l[uvl].uv = (p.x / 0.8, p.y / 0.8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj('ridge_soil', [(bm, soil)], root, smooth=True)
    return root, [('three_quarter', tuple(T(1.4, 1.0, 0.6)), tuple(T(0, 0.05, -1.6)), 30)]


BUILD = {'yoke_pump': lambda: yoke_pump(False), 'yoke_pump_rust': lambda: yoke_pump(True), 'tub': tub, 'flume': flume, 'keg': keg, 'ridge': ridge}
top, views = BUILD[PROP]()
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
lib.write_json(os.path.join(HERE, 'stats', f'{PROP}.json'), {'triangles': t, 'draw_calls': calls, 'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS', PROP, t, calls)
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    lib.render_views(views, PREVIEW, PROP, HDRI, size=(800, 600), samples=24)
print('DONE', OUT)
