import { Group, type Material, Vector3 } from '@iwsdk/core';
import {
  ALL,
  BACK,
  band,
  beam,
  blob,
  BOTTOM,
  box,
  chimney,
  clapboards,
  createKit,
  doorway,
  FRONT,
  Frame,
  gableRoof,
  GLASS,
  type Hole,
  hipRoof,
  type HouseSpec,
  houseTop,
  italianHouse,
  type Kit,
  LEFT,
  NO_BACK,
  NO_BOTTOM,
  type PartBuilder,
  PORTAL_STONE,
  prism,
  reveal,
  RIGHT,
  scale,
  STRIP,
  TOP,
  torus,
  tube,
  tubePath,
  wallFace,
  windowUnit,
  type WindowSpec,
  WORLD,
} from './facade.js';
import { seededRandom } from './geometry.js';
import { PLAZA_Y } from './layout.js';
import { plain, scanned } from './materials.js';
import { bench, bicycle, cafeChair, cafeTable, fountain, moped, openBox, parasol, streetLamp } from './square.js';

/**
 * The live, near part of Ombrisa: the square below the tower, the row of
 * houses across it, the market street on the right and the start of the coast
 * road. Everything further than about 36 m (the hillside, the coast, the cape
 * and lighthouse, the sea, the mountains) is a Cycles panorama rendered from
 * the seat by art/panorama/build_far_town.py and shown as the sky.
 *
 * The port is where three quarters meet: the Italian core around the square,
 * Turkish and American clapboard houses mixed into both streets (the square
 * is where the three quarters meet), and a clapboard kiosk where the coast
 * road leaves for the American harbour side.
 * Facades are built from real parts (facade.ts) and the square is furnished
 * (square.ts); all of it merges into one mesh per material, nine draw calls.
 */

// Tints, glass and road shared with art/panorama/build_far_town.py, so the
// live town and the painted one meet without a seam at 36 m.
const PAVING = 0xffffff;
const ROAD = 0xc9bfae;
const ROCK = 0xc8bca8;
const SLABS = 0xf1ebe0;
/** Matches NEAR_EDGE_Z in art/panorama/build_far_town.py. */
const NEAR_EDGE_Z = -36;
/** Street lines: the row across the square faces +z, the market street faces -x. */
const ROW_FRONT = -27;
const MARKET_FRONT = 30;

/**
 * World-space boxes [x0, y0, z0, x1, y1, z1] around every part of the live
 * town that casts or catches sun shadows; shadows.ts fits the sun's shadow
 * camera to them.
 */
export const SHADOW_REGION: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [-21.6, PLAZA_Y - 0.6, -34.8, 26.8, PLAZA_Y + 17.5, -25.0],
  [28.4, PLAZA_Y - 0.6, -26.6, 37.8, PLAZA_Y + 17.5, -1.4],
  [-25.2, PLAZA_Y - 0.6, -27.0, 30.0, PLAZA_Y + 6.6, -0.6],
];

export interface TownParts {
  town: Group;
  /** Centre of Tessa's window across the square, for the window pull later. */
  tessaWindow: Vector3;
}

type Brief = Partial<HouseSpec> &
  Pick<HouseSpec, 'width' | 'ground' | 'floors' | 'columns' | 'wall' | 'shutter' | 'roof' | 'groundFloor'>;

function spec(b: Brief): HouseSpec {
  return {
    depth: 7,
    setback: 0,
    trim: 0xfff6e8,
    frame: 0xefebe2,
    door: 0x4a3426,
    shopFrame: 0x2f4433,
    rise: 1.8,
    balconies: [],
    chimneys: [],
    pipe: null,
    dentils: false,
    pilasters: false,
    tessa: false,
    vergeLeft: 0,
    vergeRight: 0,
    ...b,
  };
}

const GREEN_AWNING = [0xece4cf, 0x3f6a4a] as const;
const RED_AWNING = [0xece4cf, 0x8a2f2f] as const;
const BLUE_AWNING = [0xece4cf, 0x2f4f6f] as const;

/**
 * The row across the square, left to right from x = -21 (47 m with the
 * Turkish house). Tessa's family lives in the cream house just right of
 * centre; her window is the left one on the first floor.
 */
