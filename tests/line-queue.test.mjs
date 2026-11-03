// What Tocco's panel shows, frame by frame (src/line-queue.ts, as ToccoSystem applies it): `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARRIVAL_HOME, BOX_READ_SECONDS, boxGoesHome, familyDone, familyLineNow, heldLine, KNOCK_HOME, LINA_SECONDS, LINE_SECONDS, MIN_SECONDS, MODEL_SECONDS, panelMove, pokeBack, stepOf } from '../src/line-queue.ts';

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

const facts = (over) => ({ week: 1, phase: 'shut', open: false, chosen: -1, visited: false, landedFor: 0, called: true, lamp: false, reply: false, quiet: false, choiceReady: true, ...over });

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
  // The first week's look across, once due (season/window-light.ts lookLineDue); gone with her answer.
  assert.equal(stepOf(facts({ phase: 'sunday', open: true, lamp: true, reply: true, look: true })), 'look');
  assert.equal(stepOf(facts({ phase: 'sunday', open: true, lamp: true, reply: false, look: true })), 'close');
  assert.equal(stepOf(facts({ phase: 'sunday', open: true, lamp: true })), 'close');
  // A solidarity week: Tocco is quiet, no step of his.
  assert.equal(stepOf(facts({ phase: 'bell', open: true, week: 8, quiet: true })), '');
});

test("in the first week Nora's house on the model gives way to the sun after 30 s unvisited; later her window waits", () => {
  assert.equal(MODEL_SECONDS, 30);
  const landed = (week, landedFor, visited = false) => stepOf(facts({ phase: 'landed', open: true, week, landedFor, visited }));
  assert.equal(landed(1, 0), 'model');
  assert.equal(landed(1, MODEL_SECONDS - FRAME), 'model');
  assert.equal(landed(1, MODEL_SECONDS), 'sun');
  assert.equal(landed(1, 5, true), 'sun');
  // From the second week her window waits for the Keeper, however long.
  assert.equal(landed(2, 300), 'visit');
  assert.equal(landed(2, 300, true), 'sun');
  assert.equal(familyDone(1, MODEL_SECONDS, false), true);
  assert.equal(familyDone(1, MODEL_SECONDS - FRAME, false), false);
  assert.equal(familyDone(4, 1000, false), false);
});

test("the first week's look across goes up while the town waits for Lina's answer; his story lines still wait", () => {
  const base = { up: 'none', upStep: '', shownFor: 0, left: 0, waiting: 0, holding: true, step: 'look', instruction: 'Look across the square.', persist: true, told: false };
  // Held by the wait, as any other line is, unless it is the look across.
  assert.equal(panelMove({ ...base }), 'keep');
  assert.equal(panelMove({ ...base, through: true }), 'instruction');
  // Up through the hold, it stays; a story line waiting meanwhile does not take its place.
  const up = { ...base, through: true, up: 'instruction', upStep: 'look', shownFor: 5, left: Infinity };
  assert.equal(panelMove(up), 'keep');
  assert.equal(panelMove({ ...up, waiting: 1 }), 'keep');
  // She answers: the wait ends, the step is the close; what the lamp had to say comes first, then the close.
  const answered = { ...up, holding: false, through: false, step: 'close', instruction: 'Slide the latch to close the week.', waiting: 1 };
  assert.equal(panelMove(answered), 'story');
  assert.equal(panelMove({ ...answered, waiting: 0 }), 'instruction');
});

test("a step's help line (or the \"Tap me\" after it) goes the frame its step ends, so what comes next is not held up behind it", () => {
  // Measured in the emulator (hand walk, week 1): the sun's help line went up 0.27 s before the tap that ended its step,
  // stayed its 5 s, and the evening's line ("Monday. A parcel at Nora's door.") waited 4.7 s behind it.
  const help = { up: 'story', upStep: '', shownFor: 0.27, left: 4.73, waiting: 0, holding: false, persist: true, told: false, least: 5, ownStep: 'sun' };
  // Its step goes on: it stays its 5 s, whatever waits.
  assert.equal(panelMove({ ...help, step: 'sun', instruction: 'Tap the brass sun. See what your choice does.', waiting: 1 }), 'keep');
  // The step ended: the line waiting goes up this frame; with none, the next step's instruction; with neither, nothing.
  assert.equal(panelMove({ ...help, step: 'sunOn', instruction: 'Tap the sun on to Sunday.', waiting: 1 }), 'story');
  assert.equal(panelMove({ ...help, step: 'sunOn', instruction: 'Tap the sun on to Sunday.' }), 'instruction');
  assert.equal(panelMove({ ...help, step: '', instruction: '' }), 'clear');
  // Any other story line keeps its least time as before, step or no step.
  assert.equal(panelMove({ ...help, ownStep: '', least: undefined, step: 'sunOn', instruction: 'Tap the sun on to Sunday.', waiting: 1 }), 'keep');
  assert.equal(panelMove({ ...help, ownStep: undefined, least: undefined, step: '', instruction: '' }), 'keep');
});

