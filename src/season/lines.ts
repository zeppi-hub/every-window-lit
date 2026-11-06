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
export const INTRO: readonly string[] = ['Welcome, Keeper.|Care for this town for 12 weeks.', 'Help them well.|More windows light the festival.'];

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
  card: "Fuel's up. Cars stay home. The road's too quiet.",
  choosing: 'Tap one to see how it helps. Only the lever spends.',
  /** Once something is in the basket. */
  chosen: 'Pull the iron lever|on your left. Send it down.',
  /** Once the basket has landed: Nora's family, on the little model of the square. */
  model: "Tap Nora's house on the little model.",
  /** Once the family has been seen: the sun on the sill runs the week's evenings. */
  sun: 'Tap the brass sun. See what your choice does.',
  sunOn: 'Tap the sun on to Sunday.',
  lamp: 'Sunday. Tap the lamp, or use the match.',
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

/** The coins in the jar as the first week's choice comes, from the town's real balance, and how the jar fills. */
export function jarLine(coins: number): string {
  return `Your jar: ${coins} ${coins === 1 ? 'coin' : 'coins'}. One more comes each week.`;
}

/** Lina, as the Keeper knocks on the box's glass in the first week: on the family's line for 4 s (Devir 1b item 14). */
export const LINA_FIRST = 'Lina: Mum, look! For you, Keeper!';

