import { load, save, type Saved } from '../save.js';
import { available, BUILD, COST, type GlobeChoice, HELP, type Kept, type RealWeek, replay, type Season, type Solidarity, type Town, type Weather, weekOf } from './model.js';
import { callsToSettle } from './settle.js';
import data from './season.json';

/**
 * The season as it is being played: the baked real weeks, the Keeper's kept
 * weeks (saved in the browser) and the town the model replays from them.
 * Kept free of systems and DOM, like signals.ts and stance.ts; the systems
 * read it and tell it when a week is kept.
 */

const baked = data as Season;
const HARD_WEEKS = 'every-window-lit.hard-weeks';

/** Whether weeks that overlap a real disaster on the mainland are played (the start page's switch); on unless switched off. */
export function hardWeeksOn(): boolean {
  try {
    return window.localStorage.getItem(HARD_WEEKS) !== 'off';
  } catch {
    return true;
  }
}

/**
 * The season as it will be played. A week already kept is played back the
 * way it was played (its `aid` flag): a solidarity week if it was one,
 * otherwise its calm stand-in. A week not yet kept is a solidarity week
 * only if it was reviewed (or, in the dev build, still waiting) and such
 * weeks are switched on; otherwise its calm stand-in of the same kind.
 */
function resolve(weeks: Season, kept: readonly Kept[]): Season {
  const on = hardWeeksOn();
  const current = kept.length;
  return {
    country: weeks.country,
    weeks: weeks.weeks.map((week, i) => {
      const solidarity = week.solidarity ?? (import.meta.env.DEV ? week.solidarityPending : undefined);
      const played = kept[i];
      // The week in progress keeps what it began as, whatever the switch says meanwhile.
      const pinnedNow = i === current && pinned != null ? pinned : null;
      const asAid = played != null ? played.aid === true && solidarity != null : pinnedNow != null ? pinnedNow && solidarity != null : solidarity != null && on;
      if (asAid) return { ...week, solidarity };
      if ((week.solidarity != null || week.solidarityPending != null) && week.calm != null) return week.calm;
      return week;
    }),
  };
}

/** What the week in progress has found so far; kept with it as its shutters close. */
type Found = Pick<Kept, 'globe' | 'globePlaced' | 'seen' | 'drawing'>;
let found: Found = {};

/** Whether the week in progress began as a solidarity week (pinned when its shutters opened), or null between weeks. */
let pinned: boolean | null = null;
let saved: Saved = load();
let season = resolve(baked, saved.kept);

/** Weeks in the season. */
export const SEASON_WEEKS = season.weeks.length;

// A save from a longer season, or past its end, starts the season again.
if (saved.kept.length >= SEASON_WEEKS) saved = { kept: [], settled: 0 };
let town: Town = replay(season, saved.kept);
let settledTown: Town = replay(season, saved.kept.slice(0, saved.settled));

/** Works the season and the towns out again from the kept weeks. */
function refresh(): void {
  season = resolve(baked, saved.kept);
  town = replay(season, saved.kept);
  settledTown = replay(season, saved.kept.slice(0, saved.settled));
}

/** The country whose real prices the season replays; it is named on the card's credit line and under the start page's points. */
export function seasonCountry(): string {
  return season.country;
}

/** The season's real weeks as they will be played, for the start page's line on where its prices come from. */
export function seasonWeeksPlayed(): readonly RealWeek[] {
  return season.weeks;
}

/** The town as the current week begins. */
export function currentTown(): Town {
  return town;
}

/** The town when calls were last settled aloud: what changed since is the difference. */
export function townBefore(): Town {
  return settledTown;
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
  // A solidarity week never carries weather.
  if (real == null || real.solidarity != null) return null;
  return real.weather ?? (import.meta.env.DEV ? (real.weatherPending ?? null) : null);
}

/** Whether this build has any week that overlaps a real disaster: reviewed, or (dev build only) waiting for review. */
export function hasHardWeeks(): boolean {
  return baked.weeks.some((week) => week.solidarity != null || (import.meta.env.DEV && week.solidarityPending != null));
}

