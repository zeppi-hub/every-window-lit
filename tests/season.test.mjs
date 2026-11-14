// Checks the baked season and Tocco's lines: `node --test tests/`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GLASS_SIDES, KEY_LINE, UNSURE_LINE, cardScaleLine, AID_LINE, ASKING_LINE, DRAWING_LINE, endingLines, FRAME_LINE, GIFT_LINE, GIFT_NOTE, GLASS_LINE, HARD_WEEK_COST, HARD_WEEK_LIT, ledgerLines, LIGHTS_LINE, MARK_LINE, QUIET_LINE, SAME_MARK, SECRET_LINE, TOWN_NOTE, YEAR_END, calledLine, cardCredit, cardPriceLine, cardTitle, cardWeekLine, TAGS, choiceLine, choosingLine, CONDUCT_LINE, SPYGLASS_LINE, spottedLine, WINDOWS_FIRST, EVERY_WINDOW, familyLine, festivalLines, FIRST_WEEK, goalLine, HEAT_LINE, HELP, INTRO, instructionLine, jarLine, LAG_LINE, lampLitLine, LINA_FIRST, outcomeLine, memoryLine, morningLine, NOT_YET, NOTHING, notchLine, phaseLine, REFUSED_BUILT, REFUSED_COINS, REFUSED_EMPTY, SEASON_OVER, settledLine, stageLine, sundayLine, TAP_ME, WEEK, weekDoneLine } from '../src/season/lines.ts';
import { answer, QUESTIONS } from '../src/season/answers.ts';
import { COST, JAR_MAX, replay, toccoCall } from '../src/season/model.ts';

const season = JSON.parse(readFileSync(new URL('../src/season/season.json', import.meta.url), 'utf8'));
const KINDS = ['fuel', 'power', 'food'];
const TIERS = [-1, 0, 1, 2, 3];

test('the season has twelve real weeks of the three kinds', () => {
  assert.equal(season.weeks.length, 12);
  const count = (kind) => season.weeks.filter((w) => w.kind === kind).length;
  assert.deepEqual([count('fuel'), count('power'), count('food')], [5, 4, 3]);
  for (const w of season.weeks) {
    assert.ok(KINDS.includes(w.kind));
    assert.ok(TIERS.includes(w.tier));
    assert.ok(Number.isFinite(w.change) && Number.isFinite(w.next));
    assert.equal(w.monthly, w.kind === 'food');
    assert.ok(['Italy', 'Spain', 'Germany', 'US'].includes(w.country));
    assert.match(w.month, /^[A-Z][a-z]{2} 20\d\d$/);
    assert.ok(w.start >= '2023-01-01' && w.start <= '2026-10-31');
  }
});

test("the card's scale agrees with its figure, on the list as it stands", () => {
  const all = season.weeks.flatMap((w) => (w.calm != null ? [w, w.calm] : [w]));
  for (const w of all) {
    if (w.tier >= 1) assert.ok(w.change > 0, `${w.start}: ${w.change} at tier ${w.tier}`);
    if (w.tier < 0) assert.ok(w.change < 0, `${w.start}: ${w.change} at tier ${w.tier}`);
  }
  assert.equal(cardScaleLine({ monthly: false, tier: 3 }), 'In one week · far above usual');
  assert.equal(cardScaleLine({ monthly: false, tier: 2 }), 'In one week · above usual');
  assert.equal(cardScaleLine({ monthly: true, tier: 1 }), 'In one month · a little above usual');
  assert.equal(cardScaleLine({ monthly: false, tier: 0 }), 'In one week');
  assert.equal(cardScaleLine({ monthly: true, tier: -1 }), 'In one month · below usual');
  // The solidarity week's card: a big rise on paper, no word of it.
  const aid = season.weeks.find((w) => w.solidarity != null);
  assert.ok(aid != null && aid.tier === 3);
  assert.equal(cardScaleLine(aid), 'In one month');
});

test('week one is the same big fuel rise for everyone', () => {
  const first = season.weeks[0];
  assert.equal(first.kind, 'fuel');
  assert.equal(first.tier, 3);
});

