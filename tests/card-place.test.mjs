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
