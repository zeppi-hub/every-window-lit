import { Mesh, MeshBasicMaterial, SphereGeometry } from '@iwsdk/core';
import { box, PartBuilder, tube, WORLD } from './facade.js';
import { SILL } from './layout.js';
import { glowing, plain } from './materials.js';

/**
 * A box of matches beside the Sunday lamp (META_VR_DINAMIKLER.md item 8):
 * the Keeper takes the match lying on it and draws it across the striker,
 * toward the lamp, and the lamp lights. The match springs back to the box;
 * poking the lamp still lights it too.
 */
export const MATCHBOX = { x: 0.47, y: SILL.top, z: -0.37 } as const;
/** The match at rest on the box (world), and how far it is drawn along +x to strike. */
export const MATCH_REST = { x: MATCHBOX.x - 0.012, y: MATCHBOX.y + 0.019, z: MATCHBOX.z + 0.006 } as const;
export const MATCH_TRAVEL = 0.07;
export const MATCH_THRESHOLD = 0.045;

export function createMatchbox(): Mesh {
  const b = new PartBuilder();
  b.round = 0.002;
  b.color(0x7a2a22);
  box(b, WORLD, -0.028, 0, -0.018, 0.028, 0.016, 0.018);
  // A pale label band and the dark striker along the side toward the Keeper.
  b.color(0xe9dcc0);
  box(b, WORLD, -0.02, 0.0161, -0.012, 0.02, 0.0165, 0.012);
  b.color(0x3a2e28);
  box(b, WORLD, -0.026, 0.003, 0.018, 0.026, 0.013, 0.0186);
  const mesh = b.mesh(plain(0.8, 0, true), 'Matchbox');
  mesh.position.set(MATCHBOX.x, MATCHBOX.y, MATCHBOX.z);
  return mesh;
}

/** A single match lying along x, its red head toward the lamp; a small flame at the head shows for a moment once struck. */
export function createMatch(): Mesh {
  const b = new PartBuilder();
  b.color(0xd8c39a);
  tube(b, [-0.03, 0, 0], [0.018, 0, 0], 0.0022, 6, true);
  b.color(0xa8281e);
  tube(b, [0.018, 0, 0], [0.026, 0, 0], 0.0036, 8, true);
  const match = b.mesh(glowing(0.7), 'Match');
  match.position.set(MATCH_REST.x, MATCH_REST.y, MATCH_REST.z);
  const flame = new Mesh(new SphereGeometry(0.006, 8, 6), new MeshBasicMaterial({ color: 0xffd27a }));
  flame.name = 'MatchFlame';
  flame.scale.set(1, 1.7, 1);
  flame.position.set(0.03, 0.006, 0);
  flame.visible = false;
  match.add(flame);
  return match;
}
