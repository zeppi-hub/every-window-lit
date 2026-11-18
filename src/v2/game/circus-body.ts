import { CanvasTexture, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, type Object3D, RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from '@iwsdk/core';

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

/** A limb segment: a tapered tube one metre long from its origin along +y, stretched between two joints. */
function bone(thick: number, thin: number, material: MeshStandardMaterial): Mesh {
  const geometry = new CylinderGeometry(thin, thick, 1, 14, 1);
  geometry.translate(0, 0.5, 0);
  return new Mesh(geometry, material);
}

function ball(radius: number, material: MeshStandardMaterial): Mesh {
  return new Mesh(new SphereGeometry(radius, 14, 10), material);
}

const yAxis = new Vector3(0, 1, 0);
const span = new Vector3();
const dir = new Vector3();
const bend = new Vector3();

function between(mesh: Object3D, from: Vector3, to: Vector3): void {
  span.copy(to).sub(from);
  const length = span.length();
  mesh.position.copy(from);
  mesh.scale.set(1, Math.max(1e-4, length), 1);
  if (length > 1e-5) mesh.quaternion.setFromUnitVectors(yAxis, span.divideScalar(length));
}

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

interface Limb {
  first: Mesh;
  second: Mesh;
  joint: Mesh;
  root: Mesh;
  end: Object3D;
}

export class PerformerBody {
  readonly root = new Group();
  private readonly torso = new Group();
  private readonly arms: Record<Side, Limb>;
  private readonly legs: Record<Side, Limb>;
  private readonly head: Group | null = null;
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly forward = new Vector3();
  private readonly neck = new Vector3();
  private readonly hips = new Vector3();
  private readonly frame = new Matrix4();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly c = new Vector3();
  private readonly pole = new Vector3();

  constructor(look: BodyLook = PLAYER_LOOK) {
    this.root.name = look.head ? 'Performer' : 'PlayerBody';
    const suit = new MeshStandardMaterial({ color: 0xffffff, map: sequins(look.suit, look.trim), roughness: 0.38, metalness: 0.25 });
    const satin = new MeshStandardMaterial({ color: 0xffffff, map: piped(look.suit, look.trim), roughness: 0.42, metalness: 0.1 });
    const trim = new MeshStandardMaterial({ color: look.trim, roughness: 0.25, metalness: 0.9 });
    const tights = new MeshStandardMaterial({ color: 0xffffff, map: harlequin(look.tights, look.suit, look.trim), roughness: 0.7 });
    const shoes = new MeshStandardMaterial({ color: look.shoes, roughness: 0.4, metalness: 0.1 });
    const skin = new MeshStandardMaterial({ color: look.skin, roughness: 0.65 });

    // The trunk, built upright from the hips at its origin (x right, y up the spine, z back).
    const waist = new Mesh(new CylinderGeometry(0.14, 0.12, BODY.spine * 0.55, 18), suit);
    waist.position.y = BODY.spine * 0.3;
    waist.scale.z = 0.6;
    const chest = new Mesh(new CylinderGeometry(0.17, 0.14, BODY.spine * 0.5, 18), suit);
    chest.position.y = BODY.spine * 0.78;
    chest.scale.z = 0.5;
    const yoke = ball(0.19, suit);
    yoke.position.y = BODY.spine * 1.0;
    yoke.scale.set(0.98, 0.36, 0.48);
    const pelvis = ball(0.15, suit);
    pelvis.scale.set(1, 0.7, 0.72);
    const belt = new Mesh(new TorusGeometry(0.128, 0.014, 8, 28), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = BODY.spine * 0.18;
    belt.scale.y = 0.68;
    this.torso.add(waist, chest, yoke, pelvis, belt);
    if (look.head) {
      this.head = new Group();
      const skull = ball(0.105, skin);
      skull.scale.set(0.92, 1.1, 1);
      const hair = new Mesh(new SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.8 }));
      hair.scale.set(0.95, 1.08, 1.04);
      hair.position.y = 0.012;
      const throat = new Mesh(new CylinderGeometry(0.048, 0.055, 0.1, 10), skin);
      throat.position.y = -0.14;
      this.head.add(skull, hair, throat);
      this.head.position.y = BODY.spine + 0.19;
      this.torso.add(this.head);
    }
    this.root.add(this.torso);

    const arm = (): Limb => {
      const cuff = new Group();
      const band = new Mesh(new CylinderGeometry(0.033, 0.031, 0.035, 14), trim);
      cuff.add(band);
      if (look.head) {
        const hand = ball(0.047, new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9, emissive: 0xf4f1ea, emissiveIntensity: 0.3 }));
        hand.scale.set(0.8, 1.25, 0.55);
        hand.position.y = 0.075;
        cuff.add(hand);
      }
      const limb: Limb = { first: bone(0.043, 0.036, satin), second: bone(0.036, 0.029, satin), joint: ball(0.037, satin), root: ball(0.05, suit), end: cuff };
      this.root.add(limb.first, limb.second, limb.joint, limb.root, limb.end);
      return limb;
    };
    const leg = (): Limb => {
      const foot = new Group();
      const slipper = ball(0.05, shoes);
      slipper.scale.set(0.8, 0.62, 2.1);
      slipper.position.set(0, 0.02, -0.06);
      const toe = ball(0.03, trim);
      toe.scale.set(1, 0.7, 1);
      toe.position.set(0, 0.022, -0.15);
      foot.add(slipper, toe);
      const limb: Limb = { first: bone(0.078, 0.056, tights), second: bone(0.055, 0.038, tights), joint: ball(0.057, tights), root: ball(0.08, suit), end: foot };
      this.root.add(limb.first, limb.second, limb.joint, limb.root, limb.end);
      return limb;
    };
    this.arms = { left: arm(), right: arm() };
    this.legs = { left: leg(), right: leg() };
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
    const limb = this.arms[side];
    const s = sign(side);
    const shoulder = this.a.copy(this.neck).addScaledVector(this.right, s * BODY.shoulderHalf).addScaledVector(this.up, -0.07);
    const target = this.b;
    if (wrist != null && wrist.distanceTo(shoulder) <= BODY.armReach) target.copy(wrist);
    else target.copy(shoulder).addScaledVector(this.up, -0.46).addScaledVector(this.forward, 0.16).addScaledVector(this.right, s * 0.05);
    // Elbows fall down, out and a little back.
    this.pole.copy(this.up).multiplyScalar(-0.75).addScaledVector(this.right, s * 0.55).addScaledVector(this.forward, -0.35);
    this.place(limb, shoulder, target, BODY.upperArm, BODY.forearm, this.pole, true);
  }

  /** One leg to a foot in the world; knees bend toward `knee` (default: ahead and up). */
  leg(side: Side, foot: Vector3, knee?: Vector3): void {
    const limb = this.legs[side];
    const s = sign(side);
    const hip = this.a.copy(this.hips).addScaledVector(this.right, s * BODY.hipHalf);
    if (knee != null) this.pole.copy(knee);
    else this.pole.copy(this.forward).addScaledVector(this.up, 0.6).addScaledVector(this.right, s * 0.12);
    this.place(limb, hip, foot, BODY.thigh, BODY.shin, this.pole, false);
  }

  private place(limb: Limb, root: Vector3, target: Vector3, first: number, second: number, pole: Vector3, followTarget: boolean): void {
    const joint = limb.joint.position;
    const end = limb.end.position;
    reach(root, target, first, second, pole, joint, end);
    limb.root.position.copy(root);
    between(limb.first, root, joint);
    // A sleeve follows its hand even a little past the bones' length, so the cuff never leaves the wrist.
    if (followTarget && target.distanceTo(joint) <= second * 1.3) end.copy(target);
    between(limb.second, joint, end);
    span.copy(end).sub(joint);
    if (span.lengthSq() > 1e-8) {
      span.normalize();
      if (followTarget) limb.end.quaternion.setFromUnitVectors(yAxis, span);
      else {
        // A foot: its sole square to the shin, its toe ahead.
        this.c.copy(this.forward).addScaledVector(span, -this.forward.dot(span));
        if (this.c.lengthSq() < 1e-6) this.c.copy(this.up);
        this.c.normalize().negate();
        const upFoot = span.clone().negate();
        const rightFoot = new Vector3().crossVectors(upFoot, this.c).normalize();
        this.frame.makeBasis(rightFoot, upFoot, this.c);
        limb.end.quaternion.setFromRotationMatrix(this.frame);
      }
    }
  }

  set visible(on: boolean) {
    this.root.visible = on;
  }

  get visible(): boolean {
    return this.root.visible;
  }
}
