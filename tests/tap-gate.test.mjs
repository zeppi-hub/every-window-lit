// A tap that waits out a brush (the tower key beside the match, the door ring): `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TAP_DELAY, TapGate } from '../src/tap-gate.ts';

/** Runs a gate through timed events at 72 frames a second for `seconds`; returns when it fired (s), or -1. */
function run(events, seconds = 2) {
  const gate = new TapGate();
  const frame = 1 / 72;
  let fired = -1;
  for (let t = 0; t < seconds; t += frame) {
    for (const [at, what] of events) if (at >= t && at < t + frame) gate[what]();
    if (gate.step(frame) && fired < 0) fired = t + frame;
  }
  return fired;
}

test('waits 350 ms after the touch ends, as the latch does', () => {
  assert.equal(TAP_DELAY, 0.35);
});

test('a deliberate tap on the key sends the Keeper down once the wait has passed', () => {
  const fired = run([[0, 'press'], [0.2, 'release']]);
  assert.ok(fired >= 0.2 + TAP_DELAY && fired < 0.2 + TAP_DELAY + 0.03, `fired at ${fired}`);
});

test('a 100 ms brush on the key on the way to the match does not', () => {
  // The fingertip crosses the key (0.50, 0.76, -0.26) for 100 ms, then takes the match (0.47, 0.76, -0.37):
  // 11 cm at a reach's pace, about 150 ms, and the grab starts.
  assert.equal(run([[0, 'press'], [0.1, 'release'], [0.25, 'cancel']]), -1);
  // Even a slow reach, the grab starting just before the wait ends.
  assert.equal(run([[0, 'press'], [0.1, 'release'], [0.1 + TAP_DELAY - 0.02, 'cancel']]), -1);
  // Or the hand still on the key as the fingers close on the match.
  assert.equal(run([[0, 'press'], [0.08, 'cancel'], [0.1, 'release']]), -1);
});

test('a touch held long still counts once it ends', () => {
  const fired = run([[0, 'press'], [1, 'release']], 3);
  assert.ok(fired >= 1 + TAP_DELAY && fired < 1 + TAP_DELAY + 0.03, `fired at ${fired}`);
});
