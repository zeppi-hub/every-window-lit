"""Still people for the circus, from a person built by art/v2/insan/build.py --stage joined:

  nice -n 20 blender -b --python art/v2/sirk/pose.py -- <key_joined.blend> <pose> <out.glb> [--preview dir]

pose:
  catcher   the trapeze catcher hanging by his knees, head down, arms reaching down toward the
            flyer; red leotard (the body's trunk and legs), chalked hands and wrists as separate
            meshes, a small lamp at the bar. Origin on the bar, in the crook of the knees; he faces
            three.js -X (toward the flyer), the bar runs along three.js Z.
  pushing   a circus hand leaning into the safety net's frame (for the tent's net crew); origin on
            the ground under the hips, facing three.js +Z; about 2,200 triangles.
  seated    a spectator on a bench, looking up at the high wire, hands on the thighs; one
            mesh in one 512 atlas (skin and clothes) plus the hair; about 800 triangles.
            Origin on the seat under the middle of the hips, facing three.js +Z. With
            --impostor <png> also a picture of the front for far rows (transparent round it).

The pose comes from motion.pose_from_directions (forward kinematics from MakeHuman's rest,
elbows and knees as hinges), is applied to the meshes, and the skeleton is dropped: the files
are static meshes, cheap enough to instance.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'insan'))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import lib  # noqa: E402
import motion  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
BLEND, POSE, OUT = A[0], A[1], A[2]
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else ''
IMPOSTOR = A[A.index('--impostor') + 1] if '--impostor' in A else ''
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')

bpy.ops.wm.open_mainfile(filepath=BLEND)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
KEY = rig.name
skin, outfit, hair = (bpy.data.objects[f'{KEY}_{p}'] for p in ('skin', 'outfit', 'hair'))
print('SHOULDERS smoothed', motion.smooth_shoulders(rig, [skin, outfit]))
T = motion.Target(rig, [skin, outfit])
F = T.forward
U = Vector((0, 0, 1))
L = U.cross(F).normalized()          # the person's left


def d(f=0.0, u=0.0, l=0.0, side=1):
    """A direction in the body's frame; side -1 mirrors left to right."""
    return (F * f + U * u + L * (l * side)).normalized()


if POSE == 'catcher':
    # Built standing (upright), then turned head down. Standing up, the thighs hang as usual, the
    # knees bend 75 degrees (so, hanging, the shins go back over the bar and a little up) and the
    # arms go straight up over the head, a little forward (toward the flyer once he hangs).
    dirs = {}
    for side, s in (('Left', 1), ('Right', -1)):
        dirs[f'{side}UpLeg'] = d(0.02, -1, 0.06, s)
        dirs[f'{side}Leg'] = d(-math.sin(math.radians(75)), -math.cos(math.radians(75)), 0.04, s)
        dirs[f'{side}Arm'] = d(0.22, 1, 0.12, s)
        dirs[f'{side}ForeArm'] = d(0.3, 1, 0.1, s)
    W = motion.pose_from_directions(T, dirs, trunk_pitch=0.0, head_pitch=math.radians(-12))
elif POSE == 'pushing':
    # a circus hand leaning into the net frame: hands forward at hip-to-chest height, one foot ahead
    dirs = {'LeftUpLeg': d(0.32, -1, 0.06), 'LeftLeg': d(0.02, -1, 0.03), 'RightUpLeg': d(-0.28, -1, -0.06), 'RightLeg': d(-0.42, -1, -0.03)}
    for side, s in (('Left', 1), ('Right', -1)):
        dirs[f'{side}Arm'] = d(0.9, -0.45, 0.18, s)
        dirs[f'{side}ForeArm'] = d(1, -0.05, -0.12, s)
    W = motion.pose_from_directions(T, dirs, trunk_pitch=math.radians(18), head_pitch=math.radians(-14))
elif POSE == 'seated':
    dirs = {}
    for side, s in (('Left', 1), ('Right', -1)):
        dirs[f'{side}UpLeg'] = d(1, -0.08, 0.1, s)
        dirs[f'{side}Leg'] = d(0.12, -1, 0.03, s)
        dirs[f'{side}Arm'] = d(0.38, -1, 0.12, s)
        dirs[f'{side}ForeArm'] = d(1, -0.45, -0.12, s)
    W = motion.pose_from_directions(T, dirs, trunk_pitch=math.radians(6), head_pitch=math.radians(-18))
