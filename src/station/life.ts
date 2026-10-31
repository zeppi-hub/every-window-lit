import {
  BufferAttribute,
  BufferGeometry,
  Color,
  createComponent,
  DynamicDrawUsage,
  type Entity,
  Euler,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  Vector3,
  type World,
} from '@iwsdk/core';
import { seededRandom } from './geometry.js';
import { PLAZA_Y } from './layout.js';
import { plain } from './materials.js';

/**
 * Life in the near town: pigeons on the square (two of them now and then fly
 * up to a roof and back) and gulls circling over the harbour to the front
 * left. No laundry hangs on the houses, by design. This module builds the
 * pieces and decides where they may go; LifeSystem (src/systems/life.ts)
 * moves them.
 *
 * Everything is instanced: five InstancedMeshes on the shared plain()
 * material, so five draw calls and under 3,000 triangles in all. The pose
 * functions at the end write instance matrices through module-level scratch
 * objects, so animating allocates nothing.
 *
 * Where things may go is read once from the town that is already built:
 * pigeons keep to open paving and the flying pigeons land on real roof
 * edges. createLife() must therefore run after the town and everything
 * placed on the square.
 */

/** Tags the entity that carries the town's birds, for LifeSystem. */
export const TownLife = createComponent(
  'TownLife',
  {},
  "The near town's pigeons and gulls; animated by LifeSystem.",
);

export const PIGEON_COUNT = 6;
export const GULL_COUNT = 4;

/** Front of the row of houses across the square: town.ts builds its facades at z = -27. */
const FACADE_Z = -27;
/** Pigeons land just behind that front, where the roof tiles meet the eaves. */
const ROOF_Z = FACADE_Z - 0.2;
/** Sea level of the panorama (SEA_Y in art/panorama/build_far_town.py). */
const SEA_Y = PLAZA_Y - 1.4;
/** The sky dome is a backdrop, not a surface to stand on. */
const SKY_DOME = 'SkyDome';

