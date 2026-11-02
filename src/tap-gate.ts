/**
 * A tap that waits before it counts (the tower key). Reaching for one
 * thing brushes what sits beside it: the key lies 11 cm from the match, and
 * a hand on its way to the match crosses it. Such a tap fires TAP_DELAY
 * after the touch ends, and is dropped if a grab, or a press on something
 * else, starts first (a brush followed by nothing still counts: the hand
 * stopped there). A touch held longer than TAP_LONGEST is a hand resting
 * on it, not a tap, and a touch whose pointer is lost (the hand no longer
 * tracked) is dropped. The latch does not use this gate: its tap is a
 * short grab (PullHandleSystem, handleTap), with the same TAP_DELAY. Free
 * of imports, so `node --test` loads it as it is.
 */
export const TAP_DELAY = 0.35;
export const TAP_LONGEST = 1;

/** A hold of a sliding handle (the latch, the rope, the brake's knob, the match) shorter than this that moved it less than HANDLE_TAP_TRAVEL is a tap. */
export const HANDLE_TAP_SECONDS = 0.6;
export const HANDLE_TAP_TRAVEL = 0.015;
/**
 * A touch on a handle that starts this soon after a real hold of it ended
 * is the hand letting go, not a tap: the handle springs back past the
 * opening fingers (the rope's comes back up 15 cm), and the fingertip
 * brushing it as the hand draws away must not count one more haul.
 */
export const LET_GO_SECONDS = 1.2;

/** What PullHandleSystem knows of a hold of a handle as it ends. */
export interface HandleHold {
  /** Its signal already fired during this hold (pulled past its threshold). */
  fired: boolean;
  /** Seconds it was held. */
  heldFor: number;
  /** The furthest it was pulled along its axis (m). */
  maxPull: number;
  /** Seconds from the end of the last real hold of it (one that was not a tap) to the start of this one; Infinity if none. */
  sinceHold: number;
}

/** Whether a hold of a handle that just ended was a tap (it fires the handle's signal after TAP_DELAY). */
export function handleTap(h: HandleHold): boolean {
  return !h.fired && h.heldFor < HANDLE_TAP_SECONDS && h.maxPull < HANDLE_TAP_TRAVEL && h.sinceHold >= LET_GO_SECONDS;
}

/** Whether a hold that just ended was a real one (a pull or a try at one), which a brush right after must not count against. */
export function realHold(h: HandleHold): boolean {
  return h.fired || h.heldFor >= HANDLE_TAP_SECONDS || h.maxPull >= HANDLE_TAP_TRAVEL;
}

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
