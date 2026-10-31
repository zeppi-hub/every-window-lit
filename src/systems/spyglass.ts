import {
  createSystem,
  Euler,
  type Entity,
  Grabbed,
  type Group,
  HalfFloatType,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  WebGLRenderTarget,
} from '@iwsdk/core';
import { Phase, Spyglass, Week } from '../components.js';
import { realWeek, solidarityOf } from '../season/store.js';
import { emitSignal } from '../signals.js';
import { FOCUS } from '../station/focus.js';
import { createSpyglassView, SPYGLASS_REST, SPYGLASS_YAW, VIEW_ANGLE } from '../station/spyglass.js';

/** The view's picture is small on purpose (pixels a side): it is drawn again every frame while the spyglass is up. */
const PICTURE = 256;
/** About twice as near: the camera sees half the angle the view covers. */
const ZOOM = 2;
/** Nothing nearer than this is drawn in the view (m): the hand holding it, the sill, the window frame. */
const NEAR = 1;
/** The spyglass settles at the eye inside this distance from the head, and comes down outside the second (m). */
const RAISE = 0.22;
const LOWER = 0.3;
/** Let go, it goes back to its place on the sill over about this long (s). */
const HOME_RATE = 8;
/** Seconds the view rests on the week's place before Tocco names it. */
const SPOT_SECONDS = 0.6;

/**
 * The spyglass (META_VR_DINAMIKLER.md item 9). Lifted toward the face, it
 * settles at the eye by itself, so the hand never comes closer than about
 * 20 cm; the town then shows about twice as near inside a round view in
 * the middle of sight, while the rest stays as it was. The view's picture
 * is drawn, small, only while the spyglass is up. On a morning whose prices
 * show in the street, resting the view on that place has Tocco name it.
 * Let go, it goes back to its place on the sill.
 */
export class SpyglassSystem extends createSystem({
  glass: { required: [Spyglass] },
  week: { required: [Week] },
}) {
  private target!: WebGLRenderTarget;
  private eye!: PerspectiveCamera;
  private view!: Group;
  private raised = false;
  private spotting = 0;
  private spottedWeek = -1;
  private readonly head = new Vector3();
  private readonly forward = new Vector3();
  private readonly at = new Vector3();
  private readonly turn = new Quaternion();
  private readonly home = new Vector3(SPYGLASS_REST.x, SPYGLASS_REST.y, SPYGLASS_REST.z);
  private readonly homeTurn = new Quaternion().setFromEuler(new Euler(0, SPYGLASS_YAW, 0));

  init(): void {
    this.target = new WebGLRenderTarget(PICTURE, PICTURE, { type: HalfFloatType, generateMipmaps: false, depthBuffer: true });
    this.eye = new PerspectiveCamera(((2 * VIEW_ANGLE) / ZOOM) * (180 / Math.PI), 1, NEAR, 2000);
    this.view = createSpyglassView(this.target.texture);
    this.player.head.add(this.view);
    this.cleanupFuncs.push(() => {
      this.view.removeFromParent();
      this.target.dispose();
    });
  }

  update(delta: number): void {
    let glass: Entity | null = null;
    for (const entity of this.queries.glass.entities) glass = entity;
    const object = glass?.object3D;
    if (glass == null || object == null) return;
    const held = glass.hasComponent(Grabbed);
    this.player.head.getWorldPosition(this.head);
    if (held && object.visible !== false) {
      object.getWorldPosition(this.at);
      const near = this.at.distanceTo(this.head);
      if (!this.raised && near < RAISE) this.raise(object, true);
    } else if (held && this.raised) {
      // While up, the spyglass itself is hidden; its hand coming away from the face lowers it.
      object.getWorldPosition(this.at);
      if (this.at.distanceTo(this.head) > LOWER) this.raise(object, false);
    }
    if (!held) {
      if (this.raised) this.raise(object, false);
      this.goHome(object, delta);
    }
    if (!this.raised) {
      this.spotting = 0;
      return;
    }
    this.draw();
    this.spot(delta);
  }

  private raise(object: Object3D, up: boolean): void {
    this.raised = up;
    this.view.visible = up;
    object.visible = !up;
    if (up) emitSignal('spy');
  }

  /** Back to its place on the sill, eased. */
  private goHome(object: Object3D, delta: number): void {
    // Not while it is away from the sill altogether (parked out of reach before the second week).
    if (!object.visible) return;
    if (object.position.distanceToSquared(this.home) < 1e-8 && object.quaternion.angleTo(this.homeTurn) < 1e-4) return;
    const k = 1 - Math.exp(-HOME_RATE * delta);
    object.position.lerp(this.home, k);
    object.quaternion.slerp(this.homeTurn, k);
  }

  /** The town from the eye, at half the angle, into the small picture; the view and its own spyglass left out. */
  private draw(): void {
    const renderer = this.renderer;
    const camera = this.eye;
    camera.position.copy(this.head);
    this.player.head.getWorldQuaternion(this.turn);
    camera.quaternion.copy(this.turn);
    camera.updateMatrixWorld();
    const xr = renderer.xr.enabled;
    const shadows = renderer.shadowMap.autoUpdate;
    const before = renderer.getRenderTarget();
    this.view.visible = false;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.render(this.world.scene, camera);
    renderer.setRenderTarget(before);
    renderer.xr.enabled = xr;
    renderer.shadowMap.autoUpdate = shadows;
    this.view.visible = true;
  }

  /** On a morning whose prices show in the street, the view resting on that place: Tocco names it, once a week. */
  private spot(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const real = realWeek(n);
    const place = real != null ? FOCUS[real.kind] : undefined;
    if (place == null || real == null || real.tier === 0 || this.spottedWeek === n || solidarityOf(n) != null || week.getValue(Week, 'phase') !== Phase.Morning) {
      this.spotting = 0;
      return;
    }
    // Where the middle of the view meets the street.
    this.forward.set(0, 0, -1).applyQuaternion(this.turn);
    const t = this.forward.y < -1e-3 ? (place.y - this.head.y) / this.forward.y : -1;
    const x = this.head.x + this.forward.x * t;
    const z = this.head.z + this.forward.z * t;
    const on = t > 0 && Math.abs(x - place.x) < place.w / 2 && Math.abs(z - place.z) < place.d / 2;
    this.spotting = on ? this.spotting + delta : 0;
    if (this.spotting >= SPOT_SECONDS) {
      this.spottedWeek = n;
      emitSignal('spotted');
      if (import.meta.env.DEV) console.info('[spyglass] spotted', real.kind, 'in week', n);
    }
  }
}
