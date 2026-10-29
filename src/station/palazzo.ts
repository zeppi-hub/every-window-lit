import {
  ALL,
  arcStrip,
  BACK,
  balcony,
  band,
  BOTTOM,
  box,
  doorway,
  FRONT,
  Frame,
  GLASS,
  type Hole,
  type Kit,
  LEFT,
  NO_BACK,
  NO_BOTTOM,
  PORTAL_STONE,
  prism,
  reveal,
  RIGHT,
  STRIP,
  TOP,
  type V3,
  wallFace,
  type WindowSpec,
  windowUnit,
  WORLD,
} from './facade.js';
import { type Box, PLAZA_Y, TOWER } from './layout.js';

/**
 * The Palazzo of the Republic: Ombrisa's town hall in the civic style of an
 * interwar business capital, built round the Keeper's tower on the fourth
 * side of the square. Two limestone wings flank the tower, set back from it
 * so the tower reads as its own volume: a rusticated arcade at street level
 * with a loggia behind it, giant pilasters rising through the two upper
 * floors between tall framed windows, a balcony on each wing, and a cornice
 * on modillions under a stone balustrade (Beaux-Arts, as New York and Milan
 * built their public halls). No flags, arms or lettering: it is the house of
 * a republic chosen by lot, not of a ruler.
 *
 * Everything is built into the town kit, so the palazzo costs no draw calls
 * of its own. The wings are hollow shells; only the loggia has an inside.
 */

/**
 * Limestone throughout, as the civic buildings of the period were faced:
 * cut blocks for the walls, a lighter dressed stone for pilasters, trims,
 * cornice and balustrade. The square side faces away from the sun, so the
 * loggia's inside is tinted darker (the sky reaches it only through the
 * arches) to keep the arcade legible.
 */
export const ASHLAR = 0xdcd0bb;
export const DRESSED = 0xf6efe3;
const IN_LOGGIA = 0.62;
const CEILING = 0xf3ede2;
const BEAMS = 0x8a6a4c;
const SLABS = 0xf1ebe0;
const COBBLES = 0xffffff;
const WINDOW_WOOD = 0x5b4636;
const DOOR_WOOD = 0x5e4030;

export const PALAZZO = {
  /** World x of the coast-road end and of the end by the market corner. */
  left: -20.6,
  right: 16.4,
  /** The wings stand 1.5 m behind the tower's face, so the tower reads as its own volume; 12 m deep. */
  frontZ: TOWER.frontZ + 1.5,
  backZ: TOWER.frontZ + 13.5,
  /** Wall top above the square, where the corbels start. */
  top: 13.8,
  /** Arcade: bay pitch, pier width and depth, arch springing (arches are semicircular). */
  bay: 4.2,
  pier: 0.8,
  spring: 3.2,
  /** The loggia behind the arcade: back wall distance from the front, ceiling height. */
  loggia: 4,
  ceiling: 5.6,
  /** Floor levels above the square: piano nobile and second floor. */
  nobile: 5.8,
  second: 10.6,
  /** Bays in the left (coast road) wing and the right (market) wing. */
  leftBays: 4,
  rightBays: 3,
} as const;

const ARCH_RADIUS = (PALAZZO.bay - PALAZZO.pier) / 2;
const ARCH_SEGMENTS = 14;

/** One wing seen from the square: its front frame (u runs along -x), bays and where its outer end is. */
interface Wing {
  front: Frame;
  bays: number;
  /** The outer end (away from the tower) is at u = width; otherwise at u = 0. */
  outerAtEnd: boolean;
  /** Bays (first and last) carrying the piano nobile balcony. */
  balcony: readonly [number, number];
}

function wingWidth(bays: number): number {
  return bays * PALAZZO.bay + PALAZZO.pier;
}

const WINGS: readonly Wing[] = [
  {
    front: Frame.of([-TOWER.halfWidth, PLAZA_Y, PALAZZO.frontZ], [-1, 0, 0]),
    bays: PALAZZO.leftBays,
    outerAtEnd: true,
    balcony: [1, 2],
  },
  {
    front: Frame.of([PALAZZO.right, PLAZA_Y, PALAZZO.frontZ], [-1, 0, 0]),
    bays: PALAZZO.rightBays,
    outerAtEnd: false,
    balcony: [1, 1],
  },
];

