import {
  ALL,
  add,
  annulus,
  arcStrip,
  beam,
  box,
  Frame,
  IRON,
  type Kit,
  type PartBuilder,
  prism,
  scale,
  sub,
  torus,
  tube,
  tubePath,
  type V3,
  WORLD,
} from './facade.js';
import { PLAZA_Y } from './layout.js';

/**
 * Street furniture for the square: the fountain, benches, cast-iron lamps,
 * a cafe corner, two bicycles and an old unbranded moped. All of it is
 * timeless on purpose: nothing here dates the town or carries a name.
 * Each piece is authored in its own frame (origin on the ground, +x along
 * the piece, +z its front) and merged into the town's material meshes.
 */

const WATER = 0x2c4a4c;
const LAMP_IRON = 0x24302a;
const SLAT = 0xc08a5a;
const TYRE = 0x1b1b1b;
const CHROME = 0xbdbdbd;
const LEATHER = 0x4a2f1f;
const WICKER = 0xd9b37c;

/** Octagonal basin with a moulded coping, a column and an upper bowl. */
export function fountain(kit: Kit, x: number, z: number): void {
  const f = WORLD.at(x, PLAZA_Y, z);
  const s = kit.stone;
  const ph = Math.PI / 8;
  s.color(0xe9e2d6);
  prism(s, f, 0, 0, -0.1, 0.16, 2.78, 2.78, 8, { top: true, phase: ph });
  s.color(0xf3eee4);
  prism(s, f, 0, 0, 0.16, 0.62, 2.42, 2.42, 8, { phase: ph });
  prism(s, f, 0, 0, 0.62, 0.76, 2.53, 2.53, 8, { phase: ph });
  annulus(s, f, 0, 0, 0.62, 2.42, 2.53, 8, false, ph);
  annulus(s, f, 0, 0, 0.76, 2.13, 2.53, 8, true, ph);
  prism(s, f, 0, 0, 0.5, 0.76, 2.13, 2.13, 8, { inward: true, phase: ph });
  kit.glass.color(WATER);
  annulus(kit.glass, f, 0, 0, 0.6, 0, 2.13, 8, true, ph);
  s.color(0xefe9de);
  prism(s, f, 0, 0, 0.6, 0.8, 0.36, 0.3, 12, { top: true });
  prism(s, f, 0, 0, 0.8, 1.62, 0.2, 0.17, 16, { smooth: true });
  prism(s, f, 0, 0, 1.62, 1.74, 0.27, 0.27, 16, { bottom: true });
  prism(s, f, 0, 0, 1.74, 2.04, 0.27, 0.95, 16, { smooth: true });
  prism(s, f, 0, 0, 2.04, 2.15, 0.95, 0.95, 16);
  annulus(s, f, 0, 0, 2.15, 0.84, 0.95, 16, true);
  prism(s, f, 0, 0, 2.08, 2.15, 0.84, 0.84, 16, { inward: true });
  kit.glass.color(WATER);
  annulus(kit.glass, f, 0, 0, 2.1, 0, 0.84, 16, true);
  s.color(0xefe9de);
  prism(s, f, 0, 0, 2.1, 2.4, 0.11, 0.08, 12, { smooth: true });
  prism(s, f, 0, 0, 2.4, 2.56, 0.08, 0.16, 12, { smooth: true });
  prism(s, f, 0, 0, 2.56, 2.8, 0.16, 0, 12, { smooth: true });
}

