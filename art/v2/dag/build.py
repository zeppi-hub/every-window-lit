"""Builds the snowy mountain for "Stress test": three ropes hanging from bolts at
the top of a rock face (one of them is rotten), a line of holds up the face,
an iced upper section, and the summit ledge above, among snow peaks.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/dag/build.py -- <out.glb> [--preview <dir>]

Layout (metres, Blender: X east, Y north, Z up; north is -Z in three.js):
  the player sits on the snow at the origin facing north; the face rises from
  y 1.2, leaning back 12 degrees, to the summit ledge at 8.5 m; holds climb at
  x 0..0.9, the three ropes hang at x -1.6, -1.1, -0.6; ice above 5.2 m.
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
random.seed(31)

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')
POINTS = lib.collection('points')

M = {}
M['snow'] = lib.pbr('snow', 'snow_02', 1024, 512)
M['rock'] = lib.pbr('cliff_rock', 'rock_face_03', 1024, 512)
M['far_rock'] = lib.pbr('far_rock', 'dark_rock', 512, 256, tint=(0.8, 0.8, 0.85))
M['ice'] = lib.flat('ice', (0.55, 0.72, 0.82), rough=0.05, alpha=0.42)
M['ice_hold'] = lib.flat('ice_hold', (0.7, 0.85, 0.92), rough=0.05)
M['rope'] = lib.flat('climb_rope', (0.75, 0.32, 0.12), rough=0.85)
M['rope_old'] = lib.flat('old_rope', (0.5, 0.42, 0.3), rough=0.95)
M['steel'] = lib.flat('bolt_steel', (0.6, 0.6, 0.62), rough=0.3, metal=1.0)
M['flag'] = lib.flat('marker_flag', (0.9, 0.4, 0.05), rough=0.7)

LEAN = math.radians(12)
WALL_Y, TOP = 1.2, 8.5
ICE_Z = 5.2


def wall_y(x, z):
    """The face's surface: leaning back, with ledges and bulges."""
    return (WALL_Y + z * math.tan(LEAN)
            + 0.18 * noise.noise(Vector((x * 0.6, z * 0.6, 3.0)))
            + 0.07 * noise.noise(Vector((x * 2.1, z * 2.1, 7.0)))
            - 0.12 * max(0.0, math.sin(z * 1.3)) * (0.5 + 0.5 * math.cos(x)))


# ------------------------------------------------------------------ the face and the ice over its upper part
def top_at(x):
    """Height of the face's top edge: full height in the middle, tapering into the snow at the sides."""
    a = abs(x)
    return TOP if a < 3.0 else max(0.6, TOP - (a - 3.0) * 0.85)


def face(name, x0, x1, z0, nx, nz, mat, offset=0.0, uv=2.0, z_top=None, wavy=0.0):
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    grid = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            zb = z0 + wavy * math.sin(x * 2.3)
            zt = z_top if z_top is not None else top_at(x)
            z = zb + (zt - zb) * j / nz
            row.append(bm.verts.new((x, wall_y(x, z) - offset, z)))
        grid.append(row)
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]][::-1])
            f.smooth = True
            for l in f.loops:
                l[lay].uv = (l.vert.co.x / uv, l.vert.co.z / uv)
    return lib.mesh_object(name, bm, mat, STATIC)


face('cliff', -12.0, 12.0, -0.3, 60, 34, M['rock'])
face('cliff_ice', -2.2, 2.6, ICE_Z, 16, 12, M['ice'], offset=0.04, z_top=TOP - 0.05, wavy=0.35)
# The massif behind the face: snow and rock rising away from the top edge, down to the snowfield at the sides.
bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
NXm, NYm = 32, 22
rows = []
for j in range(NYm + 1):
    row = []
    for i in range(NXm + 1):
        x = -40.0 + 80.0 * i / NXm
        inside = abs(x) < 12.0
        F = top_at(x) if inside else 0.4
        yf = wall_y(x, F) if inside else WALL_Y + 3.0
        t = j / NYm
        y = yf + t * t * 95.0
        back = max(0.0, (y - yf - 6.0) / 89.0)   # a flat 6 m summit ledge, then the slope
        h = F + (back ** 1.3) * (34.0 + 14.0 * noise.noise(Vector((x * 0.05, y * 0.05, 9.0)))) + (0.5 * noise.noise(Vector((x * 0.4, y * 0.4, 4.0))) * min(1.0, back * 20) if j > 0 else 0.0)
        row.append(bm.verts.new((x, y, h)))
    rows.append(row)
mf = []
for j in range(NYm):
    for i in range(NXm):
        mf.append(bm.faces.new([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]]))
