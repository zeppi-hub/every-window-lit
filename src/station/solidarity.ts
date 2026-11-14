import { CanvasTexture, Group, InstancedMesh, Matrix4, type Mesh, Mesh as ThreeMesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { type Box, PLAZA_Y } from './layout.js';
import { ALL, box, createKit, Frame, type Kit, PartBuilder, prism, torus, tube, type V3, WORLD } from './facade.js';
import { glowing, plain, scanned } from './materials.js';
import { OPTION_NAMES } from './options.js';

/**
 * The solidarity week (META_VR_FIKIR.md §19): a real disaster on the
 * mainland reaches the island only as a letter and as help going out. The
 * island never shows the disaster itself. Here: the three things of the
 * Keeper's own that can go into the basket (clean boots, a bucket, bottled
 * water); the crates the neighbours stack on the square through the
 * morning; the van that takes them, with the
 * Keeper's gift, down to the harbour, where the letter says a boat is being
 * filled (the harbour itself is out of sight from the seat); and Lina's
 * drawing, which goes too.
 */

/**
 * The crate stack on the square, left of the fountain: from the seat the
 * sill hides anything nearer the tower than about 13 m, so it stands just
 * beyond that, clear of the bench and the pigeons.
 */
export const AID_STACK = { x: -2.8, z: -12.8 } as const;
/** Crates the neighbours bring through the morning. */
export const AID_CRATES = 8;
/** The van's stop beside the stack. */
export const VAN_STOP = { x: -6.0, z: -11.6 } as const;
/**
 * The van's way in from the harbour: down the coast road (below the square,
 * hidden from the seat behind the row's first building), up over the kerb
 * and across the square to its stop. It leaves the same way.
 */
export const VAN_ROUTE: ReadonlyArray<readonly [number, number, number]> = [
  [-23.6, PLAZA_Y - 0.3, -46],
  [-23.6, PLAZA_Y - 0.3, -14.5],
  [-21.6, PLAZA_Y - 0.3, -11.8],
  [-20.4, PLAZA_Y, -11.6],
  [VAN_STOP.x, PLAZA_Y, VAN_STOP.z],
];
/** While the crates stand there, the Keeper walks round them. */
export const STACK_SOLID: Box = [AID_STACK.x - 1.0, PLAZA_Y - 1, AID_STACK.z - 0.8, AID_STACK.x + 1.0, PLAZA_Y + 1.2, AID_STACK.z + 0.8];

export interface SolidarityParts {
  /** The crate stack, as instances; the system adds them one by one. */
  crates: InstancedMesh;
  /** The van that collects them. */
  van: Group;
  /** The sill's three objects in this week, by place (as options.ts). */
  items: Mesh[];
  /** Lina's drawing on the room box's ledge, instead of her paper boat. */
  drawing: ThreeMesh;
}

export function createSolidarity(boxFront: number): SolidarityParts {
  // Built as a part, so the crate has the vertex colours and world-scale UVs its material expects.
  const crateKit = createKit();
  box(crateKit.wood.color(0xd2b48a), WORLD, -0.31, -0.21, -0.25, 0.31, 0.21, 0.25, ALL);
  const crateShape = crateKit.wood.mesh(scanned('wood_shutter'), 'AidCrate') as Mesh;
  const crates = new InstancedMesh(crateShape.geometry, crateShape.material, AID_CRATES);
  crates.name = 'AidCrates';
  const hidden = new Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < AID_CRATES; i += 1) crates.setMatrixAt(i, hidden);
  crates.frustumCulled = false;
  crates.visible = false;

  const van = new Group();
  van.name = 'AidVan';
  const kit = createKit();
  deliveryVan(kit, WORLD);
  const parts: Array<[PartBuilder, ReturnType<typeof plain>]> = [
    [kit.paint, plain(0.45, 0.05)],
    [kit.metal, plain(0.3, 0.9)],
    [kit.glass, plain(0.1)],
    [kit.cloth, plain(0.85)],
  ];
  parts.forEach(([builder, material], index) => {
    if (builder.triangles > 0) van.add(builder.mesh(material, `AidVan${index}`));
  });
  van.position.set(VAN_ROUTE[0][0], VAN_ROUTE[0][1], VAN_ROUTE[0][2]);
  van.visible = false;

  return { crates, van, items: [boots(), bucket(), water()], drawing: drawing(boxFront) };
}

