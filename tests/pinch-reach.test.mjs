// A hand's pinch takes what its ring shows (17 Nov): the grab sphere on the pinch point, a touch pointer that only
// wakes near something to poke, and the rings drawn from the same choice. Read from the sources. `node --test tests/`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const reach = read('src/systems/pinch-reach.ts');
const marks = read('src/systems/grip-marks.ts');
const index = read('src/index.ts');
const number = (name) => Number(reach.match(new RegExp(`const ${name} = ([0-9.]+)`))?.[1] ?? reach.match(new RegExp(`export const ${name} = ([0-9.]+)`))?.[1]);

test('a pinch reaches about 3 cm round the pinch point, where the ghost hand pinches on the ring', () => {
  assert.equal(number('PINCH_REACH'), 0.03);
  assert.match(reach, /hand\.get\('thumb-tip'\)/);
  assert.match(reach, /hand\.get\('index-finger-tip'\)/);
  assert.match(reach, /multiplyScalar\(0\.5\)/, 'midway between the two tips');
  assert.match(reach, /intersector\.options\.radius = PINCH_REACH/);
});

test("the touch pointer wakes only well inside IWSDK's 15 cm hover, and turns off a little farther out", () => {
  const on = number('TOUCH_ON');
  const off = number('TOUCH_OFF');
  assert.ok(on > number('PINCH_REACH') && on < off && off < 0.15, `${on} / ${off}`);
  assert.match(reach, /getButtonsDown\(\)\.size > 0\) on = true/, 'never cut a touch that is pressing');
});

test('a controller keeps IWSDK\'s own grab sphere round its grip', () => {
  assert.match(reach, /hand \? this\.spaces\[side\] : this\.player\.gripSpaces\[side\]/);
  assert.match(reach, /else delete intersector\.options\.radius/);
});

test('the rings fill from the pinch\'s own choice, worked out first in the frame', () => {
  assert.match(marks, /this\.hits\[i\] = pinchTarget\(side\)\.thing/);
  const a = index.indexOf('registerSystem(PinchReachSystem)');
  const b = index.indexOf('registerSystem(GripMarkSystem)');
  assert.ok(a > 0 && b > a, 'PinchReachSystem before GripMarkSystem');
});
