import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type World,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HIDDEN } from '../../station/reactions.js';
import { sharpText, TEXT_ANISOTROPY } from '../../station/sharp-text.js';
import { drawWindow, MARGIN } from './window-art.js';

/**
 * The new version's simple effects, all made in code: rain round the
 * player, things falling from the sky (loaves), gold words (Gray's balloon,
 * a boss's name and the word when it is won), the bear made of cloud,
 * a newspaper or notebook page, lit neighbours' windows that go dark, and
 * signs stuck on shopfronts. Kept cheap for Quest: one instanced mesh per
 * kind, canvases redrawn only when their words change.
 */

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpV = new Vector3();
const up = new Vector3(0, 1, 0);

/** Rain: thin streaks falling round the player. */
export class Rain {
  private readonly mesh: InstancedMesh;
  private readonly drops: Float32Array;
  on = false;
  private static readonly COUNT = 360;
  private static readonly RADIUS = 9;

  constructor(world: World) {
    const material = new MeshBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.35, depthWrite: false });
    this.mesh = new InstancedMesh(new BoxGeometry(0.006, 0.42, 0.006), material, Rain.COUNT);
    this.mesh.name = 'Rain';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.drops = new Float32Array(Rain.COUNT * 3);
    for (let i = 0; i < Rain.COUNT; i += 1) this.seed(i, Math.random() * 9);
    world.createTransformEntity(this.mesh, { persistent: true });
  }

  private seed(i: number, y: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.sqrt(Math.random()) * Rain.RADIUS;
    this.drops[i * 3] = Math.cos(a) * r;
    this.drops[i * 3 + 1] = y;
    this.drops[i * 3 + 2] = Math.sin(a) * r;
  }

  update(delta: number, eye: Vector3): void {
    this.mesh.visible = this.on;
    if (!this.on) return;
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    for (let i = 0; i < Rain.COUNT; i += 1) {
      this.drops[i * 3 + 1] -= delta * 8;
      if (this.drops[i * 3 + 1] < -3) this.seed(i, 6 + Math.random() * 2);
      tmpV.set(eye.x + this.drops[i * 3], eye.y + this.drops[i * 3 + 1], eye.z + this.drops[i * 3 + 2]);
      tmpM.compose(tmpV, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Things falling from the sky and coming to rest (loaves of bread on the umbrellas, stones flying to a wall). */
export class Falls {
  private readonly mesh: InstancedMesh;
  private readonly state: Float32Array;
  private count = 0;
  private static readonly MOST = 80;

  constructor(world: World, colour: number, shape: { x: number; y: number; z: number }) {
    const material = new MeshStandardMaterial({ color: colour, roughness: 0.8 });
    const geometry = new SphereGeometry(1, 10, 6);
    geometry.scale(shape.x, shape.y, shape.z);
    this.mesh = new InstancedMesh(geometry, material, Falls.MOST);
    this.mesh.name = 'Falls';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.state = new Float32Array(Falls.MOST * 6);
    world.createTransformEntity(this.mesh, { persistent: true });
  }

  /** `n` things over a box (centre, half sizes), from `height` above it, landing on `ground`. */
  rain(n: number, centre: Vector3, half: { x: number; z: number }, height: number, ground: number): void {
    for (let i = 0; i < n && this.count < Falls.MOST; i += 1) {
      const k = this.count * 6;
      this.state[k] = centre.x + (Math.random() * 2 - 1) * half.x;
      this.state[k + 1] = centre.y + height + Math.random() * 4;
      this.state[k + 2] = centre.z + (Math.random() * 2 - 1) * half.z;
      this.state[k + 3] = 0;
      this.state[k + 4] = ground + Math.random() * 0.4;
      this.state[k + 5] = Math.random() * Math.PI * 2;
      this.count += 1;
    }
    this.mesh.count = this.count;
  }

  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
  }

  update(delta: number): void {
    if (this.count === 0) return;
    tmpS.set(1, 1, 1);
    for (let i = 0; i < this.count; i += 1) {
      const k = i * 6;
      if (this.state[k + 1] > this.state[k + 4]) {
        this.state[k + 3] -= 9.8 * delta;
        this.state[k + 1] = Math.max(this.state[k + 4], this.state[k + 1] + this.state[k + 3] * delta);
      }
      tmpQ.setFromAxisAngle(up, this.state[k + 5]);
      tmpM.compose(tmpV.set(this.state[k], this.state[k + 1], this.state[k + 2]), tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Words drawn gold on a transparent canvas: Gray's balloon rising from his mouth, a boss's name, the word when won. */
export class GoldWords {
  private readonly mesh: Mesh;
  private readonly texture: CanvasTexture;
  private readonly from = new Vector3();
  private readonly velocity = new Vector3();
  private t = 0;
  private length = 0;
  private resolve: (() => void) | null = null;
  private facing: Object3D | null = null;

  constructor(world: World) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = TEXT_ANISOTROPY;
    this.mesh = new Mesh(new PlaneGeometry(1, 0.25), sharpText(new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false })));
    this.mesh.name = 'GoldWords';
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    this.mesh.pointerEvents = 'none';
    world.createTransformEntity(this.mesh, { persistent: true });
  }

  /** Show `text` at `at`, `width` m wide, drifting by `drift` (m/s) for `seconds`, turned to `eye`. */
  show(text: string, at: Vector3, width: number, seconds: number, drift: Vector3, eye: Object3D, icon: HTMLImageElement | null = null): Promise<void> {
    const canvas = this.texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d');
    if (g != null) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      // The word's picture to the left of its writing, the writing beside it.
      if (icon != null) g.drawImage(icon, 16, 16, 224, 224);
      const middle = icon != null ? 632 : 512;
      const room = icon != null ? 760 : 980;
      g.font = '800 150px Georgia, "Times New Roman", "Noto Serif", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 14;
      g.strokeStyle = 'rgba(60, 38, 8, 0.9)';
      g.strokeText(text, middle, 128, room);
      const gold = g.createLinearGradient(0, 40, 0, 216);
      gold.addColorStop(0, '#fff2b0');
      gold.addColorStop(0.5, '#f2c14e');
      gold.addColorStop(1, '#b07a1e');
      g.fillStyle = gold;
      g.fillText(text, middle, 128, room);
    }
    this.texture.needsUpdate = true;
    this.from.copy(at);
    this.velocity.copy(drift);
    this.mesh.scale.setScalar(width);
    this.t = 0;
    this.length = seconds;
    this.facing = eye;
    this.mesh.visible = true;
    this.resolve?.();
    return new Promise((done) => {
      this.resolve = done;
    });
  }

  update(delta: number): void {
    if (!this.mesh.visible) return;
    this.t += delta;
    this.mesh.position.copy(this.from).addScaledVector(this.velocity, this.t);
    if (this.facing != null) this.mesh.lookAt(this.facing.getWorldPosition(tmpV));
    const k = this.t / this.length;
    (this.mesh.material as MeshBasicMaterial).opacity = k < 0.15 ? k / 0.15 : k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;
    if (this.t >= this.length) {
      this.mesh.visible = false;
      const done = this.resolve;
      this.resolve = null;
      done?.();
    }
  }
}

/** The bear made of storm cloud, high over the city; it comes closer with every wrong word and backs off with every won fight. */
export class CloudBear {
  readonly group = new Group();
  private readonly home = new Vector3();
  private readonly toward = new Vector3();
  private step = 0;
  private shown = 0;

  constructor(world: World, home: Vector3, toward: Vector3) {
    this.home.copy(home);
    this.toward.copy(toward).sub(home).normalize();
    const material = new MeshStandardMaterial({ color: 0x4b525c, roughness: 1, transparent: true, opacity: 0.92 });
    // All the puffs in one geometry: one draw for the bear.
    const puffs: SphereGeometry[] = [];
    // A storm cloud, not a toy: each part of the body is a knot of smaller puffs (a lumpy edge), on all fours, head low and
    // forward toward the city (+z; the group is turned to face it). Four puffs a part, low in segments, for the headset's budget.
    const lumpy = (x: number, y: number, z: number, r: number, seed: number) => {
      for (let i = 0; i < 4; i += 1) {
        const a = seed * 2.4 + i * 2.39996;
        const h = 1 - ((i + 0.5) / 4) * 2;
        const ring = Math.sqrt(1 - h * h);
        const g = new SphereGeometry(r * (0.62 + 0.08 * ((seed + i) % 3)), 9, 6);
        g.translate(x + Math.cos(a) * ring * r * 0.48, y + h * r * 0.4, z + Math.sin(a) * ring * r * 0.48);
        puffs.push(g);
      }
    };
    const parts: readonly (readonly [number, number, number, number])[] = [
      // Body: rump, back, the hump over the shoulders.
      [0, -1, -11, 7.5], [0, 0, -5, 9], [0, 3, 1, 9], [0, 5, 4, 7.5],
      // Head low and forward, the snout, small ears.
      [0, -1, 11, 6.5], [0, -3.5, 16, 3.6], [3.6, 4, 9.5, 2.2], [-3.6, 4, 9.5, 2.2],
      // Four legs and paws, the front ones reaching.
      [5, -9, 6, 3.8], [-5, -9, 6, 3.8], [5.5, -14, 8, 3.2], [-5.5, -14, 8, 3.2],
      [5, -9, -10, 4], [-5, -9, -10, 4], [5, -14, -10, 3.4], [-5, -14, -10, 3.4],
    ];
    parts.forEach(([x, y, z, r], i) => lumpy(x, y, z, r, i));
    const merged = mergeGeometries(puffs);
    if (merged != null) this.group.add(new Mesh(merged, material));
    this.group.name = 'CloudBear';
    world.createTransformEntity(this.group, { persistent: true });
    this.group.position.copy(home);
    // Toward the city it comes to (its snout is +z), turned a little so the square sees it in three-quarter view, a bear on the
    // move (head on, the body hides behind the head and it reads as a heap of cloud).
    this.group.lookAt(toward);
    this.group.rotateY(0.7);
  }

  /** Steps toward the city (+) or back (-); eased in update. */
  set steps(n: number) {
    this.step = n;
  }
  get steps(): number {
    return this.step;
  }

  update(delta: number): void {
    this.shown += (this.step - this.shown) * Math.min(1, delta * 1.2);
    this.group.position.copy(this.home).addScaledVector(this.toward, this.shown * 6);
  }
}

/** A sheet of paper with headlines: the newspaper (S02) or the mother's clippings notebook, a solved line struck out and rewritten. */
export class Paper {
  readonly mesh: Mesh;
  private readonly texture: CanvasTexture;

  constructor(world: World, size: { w: number; h: number }, name: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = Math.round((768 * size.h) / size.w);
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = TEXT_ANISOTROPY;
    this.mesh = new Mesh(new PlaneGeometry(size.w, size.h), sharpText(new MeshBasicMaterial({ map: this.texture, side: DoubleSide })));
    this.mesh.name = name;
    this.mesh.visible = false;
    this.mesh.pointerEvents = 'none';
    world.createTransformEntity(this.mesh, { persistent: true });
  }

  /** Headlines top to bottom; a struck one shows its line through it and its new words under it. */
  /** The picture for a solved headline (the word that solved it), if any. */
  iconFor: (struck: string) => HTMLImageElement | null = () => null;

  write(headlines: readonly { text: string; struck?: string }[]): void {
    const canvas = this.texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d');
    if (g == null) return;
    const { width: w, height: h } = canvas;
    g.fillStyle = '#efe8d8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a332b';
    g.lineWidth = 4;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = (h - 60) / Math.max(1, headlines.length);
    headlines.forEach((line, i) => {
      const y = 30 + step * (i + 0.5);
      g.font = '800 58px Georgia, "Times New Roman", "Noto Serif", serif';
      g.fillStyle = line.struck != null ? '#8a8070' : '#1d1a17';
      g.fillText(line.text, w / 2, line.struck != null ? y - step * 0.18 : y, w - 60);
      if (line.struck != null) {
        const width = Math.min(w - 60, g.measureText(line.text).width);
        g.fillStyle = '#7a1c1c';
        g.fillRect(w / 2 - width / 2, y - step * 0.18 - 3, width, 6);
        g.font = '800 54px Georgia, "Times New Roman", "Noto Serif", serif';
        g.fillStyle = '#1d4a1d';
        g.fillText(line.struck, w / 2, y + step * 0.2, w - 60);
        const icon = this.iconFor(line.struck);
        if (icon != null) g.drawImage(icon, 22, y - step * 0.42, step * 0.84, step * 0.84);
      }
    });
    this.texture.needsUpdate = true;
    this.mesh.visible = true;
  }
}

/** A window of the square's own fronts, in the city model's space: where its middle is on the wall's face, which way the wall looks. */
interface RealWindow {
  at: Vector3;
  out: Vector3;
}

/**
 * The square's real windows that a lit one can sit in, read from the city
 * model's facade meshes: the plain wide ones (1.35 m by 1.5 m, nothing
 * standing in front of them), on the three walls that look onto the square.
 * Each wall: the axis it stands across, where its face is, which way it
 * looks, and for each column of windows its place along the wall and how
 * many floors it has.
 */
const WINDOW_SIZE = { w: 1.35, h: 1.5 };
const FLOORS = [5.32, 8.2, 11.2, 14.2];
const WALLS: { axis: 'x' | 'z'; face: number; looks: number; columns: [number, number][] }[] = [
  { axis: 'x', face: 21, looks: -1, columns: [[-37.5, 3], [-34.5, 3], [-16.5, 4], [-10.5, 4], [-7.5, 4], [7.5, 2], [13.5, 2], [16.5, 2]] },
  { axis: 'x', face: -21, looks: 1, columns: [[-28.5, 3], [-25.5, 3], [-19.5, 3], [-4.5, 2], [-1.5, 2], [4.5, 2]] },
  { axis: 'z', face: 18, looks: -1, columns: [[-19.5, 2], [-16.5, 2], [-10.5, 2], [1.5, 4], [4.5, 4], [10.5, 4]] },
];
/** How far in front of the wall's face the picture stands (the real sill is 3 cm proud). */
const PROUD = 0.045;
/** A ray's hit is moved to the nearest free real window within this distance along the wall; farther, it stays where it fell. */
const SNAP = 9;
let realWindows: RealWindow[] | null = null;
function theRealWindows(): RealWindow[] {
  if (realWindows != null) return realWindows;
  realWindows = [];
  for (const wall of WALLS) {
    for (const [along, floors] of wall.columns) {
      for (let f = 0; f < floors; f += 1) {
        const face = wall.face + wall.looks * PROUD;
        realWindows.push({
          at: wall.axis === 'x' ? new Vector3(face, FLOORS[f], along) : new Vector3(along, FLOORS[f], face),
          out: wall.axis === 'x' ? new Vector3(wall.looks, 0, 0) : new Vector3(0, 0, wall.looks),
        });
      }
    }
  }
  return realWindows;
}
/** The real windows already given a light, for each scene searched (the neighbours' and the shops' lights never share one). */
const takenWindows = new WeakMap<Object3D, Set<number>>();

/** The pictures' sheet: six windows across; two rows lit, two rows dark. */
const SHEET = { size: 1024, w: 170, h: 256, across: 6, most: 12 };
/** Seconds for a light to come up, and to go out. */
const WARM = 0.8;
const COOL = 0.35;

/**
 * The neighbours' lit windows round the square (darkWindows). Rays cast out
 * from the square at upper-floor height find the house fronts, as before;
 * each hit then moves to the nearest real window of the model, and a picture
 * of a window is put over it: lit, a room under its lamp behind a frame of
 * four panes and drawn curtains; dark, grey glass with the sky on it. A
 * light comes up over most of a second and goes out faster. Unlit one by
 * one (the time-lapse, a wrong word). One drawing: every window's dark and
 * lit pictures are quads of one mesh on one sheet, the lit one faded in by
 * its corners' alpha.
 */
export class Windows {
  readonly mesh: Mesh;
  /** Each window's middle, in the world. */
  private readonly centres: Vector3[] = [];
  /** Which window each slot is (slots below `lit` are lit; the first ones stay lit longest). */
  private readonly order: number[] = [];
  /** A window on a real window of the model is seen dark too; one left where its ray fell is seen only lit. */
  private readonly seated: boolean[] = [];
  private level = new Float32Array(0);
  private goal = new Float32Array(0);
  private colour: BufferAttribute | null = null;
  private litCount = 0;
  private moving = false;
  private last = 0;

  constructor(world: World, scene: Object3D, centre: Vector3, count: number, height: number) {
    const caster = new Raycaster();
    const real = theRealWindows();
    let taken = takenWindows.get(scene);
    if (taken == null) {
      taken = new Set();
      takenWindows.set(scene, taken);
    }
    const normals: Vector3[] = [];
    const local = new Vector3();
    const toLocal = new Matrix4();
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + 0.2;
      caster.set(tmpV.set(centre.x, height + (i % 3) * 3.2, centre.z), new Vector3(Math.sin(a), 0, Math.cos(a)));
      caster.far = 60;
      const hit = caster.intersectObject(scene, true).find((h) => h.face != null && Math.abs(h.face.normal.y) < 0.3);
      // Only on a house front: a ray that first meets a lamp, a sign, a kiosk or the bank leaves no window (one floated in the square).
      if (hit?.face == null || !hit.object.name.includes('facade')) continue;
      // The nearest free real window on the wall the ray met, in the model's own space.
      local.copy(hit.point).applyMatrix4(toLocal.copy(hit.object.matrixWorld).invert());
      let best = -1;
      let bestD = SNAP;
      for (let k = 0; k < real.length; k += 1) {
        if (taken.has(k)) continue;
        const w = real[k];
        const off = w.out.x !== 0 ? Math.abs(local.x - w.at.x) : Math.abs(local.z - w.at.z);
        if (off > 0.6) continue;
        const d = Math.hypot(w.out.x !== 0 ? local.z - w.at.z : local.x - w.at.x, local.y - w.at.y);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      if (best >= 0) {
        taken.add(best);
        this.centres.push(real[best].at.clone().applyMatrix4(hit.object.matrixWorld));
        normals.push(real[best].out.clone().transformDirection(hit.object.matrixWorld));
        this.seated.push(true);
      } else {
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).setY(0).normalize();
        this.centres.push(hit.point.clone().addScaledVector(normal, 0.06));
        normals.push(normal);
        this.seated.push(false);
      }
    }
    const n = this.centres.length;
    this.level = new Float32Array(n);
    this.goal = new Float32Array(n);
    for (let k = 0; k < n; k += 1) this.order.push(k);

    // The sheet: each window's own picture, lit above and dark below.
    const canvas = document.createElement('canvas');
    canvas.width = SHEET.size;
    canvas.height = SHEET.size;
    const g = canvas.getContext('2d');
    // Each window: four corners of the dark picture, then four of the lit one, in the same place.
    const position = new Float32Array(n * 8 * 3);
    const uv = new Float32Array(n * 8 * 2);
    const colour = new Float32Array(n * 8 * 4);
    const index: number[] = [];
    const W = WINDOW_SIZE.w + MARGIN * 2;
    const H = WINDOW_SIZE.h + MARGIN * 2;
    const right = new Vector3();
    for (let k = 0; k < n; k += 1) {
      const cell = k % SHEET.most;
      const cx = (cell % SHEET.across) * SHEET.w;
      const cy = Math.floor(cell / SHEET.across) * SHEET.h;
      if (g != null && k < SHEET.most) {
        const c = this.centres[k];
        const seed = Math.abs(Math.round(c.x * 31 + c.y * 17 + c.z * 7));
        drawWindow(g, cx, cy, SHEET.w, SHEET.h, WINDOW_SIZE.w, WINDOW_SIZE.h, seed, true);
        drawWindow(g, cx, cy + SHEET.h * 2, SHEET.w, SHEET.h, WINDOW_SIZE.w, WINDOW_SIZE.h, seed, false);
      }
      // Seen from in front, the picture's right is up x out.
      right.crossVectors(up, normals[k]).normalize();
      for (let layer = 0; layer < 2; layer += 1) {
        // The dark picture is two rows below the lit one.
        const top = layer === 0 ? cy + SHEET.h * 2 : cy;
        for (let v = 0; v < 4; v += 1) {
          const sx = v === 0 || v === 3 ? -1 : 1;
          const sy = v < 2 ? -1 : 1;
          const at = (k * 8 + layer * 4 + v) * 3;
          tmpV.copy(this.centres[k]).addScaledVector(right, (sx * W) / 2);
          position[at] = tmpV.x;
          position[at + 1] = tmpV.y + (sy * H) / 2;
          position[at + 2] = tmpV.z;
          const t = (k * 8 + layer * 4 + v) * 2;
          // Half a texel in from the cell's edge, so a neighbour's picture never bleeds in.
          uv[t] = (sx < 0 ? cx + 0.5 : cx + SHEET.w - 0.5) / SHEET.size;
          uv[t + 1] = 1 - (sy < 0 ? top + SHEET.h - 0.5 : top + 0.5) / SHEET.size;
        }
        const first = k * 8 + layer * 4;
        index.push(first, first + 1, first + 2, first, first + 2, first + 3);
      }
    }
    // The dark pictures are drawn first, the lit ones over them.
    const sorted: number[] = [];
    for (let layer = 0; layer < 2; layer += 1) for (let k = 0; k < n; k += 1) sorted.push(...index.slice((k * 2 + layer) * 6, (k * 2 + layer) * 6 + 6));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    this.colour = new BufferAttribute(colour, 4);
    geometry.setAttribute('color', this.colour);
    geometry.setIndex(sorted);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = TEXT_ANISOTROPY;
    const material = new MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'NeighbourWindows';
    this.mesh.frustumCulled = false;
    // Before the rain and the other see-through things, which are nearer.
    this.mesh.renderOrder = -1;
    this.mesh.pointerEvents = 'none';
    // Not a wall: the next search for house fronts, and every pointer, passes through.
    this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = () => this.tick();
    this.lit = n;
    this.settle();
    world.createTransformEntity(this.mesh, { persistent: true });
    if (import.meta.env.DEV) console.info(`[windows] ${n} found from ${count} rays at ${height} m, ${this.seated.filter(Boolean).length} on real windows`);
  }

  get total(): number {
    return this.centres.length;
  }

  /** How many are lit (the first ones stay lit longest). A light comes up and goes out over a moment. */
  set lit(n: number) {
    const before = this.litCount;
    this.litCount = Math.max(0, Math.min(this.centres.length, Math.round(n)));
    // Dev only: the ends of a run of lights, and its first one coming back.
    if (import.meta.env.DEV && this.litCount !== before && (this.litCount === 0 || this.litCount === this.centres.length || (before === 0 && this.litCount === 1))) {
      console.info(`[windows] ${this.mesh.name}: ${this.litCount} of ${this.centres.length} lit`);
    }
    for (let slot = 0; slot < this.order.length; slot += 1) {
      const k = this.order[slot];
      const goal = slot < this.litCount ? 1 : 0;
      if (this.goal[k] !== goal) {
        this.goal[k] = goal;
        this.moving = true;
      }
    }
  }
  get lit(): number {
    return this.litCount;
  }

  /** Make the lit window most in front of a view (from `from`, looking along `dir`) the next to go out; its slot, or -1 if none is lit. */
  nextOutInView(from: Vector3, dir: Vector3): number {
    let best = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < this.litCount; i += 1) {
      const dot = tmpV.copy(this.centres[this.order[i]]).sub(from).normalize().dot(dir);
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    if (best < 0) return -1;
    if (import.meta.env.DEV) {
      const at = this.centres[this.order[best]];
      console.info(`[windows] next out at ${at.toArray().map((v) => v.toFixed(1))}, ${((Math.acos(Math.min(1, bestDot)) * 180) / Math.PI).toFixed(0)} degrees from the view`);
    }
    // Swapped to the end of the lit ones, so one less lit puts out this one.
    const last = this.litCount - 1;
    [this.order[best], this.order[last]] = [this.order[last], this.order[best]];
    return last;
  }

  /** One slot's light off or on at once (a flicker; how many are lit does not change). */
  flicker(slot: number, on: boolean): void {
    const k = this.order[slot];
    if (k == null) return;
    this.level[k] = on ? 1 : 0;
    this.goal[k] = this.level[k];
    this.paint(k);
    if (this.colour != null) this.colour.needsUpdate = true;
  }

  /** Every light at once where it is going (the first frame; no warming up). */
  private settle(): void {
    for (let k = 0; k < this.level.length; k += 1) {
      this.level[k] = this.goal[k];
      this.paint(k);
    }
    this.moving = false;
    if (this.colour != null) this.colour.needsUpdate = true;
  }

  /** Each frame the windows are drawn: the lights on their way up or down move on. */
  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.moving) return;
    let moving = false;
    for (let k = 0; k < this.level.length; k += 1) {
      const goal = this.goal[k];
      const level = this.level[k];
      if (level === goal) continue;
      this.level[k] = goal > level ? Math.min(goal, level + dt / WARM) : Math.max(goal, level - dt / COOL);
      this.paint(k);
      if (this.level[k] !== goal) moving = true;
    }
    this.moving = moving;
    if (this.colour != null) this.colour.needsUpdate = true;
  }

  /** One window's corners: the dark picture whole (or not at all, off a real window), the lit one as far up as its light is, orange while it warms. */
  private paint(k: number): void {
    if (this.colour == null) return;
    const array = this.colour.array as Float32Array;
    const l = this.level[k];
    const a = l * l * (3 - 2 * l);
    for (let v = 0; v < 4; v += 1) {
      const dark = (k * 8 + v) * 4;
      // A little under its drawn brightness, so an unlit one sits with the model's own dark windows.
      array[dark] = 0.3;
      array[dark + 1] = 0.3;
      array[dark + 2] = 0.3;
      array[dark + 3] = this.seated[k] ? 1 : 0;
      const lit = (k * 8 + 4 + v) * 4;
      array[lit] = 1;
      array[lit + 1] = 0.62 + 0.38 * a;
      array[lit + 2] = 0.3 + 0.7 * a;
      array[lit + 3] = a;
    }
  }
}

