import { type BufferGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A circus performer's body, posed from a few points in the world every
 * frame: the base of the neck, the way to the hips, where each wrist and
 * each foot is. The limbs follow by two-bone reach (shoulder, elbow, wrist;
 * hip, knee, foot), so every joint always meets and no limb is ever longer
 * than its bones.
 *
 * Without a head it is the player's own body, seen when she looks down: a
 * sequinned leotard, satin sleeves that end in a gold cuff at her real
 * hands, pale tights and red slippers. With a head it is another performer
 * (the catcher, the partner on the platform).
 */

/** Bone lengths and half-widths of an adult seated or hanging (m). */
export const BODY = {
  spine: 0.48,
  upperArm: 0.29,
  forearm: 0.25,
  thigh: 0.44,
  shin: 0.43,
  shoulderHalf: 0.185,
  hipHalf: 0.095,
  /** An arm asked to reach further than this from its shoulder hangs at rest instead. */
  armReach: 0.85,
} as const;

export type Side = 'left' | 'right';
const SIDES = ['left', 'right'] as const satisfies readonly Side[];
const sign = (side: Side): number => (side === 'left' ? -1 : 1);

export interface BodyLook {
  /** The leotard and sleeves. */
  suit: number;
  trim: number;
  tights: number;
  shoes: number;
  skin: number;
  /** A head and bare hands: another performer, not the player. */
  head: boolean;
}

export const PLAYER_LOOK: BodyLook = { suit: 0x8f1826, trim: 0xe2b54c, tights: 0xf3ead8, shoes: 0xb3202e, skin: 0xd9a983, head: false };
export const CATCHER_LOOK: BodyLook = { suit: 0x1f4f8f, trim: 0xe2b54c, tights: 0xf3ead8, shoes: 0x1c1a19, skin: 0xc99a7a, head: true };

/** Sequins: a satin ground scattered with small bright discs, some of them catching the light. */
function sequins(ground: number, bright: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = `#${ground.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 128, 128);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let row = 0; row < 16; row += 1) {
      for (let col = 0; col < 16; col += 1) {
        const x = col * 8 + (row % 2 === 0 ? 2 : 6);
        const y = row * 8 + 4;
        const shine = random();
        g.fillStyle = shine > 0.86 ? '#fff6d8' : shine > 0.5 ? `#${bright.toString(16).padStart(6, '0')}` : 'rgba(0,0,0,0.18)';
        g.beginPath();
        g.arc(x, y, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(9, 7);
  return texture;
}

/** Harlequin tights: diamonds of two colours with a fine bright line between them. */
function harlequin(first: number, second: number, line: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
  if (g != null) {
    g.fillStyle = hex(first);
    g.fillRect(0, 0, 64, 96);
    g.fillStyle = hex(second);
    for (const [cx, cy] of [[32, 48], [0, 0], [64, 0], [0, 96], [64, 96]]) {
      g.beginPath();
      g.moveTo(cx, cy - 48);
      g.lineTo(cx + 32, cy);
      g.lineTo(cx, cy + 48);
      g.lineTo(cx - 32, cy);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = hex(line);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 48);
    g.lineTo(32, 0);
    g.lineTo(64, 48);
    g.lineTo(32, 96);
    g.closePath();
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 3);
  return texture;
}

/** A satin sleeve with gold piping down its length. */
function piped(ground: number, line: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 8;
  const g = canvas.getContext('2d');
  const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
  if (g != null) {
    g.fillStyle = hex(ground);
    g.fillRect(0, 0, 128, 8);
    g.fillStyle = hex(line);
    for (const x of [14, 22, 78, 86]) g.fillRect(x, 0, 3, 8);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

const yAxis = new Vector3(0, 1, 0);
const span = new Vector3();
const dir = new Vector3();
const bend = new Vector3();

/**
 * Two bones from `root` toward `target`: where the middle joint is, bent
 * toward `pole`. A target out of reach leaves the limb straight at full length.
 * Returns the end actually reached.
 */
export function reach(root: Vector3, target: Vector3, first: number, second: number, pole: Vector3, joint: Vector3, end: Vector3): void {
  dir.copy(target).sub(root);
  const asked = dir.length();
  if (asked < 1e-5) dir.set(0, -1, 0);
  else dir.divideScalar(asked);
  const far = Math.min(asked, first + second - 1e-3);
  const near = Math.max(far, Math.abs(first - second) + 1e-3);
  const along = (first * first - second * second + near * near) / (2 * near);
  const out = Math.sqrt(Math.max(0, first * first - along * along));
  bend.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-6) bend.set(dir.y, -dir.x, 0);
  bend.normalize();
  joint.copy(root).addScaledVector(dir, along).addScaledVector(bend, out);
  end.copy(root).addScaledVector(dir, near);
}

/** Which of the eight joints' balls is which. */
const BALL = { shoulder: 0, elbow: 2, hip: 4, knee: 6 } as const;

/**
 * Drawn in eight calls, whatever the pose: the trunk is one mesh, and every
 * limb is a copy of the same tube, every joint a copy of the same ball,
 * placed afresh each frame.
 */
export class PerformerBody {
  readonly root = new Group();
  private readonly torso = new Group();
  private readonly sleeves: InstancedMesh;
  private readonly hose: InstancedMesh;
  private readonly balls: InstancedMesh;
  private readonly cuffs: InstancedMesh;
  private readonly slippers: InstancedMesh;
  private readonly mitts: InstancedMesh | null = null;
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly forward = new Vector3();
  private readonly neck = new Vector3();
  private readonly hips = new Vector3();
  private readonly frame = new Matrix4();
  private readonly put = new Matrix4();
  private readonly turn = new Quaternion();
  private readonly size = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly c = new Vector3();
  private readonly joint = new Vector3();
  private readonly end = new Vector3();
  private readonly pole = new Vector3();
  private readonly footUp = new Vector3();
  private readonly footRight = new Vector3();

  constructor(look: BodyLook = PLAYER_LOOK) {
    this.root.name = look.head ? 'Performer' : 'PlayerBody';
    const suit = new MeshStandardMaterial({ color: 0xffffff, map: sequins(look.suit, look.trim), roughness: 0.38, metalness: 0.25 });
    const satin = new MeshStandardMaterial({ color: 0xffffff, map: piped(look.suit, look.trim), roughness: 0.42, metalness: 0.1 });
    const trim = new MeshStandardMaterial({ color: look.trim, roughness: 0.25, metalness: 0.6 });
    const tights = new MeshStandardMaterial({ color: 0xffffff, map: harlequin(look.tights, look.suit, look.trim), roughness: 0.7 });
    const shoes = new MeshStandardMaterial({ color: look.shoes, roughness: 0.4, metalness: 0.1 });
    const plain = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

    // The trunk, built upright from the hips at its origin (x right, y up the spine, z back): four shapes baked into one mesh.
    const part = (geometry: BufferGeometry, y: number, sx: number, sy: number, sz: number): BufferGeometry => {
      geometry.scale(sx, sy, sz);
      geometry.translate(0, y, 0);
      return geometry;
    };
    const trunk = mergeGeometries([
      part(new CylinderGeometry(0.14, 0.12, BODY.spine * 0.55, 18), BODY.spine * 0.3, 1, 1, 0.6),
      part(new CylinderGeometry(0.17, 0.14, BODY.spine * 0.5, 18), BODY.spine * 0.78, 1, 1, 0.5),
      part(new SphereGeometry(0.19, 14, 10), BODY.spine * 1.0, 0.98, 0.36, 0.48),
      part(new SphereGeometry(0.15, 14, 10), 0, 1, 0.7, 0.72),
    ]);
    if (trunk != null) this.torso.add(new Mesh(trunk, suit));
    const belt = new Mesh(new TorusGeometry(0.128, 0.014, 8, 28), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = BODY.spine * 0.18;
    belt.scale.y = 0.68;
    this.torso.add(belt);
    if (look.head) {
      const skin = new MeshStandardMaterial({ color: look.skin, roughness: 0.65 });
      const headAt = new Group();
      const skull = new Mesh(new SphereGeometry(0.105, 14, 10), skin);
      skull.scale.set(0.92, 1.1, 1);
      const hair = new Mesh(new SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.8 }));
      hair.scale.set(0.95, 1.08, 1.04);
      hair.position.y = 0.012;
      const throat = new Mesh(new CylinderGeometry(0.048, 0.055, 0.1, 10), skin);
      throat.position.y = -0.14;
      headAt.add(skull, hair, throat);
      headAt.position.y = BODY.spine + 0.19;
      this.torso.add(headAt);
    }
    this.root.add(this.torso);

    // One tube a metre long from its origin up +y, a little thinner at its far end: every bone is a copy of it, stretched and thickened.
    const tube = (taper: number): BufferGeometry => {
      const geometry = new CylinderGeometry(taper, 1, 1, 14, 1);
      geometry.translate(0, 0.5, 0);
      return geometry;
    };
    this.sleeves = new InstancedMesh(tube(0.83), satin, 4);
    this.hose = new InstancedMesh(tube(0.72), tights, 4);
    this.balls = new InstancedMesh(new SphereGeometry(1, 14, 10), plain, 8);
    const suitColour = new Color(look.suit);
    const hoseColour = new Color(look.tights);
    for (let k = 0; k < 8; k += 1) this.balls.setColorAt(k, k >= BALL.knee ? hoseColour : suitColour);
    // A deep cuff: it runs on past the sleeve's end and over the wrist of the hand, so no gap shows between them.
    const cuff = new CylinderGeometry(0.036, 0.033, 0.09, 14);
    cuff.translate(0, 0.02, 0);
    this.cuffs = new InstancedMesh(cuff, trim, 2);
    // A slipper with its toe: the sole square to the shin, the toe ahead (-z).
    const shoe = new SphereGeometry(0.05, 14, 10);
    shoe.scale(0.8, 0.62, 2.1);
    shoe.translate(0, 0.02, -0.06);
    this.slippers = new InstancedMesh(shoe, shoes, 2);
    this.root.add(this.sleeves, this.hose, this.balls, this.cuffs, this.slippers);
    if (look.head) {
      const mitt = new SphereGeometry(0.047, 12, 10);
      mitt.scale(0.8, 1.25, 0.55);
      mitt.translate(0, 0.075, 0);
      this.mitts = new InstancedMesh(mitt, new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9, emissive: 0xf4f1ea, emissiveIntensity: 0.3 }), 2);
      this.root.add(this.mitts);
    }
    this.root.traverse((o) => {
      o.pointerEvents = 'none';
      o.frustumCulled = false;
    });
  }

  /**
   * The trunk: the base of the neck, a point the hips lie toward (the spine
   * keeps its own length), and the way the chest faces.
   */
  spine(neck: Vector3, hipsToward: Vector3, forward: Vector3): void {
    this.neck.copy(neck);
    this.up.copy(neck).sub(hipsToward);
    if (this.up.lengthSq() < 1e-8) this.up.set(0, 1, 0);
    this.up.normalize();
    this.hips.copy(neck).addScaledVector(this.up, -BODY.spine);
    // Forward made square to the spine; right from the two.
    this.forward.copy(forward).addScaledVector(this.up, -forward.dot(this.up));
    if (this.forward.lengthSq() < 1e-8) this.forward.set(1, 0, 0);
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    // The trunk's own z is its back.
    this.c.copy(this.forward).negate();
    this.frame.makeBasis(this.right, this.up, this.c);
    this.torso.position.copy(this.hips);
    this.torso.quaternion.setFromRotationMatrix(this.frame);
  }

  /** Where the hips are after `spine` (world). */
  hipsAt(into: Vector3): Vector3 {
    return into.copy(this.hips);
  }

  /** One arm to a wrist in the world; null, or a wrist out of reach, rests it by the side. */
  arm(side: Side, wrist: Vector3 | null): void {
    const s = sign(side);
    const n = side === 'left' ? 0 : 1;
    const shoulder = this.a.copy(this.neck).addScaledVector(this.right, s * BODY.shoulderHalf).addScaledVector(this.up, -0.07);
    const target = this.b;
    if (wrist != null && wrist.distanceTo(shoulder) <= BODY.armReach) target.copy(wrist);
    else target.copy(shoulder).addScaledVector(this.up, -0.46).addScaledVector(this.forward, 0.16).addScaledVector(this.right, s * 0.05);
    // Elbows fall down, out and a little back.
    this.pole.copy(this.up).multiplyScalar(-0.75).addScaledVector(this.right, s * 0.55).addScaledVector(this.forward, -0.35);
    reach(shoulder, target, BODY.upperArm, BODY.forearm, this.pole, this.joint, this.end);
    // A sleeve follows its hand even a little past the bones' length, so the cuff never leaves the wrist.
    if (target.distanceTo(this.joint) <= BODY.forearm * 1.3) this.end.copy(target);
    this.bone(this.sleeves, n * 2, shoulder, this.joint, 0.043);
    this.bone(this.sleeves, n * 2 + 1, this.joint, this.end, 0.036);
    this.ball(BALL.shoulder + n, shoulder, 0.05);
    this.ball(BALL.elbow + n, this.joint, 0.037);
    span.copy(this.end).sub(this.joint);
    if (span.lengthSq() > 1e-8) this.turn.setFromUnitVectors(yAxis, span.normalize());
    this.put.compose(this.end, this.turn, this.size.set(1, 1, 1));
    this.cuffs.setMatrixAt(n, this.put);
    this.cuffs.instanceMatrix.needsUpdate = true;
    if (this.mitts != null) {
      this.mitts.setMatrixAt(n, this.put);
      this.mitts.instanceMatrix.needsUpdate = true;
    }
  }

  /** One leg to a foot in the world; knees bend toward `knee` (default: ahead and up). */
  leg(side: Side, foot: Vector3, knee?: Vector3): void {
    const s = sign(side);
    const n = side === 'left' ? 0 : 1;
    const hip = this.a.copy(this.hips).addScaledVector(this.right, s * BODY.hipHalf);
    if (knee != null) this.pole.copy(knee);
    else this.pole.copy(this.forward).addScaledVector(this.up, 0.6).addScaledVector(this.right, s * 0.12);
    reach(hip, foot, BODY.thigh, BODY.shin, this.pole, this.joint, this.end);
    this.bone(this.hose, n * 2, hip, this.joint, 0.078);
    this.bone(this.hose, n * 2 + 1, this.joint, this.end, 0.055);
    this.ball(BALL.hip + n, hip, 0.08);
    this.ball(BALL.knee + n, this.joint, 0.057);
    // The foot: its sole square to the shin, its toe ahead.
    span.copy(this.end).sub(this.joint);
    if (span.lengthSq() > 1e-8) {
      span.normalize();
      this.c.copy(this.forward).addScaledVector(span, -this.forward.dot(span));
      if (this.c.lengthSq() < 1e-6) this.c.copy(this.up);
      this.c.normalize().negate();
      this.footUp.copy(span).negate();
      this.footRight.crossVectors(this.footUp, this.c).normalize();
      this.frame.makeBasis(this.footRight, this.footUp, this.c);
      this.turn.setFromRotationMatrix(this.frame);
    }
    this.put.compose(this.end, this.turn, this.size.set(1, 1, 1));
    this.slippers.setMatrixAt(n, this.put);
    this.slippers.instanceMatrix.needsUpdate = true;
  }

  /** One copy of the tube from `from` to `to`, `thick` at its near end. */
  private bone(mesh: InstancedMesh, index: number, from: Vector3, to: Vector3, thick: number): void {
    span.copy(to).sub(from);
    const length = Math.max(1e-4, span.length());
    this.turn.setFromUnitVectors(yAxis, span.divideScalar(length));
    this.put.compose(from, this.turn, this.size.set(thick, length, thick));
    mesh.setMatrixAt(index, this.put);
    mesh.instanceMatrix.needsUpdate = true;
  }

  private ball(index: number, at: Vector3, radius: number): void {
    this.turn.identity();
    this.put.compose(at, this.turn, this.size.setScalar(radius));
    this.balls.setMatrixAt(index, this.put);
    this.balls.instanceMatrix.needsUpdate = true;
  }

  set visible(on: boolean) {
    this.root.visible = on;
  }

  get visible(): boolean {
    return this.root.visible;
  }
}
