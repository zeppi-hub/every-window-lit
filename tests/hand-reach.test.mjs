// What a hand meets on the sill, measured on the station's real meshes (the hands-only round, 10 Nov):
// the rope's 1.2 m cord no longer takes a reach meant for the lamp, the match or the key. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Box3, Vector3 } = await import('@iwsdk/core');
const { createBasket } = await import('../src/station/basket.ts');
const { LAMP } = await import('../src/station/tocco.ts');
const { createDoorRing, createDoorTarget, DOOR_BOX } = await import('../src/station/tower.ts');
const { PLAZA_Y, TOWER } = await import('../src/station/layout.ts');

const parts = createBasket();
parts.toggle.updateMatrixWorld(true);
const mesh = parts.toggle.getObjectByName('RopeToggleMesh');
const grip = parts.toggle.getObjectByName('RopeToggleGrip');

test("the rope's drawn mesh answers no pointer; a hidden box the size of the wooden grip does", () => {
  assert.equal(mesh.pointerEvents, 'none');
  assert.ok(grip != null, 'the grip target is there');
  assert.equal(grip.material.visible, false, 'never drawn');
  assert.equal(grip.parent, parts.toggle, 'it moves with the toggle, the grabbable');
  const size = new Box3().setFromObject(grip).getSize(new Vector3());
  assert.ok(size.x < 0.2 && size.y < 0.07 && size.z < 0.07, `grip box ${size.toArray().map((v) => v.toFixed(3))}`);
});

test("the grip's box covers the grip as drawn, and none of the cord above it", () => {
  const drawn = new Box3().setFromObject(mesh);
  const target = new Box3().setFromObject(grip);
  assert.ok(drawn.max.y - drawn.min.y > 1, 'the drawn cord still runs up into the lintel');
  assert.ok(target.max.y - target.min.y < 0.07);
  assert.ok(Math.abs(target.min.x - drawn.min.x) < 1e-3 && Math.abs(target.max.x - drawn.max.x) < 1e-3, 'as wide as the bar');
  assert.ok(Math.abs(target.min.y - drawn.min.y) < 1e-3, 'from the bottom of the bar');
});

test('the Sunday lamp is out of the grip box: a reach for the lamp or its glass no longer finds the rope', () => {
  const target = new Box3().setFromObject(grip);
  const lamp = new Vector3(LAMP.x, LAMP.y + 0.08, LAMP.z);
  assert.ok(target.distanceToPoint(lamp) > 0.1, `${target.distanceToPoint(lamp).toFixed(3)} m`);
});

test("on the square the door leaf takes a hand's ray round the ring: a hidden pane inside the doorway, hidden from the seat", () => {
  const ring = createDoorRing();
  const pane = createDoorTarget(ring);
  pane.updateMatrixWorld(true);
  assert.equal(pane.visible, false, 'off until the Keeper walks (BasketSystem)');
  assert.equal(pane.material.visible, false, 'never drawn');
  const box = new Box3().setFromObject(pane);
  assert.ok(box.containsPoint(new Vector3(ring.position.x, ring.position.y, box.min.z)), 'it covers the ring');
  assert.ok(box.min.x >= DOOR_BOX[0] && box.max.x <= DOOR_BOX[3], 'within the doorway across');
  assert.ok(box.min.y >= PLAZA_Y && box.max.y <= DOOR_BOX[4], 'and up');
  assert.ok(box.max.z < ring.position.z, 'just proud of the ring, on the square side');
});

test('an arc that ends on the door climbs: the doorway box holds the ring and stands just proud of the wall face', () => {
  const ring = createDoorRing();
  const [x0, y0, z0, x1, y1, z1] = DOOR_BOX;
  assert.ok(ring.position.x > x0 && ring.position.x < x1 && ring.position.y > y0 && ring.position.y < y1 && ring.position.z > z0 && ring.position.z < z1);
  assert.ok(z0 < TOWER.frontZ, 'in front of the wall, so the arc meets it before the tower');
  assert.ok(x1 - x0 > 1.2 && y1 - y0 > 2.5, 'the whole doorway');
});

test("the turning week's drawing on the sill and the solidarity week's drawing in the family's box have their own names (each found by name)", async () => {
  const { createSolidarity } = await import('../src/station/solidarity.ts');
  const { createDrawing } = await import('../src/station/drawing.ts');
  const names = [];
  const aid = createSolidarity(0.3);
  for (const part of Object.values(aid)) if (part?.isObject3D) part.traverse((o) => names.push(o.name));
  assert.ok(names.includes('LinaBoatDrawing'), 'the solidarity gift is LinaBoatDrawing');
  assert.ok(!names.includes('LinaDrawing'), 'and not LinaDrawing');
  assert.equal(createDrawing().name, 'LinaDrawing');
});

test('on the square a brass ring on a low post stands ahead of the Keeper as they arrive: no turn needed, hidden from the seat', async () => {
  const { createWayUp, WAY_UP, WAY_UP_SOLID } = await import('../src/station/tower.ts');
  const { TOWER_FOOT } = await import('../src/station/layout.ts');
  const wayUp = createWayUp();
  wayUp.updateMatrixWorld(true);
  assert.equal(wayUp.visible, false, 'shown only while walking (BasketSystem)');
  const ring = wayUp.getObjectByName('WayUpRing');
  const target = wayUp.getObjectByName('WayUpTarget');
  assert.ok(ring != null && target != null);
  assert.equal(target.material.visible, false, 'its ray box is never drawn');
  const ahead = TOWER_FOOT.z - WAY_UP.z;
  assert.ok(ahead >= 1.5 && ahead <= 2, `ahead of the arrival, toward the square: ${ahead.toFixed(2)} m`);
  const box = new Box3().setFromObject(ring);
  assert.ok(box.max.y - PLAZA_Y > 0.8 && box.max.y - PLAZA_Y < 1.2, 'a low post, the ring about a metre up');
  const [x0, , z0, x1, , z1] = WAY_UP_SOLID;
  assert.ok(WAY_UP.x > x0 && WAY_UP.x < x1 && WAY_UP.z > z0 && WAY_UP.z < z1, 'the Keeper cannot land in the post');
});
