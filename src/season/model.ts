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

/** Real weather near Naples laid over a week as an island event (only once checked and reviewed). */
export interface Weather {
  kind: 'heat' | 'cold' | 'storm' | 'dry';
  /** The real number, e.g. "3 days above 32°C". */
  label: string;
  month: string;
}

/**
 * A solidarity week (META_VR_FIKIR.md §19): a real disaster on the mainland
 * reaches the island only as a letter and as help going out. No choice
 * costs anything, the town's reading stays calm, and no calls are made.
 */
export interface Solidarity {
  /** The letter's lines, word for word as the design gives them. */
  letter: readonly string[];
  /** The real week of the event, for the credits. */
  week: string;
}

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
  /** A weather week, checked for loss of life and reviewed (META_VR_FIKIR.md §19). */
  weather?: Weather;
  /** One still waiting for that check: shown only in the dev build, to try the scene. */
  weatherPending?: Weather;
  /** A solidarity week, reviewed; without review it ships as `calm`. */
  solidarity?: Solidarity;
  /** A solidarity week still waiting for review: shown only in the dev build. */
  solidarityPending?: Solidarity;
  /** The calm week of the same kind that stands in for a solidarity week when it is switched off or not yet reviewed. */
  calm?: RealWeek;
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

/** The week the glass globe comes up in a basket, the week Lina's drawing comes with the card, and the week the town asks for the glass. */
export const GLOBE_WEEK = 3;
export const DRAWING_WEEK = 6;
export const CLIMAX_WEEK = 11;

/** Where the glass went in the climax: down to the square, or left on the Keeper's lamp. */
export type GlobeChoice = 'sent' | 'kept';

/** What the last night is for (META_VR_HIKAYE_v2.md, three endings): none of them is a loss. */
export type Answer = 'town' | 'window' | 'both';

