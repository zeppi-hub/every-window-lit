import { CanvasTexture, CylinderGeometry, Group, type Mesh, Mesh as ThreeMesh, MeshStandardMaterial as Standard, RepeatWrapping, SRGBColorSpace } from '@iwsdk/core';
import { box, PartBuilder, prism, torus, tube, tubePath, type V3, WORLD } from './facade.js';
import { PLAZA_Y, SILL, TOWER, WINDOW } from './layout.js';
import type { Kind } from '../season/model.js';
import { glowing, plain } from './materials.js';
import { createOptions } from './options.js';

/**
 * The week's machinery at the window: a wicker basket that a rope hauls up
 * the tower face from the square, the rope's wooden toggle inside the right
 * jamb, an iron brake lever on the left jamb, and the three objects on the
 * sill the Keeper chooses between. All in world space around the seat, all
 * within about 60 cm of the seated eye.
 */

const WICKER = 0xb08850;
const WICKER_DARK = 0x8a6a3c;
const IRON = 0x3b3833;
const TOGGLE = 0x8a6a4c;
const ROPE = 0xcdbf9f;

/** The basket on the sill, centred on its floor; it is 26 cm wide and 18 cm deep. */
export const BASKET_ON_SILL = { x: 0.29, y: SILL.top, z: -0.43 } as const;
/**
 * How far out from the tower face the rope hangs: beyond the 60 cm sweep of
 * the right shutter leaf about its hinge, so opening and closing the
 * shutters never passes through the rope while the basket hangs below. The
 * basket at the window and the rope slanting in to the sill are inside the
 * sweep; the shutters are kept open in those phases (BasketSystem).
 */
const HOIST_REACH = 0.65;
/** Where the hoist lets it down: on the square, under the window, out from the tower. */
export const BASKET_ON_SQUARE = { x: 0.29, y: PLAZA_Y, z: TOWER.frontZ - HOIST_REACH } as const;
/** Just outside the window at sill height, where the basket swings in and out. */
export const BASKET_AT_WINDOW = { x: 0.29, y: SILL.top + 0.08, z: TOWER.frontZ - HOIST_REACH } as const;
/** The pulley on the iron arm over the window, which the rope hangs from. */
export const PULLEY: V3 = [0.29, WINDOW.top + 0.42, TOWER.frontZ - HOIST_REACH];
/** Height of the basket's handle above its floor, where the rope ties on. */
export const BASKET_HANDLE = 0.27;
/** Where an object rides in the basket, above its floor. */
export const SLOT_HEIGHT = 0.06;

/** The rope's toggle inside the right jamb; a pull draws it 15 cm down. */
export const ROPE_REST = { x: 0.53, y: 1.08, z: -0.34 } as const;
export const ROPE_TRAVEL = -0.15;
export const ROPE_THRESHOLD = 0.1;

/** The brake lever's pivot on the left jamb. */
export const LEVER_PIVOT = { x: -0.585, y: 0.98, z: -0.3 } as const;

/**
 * The three objects lie along the sill's near edge, left of the latch, at
 * least 5 cm apart so a fingertip on one does not brush the next; the plan
 * lies end-on to the Keeper for the same reason.
 */
export const CHOICE_HOMES: readonly V3[] = [
  [-0.43, SILL.top, -0.27],
  [-0.27, SILL.top, -0.27],
  [-0.13, SILL.top, -0.27],
];

export interface BasketParts {
  basket: Mesh;
  /** The iron arm and pulley over the window; static. */
  hoist: Group;
  /** The outside rope from pulley to basket; BasketSystem stretches it. */
  rope: Mesh;
  toggle: Group;
  lever: Group;
  /** The sill's three objects, as the fuel week's; ChoiceSystem swaps them to the week's kind from `options`. */
  choices: Mesh[];
  options: Record<Kind, Mesh[]>;
}

