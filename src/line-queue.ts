/**
 * What Tocco's panel shows, frame by frame (ToccoSystem applies it). Two
 * kinds of line share the one panel. A story line (the morning's news,
 * the card, an answer, what a choice did) is said once: it stays up at
 * least MIN_SECONDS before the next waiting line replaces it, and goes
 * after LINE_SECONDS. An instruction belongs to the step the week is in
 * (stepOf): it is never queued, so a step that has ended can never show
 * its line, and the frame its step ends it goes. In the first week an
 * instruction stays up from the frame it is due until its step ends; a
 * story line said meanwhile takes the panel once the instruction has been
 * up MIN_SECONDS, and the instruction comes back once that line has been
 * up as long. From the second week an instruction is said once, as a
 * story line is, and still goes the frame its step ends. Free of imports,
 * so `node --test` loads it as it is; phases are the components.ts Phase
 * values.
 */

/** Seconds a line stays up, and the least it stays before the next one in line replaces it. */
export const LINE_SECONDS = 7;
export const MIN_SECONDS = 4;
/** With Larger captions a line takes longer to read: it stays this long before another replaces it. */
export const LARGE_MIN_SECONDS = 6;

/**
 * A step of the week that has an instruction: the latch to open the
 * shutters, the rope, choosing, the lever, Nora's family (on the little
 * model in the first week, her window across the square later), the sun to
 * the first evening and on to Sunday, the lamp, the look across to Lina's
 * window (the first week, only if the head has not turned 6 s after the
 * lamp), and the latch to close the week; and in the first week, while the
 * family's box is in the Keeper's window, the knock on its glass.
 */
export type Step = 'latch' | 'bell' | 'choosing' | 'chosen' | 'model' | 'visit' | 'sun' | 'sunOn' | 'lamp' | 'glass' | 'look' | 'close' | 'knock';

/** What the step needs to know of the week, each frame (all of it on the Week entity or in talk.ts). */
export interface StepFacts {
  /** The climax's choice is due: the town's note is on the sill, and neither way chosen. */
  glass?: boolean;
  /** The town's note is on the sill. */
  noteIn?: boolean;
  week: number;
  phase: string;
  open: boolean;
  chosen: number;
  /** The family was visited since the basket landed (talk.ts familyVisited). */
  visited: boolean;
  /** Seconds since the basket landed (Week.timer in the landed phase; 0 in any other). */
  landedFor: number;
  /** Sunday's call is made, or the week has none (season/settle.ts callsOpen). */
  called: boolean;
  lamp: boolean;
  /** The town waits for Lina's answer to the lamp (talk.ts replyWaiting). */
  reply: boolean;
  /** In the first week, the head still not turned to her window 6 s into that wait (season/window-light.ts lookLineDue). */
  look?: boolean;
  /** A solidarity week: Tocco says nothing. */
  quiet: boolean;
  /** The choice has reached its third step, the three things to tap (choice-moment.ts; at once from the second week). */
  choiceReady: boolean;
  /** Seconds the family's box has been in the Keeper's window since it arrived (talk.ts familyBoxFor); -1 or absent while it is home or on its way. */
  box?: number;
  /** The Keeper knocked on its glass on this visit (talk.ts familyKnocked). */
  knocked?: boolean;
}

/**
 * The family's box in the first week (Devir 1b item 14): their line is read
 * for BOX_READ_SECONDS after the box arrives, then Tocco says to knock on its
 * glass. At the knock Lina's paper boat comes and her line is up
 * LINA_SECONDS; the box goes home by itself KNOCK_HOME seconds after the
 * knock, or ARRIVAL_HOME seconds after it arrived if it is never knocked on.
 * A knock before their line has been read leaves it its BOX_READ_SECONDS:
 * the boat comes at once, Lina's line and the way home count from then
 * (knockClockRuns).
 */
export const BOX_READ_SECONDS = 4;
export const LINA_SECONDS = 4;
export const KNOCK_HOME = 5;
export const ARRIVAL_HOME = 14;

/**
 * Whether the knock's clock runs this frame (`knockedFor` in boxGoesHome and
 * familyLineNow): in the first week only once the family's line has been
 * read, `shownFor` >= BOX_READ_SECONDS, so it counts from the knock or from
 * then, whichever is later; from the second week at once.
 */
export function knockClockRuns(week: number, shownFor: number): boolean {
  return week !== 1 || shownFor >= BOX_READ_SECONDS;
}

