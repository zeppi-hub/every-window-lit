"""Shared Blender helpers for the v2 scene builders (art/v2/<scene>/build.py).

Coordinates: Blender Z up, metres. The glTF export turns +Z into +Y and
+Y (north) into -Z, so "north" in a build script is "forward" (-Z) in three.js.
Downloads live in a cache directory (env V2_CACHE); see tools/fetch_*.
"""
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

CACHE = os.environ.get('V2_CACHE', '')
HERE = os.path.dirname(os.path.abspath(__file__))
UV = 'UVMap'


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def collection(name, hidden=False):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    c.hide_render = hidden
    c.hide_viewport = hidden
    return c


# ---------------------------------------------------------------- images

_images = {}


def image(path, colorspace='sRGB', max_size=0, name=None):
    key = (path, max_size, colorspace)
    if key in _images:
        return _images[key]
    img = bpy.data.images.load(path, check_existing=False)
    if name:
        img.name = name
    img.colorspace_settings.name = colorspace
    if max_size and max(img.size) > max_size:
        k = max_size / max(img.size)
        img.scale(max(1, round(img.size[0] * k)), max(1, round(img.size[1] * k)))
        img.pack()
    _images[key] = img
    return img


def strip_normal_maps(tokens):
    """Unlinks normal maps whose image name contains any token (small props where relief is not seen)."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == 'NORMAL_MAP':
                for link in list(node.inputs['Color'].links):
                    img = getattr(link.from_node, 'image', None)
                    if img and any(t in img.name for t in tokens):
                        for out in list(node.outputs['Normal'].links):
                            mat.node_tree.links.remove(out)


def shrink_images(limit_by_name):
    """Downscales every image: limit_by_name(img) -> max size in pixels (0 keeps it)."""
    for img in bpy.data.images:
        if img.size[0] == 0:
            continue
        m = limit_by_name(img)
        if m and max(img.size) > m:
            k = m / max(img.size)
            img.scale(max(1, round(img.size[0] * k)), max(1, round(img.size[1] * k)))
            img.pack()


# ---------------------------------------------------------------- materials

def _principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def new_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m


def flat(name, color, rough=0.6, metal=0.0, emissive=None, alpha=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = new_material(name)
    b = _principled(m)
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emissive:
        b.inputs['Emission Color'].default_value = (*emissive, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def pbr(name, tex_id, color_size=1024, data_size=512, tint=None, rough=None, metal=None, tex_dir=None, normal_strength=1.0):
    """A Principled material from Poly Haven maps diff/nor/arm (AO, roughness, metal) in <cache>/tex/<id>/."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    d = tex_dir or os.path.join(CACHE, 'tex', tex_id)
    m = new_material(name)
    nt = m.node_tree
    b = _principled(m)
    diff = nt.nodes.new('ShaderNodeTexImage')
    diff.image = image(os.path.join(d, 'diff.jpg'), 'sRGB', color_size, f'{tex_id}_diff')
    if tint:
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        nt.links.new(diff.outputs['Color'], mix.inputs[6])
        mix.inputs[7].default_value = (*tint, 1)
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    else:
        nt.links.new(diff.outputs['Color'], b.inputs['Base Color'])
    if os.path.exists(os.path.join(d, 'nor.jpg')) and data_size:
        nor = nt.nodes.new('ShaderNodeTexImage')
        nor.image = image(os.path.join(d, 'nor.jpg'), 'Non-Color', data_size, f'{tex_id}_nor')
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(nor.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    arm_path = os.path.join(d, 'arm.jpg')
    if os.path.exists(arm_path) and data_size and (rough is None or metal is None):
        arm = nt.nodes.new('ShaderNodeTexImage')
        arm.image = image(arm_path, 'Non-Color', max(64, data_size // 2), f'{tex_id}_arm')
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(arm.outputs['Color'], sep.inputs['Color'])
        if rough is None:
            nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        if metal is None:
            nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    if rough is not None:
        b.inputs['Roughness'].default_value = rough
    if metal is not None:
        b.inputs['Metallic'].default_value = metal
    return m


def textured_relief(name, color_path, normal_dir, rough=0.8, normal_size=256, strength=1.0):
    """Our own colour image with a borrowed tiling normal map (<normal_dir>/nor.jpg, e.g. a fabric weave)."""
    m = textured(name, color_path, rough=rough)
    nt = m.node_tree
    b = _principled(m)
    nor = nt.nodes.new('ShaderNodeTexImage')
    nor.image = image(os.path.join(normal_dir, 'nor.jpg'), 'Non-Color', normal_size, os.path.basename(normal_dir) + '_nor')
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = strength
    nt.links.new(nor.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m


def textured(name, path, rough=0.7, metal=0.0, colorspace='sRGB', max_size=0, alpha_clip=False):
    """One colour image, constant roughness and metal (signs, prints, generated textures)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = new_material(name)
    nt = m.node_tree
    b = _principled(m)
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = image(path, colorspace, max_size)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if alpha_clip:
        nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
        m.surface_render_method = 'DITHERED'
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def glowing(name, path, strength=1.0, max_size=0):
    """Self-lit picture (screens, the view outside a window): black base, the image as emission."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = new_material(name)
    nt = m.node_tree
    b = _principled(m)
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = image(path, 'sRGB', max_size)
    nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = strength
    b.inputs['Base Color'].default_value = (0, 0, 0, 1)
    b.inputs['Roughness'].default_value = 0.9
    return m


def wall(name, a, b, z0, z1, normal, mat, coll=None, holes=(), uv_scale=1.0):
    """A wall face from a to b (2D) between z0 and z1 facing `normal` (2D), with rectangular
    holes given as (u0, u1, zb, zt) in metres along a->b. Returns the quads."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    n = Vector((normal[0], normal[1], 0)).normalized()
    d = Vector((-n.y, n.x, 0))
    if (b - a).dot(d) < 0:
        a, b = b, a
        holes = [((b - a).length - u1, (b - a).length - u0, zb, zt) for (u0, u1, zb, zt) in holes]
    L = (b - a).length
    cuts = sorted({0.0, L, *[h[0] for h in holes], *[h[1] for h in holes]})
    out = []
    for u0, u1 in zip(cuts, cuts[1:]):
        mid = (u0 + u1) / 2
        spans = [(z0, z1)]
        for (h0, h1, zb, zt) in holes:
            if h0 <= mid <= h1:
                spans = [(z0, zb), (zt, z1)]
        for za, zb_ in spans:
            if zb_ - za < 1e-4:
                continue
            p0, p1 = a + d * u0, a + d * u1
            q = quad(name, [p0 + Vector((0, 0, za)), p1 + Vector((0, 0, za)), p1 + Vector((0, 0, zb_)), p0 + Vector((0, 0, zb_))],
                     [(0, 0), (1, 0), (1, 1), (0, 1)], mat, coll)
            box_uv(q, uv_scale)
            out.append(q)
    return out


def tinted_copy(mat, name, tint):
    """Same textures, base colour multiplied by tint (exported as baseColorFactor)."""
    if bpy.data.materials.get(name):
        return bpy.data.materials[name]
    m = mat.copy()
    m.name = name
    nt = m.node_tree
    b = _principled(m)
    links = list(b.inputs['Base Color'].links)
    if not links:
        c = b.inputs['Base Color'].default_value
        b.inputs['Base Color'].default_value = (c[0] * tint[0], c[1] * tint[1], c[2] * tint[2], 1)
        return m
    src = links[0].from_socket
    if links[0].from_node.type == 'MIX' and links[0].from_node.blend_type == 'MULTIPLY':
        mix = links[0].from_node
        old = mix.inputs[7].default_value
        mix.inputs[7].default_value = (old[0] * tint[0], old[1] * tint[1], old[2] * tint[2], 1)
        return m
    nt.links.remove(links[0])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(src, mix.inputs[6])
    mix.inputs[7].default_value = (*tint, 1)
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    return m


# ---------------------------------------------------------------- geometry

def mesh_object(name, bm, mat=None, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if mat is not None:
        me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(o)
    return o


def box(name, lo, hi, mat=None, coll=None, uv_scale=1.0, faces='all', bevel=0.0, inward=False):
    """Axis-aligned box from corner lo to hi with world box-projected UVs (1 UV unit = uv_scale metres)."""
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1.0)
    lo, hi = Vector(lo), Vector(hi)
    for v in bm.verts:
        v.co = Vector((lo.x if v.co.x < 0 else hi.x, lo.y if v.co.y < 0 else hi.y, lo.z if v.co.z < 0 else hi.z))
    if faces != 'all':
        drop = []
        for f in bm.faces:
            n = f.normal
            key = ('+z' if n.z > 0.5 else '-z' if n.z < -0.5 else '+x' if n.x > 0.5 else '-x' if n.x < -0.5 else '+y' if n.y > 0.5 else '-y')
            if key not in faces:
                drop.append(f)
        bmesh.ops.delete(bm, geom=drop, context='FACES')
    if inward:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES')
    o = mesh_object(name, bm, mat, coll)
    box_uv(o, uv_scale)
    return o


def box_uv(o, scale=1.0, offset=(0, 0)):
    """World-space box projection, so tiling textures keep one size everywhere."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.get(UV) or bm.loops.layers.uv.new(UV)
    mw = o.matrix_world
    nmat = mw.to_3x3().inverted().transposed()
    for f in bm.faces:
        n = (nmat @ f.normal).normalized()
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            w = mw @ l.vert.co
            if ax == 2:
                u, v = w.x, w.y if n.z > 0 else -w.y
            elif ax == 0:
                u, v = (w.y if n.x < 0 else -w.y), w.z
            else:
                u, v = (-w.x if n.y > 0 else w.x), w.z
            l[uv].uv = (u / scale + offset[0], v / scale + offset[1])
    bm.to_mesh(me)
    bm.free()


def quad(name, corners, uvs, mat=None, coll=None):
    """One quad from four world corners (counter-clockwise seen from the front) with explicit UVs."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(c)) for c in corners]
    f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new(UV)
    for l, t in zip(f.loops, uvs):
        l[uv].uv = t
    return mesh_object(name, bm, mat, coll)


def atlas_uv(region, atlas_size):
    """UV corners (bl, br, tr, tl) of a pixel rectangle (x, y, w, h; origin top-left) in an atlas."""
    x, y, w, h = region
    W, H = atlas_size
    u0, u1 = x / W, (x + w) / W
    v1, v0 = 1 - y / H, 1 - (y + h) / H
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def facade_quad(name, origin, direction, x0, x1, z0, z1, out, region, atlas_size, mat, coll=None):
    """A sign quad on a facade: origin is the facade's start point, direction its unit run, out the outward normal offset."""
    o, d = Vector(origin), Vector(direction).normalized()
    n = Vector((d.y, -d.x, 0)) * out
    c = [o + d * x0 + n + Vector((0, 0, z0)), o + d * x1 + n + Vector((0, 0, z0)),
         o + d * x1 + n + Vector((0, 0, z1)), o + d * x0 + n + Vector((0, 0, z1))]
    return quad(name, c, atlas_uv(region, atlas_size), mat, coll)


def cylinder(name, centre, radius, height, mat=None, coll=None, segments=16, uv_scale=1.0, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=segments, radius1=radius, radius2=radius, depth=height)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(centre) + Vector((0, 0, height / 2)))
    o = mesh_object(name, bm, mat, coll)
    # Wrap UVs around the axis so stone and metal run vertically.
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.get(UV) or bm.loops.layers.uv.new(UV)
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co - Vector(centre)
            if abs(f.normal.z) > 0.5:
                l[uv].uv = (p.x / uv_scale, p.y / uv_scale)
            else:
                a = math.atan2(p.y, p.x)
                l[uv].uv = ((a + math.pi) * radius / uv_scale, p.z / uv_scale)
    # Fix the seam where the angle wraps.
    for f in bm.faces:
        us = [l[uv].uv.x for l in f.loops]
        if max(us) - min(us) > math.pi * radius / uv_scale:
            for l in f.loops:
                if l[uv].uv.x < math.pi * radius / uv_scale:
                    l[uv].uv.x += 2 * math.pi * radius / uv_scale
    bm.to_mesh(me)
    bm.free()
    return o


def prism(name, pts2d, z0, z1, mat=None, coll=None, uv_scale=1.0):
    """Extrudes a 2D outline (counter-clockwise, x/y) from z0 to z1."""
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, z0)) for x, y in pts2d]
    top = [bm.verts.new((x, y, z1)) for x, y in pts2d]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    n = len(pts2d)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bottom[i], bottom[j], top[j], top[i]])
    o = mesh_object(name, bm, mat, coll)
    box_uv(o, uv_scale)
    return o


