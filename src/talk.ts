import type { Object3D } from '@iwsdk/core';

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

/** What the ghost hand is pointing at just now, so the sound can come from there (SoundSystem). */
let hinted: Object3D | null = null;

export function hintTarget(): Object3D | null {
  return hinted;
}

export function setHintTarget(target: Object3D | null): void {
  hinted = target;
}

/** Whether Tocco's line on show went up under MIN_SECONDS ago: the ghost hand's clock waits until it has been read. */
let lineFresh = false;

export function lineIsFresh(): boolean {
  return lineFresh;
}

export function setLineFresh(next: boolean): void {
  lineFresh = next;
}

/**
 * Whether the ghost hand's next showing is a repeat of a gesture it has
 * shown before (HintSystem keeps it): only then does Tocco tap the sill
 * first, so his tap never lands on a gesture's first showing.
 */
let repeatNext = false;

export function hintRepeatsNext(): boolean {
  return repeatNext;
}

export function setHintRepeatsNext(next: boolean): void {
  repeatNext = next;
}

/** How long the Keeper has done nothing (HintSystem keeps it): Tocco taps the sill before the ghost hand comes. */
let still = 0;

export function idleSeconds(): number {
  return still;
}

export function setIdleSeconds(seconds: number): void {
  still = seconds;
}

/** Whether the family was visited since the basket landed: until then the sun waits its turn (SunSystem). */
let visited = false;

export function familyVisited(): boolean {
  return visited;
}

export function setFamilyVisited(next: boolean): void {
  visited = next;
}

/** Whether Tocco's first-week card line is up just now: the kerb he points at glows meanwhile (FocusSystem). */
let cardLine = false;

export function cardLineShowing(): boolean {
  return cardLine;
}

export function setCardLineShowing(next: boolean): void {
  cardLine = next;
}
