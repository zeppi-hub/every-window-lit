"""Builds the storm memory for "Bail out": the waist deck of a three-masted
sailing ship in a dark, heaving sea. The player sits on deck by a bilge well,
with a bucket, a sail rope to belay at the rail, and a sweep oar.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/gemi/build.py -- <out.glb> [--preview <dir>]

Hierarchy: `ship` (root, at the waterline under the ship's middle; rock this one)
holds the hull, rigging, sails and every interactive part and point; `sea` is a
separate root so the game can move the waves and the ship independently.
Ship axes in the build: bow toward +X, waterline z = 0, waist deck about 1.7 m.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0]
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else ''
C = lib.CACHE
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
random.seed(13)

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')
POINTS = lib.collection('points')

M = {}
M['sea'] = lib.flat('sea', (0.012, 0.035, 0.042), rough=0.12)
M['foam'] = lib.flat('foam', (0.75, 0.8, 0.82), rough=0.6)
M['rope'] = lib.flat('ship_rope', (0.42, 0.34, 0.22), rough=0.9)
M['iron'] = lib.flat('ship_iron', (0.08, 0.08, 0.085), rough=0.5, metal=0.7)
M['wood'] = lib.pbr('deck_wood', 'old_wood_floor', 512, 256, tint=(0.8, 0.7, 0.6))
M['water'] = lib.flat('hold_water', (0.018, 0.032, 0.03), rough=0.08)
M['dark'] = lib.flat('hold_dark', (0.02, 0.018, 0.015), rough=0.9)
M['mark'] = lib.flat('line_paint', (0.85, 0.82, 0.74), rough=0.6)
M['skin'] = lib.flat('drum_skin', (0.78, 0.7, 0.55), rough=0.7)
M['drum_red'] = lib.flat('drum_paint', (0.45, 0.08, 0.06), rough=0.5)

# ------------------------------------------------------------------ the ship (Poly Haven, decimated)
ship = lib.import_gltf(os.path.join(C, 'dutch_ship_medium', 'dutch_ship_medium_1k.gltf'), LIB)
hull, rig, sails = ship['dutch_ship_medium_hull'], ship['dutch_ship_medium_rigging'], ship['dutch_ship_medium_sails']
for o in (hull, rig, sails):
    for c in list(o.users_collection):
        c.objects.unlink(o)
lib.decimate(hull, target=16000)
lib.decimate(rig, target=13000)
lib.decimate(sails, target=4000)
for o in (hull, rig):
    STATIC.objects.link(o)
NODES.objects.link(sails)
sails.name = 'sails'

dg = bpy.context.evaluated_depsgraph_get()
TREE = BVHTree.FromObject(hull, dg)
RIG = BVHTree.FromObject(rig, dg)


def deck(x, y):
    """Top of the hull at (x, y): the deck or whatever sits on it."""
    hit = TREE.ray_cast(Vector((x, y, 6.0)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] is not None else 1.7


def rail(x, side=-1):
    """Height and y of the bulwark rail top on one side (side -1 = starboard, -y), found with
    horizontal rays from the centreline: the highest height at which the side still stops a ray."""
    best = (2.6, side * 2.4)
    base = deck(x, side * 1.0)
    for k in range(90):
        z = base + 0.1 + k * 0.02
        for tree in (TREE, RIG):
            hit = tree.ray_cast(Vector((x, side * 0.8, z)), Vector((0, side, 0)), 2.4)
            if hit[0] is not None:
                best = (z, hit[0].y)
    return best


def rod(name, p0, p1, r, mat, coll=STATIC, seg=8):
    p0, p1 = Vector(p0), Vector(p1)
    o = lib.cylinder(name, (0, 0, 0), r, (p1 - p0).length, mat, coll, seg, caps=False)
    o.matrix_world = Matrix.Translation(p0) @ (p1 - p0).to_track_quat('Z', 'Y').to_matrix().to_4x4()
    return o


# ------------------------------------------------------------------ the player's corner of the waist deck
PX, PY = -4.75, -0.35
DZ = deck(PX, PY)
RAIL_Z, RAIL_Y = rail(PX)
print(f'DECK at seat {DZ:.3f}, rail top {RAIL_Z:.3f} at y {RAIL_Y:.3f}')
# The bulwark stands 1.3 m above the deck, so the player sits on a 0.5 m step to see the sea over it.
STEP = 0.5
lib.box('step_platform', (PX - 0.55, PY - 0.55, DZ - 0.05), (PX + 0.55, PY + 0.55, DZ + STEP), M['wood'], STATIC, 0.6)
lib.empty('seat_deck', (PX, PY, DZ + STEP), math.pi, POINTS)   # on the step aft of the capstan, facing the starboard rail (-Y)

# Bilge well: a coaming box with a dark well and the water inside (its own node, raised by the game).
WX, WY = -3.7, -0.6
WZ = deck(WX, WY)
w, d, h = 0.9, 0.8, 0.55
for (lo, hi) in (((WX - w / 2, WY - d / 2, WZ), (WX + w / 2, WY - d / 2 + 0.08, WZ + h)),
                 ((WX - w / 2, WY + d / 2 - 0.08, WZ), (WX + w / 2, WY + d / 2, WZ + h)),
                 ((WX - w / 2, WY - d / 2, WZ), (WX - w / 2 + 0.08, WY + d / 2, WZ + h)),
                 ((WX + w / 2 - 0.08, WY - d / 2, WZ), (WX + w / 2, WY + d / 2, WZ + h))):
    lib.box('coaming', lo, hi, M['wood'], STATIC, 0.6)
lib.box('well_inside', (WX - w / 2 + 0.08, WY - d / 2 + 0.08, WZ - 0.6), (WX + w / 2 - 0.08, WY + d / 2 - 0.08, WZ + h - 0.01),
        M['dark'], STATIC, 1.0, faces=('+x', '-x', '+y', '-y', '-z'), inward=True)
water = lib.box('hold_water', (-(w / 2 - 0.09), -(d / 2 - 0.09), -0.005), (w / 2 - 0.09, d / 2 - 0.09, 0.0), M['water'], NODES, 1.0, faces=('+z',))
water.matrix_world = Matrix.Translation((WX, WY, WZ + 0.08))
# Painted depth line and notches on the inside of the coaming's far wall.
LINE_Z = WZ + 0.36
lib.box('water_line', (WX - w / 2 + 0.09, WY + d / 2 - 0.085, LINE_Z - 0.012), (WX + w / 2 - 0.09, WY + d / 2 - 0.08, LINE_Z + 0.012), M['mark'], STATIC, 1.0)
for k in range(1, 5):
    z = WZ + 0.08 * k
    lib.box('depth_notch', (WX - 0.06, WY + d / 2 - 0.085, z - 0.006), (WX + 0.06, WY + d / 2 - 0.08, z + 0.006), M['mark'], STATIC, 1.0)
lib.empty('water_level_min', (WX, WY, WZ + 0.08), 0.0, POINTS)
lib.empty('water_line', (WX, WY, LINE_Z), 0.0, POINTS)
lib.empty('water_level_max', (WX, WY, WZ + h - 0.03), 0.0, POINTS)

# Bucket (its own node, pivot at the bottom centre; the handle top at `bucket_grip`).
bk = lib.import_gltf(os.path.join(C, 'wooden_bucket_01', 'wooden_bucket_01_1k.gltf'), LIB)
bucket = lib.join(list(bk.values()), 'bucket')
lib.decimate(bucket, target=900)
pts = [Vector(v.co) for v in bucket.data.vertices]
cx, cy = (min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2
bucket.data.transform(Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
BH = max(p.z for p in pts) - min(p.z for p in pts)
for c in list(bucket.users_collection):
    c.objects.unlink(bucket)
NODES.objects.link(bucket)
BX, BY = PX - 0.32, PY - 0.3
bucket.matrix_world = Matrix.Translation((BX, BY, DZ + STEP))
lib.empty('bucket_grip', (BX, BY, DZ + STEP + BH), 0.0, POINTS)
lib.empty('bucket_rest', (BX, BY, DZ + STEP), 0.0, POINTS)
for i, x in enumerate((PX - 0.2, PX + 0.6)):
    rz, ry = rail(x)
    lib.empty(f'dump_point_{i + 1}', (x, ry - 0.05, rz + 0.05), -math.pi / 2, POINTS)

# Sail rope: from a belaying pin on the rail up to the main course's lower corner (its own node).
sv = [sails.matrix_world @ v.co for v in sails.data.vertices]
clew = min(sv, key=lambda p: p.z * 1.0 + (p.y + 3.0) ** 2 * 0.5 + abs(p.x - PX) * 0.3)
PIN = Vector((PX + 0.55, rail(PX + 0.55)[1] + 0.08, rail(PX + 0.55)[0] - 0.08))
lib.box('pin_rail', (PIN.x - 0.5, PIN.y - 0.06, PIN.z - 0.04), (PIN.x + 0.5, PIN.y + 0.06, PIN.z + 0.04), M['wood'], STATIC, 0.5)
lib.cylinder('belaying_pin', (PIN.x, PIN.y, PIN.z - 0.12), 0.02, 0.32, M['wood'], STATIC, 8)
rope = rod('sail_rope', PIN + Vector((0, 0, 0.12)), clew, 0.016, M['rope'], NODES)
rope.data.transform(Matrix.Identity(4))
L = (clew - PIN).length
print(f'SAIL ROPE rest {L:.3f} m, clew {tuple(round(c, 2) for c in clew)}')
coil = lib.cylinder('rope_coil', (0, 0, 0), 0.16, 0.08, M['rope'], NODES, 14)
coil.name = 'sail_rope_handle'
coil.matrix_world = Matrix.Translation((PIN.x - 0.35, PIN.y + 0.25, deck(PIN.x - 0.35, PIN.y + 0.25)))
lib.empty('sail_rope_tie', tuple(PIN + Vector((0, 0, 0.1))), 0.0, POINTS)
lib.empty('sail_clew', tuple(clew), 0.0, POINTS)

# Sweep oar through a port in the rail (its own node, pivot at the oarlock).
OX = PX - 0.45
oz, oy = rail(OX)
# The sweep works through an oar port cut 0.6 m below the rail top.
lock = Vector((OX, oy, oz - 0.6))
handle = Vector((OX + 0.05, PY - 0.45, DZ + STEP + 0.8))
blade = lock + (lock - handle).normalized() * 4.6
parts = [rod('oar_shaft', handle - lock, blade - lock, 0.045, M['wood'], NODES, 10)]
bm = bmesh.new()
dirv = (blade - lock).normalized()
side = dirv.cross(Vector((0, 0, 1))).normalized()
tip = blade - lock
c0 = tip - dirv * 1.1
for (a, b) in ((side * 0.11, side * 0.16), ):
    pass
vs = [bm.verts.new(c0 + side * 0.05), bm.verts.new(tip + side * 0.12), bm.verts.new(tip - side * 0.12), bm.verts.new(c0 - side * 0.05)]
bm.faces.new(vs)
blade_o = lib.mesh_object('oar_blade', bm, M['wood'], NODES)
lib.box_uv(blade_o, 0.6)
parts.append(blade_o)
grip = rod('oar_grip', handle - lock - dirv * 0.0, handle - lock - dirv * 0.35, 0.05, M['rope'], NODES, 10)
parts.append(grip)
oar = lib.join(parts, 'oar')
oar.matrix_world = Matrix.Translation(lock)
lib.box('oar_port', (lock.x - 0.18, lock.y - 0.06, lock.z - 0.1), (lock.x + 0.18, lock.y + 0.04, lock.z - 0.06), M['iron'], STATIC, 0.3)
lib.box('oar_port', (lock.x - 0.18, lock.y - 0.06, lock.z + 0.08), (lock.x + 0.18, lock.y + 0.04, lock.z + 0.12), M['iron'], STATIC, 0.3)
lib.empty('oar_handle', tuple(handle), 0.0, POINTS)

# Drum for the stroke (its own node), and where the drummer stands.
DX, DY = -4.2, 0.95
DZD = deck(DX, DY)
parts = [lib.cylinder('drum_shell', (0, 0, 0.35), 0.32, 0.45, M['drum_red'], NODES, 16),
         lib.cylinder('drum_skin', (0, 0, 0.8), 0.33, 0.015, M['skin'], NODES, 16),
         lib.cylinder('drum_rim', (0, 0, 0.78), 0.335, 0.035, M['iron'], NODES, 16)]
for k in range(3):
    a = k * 2 * math.pi / 3
    parts.append(rod('drum_leg', (0.2 * math.cos(a), 0.2 * math.sin(a), 0.36), (0.36 * math.cos(a), 0.36 * math.sin(a), 0.0), 0.02, M['wood'], NODES))
drum = lib.join(parts, 'drum')
drum.matrix_world = Matrix.Translation((DX, DY, DZD))
lib.empty('spot_drummer', (DX + 0.55, DY - 0.1, DZD), math.pi / 2, POINTS)
lib.empty('spot_captain', (-6.2, 0.0, deck(-6.2, 0.0)), -math.pi / 2, POINTS)

# Loose gear lashed on deck.
for nm, folder, target, at in (('barrels', 'wooden_barrels_01', 1500, (-5.25, 1.0)),):
    objs = lib.import_gltf(os.path.join(C, folder, f'{folder}_1k.gltf'), LIB)
    j = lib.join(list(objs.values()), nm)
    lib.decimate(j, target=target)
    pts = [Vector(v.co) for v in j.data.vertices]
    cx, cy = (min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    j.data.transform(Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
    for c in list(j.users_collection):
        c.objects.unlink(j)
    STATIC.objects.link(j)
    j.matrix_world = Matrix.Translation((at[0], at[1], deck(at[0], at[1]))) @ Matrix.Rotation(random.uniform(0, 6), 4, 'Z')
lb = lib.import_gltf(os.path.join(C, 'lifebuoy', 'lifebuoy_1k.gltf'), LIB)
buoy = lib.join(list(lb.values()), 'lifebuoy')
lib.decimate(buoy, target=600)
for c in list(buoy.users_collection):
    c.objects.unlink(buoy)
STATIC.objects.link(buoy)
pts = [Vector(v.co) for v in buoy.data.vertices]
cx, cy, cz = [(min(p[i] for p in pts) + max(p[i] for p in pts)) / 2 for i in range(3)]
buoy.data.transform(Matrix.Translation((-cx, -cy, -cz)))
bz, by = rail(PX - 2.2)
buoy.matrix_world = Matrix.Translation((PX - 2.2, by + 0.12, bz - 0.35)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')

# ------------------------------------------------------------------ the sea: heavy swell near the ship, flattening outward (its own root)
bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
rings, segs = 26, 72
radii = [0.0] + [3.0 * (1.18 ** k) for k in range(rings)]


def swell(x, y):
    r = math.hypot(x, y)
    fade = 1.0 / (1.0 + (r / 160.0) ** 2)
    return fade * (0.75 * math.sin(0.21 * x + 0.13 * y) + 0.45 * math.sin(0.37 * y - 0.18 * x + 1.3) + 0.22 * math.sin(0.8 * x + 0.6 * y + 0.4))


grid = []
for k, r in enumerate(radii):
    n = 1 if r == 0 else segs
    grid.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), 0)) for i in range(n)])
for ring in grid:
    for v in ring:
        v.co.z = swell(v.co.x, v.co.y) - 0.25
for i in range(segs):
    f = bm.faces.new([grid[0][0], grid[1][i], grid[1][(i + 1) % segs]])
for k in range(1, len(grid) - 1):
    for i in range(segs):
        bm.faces.new([grid[k][i], grid[k + 1][i], grid[k + 1][(i + 1) % segs], grid[k][(i + 1) % segs]])
for f in bm.faces:
    for l in f.loops:
        l[lay].uv = (l.vert.co.x / 8.0, l.vert.co.y / 8.0)
for f in bm.faces:
    f.smooth = True
sea = lib.mesh_object('sea', bm, M['sea'], lib.collection('sea_root'))
print('SEA radius', round(radii[-1], 1), 'tris', lib.tris(sea))
# Foam streaks along the hull's waterline.
for s in (-1, 1):
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    prev = None
    for k in range(25):
        x = -9.5 + k * 0.85
        half = 2.75 * math.sqrt(max(0.0, 1 - ((x - 0.6) / 11.2) ** 2)) + 0.1
        a = bm.verts.new((x, s * half, 0.05))
        b = bm.verts.new((x, s * (half + 0.9 + 0.3 * math.sin(k)), -0.02))
        if prev:
            f = bm.faces.new([prev[0], prev[1], b, a] if s < 0 else [prev[0], a, b, prev[1]])
        prev = (a, b)
    lib.mesh_object('foam', bm, M['foam'], STATIC)

# ------------------------------------------------------------------ finish
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects) + [sea])
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
merged = lib.merge_by_material(list(STATIC.all_objects), 'ship', STATIC)


def limit(img):
    n = img.name.lower()
    if 'dutch_ship' in n:
        return 512 if 'nor' in n else (256 if img.colorspace_settings.name == 'Non-Color' else 1024)
    return 256 if 'nor' in n else (128 if img.colorspace_settings.name == 'Non-Color' else 512)


lib.strip_normal_maps(('wooden_barrels', 'lifebuoy'))
lib.shrink_images(limit)
# Root nodes: `ship` holds everything that rocks; `sea` stays apart.
root = bpy.data.objects.new('ship', None)
EXPORT = lib.collection('export')
EXPORT.objects.link(root)
for c in (STATIC, NODES, POINTS):
    for o in list(c.all_objects):
        o.parent = root
        o.matrix_parent_inverse = Matrix.Identity(4)
    EXPORT.children.link(c)
    bpy.context.scene.collection.children.unlink(c)
seac = bpy.data.collections['sea_root']
EXPORT.children.link(seac)
bpy.context.scene.collection.children.unlink(seac)
t, calls = lib.stats(EXPORT)
print(f'STATS tris {t} calls {calls}')
lib.write_json(os.path.join(os.path.dirname(OUT), 'stats.json'), {'triangles': t, 'draw_calls': calls})
lib.export_glb(OUT, EXPORT)
if PREVIEW:
    hdri = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
    views = [
        ('seat', (PX, PY, DZ + STEP + 1.2), (PX, -8.0, 1.2), 14),
        ('well', (PX, PY, DZ + STEP + 1.2), (WX, WY, WZ), 18),
        ('bow', (PX, PY, DZ + STEP + 1.2), (4.0, 0.0, 2.6), 14),
        ('outside', (-30.0, -26.0, 9.0), (0.0, 0.0, 4.0), 22),
    ]
    lib.render_views(views, PREVIEW, 'gemi', hdri, size=(960, 540), samples=16)
print('DONE', OUT)
