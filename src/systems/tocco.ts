import { Box3, type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { calledLine, choiceLine, SPYGLASS_LINE, spottedLine, WINDOWS_FIRST, festivalLines, FIRST_WEEK, goalLine, INTRO, instructionLine, LAG_LINE, lampLitLine, outcomeLine, memoryLine, morningLine, notchLine, phaseLine, REFUSED_BUILT, REFUSED_COINS, SEASON_OVER, settledLine, stageLine, sundayLine, WEEK, weatherLines, weekDoneLine } from '../season/lines.js';
import { LINE_SECONDS, MIN_SECONDS, type PanelFacts, panelMove, type Step, type StepFacts, stepOf, type Up } from '../line-queue.js';
import { actual, BUILD, HELP, type Kind, type Town, toccoCall, WORKING } from '../season/model.js';
import { callsOpen, keptEntry, shouldHush } from '../season/settle.js';
import { currentTown, firstLag, keepWeek, lastKept, lastRefusal, markSettled, realWeek, restartSeason, SEASON_WEEKS, solidarityOf, townBefore, unsettled, unsettledCalls, weatherOf } from '../season/store.js';
import { liveLine } from '../season/advisor.js';
import { answer, QUESTIONS } from '../season/answers.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { conducting, festivalShare } from './festival.js';
import { OUTCOME_DAY, outcomeShows } from './outcomes.js';
import { ASK_ROWS, ASK_SIZE, drawAsk } from '../station/ask.js';
import { familyVisited, hintRepeatsNext, idleSeconds, replyCalling, replyWaiting, setCardLineShowing, setInstructionShowing, setLineFresh, setLinesWaiting, setReply, setRevealHeld } from '../talk.js';
import { replyHolds } from '../season/window-light.js';
import { largerCaptions, lessMotion } from '../comfort.js';
import { drawLine } from '../station/family.js';
import { setRoomGlow } from '../station/materials.js';
import { FOCUS } from '../station/focus.js';
import { PLAZA_Y } from '../station/layout.js';
import { ASK_LIFT, faceSeat, LAMP_FLAME_Y, LINE_AT_BASKET, LINE_HOME, LINE_SUNDAY, NOTCHES, TOCCO_IN, TOCCO_NECK, TOCCO_OUT } from '../station/tocco.js';

/** The question panel stays open this long, and its rows park this far below while closed. */
const ASK_SECONDS = 8;
const PARKED = 200;
/** A first poke brings his last line back for this long. */
const REPEAT_SECONDS = 4;
/** On the very first morning he waits this long after the shutters open: the town speaks first. */
const HUSH_SECONDS = 6;
/** How far the lamp's glow sits in front of the flame, toward the Keeper (m). */
const HALO_LEAD = 0.07;
/** How far the flame leans toward Lina's window while her window calls (radians), and how far its middle moves (m). */
const LEAN = 0.45;
const LEAN_SHIFT = 0.004;
/** How long the struck match burns at its head. */
const MATCH_FLAME_SECONDS = 1.2;
/** His yaw at rest (turned toward the seat), and how far he turns to look at what he names (radians). */
const REST_YAW = 0.5;
const LOOK_TURN = 1.6;
/** How far his head turns and tilts (radians), how near a hand must come for him to watch it (m). */
const HEAD_TURN = 1.0;
const HEAD_TILT = 0.6;
const WATCH_HAND = 0.4;
/** Still this long, he taps the sill twice with his hammer, when the ghost hand is about to show a gesture again (at 8 s). */
const TAP_AFTER = 5;
const TAP_SECONDS = 0.9;
/** How long a raised hand waits, and how near the Keeper's hand must come to meet it (m). */
const HIGH_FIVE_SECONDS = 8;
const HIGH_FIVE_REACH = 0.08;
/** How long last week's answer waits on a morning, and when in that wait the square hushes. */
const REVEAL_SECONDS = 3;
const HUSH_AT = 1;
/** Seconds Tocco takes to ride out or back, and how far his door swings. */
const RIDE_SECONDS = 0.8;
const DOOR_OPEN = -1.6;

/**
 * Tocco, the Keeper's wooden advisor and rival. He rides out of his door
 * when the shutters open and back in when they close, and says one short
 * line at each turn of the week: what the view shows this morning, the
 * bell, the choice, the basket going down, Nora's window, the evenings,
 * Sunday. His lines are templates (season/lines.ts) filled from the
 * season's model, so they never disagree with the town. On Sunday two brass
 * arrows rise for the Keeper's call on the real series' next period; Tocco
 * makes his own from a plain trend rule. Poke him and three questions show
 * ("Who does this help?", "What happens later?", "What would you do?");
 * his answers come from the model too, and a live sentence may follow
 * (season/advisor.ts). The lamp waits to be lit. Closing
 * the shutters on Sunday keeps the week (season/store.ts saves it); the
 * next morning Tocco settles both calls against the real data and a notch
 * is carved on the jamb for each side that was right.
 */
export class ToccoSystem extends createSystem({
  week: { required: [Week] },
}) {
  private tocco: Object3D | null = null;
  private door: Object3D | null = null;
  private arrowUp: Object3D | null = null;
  private down: Object3D | null = null;
  private lamp: Mesh | null = null;
  private glass: Mesh | null = null;
  private flame: Object3D | null = null;
  private halo: Mesh | null = null;
  private flameAt = new Vector3();
  private toEye = new Vector3();
  private match: Mesh | null = null;
  private matchFlameMesh: Object3D | null = null;
  private matchFlame = 0;
  /** Whether this week's outcome has been said (reset as the basket lands). */
  private outcomeSaid = false;
  /** Where his line hangs now, easing toward where the moment wants it. */
  private linePoint: { x: number; y: number; z: number } = { x: LINE_HOME.x, y: LINE_HOME.y, z: LINE_HOME.z };
  private familyBox: Object3D | null = null;
  /** Where he turns to look while he talks of it (Nora's window, or the morning's place), and his yaw now. */
  private tessaWindow = new Vector3();
  /** Nora's house on the little model of the square, where he points in the first week. */
  private modelHouse = new Vector3();
  private yaw = REST_YAW;
  /** His head and hammer arm, what he looks at, and what the arm is doing. */
  private head: Object3D | null = null;
  private arm: Object3D | null = null;
  private place = new Vector3();
  private pointing = false;
  /** Dev build: whether he was pointing last frame, so each change is logged once. */
  private pointedLast = false;
  private lookAt = new Vector3();
  private local = new Vector3();
  private hand = new Vector3();
  private hammer = new Vector3();
  private headYaw = 0;
  private headPitch = 0;
  private armX = 0;
  private armZ = 0;
  /** Seconds into a tap on the sill (-1: none), and whether this stillness has had its tap. */
  private tapping = -1;
  private tapped = false;
  /** Seconds left of a raised hand waiting for the Keeper's. */
  private highFive = 0;
  /** The morning's reveal: lines held back, and how long until they are said. */
  private held: string[] = [];
  /** The reveal's first line, from the chime until it is up (Lina's greeting waits for it). */
  private revealLine = '';
  private revealHold = 0;
  private hushed = false;
  /** A stand-in for the line at its usual place, from which the question panel is laid out. */
  private askHome = new Object3D();
  /**
   * Where the question panel is laid out from, worked out each frame with his line's place: over the Sunday arrows
   * while they wait (his line is up there too), beside him otherwise (over the basket too: the panel stays clear of it).
   */
  private askFrom: Place = LINE_HOME;
  private notches: Object3D[] = [];
  private line: Object3D | null = null;
  private lineTexture: CanvasTexture | null = null;
  private text = '';
  /** The last line he said, and whether a poke has brought it back since. */
  private lastSaid = '';
  private repeated = false;
  /** Whether the last line was a phase's instruction (a cue), which a later phase makes stale. */
  private lastCue = false;
  /** The step whose instruction was the last line said ('' if it was a story line): once that step ends, a poke opens the questions. */
  private lastStep: Step | '' = '';
  /** Seconds the line up has left (an instruction that persists has no end), and how long it has been up. */
  private lineTimer = 0;
  private shownFor = 0;
  /** What is up on his panel (line-queue.ts), and the step whose instruction it is. */
  private up: Up = 'none';
  private upStep: Step | '' = '';
  /** The step whose instruction has been read already this time round ('' if none): from the second week it is said once. */
  private toldStep: Step | '' = '';
  /** What the step and the panel are worked out from, filled each frame (no allocation in update()). */
  private stepFacts: StepFacts = { week: 1, phase: Phase.Shut, open: false, chosen: -1, visited: false, called: false, lamp: false, reply: false, quiet: false };
  private panel: PanelFacts = { up: 'none', upStep: '', shownFor: 0, left: 0, waiting: 0, holding: false, step: '', instruction: '', persist: false, told: false };
  /** Seconds left of the first morning's quiet, and the week whose morning lines wait for it. */
  private hush = 0;
  private hushWeek = 0;
  /**
   * Lines waiting their turn; a cue is an instruction for one phase of the
   * week, dropped once the week moves on; a kept line (last week's answer,
   * from the morning's chime) is never dropped by another line cutting in.
   */
  private lines: Line[] = [];
  /** Whether the line up is a kept one, so it stays kept if the family's box takes it down unread. */
  private lineKeep = false;
  private out = 0;
  private glow = 0;
  private elapsed = 0;
  private lastPhase = '';
  private lastChosen = -1;
  private toccoCall = 0;
  private askPanel: Object3D | null = null;
  private askTexture: CanvasTexture | null = null;
  private askRows: Object3D[] = [];
  /** Seconds the question panel has been open; -1 while closed. */
  private askOpen = -1;
  /** Poked while the family's box was in the window: it went home first, and the poke is answered once it is gone. */
  private pokeAfterBox = false;
  /** Bumped on every question, so a late live line never lands on a newer one. */
  private asked = 0;
  /** The last week was just kept and the season started over; the old notches come off next morning. */
  private seasonOver = false;
  /** What the lamp says once lit, held while the town waits for Lina's answer. */
  private litLine = '';
  /** How far the flame leans toward her window now (0 to 1), about which axis, and which way its middle moves. */
  private lean = 0;
  private leanAxis = new Vector3();
  private leanTurn = new Quaternion();
  /** Where the Sunday arrows stand when they are out; parked far below the town otherwise (pointer rays ignore visibility). */
  private arrowY = 0;
  /** The caption size his line and questions are drawn at (comfort.ts): changed on the start page, they are drawn again. */
  private largeCaptions = false;

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.tocco = find('Tocco');
    this.door = find('ToccoDoor');
    this.arrowUp = find('ArrowUp');
    this.down = find('ArrowDown');
    this.arrowY = this.arrowUp?.position.y ?? 0;
    this.lamp = find('SundayLamp') as Mesh | null;
    this.glass = find('SundayLampGlass') as Mesh | null;
    this.flame = find('SundayLampFlame');
    this.match = find('Match') as Mesh | null;
    this.matchFlameMesh = find('MatchFlame');
    this.halo = find('SundayLampHalo') as Mesh | null;
    this.line = find('ToccoLine');
    this.familyBox = find('FamilyBox');
    this.head = find('ToccoHead');
    this.arm = find('ToccoArm');
    find('TessaWindow')?.getWorldPosition(this.tessaWindow);
    // The little house carries its shape in world coordinates: its middle is where its geometry is.
    const house = find('MaquetteHouse');
    if (house != null) new Box3().setFromObject(house).getCenter(this.modelHouse);
    // The flame leans about the level axis square to the way to her window: its tip turns toward it.
    this.glass?.getWorldPosition(this.flameAt);
    this.leanAxis.set(this.tessaWindow.x - this.flameAt.x, 0, this.tessaWindow.z - this.flameAt.z).normalize();
    this.leanAxis.set(this.leanAxis.z, 0, -this.leanAxis.x);
    this.lineTexture = ((this.line as Mesh | null)?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | null;
    this.askPanel = find('AskPanel');
    this.askTexture = ((this.askPanel as Mesh | null)?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | null;
    for (let i = 0; i < ASK_ROWS; i += 1) {
      const row = find(`AskRow${i}`);
      if (row != null) this.askRows.push(row);
    }
    this.largeCaptions = largerCaptions();
    if (this.askTexture != null) drawAsk(this.askTexture, QUESTIONS, this.largeCaptions);
    this.placeAsk(false);
    for (let row = 0; row < 2; row += 1) {
      for (let k = 0; k < NOTCHES; k += 1) {
        const notch = find(`Notch${row}${k}`);
        if (notch != null) this.notches.push(notch);
      }
    }
    // Last week's calls are carved only once they are settled aloud, on the next morning.
    this.carve(unsettled() ? townBefore() : currentTown());
    this.say('');
    // Open on the week after the last one kept.
    for (const week of this.queries.week.entities) week.setValue(Week, 'week', currentTown().week);

    this.cleanupFuncs.push(
      // Poke him and his last line comes back; poke again and his three questions show; poke one to ask it.
      onSignal('tocco', () => this.poke()),
      onSignal('ask0', () => this.ask(0)),
      onSignal('ask1', () => this.ask(1)),
      onSignal('ask2', () => this.ask(2)),
      onSignal('up', () => this.call(1)),
      onSignal('down', () => this.call(0)),
      onSignal('lamp', () => this.lightLamp()),
      // A match drawn across the box lights it too, with a moment's flame at its head.
      onSignal('strike', () => {
        if (this.lightLamp()) this.matchFlame = MATCH_FLAME_SECONDS;
      }),

      onSignal('kept', () => this.keep()),
      // Lina answered the lamp: what the lamp had to say, held meanwhile, follows.
      onSignal('answered', () => {
        if (this.litLine !== '') this.cue(this.litLine);
        this.litLine = '';
      }),
      // Through the spyglass, the Keeper found where the week's prices show in the street.
      onSignal('spotted', () => {
        const real = realWeek();
        if (real != null) this.say(spottedLine(real.kind));
      }),
      // The last night's windows are all on: what the season earned, then the shutters.
      onSignal('lit', () => {
        for (const line of festivalLines(festivalShare())) this.cue(line);
        this.cue(WEEK.seasonClose);
      }),
      // The latch was pulled while the basket is out: the shutters stay open.
      onSignal('busy', () => this.interrupt(WEEK.busy)),
      // The latch, tried in the first week before the lamp is lit: the shutters stay open and the lamp comes first.
      onSignal('unlit', () => this.interrupt(instructionLine('lamp', this.weekNumber(), SEASON_WEEKS))),
      onSignal('hurry', () => this.interrupt(WINDOWS_FIRST)),
      onSignal('refused', () => this.interrupt(lastRefusal() === 'built' ? REFUSED_BUILT : REFUSED_COINS)),
      onSignal('restart', () => this.restart()),
    );
  }

  /**
   * The season starts over from the start page: he is back inside his door
   * with nothing to say and nothing waiting (no queued or held lines, no
   * hush or reveal, no live line still on its way), the first week's lever
   * line still to come, the jamb bare of the old season's notches, the lamp
   * dark and upright, and his first morning will be quiet for its 6 s and
   * then his welcome, as on a first visit.
   */
  restart(): void {
    if (import.meta.env.DEV) {
      const notches = this.notches.filter((notch) => notch.visible).length;
      const held = this.held.length + (this.revealHold > 0 ? ' (reveal held)' : '') + (this.hush > 0 ? ' (first morning hush)' : '');
      console.info(`[tocco] restart: ${this.lines.length} lines waiting and ${held} held dropped, ${this.up === 'instruction' ? `the ${this.upStep} instruction up` : `a ${this.up} line up`}, season over ${this.seasonOver}, ${notches} notches on the jamb`);
    }
    this.outcomeSaid = false;
    this.seasonOver = false;
    this.hush = 0;
    this.hushWeek = 0;
    this.revealHold = 0;
    this.hushed = false;
    this.revealLine = '';
    this.held.length = 0;
    this.highFive = 0;
    this.tapping = -1;
    this.tapped = false;
    this.litLine = '';
    this.pokeAfterBox = false;
    this.toccoCall = 0;
    // A live answer still on its way lands on nothing.
    this.asked += 1;
    this.lines.length = 0;
    this.show('');
    this.lastSaid = '';
    this.lastCue = false;
    this.lastStep = '';
    this.toldStep = '';
    this.repeated = false;
    this.placeAsk(false);
    // The week is shut: its phase is already seen, so nothing of the old week's phases runs again.
    this.lastPhase = Phase.Shut;
    this.lastChosen = -1;
    this.askFrom = LINE_HOME;
    this.carve(currentTown());
    // In his door at once, facing the seat at rest, his line at home and hidden.
    this.out = 0;
    this.tocco?.position.set(TOCCO_IN.x, TOCCO_OUT.y, this.tocco.position.z);
    this.door?.rotation.set(this.door.rotation.x, 0, this.door.rotation.z);
    this.yaw = REST_YAW;
    if (this.tocco != null) this.tocco.rotation.y = REST_YAW;
    this.pointing = false;
    this.headYaw = 0;
    this.headPitch = 0;
    this.head?.rotation.set(0, 0, 0, 'YXZ');
    this.armX = 0;
    this.armZ = 0;
    this.arm?.rotation.set(0, 0, 0);
    this.linePoint.x = LINE_HOME.x;
    this.linePoint.y = LINE_HOME.y;
    this.linePoint.z = LINE_HOME.z;
    if (this.line != null) {
      faceSeat(this.line, LINE_HOME);
      this.line.visible = false;
    }
    // The lamp dark, its flame upright, the room's lamplight off; no match burning.
    this.glow = 0;
    setRoomGlow(0, this.flameAt);
    this.lean = 0;
    if (this.flame != null) {
      this.flame.visible = false;
      this.flame.quaternion.identity();
      this.flame.position.set(0, LAMP_FLAME_Y, 0);
    }
    if (this.halo != null) this.halo.visible = false;
    this.matchFlame = 0;
    setLinesWaiting(false);
    setLineFresh(false);
    setCardLineShowing(false);
    setInstructionShowing('');
    setRevealHeld(false);
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    if (week == null) return;
    // Larger captions turned on or off on the start page: his questions and the line up are drawn at the new size.
    if (largerCaptions() !== this.largeCaptions) {
      this.largeCaptions = largerCaptions();
      if (this.askTexture != null) drawAsk(this.askTexture, QUESTIONS, this.largeCaptions);
      if (this.lineTexture != null) drawLine(this.lineTexture, this.up !== 'none' ? this.text : '');
    }
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    if (phase !== this.lastPhase) {
      if (import.meta.env.DEV) console.info('[tocco] phase', phase, 'week', week.getValue(Week, 'week'));
      // An instruction still waiting from an earlier phase no longer fits, nor do open questions.
      this.lines = this.lines.filter((line) => !line.cue);
      // Nor does bringing one back: a poke now opens the questions instead.
      if (this.lastCue) this.repeated = true;
      this.placeAsk(false);
      this.onPhase(week, phase, this.lastPhase);
      this.lastPhase = phase;
    }
    // Who it is for and what it costs; what to do next is the lever's own step.
    if (phase === Phase.Choosing && chosen !== this.lastChosen && chosen >= 0) this.cue(choiceLine(chosen));
    this.lastChosen = chosen;
    this.sayOutcome(week, phase, chosen);

    // The first morning's quiet runs only while the Keeper is at the open window.
    if (this.hush > 0) {
      if (phase !== Phase.Morning) this.hush = 0;
      else if (open && stance() === 'seat') {
        this.hush -= delta;
        if (this.hush <= 0) this.morning(this.hushWeek);
      }
    }
    // Out with the shutters open, in once they close and he has had his say (still out while the family's box flies
    // home with his closing line waiting for it).
    const quiet = this.quiet();
    const wantOut =
      (open && !quiet && this.hush <= 0) ||
      (this.up !== 'none' && phase === Phase.Shut) ||
      (phase === Phase.Shut && this.boxIn() && this.lines.length > 0);
    this.out += ((wantOut ? 1 : 0) - this.out) * Math.min(1, delta / (RIDE_SECONDS / 4));
    if (this.tocco != null) {
      this.tocco.position.x = TOCCO_IN.x + (TOCCO_OUT.x - TOCCO_IN.x) * this.out;
      // He bobs as he says a line, not for as long as an instruction stays up.
      this.tocco.position.y = TOCCO_OUT.y + (this.up !== 'none' && this.shownFor < LINE_SECONDS ? 0.004 * Math.abs(Math.sin(this.elapsed * 9)) : 0);
    }
    if (this.door != null) this.door.rotation.y = DOOR_OPEN * Math.min(1, this.out * 3);
    this.look(week, phase, delta);
    this.gesture(phase, delta);

    // While the family's box is in the window the family talks: his line goes down (a line not yet read comes back
    // once the box has gone), the questions close, and his lines wait.
    const boxIn = this.boxIn();
    if (boxIn) {
      // (The visit his landed line asks for is under way: its step has ended, so that line goes for good, below.)
      this.holdLine();
      if (this.askOpen >= 0) this.placeAsk(false);
    } else if (this.pokeAfterBox) {
      this.pokeAfterBox = false;
      // The poke is answered by the line the box held back, now (the next poke opens his questions); with none, as
      // any poke is. Not if the lamp was lit while the box flew home: the town waits for Lina's answer, and he keeps
      // still, as for any poke then.
      if (!replyWaiting()) {
        const line = this.lines.shift();
        if (line != null) {
          this.showLine(line);
          this.repeated = true;
        } else {
          this.poke();
        }
      }
    }
    this.updatePanel(week, phase, open, chosen, delta);
    setCardLineShowing(this.out > 0.9 && this.up === 'story' && this.text === FIRST_WEEK.card);
    // Over the basket while choosing; above the arrows while they wait on Sunday (from the second week); beside him
    // otherwise. His questions open over the arrows with it, beside him otherwise.
    const arrows = phase === Phase.Sunday && callsOpen(week.getValue(Week, 'week') ?? 1, quiet) && (week.getValue(Week, 'forecast') ?? -1) < 0;
    if (this.line != null) {
      this.line.visible = this.out > 0.9 && this.up !== 'none';
      this.moveLine(phase === Phase.Choosing ? LINE_AT_BASKET : arrows ? LINE_SUNDAY : LINE_HOME, delta);
    }
    const askFrom = arrows ? LINE_SUNDAY : LINE_HOME;
    if (askFrom !== this.askFrom) {
      this.askFrom = askFrom;
      if (this.askOpen >= 0) this.layoutAsk(true);
    }
    if (this.askOpen >= 0) {
      this.askOpen += delta;
      if (this.askOpen > ASK_SECONDS || this.out < 0.9) this.placeAsk(false);
    }
    // The held reveal: hush the square, then a chime and the lines (they go ahead of whatever is queued).
    if (this.revealHold > 0 && open) {
      this.revealHold -= delta;
      if (!this.hushed && this.revealHold < REVEAL_SECONDS - HUSH_AT) {
        this.hushed = true;
        if (import.meta.env.DEV) console.info('[tocco] hush');
        emitSignal('hush');
      }
      if (this.revealHold <= 0) {
        if (import.meta.env.DEV) console.info('[tocco] chime');
        emitSignal('chime');
        const rest = this.lines.splice(0);
        this.revealLine = this.held[0] ?? '';
        // Kept: a question asked meanwhile cuts in ahead of them, never drops them, so Lina's greeting still follows.
        for (const line of this.held) this.say(line, false, true);
        for (const line of rest) this.lines.push(line);
        this.held.length = 0;
      }
    }
    if (this.revealLine !== '' && (this.text === this.revealLine || phase !== Phase.Morning)) this.revealLine = '';
    setRevealHeld(this.revealHold > 0 || this.revealLine !== '');
    // The hush and the held reveal only count down while the shutters are open; closed, they must not hold the ghost hand
    // back. Lines the family's box holds back count too: the morning bell waits for them (the ghost hand does not).
    setLinesWaiting(this.lines.length > 0 || ((this.hush > 0 || this.held.length > 0) && open));
    // The ghost hand waits until a new line has been up long enough to read (HintSystem); in the first week it comes
    // with the instruction it shows, not after it.
    setLineFresh(this.shownFor < MIN_SECONDS && (this.up === 'story' || (this.up === 'instruction' && !this.panel.persist)));

    // No calls in the first week or a solidarity week: the arrows stay down, out of reach of a pointing ray.
    const n = week.getValue(Week, 'week') ?? 1;
    const calls = callsOpen(n, quiet);
    const sunday = phase === Phase.Sunday && !quiet;
    const arrowsOut = sunday && calls;
    // The first week's lamp invites at once, as if the call were made.
    const called = !calls || (week.getValue(Week, 'forecast') ?? -1) >= 0;
    this.standArrow(this.arrowUp, arrowsOut);
    this.standArrow(this.down, arrowsOut);
    const lit = week.getValue(Week, 'lamp') ?? false;
    const glowTarget = lit ? 1 : 0;
    if (this.glow !== glowTarget) {
      this.glow += (glowTarget - this.glow) * Math.min(1, delta * 2);
      if (Math.abs(glowTarget - this.glow) < 0.002) this.glow = glowTarget;
      this.glass?.getWorldPosition(this.flameAt);
      this.flameAt.y += LAMP_FLAME_Y;
      setRoomGlow(this.glow, this.flameAt);
    }
    // The flame flickers a little; its glow faces the Keeper.
    if (this.flame != null) {
      this.flame.visible = this.glow > 0.01;
      if (this.flame.visible) this.flame.scale.setScalar(this.glow * (0.92 + 0.08 * Math.sin(this.elapsed * 13) * Math.sin(this.elapsed * 7.3)));
      // While Lina's window calls, the flame leans toward it, for a Keeper without sound; upright again once she answers.
      const leanTarget = replyCalling() ? 1 : 0;
      if (this.lean !== leanTarget) {
        this.lean += (leanTarget - this.lean) * Math.min(1, delta * 3);
        if (Math.abs(leanTarget - this.lean) < 0.002) {
          this.lean = leanTarget;
          if (import.meta.env.DEV) {
            console.info(`[tocco] flame ${leanTarget === 1 ? `leans ${((LEAN * 180) / Math.PI).toFixed(0)} degrees toward the family's window` : 'stands upright again'}`);
          }
        }
        this.flame.quaternion.copy(this.leanTurn.setFromAxisAngle(this.leanAxis, LEAN * this.lean));
        // Its middle drifts the same way (the axis turned back a quarter is the way to the window).
        this.flame.position.set(-this.leanAxis.z * LEAN_SHIFT * this.lean, LAMP_FLAME_Y, this.leanAxis.x * LEAN_SHIFT * this.lean);
      }
    }
    if (this.halo != null) {
      this.halo.visible = this.glow > 0.01;
      if (this.halo.visible) {
        (this.halo.material as MeshBasicMaterial).opacity = 0.55 * this.glow;
        this.world.camera.getWorldQuaternion(this.halo.quaternion);
        // 7 cm from the flame toward the eye (the glass is unrotated, so world offsets are local), scaled so it
        // looks the same size: the right jamb no longer cuts its edge.
        this.player.head.getWorldPosition(this.toEye);
        this.glass?.getWorldPosition(this.flameAt);
        this.flameAt.y += LAMP_FLAME_Y;
        this.toEye.sub(this.flameAt);
        const dist = Math.max(0.2, this.toEye.length());
        this.toEye.multiplyScalar(HALO_LEAD / dist);
        this.halo.position.set(this.toEye.x, LAMP_FLAME_Y + this.toEye.y, this.toEye.z);
        this.halo.scale.setScalar((dist - HALO_LEAD) / dist);
      }
    }
    const glass = this.glass?.material as MeshBasicMaterial | undefined;
    if (glass != null) {
      // A bare flame in the first two weeks: the lamp has no globe yet (its flame and glow are the glass's children,
      // so only the globe's material hides).
      glass.visible = n >= 3;
      glass.color.setRGB(0.6 + 0.4 * this.glow, 0.64 + 0.2 * this.glow, 0.66 - 0.2 * this.glow);
      glass.opacity = 0.35 + 0.55 * this.glow;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2);
    shine(this.arrowUp as Mesh | null, arrowsOut && !called ? pulse : 0);
    shine(this.down as Mesh | null, arrowsOut && !called ? pulse : 0);
    shine(this.lamp, sunday && called && !lit ? pulse : 0);
    // The match invites the same moment as the lamp; once struck it burns a moment at its head.
    shine(this.match, sunday && called && !lit ? pulse : 0);
    if (this.matchFlame > 0) this.matchFlame -= delta;
    if (this.matchFlameMesh != null) this.matchFlameMesh.visible = this.matchFlame > 0;
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  private weekNumber(): number {
    return this.weekEntity()?.getValue(Week, 'week') ?? 1;
  }

  /**
   * His panel this frame (line-queue.ts): the step the week is in, worked
   * out from the Week entity, and its instruction; the line up runs its
   * time; then the next story line, the step's instruction, or nothing.
   */
  private updatePanel(week: Entity, phase: string, open: boolean, chosen: number, delta: number): void {
    const n = week.getValue(Week, 'week') ?? 1;
    const quiet = this.quiet();
    const f = this.stepFacts;
    f.week = n;
    f.phase = phase;
    f.open = open;
    f.chosen = chosen;
    f.visited = familyVisited();
    f.called = !callsOpen(n, quiet) || (week.getValue(Week, 'forecast') ?? -1) >= 0;
    f.lamp = week.getValue(Week, 'lamp') ?? false;
    f.reply = replyWaiting();
    f.quiet = quiet;
    const step = stepOf(f);
    // He says an instruction only once he is out to say it.
    const instruction = step !== '' && this.out > 0.9 ? instructionLine(step, n, SEASON_WEEKS) : '';
    // A poke brings back the last instruction only while its step lasts; after, it opens his questions.
    if (this.lastStep !== '' && this.lastStep !== step) {
      this.lastStep = '';
      this.repeated = true;
    }
    if (this.toldStep !== '' && this.toldStep !== step) this.toldStep = '';
    if (this.up !== 'none') {
      this.lineTimer -= delta;
      this.shownFor += delta;
      if (this.up === 'instruction' && this.upStep === step && (this.shownFor >= MIN_SECONDS || this.lineTimer <= 0)) this.toldStep = step;
    }
    const p = this.panel;
    p.up = this.up;
    p.upStep = this.upStep;
    p.shownFor = this.shownFor;
    p.left = this.lineTimer;
    p.waiting = this.lines.length;
    p.holding = this.holding();
    p.step = step;
    p.instruction = instruction;
    p.persist = n === 1;
    p.told = this.toldStep !== '' && this.toldStep === step;
    switch (panelMove(p)) {
      case 'story': {
        const line = this.lines.shift();
        if (line != null) this.showLine(line);
        break;
      }
      case 'instruction':
        if (step !== '') this.showInstruction(step, instruction, p.persist);
        break;
      case 'clear':
        if (import.meta.env.DEV && this.up === 'instruction') console.info(`[tocco] the ${this.upStep} instruction goes${this.upStep !== step ? ', its step done' : ''}`);
        this.show('');
        break;
      default:
        break;
    }
    setInstructionShowing(this.up === 'instruction' ? this.upStep : '');
  }

  /** A Sunday arrow out on the sill, or hidden and parked far below the town, out of a pointing ray's way. */
  private standArrow(arrow: Object3D | null, out: boolean): void {
    if (arrow == null) return;
    arrow.visible = out;
    arrow.position.y = out ? this.arrowY : this.arrowY - PARKED;
  }

  /** A solidarity week: Tocco says nothing all week, and makes no call. */
  private quiet(): boolean {
    const week = this.weekEntity();
    return week != null && solidarityOf(week.getValue(Week, 'week') ?? 1) != null;
  }

  private onPhase(week: Entity, phase: string, previous: string): void {
    const n = week.getValue(Week, 'week') ?? 1;
    switch (phase) {
      case Phase.Morning:
        if (previous !== Phase.Shut) break;
        // Only a quiet first morning: lines still waiting (the season just kept) are said first, with him out.
        if (n === 1 && !this.quiet() && this.up !== 'story' && this.lines.length === 0) {
          this.hush = HUSH_SECONDS;
          this.hushWeek = n;
        } else {
          this.morning(n);
        }
        break;
      case Phase.Rising: {
        // The first week's card comes up with the basket: what it means, said rather than cued, so it is not
        // dropped as the rise ends.
        const line = phaseLine(phase, n);
        if (line !== '') this.say(line);
        break;
      }
      case Phase.Lowering: {
        // The basket going down; the instructions of the bell, the choice, the lever and the landing are their steps'.
        const line = phaseLine(phase, n);
        if (line !== '') this.cue(line);
        break;
      }
      case Phase.Sunday: {
        // The first week has no call (calls start in the second): straight to the lamp, its step's instruction.
        if (!callsOpen(n, this.quiet())) {
          this.toccoCall = -1;
          break;
        }
        const real = realWeek(n);
        // His own call, from the trend; in the same line, so it is heard even if the Keeper is quick.
        this.toccoCall = real == null ? 0 : toccoCall(real);
        if (real != null) this.cue(sundayLine(real, this.toccoCall));
        break;
      }
      default:
        break;
    }
  }

  /**
   * The morning: last Sunday's calls settled against what really came next
   * (once, the first morning after the week was kept), what changed in the
   * town overnight, and what the view shows this week.
   */
  private morning(n: number): void {
    const town = currentTown();
    const real = realWeek(n);
    if (this.seasonOver) {
      this.seasonOver = false;
      this.carve(town);
    }
    // Calls since the last settling are settled aloud on a morning Tocco speaks: never in a solidarity week, so a
    // call made the week before one is settled the week after it.
    if (unsettled() && !this.quiet()) {
      // Last week's answer waits a breath: the square hushes, a soft chime, then the line (META_VR_DINAMIKLER.md item 6).
      // A week with no call to settle (the first) is marked settled without any of it.
      const calls = unsettledCalls();
      if (import.meta.env.DEV) console.info('[tocco] settles', calls.length, calls.length === 1 ? 'call' : 'calls', shouldHush(calls) ? 'after a hush and a chime' : 'quietly');
      if (shouldHush(calls)) {
        this.revealHold = REVEAL_SECONDS;
        this.hushed = false;
      }
      calls.forEach(({ week: k, kept }) => {
        const last = realWeek(k);
        if (last == null) return;
        const went = actual(last);
        this.held.push(settledLine(last, went, false));
        this.held.push(notchLine(kept.call === went, kept.tocco === went, kept.call >= 0));
        // The Keeper called it: he holds up his hand for theirs.
        if (kept.call >= 0 && kept.call === went) this.highFive = HIGH_FIVE_SECONDS;
      });
      const before = townBefore();
      markSettled();
      this.carve(town);
      this.newStages(before, town);
    }
    if (real == null) return;
    // The first week's morning: on the very first, who the Keeper is, and nothing more. The week's news comes
    // with the card (Phase.Rising).
    if (n === 1) {
      if (townBefore().week <= 1 && !this.quiet()) for (const line of INTRO) this.say(line);
      return;
    }
    this.say(morningLine(real));
    // The spyglass came to the sill this morning.
    if (n === 2 && !this.quiet()) this.say(SPYGLASS_LINE);
    const weather = weatherOf(n);
    if (weather != null) for (const line of weatherLines(weather, real)) this.say(line);
    if (firstLag()) this.say(LAG_LINE);
    if (real.tier >= 2 && town.builds[real.kind] === WORKING) this.say(memoryLine(real.kind, n - town.builtIn[real.kind]));
  }

  /** A build that went up, or started working, overnight. */
  private newStages(before: Town, after: Town): void {
    for (const kind of ['fuel', 'power', 'food'] as const satisfies readonly Kind[]) {
      if (after.builds[kind] !== before.builds[kind] && after.builds[kind] > 0) this.say(stageLine(kind, after.builds[kind] === WORKING));
    }
  }

  private call(direction: number): void {
    const week = this.weekEntity();
    if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday || !callsOpen(week.getValue(Week, 'week') ?? 1, this.quiet())) return;
    week.setValue(Week, 'forecast', direction);
    // The lamp's instruction follows as its step's.
    this.cue(calledLine(direction));
  }

  /** The shutters closed on Sunday: the week is kept with its choice and calls, settled next morning. */
  private keep(): void {
    const week = this.weekEntity();
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const quiet = this.quiet();
    keepWeek(keptEntry(n, quiet, week.getValue(Week, 'chosen') ?? -1, week.getValue(Week, 'forecast') ?? -1, this.toccoCall));
    week.setValue(Week, 'forecast', -1);
    this.interrupt(weekDoneLine(n, SEASON_WEEKS));
    // After the first week, what the season is for.
    if (n === 1) this.say(goalLine(SEASON_WEEKS));
    if (currentTown().week > SEASON_WEEKS) {
      // No morning follows the last week in this season: its calls are settled now, and the season starts over.
      const last = realWeek(n);
      const done = lastKept();
      if (last != null && done != null) {
        const went = actual(last);
        this.say(settledLine(last, went, false));
        this.say(notchLine(done.call === went, done.tocco === went, done.call >= 0));
      }
      markSettled();
      this.carve(currentTown());
      this.say(SEASON_OVER);
      restartSeason();
      // The season's notches stay on the jamb until the next morning.
      this.seasonOver = true;
    }
  }

  /**
   * A poke on him: the first brings back his last line for a few seconds (a
   * line missed, or read too fast); the next opens his three questions;
   * another closes them. A new line starts this over.
   */
  private poke(): void {
    if (this.askOpen >= 0) {
      this.placeAsk(false);
      return;
    }
    // While the town waits for Lina's answer, he keeps still.
    if (this.quiet() || this.out < 0.9 || replyWaiting()) return;
    // The family's box is in the window: it goes home first, then the poke is answered (update).
    if (this.boxIn()) {
      if (!this.pokeAfterBox) emitSignal('window');
      this.pokeAfterBox = true;
      return;
    }
    if (this.lastSaid !== '' && !this.repeated) {
      this.repeated = true;
      // Still up: it stays at least as long; gone: it comes back.
      if (this.up !== 'none' && this.text === this.lastSaid) this.lineTimer = Math.max(this.lineTimer, REPEAT_SECONDS);
      else this.show(this.lastSaid, REPEAT_SECONDS, true);
      return;
    }
    this.placeAsk(true);
  }

  /** His answer from the season's model, now; a live sentence after it if one comes back in time. */
  private ask(q: number): void {
    const week = this.weekEntity();
    if (week == null || this.askOpen < 0) return;
    this.placeAsk(false);
    const n = week.getValue(Week, 'week') ?? 1;
    const real = realWeek(n);
    if (real == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const settled = phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday;
    this.interrupt(answer(q, real, currentTown(), chosen, settled));
    const asked = ++this.asked;
    void liveLine(q, chosen).then((line) => {
      if (line != null && asked === this.asked && !this.quiet()) this.say(line);
    });
  }

  /** Opens the question panel over his line, or parks its rows far below the town (pointer rays ignore visibility). */
  private placeAsk(open: boolean): void {
    this.askOpen = open ? 0 : -1;
    this.layoutAsk(open);
  }

  /** Just over where his line hangs: above the Sunday arrows while they wait, beside him otherwise. */
  private layoutAsk(open: boolean): void {
    // Dev build: the questions never open over the family's box (tests/family-box.test.mjs leaves them out for that).
    if (import.meta.env.DEV && open && this.boxIn()) console.warn("[tocco] his questions open while the family's box is in the window");
    const panel = this.askPanel;
    const line = this.line;
    if (panel == null || line == null) return;
    panel.visible = open;
    const home = this.askHome;
    faceSeat(home, this.askFrom);
    const lift = ASK_LIFT;
    panel.quaternion.copy(home.quaternion);
    panel.position.set(0, lift, 0).applyQuaternion(home.quaternion).add(home.position);
    this.askRows.forEach((row, i) => {
      row.quaternion.copy(home.quaternion);
      row.position.set(0, lift + (1 - i) * (ASK_SIZE.h / ASK_ROWS), 0).applyQuaternion(home.quaternion).add(home.position);
      if (!open) row.position.y -= PARKED;
    });
  }

  /** Queues a line; it shows once the one before has been up long enough. An empty line clears them all. */
  private say(text: string, cue = false, keep = false): void {
    if (text !== '' && this.quiet()) return;
    if (text === '') {
      this.lines.length = 0;
      this.show('');
      return;
    }
    // Behind whatever is up or waiting its turn (lines held through Lina's answer come out first); an instruction up
    // gives way once it has been read (line-queue.ts).
    if (this.up !== 'none' || this.holding() || this.lines.length > 0) this.lines.push({ text, cue, keep });
    else this.show(text, LINE_SECONDS, false, cue, keep);
  }

  /** Puts up a line that waited its turn. */
  private showLine(line: Line): void {
    this.show(line.text, LINE_SECONDS, false, line.cue, line.keep);
  }

  /** An instruction for the phase the week is in; dropped if it is still waiting when the week moves on. */
  private cue(text: string): void {
    this.say(text, true);
  }

  /** Takes a waiting line out of the queue, when the moment for it has passed. */
  private drop(text: string): void {
    for (let i = 0; i < this.lines.length; i += 1) {
      if (this.lines[i].text !== text) continue;
      this.lines.splice(i, 1);
      return;
    }
  }

  /**
   * Says a line now, dropping any still waiting but the kept ones (they
   * follow it, a kept one it takes down unread first): the rest no longer
   * fit the moment. While his lines are held
   * it waits too: first in line if only the family's box holds them (it
   * comes as the box leaves), behind the rest while the town waits for
   * Lina's answer.
   */
  private interrupt(text: string): void {
    if (this.quiet()) return;
    if (replyWaiting()) {
      this.say(text);
      return;
    }
    let kept = 0;
    for (const line of this.lines) if (line.keep) this.lines[kept++] = line;
    this.lines.length = kept;
    if (this.boxIn()) {
      this.lines.unshift({ text, cue: false, keep: false });
      return;
    }
    // A kept line up but not yet read follows it, ahead of the other kept ones (one already read only goes down).
    if (this.lineKeep) this.holdLine();
    this.show(text);
  }

  /**
   * While he talks of a place he turns toward it (META_VR_FIKIR.md §10): the
   * morning's place as he gives the morning's news, Nora's window as he
   * sends the Keeper to it. Never further than a quarter turn or so, so he
   * still half faces the Keeper.
   */
  private look(week: Entity, phase: string, delta: number): void {
    if (this.tocco == null) return;
    this.pointing = false;
    let target = REST_YAW;
    // A raised hand waiting for the Keeper's: he faces them, and points at nothing.
    if (this.up !== 'none' && this.out > 0.9 && this.highFive <= 0) {
      const n = week.getValue(Week, 'week') ?? 1;
      let x = Number.NaN;
      let y = PLAZA_Y;
      let z = Number.NaN;
      if (this.text === FIRST_WEEK.card) {
        // The first week's card line: the empty kerb (it glows again meanwhile, FocusSystem).
        const kerb = FOCUS.fuel;
        if (kerb != null) {
          x = kerb.x;
          z = kerb.z;
        }
      } else if (phase === Phase.Morning && n > 1) {
        // The first week's morning is only his welcome: he looks at the Keeper as he says it.
        const real = realWeek(n);
        const place = real != null ? FOCUS[real.kind] : undefined;
        if (place != null) {
          x = place.x;
          z = place.z;
        }
      } else if (phase === Phase.Landed && !(this.familyBox?.visible ?? false) && this.text !== '' && this.text === instructionLine(n === 1 ? 'model' : 'visit', n, SEASON_WEEKS)) {
        // Only while his line sends the Keeper there: not for an answer, a live line or the spyglass's. In the first
        // week, Nora's house on the little model; later, her window across the square.
        const at = n === 1 ? this.modelHouse : this.tessaWindow;
        x = at.x;
        y = at.y;
        z = at.z;
      } else if (phase === Phase.Choosing && this.text === choiceLine(HELP)) {
        // "For Nora's family, over there": her window.
        x = this.tessaWindow.x;
        y = this.tessaWindow.y;
        z = this.tessaWindow.z;
      }
      if (!Number.isNaN(x)) {
        this.pointing = true;
        this.place.set(x, y, z);
        let turn = Math.atan2(x - TOCCO_OUT.x, z - TOCCO_OUT.z) - REST_YAW;
        turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
        target = REST_YAW + Math.max(-LOOK_TURN, Math.min(LOOK_TURN, turn));
      }
    }
    if (import.meta.env.DEV && this.pointing !== this.pointedLast) {
      this.pointedLast = this.pointing;
      console.info('[tocco] points', this.pointing ? `at ${this.place.x.toFixed(1)} ${this.place.y.toFixed(1)} ${this.place.z.toFixed(1)}` : 'at nothing');
    }
    if (Math.abs(target - this.yaw) < 0.001) return;
    this.yaw += (target - this.yaw) * Math.min(1, delta * 4);
    this.tocco.rotation.y = this.yaw;
  }

  /**
   * His head and hammer arm (META_VR_DINAMIKLER.md item 11): he looks at
   * what he talks of, at the Keeper's hand when it comes near, otherwise at
   * the Keeper; points with the hammer at the place he names; taps the sill
   * twice when the Keeper has done nothing for a while; and after a good
   * call holds up his hand, and a touch of the Keeper's hand meets it.
   * Quiet in a solidarity week, like the rest of him.
   */
  private gesture(phase: string, delta: number): void {
    const tocco = this.tocco;
    if (tocco == null || this.head == null || this.arm == null) return;
    const quiet = this.quiet();
    const out = this.out > 0.9 && !quiet;
    // What he looks at.
    this.world.camera.getWorldPosition(this.lookAt);
    if (this.pointing) this.lookAt.copy(this.place);
    else if (out && this.nearestHand(tocco) < WATCH_HAND) this.lookAt.copy(this.hand);
    this.local.copy(this.lookAt);
    tocco.worldToLocal(this.local);
    const dx = this.local.x - TOCCO_NECK.x;
    const dy = this.local.y - TOCCO_NECK.y;
    const dz = this.local.z - TOCCO_NECK.z;
    const yaw = Math.max(-HEAD_TURN, Math.min(HEAD_TURN, Math.atan2(dx, dz)));
    const pitch = Math.max(-HEAD_TILT, Math.min(HEAD_TILT, -Math.atan2(dy, Math.hypot(dx, dz))));
    const k = Math.min(1, delta * 6);
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
    this.head.rotation.set(this.headPitch, this.headYaw, 0, 'YXZ');

    // A tap on the sill, once per stillness, before the ghost hand shows a gesture again (never before its first
    // showing, which comes sooner than the tap would).
    const still = idleSeconds();
    if (still < 1) this.tapped = false;
    if (out && !this.tapped && this.tapping < 0 && this.highFive <= 0 && this.up !== 'story' && still > TAP_AFTER && hintRepeatsNext() && phase !== Phase.Shut && !this.holding()) {
      this.tapped = true;
      this.tapping = 0;
      if (import.meta.env.DEV) console.info(`[tocco] taps the sill after ${still.toFixed(1)} s still`);
    }
    // The arm: tapping, a raised hand, pointing, or at rest.
    let armX = 0;
    let armZ = 0;
    if (this.tapping >= 0) {
      const before = this.tapping;
      this.tapping += delta;
      const t = this.tapping / TAP_SECONDS;
      // Two strikes: the hammer comes down onto the sill in front of him.
      armX = 0.6 + 0.9 * Math.abs(Math.sin(t * Math.PI * 2));
      for (const hit of [0.25, 0.75]) if (before < hit * TAP_SECONDS && this.tapping >= hit * TAP_SECONDS) emitSignal('tap');
      if (t >= 1) this.tapping = -1;
    } else if (this.highFive > 0 && out) {
      this.highFive -= delta;
      armX = -0.2;
      armZ = -0.9 + 0.08 * Math.sin(this.elapsed * 6);
      // The Keeper's hand meets his.
      this.arm.localToWorld(this.hammer.set(0.018, 0.054, 0.012));
      if (this.nearestHand(null) < HIGH_FIVE_REACH) {
        this.highFive = 0;
        emitSignal('slap');
      }
    } else if (this.pointing) {
      armX = 1.1;
    } else if (out && conducting()) {
      // He shows the beat: the hammer down and up, slow, like a waltz.
      armX = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(this.elapsed * Math.PI * 1.25));
    }
    this.armX += (armX - this.armX) * Math.min(1, delta * (this.tapping >= 0 ? 20 : 6));
    this.armZ += (armZ - this.armZ) * Math.min(1, delta * 6);
    this.arm.rotation.set(this.armX, 0, this.armZ);
  }

  /**
   * The distance from the nearest of the Keeper's hands (index tip, or a
   * controller's grip) to Tocco, or to his raised hammer when `tocco` is
   * null; that hand's position is left in this.hand.
   */
  private nearestHand(tocco: Object3D | null): number {
    const to = this.local;
    if (tocco != null) tocco.getWorldPosition(to);
    else to.copy(this.hammer);
    let best = Infinity;
    for (const side of ['left', 'right'] as const) {
      for (const space of [this.player.indexTipSpaces[side], this.player.gripSpaces[side]]) {
        space.getWorldPosition(this.toEye);
        const d = this.toEye.distanceTo(to);
        if (d < best) {
          best = d;
          this.hand.copy(this.toEye);
        }
      }
    }
    return best;
  }

  /** Lights the Sunday lamp (a poke on it, or a struck match); false if it is not the moment. */
  private lightLamp(): boolean {
    const week = this.weekEntity();
    // A solidarity week has no lamp (RevealSystem puts it away): nothing lights, and no answer comes, not even by light.
    if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday || week.getValue(Week, 'lamp') || this.quiet()) return false;
    week.setValue(Week, 'lamp', true);
    // Lit, the lamp's instruction is past (its step has ended), said again by the latch or not: a poke opens the
    // questions rather than repeating it.
    const n = week.getValue(Week, 'week') ?? 1;
    const lampLine = instructionLine('lamp', n, SEASON_WEEKS);
    this.drop(lampLine);
    if (this.lastSaid === lampLine) this.repeated = true;
    // The last Sunday's lamp lights the season's last night; the first week's says that Lina answered.
    const line = lampLitLine(n, SEASON_WEEKS);
    if (replyHolds(n, SEASON_WEEKS, this.quiet())) {
      // The town waits for Lina's answer first (FamilySystem times it): he says it after, and the lamp's instruction goes.
      setReply(1);
      this.litLine = line;
      // He keeps quiet while the town waits: his line goes down (it comes back after her answer if it was not yet
      // read, unless it was the lamp's own), and the questions close.
      if (this.up === 'instruction' || (this.up === 'story' && this.text === lampLine)) this.show('');
      else this.holdLine();
      this.placeAsk(false);
    } else if (line !== '') {
      this.cue(line);
    }
    return true;
  }

  /** Once a week: what the choice did, on the evening it shows (a build, its next step on the first evening). */
  private sayOutcome(week: Entity, phase: string, chosen: number): void {
    if (phase === Phase.Landed) this.outcomeSaid = false;
    if (this.outcomeSaid || chosen < 0 || (phase !== Phase.Days && phase !== Phase.Sunday)) return;
    const real = realWeek(week.getValue(Week, 'week') ?? 1);
    if (real == null || real.solidarity != null) return;
    const day = week.getValue(Week, 'day') ?? -1;
    const due = chosen === BUILD ? day >= 0 : outcomeShows(real, chosen) && day >= (OUTCOME_DAY[chosen] ?? 7);
    if (!due) return;
    this.outcomeSaid = true;
    // A plain line, not a cue: it carries into Sunday if the Keeper moves the sun on before its turn.
    this.say(outcomeLine(real.kind, chosen, (week.getValue(Week, 'week') ?? 1) === SEASON_WEEKS));
  }

  /** Eases his line toward a place, facing the seat all the way; with less motion (comfort.ts) it is there at once, never sliding while read. */
  private moveLine(target: { x: number; y: number; z: number }, delta: number): void {
    const p = this.linePoint;
    if (this.line == null || (p.x === target.x && p.y === target.y && p.z === target.z)) return;
    const k = lessMotion() ? 1 : Math.min(1, delta * 5);
    p.x += (target.x - p.x) * k;
    p.y += (target.y - p.y) * k;
    p.z += (target.z - p.z) * k;
    if (Math.abs(target.x - p.x) + Math.abs(target.y - p.y) + Math.abs(target.z - p.z) < 0.002) {
      p.x = target.x;
      p.y = target.y;
      p.z = target.z;
    }
    faceSeat(this.line, p);
  }

  /** Puts a line on his panel for `seconds`; `again` when a poke brings back the last one; `cue` for a phase's instruction; `keep` for a kept one. */
  private show(text: string, seconds = LINE_SECONDS, again = false, cue = false, keep = false): void {
    // Dev build: his line never goes up over the family's box (tests/family-box.test.mjs leaves it out for that).
    if (import.meta.env.DEV && text !== '' && this.boxIn()) console.warn(`[tocco] ${JSON.stringify(text)} goes up while the family's box is in the window`);
    // A few wooden clicks as he speaks (SoundSystem): his words stay written.
    if (text !== '') emitSignal('say');
    if (import.meta.env.DEV && text !== '') console.info(again ? '[tocco] repeats' : '[tocco] says', JSON.stringify(text), `for ${seconds} s`);
    if (text !== '' && !again) {
      this.lastSaid = text;
      this.lastCue = cue;
      this.lastStep = '';
      this.repeated = false;
    }
    this.text = text;
    this.up = text === '' ? 'none' : 'story';
    this.upStep = '';
    this.lineKeep = keep;
    this.lineTimer = text === '' ? 0 : seconds;
    this.shownFor = 0;
    if (this.lineTexture != null) drawLine(this.lineTexture, text);
  }

  /** Puts up the instruction of the step the week is in: until the step ends in the first week, for LINE_SECONDS later. */
  private showInstruction(step: Step, text: string, persist: boolean): void {
    if (import.meta.env.DEV && this.boxIn()) console.warn(`[tocco] ${JSON.stringify(text)} goes up while the family's box is in the window`);
    emitSignal('say');
    if (import.meta.env.DEV) console.info(`[tocco] instruction ${step}`, JSON.stringify(text), persist ? 'until its step ends' : `for ${LINE_SECONDS} s`);
    this.lastSaid = text;
    this.lastCue = true;
    this.lastStep = step;
    this.repeated = false;
    this.text = text;
    this.up = 'instruction';
    this.upStep = step;
    this.lineKeep = false;
    this.lineTimer = persist ? Number.POSITIVE_INFINITY : LINE_SECONDS;
    this.shownFor = 0;
    if (this.lineTexture != null) drawLine(this.lineTexture, text);
  }

  /** Whether the family's box is in the Keeper's window (coming, shown or going home). */
  private boxIn(): boolean {
    return this.familyBox?.visible ?? false;
  }

  /** His lines wait: the town waits for Lina's answer, or the family's box is in the window. */
  private holding(): boolean {
    return replyWaiting() || this.boxIn();
  }

  /**
   * Takes the line that is up down. One up for less than MIN_SECONDS is said
   * again first once his lines go on; one already read only goes down (a
   * poke still brings it back), so no line is said twice.
   */
  private holdLine(): void {
    if (this.up === 'none') return;
    // An instruction is not queued: it comes back with its step once his lines go on (line-queue.ts).
    if (this.up === 'instruction') {
      this.show('');
      return;
    }
    const text = this.text;
    const cue = text === this.lastSaid && this.lastCue;
    const keep = this.lineKeep;
    const read = this.shownFor >= MIN_SECONDS;
    this.show('');
    if (!read) this.lines.unshift({ text, cue, keep });
  }

  private carve(town: Town): void {
    this.notches.forEach((notch, index) => {
      const row = Math.floor(index / NOTCHES);
      const k = index % NOTCHES;
      notch.visible = k < (row === 0 ? town.keeperNotches : town.toccoNotches);
    });
  }
}

/** A place his line or questions hang (station/tocco.ts). */
type Place = { readonly x: number; readonly y: number; readonly z: number };

/** A line waiting its turn (ToccoSystem.lines). */
interface Line {
  text: string;
  cue: boolean;
  keep: boolean;
}

function shine(mesh: Mesh | null, amount: number): void {
  const material = mesh?.material as MeshStandardMaterial | undefined;
  if (material?.emissive == null) return;
  material.emissive.setRGB(0.32 * amount, 0.24 * amount, 0.1 * amount);
}
