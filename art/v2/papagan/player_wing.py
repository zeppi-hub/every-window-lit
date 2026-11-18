"""The player's own parrot body (she is the bird) and the feathers for her wing-tip hands:

  nice -n 20 blender -b --factory-startup --python art/v2/papagan/player_wing.py -- <wing|tips> <out.glb> <tex_dir> [--preview dir]

wing  ParrotWing: the left wing at the shoulder (a red leading edge, red then yellow coverts,
      blue flight feathers fanned forward), the red breast under the chin and two feet gripping.
      Laid out in the frame of the ParrotWing group the game builds in parrot-system.ts (three.js
      metres: x to the bird's right, y up, -z ahead; the game puts the group 0.08 right, 0.27
      down and 0.34 ahead of the eye, turned with the head's heading), so it can take the place
      of the feather planes, sphere and claws there.
tips  WingTipFeathers: four feather templates for the hands (wing-hands-system.ts lays one
      along each finger and a tuft on the wrist): each 1 m long from its quill (the origin) to its
      tip along -x, flat on the xz plane, top face up +y, to be scaled to the finger (0.08-0.14 m).

tex_dir holds feathers.png and breast.png from art/v2/papagan/wing_textures.py. Colours follow
the scarlet macaw of parrot.glb, the bird the player sees of herself on the broadcast screen.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
PART, OUT, TEX = argv[0], argv[1], argv[2]
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')
lib.reset()
COLL = lib.collection(PART)


def B(p):
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return Vector((p[0], -p[2], p[1]))


def obj(name, bm, mat, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    if parent is not None:
        o.parent = parent
    return o


def empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    COLL.objects.link(e)
    if parent is not None:
        e.parent = parent
    return e


def feather_mat():
    m = lib.new_material('parrot_feathers')
    b = lib._principled(m)
    nt = m.node_tree
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = lib.image(os.path.join(TEX, 'feathers.png'))
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    rnd = nt.nodes.new('ShaderNodeMath')
    rnd.operation = 'ROUND'                       # glTF alphaMode MASK, cutoff 0.5
    nt.links.new(t.outputs['Alpha'], rnd.inputs[0])
    nt.links.new(rnd.outputs[0], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.55
    b.inputs['Sheen Weight'].default_value = 0.0
    m.surface_render_method = 'DITHERED'
    m.use_backface_culling = False
    return m


def breast_mat():
    m = lib.new_material('parrot_breast')
    b = lib._principled(m)
    nt = m.node_tree
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = lib.image(os.path.join(TEX, 'breast.png'))
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.7
    return m


def feather(bm, uv, column, root, direction, up, length, width, curve=0.06, ridge=0.02, segs=8):
    """A feather into bm: quill at root (three.js), tip `length` along direction, its face toward
    `up`; texture column 0..3 of feathers.png (quill at v = 0, tip at v = 1)."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up)).normalized()
    n = side.cross(d).normalized()          # the face's normal, toward `up`
    root = Vector(root)
    rows = []
    for i in range(segs + 1):
        s = i / segs
        c = root + d * (s * length) + n * (curve * length * math.sin(math.pi * s * 0.9))
        row = []
        for j, a in enumerate((-0.5, 0.0, 0.5)):
            p = c + side * (a * width) + n * (ridge * width if a == 0.0 else 0.0)
            row.append((bm.verts.new(B(p)), ((column + 0.5 + a) / 4, s)))
        rows.append(row)
    for i in range(segs):
        for j in range(2):
            q = (rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j])
            f = bm.faces.new([v for v, _ in q])
            for l, (_, t) in zip(f.loops, q):
                l[uv].uv = t


def rot_y(v, a):
    """Turn a three.js vector about +y by a (three.js convention)."""
    x, y, z = v
    return Vector((x * math.cos(a) + z * math.sin(a), y, -x * math.sin(a) + z * math.cos(a)))


