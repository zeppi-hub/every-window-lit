// The circus memory's three acts as numbers (src/v2/circus-acts.ts): the wire, the cannon, the trapeze. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as c from '../src/v2/circus-acts.ts';

const near = (a, b, by, what) => assert.ok(Math.abs(a - b) <= by, `${what}: ${a.toFixed(3)} is not within ${by} of ${b}`);

test('wire: whichever way you fall, dipping the other end of the pole brings you back', () => {
  assert.equal(c.poleInput(1.5), 0, 'inside the dead tilt');
  assert.equal(c.poleInput(25), 1);
  assert.ok(c.poleTilt(1.3, 1.1, 0.5) > 0, 'left hand higher: right end down, positive');
  const lean = { angle: -6, rate: 0 }; // falling left
  for (let i = 0; i < 120; i += 1) c.stepLean(lean, 1, c.WIRE.stretches[0], 1 / 120); // right end down
  assert.ok(lean.angle > -6, `back toward upright: ${lean.angle}`);
});

test('wire: a small lean left alone slips in about 2.75, 2.2 and 2.0 seconds, and a full tilt can always save it', () => {
  const [a, b, d] = c.WIRE.stretches.map((s) => c.timeToSlip(s));
  near(a, 2.75, 0.15, 'first stretch');
  near(b, 2.2, 0.15, 'second stretch');
  near(d, 1.98, 0.15, 'third stretch');
  assert.ok(a > b && b > d);
  for (const s of c.WIRE.stretches) assert.ok(c.WIRE.control > s.instability * s.maxLean, 'the pole beats the lean at its limit');
});

test('wire: riding slows as the lean nears its limit', () => {
  const s = c.WIRE.stretches[1];
  assert.equal(c.rideSpeed({ angle: 2, rate: 0 }, s), c.WIRE.speed);
  near(c.rideSpeed({ angle: s.maxLean, rate: 0 }, s), c.WIRE.slowSpeed, 1e-9, 'at the limit');
});

test('wire: each hoop lets a smaller tilt through, and the dipped end is the one that burns', () => {
  const upright = { angle: 0, rate: 0 };
  const widest = (s) => { let t = 0; while (t < 60 && c.throughHoop(upright, t + 0.5, s, 0) === 'clear') t += 0.5; return t; };
  const [w1, w2, w3] = c.WIRE.stretches.map(widest);
  assert.ok(w1 >= 30, `first hoop forgives: ${w1}`);
  assert.ok(w2 >= 28 && w2 <= 36, `second hoop: ${w2}`);
  assert.ok(w3 >= 22 && w3 <= 30 && w3 < w2, `third hoop: ${w3}`);
  assert.equal(c.throughHoop(upright, 32, c.WIRE.stretches[2], 0), 'right end');
  assert.equal(c.throughHoop(upright, -32, c.WIRE.stretches[2], 0), 'left end');
  assert.equal(c.throughHoop(upright, 0, c.WIRE.stretches[2], 0), 'clear');
});

/** Fly one shot with the arms neutral; what happened at each hoop and at the net. */
function fly(shot, yaw, pitch, launchTime = 0) {
  const at = { x: 0, y: 0, z: 0 };
  const v = c.muzzleVelocity(yaw, pitch);
  const before = { x: 0, y: 0, z: 0 };
  const hoops = [];
  const neutral = (c.CANNON.armsWide + c.CANNON.armsIn) / 2;
  for (let t = 0; t < 4; t += 1 / 240) {
    Object.assign(before, at);
    c.stepFlight(at, v, neutral, 1 / 240);
    for (const h of shot.hoops) { const r = c.crossHoop(before, at, h); if (r !== 'not yet') hoops.push(r); }
    const net = c.reachNet(before, at, shot, c.netSide(shot, launchTime + t));
    if (net) return { hoops, net, seconds: t };
  }
  return { hoops, net: null, seconds: 4 };
}

test('cannon: every shot has an aim inside the handles\' range that goes through all three hoops into the net', () => {
  c.CANNON.shots.forEach((shot, n) => {
    let found = null;
    for (let yaw = -c.CANNON.yawRange; yaw <= c.CANNON.yawRange && !found; yaw += 0.5) {
      for (let pitch = c.CANNON.restPitch - c.CANNON.pitchRange; pitch <= c.CANNON.restPitch + c.CANNON.pitchRange; pitch += 0.5) {
        const r = fly(shot, yaw, pitch);
        if (r.net?.caught && r.hoops.length === 3 && r.hoops.every((h) => h === 'through')) { found = { yaw, pitch, seconds: r.seconds }; break; }
      }
    }
    assert.ok(found, `shot ${n + 1} has no clean aim`);
    assert.ok(found.seconds > 1.0 && found.seconds < 2.2, `shot ${n + 1} flies ${found.seconds.toFixed(2)} s`);
  });
});

test('cannon: the rest aim alone does not win the later shots, and a wild aim misses the net', () => {
  const rest = fly(c.CANNON.shots[1], 0, c.CANNON.restPitch);
  assert.ok(!(rest.net?.caught && rest.hoops.every((h) => h === 'through')), 'shot 2 must be aimed');
  const wild = fly(c.CANNON.shots[0], 20, 20);
  assert.ok(wild.net == null || !wild.net.caught);
});

