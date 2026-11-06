import {
  createSystem,
  Euler,
  type Entity,
  GrabSystem,
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
import { shownLevel } from '../season/model.js';
import { currentTown, markSeen, noteMarkSeen, realWeek, solidarityOf } from '../season/store.js';
import { emitSignal, onSignal } from '../signals.js';
import { FOCUS } from '../station/focus.js';
import { FRAME_MIDDLE } from '../station/town-lamp.js';
import { createSpyglassView, SPYGLASS_REST, SPYGLASS_YAW, VIEW_ANGLE } from '../station/spyglass.js';

/** The view's picture is small on purpose (pixels a side): it is drawn again every frame while the spyglass is up. */
const PICTURE = 256;
/** About twice as near: the camera sees half the angle the view covers. */
const ZOOM = 2;
/** Nothing nearer than this is drawn in the view (m): the hand holding it, the sill, the window frame. */
const NEAR = 1;
/** The spyglass settles at the eye when the hand holding it comes inside this distance of the head, and comes down outside the second (m). */
const RAISE = 0.28;
const LOWER = 0.36;
/** The picture is drawn again when the head has turned more than this (radians) or moved more than this (m), and at least every third frame. */
const REDRAW_TURN = 0.004;
const REDRAW_MOVE = 0.003;
const REDRAW_EVERY = 3;
/** Let go, it goes back to its place on the sill over about this long (s). */
const HOME_RATE = 8;
/** Seconds the view rests on the week's place before Tocco names it. */
const SPOT_SECONDS = 0.6;
/** How near the view's middle must come to the empty frame (radians), and through which weeks the mark can be found. */
const MARK_ANGLE = 0.05;
const MARK_LAST_WEEK = 10;

/**
 * The spyglass (META_VR_DINAMIKLER.md item 9). Lifted toward the face, it
 * settles at the eye by itself while the hand is still about 28 cm from the
 * head, so it never has to come near the face; the town then shows about
 * twice as near inside a round view in the middle of sight, while the rest
 * stays as it was. The view's picture is drawn, small, only while the
 * spyglass is up, and only again when the head turns or every third frame;
 * its shaders are built when the session starts, not on the first raise. On a morning whose prices
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
  private marking = 0;
  private spottedWeek = -1;
  private readonly head = new Vector3();
  private readonly forward = new Vector3();
  private readonly at = new Vector3();
  private readonly turn = new Quaternion();
  private readonly home = new Vector3(SPYGLASS_REST.x, SPYGLASS_REST.y, SPYGLASS_REST.z);
  private readonly homeTurn = new Quaternion().setFromEuler(new Euler(0, SPYGLASS_YAW, 0));
  private readonly hand = new Vector3();
  private readonly drawnAt = new Vector3();
  private readonly drawnTurn = new Quaternion();
  private sinceDrawn = REDRAW_EVERY;
  private warmed = false;

  init(): void {
    this.target = new WebGLRenderTarget(PICTURE, PICTURE, { type: HalfFloatType, generateMipmaps: false, depthBuffer: true });
    this.eye = new PerspectiveCamera(((2 * VIEW_ANGLE) / ZOOM) * (180 / Math.PI), 1, NEAR, 2000);
    this.view = createSpyglassView(this.target.texture);
    this.player.head.add(this.view);
    this.cleanupFuncs.push(
      () => {
        this.view.removeFromParent();
        this.target.dispose();
      },
      onSignal('restart', () => this.restart()),
    );
  }

  /** The season starts over from the start page: no week's prices found in the street yet, so each week can be found again. */
  restart(): void {
    this.spottedWeek = -1;
    this.spotting = 0;
  }

  update(delta: number): void {
    this.warm();
    let glass: Entity | null = null;
    for (const entity of this.queries.glass.entities) glass = entity;
    const object = glass?.object3D;
    if (glass == null || object == null) return;
    const held = glass.hasComponent(Grabbed);
    this.player.head.getWorldPosition(this.head);
    if (held) {
      // How far the holding hand is from the head (the spyglass itself, if the hand is not known).
      const side = this.world.getSystem(GrabSystem)?.getHolderHand(glass) ?? null;
      if (side != null) this.player.gripSpaces[side].getWorldPosition(this.hand);
      else object.getWorldPosition(this.hand);
      const near = this.hand.distanceTo(this.head);
      // While up, the spyglass itself is hidden; the hand coming away from the face lowers it.
      if (!this.raised && object.visible && near < RAISE) this.raise(object, true);
      else if (this.raised && near > LOWER) this.raise(object, false);
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
    this.findMark(delta);
  }

  /** The view resting on the empty frame over the square: the mark on it, the same as the globe's. Once a season, whatever the hour. */
  private findMark(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    if (n < 2 || n > MARK_LAST_WEEK || markSeen() || solidarityOf(n) != null) {
      this.marking = 0;
      return;
    }
    this.forward.set(0, 0, -1).applyQuaternion(this.turn);
    this.at.set(FRAME_MIDDLE[0], FRAME_MIDDLE[1], FRAME_MIDDLE[2]).sub(this.head).normalize();
    this.marking = this.forward.angleTo(this.at) < MARK_ANGLE ? this.marking + delta : 0;
    if (this.marking >= SPOT_SECONDS) {
      this.marking = 0;
      noteMarkSeen();
      emitSignal('marked');
      if (import.meta.env.DEV) console.info('[spyglass] the mark on the frame found in week', n);
    }
  }

  private raise(object: Object3D, up: boolean): void {
    this.raised = up;
    this.view.visible = up;
    object.visible = !up;
    if (up) {
      this.sinceDrawn = REDRAW_EVERY;
      emitSignal('spy');
    }
  }

  /**
   * Once the headset session starts: builds the shaders the view's picture
   * needs (drawn into a small target, so they differ from the eyes' own),
   * asynchronously, so the first raise does not stall a frame.
   */
  private warm(): void {
    if (this.warmed || !this.renderer.xr.isPresenting) return;
    this.warmed = true;
    const renderer = this.renderer;
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    void renderer.compileAsync(this.world.scene, this.eye);
    renderer.setRenderTarget(before);
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
    this.player.head.getWorldQuaternion(this.turn);
    // A still head keeps last frame's picture (the square's movement still updates every third frame).
    this.sinceDrawn += 1;
    const turned = this.turn.angleTo(this.drawnTurn) > REDRAW_TURN || this.head.distanceTo(this.drawnAt) > REDRAW_MOVE;
    if (!turned && this.sinceDrawn < REDRAW_EVERY) return;
    this.sinceDrawn = 0;
    this.drawnTurn.copy(this.turn);
    this.drawnAt.copy(this.head);
    camera.position.copy(this.head);
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
    // A new season starts the weeks again from 1: what was found last season can be found again.
    if (n < this.spottedWeek) this.spottedWeek = -1;
    if (place == null || real == null || shownLevel(real, currentTown()) === 0 || this.spottedWeek === n || solidarityOf(n) != null || week.getValue(Week, 'phase') !== Phase.Morning) {
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
