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
# Folder with the raw (unpacked) people from pose.py: spectator_man_raw.glb, spectator_woman_raw.glb,
# spectator_man_impostor.png, spectator_woman_impostor.png, net_crew_raw.glb. Without it the house stays empty.
CROWD = ARGS[ARGS.index('--crowd') + 1] if '--crowd' in ARGS else ''
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
# Metals at 0.6: the tent has no environment map, and a full metal shows black there.
M['metal'] = lib.flat('rig_metal', (0.6, 0.6, 0.62), rough=0.35, metal=0.6)
M['wire'] = lib.flat('wire_steel', (0.75, 0.75, 0.78), rough=0.25, metal=0.6)
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


# ------------------------------------------------------------------ a full house, bulbs, the band, the net crew, contact shadows
M['bulb'] = lib.flat('bulb_warm', (1.0, 0.78, 0.24), rough=0.3, emissive=(1.0, 0.72, 0.2))
lib._principled(M['bulb']).inputs['Emission Strength'].default_value = 4.0
M['cord'] = lib.flat('bulb_cord', (0.05, 0.04, 0.035), rough=0.7)
M['brass'] = lib.flat('band_brass', (0.86, 0.66, 0.3), rough=0.3, metal=0.55)
M['drumhead'] = lib.flat('drum_head', (0.92, 0.88, 0.78), rough=0.6)


def catenary(p0, p1, sag, step=0.55):
    n = max(2, int((p1 - p0).length / step))
    return [p0.lerp(p1, t) + Vector((0, 0, -sag * 4 * t * (1 - t))) for t in (i / n for i in range(n + 1))]


def tube_path(bm, pts, r, sides=3):
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = d.orthogonal().normalized()
        b = d.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))


def bulb(bm, c, s=0.035):
    v = [bm.verts.new(c + Vector(o) * s) for o in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1.3), (0, 0, -1.5))]
    for a, b in ((0, 2), (2, 1), (1, 3), (3, 0)):
        bm.faces.new((v[a], v[b], v[4]))
        bm.faces.new((v[b], v[a], v[5]))


# Bulb strings: sixteen lines from the king poles down to the wall top, a garland round the wall,
# a ring of swags between the quarter poles over the ring. One draw for the bulbs, one for the cords.
bulbs, cords = bmesh.new(), bmesh.new()
lines = []
for k in range(16):
    a = 2 * math.pi * (k + 0.5) / 16
    w = Vector((17.6 * math.cos(a), 17.6 * math.sin(a), 5.35))
    top = Vector((8.6 if math.cos(a) >= 0 else -8.6, 0.25 * math.sin(a), 13.4))
    lines.append((top, w, 0.9))
    a2 = 2 * math.pi * (k + 1.5) / 16
    lines.append((w, Vector((17.6 * math.cos(a2), 17.6 * math.sin(a2), 5.35)), 0.55))
for k in range(8):
    a, a2 = math.radians(22.5 + k * 45), math.radians(22.5 + (k + 1) * 45)
    lines.append((Vector((8.15 * math.cos(a), 8.15 * math.sin(a), 10.7)), Vector((8.15 * math.cos(a2), 8.15 * math.sin(a2), 10.7)), 0.6))
n_bulbs = 0
for p0, p1, sag in lines:
    pts = catenary(p0, p1, sag)
    tube_path(cords, pts, 0.008)
    for p in pts[1:-1]:
        bulb(bulbs, p + Vector((0, 0, -0.07)))
        n_bulbs += 1
lib.mesh_object('bulb_string', bulbs, M['bulb'], NODES)
lib.mesh_object('bulb_cords', cords, M['cord'], STATIC)
print('BULBS', n_bulbs)

# Contact shadows: soft dark discs where things stand on the sawdust (one alpha-blended draw).
shadow_img = bpy.data.images.new('contact_shadow', 64, 64, alpha=True)
px = []
for j in range(64):
    for i in range(64):
        r = math.hypot(i - 31.5, j - 31.5) / 31.5
        px += [0.0, 0.0, 0.0, max(0.0, 1 - r) ** 1.6 * 0.75]
shadow_img.pixels = px
shadow_img.pack()
M['shadow'] = lib.new_material('contact_shadow')
_b = lib._principled(M['shadow'])
_t = M['shadow'].node_tree.nodes.new('ShaderNodeTexImage')
_t.image = shadow_img
M['shadow'].node_tree.links.new(_t.outputs['Color'], _b.inputs['Base Color'])
M['shadow'].node_tree.links.new(_t.outputs['Alpha'], _b.inputs['Alpha'])
_b.inputs['Roughness'].default_value = 1.0
M['shadow'].surface_render_method = 'BLENDED'