test('cannon: the handles map the hands to the barrel, and the walked net goes to and fro', () => {
  const aim = c.aimFromHands(0.09, 0.0, 0, 0);
  near(aim.yaw, c.CANNON.yawRange / 2, 1e-9, 'half travel, half yaw');
  assert.equal(aim.pitch, c.CANNON.restPitch);
  const shot = c.CANNON.shots[2];
  const xs = Array.from({ length: 200 }, (_, i) => c.netSide(shot, i * 0.05));
  near(Math.max(...xs), shot.net.x + shot.netWalk, 0.05, 'right end');
  near(Math.min(...xs), shot.net.x - shot.netWalk, 0.05, 'left end');
});

test('trapeze: pumping in time builds the swing, pumping against it kills it', () => {
  near(c.SWING_SECONDS, 3.8, 0.1, 'the beat');
  const grow = { angle: 0.15, rate: 0 };
  for (let i = 0; i < 240 * 16; i += 1) c.stepSwing(grow, 1, 1 / 240);
  let peak = 0;
  for (let i = 0; i < 240 * 4; i += 1) { c.stepSwing(grow, 1, 1 / 240); peak = Math.max(peak, Math.abs(grow.angle)); }
  assert.ok(peak > 0.7, `four beats of pumping: ${peak.toFixed(2)} rad`);
  const die = { angle: 0.6, rate: 0 };
  for (let i = 0; i < 240 * 12; i += 1) c.stepSwing(die, -1, 1 / 240);
  let left = 0;
  for (let i = 0; i < 240 * 4; i += 1) { c.stepSwing(die, -1, 1 / 240); left = Math.max(left, Math.abs(die.angle)); }
  assert.ok(left < 0.3, `pumping against: ${left.toFixed(2)} rad`);
  assert.equal(c.pumpFrom(0.6, { angle: 0, rate: 1 }), 1);
  assert.equal(c.pumpFrom(0.6, { angle: 0, rate: -1 }), -1);
});

/** With the swing kept up, how long (s) in each swing letting go ends in the catcher's hands. */
function catchWindows(flight) {
  const dt = 1 / 240;
  const size = c.TRAPEZE.maxSwing * 0.9;
  const swing = { angle: 0, rate: Math.sqrt(2 * (c.GRAVITY / c.TRAPEZE.rope) * (1 - Math.cos(size))) };
  let phase = c.catcherPhase(flight, 0, size);
  let prev = 0, top = 0, cur = 0;
  const each = [];
  const at = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 0 }, hands = { x: 0, y: 0, z: 0 }, his = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < 40; t += dt) {
    c.stepSwing(swing, 0.25, dt);
    top = Math.max(top, Math.abs(swing.angle));
    if (prev < 0 && swing.angle >= 0) { each.push(cur); cur = 0; phase = c.catcherPhase(flight, t, top); top = 0; }
    prev = swing.angle;
    if (swing.angle < 0.15 || Math.round(t / dt) % 4 !== 0) continue; // sample letting go 60 times a second on the way up
    c.letGo(swing, at, v);
    for (let f = 0; f < 1.6 && !c.inNet(at); f += dt) {
      c.stepLeap(at, v, dt);
      hands.x = at.x; hands.y = at.y - 0.05; hands.z = at.z + c.TRAPEZE.armsAhead;
      c.catcherHands(flight, t + f, phase, his);
      if (c.caught(hands, his, flight)) { cur += 4 * dt; break; }
    }
  }
  return each.slice(1);
}

test('trapeze: the catcher times himself to the flyer, so every swing has its moment; the moment shrinks from flight to flight', () => {
  const w = c.TRAPEZE.flights.map(catchWindows);
  console.log('catch window in each swing (s):', w.map((x) => Math.min(...x).toFixed(2) + '-' + Math.max(...x).toFixed(2)).join(' | '));
  w.forEach((x, n) => assert.ok(x.length >= 8 && x.every((s) => s > 0), `flight ${n + 1}: some swing has no moment`));
  assert.ok(Math.min(...w[0]) >= 0.18, `first flight forgives: ${Math.min(...w[0])}`);
  assert.ok(Math.max(...w[1]) <= 0.16 && Math.min(...w[1]) >= 0.07, `second flight is tight but human: ${w[1][0]}`);
  near(c.quarterBeat(0.01) * 4, c.SWING_SECONDS, 1e-3, 'a small swing keeps the beat');
  assert.ok(c.quarterBeat(0.8) > c.quarterBeat(0.2));
});

test('the net gives, throws back and comes to rest; a fall eases in', () => {
  const give = c.land(8);
  let deepest = 0, t = 0;
  for (; t < 3; t += 1 / 240) { c.stepGive(give, 1 / 240); deepest = Math.max(deepest, give.depth); }
  assert.ok(deepest > 0.3 && deepest <= c.NET.deepest, `deepest ${deepest.toFixed(2)} m`);
  assert.ok(Math.abs(give.depth) < 0.02, `at rest after three seconds: ${give.depth.toFixed(3)}`);
  near(c.fallen(0.5, 1, 4), 1, 1e-9, 'a quarter of the way at half time');
  assert.equal(c.fallen(2, 1, 4), 4);
});
