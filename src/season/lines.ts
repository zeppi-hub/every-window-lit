import type { Kind, RealWeek, Tier, Weather } from './model.js';

/**
 * What Tocco says, as templates whose gaps the season's model fills, so a
 * line never disagrees with the town. Each line is short: at most two lines
 * on his panel, under ten words where possible. Type-only imports, so
 * `node --test` can load this file as it is.
 */

/**
 * The very first morning, before anything else: who the Keeper is, in one
 * line. The rest is learned by doing (the ghost hand), and the week's real
 * price comes with the card.
 */
export const INTRO: readonly string[] = ['Welcome, Keeper. The town is yours for a year.'];

/**
 * The first week's instructions, one at a time; the ghost hand shows the
 * rest without words (the window, the sun). Later weeks use WEEK.
 */
export const FIRST_WEEK = {
  bell: 'Pull the rope. Three times.',
  /** As the basket comes up with the week's card (said, not cued: the rise lasts under two seconds). */
  card: "The road's too quiet. Fuel costs more.",
  choosing: 'Pick one. Put it in the basket.',
  chosen: 'Now pull the lever.',
  family: 'That window waves to every Keeper.',
} as const;

/** The same turns of the week from the second week on, and his other fixed lines (ToccoSystem). */
export const WEEK = {
  bell: 'Hear the bell? Pull the rope.',
  choosing: 'Pick one, or send it empty.',
  lowering: 'Down it goes. Hear it land?',
  /** The second week's landing, the first with these words; later weeks the short one. */
  visitFirst: "That's Nora's window. Reach for it.",
  visit: "Nora's window. See how they are.",
  busy: "Not while the basket's out.",
  lamp: 'Now light the lamp.',
  close: 'Close the shutters.',
  seasonClose: 'Close the shutters. Season done.',
} as const;

/**
 * What he says as week `n` turns to `phase` (a components.ts Phase value),
 * or '' for nothing. The first week spells the steps out once and lets the
 * basket's landing speak for itself; the morning and Sunday lines carry the
 * week's data and are built elsewhere.
 */
export function phaseLine(phase: string, n: number): string {
  const first = n === 1;
  switch (phase) {
    case 'bell':
      return first ? FIRST_WEEK.bell : WEEK.bell;
    case 'rising':
      return first ? FIRST_WEEK.card : '';
    case 'choosing':
      return first ? FIRST_WEEK.choosing : WEEK.choosing;
    case 'lowering':
      return first ? '' : WEEK.lowering;
    case 'landed':
      return first ? FIRST_WEEK.family : n === 2 ? WEEK.visitFirst : WEEK.visit;
    default:
      return '';
  }
}

/** Once the Sunday lamp is lit: the last week's lamp starts the last night; the first week's says nothing (the latch glows). */
export function lampLitLine(n: number, seasonWeeks: number): string {
  if (n === seasonWeeks) return CONDUCT_LINE;
  return n === 1 ? '' : WEEK.close;
}

/** The Keeper's Sunday call, noted. */
export function calledLine(direction: number): string {
  return `${direction === 1 ? 'Up' : 'Down'}, you say. Noted.`;
}

/** As the shutters close on Sunday and the week is saved. */
export function weekDoneLine(n: number): string {
  return `Week ${n} done.`;
}

