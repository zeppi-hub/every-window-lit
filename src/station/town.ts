import { Group, type Material, Vector3 } from '@iwsdk/core';
import { brownstone, deco, type Ends, liberty, type Lot, loft, pera, republic, walkUp } from './city.js';
import { box, createKit, Frame, type Kit, NO_BOTTOM, type PartBuilder, prism, WORLD } from './facade.js';
import { seededRandom } from './geometry.js';
import { type Box, PLAZA_Y, TOWER } from './layout.js';
import { plain, scanned, windowGlass } from './materials.js';
import { palazzo, PALAZZO, PALAZZO_SOLID, PALAZZO_WALKABLE } from './palazzo.js';
import { bench, bicycle, cafeChair, cafeTable, fountain, moped, parasol } from './square.js';
import { SEA_Y } from './far-city.js';
import { boat, type BoatSpec, cityLamp, hydrant, ivy, KERB, mooringLine, newsstand, planeTree, promenadeRailing, sidewalk, tramTrack } from './streetscape.js';
import { tower } from './tower.js';

/**
 * The live, near part of Ombrisa: the Keeper's tower and the palazzo on one
 * side of the square, the row of buildings across it, the market street on
 * the right and the start of the coast road with its promenade. Beyond it
 * the city goes on in simpler 3D (far-city.ts); only the sky and the far
 * mountains are painted.
 *
 * Ombrisa is an island city-state and a business capital between the wars:
 * New York first, with Milan, Istanbul and Ankara in the mix (city.ts). The
 * row across the square runs from an Ankara block on the coast-road corner
 * through two brownstones, the Milan apartment where Tessa's family lives,
 * an Art Deco office block, a cast-iron loft and a brick walk-up; the market
 * street has a walk-up on its corner, a Milan brick block with the bakery, a
 * Pera apartment and a loft. Sidewalks, a tram track, lamp posts, plane
 * trees and a newsstand furnish it (streetscape.ts), and all of it merges
 * into one mesh per material.
 */

/** Matches NEAR_EDGE_Z in art/panorama/build_far_town.py. */
const NEAR_EDGE_Z = -36;
/**
 * The live coast road, quay and promenade run on past the near streets to
 * here, where far-city.ts takes the quay over: the small seam between
 * their heights then lies some 40 m beyond the end of the walk.
 */
const COAST_END_Z = -75;
/** Street lines: the row across the square faces +z, the market street faces -x. */
export const ROW_FRONT = -27;
const MARKET_FRONT = 30;
/** The two buildings between the palazzo and the market street face the square from its tower side. */
const CORNER_FRONT = -0.6;
/**
 * They start past the market street's line, so the end wall of its last
 * building (ending short of this front) closes on their front instead of
 * leaving a slot to the panorama.
 */
const CORNER_START = MARKET_FRONT + 1.4;
/**
 * The lane between the end of the row and the market street stops at a
 * house facing down it, with a garden wall on its right, instead of running
 * on into the panorama, which only holds up seen from the seat.
 */
const LANE_END_Z = -31;
/** Brownstones stand back from the street line behind their areaways; their stoops come forward. */
const AREAWAY = 1.4;
const STOOP_OUT = 3.24;
/** Sidewalk widths along the row and the market street, and the tram track's centre line. */
export const ROW_WALK = 2.7;
const MARKET_WALK = 2.4;
/** The tram's centre line down the coast road (shared with far-city.ts). */
const COAST_TRAM_X = -23.1;

const ROAD = 0xc9bfae;
const ROCK = 0xc8bca8;

export type { Box };

/**
 * The row across the square, left to right from x = -21, 47.4 m. The two
 * brownstones are set back; Tessa's window is on the Milan apartment's
 * first floor, left.
 */