const NOBILE_WINDOW: Omit<WindowSpec, 'u0' | 'v0' | 'w' | 'h'> = {
  depth: 0.45,
  wall: ASHLAR,
  surround: DRESSED,
  cap: true,
  sill: true,
  french: false,
  frame: WINDOW_WOOD,
  panes: [GLASS],
  shutters: 'none',
  shutter: 0x4f6b42,
  louvred: true,
  ajarAngle: 0,
  grille: false,
};
/** The second floor's windows, and the tower's: a dressed surround without a cap. */
export const TRIMMED_WINDOW: Omit<WindowSpec, 'u0' | 'v0' | 'w' | 'h'> = { ...NOBILE_WINDOW, cap: false };

/**
 * Where the Keeper can stand at the palazzo: the cobbles in front of the
 * wings and the loggia behind the arcade. The tower and the piers are SOLID.
 */
export const PALAZZO_WALKABLE: readonly Box[] = [
  [PALAZZO.left + PALAZZO.pier, PLAZA_Y, -0.9, PALAZZO.right - PALAZZO.pier, PLAZA_Y, PALAZZO.frontZ + PALAZZO.loggia - 0.3],
];

/** The wings above the loggia and behind it, the loggia's end walls and every arcade pier. */
export const PALAZZO_SOLID: readonly Box[] = (() => {
  const P = PALAZZO;
  const top = PLAZA_Y + P.top + 2.2;
  // Above the arches' crowns the wall is solid all the way along.
  const above = PLAZA_Y + P.spring + ARCH_RADIUS - 0.4;
  const boxes: Box[] = [
    [P.left, above, P.frontZ, -TOWER.halfWidth, top, P.backZ],
    [TOWER.halfWidth, above, P.frontZ, P.right, top, P.backZ],
    [P.left, PLAZA_Y - 1, P.frontZ + P.loggia, -TOWER.halfWidth, top, P.backZ],
    [TOWER.halfWidth, PLAZA_Y - 1, P.frontZ + P.loggia, P.right, top, P.backZ],
    [P.left, PLAZA_Y - 1, P.frontZ, P.left + P.pier, top, P.frontZ + P.loggia],
    [P.right - P.pier, PLAZA_Y - 1, P.frontZ, P.right, top, P.frontZ + P.loggia],
  ];
  for (const wing of WINGS) {
    for (let j = 0; j <= wing.bays; j += 1) {
      const [xa, xb] = [wing.front.p(j * P.bay, 0, 0)[0], wing.front.p(j * P.bay + P.pier, 0, 0)[0]].sort((p, q) => p - q);
      boxes.push([xa, PLAZA_Y - 1, P.frontZ, xb, above, P.frontZ + P.pier]);
    }
  }
  return boxes;
})();

export function palazzo(kit: Kit): void {
  for (const wing of WINGS) {
    wingFront(kit, wing);
    loggia(kit, wing);
  }
  sides(kit);
  crown(kit);
  // Cobbles from the square's edge up to the wings, then the loggia's stone floor.
  box(kit.paving.color(COBBLES), WORLD, -21, PLAZA_Y - 1, -0.6, PALAZZO.right, PLAZA_Y, PALAZZO.frontZ, TOP | LEFT | RIGHT);
  // Along the coast-road end: the kerb carried on to the back, and cobbles up to the wall.
  box(kit.stone.color(0xece4d6), WORLD, -21.2, PLAZA_Y - 0.62, -0.6, -21, PLAZA_Y + 0.015, PALAZZO.backZ, NO_BOTTOM);
  box(kit.paving.color(COBBLES), WORLD, -21, PLAZA_Y - 1, PALAZZO.frontZ, PALAZZO.left, PLAZA_Y, PALAZZO.backZ, TOP | FRONT);
  box(kit.stone.color(SLABS), WORLD, PALAZZO.left, PLAZA_Y - 0.3, PALAZZO.frontZ, PALAZZO.right, PLAZA_Y + 0.015, PALAZZO.frontZ + PALAZZO.loggia, TOP | BACK);
  // A flat lead roof behind the merlons; only the crown is ever seen from below.
  box(kit.roof.color(0xb8a48c), WORLD, PALAZZO.left, PLAZA_Y + PALAZZO.top - 0.2, PALAZZO.frontZ, PALAZZO.right, PLAZA_Y + PALAZZO.top, PALAZZO.backZ, TOP);
}