test('a poke brings back an instruction whose step lasts as that instruction; any other line as a story line', () => {
  // The first week's choosing instruction, with "Tap me" up after its help line: back where it hangs, with its arrow.
  assert.equal(pokeBack('choosing', 'choosing'), 'instruction');
  // A later week's visit line, gone after its 7 s while the family still waits: back as itself, so it goes with its step.
  assert.equal(pokeBack('visit', 'visit'), 'instruction');
  // A story line (his last line was no step's), or a step already done: as a story line.
  assert.equal(pokeBack('', 'visit'), 'story');
  assert.equal(pokeBack('visit', 'sun'), 'story');
});

test("a line taken down unread keeps its step, so it never comes back once its step is done", () => {
  // The first week's help line on the little model, up 2 s when the Keeper taps the house and the family's box comes.
  const help = "Nora's house glows on the little model. Tap it.";
  const said = "Tap Nora's house on the little model.";
  const waiting = [heldLine(help, help, false, false, 'model')];
  assert.deepEqual(waiting[0], { text: help, cue: false, keep: false, forget: false, step: 'model' });
  // The visit has ended the model step: the system drops every waiting line of another step (ToccoSystem.dropStepLines).
  const step = stepOf({ week: 1, phase: 'landed', open: true, chosen: 1, visited: true, landedFor: 5, called: true, lamp: false, reply: false, quiet: false });
  assert.notEqual(step, 'model');
  assert.deepEqual(waiting.filter((line) => line.step == null || line.step === step), []);
  // "Tap me" was never his last line: it is still not when it comes back. A cue said last is still a cue.
  assert.deepEqual(heldLine('Tap me to hear it once more.', said, true, false, 'model'), { text: 'Tap me to hear it once more.', cue: false, keep: false, forget: true, step: 'model' });
  assert.deepEqual(heldLine('Down it goes. Hear it land?', 'Down it goes. Hear it land?', true, false, ''), { text: 'Down it goes. Hear it land?', cue: true, keep: false, forget: false });
});

// Devir 1b item 14: the family's box in the first week. Their line is read for 4 s after it arrives, then Tocco says to
// knock on its glass (through his hold, beside the box); the knock brings Lina's line for 4 s, and the box goes home by
// itself 5 s after the knock, or 14 s after it arrived without one. From the second week it waits for the Keeper.
test("in the first week the family's box goes home by itself 5 s after the knock, or 14 s after it arrived; later never", () => {
  assert.deepEqual([BOX_READ_SECONDS, LINA_SECONDS, KNOCK_HOME, ARRIVAL_HOME], [4, 4, 5, 14]);
  // Never knocked on: 14 s after it arrived.
  assert.equal(boxGoesHome(1, ARRIVAL_HOME - FRAME, -1), false);
  assert.equal(boxGoesHome(1, ARRIVAL_HOME, -1), true);
  // Knocked on: 5 s after the knock, early or late in the visit.
  assert.equal(boxGoesHome(1, 3 + KNOCK_HOME - FRAME, KNOCK_HOME - FRAME), false);
  assert.equal(boxGoesHome(1, 3 + KNOCK_HOME, KNOCK_HOME), true);
  assert.equal(boxGoesHome(1, 13 + KNOCK_HOME - FRAME, KNOCK_HOME - FRAME), false, 'a knock at 13 s still has its 5 s');
  assert.equal(boxGoesHome(1, 13 + KNOCK_HOME, KNOCK_HOME), true);
  // Not in the window (home, or on its way): nothing to send.
  assert.equal(boxGoesHome(1, -1, -1), false);
  assert.equal(boxGoesHome(1, -1, 9), false);
  // From the second week the Keeper sends it home (its hook, a push, the window again): it stays, knocked or not.
  for (const week of [2, 7, 12]) {
    assert.equal(boxGoesHome(week, 600, -1), false, `week ${week}, never knocked`);
    assert.equal(boxGoesHome(week, 600, 590), false, `week ${week}, knocked`);
  }
});