/** A sign on a board (canvas), placed and turned by the caller: "SOLD", a shop's closure, a gate's notice. */
export function makeSign(world: World, text: string, size: { w: number; h: number }, colours: { paper: string; ink: string }): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * size.h) / size.w);
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = colours.paper;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = colours.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = Math.round(canvas.height * 0.5);
    g.font = `800 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    while (g.measureText(text).width > canvas.width * 0.9 && px > 12) {
      px -= 2;
      g.font = `800 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    }
    g.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = TEXT_ANISOTROPY;
  const mesh = new Mesh(new PlaneGeometry(size.w, size.h), sharpText(new MeshBasicMaterial({ map: texture, side: DoubleSide })));
  mesh.name = `Sign ${text}`;
  mesh.pointerEvents = 'none';
  world.createTransformEntity(mesh, { persistent: true });
  return mesh;
}

/** A soft warm glow (an orb's light, the sun breaking through): an additive sphere. */
export function makeGlow(world: World, colour: number, radius: number): Mesh {
  const mesh = new Mesh(new SphereGeometry(radius, 20, 14), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  mesh.pointerEvents = 'none';
  world.createTransformEntity(mesh, { persistent: true });
  return mesh;
}

/** A flame's picture: a soft teardrop of light on a transparent canvas, white at the root. */
function flameTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(32, 96, 2, 32, 80, 60);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.beginPath();
    g.moveTo(32, 2);
    g.quadraticCurveTo(64, 70, 50, 120);
    g.lineTo(14, 120);
    g.quadraticCurveTo(0, 70, 32, 2);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Flames: up to `count` flickering tongues of fire, each a camera-facing
 * card (turned about y only) in one instanced, additive mesh. The forest's
 * orange front and the cold blue fire on the wires. Placed by the scene
 * (place), unused ones hidden.
 */
export class Flames {
  readonly mesh: InstancedMesh;
  private readonly at: Vector3[] = [];
  private readonly size: number[] = [];
  private readonly phase: number[] = [];
  private used = 0;
  private t = 0;
  private readonly eye = new Vector3();

  constructor(world: World, count: number, colour: number) {
    const material = new MeshBasicMaterial({ map: flameTexture(), color: colour, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    const geometry = new PlaneGeometry(1, 1.6);
    geometry.translate(0, 0.8, 0);
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.name = 'Flames';
    this.mesh.frustumCulled = false;
    this.mesh.pointerEvents = 'none';
    for (let i = 0; i < count; i += 1) {
      this.at.push(new Vector3());
      this.size.push(1);
      this.phase.push((i * 0.618) % 1);
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.count = count;
    world.createTransformEntity(this.mesh, { persistent: true });
  }

  /** Flame `i` at `position` (its root), `size` m wide. */
  place(i: number, position: Vector3, size: number): void {
    if (i >= this.at.length) return;
    this.at[i].copy(position);
    this.size[i] = size;
    this.used = Math.max(this.used, i + 1);
  }

  /** How many of the placed flames burn (the first ones). */
  set burning(n: number) {
    this.used = Math.max(0, Math.min(this.at.length, n));
  }
  get burning(): number {
    return this.used;
  }

  update(delta: number, head: Object3D): void {
    if (!this.mesh.visible) return;
    this.t += delta;
    head.getWorldPosition(this.eye);
    for (let i = 0; i < this.at.length; i += 1) {
      if (i >= this.used) {
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      const p = this.at[i];
      const flicker = 0.8 + 0.25 * Math.sin(this.t * 11 + this.phase[i] * 20) + 0.1 * Math.sin(this.t * 23 + this.phase[i] * 7);
      tmpQ.setFromAxisAngle(up, Math.atan2(this.eye.x - p.x, this.eye.z - p.z));
      tmpS.set(this.size[i] * (0.9 + 0.1 * flicker), this.size[i] * flicker, 1);
      tmpM.compose(p, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Merge a group's meshes that share a material into one mesh each (their
 * shapes baked into the group's frame): one draw per material instead of
 * one per part. Only plain meshes directly built by the scene; an entity
 * child (a handle) must be added after.
 */
export function mergeByMaterial(root: Object3D): void {
  root.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const sets = new Map<Material, Mesh[]>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh !== true || Array.isArray(mesh.material) || (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh === true || !mesh.visible) return;
    const list = sets.get(mesh.material) ?? [];
    list.push(mesh);
    sets.set(mesh.material, list);
  });
  for (const [material, meshes] of sets) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const g = mesh.geometry.index != null ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      g.applyMatrix4(tmpM.copy(mesh.matrixWorld).premultiply(inverse));
      return g;
    });
    const merged = mergeGeometries(parts);
    if (merged == null) continue;
    const mesh = new Mesh(merged, material);
    mesh.name = `${root.name} ${material.name || 'part'}`;
    mesh.pointerEvents = 'none';
    mesh.renderOrder = meshes[0].renderOrder;
    for (const m of meshes) m.removeFromParent();
    root.add(mesh);
  }
}
