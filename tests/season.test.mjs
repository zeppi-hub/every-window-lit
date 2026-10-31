// Checks the baked season and Tocco's lines: `node --test tests/`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AID_LINE, choiceLine, EVERY_WINDOW, familyLine, festivalLines, outcomeLine, memoryLine, morningLine, notchLine, settledLine, stageLine, sundayLine } from '../src/season/lines.ts';
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

test("Tocco's lines are short, and say nothing of live data or news", () => {
  for (const kind of KINDS) {
    for (const tier of TIERS) fits(morningLine({ kind, tier }));
    for (let i = 0; i < 3; i += 1) fits(choiceLine(kind, i));
    for (let i = 0; i < 3; i += 1) fits(outcomeLine(kind, i));
    fits(stageLine(kind, false));
    fits(stageLine(kind, true));
    for (let ago = 1; ago <= 11; ago += 1) fits(memoryLine(kind, ago));
  }
  for (const w of season.weeks) {
    fits(settledLine(w, 1));
    fits(sundayLine(w, 0));
  }
  for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) fits(notchLine(a, b, c));
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
  for (const kind of KINDS) for (let i = -1; i < 3; i += 1) assert.match(familyLine(kind, i), /^(Tessa|Dario|Lina): /);
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
  const texts = [];
  for (const kind of KINDS) {
    for (const tier of TIERS) texts.push(morningLine({ kind, tier }));
    for (let i = -1; i < 3; i += 1) texts.push(familyLine(kind, i));
    for (let i = 0; i < 3; i += 1) texts.push(choiceLine(kind, i));
  }
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
});

test("Tocco's answers fit his panel and never give a number", async () => {
  const { answer, QUESTIONS } = await import('../src/season/answers.ts');
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
