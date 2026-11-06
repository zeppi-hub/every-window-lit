// What the latch, the rope and the brake lever do when touched (src/week-locks.ts, as BasketSystem applies it), and
// how quickly the rope's hauls may follow each other (src/signals.ts): `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latchMove, leverFree, leverMove, PULLS, pullPitch, ropeMove } from '../src/week-locks.ts';

const PHASES = ['shut', 'morning', 'bell', 'rising', 'choosing', 'lowering', 'landed', 'days', 'sunday'];
const MID_WEEK = ['morning', 'bell', 'rising', 'choosing', 'lowering', 'landed', 'days'];

function week(overrides = {}) {
  return { week: 1, phase: 'shut', open: false, chosen: -1, lamp: false, reply: false, aid: false, aidCardIn: false, hauling: false, conducting: false, boxIn: false, ...overrides };
}

test('in the first week the latch opens the shutters, and closes them only once Lina has answered the lamp', () => {
  assert.equal(latchMove(week()), 'open');
  for (const phase of MID_WEEK) assert.equal(latchMove(week({ phase, open: true })), 'notYet', phase);
  assert.equal(latchMove(week({ phase: 'sunday', open: true })), 'notYet', 'Sunday before the lamp');
  assert.equal(latchMove(week({ phase: 'sunday', open: true, lamp: true, reply: true })), 'reply', 'the town waits for her answer');
  assert.equal(latchMove(week({ phase: 'sunday', open: true, lamp: true })), 'close');
});

test("with the family's box in, the first week's latch only sends it home: no \"Not yet\", nothing to read as a mistake", () => {
  for (const phase of ['landed', 'days']) {
    assert.equal(latchMove(week({ phase, open: true, boxIn: true })), 'wait', phase);
    assert.equal(latchMove(week({ phase, open: true })), 'notYet', `${phase}, the box home again`);
  }
  assert.equal(latchMove(week({ phase: 'sunday', open: true, boxIn: true })), 'wait', 'Sunday before the lamp');
  // The rest of the latch does as it did.
  assert.equal(latchMove(week({ phase: 'sunday', open: true, lamp: true, reply: true, boxIn: true })), 'reply');
  assert.equal(latchMove(week({ phase: 'sunday', open: true, lamp: true, boxIn: true })), 'close');
  assert.equal(latchMove(week({ boxIn: true })), 'open');
  // Only the first week: later the latch pauses the week, box or no box.
  assert.equal(latchMove(week({ week: 2, phase: 'landed', open: true, boxIn: true })), 'close');
});

test('from the second week the latch works as it did: it pauses the week, and the basket and Lina come first', () => {
  for (const n of [2, 7, 12]) {
    for (const phase of ['morning', 'bell', 'landed', 'days']) assert.equal(latchMove(week({ week: n, phase, open: true })), 'close', `${phase}, week ${n}`);
    for (const phase of ['rising', 'choosing', 'lowering']) assert.equal(latchMove(week({ week: n, phase, open: true })), 'busy', `${phase}, week ${n}`);
    assert.equal(latchMove(week({ week: n, phase: 'sunday', open: true })), 'close', `Sunday without the lamp, week ${n}`);
    assert.equal(latchMove(week({ week: n, phase: 'sunday', open: true, lamp: true, reply: true })), 'reply');
    assert.equal(latchMove(week({ week: n, phase: 'sunday', open: true, lamp: true, conducting: true })), 'hurry');
    assert.equal(latchMove(week({ week: n, phase: 'landed', open: true, hauling: true })), 'busy', 'the second basket on its way');
    assert.equal(latchMove(week({ week: n })), 'open');
  }
  assert.equal(latchMove(week({ week: 5, phase: 'sunday', open: true, aid: true })), 'wait', 'the solidarity week waits for its card');
  assert.equal(latchMove(week({ week: 5, phase: 'sunday', open: true, aid: true, aidCardIn: true })), 'close');
});

test("the season's last Sunday cannot be closed before its lamp: the last night is never skipped", () => {
  const last = { week: 12, last: true, phase: 'sunday', open: true };
  assert.equal(latchMove(week(last)), 'notYet', 'no lamp: the shutters stay open');
  assert.equal(latchMove(week({ ...last, boxIn: true })), 'wait', "the box goes home first, nothing said");
  // Lit, the night goes on as it did.
  assert.equal(latchMove(week({ ...last, lamp: true, reply: true })), 'reply');
  assert.equal(latchMove(week({ ...last, lamp: true, conducting: true })), 'hurry');
  assert.equal(latchMove(week({ ...last, lamp: true })), 'close');
  // Earlier in that week the latch still pauses it, and a closed window still opens.
  assert.equal(latchMove(week({ ...last, phase: 'days' })), 'close');
  assert.equal(latchMove(week({ ...last, open: false })), 'open');
  // Weeks 2 to 11 close on Sunday without the lamp as they did, and the solidarity week keeps its own rule.
  for (let n = 2; n < 12; n += 1) assert.equal(latchMove(week({ week: n, phase: 'sunday', open: true })), 'close', `week ${n}`);
  assert.equal(latchMove(week({ week: 8, phase: 'sunday', open: true, aid: true })), 'wait');
  assert.equal(latchMove(week({ week: 8, phase: 'sunday', open: true, aid: true, aidCardIn: true })), 'close');
});

