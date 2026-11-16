// Where a hand takes hold (the hand guidance package, 16 Nov): the grip point the ring sits on and the ghost
// hand's pinch comes onto, measured on the station's real meshes; and the rings' one draw. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } = await import('@iwsdk/core');
const { gripPoint, gripRadius, GRIP_NUDGE } = await import('../src/station/grip.ts');
const { createBasket } = await import('../src/station/basket.ts');
const { createWayUp } = await import('../src/station/tower.ts');
const { HINT_SIZE, PINCH_AT, POINT_AT } = await import('../src/station/hint.ts');
const { createFamily, ROOM_BOX } = await import('../src/station/family.ts');

test('a plain thing is gripped on the face that looks at the eye, just in front of it', () => {
  const thing = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial());
  thing.position.set(0, 1, -0.5);
  thing.updateMatrixWorld(true);
  const eye = new Vector3(0, 1, 0);
  const at = gripPoint(thing, eye, new Vector3());
  assert.ok(Math.abs(at.z - (-0.45 + GRIP_NUDGE)) < 1e-6, `z ${at.z}`);
  assert.ok(Math.abs(at.x) < 1e-6 && Math.abs(at.y - 1) < 1e-6);
  // From the side, the side face.
  const side = gripPoint(thing, new Vector3(-1, 1, -0.5), new Vector3());
  assert.ok(Math.abs(side.x - (-0.05 - GRIP_NUDGE)) < 1e-6, `x ${side.x}`);
});

test("the rope is gripped on its wooden bar, not on the 1.2 m cord's middle", () => {
  const parts = createBasket();
  parts.toggle.position.set(0, 1, -0.5);
  parts.toggle.updateMatrixWorld(true);
  const bar = new Box3().setFromObject(parts.toggle.getObjectByName('RopeToggleGrip'));
  bar.expandByScalar(GRIP_NUDGE + 1e-4);
  for (const name of ['RopeToggle', 'RopeToggleMesh']) {
    const thing = name === 'RopeToggle' ? parts.toggle : parts.toggle.getObjectByName(name);
    thing.name = name;
    const at = gripPoint(thing, new Vector3(0, 1.2, 0), new Vector3());
    assert.ok(bar.containsPoint(at), `${name}: ${at.toArray().map((v) => v.toFixed(3))}`);
  }
  assert.ok(gripRadius(parts.toggle) < 0.12, 'the glow is the size of the bar');
});

test("the way up is gripped in its ring's middle, from anywhere", () => {
  const wayUp = createWayUp();
  wayUp.updateMatrixWorld(true);
  const ring = new Box3().setFromObject(wayUp.getObjectByName('WayUpRing'));
  const middle = wayUp.getObjectByName('WayUpRingMiddle').getWorldPosition(new Vector3());
  for (const name of ['WayUp', 'WayUpRing', 'WayUpTarget']) {
    const thing = name === 'WayUp' ? wayUp : wayUp.getObjectByName(name);
    const at = gripPoint(thing, new Vector3(3, 2, 3), new Vector3());
    assert.ok(at.distanceTo(middle) < 1e-6, name);
  }
  assert.ok(ring.containsPoint(middle), 'inside the ring as drawn');
  assert.ok(middle.y > ring.max.y - 0.2, 'up in the ring, not down the post');
});

test("the knock on the family box's glass is ringed in a pane, clear of the glazing bar down its middle", () => {
  const { glass } = createFamily(new Vector3(-2.6, -2.6, -26.9));
  glass.position.set(0, 1.3, -0.6);
  glass.updateMatrixWorld(true);
  const at = gripPoint(glass, new Vector3(0, 1.6, 0), new Vector3());
  const local = glass.worldToLocal(at.clone());
  // The bar is 5 cm wide (x from -0.025 to 0.025); the ring is 2.6 cm across.
  assert.ok(local.x - 0.013 > 0.025 + 0.05, `x ${local.x.toFixed(3)}`);
  assert.ok(local.x + 0.013 < (ROOM_BOX.w - 0.1) / 2, 'inside the glass');
  assert.ok(Math.abs(local.y) < 1e-6 && local.z > 0, 'level with the middle, a hair in front');
});

test("the ghost hand's pinch and fingertip are on its picture, where the drawn fingers meet and point", () => {
  for (const tip of [PINCH_AT, POINT_AT]) {
    assert.ok(Math.abs(tip.x) < HINT_SIZE / 2 && Math.abs(tip.y) < HINT_SIZE / 2);
  }
  assert.ok(POINT_AT.y > PINCH_AT.y, 'the pointing tip is above the pinch');
});

test('all the rings, glows and the trail are one instanced draw', () => {
  const source = readFileSync(new URL('../src/systems/grip-marks.ts', import.meta.url), 'utf8');
  assert.equal(source.match(/new InstancedMesh\(/g)?.length, 1);
  assert.equal(source.match(/new Mesh\(|createTransformEntity\(/g)?.length, 1, 'one entity, and no other mesh');
  assert.match(source, /marks\.visible = this\.count > 0/, 'nothing drawn while there is nothing to mark');
  assert.match(source, /depthTest: true/);
});
