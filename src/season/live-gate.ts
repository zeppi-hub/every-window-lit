/**
 * Whether Tocco's live line (advisor.ts) may be asked for: only with a
 * Worker address configured, never in a solidarity week, and never in the
 * first week, so everyone's first minutes play the same and need no
 * network. `townWeek` is the week in progress (the town's week). Pure, so
 * `node --test` can check it.
 */
export function liveLineOpen(configured: boolean, townWeek: number, solidarity: boolean): boolean {
  return configured && townWeek > 1 && !solidarity;
}
