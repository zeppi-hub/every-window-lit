"""Builds the drought farm for "Prime the pump": a cast-iron pitcher pump on a
plank platform, a jug of saved water, a basin and an irrigation channel that
splits toward a dead field, a barn, a windmill tower and dry hills.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/ciftlik/build.py -- <out.glb> [--preview <dir>]

Layout (metres, Blender: X east, Y north, Z up; north is -Z in three.js):
  pump at the origin, spout toward +Y; the player sits on a stool at (0, -0.85)
  facing the pump and the channel; the channel runs from the basin at y 0.5 to
  a gate at y 12, then left and right along the field (y 14..30).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0]
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else ''
C = lib.CACHE
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
random.seed(21)

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')
POINTS = lib.collection('points')

M = {}
M['ground'] = lib.pbr('dry_ground', 'dry_mud_field_001', 1024, 512)
M['field'] = lib.pbr('field_soil', 'farm_soil', 1024, 256, tint=(0.95, 0.85, 0.7))
M['planks'] = lib.pbr('farm_planks', 'old_wood_floor', 1024, 256)
M['barn'] = lib.pbr('barn_boards', 'brown_planks_05', 1024, 256, tint=(0.75, 0.25, 0.18))
M['tin'] = lib.pbr('tin_roof', 'box_profile_metal_sheet', 512, 256)
M['bark'] = lib.pbr('bark', 'bark_brown_02', 512, 256, tint=(0.75, 0.7, 0.65))
M['iron'] = lib.flat('pump_iron', (0.07, 0.17, 0.1), rough=0.45, metal=0.6)
M['iron_dark'] = lib.flat('dark_iron', (0.05, 0.05, 0.05), rough=0.5, metal=0.7)
M['steel'] = lib.flat('galvanized', (0.55, 0.56, 0.57), rough=0.35, metal=1.0)
M['water'] = lib.flat('clear_water', (0.06, 0.1, 0.11), rough=0.04, alpha=0.75)
M['straw'] = lib.flat('dry_stalks', (0.33, 0.26, 0.15), rough=0.95)
M['white'] = lib.flat('trim_white', (0.85, 0.83, 0.78), rough=0.6)


def rod(name, p0, p1, r, mat, coll=STATIC, seg=8):
    p0, p1 = Vector(p0), Vector(p1)
    o = lib.cylinder(name, (0, 0, 0), r, (p1 - p0).length, mat, coll, seg, caps=False)
    o.matrix_world = Matrix.Translation(p0) @ (p1 - p0).to_track_quat('Z', 'Y').to_matrix().to_4x4()
    return o


def load(folder, names, target, drop=()):
    objs = lib.import_gltf(os.path.join(C, folder, f'{folder}_1k.gltf'), LIB)
    keep = [o for n, o in objs.items() if any(n.startswith(x) for x in names) and not any(x in n for x in drop)]
    for n, o in objs.items():
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    j = lib.join(keep, folder)
    lib.decimate(j, target=target)
    pts = [Vector(v.co) for v in j.data.vertices]
    cx, cy = (min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    j.data.transform(Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
    for c in list(j.users_collection):
        c.objects.unlink(j)
    return j


def put(src, loc, rot=0.0, coll=STATIC, name=None):
    o = bpy.data.objects.new(name or src.name, src.data)
    coll.objects.link(o)
    o.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
    return o


# ------------------------------------------------------------------ terrain: flat yard and field, dry hills beyond
def height(x, y):
    r = math.hypot(x, y - 10)
    ramp = max(0.0, (r - 45.0) / 60.0)
    return ramp * ramp * (6.0 + 5.0 * math.sin(x * 0.03) * math.cos(y * 0.025) + 3.0 * math.sin(x * 0.011 + 1.0))


bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
rings, segs = 22, 64
radii = [0.0] + [2.5 * (1.2 ** k) for k in range(rings)]
grid = []
for k, r in enumerate(radii):
    n = 1 if r == 0 else segs
    grid.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), 10 + r * math.sin(2 * math.pi * i / segs), 0)) for i in range(n)])
for ring in grid:
    for v in ring:
        v.co.z = height(v.co.x, v.co.y)
for i in range(segs):
    bm.faces.new([grid[0][0], grid[1][i], grid[1][(i + 1) % segs]])
for k in range(1, len(grid) - 1):
    for i in range(segs):
        bm.faces.new([grid[k][i], grid[k + 1][i], grid[k + 1][(i + 1) % segs], grid[k][(i + 1) % segs]])
for f in bm.faces:
    f.smooth = True
    for l in f.loops:
        l[lay].uv = (l.vert.co.x / 4.0, l.vert.co.y / 4.0)
lib.mesh_object('terrain', bm, M['ground'], STATIC)
print('TERRAIN radius', round(radii[-1]))

# Field: furrowed soil strip with rows of dead stalks.
F0, F1, FX = 14.0, 30.0, 15.0
lib.box('field', (-FX, F0, 0.0), (FX, F1, 0.02), M['field'], STATIC, 3.0, faces=('+z',))
for k in range(int((F1 - F0) / 0.9)):
    y = F0 + 0.45 + k * 0.9
    lib.prism('furrow', [(-FX, y - 0.18), (FX, y - 0.18), (FX, y + 0.18), (-FX, y + 0.18)], 0.0, 0.12, M['field'], STATIC, 2.0)
    # Dead stalks: thin crossed cards every ~0.6 m in clumps.
    bmS = bmesh.new()
    layS = bmS.loops.layers.uv.new(lib.UV)
    x = -FX + 0.3
    while x < FX - 0.3:
        if random.random() < 0.7:
            h = random.uniform(0.35, 0.8)
            lean = Vector((random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), 0))
            for ang in (0.0, math.pi / 2):
                d = Vector((math.cos(ang), math.sin(ang), 0)) * 0.03
                b0 = Vector((x, y, 0.1))
                vs = [bmS.verts.new(b0 - d), bmS.verts.new(b0 + d), bmS.verts.new(b0 + d * 0.3 + lean + Vector((0, 0, h))), bmS.verts.new(b0 - d * 0.3 + lean + Vector((0, 0, h)))]
                f = bmS.faces.new(vs)
                for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                    l[layS].uv = t
        x += random.uniform(0.35, 0.8)
    lib.mesh_object('stalks', bmS, M['straw'], STATIC)

# ------------------------------------------------------------------ the pump, platform and basin
lib.box('platform', (-0.8, -1.0, 0.0), (0.8, 0.75, 0.12), M['planks'], STATIC, 0.7)
for x in (-0.75, 0.75):
    lib.box('platform_beam', (x - 0.06, -1.05, 0.0), (x + 0.06, 0.8, 0.1), M['planks'], STATIC, 0.7)
Z = 0.12
lib.cylinder('pump_flange', (0, 0, Z), 0.13, 0.04, M['iron'], STATIC, 14)
body = lib.tapered('pump_body', (0, 0, Z + 0.04), (0, 0, Z + 0.62), 0.085, 0.075, M['iron'], STATIC, 14, 0.5)
lib.cylinder('pump_band', (0, 0, Z + 0.3), 0.092, 0.03, M['iron'], STATIC, 14)
lib.cylinder('pump_neck', (0, 0, Z + 0.62), 0.09, 0.05, M['iron'], STATIC, 14)
cup = lib.tapered('pump_cup', (0, 0, Z + 0.67), (0, 0, Z + 0.78), 0.09, 0.13, M['iron'], STATIC, 14, 0.5)
lib.cylinder('cup_rim', (0, 0, Z + 0.78), 0.135, 0.015, M['iron'], STATIC, 14, caps=False)
lib.cylinder('cup_bottom', (0, 0, Z + 0.69), 0.088, 0.005, M['iron_dark'], STATIC, 14)
rod('spout', (0, 0.06, Z + 0.45), (0, 0.3, Z + 0.47), 0.034, M['iron'])
rod('spout_lip', (0, 0.3, Z + 0.47), (0, 0.34, Z + 0.4), 0.032, M['iron'])
lib.box('fulcrum', (-0.03, -0.14, Z + 0.7), (0.03, -0.06, Z + 0.86), M['iron'], STATIC, 0.2)
lib.empty('pump_priming_cup', (0, 0, Z + 0.75), 0.0, POINTS)
lib.empty('pump_spout', (0, 0.34, Z + 0.38), 0.0, POINTS)
# Handle: a curved iron lever from the fulcrum toward the player (its own node, pivot at the fulcrum pin).
FUL = Vector((0, -0.1, Z + 0.83))
parts = [rod('lever', (0, 0.02, -0.02), (0, -0.35, 0.12), 0.022, M['iron'], NODES, 8),
         rod('lever', (0, -0.35, 0.12), (0, -0.62, 0.16), 0.02, M['iron'], NODES, 8),
         rod('lever_grip', (0, -0.62, 0.16), (0, -0.74, 0.165), 0.028, M['iron_dark'], NODES, 10),
         rod('plunger_link', (0, 0.02, -0.02), (0, 0.06, -0.12), 0.012, M['iron'], NODES, 6)]
handle = lib.join(parts, 'pump_handle')
handle.matrix_world = Matrix.Translation(FUL)
lib.empty('pump_handle_grip', tuple(FUL + Vector((0, -0.7, 0.165))), 0.0, POINTS)
# Basin under the spout, feeding the channel.
lib.box('basin', (-0.3, 0.42, 0.0), (0.3, 0.85, 0.06), M['planks'], STATIC, 0.6)
for (lo, hi) in (((-0.3, 0.42, 0.0), (0.3, 0.46, 0.3)), ((-0.3, 0.42, 0.0), (-0.26, 0.85, 0.3)), ((0.26, 0.42, 0.0), (0.3, 0.85, 0.3))):
    lib.box('basin_wall', lo, hi, M['planks'], STATIC, 0.6)
bw = lib.box('basin_water', (-0.26, -0.2, -0.004), (0.26, 0.2, 0.0), M['water'], NODES, 1.0, faces=('+z',))
bw.matrix_world = Matrix.Translation((0, 0.65, 0.07))
# The stream from the spout (its own node, shown while water flows).
bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
prev = None
for k in range(7):
    t = k / 6
    p = Vector((0, 0.34 + 0.06 * t, Z + 0.38 - 0.42 * t * t - 0.05 * t))
    a, b = bm.verts.new(p + Vector((-0.02, 0, 0))), bm.verts.new(p + Vector((0.02, 0, 0)))
    if prev:
        f = bm.faces.new([prev[0], prev[1], b, a])
        for l, uv in zip(f.loops, ((0, t - 1 / 6), (1, t - 1 / 6), (1, t), (0, t))):
            l[lay].uv = uv
    prev = (a, b)
lib.mesh_object('pump_water_stream', bm, M['water'], NODES)

# ------------------------------------------------------------------ irrigation channel with a gate
def trench(name, p0, p1, w=0.42, depth=0.25):
    """A dug channel from p0 to p1: banks of piled earth and a bottom strip."""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = (p1 - p0).normalized()
    n = Vector((-d.y, d.x, 0))
    L = (p1 - p0).length
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    prof = [(-w / 2 - 0.25, 0.02), (-w / 2 - 0.05, 0.12), (-w / 2, -depth * 0.3), (-w / 2 + 0.06, -depth), (w / 2 - 0.06, -depth), (w / 2, -depth * 0.3), (w / 2 + 0.05, 0.12), (w / 2 + 0.25, 0.02)]
    segs = max(2, int(L / 1.0))
    rows = []
    for s in range(segs + 1):
        c = p0 + d * (L * s / segs)
        wob = 0.03 * math.sin(s * 1.7)
        rows.append([bm.verts.new(c + n * (u + wob) + Vector((0, 0, h))) for (u, h) in prof])
    for s in range(segs):
        for i in range(len(prof) - 1):
            f = bm.faces.new([rows[s][i], rows[s][i + 1], rows[s + 1][i + 1], rows[s + 1][i]])
            for l in f.loops:
                l[lay].uv = (l.vert.co.x / 2.0, l.vert.co.y / 2.0)
    lib.mesh_object(name, bm, M['ground'], STATIC)
    return p0, p1, d, n, L


def channel_water(name, p0, d, n, L, w=0.42, depth=0.25):
    o = lib.box(name, (-(w / 2 - 0.07), 0.0, -0.003), (w / 2 - 0.07, L, 0.0), M['water'], NODES, 1.0, faces=('+z',))
    theta = math.atan2(d.y, d.x) - math.pi / 2
    o.matrix_world = Matrix.Translation(p0 + Vector((0, 0, -depth + 0.03))) @ Matrix.Rotation(theta, 4, 'Z')
    return o


GATE = Vector((0.0, 12.0, 0.0))
mp0, mp1, md, mn, mL = trench('channel_main', (0, 0.85), GATE)
lp0, lp1, ld, ln, lL = trench('channel_left', GATE, (-FX + 1.0, F0 - 0.6))
rp0, rp1, rd, rn, rL = trench('channel_right', GATE, (FX - 1.0, F0 - 0.6))
for (a, b) in (((-FX + 1.0, F0 - 0.6), (-FX + 1.0, F1)), ((FX - 1.0, F0 - 0.6), (FX - 1.0, F1))):
    trench('channel_field', a, b)
channel_water('channel_water_main', mp0, md, mn, mL)
channel_water('channel_water_left', lp0, ld, ln, lL)
channel_water('channel_water_right', rp0, rd, rn, rL)
# The gate: a plank on a post at the split; swing it to send water left or right (its own node).
lib.box('gate_post', (-0.06, 11.94, -0.25), (0.06, 12.06, 0.55), M['planks'], STATIC, 0.5)
g = lib.box('channel_gate', (0.0, -0.025, -0.24), (0.55, 0.025, 0.25), M['planks'], NODES, 0.5)
g.matrix_world = Matrix.Translation(GATE) @ Matrix.Rotation(math.radians(90 + 35), 4, 'Z')
lib.empty('channel_gate_left', tuple(GATE), math.radians(90 + 35), POINTS)
lib.empty('channel_gate_right', tuple(GATE), math.radians(90 - 35), POINTS)

# ------------------------------------------------------------------ props: jug, stool, bucket, watering can
jug = load('jug_01', ['jug_01'], 800)
NODES.objects.link(jug)
jug.name = 'pitcher'
jug.matrix_world = Matrix.Translation((-0.42, -0.22, Z)) @ Matrix.Rotation(math.radians(-60), 4, 'Z')
lib.empty('pitcher_rest', (-0.42, -0.22, Z), 0.0, POINTS)
stool = load('folding_wooden_stool', ['folding_wooden_stool'], 700)
STATIC.objects.link(stool)
stool.matrix_world = Matrix.Translation((0.0, -1.5, 0.0))
lib.empty('seat_pump', (0.0, -1.5, 0.0), 0.0, POINTS)
can = load('watering_can_metal_01', ['watering_can_metal_01'], 900)
STATIC.objects.link(can)
can.matrix_world = Matrix.Translation((0.55, -0.15, Z)) @ Matrix.Rotation(1.2, 4, 'Z')
bk = load('wooden_bucket_02', ['wooden_bucket'], 600)
STATIC.objects.link(bk)
bk.matrix_world = Matrix.Translation((0.62, 0.5, Z))
branches = load('dry_branches_medium_01', ['dry_branches_medium_01'], 900)
for k in range(8):
    put(branches, (random.uniform(-12, 12), random.uniform(3, 11), 0.0), random.uniform(0, 6.28))
log = load('dead_tree_trunk', ['dead_tree_trunk'], 1800)
put(log, (5.5, 4.0, 0.0), 0.7)

# ------------------------------------------------------------------ barn, windmill, fence, dead trees
def barn(cx, cy, rot):
    W, D, H, R = 9.0, 12.0, 4.5, 3.2
    parts = []
    parts.append(lib.box('barn_walls', (-W / 2, -D / 2, 0), (W / 2, D / 2, H), M['barn'], STATIC, 2.0))
    bm = bmesh.new()
    for s in (-1, 1):
        vs = [bm.verts.new((-W / 2, s * D / 2, H)), bm.verts.new((W / 2, s * D / 2, H)), bm.verts.new((0, s * D / 2, H + R))]
        bm.faces.new(vs if s < 0 else vs[::-1])
    gab = lib.mesh_object('barn_gable', bm, M['barn'], STATIC)
    lib.box_uv(gab, 2.0)
    parts.append(gab)
    for s in (-1, 1):
        bm = bmesh.new()
        lay = bm.loops.layers.uv.new(lib.UV)
        vs = [bm.verts.new((s * (W / 2 + 0.4), -D / 2 - 0.3, H - 0.25)), bm.verts.new((s * (W / 2 + 0.4), D / 2 + 0.3, H - 0.25)),
              bm.verts.new((0, D / 2 + 0.3, H + R + 0.05)), bm.verts.new((0, -D / 2 - 0.3, H + R + 0.05))]
        f = bm.faces.new(vs if s > 0 else vs[::-1])
        for l in f.loops:
            l[lay].uv = (l.vert.co.y / 2.0, (l.vert.co.z + abs(l.vert.co.x)) / 2.0)
        parts.append(lib.mesh_object('barn_roof', bm, M['tin'], STATIC))
    parts.append(lib.box('barn_door', (-1.8, -D / 2 - 0.05, 0), (1.8, -D / 2, 3.4), M['barn'], STATIC, 1.0))
    for (a, b) in (((-1.8, 0.1), (1.8, 3.3)), ((1.8, 0.1), (-1.8, 3.3))):
        parts.append(rod('door_brace', (a[0], -D / 2 - 0.07, a[1]), (b[0], -D / 2 - 0.07, b[1]), 0.06, M['white']))
    parts.append(lib.box('door_trim', (-1.9, -D / 2 - 0.08, 3.3), (1.9, -D / 2 - 0.02, 3.45), M['white'], STATIC, 1.0))
    parts.append(lib.box('hay_door', (-0.8, -D / 2 - 0.05, H + 0.3), (0.8, -D / 2, H + 1.7), M['white'], STATIC, 1.0))
    for p in parts:
        p.matrix_world = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(rot, 4, 'Z') @ p.matrix_world


def windmill(cx, cy):
    H = 9.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod('mill_leg', (cx + sx * 1.3, cy + sy * 1.3, 0), (cx + sx * 0.25, cy + sy * 0.25, H), 0.05, M['steel'])
    for k in range(5):
        z0, z1 = k * H / 5, (k + 1) * H / 5
        w0, w1 = 1.3 - 1.05 * z0 / H, 1.3 - 1.05 * z1 / H
        for (a, b) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            rod('mill_brace', (cx + a[0] * w0, cy + a[1] * w0, z0), (cx + b[0] * w1, cy + b[1] * w1, z1), 0.02, M['steel'])
    rod('mill_shaft', (cx, cy - 0.2, H + 0.2), (cx, cy + 0.8, H + 0.2), 0.08, M['steel'])
    for k in range(18):
        a = 2 * math.pi * k / 18
        tip = Vector((cx + 1.9 * math.cos(a), cy - 0.25, H + 0.2 + 1.9 * math.sin(a)))
        bm = bmesh.new()
        base = Vector((cx + 0.5 * math.cos(a), cy - 0.25, H + 0.2 + 0.5 * math.sin(a)))
        side = Vector((-math.sin(a), 0, math.cos(a))) * 0.16
        vs = [bm.verts.new(base - side * 0.5), bm.verts.new(base + side * 0.5), bm.verts.new(tip + side), bm.verts.new(tip - side)]
        bm.faces.new(vs)
        o = lib.mesh_object('mill_blade', bm, M['steel'], STATIC)
        lib.box_uv(o, 1.0)
    bm = bmesh.new()
    vs = [bm.verts.new((cx, cy + 0.8, H)), bm.verts.new((cx, cy + 3.2, H + 0.3)), bm.verts.new((cx, cy + 3.2, H + 1.5)), bm.verts.new((cx, cy + 0.8, H + 0.5))]
    bm.faces.new(vs)
    lib.mesh_object('mill_tail', bm, M['steel'], STATIC)
    rod('pump_rod', (cx, cy, H), (cx, cy, 0.0), 0.02, M['steel'])
    lib.box('stock_tank', (cx + 1.6, cy - 1.2, 0), (cx + 3.6, cy + 1.2, 0.7), M['steel'], STATIC, 1.0)


barn(-21.0, 16.0, math.radians(75))
windmill(17.0, 34.0)
# Fence around the field: posts and two rails.
fence_pts = [(-FX - 1, F0 - 1.2), (FX + 1, F0 - 1.2), (FX + 1, F1 + 1), (-FX - 1, F1 + 1)]
for i in range(4):
    a, b = Vector((*fence_pts[i], 0)), Vector((*fence_pts[(i + 1) % 4], 0))
    if i == 0:
        segs_ = [(a, a.lerp(b, 0.45)), (a.lerp(b, 0.55), b)]
    else:
        segs_ = [(a, b)]
    for p, q in segs_:
        n = max(1, int((q - p).length / 2.5))
        for k in range(n + 1):
            c = p.lerp(q, k / n)
            lib.box('fence_post', (c.x - 0.06, c.y - 0.06, 0), (c.x + 0.06, c.y + 0.06, 1.15), M['planks'], STATIC, 0.5)
        for z in (0.55, 1.0):
            rod('fence_rail', (p.x, p.y, z), (q.x, q.y, z), 0.04, M['planks'], seg=5)
for k, (x, y, h) in enumerate(((8.0, 7.0, 6.5), (-9.0, 5.0, 5.0), (24.0, 10.0, 7.0), (-28.0, 32.0, 6.0), (6.0, 40.0, 7.5), (-14.0, -12.0, 6.0), (16.0, -16.0, 5.5))):
    lib.dead_tree('dead_tree', (x, y, height(x, y)), h, M['bark'], STATIC, seed=k)
lib.empty('spot_farmer', (1.4, 0.6, 0.0), math.radians(110), POINTS)

# ------------------------------------------------------------------ finish
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects))
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
lib.merge_by_material(list(STATIC.all_objects), 'ciftlik', STATIC)


def limit(img):
    n = img.name.lower()
    if n.startswith(('dry_mud', 'farm_soil', 'old_wood_floor')):
        return 512 if 'nor' in n else (256 if img.colorspace_settings.name == 'Non-Color' else 1024)
    return 256 if 'nor' in n else (128 if img.colorspace_settings.name == 'Non-Color' else 512)


lib.strip_normal_maps(('dry_branches', 'dead_tree_trunk', 'folding_wooden_stool', 'watering_can', 'wooden_bucket'))
lib.shrink_images(limit)
t, calls = lib.stats(STATIC)
tn, cn = lib.stats(NODES)
print(f'STATS static tris {t} calls {calls}; nodes tris {tn} calls {cn}')
lib.write_json(os.path.join(os.path.dirname(OUT), 'stats.json'), {'triangles': t + tn, 'draw_calls': calls + cn})
EXPORT = lib.collection('export')
for c in (STATIC, NODES, POINTS):
    EXPORT.children.link(c)
    bpy.context.scene.collection.children.unlink(c)
lib.export_glb(OUT, EXPORT)
if PREVIEW:
    hdri = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
    views = [
        ('seat', (0.0, -1.5, 1.2), (0.0, 12.0, 0.2), 16),
        ('pump', (0.0, -1.5, 1.2), (0.0, 0.0, 0.55), 22),
        ('wide', (-9.0, -9.0, 4.0), (2.0, 14.0, 1.0), 16),
        ('field', (4.0, 10.0, 1.6), (-6.0, 24.0, 0.5), 18),
    ]
    lib.render_views(views, PREVIEW, 'ciftlik', hdri, size=(960, 540), samples=16)
print('DONE', OUT)
