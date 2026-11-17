"""Builds the circus memory for "Safety net": inside a big top, a high wire
between two platforms, and a safety net on wheels that the player moves under
the falling acrobats by pulling two ropes.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/sirk/build.py -- <out.glb> [--preview <dir>]

Layout (metres, Blender: X east, Y north, Z up; north is -Z in three.js):
  tent radius 18, wall 5 m, roof up to 15 m on two king poles at (+-9, 0);
  ring curb radius 6.4..6.85; wire along X at height 6 between platforms at
  x = +-7.3; net (3.6 x 3.0, 1.45 high) slides along X; the player sits outside
  the ring at (0, -7.6) facing north with the two rope handles in reach.
"""
import json
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
G = os.path.join(C, 'gen')
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
random.seed(3)

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')
POINTS = lib.collection('points')
ATL = json.load(open(os.path.join(G, 'sirk.json')))
A, REG = ATL['size'], ATL['regions']

M = {}
M['canvas'] = lib.textured_relief('canvas', os.path.join(G, 'canvas.png'), os.path.join(C, 'tex', 'fabric_pattern_07'), rough=0.85)
M['curb'] = lib.textured('ring_curb', os.path.join(G, 'curb.png'), rough=0.5)
M['pole'] = lib.textured('painted_pole', os.path.join(G, 'pole.png'), rough=0.45)
M['paint'] = lib.textured('circus_paint', os.path.join(G, 'sirk.png'), rough=0.5)
M['sawdust'] = lib.pbr('sawdust', 'aerial_wood_snips', 1024, 512)
M['planks'] = lib.pbr('bleacher_planks', 'brown_planks_05', 1024, 256, tint=(0.78, 0.58, 0.4))
M['skirt'] = lib.pbr('skirt_velvet', 'velour_velvet', 512, 256, tint=(0.7, 0.25, 0.28))
M['metal'] = lib.flat('rig_metal', (0.6, 0.6, 0.62), rough=0.35, metal=1.0)
M['wire'] = lib.flat('wire_steel', (0.75, 0.75, 0.78), rough=0.25, metal=1.0)
M['rope'] = lib.flat('hemp_rope', (0.58, 0.47, 0.32), rough=0.9)
M['grip'] = lib.flat('grip_wood', (0.45, 0.28, 0.14), rough=0.6)
M['rubber'] = lib.flat('rubber', (0.03, 0.03, 0.03), rough=0.8)
M['lens'] = lib.flat('spot_lens', (1.0, 0.95, 0.8), rough=0.2, emissive=(1.0, 0.92, 0.75))
M['net'] = lib.textured('net', os.path.join(G, 'net.png'), rough=0.9, alpha_clip=True)

# ------------------------------------------------------------------ props
PROP = {}


def load_prop(key, folder, names, target, scale=1.0, drop=()):
    objs = lib.import_gltf(os.path.join(C, folder, f'{folder}_1k.gltf'), LIB)
    keep = [o for n, o in objs.items() if any(n.startswith(x) for x in names) and not any(x in n for x in drop)]
    for n, o in objs.items():
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    j = lib.join(keep, f'prop_{key}')
    lib.decimate(j, target=target)
    pts = [Vector(v.co) for v in j.data.vertices]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    top = max(p.z for p in pts) if key == 'lamp' else min(p.z for p in pts)
    j.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation((-cx, -cy, -top)))
    PROP[key] = j.data
    bpy.data.objects.remove(j, do_unlink=True)


def prop(key, loc, rot=0.0):
    o = bpy.data.objects.new(f'prop_{key}', PROP[key])
    STATIC.objects.link(o)
    o.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
    return o


load_prop('crate', 'wooden_crate_01', ['wooden_crate_01'], 500)
load_prop('barrel', 'Barrel_01', ['Barrel_01'], 500)
load_prop('lamp', 'hanging_industrial_lamp', ['hanging_industrial_lamp'], 500)
load_prop('ladder', 'wooden_ladder', ['wooden_ladder'], 900, scale=1.4)


