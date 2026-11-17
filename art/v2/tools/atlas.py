"""Fewer materials for a merged Blender scene, so it draws in fewer calls.

Three steps, all run on the static objects before they are joined per material:
  same_materials(objs)          materials that are copies of one another (the same
                                images and values, imported twice) become one;
  tint_by_vertex(objs, groups)  materials that differ only in a base-colour tint
                                become one, the tint moving into a colour attribute
                                ('tint', exported as COLOR_0, which three.js multiplies in);
  atlas(objs, mats, ...)        materials whose UVs stay inside 0..1 (props, vehicles)
                                and plain-colour materials share one set of atlas images
                                (colour, roughness-metal, normal); their UVs are moved
                                into each one's cell, a plain colour's UVs onto its cell's
                                centre (a triangle with one UV samples full resolution).
"""
import math
import re

import bpy
import numpy as np

UV = 'UVMap'
TINT = 'tint'


def _base(name):
    return re.sub(r'\.\d{3}$', '', name)


def _principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None


def _follow(sock):
    """What feeds a Principled input: ('const', value) or ('img', image, channel, factor)."""
    if not sock.links:
        v = sock.default_value
        return ('const', tuple(v) if hasattr(v, '__len__') else float(v))
    node = sock.links[0].from_node
    out = sock.links[0].from_socket
    factor = 1.0
    channel = None
    for _ in range(6):
        if node.type == 'TEX_IMAGE':
            return ('img', node.image, channel, factor)
        if node.type in ('SEPARATE_COLOR', 'SEPRGB'):
            channel = {'Red': 0, 'Green': 1, 'Blue': 2, 'R': 0, 'G': 1, 'B': 2}[out.name]
            sock = node.inputs[0]
        elif node.type == 'MATH' and node.operation == 'MULTIPLY':
            linked = [i for i in node.inputs[:2] if i.links]
            const = [i for i in node.inputs[:2] if not i.links]
            if len(linked) != 1:
                return None
            factor *= const[0].default_value
            sock = linked[0]
        elif node.type == 'MIX' and node.blend_type == 'MULTIPLY' and node.data_type == 'RGBA':
            a, b = node.inputs[6], node.inputs[7]
            if a.links and not b.links:
                factor = np.array(b.default_value[:3]) * factor
                sock = a
            elif b.links and not a.links:
                factor = np.array(a.default_value[:3]) * factor
                sock = b
            else:
                return None
        elif node.type == 'NORMAL_MAP':
            factor = node.inputs['Strength'].default_value
            sock = node.inputs['Color']
        else:
            return None
        if not sock.links:
            return None
        node = sock.links[0].from_node
        out = sock.links[0].from_socket
    return None


def _spec(mat):
    """Colour, roughness, metal and normal sources of a material, or None if it is not a plain opaque PBR."""
    b = _principled(mat)
    if b is None or mat.surface_render_method == 'BLENDED':
        return None
    if b.inputs['Alpha'].links or b.inputs['Alpha'].default_value < 0.999:
        return None
    em = b.inputs['Emission Color']
    if em.links or (b.inputs['Emission Strength'].default_value > 0 and max(em.default_value[:3]) > 0.001):
        return None
    s = {k: _follow(b.inputs[k]) for k in ('Base Color', 'Roughness', 'Metallic')}
    s['Normal'] = _follow(b.inputs['Normal']) if b.inputs['Normal'].links else None
    if any(v is None for k, v in s.items() if k != 'Normal'):
        return None
    if b.inputs['Normal'].links and s['Normal'] is None:
        return None
    return s


def _key(mat):
    s = _spec(mat)
    if s is None:
        return None
    def k(v):
        if v is None:
            return None
        if v[0] == 'const':
            return ('c', tuple(round(x, 4) for x in (v[1] if isinstance(v[1], tuple) else (v[1],))))
        img = v[1]
        f = v[3]
        f = tuple(round(float(x), 4) for x in np.atleast_1d(f))
        return ('i', bpy.path.abspath(img.filepath) or _base(img.name), tuple(img.size), v[2], f)
    return tuple(k(s[n]) for n in ('Base Color', 'Roughness', 'Metallic', 'Normal'))


