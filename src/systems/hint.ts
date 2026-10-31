import { Box3, type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { canChoose } from '../season/store.js';
import { stance } from '../stance.js';

/** Seconds of stillness before the hand shows the next gesture; the very first time it shows almost at once. */
const IDLE_SECONDS = 8;
const FIRST_SECONDS = 2.5;
/** One gesture's length, how many times it plays, and the fade either side. */
const GESTURE_SECONDS = 1.3;
const PLAYS = 2;
const FADE = 0.25;

type Pose = 'point' | 'pinch';
interface Gesture {
  target: Object3D;
  pose: Pose;
  /** The hand's travel over one gesture, in metres (world). */
  move: Vector3;
  /** Offset from the target toward the Keeper and up, so the hand sits in front of it. */
  lift: number;
}

/**
 * The ghost hand (META_VR_FIKIR.md §3, §7): when the Keeper has done nothing
 * for a while, a soft hand shows the week's next gesture beside the thing
 * to touch, twice, and fades: slide the latch, pull the rope, tap an
 * option, poke the brake, reach for Tessa's window, slide the sun, poke a
 * Sunday arrow or the lamp, slide the latch closed. Not while walking in
 * the town; never in words.
 */
export class HintSystem extends createSystem({
  week: { required: [Week] },
}) {
  private hand: Mesh | null = null;
  private point: CanvasTexture | null = null;
  private pinch: CanvasTexture | null = null;
  private find: (name: string) => Object3D | null = () => null;
  private idle = 0;
  private playing = -1;
  private shownOnce = false;
  /** The week's state last frame: phase, pulls, choice, evening, call, lamp, shutters, family box. */
  private state: number[] = [-1, -1, -2, -2, -2, -1, -1, -1];
  private gesture: Gesture | null = null;
  private from = new Vector3();
  private anchor = new Vector3();
  private bounds = new Box3();
  private toward = new Vector3();
  private eye = new Vector3();
  private turn = new Quaternion();

  init(): void {
    this.find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.hand = this.find('GhostHand') as Mesh | null;
    const material = this.hand?.material as MeshBasicMaterial | undefined;
    this.point = (material?.map as CanvasTexture | null | undefined) ?? null;
    this.pinch = (this.hand?.userData.pinch as CanvasTexture | undefined) ?? null;
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    const hand = this.hand;
    if (week == null || hand == null) return;
    // Anything the Keeper does changes the week's state: the stillness starts over.
    const state = this.state;
    const now = [
      PHASES.indexOf(week.getValue(Week, 'phase') ?? Phase.Shut),
      week.getValue(Week, 'pulls') ?? 0,
      week.getValue(Week, 'chosen') ?? -1,
      week.getValue(Week, 'day') ?? -1,
      week.getValue(Week, 'forecast') ?? -1,
      week.getValue(Week, 'lamp') ? 1 : 0,
      week.getValue(Week, 'shuttersOpen') ? 1 : 0,
      this.find('FamilyBox')?.visible ? 1 : 0,
    ] as const;
    let changed = false;
    for (let i = 0; i < now.length; i += 1) {
      if (state[i] !== now[i]) {
        state[i] = now[i];
        changed = true;
      }
    }
    if (changed) {
      this.idle = 0;
      this.hide();
    }
    if (stance() === 'walk') {
      this.hide();
      return;
    }
    this.idle += delta;
    if (this.playing < 0) {
      if (this.idle < (this.shownOnce ? IDLE_SECONDS : FIRST_SECONDS)) return;
      this.gesture = this.next(week);
      if (this.gesture == null) return;
      this.playing = 0;
      this.shownOnce = true;
      // Many of the station's meshes carry their shape in world coordinates: the target is where its geometry is.
      this.bounds.setFromObject(this.gesture.target).getCenter(this.anchor);
      const material = hand.material as MeshBasicMaterial;
      material.map = this.gesture.pose === 'pinch' ? this.pinch : this.point;
      material.needsUpdate = true;
    }
    this.animate(hand, delta);
  }

  /** The gesture the week is waiting for, or none. */
  private next(week: Entity): Gesture | null {
    const phase = week.getValue(Week, 'phase');
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const make = (name: string, pose: Pose, move: [number, number, number], lift = 0.07): Gesture | null => {
      const target = this.find(name);
      return target == null ? null : { target, pose, move: new Vector3(...move), lift };
    };
    if (!open) return phase === Phase.Shut ? make('Latch', 'pinch', [0.08, 0, 0]) : null;
    switch (phase) {
      case Phase.Bell:
        return make('RopeToggleMesh', 'pinch', [0, -0.12, 0]);
      case Phase.Choosing: {
        if ((week.getValue(Week, 'chosen') ?? -1) >= 0) return make('BrakeLever', 'point', [0, -0.03, -0.02]);
        for (let i = 0; i < 3; i += 1) if (canChoose(i)) return make(['ChoiceEase', 'ChoiceHelp', 'ChoiceBuild'][i], 'point', [0, -0.03, 0]);
        return null;
      }
      case Phase.Landed:
        // Reach across the square for Tessa's window: a pinch drawn back toward the Keeper.
        return this.find('FamilyBox')?.visible ? make('SunKnob', 'point', [0, -0.025, 0]) : make('TessaWindow', 'pinch', [0, 0, 0.12], -1);
      case Phase.Days:
        return make('SunKnob', 'pinch', [0.06, 0, 0]);
      case Phase.Sunday:
        if ((week.getValue(Week, 'forecast') ?? -1) < 0) return make('ArrowUp', 'point', [0, -0.03, 0]);
        if (!week.getValue(Week, 'lamp')) return make('SundayLamp', 'point', [0, -0.03, 0]);
        return make('Latch', 'pinch', [-0.08, 0, 0]);
      default:
        return null;
    }
  }

  private animate(hand: Mesh, delta: number): void {
    const gesture = this.gesture;
    if (gesture == null) return;
    this.playing += delta;
    const total = GESTURE_SECONDS * PLAYS;
    if (this.playing > total) {
      this.hide();
      this.idle = 0;
      return;
    }
    const camera = this.world.camera;
    camera.getWorldPosition(this.eye);
    // Where the hand starts: in front of its target, toward the Keeper; for the far window, an arm's length out along the line to it.
    this.from.copy(this.anchor);
    if (gesture.lift < 0) {
      this.toward.subVectors(this.from, this.eye).normalize();
      this.from.copy(this.eye).addScaledVector(this.toward, 0.42);
      this.from.y -= 0.12;
    } else {
      this.toward.subVectors(this.eye, this.from).normalize();
      this.from.addScaledVector(this.toward, gesture.lift);
      this.from.y += 0.04;
    }
    const t = (this.playing % GESTURE_SECONDS) / GESTURE_SECONDS;
    const along = t < 0.65 ? smooth(t / 0.65) : 1;
    hand.position.copy(this.from).addScaledVector(gesture.move, along);
    hand.quaternion.copy(camera.getWorldQuaternion(this.turn));
    hand.scale.setScalar(1);
    const fade = Math.min(1, this.playing / FADE, (total - this.playing) / FADE);
    (hand.material as MeshBasicMaterial).opacity = 0.85 * Math.max(0, fade) * (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15 * 0.6);
    hand.visible = true;
  }

  private hide(): void {
    this.playing = -1;
    this.gesture = null;
    if (this.hand != null) this.hand.visible = false;
  }
}

const PHASES: readonly string[] = Object.values(Phase);

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

