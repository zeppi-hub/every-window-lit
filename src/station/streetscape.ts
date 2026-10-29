import {
  ALL,
  beam,
  box,
  FRONT,
  type Kit,
  normalize,
  type PartBuilder,
  NO_BOTTOM,
  prism,
  TOP,
  torus,
  tube,
  type V3,
  WORLD,
} from './facade.js';
import { PLAZA_Y } from './layout.js';

/**
 * The street furniture of a business capital: concrete sidewalks scored
 * into slabs behind granite kerbs, a tram track set in granite strips (as
 * in Milan), cast-iron lamp posts with a curved arm (the New York kind),
 * plane trees in iron grates, hydrants, a newsstand of green-painted metal
 * whose racks show colour but no print, and an iron railing along the
 * waterfront promenade. All world-space, all in the town kit.
 */

/** Sidewalks stand a kerb above the square and the roads. */
export const KERB = 0.15;

const KERB_STONE = 0x8e8c88;
const JOINT = 0x8a857c;
const LAMP_IRON = 0x1f2a26;
const RAIL_STEEL = 0x77736c;
const GRANITE_SETT = 0x9a958d;
const TRUNK = 0x6e6152;
const LEAVES = [0x4f6b38, 0x587440, 0x46622f] as const;
const HYDRANT = 0x8f2b22;
const KIOSK_GREEN = 0x2f4a3c;

/**
 * A sidewalk from (x0, z0) to (x1, z1), its kerb along the edge facing
 * `kerb` ('-z', '+z', '-x' or '+x'), scored into slabs every 1.5 m.
 */
export function sidewalk(kit: Kit, x0: number, z0: number, x1: number, z1: number, kerb: '-z' | '+z' | '-x' | '+x' | null): void {
  const top = PLAZA_Y + KERB;
  box(kit.concrete.color(0xd8d4cc), WORLD, x0, PLAZA_Y - 0.3, z0, x1, top, z1, NO_BOTTOM);
  const k = kit.stone.color(KERB_STONE);
  const w = 0.3;
  if (kerb === '+z') box(k, WORLD, x0, PLAZA_Y - 0.3, z1 - w, x1, top + 0.005, z1, NO_BOTTOM);
  if (kerb === '-z') box(k, WORLD, x0, PLAZA_Y - 0.3, z0, x1, top + 0.005, z0 + w, NO_BOTTOM);
  if (kerb === '+x') box(k, WORLD, x1 - w, PLAZA_Y - 0.3, z0, x1, top + 0.005, z1, NO_BOTTOM);
  if (kerb === '-x') box(k, WORLD, x0, PLAZA_Y - 0.3, z0, x0 + w, top + 0.005, z1, NO_BOTTOM);
  // Joints across the walk, shallow dark strips.
  const p = kit.paint.color(JOINT);
  const alongX = kerb == null || kerb === '+z' || kerb === '-z';
  const [a0, a1] = alongX ? [x0, x1] : [z0, z1];
  for (let a = a0 + 1.5; a < a1 - 0.3; a += 1.5) {
    if (alongX) box(p, WORLD, a - 0.012, top, z0, a + 0.012, top + 0.003, z1, TOP);
    else box(p, WORLD, x0, top, a - 0.012, x1, top + 0.003, a + 0.012, TOP);
  }
}

/**
 * A tram track along z from z0 to z1 at x (centre line), on a road whose
 * surface is at y: two rails, each between granite strips (as in Milan).
 */
export function tramTrack(kit: Kit, x: number, z0: number, z1: number, y: number): void {
  const gauge = 1.435;
  for (const xr of [x - gauge / 2, x + gauge / 2]) {
    box(kit.stone.color(GRANITE_SETT), WORLD, xr - 0.28, y - 0.1, z0, xr - 0.04, y + 0.008, z1, TOP);
    box(kit.stone.color(GRANITE_SETT), WORLD, xr + 0.04, y - 0.1, z0, xr + 0.28, y + 0.008, z1, TOP);
    box(kit.metal.color(RAIL_STEEL), WORLD, xr - 0.035, y - 0.05, z0, xr + 0.035, y + 0.01, z1, TOP);
    box(kit.metal.color(0x2b2a28), WORLD, xr - 0.04, y - 0.05, z0, xr - 0.035, y + 0.006, z1, TOP);
  }
}

