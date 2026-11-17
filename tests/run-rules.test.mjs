// THE RUN (S07) as numbers (src/v2/run-rules.ts): the panes, the net on its rope, the waves. `node --test tests/`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as r from '../src/v2/run-rules.ts';

const { RUN } = r;

test('the rope reaches every pane, and pulling it right moves the net right', () => {
  assert.ok(r.netTarget(0) < r.netTarget(1));
  assert.ok(Math.abs(r.netTarget(-1) - RUN.netFrom) < 1e-9, 'clamped at the left');
  assert.ok(Math.abs(r.netTarget(2) - RUN.netTo) < 1e-9, 'clamped at the right');
  for (let i = 0; i < RUN.sections.length; i += 1) {
    const p = r.ropeFor(i);
    assert.ok(p > 0 && p < 1, `pane ${i} is inside the rope's slide`);
    assert.ok(Math.abs(r.netTarget(p) - RUN.sections[i]) < 1e-9);
  }
  // Panes side by side, the net a little wider than one.
  for (let i = 1; i < RUN.sections.length; i += 1) assert.ok(Math.abs(RUN.sections[i] - RUN.sections[i - 1] - RUN.sectionWidth) < 1e-9);
  assert.ok(RUN.netWidth > RUN.sectionWidth);
});

test('the net comes a little behind the rope and settles into place without swinging past by much', () => {
  const net = { x: RUN.netFrom, v: 0 };
  const target = RUN.netTo;
  let peak = net.x;
  for (let i = 0; i < 600; i += 1) {
    r.stepNet(net, target, 1 / 72);
    peak = Math.max(peak, net.x);
  }
  assert.ok(Math.abs(net.x - target) < 1e-3, `settled: ${net.x}`);
  const over = (peak - target) / (target - RUN.netFrom);
  assert.ok(over < 0.05, `overshoot ${(over * 100).toFixed(1)} %`);
  // A long frame steps the same as short ones.
  const a = { x: 0, v: 0 };
  const b = { x: 0, v: 0 };
  r.stepNet(a, 2, 0.1);
  for (let i = 0; i < 12; i += 1) r.stepNet(b, 2, 0.1 / 12);
  assert.ok(Math.abs(a.x - b.x) < 0.01, `${a.x} against ${b.x}`);
});

test('each wave cracks sooner than the one before, and every crack leaves time to pull the net there from the last one', () => {
  const firsts = RUN.waves.map((w) => w[0].warn);
  for (let i = 1; i < firsts.length; i += 1) assert.ok(firsts[i] < firsts[i - 1], `wave ${i + 1}: ${firsts[i]} after ${firsts[i - 1]}`);
  let at = RUN.sections[RUN.rehearsal];
  for (const wave of RUN.waves) {
    for (const c of wave) {
      const need = RUN.reaction + r.travelTime(at, c.section);
      assert.ok(c.warn >= need, `pane ${c.section}: ${c.warn} s to crack, ${need.toFixed(2)} s needed`);
      at = RUN.sections[c.section];
    }
  }
});

test('in the last wave two panes crack at once: the second drops late enough to swing the net from the first', () => {
  const last = RUN.waves[RUN.waves.length - 1];
  assert.equal(last.length, 2);
  const [first, second] = last;
  assert.ok(second.warn > first.warn);
  const gap = second.warn - first.warn;
  assert.ok(gap >= RUN.reaction * 0.5 + r.travelTime(RUN.sections[first.section], second.section), `${gap.toFixed(2)} s between them`);
});

test('every pane but the rehearsal gives way once in the fight, the rehearsal pane never in it', () => {
  const panes = RUN.waves.flat().map((c) => c.section);
  assert.equal(new Set(panes).size, panes.length, 'no pane twice');
  assert.ok(!panes.includes(RUN.rehearsal));
  assert.equal(panes.length + 1, RUN.sections.length);
});

test('the net holds a pane only when it is under it; two lost panes break the door', () => {
  const x = RUN.sections[2];
  assert.ok(r.holds(x, 2, false));
  assert.ok(r.holds(x + RUN.hold * 0.9, 2, false));
  assert.ok(!r.holds(x + RUN.hold * 1.1, 2, false));
  assert.equal(r.under(x, false), 2);
  assert.equal(r.under(x + RUN.sectionWidth / 2, false), -1, 'between two panes it holds neither');
  assert.ok(!r.broken(1));
  assert.ok(r.broken(2));
});

test('after three lost fights the panes crack longer and the net holds from further off', () => {
  assert.ok(!r.mercyFor(2));
  assert.ok(r.mercyFor(3));
  const c = RUN.waves[0][0];
  assert.ok(r.warnOf(c, true) > r.warnOf(c, false));
  const x = RUN.sections[0] + RUN.hold * 1.2;
  assert.ok(!r.holds(x, 0, false) && r.holds(x, 0, true));
  assert.ok(RUN.mercyHold < RUN.sectionWidth / 2 + RUN.netWidth / 2, 'even then the net must be partly under the pane');
});

test('cracks spread from a hairline to the drop over the warning', () => {
  assert.equal(r.cracked(0, 2), 0);
  assert.equal(r.cracked(1, 2), 0.5);
  assert.equal(r.cracked(5, 2), 1);
});

test('the scene takes its numbers from the rules, plays the rehearsal with no clock and tells the player the goal', () => {
  const scene = readFileSync(new URL('../src/v2/game/run.ts', import.meta.url), 'utf8');
  assert.match(scene, /from '\.\.\/run-rules\.js'/);
  assert.match(scene, /RUN\.rehearsal/);
  assert.match(scene, /stepNet\(/);
  assert.match(scene, /const WHERE = 'TROUBLE 1 OF 6 · THE RUN';/);
  assert.match(scene, /setGoal\(\{ where: WHERE/);
  assert.match(scene, /setWindows\(/);
  assert.match(scene, /setDeskMode\('one'\)/);
  const tasks = [...scene.matchAll(/(?:now: |tellGoal\()'([^']+)'/g)].map((m) => m[1]);
  assert.ok(tasks.length >= 5, `${tasks.length} task lines`);
  for (const task of tasks) assert.ok(task.split(/\s+/).length <= 9, `"${task}" is at most nine words`);
});
