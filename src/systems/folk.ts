import { createSystem, type InstancedMesh, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { BUILD, EASE, HELP } from '../season/model.js';
import { solidarityOf } from '../season/store.js';
import { TRAM_SOLIDS } from '../station/builds.js';
import { ACCORDION, DARIO, FOLK_COUNT, SHOULDER } from '../station/folk.js';
import { type Box, PLAZA_Y } from '../station/layout.js';
import { GroundGrid } from '../station/life.js';
import { CAR_SOLIDS, HIDDEN } from '../station/reactions.js';
import { AID_STACK, STACK_SOLID } from '../station/solidarity.js';
import { KERB } from '../station/streetscape.js';
import { SOLID } from '../station/town.js';
import { festivalOn } from './festival.js';

/** Roles by index: strollers on the square, walkers on the row's sidewalk, the two who come out under the tower, Dario, and the last night's extra guests. */
const STROLLERS = 9;
const WALKERS = 4;
const WAVER = STROLLERS + WALKERS;
const COMPANION = WAVER + 1;
const DARIO_INDEX = COMPANION + 1;
const GUESTS = DARIO_INDEX + 1;

const OFF = 0;
const WALK = 1;
const STAND = 2;
const WAVE = 3;

/** Where the square is seen from the seat (the sill hides anything nearer than about 13 m), and the sidewalk. */
const SQUARE = { x0: -16, x1: 22, z0: -22.3, z1: -13.6 } as const;
const SIDEWALK = { x0: -19.5, x1: 25, z0: -26.2, z1: -24.9 } as const;
/** The sidewalk's kerb: beyond it (toward the row) people stand a kerb higher. */
const KERB_Z = -24.3;
const STEP = 0.72;
const WAVE_SECONDS = 6;
/** A lane across the square in front of the stalls and the bike rack, for going round them. */
const LANE_Z = -20.6;

/** What someone does on reaching their target: nothing more, wave up at the tower, walk on to what the choice touched, or go on to a last-night place. */
const THEN_NOTHING = 0;
const THEN_WAVE = 1;
const THEN_EASE = 2;
const THEN_HELP = 3;
const THEN_BUILD = 4;
const THEN_SPOT = 5;

/**
 * Moves the townsfolk (station/folk.ts). Most of them stroll between open
 * spots on the visible part of the square or along the row's sidewalk,
 * pausing as people do. When the basket goes down, two come out from under
 * the tower; one stops where the Keeper can see and waves up, the other
 * walks on toward what the week's choice touched. In a solidarity week two
 * stand by the crates. On the last night everyone gathers round the
 * fountain, and Dario plays. Allocation-free in update().
 */
export class FolkSystem extends createSystem({
  week: { required: [Week] },
}) {
  private coats: InstancedMesh | null = null;
  private heads: InstancedMesh | null = null;
  private details: InstancedMesh | null = null;
  private arms: InstancedMesh | null = null;
  private accordion: InstancedMesh | null = null;
  private ground: GroundGrid | null = null;
  private readonly x = new Float32Array(FOLK_COUNT);
  private readonly z = new Float32Array(FOLK_COUNT);
  private readonly tx = new Float32Array(FOLK_COUNT);
  private readonly tz = new Float32Array(FOLK_COUNT);
  private readonly yaw = new Float32Array(FOLK_COUNT);
  private readonly face = new Float32Array(FOLK_COUNT);
  private readonly speed = new Float32Array(FOLK_COUNT);
  private readonly wait = new Float32Array(FOLK_COUNT);
  private readonly step = new Float32Array(FOLK_COUNT);
  private readonly size = new Float32Array(FOLK_COUNT);
  private readonly mode = new Uint8Array(FOLK_COUNT);
  private readonly then = new Uint8Array(FOLK_COUNT);
  /** A final target, after a first leg round the stalls. */
  private readonly fx = new Float32Array(FOLK_COUNT);
  private readonly fz = new Float32Array(FOLK_COUNT);
  /** Spots round the fountain for the last night, found once on open paving. */
  private spots: Float32Array = new Float32Array(0);
  private seed = 41;
  private phase = '';
  private night = false;
  private elapsed = 0;
  private readonly m = new Matrix4();
  private readonly arm = new Matrix4();
  private readonly at = new Vector3();
  private readonly turn = new Quaternion();
  private readonly tilt = new Quaternion();
  private readonly scale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly side = new Vector3(0, 0, 1);

  init(): void {
    const find = (name: string) => (this.world.scene.getObjectByName(name) as InstancedMesh | undefined) ?? null;
    this.coats = find('FolkCoats');
    this.heads = find('FolkHeads');
    this.details = find('FolkDetails');
    this.arms = find('FolkArms');
    this.accordion = find('FolkAccordion');
    // Open paving on a 30 cm grid: everything the Keeper cannot walk through, plus the cars, the crates and
    // the tram whether or not this week shows them.
    const ground = new GroundGrid(-20.5, -26.9, 24.5, -0.8, 0.3);
    const block = (b: Box) => ground.block(b[0], b[3], b[2], b[5]);
    for (const b of SOLID) block(b);
    for (const b of CAR_SOLIDS) block(b);
    for (const b of TRAM_SOLIDS) block(b);
    block(STACK_SOLID);
    this.ground = ground;
    // The last night's places: two rings round the fountain, on open paving the seat can see.
    const spots: number[] = [];
    for (const r of [4.3, 5.6]) {
      for (let k = 0; k < 28; k += 1) {
        const a = (k / 28) * Math.PI * 2;
        const x = 4 + Math.cos(a) * r;
        const z = -14 + Math.sin(a) * r;
        if (z < -13.4 && ground.isFree(x, z) && Math.hypot(x - DARIO.x, z - DARIO.z) > 1.2) spots.push(x, z);
      }
    }
    this.spots = new Float32Array(spots);
    for (let i = 0; i < FOLK_COUNT; i += 1) {
      this.size[i] = 0.92 + this.random() * 0.12;
      this.speed[i] = 1.05 + this.random() * 0.35;
    }
    for (let i = 0; i < STROLLERS; i += 1) this.spawn(i, SQUARE);
    for (let i = STROLLERS; i < WAVER; i += 1) this.spawn(i, SIDEWALK);
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null || this.ground == null || this.coats == null) return;
    this.elapsed += delta;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const n = week.getValue(Week, 'week') ?? 1;
    const aid = solidarityOf(n) != null;
    if (phase !== this.phase) {
      this.onPhase(phase, aid, week.getValue(Week, 'chosen') ?? -1);
      this.phase = phase;
    }
    const night = festivalOn();
    if (night !== this.night) {
      this.night = night;
      this.gather(night);
    }
    for (let i = 0; i < FOLK_COUNT; i += 1) {
      if (this.mode[i] === OFF) continue;
      this.move(i, delta);
    }
    this.draw();
  }

  /** The basket going down brings two people out from under the tower; a solidarity week keeps two by the crates. */
  private onPhase(phase: string, aid: boolean, chosen: number): void {
    if (phase === Phase.Lowering && !aid) {
      this.place(WAVER, -0.9, -3.0, WALK, -3.6, -15.6);
      this.then[WAVER] = THEN_WAVE;
      this.place(COMPANION, 0.9, -3.2, WALK, -2.2, -16.6);
      // Where the companion is headed next: what the choice touched.
      this.then[COMPANION] = chosen === EASE ? THEN_EASE : chosen === HELP ? THEN_HELP : chosen === BUILD ? THEN_BUILD : THEN_NOTHING;
    }
    if (phase === Phase.Landed && aid) {
      this.place(0, -3.0, -14.6, STAND, -3.0, -14.6);
      this.face[0] = Math.atan2(AID_STACK.x + 3.0, AID_STACK.z + 14.6);
      this.place(1, -4.7, -13.8, STAND, -4.7, -13.8);
      this.face[1] = Math.atan2(AID_STACK.x + 4.7, AID_STACK.z + 13.8);
    }
    if (phase === Phase.Shut) {
      this.mode[WAVER] = OFF;
      this.mode[COMPANION] = OFF;
      for (let i = 0; i < 2; i += 1) if (this.mode[i] === STAND && !this.night) this.mode[i] = WALK;
    }
  }

  /** The last night: everyone on the square comes to the fountain, guests walk in, Dario takes his place. After it, back to strolling. */
  private gather(on: boolean): void {
    if (!on) {
      this.mode[DARIO_INDEX] = OFF;
      for (let i = GUESTS; i < FOLK_COUNT; i += 1) this.mode[i] = OFF;
      for (let i = 0; i < STROLLERS; i += 1) this.mode[i] = WALK;
      return;
    }
    const facing = Math.atan2(0 - DARIO.x, 0 - DARIO.z);
    this.place(DARIO_INDEX, DARIO.x, DARIO.z, STAND, DARIO.x, DARIO.z);
    this.face[DARIO_INDEX] = facing;
    let spot = 0;
    const take = (i: number) => {
      if (spot * 2 + 1 >= this.spots.length) return;
      const sx = this.spots[spot * 2];
      const sz = this.spots[spot * 2 + 1];
      spot += 1;
      this.mode[i] = WALK;
      this.wait[i] = 0;
      // Facing Dario as they listen.
      this.face[i] = Math.atan2(DARIO.x - sx, DARIO.z - sz);
      this.route(i, sx, sz);
    };
    for (let i = 0; i < STROLLERS; i += 1) take(i);
    for (let i = GUESTS; i < FOLK_COUNT; i += 1) {
      // In from either end of the square, beyond what the window shows.
      this.place(i, i % 2 === 0 ? -19 : 23.5, -21.6 + (i % 3) * 0.5, WALK, 0, 0);
      take(i);
    }
  }

  private move(i: number, delta: number): void {
    if (this.mode[i] === WAVE) {
      this.wait[i] -= delta;
      this.yaw[i] += angle(this.face[i] - this.yaw[i]) * Math.min(1, delta * 4);
      if (this.wait[i] <= 0) {
        this.mode[i] = WALK;
        this.pickTarget(i, SQUARE);
      }
      return;
    }
    if (this.mode[i] === STAND) {
      this.yaw[i] += angle(this.face[i] - this.yaw[i]) * Math.min(1, delta * 3);
      return;
    }
    const dx = this.tx[i] - this.x[i];
    const dz = this.tz[i] - this.z[i];
    const d = Math.hypot(dx, dz);
    if (d < 0.08) {
      this.arrive(i);
      return;
    }
    if (this.wait[i] > 0) {
      this.wait[i] -= delta;
      return;
    }
    const go = Math.min(d, this.speed[i] * delta);
    this.x[i] += (dx / d) * go;
    this.z[i] += (dz / d) * go;
    this.step[i] += go / STEP;
    this.yaw[i] += angle(Math.atan2(dx, dz) - this.yaw[i]) * Math.min(1, delta * 6);
  }

  /** At the target: the waver turns and waves, the night's guests stand, the rest pause and walk on. */
  private arrive(i: number): void {
    const then = this.then[i];
    this.then[i] = THEN_NOTHING;
    if (then === THEN_WAVE) {
      this.mode[i] = WAVE;
      this.wait[i] = WAVE_SECONDS;
      this.face[i] = Math.atan2(0 - this.x[i], 0 - this.z[i]);
      return;
    }
    // On toward the kerb's cars, Tessa's door across the square, or the tram line.
    if (then === THEN_EASE) return this.route(i, 9.5, -21.4);
    if (then === THEN_HELP) return this.route(i, -2.6, -21.2);
    if (then === THEN_BUILD) return this.route(i, -11, -20.5);
    if (then === THEN_SPOT) return this.target(i, this.fx[i], this.fz[i]);
    if (this.night && (i < STROLLERS || i >= GUESTS)) {
      this.mode[i] = STAND;
      return;
    }
    if (this.mode[i] === STAND) return;
    // A pause, sometimes a long one (talking to someone, looking at the stalls), then somewhere else.
    this.wait[i] = this.random() < 0.2 ? 6 + this.random() * 8 : 0.8 + this.random() * 3;
    this.pickTarget(i, i >= STROLLERS && i < WAVER ? SIDEWALK : SQUARE);
  }

  private pickTarget(i: number, area: { x0: number; x1: number; z0: number; z1: number }): void {
    const ground = this.ground as GroundGrid;
    for (let tries = 0; tries < 16; tries += 1) {
      const x = area.x0 + this.random() * (area.x1 - area.x0);
      const z = area.z0 + this.random() * (area.z1 - area.z0);
      const d = Math.hypot(x - this.x[i], z - this.z[i]);
      if (d < 3 || d > 20 || !ground.isFree(x, z) || !ground.pathFree(this.x[i], this.z[i], x, z)) continue;
      this.tx[i] = x;
      this.tz[i] = z;
      return;
    }
    // Nowhere reachable in a straight line just now: stay a moment and look again.
    this.tx[i] = this.x[i];
    this.tz[i] = this.z[i];
    this.wait[i] = 1;
  }

  /** Heads for (x, z): straight there if the way is open, otherwise along the lane in front of the stalls first. */
  private route(i: number, x: number, z: number): void {
    const ground = this.ground as GroundGrid;
    if (ground.pathFree(this.x[i], this.z[i], x, z)) return this.target(i, x, z);
    this.fx[i] = x;
    this.fz[i] = z;
    this.then[i] = THEN_SPOT;
    // Onto the lane where they are, along it, then up to the place.
    if (ground.pathFree(this.x[i], this.z[i], x, LANE_Z)) this.target(i, x, LANE_Z);
    else this.target(i, this.x[i], LANE_Z);
  }

  private target(i: number, x: number, z: number): void {
    this.tx[i] = x;
    this.tz[i] = z;
    this.wait[i] = 0;
  }

  /** Puts someone on open paving in an area and sends them on their way. */
  private spawn(i: number, area: { x0: number; x1: number; z0: number; z1: number }): void {
    const ground = this.ground as GroundGrid;
    for (let tries = 0; tries < 40; tries += 1) {
      const x = area.x0 + this.random() * (area.x1 - area.x0);
      const z = area.z0 + this.random() * (area.z1 - area.z0);
      if (!ground.isFree(x, z)) continue;
      this.place(i, x, z, WALK, x, z);
      this.wait[i] = this.random() * 3;
      this.yaw[i] = this.random() * Math.PI * 2;
      return;
    }
  }

  private place(i: number, x: number, z: number, mode: number, tx: number, tz: number): void {
    this.then[i] = THEN_NOTHING;
    this.x[i] = x;
    this.z[i] = z;
    this.tx[i] = tx;
    this.tz[i] = tz;
    this.mode[i] = mode;
    this.wait[i] = 0;
    this.yaw[i] = Math.atan2(tx - x, tz - z) || 0;
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private draw(): void {
    const coats = this.coats as InstancedMesh;
    for (let i = 0; i < FOLK_COUNT; i += 1) {
      if (this.mode[i] === OFF) {
        coats.setMatrixAt(i, HIDDEN);
        this.heads?.setMatrixAt(i, HIDDEN);
        this.details?.setMatrixAt(i, HIDDEN);
        this.arms?.setMatrixAt(i, HIDDEN);
        continue;
      }
      const walking = this.mode[i] === WALK && this.wait[i] <= 0 && (this.tx[i] !== this.x[i] || this.tz[i] !== this.z[i]);
      const stride = walking ? Math.sin(this.step[i] * Math.PI) : 0;
      // A kerb higher on the sidewalk; a small bob with each step.
      const y = PLAZA_Y + (this.z[i] < KERB_Z ? KERB : 0) + Math.abs(stride) * 0.025;
      this.turn.setFromAxisAngle(this.up, this.yaw[i]);
      this.scale.setScalar(this.size[i]);
      this.m.compose(this.at.set(this.x[i], y, this.z[i]), this.turn, this.scale);
      coats.setMatrixAt(i, this.m);
      this.heads?.setMatrixAt(i, this.m);
      this.details?.setMatrixAt(i, this.m);
      // The right arm: swinging with the stride, raised and waving, or held out to the accordion.
      let swing = stride * 0.35;
      if (this.mode[i] === WAVE) swing = -2.5 + 0.35 * Math.sin(this.elapsed * 7);
      if (i === DARIO_INDEX) swing = 0.9;
      this.tilt.setFromAxisAngle(this.side, swing);
      this.arm.compose(this.at.set(SHOULDER.x, SHOULDER.y, SHOULDER.z), this.tilt, this.scale.setScalar(1));
      this.arm.premultiply(this.m);
      this.arms?.setMatrixAt(i, this.arm);
    }
    // Dario's accordion breathing in and out with the waltz.
    if (this.accordion != null) {
      if (this.mode[DARIO_INDEX] === OFF) this.accordion.setMatrixAt(0, HIDDEN);
      else {
        this.turn.setFromAxisAngle(this.up, this.yaw[DARIO_INDEX]);
        this.scale.set(0.8 + 0.35 * (0.5 + 0.5 * Math.sin(this.elapsed * 2.9)), 1, 1);
        this.at.set(0, ACCORDION.y, ACCORDION.z).applyQuaternion(this.turn).multiplyScalar(this.size[DARIO_INDEX]);
        this.at.x += this.x[DARIO_INDEX];
        this.at.y += PLAZA_Y;
        this.at.z += this.z[DARIO_INDEX];
        this.m.compose(this.at, this.turn, this.scale);
        this.accordion.setMatrixAt(0, this.m);
      }
      this.accordion.instanceMatrix.needsUpdate = true;
    }
    coats.instanceMatrix.needsUpdate = true;
    if (this.heads != null) this.heads.instanceMatrix.needsUpdate = true;
    if (this.details != null) this.details.instanceMatrix.needsUpdate = true;
    if (this.arms != null) this.arms.instanceMatrix.needsUpdate = true;
  }
}

/** An angle difference brought into -pi..pi, so turns take the short way round. */
function angle(a: number): number {
  return a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
}
