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
