import { load, save, type Saved } from '../save.js';
import { available, BUILD, COST, type Kept, type RealWeek, replay, type Season, type Town, type Weather, weekOf } from './model.js';
import data from './season.json';

/**
 * The season as it is being played: the baked real weeks, the Keeper's kept
 * weeks (saved in the browser) and the town the model replays from them.
 * Kept free of systems and DOM, like signals.ts and stance.ts; the systems
 * read it and tell it when a week is kept.
 */

const season = data as Season;

/** Weeks in the season. */
export const SEASON_WEEKS = season.weeks.length;

let saved: Saved = load();
// A save from a longer season, or past its end, starts the season again.
if (saved.kept.length >= SEASON_WEEKS) saved = { kept: [], settled: 0 };
let town: Town = replay(season, saved.kept);
let before: Town = replay(season, saved.kept.slice(0, -1));

/** The town as the current week begins. */
export function currentTown(): Town {
  return town;
}

/** The town as the last kept week began: what changed overnight is the difference. */
export function townBefore(): Town {
  return before;
}

/** The real data of a season week; the current one by default. */
export function realWeek(week = town.week): RealWeek | null {
  return weekOf(season, week);
}

/**
 * A week's weather, if it has one: only weeks checked for loss of life and
 * reviewed carry it; the dev build also shows those still waiting, to try
 * the scene.
 */
export function weatherOf(week = town.week): Weather | null {
  const real = realWeek(week);
  if (real == null) return null;
  return real.weather ?? (import.meta.env.DEV ? (real.weatherPending ?? null) : null);
}

/** Whether the option at a place on the sill can be chosen this week. */
export function canChoose(index: number): boolean {
  const real = realWeek();
  return real != null && available(town, real.kind, index);
}

let refusal: 'coins' | 'built' = 'coins';

/** Why an option was just refused: the jar is too light, or that kind is already built. */
export function refuse(index: number): void {
  const real = realWeek();
  refusal = index === BUILD && real != null && town.builtIn[real.kind] > 0 ? 'built' : 'coins';
}

export function lastRefusal(): 'coins' | 'built' {
  return refusal;
}

/** Whether this is the first week of the season in which the market feels a big fuel week. */
export function firstLag(): boolean {
  if (!town.lagging) return false;
  for (let k = 1; k < saved.kept.length; k += 1) if (replay(season, saved.kept.slice(0, k)).lagging) return false;
  return true;
}

/** Coins in the jar now: this week's, less what the basket carried down. */
export function coinsShown(chosen: number, paid: boolean): number {
  return paid && chosen >= 0 ? town.coins - (COST[chosen] ?? 0) : town.coins;
}

/** The last kept week, or null at the start of the season. */
export function lastKept(): Kept | null {
  return saved.kept[saved.kept.length - 1] ?? null;
}

/** Whether last week's calls are still to be settled aloud on this morning. */
export function unsettled(): boolean {
  return saved.kept.length > saved.settled;
}

export function markSettled(): void {
  saved.settled = saved.kept.length;
  save(saved);
}

/** The week is over: remember what was done and move the town on. */
export function keepWeek(entry: Kept): void {
  saved.kept.push(entry);
  before = town;
  town = replay(season, saved.kept);
  save(saved);
}

/** After the last week, the season starts over. */
export function restartSeason(): void {
  saved = { kept: [], settled: 0 };
  town = replay(season, []);
  before = town;
  save(saved);
}
