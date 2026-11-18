"""The keeper's gear for the valley (Ring-fence, S24-S27), one GLB, public/v2/buzul/bekci.glb:

  V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/buzul/bekci.py -- <out.glb> [--preview dir]

  post_driver  a two-handled post driver: a wrought-iron tube (0.12 across, 0.34 long) with a heavy
               cap, arms to both sides and leather-wrapped ring handles. Origin where the cap's
               inside sits on the stake's top (the tube from +0.07 to -0.27). handle_left and
               handle_right: the rings' middles (-0.25 / +0.25, +0.10, 0).
  sledge       the keeper's wooden sledge: origin on the ground under the sitter's eye; the seat
               (top 0.60, middle at z +0.20) with a fleece on it; two runners at x +-0.34 from
               z -0.40 to +1.10, their ends curled up; nothing in front between x +-0.2 and z -0.6..0
               (the stake's hole is at z -0.40); a little shelf on the left for the coil (top at
               (-0.52, 0.50, 0)); on the right behind, a 1.7 m pole (x +0.5, z +0.75) with the storm
               lantern of art/v2/nesne (hurricane_lantern.glb) on top; `lantern`, an empty at the
               light, (0.5, 1.72, 0.75).
  line_coil    a coil of line bound with red cloth, 0.44 across, lying flat; origin at its middle
               (on the shelf here).

Metres, Y up, ahead = -Z. Six draws: one palette material (iron, leather, fleece, the lantern's tin
and brass, with their own roughness and metal), the sledge's wood (Poly Haven dark_planks, CC0), the
line's rope and red cloth (drawn here) and the lantern's glass.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
OUT = A[0]
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else ''
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
lib.reset()
COLL = lib.collection('bekci')


def T(x, y, z):
    return Vector((x, -z, y))


# ------------------------------------------------------------------ materials
CELLS = {  # colour, roughness, metal
    'iron': ((0.075, 0.072, 0.07), 0.55, 0.5), 'iron_worn': ((0.16, 0.15, 0.14), 0.4, 0.55),
    'leather': ((0.22, 0.12, 0.06), 0.7, 0.0), 'fleece': ((0.64, 0.58, 0.48), 0.95, 0.0),
    'paint': ((0.07, 0.12, 0.08), 0.5, 0.35), 'brass': ((0.72, 0.52, 0.24), 0.35, 0.6),
    'fleece_dark': ((0.45, 0.4, 0.32), 0.95, 0.0), 'rawhide': ((0.5, 0.4, 0.27), 0.75, 0.0),
    'wrought': ((0.4, 0.39, 0.37), 0.5, 0.3), 'wrought_dark': ((0.25, 0.245, 0.235), 0.55, 0.3),
    'leather_dark': ((0.12, 0.07, 0.04), 0.75, 0.0),
}
NAMES = list(CELLS)


PN = 256          # the palette picture: 32 px cells in its lowest 64 rows, a fur hide above them


def palette():
    """Colour, roughness/metal and normal pictures: the flat cells, and above them a dark brown fur
    (strands, clumps, lighter tips) for the fleece."""
    n = PN
    col = np.zeros((n, n, 3))
    orm = np.ones((n, n, 3))
    nrm = np.zeros((n, n, 3))
    nrm[:, :] = (0.5, 0.5, 1.0)
    for k, name in enumerate(NAMES):
        c, r, m = CELLS[name]
        i, j = k % 8, k // 8
        col[j * 32:(j + 1) * 32, i * 32:(i + 1) * 32] = c
        orm[j * 32:(j + 1) * 32, i * 32:(i + 1) * 32] = (1.0, r, m)
    rng = np.random.default_rng(21)
    h, w = n - 64, n
    noise = rng.random((h, w))
    strands = noise.copy()
    for d in range(1, 9):                                  # hairs lying one way, slanting
        strands += np.roll(np.roll(noise, d, 0), d // 2, 1) * (1 - d / 9)
    strands = (strands - strands.mean()) / (strands.std() + 1e-6)
    clump = noise.copy()
    for _ in range(3):
        clump = (clump + np.roll(clump, 3, 0) + np.roll(clump, -3, 0) + np.roll(clump, 3, 1) + np.roll(clump, -3, 1)) / 5
    clump = (clump - clump.mean()) / (clump.std() + 1e-6)
    t = np.clip(0.5 + 0.22 * strands + 0.25 * clump, 0, 1)
    dark, tip = np.array([0.13, 0.085, 0.05]), np.array([0.36, 0.25, 0.15])
    col[64:] = dark[None, None, :] * (1 - t[:, :, None]) + tip[None, None, :] * t[:, :, None]
    orm[64:] = np.stack([np.ones_like(t), 0.92 - 0.1 * t, np.zeros_like(t)], 2)
    hgt = 0.6 * t + 0.4 * np.clip(0.5 + 0.3 * clump, 0, 1)
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 2.5
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 2.5
    nn = np.stack([-dx, -dy, np.ones_like(hgt)], 2)
    nn /= np.linalg.norm(nn, axis=2, keepdims=True)
    nrm[64:] = nn * 0.5 + 0.5
    return col, orm, nrm


def fur_uv(u, v):
    """A point of the fur hide in the palette picture (u, v in 0..1)."""
    return 0.01 + 0.98 * u, (66 + 186 * v) / PN


def image(name, arr, non_color=False):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(arr, 0, 1)
    img.pixels[:] = px.ravel()
    img.pack()
    return img


def material(name, colour, normal=None, orm=None, closest=False):
    m = lib.new_material(name)
    nt = m.node_tree
    b = lib._principled(m)
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = colour
    if closest:
        t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if normal is not None:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if orm is not None:
        to = nt.nodes.new('ShaderNodeTexImage')
        to.image = orm
        if closest:
            to.interpolation = 'Closest'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(to.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    return m


_pc, _po, _pn = palette()
PAL = material('bekci_palette', image('bekci_palette_col', _pc), normal=image('bekci_palette_nor', _pn, True), orm=image('bekci_palette_orm', _po, True))


def cell(name):
    k = NAMES.index(name)
    return ((k % 8) * 32 + 16) / PN, ((k // 8) * 32 + 16) / PN


def rope_maps(n=256):
    """Rope (v 0..0.75: three strands twisting along u) and red cloth (v 0.75..1: a plain weave)."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64) / n
    h = np.zeros((n, n))
    col = np.zeros((n, n, 3))
    rope = y < 0.75
    w = y / 0.75
    ph = (x * 6 + w * 3) % 1.0                                   # three strands round, six twists per picture
    strand = np.sin(math.pi * ph) ** 0.6
    fib = 0.5 + 0.5 * np.sin(2 * math.pi * (x * 60 - w * 20))
    h_r = strand * (0.85 + 0.15 * fib)
    c_r = np.array([0.5, 0.41, 0.27])[None, None, :] * (0.45 + 0.6 * h_r)[:, :, None]
    gx = (x * 128) % 1.0
    gy = (y * 128) % 1.0
    h_c = 0.5 + 0.25 * np.sin(2 * math.pi * gx) * np.sign(np.sin(2 * math.pi * y * 64)) + 0.25 * np.sin(2 * math.pi * gy)
    c_c = np.array([0.5, 0.06, 0.05])[None, None, :] * (0.7 + 0.4 * h_c)[:, :, None]
    h = np.where(rope, h_r, h_c * 0.4)
    col = np.where(rope[:, :, None], c_r, c_c)
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 2.0
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 2.0
    nrm = np.stack([-dx, -dy, np.ones_like(h)], 2)
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    orm = np.stack([np.ones_like(h), np.where(rope, 0.85, 0.9), np.zeros_like(h)], 2)
    return col, nrm * 0.5 + 0.5, orm


