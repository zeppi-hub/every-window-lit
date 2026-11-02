/**
 * When the morning bell rings below (BasketSystem): after a quiet morning
 * with the shutters open (its clock stands still while the Keeper is down
 * in the town or the family's box is in the window), once nothing holds it back (Tocco's lines still
 * waiting, held back by the family's box too, last week's answer held for
 * its chime, Lina's greeting still playing), and at the limit whatever
 * does. The very first morning is longer: the town speaks for 5 s
 * (opening.ts FIRST_HUSH_SECONDS), then Tocco's two opening lines, each
 * read for 4 s (line-queue.ts MIN_SECONDS; the first week's bell waits for
 * the line up to be read too), and the bell 13 s after the latch. Free of
 * imports, so `node --test` loads it as it is.
 */

/** Seconds of quiet morning before the bell, and the most it waits for what holds it back. */
export const MORNING_SECONDS = 6;
export const MORNING_LIMIT = 20;
export const FIRST_MORNING_SECONDS = 13;
export const FIRST_MORNING_LIMIT = 20;

/**
 * Whether the morning's clock stands still: the Keeper down in the town,
 * the shutters closed, or the family's box in the window (Tocco's lines
 * wait behind it, and Lina's greeting would play behind it).
 */
export function morningPaused(walking: boolean, open: boolean, boxIn: boolean): boolean {
  return walking || !open || boxIn;
}

/** Whether the bell rings `timer` seconds into the morning, in the first week or another, with something holding it back or not. */
export function bellRings(timer: number, firstWeek: boolean, held: boolean): boolean {
  if (timer < (firstWeek ? FIRST_MORNING_SECONDS : MORNING_SECONDS)) return false;
  return !held || timer >= (firstWeek ? FIRST_MORNING_LIMIT : MORNING_LIMIT);
}
