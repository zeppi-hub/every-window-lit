import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { MeshBuilder, seededRandom } from './geometry.js';
import { PLAZA_Y } from './layout.js';
import { plain, scanned } from './materials.js';

/**
 * First visual pass of Ombrisa: the square below the tower, a row of houses
 * across it, a market street on the right, a hillside of houses behind, the
 * coast road and the sea on the left, and a cape with an old lighthouse.
 * Static geometry is merged per material (plaster, roof tiles, cobbles,
 * stone, plain ground, water); windows and doors are one InstancedMesh,
 * so the whole town costs about seven draw calls.
 */

// Tints over the scanned plaster: a street of differently painted houses.
const WALLS = [0xfff4e6, 0xffe1b0, 0xffe9cf, 0xf4c28a, 0xf6ece0, 0xe7a283, 0xfff8ea];
const ROOFS = [0xffffff, 0xf0d0c0, 0xffe2cf];
const PAVING = 0xffffff;
const ROAD = 0x8c8273;
const TERRAIN = [0x8f9a5c, 0x7f8c52, 0x9c9a63];
const ROCK = 0xc8bca8;
const SEA = 0x1f5a78;
const LIGHTHOUSE = 0xfffaf0;

const LIT = 0xffc979;
const DARK = 0x2e2a27;
const DOOR = 0x4a3426;

interface Opening {
  x: number;
  y: number;
  z: number;
  facing: 'south' | 'west';
  width: number;
  height: number;
  color: number;
}

export interface TownParts {
  town: Group;
  /** Centre of Tessa's window across the square, for the window pull later. */
  tessaWindow: Vector3;
}

export function createTown(seed = 7): TownParts {
  const random = seededRandom(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const walls = new MeshBuilder(2.5);
  const roofs = new MeshBuilder(2);
  const paving = new MeshBuilder(2.2);
  const stone = new MeshBuilder(3);
  const ground = new MeshBuilder();
  const water = new MeshBuilder();
  const openings: Opening[] = [];
  const tessaWindow = new Vector3();

  // Sea, coast road and the square.
  water.plane(-400, -400, -29, 80, PLAZA_Y - 1.4, SEA);
  stone.box(-29, PLAZA_Y - 1.4, -170, -25, PLAZA_Y - 0.3, 20, ROCK);
  ground.plane(-25, -170, -21, 20, PLAZA_Y - 0.3, ROAD);
  paving.box(-21, PLAZA_Y - 1, -27, 30, PLAZA_Y, -0.6, PAVING);

  // A fountain on the square. Trees wait for proper scanned models; box
  // trees read as toy blocks next to the photo textures.
  stone.box(2.5, PLAZA_Y, -15.5, 5.5, PLAZA_Y + 0.6, -12.5, 0xffffff);
  stone.box(3.7, PLAZA_Y, -14.3, 4.3, PLAZA_Y + 1.6, -13.7, 0xe8e0d0);

  const house = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    baseY: number,
    height: number,
    facing: 'south' | 'west',
    tessa = false,
  ): void => {
    walls.box(x0, baseY - 2, z0, x1, baseY + height, z1, pick(WALLS));
    roofs.hipRoof(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, baseY + height, 1.6 + random() * 0.8, pick(ROOFS));
    const floors = Math.max(1, Math.floor((height - 1) / 3));
    const span = facing === 'south' ? x1 - x0 : z1 - z0;
    const perFloor = Math.max(1, Math.floor(span / 2.4));
    for (let f = 0; f < floors; f += 1) {
      for (let i = 0; i < perFloor; i += 1) {
        const along = (i + 0.5) / perFloor;
        const y = baseY + 1.6 + f * 3 + (f === 0 ? 0.4 : 0);
        const isDoor = f === 0 && i === Math.floor(perFloor / 2);
        const isTessa = tessa && f === 1 && i === 0;
        const color = isDoor ? DOOR : isTessa || random() < 0.55 ? LIT : DARK;
        const width = isDoor ? 1.1 : isTessa ? 1.1 : 0.9;
        const heightM = isDoor ? 2.1 : isTessa ? 1.5 : 1.3;
        const yy = isDoor ? baseY + 1.05 : y;
        if (facing === 'south') {
          const x = x0 + along * (x1 - x0);
          openings.push({ x, y: yy, z: z1 + 0.02, facing, width, height: heightM, color });
          if (isTessa) tessaWindow.set(x, yy, z1 + 0.02);
        } else {
          const z = z0 + along * (z1 - z0);
          openings.push({ x: x0 - 0.02, y: yy, z, facing, width, height: heightM, color });
        }
      }
    }
  };

  // Row across the square; Tessa's family lives in the house just right of centre.
  let x = -21;
  while (x < 26) {
    const width = 4.5 + random() * 3;
    const x1 = Math.min(26, x + width);
    house(x, x1, -34, -27, PLAZA_Y, 6.5 + random() * 6, 'south', x <= 1.5 && x1 > 1.5);
    x = x1 + 0.2;
  }

  // Market street on the right, facing the square.
  let z = -26;
  while (z < -2) {
    const depth = 4 + random() * 2.5;
    house(30, 37, z, Math.min(-2, z + depth), PLAZA_Y, 6 + random() * 5, 'west');
    z += depth + 0.2;
  }

  // Hillside behind the row, climbing in terraces.
  for (let k = 0; k < 7; k += 1) {
    const front = -38 - 13 * k;
    const base = PLAZA_Y + 3.2 * (k + 1);
    ground.box(-18 + k * 2, PLAZA_Y - 1, front - 13, 72, base, front, pick(TERRAIN));
    let hx = -16 + k * 2;
    while (hx < 66) {
      const width = 4 + random() * 3.5;
      if (random() < 0.8) {
        house(hx, hx + width, front - 8, front - 1, base, 5.5 + random() * 4, 'south');
      }
      hx += width + 0.6 + random() * 2;
    }
  }

  // Cape with the abandoned lighthouse, front left across the water.
  stone.box(-78, PLAZA_Y - 1.5, -108, -46, PLAZA_Y + 3, -80, ROCK);
  walls.box(-62, PLAZA_Y + 3, -95, -59, PLAZA_Y + 17, -92, LIGHTHOUSE);
  stone.box(-62.4, PLAZA_Y + 17, -95.4, -58.6, PLAZA_Y + 19, -91.6, 0x9a8f7a);

  const town = new Group();
  town.name = 'Town';
  town.add(
    walls.mesh(scanned('painted_plaster_wall'), 'TownWalls'),
    roofs.mesh(scanned('roof_09'), 'TownRoofs'),
    paving.mesh(scanned('cobblestone_floor_08'), 'TownPaving'),
    stone.mesh(scanned('large_sandstone_blocks_01'), 'TownStone'),
    ground.mesh(plain(0.95), 'TownGround'),
    water.mesh(plain(0.18), 'Sea'),
    createOpenings(openings),
  );
  return { town, tessaWindow };
}

function createOpenings(openings: Opening[]): InstancedMesh {
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial();
  const mesh = new InstancedMesh(geometry, material, openings.length);
  mesh.name = 'TownWindows';
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const south = new Quaternion();
  const west = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
  const color = new Color();
  openings.forEach((o, i) => {
    position.set(o.x, o.y, o.z);
    scale.set(o.width, o.height, 1);
    matrix.compose(position, o.facing === 'south' ? south : west, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, color.setHex(o.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