const ROW: readonly HouseSpec[] = [
  spec({
    width: 5.6, ground: 3.8, floors: 2, columns: 2, wall: 0xf4c28a, trim: 0xfff1dc, shutter: 0x4f6b42, roof: 0xe8a487, rise: 1.85,
    groundFloor: [{ kind: 'door', u: 1.4 }, { kind: 'window', u: 4.2 }],
    balconies: [{ floor: 1, from: 0, to: 1 }], chimneys: [1.2], pipe: 0.14, pilasters: true,
  }),
  spec({
    width: 5.8, setback: 0.15, ground: 3.9, floors: 1, columns: 3, wall: 0xffe1b0, shutter: 0x3f5a6b, door: 0x3a4a52, roof: 0xf2b49a, rise: 1.7,
    groundFloor: [{ kind: 'shop', u: 2.0, w: 3.0, awning: GREEN_AWNING, door: 'right' }, { kind: 'door', u: 4.75, w: 1.15 }],
    chimneys: [4.6], dentils: true,
  }),
  spec({
    width: 6.0, ground: 4.0, floors: 3, columns: 3, wall: 0xe7a283, trim: 0xf7e6d2, shutter: 0x5e7d4f, shopFrame: 0x5a2e24, roof: 0xe0a080, rise: 1.9,
    groundFloor: [{ kind: 'arch', u: 1.7, w: 2.4 }, { kind: 'door', u: 4.6 }],
    balconies: [{ floor: 1, from: 1, to: 1 }], chimneys: [5.2], dentils: true,
  }),
  spec({
    width: 6.2, ground: 3.6, floors: 2, columns: 2, wall: 0xfff4e6, trim: 0xfbf7ef, shutter: 0x5e7d4f, door: 0x2f4433, roof: 0xebb59c, rise: 1.8,
    groundFloor: [{ kind: 'window', u: 1.2 }, { kind: 'door', u: 3.4, w: 1.2 }, { kind: 'window', u: 5.25 }],
    chimneys: [1.6], tessa: true,
  }),
  spec({
    width: 6.0, setback: 0.25, ground: 4.0, floors: 2, columns: 2, wall: 0xf6ece0, trim: 0xffffff, shutter: 0x4f6b42, door: 0x5a2e24, roof: 0xf5c2a8, rise: 1.8,
    groundFloor: [{ kind: 'arch', u: 1.55, w: 2.2 }, { kind: 'arch', u: 4.45, w: 2.2, door: 'left' }],
    balconies: [{ floor: 1, from: 0, to: 0 }], chimneys: [4.4],
  }),
  spec({
    width: 5.4, setback: 0.1, ground: 3.8, floors: 3, columns: 2, wall: 0xffe9cf, trim: 0xfff8ee, shutter: 0x3f5a6b, shopFrame: 0x5a2e24, roof: 0xebb59c, rise: 1.9,
    groundFloor: [{ kind: 'shop', u: 1.75, w: 2.7, awning: RED_AWNING, door: 'left' }, { kind: 'door', u: 4.4, w: 1.2 }],
    balconies: [{ floor: 2, from: 0, to: 1 }], chimneys: [1.0], pipe: 5.26, pilasters: true,
  }),
  spec({
    width: 5.8, setback: 0.3, ground: 3.7, floors: 2, columns: 3, wall: 0xf2d2b6, trim: 0xfff3e2, shutter: 0x7a8a6a, door: 0x2f4433, roof: 0xe8a487, rise: 1.75,
    groundFloor: [{ kind: 'door', u: 1.0, w: 1.2 }, { kind: 'window', u: 4.6 }],
    balconies: [{ floor: 1, from: 1, to: 1 }], chimneys: [4.6],
  }),
];

/** The market street on the right, from its far end (z = -26) toward the tower. */
const MARKET: readonly HouseSpec[] = [
  spec({
    width: 6.2, ground: 3.8, floors: 2, columns: 2, wall: 0xfff8ea, trim: 0xffffff, shutter: 0x5e7d4f, roof: 0xebb59c, rise: 1.85,
    groundFloor: [{ kind: 'arch', u: 1.65, w: 2.3 }, { kind: 'door', u: 4.55, w: 1.2 }],
    balconies: [{ floor: 1, from: 1, to: 1 }], chimneys: [1.4], pipe: 0.14,
  }),
  spec({
    width: 5.2, setback: 0.15, ground: 3.9, floors: 3, columns: 2, wall: 0xf4c28a, trim: 0xfff1dc, shutter: 0x3f5a6b, door: 0x2f4433, shopFrame: 0x2f4f6f, roof: 0xe8a487, rise: 1.9,
    groundFloor: [{ kind: 'shop', u: 1.7, w: 2.6, awning: BLUE_AWNING, door: 'left' }, { kind: 'door', u: 4.25, w: 1.1 }],
    balconies: [{ floor: 2, from: 0, to: 1 }], dentils: true,
  }),
  spec({
    width: 6.4, ground: 4.0, floors: 1, columns: 3, wall: 0xe7a283, trim: 0xf7e6d2, shutter: 0x4f6b42, shopFrame: 0x5a2e24, roof: 0xe0a080, rise: 1.75,
    groundFloor: [{ kind: 'arch', u: 1.6, w: 2.2 }, { kind: 'arch', u: 4.8, w: 2.2, door: 'right' }],
    chimneys: [5.0],
  }),
  spec({
    width: 6.2, setback: 0.2, ground: 3.8, floors: 2, columns: 2, wall: 0xffe9cf, trim: 0xfff8ee, shutter: 0x5e7d4f, door: 0x3a4a52, roof: 0xf2b49a, rise: 1.8,
    groundFloor: [{ kind: 'shop', u: 1.8, w: 2.8, awning: RED_AWNING, door: 'right' }, { kind: 'door', u: 4.7, w: 1.2 }],
    balconies: [{ floor: 1, from: 0, to: 1 }], pipe: 6.06,
  }),
];

// --- the Turkish house at the right end of the row ---------------------------

const WHITEWASH = 0xfcfbf6;
const AEGEAN_BLUE = 0x2d63a0;
const TIMBER = 0xc39b72;
const SASH = 0xf4f2ec;
const TURKISH_TILE = 0xe39a76;

