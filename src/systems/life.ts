import { createSystem, type Entity, Vector3, VisibilityState } from '@iwsdk/core';
import { seededRandom } from '../station/geometry.js';
import { PLAZA_Y } from '../station/layout.js';
import {
  GULL_COUNT,
  type LifeRig,
  lifeRigOf,
  PIGEON_COUNT,
  type PigeonPose,
  poseGull,
  posePigeon,
  TownLife,
} from '../station/life.js';

/** Gulls are far away and slow: 30 updates a second is plenty. */
const FAR_STEP = 1 / 30;
/** A long frame (a hitch, or the return from the headset menu) is not replayed. */
const MAX_STEP = 0.1;

const GROUND = 0;
const HOP = 1;
const FLY = 2;
const PERCHED = 3;

/** Head angles (radians): a little raised at rest, down to the paving when pecking. */
const HEAD_REST = -0.12;
const PECK_HEAD = 1.5;
/** The body tips forward with each peck. */
const PECK_BODY = 0.38;
/** Pigeons keep about this far apart (m). */
const PERSONAL_SPACE = 0.36;
const FLIGHT_SPEED = 5.5;
const PIGEON_FLAP_HZ = 7.5;
const GULL_FLAP_HZ = 2.8;
const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;
/** How long pigeons stay on the Keeper's sill, and how near a hand may come before they fly. */
const SILL_STAY = 25;
const SILL_FLEE = 0.25;

/**
 * Brings the town to life (see src/station/life.ts): pigeons peck, look
 * about and hop between open spots on the square, and two of them now and
 * then fly up to a roof edge and back; gulls circle over the harbour with a
 * few wingbeats now and then.
 *
 * Pigeons update every frame, since their hops and flights are quick; gulls
 * at 30 Hz. Everything runs on the 2D page too (the town shows
 * behind the landing card) and pauses while the session is hidden or
 * blurred (headset off, system menu open), then carries on where it was.
 * All state lives in typed arrays allocated up front; update() allocates
 * nothing.
 */
