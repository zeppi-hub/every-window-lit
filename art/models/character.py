"""
Prepares an animated character for the crowd (src/station/crowd.ts),
headless in Blender, keeping its skeleton and skin weights:

  blender --background --factory-startup --python art/models/character.py -- \
    --in <model.glb> --out public/models/<name>.glb --ratio 0.5 --keep _Walk,_Idle

Decimates the skinned mesh by --ratio (the decimation is applied under the
armature modifier, so weights carry over) and keeps only the actions whose
names contain a --keep token; exports a GLB with the skin and those clips.
"""

import argparse
import os
import sys

import bpy


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--in', dest='src', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--ratio', type=float, default=0.5)
    p.add_argument('--keep', default='_Walk,_Idle')
    a = p.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.src))
    before = after = 0
    for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        obj.data.calc_loop_triangles()
        before += len(obj.data.loop_triangles)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = a.ratio
        mod.use_collapse_triangulate = True
        # Under the armature, so it acts on the rest shape.
        while obj.modifiers.find(mod.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.calc_loop_triangles()
        after += len(obj.data.loop_triangles)
    keep = [t for t in a.keep.split(',') if t]
    for action in list(bpy.data.actions):
        if not any(t in action.name for t in keep):
            bpy.data.actions.remove(action)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.out), export_format='GLB', export_yup=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS')
    print('REPORT:', before, '->', after, 'tris;', [x.name for x in bpy.data.actions], os.path.getsize(a.out), 'bytes')


main()
