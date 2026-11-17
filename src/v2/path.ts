import { Quaternion, Vector3 } from '@iwsdk/core';

/**
 * The paths a held thing can be carried along (PathHandle): a slide from
 * one point to another (a rope pulled down, a bucket lifted), or a swing
 * about an axis through a pivot between two angles (a pump's lever, an
 * oar). A path is followed by its grip point, sampled into a polyline in
 * the handle's parent space; progress 0..1 runs along it by length.
 */
export type PathKind = 'slide' | 'swing';

export interface PathSpec {
  kind: PathKind;
  /** Slide: where the handle is at progress 0. Swing: the pivot. (Parent space.) */
  a: Vector3;
  /** Slide: where it is at progress 1. */
  b: Vector3;
  /** Swing: the axis it turns about (parent space), and its angle at progress 0 and 1 (radians). */
  axis: Vector3;
  from: number;
  to: number;
  /** The grip point in the handle's own frame (where the hand takes it, where its ring sits). */
  grip: Vector3;
}

export const SWING_SAMPLES = 24;

const turn = new Quaternion();
const unitAxis = new Vector3();

/** The grip point's path (parent space), as a polyline, and its cumulative lengths. */
export function samplePath(spec: PathSpec, base: Quaternion = new Quaternion()): { points: Vector3[]; lengths: number[] } {
  const points: Vector3[] = [];
  if (spec.kind === 'slide') {
    const offset = spec.grip.clone().applyQuaternion(base);
    points.push(spec.a.clone().add(offset), spec.b.clone().add(offset));
  } else {
    const axis = spec.axis.clone().normalize();
    for (let i = 0; i <= SWING_SAMPLES; i += 1) {
      const angle = spec.from + ((spec.to - spec.from) * i) / SWING_SAMPLES;
      turn.setFromAxisAngle(axis, angle).multiply(base);
      points.push(spec.grip.clone().applyQuaternion(turn).add(spec.a));
    }
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  return { points, lengths };
}

const ab = new Vector3();
const ap = new Vector3();
const closest = new Vector3();

/** Progress (0..1, by length) of the point on the polyline nearest `p`. */
export function progressNearPoint(path: { points: Vector3[]; lengths: number[] }, p: Vector3): number {
  const { points, lengths } = path;
  const total = lengths[lengths.length - 1];
  if (total <= 0) return 0;
  let best = Infinity;
  let bestAt = 0;
  for (let i = 1; i < points.length; i += 1) {
    ab.subVectors(points[i], points[i - 1]);
    const len2 = ab.lengthSq();
    const u = len2 > 0 ? Math.min(1, Math.max(0, ap.subVectors(p, points[i - 1]).dot(ab) / len2)) : 0;
    closest.copy(points[i - 1]).addScaledVector(ab, u);
    const d = closest.distanceToSquared(p);
    if (d < best) {
      best = d;
      bestAt = lengths[i - 1] + u * Math.sqrt(len2);
    }
  }
  return bestAt / total;
}

const w0 = new Vector3();

/** Progress of the point on the polyline nearest a ray (origin, unit `dir`): a ray drags a handle along its path. */
export function progressNearRay(path: { points: Vector3[]; lengths: number[] }, origin: Vector3, dir: Vector3): number {
  const { points, lengths } = path;
  const total = lengths[lengths.length - 1];
  if (total <= 0) return 0;
  let best = Infinity;
  let bestAt = 0;
  for (let i = 1; i < points.length; i += 1) {
    ab.subVectors(points[i], points[i - 1]);
    const len = ab.length();
    if (len <= 0) continue;
    ab.divideScalar(len);
    // Closest points between the ray's line and the segment's line, the segment's clamped to it.
    w0.subVectors(points[i - 1], origin);
    const b = ab.dot(dir);
    const d = ab.dot(w0);
    const e = dir.dot(w0);
    const denom = 1 - b * b;
    let s = denom > 1e-9 ? (b * e - d) / denom : 0;
    s = Math.min(len, Math.max(0, s));
    closest.copy(points[i - 1]).addScaledVector(ab, s);
    const along = Math.max(0, ap.subVectors(closest, origin).dot(dir));
    const dist = ap.addScaledVector(dir, -along).lengthSq();
    if (dist < best) {
      best = dist;
      bestAt = lengths[i - 1] + s;
    }
  }
  return bestAt / total;
}

/** Puts the handle (its position and, for a swing, its turn from `base`) at `progress`. */
export function placeOnPath(spec: PathSpec, progress: number, base: Quaternion, position: Vector3, quaternion: Quaternion): void {
  const t = Math.min(1, Math.max(0, progress));
  if (spec.kind === 'slide') {
    position.lerpVectors(spec.a, spec.b, t);
    quaternion.copy(base);
    return;
  }
  position.copy(spec.a);
  quaternion.setFromAxisAngle(unitAxis.copy(spec.axis).normalize(), spec.from + (spec.to - spec.from) * t).multiply(base);
}

/** A hold moves the handle as far along as its controller moved along the path since the hold began (no jump to the hand). */
export function heldProgress(startProgress: number, startAlong: number, along: number): number {
  return Math.min(1, Math.max(0, startProgress + along - startAlong));
}

/**
 * Full strokes: from near one end to near the other and back counts one
 * (a pump's stroke, a bucket's bail). Ends are within END of 0 and 1.
 */
export const END = 0.08;

export class StrokeCounter {
  count = 0;
  private reachedFar = false;
  private armed = false;

  /** Feed the progress every frame; returns true on the frame a stroke completes. */
  step(progress: number): boolean {
    if (progress <= END) {
      if (this.reachedFar) {
        this.count += 1;
        this.reachedFar = false;
        this.armed = true;
        return true;
      }
      this.armed = true;
    } else if (progress >= 1 - END && this.armed) this.reachedFar = true;
    return false;
  }
}

const v = new Vector3();
const r0 = new Vector3();
const cross = new Vector3();

/**
 * A swing's angle to `p` (parent space) about its axis, from the grip's
 * direction at `from`, in radians; unwrapped to lie within half a turn of
 * `last` so a full turn (whose path's two ends meet) keeps counting rather
 * than jumping back. Divided by (to - from) it is progress.
 */
export function swingAngle(spec: PathSpec, base: Quaternion, p: Vector3, last: number | null): number {
  const axis = unitAxis.copy(spec.axis).normalize();
  turn.setFromAxisAngle(axis, spec.from).multiply(base);
  r0.copy(spec.grip).applyQuaternion(turn);
  r0.addScaledVector(axis, -r0.dot(axis));
  v.subVectors(p, spec.a);
  v.addScaledVector(axis, -v.dot(axis));
  let angle = Math.atan2(cross.crossVectors(r0, v).dot(axis), r0.dot(v));
  if (last != null) angle += Math.PI * 2 * Math.round((last - angle) / (Math.PI * 2));
  return angle;
}
