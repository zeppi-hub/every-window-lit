// The start page's two comfort options, larger captions and less motion: off by default, remembered per viewer,
// and the page works without storage. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { largerCaptions, lessMotion, loadComfort, setComfort } from '../src/comfort.ts';

/** A stand-in for the browser's storage. */
function memory() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), items };
}

test('both comfort options start off and are remembered per viewer', () => {
  const storage = memory();
  assert.deepEqual(loadComfort(() => storage), { largerCaptions: false, lessMotion: false });
  setComfort('largerCaptions', true, () => storage);
  assert.equal(largerCaptions(), true);
  assert.equal(lessMotion(), false);
  // A new visit reads them back.
  setComfort('largerCaptions', false, () => null);
  assert.deepEqual(loadComfort(() => storage), { largerCaptions: true, lessMotion: false });
  setComfort('lessMotion', true, () => storage);
  setComfort('largerCaptions', false, () => storage);
  assert.deepEqual(loadComfort(() => storage), { largerCaptions: false, lessMotion: true });
});

test('the page works without storage: blocked or missing, both options are off and can still be turned on', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };
  const failing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  for (const storage of [blocked, () => null, () => undefined, () => failing]) {
    assert.deepEqual(loadComfort(storage), { largerCaptions: false, lessMotion: false });
    setComfort('lessMotion', true, storage);
    assert.equal(lessMotion(), true);
    setComfort('lessMotion', false, storage);
  }
});
