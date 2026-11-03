import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { largerCaptions } from '../comfort.js';
import type { Kind } from '../season/model.js';
import { type ArrowMark, arrowRoom, arrowSize, arrowSpot, captionFont, type CaptionSize, captionSize, layoutLine } from './caption.js';
import { blob, box, PartBuilder, prism, torus, tube, type V3, WORLD } from './facade.js';
import { SILL } from './layout.js';
import { glowing, plain } from './materials.js';

/**
 * Tessa's family across the square, pulled into the Keeper's hands. Their
 * French window on the Milan apartment comes off the facade and floats
 * into the open window as a room box at about a third of its size: a slice
 * of their flat seen through the glass, the family as shadow puppets on a
 * lamp-lit curtain at the back, and in the room whatever the Keeper's
 * choice brought them. A line of what they say runs above the box.
 *
 * Built at full scale around its centre, its glass facing +z; the system
 * scales it down for display.
 */

/** Room box at full scale: 1.2 m wide, 1.0 m high, 0.8 m deep. */
export const ROOM_BOX = { w: 1.2, h: 1.0, d: 0.8 } as const;
/**
 * Scale in the Keeper's window, and where its centre floats: in the opening,
 * 10 cm left so the basket and its rope pass clear on the right (the
 * solidarity week's second basket rests on the sill beside it); its
 * glass, the part knocked on, about 6 cm inside the window's outer face, so
 * no hand reaches out of the window; and high enough that nothing standing
 * on the sill (the Sunday arrows are the tallest, 11 cm) touches it.
 * tests/family-box.test.mjs measures it against the sill's things.
 */
export const BOX_SCALE = 0.37;
export const BOX_DISPLAY = { x: -0.1, y: 1.08, z: SILL.outerZ - 0.1 } as const;
/**
 * The family's line over the box sits this far right of the box's centre:
 * straight ahead while the box is in the window, so both its ends are within
 * 30 degrees of the middle of the view.
 */
export const LINE_SHIFT = -BOX_DISPLAY.x;
/** Pushed this far away from the Keeper, the box goes home. */
export const BOX_PUSH = -0.1;
export const BOX_PUSH_THRESHOLD = 0.06;

const WALLPAPER = 0xcfd8c0;
const BOARDS = 0x9c7a56;
const FRAME = 0x4f5d47;

/**
 * Where the glass, the brass hook and the family's line go for a box centred
 * at `centre` at scale `s` (FamilySystem moves them with the box).
 */
export function placeRiders(centre: Vector3, s: number, glass: Vector3, hook: Vector3, line: Vector3): void {
  const { w, h, d } = ROOM_BOX;
  glass.set(centre.x, centre.y + 0.02 * s, centre.z + (d / 2 + 0.03) * s);
  hook.set(centre.x + (w / 2 - 0.1) * s, centre.y + (h / 2 + 0.16) * s, centre.z + (d / 2 + 0.03) * s);
  line.set(centre.x + (LINE_SHIFT * s) / BOX_SCALE, centre.y + (h / 2 + 0.32) * s, centre.z + (d / 2) * s);
}

export interface FamilyParts {
  /** The room box; its object is the grabbable you push away. */
  box: Group;
  /** The glass you knock on; moved with the box. */
  glass: Mesh;
  /** A brass hook on the frame, the poke to send the box home. */
  hook: Mesh;
  /** Lina's paper boat on the front ledge, shown once you knock. */
  boat: Mesh;
  /**
   * What each option brings into the room, by kind of week: fuel the car key
   * on its hook, a parcel by the door, a bike helmet; power a lighter bill,
   * the baker's loaf, Lina's paper windmill; food a full shopping bag,
   * Lina's lunch tin, a seedling on the window ledge.
   */
  props: Record<Kind, Mesh[]>;
  /** The lamp-lit curtain with the family's shadows, in two frames: Lina's arm down and up. */
  curtain: [CanvasTexture, CanvasTexture];
  /** What they say, above the box. */
  line: Mesh;
  lineCanvas: CanvasTexture;
  /** An invisible pane over Tessa's window across the square: point and pinch at it. */
  target: Mesh;
}

