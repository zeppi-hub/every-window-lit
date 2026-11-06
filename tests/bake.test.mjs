// Checks the season bake's rules and what it wrote: `node --test tests/`.
// Runs without data/raw/: the rules get small made-up inputs, and the last
// tests read the committed season.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  excludedBy,
  femaBreach,
  femaNear,
  hardWeeks,
  MAX_HARD_WEEKS,
  nextMonth,
  nextWeek,
  periodBreach,
  readBls,
  readEiaMonthly,
  readEiaWeekly,
  readEurostat,
  readFema,
  ruleBreach,
  tiered,
  wholesaleOk,
  withChanges,
} from '../scripts/season-rules.mjs';

const season = JSON.parse(readFileSync(new URL('../src/season/season.json', import.meta.url), 'utf8'));

const month = (start, value) => ({ start, month: 'x', value });

test('a hole in a series is not a move: the month after it has no change', () => {
  const periods = withChanges([month('2025-08-01', 100), month('2025-09-01', 101), month('2025-11-01', 102), month('2025-12-01', 103)], nextMonth);
  assert.deepEqual(periods.map((p) => p.change), [null, 1, null, 1]);
  const weeks = withChanges([month('2025-08-04', 100), month('2025-08-11', 101), month('2025-08-25', 102)], nextWeek);
  assert.deepEqual(weeks.map((p) => p.change), [null, 1, null]);
  // Without the check the old series read as before.
  assert.deepEqual(withChanges([month('2025-08-01', 100), month('2025-11-01', 102)]).map((p) => p.change), [null, 2]);
});

test('bounds can be drawn from a narrower set, and every period still gets a tier', () => {
  const periods = withChanges([100, 110, 120, 130, 400, 410, 420].map((value, i) => month(`2023-0${i + 1}-01`, value)), nextMonth);
  const all = tiered(periods);
  const narrow = tiered(periods, (p) => p.change != null && Math.abs(p.change) <= 30);
  assert.ok(narrow.bounds.medium < all.bounds.medium);
  assert.equal(narrow.periods.find((p) => p.change === 207.7).tier, 3);
  assert.ok(narrow.periods.every((p) => p.change == null || p.tier != null));
});

test("EIA's weekly page: a Monday's price is the week before it, and the holiday Tuesday keeps its week", () => {
  const html = `<tr><td class='B6'>&nbsp;&nbsp;2023-Jan</td><td class='B5'>01/02&nbsp;</td><td class='B3'>3.223&nbsp;&nbsp;&nbsp;</td><td class='B5'>01/10&nbsp;</td><td class='B3'>3.259&nbsp;&nbsp;&nbsp;</td><td class='B5'>&nbsp;</td><td class='B3'>&nbsp;&nbsp;&nbsp;</td></tr>`;
  const weeks = readEiaWeekly(html);
  assert.deepEqual(weeks.map((w) => [w.start, w.value]), [['2022-12-26', 3.223], ['2023-01-02', 3.259]]);
  assert.equal(weeks[0].month, 'Dec 2022');
  assert.throws(() => readEiaWeekly('<html></html>'));
});

test("EIA's table 9.8: one series, months only", () => {
  const csv = ['"MSN","YYYYMM","Value","Column_Order","Description","Unit"', '"ESRCUUS","202412","16.27","1","a, b","c"', '"ESRCUUS","202413","16.48","1","a, b","c"', '"ESRCUUS","202501","Not Available","1","a, b","c"', '"ESACUUS","202412","9","1","a, b","c"'].join('\n');
  assert.deepEqual(readEiaMonthly(csv, 'ESRCUUS').map((p) => [p.start, p.value]), [['2024-12-01', 16.27]]);
});

test('BLS: months with a number only, and a failed answer stops the bake', () => {
  const data = [
    { year: '2025', period: 'M13', value: '313.2' },
    { year: '2025', period: 'M11', value: '313.9' },
    { year: '2025', period: 'M10', value: '-' },
    { year: '2025', period: 'M09', value: '316.0' },
  ];
  const text = JSON.stringify({ status: 'REQUEST_SUCCEEDED', Results: { series: [{ data }] } });
  assert.deepEqual(readBls(text).map((p) => p.start), ['2025-09-01', '2025-11-01']);
  assert.throws(() => readBls(JSON.stringify({ status: 'REQUEST_NOT_PROCESSED' })));
});

test('Eurostat: a flagged value is left out', () => {
  const csv = ['TIME_PERIOD,OBS_VALUE,OBS_FLAG', '2023-04,120.5,', '2023-05,121.0,p', '2023-06,:,'].join('\n');
  assert.deepEqual(readEurostat(csv).map((p) => p.start), ['2023-04-01']);
});