_rc, _rn, _ro = rope_maps()
ROPE = material('bekci_line', image('bekci_line_col', _rc), image('bekci_line_nor', _rn, True), image('bekci_line_orm', _ro, True))
WOOD = lib.pbr('bekci_wood', 'dark_planks', 1024, 512, tint=(0.85, 0.8, 0.75))


# ------------------------------------------------------------------ helpers
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


def bm_lathe(c, profile, seg=16):
    bm = bmesh.new()
    rings = [[bm.verts.new(T(c[0] + r * math.cos(2 * math.pi * k / seg), c[1] + y, c[2] + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)] for r, y in profile]
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_torus(c, R, r, axis='Z', seg=16, rseg=6, uv=None):
    """A ring in three.js about the given axis. uv: (u per metre, v0, v1) for a textured ring."""
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new('UVMap') if uv else None
    rings = []
    for i in range(seg + 1):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rseg + 1):
            b = 2 * math.pi * j / rseg
            rr = R + r * math.cos(b)
            p = (rr * math.cos(a), rr * math.sin(a), r * math.sin(b))
            if axis == 'Y':
                p = (p[0], p[2], p[1])
            elif axis == 'X':
                p = (p[2], p[0], p[1])
            ring.append(T(c[0] + p[0], c[1] + p[1], c[2] + p[2]))
        rings.append(ring)
    vs = [[bm.verts.new(p) for p in ring] for ring in rings[:-1]]
    vs.append(vs[0])
    for i in range(seg):
        for j in range(rseg):
            jj = (j + 1) % rseg
            f = bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][jj], vs[i][jj]))
            if lay:
                upm, v0, v1 = uv
                L = 2 * math.pi * R
                us = (i / seg * L * upm, (i + 1) / seg * L * upm)
                vv = (v0 + (v1 - v0) * j / rseg, v0 + (v1 - v0) * (j + 1) / rseg)
                for loop, uvv in zip(f.loops, ((us[0], vv[0]), (us[1], vv[0]), (us[1], vv[1]), (us[0], vv[1]))):
                    loop[lay].uv = uvv
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def paint(bm, name):
    lay = bm.loops.layers.uv.verify()
    u = cell(name)
    for f in bm.faces:
        for loop in f.loops:
            loop[lay].uv = u
    return bm