const ROW_LOTS: readonly Lot[] = [
  republic({ width: 7.0, stone: 0xd9c4b8, trim: 0xe9ded4, cafe: [0xefe7d4, 0x7a2e2a] }),
  brownstone({ width: 5.0, stone: 0x6f4f40, trim: 0x8c6a58, door: 0x2e2620, stoopLeft: true }),
  brownstone({ width: 5.0, stone: 0x684a3c, trim: 0x86644f, door: 0x3a2a22, stoopLeft: false }),
  liberty({ width: 6.6, floors: 4, stucco: 0xf2dcc0, trim: 0xfaf1e2, shutter: 0x4f5d47, tessa: true }),
  deco({ width: 9.8, floors: 7, stone: 0xefe5d2, spandrel: 0x3f4640 }),
  loft({ width: 8.4, floors: 5, paint: 0xd9d2c3, fireEscape: true, waterTower: true, awning: null }),
  walkUp({ width: 5.6, floors: 4, brick: 0x9a5240, stone: 0xe6dccb, cornice: 0x51504b, fireEscape: true, waterTower: false, awning: [0xece4cf, 0x2f4f6f] }),
];

/** The market street from the lane corner (z = -26) toward the tower, 24 m. */
const MARKET_LOTS: readonly Lot[] = [
  walkUp({ width: 6.0, floors: 4, brick: 0x8a4a3a, stone: 0xe2d7c4, cornice: 0x3e3d39, fireEscape: true, waterTower: true, awning: [0xece4cf, 0x8a2f2f] }),
  walkUp({ width: 6.2, floors: 3, brick: 0xb06a4c, stone: 0xece2d0, cornice: 0x6b6156, fireEscape: false, waterTower: false, awning: [0xece4cf, 0x3f6a4a] }),
  pera({ width: 5.6, floors: 4, stone: 0xece0ca, trim: 0xf5ece0, door: 0x3a2c22 }),
  loft({ width: 6.2, floors: 4, paint: 0xc9cfc8, fireEscape: false, waterTower: false, awning: [0xece4cf, 0x2f4f6f] }),
];

/** From past the market street's corner back to the palazzo, 15 m. */
const CORNER_LOTS: readonly Lot[] = [
  pera({ width: 6.4, floors: 4, stone: 0xe7d9c2, trim: 0xf2e8da, door: 0x2c3a36 }),
  loft({ width: 8.6, floors: 4, paint: 0xbfb7a8, fireEscape: true, waterTower: true, awning: null }),
];

/** The house closing the lane. */
const LANE_LOTS: readonly Lot[] = [
  walkUp({ width: 6.2, floors: 3, brick: 0x94503f, stone: 0xe4d9c6, cornice: 0x4a4945, fireEscape: false, waterTower: false, awning: null }),
];

/**
 * Where the Keeper can stand: level patches of open ground, each a flat box
 * at its walking height, kept a little inside the edges (the quay's railing,
 * the building fronts, the near edge where the panorama takes over).
 * Sidewalks are listed before the square so an arc landing on one finds it
 * first.
 */
export const WALKABLE: readonly Box[] = [
  [-20.8, PLAZA_Y + KERB, ROW_FRONT + 0.4, 26.2, PLAZA_Y + KERB, ROW_FRONT + ROW_WALK],
  [MARKET_FRONT - MARKET_WALK, PLAZA_Y + KERB, -25.8, MARKET_FRONT - 0.4, PLAZA_Y + KERB, -1.6],
  [PALAZZO.right, PLAZA_Y + KERB, CORNER_FRONT - 2.2, MARKET_FRONT - MARKET_WALK, PLAZA_Y + KERB, CORNER_FRONT - 0.3],
  // The square, from the sidewalks' kerbs to the foot of the tower.
  [-20.8, PLAZA_Y, ROW_FRONT + ROW_WALK, MARKET_FRONT - MARKET_WALK, PLAZA_Y, -0.9],
  // The lane between the end of the row and the market street, up to the house that closes it.
  [26.8, PLAZA_Y, LANE_END_Z + 0.4, MARKET_FRONT - 0.2, PLAZA_Y, ROW_FRONT + 0.4],
  // The coast road and the promenade, a step down from the square, from the end of the
  // near streets to the palazzo.
  [-28.3, PLAZA_Y - 0.3, -34, -21.2, PLAZA_Y - 0.3, -1.0],
  ...PALAZZO_WALKABLE,
];

