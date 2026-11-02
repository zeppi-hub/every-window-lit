import { Box3, type CanvasTexture, createSystem, type Entity, Grabbed, type Mesh, type MeshBasicMaterial, type Object3D, Pressed, Quaternion, Vector3 } from '@iwsdk/core';
import { type AidCard, aidCard } from '../aid.js';
import { Phase, Week } from '../components.js';
import { callsOpen } from '../season/settle.js';
import { canChoose, solidarityOf } from '../season/store.js';
import { emitSignal, onSignal } from '../signals.js';
import { lineIsFresh, linesWaiting, replyWaiting, setHintPinch, setHintRepeatsNext, setHintTarget, setIdleSeconds } from '../talk.js';
import { stance } from '../stance.js';
import { lessMotion } from '../comfort.js';
import { FADE_SECONDS, FLIGHT } from './family.js';
import { HAND_LIFT, HAND_RISE, handStart, HOOK_RISE, POKE_MOVE, POKE_UP } from '../station/hint.js';

/**
 * Seconds of stillness before the hand shows the next gesture: a gesture it
 * has not shown yet comes soon, one it has shown comes back later. The
 * stillness counts only once Tocco has nothing waiting to say and his line
 * has been up long enough to read, so the hand never cuts into a line.
 */
const IDLE_SECONDS = 8;
const FIRST_SECONDS = 2.5;
/**
 * The family's box in the Keeper's window: its line is read like a phase's
 * line, so the stillness starts only once the box has arrived (its flight,
 * or its fade with less motion) and its line has been up this long.
 */
const BOX_LINE_SECONDS = 4;
/** One gesture's length, how many times it plays, and the fade either side. */
const GESTURE_SECONDS = 1.3;
const PLAYS = 2;
const FADE = 0.25;

type Pose = 'point' | 'pinch';
/** The week's state as HintSystem first sees it, before any frame: phase, pulls, choice, evening, call, lamp, shutters, family box, aid card, Lina's answer awaited. */
const FRESH_STATE: readonly number[] = [-1, -1, -2, -2, -2, -1, -1, -1, -1, -1];
interface Gesture {
  /** Which movement it shows: each is shown the first time soon, and later only after a longer stillness. */
  key: string;
  target: Object3D;
  pose: Pose;
  /** The hand's travel over one gesture, in metres (world). */
  move: Vector3;
  /** Offset from the target toward the Keeper, so the hand sits in front of it (negative: the far window's reach). */
  lift: number;
  /** How far above the target's middle the hand starts. */
  rise: number;
}

/**
 * The ghost hand (META_VR_FIKIR.md §3, §7): when the Keeper has done nothing
 * for a while, a soft hand shows the week's next gesture beside the thing
 * to touch, twice, and fades: slide the latch, pull the rope, tap an
 * option, poke the brake, reach for Tessa's window, slide the sun, poke a
 * Sunday arrow or the lamp, slide the latch closed. While the family's box
 * is in the Keeper's window, it first shows a knock on its glass (Lina's
 * paper boat), then how to send it home (a poke on its brass hook); the
 * week's own gesture follows once the box has gone, so the hand never
 * sends the Keeper on with the box still in. Only in
 * the headset, not while walking in the town; never in words. Holding,
 * poking, asking and knocking all count as doing something.
 */
