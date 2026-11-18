// The mountain memory and the fog fight as numbers (src/v2/mountain-rules.ts). `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as m from '../src/v2/mountain-rules.ts';

const near = (a, b, by, what) => assert.ok(Math.abs(a - b) <= by, `${what}: ${a.toFixed(3)} is not within ${by} of ${b}`);

test('ropes: one or two of the three are rotten, never all, and nothing shows which until they are hung on', () => {
  const counts = { 1: 0, 2: 0 };
  const where = new Set();
  for (let seed = 1; seed <= 400; seed += 1) {
    const ropes = m.layRopes(m.seeded(seed * 7919));
    const rotten = ropes.filter((r) => r.rotten).length;
    assert.ok(rotten === 1 || rotten === 2, `${rotten} rotten`);
    counts[rotten] += 1;
    ropes.forEach((r, i) => { if (r.rotten) where.add(i); });
    for (const r of ropes) assert.equal(m.ropeKnown(r), 'untried');
  }
  assert.equal(where.size, 3, 'any of the three can be rotten');
  assert.ok(counts[1] > 120 && counts[2] > 120, `one rotten ${counts[1]}, two rotten ${counts[2]}`);
});

test('ropes: a sound rope holds a full weight at once; a half pull proves nothing', () => {
  const rope = { rotten: false, fray: 0, held: false, parted: false };
  assert.equal(m.ropeLoad(m.ROPE.fullPull / 2), 0.5);
  assert.equal(m.stepRope(rope, 0.6, 1), 'nothing');
  assert.equal(m.ropeKnown(rope), 'untried');
  assert.equal(m.stepRope(rope, 1, 1 / 72), 'held');
  assert.equal(m.ropeKnown(rope), 'sound');
  assert.equal(m.stepRope(rope, 1, 1 / 72), 'nothing', 'it says so once');
  near(m.ropeGive(rope, 1), m.ROPE.stretch, 1e-9, 'a sound rope barely stretches');
  assert.equal(m.clipVerdict(rope), 'holds');
});

test('ropes: a rotten rope opens strand by strand under weight, shows it early, and parts in the hand', () => {
  const rope = { rotten: true, fray: 0, held: false, parted: false };
  assert.equal(m.stepRope(rope, m.ROPE.frayFrom, 1), 'nothing', 'a light touch opens nothing');
  let t = 0;
  let knownAt = -1;
  let last = 'nothing';
  while (!rope.parted && t < 10) {
    last = m.stepRope(rope, 1, 1 / 72);
    t += 1 / 72;
    if (knownAt < 0 && m.ropeKnown(rope) === 'rotten') knownAt = t;
  }
  assert.equal(last, 'parted');
  near(t, m.ROPE.fraySeconds, 0.05, 'seconds at full weight until it parts');
  assert.ok(knownAt > 0 && knownAt < 0.4, `anyone can see it well before it parts: ${knownAt}`);
  assert.ok(m.ropeGive(rope, 1) > m.ROPE.stretch * 4, 'it gives far more than a sound one');
  assert.equal(m.clipVerdict(rope), 'parts');
});

test('ropes: a rotten rope let go of early stays as frayed as it was, and still parts under the party', () => {
  const rope = { rotten: true, fray: 0, held: false, parted: false };
  for (let i = 0; i < 20; i += 1) m.stepRope(rope, 1, 1 / 72);
  const fray = rope.fray;
  m.stepRope(rope, 0, 5);
  assert.equal(rope.fray, fray);
  assert.equal(m.clipVerdict(rope), 'parts');
  assert.equal(m.clipVerdict({ rotten: true, fray: 0, held: false, parted: false }), 'parts', 'untried and trusted: it parts');
});

test('rows: every row keeps a sound hold, the rock has at most one loose hold a row, the ice up to two', () => {
  const [, rock, ice] = m.ROUTE.pitches;
  let rockLoose = 0;
  let iceTwo = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const rocks = m.layRows(rock, m.seeded(seed * 31));
    assert.equal(rocks.length, rock.rows);
    for (const row of rocks) {
      assert.equal(row.length, rock.across);
      assert.ok(row.filter(Boolean).length <= 1);
      rockLoose += row.filter(Boolean).length;
    }
    for (const row of m.layRows(ice, m.seeded(seed * 37))) {
      const loose = row.filter(Boolean).length;
      assert.ok(loose >= 1 && loose <= 2, `ice row with ${loose} loose`);
      if (loose === 2) iceTwo += 1;
    }
  }
  near(rockLoose / (200 * rock.rows), rock.looseChance, 0.06, 'share of rock rows with a loose hold');
  assert.ok(iceTwo > 250 && iceTwo < 750, `ice rows with two loose holds: ${iceTwo} of 1000`);
});

