import { BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Mesh } from '@iwsdk/core';
import { interior } from './materials.js';

/**
 * The end of the Keeper's coat sleeve (META_VR_DINAMIKLER.md item 15): navy
 * wool with a turned-back cuff and a small brass button, worn at the wrist of
 * each hand, or behind each controller. The hands themselves stay one
 * neutral colour: the Keeper has no set skin, age or gender.
 */
const WOOL = [0.16, 0.2, 0.27] as const;
const CUFF = [0.12, 0.15, 0.21] as const;
const BRASS = [0.72, 0.58, 0.28] as const;

/** One mesh in the wrist's own frame: the forearm runs along +z from the wrist, the back of the hand is +y. */
export function createCuff(name: string): Mesh {
  const parts: Array<{ geometry: BufferGeometry; color: readonly number[] }> = [];
  const along = (geometry: BufferGeometry, z: number) => geometry.rotateX(Math.PI / 2).translate(0, 0, z);
  parts.push({ geometry: along(new CylinderGeometry(0.034, 0.037, 0.08, 20, 1, true), 0.062), color: WOOL });
  parts.push({ geometry: along(new CylinderGeometry(0.0368, 0.0368, 0.022, 20, 1, true), 0.022), color: CUFF });
  // The cuff's edge toward the hand: a thin rim so the open end reads as cloth with thickness.
  parts.push({ geometry: along(new CylinderGeometry(0.0368, 0.0368, 0.003, 20, 1, true), 0.0115).scale(0.93, 0.93, 1), color: CUFF });
  parts.push({ geometry: new CylinderGeometry(0.0045, 0.0045, 0.004, 10).translate(0, 0.0378, 0.022), color: BRASS });
  const merged = merge(parts);
  // Wrists are wider than deep.
  merged.scale(1.2, 0.88, 1);
  const material = interior(0xffffff, 0.85);
  material.vertexColors = true;
  material.side = DoubleSide;
  const mesh = new Mesh(merged, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  return mesh;
}

function merge(parts: ReadonlyArray<{ geometry: BufferGeometry; color: readonly number[] }>): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const { geometry, color } of parts) {
    const base = positions.length / 3;
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(color[0], color[1], color[2]);
    }
    const index = geometry.getIndex();
    if (index != null) for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i));
    geometry.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}
