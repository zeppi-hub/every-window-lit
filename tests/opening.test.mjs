// The very first minute, from Enter VR to the bell (src/opening.ts, line-queue.ts, bell.ts and lines.ts as
// ToccoSystem and BasketSystem run them), on a fresh load or after Start at week 1: `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bellRings, FIRST_MORNING_LIMIT, FIRST_MORNING_SECONDS } from '../src/bell.ts';
import { LINE_SECONDS, MIN_SECONDS, panelMove, stepOf } from '../src/line-queue.ts';
import { DOOR_AFTER, FIRST_HUSH_SECONDS, OUT_TO_SPEAK, outInClosedRoom, ride } from '../src/opening.ts';
import { INTRO, instructionLine } from '../src/season/lines.ts';
import { RESTART_WEEK } from '../src/restart.ts';

const FRAME = 1 / 72;

/**
 * Plays the first minute at 72 frames a second from the week a fresh load or Start at week 1 gives (restart.ts),
 * the Keeper sliding the latch `latchAt` seconds after Enter VR. Returns when Tocco was out, when each line went up
 * and came down (seconds since Enter VR), and when the bell rang.
 */
function firstMinute(latchAt, start = RESTART_WEEK) {
  const week = { ...start };
  let out = 0;
  let outAt = -1;
  let hush = 0;
  let bellAt = -1;
  // Tocco's panel, as ToccoSystem keeps it.
  const p = { up: 'none', upStep: '', text: '', shownFor: 0, left: 0, lines: [] };
  const put = (up, step, text, left) => Object.assign(p, { up, upStep: step, text, shownFor: 0, left });
  const shown = [];
  for (let i = 0; i * FRAME < 60 && bellAt < 0; i += 1) {
    const t = i * FRAME;
    const immersiveFor = t;
    // The latch: the shutters open on the morning; the first morning's hush starts with nothing to say.
    if (!week.shuttersOpen && t >= latchAt) {
      Object.assign(week, { shuttersOpen: true, phase: 'morning', timer: 0 });
      if (p.up !== 'story' && p.lines.length === 0) hush = FIRST_HUSH_SECONDS;
    }
    const want = outInClosedRoom(week.week, week.phase, week.shuttersOpen, false, immersiveFor) || week.shuttersOpen || (p.up !== 'none' && week.phase === 'shut');
    out = ride(out, want, FRAME);
    if (outAt < 0 && out > OUT_TO_SPEAK) outAt = t;
    if (hush > 0) {
      hush -= FRAME;
      if (hush <= 0) for (const line of INTRO) p.lines.length === 0 && p.up === 'none' ? put('story', '', line, LINE_SECONDS) : p.lines.push(line);
    }
    const step = stepOf({ week: week.week, phase: week.phase, open: week.shuttersOpen, chosen: week.chosen, visited: false, called: true, lamp: false, reply: false, quiet: false });
    const instruction = step !== '' && out > OUT_TO_SPEAK ? instructionLine(step, week.week, 12) : '';
    if (p.up !== 'none') {
      p.left -= FRAME;
      p.shownFor += FRAME;
    }
    const move = panelMove({ up: p.up, upStep: p.upStep, shownFor: p.shownFor, left: p.left, waiting: p.lines.length, holding: false, step, instruction, persist: true, told: false });
    if (move === 'story') put('story', '', p.lines.shift(), LINE_SECONDS);
    if (move === 'instruction') put('instruction', step, instruction, Infinity);
    if (move === 'clear') put('none', '', '', 0);
    shown.push({ t, text: p.up === 'none' ? '' : p.text });
    // The bell (BasketSystem): the morning's clock, held while lines wait, the hush runs, or the first week's line up is fresh.
    if (week.phase === 'morning') {
      week.timer += FRAME;
      const held = p.lines.length > 0 || hush > 0 || (p.up === 'story' && p.shownFor < MIN_SECONDS);
      if (bellRings(week.timer, week.week === 1, held)) bellAt = t;
    }
  }
  const when = (text) => {
    const from = shown.findIndex((f) => f.text === text);
    if (from < 0) return null;
    let to = from;
    while (to + 1 < shown.length && shown[to + 1].text === text) to += 1;
    return [shown[from].t, shown[to].t];
  };
  return { outAt, bellAt, shown, when };
}

