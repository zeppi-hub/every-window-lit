// Lina's window across the square: one light pattern, its states and brightness through a week. `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANSWER_HOLD,
  ANSWER_RISE,
  ANSWER_SETTLE,
  ANSWERED,
  DIM,
  FAREWELL_AFTER,
  FAREWELL_SECONDS,
  GREET_AFTER,
  GREET_SECONDS,
  HELPED,
  INVITE,
  INVITE_RISE,
  PEAK,
  REPLY_LOOK_DEGREES,
  replyCallAt,
  replyHolds,
  replyStep,
  replyWait,
  REST,
  windowLevel,
  windowState,
} from '../src/season/window-light.ts';

/** A week's moment, open shutters on a calm day unless told otherwise. */
const at = (phase, more = {}) => ({
  phase,
  timer: 10,
  open: true,
  aid: false,
  chosen: -1,
  visited: false,
  helped: false,
  evening: 0,
  lamp: false,
  answered: -1,
  kept: -1,
  ...more,
});
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not ${b}`);

test('a week of states in order: dark, rest, greet, rest, dim, rest, invite, rest, answer, farewell, dark', () => {
  const steps = [
    [at('shut', { open: false }), 'dark'],
    [at('morning', { timer: 1 }), 'rest'],
    [at('morning', { timer: GREET_AFTER + 0.1 }), 'greet'],
    [at('morning', { timer: GREET_AFTER + GREET_SECONDS + 0.1 }), 'rest'],
    [at('bell'), 'rest'],
    [at('rising', { timer: 0.2 }), 'dim'],
    [at('choosing'), 'dim'],
    [at('choosing', { chosen: 1 }), 'rest'],
    [at('lowering', { chosen: 1 }), 'rest'],
    [at('landed', { chosen: 1, timer: 0.5 }), 'invite'],
    [at('landed', { chosen: 1, visited: true }), 'rest'],
    [at('days', { chosen: 1, visited: true }), 'rest'],
    [at('sunday', { chosen: 1 }), 'rest'],
    [at('sunday', { chosen: 1, lamp: true }), 'rest'],
    [at('sunday', { chosen: 1, lamp: true, answered: 0.2 }), 'answer'],
    [at('shut', { open: false, kept: FAREWELL_AFTER + 0.1 }), 'farewell'],
    [at('shut', { open: false, kept: FAREWELL_AFTER + FAREWELL_SECONDS + 0.1 }), 'dark'],
  ];
  for (const [facts, state] of steps) assert.equal(windowState(facts), state, `${facts.phase} ${JSON.stringify(facts)}`);
});

test('steady levels: rest about 0.35, dimmed about 0.2 while the card is up, back to rest once something is in the basket', () => {
  near(windowLevel(at('bell')), REST);
  near(REST, 0.35);
  near(windowLevel(at('rising')), DIM);
  near(DIM, 0.2);
  near(windowLevel(at('choosing')), DIM);
  near(windowLevel(at('choosing', { chosen: 0 })), REST);
  near(windowLevel(at('shut', { open: false })), 0);
});

test('the greeting rises and falls twice, from rest, starting 2 s after the shutters open', () => {
  const level = (t) => windowLevel(at('morning', { timer: GREET_AFTER + t }));
  near(level(0), REST);
  near(level(GREET_SECONDS / 4), PEAK);
  near(level(GREET_SECONDS / 2), REST);
  near(level((3 * GREET_SECONDS) / 4), PEAK);
  near(level(GREET_SECONDS - 1e-6), REST, 1e-6);
  // Counted in rises above rest: two peaks over the greeting.
  let peaks = 0;
  let last = level(0);
  let rising = false;
  for (let t = 0.01; t < GREET_SECONDS; t += 0.01) {
    const now = level(t);
    if (now < last && rising) peaks += 1;
    rising = now > last;
    last = now;
  }
  assert.equal(peaks, 2);
  // Before it, rest.
  near(windowLevel(at('morning', { timer: GREET_AFTER - 0.5 })), REST);
});

test('the invitation rises after the landing and waits there, breathing a little, until the family is visited', () => {
  const start = windowLevel(at('landed', { timer: 0 }));
  near(start, REST);
  for (let t = INVITE_RISE; t < 30; t += 0.37) {
    const level = windowLevel(at('landed', { timer: t }));
    assert.ok(level > INVITE - 0.06 && level < INVITE + 0.06, `${level} at ${t}`);
  }
  near(windowLevel(at('landed', { timer: 20, visited: true })), REST);
});

test('the answer rises to full, holds, then settles warm until the shutters close', () => {
  const level = (t) => windowLevel(at('sunday', { lamp: true, answered: t }));
  near(level(0), REST);
  near(level(ANSWER_RISE), PEAK);
  near(level(ANSWER_RISE + ANSWER_HOLD - 0.01), PEAK);
  near(level(ANSWER_RISE + ANSWER_HOLD + ANSWER_SETTLE), ANSWERED);
  near(level(120), ANSWERED);
  // Lit but not yet answered: still resting.
  near(windowLevel(at('sunday', { lamp: true })), REST);
});

test('the farewell blinks twice from dark as the shutters close on a kept week, then the window is dark', () => {
  const level = (t) => windowLevel(at('shut', { open: false, kept: FAREWELL_AFTER + t }));
  near(windowLevel(at('shut', { open: false, kept: 0.5 })), 0);
  near(level(FAREWELL_SECONDS / 4), PEAK);
  near(level(FAREWELL_SECONDS / 2), 0);
  near(level((3 * FAREWELL_SECONDS) / 4), PEAK);
  near(level(FAREWELL_SECONDS + 0.2), 0);
  // Shutters closed in the middle of a week: no farewell.
  near(windowLevel(at('days', { open: false })), 0);
});

test('a helped week keeps its warm evenings, about 0.45 of the evening, Days and Sunday, joined with rest by the larger', () => {
  const helped = { chosen: 1, visited: true, helped: true };
  near(windowLevel(at('days', { ...helped, evening: 1 })), HELPED);
  near(HELPED, 0.45);
  // Early evening, 0.45 x 0.5 is under rest: rest wins.
  near(windowLevel(at('days', { ...helped, evening: 0.5 })), REST);
  near(windowLevel(at('days', { ...helped, evening: 0.9 })), Math.max(REST, HELPED * 0.9));
  near(windowLevel(at('sunday', { ...helped, evening: 1 })), HELPED);
  // The answer outshines it while it holds, and settles above it.
  near(windowLevel(at('sunday', { ...helped, evening: 1, lamp: true, answered: ANSWER_RISE + 0.5 })), PEAK);
  assert.ok(windowLevel(at('sunday', { ...helped, evening: 1, lamp: true, answered: 60 })) >= HELPED);
  // Not before the evenings begin, not in a week not helped, not with the shutters closed.
  near(windowLevel(at('landed', { ...helped, evening: 1 })), REST);
  near(windowLevel(at('days', { chosen: 0, visited: true, evening: 1 })), REST);
  near(windowLevel(at('days', { ...helped, evening: 1, open: false })), 0);
});

test('a solidarity week only rests: no greeting, no dimming, no invitation, no farewell', () => {
  const aid = { aid: true };
  assert.equal(windowState(at('morning', { ...aid, timer: GREET_AFTER + 0.5 })), 'rest');
  assert.equal(windowState(at('rising', aid)), 'rest');
  assert.equal(windowState(at('landed', { ...aid, timer: 3 })), 'rest');
  assert.equal(windowState(at('shut', { ...aid, open: false, kept: FAREWELL_AFTER + 0.3 })), 'dark');
  // And no helped evening: nothing is chosen for the family that week.
  near(windowLevel(at('days', { ...aid, chosen: 1, helped: true, evening: 1 })), REST);
});

test("Lina's answer: the first week waits at most 12 s and calls at 6 s, later weeks at most 6 s", () => {
  assert.equal(replyWait(1), 12);
  assert.equal(replyCallAt(1), 6);
  assert.equal(replyWait(2), 6);
  assert.equal(replyWait(11), 6);
  const away = 50;
  assert.equal(replyStep(0, 1, away), 'wait');
  assert.equal(replyStep(5.9, 1, away), 'wait');
  assert.equal(replyStep(6, 1, away), 'call');
  assert.equal(replyStep(11.9, 1, away), 'call');
  // Never a trap: the answer comes by itself.
  assert.equal(replyStep(12, 1, away), 'answer');
  assert.equal(replyStep(6, 2, away), 'answer');
  assert.equal(replyStep(3, 2, away), 'call');
});

test("Lina's answer comes as soon as the head turns within 20 degrees of her window", () => {
  assert.equal(REPLY_LOOK_DEGREES, 20);
  assert.equal(replyStep(0.1, 1, 20), 'answer');
  assert.equal(replyStep(0.1, 1, 9.7), 'answer');
  assert.equal(replyStep(0.1, 1, 20.5), 'wait');
  assert.equal(replyStep(7, 1, 19), 'answer');
});

test("every Sunday's lamp waits for her answer except the season's last, which starts the last night; a solidarity week has no lamp", () => {
  for (let week = 1; week < 12; week += 1) assert.equal(replyHolds(week, 12, false), true);
  assert.equal(replyHolds(12, 12, false), false);
  assert.equal(replyHolds(5, 12, true), false);
});
