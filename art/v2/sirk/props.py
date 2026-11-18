"""
Circus props for the three acts, one GLB each:

  nice -n 20 blender -b --factory-startup --python art/v2/sirk/props.py -- <prop> <out.glb> <tex_dir> [--preview dir]

prop: unicycle | balance_pole | cannon | trapeze
tex_dir holds the pictures from art/v2/sirk/props_textures.py.

Sizes, pivots and node names follow the shapes the game builds today (circus-show.ts
buildUnicycle and buildPole, circus-cannon.ts buildCannon, circus-trapeze.ts buildTrapeze),
so each file can take their place. Coordinates here are Blender's (Z up); the glTF export
turns Blender -Y into three.js +Z, so three.js (x, y, z) is Blender (x, -z, y).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
PROP, OUT, TEX = argv[0], argv[1], argv[2]
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')

lib.reset()
COLL = lib.collection(PROP)


def T(x, y, z):
    """A three.js position as Blender coordinates."""
    return Vector((x, -z, y))


def obj(name, bm, mat=None, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    for m in (mat if isinstance(mat, (list, tuple)) else [mat] if mat else []):
        me.materials.append(m)
    if parent is not None:
        o.parent = parent
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    e.location = loc
    COLL.objects.link(e)
    if parent is not None:
        e.parent = parent
    return e


def merge(bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        b.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    return out


def tube(p0, p1, r0, r1=None, seg=12, caps=True):
    """A cylinder (or cone) from p0 to p1 (Blender coordinates), u round, v along."""
    r1 = r0 if r1 is None else r1
    p0, p1 = Vector(p0), Vector(p1)
    bm = bmesh.new()
    ln = (p1 - p0).length
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=ln, calc_uvs=True)
    bmesh.ops.translate(bm, vec=(0, 0, ln / 2), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference((p1 - p0).normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=p0, verts=bm.verts)
    return bm


def torus(R, r, seg=40, rseg=10, axis='Y', centre=(0, 0, 0), arc=2 * math.pi, squash=1.0):
    """A torus in the plane normal to `axis` (Blender axis letter), optionally only an arc
    (starting at +X, turning toward +Z for axis Y). squash scales the tube across the ring."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    full = abs(arc - 2 * math.pi) < 1e-6
    n = seg if full else seg + 1
    rings = []
    for i in range(n):
        a = arc * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            rr = R + r * math.cos(b)
            # ring in the XZ plane (normal Y)
            p = Vector((rr * math.cos(a), r * math.sin(b) * squash, rr * math.sin(a)))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(seg):
        a, b_ = rings[i], rings[(i + 1) % n]
        for j in range(rseg):
            f = bm.faces.new((a[j], b_[j], b_[(j + 1) % rseg], a[(j + 1) % rseg]))
            for l, (uu, vv) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                l[uv].uv = (uu / seg, vv / rseg)
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z'))
    elif axis == 'Z':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def lathe_x(profile, seg=32, u_scale=1.0):
    """profile: (x, radius) points; spun about the Blender X axis. u runs round from the
    bottom line (u = 0) over the top line (u = 0.5), v = x along (0 at the lowest x)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    rings = []
    for x, r in profile:
        ring = []
        for j in range(seg):
            a = math.pi + 2 * math.pi * j / seg      # j = 0 at the bottom, seg / 2 on the top line
            ring.append(bm.verts.new((x, r * math.sin(a), r * math.cos(a))))
        rings.append(ring)
    xs = [p[0] for p in profile]
    x0, x1 = min(xs), max(xs)
    for i in range(len(rings) - 1):
        for j in range(seg):
            jn = (j + 1) % seg
            f = bm.faces.new((rings[i][j], rings[i][jn], rings[i + 1][jn], rings[i + 1][j]))
            for l, (ii, jj) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                l[uv].uv = (jj / seg, ((profile[ii][0] - x0) / (x1 - x0) if x1 > x0 else ii / (len(profile) - 1)) * u_scale)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def sphere(r, centre, seg=16, rings=10, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, calc_uvs=True)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    return bm


def box(size, centre, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES', profile=0.5)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    return bm


def textured(name, path, rough=0.6, metal=0.0, orm=None):
    m = lib.new_material(name)
    b = lib._principled(m)
    nt = m.node_tree
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = lib.image(path)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if orm:
        o = nt.nodes.new('ShaderNodeTexImage')
        o.image = lib.image(orm, colorspace='Non-Color')
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(o.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    else:
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
    return m


# Metals stay below 0.6 metalness: the tent has no environment map, and a full metal shows black there.
CHROME = lambda: lib.flat('chrome', (0.8, 0.81, 0.83), rough=0.25, metal=0.6)  # noqa: E731
BRASS = lambda: lib.flat('brass', (0.86, 0.66, 0.30), rough=0.3, metal=0.55)  # noqa: E731
GOLD = lambda: lib.flat('gold_trim', (0.85, 0.62, 0.22), rough=0.35, metal=0.55)  # noqa: E731


# ---------------------------------------------------------------- unicycle

def unicycle():
    """Origin where the tyre meets the wire; travel along three.js +X; the wheel turns about
    three.js Z (Blender Y) at its hub, 0.25 m up; pedals hang on the cranks."""
    CRANK = 0.115
    top = empty('Unicycle')
    wheel = empty('UnicycleWheel', T(0, 0.25, 0), top)
    red = lib.flat('tyre_red', (0.30, 0.025, 0.035), rough=0.75)
    black = lib.flat('rubber_black', (0.03, 0.03, 0.03), rough=0.85)
    leather = lib.flat('saddle_leather', (0.16, 0.08, 0.045), rough=0.5)
    amber = lib.flat('reflector', (1.0, 0.55, 0.05), rough=0.3, emissive=(1.0, 0.45, 0.0))
    chrome = CHROME()
    # tyre: a fat torus with a slightly flattened tread, outer edge exactly 0.25 m from the hub
    tyre = torus(0.222, 0.028, seg=48, rseg=12, axis='Y', squash=1.05)
    # tread ribs: a ring of shallow blocks round the crown
    rib = []
    for k in range(48):
        a = 2 * math.pi * (k + 0.5) / 48
        c = Vector((0.249 * math.cos(a), 0, 0.249 * math.sin(a)))
        b_ = box((0.012, 0.03, 0.006), (0, 0, 0))
        bmesh.ops.rotate(b_, verts=b_.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-a + math.pi / 2, 3, 'Y'))
        bmesh.ops.translate(b_, vec=c, verts=b_.verts)
        rib.append(b_)
    obj('unicycle_tyre', merge([tyre] + rib), red, wheel)
    rim = torus(0.2, 0.013, seg=48, rseg=8, axis='Y', squash=1.6)
    hub = merge([tube((0, -0.05, 0), (0, 0.05, 0), 0.022, seg=16),
                 tube((0, -0.042, 0), (0, -0.034, 0), 0.04, seg=16), tube((0, 0.034, 0), (0, 0.042, 0), 0.04, seg=16)])
    spokes = []
    for k in range(32):
        side = 1 if k % 2 else -1
        a_hub = 2 * math.pi * k / 32
        a_rim = a_hub + side * 0.35          # crossed lacing
        p0 = Vector((0.037 * math.cos(a_hub), side * 0.038, 0.037 * math.sin(a_hub)))
        p1 = Vector((0.192 * math.cos(a_rim), side * 0.006, 0.192 * math.sin(a_rim)))
        spokes.append(tube(p0, p1, 0.0018, seg=4, caps=False))
    # cranks to each side, half a turn apart (left toward three.js -Z = Blender +Y)
    cranks = []
    for side, sy in ((-1, 0.085), (1, -0.085)):
        cranks.append(tube((0, sy, 0), (side * CRANK, sy, 0), 0.011, 0.008, seg=8))
        cranks.append(tube((side * CRANK, sy - 0.006 * side, 0), (side * CRANK, sy + 0.035 * (1 if sy > 0 else -1), 0), 0.006, seg=8))
    obj('unicycle_wheel_metal', merge([rim, hub] + spokes + cranks), chrome, wheel)
    for side, label in ((-1, 'left'), (1, 'right')):
        p = empty(f'Pedal {label}', T(side * CRANK, 0, side * 0.135), wheel)
        tread = box((0.1, 0.085, 0.018), (0, 0, 0), bevel=0.003)
        for gy in (-0.03, 0, 0.03):
            tread = merge([tread, box((0.104, 0.006, 0.006), (0, gy, 0.011))])
        obj(f'pedal_{label}', tread, black, p)
        refl = merge([box((0.006, 0.05, 0.012), (e * 0.053, 0, 0)) for e in (-1, 1)])
        obj(f'pedal_{label}_reflectors', refl, amber, p)
    # fork: two legs from the bearings at the hub to the crown, the crown, the seat post
    fork = []
    for sy in (0.06, -0.06):
        fork.append(tube((0, sy, 0.25), (0, sy, 0.61), 0.011, seg=10))
        fork.append(tube((0, sy - 0.012 * (1 if sy > 0 else -1), 0.25), (0, sy + 0.014 * (1 if sy > 0 else -1), 0.25), 0.02, seg=12))
    fork.append(tube((0, -0.072, 0.61), (0, 0.072, 0.61), 0.016, seg=12))
    fork.append(tube((0, 0, 0.6), (0, 0, 0.89), 0.0145, seg=12))
    fork.append(tube((0, 0, 0.83), (0, 0, 0.87), 0.019, seg=12))        # seat clamp
    obj('unicycle_frame', merge(fork), chrome, top)
    # saddle: a long padded seat (along three.js X), nose and tail turned up, top at 0.95 m
    s = sphere(1.0, (0, 0, 0), seg=24, rings=12)
    for v in s.verts:
        x, y, z = v.co
        v.co = Vector((x * 0.15, y * 0.066, z * 0.032))
        # turn the ends up and make the middle a little narrower
        v.co.z += 0.018 * (v.co.x / 0.15) ** 2
        v.co.y *= 1.0 - 0.18 * (1 - (v.co.x / 0.15) ** 2)
    bmesh.ops.translate(s, vec=(0, 0, 0.95 - 0.032 - 0.018 * 0.0), verts=s.verts)
    zmax = max(v.co.z for v in s.verts)
    bmesh.ops.translate(s, vec=(0, 0, 0.95 - zmax), verts=s.verts)
    handle = torus(0.028, 0.0075, seg=16, rseg=6, axis='Y', centre=(0.15, 0, 0.935), arc=math.pi)
    obj('unicycle_saddle', merge([s, handle]), leather, top)
    bumpers = merge([torus(0.035, 0.006, seg=12, rseg=6, axis='Y', centre=(e * 0.155, 0, 0.9), arc=math.pi) for e in (-1, 1)])
    obj('unicycle_bumpers', bumpers, chrome, top)
    views = [('side', (0.3, -2.3, 0.6), (0, 0, 0.48), 50), ('rider', (-0.25, -0.2, 1.55), (0.15, 0, 0.35), 30),
             ('three_quarter', (1.4, -1.6, 0.9), (0, 0, 0.48), 50)]
    return top, views


# ---------------------------------------------------------------- balance pole

def balance_pole():
    """2.4 m of pale wood along three.js Z (Blender -Y), its middle at the origin; two leather
    grips 0.5 m apart; a lead weight at each end; red tape near the ends."""
    half = 1.2
    top = empty('BalancePole')
    wood = lib.flat('pole_wood', (0.45, 0.28, 0.12), rough=0.5)
    red = lib.flat('pole_tape', (0.55, 0.05, 0.07), rough=0.5)
    lead = lib.flat('pole_lead', (0.33, 0.34, 0.36), rough=0.45, metal=0.4)
    grip_mat = textured('pole_grip', os.path.join(TEX, 'tape_col.png'), rough=0.8)
    shaft = tube((0, -half + 0.03, 0), (0, half - 0.03, 0), 0.015, seg=12)
    obj('pole_shaft', shaft, wood, top)
    tapes, grips = [], []
    for side, label in ((-1, 'left'), (1, 'right')):
        # three.js z = side * 0.25 -> Blender y = -side * 0.25
        gy = -side * 0.25
        g = tube((0, gy - 0.065, 0), (0, gy + 0.065, 0), 0.0195, seg=14)
        for k in (-1, 1):
            g = merge([g, tube((0, gy + k * 0.068, 0), (0, gy + k * 0.074, 0), 0.0215, seg=14)])
        grips.append(g)
        empty(f'PoleGrip {label}', (0, gy, 0), top)
        for k in range(4):
            ty = -side * (half - 0.12 - k * 0.14)
            tapes.append(tube((0, ty - 0.03, 0), (0, ty + 0.03, 0), 0.0165, seg=12))
        wy = -side * half
        w = merge([sphere(0.045, (0, wy, 0), seg=16, rings=10, scale=(1, 1.15, 1)), tube((0, wy * 0.97, 0), (0, wy * 0.985, 0), 0.03, seg=12)])
        obj(f'PoleWeight {label}', w, lead, top)
    obj('pole_grips', merge(grips), grip_mat, top)
    obj('pole_tape', merge(tapes), red, top)
    views = [('whole', (0.0, -0.6, 2.4), (0, 0, 0), 35), ('grips', (0.55, -0.05, 0.35), (0, 0, 0), 45)]
    return top, views


# ---------------------------------------------------------------- cannon

def cannon():
    """Origin at the middle of the muzzle; the barrel lies along three.js -X behind it and turns
    about the muzzle (node CannonBarrel); the flyer sits in the mouth facing +X. Two brass horn
    handles in front of the mouth (CannonHandle left/right, origin at the grip). A carriage with
    two big wheels stands under the breech."""
    top = empty('Cannon')
    barrel = empty('CannonBarrel', (0, 0, 0), top)
    body = textured('cannon_lacquer', os.path.join(TEX, 'cannon_col.png'), orm=os.path.join(TEX, 'cannon_arm.png'))
    bore = lib.flat('cannon_bore', (0.02, 0.015, 0.015), rough=0.9)
    gold = GOLD()
    brass = BRASS()
    # outer barrel: flared lip at the mouth, swelling to the breech, a rounded cascabel knob
    prof = [(0.0, 0.40), (0.0, 0.52), (-0.06, 0.53), (-0.12, 0.49), (-0.3, 0.47), (-1.2, 0.5), (-2.2, 0.545), (-2.55, 0.56),
            (-2.62, 0.5), (-2.68, 0.36), (-2.72, 0.18), (-2.74, 0.0001)]
    outer = lathe_x(prof[1:], seg=40)
    # inner bore: dark, a little way in, then closed
    inner = lathe_x([(0.0, 0.40), (-0.9, 0.40), (-0.9, 0.0001)], seg=40)
    bmesh.ops.reverse_faces(inner, faces=inner.faces)
    lip = lathe_x([(0.0, 0.40), (0.0, 0.52)], seg=40)
    obj('cannon_barrel', outer, body, barrel)
    obj('cannon_bore', merge([inner, lip]), bore, barrel)
    rings = []
    for x, r in ((-0.02, 0.535), (-0.85, 0.51), (-1.75, 0.54), (-2.55, 0.565)):
        rings.append(torus(r, 0.03, seg=40, rseg=8, axis='X', centre=(x, 0, 0)))
    knob = sphere(0.09, (-2.8, 0, 0), seg=14, rings=8)
    # trunnions (the barrel's side pegs) at the carriage
    trun = merge([tube((-1.6, -0.52, 0), (-1.6, -0.66, 0), 0.07, seg=14), tube((-1.6, 0.52, 0), (-1.6, 0.66, 0), 0.07, seg=14)])
    obj('cannon_gold', merge(rings + [knob, trun]), gold, barrel)
    # brass handles: horn hooks rising in front of the mouth, origin at the grip
    # three.js grip at (0.23, 0.15, +-0.25): left is three.js z -0.25 = Blender y +0.25
    struts = []
    for side, label in ((-1, 'left'), (1, 'right')):
        g = T(0.23, 0.15, side * 0.25)
        h = empty(f'CannonHandle {label}', g, barrel)
        # the hook: a vertical grip, its top curling forward
        hook = merge([tube((0, 0, -0.07), (0, 0, 0.05), 0.016, seg=10),
                      torus(0.035, 0.016, seg=10, rseg=8, axis='Y', centre=(0.035, 0, 0.05), arc=math.pi),
                      sphere(0.022, (0.07, 0, 0.05), seg=10, rings=6)])
        obj(f'cannon_handle_{label}', hook, brass, h)
        # a curved brass arm from the lip below the grip to its foot
        foot = g + Vector((0, 0, -0.07))
        lip_pt = Vector((0.0, g.y * 1.45, -0.28))
        mid = Vector((0.14, g.y * 1.25, -0.22))
        struts += [tube(lip_pt, mid, 0.017, seg=10), tube(mid, foot, 0.017, seg=10), sphere(0.024, mid, seg=10, rings=6)]
        struts.append(sphere(0.035, lip_pt, seg=10, rings=6))
    obj('cannon_handle_arms', merge(struts), brass, barrel)
    # carriage: two side cheeks, a cross bed and an axle; two big wheels (three.js (-1.6, -1.35, +-0.78))
    wood = lib.flat('carriage_navy', (0.018, 0.028, 0.075), rough=0.4)
    wheel_red = lib.flat('wheel_red', (0.45, 0.05, 0.07), rough=0.5)
    # side cheeks: a bracket each side holding the trunnion, its top edge trimmed in gold,
    # a gold star on its outer face
    cheeks, trim, stars = [], [], []
    outline = [(-0.95, -0.6), (-1.75, -0.72), (-2.55, -1.32), (-2.75, -1.58), (-1.05, -1.58), (-0.88, -1.3)]
    for sy in (-0.6, 0.6):
        bm = bmesh.new()
        vs = [bm.verts.new((x, sy - 0.035, z)) for x, z in outline]
        f = bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, vec=(0, 0.07, 0), verts=[g_ for g_ in r['geom'] if isinstance(g_, bmesh.types.BMVert)])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        cheeks.append(bm)
        out = 1 if sy > 0 else -1
        for (x0, z0), (x1, z1) in zip(outline[:3], outline[1:4]):
            trim.append(tube((x0, sy + out * 0.04, z0 + 0.01), (x1, sy + out * 0.04, z1 + 0.01), 0.018, seg=8))
        # a five-pointed star, flat on the outer face
        sbm = bmesh.new()
        cx, cz, R = -1.75, -1.22, 0.17
        pts = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5
            rr = R if k % 2 == 0 else R * 0.42
            pts.append(sbm.verts.new((cx + rr * math.cos(a), sy + out * 0.045, cz + rr * math.sin(a))))
        c = sbm.verts.new((cx, sy + out * 0.05, cz))
        for k in range(10):
            sbm.faces.new((c, pts[k], pts[(k + 1) % 10]) if out > 0 else (c, pts[(k + 1) % 10], pts[k]))
        stars.append(sbm)
    bed = box((1.75, 1.13, 0.1), (-1.9, 0, -1.52))
    obj('cannon_carriage', merge(cheeks + [bed]), wood, top)
    obj('cannon_carriage_trim', merge(trim + stars), gold, top)
    wheels_gold, wheels_red = [], []
    for sy in (-0.78, 0.78):
        c = Vector((-1.6, sy, -1.35))
        wheels_gold.append(torus(0.68, 0.04, seg=40, rseg=8, axis='Y', centre=c, squash=1.5))
        wheels_gold.append(tube(c + Vector((0, -0.09, 0)), c + Vector((0, 0.09, 0)), 0.09, seg=16))
        for k in range(12):
            a = 2 * math.pi * k / 12
            wheels_red.append(tube(c + Vector((0.08 * math.cos(a), 0, 0.08 * math.sin(a))), c + Vector((0.66 * math.cos(a), 0, 0.66 * math.sin(a))), 0.022, 0.016, seg=6))
        wheels_red.append(torus(0.62, 0.03, seg=40, rseg=6, axis='Y', centre=c, squash=1.6))
    wheels_gold.append(tube((-1.6, -0.86, -1.35), (-1.6, 0.86, -1.35), 0.035, seg=10))
    obj('cannon_wheel_gold', merge(wheels_gold), gold, top)
    obj('cannon_wheel_red', merge(wheels_red), wheel_red, top)
    # the barrel in the game rests at 32 degrees up; the preview shows it so
    barrel.rotation_euler = (0, -math.radians(32), 0)
    views = [('side', (-1.2, -6.0, 0.2), (-1.3, 0, -0.5), 35), ('seat', (-0.15, 0, 0.45), (1.0, 0, -0.35), 20),
             ('three_quarter', (2.6, -3.6, 1.2), (-1.0, 0, -0.5), 35)]
    return top, views


# ---------------------------------------------------------------- trapeze

def trapeze():
    """One trapeze (the game uses two): `TrapezeBar` along three.js Z (Blender -Y), 0.9 m,
    origin at its middle, dark wood with worn leather grips, iron end fittings with the rope eyes 0.42 m to each side;
    `TrapezeRope`, a rope 1 m long from its origin up three.js +Y, for the game to stretch
    between the beam and the bar (as its rod() does)."""
    top = empty('Trapeze')
    bar_node = empty('TrapezeBar', (0, 0, 0), top)
    wood = lib.flat('trapeze_bar_wood', (0.12, 0.065, 0.035), rough=0.38)
    iron = lib.flat('trapeze_iron', (0.14, 0.14, 0.15), rough=0.45, metal=0.5)
    tape = lib.flat('trapeze_grip_wrap', (0.2, 0.13, 0.08), rough=0.8)
    rope_mat = textured('trapeze_rope', os.path.join(TEX, 'rope_col.png'), rough=0.9)
    obj('trapeze_bar', tube((0, -0.4, 0), (0, 0.4, 0), 0.021, seg=16), wood, bar_node)
    obj('trapeze_bar_grips', merge([tube((0, s - 0.1, 0), (0, s + 0.1, 0), 0.0222, seg=16) for s in (-0.2, 0.2)]), tape, bar_node)
    ends = []
    for sy in (-0.42, 0.42):
        ends.append(tube((0, sy * 0.93, 0), (0, sy * 1.07, 0), 0.026, seg=12))
        ends.append(torus(0.022, 0.006, seg=12, rseg=6, axis='Y', centre=(0, sy, 0.03)))
    obj('trapeze_fittings', merge(ends), iron, bar_node)
    rope_node = empty('TrapezeRope', T(1.2, 0, 0), top)
    r = tube((0, 0, 0), (0, 0, 1.0), 0.015, seg=10, caps=False)
    uvl = r.loops.layers.uv.verify()
    for f in r.faces:
        for l in f.loops:
            l[uvl].uv = (l[uvl].uv.x, l.vert.co.z * 6.0)
    obj('trapeze_rope', r, rope_mat, rope_node)
    views = [('bar', (0.5, -0.9, 0.35), (0, 0, 0.1), 40)]
    return top, views


BUILD = {f.__name__: f for f in (unicycle, balance_pole, cannon, trapeze)}
top, views = BUILD[PROP]()
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
lib.write_json(os.path.join(HERE, 'stats', f'{PROP}.json'), {'triangles': t, 'draw_calls_if_unmerged': calls,
                                                             'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS', PROP, t, calls)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    lib.render_views(views, PREVIEW, PROP, HDRI, size=(800, 600), samples=24)
if PROP == 'cannon':
    bpy.data.objects['CannonBarrel'].rotation_euler = (0, 0, 0)
lib.export_glb(OUT, COLL)