/** A park bench, cast-iron ends and wooden slats; +z is the side you face sitting. */
export function bench(kit: Kit, f: Frame): void {
  const m = kit.metal.color(IRON);
  for (const x of [-0.8, 0.8]) {
    beam(m, f.p(x, 0, 0.2), f.p(x, 0.45, 0.19), 0.05, 0.05, f.t);
    beam(m, f.p(x, 0, -0.24), f.p(x, 0.42, -0.2), 0.05, 0.05, f.t);
    beam(m, f.p(x, 0.42, -0.2), f.p(x, 0.88, -0.3), 0.05, 0.05, f.t);
    beam(m, f.p(x, 0.4, 0.23), f.p(x, 0.4, -0.23), 0.04, 0.05, f.t);
    beam(m, f.p(x, 0.66, 0.22), f.p(x, 0.66, -0.25), 0.045, 0.04, f.t);
    beam(m, f.p(x, 0.45, 0.19), f.p(x, 0.66, 0.2), 0.04, 0.04, f.t);
  }
  const w = kit.wood.color(SLAT);
  for (let i = 0; i < 4; i += 1) {
    const z = 0.17 - i * 0.115;
    box(w, f, -0.92, 0.42, z - 0.045, 0.92, 0.455, z + 0.045, ALL);
  }
  const lean = f.v(0, 0.98, -0.21);
  for (let i = 0; i < 3; i += 1) {
    const y = 0.56 + i * 0.12;
    const z = -0.2 - (y - 0.42) * 0.22;
    beam(w, f.p(-0.92, y, z), f.p(0.92, y, z), 0.035, 0.095, lean);
  }
}

/** A cast-iron street lamp, about 4.4 m tall, with a six-sided lantern. */
export function streetLamp(kit: Kit, x: number, z: number): void {
  const f = WORLD.at(x, PLAZA_Y, z);
  const m = kit.metal.color(LAMP_IRON);
  const oct = Math.PI / 8;
  prism(m, f, 0, 0, -0.05, 0.42, 0.21, 0.16, 8, { phase: oct });
  prism(m, f, 0, 0, 0.42, 0.5, 0.19, 0.19, 8, { top: true, phase: oct });
  prism(m, f, 0, 0, 0.5, 0.62, 0.12, 0.09, 8);
  prism(m, f, 0, 0, 0.62, 3.35, 0.075, 0.05, 10, { smooth: true });
  prism(m, f, 0, 0, 3.35, 3.45, 0.085, 0.085, 10, { bottom: true });
  beam(m, f.p(-0.28, 3.12, 0), f.p(0.28, 3.12, 0), 0.03, 0.03);
  prism(m, f, 0, 0, 3.45, 3.56, 0.07, 0.17, 6, { bottom: true });
  kit.glass.color(0x56606a);
  prism(kit.glass, f, 0, 0, 3.56, 4.0, 0.17, 0.23, 6);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    beam(m, f.p(0.17 * Math.cos(a), 3.56, 0.17 * Math.sin(a)), f.p(0.23 * Math.cos(a), 4.0, 0.23 * Math.sin(a)), 0.028, 0.028);
  }
  prism(m, f, 0, 0, 4.0, 4.06, 0.27, 0.27, 6, { bottom: true });
  prism(m, f, 0, 0, 4.06, 4.3, 0.27, 0.04, 6);
  prism(m, f, 0, 0, 4.3, 4.44, 0.05, 0, 6);
}

/** A round bistro table: marble top on a cast-iron pedestal. */
export function cafeTable(kit: Kit, x: number, z: number): void {
  const f = WORLD.at(x, PLAZA_Y, z);
  const m = kit.metal.color(IRON);
  prism(m, f, 0, 0, 0, 0.04, 0.24, 0.22, 10, { top: true });
  prism(m, f, 0, 0, 0.04, 0.7, 0.03, 0.03, 6, { smooth: true });
  prism(m, f, 0, 0, 0.7, 0.72, 0.1, 0.1, 8);
  kit.stone.color(0xf6f3ec);
  prism(kit.stone, f, 0, 0, 0.72, 0.75, 0.31, 0.31, 14, { top: true, bottom: true });
}

/** A bentwood bistro chair facing +z. */
export function cafeChair(kit: Kit, f: Frame): void {
  const w = kit.wood.color(0xa8774b);
  for (const side of [-1, 1]) {
    tube(w, f.p(0.16 * side, 0.44, 0.15), f.p(0.19 * side, 0, 0.2), 0.016);
    tubePath(w, [f.p(0.17 * side, 0, -0.21), f.p(0.15 * side, 0.44, -0.15), f.p(0.14 * side, 0.86, -0.21)], 0.016);
  }
  prism(w, f, 0, 0, 0.42, 0.46, 0.2, 0.2, 12, { top: true, bottom: true });
  // The backrest hoop, in a frame whose x/y plane is horizontal.
  const g = new Frame(f.p(0, 0.82, 0.02), f.t, scale(f.n, -1), f.up);
  arcStrip(w, g, 0, 0, 0.22, 0.45, Math.PI - 0.45, 0.07, 0.02, 6);
}