export interface Zone {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Flocks on the square, in view through the window and clear of the fountain and the market stalls. */
const ZONES: readonly Zone[] = [
  { x: -6.5, z: -16.2, radius: 3.0 },
  { x: 11.5, z: -13.4, radius: 1.9 },
  { x: 3.5, z: -21.5, radius: 2 },
];
/** Flock each pigeon starts in. Pigeons 1 and 2 are the ones that fly up to the roofs. */
const HOME_ZONE = [0, 0, 0, 1, 1, 2];
const FLYERS = [1, 2];
/**
 * Feather tone per pigeon over the shared rock-dove pattern (linear, so 0.46
 * reads as about 70 % as bright): mostly grey, some paler or darker.
 */
const PIGEON_TONES = [1, 0.84, 0.62, 0.94, 0.46, 0.76];
const PIGEON_SIZES = [1, 0.94, 1.05, 0.97, 1.03, 0.92];
/** Roof edges the flyers may land on, nearest found to each of these x positions. */
const PERCH_X = [-15, -9, -3, 4, 10, 16, 22];

/**
 * Gulls circling over the harbour: loop centre, radii, height above the sea,
 * speed (m/s) and turning direction. Kept within about 125 m of the seat, so
 * the haze (fog from 90 m) leaves them visible and the sky dome (150 m) and
 * the far plane (1500 m) stay behind them.
 */
const GULL_LOOPS = [
  { x: -40, z: -62, rx: 17, rz: 12, height: 17.5, speed: 6.8, dir: 1 },
  { x: -56, z: -80, rx: 16, rz: 13, height: 27, speed: 7.6, dir: -1 },
  { x: -36, z: -96, rx: 12, rz: 13, height: 35, speed: 7, dir: 1 },
  { x: -60, z: -60, rx: 12, rz: 10, height: 21, speed: 6.4, dir: -1 },
] as const;

/** Pigeon anatomy in its own frame (feet at the origin, beak toward +z), metres. */
const PIGEON = {
  hip: 0.045,
  neck: [0, 0.14, 0.055],
  shoulder: [0.034, 0.128, 0.022],
  /** Length and chord scale of the shared wing. */
  wing: [0.3, 0.42],
  /** Half width and half length of its shadow. */
  shadow: [0.07, 0.13],
} as const;
const GULL = {
  shoulder: [0.055, 0.03, 0.045],
  wing: [0.68, 0.56],
} as const;
/**
 * The sun comes from (-0.593, 0.743, 0.31), behind the player's left
 * shoulder, so a bird's shadow falls a little to the right and away.
 */
const SHADOW_SHIFT = [0.071, -0.037] as const;

// Colours (sRGB). Vertex colours carry each pattern; instance colours tint it.
const BODY = 0xa3a9b3;
const BODY_LIGHT = 0xb0b5bd;
const RUMP = 0xc6cad0;
const BELLY = 0x8f949d;
const BREAST = 0x9c959c;
const NECK_GREEN = 0x5f8c6f;
const NECK_PURPLE = 0x86698c;
const HEAD = 0x7f8691;
const BAR = 0x2c2d31;
const PRIMARY = 0x4c4f56;
const TAIL_BAND = 0x3a3b40;
const BEAK = 0x3d3b3b;
const LEG = 0xb35e55;
const WHITE = 0xffffff;
const WRIST = 0xe3e6ea;
const WING_TIP = 0x4a4d52;
const GULL_PLUMAGE = 0xf4f5f6;
const GULL_MANTLE = 0xbac1ca;
const GULL_BEAK = 0xe5bd45;
const GULL_WINGS = 0xf3f4f6;
/** Shadowed paving, approximated; tune against the first headset screenshot. */
const SHADOW = 0x56565a;

/** Where one pigeon is and what it is doing; LifeSystem fills one in every frame. */
export interface PigeonPose {
  /** Feet position in world space. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Body tilt about the hip: positive tips the head down (pecking), negative lifts it. */
  pitch: number;
  roll: number;
  headYaw: number;
  /** Positive nods the head down toward the paving. */
  headPitch: number;
  /** Wing angle above the horizontal (radians); NaN keeps them folded. */
  wings: number;
  /** Shadow size, 0..1; 0 hides it. */
  shadow: number;
}

export interface LifeRig {
  readonly pigeonBodies: InstancedMesh;
  readonly pigeonHeads: InstancedMesh;
  readonly shadows: InstancedMesh;
  /** Two per bird: pigeon i at 2i and 2i + 1, then the gulls. */
  readonly wings: InstancedMesh;
  readonly gullBodies: InstancedMesh;
  readonly pigeons: {
    /** 0 for a pigeon that found no open paving; it stays hidden. */
    readonly active: Uint8Array;
    readonly flyer: Uint8Array;
    readonly zone: Uint8Array;
    readonly size: Float32Array;
    readonly startX: Float32Array;
    readonly startZ: Float32Array;
    readonly startYaw: Float32Array;
    readonly zones: readonly Zone[];
    /** Roof edges to land on: x, y, z per perch. */
    readonly perches: Float32Array;
    readonly ground: GroundGrid;
  };
  readonly gulls: {
    /** Per gull: centre x, centre z, radius x, radius z, height, speed, direction, phase. */
    readonly loops: Float32Array;
  };
}

const rigs = new WeakMap<object, LifeRig>();

/** The rig createLife() attached to an entity's Object3D. */
export function lifeRigOf(object: object | null | undefined): LifeRig | undefined {
  return object == null ? undefined : rigs.get(object);
}

/**
 * Builds the town's birds and returns their entity. Call it after the town
 * and anything on the square exist: it reads them to find open paving and
 * roof edges.
 */
export function createLife(world: World): Entity {
  const random = seededRandom(23);
  const ground = new GroundGrid(
    Math.min(...ZONES.map((z) => z.x - z.radius)) - 0.5,
    Math.min(...ZONES.map((z) => z.z - z.radius)) - 0.5,
    Math.max(...ZONES.map((z) => z.x + z.radius)) + 0.5,
    Math.max(...ZONES.map((z) => z.z + z.radius)) + 0.5,
  );
  const roofline = new Roofline(-21, 26, ROOF_Z);
  surveyScene(world.scene, ground, roofline);

  const material = plain();
  const pigeonBodies = instanced(pigeonBody(), material, PIGEON_COUNT, 'LifePigeons');
  const pigeonHeads = instanced(pigeonHead(), material, PIGEON_COUNT, 'LifePigeonHeads');
  const shadows = instanced(shadowDisc(), material, PIGEON_COUNT, 'LifeShadows');
  const wings = instanced(wingShape(), material, 2 * (PIGEON_COUNT + GULL_COUNT), 'LifeWings');
  const gullBodies = instanced(gullBody(), material, GULL_COUNT, 'LifeGulls');

  const pigeons = placePigeons(random, ground, roofline);
  const tint = new Color();
  for (let i = 0; i < PIGEON_COUNT; i += 1) {
    const tone = PIGEON_TONES[i];
    pigeonBodies.setColorAt(i, tint.setScalar(tone));
    pigeonHeads.setColorAt(i, tint);
    shadows.setColorAt(i, tint.setHex(SHADOW));
    wings.setColorAt(2 * i, tint.setHex(BODY).multiplyScalar(tone));
    wings.setColorAt(2 * i + 1, tint);
  }
  const loops = new Float32Array(GULL_COUNT * 8);
  GULL_LOOPS.forEach((loop, j) => {
    loops.set(
      [loop.x, loop.z, loop.rx, loop.rz, SEA_Y + loop.height, loop.speed, loop.dir, random() * Math.PI * 2],
      j * 8,
    );
    gullBodies.setColorAt(j, tint.setHex(WHITE));
    wings.setColorAt(2 * (PIGEON_COUNT + j), tint.setHex(GULL_WINGS));
    wings.setColorAt(2 * (PIGEON_COUNT + j) + 1, tint);
  });

  const rig: LifeRig = {
    pigeonBodies,
    pigeonHeads,
    shadows,
    wings,
    gullBodies,
    pigeons,
    gulls: { loops },
  };

  // A complete still picture, even before LifeSystem's first frame.
  const pose: PigeonPose = {
    x: 0, y: PLAZA_Y, z: 0, yaw: 0, pitch: 0, roll: 0, headYaw: 0, headPitch: -0.12, wings: NaN, shadow: 1,
  };
  for (let i = 0; i < PIGEON_COUNT; i += 1) {
    if (pigeons.active[i] === 1) {
      pose.x = pigeons.startX[i];
      pose.z = pigeons.startZ[i];
      pose.yaw = pigeons.startYaw[i];
      posePigeon(rig, i, pose);
    } else {
      hidePigeon(rig, i);
    }
  }
  for (let j = 0; j < GULL_COUNT; j += 1) {
    const o = j * 8;
    const a = loops[o + 7];
    const yaw = Math.atan2(-loops[o + 2] * Math.sin(a) * loops[o + 6], loops[o + 3] * Math.cos(a) * loops[o + 6]);
    poseGull(rig, j, loops[o] + loops[o + 2] * Math.cos(a), loops[o + 4], loops[o + 1] + loops[o + 3] * Math.sin(a), yaw, 0, 0, 0.1);
  }

  const group = new Group();
  group.name = 'TownLife';
  group.add(pigeonBodies, pigeonHeads, shadows, wings, gullBodies);
  rigs.set(group, rig);
  return world.createTransformEntity(group, { persistent: true }).addComponent(TownLife);
}

// --- Posing (allocation-free; LifeSystem calls these every frame) ----------

const HIDDEN = new Matrix4().makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -500, 0);
const body = new Matrix4();
const part = new Matrix4();
const step = new Matrix4();
const euler = new Euler();
const scale = new Vector3();