/** The start page's switch: play weeks that overlap a real disaster, or their calm stand-ins. */
export function setHardWeeks(on: boolean): void {
  try {
    window.localStorage.setItem(HARD_WEEKS, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice holds for this visit only.
  }
  refresh();
}

/** A solidarity week's letter and record, if this week is one. */
export function solidarityOf(week = town.week): Solidarity | null {
  return realWeek(week)?.solidarity ?? null;
}

/**
 * The kept weeks as short codes for Tocco's live line: kind (F, P, G) and
 * choice (E, H, B, N) per week. Solidarity weeks never leave the game.
 */
export function historyCodes(): string {
  const letters = { fuel: 'F', power: 'P', food: 'G' } as const;
  return saved.kept
    .map((done, i) => {
      const real = realWeek(i + 1);
      if (real == null || real.solidarity != null) return '';
      return `${letters[real.kind]}${'EHB'[done.chosen] ?? 'N'}`;
    })
    .join('');
}

/** The shutters opened on a new week: it stays what it began as until it is kept, whatever the start page's switch does. */
export function beginWeek(): void {
  pinned = solidarityOf() != null;
}

/** Whether the option at a place on the sill can be chosen this week. */
export function canChoose(index: number): boolean {
  const real = realWeek();
  return real != null && available(town, real.kind, index, real.solidarity != null);
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
  // What goes to the boat in a solidarity week costs nothing.
  if (solidarityOf() != null) return town.coins;
  return paid && chosen >= 0 ? town.coins - (COST[chosen] ?? 0) : town.coins;
}

/** The last kept week, or null at the start of the season. */
export function lastKept(): Kept | null {
  return saved.kept[saved.kept.length - 1] ?? null;
}

/** Kept weeks this season in which the Keeper helped the family (not counting what went to the boat in a solidarity week). */
export function keptHelps(): number {
  return saved.kept.filter((k) => k.chosen === HELP && k.aid !== true).length;
}

/** Whether last week's calls are still to be settled aloud on this morning. */
export function unsettled(): boolean {
  return saved.kept.length > saved.settled;
}

export function markSettled(): void {
  saved.settled = saved.kept.length;
  settledTown = town;
  save(saved);
}

/** Kept weeks since calls were last settled aloud that had calls to settle, oldest first, with their week numbers. */
export function unsettledCalls(): Array<{ week: number; kept: Kept }> {
  return callsToSettle(saved.kept, saved.settled);
}

/** The Keeper set the globe in the lamp by hand. */
export function noteGlobePlaced(): void {
  found.globePlaced = true;
}

/** The Keeper found the mark on the old frame. */
export function noteMarkSeen(): void {
  found.seen = true;
}

/** The Keeper brought Lina's drawing up close. */
export function noteDrawingSeen(): void {
  found.drawing = true;
}

/** The climax's choice: the glass went down, or the lamp was lit with it. */
export function noteGlobe(choice: GlobeChoice): void {
  found.globe = choice;
}

/** Where the glass stands as the week goes on: this week's choice, or the season's. */
export function globeChoice(): GlobeChoice | null {
  return found.globe ?? town.globe;
}

/** Whether the mark on the old frame has been found, this week or before. */
export function markSeen(): boolean {
  return found.seen === true || town.markSeen;
}

/** Whether the Keeper set the globe in the lamp by hand, this week or before. */
export function globePlaced(): boolean {
  return found.globePlaced === true || town.globePlaced;
}

/** The week is over: remember what was done and move the town on. */
export function keepWeek(entry: Kept): void {
  saved.kept.push({ ...entry, ...found });
  found = {};
  pinned = null;
  refresh();
  save(saved);
}

/** After the last week, the season starts over. */
export function restartSeason(): void {
  saved = { kept: [], settled: 0 };
  found = {};
  pinned = null;
  refresh();
  save(saved);
}
