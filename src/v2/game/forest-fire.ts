import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';
import { HIDDEN } from '../../station/reactions.js';
import { setDeskMode } from '../desk-hands.js';
import { setGoal } from '../goal.js';
import { placeGoal } from '../goal-system.js';
import { dig, eased, FOREST, type ForestRun, type ForestStage, gusting, nearness, newSpade, smother, SPADE, startForest, stepForest, stepSpade } from '../fire-line.js';
import { wordBadge } from '../icons.js';
import { endMiniGame, MiniGame, type Phase, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { featherMesh, stowWing } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { type BodyLook, PerformerBody } from './circus-body.js';
import { wristOf } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { Extra, fireProp, glideIn, giveFeather, handPoint, keyLight, loadFireProps, type Side, SIDES, softFlame, takes, ViewEdge } from './flight.js';
import { Flames, makeGlow } from './fx.js';
import { WORDS } from './lines.js';
import { FEATHER } from './opening.js';
import { type Weather, WEATHER } from './stage.js';

/**
 * S09, the forest memory. Inside it the player is the ranger: her own
 * gloved hands, no wing. She kneels at the edge of a firebreak that is only
 * half dug, a spade standing in the ground before her and a wet sack over
 * her knee. A fire front as tall as the trees comes through the forest
 * toward her; every two full strokes of the spade clear one more piece of
 * the line, and she shuffles along to the next. The line finished before
 * the front arrives, the fire reaches bare earth and dies there. A piece
 * left, and it crosses: the view goes dark (nobody is shown burning) and
 * that stage starts again.
 *
 * Three stages, each harder (v2/fire-line.ts holds the numbers): the front,
 * then a faster front with embers thrown over the line (smothered with the
 * sack), then the wind turns and the fire comes from the east along the
 * second line. The very first piece is a rehearsal: the fire stands off
 * among the trees until it is dug.
 *
 * The camera is never turned by the game. Shuffling along the line is a
 * short sideways slide, or with less motion a jump.
 */

/** The eye above the ground, kneeling; and how far back from the middle of the trench (m). */
const EYE = 1.2;
const KNEEL_BACK = 0.75;
/** Half the trench's width (art/v2/yangin: 1 m wide), and how far beyond its far edge the flames stop. */
const HALF_TRENCH = 0.5;
const STOP_BEYOND = 0.7;
/** How far a piece's ground has sunk by the time it is nearly dug (m). */
const SUNK = 0.15;
/** How far forward of straight down the spade hangs in the hand (radians), and how near a hand must come to its grip to take it (m). */
const SPADE_TILT = 0.6;
const TAKE_REACH = 0.13;
/** The shuffle to the next piece (s). */
const SHUFFLE = 0.7;
/** Where the fire stands during the rehearsal (m from the line), and how strong it burns there. */
const STAND_OFF = FOREST.stages[0].from;
/** Cards of flame in the front, the embers in the air, clods of earth in flight. */
const EMBERS = 320;
const CLODS = 21;
/** How the fire's two lights fall off with distance. */
const LIGHT_DECAY = 1.35;
/** The forest at night, far from the fire and with it at the line: the fire is the light. */
/** The night's own light: the scene's sun turned down to this, cold. */
const NIGHT = { moon: 0.3, colour: 0x8ea8d0 } as const;
const DUSK: Weather = { sky: 0x06070c, fog: 0x0d0b0c, density: 0.03, light: 0.07 };
const ABLAZE: Weather = { sky: 0x30100a, fog: 0x401a0c, density: 0.04, light: 0.12 };

interface Piece {
  dig: Vector3;
  cover: Object3D | null;
  /** The cover's own height, undisturbed. */
  rest: number;
}

/** One firebreak: its pieces in the order they are dug, the way to the fire, the way along, and the heading that faces the fire. */
interface Line {
  pieces: Piece[];
  across: Vector3;
  along: Vector3;
  yaw: number;
  step: number;
  /** Its pieces' places in the mounds' mesh start here. */
  slot: number;
}

function readLine(d: DirectorSystem, tag: string, count: number, across: Vector3, along: Vector3, yaw: number, slot: number): Line {
  const pieces: Piece[] = [];
  for (let i = 1; i <= count; i += 1) {
    const n = String(i).padStart(2, '0');
    const cover = d.stage.node('forest', `${tag}_cover_${n}`);
    pieces.push({ dig: d.stage.point('forest', `${tag}_dig_${n}`, new Vector3()), cover, rest: cover?.position.y ?? 0 });
  }
  pieces.sort((a, b) => a.dig.dot(along) - b.dig.dot(along));
  const step = pieces.length > 1 ? pieces[0].dig.distanceTo(pieces[pieces.length - 1].dig) / (pieces.length - 1) : 1.25;
  return { pieces, across, along, yaw, step, slot };
}

/** A soft round blob of light, for the glow over the fire. */
function blobTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(64, 84, 4, 64, 84, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
}

const up = new Vector3(0, 1, 0);
const m4 = new Matrix4();
const q4 = new Quaternion();
const v3 = new Vector3();
const s3 = new Vector3();

/**
 * The fire, built the way the circus hoops are: single tongues of flame,
 * each on its own beat, an outer redder one and an inner whiter one at
 * every place along the leading edge, so the edge reads as a wall of
 * separate flames and not a smear. Behind it the crowns burn (a few tall,
 * slow, deep red flames over the tree tops), and the trunks the edge has
 * passed stand alight from foot to top. Smoke rolls up over it, embers
 * blow from it over the player, and two lights carry its colour onto the
 * ground and the trees. It is night: the fire is the light.
 * The scene says where the leading edge is and how strong it burns.
 */
const PLACES = 36;
const CROWNS = 12;
const TORCHES = 14;
const FLAME_CARDS = PLACES * 2 + CROWNS + TORCHES * 3;
const PUFFS = 10;

class Wildfire {
  /** The middle of the leading edge on the ground, the way along it, and the way it is going. */
  readonly centre = new Vector3();
  readonly along = new Vector3(1, 0, 0);
  readonly toward = new Vector3(0, 0, 1);
  half = 4;
  /** 0 out, 1 full; how near the line it is (0..1), for the light; and how far the edge still is from where it stops (m). */
  power = 0;
  near = 0;
  distance = 0;
  private readonly flames: InstancedMesh;
  private readonly trunks: InstancedMesh;
  private readonly smoke: InstancedMesh;
  private readonly glow: Mesh;
  private readonly lights: PointLight[];
  private readonly embers: Points;
  private readonly at: Float32Array;
  private readonly speed: Float32Array;
  private readonly life: Float32Array;
  private readonly place: { u: number; phase: number; tall: number }[] = [];
  private readonly crown: { u: number; phase: number; tall: number; wide: number; back: number }[] = [];
  private readonly torch: { at: Vector3; tall: number; depth: number; lit: number }[] = [];
  private readonly puff: { u: number; phase: number; back: number }[] = [];
  private t = 0;
  private seed = 5;

  constructor(add: <T extends Object3D>(object: T) => T) {
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.3, 0);
    this.flames = add(new InstancedMesh(geometry, new MeshBasicMaterial({ map: softFlame(), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide, toneMapped: false }), FLAME_CARDS));
    this.flames.name = 'FireFront';
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 3;
    // Kept under full brightness: where many tongues overlap at the line they add up to fire, not to a white sheet.
    const outer = new Color(0xd9440e);
    const inner = new Color(0xe8a84e);
    const deep = new Color(0xd8300a);
    for (let i = 0; i < PLACES; i += 1) this.place.push({ u: ((i + 0.5 + (this.random() - 0.5) * 0.7) / PLACES) * 2 - 1, phase: this.random(), tall: 2.1 + this.random() * 1.9 });
    for (let i = 0; i < CROWNS; i += 1) this.crown.push({ u: ((i + this.random()) / CROWNS) * 2 - 1, phase: this.random(), tall: 8 + this.random() * 5, wide: 3 + this.random() * 1.8, back: 2.5 + this.random() * 4 });
    for (let i = 0; i < TORCHES; i += 1) this.torch.push({ at: new Vector3(), tall: 6 + this.random() * 3.5, depth: 0, lit: -1 });
    for (let i = 0; i < PUFFS; i += 1) this.puff.push({ u: this.random() * 2 - 1, phase: i / PUFFS, back: 1 + this.random() * 6 });
    for (let i = 0; i < FLAME_CARDS; i += 1) {
      this.flames.setColorAt(i, i < PLACES * 2 ? (i % 2 === 0 ? outer : inner) : i < PLACES * 2 + CROWNS ? deep : (i - PLACES * 2 - CROWNS) % 3 === 2 ? inner : outer);
      this.flames.setMatrixAt(i, HIDDEN);
    }
    // The trunks that will stand alight: bare, charred, tapering.
    const trunk = new CylinderGeometry(0.05, 0.17, 1, 7);
    trunk.translate(0, 0.5, 0);
    this.trunks = add(new InstancedMesh(trunk, new MeshStandardMaterial({ color: 0x0d0b0a, roughness: 1 }), TORCHES));
    this.trunks.name = 'FireTrunks';
    this.trunks.frustumCulled = false;
    for (let i = 0; i < TORCHES; i += 1) this.trunks.setMatrixAt(i, HIDDEN);
    const blob = blobTexture();
    this.smoke = add(new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: blob, color: 0x241510, transparent: true, opacity: 0.62, depthWrite: false, fog: false, toneMapped: false }), PUFFS));
    this.smoke.name = 'FireSmoke';
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    this.glow = add(new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: blob, color: 0xff5a14, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })));
    this.glow.name = 'FireGlow';
    this.glow.renderOrder = 1;
    this.lights = [0, 1].map(() => add(new PointLight(0xff6a22, 0, 120, LIGHT_DECAY)));
    const places = new Float32Array(EMBERS * 3);
    this.at = places;
    this.speed = new Float32Array(EMBERS * 3);
    this.life = new Float32Array(EMBERS);
    const points = new BufferGeometry();
    points.setAttribute('position', new BufferAttribute(places, 3));
    this.embers = add(new Points(points, new PointsMaterial({ map: blob, color: 0xffa040, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })));
    this.embers.name = 'FireEmbers';
    this.embers.frustumCulled = false;
    for (const o of [this.flames, this.trunks, this.smoke, this.glow, this.embers]) o.pointerEvents = 'none';
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * Stand the trunks for a new approach: scattered over the ground the edge
   * will cross, from `stop` (the middle of where it ends, on the ground)
   * back `deep` m, `half` m to either side. None is alight yet.
   */
  plant(stop: Vector3, along: Vector3, toward: Vector3, half: number, deep: number): void {
    this.torch.forEach((torch, i) => {
      torch.depth = 2.5 + ((i + this.random() * 0.8) / TORCHES) * Math.max(4, deep - 4);
      torch.at.copy(stop).addScaledVector(along, (this.random() * 2 - 1) * (half + 1.5)).addScaledVector(toward, -torch.depth);
      torch.lit = -1;
      q4.setFromAxisAngle(up, i);
      this.trunks.setMatrixAt(i, m4.compose(torch.at, q4, s3.set(1, torch.tall, 1)));
    });
    this.trunks.instanceMatrix.needsUpdate = true;
  }

  /** Turn q4 so a card at `at` faces the eye (about the upright only). */
  private face(at: Vector3, eye: Vector3): void {
    q4.setFromAxisAngle(up, Math.atan2(eye.x - at.x, eye.z - at.z));
  }

  /** Put every trunk out again (the same approach, played again). */
  unlight(): void {
    for (const torch of this.torch) torch.lit = -1;
  }

  /** The nearest point of the leading edge to `to`, `high` m up: where an ember leaves from. */
  edgeNear(to: Vector3, high: number, out: Vector3): Vector3 {
    const u = Math.max(-this.half, Math.min(this.half, v3.copy(to).sub(this.centre).dot(this.along)));
    return out.copy(this.centre).addScaledVector(this.along, u).setY(this.centre.y + high);
  }

  update(delta: number, eye: Vector3): void {
    this.t += delta;
    const t = this.t;
    const on = this.power > 0.01;
    this.flames.visible = on;
    this.glow.visible = on;
    this.embers.visible = on;
    this.smoke.visible = on;
    const breath = 0.86 + 0.09 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 19);
    this.lights.forEach((light, k) => {
      light.position.copy(this.centre).addScaledVector(this.along, (k === 0 ? -0.45 : 0.45) * this.half).addScaledVector(this.toward, 1.2);
      light.position.y = this.centre.y + 2.6;
      // As bright where she kneels as the fire is near, never more: the ground by the fire is brighter, hers is not burnt out to white.
      const far = Math.max(2.5, light.position.distanceTo(eye));
      light.intensity = on ? Math.min(900, (0.8 + 2.3 * this.near) * far ** LIGHT_DECAY) * this.power * breath : 0;
    });
    if (!on) return;
    let n = 0;
    // The leading edge: at every place an outer and an inner tongue, each licking on its own beat.
    for (let i = 0; i < PLACES; i += 1) {
      const p = this.place[i];
      const beat = 0.8 + 0.3 * Math.sin(t * (6 + (i % 5)) + i * 1.7) + 0.2 * Math.sin(t * 14 + i);
      // Lower toward its two ends, so the wall runs out into the wood and is not cut off square.
      const tall = Math.max(0.3, beat) * p.tall * this.power * (1 - 0.62 * Math.abs(p.u) ** 3);
      v3.copy(this.centre).addScaledVector(this.along, p.u * (this.half + 2.5) + 0.12 * Math.sin(t * 2.1 + p.phase * 9));
      this.face(v3, eye);
      const wide = Math.min(1, this.power);
      this.flames.setMatrixAt(n, m4.compose(v3, q4, s3.set(1.25 * wide, tall, 1)));
      v3.addScaledVector(this.toward, 0.06);
      this.flames.setMatrixAt(n + 1, m4.compose(v3, q4, s3.set(0.72 * wide, tall * 0.6, 1)));
      n += 2;
    }
    // The crowns: tall and slow, over the tree tops behind the edge.
    for (let i = 0; i < CROWNS; i += 1) {
      const c = this.crown[i];
      const beat = 0.85 + 0.2 * Math.sin(t * (2.2 + (i % 3) * 0.5) + c.phase * 17) + 0.08 * Math.sin(t * 9 + c.phase * 31);
      v3.copy(this.centre)
        .addScaledVector(this.along, c.u * (this.half + 1.5) + 0.5 * Math.sin(t * 0.9 + c.phase * 9))
        .addScaledVector(this.toward, -c.back);
      this.face(v3, eye);
      this.flames.setMatrixAt(n, m4.compose(v3, q4, s3.set(c.wide * Math.min(1, this.power), c.tall * this.power * beat * (1 - 0.5 * Math.abs(c.u) ** 2), 1)));
      n += 1;
    }
    // The trunks the edge has passed catch from the foot up and stand alight.
    for (let i = 0; i < TORCHES; i += 1) {
      const torch = this.torch[i];
      if (torch.lit < 0 && this.distance <= torch.depth - 0.4) torch.lit = t;
      for (let k = 0; k < 3; k += 1) {
        const grown = torch.lit < 0 ? 0 : Math.max(0, Math.min(1, (t - torch.lit - k * 0.7) / 0.9));
        if (grown <= 0) {
          this.flames.setMatrixAt(n, HIDDEN);
          n += 1;
          continue;
        }
        const beat = 0.85 + 0.25 * Math.sin(t * (7 + k) + i * 2.3 + k) + 0.1 * Math.sin(t * 15 + i);
        v3.copy(torch.at);
        v3.y += torch.tall * (0.05 + k * 0.3);
        this.face(v3, eye);
        this.flames.setMatrixAt(n, m4.compose(v3, q4, s3.set((1.9 - k * 0.45) * grown, torch.tall * 0.42 * beat * grown * this.power, 1)));
        n += 1;
      }
    }
    this.flames.instanceMatrix.needsUpdate = true;
    // Smoke: dark billows rolling up from behind the edge and leaning over the line with the wind.
    for (let i = 0; i < PUFFS; i += 1) {
      const p = this.puff[i];
      const k = (t * 0.07 + p.phase) % 1;
      v3.copy(this.centre)
        .addScaledVector(this.along, p.u * (this.half + 2))
        .addScaledVector(this.toward, -p.back + k * 9);
      v3.y = this.centre.y + 4 + k * 16;
      this.face(v3, eye);
      const size = (7 + 9 * k) * Math.min(1, this.power * 1.4) * Math.sin(Math.min(1, k * 5) * Math.PI * 0.5) * (1 - Math.max(0, (k - 0.75) * 4));
      this.smoke.setMatrixAt(i, m4.compose(v3, q4, s3.set(size, size, 1)));
    }
    this.smoke.instanceMatrix.needsUpdate = true;
    // The glow stands over the fire, turned to the eye, wider and brighter as it nears.
    this.glow.position.copy(this.centre).addScaledVector(this.toward, -4);
    this.glow.position.y = this.centre.y + 7;
    this.glow.quaternion.setFromAxisAngle(up, Math.atan2(eye.x - this.glow.position.x, eye.z - this.glow.position.z));
    this.glow.scale.set(this.half * 4 + 16, 30, 1);
    (this.glow.material as MeshBasicMaterial).opacity = (0.32 + 0.3 * this.near) * this.power * breath;
    // Embers: off the edge, up, and over the line on the wind.
    for (let i = 0; i < EMBERS; i += 1) {
      const k = i * 3;
      this.life[i] -= delta;
      if (this.life[i] <= 0) {
        v3.copy(this.centre)
          .addScaledVector(this.along, (this.random() * 2 - 1) * this.half)
          .addScaledVector(this.toward, -this.random() * 4);
        this.at[k] = v3.x;
        this.at[k + 1] = this.centre.y + 0.5 + this.random() * 6;
        this.at[k + 2] = v3.z;
        const wind = 2.5 + this.random() * 5;
        this.speed[k] = this.toward.x * wind + (this.random() - 0.5) * 1.5;
        this.speed[k + 1] = 0.4 + this.random() * 1.8;
        this.speed[k + 2] = this.toward.z * wind + (this.random() - 0.5) * 1.5;
        this.life[i] = 1.5 + this.random() * 4;
        continue;
      }
      this.at[k] += this.speed[k] * delta;
      this.at[k + 1] += this.speed[k + 1] * delta;
      this.at[k + 2] += this.speed[k + 2] * delta;
    }
    (this.embers.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }
}

