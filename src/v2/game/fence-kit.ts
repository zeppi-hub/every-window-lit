import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { devParam } from '../dev-param.js';
import { deskClicks, type DeskDrive, deskPlaying, setDeskDrive, setDeskLine, setDeskMode } from '../desk-hands.js';
import { setV2Targets } from '../step-targets.js';
import { choices, DRIVE, type Fenced, gap, gustHaul, type Haul, hintFor, holds, judge, LINE, lineHeight, newDriver, newHaul, newRing, payOut, type Ring, slackAllowed, type Spot, stepDriver, stepHaul, type ValleyStage, type Verdict } from '../valley-rules.js';
import { type Hands, readHands } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { mergeByMaterial } from './fx.js';

/**
 * The ring of stakes and line that the valley memory and its fight in the
 * city are both played with (the rules are in v2/valley-rules.ts). Seated
 * by a hole, the player lifts a two-handled driver and slams it down on the
 * stake until the depth post's column is green, then hauls the line from
 * the stake before, hand over hand, until it stands clear; then picks the
 * next hole (a pinch along the hand's ray) and is carried there behind a
 * short fade. The first stake again closes the ring.
 *
 * The camera is never turned while it can be seen: a change of seat is the
 * same fade as every other in the game.
 */

/** The eye above the ground on the keeper's seat, and how far back from the hole it is (m). */
export const SEAT = { eye: 1.3, back: 0.4 } as const;
/** A stake: its length, and how far each handle of the driver is to the side and above the stake's top (m). */
const STAKE_LONG = 1.25;
const HANDLE = { side: 0.25, up: 0.1 } as const;
/** A hand this near its handle, pinching, has it (m). */
const TAKE = 0.17;
/** The line's free end runs this far past the notch, rising this much: a pinch this near it takes it (m). */
const TAIL = { along: 0.7, up: 0.12, reach: 0.24 } as const;
/** Pieces of line, and rags, drawn per span. */
const PIECES = 14;
const MOST_POSTS = 9;
const MOST_SPANS = 9;
const UP = new Vector3(0, 1, 0);
/**
 * The depth post: how far beyond the hole it stands from the seat and how far to the right (clear of the driver's cap, of
 * the hands on the line and of the goal plate, which rests low to the left), where its column starts and how tall and wide that is, and the lamp's height (just above a seated eye).
 */
const METER = { beyond: 0.35, aside: 0.24, foot: 0.8, tall: 0.46, wide: 0.06, lamp: 1.36 } as const;
const LAMP_OFF = 0x4a3214;
/**
 * The driver in the mouse's play: how high the keeper lifts it (m), how long the lift takes, how long he holds it at the
 * top before his arms tire, how fast it sinks then (a share of the lift a second) and to where, how long the fall and the
 * rest after a blow take (s), and from what share of the lift a blow is a full one (the lamp is green).
 */
const LIFT = { high: 0.3, rise: 0.7, hold: 0.9, sink: 0.7, tired: 0.45, fall: 0.09, rest: 0.3, green: 0.85 } as const;
/** A pull in the mouse's play: the hand shut and drawing (s), open and coming back (s), and the line it brings through (m). */
const PULL = { closed: 0.3, back: 0.22, takes: 0.3 } as const;

export interface FenceLook {
  stake: number;
  line: number;
  rag: number;
  iron: number;
  /** The city's fence is gold and gives its own light. */
  glow: number;
}

export const WOOD: FenceLook = { stake: 0xb89a6a, line: 0x6e5c40, rag: 0xc22a2a, iron: 0x3c4046, glow: 0 };
export const GOLD: FenceLook = { stake: 0xe8c45a, line: 0xf2c14e, rag: 0xffd76a, iron: 0xc9a23f, glow: 0.55 };

type Adder = <T extends Object3D>(object: T) => T;

