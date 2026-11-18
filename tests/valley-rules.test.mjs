// The valley memory's rules as numbers (src/v2/valley-rules.ts): the stake and its driver, the line, the ring, the herd. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from '../src/v2/valley-rules.ts';

const near = (a, b, by, what) => assert.ok(Math.abs(a - b) <= by, `${what}: ${a.toFixed(3)} is not within ${by} of ${b}`);

/** Lift the driver to `top` and bring it down in `seconds`, at 90 steps a second; returns what the blow sank. */
function slam(driver, top, seconds, ground = 1) {
  const dt = 1 / 90;
  let sunk = 0;
  for (let h = 0.01; h < top; h += 0.02) sunk += v.stepDriver(driver, h, true, dt, ground);
  sunk += v.stepDriver(driver, top, true, dt, ground);
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let k = 1; k <= steps; k += 1) sunk += v.stepDriver(driver, top * (1 - k / steps), true, dt, ground);
  return sunk;
}

test('driver: a full slam is a full blow, half the lift is half of it, and three full blows make a stake firm', () => {
  const driver = v.newDriver();
  const full = slam(driver, v.DRIVE.fullDrop, 0.12);
  near(full, v.DRIVE.fullBlow, 0.012, 'a full blow');
  const half = slam(driver, v.DRIVE.fullDrop / 2, 0.06);
  near(half, v.DRIVE.fullBlow / 2, 0.012, 'half a blow');
  assert.ok(3 * v.DRIVE.fullBlow >= v.DRIVE.depth, 'three full blows');
  assert.ok(2 * v.DRIVE.fullBlow < v.DRIVE.depth, 'never two');
  assert.equal(v.blow(v.DRIVE.fullDrop * 0.25, 0.05), 0, 'a feeble blow bounces');
  assert.ok(v.blow(v.DRIVE.fullDrop * 0.4, 0.05) > 0);
});

test('driver: set down slowly, tapped, or let go of, it drives nothing', () => {
  const driver = v.newDriver();
  assert.equal(slam(driver, v.DRIVE.fullDrop, 1.2), 0, 'lowered over more than a second');
  assert.equal(slam(driver, 0.03, 0.02), 0, 'a tap');
  for (let h = 0.01; h < 0.3; h += 0.02) v.stepDriver(driver, h, true, 1 / 90);
  assert.equal(v.stepDriver(driver, 0, false, 1 / 90), 0, 'let go of at the top');
  assert.equal(v.stepDriver(driver, 0, true, 1 / 90), 0, 'and nothing is left of the lift');
});

test('driver: a pause half way down, then a fresh lift, counts from the fresh lift', () => {
  const driver = v.newDriver();
  const dt = 1 / 90;
  for (let h = 0.01; h <= 0.3; h += 0.02) v.stepDriver(driver, h, true, dt);
  for (let k = 0; k < 90; k += 1) v.stepDriver(driver, 0.1, true, dt); // lowered and held a second
  for (let k = 0; k < 9; k += 1) v.stepDriver(driver, 0.1 + 0.015 * k, true, dt); // lifted again to 0.22
  let sunk = 0;
  for (let k = 1; k <= 9; k += 1) sunk += v.stepDriver(driver, 0.22 * (1 - k / 9), true, dt);
  near(sunk, v.blow(0.22, 0.1), 0.02, 'the second lift');
  assert.ok(sunk > 0.06);
});

test('driver: the ground gets harder: three, four and five full blows', () => {
  const needed = v.STAGES.map((stage) => {
    const driver = v.newDriver();
    let depth = 0;
    let blows = 0;
    while (depth < v.DRIVE.depth - 1e-9 && blows < 12) {
      depth += slam(driver, 0.3, 0.12, stage.ground);
      blows += 1;
    }
    return blows;
  });
  assert.deepEqual(needed, [3, 4, 5]);
});

test('line: slack sags, and a span holds only when its lowest rag is clear of the snow', () => {
  assert.equal(v.sag(7, 0), 0);
  assert.ok(v.sag(7, 0.8) > v.LINE.height, 'paid out, it lies on the snow');
  near(v.lineHeight(7, 0.8, 0.5), 0.02, 1e-9, 'never under the snow');
  const allowed = v.slackAllowed(7.35);
  assert.ok(allowed > 0.03 && allowed < 0.1, `a few centimetres: ${allowed}`);
  assert.ok(v.holds(7.35, allowed));
  assert.ok(!v.holds(7.35, allowed + 0.02));
  near(v.LINE.height - v.sag(7.35, allowed), v.LINE.clear, 1e-6, 'at the limit the middle is at the clear height');
});

