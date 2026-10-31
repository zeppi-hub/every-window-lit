import {
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Mesh as MeshType,
  RingGeometry,
  type Texture,
} from '@iwsdk/core';
import { PartBuilder, tube } from './facade.js';
import { SILL } from './layout.js';
import { glowing, plain } from './materials.js';

/**
 * A brass spyglass lying across the middle of the sill (META_VR_DINAMIKLER.md
 * item 9): picked up and lifted toward the eye, it settles there by itself
 * (never closer than 20 cm to the face), and the town shows about twice as
 * near inside its round view while everything around stays still.
 */
const BARREL = 0.019;
export const SPYGLASS_REST = { x: 0.03, y: SILL.top + BARREL, z: -0.3 } as const;
/** Turned a little toward the Keeper, so the eyepiece points their way. */
export const SPYGLASS_YAW = -0.35;

/** The view's distance in front of the eye (m), its radius and the dark ring around it, as angles (radians). */
export const VIEW_DISTANCE = 0.6;
export const VIEW_ANGLE = (11 * Math.PI) / 180;
const RING_ANGLE = (24 * Math.PI) / 180;

/** The spyglass along x, eyepiece toward -x: three drawn brass sections, a leather grip on the barrel, dark lenses at the ends. */
export function createSpyglass(): MeshType {
  const b = new PartBuilder();
  b.color(0xc9a349);
  tube(b, [-0.088, 0, 0], [-0.052, 0, 0], 0.011, 14, true);
  tube(b, [-0.09, 0, 0], [-0.084, 0, 0], 0.0128, 14, true);
  tube(b, [-0.055, 0, 0], [-0.005, 0, 0], 0.0145, 14, true);
  tube(b, [-0.058, 0, 0], [-0.051, 0, 0], 0.0158, 14, true);
  tube(b, [-0.008, 0, 0], [0.078, 0, 0], 0.017, 16, true);
  tube(b, [0.074, 0, 0], [0.09, 0, 0], BARREL, 16, true);
  const brass = b.mesh(glowing(0.32, 0.9), 'Spyglass');
  const g = new PartBuilder();
  g.color(0x4a2f1f);
  tube(g, [0.01, 0, 0], [0.058, 0, 0], 0.0176, 16, false);
  g.color(0x16222b);
  tube(g, [0.0901, 0, 0], [0.0905, 0, 0], 0.0165, 16, true);
  tube(g, [-0.0905, 0, 0], [-0.0901, 0, 0], 0.009, 12, true);
  const grip = g.mesh(plain(0.75, 0, true), 'SpyglassGrip');
  brass.add(grip);
  brass.position.set(SPYGLASS_REST.x, SPYGLASS_REST.y, SPYGLASS_REST.z);
  brass.rotation.y = SPYGLASS_YAW;
  return brass;
}

/**
 * The view through it, hung in front of the eye (a child of the head): the
 * town's picture in a round lens, a thin brass rim, and a dark ring that
 * fades out into the room, so only the middle of the sight changes. Drawn
 * last and over everything; hidden until the spyglass is raised.
 */
export function createSpyglassView(picture: Texture): Group {
  const view = new Group();
  view.name = 'SpyglassView';
  const r = VIEW_DISTANCE * Math.tan(VIEW_ANGLE);
  const outer = VIEW_DISTANCE * Math.tan(RING_ANGLE);
  const over = (mesh: Mesh, order: number) => {
    mesh.renderOrder = 1000 + order;
    mesh.position.z = -VIEW_DISTANCE;
    mesh.frustumCulled = false;
    view.add(mesh);
  };
  over(new Mesh(new CircleGeometry(r, 48), new MeshBasicMaterial({ map: picture, depthTest: false, depthWrite: false })), 1);
  over(new Mesh(new RingGeometry(r, r * 1.06, 48), new MeshBasicMaterial({ color: 0x8a6a2a, depthTest: false, depthWrite: false })), 2);
  // Black at the rim, clear at the outer edge.
  const ring = new RingGeometry(r * 1.06, outer, 48, 4);
  const position = ring.getAttribute('position');
  const alpha: number[] = [];
  for (let i = 0; i < position.count; i += 1) {
    const t = (Math.hypot(position.getX(i), position.getY(i)) - r * 1.06) / (outer - r * 1.06);
    const a = 1 - Math.min(1, Math.max(0, t));
    alpha.push(0, 0, 0, a * a * (3 - 2 * a));
  }
  ring.setAttribute('color', new Float32BufferAttribute(alpha, 4));
  over(new Mesh(ring, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide })), 3);
  view.visible = false;
  return view;
}