export function posePigeon(rig: LifeRig, i: number, pose: Readonly<PigeonPose>): void {
  const size = rig.pigeons.size[i];
  body.makeRotationY(pose.yaw).setPosition(pose.x, pose.y, pose.z);
  body.scale(scale.setScalar(size));
  body.multiply(step.makeTranslation(0, PIGEON.hip, 0));
  body.multiply(step.makeRotationFromEuler(euler.set(pose.pitch, 0, pose.roll, 'XYZ')));
  body.multiply(step.makeTranslation(0, -PIGEON.hip, 0));
  rig.pigeonBodies.setMatrixAt(i, body);

  part.copy(body).multiply(step.makeTranslation(PIGEON.neck[0], PIGEON.neck[1], PIGEON.neck[2]));
  part.multiply(step.makeRotationFromEuler(euler.set(pose.headPitch, pose.headYaw, 0, 'YXZ')));
  rig.pigeonHeads.setMatrixAt(i, part);

  if (Number.isNaN(pose.wings)) {
    rig.wings.setMatrixAt(2 * i, HIDDEN);
    rig.wings.setMatrixAt(2 * i + 1, HIDDEN);
  } else {
    setWing(rig.wings, 2 * i, PIGEON.shoulder, PIGEON.wing, pose.wings, 1);
    setWing(rig.wings, 2 * i + 1, PIGEON.shoulder, PIGEON.wing, pose.wings, -1);
  }

  if (pose.shadow <= 0.02) {
    rig.shadows.setMatrixAt(i, HIDDEN);
  } else {
    const k = pose.shadow * size;
    part
      .makeRotationY(pose.yaw)
      .setPosition(pose.x + SHADOW_SHIFT[0] * k, PLAZA_Y + 0.01, pose.z + SHADOW_SHIFT[1] * k);
    part.scale(scale.set(PIGEON.shadow[0] * k, 1, PIGEON.shadow[1] * k));
    rig.shadows.setMatrixAt(i, part);
  }
}

function hidePigeon(rig: LifeRig, i: number): void {
  rig.pigeonBodies.setMatrixAt(i, HIDDEN);
  rig.pigeonHeads.setMatrixAt(i, HIDDEN);
  rig.shadows.setMatrixAt(i, HIDDEN);
  rig.wings.setMatrixAt(2 * i, HIDDEN);
  rig.wings.setMatrixAt(2 * i + 1, HIDDEN);
}

/** A gull centred at (x, y, z); `wings` is the wing angle above the horizontal. */
export function poseGull(
  rig: LifeRig,
  j: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
  wings: number,
): void {
  body.makeRotationFromEuler(euler.set(pitch, yaw, roll, 'YXZ')).setPosition(x, y, z);
  rig.gullBodies.setMatrixAt(j, body);
  const w = 2 * (PIGEON_COUNT + j);
  setWing(rig.wings, w, GULL.shoulder, GULL.wing, wings, 1);
  setWing(rig.wings, w + 1, GULL.shoulder, GULL.wing, wings, -1);
}

