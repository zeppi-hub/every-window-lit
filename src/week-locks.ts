/**
 * What the latch, the rope and the brake lever do when they are touched,
 * from the week as it stands (BasketSystem applies it). In the first week
 * nothing touched at the wrong moment is silently refused or silently
 * done: the lever does not move with nothing in the basket ("Pick one
 * first. Then the lever."), the latch does not close the shutters until
 * Lina has answered the Sunday lamp ("Not yet. Finish the week first.",
 * unless the family's box is in: the latch sends it home, and that is all
 * it does), and a rope or lever touched out of turn answers with a dull
 * sound while the thing to touch glows and the ghost hand shows it at once.
 * From the second week the lever sends the basket down empty and only the
 * rope's dull sound stays; the open latch, as in the first week, closes the
 * shutters only on Sunday ("Not yet. Finish the week first." mid-week), and
 * the season's last Sunday waits for its lamp ("Now light the lamp."). Free of imports, so `node --test` loads it as it is; phases
 * are the components.ts Phase values.
 */

/** Hauls on the rope that bring the basket up in the first week, and in a solidarity week, when someone below does it. */
export const PULLS = 3;

/**
 * How many hauls it takes in week `n`: one, the first week too (the blind
 * players and judges found three too many steps for a first week); the
 * solidarity week's basket hauls itself up in three (BasketSystem).
 */
export function pullsNeeded(n: number, aid: boolean): number {
  return aid ? PULLS : 1;
}

/** What the touch needs to know of the week (all of it on the Week entity, in talk.ts or in season/store.ts). */
export interface LockFacts {
  week: number;
  phase: string;
  /** The shutters are open. */
  open: boolean;
  chosen: number;
  lamp: boolean;
  /** The town waits for Lina's answer to the lamp (talk.ts replyWaiting). */
  reply: boolean;
  /** The season's last week: its Sunday's lamp starts the last night. */
  last: boolean;
  /** A solidarity week. */
  aid: boolean;
  /** The solidarity week's card has come up in its second basket (aid.ts aidCard() === 'sill'). */
  aidCardIn: boolean;
  /** The solidarity week's second basket is on its way. */
  hauling: boolean;
  /** The last night's windows are still being lit (FestivalSystem). */
  conducting: boolean;
  /** The family's box is in the Keeper's window (coming, shown or going home). */
  boxIn: boolean;
  /** The first week's three things are out (choice-moment.ts): before that the lever is simply out of turn. */
  choiceReady?: boolean;
  /** The last night: Tocco still has lines to say. */
  lastLines?: boolean;
  /** The climax's Sunday with the glass not yet sent or kept (globe.ts). */
  undecided?: boolean;
  /** The town's basket is on the sill with the glass in it. */
  loaded?: boolean;
}

/** Whether the first week's locks hold: the week the Keeper learns the steps. */
export function firstWeek(f: LockFacts): boolean {
  return f.week === 1 && !f.aid;
}

/**
 * The latch, tried: open the shutters; close them (on Sunday, keeping the
 * week; before, pausing it); or keep them open and say why: the basket is
 * out ('busy'), the first week or the last Sunday is not finished ('notYet'), Lina answers
 * the lamp now ('reply'), the last night's windows come on first
 * ('hurry'); or say nothing ('wait'): the solidarity week waits for its
 * card, and in the first week the family's box is in, which the latch sends
 * home (FamilySystem), so nothing was done wrong.
 */
export type LatchMove = 'open' | 'close' | 'busy' | 'notYet' | 'reply' | 'hurry' | 'wait';

const OUT: ReadonlySet<string> = new Set(['rising', 'choosing', 'lowering']);

export function latchMove(f: LockFacts): LatchMove {
  if (!f.open) return 'open';
  const sunday = f.phase === 'sunday';
  if (firstWeek(f)) {
    // Mid-week, or on Sunday before the lamp: the first session sees its whole week, and Lina's answer.
    if (!sunday || !f.lamp) return f.boxIn ? 'wait' : 'notYet';
    return f.reply ? 'reply' : 'close';
  }
  // The climax's Sunday waits for the choice: the glass goes down, or the lamp is lit with it.
  if (f.undecided === true) return f.boxIn ? 'wait' : 'notYet';
  if (OUT.has(f.phase) || f.hauling) return 'busy';
  // Mid-week the open latch stays open, as in the first week: closing the shutters only ends a week, on its Sunday. A
  // hand passing over the sill used to close them on the week (a pause nobody asked for); now Tocco says not yet.
  if (!sunday && f.phase !== 'shut') return f.boxIn ? 'wait' : 'notYet';
  if (sunday && f.aid && !f.aidCardIn) return 'wait';
  // The last Sunday's lamp starts the last night: closed without it, the season would start over with no night at all.
  if (sunday && f.last && !f.lamp) return f.boxIn ? 'wait' : 'notYet';
  if (sunday && f.reply) return 'reply';
  if (sunday && f.conducting) return 'hurry';
  // The windows are on: what the season came to is said before the shutters close on it.
  if (sunday && f.last && f.lastLines === true) return 'wait';
  return 'close';
}

/** A haul on the rope: it counts while the bell has rung and the shutters are open; otherwise the rope answers dully. */
export type RopeMove = 'pull' | 'wrong';

export function ropeMove(f: LockFacts): RopeMove {
  return f.phase === 'bell' && f.open ? 'pull' : 'wrong';
}

/** How each haul sounds, low to high (the pulley's creak, played faster), so the count is heard (pulls 1 to 3). */
export function pullPitch(pulls: number): number {
  return [0.8, 1, 1.25][Math.min(PULLS, Math.max(1, pulls)) - 1];
}

/**
 * The brake lever, pulled or poked: send the basket down ('lower'); in the
 * first week, refuse with nothing in the basket ('empty') or out of turn
 * ('wrong'); later weeks, out of turn, it only swings ('idle'); with the
 * glass in the town's basket it sends it ('send').
 */
export type LeverMove = 'lower' | 'send' | 'empty' | 'wrong' | 'idle';

export function leverMove(f: LockFacts): LeverMove {
  const first = firstWeek(f);
  if (f.loaded === true) return 'send';
  if (f.phase === 'choosing' && f.open) {
    if (!first || f.chosen >= 0) return 'lower';
    // "Pick one first." only once there is something to pick.
    return f.choiceReady === false ? 'wrong' : 'empty';
  }
  return first ? 'wrong' : 'idle';
}

/** Whether the lever follows the hand that pulls its knob: always from the second week; in the first, only with something in the basket. */
export function leverFree(f: LockFacts): boolean {
  return !firstWeek(f) || (f.phase === 'choosing' && f.open && f.chosen >= 0);
}
