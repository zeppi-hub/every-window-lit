import type { PersonLook } from './people.js';
import { type AnimationAction, AnimationClip, AnimationMixer, AssetManager, LoopOnce, LoopRepeat, type Object3D, type SkinnedMesh, Sphere, Vector3, type World } from '@iwsdk/core';

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

export class Actor {
  readonly position = new Vector3();
  yaw = 0;
  size: number;
  pose: 'idle' | 'walk' | 'arm' | 'wave' | 'talk' | 'hidden' = 'idle';
  stride = 0;
  readonly look: PersonLook;
  readonly root: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions: Partial<Record<Clip, AnimationAction>> = {};
  private playing: Clip | null = null;
  private shown: string | null = null;
  private readonly bones = new Map<string, Object3D>();
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
        mesh.geometry.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.25);
        mesh.computeBoundingSphere = () => {
          mesh.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.25);
        };
        mesh.boundingSphere = new Sphere(new Vector3(0, 0.95, 0), 1.25);
        mesh.frustumCulled = true;
      }
      if ((o as { isBone?: boolean }).isBone === true) this.bones.set(o.name, o);
    });
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
  }

  /** Bring the pose up to date now (a scene asks where the hand is before the next frame). */
  private settle(): void {
    this.place();
    this.choose();
    this.mixer.update(0);
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
