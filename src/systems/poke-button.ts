import { createSystem, type Entity, Grabbed, OneHandGrabbable, Pressed } from '@iwsdk/core';
import { PokeButton } from '../components.js';
import { emitSignal, type SignalName } from '../signals.js';

/**
 * Fires a PokeButton's signal: a fingertip poke, a ray pinch, or a mouse
 * click in the browser. A button that cannot be held fires the moment it is
 * touched, so its sound and light answer in the same frame. One that can
 * also be grabbed fires when the press ends instead: reaching in to pinch
 * the latch brushes the knob with the index finger, so a press that turned
 * into a grab is dropped and only the grab's own signal counts (taking hold
 * answers at once with its own tick, SoundSystem).
 */
export class PokeButtonSystem extends createSystem({
  pressed: { required: [PokeButton, Pressed] },
}) {
  /** Entities currently pressed, and whether they were grabbed meanwhile (or already fired on touch). */
  private grabbedDuringPress = new Map<Entity, boolean>();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        if (!entity.hasComponent(OneHandGrabbable)) {
          this.grabbedDuringPress.set(entity, true);
          fire(entity);
          return;
        }
        this.grabbedDuringPress.set(entity, entity.hasComponent(Grabbed));
      }),
      this.queries.pressed.subscribe('disqualify', (entity) => {
        const grabbed = this.grabbedDuringPress.get(entity) ?? true;
        this.grabbedDuringPress.delete(entity);
        if (grabbed || !entity.hasComponent(PokeButton)) return;
        fire(entity);
      }),
    );
  }

  update(): void {
    for (const entity of this.queries.pressed.entities) {
      if (entity.hasComponent(Grabbed)) this.grabbedDuringPress.set(entity, true);
    }
  }
}

function fire(entity: Entity): void {
  emitSignal((entity.getValue(PokeButton, 'signal') ?? '') as SignalName);
}