# ------------------------------------------------------------------ helpers
def loft(name, rings, mat, n=48, u_repeat=12.0, v_scale=6.0, a0=0.0, a1=2 * math.pi, inward=True, coll=STATIC):
    """Quads between consecutive ellipses (rx, ry, z) over angles a0..a1; UV u around, v by distance."""
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    closed = abs(a1 - a0 - 2 * math.pi) < 1e-6
    cols = n if closed else n + 1
    grid = []
    for (rx, ry, z) in rings:
        grid.append([bm.verts.new((rx * math.cos(a0 + (a1 - a0) * i / n), ry * math.sin(a0 + (a1 - a0) * i / n), z)) for i in range(cols)])
    vacc = [0.0]
    for k in range(1, len(rings)):
        (rx0, ry0, z0), (rx1, ry1, z1) = rings[k - 1], rings[k]
        vacc.append(vacc[-1] + math.hypot(((rx0 + ry0) - (rx1 + ry1)) / 2, z1 - z0))
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % cols
            vs = [grid[k][i], grid[k][j], grid[k + 1][j], grid[k + 1][i]]
            uvs = [(u_repeat * i / n, vacc[k] / v_scale), (u_repeat * (i + 1) / n, vacc[k] / v_scale),
                   (u_repeat * (i + 1) / n, vacc[k + 1] / v_scale), (u_repeat * i / n, vacc[k + 1] / v_scale)]
            if inward:
                vs, uvs = vs[::-1], uvs[::-1]
            f = bm.faces.new(vs)
            for l, t in zip(f.loops, uvs):
                l[lay].uv = t
    return lib.mesh_object(name, bm, mat, coll)


def disc(name, r, z, mat, n=48, uv_scale=3.0):
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    c = bm.verts.new((0, 0, z))
    ring = [bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)]
    for i in range(n):
        f = bm.faces.new([c, ring[i], ring[(i + 1) % n]])
        for l in f.loops:
            l[lay].uv = (l.vert.co.x / uv_scale, l.vert.co.y / uv_scale)
    return lib.mesh_object(name, bm, mat, STATIC)


def rod(name, p0, p1, r, mat, coll=STATIC, seg=8):
    p0, p1 = Vector(p0), Vector(p1)
    o = lib.cylinder(name, (0, 0, 0), r, (p1 - p0).length, mat, coll, seg, caps=False)
    o.matrix_world = Matrix.Translation(p0) @ (p1 - p0).to_track_quat('Z', 'Y').to_matrix().to_4x4()
    return o


def rope_node(name, p0, p1, r=0.014):
    """A rope as its own node: mesh along local +Z from the pivot at p0 (glTF local +Y), rest length |p1 - p0|."""
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    o = lib.cylinder(name, (0, 0, 0), r, L, M['rope'], NODES, 8, caps=False)
    o.matrix_world = Matrix.Translation(p0) @ (p1 - p0).to_track_quat('Z', 'Y').to_matrix().to_4x4()
    return o, L


# ------------------------------------------------------------------ tent
loft('tent_wall', [(18, 18, 0), (18, 18, 5.0)], M['canvas'], 64, 16, 5.0)
loft('tent_roof', [(18, 18, 5.0), (12.5, 11.2, 9.6), (9.8, 2.2, 14.0), (9.4, 0.8, 15.0)], M['canvas'], 64, 16, 5.0)
lib.box('roof_cap', (-9.4, -0.8, 14.99), (9.4, 0.8, 15.0), M['canvas'], STATIC, 2.0, faces=('-z',))
disc('floor', 18.0, 0.0, M['sawdust'], 48, 2.5)
for x in (-9.0, 9.0):
    lib.cylinder('king_pole', (x, 0, 0), 0.22, 15.2, M['pole'], STATIC, 12, 2.0)
for k in range(8):
    a = math.radians(22.5 + k * 45)
    x, y = 8.3 * math.cos(a), 8.3 * math.sin(a)
    lib.cylinder('quarter_pole', (x, y, 0), 0.12, 11.0, M['pole'], STATIC, 10, 2.0)
# Ring curb.
loft('curb_inner', [(6.4, 6.4, 0.0), (6.4, 6.4, 0.45)], M['curb'], 64, 12.5, 0.45, inward=False)
loft('curb_top', [(6.4, 6.4, 0.45), (6.85, 6.85, 0.45)], M['curb'], 64, 12.5, 0.45, inward=False)
loft('curb_outer', [(6.85, 6.85, 0.45), (6.85, 6.85, 0.0)], M['curb'], 64, 12.5, 0.45, inward=False)
# Bleachers: six tiers all round except the performers' entrance (east).
gap = math.radians(26)
for k in range(6):
    r0, r1, z0, z1 = 9.0 + k * 1.0, 10.0 + k * 1.0, k * 0.45, (k + 1) * 0.45
    loft('tier_top', [(r0, r0, z1), (r1, r1, z1)], M['planks'], 40, 30, 1.0, a0=gap, a1=2 * math.pi - gap, inward=False)
    loft('tier_riser', [(r0, r0, z0), (r0, r0, z1)], M['skirt'] if k == 0 else M['planks'], 40, 30, 1.0, a0=gap, a1=2 * math.pi - gap, inward=False)