/** Everything of one ring that is drawn: the stakes, the driver, the spans of line and their rags, the lamps that light when it holds. */
export class Fence {
  readonly driver = new Group();
  readonly ghost = new Group();
  readonly bead: Mesh;
  /** The wooden toggle on the line's free end: what the hand takes to haul. */
  readonly toggle: Mesh;
  private readonly dots: InstancedMesh;
  private readonly puffs: Points;
  /**
   * The depth post: how the work in hand stands. It stands just beyond the stake being worked, facing the keeper: a
   * column that fills from red through amber to green (the stake going in, then the line coming taut). The moment to
   * strike is said by the lamp on the driver itself: red low, amber rising, green once a full blow is in it.
   */
  readonly meter = new Group();
  private readonly column: Mesh;
  private readonly lamp: Mesh;
  private lampOn = false;
  private readonly puffAt = new Float32Array(36 * 3);
  private readonly puffGo = new Float32Array(36 * 3);
  private puffLife = 0;
  readonly handles = { left: new Group() as Object3D, right: new Group() as Object3D };
  /** One marker per hole of the stage, to point at. */
  readonly marks: Group[] = [];
  private readonly shafts: InstancedMesh;
  private readonly pieces: InstancedMesh;
  private readonly rags: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly tail: Mesh;
  /** Each stake's place on the ground, and how far it still has to go down. */
  private readonly posts: { at: Vector3; left: number }[] = [];
  private readonly spans: { a: number; b: number; slack: number; firm: boolean }[] = [];
  private lit = 0;
  private time = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly p2 = new Vector3();
  private readonly s = new Vector3();
  private readonly along = new Vector3();
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.45);
  private readonly bright = new Color();
  private readonly dull = new Color();

  constructor(
    add: Adder,
    private readonly look: FenceLook,
    /** A modelled stake to draw instead of the plain one (top at its origin, running down), and a wood for the sledge. */
    parts: { stake?: { geometry: BufferGeometry; material: Material } | null; driver?: Group | null } = {},
  ) {
    const lit = look.glow > 0 ? { emissive: look.stake, emissiveIntensity: look.glow } : {};
    const shaft = new CylinderGeometry(0.035, 0.03, STAKE_LONG, 10);
    shaft.translate(0, -STAKE_LONG / 2, 0);
    this.shafts = add(new InstancedMesh(parts.stake?.geometry ?? shaft, parts.stake?.material ?? new MeshStandardMaterial({ color: look.stake, roughness: 0.75, ...lit }), MOST_POSTS));
    const piece = new CylinderGeometry(0.012, 0.012, 1, 7);
    piece.translate(0, 0.5, 0);
    this.pieces = add(new InstancedMesh(piece, new MeshStandardMaterial({ color: look.line, roughness: 0.8, ...(look.glow > 0 ? { emissive: look.line, emissiveIntensity: look.glow } : {}) }), MOST_SPANS * PIECES));
    // A rag: a torn pennant, wide where it is tied and coming to a point (no two the same size: see redrawSpans).
    const rag = new BufferGeometry();
    rag.setAttribute('position', new BufferAttribute(new Float32Array([-0.075, 0, 0, 0.075, 0, 0, 0.02, -0.34, 0, -0.075, 0, 0, 0.02, -0.34, 0, -0.05, -0.2, 0]), 3));
    rag.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    rag.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 0.6, 0, 0, 1, 0.6, 0, 0.2, 0.4]), 2));
    this.rags = add(new InstancedMesh(rag, new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: DoubleSide, emissive: look.rag, emissiveIntensity: look.glow > 0 ? 0.6 : 0.12 }), MOST_SPANS * (PIECES - 1)));
    this.lamps = add(new InstancedMesh(new SphereGeometry(0.07, 10, 8), new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }), MOST_POSTS));
    for (const mesh of [this.shafts, this.pieces, this.rags, this.lamps]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.pointerEvents = 'none';
    }
    this.shafts.name = 'FenceStakes';
    this.pieces.name = 'FenceLine';
    this.rags.name = 'FenceRags';
    const end = new CylinderGeometry(0.017, 0.017, 1, 7);
    end.translate(0, 0.5, 0);
    this.tail = add(new Mesh(end, new MeshStandardMaterial({ color: look.glow > 0 ? look.line : 0xc9b48a, roughness: 0.8, emissive: look.glow > 0 ? look.line : 0x6a5a3a, emissiveIntensity: look.glow > 0 ? look.glow : 0.35 })));
    this.tail.name = 'FenceLineEnd';
    this.tail.visible = false;
    this.tail.pointerEvents = 'none';
    // The driver: an iron tube that goes over the stake, a cap, and a handle out to each side.
    const iron = new MeshStandardMaterial({ color: look.iron, roughness: 0.45, metalness: 0.55, ...(look.glow > 0 ? { emissive: look.iron, emissiveIntensity: 0.3 } : {}) });
    if (parts.driver != null) this.driver.add(parts.driver);
    else driverShape(this.driver, iron, new MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.8 }));
    for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
      this.handles[side].name = `DriverHandle ${side}`;
      this.handles[side].position.set(sign * HANDLE.side, HANDLE.up, 0);
      this.driver.add(this.handles[side]);
    }
    // The depth post (its own +z faces the keeper): a pole of the stakes' wood, a dark board, the column, the mark, the lamp.
    const wood = parts.stake?.material ?? new MeshStandardMaterial({ color: look.stake, roughness: 0.75, ...lit });
    const pole = new Mesh(new CylinderGeometry(0.02, 0.03, METER.lamp, 8), wood);
    pole.position.y = METER.lamp / 2;
    // The board is of the same wood (one draw with the pole); the column's own light reads against it by lantern light.
    const board = new Mesh(new BoxGeometry(METER.wide + 0.05, METER.tall + 0.07, 0.024), wood);
    board.position.set(0, METER.foot + METER.tall / 2, 0.03);
    const frame = new Group();
    frame.add(pole, board);
    mergeByMaterial(frame);
    const fill = new PlaneGeometry(METER.wide, METER.tall);
    fill.translate(0, METER.tall / 2, 0);
    this.column = new Mesh(fill, new MeshBasicMaterial({ color: 0xd9342b, toneMapped: false, fog: false }));
    this.column.position.set(0, METER.foot, 0.044);
    this.lamp = new Mesh(new SphereGeometry(0.05, 14, 10), new MeshBasicMaterial({ color: LAMP_OFF, toneMapped: false, fog: false }));
    this.lamp.position.y = 0.19;
    this.lamp.name = 'DriverLamp';
    this.driver.add(this.lamp);
    this.meter.add(frame, this.column);
    this.meter.name = 'DepthPost';
    this.meter.visible = false;
    this.meter.traverse((o) => {
      o.pointerEvents = 'none';
    });
    add(this.meter);
    this.gauge(0, false);
    this.driver.name = 'StakeDriver';
    this.driver.visible = false;
    this.driver.traverse((o) => {
      o.pointerEvents = 'none';
    });
    add(this.driver);
    // The driver's ghost: the same shape in pale light, lifting and slamming by itself to show the move.
    const pale = new MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.34, depthWrite: false, fog: false });
    if (parts.driver != null) {
      const shade = parts.driver.clone(true);
      shade.traverse((o) => {
        if ((o as Mesh).isMesh === true) (o as Mesh).material = pale;
      });
      this.ghost.add(shade);
    } else driverShape(this.ghost, pale, pale);
    this.ghost.name = 'DriverGhost';
    this.ghost.visible = false;
    this.ghost.traverse((o) => {
      o.pointerEvents = 'none';
    });
    add(this.ghost);
    // A light that runs along the line's free end the way it is to be pulled.
    this.bead = add(new Mesh(new SphereGeometry(0.035, 10, 8), new MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })));
    this.bead.name = 'LinePullBead';
    this.bead.visible = false;
    this.bead.pointerEvents = 'none';
    const peg = new CylinderGeometry(0.02, 0.02, 0.17, 8);
    peg.rotateZ(Math.PI / 2);
    this.toggle = add(new Mesh(peg, parts.stake?.material ?? new MeshStandardMaterial({ color: look.stake, roughness: 0.7, ...lit })));
    this.toggle.name = 'LineToggle';
    this.toggle.visible = false;
    this.toggle.pointerEvents = 'none';
    // The ring to be closed, as dots on the ground from hole to hole.
    const dot = new CircleGeometry(0.05, 8);
    dot.rotateX(-Math.PI / 2);
    this.dots = add(new InstancedMesh(dot, new MeshBasicMaterial({ color: look.glow > 0 ? 0xffe08a : 0xbcd0ff, transparent: true, opacity: 0.6, depthWrite: false, fog: false }), 160));
    this.dots.name = 'RingPlan';
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.pointerEvents = 'none';
    // What a blow throws up from the foot of the stake.
    const flecks = new BufferGeometry();
    flecks.setAttribute('position', new BufferAttribute(this.puffAt, 3));
    this.puffs = add(new Points(flecks, new PointsMaterial({ color: look.glow > 0 ? 0xffe9a8 : 0xeef3ff, size: 0.03, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false })));
    this.puffs.name = 'BlowPuff';
    this.puffs.frustumCulled = false;
    this.puffs.pointerEvents = 'none';
    for (let i = 0; i < MOST_POSTS; i += 1) {
      const mark = add(new Group());
      mark.name = `Hole ${i}`;
      mark.visible = false;
      this.marks.push(mark);
    }
  }

  /** A new ring: nothing standing. */
  reset(): void {
    this.posts.length = 0;
    this.spans.length = 0;
    this.lit = 0;
    this.tail.visible = false;
    this.driver.visible = false;
    this.meter.visible = false;
    this.redrawPosts();
    this.redrawSpans();
  }

  /** Stand a stake loosely in a hole (`ground` is the hole's place); returns its number. */
  stand(ground: Vector3, firm = false): number {
    this.posts.push({ at: ground.clone(), left: firm ? 0 : DRIVE.depth });
    this.redrawPosts();
    return this.posts.length - 1;
  }

  /** Sink stake `i` by `by`; returns what it still has to go. */
  sink(i: number, by: number): number {
    const post = this.posts[i];
    post.left = Math.max(0, post.left - by);
    this.redrawPosts();
    return post.left;
  }

  /** The top of stake `i` (world). */
  top(i: number, out: Vector3): Vector3 {
    const post = this.posts[i];
    return out.copy(post.at).setY(post.at.y + LINE.height + post.left);
  }

  /** Draw span `k` from stake `a` to stake `b` with this much slack. */
  span(k: number, a: number, b: number, slack: number, firm = false): void {
    this.spans[k] = { a, b, slack, firm };
    this.redrawSpans();
  }

  /** The line's free end, from stake `i`'s notch to `to` (hidden with null). */
  end(i: number, to: Vector3 | null): void {
    this.tail.visible = to != null;
    if (to == null) return;
    this.top(i, this.p);
    this.along.copy(to).sub(this.p);
    const long = this.along.length();
    if (long < 1e-4) return;
    this.tail.position.copy(this.p);
    this.tail.quaternion.setFromUnitVectors(UP, this.along.multiplyScalar(1 / long));
    this.tail.scale.set(1, long, 1);
  }

  /** How many of the stakes' lamps are lit (they light one by one once the ring holds). */
  light(count: number): void {
    this.lit = count;
    this.redrawPosts();
  }

  /** Every frame: the rags stir, more on a line that stands clear; a blow's snow flies and settles. */
  update(delta: number): void {
    this.time += delta;
    if (this.spans.length > 0) this.redrawSpans();
    if (this.puffLife > 0) {
      this.puffLife = Math.max(0, this.puffLife - delta);
      for (let k = 0; k < this.puffAt.length; k += 3) {
        this.puffGo[k + 1] -= 3.2 * delta;
        this.puffAt[k] += this.puffGo[k] * delta;
        this.puffAt[k + 1] += this.puffGo[k + 1] * delta;
        this.puffAt[k + 2] += this.puffGo[k + 2] * delta;
      }
      this.puffs.geometry.getAttribute('position').needsUpdate = true;
      (this.puffs.material as PointsMaterial).opacity = Math.min(1, this.puffLife * 2.5);
    }
  }

  /** Stand the depth post by the hole being worked: just beyond it from the seat (whose heading is `yaw`), a little to the keeper's right. */
  meterAt(hole: Vector3, yaw: number): void {
    this.meter.position.set(hole.x - Math.sin(yaw) * METER.beyond + Math.cos(yaw) * METER.aside, hole.y, hole.z - Math.cos(yaw) * METER.beyond - Math.sin(yaw) * METER.aside);
    this.meter.rotation.y = yaw;
    this.meter.visible = true;
  }

  /** The column: `done` (0..1) of the work in hand, red through amber to green; full and bright green once it is `firm`. */
  gauge(done: number, firm: boolean): void {
    const k = firm ? 1 : Math.max(0, Math.min(1, done));
    this.column.scale.y = Math.max(0.03, k);
    const colour = (this.column.material as MeshBasicMaterial).color;
    if (firm) colour.setHex(0x35d06a);
    else if (k < 0.6) colour.setHex(0xd9342b).lerp(this.bright.setHex(0xffb040), k / 0.6);
    else colour.setHex(0xffb040).lerp(this.bright.setHex(0x8fd04a), (k - 0.6) / 0.4);
  }

  /**
   * The lamp on the driver: `lift` (0..1) of the height a full blow needs, red through amber; green and larger when `on`
   * (a full blow is in it: strike now). True as it comes green.
   */
  ready(on: boolean, lift = 0): boolean {
    const came = on && !this.lampOn;
    this.lampOn = on;
    const colour = (this.lamp.material as MeshBasicMaterial).color;
    if (on) colour.setHex(0x4cff8a);
    else if (lift <= 0.02) colour.setHex(LAMP_OFF);
    else colour.setHex(0xd9342b).lerp(this.bright.setHex(0xffb040), Math.min(1, lift));
    this.lamp.scale.setScalar(on ? 1.5 : 1);
    return came;
  }

  /** The lamp itself (for the ring that says: this is the thing to watch). */
  get lampMark(): Object3D {
    return this.lamp;
  }

  /** A blow lands: snow (or gold dust) bursts from the foot of the stake, more for a harder blow. */
  puff(at: Vector3, strength: number): void {
    for (let k = 0; k < this.puffAt.length; k += 3) {
      const a = Math.random() * Math.PI * 2;
      const out = (0.35 + Math.random() * 0.9) * (0.4 + 0.6 * strength);
      this.puffAt[k] = at.x + Math.cos(a) * 0.05;
      this.puffAt[k + 1] = at.y + 0.02;
      this.puffAt[k + 2] = at.z + Math.sin(a) * 0.05;
      this.puffGo[k] = Math.cos(a) * out;
      this.puffGo[k + 1] = (0.8 + Math.random() * 1.2) * (0.4 + 0.6 * strength);
      this.puffGo[k + 2] = Math.sin(a) * out;
    }
    this.puffLife = 0.6;
  }

  /** The ring to be closed, dotted on the ground through these places in order (null: no plan shown). */
  plan(places: readonly Vector3[] | null): void {
    let n = 0;
    if (places != null) {
      for (let i = 0; i < places.length; i += 1) {
        const a = places[i];
        const b = places[(i + 1) % places.length];
        const steps = Math.max(1, Math.round(a.distanceTo(b) / 0.42));
        for (let k = 1; k < steps && n < 160; k += 1) {
          this.p.copy(a).lerp(b, k / steps);
          this.m.makeTranslation(this.p.x, this.p.y + 0.015, this.p.z);
          this.dots.setMatrixAt(n, this.m);
          n += 1;
        }
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
  }

  private redrawPosts(): void {
    this.posts.forEach((_post, i) => {
      this.top(i, this.p);
      this.m.makeTranslation(this.p.x, this.p.y, this.p.z);
      this.shafts.setMatrixAt(i, this.m);
      this.m.makeTranslation(this.p.x, this.p.y + 0.09, this.p.z);
      this.lamps.setMatrixAt(i, this.m);
    });
    this.shafts.count = this.posts.length;
    this.lamps.count = Math.min(this.lit, this.posts.length);
    this.shafts.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
  }

  private redrawSpans(): void {
    let pieces = 0;
    let rags = 0;
    const bright = this.bright.setHex(this.look.rag);
    const dull = this.dull.setHex(this.look.rag).multiplyScalar(0.45);
    this.spans.forEach((span, k) => {
      const a = this.posts[span.a];
      const b = this.posts[span.b];
      if (a == null || b == null) return;
      const distance = Math.hypot(b.at.x - a.at.x, b.at.z - a.at.z);
      const clear = holds(distance, span.slack);
      const at = (t: number, out: Vector3): Vector3 => out.copy(a.at).lerp(b.at, t).setY(a.at.y + (b.at.y - a.at.y) * t + lineHeight(distance, span.slack, t) + (t === 0 ? a.left : t === 1 ? b.left : 0));
      for (let n = 0; n < PIECES; n += 1) {
        at(n / PIECES, this.p);
        at((n + 1) / PIECES, this.p2);
        this.along.copy(this.p2).sub(this.p);
        const long = this.along.length();
        this.q.setFromUnitVectors(UP, this.along.multiplyScalar(1 / Math.max(long, 1e-5)));
        this.m.compose(this.p, this.q, this.s.set(1, long, 1));
        this.pieces.setMatrixAt(pieces, this.m);
        pieces += 1;
        if (n === 0) continue;
        // A rag at every joint: hanging and stirring where the line is clear of the snow, lying flat where it is not.
        const high = this.p.y - a.at.y;
        const lying = high < 0.2;
        const stir = clear ? 0.5 * Math.sin(this.time * 5 + n * 1.3 + k) : 0.08 * Math.sin(this.time * 2 + n);
        this.q.setFromAxisAngle(UP, Math.atan2(b.at.x - a.at.x, b.at.z - a.at.z) + Math.PI / 2 + stir);
        if (lying) this.q.multiply(this.flat);
        this.m.compose(this.p, this.q, this.s.set(0.75 + 0.5 * ((n * 7 + k * 3) % 5) / 4, 0.7 + 0.6 * ((n * 5 + k) % 4) / 3, 1));
        this.rags.setMatrixAt(rags, this.m);
        this.rags.setColorAt(rags, clear ? bright : dull);
        rags += 1;
      }
    });
    this.pieces.count = pieces;
    this.rags.count = rags;
    this.pieces.instanceMatrix.needsUpdate = true;
    this.rags.instanceMatrix.needsUpdate = true;
    if (this.rags.instanceColor != null) this.rags.instanceColor.needsUpdate = true;
  }
}

/** The driver's shape: a tube that goes over the stake, a cap, an arm and a ring grip out to each side. */
function driverShape(into: Group, iron: MeshStandardMaterial | MeshBasicMaterial, leather: MeshStandardMaterial | MeshBasicMaterial): void {
  const tube = new Mesh(new CylinderGeometry(0.06, 0.06, 0.34, 14), iron);
  tube.position.y = -0.1;
  const cap = new Mesh(new CylinderGeometry(0.075, 0.075, 0.05, 14), iron);
  cap.position.y = 0.09;
  into.add(tube, cap);
  for (const sign of [-1, 1]) {
    const arm = new Mesh(new CylinderGeometry(0.016, 0.016, HANDLE.side - 0.05, 8), iron);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(sign * (HANDLE.side / 2 + 0.02), HANDLE.up, 0);
    const grip = new Mesh(new TorusGeometry(0.045, 0.014, 8, 16), leather);
    grip.rotation.y = Math.PI / 2;
    grip.position.set(sign * HANDLE.side, HANDLE.up, 0);
    into.add(arm, grip);
  }
}

/** The keeper's seat, carried from hole to hole: a sledge's bench, the coil of line, a lantern on a pole. */
export function buildSledge(look: FenceLook, timber: Material | null = null, kit: { sledge: Object3D | null; coil: Object3D | null } | null = null): { sledge: Group; lantern: PointLight; coil: Object3D } {
  const sledge = new Group();
  sledge.name = 'KeeperSledge';
  if (kit?.sledge != null) {
    // The modelled sledge: its own lantern pole (a point named 'lantern' for the light), its shelf for the coil.
    sledge.add(kit.sledge);
    const lamp = new PointLight(0xffb060, 9, 14, 1.5);
    const at = kit.sledge.getObjectByName('lantern');
    lamp.position.copy(at?.position ?? new Vector3(0.5, 1.72, 0.75));
    lamp.position.z -= 0.15;
    // The sledge's iron and the lantern's tin share a material: one draw.
    mergeByMaterial(kit.sledge);
    const rope = kit.coil ?? new Group();
    rope.position.set(-0.52, 0.535, 0);
    sledge.add(lamp, rope);
    sledge.traverse((o) => {
      o.pointerEvents = 'none';
    });
    return { sledge, lantern: lamp, coil: rope };
  }
  const wood = timber ?? new MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.85 });
  const fur = new MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 });
  for (const side of [-1, 1]) {
    const runner = new Mesh(new BoxGeometry(0.07, 0.07, 1.5), wood);
    runner.position.set(side * 0.34, 0.035, 0.35);
    const post = new Mesh(new BoxGeometry(0.06, 0.5, 0.06), wood);
    post.position.set(side * 0.34, 0.3, 0.55);
    sledge.add(runner, post);
  }
  const bench = new Mesh(new BoxGeometry(0.8, 0.07, 0.7), wood);
  bench.position.set(0, 0.55, 0.2);
  const pelt = new Mesh(new BoxGeometry(0.72, 0.05, 0.6), fur);
  pelt.position.set(0, 0.61, 0.2);
  // A shelf at the keeper's left knee for the coil; the front is open, so the hole and its stake are clear.
  const deck = new Mesh(new BoxGeometry(0.3, 0.04, 0.5), wood);
  deck.position.set(-0.52, 0.5, 0.05);
  // The coil of line with its rags, on the deck by the keeper's knee; it thins as the line is paid out.
  const coil = new Mesh(new TorusGeometry(0.16, 0.06, 8, 20), new MeshStandardMaterial({ color: look.line, roughness: 0.85, ...(look.glow > 0 ? { emissive: look.line, emissiveIntensity: look.glow } : {}) }));
  coil.name = 'LineCoil';
  coil.rotation.x = Math.PI / 2;
  coil.position.set(-0.52, 0.58, 0.02);
  // The lantern: on a pole behind the keeper's right shoulder, so the stake and the hands are lit and the lamp itself is out of the eyes.
  const pole = new Mesh(new CylinderGeometry(0.015, 0.02, 1.7, 8), wood);
  pole.position.set(0.5, 0.85, 0.75);
  const glass = new Mesh(new SphereGeometry(0.07, 12, 8), new MeshBasicMaterial({ color: 0xffc070, toneMapped: false, fog: false }));
  glass.position.set(0.5, 1.72, 0.75);
  const lantern = new PointLight(0xffb060, 9, 14, 1.5);
  lantern.position.set(0.45, 1.7, 0.6);
  // The sledge's timber and its pelt, each one draw.
  const frame = new Group();
  for (const part of [...sledge.children]) frame.add(part);
  frame.add(bench, pelt, deck, pole);
  mergeByMaterial(frame);
  sledge.add(frame, coil, glass, lantern);
  sledge.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { sledge, lantern, coil };
}

