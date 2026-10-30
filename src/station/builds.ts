import { Group, type Material, type Mesh, type Object3D } from '@iwsdk/core';
import type { Kind } from '../season/model.js';
import { ALL, blob, box, createKit, Frame, type Kit, type PartBuilder, prism, torus, tube, tubePath, type V3, WORLD } from './facade.js';
import { type Box, PLAZA_Y } from './layout.js';
import { plain, scanned } from './materials.js';
import { KERB } from './streetscape.js';
import { ROW_FRONT } from './town.js';

/**
 * What the Keeper's builds become, each in two stages (season/model.ts):
 * scaffolding from the week after it was chosen, working three weeks after.
 *
 * - Fuel, the tram: works on the square (OutcomeWorks in outcomes.ts), then
 *   rails across the left of the square under a wire, a stop with a
 *   shelter, and a tram standing at it.
 * - Power, roof turbines: three masts in scaffolding on the Ankara block's
 *   flat roof (left of the row), then three small turbines turning.
 * - Food, a roof garden: a timber greenhouse frame and empty planters on
 *   Tessa's building, then glass, green beds and vines over the cornice.
 *
 * Seen from the seat: the square lies about 9 m below the eye, the roofs
 * some 8 m above it, so on the roofs only what rises above the parapet
 * line, or hangs over it, can be seen. No lettering, numbers or badges.
 */

/** The tram's line: along the square in front of the row, from the square's kerb by the coast road to a stop left of the fountain. */
const LINE_Z = -21;
const LINE_X0 = -21.1;
const LINE_X1 = -0.8;
const TRAM_X = -10;
/** The shelter at the stop, just past the tram's front and clear of the bicycle rack. */
const SHELTER = { x0: -5.8, x1: -3.4, z0: -19.8, z1: -18.8 } as const;
export const TRAM_SOLIDS: readonly Box[] = [
  [TRAM_X - 5.2, PLAZA_Y - 1, LINE_Z - 1.3, TRAM_X + 5.2, PLAZA_Y + 3.4, LINE_Z + 1.3],
  [SHELTER.x0 - 0.1, PLAZA_Y - 1, SHELTER.z0 - 0.1, SHELTER.x1 + 0.1, PLAZA_Y + 2.6, SHELTER.z1 + 0.1],
  // The buffer stop at the end of the line.
  [LINE_X1 - 0.2, PLAZA_Y - 1, LINE_Z - 1.05, LINE_X1 + 0.25, PLAZA_Y + 1.0, LINE_Z + 1.05],
];

/** The Ankara block's roof slab, left end of the row, and Tessa's Liberty building's roof. */
/** The row stands on the sidewalk's kerb height. */
const ANKARA_ROOF = { x0: -21, x1: -14, y: PLAZA_Y + KERB + 17.9 } as const;
const LIBERTY_ROOF = { x0: -4, x1: 2.6, y: PLAZA_Y + KERB + 17.85 } as const;
/** Masts 2.4 m apart and 2 m rotors, so the turning discs never meet. */
const TURBINE_X: readonly number[] = [-19.9, -17.5, -15.1];
const TURBINE_Z = ROW_FRONT - 4.5;
const MAST = 3.4;
const ROTOR = 1.0;

export interface BuildParts {
  group: Group;
  /** Shown per kind and stage by BuildSystem; the tram's scaffold stage is OutcomeWorks. */
  stages: Record<Kind, { scaffold: Object3D | null; working: Object3D }>;
  /** The three turbine rotors, each turning about its own hub. */
  rotors: Object3D[];
}

export function createBuilds(): BuildParts {
  const group = new Group();
  group.name = 'Builds';
  const tram = part('BuildTram', (kit) => tramLine(kit));
  const masts = part('BuildMasts', (kit) => turbineMasts(kit, true));
  const turbines = part('BuildTurbines', (kit) => turbineMasts(kit, false));
  const rotors = TURBINE_X.map((x, i) => {
    const rotor = part(`TurbineRotor${i}`, (kit) => rotorBlades(kit));
    rotor.position.set(x, ANKARA_ROOF.y + MAST + 0.2, TURBINE_Z + 0.42);
    rotor.rotation.z = i * 0.7;
    turbines.add(rotor);
    return rotor;
  });
  const frame = part('BuildGardenFrame', (kit) => garden(kit, false));
  const green = part('BuildGarden', (kit) => garden(kit, true));
  for (const g of [tram, masts, turbines, frame, green]) {
    g.visible = false;
    group.add(g);
  }
  return {
    group,
    stages: {
      fuel: { scaffold: null, working: tram },
      power: { scaffold: masts, working: turbines },
      food: { scaffold: frame, working: green },
    },
    rotors,
  };
}

