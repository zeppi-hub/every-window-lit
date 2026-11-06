// The hard-week rule (META_VR_DEVIR2_TASLAK.md section 5): a basket answers a hard week, nothing softened costs one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { answer, whatHappensLater, whatIdDo, whoItHelps } from '../src/season/answers.ts';
import { BUILD, EASE, easingBites, EMPTY, festivalLights, HELP, pressure, replay, WORKING } from '../src/season/model.ts';
import { choiceLine, CLIMAX_WEEK, familyLine, festivalLines, HARD_WEEK_COST, HARD_WEEK_LIT, hardWeekLine } from '../src/season/lines.ts';

const baked = JSON.parse(readFileSync(new URL('../src/season/season.json', import.meta.url), 'utf8'));

/** The season as played: `aid` true plays the solidarity week, false its calm stand-in (and so does production until it is reviewed). */
function played(aid) {
  return {
    ...baked,
    weeks: baked.weeks.map((w) => {
      const letter = w.solidarity ?? w.solidarityPending;
      if (letter == null) return w;
      return aid ? { ...w, solidarity: letter } : w.calm;
    }),
  };
}

const weekWith = (kind, tier) => ({ kind, start: '2024-03-04', month: 'Mar 2024', monthly: false, change: 1, tier, next: 1, before: [0, 0, 0, 0] });
const pass = (chosen) => ({ chosen, call: -1, tocco: -1 });
const SEASON = { country: 'Italy', weeks: [weekWith('fuel', 0), weekWith('fuel', 0), weekWith('power', 0), weekWith('fuel', 0), weekWith('fuel', 3), weekWith('power', 2), weekWith('food', 2)] };

/** Every sequence of choices the jar can pay for over the 11 weeks that count for the festival (the first basket never goes down empty). */
function bestAndWorst(season) {
  let best = 0;
  let worst = 1;
  const kept = [];
  const walk = (n) => {
    const town = replay(season, kept);
    if (n > 11) {
      const share = festivalLights(town);
      best = Math.max(best, share);
      worst = Math.min(worst, share);
      return;
    }
    const real = season.weeks[n - 1];
    const options = real.solidarity != null ? [EMPTY] : n === 1 ? [EASE, HELP, BUILD] : [EASE, HELP, BUILD, EMPTY];
    for (const chosen of options) {
      if (chosen === EASE && town.coins < 3) continue;
      if (chosen === HELP && town.coins < 1) continue;
      if (chosen === BUILD && (town.coins < 2 || town.builtIn[real.kind] > 0)) continue;
      kept.push(pass(chosen));
      walk(n + 1);
      kept.pop();
    }
  };
  walk(1);
  return { best, worst };
}

test('a season has at most five hard weeks, with the solidarity week on and off: Everyone keeps up only that far', () => {
  for (const aid of [true, false]) {
    const hard = played(aid).weeks.filter((w) => w.solidarity == null && w.tier >= 2);
    assert.ok(hard.length <= 5, `${hard.length} hard weeks`);
  }
});

test('a basket counts, one family or everyone; a working build carries the week; nothing else softens it', () => {
  const town = (chosen) => replay(SEASON, [pass(EMPTY), pass(EMPTY), pass(EMPTY), pass(EMPTY), pass(chosen)]);
  assert.deepEqual([town(HELP).helped, town(HELP).eased, town(HELP).strained, town(HELP).pressed], [1, 0, 0, 1]);
  assert.deepEqual([town(EASE).helped, town(EASE).eased, town(EASE).strained, town(EASE).pressed], [0, 1, 0, 1]);
  assert.deepEqual([town(EMPTY).helped, town(EMPTY).eased, town(EMPTY).strained, town(EMPTY).pressed], [0, 0, 1, 1]);
  assert.deepEqual([town(BUILD).helped, town(BUILD).eased, town(BUILD).strained, town(BUILD).pressed], [0, 0, 1, 1]);
  // Built in week 1, working from week 4: the tram carries the fuel week in week 5, and it counts as pressed.
  const built = replay(SEASON, [pass(BUILD), pass(EMPTY), pass(EMPTY), pass(EMPTY), pass(EMPTY)]);
  assert.deepEqual([built.strained, built.pressed], [0, 1]);
  assert.equal(built.builds.fuel, WORKING);
  // Built in week 3 of the power kind: still a scaffold in week 4, working by week 6.
  const power = replay(SEASON, [pass(EMPTY), pass(EMPTY), pass(BUILD), pass(EMPTY), pass(EMPTY), pass(EMPTY)]);
  assert.deepEqual([power.strained, power.pressed], [1, 2]);
});

