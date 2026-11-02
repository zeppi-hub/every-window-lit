// Starting the season over from the start page, and what the page offers: `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { continueLabel, ENTER_VR, HOW_IT_GOES, landing, RESTART_WEEK, sourceLine, START_AT_WEEK_ONE } from '../src/restart.ts';
import { CARD_NOTES, CARD_TITLE, DEV_KEYS, devAction, EMULATOR_KEYS } from '../src/dev-keys.ts';

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

/** A button's label, as in VR, is at most 52 characters; an option's label beside its checkbox on the page may say more. */
const BUTTON_CHARS = 52;
const OPTION_CHARS = 90;

test("the start page's labels are short, plain English and keep the words away", () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const buttons = [ENTER_VR, START_AT_WEEK_ONE];
  for (let week = 2; week <= 12; week += 1) buttons.push(continueLabel(week));
  const options = [];
  // Every button and option label on the page as written.
  const text = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  for (const match of page.matchAll(/<(button|label)\b[^>]*>([\s\S]*?)<\/\1>/g)) (match[1] === 'button' ? buttons : options).push(text(match[2]));
  assert.ok(options.includes('Larger captions') && options.includes('Less motion'), options.join(' | '));
  // The disaster weeks' option says how they are shown, as approved (META_VR_FIKIR.md, the 2D page).
  assert.ok(options.includes('Include weeks that overlap real natural disasters (shown only as the island helping)'), options.join(' | '));
  for (const [labels, most] of [
    [buttons, BUTTON_CHARS],
    [options, OPTION_CHARS],
  ]) {
    for (const label of labels) {
      assert.ok(label.length > 0 && label.length <= most, `too long (${label.length} of ${most}): ${label}`);
      assert.match(label, /^[\x20-\x7e…]+$/, `not plain English: ${label}`);
      assert.doesNotMatch(label, FORBIDDEN, label);
      assert.doesNotMatch(label, NOT_ON_PANELS, label);
    }
  }
});

test("the start page's five points are as written, each at most 90 characters, one on the real data and the made-up town", () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const text = (html) => html.replace(/<small[^>]*>[\s\S]*?<\/small>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const items = [...page.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
  assert.deepEqual(items, [...HOW_IT_GOES]);
  assert.equal(items.length, 5);
  for (const item of items) {
    assert.ok(item.length <= OPTION_CHARS, `too long (${item.length}): ${item}`);
    assert.match(item, /^[\x20-\x7e]+$/, `not plain English: ${item}`);
    assert.doesNotMatch(item, FORBIDDEN, item);
    assert.doesNotMatch(item, NOT_ON_PANELS, item);
  }
  assert.equal(items.filter((item) => /real/.test(item) && /open data/.test(item) && /made up/.test(item)).length, 1);
  // Under it, in small type, filled in from the season: the country and the span of its weeks.
  assert.match(page, /The town is made up\.<small id="data-source"><\/small><\/li>/);
  const weeks = [
    { start: '2024-03-25', month: 'Mar 2024' },
    { start: '2023-01-02', month: 'Jan 2023' },
    { start: '2025-08-01', month: 'Aug 2025' },
  ];
  assert.equal(sourceLine('Italy', weeks), 'Prices: Italy, Jan 2023 to Aug 2025.');
  assert.equal(sourceLine('Italy', weeks.slice(0, 1)), 'Prices: Italy, Mar 2024.');
  assert.ok(sourceLine('Italy', weeks).length <= OPTION_CHARS);
});

test("the dev server's shortcuts never share a key with the emulator's Play mode, and the week is skipped with Shift+W only", () => {
  for (const k of DEV_KEYS) {
    if (!k.shift) assert.ok(!EMULATOR_KEYS.includes(k.code), `${k.key} is a Play mode key`);
    assert.ok(k.does.length <= OPTION_CHARS, k.does);
  }
  // One action per key and Shift.
  assert.equal(new Set(DEV_KEYS.map((k) => `${k.code} ${k.shift}`)).size, DEV_KEYS.length);
  assert.equal(devAction('KeyW', false), null);
  assert.equal(devAction('KeyW', true), 'skipWeek');
  assert.equal(devAction('KeyR', false), null);
  assert.equal(devAction('KeyF', false), null);
  assert.equal(devAction('KeyP', false), 'rope');
  assert.equal(devAction('KeyH', false), 'window');
  assert.ok(DEV_KEYS.some((k) => k.key === 'Shift+W'));
  // The card's own words.
  assert.equal(CARD_TITLE, 'Emulator controls');
  for (const note of CARD_NOTES) {
    assert.ok(note.length <= OPTION_CHARS, note);
    assert.doesNotMatch(note, FORBIDDEN, note);
  }
});

test('the card and the shortcuts are loaded only by the dev server: nothing of them is in the page or a static import', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const words of [CARD_TITLE, ...CARD_NOTES, 'Shift+W']) assert.ok(!page.includes(words), words);
  const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /^import .*dev-(tools|keys)/m);
  const loads = [...index.matchAll(/^.*import\('\.\/dev-tools\.js'\).*$/gm)].map((m) => m[0]);
  assert.equal(loads.length, 2);
  for (const line of loads) assert.match(line, /if \(import\.meta\.env\.DEV\) void import\('\.\/dev-tools\.js'\)/, line);
});