export function createFamily(tessaWindow: Vector3): FamilyParts {
  const { w, h, d } = ROOM_BOX;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const z0 = -d / 2;
  const z1 = d / 2;

  const room = new PartBuilder();
  room.color(WALLPAPER);
  box(room, WORLD, x0 - 0.04, y0, z0, x0, y1, z1);
  box(room, WORLD, x1, y0, z0, x1 + 0.04, y1, z1);
  room.color(0xe9e2d2);
  box(room, WORLD, x0 - 0.04, y1, z0 - 0.04, x1 + 0.04, y1 + 0.04, z1);
  room.color(BOARDS);
  box(room, WORLD, x0 - 0.04, y0 - 0.04, z0 - 0.04, x1 + 0.04, y0, z1 + 0.06);
  room.color(0x6e5640);
  for (let x = x0 + 0.15; x < x1; x += 0.15) box(room, WORLD, x - 0.004, y0, z0, x + 0.004, y0 + 0.003, z1);
  // A table with a lamp on it at the right, a coat rail on the left wall. No chair in the room: Dario's is in
  // his shadow on the curtain, and the furniture keeps clear of the family's shadows.
  room.color(0x7a5a3e);
  box(room, WORLD, 0.36, y0 + 0.42, -0.28, 0.58, y0 + 0.46, 0.02);
  for (const [tx, tz] of [[0.39, -0.25], [0.55, -0.25], [0.39, -0.01], [0.55, -0.01]] as const) {
    box(room, WORLD, tx - 0.02, y0, tz - 0.02, tx + 0.02, y0 + 0.42, tz + 0.02);
  }
  room.color(0x3b3833);
  box(room, WORLD, x0, y0 + 0.62, -0.2, x0 + 0.03, y0 + 0.66, 0.2);
  room.color(0x8a7a5c);
  tube(room, [0.5, y0 + 0.46, -0.16], [0.5, y0 + 0.66, -0.16], 0.008, 6);
  // The French window's frame at the front: posts, head, sill and a glazing bar.
  room.color(FRAME);
  box(room, WORLD, x0 - 0.04, y0 - 0.04, z1, x0 + 0.06, y1 + 0.04, z1 + 0.05);
  box(room, WORLD, x1 - 0.06, y0 - 0.04, z1, x1 + 0.04, y1 + 0.04, z1 + 0.05);
  box(room, WORLD, x0 - 0.04, y1 - 0.06, z1, x1 + 0.04, y1 + 0.04, z1 + 0.05);
  box(room, WORLD, -0.025, y0, z1, 0.025, y1 - 0.06, z1 + 0.05);
  box(room, WORLD, x0 - 0.04, y0 - 0.06, z1, x1 + 0.04, y0 + 0.02, z1 + 0.14);

  const boxGroup = new Group();
  boxGroup.name = 'FamilyBox';
  boxGroup.add(room.mesh(glowing(0.8), 'FamilyRoom'));

  const lamp = new PartBuilder();
  lamp.color(0xffd9a0);
  prism(lamp, WORLD.at(0.5, y0 + 0.64, -0.16), 0, 0, 0, 0.12, 0.09, 0.09, 14, { smooth: true, top: true });
  boxGroup.add(lamp.mesh(new MeshBasicMaterial({ vertexColors: true }), 'FamilyLamp'));

  const curtain: [CanvasTexture, CanvasTexture] = [curtainTexture(), curtainTexture()];
  const back = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: curtain[0] }));
  back.userData.frames = curtain;
  back.position.set(0, 0, z0 + 0.01);
  back.name = 'FamilyCurtain';
  boxGroup.add(back);

  const table = y0 + 0.46;
  const props: Record<Kind, Mesh[]> = {
    fuel: [carKey(x0 + 0.05, y0 + 0.6), parcel(x0 + 0.22, y0, z1 - 0.18), helmet(0.5, table, -0.12)],
    power: [bill(0.44, table, -0.08), familyLoaf(0.47, table, -0.12), pinwheel(x1 - 0.16, y0, z1 - 0.12)],
    food: [shoppingBag(x0 + 0.22, y0, z1 - 0.18), lunchTin(0.46, table, -0.1), seedling(x1 - 0.16, y0, z1 - 0.12)],
  };
  for (const prop of Object.values(props).flat()) {
    prop.visible = false;
    boxGroup.add(prop);
  }

  const glass = new Mesh(
    new PlaneGeometry(w - 0.1, h - 0.1),
    new MeshBasicMaterial({ color: 0xcfe0e8, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  glass.name = 'FamilyGlass';

  const hookBuilder = new PartBuilder();
  hookBuilder.color(0xc9a349);
  torus(hookBuilder, [0, 0, 0], [0, 0, 1], 0.06, 0.018, 16, 6);
  box(hookBuilder, WORLD, -0.03, -0.12, -0.02, 0.03, -0.05, 0.02);
  const hook = hookBuilder.mesh(glowing(0.3, 0.9), 'FamilyHook');

  const line = lineCanvas();
  // Twice a single line's height, room for two (drawLine centres one).
  const lineMesh = new Mesh(
    new PlaneGeometry(0.46, 0.115),
    new MeshBasicMaterial({ map: line, transparent: true, depthWrite: false }),
  );
  lineMesh.name = 'FamilyLine';
  lineMesh.renderOrder = 2;

  const target = new Mesh(
    new PlaneGeometry(1.0, 2.5),
    new MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }),
  );
  target.name = 'TessaWindow';
  target.position.set(tessaWindow.x, tessaWindow.y, tessaWindow.z + 0.05);

  const boat = paperBoat(z1);
  boxGroup.add(boat);

  return { box: boxGroup, glass, hook, boat, props, curtain, line: lineMesh, lineCanvas: line, target };
}