def wing():
    top = empty('ParrotWing')
    fm = feather_mat()
    tilt = 0.45                                # the wing's face turned up toward the eye (as in the game)
    rng = random.Random(3)                     # small differences between feathers, so the rows do not read as a comb
    jit = lambda a: rng.uniform(-a, a)  # noqa: E731
    up = Vector((0, math.cos(tilt), math.sin(tilt)))
    # flight feathers: 11, roots along the leading edge from x -0.02 to -0.42, tips ahead and fanning out
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    for k in range(16):
        along = k / 15
        root = Vector((-0.02 - along * 0.4, 0.0025 * (15 - k), 0.035))
        heading = -math.pi / 2 - 0.12 + along * 0.42 + jit(0.035)    # close to the game's fan, overlapping
        d = rot_y(Vector((-1, 0, 0)), heading)
        d.y -= 0.12 + jit(0.03)
        col = 0 if along > 0.55 else 1
        feather(bm, uv, col, root, d, up, 0.2 * (0.85 + 0.3 * along) * (1 + jit(0.07)), (0.085 if col == 1 else 0.075) * (1 + jit(0.08)))
    obj('wing_flight_feathers', bm, fm, top)
    # coverts: a yellow row over the flights' roots, a red row nearer the edge
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    for k in range(18):
        along = k / 17
        root = Vector((-0.01 - along * 0.42, 0.012 + 0.0015 * (17 - k), 0.045))
        heading = -math.pi / 2 - 0.1 + along * 0.36 + jit(0.05)
        d = rot_y(Vector((-1, 0, 0)), heading)
        d.y -= 0.1 + jit(0.03)
        feather(bm, uv, 2, root, d, up, (0.1 + 0.02 * along) * (1 + jit(0.12)), 0.07 * (1 + jit(0.1)), curve=0.05)
    for k in range(18):
        along = k / 17
        root = Vector((-0.0 - along * 0.43, 0.022 + 0.0012 * (17 - k), 0.055))
        heading = -math.pi / 2 - 0.06 + along * 0.3 + jit(0.06)
        d = rot_y(Vector((-1, 0, 0)), heading)
        d.y -= 0.08 + jit(0.03)
        feather(bm, uv, 3, root, d, up, 0.065 * (1 + jit(0.15)), 0.06 * (1 + jit(0.1)), curve=0.05)
    obj('wing_coverts', bm, fm, top)
    bmat = breast_mat()
    # the wing's leading edge: a red feathered arm from the shoulder out to the wrist
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    seg, rings = 10, 12
    vs = []
    for i in range(rings + 1):
        t = i / rings
        cx = 0.02 - t * 0.46
        r = 0.018 * (1 - 0.5 * t) + 0.005
        ring = []
        for j in range(seg + 1):
            a = 2 * math.pi * j / seg
            p = Vector((cx, 0.03 + r * math.sin(a) * 0.45 - 0.01 * t, 0.052 + r * math.cos(a)))
            ring.append((bm.verts.new(B(p)), (j / seg * 2, t * 3)))
        vs.append(ring)
    for i in range(rings):
        for j in range(seg):
            q = (vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j])
            f = bm.faces.new([v for v, _ in q])
            for l, (_, t) in zip(f.loops, q):
                l[uv].uv = t
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj('wing_edge', bm, bmat, top)
    # the breast under the chin: an egg of red feathers
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=1.0, calc_uvs=True)
    for v in bm.verts:
        x, y, z = v.co                       # Blender coords of the unit sphere; z up
        sx, sy, sz = 0.1, 0.085, 0.125
        zz = z * sz
        # fuller low and in front, narrowing toward the neck
        k = 1.0 - 0.25 * max(0.0, z)
        v.co = Vector((x * sx * k, y * sy * k, zz))
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uvl].uv = (l[uvl].uv.x * 3, l[uvl].uv.y * 2)
    bmesh.ops.translate(bm, vec=B((-0.08, -0.05, 0.3)), verts=bm.verts)
    obj('breast', bm, bmat, top)
    # two feet gripping (two toes forward, two back), grey with dark claws
    skinm = lib.flat('parrot_feet', (0.36, 0.33, 0.33), rough=0.75)
    claw = lib.flat('parrot_claws', (0.05, 0.05, 0.05), rough=0.4)
    bm_feet, bm_claws = bmesh.new(), bmesh.new()
    for side in (-1, 1):
        base = Vector((-0.08 + side * 0.045, -0.15, 0.24))
        for k, (yaw, fwd) in enumerate(((-0.35, 1), (0.25, 1), (-0.25, -1), (0.4, -1))):
            d = rot_y(Vector((0, 0, -1 if fwd > 0 else 1)), yaw * side)
            pts = [base]
            # a toe: out along d, curling down round the perch
            for i, (out, down) in enumerate(((0.025, 0.004), (0.045, 0.014), (0.058, 0.03))):
                pts.append(base + d * out + Vector((0, -down, 0)))
            for i in range(len(pts) - 1):
                r0, r1 = 0.009 - 0.0018 * i, 0.008 - 0.0018 * i
                t = bmesh.new()
                bmesh.ops.create_cone(t, cap_ends=True, segments=6, radius1=r0, radius2=r1, depth=(pts[i + 1] - pts[i]).length)
                bmesh.ops.translate(t, vec=(0, 0, (pts[i + 1] - pts[i]).length / 2), verts=t.verts)
                q = Vector((0, 0, 1)).rotation_difference((B(pts[i + 1]) - B(pts[i])).normalized())
                bmesh.ops.rotate(t, verts=t.verts, cent=(0, 0, 0), matrix=q.to_matrix())
                bmesh.ops.translate(t, vec=B(pts[i]), verts=t.verts)
                me = bpy.data.meshes.new('tmp')
                t.to_mesh(me)
                t.free()
                bm_feet.from_mesh(me)
                bpy.data.meshes.remove(me)
            tip = pts[-1]
            c = bmesh.new()
            bmesh.ops.create_cone(c, cap_ends=True, segments=6, radius1=0.004, radius2=0.0005, depth=0.018)
            bmesh.ops.translate(c, vec=(0, 0, 0.009), verts=c.verts)
            q = Vector((0, 0, 1)).rotation_difference(B(d * 0.3 + Vector((0, -1, 0))).normalized())
            bmesh.ops.rotate(c, verts=c.verts, cent=(0, 0, 0), matrix=q.to_matrix())
            bmesh.ops.translate(c, vec=B(tip), verts=c.verts)
            me = bpy.data.meshes.new('tmp')
            c.to_mesh(me)
            c.free()
            bm_claws.from_mesh(me)
            bpy.data.meshes.remove(me)
        # the leg up into the breast
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=True, segments=8, radius1=0.012, radius2=0.016, depth=0.07)
        bmesh.ops.translate(t, vec=B(base) + Vector((0, 0, 0.035)), verts=t.verts)
        me = bpy.data.meshes.new('tmp')
        t.to_mesh(me)
        t.free()
        bm_feet.from_mesh(me)
        bpy.data.meshes.remove(me)
    obj('feet', bm_feet, skinm, top)
    obj('claws', bm_claws, claw, top)
    eye = B((0.0 - 0.08, 0.27, 0.34))
    views = [('player', tuple(eye), tuple(B((-0.12, -0.05, 0.05))), 22), ('above', tuple(B((-0.2, 0.7, 0.2))), tuple(B((-0.2, 0, -0.05))), 35),
             ('front', tuple(B((-0.15, 0.05, -0.75))), tuple(B((-0.15, -0.02, 0.1))), 35)]
    return top, views


def tips():
    top = empty('WingTipFeathers')
    fm = feather_mat()
    for k, (name, col, width) in enumerate((('feather_primary', 0, 0.24), ('feather_secondary', 1, 0.28),
                                            ('feather_covert_yellow', 2, 0.42), ('feather_covert_red', 3, 0.42))):
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new()
        feather(bm, uv, col, (0, 0, 0), (-1, 0, 0), (0, 1, 0), 1.0, width, curve=0.05, ridge=0.03)
        o = obj(name, bm, fm, top)
        o.location = (0, -0.35 * k, 0)        # side by side in the file; the game takes each as a template
    views = [('tips', (-0.5, -0.5, 1.6), (-0.5, -0.5, 0), 40)]
    return top, views


top, views = {'wing': wing, 'tips': tips}[PART]()
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
lib.write_json(os.path.join(HERE, 'stats', f'player_{PART}.json'), {'triangles': t, 'draw_calls': calls, 'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS', PART, t, calls)
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    lib.render_views(views, PREVIEW, f'player_{PART}', HDRI, size=(800, 600), samples=24)