function plainWindow(u0: number, v0: number, w: number, h: number, depth: number): WindowSpec {
  return {
    u0, v0, w, h, depth,
    wall: WHITEWASH, surround: null, cap: false, sill: true, french: false,
    frame: SASH, panes: [GLASS], shutters: 'open', shutter: AEGEAN_BLUE,
    louvred: false, ajarAngle: 0, grille: false,
  };
}

/**
 * Whitewashed walls, a blue door and plank shutters below; above, a timber
 * cumba (an enclosed bay) on angled braces, under wide eaves with exposed
 * rafter ends and a low hipped roof. Bougainvillea climbs over the door.
 */
function turkishHouse(kit: Kit, f: Frame, random: () => number): void {
  const W = 6.2;
  const D = 7;
  const ground = 3.2;
  const H = 6.55;
  const holes: Hole[] = [];
  box(kit.plaster.color(WHITEWASH), f, 0, -2, -D, W, H, 0, BACK | LEFT | RIGHT | TOP);
  holes.push(
    doorway(kit, f, {
      u0: 0.75, w: 1.2, h: 2.35, depth: 0.32, colour: AEGEAN_BLUE,
      wood: false, fanlight: false, portal: 'plain', stone: PORTAL_STONE,
    }),
  );
  holes.push(windowUnit(kit, f, { ...plainWindow(2.9, 1.2, 0.8, 1.1, 0.32), grille: true }));
  holes.push(windowUnit(kit, f, { ...plainWindow(4.6, 1.2, 0.8, 1.1, 0.32), grille: true }));
  holes.push(windowUnit(kit, f, plainWindow(0.75, ground + 0.95, 0.8, 1.4, 0.32)));
  wallFace(kit.plaster.color(WHITEWASH), f, 0, W, -0.3, H, holes);
  band(kit.stone.color(0xe2d8c6), f, 0, W, -0.25, 0.45, 0.05, [{ u0: 0.61, u1: 2.09, v0: -1, v1: 2.6 }], STRIP);
  cumba(kit, f, 2.3, 4.9, ground, H);
  bougainvillea(kit, f, random);
  const rafters = kit.wood.color(TIMBER, 0.8);
  for (let u = 0.15; u < W; u += 0.52) box(rafters, f, u - 0.045, H - 0.12, 0, u + 0.045, H, 0.74, NO_BACK);
  hipRoof(kit, f, {
    width: W, depth: D, top: H, rise: 1.15, front: 0.8, back: 0.6, vergeLeft: 0, vergeRight: 0,
    tile: TURKISH_TILE, soffit: WHITEWASH, wall: WHITEWASH, gutter: null,
  });
  chimney(kit, f, 4.6, -4.8, H, H + 2.0, WHITEWASH, TURKISH_TILE);
}

/** The cumba: a plastered timber-framed bay with five sash windows, on three braces. */
function cumba(kit: Kit, f: Frame, c0: number, c1: number, floor: number, top: number): void {
  const cd = 0.75;
  const v0 = floor + 0.05;
  const v1 = top - 0.12;
  const winV = v0 + 0.9;
  const winH = 1.25;
  const span = c1 - c0;
  const front = f.at(0, 0, cd);
  const left = new Frame(f.p(c0, 0, 0), f.n, f.up, scale(f.t, -1));
  const right = new Frame(f.p(c1, 0, cd), scale(f.n, -1), f.up, f.t);
  const sash = (u0: number, w: number): WindowSpec => ({
    ...plainWindow(u0, winV, w, winH, 0.09),
    sill: false,
    shutters: 'none',
  });
  const frontHoles: Hole[] = [];
  for (let k = 0; k < 3; k += 1) {
    const uc = c0 + (span * (k + 0.5)) / 3;
    frontHoles.push(windowUnit(kit, front, sash(uc - 0.31, 0.62)));
  }
  wallFace(kit.plaster.color(WHITEWASH), front, c0, c1, v0, v1, frontHoles);
  for (const side of [left, right]) {
    const hole = windowUnit(kit, side, sash(cd / 2 - 0.19, 0.38));
    wallFace(kit.plaster.color(WHITEWASH), side, 0, cd, v0, v1, [hole]);
  }
  const pl = kit.plaster.color(WHITEWASH);
  pl.quadToward(f.p(c0, v0, 0), f.p(c1, v0, 0), f.p(c1, v0, cd), f.p(c0, v0, cd), f.v(0, -1, 0));
  pl.quadToward(f.p(c0, v1, 0), f.p(c1, v1, 0), f.p(c1, v1, cd), f.p(c0, v1, cd), f.up);
  const wd = kit.wood.color(TIMBER);
  box(wd, f, c0 - 0.05, v0 - 0.04, 0, c1 + 0.05, v0 + 0.2, cd + 0.05, NO_BACK);
  box(wd, f, c0 - 0.04, v1 - 0.16, 0, c1 + 0.04, v1, cd + 0.04, NO_BACK);
  for (const u of [c0, c1]) box(wd, f, u - 0.05, v0 + 0.2, cd - 0.07, u + 0.05, v1 - 0.16, cd + 0.03, NO_BACK);
  for (const k of [1, 2]) {
    const u = c0 + (span * k) / 3;
    box(wd, front, u - 0.07, winV - 0.06, 0, u + 0.07, winV + winH + 0.06, 0.025, FRONT | LEFT | RIGHT);
  }
  box(wd, front, c0 + 0.05, winV - 0.08, 0, c1 - 0.05, winV, 0.045, NO_BACK);
  box(wd, front, c0 + 0.05, winV + winH, 0, c1 - 0.05, winV + winH + 0.07, 0.03, NO_BACK);
  for (let k = 0; k < 3; k += 1) {
    const u = c0 + 0.15 + ((span - 0.3) * k) / 2;
    box(wd, f, u - 0.06, v0 - 0.18, 0, u + 0.06, v0 - 0.04, cd, NO_BACK);
    beam(wd, f.p(u, floor - 0.95, 0.04), f.p(u, v0 - 0.12, cd - 0.12), 0.11, 0.11, f.t);
    box(wd, f, u - 0.07, floor - 1.08, 0, u + 0.07, floor - 0.84, 0.035, NO_BACK);
  }
}

