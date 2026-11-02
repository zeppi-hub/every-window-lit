import { createSystem } from '@iwsdk/core';
import { onSignal } from '../signals.js';

const HANDS = ['left', 'right'] as const;

/**
 * A controller's trigger is its pinch (KeeperHandsSystem makes it glow when
 * the ghost hand shows one): pressed near something that can be held (the
 * latch, the rope, the brake, the sun, the match, the family's box), it
 * takes hold of it, as a hand's pinch does. GrabSystem routes a hand's pinch
 * to its grab pointer; IWSDK leaves a controller's trigger to the ray, and
 * near a touch target (15 cm) the touch pointer wins over the grab pointer,
 * so the grip was swallowed too. This routes the trigger to the grab pointer
 * whenever that pointer has something to hold; far away the ray still takes
 * the trigger as before, and a touch on a holdable thing that turns into a
 * hold still counts once (PokeButtonSystem drops the press). Hands are left
 * to GrabSystem.
 */
export class ControllerPinchSystem extends createSystem({}) {
  /** Whether each controller's trigger is holding through its grab pointer, so its release is routed too. */
  private routed = { left: false, right: false };

  init(): void {
    this.cleanupFuncs.push(onSignal('restart', () => this.restart()));
  }

  /** The season starts over from the start page: a trigger still holding lets go (the systems drop what was held). */
  restart(): void {
    const timeStamp = performance.now();
    for (const side of HANDS) {
      if (!this.routed[side]) continue;
      this.routed[side] = false;
      this.input.xr.multiPointers[side].routeUp('squeeze', 'grab', { timeStamp });
    }
  }

  update(_delta: number, time: number): void {
    const xr = this.input.xr;
    for (const side of HANDS) {
      const pointers = xr.multiPointers[side];
      const timeStamp = time * 1000;
      if (!xr.isPrimary('controller', side)) {
        // The controller was put down (or the hands took over) mid-hold: let go.
        if (this.routed[side]) {
          this.routed[side] = false;
          pointers.routeUp('squeeze', 'grab', { timeStamp });
        }
        continue;
      }
      const select = xr.getSelectState(side);
      if (select.start && !this.routed[side]) {
        const near = pointers.getPointer('grab').getIntersection();
        if (near != null && !near.object.isVoidObject) {
          this.routed[side] = true;
          pointers.routeDown('squeeze', 'grab', { timeStamp });
          if (import.meta.env.DEV) console.info(`[pinch] ${side} trigger takes hold of ${near.object.name || 'something'} at ${(performance.now() / 1000).toFixed(2)} s`);
        }
      }
      if (select.end && this.routed[side]) {
        this.routed[side] = false;
        pointers.routeUp('squeeze', 'grab', { timeStamp });
        if (import.meta.env.DEV) console.info(`[pinch] ${side} trigger lets go at ${(performance.now() / 1000).toFixed(2)} s`);
      }
    }
  }
}
