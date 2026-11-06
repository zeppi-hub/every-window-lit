// The first week's choice in three steps (src/choice-moment.ts): the card alone, then the jar, then the three things,
// each at least 4 s, with Tocco's panel following them (src/line-queue.ts, as ToccoSystem applies it). `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_SECONDS, choiceStep, JAR_SECONDS, jarDots, jarShown, tagsUp, thingsOpen } from '../src/choice-moment.ts';
import { LINE_SECONDS, MIN_SECONDS, panelMove, stepOf } from '../src/line-queue.ts';
import { FIRST_WEEK, instructionLine, jarLine } from '../src/season/lines.ts';
import { COST, JAR_START } from '../src/season/model.ts';

const FRAME = 1 / 72;

test('the first week: the card alone, then the jar, then the three things, each step at least 4 s', () => {
  assert.ok(CARD_SECONDS >= MIN_SECONDS && JAR_SECONDS >= MIN_SECONDS);
  assert.equal(choiceStep(1, 'bell', 0, -1, false), '');
  assert.equal(choiceStep(1, 'rising', 0, -1, false), 'card');
  assert.equal(choiceStep(1, 'rising', 1.7, -1, false), 'card');
  // Counted from the basket standing on the sill, as the card's line goes up (Devir 1b section 4: 0:29, 0:33.5, 0:38).
  assert.equal(choiceStep(1, 'choosing', 0, -1, false), 'card');
  assert.equal(choiceStep(1, 'choosing', CARD_SECONDS - 0.01, -1, false), 'card');
  assert.equal(choiceStep(1, 'choosing', CARD_SECONDS, -1, false), 'jar');
  assert.equal(choiceStep(1, 'choosing', CARD_SECONDS + JAR_SECONDS - 0.01, -1, false), 'jar');
  assert.equal(choiceStep(1, 'choosing', CARD_SECONDS + JAR_SECONDS, -1, false), 'choose');
  assert.equal(choiceStep(1, 'choosing', 60, -1, false), 'choose');
  // A Keeper who taps one before being asked has reached the choice.
  assert.equal(choiceStep(1, 'choosing', 0.5, 1, false), 'choose');
  assert.equal(choiceStep(1, 'lowering', 0, 1, false), '');
  assert.deepEqual(['', 'card', 'jar', 'choose'].map(jarShown), [false, false, true, true]);
});

test('from the second week, and in a solidarity week, everything comes at once as the basket lands', () => {
  for (const n of [2, 5, 12]) {
    assert.equal(choiceStep(n, 'rising', 0, -1, false), '');
    assert.equal(choiceStep(n, 'choosing', 0, -1, false), 'choose');
  }
  assert.equal(choiceStep(1, 'choosing', 0, -1, true), 'choose');
});

test("the tags and the jar's dots are up only in the first week's choice, never in a solidarity week", () => {
  const phases = ['shut', 'morning', 'bell', 'rising', 'choosing', 'lowering', 'landed', 'days', 'sunday'];
  for (const n of [1, 2, 5, 12]) {
    for (const phase of phases) {
      assert.equal(tagsUp(n, phase, false), n === 1 && phase === 'choosing', `week ${n}, ${phase}`);
      assert.equal(tagsUp(n, phase, true), false, `week ${n}, ${phase}, solidarity`);
    }
  }
});

test("the jar's dots are its balance, less what the thing in the basket costs", () => {
  assert.equal(JAR_START, 5);
  assert.equal(jarDots(5, 0), 5);
  assert.deepEqual([0, 1, 2].map((i) => jarDots(5, COST[i])), [2, 4, 3]);
  assert.equal(jarDots(1, 3), 0);
  assert.equal(jarLine(JAR_START), 'Your jar: 5 coins. One more comes each week.');
});

