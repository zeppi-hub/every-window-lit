import { createSystem, type Entity, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { Choice, Phase, Week } from '../components.js';
import { beginWeek, canChoose, currentTown, keepWeek, markSettled, restartSeason, SEASON_WEEKS, solidarityOf } from '../season/store.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { linesWaiting } from '../talk.js';
import { aidCard, aidSailed, setAidCard } from '../aid.js';
import { BASKET_AT_WINDOW, BASKET_HANDLE, BASKET_ON_SILL, BASKET_ON_SQUARE, PULLEY } from '../station/basket.js';

/**
 * Seconds of quiet morning, shutters open, before the bell rings below;
 * Tocco says good morning meanwhile, and the bell waits for him to finish,
 * though never longer than MORNING_LIMIT.
 */
const MORNING_SECONDS = 6;
const MORNING_LIMIT = 20;
/** The very first morning is longer: the town is new, and Tocco lets it speak for itself first (ToccoSystem). */
const FIRST_MORNING_SECONDS = 15;
const FIRST_MORNING_LIMIT = 28;
/** As the bell rings, the rope beside the window twitches three times, so the eye finds it. */
const TWITCHES = 3;
const TWITCH_SECONDS = 0.45;
const TWITCH_DEPTH = 0.022;
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
  private toggleY = 0;
  private lever: Object3D | null = null;
  private leverTime = Infinity;
  /** The solidarity week's second basket: seconds into its trip (-1 when not travelling), whether it has been, and for which week. */
  private haul = -1;
  private hauled = false;
  private haulWeek = -1;
  private elapsed = 0;
  private from = new Vector3();
  private target = new Vector3();
  private handle = new Vector3();
  private span = new Vector3();

  init(): void {
    const scene = this.world.scene;
    this.rope = scene.getObjectByName('BasketRope') ?? null;
    this.toggle = (scene.getObjectByName('RopeToggleMesh') as Mesh | undefined) ?? null;
    this.latch = (scene.getObjectByName('Latch') as Mesh | undefined) ?? null;
    this.toggleY = this.toggle?.position.y ?? 0;
    this.lever = scene.getObjectByName('BrakeLever') ?? null;
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
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    const basket = week?.object3D;
    if (week == null || basket == null) return;
    const phase = week.getValue(Week, 'phase');
    // Down in the town, or behind closed shutters, the morning waits for the Keeper, and so does a solidarity
    // week's basket on its way up; moving parts finish their motion.
    const aid = solidarityOf(week.getValue(Week, 'week') ?? 1) != null;
    const waiting = (phase === Phase.Morning || (phase === Phase.Bell && aid)) && (stance() === 'walk' || !week.getValue(Week, 'shuttersOpen'));
    const timer = (week.getValue(Week, 'timer') ?? 0) + (waiting ? 0 : delta);
    week.setValue(Week, 'timer', timer);
    const first = (week.getValue(Week, 'week') ?? 1) === 1;
    const morning = first ? FIRST_MORNING_SECONDS : MORNING_SECONDS;
    const limit = first ? FIRST_MORNING_LIMIT : MORNING_LIMIT;
    if (phase === Phase.Morning && timer >= morning && (!linesWaiting() || timer >= limit)) this.enter(week, Phase.Bell);
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
    this.glow(week, phase ?? Phase.Shut);
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
    week.setValue(Week, 'shuttersOpen', open);
    const phase = week.getValue(Week, 'phase');
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

  private throwLever(delta: number): void {
    if (this.lever == null || this.leverTime > LEVER_SECONDS) return;
    this.leverTime += delta;
    const t = Math.min(1, this.leverTime / LEVER_SECONDS);
    this.lever.rotation.z = -LEVER_THROW * Math.sin(Math.PI * t);
  }

  /** A slow warm pulse on whatever comes next: the rope, the three objects, then the lever. */
  private glow(week: Entity, phase: string): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2);
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const choosing = phase === Phase.Choosing;
    const aid = solidarityOf(week.getValue(Week, 'week') ?? 1) != null;
    shine(this.toggle, phase === Phase.Bell && !aid ? pulse : 0);
    // The latch, whenever it is the next thing to touch: closed shutters to open, or Sunday's end to close them.
    const shut = !(week.getValue(Week, 'shuttersOpen') ?? false);
    const closing = phase === Phase.Sunday && (aid ? aidCard() === 'sill' : (week.getValue(Week, 'lamp') ?? false));
    shine(this.latch, shut || closing ? pulse : 0);
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
