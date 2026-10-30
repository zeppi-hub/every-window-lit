import { createSystem, type Object3D } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import type { Kind } from '../season/model.js';
import { realWeek } from '../season/store.js';
import { CAR_SOLIDS, WORKS_SOLID } from '../station/outcomes.js';
import { type Box, SOLID } from '../station/town.js';

/**
 * For each choice: what it brings, in which kinds of week, and the boxes
 * the Keeper cannot walk through while it is there. The cars and the tram
 * works belong to fuel weeks; help reaching Tessa's door fits any week.
 */
const OUTCOMES: ReadonlyArray<{ name: string; kinds: readonly Kind[]; solids: readonly Box[] }> = [
  { name: 'OutcomeCars', kinds: ['fuel'], solids: CAR_SOLIDS },
  { name: 'OutcomeParcel', kinds: ['fuel', 'power', 'food'], solids: [] },
  { name: 'OutcomeWorks', kinds: ['fuel'], solids: [WORKS_SOLID] },
];

/** The evening each choice shows its result (0 Monday): pumps filled Tuesday, the clinic's parcel Monday, tram works Friday. */
export const OUTCOME_DAY: readonly number[] = [1, 0, 4];

/** Whether a choice shows something in the town in this kind of week. */
export function outcomeFits(kind: Kind, chosen: number): boolean {
  return OUTCOMES[chosen]?.kinds.includes(kind) ?? false;
}

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
    const kind = realWeek(week.getValue(Week, 'week') ?? 1)?.kind;
    for (let index = 0; index < OUTCOMES.length; index += 1) {
      const fits = kind != null && outcomeFits(kind, index);
      const show = running && fits && chosen === index && day >= (OUTCOME_DAY[index] ?? 7);
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