def obj(name, parts, parent=None, loc=None, smooth=False):
    mats, out = [], bmesh.new()
    for bm, mat in parts:
        if mat not in mats:
            mats.append(mat)
        for f in bm.faces:
            f.material_index = mats.index(mat)
        me = bpy.data.meshes.new('tmp')
        bm.to_mesh(me)
        bm.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    out.to_mesh(me)
    out.free()
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = smooth
    if me.uv_layers:
        me.uv_layers[0].name = 'UVMap'
    if parent is not None:
        o.parent = parent
    if loc is not None:
        o.location = loc
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    COLL.objects.link(e)
    e.location = loc
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


root = empty('bekci')

# ------------------------------------------------------------------ post driver
# placed here over the stake's hole at a stake top of 0.45; the game sets it on the stake
pd = empty('post_driver', T(0, 0.45, -0.40), root)
tube = [bm_lathe((0, 0, 0), [(0.0, 0.07), (0.05, 0.07), (0.058, 0.064), (0.06, 0.055), (0.06, -0.255), (0.064, -0.258), (0.064, -0.27),
                              (0.05, -0.27), (0.05, -0.2), (0.048, -0.0), (0.0, -0.0)], 16)]
bands = [bm_lathe((0, 0, 0), [(0.06, 0.03), (0.064, 0.032), (0.064, 0.048), (0.06, 0.05)], 16),          # a forged collar under the cap
         bm_lathe((0, 0, 0), [(0.06, -0.21), (0.0635, -0.208), (0.0635, -0.196), (0.06, -0.194)], 16)]