/** A market parasol with eight alternating panels and a short valance. */
export function parasol(kit: Kit, x: number, z: number, colours: readonly [number, number]): void {
  const f = WORLD.at(x, PLAZA_Y, z);
  kit.stone.color(0xd8d2c6);
  prism(kit.stone, f, 0, 0, 0, 0.12, 0.27, 0.24, 10, { top: true });
  kit.wood.color(0xc9a678);
  prism(kit.wood, f, 0, 0, 0.12, 2.58, 0.026, 0.026, 6, { smooth: true });
  const c = kit.cloth;
  const R = 1.4;
  const yEdge = 2.08;
  const yMid = 2.37;
  const yTop = 2.5;
  const drop: V3 = scale(f.up, -0.025);
  const valance: V3 = scale(f.up, -0.17);
  const apex = f.p(0, yTop, 0);
  for (let k = 0; k < 8; k += 1) {
    const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    const am = (a0 + a1) / 2;
    const e0 = f.p(R * Math.cos(a0), yEdge, R * Math.sin(a0));
    const e1 = f.p(R * Math.cos(a1), yEdge, R * Math.sin(a1));
    const m0 = f.p(0.5 * R * Math.cos(a0), yMid, 0.5 * R * Math.sin(a0));
    const m1 = f.p(0.5 * R * Math.cos(a1), yMid, 0.5 * R * Math.sin(a1));
    const out = f.v(Math.cos(am), 1.6, Math.sin(am));
    const under = scale(out, -1);
    c.color(colours[k % 2]);
    c.quadToward(e0, e1, m1, m0, out);
    c.triToward(m0, m1, apex, f.v(Math.cos(am), 4, Math.sin(am)));
    c.quadToward(add(e0, drop), add(e1, drop), add(m1, drop), add(m0, drop), under);
    c.triToward(add(m0, drop), add(m1, drop), add(apex, drop), f.v(0, -1, 0));
    const side = f.v(Math.cos(am), 0, Math.sin(am));
    c.quadToward(e0, e1, add(e1, valance), add(e0, valance), side);
    c.quadToward(e0, e1, add(e1, valance), add(e0, valance), scale(side, -1));
  }
  kit.wood.color(0xc9a678);
  prism(kit.wood, f, 0, 0, yTop - 0.02, yTop + 0.12, 0.045, 0, 6);
}

/** A box with sides of thickness `t` and an open top: a basket, a crate. */
export function openBox(b: PartBuilder, f: Frame, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number): void {
  box(b, f, x0, y0, z0, x1, y1, z1, ALL & ~16);
  const inner: Array<[V3, V3, V3, V3, V3]> = [
    [f.p(x0 + t, y0 + t, z0 + t), f.p(x1 - t, y0 + t, z0 + t), f.p(x1 - t, y1, z0 + t), f.p(x0 + t, y1, z0 + t), f.n],
    [f.p(x0 + t, y0 + t, z1 - t), f.p(x1 - t, y0 + t, z1 - t), f.p(x1 - t, y1, z1 - t), f.p(x0 + t, y1, z1 - t), scale(f.n, -1)],
    [f.p(x0 + t, y0 + t, z0 + t), f.p(x0 + t, y0 + t, z1 - t), f.p(x0 + t, y1, z1 - t), f.p(x0 + t, y1, z0 + t), f.t],
    [f.p(x1 - t, y0 + t, z0 + t), f.p(x1 - t, y0 + t, z1 - t), f.p(x1 - t, y1, z1 - t), f.p(x1 - t, y1, z0 + t), scale(f.t, -1)],
    [f.p(x0 + t, y0 + t, z0 + t), f.p(x1 - t, y0 + t, z0 + t), f.p(x1 - t, y0 + t, z1 - t), f.p(x0 + t, y0 + t, z1 - t), f.up],
  ];
  for (const [a, c, d, e, toward] of inner) b.quadToward(a, c, d, e, toward);
  const up = f.up;
  b.quadToward(f.p(x0, y1, z0), f.p(x1, y1, z0), f.p(x1, y1, z0 + t), f.p(x0, y1, z0 + t), up);
  b.quadToward(f.p(x0, y1, z1 - t), f.p(x1, y1, z1 - t), f.p(x1, y1, z1), f.p(x0, y1, z1), up);
  b.quadToward(f.p(x0, y1, z0 + t), f.p(x0 + t, y1, z0 + t), f.p(x0 + t, y1, z1 - t), f.p(x0, y1, z1 - t), up);
  b.quadToward(f.p(x1 - t, y1, z0 + t), f.p(x1, y1, z0 + t), f.p(x1, y1, z1 - t), f.p(x1 - t, y1, z1 - t), up);
}

