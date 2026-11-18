"""Builds one realistic person for v2 with MakeHuman's MPFB (CC0 system assets),
bakes it for Quest and retargets CMU motion-capture clips onto its skeleton.

  BLENDER_USER_RESOURCES=<dir with MPFB installed> V2_CACHE=<cache> \
    nice -n 20 blender -b --python art/v2/insan/build.py -- <key> <out.glb> [--preview <dir>]

<key> is an entry of characters.json (or of the file given with --spec; --stage joined
stops after step 3 and saves <key>_joined.blend next to <out.glb>, for still poses: art/v2/sirk/pose.py). Steps:
1. MPFB makes the body (a low-poly game proxy), eyes, eyebrows, hair and clothes
   from the MakeHuman CC0 system assets, rigged with MakeHuman's "cmu_mb"
   skeleton, whose bone names are the CMU BVH ones.
2. Hidden body under clothes is removed; heavy garments are decimated.
3. Body, eyes and clothes are baked into one 1024 colour atlas (one draw call);
   hair and eyebrows keep their own alpha-cut textures (512) in one more mesh.
4. CMU clips (BVH from the Hahne conversion of mocap.cs.cmu.edu) are retargeted
   (motion.py: reference T-pose by forward kinematics, clavicles at rest, elbows and
   knees as hinges) and sampled at 30 fps into actions: idle, walk (in place, looping),
   talk, point, cheer. Every frame is then checked (motion.check); the build stops when
   a rule does not hold (--warn-only exports anyway, for looking into a failure).
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
SPEC_FILE = ARGS[ARGS.index('--spec') + 1] if '--spec' in ARGS else os.path.join(HERE, 'characters.json')
SPEC = json.load(open(SPEC_FILE))[KEY]
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
        # Math: Round on the alpha makes the glTF exporter write alphaMode MASK, cutoff 0.5
        # (alpha-cut: no sorting, no see-through rectangles in front of the face).
        rnd = nt.nodes.new('ShaderNodeMath')
        rnd.operation = 'ROUND'
        nt.links.new(t.outputs['Alpha'], rnd.inputs[0])
        nt.links.new(rnd.outputs[0], b.inputs['Alpha'])
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


def _box_blur(a, r):
    """Box blur along both image axes (r pixels each way), three passes: close to a Gaussian."""
    for _ in range(3):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(a.ndim)], mode='edge'), axis=ax)
            hi = np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax)
            lo = np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)
            a = (hi - lo) / (2 * r + 1)
    return a


def bold_brows(img, tint, name, colour=None):
    """The eyebrow picture darkened by `tint` (or, for grey-haired people, set to `colour` keeping
    its light and shade) and its alpha grown by about a pixel."""
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    if colour:
        lum = px[..., :3] @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        mid = float(np.median(lum[px[..., 3] > 0.5])) if (px[..., 3] > 0.5).any() else 0.2
        rgb = np.clip(lum / max(mid, 1e-3), 0.6, 1.4)[..., None] * np.array(colour, dtype=np.float32)
    else:
        rgb = px[..., :3] * np.array(tint, dtype=np.float32)
    a = px[..., 3]
    grown = np.maximum.reduce([np.roll(np.roll(a, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    a = np.maximum(a, grown * 0.85)
    out = bpy.data.images.new(name, w, h, alpha=True)
    out.pixels = np.concatenate([np.clip(rgb, 0, 1), a[..., None]], axis=2).ravel().tolist()
    out.pack()
    return out


def head_mask(o, size):
    """Texture-space mask (rows from v = 0) of the faces weighted mostly to the head and neck."""
    gname = {g.index: g.name for g in o.vertex_groups}
    head = {'Head', 'Neck1'}
    me = o.data
    uv = me.uv_layers.active.data
    dom = []
    for v in me.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        dom.append(best is not None and gname.get(best.group) in head)
    mask = np.zeros((size, size), dtype=np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    for p in me.polygons:
        if sum(dom[i] for i in p.vertices) * 2 <= len(p.vertices):
            continue
        pts = [(uv[li].uv.x * size, uv[li].uv.y * size) for li in p.loop_indices]
        for i in range(1, len(pts) - 1):
            (x0, y0), (x1, y1), (x2, y2) = pts[0], pts[i], pts[i + 1]
            bx0, bx1 = int(max(0, min(x0, x1, x2))), int(min(size - 1, max(x0, x1, x2)) + 1)
            by0, by1 = int(max(0, min(y0, y1, y2))), int(min(size - 1, max(y0, y1, y2)) + 1)
            if bx1 <= bx0 or by1 <= by0:
                continue
            X, Y = xx[by0:by1, bx0:bx1] + 0.5, yy[by0:by1, bx0:bx1] + 0.5
            den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(den) < 1e-9:
                continue
            l0 = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / den
            l1 = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / den
            inside = (l0 >= -0.02) & (l1 >= -0.02) & (1 - l0 - l1 >= -0.02)
            mask[by0:by1, bx0:bx1][inside] = 1.0
    return mask


def readable_face(o, amount=1.1, darken=0.18):
    """Makes the face read from a few metres: on the head's part of the skin picture, the detail
    (brows painted in the skin, lids, nostrils, lips) is lifted by an unsharp mask and the darker
    features are darkened a little more. Elsewhere the picture is unchanged."""
    m = o.data.materials[0]
    img = main_image(m)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    mask = _box_blur(head_mask(o, w), 3)[..., None]
    rgb = px[..., :3]
    blur = _box_blur(rgb, max(2, w // 128))
    lum = blur @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    detail = rgb - blur
    dark = np.clip(((rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)) / np.maximum(lum, 1e-3))[..., None], 0, 1)
    out = rgb + mask * (amount * detail - darken * (1 - dark) * rgb)
    img.pixels = np.concatenate([np.clip(out, 0, 1), px[..., 3:4]], axis=2).ravel().tolist()
    img.pack()
    return float(mask.mean())


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
    if k == 'brows':
        # Brows that read from a few metres: darker (grey for grey-haired people) and a pixel thicker.
        img = bold_brows(img, SPEC.get('brow_tint', [0.42, 0.36, 0.33]), f'{KEY}_brows', SPEC.get('brow_colour'))
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
# The eyes are tiny next to the clothes: give their islands 4 x the size (16 x the pixels), then repack.
eye_slots = {i for i, sl in enumerate(outfit.material_slots) if 'low-poly' in sl.material.name or 'eye' in sl.material.name.lower()}
if eye_slots:
    bme = bmesh.from_edit_mesh(me)
    uvl = bme.loops.layers.uv.active
    eye_faces = [f for f in bme.faces if f.material_index in eye_slots]
    if eye_faces:
        cu = sum((l[uvl].uv for f in eye_faces for l in f.loops), Vector((0, 0))) / sum(len(f.loops) for f in eye_faces)
        for f in eye_faces:
            for l in f.loops:
                l[uvl].uv = cu + (l[uvl].uv - cu) * 4.0
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=False, margin=0.003)
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
print('FACE head share of the skin picture', round(readable_face(skin), 3))
print('MATERIALS', [(o.name, [m.name for m in o.data.materials], lib.tris(o)) for o in (skin, outfit, hair)])
if STAGE == 'joined':
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(OUT), f'{KEY}_joined.blend'))
    sys.exit(0)

# ------------------------------------------------------------------ 4. motion: CMU BVH retargeted onto the cmu_mb skeleton (motion.py)
sys.path.insert(0, HERE)
import motion  # noqa: E402

sc.render.fps = motion.FPS
print('SHOULDERS smoothed', motion.smooth_shoulders(rig, [skin, outfit]))
# The meshes are not needed while the clips are made and checked (both read bones only);
# hidden, Blender does not deform them on every frame change.
for o in (skin, outfit, hair):
    o.hide_viewport = True
T = motion.Target(rig, [skin, outfit])
t_forward = T.forward
print('TARGET forward', tuple(round(c, 2) for c in t_forward), 'hip height', round(T.hip_h, 3))
CHOSEN, HINGES = {}, {}
for name, spec in CLIPS.items():
    if name.startswith('_'):
        continue
    act, f0, f1, speed, notes = motion.retarget(T, name, spec, os.path.join(CMU, f'{spec["bvh"]}.bvh'))
    HINGES[name] = notes.pop('hinge')
    CHOSEN[name] = {'bvh': spec['bvh'], 'from_s': round((f0 - 1) / 120, 2), 'to_s': round((f1 - 1) / 120, 2), 'frames_30fps': int(act.frame_range[1]), **notes}
    if spec['pick'] == 'gait':
        CHOSEN[name]['speed_m_per_s'] = round(speed, 3)
for pb in rig.pose.bones:
    pb.rotation_quaternion = Quaternion()
    pb.location = Vector()
CHECK, FAILS = motion.check(T, {k: v for k, v in CLIPS.items() if not k.startswith('_')}, HINGES)
print('CHECK', json.dumps(CHECK))
for o in (skin, outfit, hair):
    o.hide_viewport = False
if FAILS:
    print('CHECK FAILED', len(FAILS))
    for line in FAILS[:40]:
        print('  ', line)
    if '--warn-only' not in ARGS:
        raise SystemExit(f'{KEY}: {len(FAILS)} frames break the pose rules (motion.check); nothing exported')

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
         'bones': len(rig.data.bones), 'clips': CHOSEN, 'check': CHECK, 'check_failures': len(FAILS)}
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
        lib.no_metadata()                      # no paths or dates in the picture
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
    print('PREVIEWS', paths)
print('DONE', OUT)