def transform(o, loc=(0, 0, 0), rot_z=0.0, scale=1.0):
    o.matrix_world = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Scale(scale, 4)
    return o


def apply(objs):
    """Bakes each object's transform into its own mesh data (works in hidden collections too)."""
    for o in objs:
        if o.type != 'MESH':
            continue
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)


def empty(name, loc, rot_z=0.0, coll=None, size=0.3):
    """A named node (spawn point, seat, path point). rot_z: facing, radians from +Y (north) counter-clockwise."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    (coll or bpy.context.scene.collection).objects.link(e)
    return e


# ---------------------------------------------------------------- imported assets

def import_gltf(path, coll=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if coll is not None:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            coll.objects.link(o)
    meshes = [o for o in new if o.type == 'MESH']
    # Flatten the hierarchy keeping where things are.
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        o.rotation_mode = 'XYZ'
    if meshes:
        apply(meshes)
    # Keys keep the file's own node names even when Blender had to add .001 suffixes.
    import re
    return {re.sub(r'\.\d{3}$', '', o.name): o for o in meshes}


def tris(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def decimate(o, ratio=None, target=None, planar=False):
    if planar:
        mod = o.modifiers.new('d', 'DECIMATE')
        mod.decimate_type = 'DISSOLVE'
        mod.angle_limit = math.radians(2)
        mod.delimit = {'UV', 'MATERIAL'}
    else:
        have = tris(o)
        r = ratio if ratio is not None else min(1.0, target / max(1, have))
        if r >= 0.999:
            return o
        mod = o.modifiers.new('d', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = r
        mod.use_collapse_triangulate = True
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def flat_normals(o):
    """Drops imported custom normals and shades every face flat (right for planar walls after decimation)."""
    me = o.data
    if me.has_custom_normals:
        me.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(me.loops))
    for p in me.polygons:
        p.use_smooth = False


def join(objs, name):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
    # Bake every transform first: the result sits at the origin with an identity matrix.
    apply(objs)
    with bpy.context.temp_override(selected_editable_objects=objs, active_object=objs[0], selected_objects=objs):
        bpy.ops.object.join()
    o = objs[0]
    o.name = name
    o.data.name = name
    return o


def split_multi_material(coll):
    """Every object whose mesh has several materials becomes one object per material
    (meshes shared by many objects are split once), so joins can group by material."""
    cache = {}
    for o in [o for o in coll.all_objects if o.type == 'MESH' and len(o.data.materials) > 1]:
        me = o.data
        if me.name not in cache:
            parts = []
            for i, mat in enumerate(me.materials):
                bm = bmesh.new()
                bm.from_mesh(me)
                dead = [f for f in bm.faces if f.material_index != i]
                bmesh.ops.delete(bm, geom=dead, context='FACES')
                if not bm.faces:
                    bm.free()
                    continue
                for f in bm.faces:
                    f.material_index = 0
                nm = bpy.data.meshes.new(f'{me.name}_{i}')
                bm.to_mesh(nm)
                bm.free()
                nm.materials.append(mat)
                parts.append(nm)
            cache[me.name] = parts
        for nm in cache[me.name]:
            no = bpy.data.objects.new(o.name, nm)
            for c in o.users_collection:
                c.objects.link(no)
            no.matrix_world = o.matrix_world
        bpy.data.objects.remove(o, do_unlink=True)


def merge_by_material(objs, prefix, coll):
    """Joins every mesh into one object per material (one draw call each)."""
    groups = {}
    for o in objs:
        if o.type != 'MESH' or not o.data.polygons:
            continue
        if not o.data.materials:
            o.data.materials.append(flat('default_grey', (0.5, 0.5, 0.5)))
        groups.setdefault(o.data.materials[0].name, []).append(o)
    out = []
    for mname, group in sorted(groups.items()):
        j = join(group, f'{prefix}_{mname}')
        mat = bpy.data.materials[mname]
        for p in j.data.polygons:
            p.material_index = 0
        j.data.materials.clear()
        j.data.materials.append(mat)
        out.append(j)
    return out


def fix_uv_names(objs):
    """Every mesh keeps exactly one UV map called UVMap so joins share it."""
    for o in objs:
        if o.type != 'MESH':
            continue
        uvs = o.data.uv_layers
        if not uvs:
            uvs.new(name=UV)
            continue
        keep = uvs.active_render if hasattr(uvs, 'active_render') else uvs[0]
        for layer in list(uvs):
            if layer.active_render:
                keep = layer
        for layer in list(uvs):
            if layer != keep:
                uvs.remove(layer)
        uvs[0].name = UV


def no_transmission():
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    for key in ('Transmission Weight',):
                        if key in node.inputs:
                            for link in list(node.inputs[key].links):
                                mat.node_tree.links.remove(link)
                            node.inputs[key].default_value = 0.0


# ---------------------------------------------------------------- export and checks

def export_glb(path, coll, vertex_color='NONE'):
    """vertex_color 'ACTIVE' exports each mesh's active colour attribute as COLOR_0 (see tools/atlas.py)."""
    objs = list(coll.all_objects)
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_image_format='AUTO', export_animations=False, export_cameras=False, export_lights=False,
        export_extras=False, export_vertex_color=vertex_color, export_texcoords=True, export_normals=True,
        export_tangents=False, export_attributes=False)


