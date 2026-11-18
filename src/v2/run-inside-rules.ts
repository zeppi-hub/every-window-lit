/**
 * The run seen from inside the queue (S07): the player sits among the
 * depositors on the glass in front of the bank; the pane under her cracks,
 * and she must take the gold rope swinging in front of her before the glass
 * gives. Taken in time, the glass falls and the net lowers her gently; too
 * late, the view goes dark a moment, the net still catches her and a window
 * goes out. Three rounds, each crack quicker and the swing wider; after
 * three late rounds every crack is slower and the rope swings less. Pure
 * numbers here; the scene draws them (game/run.ts).
 */
export const INSIDE = {
  /** Rounds to come through holding the rope (after the rehearsal, which cannot be lost). */
  rounds: 3,
  /** Seconds from the first crack to the glass giving, round by round. */
  crack: [6.0, 4.6, 3.6] as const,
  /** The rope's swing: its period (s) and how far each way it goes from straight in front (m), round by round. */
  period: [2.8, 2.4, 2.1] as const,
  reach: [0.2, 0.26, 0.32] as const,
  /** A pinch begun this round, with the hand this close to the ring (m), takes the rope. */
  holdWithin: 0.2,
  /** In the rehearsal the glass waits for the rope and gives once it has been held this long (s). */
  rehearsalHold: 0.5,
  /** Late rounds before every crack is slower and the swing smaller, and by how much. */
  mercyAfter: 3,
  mercyCrack: 1.5,
  mercyReach: 0.5,
  /** How far the net lowers the player once the glass is gone (m), and over how long (s): slow enough to be no fall at all. */
  lowerBy: 0.45,
  lowerFor: 1.6,
  /** The ring hangs this far ahead of the eye and below it (m). */
  ringAhead: 0.45,
  ringBelow: 0.18,
} as const;

/** The round's crack time (s), slower after INSIDE.mercyAfter late rounds. */
export function crackFor(round: number, late: number): number {
  const base = INSIDE.crack[Math.max(0, Math.min(INSIDE.crack.length - 1, round))];
  return late >= INSIDE.mercyAfter ? base * INSIDE.mercyCrack : base;
}

/** The round's swing: period (s) and reach each way (m), smaller after INSIDE.mercyAfter late rounds. */
export function swingFor(round: number, late: number): { period: number; reach: number } {
  const i = Math.max(0, Math.min(INSIDE.period.length - 1, round));
  const reach = INSIDE.reach[i] * (late >= INSIDE.mercyAfter ? INSIDE.mercyReach : 1);
  return { period: INSIDE.period[i], reach };
}

/** Where the ring is along its swing at time `t` (m, sideways from straight in front). */
export function ringOffset(t: number, period: number, reach: number): number {
  return reach * Math.sin((2 * Math.PI * t) / period);
}

/** How far along its crack a pane is (0..1) after `t` of `crack` seconds, and how red it shows (red only in the last half). */
export function crackOf(t: number, crack: number): { spread: number; red: number } {
  const k = Math.max(0, Math.min(1, t / crack));
  return { spread: 0.15 + 0.85 * k, red: Math.max(0, (k - 0.5) / 0.5) };
}

/**
 * Whether a slow player comes through a round: she notices after `notice`
 * seconds, needs `reachFor` to bring a hand (or the pointer) to the ring, and
 * may have to wait up to half a swing for it to come back to her.
 */
export function slowPlayerHolds(round: number, late: number, notice = 0.9, reachFor = 0.7): boolean {
  const { period } = swingFor(round, late);
  return notice + reachFor + period / 2 < crackFor(round, late);
}
