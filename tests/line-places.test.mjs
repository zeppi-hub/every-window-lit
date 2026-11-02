// Where Tocco's line and his question panel hang, seen from the seated eye: every place they can take stays in
// the comfortable band for reading, 30 degrees either side, at most 20 up and 35 down. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Object3D, Vector3 } = await import('@iwsdk/core');
const { SEAT_EYE } = await import('../src/station/layout.ts');
const { ASK_ROWS, ASK_SIZE } = await import('../src/station/ask.ts');
const { ASK_LIFT, faceSeat, LINE_AT_BASKET, LINE_HOME, LINE_SUNDAY } = await import('../src/station/tocco.ts');

/** Degrees right of and above straight ahead, from the seated eye. */
function seen(p) {
  const dx = p.x - SEAT_EYE.x;
  const dz = SEAT_EYE.z - p.z;
  return { yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: (Math.atan2(p.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI };
}

function inBand(name, p) {
  const { yaw, pitch } = seen(p);
  assert.ok(Math.abs(yaw) <= 30, `${name} centre ${yaw.toFixed(1)} degrees to the side`);
  assert.ok(pitch <= 20, `${name} centre ${pitch.toFixed(1)} degrees up`);
  assert.ok(pitch >= -35, `${name} centre ${(-pitch).toFixed(1)} degrees down`);
}

/** A point `lift` above `at` along a panel there that faces the seat (as ToccoSystem lays out his questions). */
function lifted(at, lift) {
  const home = new Object3D();
  faceSeat(home, at);
  return new Vector3(0, lift, 0).applyQuaternion(home.quaternion).add(home.position);
}

test("each place Tocco's line hangs is in the reading band", () => {
  inBand('his line beside him', LINE_HOME);
  inBand('his line over the basket', LINE_AT_BASKET);
  inBand('his line over the Sunday arrows', LINE_SUNDAY);
});

test('his question panel and each of its rows are in the reading band', () => {
  inBand('the question panel', lifted(LINE_HOME, ASK_LIFT));
  for (let i = 0; i < ASK_ROWS; i += 1) inBand(`question row ${i + 1}`, lifted(LINE_HOME, ASK_LIFT + (1 - i) * (ASK_SIZE.h / ASK_ROWS)));
});
