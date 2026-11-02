/**
 * The very first minute (Devir 1b item 5): the Keeper comes into the
 * closed room, and Tocco rides out of his door within a second and a half
 * of Enter VR, to say the latch's instruction (line-queue.ts); once the
 * shutters open the town has five quiet seconds, then his two opening
 * lines, and the bell once both have been read (bell.ts). The same after
 * Start at week 1, which puts the week back to restart.ts RESTART_WEEK.
 * Free of imports, so `node --test` loads it as it is; phases are the
 * components.ts Phase values.
 */

/** Seconds in the headset before Tocco's door opens in the closed room, and his ride out or back. */
export const DOOR_AFTER = 0.9;
export const RIDE_SECONDS = 0.8;
/** He is out to speak once this far along his rail (0 in, 1 out). */
export const OUT_TO_SPEAK = 0.9;
/** On the very first morning the town speaks first: this long after the shutters open, his first line. */
export const FIRST_HUSH_SECONDS = 5;

/**
 * Whether Tocco is out in the closed room: the first week, its shutters
 * not yet opened, once the Keeper has been in the headset DOOR_AFTER
 * seconds (not in a solidarity week, which is never the first).
 */
export function outInClosedRoom(week: number, phase: string, open: boolean, quiet: boolean, immersiveFor: number): boolean {
  return week === 1 && phase === 'shut' && !open && !quiet && immersiveFor >= DOOR_AFTER;
}

/** How far along his rail he is after `delta` seconds riding toward out (want) or in. */
export function ride(out: number, want: boolean, delta: number): number {
  return out + ((want ? 1 : 0) - out) * Math.min(1, delta / (RIDE_SECONDS / 4));
}
