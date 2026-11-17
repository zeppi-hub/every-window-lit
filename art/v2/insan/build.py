"""Builds one realistic person for v2 with MakeHuman's MPFB (CC0 system assets),
bakes it for Quest and retargets CMU motion-capture clips onto its skeleton.

  BLENDER_USER_RESOURCES=<dir with MPFB installed> V2_CACHE=<cache> \
    nice -n 20 blender -b --python art/v2/insan/build.py -- <key> <out.glb> [--preview <dir>]

<key> is an entry of characters.json. Steps:
1. MPFB makes the body (a low-poly game proxy), eyes, eyebrows, hair and clothes
   from the MakeHuman CC0 system assets, rigged with MakeHuman's "cmu_mb"
   skeleton, whose bone names are the CMU BVH ones.
2. Hidden body under clothes is removed; heavy garments are decimated.
3. Body, eyes and clothes are baked into one 1024 colour atlas (one draw call);
   hair and eyebrows keep their own alpha-cut textures (512) in one more mesh.
4. CMU clips (BVH from the Hahne conversion of mocap.cs.cmu.edu) are retargeted
   per bone in world space and sampled at 30 fps into actions:
   idle, walk (in place, looping), talk, point, cheer.
"""
import json
import math
import os
import sys

import addon_utils
import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:]
KEY, OUT = ARGS[0], ARGS[1]
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else ''
STAGE = ARGS[ARGS.index('--stage') + 1] if '--stage' in ARGS else 'all'
C = lib.CACHE
HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = json.load(open(os.path.join(HERE, 'characters.json')))[KEY]
CMU = os.path.join(C, 'cmu')

# Clips: (action name, BVH file, start s, end s, loop). Times picked by looking at the motion.
CLIPS = json.load(open(os.path.join(HERE, 'clips.json')))

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402

# ------------------------------------------------------------------ 1. the person
info = HumanService._create_default_human_info_dict()
pheno = info['phenotype']
for k, v in SPEC['phenotype'].items():
    pheno[k] = v
info['name'] = KEY
info['rig'] = 'cmu_mb'
info['skin_mhmat'] = SPEC['skin']
info['skin_material_type'] = 'MAKESKIN'
info['eyes_material_type'] = 'MAKESKIN'
info['proxy'] = SPEC['proxy']
info['eyes'] = SPEC['eyes']
info['eyebrows'] = SPEC['eyebrows']
info['hair'] = SPEC['hair']
info['clothes'] = SPEC['clothes']
info['clothes_material_type'] = 'MAKESKIN'
settings = HumanService.get_default_deserialization_settings()
# MPFB's own "feet on ground" step, run headless, lifts the meshes but only some of the
# bones; build everything in MakeHuman's coordinates instead and lift it all together below.
settings.update({'subdiv_levels': 0, 'detailed_helpers': False, 'override_skin_model': 'MAKESKIN', 'override_rig': 'PRESET', 'feet_on_ground': False})
basemesh = HumanService.deserialize_from_dict(info, settings)
rig = basemesh.parent if basemesh.parent and basemesh.parent.type == 'ARMATURE' else next(o for o in bpy.data.objects if o.type == 'ARMATURE')
rig.name = KEY
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o != basemesh]
print('PARTS', [(o.name, len(o.data.polygons), [m.name for m in o.data.materials]) for o in meshes])


def bone_gaps():
    """For a few bones: centre of the body vertices weighted mostly to it, minus the bone's middle (should be small)."""
    body = next(o for o in meshes if SPEC['proxy'].split('.')[0] in o.name)
    out = {}
    for bn in ('Head', 'Neck1', 'Neck', 'Spine1', 'Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'):
        vg = body.vertex_groups.get(bn)
        if vg is None:
            continue
        pts = [body.matrix_world @ v.co for v in body.data.vertices if any(g.group == vg.index and g.weight > 0.8 for g in v.groups)]
        if len(pts) < 4:
            continue
        b = rig.data.bones[bn]
        out[bn] = round(((sum(pts, Vector()) / len(pts)) - rig.matrix_world @ ((b.head_local + b.tail_local) / 2)).z, 3)
    return out


