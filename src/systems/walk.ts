import {
  BackSide,
  CircleGeometry,
  createSystem,
  DynamicDrawUsage,
  Group,
  InputComponent,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { emitSignal, onSignal } from '../signals.js';
import { setStance, stance } from '../stance.js';
import { PLAZA_Y, TOWER_FOOT } from '../station/layout.js';
import { texturesStreamed } from '../station/materials.js';
import { type Box, SOLID, WALKABLE } from '../station/town.js';

/** Eye height above the ground while walking, whatever the player's own height or chair. */
const WALK_EYE = 1.6;
/** The teleport arc: launch speed along the pointing ray, gravity, and its sampling. */
const ARC_SPEED = 9;
const GRAVITY = 9.8;
const ARC_DT = 0.03;
const ARC_STEPS = 90;
/** Below this the arc has fallen off the town (into the sea or off the edge). */
const ARC_FLOOR = PLAZA_Y - 3;
const DOTS = 28;
/** A landing spot keeps this far from walls and furniture, so the head never ends up inside them. */
const CLEARANCE = 0.3;
const SNAP_ANGLE = Math.PI / 4;
/** A pinch that moves this far sideways this soon after it starts is a turn, not an aim. */
const FLICK_DISTANCE = 0.12;
const FLICK_SECONDS = 0.3;
/** Hand gamepad buttons Quest presses for a thumb swipe along the index finger. */
const SWIPE_LEFT = 5;
const SWIPE_RIGHT = 6;
const STICK_ON = 0.75;
const STICK_OFF = 0.3;
const VALID = 0xfff3d6;
const INVALID = 0xd9534f;

const SIDES = ['left', 'right'] as const;
type Hand = (typeof SIDES)[number];

/** Fade timings in seconds: a short blink for a step, a slow one for the stairs. */
const BLINK = { out: 0.08, hold: 0, in: 0.14 } as const;
const STAIRS = { out: 0.35, hold: 0.25, in: 0.45 } as const;
/**
 * Going down to the square, the dark lasts until the town's full-size
 * brick and paving are in (materials.ts STREAMED), or this long at most
 * (s). Only a resumed season on a slow link ever waits; the swap then
 * happens in the dark instead of sharpening in front of the player.
 */
const TOWN_WAIT = 3;
/**
 * The head may lean or step this far past open ground before the view
 * dims; inside a wall or a house it dims at once. Beyond the walkable town
 * only the panorama is left, and it only holds up seen from the seat.
 */
const BOUNDS_MARGIN = 1;
/** Dim, not black, so the way back stays visible. */
const BOUNDS_VEIL = 0.8;
const BOUNDS_RATE = 6;
/** After this long out of bounds the Keeper is blinked back to the last open ground they stood on. */
const RETURN_SECONDS = 2.5;
const RETURN = { out: 0.25, hold: 0.1, in: 0.35 } as const;

type Action = 'none' | 'teleport' | 'descend' | 'ascend';
type Fade = 'idle' | 'out' | 'hold' | 'in';

/**
 * Walking the town with hands only, seated.
 *
 * The key on the sill takes the Keeper down the stairs to the tower door;
 * the ring on the door brings them back to the seat. On the square, a pinch
 * that does not land on something to press throws an arc of dots from the
 * hand; releasing the pinch over open ground steps there, behind a short
 * blink. A quick sideways flick at the start of a pinch turns 45 degrees
 * instead, as does a thumb swipe along the index finger (Quest's
 * microgestures). Controllers work the same way with the trigger, and turn
 * with the thumbstick. Landing spots come from the town's WALKABLE and SOLID boxes,
 * so the arc never ends inside a wall, on the fountain or off the quay.
 *
 * Teleporting (no smooth sliding) and snap turns keep seated play
 * comfortable. The eye is lifted to standing height on every step.
 */
export class WalkSystem extends createSystem({}) {
  private aimHand: Hand | null = null;
  private aimSeconds = 0;
  /** The pinch was spent on a turn; its release does nothing. */
  private aimSpent = false;
  private aimValid = false;
  /** What the last hitSegment() call hit. */
  private hitKind: 'ground' | 'solid' = 'ground';
  private aimStart = new Vector3();
  private target = new Vector3();
  private stickLatched = [false, false];

  /** The rig's yaw at the seat, restored on the way back up so the window lines up with the body again. */
  private seatYaw = 0;
  /** Ground under the Keeper, set by every placement. */
  private ground: number = TOWER_FOOT.y;
  /**
   * The last place the head stood over open ground, with that ground's
   * height, and its yaw last frame: where a recenter or a wander off the
   * town puts the view back.
   */
  private lastValid = new Vector3(TOWER_FOOT.x, PLAZA_Y + WALK_EYE, TOWER_FOOT.z);
  private lastValidGround: number = TOWER_FOOT.y;
  private lastYaw = 0;
  /** Seconds the head has been out of bounds. */
  private outSeconds = 0;
  /** Frames still to restore after the headset recentred (the origin may move a frame late). */
  private resetRepeats = 0;
  private referenceSpace: XRReferenceSpace | null = null;
  private readonly onReset = () => {
    if (stance() === 'walk') this.resetRepeats = 3;
  };

  private fade: Fade = 'idle';
  private fadeSeconds = 0;
  private timing: { out: number; hold: number; in: number } = BLINK;
  private action: Action = 'none';
  private holdForTown = false;
  private actionTarget = new Vector3();

  private visuals = new Group();
  private dots!: InstancedMesh;
  private marker = new Group();
  /** The marker's filled centre, shown only over a valid spot. */
  private disc!: Mesh;
  private aimMaterial!: MeshBasicMaterial;
  private veil!: Mesh;
  private veilMaterial!: MeshBasicMaterial;
  /** The veil's opacity from a fade, and from the head being out of bounds; the darker wins. */
  private fadeVeil = 0;
  private boundsVeil = 0;

  private arc = new Float32Array((ARC_STEPS + 1) * 3);
  private lengths = new Float32Array(ARC_STEPS + 1);
  private origin = new Vector3();
  private direction = new Vector3();
  private velocity = new Vector3();
  private from = new Vector3();
  private to = new Vector3();
  private hand = new Vector3();
  private headWorld = new Vector3();
  private right = new Vector3();
  private offset = new Vector3();
  private forward = new Vector3();
  private rotation = new Quaternion();
  private yaw = new Quaternion();
  private matrix = new Matrix4();
  private dotScale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  init(): void {
    this.aimMaterial = new MeshBasicMaterial({
      color: VALID,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.dots = new InstancedMesh(new SphereGeometry(0.016, 8, 6), this.aimMaterial, DOTS);
    this.dots.instanceMatrix.setUsage(DynamicDrawUsage);
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    const ring = new Mesh(new RingGeometry(0.24, 0.3, 40), this.aimMaterial);
    const disc = (this.disc = new Mesh(
      new CircleGeometry(0.24, 40),
      new MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.18, depthWrite: false, fog: false, toneMapped: false }),
    ));
    ring.rotation.x = -Math.PI / 2;
    disc.rotation.x = -Math.PI / 2;
    this.marker.add(ring, disc);
    this.marker.visible = false;
    this.visuals.name = 'WalkAim';
    this.visuals.add(this.dots, this.marker);
    this.world.createTransformEntity(this.visuals, { persistent: true });

    // A black sphere around the head for the blink, drawn over everything.
    this.veilMaterial = new MeshBasicMaterial({
      color: 0x000000,
      side: BackSide,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.veil = new Mesh(new SphereGeometry(0.3, 16, 12), this.veilMaterial);
    this.veil.name = 'WalkVeil';
    this.veil.renderOrder = 10000;
    this.veil.frustumCulled = false;
    this.veil.visible = false;
    this.player.head.add(this.veil);

    this.cleanupFuncs.push(
      onSignal('descend', () => {
        if (stance() === 'seat') this.begin('descend', STAIRS);
      }),
      onSignal('ascend', () => {
        // The tower door opens only for the climb that starts: a second touch on the ring meanwhile is not heard.
        if (stance() === 'walk' && this.begin('ascend', STAIRS)) emitSignal('climb');
        else if (import.meta.env.DEV) console.info('[walk] the door ring again: already on the stairs, no climb');
      }),
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) this.reset();
      }),
      () => this.detachReset(),
    );
  }

  update(delta: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    if (this.referenceSpace == null) this.attachReset();
    this.updateBounds(delta);
    if (this.fade !== 'idle') {
      this.stepFade(delta);
      this.applyVeil();
      return;
    }
    this.applyVeil();
    if (stance() !== 'walk') return;
    if (this.resetRepeats > 0) {
      this.restoreView();
      return;
    }
    this.rememberView();
    this.readTurnSticks();
    if (this.aimHand == null) this.startAim();
    if (this.aimHand != null) this.updateAim(delta);
  }

  /** Turns the rig about the head, so the view spins in place. Also used by the dev keys. */
  snapTurn(direction: 1 | -1): void {
    if (stance() !== 'walk' || this.fade !== 'idle') return;
    const head = this.player.head;
    head.getWorldPosition(this.headWorld);
    this.player.rotation.y -= direction * SNAP_ANGLE;
    this.yaw.setFromAxisAngle(this.up, this.player.rotation.y);
    this.offset.copy(head.position).applyQuaternion(this.yaw);
    this.player.position.x = this.headWorld.x - this.offset.x;
    this.player.position.z = this.headWorld.z - this.offset.z;
  }

  // --- aiming -------------------------------------------------------------------

  private startAim(): void {
    for (const side of SIDES) {
      const select = this.input.xr.getSelectState(side);
      // A pinch on the door ring (or any other control) belongs to that control.
      if (!select.start || this.input.xr.multiPointers[side].getRayBusy()) continue;
      this.aimHand = side;
      this.aimSeconds = 0;
      this.aimSpent = false;
      this.aimValid = false;
      this.player.raySpaces[side].getWorldPosition(this.aimStart);
      return;
    }
  }

  private updateAim(delta: number): void {
    const side = this.aimHand as Hand;
    const select = this.input.xr.getSelectState(side);
    this.aimSeconds += delta;

    if (!this.aimSpent && this.aimSeconds <= FLICK_SECONDS && this.input.xr.isPrimary('hand', side)) {
      this.player.raySpaces[side].getWorldPosition(this.hand);
      this.right.set(1, 0, 0).applyQuaternion(this.player.head.getWorldQuaternion(this.rotation));
      this.right.y = 0;
      const sideways = this.hand.sub(this.aimStart).dot(this.right.normalize());
      if (Math.abs(sideways) >= FLICK_DISTANCE) {
        this.aimSpent = true;
        this.hideAim();
        this.snapTurn(sideways > 0 ? 1 : -1);
      }
    }

    if (!this.aimSpent) this.traceArc(side);

    if (select.end || !select.active) {
      if (!this.aimSpent && this.aimValid) {
        this.actionTarget.copy(this.target);
        this.begin('teleport', BLINK);
      }
      this.aimHand = null;
      this.hideAim();
    }
  }

  /** Flies the arc from the hand's pointing ray and shows where it lands. */
  private traceArc(side: Hand): void {
    const raySpace = this.player.raySpaces[side];
    raySpace.getWorldPosition(this.origin);
    this.direction.set(0, 0, -1).applyQuaternion(raySpace.getWorldQuaternion(this.rotation));
    this.velocity.copy(this.direction).multiplyScalar(ARC_SPEED);
    this.from.copy(this.origin);
    this.arc[0] = this.from.x;
    this.arc[1] = this.from.y;
    this.arc[2] = this.from.z;
    this.lengths[0] = 0;

    let points = 1;
    let landed: 'ground' | 'solid' | null = null;
    for (let i = 0; i < ARC_STEPS; i += 1) {
      this.to.copy(this.from).addScaledVector(this.velocity, ARC_DT);
      this.to.y -= 0.5 * GRAVITY * ARC_DT * ARC_DT;
      this.velocity.y -= GRAVITY * ARC_DT;
      const t = this.hitSegment();
      if (t >= 0) this.to.lerpVectors(this.from, this.to, t);
      this.arc[points * 3] = this.to.x;
      this.arc[points * 3 + 1] = this.to.y;
      this.arc[points * 3 + 2] = this.to.z;
      this.lengths[points] = this.lengths[points - 1] + this.from.distanceTo(this.to);
      points += 1;
      if (t >= 0) {
        landed = this.hitKind;
        break;
      }
      if (this.to.y < ARC_FLOOR) break;
      this.from.copy(this.to);
    }

    this.aimValid = landed === 'ground' && this.clearOfSolids(this.to);
    if (this.aimValid) this.target.copy(this.to);
    this.aimMaterial.color.setHex(this.aimValid ? VALID : INVALID);
    this.marker.visible = landed != null;
    if (landed != null) {
      this.marker.position.set(this.to.x, this.to.y + 0.02, this.to.z);
      this.disc.visible = this.aimValid;
    }
    this.placeDots(points);
  }

  /** Spreads the dots evenly along the traced arc, larger further from the eye. */
  private placeDots(points: number): void {
    const total = this.lengths[points - 1];
    this.player.head.getWorldPosition(this.headWorld);
    let segment = 1;
    for (let k = 0; k < DOTS; k += 1) {
      const s = ((k + 0.5) / DOTS) * total;
      while (segment < points - 1 && this.lengths[segment] < s) segment += 1;
      const a = this.lengths[segment - 1];
      const span = this.lengths[segment] - a || 1;
      const f = (s - a) / span;
      const i0 = (segment - 1) * 3;
      const i1 = segment * 3;
      this.from.set(
        this.arc[i0] + (this.arc[i1] - this.arc[i0]) * f,
        this.arc[i0 + 1] + (this.arc[i1 + 1] - this.arc[i0 + 1]) * f,
        this.arc[i0 + 2] + (this.arc[i1 + 2] - this.arc[i0 + 2]) * f,
      );
      const grow = 1 + this.from.distanceTo(this.headWorld) * 0.12;
      this.dotScale.setScalar(grow);
      this.matrix.compose(this.from, this.rotation.identity(), this.dotScale);
      this.dots.setMatrixAt(k, this.matrix);
    }
    this.dots.count = DOTS;
    this.dots.instanceMatrix.needsUpdate = true;
  }

  private hideAim(): void {
    this.dots.count = 0;
    this.marker.visible = false;
  }

  // --- landing tests against the town's boxes ------------------------------------

  /**
   * The first point on the segment from→to that meets open ground (from
   * above) or a solid box, as a fraction of the segment; -1 for none.
   */
  private hitSegment(): number {
    let best = 2;
    const { from: a, to: b } = this;
    for (const g of WALKABLE) {
      const y = g[4];
      if (a.y < y || b.y >= y) continue;
      const t = (a.y - y) / (a.y - b.y);
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (t < best && x >= g[0] && x <= g[3] && z >= g[2] && z <= g[5]) {
        best = t;
        this.hitKind = 'ground';
      }
    }
    for (const s of SOLID) {
      const t = entry(a, b, s);
      if (t >= 0 && t < best) {
        best = t;
        this.hitKind = 'solid';
      }
    }
    return best <= 1 ? best : -1;
  }

  private clearOfSolids(p: Vector3): boolean {
    for (const s of SOLID) {
      if (s[4] < p.y + 0.1 || s[1] > p.y + 2) continue;
      if (p.x > s[0] - CLEARANCE && p.x < s[3] + CLEARANCE && p.z > s[2] - CLEARANCE && p.z < s[5] + CLEARANCE) {
        return false;
      }
    }
    return true;
  }

  // --- controllers ----------------------------------------------------------------

  /** Thumbstick flicks on a controller; on a tracked hand, Quest's thumb microgestures (swipe left or right). */
  private readTurnSticks(): void {
    for (let i = 0; i < SIDES.length; i += 1) {
      const side = SIDES[i];
      const pad = this.input.xr.gamepads[side];
      if (this.input.xr.isPrimary('hand', side)) {
        if (pad?.getButtonDownByIdx(SWIPE_LEFT)) this.snapTurn(-1);
        else if (pad?.getButtonDownByIdx(SWIPE_RIGHT)) this.snapTurn(1);
        continue;
      }
      if (!this.input.xr.isPrimary('controller', side)) continue;
      const x = pad?.getAxesValues(InputComponent.Thumbstick)?.x ?? 0;
      if (!this.stickLatched[i] && Math.abs(x) > STICK_ON) {
        this.stickLatched[i] = true;
        this.snapTurn(x > 0 ? 1 : -1);
      } else if (this.stickLatched[i] && Math.abs(x) < STICK_OFF) {
        this.stickLatched[i] = false;
      }
    }
  }

  // --- the headset's own recenter while walking -------------------------------------

  /** Head yaw, kept every frame so a recenter can be undone; the position is kept by updateBounds. */
  private rememberView(): void {
    this.forward.set(0, 0, -1).applyQuaternion(this.player.head.getWorldQuaternion(this.rotation));
    this.lastYaw = Math.atan2(-this.forward.x, -this.forward.z);
  }

  /**
   * After a recenter (long press on the Meta button) the head's local pose
   * jumps to the new origin while the rig stays put. Turn and move the rig
   * so the head is where it last stood on open ground, looking where it looked.
   */
  private restoreView(): void {
    const head = this.player.head;
    this.forward.set(0, 0, -1).applyQuaternion(head.quaternion);
    this.player.rotation.set(0, this.lastYaw - Math.atan2(-this.forward.x, -this.forward.z), 0);
    this.placeHead(this.lastValid.x, this.lastValidGround, this.lastValid.z);
    this.resetRepeats -= 1;
  }

  private attachReset(): void {
    const space = this.world.renderer.xr.getReferenceSpace();
    if (space == null) return;
    space.addEventListener('reset', this.onReset);
    this.referenceSpace = space;
  }

  private detachReset(): void {
    this.referenceSpace?.removeEventListener('reset', this.onReset);
    this.referenceSpace = null;
  }

  // --- moving behind the veil -----------------------------------------------------

  /** Starts a move behind the veil; false if one is already under way, or outside the headset. */
  private begin(action: Action, timing: { out: number; hold: number; in: number }): boolean {
    // A click on the key in the 2D page (or the dev key) must not wait for the next session.
    if (this.fade !== 'idle' || this.world.visibilityState.peek() === VisibilityState.NonImmersive) return false;
    if (import.meta.env.DEV && action !== 'teleport') console.info(`[walk] ${action} begins at ${(performance.now() / 1000).toFixed(2)} s`);
    this.action = action;
    this.holdForTown = action === 'descend';
    this.timing = timing;
    this.fade = 'out';
    this.fadeSeconds = 0;
    this.aimHand = null;
    this.hideAim();
    return true;
  }

  private stepFade(delta: number): void {
    this.fadeSeconds += delta;
    const { out, hold, in: back } = this.timing;
    if (this.fade === 'out') {
      this.fadeVeil = Math.min(1, this.fadeSeconds / out);
      if (this.fadeSeconds >= out) {
        this.act();
        this.fade = 'hold';
        this.fadeSeconds = 0;
      }
    } else if (this.fade === 'hold') {
      const waiting = this.holdForTown && !texturesStreamed() && this.fadeSeconds < TOWN_WAIT;
      if (this.fadeSeconds >= hold && !waiting) {
        this.fade = 'in';
        this.fadeSeconds = 0;
      }
    } else {
      this.fadeVeil = Math.max(0, 1 - this.fadeSeconds / back);
      if (this.fadeSeconds >= back) this.fade = 'idle';
    }
  }

  /** The move itself, done while the view is black. */
  private act(): void {
    if (this.action === 'teleport') {
      this.placeHead(this.actionTarget.x, this.actionTarget.y, this.actionTarget.z);
    } else if (this.action === 'descend') {
      // Out of the door, which faces the square as the window does: keeping
      // the seat's yaw keeps the square straight ahead of the body, wherever
      // the head was turned to reach the key.
      this.seatYaw = this.player.rotation.y;
      this.placeHead(TOWER_FOOT.x, TOWER_FOOT.y, TOWER_FOOT.z);
      this.lastValid.set(TOWER_FOOT.x, TOWER_FOOT.y + WALK_EYE, TOWER_FOOT.z);
      this.lastValidGround = TOWER_FOOT.y;
      this.outSeconds = 0;
      setStance('walk');
    } else if (this.action === 'ascend') {
      // Undo the walk's turns; SeatSystem puts the head back on the seat during the hold.
      this.player.rotation.set(0, this.seatYaw, 0);
      setStance('seat');
    }
    this.action = 'none';
  }

  /** Moves the rig so the head stands over (x, z) at walking eye height above `ground`. */
  private placeHead(x: number, ground: number, z: number): void {
    const head = this.player.head;
    this.yaw.setFromAxisAngle(this.up, this.player.rotation.y);
    this.offset.copy(head.position).applyQuaternion(this.yaw);
    const lift = Math.min(1.7, Math.max(-0.5, WALK_EYE - head.position.y));
    this.player.position.set(x - this.offset.x, ground + lift, z - this.offset.z);
    this.ground = ground;
  }

  private reset(): void {
    this.detachReset();
    setStance('seat');
    this.resetRepeats = 0;
    this.fade = 'idle';
    this.action = 'none';
    this.aimHand = null;
    this.fadeVeil = 0;
    this.boundsVeil = 0;
    this.applyVeil();
    this.hideAim();
  }

  private applyVeil(): void {
    const opacity = Math.max(this.fadeVeil, this.boundsVeil);
    this.veilMaterial.opacity = opacity;
    this.veil.visible = opacity > 0.002;
  }

  /**
   * Dims the view while the head is inside something solid or well off the
   * walkable town, remembers the last open ground it stood over, and after a
   * while out of bounds blinks the Keeper back there.
   */
  private updateBounds(delta: number): void {
    let target = 0;
    if (stance() === 'walk') {
      this.player.head.getWorldPosition(this.headWorld);
      if (this.outOfBounds(this.headWorld)) {
        target = BOUNDS_VEIL;
        this.outSeconds += delta;
      } else {
        this.outSeconds = 0;
        if (this.fade === 'idle') {
          this.lastValid.copy(this.headWorld);
          this.lastValidGround = this.groundUnder(this.headWorld);
        }
      }
      if (this.outSeconds > RETURN_SECONDS && this.fade === 'idle' && this.resetRepeats === 0) {
        this.outSeconds = 0;
        this.actionTarget.set(this.lastValid.x, this.lastValidGround, this.lastValid.z);
        this.begin('teleport', RETURN);
      }
    } else {
      this.outSeconds = 0;
    }
    this.boundsVeil += (target - this.boundsVeil) * Math.min(1, delta * BOUNDS_RATE);
  }

  /** Height of the open ground under (or within the margin of) p; the last placement's if none. */
  private groundUnder(p: Vector3): number {
    for (let pass = 0; pass < 2; pass += 1) {
      const m = pass === 0 ? 0 : BOUNDS_MARGIN;
      for (const g of WALKABLE) {
        if (p.x > g[0] - m && p.x < g[3] + m && p.z > g[2] - m && p.z < g[5] + m) return g[4];
      }
    }
    return this.ground;
  }

  private outOfBounds(p: Vector3): boolean {
    for (const s of SOLID) {
      if (p.x > s[0] && p.x < s[3] && p.y > s[1] && p.y < s[4] && p.z > s[2] && p.z < s[5]) return true;
    }
    for (const g of WALKABLE) {
      const m = BOUNDS_MARGIN;
      if (p.x > g[0] - m && p.x < g[3] + m && p.z > g[2] - m && p.z < g[5] + m && p.y > g[4] + 0.3 && p.y < g[4] + 2.8) {
        return false;
      }
    }
    return true;
  }
}

/** The part of the segment still inside every slab tested so far, as [t0, t1]. */
const span = new Float64Array(2);

/** Where the segment a→b enters box s, as a fraction of the segment; -1 if it misses. */
function entry(a: Vector3, b: Vector3, s: Box): number {
  span[0] = 0;
  span[1] = 1;
  if (!slab(a.x, b.x - a.x, s[0], s[3]) || !slab(a.y, b.y - a.y, s[1], s[4]) || !slab(a.z, b.z - a.z, s[2], s[5])) {
    return -1;
  }
  return span[0];
}

/** Clips `span` to where p + t·d lies between lo and hi; false once nothing is left. */
function slab(p: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
  const near = (lo - p) / d;
  const far = (hi - p) / d;
  span[0] = Math.max(span[0], Math.min(near, far));
  span[1] = Math.min(span[1], Math.max(near, far));
  return span[0] <= span[1];
}
