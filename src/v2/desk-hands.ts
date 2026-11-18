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
 *   them wide, down draws them in.
 * - 'bail': a bucket in the right hand: moving the mouse down plunges it,
 *   up lifts it and heaves it away (a quick flick throws); the left hand
 *   waits by the hatch, a click closes it on what is there.
 * In 'handles' too, holding the button lets go of both.
 */
export type DeskMode = 'one' | 'pole' | 'handles' | 'ropes' | 'arms' | 'reach' | 'bail';

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
