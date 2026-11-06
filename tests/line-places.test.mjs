// Where Tocco's line and his question panel hang, seen from the seated eye: every place they can take stays in
// the comfortable band for reading, their middles within 30 degrees either side, and every edge at most 20 up and 35
// down. How far the bands' ends reach sideways is reported, not asserted, until that limit is decided.
// `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Box3, Object3D, Vector3 } = await import('@iwsdk/core');
const { BASKET_ON_SILL, CARD_IN_BASKET, SEAT_EYE, SILL } = await import('../src/station/layout.ts');
const { ASK_ROWS, ASK_SIZE } = await import('../src/station/ask.ts');
const { ASK_LIFT, createTocco, faceSeat, JAR_ARROW, LINE_AT_BASKET, LINE_BY_BOX, LINE_HOME, LINE_LOW, LINE_SIZE, LINE_SUNDAY, STEP_PLACES, storyPlace } = await import('../src/station/tocco.ts');
const { arrowRoom, arrowSpot, askSize, bandOf, BREAK_MARK, breakRows, captionSize, layoutLine, LINE_CANVAS, rowRoom } = await import('../src/station/caption.ts');
const { stepOf } = await import('../src/line-queue.ts');
const { choosingLine, FIRST_WEEK, HELP, INTRO, phaseLine } = await import('../src/season/lines.ts');
const { JAR_POSITION } = await import('../src/station/card.ts');