test('haul: pulled hand over hand it goes taut and the knot bites', () => {
  const haul = v.newHaul(7.35, 0.7);
  let state = 'hauling';
  let pulls = 0;
  while (state === 'hauling' && pulls < 10) {
    for (let k = 0; k < 20 && state === 'hauling'; k += 1) state = v.stepHaul(haul, 0.35 / 20, true, 1 / 60);
    pulls += 1;
  }
  assert.equal(state, 'taut');
  assert.equal(pulls, 2, 'two arm-lengths for the first stage');
  assert.ok(haul.tied);
});

test('haul: let go of, the line slides back, and the knot bites on a slack span; in the rehearsal it waits', () => {
  const haul = v.newHaul(7.35, 0.7);
  v.stepHaul(haul, 0.4, true, 1 / 60);
  near(haul.slack, 0.3, 1e-9, 'one pull');
  let state = 'hauling';
  for (let k = 0; k < 48; k += 1) state = v.stepHaul(haul, 0, false, 1 / 60);
  assert.equal(state, 'hauling', 'let go for most of a second: not yet tied');
  assert.ok(haul.slack > 0.55, `slid back: ${haul.slack}`);
  for (let k = 0; k < 12; k += 1) state = v.stepHaul(haul, 0, false, 1 / 60);
  assert.equal(state, 'left slack');
  assert.ok(haul.slack <= haul.from);
  const patient = v.newHaul(7.35, 0.7);
  let p = v.stepHaul(patient, 0.2, true, 1 / 60, true);
  for (let k = 0; k < 600; k += 1) p = v.stepHaul(patient, 0, false, 1 / 60, true);
  assert.equal(p, 'hauling', 'the rehearsal never ties a slack line');
  const untouched = v.newHaul(7.35, 0.7);
  let u = 'hauling';
  for (let k = 0; k < 600; k += 1) u = v.stepHaul(untouched, 0, false, 1 / 60);
  assert.equal(u, 'hauling', 'a line no hand has taken yet is not tied');
  assert.equal(untouched.slack, 0.7);
  // A hand resting on it (the driver's handle was just there) and then taken away starts nothing either.
  for (let k = 0; k < 30; k += 1) v.stepHaul(untouched, 0, true, 1 / 60);
  for (let k = 0; k < 600; k += 1) u = v.stepHaul(untouched, 0, false, 1 / 60);
  assert.equal(u, 'hauling');
});

test('wind: a gust takes line back from a line nobody holds, half from one hand, none from two, and never from a tied span', () => {
  const haul = v.newHaul(6.1, 0.8);
  v.stepHaul(haul, 0.5, true, 1 / 60);
  near(haul.slack, 0.3, 1e-9, 'hauled');
  assert.equal(v.gustHaul(haul, 2, 0.2), 0);
  near(v.gustHaul(haul, 1, 0.2), 0.1, 1e-9, 'one hand');
  near(v.gustHaul(haul, 0, 0.2), 0.2, 1e-9, 'no hand');
  near(haul.slack, 0.6, 1e-9, 'the slack is back');
  near(v.gustHaul(haul, 0, 5), 0.2, 1e-9, 'never more than it was paid out with');
  const tied = v.newHaul(6.1, 0.8);
  v.stepHaul(tied, 0.8, true, 1 / 60);
  assert.ok(tied.tied);
  assert.equal(v.gustHaul(tied, 0, 0.2), 0);
  assert.equal(v.STAGES[0].gust, 0, 'no wind in the first stage');
  assert.ok(v.STAGES[2].gust > v.STAGES[1].gust);
});

test('ring: inside and outside, and a walk across a span', () => {
  const square = v.STAGES[0].holes;
  assert.ok(v.inside(square, { x: 0, z: 0 }));
  assert.ok(!v.inside(square, { x: 6, z: 0 }));
  assert.ok(v.crosses({ x: 0, z: 0 }, { x: 6, z: 0 }, square[3], square[0]), 'east side');
  assert.ok(!v.crosses({ x: 0, z: 0 }, { x: 2, z: 0 }, square[3], square[0]));
});

/** Stake `order`, every span hauled to `slack`, closing the ring; returns the ring, or the hole the coil could not reach. */
function build(stage, order, slack = 0.03) {
  const ring = v.newRing();
  for (const hole of [...order, order[0]]) {
    assert.ok(v.choices(stage, ring).includes(hole), `hole ${hole} can be picked`);
    const line = v.payOut(stage, ring, hole);
    if (line == null) return { ring, short: hole };
    if (ring.order.length > 0) ring.slacks.push(Math.min(slack, line.slack));
    if (hole === order[0] && ring.order.length > 0) ring.closed = true;
    else ring.order.push(hole);
  }
  return { ring, short: -1 };
}