test('the rope counts only after the bell, with the shutters open; each haul sounds higher than the last', () => {
  for (const n of [1, 2]) {
    for (const phase of PHASES) {
      for (const open of [true, false]) assert.equal(ropeMove(week({ week: n, phase, open })), phase === 'bell' && open ? 'pull' : 'wrong', `${phase} ${open}`);
    }
  }
  assert.equal(PULLS, 3);
  const pitches = [1, 2, 3].map(pullPitch);
  assert.ok(pitches[0] < pitches[1] && pitches[1] < pitches[2], pitches.join(' '));
});

test('in the first week the lever never sends the basket down empty, and does not move until something is in it', () => {
  // Every phase, nothing chosen: never lowered.
  for (const phase of PHASES) {
    for (const open of [true, false]) {
      const move = leverMove(week({ phase, open }));
      assert.notEqual(move, 'lower', phase);
      assert.equal(move, phase === 'choosing' && open ? 'empty' : 'wrong', phase);
      assert.equal(leverFree(week({ phase, open })), false, phase);
    }
  }
  for (const chosen of [0, 1, 2]) {
    assert.equal(leverMove(week({ phase: 'choosing', open: true, chosen })), 'lower');
    assert.equal(leverFree(week({ phase: 'choosing', open: true, chosen })), true);
  }
  assert.equal(leverMove(week({ phase: 'landed', open: true, chosen: 1 })), 'wrong', 'out of turn, with the basket down');
});

test('from the second week the lever sends the basket down empty too, and out of turn only swings', () => {
  assert.equal(leverMove(week({ week: 2, phase: 'choosing', open: true })), 'lower');
  assert.equal(leverMove(week({ week: 2, phase: 'choosing', open: true, chosen: 0 })), 'lower');
  for (const phase of ['morning', 'bell', 'landed', 'sunday']) assert.equal(leverMove(week({ week: 2, phase, open: true })), 'idle', phase);
  for (const phase of PHASES) assert.equal(leverFree(week({ week: 3, phase, open: true })), true, phase);
  // A solidarity week is never held to the first week's locks.
  assert.equal(leverMove(week({ week: 1, aid: true, phase: 'choosing', open: true })), 'lower');
});

test("the first week's typical path: each touch out of turn is refused aloud, and the week still ends", () => {
  // The Keeper tries the lever and the latch at every turn of the week before doing the right thing.
  let f = week();
  const said = [];
  const touch = (thing) => {
    const move = thing === 'latch' ? latchMove(f) : thing === 'lever' ? leverMove(f) : ropeMove(f);
    said.push(`${f.phase}:${thing}:${move}`);
    return move;
  };
  assert.equal(touch('rope'), 'wrong');
  assert.equal(touch('lever'), 'wrong');
  assert.equal(touch('latch'), 'open');
  f = { ...f, open: true, phase: 'morning' };
  assert.equal(touch('latch'), 'notYet');
  f = { ...f, phase: 'bell' };
  for (let i = 0; i < PULLS; i += 1) assert.equal(touch('rope'), 'pull');
  f = { ...f, phase: 'choosing' };
  assert.equal(touch('lever'), 'empty');
  assert.equal(touch('latch'), 'notYet');
  f = { ...f, chosen: 1 };
  assert.equal(touch('lever'), 'lower');
  for (const phase of ['lowering', 'landed', 'days', 'sunday']) {
    f = { ...f, phase };
    assert.equal(touch('latch'), 'notYet', phase);
    assert.equal(touch('rope'), 'wrong', phase);
  }
  f = { ...f, lamp: true, reply: true };
  assert.equal(touch('latch'), 'reply');
  f = { ...f, reply: false };
  assert.equal(touch('latch'), 'close');
});

test("three hauls 0.35 s apart all count, a brush inside 0.3 s does not, and each counted haul is announced", async () => {
  let clock = 0;
  const real = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });
  try {
    const { emitSignal, onSignal } = await import('../src/signals.ts');
    let hauls = 0;
    let announced = 0;
    let latches = 0;
    const off = [
      onSignal('rope', () => {
        hauls += 1;
        emitSignal('pulled');
      }),
      onSignal('pulled', () => (announced += 1)),
      onSignal('latch', () => (latches += 1)),
    ];
    clock = 10_000;
    for (const at of [0, 350, 700]) {
      clock = 10_000 + at;
      emitSignal('rope');
    }
    assert.equal(hauls, 3);
    assert.equal(announced, 3);
    // A second touch 0.2 s after the last: the same haul, dropped.
    clock += 200;
    emitSignal('rope');
    assert.equal(hauls, 3);
    // The latch keeps its half second.
    clock = 20_000;
    emitSignal('latch');
    clock += 350;
    emitSignal('latch');
    assert.equal(latches, 1);
    for (const f of off) f();
  } finally {
    Object.defineProperty(globalThis, 'performance', { value: real, configurable: true, writable: true });
  }
});