test("in the first week the knock puts Lina's line on the family's for 4 s, then nothing until the box is home; later theirs stays", () => {
  assert.equal(familyLineNow(1, -1), 'theirs');
  assert.equal(familyLineNow(1, 0), 'lina');
  assert.equal(familyLineNow(1, LINA_SECONDS - FRAME), 'lina');
  assert.equal(familyLineNow(1, LINA_SECONDS), 'none');
  // Read before the box goes: it is up 4 of the 5 s.
  assert.ok(LINA_SECONDS < KNOCK_HOME);
  for (const week of [2, 12]) assert.equal(familyLineNow(week, 1), 'theirs', `week ${week}`);
});

test("the first week's knock is a step while the box is in, once their line has been read, until the knock", () => {
  const box = (over) => stepOf(facts({ phase: 'landed', open: true, visited: true, ...over }));
  assert.equal(box({ box: -1 }), 'sun', 'home, or on its way: the week as it stands');
  assert.equal(box({ box: 0 }), 'sun', 'their line first');
  assert.equal(box({ box: BOX_READ_SECONDS - FRAME }), 'sun');
  assert.equal(box({ box: BOX_READ_SECONDS }), 'knock');
  assert.equal(box({ box: 9, knocked: true }), 'sun', 'knocked: the step is done');
  assert.equal(box({ box: 1, knocked: true }), 'sun', 'knocked before it was asked for');
  // On a visit later in the first week too, before the week's own step comes back.
  assert.equal(stepOf(facts({ phase: 'days', open: true, box: 5 })), 'knock');
  assert.equal(stepOf(facts({ phase: 'sunday', open: true, box: 5 })), 'knock');
  // Shut, the latch first; from the second week no knock instruction (the hand shows it, then the hook).
  assert.equal(stepOf(facts({ phase: 'landed', open: false, box: 5 })), 'latch');
  assert.equal(box({ week: 2, box: 9 }), 'sun');
  // A solidarity week: Tocco is quiet.
  assert.equal(stepOf(facts({ phase: 'landed', open: true, week: 8, quiet: true, box: 9 })), '');
});

/**
 * One first-week visit to the family's box, frame by frame, as FamilySystem and ToccoSystem run it: the box flies in
 * (FLIGHT) and is in the window from then; their line is read; the knock instruction goes up through his hold; the
 * Keeper knocks at `knockAt` (s after it arrived; never if null); the box goes home by itself and flies back; the
 * sun's instruction follows once it is home. Returns what his panel showed, and when the box went and was home.
 */
function visit(knockAt) {
  const FLIGHT = 1.1;
  const p = panel(true);
  let mode = 'coming';
  let time = 0;
  let shownFor = -1;
  let knockedFor = -1;
  let wentAt = -1;
  let homeAt = -1;
  const lina = [];
  for (let i = 0; i * FRAME <= 24; i += 1) {
    const t = i * FRAME;
    // FamilySystem: the flight, then the visit's clocks; the knock; going home by itself.
    if (mode === 'coming' || mode === 'going') {
      time += FRAME;
      if (time >= FLIGHT) {
        if (mode === 'coming') shownFor = 0;
        else homeAt = t;
        mode = mode === 'coming' ? 'shown' : 'away';
        time = 0;
      }
    } else if (mode === 'shown') {
      shownFor += FRAME;
      if (knockedFor >= 0) knockedFor += FRAME;
      if (knockAt != null && knockedFor < 0 && shownFor >= knockAt) knockedFor = 0;
      if (boxGoesHome(1, shownFor, knockedFor)) {
        mode = 'going';
        wentAt = t;
        shownFor = -1;
      }
    }
    lina.push({ t, line: familyLineNow(1, knockedFor) });
    // ToccoSystem: the step from the week and the box, held while the box is in, the knock through the hold.
    const step = stepOf(facts({ phase: 'landed', open: true, visited: true, box: mode === 'shown' ? shownFor : -1, knocked: knockedFor >= 0 }));
    const instruction = step === 'knock' ? 'knock' : step === 'sun' ? 'sun' : '';
    const holding = mode !== 'away';
    if (p.up !== 'none') {
      p.left -= FRAME;
      p.shownFor += FRAME;
    }
    const move = panelMove({ up: p.up, upStep: p.upStep, shownFor: p.shownFor, left: p.left, waiting: 0, holding, step, instruction, persist: true, told: false, through: step === 'knock' });
    if (move === 'instruction') put(p, 'instruction', step, instruction, Infinity);
    if (move === 'clear') put(p, 'none', '', '', 0);
    p.shown.push({ t, text: p.up === 'none' ? '' : p.text, up: p.up, step: p.upStep, weekStep: step });
  }
  return { shown: p.shown, wentAt, homeAt, lina, arrived: 1.1 };
}

