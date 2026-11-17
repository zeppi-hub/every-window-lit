// The new version's mini game frame (META_VR_V2_TASARIM.md): three stages, a loss replays only that stage, a hint
// from the second loss of a stage, a clock that stops while paused, the word won with the last stage. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { BETWEEN_SECONDS, HINT_AFTER, MiniGame } = await import('../src/v2/minigame.ts');

function game(stages = [{ name: 'one' }, { name: 'two', seconds: 10 }, { name: 'three' }]) {
  const events = [];
  const g = new MiniGame('safety net', stages, (name, payload) => events.push([name, payload]));
  return { g, events, names: () => events.map(([n]) => n) };
}

const pass = (g, seconds = BETWEEN_SECONDS + 0.01) => g.update(seconds, false);

test('stages run in order and the last one wins the word', () => {
  const { g, names } = game();
  g.start();
  assert.equal(g.phase, 'playing');
  g.win();
  assert.equal(g.phase, 'between');
  pass(g);
  assert.equal(g.stage, 1);
  g.win();
  pass(g);
  g.win();
  assert.equal(g.phase, 'won');
  assert.deepEqual(names(), ['stageStart', 'stageWon', 'stageStart', 'stageWon', 'stageStart', 'stageWon', 'wordWon']);
});

test('a loss replays only that stage, never the whole game', () => {
  const { g } = game();
  g.start();
  g.win();
  pass(g);
  g.lose('two misses');
  pass(g);
  assert.equal(g.stage, 1, 'the same stage again');
  assert.equal(g.attemptsOf(1), 2);
  assert.equal(g.attemptsOf(0), 1, 'the first stage is not replayed');
});

test('from the second loss of a stage on, every loss asks for a hint', () => {
  const { g, events } = game();
  g.start();
  for (let i = 0; i < 3; i += 1) {
    g.lose('miss');
    pass(g);
  }
  const hints = events.filter(([n]) => n === 'hint').map(([, p]) => p.failures);
  assert.equal(HINT_AFTER, 2);
  assert.deepEqual(hints, [2, 3]);
});

test("a stage's clock stops while paused, and running out of time loses it", () => {
  const { g, events } = game();
  g.start();
  g.win();
  pass(g);
  g.update(6, false);
  g.update(30, true);
  assert.equal(g.elapsed, 6, 'paused time not counted');
  assert.equal(g.remaining, 4);
  g.update(4, false);
  assert.equal(g.phase, 'between');
  assert.equal(events.at(-1)[1].reason, 'time');
  g.update(BETWEEN_SECONDS + 1, true);
  assert.equal(g.phase, 'between', 'the pause between stages waits too');
});

test('win and lose count only while a stage is being played', () => {
  const { g, names } = game();
  g.win();
  g.lose('x');
  assert.deepEqual(names(), []);
  g.start();
  g.win();
  g.win();
  assert.deepEqual(names(), ['stageStart', 'stageWon']);
});
