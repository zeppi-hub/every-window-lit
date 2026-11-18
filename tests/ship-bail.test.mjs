// Bailing as numbers (src/v2/ship-bail.ts): the storm ship's hold and the sinking bank. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as b from '../src/v2/ship-bail.ts';
import { DT, play } from './ship-bail-player.mjs';

const near = (a, x, by, what) => assert.ok(Math.abs(a - x) <= by, `${what}: ${a.toFixed(3)} is not within ${by} of ${x}`);

test('the bucket: held deeper it fills fuller, and a bucket snatched out early is a part bucket', () => {
  const r = b.SHIP;
  const water = b.surface(r, 0.5);
  assert.equal(b.submerged(r, water + r.bottom + 0.01, water), 0, 'clear of the water');
  near(b.submerged(r, water + r.rim, water), 1, 1e-9, 'the rim at the surface');
  near(b.submerged(r, water + (r.rim + r.bottom) / 2, water), 0.5, 1e-9, 'half way in');
  const hold = b.newHold(r.stages[0]);
  const bucket = { fill: 0, peak: 0 };
  const out = { out: 0, back: 0, speed: 0 };
  const before = hold.level;
  // Rim under for half the filling time.
  for (let t = 0; t < r.fillSeconds / 2; t += DT) b.stepBucket(r, bucket, hold, b.surface(r, hold.level), 0, DT, out);
  near(bucket.fill, 0.5, 0.06, 'half a bucket in half the time');
  near(before - hold.level, bucket.fill * r.capacity, 1e-9, 'what the bucket took is out of the hold');
});

test('the heave: full speed throws the lot, a weak swing slops most of it back, a slow lift throws nothing', () => {
  const r = b.SHIP;
  assert.equal(b.throwShare(r, r.weak), 0);
  assert.equal(b.throwShare(r, r.full + 1), 1);
  assert.equal(b.heaveSpeed(-3, -3), 0, 'plunging and drawing back are not a heave');
  near(b.heaveSpeed(3, 4), 5, 1e-9, 'up and ahead together');
  const up = r.brim + r.clear + 0.05;
  const out = { out: 0, back: 0, speed: 0 };
  // Full heave.
  let hold = b.newHold(r.stages[0]);
  let level = hold.level;
  let did = b.stepBucket(r, { fill: 1, peak: 0 }, hold, up, r.full, DT, out);
  assert.ok(did != null && did.out === 1 && did.back === 0);
  assert.equal(hold.level, level, 'nothing comes back');
  assert.equal(hold.thrown, 1);
  // A slow lift: nothing leaves the bucket.
  const carried = { fill: 1, peak: 0 };
  for (let k = 0; k < 30; k += 1) assert.equal(b.stepBucket(r, carried, hold, up, 0.4, DT, out), null);
  assert.equal(carried.fill, 1);
  // A weak swing: it throws when the swing ends, and most slops back.
  hold = b.newHold(r.stages[0]);
  level = hold.level;
  const weak = { fill: 1, peak: 0 };
  assert.equal(b.stepBucket(r, weak, hold, up, 1.1, DT, out), null, 'still swinging');
  did = b.stepBucket(r, weak, hold, up, 0.1, DT, out);
  assert.ok(did != null);
  near(did.out, (1.1 - r.weak) / (r.full - r.weak), 1e-9, 'the share that cleared the side');
  near(hold.level - level, did.back * r.capacity, 1e-9, 'the rest is back in the hold');
  // Inside the hatch a heave does nothing.
  assert.equal(b.stepBucket(r, { fill: 1, peak: 0 }, hold, r.brim, 3, DT, out), null);
});

test('the roll is part of it: heaved as the rail goes down a throw needs less, as it comes up more; and the water piles to the low side', () => {
  const r = b.SHIP;
  const speed = (r.weak + r.full) / 2;
  near(b.throwShare(r, speed), 0.5, 1e-9, 'on an even keel');
  assert.ok(b.throwShare(r, speed, 1) > 0.9, `with the roll: ${b.throwShare(r, speed, 1)}`);
  assert.ok(b.throwShare(r, speed, -1) < 0.25, `against it: ${b.throwShare(r, speed, -1)}`);
  // The same swing that only slops on the up-roll goes clean over on the down-roll.
  const up = r.brim + r.clear + 0.05;
  const out = { out: 0, back: 0, speed: 0 };
  const swing = r.full * 0.8;
  assert.ok(b.stepBucket(r, { fill: 1, peak: 0 }, b.newHold(r.stages[0]), up, swing, DT, out, 0, 1) != null, 'thrown at once with the roll');
  assert.equal(out.back, 0);
  assert.equal(b.stepBucket(r, { fill: 1, peak: 0 }, b.newHold(r.stages[0]), up, swing, DT, out, 0, 0), null, 'not yet on an even keel');
  // The water leans: high at the far edge when she rolls that way, low at the near one, level in the middle.
  const stage = r.stages[2];
  near(b.tideAt(stage, 1, 1), stage.slosh, 1e-9, 'far edge, rolled over');
  near(b.tideAt(stage, 1, -1), -stage.slosh, 1e-9, 'near edge');
  assert.equal(b.tideAt(stage, 1, 0), 0);
  assert.ok(r.stages[0].slosh < r.stages[1].slosh && r.stages[1].slosh < r.stages[2].slosh, 'more with every stage');
  // A bucket held where the water has drawn away comes up part full.
  const hold = b.newHold(stage);
  const hand = b.surface(r, hold.level) + r.rim;
  const low = { fill: 0, peak: 0 };
  for (let t = 0; t < 1; t += DT) b.stepBucket(r, low, hold, hand, 0, DT, out, -0.06, 0);
  assert.ok(low.fill > 0.5 && low.fill < 0.7, `part full in the trough: ${low.fill.toFixed(2)}`);
});