export type Loss = 'open' | 'strayed' | 'rope out' | 'slack' | 'left out';

/** What the stage's world is told as the ring is built. */
export interface RingState {
  ring: Ring;
  /** Seconds the stage's clock has run (it waits for the rehearsal). */
  clock: number;
  running: boolean;
  /** The spans tied so far, as the herd and the wolves meet them. */
  fenced: Fenced[];
  /** The hole the keeper sits at. */
  at: number;
}

export interface RingPlay {
  stage: ValleyStage;
  /** The world place of the stage's own (0, 0), on the ground. */
  origin: Vector3;
  /** The first stake and the first span are a rehearsal: the clock waits, and the knot never bites on a slack line. */
  patient: boolean;
  hint: boolean;
  paused: () => boolean;
  /** The sledge, set at each new seat. */
  seat(eye: Vector3, yaw: number, hole: number): void;
  /** Every frame of play: the stage's own world; a loss it finds ends the stage. */
  tick(delta: number, state: RingState): Loss | null;
  /** What the player is to do now, each time it changes (the goal plate): drive this stake, haul this span, pick a hole. */
  phase?(kind: 'drive' | 'haul' | 'pick', staked: number, closing: boolean): void;
  /** Where the herd stands now, if it moves (the judge's inside and outside). */
  herd?: () => readonly Spot[];
  /** Whether the ring to be closed is dotted on the ground (not where choosing the ring is the stage). */
  plan: boolean;
  /** A glow shown at the hinted hole. */
  hintGlow: Object3D | null;
  /** The start of the log lines ('valley', 'wolves'). */
  tag: string;
}

