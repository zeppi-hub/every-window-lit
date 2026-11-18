"""
Rigs and animates a perched bird model (magpie or parrot), headless in Blender:

  nice -n 20 blender -b --factory-startup --python art/v2/kuslar/rig_bird.py -- <bird> <body.glb> <wing.png> <out.glb> [--preview dir]

body.glb: the bird in one textured mesh (prep_model.py output). wing.png: the open-wing picture
from wing_textures.py. The folded wings are part of the body; for flying, two open wings (thin,
double-sided, feather-edged) grow out of the shoulders, so the body never stretches.

Skeleton: root (at the claws), body, head, tail, wing_L, wing_L_outer, wing_R, wing_R_outer.
Clips (in place; the game moves the node): see CLIPS. Faces +Z in three.js, origin at the claws.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

A = sys.argv[sys.argv.index('--') + 1:]
BIRD, BODY, WING_TEX, OUT = A[:4]
PREVIEW = A[A.index('--preview') + 1] if '--preview' in A else None
FPS = 30

# Joints in the body's own box: u 0 at the beak tip .. 1 at the tail tip, h 0 at the bottom .. 1 at the top,
# s 0 middle .. 1 widest. turn: degrees about Z that make the bird look along -Y.
BIRDS = {
    'magpie': {'turn': 0, 'neck': (0.2, 0.72), 'shoulder': (0.3, 0.7, 0.55), 'hips': (0.42, 0.45), 'rump': (0.58, 0.48),
               'legs': lambda u, h: h < 0.32 and u < 0.6, 'span': 0.25, 'chord': 0.14, 'size': None},
    'parrot': {'turn': -90, 'neck': (0.15, 0.86), 'shoulder': (0.2, 0.81, 0.55), 'hips': (0.32, 0.65), 'rump': (0.43, 0.62),
               'legs': lambda u, h: h < 0.62 and u < 0.4, 'span': 0.40, 'chord': 0.21, 'size': None},
}
CFG = BIRDS[BIRD]

lib.reset()
coll = lib.collection(BIRD)
scn = bpy.context.scene
scn.render.fps = FPS
got = lib.import_gltf(BODY, coll)
body = list(got.values())[0]
body.name = f'{BIRD}_body'
me = body.data
if CFG['turn']:
    me.transform(Matrix.Rotation(math.radians(CFG['turn']), 4, 'Z'))
co = [v.co.copy() for v in me.vertices]
ymin, ymax = min(c.y for c in co), max(c.y for c in co)
zmin, zmax = min(c.z for c in co), max(c.z for c in co)
half = max(abs(c.x) for c in co)


def U(u):
    return ymin + u * (ymax - ymin)


def H(h):
    return zmin + h * (zmax - zmin)


# Origin where the claws grip: the lowest points of the legs.
legs = [c for c in co if CFG['legs']((c.y - ymin) / (ymax - ymin), (c.z - zmin) / (zmax - zmin))]
claw_z = min(c.z for c in legs)
low = [c for c in legs if c.z < claw_z + 0.012]
grip = Vector((0.0, sum(c.y for c in low) / len(low), claw_z + 0.008))
me.transform(Matrix.Translation(-grip))
ymin, ymax, zmin, zmax = ymin - grip.y, ymax - grip.y, zmin - grip.z, zmax - grip.z


def P(u, h, s=0.0):
    return Vector((s * half, U(u), H(h)))


# ---------------------------------------------------------------- skeleton
arm_data = bpy.data.armatures.new(f'{BIRD}_rig')
rig = bpy.data.objects.new(BIRD, arm_data)
coll.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones


def bone(name, head, tail, parent=None):
    b = eb.new(name)
    b.head, b.tail = head, tail
    b.roll = 0
    if parent:
        b.parent = eb[parent]
    return b


nu, nh = CFG['neck']
su, sh, ss = CFG['shoulder']
hu, hh = CFG['hips']
ru, rh = CFG['rump']
L = ymax - ymin
bone('root', Vector((0, 0, 0)), Vector((0, 0, 0.04 * L)))
bone('body', P(hu, hh), P(nu, nh), 'root')
bone('head', P(nu, nh), P(0.02, 0.95), 'body')
bone('tail', P(ru, rh), P(1.0, 0.1 if BIRD == 'parrot' else 0.25), 'body')
span = CFG['span']
for side, sgn in (('L', 1), ('R', -1)):
    sp = P(su, sh, sgn * ss)
    bone(f'wing_{side}', sp, sp + Vector((sgn * span * 0.45, 0, 0)), 'body')
    bone(f'wing_{side}_outer', sp + Vector((sgn * span * 0.45, 0, 0)), sp + Vector((sgn * span, 0, 0)), f'wing_{side}')
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- body weights
for n in ('root', 'body', 'head', 'tail'):
    body.vertex_groups.new(name=n)


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


for v in me.vertices:
    u = (v.co.y - ymin) / L
    h = (v.co.z - zmin) / (zmax - zmin)
    if CFG['legs'](u, h):
        body.vertex_groups['root'].add([v.index], 1.0, 'REPLACE')
        continue
    wh = smooth(nu + 0.04, nu - 0.04, u)
    wt = smooth(ru - 0.04, ru + 0.04, u)
    wb = max(0.0, 1.0 - wh - wt)
    for n, w in (('head', wh), ('tail', wt), ('body', wb)):
        if w > 0.001:
            body.vertex_groups[n].add([v.index], w, 'REPLACE')
mod = body.modifiers.new('rig', 'ARMATURE')
mod.object = rig
body.parent = rig

# ---------------------------------------------------------------- open wings
wing_mat = lib.textured(f'{BIRD}_wing', WING_TEX, rough=0.6)
wing_mat.use_backface_culling = False


def wing_outline(S, C):
    """Outline in (x outward, y backward) metres: leading edge, fingered primaries, smooth secondaries."""
    pts = [(0.0, -0.30 * C), (0.22 * S, -0.42 * C), (0.45 * S, -0.40 * C), (0.70 * S, -0.30 * C), (0.92 * S, -0.16 * C), (1.0 * S, -0.04 * C)]
    fingers = 6
    for i in range(fingers):   # primaries from the tip inward: a notch between each
        t0 = i / fingers
        x_tip = S * (1.0 - 0.06 * i)
        y_tip = C * (-0.04 + 0.13 * i)
        pts.append((x_tip - 0.015 * S, y_tip + 0.06 * C))
        pts.append((x_tip - 0.05 * S, y_tip + 0.10 * C))
    pts += [(0.55 * S, 0.62 * C), (0.35 * S, 0.70 * C), (0.15 * S, 0.70 * C), (0.0, 0.62 * C)]
    return pts


S, C = span, CFG['chord']
outline = wing_outline(S, C)
for side, sgn in (('L', 1), ('R', -1)):
    bm = bmesh.new()
    vs = [bm.verts.new((sgn * x, y, 0.0)) for x, y in outline]
    if sgn < 0:
        vs = vs[::-1]
    bm.faces.new(vs)
    for k in range(1, 12):   # cuts across the span so the wing can bend at the wrist
        x = sgn * S * k / 12
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x, 0, 0), plane_no=(1, 0, 0))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (abs(l.vert.co.x) / S, 1.0 - (l.vert.co.y + 0.45 * C) / (1.2 * C))
    sp = P(su, sh, sgn * ss)
    bmesh.ops.translate(bm, vec=tuple(sp), verts=bm.verts)
    wme = bpy.data.meshes.new(f'{BIRD}_wing_{side}')
    bm.to_mesh(wme)
    bm.free()
    w = bpy.data.objects.new(f'{BIRD}_wing_{side}', wme)
    coll.objects.link(w)
    wme.materials.append(wing_mat)
    gi = w.vertex_groups.new(name=f'wing_{side}')
    go = w.vertex_groups.new(name=f'wing_{side}_outer')
    for v in wme.vertices:
        t = smooth(0.38, 0.52, abs(v.co.x - sp.x) / S)
        gi.add([v.index], 1 - t, 'REPLACE')
        go.add([v.index], t, 'REPLACE')
    m = w.modifiers.new('rig', 'ARMATURE')
    m.object = rig
    w.parent = rig

# ---------------------------------------------------------------- clips
pbs = rig.pose.bones
REST = {b.name: b.matrix_local.to_3x3() for b in arm_data.bones}
for pb in pbs:
    pb.rotation_mode = 'QUATERNION'


def rot(bone_name, axis, deg):
    """A rotation about a direction given in the armature's rest frame, as a pose-bone quaternion."""
    a = (REST[bone_name].inverted() @ Vector(axis)).normalized()
    return Quaternion(a, math.radians(deg))


