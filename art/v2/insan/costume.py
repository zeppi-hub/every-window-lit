"""A circus costume painted into a Rocketbox body's own photo texture (one material, no extra draw).

Each pixel of the body picture is given a region from the skin weights (the CMU bone names of
rocketbox.py) interpolated across its triangle, so borders run as smooth curves; hands, wrist wraps
and cuffs go by how far up the forearm the point lies (on the rest skeleton). The regions:

  sequin  the colour, shaded like the body under it, with small brighter discs scattered over it
  satin   the colour, shaded, with a soft sheen across the middle of each limb
  plain   the colour, shaded
  chalk   the skin under it, whitened (the trapeze catcher's hands)
  skin    left as it is

"Shaded" keeps the broad light and dark of the photo (a blur of its brightness, without the
original clothes' own colours) so the fabric still shows the body's form. A region with a trim
gets a gold line where it meets a region of another kind. Pixels round the painted islands are
filled with the painted colour so no skin bleeds in at a distance (texture mip levels).

The region of each face is kept as the face attribute "costume" (index into the region list,
-1 for none), so a later step can split, say, the chalked hands into their own meshes.
"""
import math

import numpy as np
from mathutils import Vector

TRUNK = {'Hips', 'LowerBack', 'Spine', 'Spine1', 'LHipJoint', 'RHipJoint', 'LeftShoulder', 'RightShoulder'}
ARMS = {'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'}
LEGS = {'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'}
FEET = {'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'}
HANDS = {'Left': {'LeftHand', 'LeftFingerBase', 'LeftHandFinger1', 'LThumb'},
         'Right': {'RightHand', 'RightFingerBase', 'RightHandFinger1', 'RThumb'}}


def srgb(hexcolour):
    return np.array([((hexcolour >> 16) & 255) / 255, ((hexcolour >> 8) & 255) / 255, (hexcolour & 255) / 255])


def _dominant(obj):
    names = {g.index: g.name for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        best, bw = None, 0.0
        for g in v.groups:
            if g.weight > bw:
                best, bw = names.get(g.group), g.weight
        out.append(best)
    return out


def _photo_colour(obj, image):
    """The body picture's colour at the middle of each face's UVs (sRGB), for regions picked by the
    photo's own clothes."""
    W, H = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)
    uv = obj.data.uv_layers[0].data
    out = []
    for poly in obj.data.polygons:
        u = sum(uv[li].uv.x for li in poly.loop_indices) / poly.loop_total
        v = sum(uv[li].uv.y for li in poly.loop_indices) / poly.loop_total
        x, y = min(W - 1, max(0, int(u * W))), min(H - 1, max(0, int(v * H)))
        out.append(px[y, x, :3])
    return out


PHOTO = {
    # light, unsaturated cloth (white shorts, a white top)
    'white': lambda c: min(c) > 0.55 and max(c) - min(c) < 0.14,
}
PHOTO_PX = {
    'white': lambda c: (c.min(1) > 0.55) & (c.max(1) - c.min(1) < 0.14),
}


