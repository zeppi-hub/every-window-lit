import { Color, Matrix4, Quaternion, Vector3, type World } from '@iwsdk/core';
import { bakeCrowd, type Clip, type Crowd } from '../../station/crowd.js';
import { HIDDEN } from '../../station/reactions.js';
import { Actor, isRealistic, type Realistic } from './actors.js';

/**
 * Everyone in the new version (Gray, the three people, the old man, the
 * memory keepers, the crowd, the child): the current game's two CC0 animated
 * characters (CREDITS.md, Quaternius), baked into one instanced mesh each
 * with their walk, idle and raised-arm clips (station/crowd.ts). A person
 * is a slot: a model, colours, a place, a facing, a size and a pose. Two
 * draws for everybody.
 */
/** The two stylized bodies (baked, one draw each for all), or one of the realistic people (actors.ts). */
export type Model = 'suit' | 'dress' | Realistic;
export type Pose = 'idle' | 'walk' | 'arm' | 'wave' | 'talk' | 'hidden';

type Baked = 'suit' | 'dress';
const MODELS: Readonly<Record<Baked, { key: string; name: string; height: number }>> = {
  suit: { key: 'folk_suit', name: 'PeopleSuit', height: 1.76 },
  dress: { key: 'folk_dress', name: 'PeopleDress', height: 1.66 },
};
/** People per model. */
const CAPACITY = 64;
/** The realistic people are drawn as such within this distance of the eye (m), and their stylized stand-ins beyond (in, out). */
const NEAR_IN = 9;
const NEAR_OUT = 10;
/** Which realistic people wear a dress-cut stand-in, and the colours their stand-ins wear (their outfits, roughly). */
const DRESSED = new Set<string>(['maya', 'june', 'helen', 'edna', 'crowd_woman_a', 'crowd_woman_b']);
const FAR_LOOK: Readonly<Record<string, { cloth: number; hair: number; skin: number }>> = {
  gray: { cloth: 0x252a33, hair: 0x8a8580, skin: 0xe0b394 },
  maya: { cloth: 0x8a3a4a, hair: 0x3b2a1e, skin: 0xc99a7a },
  leo: { cloth: 0x4a6a8a, hair: 0x1f1712, skin: 0xe0b394 },
  sam: { cloth: 0x5a5a3a, hair: 0x2a1e16, skin: 0x8a5a42 },
  walt: { cloth: 0x5a5a42, hair: 0xd8d4cc, skin: 0xd9a585 },
  june: { cloth: 0x5a6a3a, hair: 0xb0aaa0, skin: 0xd9a585 },
  ben: { cloth: 0xd8b030, hair: 0xc8c4bc, skin: 0xd9a585 },
  helen: { cloth: 0xa8302a, hair: 0x9a948c, skin: 0xd9a585 },
  edna: { cloth: 0x3a5a8a, hair: 0xd0ccc4, skin: 0xd9a585 },
  george: { cloth: 0x1f2a44, hair: 0xe0dcd4, skin: 0xd9a585 },
  crowd_man_suit: { cloth: 0x2a2a30, hair: 0x2a1e16, skin: 0xe0b394 },
  crowd_man_casual: { cloth: 0x6a3a3a, hair: 0x3b2a1e, skin: 0xc99a7a },
  crowd_woman_a: { cloth: 0x3a4a6a, hair: 0x2a1e16, skin: 0xa8755a },
  crowd_woman_b: { cloth: 0x4a4a4a, hair: 0x5a2e1a, skin: 0xe0b394 },
};
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

/** Someone in a scene: a stylized figure or a realistic actor, the same to the scenes. */
export interface Person {
  readonly position: Vector3;
  yaw: number;
  size: number;
  pose: Pose;
  stride: number;
  readonly look: PersonLook;
  at(x: number, y: number, z: number, yaw?: number): Person;
  face(x: number, z: number): Person;
  hand(out: Vector3): Vector3;
  head(out: Vector3): Vector3;
}

