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
 * In 'handles' too, holding the button lets go of both.
 */
export type DeskMode = 'one' | 'pole' | 'handles' | 'ropes' | 'arms';

let mode: DeskMode = 'one';

export function setDeskMode(next: DeskMode): void {
  mode = next;
}

export function deskMode(): DeskMode {
  return mode;
}
