/**
 * Lina's window across the square: one warm light, and this is the one
 * place that decides how bright it is (FamilySystem writes it to the
 * window's glow, ShutterSystem borrows the farewell for the light through
 * the slats). It greets the Keeper as the week's shutters open, rests, dims
 * while the week's card is up, rises and waits once the basket has landed,
 * answers the Sunday lamp, and blinks goodbye through the closing shutters.
 * Free of imports, so `node --test` loads it as it is; phases are the
 * components.ts Phase values.
 */

export type WindowState = 'dark' | 'greet' | 'rest' | 'dim' | 'invite' | 'answer' | 'farewell';

/** Brightness of the window's glow (0 to 1) in each steady state. */
export const REST = 0.35;
export const DIM = 0.2;
export const PEAK = 1;
export const INVITE = 0.9;
/** After its answer, the window stays this warm until the shutters close. */
export const ANSWERED = 0.6;
/**
 * A week the Keeper helped the family, their window burns this warm at full evening (META_VR_DINAMIKLER.md item 13):
 * as warm as after Lina's answer, about 1.7 times its rest, so it reads from the tower.
 */
export const HELPED = 0.6;

/** The greeting: this long after the week's shutters open, two slow rises and falls over GREET_SECONDS. */
export const GREET_AFTER = 2;
/** On a morning Tocco settles last week's call after a hush and a chime, the greeting waits until his line has been up this long. */
export const GREET_AFTER_REVEAL = 1.5;
export const GREET_SECONDS = 2.4;
/** The farewell: this long after the shutters start to close on a kept week, two blinks over FAREWELL_SECONDS. */
export const FAREWELL_AFTER = 1;
export const FAREWELL_SECONDS = 1.6;
/** The invitation rises over this long, then waits, breathing a little. */
export const INVITE_RISE = 1;
const INVITE_BREATH = 0.05;
const INVITE_BREATH_SECONDS = 3;
/** The answer: up to full in ANSWER_RISE, held for ANSWER_HOLD, then down to ANSWERED over ANSWER_SETTLE. */
export const ANSWER_RISE = 0.8;
export const ANSWER_HOLD = 2.5;
export const ANSWER_SETTLE = 1.5;

/** What the window needs to know of the week, each frame. Seconds are -1 when the moment has not come. */
export interface WindowFacts {
  phase: string;
  /** Seconds in the current phase (Week.timer). */
  timer: number;
  /** Seconds into the morning when the greeting begins: GREET_AFTER, later on a morning Tocco holds a reveal. */
  greetAt: number;
  open: boolean;
  /** A solidarity week: the window only rests (no greeting, no music). Its farewell is decided by `kept`. */
  aid: boolean;
  chosen: number;
  /** The family was visited since the basket landed. */
  visited: boolean;
  /** In the first week, their turn went by unvisited and the sun is next (line-queue.ts familyDone): the window rests. */
  passed: boolean;
  /** The Keeper helped the family this week. */
  helped: boolean;
  /** How far into the evening the town is, 0 to 1. */
  evening: number;
  lamp: boolean;
  /** Seconds since Lina answered the Sunday lamp, -1 if she has not. */
  answered: number;
  /**
   * Seconds since the shutters began to close on the week just kept, -1 if
   * they have not or the week kept was a solidarity week (decided as it is
   * kept: by then the week on the Week entity is already the next one).
   */
  kept: number;
}

export function windowState(f: WindowFacts): WindowState {
  if (!f.open) return inside(f.kept, FAREWELL_AFTER, FAREWELL_SECONDS) ? 'farewell' : 'dark';
  if (f.aid) return 'rest';
  if (f.phase === 'morning' && inside(f.timer, f.greetAt, GREET_SECONDS)) return 'greet';
  // The week's card is up: the light across the square dims while it is read, until something goes in the basket.
  if (f.phase === 'rising' || (f.phase === 'choosing' && f.chosen < 0)) return 'dim';
  if (f.phase === 'landed' && !f.visited && !f.passed) return 'invite';
  if (f.phase === 'sunday' && f.lamp && f.answered >= 0) return 'answer';
  return 'rest';
}

