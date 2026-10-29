import { createSystem, type Object3D } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { CAR_SOLIDS, WORKS_SOLID } from '../station/outcomes.js';
import { type Box, SOLID } from '../station/town.js';
import { OUTCOME_DAY } from './sun.js';

/** For each choice: what it brings, and the boxes the Keeper cannot walk through while it is there. */
const OUTCOMES: ReadonlyArray<{ name: string; solids: readonly Box[] }> = [
  { name: 'OutcomeCars', solids: CAR_SOLIDS },
  { name: 'OutcomeParcel', solids: [] },
  { name: 'OutcomeWorks', solids: [WORKS_SOLID] },
];

/**
 * Shows in the town what the Keeper's choice brought, from the evening it
 * arrives until the week ends, and keeps the walk out of it meanwhile.
 * Sliding the sun back before that evening takes it away again.
 */
export class OutcomeSystem extends createSystem({
  week: { required: [Week] },
}) {
  private objects: Array<Object3D | null> = [];
  private shown: boolean[] = OUTCOMES.map(() => false);

  init(): void {
    this.objects = OUTCOMES.map(({ name }) => this.world.scene.getObjectByName(name) ?? null);
  }

  update(): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const phase = week.getValue(Week, 'phase');
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const day = week.getValue(Week, 'day') ?? -1;
    const running = phase === Phase.Days || phase === Phase.Sunday;
    for (let index = 0; index < OUTCOMES.length; index += 1) {
      const show = running && chosen === index && day >= (OUTCOME_DAY[index] ?? 7);
      if (show === this.shown[index]) continue;
      this.shown[index] = show;
      const object = this.objects[index];
      if (object != null) object.visible = show;
      for (const solid of OUTCOMES[index].solids) {
        const at = SOLID.indexOf(solid);
        if (show && at < 0) SOLID.push(solid);
        if (!show && at >= 0) SOLID.splice(at, 1);
      }
    }
  }
}