def q_mul(*qs):
    out = Quaternion()
    for q in qs:
        out = out @ q
    return out


X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
FOLDED = 0.001


def wing_pose(side, up, sweep, outer_up=0.0, scale=1.0):
    sg = 1 if side == 'L' else -1
    inner = q_mul(rot(f'wing_{side}', Z, sg * sweep), rot(f'wing_{side}', Y, -sg * up))
    outer = rot(f'wing_{side}_outer', Y, -sg * outer_up)
    return inner, outer, scale


def key(frame, poses):
    """poses: bone -> quaternion, or ('wing', side, (inner, outer, scale))."""
    for name, q in poses.items():
        if name.startswith('wing'):
            side = name[-1]
            inner, outer, sc = q
            for bn, qq in ((f'wing_{side}', inner), (f'wing_{side}_outer', outer)):
                pbs[bn].rotation_quaternion = qq
                pbs[bn].keyframe_insert('rotation_quaternion', frame=frame, group=bn)
            pbs[f'wing_{side}'].scale = (sc, sc, sc)
            pbs[f'wing_{side}'].keyframe_insert('scale', frame=frame, group=f'wing_{side}')
        else:
            pbs[name].rotation_quaternion = q
            pbs[name].keyframe_insert('rotation_quaternion', frame=frame, group=name)


