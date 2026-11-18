// "Prime the pump" as numbers (src/v2/pump-rules.ts): the pump's pressure, the rhythm it asks for, the beds and their drying. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as p from '../src/v2/pump-rules.ts';

const DT = 1 / 72;
const near = (a, b, by, what) => assert.ok(Math.abs(a - b) <= by, `${what}: ${a.toFixed(3)} is not within ${by} of ${b}`);

/** The lever of someone pumping `cadence` full strokes a second, each `width` of the travel. */
const leverAt = (t, cadence, width = 1) => {
  const phase = (t * cadence) % 1;
  return (phase < 0.5 ? phase * 2 : 2 - phase * 2) * width;
};

/** A primed pump worked for `seconds`; returns it. */
function work(cadence, seconds, width = 1, hands = 2) {
  const pump = p.newPump();
  p.pour(pump, p.PUMP.primeSeconds);
  for (let t = 0; t < seconds; t += DT) p.stepPump(pump, leverAt(t, cadence, width), hands, DT);
  return pump;
}

/**
 * A whole stage played by a steady pumper who throws the sluice to the drier bed (one hand on the bar for 0.7 s each throw)
 * and shuts the relief valve `react` seconds after it blows (one hand for 0.8 s); `react` Infinity never shuts it.
 */
function play(stage, cadence, { width = 1, limit = 240, losses = 0, react = 1.2 } = {}) {
  const pump = p.newPump();
  p.pour(pump, p.PUMP.primeSeconds);
  const field = p.newField(stage);
  let fed = 0;
  let oneHand = 0;
  let open = false;
  let openFor = 0;
  let sinceShut = Infinity;
  for (let t = 0; t < limit; t += DT) {
    const ease = t < p.PUMP.grace ? 0 : p.easeAfter(losses, t);
    if (!open && p.valveBlows(stage, t, sinceShut, ease)) {
      open = true;
      openFor = 0;
    }
    if (open) {
      openFor += DT;
      if (openFor >= react) {
        open = false;
        sinceShut = 0;
        oneHand = Math.max(oneHand, 0.8);
      }
    } else sinceShut += DT;
    if (p.stepPump(pump, leverAt(t, cadence, width), oneHand > 0 ? 1 : 2, DT, open ? p.PUMP.valveLeak : 1).dry) return { result: 'dry', t };
    const other = 1 - fed;
    if (stage.beds === 2 && oneHand <= 0 && field.fronts[other] < stage.rows + 0.2 && (field.fronts[fed] >= stage.rows + 0.45 || field.fronts[other] < field.fronts[fed] - 1.5)) {
      fed = other;
      oneHand = 0.7;
    }
    oneHand -= DT;
    if (p.stepField(field, stage, p.flowOf(pump), fed, DT, ease) >= 0) return { result: 'bed died', t };
    if (p.fieldWon(field, stage)) return { result: 'won', t };
  }
  return { result: 'never', t: limit };
}

test('an unprimed pump gives nothing however hard it is worked; water poured in for 0.45 s primes it', () => {
  const pump = p.newPump();
  for (let t = 0; t < 5; t += DT) p.stepPump(pump, leverAt(t, 1.4), 2, DT);
  assert.equal(pump.pressure, 0);
  assert.equal(p.flowOf(pump), 0);
  assert.ok(pump.strokes > 10, 'the lever still moves and its strokes are heard');
  assert.equal(p.pour(pump, 0.3), false);
  assert.equal(p.pour(pump, 0.3), true);
  for (let t = 0; t < 5; t += DT) p.stepPump(pump, leverAt(t, 1.0), 2, DT);
  assert.ok(pump.pressure > 0.7, `now it builds: ${pump.pressure}`);
});

test('pressure follows the rhythm: about 0.4, 0.6, 0.85 and full at 0.5, 0.7, 1.0 and 1.2 strokes a second', () => {
  for (const [cadence, want] of [[0.5, 0.39], [0.7, 0.58], [1.0, 0.85], [1.2, 1.0]]) {
    near(p.steadyPressure(cadence), want, 0.02, `the formula at ${cadence}`);
    // The worked pump swings round its steady value with every stroke; its mean over the last strokes is what the formula says.
    const pump = work(cadence, 12);
    let sum = 0;
    let n = 0;
    for (let t = 12; t < 12 + 4 / cadence; t += DT) {
      p.stepPump(pump, leverAt(t, cadence), 2, DT);
      sum += pump.pressure;
      n += 1;
    }
    near(sum / n, want, 0.05, `the pump worked at ${cadence}`);
  }
  near(p.cadenceFor(0.85), 1.0, 0.02, 'the rhythm that holds 0.85');
});

