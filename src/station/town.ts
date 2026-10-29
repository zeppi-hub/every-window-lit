import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { MeshBuilder, seededRandom } from './geometry.js';
import { PLAZA_Y } from './layout.js';
import { scanned } from './materials.js';

/**
 * The live, near part of Ombrisa: the square below the tower, the row of
 * houses across it, the market street on the right and the start of the coast
 * road. Everything further than about 36 m (the hillside, the coast, the cape
 * and lighthouse, the sea, the mountains) is a Cycles panorama rendered from
 * the seat by art/panorama/build_far_town.py and shown as the sky.
 *
 * Static geometry is merged per material (plaster, roof tiles, cobbles,
 * stone); windows, shutters, sills and doors are one InstancedMesh, so the
 * near town costs about five draw calls.
 */

// Tints over the scanned plaster: a street of differently painted houses.
const WALLS = [0xfff4e6, 0xffe1b0, 0xffe9cf, 0xf4c28a, 0xf6ece0, 0xe7a283, 0xfff8ea];
// Tints, glass and road shared with art/panorama/build_far_town.py, so the
// live town and the painted one meet without a seam at 36 m.
const ROOFS = [0xf2b49a, 0xe8a487, 0xf5c2a8, 0xe0a080, 0xebb59c];
const PAVING = 0xffffff;
const ROAD = 0xc9bfae;
const ROCK = 0xc8bca8;
const SHUTTERS = [0x4f6b42, 0x5e7d4f, 0x3f5a6b, 0x6b4a32, 0x7a8a6a];

const GLASS = 0x1a2228;
const DOOR = 0x4a3426;
const SILL = 0xe9e1d2;
/** Matches NEAR_EDGE_Z in art/panorama/build_far_town.py. */
const NEAR_EDGE_Z = -36;

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
  const roofs = new MeshBuilder(4);
  const paving = new MeshBuilder(2.2);
  const stone = new MeshBuilder(3);
  const openings: Opening[] = [];
  const tessaWindow = new Vector3();

  // The near end of the coast road and the square; the panorama continues both.
  stone.box(-29, PLAZA_Y - 1.4, NEAR_EDGE_Z, -25, PLAZA_Y - 0.3, 20, ROCK);
  paving.box(-25, PLAZA_Y - 0.6, NEAR_EDGE_Z, -21, PLAZA_Y - 0.3, 20, ROAD);
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
    const shutter = pick(SHUTTERS);
    const floors = Math.max(1, Math.floor((height - 1) / 3));
    const span = facing === 'south' ? x1 - x0 : z1 - z0;
    const perFloor = Math.max(1, Math.floor(span / 2.4));
    for (let f = 0; f < floors; f += 1) {
      for (let i = 0; i < perFloor; i += 1) {
        const along = (i + 0.5) / perFloor;
        const isDoor = f === 0 && i === Math.floor(perFloor / 2);
        const isTessa = tessa && f === 1 && i === 0;
        const width = isDoor ? 1.1 : isTessa ? 1.1 : 0.9;
        const heightM = isDoor ? 2.1 : isTessa ? 1.5 : 1.3;
        const y = isDoor ? baseY + 1.05 : baseY + 1.6 + f * 3 + (f === 0 ? 0.4 : 0);
        // One opening on the facade: offset along the wall, raised off it a little.
        const place = (offset: number, dy: number, w: number, h: number, color: number, proud: number) => {
          if (facing === 'south') {
            openings.push({ x: x0 + along * (x1 - x0) + offset, y: y + dy, z: z1 + proud, facing, width: w, height: h, color });
          } else {
            openings.push({ x: x0 - proud, y: y + dy, z: z0 + along * (z1 - z0) + offset, facing, width: w, height: h, color });
          }
        };
        place(0, 0, width, heightM, isDoor ? DOOR : GLASS, 0.02);
        if (isDoor) continue;
        // Open louvred shutters folded flat against the wall, and a stone sill.
        const leaf = width * 0.52;
        place(-(width + leaf) / 2 - 0.02, 0, leaf, heightM, shutter, 0.03);
        place((width + leaf) / 2 + 0.02, 0, leaf, heightM, shutter, 0.03);
        place(0, -heightM / 2 - 0.05, width + 0.2, 0.1, SILL, 0.04);
        if (isTessa && facing === 'south') tessaWindow.set(x0 + along * (x1 - x0), y, z1 + 0.02);
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


  const town = new Group();
  town.name = 'Town';
  town.add(
    walls.mesh(scanned('painted_plaster_wall'), 'TownWalls'),
    roofs.mesh(scanned('roof_09'), 'TownRoofs'),
    paving.mesh(scanned('cobblestone_floor_08'), 'TownPaving'),
    stone.mesh(scanned('large_sandstone_blocks_01'), 'TownStone'),
    createOpenings(openings),
  );
  return { town, tessaWindow };
}

function createOpenings(openings: Opening[]): InstancedMesh {
  const geometry = new PlaneGeometry(1, 1);
  // Lit by the sky like the walls; low roughness lets the glass catch it.
  const material = new MeshStandardMaterial({ roughness: 0.35, metalness: 0 });
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
