import {
  AdditiveBlending,
  AssetManager,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { featherMesh } from '../parrot-system.js';
import type { Beast } from '../valley-rules.js';
import { flameTexture } from './circus-show.js';
import { mergeByMaterial } from './fx.js';
import type { Weather } from './stage.js';

/**
 * The valley of the last herd, built in code (there is no file for it): a
 * snowed-in valley floor between two ridges at dusk, far peaks, a sky with
 * the first stars, mammoths in their winter coats, wolves that are mostly
 * eyes, the elder with a torch, and snow in the air. Everything stands on
 * a flat floor round the middle, so a stake's hole is always at y 0.
 */

/** Dusk as the memory opens, and the night it turns into as the wolves come down. */
// The fog is thick enough to take the far slopes into mist (their plain faces are the last thing to read as built).
export const DUSK: Weather = { sky: 0x1a2140, fog: 0x2d3556, density: 0.02, light: 0.07 };
export const NIGHT: Weather = { sky: 0x080c1c, fog: 0x141a30, density: 0.024, light: 0.035 };

const smooth = (lo: number, hi: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** With the valley's own file under the game (adoptValleyFile), the floor is the file's, made level where the game is played. */
let level = false;

/** The ground's height (m): flat on the valley floor (which runs east and west), rising to a ridge north and south. */
export function groundAt(x: number, z: number): number {
  if (level) return 0;
  const rise = smooth(22, 78, Math.hypot(x * 0.5, z));
  return 21 * rise * rise + 5 * rise * (Math.sin(x * 0.045 + 1.3) + Math.sin(x * 0.11 + z * 0.03) + 0.6 * Math.sin(z * 0.09 - x * 0.02));
}

function snowBumps(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 128, 128);
    let seed = 5;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 900; k += 1) {
      const v = 90 + Math.floor(random() * 90);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.beginPath();
      g.arc(random() * 128, random() * 128, 1 + random() * 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(70, 70);
  return texture;
}

/** The snow: one sheet shaped by groundAt, bluer in its hollows and on its slopes. */
export function buildTerrain(): Mesh {
  const geometry = new PlaneGeometry(360, 360, 110, 110);
  geometry.rotateX(-Math.PI / 2);
  const at = geometry.getAttribute('position');
  const colours = new Float32Array(at.count * 3);
  // Snow at dusk: blue, never white (the lantern and the torch are what whiten it).
  const high = new Color(0x9fb0dc);
  const low = new Color(0x5a6a9c);
  const c = new Color();
  for (let i = 0; i < at.count; i += 1) {
    const x = at.getX(i);
    const z = at.getZ(i);
    const y = groundAt(x, z);
    at.setY(i, y);
    const shade = 0.5 + 0.25 * Math.sin(x * 0.31 + z * 0.17) + 0.25 * Math.sin(z * 0.23 - x * 0.07);
    c.copy(low).lerp(high, Math.min(1, Math.max(0, shade)));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const snow = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, bumpMap: snowBumps(), bumpScale: 0.6 }));
  snow.name = 'ValleySnow';
  snow.pointerEvents = 'none';
  return snow;
}

