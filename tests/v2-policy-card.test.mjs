// The policy card (the new version): heading, what was done, "In real life: <date>", effect and cost, wrapped to the
// paper and fitting it with the design's longest texts. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { CARD_PAPER, CARD_TYPE, layoutPolicyCard, wrap } = await import('../src/v2/policy-card-layout.ts');

// A stand-in for the canvas: a character is about 0.56 of the font size wide (a semibold sans), 0.62 for the serif heading.
const measure = (text, style) => text.length * CARD_TYPE[style].size * (style === 'title' ? 0.62 : 0.56);
const width = CARD_PAPER.w - 2 * CARD_PAPER.margin;

// The longest of each field in the design's cards (META_VR_V2_TASARIM.md, Bölüm 5).
const LONGEST = {
  title: 'RATES CUT TO ZERO. $787 BILLION SPENT',
  done: 'Banks must keep everyday savings on one side, and their own bets on the other.',
  when: 'In real life: the word is British. Law passed in 2013, in force 1 January 2019. The United States chose a different rule in 2010.',
  effect: 'It worked: the banks stood, and their money came back with a gain. The car makers\' did not: about $80 billion in, about $70 billion back.',
  cost: 'The price: public debt rose from 40% to 62% of the economy by 2010.',
  objection: '"If the state guarantees everyone, who guarantees the state?"',
};

test('every line stays inside the paper, a long word alone on its line', () => {
  assert.deepEqual(wrap('a b c', 1000, 'body', measure), ['a b c']);
  const rows = wrap(LONGEST.done, width, 'body', measure);
  assert.ok(rows.length > 1);
  for (const row of rows) assert.ok(measure(row, 'body') <= width, row);
  assert.deepEqual(wrap('Supercalifragilistic', 10, 'body', measure), ['Supercalifragilistic']);
});

test('the card reads in order: headline, what was done, when, effect, cost, objection; no words of its own', () => {
  const layout = layoutPolicyCard(LONGEST, measure);
  const texts = layout.lines.map((l) => l.text);
  const at = (t) => texts.findIndex((x) => x.startsWith(t));
  assert.equal(layout.lines[0].style, 'title');
  assert.ok(at('Banks must') < at('In real life:') && at('In real life:') < at('It worked:') && at('It worked:') < at('The price:') && at('The price:') < at('"If the state'));
  const joined = texts.join(' ');
  for (const word of joined.split(/\s+/)) assert.ok(Object.values(LONGEST).join(' ').includes(word), word);
  for (let i = 1; i < layout.lines.length; i += 1) assert.ok(layout.lines[i].y > layout.lines[i - 1].y);
});

test("the design's longest texts fit the paper; a far longer one is reported as not fitting", () => {
  assert.ok(layoutPolicyCard(LONGEST, measure).fits);
  const long = { ...LONGEST, done: LONGEST.done.repeat(5) };
  assert.ok(!layoutPolicyCard(long, measure).fits);
});