/** The car key on the coat rail: Keeper filled the pumps. */
function carKey(x: number, y: number): Mesh {
  const b = new PartBuilder();
  b.color(0x2a2a2a);
  box(b, WORLD, x, y - 0.12, -0.03, x + 0.03, y - 0.04, 0.03);
  b.color(0xb8b4ac);
  tube(b, [x + 0.015, y - 0.04, 0], [x + 0.015, y, 0], 0.006, 6);
  box(b, WORLD, x + 0.01, y - 0.2, -0.008, x + 0.02, y - 0.12, 0.008);
  return b.mesh(glowing(0.4, 0.6), 'FamilyCarKey');
}

/** A parcel by the door, tied with string: the clinic is paying. */
function parcel(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0xb08a5c);
  box(b, WORLD, x - 0.12, y, z - 0.09, x + 0.12, y + 0.14, z + 0.09);
  b.color(0xe8e0cc);
  box(b, WORLD, x - 0.122, y, z - 0.01, x + 0.122, y + 0.142, z + 0.01);
  box(b, WORLD, x - 0.01, y, z - 0.092, x + 0.01, y + 0.142, z + 0.092);
  return b.mesh(glowing(0.85), 'FamilyParcel');
}

/** A bike helmet on the table: bike till the tram comes. */
function helmet(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0x2f6f9a);
  const rings = 5;
  const seg = 14;
  const at = (i: number, j: number): V3 => {
    const th = (j / rings) * (Math.PI / 2);
    const ph = (i / seg) * Math.PI * 2;
    return [x + 0.11 * Math.cos(th) * Math.cos(ph), y + 0.09 * Math.sin(th), z + 0.13 * Math.cos(th) * Math.sin(ph)];
  };
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < seg; i += 1) b.quadToward(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), [0, 1, 0]);
  }
  return b.mesh(glowing(0.5), 'FamilyHelmet');
}

/** The power bill on the table, opened: a white envelope and its letter. */
function bill(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0xf2efe6);
  box(b, WORLD, x - 0.08, y, z - 0.055, x + 0.08, y + 0.008, z + 0.055);
  b.color(0xe2dccc);
  box(b, WORLD, x - 0.06, y + 0.008, z - 0.08, x + 0.07, y + 0.012, z + 0.03);
  return b.mesh(glowing(0.9), 'FamilyBill');
}

