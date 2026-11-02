// When the morning bell rings (src/bell.ts): after the quiet morning, once nothing holds it back, and at the limit
// whatever does. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bellRings, FIRST_MORNING_LIMIT, FIRST_MORNING_SECONDS, MORNING_LIMIT, MORNING_SECONDS, morningPaused } from '../src/bell.ts';
import { GREET_AFTER, GREET_AFTER_REVEAL, GREET_SECONDS } from '../src/season/window-light.ts';

test('the first week rings 13 s into its morning, other weeks 6 s, when nothing holds the bell back', () => {
  // The town's 5 s, then two opening lines read 4 s each (tests/opening.test.mjs plays it through).
  assert.equal(FIRST_MORNING_SECONDS, 13);
  assert.equal(MORNING_SECONDS, 6);
  assert.equal(bellRings(12.9, true, false), false);
  assert.equal(bellRings(13, true, false), true);
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

test("the morning's clock stands still while the Keeper is in the town, the shutters are shut or the family's box is in", () => {
  assert.equal(morningPaused(false, true, false), false);
  assert.equal(morningPaused(true, true, false), true);
  assert.equal(morningPaused(false, false, false), true);
  assert.equal(morningPaused(false, true, true), true);
});

/**
 * A third-week morning with a call to settle, at 72 frames a second: the family's box is called 2.5 s after the
 * latch, just before Tocco's chime (3 s), and stays 15 s (home at 18.6 s, with its flight). His two settling lines
 * wait behind the box and follow it 4 s apart (ToccoSystem); last week's answer holds Lina's greeting until its first
 * line is up, and then it comes GREET_AFTER_REVEAL later on the morning's clock (FamilySystem). Returns when the
 * first line went up, the greeting began and the bell rang (s since the latch).
 */
function morningWithBox(pauseForBox) {
  const frame = 1 / 72;
  const boxIn = (t) => t >= 2.5 && t < 18.6;
  let timer = 0;
  let greetAt = GREET_AFTER;
  let firstLine = -1;
  let greet = -1;
  for (let t = 0; t < 40; t += frame) {
    timer += morningPaused(false, true, pauseForBox && boxIn(t)) ? 0 : frame;
    // Lines from the chime on, shown only once the box has gone: the first at once, the second 4 s later.
    if (firstLine < 0 && t >= 3 && !boxIn(t)) firstLine = t;
    const revealHeld = firstLine < 0;
    const linesWaiting = t >= 3 && (firstLine < 0 || t < firstLine + 4);
    if (revealHeld && timer < greetAt) greetAt = Math.max(greetAt, timer + GREET_AFTER_REVEAL);
    const greeting = timer >= greetAt && timer < greetAt + GREET_SECONDS;
    if (greeting && greet < 0) greet = t;
    if (bellRings(timer, false, linesWaiting || revealHeld || greeting)) return { firstLine, greet, bell: t };
  }
  return { firstLine, greet, bell: -1 };
}

test("with the family's box in for 15 s, the morning goes on after it: last week's answer, then Lina's greeting, then the bell", () => {
  const { firstLine, greet, bell } = morningWithBox(true);
  assert.ok(firstLine >= 18.6 && firstLine < 18.7, `answer at ${firstLine.toFixed(2)} s`);
  assert.ok(greet > firstLine && bell > greet + GREET_SECONDS - 0.05, `greeting at ${greet.toFixed(2)} s, bell at ${bell.toFixed(2)} s`);
  // Before, the clock ran behind the box: the bell rang at the morning's limit, 20 s, before the greeting began.
  const before = morningWithBox(false);
  assert.ok(Math.abs(before.bell - MORNING_LIMIT) < 0.03 && (before.greet < 0 || before.greet > before.bell), `before: bell at ${before.bell.toFixed(2)} s, greeting at ${before.greet.toFixed(2)} s`);
});