/** Degrees right of and above straight ahead, from the seated eye. */
function seen(p) {
  const dx = p.x - SEAT_EYE.x;
  const dz = SEAT_EYE.z - p.z;
  return { yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: (Math.atan2(p.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI };
}

function inBand(name, p) {
  const { yaw, pitch } = seen(p);
  assert.ok(Math.abs(yaw) <= 30, `${name} centre ${yaw.toFixed(1)} degrees to the side`);
  assert.ok(pitch <= 20, `${name} centre ${pitch.toFixed(1)} degrees up`);
  assert.ok(pitch >= -35, `${name} centre ${(-pitch).toFixed(1)} degrees down`);
}

/** A point `lift` above `at` along a panel there that faces the seat (as ToccoSystem lays out his questions). */
function lifted(at, lift) {
  return sideways(at, 0, lift);
}

/** A point `across` to the right and `lift` above `at`, on a panel there that faces the seat. */
function sideways(at, across, lift) {
  const home = new Object3D();
  faceSeat(home, at);
  return new Vector3(across, lift, 0).applyQuaternion(home.quaternion).add(home.position);
}

test("each place Tocco's line hangs is in the reading band", () => {
  inBand('his line beside him', LINE_HOME);
  inBand('his line over the basket', LINE_AT_BASKET);
  inBand('his line over the Sunday arrows', LINE_SUNDAY);
  inBand('his line low in the middle', LINE_LOW);
  inBand('his line beside the family box', LINE_BY_BOX);
  // Every step's place and every story line's place is one of these; beside the family box only the first week's knock.
  const places = [LINE_HOME, LINE_AT_BASKET, LINE_SUNDAY, LINE_LOW, LINE_BY_BOX];
  for (const [step, { at }] of Object.entries(STEP_PLACES)) assert.ok(places.includes(at), step);
  assert.deepEqual(Object.keys(STEP_PLACES).filter((step) => STEP_PLACES[step].at === LINE_BY_BOX), ['knock']);
  for (const n of [1, 2, 7]) {
    for (const phase of ['shut', 'morning', 'bell', 'rising', 'choosing', 'lowering', 'landed', 'days', 'sunday']) {
      for (const arrows of [false, true]) assert.ok(places.includes(storyPlace(phase, n, arrows)), `${phase}, week ${n}`);
    }
  }
});

test('his question panel and each of its rows are in the reading band, beside him and over the Sunday arrows', () => {
  for (const [where, place] of [
    ['beside him', LINE_HOME],
    ['over the Sunday arrows', LINE_SUNDAY],
  ]) {
    inBand(`the question panel ${where}`, lifted(place, ASK_LIFT));
    for (let i = 0; i < ASK_ROWS; i += 1) inBand(`question row ${i + 1} ${where}`, lifted(place, ASK_LIFT + (1 - i) * (ASK_SIZE.h / ASK_ROWS)));
  }
});

test('over the Sunday arrows the question panel opens above his line there, not on it', () => {
  // The panel's foot stands above the top of his tallest band there (two rows at the larger size), by a margin.
  const { line } = createTocco();
  const metresPerPx = line.geometry.parameters.height / LINE_CANVAS.h;
  const band = bandOf(2, LINE_CANVAS.w, captionSize(true));
  const lineTop = seen(lifted(LINE_SUNDAY, (band.lift + band.h / 2) * metresPerPx)).pitch;
  const panelFoot = seen(lifted(LINE_SUNDAY, ASK_LIFT - ASK_SIZE.h / 2)).pitch;
  assert.ok(panelFoot > lineTop + 0.5, `panel foot ${panelFoot.toFixed(1)} degrees, line top ${lineTop.toFixed(1)}`);
});

// Larger captions (comfort.ts) draw the text at 68 px instead of 52 on the same panels: the band and its rows must
// still fit the canvas, so a larger line hangs where a normal one does and its text stays in the band for reading.
const SIZES = [
  ['normal', false],
  ['larger', true],
];

test('a line of one or two rows fits its canvas at either caption size, its rows inside the band', () => {
  for (const [name, large] of SIZES) {
    const size = captionSize(large);
    assert.equal(size.font, large ? 68 : 52);
    assert.ok(Math.abs(size.step / size.font - 1.2) <= 0.02, `${name}: row step ${size.step} is not about 1.2 x ${size.font}`);
    for (const rows of [1, 2]) {
      const band = bandOf(rows, LINE_CANVAS.w, size);
      const top = LINE_CANVAS.h / 2 - band.lift - band.h / 2;
      const foot = LINE_CANVAS.h / 2 - band.lift + band.h / 2;
      assert.ok(band.w <= LINE_CANVAS.w - 8 && top >= 4 && foot <= LINE_CANVAS.h - 4, `${name}, ${rows} rows: band ${band.w} x ${band.h} from ${top} to ${foot} px`);
      // The top of the first row and the foot of the last, about a font's height each, stay inside the band.
      const reach = ((rows - 1) * size.step) / 2 + size.font / 2;
      assert.ok(reach <= band.h / 2 - 8, `${name}, ${rows} rows: text reaches ${reach} px from the band's middle, band ${band.h / 2}`);
      // A normal band is centred, as it always was.
      if (!large) assert.equal(band.lift, 0);
    }
  }
  // The larger band really is larger.
  assert.ok(bandOf(2, 600, captionSize(true)).h > bandOf(2, 600, captionSize(false)).h);
});

test('a line too wide for one row breaks after a sentence or clause where both halves fit, else at the most even space', () => {
  const width = (row) => row.length * 10;
  const line = 'Nora is fine, the lamp is lit tonight';
  // Narrow enough to break, wide enough for either half of the clause.
  assert.deepEqual(breakRows(line, 300, width), ['Nora is fine,', 'the lamp is lit tonight']);
  // Too narrow for the longer half after the comma: the most even break, mid clause.
  assert.deepEqual(breakRows(line, 200, width), ['Nora is fine, the', 'lamp is lit tonight']);
  // Of two sentence ends that fit, the more even.
  assert.deepEqual(breakRows('Good. Down it goes. Hear it land?', 250, width), ['Good. Down it goes.', 'Hear it land?']);
  // A line that fits stays one row, whatever its stops.
  assert.deepEqual(breakRows('Week 1 of 12 done. Saved.', 400, width), ['Week 1 of 12 done. Saved.']);
  // Only spaces break: a figure such as +9.8% stays whole.
  for (const row of breakRows('Pump prices +9.8% on the card this week', 200, width)) assert.ok(!row.endsWith('+9.') && !row.startsWith('8%'));
});

test("a line marked for its break takes it when both rows fit, never shows the mark, and keeps its own rule when they do not", () => {
  const width = (row) => row.length * 25;
  assert.deepEqual(breakRows(FIRST_WEEK.bell, 678, width), ['Pull the rope handle', 'on your right. Three times.']);
  assert.deepEqual(breakRows(FIRST_WEEK.chosen, 678, width), ['Pull the iron lever', 'on your left. Send it down.']);
  assert.deepEqual(breakRows(HELP.model, 730, width), ["Nora's house glows", 'on the little model. Tap it.']);
  // The whole line fits: one row, no mark.
  assert.deepEqual(breakRows(FIRST_WEEK.bell, 1400, width), ['Pull the rope handle on your right. Three times.']);
  // A half too wide for its row: the usual rule, and still no mark.
  for (const row of breakRows(FIRST_WEEK.bell, 600, width)) assert.ok(!row.includes(BREAK_MARK), row);
});

test("the opening's second line breaks at its stop though its second row runs 1 % over the room (52 px, system font on a Mac)", () => {
  const widths = { 'Help them well.': 350.1, 'More windows light the festival.': 726.9 };
  const width = (row) => widths[row] ?? row.length * 23;
  assert.deepEqual(breakRows(INTRO[1], 720, width), ['Help them well.', 'More windows light the festival.']);
  // Past 3 % over, the usual rule.
  assert.notDeepEqual(breakRows(INTRO[1], 700, width), ['Help them well.', 'More windows light the festival.']);
});

test("from the second week the choice breaks at its mark at the larger size, in a system font wider than the Mac's (68 px, Roboto bold)", () => {
  const widths = { 'Pick one.': 282.3, 'Empty saves your coins.': 739.6 };
  const width = (row) => widths[row] ?? row.length * 30;
  assert.deepEqual(layoutLine(choosingLine(0), captionSize(true), true, width).rows, ['Pick one.', 'Empty saves your coins.']);
  // Without the larger size's slack it would break mid sentence.
  assert.deepEqual(breakRows(choosingLine(0), 712, width), ['Pick one. Empty', 'saves your coins.']);
});

test("every other first-week line with a stop that fits breaks after it, so no first row ends mid sentence", () => {
  const width = (row) => row.length * 25;
  for (const line of [...Object.values(FIRST_WEEK), ...Object.values(HELP)]) {
    if (line.includes(BREAK_MARK)) continue;
    const rows = breakRows(line, 678, width);
    const stops = [...line.matchAll(/[.,:;?!] /g)].map((m) => m.index + 1);
    if (rows.length === 2 && stops.some((at) => line.slice(0, at).length * 25 <= 678 && line.slice(at + 1).length * 25 <= 678)) assert.match(rows[0], /[.,:;?!]$/, line);
  }
});

test("the jar line's arrow points down and right, at the jar on the sill and not along the rope's way", () => {
  assert.equal(JAR_ARROW.way, 'downRight');
  assert.equal(JAR_ARROW.end, 'right');
  const jar = seen(JAR_POSITION);
  const line = seen(LINE_AT_BASKET);
  assert.ok(jar.yaw > line.yaw && jar.pitch < line.pitch, `jar at ${jar.yaw.toFixed(1)}, ${jar.pitch.toFixed(1)}; line at ${line.yaw.toFixed(1)}, ${line.pitch.toFixed(1)}`);
  const spot = arrowSpot(2, 600, captionSize(false), JAR_ARROW);
  assert.ok(spot.tipX > spot.x && spot.tipY > spot.y, 'on the canvas, right of and below its middle');
});

/** An edge of a caption: at most 20 up and 35 down, and at most 46 degrees to the side (the centre stays within 30; K1, as for the card). */
function edgeIn(name, p) {
  const { yaw, pitch } = seen(p);
  assert.ok(Math.abs(yaw) <= 46, `${name} at ${yaw.toFixed(1)} degrees to the side`);
  assert.ok(pitch <= 20, `${name} at ${pitch.toFixed(1)} degrees up`);
  assert.ok(pitch >= -35, `${name} at ${(-pitch).toFixed(1)} degrees down`);
}

test('a line of one row is at most 784 px wide at the normal size and 850 px at the larger (about 26 and 28 cm)', () => {
  for (const [large, most] of [
    [false, 784],
    [true, 850],
  ]) {
    const size = captionSize(large);
    assert.equal(size.most, most);
    assert.equal(rowRoom(size), most - size.pad);
    // A row as wide as the room fills the widest band; a wider one never makes the band wider (it breaks into two).
    assert.equal(bandOf(1, rowRoom(size), size).w, most);
    assert.equal(bandOf(1, LINE_CANVAS.w, size).w, most);
    assert.equal(bandOf(2, LINE_CANVAS.w, size).w, most);
  }
});

test("at either caption size, Tocco's band and text are in the reading band wherever his line hangs, edges included, and a larger band reaches no lower", (t) => {
  const { line } = createTocco();
  const { width, height } = line.geometry.parameters;
  const metresPerPx = height / LINE_CANVAS.h;
  assert.ok(Math.abs(width / LINE_CANVAS.w - metresPerPx) < 1e-6, 'the line keeps its canvas proportions');
  for (const [where, place] of [
    ['beside him', LINE_HOME],
    ['over the basket', LINE_AT_BASKET],
    ['over the Sunday arrows', LINE_SUNDAY],
    ['low in the middle', LINE_LOW],
    ['beside the family box', LINE_BY_BOX],
  ]) {
    for (const rows of [1, 2]) {
      const foot = {};
      for (const [name, large] of SIZES) {
        const size = captionSize(large);
        // The widest band of as many rows: its corners and the middles of its top and foot, where it reaches lowest.
        const band = bandOf(rows, LINE_CANVAS.w, size);
        const reach = ((rows - 1) * size.step) / 2 + size.font / 2;
        inBand(`${name} line ${where}, ${rows} rows, text top`, lifted(place, (band.lift + reach) * metresPerPx));
        inBand(`${name} line ${where}, ${rows} rows, text foot`, lifted(place, (band.lift - reach) * metresPerPx));
        const ends = [];
        for (const [edge, sx, sy] of [
          ['top left', -1, 1],
          ['top middle', 0, 1],
          ['top right', 1, 1],
          ['foot left', -1, -1],
          ['foot middle', 0, -1],
          ['foot right', 1, -1],
        ]) {
          const p = sideways(place, (sx * band.w * metresPerPx) / 2, (band.lift + (sy * band.h) / 2) * metresPerPx);
          edgeIn(`${name} line ${where}, ${rows} rows, band ${edge}`, p);
          if (sy === -1 && sx !== 0) ends.push(seen(p).yaw);
        }
        t.diagnostic(`${name} line ${where}, ${rows} rows, ${band.w} px band: ends ${ends.map((y) => y.toFixed(1)).join(' and ')} degrees across`);
        foot[name] = seen(lifted(place, (band.lift - band.h / 2) * metresPerPx)).pitch;
      }
      // A larger band grows upward, so its foot comes at most half a degree lower.
      assert.ok(foot.larger >= foot.normal - 0.5, `${where}, ${rows} rows: larger band's foot ${foot.larger.toFixed(1)}, normal ${foot.normal.toFixed(1)}`);
    }
  }
});

test('at either caption size each question sits inside its row, and the panel stays in the reading band', () => {
  const rowPx = 240 / ASK_ROWS;
  for (const [name, large] of SIZES) {
    const { font, inset } = askSize(large);
    assert.ok(inset >= 0 && rowPx - 2 * inset >= font + 8, `${name}: a ${font} px question in a ${rowPx - 2 * inset} px band`);
  }
  assert.ok(askSize(true).font > askSize(false).font);
  for (const place of [LINE_HOME, LINE_SUNDAY]) {
    inBand('the question panel, top', lifted(place, ASK_LIFT + ASK_SIZE.h / 2));
    inBand('the question panel, foot', lifted(place, ASK_LIFT - ASK_SIZE.h / 2));
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) edgeIn(`the question panel, corner ${sx} ${sy}`, sideways(place, (sx * ASK_SIZE.w) / 2, ASK_LIFT + (sy * ASK_SIZE.h) / 2));
    }
  }
});