/** One wing from the bird matrix in `body`; the right wing is the left one turned over. */
function setWing(
  mesh: InstancedMesh,
  index: number,
  shoulder: readonly number[],
  size: readonly number[],
  angle: number,
  side: 1 | -1,
): void {
  part.copy(body).multiply(step.makeTranslation(side * shoulder[0], shoulder[1], shoulder[2]));
  part.multiply(step.makeRotationZ(side === 1 ? angle : Math.PI - angle));
  part.multiply(step.makeScale(size[0], 1, size[1]));
  mesh.setMatrixAt(index, part);
}

function instanced(geometry: BufferGeometry, material: Material, count: number, name: string): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Instances roam far beyond any bounds computed once; it is one draw call either way.
  mesh.frustumCulled = false;
  // Scenery: never the target of a hand ray, a poke or an editor pick.
  mesh.pointerEvents = 'none';
  mesh.raycast = () => {};
  for (let i = 0; i < count; i += 1) mesh.setMatrixAt(i, HIDDEN);
  return mesh;
}

// --- Pigeons -----------------------------------------------------------------

function placePigeons(random: () => number, ground: GroundGrid, roofline: Roofline): LifeRig['pigeons'] {
  const active = new Uint8Array(PIGEON_COUNT);
  const flyer = new Uint8Array(PIGEON_COUNT);
  const zone = new Uint8Array(PIGEON_COUNT);
  const size = new Float32Array(PIGEON_SIZES);
  const startX = new Float32Array(PIGEON_COUNT);
  const startZ = new Float32Array(PIGEON_COUNT);
  const startYaw = new Float32Array(PIGEON_COUNT);
  const taken: number[] = [];
  for (let i = 0; i < PIGEON_COUNT; i += 1) {
    flyer[i] = FLYERS.includes(i) ? 1 : 0;
    startYaw[i] = random() * Math.PI * 2;
    // Home flock first; if furniture fills it, any flock with room.
    for (let n = 0; n < ZONES.length; n += 1) {
      const z = (HOME_ZONE[i] + n) % ZONES.length;
      const spot = openSpot(random, ground, ZONES[z], taken);
      if (spot == null) continue;
      active[i] = 1;
      zone[i] = z;
      startX[i] = spot[0];
      startZ[i] = spot[1];
      taken.push(spot[0], spot[1]);
      break;
    }
  }
  return {
    active,
    flyer,
    zone,
    size,
    startX,
    startZ,
    startYaw,
    zones: ZONES,
    perches: findPerches(roofline),
    ground,
  };
}

function openSpot(random: () => number, ground: GroundGrid, zone: Zone, taken: number[]): [number, number] | null {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const r = zone.radius * 0.85 * Math.sqrt(random());
    const x = zone.x + Math.sin(angle) * r;
    const z = zone.z + Math.cos(angle) * r;
    if (!ground.isFree(x, z)) continue;
    let crowded = false;
    for (let k = 0; k < taken.length; k += 2) {
      if (Math.hypot(taken[k] - x, taken[k + 1] - z) < 0.45) crowded = true;
    }
    if (!crowded) return [x, z];
  }
  return null;
}

/** Roof edges on the row across the square: a sensible height and level for a pigeon's width. */
function findPerches(roofline: Roofline): Float32Array {
  const found: number[] = [];
  for (const target of PERCH_X) {
    search: for (let d = 0; d <= 1.25; d += 0.25) {
      for (const x of d === 0 ? [target] : [target + d, target - d]) {
        const h = roofline.heightAt(x);
        if (!(h > PLAZA_Y + 4 && h < PLAZA_Y + 18)) continue;
        if (Math.abs(roofline.heightAt(x - 0.25) - h) > 0.2) continue;
        if (Math.abs(roofline.heightAt(x + 0.25) - h) > 0.2) continue;
        found.push(x, h + 0.004, roofline.z);
        break search;
      }
    }
  }
  return new Float32Array(found);
}

// --- Reading the town ------------------------------------------------------------

/** Open paving for the pigeons, on a 25 cm grid over their corner of the square. */
export class GroundGrid {
  private readonly blocked: Uint8Array;
  private readonly nx: number;
  private readonly nz: number;

  constructor(
    private readonly x0: number,
    private readonly z0: number,
    x1: number,
    z1: number,
    private readonly cell = 0.25,
  ) {
    this.nx = Math.ceil((x1 - x0) / cell);
    this.nz = Math.ceil((z1 - z0) / cell);
    this.blocked = new Uint8Array(this.nx * this.nz);
  }

  /** Marks every cell under a footprint seen from above. */
  block(minX: number, maxX: number, minZ: number, maxZ: number): void {
    const i0 = Math.max(0, Math.floor((minX - this.x0) / this.cell));
    const i1 = Math.min(this.nx - 1, Math.floor((maxX - this.x0) / this.cell));
    const k0 = Math.max(0, Math.floor((minZ - this.z0) / this.cell));
    const k1 = Math.min(this.nz - 1, Math.floor((maxZ - this.z0) / this.cell));
    for (let k = k0; k <= k1; k += 1) {
      for (let i = i0; i <= i1; i += 1) this.blocked[k * this.nx + i] = 1;
    }
  }