/** The baker's round loaf on the table. */
function familyLoaf(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0xa4652f);
  prism(b, WORLD.at(x, y, z), 0, 0, 0, 0.03, 0.08, 0.085, 16, { smooth: true, bottom: true });
  b.color(0xc58a4e);
  prism(b, WORLD.at(x, y, z), 0, 0, 0.03, 0.06, 0.085, 0.05, 16, { smooth: true });
  prism(b, WORLD.at(x, y, z), 0, 0, 0.06, 0.075, 0.05, 0, 16, { smooth: true });
  return b.mesh(glowing(0.9), 'FamilyLoaf');
}

/** Lina's paper windmill in a jar by the window: a stick and four bright vanes. */
function pinwheel(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0xcfd8d6);
  prism(b, WORLD.at(x, y, z), 0, 0, 0, 0.12, 0.05, 0.05, 12, { smooth: true, top: true });
  b.color(0x8a6a48);
  tube(b, [x, y + 0.1, z], [x, y + 0.45, z], 0.006, 5);
  const hub: V3 = [x, y + 0.45, z + 0.01];
  const colours = [0xd94f3a, 0xf2c14a, 0x3f7fbf, 0x5fa05a];
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2;
    const tip: V3 = [x + 0.1 * Math.cos(a), y + 0.45 + 0.1 * Math.sin(a), z + 0.01];
    const wing: V3 = [x + 0.07 * Math.cos(a + 0.9), y + 0.45 + 0.07 * Math.sin(a + 0.9), z + 0.03];
    b.color(colours[k]);
    b.triToward(hub, tip, wing, [0, 0, 1]);
    b.triToward(hub, wing, tip, [0, 0, -1]);
  }
  return b.mesh(glowing(0.7), 'FamilyPinwheel');
}

/** A full shopping bag by the door, greens showing at the top. */
function shoppingBag(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0xb8946a);
  box(b, WORLD, x - 0.09, y, z - 0.06, x + 0.09, y + 0.2, z + 0.06);
  b.color(0x5f8a3a);
  blob(b, [x - 0.03, y + 0.22, z], 0.05, 0.9);
  b.color(0xd9822b);
  blob(b, [x + 0.04, y + 0.215, z + 0.01], 0.04, 0.9);
  return b.mesh(glowing(0.85), 'FamilyBag');
}

/** Lina's lunch tin on the table, red with a cream lid. */
function lunchTin(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0xa8483a);
  box(b, WORLD, x - 0.08, y, z - 0.05, x + 0.08, y + 0.06, z + 0.05);
  b.color(0xebe1c9);
  box(b, WORLD, x - 0.082, y + 0.06, z - 0.052, x + 0.082, y + 0.075, z + 0.052);
  b.color(0x9a9c9a);
  tube(b, [x - 0.05, y + 0.075, z], [x + 0.05, y + 0.075, z], 0.004, 5);
  return b.mesh(glowing(0.5, 0.3), 'FamilyLunchTin');
}

/** A seedling in a clay pot on the floor by the window. */
function seedling(x: number, y: number, z: number): Mesh {
  const b = new PartBuilder();
  b.color(0xb5653e);
  prism(b, WORLD.at(x, y, z), 0, 0, 0, 0.12, 0.06, 0.08, 14, { smooth: true, bottom: true });
  b.color(0x4a3526);
  prism(b, WORLD.at(x, y, z), 0, 0, 0.12, 0.125, 0.075, 0.075, 14, { top: true });
  b.color(0x5f8a3a);
  tube(b, [x, y + 0.12, z], [x, y + 0.25, z], 0.006, 5);
  blob(b, [x - 0.04, y + 0.24, z], 0.045, 0.6);
  blob(b, [x + 0.04, y + 0.27, z], 0.045, 0.6);
  return b.mesh(glowing(0.8), 'FamilySeedling');
}