loft('tier_back', [(15.0, 15.0, 2.7), (15.0, 15.0, 0.0)], M['planks'], 40, 30, 1.0, a0=gap, a1=2 * math.pi - gap, inward=False)
# Entrance curtains (east).
for y in (-2.6, 2.6):
    bm = bmesh.new()
    pts = []
    for i in range(13):
        yy = y - 1.0 + 2.0 * i / 12
        xx = 15.2 + (0.12 if i % 2 else -0.06)
        pts.append((bm.verts.new((xx, yy, 0.0)), bm.verts.new((xx, yy, 4.0))))
    for i in range(12):
        bm.faces.new([pts[i][0], pts[i + 1][0], pts[i + 1][1], pts[i][1]])
    o = lib.mesh_object('entrance_curtain', bm, M['skirt'], STATIC)
    lib.box_uv(o, 1.0)
lib.box('entrance_header', (15.0, -3.8, 4.0), (15.4, 3.8, 4.6), M['paint'], STATIC, 1.0)

# ------------------------------------------------------------------ rigging: platforms and the wire
for s in (-1, 1):
    x = s * 7.3
    lib.cylinder('platform_mast', (x + s * 0.55, 0, 0), 0.1, 6.9, M['metal'], STATIC, 10)
    lib.box('platform', (x - 0.6, -0.6, 5.92), (x + 0.6, 0.6, 6.0), M['planks'], STATIC, 0.6)
    for (a, b) in (((x - 0.6, -0.6), (x - 0.6, 0.6)), ((x + 0.6, -0.6), (x + 0.6, 0.6)), ((x - 0.6, s * 0.6), (x + 0.6, s * 0.6))):
        pass
    # Railing on the three outer sides.
    for (p0, p1) in (((x - 0.6, -0.6), (x + 0.6, -0.6)), ((x - 0.6, 0.6), (x + 0.6, 0.6)), ((x + s * 0.6, -0.6), (x + s * 0.6, 0.6))):
        rod('rail', (p0[0], p0[1], 7.0), (p1[0], p1[1], 7.0), 0.025, M['metal'])
        rod('rail', (p0[0], p0[1], 6.5), (p1[0], p1[1], 6.5), 0.02, M['metal'])
    for (px, py) in ((x - 0.6, -0.6), (x - 0.6, 0.6), (x + 0.6, -0.6), (x + 0.6, 0.6)):
        rod('rail_post', (px, py, 6.0), (px, py, 7.0), 0.025, M['metal'])
    # Rope ladder on the outer side.
    lx = x + s * 0.75
    for yy in (-0.22, 0.22):
        rod('ladder_rope', (lx, yy, 0.0), (lx, yy, 6.0), 0.015, M['rope'])
    for k in range(20):
        z = 0.3 + k * 0.29
        rod('ladder_rung', (lx, -0.22, z), (lx, 0.22, z), 0.018, M['grip'])
    # Guy wires.
    for gy in (-3.0, 3.0):
        rod('guy', (x + s * 0.55, 0, 6.8), (x + s * 3.0, gy, 0.0), 0.008, M['wire'])
    lib.empty(f'spot_platform_{"left" if s < 0 else "right"}', (x, 0, 6.0), -s * math.pi / 2, POINTS)
wire = rod('high_wire', (-6.7, 0, 6.02), (6.7, 0, 6.02), 0.012, M['wire'], NODES)
for i, x in enumerate((-3.6, 0.4, 3.9)):
    lib.empty(f'acrobat_start_{i + 1}', (x, 0, 6.03), 0.0, POINTS)

# ------------------------------------------------------------------ the safety net on wheels (its own node, pivot on the floor at its centre)
parts = []
W, D, H = 3.6, 3.0, 1.45
for (p0, p1) in (((-W / 2, -D / 2), (W / 2, -D / 2)), ((-W / 2, D / 2), (W / 2, D / 2)), ((-W / 2, -D / 2), (-W / 2, D / 2)), ((W / 2, -D / 2), (W / 2, D / 2))):
    parts.append(rod('net_frame', (p0[0], p0[1], H), (p1[0], p1[1], H), 0.035, M['metal'], NODES))
