"""
Builds the far part of Ombrisa in Blender and renders it, from the Keeper's
seated eye point, as an equirectangular panorama the app uses as its sky.

Everything closer than about 36 m (the tower, the square, the row of houses
across it, the market street, the coast road) is drawn live by the app, so it
is left out here. What is built here is what a seated head cannot get round:
the hillside behind the square, the harbour, the cape and its lighthouse, the
sea and the mountains, under the same sky.

Ombrisa is a timeless port where three quarters meet:

- the Italian core round the square: pastel plaster, terracotta roofs,
  louvred shutters, stone sills and cornices, arched shop fronts, iron balconies;
- the Turkish quarter up the hillside and on the slope to the right:
  whitewashed rubble-stone houses with flat or low roofs, timber cumbas (closed
  bay windows) on the upper floors, blue doors and shutters, bougainvillea and
  two old plane trees;
- the American harbour on the shore to the front left: clapboard boathouses
  and porch houses under steep gables, a wooden pier on piles, moored boats and
  a New England lighthouse on the cape.

Nothing dates it or takes sides: no religious buildings, flags, brands or
readable signs.

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
TEX = os.path.join(ROOT, "art", "textures", "source")
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
# Camera rays see the sun clamped. The scene is still lit by the full sun, but
# the IBL render then carries sky and bounce only; the app adds the sun back as
# its directional light, so the near geometry does not count it twice.
w_path = wn.new("ShaderNodeLightPath")
w_clamp = wn.new("ShaderNodeVectorMath")
w_clamp.operation = "MINIMUM"
w_clamp.inputs[1].default_value = (20.0, 20.0, 20.0)
w_pick = wn.new("ShaderNodeMix")
w_pick.data_type = "RGBA"
wl.new(w_env.outputs["Color"], w_clamp.inputs[0])
wl.new(w_path.outputs["Is Camera Ray"], w_pick.inputs["Factor"])
wl.new(w_env.outputs["Color"], w_pick.inputs["A"])
wl.new(w_clamp.outputs["Vector"], w_pick.inputs["B"])
wl.new(w_pick.outputs["Result"], w_bg.inputs["Color"])
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


def typed(sockets, name, kind="RGBA"):
    """The socket of one type: a Mix node carries an A, a B and a Result for each data type."""
    for socket in sockets:
        if socket.name == name and socket.type == kind:
            return socket
    return sockets[name]


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


def scanned(name, texture_id, metres, roughness_scale=1.0, bump=0.25, gain=1.0, saturation=1.0, whiten=0.0):
    """Poly Haven scan with world-scale box mapping, tinted by the 'tint' colour attribute.

    `gain` brightens the scan before tinting; the plaster scan is mid-grey, so
    without it every painted wall comes out a shade too dark. `saturation`
    and `whiten` turn a stone scan into limewashed rubble: the stones keep
    their relief under the lime but lose most of their colour.
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
    brighten.inputs["Saturation"].default_value = saturation
    links.new(diffuse.outputs["Color"], brighten.inputs["Color"])
    albedo = brighten.outputs["Color"]
    if whiten > 0:
        lime = nodes.new("ShaderNodeMix")
        lime.data_type = "RGBA"
        lime.inputs["Factor"].default_value = whiten
        links.new(albedo, typed(lime.inputs, "A"))
        typed(lime.inputs, "B").default_value = (1.0, 1.0, 1.0, 1.0)
        albedo = typed(lime.outputs, "Result")
    tint = nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "tint"
    multiply = nodes.new("ShaderNodeMix")
    multiply.data_type = "RGBA"
    multiply.blend_type = "MULTIPLY"
    multiply.inputs["Factor"].default_value = 1.0
    links.new(albedo, multiply.inputs["A"])
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


def boarded(name, period, bump=0.5, roughness=0.6, shadow=0.3, noise_mix=0.0):
    """Paint over lapped boards in level courses `period` metres apart.

    Used for clapboard walls and shingle roofs. The courses run level all
    round a building, whichever way a wall faces, because they are bands of
    height rather than a texture laid on each face.
    """
    material = new_material(name)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coord = nodes.new("ShaderNodeTexCoord")
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.wave_profile = "SAW"
    # Blender's bands repeat every 2 pi / 20 texture units.
    wave.inputs["Scale"].default_value = (2 * math.pi / 20) / period
    wave.inputs["Distortion"].default_value = 0.0
    links.new(coord.outputs["Object"], wave.inputs["Vector"])
    # Each board darkens toward its top, in the shade of the board lapped over it.
    power = nodes.new("ShaderNodeMath")
    power.operation = "POWER"
    power.inputs[1].default_value = 3.0
    links.new(wave.outputs["Fac"], power.inputs[0])
    shade = nodes.new("ShaderNodeMath")
    shade.operation = "MULTIPLY_ADD"
    shade.inputs[1].default_value = -shadow
    shade.inputs[2].default_value = 1.0
    links.new(power.outputs[0], shade.inputs[0])
    tint = nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "tint"
    darken = nodes.new("ShaderNodeMix")
    darken.data_type = "RGBA"
    darken.blend_type = "MULTIPLY"
    darken.inputs["Factor"].default_value = 1.0
    links.new(tint.outputs["Color"], typed(darken.inputs, "A"))
    links.new(shade.outputs[0], typed(darken.inputs, "B"))
    colour = typed(darken.outputs, "Result")
    if noise_mix > 0:  # weathering
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 1.4
        noise.inputs["Detail"].default_value = 4
        links.new(coord.outputs["Object"], noise.inputs["Vector"])
        grime = nodes.new("ShaderNodeMix")
        grime.data_type = "RGBA"
        grime.blend_type = "MULTIPLY"
        grime.inputs["Factor"].default_value = noise_mix
        links.new(colour, typed(grime.inputs, "A"))
        links.new(noise.outputs["Color"], typed(grime.inputs, "B"))
        colour = typed(grime.outputs, "Result")
    # Thick at each board's lower edge, thin where it tucks under the next.
    thickness = nodes.new("ShaderNodeMath")
    thickness.operation = "SUBTRACT"
    thickness.inputs[0].default_value = 1.0
    links.new(wave.outputs["Fac"], thickness.inputs[1])
    bump_node = nodes.new("ShaderNodeBump")
    bump_node.inputs["Strength"].default_value = bump
    bump_node.inputs["Distance"].default_value = 0.015
    links.new(thickness.outputs[0], bump_node.inputs["Height"])
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    links.new(colour, bsdf.inputs["Base Color"])
    links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])
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
    "roof": scanned("Roof", "roof_09", 4.0, roughness_scale=0.9, bump=0.4),
    "stone": scanned("Stone", "large_sandstone_blocks_01", 3.0),
    "paving": scanned("Paving", "cobblestone_floor_08", 2.2),
    # Rubble stone under limewash, and the same stone left bare.
    "whitewash": scanned("Whitewash", "medieval_blocks_02", 2.4, bump=0.6, gain=1.4, saturation=0.15, whiten=0.55),
    "rubble": scanned("Rubble", "medieval_blocks_02", 2.4, bump=0.45, gain=1.15, saturation=0.8),
    "timber": scanned("Timber", "wood_shutter", 1.8, bump=0.2, saturation=0.85),
    "planks": scanned("Planks", "roof_planks", 2.2, bump=0.3, gain=1.1, saturation=0.45),
    "clapboard": boarded("Clapboard", 0.19, bump=0.45, roughness=0.55, shadow=0.28, noise_mix=0.12),
    "shingle": boarded("Shingle", 0.26, bump=0.35, roughness=0.85, shadow=0.35, noise_mix=0.3),
    "ground": painted("Ground", roughness=0.95, noise_scale=0.08, noise_mix=0.55),
    "rock": painted("Rock", roughness=0.85, noise_scale=0.3, noise_mix=0.6),
    "foliage": painted("Foliage", roughness=0.8, noise_scale=1.6, noise_mix=0.5),
    "bloom": painted("Bloom", roughness=0.75, noise_scale=4.0, noise_mix=0.3),
    "shutter": painted("Shutter", roughness=0.55),
    "cloth": painted("Cloth", roughness=0.9, noise_scale=3.0, noise_mix=0.15),
    "hull": painted("Hull", roughness=0.3),
    "glass": painted("Glass", roughness=0.05),
    "metal": painted("Metal", roughness=0.4, metallic=0.8),
    "sea": sea_material(),
}

# --- geometry -------------------------------------------------------------


class Builder:
    """One bmesh per material, with a per-corner 'tint' colour."""

    def __init__(self, key, material=None):
        self.key = key
        self.material = material or key
        self.bm = bmesh.new()
        self.tint = self.bm.loops.layers.float_color.new("tint")

    def face(self, points, colour, smooth=False):
        verts = [self.bm.verts.new(p) for p in points]
        face = self.bm.faces.new(verts)
        face.smooth = smooth
        for loop in face.loops:
            loop[self.tint] = (*colour, 1.0)
        return face

    def poly(self, points, colour):
        """Flat polygon through three.js points."""
        return self.face([B(*p) for p in points], colour)

    def box(self, x0, y0, z0, x1, y1, z1, colour):
        """Axis-aligned box from three.js min/max corners."""
        a = B(x0, y0, z1); b = B(x1, y0, z1); c = B(x1, y1, z1); d = B(x0, y1, z1)
        e = B(x0, y0, z0); f = B(x1, y0, z0); g = B(x1, y1, z0); h = B(x0, y1, z0)
        for quad in ((a, b, c, d), (f, e, h, g), (b, f, g, c), (e, a, d, h), (d, c, g, h), (e, f, b, a)):
            self.face(quad, colour)

    def hip_roof(self, x0, z0, x1, z1, base, height, colour, lift=(0.0, 0.0)):
        """Hip roof; `lift` raises the two ridge ends a little, so ridges are not ruler-straight."""
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        ridge_x = (x1 - x0) > (z1 - z0)
        half = max(0.0, ((x1 - x0) - (z1 - z0)) / 2) if ridge_x else max(0.0, ((z1 - z0) - (x1 - x0)) / 2)
        top = base + height
        ra = B(cx - half, top + lift[0], cz) if ridge_x else B(cx, top + lift[0], cz - half)
        rb = B(cx + half, top + lift[1], cz) if ridge_x else B(cx, top + lift[1], cz + half)
        a = B(x0, base, z1); b = B(x1, base, z1); c = B(x1, base, z0); d = B(x0, base, z0)
        if ridge_x:
            self.face((a, b, rb, ra), colour); self.face((c, d, ra, rb), colour)
            self.face((b, c, rb), colour); self.face((d, a, ra), colour)
        else:
            self.face((b, c, ra, rb), colour); self.face((d, a, rb, ra), colour)
            self.face((a, b, rb), colour); self.face((c, d, ra), colour)

    def gable_roof(self, x0, z0, x1, z1, base, rise, colour, along_x, overhang=0.4, walls=None, wall_colour=None):
        """Two-pitch roof with its ridge along x (or z); `walls` receives the two gable triangles."""
        o = overhang
        top = base + rise
        if along_x:
            zc, half = (z0 + z1) / 2, (z1 - z0) / 2
            eave = base - rise * o / half
            self.poly([(x0 - o, eave, z1 + o), (x1 + o, eave, z1 + o), (x1 + o, top, zc), (x0 - o, top, zc)], colour)
            self.poly([(x1 + o, eave, z0 - o), (x0 - o, eave, z0 - o), (x0 - o, top, zc), (x1 + o, top, zc)], colour)
            if walls is not None:
                walls.poly([(x0, base, z0), (x0, base, z1), (x0, top, zc)], wall_colour)
                walls.poly([(x1, base, z1), (x1, base, z0), (x1, top, zc)], wall_colour)
        else:
            xc, half = (x0 + x1) / 2, (x1 - x0) / 2
            eave = base - rise * o / half
            self.poly([(x1 + o, eave, z1 + o), (x1 + o, eave, z0 - o), (xc, top, z0 - o), (xc, top, z1 + o)], colour)
            self.poly([(x0 - o, eave, z0 - o), (x0 - o, eave, z1 + o), (xc, top, z1 + o), (xc, top, z0 - o)], colour)
            if walls is not None:
                walls.poly([(x0, base, z1), (x1, base, z1), (xc, top, z1)], wall_colour)
                walls.poly([(x1, base, z0), (x0, base, z0), (xc, top, z0)], wall_colour)

    def mesh(self, shape, place, colour, smooth=True, rough=0.0):
        """A copy of a template shape; `place` maps its points into Blender space, `rough` jitters them."""
        points, faces = shape
        verts = []
        for p in points:
            if rough:
                k = 1 + rough * (2 * random.random() - 1)
                p = (p[0] * k, p[1] * k, p[2] * k)
            verts.append(self.bm.verts.new(place(p)))
        for indices in faces:
            face = self.bm.faces.new([verts[i] for i in indices])
            face.smooth = smooth
            for loop in face.loops:
                loop[self.tint] = (*colour, 1.0)

    def finish(self):
        mesh = bpy.data.meshes.new(self.key)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.key, mesh)
        obj.data.materials.append(MATERIALS[self.material])
        scene.collection.objects.link(obj)
        return obj


