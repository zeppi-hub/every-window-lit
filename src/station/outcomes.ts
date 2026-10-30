import { Group } from '@iwsdk/core';
import { ALL, box, createKit, Frame, type Kit, type PartBuilder, prism, torus, tube, type V3, WORLD } from './facade.js';
import { type Box, PLAZA_Y } from './layout.js';
import { plain, scanned } from './materials.js';
import { KERB } from './streetscape.js';
import { ROW_FRONT, ROW_WALK } from './town.js';

/**
 * Two things the Keeper's choices bring to the square, in front of the
 * window (from the seat the coast road hides behind the row's first
 * building and the window's jamb):
 *
 * - help: a parcel on the step of Tessa's building, from the evening it
 *   arrives (OUTCOME_DAY in systems/outcomes.ts), in any kind of week;
 * - the tram plan: works on the square for the new line, a scaffold, a
 *   striped barrier and new rails stacked beside it, the tram's first
 *   stage (BuildSystem).
 *
 * Easing shows in the town's own reading (reactions.ts). Plain period
 * shapes with no badges, plates or lettering.
 */

/**
 * The works on the square, left of the fountain and half a metre clear of
 * the pigeons' nearest flock; the Keeper cannot walk through them while
 * they are there.
 */
export const WORKS_SOLID: Box = [-13.4, PLAZA_Y - 1, -19.2, -10.2, PLAZA_Y + 3, -15.6];
export interface OutcomeParts {
  group: Group;
}

/** `door` is the x of the door of Tessa's building, on the row's sidewalk. */
export function createOutcomes(door: number): OutcomeParts {
  const group = new Group();
  group.name = 'Outcomes';
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
