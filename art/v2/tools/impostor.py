"""Renders a tree (or any object) from the front and the side with a transparent
background into one atlas for crossed-quad billboards (left half: front view
from -Y, right half: side view from +X).
  blender -b --factory-startup --python art/v2/tools/impostor.py -- <model.gltf> <object_name> <out.png> [height_px]
Prints the object's width/height ratio for each view.
"""
import math, sys, bpy
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, name, out = a[0], a[1], a[2]
H = int(a[3]) if len(a) > 3 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type == 'MESH' and o.name != name:
        bpy.data.objects.remove(o, do_unlink=True)
o = bpy.data.objects[name]
pts = [o.matrix_world @ v.co for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (mn + mx) / 2
h = mx.z - mn.z
w = max(mx.x - mn.x, mx.y - mn.y)
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.8, 0.85, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.2
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.0
sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = h * 1.02
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 32
sc.render.film_transparent = True
sc.render.image_settings.color_mode = 'RGBA'
W = int(H * w / h * 1.02) // 4 * 4
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'Standard'
import os
tmp = []
for k, (d, rot) in enumerate(((Vector((0, -1, 0)), (math.radians(90), 0, 0)), (Vector((1, 0, 0)), (math.radians(90), 0, math.radians(90))))):
    cam.location = c + d * (w * 3)
    cam.rotation_euler = rot
    sun.rotation_euler = (math.radians(55), 0, math.radians(-30 + 90 * k))
    path = out[:-4] + f'_{k}.png'
    sc.render.filepath = path
    for _n in [n for n in dir(bpy.context.scene.render) if n.startswith('use_stamp')]:  # no paths or dates in the picture
        setattr(bpy.context.scene.render, _n, False)
    bpy.ops.render.render(write_still=True)
    tmp.append(path)
# Side by side into one atlas.
imgs = [bpy.data.images.load(p) for p in tmp]
atlas = bpy.data.images.new('atlas', W * 2, H, alpha=True)
px = [0.0] * (W * 2 * H * 4)
for k, im in enumerate(imgs):
    src_px = list(im.pixels)
    for y in range(H):
        row = src_px[y * W * 4:(y + 1) * W * 4]
        px[(y * W * 2 + k * W) * 4:(y * W * 2 + k * W) * 4 + W * 4] = row
atlas.pixels = px
atlas.filepath_raw = out
atlas.file_format = 'PNG'
atlas.save()
for p in tmp:
    os.remove(p)
print(f'IMPOSTOR {out} {W * 2}x{H} width/height {w / h:.3f}')
