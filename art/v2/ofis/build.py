"""Builds the leader's office and the press room next to it, where the leader
repeats the parrot's word into the microphone.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/ofis/build.py -- <out.glb> [--preview <dir>]

Layout (metres, Blender: X east, Y north, Z up; north is -Z in three.js):
  press room X 0..12, Y 0..10, ceiling 4.2; stage X 3..9, Y 7.6..10, 0.3 high,
  podium at (6, 8.7) facing the rows (south); doors south (main) and west (office).
  office X -8..0, Y 3..11, ceiling 3.6; desk at (-4, 8.45) facing south, three
  windows north looking over the neighbourhood.
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
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
random.seed(9)

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')
POINTS = lib.collection('points')

ATL = json.load(open(os.path.join(C, 'gen', 'ofis.json')))
A, REG = ATL['size'], ATL['regions']
M = {}
M['parquet'] = lib.pbr('parquet', 'herringbone_parquet', 1024, 512)
M['plaster'] = lib.pbr('office_plaster', 'plastered_wall_04', 1024, 256, tint=(0.96, 0.93, 0.86))
M['press_wall'] = lib.pbr('press_wall', 'plastered_wall_04', 1024, 256, tint=(0.72, 0.78, 0.86))
M['ceiling'] = lib.pbr('ceiling', 'plastered_wall_04', 512, 0, tint=(1.0, 1.0, 0.98), rough=0.9, metal=0.0)
M['panel'] = lib.pbr('wood_panel', 'dark_paneled_wood', 1024, 512)
M['walnut'] = lib.pbr('walnut', 'walnut_veneer', 1024, 256, rough=0.35)
M['carpet'] = lib.pbr('carpet', 'velour_velvet', 512, 256, tint=(0.22, 0.26, 0.36))
M['stage'] = lib.pbr('stage_carpet', 'velour_velvet', 512, 256, tint=(0.12, 0.16, 0.3))
M['curtain'] = lib.pbr('curtain', 'velour_velvet', 512, 256, tint=(0.45, 0.08, 0.1))
M['leather'] = lib.pbr('leather', 'brown_leather', 512, 256)
M['marble'] = lib.pbr('marble', 'marble_01', 512, 256)
M['prints'] = lib.textured('prints', os.path.join(C, 'gen', 'ofis.png'), rough=0.6)
M['screens'] = lib.glowing('screens', os.path.join(C, 'gen', 'ofis.png'), 1.4)
M['view'] = lib.glowing('window_view', os.path.join(C, 'gen', 'window_view.png'), 1.0, max_size=1024)
M['light'] = lib.flat('ceiling_light', (1.0, 0.97, 0.9), rough=0.9, emissive=(1.0, 0.95, 0.85))
M['lamp_shade'] = lib.flat('lamp_shade', (0.05, 0.3, 0.12), rough=0.15, emissive=(0.25, 0.6, 0.3))
M['brass'] = lib.flat('brass', (0.72, 0.55, 0.3), rough=0.3, metal=1.0)
M['black'] = lib.flat('black_plastic', (0.025, 0.025, 0.028), rough=0.45)
M['metal'] = lib.flat('dark_metal', (0.12, 0.12, 0.13), rough=0.4, metal=0.8)
M['glass'] = lib.flat('pane', (0.7, 0.75, 0.8), rough=0.03, alpha=0.12)
M['trim'] = lib.flat('white_trim', (0.85, 0.84, 0.8), rough=0.5)
M['foam'] = lib.flat('mic_foam', (0.04, 0.04, 0.045), rough=0.95)


def region_quad(name, corners, region, mat=None, coll=STATIC):
    return lib.quad(name, corners, lib.atlas_uv(REG[region], A), mat or M['prints'], coll)


def facing_quad(name, centre, normal, w, h, region, mat=None, coll=STATIC):
    """A picture of w x h centred at `centre`, facing the 2D `normal`."""
    c, n = Vector(centre), Vector((normal[0], normal[1], 0)).normalized()
    d = Vector((-n.y, n.x, 0))
    up = Vector((0, 0, 1))
    pts = [c - d * w / 2 - up * h / 2, c + d * w / 2 - up * h / 2, c + d * w / 2 + up * h / 2, c - d * w / 2 + up * h / 2]
    return region_quad(name, pts, region, mat, coll)


def place(objs, loc, rot):
    T = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
    for o in objs:
        o.matrix_world = T @ o.matrix_world
    return objs


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
    j.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
    PROP[key] = j.data
    bpy.data.objects.remove(j, do_unlink=True)


def prop(key, loc, rot=0.0, coll=STATIC, name=None):
    o = bpy.data.objects.new(name or f'prop_{key}', PROP[key])
    coll.objects.link(o)
    o.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
    return o


load_prop('chair', 'GreenChair_01', ['GreenChair_01'], 700)
load_prop('armchair', 'ArmChair_01', ['ArmChair_01'], 1600)
load_prop('bust', 'marble_bust_01', ['marble_bust_01'], 1800)
load_prop('clock', 'wall_clock', ['wall_clock'], 700)
load_prop('plant', 'potted_plant_04', ['potted_plant_04'], 1600, scale=4.5)
load_prop('frame', 'standing_picture_frame_02', ['standing_picture_frame_02'], 600)
load_prop('pad', 'office_notepads', ['office_notepads_yellow_pad', 'office_notepads_yellow_sheet'], 60)
load_prop('flood', 'flood_lights', ['flood_lights_standing_single_stand', 'flood_lights_standing_single_bar',
                                    'flood_lights_standing_single_light', 'flood_lights_standing_single_support'], 1500)


# ------------------------------------------------------------------ rooms
def press_room():
    H = 4.2
    lib.box('press_floor', (0, 0, -0.01), (12, 10, 0.0), M['carpet'], STATIC, 1.5, faces=('+z',))
    lib.box('press_ceiling', (0, 0, H), (12, 10, H + 0.01), M['ceiling'], STATIC, 3.0, faces=('-z',))
    lib.wall('press_wall', (0, 10), (12, 10), 0, H, (0, -1), M['press_wall'], STATIC, uv_scale=2.0)
    lib.wall('press_wall', (0, 0), (12, 0), 0, H, (0, 1), M['press_wall'], STATIC, holes=[(5.2, 6.8, 0.0, 2.4)], uv_scale=2.0)
    lib.wall('press_wall', (12, 0), (12, 10), 0, H, (-1, 0), M['press_wall'], STATIC, uv_scale=2.0)
    lib.wall('press_wall', (0, 0), (0, 10), 0, H, (1, 0), M['press_wall'], STATIC, holes=[(7.2, 8.2, 0.0, 2.3)], uv_scale=2.0)
    # Skirting and a dado rail.
    for (a, b, n) in (((0, 9.98), (12, 9.98), (0, -1)), ((12 - 0.02, 0), (12 - 0.02, 10), (-1, 0)), ((0.02, 0), (0.02, 10), (1, 0)), ((0, 0.02), (12, 0.02), (0, 1))):
        lib.wall('skirting', a, b, 0, 0.12, n, M['walnut'], STATIC, uv_scale=1.0)
    # Ceiling light panels.
    for x in (2.5, 6.0, 9.5):
        for y in (2.5, 6.5):
            lib.box('press_light', (x - 0.6, y - 0.6, H - 0.02), (x + 0.6, y + 0.6, H - 0.005), M['light'], STATIC, 1.0, faces=('-z',))
    # Stage riser with a wood front.
    lib.box('stage', (3, 7.6, 0), (9, 10, 0.3), M['walnut'], STATIC, 1.0, faces=('-y', '+x', '-x'))
    lib.box('stage_top', (3, 7.6, 0.29), (9, 10, 0.3), M['stage'], STATIC, 1.5, faces=('+z',))
    lib.box('stage_step', (5.4, 7.2, 0), (6.6, 7.6, 0.15), M['walnut'], STATIC, 1.0)
    # Backdrop with the seal.
    region_quad('backdrop', [(2.5, 9.97, 0.3), (9.5, 9.97, 0.3), (9.5, 9.97, 3.9), (2.5, 9.97, 3.9)], 'backdrop')
    lib.box('backdrop_frame', (2.4, 9.94, 3.9), (9.6, 9.99, 4.0), M['walnut'], STATIC, 1.0)
    facing_quad('backdrop_seal', (6.0, 9.95, 2.75), (0, -1), 1.3, 1.3, 'seal')
    # Podium: walnut lectern with the seal plaque, slanted top.
    lib.box('podium_base', (5.5, 8.4, 0.3), (6.5, 9.0, 0.36), M['walnut'], STATIC, 0.6)
    lib.box('podium_body', (5.6, 8.48, 0.36), (6.4, 8.95, 1.3), M['walnut'], STATIC, 0.6)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((5.55, 8.42, 1.3), (6.45, 8.42, 1.3), (6.45, 9.0, 1.3), (5.55, 9.0, 1.3),
                                    (5.55, 8.42, 1.36), (6.45, 8.42, 1.36), (6.45, 9.0, 1.46), (5.55, 9.0, 1.46))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f])
    top = lib.mesh_object('podium_top', bm, M['walnut'], STATIC)
    lib.box_uv(top, 0.6)
    lib.box('podium_plaque', (5.8, 8.455, 0.7), (6.2, 8.48, 1.1), M['brass'], STATIC, 0.3)
    facing_quad('podium_seal', (6.0, 8.45, 0.9), (0, -1), 0.36, 0.36, 'seal')
    # Gooseneck microphone (its own node, pivot at the base on the podium top).
    parts = [lib.cylinder('mic_base', (0, 0, 0), 0.025, 0.03, M['metal'], NODES, 10)]
    pts = [Vector((0, 0, 0.03)), Vector((0, -0.02, 0.15)), Vector((0, -0.08, 0.25)), Vector((0, -0.16, 0.29))]
    for p0, p1 in zip(pts, pts[1:]):
        seg = lib.cylinder('mic_neck', (0, 0, 0), 0.007, (p1 - p0).length, M['metal'], NODES, 6, caps=False)
        seg.matrix_world = Matrix.Translation(p0) @ (p1 - p0).to_track_quat('Z', 'Y').to_matrix().to_4x4()
        parts.append(seg)
    head = bmesh.new()
    bmesh.ops.create_uvsphere(head, u_segments=10, v_segments=6, radius=0.03)
    bmesh.ops.scale(head, vec=(1.0, 1.4, 1.0), verts=head.verts)
    h = lib.mesh_object('mic_head', head, M['foam'], NODES)
    h.matrix_world = Matrix.Translation(pts[-1] + Vector((0, -0.03, -0.01)))
    lib.box_uv(h, 0.1)
    parts.append(h)
    mic = lib.join(parts, 'podium_mic')
    mic.matrix_world = Matrix.Translation((6.0, 8.72, 1.41))
    lib.empty('spot_mic_head', (6.0, 8.52, 1.69), math.pi, POINTS)
    # Flags on the stage.
    for x in (4.1, 7.9):
        flag((x, 9.55, 0.3))
    # TV screens on stands either side of the stage (screens are their own nodes).
    for side, x, reg in (('left', 1.6, 'tv_0'), ('right', 10.4, 'tv_1')):
        lib.box('tv_stand', (x - 0.05, 8.9, 0), (x + 0.05, 9.0, 1.4), M['metal'], STATIC, 0.5)
        lib.box('tv_foot', (x - 0.35, 8.7, 0), (x + 0.35, 9.2, 0.04), M['metal'], STATIC, 0.5)
        lib.box('tv_frame', (x - 0.68, 8.86, 1.25), (x + 0.68, 8.95, 2.05), M['black'], STATIC, 0.5)
        region_quad(f'tv_screen_{side}', [(x - 0.63, 8.855, 1.29), (x + 0.63, 8.855, 1.29), (x + 0.63, 8.855, 2.01), (x - 0.63, 8.855, 2.01)], reg, M['screens'], NODES)
    # Rows of press chairs facing the podium, an aisle in the middle.
    n = 0
    for row, y in enumerate((5.2, 4.0, 2.8)):
        for x in (2.6, 3.8, 5.0, 7.0, 8.2, 9.4):
            prop('chair', (x, y, 0), math.pi)
            if not (row == 0 and x == 5.0):
                n += 1
                lib.empty(f'spot_reporter_{n:02d}', (x, y, 0), 0.0, POINTS)
    # A chair at the side of the stage for the guest (the persona, with the parrot).
    prop('chair', (8.3, 8.4, 0.3), -math.pi / 2 + 0.38)
    # Broadcast cameras on tripods at the back, operators' spots behind them.
    for i, x in enumerate((3.2, 6.0, 8.8)):
        tv_camera((x, 1.0, 0), math.atan2(6.0 - x, 8.7 - 1.0))
        lib.empty(f'spot_camera_operator_{i + 1}', (x, 0.45, 0), 0.0, POINTS)
    # Two lights on stands aimed at the podium.
    prop('flood', (1.8, 6.6, 0), math.radians(-35))
    prop('flood', (10.2, 6.6, 0), math.radians(35))
    # Main doors (south) and the door to the office (west), each its own node pivoting on its hinge.
    for side, x0, x1, hinge in (('left', 5.2, 6.0, 5.2), ('right', 6.0, 6.8, 6.8)):
        leaf = door_leaf(f'press_door_{side}', abs(x1 - x0), 2.4)
        # Leaf built along +X from the hinge; mirror the right one.
        R = Matrix.Rotation(math.pi, 4, 'Z') if side == 'right' else Matrix.Identity(4)
        leaf.data.transform(R)
        leaf.matrix_world = Matrix.Translation((hinge, 0.02, 0))
    lib.box('press_door_frame', (5.1, -0.05, 0), (5.2, 0.1, 2.5), M['walnut'], STATIC, 0.5)
    lib.box('press_door_frame', (6.8, -0.05, 0), (6.9, 0.1, 2.5), M['walnut'], STATIC, 0.5)
    lib.box('press_door_frame', (5.1, -0.05, 2.4), (6.9, 0.1, 2.5), M['walnut'], STATIC, 0.5)
    lib.box('corridor', (4.9, -2.0, 0), (7.1, 0.0, 2.6), M['press_wall'], STATIC, 1.0, faces=('-y', '+x', '-x', '+z', '-z'), inward=True)
    lib.empty('spot_leader_podium', (6.0, 9.3, 0.3), math.pi, POINTS)
    lib.empty('spot_parrot_podium', (6.38, 8.6, 1.40), math.pi, POINTS)
    lib.empty('seat_press_front', (5.0, 5.2, 0), 0.0, POINTS)
    lib.empty('seat_stage_side', (8.3, 8.4, 0.3), math.pi / 2 + 0.38, POINTS)


def office():
    H = 3.6
    lib.box('office_floor', (-8, 3, -0.01), (0, 11, 0.0), M['parquet'], STATIC, 1.2, faces=('+z',))
    lib.box('office_ceiling', (-8, 3, H), (0, 11, H + 0.01), M['ceiling'], STATIC, 3.0, faces=('-z',))
    win = [(1.35, 2.65, 0.9, 3.0), (3.35, 4.65, 0.9, 3.0), (5.35, 6.65, 0.9, 3.0)]
    walls = [((-8, 11), (0, 11), (0, -1), win), ((-8, 3), (0, 3), (0, 1), []), ((-8, 3), (-8, 11), (1, 0), []),
             ((0, 3), (0, 11), (-1, 0), [(4.2, 5.2, 0.0, 2.3)])]
    for a, b, n, holes in walls:
        lib.wall('office_panel', a, b, 0, 1.0, n, M['panel'], STATIC, holes=[(u0, u1, zb, 1.0) if zb < 1.0 else (u0, u1, 1.0, 1.0) for (u0, u1, zb, zt) in holes if zb < 1.0], uv_scale=1.0)
        lib.wall('office_wall', a, b, 1.0, H, n, M['plaster'], STATIC, holes=[(u0, u1, max(1.0, zb), zt) for (u0, u1, zb, zt) in holes], uv_scale=2.0)
        lib.wall('dado_rail', a, b, 0.98, 1.06, n, M['walnut'], STATIC, holes=[(u0, u1, 0.98, 1.06) for (u0, u1, zb, zt) in holes if zb < 1.06], uv_scale=0.5)
    # Window reveals, sills and the view outside.
    for (u0, u1, zb, zt) in win:
        x0, x1 = -8 + u0, -8 + u1
        lib.box('reveal', (x0 - 0.02, 11.0, zb), (x1 + 0.02, 11.25, zb + 0.01), M['trim'], STATIC, 0.5, faces=('+z',))
        lib.box('reveal', (x0, 11.0, zt - 0.01), (x1, 11.25, zt), M['trim'], STATIC, 0.5, faces=('-z',))
        lib.box('reveal', (x0, 11.0, zb), (x0 + 0.01, 11.25, zt), M['trim'], STATIC, 0.5, faces=('+x',))
        lib.box('reveal', (x1 - 0.01, 11.0, zb), (x1, 11.25, zt), M['trim'], STATIC, 0.5, faces=('-x',))
        lib.box('sill', (x0 - 0.1, 10.88, zb - 0.05), (x1 + 0.1, 11.02, zb), M['trim'], STATIC, 0.5)
        # Sash bars and a faint pane.
        lib.box('sash', ((x0 + x1) / 2 - 0.025, 11.18, zb), ((x0 + x1) / 2 + 0.025, 11.22, zt), M['trim'], STATIC, 0.5)
        for zz in (zb + (zt - zb) / 3, zb + 2 * (zt - zb) / 3):
            lib.box('sash', (x0, 11.18, zz - 0.025), (x1, 11.22, zz + 0.025), M['trim'], STATIC, 0.5)
        lib.quad('pane', [(x0, 11.2, zb), (x1, 11.2, zb), (x1, 11.2, zt), (x0, 11.2, zt)], [(0, 0), (1, 0), (1, 1), (0, 1)], M['glass'], STATIC)
        # Curtains either side.
        for cx in (x0 - 0.22, x1 + 0.22):
            curtain((cx, 10.9, 0.0), 0.42, H - 0.15)
    lib.box('pelmet', (-7.9, 10.82, H - 0.35), (-0.1, 10.98, H - 0.1), M['walnut'], STATIC, 0.6)
    # The neighbourhood seen from up high, a few metres outside.
    lib.quad('outside_view', [(-14.0, 16.0, -3.0), (6.0, 16.0, -3.0), (6.0, 16.0, 7.0), (-14.0, 16.0, 7.0)],
             [(0, 0), (1, 0), (1, 1), (0, 1)], M['view'], STATIC)
    # Ceiling lights.
    for x, y in ((-6, 5.5), (-2, 5.5), (-4, 8.5)):
        lib.box('office_light', (x - 0.45, y - 0.45, H - 0.02), (x + 0.45, y + 0.45, H - 0.005), M['light'], STATIC, 1.0, faces=('-z',))
    # Rug.
    region_quad('rug', [(-6.4, 6.0, 0.004), (-1.6, 6.0, 0.004), (-1.6, 10.2, 0.004), (-6.4, 10.2, 0.004)], 'rug')
    # Executive desk.
    w = M['walnut']
    lib.box('desk_top', (-5.15, 7.95, 0.74), (-2.85, 8.95, 0.79), w, STATIC, 0.8)
    for x0 in (-5.08, -3.52):
        lib.box('desk_pedestal', (x0, 8.0, 0.0), (x0 + 0.6, 8.9, 0.74), w, STATIC, 0.8)
        for k in range(3):
            z = 0.12 + k * 0.2
            lib.box('drawer_pull', (x0 + 0.25, 7.98, z + 0.08), (x0 + 0.35, 8.0, z + 0.1), M['brass'], STATIC, 0.3)
    lib.box('desk_modesty', (-4.48, 8.0, 0.25), (-3.52, 8.04, 0.74), w, STATIC, 0.8)
    region_quad('nameplate', [(-4.35, 7.94, 0.795), (-3.65, 7.94, 0.795), (-3.65, 7.96, 0.865), (-4.35, 7.96, 0.865)], 'nameplate')
    lib.box('nameplate_back', (-4.36, 7.955, 0.79), (-3.64, 7.99, 0.87), M['brass'], STATIC, 0.3)
    # Poly Haven chairs face -Y as modelled.
    prop('armchair', (-4.0, 9.35, 0.0), 0.0)
    prop('chair', (-4.75, 7.0, 0.0), math.pi)
    prop('chair', (-3.25, 7.0, 0.0), math.pi)
    prop('pad', (-4.0, 8.4, 0.79), 0.1)
    prop('frame', (-3.15, 8.75, 0.79), math.radians(200))
    # Banker's lamp (shade is its own node so the game can light it).
    lib.cylinder('lamp_base', (-4.85, 8.65, 0.79), 0.08, 0.03, M['brass'], STATIC, 12)
    lib.cylinder('lamp_stem', (-4.85, 8.65, 0.82), 0.012, 0.3, M['brass'], STATIC, 8)
    sh = bmesh.new()
    bmesh.ops.create_cone(sh, cap_ends=True, segments=12, radius1=0.12, radius2=0.12, depth=0.36)
    bmesh.ops.rotate(sh, verts=sh.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.delete(sh, geom=[v for v in sh.verts if v.co.z < -0.01], context='VERTS')
    shade = lib.mesh_object('desk_lamp', sh, M['lamp_shade'], NODES)
    lib.box_uv(shade, 0.2)
    shade.matrix_world = Matrix.Translation((-4.85, 8.62, 1.06)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    # Telephone: body on the desk, handset its own node.
    lib.box('phone_body', (-3.42, 8.4, 0.79), (-3.18, 8.62, 0.86), M['black'], STATIC, 0.2)
    hs = lib.box('desk_phone_handset', (-0.11, -0.025, 0.0), (0.11, 0.025, 0.035), M['black'], NODES, 0.2)
    hs.matrix_world = Matrix.Translation((-3.3, 8.51, 0.86))
    # Built-in bookcases on the west wall.
    for y0 in (4.2, 6.2):
        bookcase((-7.98, y0), 1.6, 2.5)
    # Bust on a marble column, map on the south wall, clock over the press-room door, flags behind the desk.
    lib.box('column', (-7.55, 9.15, 0), (-7.05, 9.65, 1.15), M['marble'], STATIC, 0.6)
    prop('bust', (-7.3, 9.4, 1.15), -math.pi / 2)
    lib.box('map_frame', (-4.75, 3.0, 1.35), (-3.25, 3.05, 2.85), M['walnut'], STATIC, 0.5)
    region_quad('map', [(-3.32, 3.055, 1.42), (-4.68, 3.055, 1.42), (-4.68, 3.055, 2.78), (-3.32, 3.055, 2.78)], 'map')
    c = prop('clock', (0.0, 7.7, 2.75), 0.0)
    c.matrix_world = Matrix.Translation((-0.03, 7.7, 2.6)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
    for x in (-6.3, -1.7):
        flag((x, 10.55, 0.0))
    prop('plant', (-0.6, 10.4, 0.0), 0.3)
    prop('plant', (-7.4, 3.6, 0.0), 1.1)
    # The door between the rooms (pivot on its hinge, opens into the office).
    leaf = door_leaf('office_door', 1.0, 2.3)
    leaf.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
    leaf.matrix_world = Matrix.Translation((0.0, 7.2, 0.0))
    for y in (7.15, 8.2):
        lib.box('office_door_frame', (-0.1, y, 0), (0.1, y + 0.05, 2.35), M['walnut'], STATIC, 0.5)
    lib.box('office_door_frame', (-0.1, 7.15, 2.3), (0.1, 8.25, 2.38), M['walnut'], STATIC, 0.5)
    lib.box('door_reveal', (-0.1, 7.2, 0.0), (0.1, 8.2, 0.005), M['walnut'], STATIC, 0.5, faces=('+z',))
    lib.box('door_reveal', (-0.1, 7.2, 2.3), (0.1, 8.2, 2.31), M['walnut'], STATIC, 0.5, faces=('-z',))
    lib.box('door_reveal', (-0.1, 7.2, 0.0), (0.1, 7.21, 2.3), M['walnut'], STATIC, 0.5, faces=('+y',))
    lib.box('door_reveal', (-0.1, 8.19, 0.0), (0.1, 8.2, 2.3), M['walnut'], STATIC, 0.5, faces=('-y',))
    lib.empty('spot_leader_desk', (-4.0, 9.35, 0.0), math.pi, POINTS)
    lib.empty('seat_office_guest', (-4.75, 7.0, 0.0), 0.0, POINTS)
    lib.empty('spot_parrot_desk', (-3.0, 8.15, 0.79), math.pi, POINTS)


def door_leaf(name, w, h):
    """A panelled walnut door leaf along +X from its hinge at the origin, with a brass knob."""
    parts = [lib.box('leaf', (0, -0.02, 0), (w, 0.02, h), M['walnut'], NODES, 0.8)]
    for z0, z1 in ((0.2, 1.0), (1.2, h - 0.2)):
        for side in (-1, 1):
            parts.append(lib.box('panel', (0.12, side * 0.02 - 0.004, z0), (w - 0.12, side * 0.02 + 0.004, z1), M['walnut'], NODES, 0.8))
    for side in (-1, 1):
        parts.append(lib.cylinder('knob', (w - 0.1, side * 0.05, 1.0), 0.03, 0.05, M['brass'], NODES, 10))
    for p in parts[-2:]:
        p.matrix_world = Matrix.Translation((0, 0, 1.0)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -1.0))
    return lib.join(parts, name)


def flag(loc):
    """A flag on an indoor pole: brass finial, cloth hanging in folds (fictional flag)."""
    x, y, z = loc
    lib.box('flag_foot', (x - 0.18, y - 0.18, z), (x + 0.18, y + 0.18, z + 0.06), M['brass'], STATIC, 0.3)
    lib.cylinder('flag_pole', (x, y, z), 0.02, 2.55, M['walnut'], STATIC, 8)
    fin = bmesh.new()
    bmesh.ops.create_uvsphere(fin, u_segments=8, v_segments=5, radius=0.05)
    f = lib.mesh_object('flag_finial', fin, M['brass'], STATIC)
    f.matrix_world = Matrix.Translation((x, y, z + 2.6))
    lib.box_uv(f, 0.2)
    reg = lib.atlas_uv(REG['flag'], A)
    u0, u1, v0, v1 = reg[0][0], reg[1][0], reg[0][1], reg[2][1]
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(lib.UV)
    cols, rows, wd, ht, top = 10, 6, 0.9, 1.5, z + 2.45
    grid = []
    for j in range(rows + 1):
        row = []
        for i in range(cols + 1):
            t = i / cols
            s = j / rows
            drop = s * s * 0.25 * t
            px = x + t * wd * (0.55 + 0.45 * (1 - s))
            py = y + 0.06 * math.sin(t * math.pi * 3 + s) * (0.4 + t)
            row.append(bm.verts.new((px, py, top - s * ht - drop)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            for flip in (False, True):
                vs = [grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1], grid[j][i]]
                uvs = [(u0 + (u1 - u0) * i / cols, v1 - (v1 - v0) * (j + 1) / rows), (u0 + (u1 - u0) * (i + 1) / cols, v1 - (v1 - v0) * (j + 1) / rows),
                       (u0 + (u1 - u0) * (i + 1) / cols, v1 - (v1 - v0) * j / rows), (u0 + (u1 - u0) * i / cols, v1 - (v1 - v0) * j / rows)]
                if flip:
                    vs, uvs = vs[::-1], uvs[::-1]
                try:
                    face = bm.faces.new(vs)
                except ValueError:
                    continue
                for l, t in zip(face.loops, uvs):
                    l[lay].uv = t
    lib.mesh_object('flag_cloth', bm, M['prints'], STATIC)


def curtain(loc, w, h):
    """A heavy velvet curtain: a zigzag strip of folds."""
    x, y, z = loc
    bm = bmesh.new()
    folds = 6
    top, bot = [], []
    for i in range(folds * 2 + 1):
        px = x - w / 2 + w * i / (folds * 2)
        py = y + (0.05 if i % 2 else -0.03)
        bot.append(bm.verts.new((px, py, z)))
        top.append(bm.verts.new((px, py, z + h)))
    for i in range(folds * 2):
        bm.faces.new([bot[i], bot[i + 1], top[i + 1], top[i]])
    o = lib.mesh_object('curtain', bm, M['curtain'], STATIC)
    lib.box_uv(o, 1.0)


def bookcase(xy, width, height):
    """A walnut bookcase against the west wall (front faces +X) with rows of book spines."""
    x, y0 = xy
    d = 0.38
    w = M['walnut']
    lib.box('case_side', (x, y0, 0), (x + d, y0 + 0.04, height), w, STATIC, 0.8)
    lib.box('case_side', (x, y0 + width - 0.04, 0), (x + d, y0 + width, height), w, STATIC, 0.8)
    lib.box('case_back', (x, y0, 0), (x + 0.02, y0 + width, height), w, STATIC, 0.8)
    lib.box('case_top', (x, y0 - 0.02, height), (x + d + 0.03, y0 + width + 0.02, height + 0.06), w, STATIC, 0.8)
    for k in range(6):
        z = 0.1 + k * (height - 0.1) / 6
        lib.box('case_shelf', (x, y0 + 0.04, z), (x + d, y0 + width - 0.04, z + 0.03), w, STATIC, 0.8)
        if k == 0:
            continue
        # A row of books: one block with the spines printed on its front face.
        bh = random.uniform(0.24, 0.3)
        span = random.uniform(0.75, 0.98)
        ya = y0 + 0.06 + random.uniform(0.0, (1 - span) * (width - 0.12))
        yb = ya + span * (width - 0.12)
        lib.box('books', (x + 0.05, ya, z + 0.03), (x + d - 0.03, yb, z + 0.03 + bh), M['black'], STATIC, 0.5, faces=('+z', '+y', '-y'))
        r = REG['books']
        frac = (yb - ya) / (width - 0.12)
        region = (r[0], r[1], max(16, int(r[2] * frac)), r[3])
        lib.quad('book_spines', [(x + d - 0.029, yb, z + 0.03), (x + d - 0.029, ya, z + 0.03), (x + d - 0.029, ya, z + 0.03 + bh), (x + d - 0.029, yb, z + 0.03 + bh)],
                 lib.atlas_uv(region, A), M['prints'], STATIC)


def tv_camera(loc, heading):
    """A shoulder-size broadcast camera on a tripod, lens toward `heading` (radians from +Y)."""
    parts = []
    for k in range(3):
        a = k * 2 * math.pi / 3
        foot = Vector((0.45 * math.sin(a), 0.45 * math.cos(a), 0))
        top = Vector((0, 0, 1.3))
        seg = lib.cylinder('tripod_leg', (0, 0, 0), 0.015, (top - foot).length, M['metal'], STATIC, 6, caps=False)
        seg.matrix_world = Matrix.Translation(foot) @ (top - foot).to_track_quat('Z', 'Y').to_matrix().to_4x4()
        parts.append(seg)
    parts.append(lib.box('tripod_head', (-0.08, -0.08, 1.3), (0.08, 0.08, 1.38), M['metal'], STATIC, 0.3))
    parts.append(lib.box('cam_body', (-0.1, -0.22, 1.38), (0.1, 0.26, 1.62), M['black'], STATIC, 0.3))
    lens = lib.cylinder('cam_lens', (0, 0, 0), 0.06, 0.24, M['black'], STATIC, 12)
    lens.matrix_world = Matrix.Translation((0, 0.26, 1.5)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
    parts.append(lens)
    parts.append(lib.box('cam_finder', (-0.16, -0.05, 1.56), (-0.1, 0.1, 1.66), M['black'], STATIC, 0.3))
    parts.append(lib.box('cam_handle', (-0.02, -0.15, 1.62), (0.02, 0.15, 1.68), M['metal'], STATIC, 0.3))
    place(parts, loc, -heading)


press_room()
office()

# ------------------------------------------------------------------ finish
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects))
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
lib.merge_by_material(list(STATIC.all_objects), 'ofis', STATIC)
HERO = ('herringbone_parquet', 'plastered_wall_04', 'dark_paneled_wood', 'walnut_veneer')


def limit(img):
    n = img.name.lower()
    if n.startswith('ofis') or 'window_view' in n:
        return 2048 if n.startswith('ofis') else 1024
    hero = any(h in n for h in HERO)
    is_normal = 'nor' in n
    data = img.colorspace_settings.name == 'Non-Color'
    if hero:
        return 512 if is_normal else (256 if data else 1024)
    return 256 if is_normal else (128 if data else 512)


lib.strip_normal_maps(('wall_clock', 'potted_plant', 'standing_picture_frame', 'office_notepads', 'flood_lights'))
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
    # Interiors: a few point lights stand in for the game's lighting in the preview only.
    for p, e in (((3, 3, 3.8), 300), ((9, 3, 3.8), 300), ((6, 7, 3.8), 400), ((-4, 6, 3.3), 300), ((-4, 9, 3.3), 200)):
        L = bpy.data.objects.new('preview_light', bpy.data.lights.new('preview_light', 'POINT'))
        L.data.energy = e
        L.data.shadow_soft_size = 0.6
        L.location = p
        bpy.context.scene.collection.objects.link(L)
    hdri = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
    views = [
        ('press_front', (5.0, 5.2, 1.2), (6.0, 10.0, 1.9), 16),
        ('stage_side', (8.3, 8.4, 1.5), (3.0, 3.0, 1.0), 16),
        ('back', (4.6, 0.3, 1.8), (6.0, 10.0, 1.5), 18),
        ('office_guest', (-4.75, 7.0, 1.2), (-4.0, 11.0, 1.6), 16),
        ('office_wide', (-0.6, 3.6, 2.2), (-6.0, 10.0, 1.0), 14),
        ('office_desk', (-4.0, 9.35, 1.25), (-4.0, 3.0, 1.2), 16),
    ]
    lib.render_views(views, PREVIEW, 'ofis', hdri, size=(960, 540), samples=24)
print('DONE', OUT)