def stats(coll):
    t = 0
    calls = 0
    for o in coll.all_objects:
        if o.type == 'MESH':
            t += tris(o)
            calls += max(1, len({p.material_index for p in o.data.polygons}))
    return t, calls


def render_views(views, out_dir, prefix, hdri, size=(960, 540), samples=24):
    """views: list of (name, eye xyz, target xyz, lens mm). Eevee with an HDRI sky and a soft sun."""
    sc = bpy.context.scene
    if sc.world is None:
        sc.world = bpy.data.worlds.new('preview')
    sc.world.use_nodes = True
    nt = sc.world.node_tree
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(hdri)
    bg = nt.nodes['Background']
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('preview_sun', bpy.data.lights.new('preview_sun', 'SUN'))
    sun.data.energy = 2.5
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(48), math.radians(8), math.radians(210))
    sc.collection.objects.link(sun)
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = samples
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    cam = bpy.data.objects.new('preview_cam', bpy.data.cameras.new('preview_cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.clip_end = 2000
    paths = []
    for name, eye, target, lens in views:
        cam.location = eye
        cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = lens
        sc.render.filepath = os.path.join(out_dir, f'{prefix}_{name}.png')
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)
    return paths


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=1)


def tapered(name, p0, p1, r0, r1, mat, coll=None, seg=7, uv_scale=1.0):
    """A tapered tube from p0 (radius r0) to p1 (radius r1), UV wrapped (u around, v along)."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    L = axis.length
    q = axis.to_track_quat('Z', 'Y').to_matrix()
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new(UV)
    ring0 = [bm.verts.new(p0 + q @ Vector((r0 * math.cos(2 * math.pi * i / seg), r0 * math.sin(2 * math.pi * i / seg), 0))) for i in range(seg)]
    ring1 = [bm.verts.new(p0 + q @ Vector((r1 * math.cos(2 * math.pi * i / seg), r1 * math.sin(2 * math.pi * i / seg), L))) for i in range(seg)]
    circ = 2 * math.pi * max(r0, 0.02)
    for i in range(seg):
        j = (i + 1) % seg
        f = bm.faces.new([ring0[i], ring0[j], ring1[j], ring1[i]])
        uvs = [(circ * i / seg / uv_scale, 0), (circ * (i + 1) / seg / uv_scale, 0), (circ * (i + 1) / seg / uv_scale, L / uv_scale), (circ * i / seg / uv_scale, L / uv_scale)]
        for l, t in zip(f.loops, uvs):
            l[lay].uv = t
    return mesh_object(name, bm, mat, coll)


def dead_tree(name, loc, height, mat, coll=None, seed=0, levels=2, lean=0.08):
    """A bare tree: a tapered trunk and two levels of crooked branches. About 250-450 triangles."""
    import random as _r
    rnd = _r.Random(seed)
    parts = []
    base = Vector(loc)
    r0 = height * 0.035
    top = base + Vector((rnd.uniform(-lean, lean) * height, rnd.uniform(-lean, lean) * height, height))
    mid = base.lerp(top, 0.55) + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0))
    parts.append(tapered(name, base - Vector((0, 0, 0.2)), mid, r0 * 1.3, r0 * 0.7, mat, coll, 8, 1.0))
    parts.append(tapered(name, mid, top, r0 * 0.7, r0 * 0.12, mat, coll, 7, 1.0))

    def branch(p, d, length, r, level):
        end = p + d.normalized() * length
        end.z += length * rnd.uniform(-0.1, 0.25)
        parts.append(tapered(name, p, end, r, r * 0.25, mat, coll, 5 if level else 6, 1.0))
        if level < levels - 1:
            for k in range(2):
                q = p.lerp(end, rnd.uniform(0.45, 0.8))
                nd = d.normalized() + Vector((rnd.uniform(-0.9, 0.9), rnd.uniform(-0.9, 0.9), rnd.uniform(0.1, 0.8)))
                branch(q, nd, length * rnd.uniform(0.4, 0.6), r * 0.45, level + 1)
    for k in range(rnd.randint(3, 5)):
        t = rnd.uniform(0.45, 0.9)
        p = base.lerp(top, t)
        a = rnd.uniform(0, 2 * math.pi)
        d = Vector((math.cos(a), math.sin(a), rnd.uniform(0.3, 1.0)))
        branch(p, d, height * rnd.uniform(0.25, 0.4) * (1.1 - t * 0.5), r0 * (0.55 - t * 0.3), 0)
    return join(parts, name)
