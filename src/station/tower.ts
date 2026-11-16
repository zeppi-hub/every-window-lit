import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import {
  ALL,
  BACK,
  band,
  beam,
  BOTTOM,
  box,
  doorway,
  Frame,
  FRONT,
  type Hole,
  IRON,
  type Kit,
  LEFT,
  NO_BACK,
  PartBuilder,
  PORTAL_STONE,
  prism,
  reveal,
  RIGHT,
  SILL_STONE,
  STRIP,
  torus,
  tube,
  wallFace,
  windowUnit,
  WORLD,
} from './facade.js';
import { type Box, PLAZA_Y, SILL, TOWER, TOWER_FOOT, WINDOW } from './layout.js';
import { plain } from './materials.js';
import { ASHLAR, DRESSED, TRIMMED_WINDOW } from './palazzo.js';

/**
 * The Keeper's tower, the clock tower of the Palazzo of the Republic in the
 * Art Deco manner: a limestone shaft standing 1.5 m proud of the palazzo's
 * wings, rounded piers up its four corners, the Keeper's window a third of
 * the way up and a street door under it, a clock face without numerals
 * between two fins above the palazzo's balustrade, then two setbacks (tall
 * dark slits, then fins) and a stepped cap with a short bronze finial; no
 * spire. Built into the town kit, so it costs no draw calls of its own;
 * only the door's iron ring is separate, because the Keeper pulls it to
 * climb back up.
 */

const DOOR_WOOD = 0x6b4a32;
const BRONZE = 0x7a5e3a;
const DIAL = 0xf6f1e6;

const W = TOWER.halfWidth * 2;
const D = TOWER.backZ - TOWER.frontZ;
/** Wall top above the square, where the crown starts. */
const H = TOWER.top - PLAZA_Y;
/** Centre of the clock face above the square, clear of the palazzo's balustrade. */
const CLOCK_V = 17.4;
const CLOCK_RADIUS = 1.05;

/** The four outer faces, each running to where the next one starts (anticlockwise from above). */
const FRONT_FACE = Frame.of([TOWER.halfWidth, PLAZA_Y, TOWER.frontZ], [-1, 0, 0]);
const FACES: ReadonlyArray<[Frame, number]> = [
  [FRONT_FACE, W],
  [Frame.of([-TOWER.halfWidth, PLAZA_Y, TOWER.frontZ], [0, 0, 1]), D],
  [Frame.of([-TOWER.halfWidth, PLAZA_Y, TOWER.backZ], [1, 0, 0]), W],
  [Frame.of([TOWER.halfWidth, PLAZA_Y, TOWER.backZ], [0, 0, -1]), D],
];

/**
 * The street door, centred under the window. The ring hangs on the leaf
 * away from where the basket waits on the square (x 0.29), so the Keeper
 * can still land within reach of it.
 */
const DOOR = { u0: W / 2 - 0.65, w: 1.3, h: 2.6, depth: 0.3 } as const;

export function tower(kit: Kit): void {
  const window: Hole = {
    u0: W / 2 - (WINDOW.halfWidth + 0.05),
    u1: W / 2 + (WINDOW.halfWidth + 0.05),
    v0: SILL.top - 0.08 - PLAZA_Y,
    v1: WINDOW.top + 0.05 - PLAZA_Y,
  };
  const door = doorway(kit, FRONT_FACE, {
    ...DOOR,
    colour: DOOR_WOOD,
    wood: true,
    fanlight: false,
    portal: 'classic',
    stone: PORTAL_STONE,
  });
  const portal: Hole = { u0: door.u0 - 0.34, u1: door.u1 + 0.34, v0: -1, v1: DOOR.h + 0.4 };

  // Walls with small stair windows up the shaft, and a plinth broken round the door.
  FACES.forEach(([f, width], i) => {
    const holes: Hole[] = i === 0 ? [window, door] : [];
    // Below the palazzo's roof only the front shows; above it every face does.
    if (i === 0) holes.push(slit(kit, f, width / 2, 12.0));
    holes.push(slit(kit, f, width / 2, i === 0 ? 19.6 : 17.2));
    if (i !== 0) holes.push(slit(kit, f, width / 2, 19.8));
    wallFace(kit.limestone.color(ASHLAR), f, 0, width, -0.3, H, holes);
    const lap = width === W ? 0.06 : 0;
    band(kit.limestone.color(DRESSED), f, -lap, width + lap, -0.25, 0.5, 0.06, i === 0 ? [portal] : [], STRIP);
  });
  reveal(kit.limestone.color(ASHLAR), FRONT_FACE, window, SILL.outerZ - TOWER.frontZ);
  cornerPiers(kit);

  // The Keeper's window: an outer ledge and a lintel.
  const st = kit.stone.color(SILL_STONE);
  box(st, FRONT_FACE, window.u0 - 0.08, window.v0 - 0.07, 0, window.u1 + 0.08, window.v0, 0.07, NO_BACK);
  box(st, FRONT_FACE, window.u0 - 0.1, window.v1, 0, window.u1 + 0.1, window.v1 + 0.22, 0.03, NO_BACK);

  clock(kit);
  decoCrown(kit);
}