export class HintSystem extends createSystem({
  week: { required: [Week] },
  held: { required: [Grabbed] },
  pressed: { required: [Pressed] },
}) {
  private hand: Mesh | null = null;
  private point: CanvasTexture | null = null;
  private pinch: CanvasTexture | null = null;
  private find: (name: string) => Object3D | null = () => null;
  private familyBox: Object3D | null = null;
  private idle = 0;
  private playing = -1;
  /** The movements shown so far in this headset session. */
  private shown = new Set<string>();
  private immersive = false;
  /** Whether next() found nothing for the week as it stands: asked again only once something changes. */
  private nothing = false;
  /** Whether the family was visited since the basket landed: then the sun is next, even once the box is home. */
  private visited = false;
  /** Seconds the family's box has been in the Keeper's window (0 while it is home). */
  private boxFor = 0;
  /**
   * Whether the Keeper knocked on the box's glass on this visit (Lina's paper boat came): until then the hand shows
   * the knock, after it the hook that sends the box home. Cleared when the box goes home or the week moves on, and
   * on restart.
   */
  private knocked = false;
  /**
   * The latch was tried in the first week before the lamp was lit (BasketSystem): the next gesture (the match) shows
   * at once, as soon as the hands are free and the family's box is home, without the usual stillness. Cleared once
   * shown, when the week moves on, and on restart.
   */
  private urgent = false;
  /** The week's state last frame: phase, pulls, choice, evening, call, lamp, shutters, family box, aid card, Lina's answer awaited. */
  private state: number[] = [...FRESH_STATE];
  private gesture: Gesture | null = null;
  /** The gesture the week waits for as it stands (undefined until worked out, null if none), and whether it was shown before. */
  private pending: Gesture | null | undefined = undefined;
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
    this.familyBox = this.find('FamilyBox');
    const active = () => this.wake();
    this.cleanupFuncs.push(
      ...(['tocco', 'ask0', 'ask1', 'ask2', 'knock', 'refused', 'busy'] as const).map((name) => onSignal(name, active)),
      // A knock once the box has arrived (Lina's gift comes only then).
      onSignal('knock', () => {
        if (this.boxFor >= this.arrival()) this.knocked = true;
      }),
      onSignal('unlit', () => {
        this.wake();
        this.urgent = true;
      }),
      onSignal('restart', () => this.restart()),
    );
  }

  /** The season starts over from the start page: every gesture is new again, each shown first after the short stillness. */
  restart(): void {
    this.shown.clear();
    this.visited = false;
    this.boxFor = 0;
    this.knocked = false;
    this.urgent = false;
    this.state.splice(0, this.state.length, ...FRESH_STATE);
    this.wake();
    setIdleSeconds(0);
    setHintTarget(null);
  }

  /** The Keeper did something: the stillness starts over. */
  private wake(): void {
    this.idle = 0;
    this.nothing = false;
    this.pending = undefined;
    setHintRepeatsNext(false);
    this.hide();
  }

  /** Writes one value of the week's state; true if it changed. */
  private track(i: number, value: number): boolean {
    if (this.state[i] === value) return false;
    this.state[i] = value;
    return true;
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    const hand = this.hand;
    if (week == null || hand == null) return;
    // The hand shows only in the headset; entering it starts the clock afresh, with the quick first hint.
    const immersive = this.renderer.xr.isPresenting;
    if (immersive !== this.immersive) {
      this.immersive = immersive;
      this.shown.clear();
      this.wake();
    }
    if (!immersive) return;
    // Anything the Keeper does changes the week's state: the stillness starts over.
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const boxIn = this.familyBox?.visible ?? false;
    // The box's clock and its knock count for one visit: home again, they start over.
    this.boxFor = boxIn ? this.boxFor + delta : 0;
    if (!boxIn) this.knocked = false;
    if (phase !== Phase.Landed) this.visited = false;
    else if (boxIn) this.visited = true;
    const moved = this.track(0, PHASES.indexOf(phase));
    // The week moved on: a hint that was due at once no longer fits, nor does a knock on an earlier phase's visit.
    if (moved) {
      this.urgent = false;
      this.knocked = false;
    }
    let changed = moved;
    changed = this.track(1, week.getValue(Week, 'pulls') ?? 0) || changed;
    changed = this.track(2, week.getValue(Week, 'chosen') ?? -1) || changed;
    changed = this.track(3, week.getValue(Week, 'day') ?? -1) || changed;
    changed = this.track(4, week.getValue(Week, 'forecast') ?? -1) || changed;
    changed = this.track(5, week.getValue(Week, 'lamp') ? 1 : 0) || changed;
    changed = this.track(6, week.getValue(Week, 'shuttersOpen') ? 1 : 0) || changed;
    changed = this.track(7, boxIn ? 1 : 0) || changed;
    changed = this.track(8, CARDS.indexOf(aidCard())) || changed;
    changed = this.track(9, replyWaiting() ? 1 : 0) || changed;
    // Holding or pressing something is doing something too.
    if (changed || this.queries.held.entities.size > 0 || this.queries.pressed.entities.size > 0) this.wake();
    if (stance() === 'walk') {
      this.hide();
      return;
    }
    // While Tocco has lines waiting, or his line went up only just now, the stillness has not started; lines the
    // family's box holds back do not count, but the family's own line, until it has been read, does.
    const boxReading = boxIn && this.boxFor < this.arrival() + BOX_LINE_SECONDS;
    if (this.playing < 0 && ((linesWaiting() && !boxIn) || lineIsFresh() || boxReading)) this.idle = 0;
    else this.idle += delta;
    setIdleSeconds(this.idle);
    if (this.playing < 0) {
      // Due at once (the latch tried before the first lamp): no stillness needed, only free hands and the box home.
      const now = this.urgent;
      if (now && (this.queries.held.entities.size > 0 || this.queries.pressed.entities.size > 0 || boxIn)) return;
      if (!now && (this.nothing || this.idle < FIRST_SECONDS)) return;
      if (this.pending === undefined) {
        this.pending = this.next(week);
        if (this.pending == null) {
          this.nothing = true;
          return;
        }
      }
      const gesture = this.pending;
      if (gesture == null) return;
      const again = this.shown.has(gesture.key);
      setHintRepeatsNext(again);
      if (!now && this.idle < (again ? IDLE_SECONDS : FIRST_SECONDS)) return;
      this.urgent = false;
      if (import.meta.env.DEV) console.info(`[hint] shows ${gesture.key} after ${this.idle.toFixed(1)} s still${now ? ', at once' : again ? ', again' : ', first time'}`);
      this.gesture = gesture;
      this.playing = 0;
      this.shown.add(gesture.key);
      setHintRepeatsNext(false);
      // A short tick from the thing itself, so the ear finds it too (SoundSystem).
      setHintTarget(this.gesture.target);
      emitSignal('hint');
      // Many of the station's meshes carry their shape in world coordinates: the target is where its geometry is.
      this.bounds.setFromObject(this.gesture.target).getCenter(this.anchor);
      const material = hand.material as MeshBasicMaterial;
      material.map = this.gesture.pose === 'pinch' ? this.pinch : this.point;
      material.needsUpdate = true;
    }
    this.animate(hand, delta);
  }

  /** Seconds the family's box takes to arrive in the Keeper's window: its flight, or its fade with less motion. */
  private arrival(): number {
    return lessMotion() ? FADE_SECONDS : FLIGHT;
  }

  /** The gesture the week is waiting for, or none. */
  private next(week: Entity): Gesture | null {
    const phase = week.getValue(Week, 'phase');
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const make = (name: string, pose: Pose, move: readonly [number, number, number], lift = HAND_LIFT, key = `${name} ${pose}`, rise = HAND_RISE): Gesture | null => {
      const target = this.find(name);
      return target == null ? null : { key, target, pose, move: new Vector3(move[0], move[1], move[2]), lift, rise };
    };
    // Closed at any point of the week (only a moving basket keeps them open): pull the latch to open them.
    if (!open) return make('Latch', 'pinch', [0.08, 0, 0]);
    // The family's box in the window: first a knock on its glass (Lina leaves her paper boat), then how to send it
    // home, a poke on its brass hook, up into it from below, clear of the family's line; the week goes on after.
    if (this.familyBox?.visible ?? false) {
      return this.knocked ? make('FamilyHook', 'point', POKE_UP, HAND_LIFT, 'FamilyHook point', HOOK_RISE) : make('FamilyGlass', 'point', POKE_MOVE);
    }
    switch (phase) {
      case Phase.Bell:
        return make('RopeToggleMesh', 'pinch', [0, -0.12, 0]);
      case Phase.Choosing: {
        // The brake: take the knob and pull it down.
        if ((week.getValue(Week, 'chosen') ?? -1) >= 0) return make('BrakeGrip', 'pinch', [0.02, -0.07, 0]);
        // Tapping any of the three is one movement.
        for (let i = 0; i < 3; i += 1) if (canChoose(i)) return make(['ChoiceEase', 'ChoiceHelp', 'ChoiceBuild'][i], 'point', [0, -0.03, 0], 0.07, 'choice');
        return null;
      }
      case Phase.Landed:
        // Reach across the square for Tessa's window: a pinch drawn back toward the Keeper.
        // Once the family has been visited (the box may already be home again), the sun is next.
        return this.visited ? make('SunKnob', 'point', [0, -0.025, 0]) : make('TessaWindow', 'pinch', [0, 0, 0.12], -1);
      case Phase.Days:
        return make('SunKnob', 'pinch', [0.06, 0, 0]);
      case Phase.Sunday: {
        const lamp = week.getValue(Week, 'lamp') ?? false;
        // A solidarity week has no call and no lamp to point at, and is kept only once its card has come up in the second basket.
        const n = week.getValue(Week, 'week') ?? 1;
        if (solidarityOf(n) != null) return aidCard() === 'sill' ? make('Latch', 'pinch', [0.08, 0, 0]) : null;
        // No arrows in the first week: the lamp is next at once.
        if (!lamp && callsOpen(n, false) && (week.getValue(Week, 'forecast') ?? -1) < 0) return make('ArrowUp', 'point', [0, -0.03, 0]);
        // Light the lamp: draw the match across its box, toward the lamp.
        if (!lamp) return make('Match', 'pinch', [0.06, 0, 0]);
        // Lit, the town waits for Lina's answer: nothing to show until she has.
        if (replyWaiting()) return null;
        // The bolt only slides one way: the same pull that opened the shutters closes them.
        return make('Latch', 'pinch', [0.08, 0, 0]);
      }
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
      if (import.meta.env.DEV) console.info('[hint] done');
      this.hide();
      this.idle = 0;
      setIdleSeconds(0);
      // The same gesture again needs the longer stillness: Tocco may tap first.
      setHintRepeatsNext(this.pending != null && this.shown.has(this.pending.key));
      return;
    }
    const camera = this.world.camera;
    camera.getWorldPosition(this.eye);
    // Where the hand starts: in front of its target, toward the Keeper; for the far window, an arm's length out along the line to it.
    handStart(this.anchor, this.eye, gesture.lift, gesture.rise, this.from, this.toward);
    const t = (this.playing % GESTURE_SECONDS) / GESTURE_SECONDS;
    const along = t < 0.65 ? smooth(t / 0.65) : 1;
    hand.position.copy(this.from).addScaledVector(gesture.move, along);
    hand.quaternion.copy(camera.getWorldQuaternion(this.turn));
    hand.scale.setScalar(1);
    const fade = Math.min(1, this.playing / FADE, (total - this.playing) / FADE);
    const shown = Math.max(0, fade) * (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15 * 0.6);
    (hand.material as MeshBasicMaterial).opacity = 0.85 * shown;
    hand.visible = true;
    // A pinch shown: a controller's trigger glows with the hand.
    setHintPinch(gesture.pose === 'pinch' ? shown : 0);
  }

  private hide(): void {
    this.playing = -1;
    this.gesture = null;
    setHintPinch(0);
    if (this.hand != null) this.hand.visible = false;
  }
}

const PHASES: readonly string[] = Object.values(Phase);
const CARDS: readonly AidCard[] = ['none', 'basket', 'sill'];

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

