// The world shaking, never the camera (the new version): a sway and a tremor, medium and strong, growing in and
// dying out, a third the size and slower with Less motion. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { CALM_SIZE, envelope, FALL, quakeAt, QUAKE_SIZES, RISE } = await import('../src/v2/quake.ts');

const peak = (spec, calm, seconds = 20) => {
  const out = { pitch: 0, roll: 0, x: 0, y: 0, z: 0 };
  let turn = 0;
  let move = 0;
  for (let t = 0; t < seconds; t += 1 / 90) {
    quakeAt(spec, t, calm, out);
    turn = Math.max(turn, Math.abs(out.roll), Math.abs(out.pitch));
    move = Math.max(move, Math.abs(out.x), Math.abs(out.y), Math.abs(out.z));
  }
  return { turn, move };
};

test('it grows in, holds, and dies out to exactly nothing', () => {
  assert.equal(envelope(0, 5), 0);
  assert.ok(envelope(RISE / 2, 5) > 0 && envelope(RISE / 2, 5) < 1);
  assert.equal(envelope(2, 5), 1);
  assert.ok(envelope(5 - FALL / 2, 5) < 1);
  assert.equal(envelope(5, 5), 0);
  assert.equal(envelope(100, Infinity), 1, 'an endless one holds till stopped');
});

test('a strong quake is bigger than a medium one, and never past its sizes', () => {
  for (const kind of ['sway', 'tremor']) {
    const medium = peak({ kind, strength: 'medium', seconds: Infinity }, false);
    const strong = peak({ kind, strength: 'strong', seconds: Infinity }, false);
    assert.ok(strong.turn > medium.turn && strong.move > medium.move, kind);
    assert.ok(strong.turn <= QUAKE_SIZES[kind].strong.turn + 1e-9 && strong.move <= QUAKE_SIZES[kind].strong.move + 1e-9);
  }
  // A ship's sway rolls further and slower than a tremor shakes.
  assert.ok(QUAKE_SIZES.sway.medium.turn > QUAKE_SIZES.tremor.strong.turn);
  assert.ok(QUAKE_SIZES.sway.medium.hz < 1 && QUAKE_SIZES.tremor.medium.hz > 3);
});

test('Less motion: about a third of the size', () => {
  const spec = { kind: 'sway', strength: 'strong', seconds: Infinity };
  const full = peak(spec, false, 60);
  const calm = peak(spec, true, 60);
  assert.ok(calm.turn <= full.turn * CALM_SIZE + 1e-6, `${calm.turn} vs ${full.turn}`);
  assert.ok(calm.turn > full.turn * CALM_SIZE * 0.5);
});