test('a whole season can be played through the model', () => {
  const kept = season.weeks.map((w) => ({ chosen: 1, call: 1, tocco: toccoCall(w) }));
  const town = replay(season, kept);
  assert.equal(town.week, 13);
  assert.ok(town.coins >= 0 && town.coins <= 8);
});

/** Every line fits Tocco's panel: one short sentence or two. */
function fits(line) {
  assert.ok(line.length > 0 && line.length <= 52, `too long (${line.length}): ${line}`);
  assert.doesNotMatch(line, /\b(live|daily|news)\b/i, `forbidden word: ${line}`);
}

const PHASES = ['shut', 'morning', 'bell', 'rising', 'choosing', 'lowering', 'landed', 'days', 'sunday'];
/** Every step that has an instruction (line-queue.ts Step). */
const STEPS = ['latch', 'bell', 'choosing', 'chosen', 'model', 'visit', 'sun', 'sunOn', 'lamp', 'look', 'close'];

/** Every line the game can put on Tocco's panel or the family's, from lines.ts and answers.ts (ToccoSystem keeps no text of its own). */
function playerLines() {
  const lines = [];
  for (const kind of KINDS) {
    for (const tier of TIERS) lines.push(morningLine({ kind, tier }));
    for (let i = 0; i < 3; i += 1) lines.push(outcomeLine(kind, i));
    lines.push(outcomeLine(kind, 2, true));
    for (let i = -1; i < 3; i += 1) lines.push(familyLine(kind, i), familyLine(kind, i, false));
    lines.push(stageLine(kind, false), stageLine(kind, true), spottedLine(kind));
    for (let ago = 1; ago <= 11; ago += 1) lines.push(memoryLine(kind, ago));
  }
  for (let i = 0; i < 3; i += 1) lines.push(choiceLine(i, 8), choiceLine(i, 8, false));
  lines.push(HARD_WEEK_LIT, HARD_WEEK_COST, GIFT_NOTE, GIFT_LINE, DRAWING_LINE, FRAME_LINE, MARK_LINE, ASKING_LINE, LIGHTS_LINE, QUIET_LINE, TOWN_NOTE, GLASS_LINE, SAME_MARK, SECRET_LINE, YEAR_END);
  for (const answer of ['town', 'window', 'both']) for (const share of [0.5, 0.7, 0.9]) lines.push(...endingLines(answer, share));
  lines.push(...ledgerLines(12, 12, 3, 12));
  for (const tier of [-1, 0, 1, 2, 3]) lines.push(choosingLine(tier));
  for (const w of season.weeks) {
    lines.push(sundayLine(w, 0), sundayLine(w, 1));
    for (const call of [-1, 0, 1]) for (const tocco of [0, 1]) lines.push(settledLine(w, 1, call, tocco), settledLine({ ...w, next: -17.1 }, 0, call, tocco));
  }
  for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) lines.push(notchLine(a, b, c));
  for (let n = 1; n <= season.weeks.length; n += 1) {
    for (const phase of PHASES) lines.push(phaseLine(phase, n));
    for (const step of STEPS) lines.push(instructionLine(step, n, season.weeks.length));
    lines.push(lampLitLine(n, season.weeks.length), weekDoneLine(n, season.weeks.length));
  }
  lines.push(goalLine(season.weeks.length), ...Object.values(HELP), TAP_ME, REFUSED_EMPTY, NOT_YET, LINA_FIRST);
  for (let coins = 0; coins <= JAR_MAX; coins += 1) lines.push(jarLine(coins));
  for (let share = 0.4; share <= 1.0001; share += 0.05) lines.push(...festivalLines(share));
  lines.push(...INTRO, ...Object.values(FIRST_WEEK), ...Object.values(WEEK), calledLine(0), calledLine(1), calledLine(0, true), calledLine(1, true), UNSURE_LINE, KEY_LINE, GLASS_SIDES);
  lines.push(NOTHING, HEAT_LINE, AID_LINE, LAG_LINE, REFUSED_COINS, REFUSED_BUILT, SEASON_OVER, CONDUCT_LINE, SPYGLASS_LINE, WINDOWS_FIRST);
  lines.push(...QUESTIONS);
  for (const kind of KINDS) lines.push(cardTitle(kind));
  for (const w of season.weeks) lines.push(cardCredit(w), cardPriceLine(w), cardScaleLine(w));
  for (let n = 1; n <= season.weeks.length; n += 1) lines.push(cardWeekLine(n, season.weeks.length));
  lines.push(...TAGS);
  const towns = [replay(season, []), replay(season, season.weeks.slice(0, 5).map((w, i) => ({ chosen: i % 3, call: -1, tocco: -1 })))];
  for (const town of towns) for (const w of season.weeks) for (let q = 0; q < 3; q += 1) for (const chosen of [-1, 0, 1, 2]) lines.push(answer(q, w, town, chosen, true), answer(q, w, town, chosen, false), answer(q, w, town, chosen, true, true));
  return lines.filter((line) => line !== '');
}

