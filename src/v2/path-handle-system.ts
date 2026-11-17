import { Box3, createSystem, type Entity, InputComponent, type Object3D, Quaternion, Ray, RayInteractable, Vector3 } from '@iwsdk/core';
import { pinchPoint } from '../systems/pinch-reach.js';
import { PathHandle } from './components.js';
import { setPathAim } from './path-aim.js';
import { heldProgress, type PathKind, type PathSpec, placeOnPath, progressNearPoint, progressNearRay, samplePath, StrokeCounter } from './path.js';

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];
/** A controller's grip reaches a little farther than a hand's pinch point (m). */
const CONTROLLER_EXTRA = 0.03;
/** A ray takes a handle from at most this far (m). */
const RAY_FAR = 6;

/** What PathHandleSystem keeps per handle: its path, its starting turn, and the hold in progress. */
interface Track {
  spec: PathSpec;
  base: Quaternion;
  path: { points: Vector3[]; lengths: number[] };
  strokes: StrokeCounter;
  side: Side | null;
  via: 'near' | 'ray' | null;
  startProgress: number;
  startAlong: number;
}

/**
 * Drives PathHandle (v2/components.ts) the same way for every input:
 * - a tracked hand: its pinch (the emulator's Pinch button too) with its
 *   pinch point within the handle's reach of the grip, or with its ray on
 *   the handle from afar;
 * - a controller: its trigger or squeeze, with its grip near or its ray on it.
 * While held, the handle moves along its path as far as the hand, or the
 * point of the ray nearest the path, moved along it since the hold began.
 * Let go, it eases back to `rest` if it has one. What each side would take
 * is published (path-aim.ts) for the pinch and the rings.
 */