/** The widest band of `rows` rows at either size, as seen from the seat at `place`: its top, foot and ends (degrees). */
function bandSeen(place, rows, large) {
  const metresPerPx = LINE_SIZE.h / LINE_CANVAS.h;
  const size = captionSize(large);
  const band = bandOf(rows, LINE_CANVAS.w, size);
  const box = { left: Infinity, right: -Infinity, top: -Infinity, foot: Infinity };
  for (const sx of [-1, -0.5, 0, 0.5, 1]) {
    for (const sy of [-1, 1]) {
      const { yaw, pitch } = seen(sideways(place, (sx * band.w * metresPerPx) / 2, (band.lift + (sy * band.h) / 2) * metresPerPx));
      box.left = Math.min(box.left, yaw);
      box.right = Math.max(box.right, yaw);
      box.top = Math.max(box.top, pitch);
      box.foot = Math.min(box.foot, pitch);
    }
  }
  return box;
}

test('the low line keeps its top at least 24 degrees down, one row or two, at either caption size', (t) => {
  // About 0 across and 29 down (Devir 1b section 4), a little right, to keep clear of the little model on its stand.
  const centre = seen(LINE_LOW);
  assert.ok(Math.abs(centre.yaw) <= 5 && centre.pitch <= -27 && centre.pitch >= -32, `centre ${centre.yaw.toFixed(1)}, ${centre.pitch.toFixed(1)}`);
  t.diagnostic(`low line centre ${centre.yaw.toFixed(1)} across, ${centre.pitch.toFixed(1)} up`);
  for (const [name, large] of SIZES) {
    for (const rows of [1, 2]) {
      const box = bandSeen(LINE_LOW, rows, large);
      assert.ok(box.top <= -24, `${name}, ${rows} rows: top at ${box.top.toFixed(1)} degrees`);
      assert.ok(box.foot >= -35, `${name}, ${rows} rows: foot at ${box.foot.toFixed(1)} degrees`);
      t.diagnostic(`low line, ${name}, ${rows} rows: ${box.left.toFixed(1)} to ${box.right.toFixed(1)} across, ${box.foot.toFixed(1)} to ${box.top.toFixed(1)} up`);
    }
  }
});