/** Clods of earth thrown by a stroke of the spade: up, out toward the fire, and down. */
class Clods {
  private readonly mesh: InstancedMesh;
  private readonly at: Vector3[] = [];
  private readonly speed: Vector3[] = [];
  private readonly left: number[] = [];
  private next = 0;

  constructor(add: <T extends Object3D>(object: T) => T, earth: MeshStandardMaterial) {
    this.mesh = add(new InstancedMesh(new SphereGeometry(0.04, 6, 4), earth, CLODS));
    this.mesh.name = 'Clods';
    this.mesh.frustumCulled = false;
    this.mesh.pointerEvents = 'none';
    for (let i = 0; i < CLODS; i += 1) {
      this.at.push(new Vector3());
      this.speed.push(new Vector3());
      this.left.push(0);
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  throw(from: Vector3, toward: Vector3, sideways: Vector3, count: number): void {
    for (let n = 0; n < count; n += 1) {
      const i = this.next;
      this.next = (this.next + 1) % CLODS;
      this.at[i].copy(from);
      this.speed[i]
        .copy(toward)
        .multiplyScalar(1.2 + Math.random() * 1.8)
        .addScaledVector(sideways, (Math.random() - 0.5) * 1.6);
      this.speed[i].y = 1.8 + Math.random() * 1.8;
      this.left[i] = 0.9;
    }
  }

  update(delta: number): void {
    let any = false;
    for (let i = 0; i < CLODS; i += 1) {
      if (this.left[i] <= 0) continue;
      any = true;
      this.left[i] -= delta;
      this.speed[i].y -= 9.8 * delta;
      this.at[i].addScaledVector(this.speed[i], delta);
      q4.setFromAxisAngle(up, i + this.left[i] * 9);
      this.mesh.setMatrixAt(i, this.left[i] <= 0 ? HIDDEN : m4.compose(this.at[i], q4, s3.setScalar(0.7 + (i % 3) * 0.3)));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** A flannel check: a ground colour crossed by darker bands both ways, with a fine pale line through each. */
function plaid(ground: number, across: number, down: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = hex(ground);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(12,10,10,0.5)';
    g.fillRect(0, 8, 64, 20);
    g.fillRect(8, 0, 20, 64);
    g.fillStyle = 'rgba(12,10,10,0.35)';
    g.fillRect(0, 44, 64, 6);
    g.fillRect(44, 0, 6, 64);
    g.fillStyle = 'rgba(240,225,190,0.5)';
    g.fillRect(0, 17, 64, 1.5);
    g.fillRect(17, 0, 1.5, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(across, down);
  return texture;
}

/** A rough weave or worn paint: a mid grey flecked lighter and darker, to multiply a colour by so nothing near her is one flat tone. */
function grain(across = 2, down = 2): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, 64, 64);
    let seed = 3;
    for (let i = 0; i < 700; i += 1) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 64;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 64;
      g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
      g.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(across, down);
  return texture;
}

/** The ranger: a red flannel shirt, canvas trousers, leather belt and boots (the cuffs are her gloves' wrists). */
const RANGER: BodyLook = { suit: 0x8a2a20, trim: 0x4a3320, tights: 0x4a4636, shoes: 0x2a2018, skin: 0xd9a983, head: false };

/**
 * The player's own body as the ranger. The body is the circus performer's
 * (circus-body.ts, shared as it is); its cloth is changed here: the
 * sequins become a flannel check, the harlequin tights plain canvas, the
 * gold trim worn leather.
 */
function buildRanger(head = false): PerformerBody {
  const body = new PerformerBody({ ...RANGER, head });
  const shirt = plaid(RANGER.suit, 7, 5);
  const sleeve = plaid(RANGER.suit, 3, 3);
  const canvas = grain(3, 4);
  const done = new Set<MeshStandardMaterial>();
  body.root.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (material == null || Array.isArray(material) || done.has(material)) return;
    done.add(material);
    material.metalness = 0;
    material.roughness = 0.85;
    if (material.emissive != null && material.emissive.getHex() !== 0) {
      material.emissive.setHex(0x000000);
      material.color.setHex(0x6a4424);
    }
    const across = material.map?.repeat.x ?? 0;
    if (across === 9) material.map = shirt;
    else if (across === 4) {
      material.map = canvas;
      material.color.setHex(RANGER.tights);
    } else if (material.map != null) material.map = sleeve;
    material.needsUpdate = true;
  });
  return body;
}

/** A node of the forest file taken out of where it lies, to be held: its own model, its place and turn cleared. */
function takeModel(d: DirectorSystem, name: string): Object3D | null {
  const node = d.stage.node('forest', name);
  if (node == null) return null;
  node.removeFromParent();
  node.position.set(0, 0, 0);
  node.quaternion.identity();
  node.visible = true;
  node.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return node;
}

function wood(colour: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: colour, roughness: 0.8, map: grain(1, 3) });
}

