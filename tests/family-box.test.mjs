// The family's room box in the Keeper's window, measured against the sill's things with the station's real
// meshes (station-hooks.mjs lets node build them): `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Box3, Object3D, Vector3 } = await import('@iwsdk/core');
const { SEAT_EYE, SILL } = await import('../src/station/layout.ts');
const { createRoom } = await import('../src/station/room.ts');
const { createTown } = await import('../src/station/town.ts');
const { createTocco, faceSeat, LINE_LOW, LINE_SIZE, STEP_PLACES } = await import('../src/station/tocco.ts');
const { createMaquette } = await import('../src/station/maquette.ts');
const { createCrumbs } = await import('../src/station/crumbs.ts');
const { CARD_ON_SILL, createCard } = await import('../src/station/card.ts');
const { CHOICE_HOMES, createBasket } = await import('../src/station/basket.ts');
const { createSolidarity } = await import('../src/station/solidarity.ts');
const { BOX_DISPLAY, BOX_SCALE, createFamily, drawCurtain, placeRiders, ROOM_BOX } = await import('../src/station/family.ts');
const { arrowSpot, bandOf, captionSize, LINE_CANVAS } = await import('../src/station/caption.ts');
const { FAR_ASIDE, FAR_PULL, HAND_LIFT, HAND_RISE, handStart, HINT_SIZE, HOOK_RISE, POKE_MOVE, POKE_UP } = await import('../src/station/hint.ts');
const { entryStart } = await import('../src/hint-rules.ts');
const { FIRST_WEEK, instructionLine } = await import('../src/season/lines.ts');

const bounds = (object) => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

/** The sill's things the box must stay clear of, as world boxes. */
const sill = {};
const room = createRoom();
sill.Latch = bounds(room.latch);
room.room.traverse((o) => {
  if (o.name === 'LatchPlate') sill.LatchPlate = bounds(o);
});
const tocco = createTocco();
// The arrows stand on the sill on Sunday (they are parked far below otherwise).
sill.ArrowUp = bounds(tocco.up);
sill.ArrowDown = bounds(tocco.down);
const maquette = createMaquette();
sill.Maquette = bounds(maquette.group).union(bounds(maquette.house));
sill.CrumbBag = bounds(createCrumbs().bag);
const card = createCard().card;
card.position.set(CARD_ON_SILL.x, CARD_ON_SILL.y, CARD_ON_SILL.z);
card.rotation.set(CARD_ON_SILL.tilt, CARD_ON_SILL.yaw, 0, 'YXZ');
sill.WeekCardOnSill = bounds(card);
// Each place on the sill takes a shape per kind of week, and the Keeper's own things in a solidarity week
// (taller; Tocco says nothing that week, so only the box meets them).
const basket = createBasket();
const aid = createSolidarity(ROOM_BOX.d / 2);
const placed = (shape, home) => {
  const holder = new Object3D();
  const copy = shape.clone();
  copy.position.set(home[0], home[1], home[2]);
  holder.add(copy);
  return bounds(holder);
};
const solidarity = {};
CHOICE_HOMES.forEach((home, i) => {
  const box = new Box3();
  for (const shape of [basket.options.fuel[i], basket.options.power[i], basket.options.food[i]]) box.union(placed(shape, home));
  sill[`Choice${i}`] = box;
  solidarity[`Choice${i} (solidarity week)`] = placed(aid.items[i], home);
});
// The solidarity week's second basket rests on the sill while the box may be in the window.
const { BASKET_ON_SILL } = await import('../src/station/layout.ts');
basket.basket.position.set(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);
solidarity['Basket on the sill (solidarity week)'] = bounds(basket.basket);
// Tocco's questions are never up while the box is in the window, nor his line but for the first week's knock beside
// the box (ToccoSystem holds them): that one is measured below.

