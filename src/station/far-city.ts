import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from '@iwsdk/core';
import { seededRandom } from './geometry.js';
import { PLAZA_Y } from './layout.js';
import { scanned } from './materials.js';

/**
 * The city beyond the live near town, in real 3D: blocks of buildings on a
 * street grid climbing the hill behind the square, a downtown of Art Deco
 * towers with setbacks, slender glass towers further back and to the right,
 * blocks behind the palazzo and past the market street, and on the left the
 * waterfront: the quay wall, two piers with ferries, a breakwater and a
 * harbour light, with real sea out to the haze.
 *
 * Seen from 40 m to a kilometre, the buildings are boxes whose faces carry
 * window textures drawn once at start-up on canvases (brick, stucco with
 * shutters, Deco stone with piers and spandrels, a glass curtain wall, a
 * modern concrete grid); one mesh per material, so the whole city costs a
 * handful of draw calls and some 30,000 triangles. Only the sky and the
 * far mountains stay painted (ombrisa_sky, which follows the viewer).
 */

export const SEA_Y = PLAZA_Y - 1.4;
/** The coastline runs along x = COAST; the sea is to the west of it. */
const COAST = -29;

/** The live near town (town.ts, palazzo.ts) and its margin: no far buildings inside. */
const NEAR = { x0: -31, x1: 44, z0: -50, z1: 20 } as const;

type Style = 'brick' | 'stucco' | 'deco' | 'glass' | 'modern';

/** Bay width and storey height of each facade texture, and how many of each one canvas holds. */
const TILE: Record<Style, { bay: number; storey: number }> = {
  brick: { bay: 3.0, storey: 3.1 },
  stucco: { bay: 3.2, storey: 3.2 },
  deco: { bay: 2.6, storey: 3.6 },
  glass: { bay: 1.6, storey: 3.9 },
  modern: { bay: 2.8, storey: 3.4 },
};
const CELLS = 8;

/** Ground height of the land: flat by the square, rising up the hill behind it and a little to the east. */
export function groundY(x: number, z: number): number {
  const rise = 30 * smoothstep(-60, -520, z) + 6 * smoothstep(150, 700, x);
  const roll = (Math.sin(x * 0.011) + Math.sin(z * 0.017 + 1.3)) * 0.9 * smoothstep(-60, -200, z);
  return PLAZA_Y - 0.45 + rise + roll;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// --- geometry ---------------------------------------------------------------

/** Triangles with explicit UVs and vertex colours, for one material. */
class Batch {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];
  private tint = new Color();

  color(hex: number, shade = 1): this {
    this.tint.setHex(hex);
    if (shade !== 1) this.tint.multiplyScalar(shade);
    return this;
  }

  get triangles(): number {
    return this.positions.length / 9;
  }

  /** A quad a-b-c-d facing n, with UVs per corner. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[]): void {
    this.tri(a, b, c, n, uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]);
    this.tri(a, c, d, n, uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]);
  }

  private tri(a: number[], b: number[], c: number[], n: number[], ua: number, va: number, ub: number, vb: number, uc: number, vc: number): void {
    // Wind so the face looks along n.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const order: Array<[number[], number, number]> = flip ? [[a, ua, va], [c, uc, vc], [b, ub, vb]] : [[a, ua, va], [b, ub, vb], [c, uc, vc]];
    for (const [p, u, v] of order) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(u, v);
      this.colors.push(this.tint.r, this.tint.g, this.tint.b);
    }
  }

  mesh(material: Material, name: string): Mesh {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    g.computeBoundingSphere();
    const m = new Mesh(g, material);
    m.name = name;
    return m;
  }
}

/**
 * An upright box from (x0, z0)-(x1, z1), y0 to y1: four walls with facade
 * UVs counted in the style's bays and storeys from the building's base,
 * and its roof in the roof batch.
 */
function volume(walls: Batch, roof: Batch, style: Style, x0: number, z0: number, x1: number, z1: number, base: number, y0: number, y1: number, tint: number, roofTint: number): void {
  const t = TILE[style];
  const tw = t.bay * CELLS;
  const th = t.storey * CELLS;
  const v0 = (y0 - base) / th;
  const v1 = (y1 - base) / th;
  walls.color(tint);
  const face = (ax: number, az: number, bx: number, bz: number, n: number[], start: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = start / tw;
    const u1 = (start + len) / tw;
    walls.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], n, [u0, v0, u1, v0, u1, v1, u0, v1]);
  };
  // Start each face's windows at a building corner; neighbours' offsets vary with position.
  const s = Math.abs(x0 * 0.37 + z0 * 0.53) % 1 * t.bay;
  face(x0, z1, x1, z1, [0, 0, 1], s);
  face(x1, z0, x0, z0, [0, 0, -1], s);
  face(x1, z1, x1, z0, [1, 0, 0], s);
  face(x0, z0, x0, z1, [-1, 0, 0], s);
  roof.color(roofTint);
  roof.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0]);
}

