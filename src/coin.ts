/**
 * The week's coin (the town's one coin a week, META_VR_DINAMIKLER.md item
 * 2): from the second week it comes up in the basket, and the jar shows
 * one coin fewer until the Keeper drops it in, or the basket leaves and it
 * goes in by itself. The season's model already counts it; this is only
 * what the jar shows. Kept free of systems and DOM, like stance.ts.
 */

let pending = false;

export function weekCoinPending(): boolean {
  return pending;
}

export function setWeekCoinPending(next: boolean): void {
  pending = next;
}
