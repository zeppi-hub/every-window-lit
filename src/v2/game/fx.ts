import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
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
  show(text: string, at: Vector3, width: number, seconds: number, drift: Vector3, eye: Object3D): Promise<void> {
    const canvas = this.texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d');
    if (g != null) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.font = '800 150px Georgia, "Times New Roman", "Noto Serif", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 14;
      g.strokeStyle = 'rgba(60, 38, 8, 0.9)';
      g.strokeText(text, 512, 128, 980);
      const gold = g.createLinearGradient(0, 40, 0, 216);
      gold.addColorStop(0, '#fff2b0');
      gold.addColorStop(0.5, '#f2c14e');
      gold.addColorStop(1, '#b07a1e');
      g.fillStyle = gold;
      g.fillText(text, 512, 128, 980);
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
    const material = new MeshStandardMaterial({ color: 0x6c7480, roughness: 1, transparent: true, opacity: 0.88 });
    // All the puffs in one geometry: one draw for the bear.
    const puffs: SphereGeometry[] = [];
    const add = (x: number, y: number, z: number, r: number) => {
      const g = new SphereGeometry(r, 14, 10);
      g.translate(x, y, z);
      puffs.push(g);
    };
    // A sitting bear, roughly: body, head, ears, snout, forelegs; each part a few puffs.
    for (const [x, y, z, r] of [
      [0, 0, 0, 9], [4, -2, 2, 7], [-4, -2, 2, 7], [0, 6, 0, 7.5], [3, -7, 4, 5], [-3, -7, 4, 5],
      [0, 14, 2, 6], [3.5, 15.5, 2, 4.5], [-3.5, 15.5, 2, 4.5], [5, 20, 1, 2.2], [-5, 20, 1, 2.2], [0, 13, 7, 2.6],
      [7, -3, 6, 3.4], [-7, -3, 6, 3.4],
    ] as const) add(x, y, z, r);
    const merged = mergeGeometries(puffs);
    if (merged != null) this.group.add(new Mesh(merged, material));
    this.group.name = 'CloudBear';
    world.createTransformEntity(this.group, { persistent: true });
    this.group.position.copy(home);
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
      }
    });
    this.texture.needsUpdate = true;
    this.mesh.visible = true;
  }
}

/**
 * The neighbours' lit windows round the square (darkWindows): warm panels
 * found on the facades by casting rays out from the square at upper-floor
 * height, so they sit on the walls wherever the model puts them. Unlit one
 * by one (the time-lapse, a wrong word).
 */
export class Windows {
  readonly mesh: InstancedMesh;
  private readonly spots: Matrix4[] = [];
  private litCount = 0;

  constructor(world: World, scene: Object3D, centre: Vector3, count: number, height: number) {
    const material = new MeshBasicMaterial({ color: new Color(1, 0.78, 0.42), toneMapped: false, side: DoubleSide });
    this.mesh = new InstancedMesh(new PlaneGeometry(1.1, 1.5), material, count);
    this.mesh.name = 'NeighbourWindows';
    this.mesh.frustumCulled = false;
    const caster = new Raycaster();
    const hits: { point: Vector3; normal: Vector3 }[] = [];
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + 0.2;
      caster.set(tmpV.set(centre.x, height + (i % 3) * 3.2, centre.z), new Vector3(Math.sin(a), 0, Math.cos(a)));
      caster.far = 60;
      const hit = caster.intersectObject(scene, true).find((h) => h.face != null && Math.abs(h.face.normal.y) < 0.3);
      if (hit?.face == null) continue;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).setY(0).normalize();
      hits.push({ point: hit.point.clone().addScaledVector(normal, 0.06), normal });
    }
    for (const { point, normal } of hits) {
      tmpQ.setFromUnitVectors(new Vector3(0, 0, 1), normal);
      this.spots.push(new Matrix4().compose(point, tmpQ.clone(), new Vector3(1, 1, 1)));
    }
    this.lit = this.spots.length;
    world.createTransformEntity(this.mesh, { persistent: true });
  }

  get total(): number {
    return this.spots.length;
  }

  /** How many are lit (the first ones stay lit longest). */
  set lit(n: number) {
    this.litCount = Math.max(0, Math.min(this.spots.length, Math.round(n)));
    for (let i = 0; i < this.spots.length; i += 1) this.mesh.setMatrixAt(i, i < this.litCount ? this.spots[i] : HIDDEN);
    this.mesh.count = this.spots.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  get lit(): number {
    return this.litCount;
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