arms, grips = [], []
for s, name in ((-1, 'handle_left'), (1, 'handle_right')):
    arms.append(bm_tube((s * 0.055, 0.0, 0), (s * 0.15, 0.06, 0), 0.014, 0.012, seg=8))
    arms.append(bm_tube((s * 0.15, 0.06, 0), (s * 0.2, 0.1, 0), 0.012, seg=8))
    arms.append(bm_tube((s * 0.055, -0.15, 0), (s * 0.16, 0.055, 0), 0.008, seg=6))                    # a strut below
    arms.append(bm_torus((s * 0.25, 0.10, 0), 0.05, 0.0085, axis='Z', seg=18, rseg=6))                 # the ring
    grips.append(bm_torus((s * 0.25, 0.10, 0), 0.05, 0.0135, axis='Z', seg=14, rseg=6))                # leather over the outer half
    empty(name, T(s * 0.25, 0.10, 0), pd)
# keep only the outer half of each leather wrap (the hand's side)
for g, s in zip(grips, (-1, 1)):
    bmesh.ops.delete(g, geom=[v for v in g.verts if (v.co.x * s) < 0.25 - 0.012], context='VERTS')
cap = [bm_torus((0, 0.071, 0), 0.043, 0.0045, axis='Y', seg=20, rseg=5)]                              # a raised ring on the cap
for k in range(8):
    a = 2 * math.pi * k / 8 + math.pi / 8
    r = bmesh.new()
    bmesh.ops.create_uvsphere(r, u_segments=8, v_segments=4, radius=0.0065)
    bmesh.ops.scale(r, vec=(1, 1, 0.55), verts=r.verts)
    bmesh.ops.translate(r, vec=T(0.03 * math.cos(a), 0.071, 0.03 * math.sin(a)), verts=r.verts)
    cap.append(r)                                                                                     # rivet heads
    r2 = bmesh.new()
    bmesh.ops.create_uvsphere(r2, u_segments=6, v_segments=4, radius=0.0055)
    bmesh.ops.translate(r2, vec=T(0.061 * math.cos(a), 0.04, 0.061 * math.sin(a)), verts=r2.verts)
    cap.append(r2)                                                                                    # and on the collar
band = [bm_lathe((0, 0, 0), [(0.06, -0.075), (0.0655, -0.077), (0.0665, -0.085), (0.0665, -0.145), (0.0655, -0.153), (0.06, -0.155)], 18)]
stitch = [bm_torus((0, yy, 0), 0.0668, 0.0012, axis='Y', seg=24, rseg=3) for yy in (-0.083, -0.147)]
obj('post_driver_iron', [(paint(merge(tube + bands + arms), 'wrought'), PAL), (paint(merge(cap), 'wrought_dark'), PAL),
                         (paint(merge(grips + band), 'leather'), PAL), (paint(merge(stitch), 'leather_dark'), PAL)], pd, smooth=True)

# ------------------------------------------------------------------ sledge
sl = empty('sledge', T(0, 0, 0), root)
wood, iron = [], []
for s in (-1, 1):
    x = s * 0.34
    # the runner: a bent rail 0.05 wide, 0.06 high, from z +1.10 to -0.20 on the ground, then curling up to the tip at z -0.40
    path = [(1.10, 0.06), (0.9, 0.0), (0.0, 0.0), (-0.2, 0.0), (-0.3, 0.03), (-0.37, 0.09), (-0.40, 0.17), (-0.39, 0.24), (-0.35, 0.27)]
    for (z0, y0), (z1, y1) in zip(path, path[1:]):
        wood.append(bm_tube((x, y0 + 0.04, z0), (x, y1 + 0.04, z1), 0.03, seg=6))
        iron.append(bm_tube((x, y0 + 0.006, z0), (x, y1 + 0.006, z1), 0.008, seg=5))                  # the iron shoe
    # stanchions to the seat and the cargo deck's rails
    for z in (0.04, 0.36):
        wood.append(bm_tube((x, 0.07, z), (s * 0.27, 0.56, z), 0.022, 0.018, seg=6))
    for z in (0.62, 1.02):
        wood.append(bm_tube((x, 0.07, z), (x, 0.2, z), 0.02, seg=6))
    wood.append(bm_box((x - 0.022, 0.2, 0.42), (x + 0.022, 0.24, 1.08)))                                # deck rail