test('every stage: its answer closes in rope and holds, with all of the core herd inside', () => {
  for (const stage of v.STAGES) {
    const { ring, short } = build(stage, stage.answer);
    assert.equal(short, -1, `${stage.name}: the coil reaches`);
    assert.ok(ring.closed);
    assert.deepEqual(v.judge(stage, ring), { kind: 'held' }, stage.name);
    assert.ok(v.ropeUsed(stage, ring) <= stage.rope);
    assert.deepEqual(v.choices(stage, ring), [], 'nothing more to pick');
  }
});

test('ring: the first stake can be picked again only once three stand, and the hint follows the answer', () => {
  const stage = v.STAGES[0];
  const ring = v.newRing();
  assert.equal(v.hintFor(stage, ring), 0);
  ring.order.push(0, 1);
  ring.slacks.push(0.03);
  assert.ok(!v.choices(stage, ring).includes(0));
  assert.equal(v.hintFor(stage, ring), 2);
  ring.order.push(2);
  ring.slacks.push(0.03);
  assert.ok(v.choices(stage, ring).includes(0));
  ring.order.push(3);
  ring.slacks.push(0.03);
  assert.equal(v.hintFor(stage, ring), 0, 'back to the first to close');
});

test('one slack span loses the ring, and the judge says which', () => {
  const stage = v.STAGES[0];
  const { ring } = build(stage, stage.answer);
  ring.slacks[2] = 0.4;
  assert.deepEqual(v.judge(stage, ring), { kind: 'slack', span: 2 });
});

test('two herds, one coil: the wide ring runs out of rope, the tight one leaves the calf out', () => {
  const stage = v.STAGES[1];
  const wide = build(stage, [1, 2, 3, 4, 5, 6, 7]);
  assert.notEqual(wide.short, -1, 'the coil ends before the ring closes');
  assert.ok(!wide.ring.closed);
  const oneBull = build(stage, [0, 1, 2, 3, 4, 5]);
  assert.notEqual(oneBull.short, -1, 'not even one far corner');
  const tight = build(stage, [1, 2, 3, 4]);
  assert.equal(tight.short, -1);
  assert.deepEqual(v.judge(stage, tight.ring), { kind: 'left out', beast: 3 }, 'the calf');
  // Sloppy hauling costs rope too: every span left with all its slack still closes here, but each fails.
  const sloppy = build(stage, stage.answer, 9);
  assert.equal(sloppy.short, -1);
  assert.equal(v.judge(stage, sloppy.ring).kind, 'slack');
  assert.ok(v.ropeUsed(stage, sloppy.ring) > v.ropeUsed(stage, build(stage, stage.answer).ring) + 3);
});

test('the herd on the move: it walks out east in under a minute, a line that holds turns it, a line that sags does not', () => {
  const stage = v.STAGES[2];
  const out = v.timeToStray(stage);
  assert.ok(out > 22 && out < 60, `strays at ${out.toFixed(1)} s`);
  assert.ok(out < stage.dusk, 'before the wolves');
  const east = { a: stage.holes[4], b: stage.holes[0], holds: true };
  const herd = v.newHerd(stage);
  let turnedAt = -1;
  for (let t = 0; t < 200 && turnedAt < 0; t += 0.1) {
    const r = v.stepHerd(herd, stage, [east], 0.1);
    assert.equal(r.strayed, -1);
    if (r.turned) turnedAt = t;
  }
  assert.ok(turnedAt > 2 && turnedAt < out, `turned at ${turnedAt.toFixed(1)} s`);
  assert.equal(herd.way, -1);
  const loose = v.newHerd(stage);
  let strayed = -1;
  for (let t = 0; t < 200 && strayed < 0; t += 0.1) strayed = v.stepHerd(loose, stage, [{ ...east, holds: false }], 0.1).strayed;
  assert.ok(strayed >= 0, 'over the sagging line');
  assert.equal(v.stepHerd(v.newHerd(v.STAGES[0]), v.STAGES[0], [], 1).strayed, -1, 'the first herd stands still');
});

test('eased: after three losses there is less to haul, softer ground, a later dusk and a slower herd', () => {
  for (const stage of v.STAGES) {
    const e = v.eased(stage);
    assert.ok(e.slack < stage.slack && e.dusk > stage.dusk && e.ground <= stage.ground && e.drift <= stage.drift && e.gust === 0);
    assert.equal(v.judge(e, build(e, e.answer).ring).kind, 'held');
  }
  assert.ok(v.timeToStray(v.eased(v.STAGES[2])) > v.timeToStray(v.STAGES[2]) + 20);
});

test('wolves: on the ridge at the start, at the line at dusk', () => {
  const stage = v.STAGES[0];
  assert.equal(v.wolvesDown(stage, 0), 0);
  near(v.wolvesDown(stage, stage.dusk / 2), 0.5, 1e-9, 'half way');
  assert.equal(v.wolvesDown(stage, stage.dusk + 5), 1);
});
