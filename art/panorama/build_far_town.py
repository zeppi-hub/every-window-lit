"""
Builds the far part of Ombrisa in Blender and renders it, from the Keeper's
seated eye point, as an equirectangular panorama the app uses as its sky.

Everything closer than about 40 m (the tower, the square, the row of houses
across it, the market street, the coast road) is drawn live by the app, so it
is left out here. What is built here is what a seated head cannot get round:
the hillside of houses behind the square, the coast, the cape and its
lighthouse, the sea and the mountains, under the same sky.

Run headless from the repository root:

    blender -b --factory-startup -P art/panorama/build_far_town.py -- \
        --out public/env --width 6144 --samples 96

Options:
    --markers   render coloured direction markers only, to check orientation
    --ibl       also render a small linear HDR copy for image-based lighting
    --blend     save the generated .blend next to this script for inspection

Coordinates: the app uses three.js axes (y up, -z ahead of the seated player).
Blender is z up, so a three.js point (x, y, z) becomes (x, -z, y) here. The
camera faces three.js +x so that the image centre matches three.js's
equirectangular convention (u = 0.5 looks along +x, u = 0.25 along -z).
"""

import math
import os
import random
import sys

import bmesh
import bpy

# --- arguments ------------------------------------------------------------

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) else default
    return default


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.abspath(os.path.join(ROOT, arg("--out", "public/env")))
WIDTH = int(arg("--width", "6144"))
SAMPLES = int(arg("--samples", "96"))
MARKERS = "--markers" in argv
IBL = "--ibl" in argv
SAVE_BLEND = "--blend" in argv
TEX = os.path.join(ROOT, "public", "textures")
HDRI = os.path.join(os.path.dirname(__file__), "source", "kloofendal_48d_partly_cloudy_puresky_2k.hdr")

# --- layout, mirrored from src/station/layout.ts --------------------------

SEAT_EYE_Y = 1.2
SILL_TOP = 0.76
PLAZA_Y = SILL_TOP - 9
SEA_Y = PLAZA_Y - 1.4
#: Houses and terrain nearer than this are drawn live by the app.
NEAR_EDGE_Z = -36.0


def B(x, y, z):
    """three.js point to Blender point."""
    return (x, -z, y)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# --- scene ----------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "METAL"
    scene.cycles.device = "GPU"
except Exception as error:  # CPU still works, just slower
    print("[pano] GPU setup failed, using CPU:", error)
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.max_bounces = 6
try:
    scene.cycles.use_denoising = True
except Exception:
    pass
# The app tone-maps its live geometry with three.js's NeutralToneMapping, the
# same Khronos PBR Neutral curve, so near and far share one colour pipeline.
try:
    scene.view_settings.view_transform = "Khronos PBR Neutral"
except Exception as error:
    print("[pano] view transform:", error)
scene.view_settings.exposure = float(arg("--exposure", "0"))
scene.render.resolution_x = WIDTH
scene.render.resolution_y = WIDTH // 2
scene.render.resolution_percentage = 100

# World: the same CC0 sky the app used before, rotated so the sun sits
# behind the seated player's left shoulder and lights the facades they face.
world = bpy.data.worlds.new("Sky")
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
wl = world.node_tree.links
wn.clear()
w_out = wn.new("ShaderNodeOutputWorld")
w_bg = wn.new("ShaderNodeBackground")
w_env = wn.new("ShaderNodeTexEnvironment")
w_map = wn.new("ShaderNodeMapping")
w_coord = wn.new("ShaderNodeTexCoord")
w_env.image = bpy.data.images.load(HDRI)
w_map.inputs["Rotation"].default_value = (0, 0, math.radians(float(arg("--sky-rotation", "118"))))
wl.new(w_coord.outputs["Generated"], w_map.inputs["Vector"])
wl.new(w_map.outputs["Vector"], w_env.inputs["Vector"])
wl.new(w_env.outputs["Color"], w_bg.inputs["Color"])
wl.new(w_bg.outputs["Background"], w_out.inputs["Surface"])


