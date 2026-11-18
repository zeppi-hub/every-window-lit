"""Renders the view the leader's office window looks out on, from the neighbourhood scene.
  blender -b --factory-startup --python art/v2/tools/window_view.py -- <mahalle_raw.glb> <hdri> <out.png>
"""
import math, sys, bpy
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
sc = bpy.context.scene
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
nt = sc.world.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(a[1])
nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2.5
sun.rotation_euler = (math.radians(50), math.radians(8), math.radians(210)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (-6.0, -26.0, 16.0)
cam.rotation_euler = (Vector((2.0, 40.0, 4.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 22; cam.data.clip_end = 2000
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 32
sc.render.resolution_x, sc.render.resolution_y = 2048, 1024
sc.view_settings.view_transform = 'AgX'
sc.render.filepath = a[2]
for _n in [n for n in dir(bpy.context.scene.render) if n.startswith('use_stamp')]:  # no paths or dates in the picture
    setattr(bpy.context.scene.render, _n, False)
bpy.ops.render.render(write_still=True)