/** Lina's folded paper boat on the window ledge. */
function paperBoat(front: number): Mesh {
  const b = new PartBuilder();
  b.color(0xf4f1ea);
  const z = front + 0.09;
  const y = -ROOM_BOX.h / 2 + 0.02;
  b.quadToward([-0.08, y, z - 0.03], [0.08, y, z - 0.03], [0.11, y + 0.05, z - 0.045], [-0.11, y + 0.05, z - 0.045], [0, 0, -1]);
  b.quadToward([-0.08, y, z + 0.03], [0.08, y, z + 0.03], [0.11, y + 0.05, z + 0.045], [-0.11, y + 0.05, z + 0.045], [0, 0, 1]);
  b.triToward([-0.05, y + 0.04, z], [0.05, y + 0.04, z], [0, y + 0.13, z], [0, 0, 1]);
  b.triToward([-0.05, y + 0.04, z], [0.05, y + 0.04, z], [0, y + 0.13, z], [0, 0, -1]);
  const boat = b.mesh(plain(0.9, 0, true), 'LinaBoat');
  boat.visible = false;
  return boat;
}

/** Lina's paper boats kept on the Keeper's sill, one for each week the family was helped this season. */
export const KEEPSAKES = 12;

export function createKeepsakes(): InstancedMesh {
  const b = new PartBuilder();
  b.color(0xf4f1ea);
  // A small folded boat, about 6 cm long, its bow along x.
  b.quadToward([-0.022, 0, -0.008], [0.022, 0, -0.008], [0.03, 0.014, -0.012], [-0.03, 0.014, -0.012], [0, 0, -1]);
  b.quadToward([-0.022, 0, 0.008], [0.022, 0, 0.008], [0.03, 0.014, 0.012], [-0.03, 0.014, 0.012], [0, 0, 1]);
  b.triToward([-0.014, 0.011, 0], [0.014, 0.011, 0], [0, 0.036, 0], [0, 0, 1]);
  b.triToward([-0.014, 0.011, 0], [0.014, 0.011, 0], [0, 0.036, 0], [0, 0, -1]);
  const shape = b.mesh(plain(0.9, 0, true), 'Keepsake') as Mesh;
  const boats = new InstancedMesh(shape.geometry, shape.material, KEEPSAKES);
  boats.name = 'Keepsakes';
  const m = new Matrix4();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const at = new Vector3();
  const one = new Vector3(1, 1, 1);
  for (let i = 0; i < KEEPSAKES; i += 1) {
    // In a row along the sill's outer edge, behind the Sunday arrows and the basket, each set down a little differently.
    turn.setFromAxisAngle(up, 0.25 * Math.sin(i * 2.3));
    boats.setMatrixAt(i, m.compose(at.set(-0.32 + i * 0.056, SILL.top, SILL.outerZ + 0.012), turn, one));
  }
  // Bounds over all twelve before hiding them, so the row is never culled as it grows.
  boats.computeBoundingSphere();
  boats.count = 0;
  return boats;
}

function curtainTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 420;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function lineCanvas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The family as shadows on the lamp-lit curtain: Tessa standing, dressed for
 * what the week brought; grandfather Dario seated with his accordion; Lina,
 * small, holding up a little lamp, its glass lit. `wave` alternates Lina's
 * arm. No faces.
 */
