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
 *   and moving the mouse up and down works it; a click sends a hand off
 *   for a moment, the other pumping on: while the pump is dry, to fetch
 *   its jug and pour it into the cup (any click, wherever the pointer
 *   is); else to slap the blown valve shut (while there is one to shut),
 *   else to throw the sluice lever to its other side;
 * - 'slam': both hands hold a two-handled driver, and the mouse lifts it
 *   above the shoulders and brings it down past the knees (a quick move
 *   down is a blow);
 * - 'haul': both hands are on a line (setDeskLine), and sweeping the mouse
 *   to and fro hauls it hand over hand: the hands close as the mouse goes
 *   the way the line is pulled and open as it comes back.
 * In 'handles' too, holding the button lets go of both.
 */
export type DeskMode = 'one' | 'pole' | 'handles' | 'ropes' | 'arms' | 'reach' | 'bail' | 'pump' | 'slam' | 'haul';

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
  /** While the pump is dry: where its jug is taken (its middle) and where it is poured (over the cup). Null once it has water. */
  jug?: { at: Place; cup: Place } | null;
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

/** The line being hauled in 'haul' (world): where it comes through, and the way it is pulled. */
const line = { x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0 };

export function setDeskLine(from: { x: number; y: number; z: number }, along: { x: number; y: number; z: number }): void {
  line.x = from.x;
  line.y = from.y;
  line.z = from.z;
  line.dx = along.x;
  line.dy = along.y;
  line.dz = along.z;
}

export function deskLine(): Readonly<typeof line> {
  return line;
}

/** How many times a scene has put the player in a new seat (the desktop emulator's head looks straight ahead after each). */
let recentres = 0;

/**
 * A new seat: the desktop emulator's head faces the way the seat faces again,
 * level. The head turned in the last place (round to find a keeper, say) would
 * otherwise carry over, and a new scene built ahead of the seat would be behind it.
 */
export function recentreDeskHead(): void {
  recentres += 1;
}

export function deskRecentres(): number {
  return recentres;
}