// The box as it floats in the window, with the glass, hook and line that ride with it.
const family = createFamily(new Vector3(-2.6, -2.6, -26.9));
// Lina's drawing for the boat rides in the box too (build.ts).
family.box.add(aid.drawing);
const centre = new Vector3(BOX_DISPLAY.x, BOX_DISPLAY.y, BOX_DISPLAY.z);
family.box.position.copy(centre);
family.box.scale.setScalar(BOX_SCALE);
placeRiders(centre, BOX_SCALE, family.glass.position, family.hook.position, family.line.position);
family.glass.scale.setScalar(BOX_SCALE);
family.hook.scale.setScalar(BOX_SCALE);
const glass = bounds(family.glass);
const box = bounds(family.box).union(glass).union(bounds(family.hook));

test("the box's glass, the part knocked on, is inside the window's outer face", () => {
  assert.ok(glass.min.z >= SILL.outerZ, `glass at z ${glass.min.z.toFixed(3)}, window face at ${SILL.outerZ}`);
  // And the whole box is in the opening.
  assert.ok(box.min.x > -0.6 && box.max.x < 0.6 && box.min.y > SILL.top, `box ${JSON.stringify(box)}`);
});

test('the box touches nothing on the sill', () => {
  for (const [name, other] of Object.entries({ ...sill, ...solidarity })) {
    assert.ok(!box.intersectsBox(other), `the box cuts into ${name}`);
  }
});

