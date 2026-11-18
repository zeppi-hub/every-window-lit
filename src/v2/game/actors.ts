import type { PersonLook } from './people.js';
import { type AnimationAction, AnimationClip, AnimationMixer, AssetManager, type BufferGeometry, LoopOnce, LoopRepeat, type Mesh, type MeshStandardMaterial, type Object3D, Quaternion, type SkinnedMesh, Sphere, Vector3, type World } from '@iwsdk/core';

/**
 * Vertex normals worked out from the faces, then made one where a point of
 * the surface is split into several vertices (a seam in the texture): every
 * vertex at the same place takes the same, averaged normal, so a face or a
 * sleeve reads as one smooth surface instead of panels.
 */
function smoothAcrossSeams(geometry: BufferGeometry): void {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (position == null || normal == null) return;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < position.count; i += 1) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    const group = groups.get(key);
    if (group == null) groups.set(key, [i]);
    else group.push(i);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Only normals facing the same way are made one: the two sides of a thin card (hair) keep their own.
    const first = group[0];
    const fx = normal.getX(first);
    const fy = normal.getY(first);
    const fz = normal.getZ(first);
    const same = group.filter((i) => normal.getX(i) * fx + normal.getY(i) * fy + normal.getZ(i) * fz > 0.2);
    let x = 0;
    let y = 0;
    let z = 0;
    for (const i of same) {
      x += normal.getX(i);
      y += normal.getY(i);
      z += normal.getZ(i);
    }
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) continue;
    for (const i of same) normal.setXYZ(i, x / length, y / length, z / length);
  }
  normal.needsUpdate = true;
}

/**
 * The realistic people of the new version (art/v2/insan/README.md): one
 * rigged GLB each (MakeHuman CC0, CMU motion), with the same five clips:
 * idle, walk, talk, point (an arm reaching out) and cheer (both arms up).
 * An Actor stands where a Person would and answers to the same poses, so
 * the scenes do not care which they have: idle, walk, talk; 'arm' holds
 * the point clip where the arm is furthest out (a perch for the bird);
 * 'wave' loops the cheer (a crowd booing or calling out).
 */
export const REALISTIC = ['gray', 'maya', 'leo', 'sam', 'walt', 'june', 'ben', 'helen', 'edna', 'george', 'crowd_man_suit', 'crowd_man_casual', 'crowd_woman_a', 'crowd_woman_b'] as const;
export type Realistic = (typeof REALISTIC)[number];

export function isRealistic(model: string): model is Realistic {
  return (REALISTIC as readonly string[]).includes(model);
}

const key = (name: Realistic) => `v2_person_${name}`;

/** Where each model's arm is furthest out in its point clip, found once per model (s), and which hand. */
const armAt = new Map<Realistic, { time: number; bone: string }>();

/** Load the people (in parallel); resolves when all are in. */
export async function loadActors(names: readonly Realistic[] = REALISTIC): Promise<void> {
  await Promise.all(names.map((name) => AssetManager.loadGLTF(`v2/insan/${name}.glb`, key(name))));
}

type Clip = 'idle' | 'walk' | 'talk' | 'point' | 'cheer';

const UP = new Vector3(0, 1, 0);
const GAZE = new Quaternion();

export class Actor {
  readonly position = new Vector3();
  yaw = 0;
  size: number;
  pose: 'idle' | 'walk' | 'arm' | 'wave' | 'talk' | 'hidden' = 'idle';
  stride = 0;
  /** A point in the world this person looks at by turning head and neck (null: wherever the clip looks). */
  gaze: Vector3 | null = null;
  private headTurn = 0;
  /** Where in the idle clip this person starts, so a row of them does not breathe as one. */
  private readonly offset = Math.random() * 3;
  readonly look: PersonLook;
  readonly root: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions: Partial<Record<Clip, AnimationAction>> = {};
  private playing: Clip | null = null;
  private shown: string | null = null;
  private readonly bones = new Map<string, Object3D>();
  private readonly collar: { bone: Object3D; rest: Quaternion }[] = [];
  private readonly stand: { bone: Object3D; rest: Quaternion; at: Vector3 }[] = [];

