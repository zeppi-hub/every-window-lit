"""CMU motion capture onto MakeHuman's cmu_mb skeleton, and a check of every frame.

Used by build.py. The method, per frame:

1. Target reference pose. MakeHuman rests in an A-pose with bent elbows, the BVH in a
   T-pose. The target is put into the BVH's T-pose by forward kinematics, parents first:
   every bone follows its parent rigidly, then a limb bone swings (shortest turn) so it
   points where the source's rest bone points. Because children follow their parents
   before swinging, the forearm's twist stays tied to the upper arm's (the elbow unbends
   about its own hinge), which a swing in world space alone does not give.
2. Each source bone's world turn from its rest, D(t) = S(t) * S_rest^-1, is applied to the
   target's reference: W(t) = D(t) * T_ref. This holds for the trunk, neck, head, upper
   arms, thighs and feet.
3. Clavicles (LeftShoulder, RightShoulder) and the hip joints take no motion: they stay in
   their rest pose relative to their parent, so the shoulders keep their width.
4. Elbows and knees are hinges. The angle between upper and lower bone comes from the
   source, limited to 0..150 degrees, and the bend happens only about the hinge axis that
   MakeHuman's own rest bend defines. The upper bone is turned about its own length so its
   hinge plane holds the source's lower bone; elbow and wrist positions stay those of the
   source. Forearm twist (palm turning) follows the source within +-60 degrees.
5. Hands and fingers keep MakeHuman's relaxed rest relative to the forearm.

check() then plays every clip in Blender and measures each frame (see its docstring);
build.py stops when a rule does not hold.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
NAME_MAP = {'LeftHandFinger1': 'LeftHandIndex1', 'RightHandFinger1': 'RightHandIndex1'}
# Bones that follow their parent rigidly (no motion of their own).
RIGID = {'LeftHand', 'LeftFingerBase', 'LeftHandFinger1', 'LThumb', 'RightHand', 'RightFingerBase', 'RightHandFinger1', 'RThumb',
         'LeftShoulder', 'RightShoulder', 'LHipJoint', 'RHipJoint'}
# Limb bones swung onto the source's rest direction in the reference pose.
ALIGN = {f'{s}{b}' for s in ('Left', 'Right') for b in ('Arm', 'ForeArm', 'UpLeg', 'Leg', 'Foot', 'ToeBase')}
# (upper, lower, twist limit in degrees for the lower bone)
HINGES = (('LeftArm', 'LeftForeArm', 60.0), ('RightArm', 'RightForeArm', 60.0), ('LeftUpLeg', 'LeftLeg', 0.0), ('RightUpLeg', 'RightLeg', 0.0))
MAX_BEND = math.radians(150.0)

# Rules of check().
SHOULDER_KEEP = 0.97      # shoulder joints at least this share of their rest distance apart
ELBOW_AXIS = 0.18         # elbow at least this far (m) from the trunk's axis
ELBOW_OFF_AXIS = 15.0     # degrees out of the hinge plane at most
FACE_GAP = 0.12           # hand at least this far (m) from the face unless the clip needs it
TRUNK_MARGIN = 0.85       # the wrist is inside the trunk when inside 85 % of its measured cross-section


def horiz(v):
    return Vector((v.x, v.y, 0.0)).normalized()


def facing_from(lhip, rhip):
    """Forward direction from the two hip joints (world)."""
    return horiz(Vector((0, 0, 1)).cross(rhip - lhip))


def yaw_to(src_fwd, dst_fwd):
    a = math.atan2(dst_fwd.y, dst_fwd.x) - math.atan2(src_fwd.y, src_fwd.x)
    return Matrix.Rotation(a, 3, 'Z')


def rot3(m):
    return m.to_3x3().normalized()


def signed_angle(u, v, axis):
    """Angle turning u onto v about axis (radians, right hand)."""
    return math.atan2(axis.dot(u.cross(v)), u.dot(v))


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def twist_about_y(q):
    """Twist part (radians) of a local rotation about the bone's own Y axis."""
    return 2.0 * math.atan2(q.y, q.w)