/** Woody stems and clusters of magenta bracts and leaves hugging the wall. */
function bougainvillea(kit: Kit, f: Frame, random: () => number): void {
  const stem = kit.wood.color(0x5a4030);
  tubePath(stem, [f.p(0.38, 0, 0.14), f.p(0.42, 0.9, 0.12), f.p(0.36, 1.8, 0.14), f.p(0.55, 2.55, 0.16), f.p(1.1, 2.85, 0.18)], 0.035, 5);
  tubePath(stem, [f.p(0.4, 1.6, 0.13), f.p(0.2, 2.4, 0.15), f.p(0.3, 3.2, 0.16)], 0.025, 5);
  const flowers = [0xc8317c, 0xd9469a, 0xb02a6c, 0xe25aa5];
  const leaves = [0x46692e, 0x3b5e27, 0x557a36];
  const clump = (cu: number, cv: number, ru: number, rv: number, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const flower = random() < 0.62;
      kit.cloth.color(flower ? flowers[Math.floor(random() * flowers.length)] : leaves[Math.floor(random() * leaves.length)]);
      const at = f.p(cu + Math.cos(a) * r * ru, cv + Math.sin(a) * r * rv, 0.08 + random() * 0.26);
      blob(kit.cloth, at, 0.05 + random() * 0.05, 0.7, random);
    }
  };
  clump(1.25, 2.85, 1.25, 0.55, 240);
  clump(0.35, 1.6, 0.3, 1.0, 80);
  clump(0.55, 3.55, 0.5, 0.45, 60);
}

// --- the clapboard kiosk where the coast road leaves the square -------------

const BOARDS = 0xbccfdc;
const TRIM = 0xf5f4ef;
const SHINGLES = 0x8d9093;

/**
 * The triangular top of a gable wall: straight up from `v0` for `shoulder`,
 * then along the roof slopes to `apex`, with one rectangular opening.
 */
function gableWall(b: PartBuilder, f: Frame, width: number, v0: number, shoulder: number, apex: number, hole: Hole): void {
  const vs = v0 + shoulder;
  const extent = (v: number): [number, number] => {
    if (v <= vs) return [0, width];
    const k = ((v - vs) / (apex - vs)) * (width / 2);
    return [k, width - k];
  };
  const cuts = [v0, vs, hole.v0, hole.v1, apex].filter((v) => v >= v0 && v <= apex).sort((p, q) => p - q);
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const va = cuts[i];
    const vb = cuts[i + 1];
    if (vb - va < 1e-4) continue;
    const [a0, a1] = extent(va);
    const [b0, b1] = extent(vb);
    const piece = (pa0: number, pa1: number, pb0: number, pb1: number) =>
      b.quadToward(f.p(pa0, va, 0), f.p(pa1, va, 0), f.p(pb1, vb, 0), f.p(pb0, vb, 0), f.n);
    const mid = (va + vb) / 2;
    if (mid > hole.v0 && mid < hole.v1) {
      piece(a0, hole.u0, b0, hole.u0);
      piece(hole.u1, a1, hole.u1, b1);
    } else {
      piece(a0, a1, b0, b1);
    }
  }
}

/** White trim boards round an opening; returns the area the clapboards must skip. */
function casing(kit: Kit, f: Frame, h: Hole, sill: boolean): Hole {
  const p = kit.paint.color(TRIM);
  box(p, f, h.u0 - 0.1, h.v0, 0, h.u0, h.v1, 0.045, FRONT | LEFT | RIGHT);
  box(p, f, h.u1, h.v0, 0, h.u1 + 0.1, h.v1, 0.045, FRONT | LEFT | RIGHT);
  box(p, f, h.u0 - 0.13, h.v1, 0, h.u1 + 0.13, h.v1 + 0.12, 0.055, NO_BACK);
  if (sill) box(p, f, h.u0 - 0.13, h.v0 - 0.06, 0, h.u1 + 0.13, h.v0, 0.07, NO_BACK);
  return { u0: h.u0 - 0.13, u1: h.u1 + 0.13, v0: h.v0 - (sill ? 0.06 : 0), v1: h.v1 + 0.12 };
}

/**
 * A New England harbour kiosk: pale blue lap siding with white corner
 * boards, a steep shingled gable toward the tower, a serving hatch whose
 * flap is propped open over the counter, a side door, a life ring, crates.
 */