test('a wide stroke beats a jiggle: a third of the travel at the same hand speed makes almost nothing', () => {
  // The same hand speed: three times as many strokes, each a third as long.
  const wide = work(1.0, 10).pressure;
  const jiggle = work(3.0, 10, 1 / 3).pressure;
  assert.ok(wide > 0.75, `wide: ${wide}`);
  assert.ok(jiggle < p.PUMP.flowFrom, `a jiggle never brings water: ${jiggle}`);
  assert.equal(p.strokeWeight(0.05), 0);
  assert.equal(p.strokeWeight(0.6), 1);
});

test('slowing is felt at once: let go at 0.85, the spout only drips after 1.2 s, the pressure is all gone after 2.9 s, and four seconds later the pump sucks air', () => {
  const pump = work(1.0, 10);
  pump.pressure = 0.85;
  let drip = 0;
  let dry = 0;
  for (let t = DT; t < 12 && dry === 0; t += DT) {
    const step = p.stepPump(pump, pump.lever, 0, DT);
    if (drip === 0 && p.flowOf(pump) === 0) drip = t;
    if (step.dry) dry = t;
  }
  near(drip, 1.18, 0.1, 'drips');
  near(dry, 2.9 + p.PUMP.dryAfter, 0.2, 'dry');
  assert.equal(pump.primed, false, 'it must be primed again');
  assert.equal(pump.poured, 0);
});

test('one hand on the bar gives four fifths of two', () => {
  near(p.steadyPressure(1.0, 1, 1), (0.8 * (0.9 * 0.85 + 0.06) - 0.06) / 0.9, 0.02, 'one hand at 1.0');
  assert.ok(work(1.0, 10, 1, 1).pressure < work(1.0, 10, 1, 2).pressure - 0.1);
});

test('a pump that has not run yet cannot run dry, and the rehearsal leaks slowly', () => {
  const pump = p.newPump();
  p.pour(pump, p.PUMP.primeSeconds);
  let dried = false;
  // A few timid strokes that never bring water, then nothing for 20 s.
  for (let t = 0; t < 2; t += DT) dried = p.stepPump(pump, leverAt(t, 0.3, 0.6), 2, DT).dry || dried;
  assert.ok(pump.pressure < p.PUMP.flowFrom);
  for (let t = 0; t < 20; t += DT) dried = p.stepPump(pump, pump.lever, 0, DT).dry || dried;
  assert.equal(dried, false);
  assert.equal(pump.primed, true);
  // In the rehearsal a calm half stroke a second already passes the mark that ends it.
  assert.ok(p.steadyPressure(0.5, 1, 2, p.PUMP.rehearsalLeak) > p.PUMP.rehearsalMark);
  assert.ok(p.steadyPressure(0.5) < p.PUMP.rehearsalMark);
});

test('each stage asks for more: the gauge mark climbs 0.43, 0.58, 0.73, and the city 0.47 then 0.80', () => {
  const marks = p.STAGES.map((s) => p.holdPressure(s));
  near(marks[0], 0.425, 0.01, 'one bed');
  near(marks[1], 0.575, 0.01, 'two beds');
  near(marks[2], 0.725, 0.01, 'noon');
  const city = p.CITY_STAGES.map((s) => p.holdPressure(s));
  near(city[0], 0.47, 0.01, 'first shops');
  near(city[1], 0.8, 0.01, 'the whole street');
  // In strokes a second: a calm half stroke holds nothing past the first stage; the last ones want nearly one a second just to stand still.
  near(p.cadenceFor(marks[0]), 0.54, 0.02, 'one bed, strokes a second');
  near(p.cadenceFor(marks[2]), 0.86, 0.02, 'noon, strokes a second');
  near(p.cadenceFor(city[1]), 0.95, 0.02, 'the street, strokes a second');
});

test('a strong pumper (1.2 strokes a second) wins every stage, each taking longer: about 8, 15 and 19 s', () => {
  const times = p.STAGES.map((s) => play(s, 1.2));
  for (const r of times) assert.equal(r.result, 'won');
  near(times[0].t, 8.2, 2, 'one bed');
  near(times[1].t, 14.6, 4, 'two beds');
  near(times[2].t, 18.7, 6, 'noon');
  assert.ok(times[0].t < times[1].t && times[1].t < times[2].t);
  const city = p.CITY_STAGES.map((s) => play(s, 1.2));
  near(city[0].t, 6.7, 2, 'first shops');
  near(city[1].t, 17.1, 6, 'the whole street');
  // One stroke a second still wins every stage, but the noon stage then takes most of a minute.
  for (const s of [...p.STAGES, ...p.CITY_STAGES]) assert.equal(play(s, 1.0).result, 'won', s.name);
  assert.ok(play(p.STAGES[2], 1.0).t > 40);
});