/** Every corner of a mesh, as degrees right of and above straight ahead from the seated eye. */
function corners(mesh) {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.attributes.position;
  const v = new Vector3();
  const out = [];
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const dx = v.x - SEAT_EYE.x;
    const dz = SEAT_EYE.z - v.z;
    out.push({ yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: (Math.atan2(v.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI });
  }
  return out;
}

test("the family's line is within 30 degrees of the middle of the view, end to end", () => {
  for (const { yaw, pitch } of corners(family.line)) {
    assert.ok(Math.abs(yaw) <= 30, `line end at ${yaw.toFixed(1)} degrees`);
    assert.ok(Math.abs(pitch) <= 30, `line edge at ${pitch.toFixed(1)} degrees up`);
  }
});

// The family's line sits just over their box, higher in the view than Tocco's: 30 degrees up is its limit (20 for his
// line), as decided (K1).
test("at either caption size, the family's widest band of one or two rows is within 30 degrees of the middle of the view, the middle of its top edge included", (t) => {
  const line = family.line;
  line.updateMatrixWorld(true);
  const { width, height } = line.geometry.parameters;
  const v = new Vector3();
  for (const large of [false, true]) {
    for (const rows of [1, 2]) {
      const band = bandOf(rows, LINE_CANVAS.w, captionSize(large));
      const name = `${large ? 'larger' : 'normal'} ${rows}-row band`;
      assert.ok(band.lift + band.h / 2 <= LINE_CANVAS.h / 2, `${name} ${band.h} px, raised ${band.lift}, on a ${LINE_CANVAS.h} px canvas`);
      // Its corners and the middles of its top and foot: the top's middle is its highest point, higher than a corner.
      let top = -Infinity;
      for (const [edge, sx, sy] of [['foot left', -1, -1], ['foot middle', 0, -1], ['foot right', 1, -1], ['top right', 1, 1], ['top middle', 0, 1], ['top left', -1, 1]]) {
        v.set((sx * band.w * width) / (2 * LINE_CANVAS.w), ((band.lift + (sy * band.h) / 2) * height) / LINE_CANVAS.h, 0).applyMatrix4(line.matrixWorld);
        const dx = v.x - SEAT_EYE.x;
        const dz = SEAT_EYE.z - v.z;
        const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
        const pitch = (Math.atan2(v.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI;
        assert.ok(Math.abs(yaw) <= 30 && Math.abs(pitch) <= 30, `${name} ${edge} at ${yaw.toFixed(1)}, ${pitch.toFixed(1)} degrees`);
        top = Math.max(top, pitch);
      }
      t.diagnostic(`${name}, ${band.w} px: top edge reaches ${top.toFixed(2)} degrees up`);
    }
  }
});

/** Degrees right of and above straight ahead, from the seated eye. */
function seen(v) {
  const dx = v.x - SEAT_EYE.x;
  const dz = SEAT_EYE.z - v.z;
  return { yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: (Math.atan2(v.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI };
}

/** The angular box around the family's widest two-row band at either caption size. */
function familyBand() {
  const line = family.line;
  line.updateMatrixWorld(true);
  const { width, height } = line.geometry.parameters;
  const out = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  for (const large of [false, true]) {
    const band = bandOf(2, LINE_CANVAS.w, captionSize(large));
    for (const sx of [-1, 0, 1]) {
      for (const sy of [-1, 1]) {
        const v = new Vector3((sx * band.w * width) / (2 * LINE_CANVAS.w), ((band.lift + (sy * band.h) / 2) * height) / LINE_CANVAS.h, 0).applyMatrix4(line.matrixWorld);
        const { yaw, pitch } = seen(v);
        out.yaw0 = Math.min(out.yaw0, yaw);
        out.yaw1 = Math.max(out.yaw1, yaw);
        out.pitch0 = Math.min(out.pitch0, pitch);
        out.pitch1 = Math.max(out.pitch1, pitch);
      }
    }
  }
  return out;
}

/** Where the ghost hand starts a poke at `target` (HintSystem), and the middle of the target. */
function handFrom(target, rise) {
  const eye = new Vector3(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
  const anchor = new Box3().setFromObject(target).getCenter(new Vector3());
  return { eye, anchor, from: handStart(anchor, eye, HAND_LIFT, rise, new Vector3(), new Vector3()) };
}

/**
 * The angular box the ghost hand covers over a poke at `target` (HintSystem): its whole square, HINT_SIZE across and
 * facing the eye, from where it starts to the end of its travel `move`.
 */
function handSweep(target, rise, move) {
  return sweepFrom(handFrom(target, rise).from, move);
}

/** The same box for a hand that starts at `from` and travels `move`. */
function sweepFrom(from, move) {
  const eye = new Vector3(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
  const out = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  for (const along of [0, 0.5, 1]) {
    const at = from.clone().add(new Vector3(...move).multiplyScalar(along));
    const half = (Math.atan(HINT_SIZE / 2 / at.distanceTo(eye)) * 180) / Math.PI;
    const { yaw, pitch } = seen(at);
    out.yaw0 = Math.min(out.yaw0, yaw - half);
    out.yaw1 = Math.max(out.yaw1, yaw + half);
    out.pitch0 = Math.min(out.pitch0, pitch - half);
    out.pitch1 = Math.max(out.pitch1, pitch + half);
  }
  return out;
}

const overlaps = (a, b) => a.yaw0 < b.yaw1 && b.yaw0 < a.yaw1 && a.pitch0 < b.pitch1 && b.pitch0 < a.pitch1;
const span = (r) => `${r.yaw0.toFixed(1)} to ${r.yaw1.toFixed(1)} across, ${r.pitch0.toFixed(1)} to ${r.pitch1.toFixed(1)} up`;

/** The knock on the box's glass, and the poke up into its hook from below, as HintSystem shows them. */
const BOX_POKES = [
  ['knock on the glass', family.glass, HAND_RISE, POKE_MOVE],
  ['poke at the hook', family.hook, HOOK_RISE, POKE_UP],
];

test("the ghost hand's knock on the glass and its poke at the hook leave the family's two-row line uncovered", (t) => {
  // The hand is drawn over everything (depthTest off), so it must not sit on the line it would hide.
  const band = familyBand();
  for (const [name, target, rise, move] of BOX_POKES) {
    const hand = handSweep(target, rise, move);
    t.diagnostic(`${name}: ${span(hand)}; the line ${span(band)}`);
    assert.ok(!overlaps(hand, band), `${name} at ${span(hand)} covers the line at ${span(band)}`);
  }
  // At the usual height, poking down, the hook's poke would cover it.
  assert.ok(overlaps(handSweep(family.hook, HAND_RISE, POKE_MOVE), band), 'at the usual height the poke at the hook covers the line');
});

/** The angular box around a two-row band on the low line, at either caption size. */
function lowBand() {
  const home = new Object3D();
  faceSeat(home, LINE_LOW);
  home.updateMatrixWorld(true);
  const px = LINE_SIZE.w / LINE_CANVAS.w;
  const out = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  for (const large of [false, true]) {
    const band = bandOf(2, LINE_CANVAS.w, captionSize(large));
    for (const sx of [-1, 0, 1]) {
      for (const sy of [-1, 1]) {
        const { yaw, pitch } = seen(new Vector3((sx * band.w * px) / 2, (band.lift + (sy * band.h) / 2) * px, 0).applyMatrix4(home.matrixWorld));
        out.yaw0 = Math.min(out.yaw0, yaw);
        out.yaw1 = Math.max(out.yaw1, yaw);
        out.pitch0 = Math.min(out.pitch0, pitch);
        out.pitch1 = Math.max(out.pitch1, pitch);
      }
    }
  }
  return out;
}

test("the ghost hand's reach for Nora's window leaves the low line and the window uncovered, and stands beside the window", (t) => {
  // From the second week: "Nora's window. Reach, or tap the model." hangs low while the hand, drawn over everything, shows the reach.
  const eye = new Vector3(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
  const target = createFamily(createTown().tessaWindow).target;
  target.updateMatrixWorld(true);
  const { width, height } = target.geometry.parameters;
  const pane = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const { yaw, pitch } = seen(new Vector3((u * width) / 2, (v * height) / 2, 0).applyMatrix4(target.matrixWorld));
    pane.yaw0 = Math.min(pane.yaw0, yaw);
    pane.yaw1 = Math.max(pane.yaw1, yaw);
    pane.pitch0 = Math.min(pane.pitch0, pitch);
    pane.pitch1 = Math.max(pane.pitch1, pitch);
  }
  const anchor = new Vector3(0, 0, 0).applyMatrix4(target.matrixWorld);
  const from = handStart(anchor, eye, -1, HAND_RISE, new Vector3(), new Vector3());
  const to = from.clone().add(new Vector3(...FAR_PULL));
  const hand = sweepFrom(from, FAR_PULL);
  const band = lowBand();
  t.diagnostic(`the hand ${span(hand)}; the line ${span(band)}; the window ${span(pane)}`);
  assert.ok(!overlaps(hand, band), `the hand at ${span(hand)} covers the line at ${span(band)}`);
  assert.ok(!overlaps(hand, pane), `the hand at ${span(hand)} covers the window at ${span(pane)}`);
  // It still shows where to reach: beside the window, and it is drawn back toward the eye, growing where it stands.
  const toWindow = anchor.clone().sub(eye);
  for (const at of [from, to]) assert.ok((at.clone().sub(eye).angleTo(toWindow) * 180) / Math.PI < 16, 'the hand has left the window');
  assert.ok((from.clone().sub(eye).angleTo(to.clone().sub(eye)) * 180) / Math.PI < 1, 'the pull does not run down the view');
  assert.ok(to.distanceTo(eye) < from.distanceTo(eye) - 0.1, 'the pull comes toward the Keeper');
  // Without the step aside: on the line to the window it hides the window, and low on that line its pull crosses the band.
  const onLine = eye.clone().addScaledVector(toWindow.clone().normalize(), 0.42);
  assert.ok(overlaps(sweepFrom(onLine, [0, 0, 0]), pane), 'on the line to it the hand covers the window');
  assert.ok(overlaps(sweepFrom(onLine.clone().setY(onLine.y - 0.12), [0, 0, 0.12]), band), 'low on the line to it, the pull crosses the band');
  assert.ok(FAR_ASIDE > 0);
});

test("the ghost hand's knock and its poke at the hook each move toward their target, not away from it", () => {
  for (const [name, target, rise, move] of BOX_POKES) {
    const { anchor, from } = handFrom(target, rise);
    const toward = anchor.clone().sub(from).dot(new Vector3(...move));
    assert.ok(toward > 0, `${name}: the hand starts ${(anchor.y - from.y).toFixed(3)} m from the target's middle in height and moves ${move[1]} m`);
  }
  // The hook's poke moves up: from below it, a downward tap would leave the hook.
  const { anchor, from } = handFrom(family.hook, HOOK_RISE);
  assert.ok(anchor.clone().sub(from).dot(new Vector3(...POKE_MOVE)) < 0, 'from below the hook, a downward tap moves away from it');
});

/**
 * A canvas that keeps the outline of what is drawn instead of pixels: for each path (beginPath to fill), the box
 * around each of its pieces (a rect, or a run from one moveTo to the next; arcs and ellipses whole).
 */
function outlineCanvas(width, height) {
  const paths = [];
  let path = [];
  let piece = null;
  const grow = (x, y) => {
    if (piece == null) {
      piece = { x0: x, y0: y, x1: x, y1: y };
      path.push(piece);
    }
    piece.x0 = Math.min(piece.x0, x);
    piece.y0 = Math.min(piece.y0, y);
    piece.x1 = Math.max(piece.x1, x);
    piece.y1 = Math.max(piece.y1, y);
  };
  const methods = {
    beginPath: () => {
      path = [];
      paths.push(path);
      piece = null;
    },
    moveTo: (x, y) => {
      piece = null;
      grow(x, y);
    },
    lineTo: grow,
    quadraticCurveTo: (cx, cy, x, y) => {
      grow(cx, cy);
      grow(x, y);
    },
    rect: (x, y, w, h) => {
      piece = null;
      grow(x, y);
      grow(x + w, y + h);
      piece = null;
    },
    arc: (x, y, r) => {
      grow(x - r, y - r);
      grow(x + r, y + r);
    },
    ellipse: (x, y, rx, ry) => {
      grow(x - rx, y - ry);
      grow(x + rx, y + ry);
    },
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const g = new Proxy({}, { get: (_, key) => methods[key] ?? (typeof key === 'string' ? () => undefined : undefined), set: () => true });
  return { texture: { image: { width, height, getContext: () => g } }, paths };
}

test("in both of Lina's frames her lamp and hand stay at least 3 px from Grandpa's accordion, so their shadows never merge", () => {
  for (const wave of [false, true]) {
    const { texture, paths } = outlineCanvas(512, 420);
    drawCurtain(texture, 0, wave);
    // Tessa, Grandpa and Lina, in that order; his accordion's left board is the first 10 by 66 px rect.
    assert.equal(paths.length, 3);
    const [, grandpa, lina] = paths;
    const board = grandpa.find((p) => p.x1 - p.x0 === 10 && p.y1 - p.y0 === 66);
    assert.ok(board != null, "the accordion's left board");
    let gap = Infinity;
    for (const p of lina) {
      if (p.y1 <= board.y0 || p.y0 >= board.y1) continue;
      gap = Math.min(gap, board.x0 - p.x1);
    }
    // The shadows are blurred 2 px: 3 px apart they still read as two.
    assert.ok(gap >= 3, `${wave ? 'waving' : 'resting'}: ${gap} px from the accordion`);
  }
});

// Devir 1b item 14: in the first week, once the family's line has been read, Tocco says to knock on the box's glass,
// the one line of his up while the box is in (line-queue.ts stepOf), beside the box on the basket's side. The ghost hand
// knocks on the glass with it, gliding in from the line's arrow first.

/** The angular box of a thing's every point as seen from the seat (its hidden parts too). */
function spanOf(object) {
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

/** Tocco's line where the knock hangs, turned to the seat: a point on it `across` and `up` from its middle (m). */
const knockHome = new Object3D();
faceSeat(knockHome, STEP_PLACES.knock.at);
const onKnockLine = (across, up) => new Vector3(across, up, 0).applyQuaternion(knockHome.quaternion).add(knockHome.position);
const METRES_PER_PX = LINE_SIZE.h / LINE_CANVAS.h;

/** The angular box of the knock line's band of `rows` rows at its widest, with its arrow, at either caption size. */
function knockBand(rows, large) {
  const band = bandOf(rows, LINE_CANVAS.w, captionSize(large), LINE_CANVAS, true);
  const out = { yaw0: Infinity, yaw1: -Infinity, pitch0: Infinity, pitch1: -Infinity };
  for (const sx of [-1, -0.5, 0, 0.5, 1]) {
    for (const sy of [-1, 1]) {
      const { yaw, pitch } = seen(onKnockLine((sx * band.w * METRES_PER_PX) / 2, (band.lift + (sy * band.h) / 2) * METRES_PER_PX));
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
const KNOCK_BANDS = [1, 2].flatMap((rows) => [false, true].map((large) => [`${large ? 'larger' : 'normal'} ${rows}-row`, rows, large]));

test("the first week's knock line, one or two rows at either caption size with its arrow, keeps clear of the box, its glass, its hook and the family's line", (t) => {
  assert.equal(instructionLine('knock', 1, 12), FIRST_WEEK.knock);
  assert.equal(instructionLine('knock', 2, 12), '', 'from the second week the ghost hand shows the knock without a line, once a visit, then the hook');
  const things = [
    ['the box', spanOf(family.box)],
    ['its glass', spanOf(family.glass)],
    ['its hook', spanOf(family.hook)],
    // Never up with it (one line at a time: theirs goes as the knock line comes, Lina's comes as it goes;
    // tests/line-queue.test.mjs), but clear of it all the same.
    ["the family's line, two rows at either size", familyBand()],
  ];
  for (const [name, rows, large] of KNOCK_BANDS) {
    const band = knockBand(rows, large);
    for (const [thing, it] of things) {
      const gap = apart(band, it);
      assert.ok(gap >= 0.5, `${name} knock line at ${span(band)} meets ${thing} at ${span(it)} (${gap.toFixed(1)} degrees apart)`);
      if (rows === 2) t.diagnostic(`${name} knock line and ${thing}: ${gap.toFixed(1)} degrees apart`);
    }
  }
  // Its arrow points left from the band's left end, toward the glass.
  assert.deepEqual(STEP_PLACES.knock.arrow, { way: 'left', end: 'left' });
});

test("the ghost hand's knock on the glass leaves the knock line and the family's line uncovered, and its glide in from the arrow passes under the family's line", (t) => {
  const hand = handSweep(family.glass, HAND_RISE, POKE_MOVE);
  const theirs = familyBand();
  assert.ok(!overlaps(hand, theirs), `the knock at ${span(hand)} covers the family's line at ${span(theirs)}`);
  for (const [name, rows, large] of KNOCK_BANDS) {
    const band = knockBand(rows, large);
    assert.ok(!overlaps(hand, band), `the knock at ${span(hand)} covers the ${name} knock line at ${span(band)}`);
    if (rows === 2) t.diagnostic(`the knock, ${span(hand)}; the ${name} knock line ${span(band)}: ${apart(hand, band).toFixed(1)} degrees apart`);
  }
  // The guided hand sets out from the arrow's tip (HintSystem, hint-rules.ts entryStart) and glides to where the knock
  // starts: every point of the way, its square stays below the family's line. The tip of a widest band and of a short one.
  const { eye, from } = handFrom(family.glass, HAND_RISE);
  let highest = -Infinity;
  for (const large of [false, true]) {
    const size = captionSize(large);
    for (const rows of [1, 2]) {
      for (const widest of [200, LINE_CANVAS.w]) {
        const spot = arrowSpot(rows, widest, size, STEP_PLACES.knock.arrow);
        const tip = onKnockLine((spot.tipX / LINE_CANVAS.w - 0.5) * LINE_SIZE.w, (0.5 - spot.tipY / LINE_CANVAS.h) * LINE_SIZE.h);
        const entry = entryStart(tip, eye, new Vector3());
        for (let k = 0; k <= 20; k += 1) {
          const at = entry.clone().lerp(from, k / 20);
          const half = (Math.atan(HINT_SIZE / 2 / at.distanceTo(eye)) * 180) / Math.PI;
          highest = Math.max(highest, seen(at).pitch + half);
        }
      }
    }
  }
  assert.ok(highest < theirs.pitch0 - 0.5, `the glide reaches ${highest.toFixed(1)} degrees up, the family's line starts at ${theirs.pitch0.toFixed(1)}`);
  t.diagnostic(`the glide in reaches ${highest.toFixed(1)} degrees up; the family's line starts at ${theirs.pitch0.toFixed(1)}`);
});
