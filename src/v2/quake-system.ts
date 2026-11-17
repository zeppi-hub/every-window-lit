import { createSystem, Euler, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { lessMotion } from '../comfort.js';
import { Shakeable } from './components.js';
import { quakeAt, type QuakeOffset, type QuakeSpec } from './quake.js';

/** The quake now: its spec and how long it has run (s). */
let current: { spec: QuakeSpec; t: number } | null = null;
/** Plain objects shaken too (not entities): `shakeObject`. */
const extraRoots = new Set<Object3D>();

/** Start a quake (one at a time: a new one replaces the old). */
export function startQuake(spec: QuakeSpec): void {
  current = { spec: { ...spec }, t: 0 };
}

/** Let the quake die out now, over its usual fall. */
export function stopQuake(): void {
  if (current == null) return;
  current.spec.seconds = Math.min(current.spec.seconds, current.t + 0.8);
}

export function quaking(): boolean {
  return current != null;
}

/** Shake a plain object too (a scene's root that is not an entity); `false` to stop. */
export function shakeObject(object: Object3D, on = true): void {
  if (on) extraRoots.add(object);
  else extraRoots.delete(object);
}

/** A root's place before the quake, to shake from and to put back. */
interface Base {
  position: Vector3;
  quaternion: Quaternion;
  weight: number;
}

/**
 * The world shakes, the camera does not (v2/quake.ts): every Shakeable
 * root (and every shakeObject) is turned round the player's eye and moved
 * a little each frame while a quake runs, and put back exactly where it
 * was when it ends. Less motion: a third of the size, slower.
 */
export class QuakeSystem extends createSystem({
  roots: { required: [Shakeable] },
}) {
  private readonly bases = new Map<Object3D, Base>();
  private readonly offset: QuakeOffset = { pitch: 0, roll: 0, x: 0, y: 0, z: 0 };
  private readonly pivot = new Vector3();
  private readonly turn = new Quaternion();
  private readonly partial = new Quaternion();
  private readonly identity = new Quaternion();
  private readonly euler = new Euler();
  private readonly arm = new Vector3();

  update(delta: number): void {
    const quake = current;
    if (quake == null) {
      if (this.bases.size > 0) this.restore();
      return;
    }
    if (this.bases.size === 0) this.player.head.getWorldPosition(this.pivot);
    quake.t += delta;
    if (Number.isFinite(quake.spec.seconds) && quake.t >= quake.spec.seconds) {
      current = null;
      this.restore();
      return;
    }
    quakeAt(quake.spec, quake.t, lessMotion(), this.offset);
    this.euler.set(this.offset.pitch, 0, this.offset.roll);
    this.turn.setFromEuler(this.euler);
    for (const entity of this.queries.roots.entities) {
      const object = entity.object3D;
      if (object != null) this.shake(object, entity.getValue(Shakeable, 'weight') ?? 1);
    }
    for (const object of extraRoots) this.shake(object, 1);
  }

  private shake(object: Object3D, weight: number): void {
    let base = this.bases.get(object);
    if (base == null) {
      base = { position: object.position.clone(), quaternion: object.quaternion.clone(), weight };
      this.bases.set(object, base);
    }
    this.partial.slerpQuaternions(this.identity, this.turn, base.weight);
    // Round the eye: the turn moves near things little and far things more, as a deck does.
    this.arm.subVectors(base.position, this.pivot).applyQuaternion(this.partial);
    object.position.copy(this.pivot).add(this.arm);
    object.position.x += this.offset.x * base.weight;
    object.position.y += this.offset.y * base.weight;
    object.position.z += this.offset.z * base.weight;
    object.quaternion.copy(this.partial).multiply(base.quaternion);
  }

  private restore(): void {
    for (const [object, base] of this.bases) {
      object.position.copy(base.position);
      object.quaternion.copy(base.quaternion);
    }
    this.bases.clear();
  }
}
