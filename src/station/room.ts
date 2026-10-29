import { Group, type Mesh } from '@iwsdk/core';
import { MeshBuilder } from './geometry.js';
import { PLAZA_Y, ROOM, SILL, WINDOW } from './layout.js';
import { plain, scanned } from './materials.js';

// Vertex tints multiply the scanned albedo; near white keeps the scan's own colour.
const NATURAL = 0xffffff;
const STONE_SHADE = 0xd8d2c8;
const BEAM_TINT = 0xb89a80;
const FACADE_TINT = 0xf2e6cf;
const FRAME_TINT = 0x8a6a4c;
const SHUTTER_GREEN = 0x8fb07a;
const SHUTTER_GREEN_DARK = 0x7a9a68;
const BRASS = 0xc9a349;
const BRASS_DARK = 0xa8873a;
const IRON = 0x3b3833;
/** The room is lit by the sky through the window, never by the sun directly. */
const INTERIOR = { interior: true } as const;

export interface RoomParts {
  room: Group;
  shutterLeft: Group;
  shutterRight: Group;
  latch: Mesh;
  nail: Mesh;
}

/** Latch rest position: a sliding bolt on the sill, pulled to the right. */
export const LATCH_REST = { x: 0, y: SILL.top + 0.045, z: -0.4 } as const;
export const LATCH_TRAVEL = 0.1;
export const LATCH_THRESHOLD = 0.07;

/** The recenter nail sits on the near-left corner of the sill. */
export const NAIL_POSITION = { x: -0.55, y: SILL.top + 0.02, z: -0.22 } as const;

export function createRoom(): RoomParts {
  // Each builder repeats its scan at the scan's real size, so stones, tiles
  // and planks read at true scale from arm's length.
  const walls = new MeshBuilder(1.5);
  const floor = new MeshBuilder(2.08);
  const ceiling = new MeshBuilder(1.5);
  const sill = new MeshBuilder(3);
  const frame = new MeshBuilder(1.5);
  const facade = new MeshBuilder(2.5);
  const { halfWidth, backZ, height } = ROOM;
  const { innerZ, outerZ } = SILL;
  const w = WINDOW.halfWidth;

  // Floor, ceiling and its beams.
  floor.box(-halfWidth, -0.05, outerZ, halfWidth, 0, backZ, NATURAL);
  ceiling.box(-halfWidth, height, outerZ, halfWidth, height + 0.1, backZ, BEAM_TINT, false);
  for (let z = 0.2; z < backZ; z += 0.6) {
    ceiling.box(-halfWidth, height - 0.14, z, halfWidth, height, z + 0.14, BEAM_TINT, false);
  }

  // Side and back walls.
  walls.box(-halfWidth - 0.1, 0, outerZ, -halfWidth, height, backZ, NATURAL);
  walls.box(halfWidth, 0, outerZ, halfWidth + 0.1, height, backZ, NATURAL);
  walls.box(-halfWidth, 0, backZ, halfWidth, height, backZ + 0.1, STONE_SHADE);

  // Window wall: under-sill, two piers and the lintel around the opening.
  walls.box(-halfWidth, 0, outerZ, halfWidth, SILL.top - 0.08, innerZ, STONE_SHADE);
  walls.box(-halfWidth, SILL.top - 0.08, outerZ, -w, height, innerZ, NATURAL);
  walls.box(w, SILL.top - 0.08, outerZ, halfWidth, height, innerZ, NATURAL);
  walls.box(-w, WINDOW.top, outerZ, w, height, innerZ, NATURAL);

  // The sill slab, slightly proud of the wall on the room side.
  sill.box(-SILL.halfWidth, SILL.top - 0.08, outerZ, SILL.halfWidth, SILL.top, innerZ + 0.03, NATURAL);

  // Wooden frame on the outer face of the opening.
  const fz0 = outerZ - 0.01;
  const fz1 = outerZ + 0.03;
  frame.box(-w - 0.05, WINDOW.bottom, fz0, -w, WINDOW.top, fz1, FRAME_TINT);
  frame.box(w, WINDOW.bottom, fz0, w + 0.05, WINDOW.top, fz1, FRAME_TINT);
  frame.box(-w - 0.05, WINDOW.top, fz0, w + 0.05, WINDOW.top + 0.05, fz1, FRAME_TINT);

  // Tower facade below the window, seen when leaning out over the square.
  facade.box(-3, PLAZA_Y, outerZ - 0.06, 3, SILL.top - 0.08, outerZ, FACADE_TINT);

  const room = new Group();
  room.name = 'Room';
  room.add(
    walls.mesh(scanned('medieval_blocks_02', INTERIOR), 'RoomWalls'),
    floor.mesh(scanned('terracotta_floor_tiles', INTERIOR), 'RoomFloor'),
    ceiling.mesh(scanned('roof_planks', INTERIOR), 'RoomCeiling'),
    sill.mesh(scanned('large_sandstone_blocks_01', INTERIOR), 'Sill'),
    frame.mesh(scanned('roof_planks', INTERIOR), 'WindowFrame'),
    facade.mesh(scanned('painted_plaster_wall'), 'TowerFacade'),
  );

  return {
    room,
    shutterLeft: createShutterLeaf('left'),
    shutterRight: createShutterLeaf('right'),
    latch: createLatch(),
    nail: createNail(),
  };
}

