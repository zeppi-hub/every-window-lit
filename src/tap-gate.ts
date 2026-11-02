/**
 * A tap that waits before it counts (the tower key). Reaching for one
 * thing brushes what sits beside it: the key lies 11 cm from the match, and
 * a hand on its way to the match crosses it. Such a tap fires TAP_DELAY
 * after the touch ends, and is dropped if a grab, or a press on something
 * else, starts first (a brush followed by nothing still counts: the hand
 * stopped there). A touch held longer than TAP_LONGEST is a hand resting
 * on it, not a tap, and a touch whose pointer is lost (the hand no longer
 * tracked) is dropped. The latch does not use this gate: its tap is a
 * short grab (PullHandleSystem), with the same TAP_DELAY. Free of imports,
 * so `node --test` loads it as it is.
 */
export const TAP_DELAY = 0.35;
export const TAP_LONGEST = 1;

export class TapGate {
  private pressed = false;
  private held = 0;
  private waiting = -1;

  /** The fingertip (or a ray's pinch) came down on it. */
  press(): void {
    this.pressed = true;
    this.held = 0;
    this.waiting = -1;
  }

  /**
   * It came off: the tap counts in TAP_DELAY, unless something else is taken
   * or pressed meanwhile, or it was held too long. True if it is now waiting
   * to count.
   */
  release(): boolean {
    if (this.pressed && this.held <= TAP_LONGEST) this.waiting = TAP_DELAY;
    this.pressed = false;
    return this.waiting >= 0;
  }

  /** A grab started, something else was pressed, or the pointer was lost: the hand was on its way elsewhere, so this was a brush. */
  cancel(): void {
    this.pressed = false;
    this.waiting = -1;
  }

  /** Pressed, or let go and waiting to count. */
  busy(): boolean {
    return this.pressed || this.waiting >= 0;
  }

  /** Seconds the touch has been held (the last touch, once let go). */
  heldFor(): number {
    return this.held;
  }

  /** Advances by `delta` seconds; true on the step the tap counts. */
  step(delta: number): boolean {
    if (this.pressed) this.held += delta;
    if (this.waiting < 0) return false;
    this.waiting -= delta;
    if (this.waiting > 0) return false;
    this.waiting = -1;
    return true;
  }
}