/**
 * Whether the family's box goes home by itself now: only in the first week
 * (later the Keeper sends it home: its hook, a push, the window again),
 * KNOCK_HOME seconds after the knock, or ARRIVAL_HOME seconds after it
 * arrived without one. `shownFor`: seconds since it arrived (-1 while it is
 * not in the window); `knockedFor`: seconds the knock's clock has run
 * (knockClockRuns; -1: no knock).
 */
export function boxGoesHome(week: number, shownFor: number, knockedFor: number): boolean {
  if (week !== 1 || shownFor < 0) return false;
  return knockedFor >= 0 ? knockedFor >= KNOCK_HOME : shownFor >= ARRIVAL_HOME;
}

/**
 * What the family's line over their box shows, `shownFor` seconds after it
 * arrived on this visit (-1 before; as it was while it flies home), the
 * knock's clock at `knockedFor` (knockClockRuns; -1: no knock yet): theirs.
 * In the first week one line at a time (Devir 1b section 4): theirs for
 * BOX_READ_SECONDS, even if the Keeper knocks sooner; then nothing while
 * Tocco's knock line is up (stepOf 'knock'); Lina's for LINA_SECONDS from
 * the knock (her lamp held up meanwhile), then nothing until the box has
 * gone home.
 */
export function familyLineNow(week: number, shownFor: number, knockedFor: number): 'theirs' | 'lina' | 'none' {
  if (week !== 1 || shownFor < BOX_READ_SECONDS) return 'theirs';
  if (knockedFor < 0) return 'none';
  return knockedFor < LINA_SECONDS ? 'lina' : 'none';
}

/** In the first week, Nora's house on the little model gives way to the sun after this long without a visit (Devir 1b item 9). */
export const MODEL_SECONDS = 30;

/**
 * Whether the family's turn after the landing is over: they were visited,
 * or in the first week MODEL_SECONDS went by without a visit (the sun is
 * next then). From the second week it lasts until they are visited.
 */
export function familyDone(week: number, landedFor: number, visited: boolean): boolean {
  return visited || (week === 1 && landedFor >= MODEL_SECONDS);
}

/**
 * Whether the brass sun is on the sill (Devir 1b item 10): from the second
 * week always; in the first, not as the basket lands (Nora's house on the
 * little model comes first) but from the frame the family's box is home
 * after their visit, or MODEL_SECONDS after the landing without one, and on
 * through the evenings and Sunday. So the window and the sun never invite
 * at once.
 */
export function sunShown(week: number, phase: string, landedFor: number, visited: boolean, boxIn: boolean): boolean {
  if (week > 1 || phase === 'days' || phase === 'sunday') return true;
  if (phase !== 'landed') return false;
  return visited ? !boxIn : landedFor >= MODEL_SECONDS;
}

/** The step the week is in, or '' between steps (the morning, the basket rising or going down, the Sunday call, Lina's answer). */
export function stepOf(f: StepFacts): Step | '' {
  if (f.quiet) return '';
  // Closed at any point of the week: the latch opens them.
  if (!f.open) return 'latch';
  // The first week's family box, once their line has been read: the knock on its glass, until it comes. The week's own
  // step comes back after it (its instruction waits for the box to go home: ToccoSystem holds it meanwhile).
  if (f.week === 1 && f.knocked !== true && (f.box ?? -1) >= BOX_READ_SECONDS) return 'knock';
  switch (f.phase) {
    case 'bell':
      return 'bell';
    case 'choosing':
      // In the first week the card and the jar come first, each alone: the choosing instruction waits for them.
      if (f.chosen >= 0) return 'chosen';
      return f.choiceReady ? 'choosing' : '';
    case 'landed':
      if (!familyDone(f.week, f.landedFor, f.visited)) return f.week === 1 ? 'model' : 'visit';
      return 'sun';
    case 'days':
      return 'sunOn';
    case 'sunday':
      if (!f.called) return '';
      // The climax's Sunday: the town's note has come, and the choice waits (globe.ts).
      if (f.glass === true) return f.noteIn === true ? 'glass' : '';
      if (!f.lamp) return 'lamp';
      if (f.reply) return f.look === true ? 'look' : '';
      return 'close';
    default:
      return '';
  }
}

/**
 * A poke on him, with his last line not yet brought back: 'repeat' it, or
 * 'ask' (open his questions). From the second week a line still up opens the
 * questions at once: a poke that only keeps it up looks like nothing at all.
 */