export type Outcome = { won: true; ring: Ring; clock: number } | { won: false; reason: Loss; ring: Ring; verdict: Verdict | null; clock: number };

const toWorld = (origin: Vector3, spot: Spot, out: Vector3): Vector3 => out.set(origin.x + spot.x, origin.y, origin.z + spot.z);

/** Come from another stake, the seat is turned this far (radians) from the ring's middle toward the side still open, so the next hole lies within an easy look. */
const SEAT_TURN = 0.35;

/**
 * The seat by a hole: the eye, and the heading. It faces the middle of the
 * ring; come from stake `from`, it is turned a little away from that stake,
 * toward the holes still to do (the herd stays in view on the other side).
 * The hole is always SEAT.back straight ahead of the eye.
 */
export function seatAt(origin: Vector3, hole: Spot, eye: Vector3, from: Spot | null = null): number {
  let yaw = Math.atan2(hole.x, hole.z);
  if (from != null) {
    // Where the stake come from lies, to the seat's right (+) or left (-).
    const right = (from.x - hole.x) * Math.cos(yaw) - (from.z - hole.z) * Math.sin(yaw);
    yaw += SEAT_TURN * (right >= 0 ? 1 : -1);
  }
  eye.set(origin.x + hole.x + Math.sin(yaw) * SEAT.back, origin.y + SEAT.eye, origin.z + hole.z + Math.cos(yaw) * SEAT.back);
  return yaw;
}