def wings(up, sweep, outer_up=0.0, scale=1.0):
    return {'wing_L': wing_pose('L', up, sweep, outer_up, scale), 'wing_R': wing_pose('R', up, sweep, outer_up, scale)}


def still(**extra):
    p = {'body': Quaternion(), 'head': Quaternion(), 'tail': Quaternion()}
    p.update(wings(0, 70, 0, FOLDED))
    p.update(extra)
    return p


def pitch(bn, deg):   # nose up for positive degrees (the bird looks along -Y)
    return rot(bn, X, -deg)


def clip_idle(seconds=4.0):
    f = lambda t: int(round(t * FPS)) + 1
    yaw = [(0, 0), (0.5, 22), (1.4, 22), (1.9, -14), (3.1, -14), (3.6, 0), (4.0, 0)]
    for t, d in yaw:
        key(f(t), still(head=q_mul(rot('head', Z, d), rot('head', Y, 0.25 * d if BIRD == 'parrot' else 0))))
    for t, d in ((0.9, 0), (1.0, 16), (1.25, 0), (2.7, 0), (2.8, 14), (3.05, 0)):
        key(f(t), {'tail': rot('tail', X, d)})
    for t, d in ((0, 0), (1.0, 2), (2.0, 0), (3.0, 2), (4.0, 0)):
        key(f(t), {'body': pitch('body', d)})


def flap_beats(t0, t1, hz, amp_up, amp_down, sweep=8, scale=1.0, f=None):
    t = t0
    step = 1.0 / (hz * 4)
    phase = 0
    while t <= t1 + 1e-6:
        up = [amp_up, 0, -amp_down, 0][phase % 4]
        outer = [-12, 10, 25, -5][phase % 4]
        key(f(t), wings(up, sweep, outer, scale))
        t += step
        phase += 1


def clip_flap(seconds=1.0):
    f = lambda t: int(round(t * FPS)) + 1
    for t in (0.0, seconds):
        key(f(t), {'body': pitch('body', 22), 'head': pitch('head', -18), 'tail': rot('tail', X, -12)})
    flap_beats(0.0, seconds, 3.0, 58, 40, f=f)


def clip_talk(seconds=2.0):
    f = lambda t: int(round(t * FPS)) + 1
    seq = [(0, 0, 0), (0.25, 12, 4), (0.5, -4, 0), (0.75, 10, 3), (1.0, 0, 0), (1.3, 14, 5), (1.55, -3, 0), (1.8, 6, 2), (2.0, 0, 0)]
    for t, hd, bd in seq:
        key(f(t), still(head=pitch('head', -hd), body=pitch('body', -bd), tail=rot('tail', X, hd * 0.8)))


def clip_land(seconds=1.5):
    """Arrives with wings spread and the body up to brake, two beats, touches down at 0.75 s, folds, settles."""
    f = lambda t: int(round(t * FPS)) + 1
    for t, b, hd, tl in ((0, 32, -26, -18), (0.6, 28, -22, -14), (0.8, -10, 8, 10), (1.0, 4, -2, -4), (1.2, -2, 2, 2), (1.5, 0, 0, 0)):
        key(f(t), {'body': pitch('body', b), 'head': pitch('head', hd), 'tail': rot('tail', X, tl)})
    for t, up, outer, sw, sc in ((0.0, 55, -10, 4, 1.0), (0.18, 0, 10, 4, 1.0), (0.32, -38, 24, 6, 1.0), (0.48, 50, -8, 4, 1.0),
                                 (0.62, 0, 12, 6, 1.0), (0.76, -30, 20, 10, 1.0), (0.9, 18, 0, 35, 1.0), (1.05, 6, 0, 65, 0.55),
                                 (1.15, 0, 0, 72, FOLDED), (1.5, 0, 0, 72, FOLDED)):
        key(f(t), wings(up, sw, outer, sc))