// --- the wings' fronts ----------------------------------------------------------

/** Centre of bay i along the wing's front. */
function bayCentre(i: number): number {
  return PALAZZO.pier + i * PALAZZO.bay + ARCH_RADIUS;
}

function wingFront(kit: Kit, wing: Wing): void {
  const P = PALAZZO;
  const f = wing.front;
  const width = wingWidth(wing.bays);
  const arches: Hole[] = [];
  const holes: Hole[] = [];
  for (let i = 0; i < wing.bays; i += 1) {
    const c = bayCentre(i);
    const arch = { u0: c - ARCH_RADIUS, u1: c + ARCH_RADIUS, v0: -1, v1: P.spring + ARCH_RADIUS };
    arches.push(arch);
    holes.push(arch);
    const onBalcony = i >= wing.balcony[0] && i <= wing.balcony[1];
    holes.push(
      windowUnit(kit, f, {
        ...NOBILE_WINDOW,
        u0: c - 0.65,
        v0: onBalcony ? P.nobile + 0.35 : P.nobile + 0.95,
        w: 1.3,
        h: onBalcony ? 3.05 : 2.45,
        french: onBalcony,
        sill: !onBalcony,
      }),
    );
    holes.push(windowUnit(kit, f, { ...TRIMMED_WINDOW, u0: c - 0.55, v0: P.second + 0.65, w: 1.1, h: 1.75 }));
  }
  // Builders carry one tint at a time and the window units above change it, so tint at the point of use.
  wallFace(kit.limestone.color(ASHLAR), f, 0, width, -0.3, P.top, holes);
  for (const a of arches) arch(kit, f, a.u0, P.pier);
  // Rusticated arcade: deep horizontal joints across the piers and spandrels.
  for (let v = 0.75; v < P.nobile - 0.5; v += 0.56) {
    band(kit.limestone.color(ASHLAR, 0.97), f, 0, width, v, v + 0.44, 0.045, arches, STRIP);
  }
  // Giant pilasters on the pier lines, through both upper floors, with bases and capitals.
  const lb = kit.limestone;
  for (let j = 0; j <= wing.bays; j += 1) {
    const u = j * P.bay + P.pier / 2;
    box(lb.color(DRESSED, 0.98), f, u - 0.32, P.nobile + 0.2, 0, u + 0.32, P.nobile + 0.45, 0.22, NO_BACK);
    box(lb.color(DRESSED), f, u - 0.26, P.nobile + 0.45, 0, u + 0.26, P.top - 0.55, 0.17, FRONT | LEFT | RIGHT);
    box(lb.color(DRESSED, 1.02), f, u - 0.36, P.top - 0.55, 0, u + 0.36, P.top - 0.25, 0.24, NO_BACK);
  }

  courses(kit, f, width, !wing.outerAtEnd, wing.outerAtEnd, arches);
  const [b0, b1] = wing.balcony;
  balcony(kit, f, bayCentre(b0) - 0.95, bayCentre(b1) + 0.95, P.nobile + 0.35, 0.95, null);
}

/**
 * The plinth and the two string courses along a face. At an outer corner a
 * course runs past the end by its own depth, so it meets the course on the
 * next face without a notch.
 */
function courses(kit: Kit, f: Frame, width: number, lapStart: boolean, lapEnd: boolean, cut: readonly Hole[]): void {
  const P = PALAZZO;
  const trim = kit.limestone.color(DRESSED);
  const run = (v0: number, v1: number, d: number, blockers: readonly Hole[], mask: number) =>
    band(trim, f, lapStart ? -d : 0, lapEnd ? width + d : width, v0, v1, d, blockers, mask);
  run(-0.25, 0.45, 0.06, cut, STRIP);
  run(P.nobile - 0.06, P.nobile + 0.2, 0.14, [], ALL & ~BACK);
  run(P.second - 0.04, P.second + 0.16, 0.1, [], ALL & ~BACK);
}

/**
 * A round arch through a wall `depth` thick, opening at u0 with the arcade's
 * span: the spandrels on the front and back faces, the soffit, the jambs
 * below the springing and a dressed-stone archivolt round the front.
 */