  /** True when a pigeon fits at (x, z): its cell and the eight around it are open paving. */
  isFree(x: number, z: number): boolean {
    const i = Math.floor((x - this.x0) / this.cell);
    const k = Math.floor((z - this.z0) / this.cell);
    if (i < 1 || k < 1 || i >= this.nx - 1 || k >= this.nz - 1) return false;
    for (let dk = -1; dk <= 1; dk += 1) {
      for (let di = -1; di <= 1; di += 1) {
        if (this.blocked[(k + dk) * this.nx + i + di] === 1) return false;
      }
    }
    return true;
  }

  /** True when a hop from one spot to another crosses only open paving. */
  pathFree(x0: number, z0: number, x1: number, z1: number): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.15));
    for (let s = 1; s <= steps; s += 1) {
      const f = s / steps;
      if (!this.isFree(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)) return false;
    }
    return true;
  }
}

/** Height of whatever is on top along one line across the roofs (z fixed), every 25 cm. */
class Roofline {
  private readonly height: Float32Array;
  private readonly step = 0.25;

  constructor(
    private readonly x0: number,
    x1: number,
    readonly z: number,
  ) {
    this.height = new Float32Array(Math.floor((x1 - x0) / this.step) + 1).fill(-Infinity);
  }

  add(a: Vector3, b: Vector3, c: Vector3, minX: number, maxX: number): void {
    const i0 = Math.max(0, Math.ceil((minX - this.x0) / this.step));
    const i1 = Math.min(this.height.length - 1, Math.floor((maxX - this.x0) / this.step));
    for (let i = i0; i <= i1; i += 1) {
      const h = interpolate(this.x0 + i * this.step, this.z, a.x, a.z, b.x, b.z, c.x, c.z, a.y, b.y, c.y);
      if (h > this.height[i]) this.height[i] = h;
    }
  }

  heightAt(x: number): number {
    const i = Math.round((x - this.x0) / this.step);
    return i < 0 || i >= this.height.length ? -Infinity : this.height[i];
  }
}

/**
 * One pass over every visible triangle near the square (merged meshes and
 * instanced ones alike) that fills the ground grid and the roofline. About 10-40 ms for the near town; it runs once, at build time.
 */
function surveyScene(root: Object3D, ground: GroundGrid, roofline: Roofline): void {
  root.updateMatrixWorld(true);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const local = new Matrix4();
  const world = new Matrix4();
  root.traverseVisible((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh !== true || object.name === SKY_DOME) return;
    if ((object as { isBatchedMesh?: boolean }).isBatchedMesh === true) return;
    if (!Array.isArray(mesh.material) && mesh.material.visible === false) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (position == null) return;
    const index = geometry.getIndex();
    const total = index != null ? index.count : position.count;
    const start = Math.max(0, geometry.drawRange.start);
    const end = Math.min(total, start + geometry.drawRange.count);
    const instances = (mesh as InstancedMesh).isInstancedMesh === true ? (mesh as InstancedMesh) : null;
    const copies = instances != null ? instances.count : 1;
    for (let copy = 0; copy < copies; copy += 1) {
      if (instances != null) {
        instances.getMatrixAt(copy, local);
        world.multiplyMatrices(mesh.matrixWorld, local);
      } else {
        world.copy(mesh.matrixWorld);
      }
      // A mirrored transform flips the winding, and with it the face normals.
      const mirrored = world.determinant() < 0;
      for (let i = start; i + 2 < end; i += 3) {
        a.fromBufferAttribute(position, index != null ? index.getX(i) : i).applyMatrix4(world);
        b.fromBufferAttribute(position, index != null ? index.getX(i + 1) : i + 1).applyMatrix4(world);
        c.fromBufferAttribute(position, index != null ? index.getX(i + 2) : i + 2).applyMatrix4(world);
        if (mirrored) visitTriangle(a, c, b, ground, roofline);
        else visitTriangle(a, b, c, ground, roofline);
      }
    }
  });
}

function visitTriangle(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  ground: GroundGrid,
  roofline: Roofline,
): void {
  const minX = Math.min(a.x, b.x, c.x);
  const maxX = Math.max(a.x, b.x, c.x);
  const minY = Math.min(a.y, b.y, c.y);
  const maxY = Math.max(a.y, b.y, c.y);
  const minZ = Math.min(a.z, b.z, c.z);
  const maxZ = Math.max(a.z, b.z, c.z);
  if (maxX < -22 || minX > 31 || maxZ < -36 || minZ > 0.5) return;
  if (maxY < PLAZA_Y - 0.5 || minY > PLAZA_Y + 25) return;
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-12) return;
  // Anything from just above the paving up to a pigeon's head (and a bit) is in the way.
  if (maxY > PLAZA_Y + 0.035 && minY < PLAZA_Y + 1) ground.block(minX, maxX, minZ, maxZ);
  if (ny / length > 0.35 && minZ <= roofline.z && maxZ >= roofline.z) roofline.add(a, b, c, minX, maxX);
}