lowest = min((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)
for o in bpy.data.objects:
    o.select_set(o == rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for eb in rig.data.edit_bones:
    eb.head.z -= lowest
    eb.tail.z -= lowest
bpy.ops.object.mode_set(mode='OBJECT')
for o in meshes + [basemesh]:
    o.data.transform(Matrix.Translation((0, 0, -lowest)))
print('LIFT', round(-lowest, 3), 'bone gaps', bone_gaps())

# ------------------------------------------------------------------ 2. clean up: apply masks, drop hidden body, decimate heavy parts
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()


def apply_non_armature(o):
    """Applies every modifier except the armature one (masks that hide body under clothes)."""
    for m in list(o.modifiers):
        if m.type == 'ARMATURE':
            continue
        with bpy.context.temp_override(object=o, active_object=o):
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except RuntimeError as e:
                print('MODIFIER skip', o.name, m.name, e)
                o.modifiers.remove(m)


for o in meshes:
    apply_non_armature(o)
bpy.data.objects.remove(basemesh, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    for token, target in SPEC.get('decimate', {}).items():
        if token in o.name:
            have = lib.tris(o)
            if have > target:
                mod = o.modifiers.new('decimate', 'DECIMATE')
                mod.ratio = target / have
                mod.use_collapse_triangulate = True
                # Decimate before the armature in the stack so the weights carry over.
                with bpy.context.temp_override(object=o, active_object=o):
                    bpy.ops.object.modifier_move_to_index(modifier='decimate', index=0)
                    bpy.ops.object.modifier_apply(modifier='decimate')
# Eyelashes and tongue/teeth are not worth their triangles at VR distance.
for o in list(meshes):
    if any(t in o.name.lower() for t in ('eyelash', 'tongue', 'teeth')):
        bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('AFTER', [(o.name, lib.tris(o)) for o in meshes], 'total', sum(lib.tris(o) for o in meshes))

if STAGE == 'mesh':
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(OUT), f'{KEY}_mesh.blend'))
    sys.exit(0)

# ------------------------------------------------------------------ 3. materials: skin, an outfit atlas, hair and eyebrows
import numpy as np  # noqa: E402


def main_image(mat):
    """The diffuse image of an MPFB material (the image node feeding Base Color, or the first colour image)."""
    best = None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            nm = (n.image.name + ' ' + (n.image.filepath or '')).lower()
            if 'normal' in nm or 'nor' in nm.split('_')[-1] or 'bump' in nm:
                continue
            if 'diffuse' in nm or best is None:
                best = n.image
    return best


def simple(name, img, alpha=False, rough=0.6, tint=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    if tint:
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        nt.links.new(t.outputs['Color'], mix.inputs[6])
        mix.inputs[7].default_value = (*tint, 1)
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    else:
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if alpha:
        nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
        m.surface_render_method = 'DITHERED'
    b.inputs['Roughness'].default_value = rough
    return m


def tinted_image(img, tint, desat=0.0, name=None, lift=0.0, level=0.0, gamma=1.0):
    """A copy of an image, desaturated, contrast eased by `gamma` (< 1 lifts dark parts),
    optionally brightened so its median grey is `level`, multiplied by tint, then lifted
    toward white (alpha kept)."""
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    lum = px[..., :3] @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    rgb = px[..., :3] * (1 - desat) + lum[..., None] * desat
    if gamma != 1.0:
        rgb = np.clip(rgb, 0, 1) ** gamma
    if level:
        g = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        mid = float(np.median(g[px[..., 3] > 0.5])) or 1.0
        rgb = rgb * (level / mid)
    rgb = rgb * np.array(tint, dtype=np.float32)
    rgb = rgb + (1.0 - rgb) * lift
    out = bpy.data.images.new(name or img.name + '_tinted', w, h, alpha=True)
    out.pixels = np.concatenate([np.clip(rgb, 0, 1), px[..., 3:4]], axis=2).ravel().tolist()
    out.pack()
    return out


def kind(o):
    n = o.name.lower()
    if 'eyebrow' in n:
        return 'brows'
    if any(h in n for h in ('short', 'bob', 'ponytail', 'long', 'braid', 'afro')):
        return 'hair'
    if SPEC['proxy'].split('.')[0] in n or n.endswith('.body'):
        return 'skin'
    return 'outfit'


parts = {'skin': [], 'outfit': [], 'hair': [], 'brows': []}
for o in meshes:
    parts[kind(o)].append(o)
print('KINDS', {k: [o.name for o in v] for k, v in parts.items()})
for o in meshes:
    img = main_image(o.data.materials[0])
    k = kind(o)
    tint = None
    for token, t in SPEC.get('clothes_tint', {}).items():
        if token in o.name:
            tint = t
    for token, rc in SPEC.get('clothes_recolour', {}).items():
        if token in o.name:
            # Grey the garment's texture, then colour it: keeps the folds, changes the dye.
            img = tinted_image(img, rc['colour'], rc.get('desaturate', 1.0), f'{KEY}_{token}', rc.get('lift', 0.0), rc.get('level', 0.0), rc.get('gamma', 1.0))
    if k == 'hair' and SPEC.get('hair_tint'):
        img = tinted_image(img, SPEC['hair_tint'], SPEC.get('hair_desaturate', 0.0), f'{KEY}_hair', SPEC.get('hair_lift', 0.0))
    o.data.materials.clear()
    o.data.materials.append(simple(f'{KEY}_{o.name.split(".")[-1]}', img, alpha=k in ('hair', 'brows'), rough=0.75 if k != 'skin' else 0.55, tint=tint))
    # One UV map per mesh, named the same so joins keep it.
    uvs = o.data.uv_layers
    while len(uvs) > 1:
        uvs.remove(uvs[-1])
    uvs[0].name = 'UVMap'


def join(objs, name):
    objs = [o for o in objs if o]
    with bpy.context.temp_override(selected_editable_objects=objs, active_object=objs[0], selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


skin = join(parts['skin'], f'{KEY}_skin')
outfit = join(parts['outfit'], f'{KEY}_outfit')
hair = join(parts['hair'] + parts['brows'], f'{KEY}_hair')

# Bake the outfit's materials into one atlas on a fresh UV map.
me = outfit.data
src_uv = me.uv_layers[0]
atlas_uv = me.uv_layers.new(name='atlas')
me.uv_layers.active = atlas_uv
src_uv.active_render = True
for o in bpy.data.objects:
    o.select_set(o == outfit)
bpy.context.view_layer.objects.active = outfit
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
atlas = bpy.data.images.new(f'{KEY}_outfit_atlas', 1024, 1024, alpha=False)
for slot in outfit.material_slots:
    nt = slot.material.node_tree
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = atlas
    for n in nt.nodes:
        n.select = False
    t.select = True
    nt.nodes.active = t
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 1
for o in bpy.data.objects:
    o.select_set(o == outfit)
bpy.context.view_layer.objects.active = outfit
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=4, use_clear=True)
atlas.pack()
me.materials.clear()
me.materials.append(simple(f'{KEY}_outfit', atlas, rough=0.7))
me.uv_layers.remove(me.uv_layers['UVMap'])
me.uv_layers[0].name = 'UVMap'
# Skin to 1024, hair and brows to 512.
for o, size in ((skin, 1024), (hair, 512)):
    for m in o.data.materials:
        img = main_image(m)
        if img and max(img.size) > size:
            img.scale(size, size)
            img.pack()
print('MATERIALS', [(o.name, [m.name for m in o.data.materials], lib.tris(o)) for o in (skin, outfit, hair)])
if STAGE == 'joined':
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(OUT), f'{KEY}_joined.blend'))
    sys.exit(0)

