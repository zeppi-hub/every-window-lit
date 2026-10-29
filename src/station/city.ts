import {
  ALL,
  BACK,
  balcony,
  band,
  beam,
  BOTTOM,
  box,
  cornice,
  CURTAIN,
  doorway,
  flowerBox,
  FRONT,
  Frame,
  GLASS,
  type Hole,
  type Kit,
  LEFT,
  NO_BACK,
  NO_BOTTOM,
  type PartBuilder,
  PORTAL_STONE,
  prism,
  reveal,
  RIGHT,
  shopFront,
  STRIP,
  TOP,
  torus,
  type V3,
  wallFace,
  type WindowSpec,
  windowUnit,
} from './facade.js';

/**
 * The buildings of Ombrisa as an interwar business capital: New York first,
 * with Milan, Istanbul and Ankara mixed in, all from the 1920s and 1930s
 * when the four cities built in the same spirit.
 *
 * - brownstone: a New York row house on a stoop, under a bracketed cornice;
 * - loft: a cast-iron front of columns and big windows (SoHo, or Milan's
 *   industrial blocks), with a fire escape and a water tower on the roof;
 * - walkUp: a brick walk-up over shops, stone lintels, pressed-metal cornice;
 * - deco: an Art Deco office block, piers running up between the windows,
 *   bronze doors, two setbacks and a stepped crown (no spire);
 * - pera: an Istanbul apartment of cut stone with a closed stone bay (cumba)
 *   on corbels and iron balconettes;
 * - liberty: a Milan Liberty-style apartment in stucco over a rusticated
 *   base, with wrought-iron balconies and louvred shutters;
 * - republic: an early Republican block from Ankara, faced in pinkish stone,
 *   with tall windows in strips, a recessed top floor and a thin roof slab.
 *
 * Each returns a Lot: its width along the street and a function that builds
 * it into the town kit at a frame on the street line (u along the street, v
 * up from the pavement, z out towards the square; the body runs back to -z).
 * A free end (a street corner, the end of a row) gets a rounded corner pier.
 * No lettering, brands, flags or real buildings: these are types, not copies.
 */

export interface Ends {
  left: boolean;
  right: boolean;
}

export type Build = (kit: Kit, f: Frame, ends: Ends, random: () => number) => V3 | null;

export interface Lot {
  width: number;
  build: Build;
}

const SASH = 0xf1ece2;
const DARK_SASH = 0x2e3330;
const BRONZE = 0x7a5e3a;
const ROOF_TAR = 0x5e5a55;
const FIRE_ESCAPE = 0x25282a;
const SHOP_FRAME = 0x2f3a35;
const GRANITE = 0x4a4848;

/** Glass in a lit or curtained room now and then, so the facades are not all one dark pane. */
function panes(random: () => number): number[] {
  const roll = random();
  if (roll < 0.15) return [CURTAIN, CURTAIN, GLASS, GLASS, GLASS, GLASS];
  if (roll < 0.25) return [0x6f675c, 0x6f675c, 0x6f675c, 0x6f675c, GLASS, GLASS];
  return [GLASS, 0x232b31, GLASS, 0x1e262c, GLASS, GLASS];
}

/** A sash or casement window with a plain reveal; options override the defaults. */
function sash(u0: number, v0: number, w: number, h: number, wall: number, o: Partial<WindowSpec> = {}): WindowSpec {
  return {
    u0,
    v0,
    w,
    h,
    depth: 0.22,
    wall,
    surround: null,
    cap: false,
    sill: true,
    french: false,
    frame: SASH,
    panes: [GLASS],
    shutters: 'none',
    shutter: 0x4f5d47,
    louvred: true,
    ajarAngle: 1.2,
    grille: false,
    ...o,
  };
}

/** Builds with `b` at a temporary edge radius, then restores the builder's own. */
function withRound(b: PartBuilder, radius: number, draw: () => void): void {
  const own = b.round;
  b.round = radius;
  draw();
  b.round = own;
}

/**
 * The volume behind a facade: party walls, back wall and a flat tarred roof.
 * The front is left open for the facade itself.
 */
function body(kit: Kit, walls: PartBuilder, tint: number, f: Frame, W: number, D: number, H: number): void {
  box(walls.color(tint), f, 0, -2, -D, W, H, 0, BACK | LEFT | RIGHT);
  box(kit.concrete.color(ROOF_TAR), f, 0, H - 0.25, -D, W, H, 0, TOP);
}

/**
 * Rounded piers at the free corners of a facade: wrapped round the corner
 * and a few centimetres proud of both faces, so the corner reads as one
 * rounded block from the street.
 */
function cornerPiers(
  b: PartBuilder,
  tint: number,
  f: Frame,
  W: number,
  ends: Ends,
  v0: number,
  v1: number,
  radius = 0.14,
): void {
  const w = 0.55;
  const proud = 0.1;
  withRound(b, radius, () => {
    if (ends.left) box(b.color(tint), f, -proud, v0, -0.9, w, v1, proud, FRONT | LEFT | RIGHT | TOP);
    if (ends.right) box(b.color(tint), f, W - w, v0, -0.9, W + proud, v1, proud, FRONT | LEFT | RIGHT | TOP);
  });
}

/** A projecting cornice on a frieze, carried on brackets: brownstones, walk-ups, lofts. */
function bracketCornice(b: PartBuilder, tint: number, f: Frame, W: number, top: number, out = 0.55): void {
  box(b.color(tint), f, -0.05, top - 0.55, 0, W + 0.05, top - 0.15, 0.12, NO_BACK);
  box(b, f, -0.1, top - 0.15, 0, W + 0.1, top + 0.12, out, NO_BACK);
  box(b, f, -0.14, top + 0.12, 0, W + 0.14, top + 0.24, out + 0.06, NO_BACK);
  const n = Math.max(2, Math.round(W / 0.5));
  for (let i = 0; i <= n; i += 1) {
    const u = 0.1 + ((W - 0.2) * i) / n;
    box(b, f, u - 0.06, top - 0.5, 0.12, u + 0.06, top - 0.15, out - 0.05, NO_BACK);
  }
}

