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
 * A touch on a handle that starts this soon after a hold of it that
 * reached its click ended is the hand letting go, not a tap: the handle
 * springs back past the opening fingers (the rope's comes back up 15 cm),
 * and the fingertip brushing it as the hand draws away must not count one
 * more haul.
 */
export const LET_GO_SECONDS = 1.2;
/**
 * After a try that never reached its click, only this long: nothing has
 * happened yet, and a Keeper who could not slide it and taps instead must
 * be heard, while the fingers opening still are not.
 */
export const TRY_LET_GO_SECONDS = 0.4;

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
  /** Whether that last real hold reached its click. */
  lastFired: boolean;
}

/** Whether a hold of a handle that just ended was a tap (it fires the handle's signal after TAP_DELAY). */
export function handleTap(h: HandleHold): boolean {
  return !h.fired && h.heldFor < HANDLE_TAP_SECONDS && h.maxPull < HANDLE_TAP_TRAVEL && h.sinceHold >= (h.lastFired ? LET_GO_SECONDS : TRY_LET_GO_SECONDS);
}

/**
 * The evening a tap on the sun moves the week on to, from `day` (-1 before
 * Monday): the choice's evening if it is still ahead; with none, and no
 * build to say its next step on the first evening, straight to Sunday.
 */
export function nextEvening(day: number, outcome: number, build: boolean, sunday = 6): number {
  if (outcome > day) return outcome;
  return day < 0 && build ? 0 : sunday;
}

/** The sun before its first evening needs a longer slide to start: a finger resting on it must not start the week's evenings. */
export const SUN_FIRST_TRAVEL = 0.025;

/** Whether a hold of the sun, begun with the week on `day` (-1 before the first evening), has moved far enough to be a slide. */
export function sunSlides(day: number, reach: number): boolean {
  return reach >= (day < 0 ? SUN_FIRST_TRAVEL : HANDLE_TAP_TRAVEL);
}

/**
 * Whether a hold of the brass sun that just ended was a tap: short, and it
 * either hardly moved the sun or left it on the evening it was on. A knob
 * that shifted 2 cm under a quick press is a tap too, not a slide that did
 * nothing.
 */
export function sunTap(heldFor: number, reach: number, sameDay: boolean): boolean {
  return heldFor < HANDLE_TAP_SECONDS && (reach < HANDLE_TAP_TRAVEL || sameDay);
}

/** Whether a hold that just ended was a real one (a pull or a try at one), which a brush right after must not count against. */
export function realHold(h: HandleHold): boolean {
  return h.fired || h.heldFor >= HANDLE_TAP_SECONDS || h.maxPull >= HANDLE_TAP_TRAVEL;
}

/**
 * The tower key beside the glass (week 3: the globe waits on the sill over
 * the key's right half). A hand that pinches, or let go of a pinch less than
 * PINCH_QUIET ago, was taking or setting down something else (the glass, the
 * match): its fingertip on a waiting button is a brush, not a tap, whether
 * the pinch took hold or closed on air.
 */
export const PINCH_QUIET = 1;

/** Whether a touch on a waiting button by a hand that is pinching, or last let go `sinceRelease` seconds ago, is a brush. */
export function pinchBrush(pinching: boolean, sinceRelease: number): boolean {
  return pinching || sinceRelease < PINCH_QUIET;
}

/**
 * A fingertip this near the middle of the glass is at the glass, not at the
 * key under it, and the key ignores that hand's touch; it is back on the key
 * only past the outer edge, so a trembling hand on the line does not flicker
 * between the two (m).
 */
export const AT_GLASS_IN = 0.065;
export const AT_GLASS_OUT = 0.075;

/** Whether a fingertip `distance` from the middle of the glass is at it, given whether it was a moment ago. */
export function atGlass(was: boolean, distance: number): boolean {
  return distance < (was ? AT_GLASS_OUT : AT_GLASS_IN);
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