else:
    raise SystemExit(f'unknown pose {POSE}')
motion.apply_pose(T, W)
pb = rig.pose.bones
pos = {n: rig.matrix_world @ pb[n].head for n in T.order}
hand_pts = {s: rig.matrix_world @ (pb[f'{s}Hand'].matrix @ Vector((0, 0.05, 0))) for s in ('Left', 'Right')}
# the forearm's direction at the wrist, to tell the wrist wrap (7 cm up the forearm) from the rest of the arm
fore_dir = {s: (rig.matrix_world.to_3x3() @ pb[f'{s}ForeArm'].matrix.to_3x3()).col[1].normalized() for s in ('Left', 'Right')}


def dominant(o, v, gname):
    best, bw = None, 0
    for g in v.groups:
        if g.weight > bw:
            best, bw = gname.get(g.group), g.weight
    return best


# Bake the pose into the meshes and drop the skeleton.
for o in (skin, outfit, hair):
    for m in list(o.modifiers):
        if m.type == 'ARMATURE':
            with bpy.context.temp_override(object=o, active_object=o):
                bpy.ops.object.modifier_apply(modifier=m.name)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
bpy.data.objects.remove(rig, do_unlink=True)

COLL = bpy.data.collections.new(POSE)
bpy.context.scene.collection.children.link(COLL)
top = bpy.data.objects.new({'catcher': 'Catcher', 'seated': 'Spectator', 'pushing': 'CircusHand'}[POSE], None)
COLL.objects.link(top)
for o in (skin, outfit, hair):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    COLL.objects.link(o)

