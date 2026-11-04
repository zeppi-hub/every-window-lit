/**
 * The first week's choice comes in three steps, each alone for a while, so
 * the Keeper reads one thing at a time (Devir 1b item 7): the card and what
 * it means (the kerb glows), then the coin jar with its balance (the jar
 * glows, Tocco says how many coins there are), then the three things on the
 * sill with their tags (they glow in turn, and the instruction says to tap
 * one). From the second week the card, the jar and the three things come
 * together, as the basket lands, without tags or dots. Worked out from the Week entity each frame
 * (phase, timer, choice), so every system that shows a step agrees and
 * nothing needs resetting; free of imports, so `node --test` loads it as it
 * is. Phases are the components.ts Phase values.
 */

/**
 * How long the card is alone, counted from the basket standing on the sill
 * (its line goes up then, clear of the basket: tests/line-places.test.mjs),
 * and how long the jar is.
 */
export const CARD_SECONDS = 4.5;
export const JAR_SECONDS = 4.5;

/** Which of the three steps is on: the card alone, the jar, or the three things to choose from ('' outside the choice). */
export type ChoiceStep = '' | 'card' | 'jar' | 'choose';

/**
 * The step of the choice for week `n` in `phase`, `timer` seconds into it,
 * with `chosen` in the basket (-1 for nothing); `aid` for a solidarity week
 * (its letter and the Keeper's own things, not staged).
 */
export function choiceStep(n: number, phase: string, timer: number, chosen: number, aid: boolean): ChoiceStep {
  if (phase !== 'rising' && phase !== 'choosing') return '';
  if (n !== 1 || aid) return phase === 'choosing' ? 'choose' : '';
  if (phase === 'rising') return 'card';
  // A Keeper who chooses before being asked has reached the choice.
  if (chosen >= 0) return 'choose';
  if (timer < CARD_SECONDS) return 'card';
  if (timer < CARD_SECONDS + JAR_SECONDS) return 'jar';
  return 'choose';
}

/**
 * Whether the three things can be taken, tapped or dropped in the basket:
 * only once the choice has reached its third step, so a tap during the
 * card or the jar never skips the jar's line (Tocco says it as that step
 * comes). From the second week that is as soon as the choice is on.
 */
export function thingsOpen(step: ChoiceStep): boolean {
  return step === 'choose';
}

/**
 * Whether the three things' tags and the jar's dots are up: only while the
 * first week's choice is on (not a solidarity week), before the landing
 * brings the little model to the sill; from the second week the jar's own
 * coins show the balance, as before.
 */
export function tagsUp(n: number, phase: string, aid: boolean): boolean {
  return n === 1 && phase === 'choosing' && !aid;
}

/** Whether the jar is shown in the choice: from its own step on. */
export function jarShown(step: ChoiceStep): boolean {
  return step === 'jar' || step === 'choose';
}

/**
 * The coin dots over the jar while the Keeper chooses: the balance, less
 * what the thing in the basket costs (those dots drop away as it goes in).
 */
export function jarDots(balance: number, cost: number): number {
  return Math.max(0, balance - cost);
}
