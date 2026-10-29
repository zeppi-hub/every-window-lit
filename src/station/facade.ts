import { BufferAttribute, BufferGeometry, Color, type Material, Mesh } from '@iwsdk/core';

/**
 * Building parts for the live near town (town.ts, square.ts).
 *
 * Everything is real geometry, merged into one mesh per material: windows sit
 * in 18 cm reveals behind stucco surrounds, louvred shutters fold back against
 * the wall, balconies stand on stone brackets, eaves overhang a moulded
 * cornice. Faces carry the same world-scale planar UVs as MeshBuilder, so a
 * scanned material keeps its real size on every piece.
 *
 * Parts are authored in a Frame: local x runs along a facade, y up and z out
 * of the wall. One window routine therefore serves the row facing the square
 * (+z) and the market street (-x), and a turned frame hangs an ajar shutter
 * or leans a bicycle against a wall. Closed parts keep the faces that look
 * away from the sun, because three.js draws back faces into the shadow map.
 */

export type V3 = [number, number, number];

// Box faces, named in the box's own frame (+z is the front).
export const FRONT = 1;
export const BACK = 2;
export const LEFT = 4;
export const RIGHT = 8;
export const TOP = 16;
export const BOTTOM = 32;
export const ALL = 63;
/** Details against a wall. */
export const NO_BACK = ALL & ~BACK;
/** Things standing on the ground. */
export const NO_BOTTOM = ALL & ~BOTTOM;
/** Strips sitting on a wall and on something below (bands, plinths). */
export const STRIP = FRONT | TOP | LEFT | RIGHT;

export function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function normalize(a: V3): V3 {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}
function negate(a: V3): V3 {
  return [-a[0], -a[1], -a[2]];
}
function normalOf(a: V3, b: V3, c: V3): V3 | null {
  const n = cross(sub(b, a), sub(c, a));
  const length = Math.hypot(n[0], n[1], n[2]);
  return length < 1e-10 ? null : [n[0] / length, n[1] / length, n[2] / length];
}

/**
 * Accumulates triangles with normals, vertex colours and planar UVs. The
 * UV convention matches MeshBuilder: each face is projected along its
 * dominant normal axis and one texture repeat spans `metresPerRepeat`.
 */
export class PartBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private readonly tint = new Color();
  private readonly uvScale: number;

  /**
   * Radius (m) to which box() rounds the edges between two faces it draws;
   * 0 keeps them sharp. Boxes too thin for it are rounded less, or not at
   * all, so slats, glazing bars and rails stay crisp and cheap.
   */
  round = 0;

  constructor(metresPerRepeat = 1) {
    this.uvScale = 1 / metresPerRepeat;
  }

  get triangles(): number {
    return this.positions.length / 9;
  }

  /** Vertex colour (sRGB hex, optionally darkened) for the faces that follow. */
  color(hex: number, shade = 1): this {
    this.tint.setHex(hex);
    if (shade !== 1) this.tint.multiplyScalar(shade);
    return this;
  }

  tri(a: V3, b: V3, c: V3): void {
    const n = normalOf(a, b, c);
    if (n) this.push(a, b, c, n, n, n, n);
  }

  quad(a: V3, b: V3, c: V3, d: V3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** A triangle wound to face `toward`, whatever order its corners come in. */
  triToward(a: V3, b: V3, c: V3, toward: V3): void {
    const n = normalOf(a, b, c);
    if (n == null) return;
    if (dot(n, toward) < 0) {
      const m = negate(n);
      this.push(a, c, b, m, m, m, m);
    } else {
      this.push(a, b, c, n, n, n, n);
    }
  }

  quadToward(a: V3, b: V3, c: V3, d: V3, toward: V3): void {
    this.triToward(a, b, c, toward);
    this.triToward(a, c, d, toward);
  }

  /** Smooth-shaded triangle with per-corner normals, wound to face their average. */
  smoothTriangle(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3): void {
    this.smoothTri(a, b, c, na, nb, nc, add(add(na, nb), nc));
  }

  /** Smooth-shaded quad with per-corner normals, wound to face their average. */
  smoothQuad(a: V3, b: V3, c: V3, d: V3, na: V3, nb: V3, nc: V3, nd: V3): void {
    const toward = add(add(na, nb), add(nc, nd));
    this.smoothTri(a, b, c, na, nb, nc, toward);
    this.smoothTri(a, c, d, na, nc, nd, toward);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }

  mesh(material: Material, name: string): Mesh {
    const mesh = new Mesh(this.build(), material);
    mesh.name = name;
    return mesh;
  }

  private smoothTri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, toward: V3): void {
    const n = normalOf(a, b, c);
    if (n == null) return;
    if (dot(n, toward) < 0) this.push(a, c, b, na, nc, nb, negate(n));
    else this.push(a, b, c, na, nb, nc, n);
  }

  private push(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, face: V3): void {
    const ax = Math.abs(face[0]);
    const ay = Math.abs(face[1]);
    const az = Math.abs(face[2]);
    const axis = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
    const s = this.uvScale;
    const { r, g, b: blue } = this.tint;
    for (let i = 0; i < 3; i += 1) {
      const v = i === 0 ? a : i === 1 ? b : c;
      const n = i === 0 ? na : i === 1 ? nb : nc;
      this.positions.push(v[0], v[1], v[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.colors.push(r, g, blue);
      if (axis === 1) this.uvs.push(v[0] * s, v[2] * s);
      else if (axis === 0) this.uvs.push(v[2] * s, v[1] * s);
      else this.uvs.push(v[0] * s, v[1] * s);
    }
  }
}

/**
 * Local axes for authoring parts: x along t, y along up, z along n. Frames
 * are orthonormal and right-handed (n = t x up), so boxes keep their winding.
 */
export class Frame {
  constructor(
    readonly o: V3,
    readonly t: V3,
    readonly up: V3,
    readonly n: V3,
  ) {}

  /** A frame from a tangent and an up hint, made orthonormal. */
  static of(origin: V3, tangent: V3, upHint: V3 = [0, 1, 0]): Frame {
    const t = normalize(tangent);
    const n = normalize(cross(t, upHint));
    return new Frame(origin, t, cross(n, t), n);
  }

  p(x: number, y: number, z: number): V3 {
    const { o, t, up, n } = this;
    return [
      o[0] + t[0] * x + up[0] * y + n[0] * z,
      o[1] + t[1] * x + up[1] * y + n[1] * z,
      o[2] + t[2] * x + up[2] * y + n[2] * z,
    ];
  }

  /** A local direction in world space. */
  v(x: number, y: number, z: number): V3 {
    const { t, up, n } = this;
    return [
      t[0] * x + up[0] * y + n[0] * z,
      t[1] * x + up[1] * y + n[1] * z,
      t[2] * x + up[2] * y + n[2] * z,
    ];
  }

  /** Same axes, origin moved to local (x, y, z). */
  at(x: number, y: number, z: number): Frame {
    return new Frame(this.p(x, y, z), this.t, this.up, this.n);
  }

  /** Origin at local (x, y, z), turned by `angle` about the up axis (t swings toward -n). */
  turned(x: number, y: number, z: number, angle: number): Frame {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Frame(
      this.p(x, y, z),
      add(scale(this.t, c), scale(this.n, -s)),
      this.up,
      add(scale(this.t, s), scale(this.n, c)),
    );
  }

  /** Rolled by `angle` about the t axis (up swings toward n). */
  rolled(angle: number): Frame {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Frame(this.o, this.t, add(scale(this.up, c), scale(this.n, s)), add(scale(this.n, c), scale(this.up, -s)));
  }
}

/** World axes at the world origin. */
export const WORLD = new Frame([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// --- primitives ---------------------------------------------------------

/** Boxes thinner than this (slats, bars, rails, glazing) are never rounded. */
const MIN_ROUNDED = 0.06;

/** The six faces of a box: its mask bit, the axis it faces along and the side (+1 or -1). */
const BOX_FACES: ReadonlyArray<readonly [number, number, 1 | -1]> = [
  [RIGHT, 0, 1],
  [LEFT, 0, -1],
  [TOP, 1, 1],
  [BOTTOM, 1, -1],
  [FRONT, 2, 1],
  [BACK, 2, -1],
];

/**
 * A box whose edges between two drawn faces are rounded to radius r: each
 * drawn face is inset by r towards every drawn neighbour, the edges become
 * quarter-round strips and the corners octant patches, all with normals
 * running smoothly from one face to the next. An edge against a face that
 * is not drawn (a cornice's back on the wall, a body's front behind its
 * facade) stays square, so nothing opens a crack. Larger radii get two
 * segments, small ones one: a chamfer whose smooth normals read as round.
 */
function roundedBox(b: PartBuilder, f: Frame, lo: V3, hi: V3, mask: number, r: number): void {
  const segments = r >= 0.05 ? 2 : 1;
  const drawn = (axis: number, side: 1 | -1) => {
    for (const [bit, a, s] of BOX_FACES) if (a === axis && s === side) return (mask & bit) !== 0;
    return false;
  };
  // Inner box: shrunk by r on each side whose face is drawn (only those sides round).
  const inner = (axis: number, side: 1 | -1) => (side > 0 ? hi[axis] - (drawn(axis, 1) ? r : 0) : lo[axis] + (drawn(axis, -1) ? r : 0));
  const unit = (axis: number, side: number): V3 => [axis === 0 ? side : 0, axis === 1 ? side : 0, axis === 2 ? side : 0];
  // A point on the rounded surface: the inner box's corner along `dir`, pushed out by r.
  const at = (dir: V3): [V3, V3] => {
    const p: V3 = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      if (dir[axis] > 1e-9) p[axis] = inner(axis, 1) + r * dir[axis];
      else if (dir[axis] < -1e-9) p[axis] = inner(axis, -1) + r * dir[axis];
      else p[axis] = NaN;
    }
    return [p, dir];
  };
  const world = (p: V3): V3 => f.p(p[0], p[1], p[2]);
  const toWorld = (n: V3): V3 => f.v(n[0], n[1], n[2]);
  const blend = (a: V3, c: V3, wa: number, wc: number): V3 => normalize(add(scale(a, wa), scale(c, wc)));

  // Faces: the inner rectangle in the face's plane, out to the hard edge where a neighbour is not drawn.
  for (const [bit, axis, side] of BOX_FACES) {
    if ((mask & bit) === 0) continue;
    const [ua, va] = [(axis + 1) % 3, (axis + 2) % 3];
    const coord = side > 0 ? hi[axis] : lo[axis];
    const corner = (su: 1 | -1, sv: 1 | -1): V3 => {
      const p: V3 = [0, 0, 0];
      p[axis] = coord;
      p[ua] = inner(ua, su);
      p[va] = inner(va, sv);
      return world(p);
    };
    b.quadToward(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), toWorld(unit(axis, side)));
  }

  // Edges between two drawn faces, between the two corners' inner limits along the third axis.
  for (let i = 0; i < BOX_FACES.length; i += 1) {
    for (let j = i + 1; j < BOX_FACES.length; j += 1) {
      const [bitA, axisA, sideA] = BOX_FACES[i];
      const [bitB, axisB, sideB] = BOX_FACES[j];
      if (axisA === axisB || (mask & bitA) === 0 || (mask & bitB) === 0) continue;
      const along = 3 - axisA - axisB;
      const nA = unit(axisA, sideA);
      const nB = unit(axisB, sideB);
      const ends = [inner(along, -1), inner(along, 1)];
      for (let k = 0; k < segments; k += 1) {
        const d0 = blend(nA, nB, segments - k, k);
        const d1 = blend(nA, nB, segments - k - 1, k + 1);
        const [p0, n0] = at(d0);
        const [p1, n1] = at(d1);
        const q = (p: V3, t: number): V3 => {
          const c: V3 = [p[0], p[1], p[2]];
          c[along] = ends[t];
          return world(c);
        };
        b.smoothQuad(q(p0, 0), q(p1, 0), q(p1, 1), q(p0, 1), toWorld(n0), toWorld(n1), toWorld(n1), toWorld(n0));
      }
    }
  }

  // Corners where three drawn faces meet: an octant patch on the same grid as the edges.
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        if (!drawn(0, sx) || !drawn(1, sy) || !drawn(2, sz)) continue;
        const axes = [unit(0, sx), unit(1, sy), unit(2, sz)];
        const point = (i: number, j: number): [V3, V3] => {
          const k = segments - i - j;
          return at(normalize(add(add(scale(axes[0], i), scale(axes[1], j)), scale(axes[2], k))));
        };
        for (let i = 0; i < segments; i += 1) {
          for (let j = 0; j < segments - i; j += 1) {
            const tri = (a: [V3, V3], c: [V3, V3], d: [V3, V3]) =>
              b.smoothTriangle(world(a[0]), world(c[0]), world(d[0]), toWorld(a[1]), toWorld(c[1]), toWorld(d[1]));
            tri(point(i, j), point(i + 1, j), point(i, j + 1));
            if (i + j + 1 < segments) tri(point(i + 1, j), point(i + 1, j + 1), point(i, j + 1));
          }
        }
      }
    }
  }
}