export function createBasket(): BasketParts {
  const options = createOptions();
  // The sill's objects are meshes of their own; the fuel set's are lent their shape until the week is known.
  const choices = options.fuel.map((shape, index) => {
    const mesh = new ThreeMesh(shape.geometry, shape.material);
    mesh.name = shape.name;
    mesh.rotation.y = shape.rotation.y;
    const [x, y, z] = CHOICE_HOMES[index];
    mesh.position.set(x, y, z);
    return mesh;
  });
  return {
    basket: wickerBasket(),
    hoist: hoist(),
    rope: hangingRope(),
    toggle: ropeToggle(),
    lever: brakeLever(),
    choices,
    options,
  };
}

/** Tapered open basket woven in rows, with a rim and an arched handle the rope ties to. */
function wickerBasket(): Mesh {
  // The weave repeats every 6 cm on every face (PartBuilder lays planar UVs at this scale).
  const b = new PartBuilder(0.06);
  const rows = 6;
  const height = 0.14;
  const half = (t: number): [number, number] => [0.115 + 0.02 * t, 0.075 + 0.015 * t];
  const ring = (t: number): V3[] => {
    const [hx, hz] = half(t);
    const y = t * height;
    return [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]];
  };
  for (let r = 0; r < rows; r += 1) {
    const lo = ring(r / rows);
    const hi = ring((r + 1) / rows);
    b.color(WICKER);
    for (let k = 0; k < 4; k += 1) {
      const a = lo[k];
      const c = lo[(k + 1) % 4];
      const d = hi[(k + 1) % 4];
      const e = hi[k];
      const out: V3 = [(a[0] + c[0]) / 2, 0, (a[2] + c[2]) / 2];
      b.quadToward(a, c, d, e, out);
      b.quadToward(a, c, d, e, [-out[0], 0, -out[2]]);
    }
  }
  b.color(WICKER_DARK);
  const [bx, bz] = half(0);
  box(b, WORLD, -bx, 0, -bz, bx, 0.01, bz);
  const top = ring(1);
  tubePath(b.color(WICKER), [...top, top[0]], 0.012, 6);
  const arch: V3[] = [];
  for (let k = 0; k <= 10; k += 1) {
    const a = (k / 10) * Math.PI;
    arch.push([-half(1)[0] * Math.cos(a), height + (BASKET_HANDLE - height) * Math.sin(a), 0]);
  }
  tubePath(b.color(WICKER_DARK), arch, 0.01, 6);
  const material = glowing(0.85);
  const weave = weaveTexture();
  material.map = weave;
  material.bumpMap = weave;
  material.bumpScale = 1.5;
  const mesh = b.mesh(material, 'Basket');
  mesh.position.set(BASKET_ON_SQUARE.x, BASKET_ON_SQUARE.y, BASKET_ON_SQUARE.z);
  return mesh;
}

/**
 * Wicker, over and under: pale horizontal strands passing in front of and
 * behind darker upright stakes, each row offset from the last, with dark
 * gaps between. Grey-scale in light, so the basket's vertex colour tints it
 * and the same picture serves as its bump map.
 */
function weaveTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#3a3530';
    g.fillRect(0, 0, size, size);
    const rows = 4;
    const stakes = 4;
    const rh = size / rows;
    const sw = size / stakes;
    for (let r = 0; r < rows; r += 1) {
      const y = r * rh;
      // One strand per row, rounded by a gradient top to bottom.
      const strand = g.createLinearGradient(0, y + 2, 0, y + rh - 2);
      strand.addColorStop(0, '#9c958c');
      strand.addColorStop(0.45, '#f2ece2');
      strand.addColorStop(1, '#8a837a');
      g.fillStyle = strand;
      g.fillRect(0, y + 3, size, rh - 6);
      // Where the stake passes in front, it hides the strand; alternate rows swap.
      for (let s = 0; s < stakes; s += 1) {
        if ((s + r) % 2 === 0) continue;
        const x = s * sw + sw / 2 - 5;
        const stake = g.createLinearGradient(x, 0, x + 10, 0);
        stake.addColorStop(0, '#6e675e');
        stake.addColorStop(0.5, '#c2bbb0');
        stake.addColorStop(1, '#6e675e');
        g.fillStyle = stake;
        g.fillRect(x, y, 10, rh);
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** An iron arm out of the tower face above the window, braced below, with the pulley at its end. */
function hoist(): Group {
  const b = new PartBuilder();
  b.color(IRON);
  const [px, py, pz] = PULLEY;
  const face = TOWER.frontZ;
  tube(b, [px, py + 0.08, face], [px, py + 0.08, pz], 0.025, 8, true);
  tube(b, [px, py - 0.35, face], [px, py + 0.06, pz + 0.3], 0.018, 8, true);
  box(b, WORLD, px - 0.07, py - 0.42, face - 0.01, px + 0.07, py + 0.15, face);
  torus(b, [px, py, pz], [1, 0, 0], 0.07, 0.014, 16, 6);
  tube(b, [px - 0.03, py + 0.08, pz], [px - 0.03, py, pz], 0.008, 6);
  tube(b, [px + 0.03, py + 0.08, pz], [px + 0.03, py, pz], 0.008, 6);
  const group = new Group();
  group.name = 'Hoist';
  group.add(b.mesh(plain(0.6, 0.8), 'HoistArm'));
  return group;
}

/** A unit-high rope, origin at its top; BasketSystem scales and places it every frame. */
function hangingRope(): Mesh {
  const geometry = new CylinderGeometry(0.008, 0.008, 1, 6, 1, true);
  geometry.translate(0, -0.5, 0);
  const rope = new ThreeMesh(geometry, new Standard({ color: ROPE, roughness: 0.9 }));
  rope.name = 'BasketRope';
  rope.position.set(PULLEY[0], PULLEY[1], PULLEY[2]);
  rope.frustumCulled = false;
  return rope;
}

/**
 * The toggle: a turned wooden grip across the end of a cord that runs up
 * into the lintel. The cord goes on above the lintel so a full pull never
 * shows its end. The group is the grabbable; its origin is the grip.
 */
function ropeToggle(): Group {
  const b = new PartBuilder();
  b.color(TOGGLE);
  tube(b, [-0.065, 0, 0], [0.065, 0, 0], 0.022, 10, true);
  b.color(ROPE);
  const above = WINDOW.top + 0.3 - ROPE_REST.y;
  tube(b, [0, 0.015, 0], [0, above, 0], 0.007, 6);
  torus(b, [0, 0.012, 0], [0, 1, 0], 0.014, 0.006, 10, 5);
  const group = new Group();
  group.name = 'RopeToggle';
  group.add(b.mesh(glowing(0.7), 'RopeToggleMesh'));
  group.position.set(ROPE_REST.x, ROPE_REST.y, ROPE_REST.z);
  return group;
}

/** A short iron lever on the left jamb, its wooden knob toward the Keeper; poke it to lower the basket. */
function brakeLever(): Group {
  const b = new PartBuilder();
  b.color(IRON);
  box(b, WORLD, -0.012, -0.05, -0.04, 0, 0.05, 0.04);
  tube(b, [0, 0, -0.025], [0, 0, 0.025], 0.012, 8, true);
  tube(b, [0.006, 0, 0], [0.07, 0.11, 0.03], 0.01, 8, true);
  b.color(TOGGLE);
  prism(b, WORLD.at(0.075, 0.105, 0.032), 0, 0, 0, 0.06, 0.026, 0.026, 12, { smooth: true, top: true });
  const group = new Group();
  group.name = 'BrakeLever';
  group.add(b.mesh(glowing(0.6, 0.5), 'BrakeLeverMesh'));
  group.position.set(LEVER_PIVOT.x, LEVER_PIVOT.y, LEVER_PIVOT.z);
  return group;
}
