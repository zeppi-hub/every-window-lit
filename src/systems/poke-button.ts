import { createSystem, type Entity, Grabbed, Pressed } from '@iwsdk/core';
import { PokeButton } from '../components.js';
import { emitSignal, type SignalName } from '../signals.js';

/**
 * Fires a PokeButton's signal when a press ends: a fingertip poke, a ray
 * pinch, or a mouse click in the browser. Firing on release lets the same
 * control also be grabbable: reaching in to pinch the latch brushes the knob
 * with the index finger, so a press that turned into a grab is dropped and
 * only the grab's own signal counts.
 */
export class PokeButtonSystem extends createSystem({
  pressed: { required: [PokeButton, Pressed] },
}) {
  /** Entities currently pressed, and whether they were grabbed meanwhile. */
  private grabbedDuringPress = new Map<Entity, boolean>();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        this.grabbedDuringPress.set(entity, entity.hasComponent(Grabbed));
      }),
      this.queries.pressed.subscribe('disqualify', (entity) => {
        const grabbed = this.grabbedDuringPress.get(entity) ?? true;
        this.grabbedDuringPress.delete(entity);
        if (grabbed || !entity.hasComponent(PokeButton)) return;
        emitSignal((entity.getValue(PokeButton, 'signal') ?? '') as SignalName);
      }),
    );
  }

  update(): void {
    for (const entity of this.queries.pressed.entities) {
      if (entity.hasComponent(Grabbed)) this.grabbedDuringPress.set(entity, true);
    }
  }
}