export class Figure implements Person {
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
    return out.set(this.position.x, this.position.y + MODELS[this.look.model as Baked].height * this.size, this.position.z);
  }
}

export class People {
  private readonly crowds: Partial<Record<Baked, Crowd>> = {};
  private readonly people: Figure[] = [];
  private readonly actors: Actor[] = [];
  /** Each actor's stylized stand-in for a distance. */
  private readonly stand = new Map<Actor, Figure>();
  private readonly near = new Set<Actor>();
  private readonly eye = new Vector3();
  private readonly world: World;
  private readonly used: Record<Baked, number> = { suit: 0, dress: 0 };
  private elapsed = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly frames = new Float32Array(3);
  private readonly colour = new Color();

  constructor(world: World) {
    this.world = world;
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

  /** A new person (hidden till placed and posed): a realistic actor for a named model, else a stylized figure. */
  add(look: PersonLook): Person {
    if (isRealistic(look.model)) {
      const actor = new Actor(this.world, look.model, look, ((this.people.length + this.actors.length) * 0.37) % 1);
      this.actors.push(actor);
      // Far off, the stylized figure stands in for the realistic one (the headset's budget); near, the realistic one.
      const far = this.add({ model: DRESSED.has(look.model) ? 'dress' : 'suit', ...FAR_LOOK[look.model], size: look.size }) as Figure;
      far.pose = 'hidden';
      this.stand.set(actor, far);
      return actor;
    }
    const model = look.model as Baked;
    const slot = this.used[model];
    this.used[model] += 1;
    const person = new Figure(look, slot, (this.people.length * 0.37) % 1);
    this.people.push(person);
    const crowd = this.crowds[model];
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
    for (const a of this.actors) a.pose = 'hidden';
  }

  /** Hide everyone there is now (going into a memory); the returned function puts them back as they were. */
  stash(): () => void {
    const kept: { p: Person; pose: Pose }[] = [...this.people, ...this.actors].map((p) => ({ p, pose: p.pose }));
    for (const { p } of kept) p.pose = 'hidden';
    return () => {
      for (const { p, pose } of kept) p.pose = pose;
    };
  }

  update(delta: number, eye?: Vector3): void {
    this.elapsed += delta;
    if (eye != null) this.eye.copy(eye);
    for (const actor of this.actors) {
      // Near (with a little give either way, so it never flickers) the realistic actor; far, its stylized stand-in.
      const far = this.stand.get(actor);
      const d = actor.position.distanceTo(this.eye);
      if (d < NEAR_IN) this.near.add(actor);
      else if (d > NEAR_OUT) this.near.delete(actor);
      const close = eye == null || this.near.has(actor) || actor.pose === 'hidden';
      if (far != null) {
        far.pose = close ? 'hidden' : actor.pose === 'talk' ? 'idle' : actor.pose;
        far.at(actor.position.x, actor.position.y, actor.position.z, actor.yaw);
        far.size = actor.size;
      }
      if (close) actor.update(delta);
      else actor.root.visible = false;
    }
    const highest: Record<Baked, number> = { suit: 0, dress: 0 };
    for (const person of this.people) {
      const model = person.look.model as Baked;
      const crowd = this.crowds[model];
      if (crowd == null || person.slot >= CAPACITY) continue;
      if (person.pose === 'hidden') {
        crowd.mesh.setMatrixAt(person.slot, HIDDEN);
        continue;
      }
      highest[model] = Math.max(highest[model], person.slot + 1);
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

/** Where the bird's eye goes on someone's right shoulder: beside the head, a little behind, so the head does not fill the view. */
export function shoulderEye(p: Person, out: Vector3): Vector3 {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  // Just over the right shoulder and a little behind, by their own height (tall or short), so their head is beside the view, not in it.
  const top = p.head(out).y;
  // Facing (sin, cos); their right is (-cos, sin).
  return out.set(p.position.x - c * 0.42 - s * 0.2, top - 0.15 * p.size, p.position.z + s * 0.42 - c * 0.2);
}