export function pokeMove(week: number, lineUp: boolean, hasLast: boolean, repeated: boolean): 'repeat' | 'ask' {
  if (!hasLast || repeated) return 'ask';
  return week > 1 && lineUp ? 'ask' : 'repeat';
}

/** What is up on the panel. */
export type Up = 'none' | 'story' | 'instruction';

/** The panel and the week as they stand, each frame. */
export interface PanelFacts {
  up: Up;
  /** The step whose instruction is up ('' unless an instruction is up). */
  upStep: Step | '';
  /** Seconds the line up has been up, and seconds it has left (an instruction that persists has no end). */
  shownFor: number;
  left: number;
  /** Story lines waiting their turn. */
  waiting: number;
  /** His lines are held (the family's box is in, or the town waits for Lina's answer): nothing new goes up. */
  holding: boolean;
  /** The step the week is in, and its instruction ('' for none, or while he is not out to say it). */
  step: Step | '';
  instruction: string;
  /** Whether instructions stay up until their step ends (the first week). */
  persist: boolean;
  /** Whether this step's instruction has been read already (up MIN_SECONDS, or for its whole time): one that does not persist is said once. */
  told: boolean;
  /** The least the line up stays before another replaces it, if not MIN_SECONDS (a help line stays its 5 s). */
  least?: number;
  /**
   * This step's instruction goes up through the hold (the first week's look across, while the town waits for Lina's
   * answer; the first week's knock on the glass, while the family's box is in); story lines still wait.
   */
  through?: boolean;
  /** The step the story line up belongs to (the first week's help line at 16 s, or the "Tap me" after it), '' or absent for any other: like an instruction it goes the frame its step ends. */
  ownStep?: Step | '';
}

/** What to do this frame: leave the panel, put up the next story line, put up the step's instruction, or clear it. */
export type PanelMove = 'keep' | 'story' | 'instruction' | 'clear';

export function panelMove(f: PanelFacts): PanelMove {
  const story = f.waiting > 0 && !f.holding;
  const held = f.holding && f.through !== true;
  const due = f.instruction !== '' && !held && (f.persist || !f.told);
  // An instruction whose step has ended goes this frame, for what comes next or for nothing; so does a step's help line.
  const helpDone = f.up === 'story' && f.ownStep != null && f.ownStep !== '' && f.ownStep !== f.step;
  if ((f.up === 'instruction' && f.upStep !== f.step) || helpDone) return story ? 'story' : due ? 'instruction' : 'clear';
  if (f.up === 'none') return story ? 'story' : due ? 'instruction' : 'keep';
  const read = f.shownFor >= (f.least ?? MIN_SECONDS);
  if (f.up === 'instruction') {
    // Held, the instruction goes down; it is put up again once the hold ends if it was not yet read, or persists.
    if (held) return 'clear';
    if (story && read) return 'story';
    if (!f.persist && f.left <= 0) return 'clear';
    return 'keep';
  }
  // A story line: the next one, or the step's instruction, once it has been read; gone once its time is up.
  if (story && read) return 'story';
  if (due && read) return 'instruction';
  return f.left <= 0 ? 'clear' : 'keep';
}

/**
 * What a poke on him brings back when his last line `said` is not up: an
 * instruction whose step `lastStep` is still the week's `step` comes back
 * as that instruction (where its step's thing is, with its arrow, going
 * with its step); any other line as a story line, for a few seconds.
 */
export function pokeBack(lastStep: Step | '', step: Step | ''): 'instruction' | 'story' {
  return lastStep !== '' && lastStep === step ? 'instruction' : 'story';
}

/** A story line his panel takes down unread, to say again once his lines go on. */
export interface HeldLine {
  text: string;
  cue: boolean;
  keep: boolean;
  /** Not his last line once said again (it was not when first said). */
  forget: boolean;
  /** The step it belongs to, if any: dropped, waiting, once the week has moved past it. */
  step?: Step;
}

/**
 * The story line up, as it waits to be said again: still its step's (a
 * help line, the "Tap me" after it), so it never comes back once that step
 * is done, and still not his last line if it was not (`said` is his last).
 */
export function heldLine(text: string, said: string, lastCue: boolean, keep: boolean, ownStep: Step | ''): HeldLine {
  return { text, cue: text === said && lastCue, keep, forget: text !== said, ...(ownStep === '' ? {} : { step: ownStep }) };
}