test("Tocco's panel follows the steps: the card's line, the jar's, then the choosing instruction, each up at least 4 s", () => {
  // As ToccoSystem: nothing is up as the basket rises (BasketSystem: up, then the swing in, 0.9 s each), the card's
  // line cuts in once it stands on the sill; the jar's is said as its step comes; the instruction is the 'choosing'
  // step's, which waits for the third step.
  const RISE = 2 * 0.9;
  const p = { up: 'none', upStep: '', text: '', shownFor: 0, left: 0, lines: [], toldStep: '' };
  const put = (up, step, text, left) => Object.assign(p, { up, upStep: step, text, shownFor: 0, left });
  const shown = [];
  let last = '';
  let lastChoice = '';
  let timer = 0;
  let phase = 'rising';
  for (let t = 0; t < 16; t += FRAME) {
    if (phase === 'rising' && t >= RISE) {
      phase = 'choosing';
      timer = 0;
      put('story', '', FIRST_WEEK.card, LINE_SECONDS);
    }
    const choice = choiceStep(1, phase, timer, -1, false);
    if (choice === 'jar' && lastChoice === 'card') {
      if (p.up !== 'none' || p.lines.length > 0) p.lines.push(jarLine(JAR_START));
      else put('story', '', jarLine(JAR_START), LINE_SECONDS);
    }
    lastChoice = choice;
    const step = stepOf({ week: 1, phase, open: true, chosen: -1, visited: false, called: true, lamp: false, reply: false, quiet: false, choiceReady: choice === 'choose' });
    const instruction = step === '' ? '' : instructionLine(step, 1, 12);
    if (p.up !== 'none') {
      p.left -= FRAME;
      p.shownFor += FRAME;
    }
    const move = panelMove({ up: p.up, upStep: p.upStep, shownFor: p.shownFor, left: p.left, waiting: p.lines.length, holding: false, step, instruction, persist: true, told: false });
    if (move === 'story') put('story', '', p.lines.shift(), LINE_SECONDS);
    if (move === 'instruction') put('instruction', step, instruction, Infinity);
    if (move === 'clear') put('none', '', '', 0);
    if (p.text !== last) {
      shown.push({ t, text: p.text });
      last = p.text;
    }
    timer += FRAME;
  }
  assert.deepEqual(
    shown.map((s) => s.text),
    [FIRST_WEEK.card, jarLine(JAR_START), FIRST_WEEK.choosing],
  );
  const [card, jar, choose] = shown.map((s) => s.t);
  assert.ok(jar - card >= MIN_SECONDS && choose - jar >= MIN_SECONDS, `card ${card.toFixed(2)}, jar ${jar.toFixed(2)}, choose ${choose.toFixed(2)}`);
  assert.ok(Math.abs(card - RISE) < 2 * FRAME, `the card's line at ${card.toFixed(2)} s, as the basket stands on the sill`);
  assert.ok(Math.abs(jar - card - CARD_SECONDS) < 2 * FRAME && Math.abs(choose - card - CARD_SECONDS - JAR_SECONDS) < 2 * FRAME);
});

test('in the first week the three things cannot be taken during the card or the jar, so the jar line is never skipped', () => {
  const open = (n, phase, timer, chosen = -1, aid = false) => thingsOpen(choiceStep(n, phase, timer, chosen, aid));
  // The whole of the card's and the jar's steps, frame by frame; the first frame of the third step opens them.
  for (let timer = 0; timer < CARD_SECONDS + JAR_SECONDS; timer += FRAME) assert.equal(open(1, 'choosing', timer), false, `${timer.toFixed(2)} s into the choice`);
  assert.equal(open(1, 'choosing', CARD_SECONDS + JAR_SECONDS), true);
  // Nor while the basket comes up, nor outside the choice.
  assert.equal(open(1, 'rising', 0.5), false);
  assert.equal(open(1, 'bell', 0), false);
  assert.equal(open(1, 'lowering', 0.5, 1), false);
  // Something in the basket can come out again.
  assert.equal(open(1, 'choosing', 12, 1), true);
  // From the second week, and in a solidarity week, they can be taken as soon as the choice is on.
  assert.equal(open(2, 'choosing', 0), true);
  assert.equal(open(7, 'choosing', 0), true);
  assert.equal(open(1, 'choosing', 0, -1, true), true);
});
