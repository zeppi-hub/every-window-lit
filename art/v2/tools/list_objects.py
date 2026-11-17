"""Lists the objects of one or more glTF files: name, size (m, Blender Z up), triangles, materials.
  blender -b --factory-startup --python art/v2/tools/list_objects.py -- a.gltf [b.gltf ...]
"""
import sys, bpy
from mathutils import Vector
files = sys.argv[sys.argv.index('--') + 1:]
for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f)
    total = 0
    print('==', f.split('/')[-1])
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if o.type != 'MESH':
            continue
        o.data.calc_loop_triangles()
        t = len(o.data.loop_triangles)
        total += t
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        d = mx - mn
        print(f'  {o.name:48s} {d.x:6.2f} {d.y:6.2f} {d.z:6.2f}  at {mn.x:6.2f} {mn.y:6.2f} {mn.z:6.2f}  tris {t:6d}  mats {[m.name for m in o.data.materials]}')
    print('  total tris', total)
