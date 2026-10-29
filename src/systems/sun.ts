import { createSystem, type Entity, Grabbed, type Mesh, type MeshStandardMaterial } from '@iwsdk/core';
import { Phase, SunDial, Week } from '../components.js';
import { onSignal } from '../signals.js';

const STOPS = 7;
const SUNDAY = STOPS - 1;
/** How quickly a let-go sun settles on its notch. */
const SNAP_RATE = 12;
/** A hold shorter than this that moved the sun less than TAP_TRAVEL is a tap. */
const TAP_SECONDS = 0.6;
const TAP_TRAVEL = 0.015;
/** Past the evening a choice shows its result, the sun sticks until pulled this much further (in stops). */
const DETENT = 0.75;

/** The evening each choice shows its result (0 Monday): pumps filled Tuesday, the clinic's parcel Monday, tram works Friday. */
export const OUTCOME_DAY: readonly number[] = [1, 0, 4];

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
  private grabbedAt: { time: number; x: number; reach: number } | null = null;
  private elapsed = 0;

  init(): void {
    this.cleanupFuncs.push(
      onSignal('sun', () => this.advance()),
      this.queries.held.subscribe('qualify', (entity) => {
        this.grabbedAt = { time: this.elapsed, x: entity.object3D?.position.x ?? 0, reach: 0 };
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
      const outcome = this.outcome(week);
      if (outcome >= 0 && day >= 0 && day <= outcome && next > outcome && raw < outcome + DETENT) next = outcome;
      this.setDay(week, next);
    } else {
      const target = active && day >= 0 ? x0 + day * pitch : x0;
      knob.position.x += (target - knob.position.x) * (1 - Math.exp(-SNAP_RATE * delta));
    }

    const material = (knob as Mesh).material as MeshStandardMaterial | undefined;
    const hint = phase === Phase.Landed || phase === Phase.Days;
    const pulse = hint ? 0.5 + 0.5 * Math.sin(this.elapsed * 3.2) : 0;
    material?.emissive.setRGB(0.32 * pulse, 0.24 * pulse, 0.1 * pulse);
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  private dialEntity(): Entity | null {
    for (const entity of this.queries.dials.entities) return entity;
    return null;
  }

  private outcome(week: Entity): number {
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    return chosen >= 0 ? (OUTCOME_DAY[chosen] ?? -1) : -1;
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
