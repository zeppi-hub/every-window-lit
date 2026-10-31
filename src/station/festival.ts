import { Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from '@iwsdk/core';
import { PLAZA_Y } from './layout.js';

/**
 * The last night of the season (META_VR_FIKIR.md §10): strings of warm
 * bulbs hung across the square, from the lamp posts along the row to the
 * palazzo's front, lit when the Keeper lights the lamp on the last Sunday.
 * How many of the town's windows light up with them is the season's model's
 * (festivalLights): no ending has a loss.
 */

/** Where each string hangs from and to (x, height, z), sagging between. */
const STRINGS: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = [
  [[-17.5, 4.6, -24.6], [-6, 6.2, -2.2]],
  [[-6.2, 4.6, -24.6], [-1.5, 6.2, -2.2]],
  [[6.4, 4.6, -24.6], [2.5, 6.2, -2.2]],
  [[18.6, 4.6, -24.6], [7, 6.2, -2.2]],
  [[-17.5, 4.6, -24.6], [18.6, 4.6, -24.6]],
];
const BULBS_PER_STRING = 22;
const SAG = 1.4;
const COLOURS = [0xffd27a, 0xffb36b, 0xfff0c2, 0xff9e7a];

export function createFestival(): Group {
  const festival = new Group();
  festival.name = 'Festival';
  const count = STRINGS.length * BULBS_PER_STRING;
  const bulbs = new InstancedMesh(new SphereGeometry(0.085, 8, 6), new MeshBasicMaterial({ color: 0xffffff }), count);
  bulbs.name = 'FestivalBulbs';
  // The wire between bulbs: one thin rod per gap, ends included.
  const wire = new InstancedMesh(
    new CylinderGeometry(0.009, 0.009, 1, 4, 1, true),
    new MeshStandardMaterial({ color: 0x2b2622, roughness: 0.8 }),
    STRINGS.length * (BULBS_PER_STRING + 1),
  );
  wire.name = 'FestivalWire';
  const m = new Matrix4();
  const p = new Vector3();
  const last = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const mid = new Vector3();
  const dir = new Vector3();
  const size = new Vector3();
  const up = new Vector3(0, 1, 0);
  const turn = new Quaternion();
  const colour = new Color();
  let rod = 0;
  const link = (from: Vector3, to: Vector3) => {
    dir.subVectors(to, from);
    size.set(1, dir.length(), 1);
    turn.setFromUnitVectors(up, dir.normalize());
    wire.setMatrixAt(rod, m.compose(mid.addVectors(from, to).multiplyScalar(0.5), turn, size));
    rod += 1;
  };
  const at = (out: Vector3, t: number) => {
    out.lerpVectors(a, b, t);
    out.y -= SAG * 4 * t * (1 - t);
    return out;
  };
  STRINGS.forEach(([from, to], s) => {
    a.set(from[0], PLAZA_Y + from[1], from[2]);
    b.set(to[0], PLAZA_Y + to[1], to[2]);
    last.copy(a);
    for (let k = 0; k < BULBS_PER_STRING; k += 1) {
      at(p, (k + 0.5) / BULBS_PER_STRING);
      bulbs.setMatrixAt(s * BULBS_PER_STRING + k, m.makeTranslation(p.x, p.y, p.z));
      bulbs.setColorAt(s * BULBS_PER_STRING + k, colour.setHex(COLOURS[(k + s) % COLOURS.length]));
      link(last, p);
      last.copy(p);
    }
    link(last, b);
  });
  bulbs.computeBoundingSphere();
  wire.computeBoundingSphere();
  festival.add(bulbs, wire);
  festival.visible = false;
  return festival;
}