/** x of the start of each row lot, for the stoops' solids below. */
const ROW_STARTS = ROW_LOTS.reduce<number[]>((xs, lot) => [...xs, xs[xs.length - 1] + lot.width], [-21]);

/**
 * What the Keeper cannot walk through or land on: the buildings, the tower,
 * the newsstand and the furniture of the square, as boxes around each.
 * Mutable: things the week brings to the streets (OutcomeSystem) add and
 * remove their own boxes.
 */
export const SOLID: Box[] = [
  [-21.6, PLAZA_Y - 1, NEAR_EDGE_Z - 14, 26.4, PLAZA_Y + 50, ROW_FRONT],
  [MARKET_FRONT, PLAZA_Y - 1, -26.6, MARKET_FRONT + 20, PLAZA_Y + 30, -1.4],
  // The brownstones' stoops (lots 1 and 2), out over the sidewalk.
  [ROW_STARTS[1] + 0.1, PLAZA_Y - 1, ROW_FRONT, ROW_STARTS[1] + 2.1, PLAZA_Y + 2.7, ROW_FRONT - AREAWAY + STOOP_OUT + 0.3],
  [ROW_STARTS[3] - 2.1, PLAZA_Y - 1, ROW_FRONT, ROW_STARTS[3] - 0.1, PLAZA_Y + 2.7, ROW_FRONT - AREAWAY + STOOP_OUT + 0.3],
  // The tower from its wall face: the door step is low enough to stand on, so the ring is in reach.
  [-TOWER.halfWidth - 0.25, PLAZA_Y - 1, TOWER.frontZ - 0.05, TOWER.halfWidth + 0.25, TOWER.top + 3, TOWER.backZ + 0.25],
  // The newsstand where the coast road leaves the square, past the pastry shop's tables.
  [-20.9, PLAZA_Y - 1, -19.8, -17.7, PLAZA_Y + 3.2, -16.0],
  // Fountain, benches, the cafe, lamps, trees, hydrants, the moped and the two bicycles.
  [1.2, PLAZA_Y - 1, -16.8, 6.8, PLAZA_Y + 2.2, -11.2],
  [-1.15, PLAZA_Y - 1, -14.9, -0.45, PLAZA_Y + 0.95, -13.1],
  [8.45, PLAZA_Y - 1, -14.9, 9.15, PLAZA_Y + 0.95, -13.1],
  [-20.4, PLAZA_Y - 1, -24.3, -15.2, PLAZA_Y + 2.4, -22.9],
  ...[-17.5, -6.2, 6.4, 18.6].map((x): Box => [x - 0.3, PLAZA_Y - 1, -24.95, x + 0.3, PLAZA_Y + 6.5, -24.35]),
  ...[-16.75, -9.25].map((z): Box => [MARKET_FRONT - MARKET_WALK + 0.05, PLAZA_Y - 1, z - 0.3, MARKET_FRONT - MARKET_WALK + 0.65, PLAZA_Y + 6.5, z + 0.3]),
  ...[-66, -54, -42, -30, -18, -6].map((z): Box => [-28.75, PLAZA_Y - 1, z - 0.3, -28.15, PLAZA_Y + 6.5, z + 0.3]),
  ...[-12, -4].map((z): Box => [-20.1, PLAZA_Y - 1, z - 0.7, -18.7, PLAZA_Y + 4, z + 0.7]),
  ...[-20.5, -13, -5.5].map((z): Box => [MARKET_FRONT - MARKET_WALK - 1.6, PLAZA_Y - 1, z - 0.7, MARKET_FRONT - MARKET_WALK - 0.2, PLAZA_Y + 4, z + 0.7]),
  [2.3, PLAZA_Y - 1, -25.0, 2.9, PLAZA_Y + 1.0, -24.4],
  [MARKET_FRONT - 2.0, PLAZA_Y - 1, -16.3, MARKET_FRONT - 1.4, PLAZA_Y + 1.0, -15.7],
  [27.5, PLAZA_Y - 1, -12.1, 29.1, PLAZA_Y + 1.1, -10.7],
  [15.9, PLAZA_Y - 1, ROW_FRONT - 0.3, 17.8, PLAZA_Y + 1.1, ROW_FRONT + 0.8],
  [20.85, PLAZA_Y - 1, ROW_FRONT, 22.75, PLAZA_Y + 1.1, ROW_FRONT + 1.1],
  // The promenade's railing and benches, and the mooring bollards along the quay.
  [-29.2, PLAZA_Y - 1, COAST_END_Z, -28.6, PLAZA_Y + 1.2, 20],
  ...[-14, -2].map((z): Box => [-28.4, PLAZA_Y - 1, z - 0.9, -27.7, PLAZA_Y + 0.6, z + 0.9]),
  ...[-72, -64, -56, -48, -40, -32, -24, -16, -8].map((z): Box => [-28.35, PLAZA_Y - 1, z - 0.25, -27.85, PLAZA_Y + 0.25, z + 0.25]),
  // The palazzo, and the two buildings on the corner between it and the market street.
  ...PALAZZO_SOLID,
  [PALAZZO.right, PLAZA_Y - 1, CORNER_FRONT, CORNER_START + 0.2, PLAZA_Y + 30, CORNER_FRONT + 19],
  // The house at the end of the lane and the garden wall beside it.
  [26.4, PLAZA_Y - 1, LANE_END_Z - 17, 32.8, PLAZA_Y + 20, LANE_END_Z],
  [MARKET_FRONT + 0.2, PLAZA_Y - 1, LANE_END_Z, MARKET_FRONT + 0.6, PLAZA_Y + 3, -26],
];

