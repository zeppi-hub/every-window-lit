"""Builds the ice-age valley for "Ring-fence": the last mammoth herd on a
snowy tundra floor between glacier walls, wolves at the edges, and the stakes
and planks the player uses to fence the herd in before night.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/buzul/build.py -- <out.glb> [--preview <dir>]

Layout (metres, Blender: X east, Y north, Z up; north is -Z in three.js):
  herd around (0, 8); a ring of twelve post spots, radius 7.5 around it; the
  player sits at (0, -2.5) facing the herd, stakes piled on the left, planks
  on the right, a small fire behind; wolves 18-30 m out; glacier walls east
  and west, peaks beyond.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0]
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else ''
C = lib.CACHE
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
random.seed(51)

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')
POINTS = lib.collection('points')

M = {}
M['ground'] = lib.pbr('tundra_snow', 'snow_03', 1024, 512)
M['snow'] = lib.pbr('deep_snow', 'snow_02', 1024, 256)
M['ice'] = lib.flat('glacier_ice', (0.55, 0.7, 0.8), rough=0.12)
M['rock'] = lib.pbr('valley_rock', 'dark_rock', 512, 256, tint=(0.8, 0.8, 0.85))
M['bark'] = lib.pbr('stake_bark', 'bark_brown_02', 512, 256)
M['plank'] = lib.pbr('split_wood', 'old_wood_floor', 512, 256, tint=(0.9, 0.82, 0.72))
M['grass'] = lib.flat('dry_tundra_grass', (0.42, 0.36, 0.22), rough=0.95)
M['ember'] = lib.flat('embers', (0.3, 0.08, 0.02), rough=0.8, emissive=(1.0, 0.35, 0.08))
M['ash'] = lib.flat('fire_ash', (0.12, 0.11, 0.1), rough=0.95)


def ground_h(x, y):
    r = math.hypot(x, y - 8)
    base = 0.3 * noise.noise(Vector((x * 0.05, y * 0.05, 2.0))) + 0.1 * noise.noise(Vector((x * 0.3, y * 0.3, 5.0)))
    t = min(1.0, max(0.0, (abs(x) - 36.0) / 80.0))
    walls = (t * t * (3 - 2 * t)) * (55.0 + 25.0 * noise.noise(Vector((x * 0.02, y * 0.02, 8.0))))
    far = min(1.0, max(0.0, (r - 140.0) / 100.0)) * 30.0
    return base + walls + far


# ------------------------------------------------------------------ valley floor, glacier walls, peaks
bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
rings, segs = 28, 80
radii = [0.0] + [1.8 * (1.2 ** k) for k in range(rings)]
grid = []
for k, r in enumerate(radii):
    n = 1 if r == 0 else segs
    grid.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), 8 + r * math.sin(2 * math.pi * i / segs), 0)) for i in range(n)])
for ring in grid:
    for v in ring:
        v.co.z = ground_h(v.co.x, v.co.y)
for i in range(segs):
    bm.faces.new([grid[0][0], grid[1][i], grid[1][(i + 1) % segs]])
for k in range(1, len(grid) - 1):
    for i in range(segs):
        bm.faces.new([grid[k][i], grid[k + 1][i], grid[k + 1][(i + 1) % segs], grid[k][(i + 1) % segs]])
bm.normal_update()
for f in bm.faces:
    f.smooth = True
    steep = f.normal.z < 0.55
    f.material_index = 1 if steep else 0
    s = 3.0 if not steep else 6.0
    for l in f.loops:
        l[lay].uv = (l.vert.co.x / s, (l.vert.co.y + l.vert.co.z) / s)
me = bpy.data.meshes.new('valley')
bm.to_mesh(me)
bm.free()
me.materials.append(M['ground'])
me.materials.append(M['snow'])
STATIC.objects.link(bpy.data.objects.new('valley', me))
print('VALLEY radius', round(radii[-1]))
# Glacier fronts: blue ice cliffs where the valley walls start.
for s in (-1, 1):
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    rows = []
    for j in range(9):
        z = j * 2.2
        row = []
        for i in range(21):
            y = -30 + i * 5.0
            x = s * (38.0 + 1.2 * noise.noise(Vector((y * 0.2, z * 0.3, 1.0))) + z * 0.35)
            row.append(bm.verts.new((x, y, z + ground_h(s * 38.0, y) - 0.5)))
        rows.append(row)
    for j in range(8):
        for i in range(20):
            vs = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]]
            f = bm.faces.new(vs if s > 0 else vs[::-1])
            f.smooth = True
            for l in f.loops:
                l[lay].uv = (l.vert.co.y / 6.0, l.vert.co.z / 6.0)
    lib.mesh_object('glacier', bm, M['ice'], STATIC)
# Boulders and tufts of dry grass poking through the snow.
rk = lib.import_gltf(os.path.join(C, 'rock_07', 'rock_07_1k.gltf'), LIB)['rock_07']
lib.decimate(rk, target=600)
pts = [Vector(v.co) for v in rk.data.vertices]
rk.data.transform(Matrix.Translation((-(min(p.x for p in pts) + max(p.x for p in pts)) / 2, -(min(p.y for p in pts) + max(p.y for p in pts)) / 2, -min(p.z for p in pts))))
for c in list(rk.users_collection):
    c.objects.unlink(rk)
for k in range(12):
    a = random.uniform(0, 2 * math.pi)
    r = random.uniform(14, 34)
    x, y = r * math.cos(a), 8 + r * math.sin(a)
    o = bpy.data.objects.new('boulder', rk.data)
    STATIC.objects.link(o)
    o.matrix_world = Matrix.Translation((x, y, ground_h(x, y) - 0.2)) @ Matrix.Rotation(random.uniform(0, 6.3), 4, 'Z') @ Matrix.Scale(random.uniform(5, 11), 4)
bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
for k in range(220):
    a = random.uniform(0, 2 * math.pi)
    r = random.uniform(3, 30)
    x, y = r * math.cos(a), 8 + r * math.sin(a)
    z = ground_h(x, y)
    for b in range(5):
        ang = random.uniform(0, 2 * math.pi)
        h = random.uniform(0.15, 0.4)
        lean = Vector((math.cos(ang), math.sin(ang), 0)) * h * 0.4
        base = Vector((x + random.uniform(-0.08, 0.08), y + random.uniform(-0.08, 0.08), z - 0.02))
        side = Vector((-math.sin(ang), math.cos(ang), 0)) * 0.012
        f = bm.faces.new([bm.verts.new(base - side), bm.verts.new(base + side), bm.verts.new(base + lean + Vector((0, 0, h)))])
        for l in f.loops:
            l[lay].uv = (0.5, 0.5)
lib.mesh_object('tundra_grass', bm, M['grass'], STATIC)


# ------------------------------------------------------------------ animals (Sketchfab, CC BY), each its own node
def animal(uid, target, scale, key):
    o = list(lib.import_gltf(os.path.join(C, 'sketchfab', f'{uid}.glb'), LIB).values())[0]
    lib.decimate(o, target=target)
    pts = [Vector(v.co) for v in o.data.vertices]
    sx = max(p.x for p in pts) - min(p.x for p in pts)
    sy = max(p.y for p in pts) - min(p.y for p in pts)
    if sy > sx:  # length along X
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
        pts = [Vector(v.co) for v in o.data.vertices]
    cx, cy = (min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    o.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
    for c in list(o.users_collection):
        c.objects.unlink(o)
    o.data.name = key
    return o.data


MAM = animal('fce1c86ccedf47a5b9627098be6719d5', 4500, 2.4, 'mammoth')
WOLF = animal('1de9441cb0744c0d8459ce957b8d0a57', 2500, 0.56, 'wolf')
herd = [(-1.8, 7.0, 0.3, 1.0), (1.9, 6.4, -0.5, 0.95), (0.2, 9.6, 2.6, 1.05), (-3.4, 9.8, 0.9, 0.9), (3.6, 9.2, -2.2, 0.85), (0.6, 11.8, 3.3, 0.62)]
for i, (x, y, rot, s) in enumerate(herd):
    o = bpy.data.objects.new(f'mammoth_{i + 1}', MAM)
    NODES.objects.link(o)
    o.matrix_world = Matrix.Translation((x, y, ground_h(x, y) - 0.05)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Scale(s, 4)
for i, (x, y, rot) in enumerate(((-17.0, 20.0, -0.6), (-12.0, 27.0, -1.2), (19.0, 22.0, 3.6), (14.0, -9.0, 2.4))):
    o = bpy.data.objects.new(f'wolf_{i + 1}', WOLF)
    NODES.objects.link(o)
    o.matrix_world = Matrix.Translation((x, y, ground_h(x, y) - 0.02)) @ Matrix.Rotation(rot, 4, 'Z')
lib.empty('herd_centre', (0.0, 8.5, ground_h(0.0, 8.5)), 0.0, POINTS)

# ------------------------------------------------------------------ the fence: post spots in a ring, stakes and planks to place
R, N, CY = 7.5, 12, 8.5
for k in range(N):
    a = -math.pi / 2 + 2 * math.pi * k / N
    x, y = R * math.cos(a), CY + R * math.sin(a)
    lib.empty(f'post_spot_{k + 1:02d}', (x, y, ground_h(x, y)), a + math.pi / 2, POINTS)
print('POST GAP', round(2 * R * math.sin(math.pi / N), 2), 'm')


def stake(name):
    """A sharpened stake, 1.7 m, bark on, lying along +X with its point at +X (pivot at the blunt end)."""
    parts = [lib.tapered('stake', (0, 0, 0), (1.45, 0, 0), 0.075, 0.07, M['bark'], NODES, 8, 0.6),
             lib.tapered('stake_point', (1.45, 0, 0), (1.7, 0, 0), 0.07, 0.008, M['plank'], NODES, 8, 0.3)]
    return lib.join(parts, name)


def plank(name, L):
    """A split plank, pivot at one end, length along +X."""
    o = lib.box(name, (0, -0.11, -0.03), (L, 0.11, 0.03), M['plank'], NODES, 0.8)
    return o


SX, SY = -1.6, -2.0
for k in range(N):
    s = stake(f'stake_{k + 1:02d}')
    layer, slot = divmod(k, 6)
    s.matrix_world = Matrix.Translation((SX - 0.85, SY - 0.3 + slot * 0.16 + layer * 0.08, ground_h(SX, SY) + 0.08 + layer * 0.14)) @ Matrix.Rotation(math.radians(90 + random.uniform(-4, 4)), 4, 'Z') @ Matrix.Rotation(math.radians(-90), 4, 'Z')
PX, PY = 1.6, -2.0
gap = 2 * R * math.sin(math.pi / N) + 0.4
for k in range(N):
    p = plank(f'plank_{k + 1:02d}', gap)
    layer, slot = divmod(k, 4)
    p.matrix_world = Matrix.Translation((PX - 0.25 + slot * 0.24, PY - gap / 2, ground_h(PX, PY) + 0.04 + layer * 0.065)) @ Matrix.Rotation(math.pi / 2 + random.uniform(-0.03, 0.03), 4, 'Z')
lib.empty('stake_pile', (SX, SY, ground_h(SX, SY)), 0.0, POINTS)
lib.empty('plank_pile', (PX, PY, ground_h(PX, PY)), 0.0, POINTS)
# A mallet to drive the stakes (its own node).
parts = [lib.tapered('mallet_handle', (0, 0, 0), (0.55, 0, 0), 0.02, 0.018, M['plank'], NODES, 6, 0.3)]
head = lib.cylinder('mallet_head', (0, 0, 0), 0.07, 0.24, M['bark'], NODES, 10)
head.matrix_world = Matrix.Translation((0.6, -0.12, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
parts.append(head)
mallet = lib.join(parts, 'mallet')
mallet.matrix_world = Matrix.Translation((-0.7, -1.7, ground_h(-0.7, -1.7) + 0.07)) @ Matrix.Rotation(0.6, 4, 'Z')

# ------------------------------------------------------------------ a small fire behind the seat
FX, FY = 0.4, -4.4
fz = ground_h(FX, FY)
for k in range(9):
    a = 2 * math.pi * k / 9
    o = bpy.data.objects.new('fire_stone', rk.data)
    STATIC.objects.link(o)
    o.matrix_world = Matrix.Translation((FX + 0.55 * math.cos(a), FY + 0.55 * math.sin(a), fz - 0.02)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Scale(0.9, 4)
lib.cylinder('fire_ash', (FX, FY, fz - 0.01), 0.45, 0.03, M['ash'], STATIC, 12)
for k in range(5):
    a = 2 * math.pi * k / 5 + 0.3
    p0 = Vector((FX + 0.42 * math.cos(a), FY + 0.42 * math.sin(a), fz + 0.03))
    p1 = Vector((FX, FY, fz + 0.38))
    lib.tapered('fire_log', p0, p1, 0.045, 0.03, M['bark'], STATIC, 6, 0.4)
embers = lib.cylinder('campfire_embers', (0, 0, 0), 0.25, 0.04, M['ember'], NODES, 10)
embers.matrix_world = Matrix.Translation((FX, FY, fz + 0.02))
lib.empty('campfire_flame', (FX, FY, fz + 0.3), 0.0, POINTS)
lib.empty('seat_valley', (0.0, -2.5, ground_h(0.0, -2.5)), 0.0, POINTS)

# ------------------------------------------------------------------ finish
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1 and o.data.name not in ('mammoth', 'wolf'):
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects))
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
lib.merge_by_material(list(STATIC.all_objects), 'buzul', STATIC)


def limit(img):
    n = img.name.lower()
    if n.startswith(('snow_03', 'snow_02')):
        return 512 if 'nor' in n else (256 if img.colorspace_settings.name == 'Non-Color' else 1024)
    if 'image' in n or 'material' in n:
        return 1024
    return 256 if 'nor' in n else (128 if img.colorspace_settings.name == 'Non-Color' else 512)


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
        ('seat', (0.0, -2.5, 1.2), (0.0, 9.0, 1.2), 16),
        ('piles', (0.0, -2.5, 1.2), (0.0, -1.5, 0.0), 16),
        ('herd', (6.0, 2.0, 1.6), (-1.0, 9.0, 1.2), 22),
        ('wide', (-14.0, -14.0, 6.0), (2.0, 10.0, 1.0), 16),
    ]
    lib.render_views(views, PREVIEW, 'buzul', hdri, size=(960, 540), samples=16)
print('DONE', OUT)
