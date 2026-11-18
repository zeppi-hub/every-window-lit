// The Firewall word's two games as numbers (src/v2/fire-line.ts): the forest's firebreak and the city's walls. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as f from '../src/v2/fire-line.ts';

const DT = 1 / 60;

/** Play a forest stage with hands that take `strokeSeconds` a spadeful of `strength`, `shuffle` between pieces and `sack` seconds to smother an ember. */
function playForest(stage, strokeSeconds, strength = 1, shuffle = f.HANDS.shuffle, sack = f.HANDS.sack) {
  const run = f.startForest(stage);
  let busy = strokeSeconds;
  let sackIn = -1;
  while (run.result === 'playing') {
    f.stepForest(run, DT);
    if (run.ember != null) {
      if (run.ember.flying <= 0) {
        if (sackIn < 0) sackIn = sack;
        sackIn -= DT;
        if (sackIn <= 0) {
          f.smother(run);
          sackIn = -1;
          busy = strokeSeconds;
        }
      }
      continue;
    }
    busy -= DT;
    if (busy <= 0 && f.canDig(run)) {
      const got = f.dig(run, strength);
      busy = strokeSeconds + (got === 'piece' ? shuffle : 0);
    }
  }
  return run;
}

test('forest: every piece takes its digging, weak spadefuls count for less, and the last piece finishes the line', () => {
  const stage = f.FOREST.stages[0];
  const run = f.startForest(stage);
  const got = [];
  for (let i = 0; i < stage.pieces * stage.effort; i += 1) got.push(f.stroke(run));
  assert.deepEqual(got, ['bit', 'piece', 'bit', 'piece', 'bit', 'line done']);
  assert.equal(f.stroke(run), 'nothing', 'nothing left to dig');
  const weak = f.startForest(stage);
  let spadefuls = 0;
  while (weak.dug < 1) {
    f.dig(weak, f.SPADE.weakest);
    spadefuls += 1;
  }
  assert.ok(spadefuls >= 2 * stage.effort, `a piece of weak pushes takes twice as many: ${spadefuls}`);
});

test('forest: each stage starts further off, comes faster, asks harder digging, and leaves steady hands less to spare', () => {
  const [a, b, c] = f.FOREST.stages;
  assert.ok(a.speed < b.speed && b.speed < c.speed, 'the front comes faster each time');
  assert.ok(a.from < b.from && b.from < c.from);
  assert.ok(a.effort < b.effort && b.effort <= c.effort, 'the ground is harder');
  assert.ok(a.gusts.length < b.gusts.length && b.gusts.length < c.gusts.length, 'more gusts');
  assert.ok(a.sparksAfter.length < b.sparksAfter.length && b.sparksAfter.length < c.sparksAfter.length, 'more embers');
  assert.ok(b.fuse > c.fuse, 'and they catch sooner');
  const spare = f.FOREST.stages.map((s) => f.arrival(s) / f.handsNeed(s));
  assert.ok(spare[0] > spare[1] && spare[1] > spare[2], `less to spare each stage: ${spare.map((v) => v.toFixed(2))}`);
  assert.ok(spare[0] <= 1.8, `the first stage is no walk: ${spare[0].toFixed(2)}`);
  assert.ok(spare[1] >= 1.08 && spare[1] <= 1.2, `the second is tight: ${spare[1].toFixed(2)}`);
  assert.ok(spare[2] >= 1.04 && spare[2] <= 1.12, `the last can be done, just: ${spare[2].toFixed(2)}`);
});

test('forest: steady full spadefuls hold every stage; slower hands or weaker spadefuls lose the later ones', () => {
  for (const stage of f.FOREST.stages) assert.equal(playForest(stage, f.HANDS.stroke).result, 'held', stage.name);
  assert.equal(playForest(f.FOREST.stages[0], 2.0).result, 'held', 'the first stage forgives slow hands');
  assert.equal(playForest(f.FOREST.stages[1], 1.6).result, 'crossed', 'the second does not');
  assert.equal(playForest(f.FOREST.stages[2], 1.45).result, 'crossed', 'the third forgives least');
  assert.equal(playForest(f.FOREST.stages[1], f.HANDS.stroke, 0.7).result, 'crossed', 'nor does it forgive half-hearted digging');
});

test('forest: a gust throws the front nearer than its own speed would bring it', () => {
  const stage = f.FOREST.stages[1];
  const gust = stage.gusts[0];
  const run = f.startForest(stage);
  for (let t = 0; t < gust.at; t += DT) f.stepForest(run, DT);
  assert.equal(f.gusting(run), true);
  const before = run.distance;
  for (let t = 0; t < f.FOREST.gustSeconds; t += DT) f.stepForest(run, DT);
  const went = before - run.distance;
  assert.ok(Math.abs(went - (stage.speed * f.FOREST.gustSeconds + gust.leap)) < 0.3, `it came ${went.toFixed(2)} m in the gust`);
  assert.equal(f.gusting(run), false);
  assert.ok(f.arrival(stage) < stage.from / stage.speed - 3, 'and the fire arrives sooner for it');
});

