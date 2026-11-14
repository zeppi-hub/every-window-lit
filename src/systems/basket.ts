import { createSystem, type Entity, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { Choice, Phase, Week } from '../components.js';
import { beginWeek, canChoose, currentTown, globeChoice, keepWeek, markSettled, noteGlobe, restartSeason, saidThisSeason, SEASON_WEEKS, solidarityOf } from '../season/store.js';
import { basketTrip, giftDue, GIFT_REST, globeAt, setBasketTrip, setGlobeAt, TOWN_REST, townDue, undecided } from '../globe.js';
import { conducting } from './festival.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { lineIsFresh, linesWaiting, replyWaiting, revealHeld, setWrongThing, windowLight } from '../talk.js';
import { choiceStep } from '../choice-moment.js';
import { firstWeek, latchMove, type LockFacts, leverFree, leverMove, pullsNeeded, ropeMove } from '../week-locks.js';
import { bellRings, morningPaused } from '../bell.js';
import { aidCard, aidSailed, setAidCard } from '../aid.js';
import { BASKET_AT_WINDOW, BASKET_HANDLE, BASKET_ON_SQUARE, LEVER_GRIP, LEVER_PIVOT, PULLEY, swingPoint as swing } from '../station/basket.js';
import { BASKET_ON_SILL } from '../station/layout.js';
import { RESTART_WEEK } from '../restart.js';

/** As the bell rings, the rope beside the window twitches three times, so the eye finds it. */
const TWITCHES = 3;
const TWITCH_SECONDS = 0.45;
const TWITCH_DEPTH = 0.022;
/** How long the basket flashes when something goes in. */
const FLASH_SECONDS = 0.4;
/** In a solidarity week the basket comes up by itself, one third every this many seconds. */
const AID_HAUL_SECONDS = 1.3;
/** The second basket's climb, and its rest on the sill while the card is taken out. */
const HAUL_UP_SECONDS = 3.9;
const HAUL_REST = 2.4;
/** Each pull hauls the basket a third of the way up the tower at this rate (per second, exponential). */
const HAUL_RATE = 2.2;
/** Swinging in over the sill or back out, and the drop to the square when the brake is released. */
const SWING_SECONDS = 0.9;
const DROP_SECONDS = 3;
/** The last evening on the sun's rail. */
const SUNDAY = 6;
/** The week the key to the stairs comes to the sill. */
const KEY_WEEK = 2;
/** Seconds after the latch moves in which another latch signal is the same touch heard twice (no hand slides it back so fast). */
const LATCH_ONCE = 1;
/** The lever's throw when poked, and how long it takes to come back. */
const LEVER_THROW = 0.55;
/** The grip's direction from the lever's pivot at rest. */
const GRIP_REST_ANGLE = Math.atan2(LEVER_GRIP.y - LEVER_PIVOT.y, LEVER_GRIP.x - LEVER_PIVOT.x);
const LEVER_SECONDS = 0.45;
/** In the first week, touched out of turn: how long the thing to touch glows brighter, once. */
const RIGHT_FLASH = 0.6;

const DOWN = new Vector3(0, -1, 0);

/**
 * Runs the week at the window: shutters open → morning → the bell →
 * a pull on the rope hauls the basket up and swings it onto the sill →
 * the Keeper chooses → the brake lever lowers it back to the square.
 * The week's evenings follow on the sun slider (SunSystem); closing the
 * shutters on Sunday ends the week. Also moves the basket and
 * stretches its rope, throws the lever when poked, and makes whatever the
 * Keeper should touch next glow softly.
 *
 * While the Keeper is down in the town, or has closed the shutters for a
 * while, the week waits: the morning does not run on, and the rope and the
 * brake do nothing until the shutters are open again.
 */
export class BasketSystem extends createSystem({
  week: { required: [Week] },
  choices: { required: [Choice] },
}) {
  private rope: Object3D | null = null;
  private key: Mesh | null = null;
  private keyCalled = false;
  private ring: Mesh | null = null;
  /** The door leaf's hidden pane for a hand's ray, shown only while walking. */
  private ringTarget: Object3D | null = null;
  private toggle: Mesh | null = null;
  private latch: Mesh | null = null;
  private twitch = Infinity;
  private flash = 0;
  private flashChosen = -1;
  private toggleY = 0;
  private lever: Object3D | null = null;
  private grip: Object3D | null = null;
  private leverTime = Infinity;
  /** The family's box: while it is in the Keeper's window, the morning waits. */
  private familyBox: Object3D | null = null;
  /** Seconds since the week's call on the climax's Sunday (-1 before it), and seconds into that Sunday. */
  private calledFor = -1;
  private sundayFor = 0;
  /** A basket's own trip (the solidarity week's second basket, the third morning's globe, the town's note): seconds into its trip (-1 when not travelling), whether it has been, and for which week. */
  private haul = -1;
  private hauled = false;
  /** Whether this trip's basket has reached the sill. */
  private rested = false;
  private haulWeek = -1;
  private elapsed = 0;
  /** When the latch last moved, for LATCH_ONCE (this.elapsed). */
  private latchAt = Number.NEGATIVE_INFINITY;
  private from = new Vector3();
  private target = new Vector3();
  private handle = new Vector3();
  private span = new Vector3();
  /** Dev build: when the latch last opened the shutters (ms), so the bell's line can say how long after it rang. */
  private latchedAt = 0;
  /** Dev build: whether the latch glowed last frame to close the week, so each change is logged once. */
  private closingGlow = false;
  /** What a touch on the latch, the rope or the lever needs to know of the week, filled when asked (no allocation). */
  private facts: LockFacts = { week: 1, phase: Phase.Shut, open: false, chosen: -1, lamp: false, reply: false, last: false, aid: false, aidCardIn: false, hauling: false, conducting: false, boxIn: false };
  /** Seconds left of the first week's brighter glow on the thing to touch, after a touch out of turn. */
  private rightFlash = 0;

  init(): void {
    const scene = this.world.scene;
    this.rope = scene.getObjectByName('BasketRope') ?? null;
    this.toggle = (scene.getObjectByName('RopeToggleMesh') as Mesh | undefined) ?? null;
    this.latch = (scene.getObjectByName('Latch') as Mesh | undefined) ?? null;
    this.toggleY = this.toggle?.position.y ?? 0;
    this.lever = scene.getObjectByName('BrakeLever') ?? null;
    this.grip = scene.getObjectByName('BrakeGrip') ?? null;
    this.familyBox = scene.getObjectByName('FamilyBox') ?? null;
    this.key = (scene.getObjectByName('TowerKey') as Mesh | undefined) ?? null;
    this.ring = (scene.getObjectByName('TowerDoorRing') as Mesh | undefined) ?? null;
    this.ringTarget = scene.getObjectByName('TowerDoorTarget') ?? null;
    this.cleanupFuncs.push(
      onSignal('latch', () => this.onLatch()),
      // A haul on the rope counts while the bell has rung (one brings the basket up, the first week too); out of turn the
      // rope answers dully.
      onSignal('rope', () => {
        const week = this.weekEntity();
        if (week == null) return;
        const f = this.lockFacts(week);
        if (ropeMove(f) === 'wrong') {
          this.wrong('RopeToggleMesh', f);
          return;
        }
        const pulls = (week.getValue(Week, 'pulls') ?? 0) + 1;
        week.setValue(Week, 'pulls', pulls);
        if (import.meta.env.DEV) console.info(`[basket] haul ${pulls} of ${pullsNeeded(f.week, f.aid)} at ${(performance.now() / 1000).toFixed(3)} s`);
        emitSignal('pulled');
        if (pulls >= pullsNeeded(f.week, f.aid)) this.enter(week, Phase.Rising);
      }),
      // The brake: the basket goes down; in the first week not empty, nor out of turn (the lever does not move).
      onSignal('lower', () => {
        const week = this.weekEntity();
        if (week == null) return;
        const f = this.lockFacts(week);
        const move = leverMove(f);
        if (move === 'send') {
          // The glass goes down in the town's basket: no taking it back.
          this.leverTime = 0;
          emitSignal('brake');
          noteGlobe('sent');
          return;
        }
        if (move === 'lower' || move === 'idle') {
          this.leverTime = 0;
          emitSignal('brake');
          if (move === 'lower') this.enter(week, Phase.Lowering);
          return;
        }
        if (move === 'empty') emitSignal('empty');
        this.wrong('BrakeLever', f);
      }),
      onSignal('restart', () => this.restart()),
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    const basket = week?.object3D;
    if (week == null || basket == null) return;
    const phase = week.getValue(Week, 'phase');
    // Down in the town, or behind closed shutters, the morning waits for the Keeper, and so does a solidarity
    // week's basket on its way up; moving parts finish their motion. The morning waits for the family's box too: its
    // lines and Lina's greeting come once the box has gone, and the bell after them (bell.ts).
    const aid = solidarityOf(week.getValue(Week, 'week') ?? 1) != null;
    const walking = stance() === 'walk';
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const waiting =
      (phase === Phase.Morning && morningPaused(walking, open, this.familyBox?.visible ?? false)) || (phase === Phase.Bell && aid && (walking || !open));
    const timer = (week.getValue(Week, 'timer') ?? 0) + (waiting ? 0 : delta);
    week.setValue(Week, 'timer', timer);
    // The bell waits for Tocco's lines (those the family's box holds back too), last week's answer held for its chime
    // and Lina's greeting, never longer than the morning's limit (bell.ts); in the first week, for his opening line up
    // to have been read as well.
    const first = (week.getValue(Week, 'week') ?? 1) === 1;
    const held = linesWaiting() || revealHeld() || windowLight().state === 'greet' || (first && lineIsFresh());
    if (phase === Phase.Morning && !waiting && this.haul < 0 && bellRings(timer, first, held)) {
      // The third morning's basket comes first, by itself, with no bell: the bell rings once it is back down.
      if (giftDue(week.getValue(Week, 'week') ?? 1, this.hauled)) this.setOut(basket, 'gift');
      else this.enter(week, Phase.Bell);
    }
    // In a solidarity week no bell rings: someone below hauls the basket up, a third at a time.
    if (phase === Phase.Bell && aid && !waiting) {
      const pulls = week.getValue(Week, 'pulls') ?? 0;
      if (timer >= AID_HAUL_SECONDS * (pulls + 1)) {
        week.setValue(Week, 'pulls', pulls + 1);
        if (pulls + 1 >= pullsNeeded(week.getValue(Week, 'week') ?? 1, true)) this.enter(week, Phase.Rising);
      }
    }

    this.placeBasket(week, basket, phase ?? Phase.Shut, timer, delta);
    this.secondBasket(week, basket, phase ?? Phase.Shut, delta);
    this.stretchRope(basket);
    this.throwLever(delta, leverFree(this.lockFacts(week)));
    if (this.rightFlash > 0) this.rightFlash = Math.max(0, this.rightFlash - delta);
    this.glow(week, phase ?? Phase.Shut, delta);
    this.twitchRope(delta);
  }

  /** Three short tugs on the rope's handle (the mesh only; the handle itself stays where PullHandleSystem keeps it). */
  private twitchRope(delta: number): void {
    if (this.toggle == null || this.twitch > TWITCHES * TWITCH_SECONDS) return;
    this.twitch += delta;
    const k = this.twitch / TWITCH_SECONDS;
    const dip = k < TWITCHES ? Math.sin(Math.PI * (k - Math.floor(k))) ** 2 : 0;
    this.toggle.position.y = this.toggleY - TWITCH_DEPTH * dip;
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  private enter(week: Entity, phase: (typeof Phase)[keyof typeof Phase]): void {
    if (phase === Phase.Bell && solidarityOf(week.getValue(Week, 'week') ?? 1) == null) this.twitch = 0;
    if (import.meta.env.DEV && phase === Phase.Bell) {
      const now = performance.now();
      console.info(`[basket] bell at ${(now / 1000).toFixed(2)} s, ${((now - this.latchedAt) / 1000).toFixed(2)} s after the latch, week ${week.getValue(Week, 'week')}`);
    }
    week.setValue(Week, 'phase', phase);
    week.setValue(Week, 'timer', 0);
    if (week.object3D != null) this.from.copy(week.object3D.position);
  }

  /** What a touch needs to know of the week as it stands (week-locks.ts), filled into one object. */
  private lockFacts(week: Entity): LockFacts {
    const f = this.facts;
    const n = week.getValue(Week, 'week') ?? 1;
    f.week = n;
    f.phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    f.open = week.getValue(Week, 'shuttersOpen') ?? false;
    f.chosen = week.getValue(Week, 'chosen') ?? -1;
    f.lamp = week.getValue(Week, 'lamp') ?? false;
    f.reply = replyWaiting();
    f.last = n === SEASON_WEEKS;
    f.aid = solidarityOf(n) != null;
    f.aidCardIn = aidCard() === 'sill';
    f.hauling = this.haul >= 0;
    f.conducting = conducting();
    f.boxIn = this.familyBox?.visible ?? false;
    f.choiceReady = choiceStep(n, f.phase, week.getValue(Week, 'timer') ?? 0, f.chosen, f.aid) === 'choose';
    f.lastLines = linesWaiting();
    f.undecided = undecided(n, f.phase === Phase.Sunday, globeChoice() != null);
    f.loaded = globeAt() === 'load' && basketTrip() === 'town' && globeChoice() == null;
    return f;
  }

  /**
   * Something touched out of turn: a dull sound from it (SoundSystem); in the first week the thing to touch glows
   * brighter once (below) and the ghost hand shows it at once (HintSystem).
   */
  private wrong(name: string, f: LockFacts): void {
    const first = firstWeek(f);
    if (import.meta.env.DEV) console.info(`[basket] ${name} touched out of turn in ${f.phase}, week ${f.week}${first ? ': the thing to touch glows' : ''}`);
    setWrongThing(name);
    emitSignal('wrong');
    if (first) this.rightFlash = RIGHT_FLASH;
  }

  /**
   * The latch: a closed window opens on a morning; closing it on Sunday ends
   * the week. While the basket is coming up, on the sill or going down, the
   * shutters stay open: they would swing through it and its rope.
   */
  private onLatch(): void {
    const week = this.weekEntity();
    if (week == null) return;
    // One touch, one move: a fingertip's press can fire both the latch's button (as the press ends) and its handle's
    // tap (as its hold ends, PullHandleSystem); the second, a moment later, would close what the first opened.
    if (this.elapsed - this.latchAt < LATCH_ONCE) {
      if (import.meta.env.DEV) console.info(`[basket] latch again ${(this.elapsed - this.latchAt).toFixed(2)} s after the last: the same touch, not heard`);
      return;
    }
    this.latchAt = this.elapsed;
    const f = this.lockFacts(week);
    switch (latchMove(f)) {
      case 'busy':
        emitSignal('busy');
        return;
      // The solidarity week is not kept until its card has come; in the first week the latch only sends the family's
      // box home (FamilySystem). Nothing to say to either.
      case 'wait':
        if (import.meta.env.DEV) console.info(`[basket] latch in ${f.phase}, week ${f.week}: ${f.boxIn ? "the family's box goes home, nothing said" : 'waits for the card'}`);
        return;
      case 'notYet':
        // The very first week closes only once its lamp is lit and Lina has answered it: the first session sees its
        // whole week. The last Sunday waits for its lamp too, or the last night never comes. Tocco says so, and the
        // thing to touch next shows at once (week-locks.ts).
        if (import.meta.env.DEV) console.info(`[basket] latch in week ${f.week}, ${f.phase}${f.phase === Phase.Sunday ? ' before the lamp' : ''}: not yet, the shutters stay open`);
        emitSignal('notyet');
        this.wrong('Latch', f);
        return;
      case 'reply':
        // While the town waits for Lina's answer to the lamp: she answers now, then the shutters can close.
        if (import.meta.env.DEV) console.info("[basket] latch waits for Lina's answer: the shutters stay open");
        emitSignal('reply');
        return;
      case 'hurry':
        // While the last night's windows are still being lit: the rest come on now, then the shutters can close.
        emitSignal('hurry');
        return;
      default:
        break;
    }
    const open = !f.open;
    week.setValue(Week, 'shuttersOpen', open);
    const phase = week.getValue(Week, 'phase');
    if (import.meta.env.DEV) {
      if (open) this.latchedAt = performance.now();
      console.info(`[basket] latch ${open ? 'opens' : 'closes'} at ${(performance.now() / 1000).toFixed(2)} s, phase ${phase}`);
    }
    if (open && phase === Phase.Shut) {
      beginWeek();
      this.enter(week, Phase.Morning);
    }
    if (!open && phase === Phase.Sunday) {
      // Tocco keeps the week, with its choice and calls, before they are cleared; the season moves on.
      emitSignal('kept');
      week.setValue(Week, 'week', currentTown().week);
      week.setValue(Week, 'pulls', 0);
      week.setValue(Week, 'chosen', -1);
      week.setValue(Week, 'day', -1);
      week.setValue(Week, 'lamp', false);
      this.enter(week, Phase.Shut);
    }
  }

  /**
   * The season starts over from the start page (index.ts startOver): the
   * week goes back to where a fresh load starts it (restart.ts), shutters
   * shut, and the basket waits on the square; nothing of the old week is
   * still on its way (the solidarity week's second basket, the lever's
   * swing, the rope's tugs, the wicker's flash).
   */
  restart(): void {
    this.twitch = Infinity;
    this.latchAt = Number.NEGATIVE_INFINITY;
    if (this.toggle != null) this.toggle.position.y = this.toggleY;
    this.flash = 0;
    this.flashChosen = -1;
    this.leverTime = Infinity;
    this.haul = -1;
    this.hauled = false;
    this.haulWeek = -1;
    this.calledFor = -1;
    this.sundayFor = 0;
    setBasketTrip('none');
    this.closingGlow = false;
    this.rightFlash = 0;
    const week = this.weekEntity();
    if (week == null) return;
    if (import.meta.env.DEV) {
      const open = week.getValue(Week, 'shuttersOpen') ? 'open' : 'shut';
      console.info(`[basket] restart from week ${week.getValue(Week, 'week')}, ${week.getValue(Week, 'phase')}, shutters ${open}, chosen ${week.getValue(Week, 'chosen')}, day ${week.getValue(Week, 'day')}`);
    }
    week.setValue(Week, 'week', RESTART_WEEK.week);
    week.setValue(Week, 'pulls', RESTART_WEEK.pulls);
    week.setValue(Week, 'chosen', RESTART_WEEK.chosen);
    week.setValue(Week, 'day', RESTART_WEEK.day);
    week.setValue(Week, 'forecast', RESTART_WEEK.forecast);
    week.setValue(Week, 'lamp', RESTART_WEEK.lamp);
    week.setValue(Week, 'shuttersOpen', RESTART_WEEK.shuttersOpen);
    // The sample season starts further on (index.ts).
    if (currentTown().week !== RESTART_WEEK.week) week.setValue(Week, 'week', currentTown().week);
    week.object3D?.position.set(BASKET_ON_SQUARE.x, BASKET_ON_SQUARE.y, BASKET_ON_SQUARE.z);
    // The phase last: its timer goes back to RESTART_WEEK.timer with it.
    this.enter(week, Phase.Shut);
  }

  /** The sample season's last night: straight to the week's Sunday, the shutters open, nothing chosen. */
  toSunday(): void {
    const week = this.weekEntity();
    if (week == null) return;
    beginWeek();
    week.setValue(Week, 'day', SUNDAY);
    week.setValue(Week, 'shuttersOpen', true);
    this.enter(week, Phase.Sunday);
  }

  /** Dev keys only (dev-tools.ts): keeps the week as it stands, with nothing chosen and no calls, and closes the shutters on the next. Empty when shipped. */
  devSkipWeek(): void {
    if (!import.meta.env.DEV) return;
    const week = this.weekEntity();
    if (week == null) return;
    keepWeek({ chosen: -1, call: -1, tocco: -1, ...(solidarityOf() != null ? { aid: true } : {}) });
    markSettled();
    if (currentTown().week > SEASON_WEEKS) restartSeason();
    week.setValue(Week, 'week', currentTown().week);
    week.setValue(Week, 'pulls', 0);
    week.setValue(Week, 'chosen', -1);
    week.setValue(Week, 'day', -1);
    week.setValue(Week, 'forecast', -1);
    week.setValue(Week, 'lamp', false);
    week.setValue(Week, 'shuttersOpen', false);
    this.enter(week, Phase.Shut);
  }

  private placeBasket(week: Entity, basket: Object3D, phase: string, timer: number, delta: number): void {
    const p = basket.position;
    switch (phase) {
      case Phase.Rising: {
        // Up the last third, then a short arc in over the sill.
        const up = timer / SWING_SECONDS;
        if (up < 1) {
          this.target.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y, BASKET_AT_WINDOW.z);
          p.lerpVectors(this.from, this.target, ease(up));
        } else {
          const s = Math.min(1, up - 1);
          swing(p, s);
          if (s >= 1) this.enter(week, Phase.Choosing);
        }
        return;
      }
      case Phase.Choosing:
        p.set(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);
        return;
      case Phase.Lowering: {
        const out = timer / SWING_SECONDS;
        if (out < 1) {
          swing(p, 1 - ease(out));
        } else {
          const d = Math.min(1, (timer - SWING_SECONDS) / DROP_SECONDS);
          p.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y + (BASKET_ON_SQUARE.y - BASKET_AT_WINDOW.y) * ease(d), BASKET_AT_WINDOW.z);
          if (d >= 1) this.enter(week, Phase.Landed);
        }
        return;
      }
      default: {
        // On the square, or partway up the tower face after one or two pulls.
        const pulls = phase === Phase.Bell ? (week.getValue(Week, 'pulls') ?? 0) : 0;
        const y = BASKET_ON_SQUARE.y + ((BASKET_AT_WINDOW.y - BASKET_ON_SQUARE.y) * pulls) / 3;
        const blend = 1 - Math.exp(-HAUL_RATE * delta);
        p.x = BASKET_ON_SQUARE.x;
        p.z = BASKET_ON_SQUARE.z;
        p.y += (y - p.y) * blend;
        if (Math.abs(y - p.y) < 0.002) p.y = y;
      }
    }
  }

  /**
   * In a solidarity week the price card comes on a second basket, once the
   * van has taken the help away: it hauls itself up, rests on the sill
   * while the card is taken out, and goes back down.
   */
  private secondBasket(week: Entity, basket: Object3D, phase: string, delta: number): void {
    const n = week.getValue(Week, 'week') ?? 1;
    if (n !== this.haulWeek) {
      this.haulWeek = n;
      this.haul = -1;
      this.hauled = false;
      this.calledFor = -1;
      this.sundayFor = 0;
      setBasketTrip('none');
    }
    const after = phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday;
    if (this.haul < 0) {
      // It waits for the shutters to be open: it would swing in through them.
      const open = week.getValue(Week, 'shuttersOpen') ?? false;
      const sunday = phase === Phase.Sunday;
      if (sunday) this.sundayFor += delta;
      if (sunday && (week.getValue(Week, 'forecast') ?? -1) >= 0) this.calledFor = Math.max(0, this.calledFor) + delta;
      if (townDue(n, sunday, open, this.hauled, this.calledFor, this.sundayFor)) this.setOut(basket, 'town');
      else if (!this.hauled && after && aidSailed() && solidarityOf(n) != null && open) this.setOut(basket, 'aid');
      if (this.haul < 0) return;
    }
    const trip = basketTrip();
    this.haul += delta;
    const up = HAUL_UP_SECONDS;
    const inAt = up + SWING_SECONDS;
    const rest = trip === 'gift' ? GIFT_REST : trip === 'town' ? TOWN_REST : HAUL_REST;
    // The town's basket waits on the sill for the choice, however long it takes.
    if (trip === 'town' && this.haul > inAt && globeChoice() == null) this.haul = inAt;
    const t = this.haul;
    const p = basket.position;
    const outAt = inAt + rest;
    const downAt = outAt + SWING_SECONDS;
    // A globe not taken stays on the sill as the basket leaves, however long a frame took (a headset menu can stall a second or more).
    if (t >= outAt && globeAt() === 'basket') setGlobeAt('sill');
    if (t < up) {
      this.target.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y, BASKET_AT_WINDOW.z);
      p.lerpVectors(this.from, this.target, ease(t / up));
      if (trip === 'aid') setAidCard('basket');
    } else if (t < inAt) {
      swing(p, (t - up) / SWING_SECONDS);
    } else if (t < outAt) {
      p.set(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);
      if (!this.rested) {
        this.rested = true;
        if (trip === 'gift') emitSignal('gift');
        if (trip === 'town') emitSignal('townAsks');
      }
      if (trip === 'aid' && t > inAt + HAUL_REST * 0.6) setAidCard('sill');
    } else if (t < downAt) {
      swing(p, 1 - ease((t - outAt) / SWING_SECONDS));
    } else {
      const d = Math.min(1, (t - downAt) / DROP_SECONDS);
      p.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y + (BASKET_ON_SQUARE.y - BASKET_AT_WINDOW.y) * ease(d), BASKET_AT_WINDOW.z);
      if (d >= 1) {
        this.haul = -1;
        this.hauled = true;
        if (globeAt() === 'load') setGlobeAt('gone');
        setBasketTrip('none');
      }
    }
  }

  /** A basket's own trip sets out from the square. */
  private setOut(basket: Object3D, trip: 'aid' | 'gift' | 'town'): void {
    this.haul = 0;
    this.rested = false;
    this.from.copy(basket.position);
    setBasketTrip(trip);
    if (trip === 'gift') setGlobeAt('basket');
  }

  /** The rope runs from the pulley to the basket's handle, slanting in through the window when it is on the sill. */
  private stretchRope(basket: Object3D): void {
    if (this.rope == null) return;
    this.handle.set(basket.position.x, basket.position.y + BASKET_HANDLE, basket.position.z);
    this.span.set(this.handle.x - PULLEY[0], this.handle.y - PULLEY[1], this.handle.z - PULLEY[2]);
    const length = this.span.length();
    this.rope.scale.set(1, Math.max(0.001, length), 1);
    if (length > 1e-4) this.rope.quaternion.setFromUnitVectors(DOWN, this.span.divideScalar(length));
  }

  /**
   * The lever turns to point at its grip while it is pulled (only while it is free to: week-locks.ts), and swings
   * once more when the brake is let off.
   */
  private throwLever(delta: number, free: boolean): void {
    if (this.lever == null) return;
    let throwAngle = 0;
    if (this.leverTime <= LEVER_SECONDS) {
      this.leverTime += delta;
      throwAngle = -LEVER_THROW * Math.sin(Math.PI * Math.min(1, this.leverTime / LEVER_SECONDS));
    }
    let pullAngle = 0;
    const grip = this.grip;
    if (grip != null && free) {
      const now = Math.atan2(grip.position.y - LEVER_PIVOT.y, grip.position.x - LEVER_PIVOT.x);
      pullAngle = Math.max(-LEVER_THROW * 1.4, Math.min(0, now - GRIP_REST_ANGLE));
    }
    this.lever.rotation.z = Math.min(throwAngle, pullAngle);
  }

  /** A slow warm pulse on whatever comes next: the rope, the three objects, then the lever. */
  private glow(week: Entity, phase: string, delta: number): void {
    // In the first week, after a touch out of turn, whatever invites a touch glows brighter, once.
    const flash = this.rightFlash > 0 ? 1.8 * Math.sin(Math.PI * (1 - this.rightFlash / RIGHT_FLASH)) : 0;
    const pulse = Math.max(flash, 0.5 + 0.5 * Math.sin(this.elapsed * 3.2));
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    // Something going into the basket: a short warm flash on the wicker, with the sound (SoundSystem).
    if (phase === Phase.Choosing && chosen !== this.flashChosen && chosen >= 0) this.flash = FLASH_SECONDS;
    this.flashChosen = chosen;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - delta);
    shine(week.object3D as Mesh | undefined, this.flash / FLASH_SECONDS);
    const choosing = phase === Phase.Choosing;
    const aid = solidarityOf(week.getValue(Week, 'week') ?? 1) != null;
    shine(this.toggle, phase === Phase.Bell && !aid ? pulse : 0);
    // The second week's key: the way to the square. Down there, the ring on the door is the way back. It calls only once
    // Tocco's line has said both (KEY_LINE: his panel stays at the window, so it cannot be read on the square), and until
    // the week's Sunday is done.
    const week2 = (week.getValue(Week, 'week') ?? 1) === KEY_WEEK;
    // Only while it calls: the rest of the time its glow is PokeButtonSystem's, answering a touch.
    const keyCalls = week2 && saidThisSeason('key') && (phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday) && stance() === 'seat';
    if (keyCalls || this.keyCalled) shine(this.key, keyCalls ? pulse * 0.6 : 0);
    this.keyCalled = keyCalls;
    shine(this.ring, stance() === 'walk' ? pulse : 0);
    // The door leaf's hidden pane takes a ray only down there: from the seat a ray through the sill must not find it.
    if (this.ringTarget != null) this.ringTarget.visible = stance() === 'walk';
    // The latch, whenever it is the next thing to touch: closed shutters to open, or Sunday's end to close them.
    const shut = !(week.getValue(Week, 'shuttersOpen') ?? false);
    // Not while the town waits for Lina's answer to the lamp: the latch glows once she has answered.
    const lastNight = (week.getValue(Week, 'week') ?? 1) === SEASON_WEEKS && (conducting() || linesWaiting());
    const closing = phase === Phase.Sunday && !lastNight && (aid ? aidCard() === 'sill' : (week.getValue(Week, 'lamp') ?? false) && !replyWaiting());
    shine(this.latch, shut || closing ? pulse : 0);
    if (import.meta.env.DEV && closing !== this.closingGlow) {
      this.closingGlow = closing;
      console.info(`[basket] latch ${closing ? 'glows to close the week' : 'stops glowing to close'}`);
    }
    shine(this.lever?.children[0] as Mesh | undefined, (choosing && chosen >= 0) || this.lockFacts(week).loaded === true ? pulse : 0);
    // Only the options the jar can pay for invite a touch; the others stay dim.
    // In turn, left to right, so each reads as its own invitation; in the first week only once the card and the jar have
    // had their turn (choice-moment.ts), so each step has its one glow.
    const n = week.getValue(Week, 'week') ?? 1;
    const ready = choiceStep(n, phase, week.getValue(Week, 'timer') ?? 0, chosen, aid) === 'choose';
    for (const entity of this.queries.choices.entities) {
      const index = entity.getValue(Choice, 'index') ?? 0;
      const open = canChoose(index);
      const turn = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2 - index * 2.1);
      shine(entity.object3D as Mesh | undefined, choosing && ready && chosen < 0 && open ? Math.max(flash, turn * 0.7) : 0);
    }
  }
}

function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function shine(mesh: Mesh | null | undefined, amount: number): void {
  const material = mesh?.material as MeshStandardMaterial | undefined;
  if (material?.emissive == null) return;
  material.emissive.setRGB(0.32 * amount, 0.24 * amount, 0.1 * amount);
}