def classify(obj, rig, regions, material_index=0, image=None):
    """Region index per face (-1: none). A region is a dict with 'groups' (a set of bone names,
    most of the face's vertices must be carried by them) and optionally 'wrist': (near, far) in
    metres up the forearm from the wrist, for hand, wrap and cuff regions (both sides). The first
    region that takes a face wins. 'wrist' (near, far) is measured up the forearm from the wrist joint,
so the hand itself lies below 0."""
    dom = _dominant(obj)
    bones = rig.data.bones
    wrist = {s: bones[f'{s}Hand'].head_local.copy() for s in ('Left', 'Right')}
    up_arm = {s: (bones[f'{s}ForeArm'].head_local - bones[f'{s}Hand'].head_local).normalized() for s in ('Left', 'Right')}
    me = obj.data
    photo = _photo_colour(obj, image) if image is not None and any('photo' in r for r in regions) else None
    out = []
    for poly in me.polygons:
        if poly.material_index != material_index:
            out.append(-1)
            continue
        ds = [dom[i] for i in poly.vertices]
        centre = sum((me.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
        got = -1
        for k, r in enumerate(regions):
            if 'wrist' in r:
                near, far = r['wrist']
                for s in ('Left', 'Right'):
                    if any(g in HANDS[s] or g == f'{s}ForeArm' for g in ds):
                        along = (centre - wrist[s]).dot(up_arm[s])     # metres up the forearm from the wrist
                        if near <= along < far:
                            got = k
                if got >= 0:
                    break
            elif sum(1 for g in ds if g in r['groups']) * 2 > len(ds):
                if 'photo' in r and not (photo is not None and PHOTO[r['photo']](photo[poly.index])):
                    continue
                got = k
                break
        out.append(got)
    attr = me.attributes.get('costume') or me.attributes.new('costume', 'INT', 'FACE')
    attr.data.foreach_set('value', out)
    return out


def _features(obj, rig, regions):
    """Per vertex: one column per group region (the share of the vertex's weight its groups carry),
    then for each side the share carried by that side's hand and forearm, and how far up the
    forearm the vertex lies (metres from the wrist joint, on the rest skeleton)."""
    names = {g.index: g.name for g in obj.vertex_groups}
    bones = rig.data.bones
    wrist = {s: bones[f'{s}Hand'].head_local.copy() for s in ('Left', 'Right')}
    up_arm = {s: (bones[f'{s}ForeArm'].head_local - bones[f'{s}Hand'].head_local).normalized() for s in ('Left', 'Right')}
    group_regions = [r for r in regions if 'groups' in r]
    F = np.zeros((len(obj.data.vertices), len(group_regions) + 4))
    for v in obj.data.vertices:
        tot = sum(g.weight for g in v.groups) or 1.0
        for g in v.groups:
            n = names.get(g.group)
            for j, r in enumerate(group_regions):
                if n in r['groups']:
                    F[v.index, j] += g.weight / tot
            for c, s in ((0, 'Left'), (2, 'Right')):
                if n in HANDS[s] or n == f'{s}ForeArm':
                    F[v.index, len(group_regions) + c] += g.weight / tot
        for c, s in ((1, 'Left'), (3, 'Right')):
            F[v.index, len(group_regions) + c] = (v.co - wrist[s]).dot(up_arm[s])
    return F


def _raster(obj, rig, regions, rgb):
    """An id map (H, W) decided pixel by pixel from the vertex features interpolated across each
    triangle, so region borders are smooth curves, not the triangles' teeth: the first region whose
    test holds (group share over a half; for wrist regions, on a hand or forearm and within the
    band up the forearm; for photo regions, the picture's own pixel too). -2 where no face of the
    body material lies, -1 where a face lies but no region takes it. Triangles are grown by 0.7 px."""
    H, W = rgb.shape[:2]
    me = obj.data
    uv = me.uv_layers[0].data
    F = _features(obj, rig, regions)
    ng = sum(1 for r in regions if 'groups' in r)
    ids = np.full((H, W), -2, dtype=np.int16)
    for poly in me.polygons:
        if poly.material_index != 0:
            continue
        pts = [(uv[li].uv.x * W - 0.5, uv[li].uv.y * H - 0.5) for li in poly.loop_indices]
        vs = list(poly.vertices)
        for t in range(1, len(pts) - 1):
            (ax, ay), (bx, by), (cx, cy) = pts[0], pts[t], pts[t + 1]
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-9:
                continue
            x0, x1 = max(int(math.floor(min(ax, bx, cx) - 1)), 0), min(int(math.ceil(max(ax, bx, cx) + 1)), W - 1)
            y0, y1 = max(int(math.floor(min(ay, by, cy) - 1)), 0), min(int(math.ceil(max(ay, by, cy) + 1)), H - 1)
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            sgn = 1 if den > 0 else -1
            inside = np.ones(xs.shape, dtype=bool)
            for (px_, py_), (qx, qy) in (((ax, ay), (bx, by)), ((bx, by), (cx, cy)), ((cx, cy), (ax, ay))):
                ex, ey = qx - px_, qy - py_
                ln = math.hypot(ex, ey) or 1.0
                inside &= sgn * (ex * (ys - py_) - ey * (xs - px_)) / ln >= -0.7
            if not inside.any():
                continue
            X, Y = xs[inside], ys[inside]
            l1 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / den
            l2 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / den
            lam = np.clip(np.stack([l1, l2, 1 - l1 - l2], 1), 0, None)
            lam /= lam.sum(1, keepdims=True)
            f = lam @ F[[vs[0], vs[t], vs[t + 1]]]
            reg = np.full(len(X), -1, dtype=np.int16)
            open_ = np.ones(len(X), dtype=bool)
            j = 0
            for k, r in enumerate(regions):
                if 'groups' in r:
                    q = f[:, j] > 0.5
                    j += 1
                    if 'photo' in r:
                        q &= PHOTO_PX[r['photo']](rgb[Y, X])
                else:
                    near, far = r['wrist']
                    q = np.zeros(len(X), dtype=bool)
                    for c in (0, 2):
                        q |= (f[:, ng + c] > 0.5) & (f[:, ng + c + 1] >= near) & (f[:, ng + c + 1] < far)
                take = open_ & q
                reg[take] = k
                open_ &= ~take
            ids[Y, X] = reg
    return ids


def _blur(a, r):
    """Box blur of radius r, three times (about a Gaussian), edges clamped."""
    out = a.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0), (0, 0)]
            pad[axis] = (r + 1, r)
            p = np.pad(out, pad, mode='edge')
            c = np.cumsum(p, axis=axis)
            if axis == 0:
                out = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
            else:
                out = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return out


