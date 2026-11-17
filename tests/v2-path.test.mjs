// Hold and carry along a path (the new version's pump lever, rope, bucket, oar): the grip's path, a hand's or a
// ray's point projected on it, a hold that never jumps to the hand, and full strokes. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Quaternion, Vector3 } = await import('@iwsdk/core');
const { heldProgress, placeOnPath, progressNearPoint, progressNearRay, samplePath, StrokeCounter, SWING_SAMPLES } = await import('../src/v2/path.ts');

const slide = { kind: 'slide', a: new Vector3(0, 1, 0), b: new Vector3(0, 0.8, 0), axis: new Vector3(1, 0, 0), from: 0, to: 0, grip: new Vector3() };
const swing = { kind: 'swing', a: new Vector3(0, 1, 0), b: new Vector3(), axis: new Vector3(1, 0, 0), from: 0.5, to: -0.5, grip: new Vector3(0, 0.2, 0) };
const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("a slide's grip runs straight from a to b; a swing's grip runs round its pivot", () => {
  const s = samplePath(slide);
  assert.equal(s.points.length, 2);
  close(s.lengths[1], 0.2);
  const w = samplePath(swing);
  assert.equal(w.points.length, SWING_SAMPLES + 1);
  for (const p of w.points) close(p.distanceTo(swing.a), 0.2);
  close(w.lengths.at(-1), 0.2 * 1.0, 2e-3);
});

test("a hand's point is taken to the nearest point of the path, by length", () => {
  const s = samplePath(slide);
  close(progressNearPoint(s, new Vector3(0.3, 0.9, 0.1)), 0.5);
  close(progressNearPoint(s, new Vector3(0, 2, 0)), 0, 1e-9);
  close(progressNearPoint(s, new Vector3(0, -5, 0)), 1, 1e-9);
  const w = samplePath(swing);
  // Straight up from the pivot is the middle of the swing.
  close(progressNearPoint(w, new Vector3(0, 1.4, 0)), 0.5, 0.02);
});

test("a ray drags the handle to the path's point nearest the ray", () => {
  const s = samplePath(slide);
  // A ray along z through y = 0.85 crosses the slide three quarters down.
  close(progressNearRay(s, new Vector3(0, 0.85, 2), new Vector3(0, 0, -1)), 0.75);
  // From above and to the side, aimed at y = 0.95.
  const dir = new Vector3(-1, -0.05, 0).normalize();
  close(progressNearRay(s, new Vector3(1, 1, 0), dir), 0.25, 0.01);
});

test('a hold moves the handle by how far its controller moved along the path, never jumping to it', () => {
  close(heldProgress(0.3, 0.9, 0.9), 0.3);
  close(heldProgress(0.3, 0.9, 1.1), 0.5);
  close(heldProgress(0.9, 0.2, 0.9), 1);
  close(heldProgress(0.1, 0.5, 0), 0);
});

test('placing a swing turns it about its axis from its own starting turn', () => {
  const base = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
  const position = new Vector3();
  const quaternion = new Quaternion();
  placeOnPath(swing, 1, base, position, quaternion);
  assert.ok(position.equals(swing.a));
  const grip = swing.grip.clone().applyQuaternion(quaternion).add(position);
  const last = samplePath(swing, base).points.at(-1);
  close(grip.distanceTo(last), 0, 1e-6);
  placeOnPath(slide, 0.5, base, position, quaternion);
  close(position.y, 0.9);
});

test('a stroke is one trip from one end to the other and back', () => {
  const strokes = new StrokeCounter();
  const done = [0, 0.5, 1, 0.5, 0.02, 0.6, 0.97, 0.03, 0.5].map((p) => strokes.step(p));
  assert.equal(strokes.count, 2);
  assert.deepEqual(done.map((d, i) => (d ? i : -1)).filter((i) => i >= 0), [4, 7]);
  const half = new StrokeCounter();
  [0, 0.6, 0, 0.7, 0].forEach((p) => half.step(p));
  assert.equal(half.count, 0, 'half strokes never count');
});