/** Box in frame `f` from local corners; `mask` picks the faces to emit. */
export function box(
  b: PartBuilder,
  f: Frame,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mask = ALL,
): void {
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (z1 < z0) [z0, z1] = [z1, z0];
  if (b.round > 0) {
    const thinnest = Math.min(x1 - x0, y1 - y0, z1 - z0);
    const r = Math.min(b.round, thinnest / 3);
    if (thinnest >= MIN_ROUNDED && r >= 0.006) {
      roundedBox(b, f, [x0, y0, z0], [x1, y1, z1], mask, r);
      return;
    }
  }
  const a = f.p(x0, y0, z1);
  const c1 = f.p(x1, y0, z1);
  const c2 = f.p(x1, y1, z1);
  const d = f.p(x0, y1, z1);
  const e = f.p(x0, y0, z0);
  const g0 = f.p(x1, y0, z0);
  const g = f.p(x1, y1, z0);
  const h = f.p(x0, y1, z0);
  if (mask & FRONT) b.quad(a, c1, c2, d);
  if (mask & BACK) b.quad(g0, e, h, g);
  if (mask & RIGHT) b.quad(c1, g0, g, c2);
  if (mask & LEFT) b.quad(e, a, d, h);
  if (mask & TOP) b.quad(d, c2, g, h);
  if (mask & BOTTOM) b.quad(e, g0, c1, a);
}

export interface PrismOptions {
  top?: boolean;
  bottom?: boolean;
  smooth?: boolean;
  /** Faces point at the axis: the inside of a basin. */
  inward?: boolean;
  /** Angle of the first corner; PI / sides puts a flat side toward +z. */
  phase?: number;
}

/** Regular prism or frustum around the local y axis through (cx, cz). */
export function prism(
  b: PartBuilder,
  f: Frame,
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  r0: number,
  r1: number,
  sides: number,
  o: PrismOptions = {},
): void {
  const phase = o.phase ?? 0;
  const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
  const sign = o.inward ? -1 : 1;
  for (let k = 0; k < sides; k += 1) {
    const a0 = phase + (k / sides) * Math.PI * 2;
    const a1 = phase + ((k + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const p00 = f.p(cx + r0 * c0, y0, cz + r0 * s0);
    const p10 = f.p(cx + r0 * c1, y0, cz + r0 * s1);
    const p11 = f.p(cx + r1 * c1, y1, cz + r1 * s1);
    const p01 = f.p(cx + r1 * c0, y1, cz + r1 * s0);
    if (o.smooth) {
      const n0 = normalize(f.v(sign * c0, sign * slope, sign * s0));
      const n1 = normalize(f.v(sign * c1, sign * slope, sign * s1));
      b.smoothQuad(p00, p10, p11, p01, n0, n1, n1, n0);
    } else {
      const am = (a0 + a1) / 2;
      b.quadToward(p00, p10, p11, p01, f.v(sign * Math.cos(am), sign * slope, sign * Math.sin(am)));
    }
    if (o.top && r1 > 0) b.triToward(f.p(cx, y1, cz), p01, p11, f.v(0, 1, 0));
    if (o.bottom && r0 > 0) b.triToward(f.p(cx, y0, cz), p00, p10, f.v(0, -1, 0));
  }
}

/** Flat ring (or disc when rIn is 0) at height y, facing up or down. */
export function annulus(
  b: PartBuilder,
  f: Frame,
  cx: number,
  cz: number,
  y: number,
  rIn: number,
  rOut: number,
  sides: number,
  up = true,
  phase = 0,
): void {
  const toward = f.v(0, up ? 1 : -1, 0);
  for (let k = 0; k < sides; k += 1) {
    const a0 = phase + (k / sides) * Math.PI * 2;
    const a1 = phase + ((k + 1) / sides) * Math.PI * 2;
    const o0 = f.p(cx + rOut * Math.cos(a0), y, cz + rOut * Math.sin(a0));
    const o1 = f.p(cx + rOut * Math.cos(a1), y, cz + rOut * Math.sin(a1));
    if (rIn <= 0) {
      b.triToward(f.p(cx, y, cz), o0, o1, toward);
    } else {
      const i0 = f.p(cx + rIn * Math.cos(a0), y, cz + rIn * Math.sin(a0));
      const i1 = f.p(cx + rIn * Math.cos(a1), y, cz + rIn * Math.sin(a1));
      b.quadToward(i0, o0, o1, i1, toward);
    }
  }
}

function perpendicular(axis: V3): [V3, V3] {
  const hint: V3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, hint));
  return [u, cross(axis, u)];
}

/** Round tube between two world points, smooth-shaded. */
export function tube(b: PartBuilder, a: V3, c: V3, r: number, sides = 6, caps = false): void {
  const axisRaw = sub(c, a);
  if (Math.hypot(axisRaw[0], axisRaw[1], axisRaw[2]) < 1e-6) return;
  const axis = normalize(axisRaw);
  const [u, w] = perpendicular(axis);
  for (let k = 0; k < sides; k += 1) {
    const a0 = (k / sides) * Math.PI * 2;
    const a1 = ((k + 1) / sides) * Math.PI * 2;
    const d0 = add(scale(u, Math.cos(a0)), scale(w, Math.sin(a0)));
    const d1 = add(scale(u, Math.cos(a1)), scale(w, Math.sin(a1)));
    const p00 = add(a, scale(d0, r));
    const p10 = add(a, scale(d1, r));
    const p11 = add(c, scale(d1, r));
    const p01 = add(c, scale(d0, r));
    b.smoothQuad(p00, p10, p11, p01, d0, d1, d1, d0);
    if (caps) {
      b.triToward(c, p01, p11, axis);
      b.triToward(a, p00, p10, negate(axis));
    }
  }
}

/** Tube along a polyline of world points. */
export function tubePath(b: PartBuilder, points: readonly V3[], r: number, sides = 6): void {
  for (let i = 0; i + 1 < points.length; i += 1) tube(b, points[i], points[i + 1], r, sides);
}

/** Square-section bar between two world points: `w` across, `h` toward the up hint. */
export function beam(
  b: PartBuilder,
  a: V3,
  c: V3,
  w: number,
  h: number,
  upHint: V3 = [0, 1, 0],
  mask = ALL,
): void {
  const axis = sub(c, a);
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (length < 1e-6) return;
  const hint = Math.abs(dot(scale(axis, 1 / length), normalize(upHint))) > 0.995 ? perpendicular(scale(axis, 1 / length))[0] : upHint;
  box(b, Frame.of(a, axis, hint), 0, -h / 2, -w / 2, length, h / 2, w / 2, mask);
}

