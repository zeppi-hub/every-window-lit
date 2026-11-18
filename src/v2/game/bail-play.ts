import { CanvasTexture, DynamicDrawUsage, InstancedMesh, Matrix4, type Mesh, MeshBasicMaterial, type Object3D, Quaternion, RepeatWrapping, SphereGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { currentGoal, type Goal, setGoal } from '../goal.js';
import { type BailRules, type BailStage, type Bucket, heaveSpeed, type Hold, type HoldStep, newHold, shoveLid, slack, stepBucket, stepHold, submerged, surface, type Throw } from '../ship-bail.js';
import { type Hands, readHands } from './circus-show.js';
import type { DirectorSystem } from './director.js';

/**
 * Bailing, played with the hands (the rules are v2/ship-bail.ts): the
 * storm ship's hatch (S13) and the sinking bank (S15) are both played
 * here. A bucket is taken once and stays in that hand; plunged under the
 * water it fills, lifted clear and heaved it throws. A cover's handle,
 * where there is one, is shoved shut by a hand that rests on it, and held
 * shut for as long as the hand stays. Each scene draws its own water, cover
 * and waves from what is read here.
 */

/** Say what the player is to do now (v2/goal.ts), and put it in the dev log when it changes. */
export function goal(next: Goal): void {
  const was = currentGoal();
  setGoal(next);
  if (import.meta.env.DEV && currentGoal() !== was) console.info(`[goal] ${next.where} | ${next.now}${next.steps != null ? ` | ${next.steps[0]}/${next.steps[1]}` : ''}`);
}

/** Wind on dark water, drawn once: short pale strokes on deep green-grey, tiling in both directions. */
let ripples: CanvasTexture | null = null;
export function rippleTexture(): CanvasTexture {
  if (ripples != null) return ripples;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#1b3941';
    g.fillRect(0, 0, 256, 256);
    let seed = 5;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    g.lineCap = 'round';
    for (let k = 0; k < 110; k += 1) {
      const x = random() * 256;
      const y = random() * 256;
      const long = 10 + random() * 26;
      g.strokeStyle = k % 3 === 0 ? 'rgba(6,16,20,0.45)' : `rgba(150,190,198,${(0.05 + random() * 0.1).toFixed(2)})`;
      g.lineWidth = 2 + random() * 5;
      // Drawn again a tile away wherever it crosses an edge, so the tiles meet.
      for (const dx of [-256, 0, 256]) {
        g.beginPath();
        g.moveTo(x + dx, y);
        g.quadraticCurveTo(x + dx + long / 2, y - 3 + random() * 6, x + dx + long, y);
        g.stroke();
      }
    }
  }
  ripples = new CanvasTexture(canvas);
  ripples.colorSpace = SRGBColorSpace;
  ripples.wrapS = RepeatWrapping;
  ripples.wrapT = RepeatWrapping;
  return ripples;
}

/** Slide the flood's ripples along (they are one picture for all of it). */
export function driftRipples(delta: number): void {
  if (ripples == null) return;
  ripples.offset.x += delta * 0.02;
  ripples.offset.y += delta * 0.035;
}

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

/** Where the player sits: the eye, and the level directions to the right and ahead. Places are given as (right, up, ahead) from the eye. */
export class Seat {
  readonly eye = new Vector3();
  readonly right = new Vector3();
  readonly ahead = new Vector3();
  /**
   * The thing the seat is fixed to, when that thing moves (a deck that rolls): its origin is the seat's eye, its x the seat's right, its y up, its -z ahead.
   * Places (`at`, `local`) are then the moving thing's own; directions (`turn`) stay the world's, so what hangs still hangs straight down.
   */
  frame: Object3D | null = null;

  /** `yaw` as the rig's: 0 faces -z. */
  constructor(eye: Vector3, yaw: number) {
    this.eye.copy(eye);
    this.ahead.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  }