export class LifeSystem extends createSystem({ life: { required: [TownLife] } }) {
  private rig: LifeRig | null = null;
  private entity: Entity | null = null;
  /** Seconds of life so far; stands still while paused. */
  private clock = 0;
  private farElapsed = FAR_STEP;
  private wingsOpen = false;
  private readonly random = seededRandom(97);
  private readonly pose: PigeonPose = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    headYaw: 0,
    headPitch: HEAD_REST,
    wings: NaN,
    shadow: 1,
  };

  // One slot per pigeon.
  private readonly mode = new Uint8Array(PIGEON_COUNT);
  private readonly zoneOf = new Uint8Array(PIGEON_COUNT);
  private readonly toRoof = new Uint8Array(PIGEON_COUNT);
  private readonly perchOf = new Int8Array(PIGEON_COUNT);
  private perchTaken = new Uint8Array(0);
  /** Pigeons called to the Keeper's sill by crumbs, and how near a hand may come before they go. */
  private readonly atSill = new Uint8Array(PIGEON_COUNT);
  private readonly handAt = new Vector3();
  private readonly x = new Float64Array(PIGEON_COUNT);
  private readonly y = new Float64Array(PIGEON_COUNT);
  private readonly z = new Float64Array(PIGEON_COUNT);
  private readonly yaw = new Float64Array(PIGEON_COUNT);
  /** A hop or flight: from, through (flights only) and to. */
  private readonly fromX = new Float64Array(PIGEON_COUNT);
  private readonly fromY = new Float64Array(PIGEON_COUNT);
  private readonly fromZ = new Float64Array(PIGEON_COUNT);
  private readonly viaX = new Float64Array(PIGEON_COUNT);
  private readonly viaY = new Float64Array(PIGEON_COUNT);
  private readonly viaZ = new Float64Array(PIGEON_COUNT);
  private readonly toX = new Float64Array(PIGEON_COUNT);
  private readonly toY = new Float64Array(PIGEON_COUNT);
  private readonly toZ = new Float64Array(PIGEON_COUNT);
  private readonly yawFrom = new Float64Array(PIGEON_COUNT);
  private readonly yawTo = new Float64Array(PIGEON_COUNT);
  private readonly started = new Float64Array(PIGEON_COUNT);
  private readonly duration = new Float64Array(PIGEON_COUNT);
  private readonly hopHeight = new Float64Array(PIGEON_COUNT);
  private readonly flapPhase = new Float64Array(PIGEON_COUNT);
  private readonly nextMove = new Float64Array(PIGEON_COUNT);
  private readonly nextFlight = new Float64Array(PIGEON_COUNT);
  private readonly perchUntil = new Float64Array(PIGEON_COUNT);
  private readonly peckStart = new Float64Array(PIGEON_COUNT);
  private readonly peckEnd = new Float64Array(PIGEON_COUNT);
  private readonly peckPeriod = new Float64Array(PIGEON_COUNT);
  private readonly nextPeck = new Float64Array(PIGEON_COUNT);
  private readonly headYaw = new Float64Array(PIGEON_COUNT);
  private readonly lookAt = new Float64Array(PIGEON_COUNT);
  private readonly nextLook = new Float64Array(PIGEON_COUNT);
  /** The last open spot findSpot() found. */
  private spotX = 0;
  private spotZ = 0;

  // One slot per gull.
  private readonly gullAngle = new Float64Array(GULL_COUNT);
  private readonly flapStart = new Float64Array(GULL_COUNT);
  private readonly flapEnd = new Float64Array(GULL_COUNT);
  private readonly nextFlap = new Float64Array(GULL_COUNT);

  init(): void {
    this.cleanupFuncs.push(
      // Replay: the station is usually built before this system registers.
      this.queries.life.subscribe('qualify', (entity) => this.attach(entity), true),
      this.queries.life.subscribe('disqualify', (entity) => {
        if (entity !== this.entity) return;
        this.rig = null;
        this.entity = null;
      }),
    );
  }

  update(delta: number): void {
    const rig = this.rig;
    if (rig == null) return;
    const state = this.world.visibilityState.peek();
    if (state === VisibilityState.Hidden || state === VisibilityState.VisibleBlurred) return;
    const dt = Math.min(Math.max(delta, 0), MAX_STEP);
    this.clock += dt;

    const wingsWereOpen = this.wingsOpen;
    this.updatePigeons(rig, dt);
    this.farElapsed += dt;
    // Reset rather than carry the remainder, so far updates come evenly spaced (every 3rd frame at 72 Hz).
    const far = this.farElapsed >= FAR_STEP - 1e-4;
    if (far) {
      this.updateGulls(rig, this.farElapsed);
      this.farElapsed = 0;
    }
    // Pigeon wings change only in flight, plus one frame to fold them away.
    if (far || this.wingsOpen || wingsWereOpen) rig.wings.instanceMatrix.needsUpdate = true;
  }

  private attach(entity: Entity): void {
    const rig = lifeRigOf(entity.object3D);
    if (rig == null) return;
    this.rig = rig;
    this.entity = entity;
    const t = this.clock;
    const pigeons = rig.pigeons;
    this.perchTaken = new Uint8Array(pigeons.perches.length / 3);
    for (let i = 0; i < PIGEON_COUNT; i += 1) {
      this.mode[i] = GROUND;
      this.zoneOf[i] = pigeons.zone[i];
      this.perchOf[i] = -1;
      this.x[i] = pigeons.startX[i];
      this.y[i] = PLAZA_Y;
      this.z[i] = pigeons.startZ[i];
      this.yaw[i] = pigeons.startYaw[i];
      this.headYaw[i] = 0;
      this.lookAt[i] = 0;
      this.nextLook[i] = t + this.random();
      this.peckEnd[i] = 0;
      this.nextPeck[i] = t + this.random() * 2;
      this.nextMove[i] = t + 1 + this.random() * 4;
      // The first trip to the roofs comes early, so even a short visit sees one.
      this.nextFlight[i] = pigeons.flyer[i] === 1 ? t + 12 + this.random() * 10 : Infinity;
    }
    for (let j = 0; j < GULL_COUNT; j += 1) {
      this.gullAngle[j] = rig.gulls.loops[j * 8 + 7];
      this.flapEnd[j] = 0;
      this.nextFlap[j] = t + this.random() * 6;
    }
    this.farElapsed = FAR_STEP;
  }

  // --- Pigeons ------------------------------------------------------------------

  private updatePigeons(rig: LifeRig, dt: number): void {
    const t = this.clock;
    const pose = this.pose;
    const active = rig.pigeons.active;
    this.wingsOpen = false;
    for (let i = 0; i < PIGEON_COUNT; i += 1) {
      if (active[i] === 0) continue;
      pose.pitch = 0;
      pose.roll = 0;
      pose.headPitch = HEAD_REST;
      pose.wings = NaN;
      pose.shadow = 1;
      const mode = this.mode[i];
      if (mode === GROUND) this.onGround(rig, i, t, dt);
      else if (mode === HOP) this.hopping(i, t, dt);
      else if (mode === FLY) this.flying(rig, i, t, dt);
      else this.perched(rig, i, t, dt);
      if (!Number.isNaN(pose.wings)) this.wingsOpen = true;
      pose.x = this.x[i];
      pose.y = this.y[i];
      pose.z = this.z[i];
      pose.yaw = this.yaw[i];
      pose.headYaw = this.headYaw[i];
      posePigeon(rig, i, pose);
    }
    rig.pigeonBodies.instanceMatrix.needsUpdate = true;
    rig.pigeonHeads.instanceMatrix.needsUpdate = true;
    rig.shadows.instanceMatrix.needsUpdate = true;
  }

  /** Bursts of pecks, looking about in between; then a hop, or a flight for the two flyers. */
  private onGround(rig: LifeRig, i: number, t: number, dt: number): void {
    const pose = this.pose;
    if (t >= this.nextPeck[i] && t >= this.peckEnd[i]) {
      const pecks = 2 + Math.floor(this.random() * 4);
      this.peckPeriod[i] = 0.26 + this.random() * 0.12;
      this.peckStart[i] = t;
      this.peckEnd[i] = t + pecks * this.peckPeriod[i];
      this.nextPeck[i] = this.peckEnd[i] + 0.8 + this.random() * 3.2;
    }
    const pecking = t < this.peckEnd[i];
    const peck = pecking ? peckCurve(((t - this.peckStart[i]) / this.peckPeriod[i]) % 1) : 0;
    this.look(i, t, dt, 1 - peck);
    pose.headPitch = HEAD_REST + peck * (PECK_HEAD - HEAD_REST);
    pose.pitch = peck * PECK_BODY;
    if (pecking) return;
    if (rig.pigeons.flyer[i] === 1 && t >= this.nextFlight[i]) this.takeOff(rig, i, t);
    else if (t >= this.nextMove[i]) this.startHop(rig, i, t);
  }

  private startHop(rig: LifeRig, i: number, t: number): void {
    const { ground, zones } = rig.pigeons;
    const zone = zones[this.zoneOf[i]];
    const x0 = this.x[i];
    const z0 = this.z[i];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      // Mostly onward, sometimes round about.
      const heading = this.yaw[i] + (this.random() * 2 - 1) * (attempt < 6 ? 1.3 : Math.PI);
      const distance = 0.22 + this.random() * 0.55;
      const x = x0 + Math.sin(heading) * distance;
      const z = z0 + Math.cos(heading) * distance;
      if (Math.hypot(x - zone.x, z - zone.z) > zone.radius) continue;
      if (!ground.isFree(x, z) || !ground.pathFree(x0, z0, x, z) || this.crowded(rig, i, x, z)) continue;
      this.beginHop(i, t, x, z, heading, distance);
      this.nextMove[i] = t + this.duration[i] + 1.8 + this.random() * 5;
      return;
    }
    // Nowhere to go: a little turn on the spot instead.
    this.beginHop(i, t, x0, z0, this.yaw[i] + (this.random() * 2 - 1) * 1.6, 0);
    this.nextMove[i] = t + 1 + this.random() * 2;
  }

  private beginHop(i: number, t: number, x: number, z: number, heading: number, distance: number): void {
    this.fromX[i] = this.x[i];
    this.fromZ[i] = this.z[i];
    this.toX[i] = x;
    this.toZ[i] = z;
    this.yawFrom[i] = this.yaw[i];
    this.yawTo[i] = heading;
    this.started[i] = t;
    this.duration[i] = 0.3 + 0.45 * distance;
    this.hopHeight[i] = 0.03 + 0.08 * distance;
    this.mode[i] = HOP;
  }

  /** Turn toward the spot, then one low hop onto it. */
  private hopping(i: number, t: number, dt: number): void {
    const s = Math.min(1, (t - this.started[i]) / this.duration[i]);
    this.yaw[i] = lerpAngle(this.yawFrom[i], this.yawTo[i], smooth(s / 0.45));
    const m = smooth((s - 0.25) / 0.75);
    const lift = Math.sin(Math.PI * m);
    this.x[i] = this.fromX[i] + (this.toX[i] - this.fromX[i]) * m;
    this.z[i] = this.fromZ[i] + (this.toZ[i] - this.fromZ[i]) * m;
    this.y[i] = PLAZA_Y + lift * this.hopHeight[i];
    this.pose.pitch = -0.2 * lift;
    this.look(i, t, dt, 0);
    if (s >= 1) {
      this.mode[i] = GROUND;
      this.y[i] = PLAZA_Y;
    }
  }

  /** Up to a free roof edge; with none found, a loop over the square to another flock. */
  private takeOff(rig: LifeRig, i: number, t: number): void {
    const perches = rig.pigeons.perches;
    let best = -1;
    let bestScore = Infinity;
    for (let k = 0; k < this.perchTaken.length; k += 1) {
      if (this.perchTaken[k] === 1) continue;
      const score = Math.hypot(perches[3 * k] - this.x[i], perches[3 * k + 2] - this.z[i]) + this.random() * 8;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best >= 0) {
      this.perchOf[i] = best;
      this.perchTaken[best] = 1;
      this.beginFlight(i, t, perches[3 * best], perches[3 * best + 1], perches[3 * best + 2], true);
    } else {
      const count = rig.pigeons.zones.length;
      const next = (this.zoneOf[i] + 1 + Math.floor(this.random() * (count - 1))) % count;
      if (!this.findSpot(rig, i, next)) {
        this.nextFlight[i] = t + 8;
        return;
      }
      this.zoneOf[i] = next;
      this.beginFlight(i, t, this.spotX, PLAZA_Y, this.spotZ, false);
    }
    this.nextFlight[i] = Infinity;
    // The other flyer often goes along.
    for (let j = 0; j < PIGEON_COUNT; j += 1) {
      if (j === i || rig.pigeons.active[j] === 0 || rig.pigeons.flyer[j] === 0) continue;
      if (this.mode[j] === GROUND && this.random() < 0.6) {
        this.nextFlight[j] = Math.min(this.nextFlight[j], t + 0.25 + this.random() * 0.5);
      }
    }
  }

  /**
   * Crumbs on the Keeper's sill (META_VR_DINAMIKLER.md item 4): up to as many
   * pigeons as there are spots fly up from the square, in through the open
   * window, and peck there until a hand comes near or they have had enough.
   * The flyers go first. Returns how many came.
   */
  feedAtSill(spots: ReadonlyArray<readonly [number, number, number]>): number {
    const rig = this.rig;
    if (rig == null) return 0;
    const t = this.clock;
    let sent = 0;
    for (const pass of [1, 0]) {
      for (let i = 0; i < PIGEON_COUNT && sent < spots.length; i += 1) {
        if (rig.pigeons.active[i] === 0 || rig.pigeons.flyer[i] !== pass || this.atSill[i] === 1) continue;
        if (this.mode[i] === FLY || this.mode[i] === HOP) continue;
        const perch = this.perchOf[i];
        if (perch >= 0) this.perchTaken[perch] = 0;
        this.perchOf[i] = -1;
        this.atSill[i] = 1;
        const [x, y, z] = spots[sent];
        this.beginFlight(i, t, x, y, z, true);
        sent += 1;
      }
    }
    return sent;
  }

  private beginFlight(i: number, t: number, tx: number, ty: number, tz: number, toRoof: boolean): void {
    const fx = this.x[i];
    const fy = this.y[i];
    const fz = this.z[i];
    this.fromX[i] = fx;
    this.fromY[i] = fy;
    this.fromZ[i] = fz;
    this.toX[i] = tx;
    this.toY[i] = ty;
    this.toZ[i] = tz;
    if (toRoof && this.atSill[i] === 1) {
      // To the Keeper's sill: up in front of the tower, then in through the window from outside.
      this.viaX[i] = tx + (fx - tx) * 0.3;
      this.viaY[i] = Math.max(fy, ty) + 1.2;
      this.viaZ[i] = tz - 2.5;
    } else if (toRoof) {
      // Up past the eaves, then drop onto the tiles from the square's side.
      this.viaX[i] = tx + (fx - tx) * 0.12;
      this.viaY[i] = Math.max(fy, ty) + 1.7;
      this.viaZ[i] = tz + 2.6;
    } else if (ty < fy - 1) {
      // Down from a roof: out over the square first, then glide in.
      this.viaX[i] = fx + (tx - fx) * 0.3;
      this.viaY[i] = fy + 0.7;
      this.viaZ[i] = fz + (tz - fz) * 0.35;
    } else {
      // A loop over the square.
      this.viaX[i] = (fx + tx) / 2;
      this.viaY[i] = PLAZA_Y + 3.2 + this.random() * 1.5;
      this.viaZ[i] = (fz + tz) / 2 - 1.5;
    }
    this.toRoof[i] = toRoof ? 1 : 0;
    const length = Math.hypot(tx - fx, ty - fy, tz - fz) + Math.abs(this.viaY[i] - (fy + ty) / 2);
    this.started[i] = t;
    this.duration[i] = Math.min(4.8, Math.max(1.6, length / FLIGHT_SPEED));
    this.flapPhase[i] = this.random() * TWO_PI;
    this.mode[i] = FLY;
  }

  /** Along a curve: quick wingbeats, a glide on the way down, a flare to land. */
  private flying(rig: LifeRig, i: number, t: number, dt: number): void {
    const pose = this.pose;
    const s = Math.min(1, (t - this.started[i]) / this.duration[i]);
    // Speeds up after take-off and slows to land.
    const e = s * s * (3 - 2 * s);
    const u = 1 - e;
    const a = u * u;
    const b = 2 * u * e;
    const c = e * e;
    this.x[i] = a * this.fromX[i] + b * this.viaX[i] + c * this.toX[i];
    this.y[i] = a * this.fromY[i] + b * this.viaY[i] + c * this.toY[i];
    this.z[i] = a * this.fromZ[i] + b * this.viaZ[i] + c * this.toZ[i];
    const dx = 2 * u * (this.viaX[i] - this.fromX[i]) + 2 * e * (this.toX[i] - this.viaX[i]);
    const dy = 2 * u * (this.viaY[i] - this.fromY[i]) + 2 * e * (this.toY[i] - this.viaY[i]);
    const dz = 2 * u * (this.viaZ[i] - this.fromZ[i]) + 2 * e * (this.toZ[i] - this.viaZ[i]);
    const level = Math.hypot(dx, dz);
    if (level > 1e-3) this.yaw[i] = Math.atan2(dx, dz);
    const climb = Math.atan2(dy, Math.max(level, 1e-3));
    const takingOff = 1 - smooth(s / 0.15);
    const landing = smooth((s - 0.8) / 0.2);
    pose.pitch = -0.45 * climb - 0.25 * takingOff - 0.55 * landing;
    const beat = Math.sin(TWO_PI * PIGEON_FLAP_HZ * t + this.flapPhase[i]);
    let wings = 0.3 + 0.9 * beat;
    if (this.fromY[i] > this.toY[i] + 1) {
      const glide = smooth((s - 0.3) / 0.08) * (1 - smooth((s - 0.66) / 0.08));
      wings += (0.45 + 0.05 * beat - wings) * glide;
    }
    wings += (0.8 + 0.6 * beat - wings) * landing;
    pose.wings = wings;
    pose.headPitch = -0.2;
    pose.shadow = clamp01(1 - (this.y[i] - PLAZA_Y) / 1.2);
    this.look(i, t, dt, 0);
    if (s >= 1) this.land(i, t);
  }

  private land(i: number, t: number): void {
    this.x[i] = this.toX[i];
    this.y[i] = this.toY[i];
    this.z[i] = this.toZ[i];
    if (this.toRoof[i] === 1) {
      this.mode[i] = PERCHED;
      this.perchUntil[i] = t + (this.atSill[i] === 1 ? SILL_STAY : 9 + this.random() * 14);
      // Turn round to face the square.
      this.yawFrom[i] = this.yaw[i];
      this.yawTo[i] = (this.random() - 0.5) * 0.9;
      this.started[i] = t;
    } else {
      this.mode[i] = GROUND;
      this.y[i] = PLAZA_Y;
      this.nextMove[i] = t + 1.2 + this.random() * 2;
      this.nextPeck[i] = t + 0.6;
      this.nextFlight[i] = t + 24 + this.random() * 30;
    }
  }

  /** On the roof edge: settle facing the square, look about, then fly home to the flock. */
  private perched(rig: LifeRig, i: number, t: number, dt: number): void {
    const settle = smooth((t - this.started[i]) / 0.45);
    this.yaw[i] = lerpAngle(this.yawFrom[i], this.yawTo[i], settle);
    this.look(i, t, dt, settle);
    this.pose.shadow = 0;
    if (this.atSill[i] === 1) {
      // Pecking at the crumbs; off as soon as a hand comes near.
      this.pose.headPitch = Math.sin(t * 7 + i) > 0.55 ? PECK_HEAD : HEAD_REST;
      if (this.handNear(this.x[i], this.y[i], this.z[i]) < SILL_FLEE) this.perchUntil[i] = t;
    }
    if (t < this.perchUntil[i]) return;
    this.atSill[i] = 0;
    const count = rig.pigeons.zones.length;
    let zone = this.zoneOf[i];
    if (!this.findSpot(rig, i, zone)) {
      zone = (zone + 1) % count;
      if (!this.findSpot(rig, i, zone)) {
        this.perchUntil[i] = t + 5;
        return;
      }
    }
    this.zoneOf[i] = zone;
    const perch = this.perchOf[i];
    if (perch >= 0) this.perchTaken[perch] = 0;
    this.perchOf[i] = -1;
    this.beginFlight(i, t, this.spotX, PLAZA_Y, this.spotZ, false);
  }

  /** The nearest of the Keeper's hands (index tips, or controllers' grips) to a point. */
  private handNear(x: number, y: number, z: number): number {
    let best = Infinity;
    for (const side of ['left', 'right'] as const) {
      for (const space of [this.player.indexTipSpaces[side], this.player.gripSpaces[side]]) {
        space.getWorldPosition(this.handAt);
        best = Math.min(best, Math.hypot(this.handAt.x - x, this.handAt.y - y, this.handAt.z - z));
      }
    }
    return best;
  }

  /** The head turns in quick snaps between glances; `weight` 0 holds it forward. */
  private look(i: number, t: number, dt: number, weight: number): void {
    if (t >= this.nextLook[i]) {
      this.lookAt[i] = (this.random() * 2 - 1) * 0.8;
      this.nextLook[i] = t + 0.35 + this.random() * 1.5;
    }
    this.headYaw[i] += (this.lookAt[i] * weight - this.headYaw[i]) * Math.min(1, dt * 14);
  }

  /** An open spot in a flock, kept in spotX and spotZ. */
  private findSpot(rig: LifeRig, i: number, zoneIndex: number): boolean {
    const zone = rig.pigeons.zones[zoneIndex];
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const angle = this.random() * TWO_PI;
      const r = zone.radius * 0.85 * Math.sqrt(this.random());
      const x = zone.x + Math.sin(angle) * r;
      const z = zone.z + Math.cos(angle) * r;
      if (rig.pigeons.ground.isFree(x, z) && !this.crowded(rig, i, x, z)) {
        this.spotX = x;
        this.spotZ = z;
        return true;
      }
    }
    return false;
  }

  /** Whether another pigeon stands at, or is about to land on, (x, z). */
  private crowded(rig: LifeRig, i: number, x: number, z: number): boolean {
    for (let j = 0; j < PIGEON_COUNT; j += 1) {
      if (j === i || rig.pigeons.active[j] === 0) continue;
      const mode = this.mode[j];
      if (mode === PERCHED || (mode === FLY && this.toRoof[j] === 1)) continue;
      const ox = mode === GROUND ? this.x[j] : this.toX[j];
      const oz = mode === GROUND ? this.z[j] : this.toZ[j];
      if (Math.hypot(ox - x, oz - z) < PERSONAL_SPACE) return true;
    }
    return false;
  }

  // --- Gulls (30 Hz) -----------------------------------------------------------

  private updateGulls(rig: LifeRig, dt: number): void {
    const t = this.clock;
    const loops = rig.gulls.loops;
    for (let j = 0; j < GULL_COUNT; j += 1) {
      const o = j * 8;
      const rx = loops[o + 2];
      const rz = loops[o + 3];
      const dir = loops[o + 6];
      const phase = loops[o + 7];
      // The loop slowly wanders, widens and narrows; the bird rises and sinks with it.
      const spread = 1 + 0.12 * Math.sin(0.047 * t + phase);
      const omega = (dir * loops[o + 5]) / (0.5 * (rx + rz) * spread);
      this.gullAngle[j] += omega * dt;
      const cos = Math.cos(this.gullAngle[j]);
      const sin = Math.sin(this.gullAngle[j]);
      const x = loops[o] + 6 * Math.sin(0.031 * t + phase) + rx * spread * cos;
      const z = loops[o + 1] + 5 * Math.sin(0.023 * t + 1.7 * phase) + rz * spread * sin;
      const y = loops[o + 4] + 2.5 * Math.sin(0.06 * t + phase);
      const vx = -rx * spread * sin * omega;
      const vz = rz * spread * cos * omega;
      const vy = 0.15 * Math.cos(0.06 * t + phase);
      const level = Math.hypot(vx, vz);
      // Banked into the turn, as a gliding bird is.
      const roll = dir * Math.atan((level * Math.abs(omega)) / GRAVITY);

      // Mostly gliding; a few wingbeats every several seconds.
      if (t >= this.nextFlap[j]) {
        this.flapStart[j] = t;
        this.flapEnd[j] = t + (3 + Math.floor(this.random() * 4)) / GULL_FLAP_HZ;
        this.nextFlap[j] = this.flapEnd[j] + 4 + this.random() * 9;
      }
      const flap =
        t < this.flapEnd[j]
          ? smooth((t - this.flapStart[j]) / 0.18) * smooth((this.flapEnd[j] - t) / 0.25)
          : 0;
      const wings =
        0.1 +
        0.03 * Math.sin(1.3 * t + phase) +
        flap * 0.6 * Math.sin(TWO_PI * GULL_FLAP_HZ * (t - this.flapStart[j]));
      poseGull(rig, j, x, y, z, Math.atan2(vx, vz), -Math.atan2(vy, level), roll, wings);
    }
    rig.gullBodies.instanceMatrix.needsUpdate = true;
  }
}

/** One peck: quickly down, a moment at the paving, back up, a pause. */
function peckCurve(phase: number): number {
  if (phase < 0.3) return smooth(phase / 0.3);
  if (phase < 0.42) return 1;
  if (phase < 0.78) return 1 - smooth((phase - 0.42) / 0.36);
  return 0;
}

function smooth(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** From angle a toward b the short way round. */
function lerpAngle(a: number, b: number, s: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * s;
}