export interface TownParts {
  town: Group;
  /** Centre of Tessa's window across the square, for the window pull later. */
  tessaWindow: Vector3;
}

/**
 * Builds a street of attached lots from `start` along the frame's tangent and
 * returns Tessa's window if it is on this street. The ends named free get
 * rounded corner piers; the lots between share their party walls.
 */
function street(
  kit: Kit,
  lots: readonly Lot[],
  frameAt: (u: number) => Frame,
  start: number,
  random: () => number,
  free: Ends,
): Vector3 | null {
  let u = start;
  let tessa: Vector3 | null = null;
  lots.forEach((lot, i) => {
    const ends: Ends = { left: i === 0 && free.left, right: i === lots.length - 1 && free.right };
    const spot = lot.build(kit, frameAt(u), ends, random);
    if (spot) tessa = new Vector3(spot[0], spot[1], spot[2]);
    u += lot.width;
  });
  return tessa;
}

/** The row, with the two brownstones set back behind their areaways. */
function row(kit: Kit, random: () => number): Vector3 {
  let tessa: Vector3 | null = null;
  ROW_LOTS.forEach((lot, i) => {
    const back = i === 1 || i === 2 ? AREAWAY : 0;
    // On the walk: shop sills, door steps and stoops start from the sidewalk, not the square below it.
    const f = Frame.of([ROW_STARTS[i], PLAZA_Y + KERB, ROW_FRONT - back], [1, 0, 0]);
    const ends: Ends = { left: i === 0, right: i === ROW_LOTS.length - 1 };
    const spot = lot.build(kit, f, ends, random);
    if (spot) tessa = new Vector3(spot[0], spot[1], spot[2]);
  });
  // The areaways' floors in front of the set-back brownstones.
  box(kit.stone.color(0x9a948a), WORLD, ROW_STARTS[1], PLAZA_Y - 0.3, ROW_FRONT - AREAWAY, ROW_STARTS[3], PLAZA_Y + KERB - 0.12, ROW_FRONT, NO_BOTTOM);
  return tessa ?? new Vector3(0, PLAZA_Y + 5.4, ROW_FRONT + 0.02);
}

// --- streets, quay and furniture ----------------------------------------------

