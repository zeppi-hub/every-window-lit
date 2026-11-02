import { createSystem, type Entity, Grabbed, type Mesh, type MeshStandardMaterial, OneHandGrabbable, Pressed } from '@iwsdk/core';
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
 * tower key) fires a moment after the press ends, unless a grab or another
 * press starts first: the hand was only passing. It still answers the touch
 * at once: it ticks (SoundSystem) and buzzes in a controller
 * (HapticsSystem) as it is pressed and let go, and glows warm from the
 * touch until the tap counts or is dropped, so a short tap's glow is seen
 * once the finger lifts. A touch held over a second does not count
 * (tap-gate.ts), nor one whose pointer is lost (the hand no longer
 * tracked, or the headset session ending).
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
          glow(entity, 1);
          if (import.meta.env.DEV) console.info(`[poke] ${entity.object3D?.name} pressed at ${performance.now().toFixed(1)} ms`);
          return;
        }
        if (!entity.hasComponent(OneHandGrabbable)) {
          this.grabbedDuringPress.set(entity, true);
          if (import.meta.env.DEV) console.info(`[poke] ${entity.object3D?.name} fires ${entity.getValue(PokeButton, 'signal')} at the touch, ${performance.now().toFixed(1)} ms`);
          fire(entity);
          return;
        }
        this.grabbedDuringPress.set(entity, entity.hasComponent(Grabbed));
      }),
      this.queries.pressed.subscribe('disqualify', (entity) => {
        const gate = this.gates.get(entity);
        if (gate != null) {
          const counts = gate.release();
          if (import.meta.env.DEV) {
            const held = `${gate.heldFor().toFixed(2)} s`;
            console.info(`[poke] ${entity.object3D?.name} let go after ${held}, ${counts ? 'waits before it counts' : 'does not count (held too long, or the touch was lost)'}`);
          }
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
    // Leaving the headset with a finger on the key: no tap from it.
    const ended = () => {
      for (const [entity, gate] of this.gates) this.drop(entity, gate, 'the session ending');
    };
    this.renderer.xr.addEventListener('sessionend', ended);
    this.cleanupFuncs.push(() => this.renderer.xr.removeEventListener('sessionend', ended));
  }

  /** The season starts over from the start page: no tap from the old week still waiting to count (the tower key); its glow goes with it (update). */
  restart(): void {
    for (const gate of this.gates.values()) gate.cancel();
    this.grabbedDuringPress.clear();
  }

  update(delta: number): void {
    for (const entity of this.queries.pressed.entities) {
      if (entity.hasComponent(Grabbed)) this.grabbedDuringPress.set(entity, true);
    }
    for (const [entity, gate] of this.gates) {
      const counts = gate.step(delta);
      // The glow follows the gate itself: on from the touch until the tap counts or is dropped (a grab, a press
      // elsewhere, a lost pointer, the session ending, a restart), so nothing else has to put it out.
      glow(entity, gate.busy() ? 1 : 0);
      if (!counts) continue;
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
      const made = new TapGate();
      this.gates.set(entity, made);
      // The hand holding it was lost (no longer tracked): the touch never ended, so it is no tap.
      const object = entity.object3D;
      if (object != null) {
        const lost = () => this.drop(entity, made, 'a lost pointer');
        object.addEventListener('pointercancel', lost);
        this.cleanupFuncs.push(() => object.removeEventListener('pointercancel', lost));
      }
      gate = made;
    }
    return gate;
  }
}

function fire(entity: Entity): void {
  emitSignal((entity.getValue(PokeButton, 'signal') ?? '') as SignalName);
}

/** A waiting button glows warm while its tap is pending (its own material), like whatever is next to touch. */
function glow(entity: Entity, amount: number): void {
  const material = (entity.object3D as Mesh | undefined)?.material as MeshStandardMaterial | undefined;
  material?.emissive?.setRGB(0.32 * amount, 0.24 * amount, 0.1 * amount);
}
