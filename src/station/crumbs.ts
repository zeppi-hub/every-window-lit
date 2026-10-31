import { Group, InstancedMesh, Matrix4, type Mesh } from '@iwsdk/core';
import { box, PartBuilder, prism, WORLD } from './facade.js';
import { SILL } from './layout.js';
import { plain } from './materials.js';

/**
 * A little paper bag of bread crumbs on the far edge of the sill
 * (META_VR_DINAMIKLER.md item 4): touched, it scatters crumbs on the stone
 * and the pigeons come in through the window for them (CrumbsSystem).
 */
export const CRUMB_BAG = { x: 0.08, y: SILL.top, z: -0.49 } as const;
/** Where the two pigeons land to peck, on the outer part of the sill. */
export const PIGEON_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.03, SILL.top, -0.515],
  [0.15, SILL.top, -0.5],
];
const CRUMBS = 14;

export function createCrumbs(): { bag: Mesh; crumbs: InstancedMesh; group: Group } {
  const b = new PartBuilder();
  b.round = 0.002;
  b.color(0xc9a77a);
  box(b, WORLD, -0.022, 0, -0.016, 0.022, 0.05, 0.016);
  // The folded top, a little crumpled.
  b.color(0xb8946a);
  box(b, WORLD, -0.022, 0.05, -0.008, 0.022, 0.058, 0.008);
  const bag = b.mesh(plain(0.95, 0, true), 'CrumbBag');
  bag.position.set(CRUMB_BAG.x, CRUMB_BAG.y, CRUMB_BAG.z);
  bag.rotation.y = 0.3;

  const c = new PartBuilder();
  c.color(0xe0c48e);
  prism(c, WORLD, 0, 0, 0, 0.004, 0.004, 0.003, 5, { top: true });
  const shape = c.mesh(plain(0.9, 0, true), 'Crumb') as Mesh;
  const crumbs = new InstancedMesh(shape.geometry, shape.material, CRUMBS);
  crumbs.name = 'Crumbs';
  const m = new Matrix4();
  let seed = 3;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < CRUMBS; k += 1) {
    const [x, y, z] = PIGEON_SPOTS[k % PIGEON_SPOTS.length];
    crumbs.setMatrixAt(k, m.makeTranslation(x + (random() - 0.5) * 0.12, y, z + 0.06 + (random() - 0.5) * 0.06));
  }
  crumbs.computeBoundingSphere();
  crumbs.visible = false;
  const group = new Group();
  group.name = 'CrumbsGroup';
  group.add(crumbs);
  return { bag, crumbs, group };
}