test('a slow pumper (0.6 of a stroke a second) loses a bed in stage 2, in stage 3 and on the street', () => {
  assert.equal(play(p.STAGES[1], 0.6).result, 'bed died');
  assert.equal(play(p.STAGES[2], 0.6).result, 'bed died');
  assert.equal(play(p.CITY_STAGES[1], 0.6).result, 'bed died');
  assert.ok(p.steadyPressure(0.8) < p.holdPressure(p.STAGES[2]));
});

test('every attempt starts with a second and a half in which nothing dries', () => {
  const stage = p.STAGES[2];
  const field = p.newField(stage);
  const before = [...field.fronts];
  for (let t = 0; t < p.PUMP.grace; t += DT) p.stepField(field, stage, 0, 0, DT, 0);
  assert.deepEqual(field.fronts, before);
  p.stepField(field, stage, 0, 0, 1, 1);
  assert.ok(field.fronts[0] < before[0], 'after it, they do');
});

test('the relief valve: it blows 6 s into a stage that has one and again some seconds after each shutting; open, it drains the pump', () => {
  assert.equal(p.valveBlows(p.STAGES[0], 100, Infinity), false, 'the first stage has none');
  assert.equal(p.valveBlows(p.STAGES[1], 5.9, Infinity), false);
  assert.equal(p.valveBlows(p.STAGES[1], 6, Infinity), true);
  assert.equal(p.valveBlows(p.STAGES[1], 30, 17.9), false);
  assert.equal(p.valveBlows(p.STAGES[1], 30, 18), true);
  assert.equal(p.valveBlows(p.STAGES[2], 30, 13), true, 'more often at noon');
  assert.equal(p.valveBlows(p.STAGES[2], 30, 13, p.PUMP.mercy), false, 'less often once the stage is eased');
  assert.equal(p.valveBlows(p.STAGES[2], 1, Infinity, 0), false, 'never in the opening grace');
  // Open, even a strong pumper's pressure falls under every stage's mark.
  assert.ok(p.steadyPressure(1.2, 1, 2, p.PUMP.valveLeak) < 0.5);
  // Left open, no stage with a valve is won, however hard the bar is worked.
  for (const stage of [p.STAGES[1], p.STAGES[2], p.CITY_STAGES[1]]) assert.notEqual(play(stage, 1.4, { react: Infinity }).result, 'won', stage.name);
  // A slow hand (2.5 s to reach it) still wins, later.
  assert.ok(play(p.STAGES[2], 1.2, { react: 2.5 }).t > play(p.STAGES[2], 1.2).t);
});

test('the far rows go first: water held back dries the bed from its far end', () => {
  const stage = p.STAGES[2];
  const field = { fronts: [stage.rows, stage.rows], wetted: [true, true] };
  for (let t = 0; t < 4; t += DT) p.stepField(field, stage, 0, 0, DT);
  assert.equal(p.rowWet(field, 0, 0), 1, 'the near row is still soaked');
  assert.equal(p.rowWet(field, 0, stage.rows - 1), 0, 'the far row has cracked again');
  // The noon sun: a long wet stretch loses rows faster than a short one.
  assert.ok(p.drying(stage, 6) > p.drying(stage, 1));
  assert.equal(p.drying(p.STAGES[0], 6), p.drying(p.STAGES[0], 1));
});

test('a bed that had water and loses all of it is lost once; one that never had any is not', () => {
  const stage = p.STAGES[1];
  const field = p.newField(stage);
  assert.deepEqual(field.fronts, [6, 0]);
  let dead = [];
  for (let t = 0; t < 40; t += DT) {
    const b = p.stepField(field, stage, 0, 0, DT);
    if (b >= 0) dead.push(b);
  }
  assert.deepEqual(dead, [0], 'only the bed that had water, and only once');
});

test('nobody is stuck: three losses ease a stage, and a long attempt eases further, never below 0.45', () => {
  assert.equal(p.easeAfter(0, 10), 1);
  assert.equal(p.easeAfter(3, 10), p.PUMP.mercy);
  near(p.easeAfter(0, 70), 0.7, 1e-9, 'twenty seconds past patience');
  assert.equal(p.easeAfter(0, 500), p.PUMP.patienceFloor);
  // A gentle pumper (0.8 a second) gets through every stage in the end.
  for (const s of [...p.STAGES, ...p.CITY_STAGES]) assert.equal(play(s, 0.8).result, 'won', s.name);
  // After three losses the noon stage's mark is within a calm rhythm.
  assert.ok(p.holdPressure(p.STAGES[2], p.PUMP.mercy) < p.steadyPressure(0.75));
});

