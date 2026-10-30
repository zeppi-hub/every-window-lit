import type { Mesh } from '@iwsdk/core';
import type { Kind } from '../season/model.js';
import { box, PartBuilder, prism, torus, tube, tubePath, type V3, WORLD } from './facade.js';
import { glowing } from './materials.js';

/**
 * The Keeper's three options for each kind of week, by their place on the
 * sill: ease the price (left), help the family (middle), build something
 * that lasts (right).
 *
 * - Fuel: the harbour master's brass key, Tessa's clinic badge, a tram plan.
 * - Power: a porcelain line insulator, the baker's loaf, a turbine blade model.
 * - Food: a brass market weight, the school cook's lunch tin, a bag of seed.
 *
 * Each is built with its base on y = 0 around its own centre; ChoiceSystem
 * swaps the sill's three objects to the week's kind. None is thinner than
 * about 2.5 cm, so a fingertip finds it, and none carries lettering.
 */
export function createOptions(): Record<Kind, Mesh[]> {
  return {
    fuel: [brassKey(), clinicBadge(), tramPlan()],
    power: [insulator(), loaf(), turbineBlade()],
    food: [marketWeight(), lunchTin(), seedBag()],
  };
}

/** The names the sill's three objects keep, whatever the week. */
export const OPTION_NAMES = ['ChoiceEase', 'ChoiceHelp', 'ChoiceBuild'] as const;

const BRASS = 0xc9a349;

function option(b: PartBuilder, roughness: number, metalness: number, index: number, yaw: number): Mesh {
  const mesh = b.mesh(glowing(roughness, metalness), OPTION_NAMES[index]);
  mesh.rotation.y = yaw;
  return mesh;
}

/** The harbour master's brass key: a ring bow, a long shank and a two-step bit. */
function brassKey(): Mesh {
  const b = new PartBuilder();
  b.color(BRASS);
  const y = 0.006;
  torus(b, [0.045, y, 0], [0, 1, 0], 0.024, 0.006, 20, 6);
  tube(b, [0.021, y, 0], [-0.07, y, 0], 0.0055, 8, true);
  box(b, WORLD, -0.07, y - 0.004, 0, -0.054, y + 0.004, 0.022);
  box(b, WORLD, -0.048, y - 0.004, 0, -0.038, y + 0.004, 0.015);
  return option(b, 0.3, 0.9, 0, -0.2);
}

/** Tessa's clinic badge: a white enamel disc in a teal ring on a steel clip, no lettering. */
function clinicBadge(): Mesh {
  const b = new PartBuilder();
  b.color(0xdfe4e2);
  prism(b, WORLD, 0, 0, 0, 0.012, 0.04, 0.04, 24, { smooth: true, top: true });
  b.color(0xf4f1ea);
  prism(b, WORLD, 0, 0, 0, 0.014, 0.032, 0.032, 24, { smooth: true, top: true });
  b.color(0x2f7f7a);
  torus(b, [0, 0.0145, 0], [0, 1, 0], 0.024, 0.003, 24, 5);
  b.color(0xa8aca8);
  box(b, WORLD, -0.006, 0.002, 0.035, 0.006, 0.006, 0.06);
  return option(b, 0.4, 0.3, 1, 0.15);
}

/** A rolled tram plan tied with a red ribbon. */
function tramPlan(): Mesh {
  const b = new PartBuilder();
  b.color(0xeee4cc);
  tube(b, [-0.08, 0.024, 0], [0.08, 0.024, 0], 0.022, 14, true);
  b.color(0xd9cba9);
  torus(b, [-0.08, 0.024, 0], [1, 0, 0], 0.014, 0.004, 14, 4);
  b.color(0x8a2a24);
  torus(b, [0.012, 0.024, 0], [1, 0, 0], 0.0235, 0.004, 16, 4);
  return option(b, 0.85, 0, 2, Math.PI / 2);
}

