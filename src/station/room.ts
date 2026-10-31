import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { blob, box, PartBuilder, torus, tube, WORLD } from './facade.js';
import { MeshBuilder } from './geometry.js';
import { ROOM, SILL, WINDOW } from './layout.js';
import { glowing, interiorPaint, plain, scanned } from './materials.js';
import { createPostcard } from './postcard.js';

// Vertex tints multiply the scanned albedo; near white keeps the scan's own colour.
const NATURAL = 0xffffff;
const STONE_SHADE = 0xd8d2c8;
const BEAM_TINT = 0xb89a80;
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
  key: Mesh;
}

/** Latch rest position: a sliding bolt on the sill, pulled to the right. */
export const LATCH_REST = { x: 0, y: SILL.top + 0.045, z: -0.4 } as const;
export const LATCH_TRAVEL = 0.1;
export const LATCH_THRESHOLD = 0.07;

/** The recenter nail sits on the near-left corner of the sill. */
export const NAIL_POSITION = { x: -0.55, y: SILL.top + 0.02, z: -0.22 } as const;

/** The key to the tower door lies on the near-right corner of the sill. */
export const KEY_POSITION = { x: 0.5, y: SILL.top, z: -0.26 } as const;

export function createRoom(): RoomParts {
  // Each builder repeats its scan at the scan's real size, so stones, tiles
  // and planks read at true scale from arm's length.
  const walls = new MeshBuilder(1.5);
  const floor = new MeshBuilder(2.08);
  const ceiling = new MeshBuilder(1.5);
  const sill = new MeshBuilder(3);
  const frame = new MeshBuilder(1.5);
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

  const room = new Group();
  room.name = 'Room';
  room.add(
    walls.mesh(scanned('medieval_blocks_02', INTERIOR), 'RoomWalls'),
    floor.mesh(scanned('terracotta_floor_tiles', INTERIOR), 'RoomFloor'),
    ceiling.mesh(scanned('roof_planks', INTERIOR), 'RoomCeiling'),
    sill.mesh(scanned('large_sandstone_blocks_01', INTERIOR), 'Sill'),
    frame.mesh(scanned('roof_planks', INTERIOR), 'WindowFrame'),
    createLatchPlate(),
    createShutterLight(),
    createPostcard(),
  );

  return {
    room,
    shutterLeft: createShutterLeaf('left'),
    shutterRight: createShutterLeaf('right'),
    latch: createLatch(),
    nail: createNail(),
    key: createKey(),
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
  // The game's name, painted across the inside of both leaves; each leaf carries its half.
  // Across the stiles too, so the two halves meet at the centre line with no gap in the letters.
  const title = new Mesh(new PlaneGeometry(leafWidth, height - 0.12), titleMaterial(side));
  title.name = side === 'left' ? 'ShutterTitleLeft' : 'ShutterTitleRight';
  title.position.set((x0 + x1) / 2, height / 2, 0.0158);
  leaf.add(title);

  const pivot = new Group();
  pivot.name = side === 'left' ? 'ShutterLeft' : 'ShutterRight';
  pivot.position.set(side === 'left' ? -WINDOW.halfWidth : WINDOW.halfWidth, WINDOW.bottom, SILL.outerZ - 0.03);
  pivot.add(leaf);
  return pivot;
}

/**
 * The sliding part of a brass barrel bolt: the round bolt and the ball knob
 * on its right end, the part you pinch. Its own material, so it can glow
 * when it is the next thing to touch; the plate and keepers stay put.
 */
function createLatch(): Mesh {
  const b = new PartBuilder();
  b.color(BRASS_DARK);
  tube(b, [-0.09, 0, 0], [0.006, 0, 0], 0.0085, 14, true);
  b.color(BRASS);
  tube(b, [0, 0, 0], [0, 0.014, 0], 0.005, 10, false);
  // As big as the old square knob, so it is as easy to find with a fingertip.
  blob(b, [0, 0.02, 0], 0.017, 1);
  const latch = b.mesh(glowing(0.32, 0.9), 'Latch');
  latch.position.set(LATCH_REST.x, LATCH_REST.y, LATCH_REST.z);
  return latch;
}

/** The bolt's fixed half: a backplate on the sill with two screws, and two keepers the bolt slides through. */
function createLatchPlate(): Mesh {
  const b = new PartBuilder();
  b.round = 0.003;
  b.color(BRASS_DARK, 0.9);
  const { x, y, z } = LATCH_REST;
  box(b, WORLD, x - 0.115, SILL.top, z - 0.022, x - 0.01, SILL.top + 0.006, z + 0.022);
  b.color(BRASS);
  for (const kx of [x - 0.098, x - 0.03]) {
    torus(b, [kx, y, z], [1, 0, 0], 0.0125, 0.0035, 16, 6);
    box(b, WORLD, kx - 0.0035, SILL.top + 0.004, z - 0.006, kx + 0.0035, y - 0.012, z + 0.006);
  }
  b.color(IRON, 1.4);
  for (const sx of [x - 0.108, x - 0.017]) tube(b, [sx, SILL.top + 0.006, z], [sx, SILL.top + 0.0085, z], 0.0035, 8, true);
  return b.mesh(plain(0.35, 0.9, true), 'LatchPlate');
}

/** The heights (above the window's bottom) and sizes of the gaps between the shutter slats. */
function slatGaps(): { y: number; h: number }[] {
  const height = WINDOW.top - WINDOW.bottom;
  const pitch = (height - 0.12) / 11;
  const gaps = [{ y: 0.064, h: 0.008 }];
  for (let i = 0; i < 10; i += 1) gaps.push({ y: 0.06 + (i + 1) * pitch + 0.002, h: 0.012 });
  return gaps;
}

/**
 * Daylight through the closed shutters: one soft sheet of light from each
 * gap between the slats, slanting down into the room, and where the lower
 * ones land, a bright line on the sill. ShutterSystem fades them as the
 * shutters open. Additive, so they only ever add light.
 */
function createShutterLight(): Mesh {
  const angle = (32 * Math.PI) / 180;
  const dy = -Math.sin(angle);
  const dz = Math.cos(angle);
  const x0 = -WINDOW.halfWidth + 0.05;
  const x1 = WINDOW.halfWidth - 0.05;
  const z0 = SILL.outerZ - 0.012;
  const positions: number[] = [];
  const uvs: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], v0: number, v1: number) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    uvs.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
  };
  for (const gap of slatGaps()) {
    const y0 = WINDOW.bottom + gap.y;
    // Down to the sill top if it lands on the sill, otherwise a shorter sheet that fades in the air.
    const toSill = (y0 - SILL.top) / -dy;
    const landsOnSill = z0 + toSill * dz < SILL.innerZ;
    const length = landsOnSill ? toSill : 0.7;
    const y1 = y0 + dy * length;
    const z1 = z0 + dz * length;
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], 1, landsOnSill ? 0.35 : 0);
    if (landsOnSill) {
      // The line it draws on the stone, spread a little with distance.
      const w = gap.h * 0.6 + toSill * 0.02;
      const ys = SILL.top + 0.0015;
      quad([x0, ys, z1 - w], [x1, ys, z1 - w], [x1, ys, z1 + w], [x0, ys, z1 + w], 0.9, 0.9);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  const material = new MeshBasicMaterial({
    map: lightTexture(),
    color: 0xfff1d8,
    transparent: true,
    opacity: 0.12,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const light = new Mesh(geometry, material);
  light.name = 'ShutterLight';
  light.renderOrder = 2;
  return light;
}

/** Bright at v = 1 (the gap), fading to nothing at v = 0; soft at both ends across the window. */
function lightTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    const along = g.createLinearGradient(0, 64, 0, 0);
    along.addColorStop(0, 'rgba(255,255,255,0)');
    along.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = along;
    g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'destination-in';
    const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)');
    across.addColorStop(0.12, 'rgba(0,0,0,1)');
    across.addColorStop(0.88, 'rgba(0,0,0,1)');
    across.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = across;
    g.fillRect(0, 0, 64, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** One canvas for both leaves: 'Every Window Lit' in faded cream, painted on the slats only, so the gaps cut the letters. */
let titleCanvas: HTMLCanvasElement | null = null;

function titleMaterial(side: 'left' | 'right') {
  if (titleCanvas == null) {
    const leafWidth = WINDOW.halfWidth;
    const height = WINDOW.top - WINDOW.bottom - 0.12;
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = Math.round((2048 * height) / (2 * leafWidth));
    const g = canvas.getContext('2d');
    if (g != null) {
      const h = canvas.height;
      g.fillStyle = 'rgba(238, 226, 200, 0.9)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `italic 400 ${Math.round(h * 0.13)}px Georgia, "Times New Roman", serif`;
      // A little below the middle of the leaves, where the eye falls from the seat.
      g.fillText('Every Window Lit', canvas.width / 2, h * 0.56, canvas.width * 0.86);
      // Worn paint: a few flecks missing.
      g.globalCompositeOperation = 'destination-out';
      let seed = 7;
      for (let i = 0; i < 900; i += 1) {
        seed = (seed * 16807) % 2147483647;
        const px = (seed % 10000) / 10000;
        seed = (seed * 16807) % 2147483647;
        const py = (seed % 10000) / 10000;
        g.fillRect(px * canvas.width, py * h, 3 + (i % 4), 2 + (i % 3));
      }
      // No paint over the gaps between the slats (the plane starts at the bottom rail's top, 0.06 m up).
      const toPx = (yUp: number) => h - ((yUp - 0.06) / height) * h;
      for (const gap of slatGaps()) {
        const top = toPx(gap.y + gap.h / 2);
        g.fillRect(0, top, canvas.width, toPx(gap.y - gap.h / 2) - top);
      }
    }
    titleCanvas = canvas;
  }
  const texture = new CanvasTexture(titleCanvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  // Each leaf shows its half of the canvas.
  texture.repeat.set(0.5, 1);
  texture.offset.set(side === 'left' ? 0 : 0.5, 0);
  return interiorPaint(texture);
}

function createNail(): Mesh {
  const b = new MeshBuilder();
  b.box(-0.012, -0.02, -0.012, 0.012, 0.012, 0.012, IRON, false);
  const nail = b.mesh(plain(0.6, 0.8, true), 'RecenterNail');
  nail.position.set(NAIL_POSITION.x, NAIL_POSITION.y, NAIL_POSITION.z);
  return nail;
}

/**
 * An old iron door key lying flat on the sill, bit toward the room: the
 * Keeper takes it to go down to the square. Iron like the ring on the tower
 * door it opens, and unlike the harbour master's brass key that comes up in
 * the basket later.
 */
function createKey(): Mesh {
  const b = new PartBuilder();
  b.color(IRON, 1.6);
  const y = 0.0045;
  torus(b, [0.05, y, 0], [0, 1, 0], 0.021, 0.0045, 20, 6);
  tube(b, [0.03, y, 0], [-0.07, y, 0], 0.0038, 8, true);
  tube(b, [0.026, y, 0], [0.017, y, 0], 0.0062, 8, true);
  b.color(IRON, 1.3);
  box(b, WORLD, -0.07, y - 0.0035, 0, -0.058, y + 0.0035, 0.019);
  box(b, WORLD, -0.052, y - 0.0035, 0, -0.044, y + 0.0035, 0.014);
  const key = b.mesh(plain(0.5, 0.85, true), 'TowerKey');
  key.position.set(KEY_POSITION.x, KEY_POSITION.y, KEY_POSITION.z);
  key.rotation.y = 0.3;
  return key;
}
