/**
 * Whether the Keeper sits at the window or walks the town. SeatSystem holds
 * the rig at the seat only while seated; WalkSystem moves it only while
 * walking. Kept free of systems and DOM, like signals.ts.
 */

export type Stance = 'seat' | 'walk';

let current: Stance = 'seat';

export function stance(): Stance {
  return current;
}

export function setStance(next: Stance): void {
  current = next;
}