/** An upright n-sided prism (water tanks, the light, funnels), flat-coloured in the given batch. */
function cylinder(b: Batch, x: number, z: number, y0: number, y1: number, r0: number, r1: number, sides: number, tint: number, cap = true): void {
  b.color(tint);
  for (let k = 0; k < sides; k += 1) {
    const a0 = (k / sides) * Math.PI * 2;
    const a1 = ((k + 1) / sides) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const n = [Math.cos(am), 0, Math.sin(am)];
    b.quad(
      [x + r0 * Math.cos(a0), y0, z + r0 * Math.sin(a0)],
      [x + r0 * Math.cos(a1), y0, z + r0 * Math.sin(a1)],
      [x + r1 * Math.cos(a1), y1, z + r1 * Math.sin(a1)],
      [x + r1 * Math.cos(a0), y1, z + r1 * Math.sin(a0)],
      n,
      [0, 0, 0, 0, 0, 0, 0, 0],
    );
    if (cap && r1 > 0.01) {
      b.quad([x, y1, z], [x, y1, z], [x + r1 * Math.cos(a1), y1, z + r1 * Math.sin(a1)], [x + r1 * Math.cos(a0), y1, z + r1 * Math.sin(a0)], [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0]);
    }
  }
}

/** A plain box in a batch (piers, hulls, decks, quay walls). */
function slab(b: Batch, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tint: number): void {
  b.color(tint);
  const zero = [0, 0, 0, 0, 0, 0, 0, 0];
  b.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], zero);
  b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], zero);
  b.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], zero);
  b.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], zero);
  b.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], zero);
}

// --- facade textures --------------------------------------------------------

/** Draws one style's facade on a canvas: CELLS bays by CELLS storeys, every window a little different. */
/**
 * A facade style's daytime texture and its evening light: a black canvas
 * with about half the windows (and office floors) lit warm, used as the
 * emissive map. The lights draw from their own random stream, so the
 * daytime facades stay as they were.
 */
