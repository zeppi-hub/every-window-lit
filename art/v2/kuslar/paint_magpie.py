"""
Colours the untextured magpie sculpt by region (black head, breast and back, white belly and
shoulder band, blue-black wings with white flight-feather edges, long green-blue tail, dark beak
and legs), turns it to face -Y (three.js +Z) and scales it to a real magpie (0.46 m long).

  nice -n 20 blender -b --factory-startup --python art/v2/kuslar/paint_magpie.py -- <source.glb> <painted.glb>

The painted file has one material per colour; prep_model.py --bake then bakes them into one atlas.
"""
import math
import sys

import bpy
from mathutils import Matrix, Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
bird = bpy.context.active_object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = bird.data

# Head is at +X in the source: turn to -Y, scale to 0.46 m long, feet on z = 0, centred.
me.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
vs = [v.co for v in me.vertices]
ys = [v.y for v in vs]
L = max(ys) - min(ys)
me.transform(Matrix.Scale(0.46 / L, 4))
vs = [v.co for v in me.vertices]
xmin, xmax = min(v.x for v in vs), max(v.x for v in vs)
ymin, ymax = min(v.y for v in vs), max(v.y for v in vs)
zmin, zmax = min(v.z for v in vs), max(v.z for v in vs)
me.transform(Matrix.Translation((-(xmin + xmax) / 2, 0, -zmin)))
vs = [v.co for v in me.vertices]
ymin, ymax = min(v.y for v in vs), max(v.y for v in vs)
zmax = max(v.z for v in vs)
half = max(abs(v.x) for v in vs)
print('SIZE', round(2 * half, 3), round(ymax - ymin, 3), round(zmax, 3))


def mat(name, colour, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*colour, 1)
    b.inputs['Roughness'].default_value = rough
    return m


M = {
    'black': mat('black', (0.012, 0.012, 0.014), 0.45),
    'white': mat('white', (0.78, 0.78, 0.76), 0.7),
    'wing': mat('wing', (0.012, 0.025, 0.055), 0.35),
    'edge': mat('edge', (0.62, 0.63, 0.62), 0.6),
    'tail': mat('tail', (0.01, 0.045, 0.04), 0.35),
    'beak': mat('beak', (0.02, 0.02, 0.02), 0.3),
    'leg': mat('leg', (0.04, 0.04, 0.045), 0.6),
}
me.materials.clear()
order = list(M)
for k in order:
    me.materials.append(M[k])


def region(c, n):
    # u: 0 at the beak tip, 1 at the tail tip; h: 0 feet, 1 top of the head; s: |side|, 0 middle, 1 widest
    u = (c.y - ymin) / (ymax - ymin)
    h = c.z / zmax
    s = abs(c.x) / half
    if u > 0.6:
        return 'tail'
    if h < 0.32:
        return 'leg'
    if u < 0.055:
        return 'beak'
    if 0.27 <= u <= 0.6 and 0.5 <= h <= 0.76 and s > 0.45:
        if u < 0.45 and h > 0.62:
            return 'white'   # the white shoulder patch
        if u > 0.48 and h < 0.56:
            return 'edge'    # pale flight-feather edges at the bottom of the folded wing
        return 'wing'
    if 0.22 <= u <= 0.55 and h < 0.57 and n.z < 0.6:
        return 'white'       # belly and flanks
    return 'black'           # head, neck, breast, back, rump


for p in me.polygons:
    p.material_index = order.index(region(p.center, p.normal))
counts = {k: 0 for k in order}
for p in me.polygons:
    counts[order[p.material_index]] += 1
print('REGIONS', counts)
bird.name = 'magpie'
me.name = 'magpie'
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_yup=True)
