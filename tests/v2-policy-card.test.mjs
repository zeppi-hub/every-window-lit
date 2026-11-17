// The policy card (the new version): heading, what was done, "In real life: <date>", effect and cost, wrapped to the
// paper and fitting it with the design's longest texts. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { CARD_PAPER, CARD_TYPE, layoutPolicyCard, wrap } = await import('../src/v2/policy-card-layout.ts');

// A stand-in for the canvas: a character is about 0.56 of the font size wide (a semibold sans), 0.62 for the serif heading.
const measure = (text, style) => text.length * CARD_TYPE[style].size * (style === 'title' ? 0.62 : 0.56);
const width = CARD_PAPER.w - 2 * CARD_PAPER.margin;

// The longest rows of the design's table (META_VR_V2_TASARIM.md, "Altı kelime, altı anı").
const LONGEST = {
  title: 'Prime the pump',
  done: 'Interest rates cut almost to zero, a spending package of about 787 billion dollars, and countries acting together.',
  when: 'December 2008 to April 2009',
  effect: 'The recession ended in June 2009; unemployment peaked at 10 percent in October 2009.',
  cost: 'Public debt rose.',
};

test('every line stays inside the paper, a long word alone on its line', () => {
  assert.deepEqual(wrap('a b c', 1000, 'body', measure), ['a b c']);
  const rows = wrap(LONGEST.done, width, 'body', measure);
  assert.ok(rows.length > 1);
  for (const row of rows) assert.ok(measure(row, 'body') <= width, row);
  assert.deepEqual(wrap('Supercalifragilistic', 10, 'body', measure), ['Supercalifragilistic']);
});

test('the card reads in order: kicker, heading, what was done, the real date, effect, cost', () => {
  const layout = layoutPolicyCard(LONGEST, measure);
  const texts = layout.lines.map((l) => l.text);
  const at = (t) => texts.findIndex((x) => x.startsWith(t));
  assert.equal(texts[0], 'POLICY');
  assert.ok(at('Prime the pump') === 1);
  assert.ok(at('WHAT WAS DONE') < at('In real life: December 2008') && at('In real life:') < at('EFFECT') && at('EFFECT') < at('COST'));
  for (let i = 1; i < layout.lines.length; i += 1) assert.ok(layout.lines[i].y > layout.lines[i - 1].y);
});

test("the design's longest texts fit the paper; a far longer one is reported as not fitting", () => {
  assert.ok(layoutPolicyCard(LONGEST, measure).fits);
  const long = { ...LONGEST, done: LONGEST.done.repeat(5) };
  assert.ok(!layoutPolicyCard(long, measure).fits);
});
