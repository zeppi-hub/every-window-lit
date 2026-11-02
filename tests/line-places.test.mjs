// Where Tocco's line and his question panel hang, seen from the seated eye: every place they can take stays in
// the comfortable band for reading, their middles within 30 degrees either side, and every edge at most 20 up and 35
// down. How far the bands' ends reach sideways is reported, not asserted, until that limit is decided.
// `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Object3D, Vector3 } = await import('@iwsdk/core');
const { SEAT_EYE } = await import('../src/station/layout.ts');
const { ASK_ROWS, ASK_SIZE } = await import('../src/station/ask.ts');
const { ASK_LIFT, createTocco, faceSeat, LINE_AT_BASKET, LINE_HOME, LINE_SUNDAY } = await import('../src/station/tocco.ts');
const { askSize, bandOf, captionSize, LINE_CANVAS, rowRoom } = await import('../src/station/caption.ts');

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
