// Where the week's card stands in the basket, seen from the seated eye: `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASKET_ON_SILL, CARD_IN_BASKET, SEAT_EYE } from '../src/station/layout.ts';

/** Degrees right of straight ahead (the seat faces -z) of a point, from the eye. */
function yaw(x, z) {
  return (Math.atan2(x - SEAT_EYE.x, SEAT_EYE.z - z) * 180) / Math.PI;
}

/** The card is 17 cm wide (card.ts CARD_SIZE); its local x turns with its yaw only (Euler order YXZ). */
const HALF_WIDTH = 0.085;

const centre = {
  x: BASKET_ON_SILL.x + CARD_IN_BASKET.x,
  y: BASKET_ON_SILL.y + CARD_IN_BASKET.y,
  z: BASKET_ON_SILL.z + CARD_IN_BASKET.z,
};
const along = { x: Math.cos(CARD_IN_BASKET.yaw), z: -Math.sin(CARD_IN_BASKET.yaw) };

test("the card's centre in the basket is within 30 degrees of straight ahead", () => {
  const a = yaw(centre.x, centre.z);
  assert.ok(a > 0 && a <= 30, `card centre at ${a.toFixed(1)} degrees`);
  assert.ok(Math.abs(a - 29.6) < 0.2, `expected about 29.6 degrees, got ${a.toFixed(1)}`);
});

test('its right edge stays near 41 degrees, as agreed, and the left edge well inside', () => {
  const right = yaw(centre.x + along.x * HALF_WIDTH, centre.z + along.z * HALF_WIDTH);
  const left = yaw(centre.x - along.x * HALF_WIDTH, centre.z - along.z * HALF_WIDTH);
  assert.ok(right <= 42, `right edge at ${right.toFixed(1)} degrees`);
  assert.ok(left >= 0 && left < 30, `left edge at ${left.toFixed(1)} degrees`);
});

test('the card is 8 cm left of the basket middle, past the rim by about 2 cm at most 3', () => {
  assert.equal(CARD_IN_BASKET.x, -0.08);
  // The basket is 26 cm wide: its left rim is 13 cm from the middle.
  const leftEdge = centre.x - along.x * HALF_WIDTH;
  const past = BASKET_ON_SILL.x - 0.13 - leftEdge;
  assert.ok(past > 0 && past < 0.03, `left edge ${(past * 100).toFixed(1)} cm past the rim`);
});

test('with Larger captions the card stays on the stone and clear of the drawing, from above', async () => {
  await import('./station-hooks.mjs');
  const { CARD_ON_SILL, CARD_SIZE, cardLift } = await import('../src/station/card.ts');
  const { DRAWING_LARGE_ASIDE, DRAWING_ON_SILL, DRAWING_SIZE } = await import('../src/station/drawing.ts');
  const scale = 1.3;
  // The card's lower edge, tilted back, as it grows.
  const drop = (scale * CARD_SIZE.h * Math.cos(CARD_ON_SILL.tilt)) / 2;
  assert.ok(CARD_ON_SILL.y + cardLift(scale) - drop >= BASKET_ON_SILL.y, 'in the stone');
  // Four corners from above (Euler YXZ: tilt about x, then yaw).
  const corners = (p, w, h) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const x = (a * w) / 2;
    const y = (b * h) / 2;
    const z = y * Math.sin(-p.tilt);
    return [p.x + x * Math.cos(p.yaw) + z * Math.sin(p.yaw), p.z - x * Math.sin(p.yaw) + z * Math.cos(p.yaw)];
  });
  const overlap = (a, b) => {
    for (const poly of [a, b]) {
      for (let i = 0; i < 4; i += 1) {
        const [x0, z0] = poly[i];
        const [x1, z1] = poly[(i + 1) % 4];
        const n = [z1 - z0, x0 - x1];
        const span = (q) => q.map(([x, z]) => x * n[0] + z * n[1]);
        if (Math.max(...span(a)) <= Math.min(...span(b)) || Math.max(...span(b)) <= Math.min(...span(a))) return false;
      }
    }
    return true;
  };
  const card = corners(CARD_ON_SILL, CARD_SIZE.w * scale, CARD_SIZE.h * scale);
  const drawing = corners({ ...DRAWING_ON_SILL, x: DRAWING_ON_SILL.x + DRAWING_LARGE_ASIDE }, DRAWING_SIZE.w, DRAWING_SIZE.h);
  assert.equal(overlap(card, drawing), false);
});
