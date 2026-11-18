/**
 * The six memory keepers on the square, as numbers (no drawing): who they
 * are, where each stands, and what that place must keep clear of.
 *
 * They stand in one row round the bird on Gray's shoulder, about four metres
 * off and seventy degrees from end to end, each raised on a stand so the
 * queue never hides them: left to right in the order the day's
 * troubles come. Places are metres on the square (y up, north is -z); the
 * bird looks out over the square toward +z, and its left is +x.
 */

/** The bird's seat on Gray's shoulder (opening.ts CITY.shoulder, on the floor plan). */
export const SEAT = { x: -0.16, z: -21.98 } as const;

/** How far the bird's seat is turned to its left of straight out over the square (radians): toward the keepers' arc, but not so far that Gray's head beside the bird fills the left of the view. */
export const SEAT_TURN = 0.17;

/** The square's ground (m). */
export const GROUND = 0.15;

/** A memory orb's radius (m): a small world, large enough to be read from the seat. */
export const ORB_R = 0.24;

export interface KeeperPlace {
  key: string;
  model: 'walt' | 'june' | 'ben' | 'helen' | 'edna' | 'george';
  memory: string;
  /** Where the stand is, on the ground. */
  at: readonly [number, number, number];
  /** The stand's height (m): the keeper's feet are this far above the ground. */
  stand: number;
  colour: number;
  /** The colour of the feather its word is given as (opening.ts FEATHER): shown over the orb once the memory has been played. */
  feather: number;
  open: boolean;
}

/** The six, in the order of the day's troubles; that is also left to right from the seat. */
export const KEEPERS = [
  { key: 'catcher', model: 'walt', memory: 'circus', at: [2.85, GROUND, -19.12], stand: 1.0, colour: 0xf4c27a, feather: 0xe8c45a, open: true },
  { key: 'ranger', model: 'june', memory: 'forest', at: [2.09, GROUND, -18.38], stand: 1.0, colour: 0xff8a3c, feather: 0xb4532a, open: true },
  { key: 'sailor', model: 'ben', memory: 'ship', at: [1.13, GROUND, -17.88], stand: 1.0, colour: 0x6aa8e8, feather: 0x4a86c0, open: true },
  { key: 'guide', model: 'helen', memory: 'mountain', at: [0.06, GROUND, -17.84], stand: 1.0, colour: 0xe8f0ff, feather: 0xa8e0f0, open: true },
  { key: 'farmer', model: 'edna', memory: 'farm', at: [-0.97, GROUND, -18.01], stand: 1.0, colour: 0xc8a050, feather: 0x5aa04a, open: true },
  { key: 'keeper', model: 'george', memory: 'valley', at: [-1.94, GROUND, -18.34], stand: 1.0, colour: 0xa0c8a0, feather: 0xc9a06a, open: true },
] as const satisfies readonly KeeperPlace[];

/** How far a place is from the seat (m, on the floor plan). */
export function rangeOf(at: readonly [number, number, number]): number {
  return Math.hypot(at[0] - SEAT.x, at[2] - SEAT.z);
}

/** A place's bearing from the seat (degrees to the bird's left of straight out over the square). */
export function bearingOf(at: readonly [number, number, number]): number {
  return (Math.atan2(at[0] - SEAT.x, at[2] - SEAT.z) * 180) / Math.PI;
}

/**
 * What the rest of the day needs kept clear (the scenes that own each are
 * named): a keeper's stand, `half` wide either way, must touch none of them.
 */
export const KEEP_CLEAR = {
  /** The glass panes of the run and the queue that stands on them (run.ts; run-rules.ts RUN.sections). */
  panes: { fromX: -9.6, toX: 0, fromZ: -17.35, toZ: -15.95 },
  /** The sandbag wall across the bank's front (bank-bail.ts WALL), bags and all. */
  wall: { z: -16.2, deep: 0.25 },
  /** The lamp the run and the flood are fought from (run.ts LAMP_EYE), and the right end of what it looks at. */
  lamp: { x: -4.0, z: -10.6 },
  lampSees: { x: 0, z: -15.95 },
  /** The sharks' circle on the flood (ship.ts): its middle and how far the widest fin swims. */
  sharks: { x: -6.3, z: -18.5, alongX: 3.4, alongZ: 1.5 },
  /** Where the nearest wolf runs in the evening, from the edge of its ring to the jars (wolves.ts placeWolves): the last keeper still waits then. */
  wolfRun: { fromX: -0.76, fromZ: -17.53, toX: -3.1, toZ: -13.9, half: 0.2 },
  /** Where the reporter stands from S05 until the run is over (opening.ts s05 puts her there, out of the row). */
  reporter: { x: 3.95, z: -18.1 },
  /** The chosen person with the notebook at the foot of the steps (opening.ts CITY.stairsFoot). */
  watcher: { x: -0.6, z: -18.8 },
  /** The giant bucket of the flood (bank-bail.ts GIANT) and the parachutes that come down on it (ship.ts s12). */
  bucket: { x: -3.4, z: -18.6 },
  parachutes: [[-4, -20.5], [-0.5, -19.7], [4.8, -18.9]],
} as const;

/** Half a stand's width (m). */
export const STAND_HALF = 0.35;