test('an arrow takes its room at its end of the band and stays inside it, the text beside it', () => {
  for (const [name, large] of SIZES) {
    const size = captionSize(large);
    // A row as wide as its room still fits the widest band with the arrow beside it.
    assert.equal(rowRoom(size, true), size.most - size.pad - arrowRoom(size));
    assert.equal(bandOf(1, rowRoom(size, true), size, LINE_CANVAS, true).w, size.most);
    for (const rows of [1, 2]) {
      for (const widest of [200, rowRoom(size, true)]) {
        const band = bandOf(rows, widest, size, LINE_CANVAS, true);
        const left = (LINE_CANVAS.w - band.w) / 2;
        const top = LINE_CANVAS.h / 2 - band.lift - band.h / 2;
        for (const way of ['left', 'right', 'down', 'up']) {
          for (const end of ['left', 'right']) {
            const spot = arrowSpot(rows, widest, size, { way, end });
            const where = `${name}, ${rows} rows, ${widest} px, ${way} at the ${end}`;
            for (const [x, y] of [
              [spot.x, spot.y],
              [spot.tipX, spot.tipY],
            ]) {
              assert.ok(x > left && x < left + band.w && y > top && y < top + band.h, `${where}: ${x}, ${y}`);
            }
            // On its own side of the band, clear of the text's room.
            const fromMiddle = spot.x - LINE_CANVAS.w / 2;
            assert.ok(end === 'left' ? fromMiddle < 0 : fromMiddle > 0, where);
            assert.ok(Math.abs(fromMiddle) >= widest / 2 - arrowRoom(size) / 2 - 1, `${where}: the arrow ${Math.abs(fromMiddle)} px from the middle`);
          }
        }
      }
    }
  }
});