bm.normal_update()
for f in mf:
    f.smooth = True
    f.material_index = 1 if f.normal.z < 0.6 else 0
    for l in f.loops:
        l[lay].uv = (l.vert.co.x / 3.0, l.vert.co.y / 3.0)
me = bpy.data.meshes.new('massif')
bm.to_mesh(me)
bm.free()
me.materials.append(M['snow'])
me.materials.append(M['rock'])
ms = bpy.data.objects.new('massif', me)
STATIC.objects.link(ms)

# Summit: a marker flag on the ledge above the face.
ty = wall_y(0.0, TOP)
lib.cylinder('flag_pole', (1.6, ty + 2.2, TOP), 0.015, 1.5, M['steel'], STATIC, 6)
lib.quad('summit_flag', [(1.6, ty + 2.2, TOP + 1.1), (2.1, ty + 2.25, TOP + 1.15), (2.1, ty + 2.25, TOP + 1.45), (1.6, ty + 2.2, TOP + 1.5)], [(0, 0), (1, 0), (1, 1), (0, 1)], M['flag'], STATIC)
lib.empty('climb_top', (0.4, ty + 0.9, TOP), 0.0, POINTS)
lib.empty('summit', (1.6, ty + 2.2, TOP), math.pi, POINTS)

# ------------------------------------------------------------------ rocks: boulders in the snow and the holds
rk = lib.import_gltf(os.path.join(C, 'rock_07', 'rock_07_1k.gltf'), LIB)['rock_07']
lib.decimate(rk, target=700)
hd = lib.import_gltf(os.path.join(C, 'rock_09', 'rock_09_1k.gltf'), LIB)['rock_09_LOD0']
lib.decimate(hd, target=110)
for o in (rk, hd):
    pts = [Vector(v.co) for v in o.data.vertices]
    cx, cy = (min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    o.data.transform(Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
    for c in list(o.users_collection):
        c.objects.unlink(o)


def boulder(loc, s, rot):
    o = bpy.data.objects.new('boulder', rk.data)
    STATIC.objects.link(o)
    o.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Scale(s, 4)


for (x, y, s) in ((-3.2, -1.5, 7.0), (2.8, -2.2, 6.0), (4.6, 0.2, 9.0), (-5.0, 0.6, 8.0), (1.2, -5.5, 5.0), (-2.0, -6.5, 6.5), (6.5, -4.0, 7.5)):
    boulder((x, y, -0.15), s, random.uniform(0, 6.28))

# Holds: up the face in a gentle zigzag. Rock below the ice line, ice-glazed above. Each is its own node.
path = []
z = 1.1
k = 0
while z < TOP - 0.4:
    x = 0.45 + (0.4 if k % 2 else -0.35) + random.uniform(-0.08, 0.08)
    path.append((x, z))
    z += random.uniform(0.42, 0.55)
    k += 1
nr = ni = 0
for (x, z) in path:
    icy = z > ICE_Z
    if icy:
        ni += 1
        name = f'ice_hold_{ni:02d}'
    else:
        nr += 1
        name = f'hold_{nr:02d}'
    o = bpy.data.objects.new(name, hd.data.copy())
    NODES.objects.link(o)
    if icy:
        o.data.materials[0] = M['ice_hold']
    y = wall_y(x, z) - 0.03
    # Scaled into a ~0.2 m hold, its flat side against the face (rock_09 lies along Y).
    o.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(90), 4, 'X') @ Matrix.Rotation(random.uniform(-0.4, 0.4), 4, 'Z') @ Matrix.Scale(2.2, 4)
print(f'HOLDS rock {nr} ice {ni}, top hold at {path[-1][1]:.2f} m')

# ------------------------------------------------------------------ three ropes on bolts at the top (each its own node, pivot at its bolt)
for i, x in enumerate((-1.6, -1.1, -0.6)):
    top = Vector((x, wall_y(x, TOP - 0.25) - 0.08, TOP - 0.25))
    lib.cylinder('bolt_plate', (0, 0, 0), 0.04, 0.02, M['steel'], STATIC, 8).matrix_world = Matrix.Translation(top + Vector((0, 0.03, 0))) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    seg, n = 6, 26
    rings = []
    for j in range(n + 1):
        t = j / n
        zz = TOP - 0.25 - t * (TOP - 0.25 - 0.05)
        yy = wall_y(x, max(0.0, zz)) - 0.09 - 0.25 * t * t - 0.12 * math.sin(t * math.pi)
        c = Vector((x + 0.04 * math.sin(t * 9 + i), yy, zz)) - top
        rings.append([bm.verts.new(c + Vector((0.013 * math.cos(2 * math.pi * a / seg), 0.013 * math.sin(2 * math.pi * a / seg), 0))) for a in range(seg)])
    for j in range(n):
        for a in range(seg):
            b = (a + 1) % seg
            f = bm.faces.new([rings[j][a], rings[j][b], rings[j + 1][b], rings[j + 1][a]])
            for l in f.loops:
                l[lay].uv = (a / seg, j / 4)
    o = lib.mesh_object(f'rope_{i + 1}', bm, M['rope'], NODES)
    o.matrix_world = Matrix.Translation(top)
    # A loose coil where it reaches the snow; the grip is the rope at chest height.
    coil = lib.cylinder(f'rope_{i + 1}_coil', (0, 0, 0), 0.14, 0.06, M['rope'], STATIC, 10)
    coil.matrix_world = Matrix.Translation((x, wall_y(x, 0) - 0.45, 0.0))
    gz = 1.1
    lib.empty(f'rope_{i + 1}_grip', (x + 0.04 * math.sin((1 - (gz - 0.05) / (TOP - 0.3)) * 9 + i), wall_y(x, gz) - 0.09 - 0.25 * ((TOP - 0.25 - gz) / (TOP - 0.3)) ** 2 - 0.12 * math.sin(math.pi * (TOP - 0.25 - gz) / (TOP - 0.3)), gz), 0.0, POINTS)
lib.empty('seat_base', (0.0, 0.0, 0.0), 0.0, POINTS)

# ------------------------------------------------------------------ snow ground and the ring of peaks
def peaks(x, y):
    r = math.hypot(x, y)
    if r < 90:
        return 0.15 * noise.noise(Vector((x * 0.2, y * 0.2, 1.0)))
    ramp = min(1.0, (r - 90) / 300.0)
    ridge = 1.0 - abs(noise.noise(Vector((x * 0.006, y * 0.006, 2.0))))
    return ramp * (40 + 200 * ridge ** 2 + 25 * noise.noise(Vector((x * 0.02, y * 0.02, 5.0))))


bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
rings, segs = 30, 96
radii = [0.0] + [2.4 * (1.2 ** k) for k in range(rings)]
grid = []
for k, r in enumerate(radii):
    n = 1 if r == 0 else segs
    grid.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), 0.0)) for i in range(n)])