def _grow(mask, r):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r and (dx or dy):
                out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def paint(obj, rig, image, regions, seed=7):
    """Paints the regions into the image (an sRGB picture, packed afterwards by the caller), deciding
    the region pixel by pixel; returns the pixel count of each region."""
    W, H = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)
    rgb = px[:, :, :3].astype(np.float64)
    ids = _raster(obj, rig, regions, rgb)
    Y = rgb @ np.array([0.299, 0.587, 0.114])
    # skin is warm (red over green over blue); the photo's own clothes are not: pink or blue cloth
    # (blue over green), white or grey cloth (no warmth), and very dark creases
    r_, g_, b_ = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    skinlike = (r_ > g_) & (g_ >= b_ - 0.02) & (r_ - b_ > 0.06) & (Y > 0.16)
    # where the body stays bare, the photo's own clothes (a bikini's straps, a vest's edge) give way
    # to the skin round them
    bare = ids == -1
    cloth = bare & ~skinlike & (Y > 0.12)
    if cloth.any():
        keep = bare & skinlike
        wk = _blur(keep.astype(np.float64), 10)
        fill = np.stack([_blur(np.where(keep, rgb[:, :, c], 0.0), 10) for c in range(3)], 2) / np.maximum(wk, 1e-6)[:, :, None]
        fix = cloth & (wk > 0.05)
        rgb = rgb.copy()
        rgb[fix] = fill[fix]
    rng = np.random.default_rng(seed)
    out = rgb.copy()
    painted = np.zeros((H, W), dtype=bool)
    for k, r in enumerate(regions):
        m = ids == k
        if not m.any() or r['style'] == 'skin':
            continue
        if r['style'] == 'chalk':
            c = srgb(r.get('colour', 0xf2eee6))
            amount = r.get('amount', 0.55)
            out[m] = rgb[m] * (1 - amount) + c * amount
            painted |= m
            continue
        ok = m & skinlike
        ref = float(np.median(Y[ok])) if ok.sum() > 50 else float(np.median(Y[m]))
        Yf = np.where(ok, Y, ref)
        wsum = _blur(m.astype(np.float64), 6)
        Yb = _blur(np.where(m, Yf, 0.0), 6) / np.maximum(wsum, 1e-6)
        shade = np.clip((Yb / max(ref, 1e-3)) ** 0.8, 0.62, 1.18)
        col = srgb(r['colour'])
        val = col[None, None, :] * shade[:, :, None]
        if r['style'] == 'satin':
            # a sheen along the limb: brighter where the photo is brighter than its blur (the limb's crest)
            crest = np.clip((_blur(np.where(m, Yf, 0.0), 2) / np.maximum(_blur(m.astype(np.float64), 2), 1e-6) - Yb) * 3.0, 0, 0.25)
            val = val + crest[:, :, None] * (1 - col[None, None, :])
        if r['style'] == 'sequin':
            dots = rng.random((H, W)) < r.get('density', 0.045)
            dots = dots & m
            bright = srgb(r.get('sparkle', 0xffffff))
            mix = rng.uniform(0.25, 0.6, size=(H, W))
            val = np.where(dots[:, :, None], val * (1 - mix[:, :, None]) + bright[None, None, :] * mix[:, :, None] * shade[:, :, None], val)
        out[m] = val[m]
        painted |= m
    # gold trim where a trimmed region meets a face of another region (not across UV seams)
    for k, r in enumerate(regions):
        if not r.get('trim'):
            continue
        m = ids == k
        others = (ids >= -1) & (ids != k)
        for j, r2 in enumerate(regions):
            if r2.get('trim') == r['trim'] and j != k and r2['style'] == r['style']:
                others &= ids != j
        edge = m & _grow(others, r.get('trim_px', 3))
        gold = srgb(r['trim'])
        shade = np.clip(Y / max(float(np.median(Y[m])) if m.any() else 0.5, 1e-3), 0.85, 1.15) ** 0.5
        out[edge] = (gold[None, None, :] * shade[:, :, None])[edge]
    # fill round the painted islands, so no skin colour bleeds in at the smaller mip levels
    paint_val = np.where(painted[:, :, None], out, 0.0)
    have = painted.copy()
    free = ids == -2
    for _ in range(6):
        acc = np.zeros_like(paint_val)
        cnt = np.zeros((H, W))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(np.where(have[:, :, None], paint_val, 0.0), dy, 0), dx, 1)
            cnt += np.roll(np.roll(have, dy, 0), dx, 1)
        new = free & ~have & (cnt > 0)
        paint_val[new] = acc[new] / cnt[new][:, None]
        have |= new
    grown = have & free
    out[grown] = paint_val[grown]
    px[:, :, :3] = np.clip(out, 0, 1).astype(np.float32)
    image.pixels[:] = px.ravel()
    image.update()
    return {r.get('name', str(k)): int((ids == k).sum()) for k, r in enumerate(regions)}