/** A crate's place in the stack: two layers of two by two, the rest on top. */
export function cratePlace(i: number, m: Matrix4): Matrix4 {
  const layer = Math.floor(i / 4);
  const k = i % 4;
  const x = AID_STACK.x + (k % 2 === 0 ? -0.33 : 0.33) + (layer % 2) * 0.04;
  const z = AID_STACK.z + (k < 2 ? -0.27 : 0.27);
  return m.makeTranslation(x, PLAZA_Y + 0.21 + layer * 0.42, z);
}

/** A small period delivery van, cab forward, its box body plain cream: no lettering. Bonnet toward the frame's tangent. */
function deliveryVan(kit: Kit, f: Frame): void {
  const p = kit.paint;
  const round = p.round;
  p.round = 0.1;
  p.color(0x5f7a6a);
  box(p, f, 1.0, 0.35, -0.85, 2.1, 1.0, 0.85, ALL);
  box(p, f, 0.2, 0.35, -0.9, 1.05, 1.85, 0.9, ALL);
  p.color(0xe9e1cc);
  box(p, f, -2.2, 0.4, -0.95, 0.2, 2.15, 0.95, ALL);
  p.round = round;
  const g = kit.glass.color(0x1f2a30);
  box(g, f, 1.04, 1.12, -0.7, 1.08, 1.7, 0.7, ALL);
  for (const side of [-1, 1]) box(g, f, 0.3, 1.15, side * 0.9 - 0.02, 0.95, 1.65, side * 0.9 + 0.02, ALL);
  const chrome = kit.metal.color(0xd8d8d4);
  box(chrome, f, 2.08, 0.3, -0.84, 2.18, 0.42, 0.84, ALL);
  box(chrome, f, -2.28, 0.3, -0.9, -2.18, 0.42, 0.9, ALL);
  kit.glass.color(0xf6efd8);
  for (const side of [-1, 1]) prism(kit.glass, Frame.of(f.p(2.09, 0.72, side * 0.6), f.v(0, 0, 1), f.v(1, 0, 0)), 0, 0, 0, 0.05, 0.085, 0.085, 12, { smooth: true, top: true });
  for (const u of [-1.5, 1.4]) {
    for (const side of [-1, 1]) torus(kit.cloth.color(0x1c1c1c), f.p(u, 0.36, side * 0.82), f.v(0, 0, 1), 0.25, 0.1, 16, 7);
  }
}

function item(b: PartBuilder, roughness: number, metalness: number, index: number, yaw: number): Mesh {
  const mesh = b.mesh(glowing(roughness, metalness), OPTION_NAMES[index]);
  mesh.rotation.y = yaw;
  return mesh;
}

/** A pair of small clean rubber boots, dark green with pale soles. */
function boots(): Mesh {
  const b = new PartBuilder();
  for (const dx of [-0.032, 0.032]) {
    b.color(0xd8d2c4);
    box(b, WORLD, dx - 0.026, 0, -0.05, dx + 0.026, 0.008, 0.045);
    b.color(0x2f5a3f);
    box(b, WORLD, dx - 0.024, 0.008, -0.048, dx + 0.024, 0.04, 0.043);
    prism(b, WORLD.at(dx, 0, -0.022), 0, 0, 0.04, 0.125, 0.026, 0.028, 14, { smooth: true, top: true });
  }
  return item(b, 0.5, 0, 0, 0.2);
}

