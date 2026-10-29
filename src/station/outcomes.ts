import { Group } from '@iwsdk/core';
import { ALL, box, createKit, Frame, type Kit, type PartBuilder, prism, torus, tube, type V3, WORLD } from './facade.js';
import { type Box, PLAZA_Y } from './layout.js';
import { plain, scanned } from './materials.js';
import { KERB } from './streetscape.js';
import { ROW_FRONT, ROW_WALK } from './town.js';

/**
 * What the Keeper's choice brings to the streets, each shown from the
 * evening it arrives (OUTCOME_DAY in systems/sun.ts):
 *
 * - the pumps filled: cars back, parked along the row across the square;
 * - the clinic paying: a parcel on the step of Tessa's building;
 * - the tram plan: works on the square for a new line, a scaffold, a
 *   striped barrier and new rails stacked beside it.
 *
 * All in front of the window: from the seat the coast road hides behind
 * the row's first building and the window's jamb.
 *
 * Plain period shapes with no badges, plates or lettering.
 */

/** The works on the square, left of the fountain; the Keeper cannot walk through them, or the cars, while they are there. */
export const WORKS_SOLID: Box = [-12.6, PLAZA_Y - 1, -19.2, -9.4, PLAZA_Y + 3, -15.6];
/** Parked against the row's kerb, between its lamp posts. */
const CAR_Z = ROW_FRONT + ROW_WALK + 1.05;
const CARS: ReadonlyArray<{ x: number; east: boolean; colour: number }> = [
  { x: 9.6, east: true, colour: 0xe3d7bb },
  { x: -10.6, east: false, colour: 0x5f8a86 },
];
export const CAR_SOLIDS: readonly Box[] = CARS.map(({ x }): Box => [x - 2.3, PLAZA_Y - 1, CAR_Z - 0.9, x + 2.3, PLAZA_Y + 1.6, CAR_Z + 0.9]);

export interface OutcomeParts {
  group: Group;
}

/** `door` is the x of the door of Tessa's building, on the row's sidewalk. */
export function createOutcomes(door: number): OutcomeParts {
  const group = new Group();
  group.name = 'Outcomes';
  group.add(part('OutcomeCars', (kit) => {
    for (const { x, east, colour } of CARS) car(kit, Frame.of([x, PLAZA_Y, CAR_Z], [east ? 1 : -1, 0, 0]), colour);
  }));
  group.add(part('OutcomeParcel', (kit) => parcels(kit, door, PLAZA_Y + KERB, ROW_FRONT + 0.35)));
  group.add(part('OutcomeWorks', (kit) => works(kit)));
  for (const child of group.children) child.visible = false;
  return { group };
}

/** One outcome's meshes, built in a kit of its own so it can be shown and hidden whole. */
function part(name: string, build: (kit: Kit) => void): Group {
  const kit = createKit();
  build(kit);
  const g = new Group();
  g.name = name;
  const parts: Array<[PartBuilder, ReturnType<typeof plain>]> = [
    [kit.paint, plain(0.42, 0.05)],
    [kit.metal, plain(0.3, 0.9)],
    [kit.glass, plain(0.1)],
    [kit.wood, scanned('wood_shutter')],
    [kit.cloth, plain(0.85)],
  ];
  parts.forEach(([builder, material], index) => {
    if (builder.triangles > 0) g.add(builder.mesh(material, `${name}${index}`));
  });
  return g;
}

/** A rounded mid-century saloon, about 4.3 m long, its bonnet toward the frame's tangent. */
function car(kit: Kit, f: Frame, colour: number): void {
  const p = kit.paint;
  const round = p.round;
  p.round = 0.12;
  p.color(colour);
  box(p, f, -2.1, 0.32, -0.83, 2.1, 0.86, 0.83, ALL);
  p.round = 0.1;
  box(p, f, -1.15, 0.86, -0.74, 0.65, 1.42, 0.74, ALL);
  p.round = round;
  // Windows round the cabin.
  const g = kit.glass.color(0x1f2a30);
  for (const side of [-1, 1]) {
    const w = side * 0.745;
    g.quadToward(f.p(-1.0, 0.92, w), f.p(0.5, 0.92, w), f.p(0.45, 1.34, w), f.p(-0.95, 1.34, w), f.v(0, 0, side));
  }
  g.quadToward(f.p(0.655, 0.92, -0.62), f.p(0.655, 0.92, 0.62), f.p(0.655, 1.34, 0.58), f.p(0.655, 1.34, -0.58), f.v(1, 0, 0));
  g.quadToward(f.p(-1.155, 0.94, -0.6), f.p(-1.155, 0.94, 0.6), f.p(-1.155, 1.32, 0.56), f.p(-1.155, 1.32, -0.56), f.v(-1, 0, 0));
  // Chrome bumpers and a grille, lamps, and wheels in dark arches.
  const chrome = kit.metal.color(0xd8d8d4);
  box(chrome, f, 2.05, 0.3, -0.84, 2.2, 0.42, 0.84, ALL);
  box(chrome, f, -2.2, 0.3, -0.84, -2.05, 0.42, 0.84, ALL);
  box(chrome, f, 2.09, 0.48, -0.35, 2.12, 0.74, 0.35, ALL);
  kit.paint.color(0xf6efd8);
  for (const side of [-1, 1]) prism(kit.paint, Frame.of(f.p(2.08, 0.66, side * 0.6), f.v(0, 0, 1), f.v(1, 0, 0)), 0, 0, 0, 0.05, 0.085, 0.085, 14, { smooth: true, top: true });
  kit.paint.color(0x8a2a24);
  for (const side of [-1, 1]) box(kit.paint, f, -2.12, 0.58, side * 0.7 - 0.08, -2.08, 0.68, side * 0.7 + 0.08, ALL);
  for (const u of [-1.35, 1.35]) {
    for (const side of [-1, 1]) {
      const hub: V3 = f.p(u, 0.34, side * 0.78);
      torus(kit.cloth.color(0x1c1c1c), hub, f.v(0, 0, 1), 0.24, 0.1, 18, 8);
      prism(kit.metal.color(0xc8c8c4), Frame.of(hub, f.v(1, 0, 0), f.v(0, 0, side)), 0, 0, 0, 0.06, 0.15, 0.15, 14, { smooth: true, top: true });
    }
  }
}

