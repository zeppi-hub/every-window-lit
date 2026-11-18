import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { GATES, type Gates } from '../pump-rules.js';
import type { Hands } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { makeGlow, mergeByMaterial } from './fx.js';
import { woodMaterial } from './pump-looks.js';

/**
 * Sharing the water out (the drought farm's third act; the rules are
 * pump-rules.ts, GATES). Before the farmer's knees stands a frame of three
 * levers, a picture under each: a loaf, a house, a chimney. Each lever is
 * the gate of one lane, and the three lanes run side by side down the path
 * between the beds and out to three small places past the field: the
 * bakery on the left, the house in the middle, the factory on the right.
 * The water in a lane is seen running all the way; each place has a tall
 * tank that fills as it comes, and its lamps come on when the tank is full.
 *
 * Everything is in the world's own frame; the seat faces north (-z).
 */

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

/** The levers: across (x) from the seat's middle, and how far the frame is below and before the seated eye (m). */
// They stand clear of where the desk's idle hand rests (0.24 to the side, 0.36 below, 0.28 ahead of the head), so a press never finds that hand on one.
const LEVER = { x: [-0.13, 0, 0.13], below: 0.54, ahead: 0.36, long: 0.16, lean: 0.5, take: 0.12, press: 0.085 } as const;
/** The lanes: across, where they start and where they fan out (z), and their width. */
const LANE = { x: [-0.3, 0, 0.3], from: -0.7, to: -10.2, wide: 0.24, water: 0.17 } as const;
/** The three places, and how far before each its lane ends. */
const PLACES = [
  { x: -4.5, z: -13 },
  { x: 0, z: -15 },
  { x: 5, z: -17 },
] as const;
const BEFORE = 1.5;
const WALLS = [0xe6d6b0, 0xd9dde0, 0x8c4b3a] as const;
/** A lever's handle: dark red while its gate is shut, green while it is open. */
const SHUT = 0x8e2a22;
const OPEN = 0x2f9a45;

/** The picture under lever `k` (a loaf, a house, a chimney): the tank's level rises in it as water, and it turns gold when the place is lit. */
function drawSign(canvas: HTMLCanvasElement, k: number, level: number, lit: boolean): void {
  const g = canvas.getContext('2d');
  if (g == null) return;
  const s = canvas.width;
  g.fillStyle = lit ? '#ffd24a' : '#f3ead6';
  g.fillRect(0, 0, s, s);
  if (!lit && level > 0) {
    g.fillStyle = '#4db8ff';
    g.fillRect(0, s * (1 - level), s, s * level);
  }
  g.strokeStyle = '#2a241c';
  g.lineWidth = s * 0.05;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth);
  g.fillStyle = '#2a241c';
  g.lineJoin = 'round';
  if (k === 0) {
    // A loaf: a domed top on a short body, three cuts across it.
    g.beginPath();
    g.moveTo(s * 0.2, s * 0.7);
    g.lineTo(s * 0.2, s * 0.5);
    g.bezierCurveTo(s * 0.2, s * 0.22, s * 0.8, s * 0.22, s * 0.8, s * 0.5);
    g.lineTo(s * 0.8, s * 0.7);
    g.closePath();
    g.fill();
    g.strokeStyle = lit ? '#ffd24a' : '#f3ead6';
    g.lineWidth = s * 0.04;
    for (const x of [0.38, 0.5, 0.62]) {
      g.beginPath();
      g.moveTo(s * (x - 0.04), s * 0.36);
      g.lineTo(s * (x + 0.04), s * 0.5);
      g.stroke();
    }
  } else if (k === 1) {
    // A house: a square under a roof, one window.
    g.beginPath();
    g.moveTo(s * 0.14, s * 0.48);
    g.lineTo(s * 0.5, s * 0.18);
    g.lineTo(s * 0.86, s * 0.48);
    g.closePath();
    g.fill();
    g.fillRect(s * 0.24, s * 0.48, s * 0.52, s * 0.3);
    g.fillStyle = lit ? '#ffd24a' : '#f3ead6';
    g.fillRect(s * 0.42, s * 0.54, s * 0.16, s * 0.14);
  } else {
    // A factory: a saw-toothed shed and a tall chimney.
    g.fillRect(s * 0.66, s * 0.16, s * 0.12, s * 0.62);
    g.beginPath();
    g.moveTo(s * 0.16, s * 0.78);
    g.lineTo(s * 0.16, s * 0.44);
    g.lineTo(s * 0.34, s * 0.56);
    g.lineTo(s * 0.34, s * 0.44);
    g.lineTo(s * 0.52, s * 0.56);
    g.lineTo(s * 0.52, s * 0.44);
    g.lineTo(s * 0.66, s * 0.56);
    g.lineTo(s * 0.66, s * 0.78);
    g.closePath();
    g.fill();
  }
}

