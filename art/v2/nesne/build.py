"""
Small props from the scene cards, one GLB each:

  nice -n 20 blender -b --factory-startup --python art/v2/nesne/build.py -- <prop> <out.glb> <tex_dir> [--preview dir]

prop: pocket_watch | microphones | signs | card_bank | clipping_book | broadcast_screen | loaves
tex_dir holds the pictures from art/v2/nesne/textures.py (and, for the screen, broadcast_live.jpg;
for the loaves, loaf_raw.glb and roll_raw.glb from prep_model.py).

Coordinates here are Blender's (Z up). The glTF export turns -Y into +Z, so everything that
faces the player faces -Y here and +Z in three.js.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
PROP, OUT, TEX = argv[0], argv[1], argv[2]
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HDRI = os.path.join(REPO, 'art', 'panorama', 'source', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')

lib.reset()
COLL = lib.collection(PROP)


def tex(name):
    return os.path.join(TEX, name)


def obj(name, bm, mat=None, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    if mat is not None:
        if isinstance(mat, (list, tuple)):
            for m in mat:
                me.materials.append(m)
        else:
            me.materials.append(mat)
    if parent is not None:
        o.parent = parent
    for p in me.polygons:
        p.use_smooth = True
    return o


def root(name, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    e.location = loc
    COLL.objects.link(e)
    return e


def planar_uv(bm, axes=(0, 2), lo=(-1, -1), hi=(1, 1), flip_u=False):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            co = l.vert.co
            u = (co[axes[0]] - lo[0]) / (hi[0] - lo[0])
            v = (co[axes[1]] - lo[1]) / (hi[1] - lo[1])
            l[uv].uv = (1 - u if flip_u else u, v)


def lathe(profile, segments=48, axis='Y'):
    """profile: (radius, height) points; spun around the axis (Y: height along -Y = toward the viewer)."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, h, 0) if axis == 'Y' else (r, 0, h)) for r, h in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 1, 0) if axis == 'Y' else (0, 0, 1),
                   angle=2 * math.pi, steps=segments, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def disc(r, y, segments=48, dome=0.0):
    bm = bmesh.new()
    c = bm.verts.new((0, y - dome, 0))
    ring = [bm.verts.new((r * math.cos(a), y, r * math.sin(a))) for a in (2 * math.pi * i / segments for i in range(segments))]
    for i in range(segments):
        bm.faces.new((c, ring[(i + 1) % segments], ring[i]))
    return bm


def box_bm(sx, sy, sz, centre=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    return bm


def cyl_bm(r0, r1, length, segments=16, axis=(0, 1, 0), start=(0, 0, 0), caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segments, radius1=r0, radius2=r1, depth=length)
    # create_cone builds along Z, centred: move to start along +Z, then turn Z to axis
    bmesh.ops.translate(bm, vec=(0, 0, length / 2), verts=bm.verts)
    z = Vector((0, 0, 1))
    a = Vector(axis).normalized()
    q = z.rotation_difference(a)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=start, verts=bm.verts)
    return bm