/** Cobbled square, sidewalks along the buildings, the tram track, the coast road and its quay. */
function streets(kit: Kit): void {
  const pv = kit.paving.color(0xffffff);
  box(pv, WORLD, -21, PLAZA_Y - 1, ROW_FRONT - 0.4, MARKET_FRONT + 1, PLAZA_Y, -0.6, NO_BOTTOM);
  box(pv, WORLD, 26, PLAZA_Y - 1, NEAR_EDGE_Z, MARKET_FRONT + 0.2, PLAZA_Y, ROW_FRONT - 0.4, NO_BOTTOM);
  sidewalk(kit, -21, ROW_FRONT - 0.05, 26.4, ROW_FRONT + ROW_WALK, '+z');
  // The market's walk owns the corner; the corner buildings' walk meets it there, and a
  // short unkerbed piece fills the nook between the market's last building and theirs.
  sidewalk(kit, MARKET_FRONT - MARKET_WALK, -26.6, MARKET_FRONT + 0.05, CORNER_FRONT + 0.05, '-x');
  sidewalk(kit, PALAZZO.right, CORNER_FRONT - 2.2, MARKET_FRONT - MARKET_WALK, CORNER_FRONT + 0.05, '-z');
  sidewalk(kit, MARKET_FRONT + 0.05, -2.05, CORNER_START, CORNER_FRONT + 0.05, null);
  pv.color(ROAD);
  box(pv, WORLD, -25, PLAZA_Y - 0.6, COAST_END_Z, -21.2, PLAZA_Y - 0.3, 20, NO_BOTTOM);
  const st = kit.stone.color(ROCK);
  box(st, WORLD, -29, SEA_Y - 1, COAST_END_Z, -25, PLAZA_Y - 0.3, 20, NO_BOTTOM);
  st.color(0xe2d9c8);
  box(st, WORLD, -29.05, PLAZA_Y - 0.3, COAST_END_Z, -28.55, PLAZA_Y - 0.16, 20, NO_BOTTOM);
  st.color(0xece4d6);
  box(st, WORLD, -21.2, PLAZA_Y - 0.62, COAST_END_Z, -21, PLAZA_Y + 0.015, -0.6, NO_BOTTOM);
  const iron = kit.metal.color(0x2a2a2a);
  for (let z = -72; z <= -8; z += 8) {
    const f = WORLD.at(-28.1, PLAZA_Y - 0.3, z);
    prism(iron, f, 0, 0, 0, 0.42, 0.17, 0.13, 10, { smooth: true });
    prism(iron, f, 0, 0, 0.42, 0.5, 0.21, 0.21, 10, { top: true });
  }
  promenadeRailing(kit, -28.9, PLAZA_Y - 0.16, COAST_END_Z, 20);
  // The tram runs along the coast road; far-city.ts carries the track on beyond both ends.
  tramTrack(kit, COAST_TRAM_X, COAST_END_Z, 20, PLAZA_Y - 0.3);
}

/** A bicycle leaning on a wall: its wheels 0.5 m out, its top tipped back to the wall. */
function leaning(wall: Frame, u: number, facingLeft: boolean): Frame {
  const lean = 0.2;
  return facingLeft ? wall.turned(u, 0, 0.5, Math.PI).rolled(lean) : wall.at(u, 0, 0.5).rolled(-lean);
}