/** Lintel and sill in stone round a window hole: the walk-ups' and lofts' brick openings. */
function lintel(b: PartBuilder, tint: number, f: Frame, h: Hole, keystone: boolean): void {
  box(b.color(tint), f, h.u0 - 0.12, h.v1, 0, h.u1 + 0.12, h.v1 + 0.26, 0.05, NO_BACK);
  if (keystone) box(b, f, (h.u0 + h.u1) / 2 - 0.12, h.v1 - 0.05, 0, (h.u0 + h.u1) / 2 + 0.12, h.v1 + 0.34, 0.09, NO_BACK);
}

// --- New York -------------------------------------------------------------------

export interface BrownstoneSpec {
  width: number;
  stone: number;
  trim: number;
  door: number;
  /** The stoop climbs on the left (u near 0) or the right. */
  stoopLeft: boolean;
}

/**
 * A brownstone row house: a garden floor half below the stoop, the parlour
 * floor up a flight of stone steps behind iron railings, two floors above
 * and a bracketed cornice. Deep enough (14 m) to back onto the next street.
 */
export function brownstone(s: BrownstoneSpec): Lot {
  return {
    width: s.width,
    build: (kit, f, ends, random) => {
      const W = s.width;
      const D = 14;
      const parlour = 1.6;
      const floors = [parlour, parlour + 3.6, parlour + 6.7];
      const H = parlour + 9.8;
      const st = kit.stone;
      body(kit, kit.brick, 0x8a5a48, f, W, D, H);
      const holes: Hole[] = [];
      const su = s.stoopLeft ? 0.3 : W - 1.9;
      // Parlour door at the head of the stoop, in a carved surround with a hood.
      const door = doorway(kit, f.at(0, parlour, 0), {
        u0: su + 0.1, w: 1.4, h: 2.75, depth: 0.32, colour: s.door,
        wood: true, fanlight: true, portal: 'classic', stone: s.trim,
      });
      holes.push({ u0: door.u0, u1: door.u1, v0: parlour, v1: parlour + door.v1 });
      // Parlour windows: tall, under stone hoods; garden windows behind bars.
      const free = s.stoopLeft ? [su + 2.0, W - 0.3] : [0.3, su - 0.1];
      const span = free[1] - free[0];
      const cols = span > 2.6 ? 2 : 1;
      for (let c = 0; c < cols; c += 1) {
        const uc = free[0] + (span * (c + 0.5)) / cols;
        holes.push(windowUnit(kit, f, sash(uc - 0.5, parlour + 0.75, 1.0, 2.45, s.stone, { surround: s.trim, cap: true, panes: panes(random), depth: 0.28 })));
        holes.push(windowUnit(kit, f, sash(uc - 0.45, 0.35, 0.9, 1.0, s.stone, { grille: true, depth: 0.25 })));
      }
      for (const v of floors.slice(1)) {
        for (let c = 0; c < 3; c += 1) {
          const uc = 0.55 + ((W - 1.1) * (c + 0.5)) / 3;
          holes.push(windowUnit(kit, f, sash(uc - 0.45, v + 0.8, 0.9, 1.8, s.stone, { surround: s.trim, cap: v === floors[1], panes: panes(random) })));
        }
      }
      // Brownstone reads smooth and brown: tinted stucco, with the cut-stone scan only below.
      wallFace(kit.plaster.color(s.stone), f, 0, W, parlour - 0.1, H, holes);
      wallFace(st.color(s.stone), f, 0, W, -0.3, parlour - 0.1, holes);
      // A rusticated garden floor and a string course at the parlour floor.
      band(st.color(s.stone, 0.88), f, 0, W, -0.25, parlour - 0.15, 0.06, holes, STRIP);
      band(st.color(s.trim), f, 0, W, parlour - 0.15, parlour + 0.05, 0.1, [], ALL & ~BACK);
      cornerPiers(kit.plaster, s.stone, f, W, ends, -0.25, H);
      stoop(kit, f, su, 1.6, parlour, s.stone);
      bracketCornice(kit.paint, 0x3a3430, f, W, H);
      // The areaway railing between the stoop and the next house.
      const [ra, rb] = s.stoopLeft ? [su + 1.75, W - 0.05] : [0.05, su - 0.15];
      railing(kit, f, ra, rb, 1.25, 0, 1.0);
      return null;
    },
  };
}

/** Stone steps up to a raised door, between stepped cheek walls with iron rails. */
function stoop(kit: Kit, f: Frame, u0: number, w: number, height: number, tint: number): void {
  const steps = 8;
  const rise = height / steps;
  const run = 0.28;
  const landing = 1.0;
  const st = kit.stone.color(tint, 0.92);
  box(st, f, u0, height - 0.2, 0, u0 + w, height, landing, NO_BACK & ~BOTTOM);
  for (let i = 0; i < steps; i += 1) {
    const z0 = landing + i * run;
    const top = height - (i + 1) * rise;
    box(st, f, u0, -0.2, z0, u0 + w, top, z0 + run, FRONT | TOP | LEFT | RIGHT);
  }
  const end = landing + steps * run;
  const m = kit.metal.color(0x1f2224);
  for (const side of [u0 - 0.04, u0 + w + 0.04]) {
    // Newel post at the foot, a sloping rail and balusters.
    box(kit.stone.color(tint, 0.85), f, side - 0.16, -0.2, end - 0.3, side + 0.16, 1.05, end + 0.02, NO_BOTTOM);
    beam(m, f.p(side, 1.05, end - 0.15), f.p(side, height + 0.95, 0.1), 0.05, 0.05);
    for (let k = 0; k <= 7; k += 1) {
      const t = k / 7;
      const z = end - 0.15 - (end - 0.25) * t;
      const top = 1.05 + (height - 0.1) * t;
      const base = Math.max(0, height - (Math.floor((z - landing) / run) + 1) * rise);
      if (top - base > 0.1) box(m, f, side - 0.012, base, z - 0.012, side + 0.012, top, z + 0.012, ALL);
    }
  }
}

