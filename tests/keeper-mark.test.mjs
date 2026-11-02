// The old Keepers' marks on the sill by the latch, with the station's real meshes: one shared lamp mark among
// them, one mesh, clear of the sill's things. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Box3 } = await import('@iwsdk/core');
const { SILL } = await import('../src/station/layout.ts');
const { createRoom, LATCH_REST, LATCH_TRAVEL } = await import('../src/station/room.ts');
const { KEEPER_MARK, OLD_MARKS } = await import('../src/station/keeper-mark.ts');
const { createTocco } = await import('../src/station/tocco.ts');
const { createMaquette } = await import('../src/station/maquette.ts');
const { createCrumbs } = await import('../src/station/crumbs.ts');
const { createKeepsakes } = await import('../src/station/family.ts');

const bounds = (object) => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

const room = createRoom();
let marks = null;
let plate = null;
room.room.traverse((o) => {
  if (o.name === 'KeeperMarks') marks = o;
  if (o.name === 'LatchPlate') plate = o;
});

test('four to six marks, one of them the shared lamp mark, every stroke inside its square', () => {
  const count = OLD_MARKS.length + 1;
  assert.ok(count >= 4 && count <= 6, `${count} marks`);
  for (const mark of [KEEPER_MARK, ...OLD_MARKS]) {
    for (const stroke of mark) {
      assert.ok(stroke.length >= 2);
      for (const [u, v] of stroke) assert.ok(Math.abs(u) <= 0.5 && Math.abs(v) <= 0.5, `${u}, ${v}`);
    }
  }
});

test('carved as one mesh, lying on the sill beside the latch', () => {
  assert.ok(marks != null, 'KeeperMarks in the room');
  assert.equal(marks.children.length, 0);
  const box = bounds(marks);
  assert.ok(box.min.y >= SILL.top && box.max.y < SILL.top + 0.002, `${box.min.y} to ${box.max.y}`);
  // Beside the latch, on its town side.
  assert.ok(box.max.x < LATCH_REST.x + LATCH_TRAVEL && box.min.x > LATCH_REST.x - 0.25);
  assert.ok(box.max.z < LATCH_REST.z && box.min.z > SILL.outerZ);
  const position = marks.geometry.getAttribute('position');
  assert.ok(position.count / 3 <= 400, `${position.count / 3} triangles`);
});

test("clear of the latch, its plate, Tocco's rail and Sunday arrows, the model of the square, the crumbs and Lina's boats", () => {
  const tocco = createTocco();
  const maquette = createMaquette();
  const keepsakes = createKeepsakes();
  keepsakes.count = 12;
  keepsakes.computeBoundingBox();
  const others = {
    Latch: bounds(room.latch),
    LatchPlate: bounds(plate),
    ArrowUp: bounds(tocco.up),
    ArrowDown: bounds(tocco.down),
    ToccoRail: bounds(tocco.fixtures),
    Maquette: bounds(maquette.group).union(bounds(maquette.house)),
    CrumbBag: bounds(createCrumbs().bag),
    Keepsakes: keepsakes.boundingBox.clone(),
  };
  const box = bounds(marks);
  for (const [name, other] of Object.entries(others)) {
    // The rail and plate rest on the stone too; only overlap across the sill counts.
    const across = box.min.x < other.max.x && box.max.x > other.min.x && box.min.z < other.max.z && box.max.z > other.min.z;
    assert.ok(!across, `the marks overlap ${name}`);
  }
});
