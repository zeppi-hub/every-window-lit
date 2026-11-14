// The glass globe's way through the season (src/globe.ts), and the locks that wait on the climax's choice.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endingLights, giftDue, glassLiftable, lampHasGlass, NOTE_READ, restingAt, strikeKeeps, TOWN_AFTER_CALL, TOWN_NO_CALL, townDue, undecided } from '../src/globe.ts';
import { CLIMAX_WEEK, GLOBE_WEEK } from '../src/season/model.ts';
import { frameDue } from '../src/season/answers.ts';
import { stepOf } from '../src/line-queue.ts';
import { instructionLine } from '../src/season/lines.ts';
import { latchMove, leverMove } from '../src/week-locks.ts';

const facts = (over = {}) => ({ week: CLIMAX_WEEK, phase: 'sunday', open: true, chosen: 0, lamp: false, reply: false, last: false, aid: false, aidCardIn: false, hauling: false, conducting: false, boxIn: false, ...over });

test('the globe comes with the third morning, stays on the lamp, and is gone once sent', () => {
  assert.equal(restingAt(1, false), 'away');
  assert.equal(restingAt(GLOBE_WEEK, false), 'away');
  assert.equal(restingAt(GLOBE_WEEK + 1, false), 'lamp');
  assert.equal(restingAt(12, false), 'lamp');
  assert.equal(restingAt(12, true), 'gone');
  assert.equal(lampHasGlass('lamp'), true);
  for (const at of ['away', 'basket', 'sill', 'held', 'load', 'gone']) assert.equal(lampHasGlass(at), false, at);
});

test('the third morning: the basket comes before the bell, once', () => {
  assert.equal(giftDue(GLOBE_WEEK, false), true);
  assert.equal(giftDue(GLOBE_WEEK, true), false);
  assert.equal(giftDue(2, false), false);
  assert.equal(giftDue(4, false), false);
});

test("the town's basket waits for the climax's Sunday, the open shutters and the call, or a while", () => {
  assert.equal(townDue(CLIMAX_WEEK, true, true, false, TOWN_AFTER_CALL, 0), true);
  assert.equal(townDue(CLIMAX_WEEK, true, true, false, -1, TOWN_NO_CALL), true);
  assert.equal(townDue(CLIMAX_WEEK, true, true, false, -1, 1), false);
  assert.equal(townDue(CLIMAX_WEEK, false, true, false, TOWN_AFTER_CALL, 9), false);
  assert.equal(townDue(CLIMAX_WEEK, true, false, false, TOWN_AFTER_CALL, 9), false);
  assert.equal(townDue(CLIMAX_WEEK, true, true, true, TOWN_AFTER_CALL, 9), false);
  assert.equal(townDue(10, true, true, false, TOWN_AFTER_CALL, 9), false);
});

test('undecided, the latch refuses and says the choice; the box only goes home', () => {
  assert.equal(latchMove(facts({ undecided: true })), 'notYet');
  assert.equal(latchMove(facts({ undecided: true, boxIn: true })), 'wait');
  assert.equal(latchMove(facts({ undecided: false, lamp: true })), 'close');
  // Mid-week the latch still pauses as ever.
  assert.equal(latchMove(facts({ phase: 'days' })), 'close');
  // The basket on its way keeps them open.
  assert.equal(latchMove(facts({ undecided: false, hauling: true })), 'busy');
});

test('the match decides only with the note read and the glass on the lamp; a fingertip never does', () => {
  assert.equal(strikeKeeps(true, NOTE_READ, 'lamp'), true);
  assert.equal(strikeKeeps(false, NOTE_READ, 'lamp'), false);
  assert.equal(strikeKeeps(true, NOTE_READ - 1, 'lamp'), false);
  assert.equal(strikeKeeps(true, NOTE_READ, 'load'), false);
  assert.equal(strikeKeeps(true, NOTE_READ, 'held'), false);
});

test('the lever sends the glass only once it is in the basket', () => {
  assert.equal(leverMove(facts({ loaded: true })), 'send');
  assert.equal(leverMove(facts({ loaded: false })), 'idle');
});

test('the step waits for the note, then asks; decided, the lamp is next', () => {
  const step = (over) => stepOf({ week: CLIMAX_WEEK, phase: 'sunday', open: true, chosen: 0, visited: true, landedFor: 0, called: true, lamp: false, reply: false, look: false, quiet: false, choiceReady: false, box: -1, knocked: false, ...over });
  assert.equal(step({ glass: true, noteIn: false }), '');
  assert.equal(step({ glass: true, noteIn: true }), 'glass');
  assert.equal(step({ glass: true, noteIn: true, called: false }), 'glass');
  assert.equal(step({ glass: true, noteIn: false, called: false }), '');
  assert.equal(step({ glass: false }), 'lamp');
  assert.equal(instructionLine('glass', CLIMAX_WEEK, 12), 'Send the glass, or keep your light.');
});

test('only the climax waits on the glass', () => {
  assert.equal(undecided(CLIMAX_WEEK, true, false), true);
  assert.equal(undecided(CLIMAX_WEEK, true, true), false);
  assert.equal(undecided(CLIMAX_WEEK, false, false), false);
  assert.equal(undecided(12, true, false), false);
});

test('each ending lights differently first, and leaves its own trace', () => {
  assert.deepEqual(endingLights('town', true, false), { frame: true, candle: false, lamps: false });
  assert.deepEqual(endingLights('town', true, true), { frame: true, candle: true, lamps: false });
  assert.deepEqual(endingLights('window', false, false), { frame: false, candle: false, lamps: false });
  assert.deepEqual(endingLights('window', false, true), { frame: false, candle: false, lamps: true });
  assert.deepEqual(endingLights('both', true, false), { frame: true, candle: true, lamps: false });
  assert.deepEqual(endingLights('both', false, false), { frame: false, candle: false, lamps: true });
});

test("the frame's answer comes once, from week 7, before the town asks, only for a globe set by hand", () => {
  const town = (week, globePlaced) => ({ week, globePlaced });
  assert.equal(frameDue(town(7, true), false), true);
  assert.equal(frameDue(town(10, true), false), true);
  assert.equal(frameDue(town(6, true), false), false);
  assert.equal(frameDue(town(11, true), false), false);
  assert.equal(frameDue(town(8, false), false), false);
  assert.equal(frameDue(town(8, true), true), false);
});

test("the glass can be lifted only on the climax's Sunday, the town's basket up, nothing chosen: the lamp is then no fingertip's", () => {
  assert.equal(glassLiftable(11, true, false, 'town'), true);
  assert.equal(glassLiftable(11, true, true, 'town'), false, 'sent or kept');
  assert.equal(glassLiftable(11, false, false, 'town'), false, 'not Sunday');
  assert.equal(glassLiftable(11, true, false, 'none'), false, 'the basket not up');
  assert.equal(glassLiftable(3, true, false, 'town'), false, "the glass's own week");
  assert.equal(glassLiftable(12, true, false, 'town'), false, 'the last week');
});
