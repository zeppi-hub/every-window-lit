import {
  Box3,
  createSystem,
  DistanceGrabbable,
  type Entity,
  Grabbed,
  Object3D,
  OneHandGrabbable,
  PokeInteractable,
  Pressed,
  TwoHandsGrabbable,
  Vector3,
} from '@iwsdk/core';
import { PokeButton } from '../components.js';
import { gripPart } from '../station/grip.js';
import { pathAim } from '../v2/path-aim.js';

/**
 * A hand's pinch takes what its rings show (the hands package, 17 Nov). Out
 * of the box IWSDK sends a hand's pinch to its grab sphere, 7 cm round the
 * palm, about 7 cm behind the point where thumb and index meet; and while
 * the fingertip is within 15 cm of anything that can be poked, IWSDK makes
 * the touch pointer the hand's active one, hides the ray and lets the pinch
 * go nowhere. In the emulator: the ray on Nora's little house 44 cm off, the
 * fingertip 8.5 cm from the sun's knob, a pinch, and nothing (17 Nov).
 *
 * For a tracked hand, each frame:
 * - the grab sphere sits on the pinch point (between the thumb and index
 *   tips), PINCH_REACH round it: a pinch there takes the grabbable it
 *   touches, as GrabSystem routes it;
 * - the touch pointer is on only while the fingertip is within TOUCH_ON of
 *   something that can be poked (off again past TOUCH_OFF): a poke still
 *   presses at the touch, and the rest of the time the ray stays the active
 *   pointer, drawn, and a pinch takes what it points at; in the few
 *   centimetres where the touch is on but not touching, a pinch is sent to
 *   the ray only if the ray is on the thing the fingertip is near;
 * - a pinch with nothing in its sphere presses the nearest button that can
 *   only be poked (Nora's little house, the lamp, Tocco) within PINCH_REACH
 *   of the pinch point, held as long as the pinch, as one more pointer in
 *   IWSDK's InputSystem (a lost hand cancels it: no tap); a button whose
 *   pointer filter would refuse this hand's fingertip refuses its pinch too.
 * The pinch space turns with the hand, so a held thing turns with the wrist.
 * What a pinch would take now is pinchTarget(side): GripMarkSystem fills
 * that ring, so the ring and the pinch's choice are the same.
 * Controllers keep IWSDK's own grab sphere, round the grip, and their touch pointer.
 */
export const PINCH_REACH = 0.03;
const TOUCH_ON = 0.045;
const TOUCH_OFF = 0.06;
/** A button pressed (by a touch, a ray or a pinch) this recently is not pressed again by a pinch: the fingertip that brushed it on the way is the same reach (s). */
const PRESSED_AGAIN = 0.6;
/** A ray hit farther than this is no near target to mark (the far window keeps its own hint, m). */
const RAY_FAR = 6;

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

/** What a hand's pinch would take this frame, and how: its grab sphere, a press on a poke-only button, the fingertip's touch, or the ray. */
export interface PinchAim {
  thing: Object3D | null;
  via: 'grab' | 'press' | 'touch' | 'ray' | 'drag' | null;
}

const aims: Record<Side, PinchAim> = { left: { thing: null, via: null }, right: { thing: null, via: null } };
const points: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };
const tracked: Record<Side, boolean> = { left: false, right: false };

export function pinchTarget(side: Side): Readonly<PinchAim> {
  return aims[side];
}

/** Where a tracked hand's pinch point is (world), or null for a controller or no hand. */
export function pinchPoint(side: Side): Vector3 | null {
  return tracked[side] ? points[side] : null;
}

/** The private parts of @pmndrs/pointer-events a grab pointer's sphere is read from (SphereIntersector). */
interface SphereParts {
  intersector?: { space?: { current?: Object3D | null }; options?: { radius?: number } };
}

