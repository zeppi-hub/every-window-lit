import { type Entity, type Mesh, type MeshBasicMaterial, type Object3D, Quaternion, Vector3, type World } from '@iwsdk/core';
import { createHint, PINCH_AT } from '../../station/hint.js';
import { PathHandle } from '../components.js';
import { v2Targets } from '../step-targets.js';

/** How long the scene waits on a ringed thing, untouched, before the hand shows the gesture (s); and one showing's length. */
const IDLE = 7;
const CYCLE = 2.6;
/** Something further than this is shown from an arm's length out, pointed at (m). */
const ARM = 0.55;
/** Where a feather is taken to: Gray's ear, the family's glass. */
const FEATHER_TARGETS = new Set(['GrayEar', 'FamilyGlass']);

/**
 * The ghost hand of the new version (the current game's soft white hand,
 * station/hint.ts): when the scene has rung something (step-targets.ts) and
 * nothing has been taken for a while, the hand shows the gesture on the
 * first ringed thing, again and again, and goes the moment the player
 * pinches or the rings change. A path's handle is shown along its path; a
 * feather's ear, from the wing to the ear; anything far off, pinched at
 * from an arm's length out toward it. No words.
 */
export class GhostHand {
  private readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;
  private targets: readonly Object3D[] = [];
  private idle = 0;
  /** How long untouched before the hand shows (s): IDLE, or sooner when a scene asks (soon()). */
  private wait = IDLE;
  private t = 0;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly eye = new Vector3();
  private readonly at = new Vector3();
  private readonly turn = new Quaternion();
  private readonly pinchAt = new Vector3();
  /** Where the wing is, for a feather's gesture (set by the scene with the ear). */
  wingFrom: (() => Vector3) | null = null;
  /** The handles' entities by object, for their paths. */
  entityOf: (object: Object3D) => Entity | null = () => null;

  constructor(world: World) {
    const { hand, pinch } = createHint();
    hand.material = (hand.material as MeshBasicMaterial).clone();
    this.material = hand.material as MeshBasicMaterial;
    this.material.map = pinch;
    this.mesh = hand;
    this.mesh.renderOrder = 9100;
    this.mesh.pointerEvents = 'none';
    world.createTransformEntity(this.mesh, { persistent: true });
  }

  /** The rings changed or the player did something: the hand goes, and the wait starts again. */
  touched(): void {
    this.idle = 0;
    this.mesh.visible = false;
  }

  /** The player pressed (a pinch, a trigger): as touched(), and the wait is the usual one again. */
  pressed(): void {
    this.wait = IDLE;
    this.touched();
  }

  /** Show the gesture after only `seconds` untouched, until the player first presses (a game's very first move). */
  soon(seconds: number): void {
    this.wait = seconds;
  }

  update(delta: number, head: Object3D): void {
    const now = v2Targets();
    if (now !== this.targets) {
      this.targets = now;
      this.touched();
    }
    if (now.length === 0) return;
    this.idle += delta;
    if (this.idle < this.wait) return;
    if (this.idle - delta < this.wait) {
      this.t = 0;
      this.plan(now[0], head);
    }
    this.t = (this.t + delta) % CYCLE;
    const k = this.t / CYCLE;
    // In, a moment still, along the gesture, a moment still, out.
    const move = Math.min(1, Math.max(0, (k - 0.15) / 0.5));
    const ease = move * move * (3 - 2 * move);
    this.material.opacity = 0.85 * Math.min(1, k / 0.1, Math.max(0, (1 - k) / 0.15));
    head.getWorldPosition(this.eye);
    this.at.lerpVectors(this.from, this.to, ease);
    this.mesh.position.copy(this.at);
    this.mesh.lookAt(this.eye);
    // Put the pinch (thumb on index), not the drawing's middle, on the point.
    this.mesh.getWorldQuaternion(this.turn);
    this.mesh.position.sub(this.pinchAt.set(PINCH_AT.x, PINCH_AT.y, 0).applyQuaternion(this.turn));
    this.mesh.visible = true;
  }

  /** The gesture for `target`: its path, the wing to the ear, or a pinch from an arm's length out. */
  private plan(target: Object3D, head: Object3D): void {
    head.getWorldPosition(this.eye);
    const entity = this.entityOf(target);
    if (entity != null && entity.hasComponent(PathHandle)) {
      const a = entity.getVectorView(PathHandle, 'a');
      const b = entity.getVectorView(PathHandle, 'b');
      const parent = target.parent;
      if ((entity.getValue(PathHandle, 'kind') ?? 'slide') === 'slide' && parent != null) {
        this.from.set(a[0], a[1], a[2]);
        this.to.set(b[0], b[1], b[2]);
        parent.localToWorld(this.from);
        parent.localToWorld(this.to);
        // A handle in its middle (a rope) is shown from where it is to its nearer end, then back is the player's to find.
        target.getWorldPosition(this.at);
        if (this.at.distanceTo(this.from) > 0.05) this.from.copy(this.at);
      } else {
        // A swing (the spade, the watch's hand): from its grip, a short way toward the eye.
        const grip = entity.getVectorView(PathHandle, 'grip');
        this.from.set(grip[0], grip[1], grip[2]);
        target.localToWorld(this.from);
        this.to.copy(this.from).add(this.at.subVectors(this.eye, this.from).normalize().multiplyScalar(0.18));
      }
      this.farOff();
      return;
    }
    target.getWorldPosition(this.to);
    if (this.wingFrom != null && FEATHER_TARGETS.has(target.name)) {
      this.from.copy(this.wingFrom());
      return;
    }
    // A thing in reach: a small pull toward the eye. A far one: pinch from an arm's length toward it.
    if (this.to.distanceTo(this.eye) <= ARM + 0.2) {
      this.from.copy(this.to);
      this.to.add(this.at.subVectors(this.eye, this.to).normalize().multiplyScalar(0.12));
    } else {
      this.from.copy(this.eye).add(this.at.subVectors(this.to, this.eye).normalize().multiplyScalar(ARM));
      this.from.y -= 0.12;
      this.to.copy(this.from).add(this.at.multiplyScalar(0.08));
    }
  }

  /** A gesture far out (a stake down the street) is shown from an arm's length out, the same way along. */
  private farOff(): void {
    if (this.from.distanceTo(this.eye) <= ARM + 0.3) return;
    const along = this.at.subVectors(this.to, this.from);
    const reach = this.from.distanceTo(this.eye);
    const scale = ARM / reach;
    this.from.sub(this.eye).multiplyScalar(scale).add(this.eye);
    this.to.copy(this.from).addScaledVector(along, scale);
  }
}