# ------------------------------------------------------------------ 4. motion: CMU BVH retargeted onto the cmu_mb skeleton
FPS = 30
NAME_MAP = {'LeftHandFinger1': 'LeftHandIndex1', 'RightHandFinger1': 'RightHandIndex1'}
FINGERS = {'LeftHand', 'LeftFingerBase', 'LeftHandFinger1', 'LThumb', 'RightHand', 'RightFingerBase', 'RightHandFinger1', 'RThumb'}
ALIGN = {f'{s}{b}' for s in ('Left', 'Right') for b in ('Arm', 'ForeArm', 'Hand', 'FingerBase', 'HandFinger1', 'UpLeg', 'Leg', 'Foot', 'ToeBase')} | {'LThumb', 'RThumb'}
sc.render.fps = FPS
tb = {b.name: b for b in rig.data.bones}
order = [b.name for b in rig.data.bones]            # parents come before children
RW = rig.matrix_world.to_3x3().normalized()


def horiz(v):
    return Vector((v.x, v.y, 0.0)).normalized()


def facing_from(lhip, rhip):
    """Forward direction from the two hip joints (world)."""
    lateral = rhip - lhip
    return horiz(Vector((0, 0, 1)).cross(lateral))


T_REST = {n: (rig.matrix_world @ tb[n].matrix_local) for n in order}
t_forward = facing_from(T_REST['LeftUpLeg'].translation, T_REST['RightUpLeg'].translation)
toe_dir = horiz((rig.matrix_world @ tb['LeftToeBase'].tail_local) - (rig.matrix_world @ tb['LeftToeBase'].head_local))
if t_forward.dot(toe_dir) < 0:
    FLIP = -1.0
    t_forward = -t_forward