// The things each instruction names, from the station's own measures.
const { LATCH_REST } = await import('../src/station/room.ts');
const { CHOICE_HOMES, LEVER_GRIP, ROPE_REST } = await import('../src/station/basket.ts');
const { createMaquette, MAQUETTE, maquetteY } = await import('../src/station/maquette.ts');
const { SUN_RAIL } = await import('../src/station/sun.ts');
const { MATCH_REST } = await import('../src/station/matches.ts');
const { BOX_DISPLAY, BOX_SCALE, createFamily, placeRiders } = await import('../src/station/family.ts');
const { CARD_ON_SILL, createCard } = await import('../src/station/card.ts');
const { BASKET_AT_WINDOW, BASKET_ON_SQUARE, createBasket, swingPoint } = await import('../src/station/basket.ts');

const bounds = (object) => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};
const middle = (box) => box.getCenter(new Vector3());
const maquette = createMaquette();
const house = middle(bounds(maquette.house));
/** Nora's window across the square (station/family.ts is given it by the town). */
const NORA = new Vector3(-2.6, -2.6, -26.9);
/** The family box's glass as the box floats in the Keeper's window (FamilySystem places it with the box). */
const knockGlass = (() => {
  const family = createFamily(NORA.clone());
  const centre = new Vector3(BOX_DISPLAY.x, BOX_DISPLAY.y, BOX_DISPLAY.z);
  placeRiders(centre, BOX_SCALE, family.glass.position, family.hook.position, family.line.position);
  family.glass.scale.setScalar(BOX_SCALE);
  return middle(bounds(family.glass));
})();
const sunAt = (day) => new Vector3(SUN_RAIL.x0 + ((SUN_RAIL.x1 - SUN_RAIL.x0) * day) / 6, SUN_RAIL.y, SUN_RAIL.z);
const v = (p) => new Vector3(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]);
const TARGETS = {
  latch: [v(LATCH_REST)],
  bell: [v(ROPE_REST)],
  choosing: CHOICE_HOMES.map(v),
  chosen: [v(LEVER_GRIP)],
  model: [house],
  visit: [NORA],
  sun: [sunAt(0)],
  // On to Sunday from the evening a choice shows: Monday to Saturday.
  sunOn: [sunAt(0), sunAt(2), sunAt(5)],
  lamp: [v(MATCH_REST)],
  look: [NORA],
  close: [v(LATCH_REST)],
  knock: [knockGlass],
};

