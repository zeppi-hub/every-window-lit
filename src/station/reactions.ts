import { Color, Group, InstancedMesh, type Material, Matrix4, type Mesh, Quaternion, Vector3 } from '@iwsdk/core';
import type { Tier } from '../season/model.js';
import { ALL, blob, box, createKit, Frame, type Kit, type PartBuilder, prism, torus, tube, type V3, WORLD } from './facade.js';
import { type Box, PLAZA_Y } from './layout.js';
import { plain, scanned } from './materials.js';
import { modelInstances } from './models.js';
import { bicycle, openBox, parasol } from './square.js';
import { ROW_FRONT, ROW_WALK } from './town.js';

/**
 * How the square shows the week's pressure, each kind of week always in
 * the same place, so the Keeper learns to read it once:
 *
 * - fuel: cars parked along the kerb across the square, fewer as pump
 *   prices bite, and more bicycles in the rack by the fountain;
 * - power: how many windows light up in the evening (EveningSystem);
 * - food: three market stalls right of the fountain, their crates fuller
 *   or thinner, and fewer of them open when it bites.
 *
 * Repeated things are instanced, so a whole row of cars or bicycles costs
 * a few draw calls; hidden instances are scaled to nothing.
 */

/** How many of each show at each tier: a clear fall (-1), calm (0), then small, medium and large rises. */
export const CARS_SHOWN: Readonly<Record<Tier, number>> = { [-1]: 6, 0: 5, 1: 3, 2: 2, 3: 1 };
export const BIKES_SHOWN: Readonly<Record<Tier, number>> = { [-1]: 1, 0: 2, 1: 4, 2: 6, 3: 8 };
/** Share of the town's windows lit in the evening. */
export const LIT_SHARE: Readonly<Record<Tier, number>> = { [-1]: 0.92, 0: 0.8, 1: 0.66, 2: 0.52, 3: 0.4 };
export const STALLS_OPEN: Readonly<Record<Tier, number>> = { [-1]: 3, 0: 3, 1: 3, 2: 2, 3: 1 };
/** Share of an open stall's crates with produce in them. */
export const CRATES_FULL: Readonly<Record<Tier, number>> = { [-1]: 1, 0: 5 / 6, 1: 4 / 6, 2: 3 / 6, 3: 2 / 6 };

/**
 * Parked against the row's kerb, in the order they come and go: the first
 * stays even in the hardest week. It parks right of the fountain, where the
 * tram, once it runs, does not hide it from the seat.
 */
/** The kerb lane in front of the row, where the cars park. */
export const CAR_Z = ROW_FRONT + ROW_WALK + 1.05;
const CARS: ReadonlyArray<{ x: number; east: boolean; colour: number }> = [
  { x: 20.2, east: true, colour: 0x7a3b34 },
  { x: -5.4, east: false, colour: 0x5f8a86 },
  { x: 9.6, east: true, colour: 0xe3d7bb },
  { x: -11.2, east: false, colour: 0x34465e },
  { x: 14.9, east: true, colour: 0x2f2e2c },
  { x: 25.2, east: false, colour: 0x6b6f4a },
];
export const CAR_SOLIDS: readonly Box[] = CARS.map(({ x }): Box => [x - 2.3, PLAZA_Y - 1, CAR_Z - 0.9, x + 2.3, PLAZA_Y + 1.6, CAR_Z + 0.9]);

/** The bicycle rack on the square, left of the fountain and clear of the pigeons. */
const RACK = { x0: -2.6, x1: 1.3, z: -18.4 } as const;
/** The prepared car models (public/models), front toward +x like the procedural car. */
const CAR_MODELS = ['car_cord', 'car_model_a', 'car_pv'] as const;
const BIKES = 8;
export const RACK_SOLID: Box = [RACK.x0 - 0.2, PLAZA_Y - 1, RACK.z - 1.0, RACK.x1 + 0.2, PLAZA_Y + 1.2, RACK.z + 1.0];

/**
 * Three market stalls right of the fountain, facing the tower: trestle
 * tables of crates under parasols. Near enough to the tower that, from the
 * seat, the parasols pass under the line of sight to the cars at the kerb.
 */