def flat_poly(points, thickness, y):
    """A flat shape in the XZ plane (points x, z), thickness along Y, front face at y."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, z in points]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, thickness, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def merge(bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        b.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    return out


# ---------------------------------------------------------------- props

def pocket_watch():
    gold = lib.flat('watch_gold', (0.83, 0.62, 0.28), rough=0.22, metal=1.0)
    steel = lib.flat('watch_hands', (0.04, 0.05, 0.09), rough=0.3, metal=0.7)
    glass = lib.flat('watch_glass', (0.9, 0.92, 0.95), rough=0.03, alpha=0.12)
    dial_m = lib.textured('watch_dial', tex('dial.png'), rough=0.35)
    R = 0.06
    top = root('pocket_watch')
    # Case: back dome, band, bezel (the dial looks along -Y).
    prof = [(0.0, 0.011), (0.03, 0.0105), (0.048, 0.0085), (0.057, 0.005), (0.0615, 0.0015), (0.0625, -0.002),
            (0.0615, -0.0055), (0.0585, -0.0078), (0.0548, -0.0080), (0.0538, -0.0062)]
    case = merge([lathe(prof, 64),
                  cyl_bm(0.0042, 0.0042, 0.010, 16, (0, 0, 1), (0, 0.0005, 0.061)),
                  cyl_bm(0.0068, 0.0068, 0.009, 24, (0, 0, 1), (0, 0.0005, 0.070))])
    ring = bmesh.new()
    bmesh.ops.create_circle(ring, segments=32, radius=1)
    torus = bpy.ops.mesh.primitive_torus_add(major_radius=0.0135, minor_radius=0.0024, major_segments=32, minor_segments=10,
                                            location=(0, 0.0005, 0.0915), rotation=(math.pi / 2, 0, 0))
    bow = bpy.context.active_object
    ring.free()
    c = obj('case', case, gold, top)
    bow.data.materials.append(gold)
    for o in list(bow.users_collection):
        o.objects.unlink(bow)
    COLL.objects.link(bow)
    bow.name = 'bow'
    lib.apply([bow])
    bow.parent = top
    # Dial
    d = disc(0.0545, -0.0060, 64)
    planar_uv(d, (0, 2), (-0.0545, -0.0545), (0.0545, 0.0545))
    dial = obj('dial', d, dial_m, top)
    for p in dial.data.polygons:
        p.use_smooth = False
    # Hands: point to twelve (+Z) at rest; pivot at the centre.
    def hand(name, length, width, tail, y):
        pts = [(0, length), (width * 0.5, length * 0.82), (width * 0.9, length * 0.6), (width * 0.35, length * 0.45),
               (width * 0.6, 0.0), (width * 0.3, -tail), (-width * 0.3, -tail), (-width * 0.6, 0.0),
               (-width * 0.35, length * 0.45), (-width * 0.9, length * 0.6), (-width * 0.5, length * 0.82)]
        h = obj(name, flat_poly(pts, 0.0007, y), steel, top)
        for p in h.data.polygons:
            p.use_smooth = False
        return h
    hour = hand('hour_hand', 0.030, 0.0065, 0.006, -0.0071)
    minute = hand('minute_hand', 0.044, 0.0045, 0.007, -0.0079)
    sub_z = -250 / 512 * 0.0545
    sec = obj('seconds_hand', flat_poly([(0.0005, 0.0085), (0.0006, -0.002), (-0.0006, -0.002), (-0.0005, 0.0085)], 0.0005, -0.0066), steel)
    sec.location = (0, 0, sub_z)
    sec.parent = top
    hub = obj('hub', cyl_bm(0.0024, 0.0018, 0.0016, 16, (0, -1, 0), (0, -0.0080, 0)), gold, top)
    hub.parent = minute   # the cap turns with the minute hand
    gl = obj('glass', disc(0.0545, -0.0082, 48, dome=0.0035), glass, top)
    # Stopped at nine o'clock: the hour hand turned a quarter turn counter-clockwise as seen from the front.
    hour.rotation_euler = (0, -math.pi / 2, 0)
    lib.empty('chain_ring', (0, 0.0005, 0.103), coll=COLL, size=0.01).parent = top
    return top, [('front', (0.0, -0.26, 0.02), (0, 0, 0.012), 50), ('three_quarter', (0.16, -0.2, 0.1), (0, 0, 0.012), 50)]


def microphones():
    black = lib.flat('mic_black', (0.03, 0.03, 0.035), rough=0.45, metal=0.3)
    grille = lib.textured('mic_grille', tex('grille.png'), rough=0.4, metal=0.5)
    foams = [lib.flat(f'mic_foam_{i}', c, rough=1.0) for i, c in enumerate([(0.06, 0.06, 0.07), (0.5, 0.06, 0.06), (0.05, 0.12, 0.4)])]
    flags = [lib.flat(f'mic_flag_{i}', c, rough=0.5) for i, c in enumerate(
        [(0.85, 0.85, 0.82), (0.7, 0.08, 0.08), (0.08, 0.22, 0.6), (0.9, 0.62, 0.05), (0.1, 0.45, 0.25)])]
    top = root('microphones')
    specs = [(-24, 14, 0.19, 'grille', 0), (-11, 22, 0.21, 'foam0', 1), (0, 16, 0.22, 'grille', 2), (12, 24, 0.2, 'foam1', 3), (25, 13, 0.18, 'foam2', 4)]
    by_mat = {}
    for yaw, pitch, length, head, fl in specs:
        a = Vector((math.sin(math.radians(yaw)) * math.cos(math.radians(pitch)), math.cos(math.radians(yaw)) * math.cos(math.radians(pitch)), math.sin(math.radians(pitch))))
        start = a * 0.02
        handle = cyl_bm(0.0125, 0.0165, length, 16, tuple(a), tuple(start))
        by_mat.setdefault('black', []).append(handle)
        tip = start + a * (length + 0.018)
        hb = bmesh.new()
        r = 0.026 if head == 'grille' else 0.032
        bmesh.ops.create_uvsphere(hb, u_segments=16, v_segments=10, radius=r)
        bmesh.ops.translate(hb, vec=tuple(tip), verts=hb.verts)
        if head == 'grille':
            uv = hb.loops.layers.uv.verify()
            for f in hb.faces:
                for l in f.loops:
                    d = (l.vert.co - tip).normalized()
                    l[uv].uv = (math.atan2(d.x, d.y) / (2 * math.pi) * 4, d.z * 2)
        by_mat.setdefault(head, []).append(hb)
        fb = box_bm(0.055, 0.045, 0.055)
        mid = start + a * (length * 0.62)
        q = Vector((0, 1, 0)).rotation_difference(a)
        bmesh.ops.rotate(fb, verts=fb.verts, cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(fb, vec=tuple(mid), verts=fb.verts)
        by_mat.setdefault(f'flag{fl}', []).append(fb)
    clamp = box_bm(0.07, 0.05, 0.05, (0, 0.0, -0.005))
    by_mat['black'].append(clamp)
    mats = {'black': black, 'grille': grille, 'foam0': foams[0], 'foam1': foams[1], 'foam2': foams[2]}
    mats.update({f'flag{i}': m for i, m in enumerate(flags)})
    for k, bms in by_mat.items():
        o = obj(f'mic_{k}', merge(bms), mats[k], top)
        if k.startswith('flag') or k == 'black':
            for p in o.data.polygons:
                p.use_smooth = k == 'black' and len(p.vertices) > 4
    # A slim stand with three feet: its top is the bundle's origin (hide it if the bundle is held).
    stand = merge([cyl_bm(0.011, 0.011, 1.18, 12, (0, 0, -1), (0, 0, -0.02))] +
                  [cyl_bm(0.008, 0.008, 0.42, 8, (math.cos(a) * 0.62, math.sin(a) * 0.62, -0.78), (0, 0, -0.86))
                   for a in (math.pi / 2, math.pi / 2 + 2.094, math.pi / 2 + 4.189)])
    st = obj('mic_stand', stand, black, top)
    return top, [('front', (0.35, 0.75, 0.25), (0, 0.1, 0.03), 45), ('stand', (1.2, 2.2, 0.2), (0, 0, -0.5), 40)]


def signs():
    edge = lib.flat('sign_edge', (0.55, 0.55, 0.53), rough=0.5, metal=0.6)
    sold_m = lib.textured('sign_sold_face', tex('sold.png'), rough=0.45)
    plate_m = lib.textured('sign_company_face', tex('plate.png'), rough=0.35, metal=0.1)
    clear = lib.flat('sign_company_lettering', (1, 1, 1), rough=0.4, alpha=0.0)
    top = root('signs')

    def board(name, w, h, t, face_mat, x):
        # Origin at the centre of the back face (on the wall); the front is t nearer the player.
        bm = box_bm(w, t, h, (0, -t / 2, 0))
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            front = f.normal.y < -0.9
            f.material_index = 0 if front else 1
            for l in f.loops:
                co = l.vert.co
                l[uv].uv = ((co.x + w / 2) / w, (co.z + h / 2) / h) if front else (0.5, 0.5)
        o = obj(name, bm, [face_mat, edge], top)
        o.location.x = x
        for p in o.data.polygons:
            p.use_smooth = False
        return o
    board('sign_sold', 1.4, 0.5, 0.02, sold_m, -0.8)
    company = board('sign_company', 1.4, 0.5, 0.03, plate_m, 0.8)
    # The lettering field: a plane over the plain right part of the plate (UV 0..1), empty until the game draws a name.
    lb = bmesh.new()
    x0, x1, z0, z1 = -0.7 + 0.42, 0.7 - 0.07, -0.18, 0.18
    yf = -0.03 - 0.002
    vs = [lb.verts.new((x0, yf, z0)), lb.verts.new((x1, yf, z0)), lb.verts.new((x1, yf, z1)), lb.verts.new((x0, yf, z1))]
    lb.faces.new(vs)
    planar_uv(lb, (0, 2), (x0, z0), (x1, z1))
    lt = obj('sign_company_lettering', lb, clear, company)
    return top, [('front', (0.0, -3.2, 0.3), (0, 0, 0), 40)]


def card_bank():
    m = lib.textured('cards', tex('cards.png'), rough=0.45)
    W, H, T = 0.32, 0.45, 0.004
    lean = math.radians(15)
    top = root('card_bank')
    cell_w, cell_h = 256 / 1024, 341 / 1024

    def cell_uv(i):
        cx, cy = i % 4, i // 4
        return (cx * cell_w, 1 - (cy + 1) * cell_h)

    cards = []
    face_i = [1]

    def card(name, loc, rot, mode):
        bm = box_bm(W, T, H)
        uv = bm.loops.layers.uv.verify()
        fi = face_i[0]
        face_i[0] = fi % 11 + 1
        for f in bm.faces:
            n = f.normal
            if abs(n.y) > 0.9:
                u0, v0 = cell_uv(fi if n.y < 0 else 0)
                for l in f.loops:
                    co = l.vert.co
                    u = (co.x + W / 2) / W
                    u = u if n.y < 0 else 1 - u
                    l[uv].uv = (u0 + u * cell_w, v0 + (co.z + H / 2) / H * cell_h)
            else:
                for l in f.loops:
                    l[uv].uv = (0.01, 0.01)
        o = obj(name, bm, m, group)
        for p in o.data.polygons:
            p.use_smooth = False
        o.rotation_mode = mode
        o.location = loc
        o.rotation_euler = rot
        cards.append(o)
        return o

    # The classic card house: rows of leaning pairs (ridge front to back, faces outward), a floor card
    # over every two ridges, the next row standing on the floors. Rows of 4, 3, 2 and 1: 1.8 m tall.
    group = root('cards')
    group.parent = top
    rows = [4, 3, 2, 1]
    dz = H * math.cos(lean)
    dx = 0.27
    n = 1
    z = 0.0
    for count in rows:
        x0 = -(count - 1) * dx / 2
        for k in range(count):
            cx = x0 + k * dx
            # left card: face to -X, top leaning to +X; right card mirrored
            card(f'card_{n:02d}', (cx - H / 2 * math.sin(lean), 0, z + dz / 2), (0, lean, -math.pi / 2), 'ZYX')
            card(f'card_{n + 1:02d}', (cx + H / 2 * math.sin(lean), 0, z + dz / 2), (0, -lean, math.pi / 2), 'ZYX')
            n += 2
        z += dz
        for k in range(count - 1):
            cx = x0 + (k + 0.5) * dx
            card(f'card_{n:02d}', (cx, 0, z + T / 2 + (k % 2) * T), (-math.pi / 2, 0, math.pi / 2), 'XYZ')
            n += 1
        z += 2 * T
    # One merged copy of the standing house (one draw call). Show it, hide `cards`; swap when it falls.
    bpy.context.view_layer.update()
    copies = []
    for c in cards:
        cc = c.copy()
        cc.data = c.data.copy()
        COLL.objects.link(cc)
        cc.parent = None
        cc.matrix_world = c.matrix_world.copy()
        copies.append(cc)
    lib.apply(copies)
    standing = lib.join(copies, 'card_bank_standing')
    standing.parent = top
    return top, [('front', (1.4, -3.6, 1.3), (0, 0, 0.85), 40)]


def clipping_book():
    cloth = lib.textured('book_cloth', tex('cloth.png'), rough=0.9)
    page_m = lib.textured('book_page', tex('page.png'), rough=0.85)
    edge = lib.flat('book_page_edge', (0.85, 0.8, 0.68), rough=0.9)
    top = root('clipping_book')
    PW, PH, CT = 0.24, 0.32, 0.005
    cov = bmesh.new()
    for side in (-1, 1):
        b = box_bm(PW + 0.012, PH + 0.016, CT, (side * (PW + 0.012) / 2, 0, CT / 2))
        b.to_mesh(me := bpy.data.meshes.new('t'))
        b.free()
        cov.from_mesh(me)
        bpy.data.meshes.remove(me)
    sp = cyl_bm(0.012, 0.012, PH + 0.016, 12, (0, 1, 0), (0, -(PH + 0.016) / 2, 0.009), caps=False)
    sp.to_mesh(me := bpy.data.meshes.new('t'))
    sp.free()
    cov.from_mesh(me)
    bpy.data.meshes.remove(me)
    planar_uv(cov, (0, 1), (-0.3, -0.2), (0.3, 0.2))
    c = obj('book_cover', cov, cloth, top)

    def page(name, side):
        bm = bmesh.new()
        nx, ny = 14, 6
        grid = []
        for j in range(ny + 1):
            row = []
            for i in range(nx + 1):
                s = i / nx
                x = side * (0.004 + s * (PW - 0.004))
                rise = 0.011 * math.sqrt(min(1.0, s / 0.18)) + 0.003 * math.sin(math.pi * s)
                y = -PH / 2 + j / ny * PH
                row.append(bm.verts.new((x, y, CT + 0.004 + rise)))
            grid.append(row)
        uv = bm.loops.layers.uv.verify()
        for j in range(ny):
            for i in range(nx):
                q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                if side < 0:
                    q = q[::-1]
                f = bm.faces.new(q)
                for l in f.loops:
                    co = l.vert.co
                    u = (abs(co.x) - 0.004) / (PW - 0.004)
                    l[uv].uv = (u if side > 0 else 1 - u, (co.y + PH / 2) / PH)
        return obj(name, bm, page_m, top)
    page('page_left', -1)
    page('page_right', 1)
    blk = merge([box_bm(PW - 0.006, PH - 0.004, 0.011, (side * (PW / 2 + 0.002), 0, CT + 0.0055)) for side in (-1, 1)])
    b = obj('page_block', blk, edge, top)
    for p in b.data.polygons:
        p.use_smooth = False
    return top, [('top', (0.0, -0.45, 0.55), (0, 0, 0.0), 40)]


def broadcast_screen():
    frame_m = lib.flat('screen_frame', (0.03, 0.03, 0.035), rough=0.5, metal=0.4)
    steel = lib.flat('screen_steel', (0.32, 0.33, 0.35), rough=0.45, metal=0.8)
    pic = tex('broadcast_live.jpg')
    screen_m = lib.glowing('screen_picture', pic, strength=1.0) if os.path.exists(pic) else lib.flat('screen_picture', (0.05, 0.05, 0.06), emissive=(0.1, 0.1, 0.12))
    top = root('broadcast_screen')
    cz = 3.6
    SW, SH = 3.2, 1.8
    frame = merge([box_bm(SW + 0.24, 0.22, SH + 0.24, (0, 0.11, cz)),
                   box_bm(SW + 0.5, 0.5, 0.08, (0, 0.05, cz + SH / 2 + 0.2))])
    fr = obj('screen_frame', frame, frame_m, top)
    for p in fr.data.polygons:
        p.use_smooth = False
    legs = merge([box_bm(0.14, 0.14, cz - SH / 2 - 0.12 + 0.3, (x, 0.2, (cz - SH / 2 + 0.18) / 2)) for x in (-1.25, 1.25)] +
                 [box_bm(0.5, 0.5, 0.02, (x, 0.2, 0.01)) for x in (-1.25, 1.25)] +
                 [box_bm(2.64, 0.08, 0.08, (0, 0.2, 1.2))])
    lg = obj('screen_legs', legs, steel, top)
    for p in lg.data.polygons:
        p.use_smooth = False
    sb = bmesh.new()
    vs = [sb.verts.new((-SW / 2, -0.002, cz - SH / 2)), sb.verts.new((SW / 2, -0.002, cz - SH / 2)),
          sb.verts.new((SW / 2, -0.002, cz + SH / 2)), sb.verts.new((-SW / 2, -0.002, cz + SH / 2))]
    sb.faces.new(vs)
    planar_uv(sb, (0, 2), (-SW / 2, cz - SH / 2), (SW / 2, cz + SH / 2))
    sc = obj('screen', sb, screen_m, top)
    sc.data.polygons[0].use_smooth = False
    lib.empty('screen_centre', (0, -0.002, cz), coll=COLL, size=0.2).parent = top
    return top, [('front', (2.5, -7.5, 2.4), (0, 0, 2.6), 35)]


def loaves():
    top = root('loaves')
    out = []
    for key, fn, x in (('loaf_long', 'loaf_raw.glb', -0.16), ('loaf_round', 'roll_raw.glb', 0.16)):
        got = lib.import_gltf(tex(fn), COLL)
        o = list(got.values())[0]
        o.name = key
        o.location.x = x
        o.parent = top
        out.append(o)
    return top, [('side', (0.0, -0.75, 0.32), (0, 0, 0.05), 45)]


# ---------------------------------------------------------------- second set: the ship, the drought, the end

def uvbox(o, scale=1.0):
    bpy.context.view_layer.update()
    lib.box_uv(o, scale)
    return o


def flat_shade(o):
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def gold(name='gold', rough=0.28):
    return lib.flat(name, (0.86, 0.64, 0.24), rough=rough, metal=1.0)


def hatch_cover():
    """The well's lid on the ship (S13): a wooden grating that fits the coaming top, 0.92 x 0.82 m."""
    wood = lib.pbr('hatch_wood', 'brown_planks_05', 512, 256, tint=(0.55, 0.42, 0.3))
    rope = lib.flat('hatch_rope', (0.42, 0.34, 0.22), rough=0.9)
    top = root('hatch_cover')
    W, D, T = 0.92, 0.82, 0.05
    parts = [box_bm(W, 0.08, T, (0, -D / 2 + 0.04, T / 2)), box_bm(W, 0.08, T, (0, D / 2 - 0.04, T / 2)),
             box_bm(0.08, D, T, (-W / 2 + 0.04, 0, T / 2)), box_bm(0.08, D, T, (W / 2 - 0.04, 0, T / 2))]
    parts += [box_bm(0.055, D - 0.12, T * 0.8, (x, 0, T * 0.4)) for x in (-0.3, -0.15, 0.0, 0.15, 0.3)]
    parts += [box_bm(W - 0.12, 0.05, T * 0.6, (0, y, T * 0.7)) for y in (-0.2, 0.0, 0.2)]
    g = uvbox(flat_shade(obj('hatch_cover_wood', merge(parts), wood, top)), 0.6)
    handles = []
    for x in (-W / 2 + 0.02, W / 2 - 0.02):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.012, major_segments=16, minor_segments=6,
                                         location=(x, 0, T), rotation=(0, math.pi / 2, 0))
        handles.append(bpy.context.active_object)
    for h in handles:
        for c in list(h.users_collection):
            c.objects.unlink(h)
        COLL.objects.link(h)
        h.data.materials.append(rope)
    lib.apply(handles)
    hj = lib.join(handles, 'hatch_cover_handles')
    hj.parent = top
    return top, [('top', (0.9, -1.2, 1.0), (0, 0, 0), 40)]


