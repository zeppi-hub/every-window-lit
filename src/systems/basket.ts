import { createSystem, type Entity, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { Choice, Phase, Week } from '../components.js';
import { beginWeek, canChoose, currentTown, keepWeek, markSettled, restartSeason, SEASON_WEEKS, solidarityOf } from '../season/store.js';
import { conducting } from './festival.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { lineIsFresh, linesWaiting, replyWaiting, revealHeld, windowLight } from '../talk.js';
import { bellRings, morningPaused } from '../bell.js';
import { aidCard, aidSailed, setAidCard } from '../aid.js';
import { BASKET_AT_WINDOW, BASKET_HANDLE, BASKET_ON_SQUARE, LEVER_GRIP, LEVER_PIVOT, PULLEY } from '../station/basket.js';
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
/** The lever's throw when poked, and how long it takes to come back. */
const LEVER_THROW = 0.55;
/** The grip's direction from the lever's pivot at rest. */
const GRIP_REST_ANGLE = Math.atan2(LEVER_GRIP.y - LEVER_PIVOT.y, LEVER_GRIP.x - LEVER_PIVOT.x);
const LEVER_SECONDS = 0.45;
const PULLS = 3;

const DOWN = new Vector3(0, -1, 0);

/**
 * Runs the week at the window: shutters open → morning → the bell →
 * three pulls on the rope haul the basket up and swing it onto the sill →
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
  /** The solidarity week's second basket: seconds into its trip (-1 when not travelling), whether it has been, and for which week. */
  private haul = -1;
  private hauled = false;
  private haulWeek = -1;
  private elapsed = 0;
  private from = new Vector3();
  private target = new Vector3();
  private handle = new Vector3();
  private span = new Vector3();
  /** Dev build: when the latch last opened the shutters (ms), so the bell's line can say how long after it rang. */
  private latchedAt = 0;
  /** Dev build: whether the latch glowed last frame to close the week, so each change is logged once. */
  private closingGlow = false;

  init(): void {
    const scene = this.world.scene;
    this.rope = scene.getObjectByName('BasketRope') ?? null;
    this.toggle = (scene.getObjectByName('RopeToggleMesh') as Mesh | undefined) ?? null;
    this.latch = (scene.getObjectByName('Latch') as Mesh | undefined) ?? null;
    this.toggleY = this.toggle?.position.y ?? 0;
    this.lever = scene.getObjectByName('BrakeLever') ?? null;
    this.grip = scene.getObjectByName('BrakeGrip') ?? null;
    this.familyBox = scene.getObjectByName('FamilyBox') ?? null;
    this.cleanupFuncs.push(
      onSignal('latch', () => this.onLatch()),
      onSignal('rope', () => {
        const week = this.weekEntity();
        if (week == null || week.getValue(Week, 'phase') !== Phase.Bell || !week.getValue(Week, 'shuttersOpen')) return;
        const pulls = (week.getValue(Week, 'pulls') ?? 0) + 1;
        week.setValue(Week, 'pulls', pulls);
        if (pulls >= PULLS) this.enter(week, Phase.Rising);
      }),
      onSignal('lower', () => {
        this.leverTime = 0;
        const week = this.weekEntity();
        if (week != null && week.getValue(Week, 'phase') === Phase.Choosing && week.getValue(Week, 'shuttersOpen')) this.enter(week, Phase.Lowering);
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
    if (phase === Phase.Morning && bellRings(timer, first, held)) this.enter(week, Phase.Bell);
    // In a solidarity week no bell rings: someone below hauls the basket up, a third at a time.
    if (phase === Phase.Bell && aid && !waiting) {
      const pulls = week.getValue(Week, 'pulls') ?? 0;
      if (timer >= AID_HAUL_SECONDS * (pulls + 1)) {
        week.setValue(Week, 'pulls', pulls + 1);
        if (pulls + 1 >= PULLS) this.enter(week, Phase.Rising);
      }
    }

    this.placeBasket(week, basket, phase ?? Phase.Shut, timer, delta);
    this.secondBasket(week, basket, phase ?? Phase.Shut, delta);
    this.stretchRope(basket);
    this.throwLever(delta);
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

  /**
   * The latch: a closed window opens on a morning; closing it on Sunday ends
   * the week. While the basket is coming up, on the sill or going down, the
   * shutters stay open: they would swing through it and its rope.
   */
  private onLatch(): void {
    const week = this.weekEntity();
    if (week == null) return;
    const open = !week.getValue(Week, 'shuttersOpen');
    const busy = week.getValue(Week, 'phase');
    if (!open && (busy === Phase.Rising || busy === Phase.Choosing || busy === Phase.Lowering)) {
      emitSignal('busy');
      return;
    }
    // Nor while the solidarity week's second basket is on its way, and that week is not kept until its card has come.
    if (!open && this.haul >= 0) {
      emitSignal('busy');
      return;
    }
    if (!open && busy === Phase.Sunday && solidarityOf(week.getValue(Week, 'week') ?? 1) != null && aidCard() !== 'sill') return;
    // Nor in the very first week before its lamp is lit: the first session shows Lina's answer to it. Tocco says it
    // again and the ghost hand shows the match at once. From the second week, closing without the lamp is a choice.
    if (!open && busy === Phase.Sunday && (week.getValue(Week, 'week') ?? 1) === 1 && !week.getValue(Week, 'lamp')) {
      if (import.meta.env.DEV) console.info('[basket] latch in the first week before the lamp: the shutters stay open');
      emitSignal('unlit');
      return;
    }
    // Nor while the town waits for Lina's answer to the lamp: she answers now, then the shutters can close.
    if (!open && busy === Phase.Sunday && replyWaiting()) {
      if (import.meta.env.DEV) console.info('[basket] latch waits for Lina\'s answer: the shutters stay open');
      emitSignal('reply');
      return;
    }
    // Nor while the last night's windows are still being lit: the rest come on now, then the shutters can close.
    if (!open && busy === Phase.Sunday && conducting()) {
      emitSignal('hurry');
      return;
    }
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
    if (this.toggle != null) this.toggle.position.y = this.toggleY;
    this.flash = 0;
    this.flashChosen = -1;
    this.leverTime = Infinity;
    this.haul = -1;
    this.hauled = false;
    this.haulWeek = -1;
    this.closingGlow = false;
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
    week.object3D?.position.set(BASKET_ON_SQUARE.x, BASKET_ON_SQUARE.y, BASKET_ON_SQUARE.z);
    // The phase last: its timer goes back to RESTART_WEEK.timer with it.
    this.enter(week, Phase.Shut);
  }

  /** Dev keys only: keeps the week as it stands, with nothing chosen and no calls, and closes the shutters on the next. */
  devSkipWeek(): void {
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
        const y = BASKET_ON_SQUARE.y + ((BASKET_AT_WINDOW.y - BASKET_ON_SQUARE.y) * pulls) / PULLS;
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
    }
    const after = phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday;
    if (this.haul < 0) {
      // It waits for the shutters to be open: it would swing in through them.
      if (this.hauled || !after || !aidSailed() || solidarityOf(n) == null || !week.getValue(Week, 'shuttersOpen')) return;
      this.haul = 0;
      this.from.copy(basket.position);
    }
    this.haul += delta;
    const t = this.haul;
    const p = basket.position;
    const up = HAUL_UP_SECONDS;
    const inAt = up + SWING_SECONDS;
    const outAt = inAt + HAUL_REST;
    const downAt = outAt + SWING_SECONDS;
    if (t < up) {
      this.target.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y, BASKET_AT_WINDOW.z);
      p.lerpVectors(this.from, this.target, ease(t / up));
      setAidCard('basket');
    } else if (t < inAt) {
      swing(p, (t - up) / SWING_SECONDS);
    } else if (t < outAt) {
      p.set(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);
      if (t > inAt + HAUL_REST * 0.6) setAidCard('sill');
    } else if (t < downAt) {
      swing(p, 1 - ease((t - outAt) / SWING_SECONDS));
    } else {
      const d = Math.min(1, (t - downAt) / DROP_SECONDS);
      p.set(BASKET_AT_WINDOW.x, BASKET_AT_WINDOW.y + (BASKET_ON_SQUARE.y - BASKET_AT_WINDOW.y) * ease(d), BASKET_AT_WINDOW.z);
      if (d >= 1) {
        this.haul = -1;
        this.hauled = true;
      }
    }
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

  /** The lever turns to point at its grip while it is pulled, and swings once more when the brake is let off. */
  private throwLever(delta: number): void {
    if (this.lever == null) return;
    let throwAngle = 0;
    if (this.leverTime <= LEVER_SECONDS) {
      this.leverTime += delta;
      throwAngle = -LEVER_THROW * Math.sin(Math.PI * Math.min(1, this.leverTime / LEVER_SECONDS));
    }
    let pullAngle = 0;
    const grip = this.grip;
    if (grip != null) {
      const now = Math.atan2(grip.position.y - LEVER_PIVOT.y, grip.position.x - LEVER_PIVOT.x);
      pullAngle = Math.max(-LEVER_THROW * 1.4, Math.min(0, now - GRIP_REST_ANGLE));
    }
    this.lever.rotation.z = Math.min(throwAngle, pullAngle);
  }

  /** A slow warm pulse on whatever comes next: the rope, the three objects, then the lever. */
  private glow(week: Entity, phase: string, delta: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2);
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    // Something going into the basket: a short warm flash on the wicker, with the sound (SoundSystem).
    if (phase === Phase.Choosing && chosen !== this.flashChosen && chosen >= 0) this.flash = FLASH_SECONDS;
    this.flashChosen = chosen;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - delta);
    shine(week.object3D as Mesh | undefined, this.flash / FLASH_SECONDS);
    const choosing = phase === Phase.Choosing;
    const aid = solidarityOf(week.getValue(Week, 'week') ?? 1) != null;
    shine(this.toggle, phase === Phase.Bell && !aid ? pulse : 0);
    // The latch, whenever it is the next thing to touch: closed shutters to open, or Sunday's end to close them.
    const shut = !(week.getValue(Week, 'shuttersOpen') ?? false);
    // Not while the town waits for Lina's answer to the lamp: the latch glows once she has answered.
    const closing = phase === Phase.Sunday && (aid ? aidCard() === 'sill' : (week.getValue(Week, 'lamp') ?? false) && !replyWaiting());
    shine(this.latch, shut || closing ? pulse : 0);
    if (import.meta.env.DEV && closing !== this.closingGlow) {
      this.closingGlow = closing;
      console.info(`[basket] latch ${closing ? 'glows to close the week' : 'stops glowing to close'}`);
    }
    shine(this.lever?.children[0] as Mesh | undefined, choosing && chosen >= 0 ? pulse : 0);
    // Only the options the jar can pay for invite a touch; the others stay dim.
    // In turn, left to right, so each reads as its own invitation.
    for (const entity of this.queries.choices.entities) {
      const index = entity.getValue(Choice, 'index') ?? 0;
      const open = canChoose(index);
      const turn = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2 - index * 2.1);
      shine(entity.object3D as Mesh | undefined, choosing && chosen < 0 && open ? turn * 0.7 : 0);
    }
  }
}

/** From just outside the window (0) onto the sill (1), lifting a little over the stone. */
function swing(p: Vector3, s: number): void {
  const e = ease(s);
  p.set(
    BASKET_AT_WINDOW.x + (BASKET_ON_SILL.x - BASKET_AT_WINDOW.x) * e,
    BASKET_AT_WINDOW.y + (BASKET_ON_SILL.y - BASKET_AT_WINDOW.y) * e + 0.06 * Math.sin(Math.PI * s),
    BASKET_AT_WINDOW.z + (BASKET_ON_SILL.z - BASKET_AT_WINDOW.z) * e,
  );
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
