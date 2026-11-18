import { Box3, createSystem, Matrix4, type Object3D, OneHandGrabbable, Quaternion, Vector3 } from '@iwsdk/core';
import { PathHandle } from '../v2/components.js';
import { deskMode } from '../v2/desk-hands.js';
import { featherHeld, listenerObject } from '../v2/parrot-system.js';
import { v2Targets } from '../v2/step-targets.js';

/**
 * The desktop emulator's hands, played with the mouse (dev only, in IWER
 * only; registered by v2/register.ts). Out of the box the emulator's Play
 * mode keeps both hands fixed in front of the view, so nothing between them
 * or beside them can be reached. Here, instead:
 * - the hand sits under the mouse pointer, an arm's reach into the view
 *   (the wheel moves it nearer and farther), pointing where the pointer
 *   points, so far things are picked by pointing at them;
 * - near something that can be taken (a feather, an orb, a handle, the ear
 *   a feather goes to), it settles onto it, so a click takes it;
 * - a short click on something near takes it and keeps hold of it until
 *   the next click (and a feather taken so is carried to the ear that is
 *   waiting for it, by itself); a long press holds only while pressed (the wheel then
 *   brings what is held nearer or farther); Shift plays the left
 *   hand; the pointer at an edge of the view turns the head that way (also
 *   while something is held, so it can be carried out of view), and
 *   dragging with the right button looks round;
 * - a scene can ask for both hands at once (v2/desk-hands.ts).
 * It writes to the emulator's device only after the mouse has moved, and
 * lets go again when the mouse has been still for a while, so remote
 * control (tests) is left alone.
 */

interface Vec3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
}
interface QuatLike {
  set(x: number, y: number, z: number, w: number): unknown;
}
interface EmulatedHand {
  /** The hand's pointing ray, as the app is given it (the player's space). */
  quaternion: { x: number; y: number; z: number; w: number };
  /** The wrist's rotation for the hand as shown now (the player's space). */
  wristRotation(out?: Float32Array): Float32Array;
  setPin(pin: { anchor: 'grasp' | 'index-tip' | 'target-ray'; target: Float32Array; wristRotation?: Float32Array; graspPinch?: number } | null): void;
  updatePinchValue(value: number): void;
}
interface EmulatedDevice {
  primaryInputMode: 'controller' | 'hand';
  position: Vec3Like;
  quaternion: QuatLike;
  hands: { left: EmulatedHand; right: EmulatedHand };
  /** Holds the app's canvas and, over it, the emulator's own drawing of gizmos and its panels. */
  canvasContainer?: HTMLElement;
}

