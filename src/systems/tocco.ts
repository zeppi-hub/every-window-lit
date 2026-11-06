import { Box3, type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { calledLine, choiceLine, KEY_LINE, UNSURE_LINE, DRAWING_LINE, endingLines, FRAME_LINE, GIFT_LINE, GLASS_LINE, ledgerLines, MARK_LINE, QUIET_LINE, SAME_MARK, TOWN_NOTE, weekMorningLine, YEAR_END, SPYGLASS_LINE, spottedLine, WINDOWS_FIRST, FIRST_WEEK, goalLine, hardWeekLine, INTRO, HELP as HELP_LINES, instructionLine, jarLine, LAG_LINE, lampLitLine, NOT_YET, pullLine, REFUSED_EMPTY, outcomeLine, memoryLine, morningLine, notchLine, phaseLine, REFUSED_BUILT, REFUSED_COINS, SEASON_OVER, settledLine, stageLine, sundayLine, TAP_ME, WEEK, weatherLines, weekDoneLine } from '../season/lines.js';
import { heldLine, LARGE_MIN_SECONDS, LINE_SECONDS, MIN_SECONDS, type PanelFacts, panelMove, pokeBack, pokeMove, type Step, type StepFacts, stepOf, type Up } from '../line-queue.js';
import { actual, BUILD, CLIMAX_WEEK, COST, easingBites, HELP, type Kind, type Town, toccoCall, WORKING } from '../season/model.js';
import { callsOpen, keptEntry, shouldHush } from '../season/settle.js';
import { basketTrip, globeAt, lampHasGlass, NOTE_READ, noteSeconds, strikeKeeps, undecided } from '../globe.js';
import { buildPaysNow, calledBefore, currentTown, firstLag, globeChoice, keepWeek, keptHelps, lastKept, lastRefusal, markSeen, markSettled, noteGlobe, realWeek, restartSeason, SEASON_WEEKS, solidarityOf, townBefore, unsettled, unsettledCalls, weatherOf } from '../season/store.js';
import { liveLine } from '../season/advisor.js';
import { answer, frameDue, QUESTIONS } from '../season/answers.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { conducting, festivalShare } from './festival.js';
import { FIRST_HUSH_SECONDS, OUT_TO_SPEAK, outInClosedRoom, ride } from '../opening.js';
import { OUTCOME_DAY, outcomeShows } from './outcomes.js';
import { ASK_ROWS, ASK_SIZE, drawAsk } from '../station/ask.js';
import { familyBoxFor, familyKnocked, familyVisited, helpPoint, hintRepeatsNext, idleSeconds, replyCalling, replyWaited, replyWaiting, setCardLineShowing, setInstructionShowing, setLagLineShowing, setLineArrow, setSpyglassLineSaid, setLineFresh, setLinePanel, setLinesWaiting, setReply, setRevealHeld, setWeekStep } from '../talk.js';
import { lookLineDue, replyHolds } from '../season/window-light.js';
import { largerCaptions, lessMotion } from '../comfort.js';
import type { ArrowMark } from '../station/caption.js';
import { drawLine, KEEPSAKES } from '../station/family.js';
import { setRoomGlow } from '../station/materials.js';
import { FOCUS } from '../station/focus.js';
import { PLAZA_Y } from '../station/layout.js';
import { FRAME_MIDDLE } from '../station/town-lamp.js';
import { ASK_LIFT, faceSeat, JAR_ARROW, LAMP, LAMP_FLAME_Y, LINE_HOME, LINE_SIZE, LINE_SUNDAY, NOTCHES, STEP_PLACES, storyPlace, TOCCO_IN, TOCCO_NECK, TOCCO_OUT } from '../station/tocco.js';
import { LINE_CANVAS } from '../station/caption.js';
import { JAR_POSITION } from '../station/card.js';
import { ROPE_REST } from '../station/basket.js';
import { type ChoiceStep, choiceStep } from '../choice-moment.js';
import { HELP_SECONDS } from '../hint-rules.js';

/** The question panel stays open this long, and its rows park this far below while closed. */
const ASK_SECONDS = 8;
const PARKED = 200;
/** A first poke brings his last line back for this long. */
const REPEAT_SECONDS = 4;
/** How far the lamp's glow sits in front of the flame, toward the Keeper (m). */
const HALO_LEAD = 0.07;
/** How far the flame leans toward Lina's window while her window calls (radians), and how far its middle moves (m). */
const LEAN = 0.45;
const LEAN_SHIFT = 0.004;
/** In the first week, after a touch out of turn: how long the lamp and match glow brighter, once (as BasketSystem's things do). */
const RIGHT_FLASH = 0.6;
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
/** How far above its sleeve on the rod the brass sun's face is (station/sun.ts). */
const SUN_FACE = 0.04;
/** Behind its glass the lamp lights the room this much more (from the third week). */
const GLASS_GLOW = 1.35;
/** How far his door swings (his ride and the first minute's timing: opening.ts). */
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
  /** The family box's glass, which he looks at as he says to knock on it (the first week). */
  private familyGlass: Object3D | null = null;
  /** Where he turns to look while he talks of it (Nora's window, or the morning's place), and his yaw now. */
  private tessaWindow = new Vector3();
  /** Nora's house on the little model of the square, where he points in the first week. */
  private modelHouse = new Vector3();
  /** The brass sun, which he looks down at while the first week's sun instructions are up. */
  private sunKnob: Object3D | null = null;
  private yaw = REST_YAW;
  /** His head and hammer arm, what he looks at, and what the arm is doing. */
  private head: Object3D | null = null;
  private arm: Object3D | null = null;
  private place = new Vector3();
  private pointing = false;
  /** Dev build: whether he was pointing last frame, and where, so each change is logged once. */
  private pointedLast = false;
  private pointedAt = new Vector3();
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
  /** Where the arrow of the instruction up has its tip on the line's canvas (px), null with none; and that tip in the world. */
  private arrowPx: { x: number; y: number } | null = null;
  private tip = new Vector3();
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
  private stepFacts: StepFacts = { week: 1, phase: Phase.Shut, open: false, chosen: -1, visited: false, landedFor: 0, called: false, lamp: false, reply: false, look: false, quiet: false, choiceReady: false, box: -1, knocked: false };
  private panel: PanelFacts = { up: 'none', upStep: '', shownFor: 0, left: 0, waiting: 0, holding: false, step: '', instruction: '', persist: false, told: false, least: MIN_SECONDS, through: false };
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
  /** Whether the line up is a refusal (refuse()): it answers a touch, so once taken down it is never said again. */
  private lineOnce = false;
  /** The least the line up stays before another replaces it (a help line stays HELP_SECONDS). */
  private lineLeast = MIN_SECONDS;
  /** The step whose help line is up ('' for any other line): it hangs where that step's instruction does, its arrow toward the same thing. */
  private helpStep: Step | '' = '';
  /** The step the story line up belongs to (a help line, or the "Tap me" after it; '' for any other): it goes with the step. */
  private ownStep: Step | '' = '';
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
  /** Seconds the Keeper has been in the headset this session (0 outside it): his door opens in the first week's closed room. */
  private immersiveFor = 0;
  /** Seconds left of the first week's brighter glow on the lamp and match, after a touch out of turn (week-locks.ts). */
  private rightFlash = 0;
  /** The choice's step last frame (choice-moment.ts): the jar's line is said as its step comes. */
  private lastChoice: ChoiceStep = '';
  /** The jar's line as last said (its balance in it), so he points at the jar while it is up. */
  private jarText = '';
  /** The line of the thing now in the basket. */
  private choiceText = '';
  /** The step the week is in, as worked out this frame (line-queue.ts). */
  private step: Step | '' = '';
  /** Whether the first week's "Tap me to hear it once more." has been said; and the step whose help line went up first, after whose instruction it is due ('' when none: it goes with that step). */
  private tapMeSaid = false;
  private tapMeDue: Step | '' = '';
  /** He has been asked a question this season, and "Unsure?" has been said (at most once, never to one who asked). */
  private askedOnce = false;
  private unsureSaid = false;
  /** "What happens later?" has been answered with the frame this visit. */
  private frameTold = false;
  /** The mark cut among the old ones as the last shutters close. */
  private ownMark: Object3D | null = null;
  /** The town's note has come and the Keeper found the mark: he says so once the choice has been said. */
  private townMark = false;

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
    this.familyGlass = find('FamilyGlass');
    this.ownMark = find('KeeperOwnMark');
    this.head = find('ToccoHead');
    this.arm = find('ToccoArm');
    find('TessaWindow')?.getWorldPosition(this.tessaWindow);
    // The little house carries its shape in world coordinates: its middle is where its geometry is.
    this.sunKnob = find('SunKnob');
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
        if (this.lightLamp(true)) this.matchFlame = MATCH_FLAME_SECONDS;
      }),
      // The third morning's basket on the sill: what he makes of it.
      onSignal('gift', () => this.say(GIFT_LINE)),
      // The climax's Sunday: the town's note has come. The choice is its step's instruction; the mark, if it was found.
      onSignal('townAsks', () => {
        this.say(TOWN_NOTE);
        if (markSeen()) this.townMark = true;
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
        const town = currentTown();
        for (const line of endingLines(town.answer ?? 'window', festivalShare())) this.cue(line);
        // Worked out here, with the night: at the close the town has moved on a week (a build could count as working).
        const working = Object.values(town.builds).filter((stage) => stage === WORKING).length;
        for (const line of ledgerLines(town.pressed - town.strained, town.pressed, working, Math.min(KEEPSAKES, keptHelps()))) this.cue(line);
        this.cue(WEEK.seasonClose);
      }),
      // Lina's drawing, held close.
      onSignal('drawn', () => this.say(DRAWING_LINE)),
      // Through the spyglass, the mark on the old frame.
      onSignal('marked', () => this.say(MARK_LINE)),
      // The latch was pulled while the basket is out: the shutters stay open.
      onSignal('busy', () => this.interrupt(WEEK.busy)),
      // The latch, tried in the first week before Lina has answered the lamp: the shutters stay open (week-locks.ts).
      // Refused at the latch: the first week's wait, or the last Sunday's lamp, said again.
      onSignal('notyet', () => {
        const n = this.weekNumber();
        // The climax's Sunday: the choice is named once the town's note has come; before that the latch only stays.
        if (n === CLIMAX_WEEK && noteSeconds() <= 0) return;
        this.refuse(n === 1 ? NOT_YET : n === CLIMAX_WEEK ? GLASS_LINE : WEEK.lamp);
      }),
      // Touched out of turn in the first week: the lamp and match glow brighter once if they are what invites.
      onSignal('wrong', () => {
        if (this.weekNumber() === 1) this.rightFlash = RIGHT_FLASH;
      }),
      // The lever, pulled in the first week with nothing in the basket: it does not move.
      onSignal('empty', () => this.refuse(REFUSED_EMPTY)),
      // The first week's hauls on the rope, counted aloud at once (the third brings the basket up, and its card).
      onSignal('pulled', () => {
        const week = this.weekEntity();
        if (week == null || (week.getValue(Week, 'week') ?? 1) !== 1) return;
        const line = pullLine(week.getValue(Week, 'pulls') ?? 0);
        if (line === '') return;
        this.interrupt(line);
        // The count belongs to the rope's step: it goes as the basket starts up, not over it as it rises.
        if (this.up === 'story' && this.text === line) this.ownStep = 'bell';
      }),
      onSignal('hurry', () => this.interrupt(WINDOWS_FIRST)),
      onSignal('refused', () => this.interrupt(lastRefusal() === 'built' ? REFUSED_BUILT : REFUSED_COINS)),
      // A guided step taking long (hint-rules.ts): the step said another way, for 5 s; once in the first week, then,
      // that a poke on him says it again.
      onSignal('help', () => this.help()),
      onSignal('restart', () => this.restart()),
    );
  }

  /**
   * The season starts over from the start page: he is back inside his door
   * with nothing to say and nothing waiting (no queued or held lines, no
   * instruction up or read, no hush or reveal, no live line still on its
   * way), the jamb bare of the old season's notches, the lamp dark and
   * upright; in the headset he rides out into the closed room for the
   * latch's instruction, and his first morning is quiet for its 5 s and
   * then his two opening lines, as on a first visit (opening.ts).
   */
  restart(): void {
    if (import.meta.env.DEV) {
      const notches = this.notches.filter((notch) => notch.visible).length;
      const held = this.held.length + (this.revealHold > 0 ? ' (reveal held)' : '') + (this.hush > 0 ? ' (first morning hush)' : '');
      console.info(`[tocco] restart: ${this.lines.length} lines waiting and ${held} held dropped, ${this.up === 'instruction' ? `the ${this.upStep} instruction up` : `a ${this.up} line up`}, season over ${this.seasonOver}, ${notches} notches on the jamb`);
    }
    this.outcomeSaid = false;
    this.seasonOver = false;
    if (this.ownMark != null) this.ownMark.visible = false;
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
    this.carve(unsettled() ? townBefore() : currentTown());
    // In his door at once, facing the seat at rest, his line at home and hidden; his door opens again once the Keeper
    // has been in the headset a moment (the 2D page is not).
    this.out = 0;
    this.immersiveFor = 0;
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
    this.rightFlash = 0;
    this.lastChoice = '';
    this.jarText = '';
    this.choiceText = '';
    this.step = '';
    this.tapMeSaid = false;
    this.tapMeDue = '';
    this.townMark = false;
    this.frameTold = false;
    this.askedOnce = false;
    this.unsureSaid = false;
    setLinesWaiting(false);
    setLineFresh(false);
    setCardLineShowing(false);
    setLagLineShowing(false);
    setSpyglassLineSaid(false);
    setInstructionShowing('');
    setLineArrow(false);
    setRevealHeld(false);
    setWeekStep('');
    if (import.meta.env.DEV) setLinePanel('', '', null);
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    if (week == null) return;
    // Larger captions turned on or off on the start page: his questions and the line up are drawn at the new size.
    if (largerCaptions() !== this.largeCaptions) {
      this.largeCaptions = largerCaptions();
      if (this.askTexture != null) drawAsk(this.askTexture, QUESTIONS, this.largeCaptions);
      const placed = this.placedStep();
      if (this.lineTexture != null) this.arrowPx = drawLine(this.lineTexture, this.up !== 'none' ? this.text : '', undefined, placed !== '' ? STEP_PLACES[placed].arrow : this.storyArrow(this.text));
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
    if (phase === Phase.Choosing && chosen !== this.lastChosen && chosen >= 0) {
      // At once, over whatever is up: a Keeper trying the things reads the one in the basket now, not the one before.
      const town = currentTown();
      const real = realWeek(week.getValue(Week, 'week') ?? 1);
      this.choiceText = choiceLine(chosen, Math.max(0, town.coins - (COST[chosen] ?? 0)), real == null || easingBites(real, town));
      this.interrupt(this.choiceText);
      this.lastCue = true;
    }
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
    // home with his closing line waiting for it). In the first week he is out in the closed room already, soon after
    // the Keeper comes in (opening.ts), for the latch's instruction, and stays out through the first morning's quiet.
    const quiet = this.quiet();
    this.immersiveFor = this.renderer.xr.isPresenting ? this.immersiveFor + delta : 0;
    const closedRoom = outInClosedRoom(week.getValue(Week, 'week') ?? 1, phase, open, quiet, this.immersiveFor);
    const wantOut = (open && !quiet) || closedRoom || (this.up !== 'none' && phase === Phase.Shut) || (phase === Phase.Shut && this.boxIn() && this.lines.length > 0);
    if (closedRoom && this.out === 0) {
      // His door opening: a few wooden clicks (SoundSystem).
      emitSignal('say');
      if (import.meta.env.DEV) console.info(`[tocco] rides out in the closed room ${this.immersiveFor.toFixed(2)} s after entering the headset`);
    }
    const wasOut = this.out > OUT_TO_SPEAK;
    this.out = ride(this.out, wantOut, delta);
    if (import.meta.env.DEV && closedRoom && !wasOut && this.out > OUT_TO_SPEAK) console.info(`[tocco] out in the closed room ${this.immersiveFor.toFixed(2)} s after entering the headset`);
    if (this.tocco != null) {
      this.tocco.position.x = TOCCO_IN.x + (TOCCO_OUT.x - TOCCO_IN.x) * this.out;
      // He bobs as he says a line, not for as long as an instruction stays up.
      this.tocco.position.y = TOCCO_OUT.y + (this.up !== 'none' && this.shownFor < LINE_SECONDS ? 0.004 * Math.abs(Math.sin(this.elapsed * 9)) : 0);
    }
    if (this.door != null) this.door.rotation.y = DOOR_OPEN * Math.min(1, this.out * 3);
    this.look(week, phase, delta);
    this.gesture(phase, delta);

    // While the family's box is in the window the family talks: his line goes down (a line not yet read comes back
    // once the box has gone), the questions close, and his lines wait. One instruction goes up through the hold: the
    // first week's knock on the box's glass, once their line has been read (line-queue.ts stepOf), beside the box.
    const boxIn = this.boxIn();
    if (boxIn) {
      // (The visit his landed line asks for is under way: its step has ended, so that line goes for good, below.)
      if (this.up !== 'instruction' || this.upStep !== 'knock') this.holdLine();
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
    setLagLineShowing(this.out > 0.9 && this.up === 'story' && this.text === LAG_LINE);
    if (this.up === 'story' && this.text === SPYGLASS_LINE) setSpyglassLineSaid(true);
    if (this.up === 'story' && this.text === UNSURE_LINE) this.unsureSaid = true;
    // An instruction hangs where its step's thing is, its arrow toward it (station/tocco.ts STEP_PLACES), and so does
    // the step's help line; a story line by the moment: in the first week over the basket from the bell to the choice
    // and low in the middle otherwise; later over the basket while choosing, above the arrows while they wait on
    // Sunday, beside him otherwise. His questions open over the arrows with it, beside him otherwise.
    const arrows = phase === Phase.Sunday && callsOpen(week.getValue(Week, 'week') ?? 1, quiet) && (week.getValue(Week, 'forecast') ?? -1) < 0;
    if (this.line != null) {
      this.line.visible = this.out > 0.9 && this.up !== 'none';
      const placed = this.placedStep();
      const at = placed !== '' ? STEP_PLACES[placed].at : storyPlace(phase, week.getValue(Week, 'week') ?? 1, arrows);
      this.moveLine(at, delta);
      // Dev server: the emulator's key badges stand beside the line, on its step's side (dev-badges.ts).
      if (import.meta.env.DEV) setLinePanel(this.line.visible ? this.text : '', placed !== '' ? placed : arrows ? 'call' : this.step, at, this.arrowPx != null);
      // The arrow's tip in the world, for the ghost hand to set out from.
      const px = this.arrowPx;
      if (this.line.visible && this.up === 'instruction' && px != null) {
        this.line.updateWorldMatrix(true, false);
        this.line.localToWorld(this.tip.set((px.x / LINE_CANVAS.w - 0.5) * LINE_SIZE.w, (0.5 - px.y / LINE_CANVAS.h) * LINE_SIZE.h, 0));
        setLineArrow(true, this.tip.x, this.tip.y, this.tip.z);
      } else {
        setLineArrow(false);
      }
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
      setRoomGlow(this.glow * (lampHasGlass(globeAt()) ? GLASS_GLOW : 1), this.flameAt);
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
        (this.halo.material as MeshBasicMaterial).opacity = (lampHasGlass(globeAt()) ? 0.8 : 0.55) * this.glow;
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
      // A bare flame until the globe has come, and once it has gone (its flame and glow are the glass's children, so
      // GlobeSystem hides only the globe's material).
      glass.color.setRGB(0.6 + 0.4 * this.glow, 0.64 + 0.2 * this.glow, 0.66 - 0.2 * this.glow);
      glass.opacity = 0.35 + 0.55 * this.glow;
    }
    if (this.rightFlash > 0) this.rightFlash = Math.max(0, this.rightFlash - delta);
    const flash = this.rightFlash > 0 ? 1.8 * Math.sin(Math.PI * (1 - this.rightFlash / RIGHT_FLASH)) : 0;
    const pulse = Math.max(flash, 0.5 + 0.5 * Math.sin(this.elapsed * 3.2));
    shine(this.arrowUp as Mesh | null, arrowsOut && !called ? pulse : 0);
    shine(this.down as Mesh | null, arrowsOut && !called ? pulse : 0);
    // On the climax's Sunday only the match decides, once the town's note has been read (globe.ts).
    const deciding = undecided(n, phase === Phase.Sunday, globeChoice() != null);
    shine(this.lamp, sunday && called && !lit && !deciding ? pulse : 0);
    // The match invites the same moment as the lamp; once struck it burns a moment at its head.
    shine(this.match, sunday && called && !lit && (!deciding || noteSeconds() >= NOTE_READ) ? pulse : 0);
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
    f.landedFor = phase === Phase.Landed ? (week.getValue(Week, 'timer') ?? 0) : 0;
    f.called = !callsOpen(n, quiet) || (week.getValue(Week, 'forecast') ?? -1) >= 0;
    f.lamp = week.getValue(Week, 'lamp') ?? false;
    f.reply = replyWaiting();
    f.look = lookLineDue(n, replyWaited());
    f.quiet = quiet;
    f.box = familyBoxFor();
    f.knocked = familyKnocked();
    // The first week's choice comes in three steps (choice-moment.ts): the card's line is up already; as the jar's step
    // comes, its balance; the choosing instruction only with the third.
    const choice = choiceStep(n, phase, week.getValue(Week, 'timer') ?? 0, chosen, quiet);
    if (choice === 'jar' && this.lastChoice === 'card') {
      this.jarText = jarLine(currentTown().coins);
      this.say(this.jarText);
    }
    this.lastChoice = choice;
    f.choiceReady = choice === 'choose';
    f.glass = undecided(n, phase === Phase.Sunday, globeChoice() != null);
    f.noteIn = f.glass && basketTrip() === 'town' && noteSeconds() > 0;
    const step = stepOf(f);
    this.dropStepLines(step);
    // He says an instruction only once he is out to say it.
    const instruction = step !== '' && this.out > OUT_TO_SPEAK ? instructionLine(step, n, SEASON_WEEKS, realWeek(n)?.tier ?? 0) : '';
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
    // After the first help line, once the instruction is back: the one "Tap me" (never his last line).
    if (this.tapMeDue !== '' && this.tapMeDue !== step) this.tapMeDue = '';
    if (this.tapMeDue !== '' && this.up === 'instruction' && this.upStep === step) {
      this.tapMeDue = '';
      this.tapMeSaid = true;
      this.lines.push({ text: TAP_ME, cue: true, keep: false, forget: true, step: step === '' ? undefined : step });
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
    p.least = this.lineLeast;
    p.ownStep = this.up === 'story' ? this.ownStep : '';
    // The first week's look across goes up while the town waits for Lina's answer, and its knock while the family's box
    // is in (his other lines wait).
    p.through = step === 'look' || step === 'knock';
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
        if (import.meta.env.DEV && this.up === 'story' && this.ownStep !== '' && this.ownStep !== step) console.info(`[tocco] ${JSON.stringify(this.text)} goes, the ${this.ownStep} step done`);
        this.show('');
        break;
      default:
        break;
    }
    // "Same mark as your glass.", once the choice is up.
    if (this.townMark && this.up === 'instruction' && this.upStep === 'glass' && this.shownFor >= MIN_SECONDS) {
      this.townMark = false;
      this.say(SAME_MARK);
    }
    setInstructionShowing(this.up === 'instruction' ? this.upStep : '');
    setWeekStep(step);
    this.step = step;
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
        // The latch's help line, or the "Tap me" after it, goes with the latch's step: it does not cost the first
        // morning its quiet (a Keeper slow to the latch used to get the welcome at once, with the shutters).
        this.dropStepLines('');
        if (this.up === 'story' && this.ownStep !== '') this.show('');
        // Only a quiet first morning: lines still waiting (the season just kept) are said first, with him out.
        if (n === 1 && !this.quiet() && this.up !== 'story' && this.lines.length === 0) {
          this.hush = FIRST_HUSH_SECONDS;
          this.hushWeek = n;
        } else {
          this.morning(n);
        }
        break;
      case Phase.Choosing: {
        // The first week's card, once the basket stands on the sill with it (nothing hangs over the basket as it
        // rises): what it means, at once, and not cued, so it stays its time.
        const line = phaseLine(phase, n);
        if (line !== '') this.interrupt(line);
        // Later weeks: what the morning showed, with the card, so the figure has the town beside it.
        const real = realWeek(n);
        if (n > 1 && n !== CLIMAX_WEEK && real != null && real.tier !== 0) this.cue(morningLine(real));
        if ((n === 2 || n === 3) && !this.askedOnce && !this.unsureSaid && !this.quiet()) this.cue(UNSURE_LINE);
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
      if (this.ownMark != null) this.ownMark.visible = false;
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
        this.held.push(settledLine(last, went, kept.call, kept.tocco));
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
    // with the card (Phase.Choosing).
    if (n === 1) {
      if (townBefore().week <= 1 && !this.quiet()) for (const line of INTRO) this.say(line);
      return;
    }
    // The climax's morning says the first week's words again.
    this.say(n === CLIMAX_WEEK ? QUIET_LINE : morningLine(real));
    const turn = weekMorningLine(n);
    if (turn !== '') this.say(turn);
    // The spyglass came to the sill this morning.
    if (n === 2 && !this.quiet()) {
      this.say(SPYGLASS_LINE);
      this.say(KEY_LINE);
    }
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
    // The call ends the asking moment: his questions close, so they do not jump over his line as it glides home.
    if (this.askOpen >= 0) this.placeAsk(false);
    // The lamp's instruction follows as its step's.
    this.cue(calledLine(direction, !calledBefore()));
  }

  /** The shutters closed on Sunday: the week is kept with its choice and calls, settled next morning. */
  private keep(): void {
    const week = this.weekEntity();
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const quiet = this.quiet();
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const before = currentTown();
    keepWeek(keptEntry(n, quiet, chosen, week.getValue(Week, 'forecast') ?? -1, this.toccoCall));
    week.setValue(Week, 'forecast', -1);
    this.interrupt(weekDoneLine(n, SEASON_WEEKS));
    // Which way a hard week moved the festival, in words.
    const hard = hardWeekLine(before, currentTown(), n, chosen);
    if (hard !== '') this.say(hard);
    // After the first week, what the season is for.
    if (n === 1) this.say(goalLine(SEASON_WEEKS));
    if (currentTown().week > SEASON_WEEKS) {
      // No morning follows the last week in this season: its calls are settled now, and the season starts over.
      const last = realWeek(n);
      const done = lastKept();
      if (last != null && done != null) {
        const went = actual(last);
        this.say(settledLine(last, went, done.call, done.tocco));
        this.say(notchLine(done.call === went, done.tocco === went, done.call >= 0));
      }
      markSettled();
      this.carve(currentTown());
      this.say(YEAR_END);
      this.say(SEASON_OVER);
      // Among the old marks by the latch, a new one; it goes with the next morning, so the first opening is the same for everyone.
      if (this.ownMark != null) this.ownMark.visible = true;
      emitSignal('carved');
      restartSeason();
      // The new season's first week says "Tap me" again, once.
      this.tapMeSaid = false;
      this.tapMeDue = '';
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
    // The family's box is in the window: it goes home first, then the poke is answered (update). Not in the first week:
    // the Keeper is at the glass, and Lina's moment would go with it.
    if (this.boxIn()) {
      if (this.weekNumber() === 1) return;
      if (!this.pokeAfterBox) emitSignal('window');
      this.pokeAfterBox = true;
      return;
    }
    if (pokeMove(this.weekNumber(), this.up !== 'none' && this.text === this.lastSaid, this.lastSaid !== '', this.repeated) === 'repeat') {
      this.repeated = true;
      // Still up: it stays at least as long; gone: it comes back. An instruction whose step lasts comes back as itself,
      // where its step's thing is, with its arrow, and goes with its step (in the first week it stays until then).
      if (this.up !== 'none' && this.text === this.lastSaid) this.lineTimer = Math.max(this.lineTimer, REPEAT_SECONDS);
      else if (this.lastStep !== '' && pokeBack(this.lastStep, this.step) === 'instruction') {
        this.showInstruction(this.lastStep, this.lastSaid, this.weekNumber() === 1, REPEAT_SECONDS);
        this.repeated = true;
      } else this.show(this.lastSaid, REPEAT_SECONDS, true);
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
    this.askedOnce = true;
    // "What happens later?", once: the frame over the square.
    if (q === 1 && frameDue(currentTown(), this.frameTold)) {
      this.frameTold = true;
      this.interrupt(FRAME_LINE);
      return;
    }
    this.interrupt(answer(q, real, currentTown(), chosen, settled, buildPaysNow()));
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
    this.show(line.text, LINE_SECONDS, line.forget === true, line.cue, line.keep);
    if (line.step != null) this.ownStep = line.step;
  }

  /** Drops the waiting lines that belong to a step the week has moved past (the line up goes in panelMove). */
  private dropStepLines(step: Step | ''): void {
    for (let i = this.lines.length - 1; i >= 0; i -= 1) {
      const own = this.lines[i].step;
      if (own != null && own !== step) this.lines.splice(i, 1);
    }
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
   * The help ladder's line (hint-rules.ts): the first week's step said
   * another way (season/lines.ts HELP) for HELP_SECONDS, as a refusal is
   * (nothing waiting is dropped); its instruction comes back after it, and
   * the first time, once the instruction has been up again, "Tap me to hear
   * it once more.", which a poke never brings back (it is not his last line).
   */
  private help(): void {
    const step = this.step;
    if (this.weekNumber() !== 1 || step === '' || !(step in HELP_LINES)) return;
    const text = HELP_LINES[step as keyof typeof HELP_LINES];
    this.refuse(text);
    if (this.up === 'story' && this.text === text) {
      this.lineTimer = HELP_SECONDS;
      this.lineLeast = HELP_SECONDS;
      // It belongs to its step: it hangs where the step's instruction does, its arrow toward the same thing, and goes
      // the frame the step ends (line-queue.ts panelMove), so a done step's help never holds up what comes next.
      this.helpStep = step;
      this.ownStep = step;
      if (this.lineTexture != null) this.arrowPx = drawLine(this.lineTexture, text, undefined, STEP_PLACES[step].arrow);
    }
    if (!this.tapMeSaid) this.tapMeDue = step;
  }

  /**
   * Says a refusal now (the first week's latch or lever out of turn,
   * week-locks.ts): unlike an interruption it drops nothing still waiting,
   * and a line up that was not yet read is said again after it, so the
   * Keeper trying the latch during his opening lines still hears them all.
   */
  private refuse(text: string): void {
    if (this.quiet()) return;
    if (replyWaiting()) {
      this.say(text);
      return;
    }
    if (this.boxIn()) {
      this.lines.unshift({ text, cue: false, keep: false });
      return;
    }
    // Tried again while it is up: it stays up its full time from now.
    if (this.up !== 'none' && this.text === text) {
      this.lineTimer = LINE_SECONDS;
      return;
    }
    this.holdLine();
    this.show(text);
    this.lineOnce = true;
  }

  /**
   * While he talks of a place he turns toward it (META_VR_FIKIR.md §10): the
   * morning's place as he gives the morning's news, Nora's window as he
   * sends the Keeper to it; in the first week also the windows across the
   * square as he says what lights the festival, and the rope's handle as he
   * names it at the first bell. Never further than a quarter turn or so, so
   * he still half faces the Keeper.
   */
  private look(week: Entity, phase: string, delta: number): void {
    if (this.tocco == null) return;
    this.pointing = false;
    let target = REST_YAW;
    // A guided step taking long (hint-rules.ts): he points at the thing to touch, whatever is on his panel.
    const help = helpPoint();
    if (help.shown && this.out > 0.9 && this.highFive <= 0 && !this.quiet()) {
      this.pointing = true;
      this.place.set(help.x, help.y, help.z);
      let turn = Math.atan2(help.x - TOCCO_OUT.x, help.z - TOCCO_OUT.z) - REST_YAW;
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      target = REST_YAW + Math.max(-LOOK_TURN, Math.min(LOOK_TURN, turn));
    } else if (replyWaiting() && week.getValue(Week, 'week') === 1 && this.out > 0.9 && this.highFive <= 0) {
      // The first week's lamp is lit: he points across the square at Lina's window, until she answers.
      this.pointing = true;
      this.place.copy(this.tessaWindow);
      let turn = Math.atan2(this.tessaWindow.x - TOCCO_OUT.x, this.tessaWindow.z - TOCCO_OUT.z) - REST_YAW;
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      target = REST_YAW + Math.max(-LOOK_TURN, Math.min(LOOK_TURN, turn));
    } else if (this.up !== 'none' && this.out > 0.9 && this.highFive <= 0) {
      // A raised hand waiting for the Keeper's: he faces them, and points at nothing.
      const n = week.getValue(Week, 'week') ?? 1;
      let x = Number.NaN;
      let y = PLAZA_Y;
      let z = Number.NaN;
      if (this.text === FRAME_LINE || this.text === MARK_LINE) {
        // The empty frame over the square.
        [x, y, z] = FRAME_MIDDLE;
      } else if (this.text === GIFT_LINE) {
        // The lamp the globe fits.
        x = LAMP.x;
        y = LAMP.y + 0.1;
        z = LAMP.z;
      } else if (this.text === FIRST_WEEK.card) {
        // The first week's card line: the empty kerb (it glows again meanwhile, FocusSystem).
        const kerb = FOCUS.fuel;
        if (kerb != null) {
          x = kerb.x;
          z = kerb.z;
        }
      } else if (n === 1 && this.text === INTRO[1]) {
        // "More windows light the festival": the windows across the square, straight ahead of the Keeper.
        x = 0;
        y = this.tessaWindow.y;
        z = this.tessaWindow.z;
      } else if (n === 1 && this.up === 'instruction' && this.upStep === 'bell') {
        // The first bell: he turns to the rope's handle on the Keeper's right as he names it.
        x = ROPE_REST.x;
        y = ROPE_REST.y;
        z = ROPE_REST.z;
      } else if (n === 1 && this.up === 'instruction' && this.upStep === 'knock' && this.familyGlass != null) {
        // The first week's knock: he turns to the box's glass as he names it.
        this.familyGlass.getWorldPosition(this.local);
        x = this.local.x;
        y = this.local.y;
        z = this.local.z;
      } else if (phase === Phase.Morning && n > 1) {
        // The first week's morning is only his welcome: he looks at the Keeper as he says it.
        const real = realWeek(n);
        // "Food prices follow fuel later": the market, whatever the week's price is.
        const place = this.text === LAG_LINE ? FOCUS.food : real != null ? FOCUS[real.kind] : undefined;
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
      } else if (n === 1 && this.up === 'instruction' && (this.upStep === 'sun' || this.upStep === 'sunOn') && this.sunKnob != null) {
        // The first week's sun: he looks down at it (its face, above the sleeve on the rod).
        this.sunKnob.getWorldPosition(this.local);
        x = this.local.x;
        y = this.local.y + SUN_FACE;
        z = this.local.z;
      } else if (phase === Phase.Choosing && this.text === this.jarText) {
        // The first week's jar, as he says what is in it.
        x = JAR_POSITION.x;
        y = JAR_POSITION.y + 0.05;
        z = JAR_POSITION.z;
      } else if (phase === Phase.Choosing && week.getValue(Week, 'chosen') === HELP && this.text === this.choiceText) {
        // "Nora's family, over there": her window.
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
    if (import.meta.env.DEV && (this.pointing !== this.pointedLast || (this.pointing && this.place.distanceTo(this.pointedAt) > 0.1))) {
      this.pointedLast = this.pointing;
      this.pointedAt.copy(this.place);
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
  private lightLamp(struck = false): boolean {
    const week = this.weekEntity();
    // A solidarity week has no lamp (RevealSystem puts it away): nothing lights, and no answer comes, not even by light.
    if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday || week.getValue(Week, 'lamp') || this.quiet()) return false;
    // The climax's Sunday: only the match decides it, once the town's note has been read, the glass still on the lamp.
    if (undecided(week.getValue(Week, 'week') ?? 1, true, globeChoice() != null)) {
      if (!strikeKeeps(struck, noteSeconds(), globeAt())) {
        // A tap on the lamp, or the match too soon: he says the choice again, once its note has come.
        if (noteSeconds() > 0) this.refuse(GLASS_LINE);
        return false;
      }
      noteGlobe('kept');
    }
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

  /**
   * Eases his line toward a place, facing the seat all the way; with less motion (comfort.ts) it is there at once,
   * never sliding while read. While the family's box is in it is there at once too: the first week's knock goes up
   * beside the box, and sliding there from where his last line hung, it would cross the box.
   */
  private moveLine(target: { x: number; y: number; z: number }, delta: number): void {
    const p = this.linePoint;
    if (this.line == null || (p.x === target.x && p.y === target.y && p.z === target.z)) return;
    const k = lessMotion() || this.boxIn() ? 1 : Math.min(1, delta * 5);
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
    this.lineOnce = false;
    this.lineLeast = this.readSeconds();
    this.helpStep = '';
    this.ownStep = '';
    this.lineTimer = text === '' ? 0 : seconds;
    this.shownFor = 0;
    if (this.lineTexture != null) this.arrowPx = drawLine(this.lineTexture, text, undefined, this.storyArrow(text));
  }

  /** Puts up the instruction of the step the week is in: until the step ends in the first week, for `seconds` later. */
  private showInstruction(step: Step, text: string, persist: boolean, seconds = LINE_SECONDS): void {
    if (import.meta.env.DEV && this.boxIn() && step !== 'knock') console.warn(`[tocco] ${JSON.stringify(text)} goes up while the family's box is in the window`);
    emitSignal('say');
    if (import.meta.env.DEV) console.info(`[tocco] instruction ${step}`, JSON.stringify(text), persist ? 'until its step ends' : `for ${seconds} s`, `at ${(performance.now() / 1000).toFixed(3)} s`);
    this.lastSaid = text;
    this.lastCue = true;
    this.lastStep = step;
    this.repeated = false;
    this.text = text;
    this.up = 'instruction';
    this.upStep = step;
    this.lineKeep = false;
    this.lineTimer = persist ? Number.POSITIVE_INFINITY : seconds;
    this.shownFor = 0;
    this.lineOnce = false;
    this.lineLeast = this.readSeconds();
    this.helpStep = '';
    this.ownStep = '';
    if (this.lineTexture != null) this.arrowPx = drawLine(this.lineTexture, text, undefined, STEP_PLACES[step].arrow);
  }

  /** How long a line stays before another may replace it, at the caption size in use. */
  private readSeconds(): number {
    return largerCaptions() ? LARGE_MIN_SECONDS : MIN_SECONDS;
  }

  /** The step whose place the line up takes: an instruction's, or a help line's; '' for a story line. */
  /** The one story line with an arrow: the jar's, toward the jar. */
  private storyArrow(text: string): ArrowMark | null {
    return text !== '' && text === this.jarText ? JAR_ARROW : null;
  }

  private placedStep(): Step | '' {
    if (this.up === 'instruction') return this.upStep;
    return this.up === 'story' ? this.helpStep : '';
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
    // It keeps its step (a help line, the "Tap me" after it), so it is dropped once the week has moved past that step.
    const held = heldLine(this.text, this.lastSaid, this.lastCue, this.lineKeep, this.ownStep);
    // A refusal answered a touch that has passed: it only goes down.
    const read = this.shownFor >= MIN_SECONDS || this.lineOnce;
    this.show('');
    if (!read) this.lines.unshift(held);
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
  /** Not his last line once said: a poke never brings it back (the first week's "Tap me"). */
  forget?: boolean;
  /** The step it belongs to (the first week's "Tap me" after a help line): it is dropped, waiting or up, once the week has moved past it. */
  step?: Step;
}

function shine(mesh: Mesh | null, amount: number): void {
  const material = mesh?.material as MeshStandardMaterial | undefined;
  if (material?.emissive == null) return;
  material.emissive.setRGB(0.32 * amount, 0.24 * amount, 0.1 * amount);
}
