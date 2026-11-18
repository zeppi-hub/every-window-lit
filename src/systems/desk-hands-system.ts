import { Box3, createSystem, Euler, Matrix4, type Object3D, OneHandGrabbable, Quaternion, Vector3 } from '@iwsdk/core';
import { PathHandle } from '../v2/components.js';
import { deskCarry, deskLine, deskLook, deskMode, deskPump, deskRecentres } from '../v2/desk-hands.js';
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
 * control (tests) is left alone; F9 switches it off and on
 * (a test running in a window the real mouse may cross).
 */

interface Vec3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
}
interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
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
  /**
   * 'manual': the emulator's own panel sets the head every frame from its camera (so a head pose written here is lost);
   * 'programmatic': the device is driven from outside, and the panel follows it when told of a change.
   */
  controlMode?: 'manual' | 'programmatic';
  notifyStateChange?(): void;
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
/** In 'bail' the bucket hand rides the mouse: this far up and down, sideways, and away over the rail when lifted (m). */
const BAIL = { up: 0.27, side: 0.16, away: 0.12 } as const;
/** With the mouse still this long, the hands are left to whoever else moves them (s). */
const LET_GO_AFTER = 20;
/** How quickly the hand follows the pointer (per second). */
const FOLLOW = 18;
/** The pointer this near an edge of the window (of 1: the outer fifth) turns the head, up to this fast (radians/s), felt as soon as it is in the band. */
const EDGE = 0.6;
const EDGE_TURN = 1.5;
/** How long the pointer must stay in the top or bottom band before the head tips (s): a pointer crossing it on its way out does not. */
const EDGE_DWELL = 0.25;
/** How long the head keeps turning after the pointer leaves past a side edge (s). */
const OUT_TURN = 1.5;
/** While a feather is held, the head turns by itself to bring the ear it goes to into view: this fast (radians/s), until it is this near the middle (radians). */
const SEEK_TURN = 1.1;
const SEEK_WITHIN = 0.3;
/** The pump's jug, fetched by a click: seconds until the hand is on it, has closed, is over the cup, and lets go at the latest (sooner once it has poured). */
const JUG = { reach: 0.4, grip: 0.65, carry: 1.45, hold: 4.2, release: 0.25 } as const;
/** Where each errand of the pump's mouse changes what its hand does (s): the jug's fetch, the sluice lever's throw (closed from 0.15 to 0.68, across from 0.3 to 0.6, done at 0.75), the valve's slap. */
const JUG_EDGES = [JUG.reach, JUG.grip, JUG.carry, JUG.hold, JUG.hold + JUG.release];
const SLUICE_EDGES = [0.15, 0.3, 0.6, 0.68, 0.75];
const VALVE_EDGES = [0.5];

