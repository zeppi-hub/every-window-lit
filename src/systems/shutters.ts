import { createSystem } from '@iwsdk/core';
import { ShutterLeaf, Side, Week } from '../components.js';

/** Fully open, a leaf lies almost flat against the facade. */
const OPEN_ANGLE = (165 * Math.PI) / 180;
const SWING_RATE = 2.4;

/**
 * Swings the shutters to match the week's `shuttersOpen`, which the latch
 * toggles (BasketSystem decides, and keeps them open while the basket is
 * on its way or on the sill). The left leaf turns positive about Y and the
 * right one negative, so both swing out over the square, away from the
 * seated player.
 */
export class ShutterSystem extends createSystem({
  leaves: { required: [ShutterLeaf] },
  week: { required: [Week] },
}) {
  update(delta: number): void {
    let shuttersOpen = false;
    for (const week of this.queries.week.entities) shuttersOpen = week.getValue(Week, 'shuttersOpen') ?? false;
    const target = shuttersOpen ? 1 : 0;
    const blend = 1 - Math.exp(-SWING_RATE * delta);
    for (const entity of this.queries.leaves.entities) {
      const object = entity.object3D;
      if (object == null) continue;
      entity.setValue(ShutterLeaf, 'target', target);
      let open = entity.getValue(ShutterLeaf, 'open') ?? 0;
      if (Math.abs(target - open) < 0.0005) continue;
      open += (target - open) * blend;
      if (Math.abs(target - open) < 0.001) open = target;
      entity.setValue(ShutterLeaf, 'open', open);
      const sign = entity.getValue(ShutterLeaf, 'side') === Side.Left ? 1 : -1;
      object.rotation.y = sign * open * OPEN_ANGLE;
    }
  }
}
