import type { Step } from '../line-queue.js';
import type { Kind, RealWeek, Tier, Weather } from './model.js';

/**
 * What Tocco says, as templates whose gaps the season's model fills, so a
 * line never disagrees with the town. Each line is short: at most two lines
 * on his panel, under ten words where possible. Type-only imports, so
 * `node --test` can load this file as it is.
 */

/**
 * The very first morning, after the town has spoken: who the Keeper is,
 * then what playing well brings (the festival's windows; season/model.ts
 * festivalLights). How a week goes is learned step by step from the first
 * week's instructions below.
 */
export const INTRO: readonly string[] = ['Welcome, Keeper. Look after this town for a year.', 'Help them well. More windows light the festival.'];

/**
 * The first week, step by step: each instruction names the thing to touch
 * (a | where a line's first sentence is too long for one row: it breaks there, station/caption.ts BREAK_MARK)
 * and the movement, and stays up until its step is done (line-queue.ts);
 * the rest are said once. Later weeks use WEEK, and shorter.
 */
export const FIRST_WEEK = {
  /** The closed room: the shutters' brass latch. */
  latch: 'Slide the brass latch. Let the morning in.',
  bell: 'Pull the rope handle|on your right. Three times.',
  /** Once the basket stands on the sill with the week's card: what it means (a story line, said once). */
  card: "Fuel costs more this week. The road's too quiet.",
  choosing: 'Tap one for the basket. It goes down to help.',
  /** Once something is in the basket. */
  chosen: 'Pull the iron lever|on your left. Send it down.',
  /** Once the basket has landed: Nora's family, on the little model of the square. */
  model: "Tap Nora's house on the little model.",
  /** Once the family has been seen: the sun on the sill runs the week's evenings. */
  sun: 'Tap the brass sun. See what your choice does.',
  sunOn: 'Tap the sun on to Sunday.',
  lamp: 'Sunday. Strike the match, or tap the lamp.',
  /** The lamp is lit and Lina's window waits to be looked at. */
  look: 'Look across the square.',
  close: 'Slide the latch to close the week.',
  /** While the family's box is in the window, once their line has been read: its glass (Devir 1b item 14). */
  knock: 'Knock on the little glass.',
} as const;

/**
 * The first week's help, one per step, said once if a step takes long (the
 * ghost hand's ladder, Devir 1b item 3): the same thing again, said
 * another way. The sun's two steps share one.
 */
export const HELP = {
  latch: 'Pinch the latch, then move your hand right.',
  bell: 'Grab the wooden handle. Pull it all the way down.',
  choosing: 'Touch the key, the badge or the plan.',
  chosen: 'The iron lever by the wall. Pull its knob down.',
  model: "Nora's house glows|on the little model. Tap it.",
  sun: 'The brass sun, just below. Tap it.',
  sunOn: 'The brass sun, just below. Tap it.',
} as const;

/** Said once in the first week, after the first help: a poke on him says the step again. */
export const TAP_ME = 'Tap me to hear it once more.';
/** The lever pulled in the first week with nothing in the basket: it does not move. */
export const REFUSED_EMPTY = 'Pick one first. Then the lever.';
/** The latch tried in the first week before its lamp: the shutters stay open. */
export const NOT_YET = 'Not yet. Finish the week first.';
/** The rope's first and second pulls in the first week; the third brings the basket up. */
const PULLS = ['Good. Two more.', 'One more.'] as const;

export function pullLine(pulls: number): string {
  return PULLS[pulls - 1] ?? '';
}

/** The coins in the jar as the week's choice comes, from the town's real balance. */
export function jarLine(coins: number): string {
  const one = coins === 1;
  return `Your jar: ${coins} ${one ? 'coin' : 'coins'}. Spend ${one ? 'it' : 'them'} or save ${one ? 'it' : 'them'}.`;
}

/** Lina, as the Keeper knocks on the box's glass in the first week: on the family's line for 4 s (Devir 1b item 14). */
export const LINA_FIRST = 'Lina: Mum, look! For you, Keeper!';

/** The same turns of the week from the second week on, and his other fixed lines (ToccoSystem). */
export const WEEK = {
  bell: 'Hear the bell? Pull the rope.',
  choosing: 'Pick one, or send it empty.',
  lowering: 'Down it goes. Hear it land?',
  /** Every landing: her window across the square, or her house on the little model on the sill, which also opens it. */
  visit: "Nora's window. Reach, or tap the model.",
  busy: "Not while the basket's out.",
  lamp: 'Now light the lamp.',
  close: 'Close the shutters.',
  seasonClose: 'Close the shutters. Season done.',
} as const;