/** Torus around `axis`: wheels, tyres, a life ring. */
export function torus(
  b: PartBuilder,
  center: V3,
  axis: V3,
  R: number,
  r: number,
  segU: number,
  segV: number,
  colorAt?: (i: number) => number,
): void {
  const a = normalize(axis);
  const [u, w] = perpendicular(a);
  const at = (i: number, j: number): [V3, V3] => {
    const th = (i / segU) * Math.PI * 2;
    const ph = (j / segV) * Math.PI * 2 + Math.PI / segV;
    const radial = add(scale(u, Math.cos(th)), scale(w, Math.sin(th)));
    const n = add(scale(radial, Math.cos(ph)), scale(a, Math.sin(ph)));
    return [add(center, add(scale(radial, R), scale(n, r))), n];
  };
  for (let i = 0; i < segU; i += 1) {
    if (colorAt) b.color(colorAt(i));
    for (let j = 0; j < segV; j += 1) {
      const [p00, n00] = at(i, j);
      const [p10, n10] = at(i + 1, j);
      const [p11, n11] = at(i + 1, j + 1);
      const [p01, n01] = at(i, j + 1);
      b.smoothQuad(p00, p10, p11, p01, n00, n10, n11, n01);
    }
  }
}

/** A bent strip along a circular arc in the frame's x/y plane: mudguards, hoops. */
export function arcStrip(
  b: PartBuilder,
  f: Frame,
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
  width: number,
  thickness: number,
  segments: number,
): void {
  for (let k = 0; k < segments; k += 1) {
    const a0 = from + ((to - from) * k) / segments;
    const a1 = from + ((to - from) * (k + 1)) / segments;
    const p0 = f.p(cx + radius * Math.cos(a0), cy + radius * Math.sin(a0), 0);
    const p1 = f.p(cx + radius * Math.cos(a1), cy + radius * Math.sin(a1), 0);
    const mid = (a0 + a1) / 2;
    beam(b, p0, p1, width, thickness, f.v(Math.cos(mid), Math.sin(mid), 0));
  }
}

// --- the kit: one builder per material ----------------------------------

/**
 * One builder per material of the near town. Scanned surfaces repeat at the
 * scan's real size (the same metres per repeat the panorama uses); the plain
 * ones are vertex-coloured paint, iron, glass and cloth.
 */
export interface Kit {
  plaster: PartBuilder;
  roof: PartBuilder;
  stone: PartBuilder;
  paving: PartBuilder;
  wood: PartBuilder;
  paint: PartBuilder;
  metal: PartBuilder;
  glass: PartBuilder;
  cloth: PartBuilder;
}

export function createKit(): Kit {
  const kit: Kit = {
    plaster: new PartBuilder(2.5),
    roof: new PartBuilder(4),
    stone: new PartBuilder(3),
    paving: new PartBuilder(2.2),
    wood: new PartBuilder(1.5),
    paint: new PartBuilder(),
    metal: new PartBuilder(),
    glass: new PartBuilder(),
    cloth: new PartBuilder(),
  };
  // Soft edges on what reads as masonry and joinery: stucco, stone, paving and wood.
  kit.plaster.round = 0.04;
  kit.stone.round = 0.05;
  kit.paving.round = 0.03;
  kit.wood.round = 0.012;
  return kit;
}

// Shared colours (sRGB). Glass and iron match the panorama's materials.
export const GLASS = 0x1a2228;
export const IRON = 0x2a2a2a;
export const SILL_STONE = 0xf2ede4;
export const PORTAL_STONE = 0xe6dccb;
const BRASS = 0xb8913e;
const CURTAIN = 0x948d80;
const INTERIOR = 0x2b2420;

// --- walls with openings -------------------------------------------------