function kiosk(kit: Kit): void {
  const x0 = -20.7;
  const x1 = -17.9;
  const zf = -20.2;
  const zb = -23.6;
  const L = zf - zb;
  const Wk = x1 - x0;
  const eave = 2.7;
  const rise = 1.65;
  const base = 0.22;
  // The side wall faces the square (+x), its x running back from the front;
  // the gable end faces the tower (+z).
  const side = Frame.of([x1, PLAZA_Y, zf], [0, 0, -1]);
  const front = Frame.of([x0, PLAZA_Y, zf], [1, 0, 0]);
  // The body's two visible walls are built below, with their openings cut out.
  box(kit.plaster.color(BOARDS), side, 0, base, -Wk, L, eave, 0, BACK | RIGHT | TOP);
  box(kit.stone.color(0xd9d0c0), side, -0.04, -0.2, -Wk - 0.04, L + 0.04, base, 0.04, NO_BOTTOM);

  // Side wall: a sash window, the door, a life ring between them.
  const sideWindow = windowUnit(kit, side, {
    u0: 0.55, v0: 1.0, w: 0.8, h: 1.1, depth: 0.12, wall: TRIM, surround: null, cap: false, sill: false,
    french: false, frame: TRIM, panes: [GLASS], shutters: 'none', shutter: TRIM, louvred: false, ajarAngle: 0, grille: false,
  });
  const doorHole: Hole = { u0: 2.35, u1: 3.15, v0: base, v1: 2.25 };
  reveal(kit.plaster.color(TRIM), side, doorHole, 0.1, LEFT | RIGHT | TOP);
  const dp = kit.paint.color(0x34505e);
  box(dp, side, doorHole.u0, base, -0.1, doorHole.u1, doorHole.v1, -0.06, FRONT);
  for (const [va, vb] of [
    [base + 0.12, base + 0.9],
    [base + 1.02, 2.12],
  ] as const) {
    for (const [ua, ub] of [
      [2.42, 2.72],
      [2.78, 3.08],
    ] as const) {
      box(dp, side, ua, va, -0.06, ub, vb, -0.042, NO_BACK);
    }
  }
  box(kit.metal.color(0xb8913e), side, 2.45, 1.05, -0.06, 2.49, 1.1, -0.01, NO_BACK);
  wallFace(kit.plaster.color(BOARDS), side, 0, L, base, eave, [sideWindow, doorHole]);
  const sideSkips = [casing(kit, side, sideWindow, true), casing(kit, side, doorHole, false)];
  clapboards(kit, side, base, eave - 0.18, () => [0.12, L - 0.12], sideSkips, BOARDS);
  torus(kit.cloth, side.p(1.85, 1.62, 0.09), side.n, 0.25, 0.055, 16, 6, (i) => (Math.floor(i / 2) % 2 === 0 ? 0xc23b2e : 0xf2f2ee));
  box(kit.metal.color(0x2b2b2b), side, 1.83, 1.9, 0, 1.87, 1.95, 0.1, NO_BACK);

  // Gable end: the serving hatch with its counter and propped flap, an attic window.
  const hatch: Hole = { u0: 0.65, u1: 2.15, v0: 0.95, v1: 1.9 };
  reveal(kit.plaster.color(TRIM), front, hatch, 0.35, ALL);
  kit.paint.color(0x2a2622).quad(front.p(hatch.u0, hatch.v0, -0.35), front.p(hatch.u1, hatch.v0, -0.35), front.p(hatch.u1, hatch.v1, -0.35), front.p(hatch.u0, hatch.v1, -0.35));
  const counter = kit.wood.color(0xa77b52);
  box(counter, front, 0.55, 0.9, -0.3, 2.25, 0.96, 0.32, NO_BACK);
  for (const u of [0.75, 2.05]) beam(counter, front.p(u, 0.58, 0.02), front.p(u, 0.9, 0.26), 0.045, 0.045, front.t);
  const angle = 1.95;
  const lift: [number, number, number] = [0, -Math.cos(angle), Math.sin(angle)];
  const flap = Frame.of(front.p(0.6, 2.0, 0.05), front.t, front.v(...lift));
  box(kit.paint.color(TRIM), flap, 0, 0, -0.02, 1.6, 0.95, 0.02, ALL);
  for (const u of [0.7, 2.1]) beam(counter, front.p(u, 0.96, 0.28), flap.p(u - 0.6, 0.93, 0), 0.03, 0.03);
  const attic = windowUnit(kit, front, {
    u0: 1.15, v0: 3.12, w: 0.5, h: 0.45, depth: 0.1, wall: TRIM, surround: null, cap: false, sill: false,
    french: false, frame: TRIM, panes: [GLASS], shutters: 'none', shutter: TRIM, louvred: false, ajarAngle: 0, grille: false,
  });
  wallFace(kit.plaster.color(BOARDS), front, 0, Wk, base, eave, [hatch]);
  gableWall(kit.plaster, front, Wk, eave, (rise * 0.3) / (0.3 + Wk / 2), eave + rise, attic);
  const gableSkips = [casing(kit, front, hatch, true), casing(kit, front, attic, false)];
  const gable = (v: number): readonly [number, number] => {
    if (v <= eave) return [0.12, Wk - 0.12];
    const inset = ((v - eave) / rise) * (Wk / 2) + 0.14;
    return [inset, Wk - inset];
  };
  clapboards(kit, front, base, eave + rise - 0.2, gable, gableSkips, BOARDS);

  // Corner boards, the frieze under the eaves, rake boards up the gable.
  const trim = kit.paint.color(TRIM);
  box(trim, side, -0.045, base, 0, 0.12, eave, 0.045, FRONT | LEFT | RIGHT);
  box(trim, side, L - 0.12, base, 0, L, eave, 0.045, FRONT | LEFT | RIGHT);
  box(trim, front, 0, base, 0, 0.12, eave, 0.045, FRONT | LEFT | RIGHT);
  box(trim, front, Wk - 0.12, base, 0, Wk, eave, 0.045, FRONT | LEFT | RIGHT);
  box(trim, side, 0, eave - 0.18, 0, L, eave, 0.04, FRONT | BOTTOM);
  beam(trim, front.p(-0.06, eave - 0.06, 0.03), front.p(Wk / 2, eave + rise - 0.06, 0.03), 0.17, 0.05, front.n);
  beam(trim, front.p(Wk / 2, eave + rise - 0.06, 0.03), front.p(Wk + 0.06, eave - 0.06, 0.03), 0.17, 0.05, front.n);
  gableRoof(kit, side, {
    width: L, depth: Wk, top: eave, rise, front: 0.3, back: 0.3, vergeLeft: 0.25, vergeRight: 0.25,
    tile: SHINGLES, soffit: TRIM, wall: BOARDS, gutter: null, openLeftGable: true,
  });
  const iron = kit.metal.color(0x2b2b2b);
  tube(iron, side.p(2.7, eave + rise - 0.6, -Wk / 2 + 0.45), side.p(2.7, eave + rise + 0.75, -Wk / 2 + 0.45), 0.07, 8);
  prism(iron, side, 2.7, -Wk / 2 + 0.45, eave + rise + 0.75, eave + rise + 0.9, 0.16, 0.02, 8, { bottom: true });
  const crates = kit.wood.color(0xb38b5d);
  openBox(crates, side, 0.18, 0, 0.12, 0.74, 0.34, 0.52, 0.02);
  openBox(crates, side, 0.22, 0.34, 0.14, 0.7, 0.66, 0.5, 0.02);
}

