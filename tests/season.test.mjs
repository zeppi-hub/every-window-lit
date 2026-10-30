// Checks the baked season and Tocco's lines: `node --test tests/`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { choiceLine, familyLine, memoryLine, morningLine, notchLine, settledLine, stageLine, sundayLine } from '../src/season/lines.ts';
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
