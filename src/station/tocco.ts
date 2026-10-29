import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { box, Frame, PartBuilder, prism, tube, type V3, WORLD } from './facade.js';
import { SILL, WINDOW } from './layout.js';
import { glowing, plain } from './materials.js';

/**
 * Tocco, the Keeper's wooden clock-jack: a 14 cm figure that rides out on a
 * brass rail from a little door in the left jamb, like the figures that
 * strike the bells on old tower clocks. Beside him on Sunday, two brass
 * arrows for the call on next week's prices; on the far corner of the sill
 * the Sunday lamp; and on the jamb's face the notches carved for every
 * right call, the Keeper's above, Tocco's below.
 */

const RAIL_Z = -0.47;
export const TOCCO_OUT = { x: -0.49, y: SILL.top, z: RAIL_Z } as const;
export const TOCCO_IN = { x: -0.66, y: SILL.top, z: RAIL_Z } as const;
export const ARROW_UP = { x: -0.34, y: SILL.top, z: RAIL_Z } as const;
export const ARROW_DOWN = { x: -0.24, y: SILL.top, z: RAIL_Z } as const;
export const LAMP = { x: 0.57, y: SILL.top, z: RAIL_Z } as const;
/** Up to this many notches a side. */
export const NOTCHES = 12;

const WOOD = 0xd9b88a;
const JACKET = 0x8a2a24;
const CAP = 0x2b3a55;
const BRASS = 0xc9a349;

export interface ToccoParts {
  /** Static: the rail and the door frame in the jamb. */
  fixtures: Mesh;
  tocco: Group;
  door: Group;
  up: Mesh;
  down: Mesh;
  lamp: Mesh;
  /** The lamp's glass, lit from inside on Sunday. */
  flame: Mesh;
  /** Keeper's notches, then Tocco's, each a separate mesh to show by count. */
  notches: Mesh[];
  line: Mesh;
}

