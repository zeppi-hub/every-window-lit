"""Quick look at a glTF/GLB: imports it, frames a three-quarter camera, renders with Eevee.
  blender -b --factory-startup --python art/v2/tools/thumb.py -- in.gltf out.png [width height] [az el]
"""
import sys, math, bpy
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
w = int(a[2]) if len(a) > 2 else 640
h = int(a[3]) if len(a) > 3 else 400
az = math.radians(float(a[4])) if len(a) > 4 else math.radians(35)
el = math.radians(float(a[5])) if len(a) > 5 else math.radians(20)
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (mn + mx) / 2
r = (mx - mn).length / 2
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
cam.data.lens = 35
d = r / math.tan(math.radians(27)) * 1.05
cam.location = c + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * d
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_end = d * 4
sc.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
sc.collection.objects.link(sun)
if sc.world is None:
    sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.7, 0.85, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.8
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.render.filepath = out
sc.view_settings.view_transform = 'AgX'
for _n in [n for n in dir(bpy.context.scene.render) if n.startswith('use_stamp')]:  # no paths or dates in the picture
    setattr(bpy.context.scene.render, _n, False)
bpy.ops.render.render(write_still=True)