export class PinchReachSystem extends createSystem({
  buttons: { required: [PokeButton] },
  pressed: { required: [PokeButton, Pressed] },
  pokeable: { required: [PokeInteractable] },
}) {
  /** Each hand's pinch point, under the XR origin beside its grip space, for the grab sphere to be read from. */
  private readonly spaces: Record<Side, Object3D> = { left: new Object3D(), right: new Object3D() };
  /** The button each hand's pinch is pressing (through InputSystem's pointer events, PINCH_ID), till the pinch ends; and whether its pinch was sent to the ray. */
  private readonly pressing: Record<Side, Entity | null> = { left: null, right: null };
  private readonly routed: Record<Side, boolean> = { left: false, right: false };
  private readonly event = { timeStamp: 0 };
  private readonly touchOn: Record<Side, boolean> = { left: true, right: true };
  private readonly box = new Box3();
  private readonly tip = new Vector3();
  private readonly thumb = new Vector3();
  private warned = false;
  /** When each button was last pressed, by anything (s, performance clock). */
  private readonly pressedAt = new Map<Entity, number>();

  init(): void {
    this.cleanupFuncs.push(this.queries.pressed.subscribe('qualify', (entity) => this.pressedAt.set(entity, performance.now() / 1000)));
    for (const side of SIDES) {
      const space = this.spaces[side];
      space.name = `PinchPoint-${side}`;
      // Beside the grip space, so its local position is the pose in the XR reference space, as IWSDK's own spaces.
      (this.player.gripSpaces[side].parent ?? this.player).add(space);
    }
  }

  update(): void {
    const xr = this.input.xr;
    const frame = this.renderer.xr.getFrame();
    const reference = this.renderer.xr.getReferenceSpace();
    const session = this.renderer.xr.getSession();
    for (const side of SIDES) {
      // The pointer IWSDK used for this frame's pinch edge, read before the touch gate below can change it.
      const kind = xr.multiPointers[side]?.getActiveKind() ?? null;
      const hand = xr.isPrimary('hand', side) && frame != null && reference != null && session != null ? this.handOf(session, side) : null;
      tracked[side] = hand != null && frame != null && reference != null && this.place(side, hand, frame, reference);
      this.aimSphere(side, tracked[side]);
      this.gateTouch(side, tracked[side]);
      this.decide(side, kind);
      if (!tracked[side]) {
        // The hand was lost mid-pinch: its press never ended, so it is no tap.
        this.lift(side, true);
        continue;
      }
      const select = xr.getSelectState(side);
      this.event.timeStamp = performance.now();
      if (select.start) this.pinch(side, kind);
      if (select.end) this.lift(side);
    }
  }

  private handOf(session: XRSession, side: Side): XRHand | null {
    for (const source of session.inputSources) if (source.handedness === side && source.hand != null) return source.hand;
    return null;
  }

  /** Puts the hand's pinch space midway between its thumb and index tips; false if the joints have no pose. */
  private place(side: Side, hand: XRHand, frame: XRFrame, reference: XRReferenceSpace): boolean {
    const thumbJoint = hand.get('thumb-tip');
    const indexJoint = hand.get('index-finger-tip');
    if (thumbJoint == null || indexJoint == null || frame.getJointPose == null) return false;
    const a = frame.getJointPose(thumbJoint, reference);
    const b = frame.getJointPose(indexJoint, reference);
    if (a == null || b == null) return false;
    const space = this.spaces[side];
    this.thumb.set(a.transform.position.x, a.transform.position.y, a.transform.position.z);
    space.position.set(b.transform.position.x, b.transform.position.y, b.transform.position.z).add(this.thumb).multiplyScalar(0.5);
    // Turned as the hand is (its grip, a sibling): a held thing turns with the wrist, about the pinch point.
    space.quaternion.copy(this.player.gripSpaces[side].quaternion);
    space.updateMatrix();
    space.updateWorldMatrix(true, false);
    space.getWorldPosition(points[side]);
    return true;
  }

  /** A hand's grab sphere on its pinch point, PINCH_REACH round; a controller's back on its grip, IWSDK's own size. */
  private aimSphere(side: Side, hand: boolean): void {
    const pointer = this.input.xr.multiPointers[side]?.getPointer('grab') as unknown as SphereParts | undefined;
    const intersector = pointer?.intersector;
    if (intersector?.space == null || intersector.options == null) {
      if (!this.warned && import.meta.env.DEV) console.warn('[pinch] the grab pointer has no sphere to move: pinches stay round the palm');
      this.warned = true;
      return;
    }
    const want = hand ? this.spaces[side] : this.player.gripSpaces[side];
    if (intersector.space.current !== want) intersector.space.current = want;
    if (hand) intersector.options.radius = PINCH_REACH;
    else delete intersector.options.radius;
  }

  /** A hand's touch pointer, on only while its fingertip is near something that can be poked. */
  private gateTouch(side: Side, hand: boolean): void {
    const multi = this.input.xr.multiPointers[side];
    if (multi == null) return;
    let on = true;
    if (hand) {
      this.player.indexTipSpaces[side].getWorldPosition(this.tip);
      const near = this.nearestPokeable(this.tip);
      on = near <= (this.touchOn[side] ? TOUCH_OFF : TOUCH_ON);
      // Never cut a touch that is pressing; never wake one while the pinch is held by the ray (it could press on the way).
      if (!on && multi.getPointer('touch').getButtonsDown().size > 0) on = true;
      if (this.routed[side]) on = false;
    }
    if (on !== this.touchOn[side]) {
      multi.toggleSubPointer('touch', on);
      this.touchOn[side] = on;
      if (import.meta.env.DEV) console.info(`[pinch] ${side} touch pointer ${on ? 'on' : 'off'}`);
    }
  }

  private nearestPokeable(at: Vector3): number {
    let best = Infinity;
    for (const entity of this.queries.pokeable.entities) {
      const object = entity.object3D;
      if (object == null || !shown(object)) continue;
      this.box.setFromObject(gripPart(object));
      if (this.box.isEmpty()) this.box.setFromObject(object);
      if (this.box.isEmpty()) continue;
      best = Math.min(best, this.box.distanceToPoint(at));
    }
    return best;
  }

  /**
   * What a pinch would take now (pinchTarget), `kind` being IWSDK's active pointer this frame: what the grab sphere
   * touches; else, while the ray is active, its hit (IWSDK presses it itself, at any distance); else a poke-only
   * button in reach of the pinch point; else what the fingertip is pressing; else, with the fingertip near
   * something but not on it, the ray's hit if it is that same thing (the pinch is sent to it).
   */
  private decide(side: Side, kind: string | null): void {
    const aim = aims[side];
    aim.thing = null;
    aim.via = null;
    const multi = this.input.xr.multiPointers[side];
    if (multi == null) return;
    // A handle carried along a path (v2 PathHandleSystem) takes this pinch itself.
    const handle = pathAim(side);
    if (handle != null) {
      aim.thing = handle;
      aim.via = 'drag';
      return;
    }
    const grab = hitOf(multi.getPointer('grab').getIntersection());
    if (grab != null) {
      aim.thing = grab;
      aim.via = 'grab';
      return;
    }
    const ray = multi.getPointer('ray').getIntersection();
    const rayThing = hitOf(ray);
    if (kind === 'ray') {
      if (rayThing != null) {
        aim.thing = rayThing;
        aim.via = 'ray';
      }
      return;
    }
    if (tracked[side]) {
      const button = this.pressable(side);
      if (button?.object3D != null) {
        aim.thing = button.object3D;
        aim.via = 'press';
        return;
      }
    }
    if (kind !== 'touch') return;
    const touch = multi.getPointer('touch');
    const touchThing = hitOf(touch.getIntersection());
    if (touchThing == null) return;
    if (touch.getButtonsDown().size > 0) {
      aim.thing = touchThing;
      aim.via = 'touch';
      return;
    }
    // The fingertip near something, not on it: a pinch there goes to the ray only if the ray is on that same thing.
    if (tracked[side] && rayThing != null && ray != null && ray.distance <= RAY_FAR && related(rayThing, touchThing)) {
      aim.thing = rayThing;
      aim.via = 'ray';
    }
  }

  /** The nearest button that can only be poked (no grab of its own) within PINCH_REACH of the hand's pinch point. */
  private pressable(side: Side): Entity | null {
    let best: Entity | null = null;
    let bestAt = PINCH_REACH;
    const touchId = this.input.xr.multiPointers[side]?.getPointer('touch').id;
    for (const entity of this.queries.buttons.entities) {
      if (entity.hasComponent(OneHandGrabbable) || entity.hasComponent(TwoHandsGrabbable) || entity.hasComponent(DistanceGrabbable)) continue;
      const object = entity.object3D;
      if (object == null || !shown(object)) continue;
      // A button that would not take this hand's fingertip now (the key while the hand is at the glass, the Sunday lamp
      // while its glass can be lifted) does not take its pinch either.
      if (touchId != null && !allowsTouch(object.pointerEventsType, touchId)) continue;
      this.box.setFromObject(gripPart(object));
      if (this.box.isEmpty()) this.box.setFromObject(object);
      if (this.box.isEmpty()) continue;
      const d = this.box.distanceToPoint(points[side]);
      if (d <= bestAt) {
        bestAt = d;
        best = entity;
      }
    }
    return best;
  }

  /** The pinch starts: a poke-only button in reach is pressed till it ends (a grab, a touch and a ray take theirs through IWSDK). */
  private pinch(side: Side, kind: string | null): void {
    const aim = aims[side];
    if (import.meta.env.DEV) console.info(`[pinch] ${side} pinches ${aim.via ?? 'nothing'}${aim.thing != null ? ` on ${aim.thing.name || aim.thing.parent?.name || '?'}` : ''}`);
    if (aim.via === 'ray') {
      // IWSDK sends it to the ray itself while the ray is the active pointer.
      const multi = this.input.xr.multiPointers[side];
      if (multi != null && kind !== 'ray') {
        multi.routeDown('select', 'ray', this.event);
        this.routed[side] = true;
        multi.toggleSubPointer('touch', false);
        this.touchOn[side] = false;
      }
      return;
    }
    if (aim.via !== 'press') return;
    const button = this.pressable(side);
    if (button == null || button.hasComponent(Pressed) || button.hasComponent(Grabbed)) return;
    if (performance.now() / 1000 - (this.pressedAt.get(button) ?? -Infinity) < PRESSED_AGAIN) {
      if (import.meta.env.DEV) console.info(`[pinch] ${side}: ${button.object3D?.name} was just pressed, not again`);
      return;
    }
    // As one more pointer on it, so IWSDK's InputSystem keeps the press while other pointers come and go.
    this.send(button, 'pointerdown', side);
    this.pressing[side] = button;
  }

  /** The pinch ends (or the hand is `lost`: then no tap, the press is cancelled). */
  private lift(side: Side, lost = false): void {
    if (this.routed[side]) {
      this.routed[side] = false;
      // A lost hand's ray was already cancelled by IWSDK.
      if (!lost) this.input.xr.multiPointers[side]?.routeUp('select', 'ray', this.event);
    }
    const button = this.pressing[side];
    if (button == null) return;
    this.pressing[side] = null;
    if (lost) this.send(button, 'pointercancel', side);
    else {
      this.send(button, 'pointerup', side);
      this.send(button, 'pointerleave', side);
    }
  }

  /** A pointer event from this hand's pinch, on the button itself, where InputSystem (and PokeButtonSystem's cancel) listen. */
  private send(button: Entity, type: 'pointerdown' | 'pointerup' | 'pointerleave' | 'pointercancel', side: Side): void {
    const object = button.object3D;
    if (object == null) return;
    (object as unknown as { dispatchEvent(event: { type: string; pointerId: number; stopPropagation(): void }): void }).dispatchEvent({
      type,
      pointerId: PINCH_ID[side],
      stopPropagation: noop,
    });
  }
}

