// What Tocco's panel shows, frame by frame (src/line-queue.ts, as ToccoSystem applies it): `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LINE_SECONDS, MIN_SECONDS, panelMove, stepOf } from '../src/line-queue.ts';

const FRAME = 1 / 72;

/**
 * Tocco's panel as ToccoSystem keeps it: what is up, the story lines waiting, and the step whose instruction has
 * been read. Each frame ticks the line up, then applies panelMove, as ToccoSystem.updatePanel does.
 */
function panel(persist) {
  return { persist, up: 'none', upStep: '', text: '', shownFor: 0, left: 0, lines: [], toldStep: '', shown: [] };
}

function say(p, text) {
  if (p.up !== 'none' || p.lines.length > 0) p.lines.push(text);
  else put(p, 'story', '', text, LINE_SECONDS);
}

/** A line said now, cutting in ahead of whatever is up (an answer, the rope's count). */
function interrupt(p, text) {
  p.lines.length = 0;
  put(p, 'story', '', text, LINE_SECONDS);
}

function put(p, up, step, text, left) {
  p.up = up;
  p.upStep = step;
  p.text = text;
  p.shownFor = 0;
  p.left = left;
}

/** One frame at time t: `step` and `instruction` are the week's as it stands, `holding` the box or Lina's answer. */
function frame(p, t, step, instruction, holding = false) {
  if (p.toldStep !== '' && p.toldStep !== step) p.toldStep = '';
  if (p.up !== 'none') {
    p.left -= FRAME;
    p.shownFor += FRAME;
    if (p.up === 'instruction' && p.upStep === step && (p.shownFor >= MIN_SECONDS || p.left <= 0)) p.toldStep = step;
  }
  const move = panelMove({
    up: p.up,
    upStep: p.upStep,
    shownFor: p.shownFor,
    left: p.left,
    waiting: p.lines.length,
    holding,
    step,
    instruction,
    persist: p.persist,
    told: p.toldStep !== '' && p.toldStep === step,
  });
  if (move === 'story') put(p, 'story', '', p.lines.shift(), LINE_SECONDS);
  if (move === 'instruction') put(p, 'instruction', step, instruction, p.persist ? Infinity : LINE_SECONDS);
  if (move === 'clear') put(p, 'none', '', '', 0);
  p.shown.push({ t, text: p.up === 'none' ? '' : p.text, up: p.up, step: p.upStep, weekStep: step });
}

/** Runs a script of the week: `at(t)` gives the step and its instruction, and may say lines; frames to `end`. */
function run(persist, end, at) {
  const p = panel(persist);
  for (let i = 0; i * FRAME <= end; i += 1) {
    const t = i * FRAME;
    const { step = '', instruction = '', holding = false } = at(t, p) ?? {};
    frame(p, t, step, instruction, holding);
  }
  return p.shown;
}

/** When a text was first up, and every stretch it stayed up: [from, to] in seconds. */
function stretches(shown, text) {
  const out = [];
  let from = -1;
  shown.forEach((f, i) => {
    const on = f.text === text;
    if (on && from < 0) from = f.t;
    if (!on && from >= 0) {
      out.push([from, shown[i - 1].t]);
      from = -1;
    }
  });
  if (from >= 0) out.push([from, shown[shown.length - 1].t]);
  return out;
}

test("in the first week an instruction is up from the frame its step starts to the frame it ends, and goes that frame", () => {
  // The rope rings at 2 s; three pulls by 9.5 s bring the basket up, and the card's line is said that frame.
  const shown = run(true, 14, (t, p) => {
    if (t >= 9.5) {
      if (p.cardSaid !== true) {
        p.cardSaid = true;
        say(p, 'card');
      }
      return {};
    }
    return t >= 2 ? { step: 'bell', instruction: 'pull' } : {};
  });
  const [[from, to], ...more] = stretches(shown, 'pull');
  assert.equal(more.length, 0);
  assert.ok(Math.abs(from - 2) < FRAME, `up at ${from}`);
  // Up well past LINE_SECONDS (it persists), and gone in the very frame the step ended, the card's line up instead.
  assert.ok(to < 9.5 && to > 9.5 - 2 * FRAME, `last up at ${to}`);
  const after = shown.find((f) => f.t >= 9.5);
  assert.equal(after.text, 'card');
});