function furnish(kit: Kit, random: () => number): void {
  const walk = PLAZA_Y + KERB;
  fountain(kit, 4, -14);
  bench(kit, WORLD.turned(-0.8, PLAZA_Y, -14, Math.PI / 2));
  bench(kit, WORLD.turned(8.8, PLAZA_Y, -14, -Math.PI / 2));
  // Lamp posts on the sidewalks, their arms out over the street, and along the promenade.
  for (const x of [-17.5, -6.2, 6.4, 18.6]) cityLamp(kit, x, walk, -24.65, -Math.PI / 2);
  for (const z of [-16.75, -9.25]) cityLamp(kit, MARKET_FRONT - MARKET_WALK + 0.35, walk, z, Math.PI);
  for (const z of [-66, -54, -42, -30, -18, -6]) cityLamp(kit, -28.45, PLAZA_Y - 0.3, z, 0);
  // Plane trees along the coast-road edge and the market street, framing the view from the window.
  for (const z of [-12, -4]) planeTree(kit, -19.4, PLAZA_Y, z, random);
  for (const z of [-20.5, -13, -5.5]) planeTree(kit, MARKET_FRONT - MARKET_WALK - 0.9, PLAZA_Y, z, random);
  hydrant(kit, 2.6, walk, -24.7, 0);
  hydrant(kit, MARKET_FRONT - 1.7, walk, -16, Math.PI / 2);
  // The pastry shop's tables in front of the Ankara block, between the kerb and the tram.
  cafeTable(kit, -19.4, -23.6);
  cafeTable(kit, -17.2, -23.5);
  cafeTable(kit, -15.6, -23.7);
  cafeChair(kit, WORLD.turned(-19.95, PLAZA_Y, -23.6, Math.PI / 2));
  cafeChair(kit, WORLD.turned(-18.85, PLAZA_Y, -23.6, -Math.PI / 2));
  cafeChair(kit, WORLD.turned(-17.2, PLAZA_Y, -23.0, Math.PI));
  cafeChair(kit, WORLD.turned(-16.15, PLAZA_Y, -23.7, Math.PI / 2));
  cafeChair(kit, WORLD.turned(-15.05, PLAZA_Y, -23.7, -Math.PI / 2));
  parasol(kit, -18.3, -23.4, [0xefe7d4, 0x7a2e2a]);
  // Promenade benches facing the sea.
  bench(kit, WORLD.turned(-28.0, PLAZA_Y - 0.3, -14, -Math.PI / 2));
  bench(kit, WORLD.turned(-28.0, PLAZA_Y - 0.3, -2, -Math.PI / 2));
  // Two bicycles against the loft and the walk-up, and an old moped on its stand.
  bicycle(kit, leaning(Frame.of([14.0, walk, ROW_FRONT - 0.3], [1, 0, 0]), 2.85, false), { frame: 0x2f5f4a, guards: 0xefe7d2 });
  bicycle(kit, leaning(Frame.of([19.8, walk, ROW_FRONT], [1, 0, 0]), 2.0, true), { frame: 0x6a2a2a, guards: 0x1d1d1d });
  moped(kit, WORLD.turned(28.3, walk, -11.4, -2.62), 0x9cbfae);
  newsstand(kit, -20.7, -19.6, -17.9, -16.2, random);
}

/** Harbour launches and rowing boats tied up below the promenade, fenders against the quay. */
const MOORED: ReadonlyArray<{ stern: number; north: boolean; spec: BoatSpec }> = [
  { stern: 1.0, north: true, spec: { length: 7.4, beam: 2.3, hull: 0x22304a, strake: 0xe8e2d4, cabin: 0xe8e2d4 } },
  { stern: -18.6, north: false, spec: { length: 4.4, beam: 1.5, hull: 0xf0ece2, strake: 0x2f4f7a, cabin: null } },
  { stern: -23.6, north: true, spec: { length: 6.6, beam: 2.1, hull: 0x24413a, strake: 0xefe9dc, cabin: 0xefe9dc } },
  { stern: -44.6, north: false, spec: { length: 4.2, beam: 1.45, hull: 0x8a3a2c, strake: 0xe6dfcf, cabin: null } },
];

function moorings(kit: Kit): void {
  const face = -29;
  const ring = PLAZA_Y - 0.62;
  for (const { stern, north, spec } of MOORED) {
    const ahead = north ? -1 : 1;
    // Bow north, the frame's +w is +x, toward the quay; bow south, it points out to sea.
    const f = Frame.of([face - 0.22 - spec.beam / 2, SEA_Y, stern], [0, 0, ahead]);
    const cleats = boat(kit, f, spec, north ? 1 : -1);
    mooringLine(kit, face, ring, stern + ahead * (spec.length + 0.8), cleats.bow, cleats.bowLead);
    mooringLine(kit, face, ring, stern - ahead * 0.9, cleats.stern, cleats.sternLead);
  }
}

