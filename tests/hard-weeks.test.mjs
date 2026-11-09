// The hard-week rule (META_VR_DEVIR2_TASLAK.md section 5): a basket answers a hard week, nothing softened costs one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { answer, whatHappensLater, whatIdDo, whoItHelps } from '../src/season/answers.ts';
import { available, BUILD, buildPays, CLIMAX_WEEK as CLIMAX, EASE, easingBites, EMPTY, festivalLights, HELP, levels, pressure, replay, WORKING } from '../src/season/model.ts';
import { calledLine, choiceLine, CLIMAX_WEEK, familyLine, ledgerLines, settledLine, festivalLines, HARD_WEEK_COST, HARD_WEEK_LIT, hardWeekLine } from '../src/season/lines.ts';

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

// A twelve-week list with five hard weeks, as the season has them: 1, 5, 6, 10 and 11.
const TWELVE = { country: 'Italy', weeks: [3, 0, -1, 1, 3, 2, -1, 0, 1, 2, 3, 0].map((tier, i) => weekWith(['fuel', 'power', 'food'][i % 3], tier)) };
const HARD = [1, 5, 6, 10, 11];

/** A season's kept weeks: `hard` in the first `count` hard weeks, `rest` otherwise, and the climax's glass. */
function keptWeeks(hard, count, globe, rest = EMPTY) {
  return Array.from({ length: 11 }, (_, i) => {
    const n = i + 1;
    const k = HARD.indexOf(n);
    const chosen = k >= 0 && k < count ? hard : rest;
    return { ...pass(chosen), ...(n === CLIMAX ? { globe } : {}) };
  });
}

test('the season answers: the town, one window, or both', () => {
  // Sent: the town's, or both from three of the five hard weeks on one family.
  assert.equal(replay(TWELVE, keptWeeks(HELP, 2, 'sent')).answer, 'town');
  assert.equal(replay(TWELVE, keptWeeks(HELP, 3, 'sent')).answer, 'both');
  // Kept: one window's, or both from three of the five on everyone.
  assert.equal(replay(TWELVE, keptWeeks(EASE, 2, 'kept')).answer, 'window');
  assert.equal(replay(TWELVE, keptWeeks(EASE, 3, 'kept')).answer, 'both');
  // Helping does not make a kept glass both, and easing does not make a sent one.
  assert.equal(replay(TWELVE, keptWeeks(HELP, 5, 'kept')).answer, 'window');
  assert.equal(replay(TWELVE, keptWeeks(EASE, 3, 'sent')).answer, 'town');
  // Undecided (a skipped week) keeps the glass.
  assert.equal(replay(TWELVE, keptWeeks(HELP, 0)).globe, 'kept');
});

test('every answer can be reached at a price the jar can pay', () => {
  for (const [hard, count, globe, answer] of [[HELP, 3, 'sent', 'both'], [EASE, 3, 'kept', 'both'], [HELP, 1, 'sent', 'town'], [EASE, 1, 'kept', 'window']]) {
    const kept = keptWeeks(hard, count, globe);
    let town = replay(TWELVE, []);
    for (let i = 0; i < kept.length; i += 1) {
      assert.ok(available(town, TWELVE.weeks[i].kind, kept[i].chosen), `week ${i + 1}`);
      town = replay(TWELVE, kept.slice(0, i + 1));
    }
    assert.equal(town.answer, answer);
  }
});

test('the answer is settled as the climax closes: the last week changes nothing', () => {
  const kept = keptWeeks(HELP, 3, 'sent');
  const before = replay(TWELVE, kept).answer;
  assert.equal(replay(TWELVE, [...kept, pass(EASE)]).answer, before);
  assert.equal(replay(TWELVE, kept.slice(0, 10)).answer, null);
  assert.equal(replay(TWELVE, kept.slice(0, 10)).globe, null);
});

test('the finds stay with the season, and the same weeks give the same town', () => {
  const kept = [pass(HELP), pass(EMPTY), { ...pass(EMPTY), globePlaced: true }, { ...pass(EMPTY), seen: true }, pass(EMPTY), { ...pass(EMPTY), drawing: true }];
  const town = replay(TWELVE, kept);
  assert.deepEqual([town.globePlaced, town.markSeen, town.drawingSeen], [true, true, true]);
  assert.deepEqual(replay(TWELVE, kept), town);
  const fresh = replay(TWELVE, []);
  assert.deepEqual([fresh.globePlaced, fresh.markSeen, fresh.drawingSeen, fresh.globe, fresh.answer], [false, false, false, null, null]);
});

test('a find in a solidarity week is kept too', () => {
  const aid = { ...TWELVE, weeks: TWELVE.weeks.map((w, i) => (i === 7 ? { ...w, solidarity: { letter: [], week: '' } } : w)) };
  const kept = Array.from({ length: 8 }, (_, i) => ({ ...pass(EMPTY), ...(i === 7 ? { seen: true, aid: true } : {}) }));
  assert.equal(replay(aid, kept).markSeen, true);
});

