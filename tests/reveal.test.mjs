// When the brass sun comes to the sill (src/line-queue.ts sunShown, as RevealSystem applies it), and that the window
// across the square and the sun never invite at once in the first week (season/window-light.ts). `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { familyDone, MODEL_SECONDS, sunShown } from '../src/line-queue.ts';
import { GREET_AFTER, windowState } from '../src/season/window-light.ts';

const FRAME = 1 / 72;

test('in the first week the sun is not on the sill before the landing, nor as the basket lands', () => {
  for (const phase of ['shut', 'morning', 'bell', 'rising', 'choosing', 'lowering']) assert.equal(sunShown(1, phase, 0, false, false), false, phase);
  assert.equal(sunShown(1, 'landed', 0, false, false), false);
  // From the evenings on it is there, as it is every day from the second week.
  assert.equal(sunShown(1, 'days', 0, true, false), true);
  assert.equal(sunShown(1, 'sunday', 0, true, false), true);
  for (const week of [2, 3, 12]) for (const phase of ['shut', 'morning', 'bell', 'choosing', 'landed']) assert.equal(sunShown(week, phase, 0, false, false), true, `${week} ${phase}`);
});

/**
 * The first week's landing, frame by frame: the family visited at `visitAt` (their box in until `homeAt`), or never
 * (-1). Returns the first frame's time the sun is on the sill, and checks every frame that the window's invitation
 * and the sun's are never both up.
 */
function landing(visitAt, homeAt, until = 60) {
  let first = -1;
  for (let t = 0; t <= until; t += FRAME) {
    const visited = visitAt >= 0 && t >= visitAt;
    const boxIn = visited && t < homeAt;
    const sun = sunShown(1, 'landed', t, visited, boxIn);
    if (sun && first < 0) first = t;
    // The window as FamilySystem.writeLight sees it: their turn passed unvisited once familyDone says so.
    const window = windowState({ phase: 'landed', timer: t, greetAt: GREET_AFTER, open: true, aid: false, chosen: 1, visited, passed: !visited && familyDone(1, t, false), helped: false, evening: 0, lamp: false, answered: -1, kept: -1 });
    assert.ok(!(window === 'invite' && sun), `${t.toFixed(2)} s: the window and the sun both invite`);
  }
  return first;
}

test('unvisited, the sun comes 30 s after the landing, as the window stops inviting', () => {
  const at = landing(-1, -1);
  assert.ok(at >= MODEL_SECONDS && at < MODEL_SECONDS + FRAME, `${at.toFixed(3)} s`);
});

test("visited, the sun comes the frame the family's box is home again, not while it is in", () => {
  // Visited at 6 s, the box home again at 21.1 s (its flight back takes 1.1 s).
  let at = landing(6, 21.1);
  assert.ok(at >= 21.1 && at < 21.1 + FRAME, `${at.toFixed(3)} s`);
  // A long visit past the 30 s mark: still only once the box is home.
  at = landing(20, 45);
  assert.ok(at >= 45 && at < 45 + FRAME, `${at.toFixed(3)} s`);
});
