import { createSystem, type Entity, Grabbed } from '@iwsdk/core';
import { Axis, PullHandle } from '../components.js';
import { emitSignal, type SignalName } from '../signals.js';
import { TAP_DELAY } from '../tap-gate.js';

const AXIS_INDEX: Record<string, number> = { [Axis.X]: 0, [Axis.Y]: 1, [Axis.Z]: 2 };
/** Spring-back rate after release; higher is snappier. */
const RETURN_RATE = 14;
/** A hold shorter than this that moved less than TAP_TRAVEL is a tap. */
const TAP_SECONDS = 0.6;
const TAP_TRAVEL = 0.015;
/**
 * A tap waits TAP_DELAY before firing. Reaching in to pinch brushes the knob
 * first, which looks like a tap; if a real grab starts inside this window
 * the tap is dropped and only the pull counts.
 */

/**
 * Shared primitive for every "slide it until it clicks" control. While the
 * handle is held, GrabSystem moves it inside its translate limits; this
 * system watches the displacement along the handle's axis, fires the signal
 * once at the threshold, and springs the handle back on release.
 *
 * A fingertip poke on a grabbable object also starts a short grab, so a
 * quick hold that barely moves the handle is treated as a tap and fires the
 * same signal. That is the hands-only fallback for anyone who cannot slide.
 */
export class PullHandleSystem extends createSystem({
  handles: { required: [PullHandle] },
  held: { required: [PullHandle, Grabbed] },
}) {
  init(): void {
    // qualify only fires for handles created after registration, so capture
    // the rest point of the ones that already exist as well.
    for (const entity of this.queries.handles.entities) captureRest(entity);
    this.cleanupFuncs.push(
      this.queries.handles.subscribe('qualify', captureRest),
      this.queries.held.subscribe('qualify', (entity) => {
        entity.setValue(PullHandle, 'tapTimer', 0);
        entity.setValue(PullHandle, 'returning', false);
        entity.setValue(PullHandle, 'heldFor', 0);
        entity.setValue(PullHandle, 'maxPull', 0);
      }),
      this.queries.held.subscribe('disqualify', (entity) => {
        if (!entity.hasComponent(PullHandle)) return;
        entity.setValue(PullHandle, 'returning', true);
        const tapped =
          !entity.getValue(PullHandle, 'fired') &&
          (entity.getValue(PullHandle, 'heldFor') ?? 1) < TAP_SECONDS &&
          (entity.getValue(PullHandle, 'maxPull') ?? 1) < TAP_TRAVEL;
        if (tapped) entity.setValue(PullHandle, 'tapTimer', TAP_DELAY);
      }),
    );
  }

  update(delta: number): void {
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
