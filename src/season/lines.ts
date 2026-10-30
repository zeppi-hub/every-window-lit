import type { Kind, RealWeek, Tier, Weather } from './model.js';

/**
 * What Tocco says, as templates whose gaps the season's model fills, so a
 * line never disagrees with the town. Each line is short: at most two lines
 * on his panel, under ten words where possible. Type-only imports, so
 * `node --test` can load this file as it is.
 */

/** The first thing he says on a morning: what the view shows this week. */
const MORNING: Readonly<Record<Kind, Readonly<Record<Tier, string>>>> = {
  fuel: {
    [-1]: 'Busy road. Pumps must be cheap.',
    0: "Morning, Keeper. Road's as usual.",
    1: 'A car or two short this morning.',
    2: 'Fewer cars this morning. Bikes out.',
    3: "Morning, Keeper. The road's too quiet.",
  },
  power: {
    [-1]: 'Every lamp was burning last night.',
    0: 'Lamps as usual last night.',
    1: 'A few windows went dark last night.',
    2: 'Fewer lamps lit last night.',
    3: 'Half the row sat in the dark.',
  },
  food: {
    [-1]: 'Stalls are heaped this morning.',
    0: "Market's as usual this morning.",
    1: 'Crates a little light today.',
    2: 'Half-empty crates down there.',
    3: 'The stalls are thin this morning.',
  },
};

export function morningLine(real: RealWeek): string {
  return MORNING[real.kind][real.tier];
}

/** Why the town looks the way it does, said once the first time the market feels a fuel week. */
export const LAG_LINE = 'In this model, pumps reach the market later.';

/** The calls on last Sunday, settled against what really came next. */
export function settledLine(real: RealWeek, went: number, morning = true): string {
  const after = real.monthly ? 'The month after' : 'The week after';
  return `${morning ? 'Morning. ' : ''}${after}, prices went ${went === 1 ? 'up' : 'down'}.`;
}

export function notchLine(keeperRight: boolean, toccoRight: boolean, keeperCalled: boolean): string {
  if (!keeperCalled) return toccoRight ? 'I called it. A notch for me.' : 'Wrong, me. Call it next time.';
  if (keeperRight && toccoRight) return 'We both called it.';
  if (keeperRight) return 'You called it. A notch for you.';
  if (toccoRight) return 'I called it. A notch for me.';
  return 'Wrong, both of us.';
}

/** What each build is called, and what he says as it goes up and as it starts working. */
const BUILT: Readonly<Record<Kind, { name: string; scaffold: string; working: string }>> = {
  fuel: { name: 'the tram', scaffold: "Scaffold's up for the tram line.", working: "Hear that? The tram's running." },
  power: { name: 'the turbines', scaffold: 'Turbine masts going up on the roof.', working: 'The roof turbines are turning.' },
  food: { name: 'the garden', scaffold: 'Beds on the roof. Seed going in.', working: "The roof garden's green." },
};

export function stageLine(kind: Kind, working: boolean): string {
  return working ? BUILT[kind].working : BUILT[kind].scaffold;
}

const NUMBERS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'];

/** A pressed week of a kind whose build already works: he remembers who drew it up. */
export function memoryLine(kind: Kind, weeksAgo: number): string {
  const ago = weeksAgo === 1 ? 'Last week' : `${NUMBERS[weeksAgo] ?? weeksAgo} weeks ago`;
  return `${ago} you drew up ${BUILT[kind].name}. It helps.`;
}

/** As each option goes into the basket. */
const CHOICES: Readonly<Record<Kind, readonly [string, string, string]>> = {
  fuel: ['Pumps full, road busy. Three coins.', "Tessa's covered. The rest of the row isn't.", 'A tram pays later, not this week.'],
  power: ['Cheaper power for all. Three coins.', 'Bread for Tessa. Her oven stays off.', 'Turbines take weeks. Worth it later.'],
  food: ['Market prices held. Three coins.', "Lina's lunch tin, filled. One coin.", 'Seed now, greens in a few weeks.'],
};

export function choiceLine(kind: Kind, index: number): string {
  return CHOICES[kind][index] ?? '';
}

/** What Tessa's family says once the basket has landed, by the week's kind and the Keeper's choice. */
const FAMILY: Readonly<Record<Kind, readonly [string, string, string]>> = {
  fuel: ['Tessa: Keeper filled the pumps. Car tomorrow?', "Tessa: The clinic's paying my fuel this week.", 'Tessa: A tram? Bike till then.'],
  power: ['Tessa: The bill came in lighter.', 'Dario: Bread from the baker. Oven stays off.', 'Lina: Windmills on a roof? Real ones?'],
  food: ['Tessa: Market prices held. Full bag today.', 'Lina: My lunch tin was full!', 'Dario: A roof garden? I can dig.'],
};
export const NOTHING = 'Dario: The basket came down empty.';

export function familyLine(kind: Kind, chosen: number): string {
  return chosen >= 0 ? (FAMILY[kind][chosen] ?? NOTHING) : NOTHING;
}

export const REFUSED_COINS = "The jar's too light for that.";
export const REFUSED_BUILT = 'We built that one already.';

export function sundayLine(real: RealWeek, call: number): string {
  const when = real.monthly ? 'next month' : 'next week';
  return `Sunday. Up or down ${when}? I say ${call === 1 ? 'up' : 'down'}.`;
}

/** What he says of a weather week: the island's side of it, and the price only if it rose. */
const WEATHER: Readonly<Record<Weather['kind'], string>> = {
  heat: "Shutters shut by noon. Shade's full.",
  cold: "Cold nights. Every chimney's working.",
  storm: "Storm's in. Boats stay tied.",
  dry: 'Six months, half the rain.',
};

export function weatherLines(weather: Weather, real: RealWeek): string[] {
  const lines = [WEATHER[weather.kind]];
  if ((weather.kind === 'heat' || weather.kind === 'cold') && real.kind === 'power' && real.tier >= 1) {
    lines.push(`${weather.kind === 'heat' ? 'Hot' : 'Cold'} week. Busy cable.`);
  }
  return lines;
}

export const SEASON_OVER = "That's the season, Keeper. From the top.";