/** A low iron railing along the street line, posts and two rails. */
function railing(kit: Kit, f: Frame, u0: number, u1: number, z: number, v0: number, h: number): void {
  if (u1 - u0 < 0.3) return;
  const m = kit.metal.color(0x1f2224);
  box(m, f, u0, v0 + h - 0.04, z - 0.025, u1, v0 + h, z + 0.025, ALL);
  box(m, f, u0, v0 + 0.12, z - 0.02, u1, v0 + 0.16, z + 0.02, ALL);
  const n = Math.max(1, Math.round((u1 - u0) / 0.14));
  for (let i = 0; i <= n; i += 1) {
    const u = u0 + ((u1 - u0) * i) / n;
    box(m, f, u - 0.01, v0, z - 0.01, u + 0.01, v0 + h - 0.04, z + 0.01, ALL);
  }
}

export interface LoftSpec {
  width: number;
  floors: number;
  paint: number;
  fireEscape: boolean;
  waterTower: boolean;
  awning: readonly [number, number] | null;
}

/**
 * A cast-iron loft: painted columns and entablatures framing big windows
 * on every floor, shop windows between the ground-floor columns, a deep
 * bracketed cornice; maybe a fire escape and a water tower.
 */
export function loft(s: LoftSpec): Lot {
  return {
    width: s.width,
    build: (kit, f, ends, random) => {
      const W = s.width;
      const D = 18;
      const ground = 4.6;
      const storey = 3.7;
      const H = ground + s.floors * storey;
      body(kit, kit.brick, 0x9c6b52, f, W, D, H);
      const bays = Math.max(2, Math.round(W / 2.1));
      const pitch = W / bays;
      const p = kit.paint;
      const holes: Hole[] = [];
      // The ground floor: shop windows between the columns, one bay a door.
      const shop = shopFront(kit, f, {
        u0: 0.32, w: W - 0.64, h: 3.7, depth: 0.45, wall: s.paint, frame: SHOP_FRAME, awning: s.awning, door: 'middle',
      });
      holes.push(shop);
      for (let fl = 0; fl < s.floors; fl += 1) {
        const v = ground + fl * storey;
        for (let b = 0; b < bays; b += 1) {
          const uc = pitch * (b + 0.5);
          holes.push(windowUnit(kit, f, sash(uc - pitch / 2 + 0.3, v + 0.55, pitch - 0.6, 2.75, s.paint, { panes: panes(random), depth: 0.2, sill: false, frame: 0x30332f })));
        }
      }
      wallFace(p.color(s.paint), f, 0, W, -0.3, H, holes);
      // Columns with capitals and bases between the bays, entablatures at the floors.
      for (let fl = 0; fl < s.floors; fl += 1) {
        const v = ground + fl * storey;
        box(p.color(s.paint, 0.95), f, -0.04, v - 0.3, 0, W + 0.04, v + 0.08, 0.16, NO_BACK);
        for (let b = 0; b <= bays; b += 1) {
          const u = b * pitch;
          const c = Frame.of(f.p(u, v + 0.08, 0.08), f.t, f.up);
          prism(p.color(s.paint), c, 0, 0, 0, storey - 0.62, 0.13, 0.12, 12, { smooth: true });
          box(p, f, u - 0.2, v + storey - 0.62, 0, u + 0.2, v + storey - 0.38, 0.2, NO_BACK);
          box(p, f, u - 0.17, v + 0.08, 0, u + 0.17, v + 0.3, 0.19, NO_BACK);
        }
      }
      cornerPiers(p, s.paint, f, W, ends, -0.25, H, 0.1);
      bracketCornice(p, s.paint, f, W, H, 0.75);
      if (s.fireEscape) fireEscape(kit, f, pitch * 0.5 - 0.1, pitch * 2.5 - 0.5, ground, storey, s.floors);
      if (s.waterTower) waterTower(kit, f, W * 0.62, -D * 0.45, H, 1.5);
      return null;
    },
  };
}

export interface WalkUpSpec {
  width: number;
  floors: number;
  brick: number;
  stone: number;
  cornice: number;
  fireEscape: boolean;
  waterTower: boolean;
  /** Two-colour cloth awnings over the shops, or null. */
  awning: readonly [number, number] | null;
}

/**
 * A brick walk-up: two shops either side of the stair door on the street,
 * four to five floors of windows with stone lintels and sills, a pressed-
 * metal cornice; the fire escape zigzags down the middle bays.
 */
