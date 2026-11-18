"""One person from the Microsoft Rocketbox avatar library (MIT licence) for v2: the photo-textured
avatar is put on the same 31-bone skeleton, node names and five clips as the MakeHuman people
(build.py), so the game code does not change.

  nice -n 20 blender -b --python art/v2/insan/rocketbox.py -- <avatar.fbx> <textures dir> <key> <out.glb> \
      [--head 2048] [--preview <dir>] [--warn-only]

Steps:
1. The FBX (3ds Max Biped skeleton, "Bip01 ...") is imported. Biped bones are renamed to the CMU names
   the game uses (Pelvis -> Hips, Spine/Spine1/Spine2 -> LowerBack/Spine/Spine1, Clavicle -> LeftShoulder,
   UpperArm -> LeftArm, ...). Every other bone (the rest of the fingers, toes, twist and face bones,
   the Biped root) is removed and its skin weights go to the nearest kept bone above it. LHipJoint,
   RHipJoint and Neck1, which the CMU skeleton has and Biped does not, are added with no weight.
2. The one mesh is split by material into <key>_skin (head), <key>_outfit (body and clothes) and
   <key>_hair (hair and lashes, alpha-cut), with the avatar's own photo textures (head at --head px,
   default 1024; the rest 1024; head normal map 1024).
3. The five clips of clips.json are put on with motion.py and every frame is checked (motion.check);
   the build stops on a failure unless --warn-only.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
sys.path.insert(0, HERE)
import lib  # noqa: E402
import motion  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
FBX, TEX, KEY, OUT = A[0], A[1], A[2], A[3]
HEAD_PX = int(A[A.index('--head') + 1]) if '--head' in A else 1024
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else ''
CMU = os.path.join(lib.CACHE, 'cmu')
CLIPS = json.load(open(os.path.join(HERE, 'clips.json')))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True, ignore_leaf_bones=False)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
# The FBX brings a take that keys the armature object (its unit scale) and its bones: drop it, or
# every frame change puts the old transform back.
for o in bpy.data.objects:
    o.animation_data_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
print('IMPORTED', rig.name, len(rig.data.bones), 'bones;', [(o.name, len(o.data.polygons), [m.name for m in o.data.materials]) for o in meshes])
# Bake the object transforms (the FBX unit scale and axis turn sit on the armature object, the
# meshes are its children) straight into the data: vertices by their world matrix, bones in edit
# mode by the armature's. The operator transform_apply leaves the armature untouched here.
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.data.transform(mw)
    o.matrix_world = Matrix.Identity(4)
for o in [x for x in bpy.data.objects if x.type == 'EMPTY']:
    bpy.data.objects.remove(o, do_unlink=True)
M = rig.matrix_world.copy()
for x in bpy.data.objects:
    x.select_set(x == rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
# Biped bones are connected: moving one bone's tail would move its child's head as well, so a joint
# would be moved twice. Free them first, then move each bone once.
for e in rig.data.edit_bones:
    e.use_connect = False
for e in rig.data.edit_bones:
    e.transform(M, scale=True, roll=True)
bpy.ops.object.mode_set(mode='OBJECT')
rig.matrix_world = Matrix.Identity(4)
zs = [v.co.z for o in meshes for v in o.data.vertices]
height = max(zs) - min(zs)
lift = -min(zs)
for o in meshes:
    o.data.transform(Matrix.Translation((0, 0, lift)))
bpy.ops.object.mode_set(mode='EDIT')
for e in rig.data.edit_bones:
    e.head.z += lift
    e.tail.z += lift
bpy.ops.object.mode_set(mode='OBJECT')
print('BAKED height', round(height, 3), 'lift', round(lift, 4), 'head bone z', round(rig.data.bones['Bip01 Head'].head_local.z, 3))
if not 1.4 < height < 2.2:
    raise SystemExit(f'{KEY}: odd height {height:.3f} m after baking the FBX transforms')
for o in meshes:
    o.parent = rig
    o.matrix_parent_inverse = Matrix.Identity(4)
    for mod in o.modifiers:
        if mod.type == 'ARMATURE':
            mod.object = rig

# ------------------------------------------------------------------ 1. the skeleton
names = [b.name for b in rig.data.bones]
spine = sorted([n for n in names if n.startswith('Bip01 Spine')], key=lambda n: (len(n), n))
MAP = {'Bip01 Pelvis': 'Hips', 'Bip01 Neck': 'Neck', 'Bip01 Head': 'Head'}
if len(spine) >= 3:
    MAP[spine[0]], MAP[spine[len(spine) // 2]], MAP[spine[-1]] = 'LowerBack', 'Spine', 'Spine1'
for s, side, th in (('L', 'Left', 'LThumb'), ('R', 'Right', 'RThumb')):
    MAP.update({f'Bip01 {s} Clavicle': f'{side}Shoulder', f'Bip01 {s} UpperArm': f'{side}Arm', f'Bip01 {s} Forearm': f'{side}ForeArm',
                f'Bip01 {s} Hand': f'{side}Hand', f'Bip01 {s} Finger0': th, f'Bip01 {s} Finger1': f'{side}FingerBase',
                f'Bip01 {s} Finger11': f'{side}HandFinger1', f'Bip01 {s} Thigh': f'{side}UpLeg', f'Bip01 {s} Calf': f'{side}Leg',
                f'Bip01 {s} Foot': f'{side}Foot', f'Bip01 {s} Toe0': f'{side}ToeBase'})
missing = [k for k in MAP if k not in names]
if missing:
    raise SystemExit(f'{KEY}: Biped bones not found: {missing}')


def kept_above(b):
    while b is not None and b.name not in MAP:
        b = b.parent
    return b


# skin weights of the removed bones go to the nearest kept bone above them
for o in meshes:
    groups = {g.name: g for g in o.vertex_groups}
    for b in rig.data.bones:
        if b.name in MAP or b.name not in groups:
            continue
        k = kept_above(b)
        target = k.name if k is not None else 'Bip01 Pelvis'
        src = groups[b.name]
        dst = groups.get(target) or o.vertex_groups.new(name=target)
        groups[target] = dst
        for v in o.data.vertices:
            for g in v.groups:
                if g.group == src.index and g.weight > 0:
                    dst.add([v.index], g.weight, 'ADD')
        o.vertex_groups.remove(src)
        groups.pop(b.name)
for o in bpy.data.objects:
    o.select_set(o == rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
for b in list(eb):
    if b.name not in MAP:
        k = b.parent
        while k is not None and k.name not in MAP:
            k = k.parent
        for c in b.children:
            c.parent = k
for b in list(eb):
    if b.name not in MAP:
        eb.remove(b)
for b in eb:
    b.name = MAP[b.name]
for o in meshes:
    for g in o.vertex_groups:
        if g.name in MAP:
            g.name = MAP[g.name]
# the CMU bones Biped lacks, with no weight: hip joints between Hips and the thighs, Neck1 under Head
hips = eb['Hips']
for side, j in (('Left', 'LHipJoint'), ('Right', 'RHipJoint')):
    up = eb[f'{side}UpLeg']
    nb = eb.new(j)
    nb.head, nb.tail = hips.head.copy(), up.head.copy()
    if (nb.tail - nb.head).length < 1e-3:
        nb.tail = nb.head + Vector((0.05 if side == 'Left' else -0.05, 0, 0))
    nb.parent = hips
    up.parent = nb
    up.use_connect = False
# Biped hangs the clavicles on the neck; the CMU skeleton (and the game) has them on Spine1, so the
# shoulders do not ride on the neck's motion.
for side in ('Left', 'Right'):
    eb[f'{side}Shoulder'].parent = eb['Spine1']
    eb[f'{side}Shoulder'].use_connect = False
head, neck = eb['Head'], eb['Neck']
n1 = eb.new('Neck1')
n1.head = neck.head.lerp(head.head, 0.5)
n1.tail = head.head.copy()
n1.parent = neck
head.parent = n1
head.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
rig.name = KEY
rig.data.name = KEY
print('SKELETON', len(rig.data.bones), sorted(b.name for b in rig.data.bones))

# ------------------------------------------------------------------ 2. meshes and materials
for o in meshes:
    for g in list(o.vertex_groups):
        if g.name not in {b.name for b in rig.data.bones}:
            o.vertex_groups.remove(g)
if len(meshes) > 1:
    with bpy.context.temp_override(selected_editable_objects=meshes, active_object=meshes[0], selected_objects=meshes):
        bpy.ops.object.join()
mesh = meshes[0]
for o in bpy.data.objects:
    o.select_set(o == mesh)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']


def tex(kind):
    for f in os.listdir(TEX):
        if f.lower().endswith(f'{kind}.tga') or f.lower().endswith(f'{kind}.png'):
            return os.path.join(TEX, f)
    return None


def material(name, colour, size, alpha=False, normal=None, rough=0.6):
    m = lib.new_material(name)
    b = lib._principled(m)
    nt = m.node_tree
    img = bpy.data.images.load(colour)
    if max(img.size) > size:
        img.scale(size, max(1, int(size * img.size[1] / img.size[0])))
    img.pack()
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if alpha:
        rnd = nt.nodes.new('ShaderNodeMath')
        rnd.operation = 'ROUND'                      # glTF alphaMode MASK, cutoff 0.5
        nt.links.new(t.outputs['Alpha'], rnd.inputs[0])
        nt.links.new(rnd.outputs[0], b.inputs['Alpha'])
        m.surface_render_method = 'DITHERED'
    if normal:
        nimg = bpy.data.images.load(normal)
        nimg.colorspace_settings.name = 'Non-Color'
        if max(nimg.size) > 1024:
            nimg.scale(1024, 1024)
        nimg.pack()
        nt_ = nt.nodes.new('ShaderNodeTexImage')
        nt_.image = nimg
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(nt_.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m


skin = outfit = hair = None
for o in parts:
    mn = (o.data.materials[0].name if o.data.materials else '').lower()
    if 'opacity' in mn or 'hair' in mn or 'lash' in mn:
        hair = o
    elif 'head' in mn:
        skin = o
    else:
        outfit = o if outfit is None else outfit
print('PARTS', [(o.name, o.data.materials[0].name if o.data.materials else '', len(o.data.polygons)) for o in parts])
if skin is None or outfit is None:
    raise SystemExit(f'{KEY}: could not tell head and body apart: {[o.data.materials[0].name for o in parts]}')
for o, nm, m in ((skin, f'{KEY}_skin', material(f'{KEY}_head', tex('head_color'), HEAD_PX, normal=tex('head_normal'), rough=0.55)),
                 (outfit, f'{KEY}_outfit', material(f'{KEY}_body', tex('body_color'), 1024, rough=0.7)),
                 (hair, f'{KEY}_hair', material(f'{KEY}_hair', tex('opacity_color'), 1024, alpha=True, rough=0.65) if hair else None)):
    if o is None:
        continue
    o.name = nm
    o.data.name = nm
    o.data.materials.clear()
    o.data.materials.append(m)
    while len(o.data.uv_layers) > 1:
        o.data.uv_layers.remove(o.data.uv_layers[-1])
    o.data.uv_layers[0].name = 'UVMap'
    for mod in o.modifiers:
        if mod.type == 'ARMATURE':
            mod.object = rig
    o.parent = rig
    o.matrix_parent_inverse = Matrix.Identity(4)   # not the FBX's old one (it carried the unit scale)
meshes = [o for o in (skin, outfit, hair) if o]
print('MESHES', [(o.name, lib.tris(o)) for o in meshes], 'total', sum(lib.tris(o) for o in meshes))
lowest = min((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)
print('FEET at', round(lowest, 3), 'height', round(max((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices) - lowest, 3))

# ------------------------------------------------------------------ 3. motion and the check
sc = bpy.context.scene
sc.render.fps = motion.FPS
print('SHOULDERS smoothed', motion.smooth_shoulders(rig, [skin, outfit]))
for o in meshes:
    o.hide_viewport = True
T = motion.Target(rig, [skin, outfit])
CHOSEN, HINGES = {}, {}
for name, spec in CLIPS.items():
    if name.startswith('_'):
        continue
    act, f0, f1, speed, notes = motion.retarget(T, name, spec, os.path.join(CMU, f'{spec["bvh"]}.bvh'))
    HINGES[name] = notes.pop('hinge')
    CHOSEN[name] = {'bvh': spec['bvh'], 'from_s': round((f0 - 1) / 120, 2), 'frames_30fps': int(act.frame_range[1]), **notes}
for pb in rig.pose.bones:
    pb.rotation_quaternion = Quaternion()
    pb.location = Vector()
CHECK, FAILS = motion.check(T, {k: v for k, v in CLIPS.items() if not k.startswith('_')}, HINGES)
print('CHECK', json.dumps(CHECK))
for o in meshes:
    o.hide_viewport = False
if FAILS:
    print('CHECK FAILED', len(FAILS))
    for line in FAILS[:30]:
        print('  ', line)
    if '--warn-only' not in A:
        raise SystemExit(f'{KEY}: {len(FAILS)} frames break the pose rules; nothing exported')

# ------------------------------------------------------------------ 4. export and preview
for o in bpy.data.objects:
    o.select_set(o in [rig] + meshes)
bpy.context.view_layer.objects.active = rig
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_image_format='AUTO', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_frame_step=1, export_skins=True, export_def_bones=False, export_optimize_animation_size=True,
    export_cameras=False, export_lights=False, export_extras=False, export_vertex_color='NONE', export_tangents=False)
stats = {'key': KEY, 'source': os.path.basename(FBX), 'triangles': sum(lib.tris(o) for o in meshes),
         'draw_calls': sum(len(o.data.materials) for o in meshes), 'bones': len(rig.data.bones), 'clips': CHOSEN,
         'check': CHECK, 'check_failures': len(FAILS)}
lib.write_json(os.path.join(os.path.dirname(os.path.abspath(OUT)), f'{KEY}.json'), stats)
print('STATS', json.dumps({k: v for k, v in stats.items() if k != 'check'}))
if PREVIEW:
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 16
    sc.render.resolution_x, sc.render.resolution_y = 360, 540
    sc.view_settings.view_transform = 'AgX'
    sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.66, 0.72, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(55), 0, math.radians(25))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 50
    centre = Vector((0, 0, 0.95))
    eye = centre + T.forward * 3.1 + Vector((0, 0, 0.15)) + T.forward.cross(Vector((0, 0, 1))) * 1.0
    cam.location = eye
    cam.rotation_euler = (centre - eye).to_track_quat('-Z', 'Y').to_euler()
    for label, fr in (('idle', 0.5), ('walk', 0.3), ('talk', 0.4), ('point', 0.5), ('cheer', 0.5)):
        act = bpy.data.actions[label]
        rig.animation_data.action = act
        sc.frame_set(max(1, int(act.frame_range[1] * fr)))
        sc.render.filepath = os.path.join(PREVIEW, f'{KEY}_{label}.png')
        bpy.ops.render.render(write_still=True)
print('DONE', OUT)
