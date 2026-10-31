import { createSystem, type Object3D } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { festivalLights } from '../season/model.js';
import { currentTown, SEASON_WEEKS } from '../season/store.js';
import { setFarLitShare } from '../station/far-city.js';
import { litShare, setLitShare } from '../station/materials.js';

let night = false;

/** Whether the season's last night is on (the last Sunday, lamp lit): the sound plays Dario's tune if the town earned it. */
export function festivalOn(): boolean {
  return night;
}

/** The share of windows lit on the last night, from the season's model. */
export function festivalShare(): number {
  return festivalLights(currentTown());
}

/**
 * The season's last night (META_VR_FIKIR.md §10): on the last Sunday,
 * once the lamp is lit, strings of bulbs light over the square and as many
 * of the town's windows light up as the season earned (the family helped
 * through hard weeks, builds working, coins kept). Closing the shutters
 * keeps the season; the next morning starts it again.
 */
export class FestivalSystem extends createSystem({
  week: { required: [Week] },
}) {
  private festival: Object3D | null = null;
  /** The town's own share of lit windows before the night, given back after it. */
  private before = 0.8;

  init(): void {
    this.festival = this.world.scene.getObjectByName('Festival') ?? null;
  }

  update(): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const on =
      (week.getValue(Week, 'week') ?? 1) === SEASON_WEEKS && week.getValue(Week, 'phase') === Phase.Sunday && (week.getValue(Week, 'lamp') ?? false);
    if (on === night) return;
    night = on;
    if (this.festival != null) this.festival.visible = on;
    // Never fewer windows than the week had: the night only adds light.
    if (on) this.before = litShare.value;
    const share = on ? Math.max(this.before, festivalShare()) : this.before;
    setLitShare(share);
    setFarLitShare(share);
  }
}