export function walkUp(s: WalkUpSpec): Lot {
  return {
    width: s.width,
    build: (kit, f, ends, random) => {
      const W = s.width;
      const D = 16;
      const ground = 4.2;
      const storey = 3.2;
      const H = ground + s.floors * storey;
      body(kit, kit.brick, s.brick, f, W, D, H);
      const holes: Hole[] = [];
      const doorW = 1.3;
      const du = W / 2 - doorW / 2;
      const door = doorway(kit, f, {
        u0: du, w: doorW, h: 2.8, depth: 0.3, colour: 0x2c3530, wood: false, fanlight: true, portal: 'plain', stone: s.stone,
      });
      holes.push(door);
      const shops = [
        { u0: 0.35, w: du - 0.75 },
        { u0: du + doorW + 0.4, w: W - (du + doorW + 0.4) - 0.35 },
      ];
      for (const shop of shops) {
        if (shop.w < 1.2) continue;
        holes.push(shopFront(kit, f, { u0: shop.u0, w: shop.w, h: 3.0, depth: 0.32, wall: s.brick, frame: SHOP_FRAME, awning: s.awning, door: 'left' }));
      }
      const bays = Math.max(3, Math.round(W / 1.85));
      const windows: Hole[] = [];
      for (let fl = 0; fl < s.floors; fl += 1) {
        const v = ground + fl * storey;
        for (let b = 0; b < bays; b += 1) {
          const uc = 0.5 + ((W - 1.0) * (b + 0.5)) / bays;
          const h = windowUnit(kit, f, sash(uc - 0.45, v + 0.85, 0.9, 1.75, s.stone, { panes: panes(random), depth: 0.2 }));
          holes.push(h);
          windows.push(h);
        }
      }
      wallFace(kit.brick.color(s.brick), f, 0, W, -0.3, H, holes);
      for (const h of windows) lintel(kit.limestone, s.stone, f, h, false);
      band(kit.limestone.color(s.stone), f, 0, W, ground - 0.35, ground - 0.05, 0.08, [], ALL & ~BACK);
      cornerPiers(kit.brick, s.brick, f, W, ends, -0.25, H, 0.1);
      bracketCornice(kit.paint, s.cornice, f, W, H, 0.6);
      if (s.fireEscape) {
        const span = (W - 1.0) / bays;
        fireEscape(kit, f, 0.5 + span * Math.floor((bays - 2) / 2) + 0.05, 0.5 + span * (Math.floor((bays - 2) / 2) + 2) - 0.05, ground, storey, s.floors);
      }
      if (s.waterTower) waterTower(kit, f, W * 0.35, -D * 0.5, H, 1.35);
      return null;
    },
  };
}

/**
 * A fire escape over two bays: a grated platform with railings at each
 * floor from the second up, stairs zigzagging between them and a drop
 * ladder hanging over the street from the lowest one.
 */
function fireEscape(kit: Kit, f: Frame, u0: number, u1: number, ground: number, storey: number, floors: number): void {
  const m = kit.metal.color(FIRE_ESCAPE);
  const depth = 1.1;
  for (let fl = 0; fl < floors; fl += 1) {
    const v = ground + fl * storey + 0.6;
    box(m, f, u0, v - 0.05, 0.02, u1, v, depth, ALL);
    // Top rail, mid rail and balusters along the front and the two ends.
    box(m, f, u0, v + 0.95, depth - 0.03, u1, v + 1.0, depth + 0.02, ALL);
    box(m, f, u0, v + 0.45, depth - 0.02, u1, v + 0.48, depth + 0.01, ALL);
    for (const u of [u0, u1]) box(m, f, u - 0.025, v + 0.95, 0.02, u + 0.025, v + 1.0, depth, ALL);
    const n = Math.round((u1 - u0) / 0.3);
    for (let i = 0; i <= n; i += 1) {
      const u = u0 + ((u1 - u0) * i) / n;
      box(m, f, u - 0.012, v, depth - 0.02, u + 0.012, v + 0.95, depth + 0.004, ALL);
    }
    // Stairs up to the next platform, alternating direction.
    if (fl + 1 < floors) {
      const left = fl % 2 === 0;
      const ua = left ? u0 + 0.15 : u1 - 0.15;
      const ub = left ? u1 - 0.85 : u0 + 0.85;
      const z = depth * 0.55;
      beam(m, f.p(ua, v, z - 0.28), f.p(ub, v + storey, z - 0.28), 0.04, 0.12);
      beam(m, f.p(ua, v, z + 0.28), f.p(ub, v + storey, z + 0.28), 0.04, 0.12);
      for (let k = 1; k < 9; k += 1) {
        const t = k / 9;
        const u = ua + (ub - ua) * t;
        const vv = v + storey * t;
        box(m, f, u - 0.09, vv - 0.02, z - 0.28, u + 0.09, vv, z + 0.28, ALL);
      }
    } else {
      // A gooseneck ladder to the roof.
      for (const z of [0.25, 0.65]) box(m, f, u1 - 0.45, v + 1.0, z - 0.02, u1 - 0.41, v + 2.6, z + 0.02, ALL);
    }
  }
  // The drop ladder, hooked up under the lowest platform.
  const v = ground + 0.6;
  for (const u of [u0 + 0.35, u0 + 0.8]) box(m, f, u - 0.02, v - 2.4, depth - 0.12, u + 0.02, v, depth - 0.08, ALL);
  for (let k = 1; k < 8; k += 1) box(m, f, u0 + 0.35, v - 2.4 + k * 0.3, depth - 0.115, u0 + 0.8, v - 2.4 + k * 0.3 + 0.025, depth - 0.085, ALL);
}

/**
 * A wooden water tank on a steel stand: staves, iron hoops and a conical
 * roof, the silhouette of a New York roof.
 */