def same_materials(objs):
    """Objects whose material is a copy of an earlier one get that one. Returns how many were folded."""
    first = {}
    folded = set()
    for o in objs:
        if o.type != 'MESH' or not o.data.materials:
            continue
        for i, m in enumerate(o.data.materials):
            if m is None:
                continue
            key = (_base(m.name), _key(m))
            if key[1] is None:
                continue
            keep = first.setdefault(key, m)
            if keep is not m:
                o.data.materials[i] = keep
                folded.add(m.name)
    return len(folded)


def _base_factor(mat):
    """(the node or socket holding the tint, its rgb) for a material's base colour."""
    b = _principled(mat)
    sock = b.inputs['Base Color']
    if sock.links and sock.links[0].from_node.type == 'MIX' and sock.links[0].from_node.blend_type == 'MULTIPLY':
        mix = sock.links[0].from_node
        return mix.inputs[7], np.array(mix.inputs[7].default_value[:3])
    if not sock.links:
        return sock, np.array(sock.default_value[:3])
    return None, np.ones(3)


def _add_tint(me, rgb):
    for a in list(me.color_attributes):
        if a.name != TINT:
            me.color_attributes.remove(a)
    attr = me.color_attributes.get(TINT) or me.color_attributes.new(TINT, 'FLOAT_COLOR', 'CORNER')
    data = np.tile(np.array([rgb[0], rgb[1], rgb[2], 1.0], dtype=np.float32), len(me.loops))
    attr.data.foreach_set('color', data)
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find(TINT)