/** Draws with the limestone builder at a larger edge radius, then restores it. */
function rounded(kit: Kit, radius: number, draw: () => void): void {
  const own = kit.limestone.round;
  kit.limestone.round = radius;
  draw();
  kit.limestone.round = own;
}

/** Rounded piers wrapped round the four corners, from the plinth to just above the wall top. */
function cornerPiers(kit: Kit): void {
  const [x0, x1, z0, z1] = [-TOWER.halfWidth, TOWER.halfWidth, TOWER.frontZ, TOWER.backZ];
  const lb = kit.limestone.color(DRESSED);
  rounded(kit, 0.16, () => {
    for (const [xa, xb] of [[x0 - 0.12, x0 + 0.62], [x1 - 0.62, x1 + 0.12]]) {
      for (const [za, zb] of [[z0 - 0.12, z0 + 0.62], [z1 - 0.62, z1 + 0.12]]) {
        box(lb, WORLD, xa, PLAZA_Y + 0.5, za, xb, TOWER.top + 0.7, zb, ALL & ~BOTTOM);
      }
    }
  });
}

/**
 * The tower's Art Deco crown: a band at the wall top, a first setback with
 * tall dark slits, a narrower second one ribbed with fins, a stepped cap
 * and a short bronze finial.
 */
function decoCrown(kit: Kit): void {
  const lb = kit.limestone;
  const [x0, x1, z0, z1] = [-TOWER.halfWidth, TOWER.halfWidth, TOWER.frontZ, TOWER.backZ];
  const y = TOWER.top;
  box(lb.color(DRESSED), WORLD, x0 - 0.12, y - 0.45, z0 - 0.12, x1 + 0.12, y + 0.25, z1 + 0.12, ALL & ~BOTTOM);
  const tier = (inset: number, ya: number, yb: number, radius: number) =>
    rounded(kit, radius, () => box(lb.color(ASHLAR), WORLD, x0 + inset, ya, z0 + inset, x1 - inset, yb, z1 - inset, ALL & ~BOTTOM));
  const y1 = y + 0.25;
  const y2 = y1 + 3.4;
  const y3 = y2 + 2.6;
  tier(0.45, y1, y2, 0.2);
  tier(1.15, y2, y3, 0.18);
  tier(1.7, y3, y3 + 0.55, 0.12);
  tier(2.1, y3 + 0.55, y3 + 0.95, 0.08);
  // Tall slits on every face of the first setback.
  kit.glass.color(0x1c2328);
  const g = kit.glass;
  const slitsAlongX = (z: number, out: number) => {
    for (const xc of [-0.75, 0.75]) {
      g.quadToward([xc - 0.2, y1 + 0.5, z], [xc + 0.2, y1 + 0.5, z], [xc + 0.2, y2 - 0.5, z], [xc - 0.2, y2 - 0.5, z], [0, 0, out]);
    }
  };
  const slitsAlongZ = (x: number, out: number) => {
    const zc0 = (z0 + z1) / 2;
    for (const zc of [zc0 - 0.9, zc0 + 0.9]) {
      g.quadToward([x, y1 + 0.5, zc - 0.2], [x, y1 + 0.5, zc + 0.2], [x, y2 - 0.5, zc + 0.2], [x, y2 - 0.5, zc - 0.2], [out, 0, 0]);
    }
  };
  slitsAlongX(z0 + 0.45 - 0.01, -1);
  slitsAlongX(z1 - 0.45 + 0.01, 1);
  slitsAlongZ(x0 + 0.45 - 0.01, -1);
  slitsAlongZ(x1 - 0.45 + 0.01, 1);
  // Fins up the second setback, three to a face.
  const fin = lb.color(DRESSED);
  for (const t of [-0.9, 0, 0.9]) {
    const zc = (z0 + z1) / 2 + t * 1.2;
    box(fin, WORLD, t - 0.09, y2, z0 + 1.15 - 0.22, t + 0.09, y3 + 0.4, z0 + 1.15, ALL & ~BOTTOM & ~FRONT);
    box(fin, WORLD, t - 0.09, y2, z1 - 1.15, t + 0.09, y3 + 0.4, z1 - 1.15 + 0.22, ALL & ~BOTTOM & ~BACK);
    box(fin, WORLD, x0 + 1.15 - 0.22, y2, zc - 0.09, x0 + 1.15, y3 + 0.4, zc + 0.09, ALL & ~BOTTOM & ~RIGHT);
    box(fin, WORLD, x1 - 1.15, y2, zc - 0.09, x1 - 1.15 + 0.22, y3 + 0.4, zc + 0.09, ALL & ~BOTTOM & ~LEFT);
  }
  // A short octagonal bronze finial.
  const top = WORLD.at(0, y3 + 0.95, (z0 + z1) / 2);
  prism(kit.metal.color(BRONZE), top, 0, 0, 0, 0.25, 0.42, 0.38, 8, { smooth: true });
  prism(kit.metal, top, 0, 0, 0.25, 1.3, 0.38, 0.05, 8, { smooth: true });
}