/** Two parcels tied with string on the step, by the door. */
function parcels(kit: Kit, x: number, y: number, z: number): void {
  const p = kit.paint;
  const tie = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    p.color(0xb08a5c);
    box(p, WORLD, x0, y0, z0, x1, y1, z1, ALL);
    p.color(0xece4d0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    box(p, WORLD, x0 - 0.003, y0, mz - 0.01, x1 + 0.003, y1 + 0.003, mz + 0.01, ALL);
    box(p, WORLD, mx - 0.01, y0, z0 - 0.003, mx + 0.01, y1 + 0.003, z1 + 0.003, ALL);
  };
  tie(x - 0.32, y, z - 0.22, x + 0.32, y + 0.34, z + 0.22);
  tie(x - 0.2, y + 0.34, z - 0.15, x + 0.24, y + 0.56, z + 0.15);
}

/** Tram works: a scaffold with plank decks, a striped barrier round it and new rails stacked beside. */
function works(kit: Kit): void {
  const ROAD = PLAZA_Y;
  const [x0, , z0, x1, , z1] = WORKS_SOLID;
  const ax0 = x0 + 0.3;
  const ax1 = x1 - 0.3;
  const az0 = z0 + 0.4;
  const az1 = z1 - 0.4;
  const steel = kit.metal.color(0x8a8f92);
  for (const x of [ax0, ax1]) {
    for (const z of [az0, az1]) tube(steel, [x, ROAD, z], [x, ROAD + 2.2, z], 0.03, 8, true);
  }
  for (const y of [ROAD + 1.1, ROAD + 2.1]) {
    for (const x of [ax0, ax1]) tube(steel, [x, y, az0], [x, y, az1], 0.025, 6, true);
    for (const z of [az0, az1]) tube(steel, [ax0, y, z], [ax1, y, z], 0.025, 6, true);
    const planks = kit.wood.color(0xb89a6e);
    for (let x = ax0; x < ax1 - 0.05; x += 0.26) box(planks, WORLD, x + 0.01, y + 0.03, az0, x + 0.24, y + 0.07, az1, ALL);
  }
  tube(steel, [ax0, ROAD, az0], [ax0, ROAD + 1.1, az1], 0.02, 6, true);
  tube(steel, [ax1, ROAD + 1.1, az0], [ax1, ROAD + 2.1, az1], 0.02, 6, true);
  // Barrier boards, red and white, on trestles round the foot.
  const boards = kit.paint;
  const edges: Array<[V3, V3]> = [
    [[x0, ROAD, z0], [x1, ROAD, z0]],
    [[x1, ROAD, z0], [x1, ROAD, z1]],
    [[x1, ROAD, z1], [x0, ROAD, z1]],
    [[x0, ROAD, z1], [x0, ROAD, z0]],
  ];
  for (const [a, b] of edges) {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const f = Frame.of(a, [(b[0] - a[0]) / length, 0, (b[2] - a[2]) / length]);
    const stripes = Math.round(length / 0.5);
    for (let k = 0; k < stripes; k += 1) {
      boards.color(k % 2 === 0 ? 0xb83a2e : 0xf2ede2);
      box(boards, f, (k * length) / stripes, 0.78, -0.02, ((k + 1) * length) / stripes, 0.98, 0.02, ALL);
    }
    for (const u of [0.15, length - 0.15]) box(kit.wood.color(0x7a5a3e), f, u - 0.03, 0, -0.18, u + 0.03, 0.8, 0.18, ALL);
  }
  // New rails stacked beside, on timber bearers.
  const bearer = kit.wood.color(0x6e5640);
  for (const z of [z0 + 0.5, z1 - 0.5]) box(bearer, WORLD, x1 - 1.0, ROAD, z - 0.08, x1 - 0.2, ROAD + 0.1, z + 0.08, ALL);
  const rail = kit.metal.color(0x6e6a64);
  for (let k = 0; k < 4; k += 1) {
    const x = x1 - 0.9 + k * 0.18;
    box(rail, WORLD, x - 0.035, ROAD + 0.1, z0 + 0.2, x + 0.035, ROAD + 0.22, z1 - 0.2, ALL);
  }
}