/**
 * What he says as week `n` turns to `phase` (a components.ts Phase value),
 * or '' for nothing: the story lines of the week's turns. Instructions are
 * not here: they belong to steps (instructionLine), and the morning and
 * Sunday lines carry the week's data and are built elsewhere.
 */
export function phaseLine(phase: string, n: number): string {
  switch (phase) {
    case 'choosing':
      return n === 1 ? FIRST_WEEK.card : '';
    case 'lowering':
      return WEEK.lowering;
    default:
      return '';
  }
}

/**
 * The instruction for a step of week `n` (line-queue.ts stepOf), or '' for
 * none: the first week names each thing and movement; later weeks say less,
 * and leave the latch, the lever and the sun to the ghost hand. The season's
 * last Sunday has no closing instruction: its night says it (festival).
 */
export function instructionLine(step: Step, n: number, seasonWeeks: number): string {
  const first = n === 1;
  switch (step) {
    case 'latch':
      return first ? FIRST_WEEK.latch : '';
    case 'bell':
      return first ? FIRST_WEEK.bell : WEEK.bell;
    case 'choosing':
      return first ? FIRST_WEEK.choosing : WEEK.choosing;
    case 'chosen':
      return first ? FIRST_WEEK.chosen : '';
    case 'model':
      return first ? FIRST_WEEK.model : '';
    case 'visit':
      return first ? '' : WEEK.visit;
    case 'sun':
      return first ? FIRST_WEEK.sun : '';
    case 'sunOn':
      return first ? FIRST_WEEK.sunOn : '';
    case 'lamp':
      return first ? FIRST_WEEK.lamp : WEEK.lamp;
    case 'look':
      return first ? FIRST_WEEK.look : '';
    case 'close':
      return first ? FIRST_WEEK.close : n === seasonWeeks ? '' : WEEK.close;
    case 'knock':
      return first ? FIRST_WEEK.knock : '';
    default:
      return '';
  }
}

/**
 * Once Lina has answered the Sunday lamp: in the first week, that she did
 * (the closing instruction follows as its own step); the last week's lamp
 * starts the last night; other weeks say nothing more than the instruction.
 */
export function lampLitLine(n: number, seasonWeeks: number): string {
  if (n === seasonWeeks) return CONDUCT_LINE;
  return n === 1 ? 'Lina answered your lamp.' : '';
}

/** The Keeper's Sunday call, noted. */
export function calledLine(direction: number): string {
  return `${direction === 1 ? 'Up' : 'Down'}, you say. Noted.`;
}

/** As the shutters close on Sunday and the week is saved: how far into the season it is. */
export function weekDoneLine(n: number, seasonWeeks: number): string {
  return `Week ${n} of ${seasonWeeks} done. Saved.`;
}

/** After the first week's close: what the season is for. */
export function goalLine(seasonWeeks: number): string {
  return `Festival in week ${seasonWeeks}. Every window lit?`;
}

/** The week's card: what moved, with no country in the title. */
const CARD_TITLES: Readonly<Record<Kind, string>> = { fuel: 'Pump prices', power: 'Wholesale power', food: 'Grocery prices' };

export function cardTitle(kind: Kind): string {
  return CARD_TITLES[kind];
}

/** "+4.1%" with a true minus sign for falls. */
export function signed(change: number): string {
  const size = Math.abs(change).toFixed(1);
  return change > 0 ? `+${size}%` : change < 0 ? `\u2212${size}%` : `${size}%`;
}

/** The card's first row: how far into the season the week is. */
export function cardWeekLine(n: number, seasonWeeks: number): string {
  return `Week ${n} of ${seasonWeeks}`;
}

/** The card's main row: what moved and by how much ("Pump prices +9.8%"). */
export function cardPriceLine(kind: Kind, change: number): string {
  return `${CARD_TITLES[kind]} ${signed(change)}`;
}

/** The tags of the sill's three things, left to right; what each costs is drawn beside its word as coin dots. */
export const TAGS = ['Everyone', 'One family', 'Later'] as const;

/** The card's credit line: the real period, then the country its prices come from, last. */
export function cardCredit(real: RealWeek, country: string): string {
  return `${real.monthly ? 'Real month' : 'Real week'} · ${real.month} · ${country}`;
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
const CHOICES = ['For everyone. Three coins.', "For Nora's family, over there. One coin.", 'For later. Two coins.'] as const;

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