for (px, py) in ((-W / 2, -D / 2), (-W / 2, D / 2), (W / 2, -D / 2), (W / 2, D / 2)):
    parts.append(rod('net_leg', (px, py, 0.12), (px, py, H), 0.03, M['metal'], NODES))
    parts.append(lib.cylinder('caster', (px, py - 0.05, 0.06), 0.06, 0.04, M['rubber'], NODES, 8))
    parts[-1].matrix_world = Matrix.Translation((px, py, 0.06)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((-px, -py, -0.06))
for x in (-W / 2, W / 2):
    parts.append(rod('net_brace', (x, -D / 2, 0.25), (x, D / 2, 0.25), 0.025, M['metal'], NODES))
bm = bmesh.new()
lay = bm.loops.layers.uv.new(lib.UV)
nx, ny = 14, 12
grid = [[bm.verts.new(((-W / 2 + W * i / nx) * 0.985, (-D / 2 + D * j / ny) * 0.985,
                       H - 0.42 * math.sin(math.pi * i / nx) * math.sin(math.pi * j / ny))) for i in range(nx + 1)] for j in range(ny + 1)]
for j in range(ny):
    for i in range(nx):
        f = bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
        for l in f.loops:
            l[lay].uv = (l.vert.co.x / 0.5, l.vert.co.y / 0.5)
parts.append(lib.mesh_object('net_mesh', bm, M['net'], NODES))
for (p0, p1) in (((-W / 2, -D / 2), (W / 2, -D / 2)), ((-W / 2, D / 2), (W / 2, D / 2)), ((-W / 2, -D / 2), (-W / 2, D / 2)), ((W / 2, -D / 2), (W / 2, D / 2))):
    parts.append(rod('net_border', (p0[0] * 0.985, p0[1] * 0.985, H + 0.01), (p1[0] * 0.985, p1[1] * 0.985, H + 0.01), 0.022, M['rope'], NODES))
net = lib.join(parts, 'safety_net')
lib.empty('net_limit_left', (-4.6, 0, 0), 0.0, POINTS)
lib.empty('net_limit_right', (4.6, 0, 0), 0.0, POINTS)

# ------------------------------------------------------------------ ropes, pulleys and handles
PL, PR = Vector((-7.6, -2.6, 0.55)), Vector((7.6, -2.6, 0.55))
AL, AR = Vector((-W / 2, 0, H)), Vector((W / 2, 0, H))
HL, HR = Vector((-0.45, -7.0, 0.95)), Vector((0.45, -7.0, 0.95))
for side, P, Att, Hd in (('left', PL, AL, HL), ('right', PR, AR, HR)):
    _, l1 = rope_node(f'net_line_{side}', P, Att)
    _, l2 = rope_node(f'net_rope_{side}', P, Hd)
    lib.cylinder('pulley_stake', (P.x, P.y, 0.0), 0.04, P.z + 0.1, M['metal'], STATIC, 8)
    wheel = lib.cylinder('pulley_wheel', (0, 0, 0), 0.09, 0.04, M['metal'], STATIC, 12)
    wheel.matrix_world = Matrix.Translation(P) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -0.02))
    g = lib.cylinder(f'rope_handle_{side}', (0, 0, -0.14), 0.024, 0.28, M['grip'], NODES, 10)
    g.matrix_world = Matrix.Translation(Hd) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    lib.empty(f'pulley_{side}', tuple(P), 0.0, POINTS)
    print(f'ROPE {side}: net_line rest {l1:.3f} m, net_rope rest {l2:.3f} m')
lib.empty('seat_ringside', (0.0, -7.6, 0.0), 0.0, POINTS)

# ------------------------------------------------------------------ dressing
for k, a in enumerate((200, 250, 290, 340, 115, 65)):
    r = 7.6
    x, y = r * math.cos(math.radians(a)), r * math.sin(math.radians(a))
    if k < 4:
        dr = lib.cylinder('pedestal', (x, y, 0), 0.45, 0.7, M['paint'], STATIC, 16, 1.0)
        # Map the side to the star band.
        me = dr.data
        bm = bmesh.new()
        bm.from_mesh(me)
        lay = bm.loops.layers.uv.get(lib.UV)
        uv = lib.atlas_uv(REG['drum'], A)
        for f in bm.faces:
            for l in f.loops:
                if abs(f.normal.z) > 0.5:
                    l[lay].uv = lib.atlas_uv(REG['solid_3'], A)[0]
                else:
                    ang = (math.atan2(l.vert.co.y - y, l.vert.co.x - x) + math.pi) / (2 * math.pi)
                    l[lay].uv = (uv[0][0] + (uv[1][0] - uv[0][0]) * ((ang * 2) % 1.0), uv[0][1] + (uv[2][1] - uv[0][1]) * (l.vert.co.z / 0.7))
        bm.to_mesh(me)
        bm.free()
for (x, y, r) in ((13.4, -4.0, 0.3), (13.9, -3.2, 1.2), (13.2, 4.2, 0.8)):
    prop('crate', (x, y, 0), r)
