"""Builds the 2008 neighbourhood: a square, two side streets, a back alley,
a far factory and a fogged skyline, all in 3D with real backs.

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup \
      --python art/v2/mahalle/build.py -- <out.glb> [--preview <dir>] [--blend <file>]

Then pack for Quest:  node art/v2/tools/pack.mjs <out.glb> public/v2/mahalle/mahalle.glb

Layout (metres, Blender: X east, Y north, Z up; north is -Z in three.js):
  plaza X -11..11, Y -8..8 (raised 0.15), ring road 7 m, sidewalks 3 m;
  bank block X -8..8, Y 18..40 (bank faces the plaza); alley Y 40..46;
  north block X -8..8, Y 46..64 with a gated passage X -2..2;
  west and east rows X -33..-21 and 21..33; south row Y -30..-18;
  side streets (X -18..-11 and 11..18) end at Y 62-66: a construction fence
  in the west, a parked box truck in the east; the factory faces the north
  street at Y 76.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import atlas  # noqa: E402
import lib  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0]
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else ''
BLEND = ARGS[ARGS.index('--blend') + 1] if '--blend' in ARGS else ''
C = lib.CACHE
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
random.seed(2008)

Z0 = 0.15          # sidewalk top: every building stands on it
GROUND_H = 3.0     # shopfront / ground floor
BAND = 0.7         # sign band (shops) or dado + cornice (homes)
FLOOR_H = 3.0

lib.reset()
LIB = lib.collection('library', hidden=True)
STATIC = lib.collection('static')
NODES = lib.collection('nodes')        # separate, named meshes the game moves or touches
POINTS = lib.collection('points')      # empties: seats, queue path, spots


# ------------------------------------------------------------------ materials
SIGNS = os.path.join(C, 'gen', 'signs.png')
import json  # noqa: E402
import re  # noqa: E402
SIGN_REGIONS = json.load(open(os.path.join(C, 'gen', 'signs.json')))
ATLAS = SIGN_REGIONS['size']
REG = SIGN_REGIONS['regions']

M = {}
M['asphalt'] = lib.pbr('asphalt', 'asphalt_02', 1024, 512)
M['sidewalk'] = lib.pbr('sidewalk', 'concrete_tiles', 1024, 512)
M['curb'] = lib.pbr('curb', 'concrete_floor_02', 512, 256)
M['plaza'] = lib.pbr('plaza', 'herringbone_brick', 1024, 512)
M['alley'] = lib.pbr('alley_floor', 'concrete_floor_worn_001', 1024, 256)
M['stone'] = lib.pbr('bank_stone', 'white_sandstone_blocks_02', 1024, 512)
M['granite'] = lib.pbr('granite', 'granite_tile', 512, 256)
M['kiosk'] = lib.pbr('kiosk_metal', 'green_metal_rust', 512, 256, tint=(0.55, 0.9, 0.65))
M['dumpster'] = lib.pbr('dumpster_metal', 'green_metal_rust', 512, 256, tint=(0.35, 0.55, 0.42))
M['roof'] = lib.pbr('roof', 'concrete_floor_worn_001', 512, 0, tint=(0.55, 0.55, 0.56), rough=0.9, metal=0.0)
M['paint'] = lib.flat('road_paint', (0.82, 0.82, 0.78), rough=0.7)
M['glass'] = lib.flat('window_glass', (0.035, 0.045, 0.055), rough=0.06, metal=0.0)
M['shop_glass'] = lib.flat('shop_glass', (0.05, 0.055, 0.06), rough=0.08)
M['clear_glass'] = lib.flat('clear_glass', (0.6, 0.66, 0.7), rough=0.03, alpha=0.18)
M['shop_trim'] = lib.flat('shop_trim', (0.08, 0.075, 0.07), rough=0.45, metal=0.3)
M['bronze'] = lib.flat('bronze', (0.32, 0.22, 0.12), rough=0.35, metal=1.0)
M['signs'] = lib.textured('signs', SIGNS, rough=0.55)
M['skyline'] = lib.textured('skyline', os.path.join(C, 'gen', 'skyline.png'), rough=0.5, max_size=512)
M['interior'] = lib.flat('bakery_wall', (0.86, 0.80, 0.68), rough=0.8)
M['warm_light'] = lib.flat('bakery_light', (1.0, 0.9, 0.7), rough=0.9, emissive=(1.0, 0.86, 0.62))
M['cone'] = lib.flat('cone_orange', (0.9, 0.32, 0.06), rough=0.55)
M['rubber'] = lib.flat('rubber_black', (0.03, 0.03, 0.03), rough=0.8)
M['wood'] = lib.pbr('bench_wood', 'dark_planks', 512, 256)
M['iron'] = lib.flat('cast_iron', (0.05, 0.055, 0.05), rough=0.55, metal=0.6)


# ------------------------------------------------------------------ the two facade kits
class Kit:
    """A Poly Haven modular facade kit, cut into 3 m slots with their origin at the
    slot's left-bottom corner on the facade plane (front faces local -Y)."""

    def __init__(self, gltf, glass_name, window_ratio, glass, wall_cap=60):
        self.wall_cap = wall_cap
        self.objs = lib.import_gltf(gltf, LIB)
        self.cache = {}
        self.window_ratio = window_ratio
        for o in self.objs.values():
            for i, m in enumerate(o.data.materials):
                if m and glass_name in m.name:
                    o.data.materials[i] = glass

    def slot(self, key, corner=False, ratio=None):
        ck = (key, corner, ratio)
        if ck in self.cache:
            return self.cache[ck]
        names = [n for n in (f'wall_{key}', key) if n in self.objs] if not corner else [key]
        if not names:
            raise KeyError(key)
        ref = self.objs[names[0]]
        # Vertex bounds: bound_box is stale for objects in a hidden collection.
        pts = [ref.matrix_world @ v.co for v in ref.data.vertices]
        mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        if corner:
            t = -mn.y
            origin = Vector((mn.x + t, mn.y + t, mn.z))
        else:
            origin = Vector((mn.x, 0.0, mn.z))
        parts = []
        for n in names:
            src = self.objs[n]
            o = src.copy()
            o.data = src.data.copy()
            LIB.objects.link(o)
            o.matrix_world = Matrix.Translation(-origin) @ src.matrix_world
            lib.apply([o])
            mats = ' '.join(m.name for m in o.data.materials if m)
            if n.startswith('wall_') and ('plaster' in mats or 'brick' in mats) and len(o.data.materials) == 1 and not corner:
                # Flat walls: dissolve the coplanar grid, then cap what the recesses keep.
                lib.decimate(o, planar=True)
                if lib.tris(o) > self.wall_cap:
                    lib.decimate(o, target=self.wall_cap)
                lib.flat_normals(o)
            else:
                lib.decimate(o, ratio=ratio if ratio is not None else self.window_ratio)
            parts.append(o)
        j = lib.join(parts, f'slot_{key}') if len(parts) > 1 else parts[0]
        self.cache[ck] = j.data
        bpy.data.objects.remove(j, do_unlink=True)
        return self.cache[ck]


APT = Kit(os.path.join(C, 'modular_urban_apartments_facade', 'modular_urban_apartments_facade_1k.gltf'), 'facade_glass', 0.18, M['glass'])
FAC = Kit(os.path.join(C, 'modular_factory_facade', 'modular_factory_facade_1k.gltf'), 'windows_glass', 0.28, M['glass'], wall_cap=110)

PLASTER = next(m for m in bpy.data.materials if m.name.startswith('modular_urban_apartments_facade_plaster'))
BRICK = next(m for m in bpy.data.materials if m.name.startswith('modular_factory_facade_brick') and 'door' not in m.name)
TINTS = {
    'brownstone': lib.tinted_copy(PLASTER, 'plaster_brownstone', (0.82, 0.68, 0.6)),
    'sand': lib.tinted_copy(PLASTER, 'plaster_sand', (1.0, 0.93, 0.82)),
    'grey': lib.tinted_copy(PLASTER, 'plaster_grey', (0.78, 0.8, 0.82)),
    'cream': lib.tinted_copy(PLASTER, 'plaster_cream', (1.0, 0.98, 0.9)),
    'brick': BRICK,
    'brick_dark': lib.tinted_copy(BRICK, 'brick_dark', (0.68, 0.6, 0.56)),
}


def recolour(mesh_data, wall_mat):
    """A per-building copy of a slot mesh whose plaster/brick slot uses wall_mat."""
    key = (mesh_data.name, wall_mat.name)
    if key in _recolour:
        return _recolour[key]
    me = mesh_data.copy()
    for i, m in enumerate(me.materials):
        if m and (m == PLASTER or m == BRICK):
            me.materials[i] = wall_mat
    _recolour[key] = me
    return me


_recolour = {}
_placed = []


def place(mesh_data, origin, d, along, z, coll=STATIC, name='piece'):
    theta = math.atan2(d.y, d.x)
    o = bpy.data.objects.new(name, mesh_data)
    coll.objects.link(o)
    p = Vector(origin) + d * along
    o.matrix_world = Matrix.Translation((p.x, p.y, z)) @ Matrix.Rotation(theta, 4, 'Z')
    _placed.append(o)
    if os.environ.get('DBG_PLACE') and len(_placed) < 40:
        vs = [o.matrix_world @ v.co for v in mesh_data.vertices]
        print('PLACE', mesh_data.name, [round(min(v[i] for v in vs), 2) for i in range(3)], [round(max(v[i] for v in vs), 2) for i in range(3)])
    return o


def local_box(name, origin, d, x0, x1, y0, y1, z0, z1, mat, uv=1.0, coll=STATIC):
    """A box in a facade's frame: x along the facade, y inward (negative = in front), z up."""
    o = lib.box(name, (x0, y0, z0), (x1, y1, z1), mat, coll)
    theta = math.atan2(d.y, d.x)
    o.matrix_world = Matrix.Translation((origin[0], origin[1], 0)) @ Matrix.Rotation(theta, 4, 'Z')
    lib.apply([o])
    lib.box_uv(o, uv)
    return o


