import { Box3, type CanvasTexture, createSystem, type Entity, Grabbed, type Mesh, type MeshBasicMaterial, type Object3D, Pressed, Quaternion, Vector3 } from '@iwsdk/core';
import { type AidCard, aidCard } from '../aid.js';
import { Phase, Week } from '../components.js';
import { callsOpen } from '../season/settle.js';
import { basketTrip, globeAt, noteSeconds, undecided } from '../globe.js';
import { GLOBE_WEEK } from '../season/model.js';
import { canChoose, globeChoice, SEASON_WEEKS, solidarityOf } from '../season/store.js';
import { emitSignal, onSignal } from '../signals.js';
import { familyBoxFor, familyKnocked, familyVisited, instructionShowing, lineArrow, lineIsFresh, linesWaiting, replyWaiting, spyglassLineSaid, setHelpPoint, setHintPinch, setHintRepeatsNext, setHintTarget, setIdleSeconds, weekStep } from '../talk.js';
import { CYCLE_SECONDS, entryStart, freshNear, GLIDE_SECONDS, guided, knockOver, ladder, LATCH_GESTURE, LINE_LEAD, LINE_WAIT, type NearState, nearFrame, shownAgain, waitsForHisLines } from '../hint-rules.js';
import { instructionLine } from '../season/lines.js';
import { familyDone, type Step } from '../line-queue.js';
import { stance } from '../stance.js';
import { type ChoiceStep, choiceStep } from '../choice-moment.js';
import { lessMotion } from '../comfort.js';
import { FADE_SECONDS, FLIGHT } from './family.js';
import { FAR_PULL, HAND_LIFT, HAND_RISE, handStart, HOOK_RISE, POKE_MOVE, POKE_UP } from '../station/hint.js';

/**
 * Seconds of stillness before the hand shows the next gesture: a gesture it
 * has not shown yet comes soon, one it has shown comes back later. The
 * stillness counts only once Tocco has nothing waiting to say and his line
 * has been up long enough to read, so the hand never cuts into a line.
 */