export function drawCurtain(texture: CanvasTexture, chosen: number, wave: boolean): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  const { width: W, height: H } = canvas;
  const light = g.createRadialGradient(W * 0.75, H * 0.35, 20, W * 0.6, H * 0.5, W * 0.75);
  light.addColorStop(0, '#ffd99a');
  light.addColorStop(0.6, '#e9a45c');
  light.addColorStop(1, '#a8622e');
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);
  // Folds.
  for (let x = 0; x < W; x += 32) {
    g.fillStyle = 'rgba(90, 40, 10, 0.12)';
    g.fillRect(x + 18, 0, 10, H);
  }
  // Each of them one path, filled once, with a soft edge like a shadow thrown by a lamp behind the cloth.
  const floor = H - 30;
  g.save();
  g.filter = 'blur(2px)';
  g.fillStyle = 'rgba(38, 22, 12, 0.82)';
  g.beginPath();
  tessa(g, 150, floor, chosen);
  g.fill();
  // Lina between her mother and the glazing bar's shadow; Dario at the right, his accordion clear of the table.
  g.beginPath();
  dario(g, 360, floor);
  g.fill();
  g.beginPath();
  const glass = lina(g, 262, floor, wave);
  g.fill();
  g.restore();
  // Her little lamp's glass, lit: the same light that answers the Keeper's lamp on Sunday.
  g.save();
  g.globalCompositeOperation = 'lighter';
  const shine = g.createRadialGradient(glass.x, glass.y, 1, glass.x, glass.y, 16);
  shine.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
  shine.addColorStop(0.35, 'rgba(255, 200, 120, 0.55)');
  shine.addColorStop(1, 'rgba(255, 170, 90, 0)');
  g.fillStyle = shine;
  g.fillRect(glass.x - 16, glass.y - 16, 32, 32);
  g.restore();
  texture.needsUpdate = true;
}

/** Adds a limb to the current path: a capsule from (x0, y0) to (x1, y1), `w` wide. */
function limb(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = (-Math.sin(a) * w) / 2;
  const ny = (Math.cos(a) * w) / 2;
  g.moveTo(x0 + nx, y0 + ny);
  g.lineTo(x1 + nx, y1 + ny);
  g.arc(x1, y1, w / 2, a + Math.PI / 2, a - Math.PI / 2, true);
  g.lineTo(x0 - nx, y0 - ny);
  g.arc(x0, y0, w / 2, a - Math.PI / 2, a + Math.PI / 2, true);
  g.closePath();
}