// --- American clapboard houses -------------------------------------------------

/**
 * A two- or three-storey clapboard house with its gable to the street: sash
 * windows in white casings, corner boards, rake boards, a shingle roof and a
 * front porch on posts with a low roof and steps.
 */
function americanHouse(kit: Kit, f: Frame, o: { width: number; storeys: number; boards: number; door: number }): void {
  const W = o.width;
  const D = 7;
  const base = 0.45;
  const storey = 2.9;
  const eave = base + o.storeys * storey;
  const rise = 2.4;
  const side = Frame.of(f.p(W, 0, 0), [-f.n[0], -f.n[1], -f.n[2]]);
  box(kit.plaster.color(o.boards), side, 0, base, -W, D, eave, 0, BACK | RIGHT | TOP);
  box(kit.stone.color(0xd9d0c0), side, -0.04, -0.2, -W - 0.04, D + 0.04, base, 0.04, NO_BOTTOM);

  const sash = (u0: number, v0: number, w: number, h: number): Hole =>
    windowUnit(kit, f, {
      u0, v0, w, h, depth: 0.12, wall: TRIM, surround: null, cap: false, sill: false,
      french: false, frame: TRIM, panes: [GLASS], shutters: 'none', shutter: TRIM, louvred: false, ajarAngle: 0, grille: false,
    });
  const door: Hole = { u0: W / 2 - 0.5, u1: W / 2 + 0.5, v0: base, v1: base + 2.15 };
  reveal(kit.plaster.color(TRIM), f, door, 0.1, LEFT | RIGHT | TOP);
  box(kit.paint.color(o.door), f, door.u0, base, -0.1, door.u1, door.v1, -0.06, FRONT);
  const holes: Hole[] = [door, sash(0.7, base + 0.8, 0.9, 1.35), sash(W - 1.6, base + 0.8, 0.9, 1.35)];
  for (let s = 1; s < o.storeys; s += 1) {
    const v = base + s * storey + 0.75;
    holes.push(sash(0.85, v, 0.85, 1.3), sash(W / 2 - 0.42, v, 0.85, 1.3), sash(W - 1.7, v, 0.85, 1.3));
  }
  const attic = sash(W / 2 - 0.35, eave + 0.5, 0.7, 0.75);
  wallFace(kit.plaster.color(o.boards), f, 0, W, base, eave, holes);
  gableWall(kit.plaster, f, W, eave, (rise * 0.35) / (0.35 + W / 2), eave + rise, attic);
  const skips = [...holes.map((h, i) => casing(kit, f, h, i !== 0)), casing(kit, f, attic, false)];
  const gable = (v: number): readonly [number, number] => {
    if (v <= eave) return [0.12, W - 0.12];
    const inset = ((v - eave) / rise) * (W / 2) + 0.14;
    return [inset, W - inset];
  };
  clapboards(kit, f, base, eave + rise - 0.2, gable, skips, o.boards);

  const trim = kit.paint.color(TRIM);
  box(trim, f, 0, base, 0, 0.14, eave, 0.045, FRONT | LEFT | RIGHT);
  box(trim, f, W - 0.14, base, 0, W, eave, 0.045, FRONT | LEFT | RIGHT);
  beam(trim, f.p(-0.06, eave - 0.06, 0.03), f.p(W / 2, eave + rise - 0.06, 0.03), 0.17, 0.05, f.n);
  beam(trim, f.p(W / 2, eave + rise - 0.06, 0.03), f.p(W + 0.06, eave - 0.06, 0.03), 0.17, 0.05, f.n);
  gableRoof(kit, side, {
    width: D, depth: W, top: eave, rise, front: 0.3, back: 0.3, vergeLeft: 0.35, vergeRight: 0.25,
    tile: SHINGLES, soffit: TRIM, wall: o.boards, gutter: null, openLeftGable: true,
  });

  // The porch: deck, steps, four posts, a low roof and a simple rail.
  const deck = kit.wood.color(0xa98a68);
  box(deck, f, -0.1, base - 0.12, 0, W + 0.1, base, 1.8, NO_BOTTOM);
  box(deck, f, W / 2 - 0.8, 0, 1.8, W / 2 + 0.8, base * 0.5, 2.2, NO_BOTTOM);
  for (const u of [0.1, W / 2 - 0.85, W / 2 + 0.85, W - 0.1]) {
    box(trim, f, u - 0.07, base, 1.62, u + 0.07, base + 2.55, 1.76, NO_BOTTOM);
  }
  box(kit.roof.color(SHINGLES), f, -0.2, base + 2.55, 0, W + 0.2, base + 2.7, 2.0, ALL);
  for (const [u0, u1] of [[0.1, W / 2 - 0.85], [W / 2 + 0.85, W - 0.1]] as const) {
    box(trim, f, u0, base + 0.85, 1.66, u1, base + 0.93, 1.72, NO_BOTTOM);
  }
}