class Target:
    """The target skeleton's rest data."""

    def __init__(self, rig, meshes):
        self.rig = rig
        self.tb = {b.name: b for b in rig.data.bones}
        self.order = [b.name for b in rig.data.bones]   # parents come before children
        self.RW = rot3(rig.matrix_world)
        self.rest = {n: rig.matrix_world @ self.tb[n].matrix_local for n in self.order}
        self.rest3 = {n: rot3(m) for n, m in self.rest.items()}
        fwd = facing_from(self.rest['LeftUpLeg'].translation, self.rest['RightUpLeg'].translation)
        toe = horiz((rig.matrix_world @ self.tb['LeftToeBase'].tail_local) - (rig.matrix_world @ self.tb['LeftToeBase'].head_local))
        self.flip = -1.0 if fwd.dot(toe) < 0 else 1.0
        self.forward = fwd * self.flip
        floor = min((rig.matrix_world @ self.tb[n].tail_local).z for n in ('LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'))
        self.hip_h = self.rest['Hips'].translation.z - floor
        self.sections = trunk_sections(self, meshes)
        self.face = face_point(self, meshes)

    def reference(self, src_dir):
        """World rotations of the target put into the source's rest pose (see module doc, step 1).
        src_dir: target bone name -> source rest direction (world, already turned to face forward)."""
        R = {}
        for n in self.order:
            b = self.tb[n]
            if b.parent and b.parent.name in R:
                p = b.parent.name
                cur = R[p] @ self.rest3[p].inverted() @ self.rest3[n]
            else:
                cur = self.rest3[n].copy()
            if n in ALIGN and n in src_dir:
                cur = cur.col[1].normalized().rotation_difference(src_dir[n]).to_matrix() @ cur
            R[n] = cur
        return R

    def hinge_frames(self, R):
        """For each hinge, the bend direction and hinge axis in the upper bone's reference frame,
        taken from MakeHuman's own rest bend (the lower bone following the upper rigidly)."""
        out = {}
        for up, lo, _ in HINGES:
            a = R[up].col[1].normalized()
            c = (R[up] @ self.rest3[up].inverted() @ self.rest3[lo]).col[1].normalized()
            f = c - a * c.dot(a)
            if f.length < 1e-3:
                raise SystemExit(f'HINGE {up}->{lo}: MakeHuman rest has no bend to take the hinge from')
            f_loc = R[up].inverted() @ f.normalized()
            h_loc = Vector((0, 1, 0)).cross(f_loc).normalized()
            out[up] = (f_loc, h_loc, math.degrees(math.acos(max(-1, min(1, a.dot(c))))))
        return out


def solve_hinge(W_up, d, f_loc, h_loc, rel):
    """Upper bone turned about its length so the bend plane holds d, and the lower bone bent
    about the hinge by the source angle (0..150 degrees). Returns (upper, lower, bend, twist used)."""
    a = W_up.col[1].normalized()
    d = d.normalized()
    p = d - a * d.dot(a)
    bend = math.atan2(p.length, d.dot(a))
    alpha = 0.0
    if p.length > 1e-5:
        f = (W_up @ f_loc).normalized()
        alpha = signed_angle(f, p.normalized(), a) * smoothstep(math.sin(math.radians(5)), math.sin(math.radians(25)), p.length)
    W_up2 = Matrix.Rotation(alpha, 3, a) @ W_up
    bend = min(bend, MAX_BEND)
    W_lo = W_up2 @ Matrix.Rotation(bend, 3, h_loc) @ rel
    return W_up2, W_lo, bend, alpha


ARM_AXIS = 0.19           # the correction keeps the elbow this far from the trunk's axis (the check asks 0.18)
FIX_MARGIN = 0.92         # and the wrist outside 92 % of the trunk's cross-section (the check uses 85 %)
FACE_FIX = 0.135          # and every point of the hand this far from the face (the check asks 0.12)
MAX_ABDUCT = 30.0


def positions(T, R, W, names):
    """World head positions by forward kinematics from the world rotations W (bones missing
    from W follow their parent rigidly). The root stays at its rest position."""
    out = {}

    def rot(n):
        if n in W:
            return W[n]
        p = T.tb[n].parent
        return rot(p.name) @ R[p.name].inverted() @ R[n]

    def head(n):
        if n in out:
            return out[n]
        b = T.tb[n]
        if not b.parent:
            out[n] = T.rest[n].translation.copy()
        else:
            p = b.parent.name
            off = T.rest3[p].inverted() @ (T.rest[n].translation - T.rest[p].translation)
            out[n] = head(p) + rot(p) @ off
        return out[n]

    for n in names:
        head(n)
    return out, rot


