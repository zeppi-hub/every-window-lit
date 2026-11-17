import {
  Box3,
  createSystem,
  DistanceGrabbable,
  DynamicDrawUsage,
  type Entity,
  Grabbed,
  Hovered,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Mesh,
  type Object3D,
  OneHandGrabbable,
  PlaneGeometry,
  Pressed,
  Quaternion,
  ShaderMaterial,
  TwoHandsGrabbable,
  Vector3,
} from '@iwsdk/core';
import { PokeButton } from '../components.js';
import { gripPart, gripPoint, gripRadius } from '../station/grip.js';
import { stance } from '../stance.js';
import { hintTrail, stepTargets } from './hint.js';
import { PINCH_REACH, pinchPoint, pinchTarget } from './pinch-reach.js';

/**
 * Where to take hold (the hands package, META_VR_EL_TURU.md): a small warm
 * ring, facing the eye and hidden behind what stands in front of it, on the
 * exact point the next step is pinched or touched (station/grip.ts), the
 * ghost hand's pinch comes onto it (HintSystem). A hand that comes within
 * reach of anything it can take or touch fills that thing's ring and lights
 * a soft glow behind it: for a tracked hand, exactly what its pinch would
 * take now (PinchReachSystem.pinchTarget: the grabbable in reach of its
 * pinch point, a poke-only button there, what its fingertip touches, or
 * what its ray points at); for a controller, what its grab sphere or ray
 * meets, what its tip is about to press, or the nearest grabbable within
 * GRAB_REACH of its grip. The
 * Hovered tag alone is not trusted: it can stay on after a quick hand has
 * gone (seen on the sun's knob); taking hold or pressing
 * swells the ring for a moment (the tick is SoundSystem's). While the hand
 * is shown, its move is drawn from the ring as a few dots and a head, which
 * never move or blink. All of it is one instanced draw, and none while
 * there is nothing to mark.
 */
const MAX = 24;
/** The ring's width at arm's length (m); farther off it grows with the distance, so it looks the same size. */
const RING = 0.026;
const RING_FAR_FROM = 1;
/** How near a pinch point (or a controller's grip) comes to a grabbable's box before it counts as in reach (m): the grab sphere's radius. */
const GRAB_REACH = 0.07;
/** Hover from farther than this (a ray across the town) lights nothing (m). */
const HOVER_FAR = 6;
/** How fast a ring fills and empties (per second), and how long the swell of a hold or press lasts (s). */
const FILL_RATE = 8;
const POP_SECONDS = 0.3;
const POP_GROW = 0.7;
/** The glow behind a thing: at most this radius (a long hidden hit box glows only round its middle, m). */
const GLOW_MAX = 0.1;
/** A grip that is a point (the way up's ring's middle, the knock on the glass): how far round it counts as the thing, and its glow (m). */
const POINT_REACH = 0.07;
const POINT_GLOW = 0.08;
/** The trail: dots between the ring and the head, and their widths at arm's length (m). */
const TRAIL_DOTS = [0.25, 0.45, 0.65] as const;
const DOT = 0.011;
const HEAD = 0.026;

/** What a mark is drawn as (the shader's first instance value). */
const enum Kind {
  Ring = 0,
  Glow = 1,
  Dot = 2,
  Head = 3,
}