/**
 * A cast-iron lamp post: fluted base, tall shaft, and a curved arm carrying
 * a glass lantern over the street; `heading` turns the arm (radians about y).
 */
export function cityLamp(kit: Kit, x: number, base: number, z: number, heading: number): void {
  const f = WORLD.turned(x, base, z, heading);
  const m = kit.metal.color(LAMP_IRON);
  prism(m, f, 0, 0, -0.05, 0.55, 0.24, 0.19, 12, { smooth: true });
  prism(m, f, 0, 0, 0.55, 0.68, 0.22, 0.22, 12, { top: true, smooth: true });
  prism(m, f, 0, 0, 0.68, 1.35, 0.13, 0.1, 12, { smooth: true });
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    box(m, f.turned(0.115 * Math.cos(a), 0.68, 0.115 * Math.sin(a), -a), -0.012, 0, -0.012, 0.012, 0.65, 0.012, ALL);
  }
  prism(m, f, 0, 0, 1.35, 5.2, 0.085, 0.06, 12, { smooth: true });
  torus(m, f.p(0, 1.4, 0), [0, 1, 0], 0.1, 0.022, 14, 4);
  torus(m, f.p(0, 4.4, 0), [0, 1, 0], 0.075, 0.02, 14, 4);
  // The crook: a quarter turn out over the street and down to the lantern.
  const arm: [number, number][] = [];
  for (let k = 0; k <= 8; k += 1) {
    const t = (k / 8) * (Math.PI / 2);
    arm.push([0.55 * Math.sin(t), 5.2 + 0.55 * (1 - Math.cos(t))]);
  }
  for (let k = 0; k + 1 < arm.length; k += 1) {
    tube(m, f.p(arm[k][0], arm[k][1], 0), f.p(arm[k + 1][0], arm[k + 1][1], 0), 0.045, 8);
  }
  for (let k = 0; k <= 6; k += 1) {
    const t = (k / 6) * (Math.PI / 2);
    tube(m, f.p(0.55 + 0.25 * Math.sin(t), 5.75 + 0.25 * (1 - Math.cos(t)), 0), f.p(0.55 + 0.25 * Math.sin(t + Math.PI / 12), 5.75 + 0.25 * (1 - Math.cos(t + Math.PI / 12)), 0), 0.018, 6);
  }
  tube(m, f.p(0.8, 6.0, 0), f.p(1.1, 6.0, 0), 0.04, 8);
  // The lantern, hanging from the arm's end.
  const l = f.at(1.1, 5.35, 0);
  prism(m, l, 0, 0, 0.55, 0.65, 0.05, 0.05, 8);
  prism(m, l, 0, 0, 0.46, 0.55, 0.26, 0.05, 8, { bottom: true });
  kit.glass.color(0xd8d2b8);
  prism(kit.glass, l, 0, 0, 0.06, 0.46, 0.13, 0.22, 8);
  prism(m, l, 0, 0, 0, 0.06, 0.07, 0.13, 8, { bottom: true });
}