function part(name: string, build: (kit: Kit) => void): Group {
  const kit = createKit();
  build(kit);
  const g = new Group();
  g.name = name;
  const parts: Array<[PartBuilder, Material]> = [
    [kit.paint, plain(0.5, 0.05)],
    [kit.metal, plain(0.35, 0.85)],
    [kit.glass, plain(0.08)],
    [kit.wood, scanned('wood_shutter')],
    [kit.cloth, plain(0.85)],
    [kit.stone, plain(0.9)],
  ];
  parts.forEach(([builder, material], index) => {
    if (builder.triangles > 0) g.add(builder.mesh(material, `${name}${index}`) as Mesh);
  });
  return g;
}

/** Rails set in granite setts along the square, a wire on two poles above, a shelter at the stop and the tram itself. */
function tramLine(kit: Kit): void {
  const y = PLAZA_Y;
  const gauge = 1.435;
  for (const dz of [-gauge / 2, gauge / 2]) {
    box(kit.stone.color(0x6f6c68), WORLD, LINE_X0, y - 0.1, LINE_Z + dz - 0.26, LINE_X1, y + 0.008, LINE_Z + dz + 0.26, ALL);
    box(kit.metal.color(0x9a948c), WORLD, LINE_X0, y + 0.008, LINE_Z + dz - 0.035, LINE_X1, y + 0.03, LINE_Z + dz + 0.035, ALL);
  }
  // A buffer stop at the end of the line.
  box(kit.paint.color(0x2f3a35), WORLD, LINE_X1 - 0.1, y, LINE_Z - 0.95, LINE_X1 + 0.15, y + 0.9, LINE_Z + 0.95, ALL);
  box(kit.paint.color(0xb83a2e), WORLD, LINE_X1 - 0.16, y + 0.55, LINE_Z - 0.85, LINE_X1 - 0.1, y + 0.8, LINE_Z + 0.85, ALL);
  // Two iron poles on the square side carry the wire over the line; the left one stands clear of the newsstand.
  const iron = kit.metal.color(0x24302a);
  for (const x of [-16, -3]) {
    tube(iron, [x, y, LINE_Z + 1.9], [x, y + 6.0, LINE_Z + 1.9], 0.09, 10, true);
    tube(iron, [x, y + 5.8, LINE_Z + 1.9], [x, y + 5.8, LINE_Z - 0.2], 0.04, 6, true);
  }
  tube(iron, [-16, y + 5.55, LINE_Z], [LINE_X1 - 0.3, y + 5.55, LINE_Z], 0.012, 4);
  // The stop: a slim iron shelter with a glass roof, by the bicycle rack, its roof clear of the tram's side.
  const { x0: sx0, x1: sx1, z0: sz0, z1: sz1 } = SHELTER;
  const back = sz1 - 0.2;
  for (const x of [sx0 + 0.1, sx1 - 0.1]) tube(iron, [x, y, back], [x, y + 2.45, back], 0.045, 8, true);
  box(kit.glass.color(0x9fb3b6), WORLD, sx0, y + 2.45, sz0, sx1, y + 2.5, sz1, ALL);
  box(iron, WORLD, sx0, y + 2.42, back - 0.05, sx1, y + 2.47, back + 0.05, ALL);
  // A bench between the two posts.
  box(kit.wood.color(0x8a6a48), WORLD, sx0 + 0.1, y + 0.45, back - 0.15, sx1 - 0.1, y + 0.5, back + 0.15, ALL);
  tram(kit, Frame.of([TRAM_X, y, LINE_Z], [1, 0, 0]));
}

