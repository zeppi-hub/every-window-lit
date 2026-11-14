import { Box3, createSystem, type Entity, GrabSystem, Grabbed, type Mesh, type MeshStandardMaterial, OneHandGrabbable, Pressed, Vector3 } from '@iwsdk/core';
import { Globe, PokeButton } from '../components.js';
import { globeAt } from '../globe.js';
import { emitSignal, onSignal, type SignalName } from '../signals.js';
import { atGlass, pinchBrush, TapGate } from '../tap-gate.js';

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];
/** A fingertip this near a waiting button's box is the one pressing it (a touch presses at 2 cm); none near: a ray's pinch or a click. */
const PRESSING_TIP = 0.06;

/**
 * Fires a PokeButton's signal: a fingertip poke, a ray pinch, or a mouse
 * click in the browser. A button that cannot be held fires the moment it is
 * touched, so its sound and light answer in the same frame. One that can
 * also be grabbed fires when the press ends instead: reaching in to pinch
 * the latch brushes the knob with the index finger, so a press that turned
 * into a grab is dropped and only the grab's own signal counts (taking hold
 * answers at once with its own tick, SoundSystem). One that `waits` (the
 * tower key, the brake lever and its knob: what cannot be taken back) fires
 * a moment after the press ends, unless a grab or another press starts
 * first: the hand was only passing. It still answers the touch
 * at once: it ticks (SoundSystem) and buzzes in a controller
 * (HapticsSystem) as it is pressed and let go, and glows warm from the
 * touch until the tap counts or is dropped, so a short tap's glow is seen
 * once the finger lifts. A touch held over a second does not count
 * (tap-gate.ts), nor one whose pointer is lost (the hand no longer
 * tracked, or the headset session ending).
 *
 * The key lies under the glass's spot on the sill in week 3, so a waiting
 * button also listens to the hand that touches it: a hand that holds
 * something, or let go of it within a second, was taking or setting
 * something down, and its touch is a brush (pinchBrush; a pinch that closes
 * on the key itself holds nothing, so it presses the key); and while the
 * glass waits on the sill or is held, the
 * key ignores the fingertip of a hand that is at the glass (atGlass), so it
 * neither glows nor ticks under a hand taking it. The other hand keeps it.
 */
