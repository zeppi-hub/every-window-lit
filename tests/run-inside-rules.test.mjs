// THE RUN from inside the queue (S07) as numbers (src/v2/run-inside-rules.ts). `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as rules from '../src/v2/run-inside-rules.ts';

const { INSIDE, crackFor, swingFor, ringOffset, crackOf, slowPlayerHolds } = rules;

test('each round cracks quicker and swings wider', () => {
  for (let r = 1; r < INSIDE.rounds; r += 1) {
    assert.ok(crackFor(r, 0) < crackFor(r - 1, 0));
    assert.ok(swingFor(r, 0).reach > swingFor(r - 1, 0).reach);
  }
});

test('after three late rounds every crack is slower and the swing smaller', () => {
  for (let r = 0; r < INSIDE.rounds; r += 1) {
    assert.ok(crackFor(r, INSIDE.mercyAfter) > crackFor(r, 0));
    assert.ok(swingFor(r, INSIDE.mercyAfter).reach < swingFor(r, 0).reach);
  }
});

test('a slow player (0.9 s to notice, 0.7 s to reach, half a swing to wait) comes through every round', () => {
  for (let r = 0; r < INSIDE.rounds; r += 1) assert.ok(slowPlayerHolds(r, 0), `round ${r + 1}`);
});

test('the ring swings about straight in front, within its reach', () => {
  const { period, reach } = swingFor(2, 0);
  for (let t = 0; t < period; t += 0.05) assert.ok(Math.abs(ringOffset(t, period, reach)) <= reach + 1e-9);
  assert.equal(ringOffset(0, period, reach), 0);
});

test('a crack spreads from a little to all, and reddens only in its second half', () => {
  assert.ok(crackOf(0, 4).spread > 0 && crackOf(0, 4).spread < 0.2);
  assert.equal(crackOf(4, 4).spread, 1);
  assert.equal(crackOf(1.9, 4).red, 0);
  assert.equal(crackOf(4, 4).red, 1);
});
