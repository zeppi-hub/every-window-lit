import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, RepeatWrapping, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import type { DirectorSystem } from './director.js';
import { mergeByMaterial } from './fx.js';
import type { Person } from './people.js';
import { contactShadow, type RunningWater, runningWater, woodMaterial } from './pump-looks.js';

/**
 * What the old pump on the square feeds (S21, S23): six shuttered market
 * stalls in an arc before the bench, each with someone standing idle
 * outside it, and a stone channel along their fronts. As the gold water
 * runs down the channel it reaches the stalls one by one: a stall's shutter
 * rolls up, its lamp comes on, and its keeper walks in to the counter. When
 * the water falls back the farthest stall goes dark again, its shutter comes
 * down and its keeper steps back out. Only drawing here; how far the water
 * has come is pump-rules.ts's.
 */

export const STALLS = 6;
/** The arc: its middle (the bench's eye on the floor), the stalls' and the channel's distance from it, and the stalls' bearings (degrees right of north). */
const RADIUS = 6.6;
const CHANNEL_RADIUS = 5.3;
const FIRST_BEARING = 3;
const STEP_BEARING = -13;
/** A stall: its width, depth and height, and its opening (m). */
const WIDE = 1.3;
const DEEP = 0.7;
const COUNTER = 0.9;
const OPENING = 1.0;
const SIGNS = ['BREAD', 'TOOLS', 'SHOES', 'BOOKS', 'TAILOR', 'CAFE'] as const;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Red and cream stripes for the awnings. */
function stripes(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  if (g != null) {
    for (let k = 0; k < 8; k += 1) {
      g.fillStyle = k % 2 === 0 ? '#9c2f2a' : '#ead9b8';
      g.fillRect(k * 16, 0, 16, 32);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A roller shutter's ribs. */
function ribs(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    for (let k = 0; k < 16; k += 1) {
      const shade = g.createLinearGradient(0, k * 8, 0, k * 8 + 8);
      shade.addColorStop(0, '#8d8f8c');
      shade.addColorStop(0.7, '#6f716e');
      shade.addColorStop(1, '#3c3d3b');
      g.fillStyle = shade;
      g.fillRect(0, k * 8, 32, 8);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A lit stall's inside: warm light on three shelves of goods. */
function shelves(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    const glow = g.createRadialGradient(128, 60, 10, 128, 110, 220);
    glow.addColorStop(0, '#fff3c4');
    glow.addColorStop(0.5, '#f6c766');
    glow.addColorStop(1, '#a8672a');
    g.fillStyle = glow;
    g.fillRect(0, 0, 256, 256);
    let seed = 5;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const y of [92, 168, 244]) {
      g.fillStyle = '#5a3a1c';
      g.fillRect(8, y, 240, 10);
      for (let x = 18; x < 236; x += 22 + rnd() * 10) {
        const h = 26 + rnd() * 30;
        g.fillStyle = ['#7a3b22', '#3f5b3a', '#c9a24a', '#8a5a2c', '#2f4a6a'][Math.floor(rnd() * 5)];
        g.fillRect(x, y - h, 14 + rnd() * 8, h);
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The six names on one sheet, one above the other. */
function signSheet(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64 * STALLS;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 40px Georgia, serif';
    SIGNS.forEach((name, k) => {
      g.fillStyle = '#20301f';
      g.fillRect(0, k * 64, 256, 64);
      g.strokeStyle = '#d9b860';
      g.lineWidth = 4;
      g.strokeRect(5, k * 64 + 5, 246, 54);
      g.fillStyle = '#ead9a8';
      g.fillText(name, 128, k * 64 + 34);
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

interface Stall {
  at: Vector3;
  /** The way its front faces (toward the bench). */
  front: Vector3;
  turn: Quaternion;
  /** How far open it is drawn, 0 shut to 1. */
  open: number;
  keeper: Person;
  outside: Vector3;
  inside: Vector3;
}

export class Street {
  private readonly stalls: Stall[] = [];
  private readonly shutters: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly gold: Mesh;
  private readonly water: RunningWater;
  /** For each stretch of the gold ribbon, how far the water must have come (in stalls) for it to show. */
  private readonly reach: number[] = [];
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private readonly step = new Vector3();
  private shown = 0;
  private pulse = 0;

  /** `eye` is the bench's seat (world), `floor` the square's, `basin` where the pump's water lands (world). */
  constructor(d: DirectorSystem, eye: Vector3, floor: number, basin: Vector3) {
    const root = new Group();
    root.name = 'PumpStreet';
    const wood = woodMaterial(0x4a3a2a, 13);
    // One wood for boards and trim: one drawing fewer.
    const trim = wood;
    const cloth = new MeshStandardMaterial({ map: stripes(), roughness: 0.95, side: DoubleSide });
    const sheet = signSheet();
    const signs = new MeshBasicMaterial({ map: sheet });
    const stone = new MeshStandardMaterial({ color: 0x77706a, roughness: 0.95 });
    const statics = new Group();
    statics.name = 'PumpStreet stalls';
    const up = new Vector3(0, 1, 0);
    for (let k = 0; k < STALLS; k += 1) {
      const bearing = rad(FIRST_BEARING + STEP_BEARING * k);
      const away = new Vector3(Math.sin(bearing), 0, -Math.cos(bearing));
      const at = new Vector3(eye.x, floor, eye.z).addScaledVector(away, RADIUS);
      const front = away.clone().negate();
      const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), front);
      const stall = new Group();
      stall.position.copy(at);
      stall.quaternion.copy(turn);
      const box = (w: number, h: number, dp: number, x: number, y: number, z: number, material: MeshStandardMaterial): void => {
        const mesh = new Mesh(new BoxGeometry(w, h, dp), material);
        mesh.position.set(x, y, z);
        stall.add(mesh);
      };
      // A counter, two posts, a head board and a back: the opening between them is what the shutter covers.
      box(WIDE, COUNTER, DEEP, 0, COUNTER / 2, -DEEP / 2, wood);
      box(WIDE + 0.08, 0.05, DEEP + 0.1, 0, COUNTER + 0.025, -DEEP / 2 + 0.03, trim);
      for (const x of [-WIDE / 2 + 0.05, WIDE / 2 - 0.05]) box(0.1, OPENING, DEEP, x, COUNTER + OPENING / 2, -DEEP / 2, wood);
      box(WIDE, 0.36, DEEP, 0, COUNTER + OPENING + 0.18, -DEEP / 2, trim);
      box(WIDE, OPENING, 0.04, 0, COUNTER + OPENING / 2, -DEEP + 0.02, wood);
      const awning = new Mesh(new BoxGeometry(WIDE + 0.16, 0.025, 0.62), cloth);
      awning.position.set(0, COUNTER + OPENING - 0.02, 0.26);
      awning.rotation.x = 0.36;
      stall.add(awning);
      // Its name on the head board: one strip of the sheet.
      const sign = new PlaneGeometry(WIDE - 0.2, 0.26);
      const uv = sign.getAttribute('uv') as BufferAttribute;
      for (let i = 0; i < uv.count; i += 1) uv.setY(i, 1 - (k + 1 - uv.getY(i)) / STALLS);
      const board = new Mesh(sign, signs);
      board.position.set(0, COUNTER + OPENING + 0.19, 0.006);
      stall.add(board);
      statics.add(stall);
      // Where it meets the cobbles: a soft dark patch under it, and a small one where its keeper stands.
      const patch = contactShadow(WIDE + 0.9, DEEP + 1.0);
      patch.position.copy(at).addScaledVector(front, -DEEP / 2).setY(floor + 0.012);
      patch.quaternion.copy(turn);
      statics.add(patch);
      // Its keeper: outside, a step off to one side, with nothing to do.
      const side = new Vector3().crossVectors(up, front).multiplyScalar(k % 2 === 0 ? 0.75 : -0.75);
      const outside = at.clone().addScaledVector(front, 1.7).add(side);
      const inside = at.clone().addScaledVector(front, 0.5);
      const keeper = d.people.add({ model: k % 2 === 0 ? 'suit' : 'dress', cloth: [0x5a4a3a, 0x7a3a3a, 0x3a4a5a, 0x4a5a3a, 0x6a5a2a, 0x4a3a5a][k], hair: [0x2a1e16, 0x5a2e1a, 0x8a8580, 0x1f1712, 0x3b2a1e, 0xb0aaa0][k], skin: [0xe0b394, 0xc99a7a, 0x8a5a42, 0xd9a585, 0xa8755a, 0xe0b394][k] });
      keeper.at(outside.x, floor, outside.z).face(eye.x, eye.z);
      keeper.pose = 'idle';
      this.stalls.push({ at, front, turn, open: 0, keeper, outside, inside });
    }
    // The channel: a stone bed from the pump's basin out to the arc, then along the stalls' fronts; and the gold in it, one ribbon.
    const path: { at: Vector3; reach: number }[] = [];
    const start = new Vector3(basin.x, floor, basin.z);
    const first = rad(FIRST_BEARING + 5);
    const arcStart = new Vector3(eye.x + Math.sin(first) * CHANNEL_RADIUS, floor, eye.z - Math.cos(first) * CHANNEL_RADIUS);
    for (let k = 0; k <= 4; k += 1) path.push({ at: start.clone().lerp(arcStart, k / 4), reach: 0.12 * k });
    // Past each stall's middle the water has reached it: one stall for every 13 degrees of the arc.
    for (let deg = FIRST_BEARING + 5 - 2; deg >= FIRST_BEARING + STEP_BEARING * (STALLS - 1) - 4; deg -= 2) {
      const b = rad(deg);
      path.push({ at: new Vector3(eye.x + Math.sin(b) * CHANNEL_RADIUS, floor, eye.z - Math.cos(b) * CHANNEL_RADIUS), reach: Math.max(0.5, (FIRST_BEARING - deg) / -STEP_BEARING + 0.75) });
    }
    const goldAt: number[] = [];
    const goldUv: number[] = [];
    let run = 0;
    const side = new Vector3();
    for (let k = 0; k < path.length - 1; k += 1) {
      const a = path[k].at;
      const b = path[k + 1].at;
      side.subVectors(b, a).normalize();
      side.set(-side.z, 0, side.x);
      const bed = new Mesh(new BoxGeometry(0.4, 0.07, a.distanceTo(b) + 0.06), stone);
      bed.position.copy(a).lerp(b, 0.5).setY(floor + 0.03);
      bed.lookAt(b.x, floor + 0.03, b.z);
      statics.add(bed);
      const y = floor + 0.072;
      const corners = [a.clone().addScaledVector(side, 0.13), a.clone().addScaledVector(side, -0.13), b.clone().addScaledVector(side, 0.13), b.clone().addScaledVector(side, -0.13)];
      const long = a.distanceTo(b) / 1.3;
      for (const i of [0, 1, 2, 2, 1, 3]) {
        goldAt.push(corners[i].x, y, corners[i].z);
        goldUv.push(i % 2, run + (i >= 2 ? long : 0));
      }
      run += long;
      this.reach.push(path[k + 1].reach);
    }
    const basinBox = new Mesh(new BoxGeometry(0.46, 0.34, 0.46), stone);
    basinBox.position.set(basin.x, floor + 0.17, basin.z);
    statics.add(basinBox);
    mergeByMaterial(statics);
    const ribbon = new BufferGeometry();
    ribbon.setAttribute('position', new BufferAttribute(new Float32Array(goldAt), 3));
    ribbon.setAttribute('uv', new BufferAttribute(new Float32Array(goldUv), 2));
    ribbon.computeVertexNormals();
    this.water = runningWater(0xf2c14e, 0.9, 21);
    this.gold = new Mesh(ribbon, this.water.material);
    this.gold.name = 'PumpStreet gold';
    this.gold.frustumCulled = false;
    ribbon.setDrawRange(0, 0);
    // The shutters and the lamps, one drawing each for all six stalls.
    const leaf = new BoxGeometry(WIDE - 0.2, OPENING, 0.03);
    leaf.translate(0, -OPENING / 2, 0);
    const shutterMap = ribs();
    shutterMap.wrapT = RepeatWrapping;
    this.shutters = new InstancedMesh(leaf, new MeshStandardMaterial({ map: shutterMap, roughness: 0.6, metalness: 0.5 }), STALLS);
    this.shutters.name = 'PumpStreet shutters';
    this.lamps = new InstancedMesh(new PlaneGeometry(WIDE - 0.2, OPENING), new MeshBasicMaterial({ map: shelves(), toneMapped: false }), STALLS);
    this.lamps.name = 'PumpStreet lamps';
    this.shutters.frustumCulled = false;
    this.lamps.frustumCulled = false;
    this.stalls.forEach((stall, k) => {
      this.m.compose(this.p.copy(stall.at).addScaledVector(stall.front, -DEEP + 0.05).setY(stall.at.y + COUNTER + OPENING / 2), stall.turn, this.s.set(1, 1, 1));
      this.lamps.setMatrixAt(k, this.m);
      this.lamps.setColorAt(k, this.c.setRGB(0.04, 0.04, 0.05));
    });
    root.add(statics, this.gold, this.shutters, this.lamps);
    root.traverse((o) => {
      o.pointerEvents = 'none';
    });
    d.world.createTransformEntity(root, { persistent: true });
    d.stage.own('city', root);
    this.draw(0, 0, false);
  }

  /** The whole street leaps brighter for a moment (a stage won). */
  cheer(): void {
    this.pulse = 1;
  }

  /** Draw the street with the water `front` stalls along (0..6); `running` while the spout runs. */
  draw(delta: number, front: number, running: boolean): void {
    this.pulse = Math.max(0, this.pulse - delta);
    // The gold slides away from the pump, faster while the spout runs.
    this.water.run(-delta * (running ? 1.1 : 0.25));
    this.shown += (front - this.shown) * Math.min(1, delta * 3);
    // The gold: as far as the water has come, and at least out of the basin while the spout runs.
    const reached = Math.max(this.shown, running ? 0.3 : 0);
    let stretches = 0;
    while (stretches < this.reach.length && this.reach[stretches] <= reached + 0.7) stretches += 1;
    this.gold.geometry.setDrawRange(0, reached > 0.01 ? stretches * 6 : 0);
    this.stalls.forEach((stall, k) => {
      const wet = Math.max(0, Math.min(1, this.shown - k));
      stall.open += (wet - stall.open) * Math.min(1, delta * 4);
      const open = stall.open;
      // The shutter rolls up from the counter; the lamp comes on behind it.
      this.m.compose(this.p.copy(stall.at).addScaledVector(stall.front, -0.03).setY(stall.at.y + COUNTER + OPENING), stall.turn, this.s.set(1, 1 - 0.93 * open, 1));
      this.shutters.setMatrixAt(k, this.m);
      const light = 0.04 + 0.96 * open * open + 0.5 * this.pulse * open;
      this.lamps.setColorAt(k, this.c.setRGB(light, light, light * 0.97));
      // Its keeper walks in when it opens and back out when it shuts.
      const goal = open > 0.55 ? stall.inside : open < 0.3 ? stall.outside : null;
      const keeper = stall.keeper;
      if (goal != null) {
        this.step.set(goal.x - keeper.position.x, 0, goal.z - keeper.position.z);
        const far = this.step.length();
        if (far > 0.04) {
          const move = Math.min(far, delta * 1.3);
          keeper.position.addScaledVector(this.step, move / far);
          keeper.yaw = Math.atan2(this.step.x, this.step.z);
          keeper.pose = 'walk';
          keeper.stride += delta * 1.7;
        } else if (keeper.pose === 'walk') {
          keeper.pose = 'idle';
          // At the counter they face their stall; outside, the square.
          if (goal === stall.inside) keeper.yaw = Math.atan2(-stall.front.x, -stall.front.z);
          else keeper.yaw = Math.atan2(stall.front.x, stall.front.z);
        }
      }
    });
    this.shutters.instanceMatrix.needsUpdate = true;
    if (this.lamps.instanceColor != null) this.lamps.instanceColor.needsUpdate = true;
  }
}