def golden_parachute():
    """A gold parachute with a fat money bag (S12, S15): canopy, cords, bag. 2.6 m tall."""
    cloth = lib.flat('parachute_gold', (0.92, 0.58, 0.1), rough=0.3, metal=0.85)
    cord = lib.flat('parachute_cord', (0.85, 0.8, 0.65), rough=0.7)
    sack = lib.flat('parachute_bag', (0.4, 0.3, 0.17), rough=0.9)
    top = root('golden_parachute')
    R, Hc, z0 = 1.15, 0.65, 1.9
    bm = bmesh.new()
    gores, rings = 10, 6
    grid = []
    for j in range(rings + 1):
        t = j / rings
        row = []
        for i in range(gores * 3):
            a = 2 * math.pi * i / (gores * 3)
            scallop = 1.0 - 0.06 * (1 - abs(math.cos(math.pi * (i % 3) / 3))) * t
            r = R * math.sin(t * math.pi / 2) * scallop
            z = z0 + Hc * math.cos(t * math.pi / 2) - (0.06 * t if i % 3 == 0 else 0)
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        grid.append(row)
    n = gores * 3
    for j in range(rings):
        for i in range(n):
            bm.faces.new((grid[j][i], grid[j][(i + 1) % n], grid[j + 1][(i + 1) % n], grid[j + 1][i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    can = obj('canopy', bm, cloth, top)
    cloth.use_backface_culling = False
    cords = []
    for i in range(gores):
        a = 2 * math.pi * i * 3 / n
        p = Vector((R * 0.94 * math.cos(a), R * 0.94 * math.sin(a), z0 - 0.06))
        q = Vector((0, 0, 0.62))
        cords.append(cyl_bm(0.006, 0.006, (p - q).length, 4, tuple((p - q).normalized()), tuple(q), caps=False))
    flat_shade(obj('cords', merge(cords), cord, top))
    bb = bmesh.new()
    bmesh.ops.create_uvsphere(bb, u_segments=16, v_segments=10, radius=0.26)
    for v in bb.verts:
        v.co.z *= 0.95
        v.co.z += 0.25
        if v.co.z > 0.42:
            v.co.x *= 0.45
            v.co.y *= 0.45
    neck = cyl_bm(0.05, 0.08, 0.14, 12, (0, 0, 1), (0, 0, 0.46))
    obj('money_bag', merge([bb, neck]), sack, top)
    return top, [('side', (3.4, -5.0, 1.8), (0, 0, 1.3), 40)]


def shark_fin():
    """A dorsal fin cutting the water (S12): 0.45 m tall, origin on the waterline, leading edge forward."""
    skin = lib.flat('fin_skin', (0.07, 0.085, 0.1), rough=0.35)
    top = root('shark_fin')
    prof = [(0.0, -0.28), (0.12, -0.16), (0.3, -0.02), (0.45, 0.12), (0.42, 0.16), (0.25, 0.14), (0.08, 0.2), (0.0, 0.26)]
    bm = bmesh.new()
    rows = []
    for k, w in ((0, 0.045), (1, 0.0), (2, -0.045)):
        rows.append([bm.verts.new((w * (1 - z / 0.5), y, z)) for z, y in prof])
    m = len(prof)
    for a, b in ((0, 1), (1, 2)):
        for i in range(m - 1):
            bm.faces.new((rows[a][i], rows[a][i + 1], rows[b][i + 1], rows[b][i]))
    bm.faces.new([rows[0][i] for i in range(m)][::-1])
    bm.faces.new([rows[2][i] for i in range(m)])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj('fin', bm, skin, top)
    return top, [('side', (1.4, -0.4, 0.3), (0, 0, 0.2), 40)]


def giant_bucket():
    """The giant gold bucket on its chain (S15): 1.0 m tall; the chain hangs from the handle top, 3 m."""
    g = gold('bucket_gold', 0.3)
    dark = lib.flat('bucket_band', (0.55, 0.38, 0.12), rough=0.35, metal=1.0)
    top = root('giant_bucket')
    prof = [(0.0, 0.0), (0.42, 0.0), (0.44, 0.02), (0.55, 0.98), (0.58, 1.0), (0.56, 1.03), (0.52, 1.01), (0.41, 0.06), (0.0, 0.06)]
    body = obj('bucket', lathe(prof, 40, axis='Z'), g, top)
    bands = merge([cyl_bm(0.445 + 0.11 * t + 0.012, 0.445 + 0.11 * t + 0.012, 0.05, 40, (0, 0, 1), (0, 0, 0.96 * t + 0.02 - 0.025), caps=False) for t in (0.2, 0.75)])
    obj('bucket_bands', bands, dark, top)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.58, minor_radius=0.025, major_segments=32, minor_segments=8,
                                     location=(0, 0, 1.0), rotation=(math.pi / 2, 0, 0))
    hnd = bpy.context.active_object
    for c in list(hnd.users_collection):
        c.objects.unlink(hnd)
    COLL.objects.link(hnd)
    hb = bmesh.new()
    hb.from_mesh(hnd.data)
    bmesh.ops.delete(hb, geom=[v for v in hb.verts if v.co.y < -0.05], context='VERTS')   # keep the upper half (local y up after the turn)
    hb.to_mesh(hnd.data)
    hb.free()
    hnd.data.materials.append(g)
    lib.apply([hnd])
    hnd.name = 'handle'
    hnd.parent = top
    links = []
    z = 1.58
    k = 0
    while z < 1.58 + 3.0:
        bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.014, major_segments=12, minor_segments=6,
                                         location=(0, 0, z - 1.58), rotation=(0, math.pi / 2 if k % 2 else 0, 0))
        lk = bpy.context.active_object
        lk.scale = (1, 1, 1.6) if False else (1.0, 1.0, 1.0)
        for c in list(lk.users_collection):
            c.objects.unlink(lk)
        COLL.objects.link(lk)
        links.append(lk)
        z += 0.1
        k += 1
    for lk in links:
        lk.data.materials.append(g)
    lib.apply(links)
    chain = lib.join(links, 'chain')
    chain.location = (0, 0, 1.58)
    chain.parent = top
    lib.empty('chain_top', (0, 0, 1.58 + 3.0), coll=COLL, size=0.1).parent = top
    return top, [('side', (3.2, -4.2, 2.0), (0, 0, 1.4), 40)]


def fat_cat():
    """A fat cat asleep on a velvet cushion (S15, the bank balcony). The scan's blanket is cut away."""
    velvet = lib.pbr('cushion_velvet', 'velour_velvet', 512, 256, tint=(0.75, 0.18, 0.2))
    tassel = gold('cushion_gold', 0.35)
    top = root('fat_cat')
    got = lib.import_gltf(tex('cat_raw.glb'), COLL)
    o = list(got.values())[0]
    o.name = 'cat'
    bm = bmesh.new()
    bm.from_mesh(o.data)
    high = [v.co for v in bm.verts if v.co.z > 0.07]
    cx = sum(c.x for c in high) / len(high)
    cy = sum(c.y for c in high) / len(high)
    def blanket(f):
        c = f.calc_center_median()
        inside = ((c.x - cx) / 0.24) ** 2 + ((c.y - cy) / 0.17) ** 2 < 1.0
        return c.z < 0.05 or (not inside and c.z < 0.1)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if blanket(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    zmin_ = min(v.co.z for v in bm.verts)
    bmesh.ops.translate(bm, vec=(-cx, -cy, -zmin_ + 0.085), verts=bm.verts)
    bmesh.ops.scale(bm, vec=(1.12, 1.12, 1.0), verts=bm.verts)
    bm.to_mesh(o.data)
    bm.free()
    o.parent = top
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    cw, cd = max(xs) - min(xs) + 0.12, max(ys) - min(ys) + 0.12
    cu = box_bm(cw, cd, 0.09, (0, 0, 0.045))
    bmesh.ops.bevel(cu, geom=[e for e in cu.edges], offset=0.035, segments=3, affect='EDGES')
    c = obj('cushion', cu, velvet, top)
    uvbox(c, 0.4)
    tas = merge([cyl_bm(0.012, 0.022, 0.06, 8, (0, 0, -1), (sx * cw / 2, sy * cd / 2, 0.06)) for sx in (-1, 1) for sy in (-1, 1)])
    obj('cushion_tassels', tas, tassel, top)
    return top, [('side', (0.9, -0.9, 0.6), (0, 0, 0.1), 40)]


def fountain():
    """The square's fountain (S05, S12, S21): stone basin 3.2 m across, a column with a bowl and a jet.
    `fountain_water` and `bowl_water` are the water surfaces; `jet` is the falling water. Hide them when dry."""
    stone = lib.pbr('fountain_stone', 'white_sandstone_blocks_02', 512, 256)
    water = lib.flat('fountain_water', (0.06, 0.13, 0.14), rough=0.05)
    jet_m = lib.flat('fountain_jet', (0.6, 0.72, 0.75), rough=0.1, alpha=0.6)
    top = root('fountain')
    wall = lathe([(1.35, 0.0), (1.6, 0.0), (1.62, 0.42), (1.66, 0.5), (1.3, 0.5), (1.32, 0.42), (1.35, 0.05)], 48, axis='Z')
    floor = cyl_bm(1.36, 1.36, 0.05, 48, (0, 0, 1), (0, 0, 0))
    col = lathe([(0.0, 0.0), (0.32, 0.0), (0.32, 0.12), (0.2, 0.2), (0.16, 0.9), (0.24, 1.0), (0.55, 1.12), (0.58, 1.2),
                 (0.5, 1.22), (0.18, 1.12), (0.1, 1.24), (0.14, 1.4), (0.06, 1.48), (0.0, 1.5)], 32, axis='Z')
    s = obj('fountain_stone', merge([wall, floor, col]), stone, top)
    uvbox(s, 0.8)
    obj('fountain_water', disc_z(1.34, 0.36, 48), water, top)
    obj('bowl_water', disc_z(0.49, 1.19, 32), water, top)
    jet = merge([cyl_bm(0.025, 0.012, 0.25, 8, (0, 0, 1), (0, 0, 1.45)),
                 lathe([(0.5, 1.2), (0.53, 1.0), (0.58, 0.7), (0.62, 0.4)], 32, axis='Z')])
    jo = obj('jet', jet, jet_m, top)
    jet_m.use_backface_culling = False
    return top, [('three_quarter', (3.6, -4.6, 2.4), (0, 0, 0.6), 35)]


def disc_z(r, z, segments=32):
    bm = bmesh.new()
    c = bm.verts.new((0, 0, z))
    ring = [bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for a in (2 * math.pi * i / segments for i in range(segments))]
    for i in range(segments):
        bm.faces.new((c, ring[i], ring[(i + 1) % segments]))
    return bm


def old_pump():
    """The rusty old pump by the bench (S21–S23, S29): 1930s plaque on its stone base; the handle turns."""
    rust = lib.pbr('pump_rust', 'green_metal_rust', 512, 256, tint=(0.75, 0.55, 0.42))
    stone = lib.pbr('pump_stone', 'granite_tile', 512, 256)
    brass = lib.textured('pump_plaque', tex('plaque_1933.png'), rough=0.35, metal=0.9)
    water = lib.flat('pump_water', (0.55, 0.7, 0.75), rough=0.05, alpha=0.7)
    top = root('old_pump')
    base = box_bm(0.5, 0.5, 0.45, (0, 0, 0.225))
    sb = obj('pump_base', base, stone, top)
    uvbox(flat_shade(sb), 0.6)
    body = lathe([(0.0, 0.45), (0.13, 0.45), (0.13, 0.5), (0.09, 0.53), (0.085, 1.05), (0.11, 1.08), (0.12, 1.16), (0.07, 1.2), (0.0, 1.2)], 20, axis='Z')
    spout = cyl_bm(0.032, 0.026, 0.3, 12, (0, -1, -0.25), (0, -0.07, 0.98))
    bo = obj('pump_body', merge([body, spout]), rust, top)
    uvbox(bo, 0.4)
    pivot = Vector((0, 0.1, 1.17))
    hb = merge([cyl_bm(0.018, 0.014, 0.62, 8, (0, 1, 0.35), (0, 0, 0)), cyl_bm(0.03, 0.03, 0.08, 10, (1, 0, 0), (-0.04, 0, 0))])
    h = obj('pump_handle', hb, rust, top)
    h.location = pivot
    uvbox(h, 0.4)
    pb = bmesh.new()
    vs = [pb.verts.new(p) for p in ((-0.16, -0.252, 0.12), (0.16, -0.252, 0.12), (0.16, -0.252, 0.32), (-0.16, -0.252, 0.32))]
    pb.faces.new(vs)
    planar_uv(pb, (0, 2), (-0.16, 0.12), (0.16, 0.32))
    flat_shade(obj('plaque', pb, brass, top))
    sp = Vector((0, -0.07, 0.98)) + Vector((0, -1, -0.25)).normalized() * 0.3
    stream = obj('pump_water_stream', cyl_bm(0.02, 0.026, sp.z, 8, (0, 0, -1), tuple(sp), caps=False), water, top)
    lib.empty('pump_spout', tuple(sp), coll=COLL, size=0.05).parent = top
    lib.empty('pump_priming_cup', (0, 0, 1.21), coll=COLL, size=0.05).parent = top
    lib.empty('pump_handle_grip', tuple(pivot + Vector((0, 1, 0.35)).normalized() * 0.6), coll=COLL, size=0.05).parent = top
    return top, [('three_quarter', (1.5, -2.0, 1.4), (0, 0, 0.75), 40)]


def stone_trough():
    """One 1 m stone channel (S23), to lay end to end; water strip on its bottom (scale it along its length)."""
    stone = lib.pbr('trough_stone', 'granite_tile', 512, 256, tint=(0.9, 0.88, 0.84))
    water = lib.flat('trough_water', (0.82, 0.62, 0.2), rough=0.1, metal=0.4, emissive=(0.25, 0.18, 0.04))
    top = root('stone_trough')
    Wd, Hh, L, t = 0.36, 0.2, 1.0, 0.06
    parts = [box_bm(Wd, L, t, (0, L / 2, t / 2)), box_bm(t, L, Hh, (-Wd / 2 + t / 2, L / 2, Hh / 2)), box_bm(t, L, Hh, (Wd / 2 - t / 2, L / 2, Hh / 2))]
    s = obj('trough', merge(parts), stone, top)
    uvbox(flat_shade(s), 0.5)
    wb = bmesh.new()
    vs = [wb.verts.new(p) for p in ((-Wd / 2 + t, 0, t + 0.04), (Wd / 2 - t, 0, t + 0.04), (Wd / 2 - t, L, t + 0.04), (-Wd / 2 + t, L, t + 0.04))]
    wb.faces.new(vs)
    flat_shade(obj('trough_water', wb, water, top))
    return top, [('three_quarter', (1.0, -1.0, 0.9), (0, 0.5, 0.1), 40)]


def sandbag():
    burlap = lib.textured('sandbag_burlap', tex('burlap.png'), rough=0.95)
    top = root('sandbag')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        r = max(abs(x), abs(y), abs(z)) or 1
        v.co = Vector((x, y, z)) / r * 0.5
        v.co = Vector((v.co.x * 0.6, v.co.y * 0.35, v.co.z * 0.16))
        v.co.z *= 1.0 - 0.35 * (abs(v.co.x) / 0.3) ** 2
        v.co.z += 0.075
    bm.verts.ensure_lookup_table()
    me_ = obj('sandbag', bm, burlap, top)
    bpy.context.view_layer.update()
    lib.box_uv(me_, 0.4)
    return top, [('three_quarter', (0.8, -0.9, 0.6), (0, 0, 0.06), 40)]


def treasury_jug():
    g = gold('jug_gold', 0.25)
    band = lib.flat('jug_band', (0.5, 0.33, 0.1), rough=0.3, metal=1.0)
    top = root('treasury_jug')
    prof = [(0.0, 0.0), (0.12, 0.0), (0.13, 0.02), (0.11, 0.05), (0.18, 0.14), (0.21, 0.26), (0.19, 0.38), (0.11, 0.48),
            (0.085, 0.54), (0.1, 0.6), (0.11, 0.62), (0.1, 0.63), (0.075, 0.56), (0.0, 0.56)]
    j = lathe(prof, 40, axis='Z')
    for v in j.verts:   # pull the lip into a spout toward -Y
        if v.co.z > 0.57 and v.co.y < -0.04:
            v.co.y -= 0.05 * (v.co.z - 0.57) / 0.06 + 0.02
    obj('jug', j, g, top)
    obj('jug_band', merge([cyl_bm(0.214, 0.214, 0.03, 40, (0, 0, 1), (0, 0, 0.245), caps=False)]), band, top)
    pts = [Vector((0, 0.1, 0.5)), Vector((0, 0.24, 0.48)), Vector((0, 0.27, 0.36)), Vector((0, 0.22, 0.22)), Vector((0, 0.18, 0.18))]
    segs = [cyl_bm(0.018, 0.018, (pts[i + 1] - pts[i]).length + 0.01, 8, tuple((pts[i + 1] - pts[i]).normalized()), tuple(pts[i])) for i in range(len(pts) - 1)]
    obj('jug_handle', merge(segs), g, top)
    lib.empty('jug_spout', (0, -0.17, 0.62), coll=COLL, size=0.04).parent = top
    lib.empty('jug_grip', (0, 0.26, 0.38), coll=COLL, size=0.04).parent = top
    return top, [('three_quarter', (0.9, -1.1, 0.7), (0, 0, 0.3), 40)]


def sprouts():
    leaf = lib.flat('sprout_leaf', (0.1, 0.32, 0.06), rough=0.6)
    leaf.use_backface_culling = False
    stem = lib.flat('sprout_stem', (0.18, 0.3, 0.08), rough=0.7)
    top = root('sprouts')
    rng = __import__('random').Random(9)
    leaves, stems = [], []
    for k in range(7):
        x, y = rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06)
        h = rng.uniform(0.05, 0.12)
        stems.append(cyl_bm(0.003, 0.002, h, 5, (rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 1), (x, y, 0), caps=False))
        a0 = rng.uniform(0, math.pi)
        for side in (0, math.pi):
            a = a0 + side
            lb = bmesh.new()
            L_ = rng.uniform(0.025, 0.04)
            pts = [(0, 0), (0.35 * L_, 0.012), (L_, 0), (0.35 * L_, -0.012)]
            vs = [lb.verts.new((px, py, 0)) for px, py in pts]
            lb.faces.new(vs)
            bmesh.ops.rotate(lb, verts=lb.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-0.4, 3, 'Y'))
            bmesh.ops.rotate(lb, verts=lb.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Z'))
            bmesh.ops.translate(lb, vec=(x, y, h), verts=lb.verts)
            leaves.append(lb)
    flat_shade(obj('sprout_leaves', merge(leaves), leaf, top))
    obj('sprout_stems', merge(stems), stem, top)
    return top, [('three_quarter', (0.25, -0.3, 0.22), (0, 0, 0.06), 40)]


def lunch_pail():
    tin = lib.flat('pail_tin', (0.46, 0.48, 0.5), rough=0.45, metal=0.8)
    lid = lib.flat('pail_lid', (0.25, 0.32, 0.4), rough=0.5, metal=0.5)
    top = root('lunch_pail')
    body = box_bm(0.26, 0.17, 0.15, (0, 0, 0.075))
    bmesh.ops.bevel(body, geom=[e for e in body.edges], offset=0.02, segments=2, affect='EDGES')
    obj('pail', body, tin, top)
    lb = cyl_bm(0.085, 0.085, 0.26, 16, (1, 0, 0), (-0.13, 0, 0.15))
    for v in lb.verts:
        if v.co.z < 0.15:
            v.co.z = 0.15
    obj('pail_lid', lb, lid, top)
    hp = [Vector((-0.07, 0, 0.23)), Vector((-0.06, 0, 0.29)), Vector((0.06, 0, 0.29)), Vector((0.07, 0, 0.23))]
    obj('pail_handle', merge([cyl_bm(0.004, 0.004, (hp[i + 1] - hp[i]).length, 6, tuple((hp[i + 1] - hp[i]).normalized()), tuple(hp[i]), caps=False) for i in range(3)]), tin, top)
    return top, [('three_quarter', (0.55, -0.65, 0.45), (0, 0, 0.12), 40)]


def factory_wheel():
    """A big flywheel for the factory wall (S21 still, S23 turning): 2.4 m across; `wheel` turns about its axle (local Z in three.js)."""
    iron = lib.flat('wheel_iron', (0.12, 0.12, 0.13), rough=0.55, metal=0.8)
    red = lib.flat('wheel_red', (0.42, 0.1, 0.08), rough=0.6, metal=0.3)
    top = root('factory_wheel')
    wheel = root('wheel')
    wheel.parent = top
    R = 1.2
    rim = lathe([(R - 0.1, -0.08), (R, -0.08), (R, 0.08), (R - 0.1, 0.08), (R - 0.1, -0.08)], 48, axis='Y')
    hub = cyl_bm(0.16, 0.16, 0.24, 20, (0, 1, 0), (0, -0.12, 0))
    spokes = []
    for k in range(6):
        a = k * math.pi / 3
        d = Vector((math.cos(a), 0, math.sin(a)))
        spokes.append(cyl_bm(0.05, 0.035, R - 0.2, 8, tuple(d), tuple(d * 0.12)))
    teeth = []
    for k in range(48):
        a = 2 * math.pi * k / 48
        t = box_bm(0.07, 0.1, 0.07, (math.cos(a) * (R + 0.03), 0, math.sin(a) * (R + 0.03)))
        bmesh.ops.rotate(t, verts=t.verts, cent=(math.cos(a) * (R + 0.03), 0, math.sin(a) * (R + 0.03)), matrix=Matrix.Rotation(-a, 3, 'Y'))
        teeth.append(t)
    flat_shade(obj('wheel_iron', merge([rim, hub] + spokes + teeth), iron, wheel))
    obj('wheel_hub_cap', cyl_bm(0.1, 0.06, 0.06, 16, (0, -1, 0), (0, -0.12, 0)), red, wheel)
    bracket = merge([box_bm(0.3, 0.12, 0.3, (0, 0.18, 0)), box_bm(0.16, 0.08, 1.4, (0, 0.2, -0.7))])
    flat_shade(obj('wheel_bracket', bracket, red, top))
    return top, [('front', (1.8, -5.0, 0.6), (0, 0, 0), 40)]


def lectern():
    wood = lib.pbr('lectern_wood', 'dark_planks', 512, 256)
    top = root('lectern')
    parts = [box_bm(0.5, 0.36, 0.04, (0, 0, 0.02)), box_bm(0.36, 0.28, 1.0, (0, 0.02, 0.52))]
    desk = box_bm(0.62, 0.46, 0.05, (0, 0, 1.1))
    bmesh.ops.rotate(desk, verts=desk.verts, cent=(0, 0, 1.1), matrix=Matrix.Rotation(math.radians(-18), 3, 'X'))
    parts.append(desk)
    parts.append(box_bm(0.62, 0.03, 0.05, (0, -0.24, 1.07)))
    o = obj('lectern', merge(parts), wood, top)
    uvbox(flat_shade(o), 0.6)
    lib.empty('lectern_top', (0, 0.05, 1.16), coll=COLL, size=0.05).parent = top
    lib.empty('speaker', (0, 0.55, 0), coll=COLL, size=0.1).parent = top
    return top, [('three_quarter', (1.6, -2.2, 1.4), (0, 0, 0.7), 40)]


def water_line_plaque():
    bronze = lib.textured('plaque_water_line', tex('water_line.png'), rough=0.35, metal=0.9)
    edge = lib.flat('plaque_edge', (0.45, 0.32, 0.16), rough=0.4, metal=0.9)
    top = root('water_line_plaque')
    W, Hh, T = 0.44, 0.28, 0.012
    bm = box_bm(W, T, Hh, (0, -T / 2, 0))
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        front = f.normal.y < -0.9
        f.material_index = 0 if front else 1
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x + W / 2) / W, (l.vert.co.z + Hh / 2) / Hh) if front else (0.5, 0.5)
    flat_shade(obj('plaque', bm, [bronze, edge], top))
    lib.empty('water_line', (0, -T, 0.0), coll=COLL, size=0.05).parent = top
    return top, [('front', (0.3, -1.0, 0.1), (0, 0, 0), 40)]


