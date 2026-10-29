import type { Mesh } from '@iwsdk/core';
import {
  ALL,
  band,
  beam,
  BOTTOM,
  box,
  doorway,
  Frame,
  FRONT,
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
  windowUnit,
  WORLD,
} from './facade.js';
import { PLAZA_Y, SILL, TOWER, WINDOW } from './layout.js';
import { plain } from './materials.js';
import { ASHLAR, crownRing, DRESSED, TRIMMED_WINDOW } from './palazzo.js';

/**
 * The Keeper's tower, the civic tower of the Palazzo of the Republic: an
 * ashlar shaft standing 0.9 m proud of the palazzo's wings, with the
 * Keeper's window a third of the way up, a street door under it, a clock
 * face without numerals above the palazzo's merlons, a crown of corbels and
 * merlons and an open lantern under a low tiled roof on top. Built into the
 * town kit, so it costs no draw calls of its own; only the door's iron ring
 * is separate, because the Keeper pulls it to climb back up.
 */

const TILE = 0xd99a7c;
const DOOR_WOOD = 0x6b4a32;
const DIAL = 0xf6f1e6;

const W = TOWER.halfWidth * 2;
const D = TOWER.backZ - TOWER.frontZ;
/** Wall top above the square, where the crown starts. */
const H = TOWER.top - PLAZA_Y;
/** Height of the open lantern above the wall top, to the underside of its roof slab. */
const LANTERN = 3.6;
/** Centre of the clock face above the square, clear of the palazzo's merlons. */
const CLOCK_V = 17.4;
const CLOCK_RADIUS = 1.05;

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

  // Walls with small stair windows up the shaft, and a plinth broken round the door.
  FACES.forEach(([f, width], i) => {
    const holes: Hole[] = i === 0 ? [window, door] : [];
    // Below the palazzo's roof only the front shows; above it every face does.
    if (i === 0) holes.push(slit(kit, f, width / 2, 12.0));
    holes.push(slit(kit, f, width / 2, i === 0 ? 19.6 : 17.2));
    if (i !== 0) holes.push(slit(kit, f, width / 2, 19.8));
    wallFace(kit.stone.color(ASHLAR), f, 0, width, -0.3, H, holes);
    const lap = width === W ? 0.06 : 0;
    band(kit.stone.color(DRESSED), f, -lap, width + lap, -0.25, 0.5, 0.06, i === 0 ? [portal] : [], STRIP);
    quoins(kit, f, width, i);
  });
  reveal(kit.stone.color(ASHLAR), FRONT_FACE, window, SILL.outerZ - TOWER.frontZ);

  // The Keeper's window: an outer ledge and a lintel.
  const st = kit.stone.color(SILL_STONE);
  box(st, FRONT_FACE, window.u0 - 0.08, window.v0 - 0.07, 0, window.u1 + 0.08, window.v0, 0.07, NO_BACK);
  box(st, FRONT_FACE, window.u0 - 0.1, window.v1, 0, window.u1 + 0.1, window.v1 + 0.22, 0.03, NO_BACK);

  clock(kit);
  crownRing(kit, -TOWER.halfWidth, TOWER.halfWidth, TOWER.frontZ, TOWER.backZ, TOWER.top, null, 0.45);
  lantern(kit);
}

/**
 * Alternating long and short dressed corner stones, lighter than the
 * ashlar, so the shaft's edges read against the palazzo behind it even in
 * the shade. Each face carries the stones at both of its ends; the stone at
 * a face's far end reaches past the corner by its own projection, so the
 * corner reads as one block, and the next face's stone there has the other
 * length.
 */
function quoins(kit: Kit, f: Frame, width: number, face: number): void {
  const st = kit.stone.color(DRESSED);
  const course = 0.36;
  const proud = 0.03;
  const length = (long: boolean) => (long ? 0.6 : 0.36);
  for (let k = 0, v = 0.5; v + course < H - 0.1; k += 1, v += course) {
    const top = v + course - 0.025;
    // The next face's near stone at this corner is that face's far length, the opposite of ours.
    const long = (k + face) % 2 === 0;
    box(st, f, width - length(long), v, 0, width + proud, top, proud, FRONT | TOP | BOTTOM | LEFT | RIGHT);
    box(st, f, 0, v, 0, length(long), top, proud, FRONT | TOP | BOTTOM | RIGHT);
  }
}