test("each step's arrow points from its band toward the thing to touch, at the band's end on that side", () => {
  for (const [step, { at, arrow }] of Object.entries(STEP_PLACES)) {
    const from = seen(at);
    const targets = TARGETS[step];
    assert.ok(targets != null, step);
    const yaw = targets.reduce((sum, p) => sum + seen(p).yaw, 0) / targets.length;
    const pitch = targets.reduce((sum, p) => sum + seen(p).pitch, 0) / targets.length;
    const across = yaw - from.yaw;
    const up = pitch - from.pitch;
    const way = { left: across < 0, right: across > 0, down: up < 0, up: up > 0 }[arrow.way];
    assert.ok(way, `${step}: target ${across.toFixed(1)} across, ${up.toFixed(1)} up from its line, arrow ${arrow.way}`);
    // The arrow points along the target's main way from the line; a target straight below or above may take either end.
    if (arrow.way === 'left' || arrow.way === 'right') assert.equal(arrow.end, arrow.way, step);
    else if (Math.abs(across) > 3) assert.equal(arrow.end, across < 0 ? 'left' : 'right', `${step}: target ${across.toFixed(1)} across`);
  }
});

test("Nora's house on the little model is within 30 degrees of straight ahead and 35 down, and left of the low line", (t) => {
  // In the first week the Keeper finds the family there (Devir 1b item 9): its middle in the comfortable cone.
  const { yaw, pitch } = seen(house);
  assert.ok(Math.abs(yaw) <= 30, `the house ${yaw.toFixed(1)} degrees to the side`);
  assert.ok(pitch >= -35, `the house ${(-pitch).toFixed(1)} degrees down`);
  assert.ok(yaw < seen(LINE_LOW).yaw, 'the low line, whose arrow points left to it, is right of it');
  t.diagnostic(`Nora's house on the little model: ${yaw.toFixed(1)} across, ${pitch.toFixed(1)} up`);
});

/** A thing as seen from the seat (degrees): the furthest yaw and pitch of any of its meshes' points either way. */
function thingSeen(object) {
  object.updateMatrixWorld(true);
  const out = { left: Infinity, right: -Infinity, top: -Infinity, foot: Infinity };
  const p = new Vector3();
  object.traverse((o) => {
    const position = o.geometry?.attributes?.position;
    if (position == null) return;
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      const { yaw, pitch } = seen(p);
      out.left = Math.min(out.left, yaw);
      out.right = Math.max(out.right, yaw);
      out.top = Math.max(out.top, pitch);
      out.foot = Math.min(out.foot, pitch);
    }
  });
  return out;
}

