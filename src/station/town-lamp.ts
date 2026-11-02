import { Group, type Mesh } from '@iwsdk/core';
import { beam, blob, PartBuilder, prism, torus, tube, tubePath, type V3, WORLD } from './facade.js';
import { PLAZA_Y } from './layout.js';
import { plain } from './materials.js';

/**
 * The town's lamp over the square (META_VR_FIKIR.md §27, spine A): an empty
 * iron lantern frame hanging from a wire strung between the palazzo, just
 * left of the tower, and the Deco building across the square. No glass and
 * no flame: inside it, an empty ring where a glass globe once sat. From the
 * seat it hangs about 2 degrees right of straight ahead, at eye height, some
 * 13 m away, dark against the pale front of Nora's building: the town's
 * lamp and the one window that greets the Keeper in the same view, the
 * frame and its wire well clear of that window (tests/town-lamp.test.mjs).
 *
 * Two meshes, one each for the wire and the frame, in the town's iron. The
 * frame is built around the point where it hangs from the wire, so it can
 * be moved on its own.
 */

/**
 * Where the wire is fixed: on the palazzo's front, left of the tower; on the
 * Deco building's front across the square, on the face of the pier between
 * its first two bays, where its plate is let into solid stone (between the
 * windows either side).
 */
export const WIRE_FROM: V3 = [-4.0, PLAZA_Y + 10.8, 0.92];
export const WIRE_TO: V3 = [4.7, PLAZA_Y + 11.6, -26.8];
/** How far the wire drops under the lamp's weight at the middle, where the lamp hangs, and how much each half sags. */
const DROP = 1.1;
const HALF_SAG = 0.12;
const WIRE_RADIUS = 0.015;
/** The point on the wire the frame hangs from. */
export const TOWN_LAMP: V3 = [
  (WIRE_FROM[0] + WIRE_TO[0]) / 2,
  (WIRE_FROM[1] + WIRE_TO[1]) / 2 - DROP,
  (WIRE_FROM[2] + WIRE_TO[2]) / 2,
];

const IRON = 0x2d2f2b;

/** The frame's measurements below its hanging point (m): the hook's drop, the cap, the cage's two rings. */
const HANG = 0.32;
const CAP_TOP = -HANG - 0.04;
const TOP_RING = CAP_TOP - 0.17;
const BOTTOM_RING = TOP_RING - 0.5;
const TOP_R = 0.3;
const BOTTOM_R = 0.21;
const SIDES = 6;

export interface TownLampParts {
  group: Group;
  wire: Mesh;
  frame: Mesh;
}

export function createTownLamp(): TownLampParts {
  const group = new Group();
  group.name = 'TownLamp';
  const wire = createWire();
  const frame = createFrame();
  frame.position.set(TOWN_LAMP[0], TOWN_LAMP[1], TOWN_LAMP[2]);
  group.add(wire, frame);
  return { group, wire, frame };
}

/** Each half of the wire from its wall plate down to the lamp, sagging a little, and the plates. */
function createWire(): Mesh {
  const b = new PartBuilder();
  b.color(IRON);
  for (const end of [WIRE_FROM, WIRE_TO]) {
    const points: V3[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const s = i / 12;
      points.push([
        end[0] + (TOWN_LAMP[0] - end[0]) * s,
        end[1] + (TOWN_LAMP[1] - end[1]) * s - 4 * HALF_SAG * s * (1 - s),
        end[2] + (TOWN_LAMP[2] - end[2]) * s,
      ]);
    }
    tubePath(b, points, WIRE_RADIUS, 5);
    // A plate and an eye on the wall where it is fixed.
    const facing = end[2] > TOWN_LAMP[2] ? -1 : 1;
    beam(b, [end[0], end[1], end[2] - facing * 0.03], [end[0], end[1], end[2] + facing * 0.04], 0.12, 0.12);
  }
  return b.mesh(plain(0.4, 0.8), 'TownLampWire');
}

/**
 * The empty lantern, its hanging point at the origin: a ring over the wire,
 * a short rod, a six-sided hood with a finial, a cage of six posts between
 * two rings, flaring upward, three arms under it to a drop finial, and
 * inside, on three short arms, the empty ring a glass globe sat in.
 */
function createFrame(): Mesh {
  const b = new PartBuilder();
  b.color(IRON);
  const vertex = (r: number, y: number, k: number): V3 => {
    const a = (k / SIDES) * Math.PI * 2 + Math.PI / SIDES;
    return [r * Math.cos(a), y, r * Math.sin(a)];
  };
  // Hung from the wire by a ring around it, then a rod down to the hood.
  torus(b, [0, -0.045, 0], [WIRE_TO[0] - WIRE_FROM[0], 0, WIRE_TO[2] - WIRE_FROM[2]], 0.05, 0.012, 12, 5);
  tube(b, [0, -0.09, 0], [0, CAP_TOP + 0.02, 0], 0.014, 6);
  blob(b, [0, CAP_TOP + 0.01, 0], 0.035, 1);
  prism(b, WORLD, 0, 0, CAP_TOP - 0.03, CAP_TOP, 0.06, 0.03, SIDES, { phase: Math.PI / SIDES });
  // The hood, overhanging the cage a little, closed underneath.
  prism(b, WORLD, 0, 0, TOP_RING, CAP_TOP - 0.03, TOP_R + 0.05, 0.06, SIDES, { bottom: true, phase: Math.PI / SIDES });
  // The cage: two rings of bars and six posts between them.
  for (let k = 0; k < SIDES; k += 1) {
    beam(b, vertex(TOP_R, TOP_RING - 0.02, k), vertex(TOP_R, TOP_RING - 0.02, k + 1), 0.028, 0.035);
    beam(b, vertex(BOTTOM_R, BOTTOM_RING, k), vertex(BOTTOM_R, BOTTOM_RING, k + 1), 0.028, 0.035);
    beam(b, vertex(BOTTOM_R, BOTTOM_RING - 0.0175, k), vertex(TOP_R, TOP_RING - 0.0025, k), 0.026, 0.026);
  }
  // Three arms under the cage to a drop finial.
  const drop: V3 = [0, BOTTOM_RING - 0.14, 0];
  for (let k = 0; k < SIDES; k += 2) beam(b, vertex(BOTTOM_R, BOTTOM_RING - 0.015, k), drop, 0.022, 0.022);
  blob(b, [0, BOTTOM_RING - 0.16, 0], 0.03, 1.4);
  // The empty seat of the glass: a ring on three short arms from the posts.
  const seatY = BOTTOM_RING + 0.07;
  const seatR = 0.13;
  const postR = BOTTOM_R + ((TOP_R - BOTTOM_R) * (seatY - BOTTOM_RING)) / (TOP_RING - BOTTOM_RING);
  torus(b, [0, seatY, 0], [0, 1, 0], seatR, 0.011, 18, 5);
  for (let k = 1; k < SIDES; k += 2) beam(b, vertex(seatR, seatY, k), vertex(postR, seatY, k), 0.018, 0.018);
  return b.mesh(plain(0.4, 0.8), 'TownLampFrame');
}
