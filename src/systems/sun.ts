import { createSystem, type Entity, Grabbed, type Mesh, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { sunShown } from '../line-queue.js';
import { Phase, SunDial, Week } from '../components.js';
import { realWeek } from '../season/store.js';
import { onSignal } from '../signals.js';
import { familyVisited } from '../talk.js';
import { setTownTime } from '../timeflow.js';
import { OUTCOME_DAY, outcomeShows } from './outcomes.js';

const STOPS = 7;
const SUNDAY = STOPS - 1;
/** How quickly a let-go sun settles on its notch. */
const SNAP_RATE = 12;
/** A hold shorter than this that moved the sun less than TAP_TRAVEL is a tap. */
const TAP_SECONDS = 0.6;
const TAP_TRAVEL = 0.015;
/** Past the evening a choice shows its result, the sun sticks until pulled this much further (in stops). */
const DETENT = 0.75;
/** In Landed, the sun glows anyway after this long if the family window has not been visited. */
const LANDED_WAIT = 20;
/** A held sun counts as still when it stays within this of where it last moved (m) for this long (s). */
const STILL_REACH = 0.004;
const STILL_AFTER = 0.25;

/**
 * The brass sun on the sill. Once the basket has landed it can be slid
 * along its rod through the week's evenings, Monday to Sunday; it sticks
 * for a moment on the evening the Keeper's choice shows in the town, and
 * settles on the nearest notch when let go. A tap sends it on to the next
 * evening worth seeing (that one, then Sunday). Before the basket lands it
 * stays at Monday and goes back there if moved.
 */
export class SunSystem extends createSystem({
  dials: { required: [SunDial] },
  held: { required: [SunDial, Grabbed] },
  week: { required: [Week] },
}) {
  /** Where and when the current hold began, and the furthest it has taken the sun from there. */
  private grabbedAt: { time: number; x: number; reach: number; outcome: number } | null = null;
  private elapsed = 0;
  private landedFor = 0;
  private lastX = 0;
  private stillFor = 0;
  private flow = 1;
  /** The family's box: in the first week the sun waits until it is home again (line-queue.ts sunShown). */
  private box: Object3D | null = null;

  init(): void {
    this.box = this.world.scene.getObjectByName('FamilyBox') ?? null;
    this.cleanupFuncs.push(
      onSignal('sun', () => this.advance()),
      onSignal('restart', () => this.restart()),
      this.queries.held.subscribe('qualify', (entity) => {
        // The choice, the week and the town cannot change while the sun is held: its evening is worked out once.
        const week = this.weekEntity();
        this.grabbedAt = { time: this.elapsed, x: entity.object3D?.position.x ?? 0, reach: 0, outcome: week == null ? -1 : this.outcome(week) };
      }),
      this.queries.held.subscribe('disqualify', (entity) => {
        const start = this.grabbedAt;
        this.grabbedAt = null;
        if (start != null && this.elapsed - start.time < TAP_SECONDS && start.reach < TAP_TRAVEL) this.advance();
      }),
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    const dial = this.dialEntity();
    const knob = dial?.object3D;
    if (week == null || dial == null || knob == null) return;
    // Held still, the sun stops the town's clock; sliding, it runs; let go, it runs as ever.
    // Still means within a few millimetres of where it last really moved, for a moment: a hand's tremor is not a slide.
    const held = dial.hasComponent(Grabbed);
    if (Math.abs(knob.position.x - this.lastX) > STILL_REACH) {
      this.lastX = knob.position.x;
      this.stillFor = 0;
    } else {
      this.stillFor += delta;
    }
    const moving = this.stillFor < STILL_AFTER;
    this.flow += ((held && !moving ? 0 : 1) - this.flow) * Math.min(1, delta * (held && !moving ? 6 : 4));
    setTownTime(this.flow);
    const x0 = dial.getValue(SunDial, 'x0') ?? 0;
    const x1 = dial.getValue(SunDial, 'x1') ?? 0.3;
    const pitch = (x1 - x0) / SUNDAY;
    const phase = week.getValue(Week, 'phase');
    const day = week.getValue(Week, 'day') ?? -1;
    const active = phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday;

    if (dial.hasComponent(Grabbed)) {
      // Until it has really moved, a hold may still be a tap, which decides on release; once it has, it is a slide.
      const hold = this.grabbedAt;
      if (hold != null) hold.reach = Math.max(hold.reach, Math.abs(knob.position.x - hold.x));
      if (!active || hold == null || hold.reach < TAP_TRAVEL) return;
      const raw = (knob.position.x - x0) / pitch;
      let next = Math.max(0, Math.min(SUNDAY, Math.round(raw)));
      const outcome = hold.outcome;
      if (outcome >= 0 && day >= 0 && day <= outcome && next > outcome && raw < outcome + DETENT) next = outcome;
      this.setDay(week, next);
    } else {
      const target = active && day >= 0 ? x0 + day * pitch : x0;
      knob.position.x += (target - knob.position.x) * (1 - Math.exp(-SNAP_RATE * delta));
    }

    const material = (knob as Mesh).material as MeshStandardMaterial | undefined;
    // After the basket lands, the family window comes first: the sun glows once they were visited, or after a while;
    // in the first week only once it is on the sill (line-queue.ts sunShown), so the window and the sun never invite
    // together.
    this.landedFor = phase === Phase.Landed ? this.landedFor + delta : 0;
    const n = week.getValue(Week, 'week') ?? 1;
    const first = n === 1 && phase === Phase.Landed && sunShown(n, phase, week.getValue(Week, 'timer') ?? 0, familyVisited(), this.box?.visible ?? false);
    const hint = phase === Phase.Days || (phase === Phase.Landed && (n === 1 ? first : familyVisited() || this.landedFor > LANDED_WAIT));
    const pulse = hint ? 0.5 + 0.5 * Math.sin(this.elapsed * 3.2) : 0;
    material?.emissive.setRGB(0.32 * pulse, 0.24 * pulse, 0.1 * pulse);
  }

  /** The season starts over from the start page: the sun back at Monday at once, the town's clock running. */
  restart(): void {
    this.grabbedAt = null;
    this.landedFor = 0;
    this.stillFor = 0;
    this.flow = 1;
    setTownTime(1);
    const dial = this.dialEntity();
    const knob = dial?.object3D;
    if (dial == null || knob == null) return;
    knob.position.x = dial.getValue(SunDial, 'x0') ?? 0;
    this.lastX = knob.position.x;
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  private dialEntity(): Entity | null {
    for (const entity of this.queries.dials.entities) return entity;
    return null;
  }

  /** The evening the choice shows in the town, or -1 if it changes nothing this week. */
  private outcome(week: Entity): number {
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const real = realWeek(week.getValue(Week, 'week') ?? 1);
    if (chosen < 0 || real == null || !outcomeShows(real, chosen)) return -1;
    return OUTCOME_DAY[chosen] ?? -1;
  }

  private setDay(week: Entity, day: number): void {
    if (day === (week.getValue(Week, 'day') ?? -1)) return;
    week.setValue(Week, 'day', day);
    week.setValue(Week, 'phase', day >= SUNDAY ? Phase.Sunday : Phase.Days);
    week.setValue(Week, 'timer', 0);
  }

  /** On to the next evening worth seeing: the choice's result if it is still ahead, otherwise Sunday. */
  private advance(): void {
    const week = this.weekEntity();
    if (week == null) return;
    const phase = week.getValue(Week, 'phase');
    if (phase !== Phase.Landed && phase !== Phase.Days) return;
    const day = week.getValue(Week, 'day') ?? -1;
    const outcome = this.outcome(week);
    this.setDay(week, outcome > day ? outcome : day < 0 && outcome < 0 ? 0 : SUNDAY);
  }
}
