// The family's room box in the Keeper's window, measured against the sill's things with the station's real
// meshes (station-hooks.mjs lets node build them): `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Box3, Object3D, Vector3 } = await import('@iwsdk/core');
const { SEAT_EYE, SILL } = await import('../src/station/layout.ts');
const { createRoom } = await import('../src/station/room.ts');
const { createTocco } = await import('../src/station/tocco.ts');
const { createMaquette } = await import('../src/station/maquette.ts');
const { createCrumbs } = await import('../src/station/crumbs.ts');
const { CARD_ON_SILL, createCard } = await import('../src/station/card.ts');
const { CHOICE_HOMES, createBasket } = await import('../src/station/basket.ts');
const { createSolidarity } = await import('../src/station/solidarity.ts');
const { BOX_DISPLAY, BOX_SCALE, createFamily, drawCurtain, placeRiders, ROOM_BOX } = await import('../src/station/family.ts');
const { bandOf, captionSize, LINE_CANVAS } = await import('../src/station/caption.ts');

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
// Tocco's line and questions are never up while the box is in the window (ToccoSystem holds them), so they are not here.

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

// The family's line sits just over their box, higher in the view than Tocco's: 30 degrees up is a provisional limit
// for it (20 for his line), until that is decided (K1); were it 20, the line would have to move.
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
