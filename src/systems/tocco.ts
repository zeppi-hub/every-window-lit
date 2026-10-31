import { type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { choiceLine, LAG_LINE, memoryLine, morningLine, notchLine, REFUSED_BUILT, REFUSED_COINS, SEASON_OVER, settledLine, stageLine, sundayLine, weatherLines } from '../season/lines.js';
import { actual, type Kind, type Town, toccoCall, WORKING } from '../season/model.js';
import { currentTown, firstLag, keepWeek, lastKept, lastRefusal, markSettled, realWeek, restartSeason, SEASON_WEEKS, solidarityOf, townBefore, unsettled, unsettledCalls, weatherOf } from '../season/store.js';
import { liveLine } from '../season/advisor.js';
import { answer, QUESTIONS } from '../season/answers.js';
import { onSignal } from '../signals.js';
import { ASK_ROWS, ASK_SIZE, drawAsk } from '../station/ask.js';
import { setLinesWaiting } from '../talk.js';
import { drawLine } from '../station/family.js';
import { setRoomGlow } from '../station/materials.js';
import { NOTCHES, TOCCO_IN, TOCCO_OUT } from '../station/tocco.js';

const LAMP_PROMPT = 'Now light the lamp.';
/** The question panel stays open this long, sits this far above his line, and its rows park this far below while closed. */
const ASK_SECONDS = 8;
const ASK_LIFT = 0.085;
const PARKED = 200;
/** Seconds a line stays up, and the least it stays before the next one in line replaces it. */
const LINE_SECONDS = 7;
const MIN_SECONDS = 3.2;
/** Seconds Tocco takes to ride out or back, and how far his door swings. */
const RIDE_SECONDS = 0.8;
const DOOR_OPEN = -1.6;

/**
 * Tocco, the Keeper's wooden advisor and rival. He rides out of his door
 * when the shutters open and back in when they close, and says one short
 * line at each turn of the week: what the view shows this morning, the
 * bell, the choice, the basket going down, Tessa's window, the evenings,
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
  private notches: Object3D[] = [];
  private line: Object3D | null = null;
  private lineTexture: CanvasTexture | null = null;
  private text = '';
  private lineTimer = 0;
  private shownFor = 0;
  /** Lines waiting their turn; a cue is an instruction for one phase of the week, dropped once the week moves on. */
  private lines: Array<{ text: string; cue: boolean }> = [];
  private out = 0;
  private glow = 0;
  private elapsed = 0;
  private lastPhase = '';
  private lastChosen = -1;
  private visitedHint = false;
  private toccoCall = 0;
  private askPanel: Object3D | null = null;
  private askTexture: CanvasTexture | null = null;
  private askRows: Object3D[] = [];
  /** Seconds the question panel has been open; -1 while closed. */
  private askOpen = -1;
  /** Bumped on every question, so a late live line never lands on a newer one. */
  private asked = 0;
  /** The last week was just kept and the season started over; the old notches come off next morning. */
  private seasonOver = false;

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.tocco = find('Tocco');
    this.door = find('ToccoDoor');
    this.up = find('ArrowUp');
    this.down = find('ArrowDown');
    this.lamp = find('SundayLamp') as Mesh | null;
    this.glass = find('SundayLampGlass') as Mesh | null;
    this.line = find('ToccoLine');
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
      // Poke him and his three questions show; poke one to ask it.
      onSignal('tocco', () => this.toggleAsk()),
      onSignal('ask0', () => this.ask(0)),
      onSignal('ask1', () => this.ask(1)),
      onSignal('ask2', () => this.ask(2)),
      onSignal('up', () => this.call(1)),
      onSignal('down', () => this.call(0)),
      onSignal('lamp', () => {
        const week = this.weekEntity();
        if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday || week.getValue(Week, 'lamp')) return;
        week.setValue(Week, 'lamp', true);
        this.drop(LAMP_PROMPT);
        this.cue('Close the shutters. Week kept.');
      }),
      onSignal('kept', () => this.keep()),
      // The latch was pulled while the basket is out: the shutters stay open.
      onSignal('busy', () => this.interrupt("Not while the basket's out.")),
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
      // An instruction still waiting from an earlier phase no longer fits, nor do open questions.
      this.lines = this.lines.filter((line) => !line.cue);
      this.placeAsk(false);
      this.onPhase(week, phase, this.lastPhase);
      this.lastPhase = phase;
    }
    if (phase === Phase.Choosing && chosen !== this.lastChosen && chosen >= 0) {
      const kind = realWeek(week.getValue(Week, 'week') ?? 1)?.kind;
      if (kind != null) this.cue(choiceLine(kind, chosen));
    }
    this.lastChosen = chosen;

    // Out with the shutters open, in once they close and he has had his say.
    const quiet = this.quiet();
    const wantOut = (open && !quiet) || (this.lineTimer > 0 && phase === Phase.Shut && this.text !== '');
    this.out += ((wantOut ? 1 : 0) - this.out) * Math.min(1, delta / (RIDE_SECONDS / 4));
    if (this.tocco != null) {
      this.tocco.position.x = TOCCO_IN.x + (TOCCO_OUT.x - TOCCO_IN.x) * this.out;
      this.tocco.position.y = TOCCO_OUT.y + (this.lineTimer > 0 ? 0.004 * Math.abs(Math.sin(this.elapsed * 9)) : 0);
    }
    if (this.door != null) this.door.rotation.y = DOOR_OPEN * Math.min(1, this.out * 3);

    if (this.lineTimer > 0) {
      this.lineTimer -= delta;
      this.shownFor += delta;
      const next = this.lines.length > 0 && this.shownFor >= MIN_SECONDS;
      if (next) this.show(this.lines.shift()?.text ?? '');
      else if (this.lineTimer <= 0 && this.lineTexture != null) drawLine(this.lineTexture, '');
    }
    if (this.line != null) this.line.visible = this.out > 0.9 && this.lineTimer > 0;
    if (this.askOpen >= 0) {
      this.askOpen += delta;
      if (this.askOpen > ASK_SECONDS || this.out < 0.9) this.placeAsk(false);
    }
    setLinesWaiting(this.lines.length > 0);

    // No calls in a solidarity week: the arrows stay down.
    const sunday = phase === Phase.Sunday && !quiet;
    const called = (week.getValue(Week, 'forecast') ?? -1) >= 0;
    if (this.up != null) this.up.visible = sunday;
    if (this.down != null) this.down.visible = sunday;
    const lit = week.getValue(Week, 'lamp') ?? false;
    const glowTarget = lit ? 1 : 0;
    if (this.glow !== glowTarget) {
      this.glow += (glowTarget - this.glow) * Math.min(1, delta * 2);
      if (Math.abs(glowTarget - this.glow) < 0.002) this.glow = glowTarget;
      setRoomGlow(this.glow);
    }
    const glass = this.glass?.material as MeshBasicMaterial | undefined;
    if (glass != null) {
      glass.color.setRGB(0.6 + 0.4 * this.glow, 0.64 + 0.2 * this.glow, 0.66 - 0.2 * this.glow);
      glass.opacity = 0.35 + 0.55 * this.glow;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2);
    shine(this.up as Mesh | null, sunday && !called ? pulse : 0);
    shine(this.down as Mesh | null, sunday && !called ? pulse : 0);
    shine(this.lamp, sunday && called && !lit ? pulse : 0);
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
        if (previous === Phase.Shut) this.morning(n);
        break;
      case Phase.Bell:
        this.cue('Hear the bell? Pull the rope.');
        break;
      case Phase.Choosing:
        this.cue('Pick one, or send it empty.');
        break;
      case Phase.Lowering:
        this.cue('Lean out. Watch it land.');
        break;
      case Phase.Landed:
        this.cue(n <= 2 ? "That's Tessa's window. Reach for it." : "Tessa's window. See how they are.");
        this.visitedHint = false;
        break;
      case Phase.Days:
        if (!this.visitedHint && n === 1) this.cue('Each notch is an evening.');
        this.visitedHint = true;
        break;
      case Phase.Sunday: {
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
      unsettledCalls().forEach(({ week: k, kept }, i) => {
        const last = realWeek(k);
        if (last == null) return;
        const went = actual(last);
        this.say(settledLine(last, went, i === 0));
        this.say(notchLine(kept.call === went, kept.tocco === went, kept.call >= 0));
      });
      const before = townBefore();
      markSettled();
      this.carve(town);
      this.newStages(before, town);
    }
    if (real == null) return;
    this.say(morningLine(real));
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
    if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday || this.quiet()) return;
    week.setValue(Week, 'forecast', direction);
    this.cue(`${direction === 1 ? 'Up' : 'Down'}, you say. Noted.`);
    if (!week.getValue(Week, 'lamp')) this.cue(LAMP_PROMPT);
  }

  /** The shutters closed on Sunday: the week is kept with its choice and calls, settled next morning. */
  private keep(): void {
    const week = this.weekEntity();
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const quiet = this.quiet();
    keepWeek({
      chosen: week.getValue(Week, 'chosen') ?? -1,
      call: quiet ? -1 : (week.getValue(Week, 'forecast') ?? -1),
      tocco: quiet ? -1 : this.toccoCall,
      ...(quiet ? { aid: true } : {}),
    });
    week.setValue(Week, 'forecast', -1);
    this.interrupt(`Week ${n} kept.`);
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

  private toggleAsk(): void {
    if (this.askOpen >= 0) {
      this.placeAsk(false);
      return;
    }
    if (this.quiet() || this.out < 0.9) return;
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
    const panel = this.askPanel;
    const line = this.line;
    if (panel == null || line == null) return;
    panel.visible = open;
    panel.quaternion.copy(line.quaternion);
    panel.position.set(0, ASK_LIFT, 0).applyQuaternion(line.quaternion).add(line.position);
    this.askRows.forEach((row, i) => {
      row.quaternion.copy(line.quaternion);
      row.position.set(0, ASK_LIFT + (1 - i) * (ASK_SIZE.h / ASK_ROWS), 0).applyQuaternion(line.quaternion).add(line.position);
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

  private show(text: string): void {
    this.text = text;
    this.lineTimer = text === '' ? 0 : LINE_SECONDS;
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
