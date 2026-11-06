// The town's lamp over the square, measured from the seated eye with the station's real meshes: it never
// covers Nora's window, stays in the middle of the view, and stays small to draw. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Raycaster, Vector3 } = await import('@iwsdk/core');
const { PLAZA_Y, SEAT_EYE } = await import('../src/station/layout.ts');
const { createTown } = await import('../src/station/town.ts');
const { createFamily } = await import('../src/station/family.ts');
const { createTownLamp, TOWN_LAMP, WIRE_TO } = await import('../src/station/town-lamp.ts');

const eye = new Vector3(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
const lamp = createTownLamp();
lamp.group.updateMatrixWorld(true);
const parts = [lamp.wire, lamp.frame];

// Nora's window across the square: the pane the Keeper points at, which is also its light (FamilySystem).
const town = createTown();
const target = createFamily(town.tessaWindow).target;
target.updateMatrixWorld(true);
const { width, height } = target.geometry.parameters;
const corner = (u, v) => new Vector3(u * width / 2, v * height / 2, 0).applyMatrix4(target.matrixWorld);
const centre = corner(0, 0);
const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];

/** Degrees right of straight ahead (-z) and up from level, as seen from the eye. */
const angles = (p) => {
  const d = p.clone().sub(eye);
  return { yaw: (Math.atan2(d.x, -d.z) * 180) / Math.PI, pitch: (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI };
};
const between = (a, b) => (a.clone().sub(eye).angleTo(b.clone().sub(eye)) * 180) / Math.PI;

/** Every vertex of a mesh, in world space. */
const vertices = (mesh) => {
  const out = [];
  const position = mesh.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) out.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  return out;
};

test('rays from the eye to every corner and across the whole of Nora\'s window meet neither the frame nor its wire', () => {
  const ray = new Raycaster();
  const aims = [...corners, centre];
  for (let i = 0; i <= 8; i += 1) for (let j = 0; j <= 8; j += 1) aims.push(corner(-1 + i / 4, -1 + j / 4));
  for (const aim of aims) {
    const to = aim.clone().sub(eye);
    ray.set(eye, to.clone().normalize());
    ray.far = to.length();
    assert.deepEqual(ray.intersectObjects(parts, false).map((hit) => hit.object.name), [], `ray to ${aim.toArray().map((v) => v.toFixed(2))}`);
  }
});

test('every point of the frame and its wire lies outside the window\'s rectangle as seen and at least 4 degrees from its centre', () => {
  const seen = corners.map(angles);
  const yaw0 = Math.min(...seen.map((a) => a.yaw));
  const yaw1 = Math.max(...seen.map((a) => a.yaw));
  const pitch0 = Math.min(...seen.map((a) => a.pitch));
  const pitch1 = Math.max(...seen.map((a) => a.pitch));
  let nearest = Infinity;
  for (const mesh of parts) {
    for (const p of vertices(mesh)) {
      const a = angles(p);
      const inside = a.yaw >= yaw0 && a.yaw <= yaw1 && a.pitch >= pitch0 && a.pitch <= pitch1;
      assert.ok(!inside, `${mesh.name} point ${p.toArray().map((v) => v.toFixed(2))} is inside the window as seen`);
      nearest = Math.min(nearest, between(p, centre));
    }
  }
  assert.ok(nearest >= 4, `nearest point ${nearest.toFixed(1)} degrees from the window's centre`);
});

test('the frame hangs within the middle 60 degrees of the view, at about eye height, across the square', () => {
  const middle = new Vector3();
  lamp.frame.geometry.computeBoundingBox();
  lamp.frame.geometry.boundingBox.getCenter(middle).applyMatrix4(lamp.frame.matrixWorld);
  const a = angles(middle);
  assert.ok(Math.abs(a.yaw) <= 30, `yaw ${a.yaw.toFixed(1)}`);
  assert.ok(Math.abs(a.pitch) <= 10, `pitch ${a.pitch.toFixed(1)}`);
  const distance = middle.distanceTo(eye);
  assert.ok(distance > 8 && distance < 20, `${distance.toFixed(1)} m away`);
});

test("the wire's plate on the Deco front is let into solid stone, not hung in a window", () => {
  // The plate reaches 3 cm behind the fixing point, toward the wall (createWire): behind each of its corners and its
  // middle there is stone at once, never a window's recess.
  const facing = WIRE_TO[2] > TOWN_LAMP[2] ? -1 : 1;
  const back = WIRE_TO[2] - facing * 0.03;
  town.town.updateMatrixWorld(true);
  const solid = [];
  town.town.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh) solid.push(o);
  });
  const ray = new Raycaster();
  for (const [dx, dy] of [[0, 0], [-0.06, -0.06], [0.06, -0.06], [0.06, 0.06], [-0.06, 0.06]]) {
    ray.set(new Vector3(WIRE_TO[0] + dx, WIRE_TO[1] + dy, WIRE_TO[2] + facing * 0.5), new Vector3(0, 0, -facing));
    ray.far = 2;
    const hit = ray.intersectObjects(solid, false)[0];
    assert.ok(hit != null, `nothing behind the plate at ${dx}, ${dy}`);
    // How far the plate's back is let into the wall (negative: a gap behind it); at least 2 cm of it stands proud.
    const letIn = (hit.point.z - back) * facing;
    assert.ok(letIn >= -0.001 && letIn <= 0.05, `at ${dx}, ${dy} the plate's back is ${(letIn * 100).toFixed(1)} cm into ${hit.object.name}`);
  }
});

test('two meshes, under 3,000 triangles together', () => {
  let meshes = 0;
  let triangles = 0;
  lamp.group.traverse((o) => {
    if (!o.isMesh) return;
    meshes += 1;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  assert.equal(meshes, 2);
  assert.ok(triangles <= 3000, `${triangles} triangles`);
});

test("the town's small lamps stand where the seat can see them, over the sill", async () => {
  const { createEndingLights } = await import('../src/station/town-lamp.ts');
  const lamps = createEndingLights().getObjectByName('SmallLamps');
  const position = lamps.geometry.getAttribute('position');
  // The sill's outer edge hides the square up to this far out, from the seated eye.
  const hiddenTo = ((1.2 - PLAZA_Y) * 0.55) / (1.2 - 0.76);
  for (let i = 0; i < position.count; i += 1) assert.ok(-position.getZ(i) > hiddenTo, `lamp ${i} at ${position.getZ(i).toFixed(1)}`);
});
