// Steering as numbers (src/v2/ship-helm.ts): the storm ship's middle stage. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as h from '../src/v2/ship-helm.ts';

const DT = 1 / 60;
const DEG = Math.PI / 180;

/**
 * Someone at the wheel: she sees where the sea is `delay` seconds late and
 * puts the helm toward it, full helm once it is `full` radians off, with
 * `strength` of the wheel's travel at most. Returns how the stage ended.
 */
function steer(stage, { delay = 0.3, full = 12 * DEG, strength = 1, eased = 1, seed = 7, limit = 240 } = {}) {
  const r = h.HELM;
  const state = h.newHelm(stage, seed);
  const out = { struck: false, rode: false, won: false, lost: false };
  const seen = [];
  let widest = 0;
  for (let t = 0; t < limit; t += DT) {
    seen.push(state.off);
    const then = seen[Math.max(0, seen.length - 1 - Math.round(delay / DT))];
    const helm = Math.max(-1, Math.min(1, then / full)) * strength;
    h.stepHelm(r, stage, state, helm, DT, eased, out);
    widest = Math.max(widest, Math.abs(state.off));
    if (out.won || out.lost) return { won: out.won, lost: out.lost, ridden: state.ridden, shipped: state.shipped, clock: state.clock, widest };
  }
  return { won: false, lost: false, ridden: state.ridden, shipped: state.shipped, clock: state.clock, widest };
}

const SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67];

test('the helm: starboard helm brings a sea on the starboard bow ahead, port helm a sea to port', () => {
  const r = h.HELM;
  const out = { struck: false, rode: false, won: false, lost: false };
  for (const side of [1, -1]) {
    const state = h.newHelm(r.rehearsal);
    state.off = side * 40 * DEG;
    for (let t = 0; t < 1.5; t += DT) h.stepHelm(r, r.rehearsal, state, side, DT, 1, out);
    assert.ok(Math.abs(state.off) < 40 * DEG - 10 * DEG, `the sea came ${((40 * DEG - Math.abs(state.off)) / DEG).toFixed(1)} degrees nearer the bow`);
    assert.equal(Math.sign(state.off), side, 'and has not crossed it yet');
  }
  assert.equal(h.helmOf(r, r.fullWheel), 1);
  assert.equal(h.helmOf(r, -r.fullWheel * 2), -1);
  assert.equal(h.helmOf(r, 0), 0);
});

test('she answers with a ship\'s weight: the turn builds, and runs on after the helm is let go', () => {
  const r = h.HELM;
  const out = { struck: false, rode: false, won: false, lost: false };
  const state = h.newHelm(r.rehearsal);
  h.stepHelm(r, r.rehearsal, state, 1, DT, 1, out);
  assert.ok(state.turn < r.rate * 0.1, 'not at once');
  for (let t = 0; t < 2; t += DT) h.stepHelm(r, r.rehearsal, state, 1, DT, 1, out);
  assert.ok(state.turn > r.rate * 0.95, 'full rate in the end');
  h.stepHelm(r, r.rehearsal, state, 0, DT, 1, out);
  assert.ok(state.turn > r.rate * 0.9, 'still turning the moment the wheel is let go');
});

test('the rehearsal: never lost however long it takes, won by bringing her head to the sea once', () => {
  const r = h.HELM;
  const out = { struck: false, rode: false, won: false, lost: false };
  const state = h.newHelm(r.rehearsal);
  for (let t = 0; t < 120; t += DT) {
    h.stepHelm(r, r.rehearsal, state, 0, DT, 1, out);
    assert.ok(!out.lost && !out.won && !out.struck, 'hands off: nothing happens');
  }
  const done = steer(r.rehearsal);
  assert.ok(done.won, 'won');
  assert.ok(done.clock < 6, `in ${done.clock.toFixed(1)} s`);
});