test('forest: the spade does nothing while an ember is down, and an ember left alone catches', () => {
  const stage = f.FOREST.stages[1];
  const run = f.startForest(stage);
  for (let i = 0; i < stage.effort - 1; i += 1) f.stroke(run);
  assert.equal(f.stroke(run), 'piece');
  assert.ok(run.ember != null, 'an ember after the first piece');
  assert.equal(f.canDig(run), false);
  assert.equal(f.stroke(run), 'nothing');
  assert.equal(f.smother(run), false, 'not while it is still in the air');
  for (let t = 0; t < f.FOREST.sparkFlight + 0.1; t += DT) f.stepForest(run, DT);
  assert.equal(f.smother(run), true);
  assert.equal(f.canDig(run), true);
  // The next ember is left to burn.
  for (let i = 0; i < stage.effort * 2; i += 1) f.stroke(run);
  assert.ok(run.ember != null, 'the second ember after the third piece');
  while (run.result === 'playing') f.stepForest(run, DT);
  assert.equal(run.result, 'caught');
  assert.ok(run.time < f.arrival(stage), 'it catches before the front arrives');
});

test('forest: a line done early brings the front in quickly, so it is seen to die', () => {
  const stage = f.FOREST.stages[0];
  const run = f.startForest(stage);
  for (let i = 0; i < stage.pieces * stage.effort; i += 1) f.stroke(run);
  let t = 0;
  while (run.result === 'playing') {
    f.stepForest(run, DT);
    t += DT;
  }
  assert.equal(run.result, 'held');
  assert.ok(t <= f.FOREST.rushSeconds + 0.1 && t >= 2, `the wait is short: ${t.toFixed(2)} s`);
});

test('forest: after three losses the front slows and embers last longer; before that nothing changes', () => {
  const stage = f.FOREST.stages[2];
  assert.equal(f.eased(stage, 2), stage);
  const easy = f.eased(stage, 3);
  assert.ok(f.arrival(easy) > f.arrival(stage) * 1.25);
  assert.equal(easy.fuse, stage.fuse + f.FOREST.mercyFuse);
  assert.equal(playForest(easy, 1.45).result, 'held', 'hands that lost it now hold it');
  assert.equal(f.eased(f.FOREST.stages[0], 5).fuse, 0, 'a stage without embers stays without');
});

test('forest: nearness runs from far to at the line', () => {
  const run = f.startForest(f.FOREST.stages[0]);
  run.distance = 60;
  assert.equal(f.nearness(run), 0);
  run.distance = 0;
  assert.equal(f.nearness(run), 1);
});

/** Move the spade's tip from `from` to `to` (m over the ground) in `seconds`; the events of the way. */
function moveSpade(spade, from, to, seconds) {
  const events = [];
  const steps = Math.max(1, Math.round(seconds / DT));
  for (let i = 1; i <= steps; i += 1) {
    const e = f.stepSpade(spade, from + ((to - from) * i) / steps, DT);
    if (e.kind !== 'nothing') events.push(e);
  }
  return events;
}

test('spade: driven into the earth it bites, lifted clear it throws; a hard plunge takes a full spadeful, a slow push a weak one', () => {
  const hard = f.newSpade();
  assert.deepEqual(moveSpade(hard, 0.3, -0.12, 0.25).map((e) => e.kind), ['bite']);
  assert.equal(hard.loaded, 1, 'a fast plunge is a full spadeful');
  assert.deepEqual(moveSpade(hard, -0.12, 0.02, 0.3), [], 'not thrown until it is lifted clear');
  const toss = moveSpade(hard, 0.02, 0.3, 0.2);
  assert.equal(toss.length, 1);
  assert.equal(toss[0].kind, 'toss');
  assert.equal(toss[0].strength, 1);
  assert.equal(hard.loaded, 0);
  const slow = f.newSpade();
  moveSpade(slow, 0.3, -0.12, 2.5);
  assert.equal(slow.loaded, f.SPADE.weakest, 'a slow push scratches the ground');
  const middling = f.newSpade();
  moveSpade(middling, 0.3, -0.12, 1.0);
  assert.ok(middling.loaded > f.SPADE.weakest && middling.loaded < 1, `in between: ${middling.loaded.toFixed(2)}`);
});

test('spade: it cannot bite twice without throwing, and resting in the air does nothing', () => {
  const spade = f.newSpade();
  assert.deepEqual(moveSpade(spade, 0.25, 0.25, 1), []);
  moveSpade(spade, 0.25, -0.15, 0.2);
  assert.deepEqual(moveSpade(spade, -0.15, -0.05, 0.2), [], 'still in the earth');
  assert.deepEqual(moveSpade(spade, -0.05, -0.2, 0.2), [], 'pushed down again: nothing more is taken');
  assert.equal(moveSpade(spade, -0.2, 0.3, 0.3).length, 1);
});