test('story lines stay up at least MIN_SECONDS each, and go after LINE_SECONDS', () => {
  const shown = run(true, 20, (t, p) => {
    if (!p.started) {
      p.started = true;
      say(p, 'welcome');
      say(p, 'goal');
    }
    return {};
  });
  const [welcome] = stretches(shown, 'welcome');
  const [goal] = stretches(shown, 'goal');
  // The next line replaces it the frame it has been up MIN_SECONDS.
  assert.ok(goal[0] - welcome[0] >= MIN_SECONDS - 1e-9 && goal[0] - welcome[0] < MIN_SECONDS + 2 * FRAME, `welcome ${welcome}, goal from ${goal[0]}`);
  assert.ok(Math.abs(goal[1] - goal[0] - LINE_SECONDS) < 2 * FRAME, `goal ${goal}`);
});

test('a story line said as a step begins comes first, and the persisting instruction follows once it has been read', () => {
  // The choice at 1 s: "For Nora's family" is said and the lever's step begins; the lever pulled at 12 s.
  const shown = run(true, 14, (t, p) => {
    if (t >= 1 && !p.chose) {
      p.chose = true;
      say(p, 'for Nora');
    }
    if (t >= 12) return {};
    return t >= 1 ? { step: 'chosen', instruction: 'lever' } : {};
  });
  const [nora] = stretches(shown, 'for Nora');
  const [lever] = stretches(shown, 'lever');
  assert.ok(Math.abs(lever[0] - nora[0] - MIN_SECONDS) < 2 * FRAME, `lever from ${lever[0]}, Nora from ${nora[0]}`);
  assert.ok(lever[1] > 12 - 2 * FRAME && lever[1] < 12, `lever up to ${lever[1]}`);
});

test('a quick Keeper never sees the line of a step already done: the jar, a choice at once, the lever at once', () => {
  // The jar's line is up at 0 with the choosing step under way; the Keeper chooses at 1 s, before the choosing
  // instruction could come; then pulls the lever 0.5 s after its instruction is up; the basket's line follows.
  let leverUp = -1;
  const shown = run(true, 20, (t, p) => {
    if (!p.jar) {
      p.jar = true;
      say(p, 'jar');
    }
    if (t < 1) return { step: 'choosing', instruction: 'tap one' };
    if (!p.chose) {
      p.chose = true;
      say(p, 'for Nora');
    }
    if (leverUp < 0 && p.up === 'instruction' && p.upStep === 'chosen') leverUp = t;
    if (leverUp >= 0 && t >= leverUp + 0.5) {
      if (!p.lowered) {
        p.lowered = true;
        say(p, 'down it goes');
      }
      return {};
    }
    return { step: 'chosen', instruction: 'lever' };
  });
  assert.deepEqual(stretches(shown, 'tap one'), [], 'the choosing instruction never shows');
  const [jar] = stretches(shown, 'jar');
  const [nora] = stretches(shown, 'for Nora');
  assert.ok(nora[0] - jar[0] >= MIN_SECONDS - FRAME, `the choice's line waits for the jar's to be read: ${jar} then ${nora}`);
  const [lever] = stretches(shown, 'lever');
  assert.ok(Math.abs(lever[0] - nora[0] - MIN_SECONDS) < 2 * FRAME);
  // The lever pulled: its instruction goes the same frame, the basket's line up in its place.
  const [down] = stretches(shown, 'down it goes');
  assert.ok(Math.abs(down[0] - lever[1] - FRAME) < FRAME / 2, `lever up to ${lever[1]}, the basket's line from ${down[0]}`);
  // Nothing of a finished step anywhere: every instruction up belongs to the step the week is in.
  for (const f of shown) if (f.up === 'instruction') assert.equal(f.step, f.weekStep, `at ${f.t.toFixed(2)} s`);
});

test("in the first week a line said meanwhile waits for the instruction to be read, then the instruction comes back; a cut-in line goes up at once", () => {
  const shown = run(true, 20, (t, p) => {
    if (t >= 1 && !p.a) {
      p.a = true;
      say(p, 'a live line');
    }
    if (t >= 12 && !p.b) {
      p.b = true;
      interrupt(p, 'Good. Two more.');
    }
    return { step: 'bell', instruction: 'pull' };
  });
  const pulls = stretches(shown, 'pull');
  const [live] = stretches(shown, 'a live line');
  const [count] = stretches(shown, 'Good. Two more.');
  assert.ok(Math.abs(live[0] - MIN_SECONDS) < 2 * FRAME, `the live line from ${live[0]}`);
  assert.ok(Math.abs(pulls[1][0] - live[0] - MIN_SECONDS) < 2 * FRAME, `back at ${pulls[1][0]}`);
  assert.ok(Math.abs(count[0] - 12) < 2 * FRAME, `the count at ${count[0]}`);
  assert.ok(Math.abs(pulls[2][0] - count[0] - MIN_SECONDS) < 2 * FRAME, `back again at ${pulls[2][0]}`);
});