// --- streets, quay and furniture ----------------------------------------------

/** Cobbled square and alley, stone slabs along the house fronts, the coast road and its quay. */
function streets(kit: Kit): void {
  const pv = kit.paving.color(PAVING);
  box(pv, WORLD, -21, PLAZA_Y - 1, ROW_FRONT - 0.4, MARKET_FRONT + 1, PLAZA_Y, -0.6, NO_BOTTOM);
  box(pv, WORLD, 26, PLAZA_Y - 1, NEAR_EDGE_Z, MARKET_FRONT + 0.2, PLAZA_Y, ROW_FRONT - 0.4, NO_BOTTOM);
  pv.color(ROAD);
  box(pv, WORLD, -25, PLAZA_Y - 0.6, NEAR_EDGE_Z, -21.2, PLAZA_Y - 0.3, 20, NO_BOTTOM);
  const st = kit.stone.color(ROCK);
  box(st, WORLD, -29, PLAZA_Y - 1.4, NEAR_EDGE_Z, -25, PLAZA_Y - 0.3, 20, NO_BOTTOM);
  st.color(0xe2d9c8);
  box(st, WORLD, -29.05, PLAZA_Y - 0.3, NEAR_EDGE_Z, -28.55, PLAZA_Y - 0.16, 20, NO_BOTTOM);
  st.color(0xece4d6);
  box(st, WORLD, -21.2, PLAZA_Y - 0.62, NEAR_EDGE_Z, -21, PLAZA_Y + 0.015, -0.6, NO_BOTTOM);
  st.color(SLABS);
  box(st, WORLD, -21, PLAZA_Y - 0.3, ROW_FRONT - 0.4, 26, PLAZA_Y + 0.015, ROW_FRONT + 1.0, NO_BOTTOM);
  box(st, WORLD, MARKET_FRONT - 1.2, PLAZA_Y - 0.3, -26, MARKET_FRONT + 1, PLAZA_Y + 0.015, -0.6, NO_BOTTOM);
  const iron = kit.metal.color(0x2a2a2a);
  for (const z of [-32, -24, -16, -8]) {
    const f = WORLD.at(-28.1, PLAZA_Y - 0.3, z);
    prism(iron, f, 0, 0, 0, 0.42, 0.17, 0.13, 10, { smooth: true });
    prism(iron, f, 0, 0, 0.42, 0.5, 0.21, 0.21, 10, { top: true });
  }
}

/** A bicycle leaning on a wall: its wheels 0.5 m out, its top tipped back to the wall. */
function leaning(wall: Frame, u: number, facingLeft: boolean): Frame {
  const lean = 0.2;
  return facingLeft ? wall.turned(u, 0, 0.5, Math.PI).rolled(lean) : wall.at(u, 0, 0.5).rolled(-lean);
}