/** Play a wall with a hand that starts pulling `after` seconds in and takes `each` seconds a pull. */
function playWall(stage, after, each, losses = 0) {
  const run = f.startWall(stage, losses);
  let time = 0;
  let next = after + each;
  while (run.result === 'playing' && time < 120) {
    f.stepWall(run, DT);
    time += DT;
    if (time >= next) {
      f.pull(run);
      next += each;
    }
  }
  return { run, time };
}

test('walls: the rehearsal waits for its wall, then the fire runs and dies against it', () => {
  const stage = f.WALLS.stages[0];
  const run = f.startWall(stage);
  for (let t = 0; t < 30; t += DT) f.stepWall(run, DT);
  assert.equal(run.t, 0, 'held back for as long as it takes');
  assert.equal(run.result, 'playing');
  assert.equal(f.pull(run), 1);
  while (run.result === 'playing') f.stepWall(run, DT);
  assert.equal(run.result, 'cut');
});

test('walls: a wall is as high as its pulls; the fire passes one that is not whole', () => {
  const stage = f.WALLS.stages[2];
  const run = f.startWall(stage);
  assert.equal(f.wallUp(run), 0);
  f.pull(run);
  assert.ok(Math.abs(f.wallUp(run) - 1 / stage.pulls) < 1e-9);
  f.pull(run);
  while (run.result === 'playing') f.stepWall(run, DT);
  assert.equal(run.result, 'passed', 'a wall part built does not stop it');
  assert.equal(f.pull(run), 2 / stage.pulls, 'and it is too late to pull once it has passed');
});

test('walls: each asks for more pulls and leaves a steady hand less to spare; a slow hand loses the last', () => {
  const [a, b, c] = f.WALLS.stages;
  assert.equal(a.held, true);
  assert.ok(a.pulls < b.pulls && b.pulls < c.pulls);
  const need = (s) => f.PULLS.react + s.pulls * f.PULLS.each;
  const spare = [b, c].map((s) => s.seconds / need(s));
  assert.ok(spare[0] > spare[1], `less to spare: ${spare.map((v) => v.toFixed(2))}`);
  assert.ok(spare[1] >= 1.1 && spare[1] <= 1.35, `the last can be done, not idly: ${spare[1].toFixed(2)}`);
  for (const stage of [b, c]) assert.equal(playWall(stage, f.PULLS.react, f.PULLS.each).run.result, 'cut', stage.name);
  assert.equal(playWall(c, f.PULLS.react, 1.0).run.result, 'passed', 'a slow hand is too late at the last wall');
  assert.equal(playWall(c, 2.8, f.PULLS.each).run.result, 'passed', 'and so is one that hesitates');
});

test('walls: after three losses the fire is slower, and the hand that lost now holds', () => {
  const stage = f.WALLS.stages[2];
  assert.equal(f.startWall(stage, 2).seconds, stage.seconds);
  assert.ok(f.startWall(stage, 3).seconds > stage.seconds * 1.3);
  assert.ok(f.WALLS.grace >= 1.6, 'and no fire leaves before the hand has had time to find the stake');
  assert.equal(playWall(stage, f.PULLS.react, 1.0, 3).run.result, 'cut');
});

test('pump: every rise of the hand counts once, however far it then goes, and it must come down before it counts again', () => {
  const pump = f.newPump(1);
  const got = [];
  for (const h of [1.0, 1.05, 1.1, 1.16, 1.3, 1.4, 1.38, 1.3, 1.22, 1.0, 0.9, 0.95, 1.06, 1.2]) got.push(f.stepPump(pump, h, 0.15));
  assert.deepEqual(got.filter((e) => e !== 'nothing'), ['up', 'down', 'up']);
  const still = f.newPump(1);
  for (let i = 0; i < 100; i += 1) assert.equal(f.stepPump(still, 1 + 0.05 * Math.sin(i), 0.15), 'nothing', 'a trembling hand pulls nothing');
});

test('spade: a plunge straight after a throw takes little; one that waits for the earth to land takes its full spadeful', () => {
  const hasty = f.newSpade();
  moveSpade(hasty, 0.3, -0.12, 0.2);
  moveSpade(hasty, -0.12, 0.3, 0.15);
  moveSpade(hasty, 0.3, -0.12, 0.15);
  assert.ok(hasty.loaded <= 0.7, `at once again: ${hasty.loaded.toFixed(2)}`);
  const steady = f.newSpade();
  moveSpade(steady, 0.3, -0.12, 0.2);
  moveSpade(steady, -0.12, 0.3, 0.3);
  moveSpade(steady, 0.3, 0.3, 0.4);
  moveSpade(steady, 0.3, -0.12, 0.25);
  assert.equal(steady.loaded, 1);
});