/** A place's front, seen from the seat: dark until its tank is full, then every pane of it lit. */
function drawFront(canvas: HTMLCanvasElement, k: number, lit: boolean): void {
  const g = canvas.getContext('2d');
  if (g == null) return;
  const w = canvas.width;
  const h = canvas.height;
  const wall = `#${WALLS[k].toString(16).padStart(6, '0')}`;
  const pane = lit ? '#ffe08a' : '#2b2a2e';
  g.fillStyle = wall;
  g.fillRect(0, 0, w, h);
  if (k === 0) {
    // The bakery: its sign across the top, a wide window and a door.
    g.fillStyle = lit ? '#fff3c4' : '#5b4630';
    g.fillRect(w * 0.08, h * 0.08, w * 0.84, h * 0.24);
    g.fillStyle = lit ? '#7a2a14' : '#d8c9a6';
    g.font = `800 ${Math.round(h * 0.17)}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BAKERY', w / 2, h * 0.21);
    g.fillStyle = pane;
    g.fillRect(w * 0.1, h * 0.44, w * 0.46, h * 0.36);
    g.fillStyle = '#4a3524';
    g.fillRect(w * 0.68, h * 0.42, w * 0.2, h * 0.58);
  } else if (k === 1) {
    // The house: a door between two windows.
    g.fillStyle = pane;
    g.fillRect(w * 0.1, h * 0.3, w * 0.24, h * 0.34);
    g.fillRect(w * 0.66, h * 0.3, w * 0.24, h * 0.34);
    g.fillStyle = '#4a3524';
    g.fillRect(w * 0.41, h * 0.42, w * 0.18, h * 0.58);
  } else {
    // The factory: two rows of small panes and a wide gate.
    g.fillStyle = pane;
    for (let row = 0; row < 2; row += 1) for (let col = 0; col < 5; col += 1) g.fillRect(w * (0.08 + col * 0.18), h * (0.12 + row * 0.24), w * 0.12, h * 0.16);
    g.fillStyle = '#3a3230';
    g.fillRect(w * 0.36, h * 0.64, w * 0.28, h * 0.36);
  }
}

interface LaneWater {
  mesh: Mesh;
  from: Vector3;
  way: Vector3;
  long: number;
}

export class FarmGates {
  readonly root = new Group();
  /** Each lever's handle, where a hand takes it (a ring can show it). */
  readonly marks: Group[] = [];
  /** Which gates the levers hold open now. */
  readonly open = [false, false, false];
  private readonly levers: Group[] = [];
  private readonly handles: MeshStandardMaterial[] = [];
  private readonly lean = [LEVER.lean, LEVER.lean, LEVER.lean];
  private readonly cool = [0, 0, 0];
  private readonly was: Record<Side, boolean> = { left: false, right: false };
  private pressFor = 0;
  private readonly signs: { canvas: HTMLCanvasElement; texture: CanvasTexture; level: number; lit: boolean }[] = [];
  private readonly fronts: { canvas: HTMLCanvasElement; texture: CanvasTexture; material: MeshStandardMaterial; lit: boolean }[] = [];
  private readonly lanes: LaneWater[][] = [];
  private readonly tanks: Mesh[] = [];
  private readonly glows: Mesh[] = [];
  private readonly at = new Vector3();
  private clock = 0;

  /** `eye` is the seated eye (world), `floor` the platform's top there. */
  constructor(d: DirectorSystem, eye: Vector3, floor: number) {
    const root = this.root;
    root.name = 'FarmGates';
    const wood = woodMaterial(0x7a5a38, 5);
    const dark = woodMaterial(0x4a3524, 9);
    const roof = new MeshStandardMaterial({ color: 0x7a2a22, roughness: 0.85 });
    const walls = WALLS.map((colour) => new MeshStandardMaterial({ color: colour, roughness: 0.9 }));
    const statics = new Group();
    statics.name = 'FarmGates still';
    const box = (w: number, h: number, long: number, x: number, y: number, z: number, material: MeshStandardMaterial, turn = 0): Mesh => {
      const mesh = new Mesh(new BoxGeometry(w, h, long), material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = turn;
      statics.add(mesh);
      return mesh;
    };

    // The lever frame: a rail on two posts before the knees, a board of three pictures on the player's side of it.
    const railY = eye.y - LEVER.below;
    const railZ = eye.z - LEVER.ahead;
    box(0.46, 0.035, 0.06, eye.x, railY, railZ, wood);
    for (const x of [-0.21, 0.21]) box(0.04, railY - floor, 0.05, eye.x + x, floor + (railY - floor) / 2, railZ, wood);
    const board = box(0.44, 0.012, 0.11, eye.x, railY - 0.01, railZ + 0.095, dark);
    board.rotation.x = 0.5;
    for (let k = 0; k < 3; k += 1) {
      const lever = new Group();
      lever.position.set(eye.x + LEVER.x[k], railY + 0.018, railZ);
      const handle = new MeshStandardMaterial({ color: SHUT, roughness: 0.5 });
      const grip = new Mesh(new CylinderGeometry(0.024, 0.011, LEVER.long, 12), handle);
      grip.position.y = LEVER.long / 2;
      const mark = new Group();
      mark.name = `FarmGate ${GATES.places[k]}`;
      mark.position.y = LEVER.long - 0.03;
      lever.add(grip, mark);
      lever.rotation.x = LEVER.lean;
      root.add(lever);
      this.levers.push(lever);
      this.handles.push(handle);
      this.marks.push(mark);
      // Its picture, on the board, facing the eye.
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      drawSign(canvas, k, 0, false);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const sign = new Mesh(new PlaneGeometry(0.085, 0.085), new MeshBasicMaterial({ map: texture, toneMapped: false }));
      sign.position.set(eye.x + LEVER.x[k], railY + 0.0, railZ + 0.1);
      sign.lookAt(eye);
      sign.pointerEvents = 'none';
      root.add(sign);
      this.signs.push({ canvas, texture, level: 0, lit: false });
    }

    // The three lanes: one slab down the path between the beds, boards between the lanes, then a trench from its end to each place.
    const long = LANE.from - LANE.to;
    const mid = (LANE.from + LANE.to) / 2;
    box(3 * LANE.wide + 0.2, 0.04, long, eye.x, 0.03, mid, dark);
    for (const x of [-0.46, -0.15, 0.15, 0.46]) box(0.025, 0.1, long, eye.x + x, 0.07, mid, wood);
    const water = new MeshBasicMaterial({ color: 0x4db8ff, toneMapped: false });
    const strip = new BoxGeometry(LANE.water, 0.03, 1);
    strip.translate(0, 0, 0.5);
    for (let k = 0; k < 3; k += 1) {
      const start = new Vector3(eye.x + LANE.x[k], 0.075, LANE.from);
      const bend = new Vector3(eye.x + LANE.x[k], 0.075, LANE.to);
      // The place stands square to the seat; its lane ends a little before its door.
      const place = new Vector3(eye.x + PLACES[k].x, 0, PLACES[k].z);
      const toSeat = new Vector3(eye.x - place.x, 0, eye.z - place.z).normalize();
      const end = place.clone().addScaledVector(toSeat, BEFORE).setY(0.075);
      const fan = end.clone().sub(bend);
      box(LANE.wide + 0.06, 0.04, fan.length(), (bend.x + end.x) / 2, 0.03, (bend.z + end.z) / 2, dark, Math.atan2(fan.x, fan.z));
      const parts: LaneWater[] = [];
      for (const [from, to] of [[start, bend], [bend, end]] as const) {
        const way = to.clone().sub(from);
        const mesh = new Mesh(strip, water);
        mesh.position.copy(from);
        mesh.rotation.y = Math.atan2(way.x, way.z);
        mesh.visible = false;
        mesh.pointerEvents = 'none';
        root.add(mesh);
        parts.push({ mesh, from: from.clone(), long: way.length(), way: way.normalize() });
      }
      this.lanes.push(parts);

      // The place itself: a small building square to the seat, its front a picture; a roof; a tall tank at its side that fills.
      const house = new Group();
      house.position.copy(place);
      house.lookAt(eye.x, 0, eye.z);
      statics.add(house);
      const part = (geometry: BoxGeometry | CylinderGeometry, material: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
        const mesh = new Mesh(geometry, material);
        mesh.position.set(x, y, z);
        house.add(mesh);
        return mesh;
      };
      part(new BoxGeometry(2.8, 2.3, 2.2), walls[k], 0, 1.15, 0);
      if (k === 0) part(new BoxGeometry(3.0, 0.12, 0.8), roof, 0, 1.62, 1.4).rotation.x = 0.25;
      else if (k === 1) part(new CylinderGeometry(0, 2.2, 1.2, 4), roof, 0, 2.9, 0).rotation.y = Math.PI / 4;
      else part(new CylinderGeometry(0.28, 0.36, 3.4, 10), walls[k], 0.9, 2.3 + 1.7, -0.5);
      // The tank: a dark open frame of two posts and a back board, the water rising between them.
      part(new BoxGeometry(0.9, 2.3, 0.08), dark, -2.05, 1.15, 0.9);
      for (const x of [-2.5, -1.6]) part(new BoxGeometry(0.08, 2.4, 0.16), wood, x, 1.2, 0.98);
      const level = new BoxGeometry(0.78, 1, 0.1);
      level.translate(0, 0.5, 0);
      const tank = new Mesh(level, water);
      tank.position.set(-2.05, 0.05, 1.0);
      tank.scale.y = 0.001;
      tank.visible = false;
      tank.pointerEvents = 'none';
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 208;
      drawFront(canvas, k, false);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const pane = new MeshStandardMaterial({ map: texture, roughness: 0.9, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0 });
      const front = new Mesh(new PlaneGeometry(2.8, 2.3), pane);
      front.position.set(0, 1.15, 1.11);
      front.pointerEvents = 'none';
      // The front and the tank's water are added after the still parts are joined (they change).
      this.fronts.push({ canvas, texture, material: pane, lit: false });
      this.tanks.push(tank);
      const glow = makeGlow(d.world, 0xffd27a, 1.1);
      glow.position.copy(place).setY(k === 2 ? 5.9 : 1.4).addScaledVector(toSeat, k === 2 ? 0 : 1.4);
      glow.visible = false;
      this.glows.push(glow);
      house.userData.changing = [front, tank];
    }
    mergeByMaterial(statics);
    statics.traverse((o) => {
      o.pointerEvents = 'none';
      const changing = o.userData.changing as Mesh[] | undefined;
      if (changing != null) for (const mesh of changing) o.add(mesh);
    });
    root.add(statics);
    root.traverse((o) => {
      if (!this.marks.includes(o as Group)) o.pointerEvents = 'none';
    });
    root.visible = false;
    d.world.createTransformEntity(root, { persistent: true });
  }

  /** Bring the frame, the lanes and the places in (the third act begins) or take them away. */
  show(on: boolean): void {
    this.root.visible = on;
    if (!on) for (const glow of this.glows) glow.visible = false;
  }

  /** Every gate shut, every lane and tank empty, every lamp out: an attempt starts over. */
  reset(): void {
    for (let k = 0; k < 3; k += 1) this.open[k] = false;
    this.pressFor = 0;
  }

  /** The mouse was pressed (the desk's hand may reach the lever a moment after the press). */
  press(): void {
    this.pressFor = 0.35;
  }

  /**
   * The levers: a hand that closes on a handle throws it over (a pinch that begins there; with the desk's mouse, a press while
   * its hand is on the handle). Returns the lever thrown this frame, or -1.
   */
  frame(delta: number, hands: Hands): number {
    let thrown = -1;
    this.pressFor = Math.max(0, this.pressFor - delta);
    for (let k = 0; k < 3; k += 1) {
      this.cool[k] = Math.max(0, this.cool[k] - delta);
      this.marks[k].getWorldPosition(this.at);
      for (const side of SIDES) {
        const off = hands[side].distanceTo(this.at);
        if (this.cool[k] > 0 || thrown >= 0 || off > LEVER.take) continue;
        // A pinch that begins on the handle; or the mouse pressed with its hand right on it (nearer, so the desk's resting hand never counts).
        if ((hands.pinching[side] && !this.was[side]) || (this.pressFor > 0 && off <= LEVER.press)) {
          this.open[k] = !this.open[k];
          this.cool[k] = 0.45;
          this.pressFor = 0;
          thrown = k;
        }
      }
      // Shut leans to the player, open away; the handle shows which.
      const want = this.open[k] ? -LEVER.lean : LEVER.lean;
      this.lean[k] += (want - this.lean[k]) * Math.min(1, delta * 14);
      this.levers[k].rotation.x = this.lean[k];
      this.handles[k].color.setHex(this.open[k] ? OPEN : SHUT);
    }
    for (const side of SIDES) this.was[side] = hands.pinching[side];
    return thrown;
  }

  /** Draw the lanes' water, the tanks and the lamps as the rules have them. */
  draw(delta: number, gates: Gates): void {
    this.clock += delta;
    for (let k = 0; k < 3; k += 1) {
      const parts = this.lanes[k];
      const whole = parts[0].long + parts[1].long;
      let before = 0;
      for (const part of parts) {
        const from = Math.min(part.long, Math.max(0, gates.tail[k] * whole - before));
        const to = Math.min(part.long, Math.max(0, gates.head[k] * whole - before));
        part.mesh.visible = to - from > 0.02;
        if (part.mesh.visible) {
          part.mesh.position.copy(part.from).addScaledVector(part.way, from);
          part.mesh.scale.z = to - from;
        }
        before += part.long;
      }
      const lit = gates.litFor[k] >= 0;
      const tank = this.tanks[k];
      tank.visible = gates.level[k] > 0.01;
      tank.scale.y = Math.max(0.001, 2.2 * gates.level[k]);
      const sign = this.signs[k];
      // The picture is drawn anew only when the level has moved a twelfth, or the lamp has changed.
      const level = Math.round(gates.level[k] * 12) / 12;
      if (level !== sign.level || lit !== sign.lit) {
        sign.level = level;
        sign.lit = lit;
        drawSign(sign.canvas, k, level, lit);
        sign.texture.needsUpdate = true;
      }
      const front = this.fronts[k];
      if (lit !== front.lit) {
        front.lit = lit;
        drawFront(front.canvas, k, lit);
        front.texture.needsUpdate = true;
        // Lit, the front shines by itself (seen across the field at noon).
        front.material.emissiveIntensity = lit ? 0.85 : 0;
      }
      const glow = this.glows[k];
      glow.visible = lit && this.root.visible;
      if (glow.visible) glow.scale.setScalar(1 + 0.12 * Math.sin(this.clock * 3 + k));
    }
  }
}