const vertexShader = /* glsl */ `
attribute vec2 aInfo;
varying vec2 vUv;
varying vec2 vInfo;
void main() {
  vUv = uv * 2.0 - 1.0;
  vInfo = aInfo;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

// Colours are written as shown (no tone mapping or colour space step), so the ring reads the same in day and night.
const fragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec2 vInfo;
const vec3 WARM = vec3(1.0, 0.84, 0.5);
const vec3 DARK = vec3(0.1, 0.07, 0.04);
float band(float r, float a, float b, float w) {
  return smoothstep(a - w, a, r) * (1.0 - smoothstep(b, b + w, r));
}
void main() {
  float r = length(vUv);
  float w = max(fwidth(r) * 1.2, 0.002);
  float kind = vInfo.x;
  float v = vInfo.y;
  vec3 colour = WARM;
  float alpha = 0.0;
  if (kind < 0.5) {
    // The ring: a warm band with a dark rim outside and in, and a warm fill inside as a hand comes near.
    float ring = band(r, 0.6, 0.84, w);
    float rim = band(r, 0.84, 1.0 - w, w) + band(r, 0.48, 0.6, w) * (1.0 - v);
    float fill = (1.0 - smoothstep(0.6 - w, 0.6, r)) * v;
    alpha = max(ring * 0.95, max(rim * 0.55, fill * 0.8));
    colour = mix(DARK, WARM, clamp(ring + fill, 0.0, 1.0));
  } else if (kind < 1.5) {
    // The glow behind a thing in reach.
    alpha = v * 0.6 * (1.0 - smoothstep(0.2, 1.0, r));
  } else if (kind < 2.5) {
    // A dot of the trail.
    float dot = 1.0 - smoothstep(0.62 - w, 0.62, r);
    float rim = band(r, 0.62, 1.0 - w, w);
    alpha = v * max(dot * 0.9, rim * 0.5);
    colour = mix(DARK, WARM, dot);
  } else {
    // The trail's head, pointing along +x: a notched arrowhead with a dark rim.
    float side = (1.0 - vUv.x) * 0.5 - abs(vUv.y);
    float back = vUv.x + 0.15 + abs(vUv.y) * 0.6;
    float inner = min(side, back);
    float aw = max(fwidth(inner) * 1.2, 0.002);
    float head = smoothstep(0.08 - aw, 0.08, inner);
    float rim = smoothstep(-aw, 0.0, inner) * (1.0 - head);
    alpha = v * max(head * 0.95, rim * 0.55);
    colour = mix(DARK, WARM, head);
  }
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(colour, alpha);
}
`;

/** One thing marked this frame: its ring, how full it should be, and whether it glows. */
interface Mark {
  thing: Object3D;
  fill: number;
  glow: boolean;
}

/** A ring's fill as last drawn, kept across frames so it eases; and when a thing was last taken hold of or pressed. */
interface Kept {
  thing: Object3D | null;
  value: number;
}

const SIDES = ['left', 'right'] as const;

