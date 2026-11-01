// Sunday's call: which weeks have one, what a kept week records, what the next morning settles. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callsOpen, callsToSettle, keptEntry, shouldHush } from '../src/season/settle.ts';

test('the first week and solidarity weeks have no call; every other week does', () => {
  assert.equal(callsOpen(1, false), false);
  assert.equal(callsOpen(2, false), true);
  assert.equal(callsOpen(12, false), true);
  assert.equal(callsOpen(5, true), false);
});

test('the first week keeps its choice and no calls, whatever was left in the week', () => {
  assert.deepEqual(keptEntry(1, false, 1, -1, -1), { chosen: 1, call: -1, tocco: -1 });
  // Even if a stray call or Tocco's trend rule had been set, week 1 records none.
  assert.deepEqual(keptEntry(1, false, 0, 1, 0), { chosen: 0, call: -1, tocco: -1 });
  assert.deepEqual(keptEntry(2, false, 2, 1, 0), { chosen: 2, call: 1, tocco: 0 });
  assert.deepEqual(keptEntry(6, true, 0, 1, 1), { chosen: 0, call: -1, tocco: -1, aid: true });
});

test('the second morning settles nothing aloud after a first week with no call', () => {
  const first = keptEntry(1, false, 1, -1, -1);
  const calls = callsToSettle([first], 0);
  assert.deepEqual(calls, []);
  // No held answer: no hush, no chime, no notch line.
  assert.equal(shouldHush(calls), false);
});

test('a week with a call is settled the next morning, with its week number, and only once', () => {
  const kept = [keptEntry(1, false, 1, -1, -1), keptEntry(2, false, 0, 1, 0)];
  const calls = callsToSettle(kept, 1);
  assert.deepEqual(calls, [{ week: 2, kept: { chosen: 0, call: 1, tocco: 0 } }]);
  assert.equal(shouldHush(calls), true);
  assert.deepEqual(callsToSettle(kept, 2), []);
  // A solidarity week between them has nothing of its own; the call before it is settled the week after it.
  const across = [...kept, keptEntry(3, true, 0, 1, 1)];
  assert.deepEqual(callsToSettle(across, 1).map((c) => c.week), [2]);
  // Tocco's call alone (the Keeper made none) is still settled.
  assert.equal(callsToSettle([keptEntry(4, false, -1, -1, 1)], 0).length, 1);
});
