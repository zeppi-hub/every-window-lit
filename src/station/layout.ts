/**
 * Shared measurements of the Keeper's seat, in metres. The scene is authored
 * around a seated eye point; SeatSystem moves the player rig so the real
 * head lands on SEAT_EYE, whatever the user's height or room.
 */

export const SEAT_EYE = { x: 0, y: 1.2, z: 0 } as const;

/** The stone sill doubles as the desk: 40 cm deep, about 44 cm below the eye. */
export const SILL = {
  top: 0.76,
  /** Inner (room-side) face of the window wall. */
  innerZ: -0.15,
  /** Outer (town-side) face of the window wall, where the shutters hang. */
  outerZ: -0.55,
  halfWidth: 0.75,
} as const;

export const WINDOW = {
  halfWidth: 0.6,
  bottom: SILL.top,
  top: 1.95,
} as const;

export const ROOM = {
  halfWidth: 1.6,
  backZ: 2,
  height: 2.8,
} as const;

/** The square lies about 9 m below the sill (third floor of the tower). */
export const PLAZA_Y = SILL.top - 9;

/**
 * The tower's outer shell around the room. Its front face sits just in
 * front of the window wall, behind the shutter hinges, so open shutters lie
 * against it; the top is the wall top, under the cornice and roof.
 */
export const TOWER = {
  halfWidth: 3,
  frontZ: SILL.outerZ - 0.015,
  backZ: 4.4,
  top: 4.4,
} as const;

/** Where the Keeper stands after coming down the stairs: on the square, out of the tower door. */
export const TOWER_FOOT = { x: 0, y: PLAZA_Y, z: -2.4 } as const;