test('an excluded window holds in its own country, or everywhere without one, and a month counts whole', () => {
  const windows = [['2024-07-07', '2024-07-21', 'Beryl', 'US'], ['2024-04-08', '2024-04-21', 'War']];
  assert.equal(excludedBy(windows, '2024-07-15', false, 'US')?.[2], 'Beryl');
  assert.equal(excludedBy(windows, '2024-07-15', false, 'Italy'), null);
  assert.equal(excludedBy(windows, '2024-04-15', false, 'Spain')?.[2], 'War');
  assert.equal(excludedBy(windows, '2024-04-01', true, 'Spain')?.[2], 'War');
  assert.equal(excludedBy(windows, '2024-04-22', false, 'Spain'), null);
});

const wholesale = { kind: 'power', country: 'Spain', monthly: false };

test('wholesale power: at most 30% and at least 30 EUR/MWh; the bills are not held to it', () => {
  const slot = { kind: 'power', tier: 3 };
  assert.equal(ruleBreach(slot, { tier: 3, change: 27.1, value: 81.9 }, wholesale), null);
  assert.match(ruleBreach(slot, { tier: 3, change: 65.1, value: 71 }, wholesale), /over the 30% limit/);
  assert.match(ruleBreach(slot, { tier: 3, change: -31, value: 71 }, wholesale), /over the 30% limit/);
  assert.match(ruleBreach(slot, { tier: 3, change: 20, value: 29.9 }, wholesale), /under 30 EUR/);
  assert.equal(ruleBreach(slot, { tier: 3, change: 44, value: 18 }, { ...wholesale, monthly: true, country: 'US' }), null);
  assert.equal(wholesaleOk({ change: 30, value: 30 }), true);
  assert.equal(wholesaleOk({ change: null, value: 30 }), false);
});

test('a calm German week moves at most 4%, and a tier that moved stops the bake', () => {
  const germany = { ...wholesale, country: 'Germany' };
  assert.equal(ruleBreach({ kind: 'power', tier: 0 }, { tier: 0, change: 0.9, value: 66 }, germany), null);
  assert.match(ruleBreach({ kind: 'power', tier: 0 }, { tier: 0, change: 11, value: 66 }, germany), /calm German/);
  assert.equal(ruleBreach({ kind: 'power', tier: 0 }, { tier: 0, change: 11, value: 66 }, wholesale), null);
  assert.match(ruleBreach({ kind: 'power', tier: 3 }, { tier: 2, change: 20, value: 66 }, wholesale), /tier is now 2/);
});

const declaration = (number, from, to, declared) => ({ number, name: 'Storms', state: 'KY', type: 'Major Disaster', from, to, declared });

test('FEMA: near by declaration or by incident, and only an incident near the week stops it', () => {
  const list = [declaration(1, '2023-07-25', '2023-07-26', '2023-10-01'), declaration(2, '2023-04-01', '2023-04-02', '2023-07-20'), declaration(3, '2023-01-01', '2023-01-02', '2023-02-01')];
  const near = femaNear(list, '2023-07-24', false);
  assert.deepEqual(near.map((d) => [d.number, d.incidentNear]), [[1, true], [2, false]]);
  assert.match(femaBreach(near, [1, 2], [1]), /big event with loss of life/);
  assert.equal(femaBreach(near, [1, 2], [2]), null);
  assert.match(femaBreach(near, [1], []), /nobody has read: 2/);
});

test("OpenFEMA's rows become declarations, an open incident ending where it began", () => {
  const csv = ['disasterNumber,declarationDate,disasterName,incidentBeginDate,incidentEndDate,declarationType,stateCode,incidentType', '4955,2026-10-27T00:00:00.000Z,"STORMS, AND FLOODS",2026-10-06T00:00:00.000Z,,Major Disaster,FL,Hurricane'].join('\n');
  assert.deepEqual(readFema(csv), [{ number: 4955, type: 'Major Disaster', state: 'FL', name: 'STORMS, AND FLOODS', incident: 'Hurricane', declared: '2026-10-27', from: '2026-10-06', to: '2026-10-06' }]);
});

const rules = { windows: [['2024-11-01', '2024-11-30', 'Election', 'US']], declarations: [], stops: [] };
const usFood = {
  kind: 'food',
  country: 'US',
  monthly: true,
  periods: [
    { start: '2024-10-01', change: 0.1, tier: 1 },
    { start: '2024-11-01', change: 0.1, tier: 1 },
    { start: '2025-07-01', change: 0.1, tier: 1 },
    { start: '2025-08-01', change: 0.4, tier: 2 },
    { start: '2026-01-01', change: null, tier: null },
  ],
};