function arch(kit: Kit, f: Frame, u0: number, depth: number): void {
  const P = PALAZZO;
  const r = ARCH_RADIUS;
  const c = u0 + r;
  const crown = P.spring + r;
  const st = kit.limestone;
  const at = (k: number): [number, number] => {
    const th = Math.PI - (Math.PI * k) / ARCH_SEGMENTS;
    return [c + r * Math.cos(th), P.spring + r * Math.sin(th)];
  };
  for (let k = 0; k < ARCH_SEGMENTS; k += 1) {
    const [ua, va] = at(k);
    const [ub, vb] = at(k + 1);
    // Front spandrel strip, back spandrel strip (wound the other way), soffit.
    st.color(ASHLAR).quad(f.p(ua, va, 0), f.p(ub, vb, 0), f.p(ub, crown, 0), f.p(ua, crown, 0));
    st.color(ASHLAR, IN_LOGGIA).quad(f.p(ub, vb, -depth), f.p(ua, va, -depth), f.p(ua, crown, -depth), f.p(ub, crown, -depth));
    const mid = (Math.PI * (k + 0.5)) / ARCH_SEGMENTS;
    st.color(ASHLAR, 0.78).quadToward(f.p(ua, va, 0), f.p(ub, vb, 0), f.p(ub, vb, -depth), f.p(ua, va, -depth), f.v(Math.cos(mid), -Math.sin(mid), 0));
  }
  reveal(st.color(ASHLAR, 0.85), f, { u0, u1: u0 + 2 * r, v0: -0.3, v1: P.spring }, depth, LEFT | RIGHT);
  // Archivolt: a ring of dressed voussoirs proud of the face, with a keystone.
  const trim = kit.limestone.color(DRESSED);
  const ring = 0.3;
  arcStrip(trim, f.at(0, 0, 0.05), c, P.spring, r + ring / 2, Math.PI, 0, 0.1, ring, ARCH_SEGMENTS);
  box(trim, f, c - 0.16, crown - 0.04, 0, c + 0.16, crown + ring + 0.08, 0.13, NO_BACK);
  // Imposts where the arch springs.
  box(trim, f, u0 - 0.12, P.spring - 0.18, 0, u0 + 0.06, P.spring, 0.08, NO_BACK);
  box(trim, f, u0 + 2 * r - 0.06, P.spring - 0.18, 0, u0 + 2 * r + 0.12, P.spring, 0.08, NO_BACK);
}

// --- the loggia -----------------------------------------------------------------

/** The covered walk behind a wing's arcade: back face of the arcade, back wall, end wall, ceiling. */
function loggia(kit: Kit, wing: Wing): void {
  const P = PALAZZO;
  const f = wing.front;
  const width = wingWidth(wing.bays);
  const z0 = P.frontZ + P.pier;
  const z1 = P.frontZ + P.loggia;

  // The arcade wall seen from inside: the same openings, mirrored.
  const inside = new Frame(f.p(width, 0, -P.pier), neg(f.t), f.up, neg(f.n));
  const openings: Hole[] = [];
  for (let i = 0; i < wing.bays; i += 1) {
    const c = width - bayCentre(i);
    openings.push({ u0: c - ARCH_RADIUS, u1: c + ARCH_RADIUS, v0: -1, v1: P.spring + ARCH_RADIUS });
  }
  wallFace(kit.limestone.color(ASHLAR, IN_LOGGIA), inside, 0, width, -0.3, P.ceiling, openings);

  // The back wall, with doors and barred windows into the palazzo.
  const back = Frame.of(f.p(0, 0, -P.loggia), f.t);
  const holes: Hole[] = [];
  for (let i = 0; i < wing.bays; i += 1) {
    const c = bayCentre(i);
    if (i % 2 === 1) {
      holes.push(
        doorway(kit, back, {
          u0: c - 0.75, w: 1.5, h: 3.1, depth: 0.25, colour: DOOR_WOOD,
          wood: true, fanlight: true, portal: 'classic', stone: PORTAL_STONE,
        }),
      );
    } else {
      holes.push(windowUnit(kit, back, { ...TRIMMED_WINDOW, u0: c - 0.6, v0: 1.3, w: 1.2, h: 1.6, depth: 0.3, grille: true, cap: false }));
    }
  }
  wallFace(kit.limestone.color(ASHLAR, IN_LOGGIA), back, 0, width, -0.3, P.ceiling, holes);

  // The end wall away from the tower; at the tower end the tower's own side closes the loggia.
  const outerX = f.p(wing.outerAtEnd ? width - P.pier : P.pier, 0, 0)[0];
  const facing = wing.outerAtEnd ? 1 : -1;
  const end = facing > 0 ? Frame.of([outerX, PLAZA_Y, z1], [0, 0, -1]) : Frame.of([outerX, PLAZA_Y, z0], [0, 0, 1]);
  wallFace(kit.limestone.color(ASHLAR, IN_LOGGIA), end, 0, z1 - z0, -0.3, P.ceiling, []);

  // A whitewashed ceiling on dark beams running front to back.
  const [xa, xb] = [f.p(0, 0, 0)[0], f.p(width, 0, 0)[0]].sort((p, q) => p - q);
  box(kit.plaster.color(CEILING, 0.7), WORLD, xa, PLAZA_Y + P.ceiling, z0, xb, PLAZA_Y + P.ceiling + 0.1, z1, BOTTOM);
  const wood = kit.wood.color(BEAMS, 0.8);
  for (let x = xa + P.pier + 0.45; x < xb - P.pier - 0.2; x += 0.95) {
    box(wood, WORLD, x, PLAZA_Y + P.ceiling - 0.24, z0, x + 0.17, PLAZA_Y + P.ceiling, z1, ALL & ~TOP);
  }
}