export class GripMarkSystem extends createSystem({
  hovered: { required: [Hovered] },
  buttons: { required: [PokeButton] },
  pressed: { required: [Pressed] },
  grabbed: { required: [Grabbed] },
  oneHand: { required: [OneHandGrabbable] },
  twoHands: { required: [TwoHandsGrabbable] },
  distance: { required: [DistanceGrabbable] },
}) {
  private marks: InstancedMesh | null = null;
  private info: InstancedBufferAttribute | null = null;
  /** This frame's marks (the first `marked` of a fixed pool, so nothing is allocated per frame). */
  private readonly frame: Mark[] = Array.from({ length: MAX }, () => ({ thing: null as unknown as Object3D, fill: 0, glow: false }));
  private marked = 0;
  /** How full each ring is, eased toward 0 or 1; and when each thing was last taken hold of or pressed (s, this system's clock). */
  private readonly fills: Kept[] = Array.from({ length: MAX }, () => ({ thing: null, value: 0 }));
  private readonly popped: Kept[] = Array.from({ length: 8 }, () => ({ thing: null, value: 0 }));
  private clock = 0;
  private grabbables: { entities: Set<Entity> }[] = [];
  private readonly eye = new Vector3();
  private readonly turn = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly at = new Vector3();
  private readonly size = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly tip = new Vector3();
  private readonly box = new Box3();
  /** What each hand's active pointer meets this frame (left, right). */
  private readonly hits: (Object3D | null)[] = [null, null];
  /** Whether each side is a tracked hand this frame (its pinch decides its ring alone). */
  private readonly handSide = [false, false];
  /** For a hand whose pointer meets nothing: the nearest grabbable within GRAB_REACH of its pinch point, and how near (m). */
  private readonly nearest: (Object3D | null)[] = [null, null];
  private readonly nearestAt = [Infinity, Infinity];
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly axis = new Vector3(0, 0, 1);
  private count = 0;
  private wayUpMiddle: Object3D | null = null;
  private doorRing: Object3D | null = null;

  init(): void {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const marks = new InstancedMesh(new PlaneGeometry(1, 1), material, MAX);
    marks.name = 'GripMarks';
    marks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.info = new InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    this.info.setUsage(DynamicDrawUsage);
    marks.geometry.setAttribute('aInfo', this.info);
    marks.frustumCulled = false;
    // Under the ghost hand (5), which is drawn over everything, so its pinch sits on the ring.
    marks.renderOrder = 4;
    marks.count = 0;
    marks.visible = false;
    marks.pointerEvents = 'none';
    this.world.createTransformEntity(marks, { persistent: true });
    this.marks = marks;
    this.grabbables = [this.queries.oneHand, this.queries.twoHands, this.queries.distance];
    const swell = (entity: Entity) => {
      const thing = entity.object3D;
      if (thing == null) return;
      // Its own slot if it has one, else a free or the oldest.
      let slot = this.popped[0];
      for (const p of this.popped) {
        if (p.thing === thing) {
          slot = p;
          break;
        }
        if (p.thing == null || p.value < slot.value) slot = p;
      }
      slot.thing = thing;
      slot.value = this.clock;
    };
    this.cleanupFuncs.push(this.queries.pressed.subscribe('qualify', swell), this.queries.grabbed.subscribe('qualify', swell));
  }

  update(delta: number): void {
    const marks = this.marks;
    const info = this.info;
    if (marks == null || info == null) return;
    this.clock += delta;
    this.count = 0;
    if (!this.renderer.xr.isPresenting) {
      marks.count = 0;
      marks.visible = false;
      return;
    }
    const camera = this.world.camera;
    camera.getWorldPosition(this.eye);
    camera.getWorldQuaternion(this.turn);
    for (let i = 0; i < SIDES.length; i += 1) {
      const side = SIDES[i];
      if (pinchPoint(side) != null) {
        // A hand: the ring its pinch would take, and no other (measure skips it).
        this.hits[i] = pinchTarget(side).thing;
        this.handSide[i] = true;
        continue;
      }
      this.handSide[i] = false;
      const multi = this.input.xr.multiPointers[side];
      const kind = multi?.getActiveKind();
      const hit = kind != null ? multi?.getActivePointer()?.getIntersection() : undefined;
      const object = hit?.object as (Object3D & { isVoidObject?: boolean }) | undefined;
      // A touch counts only about to press (not its 15 cm hover, which the trigger cannot take).
      const limit = kind === 'touch' ? PINCH_REACH : HOVER_FAR;
      this.hits[i] = hit != null && object != null && object.isVoidObject !== true && hit.distance <= limit ? object : null;
    }
    this.right.set(1, 0, 0).applyQuaternion(this.turn);
    this.up.set(0, 1, 0).applyQuaternion(this.turn);

    // The things to mark: the next step's, the way up and the door ring on the square, and whatever a hand is near.
    this.marked = 0;
    if (stance() === 'walk') {
      this.wayUpMiddle ??= this.scene.getObjectByName('WayUpRingMiddle') ?? null;
      this.doorRing ??= this.scene.getObjectByName('TowerDoorRing') ?? null;
      if (this.wayUpMiddle != null && seen(this.wayUpMiddle)) this.mark(this.wayUpMiddle, 0, false);
      if (this.doorRing != null && seen(this.doorRing)) this.mark(this.doorRing, 0, false);
    } else {
      for (const thing of stepTargets()) if (seen(thing)) this.mark(thing, 0, false);
    }
    // By the interactable itself (its root), so its ring sits where its own grip is.
    for (const entity of this.queries.hovered.entities) {
      const thing = entity.object3D;
      if (thing != null && this.pointedAt(thing)) this.near(thing, HOVER_FAR);
    }
    for (const entity of this.queries.buttons.entities) {
      const thing = entity.object3D;
      if (thing != null && this.pointedAt(thing)) this.near(thing, HOVER_FAR);
    }
    this.nearest[0] = this.nearest[1] = null;
    this.nearestAt[0] = this.nearestAt[1] = Infinity;
    for (const query of this.grabbables) {
      for (const entity of query.entities) {
        const thing = entity.object3D;
        if (thing == null) continue;
        if (this.pointedAt(thing)) this.near(thing, HOVER_FAR);
        else this.measure(thing);
      }
    }
    // One per hand: the one a pinch there would take, not everything round the fingertip.
    for (const thing of this.nearest) if (thing != null) this.near(thing, HOVER_FAR);
    for (const p of this.popped) {
      if (p.thing == null) continue;
      if (this.clock - p.value > POP_SECONDS) p.thing = null;
      else if (this.markOf(p.thing) == null) this.mark(p.thing, 1, false);
    }

    // Ease each ring's fill; forget the rings no longer drawn.
    const step = Math.min(1, delta * FILL_RATE);
    for (const kept of this.fills) if (kept.thing != null && !this.drawn(kept.thing)) kept.thing = null;
    for (let i = 0; i < this.marked; i += 1) {
      const mark = this.frame[i];
      const kept = this.keptFill(mark.thing);
      const fill = kept.value + (mark.fill - kept.value) * step;
      kept.value = fill;
      if (mark.glow) this.glow(mark.thing, fill);
      gripPoint(mark.thing, this.eye, this.at);
      const far = Math.max(1, this.at.distanceTo(this.eye) / RING_FAR_FROM);
      this.place(Kind.Ring, fill, this.at, RING * far * (1 + POP_GROW * this.swell(mark.thing)), 0);
    }

    // The ghost hand's move, from the ring it starts on: still dots and a head, as visible as the hand.
    const trail = hintTrail();
    if (trail != null) {
      const far = Math.max(1, trail.from.distanceTo(this.eye) / RING_FAR_FROM);
      for (const along of TRAIL_DOTS) {
        this.tip.copy(trail.from).addScaledVector(trail.move, along);
        this.place(Kind.Dot, trail.alpha, this.tip, DOT * far, 0);
      }
      this.tip.copy(trail.from).addScaledVector(trail.move, 0.9);
      const angle = Math.atan2(trail.move.dot(this.up), trail.move.dot(this.right));
      this.place(Kind.Head, trail.alpha, this.tip, HEAD * far, angle);
    }

    marks.count = this.count;
    marks.visible = this.count > 0;
    marks.instanceMatrix.needsUpdate = true;
    info.needsUpdate = true;
  }

  /** A hand is near `thing`: its ring fills and it glows (unless the hover comes from farther than `far`). */
  private near(thing: Object3D | undefined, far: number): void {
    if (thing == null || !seen(thing)) return;
    thing.getWorldPosition(this.tip);
    if (this.tip.distanceTo(this.eye) > far + 1) return;
    const mark = this.markOf(thing);
    if (mark != null) {
      mark.fill = 1;
      mark.glow = true;
    } else this.mark(thing, 1, true);
  }

  private mark(thing: Object3D, fill: number, glow: boolean): void {
    if (this.marked >= this.frame.length) return;
    const mark = this.frame[this.marked];
    mark.thing = thing;
    mark.fill = fill;
    mark.glow = glow;
    this.marked += 1;
  }

  /** This frame's mark on `thing` or on what holds it or what it holds. */
  private markOf(thing: Object3D): Mark | null {
    for (let i = 0; i < this.marked; i += 1) if (related(this.frame[i].thing, thing)) return this.frame[i];
    return null;
  }

  private drawn(thing: Object3D): boolean {
    for (let i = 0; i < this.marked; i += 1) if (this.frame[i].thing === thing) return true;
    return false;
  }

  /** The kept fill of `thing`'s ring (a free slot, starting empty, if it had none). */
  private keptFill(thing: Object3D): Kept {
    let free: Kept | null = null;
    for (const kept of this.fills) {
      if (kept.thing === thing) return kept;
      if (kept.thing == null && free == null) free = kept;
    }
    const slot = free ?? this.fills[0];
    slot.thing = thing;
    slot.value = 0;
    return slot;
  }

  /**
   * The box of the part a hand takes `thing` by, into this.box (a grip that is a point: a small box round it);
   * whether that part is a point; null for nothing to measure.
   */
  private partBox(thing: Object3D): boolean | null {
    const part = gripPart(thing);
    this.box.setFromObject(part);
    if (!this.box.isEmpty()) return false;
    // A named empty point (marked itself, or found by name): measured round it. Any other empty thing: nothing.
    if ((part as Mesh).isMesh === true || part.children.length > 0) return null;
    part.getWorldPosition(this.tip);
    this.box.setFromCenterAndSize(this.tip, this.size.setScalar(POINT_REACH * 2));
    return true;
  }

  /**
   * How near each pinch point whose pointer meets nothing is to `thing`'s box, kept if it is the nearest so far
   * within GRAB_REACH: a hand's index tip (its palm passing over the sill reaches nothing), a controller's grip.
   */
  private measure(thing: Object3D): void {
    if (!seen(thing) || this.partBox(thing) == null) return;
    for (let i = 0; i < SIDES.length; i += 1) {
      if (this.hits[i] != null || this.handSide[i]) continue;
      const side = SIDES[i];
      (this.input.xr.isPrimary('hand', side) ? this.player.indexTipSpaces[side] : this.player.gripSpaces[side]).getWorldPosition(this.tip);
      const d = this.box.distanceToPoint(this.tip);
      if (d <= GRAB_REACH && d < this.nearestAt[i]) {
        this.nearestAt[i] = d;
        this.nearest[i] = thing;
      }
    }
  }

  /** Whether a hand's active pointer meets `thing` (one of its meshes) this frame. */
  private pointedAt(thing: Object3D): boolean {
    for (const hit of this.hits) if (hit != null && related(hit, thing)) return true;
    return false;
  }

  /** The soft glow behind `thing`, a little past it from the eye so the thing itself covers its middle. */
  private glow(thing: Object3D, fill: number): void {
    const part = gripPart(thing);
    // A hidden hit box glows only through its ring; its own shape would show as a disc in the air.
    if ((part as Mesh).isMesh === true && hiddenMaterial(part as Mesh)) return;
    const point = this.partBox(thing);
    if (point == null) return;
    const radius = point ? POINT_GLOW : Math.min(GLOW_MAX, gripRadius(thing));
    this.box.getCenter(this.tip);
    this.size.subVectors(this.tip, this.eye).normalize();
    this.tip.addScaledVector(this.size, radius * 0.6);
    this.place(Kind.Glow, fill, this.tip, radius * 2.4, 0);
  }

  /** How swollen `thing`'s ring is: up and back down over POP_SECONDS after a hold or press. */
  private swell(thing: Object3D): number {
    for (const p of this.popped) {
      if (p.thing == null || !related(p.thing, thing)) continue;
      const t = (this.clock - p.value) / POP_SECONDS;
      if (t >= 0 && t <= 1) return Math.sin(Math.PI * t);
    }
    return 0;
  }

  /** One instance: a camera-facing square of width `width` at `at`, turned `angle` in its own plane. */
  private place(kind: Kind, value: number, at: Vector3, width: number, angle: number): void {
    const marks = this.marks;
    const info = this.info;
    if (marks == null || info == null || this.count >= MAX) return;
    this.spin.setFromAxisAngle(this.axis, angle).premultiply(this.turn);
    this.size.setScalar(width);
    this.matrix.compose(at, this.spin, this.size);
    marks.setMatrixAt(this.count, this.matrix);
    info.setXY(this.count, kind, Math.min(1, Math.max(0, value)));
    this.count += 1;
  }
}

/** Whether `thing` and all it hangs from are shown. */
function seen(thing: Object3D): boolean {
  for (let at: Object3D | null = thing; at != null; at = at.parent) if (!at.visible) return false;
  return true;
}

/** Whether one of the two is the other or holds it (a step's mesh under the entity a hand hovers). */
function related(a: Object3D, b: Object3D): boolean {
  for (let p: Object3D | null = a; p != null; p = p.parent) if (p === b) return true;
  for (let p: Object3D | null = b.parent; p != null; p = p.parent) if (p === a) return true;
  return false;
}

function hiddenMaterial(mesh: Mesh): boolean {
  const material = mesh.material;
  return Array.isArray(material) ? material.every((m) => !m.visible) : !material.visible;
}
