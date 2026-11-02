/**
 * A tap that waits before it counts. Reaching for one thing brushes what
 * sits beside it: the latch's knob on the way to pinching the latch, the
 * tower key on the way to the match 11 cm away. Such a tap fires TAP_DELAY
 * after the touch ends, and is dropped if a grab, or a press on something
 * else, starts first. Free of imports, so `node --test` loads it as it is.
 */
export const TAP_DELAY = 0.35;

export class TapGate {
  private pressed = false;
  private waiting = -1;

  /** The fingertip (or a ray's pinch) came down on it. */
  press(): void {
    this.pressed = true;
    this.waiting = -1;
  }

  /** It came off: the tap counts in TAP_DELAY, unless something else is taken or pressed meanwhile. */
  release(): void {
    if (this.pressed) this.waiting = TAP_DELAY;
    this.pressed = false;
  }

  /** A grab started, or something else was pressed: the hand was on its way there, so this was a brush. */
  cancel(): void {
    this.pressed = false;
    this.waiting = -1;
  }

  /** Pressed, or let go and waiting to count. */
  busy(): boolean {
    return this.pressed || this.waiting >= 0;
  }

  /** Advances by `delta` seconds; true on the step the tap counts. */
  step(delta: number): boolean {
    if (this.waiting < 0) return false;
    this.waiting -= delta;
    if (this.waiting > 0) return false;
    this.waiting = -1;
    return true;
  }
}