/** A glazed porcelain insulator off a power pole: three skirts on a domed crown, on its iron pin. */
function insulator(): Mesh {
  const b = new PartBuilder();
  b.color(0x4a4744);
  prism(b, WORLD, 0, 0, 0, 0.006, 0.012, 0.01, 12, { smooth: true, top: true, bottom: true });
  b.color(0xf1ede4);
  const skirts: ReadonlyArray<[number, number, number]> = [
    // y of the skirt's rim, its rim radius, its root radius
    [0.006, 0.033, 0.02],
    [0.026, 0.028, 0.017],
    [0.043, 0.023, 0.015],
  ];
  for (const [y, rim, root] of skirts) {
    prism(b, WORLD, 0, 0, y, y + 0.004, rim, rim, 20, { smooth: true, bottom: true });
    prism(b, WORLD, 0, 0, y + 0.004, y + 0.014, rim, root, 20, { smooth: true });
    prism(b, WORLD, 0, 0, y + 0.014, y + 0.02, root, root * 0.92, 20, { smooth: true });
  }
  prism(b, WORLD, 0, 0, 0.063, 0.071, 0.014, 0.0145, 20, { smooth: true });
  prism(b, WORLD, 0, 0, 0.071, 0.077, 0.0145, 0.0, 20, { smooth: true });
  // The groove the line is tied into.
  b.color(0xd8d2c6);
  torus(b, [0, 0.066, 0], [0, 1, 0], 0.0142, 0.0022, 20, 4);
  return option(b, 0.18, 0, 0, 0);
}

/** The baker's round loaf: a domed crust, floured on top, with a slashed cross. */
function loaf(): Mesh {
  const b = new PartBuilder();
  const rings: ReadonlyArray<[number, number]> = [
    // height, radius
    [0.0, 0.052],
    [0.01, 0.06],
    [0.026, 0.059],
    [0.04, 0.05],
    [0.05, 0.035],
    [0.055, 0.018],
    [0.057, 0.0],
  ];
  for (let i = 0; i + 1 < rings.length; i += 1) {
    b.color(i < 3 ? 0xa4652f : 0xc58a4e);
    const [y0, r0] = rings[i];
    const [y1, r1] = rings[i + 1];
    prism(b, WORLD, 0, 0, y0, y1, r0, r1, 22, { smooth: true, bottom: i === 0 });
  }
  // Two pale slashes across the top, following the dome.
  b.color(0xe6cf9f);
  for (const [dx, dz] of [
    [1, 0],
    [0, 1],
  ] as const) {
    const path: V3[] = [];
    for (let k = -3; k <= 3; k += 1) {
      const s = (k / 3) * 0.034;
      const r = Math.abs(s);
      const y = r < 0.018 ? 0.0566 - r * 0.12 : 0.0545 - (r - 0.018) * 0.42;
      path.push([dx * s, y + 0.0015, dz * s]);
    }
    tubePath(b, path, 0.0028, 5);
  }
  return option(b, 0.9, 0, 1, 0.3);
}