test('left alone, every stage is lost, and each sooner than the one before', () => {
  for (const rules of [b.SHIP, b.BANK]) {
    const times = rules.stages.map((s) => b.timeToLine(s));
    assert.ok(times.every((t) => Number.isFinite(t)), `all lost: ${times}`);
    assert.ok(times[0] > times[1] * 1.3 && times[1] > times[2] * 1.15, `clearly sooner each time: ${times.map((t) => t.toFixed(1))}`);
    assert.ok(times[2] >= 5, `the last still leaves time to act: ${times[2].toFixed(1)}`);
  }
  near(b.timeToLine(b.SHIP.stages[0]), 15, 2, 'the squall');
  assert.equal(b.timeToLine(b.SHIP.rehearsal), Infinity, 'the rehearsal cannot be lost');
});

test('a steady hand wins every stage, with more buckets each time', () => {
  const runs = b.SHIP.stages.map((s) => play(b.SHIP, s));
  for (const [n, run] of runs.entries()) assert.equal(run.result, 'won', `stage ${n + 1}: ${run.result} at ${run.t.toFixed(1)} s with ${run.buckets}`);
  assert.ok(runs[0].buckets >= 4 && runs[0].buckets <= 9, `the squall: ${runs[0].buckets} buckets`);
  assert.ok(runs[1].buckets > runs[0].buckets && runs[2].buckets > runs[1].buckets, `more each time: ${runs.map((r) => r.buckets)}`);
  assert.ok(runs[2].t <= 90, `the last within ${runs[2].t.toFixed(1)} s`);
  // A quicker hand is clearly rewarded.
  const quick = play(b.SHIP, b.SHIP.stages[2], { cycle: 2.0 });
  assert.ok(quick.result === 'won' && quick.t < runs[2].t * 0.6, `quick ${quick.t.toFixed(1)} s against ${runs[2].t.toFixed(1)} s`);
});

test('the cover is a real choice: never shut, the squall is still won, the sprung plank and the green water are not', () => {
  assert.equal(play(b.SHIP, b.SHIP.stages[0], { lidAt: null }).result, 'won');
  assert.equal(play(b.SHIP, b.SHIP.stages[1], { lidAt: null, holdWaves: false }).result, 'lost');
  assert.equal(play(b.SHIP, b.SHIP.stages[2], { lidAt: null, holdWaves: false }).result, 'lost');
});

test('a wave on a held cover puts little in; on a loose one it puts a lot in and knocks it wide open', () => {
  const stage = b.SHIP.stages[2];
  const step = { coming: false, hit: 0, lost: false, won: false };
  const held = b.newHold(stage);
  held.waveIn = DT / 2;
  b.stepHold(held, stage, DT, 1, true, step);
  near(step.hit, stage.waveShut, 1e-9, 'held shut');
  assert.equal(held.lid, 0);
  const loose = b.newHold(stage);
  loose.lid = 1;
  loose.waveIn = DT / 2;
  b.stepHold(loose, stage, DT, 1, false, step);
  near(step.hit, stage.waveOpen, 1e-9, 'wide open');
  assert.equal(loose.lid, 1);
  // Seen coming once, 2.6 s before.
  const hold = b.newHold(stage);
  let seen = 0;
  for (let t = 0; t < stage.waveEvery - 0.1; t += DT) if (b.stepHold(hold, stage, DT, 1, true, step).coming) seen += 1;
  assert.equal(seen, 1);
});

test('half buckets cost: stopping 12 cm short takes about twice the buckets', () => {
  const full = play(b.SHIP, b.SHIP.stages[0]);
  const half = play(b.SHIP, b.SHIP.stages[0], { short: 0.12 });
  assert.equal(half.result, 'won');
  near(half.hold.thrown / (half.t / 2.4), 0.47, 0.08, 'about half a bucket a time');
  assert.ok(half.t >= full.t * 1.8, `full ${full.t.toFixed(1)} s, half ${half.t.toFixed(1)} s`);
});