/** How bright the window's glow is for `f`, 0 to 1. */
export function windowLevel(f: WindowFacts): number {
  const state = windowState(f);
  let level = 0;
  switch (state) {
    case 'dark':
      return 0;
    case 'farewell':
      return PEAK * twice(f.kept - FAREWELL_AFTER, FAREWELL_SECONDS);
    case 'greet':
      level = REST + (PEAK - REST) * twice(f.timer - f.greetAt, GREET_SECONDS);
      break;
    case 'dim':
      level = DIM;
      break;
    case 'invite': {
      const up = smooth(f.timer / INVITE_RISE);
      level = REST + (INVITE - REST) * up + INVITE_BREATH * up * Math.sin((2 * Math.PI * f.timer) / INVITE_BREATH_SECONDS);
      break;
    }
    case 'answer':
      level = answerLevel(f.answered);
      break;
    default:
      level = REST;
  }
  // A helped week's evenings: the warmer of the two.
  if (f.helped && !f.aid && (f.phase === 'days' || f.phase === 'sunday')) level = Math.max(level, HELPED * f.evening);
  return level;
}

/** Up from rest to full, held, then settled warm. */
function answerLevel(t: number): number {
  if (t < ANSWER_RISE) return REST + (PEAK - REST) * smooth(t / ANSWER_RISE);
  if (t < ANSWER_RISE + ANSWER_HOLD) return PEAK;
  return PEAK + (ANSWERED - PEAK) * smooth((t - ANSWER_RISE - ANSWER_HOLD) / ANSWER_SETTLE);
}

/**
 * Lina's answer to the Sunday lamp (Devir 1, item 18): once the lamp is
 * lit, the town waits for the Keeper to look across. Turning the head to
 * within REPLY_LOOK_DEGREES of her window brings the answer; two notes come
 * from the window and the flame leans toward it (halfway through the wait,
 * in the first week 1.5 s after the lamp, as Tocco points across); at the
 * end of the wait she answers anyway. The first week waits longest, and
 * there, if the head has still not turned 6 s after the lamp, Tocco says to
 * look across (Devir 1b item 11).
 */
export const REPLY_LOOK_DEGREES = 20;
/** In the first week her window calls this soon after the lamp is lit. */
export const FIRST_CALL = 1.5;
/** In the first week, still waiting this long after the lamp, Tocco says "Look across the square." */
export const LOOK_LINE_AT = 6;

export function replyWait(week: number): number {
  return week <= 1 ? 12 : 6;
}

export function replyCallAt(week: number): number {
  return week <= 1 ? FIRST_CALL : replyWait(week) / 2;
}

/**
 * Whether the first week's look line is due, `waited` seconds into the wait
 * for her answer (-1: not waiting). Only while she has not answered, so only
 * with the head still more than REPLY_LOOK_DEGREES from her window (a look
 * within it answers at once).
 */
export function lookLineDue(week: number, waited: number): boolean {
  return week <= 1 && waited >= LOOK_LINE_AT;
}

/**
 * Whether lighting the lamp in week `week` waits for Lina's answer. The
 * season's last Sunday does not: its lamp starts the last night at once,
 * and she answers as it lights. A solidarity week has no lamp.
 */
export function replyHolds(week: number, seasonWeeks: number, aid: boolean): boolean {
  return !aid && week < seasonWeeks;
}

export type ReplyStep = 'wait' | 'call' | 'answer';

/** Where the wait stands after `waited` seconds, with the head `look` degrees from her window. */
export function replyStep(waited: number, week: number, look: number): ReplyStep {
  if (look <= REPLY_LOOK_DEGREES || waited >= replyWait(week)) return 'answer';
  return waited >= replyCallAt(week) ? 'call' : 'wait';
}

function inside(t: number, from: number, length: number): boolean {
  return t >= from && t < from + length;
}

/** Two smooth rises and falls over `length` seconds, 0 at both ends. */
function twice(t: number, length: number): number {
  const s = Math.sin((2 * Math.PI * t) / length);
  return s * s;
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