test('holds: a loose hold moves in the hand by its tell and no further; a sound one does not move and knocks', () => {
  const [, rock, ice] = m.ROUTE.pitches;
  assert.equal(m.holdShift(false, { off: 0.1, down: 0 }, rock), 0);
  near(m.holdShift(true, { off: 0.01, down: 0 }, rock), 0.01, 1e-9, 'it follows a small try');
  assert.equal(m.holdShift(true, { off: 0.2, down: 0 }, rock), rock.tell);
  assert.equal(m.holdShift(true, { off: 0, down: 0.3 }, rock), rock.tell, 'a pull down shows it too');
  assert.ok(ice.tell < rock.tell / 2, 'the ice tells less than half as much');
  assert.ok(!m.knocks(false, { off: 0.01, down: 0 }));
  assert.ok(m.knocks(false, { off: 0.04, down: 0 }));
  assert.ok(!m.knocks(true, { off: 0.2, down: 0 }), 'a loose hold never knocks');
});

test('holds: the first centimetres of a pull are only a try; weight on a loose hold tears it out', () => {
  assert.equal(m.haulRise({ off: 0, down: m.ROUTE.haulFrom }), 0);
  assert.ok(!m.ripped(true, { off: 0.3, down: 0.04 }), 'tried hard sideways: still there');
  assert.ok(!m.ripped(true, { off: 0, down: m.ROUTE.haulFrom + m.ROUTE.ripAt - 0.01 }));
  assert.ok(m.ripped(true, { off: 0, down: m.ROUTE.haulFrom + m.ROUTE.ripAt }));
  assert.ok(!m.ripped(false, { off: 0, down: 1 }), 'a sound hold never tears out');
});

test('climb: the body rises with the hand, never sinks when the hold is let go, and a row is done at its full height', () => {
  const climb = { row: 0, rise: 0 };
  assert.equal(m.stepClimb(climb, 0, { off: 0, down: 0.25 }), false);
  near(climb.rise, 0.2, 1e-9, 'risen with the hand');
  // Let go, take the same hold again lower down, and haul on.
  assert.equal(m.stepClimb(climb, climb.rise, { off: 0, down: 0.02 }), false);
  near(climb.rise, 0.2, 1e-9, 'kept');
  assert.equal(m.stepClimb(climb, 0.2, { off: 0, down: 0.4 }), true);
  assert.deepEqual(climb, { row: 1, rise: 0 });
  near(m.climbHeight({ row: 3, rise: 0.1 }), 3 * m.ROUTE.rowRise + 0.1, 1e-9, 'height');
});

test('climb: a row is one haul of a seated arm, and the next row is back within reach', () => {
  assert.ok(m.ROUTE.rowRise + m.ROUTE.haulFrom <= 0.5, 'hand travel for a row');
  assert.ok(m.ROUTE.holdAbove <= 0.35 && m.ROUTE.standOff <= 0.45, 'the holds are in a seated reach');
  assert.ok(m.ROUTE.holdAbove - m.ROUTE.rowRise - m.ROUTE.haulFrom > -0.3, 'the haul ends above the lap');
});

test('storm: each pitch is closed sooner than the last one was, with room for a careful climber and none for doubting everything', () => {
  const [ropes, rock, ice] = m.ROUTE.pitches;
  assert.equal(m.storm(0, rock), 0);
  assert.equal(m.storm(rock.seconds, rock), 1);
  assert.ok(ice.seconds < rock.seconds);
  for (const pitch of [ropes, rock, ice]) {
    const careful = m.carefulSeconds(pitch);
    assert.ok(pitch.seconds >= careful * 1.3, `${pitch.name}: ${pitch.seconds} s for a careful ${careful.toFixed(0)} s`);
  }
  for (const pitch of [rock, ice]) {
    const everything = pitch.rows * (pitch.across * 2 * 2.8 + 2.2);
    assert.ok(pitch.seconds < everything, `${pitch.name}: trying every hold twice (${everything.toFixed(0)} s) is too slow`);
  }
});

test('gusts: none in the first two seconds, then a short swell that comes more often on each pitch', () => {
  const [, rock, ice] = m.ROUTE.pitches;
  assert.equal(m.gust(1, rock), 0);
  assert.equal(m.gust(rock.gustEvery + rock.gustSeconds + 0.1, rock), 0);
  near(m.gust(rock.gustEvery + rock.gustSeconds / 2, rock), 1, 1e-9, 'its height');
  assert.ok(ice.gustEvery < rock.gustEvery);
  // In a gust the ice's tell is barely more than the rattle; between gusts it stands alone.
  assert.ok(ice.tell < ice.rattle * 2 && ice.tell > ice.rattle);
});

