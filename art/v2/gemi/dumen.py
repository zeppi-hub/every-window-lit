"""The ship's wheel for the storm's second stage, one GLB, public/v2/gemi/dumen.glb, in the hatch set's
wood and brass (ambar.py):

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/gemi/dumen.py -- <out.glb> [--preview dir]

Root `dumen`, three children, each with its own origin:
  wheel      the turning part: origin at the hub's middle, it turns about local z, +z toward the
             helmsman. The gripped rim's middle line has a radius of 0.27; eight turned spokes run
             out through it to handles; a brass nave plate and boss; the king spoke (straight up)
             wears a rope wrap and a brass ring.
  pedestal   the fixed stand behind the wheel (-z): origin again at the hub's middle, a wooden
             column down 0.62 to the deck with an iron bearing round the axle.
  binnacle   the compass stand: origin at the middle of the card, a brass bowl 0.16 across with an
             open face (the game draws the card), on a slim post 0.5 down; two iron correcting balls.
             Placed to the helmsman's right, (0.56, -0.12, 0.08).

Metres, +y up. Two materials: the wet old deck wood of the hatch set (Poly Haven old_wood_floor,
darker, low roughness) and its painted palette (iron, brass, rope, ...).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
OUT = A[0]
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else ''
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
lib.reset()
COLL = lib.collection('dumen')


def T(x, y, z):
    return Vector((x, -z, y))


WOOD = lib.pbr('dumen_wood', 'old_wood_floor', 512, 256, tint=(0.62, 0.52, 0.42), rough=0.38, metal=0.0)
CELLS = {'iron': (0.07, 0.07, 0.08), 'brass': (0.78, 0.57, 0.26), 'rope': (0.52, 0.42, 0.28), 'brass_dark': (0.45, 0.32, 0.14)}
NAMES = list(CELLS)
_pal = bpy.data.images.new('dumen_palette', 32, 32, alpha=False)
_px = []
for j in range(32):
    for i in range(32):
        k = (j // 16) * 2 + (i // 16)
        c = CELLS[NAMES[k]]
        _px += [c[0], c[1], c[2], 1.0]
_pal.pixels = _px
_pal.pack()
PAL = lib.new_material('dumen_paint_metal')
_b = lib._principled(PAL)
_t = PAL.node_tree.nodes.new('ShaderNodeTexImage')
_t.image = _pal
_t.interpolation = 'Closest'
PAL.node_tree.links.new(_t.outputs['Color'], _b.inputs['Base Color'])
_b.inputs['Roughness'].default_value = 0.4
_b.inputs['Metallic'].default_value = 0.5


def cell(name):
    k = NAMES.index(name)
    return ((k % 2) * 16 + 8) / 32, ((k // 2) * 16 + 8) / 32


def bm_box(lo, hi):
    a, b = T(*lo), T(*hi)
    mn = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    mx = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=mx - mn, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(mn + mx) / 2, verts=bm.verts)
    return bm


def bm_tube(p0, p1, r0, r1=None, seg=10, caps=True):
    r1 = r0 if r1 is None else r1
    a, b = T(*p0), T(*p1)
    bm = bmesh.new()
    ln = (b - a).length
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=ln)
    bmesh.ops.translate(bm, vec=(0, 0, ln / 2), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=a, verts=bm.verts)
    return bm


def bm_lathe_axis(p0, d, profile, seg=10):
    """A turned piece: profile (radius, distance along d from p0), spun about the three.js direction d."""
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), t)) for k in range(seg)] for r, t in profile]
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    q = Vector((0, 0, 1)).rotation_difference(T(*d).normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=T(*p0), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_torus(c, R, r, axis='Z', seg=16, rseg=6, sx=1.0):
    """A ring about a three.js axis; sx stretches its section along the axis."""
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            rr = R + r * math.cos(b)
            p = (rr * math.cos(a), rr * math.sin(a), r * math.sin(b) * sx)
            if axis == 'Y':
                p = (p[0], p[2], p[1])
            elif axis == 'X':
                p = (p[2], p[0], p[1])
            ring.append(bm.verts.new(T(c[0] + p[0], c[1] + p[1], c[2] + p[2])))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg):
            bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % rseg], rings[i][(j + 1) % rseg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def merge(bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        b.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    return out


def paint(bm, name):
    lay = bm.loops.layers.uv.verify()
    u = cell(name)
    for f in bm.faces:
        for loop in f.loops:
            loop[lay].uv = u
    return bm


def obj(name, wood_parts, pal_parts, parent, loc, wood_scale=4.0):
    """One object: wood parts (box-projected UVs) and palette parts, origin at loc."""
    out = []
    if wood_parts:
        w = bpy.data.objects.new('tmp_w', bpy.data.meshes.new('tmp_w'))
        COLL.objects.link(w)
        merge(wood_parts).to_mesh(w.data)
        lib.box_uv(w, wood_scale)
        out.append(w)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if out:
        bm.from_mesh(out[0].data)
        for f in bm.faces:
            f.material_index = 0
        bpy.data.objects.remove(out[0], do_unlink=True)
    pal = merge([paint(b, c) for b, c in pal_parts]) if pal_parts else None
    mats = ([WOOD] if wood_parts else []) + ([PAL] if pal_parts else [])
    if pal is not None:
        tmp = bpy.data.meshes.new('tmp_p')
        for f in pal.faces:
            f.material_index = mats.index(PAL)
        pal.to_mesh(tmp)
        pal.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    bmesh.ops.translate(bm, vec=-loc, verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    if me.uv_layers:
        me.uv_layers[0].name = 'UVMap'
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    o.parent = parent
    o.location = loc
    return o


root = bpy.data.objects.new('dumen', None)
COLL.objects.link(root)

# ------------------------------------------------------------------ wheel (hub at the origin, turning about z)
R = 0.27
wood, pal = [], []
wood.append(bm_torus((0, 0, 0), R, 0.019, axis='Z', seg=48, rseg=8, sx=1.15))                 # the rim (felloes)
pal.append((bm_torus((0, 0, 0.021), R, 0.0055, axis='Z', seg=48, rseg=4), 'brass'))           # brass band on its face
pal.append((bm_torus((0, 0, -0.021), R, 0.0045, axis='Z', seg=48, rseg=4), 'brass_dark'))     # and on its back
wood.append(bm_lathe_axis((0, 0, -0.07), (0, 0, 1), [(0.0, 0.0), (0.06, 0.0), (0.075, 0.012), (0.078, 0.05), (0.072, 0.085), (0.0, 0.085)], 16))  # the hub drum
pal.append((bm_lathe_axis((0, 0, 0.015), (0, 0, 1), [(0.0, 0.0), (0.085, 0.0), (0.085, 0.007), (0.0, 0.007)], 18), 'brass'))   # nave plate
pal.append((bm_lathe_axis((0, 0, 0.022), (0, 0, 1), [(0.0, 0.0), (0.028, 0.0), (0.026, 0.012), (0.016, 0.022), (0.0, 0.026)], 12), 'brass'))  # boss
for k in range(8):
    a = math.pi / 2 + k * math.pi / 4
    d = (math.cos(a), math.sin(a), 0.0)
    # the spoke from the hub to the rim, then on through it to a turned handle
    prof = [(0.016, 0.07), (0.015, 0.12), (0.012, 0.2), (0.013, 0.25), (0.015, 0.29), (0.012, 0.31), (0.016, 0.33),
            (0.017, 0.355), (0.014, 0.38), (0.016, 0.395), (0.012, 0.41), (0.0, 0.415)]
    wood.append(bm_lathe_axis((0, 0, 0), d, [(0.0, 0.07)] + prof, 8))
    pal.append((bm_tube((0.0815 * d[0], 0.0815 * d[1], 0.023), (0.0815 * d[0], 0.0815 * d[1], 0.03), 0.006, seg=6), 'brass'))   # plate bolts
    if k == 0:
        # the king spoke: a rope wrap on its handle and a brass ring at the rim
        for t in (0.335, 0.345, 0.355, 0.365):
            pal.append((bm_torus((t * d[0], t * d[1], 0.0), 0.0185, 0.0035, axis='Y', seg=10, rseg=4), 'rope'))
        pal.append((bm_torus((0.3 * d[0], 0.3 * d[1], 0.0), 0.0165, 0.0035, axis='Y', seg=12, rseg=4), 'brass'))
wheel = obj('wheel', wood, pal, root, T(0, 0, 0), wood_scale=6.0)

# ------------------------------------------------------------------ pedestal (behind, down to the deck)
wood, pal = [], []
wood.append(bm_box((-0.065, -0.62, -0.25), (0.065, -0.58, -0.07)))                          # plinth on the deck
wood.append(bm_box((-0.05, -0.58, -0.21), (0.05, 0.06, -0.11)))                             # the column
wood.append(bm_box((-0.06, 0.06, -0.22), (0.06, 0.085, -0.1)))                              # its cap
pal.append((bm_lathe_axis((0, 0, -0.105), (0, 0, 1), [(0.0, 0.0), (0.04, 0.0), (0.045, 0.006), (0.045, 0.026), (0.03, 0.03), (0.0, 0.03)], 14), 'iron'))  # bearing
pal.append((bm_tube((0, 0, -0.075), (0, 0, -0.105), 0.02, seg=10), 'iron'))                # the axle's stub to the hub
for sx in (-0.045, 0.045):
    for sz in (-0.235, -0.085):
        pal.append((bm_tube((sx, -0.58, sz), (sx, -0.572, sz), 0.007, seg=6), 'iron'))      # deck bolts
pal.append((bm_box((-0.052, -0.2, -0.213), (0.052, -0.18, -0.107)), 'brass_dark'))          # a band round the column
obj('pedestal', wood, pal, root, T(0, 0, 0))

# ------------------------------------------------------------------ binnacle (to the helmsman's right)
BC = (0.56, -0.12, 0.08)
x0, y0, z0 = BC
wood, pal = [], []
pal.append((bm_lathe_axis((x0, y0, z0), (0, 1, 0), [(0.0, -0.065), (0.04, -0.064), (0.068, -0.05), (0.08, -0.025), (0.082, 0.0), (0.086, 0.004),
                                                  (0.086, 0.012), (0.074, 0.012), (0.074, 0.0)], 20), 'brass'))      # bowl, open face
pal.append((bm_lathe_axis((x0, y0, z0), (0, 1, 0), [(0.0, -0.075), (0.03, -0.075), (0.026, -0.065), (0.0, -0.064)], 10), 'brass_dark'))
wood.append(bm_tube((x0, y0 - 0.07, z0), (x0, y0 - 0.47, z0), 0.026, 0.032, seg=10))                              # the post
pal.append((bm_lathe_axis((x0, y0 - 0.5, z0), (0, 1, 0), [(0.0, 0.0), (0.075, 0.0), (0.075, 0.012), (0.045, 0.03), (0.0, 0.032)], 12), 'brass_dark'))  # foot
for s in (-1, 1):
    pal.append((bm_tube((x0 + s * 0.08, y0 - 0.03, z0), (x0 + s * 0.12, y0 - 0.03, z0), 0.006, seg=6), 'brass_dark'))
    b = bmesh.new()
    bmesh.ops.create_uvsphere(b, u_segments=12, v_segments=8, radius=0.03)
    bmesh.ops.translate(b, vec=T(x0 + s * 0.15, y0 - 0.03, z0), verts=b.verts)
    pal.append((b, 'iron'))                                                                                        # correcting balls
obj('binnacle', wood, pal, root, T(*BC))

# ------------------------------------------------------------------ export
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
lib.write_json(os.path.join(HERE, 'stats_dumen.json'), {'triangles': t, 'draw_calls': calls, 'materials': 2, 'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS dumen', t, calls)
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    views = [('helm', tuple(T(0.25, 0.25, 1.1)), tuple(T(0.12, -0.12, 0)), 40), ('side', tuple(T(1.3, 0.3, 0.5)), tuple(T(0.15, -0.25, -0.05)), 40)]
    lib.render_views(views, PREVIEW, 'dumen', HDRI, size=(800, 600), samples=24, world_strength=0.6)
print('DONE', OUT)