def horizon_colour():
    """Average sky radiance just above the horizon, for the distance haze."""
    image = w_env.image
    width, height = image.size
    pixels = image.pixels[:]
    total = [0.0, 0.0, 0.0]
    count = 0
    # Equirect rows: the horizon is the middle row; sample a band just above it.
    for row in range(int(height * 0.5), int(height * 0.56)):
        for col in range(0, width, 8):
            i = (row * width + col) * 4
            r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
            if r + g + b < 6:  # skip the sun
                total[0] += r
                total[1] += g
                total[2] += b
                count += 1
    return tuple(c / max(1, count) for c in total)


HAZE = horizon_colour()
print("[pano] haze colour", HAZE)

# --- materials ------------------------------------------------------------


def new_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    return material


def add_haze(material, surface_socket, strength=0.82, distance=900.0):
    """Blend camera-ray hits toward the horizon colour with distance."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    path = nodes.new("ShaderNodeLightPath")
    divide = nodes.new("ShaderNodeMath")
    divide.operation = "DIVIDE"
    divide.inputs[1].default_value = -distance
    exp = nodes.new("ShaderNodeMath")
    exp.operation = "EXPONENT"
    one_minus = nodes.new("ShaderNodeMath")
    one_minus.operation = "SUBTRACT"
    one_minus.inputs[0].default_value = 1.0
    scale = nodes.new("ShaderNodeMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = strength
    camera_only = nodes.new("ShaderNodeMath")
    camera_only.operation = "MULTIPLY"
    links.new(path.outputs["Ray Length"], divide.inputs[0])
    links.new(divide.outputs[0], exp.inputs[0])
    links.new(exp.outputs[0], one_minus.inputs[1])
    links.new(one_minus.outputs[0], scale.inputs[0])
    links.new(scale.outputs[0], camera_only.inputs[0])
    links.new(path.outputs["Is Camera Ray"], camera_only.inputs[1])
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*HAZE, 1)
    mix = nodes.new("ShaderNodeMixShader")
    links.new(camera_only.outputs[0], mix.inputs["Fac"])
    links.new(surface_socket, mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(mix.outputs["Shader"], out.inputs["Surface"])


def scanned(name, texture_id, metres, roughness_scale=1.0, bump=0.25, gain=1.0):
    """Poly Haven scan with world-scale box mapping, tinted by the 'tint' colour attribute.

    `gain` brightens the scan before tinting; the plaster scan is mid-grey, so
    without it every painted wall comes out a shade too dark.
    """
    material = new_material(name)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / metres, 1 / metres, 1 / metres)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def image(kind, colour):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(os.path.join(TEX, texture_id, f"{kind}.jpg"), check_existing=True)
        if not colour:
            node.image.colorspace_settings.name = "Non-Color"
        node.projection = "BOX"
        node.projection_blend = 0.25
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    diffuse = image("diff", True)
    rough = image("rough", False)
    brighten = nodes.new("ShaderNodeHueSaturation")
    brighten.inputs["Value"].default_value = gain
    links.new(diffuse.outputs["Color"], brighten.inputs["Color"])
    tint = nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "tint"
    multiply = nodes.new("ShaderNodeMix")
    multiply.data_type = "RGBA"
    multiply.blend_type = "MULTIPLY"
    multiply.inputs["Factor"].default_value = 1.0
    links.new(brighten.outputs["Color"], multiply.inputs["A"])
    links.new(tint.outputs["Color"], multiply.inputs["B"])
    roughness = nodes.new("ShaderNodeMath")
    roughness.operation = "MULTIPLY"
    roughness.inputs[1].default_value = roughness_scale
    links.new(rough.outputs["Color"], roughness.inputs[0])
    bump_node = nodes.new("ShaderNodeBump")
    bump_node.inputs["Strength"].default_value = bump
    links.new(diffuse.outputs["Color"], bump_node.inputs["Height"])
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(multiply.outputs["Result"], bsdf.inputs["Base Color"])
    links.new(roughness.outputs[0], bsdf.inputs["Roughness"])
    links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])
    add_haze(material, bsdf.outputs["BSDF"])
    return material


def painted(name, roughness=0.6, metallic=0.0, noise_scale=0.0, noise_mix=0.0):
    """Plain paint or glass coloured by the 'tint' attribute, optionally mottled."""
    material = new_material(name)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    tint = nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "tint"
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    colour = tint.outputs["Color"]
    if noise_scale > 0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 6
        darken = nodes.new("ShaderNodeMix")
        darken.data_type = "RGBA"
        darken.blend_type = "MULTIPLY"
        darken.inputs["Factor"].default_value = noise_mix
        links.new(colour, darken.inputs["A"])
        links.new(noise.outputs["Color"], darken.inputs["B"])
        colour = darken.outputs["Result"]
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(colour, bsdf.inputs["Base Color"])
    add_haze(material, bsdf.outputs["BSDF"])
    return material


def sea_material():
    material = new_material("Sea")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.008, 0.045, 0.06, 1)
    bsdf.inputs["Roughness"].default_value = 0.06
    coord = nodes.new("ShaderNodeTexCoord")
    small = nodes.new("ShaderNodeTexNoise")
    small.inputs["Scale"].default_value = 0.9
    small.inputs["Detail"].default_value = 8
    large = nodes.new("ShaderNodeTexWave")
    large.inputs["Scale"].default_value = 0.04
    large.inputs["Distortion"].default_value = 6
    links.new(coord.outputs["Object"], small.inputs["Vector"])
    links.new(coord.outputs["Object"], large.inputs["Vector"])
    add = nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    links.new(small.outputs["Fac"], add.inputs[0])
    links.new(large.outputs["Fac"], add.inputs[1])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.2
    links.new(add.outputs[0], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    add_haze(material, bsdf.outputs["BSDF"], strength=0.6, distance=1600.0)
    return material


MATERIALS = {
    "plaster": scanned("Plaster", "painted_plaster_wall", 2.5, gain=1.45),
    "roof": scanned("Roof", "roof_09", 2.2, roughness_scale=0.9, bump=0.4),
    "stone": scanned("Stone", "large_sandstone_blocks_01", 3.0),
    "paving": scanned("Paving", "cobblestone_floor_08", 2.2),
    "ground": painted("Ground", roughness=0.95, noise_scale=0.08, noise_mix=0.55),
    "rock": painted("Rock", roughness=0.85, noise_scale=0.3, noise_mix=0.6),
    "foliage": painted("Foliage", roughness=0.8, noise_scale=1.6, noise_mix=0.5),
    "shutter": painted("Shutter", roughness=0.55),
    "glass": painted("Glass", roughness=0.05),
    "metal": painted("Metal", roughness=0.4, metallic=0.8),
    "sea": sea_material(),
}

# --- geometry -------------------------------------------------------------


class Builder:
    """One bmesh per material, with a per-corner 'tint' colour."""

    def __init__(self, key):
        self.key = key
        self.bm = bmesh.new()
        self.tint = self.bm.loops.layers.float_color.new("tint")

    def face(self, points, colour):
        verts = [self.bm.verts.new(p) for p in points]
        face = self.bm.faces.new(verts)
        for loop in face.loops:
            loop[self.tint] = (*colour, 1.0)
        return face

    def box(self, x0, y0, z0, x1, y1, z1, colour):
        """Axis-aligned box from three.js min/max corners."""
        a = B(x0, y0, z1); b = B(x1, y0, z1); c = B(x1, y1, z1); d = B(x0, y1, z1)
        e = B(x0, y0, z0); f = B(x1, y0, z0); g = B(x1, y1, z0); h = B(x0, y1, z0)
        for quad in ((a, b, c, d), (f, e, h, g), (b, f, g, c), (e, a, d, h), (d, c, g, h), (e, f, b, a)):
            self.face(quad, colour)

    def hip_roof(self, x0, z0, x1, z1, base, height, colour):
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        ridge_x = (x1 - x0) > (z1 - z0)
        half = max(0.0, ((x1 - x0) - (z1 - z0)) / 2) if ridge_x else max(0.0, ((z1 - z0) - (x1 - x0)) / 2)
        top = base + height
        ra = B(cx - half, top, cz) if ridge_x else B(cx, top, cz - half)
        rb = B(cx + half, top, cz) if ridge_x else B(cx, top, cz + half)
        a = B(x0, base, z1); b = B(x1, base, z1); c = B(x1, base, z0); d = B(x0, base, z0)
        if ridge_x:
            self.face((a, b, rb, ra), colour); self.face((c, d, ra, rb), colour)
            self.face((b, c, rb), colour); self.face((d, a, ra), colour)
        else:
            self.face((b, c, ra, rb), colour); self.face((d, a, rb, ra), colour)
            self.face((a, b, rb), colour); self.face((c, d, ra), colour)

    def finish(self):
        mesh = bpy.data.meshes.new(self.key)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.key, mesh)
        obj.data.materials.append(MATERIALS[self.key])
        scene.collection.objects.link(obj)
        return obj


def rgb(hex_value):
    """sRGB hex to linear RGB."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(v) for v in ((hex_value >> 16) & 255, (hex_value >> 8) & 255, hex_value & 255))