test('mercy: a slow hand that loses the green water wins it once it has eased', () => {
  const slow = { cycle: 4.5 };
  assert.equal(play(b.SHIP, b.SHIP.stages[2], slow).result, 'lost');
  assert.equal(b.ease(b.SHIP, 2), 1);
  assert.equal(b.ease(b.SHIP, 3), 0.7);
  assert.equal(b.ease(b.SHIP, 6), 0.5);
  assert.equal(play(b.SHIP, b.SHIP.stages[2], { ...slow, losses: 6 }).result, 'won');
});

test('nobody bails for ever: a stage that has gone on long slackens, and a hand that only just kept up gets through', () => {
  assert.equal(b.slack(b.SHIP, 10), 1);
  assert.equal(b.slack(b.SHIP, b.SHIP.slackAfter), 1);
  near(b.slack(b.SHIP, b.SHIP.slackAfter * 1.5), 0.7, 1e-9, 'half way down');
  assert.equal(b.slack(b.SHIP, 500), b.SHIP.slackTo);
  const run = play(b.SHIP, b.SHIP.stages[0], { cycle: 6, limit: 300 });
  assert.equal(run.result, 'won');
  assert.ok(run.t > b.SHIP.slackAfter, `only after it slackened: ${run.t.toFixed(1)} s`);
});

test('the rehearsal: not lost however long it takes, won by one good bucket over the side and the cover shut', () => {
  const stage = b.SHIP.rehearsal;
  const hold = b.newHold(stage);
  const step = { coming: false, hit: 0, lost: false, won: false };
  assert.ok(hold.lid > 0.5, 'the cover starts open');
  for (let t = 0; t < 120; t += DT) b.stepHold(hold, stage, DT, 1, false, step);
  assert.ok(!step.lost && !step.won && hold.level <= stage.rehearsal.cap);
  hold.thrown = 1.6;
  assert.ok(!b.stepHold(hold, stage, DT, 1, false, step).won, 'the cover is still open');
  b.shoveLid(hold, 0);
  assert.ok(b.stepHold(hold, stage, DT, 1, false, step).won);
});

test('the desktop hand (never lower than half a metre under the eye) can still win every stage', () => {
  for (const [n, stage] of b.SHIP.stages.entries()) {
    const run = play(b.SHIP, stage, { deepest: -0.5 });
    assert.equal(run.result, 'won', `stage ${n + 1}: ${run.result} at ${run.t.toFixed(1)} s`);
  }
});

test('the bank: the same game with no cover; a brisk hand wins each round, and each takes more buckets', () => {
  const runs = b.BANK.stages.map((s) => play(b.BANK, s, { cycle: 1.6 }));
  for (const [n, run] of runs.entries()) assert.equal(run.result, 'won', `round ${n + 1}: ${run.result} at ${run.t.toFixed(1)} s with ${run.buckets}`);
  assert.ok(runs[1].buckets > runs[0].buckets && runs[2].buckets > runs[1].buckets, `more each time: ${runs.map((r) => r.buckets)}`);
  assert.ok(runs[2].t < 45, `the last round is over in ${runs[2].t.toFixed(0)} s`);
  assert.equal(b.newHold(b.BANK.stages[0]).lid, 0);
});

test('the bank can be lost: an unhurried hand loses the last round, a slow one the last two, and both win once it is eased', () => {
  assert.equal(play(b.BANK, b.BANK.stages[0], { cycle: 2.4 }).result, 'won', 'the first round forgives an unhurried hand');
  assert.equal(play(b.BANK, b.BANK.stages[2], { cycle: 2.4 }).result, 'lost', 'the last does not');
  assert.equal(play(b.BANK, b.BANK.stages[2], { cycle: 2.4, losses: b.BANK.mercyAfter }).result, 'won', 'eased once, it does');
  for (const n of [1, 2]) {
    assert.equal(play(b.BANK, b.BANK.stages[n], { cycle: 3.2 }).result, 'lost', `a slow hand loses round ${n + 1}`);
    assert.equal(play(b.BANK, b.BANK.stages[n], { cycle: 3.2, losses: b.BANK.mercyAfter * 2 }).result, 'won', `and wins it eased twice`);
  }
  // The water starts well up the mark, and nearer the line each round.
  assert.ok(b.BANK.stages[0].start >= 0.6 && b.BANK.stages[2].start > b.BANK.stages[0].start);
});


test('a breathing space: for the first seconds of a stage nothing comes in, the cover does not creep and no wave counts down', () => {
  const stage = b.SHIP.stages[2];
  const hold = b.newHold(stage);
  const step = { coming: false, hit: 0, lost: false, won: false };
  for (let t = 0; t < b.SHIP.grace - 0.05; t += DT) b.stepHold(hold, stage, DT, 1, false, step, b.SHIP.grace);
  assert.equal(hold.level, stage.start);
  assert.equal(hold.lid, 0);
  assert.equal(hold.waveIn, stage.waveEvery);
  for (let t = 0; t < 1; t += DT) b.stepHold(hold, stage, DT, 1, false, step, b.SHIP.grace);
  assert.ok(hold.level > stage.start && hold.lid > 0 && hold.waveIn < stage.waveEvery, 'then it all begins');
  assert.ok(b.SHIP.grace >= 1.5);
});