/** An opening in a facade, in facade coordinates (u along, v up). */
export interface Hole {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/**
 * The flat face of a wall at depth d with rectangular openings cut out,
 * tiled in horizontal bands so it costs a few quads per opening.
 */
export function wallFace(
  b: PartBuilder,
  f: Frame,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  holes: readonly Hole[],
  d = 0,
): void {
  const cuts = new Set<number>([v0, v1]);
  for (const h of holes) {
    if (h.v0 > v0 && h.v0 < v1) cuts.add(h.v0);
    if (h.v1 > v0 && h.v1 < v1) cuts.add(h.v1);
  }
  const vs = [...cuts].sort((p, q) => p - q);
  for (let i = 0; i + 1 < vs.length; i += 1) {
    const va = vs[i];
    const vb = vs[i + 1];
    const mid = (va + vb) / 2;
    const row = holes
      .filter((h) => h.v0 <= mid && h.v1 >= mid && h.u1 > u0 && h.u0 < u1)
      .sort((p, q) => p.u0 - q.u0);
    let cur = u0;
    const strip = (ua: number, ub: number) => {
      if (ub - ua > 1e-4) b.quad(f.p(ua, va, d), f.p(ub, va, d), f.p(ub, vb, d), f.p(ua, vb, d));
    };
    for (const h of row) {
      if (h.u0 > cur) strip(cur, h.u0);
      cur = Math.max(cur, h.u1);
    }
    strip(cur, u1);
  }
}

/** A raised band (plinth, string course) broken around the openings it meets. */
export function band(
  b: PartBuilder,
  f: Frame,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  depth: number,
  blockers: readonly Hole[],
  mask = FRONT | TOP | BOTTOM | LEFT | RIGHT,
): void {
  const cut = blockers.filter((h) => h.v0 < v1 && h.v1 > v0 && h.u1 > u0 && h.u0 < u1).sort((p, q) => p.u0 - q.u0);
  let cur = u0;
  for (const h of cut) {
    if (h.u0 - cur > 0.02) box(b, f, cur, v0, 0, h.u0, v1, depth, mask);
    cur = Math.max(cur, h.u1);
  }
  if (u1 - cur > 0.02) box(b, f, cur, v0, 0, u1, v1, depth, mask);
}

/** The inner faces of an opening's reveal, from the wall face back to `depth`. */
export function reveal(b: PartBuilder, f: Frame, h: Hole, depth: number, mask = LEFT | RIGHT | TOP | BOTTOM): void {
  const { u0, u1, v0, v1 } = h;
  const z = -depth;
  if (mask & LEFT) b.quad(f.p(u0, v0, 0), f.p(u0, v0, z), f.p(u0, v1, z), f.p(u0, v1, 0));
  if (mask & RIGHT) b.quad(f.p(u1, v0, z), f.p(u1, v0, 0), f.p(u1, v1, 0), f.p(u1, v1, z));
  if (mask & TOP) b.quad(f.p(u0, v1, z), f.p(u1, v1, z), f.p(u1, v1, 0), f.p(u0, v1, 0));
  if (mask & BOTTOM) b.quad(f.p(u0, v0, 0), f.p(u1, v0, 0), f.p(u1, v0, z), f.p(u0, v0, z));
}

// --- windows ---------------------------------------------------------------

export type ShutterState = 'open' | 'closed' | 'ajar' | 'none';

export interface WindowSpec {
  u0: number;
  v0: number;
  w: number;
  h: number;
  /** Reveal depth, from the wall face back to the glass. */
  depth: number;
  wall: number;
  /** Stucco surround colour, or null for a plain reveal. */
  surround: number | null;
  /** A small cornice over the surround (the piano nobile). */
  cap: boolean;
  sill: boolean;
  /** A balcony door: down to the floor, solid lower panels, no sill. */
  french: boolean;
  frame: number;
  /** Pane colours, bottom row first, left leaf then right leaf. */
  panes: readonly number[];
  shutters: ShutterState;
  shutter: number;
  /** Louvred persiane, or plank shutters. */
  louvred: boolean;
  /** Opening of an ajar leaf from the wall, radians. */
  ajarAngle: number;
  grille: boolean;
}

/** A complete window or balcony door; returns the hole to cut in the wall face. */
export function windowUnit(kit: Kit, f: Frame, s: WindowSpec): Hole {
  const u0 = s.u0;
  const u1 = s.u0 + s.w;
  const v0 = s.v0;
  const v1 = s.v0 + s.h;
  const hole: Hole = { u0, u1, v0, v1 };
  const sw = 0.13;
  const pl = kit.plaster.color(s.surround ?? s.wall);
  reveal(pl, f, hole, s.depth, s.sill || s.french ? LEFT | RIGHT | TOP : ALL);
  if (s.surround != null) {
    box(pl, f, u0 - sw, v0, 0, u0, v1, 0.02, FRONT | LEFT | RIGHT);
    box(pl, f, u1, v0, 0, u1 + sw, v1, 0.02, FRONT | LEFT | RIGHT);
    box(pl, f, u0 - sw, v1, 0, u1 + sw, v1 + sw, 0.02, FRONT | TOP | BOTTOM | LEFT | RIGHT);
    if (s.cap) box(pl, f, u0 - sw - 0.08, v1 + sw, 0, u1 + sw + 0.08, v1 + sw + 0.1, 0.075, NO_BACK);
  }
  const st = kit.stone.color(SILL_STONE);
  if (s.sill) box(st, f, u0 - 0.07, v0 - 0.065, -s.depth + 0.07, u1 + 0.07, v0, 0.075, NO_BACK);
  if (s.french) box(st, f, u0, v0 - 0.05, -s.depth, u1, v0, 0.01, FRONT | TOP);
  if (s.shutters !== 'closed') casement(kit, f, s);
  shutters(kit, f, s);
  if (s.grille) grille(kit, f, hole);
  return hole;
}

/** Two glazed casement leaves at the back of the reveal. */
function casement(kit: Kit, f: Frame, s: WindowSpec): void {
  const { u0, v0, w, h } = s;
  const u1 = u0 + w;
  const v1 = v0 + h;
  const uc = u0 + w / 2;
  const zg = -s.depth + 0.015;
  const zf = -s.depth + 0.07;
  const fw = 0.065;
  const rail = 0.085;
  const p = kit.paint.color(s.frame);
  box(p, f, u0, v0, zg, u0 + fw, v1, zf, FRONT | RIGHT);
  box(p, f, u1 - fw, v0, zg, u1, v1, zf, FRONT | LEFT);
  box(p, f, u0 + fw, v1 - fw, zg, u1 - fw, v1, zf, FRONT | BOTTOM);
  box(p, f, u0 + fw, v0, zg, u1 - fw, v0 + rail, zf, FRONT | TOP);
  box(p, f, uc - 0.04, v0 + rail, zg, uc + 0.04, v1 - fw, zf, FRONT | LEFT | RIGHT);
  const lo = s.french ? v0 + 0.62 : v0 + rail;
  if (s.french) {
    box(p, f, u0 + fw, v0 + rail, zg, uc - 0.04, lo, zf - 0.02, FRONT | TOP);
    box(p, f, uc + 0.04, v0 + rail, zg, u1 - fw, lo, zf - 0.02, FRONT | TOP);
  }
  const hi = v1 - fw;
  const rows = 3;
  for (let r = 0; r < rows; r += 1) {
    const ya = lo + ((hi - lo) * r) / rows;
    const yb = lo + ((hi - lo) * (r + 1)) / rows;
    for (let side = 0; side < 2; side += 1) {
      const xa = side === 0 ? u0 + fw : uc + 0.04;
      const xb = side === 0 ? uc - 0.04 : u1 - fw;
      kit.glass.color(s.panes[(r * 2 + side) % s.panes.length]);
      kit.glass.quad(f.p(xa, ya, zg), f.p(xb, ya, zg), f.p(xb, yb, zg), f.p(xa, yb, zg));
      if (r > 0) box(p, f, xa, ya - 0.014, zg, xb, ya + 0.014, zg + 0.035, FRONT | TOP | BOTTOM);
    }
  }
}

/** Shutter leaves: folded back against the wall, closed in the reveal, or one leaf ajar. */
function shutters(kit: Kit, f: Frame, s: WindowSpec): void {
  if (s.shutters === 'none') return;
  const lw = s.w / 2 + 0.01;
  const u1 = s.u0 + s.w;
  if (s.shutters === 'closed') {
    const half = s.w / 2 - 0.004;
    leaf(kit, f.at(s.u0, s.v0, -0.075), half, s.h, s.shutter, s.louvred);
    leaf(kit, f.at(u1 - half, s.v0, -0.075), half, s.h, s.shutter, s.louvred);
    return;
  }
  leaf(kit, f.at(s.u0 - lw, s.v0, 0.03), lw, s.h, s.shutter, s.louvred);
  const right = s.shutters === 'ajar' ? f.turned(u1, s.v0, 0.03, -s.ajarAngle) : f.at(u1, s.v0, 0.03);
  leaf(kit, right, lw, s.h, s.shutter, s.louvred);
}

/** One leaf in its own frame, spanning x 0..w, y 0..h and 4 cm of z. */
function leaf(kit: Kit, F: Frame, w: number, h: number, colour: number, louvred: boolean): void {
  const p = kit.paint;
  const t = 0.04;
  if (!louvred) {
    p.color(colour);
    box(p, F, 0, 0, 0, w, h, t, ALL);
    p.color(colour, 0.88);
    box(p, F, 0.05, h * 0.18, t, w - 0.05, h * 0.18 + 0.09, t + 0.02, NO_BACK);
    box(p, F, 0.05, h * 0.74, t, w - 0.05, h * 0.74 + 0.09, t + 0.02, NO_BACK);
    return;
  }
  const st = 0.055;
  // The backing reads as the shade between the slats.
  p.color(colour, 0.45);
  box(p, F, 0.01, 0.01, 0, w - 0.01, h - 0.01, 0.012, ALL);
  p.color(colour);
  box(p, F, 0, 0, 0, st, h, t, NO_BACK);
  box(p, F, w - st, 0, 0, w, h, t, NO_BACK);
  box(p, F, st, 0, 0.012, w - st, 0.1, t, FRONT | TOP | BOTTOM);
  box(p, F, st, h - 0.07, 0.012, w - st, h, t, FRONT | TOP | BOTTOM);
  const mid = h * 0.42;
  box(p, F, st, mid - 0.035, 0.012, w - st, mid + 0.035, t, FRONT | TOP | BOTTOM);
  slats(p, F, st, w - st, 0.1, mid - 0.035);
  slats(p, F, st, w - st, mid + 0.035, h - 0.07);
}

/** Louvres sloping down toward the front, a lip and a top face each. */
function slats(p: PartBuilder, F: Frame, xa: number, xb: number, ya: number, yb: number): void {
  const count = Math.max(1, Math.round((yb - ya) / 0.088));
  const step = (yb - ya) / count;
  const topToward = F.v(0, 0.6, 0.8);
  const frontToward = F.v(0, 0, 1);
  for (let i = 0; i < count; i += 1) {
    const y = ya + i * step;
    const lip0 = y + step * 0.12;
    const lip1 = y + step * 0.3;
    const back = y + step * 0.95;
    p.quadToward(F.p(xa, lip0, 0.036), F.p(xb, lip0, 0.036), F.p(xb, lip1, 0.036), F.p(xa, lip1, 0.036), frontToward);
    p.quadToward(F.p(xa, lip1, 0.036), F.p(xb, lip1, 0.036), F.p(xb, back, 0.014), F.p(xa, back, 0.014), topToward);
  }
}

/** Iron bars inside a ground-floor reveal. */
function grille(kit: Kit, f: Frame, h: Hole): void {
  const m = kit.metal.color(IRON);
  const bars = Math.max(3, Math.round((h.u1 - h.u0) / 0.15));
  for (let i = 1; i < bars; i += 1) {
    const u = h.u0 + ((h.u1 - h.u0) * i) / bars;
    box(m, f, u - 0.015, h.v0, -0.075, u + 0.015, h.v1, -0.045, FRONT | LEFT | RIGHT);
  }
  for (const v of [h.v0 + 0.28, h.v1 - 0.28]) {
    box(m, f, h.u0, v - 0.02, -0.08, h.u1, v + 0.02, -0.04, FRONT | TOP | BOTTOM);
  }
}

/**
 * A small faceted clump for leaves and flowers. With `random` each clump is
 * tipped and squashed differently, so a mass of them reads as foliage
 * rather than as a pile of identical crystals.
 */
export function blob(b: PartBuilder, c: V3, r: number, squash = 0.8, random?: () => number): void {
  let ax: V3 = [1, 0, 0];
  let ay: V3 = [0, 1, 0];
  let az: V3 = [0, 0, 1];
  if (random) {
    const f = Frame.of([0, 0, 0], [Math.cos(random() * 6.283), random() - 0.5, Math.sin(random() * 6.283)], [random() - 0.5, 1, random() - 0.5]);
    ax = scale(f.t, 0.75 + random() * 0.5);
    ay = scale(f.up, squash * (0.6 + random() * 0.5));
    az = scale(f.n, 0.75 + random() * 0.5);
  } else {
    ay = [0, squash, 0];
  }
  const at = (d: V3, s: number): V3 => add(c, scale(d, s * r));
  const px = at(ax, 1);
  const nx = at(ax, -1);
  const pz = at(az, 1);
  const nz = at(az, -1);
  const py = at(ay, 1);
  const ny = at(ay, -1);
  const ring: Array<[V3, V3]> = [
    [px, pz],
    [pz, nx],
    [nx, nz],
    [nz, px],
  ];
  for (const [a, e] of ring) {
    b.triToward(a, e, py, sub(add(add(a, e), py), scale(c, 3)));
    b.triToward(a, e, ny, sub(add(add(a, e), ny), scale(c, 3)));
  }
}

/** Tessa's window: a terracotta trough of geraniums on the sill. */
export function flowerBox(kit: Kit, f: Frame, s: WindowSpec, random: () => number): void {
  const u0 = s.u0 + 0.04;
  const u1 = s.u0 + s.w - 0.04;
  const v = s.v0;
  kit.stone.color(0xb8653f);
  box(kit.stone, f, u0, v, -0.05, u1, v + 0.17, 0.17, ALL);
  for (let i = 0; i < 30; i += 1) {
    const flower = i % 3 === 0;
    const red = random() < 0.5 ? 0xc42a2e : 0xdf4a3d;
    const green = random() < 0.5 ? 0x3f6a2c : 0x527c34;
    kit.cloth.color(flower ? red : green);
    const at = f.p(u0 + 0.05 + random() * (u1 - u0 - 0.1), v + 0.19 + random() * (flower ? 0.2 : 0.12), -0.02 + random() * 0.17);
    blob(kit.cloth, at, flower ? 0.04 : 0.06, 0.7, random);
  }
}

// --- doors and shop fronts ---------------------------------------------------

export interface DoorSpec {
  u0: number;
  w: number;
  h: number;
  depth: number;
  colour: number;
  /** Natural wood leaves instead of paint. */
  wood: boolean;
  fanlight: boolean;
  /** 'classic': jambs, lintel and cap; 'plain': jambs and a lintel. */
  portal: 'classic' | 'plain';
  stone: number;
}

/** A street door in a stone portal, on a step. */
export function doorway(kit: Kit, f: Frame, s: DoorSpec): Hole {
  const { u0, w, h, depth } = s;
  const u1 = u0 + w;
  const hole: Hole = { u0, u1, v0: 0, v1: h };
  const st = kit.stone.color(s.stone);
  reveal(st, f, hole, depth, LEFT | RIGHT | TOP);
  const jamb = s.portal === 'classic' ? 0.2 : 0.14;
  box(st, f, u0 - jamb, 0, 0, u0, h, 0.05, FRONT | LEFT | RIGHT);
  box(st, f, u1, 0, 0, u1 + jamb, h, 0.05, FRONT | LEFT | RIGHT);
  if (s.portal === 'classic') {
    box(st, f, u0 - 0.24, h, 0, u1 + 0.24, h + 0.26, 0.06, NO_BACK);
    box(st, f, u0 - 0.32, h + 0.26, 0, u1 + 0.32, h + 0.34, 0.11, NO_BACK);
  } else {
    box(st, f, u0 - jamb, h, 0, u1 + jamb, h + 0.2, 0.05, NO_BACK);
  }
  box(st, f, u0 - 0.12, -0.25, -depth, u1 + 0.12, 0.14, 0.38, FRONT | TOP | LEFT | RIGHT);
  const leafTop = s.fanlight ? h - 0.52 : h;
  const p = (s.wood ? kit.wood : kit.paint).color(s.colour);
  const z0 = -depth;
  const z1 = -depth + 0.05;
  const mid = u0 + w / 2;
  const leaves: Array<[number, number]> = [
    [u0, mid - 0.006],
    [mid + 0.006, u1],
  ];
  for (const [a, e] of leaves) {
    box(p, f, a, 0.14, z0, e, leafTop, z1, FRONT | LEFT | RIGHT | TOP);
    const split = 0.14 + (leafTop - 0.14) * 0.36;
    box(p, f, a + 0.08, 0.3, z1, e - 0.08, split, z1 + 0.018, NO_BACK);
    box(p, f, a + 0.08, split + 0.12, z1, e - 0.08, leafTop - 0.14, z1 + 0.018, NO_BACK);
  }
  if (s.fanlight) {
    box(p, f, u0, leafTop, z0, u1, leafTop + 0.08, z1 + 0.01, FRONT | TOP | BOTTOM);
    kit.glass.color(GLASS);
    const zg = z0 + 0.01;
    kit.glass.quad(f.p(u0, leafTop + 0.08, zg), f.p(u1, leafTop + 0.08, zg), f.p(u1, h, zg), f.p(u0, h, zg));
    const m = kit.metal.color(IRON);
    for (let k = 1; k < 4; k += 1) {
      const x = u0 + (w * k) / 4;
      box(m, f, x - 0.015, leafTop + 0.08, z0 + 0.02, x + 0.015, h, z0 + 0.05, FRONT | LEFT | RIGHT);
    }
  }
  kit.metal.color(BRASS);
  box(kit.metal, f, mid + 0.05, 1.02, z1, mid + 0.09, 1.08, z1 + 0.05, NO_BACK);
  return hole;
}

export type DoorSide = 'left' | 'right' | 'middle';

/** Shop joinery at the back of a reveal: posts, a glazed door, display windows on stallrisers. */
function shopInfill(
  kit: Kit,
  f: Frame,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  z: number,
  colour: number,
  door: DoorSide,
  fanlight: boolean,
): void {
  const p = kit.paint.color(colour);
  const zf = z + 0.06;
  const doorW = 0.92;
  const da = door === 'left' ? u0 + 0.1 : door === 'right' ? u1 - 0.1 - doorW : (u0 + u1 - doorW) / 2;
  const db = da + doorW;
  const transom = fanlight ? v1 - 0.46 : v1 - 0.09;
  box(p, f, u0, v0, z, u0 + 0.08, v1, zf, FRONT | RIGHT);
  box(p, f, u1 - 0.08, v0, z, u1, v1, zf, FRONT | LEFT);
  box(p, f, u0 + 0.08, transom, z, u1 - 0.08, transom + 0.09, zf + 0.01, FRONT | TOP | BOTTOM);
  box(p, f, da - 0.06, v0, z, da, transom, zf, FRONT | LEFT | RIGHT);
  box(p, f, db, v0, z, db + 0.06, transom, zf, FRONT | LEFT | RIGHT);
  const zd = zf - 0.015;
  box(p, f, da, v0, z, db, v0 + 0.9, zd, FRONT | TOP);
  box(p, f, da, transom - 0.08, z, db, transom, zd, FRONT | BOTTOM);
  box(p, f, da, v0 + 0.9, z, da + 0.08, transom - 0.08, zd, FRONT | RIGHT);
  box(p, f, db - 0.08, v0 + 0.9, z, db, transom - 0.08, zd, FRONT | LEFT);
  const g = kit.glass.color(GLASS);
  const zg = z + 0.01;
  g.quad(f.p(da + 0.08, v0 + 0.9, zg), f.p(db - 0.08, v0 + 0.9, zg), f.p(db - 0.08, transom - 0.08, zg), f.p(da + 0.08, transom - 0.08, zg));
  if (fanlight) g.quad(f.p(u0 + 0.08, transom + 0.09, zg), f.p(u1 - 0.08, transom + 0.09, zg), f.p(u1 - 0.08, v1, zg), f.p(u0 + 0.08, v1, zg));
  const windows: Array<[number, number]> = [];
  if (da - 0.06 - (u0 + 0.08) > 0.2) windows.push([u0 + 0.08, da - 0.06]);
  if (u1 - 0.08 - (db + 0.06) > 0.2) windows.push([db + 0.06, u1 - 0.08]);
  for (const [a, e] of windows) {
    box(p, f, a, v0, z, e, v0 + 0.55, zf - 0.01, FRONT | TOP);
    const n = Math.round((e - a) / 0.95);
    for (let k = 1; k < n; k += 1) {
      const x = a + ((e - a) * k) / n;
      box(p, f, x - 0.035, v0 + 0.55, z, x + 0.035, transom, zf - 0.01, FRONT | LEFT | RIGHT);
    }
    g.quad(f.p(a, v0 + 0.55, zg), f.p(e, v0 + 0.55, zg), f.p(e, transom, zg), f.p(a, transom, zg));
  }
}

export interface ShopSpec {
  u0: number;
  w: number;
  h: number;
  depth: number;
  wall: number;
  frame: number;
  /** Two stripe colours for a cloth awning, or null for none. */
  awning: readonly [number, number] | null;
  door: DoorSide;
}

/** A framed shop front: painted pilasters and a plain fascia (no lettering), maybe an awning. */
export function shopFront(kit: Kit, f: Frame, s: ShopSpec): Hole {
  const { u0, w, h, depth } = s;
  const u1 = u0 + w;
  const hole: Hole = { u0, u1, v0: 0, v1: h };
  reveal(kit.plaster.color(s.wall), f, hole, depth, LEFT | RIGHT | TOP);
  const p = kit.paint.color(s.frame);
  box(p, f, u0 - 0.2, 0, 0, u0, h + 0.5, 0.07, FRONT | LEFT | RIGHT);
  box(p, f, u1, 0, 0, u1 + 0.2, h + 0.5, 0.07, FRONT | LEFT | RIGHT);
  box(p, f, u0, h, 0, u1, h + 0.5, 0.08, FRONT | BOTTOM);
  box(p, f, u0 - 0.28, h + 0.5, 0, u1 + 0.28, h + 0.58, 0.14, NO_BACK);
  box(kit.stone.color(SILL_STONE), f, u0, -0.2, -depth, u1, 0.05, 0.05, FRONT | TOP);
  shopInfill(kit, f, u0, u1, 0.05, h, -depth, s.frame, s.door, true);
  if (s.awning) awning(kit, f, u0 - 0.12, u1 + 0.12, h + 0.44, s.awning);
  return hole;
}

/** A striped cloth awning on drop arms, rolled out over a shop window. */
export function awning(
  kit: Kit,
  f: Frame,
  ua: number,
  ub: number,
  vTop: number,
  colours: readonly [number, number],
  projection = 1.45,
  drop = 0.6,
): void {
  const c = kit.cloth;
  const vFront = vTop - drop;
  const d0 = 0.16;
  const th = 0.015;
  const valance = 0.26;
  const count = Math.max(2, Math.round((ub - ua) / 0.32));
  const sw = (ub - ua) / count;
  const up = f.v(0, projection, drop);
  const down = scale(up, -1);
  const out = f.n;
  const back = scale(f.n, -1);
  const below = f.v(0, -1, 0);
  const pf = projection + th;
  for (let i = 0; i < count; i += 1) {
    c.color(colours[i % 2]);
    const a = ua + i * sw;
    const e = a + sw;
    c.quadToward(f.p(a, vTop, d0), f.p(e, vTop, d0), f.p(e, vFront, projection), f.p(a, vFront, projection), up);
    c.quadToward(f.p(a, vTop - th, d0), f.p(e, vTop - th, d0), f.p(e, vFront - th, projection), f.p(a, vFront - th, projection), down);
    c.quadToward(f.p(a, vFront - valance, pf), f.p(e, vFront - valance, pf), f.p(e, vFront, pf), f.p(a, vFront, pf), out);
    c.quadToward(f.p(a, vFront - valance, projection), f.p(e, vFront - valance, projection), f.p(e, vFront - th, projection), f.p(a, vFront - th, projection), back);
    c.quadToward(f.p(a, vFront - valance, projection), f.p(e, vFront - valance, projection), f.p(e, vFront - valance, pf), f.p(a, vFront - valance, pf), below);
  }
  c.color(colours[0]);
  for (const [u, side] of [
    [ua, -1],
    [ub, 1],
  ] as const) {
    c.quadToward(f.p(u, vTop - th, d0), f.p(u, vTop, d0), f.p(u, vFront, projection), f.p(u, vFront - th, projection), f.v(side, 0, 0));
    c.quadToward(f.p(u, vFront - valance, projection), f.p(u, vFront - valance, pf), f.p(u, vFront, pf), f.p(u, vFront, projection), f.v(side, 0, 0));
  }
  const m = kit.metal.color(IRON);
  for (const u of [ua + 0.07, ub - 0.07]) {
    beam(m, f.p(u, vTop - 0.85, 0.05), f.p(u, vFront - 0.03, projection - 0.05), 0.035, 0.035, f.n);
  }
  tube(m, f.p(ua, vFront - 0.03, projection - 0.02), f.p(ub, vFront - 0.03, projection - 0.02), 0.022, 6);
  box(kit.paint.color(0xd9d4c8), f, ua, vTop - 0.06, 0, ub, vTop + 0.1, d0 + 0.02, NO_BACK);
}

export interface ArchSpec {
  u0: number;
  w: number;
  /** Height where the arch springs from its jambs. */
  spring: number;
  rise: number;
  depth: number;
  wall: number;
  frame: number;
  stone: number;
  door: DoorSide;
}

/** An arched shop front: a segmental stone arch with a keystone, imposts and a glazed lunette. */
export function shopArch(kit: Kit, f: Frame, s: ArchSpec): Hole {
  const { u0, w, spring, rise, depth } = s;
  const u1 = u0 + w;
  const uc = u0 + w / 2;
  const top = spring + rise;
  const R = (w * w * 0.25 + rise * rise) / (2 * rise);
  const vc = top - R;
  const phiMax = Math.asin(Math.min(1, (w * 0.5) / R));
  const seg = 12;
  const ring = 0.22;
  const at = (phi: number, r: number, d: number): V3 => f.p(uc + r * Math.sin(phi), vc + r * Math.cos(phi), d);
  const pl = kit.plaster.color(s.wall);
  const st = kit.stone.color(s.stone);
  for (let k = 0; k < seg; k += 1) {
    const a = -phiMax + (2 * phiMax * k) / seg;
    const e = -phiMax + (2 * phiMax * (k + 1)) / seg;
    const m = (a + e) / 2;
    const inward = f.v(-Math.sin(m), -Math.cos(m), 0);
    const outward = scale(inward, -1);
    pl.quadToward(at(a, R, 0), at(e, R, 0), f.p(uc + R * Math.sin(e), top, 0), f.p(uc + R * Math.sin(a), top, 0), f.n);
    st.quadToward(at(a, R, 0), at(e, R, 0), at(e, R, -depth), at(a, R, -depth), inward);
    st.quadToward(at(a, R, 0.04), at(e, R, 0.04), at(e, R + ring, 0.04), at(a, R + ring, 0.04), f.n);
    st.quadToward(at(a, R + ring, 0), at(e, R + ring, 0), at(e, R + ring, 0.04), at(a, R + ring, 0.04), outward);
    st.quadToward(at(a, R, 0), at(e, R, 0), at(e, R, 0.04), at(a, R, 0.04), inward);
  }
  for (const [phi, side] of [
    [-phiMax, -1],
    [phiMax, 1],
  ] as const) {
    const along = f.v(side * Math.cos(phi), -side * Math.sin(phi), 0);
    st.quadToward(at(phi, R, 0), at(phi, R + ring, 0), at(phi, R + ring, 0.04), at(phi, R, 0.04), along);
  }
  box(st, f, uc - 0.12, top - 0.07, 0, uc + 0.12, top + ring + 0.06, 0.065, NO_BACK);
  reveal(st, f, { u0, u1, v0: 0, v1: spring }, depth, LEFT | RIGHT);
  box(st, f, u0 - 0.24, 0, 0, u0, spring - 0.12, 0.04, FRONT | LEFT | RIGHT);
  box(st, f, u1, 0, 0, u1 + 0.24, spring - 0.12, 0.04, FRONT | LEFT | RIGHT);
  box(st, f, u0 - 0.29, spring - 0.12, 0, u0 + 0.03, spring, 0.075, NO_BACK);
  box(st, f, u1 - 0.03, spring - 0.12, 0, u1 + 0.29, spring, 0.075, NO_BACK);
  box(st, f, u0, -0.2, -depth, u1, 0.05, 0.05, FRONT | TOP);
  shopInfill(kit, f, u0, u1, 0.05, spring, -depth, s.frame, s.door, false);
  // The lunette: glass in the arch, radial glazing bars and a frame along the curve.
  const zg = -depth + 0.01;
  const zb = -depth + 0.035;
  kit.glass.color(GLASS);
  const centre = f.p(uc, spring, zg);
  for (let k = 0; k < seg; k += 1) {
    const a = -phiMax + (2 * phiMax * k) / seg;
    const e = -phiMax + (2 * phiMax * (k + 1)) / seg;
    kit.glass.triToward(centre, at(a, R, zg), at(e, R, zg), f.n);
  }
  const p = kit.paint.color(s.frame);
  for (const phi of [-phiMax * 0.5, 0, phiMax * 0.5]) beam(p, f.p(uc, spring, zb), at(phi, R, zb), 0.045, 0.04, f.n);
  for (let k = 0; k < seg; k += 2) {
    const a = -phiMax + (2 * phiMax * k) / seg;
    const e = -phiMax + (2 * phiMax * (k + 2)) / seg;
    beam(p, at(a, R - 0.03, zb), at(e, R - 0.03, zb), 0.06, 0.05, f.n);
  }
  return { u0, u1, v0: 0, v1: top };
}

// --- balconies, cornices, roofs -----------------------------------------------

/** A stone balcony slab on corbels with an iron railing; v is the floor level. `plant` adds a potted shrub. */
export function balcony(kit: Kit, f: Frame, u0: number, u1: number, v: number, depth: number, plant: (() => number) | null): void {
  const st = kit.stone.color(SILL_STONE);
  box(st, f, u0, v - 0.14, 0, u1, v + 0.06, depth, NO_BACK);
  box(st, f, u0 + 0.05, v - 0.2, 0, u1 - 0.05, v - 0.14, depth - 0.05, FRONT | BOTTOM | LEFT | RIGHT);
  const n = Math.max(2, Math.round((u1 - u0) / 0.9) + 1);
  for (let i = 0; i < n; i += 1) {
    const u = u0 + 0.14 + ((u1 - u0 - 0.28) * i) / (n - 1);
    box(st, f, u - 0.07, v - 0.42, 0, u + 0.07, v - 0.2, depth - 0.16, NO_BACK);
    box(st, f, u - 0.06, v - 0.64, 0, u + 0.06, v - 0.42, 0.26, NO_BACK);
  }
  const m = kit.metal.color(IRON);
  const y0 = v + 0.06;
  const y1 = y0 + 1.0;
  const zf = depth - 0.05;
  const ua = u0 + 0.04;
  const ub = u1 - 0.04;
  // posts at the front corners, rails along the front and the two sides
  box(m, f, ua, y0, zf - 0.045, ua + 0.045, y1, zf, NO_BOTTOM);
  box(m, f, ub - 0.045, y0, zf - 0.045, ub, y1, zf, NO_BOTTOM);
  for (const [ya, yb] of [
    [y1 - 0.045, y1],
    [y0 + 0.08, y0 + 0.11],
  ] as const) {
    box(m, f, ua, ya, zf - 0.04, ub, yb, zf, ALL);
    box(m, f, ua, ya, 0, ua + 0.04, yb, zf - 0.04, NO_BACK);
    box(m, f, ub - 0.04, ya, 0, ub, yb, zf - 0.04, NO_BACK);
  }
  const bar = 0.014;
  for (let u = ua + 0.13; u < ub - 0.08; u += 0.13) {
    box(m, f, u - bar, y0 + 0.11, zf - 0.034, u + bar, y1 - 0.045, zf - 0.006, FRONT | BACK | LEFT | RIGHT);
  }
  for (let d = 0.13; d < zf - 0.08; d += 0.13) {
    for (const u of [ua + 0.02, ub - 0.02]) {
      box(m, f, u - bar, y0 + 0.11, d - bar, u + bar, y1 - 0.045, d + bar, FRONT | BACK | LEFT | RIGHT);
    }
  }
  if (plant) {
    kit.stone.color(0xb8653f);
    prism(kit.stone, f, ua + 0.3, zf - 0.3, y0, y0 + 0.34, 0.15, 0.2, 8, { top: true });
    kit.cloth.color(0x4a6f30);
    for (let i = 0; i < 9; i += 1) {
      const a = i * 2.4;
      blob(kit.cloth, f.p(ua + 0.3 + Math.cos(a) * 0.12, y0 + 0.42 + (i % 3) * 0.1, zf - 0.3 + Math.sin(a) * 0.12), 0.11, 0.8, plant);
    }
  }
}

/** A moulded cornice of three stepped bands under the eaves, with optional dentils. */
export function cornice(kit: Kit, f: Frame, width: number, top: number, tint: number, dentils: boolean): void {
  const p = kit.plaster.color(tint);
  box(p, f, 0, top - 0.52, 0, width, top - 0.38, 0.05, FRONT | TOP | BOTTOM | LEFT | RIGHT);
  box(p, f, 0, top - 0.38, 0, width, top - 0.24, 0.12, FRONT | TOP | BOTTOM | LEFT | RIGHT);
  box(p, f, 0, top - 0.24, 0, width, top, 0.24, FRONT | BOTTOM | LEFT | RIGHT);
  if (!dentils) return;
  for (let u = 0.12; u + 0.09 < width - 0.05; u += 0.2) {
    box(p, f, u, top - 0.33, 0.12, u + 0.09, top - 0.24, 0.2, FRONT | BOTTOM | LEFT | RIGHT);
  }
}

export interface RoofSpec {
  /** Along the facade, and behind it (local z from -depth to 0). */
  width: number;
  depth: number;
  /** Wall top, where the eaves start. */
  top: number;
  /** Ridge height above the eaves. */
  rise: number;
  front: number;
  back: number;
  /** Overhang past each gable end; 0 where a taller neighbour stands. */
  vergeLeft: number;
  vergeRight: number;
  tile: number;
  soffit: number;
  wall: number;
  gutter: number | null;
  /** Skip the gable wall at u = 0 when the caller builds it with openings. */
  openLeftGable?: boolean;
}

/** A tiled gable roof with its ridge along the facade: fascias, soffits, gable ends, a gutter. */
export function gableRoof(kit: Kit, f: Frame, r: RoofSpec): void {
  const W = r.width;
  const D = r.depth;
  const H = r.top;
  const tk = 0.12;
  const dF = r.front;
  const dB = -D - r.back;
  const dR = (dF + dB) / 2;
  const vE = H + tk;
  const vR = vE + r.rise;
  const uL = -r.vergeLeft;
  const uR = W + r.vergeRight;
  const ro = kit.roof.color(r.tile);
  ro.quadToward(f.p(uL, vE, dF), f.p(uR, vE, dF), f.p(uR, vR, dR), f.p(uL, vR, dR), f.v(0, 1, 0.2));
  ro.quadToward(f.p(uL, vE, dB), f.p(uR, vE, dB), f.p(uR, vR, dR), f.p(uL, vR, dR), f.v(0, 1, -0.2));
  ro.quadToward(f.p(uL, H, dF), f.p(uR, H, dF), f.p(uR, vE, dF), f.p(uL, vE, dF), f.n);
  ro.quadToward(f.p(uL, H, dB), f.p(uR, H, dB), f.p(uR, vE, dB), f.p(uL, vE, dB), scale(f.n, -1));
  const vU = vR - tk;
  for (const [u, side] of [
    [uL, -1],
    [uR, 1],
  ] as const) {
    ro.quadToward(f.p(u, H, dF), f.p(u, vE, dF), f.p(u, vR, dR), f.p(u, vU, dR), f.v(side, 0, 0));
    ro.quadToward(f.p(u, H, dB), f.p(u, vE, dB), f.p(u, vR, dR), f.p(u, vU, dR), f.v(side, 0, 0));
  }
  // Underside of the slab: eave soffits, verge soffits, and the ends of the eave voids.
  const under = (d: number) => H + (vU - H) * (d >= dR ? (dF - d) / (dF - dR) : (d - dB) / (dR - dB));
  const pl = kit.plaster.color(r.soffit);
  const down = f.v(0, -1, 0);
  pl.quadToward(f.p(0, H, 0), f.p(W, H, 0), f.p(W, H, dF), f.p(0, H, dF), down);
  pl.quadToward(f.p(0, H, -D), f.p(W, H, -D), f.p(W, H, dB), f.p(0, H, dB), down);
  const verges: Array<[number, number]> = [];
  if (r.vergeLeft > 0) verges.push([uL, 0]);
  if (r.vergeRight > 0) verges.push([W, uR]);
  for (const [ua, ub] of verges) {
    pl.quadToward(f.p(ua, H, dF), f.p(ub, H, dF), f.p(ub, vU, dR), f.p(ua, vU, dR), f.v(0, -1, -0.3));
    pl.quadToward(f.p(ua, H, dB), f.p(ub, H, dB), f.p(ub, vU, dR), f.p(ua, vU, dR), f.v(0, -1, 0.3));
  }
  for (const [u, side] of [
    [0, -1],
    [W, 1],
  ] as const) {
    const out = f.v(side, 0, 0);
    pl.triToward(f.p(u, H, 0), f.p(u, H, dF), f.p(u, under(0), 0), out);
    pl.triToward(f.p(u, H, -D), f.p(u, H, dB), f.p(u, under(-D), -D), out);
    if (u === 0 && r.openLeftGable) continue;
    // Gable end wall, up under the slab.
    kit.plaster.color(r.wall);
    pl.quadToward(f.p(u, H, 0), f.p(u, H, dR), f.p(u, vU, dR), f.p(u, under(0), 0), out);
    pl.quadToward(f.p(u, H, dR), f.p(u, H, -D), f.p(u, under(-D), -D), f.p(u, vU, dR), out);
    kit.plaster.color(r.soffit);
  }
  // Half-round ridge tiles.
  tube(ro.color(r.tile, 0.92), f.p(uL, vR - 0.03, dR), f.p(uR, vR - 0.03, dR), 0.09, 6);
  if (r.gutter != null) box(kit.metal.color(r.gutter), f, uL, H - 0.05, dF, uR, H + 0.07, dF + 0.11, ALL);
}

/** A low hip roof with an even overhang all round (r.front at the sides too). */
export function hipRoof(kit: Kit, f: Frame, r: RoofSpec): void {
  const W = r.width;
  const D = r.depth;
  const H = r.top;
  const oh = r.front;
  const tk = 0.1;
  const uL = -oh;
  const uR = W + oh;
  const dF = oh;
  const dB = -D - r.back;
  const vE = H + tk;
  const vR = vE + r.rise;
  const cu = (uL + uR) / 2;
  const cd = (dF + dB) / 2;
  const lu = uR - uL;
  const ld = dF - dB;
  const ro = kit.roof.color(r.tile);
  const A = f.p(uL, vE, dF);
  const B = f.p(uR, vE, dF);
  const C = f.p(uR, vE, dB);
  const E = f.p(uL, vE, dB);
  if (lu >= ld) {
    const half = (lu - ld) / 2;
    const ra = f.p(cu - half, vR, cd);
    const rb = f.p(cu + half, vR, cd);
    ro.quadToward(A, B, rb, ra, f.v(0, 1, 1));
    ro.quadToward(C, E, ra, rb, f.v(0, 1, -1));
    ro.triToward(B, C, rb, f.v(1, 1, 0));
    ro.triToward(E, A, ra, f.v(-1, 1, 0));
    hipTiles(ro.color(r.tile, 0.92), ra, rb, [A, E], [B, C]);
  } else {
    const half = (ld - lu) / 2;
    const ra = f.p(cu, vR, cd + half);
    const rb = f.p(cu, vR, cd - half);
    ro.triToward(A, B, ra, f.v(0, 1, 1));
    ro.quadToward(B, C, rb, ra, f.v(1, 1, 0));
    ro.triToward(C, E, rb, f.v(0, 1, -1));
    ro.quadToward(E, A, ra, rb, f.v(-1, 1, 0));
    hipTiles(ro.color(r.tile, 0.92), ra, rb, [A, B], [E, C]);
  }
  ro.quadToward(f.p(uL, H, dF), f.p(uR, H, dF), B, A, f.n);
  ro.quadToward(f.p(uR, H, dB), f.p(uL, H, dB), E, C, scale(f.n, -1));
  ro.quadToward(f.p(uR, H, dF), f.p(uR, H, dB), C, B, f.t);
  ro.quadToward(f.p(uL, H, dB), f.p(uL, H, dF), A, E, scale(f.t, -1));
  const pl = kit.plaster.color(r.soffit);
  const down = f.v(0, -1, 0);
  pl.quadToward(f.p(uL, H, 0), f.p(uR, H, 0), f.p(uR, H, dF), f.p(uL, H, dF), down);
  pl.quadToward(f.p(uL, H, dB), f.p(uR, H, dB), f.p(uR, H, -D), f.p(uL, H, -D), down);
  pl.quadToward(f.p(uL, H, -D), f.p(0, H, -D), f.p(0, H, 0), f.p(uL, H, 0), down);
  pl.quadToward(f.p(W, H, -D), f.p(uR, H, -D), f.p(uR, H, 0), f.p(W, H, 0), down);
  if (r.gutter != null) box(kit.metal.color(r.gutter), f, uL, H - 0.05, dF, uR, H + 0.07, dF + 0.11, ALL);
}

/** Ridge and hip tiles: half-round tubes along the ridge and from each ridge end to its two corners. */
function hipTiles(b: PartBuilder, ra: V3, rb: V3, toA: readonly V3[], toB: readonly V3[]): void {
  const sink: V3 = [0, -0.03, 0];
  tube(b, add(ra, sink), add(rb, sink), 0.09, 6);
  for (const corner of toA) tube(b, add(corner, sink), add(ra, sink), 0.08, 6);
  for (const corner of toB) tube(b, add(corner, sink), add(rb, sink), 0.08, 6);
}

/** A plastered chimney stack with a stone cap, smoke openings and a little tiled hood. */
export function chimney(kit: Kit, f: Frame, u: number, d: number, base: number, top: number, tint: number, tile: number): void {
  const w = 0.56;
  const dp = 0.46;
  const pier = 0.09;
  const p = kit.plaster.color(tint);
  box(p, f, u - w / 2, base, d - dp / 2, u + w / 2, top, d + dp / 2, NO_BOTTOM);
  const st = kit.stone.color(SILL_STONE);
  box(st, f, u - w / 2 - 0.06, top, d - dp / 2 - 0.06, u + w / 2 + 0.06, top + 0.06, d + dp / 2 + 0.06, ALL);
  for (const [a, c] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x = u + (a * w) / 2;
    const z = d + (c * dp) / 2;
    box(p, f, x, top + 0.06, z, x - a * pier, top + 0.28, z - c * pier, FRONT | BACK | LEFT | RIGHT);
  }
  box(kit.paint.color(0x2a2522), f, u - w / 2 + pier, top + 0.06, d - dp / 2 + pier, u + w / 2 - pier, top + 0.28, d + dp / 2 - pier, FRONT | BACK | LEFT | RIGHT);
  box(st, f, u - w / 2 - 0.04, top + 0.28, d - dp / 2 - 0.04, u + w / 2 + 0.04, top + 0.33, d + dp / 2 + 0.04, ALL);
  pyramid(kit.roof.color(tile), f, u, d, top + 0.33, w + 0.16, dp + 0.16, 0.2);
}

/** A closed four-sided pyramid standing on local y. */
export function pyramid(b: PartBuilder, f: Frame, u: number, d: number, y: number, w: number, dp: number, h: number): void {
  const A = f.p(u - w / 2, y, d + dp / 2);
  const B = f.p(u + w / 2, y, d + dp / 2);
  const C = f.p(u + w / 2, y, d - dp / 2);
  const E = f.p(u - w / 2, y, d - dp / 2);
  const T = f.p(u, y + h, d);
  b.triToward(A, B, T, f.v(0, 1, 1));
  b.triToward(B, C, T, f.v(1, 1, 0));
  b.triToward(C, E, T, f.v(0, 1, -1));
  b.triToward(E, A, T, f.v(-1, 1, 0));
  b.quadToward(A, B, C, E, f.v(0, -1, 0));
}

/** A downpipe from the gutter: swan neck back to the wall, clips, a shoe at the foot. */
export function downpipe(kit: Kit, f: Frame, u: number, top: number, eave: number, colour: number): void {
  const m = kit.metal.color(colour);
  const r = 0.045;
  const dw = 0.09;
  const dg = eave + 0.055;
  tube(m, f.p(u, top - 0.02, dg), f.p(u, top - 0.32, dg), r);
  tube(m, f.p(u, top - 0.32, dg), f.p(u, top - 0.72, dw), r);
  tube(m, f.p(u, top - 0.72, dw), f.p(u, 0.42, dw), r);
  tube(m, f.p(u, 0.42, dw), f.p(u, 0.12, dw + 0.14), r, 6, true);
  for (let v = 1.8; v < top - 1.2; v += 2.4) box(m, f, u - 0.06, v, 0, u + 0.06, v + 0.045, dw, NO_BACK);
}

/**
 * Lap siding: each board leans out at its foot and leaves a shadow line.
 * `extent(v)` gives the board run at height v (narrowing up a gable);
 * boards break around the openings.
 */
export function clapboards(
  kit: Kit,
  f: Frame,
  v0: number,
  v1: number,
  extent: (v: number) => readonly [number, number],
  holes: readonly Hole[],
  tint: number,
  exposure = 0.17,
): void {
  const p = kit.plaster.color(tint);
  const face = f.v(0, 0.12, 1);
  const below = f.v(0, -1, 0);
  for (let vb = v0; vb < v1 - 0.03; vb += exposure) {
    const vt = Math.min(v1, vb + exposure);
    const [ea, eb] = extent(vt);
    const run = (ua: number, ub: number) => {
      if (ub - ua < 0.05) return;
      p.quadToward(f.p(ua, vb, 0.03), f.p(ub, vb, 0.03), f.p(ub, vt, 0.008), f.p(ua, vt, 0.008), face);
      p.quadToward(f.p(ua, vb, 0), f.p(ub, vb, 0), f.p(ub, vb, 0.03), f.p(ua, vb, 0.03), below);
    };
    const cut = holes.filter((h) => h.v0 < vt && h.v1 > vb).sort((a, b) => a.u0 - b.u0);
    let cur = ea;
    for (const h of cut) {
      if (h.u0 > cur) run(cur, Math.min(h.u0, eb));
      cur = Math.max(cur, h.u1);
    }
    if (cur < eb) run(cur, eb);
  }
}

// --- an Italian town house -------------------------------------------------------

export const FLOOR_HEIGHT = 3.15;
const COPPER = 0x7a5c44;
const PLINTH_STONE = 0xe9e1d2;

export interface GroundOpening {
  kind: 'door' | 'window' | 'arch' | 'shop';
  /** Centre along the facade. */
  u: number;
  w?: number;
  awning?: readonly [number, number];
  door?: DoorSide;
}

export interface HouseSpec {
  width: number;
  depth: number;
  /** How far the facade stands back from the street line. */
  setback: number;
  ground: number;
  floors: number;
  columns: number;
  wall: number;
  trim: number;
  shutter: number;
  frame: number;
  door: number;
  shopFrame: number;
  roof: number;
  rise: number;
  groundFloor: readonly GroundOpening[];
  balconies: ReadonlyArray<{ floor: number; from: number; to: number }>;
  chimneys: readonly number[];
  pipe: number | null;
  dentils: boolean;
  pilasters: boolean;
  tessa: boolean;
  /** Roof overhang past each end; set to 0 beside a taller neighbour. */
  vergeLeft: number;
  vergeRight: number;
}

export function houseTop(s: HouseSpec): number {
  return s.ground + s.floors * FLOOR_HEIGHT + 0.4;
}

function panes(random: () => number): number[] {
  const roll = random();
  if (roll < 0.25) return [CURTAIN, CURTAIN, CURTAIN, CURTAIN, GLASS, GLASS];
  if (roll < 0.4) return [INTERIOR, GLASS, INTERIOR, GLASS, GLASS, GLASS];
  return [GLASS];
}

function shutterState(random: () => number): ShutterState {
  const roll = random();
  return roll < 0.66 ? 'open' : roll < 0.82 ? 'closed' : roll < 0.96 ? 'ajar' : 'none';
}

/**
 * A pastel town house in frame `base` (x along the street from the house's
 * left end, z out of the facade): shops or a door below, windows with
 * persiane above, a cornice and a tiled roof. Returns the centre of Tessa's
 * window when this is her house.
 */
export function italianHouse(kit: Kit, base: Frame, s: HouseSpec, random: () => number): V3 | null {
  const f = base.at(0, 0, -s.setback);
  const W = s.width;
  const D = s.depth - s.setback;
  const H = houseTop(s);
  const holes: Hole[] = [];
  const blockers: Hole[] = [];
  let tessa: V3 | null = null;
  box(kit.plaster.color(s.wall), f, 0, -2, -D, W, H, 0, BACK | LEFT | RIGHT | TOP);

  for (const g of s.groundFloor) {
    if (g.kind === 'door') {
      const w = g.w ?? 1.25;
      const h = doorway(kit, f, {
        u0: g.u - w / 2,
        w,
        h: 2.6,
        depth: 0.26,
        colour: s.door,
        wood: random() < 0.35,
        fanlight: true,
        portal: 'classic',
        stone: PORTAL_STONE,
      });
      holes.push(h);
      blockers.push({ u0: h.u0 - 0.24, u1: h.u1 + 0.24, v0: -1, v1: h.v1 });
    } else if (g.kind === 'window') {
      const w = g.w ?? 0.9;
      const spec: WindowSpec = {
        u0: g.u - w / 2,
        v0: 1.1,
        w,
        h: 1.45,
        depth: 0.2,
        wall: s.wall,
        surround: s.trim,
        cap: false,
        sill: true,
        french: false,
        frame: s.frame,
        panes: panes(random),
        shutters: random() < 0.6 ? 'open' : 'none',
        shutter: s.shutter,
        louvred: true,
        ajarAngle: 1.3,
        grille: true,
      };
      holes.push(windowUnit(kit, f, spec));
    } else if (g.kind === 'arch') {
      const w = g.w ?? 2.3;
      const h = shopArch(kit, f, {
        u0: g.u - w / 2,
        w,
        spring: 2.45,
        rise: 0.55,
        depth: 0.3,
        wall: s.wall,
        frame: s.shopFrame,
        stone: PORTAL_STONE,
        door: g.door ?? 'middle',
      });
      holes.push(h);
      blockers.push({ u0: h.u0 - 0.3, u1: h.u1 + 0.3, v0: -1, v1: h.v1 });
    } else {
      const w = g.w ?? 2.8;
      const h = shopFront(kit, f, {
        u0: g.u - w / 2,
        w,
        h: 2.85,
        depth: 0.26,
        wall: s.wall,
        frame: s.shopFrame,
        awning: g.awning ?? null,
        door: g.door ?? 'right',
      });
      holes.push(h);
      blockers.push({ u0: h.u0 - 0.2, u1: h.u1 + 0.2, v0: -1, v1: h.v1 + 0.58 });
    }
  }

  for (let floor = 1; floor <= s.floors; floor += 1) {
    const vf = s.ground + (floor - 1) * FLOOR_HEIGHT;
    const [ww, wh] = floor === 1 ? [0.98, 1.78] : floor === 2 ? [0.95, 1.62] : [0.9, 1.45];
    for (let c = 0; c < s.columns; c += 1) {
      const uc = (W * (c + 0.5)) / s.columns;
      const french = s.balconies.some((b) => b.floor === floor && c >= b.from && c <= b.to);
      const isTessa = s.tessa && floor === 1 && c === 0;
      // Narrow bays get narrower windows so the open leaves never touch.
      const w = Math.min(ww, W / s.columns - 1.08);
      const spec: WindowSpec = {
        u0: uc - w / 2,
        v0: french ? vf + 0.06 : vf + 0.92,
        w,
        h: french ? 2.36 : wh,
        depth: 0.18,
        wall: s.wall,
        surround: s.trim,
        cap: floor === 1,
        sill: !french,
        french,
        frame: s.frame,
        panes: isTessa ? [CURTAIN, CURTAIN, GLASS, GLASS, GLASS, GLASS] : panes(random),
        shutters: isTessa ? 'open' : shutterState(random),
        shutter: s.shutter,
        louvred: true,
        ajarAngle: 1.15 + random() * 0.5,
        grille: false,
      };
      holes.push(windowUnit(kit, f, spec));
      if (isTessa) {
        flowerBox(kit, f, spec, random);
        tessa = f.p(uc, spec.v0 + spec.h / 2, 0.02);
      }
    }
  }
  for (const b of s.balconies) {
    const vf = s.ground + (b.floor - 1) * FLOOR_HEIGHT;
    const ua = Math.max(0.05, (W * (b.from + 0.5)) / s.columns - 1.18);
    const ub = Math.min(W - 0.05, (W * (b.to + 0.5)) / s.columns + 1.18);
    balcony(kit, f, ua, ub, vf, 0.72, random() < 0.6 ? random : null);
  }

  wallFace(kit.plaster.color(s.wall), f, 0, W, -0.3, H, holes);
  band(kit.stone.color(PLINTH_STONE), f, 0, W, -0.25, 0.62, 0.045, blockers, STRIP);
  band(kit.plaster.color(s.trim), f, 0, W, s.ground - 0.1, s.ground + 0.08, 0.035, holes);
  if (s.pilasters) {
    box(kit.plaster, f, 0, 0.62, 0, 0.3, H - 0.52, 0.022, FRONT | LEFT | RIGHT);
    box(kit.plaster, f, W - 0.3, 0.62, 0, W, H - 0.52, 0.022, FRONT | LEFT | RIGHT);
  }
  cornice(kit, f, W, H, s.trim, s.dentils);
  gableRoof(kit, f, {
    width: W,
    depth: D,
    top: H,
    rise: s.rise,
    front: 0.55,
    back: 0.45,
    vergeLeft: s.vergeLeft,
    vergeRight: s.vergeRight,
    tile: s.roof,
    soffit: s.trim,
    wall: s.wall,
    gutter: COPPER,
  });
  for (const u of s.chimneys) chimney(kit, f, u, -D / 2 - 0.7, H, H + s.rise + 0.9, s.wall, s.roof);
  if (s.pipe != null) downpipe(kit, f, s.pipe, H, 0.55, COPPER);
  return tessa;
}