/** A narrow stair window centred at u, its sill at v. */
function slit(kit: Kit, f: Frame, u: number, v: number): Hole {
  return windowUnit(kit, f, { ...TRIMMED_WINDOW, u0: u - 0.35, v0: v, w: 0.7, h: 1.25 });
}

/**
 * A stone ring with a pale dial, twelve iron hour bars and two hands at ten
 * past ten; no numerals, no lettering.
 */
function clock(kit: Kit): void {
  const centre = FRONT_FACE.p(W / 2, CLOCK_V, 0);
  // A frame at the centre whose up axis points out of the wall, for the discs.
  const out = Frame.of(centre, FRONT_FACE.t, FRONT_FACE.n);
  prism(kit.stone.color(DRESSED), out, 0, 0, 0, 0.12, CLOCK_RADIUS + 0.16, CLOCK_RADIUS + 0.12, 32, { top: true });
  prism(kit.plaster.color(DIAL), out, 0, 0, 0.12, 0.15, CLOCK_RADIUS, CLOCK_RADIUS, 32, { top: true });
  // The dial plane: x to the viewer's right, y up, z out of the wall.
  const dial = new Frame(FRONT_FACE.p(W / 2, CLOCK_V, 0.15), FRONT_FACE.t, FRONT_FACE.up, FRONT_FACE.n);
  const m = kit.metal.color(IRON);
  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI) / 6;
    const wide = i % 3 === 0 ? 0.11 : 0.06;
    const r0 = CLOCK_RADIUS * (i % 3 === 0 ? 0.66 : 0.74);
    const r1 = CLOCK_RADIUS * 0.9;
    beam(m, dial.p(r0 * Math.sin(a), r0 * Math.cos(a), 0.01), dial.p(r1 * Math.sin(a), r1 * Math.cos(a), 0.01), wide, 0.02, dial.n);
  }
  const hand = (turns: number, length: number, width: number, lift: number) => {
    const a = turns * Math.PI * 2;
    beam(m, dial.p(-0.12 * Math.sin(a), -0.12 * Math.cos(a), lift), dial.p(length * Math.sin(a), length * Math.cos(a), lift), width, 0.02, dial.n);
  };
  hand((10 + 10 / 60) / 12, CLOCK_RADIUS * 0.55, 0.09, 0.03);
  hand(10 / 60, CLOCK_RADIUS * 0.82, 0.055, 0.055);
  prism(m, Frame.of(dial.p(0, 0, 0), FRONT_FACE.t, FRONT_FACE.n), 0, 0, 0, 0.08, 0.07, 0.07, 12, { top: true });
}

/** Four corner piers inside the merlons carrying a slab and the tiled roof: the sky shows through. */
function lantern(kit: Kit): void {
  const st = kit.stone.color(DRESSED);
  const y0 = TOWER.top;
  const y1 = y0 + LANTERN;
  const [x0, x1, z0, z1] = [-TOWER.halfWidth, TOWER.halfWidth, TOWER.frontZ, TOWER.backZ];
  const inset = 0.15;
  const size = 0.75;
  for (const x of [x0 + inset, x1 - inset - size]) {
    for (const z of [z0 + inset, z1 - inset - size]) {
      box(st, WORLD, x, y0, z, x + size, y1, z + size, ALL & ~TOP & ~BOTTOM);
    }
  }
  // The roof terrace inside the merlons, and the slab the roof sits on.
  box(kit.stone.color(ASHLAR), WORLD, x0, y0 - 0.1, z0, x1, y0, z1, TOP);
  box(kit.stone.color(DRESSED), WORLD, x0 - 0.1, y1, z0 - 0.1, x1 + 0.1, y1 + 0.35, z1 + 0.1, ALL & ~TOP);
  hipRoof(kit, FRONT_FACE, {
    width: W, depth: D, top: H + LANTERN + 0.35, rise: 2.2, front: 0.5, back: 0.5, vergeLeft: 0, vergeRight: 0,
    tile: TILE, soffit: DRESSED, wall: DRESSED, gutter: null,
  });
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