/** The house closing the lane and a plastered garden wall from it to the market street's first building. */
function laneEnd(kit: Kit, random: () => number): void {
  street(kit, LANE_LOTS, (u) => Frame.of([u, PLAZA_Y, LANE_END_Z], [1, 0, 0]), 26.4, random, { left: false, right: true });
  box(kit.plaster.color(0xf0e6d6), WORLD, MARKET_FRONT + 0.2, PLAZA_Y - 0.3, LANE_END_Z, MARKET_FRONT + 0.6, PLAZA_Y + 2.8, -26, NO_BOTTOM);
  box(kit.stone.color(0xe6dccb), WORLD, MARKET_FRONT + 0.1, PLAZA_Y + 2.8, LANE_END_Z, MARKET_FRONT + 0.7, PLAZA_Y + 2.95, -26, NO_BOTTOM);
  // A garden behind it: ivy over the coping and a plane tree showing above.
  ivy(kit, MARKET_FRONT + 0.4, PLAZA_Y + 2.95, LANE_END_Z, -26, random);
  // Small enough that its crown stays between the lane house and the market street's first building.
  planeTree(kit, 33.6, PLAZA_Y, -28.5, random, 0.6);
}

// --- assembly ------------------------------------------------------------------

export function createTown(seed = 7): TownParts {
  const kit = createKit();
  const random = seededRandom(seed);
  streets(kit);
  const tessa = row(kit, random);
  const marketAt = (z: number) => Frame.of([MARKET_FRONT, PLAZA_Y + KERB, z], [0, 0, 1]);
  street(kit, MARKET_LOTS, marketAt, -26, random, { left: true, right: true });
  // Facing the square from the tower's side, running from the market corner toward the palazzo.
  const cornerAt = (u: number) => Frame.of([-u, PLAZA_Y + KERB, CORNER_FRONT], [-1, 0, 0]);
  street(kit, CORNER_LOTS, cornerAt, -CORNER_START, random, { left: true, right: false });
  laneEnd(kit, random);
  furnish(kit, random);
  tower(kit);
  palazzo(kit);

  const parts: Array<[PartBuilder, Material, string]> = [
    [kit.brick, scanned('red_brick_03'), 'TownBrick'],
    [kit.limestone, scanned('white_sandstone_blocks_02'), 'TownLimestone'],
    [kit.concrete, scanned('concrete_floor_02'), 'TownConcrete'],
    [kit.plaster, scanned('painted_plaster_wall'), 'TownWalls'],
    [kit.roof, scanned('roof_09'), 'TownRoofs'],
    [kit.paving, scanned('cobblestone_floor_08'), 'TownPaving'],
    [kit.stone, scanned('large_sandstone_blocks_01'), 'TownStone'],
    [kit.wood, scanned('wood_shutter'), 'TownWood'],
    [kit.paint, plain(0.55), 'TownPaint'],
    [kit.metal, plain(0.4, 0.8), 'TownIron'],
    [kit.glass, windowGlass(), 'TownGlass'],
    [kit.cloth, plain(0.85), 'TownCloth'],
  ];
  const town = new Group();
  town.name = 'Town';
  let triangles = 0;
  for (const [builder, material, name] of parts) {
    if (builder.triangles === 0) continue;
    triangles += builder.triangles;
    town.add(builder.mesh(material, name));
  }
  // The boats float at sea level, below the square, so they go without street-level shading.
  const afloat = createKit();
  moorings(afloat);
  const boats: Array<[PartBuilder, Material, string]> = [
    [afloat.wood, scanned('wood_shutter', { street: false }), 'BoatWood'],
    [afloat.paint, plain(0.55, 0, false, false), 'BoatPaint'],
    [afloat.metal, plain(0.4, 0.8, false, false), 'BoatIron'],
    [afloat.glass, plain(0.12, 0, false, false), 'BoatGlass'],
    [afloat.cloth, plain(0.85, 0, false, false), 'BoatRope'],
  ];
  for (const [builder, material, name] of boats) {
    if (builder.triangles === 0) continue;
    triangles += builder.triangles;
    town.add(builder.mesh(material, name));
  }
  town.userData.triangles = triangles;
  return { town, tessaWindow: tessa };
}