test('a slot stops the bake when its period breaks a rule, and August 2025 has no next (D9)', () => {
  const slot = { kind: 'food', tier: 1 };
  assert.equal(periodBreach(slot, usFood, 0, rules), null);
  assert.match(periodBreach(slot, usFood, 1, rules), /excluded window, Election/);
  assert.equal(periodBreach(slot, usFood, 2, rules), null);
  assert.match(periodBreach({ kind: 'food', tier: 2 }, usFood, 3, rules), /next period is missing/);
  assert.match(periodBreach(slot, usFood, -1, rules), /missing/);
});

test('only the solidarity week may sit in a window that names it', () => {
  const windows = [['2023-04-24', '2023-05-28', 'Floods (only as the solidarity week)', 'Italy']];
  const food = { kind: 'food', country: 'Italy', monthly: true, periods: [{ start: '2023-05-01', change: 0.8, tier: 3 }, { start: '2023-06-01', change: 0.3, tier: 2 }] };
  assert.match(periodBreach({ kind: 'food', tier: 3 }, food, 0, { windows }), /excluded window/);
  assert.equal(periodBreach({ kind: 'food', tier: 3, solidarity: true }, food, 0, { windows }), null);
});

test('hard weeks as played: a solidarity week presses on nobody, its calm stand-in only by its own tier', () => {
  const hard = { tier: 2 };
  const calm = { tier: 0 };
  const aid = { tier: 3, solidarityPending: {}, calm };
  assert.equal(hardWeeks([hard, hard, aid, calm], true), 2);
  assert.equal(hardWeeks([hard, hard, aid, calm], false), 2);
  assert.equal(hardWeeks([hard, { ...aid, calm: { tier: 3 } }], false), 2);
  assert.equal(hardWeeks([hard, { ...aid, solidarityPending: undefined, solidarity: {} }], true), 1);
});

test('the baked season has the order of the story: kinds, tiers and countries', () => {
  const weeks = season.weeks;
  assert.deepEqual(weeks.map((w) => w.kind), ['fuel', 'power', 'fuel', 'food', 'power', 'fuel', 'power', 'food', 'fuel', 'power', 'fuel', 'food']);
  assert.deepEqual(weeks.map((w) => w.tier), [3, 0, -1, 1, 3, 2, -1, 3, 1, 2, 3, 0]);
  const countries = weeks.map((w) => w.country);
  assert.ok(countries.every((c) => ['Italy', 'Spain', 'Germany', 'US'].includes(c)));
  assert.equal(new Set(countries).size, 4);
  // D5 a, D6 a, D4 a, and the weeks the story fixes.
  assert.deepEqual(countries.flatMap((c, i) => (c === 'Germany' ? [i + 1] : [])), [2]);
  assert.deepEqual(countries.flatMap((c, i) => (c === 'Spain' ? [i + 1] : [])), [4, 5]);
  assert.equal(weeks[10].country, 'US');
  assert.deepEqual([weeks[4].start, weeks[4].change], ['2025-12-08', 27.1]);
  for (const i of [2, 9, 11]) assert.equal(weeks[i].country, 'US');
  assert.ok(['Italy', 'US'].includes(weeks[8].country));
});

test('every baked week names its country, the stand-in too, and the US ones end before the war', () => {
  const stand = season.weeks[7].calm;
  assert.equal(stand.country, 'Italy');
  assert.equal(stand.tier, 0);
  for (const w of [...season.weeks, stand]) {
    assert.equal(typeof w.country, 'string');
    assert.ok(w.start < '2026-02-27', w.start);
    assert.ok(Number.isFinite(w.next));
  }
  // Week 10 is the US's power bills: a month, not a week.
  assert.equal(season.weeks[9].monthly, true);
  assert.equal(season.weeks.filter((w) => w.kind === 'power' && !w.monthly).length, 3);
  assert.ok(season.weeks.filter((w) => w.kind === 'power' && !w.monthly).every((w) => Math.abs(w.change) <= 30));
});

test('the baked season holds at most five hard weeks, with solidarity weeks on or off', () => {
  assert.ok(hardWeeks(season.weeks, true) <= MAX_HARD_WEEKS);
  assert.ok(hardWeeks(season.weeks, false) <= MAX_HARD_WEEKS);
  assert.equal(hardWeeks([...season.weeks, { tier: 2 }], true), hardWeeks(season.weeks, true) + 1);
});

test('the solidarity week is still waiting for its review', () => {
  const week = season.weeks[7];
  assert.ok(week.solidarityPending != null);
  assert.equal(week.solidarity, undefined);
});