def shadow_quad(bm, uv, c, rx, ry=None, z=0.006):
    ry = rx if ry is None else ry
    vs = [bm.verts.new((c[0] + sx * rx, c[1] + sy * ry, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uv].uv = t


sh = bmesh.new()
shuv = sh.loops.layers.uv.new(lib.UV)
for x in (-9.0, 9.0):
    shadow_quad(sh, shuv, (x, 0), 0.8)
for k in range(8):
    a = math.radians(22.5 + k * 45)
    shadow_quad(sh, shuv, (8.3 * math.cos(a), 8.3 * math.sin(a)), 0.5)
for k, a in enumerate((200, 250, 290, 340)):
    shadow_quad(sh, shuv, (7.6 * math.cos(math.radians(a)), 7.6 * math.sin(math.radians(a))), 0.85)
for (x, y) in ((13.4, -4.0), (13.9, -3.2), (13.2, 4.2), (12.8, -5.2), (12.6, 5.4)):
    shadow_quad(sh, shuv, (x, y), 0.7)
for s_ in (-1, 1):
    shadow_quad(sh, shuv, (s_ * 7.85, 0), 0.45)
# a dark band where the ring curb meets the sawdust, inside and out
for k in range(64):
    a0, a1 = 2 * math.pi * k / 64, 2 * math.pi * (k + 1) / 64
    for r0, r1 in ((6.05, 6.4), (6.85, 7.25)):
        vs = [sh.verts.new((r * math.cos(a), r * math.sin(a), 0.006)) for r, a in ((r0, a0), (r1, a0), (r1, a1), (r0, a1))]
        f = sh.faces.new(vs)
        inner = r0 < 6.5
        for l, (rr, aa) in zip(f.loops, ((r0, a0), (r1, a0), (r1, a1), (r0, a1))):
            t = (rr - r0) / (r1 - r0)
            l[shuv].uv = (0.5, 0.5 + 0.5 * (t if inner else 1 - t))
lib.mesh_object('contact_shadows', sh, M['shadow'], STATIC)

# The band on a little stand at the north side of the ring: a red skirted platform, a bass drum
# with a painted head, a snare on its stand, a cymbal, two chairs and a brass rail.
bx, by = 0.0, 7.75
lib.box('bandstand', (bx - 1.4, by - 0.65, 0.0), (bx + 1.4, by + 0.65, 0.42), M['skirt'], STATIC, 1.0)
lib.box('bandstand_top', (bx - 1.45, by - 0.7, 0.42), (bx + 1.45, by + 0.7, 0.46), M['planks'], STATIC, 1.0)
for xx in (bx - 1.4, bx - 0.47, bx + 0.47, bx + 1.4):
    rod('band_rail_post', (xx, by + 0.65, 0.46), (xx, by + 0.65, 1.3), 0.018, M['brass'])
rod('band_rail', (bx - 1.4, by + 0.65, 1.3), (bx + 1.4, by + 0.65, 1.3), 0.02, M['brass'])
drum = lib.cylinder('bass_drum', (bx - 0.55, by - 0.05, 0.46), 0.33, 0.36, M['skirt'], STATIC, 20)
drum.matrix_world = Matrix.Translation((bx - 0.55, by - 0.05, 0.46 + 0.36)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((-(bx - 0.55), -(by - 0.05), -(0.46 + 0.36)))
for yy in (by - 0.24, by + 0.13):
    head = lib.cylinder('bass_drum_head', (bx - 0.55, yy, 0.82), 0.335, 0.012, M['drumhead'], STATIC, 20)
    head.matrix_world = Matrix.Translation((bx - 0.55, yy, 0.82)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((-(bx - 0.55), -yy, -0.82))
lib.cylinder('snare', (bx + 0.25, by - 0.15, 1.02), 0.18, 0.14, M['drumhead'], STATIC, 18)
lib.cylinder('snare_shell', (bx + 0.25, by - 0.15, 1.025), 0.182, 0.13, M['brass'], STATIC, 18)
for a in (0.0, 2.1, 4.2):
    rod('snare_stand', (bx + 0.25, by - 0.15, 1.0), (bx + 0.25 + 0.22 * math.cos(a), by - 0.15 + 0.22 * math.sin(a), 0.46), 0.01, M['metal'])
rod('cymbal_stand', (bx + 0.85, by + 0.1, 0.46), (bx + 0.85, by + 0.1, 1.35), 0.012, M['metal'])
lib.cylinder('cymbal', (bx + 0.85, by + 0.1, 1.35), 0.22, 0.008, M['brass'], STATIC, 20)
for xx in (bx - 0.05, bx + 0.6):
    lib.box('band_chair_seat', (xx - 0.2, by + 0.2, 0.88), (xx + 0.2, by + 0.55, 0.92), M['grip'], STATIC, 1.0)
    lib.box('band_chair_back', (xx - 0.2, by + 0.52, 0.92), (xx + 0.2, by + 0.56, 1.32), M['grip'], STATIC, 1.0)
    for (cx, cy) in ((xx - 0.18, by + 0.22), (xx + 0.18, by + 0.22), (xx - 0.18, by + 0.53), (xx + 0.18, by + 0.53)):
        rod('band_chair_leg', (cx, cy, 0.46), (cx, cy, 0.88), 0.015, M['grip'])
lib.empty('drummer_seat', (bx - 0.05, by + 0.37, 0.92), math.pi, POINTS)

# The house: every other seat of the front tier (nearest the ring) a seated person, all the rest
# pictures on upright quads facing the ring; each person gets a slight colour (vertex colour,
# glTF COLOR_0) so the house is not one costume. Seats leave the performers' entrance open.
def seat_places(rng):
    out = []
    for k in range(6):
        r = 9.0 + k + 0.32
        z = (k + 1) * 0.45
        a = gap + 0.06
        while a < 2 * math.pi - gap - 0.06:
            if rng.random() < 0.82:
                out.append((k, r, a + rng.uniform(-0.01, 0.01), z))
            a += 0.6 / r
    return out


TINTS = [(1.0, 1.0, 1.0), (0.82, 0.88, 1.0), (1.0, 0.86, 0.78), (0.78, 0.78, 0.8), (0.9, 1.0, 0.88), (1.0, 0.95, 0.82), (0.7, 0.62, 0.62)]


def set_tint(o, c):
    me = o.data
    attr = me.color_attributes.new('tint', 'FLOAT_COLOR', 'CORNER')
    for d in attr.data:
        d.color = (*c, 1.0)
    me.color_attributes.active_color = attr


if CROWD:
    rng = random.Random(21)
    places = seat_places(rng)
    templates = []
    for v in ('man', 'woman'):
        objs = lib.import_gltf(os.path.join(CROWD, f'spectator_{v}_raw.glb'), LIB)
        t = lib.join(list(objs.values()), f'spectator_{v}_template')
        templates.append(t)
    near = []
    # every other seat of the front tier is a seated person (budget), the rest join the pictures
    near_places = [p for i, p in enumerate(places) if p[0] == 0 and i % 2 == 0]
    far_places = [p for p in places if p not in near_places]
    for (k, r, a, z) in near_places:
        t = templates[rng.randrange(2)]
        o = bpy.data.objects.new('crowd_near_part', t.data.copy())
        NODES.objects.link(o)
        sc_ = rng.uniform(0.95, 1.05)
        o.matrix_world = Matrix.Translation((r * math.cos(a), r * math.sin(a), z)) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z') @ Matrix.Scale(sc_, 4)
        set_tint(o, TINTS[rng.randrange(len(TINTS))])
        near.append(o)
    lib.apply(near)
    crowd_near = lib.join(near, 'crowd_near')
    for t in templates:
        bpy.data.objects.remove(t, do_unlink=True)
    # far tiers: one atlas of the two pictures (man left, woman right)
    ims = [bpy.data.images.load(os.path.join(CROWD, f'spectator_{v}_impostor.png')) for v in ('man', 'woman')]
    import numpy as np
    halves = [np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4) for im in ims]
    atlas_img = bpy.data.images.new('crowd_far_atlas', 512, 512, alpha=True)
    atlas_img.pixels = np.concatenate(halves, axis=1).ravel().tolist()
    atlas_img.pack()
    M['crowd_far'] = lib.new_material('crowd_far')
    _b = lib._principled(M['crowd_far'])
    _t = M['crowd_far'].node_tree.nodes.new('ShaderNodeTexImage')
    _t.image = atlas_img
    M['crowd_far'].node_tree.links.new(_t.outputs['Color'], _b.inputs['Base Color'])
    _r = M['crowd_far'].node_tree.nodes.new('ShaderNodeMath')
    _r.operation = 'ROUND'
    M['crowd_far'].node_tree.links.new(_t.outputs['Alpha'], _r.inputs[0])
    M['crowd_far'].node_tree.links.new(_r.outputs[0], _b.inputs['Alpha'])
    _b.inputs['Roughness'].default_value = 0.9
    M['crowd_far'].surface_render_method = 'DITHERED'
    fbm = bmesh.new()
    fuv = fbm.loops.layers.uv.new(lib.UV)
    fcol = fbm.loops.layers.float_color.new('tint')
    QW, QH, QS = 0.734, 1.469, 0.471
    n_far = 0
    for (k, r, a, z) in far_places:
        v = rng.randrange(2)
        sc_ = rng.uniform(0.94, 1.06)
        c = Vector((r * math.cos(a), r * math.sin(a), z))
        side = Vector((-math.sin(a), math.cos(a), 0))   # along the tier
        corners = [c + side * (sx * QW / 2 * sc_) + Vector((0, 0, (sz * QH - QS) * sc_)) for sx, sz in ((-1, 0), (1, 0), (1, 1), (-1, 1))]
        f = fbm.faces.new([fbm.verts.new(p) for p in corners])
        u0, u1 = (0.0, 0.5) if v == 0 else (0.5, 1.0)
        if rng.random() < 0.5:
            u0, u1 = u1, u0
        tint = TINTS[rng.randrange(len(TINTS))]
        for l, (uu, vv) in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
            l[fuv].uv = (uu, vv)
            l[fcol] = (*tint, 1.0)
        n_far += 1
    bmesh.ops.recalc_face_normals(fbm, faces=fbm.faces)
    # the quads face the ring's middle (normal toward the centre)
    for f in fbm.faces:
        cc = f.calc_center_median()
        if f.normal.dot(Vector((-cc.x, -cc.y, 0))) < 0:
            f.normal_flip()
    o = lib.mesh_object('crowd_far', fbm, M['crowd_far'], NODES)
    o.data.color_attributes.active_color = o.data.color_attributes['tint']
    print('HOUSE near', len(near), 'far', n_far)
    # The net crew: four circus hands at the net's corners, children of safety_net so they move with it.
    objs = lib.import_gltf(os.path.join(CROWD, 'net_crew_raw.glb'), LIB)
    crew = lib.join(list(objs.values()), 'net_crew_template')
    for i, (cx, cy, rot) in enumerate(((-W / 2 - 0.55, -D / 2 + 0.35, math.pi / 2), (-W / 2 - 0.55, D / 2 - 0.35, math.pi / 2),
                                        (W / 2 + 0.55, -D / 2 + 0.35, -math.pi / 2), (W / 2 + 0.55, D / 2 - 0.35, -math.pi / 2))):
        o = bpy.data.objects.new(f'net_crew_{i + 1}', crew.data.copy())
        NODES.objects.link(o)
        o.matrix_world = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(rot, 4, 'Z')
        o.parent = net
        o.matrix_parent_inverse = net.matrix_world.inverted()
        csh = bmesh.new()
        cuv = csh.loops.layers.uv.new(lib.UV)
        shadow_quad(csh, cuv, (0, 0), 0.42, 0.55, 0.008)
        so = lib.mesh_object(f'net_crew_{i + 1}_shadow', csh, M['shadow'], NODES)
        so.parent = o
    bpy.data.objects.remove(crew, do_unlink=True)
    # the net's own shadow on the floor, moving with it
    nsh = bmesh.new()
    nuv = nsh.loops.layers.uv.new(lib.UV)
    shadow_quad(nsh, nuv, (0, 0), W / 2 + 0.3, D / 2 + 0.3, 0.007)
    so = lib.mesh_object('safety_net_shadow', nsh, M['shadow'], NODES)
    so.parent = net
else:
    print('HOUSE empty: no --crowd folder')

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
lib.export_glb(OUT, EXPORT, vertex_color='ACTIVE')
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
    # The tent as the game lights it: dark, the bulbs and one warm follow spot doing the work.
    sc = bpy.context.scene
    for o in list(sc.objects):
        if o.name.startswith('preview_light'):
            o.data.energy *= 0.12
    spot = bpy.data.objects.new('follow_spot', bpy.data.lights.new('follow_spot', 'SPOT'))
    spot.data.energy = 9000
    spot.data.color = (1.0, 0.85, 0.63)
    spot.data.spot_size = math.radians(14)
    spot.data.spot_blend = 0.6
    spot.location = (7.3, -12.0, 9.0)
    spot.rotation_euler = (Vector((0, 0, 6.0)) - Vector(spot.location)).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(spot)
    night = [
        ('night_wire', (-5.6, 0.0, 7.57), (6.0, 0.0, 3.2), 14),
        ('night_house', (-3.0, -2.0, 7.57), (2.0, 12.0, 2.0), 14),
        ('night_seat', (0.0, -7.6, 1.2), (0.0, 4.0, 3.0), 14),
    ]
    lib.render_views(night, PREVIEW, 'sirk', hdri, size=(960, 540), samples=24, world_strength=0.04, sun_energy=0.0)
print('DONE', OUT)