function furnish(kit: Kit): void {
  fountain(kit, 4, -14);
  bench(kit, WORLD.turned(-0.8, PLAZA_Y, -14, Math.PI / 2));
  bench(kit, WORLD.turned(8.8, PLAZA_Y, -14, -Math.PI / 2));
  streetLamp(kit, -6, -19);
  streetLamp(kit, 14, -19);
  streetLamp(kit, -16.5, -13.5);
  // The cafe in front of the green awning (second house of the row).
  cafeTable(kit, -14.3, -24.5);
  cafeTable(kit, -12.3, -24.1);
  cafeChair(kit, WORLD.turned(-14.85, PLAZA_Y, -24.5, Math.PI / 2));
  cafeChair(kit, WORLD.turned(-14.3, PLAZA_Y, -23.95, Math.PI));
  cafeChair(kit, WORLD.turned(-11.75, PLAZA_Y, -24.1, -Math.PI / 2));
  cafeChair(kit, WORLD.turned(-12.4, PLAZA_Y, -24.65, 0.15));
  parasol(kit, -13.3, -23.6, [0xefe7d4, 0x3e6a4c]);
  // Two bicycles against house walls and an old moped on its stand.
  bicycle(kit, leaning(Frame.of([14.0, PLAZA_Y, ROW_FRONT - 0.3], [1, 0, 0]), 2.85, false), { frame: 0x2f5f4a, guards: 0xefe7d2 });
  bicycle(kit, leaning(Frame.of([19.8, PLAZA_Y, ROW_FRONT], [1, 0, 0]), 3.95, true), { frame: 0x6a2a2a, guards: 0x1d1d1d });
  moped(kit, WORLD.turned(28.3, PLAZA_Y, -11.4, -2.62), 0x9cbfae);
}

// --- assembly ------------------------------------------------------------------

/** Builds a street of attached houses; roofs overhang only past a clearly lower neighbour. */
/** One house in a street: an Italian palazzo, a Turkish house or an American clapboard house. */
type Lot =
  | { kind: 'italian'; house: HouseSpec }
  | { kind: 'turkish' }
  | { kind: 'american'; width: number; storeys: number; boards: number; door: number };

const TURKISH_WIDTH = 6.2;

function lotWidth(lot: Lot): number {
  return lot.kind === 'italian' ? lot.house.width : lot.kind === 'turkish' ? TURKISH_WIDTH : lot.width;
}

/**
 * Builds a street of mixed lots from `start` along the frame's tangent and
 * returns Tessa's window if it is on this street. An Italian roof keeps its
 * verge overhang wherever the neighbour is lower or of another kind.
 */
function street(kit: Kit, lots: readonly Lot[], frameAt: (u: number) => Frame, start: number, random: () => number): Vector3 | null {
  let u = start;
  let tessa: Vector3 | null = null;
  lots.forEach((lot, i) => {
    if (lot.kind === 'italian') {
      const top = houseTop(lot.house);
      const verge = (next: Lot | undefined) =>
        next == null || next.kind !== 'italian' || houseTop(next.house) < top - 1 ? 0.22 : 0;
      const spot = italianHouse(kit, frameAt(u), { ...lot.house, vergeLeft: verge(lots[i - 1]), vergeRight: verge(lots[i + 1]) }, random);
      if (spot) tessa = new Vector3(spot[0], spot[1], spot[2]);
    } else if (lot.kind === 'turkish') {
      turkishHouse(kit, frameAt(u), random);
    } else {
      americanHouse(kit, frameAt(u), lot);
    }
    u += lotWidth(lot);
  });
  return tessa;
}

/**
 * The square is where the three quarters meet, so its two streets mix them:
 * Italian palazzi, whitewashed Turkish houses with cumbas, and American
 * clapboard houses with porches, each house true to its own kind.
 */
const ROW_LOTS: readonly Lot[] = [
  { kind: 'american', width: 6.0, storeys: 2, boards: 0xeef0ee, door: 0x34505e },
  { kind: 'italian', house: ROW[0] },
  { kind: 'turkish' },
  { kind: 'italian', house: ROW[3] },
  { kind: 'italian', house: ROW[2] },
  { kind: 'american', width: 5.8, storeys: 2, boards: BOARDS, door: 0x6b2f2a },
  { kind: 'italian', house: ROW[5] },
  { kind: 'turkish' },
];

const MARKET_LOTS: readonly Lot[] = [
  { kind: 'italian', house: MARKET[0] },
  { kind: 'american', width: 5.6, storeys: 2, boards: 0xc9cdd0, door: 0x2f4433 },
  { kind: 'turkish' },
  { kind: 'italian', house: MARKET[3] },
];

export function createTown(seed = 7): TownParts {
  const kit = createKit();
  const random = seededRandom(seed);
  streets(kit);
  const rowAt = (x: number) => Frame.of([x, PLAZA_Y, ROW_FRONT], [1, 0, 0]);
  const marketAt = (z: number) => Frame.of([MARKET_FRONT, PLAZA_Y, z], [0, 0, 1]);
  const tessa = street(kit, ROW_LOTS, rowAt, -21, random) ?? new Vector3(-2, PLAZA_Y + 5.4, ROW_FRONT + 0.02);
  street(kit, MARKET_LOTS, marketAt, -26, random);
  kiosk(kit);
  furnish(kit);

  const parts: Array<[PartBuilder, Material, string]> = [
    [kit.plaster, scanned('painted_plaster_wall'), 'TownWalls'],
    [kit.roof, scanned('roof_09'), 'TownRoofs'],
    [kit.paving, scanned('cobblestone_floor_08'), 'TownPaving'],
    [kit.stone, scanned('large_sandstone_blocks_01'), 'TownStone'],
    [kit.wood, scanned('wood_shutter'), 'TownWood'],
    [kit.paint, plain(0.55), 'TownPaint'],
    [kit.metal, plain(0.4, 0.8), 'TownIron'],
    [kit.glass, plain(0.12), 'TownGlass'],
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
  town.userData.triangles = triangles;
  return { town, tessaWindow: tessa };
}
