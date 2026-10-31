/**
 * How fast the town's life runs (META_VR_DINAMIKLER.md item 3): 1 normally;
 * while the Keeper holds the sun still, 0, and the square stands frozen
 * (walkers mid-stride, pigeons mid-air); sliding it, time flows again.
 * SunSystem sets it; the townsfolk and the birds run by it. Kept free of
 * systems and DOM, like stance.ts.
 */

let scale = 1;

export function townTime(): number {
  return scale;
}

export function setTownTime(next: number): void {
  scale = next;
}