/** The sky: a dome going from a last band of light at the ridge line up to night, a glow in the west, the first stars, and far peaks as shapes against it. */
export function buildSky(): Group {
  const sky = new Group();
  sky.name = 'ValleySky';
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    const up = g.createLinearGradient(0, 0, 0, 256);
    up.addColorStop(0, '#05081a');
    up.addColorStop(0.28, '#0e1533');
    up.addColorStop(0.42, '#222a58');
    up.addColorStop(0.475, '#4a3e6a');
    up.addColorStop(0.5, '#8a5a6a');
    up.addColorStop(0.51, '#2d3556');
    up.addColorStop(1, '#2d3556');
    g.fillStyle = up;
    g.fillRect(0, 0, 4, 256);
  }
  const gradient = new CanvasTexture(canvas);
  gradient.colorSpace = SRGBColorSpace;
  const dome = new Mesh(new SphereGeometry(700, 24, 16), new MeshBasicMaterial({ map: gradient, side: BackSide, depthWrite: false, fog: false }));
  dome.renderOrder = -0.9;
  sky.add(dome);
  // The last of the day, low in the west.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 64;
  const gg = glowCanvas.getContext('2d');
  if (gg != null) {
    const r = gg.createRadialGradient(64, 64, 2, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,170,90,0.9)');
    r.addColorStop(0.4, 'rgba(220,110,90,0.35)');
    r.addColorStop(1, 'rgba(120,60,90,0)');
    gg.fillStyle = r;
    gg.fillRect(0, 0, 128, 64);
  }
  const glow = new Mesh(new PlaneGeometry(700, 170), new MeshBasicMaterial({ map: new CanvasTexture(glowCanvas), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.set(-640, 78, 0);
  glow.rotation.y = Math.PI / 2;
  glow.renderOrder = -0.8;
  sky.add(glow);
  // Stars, more of them higher up.
  const count = 420;
  const places = new Float32Array(count * 3);
  let seed = 23;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < count; k += 1) {
    const a = random() * Math.PI * 2;
    const up = 0.12 + 0.88 * Math.sqrt(random());
    const flat = Math.sqrt(1 - up * up);
    places.set([Math.cos(a) * flat * 660, up * 660, Math.sin(a) * flat * 660], k * 3);
  }
  const starsAt = new BufferGeometry();
  starsAt.setAttribute('position', new BufferAttribute(places, 3));
  const stars = new Points(starsAt, new PointsMaterial({ color: 0xd6deff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  stars.renderOrder = -0.7;
  stars.frustumCulled = false;
  sky.add(stars);
  // Far ranges: two ridge lines all the way round, dark rock against the last light, their snow dim blue and a little warm where it faces the west.
  const gullies = gullyTexture();
  sky.add(buildRange(330, 150, 3.1, 0.55, gullies), buildRange(255, 95, 0.4, 1, gullies));
  // The moon, risen in the north-east, opposite the last of the day: a pale disc with its seas, and its light on the air round it.
  const moonAt = new Vector3(430, 300, -390).normalize().multiplyScalar(640);
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = 128;
  moonCanvas.height = 128;
  const mg = moonCanvas.getContext('2d');
  if (mg != null) {
    const face = mg.createRadialGradient(54, 50, 6, 64, 64, 62);
    face.addColorStop(0, '#f4f1e4');
    face.addColorStop(0.75, '#d9d8cf');
    face.addColorStop(0.97, '#b9bcc0');
    face.addColorStop(1, 'rgba(185,188,192,0)');
    mg.fillStyle = face;
    mg.fillRect(0, 0, 128, 128);
    mg.globalCompositeOperation = 'source-atop';
    for (const [x, y, r, a] of [[46, 44, 15, 0.16], [74, 38, 11, 0.13], [60, 74, 19, 0.12], [88, 70, 9, 0.14], [36, 78, 8, 0.1], [80, 94, 10, 0.1]] as const) {
      const sea = mg.createRadialGradient(x, y, 1, x, y, r);
      sea.addColorStop(0, `rgba(70,78,96,${a})`);
      sea.addColorStop(1, 'rgba(70,78,96,0)');
      mg.fillStyle = sea;
      mg.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const moonFace = new CanvasTexture(moonCanvas);
  moonFace.colorSpace = SRGBColorSpace;
  const moon = new Mesh(new PlaneGeometry(46, 46), new MeshBasicMaterial({ map: moonFace, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  moon.position.copy(moonAt);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -0.65;
  const hazeCanvas = document.createElement('canvas');
  hazeCanvas.width = 64;
  hazeCanvas.height = 64;
  const hg = hazeCanvas.getContext('2d');
  if (hg != null) {
    const ring = hg.createRadialGradient(32, 32, 4, 32, 32, 32);
    ring.addColorStop(0, 'rgba(200,212,255,0.5)');
    ring.addColorStop(0.3, 'rgba(150,170,235,0.16)');
    ring.addColorStop(1, 'rgba(120,140,220,0)');
    hg.fillStyle = ring;
    hg.fillRect(0, 0, 64, 64);
  }
  const moonHaze = new Mesh(new PlaneGeometry(230, 230), new MeshBasicMaterial({ map: new CanvasTexture(hazeCanvas), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  moonHaze.position.copy(moonAt).multiplyScalar(1.01);
  moonHaze.lookAt(0, 0, 0);
  moonHaze.renderOrder = -0.66;
  sky.add(moonHaze, moon);
  sky.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return sky;
}

/** What weather has cut into a mountainside, to lay over a range's own colours: pale, with darker gullies running down and a grain of rock and snow. */
function gullyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    let seed = 71;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Grain.
    for (let k = 0; k < 2600; k += 1) {
      const v = 150 + Math.floor(random() * 105);
      g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 3);
    }
    // Gullies: from the crest (the picture's top) down the slope, wandering.
    for (let k = 0; k < 70; k += 1) {
      let x = random() * 256;
      const long = 60 + random() * 190;
      g.strokeStyle = `rgba(40,46,70,${0.1 + random() * 0.22})`;
      g.lineWidth = 1 + random() * 3;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 8; y < long; y += 8) {
        x += (random() - 0.5) * 7;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * One far range: a wall of rock all the way round at `far` metres, its crest a broken ridge line up to `tall` metres
 * (sharp peaks, saddles between them), shaded from the valley's haze at its foot to dark rock, with snow above a line
 * that wanders. `dim` (0..1) is how much of its own colour it keeps against the haze: the farther range is paler.
 */
function buildRange(far: number, tall: number, phase: number, dim: number, gullies: CanvasTexture): Mesh {
  const AROUND = 360;
  const ROWS = 6;
  // A sharp peak wherever the sine crosses nought.
  const peak = (a: number, f: number, p: number): number => 1 - Math.abs(Math.sin(a * f + p));
  const crest = (a: number): number => tall * (0.16 + 0.42 * peak(a, 2.5, phase) * peak(a, 1, phase * 0.7) + 0.24 * peak(a, 6.5, phase + 1.1) + 0.12 * peak(a, 15, phase + 2.3) + 0.06 * peak(a, 37, phase + 0.5));
  const at = new Float32Array((AROUND + 1) * (ROWS + 1) * 3);
  const colours = new Float32Array((AROUND + 1) * (ROWS + 1) * 3);
  const uvs = new Float32Array((AROUND + 1) * (ROWS + 1) * 2);
  const haze = new Color(0x2d3556);
  const rock = new Color(0x10162c);
  const snow = new Color(0x5b6a98);
  const warm = new Color(0x9a7286);
  const c = new Color();
  const lit = new Color();
  let n = 0;
  for (let k = 0; k <= AROUND; k += 1) {
    const a = (k / AROUND) * Math.PI * 2;
    const top = crest(a);
    // Where the snow begins on this slope (a share of its height), and how much of the west's last light falls on it (the east side of the valley faces it).
    const line = 0.5 + 0.14 * Math.sin(a * 9 + phase) + 0.08 * Math.sin(a * 23 + 1);
    const facing = Math.max(0, Math.cos(a));
    lit.copy(snow).lerp(warm, 0.55 * facing);
    for (let row = 0; row <= ROWS; row += 1) {
      const v = row / ROWS;
      // A little nearer at the foot than at the crest: the wall leans back, as a slope does.
      const r = far * (0.94 + 0.06 * v);
      at.set([Math.cos(a) * r, -6 + top * v, Math.sin(a) * r], n * 3);
      c.copy(haze).lerp(rock, Math.min(1, v * 2.4));
      if (v > line) c.lerp(lit, Math.min(1, (v - line) / 0.18) * (0.75 + 0.25 * Math.sin(a * 61 + row)));
      c.lerp(haze, 1 - dim);
      colours.set([c.r, c.g, c.b], n * 3);
      // The gullies' picture goes round twenty-four times, and up once.
      uvs.set([(k / AROUND) * 24, v], n * 2);
      n += 1;
    }
  }
  const faces: number[] = [];
  for (let k = 0; k < AROUND; k += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const a0 = k * (ROWS + 1) + row;
      const b0 = (k + 1) * (ROWS + 1) + row;
      faces.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(at, 3));
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(faces);
  const range = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, map: gullies, fog: false, side: DoubleSide }));
  range.name = 'ValleyRange';
  range.frustumCulled = false;
  range.renderOrder = -0.6;
  return range;
}

/** The light there is: the cold sky from the south-west, enough to give the herd its shapes. */
export function buildSkyLight(): DirectionalLight {
  const light = new DirectionalLight(0x7f96ff, 0.16);
  light.position.set(-40, 60, 30);
  light.name = 'ValleySkyLight';
  return light;
}

/** The warm light that stays inside a ring that holds. */
export function buildRingLight(): SpotLight {
  const light = new SpotLight(0xffd9a0, 0, 40, 0.5, 0.7, 1.5);
  light.name = 'RingLight';
  light.position.set(0, 17, 0);
  light.target.position.set(0, 0, 0);
  return light;
}

export function furTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#6b4a30';
    g.fillRect(0, 0, 128, 128);
    let seed = 41;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Long hair hanging down: dark and light strands.
    for (let k = 0; k < 520; k += 1) {
      const x = random() * 128;
      const y = random() * 128;
      const long = 14 + random() * 40;
      const v = random();
      g.strokeStyle = v < 0.5 ? `rgba(40,24,14,${0.25 + random() * 0.4})` : `rgba(150,110,74,${0.15 + random() * 0.3})`;
      g.lineWidth = 1 + random() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (random() - 0.5) * 6, y + long / 2, x + (random() - 0.5) * 8, y + long);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

let fur: MeshStandardMaterial | null = null;
let ivory: MeshStandardMaterial | null = null;

export interface Mammoth {
  /** The modelled animal from the valley's file, when there is one (then there are no separate head and legs). */
  model: Object3D | null;
  /** Placed and turned by the scene: it faces its own +z. */
  group: Group;
  head: Group;
  legs: Mesh[];
  kind: Beast['kind'];
  /** Its size against a grown cow (the scene's reach and stride). */
  size: number;
  /** Where it is in its own breathing and walking (s). */
  phase: number;
  walking: number;
}

/**
 * A woolly mammoth: a high domed head, a hump over the shoulders and a back
 * that slopes away from it, a coat hanging to the knees, the trunk, and
 * tusks that go out and curl back in. A calf has no tusks yet. The body and
 * the head are each one draw of fur (the head sways on its own), the legs
 * four more (they walk).
 */
export function buildMammoth(kind: Beast['kind'], seed: number, model: Object3D | null = null): Mammoth {
  if (model != null) {
    // The file's mammoth: about 5 m long at its own size; the herd's cows a little under that, so three fit a small ring.
    const scale = kind === 'calf' ? 0.5 : kind === 'bull' ? 0.9 : 0.8;
    const holder = new Group();
    holder.name = `Mammoth ${kind}`;
    model.position.set(0, 0, 0);
    model.rotation.set(0, headEnd(model) > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    model.scale.setScalar(scale);
    model.visible = true;
    holder.add(model);
    return { model, group: holder, head: new Group(), legs: [], kind, size: scale, phase: seed * 1.7, walking: 0 };
  }
  fur ??= new MeshStandardMaterial({ map: furTexture(), color: 0xb89a84, roughness: 1 });
  ivory ??= new MeshStandardMaterial({ color: 0xe9dfc4, roughness: 0.5 });
  const coat = fur;
  const size = kind === 'calf' ? 0.45 : kind === 'bull' ? 1.1 : 0.95;
  const group = new Group();
  group.name = `Mammoth ${kind}`;
  // Built along +x, then turned to face +z.
  const frame = new Group();
  frame.rotation.y = -Math.PI / 2;
  frame.scale.setScalar(size);
  group.add(frame);
  const ball = (sx: number, sy: number, sz: number, x: number, y: number, z: number, material = coat): Mesh => {
    const mesh = new Mesh(new SphereGeometry(1, 14, 10), material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const body = new Group();
  body.name = 'MammothBody';
  body.add(ball(1.5, 1.1, 0.92, -0.15, 1.95, 0), ball(0.9, 0.85, 0.82, 0.7, 2.55, 0), ball(0.85, 0.85, 0.82, -1.15, 1.72, 0), ball(1.45, 0.8, 0.88, -0.1, 1.38, 0));
  const tail = new Mesh(new CylinderGeometry(0.05, 0.03, 0.9, 6), coat);
  tail.position.set(-1.98, 1.5, 0);
  tail.rotation.z = -0.25;
  body.add(tail);
  frame.add(body);
  mergeByMaterial(body);
  const head = new Group();
  head.name = 'MammothHead';
  head.position.set(1.25, 2.55, 0);
  head.add(ball(0.62, 0.78, 0.58, 0.55, 0.12, 0), ball(0.37, 0.37, 0.37, 0.5, 0.82, 0), ball(0.08, 0.3, 0.24, 0.3, 0.2, 0.54), ball(0.08, 0.3, 0.24, 0.3, 0.2, -0.54));
  // The trunk: tapering pieces down a curve that ends in a small forward curl.
  const curve: [number, number, number][] = [
    [1.0, -0.12, 0.25],
    [1.12, -0.58, 0.22],
    [1.16, -1.03, 0.19],
    [1.13, -1.45, 0.16],
    [1.06, -1.8, 0.13],
    [1.1, -2.02, 0.1],
    [1.24, -2.1, 0.08],
  ];
  const from = new Vector3();
  const to = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (let k = 0; k < curve.length - 1; k += 1) {
    from.set(curve[k][0], curve[k][1], 0);
    to.set(curve[k + 1][0], curve[k + 1][1], 0);
    const long = from.distanceTo(to);
    const piece = new Mesh(new CylinderGeometry(curve[k][2], curve[k + 1][2], long * 1.15, 9), coat);
    piece.position.copy(from).add(to).multiplyScalar(0.5);
    piece.quaternion.setFromUnitVectors(up, from.clone().sub(to).normalize());
    head.add(piece);
  }
  if (kind !== 'calf') {
    for (const side of [-1, 1]) {
      const reach = kind === 'bull' ? 1.25 : 1.05;
      const tusk = new Mesh(new TorusGeometry(reach, 0.075, 8, 18, 2.3), ivory);
      // From the mouth down and forward, then up; the two splay out and their points turn in.
      tusk.rotation.set(side * 0.32, side * 0.18, -2.55);
      tusk.position.set(0.8 + 0.83 * reach, -0.35 + 0.56 * reach, side * 0.3);
      head.add(tusk);
    }
  }
  frame.add(head);
  mergeByMaterial(head);
  const legs: Mesh[] = [];
  const leg = new CylinderGeometry(0.3, 0.35, 1.75, 10);
  leg.translate(0, -0.875, 0);
  for (const [x, z] of [[0.75, 0.45], [0.75, -0.45], [-1.05, 0.45], [-1.05, -0.45]] as const) {
    const mesh = new Mesh(leg, coat);
    mesh.position.set(x, 1.75, z);
    frame.add(mesh);
    legs.push(mesh);
  }
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { model: null, group, head, legs, kind, size, phase: seed * 1.7, walking: 0 };
}

/** One frame of a mammoth: it breathes and sways its head; walking (0..1), its legs swing and it rolls a little. */
export function stirMammoth(m: Mammoth, delta: number, walking: number): void {
  m.walking += (walking - m.walking) * Math.min(1, delta * 3);
  m.phase += delta * (1 + 2.2 * m.walking);
  const t = m.phase;
  if (m.model != null) {
    // One piece: it breathes, shifts its weight from side to side, and rolls a little as it walks.
    m.model.scale.y = m.size * (1 + 0.007 * Math.sin(t * 1.1));
    m.model.rotation.z = 0.012 * Math.sin(t * 0.5) + 0.025 * m.walking * Math.sin(t * 2);
    m.group.position.y = 0.04 * m.size * m.walking * Math.abs(Math.sin(t * 2));
    return;
  }
  m.head.rotation.z = 0.05 * Math.sin(t * 0.6) - 0.06 * m.walking * Math.sin(t * 2);
  m.head.rotation.y = 0.12 * Math.sin(t * 0.37 + 1);
  const swing = 0.3 * m.walking;
  m.legs[0].rotation.z = swing * Math.sin(t * 2);
  m.legs[1].rotation.z = -swing * Math.sin(t * 2);
  m.legs[2].rotation.z = -swing * Math.sin(t * 2);
  m.legs[3].rotation.z = swing * Math.sin(t * 2);
  m.group.position.y = 0.03 * m.size * m.walking * Math.abs(Math.sin(t * 2));
}

export interface Wolf {
  group: Group;
  eyes: Mesh;
}

export interface Pack {
  /** The pack's two draws (bodies, eyes), to be added to the scene. */
  meshes: InstancedMesh[];
  /** Every frame, once the wolves have been placed: copy where each stands. */
  update(): void;
}

const packM = new Matrix4();
const packInverse = new Matrix4();
const nowhere = new Matrix4().makeScale(0, 0, 0);

/**
 * The file's wolves drawn as one pack: every body in one draw and every pair
 * of eyes in another, instead of two draws a wolf. The wolves themselves stay
 * as they are (moved, turned, their eyes read and scaled by the scene) but
 * are no longer drawn. Null for wolves built in code.
 */
export function packWolves(wolves: readonly Wolf[]): Pack | null {
  const first = wolves[0]?.group.children[0] as Mesh | undefined;
  if (first == null || first.isMesh !== true || wolves.some((w) => w.group.children.length !== 2)) return null;
  const bodies = new InstancedMesh(first.geometry, first.material, wolves.length);
  bodies.name = 'WolfPack';
  const eyes = new InstancedMesh(wolves[0].eyes.geometry, wolves[0].eyes.material, wolves.length);
  eyes.name = 'WolfPackEyes';
  for (const mesh of [bodies, eyes]) {
    mesh.frustumCulled = false;
    mesh.pointerEvents = 'none';
  }
  for (const wolf of wolves) for (const part of wolf.group.children) part.visible = false;
  return {
    meshes: [bodies, eyes],
    update(): void {
      bodies.updateWorldMatrix(true, false);
      packInverse.copy(bodies.matrixWorld).invert();
      for (let i = 0; i < wolves.length; i += 1) {
        const wolf = wolves[i];
        wolf.group.updateWorldMatrix(true, true);
        const shown = wolf.group.visible;
        bodies.setMatrixAt(i, shown ? packM.multiplyMatrices(packInverse, wolf.group.children[0].matrixWorld) : nowhere);
        eyes.setMatrixAt(i, shown ? packM.multiplyMatrices(packInverse, wolf.eyes.matrixWorld) : nowhere);
      }
      bodies.instanceMatrix.needsUpdate = true;
      eyes.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A wolf, as the keeper sees it: a low dark shape and two eyes that catch the lantern. It faces its own +z. */
export function buildWolf(model: Mesh | null = null): Wolf {
  const group = new Group();
  group.name = 'Wolf';
  if (model != null) {
    // The file's wolf (one mesh for all of them), turned to face +z, and the two eyes that catch the light.
    const body = new Mesh(model.geometry, model.material);
    body.rotation.y = headEnd(model) > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(body);
    const lit = new MeshBasicMaterial({ color: 0xffe9a0, toneMapped: false, fog: false });
    const pair = new Group();
    for (const side of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.016, 8, 6), lit);
      eye.position.set(side * 0.04, 0, 0);
      pair.add(eye);
    }
    mergeByMaterial(pair);
    const eyes = pair.children[0] as Mesh;
    eyes.removeFromParent();
    eyes.position.set(0, 0.66, 0.6);
    eyes.name = 'WolfEyes';
    group.add(eyes);
    group.traverse((o) => {
      o.pointerEvents = 'none';
    });
    return { group, eyes };
  }
  const dark = new MeshStandardMaterial({ color: 0x0e1016, roughness: 1 });
  const shape = new Group();
  const trunk = new Mesh(new CapsuleGeometry(0.17, 0.6, 4, 10), dark);
  trunk.rotation.x = Math.PI / 2;
  trunk.position.set(0, 0.58, 0);
  const chest = new Mesh(new SphereGeometry(0.21, 10, 8), dark);
  chest.position.set(0, 0.62, 0.3);
  const skull = new Mesh(new SphereGeometry(0.13, 10, 8), dark);
  skull.position.set(0, 0.74, 0.55);
  const snout = new Mesh(new ConeGeometry(0.07, 0.24, 8), dark);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.7, 0.72);
  const tail = new Mesh(new ConeGeometry(0.07, 0.5, 6), dark);
  tail.rotation.x = -2.2;
  tail.position.set(0, 0.45, -0.55);
  shape.add(trunk, chest, skull, snout, tail);
  for (const side of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.04, 0.11, 5), dark);
    ear.position.set(side * 0.07, 0.88, 0.5);
    shape.add(ear);
    for (const z of [0.28, -0.28]) {
      const leg = new Mesh(new CylinderGeometry(0.035, 0.028, 0.5, 6), dark);
      leg.position.set(side * 0.1, 0.25, z);
      shape.add(leg);
    }
  }
  group.add(shape);
  mergeByMaterial(shape);
  // Both eyes as one draw: they are what is seen from the ridge, so they are not fogged, and the scene grows them with distance.
  const eyes = new Group();
  const lit = new MeshBasicMaterial({ color: 0xffe9a0, toneMapped: false, fog: false });
  for (const side of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.02, 8, 6), lit);
    eye.position.set(side * 0.05, 0, 0);
    eyes.add(eye);
  }
  mergeByMaterial(eyes);
  const pair = eyes.children[0] as Mesh;
  pair.removeFromParent();
  pair.position.set(0, 0.77, 0.66);
  pair.name = 'WolfEyes';
  group.add(pair);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { group, eyes: pair };
}

export interface Elder {
  group: Group;
  torch: PointLight;
  flame: Mesh;
  /** Where the elder's line is shown. */
  head: Vector3;
}

/** The herd's elder: a figure in a hooded pelt, a torch held up. */
export function buildElder(): Elder {
  const group = new Group();
  group.name = 'Elder';
  const pelt = new MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  const skin = new MeshStandardMaterial({ color: 0x9a6f52, roughness: 0.8 });
  const wood = new MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
  const cloak = new Mesh(new ConeGeometry(0.42, 1.45, 12), pelt);
  cloak.position.y = 0.73;
  const shoulders = new Mesh(new SphereGeometry(0.27, 12, 8), pelt);
  shoulders.scale.set(1.25, 0.7, 0.9);
  shoulders.position.y = 1.36;
  const hood = new Mesh(new SphereGeometry(0.17, 12, 10), pelt);
  hood.position.set(0, 1.62, -0.02);
  const face = new Mesh(new SphereGeometry(0.115, 12, 10), skin);
  face.position.set(0, 1.6, 0.07);
  const arm = new Mesh(new CylinderGeometry(0.06, 0.05, 0.6, 8), pelt);
  arm.position.set(0.3, 1.45, 0.12);
  arm.rotation.z = -0.9;
  const staff = new Mesh(new CylinderGeometry(0.018, 0.022, 1.3, 6), wood);
  staff.position.set(0.52, 1.6, 0.14);
  const body = new Group();
  body.add(cloak, shoulders, hood, face, arm, staff);
  mergeByMaterial(body);
  group.add(body);
  const flame = new Mesh(new PlaneGeometry(0.32, 0.6), new MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide, toneMapped: false }));
  flame.position.set(0.52, 2.42, 0.14);
  const torch = new PointLight(0xff9a50, 7, 11, 1.5);
  torch.position.set(0.52, 2.4, 0.14);
  group.add(flame, torch);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { group, torch, flame, head: new Vector3(0, 1.75, 0) };
}

export interface Snowfall {
  points: Points;
  update(delta: number, eye: Vector3): void;
}

/** Snow in the air round the keeper: the near layer the eye reads depth from. */
export function buildSnowfall(count: number): Snowfall {
  const places = new Float32Array(count * 3);
  let seed = 77;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const box = { x: 26, y: 9, z: 26 };
  for (let k = 0; k < count; k += 1) places.set([(random() - 0.5) * box.x, random() * box.y, (random() - 0.5) * box.z], k * 3);
  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(places, 3);
  geometry.setAttribute('position', attribute);
  // Each flake a soft round dot (a plain point is a square).
  const flake = document.createElement('canvas');
  flake.width = 32;
  flake.height = 32;
  const fg = flake.getContext('2d');
  if (fg != null) {
    const soft = fg.createRadialGradient(16, 16, 1, 16, 16, 15);
    soft.addColorStop(0, 'rgba(255,255,255,1)');
    soft.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    soft.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = soft;
    fg.fillRect(0, 0, 32, 32);
  }
  const points = new Points(geometry, new PointsMaterial({ color: 0xeaf0ff, map: new CanvasTexture(flake), size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  points.name = 'ValleySnowfall';
  points.frustumCulled = false;
  points.pointerEvents = 'none';
  const centre = new Vector3();
  return {
    points,
    update(delta: number, eye: Vector3): void {
      centre.set(eye.x, 0, eye.z);
      for (let k = 0; k < count; k += 1) {
        let x = places[k * 3] + (0.35 + 0.1 * (k % 5)) * delta;
        let y = places[k * 3 + 1] - (0.45 + 0.08 * (k % 7)) * delta;
        if (y < 0) y += box.y;
        if (x > box.x / 2) x -= box.x;
        places[k * 3] = x;
        places[k * 3 + 1] = y;
      }
      attribute.needsUpdate = true;
      points.position.copy(centre);
    },
  };
}

/** Boulders along the foot of the ridges, snow on their tops. */
export function buildRocks(): Group {
  const rocks = new Group();
  rocks.name = 'ValleyRocks';
  const stone = new MeshStandardMaterial({ color: 0x353a48, roughness: 0.95, flatShading: true });
  const snow = new MeshStandardMaterial({ color: 0xdfe6f6, roughness: 0.95 });
  let seed = 9;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < 22; k += 1) {
    const side = k % 2 === 0 ? -1 : 1;
    const x = -34 + random() * 78;
    const z = side * (11 + random() * 16);
    const big = 0.6 + random() * 1.9;
    const rock = new Mesh(new IcosahedronGeometry(big, 1), stone);
    rock.scale.set(1 + random() * 0.6, 0.6 + random() * 0.4, 1 + random() * 0.5);
    rock.position.set(x, groundAt(x, z) + big * 0.15, z);
    rock.rotation.y = random() * 6;
    const cap = new Mesh(new SphereGeometry(big * 0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), snow);
    cap.scale.copy(rock.scale);
    cap.position.copy(rock.position).setY(rock.position.y + big * rock.scale.y * 0.28);
    cap.rotation.y = rock.rotation.y;
    rocks.add(rock, cap);
  }
  mergeByMaterial(rocks);
  rocks.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return rocks;
}

/** The holes a stage offers: each a dark mouth in the snow, the earth thrown out beside it, and a marker twig with a pale rag, to be seen from across the ring. */
export function buildHoles(holes: readonly Vector3[]): Group {
  const group = new Group();
  group.name = 'StakeHoles';
  const mouth = new MeshBasicMaterial({ color: 0x0c0d12 });
  const earth = new MeshStandardMaterial({ color: 0x4a3f38, roughness: 1 });
  const twig = new MeshStandardMaterial({ color: 0x2c241e, roughness: 0.9 });
  const rag = new MeshStandardMaterial({ color: 0xd9a05a, roughness: 0.9, side: DoubleSide, emissive: 0xd98a3a, emissiveIntensity: 0.7 });
  for (const hole of holes) {
    const out = Math.hypot(hole.x, hole.z) || 1;
    const dark = new Mesh(new CircleGeometry(0.075, 12), mouth);
    dark.rotation.x = -Math.PI / 2;
    dark.position.copy(hole).setY(hole.y + 0.012);
    const heap = new Mesh(new SphereGeometry(1, 10, 6), earth);
    heap.scale.set(0.2, 0.06, 0.16);
    // Thrown toward the middle of the ring, away from the keeper's seat.
    heap.position.set(hole.x - (hole.z / out) * 0.3, hole.y + 0.02, hole.z + (hole.x / out) * 0.3);
    const stick = new Mesh(new CylinderGeometry(0.009, 0.012, 0.9, 5), twig);
    // On the ring's inner side, past the stake from the keeper's seat (beside the seat its rag filled the corner of the view).
    stick.position.set(hole.x - (hole.x / out) * 0.75, hole.y + 0.24, hole.z - (hole.z / out) * 0.75);
    stick.rotation.z = 0.12;
    const flag = new Mesh(new PlaneGeometry(0.15, 0.1), rag);
    flag.position.copy(stick.position).setY(hole.y + 0.44);
    flag.position.x += 0.08;
    group.add(dark, heap, stick, flag);
  }
  mergeByMaterial(group);
  group.traverse((o: Object3D) => {
    o.pointerEvents = 'none';
  });
  return group;
}

export interface Standard {
  group: Group;
  /** The word's feather at the top: what the memory is played for. */
  feather: Group;
  /** Three lanterns under it, one per stage; a stage won lights its own. */
  light(count: number): void;
}

/**
 * The herd's standard, planted in the middle of it: a tall pole seen over
 * the mammoths' backs from every seat. At its top hangs the word's feather,
 * lit from the first second (where the memory ends); under it three
 * lanterns, dark until their stage is won.
 */
export function buildStandard(colour: number, timber: Material | null = null): Standard {
  const group = new Group();
  group.name = 'HerdStandard';
  // A trimmed trunk with its bark on, where the file's bark is to hand.
  const wood = timber ?? new MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
  const pole = new Mesh(new CylinderGeometry(0.045, 0.07, 4.4, 9), wood);
  pole.position.y = 2.2;
  const bar = new Mesh(new CylinderGeometry(0.02, 0.02, 1.5, 6), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 3.55;
  // The pole and its bar are one draw.
  const timberOf = new Group();
  timberOf.add(pole, bar);
  mergeByMaterial(timberOf);
  group.add(timberOf);
  const dark = new Color(0x6a4a22);
  const lit = new Color(0xffc070);
  // The three lanterns are one draw, each with its own colour.
  const glasses = new InstancedMesh(new SphereGeometry(0.11, 12, 8), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), 3);
  glasses.name = 'StandardLanterns';
  glasses.frustumCulled = false;
  const at = new Matrix4();
  const halos: Mesh[] = [];
  const haze = new MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  for (let k = 0; k < 3; k += 1) {
    glasses.setMatrixAt(k, at.makeTranslation((k - 1) * 0.62, 3.36, 0));
    glasses.setColorAt(k, dark);
    const halo = new Mesh(new SphereGeometry(0.17, 12, 8), haze);
    halo.position.set((k - 1) * 0.62, 3.36, 0);
    halo.visible = false;
    group.add(halo);
    halos.push(halo);
  }
  group.add(glasses);
  // The feather: large enough to be read from the far seats, glowing in its own colour.
  const feather = new Group();
  feather.name = 'WordFeather';
  const leaf = featherMesh(colour, 1.1, 0.32);
  const material = leaf.material as MeshStandardMaterial;
  material.emissive = new Color(colour);
  material.emissiveIntensity = 1.6;
  material.fog = false;
  leaf.position.set(0, 0, 0);
  leaf.rotation.set(0, 0, Math.PI / 2 - 0.25);
  const glow = new Mesh(new SphereGeometry(0.42, 14, 10), new MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  glow.name = 'FeatherGlow';
  feather.add(leaf, glow);
  feather.position.set(0, 4.75, 0);
  group.add(feather);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return {
    group,
    feather,
    light(count: number): void {
      halos.forEach((halo, k) => {
        glasses.setColorAt(k, k < count ? lit : dark);
        halo.visible = k < count;
      });
      if (glasses.instanceColor != null) glasses.instanceColor.needsUpdate = true;
    },
  };
}

export interface Shadows {
  mesh: InstancedMesh;
  /** Lay shadow `i` on the ground at a place, `wide` across. */
  lay(i: number, x: number, y: number, z: number, wide: number): void;
  done(count: number): void;
}

/** The dark, soft patch under everything that stands on the snow: one draw for all of them. */
export function buildShadows(most: number): Shadows {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, 'rgba(3,5,16,0.86)');
    r.addColorStop(0.55, 'rgba(3,5,16,0.55)');
    r.addColorStop(1, 'rgba(6,10,26,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  const disc = new PlaneGeometry(1, 1);
  disc.rotateX(-Math.PI / 2);
  const mesh = new InstancedMesh(disc, new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), most);
  mesh.name = 'ContactShadows';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.pointerEvents = 'none';
  const m = new Matrix4();
  return {
    mesh,
    lay(i: number, x: number, y: number, z: number, wide: number): void {
      m.makeScale(wide, 1, wide);
      m.setPosition(x, y + 0.02, z);
      mesh.setMatrixAt(i, m);
    },
    done(count: number): void {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Which end of an animal's mesh (it lies along its own x) the head is at: the taller end (a mammoth's dome, a wolf's ears). */
function headEnd(model: Object3D): 1 | -1 {
  let mesh: Mesh | null = null;
  model.traverse((o) => {
    if (mesh == null && (o as Mesh).isMesh === true) mesh = o as Mesh;
  });
  const at = (mesh as Mesh | null)?.geometry.getAttribute('position');
  if (at == null) return 1;
  let far = 0;
  for (let i = 0; i < at.count; i += 1) far = Math.max(far, Math.abs(at.getX(i)));
  let front = -Infinity;
  let back = -Infinity;
  for (let i = 0; i < at.count; i += 1) {
    const x = at.getX(i);
    if (x > far * 0.45) front = Math.max(front, at.getY(i));
    else if (x < -far * 0.45) back = Math.max(back, at.getY(i));
  }
  return front >= back ? 1 : -1;
}

/** What the valley's own file gives the game. */
export interface ValleyModels {
  /** Six mammoths (the last one the calf), each its own node. */
  mammoths: Object3D[];
  wolf: Mesh | null;
  /** A stake with its bark on: top at the origin, running down. */
  stake: { geometry: BufferGeometry; material: Material } | null;
  wood: Material | null;
  /** The mallet's two parts (its head a short log with the bark on, its handle split wood), for the two-handled rammer. */
  mallet: { head: Mesh; handle: Mesh } | null;
  /** The small fire's embers and ash, to be set by the elder. */
  fire: Object3D[];
}

/** The herd's middle in the file, north of its origin (m): the game plays round its own origin, so the file is slid south by this. */
const HERD_NORTH = 8.5;

/**
 * Take over the valley's file (art/v2/buzul: real mammoths and wolves, bark
 * stakes, a snow floor with dry grass, rocks, glacier walls): slid so the
 * herd's middle is the game's origin, the floor made level where the game
 * is played (the file's floor rolls by a few decimetres, and every stake
 * hole here is at y 0), the piles the game does not use put away. Returns
 * null if the file is not what was expected (the scene then builds its own
 * world in code).
 */
export function adoptValleyFile(root: Object3D): ValleyModels | null {
  const floor = root.getObjectByName('buzul_tundra_snow') as Mesh | undefined;
  const first = root.getObjectByName('mammoth_1');
  if (floor == null || floor.isMesh !== true || first == null) return null;
  for (const child of root.children) child.position.z += HERD_NORTH;
  root.updateMatrixWorld(true);
  // Level the floor out to 30 m, easing back to the file's own shape by 44 m; remember what was taken off, for the grass.
  const lift = new Map<string, number>();
  const taken = (x: number, z: number): number => {
    const cx = Math.round(x / 2);
    const cz = Math.round(z / 2);
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const y = lift.get(`${cx + dx},${cz + dz}`);
      if (y != null) return y;
    }
    return 0;
  };
  const place = new Vector3();
  const settle = (mesh: Mesh, remember: boolean): void => {
    const at = mesh.geometry.getAttribute('position');
    for (let i = 0; i < at.count; i += 1) {
      place.set(at.getX(i), at.getY(i), at.getZ(i)).applyMatrix4(mesh.matrixWorld);
      const r = Math.hypot(place.x, place.z);
      if (r > 46) continue;
      const k = 1 - smooth(30, 44, r);
      if (remember) {
        lift.set(`${Math.round(place.x / 2)},${Math.round(place.z / 2)}`, place.y);
        at.setY(i, at.getY(i) - place.y * k);
      } else at.setY(i, at.getY(i) - taken(place.x, place.z) * k);
    }
    at.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  };
  settle(floor, true);
  floor.geometry.computeVertexNormals();
  relaySnow(floor);
  const grass = root.getObjectByName('buzul_dry_tundra_grass') as Mesh | undefined;
  if (grass != null && grass.isMesh === true) settle(grass, false);
  // The glacier's ice is modelled for daylight: at dusk it is a dim blue wall, not a lit one.
  const ice = root.getObjectByName('buzul_glacier_ice') as Mesh | undefined;
  if (ice != null && ice.isMesh === true && !Array.isArray(ice.material)) {
    const frozen = ice.material as MeshStandardMaterial;
    frozen.color.multiplyScalar(0.42);
    if (frozen.emissive != null) frozen.emissive.multiplyScalar(0.2);
  }
  let stake: ValleyModels['stake'] = null;
  let wood: Material | null = null;
  let wolf: Mesh | null = null;
  let malletHead: Mesh | null = null;
  let malletHandle: Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as Mesh;
    const name = o.name;
    if (name.startsWith('stake_') || name.startsWith('plank_') || name === 'mallet' || name.startsWith('wolf_')) o.visible = false;
    if (mesh.isMesh !== true || Array.isArray(mesh.material)) return;
    if (wood == null && mesh.material.name === 'split_wood') wood = mesh.material;
    if (stake == null && mesh.material.name === 'stake_bark' && (o.parent?.name ?? '').startsWith('stake_')) {
      // The file's stake lies along +x from its blunt end, 15 cm through: stood point down, and slimmed to go inside the driver.
      const geometry = mesh.geometry.clone();
      geometry.scale(1, 0.58, 0.58);
      geometry.rotateZ(-Math.PI / 2);
      stake = { geometry, material: mesh.material };
    }
    if (wolf == null && name === 'wolf_1') wolf = mesh;
    if (o.parent?.name === 'mallet') {
      if (mesh.material.name === 'stake_bark') malletHead = mesh;
      else malletHandle = mesh;
    }
  });
  const mammoths: Object3D[] = [];
  for (let k = 1; k <= 6; k += 1) {
    const node = root.getObjectByName(`mammoth_${k}`);
    if (node != null) mammoths.push(node);
  }
  if (mammoths.length < 6) return null;
  const ash = root.getObjectByName('buzul_fire_ash');
  if (ash != null) ash.visible = false;
  const fire = ['campfire_embers'].map((name) => root.getObjectByName(name)).filter((o): o is Object3D => o != null);
  level = true;
  const mallet = malletHead != null && malletHandle != null ? { head: malletHead as Mesh, handle: malletHandle as Mesh } : null;
  return { mammoths, wolf, stake, wood, mallet, fire };
}

/** How finely the snow's texture should lie where the keeper sits (m to a tile): fine enough to be sharp at arm's length. */
const SNOW_TILE = 2;

/**
 * The floor's own texture as the file lays it, measured where the ring is: if a tile covers more ground than SNOW_TILE
 * allows (it then blurs under the keeper's own feet), all its maps are laid that much finer, and filtered for the low
 * angle a seated eye sees the ground at.
 */
function relaySnow(floor: Mesh): void {
  const material = floor.material;
  const uv = floor.geometry.getAttribute('uv');
  const at = floor.geometry.getAttribute('position');
  if (Array.isArray(material) || uv == null || at == null) return;
  const index = floor.geometry.getIndex();
  const a = new Vector3();
  const b = new Vector3();
  let metres = 0;
  let tiles = 0;
  const count = index != null ? index.count : at.count;
  for (let k = 0; k + 1 < count; k += 3) {
    const i = index != null ? index.getX(k) : k;
    const j = index != null ? index.getX(k + 1) : k + 1;
    a.set(at.getX(i), at.getY(i), at.getZ(i)).applyMatrix4(floor.matrixWorld);
    if (Math.hypot(a.x, a.z) > 30) continue;
    b.set(at.getX(j), at.getY(j), at.getZ(j)).applyMatrix4(floor.matrixWorld);
    metres += a.distanceTo(b);
    tiles += Math.hypot(uv.getX(i) - uv.getX(j), uv.getY(i) - uv.getY(j));
  }
  if (metres <= 0 || tiles <= 0) return;
  const snow = material as MeshStandardMaterial;
  const lay = metres / tiles / Math.max(1e-6, snow.map?.repeat.x ?? 1);
  const finer = lay > SNOW_TILE * 1.2 ? lay / SNOW_TILE : 1;
  const done = new Set<unknown>();
  for (const map of [snow.map, snow.normalMap, snow.roughnessMap, snow.metalnessMap, snow.aoMap]) {
    if (map == null || done.has(map)) continue;
    done.add(map);
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    map.repeat.multiplyScalar(finer);
    map.anisotropy = 8;
    map.needsUpdate = true;
  }
  if (import.meta.env.DEV) console.info(`[valley] the snow's texture lay a tile every ${lay.toFixed(1)} m${finer > 1 ? `; laid ${finer.toFixed(1)} times finer (every ${SNOW_TILE} m)` : ' (left as it is)'}`);
}

/** The wolf's mesh in the valley's file, if the file is in (the city's wolves are the same animal). */
export function wolfModel(root: Object3D | null): Mesh | null {
  const mesh = root?.getObjectByName('wolf_1') as Mesh | undefined;
  return mesh != null && mesh.isMesh === true ? mesh : null;
}

/**
 * The keeper's rammer, made of the file's mallet: its head (a short log with
 * the bark on) stood on end over the stake, and a split-wood handle out to
 * each side. In the driver's own frame: the stake's top at the origin, the
 * hands' grips at x -0.25 and +0.25, 0.10 up. `material` (the city's gold)
 * replaces the file's wood.
 */
export function rammerFrom(mallet: { head: Mesh; handle: Mesh }, material: Material | null = null): Group {
  const rammer = new Group();
  rammer.name = 'Rammer';
  // The head: 13 x 14 x 24 cm about (0.6, 0, 0) in the file; stood with its long side up, half as big again.
  const block = mallet.head.geometry.clone();
  block.translate(-0.6, 0, 0);
  block.rotateX(Math.PI / 2);
  block.scale(1.5, 1.45, 1.5);
  block.translate(0, -0.1, 0);
  rammer.add(new Mesh(block, material ?? mallet.head.material));
  // The handle: 55 cm along +x from its end in the file; one out to each side, a little stouter, through the head.
  for (const side of [-1, 1]) {
    const bar = mallet.handle.geometry.clone();
    bar.scale(0.6, 1.25, 1.25);
    if (side < 0) bar.rotateY(Math.PI);
    bar.translate(side * 0.03, 0.1, 0);
    rammer.add(new Mesh(bar, material ?? mallet.handle.material));
  }
  rammer.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return rammer;
}

export interface Torch {
  group: Group;
  light: PointLight;
  flame: Mesh;
}

/** A torch for a hand: a stick with a flame at its top and the light it throws (the stick's foot at the origin). */
export function buildTorch(stick: Material | null, tall = 0.7): Torch {
  const group = new Group();
  group.name = 'Torch';
  const shaft = new Mesh(new CylinderGeometry(0.018, 0.026, tall, 7), stick ?? new MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }));
  shaft.position.y = tall / 2 - 0.15;
  const flame = new Mesh(new PlaneGeometry(0.3, 0.56), new MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide, toneMapped: false }));
  flame.position.y = tall + 0.08;
  const light = new PointLight(0xff9a50, 7, 11, 1.5);
  light.position.y = tall + 0.05;
  group.add(shaft, flame, light);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { group, light, flame };
}

/** The mallet's two parts in the valley's file, if the file is in (the city's gold rammer is the same tool). */
export function malletParts(root: Object3D | null): { head: Mesh; handle: Mesh } | null {
  let head: Mesh | null = null;
  let handle: Mesh | null = null;
  root?.getObjectByName('mallet')?.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh !== true || Array.isArray(mesh.material)) return;
    if (mesh.material.name === 'stake_bark') head = mesh;
    else handle = mesh;
  });
  return head != null && handle != null ? { head, handle } : null;
}

/**
 * The keeper's own things as modelled for the game (art/v2/buzul, bekci.glb):
 * the two-handled post driver, the sledge with its lantern pole, the coil of
 * line. With KEEPER_KIT null (or the file missing) the rammer is made of the
 * valley file's mallet and the sledge of its timber.
 */
export const KEEPER_KIT: string | null = 'v2/buzul/bekci.glb';

export interface KeeperKit {
  driver: Object3D | null;
  sledge: Object3D | null;
  coil: Object3D | null;
}

let kept: KeeperKit | null = null;

/** The post driver once more, for the city's fight: the same model in another material (null until the kit has been loaded). */
export function driverCopy(material: Material): Group | null {
  if (kept?.driver == null) return null;
  const copy = new Group();
  const model = kept.driver.clone(true);
  model.traverse((o) => {
    if ((o as Mesh).isMesh === true) (o as Mesh).material = material;
  });
  copy.add(model);
  return copy;
}

export async function loadKeeperKit(): Promise<KeeperKit | null> {
  if (KEEPER_KIT == null) return null;
  if (kept != null) return kept;
  try {
    const gltf = await AssetManager.loadGLTF(KEEPER_KIT, 'v2_keeper_kit');
    const root = gltf.scene;
    root.traverse((o) => {
      o.pointerEvents = 'none';
    });
    const part = (name: string): Object3D | null => {
      const node = root.getObjectByName(name) ?? null;
      if (node != null) {
        node.removeFromParent();
        node.position.set(0, 0, 0);
      }
      return node;
    };
    // The coil first: it may be modelled as a child of the sledge.
    const coil = part('line_coil');
    kept = { driver: part('post_driver'), sledge: part('sledge'), coil };
    return kept;
  } catch (error) {
    console.warn('[valley] the keeper kit is not in', error);
    return null;
  }
}

/** A pelt, close to: short hairs lying every way, dark at the roots and pale at the tips (the keeper's coat and leggings). */
export function peltTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#3a281b';
    g.fillRect(0, 0, 128, 128);
    let seed = 97;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 3200; k += 1) {
      const x = random() * 128;
      const y = random() * 128;
      const long = 2.5 + random() * 5;
      const a = Math.PI / 2 + (random() - 0.5) * 2.2;
      const v = random();
      g.strokeStyle = v < 0.45 ? `rgba(24,15,9,${0.35 + random() * 0.4})` : v < 0.85 ? `rgba(120,88,60,${0.3 + random() * 0.35})` : `rgba(206,184,150,${0.25 + random() * 0.3})`;
      g.lineWidth = 0.8 + random() * 1.1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * long, y + Math.sin(a) * long);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/** The small fire's light: warm, low, over the embers (it lights the snow round it and the flanks of the herd). */
export function buildFireLight(): PointLight {
  const light = new PointLight(0xff8a3c, 14, 18, 1.5);
  light.name = 'FireLight';
  return light;
}

/** A fire's flames over its embers: one soft tongue of light, turned to the eye by the scene. */
export function buildFlame(wide: number, tall: number): Mesh {
  const flame = new Mesh(new PlaneGeometry(wide, tall), new MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide, toneMapped: false }));
  flame.name = 'FireFlame';
  flame.pointerEvents = 'none';
  return flame;
}