function waterTower(kit: Kit, f: Frame, u: number, d: number, roof: number, r: number): void {
  const m = kit.metal.color(0x3a3734);
  const legs = 2.4;
  const c = f.p(u, roof, d);
  const up = Frame.of(c, f.t, f.up);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const foot = up.p(a * r * 0.75, 0, b * r * 0.75);
    beam(m, foot, up.p(a * r * 0.7, legs, b * r * 0.7), 0.12, 0.12);
  }
  beam(m, up.p(-r * 0.72, legs * 0.55, -r * 0.72), up.p(r * 0.72, legs * 0.55, -r * 0.72), 0.06, 0.06);
  beam(m, up.p(-r * 0.72, legs * 0.55, r * 0.72), up.p(r * 0.72, legs * 0.55, r * 0.72), 0.06, 0.06);
  box(kit.wood.color(0x6b5b4a), up, -r * 0.85, legs - 0.12, -r * 0.85, r * 0.85, legs, r * 0.85, ALL);
  prism(kit.wood.color(0x8d7a64), up, 0, 0, legs, legs + 3.2, r, r * 0.96, 18, { smooth: true });
  for (const h of [0.5, 1.3, 2.1, 2.9]) torus(m, up.p(0, legs + h, 0), up.up, r * (1 - h * 0.013) + 0.02, 0.025, 24, 4);
  prism(kit.wood.color(0x5a4c3e), up, 0, 0, legs + 3.2, legs + 4.4, r + 0.08, 0.06, 18, { smooth: true, bottom: true });
}

export interface DecoSpec {
  width: number;
  floors: number;
  stone: number;
  spandrel: number;
}

/**
 * An Art Deco office block: a tall lobby floor of polished granite and
 * bronze, piers running unbroken up the base between the windows with dark
 * metal spandrels, then two setbacks and a stepped crown. Its party walls
 * are plain buff brick where they stand above the neighbours.
 */
export function deco(s: DecoSpec): Lot {
  return {
    width: s.width,
    build: (kit, f, ends, random) => {
      const W = s.width;
      const D = 16;
      const lobby = 5.2;
      const storey = 3.4;
      const H = lobby + s.floors * storey;
      body(kit, kit.brick, 0xc9a77f, f, W, D, H);
      const bays = 5;
      const pier = 0.46;
      const pitch = (W - pier) / bays;
      const holes: Hole[] = [];
      const lb = kit.limestone;
      // The lobby: a bronze-framed entrance in a stepped stone portal, shop windows either side.
      const uc = W / 2;
      const door: Hole = { u0: uc - 1.1, u1: uc + 1.1, v0: 0, v1: 3.9 };
      holes.push(door);
      reveal(lb.color(s.stone, 0.9), f, door, 0.6, LEFT | RIGHT | TOP);
      for (let k = 0; k < 3; k += 1) {
        const o = 0.18 + k * 0.16;
        box(lb.color(s.stone, 1 - k * 0.03), f, door.u0 - o, 0, 0, door.u1 + o, door.v1 + o, 0.05 + k * 0.05, FRONT | LEFT | RIGHT | TOP);
      }
      const bz = kit.metal.color(BRONZE);
      box(bz, f, door.u0, 0, -0.6, door.u1, 2.7, -0.54, FRONT);
      box(bz, f, door.u0, 2.7, -0.6, door.u1, 2.82, -0.48, NO_BACK);
      kit.glass.color(GLASS);
      kit.glass.quad(f.p(door.u0 + 0.12, 0.1, -0.53), f.p(uc - 0.05, 0.1, -0.53), f.p(uc - 0.05, 2.6, -0.53), f.p(door.u0 + 0.12, 2.6, -0.53));
      kit.glass.quad(f.p(uc + 0.05, 0.1, -0.53), f.p(door.u1 - 0.12, 0.1, -0.53), f.p(door.u1 - 0.12, 2.6, -0.53), f.p(uc + 0.05, 2.6, -0.53));
      kit.glass.quad(f.p(door.u0, 2.82, -0.58), f.p(door.u1, 2.82, -0.58), f.p(door.u1, door.v1, -0.58), f.p(door.u0, door.v1, -0.58));
      for (let k = 1; k < 6; k += 1) {
        const u = door.u0 + ((door.u1 - door.u0) * k) / 6;
        box(bz, f, u - 0.02, 2.82, -0.58, u + 0.02, door.v1, -0.52, FRONT | LEFT | RIGHT);
      }
      for (const [u0, u1] of [[0.55, door.u0 - 0.7], [door.u1 + 0.7, W - 0.55]] as const) {
        if (u1 - u0 > 1) holes.push(shopFront(kit, f, { u0, w: u1 - u0, h: 3.6, depth: 0.35, wall: s.stone, frame: BRONZE, awning: null, door: 'right' }));
      }
      // Windows between the piers, floor after floor.
      for (let fl = 0; fl < s.floors; fl += 1) {
        const v = lobby + fl * storey;
        for (let b = 0; b < bays; b += 1) {
          const u0 = pier + b * pitch + 0.14;
          holes.push(windowUnit(kit, f, sash(u0, v + 0.75, pitch - pier - 0.28, 2.15, s.stone, { frame: DARK_SASH, panes: panes(random), depth: 0.18, sill: false })));
        }
      }
      wallFace(lb.color(s.stone), f, 0, W, -0.3, H, holes);
      box(kit.stone.color(GRANITE), f, -0.03, -0.25, 0, W + 0.03, 0.9, 0.06, FRONT | TOP | LEFT | RIGHT);
      // Dark metal spandrels between the windows, with three ribs each.
      const sp = kit.paint.color(s.spandrel);
      for (let fl = 0; fl + 1 < s.floors; fl += 1) {
        const v = lobby + fl * storey + 0.75 + 2.15;
        for (let b = 0; b < bays; b += 1) {
          const u0 = pier + b * pitch + 0.14;
          const u1 = u0 + pitch - pier - 0.28;
          box(sp, f, u0, v, -0.02, u1, v + storey - 2.15, 0.01, FRONT);
          for (let r = 1; r <= 3; r += 1) box(sp, f, u0 + 0.08, v + r * 0.3, 0, u1 - 0.08, v + r * 0.3 + 0.05, 0.035, NO_BACK);
        }
      }
      // Piers from the lobby cornice to the parapet, rounded so they read as soft vertical ribs.
      withRound(lb, 0.08, () => {
        for (let b = 0; b <= bays; b += 1) {
          const u = b * pitch;
          box(lb.color(s.stone, 1.03), f, u, lobby - 0.2, 0, u + pier, H + 0.9, 0.2, FRONT | LEFT | RIGHT | TOP);
        }
        box(lb.color(s.stone, 0.97), f, -0.05, lobby - 0.55, 0, W + 0.05, lobby - 0.2, 0.28, NO_BACK);
      });
      box(lb.color(s.stone), f, 0, H, -0.25, W, H + 0.6, 0, FRONT | TOP | BACK);
      cornerPiers(lb, s.stone, f, W, ends, -0.25, H + 0.9, 0.2);
      // Two setbacks, then a stepped crown.
      setback(kit, f, s, W, D, H, 1.2, 2, random);
      setback(kit, f, s, W, D, H + 2 * storey, 2.4, 2, random);
      const top = H + 4 * storey;
      withRound(lb, 0.12, () => {
        const c0 = 3.0;
        box(lb.color(s.stone), f, c0, top, -2.4 - 6, W - c0, top + 1.6, -2.4, FRONT | LEFT | RIGHT | TOP);
        box(lb.color(s.stone, 1.03), f, c0 + 0.8, top + 1.6, -2.4 - 5, W - c0 - 0.8, top + 2.8, -3.0, FRONT | LEFT | RIGHT | TOP);
        for (let k = 0; k < 5; k += 1) {
          const u = c0 + 0.4 + ((W - 2 * c0 - 0.8) * k) / 4;
          box(lb.color(s.stone, 1.05), f, u - 0.12, top, -2.45, u + 0.12, top + 2.2 + (k === 2 ? 1.2 : k % 2) * 0.6, -2.25, FRONT | LEFT | RIGHT | TOP);
        }
      });
      return null;
    },
  };
}