function blobAt(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  g.moveTo(x + rx, y);
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

/**
 * Tessa, standing in her coat, hair in a bun; what she holds says what the
 * week brought: the car key held up (the pumps filled), her bag from the
 * clinic, or a cycling helmet (a tram coming, the bike till then).
 */
function tessa(g: CanvasRenderingContext2D, cx: number, floor: number, chosen: number): void {
  blobAt(g, cx, floor - 262, 20, 25);
  blobAt(g, cx - 19, floor - 275, 12, 11);
  g.rect(cx - 7, floor - 242, 14, 18);
  // The coat: shoulders, a belted waist, a hem that flares to the knee.
  g.moveTo(cx - 33, floor - 226);
  g.quadraticCurveTo(cx - 39, floor - 196, cx - 25, floor - 160);
  g.lineTo(cx - 41, floor - 82);
  g.lineTo(cx + 41, floor - 82);
  g.lineTo(cx + 25, floor - 160);
  g.quadraticCurveTo(cx + 39, floor - 196, cx + 33, floor - 226);
  g.quadraticCurveTo(cx, floor - 238, cx - 33, floor - 226);
  g.closePath();
  g.rect(cx - 17, floor - 84, 11, 78);
  g.rect(cx + 6, floor - 84, 11, 78);
  blobAt(g, cx - 14, floor - 5, 13, 6);
  blobAt(g, cx + 14, floor - 5, 13, 6);
  limb(g, cx - 30, floor - 220, cx - 40, floor - 142, 13);
  if (chosen === 0) {
    // The car key held up.
    limb(g, cx + 30, floor - 220, cx + 66, floor - 286, 13);
    blobAt(g, cx + 72, floor - 296, 9, 9);
    g.rect(cx + 70, floor - 318, 5, 20);
  } else {
    limb(g, cx + 30, floor - 220, cx + 40, floor - 142, 13);
  }
  if (chosen === 1) {
    // The clinic's bag on its strap.
    limb(g, cx + 16, floor - 228, cx + 48, floor - 168, 5);
    g.roundRect(cx + 30, floor - 172, 52, 44, 8);
  }
  if (chosen === 2) {
    // A cycling helmet, its strap under the chin.
    g.moveTo(cx - 30, floor - 266);
    g.ellipse(cx, floor - 266, 30, 22, 0, Math.PI, 0);
    g.closePath();
    limb(g, cx + 18, floor - 262, cx + 6, floor - 238, 3);
  }
}

/** Dario, seated on a kitchen chair in a flat cap, his accordion on his knees. */
function dario(g: CanvasRenderingContext2D, cx: number, floor: number): void {
  // The chair: seat, back and legs.
  g.rect(cx - 6, floor - 96, 92, 12);
  g.rect(cx + 74, floor - 196, 12, 112);
  g.rect(cx - 2, floor - 86, 8, 86);
  g.rect(cx + 74, floor - 86, 8, 86);
  // A rounded back, a little stooped.
  g.moveTo(cx + 2, floor - 96);
  g.quadraticCurveTo(cx - 4, floor - 150, cx + 14, floor - 182);
  g.quadraticCurveTo(cx + 40, floor - 196, cx + 64, floor - 178);
  g.quadraticCurveTo(cx + 72, floor - 140, cx + 64, floor - 96);
  g.closePath();
  blobAt(g, cx + 30, floor - 206, 22, 24);
  // The flat cap, its brim forward.
  g.moveTo(cx + 4, floor - 216);
  g.quadraticCurveTo(cx + 26, floor - 244, cx + 56, floor - 222);
  g.lineTo(cx + 54, floor - 212);
  g.lineTo(cx - 10, floor - 210);
  g.closePath();
  // Thighs forward to the knees, shins down, shoes.
  limb(g, cx + 44, floor - 100, cx - 34, floor - 104, 24);
  limb(g, cx - 32, floor - 104, cx - 30, floor - 10, 16);
  blobAt(g, cx - 40, floor - 6, 15, 6);
  // The accordion: pleated bellows between two boards, held at either end.
  g.rect(cx - 52, floor - 176, 10, 66);
  g.rect(cx + 8, floor - 176, 10, 66);
  for (let k = 0; k < 5; k += 1) {
    const x = cx - 42 + k * 10;
    g.moveTo(x, floor - 170);
    g.lineTo(x + 5, floor - 176);
    g.lineTo(x + 10, floor - 170);
    g.lineTo(x + 10, floor - 116);
    g.lineTo(x + 5, floor - 110);
    g.lineTo(x, floor - 116);
    g.closePath();
  }
  limb(g, cx + 20, floor - 178, cx - 46, floor - 146, 12);
  limb(g, cx + 50, floor - 176, cx + 14, floor - 136, 12);
}

/**
 * Lina, in a dress, her hair in two plaits; one hand up, waving at the glass
 * or resting, with a little lamp held up in it. Returns the middle of the
 * lamp's glass, left out of the shadow so its light can be drawn there.
 */
function lina(g: CanvasRenderingContext2D, cx: number, floor: number, wave: boolean): { x: number; y: number } {
  blobAt(g, cx, floor - 146, 17, 18);
  blobAt(g, cx - 20, floor - 134, 6, 10);
  blobAt(g, cx + 20, floor - 134, 6, 10);
  g.rect(cx - 5, floor - 130, 10, 8);
  g.moveTo(cx - 15, floor - 124);
  g.lineTo(cx + 15, floor - 124);
  g.lineTo(cx + 31, floor - 62);
  g.lineTo(cx - 31, floor - 62);
  g.closePath();
  g.rect(cx - 11, floor - 64, 8, 58);
  g.rect(cx + 3, floor - 64, 8, 58);
  blobAt(g, cx - 9, floor - 4, 9, 5);
  blobAt(g, cx + 9, floor - 4, 9, 5);
  limb(g, cx - 14, floor - 120, cx - 24, floor - 80, 9);
  // Resting, the lamp is held in close, its right edge 4 px (two blur widths) short of Grandpa's accordion, so the
  // two shadows never run together; waving, it is up above the accordion.
  const hand = wave ? { x: cx + 36, y: floor - 178 } : { x: cx + 33, y: floor - 154 };
  if (wave) limb(g, cx + 14, floor - 120, cx + 34, floor - 172, 9);
  else limb(g, cx + 14, floor - 120, cx + 30, floor - 150, 9);
  blobAt(g, hand.x, hand.y, 7, 8);
  return lantern(g, hand.x + 1, hand.y - 7);
}

/**
 * A small lantern held up by its foot at (x, y): base, two posts either side
 * of the glass, a cap and a ring. The glass itself is no shadow; its middle
 * is returned.
 */
function lantern(g: CanvasRenderingContext2D, x: number, y: number): { x: number; y: number } {
  g.rect(x - 8, y - 4, 16, 4);
  g.rect(x - 7, y - 20, 2, 16);
  g.rect(x + 5, y - 20, 2, 16);
  g.moveTo(x - 8, y - 20);
  g.lineTo(x + 8, y - 20);
  g.lineTo(x + 4, y - 26);
  g.lineTo(x - 4, y - 26);
  g.closePath();
  g.moveTo(x + 4, y - 30);
  g.arc(x, y - 30, 4, 0, Math.PI * 2);
  g.moveTo(x + 2, y - 30);
  g.arc(x, y - 30, 2, 0, Math.PI * 2, true);
  return { x, y: y - 12 };
}

/**
 * One line of what they say, white on a dark band; empty hides it. Tocco's
 * line is drawn the same way, and his instructions with an arrow at one
 * end of the band (caption.ts ArrowMark), the text beside it. At the
 * larger caption size (comfort.ts) the text, its row step and the band
 * grow; the panel keeps its size. Returns where the arrow's tip is on the
 * canvas (px), or null with no arrow.
 */
export function drawLine(texture: CanvasTexture, text: string, size: CaptionSize = captionSize(largerCaptions()), arrow: ArrowMark | null = null): { x: number; y: number } | null {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return null;
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (text === '') {
    texture.needsUpdate = true;
    return null;
  }
  g.font = captionFont(size.font);
  // A line wider than a band may be (caption.ts) breaks into two rows, after a sentence or clause where it can,
  // rather than squeezing or stretching across the whole panel.
  const frame = { w: canvas.width, h: canvas.height };
  const { rows, widest, room, band } = layoutLine(text, size, arrow != null, (row) => g.measureText(row).width, frame);
  // Dev build: a row wider than the room is pressed narrower by fillText; say how much.
  if (import.meta.env.DEV && widest > room) console.info(`[caption] "${text}" pressed to ${((100 * room) / widest).toFixed(0)}% at ${size.font} px`);
  const { w: width, h: height, lift } = band;
  const middle = canvas.height / 2 - lift;
  g.fillStyle = 'rgba(20, 18, 16, 0.78)';
  g.beginPath();
  g.roundRect((canvas.width - width) / 2, middle - height / 2, width, height, size.radius);
  g.fill();
  // With an arrow, the text stands beside it, its room taken from the arrow's end.
  const shift = arrow == null ? 0 : ((arrow.end === 'left' ? 1 : -1) * arrowRoom(size)) / 2;
  g.fillStyle = '#f6f1e6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  rows.forEach((row, i) => g.fillText(row, canvas.width / 2 + shift, middle + (i - (rows.length - 1) / 2) * size.step, room));
  if (arrow == null) {
    texture.needsUpdate = true;
    return null;
  }
  // A warm brass triangle, its tip toward the thing to touch.
  const spot = arrowSpot(rows.length, widest, size, arrow, frame);
  const r = arrowSize(size) / 2;
  const across = arrow.way === 'left' || arrow.way === 'right';
  g.fillStyle = '#f2c66d';
  g.beginPath();
  g.moveTo(spot.tipX, spot.tipY);
  if (across) {
    const back = spot.x - (spot.tipX - spot.x);
    g.lineTo(back, spot.y - r * 1.05);
    g.lineTo(back, spot.y + r * 1.05);
  } else {
    const back = spot.y - (spot.tipY - spot.y);
    g.lineTo(spot.x - r * 1.05, back);
    g.lineTo(spot.x + r * 1.05, back);
  }
  g.closePath();
  g.fill();
  texture.needsUpdate = true;
  return { x: spot.tipX, y: spot.tipY };
}