export class DeskHandsSystem extends createSystem({
  grabs: { required: [OneHandGrabbable] },
  handles: { required: [PathHandle] },
}) {
  private pointer = { x: 0, y: 0 };
  /** The pointer on the window the player sees (-1..1 each way): the edges that turn the head are the window's, wherever the canvas reaches beyond it. */
  private screen = { x: 0, y: 0 };
  /** How long the pointer has stayed in the top or bottom band (s). */
  private edgeFor = 0;
  /** When a turn begun by leaving past a side edge stops (performance.now(), ms; 0 none). */
  private outUntil = 0;
  private still = Infinity;
  /** When the view was last turned by the edges or the arrow keys (ms): turns go by the clock, so a slow page turns as far as a fast one. */
  private turnedAt = 0;
  private pinching = false;
  /** The left button itself, down now (a click that keeps hold leaves `pinching` on after it). */
  private down = false;
  /** Switched off with F9, for tests that move the emulator's hands themselves. */
  private off = false;
  private pumpLogAt = 0;
  private sized = false;
  /** In the pump's play: the last frame's button, what the right hand has gone off to do, and which end the sluice lever stood at when it set off. */
  private wasDown = false;
  /** When the left button last went down (ms; 0 once the pump's play has used it): a click begun and ended between two slow frames is still a click. */
  private pressedAt = 0;
  private errand: { kind: 'valve' | 'sluice' | 'jug'; t: number; side: Side } | null = null;
  private readonly jugFrom = new Vector3();
  private readonly jugTo = new Vector3();
  private sluiceAt = 0;
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
  /** Whether these hands took the device from the emulator's panel (and so give it back when they let go). */
  private took = false;
  /** Dev only: when the head was last written to the log (ms). */
  private loggedAt = 0;
  /** The last new seat seen (desk-hands.ts recentreDeskHead). */
  private recentred = 0;
  /** A new seat since the mouse last took the head: take it facing ahead, not from the heading drawn. */
  private fresh = false;
  private readonly seen = new Euler(0, 0, 0, 'YXZ');
  private readonly seenQ = new Quaternion();
  private wasPinching = false;
  private heldReach = REACH;
  private byTip = false;
  private readonly keys = new Set<string>();
  private arrows: Record<string, [number, number]> = {};
  private sticky = false;
  private carry = 0;
  private releaseOnUp = false;
  private downAt = 0;
  /** 'haul': where the mouse was along the line last frame, and whether the hands are closed on it. */
  private hauled = 0;
  private hauling = false;
  private readonly pullAt = new Vector3();
  private readonly pullWay = new Vector3();

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
        if (import.meta.env.DEV && !this.sized) {
          // Once, for tests that place the pointer by pixels: the view's size on the page.
          this.sized = true;
          console.info(`[desk hands] view ${Math.round(r.width)} x ${Math.round(r.height)} at ${Math.round(r.left)}, ${Math.round(r.top)}`);
        }
        if (this.looking) {
          this.yaw -= event.movementX * 0.004;
          this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - event.movementY * 0.004));
        } else {
          this.pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
          this.pointer.y = 1 - ((event.clientY - r.top) / r.height) * 2;
          // The visible part of the canvas: the canvas can be drawn larger than the window, its edges out of sight.
          const left = Math.max(r.left, 0);
          const right = Math.min(r.right, window.innerWidth);
          const top = Math.max(r.top, 0);
          const bottom = Math.min(r.bottom, window.innerHeight);
          this.screen.x = right > left ? ((event.clientX - left) / (right - left)) * 2 - 1 : 0;
          this.screen.y = bottom > top ? 1 - ((event.clientY - top) / (bottom - top)) * 2 : 0;
        }
        this.left = event.shiftKey;
        this.outUntil = 0;
        this.still = 0;
      },
      true,
    );
    // The pointer gone from the page. Out past the left or right edge: the head keeps turning that way for a moment (the hand
    // carries the mouse on past the edge to look round), until the pointer comes back, the window loses focus, or OUT_TURN runs out.
    // Out past the top or bottom (where the chat and the window's bars are), or the window left for another, or the page hidden: no
    // edge turns the head any more. Without this the last place seen, in the band as the pointer crossed it, kept turning the head.
    const away = (): void => {
      this.screen.x = 0;
      this.screen.y = 0;
      this.outUntil = 0;
      this.looking = false;
    };
    const left = (): void => {
      if (Math.abs(this.screen.x) > EDGE && Math.abs(this.screen.x) >= Math.abs(this.screen.y)) {
        this.screen.x = Math.sign(this.screen.x);
        this.screen.y = 0;
        this.outUntil = performance.now() + OUT_TURN * 1000;
        this.looking = false;
      } else away();
    };
    document.addEventListener('mouseleave', left);
    window.addEventListener('mouseout', (event) => {
      if (event.relatedTarget == null) left();
    });
    window.addEventListener('blur', away);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) away();
    });
    window.addEventListener(
      'mousedown',
      (event) => {
        if (!event.isTrusted || !inside(event) || !this.renderer.xr.isPresenting) return;
        if (event.button === 0) {
          // A second click lets go of what a first, short click took.
          if (this.sticky) this.releaseOnUp = true;
          this.pinching = true;
          this.down = true;
          this.pressedAt = performance.now();
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
          this.down = false;
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
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code !== 'F9') return;
        this.off = !this.off;
        console.info(`[desk hands] ${this.off ? 'off: the hands are left to remote control' : 'on'}`);
      },
      true,
    );
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
    // A new seat: the head looks straight ahead, level (and the mouse, when it next takes the head, starts from there).
    const seats = deskRecentres();
    if (seats !== this.recentred) {
      this.recentred = seats;
      this.yaw = 0;
      this.pitch = 0;
      this.fresh = !this.took;
    }
    this.still += delta;
    if (this.off) this.still = Infinity;
    if (this.still > LET_GO_AFTER) {
      if (this.pinned) {
        device.hands.left.setPin(null);
        device.hands.right.setPin(null);
        this.pinned = false;
        this.gizmos(device, true);
      }
      this.giveBack(device);
      return;
    }
    this.take(device);
    if (!this.pinned) this.gizmos(device, false);
    if (device.primaryInputMode !== 'hand') device.primaryInputMode = 'hand';
    // Turns go by the clock, not by the frame: on a page drawing a few frames a second (a busy machine, a pane half hidden) an arrow held 1.5 s still turns as far (a long stall is not made up at once).
    const now = performance.now();
    const turnFor = this.turnedAt === 0 ? delta : Math.min(0.25, Math.max(delta, (now - this.turnedAt) / 1000));
    this.turnedAt = now;
    // The pointer at an edge turns the head that way; one hand's play only (both hands use the whole view).
    if (deskMode() === 'one' && !this.looking) {
      // Felt at once in the band (a third of full speed at its inner line), full speed at the very edge.
      const over = (v: number) => (Math.abs(v) <= EDGE ? 0 : Math.sign(v) * (0.35 + 0.65 * Math.min(1, (Math.abs(v) - EDGE) / (1 - EDGE))));
      // A turn begun by leaving past a side edge runs out after OUT_TURN.
      if (this.outUntil > 0 && now > this.outUntil) {
        this.outUntil = 0;
        this.screen.x = 0;
      }
      // The sides turn at once. The top and bottom only once the pointer has stayed in their band: one passing through on its way out does not tip the head.
      this.yaw -= over(this.screen.x) * EDGE_TURN * turnFor;
      this.edgeFor = Math.abs(this.screen.y) > EDGE ? this.edgeFor + turnFor : 0;
      if (this.edgeFor > EDGE_DWELL) this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + over(this.screen.y) * EDGE_TURN * 0.7 * turnFor));
    }
    for (const code of this.keys) {
      const turn = this.arrows[code];
      if (turn == null) continue;
      this.yaw += turn[0] * 1.2 * turnFor;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + turn[1] * 0.9 * turnFor));
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
    // Both hands on a pump: the head comes back round to it and level (its jug was taken near the view's edge, which turned the head away, and the edges do not turn it while both hands work).
    const bar = deskMode() === 'pump' && !this.looking ? deskPump() : null;
    if (bar != null) {
      this.best.set(bar.up[0], bar.up[1], bar.up[2]);
      this.player.worldToLocal(this.best);
      let want = Math.atan2(-(this.best.x - device.position.x), -(this.best.z - device.position.z));
      let tip = 0;
      if (bar.jug != null) {
        // Dry: a third of the way round to its jug and a little down, so the jug waiting beside the pump is in a narrow window's view too.
        this.best.set(bar.jug.at[0], bar.jug.at[1], bar.jug.at[2]);
        this.player.worldToLocal(this.best);
        const to = Math.atan2(-(this.best.x - device.position.x), -(this.best.z - device.position.z)) - want;
        want += Math.atan2(Math.sin(to), Math.cos(to)) * 0.35;
        tip = -0.12;
      }
      let off = want - this.yaw;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      this.yaw += Math.sign(off) * Math.min(Math.abs(off), SEEK_TURN * delta);
      this.pitch += Math.sign(tip - this.pitch) * Math.min(Math.abs(tip - this.pitch), SEEK_TURN * delta);
    }
    // The head: where the edges and the right-drag have turned it.
    this.turn.setFromAxisAngle(this.up, this.yaw);
    this.flat.setFromAxisAngle(this.aim.set(1, 0, 0), this.pitch + deskLook());
    this.turn.multiply(this.flat);
    device.quaternion.set(this.turn.x, this.turn.y, this.turn.z, this.turn.w);
    if (import.meta.env.DEV && Math.floor(now / 3000) !== Math.floor(this.loggedAt / 3000)) {
      this.loggedAt = now;
      console.info(`[desk hands] head yaw ${((this.yaw * 180) / Math.PI).toFixed(0)} pitch ${((this.pitch * 180) / Math.PI).toFixed(0)} look ${((deskLook() * 180) / Math.PI).toFixed(0)} mode ${device.controlMode ?? '-'}${this.took ? ' (taken)' : ''} ${deskMode()}`);
    }
    // The emulator's panel is told, so its camera follows the head instead of setting it back.
    if (this.took) device.notifyStateChange?.();

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
      // A scene may also name one place where the thing it wants taken is carried the same way (the pump's cup for its jug).
      const to = this.sticky && featherHeld() ? listenerObject() : null;
      const spot = this.sticky && to == null ? deskCarry() : null;
      if (to != null || spot != null) {
        this.carry += delta;
        if (this.carry > 0.35) {
          if (to != null) to.getWorldPosition(this.at);
          else if (spot != null) this.at.set(spot[0], spot[1], spot[2]);
        }
        if (this.carry > (to != null ? 1.3 : 2.1)) {
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
    } else if (mode === 'pump') {
      // Both hands on the pump's bar, up and down with the mouse. A click sends a hand off for a moment, the other pumping on: while the pump is dry,
      // the hand on the jug's side fetches it and pours it into the cup; else the right hand goes to the blown valve (it is slapped shut), else to the sluice lever, which it throws to its other side.
      const pump = deskPump();
      if (pump != null) {
        // The bar's whole swing is the middle third of the view's height: a stroke is a comfortable sweep of the mouse, not the whole screen.
        const t = Math.max(0, Math.min(1, 0.5 - this.pointer.y * 1.43));
        // A click is the button going down, whenever that was since the last frame (not the button being seen down on a frame).
        const clicked = this.pressedAt !== 0 && performance.now() - this.pressedAt < 600;
        if (clicked) this.pressedAt = 0;
        if (clicked && this.errand == null) {
          if (pump.jug != null) {
            this.jugFrom.set(pump.jug.at[0], pump.jug.at[1], pump.jug.at[2]);
            this.jugTo.set(pump.jug.cup[0], pump.jug.cup[1], pump.jug.cup[2]);
            // The hand on the jug's side of the bar goes for it.
            const rightward = this.best.set(1, 0, 0).applyQuaternion(this.flat).dot(this.at.copy(this.jugFrom).sub(this.aim.set(pump.up[0], pump.up[1], pump.up[2])));
            this.aim.set(0, 0, -1).applyQuaternion(this.flat);
            this.errand = { kind: 'jug', t: 0, side: rightward < 0 ? 'left' : 'right' };
            if (import.meta.env.DEV) console.info(`[desk hands] pump: a click, the ${this.errand.side} hand goes for the jug`);
          } else if (pump.valve != null) this.errand = { kind: 'valve', t: 0, side: 'right' };
          else if (pump.sluice != null) {
            this.sluiceAt = pump.fed === 1 ? 1 : 0;
            this.errand = { kind: 'sluice', t: 0, side: 'right' };
          }
        }
        this.wasDown = this.down;
        const errand = this.errand;
        if (errand != null) {
          // By the frame as well as the clock: however slow the frames (a pane half hidden), each part of an errand has a frame at its end and the next has one at its start, so the hand has opened, closed on the thing and let go.
          const edges = errand.kind === 'jug' ? JUG_EDGES : errand.kind === 'sluice' ? SLUICE_EDGES : VALVE_EDGES;
          let edge = edges[edges.length - 1];
          for (const e of edges) {
            if (errand.t < e) {
              edge = e;
              break;
            }
          }
          if (errand.t + delta <= edge) errand.t += delta;
          else errand.t = errand.t < edge - 0.002 ? edge - 0.001 : edge + 0.001;
          if (errand.kind === 'jug') {
            // Poured (the pump has water, so it no longer asks for its jug): let go now.
            if (pump.jug == null && errand.t < JUG.hold) errand.t = JUG.hold;
            if (errand.t > JUG.hold + JUG.release) this.errand = null;
          } else if (errand.t > (errand.kind === 'valve' ? 0.5 : 0.75)) this.errand = null;
        }
        for (const side of ['left', 'right'] as const) {
          let pinch = 1;
          if (errand != null && errand.kind === 'jug' && side === errand.side) {
            // Open to the jug's middle, closed on it, up and over to the cup, held there while it pours, open again.
            const k = Math.max(0, Math.min(1, (errand.t - JUG.grip) / (JUG.carry - JUG.grip)));
            this.at.copy(this.jugFrom).lerp(this.jugTo, k);
            this.at.y += 0.1 * Math.sin(Math.PI * k);
            pinch = errand.t > JUG.reach && errand.t < JUG.hold ? 1 : 0;
          } else if (side === 'right' && errand != null && errand.kind === 'valve' && pump.valve != null) {
            this.at.set(pump.valve[0], pump.valve[1], pump.valve[2]);
            pinch = 0;
          } else if (side === 'right' && errand != null && errand.kind === 'sluice' && pump.sluice != null) {
            // To the knob where it stands, a pinch, across to the other end, let go.
            const from = pump.sluice[this.sluiceAt];
            const to = pump.sluice[1 - this.sluiceAt];
            const k = Math.max(0, Math.min(1, (errand.t - 0.3) / 0.3));
            this.at.set(from[0], from[1], from[2]).lerp(this.best.set(to[0], to[1], to[2]), k);
            pinch = errand.t > 0.15 && errand.t < 0.68 ? 1 : 0;
          } else {
            this.at.set(pump.up[0], pump.up[1], pump.up[2]).lerp(this.best.set(pump.down[0], pump.down[1], pump.down[2]), t);
            this.at.addScaledVector(this.best.set(side === 'left' ? -0.2 : 0.2, 0, 0).applyQuaternion(this.flat), 1);
          }
          this.place(device, side, this.at, this.aim, delta, pinch);
        }
        if (import.meta.env.DEV && performance.now() - this.pumpLogAt > 1000) {
          this.pumpLogAt = performance.now();
          console.info(`[desk hands] pump: pointer ${this.pointer.x.toFixed(2)}, ${this.pointer.y.toFixed(2)}, bar at ${t.toFixed(2)}${errand != null ? `, the right hand to the ${errand.kind}` : ''}`);
        }
      } else if (import.meta.env.DEV && performance.now() - this.pumpLogAt > 2000) {
        this.pumpLogAt = performance.now();
        console.info('[desk hands] pump: no pump given (setDeskPump)');
      }
    } else if (mode === 'haul') {
      // A line hauled hand over hand: the right hand rides the line with the mouse (left to right on the screen is along the
      // line's pull, whichever way that lies), closed while the mouse goes the way of the pull and open as it comes back.
      const l = deskLine();
      this.pullWay.set(l.dx, l.dy, l.dz);
      // Which way the pull lies on the screen: against the head's own right.
      const screen = Math.sign(this.pullWay.dot(this.best.set(1, 0, 0).applyQuaternion(this.flat))) || 1;
      const along = Math.max(0, Math.min(1, (this.pointer.x * screen + 1) / 2));
      // Open only while the mouse is coming back; still, or going the way of the pull, the hand is closed on the line.
      this.hauling = along >= this.hauled - 0.004;
      this.hauled = along;
      this.pullAt.set(l.x, l.y, l.z).addScaledVector(this.pullWay, 0.06 + 0.5 * along);
      this.pullAt.y += 0.04;
      this.place(device, 'right', this.pullAt, this.aim, delta, this.hauling ? 1 : 0);
      this.at.set(-IDLE.side, -IDLE.down, -IDLE.ahead).applyQuaternion(this.flat).add(this.origin);
      this.place(device, 'left', this.at, this.aim, delta, 0);
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
        } else if (mode === 'bail') {
          // The bucket hand rides the mouse: down into the hatch, up and away over the rail. The other waits by the cover; a click closes both afresh.
          if (side === 'right') {
            x = 0.27 + this.pointer.x * BAIL.side;
            y = -0.3 + this.pointer.y * BAIL.up;
            z = -0.42 - Math.max(0, this.pointer.y) * BAIL.away;
          } else {
            x = -0.25;
            y = -0.24;
            z = -0.36;
          }
          pinch = this.pinching ? 0 : 1;
        } else if (mode === 'reach') {
          // In the air, both hands out ahead and open: a click closes them (on a catcher's hands).
          x = sign * 0.18;
          y = 0.02;
          z = -0.45;
          pinch = this.pinching ? 1 : 0;
        } else if (mode === 'slam') {
          // A two-handled driver: lifted above the shoulders, brought down past the knees.
          y = -0.31 + this.pointer.y * 0.31;
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
  /**
   * While the mouse plays, the head is set here: the emulator's panel is put in its
   * programmatic mode, or it would set the head back from its own camera every
   * frame. The turn begins from the heading drawn now, level.
   */
  private take(device: EmulatedDevice): void {
    if (device.controlMode !== 'manual') return;
    const q = device.quaternion;
    this.seen.setFromQuaternion(this.seenQ.set(q.x, q.y, q.z, q.w), 'YXZ');
    // After a new seat the head faces ahead; otherwise it carries on from the heading drawn.
    this.yaw = this.fresh ? 0 : this.seen.y;
    this.fresh = false;
    // Level: a head left looking at the floor (or the sky) is brought back to the horizon when the mouse takes it again.
    this.pitch = 0;
    device.controlMode = 'programmatic';
    this.took = true;
    this.turnedAt = 0;
    if (import.meta.env.DEV) console.info(`[desk hands] the head is played by the mouse (from ${((this.yaw * 180) / Math.PI).toFixed(0)} degrees round)`);
  }

  /** The device back to the emulator's panel, where these hands took it. */
  private giveBack(device: EmulatedDevice): void {
    if (!this.took) return;
    this.took = false;
    if (device.controlMode === 'programmatic') device.controlMode = 'manual';
  }

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
