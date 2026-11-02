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

/**
 * A step of the week that has an instruction: the latch to open the
 * shutters, the rope, choosing, the lever, Nora's family (on the little
 * model in the first week, her window across the square later), the sun to
 * the first evening and on to Sunday, the lamp, the look across to Lina's
 * window, and the latch to close the week.
 */
export type Step = 'latch' | 'bell' | 'choosing' | 'chosen' | 'model' | 'visit' | 'sun' | 'sunOn' | 'lamp' | 'look' | 'close';

/** What the step needs to know of the week, each frame (all of it on the Week entity or in talk.ts). */
export interface StepFacts {
  week: number;
  phase: string;
  open: boolean;
  chosen: number;
  /** The family was visited since the basket landed (talk.ts familyVisited). */
  visited: boolean;
  /** Sunday's call is made, or the week has none (season/settle.ts callsOpen). */
  called: boolean;
  lamp: boolean;
  /** The town waits for Lina's answer to the lamp (talk.ts replyWaiting). */
  reply: boolean;
  /** A solidarity week: Tocco says nothing. */
  quiet: boolean;
  /** The choice has reached its third step, the three things to tap (choice-moment.ts; at once from the second week). */
  choiceReady: boolean;
}

/** The step the week is in, or '' between steps (the morning, the basket rising or going down, the Sunday call, Lina's answer). */
export function stepOf(f: StepFacts): Step | '' {
  if (f.quiet) return '';
  // Closed at any point of the week: the latch opens them.
  if (!f.open) return 'latch';
  switch (f.phase) {
    case 'bell':
      return 'bell';
    case 'choosing':
      // In the first week the card and the jar come first, each alone: the choosing instruction waits for them.
      if (f.chosen >= 0) return 'chosen';
      return f.choiceReady ? 'choosing' : '';
    case 'landed':
      if (!f.visited) return f.week === 1 ? 'model' : 'visit';
      return 'sun';
    case 'days':
      return 'sunOn';
    case 'sunday':
      if (!f.called) return '';
      if (!f.lamp) return 'lamp';
      return f.reply ? '' : 'close';
    default:
      return '';
  }
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
}

/** What to do this frame: leave the panel, put up the next story line, put up the step's instruction, or clear it. */
export type PanelMove = 'keep' | 'story' | 'instruction' | 'clear';

export function panelMove(f: PanelFacts): PanelMove {
  const story = f.waiting > 0 && !f.holding;
  const due = f.instruction !== '' && !f.holding && (f.persist || !f.told);
  // An instruction whose step has ended goes this frame, for what comes next or for nothing.
  if (f.up === 'instruction' && f.upStep !== f.step) return story ? 'story' : due ? 'instruction' : 'clear';
  if (f.up === 'none') return story ? 'story' : due ? 'instruction' : 'keep';
  const read = f.shownFor >= (f.least ?? MIN_SECONDS);
  if (f.up === 'instruction') {
    // Held, the instruction goes down; it is put up again once the hold ends if it was not yet read, or persists.
    if (f.holding) return 'clear';
    if (story && read) return 'story';
    if (!f.persist && f.left <= 0) return 'clear';
    return 'keep';
  }
  // A story line: the next one, or the step's instruction, once it has been read; gone once its time is up.
  if (story && read) return 'story';
  if (due && read) return 'instruction';
  return f.left <= 0 ? 'clear' : 'keep';
}