test('the first minute: Tocco out in the closed room, the latch line, five quiet seconds, two opening lines, then the bell', (t) => {
  const latchAt = 5;
  const { outAt, bellAt, shown, when } = firstMinute(latchAt);
  // Out within 1.5 s of Enter VR, his door opening DOOR_AFTER in.
  assert.ok(outAt > DOOR_AFTER && outAt <= 1.5, `out at ${outAt.toFixed(2)} s`);
  const latch = when(instructionLine('latch', 1, 12));
  assert.ok(latch != null && latch[0] <= 2, `latch line at ${latch?.[0].toFixed(2)} s`);
  // Up until the frame the latch opens, gone that frame.
  assert.ok(latch[1] < latchAt && latch[1] > latchAt - 2 * FRAME, `latch line up to ${latch[1].toFixed(3)} s`);
  // Nothing written for the town's five seconds.
  for (const f of shown) if (f.t >= latchAt && f.t < latchAt + FIRST_HUSH_SECONDS - FRAME) assert.equal(f.text, '', `at ${f.t.toFixed(2)} s`);
  const [welcome, goal] = INTRO.map(when);
  assert.ok(Math.abs(welcome[0] - latchAt - FIRST_HUSH_SECONDS) < 2 * FRAME, `welcome at ${welcome[0].toFixed(2)} s`);
  assert.ok(goal[0] - welcome[0] >= MIN_SECONDS - 1e-9, `goal ${(goal[0] - welcome[0]).toFixed(2)} s after the welcome`);
  // The bell once both have been up at least 4 s: 13 s after the latch, near the plan's To+14.
  assert.ok(bellAt - goal[0] >= MIN_SECONDS - 1e-9, `bell ${(bellAt - goal[0]).toFixed(2)} s after the goal line`);
  assert.ok(bellAt - latchAt >= FIRST_MORNING_SECONDS - FRAME && bellAt - latchAt <= 14, `bell ${(bellAt - latchAt).toFixed(2)} s after the latch`);
  assert.equal(FIRST_MORNING_SECONDS, FIRST_HUSH_SECONDS + 2 * MIN_SECONDS);
  assert.ok(FIRST_MORNING_LIMIT >= FIRST_MORNING_SECONDS);
  t.diagnostic(`out ${outAt.toFixed(2)} s, latch line ${latch[0].toFixed(2)} to ${latch[1].toFixed(2)} s, welcome ${welcome[0].toFixed(2)} s, goal ${goal[0].toFixed(2)} s, bell ${bellAt.toFixed(2)} s`);
});

test('a slow Keeper gets the same order: the latch line waits as long as it takes, then the same morning', () => {
  const quick = firstMinute(2.5);
  const slow = firstMinute(30);
  for (const run of [quick, slow]) {
    const latch = run.when(instructionLine('latch', 1, 12));
    const [welcome, goal] = INTRO.map(run.when);
    assert.ok(latch[0] <= 2 && welcome[0] > latch[1] && goal[0] > welcome[0] && run.bellAt > goal[0]);
  }
  const at = (run, latchAt) => [run.when(INTRO[0])[0] - latchAt, run.when(INTRO[1])[0] - latchAt, run.bellAt - latchAt].map((x) => x.toFixed(2));
  assert.deepEqual(at(slow, 30), at(quick, 2.5));
});

test('Start at week 1 gives the week a fresh load starts with, so the first minute runs the same', () => {
  // restart.test.mjs holds RESTART_WEEK to the Week component's defaults; from it, the closed room of week 1.
  assert.equal(RESTART_WEEK.week, 1);
  assert.equal(RESTART_WEEK.phase, 'shut');
  assert.equal(RESTART_WEEK.shuttersOpen, false);
  assert.equal(outInClosedRoom(RESTART_WEEK.week, RESTART_WEEK.phase, RESTART_WEEK.shuttersOpen, false, DOOR_AFTER), true);
  // Not on the 2D page (no time in the headset), not in a later week's closed room, not once the shutters are open.
  assert.equal(outInClosedRoom(1, 'shut', false, false, 0), false);
  assert.equal(outInClosedRoom(2, 'shut', false, false, 5), false);
  assert.equal(outInClosedRoom(1, 'morning', true, false, 5), false);
  const fresh = firstMinute(5);
  const again = firstMinute(5, { ...RESTART_WEEK });
  assert.deepEqual(again.shown, fresh.shown);
  assert.equal(again.bellAt, fresh.bellAt);
});
