/**
 * How the desktop emulator's mouse plays the hands (dev only; the headset
 * never reads this). A scene asks for the way its moment is played:
 * - 'one': the mouse carries one hand (the right; the left with Shift held),
 *   a click pinches;
 * - 'pole': both hands hold something across the chest, and moving the
 *   mouse left and right tilts it;
 * - 'handles': both hands hold two handles, and the mouse moves them
 *   together, sideways and up and down;
 * - 'ropes': both hands hold a rope each at the shoulders, moving the mouse
 *   up and down pushes and pulls them, and holding the button lets go;
 * - 'arms': both hands free in the air, and moving the mouse up spreads
 *   them wide, down draws them in;
 * - 'bail': a bucket in the right hand: moving the mouse down plunges it,
 *   up lifts it and heaves it away (a quick flick throws); the left hand
 *   waits by the hatch, a click closes it on what is there;
 * - 'pump': both hands on a pump's bar (setDeskPump says where it is),
 *   and moving the mouse up and down works it; a click sends the right
 *   hand to slap the blown valve shut (while there is one to shut), else
 *   to throw the sluice lever to its other side, the left hand pumping on.
 * In 'handles' too, holding the button lets go of both.
 */
export type DeskMode = 'one' | 'pole' | 'handles' | 'ropes' | 'arms' | 'reach' | 'bail' | 'pump';

type Place = readonly [number, number, number];
/** For 'pump': the bar's middle at the top and the bottom of its swing, and the sluice lever's knob at its two ends, if there is one (world, m). */
export interface DeskPump {
  up: Place;
  down: Place;
  sluice: readonly [Place, Place] | null;
  /** The relief valve's place while it is blown open (a click shuts it), else null. */
  valve?: Place | null;
  /** Which end of `sluice` its lever stands at now (0 or 1). */
  fed?: number;
}

let pump: DeskPump | null = null;
let carry: Place | null = null;

/**
 * Where a thing taken with one click is carried by itself and held a moment (the pump's cup, for its jug; world, m), or
 * null. Only set it while the one thing to take is that thing: whatever is clicked meanwhile goes there. (A word feather
 * goes to the listening ear as before, whatever this says.)
 */
export function setDeskCarry(next: Place | null): void {
  carry = next;
}

export function deskCarry(): Place | null {
  return carry;
}

export function setDeskPump(next: DeskPump | null): void {
  pump = next;
}

export function deskPump(): DeskPump | null {
  return pump;
}

let mode: DeskMode = 'one';

export function setDeskMode(next: DeskMode): void {
  mode = next;
}

export function deskMode(): DeskMode {
  return mode;
}

/** How far the emulator's view looks down (negative) or up while a scene's work is below or above a level gaze (radians; 0 when the scene has not asked). The headset never reads this. */
let look = 0;

export function setDeskLook(next: number): void {
  look = next;
}

export function deskLook(): number {
  return look;
}
