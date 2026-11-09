// What is said at most once a season stays through a reload, and nothing of it reaches the next season.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './station-hooks.mjs';

const stored = new Map();
globalThis.window = Object.assign(globalThis.window ?? {}, {
  localStorage: { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) },
});

const { load, save } = await import('../src/save.ts');
const store = await import('../src/season/store.ts');
const pass = { chosen: -1, call: -1, tocco: -1 };

test('a reload keeps what was said once, and only true flags are read', () => {
  save({ kept: [], settled: 0, asked: true, unsure: true, frame: true });
  assert.deepEqual(load(), { kept: [], settled: 0, asked: true, unsure: true, frame: true });
  save({ kept: [], settled: 0, asked: 'yes' });
  assert.deepEqual(load(), { kept: [], settled: 0 });
});

test('the season remembers what was said, its finds, and forgets them when it starts again', () => {
  store.restartSeason();
  for (const what of ['asked', 'unsure', 'frame', 'key']) assert.equal(store.saidThisSeason(what), false, what);
  store.noteSaid('asked');
  store.noteSaid('unsure');
  store.noteSaid('frame');
  assert.deepEqual(load().asked, true);
  store.noteDrawingSeen();
  assert.equal(store.drawingSeen(), true);
  store.keepWeek(pass);
  assert.equal(store.drawingSeen(), true, 'kept with the week');
  store.restartSeason();
  for (const what of ['asked', 'unsure', 'frame', 'key']) assert.equal(store.saidThisSeason(what), false, what);
  assert.equal(store.drawingSeen(), false);
  assert.equal(load().asked, undefined);
});

test('a sample season leaves them as they were', () => {
  store.restartSeason();
  store.noteSaid('asked');
  store.startSample([pass]);
  assert.equal(store.saidThisSeason('asked'), false);
  store.noteSaid('unsure');
  store.leaveSample();
  assert.equal(store.saidThisSeason('asked'), true);
  assert.equal(store.saidThisSeason('unsure'), false);
  assert.equal(load().unsure, undefined);
  store.restartSeason();
});

test('a season played to its end leaves nothing for the next one', async () => {
  const { readFileSync } = await import('node:fs');
  store.restartSeason();
  store.noteSaid('asked');
  store.noteSaid('unsure');
  for (let n = 1; n <= 12; n += 1) {
    if (n === 3) store.noteGlobePlaced();
    if (n === 4) store.noteMarkSeen();
    if (n === 6) store.noteDrawingSeen();
    if (n === 7) store.noteSaid('frame');
    if (n === 11) store.noteGlobe('sent');
    if (n === 12) {
      assert.equal(store.globeChoice(), 'sent');
      assert.equal(store.currentTown().drawingSeen, true);
      assert.equal(store.markSeen(), true);
    }
    store.keepWeek(n === 8 ? { ...pass, aid: true } : pass);
  }
  // As ToccoSystem.keep does when no morning follows the last week.
  store.markSettled();
  store.restartSeason();
  const town = store.currentTown();
  assert.equal(town.week, 1);
  assert.deepEqual([town.globe, town.answer, town.globePlaced, town.markSeen, town.drawingSeen, town.pressed], [null, null, false, false, false, 0]);
  for (const what of ['asked', 'unsure', 'frame', 'key']) assert.equal(store.saidThisSeason(what), false, what);
  assert.equal(store.drawingSeen(), false);
  assert.equal(store.markSeen(), false);
  assert.equal(store.globePlaced(), false);
  assert.equal(store.globeChoice(), null);
  assert.deepEqual(load(), { kept: [], settled: 0 });
  // What only ToccoSystem holds goes with it, in the same branch of keep().
  const tocco = readFileSync(new URL('../src/systems/tocco.ts', import.meta.url), 'utf8');
  const end = tocco.slice(tocco.indexOf('this.say(SEASON_OVER)'), tocco.indexOf('this.seasonOver = true;'));
  for (const reset of ['this.townMark = false', 'setSpyglassLineSaid(false)', 'restartSeason()']) assert.ok(end.includes(reset), reset);
});