/** One setback of an Art Deco block: a narrower volume `inset` in from the front and both sides. */
function setback(kit: Kit, f: Frame, s: DecoSpec, W: number, D: number, base: number, inset: number, floors: number, random: () => number): void {
  const lb = kit.limestone;
  const g = f.at(inset, base, -inset);
  const w = W - 2 * inset;
  const storey = 3.4;
  const h = floors * storey;
  withRound(lb, 0.15, () => box(lb.color(s.stone), g, 0, 0, -(D - inset - 1), w, h, 0.001, LEFT | RIGHT | TOP | BACK));
  const holes: Hole[] = [];
  const bays = Math.max(2, Math.round(w / 1.75));
  const pitch = w / bays;
  for (let fl = 0; fl < floors; fl += 1) {
    for (let b = 0; b < bays; b += 1) {
      holes.push(windowUnit(kit, g, sash(b * pitch + 0.32, fl * storey + 0.7, pitch - 0.64, 2.1, s.stone, { frame: DARK_SASH, panes: panes(random), depth: 0.18, sill: false })));
    }
  }
  wallFace(lb.color(s.stone), g, 0, w, 0, h, holes);
  withRound(lb, 0.08, () => {
    for (let b = 0; b <= bays; b += 1) box(lb.color(s.stone, 1.03), g, b * pitch - 0.16, 0, 0, b * pitch + 0.16, h + 0.5, 0.16, FRONT | LEFT | RIGHT | TOP);
  });
  // The roof of the floor below, in front of the setback, with a parapet.
  box(kit.concrete.color(ROOF_TAR), f, 0, base - 0.05, -inset, W, base + 0.01, 0, TOP);
}

// --- Istanbul, Milan, Ankara -------------------------------------------------------

export interface PeraSpec {
  width: number;
  floors: number;
  stone: number;
  trim: number;
  door: number;
}

/**
 * A Pera apartment: cut stone over a tall ground floor, a closed stone bay
 * (cumba) on carved corbels in the middle of the upper floors, tall windows
 * either side with iron balconettes, a dentilled cornice.
 */
export function pera(s: PeraSpec): Lot {
  return {
    width: s.width,
    build: (kit, f, ends, random) => {
      const W = s.width;
      const D = 15;
      // Tall enough that the bay's corbels clear the door's cap and the shop's fascia.
      const ground = 4.6;
      const storey = 3.3;
      const H = ground + s.floors * storey;
      const lb = kit.limestone;
      body(kit, kit.brick, 0xb98e6e, f, W, D, H);
      const holes: Hole[] = [];
      holes.push(doorway(kit, f, {
        u0: 0.55, w: 1.5, h: 3.2, depth: 0.32, colour: s.door, wood: true, fanlight: true, portal: 'classic', stone: s.trim,
      }));
      holes.push(shopFront(kit, f, { u0: 2.75, w: W - 3.25, h: 2.9, depth: 0.3, wall: s.stone, frame: 0x3b2f2a, awning: null, door: 'right' }));
      const bayW = Math.min(2.9, W - 2.6);
      const bc = W / 2;
      const side = [(bc - bayW / 2) / 2, W - (bc - bayW / 2) / 2];
      for (let fl = 0; fl < s.floors; fl += 1) {
        const v = ground + fl * storey;
        for (const uc of side) {
          holes.push(windowUnit(kit, f, sash(uc - 0.42, v + 0.4, 0.84, 2.35, s.stone, { surround: s.trim, cap: fl === 0, french: fl < 2, sill: fl >= 2, panes: panes(random), shutters: 'none' })));
          if (fl < 2) balcony(kit, f, uc - 0.6, uc + 0.6, v + 0.4, 0.45, null);
        }
      }
      wallFace(lb.color(s.stone), f, 0, W, -0.3, H, holes);
      band(kit.stone.color(s.trim, 0.9), f, 0, W, -0.25, 0.7, 0.05, holes, STRIP);
      band(lb.color(s.trim), f, 0, W, ground - 0.25, ground + 0.05, 0.12, [], ALL & ~BACK);
      cumba(kit, f, bc - bayW / 2, bc + bayW / 2, ground, H - 0.6, s, random);
      cornerPiers(lb, s.stone, f, W, ends, -0.25, H, 0.14);
      cornice(kit, f, W, H + 0.35, s.trim, true);
      return null;
    },
  };
}

