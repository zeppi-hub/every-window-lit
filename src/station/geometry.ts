import { BufferAttribute, BufferGeometry, Color, type Material, Mesh } from '@iwsdk/core';

/**
 * Accumulates flat-shaded, vertex-coloured triangles into one geometry, so a
 * whole set (room walls, a town) becomes a single draw call. UVs are planar
 * and world-scaled: each face is projected along its dominant normal axis and
 * one texture repeat spans `metresPerRepeat` metres, so a scanned material
 * keeps its real size on every box.
 */
export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private color = new Color();

  constructor(private metresPerRepeat = 1) {}

  /** Axis-aligned box from its min and max corners. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    hex: number,
    skipBottom = true,
  ): void {
    this.setColor(hex);
    // +Z, -Z, +X, -X, +Y, -Y faces, each as two counter-clockwise triangles.
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    if (!skipBottom) {
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    }
  }

  /** Hip roof: a four-sided pyramid with a short ridge along the longer side. */
  hipRoof(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    baseY: number,
    height: number,
    hex: number,
  ): void {
    this.setColor(hex);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const ridge = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const half = ridge
      ? Math.max(0, (x1 - x0) / 2 - (z1 - z0) / 2)
      : Math.max(0, (z1 - z0) / 2 - (x1 - x0) / 2);
    const topY = baseY + height;
    const ra: V3 = ridge ? [cx - half, topY, cz] : [cx, topY, cz - half];
    const rb: V3 = ridge ? [cx + half, topY, cz] : [cx, topY, cz + half];
    const a: V3 = [x0, baseY, z1];
    const b: V3 = [x1, baseY, z1];
    const c: V3 = [x1, baseY, z0];
    const d: V3 = [x0, baseY, z0];
    if (ridge) {
      this.quadAuto(a, b, rb, ra);
      this.quadAuto(c, d, ra, rb);
      this.tri(b, c, rb);
      this.tri(d, a, ra);
    } else {
      this.quadAuto(b, c, ra, rb);
      this.quadAuto(d, a, rb, ra);
      this.tri(a, b, rb);
      this.tri(c, d, ra);
    }
  }

  /** Horizontal rectangle facing up. */
  plane(x0: number, z0: number, x1: number, z1: number, y: number, hex: number): void {
    this.setColor(hex);
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0]);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.computeBoundingSphere();
    return geometry;
  }

  mesh(material: Material, name: string): Mesh {
    const mesh = new Mesh(this.build(), material);
    mesh.name = name;
    return mesh;
  }

  private setColor(hex: number): void {
    // Vertex colours are linear; Color converts from sRGB hex.
    this.color.setHex(hex);
  }

  private quad(a: V3, b: V3, c: V3, d: V3, n: V3): void {
    this.pushTri(a, b, c, n);
    this.pushTri(a, c, d, n);
  }

  private quadAuto(a: V3, b: V3, c: V3, d: V3): void {
    const n = faceNormal(a, b, c);
    this.pushTri(a, b, c, n);
    this.pushTri(a, c, d, n);
  }

  private tri(a: V3, b: V3, c: V3): void {
    this.pushTri(a, b, c, faceNormal(a, b, c));
  }

  private pushTri(a: V3, b: V3, c: V3, n: V3): void {
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    const scale = 1 / this.metresPerRepeat;
    for (const v of [a, b, c]) {
      this.positions.push(v[0], v[1], v[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      if (ay >= ax && ay >= az) this.uvs.push(v[0] * scale, v[2] * scale);
      else if (ax >= az) this.uvs.push(v[2] * scale, v[1] * scale);
      else this.uvs.push(v[0] * scale, v[1] * scale);
    }
  }
}

type V3 = [number, number, number];

function faceNormal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

/** Small seeded random generator (mulberry32), so the town is identical on every load. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
