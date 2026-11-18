"""
Prepares one downloaded model for Quest, headless in Blender:

  blender --background --factory-startup --python art/v2/tools/prep_model.py -- \
    --in <model.gltf|.glb> --out public/models/<name>.glb --name <Name> \
    [--tris 3000] [--tex 512] [--height 0.29 | --scale 1.0] [--origin base|center] \
    [--rotate-z 0] [--keep glass:400,wick] [--drop name,name] [--thumb out.png]
    [--bake 1024 [--rough 0.6] [--dark glass,window]]

Steps: import; clear parents keeping transforms; drop unwanted objects;
join everything into one mesh named --name, except objects whose names
contain a --keep token (each token becomes its own mesh, optionally with its
own triangle target after a colon); decimate to the targets; scale (to a
height in metres, or by a factor); put the origin at the base centre (or the
bounding-box centre); downscale every texture to --tex pixels at most;
with --bake, bake all the main mesh's materials into one colour atlas on a
fresh UV map (glass-named materials as dark glass) so it draws in one call;
export a GLB (Y up, JPEG textures). Prints a JSON report (also written to
art/models/reports/<name>.json) and optionally renders Workbench thumbnails: a
three-quarter view, and <thumb>_front from glTF +Z (+X right, +Y up).
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--in', dest='src', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--name', required=True)
    p.add_argument('--tris', type=int, default=0, help='triangle target for the main mesh (0: keep)')
    p.add_argument('--tex', type=int, default=512)
    p.add_argument('--height', type=float, default=0.0)
    p.add_argument('--scale', type=float, default=1.0)
    p.add_argument('--origin', choices=['base', 'center'], default='base')
    p.add_argument('--rotate-z', type=float, default=0.0)
    p.add_argument('--keep', default='')
    p.add_argument('--drop', default='')
    p.add_argument('--thumb', default='')
    p.add_argument('--bake', type=int, default=0, help='bake every material of the main mesh into one colour atlas of this size (one draw call)')
    p.add_argument('--rough', type=float, default=0.6, help='roughness of the baked material')
    p.add_argument('--dark', default='glass,window,windshield', help='materials whose names contain these are baked as dark glass')
    return p.parse_args(argv)


def tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def join(objs, name):
    if not objs:
        return None
    select_only(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def decimate(obj, target):
    have = tris(obj)
    if target <= 0 or have <= target:
        return have
    select_only([obj])
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.001, target / have)
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return tris(obj)


def bake_atlas(obj, size, roughness, dark_tokens):
    """Every material of `obj` baked (base colour only, no lighting) into one image on a fresh UV map, then one plain material."""
    scene = bpy.context.scene
    mesh = obj.data
    source_uv = mesh.uv_layers.active
    atlas_uv = mesh.uv_layers.new(name='atlas')
    # The bake writes through the active UV map; the textures keep reading the map they had (active for render).
    mesh.uv_layers.active = atlas_uv
    if source_uv is not None:
        source_uv.active_render = True
    select_only([obj])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    image = bpy.data.images.new(obj.name + '_atlas', size, size, alpha=False)
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        # A diffuse bake reads metals as black: bake every surface as a dielectric.
        for n in nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for link in list(n.inputs['Metallic'].links):
                    mat.node_tree.links.remove(link)
                n.inputs['Metallic'].default_value = 0.0
        if any(t and t.lower() in mat.name.lower() for t in dark_tokens):
            bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf is not None:
                for link in list(bsdf.inputs['Base Color'].links):
                    mat.node_tree.links.remove(link)
                bsdf.inputs['Base Color'].default_value = (0.05, 0.065, 0.08, 1)
        target = nodes.new('ShaderNodeTexImage')
        target.image = image
        for n in nodes:
            n.select = False
        target.select = True
        nodes.active = target
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=6, use_clear=True)
    baked = bpy.data.materials.new(obj.name + '_atlas')
    baked.use_nodes = True
    nodes = baked.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'atlas'
    baked.node_tree.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    baked.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    mesh.materials.clear()
    mesh.materials.append(baked)
    for layer in [l for l in mesh.uv_layers if l.name != 'atlas']:
        mesh.uv_layers.remove(layer)
    image.pack()


def bounds(objs):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def thumbnail(objs, path, direction=(1.0, -1.4, 0.8)):
    scene = bpy.context.scene
    lo, hi = bounds(objs)
    centre = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 1e-3)
    cam_data = bpy.data.cameras.new('thumb')
    cam_data.lens = 50
    cam = bpy.data.objects.new('thumb', cam_data)
    scene.collection.objects.link(cam)
    direction = Vector(direction).normalized()
    fov = 2 * math.atan(36 / (2 * cam_data.lens))
    cam.location = centre + direction * (radius / math.sin(fov / 2)) * 1.05
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False
    scene.render.filepath = path
    for _n in [n for n in dir(bpy.context.scene.render) if n.startswith('use_stamp')]:  # no paths or dates in the picture
        setattr(bpy.context.scene.render, _n, False)
    bpy.ops.render.render(write_still=True)


def main():
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.src))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    # Flatten the hierarchy, keeping where everything is.
    select_only(meshes)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)
    drops = [t for t in a.drop.split(',') if t]
    for o in list(meshes):
        if any(t.lower() in o.name.lower() for t in drops):
            meshes.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    select_only(meshes)
    # Make every mesh single-user so transforms apply cleanly.
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    keeps = []
    for token in [t for t in a.keep.split(',') if t]:
        name, _, target = token.partition(':')
        keeps.append((name, int(target) if target else 0))
    groups = {name: [] for name, _ in keeps}
    main_objs = []
    for o in meshes:
        hit = next((name for name, _ in keeps if name.lower() in o.name.lower()), None)
        (groups[hit] if hit else main_objs).append(o)
    before = sum(tris(o) for o in meshes)
    result = []
    main = join(main_objs, a.name)
    if main is not None:
        result.append((main, decimate(main, a.tris)))
        if a.bake > 0:
            bake_atlas(main, a.bake, a.rough, [t for t in a.dark.split(',') if t])
    for name, target in keeps:
        obj = join(groups[name], f'{a.name}_{name}')
        if obj is not None:
            result.append((obj, decimate(obj, target)))
    objs = [o for o, _ in result]

    # Size, turn and origin.
    lo, hi = bounds(objs)
    factor = a.height / (hi.z - lo.z) if a.height > 0 else a.scale
    for o in objs:
        # Imported glTF objects rotate by quaternion; switch to Euler so the turn applies.
        o.rotation_mode = 'XYZ'
        o.rotation_euler.z = math.radians(a.rotate_z)
        o.scale = (factor, factor, factor)
    select_only(objs)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    lo, hi = bounds(objs)
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z if a.origin == 'base' else (lo.z + hi.z) / 2))
    for o in objs:
        o.location -= shift
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    images = []
    for img in bpy.data.images:
        if img.size[0] == 0:
            continue
        w, h = img.size
        k = min(1.0, a.tex / max(w, h))
        if k < 1:
            img.scale(max(1, round(w * k)), max(1, round(h * k)))
        img.pack()
        images.append({'name': img.name, 'size': list(img.size)})

    # No transmission on Quest: three would draw the whole scene again per eye for every transmissive material.
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    for key in ('Transmission Weight', 'Transmission'):
                        if key in node.inputs:
                            for link in list(node.inputs[key].links):
                                mat.node_tree.links.remove(link)
                            node.inputs[key].default_value = 0.0

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    select_only(objs)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    options = dict(filepath=os.path.abspath(a.out), export_format='GLB', use_selection=True, export_yup=True, export_apply=True)
    if 'export_image_format' in props:
        options['export_image_format'] = 'JPEG'
    for key in ('export_image_quality', 'export_jpeg_quality'):
        if key in props:
            options[key] = 85
    if 'export_animations' in props:
        options['export_animations'] = False
    bpy.ops.export_scene.gltf(**options)

    lo, hi = bounds(objs)
    report = {
        'name': a.name,
        'source_tris': before,
        'meshes': [{'name': o.name, 'tris': t, 'materials': [m.name for m in o.data.materials if m]} for o, t in result],
        'size_m': [round(hi.x - lo.x, 4), round(hi.z - lo.z, 4), round(hi.y - lo.y, 4)],
        'size_axes': 'x, y (up), z in glTF',
        'images': images,
        'glb_bytes': os.path.getsize(a.out),
    }
    reports = os.path.join(os.path.dirname(os.path.abspath(a.out)), 'reports')
    os.makedirs(reports, exist_ok=True)
    with open(os.path.join(reports, os.path.splitext(os.path.basename(a.out))[0] + '.json'), 'w') as f:
        json.dump(report, f, indent=2)
    print('REPORT:' + json.dumps(report))
    if a.thumb:
        # A three-quarter view, and a straight view from glTF +Z (Blender -Y): there +X runs to the right, +Y up.
        thumbnail(objs, os.path.abspath(a.thumb))
        base, ext = os.path.splitext(os.path.abspath(a.thumb))
        thumbnail(objs, base + '_front' + ext, (0.0, -1.0, 0.12))


main()