def performer_regions(look):
    """Regions for a circus performer. look: suit, trim (hex colours); optional tights (else the
    legs stay bare skin), shoes, sleeves (satin sleeves of the suit's colour), cuffs (gold bands
    above the wrists), chalk (whitened hands and wrist wraps, region 0), trunks ("white": the
    photo's own light shorts become trunks of the suit's colour over the tights)."""
    regs = []
    if look.get('chalk'):
        regs.append({'name': 'hands', 'wrist': (-1.0, 0.07), 'style': 'chalk', 'colour': 0xf4f1ea, 'amount': 0.6})
    if look.get('cuffs'):
        regs.append({'name': 'cuff', 'wrist': (0.07, 0.115), 'style': 'plain', 'colour': look['trim']})
    if look.get('trunks'):
        regs.append({'name': 'trunks', 'groups': TRUNK | {'LeftUpLeg', 'RightUpLeg'}, 'photo': look['trunks'], 'style': 'sequin',
                     'colour': look['suit'], 'sparkle': look['trim'], 'trim': look['trim']})
    regs.append({'name': 'suit', 'groups': TRUNK, 'style': 'sequin', 'colour': look['suit'], 'sparkle': look['trim'], 'trim': look['trim']})
    if look.get('sleeves'):
        regs.append({'name': 'sleeves', 'groups': ARMS, 'style': 'satin', 'colour': look['suit']})
    if look.get('tights'):
        regs.append({'name': 'tights', 'groups': LEGS, 'style': 'plain', 'colour': look['tights']})
    if look.get('shoes'):
        regs.append({'name': 'slippers', 'groups': FEET, 'style': 'plain', 'colour': look['shoes']})
    return regs


def catcher_regions(look):
    """The trapeze catcher of the game's look (circus-body.ts CATCHER_LOOK): a sequinned suit with
    gold trim, satin sleeves of the suit's colour with a gold cuff, chalked hands and wrist wraps
    (region 0), cream tights, dark slippers."""
    return performer_regions(dict(look, sleeves=True, cuffs=True, chalk=True))
