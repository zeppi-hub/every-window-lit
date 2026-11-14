import { Box3, createSystem, type Entity, GrabSystem, Grabbed, Vector3 } from '@iwsdk/core';
import { Axis, PullHandle } from '../components.js';
import { emitSignal, onSignal, type SignalName } from '../signals.js';
import { HAND_AWAY_REACH, HANDLE_TAP_TRAVEL, type HandleHold, handLeft, handleTap, realHold, TAP_DELAY } from '../tap-gate.js';

const SIDES = ['left', 'right'] as const;

const AXIS_INDEX: Record<string, number> = { [Axis.X]: 0, [Axis.Y]: 1, [Axis.Z]: 2 };
/** Spring-back rate after release; higher is snappier. */
const RETURN_RATE = 14;

/**
 * Shared primitive for every "slide it until it clicks" control. While the
 * handle is held, GrabSystem moves it inside its translate limits; this
 * system watches the displacement along the handle's axis, fires the signal
 * once at the threshold, and springs the handle back on release.
 *
 * A fingertip poke on a grabbable object also starts a short grab, so a
 * quick hold that barely moves the handle is treated as a tap and fires the
 * same signal. That is the hands-only fallback for anyone who cannot slide.
 * A touch that starts just after a real hold of the same handle ended is
 * the hand letting go and is no tap (tap-gate.ts handleTap): the rope's
 * handle springs back up past the opening fingers, and that brush used to
 * count one more haul (or, after the third, a dull "not now"). After a try
 * that never reached its click that moment is short, so a Keeper who could
 * not slide it can tap it at once.
 *
 * A hold begun with a hand at the handle ends once the hand has left it
 * (tap-gate.ts handLeft): a fingertip's touch could stay captured after the
 * finger had gone, and the handle stayed held until the next touch, which
 * then counted as nothing. The time the hand was away is left out of the
 * hold, so that touch still counts as the tap it was.
 */