# cross pieces only behind the origin (the front stays open)
for z in (0.04, 0.36):
    wood.append(bm_box((-0.32, 0.22, z - 0.02), (0.32, 0.26, z + 0.02)))
    wood.append(bm_box((-0.3, 0.535, z - 0.025), (0.3, 0.565, z + 0.025)))
# the seat: three boards, top at 0.60, z 0.0..0.40
for k in range(3):
    z0 = 0.0 + k * 0.135
    wood.append(bm_box((-0.27, 0.565, z0 + 0.004), (0.27, 0.60, z0 + 0.131)))
# the cargo deck behind: slats at 0.24
for k in range(5):
    z0 = 0.46 + k * 0.125
    wood.append(bm_box((-0.36, 0.24, z0), (0.36, 0.262, z0 + 0.105)))
# the shelf on the left for the coil: a 0.36 square board, its top at 0.50, a lip, a bracket to the runner
wood.append(bm_box((-0.70, 0.48, -0.18), (-0.34, 0.50, 0.18)))
for zz in (-0.18, 0.16):
    wood.append(bm_box((-0.70, 0.50, zz), (-0.34, 0.525, zz + 0.02)))
iron.append(bm_tube((-0.34, 0.08, -0.12), (-0.6, 0.48, -0.12), 0.009, seg=5))
iron.append(bm_tube((-0.34, 0.08, 0.12), (-0.6, 0.48, 0.12), 0.009, seg=5))
wood.append(bm_box((-0.36, 0.06, -0.15), (-0.32, 0.48, 0.15)))                                          # the shelf's upright on the runner
# the lantern pole on the right behind: a bracket off the runner to x 0.5, the pole to 1.60, an iron plate on top
wood.append(bm_tube((0.5, 0.05, 0.75), (0.5, 1.60, 0.75), 0.024, 0.019, seg=8))
iron.append(bm_box((0.34, 0.12, 0.72), (0.52, 0.15, 0.78)))
iron.append(bm_box((0.34, 0.36, 0.72), (0.52, 0.39, 0.78)))
iron.append(bm_lathe((0.5, 0, 0.75), [(0.0, 1.595), (0.05, 1.595), (0.05, 1.605), (0.0, 1.605)], 10))
# the fleece on the seat: a lumpy hide, its edges falling over the sides and the front
fl = bmesh.new()
lay = fl.loops.layers.uv.verify()           # the same layer paint() uses, so the merge keeps one
NX, NZ = 14, 12
rng = np.random.default_rng(5)
lump = rng.random((NX + 1, NZ + 1))
grid = []
for i in range(NX + 1):
    row = []
    for j in range(NZ + 1):
        u = i / NX
        edge = i in (0, NX) or j in (0, NZ)
        ragged = (lump[i, j] - 0.5) if edge else 0.0                               # an uneven hide's outline
        x = (u - 0.5) * 0.62 * (1 + 0.16 * ragged * (i in (0, NX)))
        z = 0.0 if j == 0 else 0.015 + (j - 1) / (NZ - 1) * 0.43 + (0.05 * ragged if j == NZ else 0.0)   # the first row hangs over the front edge, at z 0
        over = max(0.0, abs(x) - 0.27) + max(0.0, z - 0.40) + (0.04 if j == 0 else 0.0)
        corner = 0.02 if (i in (0, NX) and j in (0, NZ)) else 0.0
        y = 0.606 + 0.02 * lump[i, j] - min(over, 0.07) * 1.6 - corner - (0.012 * abs(ragged) if edge else 0.0)
        row.append(fl.verts.new(T(x, y, z)))
    grid.append(row)
for i in range(NX):
    for j in range(NZ):
        f = fl.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
        for loop, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
            loop[lay].uv = fur_uv(ii / NX, jj / NZ)
