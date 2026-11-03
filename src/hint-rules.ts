/**
 * The ghost hand's rules when it guides (Devir 1b item 3), kept free of
 * imports so `node --test` loads them as they are; HintSystem applies them.
 *
 * In the first week, and the first time any gesture is shown, the hand
 * comes with the instruction that names it: half a second after the line
 * goes up it sets out from the tip of the line's arrow, glides to the thing
 * to touch in 0.6 s, and shows the gesture again every 1.2 s until the step
 * is done. It goes out the frame the Keeper's hand comes within 15 cm of the
 * thing (or the step ends), and comes back once the hand has moved away
 * (for a quarter second), or after 3 s there without progress. Holding something else does not send it
 * away. The longer a step takes, the more help comes: at 8 s Tocco points
 * at the thing and it ticks; at 16 s, in the first week, he says the step
 * another way for 5 s (then, once that week, that a poke on him says it
 * again). Once a gesture has been guided, later showings wait for the
 * Keeper to be still, as before (8 s, twice).
 */

/** Seconds from the instruction going up to the hand setting out, its glide in, and one showing of the gesture. */
export const LINE_LEAD = 0.5;
export const GLIDE_SECONDS = 0.6;
export const CYCLE_SECONDS = 1.2;
/** Seconds a step waits for its instruction before the hand comes without it (a line still being read holds it). */
export const LINE_WAIT = 4.5;
/** The Keeper's hand this near the thing (m) sends the hand away; this far brings it back (a little further, so it does not flicker). */
export const NEAR = 0.15;
export const AWAY = 0.18;
/** Seconds the Keeper's hand must stay that far before the ghost hand comes back, so a hand passing by does not make it flicker. */
export const BACK_SECONDS = 0.25;
/** Seconds with the hand near and no progress before the ghost hand shows the gesture again anyway. */
export const STALL_SECONDS = 3;
/** The help ladder: seconds without progress before Tocco points (and the thing ticks), before his help line, and how long it stays. */
export const POINT_AFTER = 8;
export const HELP_AFTER = 16;
export const HELP_SECONDS = 5;
/** How far from straight ahead (degrees) the hand may set out: the arrow's tip, pulled in to this if it lies further out. */
export const ENTRY_YAW = 30;

/**
 * Whether a guided step that has not started waits for Tocco's say: in the
 * closed room, while lines of his are still waiting (the season's farewell
 * after its last week closes, which leaves the next season's first week
 * shut), the hand does not set out and the help ladder does not count, so
 * neither his pointing nor his help line cuts into those lines. It starts
 * once the last of them is up, with the latch's instruction after it.
 */
export function waitsForHisLines(phase: string, started: boolean, linesWaiting: boolean): boolean {
  return phase === 'shut' && !started && linesWaiting;
}

/**
 * Whether a gesture is guided: in the first week, and the first time it is
 * shown. From the second week the family box's knock and hook keep their own
 * timing (after the box's line); in the first week its knock is guided too,
 * with Tocco's line (Devir 1b item 14).
 */
export function guided(week: number, shownBefore: boolean, box: boolean): boolean {
  return week === 1 || (!box && !shownBefore);
}

/**
 * Whether the first week's guided knock on the family's box, once out
 * (`started`), is over: its step has ended (`step`, ToccoSystem's last), or
 * the box has left the Keeper's window (`boxFor` < 0: by itself, its hook, a
 * push, a poke on Tocco), which ends the step the frame it sets off, before
 * ToccoSystem has moved the step on. The hand goes then, with Tocco's
 * pointing, rather than follow the glass home (Devir 1b items 3 and 14).
 */
export function knockOver(week: number, box: boolean, started: boolean, boxFor: number, step: string): boolean {
  return week === 1 && box && started && (boxFor < 0 || step !== 'knock');
}

/** Where the hand is with the Keeper's hand near its thing, frame by frame. */
export interface NearState {
  /** Gone because the Keeper's hand is near the thing. */
  away: boolean;
  /** Seconds it has been gone so, without progress. */
  awayFor: number;
  /** Shown again after STALL_SECONDS near the thing: stays until the Keeper's hand has moved away. */
  again: boolean;
  /** Seconds the Keeper's hand has been AWAY from the thing since it was last near. */
  farFor: number;
}

export function freshNear(state: NearState): NearState {
  state.away = false;
  state.awayFor = 0;
  state.again = false;
  state.farFor = 0;
  return state;
}

/**
 * One frame of the rule: `distance` from the Keeper's nearest hand to the
 * thing (m), `delta` seconds since the last frame. Progress starts the
 * state afresh (HintSystem does it as the week moves). Returns whether the
 * hand shows.
 */
export function nearFrame(state: NearState, distance: number, delta: number): boolean {
  if (distance > AWAY) {
    state.farFor += delta;
    // Gone, it comes back once the hand has stayed away a moment.
    if (state.away && state.farFor < BACK_SECONDS) return false;
    state.away = false;
    state.awayFor = 0;
    state.again = false;
    return true;
  }
  state.farFor = 0;
  if (state.again) return true;
  if (distance < NEAR) state.away = true;
  if (!state.away) return true;
  state.awayFor += delta;
  if (state.awayFor >= STALL_SECONDS) {
    state.away = false;
    state.again = true;
    return true;
  }
  return false;
}

/** The help due after `stuck` seconds without progress: none, Tocco pointing (and the tick), or his help line too. */
export function ladder(stuck: number): 'none' | 'point' | 'help' {
  return stuck >= HELP_AFTER ? 'help' : stuck >= POINT_AFTER ? 'point' : 'none';
}

/**
 * Where the hand sets out from: the arrow's tip `tip` as seen from `eye`,
 * turned about the eye's upright toward straight ahead (the seat looks
 * along -z) if it lies more than ENTRY_YAW to the side, at the same
 * distance and height. Writes into `out` and returns it.
 */
export function entryStart(
  tip: { x: number; y: number; z: number },
  eye: { x: number; y: number; z: number },
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const dx = tip.x - eye.x;
  const dz = tip.z - eye.z;
  const yaw = Math.atan2(dx, -dz);
  const most = (ENTRY_YAW * Math.PI) / 180;
  const turned = Math.max(-most, Math.min(most, yaw));
  const flat = Math.hypot(dx, dz);
  out.x = eye.x + Math.sin(turned) * flat;
  out.y = tip.y;
  out.z = eye.z - Math.cos(turned) * flat;
  return out;
}
