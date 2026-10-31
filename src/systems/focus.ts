import { createSystem, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { BUILD, EASE, HELP, type Kind } from '../season/model.js';
import { realWeek, solidarityOf } from '../season/store.js';
import { FOCUS, type FocusPlace } from '../station/focus.js';
import { PLAZA_Y } from '../station/layout.js';
import { KERB } from '../station/streetscape.js';

/** How strong the glow gets, when it starts after the shutters open, and how fast it comes and goes. */
const PEAK = 0.6;
const AFTER = 1.5;
const RATE = 1.2;
/** Where a choice acts, when it acts on the ground: Tessa's door across the square, and the tram line along it. */
const TESSA_DOOR: FocusPlace = { x: -2.6, y: PLAZA_Y + KERB + 0.02, z: -25.6, w: 3.2, d: 2.4 };
const TRAM_LINE: FocusPlace = { x: -11, y: PLAZA_Y + 0.02, z: -21, w: 18, d: 2.6 };

/** The place in town a choice in the basket would act on; none for what happens on the roofs or in the evening windows. */
function choicePlace(kind: Kind, chosen: number): FocusPlace | undefined {
  if (chosen === EASE) return FOCUS[kind];
  if (chosen === HELP) return TESSA_DOOR;
  if (chosen === BUILD && kind === 'fuel') return TRAM_LINE;
  return undefined;
}

/**
 * The town's soft "look there". While the week's morning lasts, the place
 * its prices show first glows, and goes as the bell rings (not in a week
 * that changed little, nor in a solidarity week). While a choice sits in
 * the basket, the place it would act on glows instead: the kerb or the
 * stalls for easing, Tessa's door for help, the tram line for building it.
 */
export class FocusSystem extends createSystem({
  week: { required: [Week] },
}) {
  private glow: Mesh | null = null;
  private amount = 0;
  private elapsed = 0;
  private shown: FocusPlace | null = null;

  init(): void {
    this.glow = (this.world.scene.getObjectByName('FocusGlow') as Mesh | undefined) ?? null;
  }

  update(delta: number): void {
    const glow = this.glow;
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (glow == null || week == null) return;
    this.elapsed += delta;
    const n = week.getValue(Week, 'week') ?? 1;
    const real = realWeek(n);
    const phase = week.getValue(Week, 'phase');
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    let place: FocusPlace | undefined;
    if (real != null && solidarityOf(n) == null && open) {
      if (phase === Phase.Morning && real.tier !== 0 && (week.getValue(Week, 'timer') ?? 0) > AFTER) place = FOCUS[real.kind];
      if (phase === Phase.Choosing && chosen >= 0) place = choicePlace(real.kind, chosen);
    }
    // Moved only while unseen, so it never slides across the square.
    if (place != null && place !== this.shown && this.amount < 0.01) {
      this.shown = place;
      glow.position.set(place.x, place.y, place.z);
      glow.scale.set(place.w, 1, place.d);
    }
    const target = place != null && place === this.shown ? 1 : 0;
    this.amount += (target - this.amount) * Math.min(1, delta * RATE * (target > this.amount ? 1 : 2.5));
    if (Math.abs(target - this.amount) < 0.003) this.amount = target;
    glow.visible = this.amount > 0;
    if (glow.visible) (glow.material as MeshBasicMaterial).opacity = PEAK * this.amount * (0.7 + 0.3 * Math.sin(this.elapsed * 2.4));
  }
}
