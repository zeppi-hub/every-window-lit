"""
The parrot: one static, perched macaw for the broadcast screen (on the leader's shoulder)
and anywhere else the game shows the bird whole.

  1. nice -n 20 blender -b --factory-startup --python art/v2/tools/prep_model.py -- \
       --in $V2_CACHE/sketchfab/eedf3a271ae742129282ff74ab8603f9.glb --out /tmp/parrot_raw.glb \
       --name parrot --tris 6000 --tex 1024 --height 0.8
  2. nice -n 20 blender -b --factory-startup --python art/v2/papagan/build.py -- \
       /tmp/parrot_raw.glb /tmp/parrot_built.glb [--preview dir]
  3. node art/v2/tools/pack.mjs /tmp/parrot_built.glb public/v2/papagan/parrot.glb

This step turns the bird to face +Z in three.js (like the people), puts the origin where
the claws grip (so the node can sit on a shoulder or a perch), and adds named points.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None

lib.reset()
coll = lib.collection('parrot')
meshes = lib.import_gltf(SRC, coll)
bird = meshes['parrot']
me = bird.data

# The source bird looks along +X (Blender). Turn it to look along -Y (Blender) = +Z (three.js).
me.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
vs = [v.co.copy() for v in me.vertices]
ymin = min(v.y for v in vs)
ymax = max(v.y for v in vs)
zmin = min(v.z for v in vs)
zmax = max(v.z for v in vs)
L = ymax - ymin
# Head: the highest point. Claws: the lowest points in the front half of the body (the tail
# hangs lower, but behind).
head = max(vs, key=lambda v: v.z)
front = [v for v in vs if v.y < ymin + 0.5 * L]
claw_z = min(v.z for v in front)
claws = [v for v in front if v.z < claw_z + 0.025]
grip = Vector((sum(v.x for v in claws) / len(claws), sum(v.y for v in claws) / len(claws), claw_z + 0.012))
me.transform(Matrix.Translation(-grip))
head = head - grip
beak = min(([v.co for v in me.vertices if v.co.z > head.z - 0.12]), key=lambda c: c.y)
tail = min((v.co for v in me.vertices), key=lambda c: c.z)
print('GRIP', tuple(round(c, 3) for c in grip), 'HEAD', tuple(round(c, 3) for c in head),
      'BEAK', tuple(round(c, 3) for c in beak), 'TAIL', tuple(round(c, 3) for c in tail))

root = bpy.data.objects.new('parrot_root', None)
coll.objects.link(root)
bird.parent = root
for name, loc in (('perch_grip', (0, 0, 0)), ('head_top', head), ('beak_tip', beak), ('tail_tip', tail)):
    e = lib.empty(name, tuple(loc), coll=coll, size=0.05)
    e.parent = root

t, calls = lib.stats(coll)
dims = [max(v.co[i] for v in me.vertices) - min(v.co[i] for v in me.vertices) for i in range(3)]
lib.write_json(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stats.json'), {
    'triangles': t, 'draw_calls': calls,
    'size_m': {'width_x': round(dims[0], 3), 'length_z': round(dims[1], 3), 'height_y': round(dims[2], 3)},
    'grip_above_tail_tip_m': round(-tail.z, 3), 'head_top_above_grip_m': round(head.z, 3),
})
bpy.context.view_layer.update()  # new empties must be in the view layer to be selected for export
lib.export_glb(OUT, coll)

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 640, 640
    sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.64, 0.68, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    sc.collection.objects.link(sun)
    # A perch bar under the claws, only in the preview.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.3, location=(0, 0, -0.015), rotation=(0, math.pi / 2, 0))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    for name, eye in (('side', (1.6, 0.0, 0.1)), ('front', (0.5, -1.5, 0.2))):
        cam.location = eye
        d = Vector((0, 0, -0.12)) - Vector(eye)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = 50
        sc.render.filepath = os.path.join(PREVIEW, f'parrot_{name}.png')
        bpy.ops.render.render(write_still=True)
