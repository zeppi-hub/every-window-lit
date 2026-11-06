import { createSystem, type Mesh, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { EASE, EMPTY, HELP, levels, type RealWeek } from '../season/model.js';
import { currentTown, realWeek } from '../season/store.js';

/**
 * The evening each choice shows its result (0 Monday): easing from Tuesday
 * in the town's own reading of the week (TownSystem), help on Monday as a
 * parcel at Tessa's door. A build shows nothing this week; its scaffolding
 * stands from the next (BuildSystem).
 */
export const OUTCOME_DAY: readonly number[] = [1, 0, -1];

/**
 * Whether the Keeper's choice changes what the town shows this week, so
 * the sun stops on its evening: help always brings the parcel; easing only
 * when it lowers the week's pressure (a calm week or a fall has nothing to
 * ease).
 */
export function outcomeShows(real: RealWeek, chosen: number): boolean {
  // What goes to the boat in a solidarity week brings nothing back to the town.
  if (real.solidarity != null) return false;
  if (chosen === HELP) return true;
  if (chosen !== EASE) return false;
  const town = currentTown();
  return levels(real, town, EASE)[real.kind] !== levels(real, town, EMPTY)[real.kind];
}

/**
 * Shows the parcel on the step of Tessa's building from the evening help
 * arrives until the week ends. Sliding the sun back before that evening
 * takes it away again.
 */
export class OutcomeSystem extends createSystem({
  week: { required: [Week] },
}) {
  private parcel: Object3D | null = null;
  private shown = false;
  private elapsed = 0;

  init(): void {
    this.parcel = this.world.scene.getObjectByName('OutcomeParcel') ?? null;
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null || this.parcel == null) return;
    const phase = week.getValue(Week, 'phase');
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const day = week.getValue(Week, 'day') ?? -1;
    const running = phase === Phase.Days || phase === Phase.Sunday;
    const real = realWeek(week.getValue(Week, 'week') ?? 1);
    const show = running && chosen === HELP && real != null && real.solidarity == null && day >= OUTCOME_DAY[HELP];
    // On the evening it arrives it catches the eye, from the tower.
    this.elapsed += delta;
    if (show) {
      const pulse = day === OUTCOME_DAY[HELP] ? 0.35 + 0.25 * Math.sin(this.elapsed * 2.4) : 0;
      this.parcel.traverse(this.shine(pulse));
    }
    if (show === this.shown) return;
    this.shown = show;
    this.parcel.visible = show;
  }

  private pulse = 0;
  private readonly lit = (object: Object3D): void => {
    const material = (object as Mesh).material as MeshStandardMaterial | undefined;
    material?.emissive?.setRGB(this.pulse, this.pulse * 0.72, this.pulse * 0.32);
  };

  private shine(pulse: number): (object: Object3D) => void {
    this.pulse = pulse;
    return this.lit;
  }
}
