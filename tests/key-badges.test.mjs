// The dev server's key badges in the emulator (src/key-badges.ts, drawn by src/dev-badges.ts): which key each step
// shows, where the row of badges stands beside Tocco's line, and that none of it is loaded outside the dev server.
// Seen from the seated eye at either caption size: every badge's middle within 30 degrees of straight ahead, every
// edge within 46 across, 35 down and 20 up (K1); never over his line, the family's box or its line, or another badge.
// `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const { Box3, Object3D, Vector3 } = await import('@iwsdk/core');
const { SEAT_EYE } = await import('../src/station/layout.ts');
const { ASK_LIFT, createTocco, faceSeat, LINE_AT_BASKET, LINE_HOME, LINE_LOW, LINE_SIZE, STEP_PLACES, storyPlace } = await import('../src/station/tocco.ts');
const { ASK_SIZE } = await import('../src/station/ask.ts');
const { bandOf, captionSize, layoutLine, LINE_CANVAS } = await import('../src/station/caption.ts');
const { BADGE_CANVAS, badgeSize, badgesShown, CENTRE_MOST, EDGE_MOST, keyOf, loadBadges, placeBadges, seenOnPanel, STEP_BADGES, toggleBadges, TOCCO_END } = await import('../src/key-badges.ts');
const { DEV_KEYS } = await import('../src/dev-keys.ts');
const { instructionLine, HELP, TAGS, TAP_ME } = await import('../src/season/lines.ts');
const { BOX_DISPLAY, BOX_SCALE, createFamily, placeRiders } = await import('../src/station/family.ts');
const { createMaquette, MAQUETTE, maquetteY } = await import('../src/station/maquette.ts');

const METRES_PER_PX = LINE_SIZE.h / LINE_CANVAS.h;
const SIZES = [
  ['normal', false],
  ['larger', true],
];

