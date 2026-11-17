// The parrot's words (the new version): learned once each, in order, seven at most (the grey one and six slots);
// only a learned word can be chosen and said; the wing's slots fan out from the shoulder. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { onV2 } = await import('../src/v2/events.ts');
const { slotPlace, Vocabulary, WING_SLOTS } = await import('../src/v2/vocabulary.ts');

test('words are learned once each, in order, up to the wing\'s seven slots', () => {
  const v = new Vocabulary();
  const learned = [];
  const off = onV2('wordLearned', ({ word }) => learned.push(word));
  assert.ok(v.learn('Fresh bread', 0x9a9a9a));
  assert.ok(!v.learn('Fresh bread', 0x9a9a9a), 'not twice');
  for (const word of ['Safety net', 'Firewall', 'Bail out', 'Stress test', 'Prime the pump', 'Ring-fence']) assert.ok(v.learn(word, 0xffffff));
  assert.equal(WING_SLOTS, 7);
  assert.ok(!v.learn('Haircut', 0xffffff), 'the wing is full');
  assert.deepEqual(v.learned.map((w) => w.text).slice(0, 2), ['Fresh bread', 'Safety net']);
  assert.equal(learned.length, 7);
  off();
});

test('only a learned word can be chosen or said, and what is said is kept in order', () => {
  const v = new Vocabulary();
  const said = [];
  const off = onV2('wordSpoken', ({ word }) => said.push(word));
  v.learn('Fresh bread', 0x9a9a9a);
  v.select('Bail out');
  assert.equal(v.selected, null);
  v.select('Fresh bread');
  assert.equal(v.selected, 'Fresh bread');
  assert.ok(!v.speak('Bail out'));
  assert.ok(v.speak('Fresh bread'));
  assert.deepEqual(v.spoken, ['Fresh bread']);
  assert.deepEqual(said, ['Fresh bread']);
  const before = v.version;
  v.reset();
  assert.equal(v.learned.length, 0);
  assert.ok(v.version > before, 'the wing sees the change');
  off();
});

test('the slots fan out from the shoulder, outward, a little down, opening', () => {
  const first = slotPlace(0);
  const last = slotPlace(WING_SLOTS - 1);
  assert.ok(last.x < first.x - 0.1, 'outward (the left wing: toward -x)');
  assert.ok(last.y <= first.y && last.lean > first.lean);
  for (let i = 1; i < WING_SLOTS; i += 1) assert.ok(slotPlace(i).x < slotPlace(i - 1).x);
});

test('neighbouring feathers stay at least 5 cm apart along their whole 10 cm length', () => {
  // A feather runs from its slot along local -x turned by its lean about the up axis.
  const along = (i, t) => {
    const s = slotPlace(i);
    return [s.x - Math.cos(s.lean) * t, s.y, s.z + Math.sin(s.lean) * t];
  };
  for (let i = 1; i < WING_SLOTS; i += 1) {
    let nearest = Infinity;
    for (let a = 0; a <= 10; a += 1) for (let b = 0; b <= 10; b += 1) nearest = Math.min(nearest, Math.hypot(...along(i, a / 100).map((v, k) => v - along(i - 1, b / 100)[k])));
    assert.ok(nearest >= 0.05, `slots ${i - 1} and ${i}: ${nearest.toFixed(3)} m`);
  }
});
