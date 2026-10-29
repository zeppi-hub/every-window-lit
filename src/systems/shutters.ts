import { createSystem } from '@iwsdk/core';
import { ShutterLeaf, Side } from '../components.js';
import { onSignal } from '../signals.js';

/** Fully open, a leaf lies almost flat against the facade. */
const OPEN_ANGLE = (165 * Math.PI) / 180;
const SWING_RATE = 2.4;

/**
 * Swings the shutters open or closed each time the latch fires. The left
 * leaf turns positive about Y and the right one negative, so both swing out
 * over the square, away from the seated player.
 */
export class ShutterSystem extends createSystem({
  leaves: { required: [ShutterLeaf] },
}) {
  init(): void {
    this.cleanupFuncs.push(
      onSignal('latch', () => {
        for (const entity of this.queries.leaves.entities) {
          const target = entity.getValue(ShutterLeaf, 'target') ?? 0;
          entity.setValue(ShutterLeaf, 'target', target > 0.5 ? 0 : 1);
        }
      }),
    );
  }

  update(delta: number): void {
    const blend = 1 - Math.exp(-SWING_RATE * delta);
    for (const entity of this.queries.leaves.entities) {
      const object = entity.object3D;
      if (object == null) continue;
      const target = entity.getValue(ShutterLeaf, 'target') ?? 0;
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