bmesh.ops.recalc_face_normals(fl, faces=fl.faces)
sled = obj('sledge_wood', [(merge(wood), WOOD)], sl, smooth=False)
lib.box_uv(sled, 3.0)
obj('sledge_iron', [(paint(merge(iron), 'iron'), PAL), (fl, PAL)], sl, smooth=False)
empty('lantern', T(0.5, 1.72, 0.75), sl)
# the storm lantern of art/v2/nesne on the pole: its tin and brass moved onto this palette, its glass kept
lan = lib.import_gltf(os.path.join(REPO, 'public', 'v2', 'nesne', 'hurricane_lantern.glb'), COLL)
body, glass = lan['lantern_body'], lan['glass']
bme = bmesh.new()
bme.from_mesh(body.data)
lay = bme.loops.layers.uv.verify()
for f in bme.faces:
    name = 'paint' if body.data.materials[f.material_index].name.startswith('lantern_paint') else 'brass'
    for loop in f.loops:
        loop[lay].uv = cell(name)
    f.material_index = 0
bme.to_mesh(body.data)
bme.free()
body.data.materials.clear()
body.data.materials.append(PAL)
glass.data.materials[0].name = 'bekci_lantern_glass'
for o, nm in ((body, 'lantern_tin'), (glass, 'lantern_glass')):
    o.name = nm
    o.data.name = nm
    o.parent = sl
    o.location = T(0.5, 1.605, 0.75)

# ------------------------------------------------------------------ line coil
lc = empty('line_coil', T(-0.52, 0.535, 0.0), root)
parts = []
for layer, yy in enumerate((-0.017, 0.017)):
    for k in range(4):
        R = 0.13 + k * 0.027 + (0.012 if layer else 0.0)
        if R + 0.013 > 0.22:
            continue
        parts.append(bm_torus((0, yy, 0), R, 0.013, axis='Y', seg=28, rseg=6, uv=(10.0, 0.0, 0.75)))
# three red cloth bindings round the bundle
for k in range(3):
    phi = 2 * math.pi * k / 3 + 0.4
    b = bmesh.new()
    blay = b.loops.layers.uv.new('UVMap')
    prof = [(0.112, -0.038), (0.228, -0.038), (0.234, 0.0), (0.228, 0.038), (0.112, 0.038), (0.106, 0.0)]
    rings = []
    for side in (-1, 1):
        a = phi + side * 0.09
        rings.append([b.verts.new(T(r * math.cos(a), y, r * math.sin(a))) for r, y in prof])
    m = len(prof)
    for j in range(m):
        f = b.faces.new((rings[0][j], rings[0][(j + 1) % m], rings[1][(j + 1) % m], rings[1][j]))
        for loop, uvv in zip(f.loops, ((j / m, 0.78), ((j + 1) / m, 0.78), ((j + 1) / m, 0.97), (j / m, 0.97))):
            loop[blay].uv = uvv
    bmesh.ops.recalc_face_normals(b, faces=b.faces)
    parts.append(b)
obj('line_coil_rope', [(merge(parts), ROPE)], lc, smooth=True)

# ------------------------------------------------------------------ export
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
front = []
for o in COLL.all_objects:
    if o.type != 'MESH' or not (o.name.startswith('sledge') or o.name.startswith('lantern')):
        continue
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        if abs(w.x) < 0.2 and -0.6 < -w.y < 0.0:
            front.append(tuple(round(c, 3) for c in w))
lib.write_json(os.path.join(HERE, 'stats_bekci.json'), {'triangles': t, 'draw_calls': calls, 'front_clear': not front,
                                                        'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS bekci', t, calls, 'front clear', not front, front[:3])
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    views = [('side', tuple(T(1.9, 1.3, -1.4)), tuple(T(0, 0.55, 0.3)), 40), ('sitter', tuple(T(0.0, 1.05, 0.15)), tuple(T(0, 0.3, -0.5)), 60),
             ('driver', tuple(T(0.4, 0.75, -0.95)), tuple(T(0, 0.45, -0.4)), 35)]
    lib.render_views(views, PREVIEW, 'bekci', HDRI, size=(800, 600), samples=24, world_strength=0.6)
print('DONE', OUT)
