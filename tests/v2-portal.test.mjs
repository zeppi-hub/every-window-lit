// The way into a memory and back (the new version): the orb grows round the head into white, the world is swapped
// once at full white, and the white opens; with Less motion only a fade. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { FADE_SECONDS, GROW_SECONDS, OPEN_SECONDS, PortalTimeline, WHITE_SECONDS } = await import('../src/v2/portal.ts');

function run(timeline, seconds, step = 1 / 72) {
  const frames = [];
  for (let t = 0; t < seconds; t += step) {
    timeline.update(step);
    frames.push({ phase: timeline.phase, grown: timeline.grown, white: timeline.white });
  }
  return frames;
}

test('in: the orb grows round the head, the world is swapped once at full white, then the white opens', () => {
  const timeline = new PortalTimeline();
  let swaps = 0;
  timeline.enter(false, () => {
    swaps += 1;
    assert.equal(timeline.white, 1, 'all white when the world is swapped');
    assert.equal(timeline.grown, 1);
  });
  const frames = run(timeline, GROW_SECONDS + WHITE_SECONDS + OPEN_SECONDS + 0.2);
  assert.equal(swaps, 1);
  assert.equal(timeline.phase, 'idle');
  const closing = frames.filter((f) => f.phase === 'closing');
  assert.ok(closing[0].grown < 0.05 && closing.at(-1).grown > 0.95, 'it grows from the orb');
  for (let i = 1; i < closing.length; i += 1) assert.ok(closing[i].grown >= closing[i - 1].grown);
  const opening = frames.filter((f) => f.phase === 'opening');
  for (let i = 1; i < opening.length; i += 1) assert.ok(opening[i].white <= opening[i - 1].white);
});

test('with Less motion nothing grows at the player: the white fades in and out, quicker', () => {
  const timeline = new PortalTimeline();
  let swapped = false;
  timeline.enter(true, () => (swapped = true));
  const frames = run(timeline, FADE_SECONDS + WHITE_SECONDS + FADE_SECONDS + 0.1);
  assert.ok(swapped);
  assert.ok(frames.filter((f) => f.phase === 'closing').every((f) => f.grown === 1));
  assert.equal(timeline.phase, 'idle');
});

test('out through white is a fade, and a second request while busy is ignored', () => {
  const timeline = new PortalTimeline();
  let swaps = 0;
  timeline.leave(false, () => (swaps += 1));
  timeline.enter(false, () => (swaps += 10));
  run(timeline, FADE_SECONDS + WHITE_SECONDS + OPEN_SECONDS + 0.1);
  assert.equal(swaps, 1);
});