/** A two-tone interwar tram, 10 m long, with a window band, a clerestory roof and its trolley pole on the wire. */
function tram(kit: Kit, f: Frame): void {
  const p = kit.paint;
  const L = 5;
  const W = 1.15;
  const round = p.round;
  p.round = 0.08;
  p.color(0x2f5a46);
  box(p, f, -L, 0.45, -W, L, 1.55, W, ALL);
  p.color(0xece2c8);
  box(p, f, -L, 2.45, -W, L, 2.8, W, ALL);
  p.round = 0.18;
  p.color(0x8f9192);
  box(p, f, -L + 0.2, 2.8, -W + 0.05, L - 0.2, 3.02, W - 0.05, ALL);
  p.round = 0.05;
  box(p, f, -L + 1.4, 3.02, -0.5, L - 1.4, 3.22, 0.5, ALL);
  p.round = round;
  // Window band: dark glass between cream pillars, both sides and both ends.
  const g = kit.glass.color(0x1d272b);
  box(g, f, -L + 0.05, 1.55, -W + 0.02, L - 0.05, 2.45, W - 0.02, ALL);
  p.color(0xece2c8);
  for (let k = 0; k <= 8; k += 1) {
    const u = -L + 0.1 + (k * (2 * L - 0.2)) / 8;
    for (const side of [-1, 1]) box(p, f, u - 0.07, 1.55, side * W - 0.03, u + 0.07, 2.45, side * W + 0.03, ALL);
  }
  // Running gear and fenders in shadow under the body.
  const dark = kit.metal.color(0x2a2a28);
  box(dark, f, -L + 0.6, 0.12, -W + 0.15, L - 0.6, 0.45, W - 0.15, ALL);
  for (const u of [-L + 1.6, L - 1.6]) {
    for (const side of [-1, 1]) torus(dark, f.p(u, 0.42, side * 0.72), f.v(0, 0, 1), 0.3, 0.07, 14, 5);
  }
  box(kit.metal.color(0xb8b4ac), f, -L - 0.12, 0.5, -0.9, -L, 0.68, 0.9, ALL);
  box(kit.metal.color(0xb8b4ac), f, L, 0.5, -0.9, L + 0.12, 0.68, 0.9, ALL);
  // Head lamps, and the trolley pole up to the wire.
  kit.glass.color(0xf6efd8);
  prism(kit.glass, Frame.of(f.p(L - 0.01, 1.1, 0), f.v(0, 0, 1), f.v(1, 0, 0)), 0, 0, 0, 0.05, 0.11, 0.11, 12, { smooth: true, top: true });
  tube(kit.metal.color(0x24302a), f.p(-1.5, 3.22, 0), f.p(1.6, 5.55, 0), 0.03, 6, true);
}

/** Three masts on the Ankara block's roof: in scaffolding with planks, or finished with a nacelle under each rotor. */
function turbineMasts(kit: Kit, scaffold: boolean): void {
  const y = ANKARA_ROOF.y;
  const steel = kit.metal.color(scaffold ? 0x8a8f92 : 0xe8e6e0);
  for (const x of TURBINE_X) {
    tube(steel, [x, y, TURBINE_Z], [x, y + MAST, TURBINE_Z], 0.1, 10, true);
    box(kit.stone.color(0xb9b4ab), WORLD, x - 0.5, y, TURBINE_Z - 0.5, x + 0.5, y + 0.25, TURBINE_Z + 0.5, ALL);
    if (scaffold) {
      const s = kit.metal.color(0x8a8f92);
      for (const [dx, dz] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ] as const) {
        tube(s, [x + dx, y, TURBINE_Z + dz], [x + dx, y + MAST - 0.6, TURBINE_Z + dz], 0.025, 6, true);
      }
      for (const h of [1.2, 2.4]) {
        box(kit.wood.color(0xb89a6e), WORLD, x - 0.55, y + h, TURBINE_Z - 0.55, x + 0.55, y + h + 0.05, TURBINE_Z + 0.55, ALL);
        tube(s, [x - 0.5, y + h - 1.1, TURBINE_Z + 0.5], [x + 0.5, y + h, TURBINE_Z + 0.5], 0.018, 5, true);
      }
    } else {
      const n = kit.paint.color(0xf2f0ea);
      box(n, WORLD, x - 0.16, y + MAST - 0.05, TURBINE_Z - 0.35, x + 0.16, y + MAST + 0.38, TURBINE_Z + 0.35, ALL);
      prism(n, Frame.of([x, y + MAST + 0.2, TURBINE_Z + 0.35], [1, 0, 0], [0, 0, 1]), 0, 0, 0, 0.12, 0.14, 0.04, 12, { smooth: true, top: true });
    }
  }
}

/** One rotor of three blades about its own hub, at the origin, facing +z (the square). */
function rotorBlades(kit: Kit): void {
  const n = kit.paint.color(0xf2f0ea);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2;
    const dir: V3 = [Math.cos(a), Math.sin(a), 0];
    // Local y toward the square (+z): the blade's thickness; local z across it, its chord.
    const f = Frame.of([0, 0, 0], dir, [0, 0, 1]);
    box(n, f, 0.1, -0.012, -0.03, ROTOR * 0.45, 0.012, 0.11, ALL);
    box(n, f, ROTOR * 0.45, -0.009, -0.02, ROTOR, 0.009, 0.08, ALL);
  }
  prism(n, Frame.of([0, 0, -0.05], [1, 0, 0], [0, 0, 1]), 0, 0, 0, 0.1, 0.09, 0.02, 10, { smooth: true, top: true });
}