// The card on the sill (once the basket has gone down) and the little model are seen with the low line (the model
// while the line names Nora's house on it): no point of the line's widest band, one or two rows at either size, lies
// over either. The basket and the card in it stand on the sill only from the bell to the choice, when his lines hang
// over the basket or beside him, never low (asserted below); how far apart they would be is reported. The family's box
// is never up with his line low (ToccoSystem holds his lines while it is in, and a dev build warns if one goes up, but
// for the first week's knock beside it: tests/family-box.test.mjs): it fills the view down to about 36 degrees across
// the middle, so any line low in the middle would lie over it; its overlap is reported, not asserted.
test('the low line keeps clear of the card on the sill and the little model, at either size', (t) => {
  // The basket on the sill with the week's card standing in it (SeasonSystem), as while choosing.
  const basket = createBasket().basket;
  basket.position.set(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);
  const card = createCard().card;
  card.position.set(BASKET_ON_SILL.x + CARD_IN_BASKET.x, BASKET_ON_SILL.y + CARD_IN_BASKET.y, BASKET_ON_SILL.z + CARD_IN_BASKET.z);
  card.rotation.set(CARD_IN_BASKET.tilt, CARD_IN_BASKET.yaw, 0, 'YXZ');
  const onSill = createCard().card;
  onSill.position.set(CARD_ON_SILL.x, CARD_ON_SILL.y, CARD_ON_SILL.z);
  onSill.rotation.set(CARD_ON_SILL.tilt, CARD_ON_SILL.yaw, 0, 'YXZ');
  // The family's box as it floats in the window, with its glass and hook.
  const family = createFamily(NORA.clone());
  const centre = new Vector3(BOX_DISPLAY.x, BOX_DISPLAY.y, BOX_DISPLAY.z);
  family.box.position.copy(centre);
  family.box.scale.setScalar(BOX_SCALE);
  placeRiders(centre, BOX_SCALE, family.glass.position, family.hook.position, family.line.position);
  family.glass.scale.setScalar(BOX_SCALE);
  family.hook.scale.setScalar(BOX_SCALE);
  const box = new Object3D();
  box.add(family.box, family.glass, family.hook);
  const model = new Object3D();
  model.add(maquette.group, maquette.house);
  const things = {
    'the card on the sill': onSill,
    'the little model': model,
  };
  const notWith = {
    'the card in the basket': card,
    'the basket on the sill': basket,
  };
  for (const [name, large] of SIZES) {
    for (const rows of [1, 2]) {
      const band = bandSeen(LINE_LOW, rows, large);
      for (const [thing, object] of Object.entries({ ...things, ...notWith })) {
        const it = thingSeen(object);
        const apart = Math.max(it.left - band.right, band.left - it.right, it.foot - band.top, band.foot - it.top);
        if (thing in things) assert.ok(apart > 0.5, `${name}, ${rows} rows: the low line meets ${thing} (${apart.toFixed(1)} degrees apart)`);
        if (rows === 2) t.diagnostic(`${name}: low line and ${thing} ${apart.toFixed(1)} degrees apart${thing in notWith ? ' (never up together)' : ''}`);
      }
    }
  }
  // Never up together: no step whose instruction hangs low is a step of the bell or the choice (line-queue.ts stepOf,
  // shutters open, as they always are then), and no story line of those phases hangs low, in any week.
  for (const week of [1, 2, 7]) {
    for (const phase of ['bell', 'rising', 'choosing']) {
      for (const chosen of [-1, 0]) {
        for (const choiceReady of [false, true]) {
          const step = stepOf({ week, phase, open: true, chosen, visited: false, landedFor: 0, called: true, lamp: false, reply: false, quiet: false, choiceReady });
          if (step !== '') assert.notEqual(STEP_PLACES[step].at, LINE_LOW, `week ${week}, ${phase}: the ${step} instruction hangs low`);
        }
      }
      for (const arrows of [false, true]) assert.notEqual(storyPlace(phase, week, arrows), LINE_LOW, `week ${week}, ${phase}: a story line hangs low`);
    }
  }
  const it = thingSeen(box);
  t.diagnostic(`the family's box, never up with his line, fills ${it.left.toFixed(1)} to ${it.right.toFixed(1)} across and ${it.foot.toFixed(1)} to ${it.top.toFixed(1)} up`);
});

// From the second week the story lines and the choosing instruction hang beside him (storyPlace, STEP_PLACES), and the
// little model stands on the stone (maquetteY), its block sunk into the sill: no point of his widest band there, one or
// two rows at either size, lies over it. In the first week, while it stands on its block, nothing hangs beside him once
// it is on the sill: his only lines there are the choice's instructions, before the landing brings the model.
test('from the second week his line beside him keeps clear of the little model on the stone, at either size', (t) => {
  assert.equal(maquetteY(1), MAQUETTE.y);
  const maquette = createMaquette();
  const model = new Object3D();
  model.add(maquette.group, maquette.house);
  model.position.y = maquetteY(2) - MAQUETTE.y;
  assert.equal(maquetteY(2), SILL.top, 'on the stone');
  const it = thingSeen(model);
  for (const [name, large] of SIZES) {
    for (const rows of [1, 2]) {
      const band = bandSeen(LINE_HOME, rows, large);
      const apart = Math.max(it.left - band.right, band.left - it.right, it.foot - band.top, band.foot - it.top);
      assert.ok(apart > 0, `${name}, ${rows} rows: his line beside him meets the little model (${apart.toFixed(1)} degrees apart)`);
      t.diagnostic(`${name}, ${rows} rows: his line beside him and the little model on the stone ${apart.toFixed(1)} degrees apart`);
    }
  }
  // In the first week only the lowering's story line hangs beside him, as the basket goes down, before it lands.
  for (const phase of ['shut', 'morning', 'bell', 'rising', 'choosing', 'lowering', 'landed', 'days', 'sunday']) {
    for (const arrows of [false, true]) assert.equal(storyPlace(phase, 1, arrows) === LINE_HOME, phase === 'lowering', `week 1, ${phase}: a story line beside him`);
  }
  const beside = Object.entries(STEP_PLACES).filter(([, { at }]) => at === LINE_HOME).map(([step]) => step);
  assert.deepEqual(beside.sort(), ['choosing', 'chosen'], 'only the choice hangs beside him, before the landing');
});

