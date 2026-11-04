// A tap that waits out a brush (the tower key beside the match): `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANDLE_TAP_SECONDS, HANDLE_TAP_TRAVEL, handleTap, LET_GO_SECONDS, realHold, TAP_DELAY, TAP_LONGEST, TapGate, TRY_LET_GO_SECONDS } from '../src/tap-gate.ts';

/** Runs a gate through timed events at 72 frames a second for `seconds`; returns how many times it fired and when it first did (s, or -1). */
function run(events, seconds = 2) {
  const gate = new TapGate();
  const frame = 1 / 72;
  let fired = -1;
  let count = 0;
  for (let t = 0; t < seconds; t += frame) {
    for (const [at, what] of events) if (at >= t && at < t + frame) gate[what]();
    if (gate.step(frame)) {
      count += 1;
      if (fired < 0) fired = t + frame;
    }
  }
  return { count, fired };
}

/** Whether a tap let go at `at` fired when its wait was over, give or take a frame. */
function onTime(fired, at) {
  return fired >= at + TAP_DELAY - 1 / 72 && fired < at + TAP_DELAY + 0.03;
}

test('waits 350 ms after the touch ends, as the latch does', () => {
  assert.equal(TAP_DELAY, 0.35);
  assert.equal(TAP_LONGEST, 1);
});

test('a deliberate tap on the key sends the Keeper down once, when the wait has passed', () => {
  const { count, fired } = run([[0, 'press'], [0.2, 'release']]);
  assert.equal(count, 1);
  assert.ok(onTime(fired, 0.2), `fired at ${fired}`);
});

test('a 100 ms brush on the key on the way to the match does not', () => {
  // The fingertip crosses the key (0.50, 0.76, -0.26) for 100 ms, then takes the match (0.47, 0.76, -0.37):
  // 11 cm at a reach's pace, about 150 ms, and the grab starts.
  assert.equal(run([[0, 'press'], [0.1, 'release'], [0.25, 'cancel']]).count, 0);
  // Even a slow reach, the grab starting just before the wait ends.
  assert.equal(run([[0, 'press'], [0.1, 'release'], [0.1 + TAP_DELAY - 0.02, 'cancel']]).count, 0);
  // Or the hand still on the key as the fingers close on the match.
  assert.equal(run([[0, 'press'], [0.08, 'cancel'], [0.1, 'release']]).count, 0);
});

test('a brush followed by nothing is a tap: the hand stopped on the key', () => {
  const { count, fired } = run([[0, 'press'], [0.1, 'release']]);
  assert.equal(count, 1);
  assert.ok(onTime(fired, 0.1), `fired at ${fired}`);
});

test('pressed, let go, pressed again and let go within the wait: one tap, after the second', () => {
  const { count, fired } = run([[0, 'press'], [0.15, 'release'], [0.3, 'press'], [0.45, 'release']]);
  assert.equal(count, 1);
  assert.ok(onTime(fired, 0.45), `fired at ${fired}`);
});

test('a touch held up to a second counts once it ends; held longer, the hand was resting there', () => {
  const { count, fired } = run([[0, 'press'], [0.9, 'release']], 3);
  assert.equal(count, 1);
  assert.ok(onTime(fired, 0.9), `fired at ${fired}`);
  assert.equal(run([[0, 'press'], [1.2, 'release']], 3).count, 0);
  // A new touch after a long one is timed afresh.
  assert.equal(run([[0, 'press'], [1.2, 'release'], [1.5, 'press'], [1.7, 'release']], 3).count, 1);
});

test('a touch whose hand is lost (the pointer cancelled) does not count, whenever its end is reported', () => {
  assert.equal(run([[0, 'press'], [0.2, 'cancel'], [0.21, 'release']]).count, 0);
  assert.equal(run([[0, 'press'], [0.2, 'release'], [0.2, 'cancel']]).count, 0);
});

test('a short touch on a handle that hardly moves it is a tap; a pull, or a long hold, is not', () => {
  const tap = { fired: false, heldFor: 0.05, maxPull: 0, sinceHold: Number.POSITIVE_INFINITY, lastFired: false };
  assert.equal(handleTap(tap), true);
  assert.equal(realHold(tap), false);
  assert.equal(handleTap({ ...tap, fired: true }), false);
  assert.equal(handleTap({ ...tap, heldFor: HANDLE_TAP_SECONDS }), false);
  assert.equal(handleTap({ ...tap, maxPull: HANDLE_TAP_TRAVEL }), false);
  // A pull past the threshold, a try that moved it, a long hold: each is a real hold.
  assert.equal(realHold({ ...tap, fired: true, heldFor: 0.5, maxPull: 0.13 }), true);
  assert.equal(realHold({ ...tap, heldFor: 0.55, maxPull: 0.052 }), true);
  assert.equal(realHold({ ...tap, heldFor: 0.8 }), true);
});

test('the fingertip brushing the rope handle as the hand lets go is no haul; a tap a moment later is', () => {
  // Measured in the emulator (hand walk, week 1): the rope's handle, let go 13 cm down, springs back up past the
  // opening fingers; the brushes came 0.02 to 0.9 s after the hold ended, and one used to count a second haul.
  for (const since of [0, 0.02, 0.3, 0.72, 0.9, 1.19]) {
    assert.equal(handleTap({ fired: false, heldFor: 0.02, maxPull: 0, sinceHold: since, lastFired: true }), false, `brush ${since} s after letting go`);
  }
  assert.equal(LET_GO_SECONDS, 1.2);
  assert.equal(handleTap({ fired: false, heldFor: 0.1, maxPull: 0.004, sinceHold: LET_GO_SECONDS, lastFired: true }), true);
  // Taps in a row (the hands-only fallback: three taps for three hauls) are not real holds, so none silences the next.
  assert.equal(realHold({ fired: false, heldFor: 0.1, maxPull: 0.004, sinceHold: 0.4, lastFired: false }), false);
});

test('a Keeper who tried the slide and fell short can tap at once; only a pull that reached its click has the long let-go', () => {
  assert.equal(TRY_LET_GO_SECONDS, 0.4);
  const touch = { fired: false, heldFor: 0.1, maxPull: 0.002 };
  // After a try that never reached its click, about 0.4 s: the fingers opening, then a real tap.
  for (const since of [0, 0.1, 0.39]) assert.equal(handleTap({ ...touch, sinceHold: since, lastFired: false }), false, `${since} s after the try`);
  for (const since of [TRY_LET_GO_SECONDS, 0.5, 0.9, 1.19]) assert.equal(handleTap({ ...touch, sinceHold: since, lastFired: false }), true, `${since} s after the try`);
  // After a pull that reached it, the same touch at the same moment is still the hand letting go.
  for (const since of [0.5, 0.9, 1.19]) assert.equal(handleTap({ ...touch, sinceHold: since, lastFired: true }), false, `${since} s after the pull`);
  assert.equal(handleTap({ ...touch, sinceHold: 1.2, lastFired: true }), true);
  // A first touch, with no hold before it, is a tap.
  assert.equal(handleTap({ ...touch, sinceHold: Number.POSITIVE_INFINITY, lastFired: false }), true);
});