test('the climax is the same week in the lines as in the model', () => {
  assert.equal(CLIMAX_WEEK, CLIMAX);
});

test('a build says what it will ease only in the weeks it really will', () => {
  const played = { weeks: baked.weeks.map((w) => w.calm ?? w) };
  const pays = played.weeks.map((w, i) => buildPays(played, i + 1, w.kind)).map((yes, i) => (yes ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(pays, [1, 2, 3, 5, 6, 7]);
  assert.equal(whoItHelps(BUILD, true, true, 'power'), 'No one yet. Then the turbines ease every power week.');
  assert.equal(whoItHelps(BUILD, true), 'No one yet. Everyone, later on.');
});

test('the tally shows no row for a nought', () => {
  assert.deepEqual(ledgerLines(3, 5, ['fuel', 'power'], 1), ['Hard weeks answered: 3 of 5.', 'Working now: the tram, the turbines.', 'Paper boats on the sill: 1.']);
  assert.deepEqual(ledgerLines(0, 5, [], 1), ['Paper boats on the sill: 1.']);
  assert.deepEqual(ledgerLines(0, 5, [], 0), []);
  assert.equal(ledgerLines(1, 5, ['fuel', 'power', 'food'], 0)[1], 'Working now: the tram, the turbines, the garden.');
  assert.ok(ledgerLines(1, 5, ['fuel', 'power', 'food'], 0)[1].length <= 52);
});

test('the morning after a call says who said what, and how far the prices really went', () => {
  const real = { kind: 'power', next: -17.1, monthly: false };
  assert.equal(settledLine(real, 0, 1, 1), 'We both said up. Power went down 17.1%.');
  assert.equal(settledLine(real, 0, 0, 1), 'You said down, I said up. Power went down 17.1%.');
  assert.equal(settledLine(real, 0, -1, 1), 'I said up. Power went down 17.1%.');
  assert.equal(calledLine(1, true), 'Up, you say. I keep score by my door.');
  assert.equal(calledLine(0), 'Down, you say. Noted.');
});

test('a build too late for the season gives no date, and the turbines take the plural', () => {
  const town = { week: 10, coins: 3, lagging: false, builtIn: { fuel: 0, power: 10, food: 0 }, builds: { fuel: 0, power: 0, food: 0 } };
  const calm = weekWith('food', 0);
  assert.equal(whatHappensLater(calm, { ...town, week: 11 }, EMPTY), "New prices next week. That's all I know.");
  assert.equal(whatHappensLater(calm, { ...town, week: 10, builtIn: { fuel: 0, power: 0, food: 0 } }, BUILD), "New prices next week. That's all I know.");
  assert.equal(whatHappensLater(calm, { ...town, week: 8, builtIn: { fuel: 0, power: 7, food: 0 } }, EMPTY), 'The turbines work in two weeks.');
  assert.equal(whatHappensLater(calm, { ...town, week: 8, builtIn: { fuel: 7, power: 0, food: 0 } }, EMPTY), 'The tram works in two weeks.');
});

test('in the market-lag weeks the stalls only thin a little, so the lines that say all is well stay true', () => {
  const season = played(false);
  // The hard fuel weeks of the list, and the weeks after them: nothing shows worse than a small rise at the market, whatever is chosen.
  const choices = [EASE, HELP, BUILD, EMPTY];
  for (const n of [2, 3, 7]) {
    const real = season.weeks[n - 1];
    const kept = season.weeks.slice(0, n - 1).map((_, i) => pass(i === 0 ? HELP : EMPTY));
    const town = replay(season, kept);
    assert.equal(town.lagging, true, `week ${n}`);
    for (const chosen of choices) assert.ok(levels(real, town, chosen).food <= 1, `week ${n}`);
    // Nothing to ease in these weeks: the lines say so, and the town agrees.
    assert.equal(easingBites(real, town), false, `week ${n}`);
    assert.equal(levels(real, town, EASE)[real.kind], levels(real, town, EMPTY)[real.kind], `week ${n}`);
  }
});

test('a calm week sent empty is all right with Nora; a hard one is still the empty basket; the last week only asks', async () => {
  const { NOTHING, choosingLine } = await import('../src/season/lines.ts');
  assert.equal(familyLine('food', -1, true, false), "Nora: We're all right this week.");
  assert.equal(familyLine('food', -1, true, true), NOTHING);
  assert.equal(choosingLine(2, true), 'Pick one.');
  assert.equal(choosingLine(0, true), 'Pick one.');
  assert.equal(choosingLine(2), 'A hard week for families here. Pick one.');
});
