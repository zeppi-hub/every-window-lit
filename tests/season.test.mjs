// Checks the baked season and Tocco's lines: `node --test tests/`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AID_LINE, calledLine, cardCredit, cardTitle, choiceLine, CONDUCT_LINE, SPYGLASS_LINE, spottedLine, WINDOWS_FIRST, EVERY_WINDOW, familyLine, festivalLines, FIRST_WEEK, HEAT_LINE, INTRO, LAG_LINE, lampLitLine, outcomeLine, memoryLine, morningLine, NOTHING, notchLine, phaseLine, REFUSED_BUILT, REFUSED_COINS, SEASON_OVER, settledLine, stageLine, sundayLine, WEEK, weekDoneLine } from '../src/season/lines.ts';
import { answer, QUESTIONS } from '../src/season/answers.ts';
import { replay, toccoCall } from '../src/season/model.ts';

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
    assert.match(w.month, /^[A-Z][a-z]{2} 20\d\d$/);
    assert.ok(w.start >= '2023-01-01' && w.start <= '2026-10-31');
  }
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

/** Every line the game can put on Tocco's panel or the family's, from lines.ts and answers.ts (ToccoSystem keeps no text of its own). */
function playerLines() {
  const lines = [];
  for (const kind of KINDS) {
    for (const tier of TIERS) lines.push(morningLine({ kind, tier }));
    for (let i = 0; i < 3; i += 1) lines.push(outcomeLine(kind, i));
    lines.push(outcomeLine(kind, 2, true));
    for (let i = -1; i < 3; i += 1) lines.push(familyLine(kind, i));
    lines.push(stageLine(kind, false), stageLine(kind, true), spottedLine(kind));
    for (let ago = 1; ago <= 11; ago += 1) lines.push(memoryLine(kind, ago));
  }
  for (let i = 0; i < 3; i += 1) lines.push(choiceLine(i));
  for (const w of season.weeks) lines.push(settledLine(w, 1), settledLine(w, 0, false), sundayLine(w, 0), sundayLine(w, 1));
  for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) lines.push(notchLine(a, b, c));
  for (let n = 1; n <= season.weeks.length; n += 1) {
    for (const phase of PHASES) lines.push(phaseLine(phase, n));
    lines.push(lampLitLine(n, season.weeks.length), weekDoneLine(n));
  }
  for (let share = 0.4; share <= 1.0001; share += 0.05) lines.push(...festivalLines(share));
  lines.push(...INTRO, ...Object.values(FIRST_WEEK), ...Object.values(WEEK), calledLine(0), calledLine(1));
  lines.push(NOTHING, HEAT_LINE, AID_LINE, LAG_LINE, REFUSED_COINS, REFUSED_BUILT, SEASON_OVER, CONDUCT_LINE, SPYGLASS_LINE, WINDOWS_FIRST);
  lines.push(...QUESTIONS);
  for (const kind of KINDS) lines.push(cardTitle(kind));
  for (const w of season.weeks) lines.push(cardCredit(w, season.country));
  const towns = [replay(season, []), replay(season, season.weeks.slice(0, 5).map((w, i) => ({ chosen: i % 3, call: -1, tocco: -1 })))];
  for (const town of towns) for (const w of season.weeks) for (let q = 0; q < 3; q += 1) for (const chosen of [-1, 0, 1, 2]) lines.push(answer(q, w, town, chosen, true), answer(q, w, town, chosen, false));
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
  assert.equal(weekDoneLine(1), 'Week 1 done.');
  assert.equal(WEEK.close, 'Close the shutters.');
  assert.equal(WEEK.seasonClose, 'Close the shutters. Season done.');
});

test('the first week spells out each step once and lets the rest show without words', () => {
  const first = PHASES.map((phase) => phaseLine(phase, 1)).filter((line) => line !== '');
  assert.deepEqual(first, [FIRST_WEEK.bell, FIRST_WEEK.card, FIRST_WEEK.choosing, FIRST_WEEK.family]);
  assert.equal(phaseLine('lowering', 1), '');
  assert.equal(phaseLine('lowering', 2), 'Down it goes. Hear it land?');
  assert.equal(phaseLine('rising', 2), '');
  assert.equal(lampLitLine(1, 12), '');
  assert.equal(lampLitLine(2, 12), 'Close the shutters.');
  assert.equal(lampLitLine(12, 12), CONDUCT_LINE);
  for (const line of first) assert.doesNotMatch(line, /Down it goes|Reach|Slide the sun/);
  assert.deepEqual([0, 1, 2].map((i) => choiceLine(i)), ['For everyone. Three coins.', 'For one family. One coin.', 'For later. Two coins.']);
});

test("the week's card names what moved, and the country only last on its credit line", () => {
  assert.equal(cardTitle('fuel'), 'Pump prices');
  for (const kind of KINDS) assert.doesNotMatch(cardTitle(kind), /Mainland|Italy/);
  assert.equal(cardCredit(season.weeks[0], season.country), 'Real week · Jan 2023 · Italy');
  const food = season.weeks.find((w) => w.monthly);
  assert.match(cardCredit(food, season.country), /^Real month · [A-Z][a-z]{2} 20\d\d · Italy$/);
});

test('the postcard has no words on it', () => {
  const source = readFileSync(new URL('../src/station/postcard.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fillText|strokeText/);
});

test('the first morning says one line, who the Keeper is, and names no country', () => {
  assert.deepEqual([...INTRO], ['Welcome, Keeper. The town is yours for a year.']);
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
  for (const line of [NOTHING, HEAT_LINE, AID_LINE]) assert.match(line, /^(Nora|Grandpa|Lina): /);
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
  // No name the game never shows: the clock figure, the town, the family's old names.
  for (const line of ['Tocco thinks the tram helps.', "Tessa's family will be glad.", 'Dario would like the garden.', 'All of Ombrisa says thanks.', 'tocco says the jar is light.']) {
    assert.equal(clean(line), null, line);
  }
  assert.equal(clean("Nora's family remembers the parcel."), "Nora's family remembers the parcel.");
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