else:
    FLIP = 1.0
t_floor = min((rig.matrix_world @ tb[n].tail_local).z for n in ('LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'))
t_hip_h = T_REST['Hips'].translation.z - t_floor
print('TARGET forward', tuple(round(c, 2) for c in t_forward), 'hip height', round(t_hip_h, 3))


def yaw_to(src_fwd, dst_fwd):
    a = math.atan2(dst_fwd.y, dst_fwd.x) - math.atan2(src_fwd.y, src_fwd.x)
    return Matrix.Rotation(a, 3, 'Z')


def import_bvh(code):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=os.path.join(CMU, f'{code}.bvh'), global_scale=1.0, frame_start=1, use_fps_scale=False,
                            update_scene_fps=False, update_scene_duration=False, rotate_mode='NATIVE', axis_forward='-Z', axis_up='Y')
    src = next(o for o in bpy.data.objects if o not in before)
    return src


def sample(src, frames, names):
    """World matrices of the source bones at the given BVH frames."""
    out = []
    for f in frames:
        sc.frame_set(f)
        mw = src.matrix_world
        out.append({n: mw @ src.pose.bones[n].matrix for n in names})
    return out


def pick_window(spec, src, n_frames):
    """Chooses the stretch of the clip to use (BVH frames at 120 fps)."""
    step = 4
    frames = list(range(1, n_frames + 1, step))
    names = ['Hips', 'LeftHand', 'RightHand', 'Head', 'LeftToeBase', 'RightToeBase', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']
    S = sample(src, frames, names)
    pos = {n: [s[n].translation.copy() for s in S] for n in names}
    hip_h = [p.z for p in pos['Hips']]
    scale_h = (sum(hip_h) / len(hip_h))
    want = int(spec.get('seconds', 1.0) * 120 / step)
    best, best_score = 0, None
    kind_ = spec['pick']
    if kind_ == 'gait':
        # One full stride: between two successive lowest points of the left toe.
        # The stride period comes from the autocorrelation of the left toe's height
        # (the strongest repeat between 0.8 and 1.6 s), starting at its first low point.
        lz = [p.z for p in pos['LeftToeBase']]
        m = sum(lz) / len(lz)
        dz = [z - m for z in lz]
        lo, hi = int(0.8 * 120 / step), min(int(1.6 * 120 / step), len(dz) - 2)
        period = max(range(lo, hi + 1), key=lambda L: sum(dz[i] * dz[i + L] for i in range(len(dz) - L)) / (len(dz) - L))
        start = min(range(0, max(1, len(dz) - period)), key=lambda i: lz[i])
        return frames[start], frames[start + period]
    for i in range(0, len(frames) - want):
        seg = range(i, i + want)
        hand_motion = sum((pos['LeftHand'][j + 1] - pos['LeftHand'][j]).length + (pos['RightHand'][j + 1] - pos['RightHand'][j]).length for j in seg[:-1])
        hip_motion = sum((horiz(pos['Hips'][j + 1] - pos['Hips'][j]) * 0).length + (pos['Hips'][j + 1] - pos['Hips'][j]).length for j in seg[:-1])
        if kind_ == 'calm':
            score = -(hand_motion + 2 * hip_motion)
        elif kind_ == 'gesture':
            score = hand_motion - 3 * hip_motion
        elif kind_ in ('point', 'cheer'):
            mid = i + want // 2
            if kind_ == 'point':
                ext = 0
                for side, arm in (('LeftHand', 'LeftArm'), ('RightHand', 'RightArm')):
                    h, sh = pos[side][mid], pos[arm][mid]
                    ext = max(ext, horiz(h - sh).length if True else 0) if abs(h.z - sh.z) < 0.25 * scale_h else ext
                    ext = max(ext, (Vector((h.x - sh.x, h.y - sh.y, 0))).length - 0.6 * abs(h.z - sh.z))
                score = ext - 0.2 * hip_motion
            else:
                top = min(pos['LeftHand'][mid].z, pos['RightHand'][mid].z) - pos['Head'][mid].z
                score = top - 0.05 * hip_motion
        if best_score is None or score > best_score:
            best, best_score = i, score
    return frames[best], frames[best] + want * step


def retarget(name, spec):
    src = import_bvh(spec['bvh'])
    act_src = src.animation_data.action
    n_frames = int(act_src.frame_range[1])
    f0, f1 = pick_window(spec, src, n_frames)
    print(f'CLIP {name}: BVH {spec["bvh"]} frames {f0}-{f1} ({(f1 - f0) / 120:.2f} s)')
    # Hands and fingers stay in MakeHuman's rest relative to the forearm: the CMU hands are
    # coarse and their twist turns the palms out.
    names = [n for n in order if (NAME_MAP.get(n, n) in src.pose.bones) and n not in FINGERS]
    src_names = [NAME_MAP.get(n, n) for n in names]
    # Source rest (the BVH offsets skeleton, a T-pose) in world space.
    S_REST = {n: (src.matrix_world @ src.data.bones[n].matrix_local) for n in src_names}
    s_fwd_rest = facing_from(S_REST['LeftUpLeg'].translation, S_REST['RightUpLeg'].translation) * FLIP
    s_floor = min(S_REST[n].translation.z for n in ('LeftToeBase', 'RightToeBase'))
    s_hip_h = S_REST['Hips'].translation.z - s_floor
    k = t_hip_h / s_hip_h
    H_rest = yaw_to(s_fwd_rest, t_forward)
    # Target reference: limb bones turned so they point where the (yawed) source rest bone
    # points (MakeHuman rests in an A-pose, the BVH in a T-pose). The trunk, neck and head
    # stand upright in both and keep their own rest: MakeHuman's Neck1 even points down.
    T_REF = {}
    for n, sn in zip(names, src_names):
        t_rot = T_REST[n].to_3x3().normalized()
        if n in ALIGN:
            s_dir = (H_rest @ S_REST[sn].to_3x3()).col[1].normalized()
            t_dir = t_rot.col[1].normalized()
            T_REF[n] = t_dir.rotation_difference(s_dir).to_matrix() @ t_rot
        else:
            T_REF[n] = t_rot
    frames = [f0 + i * (120 // FPS) for i in range(int((f1 - f0) / (120 / FPS)) + 1)]
    S = sample(src, frames, src_names)
    fwd = Vector((0, 0, 0))
    for s in S:
        fwd += facing_from(s['LeftUpLeg'].translation, s['RightUpLeg'].translation) * FLIP
    H_clip = yaw_to(horiz(fwd), t_forward)
    hips0 = [H_clip @ s['Hips'].translation for s in S]
    # In place: remove the horizontal travel (a straight line from first to last frame for a walk, the mean otherwise).
    n = len(S)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    pbs = rig.pose.bones
    for pb in pbs:
        pb.rotation_mode = 'QUATERNION'
    prev = {}
    keys = []
    for i, s in enumerate(S):
        A = {}
        for nm, sn in zip(names, src_names):
            Dt = (H_clip @ s[sn].to_3x3().normalized()) @ (H_rest @ S_REST[sn].to_3x3().normalized()).inverted()
            A[nm] = RW.inverted() @ (Dt @ T_REF[nm])
        frame_keys = {}
        for nm in names:
            b = tb[nm]
            B_rest = b.matrix_local.to_3x3().normalized()
            if b.parent and b.parent.name in A:
                P_rest = b.parent.matrix_local.to_3x3().normalized()
                basis = B_rest.inverted() @ P_rest @ A[b.parent.name].inverted() @ A[nm]
            else:
                basis = B_rest.inverted() @ A[nm]
            q = basis.to_quaternion()
            if nm in prev and prev[nm].dot(q) < 0:
                q.negate()
            prev[nm] = q
            frame_keys[nm] = q
        # Hips travel, scaled to this body and kept in place.
        h = hips0[i]
        if spec['pick'] == 'gait':
            base = hips0[0].lerp(hips0[-1], i / max(1, n - 1))
        else:
            base = sum(hips0, Vector()) / n
        d = Vector((h.x - base.x, h.y - base.y, h.z - hips0[0].z if spec['pick'] == 'gait' else h.z - sum(p.z for p in hips0) / n)) * k
        if spec['pick'] != 'gait':
            d.x *= 0.3
            d.y *= 0.3
        d_arm = RW.inverted() @ d
        hip_basis_t = tb['Hips'].matrix_local.to_3x3().normalized().inverted() @ d_arm
        keys.append((frame_keys, hip_basis_t))
    # Seamless loops: ease the last 0.4 s toward the first frame.
    if spec['loop'] and n > 12:
        m = min(n // 3, int(0.4 * FPS))
        for j in range(m):
            w = (j + 1) / m
            i = n - m + j
            fk, ht = keys[i]
            fk = {nm: fk[nm].slerp(keys[0][0][nm] if fk[nm].dot(keys[0][0][nm]) >= 0 else -keys[0][0][nm], w) for nm in fk}
            keys[i] = (fk, ht.lerp(keys[0][1], w))
        keys[-1] = keys[0]
    for i, (fk, ht) in enumerate(keys):
        f = i + 1
        for nm, q in fk.items():
            pbs[nm].rotation_quaternion = q
            pbs[nm].keyframe_insert('rotation_quaternion', frame=f, group=nm)
        pbs['Hips'].location = ht
        pbs['Hips'].keyframe_insert('location', frame=f, group='Hips')
    act.use_fake_user = True
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    track.mute = True
    rig.animation_data.action = None
    bpy.data.objects.remove(src, do_unlink=True)
    bpy.data.actions.remove(act_src)
    travel = Vector((hips0[-1].x - hips0[0].x, hips0[-1].y - hips0[0].y, 0)).length * k
    return act, f0, f1, travel / max(1e-6, (f1 - f0) / 120)


CHOSEN = {}
for name, spec in CLIPS.items():
    if name.startswith('_'):
        continue
    act, f0, f1, speed = retarget(name, spec)
    CHOSEN[name] = {'bvh': spec['bvh'], 'from_s': round((f0 - 1) / 120, 2), 'to_s': round((f1 - 1) / 120, 2), 'frames_30fps': int(act.frame_range[1])}
    if spec['pick'] == 'gait':
        CHOSEN[name]['speed_m_per_s'] = round(speed, 3)
for pb in rig.pose.bones:
    pb.rotation_quaternion = Quaternion()
    pb.location = Vector()

# ------------------------------------------------------------------ 5. export and preview
bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(OUT)[0] + '.blend')
for o in bpy.data.objects:
    o.select_set(o in (rig, skin, outfit, hair))
bpy.context.view_layer.objects.active = rig
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_image_format='AUTO', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_frame_step=1, export_skins=True, export_def_bones=False, export_optimize_animation_size=True,
    export_cameras=False, export_lights=False, export_extras=False, export_vertex_color='NONE', export_tangents=False)
tris_total = sum(lib.tris(o) for o in (skin, outfit, hair))
stats = {'key': KEY, 'title': SPEC['title'], 'triangles': tris_total, 'draw_calls': sum(len(o.data.materials) for o in (skin, outfit, hair)),
         'bones': len(rig.data.bones), 'clips': CHOSEN}
lib.write_json(os.path.join(os.path.dirname(os.path.abspath(OUT)), f'{KEY}.json'), stats)
print('STATS', json.dumps(stats))
if PREVIEW:
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 16
    sc.render.resolution_x, sc.render.resolution_y = 360, 540
    sc.view_settings.view_transform = 'AgX'
    if sc.world is None:
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
    eye = centre + (t_forward * 3.1) + Vector((0, 0, 0.15)) + t_forward.cross(Vector((0, 0, 1))) * 1.0
    cam.location = eye
    cam.rotation_euler = (centre - eye).to_track_quat('-Z', 'Y').to_euler()
    shots = [(nm, bpy.data.actions[nm], int(bpy.data.actions[nm].frame_range[1] * fr)) for nm, fr in (('idle', 0.5), ('walk', 0.3), ('talk', 0.4), ('point', 0.5), ('cheer', 0.5))]
    paths = []
    for label, act, f in shots:
        rig.animation_data.action = act
        sc.frame_set(max(1, f))
        sc.render.filepath = os.path.join(PREVIEW, f'{KEY}_{label}.png')
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
    print('PREVIEWS', paths)
print('DONE', OUT)