/** A closed bay in cut stone on corbels, windows on its front and sides, a little cornice on top. */
function cumba(kit: Kit, f: Frame, u0: number, u1: number, v0: number, v1: number, s: PeraSpec, random: () => number): void {
  const lb = kit.limestone;
  const d = 0.85;
  const storey = 3.3;
  const floors = Math.round((v1 - v0) / storey);
  const front = f.at(0, 0, d);
  const holes: Hole[] = [];
  const sideHoles: Hole[] = [];
  for (let fl = 0; fl < floors; fl += 1) {
    const v = v0 + fl * storey;
    const w = (u1 - u0 - 0.9) / 2;
    holes.push(windowUnit(kit, front, sash(u0 + 0.3, v + 0.75, w, 1.9, s.stone, { surround: s.trim, panes: panes(random) })));
    holes.push(windowUnit(kit, front, sash(u1 - 0.3 - w, v + 0.75, w, 1.9, s.stone, { surround: s.trim, panes: panes(random) })));
    sideHoles.push({ u0: 0.18, u1: d - 0.18, v0: v + 0.75, v1: v + 2.65 });
  }
  wallFace(lb.color(s.stone), front, u0, u1, v0, v1, holes);
  // The two sides: narrow windows, glazed dark at the back of a shallow reveal.
  const left = Frame.of(f.p(u0, 0, 0), f.n);
  const right = Frame.of(f.p(u1, 0, d), [-f.n[0], -f.n[1], -f.n[2]]);
  for (const side of [left, right]) {
    wallFace(lb.color(s.stone), side, 0, d, v0, v1, sideHoles);
    for (const h of sideHoles) {
      reveal(lb.color(s.stone, 0.92), side, h, 0.12);
      kit.glass.color(GLASS);
      kit.glass.quad(side.p(h.u0, h.v0, -0.12), side.p(h.u1, h.v0, -0.12), side.p(h.u1, h.v1, -0.12), side.p(h.u0, h.v1, -0.12));
    }
  }
  // Underside, corbels, string courses at each floor and a cap.
  box(lb.color(s.trim), f, u0 - 0.06, v0 - 0.35, 0, u1 + 0.06, v0, d + 0.06, NO_BACK);
  for (const u of [u0 + 0.2, (u0 + u1) / 2, u1 - 0.2]) {
    box(lb.color(s.trim, 0.95), f, u - 0.14, v0 - 0.75, 0, u + 0.14, v0 - 0.35, d * 0.75, NO_BACK);
    box(lb, f, u - 0.11, v0 - 0.95, 0, u + 0.11, v0 - 0.75, d * 0.35, NO_BACK);
  }
  for (let fl = 1; fl < floors; fl += 1) {
    box(lb.color(s.trim), f, u0 - 0.04, v0 + fl * storey - 0.12, 0, u1 + 0.04, v0 + fl * storey + 0.05, d + 0.04, NO_BACK);
  }
  box(lb.color(s.trim), f, u0 - 0.1, v1, 0, u1 + 0.1, v1 + 0.28, d + 0.12, NO_BACK);
}

export interface LibertySpec {
  width: number;
  floors: number;
  stucco: number;
  trim: number;
  shutter: number;
  /** Tessa's family lives here: her window is the left one on the first floor. */
  tessa: boolean;
}

/**
 * A Milan Liberty apartment: a rusticated stone ground floor, pastel stucco
 * above with stone surrounds and keystones, a wrought-iron balcony along
 * the first floor and balconettes on the second, louvred shutters, a deep
 * cornice on brackets. Returns Tessa's window when she lives here.
 */
