import {
  add,
  ALL,
  beam,
  blob,
  box,
  cross,
  dot,
  type Frame,
  FRONT,
  type Kit,
  normalize,
  type PartBuilder,
  NO_BOTTOM,
  prism,
  TOP,
  scale,
  sub,
  torus,
  tube,
  tubePath,
  type V3,
  WORLD,
} from './facade.js';
import { PLAZA_Y } from './layout.js';

/**
 * The street furniture of a business capital: concrete sidewalks scored
 * into slabs behind granite kerbs, a tram track set in granite strips (as
 * in Milan), cast-iron lamp posts with a curved arm (the New York kind),
 * plane trees in iron grates, hydrants, a newsstand of green-painted metal
 * whose racks show colour but no print, an iron railing along the
 * waterfront promenade and the small boats moored below it. All in the
 * town kit.
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
/** A plane tree in an iron grate; `size` scales the whole tree, 1 being a street tree about 9 m tall. */
export function planeTree(kit: Kit, x: number, base: number, z: number, random: () => number, size = 1): void {
  const m = kit.metal.color(0x2a2a28);
  const g = 0.65 * size;
  box(m, WORLD, x - g, base, z - g, x + g, base + 0.02, z + g, TOP);
  const bark = kit.wood.color(TRUNK);
  const lean: [number, number] = [(random() - 0.5) * 0.5 * size, (random() - 0.5) * 0.5 * size];
  const fork: [number, number, number] = [x + lean[0], base + 3.1 * size, z + lean[1]];
  tube(bark, [x, base, z], fork, 0.16 * size, 9, false);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + random();
    const end: [number, number, number] = [fork[0] + 1.3 * size * Math.cos(a), fork[1] + (1.8 + random() * 0.6) * size, fork[2] + 1.3 * size * Math.sin(a)];
    tube(bark, fork, end, 0.09 * size, 7, false);
  }
  // Leafy masses spread over an ellipsoid round the branches, so the fork disappears into the crown.
  const leaves = kit.cloth;
  const centre: V3 = [fork[0], fork[1] + 2.5 * size, fork[2]];
  leafCluster(leaves, centre, 1.7 * size, 0.75, LEAVES[0], random);
  for (let k = 0; k < 18; k += 1) {
    const th = Math.acos(1 - 2 * random() * 0.85);
    const ph = random() * Math.PI * 2;
    const reach = 0.6 + random() * 0.35;
    const c: V3 = [
      centre[0] + 2.4 * size * reach * Math.sin(th) * Math.cos(ph),
      centre[1] + 1.7 * size * reach * Math.cos(th),
      centre[2] + 2.4 * size * reach * Math.sin(th) * Math.sin(ph),
    ];
    leafCluster(leaves, c, (0.75 + random() * 0.35) * size, 0.8, LEAVES[k % LEAVES.length], random);
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

// --- moored boats -----------------------------------------------------------------

export interface BoatSpec {
  length: number;
  beam: number;
  /** Topsides, the sheer strake along the gunwale, and the cabin (null for an open rowing boat). */
  hull: number;
  strake: number;
  cabin: number | null;
}

const ANTIFOUL = 0x6e2a24;
const VARNISH = 0x8a5a32;
const DECK = 0x9c8466;
const ROPE = 0xcdbf9f;
const FENDER = 0xe8e4da;

/** Gunwale half-beam along the hull, 0 at the transom to 1 at the stem: full aft, a fine bow. */
function halfBeam(t: number): number {
  return t < 0.45 ? 0.84 + 0.16 * Math.sin((t / 0.45) * (Math.PI / 2)) : Math.cos(((t - 0.45) / 0.55) * (Math.PI / 2)) ** 0.75;
}

/**
 * A small harbour boat afloat in frame `f`: origin on the waterline under
 * the transom, `u` toward the bow, `v` up, `w` across. The hull is lofted
 * through eleven smooth sections with a rising sheer, red below the
 * waterline; a planked deck, varnished gunwales and, for a launch, a
 * cabin with dark windows and a short masthead light. No name, number or
 * flag. Fenders hang on the `quay` side of `w`. Returns the cleats at bow
 * and stern and the points where their lines leave the hull.
 */
export function boat(kit: Kit, f: Frame, s: BoatSpec, quay: 1 | -1 = 1): { bow: V3; bowLead: V3; stern: V3; sternLead: V3 } {
  const L = s.length;
  const B = s.beam / 2;
  const stations = 10;
  const sheer = (t: number) => 0.55 + 0.24 * t ** 2.2;
  const keel = (t: number) => 0.34 * (1 - 0.6 * t ** 3);
  // Section from the right gunwale round the keel to the left one: [across, up].
  const section = (t: number): Array<[number, number]> => {
    const b = B * halfBeam(t);
    const h = sheer(t);
    const k = keel(t);
    return [[b, h], [0.95 * b, 0.5 * h], [0.8 * b, 0.05], [0.44 * b, -0.62 * k], [0, -k], [-0.44 * b, -0.62 * k], [-0.8 * b, 0.05], [-0.95 * b, 0.5 * h], [-b, h]];
  };
  const grid: V3[][] = [];
  for (let i = 0; i <= stations; i += 1) {
    const t = i / stations;
    grid.push(section(t).map(([w, v]) => f.p(t * L, v, w)));
  }
  const across = grid[0].length;
  const normalAt = (i: number, j: number): V3 => {
    const along = sub(grid[Math.min(stations, i + 1)][j], grid[Math.max(0, i - 1)][j]);
    const round = sub(grid[i][Math.min(across - 1, j + 1)], grid[i][Math.max(0, j - 1)]);
    let n = normalize(cross(round, along));
    const axis = f.p((i / stations) * L, 0.2, 0);
    if (dot(n, sub(grid[i][j], axis)) < 0) n = scale(n, -1);
    return n;
  };
  const paint = kit.paint;
  for (let j = 0; j + 1 < across; j += 1) {
    const top = j === 0 || j === across - 2;
    const below = j >= 2 && j <= across - 4;
    paint.color(top ? s.strake : below ? ANTIFOUL : s.hull);
    for (let i = 0; i < stations; i += 1) {
      paint.smoothQuad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1], normalAt(i, j), normalAt(i + 1, j), normalAt(i + 1, j + 1), normalAt(i, j + 1));
    }
  }
  // The transom, a flat board across the stern.
  const back = scale(f.v(1, 0, 0), -1);
  const middle = f.p(0, 0.2, 0);
  paint.color(s.hull);
  for (let j = 0; j < across; j += 1) paint.triToward(middle, grid[0][j], grid[0][(j + 1) % across], back);
  if (s.cabin != null) {
    // A launch is decked a little below its gunwales.
    const deck = (k: number, j: number): V3 => add(grid[k][j], f.v(0, -0.07, 0));
    kit.wood.color(DECK);
    for (let i = 0; i < stations; i += 1) {
      kit.wood.quadToward(deck(i, 0), deck(i + 1, 0), deck(i + 1, across - 1), deck(i, across - 1), f.v(0, 1, 0));
    }
  } else {
    // An open boat shows its painted inside down to a floor of boards.
    paint.color(0xd8cfbd);
    for (let j = 0; j + 1 < across; j += 1) {
      for (let i = 0; i < stations; i += 1) {
        const inward = scale(add(normalAt(i, j), normalAt(i + 1, j + 1)), -1);
        paint.quadToward(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1], inward);
      }
    }
    kit.wood.color(DECK);
    for (let i = 0; i < stations; i += 1) {
      const floor = (k: number, side: number): V3 => f.p((k / stations) * L, 0.12, side * 0.83 * B * halfBeam(k / stations));
      kit.wood.quadToward(floor(i, 1), floor(i + 1, 1), floor(i + 1, -1), floor(i, -1), f.v(0, 1, 0));
    }
  }
  const rail = kit.wood.color(VARNISH);
  tubePath(rail, grid.map((row) => row[0]), 0.035, 6);
  tubePath(rail, grid.map((row) => row[across - 1]), 0.035, 6);
  if (s.cabin != null) {
    const v0 = sheer(0.42) - 0.07;
    const v1 = sheer(0.6) + 0.85;
    const w = 0.62 * B;
    box(kit.paint.color(s.cabin), f, 0.4 * L, v0, -w, 0.7 * L, v1, w, ALL);
    box(kit.paint.color(0xd8d2c4), f, 0.38 * L, v1, -w - 0.06, 0.72 * L, v1 + 0.07, w + 0.06, ALL);
    const g = kit.glass.color(0x1a2228);
    for (const side of [-1, 1]) {
      const ws = side * (w + 0.004);
      g.quadToward(f.p(0.44 * L, v1 - 0.55, ws), f.p(0.66 * L, v1 - 0.55, ws), f.p(0.66 * L, v1 - 0.18, ws), f.p(0.44 * L, v1 - 0.18, ws), f.v(0, 0, side));
    }
    const uf = 0.7 * L + 0.004;
    g.quadToward(f.p(uf, v1 - 0.5, -w + 0.12), f.p(uf, v1 - 0.5, w - 0.12), f.p(uf, v1 - 0.16, w - 0.12), f.p(uf, v1 - 0.16, -w + 0.12), f.v(1, 0, 0));
    const mast = kit.metal.color(0xd8d2c4);
    tube(mast, f.p(0.62 * L, v1 + 0.07, 0), f.p(0.62 * L, v1 + 1.2, 0), 0.025, 6);
    blob(kit.paint.color(0xf4efe0), f.p(0.62 * L, v1 + 1.24, 0), 0.06, 1);
  } else {
    // Thwarts across an open boat, and its oars shipped along it.
    for (const t of [0.3, 0.56]) {
      const half = B * halfBeam(t) * 0.92;
      box(kit.wood.color(DECK), f, t * L - 0.1, sheer(t) - 0.24, -half, t * L + 0.1, sheer(t) - 0.2, half, ALL);
    }
    const oar = kit.wood.color(0xc9a878);
    for (const side of [-1, 1]) tube(oar, f.p(0.12 * L, sheer(0.1) - 0.12, side * 0.25 * B), f.p(0.86 * L, sheer(0.8) - 0.1, side * 0.15 * B), 0.025, 6);
  }
  // Cleats on the deck (or the thwart-high stem and quarter of an open boat); the lines lead
  // out over the stem head and the quarter rail.
  const cleat = kit.metal.color(0x9a958d);
  const bow = f.p(0.9 * L, sheer(0.9) - 0.04, 0);
  const stern = f.p(0.06 * L, sheer(0.06) - 0.04, quay * 0.5 * B);
  blob(cleat, bow, 0.05, 0.6);
  blob(cleat, stern, 0.05, 0.6);
  const bowLead = f.p(0.995 * L, sheer(0.995) + 0.02, 0);
  const sternLead = f.p(0.02 * L, sheer(0.02) + 0.02, quay * B * halfBeam(0.02));
  // Fenders hanging over the side that lies against the quay.
  const fender = kit.paint.color(FENDER);
  for (const t of [0.3, 0.62]) {
    const w = quay * (B * halfBeam(t) + 0.1);
    tube(fender, f.p(t * L, sheer(t) - 0.1, w), f.p(t * L, sheer(t) - 0.55, w), 0.09, 8, true);
  }
  return { bow, bowLead, stern, sternLead };
}