/** A white scale model of a wind turbine blade, root to tip, resting on a small wooden cradle. */
function turbineBlade(): Mesh {
  const b = new PartBuilder();
  b.color(0x8b6a48);
  // Each cradle rises to the blade's underside where it rests.
  box(b, WORLD, -0.06, 0, -0.022, -0.045, 0.017, 0.022);
  box(b, WORLD, 0.035, 0, -0.018, 0.05, 0.021, 0.018);
  b.color(0xf0f0ec);
  const y = 0.026;
  // The round root with its bolt ring, then a blade that thins and narrows to the tip.
  tube(b, [-0.09, y, 0], [-0.065, y, 0], 0.012, 14, true);
  b.color(0xb9bcbc);
  torus(b, [-0.088, y, 0], [1, 0, 0], 0.012, 0.0016, 14, 4);
  b.color(0xf0f0ec);
  const sections: ReadonlyArray<[number, number, number]> = [
    // x, chord (z), thickness (y)
    [-0.065, 0.024, 0.02],
    [-0.04, 0.034, 0.016],
    [0.0, 0.03, 0.012],
    [0.04, 0.022, 0.009],
    [0.075, 0.014, 0.007],
  ];
  for (let i = 0; i + 1 < sections.length; i += 1) {
    const [x0, c0, t0] = sections[i];
    const [x1, c1, t1] = sections[i + 1];
    const c = (c0 + c1) / 2;
    const t = (t0 + t1) / 2;
    box(b, WORLD, x0, y - t / 2, -c / 2, x1, y + t / 2, c / 2);
  }
  b.color(0xc7cbcb);
  box(b, WORLD, 0.075, y - 0.0035, -0.007, 0.09, y + 0.0035, 0.007);
  return option(b, 0.35, 0.05, 2, Math.PI / 2);
}

/** A brass market weight: a waisted cylinder with a turned knob. */
function marketWeight(): Mesh {
  const b = new PartBuilder();
  b.color(BRASS);
  prism(b, WORLD, 0, 0, 0, 0.004, 0.024, 0.026, 20, { smooth: true, bottom: true });
  prism(b, WORLD, 0, 0, 0.004, 0.03, 0.026, 0.024, 20, { smooth: true });
  prism(b, WORLD, 0, 0, 0.03, 0.035, 0.024, 0.019, 20, { smooth: true, top: true });
  prism(b, WORLD, 0, 0, 0.035, 0.043, 0.008, 0.007, 14, { smooth: true });
  prism(b, WORLD, 0, 0, 0.043, 0.05, 0.007, 0.013, 14, { smooth: true });
  prism(b, WORLD, 0, 0, 0.05, 0.056, 0.013, 0.0, 14, { smooth: true });
  b.color(0x9c7c33);
  torus(b, [0, 0.017, 0], [0, 1, 0], 0.0258, 0.0018, 20, 4);
  return option(b, 0.3, 0.9, 0, 0);
}

/** The school cook's lunch tin: red enamel with a cream lid band and a wire handle. */
function lunchTin(): Mesh {
  const b = new PartBuilder();
  b.color(0xa8483a);
  box(b, WORLD, -0.055, 0, -0.035, 0.055, 0.046, 0.035);
  b.color(0xebe1c9);
  box(b, WORLD, -0.057, 0.046, -0.037, 0.057, 0.058, 0.037);
  b.color(0x9a9c9a);
  tubePath(
    b,
    [
      [-0.04, 0.058, 0],
      [-0.034, 0.078, 0],
      [-0.016, 0.088, 0],
      [0.016, 0.088, 0],
      [0.034, 0.078, 0],
      [0.04, 0.058, 0],
    ],
    0.0022,
    6,
  );
  return option(b, 0.45, 0.4, 1, -0.12);
}

/** A small cloth bag of seed, gathered at the neck and tied with red string. */
function seedBag(): Mesh {
  const b = new PartBuilder();
  b.color(0xcdb98e);
  prism(b, WORLD, 0, 0, 0, 0.006, 0.03, 0.036, 16, { smooth: true, bottom: true });
  prism(b, WORLD, 0, 0, 0.006, 0.034, 0.036, 0.033, 16, { smooth: true });
  prism(b, WORLD, 0, 0, 0.034, 0.05, 0.033, 0.012, 16, { smooth: true });
  prism(b, WORLD, 0, 0, 0.05, 0.058, 0.012, 0.02, 16, { smooth: true });
  prism(b, WORLD, 0, 0, 0.058, 0.064, 0.02, 0.012, 16, { smooth: true, top: true });
  b.color(0x8a2a24);
  torus(b, [0, 0.051, 0], [0, 1, 0], 0.0128, 0.0022, 16, 4);
  return option(b, 0.95, 0, 2, 0.4);
}