def arm_points(T, R, W, side, extra=None):
    """Elbow, wrist and hand points (world) with an optional extra rotation of the whole arm about
    the shoulder. The hand points are the wrist, the knuckles and the fingertip, the hand following
    the forearm as in MakeHuman's rest."""
    pos, rot = positions(T, R, W, ['Hips', 'Neck', f'{side}Arm', f'{side}ForeArm', f'{side}Hand'])
    sh = pos[f'{side}Arm']
    l_up = (T.rest[f'{side}ForeArm'].translation - T.rest[f'{side}Arm'].translation).length
    l_lo = (T.rest[f'{side}Hand'].translation - T.rest[f'{side}ForeArm'].translation).length
    Wa, Wf = W[f'{side}Arm'], W[f'{side}ForeArm']
    if extra is not None:
        Wa, Wf = extra @ Wa, extra @ Wf
    e = sh + Wa.col[1].normalized() * l_up
    w = e + Wf.col[1].normalized() * l_lo
    # knuckles and fingertip in the forearm's rest frame, carried by the posed forearm
    inv = T.rest3[f'{side}ForeArm'].inverted()
    hand = [w]
    for bn, tail in ((f'{side}FingerBase', False), (f'{side}HandFinger1', True)):
        b = T.tb[bn]
        p = (T.rig.matrix_world @ (b.tail_local if tail else b.head_local)) - T.rest[f'{side}Hand'].translation
        hand.append(w + Wf @ (inv @ p))
    return pos, rot, e, w, hand


def arm_ok(T, pos, rot, R, e, w, hand=()):
    if hand:
        face = pos['Head'] + rot('Head') @ T.face
        if min((q - face).length for q in hand) < FACE_FIX:
            return False
    a0 = pos['Hips']
    axis = (pos['Neck'] - a0).normalized()
    v = e - a0
    if (v - axis * v.dot(axis)).length < ARM_AXIS:
        return False
    for bn, (hx, hz, ln) in T.sections.items():
        if bn not in pos:
            continue
        m = rot(bn)
        p = m.inverted() @ (w - pos[bn])
        if 0 <= p.y <= ln and (p.x / (hx * FIX_MARGIN)) ** 2 + (p.z / (hz * FIX_MARGIN)) ** 2 < 1:
            return False
    return True


def abduct_axis(T, R, W, side):
    """The chest's forward axis (world) and the sign that turns this arm outward."""
    pos, rot = positions(T, R, W, ['Spine1', f'{side}Arm', 'Neck', 'Hips'])
    k = (rot('Spine1') @ T.rest3['Spine1'].inverted() @ T.forward).normalized()
    out = pos[f'{side}Arm'] - pos['Spine1']
    a = W[f'{side}Arm'].col[1].normalized()
    # outward: the turn that moves the upper arm's direction away from the trunk's middle
    t = Matrix.Rotation(math.radians(5), 3, k) @ a
    sign = 1.0 if (t - a).dot(out - k * out.dot(k)) > 0 else -1.0
    return k, sign


def abduction(T, R, W, side):
    """Least outward turn (degrees, 0.5 steps, at most MAX_ABDUCT) that makes the arm pass arm_ok."""
    names = ['Hips', 'Neck', 'Head', f'{side}Arm', f'{side}ForeArm', f'{side}Hand'] + list(T.sections)
    pos, rot = positions(T, R, W, names)
    k, sign = abduct_axis(T, R, W, side)
    b = 0.0
    while b <= MAX_ABDUCT:
        extra = Matrix.Rotation(math.radians(b) * sign, 3, k) if b else None
        _, _, e, w, hand = arm_points(T, R, W, side, extra)
        if arm_ok(T, pos, rot, R, e, w, hand):
            return b
        b += 0.5
    return MAX_ABDUCT


def mean_rotation(ms):
    """Mean of rotation matrices (normalised quaternion average, signs aligned to the first)."""
    qs = [m.to_quaternion() for m in ms]
    acc = Quaternion((0, 0, 0, 0))
    for q in qs:
        if q.dot(qs[0]) < 0:
            q = -q
        acc = Quaternion((acc.w + q.w, acc.x + q.x, acc.y + q.y, acc.z + q.z))
    acc.normalize()
    return acc.to_matrix()


def smooth_max(xs, r):
    """Running maximum over +-r frames, then a +-r box blur: never below xs, no sudden steps."""
    n = len(xs)
    m = [max(xs[max(0, i - r):i + r + 1]) for i in range(n)]
    return [sum(m[max(0, i - r):i + r + 1]) / len(m[max(0, i - r):i + r + 1]) for i in range(n)]


def import_bvh(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, global_scale=1.0, frame_start=1, use_fps_scale=False,
                            update_scene_fps=False, update_scene_duration=False, rotate_mode='NATIVE', axis_forward='-Z', axis_up='Y')
    return next(o for o in bpy.data.objects if o not in before)


def sample(src, frames, names):
    """World matrices of the source bones at the given BVH frames."""
    sc = bpy.context.scene
    out = []
    for f in frames:
        sc.frame_set(f)
        mw = src.matrix_world
        out.append({n: mw @ src.pose.bones[n].matrix for n in names})
    return out