random.seed(7)
pick = random.choice
P = {key: Builder(key) for key in MATERIALS}

WALL_TINTS = [rgb(h) for h in (0xFFF4E6, 0xFFE1B0, 0xFFE9CF, 0xF4C28A, 0xF6ECE0, 0xE7A283, 0xFFF8EA, 0xF2D2B6)]
ROOF_TINTS = [rgb(h) for h in (0xF2B49A, 0xE8A487, 0xF5C2A8, 0xE0A080, 0xEBB59C)]
SHUTTER_TINTS = [rgb(h) for h in (0x4F6B42, 0x5E7D4F, 0x3F5A6B, 0x6B4A32, 0x7A8A6A)]
GLASS = rgb(0x1A2228)
WHITE = rgb(0xFFFFFF)


def noise2(x, z):
    """Cheap smooth value noise for terrain, deterministic."""
    def hash2(i, j):
        h = (i * 374761393 + j * 668265263) & 0xFFFFFFFF
        h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
        return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0
    xi, zi = math.floor(x), math.floor(z)
    xf, zf = x - xi, z - zi
    u, v = xf * xf * (3 - 2 * xf), zf * zf * (3 - 2 * zf)
    a, b = hash2(xi, zi), hash2(xi + 1, zi)
    c, d = hash2(xi, zi + 1), hash2(xi + 1, zi + 1)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def height(x, z):
    """Ground height (three.js y) at (x, z): the hill climbs behind the square."""
    up = max(0.0, -z + NEAR_EDGE_Z)
    side = max(0.0, x - 38.0)
    h = PLAZA_Y - 1.5 + 1.5 * smoothstep(0, 4, up + side) + 0.26 * up + 0.2 * side
    h += 30 * smoothstep(105, 200, up)
    h += 2.2 * (noise2(x / 23, z / 23) - 0.5) * smoothstep(0, 10, up + side)
    if x < -17:  # the coast road shelf, then the shore
        h = min(h, PLAZA_Y - 0.4)
        h = h + (SEA_Y - 3 - h) * smoothstep(-29, -44, x)
    return h


