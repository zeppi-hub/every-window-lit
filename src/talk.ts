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

/**
 * The step whose instruction is on Tocco's panel just now ('' for none:
 * nothing up, or a story line), as ToccoSystem last put it up
 * (line-queue.ts): what the ghost hand shows goes with it.
 */
let instruction = '';

export function instructionShowing(): string {
  return instruction;
}

export function setInstructionShowing(step: string): void {
  instruction = step;
}

/**
 * Where the arrow of Tocco's instruction points from just now (its tip, in
 * the world), and whether one is shown: the ghost hand can set out from
 * there (ToccoSystem writes it each frame).
 */
const arrowTip = { shown: false, x: 0, y: 0, z: 0 };

export function lineArrow(): { readonly shown: boolean; readonly x: number; readonly y: number; readonly z: number } {
  return arrowTip;
}

export function setLineArrow(shown: boolean, x = 0, y = 0, z = 0): void {
  arrowTip.shown = shown;
  arrowTip.x = x;
  arrowTip.y = y;
  arrowTip.z = z;
}

/** Whether Tocco's first-week card line is up just now: the kerb he points at glows meanwhile (FocusSystem). */
let cardLine = false;

export function cardLineShowing(): boolean {
  return cardLine;
}

export function setCardLineShowing(next: boolean): void {
  cardLine = next;
}

/**
 * The light in Lina's window across the square, as FamilySystem last wrote
 * it (season/window-light.ts decides it): its state and brightness, so the
 * light through the shutter slats can blink the same goodbye (ShutterSystem).
 */
const windowLit: { state: string; level: number } = { state: 'dark', level: 0 };

export function windowLight(): { readonly state: string; readonly level: number } {
  return windowLit;
}

export function setWindowLight(state: string, level: number): void {
  windowLit.state = state;
  windowLit.level = level;
}

/**
 * Lina's answer to the Sunday lamp (FamilySystem keeps it): 0 none, 1 the
 * town waits for the Keeper to look across, 2 still waiting and the window
 * has called (two notes; the flame leans toward it). While it waits, Tocco,
 * the ghost hand and the latch's glow keep still.
 */
let reply: 0 | 1 | 2 = 0;

export function replyWaiting(): boolean {
  return reply > 0;
}

export function replyCalling(): boolean {
  return reply === 2;
}

export function setReply(next: 0 | 1 | 2): void {
  reply = next;
}

/**
 * Tocco's morning reveal (last week's call settled after a hush and a
 * chime, ToccoSystem): from the hush until its line is up. Lina's greeting
 * waits for it, so her notes never land on his chime (FamilySystem).
 */
let revealing = false;

export function revealHeld(): boolean {
  return revealing;
}

export function setRevealHeld(next: boolean): void {
  revealing = next;
}

/**
 * How strongly the ghost hand shows a pinch just now, 0 to 1 (HintSystem
 * keeps it, following the hand's own fade): with controllers, the trigger
 * glows with it, the controller's pinch (KeeperHandsSystem).
 */
let pinchShown = 0;

export function hintPinch(): number {
  return pinchShown;
}

export function setHintPinch(level: number): void {
  pinchShown = level;
}

/**
 * What the Keeper just touched out of turn (BasketSystem names it before
 * the 'wrong' signal): the dull sound comes from there (SoundSystem), and
 * in the first week the thing to touch glows and the ghost hand shows it
 * at once (week-locks.ts).
 */
let wrongName = '';

export function wrongThing(): string {
  return wrongName;
}

export function setWrongThing(name: string): void {
  wrongName = name;
}

/** What last appeared on the sill (RevealSystem): its small chime comes from there (SoundSystem). */
let revealed: Object3D | null = null;

export function revealedThing(): Object3D | null {
  return revealed;
}

export function setRevealed(thing: Object3D | null): void {
  revealed = thing;
}