/** Interpolates h at (px, py) inside a triangle projected onto two axes; NaN outside it. */
function interpolate(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  ha: number,
  hb: number,
  hc: number,
): number {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-12) return NaN;
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const w = 1 - u - v;
  if (u < -1e-6 || v < -1e-6 || w < -1e-6) return NaN;
  return u * ha + v * hb + w * hc;
}

// --- Shapes ------------------------------------------------------------------------

type V3 = readonly [number, number, number];

/**
 * A rock dove about 30 cm long, in its own frame: feet at the origin, beak
 * toward +z. Folded wings with the two dark bars, a pale rump, a banded tail
 * and an iridescent throat; the head is a separate instance so it can peck.
 */
function pigeonBody(): BufferGeometry {
  const s = new ShapeBuilder();
  const centre: V3 = [0, 0.1, -0.012];
  const radii: V3 = [0.05, 0.056, 0.108];
  const tilt = -0.22;
  s.ellipsoid(centre, radii, 8, 6, tilt, (u) => {
    if (u[2] > 0.55) return u[1] > -0.15 ? (Math.abs(u[0]) > 0.35 ? NECK_GREEN : NECK_PURPLE) : BREAST;
    if (u[1] > 0.4 && u[2] < -0.45) return RUMP;
    if (u[1] < -0.35) return BELLY;
    return BODY;
  });
  // Folded wings, lying on the back and flanks; the tips reach over the tail.
  const stations = [0.5, 0.22, 0.02, -0.18, -0.36, -0.58, -0.8, -0.95];
  const colours = [BODY_LIGHT, BODY_LIGHT, BAR, BODY, BAR, PRIMARY, PRIMARY, PRIMARY];
  for (const side of [1, -1]) {
    const inner = side === 1 ? Math.PI / 2 - 0.32 : Math.PI / 2 + 0.32;
    const outer = side === 1 ? 0.3 : Math.PI - 0.3;
    // Two strips across, so the flat pieces follow the curve of the back instead of sinking into it.
    const bands = [inner, (inner + outer) / 2, outer];
    const edge = (along: number, around: number, back = 0): V3 =>
      onBody(centre, radii, tilt, along, around, 0.004 + 0.004 * (1 - along) * 0.5, back);
    for (let k = 0; k < stations.length; k += 1) {
      const last = k === stations.length - 1;
      for (let m = 0; m < 2; m += 1) {
        const a = edge(stations[k], bands[m]);
        const b = edge(stations[k], bands[m + 1]);
        // The last piece is the folded primaries, reaching 5 cm back over the tail.
        const c = last ? edge(stations[k], bands[m + 1] * 0.7 + inner * 0.3, 0.05) : edge(stations[k + 1], bands[m + 1]);
        const d = last ? edge(stations[k], bands[m] * 0.7 + inner * 0.3, 0.05) : edge(stations[k + 1], bands[m]);
        s.quad(a, b, c, d, colours[k], sub(average(a, b, c, d), centre));
      }
    }
  }
  // Tail, grey with a dark band at its end.
  const tail = (f: number, side: number): V3 => [side * (0.02 + 0.014 * f), 0.09 - 0.016 * f, -0.085 - 0.155 * f];
  s.slab([tail(0, -1), tail(0, 1), tail(0.68, 1), tail(0.68, -1)], 0.012, BODY);
  s.slab([tail(0.68, -1), tail(0.68, 1), tail(1, 1), tail(1, -1)], 0.012, TAIL_BAND);
  // Short red legs and feet.
  for (const x of [-0.017, 0.017]) {
    s.box([x - 0.006, 0, -0.004], [x + 0.006, 0.06, 0.008], LEG);
    s.box([x - 0.007, 0, -0.012], [x + 0.007, 0.007, 0.03], LEG);
  }
  return s.build();
}

/** Neck and head, pivoting at the base of the neck (PIGEON.neck on the body). */
function pigeonHead(): BufferGeometry {
  const s = new ShapeBuilder();
  s.tube([0, -0.014, -0.012], [0, 0.05, 0.03], 0.025, 0.017, 6, (dir) =>
    Math.abs(dir[0]) > 0.5 ? NECK_GREEN : dir[2] > 0.3 ? NECK_PURPLE : BODY,
  );
  s.ellipsoid([0, 0.064, 0.04], [0.021, 0.023, 0.027], 8, 5, 0, () => HEAD);
  s.pyramid([0, 0.06, 0.064], 0.0055, 0.005, [0, 0.054, 0.084], BEAK);
  return s.build();
}

/** A flat disc of unit radius facing up; scaled into an ellipse under each pigeon. */
function shadowDisc(): BufferGeometry {
  const s = new ShapeBuilder();
  const n = 10;
  for (let k = 0; k < n; k += 1) {
    const a0 = (2 * Math.PI * k) / n;
    const a1 = (2 * Math.PI * (k + 1)) / n;
    s.tri([0, 0, 0], [Math.cos(a0), 0, Math.sin(a0)], [Math.cos(a1), 0, Math.sin(a1)], WHITE, [0, 1, 0]);
  }
  return s.build();
}