  at(right: number, up: number, ahead: number, out = new Vector3()): Vector3 {
    if (this.frame != null) return this.frame.localToWorld(out.set(right, up, -ahead));
    return out.copy(this.eye).addScaledVector(this.right, right).addScaledVector(this.ahead, ahead).setY(this.eye.y + up);
  }

  /** A world place as (right, up, ahead) in `out`'s x, y, z. */
  local(world: Vector3, out: Vector3): Vector3 {
    if (this.frame != null) {
      this.frame.worldToLocal(out.copy(world));
      out.z = -out.z;
      return out;
    }
    const x = world.x - this.eye.x;
    const z = world.z - this.eye.z;
    return out.set(x * this.right.x + z * this.right.z, world.y - this.eye.y, x * this.ahead.x + z * this.ahead.z);
  }

  /** A direction given as (right, up, ahead), out in the world. */
  turn(right: number, up: number, ahead: number, out = new Vector3()): Vector3 {
    return out.set(this.right.x * right + this.ahead.x * ahead, up, this.right.z * right + this.ahead.z * ahead);
  }
}

/** Water in the air: thrown from a bucket, spouting from a hole, breaking over a rail. One draw for all of it. */
export class Droplets {
  readonly mesh: InstancedMesh;
  private readonly at: Float32Array;
  private readonly speed: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private next = 0;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly still = new Quaternion();
  /** Drops falling below this height are gone (the deck, the water). */
  floor = -Infinity;

