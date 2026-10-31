import { createSystem, type InstancedMesh, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { stance } from '../stance.js';
import { townTime } from '../timeflow.js';
import { Phase, Week } from '../components.js';
import { BUILD, EASE, HELP } from '../season/model.js';
import { solidarityOf } from '../season/store.js';
import { TRAM_SOLIDS } from '../station/builds.js';
import { FOLK_COUNT, SHOULDER } from '../station/folk.js';
import { type Box, PLAZA_Y } from '../station/layout.js';
import { GroundGrid } from '../station/life.js';
import { CAR_SOLIDS, HIDDEN } from '../station/reactions.js';
import { AID_STACK, STACK_SOLID } from '../station/solidarity.js';
import { KERB } from '../station/streetscape.js';
import { SOLID } from '../station/town.js';
import { festivalOn } from './festival.js';

/** Roles by index: strollers on the square, walkers on the row's sidewalk, the two who come out under the tower, and the last night's extra guests. */
const STROLLERS = 9;
const WALKERS = 4;
const WAVER = STROLLERS + WALKERS;
const COMPANION = WAVER + 1;
const GUESTS = COMPANION + 1;
/** In walk stance they keep this far from the Keeper (m), and choose places no nearer than ROOM. */
const KEEP_AWAY = 0.7;
const ROOM = 1.0;
/** Leaning this far forward over the sill (head z), the square notices: everyone stops and looks up a moment. */
const LEAN_Z = -0.32;
const NOTICE_SECONDS = 2.6;
const NOTICE_AGAIN = 12;

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
 * walk over to the crates and stand by them. On the last night everyone
 * gathers round the fountain, facing Tessa's window, where Dario's waltz
 * comes from. Down on the square they step round the Keeper.
 * Allocation-free in update().
 */
export class FolkSystem extends createSystem({
  week: { required: [Week] },
}) {
  private coats: InstancedMesh | null = null;
  private heads: InstancedMesh | null = null;
  private details: InstancedMesh | null = null;
  private arms: InstancedMesh | null = null;
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
  /** 1 for someone who stands still once at their place (by the crates). */
  private readonly standAfter = new Uint8Array(FOLK_COUNT);
  /** Where the Keeper is when down on the square, and whether they are. */
  private readonly keeper = new Vector3();
  private walking = false;
  /** Tessa's window, where the last night's music comes from and the crowd looks. */
  private readonly music = new Vector3();
  /** Seconds left of the square looking up at the Keeper leaning out, and until it can happen again. */
  private noticing = 0;
  private noticeAgain = 0;
  private readonly eye = new Vector3();
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
    this.world.scene.getObjectByName('TessaWindow')?.getWorldPosition(this.music);
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
        if (z < -13.4 && ground.isFree(x, z)) spots.push(x, z);
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
    this.elapsed += delta * townTime();
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const n = week.getValue(Week, 'week') ?? 1;
    const aid = solidarityOf(n) != null;
    this.walking = stance() === 'walk';
    if (this.walking) this.player.head.getWorldPosition(this.keeper);
    // The Keeper leans out over the sill: the square looks up (META_VR_DINAMIKLER.md item 13).
    this.noticeAgain -= delta;
    if (this.noticing > 0) this.noticing -= delta;
    else if (!this.walking && this.noticeAgain <= 0 && !aid) {
      this.player.head.getWorldPosition(this.eye);
      if (this.eye.z < LEAN_Z) {
        this.noticing = NOTICE_SECONDS;
        this.noticeAgain = NOTICE_AGAIN;
        // The nearest one waves.
        let nearest = -1;
        let best = Infinity;
        for (let i = 0; i < STROLLERS; i += 1) {
          if (this.mode[i] !== WALK) continue;
          const d = Math.hypot(this.x[i], this.z[i]);
          if (d < best) {
            best = d;
            nearest = i;
          }
        }
        if (nearest >= 0) {
          this.mode[nearest] = WAVE;
          this.wait[nearest] = NOTICE_SECONDS + 1;
          this.face[nearest] = Math.atan2(-this.x[nearest], -this.z[nearest]);
        }
      }
    }
    if (phase !== this.phase) {
      this.onPhase(phase, aid, week.getValue(Week, 'chosen') ?? -1);
      this.phase = phase;
    }
    const night = festivalOn();
    if (night !== this.night) {
      this.night = night;
      this.gather(night);
    }
    // The town's clock: stopped while the Keeper holds the sun still (timeflow.ts).
    const step = delta * townTime();
    for (let i = 0; i < FOLK_COUNT; i += 1) {
      if (this.mode[i] === OFF) continue;
      this.move(i, step);
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
      // Two walk over to the crates and stand beside them, facing the stack.
      this.walkToStand(0, -3.0, -14.6);
      this.walkToStand(1, -4.7, -13.8);
    }
    if (phase === Phase.Shut) {
      this.mode[WAVER] = OFF;
      this.mode[COMPANION] = OFF;
      for (let i = 0; i < 2; i += 1) {
        this.standAfter[i] = 0;
        if (this.mode[i] === STAND && !this.night) this.mode[i] = WALK;
      }
    }
  }

  /** The last night: everyone on the square comes to the fountain, guests walk in, Dario takes his place. After it, back to strolling. */
  private gather(on: boolean): void {
    if (!on) {
      for (let i = GUESTS; i < FOLK_COUNT; i += 1) this.mode[i] = OFF;
      for (let i = 0; i < STROLLERS; i += 1) this.mode[i] = WALK;
      return;
    }
    let spot = 0;
    const take = (i: number) => {
      if (spot * 2 + 1 >= this.spots.length) return;
      const sx = this.spots[spot * 2];
      const sz = this.spots[spot * 2 + 1];
      spot += 1;
      this.mode[i] = WALK;
      this.wait[i] = 0;
      // Facing the family's window as they listen.
      this.face[i] = Math.atan2(this.music.x - sx, this.music.z - sz);
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
    // Looking up at the Keeper leaning out: stop and turn toward the tower.
    if (this.noticing > 0 && (i < WAVER || i >= GUESTS) && !this.night) {
      this.yaw[i] += angle(Math.atan2(-this.x[i], -this.z[i]) - this.yaw[i]) * Math.min(1, delta * 5);
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
    // Down on the square, nobody walks through the Keeper: they stop and choose another way.
    if (this.walking) {
      const nx = this.x[i] + (dx / d) * (go + 0.25);
      const nz = this.z[i] + (dz / d) * (go + 0.25);
      if (Math.hypot(nx - this.keeper.x, nz - this.keeper.z) < KEEP_AWAY) {
        this.wait[i] = 0.6;
        if (this.then[i] === THEN_NOTHING && !this.night) this.pickTarget(i, i >= STROLLERS && i < WAVER ? SIDEWALK : SQUARE);
        return;
      }
    }
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
    if (this.standAfter[i] === 1) {
      this.standAfter[i] = 0;
      this.mode[i] = STAND;
      return;
    }
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
      if (this.walking && Math.hypot(x - this.keeper.x, z - this.keeper.z) < ROOM) continue;
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

  /** Walks over to (x, z), round anything in the way, then stands there facing the crates. */
  private walkToStand(i: number, x: number, z: number): void {
    this.mode[i] = WALK;
    this.wait[i] = 0;
    this.face[i] = Math.atan2(AID_STACK.x - x, AID_STACK.z - z);
    this.standAfter[i] = 1;
    this.route(i, x, z);
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
      this.tilt.setFromAxisAngle(this.side, swing);
      this.arm.compose(this.at.set(SHOULDER.x, SHOULDER.y, SHOULDER.z), this.tilt, this.scale.setScalar(1));
      this.arm.premultiply(this.m);
      this.arms?.setMatrixAt(i, this.arm);
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