/** A plane tree in an iron grate: a leaning trunk forking into a crown of leafy masses. */
export function planeTree(kit: Kit, x: number, base: number, z: number, random: () => number): void {
  const m = kit.metal.color(0x2a2a28);
  box(m, WORLD, x - 0.65, base, z - 0.65, x + 0.65, base + 0.02, z + 0.65, TOP);
  const bark = kit.wood.color(TRUNK);
  const lean: [number, number] = [(random() - 0.5) * 0.5, (random() - 0.5) * 0.5];
  const fork: [number, number, number] = [x + lean[0], base + 3.1, z + lean[1]];
  tube(bark, [x, base, z], fork, 0.16, 9, false);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + random();
    const end: [number, number, number] = [fork[0] + 1.3 * Math.cos(a), fork[1] + 1.8 + random() * 0.6, fork[2] + 1.3 * Math.sin(a)];
    tube(bark, fork, end, 0.09, 7, false);
  }
  // Leafy masses spread over an ellipsoid round the branches, so the fork disappears into the crown.
  const leaves = kit.cloth;
  const centre: V3 = [fork[0], fork[1] + 2.5, fork[2]];
  leafCluster(leaves, centre, 1.7, 0.75, LEAVES[0], random);
  for (let k = 0; k < 18; k += 1) {
    const th = Math.acos(1 - 2 * random() * 0.85);
    const ph = random() * Math.PI * 2;
    const reach = 0.6 + random() * 0.35;
    const c: V3 = [
      centre[0] + 2.4 * reach * Math.sin(th) * Math.cos(ph),
      centre[1] + 1.7 * reach * Math.cos(th),
      centre[2] + 2.4 * reach * Math.sin(th) * Math.sin(ph),
    ];
    leafCluster(leaves, c, 0.75 + random() * 0.35, 0.8, LEAVES[k % LEAVES.length], random);
  }
}

/**
 * A rounded mass of leaves: a lumpy sphere, squashed a little, with smooth
 * normals so it shades softly, darker towards its underside.
 */
function leafCluster(b: PartBuilder, c: V3, r: number, squash: number, tint: number, random: () => number): void {
  const seg = 12;
  const rings = 7;
  const bump: number[] = [];
  for (let j = 0; j <= rings; j += 1) {
    for (let i = 0; i < seg; i += 1) bump.push(j === 0 || j === rings ? 1 : 0.94 + random() * 0.12);
  }
  const point = (i: number, j: number): [V3, V3] => {
    const th = (j / rings) * Math.PI;
    const ph = ((i % seg) / seg) * Math.PI * 2;
    const k = bump[j * seg + (i % seg)] * r;
    const d: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    return [[c[0] + d[0] * k, c[1] + d[1] * k * squash, c[2] + d[2] * k], normalize([d[0], d[1] / squash, d[2]])];
  };
  for (let j = 0; j < rings; j += 1) {
    b.color(tint, 1.05 - (0.25 * j) / rings);
    for (let i = 0; i < seg; i += 1) {
      const [a, na] = point(i, j);
      const [e, ne] = point(i + 1, j);
      const [g, ng] = point(i + 1, j + 1);
      const [h, nh] = point(i, j + 1);
      if (j === 0) b.smoothTriangle(a, g, h, na, ng, nh);
      else if (j === rings - 1) b.smoothTriangle(a, e, h, na, ne, nh);
      else b.smoothQuad(a, e, g, h, na, ne, ng, nh);
    }
  }
}

/** A cast-iron fire hydrant: body, bonnet and two side nozzles with caps. */
export function hydrant(kit: Kit, x: number, base: number, z: number, heading: number): void {
  const f = WORLD.turned(x, base, z, heading);
  const p = kit.paint.color(HYDRANT);
  prism(p, f, 0, 0, 0, 0.08, 0.2, 0.18, 12, { smooth: true });
  prism(p, f, 0, 0, 0.08, 0.6, 0.13, 0.12, 12, { smooth: true });
  prism(p, f, 0, 0, 0.6, 0.72, 0.15, 0.08, 12, { smooth: true });
  prism(p, f, 0, 0, 0.72, 0.8, 0.035, 0.03, 6, { top: true });
  for (const side of [-1, 1]) {
    tube(p.color(HYDRANT), f.p(side * 0.1, 0.42, 0), f.p(side * 0.22, 0.42, 0), 0.05, 10, true);
    tube(p.color(0xb8b2a6), f.p(side * 0.22, 0.42, 0), f.p(side * 0.25, 0.42, 0), 0.055, 10, true);
  }
}

/**
 * A newsstand: a green-painted metal booth, its counter open towards the
 * square under a flap, racks of papers and magazines in colour (no print),
 * a roof overhanging all round.
 */
