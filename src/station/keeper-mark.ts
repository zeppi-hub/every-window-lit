import type { Frame, PartBuilder } from './facade.js';

/**
 * Marks carved by Keepers before this one (META_VR_FIKIR.md §27, spine A).
 * Each is a few straight strokes in a unit square, x to the right and y up
 * (away from the reader on a flat surface), from -0.5 to 0.5.
 *
 * KEEPER_MARK is the one that matters: a small lamp, its globe, its flame
 * and its stand. The same mark is carved among the old ones on the sill by
 * the latch, and later found on the lamp's glass globe and on the empty
 * frame over the square; every one of them is drawn from this constant
 * with carveMark, so they never differ.
 */
export type Mark = ReadonlyArray<ReadonlyArray<readonly [number, number]>>;

/** The globe as a ring of twelve strokes, then the flame inside, the stem and the stand. */
export const KEEPER_MARK: Mark = [
  Array.from({ length: 13 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [0.3 * Math.cos(a), 0.08 + 0.3 * Math.sin(a)] as const;
  }),
  [
    [-0.07, -0.04],
    [0, 0.2],
    [0.07, -0.04],
  ],
  [
    [0, -0.22],
    [0, -0.36],
  ],
  [
    [-0.24, -0.36],
    [0.24, -0.36],
  ],
];

/** Other Keepers' marks: a tally of five, a boat with its sail, a wave, an arrow up. */
export const OLD_MARKS: readonly Mark[] = [
  [
    [[-0.3, -0.35], [-0.3, 0.35]],
    [[-0.12, -0.35], [-0.12, 0.35]],
    [[0.06, -0.35], [0.06, 0.35]],
    [[0.24, -0.35], [0.24, 0.35]],
    [[-0.42, -0.25], [0.38, 0.25]],
  ],
  [
    [[-0.4, -0.15], [-0.25, -0.35], [0.25, -0.35], [0.4, -0.15], [-0.4, -0.15]],
    [[0, -0.15], [0, 0.42]],
    [[0, 0.42], [0.3, -0.05], [0, -0.05]],
  ],
  [[[-0.42, -0.05], [-0.25, 0.15], [-0.08, -0.15], [0.08, 0.15], [0.25, -0.15], [0.42, 0.05]]],
  [
    [[0, -0.4], [0, 0.38]],
    [[-0.22, 0.14], [0, 0.38], [0.22, 0.14]],
  ],
];

/**
 * Carves `mark` into a surface: each stroke becomes thin quads lying in
 * the frame's x-z plane (the frame's up is the surface's outward normal),
 * `size` metres across, strokes `width` wide, facing up. The mark's y runs
 * along the frame's -z (away from a reader at +z).
 */
export function carveMark(b: PartBuilder, f: Frame, mark: Mark, size: number, width: number): void {
  const normal = f.v(0, 1, 0);
  const h = width / 2;
  for (const stroke of mark) {
    for (let i = 0; i + 1 < stroke.length; i += 1) {
      const [u0, v0] = stroke[i];
      const [u1, v1] = stroke[i + 1];
      const x0 = u0 * size;
      const z0 = -v0 * size;
      const x1 = u1 * size;
      const z1 = -v1 * size;
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 1e-6) continue;
      // Square to the stroke, and a little past each end so joints close.
      const nx = (-(z1 - z0) / length) * h;
      const nz = ((x1 - x0) / length) * h;
      const ex = ((x1 - x0) / length) * h * 0.8;
      const ez = ((z1 - z0) / length) * h * 0.8;
      b.quadToward(
        f.p(x0 - ex + nx, 0, z0 - ez + nz),
        f.p(x1 + ex + nx, 0, z1 + ez + nz),
        f.p(x1 + ex - nx, 0, z1 + ez - nz),
        f.p(x0 - ex - nx, 0, z0 - ez - nz),
        normal,
      );
    }
  }
}