function emulator(): EmulatedDevice | null {
  return (window as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE ?? null;
}

type Side = 'left' | 'right';

/** An arm's reach into the view, and how far the wheel can take it (m). */
const REACH = 0.42;
const NEAREST = 0.1;
const FARTHEST = 0.8;
/** The hand settles onto something that can be taken when the pointer's line passes this near it (m), within this far of the eye. */
const SETTLE = 0.09;
const SETTLE_WITHIN = 1.0;
/** The idle hand's place from the eye: to its side, down, a little ahead (m). */
const IDLE = { side: 0.24, down: 0.36, ahead: 0.28 } as const;
/** Both hands at once: half their distance apart, and where they hold from the eye (m). */
const HALF_APART = 0.25;
const HOLD = { down: 0.3, ahead: 0.38 } as const;
/** The mouse at the screen's edge tilts a held pole this far (degrees), moves held handles this far (m), pushes held ropes this far (m). */
const POLE_TILT = 24;
const HANDLE_TRAVEL = 0.2;
const ROPE_TRAVEL = 0.28;
/** With the mouse still this long, the hands are left to whoever else moves them (s). */
const LET_GO_AFTER = 20;
/** How quickly the hand follows the pointer (per second). */
const FOLLOW = 18;
/** The pointer this near an edge of the view (of 1) turns the head, up to this fast (radians/s). */
const EDGE = 0.84;
const EDGE_TURN = 0.7;
/** While a feather is held, the head turns by itself to bring the ear it goes to into view: this fast (radians/s), until it is this near the middle (radians). */
const SEEK_TURN = 1.1;
const SEEK_WITHIN = 0.3;

export class DeskHandsSystem extends createSystem({
  grabs: { required: [OneHandGrabbable] },
  handles: { required: [PathHandle] },
}) {
  private pointer = { x: 0, y: 0 };
  private still = Infinity;
  private pinching = false;
  private left = false;
  private looking = false;
  private yaw = 0;
  private pitch = 0;
  private reach = REACH;
  private readonly eye = new Vector3();
  private readonly dir = new Vector3();
  private readonly aim = new Vector3();
  private readonly at = new Vector3();
  private readonly best = new Vector3();
  private readonly flat = new Quaternion();
  private readonly turn = new Quaternion();
  private readonly inverse = new Quaternion();
  private readonly look = new Matrix4();
  private readonly up = new Vector3(0, 1, 0);
  private readonly origin = new Vector3();
  private readonly held: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };
  private readonly target = new Float32Array(3);
  private readonly wrist = new Float32Array(4);
  private readonly box = new Box3();
  private readonly ray = new Quaternion();
  private readonly rayToWrist = new Quaternion();
  private readonly wristNow = new Float32Array(4);
  private pinned = false;
  private wasPinching = false;
  private heldReach = REACH;
  private byTip = false;
  private readonly keys = new Set<string>();
  private arrows: Record<string, [number, number]> = {};
  private sticky = false;
  private carry = 0;
  private releaseOnUp = false;
  private downAt = 0;

  init(): void {
    const canvas = this.renderer.domElement;
    const inside = (event: MouseEvent): boolean => {
      const r = canvas.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    };
    window.addEventListener(
      'mousemove',
      (event) => {
        if (!event.isTrusted || document.pointerLockElement != null) return;
        const r = canvas.getBoundingClientRect();
        if (this.looking) {
          this.yaw -= event.movementX * 0.004;
          this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - event.movementY * 0.004));
        } else {
          this.pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
          this.pointer.y = 1 - ((event.clientY - r.top) / r.height) * 2;
        }
        this.left = event.shiftKey;
        this.still = 0;
      },
      true,
    );
    window.addEventListener(
      'mousedown',
      (event) => {
        if (!event.isTrusted || !inside(event) || !this.renderer.xr.isPresenting) return;
        if (event.button === 0) {
          // A second click lets go of what a first, short click took.
          if (this.sticky) this.releaseOnUp = true;
          this.pinching = true;
          this.downAt = performance.now();
        }
        if (event.button === 2) this.looking = true;
        this.still = 0;
      },
      true,
    );
    window.addEventListener(
      'mouseup',
      (event) => {
        if (!event.isTrusted) return;
        if (event.button === 0) {
          // A short click on something near takes it and keeps hold (no need to keep the button down); a long press holds only while pressed.
          const short = performance.now() - this.downAt < 350;
          if (this.releaseOnUp) {
            this.sticky = false;
            this.releaseOnUp = false;
            this.pinching = false;
          } else if (short && this.byTip && deskMode() === 'one') this.sticky = true;
          else this.pinching = false;
        }
        if (event.button === 2) this.looking = false;
      },
      true,
    );
    // The arrow keys look round too.
    const arrows: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    window.addEventListener(
      'keydown',
      (event) => {
        const turn = arrows[event.code];
        if (turn == null || !this.renderer.xr.isPresenting) return;
        event.preventDefault();
        this.keys.add(event.code);
        this.still = 0;
      },
      true,
    );
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), true);
    this.arrows = arrows;
    window.addEventListener('contextmenu', (event) => {
      if (inside(event) && this.renderer.xr.isPresenting) event.preventDefault();
    });
    window.addEventListener(
      'wheel',
      (event) => {
        if (!inside(event) || !this.renderer.xr.isPresenting) return;
        // With something held, the wheel brings it nearer or pushes it away (an orb is opened by bringing it to the face).
        if (this.pinching) this.heldReach = Math.max(NEAREST, Math.min(FARTHEST, this.heldReach - event.deltaY * 0.0006));
        else this.reach = Math.max(NEAREST, Math.min(FARTHEST, this.reach - event.deltaY * 0.0006));
        this.still = 0;
      },
      { passive: true },
    );
    if (import.meta.env.DEV) console.info('[desk hands] the mouse plays the hands: move to carry, click to pinch, Shift for the left hand, right-drag to look, wheel for reach');
  }

  update(delta: number): void {
    const device = emulator();
    if (device == null || !this.renderer.xr.isPresenting) return;
    this.still += delta;
    if (this.still > LET_GO_AFTER) {
      if (this.pinned) {
        device.hands.left.setPin(null);
        device.hands.right.setPin(null);
        this.pinned = false;
        this.gizmos(device, true);
      }
      return;
    }
    if (!this.pinned) this.gizmos(device, false);
    if (device.primaryInputMode !== 'hand') device.primaryInputMode = 'hand';
    // The pointer at an edge turns the head that way; one hand's play only (both hands use the whole view).
    if (deskMode() === 'one' && !this.looking) {
      const over = (v: number) => Math.sign(v) * Math.max(0, (Math.abs(v) - EDGE) / (1 - EDGE));
      this.yaw -= over(this.pointer.x) * EDGE_TURN * delta;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + over(this.pointer.y) * EDGE_TURN * 0.7 * delta));
    }
    for (const code of this.keys) {
      const turn = this.arrows[code];
      if (turn == null) continue;
      this.yaw += turn[0] * 1.2 * delta;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + turn[1] * 0.9 * delta));
      this.still = 0;
    }
    // Holding something that has somewhere to go (a feather, and an ear for it): the head turns to bring that place into view.
    const goal = this.pinching && this.wasPinching && deskMode() === 'one' && featherHeld() ? listenerObject() : null;
    if (goal != null) {
      goal.getWorldPosition(this.best);
      this.player.worldToLocal(this.best);
      const want = Math.atan2(-(this.best.x - device.position.x), -(this.best.z - device.position.z));
      let off = want - this.yaw;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) > SEEK_WITHIN) this.yaw += Math.sign(off) * Math.min(Math.abs(off) - SEEK_WITHIN, SEEK_TURN * delta);
      // And up or down to it.
      const rise = Math.atan2(this.best.y - device.position.y, Math.hypot(this.best.x - device.position.x, this.best.z - device.position.z));
      const tip = rise - this.pitch;
      if (Math.abs(tip) > SEEK_WITHIN) this.pitch += Math.sign(tip) * Math.min(Math.abs(tip) - SEEK_WITHIN, SEEK_TURN * delta);
    }
    // The head: where the edges and the right-drag have turned it.
    this.turn.setFromAxisAngle(this.up, this.yaw);
    this.flat.setFromAxisAngle(this.aim.set(1, 0, 0), this.pitch);
    this.turn.multiply(this.flat);
    device.quaternion.set(this.turn.x, this.turn.y, this.turn.z, this.turn.w);

    // The pointer's line into the world, from the eye the emulator draws.
    const view = this.renderer.xr.getCamera().cameras[0] ?? this.camera;
    view.getWorldPosition(this.eye);
    this.dir.set(this.pointer.x, this.pointer.y, 0.5).unproject(view).sub(this.eye).normalize();
    // The emulator's eye is given in the player's own space: out into the world, where the things to take are.
    this.eye.applyMatrix4(this.player.matrixWorld);
    this.dir.transformDirection(this.player.matrixWorld);
    this.player.getWorldQuaternion(this.inverse).invert();
    this.player.head.getWorldPosition(this.origin);
    // The head's heading only (no pitch), for where held and idle hands sit.
    this.player.head.getWorldQuaternion(this.flat);
    this.aim.set(0, 0, -1).applyQuaternion(this.flat).setY(0);
    if (this.aim.lengthSq() < 1e-6) this.aim.set(0, 0, -1);
    this.flat.setFromUnitVectors(this.at.set(0, 0, -1), this.aim.normalize());

    const mode = deskMode();
    if (mode === 'one') {
      const side: Side = this.left ? 'left' : 'right';
      const other: Side = this.left ? 'right' : 'left';
      // While something is held, the hand stays at the depth it was taken at (a handle slides, a feather is carried), and settles only onto where things are taken to.
      this.at.copy(this.eye).addScaledVector(this.dir, this.pinching && this.wasPinching ? this.heldReach : this.reach);
      const along = this.settle(this.at, this.pinching && this.wasPinching);
      if (this.pinching && !this.wasPinching) this.heldReach = along > 0 ? along : this.reach;
      // A word feather taken with a click, while there is an ear for it: the hand carries it there by itself and lets go. Anything else (a rope, a lever, an orb) stays in the hand until the second click.
      const to = this.sticky && featherHeld() ? listenerObject() : null;
      if (to != null) {
        this.carry += delta;
        if (this.carry > 0.35) to.getWorldPosition(this.at);
        if (this.carry > 1.3) {
          this.sticky = false;
          this.pinching = false;
          this.carry = 0;
        }
      } else this.carry = 0;
      // On something near, the fingertip is on it. Pointing at something far, the hand's ray itself starts on the pointer's line, so what is under the pointer is what the ray hits, at any distance.
      if (!(this.pinching && this.wasPinching)) this.byTip = along > 0;
      this.wasPinching = this.pinching;
      this.place(device, side, this.at, this.dir, delta, this.pinching ? 1 : 0, this.byTip ? 'index-tip' : 'target-ray');
      this.at.set((other === 'left' ? -1 : 1) * IDLE.side, -IDLE.down, -IDLE.ahead).applyQuaternion(this.flat).add(this.origin);
      this.place(device, other, this.at, this.aim, delta, 0);
    } else {
      // Both hands, held from the chest (a pole, two handles) or the shoulders (two ropes).
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'left' ? -1 : 1;
        let x = sign * HALF_APART;
        let y = -HOLD.down;
        let z = -HOLD.ahead;
        let pinch = 1;
        if (mode === 'pole') {
          // The mouse to the right dips the right end.
          y -= sign * HALF_APART * Math.tan((Math.max(-1, Math.min(1, this.pointer.x * 1.4)) * POLE_TILT * Math.PI) / 180);
        } else if (mode === 'handles') {
          x += this.pointer.x * HANDLE_TRAVEL;
          y += this.pointer.y * HANDLE_TRAVEL;
          pinch = this.pinching ? 0 : 1;
        } else if (mode === 'arms') {
          x = sign * (0.15 + ((this.pointer.y + 1) / 2) * 0.25);
          y = -0.2;
          z = -0.35;
          pinch = 0;
        } else {
          y = -0.12;
          z = -0.3 - this.pointer.y * ROPE_TRAVEL;
          pinch = this.pinching ? 0 : 1;
        }
        this.at.set(x, y, z).applyQuaternion(this.flat).add(this.origin);
        this.place(device, side, this.at, this.aim, delta, pinch);
      }
    }
    this.pinned = true;
  }

  /** The emulator draws arrows and rings on each hand for dragging it about, and panels for its hands and controllers: in the way while the mouse plays the hands. */
  private gizmos(device: EmulatedDevice, shown: boolean): void {
    for (const child of device.canvasContainer?.children ?? []) {
      if (child instanceof HTMLElement && child !== this.renderer.domElement) child.style.visibility = shown ? '' : 'hidden';
    }
  }

  /** Move a point at the pointer onto the nearest thing that can be taken, if the pointer's line passes close to one within reach. */
  private settle(point: Vector3, holding = false): number {
    let nearest = SETTLE;
    let found = -1;
    const consider = (object: Object3D | null | undefined, grip?: Vector3, middle = false): void => {
      if (object == null || !object.visible) return;
      if (grip != null) object.localToWorld(this.best.copy(grip));
      else if (middle) this.box.setFromObject(object).getCenter(this.best);
      else object.getWorldPosition(this.best);
      const along = this.best.clone().sub(this.eye).dot(this.dir);
      if (along < 0.1 || along > SETTLE_WITHIN) return;
      const off = this.best.clone().sub(this.eye).addScaledVector(this.dir, -along).length();
      if (off >= nearest) return;
      nearest = off;
      found = along;
      point.copy(this.best);
    };
    for (const object of v2Targets()) consider(object);
    consider(listenerObject());
    if (holding) return found;
    // A thing to grab is taken at its middle (a feather's origin is at its quill's end).
    for (const entity of this.queries.grabs.entities) consider(entity.object3D, undefined, true);
    for (const entity of this.queries.handles.entities) {
      const grip = entity.getVectorView(PathHandle, 'grip');
      consider(entity.object3D, this.aim.clone().set(grip[0], grip[1], grip[2]));
    }
    return found;
  }

  /** Bring a hand's pinch point toward a place in the world, its fingers along `fingers`, and set how far it is closed. */
  private place(device: EmulatedDevice, side: Side, world: Vector3, fingers: Vector3, delta: number, pinch: number, anchor: 'index-tip' | 'target-ray' = 'index-tip'): void {
    const held = this.held[side];
    if (!this.pinned) held.copy(world);
    held.lerp(world, Math.min(1, delta * FOLLOW));
    // The emulator's own space is the player's.
    this.best.copy(held);
    this.player.worldToLocal(this.best);
    this.target[0] = this.best.x;
    this.target[1] = this.best.y;
    this.target[2] = this.best.z;
    this.best.copy(fingers).applyQuaternion(this.inverse);
    this.look.lookAt(this.at.set(0, 0, 0), this.best, this.up);
    this.turn.setFromRotationMatrix(this.look);
    // The emulator's pointing ray is not along its wrist: turn the wrist by what lies between the two now, so the ray the app reads is the one wanted.
    const hand = device.hands[side];
    const now = hand.wristRotation(this.wristNow);
    this.ray.set(hand.quaternion.x, hand.quaternion.y, hand.quaternion.z, hand.quaternion.w).invert();
    this.turn.multiply(this.ray).multiply(this.rayToWrist.set(now[0], now[1], now[2], now[3])).normalize();
    this.wrist[0] = this.turn.x;
    this.wrist[1] = this.turn.y;
    this.wrist[2] = this.turn.z;
    this.wrist[3] = this.turn.w;
    device.hands[side].setPin({ anchor, target: this.target, wristRotation: this.wrist });
    device.hands[side].updatePinchValue(pinch);
  }
}