/** A block whose top face is pulled in by `inset` at the sides: tanks, saddles, seats. */
export function tapered(b: PartBuilder, f: Frame, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, inset: number): void {
  const c = [
    f.p(x0, y0, z1), f.p(x1, y0, z1), f.p(x1, y1, z1 - inset), f.p(x0, y1, z1 - inset),
    f.p(x0, y0, z0), f.p(x1, y0, z0), f.p(x1, y1, z0 + inset), f.p(x0, y1, z0 + inset),
  ];
  b.quadToward(c[0], c[1], c[2], c[3], f.v(0, inset, 1));
  b.quadToward(c[5], c[4], c[7], c[6], f.v(0, inset, -1));
  b.quadToward(c[3], c[2], c[6], c[7], f.up);
  b.quadToward(c[4], c[5], c[1], c[0], scale(f.up, -1));
  b.quadToward(c[1], c[5], c[6], c[2], f.t);
  b.quadToward(c[4], c[0], c[3], c[7], scale(f.t, -1));
}

export interface BikeColours {
  frame: number;
  guards: number;
}

/**
 * A step-through city bicycle with mudguards, a rack and a wicker basket.
 * Frame origin on the ground midway between the wheels, +x forward, +z its left.
 */
export function bicycle(kit: Kit, f: Frame, colours: BikeColours): void {
  const R = 0.34;
  const rear = f.p(-0.54, R, 0);
  const front = f.p(0.54, R, 0);
  const axle = f.n;
  const rubber = kit.cloth.color(TYRE);
  const chrome = kit.metal.color(CHROME);
  for (const hub of [rear, front]) {
    torus(rubber, hub, axle, R - 0.022, 0.022, 20, 4);
    torus(chrome, hub, axle, R - 0.05, 0.011, 20, 3);
    tube(chrome, sub(hub, scale(axle, 0.05)), add(hub, scale(axle, 0.05)), 0.025, 6, true);
  }
  const p = kit.paint.color(colours.frame);
  const bb = f.p(-0.06, 0.28, 0);
  const seat = f.p(-0.16, 0.86, 0);
  const headLo = f.p(0.4, 0.62, 0);
  const headHi = f.p(0.36, 0.8, 0);
  tube(p, headLo, headHi, 0.022, 6, true);
  tubePath(p, [headLo, f.p(0.22, 0.45, 0), bb], 0.018);
  tubePath(p, [headHi, f.p(0.2, 0.6, 0), f.p(0.02, 0.38, 0)], 0.015);
  tube(p, bb, seat, 0.017);
  for (const side of [-1, 1]) {
    const hub = f.p(-0.54, R, 0.05 * side);
    tube(p, bb, hub, 0.011);
    tube(p, f.p(-0.14, 0.78, 0), hub, 0.01);
    tube(p, headLo, f.p(0.54, R, 0.045 * side), 0.012);
  }
  // Mudguards and a chain guard.
  const guard = kit.paint.color(colours.guards);
  arcStrip(guard, f, -0.54, R, R + 0.035, 0.35, 3.45, 0.055, 0.01, 9);
  arcStrip(guard, f, 0.54, R, R + 0.035, -0.25, 2.6, 0.055, 0.01, 8);
  beam(guard, f.p(-0.02, 0.3, -0.07), f.p(-0.54, 0.35, -0.07), 0.012, 0.1, f.up);
  // Chainring, cranks and pedals.
  const m = kit.metal.color(CHROME);
  const ring = new Frame(f.p(-0.06, 0.28, -0.06), f.t, f.n, scale(f.up, -1));
  prism(m, ring, 0, 0, -0.004, 0.004, 0.1, 0.1, 12, { top: true, bottom: true });
  for (const side of [-1, 1]) {
    const end = f.p(-0.06 + 0.16 * side, 0.28 - 0.05 * side, 0.09 * side);
    beam(m, f.p(-0.06, 0.28, 0.07 * side), end, 0.02, 0.02);
    box(kit.cloth.color(TYRE), f.at(-0.06 + 0.16 * side, 0.28 - 0.05 * side, 0.09 * side), -0.05, -0.012, 0, 0.05, 0.012, 0.09 * side, ALL);
  }
  // Handlebar, grips, saddle.
  m.color(CHROME);
  tube(m, headHi, f.p(0.34, 0.98, 0), 0.014);
  for (const side of [-1, 1]) {
    tubePath(m, [f.p(0.34, 0.98, 0), f.p(0.27, 1.0, 0.22 * side), f.p(0.17, 0.99, 0.29 * side)], 0.012);
    tube(kit.cloth.color(0x2a211a), f.p(0.17, 0.99, 0.29 * side), f.p(0.08, 0.98, 0.3 * side), 0.018, 6, true);
  }
  tube(m, seat, f.p(-0.17, 0.92, 0), 0.012);
  const leather = kit.cloth.color(LEATHER);
  tapered(leather, f, -0.31, -0.1, 0.92, 0.98, -0.09, 0.09, 0.02);
  tapered(leather, f, -0.1, 0.03, 0.93, 0.98, -0.035, 0.035, 0.01);
  // Rear rack and the front basket.
  m.color(CHROME);
  for (const side of [-1, 1]) {
    tube(m, f.p(-0.14, 0.76, 0.075 * side), f.p(-0.8, 0.74, 0.075 * side), 0.008);
    tube(m, f.p(-0.74, 0.74, 0.075 * side), f.p(-0.54, R, 0.06 * side), 0.007);
  }
  for (const x of [-0.3, -0.5, -0.7]) tube(m, f.p(x, 0.745, -0.075), f.p(x, 0.745, 0.075), 0.007);
  openBox(kit.wood.color(WICKER), f, 0.42, 0.72, -0.16, 0.74, 0.97, 0.16, 0.015);
  tube(m, f.p(0.5, 0.72, 0.1), f.p(0.54, R, 0.05), 0.007);
  tube(m, f.p(0.5, 0.72, -0.1), f.p(0.54, R, -0.05), 0.007);
}

