/**
 * When the morning bell rings below (BasketSystem): after a quiet morning
 * with the shutters open, once nothing holds it back (Tocco's lines still
 * waiting, held back by the family's box too, last week's answer held for
 * its chime, Lina's greeting still playing), and at the limit whatever
 * does. The very first morning is a little longer: the town speaks first,
 * then Tocco's welcome, and the bell 8 s after the latch. Free of imports,
 * so `node --test` loads it as it is.
 */

/** Seconds of quiet morning before the bell, and the most it waits for what holds it back. */
export const MORNING_SECONDS = 6;
export const MORNING_LIMIT = 20;
export const FIRST_MORNING_SECONDS = 8;
export const FIRST_MORNING_LIMIT = 20;

/** Whether the bell rings `timer` seconds into the morning, in the first week or another, with something holding it back or not. */
export function bellRings(timer: number, firstWeek: boolean, held: boolean): boolean {
  if (timer < (firstWeek ? FIRST_MORNING_SECONDS : MORNING_SECONDS)) return false;
  return !held || timer >= (firstWeek ? FIRST_MORNING_LIMIT : MORNING_LIMIT);
}