/**
 * The shared wing: two triangles from the shoulder (x = 0) to the tip
 * (x = 1), swept back, white fading to a dark tip, with both sides drawn.
 * Each bird scales it to its own length and chord.
 */
function wingShape(): BufferGeometry {
  const s = new ShapeBuilder();
  const leading: V3 = [0, 0, 0.15];
  const trailing: V3 = [0, 0, -0.17];
  const wrist: V3 = [0.52, 0, 0.1];
  const tip: V3 = [1, 0, -0.2];
  for (const up of [1, -1]) {
    s.triColours(leading, trailing, wrist, WHITE, WHITE, WRIST, [0, up, 0]);
    s.triColours(wrist, trailing, tip, WRIST, WHITE, WING_TIP, [0, up, 0]);
  }
  return s.build();
}

/** A herring-gull body about 60 cm long, centred on the origin, beak toward +z. */
function gullBody(): BufferGeometry {
  const s = new ShapeBuilder();
  s.ellipsoid([0, 0, 0], [0.07, 0.064, 0.2], 8, 6, 0, (u) => (u[1] > 0.55 ? GULL_MANTLE : GULL_PLUMAGE));
  s.ellipsoid([0, 0.035, 0.205], [0.044, 0.047, 0.058], 8, 5, 0, () => GULL_PLUMAGE);
  s.pyramid([0, 0.03, 0.255], 0.011, 0.01, [0, 0.022, 0.31], GULL_BEAK);
  s.slab([[-0.045, 0.02, -0.15], [0.045, 0.02, -0.15], [0.065, 0.012, -0.31], [-0.065, 0.012, -0.31]], 0.014, GULL_PLUMAGE);
  return s.build();
}

/** A point on an ellipsoid body (see ShapeBuilder.ellipsoid), lifted off it and pushed back. */
function onBody(centre: V3, radii: V3, tilt: number, along: number, around: number, lift: number, back = 0): V3 {
  const ring = Math.sqrt(Math.max(0, 1 - along * along));
  const u: V3 = [ring * Math.cos(around), ring * Math.sin(around), along];
  const n = normalize([u[0] / radii[0], u[1] / radii[1], u[2] / radii[2]]);
  return tiltPoint(
    centre,
    u[0] * radii[0] + n[0] * lift,
    u[1] * radii[1] + n[1] * lift,
    u[2] * radii[2] + n[2] * lift - back,
    tilt,
  );
}

/** Turns a local point about x by `tilt` (negative lifts the front) and moves it to `centre`. */
function tiltPoint(centre: V3, x: number, y: number, z: number, tilt: number): V3 {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  return [centre[0] + x, centre[1] + y * cos - z * sin, centre[2] + y * sin + z * cos];
}

/**
 * Collects triangles with their own normals and vertex colours into one
 * geometry, for the small animated pieces. Every face is wound to face a
 * given direction, so no shape can come out inside out.
 */
class ShapeBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly color = new Color();

  tri(a: V3, b: V3, c: V3, hex: number, towards: V3): void {
    this.triColours(a, b, c, hex, hex, hex, towards);
  }

  /** A flat triangle with its own colour at each corner, wound to face `towards`. */
  triColours(a: V3, b: V3, c: V3, ha: number, hb: number, hc: number, towards: V3): void {
    const n = faceNormal(a, b, c);
    if (n == null) return;
    if (dot(n, towards) < 0) {
      const flipped: V3 = [-n[0], -n[1], -n[2]];
      this.push(a, flipped, ha);
      this.push(c, flipped, hc);
      this.push(b, flipped, hb);
    } else {
      this.push(a, n, ha);
      this.push(b, n, hb);
      this.push(c, n, hc);
    }
  }

  /** A flat quad a-b-c-d, in order around its edge, facing `towards`. */
  quad(a: V3, b: V3, c: V3, d: V3, hex: number, towards: V3): void {
    this.tri(a, b, c, hex, towards);
    this.tri(a, c, d, hex, towards);
  }

  box(min: V3, max: V3, hex: number): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex, [0, 0, 1]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], hex, [0, 0, -1]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], hex, [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex, [-1, 0, 0]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], hex, [0, 1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
  }

  /** A flat plate: four top corners in order around, and its thickness below them. */
  slab(top: readonly V3[], thickness: number, hex: number): void {
    const bottom = top.map((p): V3 => [p[0], p[1] - thickness, p[2]]);
    const centre = average(...top, ...bottom);
    this.quad(top[0], top[1], top[2], top[3], hex, [0, 1, 0]);
    this.quad(bottom[0], bottom[1], bottom[2], bottom[3], hex, [0, -1, 0]);
    for (let k = 0; k < 4; k += 1) {
      const j = (k + 1) % 4;
      this.quad(top[k], top[j], bottom[j], bottom[k], hex, sub(average(top[k], top[j]), centre));
    }
  }

  /**
   * An ellipsoid around a z-axis spine, smooth-shaded: `rings` from the -z
   * pole to the +z pole, `segments` around. `paint(u)` colours each face from
   * its centre on the unit sphere, so markings follow the body. `tilt` turns
   * it about x (negative lifts the front).
   */
  ellipsoid(centre: V3, radii: V3, segments: number, rings: number, tilt: number, paint: (u: V3) => number): void {
    const grid: { p: V3; n: V3; u: V3 }[][] = [];
    for (let r = 0; r <= rings; r += 1) {
      const phi = (Math.PI * r) / rings;
      const row: { p: V3; n: V3; u: V3 }[] = [];
      for (let k = 0; k < segments; k += 1) {
        const theta = (2 * Math.PI * k) / segments;
        const u: V3 = [Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), -Math.cos(phi)];
        const n = normalize([u[0] / radii[0], u[1] / radii[1], u[2] / radii[2]]);
        row.push({
          p: tiltPoint(centre, u[0] * radii[0], u[1] * radii[1], u[2] * radii[2], tilt),
          n: tiltPoint([0, 0, 0], n[0], n[1], n[2], tilt),
          u,
        });
      }
      grid.push(row);
    }
    for (let r = 0; r < rings; r += 1) {
      for (let k = 0; k < segments; k += 1) {
        const a = grid[r][k];
        const b = grid[r][(k + 1) % segments];
        const c = grid[r + 1][(k + 1) % segments];
        const d = grid[r + 1][k];
        const hex = paint(average(a.u, b.u, c.u, d.u));
        this.smooth(a, b, c, hex);
        this.smooth(a, c, d, hex);
      }
    }
  }

  /** A tapered tube from a to b, smooth around; `paint` colours each side from its outward direction. */
  tube(a: V3, b: V3, ra: number, rb: number, sides: number, paint: (dir: V3) => number): void {
    const axis = normalize(sub(b, a));
    const e1 = normalize(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const e2 = cross(axis, e1);
    const around = (k: number): V3 => {
      const t = (2 * Math.PI * k) / sides;
      return [
        e1[0] * Math.cos(t) + e2[0] * Math.sin(t),
        e1[1] * Math.cos(t) + e2[1] * Math.sin(t),
        e1[2] * Math.cos(t) + e2[2] * Math.sin(t),
      ];
    };
    for (let k = 0; k < sides; k += 1) {
      const d0 = around(k);
      const d1 = around(k + 1);
      const at = (base: V3, dir: V3, r: number): V3 => [base[0] + dir[0] * r, base[1] + dir[1] * r, base[2] + dir[2] * r];
      const hex = paint(normalize(average(d0, d1)));
      this.smooth({ p: at(a, d0, ra), n: d0 }, { p: at(a, d1, ra), n: d1 }, { p: at(b, d1, rb), n: d1 }, hex);
      this.smooth({ p: at(a, d0, ra), n: d0 }, { p: at(b, d1, rb), n: d1 }, { p: at(b, d0, rb), n: d0 }, hex);
    }
  }

  /** Four triangles from a small upright rectangle at `base` to `tip`: a beak. */
  pyramid(base: V3, halfWidth: number, halfHeight: number, tip: V3, hex: number): void {
    const [x, y, z] = base;
    const corners: V3[] = [
      [x - halfWidth, y - halfHeight, z],
      [x + halfWidth, y - halfHeight, z],
      [x + halfWidth, y + halfHeight, z],
      [x - halfWidth, y + halfHeight, z],
    ];
    const centre = average(base, tip);
    for (let k = 0; k < 4; k += 1) {
      const p = corners[k];
      const q = corners[(k + 1) % 4];
      this.tri(p, q, tip, hex, sub(average(p, q, tip), centre));
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  /** A smooth triangle, wound to agree with its corner normals. */
  private smooth(a: { p: V3; n: V3 }, b: { p: V3; n: V3 }, c: { p: V3; n: V3 }, hex: number): void {
    const n = faceNormal(a.p, b.p, c.p);
    if (n == null) return;
    const outward = dot(n, [a.n[0] + b.n[0] + c.n[0], a.n[1] + b.n[1] + c.n[1], a.n[2] + b.n[2] + c.n[2]]) >= 0;
    const second = outward ? b : c;
    const third = outward ? c : b;
    this.push(a.p, a.n, hex);
    this.push(second.p, second.n, hex);
    this.push(third.p, third.n, hex);
  }

  private push(p: V3, n: V3, hex: number): void {
    // Vertex colours are linear; Color converts from sRGB hex.
    this.color.setHex(hex);
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(this.color.r, this.color.g, this.color.b);
  }
}

function faceNormal(a: V3, b: V3, c: V3): V3 | null {
  const n = cross(sub(b, a), sub(c, a));
  const length = Math.hypot(n[0], n[1], n[2]);
  return length < 1e-12 ? null : [n[0] / length, n[1] / length, n[2] / length];
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(a: V3): V3 {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

function average(...points: V3[]): V3 {
  const sum = [0, 0, 0];
  for (const p of points) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}
