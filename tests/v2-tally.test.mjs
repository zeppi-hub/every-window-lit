// The count at nightfall (the new version's last scene): each learned word's gold words and credit line, the windows
// said as a number, the family's window said outright, and the square's verdict. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { COUNTED, countLine, familyLine, squareVerdict, traceOf } = await import('../src/v2/tally.ts');

test('each of the six words has its own gold words, its own line and its own light', () => {
  const words = ['Safety net', 'Firewall', 'Bail out', 'Stress test', 'Prime the pump', 'Ring-fence'];
  const tallies = words.map((word) => traceOf(word));
  assert.ok(tallies.every((t) => t != null));
  assert.deepEqual(tallies.map((t) => t.won), ['PANIC CALMED', 'FIRE CONTAINED', 'BANK AFLOAT', 'FOG LIFTED', 'WATER RUNS', 'SAVINGS FENCED']);
  assert.equal(new Set(tallies.map((t) => t.trace)).size, 6, 'six different things light up');
  tallies.forEach((t, i) => assert.ok(t.line.startsWith(`${words[i]}. `), `${words[i]}'s line begins with the word`));
});

test('a word is found however it is capitalised, and the family\'s word has no fight', () => {
  assert.equal(traceOf('RING-FENCE')?.won, 'SAVINGS FENCED');
  assert.equal(traceOf(' prime the pump ')?.trace, 'pump');
  assert.equal(traceOf('Fresh bread'), null);
  assert.equal(traceOf('Haircut'), null);
});

test('Gray counts up to six lent words', () => {
  assert.equal(COUNTED[4], 'four');
  assert.equal(COUNTED[6], 'six');
  assert.equal(COUNTED.length, 7);
});

test('the windows are said as a number, never more than there are', () => {
  assert.equal(countLine(11, 12), '11 of 12 windows lit');
  assert.equal(countLine(14, 12), '12 of 12 windows lit');
  assert.equal(countLine(-2, 12), '0 of 12 windows lit');
});

test('the family\'s window is said outright, and the verdict follows the count', () => {
  assert.equal(familyLine(true), "Your family's window: lit.");
  assert.equal(squareVerdict(12, 12), 'You kept every home on the square.');
  assert.equal(squareVerdict(7, 12), 'You kept most of the square. Not all of it.');
  assert.equal(squareVerdict(6, 12), 'You kept most of the square. Not all of it.');
  assert.equal(squareVerdict(2, 12), 'You kept your own, and a few more.');
  assert.equal(squareVerdict(0, 12), 'You kept one window: your own. It is a start.');
});

test('no line of the count is too long for one caption plate (two rows of about thirty letters)', () => {
  const lines = [familyLine(true), familyLine(false), ...[0, 2, 7, 12].map((lit) => squareVerdict(lit, 12)), ...['Safety net', 'Firewall', 'Bail out', 'Stress test', 'Prime the pump', 'Ring-fence'].map((w) => traceOf(w).line)];
  for (const line of lines) assert.ok(line.length <= 62, `${line} (${line.length})`);
});