def terrain():
    bm = P["ground"]
    step = 2.0
    xs = [x * step for x in range(int(-80 / step), int(130 / step) + 1)]
    zs = [z * step for z in range(int(-220 / step), int(14 / step) + 1)]
    grid = {}
    for x in xs:
        for z in zs:
            grid[(x, z)] = bm.bm.verts.new(B(x, height(x, z), z))
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            x0, x1, z0, z1 = xs[i], xs[i + 1], zs[j], zs[j + 1]
            h = height((x0 + x1) / 2, (z0 + z1) / 2)
            dry = noise2(x0 / 40, z0 / 40)
            colour = rgb(0x8C8A55) if dry < 0.45 else rgb(0xA39466) if dry < 0.7 else rgb(0x6F7A48)
            if h < SEA_Y + 1.5:
                colour = rgb(0xB8AC92)  # pale rock and sand at the shore
            face = bm.bm.faces.new((grid[(x0, z1)], grid[(x1, z1)], grid[(x1, z0)], grid[(x0, z0)]))
            for loop in face.loops:
                loop[bm.tint] = (*colour, 1.0)


def windows_on_front(x0, x1, z_front, base, floors, shutter, door=True, balcony_chance=0.25):
    """Windows, open shutters and a door on a facade facing the square (+z)."""
    span = x1 - x0
    per_floor = max(1, int(span / 2.3))
    for f in range(floors):
        for i in range(per_floor):
            cx = x0 + (i + 0.5) * span / per_floor
            if f == 0 and door and i == per_floor // 2:
                P["shutter"].box(cx - 0.55, base, z_front - 0.05, cx + 0.55, base + 2.2, z_front + 0.04, rgb(0x4A3426))
                continue
            y = base + 1.4 + f * 3.1 + (0.3 if f == 0 else 0)
            P["glass"].box(cx - 0.45, y, z_front - 0.04, cx + 0.45, y + 1.35, z_front + 0.02, GLASS)
            P["shutter"].box(cx - 0.95, y, z_front, cx - 0.47, y + 1.35, z_front + 0.05, shutter)
            P["shutter"].box(cx + 0.47, y, z_front, cx + 0.95, y + 1.35, z_front + 0.05, shutter)
            P["stone"].box(cx - 0.55, y - 0.1, z_front, cx + 0.55, y, z_front + 0.12, WHITE)
            if f > 0 and random.random() < balcony_chance:
                P["stone"].box(cx - 0.8, y - 0.22, z_front, cx + 0.8, y - 0.1, z_front + 0.7, WHITE)
                for k in range(9):
                    bx = cx - 0.75 + k * 0.1875
                    P["metal"].box(bx - 0.015, y - 0.1, z_front + 0.64, bx + 0.015, y + 0.85, z_front + 0.67, rgb(0x2A2A2A))
                P["metal"].box(cx - 0.8, y + 0.85, z_front + 0.62, cx + 0.8, y + 0.9, z_front + 0.7, rgb(0x2A2A2A))