/** A galvanised bucket with a wire handle. */
function bucket(): Mesh {
  const b = new PartBuilder();
  b.color(0xb4b8b6);
  prism(b, WORLD, 0, 0, 0, 0.11, 0.044, 0.056, 18, { smooth: true, bottom: true });
  prism(b, WORLD, 0, 0, 0.004, 0.11, 0.04, 0.052, 18, { smooth: true, inward: true });
  torus(b, [0, 0.11, 0], [0, 1, 0], 0.056, 0.003, 18, 4);
  b.color(0x8a8e8c);
  const handle: V3[] = [];
  for (let k = 0; k <= 8; k += 1) {
    const a = (k / 8) * Math.PI;
    handle.push([0.056 * Math.cos(a), 0.11 + 0.05 * Math.sin(a), 0]);
  }
  for (let k = 0; k + 1 < handle.length; k += 1) tube(b, handle[k], handle[k + 1], 0.0022, 5);
  return item(b, 0.35, 0.7, 1, 0);
}

/** Four bottles of water in a clear wrap. */
function water(): Mesh {
  const b = new PartBuilder();
  for (const [dx, dz] of [
    [-0.022, -0.022],
    [0.022, -0.022],
    [-0.022, 0.022],
    [0.022, 0.022],
  ] as const) {
    b.color(0xa9cbd8);
    prism(b, WORLD.at(dx, 0, dz), 0, 0, 0, 0.1, 0.02, 0.02, 12, { smooth: true, bottom: true });
    prism(b, WORLD.at(dx, 0, dz), 0, 0, 0.1, 0.125, 0.02, 0.008, 12, { smooth: true });
    b.color(0x2f6f9a);
    prism(b, WORLD.at(dx, 0, dz), 0, 0, 0.125, 0.135, 0.009, 0.009, 10, { smooth: true, top: true });
  }
  return item(b, 0.15, 0, 2, 0.3);
}

/** Lina's crayon drawing of the square under a sun, with the crates stacked by the fountain: no words, no people, no water. */
function drawing(front: number): ThreeMesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#f7f3e8';
    g.fillRect(0, 0, 256, 192);
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.strokeStyle = '#f2b632';
    g.beginPath();
    g.arc(210, 40, 20, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(210 + 28 * Math.cos(a), 40 + 28 * Math.sin(a));
      g.lineTo(210 + 38 * Math.cos(a), 40 + 38 * Math.sin(a));
      g.stroke();
    }
    // The tower on the left, the paving, the crates in a pile and a small heart over them.
    g.fillStyle = '#c99a6a';
    g.fillRect(18, 40, 34, 130);
    g.fillStyle = '#7a5a3e';
    g.fillRect(28, 64, 14, 18);
    g.strokeStyle = '#9a8f80';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(8, 170);
    g.lineTo(248, 170);
    g.stroke();
    g.fillStyle = '#9a6a3a';
    for (const [x, y] of [[110, 140], [140, 140], [170, 140], [125, 112], [155, 112], [140, 84]] as const) g.fillRect(x, y, 26, 26);
    g.fillStyle = '#d9534a';
    g.beginPath();
    g.moveTo(152, 74);
    g.bezierCurveTo(140, 58, 124, 70, 152, 88);
    g.bezierCurveTo(180, 70, 164, 58, 152, 74);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new ThreeMesh(new PlaneGeometry(0.16, 0.12), new MeshBasicMaterial({ map: texture }));
  // Not 'LinaDrawing': that is the turning week's folded drawing on the sill (station/drawing.ts), found by name too.
  mesh.name = 'LinaBoatDrawing';
  // Propped on the room box's front ledge, leaning back, where her paper boat would be.
  mesh.position.set(0, -0.5 + 0.02 + 0.055, front + 0.09);
  mesh.rotation.x = -0.35;
  mesh.visible = false;
  return mesh;
}