/** A soft round glow that always faces the eye: a lantern's halo, the feather's light. */
function halo(map: CanvasTexture, colour: number, size: number, opacity: number): Sprite {
  const sprite = new Sprite(new SpriteMaterial({ map, color: colour, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  sprite.scale.set(size, size, 1);
  sprite.pointerEvents = 'none';
  return sprite;
}

/**
 * The spade, its origin at the top of its handle (where it is held) and its
 * blade straight below: the file's rusted spade if it is there, else an ash
 * shaft with a D grip and an iron blade. `long` is from the grip to the
 * blade's edge; `lump` is the earth on the blade while it is loaded.
 */
function buildSpade(model: Object3D | null, earth: MeshStandardMaterial): { spade: Group; long: number; lump: Mesh } {
  const spade = new Group();
  spade.name = 'Spade';
  if (model != null) spade.add(model);
  else {
    const shaft = new Mesh(new CylinderGeometry(0.017, 0.02, 0.8, 8), wood(0xa98458));
    shaft.position.y = -0.45;
    const grip = new Mesh(new TorusGeometry(0.05, 0.012, 6, 14), wood(0x8a6a44));
    const iron = new MeshStandardMaterial({ color: 0x5c5650, roughness: 0.55, metalness: 0.6, map: grain(1, 1) });
    const blade = new Mesh(new BoxGeometry(0.19, 0.27, 0.012), iron);
    blade.position.y = -0.95;
    const socket = new Mesh(new CylinderGeometry(0.022, 0.026, 0.14, 8), iron);
    socket.position.y = -0.8;
    spade.add(shaft, grip, blade, socket);
  }
  spade.updateMatrixWorld(true);
  const long = Math.max(0.8, Math.min(1.25, -new Box3().setFromObject(spade).min.y));
  const lump = new Mesh(new SphereGeometry(1, 8, 6), earth);
  lump.scale.set(0.085, 0.05, 0.075);
  lump.position.set(0, -long + 0.11, 0.035);
  lump.visible = false;
  spade.add(lump);
  spade.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { spade, long, lump };
}

/** The wet sack: burlap hung over a fork, a fold at the top and two halves hanging in soft pleats, the front one longer; its origin at the fold. */
function buildSack(): Group {
  const sack = new Group();
  sack.name = 'WetSack';
  // The modelled sack (burlap_sack.glb), its origin at the top of the fold as here; without the file, plain pleated burlap.
  const real = fireProp('burlap_sack', 'sack');
  if (real != null) {
    real.position.set(0, 0, 0);
    sack.add(real);
    return sack;
  }
  const burlap = new MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1, side: DoubleSide, map: grain(6, 6) });
  const hang = (wide: number, drop: number, out: number): Mesh => {
    const geometry = new PlaneGeometry(wide, drop, 8, 4);
    const at = geometry.getAttribute('position');
    // Pleats, deeper toward the hem.
    for (let i = 0; i < at.count; i += 1) at.setZ(i, 0.014 * Math.sin(at.getX(i) * 48) * (0.5 - at.getY(i) / drop));
    geometry.computeVertexNormals();
    const half = new Mesh(geometry, burlap);
    half.position.set(0, -drop / 2, out);
    return half;
  };
  const fold = new Mesh(new CylinderGeometry(0.03, 0.03, 0.27, 10, 1, true, -Math.PI / 2, Math.PI), burlap);
  fold.rotation.z = Math.PI / 2;
  sack.add(fold, hang(0.27, 0.27, 0.03), hang(0.27, 0.2, -0.03));
  return sack;
}

/**
 * A red and white ranging pole with a storm lantern on top: where one
 * stretch of the line ends. Three of them stand along the line, one for
 * each stage; a lantern is lit when its stretch has held.
 */
interface Lantern {
  pole: Group;
  glass: MeshStandardMaterial;
  halo: Sprite;
}

function buildLantern(glow: CanvasTexture): Lantern {
  const pole = new Group();
  pole.name = 'LanternPole';
  for (let k = 0; k < 6; k += 1) {
    const band = new Mesh(new CylinderGeometry(0.025, 0.025, 0.35, 8), new MeshStandardMaterial({ color: k % 2 === 0 ? 0xc8281e : 0xeeeae0, roughness: 0.75, map: grain(1, 2) }));
    band.position.y = 0.175 + k * 0.35;
    pole.add(band);
  }
  const iron = new MeshStandardMaterial({ color: 0x2a2623, roughness: 0.6, metalness: 0.6, map: grain(2, 1) });
  const base = new Mesh(new CylinderGeometry(0.09, 0.1, 0.04, 10), iron);
  base.position.y = 2.12;
  const cap = new Mesh(new CylinderGeometry(0.03, 0.1, 0.08, 10), iron);
  cap.position.y = 2.42;
  let glass = new MeshStandardMaterial({ color: 0x4a4030, roughness: 0.3, emissive: 0xffc24a, emissiveIntensity: 0, fog: false });
  const pane = new Mesh(new CylinderGeometry(0.075, 0.075, 0.24, 10), glass);
  pane.position.y = 2.26;
  const round = halo(glow, 0x9fb4c8, 0.5, 0.2);
  round.position.y = 2.26;
  const real = fireProp('hurricane_lantern');
  const globe = real?.getObjectByName('glass') as Mesh | undefined;
  if (real != null && globe != null && !Array.isArray(globe.material)) {
    // The modelled storm lantern stands on the pole's top; its globe is what is lit.
    glass = (globe.material as MeshStandardMaterial).clone();
    glass.fog = false;
    globe.material = glass;
    real.position.y = 2.1;
    real.scale.setScalar(1.3);
    pole.add(real, round);
  } else pole.add(base, cap, pane, round);
  pole.traverse((o) => {
    o.pointerEvents = 'none';
  });
  const lantern = { pole, glass, halo: round };
  light(lantern, false);
  return lantern;
}

/** Lit, a lantern burns warm with a wide soft glow; unlit it is still seen in the dark, pale and small, so the three are counted from the start. */
function light(lantern: Lantern, on: boolean): void {
  lantern.glass.emissive.setHex(on ? 0xff9a24 : 0x9fb4c8);
  lantern.glass.emissiveIntensity = on ? 1.6 : 0.45;
  lantern.glass.color.setHex(on ? 0xffb040 : 0x55606a);
  lantern.halo.material.color.setHex(on ? 0xffa030 : 0x9fb4c8);
  lantern.halo.material.opacity = on ? 0.85 : 0.2;
  lantern.halo.scale.setScalar(on ? 2.2 : 0.5);
}

/** The ranger's own storm lantern, on the ground by her right knee: the light she works in, so the spade, her hands and the trench are seen in the dark. */
function buildKitLantern(glow: CanvasTexture): Group {
  const lamp = new Group();
  lamp.name = 'RangerLantern';
  const real = fireProp('hurricane_lantern');
  if (real != null) {
    // The modelled storm lantern, its globe lit.
    const globe = real.getObjectByName('glass') as Mesh | undefined;
    if (globe != null && !Array.isArray(globe.material)) {
      const lit = (globe.material as MeshStandardMaterial).clone();
      lit.emissive.setHex(0xffb84a);
      lit.emissiveIntensity = 2.2;
      lit.color.setHex(0xffe2a0);
      globe.material = lit;
    }
    const glowing = halo(glow, 0xffb84a, 0.7, 0.55);
    glowing.position.y = 0.13;
    const lit = new PointLight(0xffc88a, 2.6, 7, 1.5);
    lit.position.y = 0.45;
    lamp.add(real, glowing, lit);
    lamp.traverse((o) => {
      o.pointerEvents = 'none';
    });
    return lamp;
  }
  const iron = new MeshStandardMaterial({ color: 0x35302b, roughness: 0.6, metalness: 0.6, map: grain(2, 1) });
  const base = new Mesh(new CylinderGeometry(0.075, 0.085, 0.05, 12), iron);
  base.position.y = 0.025;
  const pane = new Mesh(new CylinderGeometry(0.055, 0.06, 0.16, 12), new MeshStandardMaterial({ color: 0xffe2a0, roughness: 0.3, emissive: 0xffb84a, emissiveIntensity: 2.2 }));
  pane.position.y = 0.13;
  const cap = new Mesh(new CylinderGeometry(0.02, 0.07, 0.06, 12), iron);
  cap.position.y = 0.24;
  const bail = new Mesh(new TorusGeometry(0.075, 0.005, 5, 16, Math.PI), iron);
  bail.position.y = 0.24;
  const round = halo(glow, 0xffb84a, 0.7, 0.55);
  round.position.y = 0.13;
  const shine = new PointLight(0xffc88a, 2.6, 7, 1.5);
  shine.position.y = 0.45;
  lamp.add(base, pane, cap, bail, round, shine);
  lamp.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return lamp;
}

/** The ranger's leather gloves: the hands' own colour changed while the memory lasts. */
function gloves(d: DirectorSystem, on: boolean): void {
  d.player.traverse((o) => {
    const mesh = o as Mesh;
    if ((mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh !== true || Array.isArray(mesh.material)) return;
    const material = mesh.material as MeshStandardMaterial;
    if (material.color == null) return;
    const kept = mesh.userData as { skin?: number };
    if (on) {
      kept.skin ??= material.color.getHex();
      material.color.setHex(0x8a5a2e);
    } else if (kept.skin != null) {
      material.color.setHex(kept.skin);
      delete kept.skin;
    }
  });
}

const ease = (k: number): number => k * k * (3 - 2 * k);
const DOWN = new Vector3(0, -1, 0);

/**
 * Kneel a body at `floor` (a point on the ground), facing `forward`: upright,
 * the left foot planted ahead with its knee up, the right knee on the
 * ground with its foot behind. `eye` is where its eyes are.
 */
function kneel(body: PerformerBody, eye: Vector3, floor: number, forward: Vector3, lean: number): void {
  const side = kneelSide.set(-forward.z, 0, forward.x);
  kneelNeck.copy(eye).addScaledVector(forward, -0.07 + lean);
  kneelNeck.y -= 0.17;
  // The hips under the neck, a little behind it when she leans into the spade.
  body.spine(kneelNeck, kneelHip.copy(kneelNeck).addScaledVector(forward, -lean * 2).setY(kneelNeck.y - 1), forward);
  body.hipsAt(kneelHip);
  kneelFoot.copy(kneelHip).addScaledVector(side, -0.12).addScaledVector(forward, 0.42).setY(floor + 0.05);
  body.leg('left', kneelFoot, kneelPole.copy(forward).multiplyScalar(0.4).setY(1));
  kneelFoot.copy(kneelHip).addScaledVector(side, 0.1).addScaledVector(forward, -0.3).setY(floor + 0.07);
  body.leg('right', kneelFoot, kneelPole.copy(forward).setY(-1));
}
const kneelSide = new Vector3();
const kneelNeck = new Vector3();
const kneelHip = new Vector3();
const kneelFoot = new Vector3();
const kneelPole = new Vector3();

/** S09: the forest memory. */
export async function s09(d: DirectorSystem): Promise<void> {
  d.chapter('S09');
  await d.stage.show('forest', DUSK);
  await loadFireProps();
  d.rain.on = false;
  const rootEntity = d.stage.entity('forest');
  if (rootEntity == null) return;
  // Night: the scene's sun is turned down to a little cold moonlight for as long as the memory lasts (the fire and the lanterns are the light here), and given back at the end.
  const sun = keyLight(d);
  const sunWas = sun == null ? null : { intensity: sun.intensity, colour: sun.color.getHex() };
  if (sun != null) {
    sun.intensity = NIGHT.moon;
    sun.color.setHex(NIGHT.colour);
  }
  if (import.meta.env.DEV) console.info(`[forest] night: the key light ${sunWas == null ? 'was not found' : `${sunWas.intensity} -> ${NIGHT.moon}`}`);
  stowWing(true);
  // The task plate up and to the left: clear of the pennant ahead, the spade to the right and the sack low on the left.
  placeGoal(0.55, 0.15);
  setDeskMode('one');
  const add = <T extends Object3D>(object: T): T => {
    d.world.createTransformEntity(object, { parent: rootEntity, persistent: true });
    return object;
  };
  // The file's own spade and sack lie by the old seat: they are hers, and are taken up.
  const spadeModel = takeModel(d, 'shovel');
  const lain = d.stage.node('forest', 'wet_sack');
  if (lain != null) lain.visible = false;
  // The dug soil of the trench, for the earth she throws and heaps.
  let soil: MeshStandardMaterial | null = null;
  d.stage.root('forest')?.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (soil == null && material != null && !Array.isArray(material) && material.name.includes('soil')) soil = material;
    // The firs' needle cards are cut out, not blended: blended, a tree is drawn in the wrong order and shows through itself like glass.
    if (material != null && !Array.isArray(material) && material.name.includes('fir_card') && material.transparent) {
      material.transparent = false;
      material.alphaTest = 0.4;
      material.depthWrite = true;
      material.needsUpdate = true;
    }
  });
  const earth: MeshStandardMaterial = soil ?? new MeshStandardMaterial({ color: 0x3f2d1f, roughness: 1, map: grain(2, 2) });
  const glow = blobTexture();
  const lines: Record<1 | 2, Line> = {
    1: readLine(d, 'strip1', 8, new Vector3(0, 0, -1), new Vector3(1, 0, 0), 0, 0),
    2: readLine(d, 'strip2', 6, new Vector3(1, 0, 0), new Vector3(0, 0, 1), -Math.PI / 2, 8),
  };

  // What goes where she kneels: her lantern on the ground to her right, the sack over her left thigh.
  const crew = new Group();
  crew.name = 'RangerKit';
  const crewEntity = d.world.createTransformEntity(crew, { parent: rootEntity, persistent: true });
  const kitLamp = buildKitLantern(glow);
  kitLamp.position.set(0.78, 0, -0.5);
  crew.add(kitLamp);
  // The wet sack hangs over a forked stick stuck in the ground before her on the left, in plain view: a hand on it throws it at the ember.
  const realFork = fireProp('burlap_sack', 'fork');
  const fork: Object3D = realFork ?? new Mesh(new CylinderGeometry(0.014, 0.02, 0.98, 7), wood(0x7a6248));
  if (realFork != null) {
    // As modelled the sack hangs 0.80 up it: a little taller here, so the fold stays where her hand finds it.
    realFork.position.set(-0.3, 0, -0.5);
    realFork.scale.setScalar(0.98 / 0.8);
  } else fork.position.set(-0.3, 0.49, -0.5);
  fork.pointerEvents = 'none';
  crew.add(fork);
  const sack = buildSack();
  sack.position.set(-0.3, 0.98, -0.5);
  crew.add(sack);
  void crewEntity;
  const thrown = add(buildSack());
  thrown.name = 'ThrownSack';
  thrown.visible = false;
  thrown.traverse((o) => {
    o.pointerEvents = 'none';
  });

  // The spade: standing in the ground before her until a hand takes it, then in that hand.
  const { spade, long: SPADE_LONG, lump } = buildSpade(spadeModel, earth);
  add(spade);
  const spadeGrip = add(new Group());
  spadeGrip.name = 'SpadeGrip';
  let spadeHand: Side | null = null;
  /** Stood in the ground and left there while an ember burns: both hands are for the sack. */
  let parked = false;
  const spadeState = newSpade();
  const gripAt = new Vector3();
  const tip = new Vector3();
  const tipWant = new Vector3();
  const spadeDir = new Vector3();
  let tipSet = false;

  const fire = new Wildfire(add);
  const clods = new Clods(add, earth);
  // Dug earth: a mound that grows along the far edge of a piece as it is dug.
  const mounds = add(new InstancedMesh(new SphereGeometry(1, 12, 8), earth, 14));
  mounds.name = 'DugEarth';
  mounds.pointerEvents = 'none';
  for (let i = 0; i < 14; i += 1) mounds.setMatrixAt(i, HIDDEN);
  const WAIT = new Color(1, 0.45, 0.06);
  const NOW = new Color(0.2, 1, 0.35);
  // An orange pennant at every piece still to dig in this stretch: what is left is counted at a glance.
  const pennants = add(new InstancedMesh(new PlaneGeometry(0.26, 0.16), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, fog: false, toneMapped: false }), 14));
  pennants.name = 'Pennants';
  pennants.pointerEvents = 'none';
  const pegs = add(new InstancedMesh(new CylinderGeometry(0.008, 0.008, 0.75, 6), wood(0xcdb89a), 14));
  pegs.name = 'PennantPegs';
  pegs.pointerEvents = 'none';
  for (let i = 0; i < 14; i += 1) {
    pennants.setMatrixAt(i, HIDDEN);
    pennants.setColorAt(i, WAIT);
    pegs.setMatrixAt(i, HIDDEN);
  }
  // Three lantern poles, one at the end of each stage's stretch; and over the last, the word's feather, lit, from the first moment.
  const lanterns = FOREST.stages.map((stage) => {
    const lantern = buildLantern(glow);
    const l = lines[stage.strip];
    lantern.pole.position.copy(l.pieces[stage.first + stage.pieces - 1].dig).addScaledVector(l.along, l.step / 2).addScaledVector(l.across, HALF_TRENCH + 0.9);
    add(lantern.pole);
    return lantern;
  });
  const prize = new Group();
  prize.name = 'FirewallFeather';
  const plume = featherMesh(FEATHER.firewall, 0.42, 0.14);
  (plume.material as MeshStandardMaterial).emissive.setHex(FEATHER.firewall);
  (plume.material as MeshStandardMaterial).emissiveIntensity = 0.9;
  (plume.material as MeshStandardMaterial).fog = false;
  plume.position.x = 0.21;
  const prizeGlow = halo(glow, 0xffe9b0, 1.3, 0.7);
  prize.add(plume, prizeGlow);
  prize.traverse((o) => {
    o.pointerEvents = 'none';
  });
  prize.position.copy(lanterns[lanterns.length - 1].pole.position);
  prize.position.y += 3.0;
  add(prize);
  let stagesHeld = 0;
  /** What she is doing now, for the plate low in the view. */
  const goal = (now: string): void => {
    setGoal({ where: 'MEMORY · THE FOREST', now, steps: [stagesHeld, FOREST.stages.length] });
    if (import.meta.env.DEV) console.info(`[goal] MEMORY · THE FOREST | ${now} | ${stagesHeld}/${FOREST.stages.length}`);
  };
  const TAKE = 'Earn the word FIREWALL: take the spade.';
  const DIG = 'Earn the word FIREWALL: spade down on green.';
  const SMOTHER = 'Earn the word FIREWALL: smother the ember.';
  const emberGlow = makeGlow(d.world, 0xffb04a, 0.07);
  emberGlow.visible = false;
  const emberFlames = new Flames(d.world, 3, 0xffa040);
  emberFlames.burning = 0;
  d.stage.own('forest', emberGlow, emberFlames.mesh);
  const vignette = new ViewEdge(d.player.head);

  /** A piece as far dug as `k` (0 untouched, 1 dug): its ground sinks and goes, the earth heaps on its far edge, its pennant comes down. */
  const flagged = new Set<number>();
  const setPiece = (line: Line, i: number, k: number): void => {
    const piece = line.pieces[i];
    if (piece == null) return;
    const dug = k >= 1;
    if (piece.cover != null) {
      piece.cover.visible = !dug;
      piece.cover.position.y = piece.rest - SUNK * Math.min(1, k);
    }
    const east = Math.abs(line.along.x) > 0.5;
    if (k > 0) {
      const long = line.step * 0.5;
      v3.copy(piece.dig).addScaledVector(line.across, HALF_TRENCH + 0.32);
      s3.set(east ? long : 0.26, (0.17 + (i % 3) * 0.03) * Math.min(1, k), east ? 0.26 : long);
      mounds.setMatrixAt(line.slot + i, m4.compose(v3, q4.identity(), s3));
    } else mounds.setMatrixAt(line.slot + i, HIDDEN);
    mounds.instanceMatrix.needsUpdate = true;
    const flag = flagged.has(line.slot + i) && !dug;
    if (flag) {
      v3.copy(piece.dig).addScaledVector(line.across, HALF_TRENCH + 0.55);
      v3.y += 0.375;
      pegs.setMatrixAt(line.slot + i, m4.compose(v3, q4.identity(), s3.set(1, 1, 1)));
      v3.y += 0.29;
      v3.addScaledVector(line.along, 0.13);
      q4.setFromAxisAngle(up, line.yaw);
      pennants.setMatrixAt(line.slot + i, m4.compose(v3, q4, s3.set(1, 1, 1)));
    } else {
      pegs.setMatrixAt(line.slot + i, HIDDEN);
      pennants.setMatrixAt(line.slot + i, HIDDEN);
    }
    pegs.instanceMatrix.needsUpdate = true;
    pennants.instanceMatrix.needsUpdate = true;
  };
  /** Pennants on pieces `a` to `b` of a line (and none elsewhere). */
  const flag = (line: Line, a: number, b: number): void => {
    flagged.clear();
    for (let i = a; i <= b; i += 1) flagged.add(line.slot + i);
  };
  for (const line of [lines[1], lines[2]]) line.pieces.forEach((_, i) => setPiece(line, i, 0));
  // The far end of the second line is the crew's work already.
  setPiece(lines[2], 5, 1);

  // Where she kneels: a point on the ground behind the piece she is digging.
  const at = new Vector3();
  let line = lines[1];
  let piece = 0;
  const kneelAt = (l: Line, i: number, out: Vector3): Vector3 => out.copy(l.pieces[Math.min(i, l.pieces.length - 1)].dig).addScaledVector(l.across, -KNEEL_BACK);
  const eyeOf = (floor: Vector3): Vector3 => floor.clone().add(new Vector3(0, EYE, 0));
  const kit = (): void => {
    crew.position.copy(at);
    crew.rotation.y = line.yaw;
  };
  const place = (l: Line, i: number): void => {
    line = l;
    piece = i;
    kneelAt(l, i, at);
    d.rig.place(eyeOf(at), l.yaw);
    kit();
    tipSet = false;
  };
  const move = (by: Vector3): void => {
    at.add(by);
    d.player.position.add(by);
    d.player.updateMatrixWorld(true);
    kit();
  };
  /** The front `distance` m from line `l`, across pieces `a` to `b`. */
  const front = (l: Line, a: number, b: number, distance: number): void => {
    fire.centre.copy(l.pieces[a].dig).add(l.pieces[b].dig).multiplyScalar(0.5).addScaledVector(l.across, HALF_TRENCH + STOP_BEYOND + distance);
    fire.along.copy(l.along);
    fire.toward.copy(l.across).negate();
    fire.half = ((b - a + 1) * l.step) / 2 + 2.2;
    fire.distance = distance;
  };
  /** The charred trunks on the ground the front is about to cross (they catch as it passes). */
  let planted = '';
  const plant = (l: Line, a: number, b: number, deep: number): void => {
    const where = `${l.slot}:${a}:${b}`;
    if (where === planted) {
      fire.unlight();
      return;
    }
    planted = where;
    front(l, a, b, 0);
    fire.plant(fire.centre.clone(), fire.along, fire.toward, fire.half, deep);
  };

  // Sound and sky follow how near the fire is.
  let roar = -1;
  let skyAt = 0;
  const mood = (near: number, power: number): void => {
    const want = power <= 0.01 ? 0 : 0.12 + 0.88 * near * near;
    if (Math.abs(want - roar) > 0.03) {
      roar = want;
      d.sounds.bed('fire_loop', want * Math.min(1, power * 2), 0.85 + 0.25 * near);
      d.sounds.bed('heartbeat_loop', near > 0.86 && power > 0.5 ? 0.6 : 0);
    }
    if (d.now >= skyAt) {
      skyAt = d.now + 0.12;
      d.stage.blendWeather(DUSK, ABLAZE, near * near * Math.min(1, power * 1.5));
    }
  };

  const minis = d.world.getSystem(MiniGameSystem);
  const paused = (): boolean => minis?.playPaused ?? false;
  const eye = new Vector3();
  const hand = new Vector3();
  const sideways = new Vector3();
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  /** What a spadeful thrown does now (the rehearsal's, a stage's); null while nothing is being dug. */
  let onToss: ((strength: number) => void) | null = null;

  // The crew chief: a real person standing at the head of the line, an arm's length to her left, his own spade planted beside him. He calls the fire on and cheers a lantern lit.
  const chief = Extra.make('crowd_man_casual');
  if (chief != null) add(chief.root);
  const chiefKit = buildSpade(spadeModel?.clone() ?? null, earth);
  const chiefSpade = chiefKit.spade;
  add(chiefSpade);
  const chiefAt = new Vector3();
  let chiefLine = lines[1];
  const chiefSays = new Vector3();
  /** Where his words are shown: over his head. */
  const chiefHead = (): Vector3 => (chief != null ? chief.over(chiefSays) : chiefSays.copy(chiefAt).setY(chiefAt.y + 1.95));
  const standChief = (l: Line, floor: Vector3): void => {
    chiefLine = l;
    chiefAt.copy(floor);
    if (chief != null) {
      chief.root.position.copy(floor);
      // He faces the fire, turned a little toward her.
      sideways.copy(l.across).multiplyScalar(0.8).addScaledVector(l.along, 0.6);
      chief.root.rotation.set(0, Math.atan2(sideways.x, sideways.z), 0);
    }
    // His spade stands in the earth at his far side, leaning a little.
    chiefSpade.position.copy(floor).addScaledVector(l.along, -0.5).addScaledVector(l.across, 0.25);
    chiefSpade.position.y = floor.y + chiefKit.long - 0.14;
    chiefSpade.quaternion.setFromUnitVectors(DOWN, spadeDir.copy(l.across).multiplyScalar(0.12).setY(-1).normalize());
  };
  /** Seconds he still has to say, and to cheer. */
  let chiefTalks = 0;
  let chiefCheer = 0;
  const poseChief = (delta: number): void => {
    void chiefLine;
    if (chief == null) return;
    chiefTalks = Math.max(0, chiefTalks - delta);
    chiefCheer = Math.max(0, chiefCheer - delta);
    // He shouts while the fire is close, as well as on his own lines.
    chief.play(chiefCheer > 0 ? 'cheer' : chiefTalks > 0 || fire.near > 0.6 ? 'talk' : 'idle');
    chief.update(delta);
  };

  // Her own body, seen when she looks down: kneeling, the left knee up (the sack over it), the right on the ground, her sleeves ending at her gloves.
  const body = buildRanger();
  add(body.root);
  body.visible = false;
  // Ash in the air round her head: the near layer the eye reads depth from.
  const ASH = 70;
  const ashAt = new Float32Array(ASH * 3);
  const ashSeed = new Float32Array(ASH * 3);
  for (let i = 0; i < ASH * 3; i += 1) ashSeed[i] = Math.random();
  const ashGeometry = new BufferGeometry();
  ashGeometry.setAttribute('position', new BufferAttribute(ashAt, 3));
  const ash = add(new Points(ashGeometry, new PointsMaterial({ map: glow, color: 0xb8aca0, size: 0.02, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false })));
  ash.name = 'Ash';
  ash.frustumCulled = false;
  ash.pointerEvents = 'none';
  const wrap = (v: number): number => v - Math.floor(v);

  /** The spade this frame: standing where she kneels until a hand takes it, then hanging forward from that hand with its blade a little behind the hand's move (its weight). */
  const carrySpade = (delta: number): void => {
    const forward = line.across;
    sideways.set(-forward.z, 0, forward.x);
    if (spadeHand == null) {
      // Standing upright in the trench before her, its grip in easy view and reach.
      tip.copy(at).addScaledVector(sideways, 0.2).addScaledVector(forward, 0.54);
      tip.y = at.y - 0.07;
      spadeDir.copy(forward).multiplyScalar(Math.sin(0.04)).setY(-Math.cos(0.04));
      gripAt.copy(tip).addScaledVector(spadeDir, -SPADE_LONG);
      spadeGrip.position.copy(gripAt);
      for (const side of SIDES) {
        if (parked || spadeHand != null || !takes(d, side, gripAt, TAKE_REACH)) continue;
        spadeHand = side;
        tipSet = false;
        spadeState.last = null;
        d.sounds.play('grab_soft', 0.7);
        setV2Targets([]);
        // The emulator's mouse now works both hands up and down: down drives the spade in, up throws.
        setDeskMode('handles');
        goal(DIG);
        if (import.meta.env.DEV) console.info(`[forest] spade taken by ${side}`);
      }
    } else {
      handPoint(d, spadeHand, gripAt);
      tipWant.copy(gripAt).addScaledVector(forward, SPADE_LONG * Math.sin(SPADE_TILT));
      tipWant.y -= SPADE_LONG * Math.cos(SPADE_TILT);
      if (!tipSet) tip.copy(tipWant);
      tipSet = true;
      const follow = Math.min(1, delta * 14);
      // In the earth the blade is held where it went in; only its depth follows the hand.
      const stuck = spadeState.loaded > 0 && tip.y < at.y;
      if (!stuck) {
        tip.x += (tipWant.x - tip.x) * follow;
        tip.z += (tipWant.z - tip.z) * follow;
      }
      tip.y += (tipWant.y - tip.y) * Math.min(1, delta * 30);
      spadeDir.copy(tip).sub(gripAt).normalize();
      tip.copy(gripAt).addScaledVector(spadeDir, SPADE_LONG);
    }
    spade.position.copy(gripAt);
    spade.quaternion.setFromUnitVectors(DOWN, spadeDir);
  };
  /** The spade's work this frame: a bite where the line is still to dig, and the throw. */
  const workSpade = (delta: number): void => {
    if (spadeHand == null || paused()) return;
    const event = stepSpade(spadeState, tip.y - at.y, delta);
    if (event.kind === 'bite') {
      // Only the piece before her can be dug: anywhere else the blade finds nothing to take.
      const here = line.pieces[Math.min(piece, line.pieces.length - 1)].dig;
      const off = v3.copy(tip).sub(here);
      const inLine = onToss != null && Math.abs(off.dot(line.across)) <= HALF_TRENCH + 0.3 && Math.abs(off.dot(line.along)) <= line.step * 0.75;
      if (!inLine) spadeState.loaded = 0;
      lump.visible = inLine;
      lump.scale.set(0.085, 0.03 + 0.04 * spadeState.loaded, 0.075);
      d.sounds.play('sandbag_drop', inLine ? 0.35 + 0.35 * spadeState.loaded : 0.2, inLine ? 1.5 - 0.3 * spadeState.loaded : 0.8);
      if (inLine) clods.throw(v3.copy(tip).setY(at.y + 0.05), line.across, line.along, 3);
      if (import.meta.env.DEV) console.info(`[forest] bite ${inLine ? spadeState.loaded.toFixed(2) : 'outside the line'}`);
    } else if (event.kind === 'toss') {
      lump.visible = false;
      clods.throw(v3.copy(tip), line.across, line.along, Math.round(4 + 6 * event.strength));
      d.sounds.play('sand_pour', 0.3 + 0.3 * event.strength, 1.3);
      onToss?.(event.strength);
    }
  };

  // Everything that is always alive: the fire, the spade, her body, the chief, the ash.
  let clock = 0;
  let wasReady = false;
  let readySlot = -1;
  const alive = d.each((delta) => {
    d.player.head.getWorldPosition(eye);
    clock += delta;
    fire.update(delta, eye);
    clods.update(delta);
    emberFlames.update(delta, d.player.head);
    vignette.update(delta);
    carrySpade(delta);
    workSpade(delta);
    // The pennant of the piece before her is the sign for the spade: green when the ground is ready for it, orange while the last spadeful is still in the air.
    const ready = spadeHand != null && !parked && onToss != null && spadeState.loaded === 0 && spadeState.since >= SPADE.settle;
    const slot = line.slot + Math.min(piece, line.pieces.length - 1);
    if (ready !== wasReady || slot !== readySlot) {
      if (readySlot >= 0 && readySlot !== slot) pennants.setColorAt(readySlot, WAIT);
      pennants.setColorAt(slot, ready ? NOW : WAIT);
      if (pennants.instanceColor != null) pennants.instanceColor.needsUpdate = true;
      if (ready && !wasReady) d.sounds.play('ear_click', 0.25, 1.7);
      if (import.meta.env.DEV && ready && !wasReady) {
        pennants.getMatrixAt(slot, m4);
        v3.setFromMatrixPosition(m4).sub(eye);
        const flat = Math.hypot(v3.x, v3.z);
        const aside = Math.acos(Math.max(-1, Math.min(1, (v3.x * line.across.x + v3.z * line.across.z) / Math.max(1e-6, flat))));
        console.info(`[forest] green: piece ${piece + 1}; its pennant is ${flat.toFixed(2)} m off, ${Math.round((Math.atan2(-v3.y, flat) * 180) / Math.PI)} deg below and ${Math.round((aside * 180) / Math.PI)} deg aside of straight ahead`);
      }
      wasReady = ready;
      readySlot = slot;
    }
    if (body.visible) {
      kneel(body, eye, at.y, line.across, 0);
      // The sleeve ends on the drawn hand's own wrist joint (the body's cuff covers it); without a drawn hand, at the grip.
      for (const side of SIDES) body.arm(side, wristOf(d, side));
    }
    poseChief(delta);
    prize.rotation.y = clock * 0.9;
    prizeGlow.scale.setScalar(1.3 * (1 + 0.12 * Math.sin(clock * 3)));
    for (let i = 0; i < ASH; i += 1) {
      const k = i * 3;
      // Each flake drifts down and with the wind through a box round the head, and comes in again at the far side.
      ashAt[k] = eye.x + (wrap(ashSeed[k] + clock * (0.03 - fire.toward.x * 0.07)) - 0.5) * 3.6;
      ashAt[k + 1] = eye.y + (wrap(ashSeed[k + 1] - clock * 0.05) - 0.5) * 2.4;
      ashAt[k + 2] = eye.z + (wrap(ashSeed[k + 2] + clock * (0.02 - fire.toward.z * 0.07)) - 0.5) * 3.6;
    }
    (ashGeometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  });

  /** Shuffle along to piece `to` of the line: a short slide, or a jump with less motion. */
  const shuffle = (l: Line, to: number): Promise<void> => {
    const goalAt = kneelAt(l, to, new Vector3());
    piece = to;
    if (lessMotion()) {
      move(goalAt.sub(at));
      return Promise.resolve();
    }
    const from = at.clone();
    let t = 0;
    return new Promise((done) => {
      const stop = d.each((delta) => {
        const before = ease(Math.min(1, t / SHUFFLE));
        t += delta;
        const after = ease(Math.min(1, t / SHUFFLE));
        move(v3.copy(goalAt).sub(from).multiplyScalar(after - before));
        if (t >= SHUFFLE) {
          stop();
          done();
        }
      });
    });
  };

  // In through the orb: from above and behind, the whole line with its three lanterns and the feather over the last, the fire's glow ahead among the trees.
  plant(lines[1], 0, 3, STAND_OFF + 8);
  front(lines[1], 0, 3, STAND_OFF);
  fire.power = 0.6;
  fire.near = 0.15;
  flag(lines[1], 0, 3);
  for (let i = 0; i <= 3; i += 1) setPiece(lines[1], i, 0);
  place(lines[1], 0);
  // The chief at the head of the line, an arm's length to her left.
  standChief(lines[1], kneelAt(lines[1], 0, new Vector3()).addScaledVector(lines[1].along, -1.25));
  gloves(d, true);
  d.sounds.bed('wind_loop', 0.25);
  mood(0.2, 0.6);
  goal(TAKE);
  // The first frame says what this is for, in the chief's one sentence.
  const first = 'Chief: Three lanterns. Dig to each before the fire does, and the word is yours.';
  if (import.meta.env.DEV) console.info(`[say] S09-0 ${first}`);
  chiefTalks = 5;
  void d.captions.show(first, chiefHead().clone(), 0);
  vignette.set(0.8);
  await glideIn(
    d,
    new Vector3(0, 0, 12).sub(at).setY(6),
    (by) => {
      d.player.position.add(by);
      d.player.updateMatrixWorld(true);
    },
    3.4,
  );
  vignette.set(1);
  body.visible = true;
  arm();
  await d.wait(0.6);

  // The rehearsal: the fire stands off until the first piece is dug.
  setV2Targets([spadeGrip]);
  if (import.meta.env.DEV) {
    const g = d.player.worldToLocal(gripAt.clone());
    const k = d.player.worldToLocal(sack.getWorldPosition(new Vector3()));
    console.info(`[forest] rehearsal: the spade waits at ${g.toArray().map((v) => v.toFixed(2))} (player space), the ground ${d.player.worldToLocal(at.clone()).y.toFixed(2)}, long ${SPADE_LONG.toFixed(2)}, the sack at ${k.toArray().map((v) => v.toFixed(2))}`);
  }
  {
    const run = startForest({ ...FOREST.stages[0], first: FOREST.rehearsal.first, pieces: FOREST.rehearsal.pieces, effort: FOREST.rehearsal.effort, gusts: [], sparksAfter: [] });
    onToss = (strength) => {
      const got = dig(run, strength);
      setPiece(lines[1], 0, got === 'bit' ? run.progress / run.stage.effort : 1);
      if (import.meta.env.DEV) console.info(`[forest] rehearsal toss ${strength.toFixed(2)}: ${got}`);
    };
    arm();
    await d.until(() => run.dug >= 1 || skipped);
    onToss = null;
    setPiece(lines[1], 0, 1);
  }
  // The wind gets up: it is coming.
  d.sounds.play('wind_gust', 0.8);
  await shuffle(lines[1], 1);

  const game = playMiniGame(new MiniGame(WORDS.firewall, FOREST.stages.map((s) => ({ name: s.name }))));
  let black = false;
  let chiefCalled = false;
  skipped = false;
  const phase = (): Phase => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() !== 'playing') continue;
    skipped = false;
    const n = game.stage;
    const stage = eased(FOREST.stages[n], game.failuresOf(n));
    const l = lines[stage.strip];
    const last = stage.first + stage.pieces - 1;
    // The pieces of this stage are undug (again), each with its pennant; she is at its first.
    flag(l, stage.first, last);
    for (let i = stage.first; i <= last; i += 1) setPiece(l, i, 0);
    if (l !== line && !black) {
      // The wind turns: the fire she stopped is behind her, and a new front is coming through the trees to the east.
      d.sounds.play('wind_gust', 1, 0.8);
      arm();
      await d.rig.fadeTo(1);
      black = true;
    }
    if (black) {
      place(l, stage.first);
      gloves(d, true);
      // The chief is beside her at the head of the new line too.
      if (l !== chiefLine) standChief(l, kneelAt(l, stage.first, new Vector3()).addScaledVector(l.along, -1.25));
    } else if (at.distanceTo(kneelAt(l, stage.first, v3)) > 0.05) await shuffle(l, stage.first);
    piece = stage.first;
    const firstOfFront = stage.strip === 1 && n === 0 ? 0 : stage.first;
    plant(l, firstOfFront, last, stage.from);
    front(l, firstOfFront, last, stage.from);
    fire.power = 1;
    if (black) {
      arm();
      await d.rig.fadeTo(0);
      black = false;
    }
    vignette.set(1);
    if (stage.strip === 2 && !chiefCalled) {
      chiefCalled = true;
      chiefTalks = 4;
      void d.captions.say('S09-1', chiefHead().clone(), 0);
    }
    if (spadeHand == null) {
      setDeskMode('one');
      setV2Targets([spadeGrip]);
    }
    goal(spadeHand == null ? TAKE : DIG);
    if (import.meta.env.DEV) console.info(`[forest] stage ${n + 1} (${stage.name}): ${stage.pieces} pieces of ${stage.effort}, the front ${stage.from} m off at ${stage.speed.toFixed(2)} m/s`);

    const result = await playStage(stage, l, firstOfFront);
    onToss = null;
    if (import.meta.env.DEV) console.info(`[forest] stage ${n + 1}: ${result}`);
    if (result === 'held') {
      chiefCheer = 3.5;
      // The fire comes up against bare earth: for a breath it stands over her, roaring, its light on her arms; then it has nothing to eat and dies there.
      const stood = d.now;
      fire.near = 1;
      fire.power = 1.25;
      mood(1, 1);
      arm();
      await d.until(() => d.now - stood >= 1.1 || skipped);
      d.sounds.play('sand_pour', 0.7, 0.6);
      const start = d.now;
      arm();
      await d.until(() => {
        const k = Math.min(1, (d.now - start) / 2.4);
        fire.power = 1.25 * (1 - ease(k));
        mood(1 - k, fire.power);
        return k >= 1 || skipped;
      });
      fire.power = 0;
      mood(0, 0);
      // Its lantern is lit: one more of the three.
      light(lanterns[n], true);
      stagesHeld = n + 1;
      d.sounds.play('ear_click', 0.6, 0.8);
      goal(DIG);
      game.win();
    } else {
      // It is across: the flames come over the gap at her; everything but her own heart drops away; and the view goes dark before they arrive.
      const start = d.now;
      const from = fire.centre.clone();
      vignette.set(0.55);
      roar = -1;
      d.sounds.play('wind_gust', 0.9, 1.2);
      d.sounds.bed('fire_loop', 0.25);
      d.sounds.bed('wind_loop', 0.05);
      d.sounds.bed('heartbeat_loop', 1);
      fire.power = 1.35;
      arm();
      await d.until(() => {
        const k = Math.min(1, (d.now - start) / 0.9);
        fire.centre.copy(from).addScaledVector(l.across, -(HALF_TRENCH * 2 + STOP_BEYOND) * k);
        return k >= 1 || skipped;
      });
      arm();
      await d.rig.fadeTo(1);
      black = true;
      fire.power = 0;
      emberFlames.burning = 0;
      emberGlow.visible = false;
      mood(0, 0);
      d.sounds.bed('wind_loop', 0.25);
      game.lose(result === 'caught' ? 'an ember caught' : 'the fire crossed');
    }
  }

  /** One go at a stage: resolves when the fire is held, has crossed, or an ember has caught. */
  function playStage(stage: ForestStage, l: Line, firstOfFront: number): Promise<ForestRun['result']> {
    const run = startForest(stage);
    const last = stage.first + stage.pieces - 1;
    const spot = new Vector3();
    const leave = new Vector3();
    const sackAt = new Vector3();
    let moving: Promise<void> | null = null;
    let flying = -1;
    let embers = 0;
    let logAt = 0;
    let blowing = false;
    arm();
    onToss = (strength) => {
      if (moving != null) return;
      const here = stage.first + run.dug;
      const before = run.ember;
      const got = dig(run, strength);
      if (got === 'nothing') return;
      setPiece(l, here, got === 'bit' ? run.progress / stage.effort : 1);
      if (import.meta.env.DEV) console.info(`[forest] toss ${strength.toFixed(2)}: ${got} (${run.dug}/${stage.pieces}) at ${run.time.toFixed(1)} s, the front ${run.distance.toFixed(1)} m off`);
      if (got === 'piece') {
        d.sounds.play('ear_click', 0.45, 1.1);
        moving = shuffle(l, here + 1).then(() => {
          moving = null;
        });
      }
      if (run.ember != null && before == null) {
        // An ember leaves the front and comes down beside where she will be kneeling: left, then right.
        embers += 1;
        const side = embers % 2 === 1 ? -1 : 1;
        kneelAt(l, Math.min(last, here + 1), spot).addScaledVector(l.along, 0.5 * side).addScaledVector(l.across, 0.14);
        fire.edgeNear(spot, 3.5, leave);
        emberGlow.visible = true;
        d.sounds.play('fuse_burn', 0.5, 1.3);
        // The spade is stood in the ground: this wants the sack.
        parked = true;
        spadeHand = null;
        spadeState.loaded = 0;
        lump.visible = false;
        setDeskMode('one');
        setV2Targets([sack]);
        goal(SMOTHER);
        if (import.meta.env.DEV) console.info(`[forest] ember ${embers} thrown over the line`);
      }
    };
    return new Promise((done) => {
      const stop = d.each((delta) => {
        if (paused()) return;
        stepForest(run, delta);
        // The front; a gust flares it and throws it nearer.
        const blow = gusting(run);
        if (blow && !blowing) {
          d.sounds.play('wind_gust', 1, 1.1);
          if (import.meta.env.DEV) console.info(`[forest] a gust: the front leaps from ${run.distance.toFixed(1)} m`);
        }
        blowing = blow;
        fire.power += ((blow ? 1.4 : 1) - fire.power) * Math.min(1, delta * 5);
        front(l, firstOfFront, last, run.distance);
        fire.near = nearness(run);
        mood(fire.near, 1);
        vignette.set(run.distance < 3 && run.dug < stage.pieces ? 0.8 : 1);
        // The ember: in the air, then smouldering and growing where it fell, until the sack lands on it.
        const ember = run.ember;
        if (ember != null) {
          if (ember.flying > 0) {
            const k = 1 - ember.flying / FOREST.sparkFlight;
            emberGlow.position.lerpVectors(leave, spot, k);
            emberGlow.position.y += Math.sin(k * Math.PI) * 2.2;
            emberGlow.scale.setScalar(1.6);
          } else {
            if (emberFlames.burning === 0) {
              d.sounds.play('fuse_burn', 0.7, 0.8);
              if (import.meta.env.DEV) console.info(`[forest] ember down at ${d.player.worldToLocal(spot.clone()).toArray().map((v) => v.toFixed(2))} (player space), ${ember.left.toFixed(1)} s to smother it`);
            }
            const grown = 1 - ember.left / Math.max(0.1, stage.fuse);
            emberGlow.position.copy(spot).setY(spot.y + 0.1);
            emberGlow.scale.setScalar(1.4 + 2.5 * grown);
            emberFlames.place(0, spot, 0.3 + 0.8 * grown);
            emberFlames.place(1, v3.copy(spot).addScaledVector(l.along, 0.12), 0.2 + 0.6 * grown);
            emberFlames.place(2, v3.copy(spot).addScaledVector(l.along, -0.1).addScaledVector(l.across, -0.08), 0.15 + 0.6 * grown);
            emberFlames.burning = 3;
            // A hand on the sack throws it.
            if (flying < 0) {
              sack.getWorldPosition(sackAt);
              if (SIDES.some((side) => takes(d, side, sackAt, 0.14))) {
                flying = 0;
                sack.visible = false;
                d.sounds.play('grab_soft', 0.7);
                if (import.meta.env.DEV) console.info('[forest] the sack is thrown');
              }
            }
            if (flying >= 0) {
              flying += delta / 0.45;
              const k = Math.min(1, flying);
              thrown.visible = k < 1;
              thrown.position.lerpVectors(sackAt, spot, k);
              thrown.position.y += Math.sin(k * Math.PI) * 0.35;
              thrown.rotation.set(k * 2.4, line.yaw, 0);
              if (k >= 1 && smother(run)) {
                flying = -1;
                d.sounds.play('bucket_splash', 0.8, 1.2);
                emberFlames.burning = 0;
                emberGlow.visible = false;
                sack.visible = true;
                parked = false;
                setV2Targets([spadeGrip]);
                goal(TAKE);
                if (import.meta.env.DEV) console.info(`[forest] ember ${embers} smothered`);
              }
            }
          }
        }
        if (import.meta.env.DEV && run.time >= logAt) {
          logAt = run.time + 1;
          console.info(`[forest] front ${run.distance.toFixed(1)} m, dug ${run.dug}/${stage.pieces}${run.ember != null ? `, ember ${run.ember.flying > 0 ? 'flying' : run.ember.left.toFixed(1)}` : ''}`);
        }
        if (skipped || run.result !== 'playing') {
          stop();
          thrown.visible = false;
          sack.visible = true;
          parked = false;
          if (skipped) {
            for (let i = stage.first; i <= last; i += 1) setPiece(l, i, 1);
            emberFlames.burning = 0;
            emberGlow.visible = false;
          }
          // An ember that caught flares up where it lay.
          if (run.result === 'caught') emberFlames.place(0, spot, 2.4);
          const finish = (): void => done(skipped ? 'held' : run.result);
          if (moving != null) void moving.then(finish);
          else finish();
        }
      });
    });
  }

  endMiniGame(game);
  if (import.meta.env.DEV) console.info('[forest] won');
  setV2Targets([]);
  fire.power = 0;
  mood(0, 0);
  d.sounds.bed('fire_loop', 0);
  d.sounds.bed('heartbeat_loop', 0);
  if (!chiefCalled) {
    chiefTalks = 4;
    await d.captions.say('S09-1', chiefHead().clone(), 0);
  }
  // Won: the feather comes down from the last lantern into her hands, and the chief shouts the word, in gold over the line that held.
  setGoal({ where: 'MEMORY · THE FOREST', now: 'Take the word FIREWALL home to Gray.', steps: [stagesHeld, FOREST.stages.length] });
  const palm = eyeOf(at).addScaledVector(line.across, 0.42).add(new Vector3(0, -0.22, 0));
  const hung = prize.position.clone();
  const came = d.now;
  d.sounds.play('feather_rustle', 0.7);
  arm();
  await d.until(() => {
    const k = ease(Math.min(1, (d.now - came) / 1.3));
    prize.position.lerpVectors(hung, palm, k);
    prize.position.y += Math.sin(k * Math.PI) * 0.5;
    prize.scale.setScalar(1 - 0.6 * k);
    return k >= 1 || skipped;
  });
  const won = 'Chief: Firewall! The line held.';
  if (import.meta.env.DEV) console.info(`[say] S09-2 ${won}`);
  chiefCheer = 5;
  void d.captions.show(won, chiefHead().clone(), 0);
  arm();
  await d.gold.show(WORDS.firewall.toUpperCase(), eyeOf(at).addScaledVector(line.across, 1.6).add(new Vector3(0, 0.12, 0)), 1.3, 2.6, new Vector3(0, 0.1, 0), d.player.head, wordBadge(WORDS.firewall));
  prize.visible = false;
  giveFeather(WORDS.firewall, FEATHER.firewall, () => {
    // Home with the word: if the cold fire is the trouble now, the next thing is Gray's ear.
    if (d.day.problem === 2) setGoal({ where: 'TROUBLE 2 OF 6 · THE COLD FIRE', now: 'Give Gray the word: carry the feather to his ear.' });
  });
  alive();
  vignette.dispose();
  setDeskMode('one');
  gloves(d, false);
  body.visible = false;
  placeGoal();
  stowWing(false);
  d.sounds.bed('wind_loop', 0);
  d.rain.on = true;
  if (sun != null && sunWas != null) sun.color.setHex(sunWas.colour);
  const start = d.now;
  arm();
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 1.2);
    d.stage.blendWeather(DUSK, WEATHER.rain2008, k);
    if (sun != null && sunWas != null) sun.intensity = NIGHT.moon + (sunWas.intensity - NIGHT.moon) * k;
    return k >= 1;
  });
  if (sun != null && sunWas != null) {
    sun.intensity = sunWas.intensity;
    sun.color.setHex(sunWas.colour);
  }
}