/** Degrees right of and above straight ahead, from the seated eye. */
function seen(p) {
  const dx = p.x - SEAT_EYE.x;
  const dz = SEAT_EYE.z - p.z;
  return { yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: (Math.atan2(p.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI };
}

/** A point `across` m right and `up` m above the middle of a panel at `at` that faces the seat (three.js, as ToccoSystem places his line). */
function onPanel(at, across, up) {
  const home = new Object3D();
  faceSeat(home, at);
  return new Vector3(across, up, 0).applyQuaternion(home.quaternion).add(home.position);
}

/** A rectangle on a panel at `at` (px from its middle, y up), as an angular box from the seat. */
function boxSeen(at, x0, x1, y0, y1) {
  const out = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  for (const sx of [0, 0.25, 0.5, 0.75, 1]) {
    for (const sy of [0, 1]) {
      const { yaw, pitch } = seen(onPanel(at, (x0 + (x1 - x0) * sx) * METRES_PER_PX, (y0 + (y1 - y0) * sy) * METRES_PER_PX));
      out.yaw0 = Math.min(out.yaw0, yaw);
      out.yaw1 = Math.max(out.yaw1, yaw);
      out.pitch0 = Math.min(out.pitch0, pitch);
      out.pitch1 = Math.max(out.pitch1, pitch);
    }
  }
  return out;
}

/** Degrees between two angular boxes (negative: they overlap by that much). */
const apart = (a, b) => Math.max(a.yaw0 - b.yaw1, b.yaw0 - a.yaw1, a.pitch0 - b.pitch1, b.pitch0 - a.pitch1);
const span = (r) => `${r.yaw0.toFixed(1)} to ${r.yaw1.toFixed(1)} across, ${r.pitch0.toFixed(1)} to ${r.pitch1.toFixed(1)} up`;

/** Text widths as a browser's 600-weight system font gives them, about; `wide` errs on the wide side. */
const measures = {
  usual: (text, px) => text.length * px * 0.53,
  wide: (text, px) => text.length * px * 0.62,
};

/** Every line a badge stands beside, where it hangs and at which end: each step's instruction (weeks 1, 2 and 7) and help line, and Tocco's "Tap me". */
function badgeLines() {
  const out = [];
  for (const [step, keys] of Object.entries(STEP_BADGES)) {
    if (keys.length === 0 || step === 'tocco' || step === 'call') continue;
    const { at, arrow } = STEP_PLACES[step];
    const texts = new Set([1, 2, 7].map((n) => instructionLine(step, n, 12)).filter((t) => t !== ''));
    if (step in HELP) texts.add(HELP[step]);
    for (const text of texts) out.push({ what: step, text, at, end: arrow.end, arrow: true });
  }
  // "Tap me" is a story line of the first week: where those hang, without an arrow, the badge on his side.
  const places = new Set(['shut', 'morning', 'bell', 'rising', 'choosing', 'lowering', 'landed', 'days', 'sunday'].map((phase) => storyPlace(phase, 1, false)));
  for (const at of places) out.push({ what: 'tocco', text: TAP_ME, at, end: TOCCO_END, arrow: false });
  // The Sunday question, over the arrows, from the second week.
  out.push({ what: 'call', text: 'Power next week: up or down? I say up.', at: storyPlace('sunday', 2, true), end: TOCCO_END, arrow: false });
  return out;
}

/**
 * Every way a row of badges is laid out: each line above at either caption size, measured narrow and wide, and the
 * extremes of its place (the widest band of one and two rows, and a short one).
 */
function layouts() {
  const out = [];
  for (const line of badgeLines()) {
    for (const [name, large] of SIZES) {
      const size = captionSize(large);
      const bands = [];
      for (const [how, measure] of Object.entries(measures)) {
        bands.push([`"${line.text}" measured ${how}`, layoutLine(line.text, size, line.arrow, (row) => measure(row, size.font)).band, measure]);
      }
      for (const rows of [1, 2]) {
        for (const widest of [200, LINE_CANVAS.w]) bands.push([`${rows} rows ${widest} px wide`, bandOf(rows, widest, size, LINE_CANVAS, line.arrow), measures.wide]);
      }
      for (const [how, band, measure] of bands) {
        const badges = placeBadges(STEP_BADGES[line.what], band, line.end, line.at, size, METRES_PER_PX, measure);
        out.push({ ...line, size: name, large, how, band, badges, where: `${line.what} badge, ${name} captions, ${how}` });
      }
    }
  }
  return out;
}
const ALL = layouts();

test("each step's badge shows the key that does that step, and every step the Keeper acts on has one", () => {
  // The shortcut each step needs (dev-tools.ts carries them out).
  const needs = {
    latch: ['latch'],
    bell: ['rope'],
    choosing: ['choose0', 'choose1', 'choose2'],
    chosen: ['lower'],
    model: ['window'],
    visit: ['window'],
    sun: ['sun'],
    sunOn: ['sun'],
    lamp: ['lamp'],
    look: [],
    close: ['latch'],
    knock: ['knock'],
    tocco: ['tocco'],
    call: ['up', 'down'],
  };
  assert.deepEqual(Object.keys(STEP_BADGES).sort(), [...Object.keys(STEP_PLACES), 'tocco', 'call'].sort(), 'a badge entry for every step, for Tocco and for the Sunday call');
  for (const [what, keys] of Object.entries(STEP_BADGES)) assert.deepEqual(keys.map((k) => k.action), needs[what], what);
  // The keys as agreed: latch O, rope P, the three things 1 2 3, lever B, Nora's window I, knock K, sun N, lamp M, Tocco T.
  const shown = Object.fromEntries(Object.entries(STEP_BADGES).map(([what, keys]) => [what, keys.map((k) => keyOf(k.action)).join(' ')]));
  assert.deepEqual(shown, { latch: 'O', bell: 'P', choosing: '1 2 3', chosen: 'B', model: 'I', visit: 'I', sun: 'N', sunOn: 'N', lamp: 'M', look: '', close: 'O', knock: 'K', tocco: 'T', call: 'U V' });
  // Never the week's skip, the spyglass, or a key the card leaves off.
  for (const keys of Object.values(STEP_BADGES)) {
    for (const k of keys) {
      assert.notEqual(k.action, 'skipWeek');
      assert.ok(DEV_KEYS.find((d) => d.action === k.action)?.listed, k.action);
    }
  }
  // The three things: 1, 2 and 3 from left to right as on the sill, each named as its first-week tag names it.
  assert.deepEqual(STEP_BADGES.choosing.map((k) => k.label), [...TAGS]);
  for (const layout of ALL.filter((l) => l.what === 'choosing')) {
    assert.deepEqual(layout.badges.map((b) => b.key), ['1', '2', '3'], layout.where);
    assert.ok(layout.badges[0].x < layout.badges[1].x && layout.badges[1].x < layout.badges[2].x, layout.where);
  }
});

test('the badges stand above the band at the end on the thing\'s side, pulled in only as far as K1 needs', (t) => {
  for (const l of ALL) {
    const s = badgeSize(captionSize(l.large));
    const bandTop = l.band.lift + l.band.h / 2;
    for (const b of l.badges) assert.ok(b.y - b.h / 2 >= bandTop + s.rise - 0.01, `${l.where}: badge foot ${b.y - b.h / 2} px, band top ${bandTop}`);
    const left = Math.min(...l.badges.map((b) => b.x - b.w / 2));
    const right = Math.max(...l.badges.map((b) => b.x + b.w / 2));
    // Flush with the band's end where K1 allows, else no more than the 2 px step inside the limit.
    const flush = l.end === 'right' ? Math.abs(right - l.band.w / 2) < 0.01 : Math.abs(left + l.band.w / 2) < 0.01;
    if (!flush) {
      const outer = l.end === 'right' ? l.badges.at(-1) : l.badges[0];
      const nudge = l.end === 'right' ? 2 : -2;
      const out = seenOnPanel(l.at, (outer.x + nudge) * METRES_PER_PX, outer.y * METRES_PER_PX).yaw;
      const edge = seenOnPanel(l.at, (outer.x + nudge + (Math.sign(nudge) * outer.w) / 2) * METRES_PER_PX, outer.y * METRES_PER_PX).yaw;
      assert.ok(Math.abs(out) > CENTRE_MOST || Math.abs(edge) > EDGE_MOST, `${l.where}: pulled in further than K1 needs`);
    }
    // The row fits the badges' canvas (dev-badges.ts), and the tallest badge its height.
    assert.ok(right - left <= BADGE_CANVAS.w - 8, `${l.where}: a row ${right - left} px wide`);
    assert.ok(l.badges[0].h <= BADGE_CANVAS.h - 8, `${l.where}: a badge ${l.badges[0].h} px tall`);
  }
  const rows = ALL.filter((l) => l.how.startsWith('"') && l.how.endsWith('usual'));
  for (const l of rows) {
    const b = boxSeen(l.at, Math.min(...l.badges.map((x) => x.x - x.w / 2)), Math.max(...l.badges.map((x) => x.x + x.w / 2)), l.badges[0].y - l.badges[0].h / 2, l.badges[0].y + l.badges[0].h / 2);
    t.diagnostic(`${l.where}: ${span(b)}`);
  }
});

test('my panel geometry agrees with the three.js panel his line hangs on', () => {
  for (const at of [LINE_LOW, LINE_HOME, LINE_AT_BASKET, STEP_PLACES.knock.at]) {
    for (const [u, v] of [
      [0, 0],
      [0.12, 0.03],
      [-0.15, -0.02],
    ]) {
      const mine = seenOnPanel(at, u, v);
      const theirs = seen(onPanel(at, u, v));
      assert.ok(Math.abs(mine.yaw - theirs.yaw) < 1e-6 && Math.abs(mine.pitch - theirs.pitch) < 1e-6, `${JSON.stringify(at)} ${u} ${v}`);
    }
  }
});

test('every badge is in the reading band at either caption size: its middle within 30 degrees, its edges within 46 across, 35 down and 20 up', () => {
  for (const l of ALL) {
    for (const b of l.badges) {
      const middle = seen(onPanel(l.at, b.x * METRES_PER_PX, b.y * METRES_PER_PX));
      assert.ok(Math.abs(middle.yaw) <= 30, `${l.where} [${b.key}]: middle ${middle.yaw.toFixed(1)} degrees to the side`);
      assert.ok(middle.pitch <= 20 && middle.pitch >= -35, `${l.where} [${b.key}]: middle ${middle.pitch.toFixed(1)} degrees up`);
      const box = boxSeen(l.at, b.x - b.w / 2, b.x + b.w / 2, b.y - b.h / 2, b.y + b.h / 2);
      assert.ok(box.yaw0 >= -46 && box.yaw1 <= 46, `${l.where} [${b.key}]: ${span(box)}`);
      assert.ok(box.pitch0 >= -35 && box.pitch1 <= 20, `${l.where} [${b.key}]: ${span(box)}`);
    }
  }
});

test('no badge lies over his line, nor over another badge', (t) => {
  // The badges' panel lies 2 mm in front of his line's, turned with it: apart on the panel is apart in the view.
  let nearest = Infinity;
  for (const l of ALL) {
    const top = l.band.lift + l.band.h / 2;
    l.badges.forEach((b, i) => {
      const foot = b.y - b.h / 2;
      assert.ok(foot >= top + 8, `${l.where} [${b.key}]: its foot ${foot} px, the band's top ${top}`);
      for (const x of [b.x - b.w / 2, b.x, b.x + b.w / 2]) {
        nearest = Math.min(nearest, seen(onPanel(l.at, x * METRES_PER_PX, foot * METRES_PER_PX)).pitch - seen(onPanel(l.at, x * METRES_PER_PX, top * METRES_PER_PX)).pitch);
      }
      for (const other of l.badges.slice(i + 1)) {
        assert.ok(other.x - other.w / 2 >= b.x + b.w / 2 + 4, `${l.where}: [${b.key}] and [${other.key}] touch`);
      }
    });
  }
  t.diagnostic(`a badge's foot stands at least ${nearest.toFixed(2)} degrees over the band's top right under it`);
});

// The family's box, with its glass, hook and line, as it floats in the window: the knock's is the one line up with it.
const family = createFamily(new Vector3(-2.6, -2.6, -26.9));
const centre = new Vector3(BOX_DISPLAY.x, BOX_DISPLAY.y, BOX_DISPLAY.z);
family.box.position.copy(centre);
family.box.scale.setScalar(BOX_SCALE);
placeRiders(centre, BOX_SCALE, family.glass.position, family.hook.position, family.line.position);
family.glass.scale.setScalar(BOX_SCALE);
family.hook.scale.setScalar(BOX_SCALE);

/** The angular box of every point of a thing's meshes. */
function thingSeen(object) {
  object.updateMatrixWorld(true);
  const out = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  const v = new Vector3();
  object.traverse((o) => {
    const position = o.geometry?.attributes?.position;
    if (position == null) return;
    for (let i = 0; i < position.count; i += 1) {
      const { yaw, pitch } = seen(v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
      out.yaw0 = Math.min(out.yaw0, yaw);
      out.yaw1 = Math.max(out.yaw1, yaw);
      out.pitch0 = Math.min(out.pitch0, pitch);
      out.pitch1 = Math.max(out.pitch1, pitch);
    }
  });
  return out;
}

/** The family's widest two-row band at either caption size, over their box. */
function familyBand() {
  const line = family.line;
  line.updateMatrixWorld(true);
  const { width, height } = line.geometry.parameters;
  const out = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  for (const large of [false, true]) {
    const band = bandOf(2, LINE_CANVAS.w, captionSize(large));
    for (const sx of [-1, 0, 1]) {
      for (const sy of [-1, 1]) {
        const { yaw, pitch } = seen(new Vector3((sx * band.w * width) / (2 * LINE_CANVAS.w), ((band.lift + (sy * band.h) / 2) * height) / LINE_CANVAS.h, 0).applyMatrix4(line.matrixWorld));
        out.yaw0 = Math.min(out.yaw0, yaw);
        out.yaw1 = Math.max(out.yaw1, yaw);
        out.pitch0 = Math.min(out.pitch0, pitch);
        out.pitch1 = Math.max(out.pitch1, pitch);
      }
    }
  }
  return out;
}

test("the knock's badge, the one up with the family's box, keeps clear of the box, its glass, its hook and the family's line", (t) => {
  const things = [
    ['the box', thingSeen(family.box)],
    ['its glass', thingSeen(family.glass)],
    ['its hook', thingSeen(family.hook)],
    ["the family's line", familyBand()],
  ];
  const knocks = ALL.filter((l) => l.what === 'knock');
  assert.ok(knocks.length > 0);
  for (const l of knocks) {
    for (const b of l.badges) {
      const box = boxSeen(l.at, b.x - b.w / 2, b.x + b.w / 2, b.y - b.h / 2, b.y + b.h / 2);
      for (const [name, it] of things) {
        const gap = apart(box, it);
        assert.ok(gap >= 0.5, `${l.where} [${b.key}] at ${span(box)} meets ${name} at ${span(it)}`);
        if (l.how.endsWith('usual')) t.diagnostic(`${l.size}: the knock badge and ${name} ${gap.toFixed(1)} degrees apart`);
      }
    }
  }
});

test('the badges beside the low line leave the little model uncovered, and those beside him keep clear of his question panel and of him', (t) => {
  // The model is the thing to touch in the first week's family step: its badge must not hide it, nor any other low
  // badge (on its block in the first week, on the stone from the second).
  for (const week of [1, 2]) {
    const maquette = createMaquette();
    const model = new Object3D();
    model.add(maquette.group, maquette.house);
    model.position.y = maquetteY(week) - MAQUETTE.y;
    const it = thingSeen(model);
    let nearest = Infinity;
    for (const l of ALL.filter((x) => x.at === LINE_LOW)) {
      for (const b of l.badges) {
        const gap = apart(boxSeen(l.at, b.x - b.w / 2, b.x + b.w / 2, b.y - b.h / 2, b.y + b.h / 2), it);
        assert.ok(gap > 0.5, `${l.where} [${b.key}] covers the little model (week ${week})`);
        nearest = Math.min(nearest, gap);
      }
    }
    t.diagnostic(`week ${week}: the low badges keep ${nearest.toFixed(1)} degrees from the little model`);
  }
  // His questions open above his line beside him (the badges hide meanwhile, dev-badges.ts); and he stands left of it.
  const ask = boxSeen(LINE_HOME, (-ASK_SIZE.w / 2) / METRES_PER_PX, ASK_SIZE.w / 2 / METRES_PER_PX, (ASK_LIFT - ASK_SIZE.h / 2) / METRES_PER_PX, (ASK_LIFT + ASK_SIZE.h / 2) / METRES_PER_PX);
  const tocco = thingSeen(createTocco().tocco);
  let toAsk = Infinity;
  for (const l of ALL.filter((x) => x.at === LINE_HOME)) {
    for (const b of l.badges) {
      const box = boxSeen(l.at, b.x - b.w / 2, b.x + b.w / 2, b.y - b.h / 2, b.y + b.h / 2);
      assert.ok(apart(box, tocco) > 0.5, `${l.where} [${b.key}] at ${span(box)} covers Tocco at ${span(tocco)}`);
      toAsk = Math.min(toAsk, apart(box, ask));
    }
  }
  t.diagnostic(`beside him the badges come ${toAsk.toFixed(1)} degrees from his question panel (never up together)`);
});

test('H hides the badges and shows them again, remembered where storage allows, and the page works without storage', () => {
  const store = new Map();
  const storage = () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  assert.equal(loadBadges(storage), true, 'shown at first');
  assert.equal(toggleBadges(storage), false);
  assert.equal(loadBadges(storage), false, 'remembered hidden');
  assert.equal(toggleBadges(storage), true);
  assert.equal(loadBadges(storage), true);
  // Storage missing, or throwing as in a private window: shown, and H still toggles for this visit.
  const blocked = () => {
    throw new Error('blocked');
  };
  const throwing = () => ({
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  });
  for (const none of [blocked, throwing, () => null]) {
    assert.equal(loadBadges(none), true);
    assert.equal(toggleBadges(none), false);
    assert.equal(badgesShown(), false);
    assert.equal(toggleBadges(none), true);
  }
});

test("the badges and their 2D line are the emulator's: a headset's browser on the dev server gets neither", async () => {
  const { inEmulator } = await import('../src/dev-badges.ts');
  const inPage = (profile) => {
    globalThis.window = { __IWSDK_EMULATION_PROFILE: profile };
    const out = inEmulator();
    delete globalThis.window;
    return out;
  };
  assert.equal(inPage({ active: true, device: 'metaQuest3', runtime: 'IWER' }), true);
  // As the dev server's injected script marks a Quest's browser: nothing emulated, or the native variants.
  assert.equal(inPage({ active: false, device: null, runtime: null }), false);
  assert.equal(inPage({ active: true, device: 'metaQuest3', runtime: 'IWER-native-override' }), false);
  assert.equal(inPage({ active: true, device: 'metaVRGlasses', runtime: 'IWER-native-gaze' }), false);
  assert.equal(inPage(undefined), false);
  assert.match(readFileSync(new URL('../src/dev-tools.ts', import.meta.url), 'utf8'), /if \(inEmulator\(\)\) \{\n\s*const note = /);
});

test('the badges are the dev server\'s only: loaded by dev-tools.ts alone, and his panel told of them only in a dev build', () => {
  const src = new URL('../src/', import.meta.url);
  const files = readdirSync(src, { recursive: true }).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const text = readFileSync(new URL(file, src), 'utf8');
    for (const module of ['dev-badges', 'key-badges', 'dev-tools']) {
      const imports = new RegExp(`(from|import\\()\\s*'[./]*${module}\\.js'`).test(text);
      const allowed = module === 'dev-tools' ? file === 'index.ts' : module === 'key-badges' ? ['dev-tools.ts', 'dev-badges.ts'].includes(file) : file === 'dev-tools.ts';
      if (imports) assert.ok(allowed, `${file} loads ${module}`);
    }
  }
  // dev-tools.ts registers the badges' system; ToccoSystem tells them what is on his panel only in a dev build.
  assert.match(readFileSync(new URL('dev-tools.ts', src), 'utf8'), /world\.registerSystem\(KeyBadgeSystem\)/);
  const tocco = readFileSync(new URL('systems/tocco.ts', src), 'utf8');
  const calls = [...tocco.matchAll(/^.*setLinePanel\(.*$/gm)].map((m) => m[0]).filter((line) => !/^import /.test(line));
  assert.equal(calls.length, 2);
  for (const line of calls) assert.match(line, /^\s*if \(import\.meta\.env\.DEV\) setLinePanel\(/, line);
});