const STALLS: readonly number[] = [8.5, 11.5, 14.5];
const STALL_Z = -17.6;
const CRATES = 6;
export const STALL_SOLIDS: readonly Box[] = STALLS.map((x): Box => [x - 1.1, PLAZA_Y - 1, STALL_Z - 0.55, x + 1.1, PLAZA_Y + 1.2, STALL_Z + 0.55]);
const PRODUCE: readonly number[] = [0xb83a2a, 0xe08a2a, 0x5f8a3a, 0xe6c64a, 0x6a3a62, 0x9a7a52];

export interface ReactionParts {
  /** The bicycle rack, the stalls' tables and crates, and every instanced set below. */
  group: Group;
  /** One instanced mesh per material of a car; six instances each, in CARS order. */
  cars: InstancedMesh[];
  bikes: InstancedMesh[];
  /** Produce in the crates, stall by stall, and the stalls' parasols. */
  produce: InstancedMesh;
  parasols: InstancedMesh[];
}

const MATERIALS = (): Array<[keyof Kit, Material]> => [
  ['paint', plain(0.42, 0.05)],
  ['metal', plain(0.3, 0.9)],
  ['glass', plain(0.1)],
  ['wood', scanned('wood_shutter')],
  ['cloth', plain(0.85)],
  ['stone', plain(0.9)],
];

/** Each part of a kit as an instanced mesh with `count` instances at the given matrices. */
function instanced(name: string, build: (kit: Kit) => void, matrices: readonly Matrix4[], colours?: readonly number[]): InstancedMesh[] {
  const kit = createKit();
  build(kit);
  const meshes: InstancedMesh[] = [];
  for (const [part, material] of MATERIALS()) {
    const builder = kit[part] as PartBuilder;
    if (builder.triangles === 0) continue;
    const shape = builder.mesh(material, `${name}${part}`) as Mesh;
    const mesh = new InstancedMesh(shape.geometry, material, matrices.length);
    mesh.name = shape.name;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    // Only the body paint takes each instance's colour; everything else stays as built.
    if (colours != null && part === 'paint') colours.forEach((c, i) => mesh.setColorAt(i, new Color(c)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  }
  return meshes;
}

function placed(x: number, y: number, z: number, yaw: number): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));
}

export function createReactions(): ReactionParts {
  const group = new Group();
  group.name = 'Reactions';

  // Three real car models of the time (CREDITS.md), taking the places in turn; the procedural car if they are not loaded.
  const homes = CARS.map(({ x, east }) => placed(x, PLAZA_Y, CAR_Z, east ? 0 : Math.PI));
  const models = CAR_MODELS.map((key, m) => {
    const slots = CARS.map((_, i) => i).filter((i) => i % CAR_MODELS.length === m);
    return modelInstances(key, 'TrafficCar', slots.map((i) => homes[i]), slots);
  });
  const cars = models.every((m) => m != null)
    ? models.flatMap((m) => m ?? [])
    : instanced('TrafficCar', (kit) => car(kit, WORLD), homes, CARS.map(({ colour }) => colour));

  // Bicycles stand in the rack pointing away from the tower, a little apart.
  const bikeAt = (i: number) => RACK.x0 + 0.25 + (i * (RACK.x1 - RACK.x0 - 0.5)) / (BIKES - 1);
  const bikeHomes = Array.from({ length: BIKES }, (_, i) => placed(bikeAt(i), PLAZA_Y, RACK.z, -Math.PI / 2 + (i % 2 === 0 ? 0.03 : -0.04)));
  const bikes =
    modelInstances('bicycle', 'RackBike', bikeHomes) ?? instanced('RackBike', (kit) => bicycle(kit, WORLD, { frame: 0x2f5f4a, guards: 0xefe7d2 }), bikeHomes);

  const statics = createKit();
  rack(statics, bikeAt);
  for (const x of STALLS) stall(statics, x);
  const parts: Array<[keyof Kit, Material]> = MATERIALS();
  for (const [part, material] of parts) {
    const builder = statics[part] as PartBuilder;
    if (builder.triangles > 0) group.add(builder.mesh(material, `Reactions${part}`));
  }

  // One pile of produce per crate, coloured per crate; a hidden one is scaled to nothing.
  const pile = createKit();
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * Math.PI * 2;
    const r = k === 0 ? 0 : 0.09;
    blob(pile.paint.color(0xffffff), [r * Math.cos(a) * 1.4, 0.05 + (k === 0 ? 0.03 : 0), r * Math.sin(a) * 0.8], 0.055, 0.85);
  }
  const pileMesh = pile.paint.mesh(plain(0.75), 'ProducePile') as Mesh;
  const produce = new InstancedMesh(pileMesh.geometry, pileMesh.material as Material, STALLS.length * CRATES);
  produce.name = 'StallProduce';
  STALLS.forEach((x, s) => {
    for (let c = 0; c < CRATES; c += 1) {
      const [cx, cz] = crateAt(x, c);
      const i = s * CRATES + c;
      produce.setMatrixAt(i, placed(cx, PLAZA_Y + TABLE + 0.02, cz, 0));
      produce.setColorAt(i, new Color(PRODUCE[(c + s * 2) % PRODUCE.length]));
    }
  });
  produce.computeBoundingSphere();

  // parasol() stands its base on the square; the instances add only the x and z.
  const parasols = instanced('StallParasol', (kit) => parasol(kit, 0, 0, [0xefe7d4, 0x2f4f6f]), STALLS.map((_, i) => PARASOL_HOME(i)));

  for (const mesh of [...cars, ...bikes, produce, ...parasols]) group.add(mesh);
  return { group, cars, bikes, produce, parasols };
}