/**
 * A small old motorbike, deliberately generic: round headlamp, teardrop-ish
 * tank, long seat, carrier, centre stand. No scooter body, so it echoes no
 * real model. Frame origin on the ground midway between the wheels, +x forward.
 */
export function moped(kit: Kit, f: Frame, body: number): void {
  const R = 0.29;
  const rear = f.p(-0.6, R, 0);
  const front = f.p(0.62, R, 0);
  const rubber = kit.cloth.color(TYRE);
  const chrome = kit.metal.color(CHROME);
  for (const hub of [rear, front]) {
    torus(rubber, hub, f.n, R - 0.04, 0.04, 22, 5);
    torus(chrome, hub, f.n, R - 0.085, 0.012, 22, 3);
    kit.metal.color(0x77777a);
    tube(kit.metal, sub(hub, scale(f.n, 0.06)), add(hub, scale(f.n, 0.06)), 0.075, 10, true);
    kit.metal.color(CHROME);
  }
  const p = kit.paint.color(body);
  // Fork, headstock, headlamp, handlebar.
  for (const side of [-1, 1]) tube(chrome, f.p(0.62, R, 0.075 * side), f.p(0.46, 0.84, 0.075 * side), 0.02);
  tube(p, f.p(0.47, 0.8, 0), f.p(0.4, 1.0, 0), 0.045, 8, true);
  const lamp = Frame.of(f.p(0.47, 0.97, 0), f.n, f.t);
  prism(chrome, lamp, 0, 0, 0, 0.11, 0.1, 0.105, 12, { bottom: true });
  kit.glass.color(0xd9d6c8);
  annulus(kit.glass, lamp, 0, 0, 0.111, 0, 0.088, 12, true);
  for (const side of [-1, 1]) {
    tubePath(chrome, [f.p(0.4, 1.0, 0), f.p(0.36, 1.05, 0.26 * side), f.p(0.28, 1.06, 0.34 * side)], 0.013);
    tube(kit.cloth.color(0x1f1a16), f.p(0.28, 1.06, 0.34 * side), f.p(0.2, 1.06, 0.35 * side), 0.02, 6, true);
  }
  // Spine, tank, side covers, seat, carrier.
  tubePath(p, [f.p(0.44, 0.84, 0), f.p(0.2, 0.52, 0), f.p(-0.12, 0.44, 0)], 0.035);
  tapered(p, f, 0.02, 0.4, 0.72, 0.92, -0.13, 0.13, 0.05);
  box(p, f, -0.5, 0.52, -0.14, -0.05, 0.84, 0.14, ALL);
  tapered(kit.cloth.color(0x2b2420), f, -0.66, 0.06, 0.84, 0.95, -0.13, 0.13, 0.035);
  for (const side of [-1, 1]) {
    tube(chrome, f.p(-0.45, 0.95, 0.12 * side), f.p(-0.92, 0.93, 0.12 * side), 0.01);
    tube(chrome, f.p(-0.88, 0.93, 0.12 * side), f.p(-0.6, R, 0.1 * side), 0.009);
  }
  for (const x of [-0.6, -0.75, -0.9]) tube(chrome, f.p(x, 0.935, -0.12), f.p(x, 0.935, 0.12), 0.009);
  // Engine with cooling fins, exhaust, swingarm, shocks, centre stand.
  const grey = kit.metal.color(0x77777a);
  box(grey, f, -0.05, 0.25, -0.12, 0.32, 0.52, 0.12, ALL);
  for (let i = 0; i < 4; i += 1) box(grey, f, 0.18 + i * 0.045, 0.5, -0.1, 0.2 + i * 0.045, 0.66, 0.1, ALL);
  chrome.color(CHROME);
  tubePath(chrome, [f.p(0.3, 0.33, -0.12), f.p(0.12, 0.22, -0.17), f.p(-0.5, 0.26, -0.17)], 0.024);
  tube(chrome, f.p(-0.5, 0.27, -0.17), f.p(-0.88, 0.31, -0.17), 0.045, 8, true);
  kit.metal.color(0x3a3a3c);
  for (const side of [-1, 1]) {
    tube(kit.metal, f.p(-0.1, 0.42, 0.1 * side), f.p(-0.6, R, 0.1 * side), 0.022);
    tube(kit.metal, f.p(-0.15, 0.3, 0.1 * side), f.p(-0.25, 0, 0.12 * side), 0.016);
  }
  kit.metal.color(CHROME);
  for (const side of [-1, 1]) tube(kit.metal, f.p(-0.58, 0.36, 0.115 * side), f.p(-0.46, 0.84, 0.115 * side), 0.022);
  const guard = kit.paint.color(body);
  arcStrip(guard, f, 0.62, R, R + 0.04, -0.2, 2.5, 0.12, 0.012, 8);
  arcStrip(guard, f, -0.6, R, R + 0.04, 0.6, 3.5, 0.13, 0.012, 8);
  kit.paint.color(0xa3261e);
  box(kit.paint, f, -0.97, 0.66, -0.04, -0.93, 0.72, 0.04, ALL);
}