  /** Hold the body upright as modelled under an arm that is held out. */
  private upright(): void {
    for (const c of this.collar) c.bone.quaternion.copy(c.rest);
    if (this.pose !== 'arm') return;
    for (const s of this.stand) {
      s.bone.quaternion.copy(s.rest);
      s.bone.position.copy(s.at);
    }
  }
  private readonly arm: { time: number; bone: string };

  constructor(world: World, name: Realistic, look: PersonLook, phase: number) {
    this.look = look;
    this.size = look.size ?? 1;
    const gltf = AssetManager.getGLTF(key(name));
    if (gltf == null) throw new Error(`person ${name} is not loaded`);
    this.root = gltf.scene;
    this.root.name = `Actor ${name}`;
    this.root.visible = false;
    this.root.traverse((o) => {
      o.pointerEvents = 'none';
      // Skinned meshes are culled by a sphere round the whole body (their bind-pose bounds miss the moving limbs).
      if ((o as SkinnedMesh).isSkinnedMesh === true) {
        const mesh = o as SkinnedMesh;
        // Smooth shading from the mesh itself: the packed normals come out in coarse steps, which draws every body in flat facets; and smooth across the seams of the picture too, where a point is split in two and a crease would show.
        if (mesh.geometry.userData.smoothed !== true) {
          smoothAcrossSeams(mesh.geometry);
          mesh.geometry.userData.smoothed = true;
        }
        // Eyebrow cards break up into shards at any distance (the face's own picture has the brows): not drawn.
        const named = Array.isArray(mesh.material) ? '' : (mesh.material?.name ?? '');
        if (named.includes('eyebrow') || named.includes('eyelash')) mesh.visible = false;
        mesh.geometry.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.25);
        mesh.computeBoundingSphere = () => {
          mesh.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.25);
        };
        mesh.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.25);
        mesh.frustumCulled = true;
      }
      if ((o as { isBone?: boolean }).isBone === true) this.bones.set(o.name, o);
      // Hair and eyebrows are thin cards with see-through textures. Blended, a card that is drawn out of order (or whose blending is lost) shows as a pale rectangle across the face: cut them out instead, which needs no order.
      const material = (o as Mesh).material as (MeshStandardMaterial & { transparent: boolean }) | MeshStandardMaterial[] | undefined;
      for (const m of Array.isArray(material) ? material : material != null ? [material] : []) {
        if (!m.transparent) continue;
        m.transparent = false;
        m.alphaTest = 0.5;
        m.depthWrite = true;
        m.needsUpdate = true;
      }
    });
    // Standing, for the arm held out: the motion data lunges with the whole body, which reads as a broken stance.
    for (const name of ['Hips', 'LHipJoint', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RHipJoint', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LowerBack', 'Spine', 'Spine1', 'Neck', 'Neck1', 'Head']) {
      const bone = this.bones.get(name);
      if (bone != null) this.stand.push({ bone, rest: bone.quaternion.clone(), at: bone.position.clone() });
    }
    // The collar bones as modelled: the motion data folds them in, which takes the shoulders away.
    for (const name of ['LeftShoulder', 'RightShoulder']) {
      const bone = this.bones.get(name);
      // The people's motion now keeps the collar bones itself (art/v2/insan/motion.py); holding them here would fight it.
      void bone;
    }
    world.createTransformEntity(this.root, { persistent: true });
    this.mixer = new AnimationMixer(this.root);
    for (const clip of ['idle', 'walk', 'talk', 'point', 'cheer'] as const) {
      const found = AnimationClip.findByName(gltf.animations, clip);
      if (found != null) this.actions[clip] = this.mixer.clipAction(found);
    }
    // Everyone a little out of step.
    this.mixer.setTime(phase * 6);
    this.arm = armAt.get(name) ?? this.findArm(name);
  }

  at(x: number, y: number, z: number, yaw = this.yaw): this {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.place();
    return this;
  }

  face(x: number, z: number): this {
    this.yaw = Math.atan2(x - this.position.x, z - this.position.z);
    this.place();
    return this;
  }

  /** The reaching hand (world): where a bird lands on an arm held out. */
  hand(out: Vector3): Vector3 {
    this.settle();
    const bone = this.bones.get(this.arm.bone);
    return bone == null ? out.copy(this.position).setY(this.position.y + 1.5 * this.size) : bone.getWorldPosition(out);
  }

  /** The top of the head (world). */
  head(out: Vector3): Vector3 {
    this.settle();
    const bone = this.bones.get('Head');
    if (bone == null) return out.copy(this.position).setY(this.position.y + 1.75 * this.size);
    bone.getWorldPosition(out);
    out.y += 0.14 * this.size;
    return out;
  }

  /** Every frame: its place, its pose, its clip. */
  update(delta: number): void {
    this.root.visible = this.pose !== 'hidden';
    if (!this.root.visible) return;
    this.place();
    this.choose();
    if (this.pose !== 'arm') this.mixer.update(delta);
    this.upright();
    this.turnHead(delta);
  }

  /** Turn head and neck toward the gaze, over the clip's own pose: up to about 60 degrees either way, eased. */
  private turnHead(delta: number): void {
    let want = 0;
    if (this.gaze != null) {
      const to = Math.atan2(this.gaze.x - this.position.x, this.gaze.z - this.position.z) - this.yaw;
      want = Math.max(-1.05, Math.min(1.05, Math.atan2(Math.sin(to), Math.cos(to))));
    }
    this.headTurn += (want - this.headTurn) * Math.min(1, delta * 4);
    if (Math.abs(this.headTurn) < 0.005) return;
    const neck = this.bones.get('Neck');
    const head = this.bones.get('Head');
    if (neck != null) neck.quaternion.multiply(GAZE.setFromAxisAngle(UP, this.headTurn * 0.4));
    if (head != null) head.quaternion.multiply(GAZE.setFromAxisAngle(UP, this.headTurn * 0.6));
  }

  /** Bring the pose up to date now (a scene asks where the hand is before the next frame). */
  private settle(): void {
    this.place();
    this.choose();
    this.mixer.update(0);
    this.upright();
    this.root.updateMatrixWorld(true);
  }

  private place(): void {
    this.root.position.copy(this.position);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.scale.setScalar(this.size);
  }

  /** The clip for the pose (started once per change of pose). */
  private choose(): void {
    if (this.shown === this.pose) return;
    this.shown = this.pose;
    const clip: Clip = this.pose === 'walk' ? 'walk' : this.pose === 'talk' ? 'talk' : this.pose === 'arm' ? 'point' : this.pose === 'wave' ? 'cheer' : 'idle';
    const next = this.actions[clip];
    if (next == null) return;
    const before = this.playing == null ? null : this.actions[this.playing];
    next.reset();
    next.setLoop(LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    if (clip === 'idle') next.time = this.offset;
    if (this.pose === 'arm') {
      // Held where the arm is furthest out, still.
      next.setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
      next.time = this.arm.time;
    }
    next.play();
    if (before != null && before !== next) before.stop();
    this.playing = clip;
  }

  /** Sample the point clip for the moment the hand is furthest from the hips (either hand). */
  private findArm(name: Realistic): { time: number; bone: string } {
    const action = this.actions.point;
    const hips = this.bones.get('Hips');
    let best = { time: 1.2, bone: 'RightHand' };
    if (action == null || hips == null) return best;
    let far = -1;
    const h = new Vector3();
    const p = new Vector3();
    action.play();
    const length = action.getClip().duration;
    for (let t = 0; t <= length; t += length / 24) {
      action.time = t;
      this.mixer.update(0);
      this.root.updateMatrixWorld(true);
      hips.getWorldPosition(h);
      for (const bone of ['RightHand', 'LeftHand']) {
        this.bones.get(bone)?.getWorldPosition(p);
        const d = Math.hypot(p.x - h.x, p.z - h.z) + Math.max(0, p.y - h.y) * 0.5;
        if (d > far) {
          far = d;
          best = { time: t, bone };
        }
      }
    }
    action.stop();
    armAt.set(name, best);
    return best;
  }
}
