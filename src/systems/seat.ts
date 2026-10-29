import { createSystem, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { onSignal } from '../signals.js';
import { SEAT_EYE } from '../station/layout.js';

/** Frames to wait after entering XR before trusting the head pose. */
const SETTLE_FRAMES = 10;

type Recenter = 'none' | 'position' | 'full';

/**
 * Puts the seated player's real head on SEAT_EYE, facing the window.
 *
 * The station is authored around a fixed eye point, so instead of moving the
 * scene this system moves the player rig (the XR origin). It runs once the
 * head pose has settled after entering XR and again when the headset's
 * reference space resets (the user long-presses the Meta button); both also
 * turn the rig so the window is straight ahead. Poking the recenter nail only
 * moves the rig: the user is looking down at the nail at that moment, so
 * their head direction says nothing about where "ahead" is.
 */

export class SeatSystem extends createSystem({}) {
  private pending: Recenter = 'none';
  /** Extra full recenters still to run after a reset (the origin may move a frame late). */
  private resetRepeats = 0;
  private framesInXR = 0;
  private referenceSpace: XRReferenceSpace | null = null;
  private forward = new Vector3();
  private offset = new Vector3();
  private yawOnly = new Quaternion();
  private up = new Vector3(0, 1, 0);

  private readonly onReset = () => {
    this.pending = 'full';
    this.resetRepeats = 2;
  };

  init(): void {
    this.cleanupFuncs.push(
      onSignal('recenter', () => {
        if (this.pending === 'none') this.pending = 'position';
      }),
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) {
          this.detachReset();
          this.framesInXR = 0;
          this.pending = 'none';
          this.player.position.set(0, 0, 0);
          this.player.rotation.set(0, 0, 0);
        }
      }),
      () => this.detachReset(),
    );
  }

  update(): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      return;
    }
    if (this.referenceSpace == null) {
      this.attachReset();
    }
    this.framesInXR += 1;
    if (this.framesInXR === SETTLE_FRAMES) {
      this.pending = 'full';
    }
    // A lost or not-yet-tracked head can report NaN or a zero quaternion;
    // keep the request pending and try again on a later frame.
    if (this.pending !== 'none' && this.framesInXR >= SETTLE_FRAMES && this.headPoseValid()) {
      this.recenter(this.pending === 'full');
      if (this.resetRepeats > 0) {
        this.resetRepeats -= 1;
      } else {
        this.pending = 'none';
      }
    }
  }

  private headPoseValid(): boolean {
    const { position: p, quaternion: q } = this.player.head;
    if (!Number.isFinite(p.x + p.y + p.z + q.x + q.y + q.z + q.w)) return false;
    // With no pose yet the head sits at the rig origin with no rotation.
    return q.lengthSq() > 0.5 && p.lengthSq() > 1e-6;
  }

  private recenter(turn: boolean): void {
    // The head's local pose is relative to the player rig. Unlike the camera,
    // which three.js only updates inside render(), it is this frame's pose.
    const head = this.player.head;
    if (turn) {
      this.forward.set(0, 0, -1).applyQuaternion(head.quaternion);
      const yaw = Math.atan2(-this.forward.x, -this.forward.z);
      this.player.rotation.set(0, -yaw, 0);
    }
    this.yawOnly.setFromAxisAngle(this.up, this.player.rotation.y);
    this.offset.copy(head.position).applyQuaternion(this.yawOnly);
    this.player.position.set(
      SEAT_EYE.x - this.offset.x,
      SEAT_EYE.y - this.offset.y,
      SEAT_EYE.z - this.offset.z,
    );
  }

  private attachReset(): void {
    const space = this.world.renderer.xr.getReferenceSpace();
    if (space == null) {
      return;
    }
    space.addEventListener('reset', this.onReset);
    this.referenceSpace = space;
  }

  private detachReset(): void {
    this.referenceSpace?.removeEventListener('reset', this.onReset);
    this.referenceSpace = null;
  }
}
