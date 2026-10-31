import { Color, Group, IcosahedronGeometry, InstancedMesh, type Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { box, PartBuilder, prism, tube, WORLD } from './facade.js';
import { plain } from './materials.js';
import { HIDDEN } from './reactions.js';

/**
 * The townsfolk (META_VR_FIKIR.md §4, "someone below waves up at the
 * tower"): faceless people in the coats and hats of the 1930s, small and
 * plain so they sit in the scanned town without drawing the eye. Built
 * around the feet at the origin, facing +z, about 1.7 m tall, each a few
 * dozen triangles; one instanced mesh per part, so all of them together
 * cost five draw calls. FolkSystem walks, gathers and waves them. Never
 * the family: Tessa, Dario and Lina are only ever seen in their room.
 */
export const FOLK_COUNT = 22;
/** Where the waving arm hangs from (the right shoulder), in the figure's frame. */
export const SHOULDER = { x: -0.17, y: 1.36, z: 0 } as const;
/** Dario's accordion, held at the chest. */
export const ACCORDION = { y: 1.1, z: 0.2 } as const;

/** Coats, dresses and jackets of the time: mostly dark and muted, a few light ones. */
const COATS = [0x3a3a3c, 0x2c3a55, 0xa8865a, 0x5c6040, 0x6a2e33, 0x6f6f6c, 0x5a4433, 0xcfc4ab, 0x5b6f86, 0x46403a];
const SKIN = [0xe0b394, 0xc99a7a, 0xa8755a, 0x8a5a42, 0xd9a585];

export interface FolkParts {
  group: Group;
  coats: InstancedMesh;
  heads: InstancedMesh;
  details: InstancedMesh;
  arms: InstancedMesh;
  accordion: InstancedMesh;
}

export function createFolk(): FolkParts {
  const coat = new PartBuilder();
  coat.color(0xffffff);
  // A coat from the knee to the shoulders, a little wider at the hem, and a collar.
  prism(coat, WORLD, 0, 0, 0.52, 1.36, 0.22, 0.17, 8, { smooth: true, bottom: true });
  prism(coat, WORLD, 0, 0, 1.36, 1.43, 0.17, 0.07, 8, { smooth: true, top: true });
  // The left arm, hanging; the right one is its own mesh, so it can wave.
  tube(coat, [0.19, 1.34, 0], [0.22, 0.86, 0.02], 0.05, 5, true);

  const detail = new PartBuilder();
  detail.color(0x26231f);
  // Legs and shoes below the coat.
  for (const x of [-0.08, 0.08]) {
    tube(detail, [x, 0.04, 0], [x, 0.56, 0], 0.055, 5, false);
    box(detail, WORLD, x - 0.05, 0, -0.04, x + 0.05, 0.06, 0.12);
  }
  // A hat: a brim and a crown.
  detail.color(0x2e2a26);
  prism(detail, WORLD, 0, 0, 1.6, 1.62, 0.16, 0.16, 10, { top: true, bottom: true });
  prism(detail, WORLD, 0, 0, 1.62, 1.72, 0.095, 0.085, 10, { smooth: true, top: true });

  const arm = new PartBuilder();
  arm.color(0xffffff);
  // Hanging straight down from the shoulder; FolkSystem turns it up to wave.
  tube(arm, [0, 0, 0], [0, -0.5, 0.02], 0.05, 5, true);

  const squeeze = new PartBuilder();
  squeeze.color(0x7a1f22);
  box(squeeze, WORLD, -0.16, -0.12, -0.06, -0.1, 0.12, 0.06);
  box(squeeze, WORLD, 0.1, -0.12, -0.06, 0.16, 0.12, 0.06);
  squeeze.color(0xe9e2d0);
  box(squeeze, WORLD, -0.1, -0.11, -0.055, 0.1, 0.11, 0.055);

  const material = plain(0.85);
  const instanced = (builder: PartBuilder, name: string, count: number): InstancedMesh => {
    const shape = builder.mesh(material, name) as Mesh;
    const mesh = new InstancedMesh(shape.geometry, material, count);
    mesh.name = name;
    for (let i = 0; i < count; i += 1) mesh.setMatrixAt(i, HIDDEN);
    return mesh;
  };
  const coats = instanced(coat, 'FolkCoats', FOLK_COUNT);
  const details = instanced(detail, 'FolkDetails', FOLK_COUNT);
  const arms = instanced(arm, 'FolkArms', FOLK_COUNT);
  const accordion = instanced(squeeze, 'FolkAccordion', 1);
  const headGeometry = new IcosahedronGeometry(0.1, 1);
  headGeometry.translate(0, 1.52, 0);
  // No vertex colours on the head: its tone comes from each instance's colour alone.
  const heads = new InstancedMesh(headGeometry, new MeshStandardMaterial({ roughness: 0.8 }), FOLK_COUNT);
  heads.name = 'FolkHeads';
  const colour = new Color();
  for (let i = 0; i < FOLK_COUNT; i += 1) {
    heads.setMatrixAt(i, HIDDEN);
    const c = COATS[(i * 7) % COATS.length];
    coats.setColorAt(i, colour.setHex(c));
    arms.setColorAt(i, colour.setHex(c));
    heads.setColorAt(i, colour.setHex(SKIN[(i * 3) % SKIN.length]));
  }
  const group = new Group();
  group.name = 'Folk';
  group.add(coats, heads, details, arms, accordion);
  // They move about the whole square: bounds by hand, so moving instances are never culled away.
  for (const mesh of [coats, heads, details, arms, accordion]) mesh.frustumCulled = false;
  return { group, coats, heads, details, arms, accordion };
}

/** Where Dario stands to play on the last night, beside the fountain, facing the tower. */
export const DARIO = { x: 0.5, z: -16.3 } as const;