/** Shows `n` of an instanced set in order and scales the rest to nothing; `at` gives each one's home matrix. */
export function showFirst(meshes: readonly InstancedMesh[], n: number, at: (i: number) => Matrix4): void {
  for (const mesh of meshes) {
    const capacity = mesh.instanceMatrix.count;
    // A mesh standing for only some of the places (one car model of three) shows those of its places below n.
    const slots = mesh.userData.slots as readonly number[] | undefined;
    if (slots != null) {
      let k = 0;
      for (const i of slots) if (i < n) mesh.setMatrixAt(k++, at(i));
      for (let j = k; j < capacity; j += 1) mesh.setMatrixAt(j, HIDDEN);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = k;
      continue;
    }
    for (let i = 0; i < capacity; i += 1) mesh.setMatrixAt(i, i < n ? at(i) : HIDDEN);
    mesh.instanceMatrix.needsUpdate = true;
    // The hidden ones are the last: they are not drawn at all.
    mesh.count = Math.min(n, capacity);
  }
}

/** A matrix that shrinks an instance to nothing. */
export const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Home matrices, for showing and hiding instances again. */
export const CAR_HOME = (i: number): Matrix4 => placed(CARS[i].x, PLAZA_Y, CAR_Z, CARS[i].east ? 0 : Math.PI);
export const BIKE_HOME = (i: number): Matrix4 =>
  placed(RACK.x0 + 0.25 + (i * (RACK.x1 - RACK.x0 - 0.5)) / (BIKES - 1), PLAZA_Y, RACK.z, -Math.PI / 2 + (i % 2 === 0 ? 0.03 : -0.04));
export const PARASOL_HOME = (i: number): Matrix4 => placed(STALLS[i], 0, STALL_Z + 0.75, 0);
export const PRODUCE_HOME = (i: number): Matrix4 => {
  const [cx, cz] = crateAt(STALLS[Math.floor(i / CRATES)], i % CRATES);
  return placed(cx, PLAZA_Y + TABLE + 0.02, cz, 0);
};
export const STALL_COUNT = STALLS.length;
export const CRATES_PER_STALL = CRATES;

const TABLE = 0.82;

/** A crate's centre on its stall's table: three along, two deep. */
function crateAt(x: number, c: number): [number, number] {
  return [x - 0.62 + (c % 3) * 0.62, STALL_Z - 0.2 + Math.floor(c / 3) * 0.4];
}