for (x, y) in ((12.8, -5.2), (12.6, 5.4)):
    prop('barrel', (x, y, 0), random.uniform(0, 6))
prop('ladder', (-8.8, 2.2, 0), 0.4)
for k in range(6):
    a = math.radians(30 + k * 60)
    prop('lamp', (12.0 * math.cos(a), 11.0 * math.sin(a), 9.3), 0.0)
    rod('lamp_cord', (12.0 * math.cos(a), 11.0 * math.sin(a), 9.25), (12.0 * math.cos(a), 11.0 * math.sin(a), 9.6), 0.008, M['rubber'])
# Two follow spots on stands aimed at the wire.
for (x, y) in ((-5.5, -12.0), (5.5, -12.0)):
    rod('spot_stand', (x, y, 2.7), (x, y, 4.6), 0.04, M['metal'])
    aim = (Vector((x * 0.3, 0, 6.0)) - Vector((x, y, 4.8))).normalized()
    body = lib.cylinder('spot_body', (0, 0, 0), 0.2, 0.7, M['rubber'], STATIC, 12)
    body.matrix_world = Matrix.Translation((x, y, 4.8)) @ aim.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    lensd = lib.cylinder('spot_lens', (0, 0, 0.7), 0.17, 0.02, M['lens'], STATIC, 12)
    lensd.matrix_world = body.matrix_world.copy()
# Bunting from each king pole to the quarter poles.
for kx in (-9.0, 9.0):
    for k in range(8):
        a = math.radians(22.5 + k * 45)
        qx, qy = 8.3 * math.cos(a), 8.3 * math.sin(a)
        if (qx > 0) != (kx > 0):
            continue
        p0, p1 = Vector((kx, 0, 9.0)), Vector((qx, qy, 8.6))
        rod('bunting_line', p0, p1, 0.006, M['rope'])
        bm = bmesh.new()
        lay = bm.loops.layers.uv.new(lib.UV)
        n = 10
        for i in range(n):
            t0, t1 = (i + 0.1) / n, (i + 0.9) / n
            sag = lambda t: -0.6 * math.sin(math.pi * t)
            a3 = p0.lerp(p1, t0) + Vector((0, 0, sag(t0)))
            b3 = p0.lerp(p1, t1) + Vector((0, 0, sag(t1)))
            c3 = (a3 + b3) / 2 + Vector((0, 0, -0.32))
            uv = lib.atlas_uv(REG[f'solid_{(i + k) % 6}'], A)[0]
            for vs in ([a3, b3, c3], [c3, b3, a3]):
                f = bm.faces.new([bm.verts.new(v) for v in vs])
                for l in f.loops:
                    l[lay].uv = (uv[0] + 0.01, uv[1] + 0.01)
        lib.mesh_object('bunting', bm, M['paint'], STATIC)

# ------------------------------------------------------------------ finish
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects))
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
lib.merge_by_material(list(STATIC.all_objects), 'sirk', STATIC)


def limit(img):
    n = img.name.lower()
    if n.startswith(('canvas', 'aerial_wood_snips', 'brown_planks')):
        return 512 if 'nor' in n else (256 if img.colorspace_settings.name == 'Non-Color' else 1024)
    if n.startswith(('sirk', 'net', 'curb', 'pole')):
        return 1024 if n.startswith('sirk') else 512
    return 256 if 'nor' in n else (128 if img.colorspace_settings.name == 'Non-Color' else 512)


lib.strip_normal_maps(('wooden_crate', 'Barrel_01', 'hanging_industrial', 'wooden_ladder'))
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
    for p, e in (((0, 0, 12), 2500), ((-8, -8, 9), 900), ((8, -8, 9), 900), ((0, 9, 9), 900)):
        L = bpy.data.objects.new('preview_light', bpy.data.lights.new('preview_light', 'POINT'))
        L.data.energy = e
        L.data.shadow_soft_size = 1.0
        L.location = p
        bpy.context.scene.collection.objects.link(L)
    hdri = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
    views = [
        ('seat', (0.0, -7.6, 1.2), (0.0, 0.0, 3.6), 14),
        ('handles', (0.0, -7.75, 1.25), (0.0, -6.0, 0.4), 18),
        ('wide', (-13.0, -10.0, 4.5), (2.0, 2.0, 3.0), 14),
        ('platform', (-7.3, 0.4, 7.6), (6.0, -1.0, 3.0), 16),
    ]
    lib.render_views(views, PREVIEW, 'sirk', hdri, size=(960, 540), samples=24)
print('DONE', OUT)