def clip_wings_open(seconds=1.0):
    """Spreads both wings and holds them open (play once and clamp; play backwards to close)."""
    f = lambda t: int(round(t * FPS)) + 1
    for t, up, outer, sw, sc in ((0.0, -10, 0, 70, FOLDED), (0.12, -6, 0, 55, 0.5), (0.3, 12, -6, 6, 1.0),
                                 (0.5, 18, 4, 2, 1.0), (0.7, 14, -2, 3, 1.0), (1.0, 16, 2, 2, 1.0)):
        key(f(t), wings(up, sw, outer, sc))
    for t, b, hd in ((0, 0, 0), (0.3, 8, -6), (1.0, 6, -4)):
        key(f(t), {'body': pitch('body', b), 'head': pitch('head', hd), 'tail': rot('tail', X, -b * 0.5)})


CLIPS = {
    'magpie': [('idle', clip_idle, 4.0, True), ('flap', clip_flap, 1.0, True), ('talk', clip_talk, 2.0, True)],
    'parrot': [('idle', clip_idle, 4.0, True), ('flap', clip_flap, 1.0, True), ('land', clip_land, 1.5, False),
               ('wings_open', clip_wings_open, 1.0, False)],
}[BIRD]
rig.animation_data_create()
made = {}
for name, fn, secs, loop in CLIPS:
    for pb in pbs:
        pb.rotation_quaternion = Quaternion()
        pb.scale = (1, 1, 1)
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    if name != 'land' and name != 'wings_open' and name != 'flap':
        pass
    # every clip starts from the perched pose so missing channels stay folded
    key(1, still())
    fn(secs)
    key(int(round(secs * FPS)) + 1, {})
    act.use_fake_user = True
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    tr.mute = True
    rig.animation_data.action = None
    made[name] = {'seconds': secs, 'loop': loop}

# Points for the game (children of the root bone's frame: plain nodes under the rig).
head_top = max(me.vertices, key=lambda v: v.co.z).co.copy()
beak = min(me.vertices, key=lambda v: v.co.y).co.copy()
tail = max(me.vertices, key=lambda v: v.co.y).co.copy()
for name, loc in (('perch_grip', (0, 0, 0)), ('head_top', head_top), ('beak_tip', beak), ('tail_tip', tail)):
    e = lib.empty(name, tuple(loc), coll=coll, size=0.03)
    e.parent = rig
top = bpy.data.objects.new(f'{BIRD}_root', None)
coll.objects.link(top)
rig.parent = top
for pb in pbs:
    pb.rotation_quaternion = Quaternion()
    pb.scale = (1, 1, 1)
for tr in rig.animation_data.nla_tracks:
    tr.mute = True
bpy.context.view_layer.update()

stats = {'bird': BIRD, 'triangles': sum(len(o.data.loop_triangles) if o.data.calc_loop_triangles() is None else 0 for o in coll.all_objects if o.type == 'MESH'),
         'bones': len(arm_data.bones), 'clips': made,
         'size_m': {'length': round(L, 3), 'height': round(zmax - zmin, 3)},
         'head_top': [round(c, 3) for c in head_top], 'beak_tip': [round(c, 3) for c in beak], 'tail_tip': [round(c, 3) for c in tail]}
lib.write_json(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), {'magpie': 'saksagan', 'parrot': 'papagan'}[BIRD], 'stats.json'), stats)
print('STATS', stats)

for o in bpy.context.view_layer.objects:
    o.select_set(o in set(coll.all_objects))
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_image_format='AUTO', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_frame_step=1, export_skins=True, export_def_bones=False, export_optimize_animation_size=True,
    export_cameras=False, export_lights=False, export_extras=False, export_vertex_color='NONE', export_tangents=False)

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    shots = []
    for name, fn, secs, loop in CLIPS:
        for frac in ((0.25, 0.6) if name in ('flap', 'land') else (0.5,)):
            shots.append((name, frac))
    ad = rig.animation_data
    sc = scn
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 16
    sc.render.resolution_x, sc.render.resolution_y = 360, 360
    sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.4
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(40), 0, math.radians(200))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    centre = Vector((0, (ymin + ymax) / 2 * 0.6, (zmin + zmax) / 2 + 0.1 * (zmax - zmin)))
    cam.location = centre + Vector((L * 1.25, -L * 1.75, L * 0.6))
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    for i, (name, frac) in enumerate(shots):
        for tr in ad.nla_tracks:
            tr.mute = tr.name != name
        secs = dict((n, s) for n, _, s, _ in CLIPS)[name]
        sc.frame_set(int(round(frac * secs * FPS)) + 1)
        sc.render.filepath = os.path.join(PREVIEW, f'{BIRD}_{i}_{name}.png')
        bpy.ops.render.render(write_still=True)
