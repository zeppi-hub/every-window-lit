"""Builds the forest-fire edge for "Firewall": a clearing at the edge of a dry
fir forest, a staked firebreak line to dig in front of the player (and a second
one to the right for when the wind turns), a spade, a wet sack and its bucket.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/yangin/build.py -- <out.glb> [--preview <dir>]

Layout (metres, Blender: X east, Y north, Z up; north is -Z in three.js):
  the player sits at the origin facing north (the fire comes from there);
  strip 1 runs across at y 3..4 from x -5 to 5 in eight segments; strip 2 runs
  north-south at x 4..5 from y -4 to 2 in six segments; trees are crossed-quad
  firs rendered from a Poly Haven scan, with charred trunks toward the fire.
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
random.seed(41)

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')
POINTS = lib.collection('points')

M = {}
M['ground'] = lib.pbr('forest_ground', 'forest_ground_04', 1024, 512)
M['soil'] = lib.pbr('dug_soil', 'farm_soil', 512, 256, tint=(0.55, 0.45, 0.38))
M['bark'] = lib.pbr('fir_bark', 'bark_willow', 512, 256, tint=(0.7, 0.62, 0.55))
M['char'] = lib.pbr('charred_bark', 'bark_willow', 512, 256, tint=(0.12, 0.1, 0.09))
M['fir'] = lib.textured('fir_card', os.path.join(C, 'gen', 'fir_impostor.png'), rough=0.85, alpha_clip=True)
M['stake'] = lib.flat('stake_wood', (0.55, 0.42, 0.26), rough=0.8)
M['tape'] = lib.flat('marker_tape', (0.95, 0.42, 0.04), rough=0.6)
M['ash'] = lib.flat('ash', (0.18, 0.17, 0.16), rough=0.95)
M['water'] = lib.flat('bucket_water', (0.05, 0.08, 0.08), rough=0.05)
M['stump_top'] = lib.flat('stump_rings', (0.6, 0.48, 0.32), rough=0.8)

# Burlap for the sack: a small woven texture made right here.
img = bpy.data.images.new('burlap', 64, 64)
px = []
for y in range(64):
    for x in range(64):
        warp = (x // 4 + y // 8) % 2 == 0
        weft = (y // 4 + x // 8) % 2 == 0
        v = 0.17 + (0.04 if warp else 0.0) + (0.03 if weft else 0.0) + random.uniform(-0.02, 0.02)
        px += [v * 1.0, v * 0.78, v * 0.5, 1.0]
img.pixels = px
img.pack()
M['burlap'] = lib.new_material('wet_burlap')
b = next(n for n in M['burlap'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
t = M['burlap'].node_tree.nodes.new('ShaderNodeTexImage')
t.image = img
M['burlap'].node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
b.inputs['Roughness'].default_value = 0.55


def ground_h(x, y):
    r = math.hypot(x, y)
    return 0.25 * noise.noise(Vector((x * 0.08, y * 0.08, 1.0))) + (max(0.0, r - 40.0) / 110.0) ** 2 * 18.0 * (0.6 + 0.4 * noise.noise(Vector((x * 0.01, y * 0.01, 3.0))))


# ------------------------------------------------------------------ ground
bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
rings, segs = 24, 64
radii = [0.0] + [1.6 * (1.21 ** k) for k in range(rings)]
grid = []
for k, r in enumerate(radii):
    n = 1 if r == 0 else segs
    grid.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), 0)) for i in range(n)])
for ring in grid:
    for v in ring:
        v.co.z = ground_h(v.co.x, v.co.y)
for i in range(segs):
    bm.faces.new([grid[0][0], grid[1][i], grid[1][(i + 1) % segs]])
for k in range(1, len(grid) - 1):
    for i in range(segs):
        bm.faces.new([grid[k][i], grid[k + 1][i], grid[k + 1][(i + 1) % segs], grid[k][(i + 1) % segs]])
for f in bm.faces:
    f.smooth = True
    for l in f.loops:
        l[lay].uv = (l.vert.co.x / 3.0, l.vert.co.y / 3.0)
lib.mesh_object('ground', bm, M['ground'], STATIC)
print('GROUND radius', round(radii[-1]))


# ------------------------------------------------------------------ the strips: dug trench below, a cover patch per segment above (each its own node)
def strip(tag, p0, p1, n, width=1.0):
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = (p1 - p0).normalized()
    side = Vector((-d.y, d.x, 0))
    L = (p1 - p0).length
    seg_len = L / n
    # Trench: a shallow dug channel of soil along the whole strip (shown where covers are removed).
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    prof = [(-width / 2 - 0.15, 0.04), (-width / 2, 0.06), (-width / 2 + 0.12, -0.14), (width / 2 - 0.12, -0.14), (width / 2, 0.06), (width / 2 + 0.15, 0.04)]
    rows = []
    for s in range(n * 2 + 1):
        c = p0 + d * (L * s / (n * 2))
        rows.append([bm.verts.new(c + side * u + Vector((0, 0, h + ground_h(c.x, c.y)))) for (u, h) in prof])
    for s in range(n * 2):
        for i in range(len(prof) - 1):
            f = bm.faces.new([rows[s][i], rows[s][i + 1], rows[s + 1][i + 1], rows[s + 1][i]])
            for l in f.loops:
                l[lay].uv = (l.vert.co.x / 1.5, l.vert.co.y / 1.5)
    lib.mesh_object(f'{tag}_trench', bm, M['soil'], STATIC)
    # Cover patches: undisturbed needle litter over each segment.
    for k in range(n):
        c0 = p0 + d * (seg_len * k)
        bm = bmesh.new()
        lay = bm.loops.layers.uv.new(lib.UV)
        g = []
        for j in range(3):
            row = []
            for i in range(4):
                u = -width / 2 - 0.08 + (width + 0.16) * i / 3
                c = c0 + d * (seg_len * j / 2)
                row.append(bm.verts.new(side * u + d * (seg_len * j / 2) + Vector((0, 0, ground_h(c.x + side.x * u, c.y + side.y * u) + 0.07 - 0.05 * abs(u) / (width / 2 + 0.08)))))
            g.append(row)
        for j in range(2):
            for i in range(3):
                f = bm.faces.new([g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]] if side.cross(d).z > 0 else [g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1]])
                for l in f.loops:
                    w = l.vert.co + c0
                    l[lay].uv = (w.x / 1.5, w.y / 1.5)
        o = lib.mesh_object(f'{tag}_cover_{k + 1:02d}', bm, M['ground'], NODES)
        o.matrix_world = Matrix.Translation(c0)
        lib.empty(f'{tag}_dig_{k + 1:02d}', tuple(c0 + d * seg_len / 2 + Vector((0, 0, ground_h(c0.x, c0.y)))), math.atan2(-d.x, d.y), POINTS)
    # Stakes with orange tape along both edges, every two segments.
    posts = []
    for k in range(0, n + 1, 2):
        c = p0 + d * (seg_len * k)
        for s in (-1, 1):
            q = c + side * s * (width / 2 + 0.3)
            z = ground_h(q.x, q.y)
            lib.box('stake', (q.x - 0.025, q.y - 0.025, z - 0.1), (q.x + 0.025, q.y + 0.025, z + 0.7), M['stake'], STATIC, 0.5)
            posts.append((s, Vector((q.x, q.y, z + 0.62))))
    for s in (-1, 1):
        line = [p for (ss, p) in posts if ss == s]
        for a, b2 in zip(line, line[1:]):
            bm = bmesh.new()
            vs = [bm.verts.new(a), bm.verts.new(b2), bm.verts.new(b2 + Vector((0, 0, 0.05))), bm.verts.new(a + Vector((0, 0, 0.05)))]
            bm.faces.new(vs)
            lib.mesh_object('tape', bm, M['tape'], STATIC)


strip('strip1', (-5.0, 3.5), (5.0, 3.5), 8)
strip('strip2', (4.6, -4.0), (4.6, 2.2), 6)

# ------------------------------------------------------------------ trees: crossed-quad firs, charred trunks toward the fire
FW, FH = 0.662, 1.0   # impostor width / height


def fir(x, y, h, rot):
    z = ground_h(x, y) - 0.05
    w = h * FW
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    for k in range(2):
        a = rot + k * math.pi / 2
        d = Vector((math.cos(a), math.sin(a), 0)) * (w / 2)
        base = Vector((x, y, z))
        vs = [bm.verts.new(base - d), bm.verts.new(base + d), bm.verts.new(base + d + Vector((0, 0, h))), bm.verts.new(base - d + Vector((0, 0, h)))]
        f = bm.faces.new(vs)
        u0, u1 = (0.0, 0.5) if k == 0 else (0.5, 1.0)
        for l, t in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
            l[lay].uv = t
    lib.mesh_object('fir', bm, M['fir'], STATIC)


n_fir = 0
for k in range(260):
    a = random.uniform(0, 2 * math.pi)
    r = random.uniform(7.0, 70.0)
    x, y = r * math.cos(a), r * math.sin(a)
    if abs(x) < 6.5 and -6 < y < 6.5:
        continue
    if y > 4 and abs(x) < 9 and random.random() < 0.5:
        continue
    fir(x, y, random.uniform(7.0, 13.0), random.uniform(0, math.pi))
    n_fir += 1
# A few close firs behind and beside the player (not in the way of the strips).
for (x, y, h) in ((-3.5, -4.5, 9.0), (-6.0, -2.0, 11.0), (1.5, -6.5, 10.0), (7.5, -5.0, 8.5), (-7.5, 1.5, 10.5)):
    fir(x, y, h, random.uniform(0, math.pi))
    n_fir += 1
# Charred standing trunks and ash beyond strip 1, where the fire has passed.
for k in range(14):
    x, y = random.uniform(-14, 14), random.uniform(9, 26)
    lib.dead_tree('burnt_tree', (x, y, ground_h(x, y)), random.uniform(5, 9), M['char'], STATIC, seed=100 + k, levels=1)
for k in range(6):
    x, y = random.uniform(-12, 12), random.uniform(10, 22)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=10, radius=random.uniform(1.5, 3.0))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, ground_h(x, y) + 0.03))
    o = lib.mesh_object('ash_patch', bm, M['ash'], STATIC)
    lib.box_uv(o, 1.0)
print('FIRS', n_fir)

# ------------------------------------------------------------------ tools: spade, wet sack, bucket; a stump to lean on
sp = lib.import_gltf(os.path.join(C, 'rusted_spade_01', 'rusted_spade_01_1k.gltf'), LIB)['rusted_spade_01']
lib.decimate(sp, target=900)
pts = [Vector(v.co) for v in sp.data.vertices]
top = max(pts, key=lambda p: p.z)
sp.data.transform(Matrix.Translation((-top.x, -top.y, -top.z)))   # pivot at the top of the handle (the grip)
for c in list(sp.users_collection):
    c.objects.unlink(sp)
NODES.objects.link(sp)
sp.name = 'shovel'
SX, SY = 0.75, 0.55
sz = ground_h(SX, SY)
sp.matrix_world = Matrix.Translation((SX, SY, sz + 1.02)) @ Matrix.Rotation(math.radians(-14), 4, 'X')
lib.empty('shovel_rest', (SX, SY, sz + 1.02), 0.0, POINTS)
# Stump beside the player.
lib.tapered('stump', (1.25, 0.25, ground_h(1.25, 0.25) - 0.1), (1.25, 0.25, ground_h(1.25, 0.25) + 0.42), 0.32, 0.28, M['bark'], STATIC, 10, 1.0)
lib.cylinder('stump_top', (1.25, 0.25, ground_h(1.25, 0.25) + 0.42), 0.28, 0.005, M['stump_top'], STATIC, 10)
# Wet sack, folded over the bucket rim on the player's left (its own node, pivot at its centre).
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=8, y_segments=6, size=1.0)
for v in bm.verts:
    v.co.x *= 0.36
    v.co.y *= 0.24
    v.co.z = 0.02 * noise.noise(Vector((v.co.x * 9, v.co.y * 9, 2.0))) + 0.03 * (1 - (v.co.x / 0.36) ** 2)
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.03)
sack = lib.mesh_object('wet_sack', bm, M['burlap'], NODES)
lib.box_uv(sack, 0.4)
BX, BY = -0.75, 0.45
bz = ground_h(BX, BY)
sack.matrix_world = Matrix.Translation((BX + 0.05, BY - 0.42, bz + 0.03)) @ Matrix.Rotation(0.4, 4, 'Z')
lib.empty('wet_sack_rest', (BX + 0.05, BY - 0.42, bz + 0.03), 0.0, POINTS)
bk = lib.import_gltf(os.path.join(C, 'wooden_bucket_01', 'wooden_bucket_01_1k.gltf'), LIB)
bucket = lib.join(list(bk.values()), 'sack_bucket')
lib.decimate(bucket, target=800)
pts = [Vector(v.co) for v in bucket.data.vertices]
cx, cy = (min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2
bh = max(p.z for p in pts) - min(p.z for p in pts)
rad = (max(p.x for p in pts) - min(p.x for p in pts)) / 2
bucket.data.transform(Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
for c in list(bucket.users_collection):
    c.objects.unlink(bucket)
STATIC.objects.link(bucket)
bucket.matrix_world = Matrix.Translation((BX, BY, bz))
lib.cylinder('sack_bucket_water', (BX, BY, bz + bh * 0.72), rad * 0.82, 0.005, M['water'], STATIC, 14)
lib.empty('sack_bucket_dip', (BX, BY, bz + bh * 0.72), 0.0, POINTS)

# Spark spots: where embers land on the player's side of the strip.
k = 0
while k < 10:
    x, y = random.uniform(-4.5, 4.0), random.uniform(0.9, 2.8)
    if math.hypot(x, y) < 1.2:
        continue
    k += 1
    lib.empty(f'spark_spot_{k:02d}', (x, y, ground_h(x, y)), 0.0, POINTS)
for k, (x, y) in enumerate(((-6.0, 14.0), (0.0, 16.0), (6.0, 13.0), (10.0, 4.0), (11.0, -3.0))):
    lib.empty(f'fire_source_{k + 1}', (x, y, ground_h(x, y)), 0.0, POINTS)
lib.empty('seat_clearing', (0.0, 0.0, ground_h(0.0, 0.0)), 0.0, POINTS)

# ------------------------------------------------------------------ finish
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects))
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
lib.merge_by_material(list(STATIC.all_objects), 'yangin', STATIC)


def limit(img):
    n = img.name.lower()
    if n.startswith('fir_impostor'):
        return 1024
    if n.startswith(('forest_ground_04', 'forest_leaves_04')):
        return 512 if 'nor' in n else (256 if img.colorspace_settings.name == 'Non-Color' else 1024)
    return 256 if 'nor' in n else (128 if img.colorspace_settings.name == 'Non-Color' else 512)


lib.strip_normal_maps(('wooden_bucket',))
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
        ('seat', (0.0, 0.0, 1.2), (0.0, 10.0, 1.5), 16),
        ('tools', (0.0, 0.0, 1.2), (0.0, 0.8, 0.2), 16),
        ('right', (0.0, 0.0, 1.2), (8.0, -1.0, 1.0), 16),
        ('wide', (-9.0, -12.0, 5.0), (2.0, 8.0, 1.0), 18),
    ]
    lib.render_views(views, PREVIEW, 'yangin', hdri, size=(960, 540), samples=16)
print('DONE', OUT)