def pick_window(spec, src, n_frames):
    """Chooses the stretch of the clip to use (BVH frames at 120 fps)."""
    if 'from_s' in spec:
        f0 = 1 + int(round(spec['from_s'] * 120))
        return f0, f0 + int(round(spec['seconds'] * 120))
    step = 4
    # Frame 1 of every Hahne BVH is a T-pose, not motion: start well after it.
    frames = list(range(13, n_frames + 1, step))
    names = ['Hips', 'LeftHand', 'RightHand', 'Head', 'LeftToeBase', 'RightToeBase', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']
    S = sample(src, frames, names)
    pos = {n: [s[n].translation.copy() for s in S] for n in names}
    hip_h = [p.z for p in pos['Hips']]
    scale_h = sum(hip_h) / len(hip_h)
    want = int(spec.get('seconds', 1.0) * 120 / step)
    best, best_score = 0, None
    kind_ = spec['pick']
    if kind_ == 'gait':
        # One full stride: the stride period is the strongest repeat of the left toe's height
        # between 0.8 and 1.6 s, starting at its first low point.
        lz = [p.z for p in pos['LeftToeBase']]
        m = sum(lz) / len(lz)
        dz = [z - m for z in lz]
        lo, hi = int(0.8 * 120 / step), min(int(1.6 * 120 / step), len(dz) - 2)
        period = max(range(lo, hi + 1), key=lambda L: sum(dz[i] * dz[i + L] for i in range(len(dz) - L)) / (len(dz) - L))
        start = min(range(0, max(1, len(dz) - period)), key=lambda i: lz[i])
        return frames[start], frames[start + period]
    for i in range(0, len(frames) - want):
        seg = range(i, i + want)
        hand_motion = sum((pos['LeftHand'][j + 1] - pos['LeftHand'][j]).length + (pos['RightHand'][j + 1] - pos['RightHand'][j]).length for j in seg[:-1])
        hip_motion = sum((pos['Hips'][j + 1] - pos['Hips'][j]).length for j in seg[:-1])
        if kind_ == 'calm':
            score = -(hand_motion + 2 * hip_motion)
        elif kind_ == 'gesture':
            score = hand_motion - 3 * hip_motion
        elif kind_ == 'point':
            mid = i + want // 2
            ext = 0
            for side, arm in (('LeftHand', 'LeftArm'), ('RightHand', 'RightArm')):
                h, sh = pos[side][mid], pos[arm][mid]
                if abs(h.z - sh.z) < 0.25 * scale_h:
                    ext = max(ext, horiz(h - sh).length)
                ext = max(ext, Vector((h.x - sh.x, h.y - sh.y, 0)).length - 0.6 * abs(h.z - sh.z))
            score = ext - 0.2 * hip_motion
        else:  # cheer
            # Both hands up at the middle, and neither hand near the head anywhere in the stretch
            # (the joy takes often cover the face; check() would refuse those frames).
            mid = i + want // 2
            top = min(pos['LeftHand'][mid].z, pos['RightHand'][mid].z) - pos['Head'][mid].z
            near = min((pos[hn][j] - pos['Head'][j]).length for j in seg for hn in ('LeftHand', 'RightHand'))
            score = top - 0.05 * hip_motion - (100.0 if near < 0.3 * scale_h else 0.0)
        if best_score is None or score > best_score:
            best, best_score = i, score
    return frames[best], frames[best] + want * step


def retarget(T, name, spec, bvh_path, log=print):
    """Makes action `name` on T.rig from the BVH clip. Returns (action, f0, f1, travel speed m/s, notes)."""
    rig = T.rig
    sc = bpy.context.scene
    src = import_bvh(bvh_path)
    act_src = src.animation_data.action
    n_frames = int(act_src.frame_range[1])
    f0, f1 = pick_window(spec, src, n_frames)
    log(f'CLIP {name}: BVH {spec["bvh"]} frames {f0}-{f1} ({(f1 - f0) / 120:.2f} s)')
    tnames = [n for n in T.order if n not in RIGID and NAME_MAP.get(n, n) in src.pose.bones]
    snames = [NAME_MAP.get(n, n) for n in tnames]
    S_REST = {n: src.matrix_world @ src.data.bones[n].matrix_local for n in snames}
    s_fwd_rest = facing_from(S_REST['LeftUpLeg'].translation, S_REST['RightUpLeg'].translation) * T.flip
    s_floor = min(S_REST[n].translation.z for n in ('LeftToeBase', 'RightToeBase'))
    k = T.hip_h / (S_REST['Hips'].translation.z - s_floor)
    H_rest = yaw_to(s_fwd_rest, T.forward)
    src_dir = {t: (H_rest @ rot3(S_REST[s])).col[1].normalized() for t, s in zip(tnames, snames)}
    R = T.reference(src_dir)
    HF = T.hinge_frames(R)
    rel = {up: R[up].inverted() @ R[lo] for up, lo, _ in HINGES}
    frames = [f0 + i * (120 // FPS) for i in range(int((f1 - f0) / (120 / FPS)) + 1)]
    S = sample(src, frames, snames)
    fwd = Vector((0, 0, 0))
    for s in S:
        fwd += facing_from(s['LeftUpLeg'].translation, s['RightUpLeg'].translation) * T.flip
    H_clip = yaw_to(horiz(fwd), T.forward)
    hips0 = [H_clip @ s['Hips'].translation for s in S]
    n = len(S)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    pbs = rig.pose.bones
    for pb in pbs:
        pb.rotation_mode = 'QUATERNION'
    prev, keys = {}, []
    notes = {'clamped_frames': 0, 'max_retwist_deg': {}, 'max_abduct_deg': {}}
    WS = []
    for s in S:
        W = {}
        for t, sn in zip(tnames, snames):
            D = (H_clip @ rot3(s[sn])) @ (H_rest @ rot3(S_REST[sn])).inverted()
            W[t] = D @ R[t]
        WS.append(W)
    # Head level on average: the performers often look down or tilt the head for the whole
    # take. The head keeps its motion relative to the chest, minus the clip's mean turn, so on
    # average it sits on the neck as in MakeHuman's rest.
    rel_head = [(W['Spine1'] @ R['Spine1'].inverted()).inverted() @ (W['Head'] @ R['Head'].inverted()) for W in WS]
    mean = mean_rotation(rel_head)
    notes['head_mean_deg'] = round(math.degrees(mean.to_quaternion().angle), 1)
    for W in WS:
        C = W['Spine1'] @ R['Spine1'].inverted()
        W['Head'] = C @ mean.inverted() @ C.inverted() @ W['Head']
    # Body size: the CMU performers are slimmer (and some taller) than these people, so an arm
    # that hangs close to a performer's side would go into this body, and a hand that passes a
    # performer's face at a safe distance can touch a shorter person's. Each arm is turned
    # outward about the chest's forward axis (at the shoulder, elbow bend kept) by the least
    # angle that keeps the elbow ARM_AXIS from the trunk's axis, the wrist outside the trunk and
    # the hand FACE_FIX from the face; the angles are widened and smoothed over time so the
    # correction does not pop.
    for side in ('Left', 'Right'):
        need = [abduction(T, R, W, side) for W in WS]
        sm = smooth_max(need, 5)
        notes['max_abduct_deg'][side] = round(max(sm), 1)
        for W, beta in zip(WS, sm):
            if beta > 0:
                ax, sign = abduct_axis(T, R, W, side)
                rot = Matrix.Rotation(math.radians(beta) * sign, 3, ax)
                W[f'{side}Arm'] = rot @ W[f'{side}Arm']
                W[f'{side}ForeArm'] = rot @ W[f'{side}ForeArm']
    for i, W in enumerate(WS):
        for up, lo, tw in HINGES:
            d = W[lo].col[1]
            f_loc, h_loc, _ = HF[up]
            W_up, W_lo, bend, alpha = solve_hinge(W[up], d, f_loc, h_loc, rel[up])
            if tw > 0:
                q = (W_lo.inverted() @ W[lo]).to_quaternion()
                tau = max(-math.radians(tw), min(math.radians(tw), twist_about_y(q)))
                W_lo = W_lo @ Matrix.Rotation(tau, 3, 'Y')
            notes['max_retwist_deg'][up] = round(max(notes['max_retwist_deg'].get(up, 0.0), abs(math.degrees(alpha))), 1)
            if math.atan2((d.normalized() - W_up.col[1] * d.normalized().dot(W_up.col[1])).length, d.normalized().dot(W_up.col[1])) > MAX_BEND:
                notes['clamped_frames'] += 1
            W[up], W[lo] = W_up, W_lo
        # World rotations of the bones with no motion of their own: rigid on their parent.
        for nm in T.order:
            if nm not in W:
                p = T.tb[nm].parent
                W[nm] = W[p.name] @ R[p.name].inverted() @ R[nm] if p else R[nm]
        A = {nm: T.RW.inverted() @ W[nm] for nm in W}
        frame_keys = {}
        for nm in T.order:
            b = T.tb[nm]
            B_rest = rot3(b.matrix_local)
            if b.parent:
                basis = B_rest.inverted() @ rot3(b.parent.matrix_local) @ A[b.parent.name].inverted() @ A[nm]
            else:
                basis = B_rest.inverted() @ A[nm]
            q = basis.to_quaternion()
            if nm in prev and prev[nm].dot(q) < 0:
                q.negate()
            prev[nm] = q
            frame_keys[nm] = q
        # Hips travel, scaled to this body and kept in place.
        h = hips0[i]
        gait = spec['pick'] == 'gait'
        if gait:
            base = hips0[0].lerp(hips0[-1], i / max(1, n - 1))
            dz = h.z - hips0[0].z
        else:
            # Standing clips: keep the sway, drop any drift (a moving mean over +-0.75 s).
            lo_, hi_ = max(0, i - int(0.75 * FPS)), min(n, i + int(0.75 * FPS) + 1)
            base = sum(hips0[lo_:hi_], Vector()) / (hi_ - lo_)
            dz = h.z - sum(p.z for p in hips0) / n
        dvec = Vector((h.x - base.x, h.y - base.y, dz)) * k
        if not gait and dvec.xy.length > 0.08:
            dvec.xy = dvec.xy.normalized() * 0.08
        hip_t = rot3(T.tb['Hips'].matrix_local).inverted() @ (T.RW.inverted() @ dvec)
        keys.append((frame_keys, hip_t))
    # Seamless loops: ease the last 0.4 s toward the first frame.
    if spec['loop'] and n > 12:
        m = min(n // 3, int(0.4 * FPS))
        for j in range(m):
            w = (j + 1) / m
            i = n - m + j
            fk, ht = keys[i]
            fk = {nm: fk[nm].slerp(keys[0][0][nm] if fk[nm].dot(keys[0][0][nm]) >= 0 else -keys[0][0][nm], w) for nm in fk}
            keys[i] = (fk, ht.lerp(keys[0][1], w))
        keys[-1] = keys[0]
    for i, (fk, ht) in enumerate(keys):
        f = i + 1
        for nm, q in fk.items():
            pbs[nm].rotation_quaternion = q
            pbs[nm].keyframe_insert('rotation_quaternion', frame=f, group=nm)
        pbs['Hips'].location = ht
        pbs['Hips'].keyframe_insert('location', frame=f, group='Hips')
    act.use_fake_user = True
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    track.mute = True
    rig.animation_data.action = None
    bpy.data.objects.remove(src, do_unlink=True)
    bpy.data.actions.remove(act_src)
    travel = Vector((hips0[-1].x - hips0[0].x, hips0[-1].y - hips0[0].y, 0)).length * k
    notes['rest_bend_deg'] = {up: round(HF[up][2], 1) for up in HF}
    notes['hinge'] = {up: (HF[up][0], HF[up][1]) for up in HF}
    sc.frame_set(1)
    return act, f0, f1, travel / max(1e-6, (f1 - f0) / 120), notes


# ------------------------------------------------------------------ skin weights at the shoulders

def smooth_shoulders(rig, objs, radius=0.22, repeat=30, factor=0.7, inward=0.06):
    """Rounds the shoulders. MakeHuman's clothes go from fully upper arm to fully trunk within
    one or two edges at the shoulder; when the arm comes down from the A-pose that boundary
    shows as a square pad with a notch under it. The deform weights of the vertices within
    `radius` of a shoulder joint (and not more than `inward` toward the middle, so the chest and
    lapels keep theirs) are averaged with their neighbours `repeat` times, keeping the four
    largest per vertex (the glTF limit) and normalised. Returns the vertex count per mesh."""
    bones = {b.name for b in rig.data.bones}
    jl = rig.matrix_world @ rig.data.bones['LeftArm'].head_local
    jr = rig.matrix_world @ rig.data.bones['RightArm'].head_local
    mid, u = (jl + jr) / 2, (jl - jr).normalized()
    half = (jl - mid).length
    done = {}
    for o in objs:
        me = o.data
        region = []
        for v in me.vertices:
            p = o.matrix_world @ v.co
            if min((p - jl).length, (p - jr).length) < radius and abs((p - mid).dot(u)) > half - inward:
                region.append(v.index)
        rs = set(region)
        nb = {i: set() for i in region}
        for e in me.edges:
            a, b = e.vertices
            if a in rs:
                nb[a].add(b)
            if b in rs:
                nb[b].add(a)
        gname = {g.index: g.name for g in o.vertex_groups}
        W = {i: {g.group: g.weight for g in v.groups if gname.get(g.group) in bones} for i, v in enumerate(me.vertices)}
        for _ in range(repeat):
            new = {}
            for i in region:
                if not nb[i]:
                    continue
                avg = {}
                for j in nb[i]:
                    for g, w in W[j].items():
                        avg[g] = avg.get(g, 0.0) + w / len(nb[i])
                mix = {g: (1 - factor) * W[i].get(g, 0.0) + factor * avg.get(g, 0.0) for g in set(avg) | set(W[i])}
                top = sorted(mix.items(), key=lambda kv: -kv[1])[:4]
                tot = sum(w for _, w in top) or 1.0
                new[i] = {g: w / tot for g, w in top if w > 1e-4}
            W.update(new)
        for i in region:
            for g in [g.group for g in me.vertices[i].groups if gname.get(g.group) in bones]:
                o.vertex_groups[g].remove([i])
            for g, w in W[i].items():
                o.vertex_groups[g].add([i], w, 'REPLACE')
        done[o.name] = len(region)
    return done


# ------------------------------------------------------------------ the check

def trunk_sections(T, meshes):
    """For LowerBack, Spine and Spine1: the half-widths (bone-local x and z) of the vertices
    weighted mostly to that bone, at rest. Skin and clothes together, so a covered body counts."""
    out = {}
    for bn in ('Hips', 'LowerBack', 'Spine', 'Spine1'):
        inv = T.rest[bn].inverted()
        xs, zs = [], []
        for o in meshes:
            vg = o.vertex_groups.get(bn)
            if vg is None:
                continue
            for v in o.data.vertices:
                if any(g.group == vg.index and g.weight > 0.6 for g in v.groups):
                    p = inv @ (o.matrix_world @ v.co)
                    xs.append(abs(p.x))
                    zs.append(abs(p.z))
        if len(xs) > 20:
            xs.sort()
            zs.sort()
            out[bn] = (xs[int(0.9 * len(xs))], zs[int(0.9 * len(zs))], T.tb[bn].length)
    return out


def face_point(T, meshes):
    """The middle of the face (mean of the frontmost head vertices), in the Head bone's rest frame."""
    inv = T.rest['Head'].inverted()
    pts = []
    for o in meshes:
        vg = o.vertex_groups.get('Head')
        if vg is None:
            continue
        for v in o.data.vertices:
            if any(g.group == vg.index and g.weight > 0.8 for g in v.groups):
                pts.append(o.matrix_world @ v.co)
    fwd = T.forward
    pts.sort(key=lambda p: -p.dot(fwd))
    front = pts[:max(8, len(pts) // 12)]
    c = sum(front, Vector()) / len(front)
    return inv @ c


def check(T, clip_specs, hinges):
    """Plays every clip in Blender and measures each frame. Rules:
    - the shoulder joints (heads of LeftArm and RightArm) stay at least 97 % of their rest distance apart;
    - each elbow stays at least 18 cm from the trunk's axis (Hips head to Neck head);
    - each elbow bends 0..150 degrees and no more than 15 degrees out of its hinge plane;
    - neither wrist goes inside the trunk (85 % of the measured cross-section of Hips, LowerBack, Spine, Spine1);
    - no hand point (wrist, knuckles, fingertip) comes within 12 cm of the face, unless the clip
      says it needs to ('face_ok' in clips.json).
    hinges: clip name -> {upper bone: (bend direction, hinge axis)} from retarget().
    Returns (report, failures)."""
    rig = T.rig
    sc = bpy.context.scene
    sections = T.sections
    face_loc = T.face
    mw = rig.matrix_world
    rest_sh = (T.rest['LeftArm'].translation - T.rest['RightArm'].translation).length
    report, fails = {}, []
    for name, spec in clip_specs.items():
        act = bpy.data.actions[name]
        hinge_info = hinges[name]
        rig.animation_data.action = act
        for tr in rig.animation_data.nla_tracks:
            tr.mute = True
        last = int(act.frame_range[1])
        r = {'shoulder_min': 9.0, 'elbow_axis_min': 9.0, 'bend_max': 0.0, 'bend_min': 999.0, 'off_axis_max': 0.0, 'wrist_in_trunk': 0, 'face_min': 9.0}
        for f in range(1, last + 1):
            sc.frame_set(f)
            P = {pb.name: mw @ pb.matrix for pb in rig.pose.bones}
            head = {n: P[n].translation for n in P}
            sh = (head['LeftArm'] - head['RightArm']).length / rest_sh
            r['shoulder_min'] = min(r['shoulder_min'], sh)
            if sh < SHOULDER_KEEP:
                fails.append(f'{name} frame {f}: shoulders {sh:.3f} of rest width')
            a0, a1 = head['Hips'], head['Neck']
            axis = (a1 - a0).normalized()
            for side in ('Left', 'Right'):
                e = head[f'{side}ForeArm']
                v = e - a0
                dist = (v - axis * v.dot(axis)).length
                r['elbow_axis_min'] = min(r['elbow_axis_min'], dist)
                if dist < ELBOW_AXIS:
                    fails.append(f'{name} frame {f}: {side} elbow {dist * 100:.1f} cm from the trunk axis')
                Pu, Pl = rot3(P[f'{side}Arm']), rot3(P[f'{side}ForeArm'])
                a = Pu.col[1].normalized()
                d = Pl.col[1].normalized()
                f_loc, h_loc = hinge_info[f'{side}Arm']
                fw, hw = (Pu @ f_loc).normalized(), (Pu @ h_loc).normalized()
                bend = math.degrees(math.atan2(d.dot(fw), d.dot(a)))
                off = math.degrees(math.asin(max(-1, min(1, abs(d.dot(hw))))))
                r['bend_max'] = max(r['bend_max'], bend)
                r['bend_min'] = min(r['bend_min'], bend)
                r['off_axis_max'] = max(r['off_axis_max'], off)
                if bend < -0.5 or bend > 150.5 or off > ELBOW_OFF_AXIS:
                    fails.append(f'{name} frame {f}: {side} elbow bend {bend:.1f} deg, off its hinge {off:.1f} deg')
                w = head[f'{side}Hand']
                for bn, (hx, hz, ln) in sections.items():
                    p = P[bn].inverted() @ w
                    if 0 <= p.y <= ln and (p.x / (hx * TRUNK_MARGIN)) ** 2 + (p.z / (hz * TRUNK_MARGIN)) ** 2 < 1:
                        r['wrist_in_trunk'] += 1
                        fails.append(f'{name} frame {f}: {side} wrist inside the trunk ({bn})')
                        break
                fp = P['Head'] @ face_loc
                hand_pts = (head[f'{side}Hand'], head[f'{side}FingerBase'], P[f'{side}HandFinger1'] @ Vector((0, T.tb[f'{side}HandFinger1'].length, 0)))
                g = min((q - fp).length for q in hand_pts)
                r['face_min'] = min(r['face_min'], g)
                if g < FACE_GAP and not spec.get('face_ok'):
                    fails.append(f'{name} frame {f}: {side} hand {g * 100:.1f} cm from the face')
        report[name] = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()}
    rig.animation_data.action = None
    sc.frame_set(1)
    return report, fails


# ------------------------------------------------------------------ a still pose from directions

def pose_from_directions(T, dirs, trunk_pitch=0.0, head_pitch=0.0):
    """A still pose: each limb bone named in `dirs` points along that direction (world, the body
    standing in its rest place), by forward kinematics from the rest pose (children follow their
    parents, then swing). Elbows and knees go through solve_hinge, so they bend only about their
    own hinge and at most 150 degrees. trunk_pitch / head_pitch lean LowerBack, Spine, Spine1 (shared)
    and Head forward (radians, about the body's left axis). Returns world rotations per bone."""
    R = {n: T.rest3[n].copy() for n in T.order}
    HF = T.hinge_frames(R)
    left = Vector((0, 0, 1)).cross(T.forward).normalized()
    straight = {}
    for up, lo, _ in HINGES:
        f_loc, h_loc, bend_deg = HF[up]
        straight[up] = Matrix.Rotation(-math.radians(bend_deg), 3, h_loc) @ (R[up].inverted() @ R[lo])
    lower_of = {lo: up for up, lo, _ in HINGES}
    W = {}
    for n in T.order:
        b = T.tb[n]
        p = b.parent.name if b.parent else None
        cur = W[p] @ R[p].inverted() @ R[n] if p else R[n].copy()
        if n in ('LowerBack', 'Spine', 'Spine1') and trunk_pitch:
            cur = Matrix.Rotation(trunk_pitch / 3, 3, left) @ cur
        if n == 'Head' and head_pitch:
            cur = Matrix.Rotation(head_pitch, 3, left) @ cur
        if n in lower_of and n in dirs:
            up = lower_of[n]
            f_loc, h_loc, _ = HF[up]
            W_up, W_lo, bend, alpha = solve_hinge(W[up], Vector(dirs[n]), f_loc, h_loc, straight[up])
            W[up] = W_up
            cur = W_lo
        elif n in dirs:
            cur = cur.col[1].normalized().rotation_difference(Vector(dirs[n]).normalized()).to_matrix() @ cur
        W[n] = cur
    # bones after a re-twisted upper bone follow it again
    for n in T.order:
        b = T.tb[n]
        if b.parent and n not in dirs and n not in ('LowerBack', 'Spine', 'Spine1', 'Head') and b.parent.name in W:
            p = b.parent.name
            W[n] = W[p] @ R[p].inverted() @ R[n]
    return W


def apply_pose(T, W):
    """Sets the rig's pose bones to the world rotations W (no keyframes)."""
    rig = T.rig
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location = Vector()
    A = {n: T.RW.inverted() @ W[n] for n in W}
    for n in T.order:
        b = T.tb[n]
        B = rot3(b.matrix_local)
        basis = B.inverted() @ rot3(b.parent.matrix_local) @ A[b.parent.name].inverted() @ A[n] if b.parent else B.inverted() @ A[n]
        rig.pose.bones[n].rotation_quaternion = basis.to_quaternion()
    bpy.context.view_layer.update()
