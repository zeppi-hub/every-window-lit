// Unit tests for the season's world model: `node --test tests/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actual,
  available,
  BUILD,
  EASE,
  EMPTY,
  festivalLights,
  HELP,
  JAR_MAX,
  JAR_START,
  levels,
  pressure,
  replay,
  SCAFFOLD,
  stage,
  toccoCall,
  WORKING,
} from '../src/season/model.ts';

function week(kind, change, tier, next, before = [0, 0, 0, 0]) {
  return { kind, start: '2024-03-04', month: 'Mar 2024', monthly: kind === 'food', change, tier, next, before };
}

const season = {
  country: 'Italy',
  weeks: [
    week('fuel', 4.1, 3, 0.8, [0.2, 0.5, 1.1, 0.9]),
    week('power', -6.0, -1, 2.0),
    week('fuel', 0.4, 1, -0.3),
    week('food', 0.9, 2, 0.4),
    week('power', 9.5, 3, -4.0),
    week('fuel', 1.6, 2, 0.0),
  ],
};

const pass = (chosen, call = -1, tocco = -1) => ({ chosen, call, tocco });

test('the jar starts at five, gains one a week and stops at eight', () => {
  assert.equal(replay(season, []).coins, JAR_START);
  assert.equal(replay(season, [pass(EMPTY)]).coins, JAR_START + 1);
  const many = Array.from({ length: 5 }, () => pass(EMPTY));
  assert.equal(replay(season, many).coins, JAR_MAX);
});

test('choices are paid from the jar', () => {
  assert.equal(replay(season, [pass(EASE)]).coins, JAR_START - 3 + 1);
  assert.equal(replay(season, [pass(HELP)]).coins, JAR_START - 1 + 1);
  assert.equal(replay(season, [pass(BUILD)]).coins, JAR_START - 2 + 1);
});

test('an option the jar cannot pay for counts as an empty basket', () => {
  // 5 → ease 2 (+1 = 3) → ease 0 (+1 = 1) → ease refused: still 1 (+1 = 2).
  const town = replay(season, [pass(EASE), pass(EASE), pass(EASE)]);
  assert.equal(town.coins, 2);
  assert.equal(available({ ...town, coins: 2 }, 'fuel', EASE), false);
  assert.equal(available({ ...town, coins: 2 }, 'fuel', HELP), true);
});

test('a kind is built once: scaffold the next week, working three weeks after', () => {
  assert.equal(stage(1, 1), 0);
  assert.equal(stage(1, 2), SCAFFOLD);
  assert.equal(stage(1, 3), SCAFFOLD);
  assert.equal(stage(1, 4), WORKING);
  const town = replay(season, [pass(BUILD)]);
  assert.equal(town.builds.fuel, SCAFFOLD);
  assert.equal(available(town, 'fuel', BUILD), false);
  assert.equal(available(town, 'power', BUILD), true);
  // A second fuel build is refused and costs nothing.
  const twice = replay(season, [pass(BUILD), pass(EMPTY), pass(BUILD)]);
  assert.equal(twice.builtIn.fuel, 1);
  assert.equal(twice.coins, Math.min(JAR_MAX, JAR_START - 2 + 3));
});

test('easing and a working build each take a tier off; a fall stays a fall', () => {
  const town = replay(season, []);
  const big = season.weeks[0];
  assert.equal(pressure(big, town, EMPTY), 3);
  assert.equal(pressure(big, town, EASE), 2);
  const built = { ...town, builds: { ...town.builds, fuel: WORKING } };
  assert.equal(pressure(big, built, EASE), 1);
  assert.equal(pressure(season.weeks[1], town, EASE), -1);
  assert.equal(pressure(season.weeks[2], town, EASE), 0);
});

test('a big fuel week reaches the market one and two weeks later', () => {
  const after1 = replay(season, [pass(EMPTY)]);
  assert.equal(after1.lagging, true);
  assert.equal(levels(season.weeks[1], after1, EMPTY).food, 2);
  assert.equal(levels(season.weeks[1], after1, EMPTY).power, -1);
  // The festival's week keeps its stalls open.
  assert.equal(levels(season.weeks[1], { ...after1, week: 12 }, EMPTY).food, 1);
  const after2 = replay(season, [pass(EMPTY), pass(EMPTY)]);
  assert.equal(after2.lagging, true);
  const after3 = replay(season, [pass(EMPTY), pass(EMPTY), pass(EMPTY)]);
  assert.equal(after3.lagging, false);
});

test('the family is counted as helped or strained only in pressed weeks', () => {
  const town = replay(season, [pass(HELP), pass(EMPTY), pass(EMPTY), pass(EMPTY), pass(HELP)]);
  assert.equal(town.helped, 2);
  assert.equal(town.strained, 1);
});

test('calls are settled against the real next period', () => {
  assert.equal(actual(season.weeks[0]), 1);
  assert.equal(actual(season.weeks[5]), 0);
  const town = replay(season, [pass(EMPTY, 1, 0), pass(EMPTY, 0, 1)]);
  assert.equal(town.keeperNotches, 1);
  assert.equal(town.toccoNotches, 1);
});

test("Tocco follows the recent trend", () => {
  assert.equal(toccoCall(season.weeks[0]), 1);
  assert.equal(toccoCall(week('fuel', -0.5, 0, 0, [0, 0, -0.4, -0.2])), 0);
  // Against the week's own rise when the two weeks before fell further.
  assert.equal(toccoCall(week('fuel', 0.3, 0, 0, [0, 0, -0.5, -0.4])), 0);
  // When the three cancel out, the week's own change decides.
  assert.equal(toccoCall(week('fuel', 0.3, 0, 0, [0, 0, 0.1, -0.4])), 1);
});

test('the festival lights stay between 0.4 and 1, and grow with care', () => {
  const none = replay(season, []);
  const cared = replay(season, [pass(HELP), pass(BUILD), pass(EMPTY), pass(EMPTY), pass(HELP), pass(EMPTY)]);
  assert.ok(festivalLights(cared) > festivalLights(none));
  for (const town of [none, cared]) {
    const share = festivalLights(town);
    assert.ok(share >= 0.4 && share <= 1);
  }
});
