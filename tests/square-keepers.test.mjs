// The six memory keepers' places on the square (src/v2/square-keepers.ts). `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as s from '../src/v2/square-keepers.ts';

const places = s.KEEPERS.map((k) => ({ key: k.key, at: k.at, stand: k.stand, range: s.rangeOf(k.at), bearing: s.bearingOf(k.at) }));
const TURN = (s.SEAT_TURN * 180) / Math.PI;

test('all six are seen from the seat without turning the head: within 35 degrees of where the seat faces, and Gray beside the bird stays at the edge of the view', () => {
  const bearings = places.map((p) => p.bearing - TURN);
  const widest = Math.max(...bearings.map(Math.abs));
  assert.ok(widest <= 35, `the furthest is ${widest.toFixed(1)} degrees off the middle`);
  // Gray's head is 80 degrees to the bird's left: with the seat turned no more than this it is past 60 degrees off the middle.
  assert.ok(80 - TURN >= 60, `Gray's head is ${(80 - TURN).toFixed(0)} degrees off the middle`);
  // Turned straight out over the square (the fights put the bird back so), they are still within a headset's view.
  for (const p of places) assert.ok(p.bearing > 0 && p.bearing <= 48, `${p.key} at ${p.bearing.toFixed(1)} degrees`);
});

test('near enough to read, far enough to fly to: 4 to 8 m from the seat', () => {
  for (const p of places) assert.ok(p.range >= 4 && p.range <= 8, `${p.key} at ${p.range.toFixed(1)} m`);
});

test('left to right in the order of the day\'s troubles, and no one behind another', () => {
  for (let i = 1; i < places.length; i += 1) {
    const gap = places[i - 1].bearing - places[i].bearing;
    assert.ok(gap >= 7, `${places[i - 1].key} and ${places[i].key} are ${gap.toFixed(1)} degrees apart`);
  }
});

test('an orb at that range is at least two and a half degrees across', () => {
  for (const p of places) {
    const across = (2 * Math.atan(s.ORB_R / p.range) * 180) / Math.PI;
    assert.ok(across >= 2.5, `${p.key}: ${across.toFixed(1)} degrees`);
  }
});

test('no stand is on the run\'s panes, in the sandbag wall, in the sharks\' way, on the reporter, or between the lamp and what it looks at', () => {
  const c = s.KEEP_CLEAR;
  const h = s.STAND_HALF;
  for (const p of places) {
    const [x, , z] = p.at;
    const onPanes = x + h > c.panes.fromX && x - h < c.panes.toX && z + h > c.panes.fromZ && z - h < c.panes.toZ;
    assert.ok(!onPanes, `${p.key} is off the panes`);
    assert.ok(Math.abs(z - c.wall.z) > h + c.wall.deep, `${p.key} is ${Math.abs(z - c.wall.z).toFixed(2)} m from the wall's line`);
    // The widest fin's path is an ellipse: outside it by the stand's half width.
    const e = Math.hypot((x - c.sharks.x) / (c.sharks.alongX + h), (z - c.sharks.z) / (c.sharks.alongZ + h));
    assert.ok(e > 1, `${p.key} is clear of the fins (${e.toFixed(2)})`);
    assert.ok(Math.hypot(x - c.reporter.x, z - c.reporter.z) > h + 0.3, `${p.key} is clear of the reporter`);
    // To the left of the line from the lamp to the right end of the panes (as the lamp sees it), by a metre.
    const dx = c.lampSees.x - c.lamp.x;
    const dz = c.lampSees.z - c.lamp.z;
    const side = (dx * (z - c.lamp.z) - dz * (x - c.lamp.x)) / Math.hypot(dx, dz);
    if (z > c.lampSees.z) assert.ok(side > 1, `${p.key} is ${side.toFixed(2)} m clear of the lamp's view`);
  }
});

test('the stands near the bank are higher than the flood\'s red line (1.02 m above the square\'s ground level 0)', () => {
  for (const p of places) if (p.at[2] < s.KEEP_CLEAR.wall.z) assert.ok(s.GROUND + p.stand > 1.02, `${p.key} stands at ${(s.GROUND + p.stand).toFixed(2)} m`);
});

test('stands do not touch each other', () => {
  for (let i = 0; i < places.length; i += 1)
    for (let j = i + 1; j < places.length; j += 1) {
      const gap = Math.max(Math.abs(places[i].at[0] - places[j].at[0]), Math.abs(places[i].at[2] - places[j].at[2]));
      assert.ok(gap > s.STAND_HALF * 2 + 0.2, `${places[i].key} and ${places[j].key}: ${gap.toFixed(2)} m`);
    }
});

test('the last keeper, who still waits in the evening, stands clear of the wolf that runs past him', () => {
  const w = s.KEEP_CLEAR.wolfRun;
  const [x, , z] = s.KEEPERS[s.KEEPERS.length - 1].at;
  const dx = w.toX - w.fromX;
  const dz = w.toZ - w.fromZ;
  const t = Math.max(0, Math.min(1, ((x - w.fromX) * dx + (z - w.fromZ) * dz) / (dx * dx + dz * dz)));
  const gap = Math.hypot(x - (w.fromX + dx * t), z - (w.fromZ + dz * t));
  assert.ok(gap > s.STAND_HALF + w.half + 0.2, `${gap.toFixed(2)} m from the wolf's line`);
});
