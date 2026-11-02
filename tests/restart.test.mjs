// Starting the season over from the start page, and what the page offers: `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { continueLabel, ENTER_VR, landing, RESTART_WEEK, START_AT_WEEK_ONE } from '../src/restart.ts';

const { Week } = await import('../src/components.ts');

/** The words kept away from real disasters (tests/season.test.mjs) and the panel's own (fits()). */
const FORBIDDEN = /\b(victims?|died|deaths?|lives|tragic|pray|RIP|donate|fund|survivors?|again|quake)\b/i;
const NOT_ON_PANELS = /\b(live|daily|news)\b/i;

test('a restarted week is the week a fresh load starts with', () => {
  // Every field of the Week component goes back to its default, and none is missed.
  assert.deepEqual(Object.keys(RESTART_WEEK).sort(), Object.keys(Week.schema).sort());
  for (const [field, value] of Object.entries(RESTART_WEEK)) assert.equal(value, Week.schema[field].default, field);
  assert.equal(RESTART_WEEK.week, 1);
  assert.equal(RESTART_WEEK.phase, 'shut');
  assert.equal(RESTART_WEEK.shuttersOpen, false);
});

test('with a season saved past week 1, the big button starts over and a small one goes on', () => {
  assert.deepEqual(landing(1, 12), { main: ENTER_VR, restarts: false, resume: null });
  assert.deepEqual(landing(0, 12), { main: ENTER_VR, restarts: false, resume: null });
  assert.deepEqual(landing(5, 12), { main: START_AT_WEEK_ONE, restarts: true, resume: 'Continue at week 5' });
  assert.deepEqual(landing(3, 12), { main: START_AT_WEEK_ONE, restarts: true, resume: 'Continue at week 3' });
  // Never a week past the season's last.
  assert.equal(landing(13, 12).resume, 'Continue at week 12');
});

test("the start page's labels are short, plain English and keep the words away", () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const labels = [ENTER_VR, START_AT_WEEK_ONE];
  for (let week = 2; week <= 12; week += 1) labels.push(continueLabel(week));
  // Every button and option label on the page as written.
  for (const match of page.matchAll(/<(button|label)\b[^>]*>([\s\S]*?)<\/\1>/g)) labels.push(match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  for (const label of labels) {
    assert.ok(label.length > 0 && label.length <= 52, `too long (${label.length}): ${label}`);
    assert.match(label, /^[\x20-\x7e…]+$/, `not plain English: ${label}`);
    assert.doesNotMatch(label, FORBIDDEN, label);
    assert.doesNotMatch(label, NOT_ON_PANELS, label);
  }
});