def local_quad(name, origin, d, x0, x1, y, z0, z1, region, mat, coll=STATIC, flip=False):
    theta = math.atan2(d.y, d.x)
    R = Matrix.Rotation(theta, 4, 'Z')
    o3 = Vector((origin[0], origin[1], 0))
    pts = [Vector((x0, y, z0)), Vector((x1, y, z0)), Vector((x1, y, z1)), Vector((x0, y, z1))]
    pts = [o3 + R @ p for p in pts]
    return lib.quad(name, pts, lib.atlas_uv(region, ATLAS), mat, coll)


# ------------------------------------------------------------------ storefronts

def storefront(name, origin, d, x0, bays, sign=None, door_bay=0, glass='shop', awning=None,
               decal=None, door_node=None, coll=STATIC):
    """Shopfront of `bays` 3 m bays from x0 along the facade, z from Z0 to Z0 + 3.7."""
    w = bays * 3.0
    z = Z0
    parts = []
    gmat = M['clear_glass'] if glass == 'clear' else M['shop_glass']
    for b in range(bays):
        bx = x0 + b * 3.0
        parts.append(local_box(f'{name}_pier', origin, d, bx, bx + 0.16, -0.1, 0.12, z, z + 3.0, M['shop_trim']))
        if b == door_bay:
            # Side lights and a glass door with a heavy frame.
            parts.append(local_box(f'{name}_bulk', origin, d, bx + 0.16, bx + 0.9, -0.03, 0.12, z, z + 0.45, M['shop_trim']))
            parts.append(local_box(f'{name}_bulk', origin, d, bx + 2.1, bx + 3.0, -0.03, 0.12, z, z + 0.45, M['shop_trim']))
            parts.append(local_quad(f'{name}_glass', origin, d, bx + 0.16, bx + 0.9, 0.08, z + 0.45, z + 2.7, REG['solid_2'], gmat))
            parts.append(local_quad(f'{name}_glass', origin, d, bx + 2.1, bx + 3.0, 0.08, z + 0.45, z + 2.7, REG['solid_2'], gmat))
            parts.append(local_box(f'{name}_jamb', origin, d, bx + 0.9, bx + 0.98, -0.04, 0.3, z, z + 2.7, M['shop_trim']))
            parts.append(local_box(f'{name}_jamb', origin, d, bx + 2.02, bx + 2.1, -0.04, 0.3, z, z + 2.7, M['shop_trim']))
            # Door leaf: hinge at the left jamb, glass in a dark frame. Its own node when the game opens it.
            leaf = []
            leaf.append(local_box('leaf', origin, d, bx + 0.98, bx + 2.02, 0.2, 0.25, z, z + 0.25, M['shop_trim']))
            leaf.append(local_box('leaf', origin, d, bx + 0.98, bx + 2.02, 0.2, 0.25, z + 2.45, z + 2.6, M['shop_trim']))
            leaf.append(local_box('leaf', origin, d, bx + 0.98, bx + 1.08, 0.2, 0.25, z + 0.25, z + 2.45, M['shop_trim']))
            leaf.append(local_box('leaf', origin, d, bx + 1.92, bx + 2.02, 0.2, 0.25, z + 0.25, z + 2.45, M['shop_trim']))
            leaf.append(local_box('leaf', origin, d, bx + 1.82, bx + 1.86, 0.15, 0.2, z + 0.9, z + 1.3, M['bronze']))
            leaf.append(local_quad('leaf', origin, d, bx + 1.08, bx + 1.92, 0.225, z + 0.25, z + 2.45, REG['solid_2'], gmat))
            parts.append(local_box(f'{name}_head', origin, d, bx + 0.9, bx + 2.1, -0.04, 0.3, z + 2.6, z + 3.0, M['shop_trim']))
            leaf_obj = lib.join(leaf, door_node or f'{name}_door')
            if door_node:
                for c in list(leaf_obj.users_collection):
                    c.objects.unlink(leaf_obj)
                NODES.objects.link(leaf_obj)
                # Pivot on the hinge line so the game turns it about its vertical axis.
                hinge = Vector(origin) + d * (bx + 0.98) + Vector((-d.y, d.x, 0)) * 0.225
                hinge.z = z
                me = leaf_obj.data
                me.transform(Matrix.Translation(-hinge))
                leaf_obj.matrix_world = Matrix.Translation(hinge)
            else:
                parts.append(leaf_obj)
            # Recess floor so the door does not open onto the void.
            parts.append(local_box(f'{name}_sill', origin, d, bx + 0.9, bx + 2.1, -0.04, 0.3, z - 0.02, z + 0.01, M['granite']))
        else:
            parts.append(local_box(f'{name}_bulk', origin, d, bx + 0.16, bx + 3.0, -0.03, 0.12, z, z + 0.45, M['shop_trim']))
            parts.append(local_quad(f'{name}_glass', origin, d, bx + 0.16, bx + 3.0, 0.08, z + 0.45, z + 2.7, REG['solid_2'], gmat))
            parts.append(local_box(f'{name}_mull', origin, d, bx + 1.56, bx + 1.6, 0.0, 0.1, z + 0.45, z + 2.7, M['shop_trim']))
            parts.append(local_box(f'{name}_transom', origin, d, bx + 0.16, bx + 3.0, -0.03, 0.12, z + 2.7, z + 3.0, M['shop_trim']))
    parts.append(local_box(f'{name}_pier', origin, d, x0 + w - 0.16, x0 + w, -0.1, 0.12, z, z + 3.0, M['shop_trim']))
    # Sign band: dark fascia box with the painted sign on its face.
    parts.append(local_box(f'{name}_fascia', origin, d, x0, x0 + w, -0.16, 0.0, z + 3.0, z + 3.7, M['shop_trim']))
    region = REG.get(sign) if sign else REG['solid_2']
    parts.append(local_quad(f'{name}_sign', origin, d, x0 + 0.1, x0 + w - 0.1, -0.165, z + 3.06, z + 3.64, region, M['signs']))
    if decal:
        for k, (bay, reg) in enumerate(decal):
            bx = x0 + bay * 3.0 + 0.9
            parts.append(local_quad(f'{name}_decal', origin, d, bx, bx + 0.7, 0.07, z + 1.2, z + 1.9, REG[reg], M['signs']))
    if awning:
        # A fixed canvas awning sloping out 1.4 m over the windows, with side flaps and a valance.
        reg = REG['awning_' + awning]
        A0, A1, top, low, out = x0 + 0.05, x0 + w - 0.05, z + 2.78, z + 2.32, -1.4
        theta = math.atan2(d.y, d.x)
        R = Matrix.Rotation(theta, 4, 'Z')
        o3 = Vector((origin[0], origin[1], 0))
        P = lambda x, y, zz: o3 + R @ Vector((x, y, zz))
        uv = lib.atlas_uv(reg, ATLAS)
        reps = max(1, round(w / 1.6))
        u0, u1 = uv[0][0], uv[1][0]
        v0, v1 = uv[0][1], uv[2][1]
        import bmesh
        bm = bmesh.new()
        lay = bm.loops.layers.uv.new(lib.UV)

        def face(pts, uvs):
            f = bm.faces.new([bm.verts.new(p) for p in pts])
            for l, t in zip(f.loops, uvs):
                l[lay].uv = t
        for r in range(reps):
            a = A0 + (A1 - A0) * r / reps
            b = A0 + (A1 - A0) * (r + 1) / reps
            face([P(a, out, low), P(b, out, low), P(b, -0.02, top), P(a, -0.02, top)], [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
            face([P(a, out, low - 0.28), P(b, out, low - 0.28), P(b, out, low), P(a, out, low)], [(u0, v0), (u1, v0), (u1, v0 + (v1 - v0) * 0.25), (u0, v0 + (v1 - v0) * 0.25)])
        for xx in (A0, A1):
            face([P(xx, -0.02, top), P(xx, out, low), P(xx, out, low - 0.28)], [(u0, v1), (u1, v0), (u1, v0)])
        bm.normal_update()
        aw = lib.mesh_object(f'{name}_awning', bm, M['signs'], coll)
        # Double-sided look: duplicate flipped so the underside is drawn too.
        import bmesh as _b
        bm2 = _b.new()
        bm2.from_mesh(aw.data)
        _b.ops.reverse_faces(bm2, faces=bm2.faces)
        flipped = lib.mesh_object(f'{name}_awning_under', bm2, M['signs'], coll)
        parts += [aw, flipped]
    return parts


# ------------------------------------------------------------------ buildings
SIDES = {
    'S': lambda r: (Vector((r[0], r[1], 0)), Vector((1, 0, 0)), r[2] - r[0]),
    'E': lambda r: (Vector((r[2], r[1], 0)), Vector((0, 1, 0)), r[3] - r[1]),
    'N': lambda r: (Vector((r[2], r[3], 0)), Vector((-1, 0, 0)), r[2] - r[0]),
    'W': lambda r: (Vector((r[0], r[3], 0)), Vector((0, -1, 0)), r[3] - r[1]),
}


def building(name, rect, floors, kit, wall, sides, shops=None, crown=True, roof_props=0, lod='near'):
    """rect = (x0, y0, x1, y1), all sides multiples of 3 m. sides: {'S': mode, ...} where
    mode is 'front' (windows on every bay), 'back' (every other bay, simpler windows),
    'blank' (no windows), ('hidden', n) for a party wall hidden up to floor n, 'flat' for a side
    no seat can see (it faces away from every place the player is): one plain wall of the
    building's material with the corner piers kept, or 'none'.
    shops: {'E': dict(storefront kwargs)} puts a storefront on that side's ground floor."""
    shops = shops or {}
    wall_mat = TINTS[wall]
    top = Z0 + GROUND_H + BAND + (floors - 1) * FLOOR_H
    if kit is APT:
        win = {1: 'window_centered_small_01', 2: 'window_centered_small_02', 3: 'window_centered_small_03'}
        win_alt = {1: 'window_centered_double_01', 2: 'window_centered_double_02', 3: 'window_centered_double_03'}
        blank, door, dado, cornice, base = 'standard_standard_01', 'door_centered_small_02', 'dado_standard_standard_01', 'cornice_standard_standard_01', 'base_standard_01'
        crown_k, pier, crown_pier, dado_pier, cornice_pier = 'crown_standard_standard_01', 'wall_pier_corner_01', 'crown_pier_corner_01', 'dado_pier_corner_01', 'cornice_pier_corner_01'
    else:
        win = {1: 'window_centered_medium_01', 2: 'window_centered_medium_02', 3: 'window_centered_medium_02'}
        win_alt = {1: 'window_centered_double_01', 2: 'window_centered_double_02', 3: 'window_centered_double_02'}
        blank, door, dado, cornice, base = 'standard_standard_01', 'door_centered_small_01', 'dado_standard_standard_01', 'cornice02_standard_standard_01', 'base_standard_standard_01'
        crown_k, pier, crown_pier, dado_pier, cornice_pier = 'crown_standard_standard_01', 'wall_pier_corner_01', 'crown_pier_corner_01', 'dado_pier_corner_01', 'cornice02_pier_corner_01'
    simple_win = win[2]
    wr = kit.window_ratio * (0.25 if lod == 'far' else 1.0)
    S_ = lambda key: kit.slot(key, ratio=wr)
    parts = []
    for side, mode in sides.items():
        if mode == 'none':
            continue
        side_start = len(parts)
        origin, d, length = SIDES[side](rect)
        n = int(round(length / 3.0))
        if mode == 'flat':
            R = Matrix.Rotation(math.atan2(d.y, d.x), 4, 'Z')
            o3 = Vector((origin[0], origin[1], 0))
            pts = [o3 + R @ Vector(p) for p in ((0, 0, 0), (length, 0, 0), (length, 0, top), (0, 0, top))]
            parts.append(lib.quad(f'{name}_{side}_wall', pts, [(0, 0), (length / 3, 0), (length / 3, top / 3), (0, top / 3)], wall_mat, STATIC))
            parts.append(place(recolour(kit.slot(pier, corner=True, ratio=0.06), wall_mat), origin, d, 0.0, Z0))
            for f in range(1, floors):
                parts.append(place(recolour(kit.slot(pier, corner=True, ratio=0.06), wall_mat), origin, d, 0.0, Z0 + GROUND_H + BAND + (f - 1) * FLOOR_H))
            if crown:
                parts.append(place(kit.slot(crown_pier, corner=True, ratio=0.15), origin, d, 0.0, top))
            for p in parts[side_start:]:
                if p is not None:
                    p['tag'] = f'{name}:{side}:flat'
            continue
        hidden_up_to = mode[1] if isinstance(mode, tuple) else 0
        kind = 'blank' if isinstance(mode, tuple) else mode
        # Ground floor.
        if hidden_up_to < 1:
            if side in shops:
                parts += storefront(f'{name}_{side}_shop', origin, d, 0.0, n, **shops[side])
            else:
                for b in range(n):
                    if kind in ('blank', 'rear'):
                        key = door if (kind == 'rear' and b == n // 2) else blank
                    elif kind == 'back' and b % 2 == 1:
                        key = blank
                    else:
                        key = door if (b == n // 2 and kind in ('front', 'back')) else (win[1] if kind == 'front' else blank)
                    parts.append(place(recolour(S_(key), wall_mat), origin, d, b * 3.0, Z0))
                for b in range(n):
                    parts.append(place(kit.slot(dado), origin, d, b * 3.0, Z0 + GROUND_H))
                    parts.append(place(kit.slot(cornice), origin, d, b * 3.0, Z0 + GROUND_H + 0.5))
                    parts.append(place(kit.slot(base), origin, d, b * 3.0, Z0 - 0.0))
        # Upper floors.
        for f in range(1, floors):
            if f < hidden_up_to:
                continue
            z = Z0 + GROUND_H + BAND + (f - 1) * FLOOR_H
            level = 1 if f == 1 else (3 if f == floors - 1 and floors > 2 else 2)
            for b in range(n):
                if kind == 'blank':
                    key = blank
                elif kind == 'back':
                    key = simple_win if b % 2 == 0 else blank
                elif kind == 'rear':
                    key = simple_win if (b % 4 == 1 and f % 2 == 1) else blank
                else:
                    key = (win_alt if (b % 3 == 1 and n >= 3) else win)[level]
                mesh = kit.slot(key, ratio=wr * 0.5) if kind == 'rear' else S_(key)
                parts.append(place(recolour(mesh, wall_mat), origin, d, b * 3.0, z))
        fully_hidden = hidden_up_to >= floors
        # Crown along the top edge.
        if crown and not fully_hidden:
            for b in range(n):
                parts.append(place(kit.slot(crown_k, ratio=0.12 if kind != 'rear' else 0.06), origin, d, b * 3.0, top))
        # Corner piers at this side's start corner, only where they can be seen.
        if hidden_up_to < 1:
            parts.append(place(recolour(kit.slot(pier, corner=True, ratio=0.06), wall_mat), origin, d, 0.0, Z0))
            parts.append(place(kit.slot(dado_pier, corner=True, ratio=0.2), origin, d, 0.0, Z0 + GROUND_H))
            parts.append(place(kit.slot(cornice_pier, corner=True, ratio=0.2), origin, d, 0.0, Z0 + GROUND_H + 0.5))
        for f in range(1, floors):
            if f >= hidden_up_to:
                parts.append(place(recolour(kit.slot(pier, corner=True, ratio=0.06), wall_mat), origin, d, 0.0, Z0 + GROUND_H + BAND + (f - 1) * FLOOR_H))
        if crown and not fully_hidden:
            parts.append(place(kit.slot(crown_pier, corner=True, ratio=0.15), origin, d, 0.0, top))
        for p in parts[side_start:]:
            if p is not None:
                p['tag'] = f'{name}:{side}:{mode if isinstance(mode, str) else "hidden"}'
    # Band filler behind storefront signs is the fascia; a roof slab closes the box.
    x0, y0, x1, y1 = rect
    roof_z = top + (0.75 if kit is APT else 0.32) - 0.05
    parts.append(lib.box(f'{name}_roof', (x0 + 0.05, y0 + 0.05, top - 0.3), (x1 - 0.05, y1 - 0.05, top + 0.25), M['roof'], STATIC, 4.0, faces=('+z',)))
    for k in range(roof_props):
        px = random.uniform(x0 + 2, x1 - 2)
        py = random.uniform(y0 + 2, y1 - 2)
        parts.append(prop('aircon', (px, py, top + 0.25), random.uniform(0, 6.28)))
    return [p for p in parts if p is not None], top


# ------------------------------------------------------------------ props (Poly Haven, decimated once, then instanced and merged)
PROP_SRC = {}


def load_prop(key, folder, names, target, scale=1.0, drop=()):
    objs = lib.import_gltf(os.path.join(C, folder, f'{folder}_1k.gltf'), LIB)
    keep = [o for n, o in objs.items() if any(n.startswith(x) for x in names) and not any(x in n for x in drop)]
    for n, o in objs.items():
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    j = lib.join(keep, f'prop_{key}')
    lib.decimate(j, target=target)
    if scale != 1.0:
        j.data.transform(Matrix.Scale(scale, 4))
    # Base centre at the origin.
    pts = [Vector(v.co) for v in j.data.vertices]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    j.data.transform(Matrix.Translation((-cx, -cy, -min(p.z for p in pts))))
    j.matrix_world = Matrix.Identity(4)
    PROP_SRC[key] = j.data
    bpy.data.objects.remove(j, do_unlink=True)


def prop(key, loc, rot=0.0, coll=STATIC, name=None):
    o = bpy.data.objects.new(name or f'prop_{key}', PROP_SRC[key])
    coll.objects.link(o)
    o.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
    return o


load_prop('lamp', 'street_lamp_01', ['street_lamp_01'], 400)
load_prop('hydrant', 'fire_hydrant', ['fire_hydrant'], 420, drop=('aged',))
load_prop('trash', 'metal_trash_can', ['metal_trash_can'], 400, drop=('rust',))
load_prop('trash_rust', 'metal_trash_can', ['metal_trash_can_rust'], 400)
load_prop('aircon', 'exterior_aircon_unit', ['exterior_aircon_unit'], 250, drop=('rusted',))
load_prop('manhole', 'water_manhole_cover', ['water_manhole_cover'], 120)
load_prop('barrier', 'concrete_road_barrier_02', ['concrete_road_barrier_02'], 220)
load_prop('utility', 'utility_box_01', ['utility_box_01'], 300)
load_prop('chalkboard', 'standing_chalkboard_01', ['standing_chalkboard_01'], 450)
load_prop('trashbag', 'trashbag', ['trashbag'], 180)
load_prop('shutter', 'rollershutter_door', ['rollershutter_door'], 320, drop=('graffiti',))
load_prop('covered_car', 'covered_car', ['covered_car'], 1300)
load_prop('croissant', 'croissant', ['croissant'], 60)
load_prop('fence_panel', 'modular_chainlink_fence', ['modular_chainlink_fence_double'], 160)
load_prop('fence_post', 'modular_chainlink_fence', ['modular_chainlink_fence_post'], 110, drop=('bracket',))
load_prop('fire_escape_platform', 'modular_fire_escape', ['modular_fire_escape_platform_middle', 'modular_fire_escape_railing_middle'], 420)
load_prop('fire_escape_stairs', 'modular_fire_escape', ['modular_fire_escape_stairs'], 460)
load_prop('fire_escape_ladder', 'modular_fire_escape', ['modular_fire_escape_ladder_bottom'], 200)

# Vehicles prepared by tools/prep_model.py (one baked atlas each), length along X.
VEH = {}
for key in ('car_sedan', 'car_old', 'van', 'box_truck', 'pickup'):
    objs = lib.import_gltf(os.path.join(C, 'prep', f'{key}.glb'), LIB)
    o = list(objs.values())[0]
    pts = [Vector(v.co) for v in o.data.vertices]
    sx = max(p.x for p in pts) - min(p.x for p in pts)
    sy = max(p.y for p in pts) - min(p.y for p in pts)
    if sy > sx:
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
    lib.decimate(o, target=1600 if key != 'box_truck' else 1200)
    VEH[key] = o.data
    bpy.data.objects.remove(o, do_unlink=True)


def vehicle(key, loc, heading, coll=STATIC):
    o = bpy.data.objects.new(f'vehicle_{key}', VEH[key])
    coll.objects.link(o)
    o.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(heading, 4, 'Z')
    return o


# ------------------------------------------------------------------ ground
def ground():
    lib.box('asphalt', (-80, -60, -0.2), (80, 130, 0.0), M['asphalt'], STATIC, 6.0, faces=('+z',))
    def walk(name, lo, hi):
        lib.box(f'{name}_curb', (lo[0], lo[1], 0.0), (hi[0], hi[1], Z0 - 0.002), M['curb'], STATIC, 1.0, faces=('+x', '-x', '+y', '-y'))
        lib.box(f'{name}_top', (lo[0], lo[1], Z0 - 0.01), (hi[0], hi[1], Z0), M['sidewalk'], STATIC, 2.4, faces=('+z',))
    walk('walk_west', (-36, -33), (-18, 64))
    walk('walk_east', (18, -33), (36, 64))
    walk('walk_south', (-18, -33), (18, -15))
    walk('walk_bank', (-11, 15), (11, 40))
    walk('walk_north', (-11, 46), (11, 64))
    walk('walk_factory', (-40, 73), (40, 110))
    # Plaza: herringbone brick inside a granite curb.
    lib.box('plaza_curb', (-11, -8, 0.0), (11, 8, Z0), M['granite'], STATIC, 1.0, faces=('+x', '-x', '+y', '-y'))
    lib.box('plaza_edge', (-11, -8, Z0 - 0.01), (11, 8, Z0), M['granite'], STATIC, 1.0, faces=('+z',))
    lib.box('plaza_top', (-10.6, -7.6, Z0 - 0.005), (10.6, 7.6, Z0 + 0.002), M['plaza'], STATIC, 1.6, faces=('+z',))
    # Alley floor, worn concrete.
    lib.box('alley_floor', (-11, 40, 0.0), (11, 46, 0.006), M['alley'], STATIC, 4.0, faces=('+z',))
    # Crosswalk stripes from the plaza to the four sides, and stop lines.
    def stripes(cx, cy, along_x, length, n=7):
        for i in range(n):
            o = (i - (n - 1) / 2) * 0.9
            if along_x:
                lib.box('crosswalk', (cx - length / 2, cy + o - 0.25, 0.0), (cx + length / 2, cy + o + 0.25, 0.012), M['paint'], STATIC, 1.0, faces=('+z',))
            else:
                lib.box('crosswalk', (cx + o - 0.25, cy - length / 2, 0.0), (cx + o + 0.25, cy + length / 2, 0.012), M['paint'], STATIC, 1.0, faces=('+z',))
    stripes(0, 11.5, False, 6.6)       # plaza to the bank
    stripes(-14.5, 0, True, 6.6)       # plaza to the west row
    stripes(14.5, 0, True, 6.6)        # plaza to the east row
    stripes(0, -11.5, False, 6.6)      # plaza to the south row
    # Centre lines on the side streets.
    for x in (-14.5, 14.5):
        for y in range(18, 62, 4):
            lib.box('lane', (x - 0.06, y, 0.0), (x + 0.06, y + 2.0, 0.011), M['paint'], STATIC, 1.0, faces=('+z',))
    for (x, y) in [(-14.5, -11.5), (14.5, 11.5), (0, -11.5 + 0.0), (-14.5, 30), (14.5, 45), (0, 69.5)]:
        prop('manhole', (x + 1.6, y + 1.2, 0.0))


# ------------------------------------------------------------------ the bank
def bank():
    s = M['stone']
    # Podium and steps (8 risers of 0.13 m up to 1.19).
    lib.box('bank_podium', (-8, 20.76, 0.0), (8, 40, 1.19), s, STATIC, 2.0)
    for i in range(8):
        y0 = 18.2 + i * 0.32
        lib.box('bank_step', (-6.5, y0, 0.0), (6.5, 20.76, Z0 + (i + 1) * 0.13), M['granite'], STATIC, 1.5)
    # Cheek walls beside the steps.
    for x in (-8, 6.5):
        lib.box('bank_cheek', (x, 18.2, 0.0), (x + 1.5, 20.76, 1.45), s, STATIC, 2.0)
    # Main mass behind the portico.
    lib.box('bank_mass', (-8, 24.5, 1.19), (8, 40, 12.2), s, STATIC, 2.4, faces=('+x', '-x', '+y'))
    # Front wall in three pieces around the door opening (X -1.5..1.5, up to 5.0 m).
    lib.box('bank_front', (-8, 24.5, 1.19), (-1.5, 24.6, 12.2), s, STATIC, 2.4, faces=('-y',))
    lib.box('bank_front', (1.5, 24.5, 1.19), (8, 24.6, 12.2), s, STATIC, 2.4, faces=('-y',))
    lib.box('bank_front', (-1.5, 24.5, 5.0), (1.5, 24.6, 12.2), s, STATIC, 2.4, faces=('-y',))
    lib.box('bank_attic', (-8.2, 24.3, 12.2), (8.2, 40.2, 13.0), s, STATIC, 2.4)
    lib.box('bank_roof', (-7.8, 24.6, 12.9), (7.8, 39.8, 13.05), M['roof'], STATIC, 4.0, faces=('+z',))
    # Portico: six columns, base and capital blocks, entablature with the frieze, pediment.
    xs = [-6.5, -3.9, -1.3, 1.3, 3.9, 6.5]
    for x in xs:
        lib.box('col_base', (x - 0.6, 21.2, 1.19), (x + 0.6, 22.4, 1.5), s, STATIC, 1.0)
        lib.cylinder('col_shaft', (x, 21.8, 1.5), 0.42, 8.5, s, STATIC, 16, 1.2, caps=False)
        lib.box('col_neck', (x - 0.5, 21.3, 10.0), (x + 0.5, 22.3, 10.2), s, STATIC, 1.0)
        lib.box('col_cap', (x - 0.68, 21.12, 10.2), (x + 0.68, 22.48, 10.55), s, STATIC, 1.0)
    lib.box('entablature', (-7.6, 20.95, 10.55), (7.6, 24.5, 11.75), s, STATIC, 2.0)
    lib.box('cornice', (-7.9, 20.7, 11.75), (7.9, 24.5, 12.05), s, STATIC, 2.0)
    lib.facade_quad('bank_frieze', (-6.0, 20.94, 0), (1, 0, 0), 0.0, 12.0, 10.7, 11.6, 0.0, REG['bank_frieze'], ATLAS, M['signs'], STATIC)
    pts = [(-7.9, 20.7), (7.9, 20.7)]
    import bmesh
    bm = bmesh.new()
    a = bm.verts.new((-7.9, 20.7, 12.05)); b = bm.verts.new((7.9, 20.7, 12.05)); c = bm.verts.new((0, 20.7, 14.3))
    a2 = bm.verts.new((-7.9, 24.5, 12.05)); b2 = bm.verts.new((7.9, 24.5, 12.05)); c2 = bm.verts.new((0, 24.5, 14.3))
    bm.faces.new([a, b, c]); bm.faces.new([b2, a2, c2]); bm.faces.new([b, b2, c2, c]); bm.faces.new([a2, a, c, c2])
    ped = lib.mesh_object('pediment', bm, s, STATIC)
    lib.box_uv(ped, 2.0)
    # Ceiling of the portico.
    lib.box('portico_ceiling', (-7.6, 20.95, 10.5), (7.6, 24.5, 10.56), s, STATIC, 2.0, faces=('-z',))
    # Entrance: a deep stone surround, transom grille and two bronze leaves (separate nodes).
    lib.box('door_surround_l', (-2.2, 24.2, 1.19), (-1.5, 24.6, 7.0), M['granite'], STATIC, 1.0)
    lib.box('door_surround_r', (1.5, 24.2, 1.19), (2.2, 24.6, 7.0), M['granite'], STATIC, 1.0)
    lib.box('door_head', (-2.2, 24.2, 5.9), (2.2, 24.6, 7.0), M['granite'], STATIC, 1.0)
    lib.box('door_transom', (-1.5, 24.38, 5.0), (1.5, 24.42, 5.9), M['bronze'], STATIC, 0.5)
    # The lobby behind the door: a dark marble vestibule seen when the leaves swing in.
    lib.box('door_void', (-1.5, 24.5, 1.19), (1.5, 27.5, 5.0), M['granite'], STATIC, 1.0, faces=('+y', '+x', '-x', '+z', '-z'), inward=True)
    for side, x0, x1, hinge in (('left', -1.5, 0.0, -1.5), ('right', 0.0, 1.5, 1.5)):
        parts = [lib.box('leaf', (x0, 24.42, 1.19), (x1, 24.52, 5.0), M['bronze'], NODES, 0.6)]
        for zz in (2.0, 3.3):
            parts.append(lib.box('panel', (x0 + 0.15, 24.39, zz), (x1 - 0.15, 24.42, zz + 1.0), M['bronze'], NODES, 0.6))
        hx = x1 - 0.12 if side == 'left' else x0 + 0.12
        parts.append(lib.box('pull', (hx - 0.03, 24.33, 2.4), (hx + 0.03, 24.39, 3.2), M['bronze'], NODES, 0.3))
        leaf = lib.join(parts, f'bank_door_{side}')
        piv = Vector((hinge, 24.47, 1.19))
        leaf.data.transform(Matrix.Translation(-piv))
        leaf.matrix_world = Matrix.Translation(piv)
    # Tall windows: two each side of the door in front, five per flank, three at the back.
    def tall_window(cx, cy, normal, w=1.5, z0=2.4, h=5.2):
        # Flush dark glass with bronze bars inside a projecting stone surround.
        n = Vector(normal)
        t = Vector((-n.y, n.x, 0))
        c = Vector((cx, cy, 0))
        lift = Vector((0, 0, 1))
        lib.quad('bank_glass', [c + t * (-w / 2) + n * 0.02 + lift * z0, c + t * (w / 2) + n * 0.02 + lift * z0,
                                c + t * (w / 2) + n * 0.02 + lift * (z0 + h), c + t * (-w / 2) + n * 0.02 + lift * (z0 + h)],
                 [(0, 0), (1, 0), (1, 1), (0, 1)], M['glass'], STATIC)
        def slab(u0, u1, zz0, zz1, off0, off1, mat):
            a = c + t * u0 + n * off0
            b = c + t * u1 + n * off1
            lib.box('reveal', (min(a.x, b.x), min(a.y, b.y), zz0), (max(a.x, b.x), max(a.y, b.y), zz1), mat, STATIC, 1.0)
        for k in range(1, 4):
            uu = -w / 2 + w * k / 4
            slab(uu - 0.02, uu + 0.02, z0, z0 + h, 0.02, 0.07, M['bronze'])
        slab(-w / 2, w / 2, z0 + h * 0.62, z0 + h * 0.62 + 0.05, 0.02, 0.07, M['bronze'])
        slab(-w / 2 - 0.32, -w / 2, z0 - 0.3, z0 + h + 0.45, 0.0, 0.28, M['granite'])
        slab(w / 2, w / 2 + 0.32, z0 - 0.3, z0 + h + 0.45, 0.0, 0.28, M['granite'])
        slab(-w / 2 - 0.4, w / 2 + 0.4, z0 - 0.38, z0, 0.0, 0.34, M['granite'])
        slab(-w / 2 - 0.32, w / 2 + 0.32, z0 + h, z0 + h + 0.45, 0.0, 0.3, M['granite'])
    for x in (-5.0, 5.0):
        tall_window(x, 24.5, (0, -1, 0), 1.4, 2.4, 4.6)
    for y in (27.0, 30.0, 33.0, 36.0):
        tall_window(-8.0, y, (-1, 0, 0), 1.5)
        tall_window(8.0, y, (1, 0, 0), 1.5)
    # Rusticated base band and a string course.
    lib.box('bank_band', (-8.12, 24.4, 7.6), (8.12, 40.12, 7.85), M['granite'], STATIC, 1.0)
    # Back: a service door on the alley.
    prop('shutter', (3.5, 40.0, 1.19), math.pi, name='bank_back_door')
    lib.box('loading_dock', (2.2, 40.0, 0.0), (4.8, 41.4, 1.19), M['curb'], STATIC, 1.0)
    for x in (-5.5, -3.5):
        prop('aircon', (x, 40.45, 2.0), math.pi)
    tall_window(-1.5, 40.0, (0, 1, 0), 1.2, 3.0, 2.6)
    # Velvet-rope queue posts on the portico (brass) for the line at the door.
    for i, x in enumerate((-3.0, -1.6, 1.6, 3.0)):
        lib.cylinder('stanchion', (x, 22.9, 1.19), 0.03, 0.95, M['bronze'], STATIC, 8, 0.3)
        lib.box('stanchion_foot', (x - 0.15, 22.75, 1.19), (x + 0.15, 23.05, 1.23), M['bronze'], STATIC, 0.3)
    # Queue path: from the door down the steps, west along the front, north up the side street.
    q = [(0.0, 24.0, 1.19), (0.0, 23.2, 1.19), (0.0, 22.4, 1.19), (0.0, 21.4, 1.19), (0.0, 20.4, 0.93), (0.0, 19.4, 0.54), (0.0, 18.5, 0.28)]
    q += [(0.0, 17.2, Z0)] + [(-0.8 * k, 16.4, Z0) for k in range(1, 13)] + [(-9.8, 16.8 + 0.8 * k, Z0) for k in range(0, 14)]
    for i, p in enumerate(q):
        # Each person faces the next point toward the door.
        lib.empty(f'bank_queue_{i:02d}', p, 0.0 if i < 8 else (-math.pi / 2 if i < 21 else math.pi), POINTS)


# ------------------------------------------------------------------ newsstand, bakery interior, small street things
def newsstand():
    x0, x1, y0, y1 = 6.2, 8.8, 3.6, 5.4
    k = M['kiosk']
    lib.box('kiosk_body', (x0, y0, Z0), (x1, y1, Z0 + 0.95), k, STATIC, 1.0)
    lib.box('kiosk_back', (x0 + 0.3, y0, Z0 + 0.95), (x1, y1, Z0 + 2.35), k, STATIC, 1.0, faces=('+x', '+y', '-y'))
    lib.box('kiosk_inside', (x0 + 0.3, y0 + 0.05, Z0 + 0.95), (x1 - 0.05, y1 - 0.05, Z0 + 2.3), M['shop_trim'], STATIC, 1.0, faces=('+x', '+y', '-y', '+z'), inward=True)
    lib.box('kiosk_post', (x0, y0, Z0 + 0.95), (x0 + 0.1, y0 + 0.1, Z0 + 2.35), k, STATIC, 1.0)
    lib.box('kiosk_post', (x0, y1 - 0.1, Z0 + 0.95), (x0 + 0.1, y1, Z0 + 2.35), k, STATIC, 1.0)
    lib.box('kiosk_roof', (x0 - 0.45, y0 - 0.25, Z0 + 2.35), (x1 + 0.2, y1 + 0.25, Z0 + 2.5), k, STATIC, 1.0)
    lib.box('kiosk_counter', (x0 - 0.25, y0, Z0 + 0.95), (x0 + 0.3, y1, Z0 + 1.0), M['shop_trim'], STATIC, 1.0)
    # NEWS on the fascia, three sides.
    lib.quad('kiosk_sign', [(x0 - 0.46, y1 + 0.26, Z0 + 2.36), (x0 - 0.46, y0 - 0.26, Z0 + 2.36), (x0 - 0.46, y0 - 0.26, Z0 + 2.49), (x0 - 0.46, y1 + 0.26, Z0 + 2.49)], lib.atlas_uv(REG['news_kiosk'], ATLAS), M['signs'], STATIC)
    for yy, sgn in ((y0 - 0.26, 1), (y1 + 0.26, -1)):
        xa, xb = (x0 - 0.45, x1 + 0.2) if sgn == 1 else (x1 + 0.2, x0 - 0.45)
        lib.quad('kiosk_sign', [(xa, yy, Z0 + 2.36), (xb, yy, Z0 + 2.36), (xb, yy, Z0 + 2.49), (xa, yy, Z0 + 2.49)], lib.atlas_uv(REG['news_kiosk'], ATLAS), M['signs'], STATIC)
    # Magazine rack on the front face, and the paper stack the game hands out (its own node).
    lib.quad('kiosk_rack', [(x0 - 0.01, y1 - 0.05, Z0 + 0.2), (x0 - 0.01, y0 + 0.05, Z0 + 0.2), (x0 - 0.01, y0 + 0.05, Z0 + 0.9), (x0 - 0.01, y1 - 0.05, Z0 + 0.9)], lib.atlas_uv(REG['news_rack'], ATLAS), M['signs'], STATIC)
    reg = REG['news_rack']
    paper = (reg[0], reg[1], 128, 128)
    stack = lib.box('newsstand_papers', (-0.2, -0.15, 0.0), (0.2, 0.15, 0.12), M['signs'], NODES, 1.0)
    # Top of the stack shows the front page of the daily paper.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(stack.data)
    lay = bm.loops.layers.uv.get(lib.UV)
    uvs = lib.atlas_uv(paper, ATLAS)
    side = lib.atlas_uv(REG['solid_3'], ATLAS)
    for f in bm.faces:
        if f.normal.z > 0.5:
            for l in f.loops:
                u = (l.vert.co.x + 0.2) / 0.4
                v = (l.vert.co.y + 0.15) / 0.3
                l[lay].uv = (uvs[0][0] + (uvs[1][0] - uvs[0][0]) * v, uvs[0][1] + (uvs[2][1] - uvs[0][1]) * (1 - u))
        else:
            for l in f.loops:
                l[lay].uv = side[0]
    bm.to_mesh(stack.data)
    bm.free()
    stack.matrix_world = Matrix.Translation((x0 + 0.0, (y0 + y1) / 2, Z0 + 1.0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    lib.empty('newsstand_counter', (x0 - 0.1, (y0 + y1) / 2, Z0 + 1.0), math.pi / 2, POINTS)


def bakery_interior(x_front, y0, y1):
    """A shallow lit shop room behind the clear windows: floor, walls, counter, bread."""
    xb = x_front - 3.4
    lib.box('bakery_floor', (xb, y0 + 0.1, Z0), (x_front - 0.05, y1 - 0.1, Z0 + 0.01), M['granite'], STATIC, 0.8, faces=('+z',))
    lib.box('bakery_room', (xb, y0 + 0.1, Z0), (x_front - 0.05, y1 - 0.1, Z0 + 3.0), M['interior'], STATIC, 2.0, faces=('-x', '+y', '-y', '+z'), inward=True)
    lib.box('bakery_ceiling_light', (xb + 0.8, y0 + 1.5, Z0 + 2.95), (xb + 1.6, y1 - 1.5, Z0 + 2.99), M['warm_light'], STATIC, 1.0, faces=('-z',))
    lib.box('bakery_counter', (xb + 0.6, y0 + 1.0, Z0), (xb + 1.4, y1 - 1.0, Z0 + 1.0), M['shop_trim'], STATIC, 1.0)
    lib.box('bakery_counter_top', (xb + 0.55, y0 + 0.95, Z0 + 1.0), (xb + 1.45, y1 - 0.95, Z0 + 1.04), M['granite'], STATIC, 0.8)
    # Window display shelves with croissants and loaves.
    for yy0, yy1 in ((y0 + 0.2, y0 + 5.6), (y0 + 6.4, y1 - 0.2)):
        lib.box('display', (x_front - 0.75, yy0, Z0), (x_front - 0.12, yy1, Z0 + 0.75), M['shop_trim'], STATIC, 1.0)
        lib.box('display_top', (x_front - 0.77, yy0, Z0 + 0.75), (x_front - 0.1, yy1, Z0 + 0.78), M['granite'], STATIC, 0.8)
        y = yy0 + 0.25
        while y < yy1 - 0.2:
            prop('croissant', (x_front - 0.45 + random.uniform(-0.1, 0.1), y, Z0 + 0.78), random.uniform(0, 6.28))
            y += 0.28
    # Loaves on the counter.
    import bmesh
    for i in range(8):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.5)
        bmesh.ops.scale(bm, vec=(0.17, 0.09, 0.07), verts=bm.verts)
        o = lib.mesh_object('loaf', bm, next(m for m in bpy.data.materials if m.name.startswith('croissant')), STATIC)
        lib.box_uv(o, 0.25)
        o.matrix_world = Matrix.Translation((xb + 1.0, y0 + 1.4 + i * 0.5, Z0 + 1.08)) @ Matrix.Rotation(random.uniform(-0.3, 0.3), 4, 'Z')
    lib.empty('bakery_counter_spot', (xb + 1.0, (y0 + y1) / 2, Z0 + 1.04), math.pi / 2, POINTS)


def dumpster(loc, rot):
    o = []
    o.append(lib.box('dumpster', (-0.95, -0.6, 0.12), (0.95, 0.6, 1.2), M['dumpster'], STATIC, 1.0))
    o.append(lib.box('dumpster_lid', (-1.0, -0.65, 1.2), (1.0, 0.62, 1.27), M['dumpster'], STATIC, 1.0))
    for x in (-0.8, 0.8):
        for y in (-0.45, 0.45):
            o.append(lib.cylinder('wheel', (x, y, 0.0), 0.08, 0.12, M['rubber'], STATIC, 6))
    for p in o:
        p.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z') @ p.matrix_world
    return o


def park_bench(loc, rot):
    """A cast-iron park bench with wooden slats; front faces local -Y. Returns the seat point."""
    parts = []
    for x in (-0.82, 0.82):
        parts.append(lib.box('bench_leg', (x - 0.03, -0.26, 0.0), (x + 0.03, -0.2, 0.45), M['iron'], STATIC))
        parts.append(lib.box('bench_leg', (x - 0.03, 0.17, 0.0), (x + 0.03, 0.23, 0.86), M['iron'], STATIC))
        parts.append(lib.box('bench_rail', (x - 0.03, -0.28, 0.4), (x + 0.03, 0.23, 0.45), M['iron'], STATIC))
        parts.append(lib.box('bench_arm', (x - 0.035, -0.3, 0.63), (x + 0.035, 0.2, 0.67), M['iron'], STATIC))
        parts.append(lib.box('bench_arm_post', (x - 0.025, -0.27, 0.45), (x + 0.025, -0.23, 0.63), M['iron'], STATIC))
    for y0, y1 in ((-0.27, -0.12), (-0.1, 0.04), (0.06, 0.2)):
        parts.append(lib.box('bench_slat', (-0.92, y0, 0.45), (0.92, y1, 0.485), M['wood'], STATIC, 0.6))
    for z0, z1 in ((0.55, 0.66), (0.71, 0.82)):
        parts.append(lib.box('bench_slat', (-0.92, 0.2, z0), (0.92, 0.235, z1), M['wood'], STATIC, 0.6))
    T = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
    for p in parts:
        p.matrix_world = T @ p.matrix_world
    return T @ Vector((0.0, -0.05, 0.0))


def cone(loc):
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=0.17, radius2=0.03, depth=0.7)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(loc) + Vector((0, 0, 0.38)))
    o = lib.mesh_object('cone', bm, M['cone'], STATIC)
    lib.box_uv(o, 1.0)
    lib.box('cone_base', (loc[0] - 0.22, loc[1] - 0.22, loc[2]), (loc[0] + 0.22, loc[1] + 0.22, loc[2] + 0.03), M['cone'], STATIC, 1.0)


def news_box(loc, rot, colour):
    mat = lib.flat(f'newsbox_{colour[0]:.2f}', colour, rough=0.45, metal=0.2)
    parts = [lib.box('newsbox', (-0.25, -0.22, 0.35), (0.25, 0.22, 1.05), mat, STATIC, 1.0),
             lib.box('newsbox_leg', (-0.2, -0.18, 0.0), (0.2, 0.18, 0.35), M['shop_trim'], STATIC, 1.0)]
    reg = REG['news_rack']
    parts.append(lib.quad('newsbox_window', [(-0.2, -0.225, 0.55), (0.2, -0.225, 0.55), (0.2, -0.225, 0.95), (-0.2, -0.225, 0.95)],
                          lib.atlas_uv((reg[0] + 128, reg[1], 128, 128), ATLAS), M['signs'], STATIC))
    for p in parts:
        p.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z') @ p.matrix_world


def street_sign(loc, regions):
    lib.cylinder('sign_pole', loc, 0.04, 3.1, M['shop_trim'], STATIC, 8)
    for i, (reg, rot) in enumerate(regions):
        z = loc[2] + 2.75 + i * 0.22
        R = Matrix.Rotation(rot, 4, 'Z')
        c = Vector(loc)
        for flip in (1, -1):
            pts = [Vector((-0.6 * flip, 0.012 * flip, 0)), Vector((0.6 * flip, 0.012 * flip, 0)), Vector((0.6 * flip, 0.012 * flip, 0.2)), Vector((-0.6 * flip, 0.012 * flip, 0.2))]
            pts = [c + R @ p + Vector((0, 0, z - loc[2])) for p in pts]
            lib.quad('street_sign', pts, lib.atlas_uv(REG[reg], ATLAS), M['signs'], STATIC)


def obelisk():
    s = M['stone']
    lib.box('memorial_step', (-1.6, -1.6, Z0), (1.6, 1.6, Z0 + 0.3), M['granite'], STATIC, 1.0)
    lib.box('memorial_base', (-1.0, -1.0, Z0 + 0.3), (1.0, 1.0, Z0 + 1.5), s, STATIC, 1.0)
    lib.box('memorial_cap', (-1.15, -1.15, Z0 + 1.5), (1.15, 1.15, Z0 + 1.7), s, STATIC, 1.0)
    import bmesh
    bm = bmesh.new()
    lo, hi, z0, z1 = 0.45, 0.28, Z0 + 1.7, Z0 + 8.2
    b = [bm.verts.new((sx * lo, sy * lo, z0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = [bm.verts.new((sx * hi, sy * hi, z1)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    apex = bm.verts.new((0, 0, z1 + 0.6))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new([b[i], b[j], t[j], t[i]])
        bm.faces.new([t[i], t[j], apex])
    o = lib.mesh_object('memorial_shaft', bm, s, STATIC)
    lib.box_uv(o, 1.5)


def skyline():
    rnd = random.Random(41)
    n = 0
    while n < 46:
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(230, 430)
        x, y = math.cos(a) * r, math.sin(a) * r + 30
        w, dpt, h = rnd.uniform(18, 38), rnd.uniform(18, 34), rnd.uniform(30, 150)
        lib.box('tower', (x - w / 2, y - dpt / 2, 0), (x + w / 2, y + dpt / 2, h), M['skyline'], STATIC, 28.0, faces=('+x', '-x', '+y', '-y'))
        lib.box('tower_top', (x - w / 2, y - dpt / 2, h - 0.01), (x + w / 2, y + dpt / 2, h), M['roof'], STATIC, 10.0, faces=('+z',))
        n += 1


# ------------------------------------------------------------------ assemble
ground()
bank()
newsstand()
obelisk()
skyline()

rows = []
# West row, fronts face east onto the square and the west side street (x = -21).
W = [  # (y0, y1, floors, kit, wall, shop)
    (-18, -6, 4, APT, 'sand', dict(sign='hardware', door_bay=1, decal=[(3, 'open')])),
    (-6, 6, 3, FAC, 'brick', dict(sign='bakery', door_bay=1, glass='clear', awning='red', door_node='bakery_door', decal=[(0, 'open')])),
    (6, 18, 5, APT, 'grey', dict(sign='pharmacy', door_bay=2)),
    (18, 33, 4, FAC, 'brick_dark', dict(sign='laundromat', door_bay=1)),
    (33, 45, 3, APT, 'brownstone', dict(sign=None, door_bay=1, decal=[(0, 'for_lease'), (3, 'for_lease')])),
    (45, 63, 4, FAC, 'brick', dict(sign='furniture', door_bay=2, decal=[(0, 'closing_sale'), (1, 'closing_sale'), (4, 'closing_sale')])),
]
E = [
    (-18, -6, 3, FAC, 'brick_dark', dict(sign='diner', door_bay=2, awning='green', decal=[(0, 'open')])),
    (-6, 6, 4, APT, 'cream', dict(sign='home_loans', door_bay=1)),
    (6, 18, 5, FAC, 'brick', dict(sign='cafe', door_bay=1, awning='green')),
    (18, 33, 3, APT, 'brownstone', dict(sign=None, door_bay=2, decal=[(1, 'for_lease')])),
    (33, 45, 4, FAC, 'brick_dark', dict(sign='real_estate', door_bay=1, decal=[(0, 'for_sale'), (3, 'for_sale')])),
    (45, 63, 3, APT, 'sand', dict(sign='grocery', door_bay=3)),
]
for i, (y0, y1, fl, kit, wall, shop) in enumerate(W):
    prev = W[i - 1][2] if i > 0 else 0
    nxt = W[i + 1][2] if i < len(W) - 1 else 0
    sides = {'E': 'front', 'W': 'flat', 'S': ('hidden', prev) if i > 0 else 'back', 'N': ('hidden', nxt) if i < len(W) - 1 else 'flat'}
    if i == 0:
        sides['S'] = ('hidden', 4)   # the south row's corner building stands behind it
    parts, top = building(f'west_{i}', (-33, y0, -21, y1), fl, kit, wall, sides, {'E': shop})
for i, (y0, y1, fl, kit, wall, shop) in enumerate(E):
    prev = E[i - 1][2] if i > 0 else 0
    nxt = E[i + 1][2] if i < len(E) - 1 else 0
    sides = {'W': 'front', 'E': 'flat', 'S': ('hidden', prev) if i > 0 else ('hidden', 4), 'N': ('hidden', nxt) if i < len(E) - 1 else 'flat'}
    building(f'east_{i}', (21, y0, 33, y1), fl, kit, wall, sides, {'W': shop})
# South row, fronts face north onto the square (y = -18). Corner buildings first and last.
S = [(-33, -21, 4, APT, 'cream', None), (-21, -9, 3, FAC, 'brick', 'grocery'), (-9, 0, 4, APT, 'grey', None),
     (0, 12, 5, FAC, 'brick_dark', 'electronics'), (12, 21, 3, APT, 'sand', 'cafe'), (21, 33, 4, FAC, 'brick', None)]
for i, (x0, x1, fl, kit, wall, shop) in enumerate(S):
    prev = S[i - 1][2] if i > 0 else 0
    nxt = S[i + 1][2] if i < len(S) - 1 else 0
    corner = i in (0, len(S) - 1)
    sides = {'N': ('hidden', 9) if corner else 'front', 'S': 'flat',
             'W': ('hidden', prev) if i > 0 else 'flat', 'E': ('hidden', nxt) if i < len(S) - 1 else 'flat'}
    shop_kw = None
    if shop == 'grocery':
        shop_kw = {'N': dict(sign=None, door_bay=1, decal=[(0, 'for_lease'), (2, 'closed')])}
    elif shop == 'electronics':
        shop_kw = {'N': dict(sign=None, door_bay=2, decal=[(0, 'closing_sale'), (3, 'closing_sale')])}
    elif shop == 'cafe':
        shop_kw = {'N': dict(sign='cafe', door_bay=1)}
    building(f'south_{i}', (x0, -30, x1, -18), fl, kit, wall, sides, shop_kw)
# North block: two buildings with backs (fire escapes) on the alley and a gated passage between.
for name, (x0, x1), fl, kit, wall in (('north_0', (-8, -2), 4, FAC, 'brick'), ('north_1', (2, 8), 3, APT, 'brownstone')):
    building(name, (x0, 46, x1, 64), fl, kit, wall, {'S': 'back', 'N': 'flat', 'E': 'rear', 'W': 'rear'})
# The factory: long brick front on the north street, sawtooth roof, chimney behind.
building('factory', (-30, 76, 30, 100), 4, FAC, 'brick_dark', {'S': 'front', 'E': 'flat', 'W': 'flat', 'N': 'flat'}, crown=True, lod='far')
for name, rect in (('filler_nw', (-60, 76, -36, 100)), ('filler_ne', (36, 76, 60, 100)), ('filler_w', (-48, 64, -36, 76)), ('filler_e', (36, 64, 48, 76))):
    # No seat sees them (the side rows and the north block stand in between): plain walls all round.
    building(name, rect, 3, APT if 'w' in name else FAC, 'grey' if 'w' in name else 'brick', {'S': 'flat', 'E': 'flat', 'N': 'flat', 'W': 'flat'}, crown=False, lod='far')
fz = Z0 + GROUND_H + BAND + 3 * FLOOR_H
lib.facade_quad('factory_sign', (-12, 76, 0), (1, 0, 0), 0.0, 24.0, fz - 1.2, fz + 0.3, 0.02, REG['factory'], ATLAS, M['signs'], STATIC)
for k in range(6):
    x = -27 + k * 9
    import bmesh
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((x, 78, fz + 0.3), (x + 9, 78, fz + 0.3), (x + 9, 98, fz + 0.3), (x, 98, fz + 0.3),
                                    (x, 78, fz + 4.0), (x, 98, fz + 4.0))]
    bm.faces.new([vs[0], vs[1], vs[4]]); bm.faces.new([vs[3], vs[5], vs[2]])
    bm.faces.new([vs[1], vs[2], vs[5], vs[4]])
    o = lib.mesh_object('sawtooth', bm, M['roof'], STATIC); lib.box_uv(o, 4.0)
    lib.quad('sawtooth_glass', [(x, 98, fz + 0.3), (x, 78, fz + 0.3), (x, 78, fz + 4.0), (x, 98, fz + 4.0)], [(0, 0), (1, 0), (1, 1), (0, 1)], M['glass'], STATIC)
lib.cylinder('chimney', (14, 96, fz), 1.6, 34.0, TINTS['brick_dark'], STATIC, 16, 3.0)
lib.cylinder('chimney_cap', (14, 96, fz + 34.0), 1.85, 0.8, M['curb'], STATIC, 16, 1.0)
lib.cylinder('water_tank', (-18, 88, fz + 3.2), 2.2, 3.6, lib.pbr('tank_wood', 'concrete_floor_02', 512, 0, tint=(0.55, 0.42, 0.3), rough=0.85, metal=0.0), STATIC, 14, 2.0)
for (x, y) in ((-19.5, 86.5), (-16.5, 86.5), (-19.5, 89.5), (-16.5, 89.5)):
    lib.box('tank_leg', (x - 0.1, y - 0.1, fz), (x + 0.1, y + 0.1, fz + 3.2), M['shop_trim'], STATIC, 1.0)
lib.cylinder('water_tank_roof', (-18, 88, fz + 6.8), 2.3, 0.3, M['shop_trim'], STATIC, 14, 1.0)
bakery_interior(-21.0, -6.0, 6.0)

# Fire escapes on the alley backs of the north block.
for x0, fl in ((-8, 4), (2, 3)):
    for f in range(1, fl):
        z = Z0 + GROUND_H + BAND + (f - 1) * FLOOR_H
        prop('fire_escape_platform', (x0 + 3.0, 45.3, z - 0.1), 0.0)
        if f < fl - 1:
            prop('fire_escape_stairs', (x0 + 3.0, 45.3, z - 0.1), 0.0)
    prop('fire_escape_ladder', (x0 + 4.6, 45.0, Z0 + 0.6), 0.0)
# The alley gate: two leaves on their hinges, separate nodes.
gate = lib.import_gltf(os.path.join(C, 'large_iron_gate', 'large_iron_gate_1k.gltf'), LIB)
for side, key, hx in (('left', 'large_iron_gate_left_door', -1.48), ('right', 'large_iron_gate_right_door', 1.48)):
    o = gate[key]
    lib.decimate(o, target=1400)
    o.data.transform(Matrix.Translation((-hx, 0, 0)))
    o.name = f'alley_gate_{side}'
    for c in list(o.users_collection):
        c.objects.unlink(o)
    NODES.objects.link(o)
    o.matrix_world = Matrix.Translation((hx * 1.35, 46.25, 0.0)) @ Matrix.Scale(1.35, 4)
lib.box('gate_post', (-2.2, 46.0, 0.0), (-2.0, 46.5, 4.2), M['curb'], STATIC, 1.0)
lib.box('gate_post', (2.0, 46.0, 0.0), (2.2, 46.5, 4.2), M['curb'], STATIC, 1.0)
lib.box('gate_header', (-2.2, 46.1, 3.95), (2.2, 46.4, 4.2), M['shop_trim'], STATIC, 1.0)
lib.box('passage_floor', (-2.0, 46.0, 0.0), (2.0, 64.0, 0.006), M['alley'], STATIC, 3.0, faces=('+z',))
for x in (-2.0, 2.0):
    lib.box('passage_wall', (x - 0.01, 46.0, 0.0), (x + 0.01, 64.0, 4.0), M['curb'], STATIC, 2.0, faces=('+x', '-x'))

# Alley clutter.
dumpster((-4.5, 41.3, 0.0), 0.0)
dumpster((6.6, 44.8, 0.0), math.pi)
for p in [(-6.9, 41.0), (-6.4, 41.5), (-2.8, 44.9), (5.0, 44.6), (5.4, 45.1), (-7.2, 44.8)]:
    prop('trashbag', (p[0], p[1], 0.0), random.uniform(0, 6.28))
prop('trash_rust', (-7.4, 45.2, 0.0), 1.0)
prop('trash_rust', (7.5, 41.1, 0.0), 2.2)
prop('utility', (-7.6, 40.3, 0.0), math.pi)
prop('shutter', (-5.0, 46.0, Z0 - 0.15), 0.0, name='north_back_door')
prop('shutter', (5.0, 46.0, Z0 - 0.15), 0.0)
prop('covered_car', (9.0, 43.0, 0.0), math.pi / 2)
for x in (-6.0, 4.0):
    prop('aircon', (x, 45.7, 5.0), 0.0)

# Boundaries: a construction fence across the west side street, a box truck across the east one.
for k in range(5):
    x = -20.5 + k * 2.0
    prop('fence_panel', (x + 1.0, 63.0, 0.0), 0.0)
    prop('fence_post', (x, 63.0, 0.0), 0.0)
prop('fence_post', (-10.5, 63.0, 0.0), 0.0)
for x in (-17.2, -14.6, -12.0):
    prop('barrier', (x, 61.8, 0.0), random.uniform(-0.1, 0.1))
for x, y in ((-16.0, 60.4), (-13.2, 60.6), (-18.6, 61.0)):
    cone((x, y, 0.0))
vehicle('box_truck', (14.2, 63.5, 0.0), math.radians(78))
prop('barrier', (11.8, 61.4, 0.0), 0.2)
cone((16.8, 61.2, 0.0))

# Parked cars along the curbs.
vehicle('car_sedan', (-16.9, 4.0, 0.0), math.pi / 2)
vehicle('car_old', (16.9, -4.0, 0.0), -math.pi / 2)
vehicle('van', (-6.0, -14.0, 0.0), 0.0)
vehicle('pickup', (-16.9, 38.0, 0.0), math.pi / 2)
vehicle('car_sedan', (16.9, 30.0, 0.0), -math.pi / 2)
vehicle('car_old', (8.0, -14.0, 0.0), math.pi)

# Street furniture.
for (x, y) in [(-10.2, -7.2), (10.2, -7.2), (-10.2, 7.2), (10.2, 7.2), (-19.0, -10.0), (-19.0, 12.0), (19.0, -10.0), (19.0, 12.0),
               (-9.6, 28.0), (9.6, 28.0), (-19.0, 40.0), (19.0, 40.0), (-6.0, -16.2), (6.0, -16.2)]:
    prop('lamp', (x, y, Z0), math.atan2(-y, -x) + math.pi / 2)
SEAT = park_bench((0.0, 3.3, Z0), math.pi)            # the player's bench, facing the bank
for (x, y, r) in [(-3.4, 3.3, math.pi), (3.4, 3.3, math.pi), (-3.4, -3.3, 0.0), (3.4, -3.3, 0.0), (-7.0, 0.0, math.pi / 2), (6.4, -1.6, -math.pi / 2)]:
    park_bench((x, y, Z0), r)
for (x, y) in [(-18.6, 8.0), (18.6, -8.0), (-10.6, 34.0)]:
    prop('hydrant', (x, y, Z0), random.uniform(0, 6.28))
for (x, y) in [(-9.0, 6.6), (9.0, -6.6), (-19.2, -2.0), (19.2, 3.0), (-1.8, 15.6)]:
    prop('trash', (x, y, Z0), random.uniform(0, 6.28))
prop('chalkboard', (-19.4, 2.2, Z0), -math.pi / 2)
prop('utility', (19.4, 16.0, Z0), -math.pi / 2)
news_box((5.0, 15.6, Z0), math.pi, (0.12, 0.25, 0.55))
news_box((5.6, 15.6, Z0), math.pi, (0.7, 0.12, 0.1))
news_box((6.2, 15.6, Z0), math.pi, (0.85, 0.7, 0.12))
street_sign((-10.6, 15.4, Z0), [('street_main', 0.0), ('street_bank', math.pi / 2)])
street_sign((10.6, -7.6 - 7.4, Z0), [('street_main', 0.0), ('street_mill', math.pi / 2)])

# Points the game uses: seats (floor point under the seated player; add eye height), spots.
lib.empty('seat_plaza', tuple(SEAT), 0.0, POINTS)                # under the plaza bench's seat (seat top +0.485), facing the bank
lib.empty('seat_bank_steps', (-3.0, 16.6, Z0), 0.0, POINTS)      # bank-front sidewalk, facing the door
lib.empty('seat_bakery', (-18.7, -1.0, Z0), math.pi / 2, POINTS)  # west sidewalk, 2.3 m from the bakery window, facing west
lib.empty('seat_newsstand', (4.2, 4.5, Z0), -math.pi / 2, POINTS)  # facing the kiosk counter (east)
lib.empty('seat_alley', (0.0, 42.0, 0.0), 0.0, POINTS)           # in the alley, facing the gate (north)
lib.empty('seat_factory_view', (-14.5, 56.0, 0.0), 0.0, POINTS)  # west side street, factory beyond the fence
lib.empty('spot_parrot_perch', (0.82, 3.3, Z0 + 0.67), 0.0, POINTS)   # armrest of the plaza bench
lib.empty('spot_bank_manager', (1.2, 23.6, 1.19), math.pi, POINTS)
lib.empty('spot_baker', (-23.4, 0.0, Z0), -math.pi / 2, POINTS)
lib.empty('spot_newsvendor', (7.6, 4.5, Z0), math.pi / 2, POINTS)
lib.empty('spot_factory_gate', (0.0, 74.8, Z0), math.pi, POINTS)

# ------------------------------------------------------------------ finish: make real, merge per material, export
_count = {}
for o in STATIC.all_objects:
    if o.type == 'MESH':
        k = o.data.name if o.data.users > 1 else o.name.split('.')[0]
        t = lib.tris(o) if k not in _count else _count[k][1]
        _count[k] = (_count.get(k, (0, t))[0] + 1, t)
for k, (n, t) in sorted(_count.items(), key=lambda kv: -kv[1][0] * kv[1][1])[:40]:
    print(f'TRIS {k:50s} x{n:4d} {t:6d} = {n * t}')
if os.environ.get('TAG_TRIS'):
    _tag = {}
    for o in STATIC.all_objects:
        if o.type == 'MESH':
            k = o.get('tag', 'other:' + o.name.split('.')[0])
            _tag[k] = _tag.get(k, 0) + lib.tris(o)
    for k, t in sorted(_tag.items(), key=lambda kv: -kv[1]):
        print(f'TAG {k:40s} {t}')
lib.no_transmission()
lib.split_multi_material(STATIC)
for o in list(STATIC.all_objects) + list(NODES.all_objects):
    if o.type == 'MESH' and o.data.users > 1:
        o.data = o.data.copy()
lib.fix_uv_names(list(STATIC.all_objects) + list(NODES.all_objects))
lib.apply([o for o in STATIC.all_objects if o.type == 'MESH'])
# Textures: surfaces seen up close and over large areas keep 1024 colour / 512 normal;
# small props drop to 512 / 256; roughness-metal maps are coarse anyway.
HERO = ('asphalt_02', 'concrete_tiles', 'herringbone_brick', 'white_sandstone', 'concrete_floor_worn',
        'facade_plaster', 'apartments_facade_trim_01', 'apartments_facade_objects', 'factory_facade_brick',
        'factory_facade_windows', 'factory_facade_trim_01')
def limit(img):
    n = img.name.lower()
    if n.startswith('signs'):
        return 2048
    if n.startswith('skyline'):
        return 256
    if '_atlas' in n:
        return 512
    hero = any(h in n for h in HERO)
    data = img.colorspace_settings.name == 'Non-Color'
    is_normal = 'nor' in n
    if hero:
        return 512 if is_normal else (256 if data else 1024)
    return 256 if is_normal else (128 if data else 512)
lib.strip_normal_maps(('croissant', 'water_manhole', 'trashbag', 'standing_chalkboard', 'utility_box', 'rollershutter', 'covered_car',
                       'exterior_aircon', 'chainlink', 'concrete_road_barrier', 'metal_trash_can', 'fire_escape'))
lib.shrink_images(limit)
# Fewer materials, so fewer draw calls (art/v2/tools/atlas.py): copies folded, tints moved
# into a vertex colour, props, vehicles and plain colours into two atlases.
_static = [o for o in STATIC.all_objects if o.type == 'MESH']
print('SAME', atlas.same_materials(_static))
_mat = lambda n: bpy.data.materials[n]
print('TINT', atlas.tint_by_vertex(_static, {
    PLASTER: [TINTS['brownstone'], TINTS['sand'], TINTS['grey'], TINTS['cream']],
    BRICK: [TINTS['brick_dark']],
    M['kiosk']: [M['dumpster']],
    M['curb']: [_mat('tank_wood')],
    M['alley']: [M['roof']],
}))
_used = {o.data.materials[0].name: o.data.materials[0] for o in _static if o.data.materials and o.data.materials[0]}
def _pick(prefixes):
    return [m for n, m in sorted(_used.items()) if any(re.sub(r'\.\d{3}$', '', n) == p or n.startswith(p + '_') for p in prefixes)]
PROPS_A = ['street_lamp_01', 'fire_hydrant', 'metal_trash_can', 'metal_trash_can_rust', 'utility_box_01', 'water_manhole_cover',
           'standing_chalkboard_01_frame', 'standing_chalkboard_01_board', 'croissant', 'concrete_road_barrier_02',
           'exterior_aircon_unit_01', 'rollershutter_door', 'trashbag', 'covered_car', 'modular_chainlink_fence_posts']
PLAIN = ['road_paint', 'window_glass', 'shop_glass', 'shop_trim', 'bronze', 'bakery_wall', 'cone_orange', 'rubber_black', 'cast_iron', 'newsbox']
PROPS_B = ['car_sedan_atlas', 'car_old_atlas', 'van_atlas', 'box_truck_atlas', 'pickup_atlas', 'modular_fire_escape_01', 'modular_fire_escape_02']
atlas.atlas(_static, _pick(PROPS_A) + _pick(PLAIN), 'street_props', 4, 4, 512)
atlas.atlas(_static, _pick(PROPS_B), 'vehicles_escapes', 4, 2, 512, flat_cell=False)
atlas.strip_other_colours(list(STATIC.all_objects) + list(NODES.all_objects))
merged = lib.merge_by_material(list(STATIC.all_objects), 'mahalle', STATIC)
t, calls = lib.stats(STATIC)
# Triangles in view from the plaza seat looking at the bank (110 x 96 degree field, like a headset).
def in_view(eye, yaw_deg, hfov=110, vfov=96, far=600.0):
    eye = Vector(eye)
    fwd = Vector((math.sin(math.radians(-yaw_deg)), math.cos(math.radians(-yaw_deg)), 0))
    right = Vector((fwd.y, -fwd.x, 0))
    th, tv = math.tan(math.radians(hfov / 2)), math.tan(math.radians(vfov / 2))
    n = 0
    for o in list(STATIC.all_objects) + list(NODES.all_objects):
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        mw = o.matrix_world
        for tri in me.loop_triangles:
            c = mw @ tri.center
            v = c - eye
            z = v.dot(fwd)
            if z <= 0.05 or z > far:
                continue
            if abs(v.dot(right)) <= z * th and abs(v.z) <= z * tv:
                n += 1
    return n
VIEW = {name: in_view(e, yaw) for name, e, yaw in (('plaza_to_bank', (0.0, 3.4, 1.4), 0), ('plaza_to_bakery', (0.0, 3.4, 1.4), 90),
                                                   ('plaza_to_south', (0.0, 3.4, 1.4), 180), ('alley', (0.0, 42.0, 1.4), 0))}
print('VIEW', VIEW)
tn, cn = lib.stats(NODES)
print(f'STATS static tris {t} calls {calls}; nodes tris {tn} calls {cn}; materials {len(bpy.data.materials)}')
lib.write_json(os.path.join(os.path.dirname(OUT), 'stats.json'), {'triangles': t + tn, 'draw_calls': calls + cn, 'in_view': VIEW})
EXPORT = lib.collection('export')
for c in (STATIC, NODES, POINTS):
    EXPORT.children.link(c)
    bpy.context.scene.collection.children.unlink(c)
lib.export_glb(OUT, EXPORT, vertex_color='ACTIVE')
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
if PREVIEW:
    hdri = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
    views = [
        ('seat_plaza', (0.0, 3.25, Z0 + 1.2), (0.0, 30.0, 7.0), 18),
        ('to_bakery', (0.0, 3.25, Z0 + 1.2), (-22.0, 0.0, 3.0), 18),
        ('to_south', (4.0, 2.4, Z0 + 1.2), (4.0, -30.0, 6.0), 18),
        ('side_street', (-14.5, 18.0, 1.6), (-14.5, 80.0, 6.0), 22),
        ('alley', (-9.0, 43.0, 1.6), (6.0, 45.0, 4.0), 18),
        ('overview', (-70.0, -70.0, 60.0), (0.0, 20.0, 0.0), 28),
    ]
    if os.environ.get('PREVIEW_ONLY'):
        views = [v for v in views if v[0] in os.environ['PREVIEW_ONLY'].split(',')]
    lib.render_views(views, PREVIEW, 'mahalle', hdri, size=(960, 540), samples=16)
print('DONE', OUT)