// The first week's basket on its way (BasketSystem): hauled up the tower face to just outside the window, swung in
// onto the sill, and back out and down once the lever is pulled. As it rises and swings in it passes behind where his
// line hangs over it, so nothing is said then: the rope's count goes with the rope's step, and the card's line comes
// once the basket stands on the sill, where his band there keeps clear of the basket and the card. As it swings out
// and drops past the window it passes behind the low line's place, so "Down it goes." hangs beside him, clear of it
// all the way down.
test("in the first week no line hangs over the basket as it rises, swings or drops past the window", (t) => {
  const basket = createBasket().basket;
  const card = createCard().card;
  const carry = () => {
    const p = basket.position;
    card.position.set(p.x + CARD_IN_BASKET.x, p.y + CARD_IN_BASKET.y, p.z + CARD_IN_BASKET.z);
    card.rotation.set(CARD_IN_BASKET.tilt, CARD_IN_BASKET.yaw, 0, 'YXZ');
  };
  const apart = (it, band) => Math.max(it.left - band.right, band.left - it.right, it.foot - band.top, band.foot - it.top);
  // Nothing as it rises; the card's line once it stands on the sill (choice-moment.ts counts its steps from there).
  assert.equal(phaseLine('rising', 1), '');
  assert.equal(phaseLine('choosing', 1), FIRST_WEEK.card);
  assert.equal(stepOf({ week: 1, phase: 'rising', open: true, chosen: -1, visited: false, landedFor: 0, called: true, lamp: false, reply: false, quiet: false }), '', 'the rope\'s step ends as it rises');
  const over = storyPlace('choosing', 1, false);
  assert.equal(over, LINE_AT_BASKET);
  let closest = Infinity;
  for (let k = 0; k <= 40; k += 1) {
    const s = k / 40;
    // Up the last third of the tower face (k <= 20), then the swing in.
    if (k <= 20) basket.position.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y - (1 - s * 2) * (BASKET_AT_WINDOW.y - BASKET_ON_SQUARE.y) / 3, BASKET_AT_WINDOW.z);
    else swingPoint(basket.position, s * 2 - 1);
    carry();
    for (const [, large] of SIZES) for (const rows of [1, 2]) closest = Math.min(closest, apart(thingSeen(basket), bandSeen(over, rows, large)), apart(thingSeen(card), bandSeen(over, rows, large)));
  }
  t.diagnostic(`as it rises and swings in, the basket and its card come within ${closest.toFixed(1)} degrees of his band over it (nothing is up there then)`);
  basket.position.set(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);
  carry();
  for (const [name, large] of SIZES) {
    for (const rows of [1, 2]) {
      const band = bandSeen(over, rows, large);
      for (const [thing, object] of [['the basket', basket], ['the card', card]]) {
        const gap = apart(thingSeen(object), band);
        assert.ok(gap > 0, `${name}, ${rows} rows: his line over the basket meets ${thing} on the sill (${gap.toFixed(1)} degrees apart)`);
        t.diagnostic(`${name}, ${rows} rows: his line over the basket and ${thing} on the sill ${gap.toFixed(1)} degrees apart`);
      }
    }
  }
  // Out and down: the swing back out, then the first 2 m of the drop (below that the wall under the sill hides it),
  // beside him.
  const down = storyPlace('lowering', 1, false);
  assert.equal(down, LINE_HOME);
  let nearest = Infinity;
  let low = Infinity;
  for (let k = 0; k <= 60; k += 1) {
    const s = k / 60;
    if (k <= 20) swingPoint(basket.position, 1 - s * 3);
    else basket.position.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y - (2 * (k - 20)) / 40, BASKET_AT_WINDOW.z);
    const it = thingSeen(basket);
    for (const [name, large] of SIZES) {
      for (const rows of [1, 2]) {
        const gap = apart(it, bandSeen(down, rows, large));
        assert.ok(gap > 0, `${name}, ${rows} rows: "Down it goes." meets the basket ${k <= 20 ? 'swinging out' : 'dropping'} (${gap.toFixed(1)} degrees apart)`);
        nearest = Math.min(nearest, gap);
        low = Math.min(low, apart(it, bandSeen(LINE_LOW, rows, large)));
      }
    }
  }
  t.diagnostic(`as it swings out and drops, the basket keeps ${nearest.toFixed(1)} degrees from his line beside him; it would pass ${low.toFixed(1)} from the low line's place`);
});