  constructor(
    private readonly capacity = 260,
    colour = 0xcfe3ea,
  ) {
    this.mesh = new InstancedMesh(new SphereGeometry(1, 6, 4), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.72, depthWrite: false }), capacity);
    this.mesh.name = 'Droplets';
    this.mesh.frustumCulled = false;
    this.mesh.pointerEvents = 'none';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.at = new Float32Array(capacity * 3);
    this.speed = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.update(0);
  }

  /** `count` drops from `from`, going `velocity` give or take `spread` (m/s), each `size` across (m), for at most `life` seconds. */
  emit(from: Vector3, velocity: Vector3, spread: number, count: number, size: number, life = 1.6, scatter = 0.02): void {
    for (let k = 0; k < count; k += 1) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      this.at[i * 3] = from.x + (Math.random() - 0.5) * scatter * 2;
      this.at[i * 3 + 1] = from.y + (Math.random() - 0.5) * scatter * 2;
      this.at[i * 3 + 2] = from.z + (Math.random() - 0.5) * scatter * 2;
      this.speed[i * 3] = velocity.x + (Math.random() - 0.5) * spread * 2;
      this.speed[i * 3 + 1] = velocity.y + (Math.random() - 0.5) * spread * 2;
      this.speed[i * 3 + 2] = velocity.z + (Math.random() - 0.5) * spread * 2;
      this.life[i] = life * (0.7 + Math.random() * 0.3);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  update(delta: number): void {
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.life[i] > 0) {
        this.life[i] -= delta;
        this.speed[i * 3 + 1] -= 9.81 * delta;
        this.at[i * 3] += this.speed[i * 3] * delta;
        this.at[i * 3 + 1] += this.speed[i * 3 + 1] * delta;
        this.at[i * 3 + 2] += this.speed[i * 3 + 2] * delta;
        if (this.at[i * 3 + 1] < this.floor) this.life[i] = 0;
      }
      const alive = this.life[i] > 0;
      this.p.set(this.at[i * 3], this.at[i * 3 + 1], this.at[i * 3 + 2]);
      // A drop is drawn a little long, the way it falls.
      this.s.set(alive ? this.size[i] : 0, alive ? this.size[i] * 1.6 : 0, alive ? this.size[i] : 0);
      this.m.compose(this.p, this.still, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** What a scene gives the play. */
export interface BailSet {
  rules: BailRules;
  /** The name in the dev log's lines ("ship", "sinking bank"). */
  tag: string;
  seat: Seat;
  /** The bucket (its origin at its bottom) and the water in it (hidden while empty; raised as it fills). */
  bucket: Object3D;
  bucketWater: Object3D | null;
  /** Where its handle is taken (a ring is shown there). */
  grip: Object3D;
  /** The cover's handle: where it is with the cover shut (right, up, ahead), and how far it slides to the left as the cover opens (m). */
  lid: { right: number; up: number; ahead: number; travel: number } | null;
  /** Whether a hand at (right, ahead) is over open water. */
  overWater(right: number, ahead: number, lid: number): boolean;
  /** How far the water stands above its level at (right, ahead) just now (m): the roll piles it to one side. Not given: level. */
  tide?(right: number, ahead: number): number;
  /** How the roll helps a throw just now: 1 with the rail right down, -1 with it right up. Not given: an even keel. */
  lean?(): number;
  spray: Droplets;
  /** The velocity a bucket's water leaves with, for a heave that puts `share` of it over the side. */
  fling(share: number, out: Vector3): Vector3;
  sound(what: 'take' | 'plunge' | 'throw' | 'slop' | 'lid' | 'shut' | 'full', strength: number): void;
  /** Rings round the rims of the buckets (the one in the hand, a giant one that copies it): red while empty, amber as they fill, green when full. Green is "now: lift and heave". */
  fillMarks?: readonly Mesh[];
  /** Which way the bucket tips as it is thrown: 1 ahead (the default), -1 back toward the player. */
  tipToward?: number;
}

const UP = new Vector3(0, 1, 0);

/** A hand this near the bucket's handle, pinching, has it; nearer still, it has it anyway (m). */
const TAKE_REACH = 0.14;
/** A hand resting this near the cover's handle for this long has hold of it (m, s); it lets go past this (m). */
const LID_REACH = 0.1;
const LID_DWELL = 0.15;
const LID_LOSE = 0.18;
/** A pinch (a click) by the free hand this near the handle pulls the cover shut by itself, in this long; and it stays braced this long after (m, s, s). */
const LID_GRAB = 0.36;
const LID_PULL = 0.35;
const LID_BRACE = 1.2;
/** How quickly a hand's measured speed follows its movement (s). */
const SPEED_SMOOTH = 0.05;

/** One stage being played: the hold, the bucket, and the two hands. */
export class BailPlay {
  hold: Hold;
  readonly bucket: Bucket = { fill: 0, peak: 0 };
  readonly step: HoldStep = { coming: false, hit: 0, lost: false, won: false };
  /** The throw made this frame, or null. */
  thrown: Throw | null = null;
  /** The hand the bucket is in. */
  taken: Side | null = null;
  /** The hand on the cover's handle. */
  lidHand: Side | null = null;
  /** Seconds since the last throw (the bucket tips as it is thrown). */
  sinceThrow = 9;
  stage: BailStage;
  eased = 1;
  private readonly hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  /** Each hand as (right, up, ahead) from the seat, and its speed so. */
  readonly local: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };
  private readonly before: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };
  private readonly speed: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };
  private readonly near: Record<Side, number> = { left: 0, right: 0 };
  private readonly out: Throw = { out: 0, back: 0, speed: 0 };
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private wasUnder = 0;
  private started = false;
  /** Where the bucket's handle is drawn (it lags the hand a little), and its swing from straight down (radians: x to the right, z ahead). */
  readonly grip = new Vector3();
  readonly swing = new Vector3();
  private readonly swingRate = new Vector3();
  private readonly was = new Vector3();
  private hung = false;
  private wasFull = false;
  private readonly pinched: Record<Side, boolean> = { left: false, right: false };
  /** Seconds left of the cover being pulled shut by a pinch, where it was pulled from, and seconds left of its being braced. */
  private pulling = 0;
  private pulledFrom = 0;
  private braced = 0;
  private logAt = 0;
  private clock = 0;

  constructor(
    private readonly d: DirectorSystem,
    readonly set: BailSet,
  ) {
    this.stage = set.rules.rehearsal;
    this.hold = newHold(this.stage);
  }

  /** Start `stage` afresh (the bucket stays in the hand that has it). */
  begin(stage: BailStage, eased: number): void {
    this.stage = stage;
    this.eased = eased;
    this.hold = newHold(stage);
    this.bucket.fill = 0;
    this.bucket.peak = 0;
    this.lidHand = null;
    this.pulling = 0;
    this.braced = 0;
    this.step.lost = false;
    this.step.won = false;
  }

  /** The cover's handle now, as (right, up, ahead). */
  lidAt(out: Vector3): Vector3 {
    const lid = this.set.lid;
    if (lid == null) return out.set(0, 0, 0);
    return out.set(lid.right - this.hold.lid * lid.travel, lid.up, lid.ahead);
  }

  /** One frame between stages: the bucket stays in the hand that has it, and nothing is counted. */
  carry(delta: number): void {
    this.thrown = null;
    this.sinceThrow += delta;
    this.started = false;
    if (this.taken == null) return;
    readHands(this.d, this.hands);
    for (const side of SIDES) this.set.seat.local(this.hands[side], this.local[side]);
    this.hang(delta, Math.max(this.local[this.taken].y, this.set.rules.brim + this.set.rules.bottom));
  }

  /**
   * The bucket hangs from the hand that has it, as a weight on a short
   * handle does: it lags a hand that starts or stops, swings on after it,
   * and is slower to follow the fuller it is. `height` is the hand's, from
   * the eye. The swing is what is seen; the rules go by the hand.
   */
  private hang(delta: number, height: number): void {
    const { set } = this;
    const side = this.taken;
    if (side == null) return;
    const long = set.rules.bottom;
    // Where the hand is; or, kept clear of the wood, where the hand would be at that height in the seat's own frame.
    if (height === this.local[side].y) this.w.copy(this.hands[side]);
    else set.seat.at(this.local[side].x, height, this.local[side].z, this.w);
    if (!this.hung) this.grip.copy(this.w);
    this.hung = true;
    // A full bucket is heavy in the hand.
    this.grip.lerp(this.w, Math.min(1, delta * (34 - 18 * this.bucket.fill)));
    // The hand's change of speed swings it the other way (right and ahead; a pendulum of the handle's length).
    const speed = this.speed[side];
    if (delta > 0) {
      const ax = Math.max(-30, Math.min(30, (speed.x - this.was.x) / delta));
      const az = Math.max(-30, Math.min(30, (speed.z - this.was.z) / delta));
      this.swingRate.x += (-(9.81 / long) * this.swing.x - 3.2 * this.swingRate.x - ax / long) * delta;
      this.swingRate.z += (-(9.81 / long) * this.swing.z - 3.2 * this.swingRate.z - az / long) * delta;
      this.swing.x = Math.max(-0.9, Math.min(0.9, this.swing.x + this.swingRate.x * delta));
      this.swing.z = Math.max(-0.9, Math.min(0.9, this.swing.z + this.swingRate.z * delta));
    }
    this.was.copy(speed);
    // As it is thrown it tips toward where the water goes.
    const tip = 1.3 * Math.max(0, 1 - this.sinceThrow / 0.35) * (set.tipToward ?? 1);
    const right = Math.sin(this.swing.x);
    const ahead = Math.sin(this.swing.z) - Math.sin(tip) * 0.9;
    const down = Math.sqrt(Math.max(0.05, 1 - right * right - ahead * ahead));
    // From the grip down the handle to the bucket's bottom.
    set.seat.turn(right, -down, ahead, this.v).normalize();
    set.bucket.position.copy(this.grip).addScaledVector(this.v, long);
    set.bucket.quaternion.setFromUnitVectors(UP, this.v.negate());
  }

  /** One frame of play. The scene draws from `hold`, `bucket`, `step` and `thrown` afterwards. */
  frame(delta: number): void {
    const { set, d } = this;
    const rules = set.rules;
    this.thrown = null;
    this.clock += delta;
    this.sinceThrow += delta;
    readHands(d, this.hands);
    for (const side of SIDES) {
      set.seat.local(this.hands[side], this.local[side]);
      if (!this.started) {
        this.before[side].copy(this.local[side]);
        // A hand already closed when play begins has not just pinched.
        this.pinched[side] = this.hands.pinching[side];
      }
      this.v.copy(this.local[side]).sub(this.before[side]);
      // A hand found again after being lost jumps: that is not a heave.
      if (delta <= 0 || this.v.length() > 0.8) this.speed[side].set(0, 0, 0);
      else this.speed[side].lerp(this.v.divideScalar(delta), 1 - Math.exp(-delta / SPEED_SMOOTH));
      this.before[side].copy(this.local[side]);
    }
    this.started = true;

    // The bucket: taken once, by either hand, and it stays there.
    if (this.taken == null) {
      set.grip.getWorldPosition(this.w);
      for (const side of SIDES) {
        const reach = this.hands[side].distanceTo(this.w);
        if (reach <= TAKE_REACH && (this.hands.pinching[side] || reach <= TAKE_REACH * 0.6)) {
          this.taken = side;
          set.sound('take', 1);
          if (import.meta.env.DEV) console.info(`[${set.tag}] bucket taken by ${side}`);
          break;
        }
      }
    }
    if (this.taken != null) {
      const hand = this.local[this.taken];
      const over = set.overWater(hand.x, hand.z, this.hold.lid);
      // Away from the open water the bucket cannot go under: it rides on the brim, the cover or the deck.
      const height = over ? hand.y : Math.max(hand.y, rules.brim + rules.bottom);
      const tide = set.tide?.(hand.x, hand.z) ?? 0;
      const water = surface(rules, this.hold.level) + tide;
      const under = over ? submerged(rules, hand.y, water) : 0;
      if (under > 0 && this.wasUnder === 0 && this.speed[this.taken].y < -0.15) {
        set.sound('plunge', Math.min(1, -this.speed[this.taken].y));
        set.spray.emit(set.seat.at(hand.x, water, hand.z, this.w), this.v.set(0, 0.9, 0), 0.5, 8, 0.012, 0.5, 0.06);
      }
      this.wasUnder = under;
      const heave = heaveSpeed(this.speed[this.taken].y, this.speed[this.taken].z);
      this.thrown = stepBucket(rules, this.bucket, this.hold, height, heave, delta, this.out, tide, set.lean?.() ?? 0);
      this.hang(delta, height);
      if (this.thrown != null) {
        const t = this.thrown;
        this.sinceThrow = 0;
        const total = t.out + t.back;
        const share = total > 0 ? t.out / total : 0;
        this.w.copy(this.grip);
        this.w.y -= rules.rim;
        set.spray.emit(this.w, set.fling(share, this.v), 0.35 + 0.25 * (1 - share), Math.round(8 + 26 * total), 0.02 + 0.012 * total, 1.8, 0.04);
        set.sound(share >= 0.5 ? 'throw' : 'slop', total);
        if (import.meta.env.DEV) console.info(`[${set.tag}] throw: ${t.out.toFixed(2)} out, ${t.back.toFixed(2)} back, at ${t.speed.toFixed(2)} m/s; level ${this.hold.level.toFixed(2)}`);
      }
    }
    // The rim's colour is the bucket's gauge: red empty, amber filling, green full (with a click as it turns).
    const full = this.bucket.fill >= 0.92;
    if (full && !this.wasFull) {
      set.sound('full', 1);
      if (import.meta.env.DEV) console.info(`[${set.tag}] bucket full`);
    }
    this.wasFull = full;
    if (set.fillMarks != null) {
      const colour = full ? 0x35d07f : this.bucket.fill > 0.08 ? 0xf2a63a : 0xc8323a;
      for (const mark of set.fillMarks) {
        (mark.material as MeshBasicMaterial).color.setHex(colour);
        mark.visible = this.taken != null;
      }
    }
    if (set.bucketWater != null) {
      set.bucketWater.visible = this.bucket.fill > 0.04;
      set.bucketWater.position.y = (rules.bottom - rules.rim) * (0.15 + 0.8 * this.bucket.fill);
    }

    // The cover: a hand that rests on its handle has hold of it.
    const lid = set.lid;
    if (lid != null) {
      this.lidAt(this.w);
      // A pinch by the hand that is not carrying the bucket, near the handle: the cover is pulled shut (already shut, it is braced).
      for (const side of SIDES) {
        const now = this.hands.pinching[side];
        if (now && !this.pinched[side] && side !== this.taken && this.pulling <= 0 && this.local[side].distanceTo(this.w) <= LID_GRAB) {
          if (this.hold.lid > 0) {
            this.pulling = LID_PULL;
            this.pulledFrom = this.hold.lid;
            set.sound('lid', 1);
            if (import.meta.env.DEV) console.info(`[${set.tag}] cover pulled shut by a pinch of the ${side} hand from ${this.hold.lid.toFixed(2)}`);
          } else this.braced = LID_BRACE;
        }
        this.pinched[side] = now;
      }
      if (this.pulling > 0) {
        this.pulling -= delta;
        shoveLid(this.hold, Math.min(this.hold.lid, this.pulledFrom * Math.max(0, this.pulling / LID_PULL)));
        if (this.pulling <= 0) {
          shoveLid(this.hold, 0);
          this.braced = LID_BRACE;
          set.sound('shut', 1);
          if (import.meta.env.DEV) console.info(`[${set.tag}] cover shut`);
        }
      }
      this.braced = Math.max(0, this.braced - delta);
      this.lidAt(this.w);
      if (this.lidHand == null) {
        for (const side of SIDES) {
          this.near[side] = this.local[side].distanceTo(this.w) <= LID_REACH ? this.near[side] + delta : 0;
          if (this.near[side] >= LID_DWELL) {
            this.lidHand = side;
            this.near[side] = 0;
            set.sound('lid', 1);
            if (import.meta.env.DEV) console.info(`[${set.tag}] cover held by ${side} at ${this.hold.lid.toFixed(2)}`);
            break;
          }
        }
      } else {
        // A shove only: the cover goes shut under the hand and stays where it was left; it is let go when the hand has left the handle.
        const hand = this.local[this.lidHand];
        const was = this.hold.lid;
        const pushed = (lid.right - hand.x) / lid.travel;
        if (pushed < was && Math.hypot(hand.y - lid.up, hand.z - lid.ahead) <= LID_LOSE) shoveLid(this.hold, pushed);
        if (was > 0 && this.hold.lid === 0) {
          set.sound('shut', 1);
          if (import.meta.env.DEV) console.info(`[${set.tag}] cover shut`);
        }
        if (hand.distanceTo(this.lidAt(this.w)) > LID_LOSE) {
          if (import.meta.env.DEV) console.info(`[${set.tag}] cover let go at ${this.hold.lid.toFixed(2)}`);
          this.lidHand = null;
        }
      }
    }

    stepHold(this.hold, this.stage, delta, this.eased * slack(rules, this.hold.clock), this.lidHand != null || this.pulling > 0 || this.braced > 0, this.step, rules.grace);
    if (import.meta.env.DEV) {
      if (this.step.coming) console.info(`[${set.tag}] wave coming`);
      if (this.step.hit > 0) console.info(`[${set.tag}] wave hit: ${this.step.hit.toFixed(3)} in, cover ${this.hold.lid.toFixed(2)}`);
      if (this.clock >= this.logAt) {
        this.logAt = this.clock + 0.25;
        const hand = this.taken == null ? null : this.local[this.taken];
        console.info(`[${set.tag}] level ${this.hold.level.toFixed(3)} lid ${this.hold.lid.toFixed(2)} fill ${this.bucket.fill.toFixed(2)} wave ${Number.isFinite(this.hold.waveIn) ? this.hold.waveIn.toFixed(1) : '-'} hand ${hand == null ? '-' : hand.y.toFixed(2)} thrown ${this.hold.thrown.toFixed(2)} dt ${(delta * 1000).toFixed(0)}`);
      }
    }
  }
}
