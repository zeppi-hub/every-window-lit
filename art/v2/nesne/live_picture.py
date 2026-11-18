"""
The picture on the broadcast screen: the prime minister at the press-room podium, the parrot on
his right shoulder, the press microphones in front. Rendered from this repo's own assets:

  nice -n 20 blender -b --factory-startup --python art/v2/nesne/live_picture.py -- \
      <ofis_raw.glb> <gray_raw.glb> <parrot_built.glb> <microphones_raw.glb> <out.png>

(the unpacked builds of art/v2/ofis, art/v2/insan for gray, art/v2/papagan and the microphones here).
The LIVE corner is added afterwards by art/v2/nesne/live_bug.py.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:]
OFIS, GRAY, PARROT, MICS, OUT = ARGS[:5]
FRAME = int(ARGS[5]) if len(ARGS) > 5 else 70
SIZE = int(ARGS[6]) if len(ARGS) > 6 else 1024
lib.reset()


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


room = load(OFIS)
for o in room:
    if o.name.startswith('podium_mic'):
        o.hide_render = True
spot = bpy.data.objects['spot_leader_podium'].matrix_world.translation.copy()
people = load(GRAY)
arm = next(o for o in people if o.type == 'ARMATURE')
top = arm
while top.parent is not None:
    top = top.parent
top.location = spot
act = next((a for a in bpy.data.actions if a.name.startswith('talk')), None)
ad = arm.animation_data or arm.animation_data_create()
if ad.nla_tracks:
    for t in ad.nla_tracks:
        t.mute = True
ad.action = act
if hasattr(ad, 'action_slot') and act is not None and len(act.slots):
    ad.action_slot = act.slots[0]
sc = bpy.context.scene
sc.frame_set(FRAME)
bpy.context.view_layer.update()

# The parrot on his right shoulder (he faces -Y, so his right is -X), facing the same way.
pb = arm.pose.bones.get('RightArm') or arm.pose.bones.get('RightShoulder')
shoulder = arm.matrix_world @ pb.head
neck = arm.matrix_world @ arm.pose.bones['Neck'].head
perch = shoulder.lerp(neck, 0.5) + Vector((0, 0.03, 0.03))
bird = load(PARROT)
broot = next(o for o in bird if o.name.startswith('parrot_root'))
broot.location = perch
broot.scale = (0.8, 0.8, 0.8)
broot.rotation_euler = (0, 0, math.radians(-12))

# The microphones on the podium top, heads toward him.
mics = load(MICS)
mroot = next(o for o in mics if o.name.startswith('microphones'))
for o in mics:
    if o.name.startswith('mic_stand'):
        o.hide_render = True
chest = arm.matrix_world @ arm.pose.bones['Spine1'].head
mroot.location = Vector((spot.x + 0.04, spot.y - 0.62, chest.z - 0.12))

# Light: a soft key from the front left, a rim from behind, the room's own ceiling panels.
def light(name, kind, energy, loc, target, size=1.0, colour=(1, 0.97, 0.92)):
    L = bpy.data.lights.new(name, kind)
    L.energy = energy
    L.color = colour
    if kind == 'AREA':
        L.size = size
    o = bpy.data.objects.new(name, L)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(o)
head = arm.matrix_world @ arm.pose.bones['Head'].head
light('key', 'AREA', 420, head + Vector((1.6, -2.2, 1.0)), head, 1.6)
light('fill', 'AREA', 140, head + Vector((-2.0, -2.0, 0.4)), head, 2.0, (0.9, 0.95, 1.0))
light('rim', 'AREA', 260, head + Vector((0.4, 1.8, 1.2)), head, 1.0)
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.055, 0.065, 1)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
target = head.lerp(chest, 0.55) + Vector((-0.1, 0, 0.0))
cam.location = target + Vector((0.25, -3.6, 0.42))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 68
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = (head - cam.location).length
cam.data.dof.aperture_fstop = 2.0
sc.render.engine = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 48
sc.render.resolution_x, sc.render.resolution_y = SIZE, SIZE * 9 // 16
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.filepath = OUT
lib.no_metadata()                      # no paths or dates in the picture
bpy.ops.render.render(write_still=True)
print('RENDERED', OUT)
