// Choosing a keeper to fly to (src/v2/game/director.ts, day.ts): the body counts, the line from the eye through the pinch counts, the one pointed at is named. `node --test tests/`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const director = readFileSync(new URL('../src/v2/game/director.ts', import.meta.url), 'utf8');
const day = readFileSync(new URL('../src/v2/game/day.ts', import.meta.url), 'utf8');

test('a keeper is taken by pointing at the palm or at the body under it', () => {
  assert.match(director, /const BODY_R = 0\.\d+;/);
  assert.match(director, /distanceSqToSegment\(this\.lineFrom, this\.lineTo\)/);
});

test('for a tracked hand the line from the eye through the pinch picks too', () => {
  assert.match(director, /this\.sightRay\.direction\.subVectors\(hand, this\.headAt\)/);
  assert.match(director, /this\.aimAt\(i, this\.sightRay\)/);
});

test('the keeper pointed at is known before any pinch, lit and named, and the plate moves aside for the turn', () => {
  assert.match(director, /this\.perchAim = aim;/);
  assert.match(day, /lightAimed\(d, keepers, open\)/);
  assert.match(day, /drawTag\(tag, `\$\{KEEPERS\[k\]\.key\.toUpperCase\(\)\} · the \$\{KEEPERS\[k\]\.memory\}`\)/);
  assert.match(day, /placeGoal\(-0\.3, 0\.45\);[\s\S]*placeGoal\(\);/);
});