test('the two simple roads meet at 0.90 in production, and no season falls under 0.46', () => {
  const season = played(false);
  const road = (chosen) => season.weeks.slice(0, 11).map((w, i) => pass(w.tier >= 2 ? chosen : i === 0 ? chosen : EMPTY));
  assert.equal(festivalLights(replay(season, road(HELP))), 0.9);
  assert.equal(festivalLights(replay(season, road(EASE))), 0.9);
  const { best, worst } = bestAndWorst(season);
  assert.equal(best, 1);
  assert.equal(worst, 0.46);
});

test('the shares land on their thresholds, not a hair under', () => {
  const t = (helped, eased, strained, working) => ({ helped, eased, strained, builds: { fuel: working > 0 ? WORKING : 0, power: working > 1 ? WORKING : 0, food: working > 2 ? WORKING : 0 } });
  assert.equal(festivalLights(t(1, 1, 3, 1)), 0.65);
  assert.equal(festivalLines(festivalLights(t(1, 1, 3, 1)))[0], 'Most windows lit. A good season.');
  assert.equal(festivalLights(t(1, 0, 1, 3)), 0.85);
  assert.equal(festivalLines(festivalLights(t(1, 0, 1, 3)))[0], 'Every window lit, Keeper.');
  assert.equal(festivalLights(t(0, 0, 9, 0)), 0.4);
  assert.equal(festivalLights(t(5, 5, 0, 3)), 1);
});

test('easingBites says what the town would show, at every tier, built or not', () => {
  for (const kind of ['fuel', 'power', 'food']) {
    for (const tier of [-1, 0, 1, 2, 3]) {
      for (const stage of [0, 1, 2]) {
        const real = weekWith(kind, tier);
        const town = { builds: { fuel: 0, power: 0, food: 0, [kind]: stage } };
        const bites = pressure(real, town, EASE) !== pressure(real, town, EMPTY);
        assert.equal(easingBites(real, town), bites);
        // The answers carry their own copy of the same rule (they load with no model import).
        const line = whoItHelps(EASE, true, bites);
        assert.equal(answer(0, real, { ...town, builtIn: { fuel: 0, power: 0, food: 0 }, week: 5, coins: 3, lagging: false }, EASE, true), line);
      }
    }
  }
});

test('a hard week closes with a word on which way it went, only when it moved', () => {
  const b = { helped: 1, eased: 1, strained: 1 };
  assert.equal(hardWeekLine(b, { ...b, helped: 2 }, 5, HELP), HARD_WEEK_LIT);
  assert.equal(hardWeekLine(b, { ...b, eased: 2 }, 5, EASE), HARD_WEEK_LIT);
  assert.equal(hardWeekLine(b, { ...b, strained: 2 }, 5, EMPTY), HARD_WEEK_COST);
  assert.equal(hardWeekLine(b, { ...b, strained: 2 }, 5, BUILD), '', 'a build pays later');
  assert.equal(hardWeekLine(b, b, 5, EMPTY), '', 'a working build carried it');
  assert.equal(hardWeekLine(b, { ...b, helped: 2 }, 1, HELP), '', 'the first close stays as it is');
  assert.equal(hardWeekLine(b, { ...b, strained: 2 }, CLIMAX_WEEK, EMPTY), '', 'the climax has its own weight');
});

test('with nothing to ease, the Everyone lines say so', () => {
  assert.equal(choiceLine(0, 5, false), 'Not much to ease this week. Three coins. 5 left.');
  assert.equal(choiceLine(0, 5, true), 'Everyone a little, this week. Three coins. 5 left.');
  assert.equal(choiceLine(1, 5, false), "Nora's family, over there. One coin. 5 left.");
  assert.equal(familyLine('power', 0, false), "Nora: We're all right this week.");
  assert.equal(familyLine('power', 1, false), 'Grandpa: Bread from the baker. Oven stays off.');
  assert.equal(whoItHelps(EASE, true, false), 'Hardly anyone this week. Little to ease.');
  assert.equal(whoItHelps(EMPTY, true), 'The jar. The coins stay in it.');
});

test('Tocco warns of hard weeks only when one would really go unanswered, and offers a build only while it can still pay', () => {
  const town = { week: 5, coins: 2, lagging: false, builtIn: { fuel: 0, power: 0, food: 0 }, builds: { fuel: 0, power: 0, food: 0 } };
  const power = weekWith('power', 2);
  assert.equal(whatHappensLater(power, town, EMPTY), "Hard weeks add up for Nora's family.");
  assert.notEqual(whatHappensLater(power, town, EASE), "Hard weeks add up for Nora's family.");
  assert.notEqual(whatHappensLater(power, { ...town, builds: { fuel: 0, power: WORKING, food: 0 } }, EMPTY), "Hard weeks add up for Nora's family.");
  const calm = weekWith('power', 1);
  assert.equal(whatIdDo(calm, { ...town, week: 9 }), 'Build the turbines. It pays back later.');
  assert.equal(whatIdDo(calm, { ...town, week: 10 }), 'Send it empty. Fill the jar.');
});