def house(x0, x1, z0, z1, floors):
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    ground = min(height(x0, z1), height(x1, z1), height(cx, cz))
    top = ground + floors * 3.1 + 0.4
    tint = pick(WALL_TINTS)
    P["plaster"].box(x0, ground - 4, z0, x1, top, z1, tint)
    P["stone"].box(x0 - 0.05, ground - 4, z1 - 0.02, x1 + 0.05, ground + 0.5, z1 + 0.06, WHITE)  # plinth
    if random.random() < 0.18:  # flat roof terrace with a parapet
        P["plaster"].box(x0, top, z0, x1, top + 0.9, z0 + 0.25, tint)
        P["plaster"].box(x0, top, z1 - 0.25, x1, top + 0.9, z1, tint)
        P["plaster"].box(x0, top, z0, x0 + 0.25, top + 0.9, z1, tint)
        P["plaster"].box(x1 - 0.25, top, z0, x1, top + 0.9, z1, tint)
    else:
        P["roof"].hip_roof(x0 - 0.35, z0 - 0.35, x1 + 0.35, z1 + 0.35, top, 1.5 + random.random() * 0.9, pick(ROOF_TINTS))
        if random.random() < 0.6:
            chx = x0 + 1 + random.random() * (x1 - x0 - 2)
            P["plaster"].box(chx - 0.3, top, cz - 0.3, chx + 0.3, top + 2.4, cz + 0.3, tint)
    windows_on_front(x0, x1, z1, ground, floors, pick(SHUTTER_TINTS))


def hillside():
    for k in range(10):
        front = -40.0 - 11.0 * k
        x = -15.0 + 1.5 * k + random.random() * 3
        while x < 92:
            width = 5 + random.random() * 4
            if random.random() < 0.86 and height(x + width / 2, front) < PLAZA_Y + 42:
                floors = pick((2, 3, 3, 4) if k < 4 else (2, 2, 3))
                depth = 7 + random.random() * 2
                house(x, x + width, front - depth, front, floors)
            x += width + 0.4 + random.random() * 2.2
    # A few houses up the slope on the right, behind the market street.
    for z in (-6.0, -18.0, -30.0):
        x = 44.0
        while x < 100:
            width = 5 + random.random() * 3
            if random.random() < 0.7:
                house(x, x + width, z - 7, z, pick((2, 3)))
            x += width + 1 + random.random() * 3