// --- the sides, the back and the crown ---------------------------------------------

/** The two end walls and the back, with the upper floors' windows carried round. */
function sides(kit: Kit): void {
  const P = PALAZZO;
  const depth = P.backZ - P.frontZ;
  const faces: ReadonlyArray<[Frame, number]> = [
    [Frame.of([P.left, PLAZA_Y, P.frontZ], [0, 0, 1]), depth],
    [Frame.of([P.left, PLAZA_Y, P.backZ], [1, 0, 0]), P.right - P.left],
    [Frame.of([P.right, PLAZA_Y, P.backZ], [0, 0, -1]), depth],
  ];
  faces.forEach(([f, width], i) => {
    const holes: Hole[] = [];
    const count = Math.max(1, Math.floor((width - 2) / 4.2));
    const pitch = width / count;
    for (let i = 0; i < count; i += 1) {
      const c = pitch * (i + 0.5);
      holes.push(windowUnit(kit, f, { ...NOBILE_WINDOW, u0: c - 0.65, v0: P.nobile + 0.95, w: 1.3, h: 2.45 }));
      holes.push(windowUnit(kit, f, { ...TRIMMED_WINDOW, u0: c - 0.55, v0: P.second + 0.65, w: 1.1, h: 1.75 }));
      holes.push(windowUnit(kit, f, { ...TRIMMED_WINDOW, u0: c - 0.5, v0: 1.6, w: 1.0, h: 1.4, grille: true }));
    }
    wallFace(kit.limestone.color(ASHLAR), f, 0, width, -0.3, P.top, holes);
    // The back face's courses turn both back corners.
    courses(kit, f, width, i === 1, i === 1, []);
  });
}

/** The palazzo's crown along its whole wall line, open where the tower rises through the front. */
function crown(kit: Kit): void {
  const P = PALAZZO;
  classicalCrown(kit, P.left, P.right, P.frontZ, P.backZ, PLAZA_Y + P.top, [-TOWER.halfWidth, TOWER.halfWidth]);
}

/**
 * A Beaux-Arts crown round a rectangular wall line [x0, x1] by [z0, z1]
 * whose top is at y: a frieze, a cornice on modillions projecting 0.55 m,
 * and on it a balustrade of turned balusters between solid dies, with a
 * top rail. Axis-aligned world boxes, so the corners close by themselves;
 * `gap` leaves the front (z0) side open between two x values, where the
 * tower rises. The back's balustrade is a solid parapet nobody sees.
 */