test('losing: after two losses the tells double, after three the storm waits and the gusts stop; nobody is stuck', () => {
  const ice = m.ROUTE.pitches[2];
  assert.equal(m.eased(ice, 1), ice);
  const hint = m.eased(ice, 2);
  near(hint.tell, ice.tell * 2, 1e-9, 'hint');
  assert.equal(hint.seconds, ice.seconds);
  const mercy = m.eased(ice, 3);
  near(mercy.seconds, ice.seconds * 1.5, 1e-9, 'mercy');
  assert.equal(m.gust(mercy.gustEvery + 0.3, mercy), 0);
});

test('fog: one bank of three is cracked; a sound bank rings clear, a cracked one opens, answers dully, and rings once propped', () => {
  for (let seed = 1; seed <= 20; seed += 1) assert.equal(m.layFog(m.seeded(seed)).banks.filter((b) => b.weak).length, 1);
  const fight = m.layFog(() => 0.5);
  assert.deepEqual(fight.banks.map((b) => b.weak), [false, true, false]);
  assert.equal(m.pullBell(fight, 0), 'rings');
  near(fight.fog, m.FOG.start - m.FOG.bell, 1e-9, 'a bell takes fog off');
  assert.equal(m.pullBell(fight, 0), 'already');
  assert.equal(m.prop(fight, 1), false, 'nothing to prop before the crack shows');
  assert.equal(m.pullBell(fight, 1), 'cracks');
  assert.equal(m.pullBell(fight, 1), 'dull');
  assert.equal(m.prop(fight, 1), true);
  assert.equal(m.prop(fight, 1), false);
  assert.equal(m.pullBell(fight, 1), 'rings');
});

test('fog: after the second clear bell the magpie whispers once, the first bank fogs over again, and the fight is won only when all three ring after it', () => {
  const fight = m.layFog(() => 0.9);
  assert.equal(m.whisper(fight, 0), -1, 'not before two are clear');
  m.pullBell(fight, 0);
  m.pullBell(fight, 1);
  assert.ok(!m.fogLifted(fight));
  const fog = fight.fog;
  assert.equal(m.whisper(fight, 0), 0);
  assert.equal(fight.banks[0].clear, false);
  near(fight.fog, fog + m.FOG.whisper, 1e-9, 'the whisper brings fog back');
  assert.equal(m.whisper(fight, 1), -1, 'only once');
  m.pullBell(fight, 2);
  m.prop(fight, 2);
  m.pullBell(fight, 2);
  assert.ok(!m.fogLifted(fight));
  assert.equal(m.pullBell(fight, 0), 'rings');
  assert.ok(m.fogLifted(fight));
});

test('fog: left alone it takes the square in about three quarters of a minute; a steady player stays ahead of it; mercy halves its speed', () => {
  const idle = m.layFog(() => 0);
  let t = 0;
  while (!m.stepFog(idle, 0.1) && t < 200) t += 0.1;
  assert.ok(t > 38 && t < 50, `left alone: ${t.toFixed(0)} s`);
  // Six strokes and a prop, one every 8 seconds: never lost.
  const fight = m.layFog(() => 0);
  let first = -1;
  const moves = [() => m.pullBell(fight, 0), () => m.prop(fight, 0), () => m.pullBell(fight, 0), () => m.pullBell(fight, 1), () => m.whisper(fight, 0), () => m.pullBell(fight, 2), () => m.pullBell(fight, 0)];
  for (const move of moves) {
    for (let k = 0; k < 80; k += 1) assert.equal(m.stepFog(fight, 0.1), false, 'the fog never takes the square');
    move();
    if (first < 0 && fight.banks[0].clear) first = 0;
  }
  assert.ok(m.fogLifted(fight));
  const slow = m.layFog(() => 0);
  m.stepFog(slow, 10, 3);
  near(slow.fog, m.FOG.start + m.FOG.rise * m.FOG.mercy * 10, 1e-9, 'mercy');
});

// A player model (a model, not a person): one try costs 2.8 s with the reach to it, one haul 2.2 s.
function climbAs(style, pitch, seed) {
  const random = m.seeded(seed);
  const rows = m.layRows(pitch, random);
  let t = 0;
  for (const row of rows) {
    let done = false;
    for (let k = 0; k < row.length && !done; k += 1) {
      const tries = style === 'reckless' ? 0 : style === 'doubter' ? 2 : 1;
      t += tries * 2.8;
      if (style === 'doubter' && k < row.length - 1 && !row[k]) {
        // Not sure of it even so: she tries the others as well before she trusts it.
        t += (row.length - 1 - k) * 2 * 2.8;
      }
      if (tries > 0 && row[k]) continue; // it gave: on to the next hold
      t += 2.2;
      if (row[k]) return { result: 'a loose hold', t };
      done = true;
    }
    if (t >= pitch.seconds) return { result: 'the storm', t };
  }
  return { result: 'won', t };
}