def tint_by_vertex(objs, groups):
    """groups: {kept material: [materials that are the same textures with another tint]}.
    Every object of the group gets the kept material and a 'tint' colour attribute with
    its own tint relative to the kept one; the kept material multiplies that attribute in."""
    n = 0
    for keep, others in groups.items():
        _, base_rgb = _base_factor(keep)
        members = {keep.name: np.ones(3)}
        for m in others:
            _, rgb = _base_factor(m)
            members[m.name] = rgb / np.maximum(base_rgb, 1e-6)
        for o in objs:
            if o.type != 'MESH' or not o.data.materials or o.data.materials[0] is None:
                continue
            name = o.data.materials[0].name
            if name not in members:
                continue
            if o.data.users > 1:
                o.data = o.data.copy()
            _add_tint(o.data, members[name])
            o.data.materials[0] = keep
            n += 1
        # Show the attribute in Blender's own renders too.
        nt = keep.node_tree
        b = _principled(keep)
        src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].links else None
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = TINT
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        if src is not None:
            nt.links.new(src, mix.inputs[6])
        else:
            mix.inputs[6].default_value = b.inputs['Base Color'].default_value
        nt.links.new(attr.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    return n


def strip_other_colours(objs):
    """Drops every colour attribute except 'tint' (imported ones would export as COLOR_0)."""
    for o in objs:
        if o.type == 'MESH':
            for a in list(o.data.color_attributes):
                if a.name != TINT:
                    o.data.color_attributes.remove(a)


# ---------------------------------------------------------------- atlas

def _srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def _lin(x):
    return np.where(x <= 0.04045, x / 12.92, np.power((x + 0.055) / 1.055, 2.4))


def _pixels(img, size):
    """RGBA float array (size, size, 4) of an image resized to size (stored values, no colour management)."""
    tmp = None
    if tuple(img.size) != (size, size):
        tmp = img.copy()
        tmp.scale(size, size)
        img = tmp
    a = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    if tmp is not None:
        bpy.data.images.remove(tmp)
    return a.reshape(size, size, 4)


def _uv_range(o):
    uv = o.data.uv_layers.get(UV)
    if uv is None or not len(uv.data):
        return None
    a = np.empty(len(uv.data) * 2, dtype=np.float32)
    uv.data.foreach_get('uv', a)
    a = a.reshape(-1, 2)
    return a.min(0), a.max(0)


def atlas(objs, mats, name, cols, rows, cell, flat_cell=True, pad=4, data_scale=0.25, normal_scale=0.5, log=print):
    """Puts the listed materials into one atlas material `name` (a grid cols x rows of
    square cells of `cell` px for colour; roughness-metal at data_scale, normals at
    normal_scale of that). Plain-colour materials share one cell split into 8 x 8.
    Materials whose UVs leave 0..1, that blend or glow are skipped. Returns the material."""
    users = {}
    for o in objs:
        if o.type == 'MESH' and o.data.materials and o.data.materials[0] is not None:
            users.setdefault(o.data.materials[0].name, []).append(o)
    textured, plain = [], []
    for m in mats:
        if m.name not in users:
            continue
        s = _spec(m)
        if s is None:
            log(f'ATLAS skip {m.name}: not a plain opaque material')
            continue
        is_plain = s['Base Color'][0] == 'const' and s['Roughness'][0] == 'const' and s['Metallic'][0] == 'const' and s['Normal'] is None
        if is_plain:
            plain.append((m, s))
            continue
        lo, hi = np.full(2, 9.0), np.full(2, -9.0)
        for o in users[m.name]:
            r = _uv_range(o)
            if r is not None:
                lo, hi = np.minimum(lo, r[0]), np.maximum(hi, r[1])
        if lo.min() < -0.02 or hi.max() > 1.02:
            log(f'ATLAS skip {m.name}: UVs {lo.round(2)}..{hi.round(2)} leave 0..1')
            continue
        textured.append((m, s))
    slots = cols * rows - (1 if flat_cell and plain else 0)
    if len(textured) > slots:
        log(f'ATLAS {name}: {len(textured)} textured materials for {slots} cells; the rest stay as they are')
        textured = textured[:slots]
    W, H = cols * cell, rows * cell
    dc, nc = max(4, int(cell * data_scale)), max(4, int(cell * normal_scale))
    col = np.zeros((H, W, 4), np.float32); col[..., 3] = 1
    arm = np.zeros((rows * dc, cols * dc, 4), np.float32); arm[..., 0] = 1; arm[..., 1] = 0.5; arm[..., 3] = 1
    nor = np.zeros((rows * nc, cols * nc, 4), np.float32); nor[..., 0] = 0.5; nor[..., 1] = 0.5; nor[..., 2] = 1; nor[..., 3] = 1
    any_normal = False

    def put(dst, size, cx, cy, block, p):
        """block is (size - 2p) square; its edge pixels fill the gutter round it."""
        y0, x0 = cy * size, cx * size
        dst[y0:y0 + size, x0:x0 + size] = np.pad(block, ((p, p), (p, p), (0, 0)), mode='edge')

    for i, (m, s) in enumerate(textured):
        cx, cy = i % cols, i // cols
        # Colour: stored sRGB pixels times the factor in linear light.
        v = s['Base Color']
        inner = cell - 2 * pad
        if v[0] == 'const':
            block = np.tile(np.array([*_srgb(np.array(v[1][:3])), 1.0], np.float32), (inner, inner, 1))
        else:
            block = _pixels(v[1], inner)
            f = np.atleast_1d(v[3]).astype(np.float32)
            if f.size == 1:
                f = np.repeat(f, 3)
            if not np.allclose(f, 1.0):
                block[..., :3] = _srgb(_lin(block[..., :3]) * f[:3])
        block[..., 3] = 1
        put(col, cell, cx, cy, block, pad)
        # Roughness (G) and metal (B).
        dp = max(1, pad * dc // cell)
        b = np.ones((dc - 2 * dp, dc - 2 * dp, 4), np.float32)
        for k, ch in (('Roughness', 1), ('Metallic', 2)):
            v = s[k]
            if v[0] == 'const':
                b[..., ch] = v[1]
            else:
                px = _pixels(v[1], dc - 2 * dp)
                b[..., ch] = px[..., v[2] if v[2] is not None else 0] * float(v[3])
        put(arm, dc, cx, cy, b, dp)
        # Normal.
        v = s['Normal']
        if v is not None:
            npd = max(1, pad * nc // cell)
            px = _pixels(v[1], nc - 2 * npd)
            st = float(v[3])
            if abs(st - 1.0) > 1e-3:
                px[..., :2] = (px[..., :2] - 0.5) * st + 0.5
            px[..., 3] = 1
            put(nor, nc, cx, cy, px, npd)
            any_normal = True
        # UVs into the cell's inner square.
        inset = pad / cell
        u0, v0 = (cx + inset) / cols, (cy + inset) / rows
        su, sv = (1 - 2 * inset) / cols, (1 - 2 * inset) / rows
        for o in users[m.name]:
            uv = o.data.uv_layers.get(UV)
            a = np.empty(len(uv.data) * 2, dtype=np.float32)
            uv.data.foreach_get('uv', a)
            a = a.reshape(-1, 2)
            a[:, 0] = u0 + np.clip(a[:, 0], 0, 1) * su
            a[:, 1] = v0 + np.clip(a[:, 1], 0, 1) * sv
            uv.data.foreach_set('uv', a.ravel())
        log(f'ATLAS {name} cell {cx},{cy}: {m.name} ({len(users[m.name])} objects)')
    if flat_cell and plain:
        k = len(textured)
        cx, cy = k % cols, k // cols
        sub = 8
        for j, (m, s) in enumerate(plain[:sub * sub]):
            sx, sy = j % sub, j // sub
            c = np.array(s['Base Color'][1][:3])
            r0, r1 = cy * cell + sy * cell // sub, cy * cell + (sy + 1) * cell // sub
            c0, c1 = cx * cell + sx * cell // sub, cx * cell + (sx + 1) * cell // sub
            col[r0:r1, c0:c1, :3] = _srgb(c)
            d0, d1 = cy * dc + sy * dc // sub, cy * dc + (sy + 1) * dc // sub
            e0, e1 = cx * dc + sx * dc // sub, cx * dc + (sx + 1) * dc // sub
            arm[d0:d1, e0:e1, 0] = 1
            arm[d0:d1, e0:e1, 1] = s['Roughness'][1]
            arm[d0:d1, e0:e1, 2] = s['Metallic'][1]
            cu = (cx + (sx + 0.5) / sub) / cols
            cv = (cy + (sy + 0.5) / sub) / rows
            for o in users[m.name]:
                uv = o.data.uv_layers.get(UV) or o.data.uv_layers.new(name=UV)
                a = np.tile(np.array([cu, cv], np.float32), len(uv.data))
                uv.data.foreach_set('uv', a)
            log(f'ATLAS {name} plain {sx},{sy}: {m.name} ({len(users[m.name])} objects)')
    # The images and the material.
    def image(nm, arr, colour):
        h, w = arr.shape[:2]
        img = bpy.data.images.new(nm, w, h, alpha=False)
        img.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
        img.pixels.foreach_set(arr.astype(np.float32).ravel())
        img.file_format = 'PNG'
        img.pack()
        return img
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = _principled(mat)
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(f'{name}_col', col, True)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    t2 = nt.nodes.new('ShaderNodeTexImage'); t2.image = image(f'{name}_arm', arm, False)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(t2.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    if any_normal:
        t3 = nt.nodes.new('ShaderNodeTexImage'); t3.image = image(f'{name}_nor', nor, False)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t3.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    members = {m.name for m, _ in textured} | {m.name for m, _ in plain[:64]}
    for o in objs:
        if o.type == 'MESH' and o.data.materials and o.data.materials[0] is not None and o.data.materials[0].name in members:
            o.data.materials[0] = mat
    return mat
