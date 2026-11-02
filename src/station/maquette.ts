import { Group, type Mesh } from '@iwsdk/core';
import { box, PartBuilder, prism, WORLD } from './facade.js';
import { SILL } from './layout.js';
import { glowing, plain } from './materials.js';

/**
 * A small model of the square on the sill (META_VR_DINAMIKLER.md item 10):
 * the row across the far side, the fountain, the tower at the near edge,
 * laid out as the Keeper sees them. Touching Tessa's little house brings
 * their window over (the same as reaching across the square for it), for
 * anyone who finds the far pinch hard; in the first week it is the way
 * (Devir 1b item 9). It stands on a wooden block, left of the latch and
 * just in front of the Sunday arrows, so the house is within 30 degrees of
 * straight ahead and 35 down from the seat (on the stone it would be 39
 * down); the low line hangs right of it (tests/line-places.test.mjs).
 */
export const MAQUETTE_STAND = 0.075;
export const MAQUETTE = { x: -0.235, y: SILL.top + MAQUETTE_STAND, z: -0.4 } as const;
const W = 0.2;
const D = 0.1;
/** The row's houses: width, height, colour; Tessa's is the third. */
const HOUSES: ReadonlyArray<readonly [number, number, number]> = [
  [0.034, 0.05, 0x9b5a45],
  [0.03, 0.036, 0x8c503d],
  [0.03, 0.042, 0xe2d2ae],
  [0.036, 0.07, 0xc9a37b],
  [0.032, 0.046, 0xd8c299],
];
export const TESSA_HOUSE = 2;

export function createMaquette(): { group: Group; house: Mesh } {
  const group = new Group();
  group.name = 'Maquette';
  group.position.set(MAQUETTE.x, MAQUETTE.y, MAQUETTE.z);
  const b = new PartBuilder();
  b.round = 0.002;
  // The wooden block it stands on, a little inside the base.
  b.color(0x6e4c34);
  box(b, WORLD, -W / 2 + 0.006, -MAQUETTE_STAND, -D / 2 + 0.006, W / 2 - 0.006, 0, D / 2 - 0.006);
  // A cast-stone base with the square's paving and the kerb.
  b.color(0xcfc6b4);
  box(b, WORLD, -W / 2, 0, -D / 2, W / 2, 0.006, D / 2);
  b.color(0xe2dccd);
  box(b, WORLD, -W / 2 + 0.006, 0.006, -D / 2 + 0.022, W / 2 - 0.006, 0.0075, D / 2 - 0.006);
  // The fountain and the tower at the near edge.
  b.color(0x6f8f9a);
  prism(b, WORLD.at(0.02, 0.0075, 0.01), 0, 0, 0, 0.004, 0.009, 0.009, 10, { top: true });
  b.color(0xd9cdb5);
  box(b, WORLD, -0.012, 0.006, D / 2 - 0.012, 0.012, 0.05, D / 2 - 0.002);
  let x = -W / 2 + 0.008;
  let tessa: [number, number, number, number] = [0, 0, 0, 0];
  HOUSES.forEach(([w, h, colour], i) => {
    if (i === TESSA_HOUSE) tessa = [x, w, h, colour];
    else {
      b.color(colour);
      box(b, WORLD, x, 0.006, -D / 2 + 0.002, x + w, 0.006 + h, -D / 2 + 0.02);
    }
    x += w + 0.004;
  });
  group.add(b.mesh(plain(0.85, 0, true), 'MaquetteBase'));
  // Tessa's house on its own, so it can glow and be touched.
  const [hx, hw, hh, hc] = tessa;
  const t = new PartBuilder();
  t.round = 0.0015;
  t.color(hc);
  box(t, WORLD, hx, 0.006, -D / 2 + 0.002, hx + hw, 0.006 + hh, -D / 2 + 0.02);
  // Its lit window, toward the Keeper.
  t.color(0xffcf7a);
  box(t, WORLD, hx + hw * 0.3, 0.006 + hh * 0.5, -D / 2 + 0.0202, hx + hw * 0.7, 0.006 + hh * 0.72, -D / 2 + 0.021);
  // An entity of its own at the model's place (not a child, so the touch keeps its own transform).
  const house = t.mesh(glowing(0.8), 'MaquetteHouse');
  house.position.set(MAQUETTE.x, MAQUETTE.y, MAQUETTE.z);
  return { group, house };
}