/** The globe's two moves: from the sill up onto the lamp, and from the lamp along to the basket (m). */
const GLOBE_TO_LAMP: readonly [number, number, number] = [0.03, 0.03, -0.12];
const GLOBE_TO_BASKET: readonly [number, number, number] = [-0.12, 0.02, 0];
/** The key of the spyglass's gesture. */
const SPYGLASS_KEY = 'Spyglass pinch';
/** Up off the sill toward the eye. */
const SPYGLASS_UP: readonly [number, number, number] = [0, 0.1, 0.1];
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
/** The week's state as HintSystem first sees it, before any frame: phase, pulls, choice, evening, call, lamp, shutters, family box, aid card, Lina's answer awaited, the choice's step, the family's turn over, the week. */
const FRESH_STATE: readonly number[] = [-1, -1, -2, -2, -2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
interface Gesture {
  /** Which movement it shows: each is shown the first time soon, and later only after a longer stillness. */
  key: string;
  /** The thing to touch; for the choice, each of the three things that can be paid for, shown in turn. */
  targets: Object3D[];
  /** The family box's knock and hook: they keep their own timing (after the box's line), guided or not. */
  box: boolean;
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
 * option, poke the brake, reach for Tessa's window (in the first week, tap
 * her house on the little model), slide the sun, poke a
 * Sunday arrow or the lamp, slide the latch closed. While the family's box
 * is in the Keeper's window, it first shows a knock on its glass (Lina's
 * paper boat), then how to send it home (a poke on its brass hook); the
 * week's own gesture follows once the box has gone, so the hand never
 * sends the Keeper on with the box still in. In the first week the box goes
 * home by itself (FamilySystem): the hand guides the knock with Tocco's
 * line once the family's line has been read, and shows no hook. Only in
 * the headset, not while walking in the town; never in words. Holding,
 * poking, asking and knocking all count as doing something.
 *
 * In the first week, and the first time any gesture is shown, it guides
 * instead (hint-rules.ts): it comes with the instruction that names the
 * step, from the tip of its arrow, and shows the gesture every 1.2 s until
 * the step is done, out of the way while the Keeper's hand is at the
 * thing; after 8 s without progress Tocco points at the thing and it
 * ticks, after 16 s he says the step another way (in the first week).
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
  private askPanel: Object3D | null = null;
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
   * Something was touched out of turn in the first week (BasketSystem, week-locks.ts): the next gesture shows
   * at once, as soon as the hands are free and the family's box is home, without the usual stillness. Cleared once
   * shown, once the lamp is lit (the match is no longer next), when the week moves on, and on restart.
   */
  private urgent = false;
  /** The week turned and the shutters are still closed: the latch's gesture has not shown yet, and comes at the short stillness (hint-rules.ts shownAgain). */
  private weekTurned = false;
  /** The week's state last frame: phase, pulls, choice, evening, call, lamp, shutters, family box, aid card, Lina's answer awaited, the choice's step, the family's turn over, the week. */
  private state: number[] = [...FRESH_STATE];
  private gesture: Gesture | null = null;
  /** The gesture the week waits for as it stands (undefined until worked out, null if none), and whether it was shown before. */
  private pending: Gesture | null | undefined = undefined;
  /** A guided showing (hint-rules.ts): whether the pending gesture is guided, and whether the hand has set out. */
  private guiding = false;
  private started = false;
  /** Seconds the guided step has waited for its instruction, seconds its instruction has been up, and which was up last frame. */
  private waitFor = 0;
  private lineFor = 0;
  private lastShowing = '';
  /** Seconds on this guided step without progress (the help ladder), and which of its rungs have come. */
  private stuck = 0;
  private pointed = false;
  private helped = false;
  /** The Keeper's hand near the thing: the guided hand steps aside (hint-rules.ts). */
  private near: NearState = { away: false, awayFor: 0, again: false, farFor: 0 };
  /** Whether the guided hand glides in from the arrow, from where, seconds it has been visible, and the showing it is on. */
  private glide = false;
  private entry = new Vector3();
  private visibleFor = 0;
  private cycle = -1;
  /** The middles of the guided gesture's things (up to three), and how many. */
  private centres: Vector3[] = [new Vector3(), new Vector3(), new Vector3()];
  private centreCount = 0;
  private reach = new Vector3();
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
    this.askPanel = this.find('AskPanel');
    // Doing something restarts the stillness; a guided hand goes on (only progress ends its step).
    const active = () => {
      if (!this.guiding) this.wake();
    };
    this.cleanupFuncs.push(
      ...(['tocco', 'ask0', 'ask1', 'ask2', 'knock', 'refused', 'busy'] as const).map((name) => onSignal(name, active)),
      // A knock once the box has arrived (Lina's gift comes only then). In the first week it is the guided knock's
      // progress: its hand goes (the box goes home by itself after it).
      onSignal('knock', () => {
        if (this.boxFor < this.arrival()) return;
        this.knocked = true;
        if (this.guiding && this.firstWeek()) this.wake();
      }),
      // Something touched out of turn in the first week (week-locks.ts): the thing to touch is shown at once.
      onSignal('wrong', () => {
        const owed = this.lastLampOwed();
        if (!this.firstWeek() && !owed) return;
        if (owed) {
          // The hand leaves the call's arrows for the match now, even in the middle of showing them.
          this.lampAsked = true;
          this.hide();
          this.wake();
          this.urgent = true;
          return;
        }
        // Guided and out, it shows at once even with the Keeper's hand near the thing; guided and waiting for its line,
        // it sets out now; otherwise the stillness starts over and the gesture shows at once.
        if (this.guiding && this.started) {
          this.near.again = true;
          return;
        }
        if (!this.guiding) this.wake();
        this.urgent = true;
      }),
      onSignal('restart', () => this.restart()),
    );
  }

  /** The season starts over from the start page: every gesture is new again, each shown first after the short stillness. */
  restart(): void {
    this.lampAsked = false;
    this.shown.clear();
    this.visited = false;
    this.boxFor = 0;
    this.knocked = false;
    this.urgent = false;
    this.weekTurned = false;
    this.state.splice(0, this.state.length, ...FRESH_STATE);
    this.wake();
    setIdleSeconds(0);
    setHintTarget(null);
  }

  /** The Keeper did something: the stillness starts over (and a guided step, ended by progress, with it). */
  private wake(): void {
    this.idle = 0;
    this.nothing = false;
    this.pending = undefined;
    this.guiding = false;
    this.started = false;
    this.waitFor = 0;
    this.stuck = 0;
    this.pointed = false;
    this.helped = false;
    freshNear(this.near);
    setHintRepeatsNext(false);
    setHelpPoint(false);
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
    changed = this.track(13, spyglassLineSaid() ? 1 : 0) || changed;
    // The climax's Sunday: the town's note reaching the sill, and the glass going in the basket.
    changed = this.track(14, basketTrip() === 'town' ? (noteSeconds() > 0 ? 2 : 1) : 0) || changed;
    changed = this.track(15, globeAt() === 'load' ? 1 : 0) || changed;
    // The first week's choice: the three things are shown only at its third step (choice-moment.ts).
    const n = week.getValue(Week, 'week') ?? 1;
    if (this.track(12, n)) {
      this.weekTurned = true;
      changed = true;
    }
    if (week.getValue(Week, 'shuttersOpen')) this.weekTurned = false;
    // The first week's family turn going by unvisited: the sun is next.
    changed = this.track(11, phase === Phase.Landed && familyDone(n, week.getValue(Week, 'timer') ?? 0, familyVisited()) ? 1 : 0) || changed;
    changed = this.track(10, CHOICE_STEPS.indexOf(choiceStep(n, phase, week.getValue(Week, 'timer') ?? 0, week.getValue(Week, 'chosen') ?? -1, solidarityOf(n) != null))) || changed;
    // Holding or pressing something is doing something too, but a guided hand goes on: only progress ends its step.
    const holding = this.queries.held.entities.size > 0 || this.queries.pressed.entities.size > 0;
    // Progress inside a guided step (a haul of three, an evening of six) keeps its hand going where it is: only the
    // ladder starts over.
    const going = changed && this.guiding && this.started && this.gesture != null ? this.gesture.key : '';
    const playing = this.playing;
    if (changed || (holding && !this.guiding)) this.wake();
    if (stance() === 'walk') {
      this.hide();
      return;
    }
    // The instruction on Tocco's panel, and how long it has been up (the guided hand comes 0.5 s after it).
    const showing = instructionShowing();
    if (showing !== this.lastShowing) {
      this.lastShowing = showing;
      this.lineFor = 0;
    } else {
      this.lineFor += delta;
    }
    // In the first week, and the first time a gesture is shown, the hand guides (hint-rules.ts).
    if (this.pending === undefined && !this.nothing) {
      this.pending = this.next(week);
      this.nothing = this.pending == null;
      this.guiding = this.pending != null && guided(n, this.shown.has(this.pending.key), this.pending.box);
      if (this.guiding && this.pending != null && this.pending.key === going) this.resume(this.pending, playing);
    }
    if (this.guiding && this.pending != null) {
      // The first week's knock, once out, ends with its step (hint-rules.ts knockOver): the hand does not follow the glass
      // home as the box leaves, and Tocco stops pointing at it.
      if (knockOver(n, this.pending.box, this.started, familyBoxFor(), weekStep())) {
        if (import.meta.env.DEV) console.info(`[hint] the knock's step is over (the box ${familyBoxFor() < 0 ? 'sets off home' : 'is still in'}): its hand goes, at ${(performance.now() / 1000).toFixed(3)} s`);
        this.wake();
        return;
      }
      // In the closed room a step not yet begun waits for his waiting lines (the season's farewell): no hand, no ladder.
      // The first week's knock on the family's box waits for its own step, once their line has been read
      // (line-queue.ts stepOf): it comes with Tocco's line, not before.
      if (waitsForHisLines(phase, this.started, linesWaiting()) || (this.pending.box && !this.started && weekStep() !== 'knock')) {
        this.idle = 0;
        setIdleSeconds(0);
        return;
      }
      this.guide(this.pending, n, delta);
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
      // Lit meanwhile (with the other hand, or while the box flew home), the match is no longer due, and the gestures
      // after it (the latch once Lina has answered) wait for the stillness as usual.
      if (week.getValue(Week, 'lamp')) {
      this.urgent = false;
      this.lampAsked = false;
    }
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
      const again = shownAgain(gesture.key, this.shown.has(gesture.key), this.weekTurned);
      setHintRepeatsNext(again);
      if (!now && this.idle < (again ? IDLE_SECONDS : FIRST_SECONDS)) return;
      this.urgent = false;
      if (import.meta.env.DEV) console.info(`[hint] shows ${gesture.key} after ${this.idle.toFixed(1)} s still${now ? ', at once' : again ? ', again' : ', first time'}`);
      this.gesture = gesture;
      this.playing = 0;
      this.shown.add(gesture.key);
      if (gesture.key === LATCH_GESTURE) this.weekTurned = false;
      setHintRepeatsNext(false);
      // A short tick from the thing itself, so the ear finds it too (SoundSystem).
      setHintTarget(this.gesture.targets[0]);
      emitSignal('hint');
      // Many of the station's meshes carry their shape in world coordinates: the target is where its geometry is.
      this.centreOf(this.gesture.targets[0], this.anchor);
      const material = hand.material as MeshBasicMaterial;
      material.map = this.gesture.pose === 'pinch' ? this.pinch : this.point;
      material.needsUpdate = true;
    }
    this.animate(hand, delta);
  }

  /** Whether the season is in its first week, with the first week's locks and help (week-locks.ts). */
  /** The latch was refused on the season's last Sunday: the hand shows the match, ahead of the call's arrows. */
  private lampAsked = false;

  /** The season's last Sunday, its lamp not lit: the latch refused, the match shows at once as in the first week. */
  private lastLampOwed(): boolean {
    for (const week of this.queries.week.entities) {
      return week.getValue(Week, 'week') === SEASON_WEEKS && week.getValue(Week, 'phase') === Phase.Sunday && !week.getValue(Week, 'lamp');
    }
    return false;
  }

  private firstWeek(): boolean {
    for (const week of this.queries.week.entities) return (week.getValue(Week, 'week') ?? 1) === 1;
    return false;
  }

  /**
   * Where a thing to touch is, into `out`: its geometry's middle (many of
   * the station's meshes carry their shape in world coordinates), or, for a
   * handle whose mesh runs on far beyond it (the rope's wooden handle and
   * the rope up to the pulley arm), the handle at the mesh's own origin.
   */
  private centreOf(target: Object3D, out: Vector3): Vector3 {
    if (AT_ORIGIN.has(target.name)) return target.getWorldPosition(out);
    return this.bounds.setFromObject(target).getCenter(out);
  }

  /** Seconds the family's box takes to arrive in the Keeper's window: its flight, or its fade with less motion. */
  private arrival(): number {
    return lessMotion() ? FADE_SECONDS : FLIGHT;
  }

  /** The gesture the week is waiting for, or none. */
  private next(week: Entity): Gesture | null {
    const phase = week.getValue(Week, 'phase');
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const first = (week.getValue(Week, 'week') ?? 1) === 1;
    const make = (name: string, pose: Pose, move: readonly [number, number, number], lift = HAND_LIFT, key = `${name} ${pose}`, rise = HAND_RISE): Gesture | null => {
      const target = this.find(name);
      return target == null ? null : { key, targets: [target], box: name === 'FamilyGlass' || name === 'FamilyHook', pose, move: new Vector3(move[0], move[1], move[2]), lift, rise };
    };
    // Closed at any point of the week (only a moving basket keeps them open): pull the latch to open them.
    if (!open) return make('Latch', 'pinch', [0.08, 0, 0]);
    // The family's box in the window: first a knock on its glass (Lina leaves her paper boat), then how to send it
    // home, a poke on its brass hook, up into it from below, clear of the family's line; the week goes on after. In the
    // first week only the knock: the box goes home by itself after it (FamilySystem).
    if (this.familyBox?.visible ?? false) {
      if (first) return familyKnocked() ? null : make('FamilyGlass', 'point', POKE_MOVE);
      return this.knocked ? make('FamilyHook', 'point', POKE_UP, HAND_LIFT, 'FamilyHook point', HOOK_RISE) : make('FamilyGlass', 'point', POKE_MOVE);
    }
    switch (phase) {
      case Phase.Morning:
      case Phase.Landed:
      case Phase.Days: {
        // The third week's globe, not yet on the lamp: take it and bring it over.
        const at = globeAt();
        if ((week.getValue(Week, 'week') ?? 1) === GLOBE_WEEK && (at === 'basket' || at === 'sill')) return make('LooseGlobe', 'pinch', GLOBE_TO_LAMP);
        // The second morning, once he has said it has come: how to lift the spyglass. It may be left alone; the bell ends it.
        if (phase === Phase.Morning && (week.getValue(Week, 'week') ?? 1) === 2 && spyglassLineSaid()) return make('Spyglass', 'pinch', SPYGLASS_UP);
        if (phase === Phase.Morning) return null;
        break;
      }
      default:
        break;
    }
    switch (phase) {
      case Phase.Bell:
        return make('RopeToggleMesh', 'pinch', [0, -0.12, 0]);
      case Phase.Choosing: {
        // The brake: take the knob and pull it down.
        if ((week.getValue(Week, 'chosen') ?? -1) >= 0) return make('BrakeGrip', 'pinch', [0.02, -0.07, 0]);
        // Tapping any of the three is one movement; in the first week, once the card and the jar have had their turn.
        const n = week.getValue(Week, 'week') ?? 1;
        if (choiceStep(n, Phase.Choosing, week.getValue(Week, 'timer') ?? 0, -1, solidarityOf(n) != null) !== 'choose') return null;
        // Each of the three the jar can pay for, in turn (a guided hand pokes them one after another).
        let gesture: Gesture | null = null;
        for (let i = 0; i < 3; i += 1) {
          if (!canChoose(i)) continue;
          const name = ['ChoiceEase', 'ChoiceHelp', 'ChoiceBuild'][i];
          if (gesture == null) gesture = make(name, 'point', [0, -0.03, 0], 0.07, 'choice');
          else {
            const target = this.find(name);
            if (target != null) gesture.targets.push(target);
          }
        }
        return gesture;
      }
      case Phase.Landed: {
        // Once the family has been visited (the box may already be home again), the sun is next; in the first week
        // also once their turn has gone by unvisited (line-queue.ts familyDone).
        const n = week.getValue(Week, 'week') ?? 1;
        if (this.visited || familyDone(n, week.getValue(Week, 'timer') ?? 0, familyVisited())) return make('SunKnob', 'point', [0, -0.025, 0]);
        // In the first week, a tap on Nora's house on the little model; later, reach across the square for her
        // window: a pinch drawn back toward the Keeper.
        return n === 1 ? make('MaquetteHouse', 'point', POKE_MOVE) : make('TessaWindow', 'pinch', FAR_PULL, -1);
      }
      case Phase.Days:
        // In the first week the sun is taught as a tap (its tap moves it on to the next evening worth seeing); later a slide.
        return (week.getValue(Week, 'week') ?? 1) === 1 ? make('SunKnob', 'point', [0, -0.025, 0]) : make('SunKnob', 'pinch', [0.06, 0, 0]);
      case Phase.Sunday: {
        const lamp = week.getValue(Week, 'lamp') ?? false;
        // A solidarity week has no call and no lamp to point at, and is kept only once its card has come up in the second basket.
        const n = week.getValue(Week, 'week') ?? 1;
        if (solidarityOf(n) != null) return aidCard() === 'sill' ? make('Latch', 'pinch', [0.08, 0, 0]) : null;
        // The climax's Sunday, its note on the sill: the lever once the glass is in the basket; before, the glass and the match, in turn.
        const deciding = undecided(n, true, globeChoice() != null);
        if (deciding && basketTrip() === 'town' && noteSeconds() > 0) {
          if (globeAt() === 'load') return make('BrakeGrip', 'pinch', [0.02, -0.07, 0]);
          const gesture = make('LooseGlobe', 'pinch', GLOBE_TO_BASKET, HAND_LIFT, 'glass');
          const match = this.find('Match');
          if (gesture != null && match != null) gesture.targets.push(match);
          return gesture;
        }
        // No arrows in the first week: the lamp is next at once.
        if (!lamp && !(this.lampAsked && n === SEASON_WEEKS) && callsOpen(n, false) && (week.getValue(Week, 'forecast') ?? -1) < 0) return make('ArrowUp', 'point', [0, -0.03, 0]);
        // Light the lamp: in the first week a tap on it ("Strike the match, or tap the lamp."), its tick from the lamp;
        // later, draw the match across its box, toward the lamp.
        // (On the climax's Sunday nothing, until the town's note has come.)
        if (!lamp && deciding) return null;
        if (!lamp) return n === 1 ? make('SundayLamp', 'point', POKE_MOVE) : make('Match', 'pinch', [0.06, 0, 0]);
        // Lit, the town waits for Lina's answer: nothing to show until she has.
        if (replyWaiting()) return null;
        // The bolt only slides one way: the same pull that opened the shutters closes them.
        return make('Latch', 'pinch', [0.08, 0, 0]);
      }
      default:
        return null;
    }
  }

  /**
   * A guided step (hint-rules.ts): the hand sets out 0.5 s after the step's
   * instruction goes up (or, with none to wait for, once any line up has
   * been read), from the arrow's tip, and shows the gesture every 1.2 s
   * until the step is done; it steps aside while the Keeper's hand is at
   * the thing. The help ladder runs meanwhile.
   */
  private guide(gesture: Gesture, n: number, delta: number): void {
    const hand = this.hand;
    if (hand == null) return;
    // No stillness and no sill taps: the ladder's pointing takes their place.
    this.idle = 0;
    setIdleSeconds(0);
    setHintRepeatsNext(false);
    this.stuck += delta;
    if (!this.started) {
      const step = weekStep();
      // Its own line: the step's instruction, up since this step began (not the last step's, still on the panel the frame
      // its step ended: ToccoSystem runs after this system).
      const lineUp = step !== '' && this.lastShowing === step && this.lineFor <= this.waitFor;
      const expected = step !== '' && instructionLine(step as Step, n, SEASON_WEEKS) !== '';
      this.waitFor += delta;
      // The spyglass's hand comes while his morning lines run on, one after another: the bell ends it, not the lines.
      if (!this.urgent && gesture.key !== SPYGLASS_KEY) {
        if (lineUp ? this.lineFor < LINE_LEAD : expected ? this.waitFor < LINE_WAIT : lineIsFresh() || this.waitFor < LINE_LEAD) return;
      }
      this.setOut(gesture, lineUp);
    }
    // The help ladder: Tocco points at the thing (and it ticks) at 8 s, his help line at 16 s in the first week.
    const rung = ladder(this.stuck);
    if (rung !== 'none' && !this.pointed) {
      this.pointed = true;
      setHintTarget(gesture.targets[0]);
      emitSignal('hint');
      const c = this.centres[0];
      setHelpPoint(true, c.x, c.y, c.z);
      if (import.meta.env.DEV) console.info(`[hint] ${this.stuck.toFixed(1)} s on ${gesture.key} without progress: Tocco points, it ticks`);
    }
    if (rung === 'help' && !this.helped && n === 1) {
      this.helped = true;
      if (import.meta.env.DEV) console.info(`[hint] ${this.stuck.toFixed(1)} s on ${gesture.key} without progress: his help line`);
      emitSignal('help');
    }
    // Out of the way while the Keeper's hand is at the thing; back when it moves away, or after 3 s there.
    const wasAway = this.near.away;
    const shows = nearFrame(this.near, this.handDistance(gesture), delta);
    if (import.meta.env.DEV && this.near.away !== wasAway) {
      console.info(`[hint] ${this.near.away ? 'steps aside: a hand within 15 cm of' : this.near.again ? 'back after 3 s at' : 'back: the hand moved away from'} ${gesture.key} at ${(performance.now() / 1000).toFixed(3)} s`);
    }
    // The reach for the far window stands where Tocco's questions open: it waits while they are up.
    if (!shows || (gesture.lift < 0 && (this.askPanel?.visible ?? false))) {
      if (hand.visible) this.hide(false);
      this.visibleFor = 0;
      return;
    }
    this.animateGuided(hand, gesture, delta);
  }

  /** Goes on guiding the same gesture after progress inside its step: no new entry, no tick, the showing where it was. */
  private resume(gesture: Gesture, playing: number): void {
    this.setOut(gesture, false, false);
    this.playing = Math.max(0, playing);
    this.visibleFor = 1;
  }

  /** The guided hand sets out: from the arrow's tip (pulled in to 30 degrees) if its line is up, otherwise where the gesture starts. */
  private setOut(gesture: Gesture, lineUp: boolean, fresh = true): void {
    const hand = this.hand;
    if (hand == null) return;
    this.started = true;
    this.urgent = false;
    this.playing = 0;
    this.visibleFor = 0;
    this.cycle = -1;
    this.gesture = gesture;
    this.shown.add(gesture.key);
    freshNear(this.near);
    // Many of the station's meshes carry their shape in world coordinates: a thing is where its geometry is.
    this.centreCount = Math.min(this.centres.length, gesture.targets.length);
    for (let i = 0; i < this.centreCount; i += 1) this.centreOf(gesture.targets[i], this.centres[i]);
    this.world.camera.getWorldPosition(this.eye);
    const tip = lineArrow();
    this.glide = lineUp && tip.shown && !lessMotion();
    if (this.glide) entryStart(tip, this.eye, this.entry);
    const material = hand.material as MeshBasicMaterial;
    material.map = gesture.pose === 'pinch' ? this.pinch : this.point;
    material.needsUpdate = true;
    if (!fresh) return;
    // A short tick from the thing itself, so the ear finds it too (SoundSystem).
    setHintTarget(gesture.targets[0]);
    emitSignal('hint');
    if (import.meta.env.DEV) {
      const from = this.glide ? this.entry : this.centres[0];
      const yaw = (Math.atan2(from.x - this.eye.x, this.eye.z - from.z) * 180) / Math.PI;
      const pitch = (Math.atan2(from.y - this.eye.y, Math.hypot(from.x - this.eye.x, from.z - this.eye.z)) * 180) / Math.PI;
      console.info(`[hint] guides ${gesture.key} ${this.waitFor.toFixed(2)} s into its step, ${lineUp ? `${this.lineFor.toFixed(2)} s after its line` : 'with no line up'}, ${this.glide ? 'from the arrow' : 'at the thing'} at ${yaw.toFixed(1)} across, ${pitch.toFixed(1)} up, at ${(performance.now() / 1000).toFixed(3)} s`);
    }
  }

  /**
   * The nearest of the Keeper's hands (index tips, or a controller's grip)
   * to the guided gesture's things where they are now (m); 0 while one of
   * them is held (the rope's handle pulled down, the latch slid).
   */
  private handDistance(gesture: Gesture): number {
    for (const entity of this.queries.held.entities) {
      const held = entity.object3D;
      if (held == null) continue;
      for (let i = 0; i < this.centreCount; i += 1) if (held === gesture.targets[i] || held.getObjectById(gesture.targets[i].id) != null) return 0;
    }
    // Where each is now: its bounds as placed this frame (a pulled handle moves with the hand).
    for (let i = 0; i < this.centreCount; i += 1) this.centreOf(gesture.targets[i], this.centres[i]);
    let best = Infinity;
    for (const side of SIDES) {
      best = Math.min(best, this.nearestTo(this.player.indexTipSpaces[side]), this.nearestTo(this.player.gripSpaces[side]));
    }
    return best;
  }

  /** How near a hand's space is to the nearest of the guided gesture's things (m), as handDistance measured them. */
  private nearestTo(space: Object3D): number {
    space.getWorldPosition(this.reach);
    let best = Infinity;
    for (let i = 0; i < this.centreCount; i += 1) best = Math.min(best, this.reach.distanceTo(this.centres[i]));
    return best;
  }

  /** The guided hand: its glide in from the arrow, then the gesture every CYCLE_SECONDS, in turn over its things. */
  private animateGuided(hand: Mesh, gesture: Gesture, delta: number): void {
    this.playing += delta;
    this.visibleFor += delta;
    const camera = this.world.camera;
    camera.getWorldPosition(this.eye);
    const lead = this.glide ? GLIDE_SECONDS : 0;
    let along = 0;
    let dip = 1;
    let k = 0;
    if (this.playing >= lead) {
      const c = (this.playing - lead) / CYCLE_SECONDS;
      k = Math.floor(c);
      const f = c - k;
      along = f < 0.55 ? smooth(f / 0.55) : 1;
      dip = f < 0.85 ? 1 : 1 - ((f - 0.85) / 0.15) * 0.6;
    }
    const target = this.centreCount > 0 ? this.centres[k % this.centreCount] : this.anchor;
    if (k !== this.cycle) this.cycle = k;
    handStart(target, this.eye, gesture.lift, gesture.rise, this.from, this.toward);
    if (this.playing < lead) {
      // Gliding from the arrow's tip to where the gesture starts.
      hand.position.copy(this.entry).lerp(this.from, smooth(this.playing / lead));
    } else {
      hand.position.copy(this.from).addScaledVector(gesture.move, along);
    }
    hand.quaternion.copy(camera.getWorldQuaternion(this.turn));
    hand.scale.setScalar(1);
    const shown = Math.min(1, this.visibleFor / FADE) * dip;
    (hand.material as MeshBasicMaterial).opacity = 0.85 * shown;
    hand.visible = true;
    setHintPinch(gesture.pose === 'pinch' ? shown : 0);
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
    // Where the hand starts: in front of its target, toward the Keeper; for the far window, an arm's length out beside the line to it.
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

  /** Hides the hand; `end` (the default) ends its showing too, a guided hand only stepping aside does not. */
  private hide(end = true): void {
    if (end) {
      this.playing = -1;
      this.gesture = null;
    }
    setHintPinch(0);
    if (this.hand != null) this.hand.visible = false;
  }
}

const PHASES: readonly string[] = Object.values(Phase);
const CARDS: readonly AidCard[] = ['none', 'basket', 'sill'];
const CHOICE_STEPS: readonly ChoiceStep[] = ['', 'card', 'jar', 'choose'];
/** Both hands, in a fixed order (no array is made each frame). */
const SIDES = ['left', 'right'] as const;
/** Things whose mesh reaches far past the part to touch: the hand goes to the mesh's origin (the rope's handle), not its middle. */
const AT_ORIGIN: ReadonlySet<string> = new Set(['RopeToggleMesh']);

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

