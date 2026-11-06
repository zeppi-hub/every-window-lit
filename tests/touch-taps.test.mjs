// touch-taps.ts leans on IWSDK's internal grab Handle: this says so at once if an update moves it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './station-hooks.mjs';

const { ComponentRegistry } = await import('@iwsdk/core');
const { filterTouch } = await import('../src/touch-taps.ts');

test("IWSDK still has the grab Handle touch-taps.ts takes hold of", () => {
  assert.ok(ComponentRegistry.getById('Handle') != null);
});

test('a handle ignores the touch pointer, and keeps its other options', () => {
  const handle = { getOptions: () => ({ rotate: true }) };
  assert.equal(filterTouch(handle), true);
  const made = handle.getOptions();
  assert.equal(made.rotate, true);
  assert.equal(made.filter({ pointerType: 'touch' }), false);
  assert.equal(made.filter({ pointerType: 'ray' }), true);
  assert.equal(made.filter({ pointerType: 'grab' }), true);
});

test('anything else is refused, not half done', () => {
  assert.equal(filterTouch({}), false);
});
