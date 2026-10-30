/**
 * The season's world model: plain, deterministic rules that turn the real
 * weeks (season.json, baked from public data by scripts/bake-season.mjs)
 * and the Keeper's choices into the state of the town. No randomness and
 * no clock: the same weeks and the same choices always give the same town,
 * so Tocco's lines and the view can never disagree.
 *
 * Self-contained on purpose (no imports), so `node --test` can load it as
 * it is.
 */

/** The three kinds of real week, each always shown in the same place. */
export type Kind = 'fuel' | 'power' | 'food';

/**
 * How hard the week presses on the town, against the series' own spread of
 * changes over the whole data window: -1 a clear fall (the town eases),
 * 0 calm, 1 small, 2 medium and 3 large rise.
 */
export type Tier = -1 | 0 | 1 | 2 | 3;

/** One week of the season, as baked. */
export interface RealWeek {
  kind: Kind;
  /** First day of the real period: a Monday for weekly series, the 1st for a monthly one. */
  start: string;
  /** "Mar 2024", for the label. */
  month: string;
  /** Monthly series speak of the month ("Real month"), weekly ones of the week. */
  monthly: boolean;
  /** Real change on the previous period, per cent, one decimal. */
  change: number;
  tier: Tier;
  /** Real change of the following period: it settles the Sunday call. */
  next: number;
  /** Changes of the periods just before this one, oldest first; Tocco's trend rule reads them. */
  before: number[];
}

export interface Season {
  country: string;
  weeks: RealWeek[];
}

/** The Keeper's options each week, by their place on the sill, and what each costs from the jar. */
export const EASE = 0;
export const HELP = 1;
export const BUILD = 2;
export const EMPTY = -1;
export const COST: Readonly<Record<number, number>> = { [EASE]: 3, [HELP]: 1, [BUILD]: 2, [EMPTY]: 0 };

/** The jar holds five coins at first, gains one each new week, and holds eight at most. */
export const JAR_START = 5;
export const JAR_MAX = 8;

/** A build stands as a scaffold from the week after it was chosen, and works from three weeks after. */
export const SCAFFOLD_AFTER = 1;
export const WORKING_AFTER = 3;

/** Build stages. */
export const NONE = 0;
export const SCAFFOLD = 1;
export const WORKING = 2;

/**
 * In this model a medium or large rise at the pumps reaches the market one
 * and two weeks later: the stalls thin out even in a week about something
 * else. A fixed, simple assumption, said as one.
 */
export const LAG_WEEKS = [1, 2] as const;

/** What the Keeper did in a kept week. */
export interface Kept {
  /** EASE, HELP, BUILD or EMPTY. */
  chosen: number;
  /** The Sunday calls: 1 up, 0 down, -1 none. */
  call: number;
  tocco: number;
}

/** The town at the start of a week, before this week's choice. */
export interface Town {
  /** 1-based week now starting. */
  week: number;
  coins: number;
  builds: Record<Kind, number>;
  /** The week each kind's build was chosen, 0 if never. */
  builtIn: Record<Kind, number>;
  /** Weeks the family was helped when it was pressed (a rise of tier 2 or more). */
  helped: number;
  /** Pressed weeks in which the family got no help. */
  strained: number;
  /** Notches carved so far for each side. */
  keeperNotches: number;
  toccoNotches: number;
  /** A fuel week of medium or large rise one or two weeks ago: the market feels it this week. */
  lagging: boolean;
}

const KINDS: readonly Kind[] = ['fuel', 'power', 'food'];

function noBuilds(): Record<Kind, number> {
  return { fuel: NONE, power: NONE, food: NONE };
}

/** The week's real data, or null past the end of the season. */
export function weekOf(season: Season, week: number): RealWeek | null {
  return season.weeks[week - 1] ?? null;
}

/** Up (1) or down (0): which way the next period really went. A flat next period counts as down. */
export function actual(week: RealWeek): number {
  return week.next > 0 ? 1 : 0;
}

/**
 * Tocco's call, from a plain trend rule: he goes with the average of the
 * last three changes before the week, and with this week's own change when
 * they cancel out.
 */