export function createTocco(): ToccoParts {
  const f = new PartBuilder();
  f.color(BRASS);
  tube(f, [-0.62, SILL.top + 0.004, RAIL_Z], [TOCCO_OUT.x + 0.04, SILL.top + 0.004, RAIL_Z], 0.004, 6, true);
  f.color(0x5e4636);
  const jamb = -WINDOW.halfWidth;
  box(f, WORLD, jamb, SILL.top, RAIL_Z - 0.05, jamb + 0.006, SILL.top + 0.18, RAIL_Z - 0.04);
  box(f, WORLD, jamb, SILL.top, RAIL_Z + 0.04, jamb + 0.006, SILL.top + 0.18, RAIL_Z + 0.05);
  box(f, WORLD, jamb, SILL.top + 0.17, RAIL_Z - 0.05, jamb + 0.006, SILL.top + 0.18, RAIL_Z + 0.05);
  f.color(0x1a1512);
  box(f, WORLD, jamb - 0.001, SILL.top, RAIL_Z - 0.04, jamb + 0.001, SILL.top + 0.17, RAIL_Z + 0.04);
  const fixtures = f.mesh(plain(0.5, 0.4, true), 'ToccoFixtures');

  const t = new PartBuilder();
  t.color(0x7a5a3e);
  box(t, WORLD, -0.022, 0, -0.016, 0.022, 0.012, 0.016);
  t.color(JACKET);
  prism(t, WORLD.at(0, 0.012, 0), 0, 0, 0, 0.06, 0.02, 0.016, 14, { smooth: true, top: true });
  t.color(0x1f1a16);
  prism(t, WORLD.at(0, 0.034, 0), 0, 0, 0, 0.006, 0.0205, 0.0165, 14, { smooth: true });
  t.color(WOOD);
  const head: V3 = [0, 0.09, 0];
  blobHead(t, head, 0.018);
  t.color(CAP);
  prism(t, WORLD.at(0, 0.103, 0), 0, 0, 0, 0.003, 0.024, 0.024, 16, { smooth: true, top: true });
  prism(t, WORLD.at(0, 0.106, 0), 0, 0, 0, 0.016, 0.014, 0.014, 16, { smooth: true, top: true });
  t.color(JACKET);
  tube(t, [-0.02, 0.064, 0], [-0.028, 0.03, 0.006], 0.0055, 8, true);
  tube(t, [0.02, 0.064, 0], [0.034, 0.075, 0.01], 0.0055, 8, true);
  // The little hammer he strikes the hours with.
  t.color(0x6e5640);
  tube(t, [0.034, 0.075, 0.01], [0.038, 0.115, 0.012], 0.0025, 6, true);
  t.color(BRASS);
  tube(t, [0.026, 0.118, 0.012], [0.05, 0.118, 0.012], 0.006, 8, true);
  const figure = t.mesh(glowing(0.6), 'ToccoFigure');
  const tocco = new Group();
  tocco.name = 'Tocco';
  tocco.add(figure);
  tocco.position.set(TOCCO_IN.x, TOCCO_IN.y, TOCCO_IN.z);
  tocco.rotation.y = 0.5;

  const d = new PartBuilder();
  d.color(0x6e5640);
  box(d, WORLD, 0, 0, -0.04, 0.006, 0.17, 0.04);
  d.color(BRASS);
  tube(d, [0.007, 0.085, 0.03], [0.012, 0.085, 0.03], 0.004, 6, true);
  const door = new Group();
  door.name = 'ToccoDoor';
  // Hinged on its far edge, so it swings open toward the window.
  const doorMesh = d.mesh(plain(0.7, 0, true), 'ToccoDoorMesh');
  doorMesh.position.set(0, 0, 0.04);
  door.add(doorMesh);
  door.position.set(jamb, SILL.top, RAIL_Z - 0.04);

  const lamp = oilLamp();
  const flame = lampGlass();
  const notches: Mesh[] = [];
  for (const [row, y] of [[0, 1.2], [1, 1.12]] as const) {
    for (let k = 0; k < NOTCHES; k += 1) {
      const n = new PartBuilder();
      n.color(row === 0 ? 0x2a1d14 : 0x4a3a2e);
      const z = -0.2 - k * 0.022;
      box(n, WORLD, jamb + 0.0005, y, z - 0.003, jamb + 0.004, y + 0.045, z + 0.003);
      const mesh = n.mesh(plain(0.9, 0, true), `Notch${row}${k}`);
      mesh.visible = false;
      notches.push(mesh);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const line = new Mesh(new PlaneGeometry(0.34, 0.0425), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  line.name = 'ToccoLine';
  line.position.set(-0.3, SILL.top + 0.25, RAIL_Z - 0.02);
  line.rotation.set(-0.33, 0.5, 0, 'YXZ');
  line.renderOrder = 2;

  return { fixtures, tocco, door, up: arrow(true), down: arrow(false), lamp, flame, notches, line };
}

function blobHead(b: PartBuilder, c: V3, r: number): void {
  const rings = 8;
  const seg = 14;
  const at = (i: number, j: number): [V3, V3] => {
    const th = (j / rings) * Math.PI;
    const ph = (i / seg) * Math.PI * 2;
    const n: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    return [[c[0] + r * n[0], c[1] + r * n[1], c[2] + r * n[2]], n];
  };
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < seg; i += 1) {
      const [a, na] = at(i, j);
      const [e, ne] = at(i + 1, j);
      const [g, ng] = at(i + 1, j + 1);
      const [h, nh] = at(i, j + 1);
      b.smoothQuad(a, e, g, h, na, ne, ng, nh);
    }
  }
}

/** A brass arrow on a short post, pointing up or down: the Sunday call. */
function arrow(up: boolean): Mesh {
  const b = new PartBuilder();
  b.color(0x6e5640);
  box(b, WORLD, -0.02, 0, -0.015, 0.02, 0.012, 0.015);
  b.color(BRASS);
  tube(b, [0, 0.012, 0], [0, 0.05, 0], 0.004, 6);
  const tip = up ? 0.11 : 0.05;
  const base = up ? 0.075 : 0.085;
  const f = Frame.of([0, 0, 0], [1, 0, 0], [0, 1, 0]);
  b.quadToward(f.p(-0.006, 0.05, 0), f.p(0.006, 0.05, 0), f.p(0.006, up ? base : 0.11, 0), f.p(-0.006, up ? base : 0.11, 0), [0, 0, 1]);
  b.triToward([-0.022, base, 0], [0.022, base, 0], [0, tip, 0], [0, 0, 1]);
  b.triToward([-0.022, base, -0.002], [0.022, base, -0.002], [0, tip, -0.002], [0, 0, -1]);
  const mesh = b.mesh(glowing(0.3, 0.9), up ? 'ArrowUp' : 'ArrowDown');
  const p = up ? ARROW_UP : ARROW_DOWN;
  mesh.position.set(p.x, p.y, p.z);
  mesh.visible = false;
  return mesh;
}

/** A small brass oil lamp; its glass is a separate mesh so it can be lit. */
function oilLamp(): Mesh {
  const b = new PartBuilder();
  b.color(BRASS);
  prism(b, WORLD, 0, 0, 0, 0.012, 0.045, 0.045, 18, { smooth: true, top: true });
  prism(b, WORLD.at(0, 0.012, 0), 0, 0, 0, 0.02, 0.012, 0.012, 12, { smooth: true });
  prism(b, WORLD.at(0, 0.032, 0), 0, 0, 0, 0.035, 0.034, 0.034, 18, { smooth: true, top: true });
  prism(b, WORLD.at(0, 0.067, 0), 0, 0, 0, 0.012, 0.02, 0.02, 14, { smooth: true, top: true });
  tube(b, [0.034, 0.05, 0], [0.06, 0.05, 0], 0.004, 6, true);
  const lamp = b.mesh(glowing(0.3, 0.9), 'SundayLamp');
  lamp.position.set(LAMP.x, LAMP.y, LAMP.z);
  return lamp;
}

function lampGlass(): Mesh {
  const b = new PartBuilder();
  b.color(0xffffff);
  prism(b, WORLD.at(0, 0.079, 0), 0, 0, 0, 0.11, 0.019, 0.019, 16, { smooth: true });
  const material = new MeshBasicMaterial({ vertexColors: true, color: 0x9aa4a8, transparent: true, opacity: 0.35, depthWrite: false });
  const flame = b.mesh(material, 'SundayLampGlass');
  flame.position.set(LAMP.x, LAMP.y, LAMP.z);
  return flame;
}