test('difficulty (a model): the careful climber wins, trusting untried loses nearly always, doubting everything loses to the storm', () => {
  const [, rock, ice] = m.ROUTE.pitches;
  for (const pitch of [rock, ice]) {
    const tally = { careful: 0, reckless: 0, doubter: 0 };
    let slowest = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      for (const style of ['careful', 'reckless', 'doubter']) {
        const run = climbAs(style, pitch, seed * 101);
        if (run.result === 'won') tally[style] += 1;
        if (style === 'careful') slowest = Math.max(slowest, run.t);
        if (style === 'doubter') assert.notEqual(run.result, 'a loose hold', 'the doubter never falls, she is only late');
      }
    }
    assert.equal(tally.careful, 400, `${pitch.name}: the careful climber always gets up (slowest ${slowest.toFixed(0)} of ${pitch.seconds} s)`);
    assert.ok(tally.reckless <= 400 * 0.12, `${pitch.name}: trusting untried wins ${tally.reckless} of 400`);
    assert.ok(tally.doubter <= 400 * 0.1, `${pitch.name}: doubting everything wins ${tally.doubter} of 400`);
  }
});

test('difficulty (a model): on the ropes, trusting one untried puts the party on a rotten rope one time in two', () => {
  let parted = 0;
  for (let seed = 1; seed <= 800; seed += 1) {
    const ropes = m.layRopes(m.seeded(seed * 53));
    if (m.clipVerdict(ropes[seed % 3]) === 'parts') parted += 1;
  }
  near(parted / 800, 0.5, 0.07, 'share of blind clips that part');
});

test('holds: a hold has borne her once a real share of a haul is on it; a torn one is only a fright while the other hand is on', () => {
  assert.ok(!m.proven(false, { off: 0.3, down: 0.1 }), 'a wiggle proves nothing');
  assert.ok(m.proven(false, { off: 0, down: m.ROUTE.haulFrom + m.ROUTE.ripAt }));
  assert.ok(!m.proven(true, { off: 0, down: 1 }), 'a loose hold never proves');
  assert.equal(m.torn(true, 4), 'caught');
  assert.equal(m.torn(false, 4), 'falls');
  assert.equal(m.torn(false, 0), 'caught', 'at the foot of a pitch she is still standing');
  assert.equal(m.torn(false, m.ROUTE.pitonEvery), 'caught', 'clipped to a piton');
  assert.equal(m.torn(false, m.ROUTE.pitonEvery + 1), 'falls');
});

test('falls: under gravity onto the rope in about 0.7 s, and back to the last piton, never further than two rows down', () => {
  assert.equal(m.fallen(0), 0);
  near(m.fallen(0.5), 1.23, 0.01, 'half a second of gravity');
  assert.equal(m.fallen(5), m.ROUTE.fall);
  const seconds = Math.sqrt((2 * m.ROUTE.fall) / 9.81);
  near(seconds, 0.7, 0.03, 'the fall lasts');
  for (let row = 0; row < 6; row += 1) {
    const back = m.pitonBelow(row);
    assert.ok(back <= row && row - back <= 2 && back % m.ROUTE.pitonEvery === 0, `row ${row} -> ${back}`);
  }
});

test('icefall: none on the ropes, more often on the ice than on the rock; a lean of 20 cm clears it, sitting still is hit; mercy stops it', () => {
  const [ropes, rock, ice] = m.ROUTE.pitches;
  assert.equal(ropes.iceEvery, 0);
  assert.ok(ice.iceEvery > 0 && ice.iceEvery < rock.iceEvery);
  assert.ok(m.iceHits(0.45, 0.45));
  assert.ok(m.iceHits(0.45, 0.45 + 0.15), 'a small flinch is not enough');
  assert.ok(!m.iceHits(0.45, 0.45 + 0.2));
  assert.ok(!m.iceHits(0.45, 0.45 - 0.25));
  assert.ok(m.ICEFALL.warning >= 1.5, 'time to see it and get a hand up');
  // A hand over her head takes it on the glove; a hand at her chest, or off to one side, does not.
  assert.ok(m.iceCovered(0.5, 1.75, 1.6, 0.45));
  assert.ok(!m.iceCovered(0.5, 1.5, 1.6, 0.45));
  assert.ok(!m.iceCovered(0.9, 1.9, 1.6, 0.45));
  assert.equal(m.eased(ice, 3).iceEvery, 0);
});

test('difficulty (a model): two falls on the rock still leave a careful climber time; three do not', () => {
  const rock = m.ROUTE.pitches[1];
  const careful = m.carefulSeconds(rock);
  const fallCost = m.ROUTE.fallSeconds + 2 * (2.8 + 2.2); // the hang, and two rows climbed again
  assert.ok(careful + 2 * fallCost <= rock.seconds, `${(careful + 2 * fallCost).toFixed(0)} of ${rock.seconds} s`);
  assert.ok(careful + 3 * fallCost > rock.seconds);
});