/**
 * A mooring ring set in the quay face (facing -x at x), and a line from a
 * cleat over the hull's edge at `lead`, sagging from there to the ring.
 */
export function mooringLine(kit: Kit, x: number, y: number, z: number, cleat: V3, lead: V3): void {
  const ring: V3 = [x - 0.03, y, z];
  box(kit.metal.color(0x3a3a38), WORLD, x - 0.02, y + 0.03, z - 0.06, x, y + 0.13, z + 0.06, ALL);
  torus(kit.metal.color(0x3a3a38), ring, [1, 0, 0], 0.07, 0.013, 12, 5);
  const low: V3 = [x - 0.03, y - 0.07, z];
  const span = sub(lead, low);
  const sag = 0.08 * Math.hypot(span[0], span[2]);
  const points: V3[] = [];
  for (let k = 0; k <= 8; k += 1) {
    const t = k / 8;
    points.push(add(add(low, scale(span, t)), [0, -sag * 4 * t * (1 - t), 0]));
  }
  points.push(cleat);
  tubePath(kit.cloth.color(ROPE), points, 0.016, 5);
}

/** Ivy over a wall's coping along z at x, from z0 to z1: leafy clumps on top, a few trailing down. */
export function ivy(kit: Kit, x: number, top: number, z0: number, z1: number, random: () => number): void {
  const leaf = () => LEAVES[Math.floor(random() * LEAVES.length)];
  for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.55 + random() * 0.35) {
    leafCluster(kit.cloth, [x + (random() - 0.5) * 0.2, top + 0.1, z], 0.34 + random() * 0.14, 0.6, leaf(), random);
    if (random() < 0.45) leafCluster(kit.cloth, [x - 0.3, top - 0.45 - random() * 0.5, z + (random() - 0.5) * 0.3], 0.22 + random() * 0.1, 1.4, leaf(), random);
  }
}