/** A narrow stair window centred at u, its sill at v. */
function slit(kit: Kit, f: Frame, u: number, v: number): Hole {
  return windowUnit(kit, f, { ...TRIMMED_WINDOW, u0: u - 0.35, v0: v, w: 0.7, h: 1.25 });
}

/**
 * A stone ring with a pale dial, twelve iron hour bars and two hands at ten
 * past ten; no numerals, no lettering.
 */
function clock(kit: Kit): void {
  const centre = FRONT_FACE.p(W / 2, CLOCK_V, 0);
  // A frame at the centre whose up axis points out of the wall, for the discs.
  const out = Frame.of(centre, FRONT_FACE.t, FRONT_FACE.n);
  prism(kit.limestone.color(DRESSED), out, 0, 0, 0, 0.12, CLOCK_RADIUS + 0.16, CLOCK_RADIUS + 0.12, 32, { top: true });
  prism(kit.plaster.color(DIAL), out, 0, 0, 0.12, 0.15, CLOCK_RADIUS, CLOCK_RADIUS, 32, { top: true });
  // The dial plane: x to the viewer's right, y up, z out of the wall.
  const dial = new Frame(FRONT_FACE.p(W / 2, CLOCK_V, 0.15), FRONT_FACE.t, FRONT_FACE.up, FRONT_FACE.n);
  const m = kit.metal.color(IRON);
  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI) / 6;
    const wide = i % 3 === 0 ? 0.11 : 0.06;
    const r0 = CLOCK_RADIUS * (i % 3 === 0 ? 0.66 : 0.74);
    const r1 = CLOCK_RADIUS * 0.9;
    beam(m, dial.p(r0 * Math.sin(a), r0 * Math.cos(a), 0.01), dial.p(r1 * Math.sin(a), r1 * Math.cos(a), 0.01), wide, 0.02, dial.n);
  }
  const hand = (turns: number, length: number, width: number, lift: number) => {
    const a = turns * Math.PI * 2;
    beam(m, dial.p(-0.12 * Math.sin(a), -0.12 * Math.cos(a), lift), dial.p(length * Math.sin(a), length * Math.cos(a), lift), width, 0.02, dial.n);
  };
  hand((10 + 10 / 60) / 12, CLOCK_RADIUS * 0.55, 0.09, 0.03);
  hand(10 / 60, CLOCK_RADIUS * 0.82, 0.055, 0.055);
  prism(m, Frame.of(dial.p(0, 0, 0), FRONT_FACE.t, FRONT_FACE.n), 0, 0, 0, 0.08, 0.07, 0.07, 12, { top: true });
}

/**
 * The iron ring on the tower door, on its own so it can be poked or pinched:
 * a round backplate on the leaf away from the basket, a staple at its top and the ring
 * hanging from it over the plate. The plate fills the ring, so a fingertip
 * pushed through the middle of the ring still meets iron.
 */