def template(op, **options):
    """Vertex positions and face indices of a bmesh primitive, for copying many times."""
    bm = bmesh.new()
    getattr(bmesh.ops, op)(bm, **options)
    bm.verts.index_update()
    shape = ([tuple(v.co) for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
    bm.free()
    return shape


def lathe(profile, segments):
    """Surface of revolution round the z axis from (height, radius) pairs, bottom to top."""
    points = [
        (r * math.cos(2 * math.pi * s / segments), r * math.sin(2 * math.pi * s / segments), h)
        for h, r in profile
        for s in range(segments)
    ]
    faces = []
    for ring in range(len(profile) - 1):
        for s in range(segments):
            a, b = ring * segments + s, ring * segments + (s + 1) % segments
            faces.append([a, b, b + segments, a + segments])
    faces.append(list(range(segments))[::-1])
    faces.append([(len(profile) - 1) * segments + s for s in range(segments)])
    return points, faces


BLOB = template("create_icosphere", subdivisions=3, radius=1.0)
SMALL_BLOB = template("create_icosphere", subdivisions=2, radius=1.0)
CYPRESS = lathe(((0.0, 0.5), (0.06, 0.86), (0.2, 1.0), (0.38, 0.94), (0.56, 0.8), (0.72, 0.58),
                 (0.86, 0.34), (0.95, 0.14), (1.0, 0.03)), 9)
TRUNK = lathe(((0.0, 1.0), (1.0, 0.7)), 7)


def place_at(x, y, z, sx, sy, sz, lean=(0.0, 0.0)):
    """Maps template points (z up) into Blender space at three.js (x, y, z), scaled and leant."""
    lx, lz = lean
    return lambda p: (x + p[0] * sx + lx * p[2] * sy, -z + p[1] * sz - lz * p[2] * sy, y + p[2] * sy)


class Wall:
    """A vertical wall plane seen from outside: `a` runs along it (x or z), `d` out of it."""

    def __init__(self, side, plane):
        self.side = side
        self.plane = plane

    def at(self, a, y, d=0.0):
        """three.js point d in front of the wall."""
        p = self.plane
        if self.side == "+z":
            return (a, y, p + d)
        if self.side == "-z":
            return (a, y, p - d)
        if self.side == "+x":
            return (p + d, y, a)
        return (p - d, y, a)

    def box(self, builder, a0, a1, y0, y1, d0, d1, colour):
        p = self.plane
        if self.side == "+z":
            builder.box(a0, y0, p + d0, a1, y1, p + d1, colour)
        elif self.side == "-z":
            builder.box(a0, y0, p - d1, a1, y1, p - d0, colour)
        elif self.side == "+x":
            builder.box(p + d0, y0, a0, p + d1, y1, a1, colour)
        else:
            builder.box(p - d1, y0, a0, p - d0, y1, a1, colour)

    def poly(self, builder, points, d, colour):
        """Polygon from (a, y) points, d in front of the wall."""
        builder.poly([self.at(a, y, d) for a, y in points], colour)


def obox(builder, x, z, heading, hu, hv, y0, y1, colour):
    """Box turned to `heading` in the ground plane, half-length hu along it, half-width hv across."""
    fx, fz = math.cos(heading), math.sin(heading)
    corners = [(x + u * fx - v * fz, z + u * fz + v * fx) for u, v in ((-hu, -hv), (hu, -hv), (hu, hv), (-hu, hv))]
    builder.poly([(cx, y1, cz) for cx, cz in corners], colour)
    for i in range(4):
        (ax, az), (bx, bz) = corners[i], corners[(i + 1) % 4]
        builder.poly([(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], colour)


def cylinder(key, x, z, y0, y1, r0, r1, segments, colour, caps=True):
    """Upright cylinder or cone, smooth round its sides."""
    builder = P[key]
    result = bmesh.ops.create_cone(builder.bm, cap_ends=caps, segments=segments, radius1=r0, radius2=r1, depth=y1 - y0)
    for v in result["verts"]:
        v.co.x += x
        v.co.y += -z
        v.co.z += (y0 + y1) / 2
    for f in {f for v in result["verts"] for f in v.link_faces}:
        f.normal_update()
        f.smooth = abs(f.normal.z) < 0.5
        for loop in f.loops:
            loop[builder.tint] = (*colour, 1.0)


# --- palette --------------------------------------------------------------


def rgb(hex_value):
    """sRGB hex to linear RGB."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(v) for v in ((hex_value >> 16) & 255, (hex_value >> 8) & 255, hex_value & 255))


def lighter(colour, amount):
    """A linear colour mixed toward white."""
    return tuple(c + (1 - c) * amount for c in colour)


random.seed(7)
pick = random.choice
P = {key: Builder(key) for key in MATERIALS}

# Shared with src/station/town.ts, so the live town and the painted one meet without a seam.
WALL_TINTS = [rgb(h) for h in (0xFFF4E6, 0xFFE1B0, 0xFFE9CF, 0xF4C28A, 0xF6ECE0, 0xE7A283, 0xFFF8EA, 0xF2D2B6)]
ROOF_TINTS = [rgb(h) for h in (0xF2B49A, 0xE8A487, 0xF5C2A8, 0xE0A080, 0xEBB59C)]
SHUTTER_TINTS = [rgb(h) for h in (0x4F6B42, 0x5E7D4F, 0x3F5A6B, 0x6B4A32, 0x7A8A6A)]
GLASS = rgb(0x1A2228)
WHITE = rgb(0xFFFFFF)

# The Italian core: green and blue louvred shutters (the shared set without its brown),
# stucco surrounds, dressed stone.
ITALIAN_SHUTTERS = [t for t in SHUTTER_TINTS if t != rgb(0x6B4A32)] + [rgb(0x4E6E86)]
SHUTTER_STATES = ("open", "open", "open", "half", "closed")
STUCCO = rgb(0xFBF6EC)
STONE = rgb(0xF4EEE2)
DOORS = [rgb(h) for h in (0x4A3426, 0x5A3E2C, 0x3E4A3A, 0x3A4656)]
SHOP = rgb(0x231F1C)
CLOTH = [rgb(h) for h in (0xE8DCC0, 0xB0573E, 0x5A7352, 0xC9A050, 0x9FB0B8)]
LAUNDRY = [rgb(h) for h in (0xF6F4EE, 0xEDE6D6, 0xC9D6E0, 0xE8C8C0, 0xD9D2A8)]
IRON = rgb(0x262626)

# The Turkish quarter: limewash over rubble stone, blue paint, timber, bougainvillea.
LIME = [rgb(h) for h in (0xFFFFFF, 0xF8F6F0, 0xF3F1EA, 0xFAF5EA, 0xEFF1EF)]
RUBBLE = rgb(0xF4ECE0)
BLUES = [rgb(h) for h in (0x2E5C8A, 0x3A6FA0, 0x25507E, 0x3D84A0, 0x4E7EB2)]
CUMBA_WOOD = [rgb(h) for h in (0xFFFFFF, 0xE8D8C6, 0xCFBBA6)]
CUMBA_PAINT = [rgb(h) for h in (0xEAE0CA, 0xD9BF8A, 0xA9B9C2, 0xC48E70)]
BLOOMS = [rgb(h) for h in (0xB8306E, 0xC4407F, 0xA82A66, 0xD0538D)]
LEAVES = rgb(0x4E6A34)

# The American harbour: clapboard and shingle, white trim, weathered wood.
CLAPBOARD = [rgb(h) for h in (0xF4F3EE, 0xEDEBE4, 0xAAAEB1, 0x8F969A, 0xA8BDCC, 0xBACAD6, 0xC6D3DB)]
TRIM = rgb(0xF7F6F1)
SHINGLES = [rgb(h) for h in (0x4C4E50, 0x5B5954, 0x434548, 0x6A665F)]
PLANK_TINTS = [rgb(h) for h in (0xC9C3B6, 0xB9B4A8, 0xD6D0C4)]
US_DOORS = [rgb(h) for h in (0x7A2E28, 0x2F4A3A, 0x2A3A4E, 0x5A4632)]
US_SHUTTERS = [rgb(h) for h in (0x1F2A26, 0x24303A, 0x2F3B2E)]
FOUNDATION = rgb(0xD8D0C2)
PORCH_FLOOR = rgb(0x8E918F)
BRICK = rgb(0xB0624A)
BOAT_DOOR = rgb(0x3A3A36)
DECK = rgb(0xCFC8BA)
PILE = rgb(0x4A3D31)
QUAY = rgb(0xE2DACB)
HULL_WHITE, HULL_BLUE, HULL_NAVY, HULL_RED, HULL_PALE = (rgb(h) for h in (0xF2F2EE, 0x2C5A8C, 0x1E3A5A, 0xA8322C, 0x86AACA))
BOAT_DECK = rgb(0xB89C78)
TOWER_WHITE = rgb(0xF7F5EF)
BLACK = rgb(0x161616)
LANTERN = rgb(0x2A3236)
KEEPER_ROOF = rgb(0x8E3A2F)

# Plants.
CYPRESS_GREENS = [rgb(h) for h in (0x2C4426, 0x324B2A, 0x2A3F24)]
OLIVE_GREENS = [rgb(h) for h in (0x7D8662, 0x878F6A, 0x6F7A55)]
PINE_GREENS = [rgb(h) for h in (0x3C5232, 0x46593A, 0x384C2E)]
PLANE_GREENS = [rgb(h) for h in (0x587534, 0x62803C, 0x4E6A30)]
SCRUB = [rgb(h) for h in (0x5A6440, 0x667048, 0x4F5A3A)]
BARK = rgb(0x4A3A2C)
PLANE_BARK = rgb(0xA49C86)
BOULDERS = [rgb(h) for h in (0x8F887C, 0x9C9586, 0x7E786E)]

# --- terrain --------------------------------------------------------------


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


def fbm(x, z, octaves=4):
    """Layered value noise in 0..1 (mean 0.5), for rock that is rough at every scale."""
    total, amplitude, frequency, norm = 0.0, 1.0, 1.0, 0.0
    for i in range(octaves):
        total += amplitude * noise2(x * frequency + 17.3 * i, z * frequency - 9.1 * i)
        norm += amplitude
        amplitude *= 0.5
        frequency *= 2.03
    return total / norm


def height(x, z):
    """Ground height (three.js y) at (x, z): the hill climbs behind the square."""
    up = max(0.0, -z + NEAR_EDGE_Z)
    side = max(0.0, x - 38.0)
    h = PLAZA_Y - 0.2 + 0.2 * smoothstep(0, 4, up + side) + 0.26 * up + 0.2 * side
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
    cliff = (rgb(0xA8A08E), rgb(0x978F80))
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            x0, x1, z0, z1 = xs[i], xs[i + 1], zs[j], zs[j + 1]
            corners = (grid[(x0, z1)], grid[(x1, z1)], grid[(x1, z0)], grid[(x0, z0)])
            ys = [v.co.z for v in corners]
            # The face over the promenade, where the hill meets the road shelf, is bare limestone.
            steep = (max(ys) - min(ys)) / step > 1.2
            h = height((x0 + x1) / 2, (z0 + z1) / 2)
            dry = noise2(x0 / 40, z0 / 40)
            colour = rgb(0x8C8A55) if dry < 0.45 else rgb(0xA39466) if dry < 0.7 else rgb(0x6F7A48)
            if h < SEA_Y + 1.5:
                colour = rgb(0xB8AC92)  # pale rock and sand at the shore
            elif steep:
                colour = cliff[0] if noise2(x0 / 9, z0 / 9) < 0.5 else cliff[1]
            face = bm.bm.faces.new(corners)
            face.smooth = not steep
            for loop in face.loops:
                loop[bm.tint] = (*colour, 1.0)


# --- building parts -------------------------------------------------------

FOOTPRINTS = []


def occupy(x0, z0, x1, z1):
    FOOTPRINTS.append((x0, z0, x1, z1))


def clear_of(x, z, margin):
    """True when (x, z) is at least `margin` from every building."""
    for x0, z0, x1, z1 in FOOTPRINTS:
        if x0 - margin < x < x1 + margin and z0 - margin < z < z1 + margin:
            return False
    return True


def window(wall, a, y, w, h, frame=None, shutter=None, state="open", sill=None, bars=False):
    """Window centred at a with its bottom at y: glass, then a surround, sill, shutters or bars.

    `frame` and `sill` are (material key, colour); `state` is open, half or closed.
    """
    wall.box(P["glass"], a - w / 2, a + w / 2, y, y + h, -0.03, 0.015, GLASS)
    if frame is not None:
        key, colour = frame
        wall.box(P[key], a - w / 2 - 0.12, a - w / 2, y, y + h, 0.0, 0.07, colour)
        wall.box(P[key], a + w / 2, a + w / 2 + 0.12, y, y + h, 0.0, 0.07, colour)
        wall.box(P[key], a - w / 2 - 0.12, a + w / 2 + 0.12, y + h, y + h + 0.16, 0.0, 0.09, colour)
    if sill is not None:
        key, colour = sill
        wall.box(P[key], a - w / 2 - 0.1, a + w / 2 + 0.1, y - 0.1, y, 0.0, 0.14, colour)
    if bars:
        for k in (-1, 0, 1):
            b = a + k * w / 3.2
            wall.box(P["metal"], b - 0.015, b + 0.015, y, y + h, 0.03, 0.06, IRON)
    if shutter is not None:
        leaf = w / 2 + 0.02
        gap = 0.13 if frame is not None else 0.02
        if state == "closed":
            wall.box(P["shutter"], a - w / 2, a + w / 2, y, y + h, 0.015, 0.06, shutter)
            return
        if state == "half":
            wall.box(P["shutter"], a - w / 2, a, y, y + h, 0.015, 0.06, shutter)
        else:
            wall.box(P["shutter"], a - w / 2 - gap - leaf, a - w / 2 - gap, y, y + h, 0.01, 0.05, shutter)
        wall.box(P["shutter"], a + w / 2 + gap, a + w / 2 + gap + leaf, y, y + h, 0.01, 0.05, shutter)


def arch(a, y, w, h, n=8):
    """Outline of an arched opening (straight jambs, a round head), counter-clockwise."""
    r = w / 2
    spring = y + h - r
    points = [(a - r, y), (a + r, y)]
    points += [(a + r * math.cos(math.pi * i / n), spring + r * math.sin(math.pi * i / n)) for i in range(n + 1)]
    return points


def arched_opening(wall, a, y, w, h, surround, fill=SHOP, fill_key="glass"):
    """An arched shop front or doorway in a dressed surround."""
    wall.poly(P["stone"], arch(a, y, w + 0.36, h + 0.18), 0.02, surround)
    wall.poly(P[fill_key], arch(a, y, w, h), 0.045, fill)


def awning(wall, a, w, y, colour):
    """Plain cloth awning over a shop front, its valance hanging at the front."""
    lo, hi = a - w / 2 - 0.15, a + w / 2 + 0.15
    out, drop = 1.25, 0.55
    P["cloth"].poly([wall.at(lo, y + 0.2, 0.0), wall.at(hi, y + 0.2, 0.0), wall.at(hi, y + 0.2 - drop, out),
                     wall.at(lo, y + 0.2 - drop, out)], colour)
    P["cloth"].poly([wall.at(lo, y + 0.2 - drop, out), wall.at(hi, y + 0.2 - drop, out),
                     wall.at(hi, y - 0.05 - drop, out), wall.at(lo, y - 0.05 - drop, out)], colour)


def balcony(wall, a, y, w):
    """Stone slab on brackets with a wrought-iron railing."""
    depth = 0.75
    wall.box(P["stone"], a - w / 2, a + w / 2, y - 0.16, y, 0.0, depth, STONE)
    for s in (-1, 1):
        b = a + s * (w / 2 - 0.25)
        wall.box(P["stone"], b - 0.08, b + 0.08, y - 0.45, y - 0.16, 0.0, depth * 0.6, STONE)
    n = int(w / 0.15)
    for k in range(n + 1):
        b = a - w / 2 + 0.05 + k * (w - 0.1) / n
        wall.box(P["metal"], b - 0.015, b + 0.015, y, y + 0.95, depth - 0.06, depth - 0.03, IRON)
    for edge in (a - w / 2 + 0.035, a + w / 2 - 0.065):
        for k in range(4):
            d = 0.08 + k * (depth - 0.14) / 3
            wall.box(P["metal"], edge, edge + 0.03, y, y + 0.95, d - 0.015, d + 0.015, IRON)
        wall.box(P["metal"], edge, edge + 0.03, y + 0.93, y + 0.99, 0.0, depth, IRON)
    wall.box(P["metal"], a - w / 2 + 0.03, a + w / 2 - 0.03, y + 0.93, y + 0.99, depth - 0.08, depth - 0.01, IRON)


def laundry(wall, a0, a1, y):
    """A line of washing strung between two windows."""
    wall.box(P["metal"], a0, a1, y, y + 0.02, 0.32, 0.34, IRON)
    a = a0 + 0.2
    while True:
        w = 0.3 + random.random() * 0.5
        if a + w > a1 - 0.1:
            break
        wall.box(P["cloth"], a, a + w, y - 0.35 - random.random() * 0.45, y, 0.31, 0.33, pick(LAUNDRY))
        a += w + 0.08 + random.random() * 0.25


def chimney(key, x, z, y0, y1, colour, cap):
    """A chimney stack with a slab cap, and on some a little tiled hood."""
    w = 0.45 + random.random() * 0.25
    P[key].box(x - w / 2, y0, z - 0.3, x + w / 2, y1, z + 0.3, colour)
    P["stone"].box(x - w / 2 - 0.1, y1, z - 0.4, x + w / 2 + 0.1, y1 + 0.1, z + 0.4, cap)
    if random.random() < 0.5:
        P[key].box(x - 0.08, y1 + 0.1, z - 0.08, x + 0.08, y1 + 0.32, z + 0.08, colour)
        P["roof"].hip_roof(x - w / 2 - 0.12, z - 0.42, x + w / 2 + 0.12, z + 0.42, y1 + 0.32, 0.28, pick(ROOF_TINTS))


def parapet(key, x0, z0, x1, z1, y, h, colour, t=0.25):
    """Low wall round a flat roof."""
    P[key].box(x0, y, z0, x1, y + h, z0 + t, colour)
    P[key].box(x0, y, z1 - t, x1, y + h, z1, colour)
    P[key].box(x0, y, z0, x0 + t, y + h, z1, colour)
    P[key].box(x1 - t, y, z0, x1, y + h, z1, colour)


def rake(wall, a0, a1, base, rise, colour, overhang):
    """White barge boards under both edges of a gable end."""
    ac, half = (a0 + a1) / 2, (a1 - a0) / 2
    drop = rise * overhang / half
    left, right, peak = (a0 - overhang, base - drop), (a1 + overhang, base - drop), (ac, base + rise)
    for p, q in ((left, peak), (peak, right)):
        wall.poly(P["shutter"], [(p[0], p[1] - 0.22), (q[0], q[1] - 0.22), q, p], overhang - 0.03, colour)


def cumba(wall, a, base, storey, width):
    """A closed timber bay window jettied out from an upper floor on stepped brackets."""
    painted_wood = random.random() < 0.35
    key = "shutter" if painted_wood else "timber"
    colour = pick(CUMBA_PAINT) if painted_wood else pick(CUMBA_WOOD)
    trim = lighter(colour, 0.35) if painted_wood else WHITE
    out = 0.7 + random.random() * 0.25
    y0, y1 = base + 0.1, base + storey - 0.05
    lo, hi = a - width / 2, a + width / 2
    wall.box(P[key], lo, hi, y0, y1, 0.0, out, colour)
    wall.box(P[key], lo + 0.12, hi - 0.12, y0 - 0.26, y0, 0.0, out * 0.66, colour)
    wall.box(P[key], lo + 0.24, hi - 0.24, y0 - 0.5, y0 - 0.26, 0.0, out * 0.33, colour)
    wall.box(P[key], lo - 0.08, hi + 0.08, y1, y1 + 0.13, 0.0, out + 0.1, trim)
    panes = 3 if width > 2.8 else 2
    pane = (width - 0.3) / panes
    g0, g1 = y0 + 0.8, y1 - 0.3
    for i in range(panes):
        c = lo + 0.15 + (i + 0.5) * pane
        wall.box(P["glass"], c - pane / 2 + 0.09, c + pane / 2 - 0.09, g0, g1, out - 0.01, out + 0.015, GLASS)
    for edge in (lo, hi):
        wall.box(P["glass"], edge - 0.015, edge + 0.015, g0, g1, 0.16, out - 0.16, GLASS)
    wall.box(P[key], lo - 0.03, hi + 0.03, g0 - 0.09, g0, 0.0, out + 0.04, trim)


def bougainvillea(wall, a, ground, reach):
    """Bougainvillea climbing a wall from the door to the roof: magenta bracts over a little green.

    It climbs the full `reach`, so the masses near the top still show over the roofs in front.
    """
    flat = (1.3, 0.5) if wall.side in ("+z", "-z") else (0.5, 1.3)
    x, y, z = wall.at(a, ground + 1.2, 0.35)
    P["foliage"].mesh(SMALL_BLOB, place_at(x, y, z, 0.9 * flat[0], 1.1, 0.9 * flat[1]), LEAVES, rough=0.25)
    masses = 3 + random.randrange(3)
    for i in range(masses):
        r = 0.55 + random.random() * 0.5
        rise = (i + 0.3 + random.random() * 0.6) / masses
        x, y, z = wall.at(a + (random.random() - 0.5) * 1.6, ground + 1.0 + rise * (reach - 1.2), r * 0.3)
        P["bloom"].mesh(SMALL_BLOB, place_at(x, y, z, r * flat[0], r * 0.85, r * flat[1]), pick(BLOOMS), rough=0.28)


# --- the three quarters ---------------------------------------------------


def italian_house(x0, x1, z0, z1, floors, ground, flank=False):
    """Pastel plaster house: arched shop fronts or a stone doorway, shuttered windows, a cornice, terracotta."""
    occupy(x0, z0, x1, z1)
    cz = (z0 + z1) / 2
    storey = 3.0 + random.random() * 0.4
    top = ground + floors * storey + 0.45
    tint = pick(WALL_TINTS)
    P["plaster"].box(x0, ground - 4, z0, x1, top, z1, tint)
    P["stone"].box(x0 - 0.05, ground - 4, z0 - 0.05, x1 + 0.05, ground + 0.5, z1 + 0.05, STONE)
    if floors > 2 and random.random() < 0.6:  # string course over the shop floor
        P["stone"].box(x0 - 0.05, ground + storey + 0.15, z0 - 0.05, x1 + 0.05, ground + storey + 0.32, z1 + 0.05, STONE)
    front = Wall("+z", z1)
    span = x1 - x0
    shutter = pick(ITALIAN_SHUTTERS)
    surround = ("plaster", STUCCO) if random.random() < 0.6 else ("plaster", lighter(tint, 0.45))
    sill = ("stone", STONE)
    if random.random() < 0.55:
        shops = max(1, int(span / 2.8))
        for i in range(shops):
            a = x0 + (i + 0.5) * span / shops
            w = min(2.1, span / shops - 0.8)
            arched_opening(front, a, ground + 0.35, w, 2.85, STONE)
            if random.random() < 0.4:
                awning(front, a, w, ground + 3.2, pick(CLOTH))
    else:
        per = max(1, int(span / 2.4))
        for i in range(per):
            a = x0 + (i + 0.5) * span / per
            if i == per // 2:
                arched_opening(front, a, ground + 0.35, 1.3, 2.6, STONE, fill=pick(DOORS), fill_key="shutter")
            else:
                window(front, a, ground + 1.2, 0.9, 1.4, frame=surround, shutter=shutter, state=pick(SHUTTER_STATES),
                       sill=sill, bars=True)
    per = max(1, int(span / 2.4))
    for f in range(1, floors):
        y = ground + f * storey + 0.75
        small = f == floors - 1 and floors >= 4  # low attic windows under the eaves
        for i in range(per):
            a = x0 + (i + 0.5) * span / per
            if not small and f <= 2 and random.random() < 0.2:
                window(front, a, y - 0.55, 1.0, 2.15, frame=surround, shutter=shutter, state="open")
                balcony(front, a, y - 0.55, 1.7)
            else:
                window(front, a, y, 0.9, 1.0 if small else 1.4, frame=surround, shutter=shutter,
                       state=pick(SHUTTER_STATES), sill=sill)
        if per >= 2 and random.random() < 0.12:
            laundry(front, x0 + span / per * 0.5 + 0.65, x0 + span / per * 1.5 - 0.65, y - 0.3)
    if flank:  # a gap beside the house shows its flank to the square
        side = Wall("-x", x0)
        for f in range(1, floors):
            window(side, z1 - 1.4, ground + f * storey + 0.75, 0.9, 1.4, frame=surround, shutter=shutter, sill=sill)
    P["plaster"].box(x0 - 0.2, top - 0.32, z0 - 0.2, x1 + 0.2, top, z1 + 0.2, STUCCO)  # cornice
    roll = random.random()
    roof = pick(ROOF_TINTS)
    lift = (random.uniform(-0.12, 0.12), random.uniform(-0.12, 0.12))
    if roll < 0.14:  # a roof terrace, some with a little tiled loggia at the back
        parapet("plaster", x0, z0, x1, z1, top, 0.9, tint)
        if random.random() < 0.45 and span > 4.4:
            lx0 = x0 + 0.4 + random.random() * max(0.0, span - 4.6)
            lx1 = min(x1 - 0.4, lx0 + 3.6)
            lz0, lz1 = z0 + 0.4, z0 + 0.4 + min(3.2, (z1 - z0) * 0.45)
            for px in (lx0, lx1 - 0.25):
                for pz in (lz0, lz1 - 0.25):
                    P["plaster"].box(px, top, pz, px + 0.25, top + 2.4, pz + 0.25, tint)
            P["roof"].hip_roof(lx0 - 0.3, lz0 - 0.3, lx1 + 0.3, lz1 + 0.3, top + 2.4, 0.9, roof)
        ridge = top + 1.0
    elif roll < 0.36:  # ridge along the street, eaves over it
        rise = (z1 - z0) / 2 * (0.42 + random.random() * 0.12)
        P["roof"].gable_roof(x0, z0, x1, z1, top, rise, roof, along_x=True, overhang=0.45,
                             walls=P["plaster"], wall_colour=tint)
        ridge = top + rise
    else:
        rise = 1.4 + random.random() * 1.2
        P["roof"].hip_roof(x0 - 0.45, z0 - 0.45, x1 + 0.45, z1 + 0.45, top, rise, roof, lift=lift)
        ridge = top + rise
    for _ in range(1 if random.random() < 0.6 else 2):
        chx = x0 + 0.8 + random.random() * max(0.1, span - 1.6)
        chimney("plaster", chx, cz + (random.random() - 0.5) * 2.0, top, ridge + 0.5 + random.random() * 0.8, tint, STONE)


def turkish_house(x0, x1, z0, z1, floors, ground, side="+z", flank=False):
    """Whitewashed rubble-stone house: blue door and shutters, often a timber cumba, a flat or shallow roof."""
    occupy(x0, z0, x1, z1)
    storey = 2.85 + random.random() * 0.3
    top = ground + floors * storey + 0.3
    natural = random.random() < 0.14
    key = "rubble" if natural else "whitewash"
    tint = RUBBLE if natural else pick(LIME)
    P[key].box(x0, ground - 4, z0, x1, top, z1, tint)
    front = Wall(side, z1 if side == "+z" else x0)
    a0, a1 = (x0, x1) if side == "+z" else (z0, z1)
    span = a1 - a0
    blue = pick(BLUES)
    frame = ("shutter", blue) if random.random() < 0.35 else None
    # The ground floor: a door, sometimes under a stone arch, and small barred windows.
    door = a0 + span * (0.25 + random.random() * 0.5)
    if random.random() < 0.4:
        arched_opening(front, door, ground + 0.15, 1.2, 2.4, STONE if natural else tint, fill=blue, fill_key="shutter")
    else:
        front.box(P["shutter"], door - 0.55, door + 0.55, ground + 0.15, ground + 2.3, -0.02, 0.05, blue)
        front.box(P["stone"], door - 0.72, door + 0.72, ground + 2.3, ground + 2.48, 0.0, 0.1, STONE)
    for a in (a0 + 1.0, a1 - 1.0):
        if abs(a - door) > 1.7:
            window(front, a, ground + 1.15, 0.7, 0.95, frame=frame, bars=True, sill=("stone", STONE))
    # Upper floors: shuttered windows and, on the wider houses, a cumba over the lane, usually on
    # the top floor, the part of a hillside house that shows over the roofs in front of it.
    cumba_floor = None
    if floors >= 2 and span >= 4.6 and random.random() < 0.65:
        cumba_floor = floors - 1 if random.random() < 0.75 else random.randrange(1, floors)
    for f in range(1, floors):
        base = ground + f * storey
        if f == cumba_floor:
            width = min(3.6, span - 1.6)
            centre = a0 + span / 2 + (random.random() - 0.5) * max(0.0, span - width - 1.6)
            cumba(front, centre, base, storey, width)
            places = [a for a in (a0 + 0.9, a1 - 0.9) if abs(a - centre) > width / 2 + 1.0]
        else:
            per = max(1, int(span / 2.2))
            places = [a0 + (i + 0.5) * span / per for i in range(per)]
        for a in places:
            window(front, a, base + 0.85, 0.8, 1.25, frame=frame, shutter=blue,
                   state=pick(("open", "open", "half", "closed")))
    if flank:
        side_wall = Wall("-x", x0)
        for f in range(floors):
            window(side_wall, z1 - 1.3, ground + f * storey + (1.15 if f == 0 else 0.85), 0.7, 1.1, shutter=blue)
    # Roof: flat behind a low parapet, sometimes with a roof room set back, or shallow tiles.
    if random.random() < 0.62:
        parapet(key, x0, z0, x1, z1, top, 0.55, tint, 0.22)
        if random.random() < 0.3 and span > 5.0:
            if side == "+z":  # set back toward the rear of the house
                rx0 = x0 + 0.3 + random.random() * (x1 - x0) * 0.4
                rx1, rz0, rz1 = rx0 + (x1 - x0) * 0.5, z0 + 0.3, z0 + (z1 - z0) * 0.5
                room, ra = Wall("+z", rz1), (rx0 + rx1) / 2
            else:
                rx0, rx1 = x0 + (x1 - x0) * 0.5, x1 - 0.3
                rz0 = z0 + 0.3 + random.random() * (z1 - z0) * 0.4
                rz1 = rz0 + (z1 - z0) * 0.5
                room, ra = Wall("-x", rx0), (rz0 + rz1) / 2
            P[key].box(rx0, top, rz0, rx1, top + 2.6, rz1, tint)
            parapet(key, rx0, rz0, rx1, rz1, top + 2.6, 0.35, tint, 0.18)
            window(room, ra, top + 0.9, 0.75, 1.1, frame=frame, shutter=blue)
        if random.random() < 0.5:
            chimney(key, x0 + 0.6 + random.random() * (x1 - x0 - 1.2), z0 + 0.6 + random.random() * (z1 - z0 - 1.2),
                    top, top + 1.3, tint, WHITE)
    else:
        P["roof"].hip_roof(x0 - 0.35, z0 - 0.35, x1 + 0.35, z1 + 0.35, top, 0.75 + random.random() * 0.45,
                           pick(ROOF_TINTS), lift=(random.uniform(-0.08, 0.08), random.uniform(-0.08, 0.08)))
    if random.random() < 0.38:
        bougainvillea(front, a0 + span * (0.12 + random.random() * 0.76), ground, top - ground)


def american_house(x0, x1, z0, z1, ground, side="+z", storeys=2, tint=None, roof=None):
    """Clapboard house on a stone foundation under a steep gable, with a porch to the water."""
    occupy(x0, z0, x1, z1)
    floor = ground + 0.7
    top = floor + storeys * 2.7
    tint = tint or pick(CLAPBOARD)
    roof = roof or pick(SHINGLES)
    P["stone"].box(x0 - 0.05, ground - 3.0, z0 - 0.05, x1 + 0.05, floor, z1 + 0.05, FOUNDATION)
    P["clapboard"].box(x0, floor, z0, x1, top, z1, tint)
    for cx in (x0, x1):
        for cz in (z0, z1):
            P["shutter"].box(cx - 0.09, floor, cz - 0.09, cx + 0.09, top, cz + 0.09, TRIM)
    front = Wall(side, z1 if side == "+z" else x0)
    a0, a1 = (x0, x1) if side == "+z" else (z0, z1)
    span = a1 - a0
    # Side gable (ridge along the front) or front gable (the gable end faces the water).
    front_gable = random.random() < 0.45
    along_x = (side == "+z") != front_gable
    depth = (z1 - z0) if along_x else (x1 - x0)
    rise = depth / 2 * (1.0 + random.random() * 0.3)
    o = 0.35
    P["shingle"].gable_roof(x0, z0, x1, z1, top, rise, roof, along_x=along_x, overhang=o,
                            walls=P["clapboard"], wall_colour=tint)
    # The gable end the town sees gets white barge boards and an attic window.
    end, e0, e1 = (Wall("+x", x1), z0, z1) if along_x else (Wall("+z", z1), x0, x1)
    rake(end, e0, e1, top, rise, TRIM, o)
    if rise > 1.8:
        window(end, (e0 + e1) / 2, top + 0.35, 0.75, 1.0, frame=("shutter", TRIM))
    if not front_gable:  # fascia along the front eave
        drop = rise * o / (depth / 2)
        front.box(P["shutter"], a0 - o, a1 + o, top - drop - 0.2, top - drop, o - 0.05, o + 0.01, TRIM)
    # The porch: a deck on white posts under a shed roof, with a railing open at the steps.
    pa0 = a0 + (0.25 if random.random() < 0.6 else span * 0.35)
    pa1 = a1 - 0.25
    deep, deck = 2.1, floor - 0.12
    door = (pa0 + pa1) / 2
    front.box(P["shutter"], pa0, pa1, deck - 0.25, deck, 0.0, deep, PORCH_FLOOR)
    posts = max(2, int((pa1 - pa0) / 2.2) + 1)
    for k in range(posts):
        b = pa0 + 0.08 + k * (pa1 - pa0 - 0.16) / (posts - 1)
        front.box(P["shutter"], b - 0.08, b + 0.08, deck, deck + 2.55, deep - 0.22, deep - 0.06, TRIM)
    P["shingle"].poly([front.at(pa0 - 0.12, deck + 2.85, 0.0), front.at(pa1 + 0.12, deck + 2.85, 0.0),
                       front.at(pa1 + 0.12, deck + 2.55, deep + 0.2), front.at(pa0 - 0.12, deck + 2.55, deep + 0.2)], roof)
    front.box(P["shutter"], pa0 - 0.12, pa1 + 0.12, deck + 2.38, deck + 2.56, deep - 0.06, deep + 0.2, TRIM)
    for r0, r1 in ((pa0 + 0.1, door - 0.7), (door + 0.7, pa1 - 0.1)):
        if r1 - r0 < 0.3:
            continue
        front.box(P["shutter"], r0, r1, deck + 0.85, deck + 0.93, deep - 0.18, deep - 0.1, TRIM)
        front.box(P["shutter"], r0, r1, deck + 0.08, deck + 0.14, deep - 0.18, deep - 0.1, TRIM)
        n = max(1, int((r1 - r0) / 0.3))
        for k in range(1, n):
            b = r0 + k * (r1 - r0) / n
            front.box(P["shutter"], b - 0.025, b + 0.025, deck + 0.14, deck + 0.85, deep - 0.16, deep - 0.12, TRIM)
    for k in range(3):
        front.box(P["stone"], door - 0.6, door + 0.6, ground - 0.5, deck - 0.19 * (k + 1), deep + 0.3 * k,
                  deep + 0.3 * (k + 1), FOUNDATION)
    front.box(P["shutter"], door - 0.48, door + 0.48, floor, floor + 2.15, -0.02, 0.05, pick(US_DOORS))
    front.box(P["shutter"], door - 0.6, door + 0.6, floor + 2.15, floor + 2.3, 0.0, 0.07, TRIM)
    # Tall double-hung windows in white trim, dark shutters on some houses.
    shutter = pick(US_SHUTTERS) if random.random() < 0.6 else None
    per = max(2, int(span / 1.9))
    for i in range(per):
        a = a0 + (i + 0.5) * span / per
        if abs(a - door) > 1.0:
            window(front, a, floor + 0.75, 0.8, 1.45, frame=("shutter", TRIM), shutter=shutter)
        if storeys >= 2:
            window(front, a, floor + 2.7 + 0.7, 0.8, 1.4, frame=("shutter", TRIM), shutter=shutter)
    if along_x:
        chimney("stone", x0 + (x1 - x0) * (0.25 if random.random() < 0.5 else 0.75), (z0 + z1) / 2, top,
                top + rise + 0.8, BRICK, BRICK)
    else:
        chimney("stone", (x0 + x1) / 2, z0 + (z1 - z0) * 0.3, top, top + rise + 0.8, BRICK, BRICK)


def boathouse(x0, x1, z0, z1, floor_y, water, ground_at):
    """Boathouse on piles, its gable end and boat door to the water and a slipway down into it."""
    occupy(x0, z0, x1, z1)
    planked = random.random() < 0.4
    key = "planks" if planked else "clapboard"
    tint = pick(PLANK_TINTS) if planked else pick(CLAPBOARD)
    top = floor_y + 3.1 + random.random() * 0.5
    P[key].box(x0, floor_y, z0, x1, top, z1, tint)
    P["shutter"].box(x0 - 0.12, floor_y - 0.32, z0 - 0.12, x1 + 0.12, floor_y, z1 + 0.12, PILE)
    px = x0 + 0.2
    while px <= x1 - 0.2 + 1e-6:
        for pz in (z0 + 0.2, (z0 + z1) / 2, z1 - 0.2):
            if ground_at(px, pz) < floor_y - 0.5:
                P["shutter"].box(px - 0.15, SEA_Y - 1.0, pz - 0.15, px + 0.15, floor_y - 0.3, pz + 0.15, PILE)
        px += 2.3
    along_x = water in ("-x", "+x")
    span = (z1 - z0) if along_x else (x1 - x0)
    rise = span / 2 * (1.0 + random.random() * 0.25)
    o = 0.3
    P["shingle"].gable_roof(x0, z0, x1, z1, top, rise, pick(SHINGLES), along_x=along_x, overhang=o,
                            walls=P[key], wall_colour=tint)
    gable = Wall(water, {"-x": x0, "+x": x1, "+z": z1, "-z": z0}[water])
    g0, g1 = (z0, z1) if along_x else (x0, x1)
    gc, door = (g0 + g1) / 2, span * 0.34
    gable.box(P["shutter"], gc - door, gc + door, floor_y, floor_y + 2.7, -0.02, 0.05, BOAT_DOOR)
    gable.box(P["shutter"], gc - door - 0.14, gc + door + 0.14, floor_y + 2.7, floor_y + 2.86, 0.0, 0.08, TRIM)
    window(gable, gc, top + 0.3, 0.7, 0.85, frame=("shutter", TRIM))
    rake(gable, g0, g1, top, rise, TRIM, o)
    P["planks"].poly([gable.at(gc - door, floor_y - 0.3, 0.1), gable.at(gc + door, floor_y - 0.3, 0.1),
                      gable.at(gc + door, SEA_Y - 0.5, 3.8), gable.at(gc - door, SEA_Y - 0.5, 3.8)], PLANK_TINTS[0])
    # The long side toward the town: a door and a window.
    side, s0, s1 = (Wall("+z", z1), x0, x1) if along_x else (Wall("+x", x1), z0, z1)
    entry = s0 + (s1 - s0) * 0.68
    side.box(P["shutter"], entry - 0.45, entry + 0.45, floor_y, floor_y + 2.1, -0.02, 0.05, BOAT_DOOR)
    window(side, s0 + (s1 - s0) * 0.3, floor_y + 1.1, 0.8, 1.0, frame=("shutter", TRIM))
    for cx in (x0, x1):
        for cz in (z0, z1):
            P["shutter"].box(cx - 0.08, floor_y, cz - 0.08, cx + 0.08, top, cz + 0.08, TRIM)


#: Gaps left in the Turkish rows for two small squares, each under an old plane tree.
SQUARES = {5: (15.0, 31.0), 8: (43.0, 57.0)}


def hillside():
    """Rows climbing behind the square: the Italian core below, the Turkish quarter above and to the right."""
    # The hill is gentle, so from the seat each row hides most of the one behind it: the Italian
    # core stays two or three floors high (it is mostly behind the live row anyway) and lets the
    # upper floors of the Turkish quarter show above it. Row 3 is where the two quarters mingle.
    for k in range(13):
        row = -40.0 - 11.0 * k
        x = -14.0 + 1.5 * min(k, 7) + random.random() * 3
        last = -1e9
        while x < 92:
            turkish = k >= 4 or x > 42 or (k == 3 and random.random() < 0.45)
            width = (4.5 + random.random() * 3.5) if turkish else (5 + random.random() * 4)
            square = SQUARES.get(k)
            if square and x < square[1] and x + width > square[0]:
                x = square[1] + 0.5
                continue
            ground_here = height(x + width / 2, row)
            density = 0.86 if k < 10 else 0.55
            if random.random() < density and ground_here < PLAZA_Y + 46:
                front = row - random.random() * (2.8 if turkish else 1.5)
                depth = (6 + random.random() * 2.5) if turkish else (7 + random.random() * 2)
                z0 = front - depth
                cx = x + width / 2
                ground = min(height(x, front), height(x + width, front), height(cx, front - depth / 2))
                flank = x - last > 1.2 and x > 25
                if turkish:
                    floors = pick((1, 2, 2, 3) if k >= 10 else (2, 2, 3, 3))
                    turkish_house(x, x + width, z0, front, floors, ground, flank=flank)
                else:
                    floors = pick(((2, 3, 3, 4), (2, 3, 3), (2, 2, 3), (2, 2, 3))[k])
                    italian_house(x, x + width, z0, front, floors, ground, flank=flank)
                last = x + width
            x += width + 0.4 + random.random() * 2.2
    # The slope on the right, behind the market street: Turkish houses stepping up, facing the square.
    for column in (45.0, 57.0, 70.0, 84.0, 98.0):
        z = -35.0 + random.random() * 2
        while z < -1:
            depth = 5 + random.random() * 3
            if random.random() < 0.78:
                x0 = column + random.random() * 2
                w = 6.5 + random.random() * 2
                ground = min(height(x0, z), height(x0, z + depth), height(x0 + w / 2, z + depth / 2))
                turkish_house(x0, x0 + w, z, z + depth, pick((1, 2, 2, 3)), ground, side="-x")
            z += depth + 0.5 + random.random() * 2


# --- the harbour ------------------------------------------------------------


def lamp(x, y, z):
    """Cast-iron street lamp."""
    P["metal"].box(x - 0.14, y, z - 0.14, x + 0.14, y + 0.5, z + 0.14, IRON)
    P["metal"].box(x - 0.06, y, z - 0.06, x + 0.06, y + 3.4, z + 0.06, IRON)
    P["glass"].box(x - 0.17, y + 3.4, z - 0.17, x + 0.17, y + 3.85, z + 0.17, rgb(0xC8C2A8))
    P["metal"].box(x - 0.22, y + 3.85, z - 0.22, x + 0.22, y + 3.95, z + 0.22, IRON)


def bench(x, y, z, along_z=True):
    """Slatted bench on iron legs."""
    w, d = (0.5, 1.8) if along_z else (1.8, 0.5)
    for s in (-1, 1):
        lx, lz = (x, z + s * 0.75) if along_z else (x + s * 0.75, z)
        P["metal"].box(lx - 0.05, y, lz - 0.05, lx + 0.05, y + 0.45, lz + 0.05, IRON)
    P["timber"].box(x - w / 2, y + 0.42, z - d / 2, x + w / 2, y + 0.48, z + d / 2, WHITE)


def coast():
    # The promenade continues along the shore beyond the live part of the road.
    P["stone"].box(-29, PLAZA_Y - 1.4, -260, -25, PLAZA_Y - 0.3, NEAR_EDGE_Z, rgb(0xC8BCA8))
    P["paving"].box(-25, PLAZA_Y - 0.6, -260, -20.5, PLAZA_Y - 0.3, NEAR_EDGE_Z, rgb(0xC9BFAE))
    z = -44.0
    while z > -180:
        lamp(-28.55, PLAZA_Y - 0.3, z)
        if int(-z) % 28 < 14:
            bench(-26.4, PLAZA_Y - 0.3, z - 6.0)
        z -= 14.0


def pier(x_root, x_end, zc, width, deck_y):
    """Wooden pier on piles from the promenade wall into the bay, with a T-shaped head."""
    z0, z1 = zc - width / 2, zc + width / 2
    P["planks"].box(x_end, deck_y - 0.2, z0, x_root, deck_y, z1, DECK)
    for zz in (z0, z1 - 0.18):  # stringers
        P["shutter"].box(x_end, deck_y - 0.5, zz, x_root, deck_y - 0.2, zz + 0.18, PILE)
    hx0, hz0, hz1 = x_end - 5.0, zc - 4.2, zc + 4.2
    P["planks"].box(hx0, deck_y - 0.2, hz0, x_end, deck_y, hz1, DECK)
    x = x_root - 1.5
    while x > hx0:
        for zz in ((z0 + 0.15, z1 - 0.15) if x > x_end else (hz0 + 0.2, zc - 1.4, zc + 1.4, hz1 - 0.2)):
            P["shutter"].box(x - 0.16, SEA_Y - 1.2, zz - 0.16, x + 0.16, deck_y - 0.2, zz + 0.16, PILE)
        x -= 2.8
    x = x_root - 4.0
    while x > hx0 + 0.5:  # bollards along both edges
        for zz in ((z0 + 0.2, z1 - 0.2) if x > x_end else (hz0 + 0.25, hz1 - 0.25)):
            P["metal"].box(x - 0.13, deck_y, zz - 0.13, x + 0.13, deck_y + 0.45, zz + 0.13, IRON)
        x -= 7.0
    lamp(hx0 + 0.4, deck_y, hz0 + 0.4)
    lamp(hx0 + 0.4, deck_y, hz1 - 0.4)
    bench(x_end - 2.5, deck_y, zc, along_z=False)


def boat(x, z, heading, length, beam, colour, kind="open", base=SEA_Y):
    """A small boat: pointed bow, flat transom; `kind` adds a wheelhouse, a cabin or a mast.

    `base` is the waterline, raised for a dinghy pulled up on the shore.
    """
    fx, fz = math.cos(heading), math.sin(heading)

    def at(u, v, y):  # u forward from the middle, v across, y above the waterline
        return (x + u * fx - v * fz, base + y, z + u * fz + v * fx)

    freeboard = 0.36 + 0.12 * beam
    rows = []
    for s, wide, sheer in ((0.0, 0.8, 0.0), (0.2, 0.95, 0.02), (0.45, 1.0, 0.05), (0.7, 0.88, 0.12),
                           (0.86, 0.6, 0.22), (0.96, 0.25, 0.32), (1.0, 0.04, 0.36)):
        u, b = (s - 0.5) * length, beam / 2 * wide
        top = freeboard + sheer * beam * 0.35
        rows.append([at(u, -b, top), at(u, -b * 0.96, 0.0), at(u, -b * 0.55, -0.35),
                     at(u, b * 0.55, -0.35), at(u, b * 0.96, 0.0), at(u, b, top)])
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(5):
            P["hull"].poly([r0[i], r1[i], r1[i + 1], r0[i + 1]], colour)
        P[("shutter" if kind == "open" else "hull")].poly([r0[0], r1[0], r1[5], r0[5]],
                                                          BOAT_DECK if kind == "open" else HULL_WHITE)
    P["hull"].poly(rows[0][::-1], colour)  # transom
    P["hull"].poly(rows[-1], colour)  # stem
    deck = freeboard + 0.05 * beam * 0.35
    if kind == "wheelhouse":
        u = -0.12 * length
        cx, cz = x + u * fx, z + u * fz
        obox(P["hull"], cx, cz, heading, 0.75, beam * 0.34, base + deck, base + deck + 1.6, HULL_WHITE)
        obox(P["glass"], cx, cz, heading, 0.77, beam * 0.35, base + deck + 0.95, base + deck + 1.4, GLASS)
        obox(P["hull"], cx, cz, heading, 0.85, beam * 0.4, base + deck + 1.6, base + deck + 1.7, HULL_WHITE)
    elif kind == "cabin":
        u = 0.05 * length
        cx, cz = x + u * fx, z + u * fz
        obox(P["hull"], cx, cz, heading, length * 0.22, beam * 0.38, base + deck, base + deck + 0.9, HULL_WHITE)
        obox(P["glass"], cx, cz, heading, length * 0.2, beam * 0.39, base + deck + 0.45, base + deck + 0.75, GLASS)
    elif kind == "sail":
        u = 0.12 * length
        mx, mz = x + u * fx, z + u * fz
        obox(P["hull"], mx - 0.9 * fx, mz - 0.9 * fz, heading, 1.0, beam * 0.3, base + deck, base + deck + 0.5, HULL_WHITE)
        obox(P["metal"], mx, mz, heading, 0.06, 0.06, base + deck, base + deck + length * 1.15, rgb(0xC8CCCC))
        bx, bz = mx - 1.5 * fx, mz - 1.5 * fz
        obox(P["metal"], bx, bz, heading, 1.5, 0.05, base + deck + 1.2, base + deck + 1.3, rgb(0xC8CCCC))
        obox(P["cloth"], bx, bz, heading, 1.4, 0.14, base + deck + 1.3, base + deck + 1.62, rgb(0x2F4F6F))


def boats():
    """Boats at the pier and the cape quay, and on moorings in the bay, all lying to the same westerly breeze."""
    west = math.pi
    fleet = (  # x, z, heading, length, beam, hull, kind, on a mooring buoy
        (-41.5, -47.2, 0.0, 7.4, 2.6, HULL_WHITE, "wheelhouse", False),
        (-49.0, -47.45, west, 5.8, 2.1, HULL_BLUE, "open", False),
        (-38.5, -52.6, west, 6.2, 2.2, HULL_RED, "open", False),
        (-46.0, -52.75, 0.0, 7.2, 2.5, HULL_WHITE, "wheelhouse", False),
        (-53.0, -52.5, west, 5.4, 2.0, HULL_PALE, "open", False),
        (-64.6, -50.0, math.pi / 2, 8.4, 2.8, HULL_WHITE, "sail", False),
        (-72.0, -42.0, west + 0.12, 8.0, 2.7, HULL_WHITE, "sail", True),
        (-79.0, -62.0, west - 0.1, 7.6, 2.6, HULL_NAVY, "wheelhouse", True),
        (-66.0, -67.0, west + 0.2, 6.0, 2.2, HULL_RED, "open", True),
        (-86.0, -50.0, west, 9.0, 3.0, HULL_WHITE, "cabin", True),
        (-62.5, -75.4, 0.0, 7.0, 2.4, HULL_WHITE, "wheelhouse", False),
        (-81.8, -79.8, west, 6.0, 2.2, HULL_BLUE, "open", False),
    )
    for x, z, heading, length, beam, colour, kind, moored in fleet:
        boat(x, z, heading, length, beam, colour, kind)
        if moored:
            bx, bz = x + math.cos(heading) * (length / 2 + 3.0), z + math.sin(heading) * (length / 2 + 3.0)
            P["hull"].mesh(SMALL_BLOB, place_at(bx, SEA_Y + 0.05, bz, 0.32, 0.3, 0.32), HULL_RED if kind == "open" else TRIM)
    for x, z, heading, length, beam, colour in ((-60.5, -44.8, 0.0, 2.6, 1.2, HULL_RED),
                                                (-72.2, -79.6, 0.4, 3.0, 1.35, HULL_PALE)):
        boat(x, z, heading, length, beam, colour, "open")
    # Two dinghies pulled up on the shore below the promenade wall.
    for x, z, heading, colour in ((-32.6, -40.5, west, HULL_WHITE), (-33.0, -44.0, west + 0.3, HULL_BLUE)):
        boat(x, z, heading, 2.9, 1.3, colour, "open", base=height(x, z) + 0.25)


def boulder(x, z, r, y):
    P["rock"].mesh(SMALL_BLOB, place_at(x, y, z, r * (1 + random.random() * 0.4), r * (0.55 + random.random() * 0.3),
                                        r * (1 + random.random() * 0.4)), pick(BOULDERS), rough=0.25)


def harbour():
    """The American side: the pier and its boats, boathouses and a porch house along the shore.

    Seen from the seat, the bay shows only between the live row's left end
    (about 38 degrees left) and the window's edge; the pier, the boats and the
    cape quay sit in that slice, and nothing tall stands in front of them.
    The waterfront beyond the pier is mostly behind the live row.
    """
    floor = SEA_Y + 0.85
    pier(-29.0, -58.0, -50.0, 2.6, SEA_Y + 1.05)
    boathouse(-40.0, -30.2, -59.0, -52.6, floor, "-x", height)
    american_house(-39.0, -30.6, -68.6, -61.6, floor - 0.6, side="-x", storeys=2)
    boathouse(-40.5, -30.2, -77.0, -70.6, floor, "-x", height)
    for z in (-37.0, -45.2, -60.4, -69.6, -78.4, -81.0, -84.0):
        boulder(-34.6 + random.random() * 0.8, z, 0.6 + random.random() * 0.7, SEA_Y - 0.1)
    boats()


# --- the cape ---------------------------------------------------------------

CAPE_X, CAPE_Z = -63.0, -95.0


def quay_line(x):
    """z of the cape quay's water edge, bending south round the cape's western shoulder."""
    return -80.0 - 0.28 * max(0.0, -66.0 - x)


def cape_height(x, z):
    """Rock height of the cape (three.js y); below SEA_Y is under water.

    A ragged limestone mass, highest and steepest on the open-sea side, tied
    to the shore by a low neck. On the bay side it drops to a shelf just above
    the water, where the quay houses stand, then under water at the quay.
    """
    dx, dz = (x - CAPE_X) / 25.0, (z - CAPE_Z) / 17.0
    angle = math.atan2(dz, dx)
    rim = 0.72 + 0.56 * fbm(math.cos(angle) * 1.4 + 3.7, math.sin(angle) * 1.4 + 8.2, 3)
    t = math.hypot(dx, dz) / rim
    crown = 7.0 + 5.0 * smoothstep(0.5, -0.8, dx)
    shape = 1.0 - smoothstep(0.55, 1.0, t)
    h = SEA_Y - 3.0 + (crown + 3.0) * shape ** 0.8
    h += (3.2 * (fbm(x / 9.0 + 40, z / 9.0 + 40) - 0.5) + 1.4 * (fbm(x / 3.1, z / 3.1, 3) - 0.5)) * min(1.0, shape * 1.6)
    neck = smoothstep(-50.0, -40.0, x) * (1 - smoothstep(-36.0, -31.5, x)) * (1 - smoothstep(5.0, 10.0, abs(z + 96.0)))
    h = max(h, SEA_Y - 3.0 + (5.5 + 1.5 * (fbm(x / 4.0, z / 4.0, 3) - 0.5)) * neck)
    edge = quay_line(x)
    shore = SEA_Y - 1.6 + 2.5 * smoothstep(edge + 0.4, edge - 1.0, z)
    cap = shore + max(0.0, (edge - 9.0) - z) * 1.4
    w = smoothstep(-92.0, -87.0, x) * (1 - smoothstep(-49.0, -44.0, x))
    return h + (min(h, cap) - h) * w


def lighthouse(x, z):
    """A New England light: white conical tower, black gallery and lantern."""
    ground = min(cape_height(x + dx, z + dz) for dx in (-2.8, 0.0, 2.8) for dz in (-2.8, 0.0, 2.8))
    base = ground + 0.6
    cylinder("stone", x, z, ground - 2.5, base, 3.1, 3.0, 20, STONE)
    cylinder("plaster", x, z, base, base + 12.8, 2.35, 1.6, 28, TOWER_WHITE)
    # Small windows climbing the side toward the town, and the door.
    ux, uz = -x / math.hypot(x, z), -z / math.hypot(x, z)
    for y in (base + 3.6, base + 7.1, base + 10.3):
        r = 2.35 - 0.75 * (y - base) / 12.8
        wx, wz = x + ux * r, z + uz * r
        P["glass"].box(wx - 0.22, y, wz - 0.22, wx + 0.22, y + 0.8, wz + 0.22, GLASS)
    dx, dz = x + ux * 2.3, z + uz * 2.3
    P["shutter"].box(dx - 0.45, base, dz - 0.45, dx + 0.45, base + 2.1, dz + 0.45, BLACK)
    deck = base + 12.8
    cylinder("metal", x, z, deck, deck + 0.28, 2.6, 2.6, 28, BLACK)  # gallery deck
    for k in range(20):
        a = 2 * math.pi * k / 20
        px, pz = x + 2.5 * math.cos(a), z + 2.5 * math.sin(a)
        P["metal"].box(px - 0.03, deck + 0.28, pz - 0.03, px + 0.03, deck + 1.15, pz + 0.03, BLACK)
    cylinder("metal", x, z, deck + 1.08, deck + 1.15, 2.52, 2.52, 28, BLACK, caps=False)  # rail
    cylinder("metal", x, z, deck + 0.28, deck + 1.0, 1.32, 1.32, 10, BLACK)  # watch room
    cylinder("glass", x, z, deck + 1.0, deck + 2.6, 1.22, 1.22, 10, LANTERN)
    for k in range(10):
        a = 2 * math.pi * (k + 0.5) / 10
        px, pz = x + 1.22 * math.cos(a), z + 1.22 * math.sin(a)
        P["metal"].box(px - 0.05, deck + 1.0, pz - 0.05, px + 0.05, deck + 2.6, pz + 0.05, BLACK)
    cylinder("metal", x, z, deck + 2.6, deck + 2.75, 1.42, 1.42, 12, BLACK)
    cylinder("metal", x, z, deck + 2.75, deck + 3.6, 1.42, 0.2, 12, BLACK)  # roof
    P["metal"].box(x - 0.04, deck + 3.6, z - 0.04, x + 0.04, deck + 3.95, z + 0.04, BLACK)
    P["metal"].mesh(SMALL_BLOB, place_at(x, deck + 4.05, z, 0.22, 0.22, 0.22), BLACK)  # ventilator ball
    occupy(x - 3.2, z - 3.2, x + 3.2, z + 3.2)


def cape():
    """The cape: ragged limestone, a quay with boathouses and porch houses on the bay side, the lighthouse."""
    bm = P["rock"]
    step = 1.0
    xs = [-97.0 + i * step for i in range(67)]
    zs = [-120.0 + j * step for j in range(49)]
    grid = {}
    for x in xs:
        for z in zs:
            grid[(x, z)] = bm.bm.verts.new(B(x, cape_height(x, z), z))
    wet, cliff, bare, scrubby = rgb(0x6B655A), (rgb(0xA39B8B), rgb(0x958D7E)), rgb(0xB2AA98), (rgb(0x857F55), rgb(0x9A8E64))
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            x0, x1, z0, z1 = xs[i], xs[i + 1], zs[j], zs[j + 1]
            corners = (grid[(x0, z1)], grid[(x1, z1)], grid[(x1, z0)], grid[(x0, z0)])
            ys = [v.co.z for v in corners]
            if max(ys) < SEA_Y - 0.6:
                continue
            slope = math.hypot(ys[1] - ys[0] + ys[2] - ys[3], ys[3] - ys[0] + ys[2] - ys[1]) / (2 * step)
            mid = sum(ys) / 4
            pick_noise = noise2(x0 / 6.0, z0 / 6.0)
            if mid < SEA_Y + 0.7:
                colour = wet
            elif slope > 1.0:
                colour = cliff[0] if pick_noise < 0.5 else cliff[1]
            elif slope > 0.55 or pick_noise < 0.3:
                colour = bare
            else:
                colour = scrubby[0] if pick_noise < 0.65 else scrubby[1]
            face = bm.bm.faces.new(corners)
            face.smooth = True
            for loop in face.loops:
                loop[bm.tint] = (*colour, 1.0)
    # Boulders fallen round the foot of the cliffs, away from the quay and the neck.
    for k in range(34):
        angle = 2 * math.pi * (k + random.random() * 0.6) / 34
        r = 0.6
        while r < 1.6 and cape_height(CAPE_X + math.cos(angle) * 25 * r, CAPE_Z + math.sin(angle) * 17 * r) > SEA_Y + 0.2:
            r += 0.02
        x, z = CAPE_X + math.cos(angle) * 25 * r, CAPE_Z + math.sin(angle) * 17 * r
        if r >= 1.6 or x > -40 or (-92 < x < -44 and z > quay_line(x) - 11.0):
            continue
        boulder(x, z, 0.8 + random.random() * 1.4, SEA_Y - 0.15)
    # The quay and its buildings, facing the bay along the bending quay line; gaps in the
    # quay let the boathouse slipways reach the water.
    floor = SEA_Y + 1.05
    for qx0, qx1 in ((-86.5, -77.0), (-67.0, -58.4)):
        edge = quay_line((qx0 + qx1) / 2)
        P["stone"].box(qx0, SEA_Y - 2.5, edge, qx1, floor - 0.05, edge + 3.2, QUAY)
        for bx in (qx0 + 1.5, (qx0 + qx1) / 2, qx1 - 1.5):
            P["metal"].box(bx - 0.13, floor - 0.05, edge + 2.75, bx + 0.13, floor + 0.4, edge + 3.01, IRON)
    edge = quay_line(-81.8)
    american_house(-86.0, -77.6, edge - 8.2, edge - 0.8, floor - 0.6, side="+z", storeys=2)
    edge = quay_line(-72.2)
    boathouse(-75.0, -69.4, edge - 9.4, edge, floor, "+z", cape_height)
    american_house(-66.6, -58.8, -87.8, -80.8, floor - 0.6, side="+z", storeys=1)
    boathouse(-56.6, -50.4, -89.2, -80.0, floor, "+z", cape_height)
    lamp(-62.0, floor - 0.05, -77.4)
    # The light and its keeper's house on the crown.
    lighthouse(-66.0, -97.0)
    kx0, kx1, kz0, kz1 = -78.5, -72.0, -104.0, -98.0
    keeper_ground = min(cape_height(kx, kz) for kx in (kx0, kx1) for kz in (kz0, kz1))
    american_house(kx0, kx1, kz0, kz1, keeper_ground, side="+z", storeys=1, tint=TRIM, roof=KEEPER_ROOF)
    # Low scrub on the crown.
    for _ in range(60):
        x = CAPE_X + (random.random() - 0.5) * 46
        z = CAPE_Z + (random.random() - 0.5) * 32
        h = cape_height(x, z)
        if h > SEA_Y + 3.0 and clear_of(x, z, 1.0):
            scrub(x, z, h)


# --- vegetation -------------------------------------------------------------


def trunk(x, y, z, h, r, colour, lean=(0.0, 0.0)):
    P["foliage"].mesh(TRUNK, place_at(x, y, z, r, h, r, lean), colour, rough=0.08)


def cypress(x, z, scale=1.0):
    y = height(x, z) - 0.3
    h = (7 + random.random() * 5) * scale
    r = (0.7 + random.random() * 0.3) * scale
    lean = ((random.random() - 0.5) * 0.04, (random.random() - 0.5) * 0.04)
    P["foliage"].mesh(CYPRESS, place_at(x, y, z, r, h, r, lean), pick(CYPRESS_GREENS), rough=0.1)


def olive(x, z):
    """Low, wide and silvery, on a short twisted trunk."""
    y = height(x, z) - 0.2
    trunk(x, y, z, 1.8 + random.random() * 0.6, 0.2, BARK, lean=((random.random() - 0.5) * 0.4, (random.random() - 0.5) * 0.4))
    colour = pick(OLIVE_GREENS)
    for _ in range(3 + random.randrange(3)):
        r = 1.0 + random.random() * 0.8
        P["foliage"].mesh(SMALL_BLOB, place_at(x + (random.random() - 0.5) * 2.2, y + 2.4 + random.random() * 1.2,
                                               z + (random.random() - 0.5) * 2.2, r * 1.15, r * 0.8, r * 1.15),
                          colour, rough=0.2)


def umbrella_pine(x, z):
    """Stone pine: a tall bare trunk carrying a flat, wide crown."""
    y = height(x, z) - 0.3
    h = 8 + random.random() * 4
    lean = ((random.random() - 0.5) * 0.16, (random.random() - 0.5) * 0.16)
    trunk(x, y, z, h, 0.3, BARK, lean)
    tx, tz = x + lean[0] * h, z + lean[1] * h
    reach = 3.5 + random.random() * 2
    colour = pick(PINE_GREENS)
    for _ in range(6 + random.randrange(4)):
        a, d = random.random() * 2 * math.pi, random.random() * reach * 0.65
        r = 1.6 + random.random() * 1.2
        P["foliage"].mesh(SMALL_BLOB, place_at(tx + math.cos(a) * d, y + h + random.random() * 0.8 - 0.2,
                                               tz + math.sin(a) * d, r * 1.2, r * 0.45, r * 1.2), colour, rough=0.14)


def plane_tree(x, z):
    """An old oriental plane, the kind that has shaded a village square for centuries."""
    y = height(x, z) - 0.3
    trunk(x, y, z, 6.5, 0.75, PLANE_BARK)
    for k in range(3):
        a = 2 * math.pi * k / 3 + random.random()
        trunk(x, y + 4.5, z, 5.0, 0.35, PLANE_BARK, lean=(math.cos(a) * 0.5, math.sin(a) * 0.5))
    # A broad, uneven crown of separate clumps, wider than it is tall.
    for _ in range(16):
        a, d = random.random() * 2 * math.pi, random.random() ** 0.5 * 8.0
        r = 2.2 + random.random() * 1.6
        P["foliage"].mesh(BLOB, place_at(x + math.cos(a) * d, y + 8.0 + random.random() * 7 - d * 0.45,
                                         z + math.sin(a) * d, r * 1.15, r * 0.75, r * 1.15), pick(PLANE_GREENS), rough=0.18)


def scrub(x, z, y=None):
    """Low maquis: lentisk and myrtle in a clump or two."""
    y = height(x, z) if y is None else y
    for _ in range(1 + random.randrange(3)):
        r = 0.5 + random.random() * 0.6
        P["foliage"].mesh(SMALL_BLOB, place_at(x + (random.random() - 0.5) * 1.2, y + r * 0.4, z + (random.random() - 0.5) * 1.2,
                                               r * 1.2, r * 0.7, r * 1.2), pick(SCRUB), rough=0.22)


def vegetation():
    """Trees by quarter, planted after the buildings so they stay clear of them."""
    def on_hill(x, z):
        return x > -15.0 and height(x, z) > PLAZA_Y + 0.5

    def scatter(count, x0, x1, z0, z1, plant, margin, accept=on_hill):
        placed = 0
        for _ in range(count * 8):
            if placed >= count:
                return
            x, z = x0 + random.random() * (x1 - x0), z0 + random.random() * (z1 - z0)
            if accept(x, z) and clear_of(x, z, margin):
                plant(x, z)
                placed += 1

    # The two plane trees, each over its small square in the Turkish quarter.
    plane_tree(23.0, -101.0)
    plane_tree(50.0, -133.0)
    # Gardens of the Italian core.
    scatter(26, -13, 44, -82, -40, cypress, 1.2)
    scatter(22, -13, 44, -82, -40, olive, 2.0)
    # Yards and terraces of the Turkish quarter.
    scatter(30, -10, 125, -178, -84, olive, 2.2)
    scatter(18, -10, 125, -178, -84, cypress, 1.2)
    scatter(8, -10, 125, -178, -84, umbrella_pine, 4.0)
    # The hill top: stone pines on the skyline, olive groves, lines of cypress.
    scatter(34, -14, 125, -218, -170, umbrella_pine, 4.0)
    scatter(70, -14, 125, -218, -150, olive, 2.5)
    scatter(26, -14, 125, -218, -150, cypress, 1.5)
    # The slope on the right.
    scatter(30, 40, 125, -60, 0, olive, 2.2)
    scatter(14, 40, 125, -60, 0, cypress, 1.2)
    # Scrub clinging to the rock face over the promenade, which runs from the road shelf
    # at x = -18 up to the hill at x = -16.
    for _ in range(40):
        z = -40.0 - random.random() * 178.0
        t = 0.15 + random.random() * 0.75
        x = -18.0 + 2.0 * t
        scrub(x - 0.3, z, height(-18.0, z) + (height(-16.0, z) - height(-18.0, z)) * t)


def far_land():
    """Mountains behind the town and a headland across the bay, softened by haze.

    Broad value noise sets the masses; a ridged term cuts crests and gullies
    into them, and steep faces show bare rock, so they no longer read as smooth cones.
    """
    bm = P["rock"]
    def ridge(x0, x1, z0, z1, peak, seed, colour):
        step = 8.0
        nx, nz = int((x1 - x0) / step), int((z1 - z0) / step)
        verts = {}
        for i in range(nx + 1):
            for j in range(nz + 1):
                x, z = x0 + i * step, z0 + j * step
                edge = min(i, nx - i, j, nz - j) / max(1, min(nx, nz) / 2)
                crest = 1 - abs(2 * fbm(x / 110 + seed * 3, z / 110 - seed, 3) - 1)
                rough = fbm(x / 34 + seed, z / 34, 3) - 0.5
                lift = 0.3 + 0.55 * noise2(x / 160 + seed, z / 160) + 0.22 * crest ** 2 + 0.1 * rough
                h = SEA_Y - 4 + peak * lift * smoothstep(0, 0.6, edge)
                verts[(i, j)] = bm.bm.verts.new(B(x, h, z))
        rock, green = rgb(0x8C897C), lighter(colour, 0.08)
        for i in range(nx):
            for j in range(nz):
                corners = (verts[(i, j + 1)], verts[(i + 1, j + 1)], verts[(i + 1, j)], verts[(i, j)])
                ys = [v.co.z for v in corners]
                steep = (max(ys) - min(ys)) / step > 0.75
                tone = rock if steep else (colour if noise2(i / 5.0 + seed, j / 5.0) < 0.55 else green)
                face = bm.bm.faces.new(corners)
                face.smooth = True
                for loop in face.loops:
                    loop[bm.tint] = (*tone, 1.0)
    ridge(-500, 760, -1300, -560, 300, 3.1, rgb(0x6F7A58))
    ridge(-2200, -1100, -1300, -300, 110, 8.7, rgb(0x858766))


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


PROXIES = []


def near_proxies():
    """The live near town as camera-invisible stand-ins.

    The app draws these itself, so the panorama must not show them; but the
    sea should still reflect them and the image-based light should still see
    a sunlit square and facades rather than open water. They are hidden from
    camera rays in the panorama and shown in the IBL render.
    """
    paving = Builder("proxy_paving", "paving")
    walls = Builder("proxy_walls", "plaster")
    stone = Builder("proxy_stone", "stone")
    paving.box(-21, PLAZA_Y - 1, -27, 30, PLAZA_Y, -0.6, rgb(0xFFFFFF))
    paving.box(-25, PLAZA_Y - 0.6, NEAR_EDGE_Z, -21, PLAZA_Y - 0.3, 20, rgb(0xC9BFAE))
    stone.box(-29, PLAZA_Y - 1.4, NEAR_EDGE_Z, -25, PLAZA_Y - 0.3, 20, rgb(0xC8BCA8))
    walls.box(-21, PLAZA_Y - 2, -34, 26, PLAZA_Y + 9.5, -27, rgb(0xFFE9CF))
    walls.box(30, PLAZA_Y - 2, -26, 37, PLAZA_Y + 8.5, -2, rgb(0xF6ECE0))
    for builder in (paving, walls, stone):
        obj = builder.finish()
        obj.visible_camera = False
        PROXIES.append(obj)


# --- build ----------------------------------------------------------------

if MARKERS:
    markers()
else:
    terrain()
    hillside()
    coast()
    harbour()
    cape()
    vegetation()
    far_land()
    # The sea reaches the horizon.
    P["sea"].face((B(-20000, SEA_Y, 20000), B(20000, SEA_Y, 20000), B(20000, SEA_Y, -20000), B(-20000, SEA_Y, -20000)), (1, 1, 1))
    near_proxies()
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
    for obj in PROXIES:
        obj.visible_camera = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 256
    scene.cycles.samples = 64
    scene.render.image_settings.file_format = "HDR"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = os.path.join(OUT, "ombrisa_ibl.hdr")
    print("[pano] rendering", scene.render.filepath)
    bpy.ops.render.render(write_still=True)

print("[pano] done")