export function liberty(s: LibertySpec): Lot {
  return {
    width: s.width,
    build: (kit, f, ends, random) => {
      const W = s.width;
      const D = 14;
      const ground = 4.2;
      const storey = 3.3;
      const H = ground + s.floors * storey;
      body(kit, kit.brick, 0xb07a5f, f, W, D, H);
      const holes: Hole[] = [];
      let tessa: V3 | null = null;
      const door = doorway(kit, f, {
        u0: W - 1.95, w: 1.45, h: 3.1, depth: 0.32, colour: 0x3a2c22, wood: true, fanlight: true, portal: 'classic', stone: PORTAL_STONE,
      });
      holes.push(door);
      holes.push(shopFront(kit, f, { u0: 0.45, w: W - 3.0, h: 3.0, depth: 0.3, wall: s.stucco, frame: 0x4a3a2c, awning: null, door: 'left' }));
      const cols = 3;
      for (let fl = 0; fl < s.floors; fl += 1) {
        const v = ground + fl * storey;
        for (let c = 0; c < cols; c += 1) {
          const uc = 0.4 + ((W - 0.8) * (c + 0.5)) / cols;
          const french = fl === 0 || (fl === 1 && c !== 1);
          const isTessa = s.tessa && fl === 0 && c === 0;
          const spec = sash(uc - 0.47, french ? v + 0.1 : v + 0.85, 0.94, french ? 2.45 : 1.75, s.stucco, {
            surround: s.trim,
            cap: fl <= 1,
            sill: !french,
            french,
            panes: isTessa ? [CURTAIN, CURTAIN, GLASS, GLASS, GLASS, GLASS] : panes(random),
            shutters: isTessa ? 'open' : random() < 0.55 ? 'open' : random() < 0.5 ? 'closed' : 'ajar',
            shutter: s.shutter,
            ajarAngle: 1.1 + random() * 0.6,
          });
          const h = windowUnit(kit, f, spec);
          holes.push(h);
          // A keystone on the surround: the Liberty flourish, kept plain.
          box(kit.limestone.color(s.trim), f, uc - 0.1, h.v1 + 0.02, 0, uc + 0.1, h.v1 + 0.3, 0.07, NO_BACK);
          if (isTessa) {
            flowerBox(kit, f, spec, random);
            tessa = f.p(uc, spec.v0 + spec.h / 2, 0.02);
          }
          if (fl === 1 && c !== 1) balcony(kit, f, uc - 0.65, uc + 0.65, v + 0.1, 0.5, null);
        }
      }
      balcony(kit, f, 0.25, W - 0.25, ground + 0.1, 0.8, random() < 0.6 ? random : null);
      wallFace(kit.plaster.color(s.stucco), f, 0, W, ground - 0.1, H, holes);
      wallFace(kit.stone.color(0xe6dccb), f, 0, W, -0.3, ground - 0.1, holes);
      // Rustication: deep joints in the stone ground floor.
      const st = kit.stone.color(0xe6dccb, 0.94);
      for (let v = 0.6; v < ground - 0.3; v += 0.62) band(st, f, 0, W, v, v + 0.48, 0.05, holes, STRIP);
      band(kit.stone.color(0xd9cfbe), f, 0, W, ground - 0.32, ground - 0.02, 0.12, [], ALL & ~BACK);
      cornerPiers(kit.plaster, s.stucco, f, W, ends, ground - 0.1, H, 0.14);
      bracketCornice(kit.plaster, s.trim, f, W, H, 0.7);
      return tessa;
    },
  };
}

export interface RepublicSpec {
  width: number;
  stone: number;
  trim: number;
  /** A café on the ground floor, its awning stripes; or a plain stone base. */
  cafe: readonly [number, number] | null;
}

/**
 * An early Republican block from Ankara: faced in pinkish stone, a tall
 * ground floor, three floors of tall windows in vertical strips between
 * plain stone frames, a recessed top floor behind square columns, and a
 * thin concrete roof slab reaching out over it. Free corners are rounded
 * with a generous radius, as the period's corner buildings were.
 */
export function republic(s: RepublicSpec): Lot {
  return {
    width: s.width,
    build: (kit, f, ends, random) => {
      const W = s.width;
      const D = 15;
      const ground = 4.4;
      const storey = 3.3;
      const floors = 3;
      const H = ground + floors * storey;
      const top = H + 3.3;
      const lb = kit.limestone;
      body(kit, lb, s.stone, f, W, D, H);
      const holes: Hole[] = [];
      holes.push(doorway(kit, f, { u0: W - 1.75, w: 1.35, h: 3.0, depth: 0.35, colour: 0x2f2a26, wood: false, fanlight: true, portal: 'plain', stone: s.trim }));
      holes.push(shopFront(kit, f, { u0: 0.5, w: W - 2.75, h: 3.3, depth: 0.35, wall: s.stone, frame: 0x3a332d, awning: s.cafe, door: 'right' }));
      const bays = Math.max(3, Math.round(W / 1.7));
      const pitch = (W - 0.8) / bays;
      for (let fl = 0; fl < floors; fl += 1) {
        const v = ground + fl * storey;
        for (let b = 0; b < bays; b += 1) {
          const uc = 0.4 + pitch * (b + 0.5);
          holes.push(windowUnit(kit, f, sash(uc - 0.47, v + 0.55, 0.94, 2.25, s.stone, { surround: s.trim, depth: 0.32, frame: 0xe8e2d6, panes: panes(random) })));
        }
      }
      wallFace(lb.color(s.stone), f, 0, W, -0.3, H, holes);
      // Thin horizontal bands at the floor lines, the period's restraint.
      for (let fl = 0; fl <= floors; fl += 1) {
        const v = ground + fl * storey;
        box(kit.concrete.color(0xe9e4dc), f, -0.04, v - 0.12, 0, W + 0.04, v + 0.02, 0.09, NO_BACK);
      }
      cornerPiers(lb, s.stone, f, W, ends, -0.25, H, 0.35);
      // The recessed top floor: a wall set back behind square columns, then the slab.
      const back = f.at(0, H, -1.2);
      const loggia: Hole[] = [];
      for (let b = 0; b < bays; b += 1) {
        const uc = 0.4 + pitch * (b + 0.5);
        loggia.push(windowUnit(kit, back, sash(uc - 0.5, 0.4, 1.0, 2.2, s.stone, { depth: 0.2, frame: 0xe8e2d6, panes: panes(random), sill: false })));
      }
      wallFace(lb.color(s.stone, 0.92), back, 0, W, 0, 3.3, loggia);
      box(kit.concrete.color(0xd9d3c9), f, 0, H - 0.05, -1.2, W, H + 0.02, 0, TOP);
      withRound(lb, 0.06, () => {
        for (let b = 0; b <= bays; b += 1) {
          const u = Math.min(W - 0.3, Math.max(0.3, 0.4 + pitch * b));
          box(lb.color(s.trim), f, u - 0.17, H, -0.35, u + 0.17, top, -0.01, FRONT | LEFT | RIGHT | BACK);
        }
      });
      box(kit.concrete.color(0xece7df), f, -0.3, top, -D, W + 0.3, top + 0.28, 0.6, ALL);
      box(kit.concrete.color(ROOF_TAR), f, 0, top + 0.28, -D, W, top + 0.3, 0.55, TOP);
      return null;
    },
  };
}
