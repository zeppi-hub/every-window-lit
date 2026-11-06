// The closed shutters, measured from the seated eye with the station's real meshes: no sight line passes them, so
// their gaps show flat daylight and never slices of the town, and the lintel above is stone. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Color, FrontSide, Raycaster, Vector3 } = await import('@iwsdk/core');
const { SEAT_EYE, SILL, WINDOW } = await import('../src/station/layout.ts');
const { createRoom, setSlatDaylight } = await import('../src/station/room.ts');

const eye = new Vector3(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
const parts = createRoom();
const solids = [parts.room, parts.shutterLeft, parts.shutterRight];
for (const object of solids) object.updateMatrixWorld(true);

/** Light and paint on the room's surfaces: a sight line passes through them. */
const SEE_THROUGH = /^ShutterTitle|^ShutterLight|^ShutterSway$/;

/** The first solid thing a sight line meets, `yaw` degrees right and `pitch` up from the seat. */
function seenAt(yaw, pitch, from = eye) {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const ray = new Raycaster(from, new Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)), 0, 60);
  return ray.intersectObjects(solids, true).find((hit) => !SEE_THROUGH.test(hit.object.name))?.object.name ?? null;
}

test('from the seat no sight line passes the closed slats: the gaps show the daylight behind them, not the town', () => {
  const open = [];
  const daylight = new Set();
  for (const yaw of [-30, -15, 7, 19, 33]) {
    // Between the two rails. Above and under the leaves a thin line of real sky and square stays, as at any shutter.
    for (let pitch = -30; pitch <= 45; pitch += 0.02) {
      const seen = seenAt(yaw, pitch);
      if (seen == null) open.push(`${yaw} across, ${pitch.toFixed(2)} up`);
      else if (seen.startsWith('ShutterDaylight')) daylight.add(seen);
    }
  }
  assert.deepEqual(open.slice(0, 8), [], `${open.length} sight lines pass the slats`);
  assert.deepEqual([...daylight].sort(), ['ShutterDaylightLeft', 'ShutterDaylightRight']);
});

test('the lintel over the window has an underside: above the closed leaves the eye meets stone', () => {
  assert.equal(seenAt(0, 60), 'RoomStone');
  assert.equal(seenAt(12, 70), 'RoomStone');
});

test("the daylight stands behind the slats, faces the room only, and is a leaf's own: it swings with it", () => {
  for (const [leaf, name] of [[parts.shutterLeft, 'ShutterDaylightLeft'], [parts.shutterRight, 'ShutterDaylightRight']]) {
    const daylight = leaf.getObjectByName(name);
    assert.ok(daylight != null, name);
    // Behind the slats, inside the stiles and rails, which reach further back and past its edges.
    const z = [...new Set(daylight.parent.geometry.attributes.position.array.filter((_, i) => i % 3 === 2))].sort((a, b) => a - b);
    assert.ok(z[0] < daylight.position.z && daylight.position.z < z[1], `at ${daylight.position.z} among ${z.slice(0, 2)}`);
    assert.ok(daylight.geometry.parameters.width <= WINDOW.halfWidth - 0.1 + 1e-6);
    assert.ok(daylight.geometry.parameters.height <= WINDOW.top - WINDOW.bottom - 0.12 + 1e-6);
    assert.equal(daylight.material.side, FrontSide);
    assert.ok(daylight.material.isMeshBasicMaterial && !daylight.material.transparent, 'flat and opaque');
    assert.equal(daylight.geometry.index.count / 3, 2);
    // From the square, closed, the eye passes it (the room's dim shows in the gaps, as it always did).
    const square = new Vector3(0, SILL.top + 0.3, -3);
    const ray = new Raycaster(square, new Vector3().subVectors(daylight.getWorldPosition(new Vector3()), square).normalize(), 0, 10);
    assert.equal(ray.intersectObject(daylight).length, 0, 'seen from outside');
    assert.ok(new Raycaster(eye, new Vector3().subVectors(daylight.getWorldPosition(new Vector3()), eye).normalize(), 0, 10).intersectObject(daylight).length > 0, 'seen from the seat');
  }
});

test('the light behind the slats follows the sky: day by day, dimmer at dusk, dark on the last night, and day again', () => {
  const { color } = parts.shutterLeft.getObjectByName('ShutterDaylightLeft').material;
  assert.equal(parts.shutterRight.getObjectByName('ShutterDaylightRight').material.color, color, 'both leaves show the same light');
  const seen = (e, night) => {
    setSlatDaylight(e, night);
    return color.r + color.g + color.b;
  };
  const day = seen(0, 0);
  assert.equal(color.getHex(), 0xfff1d8);
  const dusk = seen(1, 0);
  assert.equal(color.getHex(), new Color(0x7d7486).getHex());
  assert.ok(seen(0.5, 0) < day && seen(0.5, 0) > dusk);
  assert.ok(seen(1, 1) < dusk / 2);
  assert.equal(seen(0, 0), day);
});
