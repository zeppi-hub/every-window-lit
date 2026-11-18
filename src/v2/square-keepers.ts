/**
 * The six memory keepers on the square, as numbers (no drawing): who they
 * are, where each stands, and what that place must keep clear of.
 *
 * They stand in an arc before the bird on Gray's shoulder, each raised on a
 * stand so the queue never hides them: left to right in the order the day's
 * troubles come. Places are metres on the square (y up, north is -z); the
 * bird looks out over the square toward +z, and its left is +x.
 */

/** The bird's seat on Gray's shoulder (opening.ts CITY.shoulder, on the floor plan). */
export const SEAT = { x: -0.16, z: -21.98 } as const;

/** How far the bird's seat is turned to its left of straight out over the square (radians): the middle of the keepers' arc. */
export const SEAT_TURN = 0.42;

/** The square's ground (m). */
export const GROUND = 0.15;

/** A memory orb's radius (m): a small world, large enough to be read from the seat. */
export const ORB_R = 0.175;

export interface KeeperPlace {
  key: string;
  model: 'walt' | 'june' | 'ben' | 'helen' | 'edna' | 'george';
  memory: string;
  /** Where the stand is, on the ground. */
  at: readonly [number, number, number];
  /** The stand's height (m): the keeper's feet are this far above the ground. */
  stand: number;
  colour: number;
  open: boolean;
}

/** The six, in the order of the day's troubles; that is also left to right from the seat. */
export const KEEPERS = [
  { key: 'catcher', model: 'walt', memory: 'circus', at: [3.42, GROUND, -18.64], stand: 1.0, colour: 0xf4c27a, open: true },
  { key: 'ranger', model: 'june', memory: 'forest', at: [3.72, GROUND, -17.02], stand: 1.0, colour: 0xff8a3c, open: true },
  { key: 'sailor', model: 'ben', memory: 'ship', at: [2.44, GROUND, -17.48], stand: 1.0, colour: 0x6aa8e8, open: true },
  { key: 'guide', model: 'helen', memory: 'mountain', at: [2.54, GROUND, -15.3], stand: 0.8, colour: 0xe8f0ff, open: true },
  { key: 'farmer', model: 'edna', memory: 'farm', at: [0.96, GROUND, -17.11], stand: 1.0, colour: 0xc8a050, open: true },
  { key: 'keeper', model: 'george', memory: 'valley', at: [0.6, GROUND, -14.05], stand: 0.8, colour: 0xa0c8a0, open: true },
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
  sharks: { x: -4, z: -18.5, alongX: 5.5, alongZ: 1.6 },
  /** Where the third wolf runs in the evening, from the edge of its ring to the jars (wolves.ts placeWolves): the last keeper still waits then. */
  wolfRun: { fromX: 1.08, fromZ: -15.17, toX: -2.1, toZ: -13.9, half: 0.2 },
  /** The reporter in front of the lectern (opening.ts setUpCity). */
  reporter: { x: 1.6, z: -18.2 },
} as const;

/** Half a stand's width (m). */
export const STAND_HALF = 0.45;