def tree_cypress(x, z, scale=1.0):
    y = height(x, z)
    bm = P["foliage"].bm
    h = (6 + random.random() * 4) * scale
    r = (0.6 + random.random() * 0.3) * scale
    result = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=0.05, depth=h)
    for v in result["verts"]:
        v.co.x += x
        v.co.y += -z
        v.co.z += y + h / 2 - 0.3
    tint = rgb(0x2F4A2A)
    for f in {f for v in result["verts"] for f in v.link_faces}:
        for loop in f.loops:
            loop[P["foliage"].tint] = (*tint, 1.0)


def tree_round(x, z, radius, colour):
    y = height(x, z)
    bm = P["foliage"].bm
    trunk = rgb(0x4A3A2C)
    P["foliage"].box(x - 0.15, y - 0.3, z - 0.15, x + 0.15, y + radius * 1.2, z + 0.15, trunk)
    result = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius)
    for v in result["verts"]:
        v.co.x = v.co.x * (1 + random.random() * 0.15) + x
        v.co.y = v.co.y * (1 + random.random() * 0.15) - z
        v.co.z = v.co.z * 0.75 + y + radius * 1.6
    for f in {f for v in result["verts"] for f in v.link_faces}:
        for loop in f.loops:
            loop[P["foliage"].tint] = (*colour, 1.0)


def vegetation():
    olive = rgb(0x6E7B4E)
    pine = rgb(0x3E5534)
    for _ in range(260):
        x = -16 + random.random() * 110
        z = NEAR_EDGE_Z - 3 - random.random() * 150
        roll = random.random()
        if roll < 0.35:
            tree_cypress(x, z)
        elif roll < 0.8:
            tree_round(x, z, 1.4 + random.random() * 0.8, olive)
        else:
            tree_round(x, z, 2.2 + random.random() * 1.2, pine)


def coast_and_cape():
    # The promenade continues along the shore beyond the live part of the road.
    P["stone"].box(-29, PLAZA_Y - 1.4, -260, -25, PLAZA_Y - 0.3, NEAR_EDGE_Z, WHITE)
    P["paving"].box(-25, PLAZA_Y - 0.6, -260, -20.5, PLAZA_Y - 0.3, NEAR_EDGE_Z, rgb(0xC9BFAE))
    # The cape: a rocky mass rising from the water, front left across the bay.
    rock = rgb(0x9C9384)
    bm = P["rock"].bm
    blob = bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    for v in blob["verts"]:
        n = noise2(v.co.x * 3 + 5, v.co.y * 3 + 7)
        v.co.x = v.co.x * 22 * (0.85 + 0.3 * n) - 62
        v.co.y = v.co.y * 16 * (0.85 + 0.3 * n) + 94
        v.co.z = max(v.co.z, -0.4) * 9 * (0.8 + 0.4 * n) + SEA_Y + 1
    for f in {f for v in blob["verts"] for f in v.link_faces}:
        for loop in f.loops:
            loop[P["rock"].tint] = (*rock, 1.0)
    # The abandoned lighthouse and its keeper's house.
    base = SEA_Y + 9.5
    tower = bmesh.ops.create_cone(P["plaster"].bm, cap_ends=True, segments=16, radius1=1.9, radius2=1.5, depth=14)
    for v in tower["verts"]:
        v.co.x += -60.5
        v.co.y += 93.5
        v.co.z += base + 7
    for f in {f for v in tower["verts"] for f in v.link_faces}:
        for loop in f.loops:
            loop[P["plaster"].tint] = (*rgb(0xF4EFE6), 1.0)
    P["metal"].box(-62.2, base + 14, -95.2, -58.8, base + 14.3, -91.8, rgb(0x3A3A36))
    P["glass"].box(-61.6, base + 14.3, -94.6, -59.4, base + 16.1, -92.4, rgb(0x2A3236))
    lantern = bmesh.ops.create_cone(P["metal"].bm, cap_ends=True, segments=12, radius1=1.4, radius2=0.1, depth=1.3)
    for v in lantern["verts"]:
        v.co.x += -60.5
        v.co.y += 93.5
        v.co.z += base + 16.7
    for f in {f for v in lantern["verts"] for f in v.link_faces}:
        for loop in f.loops:
            loop[P["metal"].tint] = (*rgb(0x5A3A30), 1.0)
    P["plaster"].box(-68, base - 1, -98, -63.5, base + 3.2, -93, rgb(0xEDE3D0))
    P["roof"].hip_roof(-68.3, -98.3, -63.2, -92.7, base + 3.2, 1.3, rgb(0xE8C4B0))