export class PokeButtonSystem extends createSystem({
  pressed: { required: [PokeButton, Pressed] },
  grabbed: { required: [Grabbed] },
  buttons: { required: [PokeButton] },
  globe: { required: [Globe] },
}) {
  /** Entities currently pressed, and whether they were grabbed meanwhile (or already fired on touch). */
  private grabbedDuringPress = new Map<Entity, boolean>();
  /** The waiting buttons' taps, and the hand whose fingertip pressed each (null: a ray's pinch or a click). */
  private gates = new Map<Entity, TapGate>();
  private gateSide = new Map<Entity, Side | null>();
  /** Each hand: holding something now (GrabSystem's holder), seconds since it last let go of a hold, and whether its fingertip is at the glass. */
  private holding: Record<Side, boolean> = { left: false, right: false };
  private sinceHold: Record<Side, number> = { left: Infinity, right: Infinity };
  private atGlass: Record<Side, boolean> = { left: false, right: false };
  /** The touch pointers of the hands at the glass: a waiting button's pointer filter ignores them. */
  private shaded = new Set<number>();
  private filtered = new WeakSet<Entity>();
  private glassMiddle: Vector3 | null = null;
  private readonly glassAt = new Vector3();
  private readonly tip = new Vector3();
  private readonly box = new Box3();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        // A press elsewhere: a brush on a waiting button was on the way here.
        for (const [other, gate] of this.gates) if (other !== entity) this.drop(other, gate, 'a press elsewhere');
        if (entity.getValue(PokeButton, 'waits')) {
          const side = this.pressingHand(entity);
          if (side != null && pinchBrush(this.holding[side], this.sinceHold[side])) {
            const gate = this.gates.get(entity);
            if (gate != null) this.drop(entity, gate, `the ${side} hand holding something`);
            if (import.meta.env.DEV) console.info(`[poke] ${entity.object3D?.name} brushed by the ${side} hand while it holds something or just let go: not a tap`);
            return;
          }
          this.gate(entity).press();
          this.gateSide.set(entity, side);
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
    this.filterWaiting();
    this.followHands(delta);
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

  /**
   * A waiting button ignores the fingertip of a hand at the glass (the shaded touch pointers); a ray, a pinch and the
   * other hand still reach it. Set once. One that can also be held (the brake's knob) keeps its grab's own pointer
   * rules (GrabSystem writes them) and its fingertip hold: the pinch that pulls it starts as the fingertip's touch,
   * so a knob that a fingertip could only press would never move (seen in the emulator, 14 Nov).
   */
  private filterWaiting(): void {
    for (const entity of this.queries.buttons.entities) {
      if (this.filtered.has(entity) || !entity.getValue(PokeButton, 'waits')) continue;
      if (entity.hasComponent(OneHandGrabbable)) continue;
      const object = entity.object3D;
      if (object == null) continue;
      object.pointerEventsType = (id: number, type: string) => type !== 'touch' || !this.shaded.has(id);
      this.filtered.add(entity);
    }
  }

  /**
   * What each hand holds and where its fingertip is: a hand at the glass
   * (waiting on the sill, or held) is shaded, and its waiting tap is dropped.
   * A hand no longer tracked is not shaded. A grab starting anywhere drops
   * every waiting tap already (the grabbed query).
   */
  private followHands(delta: number): void {
    const xr = this.input.xr;
    const where = globeAt();
    let glass: Mesh | null = null;
    if (where === 'sill' || where === 'held') for (const entity of this.queries.globe.entities) glass = (entity.object3D as Mesh | undefined) ?? null;
    if (glass != null) {
      if (this.glassMiddle == null) {
        const geometry = glass.geometry;
        if (geometry.boundingBox == null) geometry.computeBoundingBox();
        this.glassMiddle = geometry.boundingBox!.getCenter(new Vector3());
      }
      glass.localToWorld(this.glassAt.copy(this.glassMiddle));
    }
    this.shaded.clear();
    const grab = this.world.getSystem(GrabSystem);
    const held: Record<Side, boolean> = { left: false, right: false };
    for (const entity of this.queries.grabbed.entities) {
      const hand = grab?.getHolderHand(entity);
      if (hand === 'left' || hand === 'right') held[hand] = true;
    }
    for (const side of SIDES) {
      this.holding[side] = held[side];
      this.sinceHold[side] = held[side] ? 0 : this.sinceHold[side] + delta;
      const touch = xr.multiPointers[side]?.getPointer('touch');
      if (glass == null || touch == null || !touch.getEnabled()) {
        this.atGlass[side] = false;
        continue;
      }
      this.player.indexTipSpaces[side].getWorldPosition(this.tip);
      const was = this.atGlass[side];
      this.atGlass[side] = atGlass(was, this.tip.distanceTo(this.glassAt));
      if (!this.atGlass[side]) continue;
      this.shaded.add(touch.id);
      if (!was) this.dropSide(side, `the ${side} hand at the glass`);
    }
  }

  /** Drops the waiting taps that hand's fingertip made. */
  private dropSide(side: Side, why: string): void {
    for (const [entity, gate] of this.gates) if (this.gateSide.get(entity) === side) this.drop(entity, gate, why);
  }

  /** The hand whose fingertip is on this button now (the nearer, within PRESSING_TIP of its box); null for a ray's pinch or a click. */
  private pressingHand(entity: Entity): Side | null {
    const object = entity.object3D;
    if (object == null) return null;
    this.box.setFromObject(object);
    let best: Side | null = null;
    let near = PRESSING_TIP;
    for (const side of SIDES) {
      const touch = this.input.xr.multiPointers[side]?.getPointer('touch');
      if (touch == null || !touch.getEnabled()) continue;
      this.player.indexTipSpaces[side].getWorldPosition(this.tip);
      const d = this.box.distanceToPoint(this.tip);
      if (d <= near) {
        near = d;
        best = side;
      }
    }
    return best;
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
