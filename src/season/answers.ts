import type { Kind, RealWeek, Town } from './model.js';

/**
 * Tocco's answers to the three questions the Keeper can ask him (poke him,
 * then a question): built from the season's model, so they always fit the
 * town, and short enough for his panel. A live sentence may follow
 * (advisor.ts). Type-only imports, so `node --test` can load this file.
 */

export const QUESTIONS = ['Who does this help?', 'What happens later?', 'What would you do?'] as const;

/** Mirrors model.ts: easing, help, build; and when a build starts working. */
const EASE = 0;
const HELP = 1;
const BUILD = 2;
const WORKING_AFTER = 3;

const BUILT: Readonly<Record<Kind, string>> = { fuel: 'tram', power: 'turbines', food: 'roof garden' };
const WEEKS = ['', 'a week', 'two weeks', 'three weeks'];

/** Who the choice in the basket helps; `chosen` -1 is an empty basket (or nothing chosen yet, before it goes down). */
export function whoItHelps(chosen: number, settled: boolean): string {
  if (chosen === EASE) return 'Everyone a little, while it lasts.';
  if (chosen === HELP) return "Nora's family. The others wait.";
  if (chosen === BUILD) return 'No one yet. Everyone, later on.';
  return settled ? "The jar. It'll help another week." : 'Depends what goes in the basket.';
}

/** What comes next, in this model: a build on its way, the lag to the market, or the family's tally. */
export function whatHappensLater(real: RealWeek, town: Town, chosen: number): string {
  for (const kind of ['fuel', 'power', 'food'] as const) {
    const since = town.builtIn[kind];
    if (since <= 0) continue;
    const left = WORKING_AFTER - (town.week - since);
    if (left > 0) return `The ${BUILT[kind]} works in ${WEEKS[left] ?? 'a few weeks'}.`;
  }
  if (chosen === BUILD) return 'Scaffolding next week. Working in three.';
  if (town.lagging || (real.kind === 'fuel' && real.tier >= 2)) return "Food prices follow fuel later. That's my guess.";
  if (real.tier >= 2 && chosen !== HELP) return "Hard weeks add up for Nora's family.";
  return "New prices next week. That's all I know.";
}

/** Tocco's own pick for the week, from a plain rule: ease what bites if the jar allows, else help, else build, else save. */
export function whatIdDo(real: RealWeek, town: Town): string {
  if (real.tier >= 2 && town.coins >= 3) return 'Ease it. The jar can take it.';
  if (real.tier >= 2) return "Help Nora. It's cheap, and it counts.";
  if (town.builtIn[real.kind] <= 0 && town.coins >= 2) return `Build the ${BUILT[real.kind]}. It pays back later.`;
  if (real.tier <= 0) return 'Send it empty. Fill the jar.';
  return 'Help Nora. Small weeks add up.';
}

export function answer(q: number, real: RealWeek, town: Town, chosen: number, settled: boolean): string {
  if (q === 0) return whoItHelps(chosen, settled);
  if (q === 1) return whatHappensLater(real, town, chosen);
  return whatIdDo(real, town);
}