/**
 * On Tessa's roof: planters along the front and a greenhouse behind them;
 * bare timber and soil first, then green and glass. From the seat the line
 * of sight clears the cornice about a metre above the roof, so once it
 * works the planting stands well above that (small trees on canes) and
 * vines climb over the cornice and hang down the front.
 */
function garden(kit: Kit, green: boolean): void {
  const y = LIBERTY_ROOF.y;
  const z0 = ROW_FRONT - 0.9;
  const planter = kit.wood.color(0x7a5a3e);
  for (let x = LIBERTY_ROOF.x0 + 0.5; x < LIBERTY_ROOF.x1 - 0.9; x += 1.3) {
    box(planter, WORLD, x, y, z0 - 0.35, x + 1.1, y + 0.55, z0 + 0.2, ALL);
    // Canes for the young trees, there from the start.
    tube(kit.wood.color(0x9a7a52), [x + 0.55, y + 0.5, z0 - 0.08], [x + 0.55, y + 1.9, z0 - 0.08], 0.018, 5, true);
    if (green) {
      for (let k = 0; k < 3; k += 1) blob(kit.cloth.color(k % 2 === 0 ? 0x4f7a3a : 0x6a8f45), [x + 0.2 + k * 0.35, y + 0.78, z0 - 0.08], 0.3, 0.9);
      blob(kit.cloth.color(0x5a8540), [x + 0.55, y + 1.75, z0 - 0.08], 0.48, 0.85);
      blob(kit.cloth.color(0x4a7236), [x + 0.4, y + 1.45, z0 - 0.05], 0.36, 0.85);
      // A vine up out of the planter, forward over the cornice and down the face.
      tubePath(
        kit.cloth.color(0x557d3c),
        [
          [x + 0.9, y + 0.5, z0 + 0.15],
          [x + 0.92, y + 0.75, ROW_FRONT + 0.2],
          [x + 0.95, y + 0.55, ROW_FRONT + 1.0],
          [x + 0.98, y - 0.6, ROW_FRONT + 1.05],
          [x + 1.0, y - 1.5, ROW_FRONT + 0.95],
        ],
        0.06,
        5,
      );
    }
  }
  // The greenhouse: a timber frame on the roof's middle, glazed once working.
  const gx0 = LIBERTY_ROOF.x0 + 1.4;
  const gx1 = LIBERTY_ROOF.x1 - 1.4;
  const gz0 = ROW_FRONT - 5.2;
  const gz1 = ROW_FRONT - 2.6;
  const wall = 1.9;
  const ridge = 2.8;
  const t = kit.wood.color(0xc9a678);
  for (const x of [gx0, (gx0 + gx1) / 2, gx1]) {
    for (const z of [gz0, gz1]) box(t, WORLD, x - 0.05, y, z - 0.05, x + 0.05, y + wall, z + 0.05, ALL);
    tube(t, [x, y + wall, gz0], [x, y + ridge, (gz0 + gz1) / 2], 0.04, 4, true);
    tube(t, [x, y + wall, gz1], [x, y + ridge, (gz0 + gz1) / 2], 0.04, 4, true);
  }
  tube(t, [gx0, y + ridge, (gz0 + gz1) / 2], [gx1, y + ridge, (gz0 + gz1) / 2], 0.05, 4, true);
  if (green) {
    const glass = kit.glass.color(0xb9d0cc);
    box(glass, WORLD, gx0, y + 0.05, gz1 - 0.02, gx1, y + wall, gz1 + 0.02, ALL);
    const mid = (gz0 + gz1) / 2;
    glass.quadToward([gx0, y + wall, gz1], [gx1, y + wall, gz1], [gx1, y + ridge, mid], [gx0, y + ridge, mid], [0, 0.8, 1]);
    glass.quadToward([gx0, y + wall, gz0], [gx1, y + wall, gz0], [gx1, y + ridge, mid], [gx0, y + ridge, mid], [0, 0.8, -1]);
  } else {
    // Planks stacked for the job.
    for (let k = 0; k < 4; k += 1) box(t, WORLD, gx0 + 0.2, y + k * 0.06, gz1 + 0.4, gx0 + 2.4, y + k * 0.06 + 0.05, gz1 + 0.65, ALL);
  }
}