/** What the Keeper did in a kept week. */
export interface Kept {
  /** EASE, HELP, BUILD or EMPTY. */
  chosen: number;
  /** The Sunday calls: 1 up, 0 down, -1 none. */
  call: number;
  tocco: number;
  /** Played as a solidarity week; replayed as one whatever the start page's switch says later. */
  aid?: boolean;
  /** The climax: where the glass went. */
  globe?: GlobeChoice;
  /** The globe week: the Keeper set the globe in the lamp by hand (on its own it settles there on Sunday). */
  globePlaced?: boolean;
  /** The Keeper found the mark on the old frame through the spyglass this week. */
  seen?: boolean;
  /** The drawing week: the Keeper brought Lina's drawing up close. */
  drawing?: boolean;
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
  /** Pressed weeks the Keeper eased for everyone. */
  eased: number;
  /** Pressed weeks nothing softened: no help, no easing, no working build of that kind. */
  strained: number;
  /** Every pressed week so far (a rise of tier 2 or more). */
  pressed: number;
  /** Notches carved so far for each side. */
  keeperNotches: number;
  toccoNotches: number;
  /** A fuel week of medium or large rise one or two weeks ago: the market feels it this week. */
  lagging: boolean;
  /** Where the glass went, once the climax is over; null before it. */
  globe: GlobeChoice | null;
  /** Whether the Keeper set the globe in the lamp by hand. */
  globePlaced: boolean;
  /** Whether the Keeper has found the mark on the old frame. */
  markSeen: boolean;
  /** Whether the Keeper brought Lina's drawing up close. */
  drawingSeen: boolean;
  /** What the last night is for, settled as the climax closes; null before it. */
  answer: Answer | null;
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
export function available(town: Town, kind: Kind, chosen: number, aid = false): boolean {
  // In a solidarity week the Keeper's own things go to the boat: nothing to pay, nothing built.
  if (aid) return true;
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
    eased: 0,
    strained: 0,
    pressed: 0,
    keeperNotches: 0,
    toccoNotches: 0,
    lagging: false,
    globe: null,
    globePlaced: false,
    markSeen: false,
    drawingSeen: false,
    answer: null,
  };
  kept.forEach((done, index) => {
    const n = index + 1;
    const real = weekOf(season, n);
    if (real == null) return;
    if (done.globePlaced === true) town.globePlaced = true;
    if (done.seen === true) town.markSeen = true;
    if (done.drawing === true) town.drawingSeen = true;
    if (real.solidarity != null) {
      // Help went out on the boat: no coins, no build, no pressure, no calls to settle.
      town.week = n + 1;
      town.coins = Math.min(JAR_MAX, town.coins + 1);
      return;
    }
    // A choice the jar could not pay for, or a second build, counts as an empty basket.
    const chosen = available(town, real.kind, done.chosen) ? done.chosen : EMPTY;
    town.coins -= COST[chosen] ?? 0;
    if (chosen === BUILD) town.builtIn[real.kind] = n;
    if (real.tier >= 2) {
      town.pressed += 1;
      // pressure() reads this week's stage, and the loop below only fills it in at the end.
      town.builds[real.kind] = stage(town.builtIn[real.kind], n);
      if (chosen === HELP) town.helped += 1;
      else if (chosen === EASE) town.eased += 1;
      else if (pressure(real, town, chosen) === real.tier) town.strained += 1;
    }
    const went = actual(real);
    if (done.call >= 0 && done.call === went) town.keeperNotches += 1;
    if (done.tocco >= 0 && done.tocco === went) town.toccoNotches += 1;
    if (n === CLIMAX_WEEK) {
      town.globe = done.globe === 'sent' ? 'sent' : 'kept';
      town.answer = seasonAnswer(town);
    }
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
 * its pressure, the others calm, and the market at least a medium rise
 * while a big fuel week is still working through (a small one in the last week).
 */
export function levels(real: RealWeek, town: Town, chosen: number): Record<Kind, Tier> {
  const shown: Record<Kind, Tier> = { fuel: 0, power: 0, food: 0 };
  // A solidarity week has no effect on the market or the town: everything reads calm.
  if (real.solidarity != null) return shown;
  shown[real.kind] = pressure(real, town, chosen);
  // Not the festival's week: the stalls stay open for the last night whatever the climax's fuel did.
  const lag = town.week > CLIMAX_WEEK ? 1 : 2;
  if (town.lagging && shown.food >= 0 && shown.food < lag) shown.food = lag;
  return shown;
}

/**
 * What the season answers, from the climax and the weeks before it. The
 * glass gone, the town's; kept, one window's; and both when the Keeper's
 * weeks pulled the other way: at least half the hard weeks spent on one
 * family after sending the glass, or on everyone after keeping it. Half of
 * the hard weeks, so the rule fits any list; a season can pay for only five
 * Everyones.
 */
export function seasonAnswer(town: Pick<Town, 'globe' | 'helped' | 'eased' | 'pressed'>): Answer {
  if (town.globe === 'sent') return town.helped * 2 >= town.pressed ? 'both' : 'town';
  return town.eased * 2 >= town.pressed ? 'both' : 'window';
}

/** Whether easing would change anything this week: the same test the town's own view uses. */
export function easingBites(real: RealWeek, town: Town): boolean {
  return pressure(real, town, EASE) !== pressure(real, town, EMPTY);
}

/**
 * Lit windows on the last night of the season: a base, more for each
 * pressed week a basket answered (one family or everyone) and each working
 * build, less for each pressed week nothing softened. Between 0.4 and 1, to
 * two decimals, so 0.65 and 0.85 never land a hair under their thresholds.
 */
export function festivalLights(town: Town): number {
  const working = KINDS.filter((kind) => town.builds[kind] === WORKING).length;
  const share = 0.6 + 0.06 * (town.helped + town.eased) + 0.08 * working - 0.05 * town.strained;
  return Math.min(1, Math.max(0.4, Math.round(share * 100) / 100));
}
