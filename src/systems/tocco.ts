import { type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, Object3D, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { calledLine, choiceLine, SPYGLASS_LINE, spottedLine, WINDOWS_FIRST, festivalLines, FIRST_WEEK, INTRO, LAG_LINE, lampLitLine, outcomeLine, memoryLine, morningLine, notchLine, phaseLine, REFUSED_BUILT, REFUSED_COINS, SEASON_OVER, settledLine, stageLine, sundayLine, WEEK, weatherLines, weekDoneLine } from '../season/lines.js';
import { actual, BUILD, type Kind, type Town, toccoCall, WORKING } from '../season/model.js';
import { callsOpen, keptEntry, shouldHush } from '../season/settle.js';
import { currentTown, firstLag, keepWeek, lastKept, lastRefusal, markSettled, realWeek, restartSeason, SEASON_WEEKS, solidarityOf, townBefore, unsettled, unsettledCalls, weatherOf } from '../season/store.js';
import { liveLine } from '../season/advisor.js';
import { answer, QUESTIONS } from '../season/answers.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { conducting, festivalShare } from './festival.js';
import { OUTCOME_DAY, outcomeShows } from './outcomes.js';
import { ASK_ROWS, ASK_SIZE, drawAsk } from '../station/ask.js';
import { idleSeconds, setCardLineShowing, setLinesWaiting } from '../talk.js';
import { drawLine } from '../station/family.js';
import { setRoomGlow } from '../station/materials.js';
import { FOCUS } from '../station/focus.js';
import { PLAZA_Y } from '../station/layout.js';
import { ASK_BY_BOX, faceSeat, LAMP_FLAME_Y, LINE_AT_BASKET, LINE_BY_BOX, LINE_HOME, LINE_SUNDAY, NOTCHES, TOCCO_IN, TOCCO_NECK, TOCCO_OUT } from '../station/tocco.js';

/** The question panel stays open this long, sits this far above his line, and its rows park this far below while closed. */
const ASK_SECONDS = 8;
const ASK_LIFT = 0.11;
const PARKED = 200;
/** Seconds a line stays up, and the least it stays before the next one in line replaces it. */
const LINE_SECONDS = 7;
const MIN_SECONDS = 4;
/** A first poke brings his last line back for this long. */
const REPEAT_SECONDS = 4;
/** On the very first morning he waits this long after the shutters open: the town speaks first. */
const HUSH_SECONDS = 6;
/** How far the lamp's glow sits in front of the flame, toward the Keeper (m). */
const HALO_LEAD = 0.07;
/** How long the struck match burns at its head. */
const MATCH_FLAME_SECONDS = 1.2;
/** His yaw at rest (turned toward the seat), and how far he turns to look at what he names (radians). */
const REST_YAW = 0.5;
const LOOK_TURN = 1.6;
/** How far his head turns and tilts (radians), how near a hand must come for him to watch it (m). */
const HEAD_TURN = 1.0;
const HEAD_TILT = 0.6;
const WATCH_HAND = 0.4;
/** Still this long, he taps the sill twice with his hammer (the ghost hand follows later). */
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
  private up: Object3D | null = null;
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
  /** Whether the first week's "touch the lever" has been said. */
  private toldLever = false;
  /** Whether this week's outcome has been said (reset as the basket lands). */
  private outcomeSaid = false;
  /** Where his line hangs now, easing toward where the moment wants it. */
  private linePoint: { x: number; y: number; z: number } = { x: LINE_HOME.x, y: LINE_HOME.y, z: LINE_HOME.z };
  private familyBox: Object3D | null = null;
  /** Where he turns to look while he talks of it (Nora's window, or the morning's place), and his yaw now. */
  private tessaWindow = new Vector3();
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
  private revealHold = 0;
  private hushed = false;
  /** A stand-in for the line at its usual place, from which the question panel is laid out. */
  private askHome = new Object3D();
  private notches: Object3D[] = [];
  private line: Object3D | null = null;
  private lineTexture: CanvasTexture | null = null;
  private text = '';
  /** The last line he said, and whether a poke has brought it back since. */
  private lastSaid = '';
  private repeated = false;
  private lineTimer = 0;
  private shownFor = 0;
  /** Seconds left of the first morning's quiet, and the week whose morning lines wait for it. */
  private hush = 0;
  private hushWeek = 0;
  /** Lines waiting their turn; a cue is an instruction for one phase of the week, dropped once the week moves on. */
  private lines: Array<{ text: string; cue: boolean }> = [];
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
  /** Whether the question panel stands where it goes while the family's box is in the window. */
  private askByBox = false;
  /** Bumped on every question, so a late live line never lands on a newer one. */
  private asked = 0;
  /** The last week was just kept and the season started over; the old notches come off next morning. */
  private seasonOver = false;
  /** Where the Sunday arrows stand when they are out; parked far below the town otherwise (pointer rays ignore visibility). */
  private arrowY = 0;

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.tocco = find('Tocco');
    this.door = find('ToccoDoor');
    this.up = find('ArrowUp');
    this.down = find('ArrowDown');
    this.arrowY = this.up?.position.y ?? 0;
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
    this.lineTexture = ((this.line as Mesh | null)?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | null;
    this.askPanel = find('AskPanel');
    this.askTexture = ((this.askPanel as Mesh | null)?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | null;
    for (let i = 0; i < ASK_ROWS; i += 1) {
      const row = find(`AskRow${i}`);
      if (row != null) this.askRows.push(row);
    }
    if (this.askTexture != null) drawAsk(this.askTexture, QUESTIONS);
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
      onSignal('hurry', () => this.interrupt(WINDOWS_FIRST)),
      onSignal('refused', () => this.interrupt(lastRefusal() === 'built' ? REFUSED_BUILT : REFUSED_COINS)),
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    if (week == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    if (phase !== this.lastPhase) {
      if (import.meta.env.DEV) console.info('[tocco] phase', phase, 'week', week.getValue(Week, 'week'));
      // An instruction still waiting from an earlier phase no longer fits, nor do open questions.
      this.lines = this.lines.filter((line) => !line.cue);
      this.placeAsk(false);
      this.onPhase(week, phase, this.lastPhase);
      this.lastPhase = phase;
    }
    if (phase === Phase.Choosing && chosen !== this.lastChosen && chosen >= 0) {
      const n = week.getValue(Week, 'week') ?? 1;
      this.cue(choiceLine(chosen));
      // The first time, what to do next as well.
      if (n === 1 && !this.toldLever) {
        this.toldLever = true;
        this.cue(FIRST_WEEK.chosen);
      }
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
    // Out with the shutters open, in once they close and he has had his say.
    const quiet = this.quiet();
    const wantOut = (open && !quiet && this.hush <= 0) || (this.lineTimer > 0 && phase === Phase.Shut && this.text !== '');
    this.out += ((wantOut ? 1 : 0) - this.out) * Math.min(1, delta / (RIDE_SECONDS / 4));
    if (this.tocco != null) {
      this.tocco.position.x = TOCCO_IN.x + (TOCCO_OUT.x - TOCCO_IN.x) * this.out;
      this.tocco.position.y = TOCCO_OUT.y + (this.lineTimer > 0 ? 0.004 * Math.abs(Math.sin(this.elapsed * 9)) : 0);
    }
    if (this.door != null) this.door.rotation.y = DOOR_OPEN * Math.min(1, this.out * 3);
    this.look(week, phase, delta);
    this.gesture(phase, delta);

    if (this.lineTimer > 0) {
      this.lineTimer -= delta;
      this.shownFor += delta;
      const next = this.lines.length > 0 && this.shownFor >= MIN_SECONDS;
      if (next) this.show(this.lines.shift()?.text ?? '');
      else if (this.lineTimer <= 0 && this.lineTexture != null) drawLine(this.lineTexture, '');
    }
    setCardLineShowing(this.out > 0.9 && this.lineTimer > 0 && this.text === FIRST_WEEK.card);
    const boxIn = this.familyBox?.visible ?? false;
    if (this.line != null) {
      this.line.visible = this.out > 0.9 && this.lineTimer > 0;
      // Under the family's box while it is in the window; over the basket while choosing; above the arrows while
      // they wait on Sunday (from the second week); beside him otherwise.
      const arrows = phase === Phase.Sunday && callsOpen(week.getValue(Week, 'week') ?? 1, quiet) && (week.getValue(Week, 'forecast') ?? -1) < 0;
      this.moveLine(boxIn ? LINE_BY_BOX : phase === Phase.Choosing ? LINE_AT_BASKET : arrows ? LINE_SUNDAY : LINE_HOME, delta);
    }
    if (this.askOpen >= 0) {
      this.askOpen += delta;
      if (this.askOpen > ASK_SECONDS || this.out < 0.9) this.placeAsk(false);
      // The box came or went while the questions are up: they move with the line.
      else if (boxIn !== this.askByBox) this.layoutAsk(true);
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
        for (const line of this.held) this.say(line);
        for (const line of rest) this.lines.push(line);
        this.held.length = 0;
      }
    }
    setLinesWaiting(this.lines.length > 0 || this.hush > 0 || this.held.length > 0);

    // No calls in the first week or a solidarity week: the arrows stay down, out of reach of a pointing ray.
    const n = week.getValue(Week, 'week') ?? 1;
    const calls = callsOpen(n, quiet);
    const sunday = phase === Phase.Sunday && !quiet;
    const arrowsOut = sunday && calls;
    // The first week's lamp invites at once, as if the call were made.
    const called = !calls || (week.getValue(Week, 'forecast') ?? -1) >= 0;
    for (const arrow of [this.up, this.down]) {
      if (arrow == null) continue;
      arrow.visible = arrowsOut;
      arrow.position.y = arrowsOut ? this.arrowY : this.arrowY - PARKED;
    }
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
    shine(this.up as Mesh | null, arrowsOut && !called ? pulse : 0);
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
        if (n === 1 && !this.quiet() && this.lineTimer <= 0 && this.lines.length === 0) {
          this.hush = HUSH_SECONDS;
          this.hushWeek = n;
        } else {
          this.morning(n);
        }
        break;
      case Phase.Rising: {
        // The first week's card comes up with the basket: what it means, said rather than cued, so it is not
        // dropped as the rise ends; it waits behind the bell line if the Keeper pulled quickly.
        const line = phaseLine(phase, n);
        if (line !== '') this.say(line);
        break;
      }
      case Phase.Bell:
      case Phase.Choosing:
      case Phase.Lowering:
      case Phase.Landed: {
        // In the first week the basket's landing speaks for itself, and the ghost hand shows the window and the sun.
        const line = phaseLine(phase, n);
        if (line !== '') this.cue(line);
        break;
      }
      case Phase.Sunday: {
        // The first week has no call (calls start in the second): straight to the lamp, said once.
        if (!callsOpen(n, this.quiet())) {
          this.toccoCall = -1;
          if (n === 1) this.cue(WEEK.lamp);
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
    this.cue(calledLine(direction));
    if (!week.getValue(Week, 'lamp')) this.cue(WEEK.lamp);
  }

  /** The shutters closed on Sunday: the week is kept with its choice and calls, settled next morning. */
  private keep(): void {
    const week = this.weekEntity();
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const quiet = this.quiet();
    keepWeek(keptEntry(n, quiet, week.getValue(Week, 'chosen') ?? -1, week.getValue(Week, 'forecast') ?? -1, this.toccoCall));
    week.setValue(Week, 'forecast', -1);
    this.interrupt(weekDoneLine(n));
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
    if (this.quiet() || this.out < 0.9) return;
    if (this.lastSaid !== '' && !this.repeated) {
      this.repeated = true;
      // Still up: it stays at least as long; gone: it comes back.
      if (this.lineTimer > 0 && this.text === this.lastSaid) this.lineTimer = Math.max(this.lineTimer, REPEAT_SECONDS);
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

  /**
   * Beside him, just over where his line usually hangs, whatever the line is
   * doing just now; while the family's box is in the window, just over his
   * line's place under it, so the panel never cuts into the box.
   */
  private layoutAsk(open: boolean): void {
    const panel = this.askPanel;
    const line = this.line;
    if (panel == null || line == null) return;
    panel.visible = open;
    this.askByBox = this.familyBox?.visible ?? false;
    const home = this.askHome;
    faceSeat(home, this.askByBox ? ASK_BY_BOX : LINE_HOME);
    const lift = this.askByBox ? 0 : ASK_LIFT;
    panel.quaternion.copy(home.quaternion);
    panel.position.set(0, lift, 0).applyQuaternion(home.quaternion).add(home.position);
    this.askRows.forEach((row, i) => {
      row.quaternion.copy(home.quaternion);
      row.position.set(0, lift + (1 - i) * (ASK_SIZE.h / ASK_ROWS), 0).applyQuaternion(home.quaternion).add(home.position);
      if (!open) row.position.y -= PARKED;
    });
  }

  /** Queues a line; it shows once the one before has been up long enough. An empty line clears them all. */
  private say(text: string, cue = false): void {
    if (text !== '' && this.quiet()) return;
    if (text === '') {
      this.lines.length = 0;
      this.show('');
      return;
    }
    if (this.lineTimer > 0) this.lines.push({ text, cue });
    else this.show(text);
  }

  /** An instruction for the phase the week is in; dropped if it is still waiting when the week moves on. */
  private cue(text: string): void {
    this.say(text, true);
  }

  /** Takes a waiting line out of the queue, when the moment for it has passed. */
  private drop(text: string): void {
    const at = this.lines.findIndex((line) => line.text === text);
    if (at >= 0) this.lines.splice(at, 1);
  }

  /** Says a line now, dropping any still waiting: they no longer fit the moment. */
  private interrupt(text: string): void {
    if (this.quiet()) return;
    this.lines.length = 0;
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
    if (this.lineTimer > 0 && this.out > 0.9 && this.highFive <= 0) {
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
      } else if (phase === Phase.Landed && !(this.familyBox?.visible ?? false)) {
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

    // A tap on the sill, once per stillness, before the ghost hand.
    const still = idleSeconds();
    if (still < 1) this.tapped = false;
    if (out && !this.tapped && this.tapping < 0 && this.highFive <= 0 && this.lineTimer <= 0 && still > TAP_AFTER && phase !== Phase.Shut) {
      this.tapped = true;
      this.tapping = 0;
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
    if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday || week.getValue(Week, 'lamp')) return false;
    week.setValue(Week, 'lamp', true);
    this.drop(WEEK.lamp);
    // The last Sunday's lamp lights the season's last night; from the second week, the shutters are next.
    const line = lampLitLine(week.getValue(Week, 'week') ?? 1, SEASON_WEEKS);
    if (line !== '') this.cue(line);
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

  /** Eases his line toward a place, facing the seat all the way. */
  private moveLine(target: { x: number; y: number; z: number }, delta: number): void {
    const p = this.linePoint;
    if (this.line == null || (p.x === target.x && p.y === target.y && p.z === target.z)) return;
    const k = Math.min(1, delta * 5);
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

  /** Puts a line on his panel for `seconds`; `again` when a poke brings back the last one. */
  private show(text: string, seconds = LINE_SECONDS, again = false): void {
    // A few wooden clicks as he speaks (SoundSystem): his words stay written.
    if (text !== '') emitSignal('say');
    if (import.meta.env.DEV && text !== '') console.info(again ? '[tocco] repeats' : '[tocco] says', JSON.stringify(text), `for ${seconds} s`);
    if (text !== '' && !again) {
      this.lastSaid = text;
      this.repeated = false;
    }
    this.text = text;
    this.lineTimer = text === '' ? 0 : seconds;
    this.shownFor = 0;
    if (this.lineTexture != null) drawLine(this.lineTexture, text);
  }

  private carve(town: Town): void {
    this.notches.forEach((notch, index) => {
      const row = Math.floor(index / NOTCHES);
      const k = index % NOTCHES;
      notch.visible = k < (row === 0 ? town.keeperNotches : town.toccoNotches);
    });
  }
}

function shine(mesh: Mesh | null, amount: number): void {
  const material = mesh?.material as MeshStandardMaterial | undefined;
  if (material?.emissive == null) return;
  material.emissive.setRGB(0.32 * amount, 0.24 * amount, 0.1 * amount);
}