/** The first thing he says on a morning: what the view shows this week. */
const MORNING: Readonly<Record<Kind, Readonly<Record<Tier, string>>>> = {
  fuel: {
    [-1]: 'Busy road. Pumps must be cheap.',
    0: "Morning, Keeper. Road's as usual.",
    1: 'A car or two short this morning.',
    2: 'Fewer cars this morning. Bikes out.',
    3: "Morning, Keeper. Listen. The road's too quiet.",
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
/** What each kind's prices are called in a line. */
const SERIES: Readonly<Record<Kind, string>> = { fuel: 'Pumps', power: 'Power', food: 'Groceries' };

export function settledLine(real: RealWeek, went: number, morning = true): string {
  const after = real.monthly ? 'the month after' : 'the week after';
  return `${morning ? 'Morning. ' : ''}${SERIES[real.kind]} went ${went === 1 ? 'up' : 'down'} ${after}.`;
}

export function notchLine(keeperRight: boolean, toccoRight: boolean, keeperCalled: boolean): string {
  if (!keeperCalled) return toccoRight ? 'I called it. A notch for me.' : 'I got it wrong. Your call next time?';
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

/** As an option goes into the basket: who it is for and what it costs, the same words for every kind. */
const CHOICES = ['For everyone. Three coins.', 'For one family. One coin.', 'For later. Two coins.'] as const;

export function choiceLine(index: number): string {
  return CHOICES[index] ?? '';
}

/** Said once, on the evening the choice shows in the town; a build says its next step on the first evening instead. */
const OUTCOMES: Readonly<Record<Kind, readonly [string, string, string]>> = {
  fuel: ['Tuesday. Cars are back on the road.', "Monday. A parcel at Nora's door.", 'Tram line measured. Work starts next week.'],
  power: ['Tuesday. More windows lit tonight.', "Monday. A parcel at Nora's door.", 'Masts go up on the roof next week.'],
  food: ['Tuesday. The stalls filled up.', "Monday. A parcel at Nora's door.", 'Beds measured. Seed goes in next week.'],
};

/** In the season's last week a build has no next week: it waits for the next season. */
const LAST_BUILD: Readonly<Record<Kind, string>> = {
  fuel: 'Surveyors out. Next season, the tram.',
  power: 'Masts measured. Next season, turbines.',
  food: 'Beds measured. Next season, seed.',
};

export function outcomeLine(kind: Kind, chosen: number, lastWeek = false): string {
  if (lastWeek && chosen === 2) return LAST_BUILD[kind];
  return OUTCOMES[kind][chosen] ?? '';
}

/** What Nora's family says once the basket has landed, by the week's kind and the Keeper's choice. */
const FAMILY: Readonly<Record<Kind, readonly [string, string, string]>> = {
  fuel: ['Nora: Cheaper fuel. We can take the car.', 'Nora: A parcel for us. Fuel money inside.', 'Nora: A tram? Bikes until then.'],
  power: ['Nora: The bill came in lighter.', 'Grandpa: Bread from the baker. Oven stays off.', 'Lina: Windmills on a roof? Real ones?'],
  food: ['Nora: Market prices held. Full bag today.', 'Lina: My lunch tin was full!', 'Grandpa: A roof garden? I can dig.'],
};
export const NOTHING = 'Grandpa: The basket came down empty.';
/** In a solidarity week, whatever went down in the basket. */
export const AID_LINE = 'Lina: Can my drawing go too?';
/** In a heat week, whatever the choice: Lina's care for her grandfather. */
export const HEAT_LINE = 'Lina: Water for you, Grandpa.';

export function familyLine(kind: Kind, chosen: number): string {
  return chosen >= 0 ? (FAMILY[kind][chosen] ?? NOTHING) : NOTHING;
}

export const REFUSED_COINS = "The jar's too light for that.";
export const REFUSED_BUILT = 'We built that one already.';

export function sundayLine(real: RealWeek, call: number): string {
  const when = real.monthly ? 'next month' : 'next week';
  return `${SERIES[real.kind]} ${when}: up or down? I say ${call === 1 ? 'up' : 'down'}.`;
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

/** From this share of lit windows on the last night, the town counts as every window lit, and Grandpa plays. */
export const EVERY_WINDOW = 0.85;

/** On the last night, by the share of windows the season lit (season/model.ts festivalLights): no ending has a loss. */
/** The second week's morning: the spyglass has come to the sill. */
export const SPYGLASS_LINE = 'A spyglass, Keeper. Lift it to your eye.';

/** The Keeper found, through the spyglass, where the week's prices show in the street. */
export function spottedLine(kind: Kind): string {
  return kind === 'fuel' ? 'There. The kerb shows what fuel costs.' : kind === 'food' ? 'There. The stalls show what food costs.' : 'There. The windows show what power costs.';
}

/** The shutters, tried while the last night's windows are still being lit: the rest come on by themselves. */
export const WINDOWS_FIRST = 'The windows first, Keeper. Nearly there.';

/** The last night's lamp is lit: the Keeper conducts the windows on (FestivalSystem). */
export const CONDUCT_LINE = 'Conduct the windows. Slow, like a waltz.';

export function festivalLines(share: number): string[] {
  if (share >= EVERY_WINDOW) return ['Every window lit, Keeper.', "Hear that? Grandpa's playing."];
  if (share >= 0.65) return ['Most windows lit. A good season.'];
  return ['Some windows dark. Next year, brighter.'];
}

export const SEASON_OVER = "That's the season, Keeper. From the top.";
