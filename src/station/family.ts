import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Vector3,
} from '@iwsdk/core';
import { box, PartBuilder, prism, torus, tube, type V3, WORLD } from './facade.js';
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
 * just outside the shutters' hinge line, a little left so the basket and
 * its rope pass clear on the right.
 */
export const BOX_SCALE = 0.37;
export const BOX_DISPLAY = { x: -0.08, y: 1.0, z: SILL.outerZ - 0.17 } as const;
/** Pushed this far away from the Keeper, the box goes home. */
export const BOX_PUSH = -0.1;
export const BOX_PUSH_THRESHOLD = 0.06;

const WALLPAPER = 0xcfd8c0;
const BOARDS = 0x9c7a56;
const FRAME = 0x4f5d47;

export interface FamilyParts {
  /** The room box; its object is the grabbable you push away. */
  box: Group;
  /** The glass you knock on; moved with the box. */
  glass: Mesh;
  /** A brass hook on the frame, the poke to send the box home. */
  hook: Mesh;
  /** Lina's paper boat on the front ledge, shown once you knock. */
  boat: Mesh;
  /** The three things the week can bring: the car key on its hook, a parcel by the door, a bike helmet. */
  props: Mesh[];
  /** The lamp-lit curtain, redrawn with the family's shadows. */
  curtain: CanvasTexture;
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
  // A table with a lamp on it, a chair, a coat rail on the left wall.
  room.color(0x7a5a3e);
  box(room, WORLD, 0.12, y0 + 0.42, -0.28, 0.5, y0 + 0.46, 0.02);
  for (const [tx, tz] of [[0.15, -0.25], [0.47, -0.25], [0.15, -0.01], [0.47, -0.01]] as const) {
    box(room, WORLD, tx - 0.02, y0, tz - 0.02, tx + 0.02, y0 + 0.42, tz + 0.02);
  }
  box(room, WORLD, -0.08, y0 + 0.24, -0.2, 0.08, y0 + 0.27, -0.04);
  box(room, WORLD, -0.08, y0 + 0.27, -0.21, 0.08, y0 + 0.5, -0.19);
  room.color(0x3b3833);
  box(room, WORLD, x0, y0 + 0.62, -0.2, x0 + 0.03, y0 + 0.66, 0.2);
  room.color(0x8a7a5c);
  tube(room, [0.4, y0 + 0.46, -0.16], [0.4, y0 + 0.66, -0.16], 0.008, 6);
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
  prism(lamp, WORLD.at(0.4, y0 + 0.64, -0.16), 0, 0, 0, 0.12, 0.09, 0.09, 14, { smooth: true, top: true });
  boxGroup.add(lamp.mesh(new MeshBasicMaterial({ vertexColors: true }), 'FamilyLamp'));

  const curtain = curtainTexture();
  const back = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: curtain }));
  back.position.set(0, 0, z0 + 0.01);
  back.name = 'FamilyCurtain';
  boxGroup.add(back);

  const props = [carKey(x0 + 0.05, y0 + 0.6), parcel(x0 + 0.22, y0, z1 - 0.18), helmet(0.3, y0 + 0.46, -0.12)];
  for (const prop of props) {
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
  const lineMesh = new Mesh(
    new PlaneGeometry(0.46, 0.0575),
    new MeshBasicMaterial({ map: line, transparent: true, depthWrite: false }),
  );
  lineMesh.name = 'FamilyLine';
  lineMesh.renderOrder = 2;

  const target = new Mesh(
    new PlaneGeometry(1.0, 2.5),
    new MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }),
  );
  target.name = 'TessaWindow';
  target.position.set(tessaWindow.x, tessaWindow.y, tessaWindow.z + 0.05);

  return { box: boxGroup, glass, hook, boat: paperBoat(z1), props, curtain, line: lineMesh, lineCanvas: line, target };
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
  canvas.height = 128;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The family as shadows on the lamp-lit curtain: Tessa standing, dressed for
 * what the week brought; grandfather Dario seated with his accordion; Lina,
 * small, with one arm up. `wave` alternates Lina's arm. No faces.
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
  g.fillStyle = 'rgba(38, 22, 12, 0.82)';
  const floor = H - 30;
  const person = (cx: number, height: number): number => {
    const head = height * 0.13;
    g.beginPath();
    g.arc(cx, floor - height + head, head, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.roundRect(cx - height * 0.13, floor - height + head * 2, height * 0.26, height * 0.5, height * 0.08);
    g.fill();
    g.fillRect(cx - height * 0.11, floor - height * 0.5 + head * 2 - 4, height * 0.08, height * 0.5 - head * 2 + 4);
    g.fillRect(cx + height * 0.03, floor - height * 0.5 + head * 2 - 4, height * 0.08, height * 0.5 - head * 2 + 4);
    return floor - height + head;
  };
  // Tessa.
  const tessaHead = person(150, 300);
  if (chosen === 2) {
    g.beginPath();
    g.ellipse(150, tessaHead - 10, 46, 30, 0, Math.PI, 0);
    g.fill();
  }
  if (chosen === 1) {
    g.beginPath();
    g.roundRect(186, floor - 190, 60, 52, 10);
    g.fill();
    g.fillRect(170, floor - 240, 8, 60);
  }
  g.save();
  g.translate(185, floor - 205);
  g.rotate(chosen === 0 ? -2.2 : -0.3);
  g.fillRect(0, -9, 80, 18);
  if (chosen === 0) {
    g.beginPath();
    g.arc(86, 0, 10, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // Dario, seated, his accordion on his knees.
  g.beginPath();
  g.arc(320, floor - 205, 34, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.roundRect(290, floor - 170, 64, 100, 18);
  g.fill();
  g.fillRect(280, floor - 75, 100, 22);
  g.fillRect(360, floor - 75, 20, 75);
  for (let k = 0; k < 5; k += 1) g.fillRect(268 + k * 14, floor - 150, 9, 70);
  // Lina.
  const linaHead = person(440, 165);
  g.save();
  g.translate(455, linaHead + 40);
  g.rotate(wave ? -2.4 : -1.9);
  g.fillRect(0, -6, 55, 12);
  g.restore();
  texture.needsUpdate = true;
}

/** One line of what they say, white on a dark band; empty hides it. */
export function drawLine(texture: CanvasTexture, text: string): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (text === '') {
    texture.needsUpdate = true;
    return;
  }
  g.font = '600 52px system-ui, -apple-system, "Segoe UI", sans-serif';
  const width = Math.min(canvas.width - 8, g.measureText(text).width + 64);
  g.fillStyle = 'rgba(20, 18, 16, 0.78)';
  g.beginPath();
  g.roundRect((canvas.width - width) / 2, 14, width, 100, 26);
  g.fill();
  g.fillStyle = '#f6f1e6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, 66, canvas.width - 72);
  texture.needsUpdate = true;
}
