/**
 * THE RUN (S07) as numbers only. The pavement in front of the bank is six
 * panes of glass over a deep drop, the queue standing on them; the player,
 * on a street lamp's arm, holds the gold rope a gold net hangs from, and
 * pulling the rope sideways slides the net along under the glass. A pane
 * cracks, then gives way: with the net under it, its people land in the
 * net; without, they run back from the edge. No drawing, no input and no
 * scene here: the scene feeds the rope's place in and reads the net's place
 * and the verdicts out, so every rule can be tested.
 *
 * Units: metres and seconds. x runs along the bank front (the player's
 * right is +x).
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** One pane giving way: which, and how long it cracks before it drops (s). */
export interface Collapse {
  section: number;
  warn: number;
}

export const RUN = {
  /** The middle of each pane along the bank front (m), left to right as seen from the lamp. */
  sections: [-8.8, -7.2, -5.6, -4.0, -2.4, -0.8],
  /** A pane's size: along the front and toward the door (m); shallow enough to stay behind the litter bin at the kerb. */
  sectionWidth: 1.6,
  sectionDepth: 1.4,
  /** Where the net's middle can go along the front, the rope pulled fully left and fully right (m). */
  netFrom: -9.2,
  netTo: -0.4,
  /** The net's size (m): a little wider than a pane. */
  netWidth: 1.8,
  /** How near a pane's middle the net's middle must be when the glass drops (m), and how near after three lost fights. */
  hold: 0.55,
  mercyHold: 0.8,
  /** The rehearsal: this pane cracks and waits, with no clock, for the net; it drops once the net has been under it this long (s). */
  rehearsal: 5,
  rehearsalSettle: 0.6,
  /** The fight after the rehearsal, wave by wave: one pane at a time, each sooner than the last; in the last wave (after the magpie's whisper) two crack at once, the second later. */
  waves: [[{ section: 0, warn: 2.7 }], [{ section: 4, warn: 2.3 }], [{ section: 1, warn: 2.0 }], [{ section: 3, warn: 1.7 }, { section: 2, warn: 2.9 }]] as readonly (readonly Collapse[])[],
  /** This many panes lost and the crowd breaks the bank's door: the fight is played again. */
  lostToBreak: 2,
  /** After this many lost fights the panes crack this much longer, and the net holds from further off. */
  mercyAfter: 3,
  mercyWarn: 1.4,
  /** The net follows the rope on a spring, a little behind, and settles into place (1/s², 1/s). */
  stiffness: 32,
  damping: 8.5,
  /** The quickest a player turns from seeing a crack to pulling the rope (s): every warning leaves at least this plus the net's travel. */
  reaction: 0.6,
} as const;

/** The net and how it moves. */
export interface Net {
  x: number;
  v: number;
}

/** Where the rope puts the net's middle, from how far along its slide the rope is (0 fully left, 1 fully right). */
export function netTarget(progress: number): number {
  return RUN.netFrom + (RUN.netTo - RUN.netFrom) * clamp(progress, 0, 1);
}

/** The rope's place along its slide (0..1) that puts the net under pane `section`. */
export function ropeFor(section: number): number {
  return clamp((RUN.sections[section] - RUN.netFrom) / (RUN.netTo - RUN.netFrom), 0, 1);
}

/** One step of the net toward where the rope puts it (in small steps, so a long frame cannot fling it). */
export function stepNet(net: Net, target: number, delta: number): void {
  const steps = Math.max(1, Math.ceil(delta / (1 / 120)));
  const dt = delta / steps;
  for (let i = 0; i < steps; i += 1) {
    net.v += (RUN.stiffness * (target - net.x) - RUN.damping * net.v) * dt;
    net.x += net.v * dt;
  }
}

/** Whether the net is under pane `section` (it catches its people if the glass drops now). */
export function holds(netX: number, section: number, mercy: boolean): boolean {
  return Math.abs(netX - RUN.sections[section]) <= (mercy ? RUN.mercyHold : RUN.hold);
}

/** How long a pane cracks before it drops (s). */
export function warnOf(c: Collapse, mercy: boolean): number {
  return c.warn * (mercy ? RUN.mercyWarn : 1);
}

/** How far a pane's cracks have spread (0 a hairline, 1 about to drop), `t` s after it began. */
export function cracked(t: number, warn: number): number {
  return clamp(t / warn, 0, 1);
}

/** Whether the lost panes break the bank's door. */
export function broken(lost: number): boolean {
  return lost >= RUN.lostToBreak;
}

/** Whether a fight, `losses` lost before it, is played the easier way. */
export function mercyFor(losses: number): boolean {
  return losses >= RUN.mercyAfter;
}

/** The pane the net is under now, or -1. */
export function under(netX: number, mercy: boolean): number {
  for (let i = 0; i < RUN.sections.length; i += 1) if (holds(netX, i, mercy)) return i;
  return -1;
}

/**
 * How long the net takes from resting at `from` to resting under pane
 * `section` (inside the hold and staying there), the rope pulled straight
 * to its place: a helper for the tests and the pacing.
 */
export function travelTime(from: number, section: number): number {
  const net: Net = { x: from, v: 0 };
  const target = RUN.sections[section];
  let t = 0;
  let inside = 0;
  while (t < 10) {
    stepNet(net, target, 1 / 120);
    t += 1 / 120;
    inside = Math.abs(net.x - target) <= RUN.hold * 0.5 ? inside + 1 / 120 : 0;
    if (inside >= 0.2) return t - 0.2;
  }
  return Infinity;
}