function facadeTexture(style: Style, random: () => number): { map: Texture; lit: Texture } {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const litCanvas = document.createElement('canvas');
  litCanvas.width = size;
  litCanvas.height = size;
  const lc = litCanvas.getContext('2d') as CanvasRenderingContext2D;
  lc.fillStyle = '#000';
  lc.fillRect(0, 0, size, size);
  const glow = seededRandom(STYLE_SEEDS[style]);
  const light = (x: number, y: number, w: number, h: number, chance: number) => {
    if (glow() > chance) return;
    const warm = glow();
    lc.fillStyle = warm < 0.7 ? `rgb(255,${190 + Math.floor(glow() * 40)},${110 + Math.floor(glow() * 50)})` : 'rgb(235,240,255)';
    lc.fillRect(x, y, w, h);
  };
  const cw = size / CELLS;
  const ch = size / CELLS;
  const wall: Record<Style, string> = {
    brick: '#8f5443',
    stucco: '#ece3d4',
    deco: '#e6dccb',
    glass: '#4f6170',
    modern: '#d6d0c5',
  };
  g.fillStyle = wall[style];
  g.fillRect(0, 0, size, size);
  // Weathering: faint speckle and, for brick, mortar courses.
  for (let k = 0; k < 900; k += 1) {
    g.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + random() * 0.05})`;
    g.fillRect(random() * size, random() * size, 2 + random() * 6, 1 + random() * 3);
  }
  if (style === 'brick') {
    g.fillStyle = 'rgba(220,210,195,0.18)';
    for (let y = 0; y < size; y += 4) g.fillRect(0, y, size, 1);
  }
  const glass = () => {
    const shade = 22 + Math.floor(random() * 26);
    const blue = shade + 8 + Math.floor(random() * 10);
    return `rgb(${shade},${shade + 6},${blue})`;
  };
  for (let row = 0; row < CELLS; row += 1) {
    for (let col = 0; col < CELLS; col += 1) {
      const x = col * cw;
      // Canvas y runs down; storey 0 is at the bottom of the texture (v = 0).
      const y = size - (row + 1) * ch;
      if (style === 'glass') {
        const top = 90 + Math.floor(random() * 40);
        const grad = g.createLinearGradient(0, y, 0, y + ch);
        grad.addColorStop(0, `rgb(${top - 20},${top},${top + 18})`);
        grad.addColorStop(1, `rgb(${top - 55},${top - 40},${top - 25})`);
        g.fillStyle = grad;
        g.fillRect(x + 1, y + 1, cw - 2, ch * 0.78);
        light(x + 1, y + 1, cw - 2, ch * 0.78, 0.45);
        g.fillStyle = '#38434b';
        g.fillRect(x, y + ch * 0.78, cw, ch * 0.22);
        g.fillStyle = '#a9b2b6';
        g.fillRect(x, y, 2, ch);
        g.fillRect(x, y + ch * 0.78, cw, 2);
        continue;
      }
      if (style === 'deco') {
        // A light pier, then a tall window over a dark spandrel.
        g.fillStyle = '#f1e9da';
        g.fillRect(x, y, cw * 0.24, ch);
        g.fillStyle = glass();
        g.fillRect(x + cw * 0.32, y + ch * 0.1, cw * 0.6, ch * 0.66);
        light(x + cw * 0.32, y + ch * 0.1, cw * 0.6, ch * 0.66, 0.5);
        g.fillStyle = '#4c534d';
        g.fillRect(x + cw * 0.32, y + ch * 0.76, cw * 0.6, ch * 0.24);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x + cw * 0.61, y + ch * 0.1, 2, ch * 0.66);
        continue;
      }
      const [ww, wh, wy] = style === 'modern' ? [0.7, 0.5, 0.22] : style === 'stucco' ? [0.4, 0.56, 0.18] : [0.46, 0.56, 0.2];
      const wx = x + cw * (1 - ww) / 2;
      const top = y + ch * wy;
      // Frame or reveal, glass, glazing bar, sill.
      g.fillStyle = style === 'brick' ? '#ece6da' : style === 'modern' ? '#9a958c' : '#d9cfbe';
      g.fillRect(wx - 3, top - 3, cw * ww + 6, ch * wh + 6);
      g.fillStyle = glass();
      g.fillRect(wx, top, cw * ww, ch * wh);
      light(wx, top, cw * ww, ch * wh, 0.55);
      if (random() < 0.25) {
        g.fillStyle = random() < 0.5 ? '#cfc6b5' : '#8e8576';
        g.fillRect(wx, top, cw * ww, ch * wh * (0.2 + random() * 0.4));
      }
      g.fillStyle = style === 'modern' ? '#bdb7ad' : '#efe9de';
      g.fillRect(wx + cw * ww / 2 - 1, top, 2, ch * wh);
      g.fillRect(wx - 5, top + ch * wh + 2, cw * ww + 10, 4);
      if (style === 'brick') {
        g.fillStyle = '#e2d8c6';
        g.fillRect(wx - 5, top - 9, cw * ww + 10, 6);
      }
      if (style === 'stucco') {
        // Louvred shutters, open, half open or shut.
        const roll = random();
        g.fillStyle = ['#4f5d47', '#5e4636', '#3f5a6b', '#6b6a4a'][Math.floor(random() * 4)];
        const sw = cw * ww * 0.5;
        if (roll < 0.6) {
          g.fillRect(wx - sw - 3, top, sw, ch * wh);
          g.fillRect(wx + cw * ww + 3, top, sw, ch * wh);
        } else if (roll < 0.85) {
          g.fillRect(wx, top, cw * ww, ch * wh);
          lc.fillStyle = '#000';
          lc.fillRect(wx, top, cw * ww, ch * wh);
        }
      }
      if (style === 'modern') {
        g.fillStyle = '#c4beb3';
        g.fillRect(x, y + ch * 0.86, cw, ch * 0.07);
      }
    }
  }
  const wrap = (source: HTMLCanvasElement): Texture => {
    const texture = new CanvasTexture(source);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  };
  return { map: wrap(canvas), lit: wrap(litCanvas) };
}

const STYLE_SEEDS: Record<Style, number> = { brick: 101, stucco: 103, deco: 107, glass: 109, modern: 113 };

/** Facade materials whose windows light up in the evening. */
const litFacades: MeshStandardMaterial[] = [];

let farEvening = 0;
/** How brightly the far city's lit windows burn, against a calm week's (0.8 of windows lit nearby). */
let farShare = 1;

/** Lights the far city's windows: 0 by day, 1 at dusk. */
export function setFarEvening(amount: number): void {
  farEvening = amount;
  for (const material of litFacades) material.emissiveIntensity = 1.4 * amount * farShare;
}

/**
 * The far city follows the near town's share of lit windows. Its windows
 * are painted into one texture, so at this distance fewer lights read as
 * a dimmer city.
 */
export function setFarLitShare(share: number): void {
  farShare = share / 0.8;
  setFarEvening(farEvening);
}

/** A tiled wave normal map for the sea, drawn once. */
function waveTexture(random: () => number): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = g.createImageData(size, size);
  const waves = Array.from({ length: 7 }, () => ({
    kx: Math.round((random() - 0.5) * 12),
    ky: Math.round((random() - 0.5) * 12) || 1,
    a: 0.2 + random() * 0.35,
    p: random() * Math.PI * 2,
  }));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const ph = ((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.p;
        dx += w.a * w.kx * Math.cos(ph) * 0.08;
        dy += w.a * w.ky * Math.cos(ph) * 0.08;
      }
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      image.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      image.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

// --- the city ---------------------------------------------------------------

interface Zone {
  /** Storeys, as [min, max]. */
  floors: [number, number];
  styles: readonly Style[];
}

/** What stands where: mid-rise near the square, Deco towers downtown, glass further out. */
function zoneAt(x: number, z: number): 'near' | 'downtown' | 'modern' | 'behind' {
  if (z > NEAR.z1) return 'behind';
  if (x > 70 && z < -120) return 'modern';
  if (z < -100 && x > -26 && x <= 70) return 'downtown';
  return 'near';
}

const ZONES: Record<ReturnType<typeof zoneAt>, Zone> = {
  near: { floors: [5, 9], styles: ['brick', 'brick', 'stucco', 'deco', 'modern'] },
  behind: { floors: [5, 8], styles: ['brick', 'stucco', 'stucco', 'modern'] },
  downtown: { floors: [7, 12], styles: ['brick', 'deco', 'modern', 'stucco'] },
  modern: { floors: [8, 14], styles: ['glass', 'modern', 'glass', 'brick'] },
};

const BRICK_TINTS = [0xffffff, 0xf2dcd0, 0xe8c9b3, 0xffe8dc, 0xd9b8a8];
const STUCCO_TINTS = [0xf6e3c8, 0xf1d2bf, 0xe9dfc6, 0xf7efe0, 0xeec9a8, 0xdfe2d6];
const STONE_TINTS = [0xffffff, 0xf4ece0, 0xe9e1d2];
const GLASS_TINTS = [0xffffff, 0xdfe8f0, 0xe8eef2, 0xd0dce4];
const ROOF_TINTS = [0x5e5a55, 0x6a655e, 0x545049, 0x77716a];

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length) % list.length];
}

function tintFor(style: Style, random: () => number): number {
  if (style === 'brick') return pick(random, BRICK_TINTS);
  if (style === 'stucco') return pick(random, STUCCO_TINTS);
  if (style === 'glass') return pick(random, GLASS_TINTS);
  return pick(random, STONE_TINTS);
}

interface Batches {
  styles: Record<Style, Batch>;
  roof: Batch;
  plain: Batch;
}

/** A building on a lot: a mid-rise block, an Art Deco tower with setbacks, or a glass tower. */
function building(bt: Batches, x0: number, z0: number, x1: number, z1: number, zone: ReturnType<typeof zoneAt>, random: () => number, towerChance: number): void {
  const z = ZONES[zone];
  const base = groundY((x0 + x1) / 2, (z0 + z1) / 2) - 0.6;
  const roofTint = pick(random, ROOF_TINTS);
  const w = x1 - x0;
  const d = z1 - z0;
  if (zone === 'downtown' && random() < towerChance && w > 14 && d > 14) {
    // Art Deco tower: a base block, then three setbacks of shrinking footprint.
    const storeys = 22 + Math.floor(random() * 22);
    const st = TILE.deco.storey;
    const tint = pick(random, STONE_TINTS);
    let y = base;
    const tiers = [0.45, 0.25, 0.18, 0.12];
    let inset = 0;
    tiers.forEach((share, i) => {
      const h = Math.max(2, Math.round(storeys * share)) * st;
      volume(bt.styles.deco, bt.roof, 'deco', x0 + inset, z0 + inset, x1 - inset, z1 - inset, base, y, y + h, tint, roofTint);
      y += h;
      inset += i === 0 ? 2.5 : 2.0;
    });
    return;
  }
  if (zone === 'modern' && random() < towerChance) {
    // A slender glass tower on a stone podium, a plant room on top.
    const storeys = 26 + Math.floor(random() * 30);
    const st = TILE.glass.storey;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const half = Math.min(w, d) * (0.32 + random() * 0.08);
    volume(bt.styles.modern, bt.roof, 'modern', x0, z0, x1, z1, base, base, base + 2 * TILE.modern.storey, pick(random, STONE_TINTS), roofTint);
    const top = base + 2 * TILE.modern.storey + storeys * st;
    volume(bt.styles.glass, bt.roof, 'glass', cx - half, cz - half, cx + half, cz + half, base, base + 2 * TILE.modern.storey, top, pick(random, GLASS_TINTS), roofTint);
    slab(bt.plain, cx - half * 0.6, top, cz - half * 0.6, cx + half * 0.6, top + 4, cz + half * 0.6, 0x8d9196);
    return;
  }
  const style = pick(random, z.styles);
  const floors = z.floors[0] + Math.floor(random() * (z.floors[1] - z.floors[0] + 1));
  const top = base + floors * TILE[style].storey + 0.6;
  volume(bt.styles[style], bt.roof, style, x0, z0, x1, z1, base, base, top, tintFor(style, random), roofTint);
  // A parapet cap, and now and then a water tank (New York) or a plant room.
  slab(bt.plain, x0 - 0.15, top, z0 - 0.15, x1 + 0.15, top + 0.5, z1 + 0.15, style === 'brick' ? 0xd8cfc0 : 0xe6dfd2);
  if (random() < 0.35 && style !== 'glass') {
    const tx = x0 + w * (0.3 + random() * 0.4);
    const tz = z0 + d * (0.3 + random() * 0.4);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) slab(bt.plain, tx + dx * 1.1 - 0.08, top, tz + dz * 1.1 - 0.08, tx + dx * 1.1 + 0.08, top + 2.4, tz + dz * 1.1 + 0.08, 0x3a3734);
    cylinder(bt.plain, tx, tz, top + 2.4, top + 5.4, 1.6, 1.55, 10, 0x8d7a64);
    cylinder(bt.plain, tx, tz, top + 5.4, top + 6.6, 1.65, 0.06, 10, 0x5a4c3e, false);
  } else if (random() < 0.4) {
    slab(bt.plain, x0 + w * 0.3, top, z0 + d * 0.3, x0 + w * 0.6, top + 2.6, z0 + d * 0.6, 0xa7a197);
  }
}

/** A block between streets, built round its edges; its yard stays empty. */
function block(bt: Batches, x0: number, z0: number, x1: number, z1: number, random: () => number): void {
  const zone = zoneAt((x0 + x1) / 2, (z0 + z1) / 2);
  const deep = 13 + random() * 4;
  // Downtown and modern blocks may hold one tall building filling the block.
  if ((zone === 'downtown' && random() < 0.55) || (zone === 'modern' && random() < 0.75)) {
    building(bt, x0, z0, x1, z1, zone, random, 1);
    return;
  }
  const lots = (a: number, b: number, place: (s: number, e: number) => void) => {
    let s = a;
    while (s < b - 4) {
      const e = Math.min(b, s + 7 + random() * 9);
      place(s, b - e < 6 ? b : e);
      s = b - e < 6 ? b : e;
    }
  };
  // Front and back rows run the full width; the sides fill between them.
  lots(x0, x1, (s, e) => building(bt, s, z1 - deep, e, z1, zone, random, 0));
  lots(x0, x1, (s, e) => building(bt, s, z0, e, z0 + deep, zone, random, 0));
  lots(z0 + deep, z1 - deep, (s, e) => building(bt, x0, s, x0 + deep, e, zone, random, 0));
  lots(z0 + deep, z1 - deep, (s, e) => building(bt, x1 - deep, s, x1, e, zone, random, 0));
}

function insideNear(x0: number, z0: number, x1: number, z1: number): boolean {
  return x1 > NEAR.x0 && x0 < NEAR.x1 && z1 > NEAR.z0 && z0 < NEAR.z1;
}

/** The ground: a grid over the land east of the coast, a quay wall along the coast, the sea west of it. */
function ground(plain: Batch, land: Batch, sea: Batch): void {
  const step = 25;
  const [gx0, gx1, gz0, gz1] = [COAST, 1500, -1500, 1500];
  for (let x = gx0; x < gx1; x += step) {
    for (let z = gz0; z < gz1; z += step) {
      const xa = x;
      const xb = Math.min(gx1, x + step);
      const za = z;
      const zb = Math.min(gz1, z + step);
      const p = (px: number, pz: number) => [px, groundY(px, pz), pz];
      land.color(0xb4aea4);
      land.quad(p(xa, za), p(xb, za), p(xb, zb), p(xa, zb), [0, 1, 0], [xa / 4, -za / 4, xb / 4, -za / 4, xb / 4, -zb / 4, xa / 4, -zb / 4]);
    }
  }
  // The quay wall down to the sea along the coast, outside the live quay.
  for (let z = gz0; z < gz1; z += step) {
    const zb = Math.min(gz1, z + step);
    if (zb > -75 && z < 20) continue;
    plain.color(0xb9b0a1);
    plain.quad([COAST, SEA_Y - 1, zb], [COAST, SEA_Y - 1, z], [COAST, groundY(COAST, z) + 0.6, z], [COAST, groundY(COAST, zb) + 0.6, zb], [-1, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]);
  }
  sea.color(0xffffff);
  sea.quad([-4000, SEA_Y, -4000], [COAST, SEA_Y, -4000], [COAST, SEA_Y, 4000], [-4000, SEA_Y, 4000], [0, 1, 0], [-4000 / 40, 4000 / 40, COAST / 40, 4000 / 40, COAST / 40, -4000 / 40, -4000 / 40, -4000 / 40]);
}

/** Piers with ferries along them, a breakwater with the harbour light at its end, moored boats. */
function harbour(bt: Batches): void {
  const p = bt.plain;
  const deck = PLAZA_Y - 0.5;
  for (const z of [-82, -114]) {
    slab(p, -78, SEA_Y - 2, z - 4, COAST + 0.5, deck, z + 4, 0xc9c1b2);
    for (let x = -76; x < COAST; x += 6) slab(p, x - 0.15, deck, z + 3.7, x + 0.15, deck + 1.0, z + 3.9, 0x2a2c2b);
    ferry(p, -52, z + 9.5, 0);
  }
  ferry(p, -150, -60, 0.6);
  for (const [x, z, h] of [[-40, -66, 0.2], [-44, -98, -0.3], [-62, -132, 0.4], [-36, -132, 0.1]] as const) boat(p, x, z, h);
  // The breakwater curving out from the coast, and the light at its end.
  let x = COAST;
  let z = -150;
  for (let k = 0; k < 14; k += 1) {
    const a = -Math.PI / 2 + (k / 14) * 1.0;
    const nx = x + 7 * Math.cos(a + Math.PI);
    const nz = z + 7 * Math.sin(a + Math.PI) * 0.4 + 2.5;
    slab(p, Math.min(x, nx) - 3, SEA_Y - 2, Math.min(z, nz) - 3, Math.max(x, nx) + 3, PLAZA_Y - 0.9, Math.max(z, nz) + 3, 0x9c968a);
    x = nx;
    z = nz;
  }
  cylinder(p, x, z, PLAZA_Y - 0.9, PLAZA_Y + 14, 2.3, 1.7, 12, 0xf3f1ea);
  cylinder(p, x, z, PLAZA_Y + 14, PLAZA_Y + 14.4, 2.4, 2.4, 12, 0x2a3236);
  cylinder(p, x, z, PLAZA_Y + 14.4, PLAZA_Y + 16.4, 1.2, 1.2, 10, 0xd8d2b8);
  cylinder(p, x, z, PLAZA_Y + 16.4, PLAZA_Y + 17.6, 1.5, 0.1, 10, 0x8a2f2a, false);
}

/** A harbour ferry: dark hull, two white decks with dark windows, a funnel. Heading in radians about y. */
function ferry(p: Batch, x: number, z: number, heading: number): void {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const box = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, tint: number) => {
    // Axis-aligned in the ferry's frame; heading only turns whole boxes about the ferry's centre.
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const rx = x + cx * c - cz * s;
    const rz = z + cx * s + cz * c;
    const hx = (bx - ax) / 2;
    const hz = (bz - az) / 2;
    const ex = Math.abs(hx * c) + Math.abs(hz * s);
    const ez = Math.abs(hx * s) + Math.abs(hz * c);
    slab(p, rx - ex, ay, rz - ez, rx + ex, by, rz + ez, tint);
  };
  box(-16, SEA_Y - 0.6, -4, 16, SEA_Y + 1.4, 4, 0x2b3440);
  box(-14, SEA_Y + 1.4, -3.8, 14, SEA_Y + 3.6, 3.8, 0xf2f0ea);
  box(-11, SEA_Y + 3.6, -3.4, 11, SEA_Y + 5.6, 3.4, 0xf2f0ea);
  box(-13.9, SEA_Y + 2.2, -3.81, 13.9, SEA_Y + 3.0, 3.81, 0x2a3138);
  box(-10.9, SEA_Y + 4.3, -3.41, 10.9, SEA_Y + 5.0, 3.41, 0x2a3138);
  cylinder(p, x, z, SEA_Y + 5.6, SEA_Y + 9.4, 1.1, 1.0, 10, 0xf2f0ea);
  cylinder(p, x, z, SEA_Y + 9.4, SEA_Y + 10.4, 1.0, 1.0, 10, 0x1d1f21);
}

function boat(p: Batch, x: number, z: number, heading: number): void {
  const c = Math.abs(Math.cos(heading));
  const s = Math.abs(Math.sin(heading));
  const hx = 3.2 * c + 1.1 * s;
  const hz = 3.2 * s + 1.1 * c;
  slab(p, x - hx, SEA_Y - 0.3, z - hz, x + hx, SEA_Y + 0.7, z + hz, 0xf4f2ec);
  slab(p, x - hx * 0.4, SEA_Y + 0.7, z - hz * 0.4, x + hx * 0.3, SEA_Y + 1.8, z + hz * 0.4, 0xe2ded4);
}

/** The tram's centre line down the coast road; town.ts lays the track by the square. */
const TRAM_X = -23.1;

/**
 * The coast-road tram track beyond the live quay, in both directions,
 * following the ground in 5 m lengths: rails between granite strips.
 */
function coastTram(p: Batch): void {
  const gauge = 1.435;
  const run = (z0: number, z1: number) => {
    for (let z = z0; z < z1; z += 5) {
      const zb = Math.min(z1, z + 5);
      const y = groundY(TRAM_X, (z + zb) / 2) + 0.02;
      for (const xr of [TRAM_X - gauge / 2, TRAM_X + gauge / 2]) {
        slab(p, xr - 0.28, y - 0.05, z, xr + 0.28, y, zb, 0x9a958d);
        slab(p, xr - 0.035, y, z, xr + 0.035, y + 0.03, zb, 0x77736c);
      }
    }
  };
  run(-330, -75);
  run(20, 140);
}

let water: Texture | null = null;

/** Moves the sea's waves; call every frame with the frame time. Allocates nothing. */
export function animateWater(delta: number): void {
  if (water == null) return;
  water.offset.x = (water.offset.x + delta * 0.004) % 1;
  water.offset.y = (water.offset.y + delta * 0.0025) % 1;
}

/** Builds the far city, the ground, the harbour and the sea. */
export function createFarCity(seed = 31): Group {
  const random = seededRandom(seed);
  const bt: Batches = {
    styles: { brick: new Batch(), stucco: new Batch(), deco: new Batch(), glass: new Batch(), modern: new Batch() },
    roof: new Batch(),
    plain: new Batch(),
  };
  const land = new Batch();
  const sea = new Batch();

  // Blocks on the grid: 24 m blocks between 8 m streets, from the coast road eastward and far behind.
  const pitch = 32;
  for (let x = -18; x < 330; x += pitch) {
    for (let z = -330; z < 140; z += pitch) {
      const [x0, z0, x1, z1] = [x, z, x + 24, z + 24];
      if (insideNear(x0, z0, x1, z1)) continue;
      // Thin out to the haze: further blocks are skipped now and then.
      const far = Math.hypot((x0 + x1) / 2, (z0 + z1) / 2);
      if (far > 260 && random() < 0.25) continue;
      block(bt, x0, z0, x1, z1, random);
    }
  }
  ground(bt.plain, land, sea);
  harbour(bt);
  coastTram(bt.plain);

  const textures: Record<Style, { map: Texture; lit: Texture }> = {
    brick: facadeTexture('brick', random),
    stucco: facadeTexture('stucco', random),
    deco: facadeTexture('deco', random),
    glass: facadeTexture('glass', random),
    modern: facadeTexture('modern', random),
  };
  const group = new Group();
  group.name = 'FarCity';
  let triangles = 0;
  for (const style of Object.keys(bt.styles) as Style[]) {
    const b = bt.styles[style];
    if (b.triangles === 0) continue;
    const material = new MeshStandardMaterial({
      map: textures[style].map,
      emissiveMap: textures[style].lit,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      vertexColors: true,
      roughness: style === 'glass' ? 0.25 : 0.85,
      metalness: style === 'glass' ? 0.35 : 0,
    });
    litFacades.push(material);
    group.add(b.mesh(material, `Far${style[0].toUpperCase()}${style.slice(1)}`));
    triangles += b.triangles;
  }
  group.add(bt.roof.mesh(new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 'FarRoofs'));
  group.add(bt.plain.mesh(new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 'FarPlain'));
  group.add(land.mesh(scanned('concrete_floor_02'), 'FarGround'));
  water = waveTexture(random);
  water.repeat.set(1, 1);
  const seaMaterial = new MeshStandardMaterial({
    color: 0x2f4a58,
    roughness: 0.12,
    metalness: 0.1,
    normalMap: water,
    vertexColors: true,
  });
  seaMaterial.normalScale.set(0.6, 0.6);
  group.add(sea.mesh(seaMaterial, 'FarSea'));
  triangles += bt.roof.triangles + bt.plain.triangles + land.triangles + sea.triangles;
  group.userData.triangles = triangles;
  return group;
}