test('the farm as played: two pumping acts without the relief valve, each won at a steady 1.0 strokes a second', () => {
  assert.equal(p.FARM_STAGES.length, 2);
  for (const s of p.FARM_STAGES) {
    assert.equal(s.valveEvery, 0, s.name);
    assert.equal(play(s, 1.0).result, 'won', s.name);
  }
});

/**
 * A player of the third act: opens the gate of the place whose turn it is, and `react` seconds after a place lights shuts its gate and opens the next.
 * `wrong`: opens the factory's gate first and leaves it open for that many seconds.
 */
function gatesPlay(react, losses = 0, wrong = 0) {
  const g = p.newGates();
  let due = react;
  let todo = () => { g.open[wrong > 0 ? 2 : 0] = true; };
  if (wrong > 0) {
    const first = todo;
    todo = () => { first(); due = react + wrong; todo = () => { g.open[2] = false; g.open[0] = true; todo = null; }; };
  }
  for (let t = 0; t < 120; t += DT) {
    if (todo != null && t >= due) { const now = todo; todo = null; now(); }
    const step = p.stepGates(g, DT, losses);
    if (step.lit >= 0 && step.lit < 2) {
      const k = step.lit;
      due = t + react;
      todo = () => { g.open[k] = false; g.open[k + 1] = true; };
    }
    if (p.gatesWon(g)) return { result: 'won', t, g };
    if (p.gatesLost(g)) return { result: 'lost', t, g };
  }
  return { result: 'none', t: 120, g };
}

test('sharing the water out: the water takes the first open gate, runs down its lane, fills its place and lights it; three lit places win', () => {
  const g = p.newGates();
  assert.equal(p.gateFed(g), -1);
  assert.equal(p.gateWanted(g), 0);
  g.open[1] = true;
  g.open[0] = true;
  assert.equal(p.gateFed(g), 0, 'the first open gate from the pump');
  // The water takes its time down the lane: nothing arrives before then.
  for (let t = 0; t < p.GATES.travel[0] - 0.1; t += DT) p.stepGates(g, DT);
  assert.equal(p.gateArriving(g, 0), false);
  assert.equal(g.level[0], 0);
  for (let t = 0; t < 0.2; t += DT) p.stepGates(g, DT);
  assert.equal(p.gateArriving(g, 0), true);
  assert.ok(g.level[0] > 0);
  assert.equal(g.head[1], 0, 'the second gate gets nothing while the first is open');
  // A shut gate's lane runs out.
  g.open[0] = false;
  for (let t = 0; t < p.GATES.travel[0] + 0.1; t += DT) p.stepGates(g, DT);
  assert.equal(g.head[0], 0);
  assert.equal(p.gateFed(g), 1);
  const steady = gatesPlay(0.5);
  assert.equal(steady.result, 'won');
  assert.equal(p.gateSpills(steady.g), 0);
  near(steady.t, p.GATES.travel.reduce((a, b) => a + b) + p.GATES.fill.reduce((a, b) => a + b) + 1.5, 1.5, 'the whole act');
});

test('wasted water: a place takes none before the one before it is lit, and none once it is lit and done brimming; three spills lose the attempt', () => {
  // The factory's gate opened first: its water is wasted for as long as it stays open.
  const wrong = gatesPlay(0.5, 0, 2.0);
  assert.equal(wrong.result, 'won');
  assert.equal(p.gateSpills(wrong.g), 1);
  assert.equal(gatesPlay(0.5, 0, 6).result, 'lost');
  // A gate never shut: the bakery lights, brims, and then spills until the attempt is lost.
  const g = p.newGates();
  g.open[0] = true;
  let lost = -1;
  for (let t = 0; t < 30 && lost < 0; t += DT) {
    p.stepGates(g, DT);
    if (p.gatesLost(g)) lost = t;
  }
  near(lost, p.GATES.travel[0] + p.GATES.fill[0] + p.GATES.travel[0] + p.GATES.brim + p.GATES.spill * p.GATES.spills, 0.2, 'lost after');
  assert.equal(g.litFor[0] >= 0, true);
});

test('sharing the water out is passed by slow hands too: answering a light after 1.2, 1.6 or 2.4 s wins at the first attempt, and a lost attempt makes the next more forgiving', () => {
  for (const react of [1.2, 1.6, 2.4]) {
    const r = gatesPlay(react);
    assert.equal(r.result, 'won', `${react} s`);
    assert.ok(p.gateSpills(r.g) <= 2, `${react} s spills`);
  }
  assert.equal(gatesPlay(5).result, 'lost');
  assert.equal(gatesPlay(5, 3).result, 'won');
});
