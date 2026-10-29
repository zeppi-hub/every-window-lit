import { type Mesh } from '@iwsdk/core';
import { box, Frame, PartBuilder, prism, tube, WORLD } from './facade.js';
import { SILL } from './layout.js';
import { glowing, plain } from './materials.js';

/**
 * The week's slider: a brass sun that runs on a rod along the sill's near
 * edge, between the latch and the tower key, with seven notches for the
 * evenings from Monday to Sunday. Within about 50 cm of the seated eye.
 */
export const SUN_RAIL = { x0: -0.02, x1: 0.28, y: SILL.top + 0.012, z: -0.18 } as const;
/** Height of the sun's centre above the rod. */
const SUN_LIFT = 0.04;

const BRASS = 0xc9a349;
const BRASS_DARK = 0xa8873a;

export interface SunParts {
  rail: Mesh;
  sun: Mesh;
}

export function createSun(): SunParts {
  const r = new PartBuilder();
  r.color(BRASS_DARK);
  const { x0, x1, y, z } = SUN_RAIL;
  tube(r, [x0 - 0.02, y, z], [x1 + 0.02, y, z], 0.005, 8, true);
  for (const x of [x0 - 0.025, x1 + 0.025]) box(r, WORLD, x - 0.006, SILL.top, z - 0.012, x + 0.006, y + 0.008, z + 0.012);
  for (let k = 0; k < 7; k += 1) {
    const x = x0 + ((x1 - x0) * k) / 6;
    box(r, WORLD, x - 0.002, SILL.top, z - 0.016, x + 0.002, SILL.top + 0.003, z - 0.008);
  }
  const rail = r.mesh(plain(0.35, 0.9, true), 'SunRail');

  // The sun stands upright on a sleeve round the rod, its face to the Keeper.
  const s = new PartBuilder();
  s.color(BRASS);
  tube(s, [-0.012, 0, 0], [0.012, 0, 0], 0.008, 8, true);
  tube(s, [0, 0.006, 0], [0, SUN_LIFT - 0.02, 0], 0.004, 6);
  prism(s, Frame.of([0, SUN_LIFT, -0.004], [1, 0, 0], [0, 0, 1]), 0, 0, 0, 0.008, 0.02, 0.02, 18, { smooth: true, top: true });
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const inner = 0.022;
    const outer = k % 2 === 0 ? 0.036 : 0.03;
    tube(s, [inner * Math.cos(a), SUN_LIFT + inner * Math.sin(a), 0], [outer * Math.cos(a), SUN_LIFT + outer * Math.sin(a), 0], 0.003, 5, true);
  }
  const sun = s.mesh(glowing(0.3, 0.9), 'SunKnob');
  sun.position.set(x0, y, z);
  return { rail, sun };
}