/** The same turns of the week from the second week on, and his other fixed lines (ToccoSystem). */
export const WEEK = {
  bell: 'Hear the bell? Pull the rope.',
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
 * From the second week the lever takes an empty basket too (week-locks.ts)
 * and the ghost hand shows only the three things, so the line says what
 * empty does. Only a hard week asks for something (model.ts).
 */
const PICK_OR_SAVE = 'Pick one.|Empty saves your coins.';

/**
 * From the second week the choice is asked by how much the week's prices
 * moved (its real tier). None of these says which thing to pick.
 */
export function choosingLine(tier: number): string {
  if (tier >= 2) return 'A hard week for families here. Pick one.';
  if (tier === 1) return `Small rise. ${PICK_OR_SAVE}`;
  return tier < 0 ? `Prices fell. ${PICK_OR_SAVE}` : PICK_OR_SAVE;
}

/**
 * The instruction for a step of week `n` (line-queue.ts stepOf), or '' for
 * none: the first week names each thing and movement; later weeks say less,
 * and leave the latch, the lever and the sun to the ghost hand. The season's
 * last Sunday has no closing instruction: its night says it (festival).
 */
export function instructionLine(step: Step, n: number, seasonWeeks: number, tier = 0): string {
  const first = n === 1;
  switch (step) {
    case 'latch':
      return first ? FIRST_WEEK.latch : '';
    case 'bell':
      return first ? FIRST_WEEK.bell : WEEK.bell;
    case 'choosing':
      return first ? FIRST_WEEK.choosing : choosingLine(tier);
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
    case 'glass':
      return GLASS_LINE;
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

/** The third morning's basket: its note, and what he makes of it. */
export const GIFT_NOTE = 'For the tower.';
export const GIFT_LINE = 'Someone sent this up. It fits your lamp.';
/** Week 6: on the drawing that came with the card, as it is brought close. */
export const DRAWING_LINE = 'Lina: Grandpa sat in your window once.';
/** Week 7 on: his answer once the Keeper has set the globe by hand and asks what comes later. */
export const FRAME_LINE = "The square's lamp. Empty for years now.";
/** Through the spyglass, on the empty frame. */
export const MARK_LINE = 'There. A mark on the old frame.';
/** Week 9's morning. */
export const ASKING_LINE = 'The town is asking. You choose.';
/** Week 10's morning. */
export const LIGHTS_LINE = 'Festival in two weeks. Lights going up.';
/** The climax's morning, the first week's words again. */
export const QUIET_LINE = "The road's too quiet. Like your first week.";
/** The climax's Sunday: the town's note, the choice, and the mark if it was found. */
export const TOWN_NOTE = 'The town lamp needs a glass.';
export const GLASS_LINE = 'Send the glass, or keep your light.';
export const SAME_MARK = 'Same mark as your glass.';

/** The Keeper's Sunday call, noted. */
export function calledLine(direction: number): string {
  return `${direction === 1 ? 'Up' : 'Down'}, you say. Noted.`;
}

/** As the shutters close on Sunday and the week is saved: how far into the season it is. */
export function weekDoneLine(n: number, seasonWeeks: number): string {
  return `Week ${n} of ${seasonWeeks} done. Saved.`;
}

/** After a later hard week closes: which way it moved the festival, in words, no count (D16). */
export const HARD_WEEK_LIT = 'That week lit more windows for the festival.';
export const HARD_WEEK_COST = 'That week, fewer windows for the festival.';

/** The climax of the season: its close has its own weight. */
export const CLIMAX_WEEK = 11;

type HardCount = { readonly helped: number; readonly eased: number; readonly strained: number };

/**
 * The line after week `n` closes, from the town before and after it, or ''.
 * The first close stays as it is, the climax says nothing of the sums, and a
 * build pays later, so no line reads it as a loss; a hard week a working
 * build carried changed nothing and says nothing.
 */
export function hardWeekLine(before: HardCount, after: HardCount, n: number, chosen: number): string {
  if (n === 1 || n === CLIMAX_WEEK || chosen === 2) return '';
  if (after.helped + after.eased > before.helped + before.eased) return HARD_WEEK_LIT;
  return after.strained > before.strained ? HARD_WEEK_COST : '';
}

/** After the first week's close: what the season is for. */
export function goalLine(seasonWeeks: number): string {
  return `Festival in week ${seasonWeeks}. Every window lit?`;
}

/** The week's card: what moved, with no country in the title. */
const CARD_TITLES: Readonly<Record<Kind, string>> = { fuel: 'Pump prices', power: 'Power prices', food: 'Grocery prices' };

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

/** The card's main row: what moved and by how much ("Pump prices +9.8%"). A monthly power series is the household's bill. */
export function cardPriceLine(real: Pick<RealWeek, 'kind' | 'change' | 'monthly'>): string {
  const title = real.kind === 'power' && real.monthly ? 'Power bills' : CARD_TITLES[real.kind];
  return `${title} ${signed(real.change)}`;
}

/** How big the move is for its own series, so a small figure that is a hard week says why (kademe sözü; a usual week says only its span). */
const SCALE: Readonly<Partial<Record<number, string>>> = { 3: 'far above usual', 2: 'above usual', 1: 'a little above usual', [-1]: 'below usual' };

/** The card's third row: over how long, and how far from usual. */
export function cardScaleLine(real: Pick<RealWeek, 'monthly' | 'tier'>): string {
  const span = real.monthly ? 'In one month' : 'In one week';
  const scale = SCALE[real.tier];
  return scale == null ? span : `${span} · ${scale}`;
}

/** The tags of the sill's three things, left to right; what each costs is drawn beside its word as coin dots. */
export const TAGS = ['Everyone', 'One family', 'Build'] as const;

/** The card's credit line: the real period, then the country its prices come from, last. */
export function cardCredit(real: Pick<RealWeek, 'monthly' | 'month' | 'country'>): string {
  return `${real.monthly ? 'Real month' : 'Real week'} · ${real.month} · ${real.country}`;
}

/** What the week's morning says beyond its prices: the two weeks that turn toward the festival. */
export function weekMorningLine(n: number): string {
  if (n === 9) return ASKING_LINE;
  return n === 10 ? LIGHTS_LINE : '';
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
export const LAG_LINE = "Food prices follow fuel later. That's my guess.";

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
const CHOICES = ['Everyone a little, this week. Three coins.', "Nora's family, over there. One coin.", 'No one yet. Everyone, later on. Two coins.'] as const;

/** Everyone, tried in a week with nothing to ease (model.ts easingBites): the coins would go for little. */
const NOTHING_TO_EASE = 'Not much to ease this week. Three coins.';

export function choiceLine(index: number, left: number, bites = true): string {
  const line = index === 0 && !bites ? NOTHING_TO_EASE : CHOICES[index];
  return line == null ? '' : `${line} ${left} left.`;
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

/** Everyone, in a week with nothing to ease: true of a calm week, a fall, and a week a working build already carries. */
const ALL_RIGHT = "Nora: We're all right this week.";

export function familyLine(kind: Kind, chosen: number, bites = true): string {
  if (chosen === 0 && !bites) return ALL_RIGHT;
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

/** What each ending says first, as the windows are all on. */
const ENDINGS: Readonly<Record<'town' | 'window' | 'both', string>> = {
  town: "The town's lamp is lit, Keeper.",
  window: 'Hear that? Grandpa plays for your light.',
  both: 'The town and one window. Both lit.',
};
/** Lina, on the last night: what the drawing meant. */
export const SECRET_LINE = "Lina: Grandpa held the town's glass safe up there.";
/** As the last shutters close, a new mark among the old ones. */
export const YEAR_END = 'Next Keeper sits here in spring.';

/** The season in plain sums, spoken as the last night's lights settle: at most three rows, none for a nought. */
export function ledgerLines(answered: number, pressed: number, working: number, boats: number): string[] {
  const rows: string[] = [];
  if (answered > 0) rows.push(`Hard weeks answered: ${answered} of ${pressed}.`);
  if (working > 0) rows.push(`Working now: ${working}.`);
  if (boats > 0) rows.push(`Paper boats on the sill: ${boats}.`);
  return rows;
}

/** The last night's lines, once its windows are on: the ending, what the season lit, Lina's secret. */
export function endingLines(answer: 'town' | 'window' | 'both', share: number): string[] {
  // In the window's ending Grandpa has already been named.
  const season = festivalLines(share).filter((line) => answer !== 'window' || line !== GRANDPA_PLAYS);
  return [ENDINGS[answer], ...season, SECRET_LINE];
}

const GRANDPA_PLAYS = "Hear that? Grandpa's playing.";

export function festivalLines(share: number): string[] {
  if (share >= EVERY_WINDOW) return ['Every window lit, Keeper.', GRANDPA_PLAYS];
  if (share >= 0.65) return ['Most windows lit. A good season.'];
  return ['Some windows dark. Next year, brighter.'];
}

export const SEASON_OVER = "That's the season, Keeper. From the top.";