export function createDoorRing(): Mesh {
  const b = new PartBuilder();
  const leaf = -DOOR.depth + 0.05 + 0.018;
  const centre = FRONT_FACE.p(DOOR.u0 + DOOR.w - 0.33, 1.25, leaf);
  // A frame at the ring's centre whose up axis points out of the door.
  const plate = Frame.of([0, 0, 0], FRONT_FACE.t, FRONT_FACE.n);
  const f = new Frame([0, 0, 0], FRONT_FACE.t, FRONT_FACE.up, FRONT_FACE.n);
  b.color(IRON);
  prism(b, plate, 0, 0, 0, 0.008, 0.09, 0.084, 28, { top: true, smooth: true });
  prism(b, plate, 0, 0, 0.008, 0.016, 0.03, 0.026, 16, { top: true, smooth: true });
  box(b, f, -0.008, 0.062, 0.008, 0.008, 0.09, 0.03, NO_BACK);
  torus(b, f.p(0, 0, 0.03), f.n, 0.07, 0.011, 28, 8);
  const ring = b.mesh(plain(0.45, 0.85), 'TowerDoorRing');
  ring.position.set(centre[0], centre[1], centre[2]);
  return ring;
}

/**
 * The doorway in the world, from just proud of the wall face back to the
 * leaf: an arc of the Keeper's that ends in it climbs back up the tower
 * (WalkSystem), as the ring does. The face's u runs toward -x from its edge.
 */
export const DOOR_BOX: Box = [TOWER.halfWidth - DOOR.u0 - DOOR.w, PLAZA_Y, TOWER.frontZ - 0.06, TOWER.halfWidth - DOOR.u0, PLAZA_Y + DOOR.h, TOWER.frontZ + DOOR.depth];

/**
 * The way up from the square, ahead of the Keeper: a brass ring on a low
 * iron post, 1.7 m in front of where the stairs leave them (TOWER_FOOT, the
 * square straight ahead), a little right of the middle of the view. The door
 * ring is behind them as they arrive; this one needs no turn. `solid` is the
 * box the Keeper cannot land in.
 */
export const WAY_UP = { x: 0.35, z: TOWER_FOOT.z - 1.7, post: 0.85, ring: 0.07 } as const;
export const WAY_UP_SOLID: Box = [WAY_UP.x - 0.15, PLAZA_Y - 1, WAY_UP.z - 0.15, WAY_UP.x + 0.15, PLAZA_Y + WAY_UP.post + 0.3, WAY_UP.z + 0.15];
const BRASS = 0xb08d57;

/**
 * The ring on its post, one mesh (one draw, and only while the Keeper walks:
 * BasketSystem shows it then, glowing like the door ring), with a hidden box
 * round both a hand's ray or fingertip meets more easily. A pinch on it, or a
 * touch, brings the Keeper back up as the door ring does.
 */
export function createWayUp(): Group {
  const b = new PartBuilder();
  b.color(IRON);
  tube(b, [0, 0, 0], [0, WAY_UP.post, 0], 0.025, 10, true);
  tube(b, [0, WAY_UP.post, 0], [0, WAY_UP.post + 0.025, 0], 0.012, 8, true);
  b.color(BRASS);
  torus(b, [0, WAY_UP.post + 0.025 + WAY_UP.ring, 0], [0, 0, 1], WAY_UP.ring, 0.012, 28, 8);
  const ring = b.mesh(plain(0.45, 0.85), 'WayUpRing');
  const target = new Mesh(new BoxGeometry(0.5, WAY_UP.post + 0.4, 0.3), new MeshBasicMaterial({ visible: false }));
  target.position.set(0, (WAY_UP.post + 0.4) / 2, 0);
  target.name = 'WayUpTarget';
  const group = new Group();
  group.name = 'WayUp';
  group.add(ring, target);
  group.position.set(WAY_UP.x, PLAZA_Y, WAY_UP.z);
  group.visible = false;
  return group;
}

/** The hidden pane over the door leaf, from the ring's centre: wide and tall, still inside the doorway, just proud of the ring. */
const DOOR_TARGET = { w: 1.0, h: 1.4, x: 0.2, y: 0.15, z: -0.045 } as const;

/**
 * A pane over the door leaf round the ring, for a hand's ray on the square
 * (BasketSystem shows it only while walking). The ring is a few degrees wide
 * seen from where the stairs leave the Keeper, behind them, and a hand's ray
 * shows only once it meets something: the whole leaf now answers it, as the
 * ring does. A hidden material is never drawn, but a ray still meets it; it
 * has no fingertip touch of its own (the ring keeps that).
 */
export function createDoorTarget(ring: Mesh): Mesh {
  const pane = new Mesh(new PlaneGeometry(DOOR_TARGET.w, DOOR_TARGET.h), new MeshBasicMaterial({ visible: false, side: DoubleSide }));
  pane.name = 'TowerDoorTarget';
  pane.position.set(ring.position.x + DOOR_TARGET.x, ring.position.y + DOOR_TARGET.y, ring.position.z + DOOR_TARGET.z);
  pane.visible = false;
  return pane;
}