export function classicalCrown(
  kit: Kit,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  gap: readonly [number, number] | null,
): void {
  const lb = kit.limestone;
  const out = 0.55;
  const fronts: Array<[number, number]> = gap ? [[x0, gap[0]], [gap[1], x1]] : [[x0, x1]];
  // Frieze on the wall line, then the cornice in two steps and a fillet.
  const ring = (inset: number, ya: number, yb: number, tint: number, frontGap: boolean) => {
    const [ox0, ox1, oz0, oz1] = [x0 - inset, x1 + inset, z0 - inset, z1 + inset];
    const t = Math.max(0.12, inset + 0.1);
    lb.color(tint);
    for (const [a, b] of frontGap ? fronts.map(([a, b]) => [a === x0 ? ox0 : a, b === x1 ? ox1 : b]) : [[ox0, ox1]]) {
      box(lb, WORLD, a, ya, oz0, b, yb, oz0 + t, ALL & ~FRONT);
    }
    box(lb, WORLD, ox0, ya, oz1 - t, ox1, yb, oz1, ALL & ~BACK);
    box(lb, WORLD, ox0, ya, oz0 + t, ox0 + t, yb, oz1 - t, ALL & ~RIGHT);
    box(lb, WORLD, ox1 - t, ya, oz0 + t, ox1, yb, oz1 - t, ALL & ~LEFT);
  };
  ring(0.06, y, y + 0.55, DRESSED, true);
  ring(out - 0.15, y + 0.55, y + 0.78, DRESSED, true);
  ring(out, y + 0.78, y + 0.92, 0xfaf5ec, true);
  // Modillions under the cornice along the fronts and the two ends.
  const mod = lb.color(DRESSED, 0.97);
  for (const [a, b] of fronts) {
    for (let x = a + 0.35; x < b - 0.2; x += 0.62) box(mod, WORLD, x - 0.07, y + 0.4, z0 - out + 0.12, x + 0.07, y + 0.55, z0 - 0.06, NO_BACK & ~TOP);
  }
  for (const xe of [x0, x1]) {
    for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.62) {
      const [xa, xb] = xe === x0 ? [x0 - out + 0.12, x0 - 0.06] : [x1 + 0.06, x1 + out - 0.12];
      box(mod, WORLD, xa, y + 0.4, z - 0.07, xb, y + 0.55, z + 0.07, ALL & ~TOP);
    }
  }
  // The balustrade: a plinth, dies every 3.4 m, turned balusters between, a top rail.
  const by = y + 0.92;
  const bal = (a: number, b: number, z: number, alongX: boolean) => {
    const len = b - a;
    const dies = Math.max(1, Math.round(len / 3.4));
    const pitch = len / dies;
    const rail = (ya: number, yb: number, w: number) =>
      alongX ? box(lb, WORLD, a, ya, z - w, b, yb, z + w, ALL) : box(lb, WORLD, z - w, ya, a, z + w, yb, b, ALL);
    lb.color(DRESSED);
    rail(by, by + 0.16, 0.22);
    rail(by + 0.86, by + 1.0, 0.2);
    for (let d = 0; d <= dies; d += 1) {
      const c = a + d * pitch;
      if (alongX) box(lb.color(DRESSED, 1.02), WORLD, c - 0.2, by + 0.16, z - 0.2, c + 0.2, by + 0.86, z + 0.2, ALL & ~TOP & ~BOTTOM);
      else box(lb.color(DRESSED, 1.02), WORLD, z - 0.2, by + 0.16, c - 0.2, z + 0.2, by + 0.86, c + 0.2, ALL & ~TOP & ~BOTTOM);
      if (d === dies) break;
      for (let u = c + 0.38; u < c + pitch - 0.3; u += 0.3) {
        const at = alongX ? WORLD.at(u, by + 0.16, z) : WORLD.at(z, by + 0.16, u);
        prism(lb.color(DRESSED, 0.99), at, 0, 0, 0, 0.12, 0.07, 0.09, 8, { smooth: true });
        prism(lb, at, 0, 0, 0.12, 0.42, 0.09, 0.05, 8, { smooth: true });
        prism(lb, at, 0, 0, 0.42, 0.7, 0.05, 0.07, 8, { smooth: true });
      }
    }
  };
  // The fronts reach past the corners so their rails close over the ends' runs.
  for (const [a, b] of fronts) bal(a === x0 ? x0 - 0.42 : a, b === x1 ? x1 + 0.42 : b, z0 - 0.2, true);
  bal(z0 + 0.02, z1 - 0.1, x0 - 0.2, false);
  bal(z0 + 0.02, z1 - 0.1, x1 + 0.2, false);
  // The back: a plain parapet.
  box(lb.color(DRESSED, 0.96), WORLD, x0 - 0.4, by, z1 - 0.1, x1 + 0.4, by + 1.0, z1 + 0.3, ALL & ~BOTTOM);
}

function neg(v: V3): V3 {
  return [-v[0], -v[1], -v[2]];
}
