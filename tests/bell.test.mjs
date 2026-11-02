// When the morning bell rings (src/bell.ts): after the quiet morning, once nothing holds it back, and at the limit
// whatever does. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bellRings, FIRST_MORNING_LIMIT, FIRST_MORNING_SECONDS, MORNING_LIMIT, MORNING_SECONDS } from '../src/bell.ts';

test('the first week rings 8 s into its morning, other weeks 6 s, when nothing holds the bell back', () => {
  assert.equal(FIRST_MORNING_SECONDS, 8);
  assert.equal(MORNING_SECONDS, 6);
  assert.equal(bellRings(7.9, true, false), false);
  assert.equal(bellRings(8, true, false), true);
  assert.equal(bellRings(5.9, false, false), false);
  assert.equal(bellRings(6, false, false), true);
});

test("Tocco's lines, last week's held answer or Lina's greeting hold it back, up to 20 s", () => {
  assert.equal(MORNING_LIMIT, 20);
  assert.equal(FIRST_MORNING_LIMIT, 20);
  // A greeting pushed back by the reveal plays from 5.5 to 7.9 s: the bell waits for it, not landing on its notes.
  for (const t of [6, 7.9, 19.9]) assert.equal(bellRings(t, false, true), false, `${t} s`);
  assert.equal(bellRings(20, false, true), true);
  assert.equal(bellRings(19.9, true, true), false);
  assert.equal(bellRings(20, true, true), true);
});
