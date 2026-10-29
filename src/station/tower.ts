import type { Mesh } from '@iwsdk/core';
import {
  ALL,
  band,
  BOTTOM,
  box,
  doorway,
  FRONT,
  Frame,
  type Hole,
  hipRoof,
  IRON,
  type Kit,
  LEFT,
  NO_BACK,
  PartBuilder,
  PORTAL_STONE,
  prism,
  reveal,
  RIGHT,
  SILL_STONE,
  STRIP,
  TOP,
  torus,
  wallFace,
  WORLD,
} from './facade.js';
import { PLAZA_Y, SILL, TOWER, WINDOW } from './layout.js';
import { plain } from './materials.js';

/**
 * The outside of the Keeper's tower: a plastered shaft from the square up
 * past the room, stone quoins at the corners, a cornice and a low tiled hip
 * roof, the window the Keeper looks out of and a street door under it.
 * Built into the town kit, so it costs no draw calls of its own; only the
 * door's iron ring is separate, because the Keeper pulls it to climb back up.
 */

const PLASTER = 0xf2e6cf;
const QUOIN = 0xe4d8c2;
const TILE = 0xd99a7c;
const DOOR_WOOD = 0x6b4a32;

const W = TOWER.halfWidth * 2;
const D = TOWER.backZ - TOWER.frontZ;
/** Wall top above the square, where the cornice ends and the eaves start. */
const H = TOWER.top - PLAZA_Y;

/** The four outer faces, each running to where the next one starts (anticlockwise from above). */
const FRONT_FACE = Frame.of([TOWER.halfWidth, PLAZA_Y, TOWER.frontZ], [-1, 0, 0]);
const FACES: ReadonlyArray<[Frame, number]> = [
  [FRONT_FACE, W],
  [Frame.of([-TOWER.halfWidth, PLAZA_Y, TOWER.frontZ], [0, 0, 1]), D],
  [Frame.of([-TOWER.halfWidth, PLAZA_Y, TOWER.backZ], [1, 0, 0]), W],
  [Frame.of([TOWER.halfWidth, PLAZA_Y, TOWER.backZ], [0, 0, -1]), D],
];

/** The street door, centred under the window; the ring hangs on its left leaf. */
const DOOR = { u0: W / 2 - 0.65, w: 1.3, h: 2.6, depth: 0.3 } as const;

export function tower(kit: Kit): void {
  const window: Hole = {
    u0: W / 2 - (WINDOW.halfWidth + 0.05),
    u1: W / 2 + (WINDOW.halfWidth + 0.05),
    v0: SILL.top - 0.08 - PLAZA_Y,
    v1: WINDOW.top + 0.05 - PLAZA_Y,
  };
  const door = doorway(kit, FRONT_FACE, {
    ...DOOR,
    colour: DOOR_WOOD,
    wood: true,
    fanlight: false,
    portal: 'classic',
    stone: PORTAL_STONE,
  });
  const portal: Hole = { u0: door.u0 - 0.34, u1: door.u1 + 0.34, v0: -1, v1: DOOR.h + 0.4 };

  // Walls, a stone plinth broken around the door portal, and the corner quoins.
  FACES.forEach(([f, width], i) => {
    wallFace(kit.plaster.color(PLASTER), f, 0, width, -0.3, H, i === 0 ? [window, door] : []);
    const lap = width === W ? 0.05 : 0;
    band(kit.stone.color(QUOIN), f, -lap, width + lap, -0.25, 0.5, 0.05, i === 0 ? [portal] : [], STRIP);
    quoins(kit, f, width, i);
  });
  reveal(kit.plaster.color(PLASTER), FRONT_FACE, window, SILL.outerZ - TOWER.frontZ);

  // The window's outer ledge and lintel.
  const st = kit.stone.color(SILL_STONE);
  box(st, FRONT_FACE, window.u0 - 0.08, window.v0 - 0.07, 0, window.u1 + 0.08, window.v0, 0.07, NO_BACK);
  box(st, FRONT_FACE, window.u0 - 0.1, window.v1, 0, window.u1 + 0.1, window.v1 + 0.22, 0.03, NO_BACK);

  // A two-step stone cornice all round, then the roof.
  const c = kit.stone.color(QUOIN);
  const [x0, x1, z0, z1] = [-TOWER.halfWidth, TOWER.halfWidth, TOWER.frontZ, TOWER.backZ];
  box(c, WORLD, x0 - 0.1, TOWER.top - 0.36, z0 - 0.1, x1 + 0.1, TOWER.top - 0.18, z1 + 0.1, ALL & ~TOP);
  box(c, WORLD, x0 - 0.22, TOWER.top - 0.18, z0 - 0.22, x1 + 0.22, TOWER.top, z1 + 0.22, ALL);
  hipRoof(kit, FRONT_FACE, {
    width: W, depth: D, top: H, rise: 2.2, front: 0.5, back: 0.5, vergeLeft: 0, vergeRight: 0,
    tile: TILE, soffit: PLASTER, wall: PLASTER, gutter: null,
  });
}

/**
 * Alternating long and short corner stones. Each face carries the stones at
 * both of its ends; the stone at a face's far end reaches past the corner by
 * its own projection, so the corner reads as one solid block, and the next
 * face's stone at that corner has the other length.
 */
function quoins(kit: Kit, f: Frame, width: number, face: number): void {
  const st = kit.stone.color(QUOIN);
  const course = 0.34;
  const proud = 0.025;
  const length = (long: boolean) => (long ? 0.56 : 0.34);
  for (let k = 0, v = 0.5; v + course < H - 0.4; k += 1, v += course) {
    const top = v + course - 0.02;
    // The next face's near stone at this corner is that face's far length, the opposite of ours.
    const farLong = (k + face) % 2 === 0;
    const nearLong = farLong;
    box(st, f, width - length(farLong), v, 0, width + proud, top, proud, FRONT | TOP | BOTTOM | LEFT | RIGHT);
    box(st, f, 0, v, 0, length(nearLong), top, proud, FRONT | TOP | BOTTOM | RIGHT);
  }
}

/**
 * The iron ring on the tower door, on its own so it can be poked or pinched:
 * a round backplate on the left leaf, a staple at its top and the ring
 * hanging from it over the plate. The plate fills the ring, so a fingertip
 * pushed through the middle of the ring still meets iron.
 */
export function createDoorRing(): Mesh {
  const b = new PartBuilder();
  const leaf = -DOOR.depth + 0.05 + 0.018;
  const centre = FRONT_FACE.p(DOOR.u0 + 0.33, 1.25, leaf);
  // A frame at the ring's centre whose up axis points out of the door.
  const plate = Frame.of([0, 0, 0], FRONT_FACE.t, FRONT_FACE.n);
  const f = new Frame([0, 0, 0], FRONT_FACE.t, FRONT_FACE.up, FRONT_FACE.n);
  b.color(IRON);
  prism(b, plate, 0, 0, 0, 0.008, 0.09, 0.084, 28, { top: true, smooth: true });
  prism(b, plate, 0, 0, 0.008, 0.016, 0.03, 0.026, 16, { top: true, smooth: true });
  box(b, f, -0.008, 0.062, 0.008, 0.008, 0.09, 0.03, NO_BACK);
  torus(b, f.p(0, 0, 0.03), f.n, 0.07, 0.011, 28, 8);
  const ring = b.mesh(plain(0.45, 0.85), 'TowerDoorRing');
  ring.position.set(centre[0], centre[1], centre[2]);
  return ring;
}