/** A trestle table with six shallow wooden crates on it. */
function stall(kit: Kit, x: number): void {
  const w = kit.wood.color(0xa07a52);
  box(w, WORLD, x - 1.0, PLAZA_Y + TABLE - 0.04, STALL_Z - 0.45, x + 1.0, PLAZA_Y + TABLE, STALL_Z + 0.45, ALL);
  for (const dx of [-0.85, 0.85]) {
    for (const dz of [-0.35, 0.35]) box(w, WORLD, x + dx - 0.03, PLAZA_Y, STALL_Z + dz - 0.03, x + dx + 0.03, PLAZA_Y + TABLE - 0.04, STALL_Z + dz + 0.03, ALL);
  }
  for (let c = 0; c < CRATES; c += 1) {
    const [cx, cz] = crateAt(x, c);
    openBox(kit.wood.color(0xc9a678), WORLD, cx - 0.28, PLAZA_Y + TABLE, cz - 0.18, cx + 0.28, PLAZA_Y + TABLE + 0.16, cz + 0.18, 0.015);
  }
}

/** A low iron rack of hoops for the bicycles. */
function rack(kit: Kit, bikeAt: (i: number) => number): void {
  const m = kit.metal.color(0x24302a);
  tube(m, [RACK.x0, PLAZA_Y + 0.35, RACK.z + 0.42], [RACK.x1, PLAZA_Y + 0.35, RACK.z + 0.42], 0.022, 8, true);
  for (let i = 0; i < BIKES; i += 1) {
    const x = bikeAt(i) - 0.14;
    torus(m, [x, PLAZA_Y + 0.35, RACK.z + 0.42], [1, 0, 0], 0.33, 0.016, 14, 5);
  }
}

/**
 * A rounded mid-century saloon, about 4.3 m long, bonnet toward the frame's
 * tangent. The body is painted white so each instance takes its own colour;
 * the lamps are glass so they keep theirs.
 */
export function car(kit: Kit, f: Frame): void {
  const p = kit.paint;
  const round = p.round;
  p.round = 0.12;
  p.color(0xffffff);
  box(p, f, -2.1, 0.32, -0.83, 2.1, 0.86, 0.83, ALL);
  p.round = 0.1;
  box(p, f, -1.15, 0.86, -0.74, 0.65, 1.42, 0.74, ALL);
  p.round = round;
  // Windows round the cabin.
  const g = kit.glass.color(0x1f2a30);
  for (const side of [-1, 1]) {
    const w = side * 0.745;
    g.quadToward(f.p(-1.0, 0.92, w), f.p(0.5, 0.92, w), f.p(0.45, 1.34, w), f.p(-0.95, 1.34, w), f.v(0, 0, side));
  }
  g.quadToward(f.p(0.655, 0.92, -0.62), f.p(0.655, 0.92, 0.62), f.p(0.655, 1.34, 0.58), f.p(0.655, 1.34, -0.58), f.v(1, 0, 0));
  g.quadToward(f.p(-1.155, 0.94, -0.6), f.p(-1.155, 0.94, 0.6), f.p(-1.155, 1.32, 0.56), f.p(-1.155, 1.32, -0.56), f.v(-1, 0, 0));
  // Chrome bumpers and a grille, lamps, and wheels in dark arches.
  const chrome = kit.metal.color(0xd8d8d4);
  box(chrome, f, 2.05, 0.3, -0.84, 2.2, 0.42, 0.84, ALL);
  box(chrome, f, -2.2, 0.3, -0.84, -2.05, 0.42, 0.84, ALL);
  box(chrome, f, 2.09, 0.48, -0.35, 2.12, 0.74, 0.35, ALL);
  kit.glass.color(0xf6efd8);
  for (const side of [-1, 1]) prism(kit.glass, Frame.of(f.p(2.08, 0.66, side * 0.6), f.v(0, 0, 1), f.v(1, 0, 0)), 0, 0, 0, 0.05, 0.085, 0.085, 14, { smooth: true, top: true });
  kit.glass.color(0x8a2a24);
  for (const side of [-1, 1]) box(kit.glass, f, -2.12, 0.58, side * 0.7 - 0.08, -2.08, 0.68, side * 0.7 + 0.08, ALL);
  for (const u of [-1.35, 1.35]) {
    for (const side of [-1, 1]) {
      const hub: V3 = f.p(u, 0.34, side * 0.78);
      torus(kit.cloth.color(0x1c1c1c), hub, f.v(0, 0, 1), 0.24, 0.1, 18, 8);
      prism(kit.metal.color(0xc8c8c4), Frame.of(hub, f.v(1, 0, 0), f.v(0, 0, side)), 0, 0, 0, 0.06, 0.15, 0.15, 14, { smooth: true, top: true });
    }
  }
}