/**
 * One louvred leaf inside a pivot group at its hinge. The left leaf extends
 * toward +x from its hinge, the right one toward -x; small gaps between the
 * slats let a little of the town through while closed.
 */
function createShutterLeaf(side: 'left' | 'right'): Group {
  const b = new MeshBuilder(1);
  const leafWidth = WINDOW.halfWidth;
  const height = WINDOW.top - WINDOW.bottom;
  const x0 = side === 'left' ? 0 : -leafWidth;
  const x1 = side === 'left' ? leafWidth : 0;
  const stile = 0.05;
  b.box(x0, 0, -0.015, x0 + stile, height, 0.015, SHUTTER_GREEN_DARK);
  b.box(x1 - stile, 0, -0.015, x1, height, 0.015, SHUTTER_GREEN_DARK);
  b.box(x0, 0, -0.015, x1, 0.06, 0.015, SHUTTER_GREEN_DARK);
  b.box(x0, height - 0.06, -0.015, x1, height, 0.015, SHUTTER_GREEN_DARK);
  const slats = 11;
  const pitch = (height - 0.12) / slats;
  for (let i = 0; i < slats; i += 1) {
    const y = 0.06 + i * pitch;
    b.box(x0 + stile, y + 0.008, -0.012, x1 - stile, y + pitch - 0.004, 0.012, SHUTTER_GREEN);
  }
  const leaf = b.mesh(
    scanned('wood_shutter', INTERIOR),
    side === 'left' ? 'ShutterLeafLeftMesh' : 'ShutterLeafRightMesh',
  );

  const pivot = new Group();
  pivot.name = side === 'left' ? 'ShutterLeft' : 'ShutterRight';
  pivot.position.set(side === 'left' ? -WINDOW.halfWidth : WINDOW.halfWidth, WINDOW.bottom, SILL.outerZ - 0.03);
  pivot.add(leaf);
  return pivot;
}

/** A brass bolt with a square knob; the knob is the part you pinch. */
function createLatch(): Mesh {
  const b = new MeshBuilder();
  b.box(-0.02, -0.02, -0.02, 0.02, 0.02, 0.02, BRASS, false);
  b.box(-0.09, -0.008, -0.008, 0.02, 0.008, 0.008, BRASS_DARK, false);
  const latch = b.mesh(plain(0.35, 0.9, true), 'Latch');
  latch.position.set(LATCH_REST.x, LATCH_REST.y, LATCH_REST.z);
  return latch;
}

function createNail(): Mesh {
  const b = new MeshBuilder();
  b.box(-0.012, -0.02, -0.012, 0.012, 0.012, 0.012, IRON, false);
  const nail = b.mesh(plain(0.6, 0.8, true), 'RecenterNail');
  nail.position.set(NAIL_POSITION.x, NAIL_POSITION.y, NAIL_POSITION.z);
  return nail;
}