/** The pinch's own pointer ids: real pointers count up from 0, so these never meet one. */
const PINCH_ID: Record<Side, number> = { left: -101, right: -102 };
const noop = (): void => {};

/** Whether a pointerEventsType setting lets a touch pointer with id `id` through (as @pmndrs/pointer-events reads it). */
function allowsTouch(setting: unknown, id: number): boolean {
  if (setting == null || setting === 'all') return true;
  if (typeof setting === 'function') return (setting as (id: number, type: string) => boolean)(id, 'touch') !== false;
  if (typeof setting === 'object') {
    const rule = setting as { deny?: string | string[]; allow?: string | string[] };
    if (rule.deny != null) return !([] as string[]).concat(rule.deny).includes('touch');
    if (rule.allow != null) return ([] as string[]).concat(rule.allow).includes('touch');
  }
  return true;
}

/** Whether one of the two is the other or holds it. */
function related(a: Object3D, b: Object3D): boolean {
  for (let p: Object3D | null = a; p != null; p = p.parent) if (p === b) return true;
  for (let p: Object3D | null = b.parent; p != null; p = p.parent) if (p === a) return true;
  return false;
}

/** The object a pointer's intersection is on, or null for none (pointer-events gives a void object then). */
function hitOf(intersection: { object: Object3D } | undefined): Object3D | null {
  if (intersection == null) return null;
  const object = intersection.object as Object3D & { isVoidObject?: boolean };
  return object.isVoidObject === true ? null : object;
}

function shown(object: Object3D): boolean {
  for (let at: Object3D | null = object; at != null; at = at.parent) if (!at.visible) return false;
  return true;
}
