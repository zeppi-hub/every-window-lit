import { createSystem, type InstancedMesh, Matrix4, type Object3D } from '@iwsdk/core';
import { setAidCard, setAidSailed } from '../aid.js';
import { Phase, Week } from '../components.js';
import { solidarityOf } from '../season/store.js';
import { AID_CRATES, cratePlace, STACK_SOLID, VAN_ROUTE } from '../station/solidarity.js';
import { SOLID } from '../station/town.js';

/** Seconds after the basket lands before the van pulls up, how long it takes each way, and how long it loads. */
const ARRIVE_AFTER = 1.5;
const DRIVE = 5.5;
const LOAD = 3;

/**
 * The solidarity week on the square: through the morning the neighbours
 * stack crates left of the fountain; the Keeper's own gift comes down in
 * the basket to join them; then a van pulls up, takes
 * them and drives off toward the harbour. Only once it has gone does the
 * week's price card come (SeasonSystem, aid.ts), never with the letter.
 */
export class AidSystem extends createSystem({
  week: { required: [Week] },
}) {
  private van: Object3D | null = null;
  private crates: InstancedMesh | null = null;
  private stacked = -1;
  private landedFor = 0;
  private week = -1;
  private matrix = new Matrix4();
  private hidden = new Matrix4().makeScale(0, 0, 0);

  init(): void {
    this.van = this.world.scene.getObjectByName('AidVan') ?? null;
    this.crates = (this.world.scene.getObjectByName('AidCrates') as InstancedMesh | undefined) ?? null;
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    const van = this.van;
    if (week == null || van == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    if (n !== this.week) {
      // A new week: no crates, the van away, nothing gone yet.
      this.week = n;
      this.landedFor = 0;
      this.stack(0);
      setAidSailed(false);
      setAidCard('none');
      van.visible = false;
    }
    const aid = solidarityOf(n) != null;
    if (this.crates != null) this.crates.visible = aid;
    if (!aid) return;

    const after = phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday;
    if (!after) {
      this.stack(cratesBy(phase, week.getValue(Week, 'timer') ?? 0));
      return;
    }
    // The gift has joined the stack; the van comes, loads crate by crate, turns, and goes back the way it came.
    this.landedFor += delta;
    const t = this.landedFor - ARRIVE_AFTER;
    if (t < DRIVE) this.stack(AID_CRATES);
    if (t < 0) return;
    van.visible = true;
    if (t < DRIVE) {
      this.drive(van, smooth(t / DRIVE), false);
    } else if (t < DRIVE + LOAD) {
      const load = (t - DRIVE) / LOAD;
      this.stack(Math.max(0, Math.round(AID_CRATES * (1 - load))));
      // Turned round on the spot over the loading, eased.
      this.drive(van, 1, false);
      van.rotation.y += Math.PI * smooth(load);
    } else {
      const going = Math.min(1, (t - DRIVE - LOAD) / DRIVE);
      this.drive(van, 1 - smooth(going), true);
      if (going >= 1) {
        van.visible = false;
        setAidSailed(true);
      }
    }
  }

  /** Along the route at `along` (0 at the harbour end, 1 at the stop), facing the way it travels. */
  private drive(van: Object3D, along: number, leaving: boolean): void {
    const n = VAN_ROUTE.length - 1;
    let total = 0;
    for (let i = 0; i < n; i += 1) total += segment(i);
    let d = along * total;
    let i = 0;
    while (i < n - 1 && d > segment(i)) {
      d -= segment(i);
      i += 1;
    }
    const [x0, y0, z0] = VAN_ROUTE[i];
    const [x1, y1, z1] = VAN_ROUTE[i + 1];
    const f = Math.min(1, d / segment(i));
    van.position.set(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f);
    // The van's bonnet is its +x; heading toward the stop, or away from it when leaving.
    const heading = Math.atan2(-(z1 - z0), x1 - x0);
    van.rotation.y = leaving ? heading + Math.PI : heading;
  }

  /** Shows the first `count` crates in the stack, and keeps the walk out of it while any stand. */
  private stack(count: number): void {
    const crates = this.crates;
    if (crates == null || count === this.stacked) return;
    this.stacked = count;
    for (let i = 0; i < AID_CRATES; i += 1) crates.setMatrixAt(i, i < count ? cratePlace(i, this.matrix) : this.hidden);
    crates.instanceMatrix.needsUpdate = true;
    const at = SOLID.indexOf(STACK_SOLID);
    if (count > 0 && at < 0) SOLID.push(STACK_SOLID);
    if (count === 0 && at >= 0) SOLID.splice(at, 1);
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Crates arrive as the morning goes on: some by the time the basket rises, all once it has gone down. */
function cratesBy(phase: string, timer: number): number {
  switch (phase) {
    case Phase.Shut:
      return 0;
    case Phase.Morning:
      return Math.min(3, 1 + Math.floor(timer / 2));
    case Phase.Bell:
      return 4;
    case Phase.Rising:
      return 5;
    case Phase.Choosing:
      return 6;
    case Phase.Lowering:
      return 7;
    default:
      return AID_CRATES;
  }
}

/** Length of the route's `i`-th leg, on the ground. */
function segment(i: number): number {
  const [x0, , z0] = VAN_ROUTE[i];
  const [x1, , z1] = VAN_ROUTE[i + 1];
  return Math.hypot(x1 - x0, z1 - z0);
}