export class PathHandleSystem extends createSystem({
  handles: { required: [PathHandle] },
}) {
  private readonly tracks = new Map<Entity, Track>();
  private readonly box = new Box3();
  private readonly ray = new Ray();
  private readonly point = new Vector3();
  private readonly grip = new Vector3();
  private readonly hit = new Vector3();
  private readonly far = new Vector3();
  private readonly turn = new Quaternion();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  /** What each side holds; and what aimFor found (no allocation per frame). */
  private readonly holding: Record<Side, Entity | null> = { left: null, right: null };
  private aimEntity: Entity | null = null;
  private aimVia: 'near' | 'ray' = 'near';

  init(): void {
    this.cleanupFuncs.push(
      this.queries.handles.subscribe('qualify', (entity) => this.track(entity)),
      this.queries.handles.subscribe('disqualify', (entity) => {
        this.tracks.delete(entity);
        for (const side of SIDES) if (this.holding[side] === entity) this.holding[side] = null;
        const object = entity.object3D;
        if (object != null) delete (object.userData as { gripLocal?: Vector3 }).gripLocal;
      }),
    );
  }

  update(delta: number): void {
    for (const side of SIDES) this.follow(side);
    for (const [entity, track] of this.tracks) this.settle(entity, track, delta);
  }

  private track(entity: Entity): void {
    const object = entity.object3D;
    if (object == null) return;
    const v = (field: 'a' | 'b' | 'axis' | 'grip') => {
      const view = entity.getVectorView(PathHandle, field);
      return new Vector3(view[0], view[1], view[2]);
    };
    const spec: PathSpec = {
      kind: entity.getValue(PathHandle, 'kind') as PathKind,
      a: v('a'),
      b: v('b'),
      axis: v('axis'),
      from: entity.getValue(PathHandle, 'from') ?? 0,
      to: entity.getValue(PathHandle, 'to') ?? 0,
      grip: v('grip'),
    };
    const base = object.quaternion.clone();
    this.tracks.set(entity, { spec, base, path: samplePath(spec, base), strokes: new StrokeCounter(), side: null, via: null, startProgress: 0, startAlong: 0 });
    // Its ring sits on the grip (station/grip.ts); a ray stops on it, so a pinch from afar never presses what is behind.
    (object.userData as { gripLocal?: Vector3 }).gripLocal = spec.grip.clone();
    if (!entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
    placeOnPath(spec, entity.getValue(PathHandle, 'progress') ?? 0, base, object.position, object.quaternion);
  }

  /** One hand or controller: carry what it holds, or find what it would take and take it on a press. */
  private follow(side: Side): void {
    const xr = this.input.xr;
    const hand = pinchPoint(side);
    const controller = hand == null && xr.isPrimary('controller', side);
    let start = false;
    let end = false;
    if (hand != null) {
      const select = xr.getSelectState(side);
      start = select.start;
      end = select.end;
    } else if (controller) {
      const pad = xr.gamepads[side];
      start = (pad?.getButtonDown(InputComponent.Trigger) ?? false) || (pad?.getButtonDown(InputComponent.Squeeze) ?? false);
      end = (pad?.getButtonUp(InputComponent.Trigger) ?? false) || (pad?.getButtonUp(InputComponent.Squeeze) ?? false);
    }
    const entity = this.holding[side];
    const track = entity == null ? undefined : this.tracks.get(entity);
    if (entity != null && track != null) {
      setPathAim(side, entity.object3D ?? null);
      if ((hand == null && !controller) || end) {
        this.release(entity, track);
        return;
      }
      const along = this.along(side, track, entity.object3D, hand);
      if (along != null) entity.setValue(PathHandle, 'progress', heldProgress(track.startProgress, track.startAlong, along));
      return;
    }
    if (hand == null && !controller) {
      setPathAim(side, null);
      return;
    }
    const aim = this.aimFor(side, hand);
    setPathAim(side, aim?.object3D ?? null);
    const taken = aim == null ? undefined : this.tracks.get(aim);
    if (aim == null || taken == null || !start) return;
    const via = this.aimVia;
    taken.side = side;
    taken.via = via;
    this.holding[side] = aim;
    taken.startProgress = aim.getValue(PathHandle, 'progress') ?? 0;
    taken.startAlong = this.along(side, taken, aim.object3D, hand) ?? 0;
    aim.setValue(PathHandle, 'held', true);
    aim.setValue(PathHandle, 'holder', side);
    aim.setValue(PathHandle, 'via', via);
    if (import.meta.env.DEV) console.info(`[path] ${aim.object3D?.name} taken by ${side} (${via}) at ${taken.startProgress.toFixed(2)}`);
  }

  /** The handle this side would take (via in aimVia): one whose grip is within reach of its pinch point (or grip), else the nearest its ray is on. */
  private aimFor(side: Side, hand: Vector3 | null): Entity | null {
    const near = hand ?? this.player.gripSpaces[side].getWorldPosition(this.point);
    this.aimEntity = null;
    let bestAt = Infinity;
    for (const [entity, track] of this.tracks) {
      const object = entity.object3D;
      if (object == null || track.side != null || !shown(object)) continue;
      object.localToWorld(this.grip.copy(track.spec.grip));
      const reach = (entity.getValue(PathHandle, 'reach') ?? 0.05) + (hand == null ? CONTROLLER_EXTRA : 0);
      const d = this.grip.distanceTo(near);
      if (d <= reach && d < bestAt) {
        bestAt = d;
        this.aimEntity = entity;
        this.aimVia = 'near';
      }
    }
    if (this.aimEntity != null) return this.aimEntity;
    this.aimRay(side);
    for (const [entity, track] of this.tracks) {
      const object = entity.object3D;
      if (object == null || track.side != null || !shown(object)) continue;
      this.box.setFromObject(object);
      if (this.box.isEmpty() || this.ray.intersectBox(this.box, this.hit) == null) continue;
      const d = this.hit.distanceTo(this.ray.origin);
      if (d <= RAY_FAR && d < bestAt) {
        bestAt = d;
        this.aimEntity = entity;
        this.aimVia = 'ray';
      }
    }
    return this.aimEntity;
  }

  /** This side's target ray (world): from its ray space, down its -z. */
  private aimRay(side: Side): void {
    const space = this.player.raySpaces[side];
    space.getWorldPosition(this.ray.origin);
    space.getWorldQuaternion(this.turn);
    this.ray.direction.set(0, 0, -1).applyQuaternion(this.turn);
  }

  /** How far along the path its controller is now (0..1): the pinch point or grip, or the ray's point nearest the path. */
  private along(side: Side, track: Track, object: Object3D | undefined, hand: Vector3 | null): number | null {
    const parent = object?.parent;
    if (parent == null) return null;
    if (track.via === 'near') {
      const at = hand ?? this.player.gripSpaces[side].getWorldPosition(this.point);
      return progressNearPoint(track.path, parent.worldToLocal(this.point.copy(at)));
    }
    this.aimRay(side);
    const origin = parent.worldToLocal(this.point.copy(this.ray.origin));
    const tip = parent.worldToLocal(this.far.copy(this.ray.origin).add(this.ray.direction));
    return progressNearRay(track.path, origin, tip.sub(origin).normalize());
  }

  private release(entity: Entity, track: Track): void {
    if (import.meta.env.DEV) console.info(`[path] ${entity.object3D?.name} let go at ${(entity.getValue(PathHandle, 'progress') ?? 0).toFixed(2)}`);
    if (track.side != null) this.holding[track.side] = null;
    track.side = null;
    track.via = null;
    entity.setValue(PathHandle, 'held', false);
    entity.setValue(PathHandle, 'holder', '');
    entity.setValue(PathHandle, 'via', '');
  }

  /** Every handle, every frame: ease a free one back to its rest, count strokes, and put it where its progress says. */
  private settle(entity: Entity, track: Track, delta: number): void {
    const object = entity.object3D;
    if (object == null) return;
    let progress = entity.getValue(PathHandle, 'progress') ?? 0;
    const rest = entity.getValue(PathHandle, 'rest') ?? -1;
    if (track.side == null && rest >= 0 && progress !== rest) {
      const step = (entity.getValue(PathHandle, 'returnSpeed') ?? 2) * delta;
      progress = progress < rest ? Math.min(rest, progress + step) : Math.max(rest, progress - step);
      entity.setValue(PathHandle, 'progress', progress);
    }
    if (track.strokes.step(progress)) {
      entity.setValue(PathHandle, 'strokes', track.strokes.count);
      if (import.meta.env.DEV) console.info(`[path] ${object.name} stroke ${track.strokes.count}`);
    }
    placeOnPath(track.spec, progress, track.base, this.position, this.quaternion);
    object.position.copy(this.position);
    object.quaternion.copy(this.quaternion);
  }
}

function shown(object: Object3D): boolean {
  for (let at: Object3D | null = object; at != null; at = at.parent) if (!at.visible) return false;
  return true;
}
