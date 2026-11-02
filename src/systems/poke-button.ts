import { createSystem, type Entity, Grabbed, OneHandGrabbable, Pressed } from '@iwsdk/core';
import { PokeButton } from '../components.js';
import { emitSignal, onSignal, type SignalName } from '../signals.js';
import { TapGate } from '../tap-gate.js';

/**
 * Fires a PokeButton's signal: a fingertip poke, a ray pinch, or a mouse
 * click in the browser. A button that cannot be held fires the moment it is
 * touched, so its sound and light answer in the same frame. One that can
 * also be grabbed fires when the press ends instead: reaching in to pinch
 * the latch brushes the knob with the index finger, so a press that turned
 * into a grab is dropped and only the grab's own signal counts (taking hold
 * answers at once with its own tick, SoundSystem). One that `waits` (the
 * tower key, the door ring) fires a moment after the press ends, unless a
 * grab or another press starts first: the hand was only passing.
 */
export class PokeButtonSystem extends createSystem({
  pressed: { required: [PokeButton, Pressed] },
  grabbed: { required: [Grabbed] },
}) {
  /** Entities currently pressed, and whether they were grabbed meanwhile (or already fired on touch). */
  private grabbedDuringPress = new Map<Entity, boolean>();
  /** The waiting buttons' taps. */
  private gates = new Map<Entity, TapGate>();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        // A press elsewhere: a brush on a waiting button was on the way here.
        for (const [other, gate] of this.gates) if (other !== entity) this.drop(other, gate, 'a press elsewhere');
        if (entity.getValue(PokeButton, 'waits')) {
          this.gate(entity).press();
          return;
        }
        if (!entity.hasComponent(OneHandGrabbable)) {
          this.grabbedDuringPress.set(entity, true);
          fire(entity);
          return;
        }
        this.grabbedDuringPress.set(entity, entity.hasComponent(Grabbed));
      }),
      this.queries.pressed.subscribe('disqualify', (entity) => {
        const gate = this.gates.get(entity);
        if (gate != null) {
          gate.release();
          if (import.meta.env.DEV) console.info(`[poke] ${entity.object3D?.name} let go, waits before it counts`);
          return;
        }
        const grabbed = this.grabbedDuringPress.get(entity) ?? true;
        this.grabbedDuringPress.delete(entity);
        if (grabbed || !entity.hasComponent(PokeButton)) return;
        fire(entity);
      }),
      // A grab anywhere (the match, the latch, the card): the hand was reaching for it.
      this.queries.grabbed.subscribe('qualify', () => {
        for (const [entity, gate] of this.gates) this.drop(entity, gate, 'a grab');
      }),
      onSignal('restart', () => this.restart()),
    );
  }

  /** The season starts over from the start page: no tap from the old week still waiting to count (the tower key, the door ring). */
  restart(): void {
    for (const gate of this.gates.values()) gate.cancel();
    this.grabbedDuringPress.clear();
  }

  update(delta: number): void {
    for (const entity of this.queries.pressed.entities) {
      if (entity.hasComponent(Grabbed)) this.grabbedDuringPress.set(entity, true);
    }
    for (const [entity, gate] of this.gates) {
      if (!gate.step(delta)) continue;
      if (import.meta.env.DEV) console.info(`[poke] ${entity.object3D?.name} counts: ${entity.getValue(PokeButton, 'signal')}`);
      fire(entity);
    }
  }

  private drop(entity: Entity, gate: TapGate, why: string): void {
    if (import.meta.env.DEV && gate.busy()) console.info(`[poke] ${entity.object3D?.name} was a brush, dropped for ${why}`);
    gate.cancel();
  }

  private gate(entity: Entity): TapGate {
    let gate = this.gates.get(entity);
    if (gate == null) {
      gate = new TapGate();
      this.gates.set(entity, gate);
    }
    return gate;
  }
}

function fire(entity: Entity): void {
  emitSignal((entity.getValue(PokeButton, 'signal') ?? '') as SignalName);
}