test("Tocco's lines are short, and say nothing of live data or news", () => {
  for (const line of playerLines()) fits(line);
});

test('ToccoSystem says only lines from lines.ts, so the tests above see every one', () => {
  const source = readFileSync(new URL('../src/systems/tocco.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.(say|cue|interrupt)\(\s*(['"`])(?!\2)/);
});

test('no line the player sees says "kept"', () => {
  for (const line of playerLines()) assert.doesNotMatch(line, /\bkept\b/i, line);
  assert.equal(weekDoneLine(1, 12), 'Week 1 of 12 done. Progress saved.');
  assert.equal(WEEK.close, 'Close the shutters.');
  assert.equal(WEEK.seasonClose, 'Close the shutters. Season done.');
});

// The first week's lines as approved (META_VR_DEVIR1B_TASLAK.md section 4): what the typical first three minutes say.
const APPROVED_FIRST_WEEK = {
  latch: 'Slide the brass latch. Let the morning in.',
  bell: 'The bell rang. Pull the rope.',
  choosing: 'Tap one to see how it helps. Tapping is free.',
  chosen: 'Pull the lever on your left to pay. Or tap another.',
  model: "Tap Nora's house on the little model.",
  sun: 'Tap the brass sun. See what your choice does.',
  sunOn: 'Tap the sun on to Sunday.',
  lamp: 'Sunday. Tap the lamp, or use the match.',
  look: 'Look across the square.',
  close: 'Slide the latch to close the week.',
};

test('the first week names the thing to touch and the movement at every step', () => {
  for (const [step, line] of Object.entries(APPROVED_FIRST_WEEK)) assert.equal(instructionLine(step, 1, 12).replace('|', ' '), line, step);
  // The far window is a later week's step: the first week's is on the little model.
  assert.equal(instructionLine('visit', 1, 12), '');
  assert.equal(FIRST_WEEK.card, "Fuel costs more. Fewer cars. The road's too quiet.");
  assert.equal(FIRST_WEEK.knock, 'Knock on the little glass.');
  // Nothing is said as the basket rises: the card's line comes once it stands on the sill.
  for (const n of [1, 2]) assert.equal(phaseLine('rising', n), '');
  assert.deepEqual(
    [phaseLine('choosing', 1), phaseLine('lowering', 1), lampLitLine(1, 12), weekDoneLine(1, 12), goalLine(12)],
    [FIRST_WEEK.card, 'Down it goes. Hear it land?', 'Lina answered your lamp.', 'Week 1 of 12 done. Progress saved.', 'Festival in week 12. Every window lit?'],
  );
  assert.deepEqual(
    [TAP_ME, REFUSED_EMPTY, NOT_YET, LINA_FIRST],
    ['Tap me to see it once more.', 'Pick one first. Then the lever.', 'Not yet. Finish the week first.', 'Lina: Mum, Grandpa, look!|For you, Keeper!'],
  );
  assert.deepEqual(Object.values(HELP).map((line) => line.replace('|', ' ')), [
    'Touch the latch. Or pinch it and move right.',
    'Look right. Pull the handle, or point and pinch.',
    'Touch the key, the badge or the plan.',
    'Look left. Pull the lever, or point and pinch.',
    "Nora's house glows on the little model. Tap it.",
    'The brass sun, just below. Tap it.',
    'The brass sun, just below. Tap it.',
  ]);
  // Whom it reaches, when, what it costs and what stays in the jar, from five coins.
  assert.deepEqual([0, 1, 2].map((i) => choiceLine(i, 5 - COST[i])), ['Everyone a little, this week. Three coins. 2 left.', "Nora's family, over there. One coin. 4 left.", 'No one yet. Everyone, later on. Two coins. 3 left.']);
});

test('later weeks keep their shorter instructions and leave the latch, the lever and the sun to the ghost hand', () => {
  for (const n of [2, 5, 11]) {
    assert.equal(instructionLine('bell', n, 12), WEEK.bell);
    assert.equal(instructionLine('choosing', n, 12), choosingLine(0));
    assert.equal(instructionLine('lamp', n, 12), WEEK.lamp);
    assert.equal(instructionLine('close', n, 12), 'Close the shutters.');
    for (const step of ['latch', 'chosen', 'model', 'sun', 'sunOn', 'look']) assert.equal(instructionLine(step, n, 12), '', `${step}, week ${n}`);
    assert.equal(lampLitLine(n, 12), '');
    assert.equal(phaseLine('choosing', n), '');
    assert.equal(phaseLine('lowering', n), 'Down it goes. Hear it land?');
  }
  // From the second week the model stands on the stone, and a tap on it opens her window too.
  assert.equal(WEEK.visit, "Nora's window. Reach, or tap the model.");
  assert.equal(WEEK.visit.length, 39);
  for (const n of [2, 3, 7, 12]) assert.equal(instructionLine('visit', n, 12), WEEK.visit, `week ${n}`);
  // The last Sunday's close is the night's own (festival lines, then "Close the shutters. Season done.").
  assert.equal(instructionLine('close', 12, 12), '');
  assert.equal(lampLitLine(12, 12), CONDUCT_LINE);
});

test("the jar's line says the town's real balance", () => {
  const town = replay(season, []);
  assert.equal(jarLine(town.coins), 'Your jar: 5 coins. One more comes each week.');
  assert.equal(jarLine(1), 'Your jar: 1 coin. One more comes each week.');
  const later = replay(season, season.weeks.slice(0, 3).map(() => ({ chosen: 0, call: -1, tocco: -1 })));
  assert.match(jarLine(later.coins), new RegExp(`^Your jar: ${later.coins} coins?\\.`));
});

test('lines.ts imports nothing but types, so node loads it as it is', () => {
  const source = readFileSync(new URL('../src/season/lines.ts', import.meta.url), 'utf8');
  const imports = source.match(/^import .*$/gm) ?? [];
  assert.ok(imports.length > 0);
  for (const line of imports) assert.match(line, /^import type /, line);
});

test("the week's card names what moved, and the country only last on its credit line", () => {
  assert.equal(cardTitle('fuel'), 'Fuel prices');
  for (const kind of KINDS) assert.doesNotMatch(cardTitle(kind), /Mainland|Italy/);
  assert.equal(cardCredit(season.weeks[0]), 'Real week · Jan 2023 · Italy');
  const food = season.weeks.find((w) => w.monthly);
  assert.match(cardCredit(food), /^Real month · [A-Z][a-z]{2} 20\d\d · (Italy|Spain|US)$/);
  // The first week's card: the week in the season, then the price, and its credit row like every other week's (Devir 1c).
  assert.equal(cardWeekLine(1, 12), 'Week 1 of 12');
  assert.equal(cardPriceLine(season.weeks[0]), `Fuel prices +${season.weeks[0].change.toFixed(1)}%`);
  assert.equal(cardPriceLine({ kind: 'power', change: -3.84, monthly: false }), 'Power prices \u22123.8%');
  for (const w of season.weeks) assert.doesNotMatch(cardPriceLine(w), /Mainland|Italy/);
  assert.deepEqual([...TAGS], ['Everyone', 'One family', 'Build']);
});

test('the start page says a made-up island, not city, and writes no country: the season data names it, in small type under the last point', () => {
  const landing = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(landing.includes('<li>From a tower window, look after a made-up island for twelve weeks.</li>'));
  assert.ok(landing.includes('<li>The prices are real, from public data. The island and its people are made up.<small id="data-source"></small></li>'));
  assert.doesNotMatch(landing, /\bcity\b/i);
  assert.doesNotMatch(landing, /Italian|Italy/);
});

test('the live line stays off in the first week, in solidarity weeks and with no Worker', async () => {
  const { liveLineOpen } = await import('../src/season/live-gate.ts');
  assert.equal(liveLineOpen(true, 1, false), false);
  assert.equal(liveLineOpen(true, 0, false), false);
  assert.equal(liveLineOpen(true, 2, false), true);
  assert.equal(liveLineOpen(true, 12, false), true);
  assert.equal(liveLineOpen(true, 5, true), false);
  assert.equal(liveLineOpen(false, 5, false), false);
});

test('the postcard has no words on it', () => {
  const source = readFileSync(new URL('../src/station/postcard.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fillText|strokeText/);
});

test('the first morning says two lines, who the Keeper is and what playing well brings, and names no country', () => {
  assert.deepEqual(INTRO.map((line) => line.replace('|', ' ')), ['Welcome, Keeper. Care for this town for 12 weeks.', 'Help them well. More windows light the festival.']);
  const source = readFileSync(new URL('../src/season/lines.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Italy/);
});

test('every last night ends warmly, and only a full one says every window lit', () => {
  for (let share = 0.4; share <= 1.0001; share += 0.05) {
    const lines = festivalLines(share);
    assert.ok(lines.length > 0);
    for (const line of lines) {
      fits(line);
      assert.doesNotMatch(line, /\b(lost|loss|failed|fail|bad|worse|sorry)\b/i);
    }
    assert.equal(lines.join(' ').includes('Every window lit'), share >= EVERY_WINDOW);
  }
});

test("the family's lines name a speaker", () => {
  for (const kind of KINDS) for (let i = -1; i < 3; i += 1) assert.match(familyLine(kind, i), /^(Nora|Grandpa|Lina): /);
  for (const line of [NOTHING, HEAT_LINE, AID_LINE, LINA_FIRST]) assert.match(line, /^(Nora|Grandpa|Lina): /);
});

/** Names no player sees: Tocco and the town stay unnamed, and Tessa and Dario are now Nora and Grandpa. */
const OLD_NAMES = /\b(Tocco|Tessa|Dario|Ombrisa)\b/;

test('no player-visible text uses the old names', () => {
  const texts = [...playerLines()];
  for (const file of ['../index.html', '../public/credits.html']) texts.push(readFileSync(new URL(file, import.meta.url), 'utf8'));
  for (const text of texts) assert.doesNotMatch(text, OLD_NAMES, text.slice(0, 80));
});

test('the credits page players can open names every data source and its licence', () => {
  const page = readFileSync(new URL('../public/credits.html', import.meta.url), 'utf8');
  for (const needle of ['sisen.mase.gov.it', 'ember-energy.org', 'Istat', 'power.larc.nasa.gov', 'creativecommons.org/licenses/by/4.0', 'Changed:']) {
    assert.ok(page.includes(needle), `credits.html lacks ${needle}`);
  }
  const landing = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(landing.includes('href="credits.html"'));
});

/** Words the design keeps out of every text that touches a real disaster (META_VR_FIKIR.md §19). */
const FORBIDDEN = /\b(victims?|died|deaths?|lives|tragic|pray|RIP|donate|fund|survivors?|again|quake)\b/i;

test('no text uses the words kept away from real disasters', () => {
  const texts = playerLines();
  for (const w of season.weeks) {
    const letter = (w.solidarity ?? w.solidarityPending)?.letter ?? [];
    texts.push(...letter);
  }
  texts.push(AID_LINE);
  for (const file of ['../index.html', '../public/credits.html']) texts.push(readFileSync(new URL(file, import.meta.url), 'utf8'));
  for (const text of texts) assert.doesNotMatch(text, FORBIDDEN, text.slice(0, 80));
});

test('the solidarity week sits where the design allows and costs nothing', () => {
  const at = season.weeks.findIndex((w) => w.solidarity != null || w.solidarityPending != null);
  assert.ok(at >= 3 && at <= season.weeks.length - 3, `solidarity week at ${at + 1}`);
  const week = season.weeks[at];
  assert.notEqual(week.kind, 'power');
  assert.ok(week.calm != null && week.calm.kind === week.kind && week.calm.tier === 0);
  // Played as a solidarity week, nothing is paid and no calls are counted.
  const played = { ...season, weeks: season.weeks.map((w, i) => (i === at ? { ...w, solidarity: w.solidarity ?? w.solidarityPending } : w)) };
  const before = replay(played, played.weeks.slice(0, at).map(() => ({ chosen: -1, call: -1, tocco: -1 })));
  const after = replay(played, [...played.weeks.slice(0, at).map(() => ({ chosen: -1, call: -1, tocco: -1 })), { chosen: 0, call: 1, tocco: 1 }]);
  assert.equal(after.coins, Math.min(8, before.coins + 1));
  assert.equal(after.keeperNotches, before.keeperNotches);
});

test("the live line's filter keeps one short plain sentence and drops the rest", async () => {
  const { clean } = await import('../worker/src/index.ts');
  assert.equal(clean('  "You built the tram early; it helps now."  '), 'You built the tram early; it helps now.');
  assert.equal(clean('Prices rose 4% this week.'), null);
  assert.equal(clean('Read the news at https://example.com'), null);
  assert.equal(clean('The floods were bad.'), null);
  assert.equal(clean('Ok.'), null);
  assert.equal(clean('One. Two. Three. Four.'), null);
  // Longer than Tocco's panel line (52 characters).
  assert.equal(clean('You helped the family twice already, and the tram is nearly working now.'), null);
  // No name the game never shows: the clock figure, the town, the family's old names.
  for (const line of ['Tocco thinks the tram helps.', "Tessa's family will be glad.", 'Dario would like the garden.', 'All of Ombrisa says thanks.', 'tocco says the jar is light.']) {
    assert.equal(clean(line), null, line);
  }
  assert.equal(clean("Nora's family remembers the parcel."), "Nora's family remembers the parcel.");
});

test('from the second week the choice is asked by the week, and no line says which thing to pick', () => {
  assert.deepEqual([3, 2, 1, 0, -1].map((tier) => choosingLine(tier).replace('|', ' ')), [
    'A hard week for families here. Pick one.',
    'A hard week for families here. Pick one.',
    'Small rise. Pick one. Empty saves your coins.',
    'Pick one. Empty saves your coins.',
    'Prices fell. Pick one. Empty saves your coins.',
  ]);
  assert.equal(instructionLine('choosing', 2, 12, 2), choosingLine(2));
  assert.equal(instructionLine('choosing', 1, 12, 2), FIRST_WEEK.choosing);
  for (const tier of [-1, 0, 1, 2, 3]) assert.doesNotMatch(choosingLine(tier), /\b(key|badge|plan|everyone|family\b|build)/i);
});

test('the word model means the little model only; his line and his answer that food follows fuel are one', () => {
  assert.doesNotMatch(LAG_LINE, /model/i);
  const fuel = season.weeks.find((w) => w.kind === 'fuel');
  const town = { ...replay(season, []), lagging: true };
  assert.equal(answer(1, fuel, town, -1, false), LAG_LINE);
});

test("Tocco's answers fit his panel and never give a number", () => {
  assert.equal(QUESTIONS.length, 3);
  const towns = [replay(season, []), replay(season, season.weeks.slice(0, 5).map((w, i) => ({ chosen: i % 3, call: -1, tocco: -1 })))];
  for (const town of towns) {
    for (const w of season.weeks) {
      for (let q = 0; q < 3; q += 1) {
        for (const chosen of [-1, 0, 1, 2]) {
          const line = answer(q, w, town, chosen, true);
          fits(line);
          assert.doesNotMatch(line, /[0-9]/, line);
          assert.doesNotMatch(line, FORBIDDEN, line);
        }
      }
    }
  }
});

test('no chosen week ends flat: a call on it would read as went down 0.0%', () => {
  const flat = season.weeks.flatMap((week) => (week.calm != null ? [week, week.calm] : [week])).filter((w) => w.next === 0).map((w) => w.start);
  assert.deepEqual(flat, []);
});