test('held (the family box in, or Lina answering), the instruction goes down and comes back once the hold ends', () => {
  const shown = run(true, 12, (t) => ({ step: 'sun', instruction: 'tap the sun', holding: t >= 3 && t < 8 }));
  const ups = stretches(shown, 'tap the sun');
  assert.equal(ups.length, 2);
  assert.ok(ups[0][1] < 3 && ups[1][0] >= 8 && ups[1][0] < 8 + 2 * FRAME, JSON.stringify(ups));
});

test('from the second week an instruction is said once for LINE_SECONDS, comes back only if it went unread, and goes when its step ends', () => {
  // Said once, not back after a story line.
  let shown = run(false, 20, (t, p) => {
    if (t >= 9 && !p.a) {
      p.a = true;
      say(p, 'an answer');
    }
    return { step: 'bell', instruction: 'hear the bell' };
  });
  let ups = stretches(shown, 'hear the bell');
  assert.equal(ups.length, 1);
  assert.ok(Math.abs(ups[0][1] - ups[0][0] - LINE_SECONDS) < 2 * FRAME, JSON.stringify(ups));
  // Taken down unread by the box at 2 s: back once it has gone.
  shown = run(false, 20, (t) => ({ step: 'visit', instruction: "Nora's window", holding: t >= 2 && t < 5 }));
  ups = stretches(shown, "Nora's window");
  assert.equal(ups.length, 2, JSON.stringify(ups));
  // Its step done at 3 s: gone that frame, even with time left.
  shown = run(false, 10, (t) => (t < 3 ? { step: 'choosing', instruction: 'pick one' } : {}));
  ups = stretches(shown, 'pick one');
  assert.ok(ups[0][1] < 3 && ups[0][1] > 3 - 2 * FRAME, JSON.stringify(ups));
});

const facts = (over) => ({ week: 1, phase: 'shut', open: false, chosen: -1, visited: false, called: true, lamp: false, reply: false, quiet: false, choiceReady: true, ...over });

test('the step comes from the week as it stands', () => {
  assert.equal(stepOf(facts({})), 'latch');
  assert.equal(stepOf(facts({ phase: 'morning', open: true })), '');
  assert.equal(stepOf(facts({ phase: 'bell', open: true })), 'bell');
  assert.equal(stepOf(facts({ phase: 'rising', open: true })), '');
  assert.equal(stepOf(facts({ phase: 'choosing', open: true })), 'choosing');
  assert.equal(stepOf(facts({ phase: 'choosing', open: true, chosen: 1 })), 'chosen');
  // The first week's card and jar come first: no instruction until the third step, unless the Keeper chooses first.
  assert.equal(stepOf(facts({ phase: 'choosing', open: true, choiceReady: false })), '');
  assert.equal(stepOf(facts({ phase: 'choosing', open: true, choiceReady: false, chosen: 0 })), 'chosen');
  assert.equal(stepOf(facts({ phase: 'lowering', open: true, chosen: 1 })), '');
  assert.equal(stepOf(facts({ phase: 'landed', open: true })), 'model');
  assert.equal(stepOf(facts({ phase: 'landed', open: true, week: 2 })), 'visit');
  assert.equal(stepOf(facts({ phase: 'landed', open: true, visited: true })), 'sun');
  assert.equal(stepOf(facts({ phase: 'days', open: true })), 'sunOn');
  assert.equal(stepOf(facts({ phase: 'sunday', open: true, week: 3, called: false })), '');
  assert.equal(stepOf(facts({ phase: 'sunday', open: true })), 'lamp');
  assert.equal(stepOf(facts({ phase: 'sunday', open: true, lamp: true, reply: true })), '');
  assert.equal(stepOf(facts({ phase: 'sunday', open: true, lamp: true })), 'close');
  // A solidarity week: Tocco is quiet, no step of his.
  assert.equal(stepOf(facts({ phase: 'bell', open: true, week: 8, quiet: true })), '');
});