def far_land():
    """Mountains behind the town and a headland across the bay, softened by haze."""
    bm = P["rock"]
    def ridge(x0, x1, z0, z1, peak, seed, colour):
        step = 12.0
        nx, nz = int((x1 - x0) / step), int((z1 - z0) / step)
        verts = {}
        for i in range(nx + 1):
            for j in range(nz + 1):
                x, z = x0 + i * step, z0 + j * step
                edge = min(i, nx - i, j, nz - j) / max(1, min(nx, nz) / 2)
                h = SEA_Y - 4 + peak * (0.35 + 0.65 * noise2(x / 160 + seed, z / 160)) * smoothstep(0, 0.6, edge)
                verts[(i, j)] = bm.bm.verts.new(B(x, h, z))
        for i in range(nx):
            for j in range(nz):
                face = bm.bm.faces.new((verts[(i, j + 1)], verts[(i + 1, j + 1)], verts[(i + 1, j)], verts[(i, j)]))
                for loop in face.loops:
                    loop[bm.tint] = (*colour, 1.0)
    ridge(-500, 760, -1300, -560, 300, 3.1, rgb(0x6F7A58))
    ridge(-1100, -260, -1100, -180, 110, 8.7, rgb(0x858766))


def markers():
    """Emissive spheres along three.js axes, to check the panorama's orientation."""
    for name, (x, y, z), colour in (
        ("forward_-z_green", (0, SEAT_EYE_Y, -60), (0, 1, 0)),
        ("right_+x_red", (60, SEAT_EYE_Y, 0), (1, 0, 0)),
        ("back_+z_blue", (0, SEAT_EYE_Y, 60), (0, 0, 1)),
        ("left_-x_yellow", (-60, SEAT_EYE_Y, 0), (1, 1, 0)),
        ("forward_right_magenta", (42, SEAT_EYE_Y + 20, -42), (1, 0, 1)),
    ):
        material = new_material(name)
        emission = material.node_tree.nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (*colour, 1)
        emission.inputs["Strength"].default_value = 5
        out = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=6)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        obj.location = B(x, y, z)
        obj.data.materials.append(material)
        scene.collection.objects.link(obj)


# --- build ----------------------------------------------------------------

if MARKERS:
    markers()
else:
    terrain()
    hillside()
    vegetation()
    coast_and_cape()
    far_land()
    # The sea reaches the horizon.
    P["sea"].face((B(-4000, SEA_Y, 4000), B(4000, SEA_Y, 4000), B(4000, SEA_Y, -4000), B(-4000, SEA_Y, -4000)), (1, 1, 1))
    for builder in P.values():
        if len(builder.bm.faces):
            builder.finish()

camera_data = bpy.data.cameras.new("Eye")
camera_data.type = "PANO"
camera_data.panorama_type = "EQUIRECTANGULAR"
camera = bpy.data.objects.new("Eye", camera_data)
camera.location = B(0, SEAT_EYE_Y, 0)
camera.rotation_euler = (math.pi / 2, 0, -math.pi / 2)  # look along three.js +x
scene.collection.objects.link(camera)
scene.camera = camera

if SAVE_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "far_town.blend"))

os.makedirs(OUT, exist_ok=True)
stem = "ombrisa_markers" if MARKERS else "ombrisa_pano"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = os.path.join(OUT, f"{stem}.png")
print("[pano] rendering", scene.render.filepath, scene.render.resolution_x, "x", scene.render.resolution_y)
bpy.ops.render.render(write_still=True)

if IBL and not MARKERS:
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 512
    scene.cycles.samples = 64
    scene.render.image_settings.file_format = "HDR"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = os.path.join(OUT, "ombrisa_ibl.hdr")
    print("[pano] rendering", scene.render.filepath)
    bpy.ops.render.render(write_still=True)

print("[pano] done")