def ivy_wall():
    """What is left of the firewall in 2041 (S29): a 3 m brick wall, ivy over it."""
    brick = lib.pbr('ivy_brick', 'red_brick_03', 512, 256)
    leaf = lib.textured('ivy_leaves', tex('ivy_colours.png'), rough=0.6)
    leaf.use_backface_culling = False
    top = root('ivy_wall')
    W, Hh, T = 3.0, 1.5, 0.36
    wall = box_bm(W, T, Hh, (0, 0, Hh / 2))
    cap = box_bm(W + 0.06, T + 0.06, 0.06, (0, 0, Hh + 0.03))
    w = obj('wall', merge([wall, cap]), brick, top)
    uvbox(flat_shade(w), 1.2)
    rng = __import__('random').Random(2)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    vines = [(rng.uniform(-1.3, 1.3), rng.uniform(0.6, 1.0)) for _ in range(6)]
    for vx, reach in vines:
        for k in range(70):
            t = k / 70
            face = rng.choice([(-1, 'front'), (1, 'back'), (0, 'top')]) if t > 0.75 else (-1, 'front')
            x = vx + math.sin(t * 7 + vx) * 0.25 + rng.uniform(-0.12, 0.12)
            z = t * Hh * reach * 1.05 + rng.uniform(-0.05, 0.05)
            if abs(x) > W / 2 - 0.05 or z > Hh:
                continue
            y = -T / 2 - 0.01
            s = rng.uniform(0.05, 0.085)
            a = rng.uniform(0, 2 * math.pi)
            pts = [(0, 0.55), (0.45, 0.25), (0.35, -0.35), (0, -0.55), (-0.35, -0.35), (-0.45, 0.25)]
            c = rng.randrange(4)
            vs = []
            for px, pz in pts:
                rx = px * math.cos(a) - pz * math.sin(a)
                rz = px * math.sin(a) + pz * math.cos(a)
                vs.append(bm.verts.new((x + rx * s, y - abs(rx) * 0.15 * s - 0.004 * rng.random(), z + rz * s)))
            f = bm.faces.new(vs)
            for l in f.loops:
                l[uvl].uv = ((c + 0.5) / 4, 0.5)
    flat_shade(obj('ivy', bm, leaf, top))
    return top, [('three_quarter', (2.4, -4.2, 1.6), (0, 0, 0.75), 40)]


BUILD = {f.__name__: f for f in (pocket_watch, microphones, signs, card_bank, clipping_book, broadcast_screen, loaves,
                                 hatch_cover, golden_parachute, shark_fin, giant_bucket, fat_cat, fountain, old_pump,
                                 stone_trough, sandbag, treasury_jug, sprouts, lunch_pail, factory_wheel, lectern,
                                 water_line_plaque, ivy_wall)}
top, views = BUILD[PROP]()
bpy.context.view_layer.update()
t, calls = lib.stats(COLL)
dims = top.matrix_world
lib.write_json(os.path.join(HERE, 'stats', f'{PROP}.json'), {'triangles': t, 'draw_calls_if_unmerged': calls,
                                                             'nodes': sorted(o.name for o in COLL.all_objects)})
print('STATS', PROP, t, calls)
lib.export_glb(OUT, COLL)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    lib.render_views(views, PREVIEW, PROP, HDRI, size=(800, 600), samples=24)