export class PullHandleSystem extends createSystem({
  handles: { required: [PullHandle] },
  held: { required: [PullHandle, Grabbed] },
}) {
  private elapsed = 0;
  /** When the last real hold of each handle ended (this.elapsed), whether it reached its click, and how long before each hold now on it that was. */
  private holdEnded = new Map<Entity, number>();
  private holdFired = new Map<Entity, boolean>();
  private sinceHold = new Map<Entity, number>();
  /** Each hold now: whether a hand was at the handle when it began, and how long no hand has been near it. */
  private nearAtStart = new Map<Entity, boolean>();
  private awayFor = new Map<Entity, number>();
  private readonly box = new Box3();
  private readonly point = new Vector3();
  /** Reused for each hold as it ends. */
  private hold: HandleHold = { fired: false, heldFor: 0, maxPull: 0, sinceHold: Number.POSITIVE_INFINITY, lastFired: false, tapTravel: HANDLE_TAP_TRAVEL };

  init(): void {
    // qualify only fires for handles created after registration, so capture
    // the rest point of the ones that already exist as well.
    for (const entity of this.queries.handles.entities) captureRest(entity);
    this.cleanupFuncs.push(
      this.queries.handles.subscribe('qualify', captureRest),
      this.queries.held.subscribe('qualify', (entity) => {
        this.nearAtStart.set(entity, this.handNear(entity) <= HAND_AWAY_REACH);
        this.awayFor.set(entity, 0);
        entity.setValue(PullHandle, 'tapTimer', 0);
        entity.setValue(PullHandle, 'returning', false);
        entity.setValue(PullHandle, 'heldFor', 0);
        entity.setValue(PullHandle, 'maxPull', 0);
        const ended = this.holdEnded.get(entity);
        this.sinceHold.set(entity, ended == null ? Number.POSITIVE_INFINITY : this.elapsed - ended);
      }),
      this.queries.held.subscribe('disqualify', (entity) => {
        if (!entity.hasComponent(PullHandle)) return;
        entity.setValue(PullHandle, 'returning', true);
        // A tap waits TAP_DELAY before firing. Reaching in to pinch brushes the knob first, which looks like a tap; if
        // a real grab starts inside this window the tap is dropped and only the pull counts. Letting go brushes it too.
        const h = this.hold;
        h.fired = entity.getValue(PullHandle, 'fired') ?? false;
        h.heldFor = entity.getValue(PullHandle, 'heldFor') ?? 1;
        h.maxPull = entity.getValue(PullHandle, 'maxPull') ?? 1;
        h.sinceHold = this.sinceHold.get(entity) ?? Number.POSITIVE_INFINITY;
        h.lastFired = this.holdFired.get(entity) ?? false;
        h.tapTravel = entity.getValue(PullHandle, 'tapTravel') ?? HANDLE_TAP_TRAVEL;
        if (handleTap(h)) entity.setValue(PullHandle, 'tapTimer', TAP_DELAY);
        else if (realHold(h)) {
          this.holdEnded.set(entity, this.elapsed);
          this.holdFired.set(entity, h.fired);
          if (import.meta.env.DEV && !h.fired) console.info(`[handle] ${entity.object3D?.name} let go ${(100 * h.maxPull).toFixed(1)} cm along after ${h.heldFor.toFixed(2)} s, short of its click`);
        } else if (import.meta.env.DEV) console.info(`[handle] ${entity.object3D?.name} brushed ${h.sinceHold.toFixed(2)} s after it was let go: no tap`);
      }),
      onSignal('restart', () => this.restart()),
    );
  }

  /**
   * Ends a hold whose hand has left the handle (only in the headset: a mouse
   * in the browser has no hand to be near). The time it was away comes off
   * the hold first, so the release reads as the touch it was. True if it
   * ended now.
   */
  private letGoIfLeft(entity: Entity, delta: number): boolean {
    if (!this.renderer.xr.isPresenting || !(this.nearAtStart.get(entity) ?? false)) return false;
    const away = this.handNear(entity) > HAND_AWAY_REACH ? (this.awayFor.get(entity) ?? 0) + delta : 0;
    this.awayFor.set(entity, away);
    if (!handLeft(true, away)) return false;
    entity.setValue(PullHandle, 'heldFor', Math.max(0, (entity.getValue(PullHandle, 'heldFor') ?? 0) - away));
    this.nearAtStart.set(entity, false);
    if (import.meta.env.DEV) console.info(`[handle] ${entity.object3D?.name}: no hand near it for ${away.toFixed(2)} s, its hold ends`);
    this.world.getSystem(GrabSystem)?.forceRelease(entity);
    return true;
  }

  /** How near the nearest tracked fingertip or grip is to this handle's box (m); Infinity with none tracked. */
  private handNear(entity: Entity): number {
    const object = entity.object3D;
    if (object == null) return Number.POSITIVE_INFINITY;
    this.box.setFromObject(object);
    let near = Number.POSITIVE_INFINITY;
    for (const side of SIDES) {
      const pointers = this.input.xr.multiPointers[side];
      const tracked = (pointers?.getPointer('touch')?.getEnabled() ?? false) || (pointers?.getPointer('grab')?.getEnabled() ?? false);
      if (!tracked) continue;
      for (const space of [this.player.indexTipSpaces[side], this.player.gripSpaces[side]]) {
        near = Math.min(near, this.box.distanceToPoint(space.getWorldPosition(this.point)));
      }
    }
    return near;
  }

  /** The season starts over from the start page: every handle at rest, and no tap from the old week still to fire (the latch). */
  restart(): void {
    this.holdEnded.clear();
    this.holdFired.clear();
    this.sinceHold.clear();
    for (const entity of this.queries.handles.entities) {
      entity.setValue(PullHandle, 'tapTimer', 0);
      entity.setValue(PullHandle, 'returning', false);
      entity.setValue(PullHandle, 'fired', false);
      entity.setValue(PullHandle, 'heldFor', 0);
      entity.setValue(PullHandle, 'maxPull', 0);
      const rest = entity.getVectorView(PullHandle, 'rest');
      entity.object3D?.position.set(rest[0], rest[1], rest[2]);
    }
  }

  update(delta: number): void {
    this.elapsed += delta;
    const blend = 1 - Math.exp(-RETURN_RATE * delta);
    for (const entity of this.queries.handles.entities) {
      const object = entity.object3D;
      if (object == null) continue;
      const tapTimer = entity.getValue(PullHandle, 'tapTimer') ?? 0;
      if (tapTimer > 0) {
        const left = tapTimer - delta;
        entity.setValue(PullHandle, 'tapTimer', Math.max(0, left));
        if (left <= 0) emitSignal(entity.getValue(PullHandle, 'signal') as SignalName);
      }

      const rest = entity.getVectorView(PullHandle, 'rest');
      const index = AXIS_INDEX[entity.getValue(PullHandle, 'axis') ?? Axis.X] ?? 0;
      const travel = entity.getValue(PullHandle, 'travel') ?? 0.1;
      const along = (object.position.getComponent(index) - rest[index]) * Math.sign(travel);

      if (entity.hasComponent(Grabbed)) {
        entity.setValue(PullHandle, 'heldFor', (entity.getValue(PullHandle, 'heldFor') ?? 0) + delta);
        if (this.letGoIfLeft(entity, delta)) continue;
        if (along > (entity.getValue(PullHandle, 'maxPull') ?? 0)) {
          entity.setValue(PullHandle, 'maxPull', along);
        }
        const threshold = entity.getValue(PullHandle, 'threshold') ?? 0.07;
        if (!entity.getValue(PullHandle, 'fired') && along >= threshold) {
          entity.setValue(PullHandle, 'fired', true);
          emitSignal(entity.getValue(PullHandle, 'signal') as SignalName);
        }
        continue;
      }

      if (entity.getValue(PullHandle, 'returning')) {
        object.position.x += (rest[0] - object.position.x) * blend;
        object.position.y += (rest[1] - object.position.y) * blend;
        object.position.z += (rest[2] - object.position.z) * blend;
        if (Math.abs(along) < 0.002) {
          object.position.set(rest[0], rest[1], rest[2]);
          entity.setValue(PullHandle, 'returning', false);
          entity.setValue(PullHandle, 'fired', false);
        }
      }
    }
  }
}

/** Remember where a handle sits before anyone touches it. */
function captureRest(entity: Entity): void {
  const position = entity.object3D?.position;
  if (position == null) return;
  const rest = entity.getVectorView(PullHandle, 'rest');
  rest[0] = position.x;
  rest[1] = position.y;
  rest[2] = position.z;
}