test("a first-week visit: the knock line 4 s after the box arrives, gone at the knock; home 5 s later; the sun's line once it is home", () => {
  // As planned (Devir 1b section 4): the house tapped at 0:59, the box in at 1:00.1, the knock at 1:07.
  const knockAfter = 5.9;
  const { shown, wentAt, homeAt, lina, arrived } = visit(knockAfter);
  // The knock instruction from their line read (4 s after arriving) to the knock, the one line up while the box is in.
  const [[from, to], ...more] = stretches(shown, 'knock');
  assert.equal(more.length, 0);
  assert.ok(Math.abs(from - (arrived + BOX_READ_SECONDS)) < 2 * FRAME, `knock line up at ${from.toFixed(3)}`);
  const knock = arrived + knockAfter;
  assert.ok(to < knock + FRAME && to > knock - 2 * FRAME, `knock line last up at ${to.toFixed(3)}, knock at ${knock.toFixed(3)}`);
  // Nothing else of his while the box is in or flying home.
  for (const f of shown) if (f.t < homeAt && f.text !== '' && f.text !== 'knock') assert.fail(`${f.text} up at ${f.t} with the box in`);
  // Lina's line 4 s from the knock; the box goes home 5 s after it; the sun's line the frame the box is home.
  const [[linaFrom, linaTo]] = stretchesOf(lina, 'lina');
  assert.ok(Math.abs(linaTo - linaFrom - LINA_SECONDS) < 2 * FRAME, `Lina's line ${linaFrom.toFixed(3)} to ${linaTo.toFixed(3)}`);
  assert.ok(Math.abs(wentAt - knock - KNOCK_HOME) < 2 * FRAME, `went home at ${wentAt.toFixed(3)}, ${(wentAt - knock).toFixed(3)} s after the knock`);
  const [[sunFrom]] = stretches(shown, 'sun');
  assert.ok(sunFrom >= homeAt && sunFrom < homeAt + 2 * FRAME, `sun line at ${sunFrom.toFixed(3)}, home at ${homeAt.toFixed(3)}`);
});

test('a first-week visit never knocked on: the knock line stays up until the box goes home by itself, 14 s after it arrived', () => {
  const { shown, wentAt, arrived, lina } = visit(null);
  const [[from, to], ...more] = stretches(shown, 'knock');
  assert.equal(more.length, 0);
  assert.ok(Math.abs(from - (arrived + BOX_READ_SECONDS)) < 2 * FRAME, `knock line up at ${from.toFixed(3)}`);
  assert.ok(Math.abs(wentAt - arrived - ARRIVAL_HOME) < 2 * FRAME, `went home ${(wentAt - arrived).toFixed(3)} s after it arrived`);
  // Its step ends as the box sets off home: the line goes that frame.
  assert.ok(to < wentAt && to > wentAt - 2 * FRAME, `knock line last up at ${to.toFixed(3)}, box went at ${wentAt.toFixed(3)}`);
  assert.ok(lina.every((f) => f.line === 'theirs'), "no knock, no line of Lina's");
});

/** stretches() for the family line's frames. */
function stretchesOf(frames, line) {
  return stretches(
    frames.map((f) => ({ t: f.t, text: f.line === line ? line : '' })),
    line,
  );
}