function nearSegment(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/**
 * One ring, from the first stake to the knot that closes it (or the loss
 * that ends it). The player starts seated at the answer's first hole with a
 * stake standing in it.
 */
export async function playRing(d: DirectorSystem, fence: Fence, play: RingPlay): Promise<Outcome> {
  const { stage, origin, tag } = play;
  const ring = newRing();
  // The clock waits for the keeper's first blow (or three seconds): nobody loses time finding the driver. In the rehearsal it waits for the first span.
  const state: RingState = { ring, clock: 0, running: false, fenced: [], at: stage.answer[0] };
  let waited = 0;
  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  const eye = new Vector3();
  const ground = new Vector3();
  const top = new Vector3();
  const tailTo = new Vector3();
  const drive: DeskDrive = { y: 0, along: 0, closed: false };
  let lost: Loss | null = null;
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  const over = (): boolean => lost != null || skipped;
  fence.reset();
  stage.holes.forEach((hole, i) => {
    toWorld(origin, hole, fence.marks[i].position).y += 0.55;
    fence.marks[i].visible = true;
  });
  for (let i = stage.holes.length; i < fence.marks.length; i += 1) fence.marks[i].visible = false;
  fence.plan(play.plan ? stage.answer.map((i) => toWorld(origin, stage.holes[i], new Vector3())) : null);
  const world = d.each((delta) => {
    if (play.paused()) return;
    fence.update(delta);
    if (lost != null) return;
    waited += delta;
    if (!play.patient && !state.running && waited >= 3) state.running = true;
    if (state.running) state.clock += delta;
    lost = play.tick(delta, state);
  });
  const finish = (outcome: Outcome): Outcome => {
    world();
    setV2Targets([]);
    setDeskMode('one');
    fence.end(0, null);
    fence.driver.visible = false;
    fence.ghost.visible = false;
    fence.bead.visible = false;
    fence.toggle.visible = false;
    fence.meter.visible = false;
    setDeskDrive(null);
    if (play.hintGlow != null) play.hintGlow.visible = false;
    if (import.meta.env.DEV) console.info(`[${tag}] ${stage.name}: ${outcome.won ? 'held' : `lost (${outcome.reason})`} at ${state.clock.toFixed(1)} s, stakes ${ring.order.join(' ')}`);
    return outcome;
  };
  const lose = (reason: Loss, verdict: Verdict | null = null): Outcome => finish({ won: false, reason, ring, verdict, clock: state.clock });

  let hole = stage.answer[0];
  let first = true;
  for (;;) {
    // To the seat by the hole (the first is where the stage begins).
    const closing = !first && hole === ring.order[0];
    const line = payOut(stage, ring, hole);
    // At the first stake too the seat is turned toward the ring's next hole (away from the one on its other side): the hole to go to lies within an easy look.
    let yaw = seatAt(origin, stage.holes[hole], eye, stage.holes[ring.order.length > 0 ? ring.order[ring.order.length - 1] : stage.answer[stage.answer.length - 1]]);
    if (first) {
      // Begun again at the hole the keeper already sits by (a stage lost at its closing stake): the seat keeps its heading, so nothing turns.
      const now = d.player.rotation.y;
      const off = Math.atan2(Math.sin(now - yaw), Math.cos(now - yaw));
      if (d.eyeAt.distanceTo(eye) < 0.9 && Math.abs(off) < 0.7) {
        yaw = now;
        eye.set(origin.x + stage.holes[hole].x + Math.sin(yaw) * SEAT.back, origin.y + SEAT.eye, origin.z + stage.holes[hole].z + Math.cos(yaw) * SEAT.back);
      }
      d.rig.place(eye, yaw);
    }
    else {
      arm();
      await d.rig.move(eye, yaw);
    }
    play.seat(eye, yaw, hole);
    state.at = hole;
    if (over()) break;
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    // The depth post stands to the keeper's right at every hole: the goal plate rests low to the left.
    fence.meterAt(toWorld(origin, stage.holes[hole], ground), yaw);
    fence.gauge(0, false);
    fence.ready(false);
    let post = closing ? 0 : -1;
    if (!closing) {
      // The stake: both hands on the driver, lifted and slammed down until the post's column is full and green.
      post = fence.stand(toWorld(origin, stage.holes[hole], ground));
      play.phase?.('drive', ring.order.length, false);
      const driver = newDriver();
      let left: number = DRIVE.depth;
      let held = false;
      let logAt = 0;
      // The ghost shows the move until a real blow has landed: in the rehearsal, and whenever a hint is owed.
      let shown = (play.patient && ring.order.length === 0) || play.hint;
      fence.ghost.rotation.y = yaw;
      fence.driver.visible = true;
      fence.driver.rotation.y = yaw;
      fence.driver.position.copy(fence.top(post, top));
      setDeskMode('slam');
      setV2Targets([fence.handles.left, fence.handles.right]);
      const grip = new Vector3();
      // With the mouse (the desktop emulator) the keeper lifts the driver by himself, again and again; a click lets it fall.
      // The lamp on it is the whole instruction: click while it is green.
      const rehearsal = play.patient && ring.order.length === 0;
      // Dev: ?hold=30 keeps the driver at the top that many seconds (a test's clicks are slow).
      const holdFor = Number(devParam('hold') ?? 0);
      const lifted = { lift: 0, t: 0, from: 0, phase: 'rise' as 'rise' | 'top' | 'tire' | 'fall' | 'rest', clicks: deskClicks(), ringed: true };
      let idle = 0;
      let shownOnce = shown;
      const stop = d.each((delta) => {
        if (play.paused() || left <= 0) return;
        readHands(d, hands);
        fence.top(post, top);
        const mouse = import.meta.env.DEV && deskPlaying();
        let sunk = 0;
        if (mouse) {
          if (!held) {
            held = true;
            setV2Targets(lifted.ringed ? [fence.lampMark] : []);
          }
          if (deskClicks() !== lifted.clicks) {
            lifted.clicks = deskClicks();
            if (lifted.phase !== 'fall' && lifted.phase !== 'rest') {
              lifted.from = lifted.lift;
              lifted.phase = 'fall';
              if (import.meta.env.DEV) console.info(`[${tag}] click: lamp ${lifted.from >= LIFT.green ? 'green' : lifted.from >= LIFT.green / 2 ? 'amber' : 'red'} (lifted ${(lifted.from * 100).toFixed(0)}%)`);
            } else if (lifted.phase === 'rest') {
              // No click goes unanswered: with the driver still down on the stake it only knocks.
              d.sounds.play('sandbag_drop', 0.2, 1.6);
              if (import.meta.env.DEV) console.info(`[${tag}] click: the driver is down (too soon)`);
            }
          }
          if (lifted.phase === 'rise') {
            lifted.lift = Math.min(1, lifted.lift + delta / LIFT.rise);
            if (lifted.lift >= 1) {
              lifted.phase = 'top';
              lifted.t = 0;
            }
          } else if (lifted.phase === 'top') {
            // In the rehearsal the driver waits at the top: the first blow cannot be mistimed.
            lifted.t += delta;
            if (!rehearsal && lifted.t > (holdFor > 0 ? holdFor : play.hint ? LIFT.hold * 1.8 : LIFT.hold)) lifted.phase = 'tire';
          } else if (lifted.phase === 'tire') {
            lifted.lift = Math.max(LIFT.tired, lifted.lift - delta * LIFT.sink);
            if (lifted.lift <= LIFT.tired) lifted.phase = 'rise';
          } else if (lifted.phase === 'fall') {
            lifted.lift = Math.max(0, lifted.lift - delta / LIFT.fall);
            if (lifted.lift <= 0) {
              const strength = lifted.from >= LIFT.green ? 1 : lifted.from / LIFT.green;
              sunk = strength < DRIVE.bounce ? 0 : (DRIVE.fullBlow * strength) / stage.ground;
              if (sunk === 0) {
                d.sounds.play('sandbag_drop', 0.3, 1.3);
                if (import.meta.env.DEV) console.info(`[${tag}] too low: the blow bounces`);
              }
              lifted.phase = 'rest';
              lifted.t = 0;
            }
          } else {
            lifted.t += delta;
            if (lifted.t > LIFT.rest) lifted.phase = 'rise';
          }
          drive.y = top.y + HANDLE.up + lifted.lift * LIFT.high;
          setDeskDrive(drive);
        } else {
          setDeskDrive(null);
          if (!held) {
            // Each hand on its own handle (or both pinching close by: a tracked hand's pinch point is in front of the palm).
            let both = true;
            for (const side of ['left', 'right'] as const) {
              const reach = hands[side].distanceTo(fence.handles[side].getWorldPosition(grip));
              if (!(hands.pinching[side] && reach <= TAKE)) both = false;
            }
            if (both) {
              held = true;
              setV2Targets([]);
              d.sounds.play('grab_soft', 0.6);
              if (import.meta.env.DEV) console.info(`[${tag}] driver taken at hole ${hole}`);
            }
          } else if (!hands.pinching.left || !hands.pinching.right) {
            held = false;
            setV2Targets([fence.handles.left, fence.handles.right]);
          }
        }
        const height = mouse ? lifted.lift * LIFT.high : (hands.left.y + hands.right.y) / 2 - (top.y + HANDLE.up);
        if (!mouse) sunk = stepDriver(driver, height, held, delta, stage.ground);
        // The lamp on the driver: red low, amber rising, green once a full blow is in it. Strike on green.
        const charge = mouse ? lifted.lift / LIFT.green : height / (DRIVE.fullDrop * 0.85);
        if (fence.ready(held && charge >= 1 && lifted.phase !== 'fall', held ? charge : 0)) d.sounds.play('ear_click', 0.3, 1.5);
        if (sunk > 0) {
          left = fence.sink(post, sunk);
          const strength = Math.min(1, (sunk * stage.ground) / DRIVE.fullBlow);
          d.sounds.play('post_thunk', 0.35 + 0.65 * strength, 0.9 + 0.25 * (1 - left / DRIVE.depth));
          fence.puff(ground, strength);
          fence.gauge(1 - left / DRIVE.depth, left <= 0.0005);
          if (strength >= 0.5) shown = false;
          idle = 0;
          if (lifted.ringed && mouse) {
            lifted.ringed = false;
            setV2Targets([]);
          }
          if (!play.patient) state.running = true;
          if (import.meta.env.DEV) console.info(`[${tag}] blow ${(strength * 100).toFixed(0)}%: ${left.toFixed(3)} m to go`);
          fence.top(post, top);
        }
        fence.driver.position.copy(top).setY(top.y + (held ? Math.max(0, height) : 0));
        // Five seconds with no blow, by hand: the ghost shows the move once more.
        idle += delta;
        if (!mouse && idle > 5 && !shownOnce) {
          shown = true;
          shownOnce = true;
          if (import.meta.env.DEV) console.info(`[${tag}] five seconds with no blow: the ghost shows the move`);
        }
        // Up slowly, down hard, a rest: the ghost's lift and slam.
        const beat = d.now % 1.5;
        const lift = beat < 0.9 ? 0.32 * Math.sin((beat / 0.9) * (Math.PI / 2)) : beat < 1.0 ? 0.32 * (1 - (beat - 0.9) / 0.1) : 0;
        // Only while the driver stands untouched: in the keeper's own hands the ghost would read as a second, broken driver.
        fence.ghost.visible = shown && !held && !mouse;
        fence.ghost.position.copy(top).setY(top.y + lift);
        if (import.meta.env.DEV && held && !mouse && d.now >= logAt) {
          logAt = d.now + 0.5;
          console.info(`[${tag}] driver ${Math.max(0, height).toFixed(2)} m up`);
        }
      });
      arm();
      await d.until(() => left <= 0.0005 || over());
      stop();
      setDeskDrive(null);
      fence.ghost.visible = false;
      if (over()) {
        fence.driver.visible = false;
        break;
      }
      fence.sink(post, 1);
      // Firm: the column full and green, the driver resting on the stake for a breath before it is put away.
      fence.gauge(1, true);
      fence.ready(false);
      fence.driver.position.copy(fence.top(post, top));
      arm();
      await d.wait(0.4);
      fence.driver.visible = false;
      if (over()) break;
      ring.order.push(hole);
      d.sounds.play('ear_click', 0.6);
      if (import.meta.env.DEV) console.info(`[${tag}] stake ${ring.order.length} firm at hole ${hole}, ${state.clock.toFixed(1)} s`);
    }
    if (!first) {
      // The line from the stake before: hauled through this stake's notch, hand over hand, until it twangs.
      if (line == null) return lose('rope out');
      const from = closing ? ring.order.length - 1 : ring.order.length - 2;
      const k = ring.slacks.length;
      const haul: Haul = newHaul(line.distance, line.slack);
      const a = stage.holes[ring.order[from]];
      const b = stage.holes[hole];
      const pull = new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      const holding = { left: false, right: false };
      // A pinch still closed from the driver's handles is not a hand on the line: each hand must open once first.
      const fresh = { left: false, right: false };
      const before = { left: new Vector3(), right: new Vector3() };
      const tailEnd = new Vector3();
      const rest = new Vector3();
      const patient = play.patient && k === 0;
      play.phase?.('haul', ring.order.length, closing);
      // Written by the frame function below: kept wide, or the checks after the wait would be read as never true.
      let result = 'hauling' as 'hauling' | 'taut' | 'left slack';
      let creak = 0;
      let gustIn = stage.gustEvery;
      // With the mouse, a click is one pull: the hand shuts on the line, draws it through, opens and comes back.
      let pullT: number = PULL.closed + PULL.back;
      let pullClicks = deskClicks();
      let pullNext = false;
      setDeskLine(fence.top(post, top), pull);
      setDeskMode('haul');
      // The column now reads the line: empty as it was paid out, full and green when it is taut enough to hold.
      const enough = slackAllowed(haul.distance);
      fence.gauge(0, false);
      fence.ready(false);
      const tailMark = fence.marks[fence.marks.length - 1];
      const stop = d.each((delta) => {
        if (play.paused() || result !== 'hauling') return;
        readHands(d, hands);
        fence.top(post, top);
        tailEnd.copy(top).addScaledVector(pull, TAIL.along).addScaledVector(UP, TAIL.up);
        let pulled = 0;
        let any = false;
        for (const side of ['left', 'right'] as const) {
          const was = holding[side];
          if (!hands.pinching[side]) fresh[side] = true;
          holding[side] = fresh[side] && hands.pinching[side] && (was || nearSegment(hands[side], top, tailEnd) <= TAIL.reach);
          if (holding[side]) {
            any = true;
            if (was) pulled = Math.max(pulled, hands[side].clone().sub(before[side]).dot(pull));
            else {
              d.sounds.play('grab_soft', 0.5);
              if (import.meta.env.DEV) console.info(`[${tag}] line taken by ${side}`);
            }
            tailTo.copy(hands[side]);
          }
          before[side].copy(hands[side]);
        }
        const mouse = import.meta.env.DEV && deskPlaying();
        let pulling = false;
        if (mouse) {
          if (deskClicks() !== pullClicks) {
            pullClicks = deskClicks();
            if (pullT >= PULL.closed + PULL.back) {
              pullT = 0;
              if (import.meta.env.DEV) console.info(`[${tag}] click: a pull`);
            } else pullNext = true;
          } else if (pullNext && pullT >= PULL.closed + PULL.back) {
            // A click that came in the middle of a pull is the next pull.
            pullNext = false;
            pullT = 0;
            if (import.meta.env.DEV) console.info(`[${tag}] click: a pull (asked during the last)`);
          }
          pulling = pullT < PULL.closed;
          drive.along = pulling ? pullT / PULL.closed : Math.max(0, 1 - (pullT - PULL.closed) / PULL.back);
          drive.closed = pulling;
          setDeskDrive(drive);
          if (pulling) {
            any = true;
            pulled = Math.max(pulled, (PULL.takes * Math.min(delta, PULL.closed - pullT)) / PULL.closed);
            tailTo.copy(hands.right);
          }
          pullT = Math.min(PULL.closed + PULL.back, pullT + delta);
        } else setDeskDrive(null);
        // The wind: a gust takes line back unless both hands are on it.
        gustIn -= delta;
        if (stage.gust > 0 && haul.touched && gustIn <= 0) {
          gustIn = stage.gustEvery * (0.7 + Math.random() * 0.6);
          const took = gustHaul(haul, pulling ? 2 : (holding.left ? 1 : 0) + (holding.right ? 1 : 0), stage.gust);
          d.sounds.play('wind_gust', 0.3 + (took > 0 ? 0.3 : 0), 0.9 + Math.random() * 0.3);
          if (import.meta.env.DEV && took > 0) console.info(`[${tag}] a gust takes ${took.toFixed(2)} m back`);
        }
        // With the mouse the hand never leaves the line between pulls: the knot is tied only when the line is taut.
        result = stepHaul(haul, pulled, any || mouse, delta, patient);
        fence.gauge(1 - (haul.slack - enough) / Math.max(1e-3, haul.from - enough), result === 'taut');
        if (fence.ready(result === 'taut')) d.sounds.play('ear_click', 0.3, 1.5);
        // Until the line has been taken once, a light runs along it the way it is pulled (the rehearsal, and a hint).
        fence.bead.visible = (patient || play.hint) && !haul.touched;
        fence.bead.position.copy(top).addScaledVector(pull, 0.12 + 0.5 * (d.now % 1)).addScaledVector(UP, 0.05);
        creak -= delta;
        if (pulled > 0.002 && creak <= 0) {
          d.sounds.play('rope_creak', 0.45, 0.9 + Math.random() * 0.3);
          creak = 0.7;
          if (import.meta.env.DEV) console.info(`[${tag}] hauling: ${haul.slack.toFixed(2)} m slack`);
        }
        fence.span(k, from, post, haul.slack);
        // The free end: in the hand that has it, else lying toward the coil.
        rest.copy(top).addScaledVector(pull, 0.3).addScaledVector(right, 0).setY(top.y - 0.25);
        tailMark.position.copy(top).addScaledVector(pull, 0.22).addScaledVector(UP, 0.04);
        // The line ends in its toggle: in the hand that has it, else hanging by the stake where it is taken.
        fence.end(post, any ? tailTo : tailMark.position);
        fence.toggle.visible = true;
        fence.toggle.position.copy(any ? tailTo : tailMark.position);
        fence.toggle.rotation.y = yaw;
      });
      tailMark.position.copy(fence.top(post, top)).addScaledVector(pull, 0.22).addScaledVector(UP, 0.04);
      tailMark.updateMatrixWorld(true);
      tailMark.visible = true;
      tailMark.name = 'LineEnd';
      setV2Targets([tailMark]);
      arm();
      await d.until(() => result !== 'hauling' || over());
      stop();
      setDeskDrive(null);
      tailMark.visible = false;
      fence.toggle.visible = false;
      fence.bead.visible = false;
      setV2Targets([]);
      fence.end(post, null);
      if (over()) break;
      ring.slacks.push(haul.slack);
      fence.span(k, from, post, haul.slack, true);
      state.fenced.push({ a, b, holds: result === 'taut' });
      if (result === 'taut') {
        d.sounds.play('net_twang', 0.7, 1.5);
        // The lamps of the stakes the line now joins come on: the ring's progress, read at a glance from any seat.
        fence.light(closing ? ring.order.length : k + 2);
        d.sounds.play('ear_click', 0.6, 1 + 0.08 * k);
      } else d.sounds.play('sandbag_drop', 0.5);
      if (import.meta.env.DEV) console.info(`[${tag}] span ${k + 1} ${result === 'taut' ? 'taut' : `left slack (${haul.slack.toFixed(2)} m)`}, ${state.clock.toFixed(1)} s`);
      // A span left slack is where the wolves come under, at once: the stage is lost here, on this span.
      if (result !== 'taut') return lose('slack', { kind: 'slack', span: k });
      if (play.patient) state.running = true;
      if (closing) {
        ring.closed = true;
        const verdict = judge(stage, ring, play.herd?.() ?? stage.herd);
        if (verdict.kind === 'held') return finish({ won: true, ring, clock: state.clock });
        return lose(verdict.kind, verdict);
      }
    }
    first = false;
    // The next hole: any still empty, or the first stake again to close the ring.
    const open = choices(stage, ring);
    const reachable = open.filter((i) => payOut(stage, ring, i) != null);
    if (reachable.length === 0) return lose('rope out');
    const hinted = hintFor(stage, ring);
    // Where the ring is laid out for the keeper (and whenever a hint is owed), the next hole alone is lit and ringed: one place to point at.
    const guided = play.plan || play.hint;
    if (guided && play.hintGlow != null) {
      play.hintGlow.visible = true;
      play.hintGlow.position.copy(fence.marks[hinted].position);
    }
    play.phase?.('pick', ring.order.length, open.includes(ring.order[0]));
    setDeskMode('one');
    // A pinch still closed from the driver or the line is not a pick: both hands must have been open for a moment first.
    let openFor = 0;
    const settle = d.each((delta) => {
      readHands(d, hands);
      openFor = hands.pinching.left || hands.pinching.right ? 0 : openFor + delta;
    });
    await d.until(() => openFor >= 0.3 || lost != null);
    settle();
    let picked = -1;
    void d.choosePerch(open.map((i) => fence.marks[i]), Math.max(0, open.indexOf(hinted))).then((n) => {
      picked = open[n];
    });
    // Any open hole can still be picked; the ring (and the mouse's hand) goes to the one that is next.
    if (guided && open.includes(hinted)) setV2Targets([fence.marks[hinted]]);
    // The skip belongs to the stage, not to the pick.
    await d.until(() => picked >= 0 || lost != null);
    if (play.hintGlow != null) play.hintGlow.visible = false;
    if (picked < 0) {
      d.cancelPerch();
      break;
    }
    if (import.meta.env.DEV) console.info(`[${tag}] hole ${picked} picked${picked === ring.order[0] ? ' (the first again)' : ''}`);
    hole = picked;
    if (payOut(stage, ring, hole) == null) {
      // The coil cannot reach: the keeper goes, and the line's end falls short in the snow.
      const there = seatAt(origin, stage.holes[hole], eye);
      arm();
      await d.rig.move(eye, there);
      return lose('rope out');
    }
  }
  if (lost != null) return lose(lost);
  // Dev skip: the ring stands as the answer has it.
  fence.reset();
  const posts = stage.answer.map((i) => fence.stand(toWorld(origin, stage.holes[i], ground), true));
  posts.forEach((post, k) => fence.span(k, post, posts[(k + 1) % posts.length], 0.02, true));
  ring.order = [...stage.answer];
  ring.slacks = stage.answer.map(() => 0.02);
  ring.closed = true;
  state.fenced = stage.answer.map((i, k) => ({ a: stage.holes[i], b: stage.holes[stage.answer[(k + 1) % stage.answer.length]], holds: true }));
  return finish({ won: true, ring, clock: state.clock });
}

/** What to do now, in one short sentence that begins with its verb: for the mouse (a click on green, a click a pull) or for the hands. */
export function ringTask(kind: 'drive' | 'haul' | 'pick', closing: boolean): string {
  const mouse = import.meta.env.DEV && deskPlaying();
  if (kind === 'drive') return mouse ? 'Click when the lamp is green.' : 'Lift the driver high. Slam it down.';
  if (kind === 'haul') return mouse ? 'Click to haul the line tight.' : 'Haul the line tight, hand over hand.';
  if (closing) return mouse ? 'Click the first stake: close the ring.' : 'Point at the first stake: close the ring.';
  return mouse ? 'Click the next hole.' : 'Point at the next hole.';
}

/** The span lengths of a ring (for the coil's thinning). */
export function ropeLeft(stage: ValleyStage, ring: Ring): number {
  let used = 0;
  ring.slacks.forEach((slack, k) => {
    used += gap(stage.holes[ring.order[k]], stage.holes[ring.order[(k + 1) % ring.order.length]]) + slack;
  });
  return Math.max(0, stage.rope - used);
}