test("the card's short click is true for every first-week step: each thing to touch takes a ray's press", () => {
  // The Emulator controls card says a short click on the lit thing works for every step (Devir 1b item 13 walked it
  // with controller clicks only). A click is a ray's press: the thing needs a RayInteractable, and something that turns
  // the press into the step (a PokeButton, or the choices' own tap in ChoiceSystem).
  assert.match(CARD_NOTES.join(' '), /short click on the lit thing works for every step/);
  // Its code without the comments (they hold semicolons of their own).
  const build = readFileSync(new URL('../src/station/build.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  /** The chain of components given to the entity made from `made`, up to the end of its statement. */
  const chain = (made) => {
    const at = build.indexOf(`.createTransformEntity(${made}, persistent)`);
    assert.ok(at >= 0, made);
    return build.slice(at, build.indexOf(';', at));
  };
  for (const [step, made, signal] of [
    ['latch, and the close', 'parts.latch', 'latch'],
    ['rope', 'parts.toggle', 'rope'],
    ['lever', 'parts.lever', 'lower'],
    ["Nora's house on the model", 'maquette.house', 'window'],
    ['sun, and on to Sunday', 'sun.sun', 'sun'],
  ]) {
    const c = chain(made);
    assert.match(c, /addComponent\(RayInteractable\)/, `${step}: no ray`);
    assert.match(c, new RegExp(`addComponent\\(PokeButton, \\{ signal: '${signal}'`), `${step}: nothing fires ${signal}`);
  }
  // The three things (ChoiceSystem taps a press) and the lamp (one of Tocco's pokeable things, each given a ray).
  assert.match(chain('mesh'), /addComponent\(Choice, \{ index \}\)[\s\S]*addComponent\(RayInteractable\)/);
  assert.match(build, /\[tocco\.lamp, 'lamp'\]/);
  assert.match(chain('object'), /addComponent\(RayInteractable\)[\s\S]*addComponent\(PokeButton, \{ signal \}\)/);
});

test('a fingertip on the three things or on the brass sun taps them once: their grab handle ignores the touch pointer', () => {
  // A touch that starts IWSDK's grab handle on a free thing moves it with the finger, so the touch never ends and the
  // thing stays stuck to the finger; on the sun the touch flickered and one poke made two taps (Devir 1b item 13, hand
  // walk of the first week). touch-taps.ts gives such a handle a filter that refuses the touch pointer; a pinch (the
  // grab pointer) and a ray still take hold, and the touch's own press taps the thing as the finger lifts.
  const taps = readFileSync(new URL('../src/touch-taps.ts', import.meta.url), 'utf8');
  assert.match(taps, /const notTouch = \(event: \{ pointerType: string \}\): boolean => event\.pointerType !== 'touch';/);
  assert.match(taps, /ComponentRegistry\.getById\('Handle'\)/);
  assert.match(taps, /made\.filter = notTouch;/);
  const choice = readFileSync(new URL('../src/systems/choice.ts', import.meta.url), 'utf8');
  assert.match(choice, /for \(const entity of this\.queries\.choices\.entities\) tapOnlyByTouch\(entity\);/);
  const sun = readFileSync(new URL('../src/systems/sun.ts', import.meta.url), 'utf8');
  assert.match(sun, /tapOnlyByTouch\(dial\);/);
  // The things and the sun are grabbables a fingertip presses, and the sun's press fires its own signal (build.ts).
  const build = readFileSync(new URL('../src/station/build.ts', import.meta.url), 'utf8');
  assert.match(build, /addComponent\(Choice, \{ index \}\)\s*\.addComponent\(OneHandGrabbable, \{ rotate: true, translate: true \}\)\s*\.addComponent\(PokeInteractable\)/);
  assert.match(build, /addComponent\(SunDial, \{ x0, x1 \}\)[\s\S]*?addComponent\(PokeInteractable\)[\s\S]*?addComponent\(PokeButton, \{ signal: 'sun' \}\)/);
});
