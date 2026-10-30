/**
 * Whether Tocco still has lines waiting to be said. The morning bell holds
 * off until he has said them, so his morning news is not cut short by the
 * week's first instruction. Kept free of systems and DOM, like stance.ts.
 */

let waiting = false;

export function linesWaiting(): boolean {
  return waiting;
}

export function setLinesWaiting(next: boolean): void {
  waiting = next;
}
