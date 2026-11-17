import { Color, Matrix4, Quaternion, Vector3, type World } from '@iwsdk/core';
import { bakeCrowd, type Clip, type Crowd } from '../../station/crowd.js';
import { HIDDEN } from '../../station/reactions.js';

/**
 * Everyone in the new version (Gray, the three people, the old man, the
 * memory keepers, the crowd, the child): the current game's two CC0 animated
 * characters (CREDITS.md, Quaternius), baked into one instanced mesh each
 * with their walk, idle and raised-arm clips (station/crowd.ts). A person
 * is a slot: a model, colours, a place, a facing, a size and a pose. Two
 * draws for everybody.
 */
export type Model = 'suit' | 'dress';
export type Pose = 'idle' | 'walk' | 'arm' | 'wave' | 'hidden';

const MODELS: Readonly<Record<Model, { key: string; name: string; height: number }>> = {
  suit: { key: 'folk_suit', name: 'PeopleSuit', height: 1.76 },
  dress: { key: 'folk_dress', name: 'PeopleDress', height: 1.66 },
};
/** People per model. */
const CAPACITY = 48;
/** Where in the wave clip the arm is up and held (0..1): the arm held out for a parrot to land on. */
const ARM_UP = 0.45;
/** The raised hand, in a standing person's frame at size 1 (m): where a bird lands. */
export const HAND_UP = { x: -0.3, y: 1.62, z: 0.12 } as const;

export interface PersonLook {
  model: Model;
  skin?: number;
  cloth?: number;
  hair?: number;
  /** 1 is a grown-up; a child about 0.62. */
  size?: number;
}

export class Person {
  readonly position = new Vector3();
  /** Facing (radians about y; 0 faces +z, the model's own front). */
  yaw = 0;
  size: number;
  pose: Pose = 'idle';
  /** Where in its walk it is, in cycles (walking advances it). */
  stride = 0;
  readonly look: PersonLook;
  /** Model and slot (instance) in it. */
  constructor(
    look: PersonLook,
    readonly slot: number,
    readonly phase: number,
  ) {
    this.look = look;
    this.size = look.size ?? 1;
  }

  at(x: number, y: number, z: number, yaw = this.yaw): this {
    this.position.set(x, y, z);
    this.yaw = yaw;
    return this;
  }

  /** Face the point (x, z). */
  face(x: number, z: number): this {
    this.yaw = Math.atan2(x - this.position.x, z - this.position.z);
    return this;
  }

  /** Where the raised hand is (world), for a bird to land on (pose 'arm'). */
  hand(out: Vector3): Vector3 {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const x = HAND_UP.x * this.size;
    const z = HAND_UP.z * this.size;
    return out.set(this.position.x + x * c + z * s, this.position.y + HAND_UP.y * this.size, this.position.z - x * s + z * c);
  }

  /** The top of the head (world), for a caption above it. */
  head(out: Vector3): Vector3 {
    return out.set(this.position.x, this.position.y + MODELS[this.look.model].height * this.size, this.position.z);
  }
}

export class People {
  private readonly crowds: Partial<Record<Model, Crowd>> = {};
  private readonly people: Person[] = [];
  private readonly used: Record<Model, number> = { suit: 0, dress: 0 };
  private elapsed = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly frames = new Float32Array(3);
  private readonly colour = new Color();

  constructor(world: World) {
    for (const model of ['suit', 'dress'] as const) {
      const { key, name, height } = MODELS[model];
      const crowd = bakeCrowd(key, name, CAPACITY, height);
      if (crowd == null) continue;
      for (let k = 0; k < CAPACITY; k += 1) crowd.mesh.setMatrixAt(k, HIDDEN);
      crowd.mesh.count = 0;
      crowd.mesh.frustumCulled = false;
      world.createTransformEntity(crowd.mesh, { persistent: true });
      this.crowds[model] = crowd;
    }
  }

  /** A new person (hidden till placed and posed). */
  add(look: PersonLook): Person {
    const slot = this.used[look.model];
    this.used[look.model] += 1;
    const person = new Person(look, slot, (this.people.length * 0.37) % 1);
    this.people.push(person);
    const crowd = this.crowds[look.model];
    if (crowd != null && slot < CAPACITY) {
      this.colour.setHex(look.skin ?? 0xd9a585);
      crowd.skin.setXYZ(slot, this.colour.r, this.colour.g, this.colour.b);
      this.colour.setHex(look.cloth ?? 0x3a3a3c);
      crowd.cloth.setXYZ(slot, this.colour.r, this.colour.g, this.colour.b);
      this.colour.setHex(look.hair ?? 0x3b2a1e);
      crowd.hair.setXYZ(slot, this.colour.r, this.colour.g, this.colour.b);
      crowd.skin.needsUpdate = crowd.cloth.needsUpdate = crowd.hair.needsUpdate = true;
    }
    return person;
  }

  /** Hide everyone (a scene change). */
  hideAll(): void {
    for (const p of this.people) p.pose = 'hidden';
  }

  update(delta: number): void {
    this.elapsed += delta;
    const highest: Record<Model, number> = { suit: 0, dress: 0 };
    for (const person of this.people) {
      const crowd = this.crowds[person.look.model];
      if (crowd == null || person.slot >= CAPACITY) continue;
      if (person.pose === 'hidden') {
        crowd.mesh.setMatrixAt(person.slot, HIDDEN);
        continue;
      }
      highest[person.look.model] = Math.max(highest[person.look.model], person.slot + 1);
      this.q.setFromAxisAngle(this.up, person.yaw);
      this.s.setScalar(person.size);
      this.m.compose(person.position, this.q, this.s);
      crowd.mesh.setMatrixAt(person.slot, this.m);
      if (person.pose === 'walk') framesAt(crowd.walk, person.stride, this.frames);
      else if (person.pose === 'arm') framesAt(crowd.wave, ARM_UP, this.frames, true);
      else if (person.pose === 'wave') framesAt(crowd.wave, this.elapsed / crowd.wave.seconds + person.phase, this.frames);
      else framesAt(crowd.idle, this.elapsed / crowd.idle.seconds + person.phase, this.frames);
      crowd.frame.setXYZ(person.slot, this.frames[0], this.frames[1], this.frames[2]);
    }
    for (const model of ['suit', 'dress'] as const) {
      const crowd = this.crowds[model];
      if (crowd == null) continue;
      crowd.mesh.count = highest[model];
      crowd.mesh.instanceMatrix.needsUpdate = true;
      crowd.frame.needsUpdate = true;
    }
  }
}

function framesAt(clip: Clip, phase: number, out: Float32Array, hold = false): void {
  const f = (hold ? Math.min(0.999, Math.max(0, phase)) : phase - Math.floor(phase)) * clip.frames;
  const a = Math.floor(f);
  out[0] = clip.start + a;
  out[1] = clip.start + (hold ? a : (a + 1) % clip.frames);
  out[2] = hold ? 0 : f - a;
}