for ring in grid:
    for v in ring:
        v.co.z = peaks(v.co.x, v.co.y)
faces = []
for i in range(segs):
    faces.append(bm.faces.new([grid[0][0], grid[1][i], grid[1][(i + 1) % segs]]))
for k in range(1, len(grid) - 1):
    for i in range(segs):
        faces.append(bm.faces.new([grid[k][i], grid[k + 1][i], grid[k + 1][(i + 1) % segs], grid[k][(i + 1) % segs]]))
bm.normal_update()
for f in faces:
    f.smooth = True
    steep = False   # far peaks read best as plain snow under fog
    f.material_index = 1 if steep else 0
    s = 40.0 if steep else 3.0
    for l in f.loops:
        l[lay].uv = (l.vert.co.x / s, l.vert.co.y / s)
me = bpy.data.meshes.new('mountains')
bm.to_mesh(me)
bm.free()
me.materials.append(M['snow'])
me.materials.append(M['far_rock'])
mt = bpy.data.objects.new('mountains', me)
STATIC.objects.link(mt)
print('MOUNTAINS radius', round(radii[-1]), 'tris', lib.tris(mt))

# ------------------------------------------------------------------ finish
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects))
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
lib.merge_by_material(list(STATIC.all_objects), 'dag', STATIC)


def limit(img):
    n = img.name.lower()
    if n.startswith(('snow_02', 'rock_face_03')):
        return 512 if 'nor' in n else (256 if img.colorspace_settings.name == 'Non-Color' else 1024)
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
        ('seat', (0.0, 0.0, 1.2), (0.0, 3.0, 3.6), 16),
        ('ropes', (0.0, 0.0, 1.2), (-1.1, 1.5, 1.4), 20),
        ('wide', (6.0, -9.0, 3.0), (0.0, 2.0, 4.0), 18),
        ('summit', (0.4, ty + 0.9, TOP + 1.3), (0.0, -60.0, 2.0), 16),
        ('back', (0.0, -16.0, 2.5), (0.0, 10.0, 6.0), 18),
    ]
    lib.render_views(views, PREVIEW, 'dag', hdri, size=(960, 540), samples=16)
print('DONE', OUT)