export function toccoCall(week: RealWeek): number {
  const recent = [...week.before.slice(-2), week.change];
  const sum = recent.reduce((a, b) => a + b, 0);
  if (Math.abs(sum) > 1e-9) return sum > 0 ? 1 : 0;
  return week.change > 0 ? 1 : 0;
}

/** Whether an option can be paid for from the jar. */
export function affordable(coins: number, chosen: number): boolean {
  return (COST[chosen] ?? 0) <= coins;
}

/** Whether an option is open this week: paid for, and a kind is built only once. */
export function available(town: Town, kind: Kind, chosen: number): boolean {
  if (!affordable(town.coins, chosen)) return false;
  if (chosen === BUILD && town.builtIn[kind] > 0) return false;
  return true;
}

/** Replays the kept weeks from the start and gives the town as the next week begins. */
export function replay(season: Season, kept: readonly Kept[]): Town {
  const town: Town = {
    week: 1,
    coins: JAR_START,
    builds: noBuilds(),
    builtIn: { fuel: 0, power: 0, food: 0 },
    helped: 0,
    strained: 0,
    keeperNotches: 0,
    toccoNotches: 0,
    lagging: false,
  };
  kept.forEach((done, index) => {
    const n = index + 1;
    const real = weekOf(season, n);
    if (real == null) return;
    // A choice the jar could not pay for, or a second build, counts as an empty basket.
    const chosen = available(town, real.kind, done.chosen) ? done.chosen : EMPTY;
    town.coins -= COST[chosen] ?? 0;
    if (chosen === BUILD) town.builtIn[real.kind] = n;
    if (real.tier >= 2) {
      if (chosen === HELP) town.helped += 1;
      else town.strained += 1;
    }
    const went = actual(real);
    if (done.call >= 0 && done.call === went) town.keeperNotches += 1;
    if (done.tocco >= 0 && done.tocco === went) town.toccoNotches += 1;
    // The next week begins.
    town.week = n + 1;
    town.coins = Math.min(JAR_MAX, town.coins + 1);
  });
  for (const kind of KINDS) town.builds[kind] = stage(town.builtIn[kind], town.week);
  town.lagging = LAG_WEEKS.some((back) => {
    const earlier = weekOf(season, town.week - back);
    return earlier != null && earlier.kind === 'fuel' && earlier.tier >= 2;
  });
  return town;
}

/** A build's stage in a given week, from the week it was chosen (0: never). */
export function stage(builtIn: number, week: number): number {
  if (builtIn <= 0) return NONE;
  const age = week - builtIn;
  if (age >= WORKING_AFTER) return WORKING;
  if (age >= SCAFFOLD_AFTER) return SCAFFOLD;
  return NONE;
}

/**
 * How hard this week's kind presses on the town, once the Keeper's choice
 * has had its effect: easing takes one tier off, and so does a working
 * build of the same kind. A fall stays a fall.
 */
export function pressure(real: RealWeek, town: Town, chosen: number): Tier {
  if (real.tier < 0) return -1;
  let tier: number = real.tier;
  if (chosen === EASE) tier -= 1;
  if (town.builds[real.kind] === WORKING) tier -= 1;
  return Math.max(0, tier) as Tier;
}

/**
 * The level each place in the town shows this week: the week's own kind at
 * its pressure, the others calm, and the market at least a small rise
 * while a big fuel week is still working through.
 */
export function levels(real: RealWeek, town: Town, chosen: number): Record<Kind, Tier> {
  const shown: Record<Kind, Tier> = { fuel: 0, power: 0, food: 0 };
  shown[real.kind] = pressure(real, town, chosen);
  if (town.lagging && shown.food >= 0 && shown.food < 1) shown.food = 1;
  return shown;
}

/**
 * Lit windows on the last night of the season: a base, more for each
 * pressed week the family was helped through and each working build, a
 * little for coins left in the jar, less for each week the family was left
 * on its own. Between 0.4 and 1.
 */
export function festivalLights(town: Town): number {
  const working = KINDS.filter((kind) => town.builds[kind] === WORKING).length;
  const share = 0.6 + 0.06 * town.helped + 0.08 * working + 0.02 * town.coins - 0.05 * town.strained;
  return Math.min(1, Math.max(0.4, share));
}
