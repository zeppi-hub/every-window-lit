import { createSystem, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { realWeek, solidarityOf } from '../season/store.js';
import { FOCUS } from '../station/focus.js';

/** How strong the glow gets, when it starts after the shutters open, and how fast it comes and goes. */
const PEAK = 0.6;
const AFTER = 1.5;
const RATE = 1.2;

/**
 * The morning's "look there": while the week's morning lasts, the place its
 * prices show first glows softly, and goes as the bell rings. Not in a week
 * that changed little, nor in a solidarity week.
 */
export class FocusSystem extends createSystem({
  week: { required: [Week] },
}) {
  private glow: Mesh | null = null;
  private amount = 0;
  private elapsed = 0;
  private shownWeek = -1;

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
    const place = real != null && real.tier !== 0 && solidarityOf(n) == null ? FOCUS[real.kind] : undefined;
    if (place != null && n !== this.shownWeek) {
      this.shownWeek = n;
      glow.position.set(place.x, place.y, place.z);
      glow.scale.set(place.w, 1, place.d);
    }
    const on =
      place != null && week.getValue(Week, 'phase') === Phase.Morning && (week.getValue(Week, 'shuttersOpen') ?? false) && (week.getValue(Week, 'timer') ?? 0) > AFTER;
    const target = on ? 1 : 0;
    this.amount += (target - this.amount) * Math.min(1, delta * RATE);
    if (Math.abs(target - this.amount) < 0.003) this.amount = target;
    glow.visible = this.amount > 0;
    if (glow.visible) (glow.material as MeshBasicMaterial).opacity = PEAK * this.amount * (0.7 + 0.3 * Math.sin(this.elapsed * 2.4));
  }
}
