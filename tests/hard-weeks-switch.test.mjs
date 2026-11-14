// The start page's flood-week switch when the browser blocks storage: it still holds for the visit. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const blocked = () => {
  throw new Error('storage blocked');
};
globalThis.window = { localStorage: { getItem: blocked, setItem: blocked, removeItem: blocked } };
const { hardWeeksOn, setHardWeeks } = await import('../src/season/store.ts');

test('with storage blocked the flood-week switch still turns off and on for this visit', () => {
  assert.equal(hardWeeksOn(), true, 'on unless switched off');
  setHardWeeks(false);
  assert.equal(hardWeeksOn(), false);
  setHardWeeks(true);
  assert.equal(hardWeeksOn(), true);
});