if POSE == 'catcher':
    gname = {g.index: g.name for g in skin.vertex_groups}
    LEO = {'Hips', 'LowerBack', 'Spine', 'Spine1', 'LHipJoint', 'RHipJoint', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg',
           'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftShoulder', 'RightShoulder'}
    HANDS = {'Left': {'LeftHand', 'LeftFingerBase', 'LeftHandFinger1', 'LThumb'}, 'Right': {'RightHand', 'RightFingerBase', 'RightHandFinger1', 'RThumb'}}
    red = lib.flat('leotard_red', (0.42, 0.03, 0.05), rough=0.62)
    chalk = lib.flat('catcher_chalk', (0.93, 0.92, 0.89), rough=0.95)
    skin.data.materials.append(red)
    me = skin.data
    wrist = {s: pos[f'{s}Hand'] for s in ('Left', 'Right')}
    hand_faces = {'Left': [], 'Right': []}
    for poly in me.polygons:
        doms = [dominant(skin, me.vertices[i], gname) for i in poly.vertices]
        centre = sum((me.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
        side_hit = None
        for s in ('Left', 'Right'):
            if any(g in HANDS[s] or g == f'{s}ForeArm' for g in doms) and (centre - wrist[s]).dot(fore_dir[s]) > -0.07:
                side_hit = s
        if side_hit:
            hand_faces[side_hit].append(poly.index)
        elif sum(1 for g in doms if g in LEO) * 2 > len(doms):
            poly.material_index = 1
    # chalked hands and wrist wraps: their own meshes, so the game can light them in the dark
    bpy.context.view_layer.objects.active = skin
    for s, label in (('Left', 'left'), ('Right', 'right')):
        chosen = set(hand_faces[s])
        for o in bpy.data.objects:
            o.select_set(o == skin)
        for e in me.edges:
            e.select = False
        for v in me.vertices:
            v.select = False
        for poly in me.polygons:
            poly.select = poly.index in chosen
            if poly.select:
                for i in poly.vertices:
                    me.vertices[i].select = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_mode(type='VERT')
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        new = [o for o in COLL.objects if o.type == 'MESH' and o.name.startswith(skin.name) and o != skin][-1]
        new.name = f'CatcherHand {label}'
        new.data.name = new.name
        new.data.materials.clear()
        new.data.materials.append(chalk)
        # hand_faces indices shift after separating: recompute for the other side
        me = skin.data
        gname = {g.index: g.name for g in skin.vertex_groups}
        hand_faces = {'Left': [], 'Right': []}
        for poly in me.polygons:
            doms = [dominant(skin, me.vertices[i], gname) for i in poly.vertices]
            centre = sum((me.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
            for s2 in ('Left', 'Right'):
                if any(g in HANDS[s2] or g == f'{s2}ForeArm' for g in doms) and (centre - wrist[s2]).dot(fore_dir[s2]) > -0.07:
                    hand_faces[s2].append(poly.index)
    # Turn him head down about his left axis through the bar (in the crook of the knees), then
    # face three.js -X (Blender -X).
    knees = (pos['LeftLeg'] + pos['RightLeg']) / 2
    bar = knees - F * 0.075
    M = Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Rotation(math.pi, 4, L) @ Matrix.Translation(-bar)
    for o in [o for o in COLL.objects if o.type == 'MESH']:
        o.data.transform(M)
        o.data.update()
    for s in ('Left', 'Right'):
        hand_pts[s] = M @ hand_pts[s]
    # the bar lamp: a small brass cage round a warm bulb, 0.12 m over the bar (three.js y)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.04)
    bmesh.ops.translate(bm, vec=(0, 0, 0.12), verts=bm.verts)
    lme = bpy.data.meshes.new('CatcherLamp')
    bm.to_mesh(lme)
    bm.free()
    lamp = bpy.data.objects.new('CatcherLamp', lme)
    lme.materials.append(lib.flat('catcher_lamp', (1.0, 0.77, 0.42), rough=0.3, emissive=(1.0, 0.7, 0.35)))
    COLL.objects.link(lamp)
    for s, label in (('Left', 'left'), ('Right', 'right')):
        e = bpy.data.objects.new(f'catcher_palm_{label}', None)
        e.location = hand_pts[s]
        COLL.objects.link(e)
    views = [('side', (0.6, -3.6, -0.7), (0, 0, -0.75), 40), ('flyer', (-3.4, -0.8, -1.1), (0, 0, -0.85), 40)]
else:
    # Spectator or circus hand: one atlas for skin and clothes (one draw), the hair its own alpha-cut material.
    for o in bpy.data.objects:
        o.select_set(o in (skin, outfit))
    bpy.context.view_layer.objects.active = outfit
    bpy.ops.object.join()
    body = outfit
    body.name = 'spectator_body' if POSE == 'seated' else 'crew_body'
    body.data.name = body.name
    dec = body.modifiers.new('decimate', 'DECIMATE')
    dec.ratio = (650 if POSE == 'seated' else 1800) / max(1, sum(len(p.vertices) - 2 for p in body.data.polygons))
    dec.use_collapse_triangulate = True
    with bpy.context.temp_override(object=body, active_object=body):
        bpy.ops.object.modifier_apply(modifier='decimate')
    hd = hair.modifiers.new('decimate', 'DECIMATE')
    hd.ratio = (150 if POSE == 'seated' else 400) / max(1, sum(len(p.vertices) - 2 for p in hair.data.polygons))
    with bpy.context.temp_override(object=hair, active_object=hair):
        bpy.ops.object.modifier_apply(modifier='decimate')
    me = body.data
    src_uv = me.uv_layers[0]
    atl = me.uv_layers.new(name='atlas')
    me.uv_layers.active = atl
    src_uv.active_render = True
    for o in bpy.data.objects:
        o.select_set(o == body)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('spectator_atlas', 512, 512, alpha=False)
    for slot in body.material_slots:
        nt = slot.material.node_tree
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        for n in nt.nodes:
            n.select = False
        t.select = True
        nt.nodes.active = t
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=4, use_clear=True)
    img.pack()
    me.materials.clear()
    m = lib.new_material('spectator')
    b = lib._principled(m)
    t = m.node_tree.nodes.new('ShaderNodeTexImage')
    t.image = img
    m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.8
    me.materials.append(m)
    me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers[0].name = 'UVMap'
    # no eyebrows on a spectator (a third draw for a few pixels)
    brow = [i for i, mm in enumerate(hair.data.materials) if 'eyebrow' in mm.name]
    if brow:
        bmh = bmesh.new()
        bmh.from_mesh(hair.data)
        bmesh.ops.delete(bmh, geom=[f for f in bmh.faces if f.material_index in brow], context='FACES')
        bmh.to_mesh(hair.data)
        bmh.free()
        for i in sorted(brow, reverse=True):
            hair.data.materials.pop(index=i)
    hair.name = 'spectator_hair' if POSE == 'seated' else 'crew_hair'
    for mm in hair.data.materials:
        im = next((n.image for n in mm.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        if im and max(im.size) > 256:
            im.scale(256, 256)
            im.pack()
    if POSE == 'seated':
        # origin on the seat under the middle of the hips (the hip joints sit about 0.09 m above it)
        seat = (pos['LeftUpLeg'] + pos['RightUpLeg']) / 2 - U * 0.09
    else:
        # origin on the ground under the middle of the hips
        low = min((o.matrix_world @ v.co).z for o in (body,) for v in o.data.vertices)
        mid = (pos['LeftUpLeg'] + pos['RightUpLeg']) / 2
        seat = Vector((mid.x, mid.y, low))
    for o in (body, hair):
        o.data.transform(Matrix.Translation(-seat))
    views = [('front', (0.5, -2.2, 0.4), (0, 0, 0.25), 40), ('side', (2.2, -0.4, 0.4), (0, 0, 0.25), 40)]

for o in COLL.objects:
    if o != top:
        o.parent = top
        for g in list(getattr(o, 'vertex_groups', [])):
            o.vertex_groups.remove(g)
bpy.context.view_layer.update()
tris = sum(len(p.vertices) - 2 for o in COLL.objects if o.type == 'MESH' for p in o.data.polygons)
mats = sum(len(o.data.materials) for o in COLL.objects if o.type == 'MESH')
info = {'pose': POSE, 'from': KEY, 'triangles': tris, 'materials': mats, 'nodes': sorted(o.name for o in COLL.objects)}
if POSE == 'catcher':
    # three.js coordinates of the palms (x, y, z) = Blender (x, z, -y)
    info['palms_threejs'] = {s: [round(hand_pts[s].x, 3), round(hand_pts[s].z, 3), round(-hand_pts[s].y, 3)] for s in hand_pts}
lib.write_json(os.path.join(HERE, 'stats', os.path.basename(OUT).replace('_raw', '').replace('.glb', '.json')), info)
print('INFO', info)
for o in bpy.context.view_layer.objects:
    o.select_set(o in list(COLL.objects))
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='AUTO', export_animations=False, export_skins=False, export_cameras=False,
                          export_lights=False, export_extras=False, export_vertex_color='NONE')
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    lib.render_views(views, PREVIEW, POSE, HDRI, size=(700, 700), samples=24)
if IMPOSTOR and POSE == 'seated':
    # front picture for crossed-quad or camera-facing billboards in the far rows: orthographic,
    # transparent background, the seat line (origin) at the bottom edge's quarter
    pts = [o.matrix_world @ v.co for o in (body, hair) for v in o.data.vertices]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 256, 512
    cam = bpy.data.objects.new('imp_cam', bpy.data.cameras.new('imp_cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    h = (z1 - z0) * 1.04
    cam.data.ortho_scale = h
    cam.location = ((x0 + x1) / 2, -5, (z0 + z1) / 2)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    sun = bpy.data.objects.new('imp_sun', bpy.data.lights.new('imp_sun', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(20))
    sc.collection.objects.link(sun)
    sc.render.filepath = IMPOSTOR
    bpy.ops.render.render(write_still=True)
    lib.write_json(os.path.splitext(IMPOSTOR)[0] + '.json', {'width_m': round(h / 2, 3), 'height_m': round(h, 3),
                   'seat_from_bottom_m': round(-(z0 + z1) / 2 + h / 2, 3), 'note': 'picture 256 x 512 px covers width_m x height_m; the seat (origin) is seat_from_bottom_m above its bottom edge'})
print('DONE', OUT)