test('a breathing space: for the first seconds of the stage she does not fall off and no sea counts down', () => {
  const r = h.HELM;
  const out = { struck: false, rode: false, won: false, lost: false };
  const state = h.newHelm(r.stage);
  const before = state.off;
  for (let t = 0; t < r.grace - 0.05; t += DT) h.stepHelm(r, r.stage, state, 0, DT, 1, out);
  assert.equal(state.off, before);
  assert.equal(state.seaIn, r.stage.every);
});

test('hands off the wheel: she falls off, three seas come aboard and the stage is lost', () => {
  for (const seed of SEEDS) {
    const end = steer(h.HELM.stage, { strength: 0, seed });
    assert.ok(end.lost, `seed ${seed}: lost`);
    // (A shift of the wind can bring one sea across her bow by luck; never enough of them.)
    assert.ok(end.ridden <= 1, `seed ${seed}: ${end.ridden} ridden by luck`);
    assert.equal(end.shipped, h.HELM.lives);
  }
});

test('a sea is ridden only within the safe arc of the bow', () => {
  const r = h.HELM;
  const out = { struck: false, rode: false, won: false, lost: false };
  for (const [off, rode] of [[0, true], [r.safe * 0.9, true], [-r.safe * 0.9, true], [r.safe * 1.3, false], [-60 * DEG, false]]) {
    const state = h.newHelm(r.stage);
    state.clock = r.grace + 1;
    state.off = off;
    state.seaIn = DT / 2;
    // Held where it is for the one step (no fall, no helm).
    h.stepHelm(r, { ...r.stage, fall: 0 }, state, 0, DT, 1, out);
    assert.ok(out.struck, 'the sea met her');
    assert.equal(out.rode, rode, `${(off / DEG).toFixed(0)} degrees off`);
  }
});

test('a steady hand (0.3 s late, full helm) wins on every run, with seas to spare', () => {
  let shipped = 0;
  let longest = 0;
  for (const seed of SEEDS) {
    const end = steer(h.HELM.stage, { seed });
    assert.ok(end.won, `seed ${seed}: won (${end.ridden} ridden, ${end.shipped} aboard)`);
    shipped += end.shipped;
    longest = Math.max(longest, end.clock);
  }
  assert.ok(shipped <= SEEDS.length * 0.5, `${shipped} seas aboard in ${SEEDS.length} runs`);
  assert.ok(longest < 75, `the longest run took ${longest.toFixed(0)} s`);
});

test('it is not a walkover: a slow, timid hand (0.7 s late, half helm) loses most runs as the stage stands', () => {
  let lost = 0;
  for (const seed of SEEDS) if (steer(h.HELM.stage, { delay: 0.7, strength: 0.5, seed }).lost) lost += 1;
  assert.ok(lost >= SEEDS.length * 0.6, `${lost} of ${SEEDS.length} lost`);
});

test('mercy: eased after three losses and again after six, the slow hand wins most runs', () => {
  const r = h.HELM;
  assert.equal(h.easeHelm(r, 0), 1);
  assert.equal(h.easeHelm(r, 3), 0.7);
  assert.equal(h.easeHelm(r, 6), 0.5);
  assert.ok(h.safeArc(r, 0.5) > h.safeArc(r, 1));
  let won = 0;
  for (const seed of SEEDS) if (steer(r.stage, { delay: 0.7, strength: 0.5, eased: 0.5, seed }).won) won += 1;
  assert.ok(won >= SEEDS.length * 0.8, `${won} of ${SEEDS.length} won when eased to half`);
});

test('the desktop wheel (24 degrees at most) reaches full helm; the sea never goes where she cannot see it', () => {
  const r = h.HELM;
  assert.ok(r.fullWheel <= 24 * DEG, 'full helm is within the mouse\'s reach');
  for (const seed of SEEDS) {
    const end = steer(r.stage, { strength: 0, seed });
    assert.ok(end.widest <= r.limit + 1e-9, `seed ${seed}: ${(end.widest / DEG).toFixed(0)} degrees at most`);
  }
});

test('the same seed gives the same seas', () => {
  const a = steer(h.HELM.stage, { seed: 5 });
  const b = steer(h.HELM.stage, { seed: 5 });
  assert.deepEqual(a, b);
});
