import { Box3, type Mesh, type Object3D, Ray, Vector3 } from '@iwsdk/core';

/**
 * Where a hand takes or touches a thing: the point of its grip on the side
 * that faces the Keeper (GripMarkSystem rings it; the ghost hand's pinch or
 * fingertip comes to rest on it, HintSystem). Most things are aimed at by
 * their box, entered along the line from the eye to its middle. A few boxes
 * run far past the part a hand takes, and are aimed at by that part, found
 * by name under the thing or beside it: the rope's cord (its wooden grip),
 * the way up's post and hidden ray box (its ring's middle, a point), the
 * door leaf's hidden pane (the ring on it), the family box's glass (the
 * middle of a pane, a point: its own middle is behind the glazing bar).
 */
const GRIP_PART: Readonly<Record<string, string>> = {
  RopeToggleMesh: 'RopeToggleGrip',
  RopeToggle: 'RopeToggleGrip',
  WayUp: 'WayUpRingMiddle',
  WayUpRing: 'WayUpRingMiddle',
  WayUpTarget: 'WayUpRingMiddle',
  TowerDoorTarget: 'TowerDoorRing',
  FamilyGlass: 'FamilyGlassGrip',
};

/** How far in front of the surface the point sits, toward the eye, so a ring there is not swallowed by the thing (m). */
export const GRIP_NUDGE = 0.008;

const box = new Box3();
const ray = new Ray();
const middle = new Vector3();
const toward = new Vector3();

/** The part a hand aims at on `target` (itself, unless GRIP_PART names another). */
export function gripPart(target: Object3D): Object3D {
  const name = GRIP_PART[target.name];
  if (name == null) return target;
  return target.getObjectByName(name) ?? target.parent?.getObjectByName(name) ?? target;
}

/** The grip point of `target` seen from `eye`, into `out`. */
export function gripPoint(target: Object3D, eye: Vector3, out: Vector3): Vector3 {
  // A thing that names its own grip point in its frame (a path handle: v2 PathHandleSystem).
  const local = (target.userData as { gripLocal?: Vector3 }).gripLocal;
  if (local != null) return target.localToWorld(out.copy(local));
  const part = gripPart(target);
  // A named point (an empty marker): it is the grip.
  if ((part as Mesh).isMesh !== true && part.children.length === 0 && part !== target) return part.getWorldPosition(out);
  box.setFromObject(part);
  if (box.isEmpty()) return part.getWorldPosition(out);
  box.getCenter(middle);
  toward.subVectors(middle, eye);
  if (toward.lengthSq() < 1e-8) return out.copy(middle);
  toward.normalize();
  ray.set(eye, toward);
  if (box.containsPoint(eye) || ray.intersectBox(box, out) == null) out.copy(middle);
  return out.addScaledVector(toward, -GRIP_NUDGE);
}

/** How big a thing is (the radius of its aimed part's box, m): a glow round it is drawn about twice this. */
export function gripRadius(target: Object3D): number {
  box.setFromObject(gripPart(target));
  if (box.isEmpty()) return 0.05;
  return box.getSize(toward).length() / 2;
}
