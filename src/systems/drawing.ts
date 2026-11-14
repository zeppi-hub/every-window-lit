import { createSystem, type Entity, Euler, Grabbed, Pressed, Quaternion, Vector3 } from '@iwsdk/core';
import { largerCaptions } from '../comfort.js';
import { Drawing, Phase, Week } from '../components.js';
import { DRAWING_WEEK } from '../season/model.js';
import { drawingSeen, noteDrawingSeen } from '../season/store.js';
import { emitSignal } from '../signals.js';
import { tapOnlyByTouch } from '../touch-taps.js';
import { DRAWING_IN_BASKET, DRAWING_LARGE_ASIDE, DRAWING_ON_SILL } from '../station/drawing.js';

const HOME_RATE = 8;
const PARKED = 200;

/**
 * Lina's folded drawing in the turning-point week (META_VR_HIKAYE_v2.md):
 * it rides up in the basket beside the card and lies on the sill beside it
 * after. A fingertip on it, or a pinch that takes it, and Tocco reads what
 * she wrote, once (it used to wait for it to be held close to the eye, and
 * about a third of the blind judges missed it). Left alone, the season goes
 * on without it.
 */
export class DrawingSystem extends createSystem({
  drawing: { required: [Drawing] },
  week: { required: [Week] },
}) {
  private readonly home = new Vector3();
  private readonly homeTurn = new Quaternion();
  private readonly turn = new Euler(0, 0, 0, 'YXZ');

  update(delta: number): void {
    let week: Entity | null = null;
    for (const entity of this.queries.week.entities) week = entity;
    let entity: Entity | null = null;
    for (const e of this.queries.drawing.entities) entity = e;
    const object = entity?.object3D;
    if (week == null || entity == null || object == null) return;
    tapOnlyByTouch(entity);
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const n = week.getValue(Week, 'week') ?? 1;
    const inBasket = phase === Phase.Rising || phase === Phase.Choosing;
    const onSill = phase === Phase.Lowering || phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday;
    const shown = n === DRAWING_WEEK && (inBasket || onSill);
    object.visible = shown;
    if (!shown) {
      object.position.y = -PARKED;
      return;
    }
    const held = entity.hasComponent(Grabbed);
    // Touched or taken: she has been read, once a season (drawingSeen), whether it is then let go or kept in hand.
    if ((held || entity.hasComponent(Pressed)) && !drawingSeen()) {
      noteDrawingSeen();
      emitSignal('drawn');
    }
    if (held) return;
    const basket = week.object3D;
    if (inBasket && basket != null) {
      this.home.set(basket.position.x + DRAWING_IN_BASKET.x, basket.position.y + DRAWING_IN_BASKET.y, basket.position.z + DRAWING_IN_BASKET.z);
      this.homeTurn.setFromEuler(this.turn.set(DRAWING_IN_BASKET.tilt, DRAWING_IN_BASKET.yaw, 0, 'YXZ'));
      // It rides with the basket; only let go does it ease back.
      if (object.position.y < 0 || phase === Phase.Rising) {
        object.position.copy(this.home);
        object.quaternion.copy(this.homeTurn);
        return;
      }
    } else {
      this.home.set(DRAWING_ON_SILL.x + (largerCaptions() ? DRAWING_LARGE_ASIDE : 0), DRAWING_ON_SILL.y, DRAWING_ON_SILL.z);
      this.homeTurn.setFromEuler(this.turn.set(DRAWING_ON_SILL.tilt, DRAWING_ON_SILL.yaw, 0, 'YXZ'));
      if (object.position.y < 0) object.position.copy(this.home);
    }
    const k = 1 - Math.exp(-HOME_RATE * delta);
    object.position.lerp(this.home, k);
    object.quaternion.slerp(this.homeTurn, k);
  }
}