export function newsstand(kit: Kit, x0: number, z0: number, x1: number, z1: number, random: () => number): void {
  const base = PLAZA_Y;
  const p = kit.paint.color(KIOSK_GREEN);
  const h = 2.6;
  // Walls: back and ends solid, front open above a counter.
  box(p, WORLD, x0, base, z0, x1, base + h, z0 + 0.08, ALL);
  box(p, WORLD, x0, base, z0, x0 + 0.08, base + h, z1, ALL);
  box(p, WORLD, x1 - 0.08, base, z0, x1, base + h, z1, ALL);
  box(p, WORLD, x0, base, z1 - 0.08, x1, base + 1.0, z1, ALL);
  box(p, WORLD, x0, base + 2.15, z1 - 0.08, x1, base + h, z1, ALL);
  // Counter, racks and their colours.
  box(kit.wood.color(0x6b5240), WORLD, x0 + 0.05, base + 1.0, z1 - 0.45, x1 - 0.05, base + 1.06, z1 + 0.05, ALL);
  const cloth = kit.cloth;
  for (let row = 0; row < 3; row += 1) {
    const y = base + 1.15 + row * 0.33;
    box(kit.wood.color(0x5a4636), WORLD, x0 + 0.1, y - 0.03, z0 + 0.1, x1 - 0.1, y, z0 + 0.45, ALL);
    for (let x = x0 + 0.2; x < x1 - 0.35; x += 0.24 + random() * 0.06) {
      cloth.color([0xd8c9a0, 0xc54a3a, 0x3b6ea5, 0xe7d36a, 0x4f8a5a, 0xf2efe6, 0x9a5aa0][Math.floor(random() * 7)]);
      box(cloth, WORLD, x, y, z0 + 0.12, x + 0.2, y + 0.27, z0 + 0.15 + random() * 0.04, FRONT | TOP);
    }
  }
  // Papers fanned on the counter's front ledge.
  for (let x = x0 + 0.3; x < x1 - 0.4; x += 0.35) {
    cloth.color([0xefebe0, 0xe6e0d0, 0xd9d2c0][Math.floor(random() * 3)]);
    box(cloth, WORLD, x, base + 1.06, z1 - 0.4, x + 0.3, base + 1.08, z1 - 0.05, TOP);
  }
  // The flap, propped open over the counter, and the roof.
  beam(p, [x0 + 0.1, base + 2.15, z1], [x0 + 0.1, base + 2.5, z1 + 0.6], 0.03, 0.03);
  beam(p, [x1 - 0.1, base + 2.15, z1], [x1 - 0.1, base + 2.5, z1 + 0.6], 0.03, 0.03);
  box(p, WORLD, x0, base + 2.45, z1 - 0.02, x1, base + 2.5, z1 + 0.65, ALL);
  box(kit.paint.color(0x24392e), WORLD, x0 - 0.2, base + h, z0 - 0.2, x1 + 0.2, base + h + 0.12, z1 + 0.25, ALL);
  box(p.color(KIOSK_GREEN), WORLD, x0 + 0.2, base + h + 0.12, z0 + 0.1, x1 - 0.2, base + h + 0.3, z1 - 0.05, NO_BOTTOM);
}

/** An iron railing along a waterfront edge running in z at x: posts every 1.8 m and two rails. */
export function promenadeRailing(kit: Kit, x: number, base: number, z0: number, z1: number): void {
  const m = kit.metal.color(0x2a2c2b);
  box(m, WORLD, x - 0.035, base + 1.02, z0, x + 0.035, base + 1.08, z1, ALL);
  box(m, WORLD, x - 0.02, base + 0.5, z0, x + 0.02, base + 0.54, z1, ALL);
  for (let z = z0; z <= z1 + 1e-6; z += 1.8) {
    prism(m, WORLD.at(x, base, z), 0, 0, 0, 1.08, 0.04, 0.035, 8, { smooth: true, top: true });
  }
  for (let z = z0 + 0.15; z < z1; z += 0.15) box(m, WORLD, x - 0.01, base + 0.54, z - 0.01, x + 0.01, base + 1.02, z + 0.01, ALL);
}
