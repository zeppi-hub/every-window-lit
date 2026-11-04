import { createSystem, type Entity, Grabbed, Pressed, Vector3 } from '@iwsdk/core';
import { choiceStep, thingsOpen } from '../choice-moment.js';
import { Choice, Phase, Week } from '../components.js';
import { canChoose, refuse, solidarityOf } from '../season/store.js';
import { emitSignal } from '../signals.js';
import { SLOT_HEIGHT } from '../station/basket.js';
import { tapOnlyByTouch } from '../touch-taps.js';

/** Dropped within this distance of the basket, an object goes in. */
const DROP_RADIUS = 0.14;
/**
 * A grab shorter than this that moved the object less than TAP_TRAVEL is a
 * tap. A fingertip poke on a free object starts a short grab that drags it
 * a few centimetres with the finger, so the travel allowance is generous;
 * a deliberate carry somewhere else goes further.
 */
const TAP_SECONDS = 0.6;
const TAP_TRAVEL = 0.08;
/** How quickly a released object settles home or into the basket. */
const SETTLE_RATE = 10;

/**
 * The three objects on the sill. While the basket waits on the sill, an
 * object dropped over it, or tapped, goes in, and whatever was in it goes
 * home; tapped again, or dropped anywhere else, it goes home. A tap is a
 * fingertip press that never became a grab, or a short grab that hardly
 * moved it. An option the jar cannot pay for, or a kind already built,
 * stays out (and Tocco says why). In the first week they can be taken only
 * once the card and the jar have had their turn (choice-moment.ts). Once
 * the basket leaves, the chosen object rides in it to the square; at the
 * next week everything is back in its place.
 */
export class ChoiceSystem extends createSystem({
  choices: { required: [Choice] },
  held: { required: [Choice, Grabbed] },
  pressed: { required: [Choice, Pressed] },
  week: { required: [Week] },
}) {
  /** Objects being pressed, and whether the press turned into a grab. */
  private grabbedDuringPress = new Map<Entity, boolean>();
  private grabbedAt = new Map<Entity, { time: number; x: number; y: number; z: number }>();
  private elapsed = 0;
  private target = new Vector3();

  init(): void {
    for (const entity of this.queries.choices.entities) captureHome(entity);
    this.cleanupFuncs.push(
      this.queries.choices.subscribe('qualify', captureHome),
      this.queries.held.subscribe('qualify', (entity) => {
        const p = entity.object3D?.position;
        if (p != null) this.grabbedAt.set(entity, { time: this.elapsed, x: p.x, y: p.y, z: p.z });
      }),
      this.queries.held.subscribe('disqualify', (entity) => this.release(entity)),
      this.queries.pressed.subscribe('qualify', (entity) => {
        this.grabbedDuringPress.set(entity, entity.hasComponent(Grabbed));
      }),
      this.queries.pressed.subscribe('disqualify', (entity) => {
        const grabbed = this.grabbedDuringPress.get(entity) ?? true;
        this.grabbedDuringPress.delete(entity);
        if (!grabbed) this.tap(entity);
      }),
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    // A fingertip taps them, never holds them (touch-taps.ts): a pinch or a ray carries one.
    for (const entity of this.queries.choices.entities) tapOnlyByTouch(entity);
    for (const entity of this.queries.pressed.entities) {
      if (entity.hasComponent(Grabbed)) this.grabbedDuringPress.set(entity, true);
    }
    const week = this.weekEntity();
    const basket = week?.object3D;
    if (week == null || basket == null) return;
    const phase = week.getValue(Week, 'phase');
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const blend = 1 - Math.exp(-SETTLE_RATE * delta);
    for (const entity of this.queries.choices.entities) {
      const object = entity.object3D;
      if (object == null || entity.hasComponent(Grabbed)) continue;
      const inBasket = entity.getValue(Choice, 'index') === chosen && phase !== Phase.Shut;
      if (inBasket) {
        this.target.set(basket.position.x, basket.position.y + SLOT_HEIGHT, basket.position.z);
      } else {
        const home = entity.getVectorView(Choice, 'home');
        this.target.set(home[0], home[1], home[2]);
      }
      // Riding the basket, or coming home from far away (the square, last week): no easing.
      if ((inBasket && phase !== Phase.Choosing) || object.position.distanceTo(this.target) > 1) {
        object.position.copy(this.target);
      } else {
        object.position.lerp(this.target, blend);
      }
    }
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  /** A tap puts an object in the basket, or takes it back out. */
  private tap(entity: Entity): void {
    const week = this.weekEntity();
    if (week == null || !entity.hasComponent(Choice) || !this.open(week)) return;
    const index = entity.getValue(Choice, 'index') ?? 0;
    if (week.getValue(Week, 'chosen') === index) week.setValue(Week, 'chosen', -1);
    else this.choose(week, index);
  }

  /** Whether the three things can be taken now: the choice is on, and in the first week has reached its third step. */
  private open(week: Entity): boolean {
    const n = week.getValue(Week, 'week') ?? 1;
    const step = choiceStep(n, week.getValue(Week, 'phase') ?? Phase.Shut, week.getValue(Week, 'timer') ?? 0, week.getValue(Week, 'chosen') ?? -1, solidarityOf(n) != null);
    return thingsOpen(step);
  }

  /** Dev keys only (dev-tools.ts): as if the object at this place on the sill were tapped. Empty when shipped. */
  devTap(index: number): void {
    if (!import.meta.env.DEV) return;
    for (const entity of this.queries.choices.entities) if (entity.getValue(Choice, 'index') === index) this.tap(entity);
  }

  /** Into the basket, if the jar can pay for it and it is open this week; otherwise it stays home. */
  private choose(week: Entity, index: number): void {
    if (canChoose(index)) {
      week.setValue(Week, 'chosen', index);
      return;
    }
    refuse(index);
    emitSignal('refused');
  }

  /** Decide where a released object belongs: in the basket, or home. */
  private release(entity: Entity): void {
    const week = this.weekEntity();
    const start = this.grabbedAt.get(entity);
    this.grabbedAt.delete(entity);
    const object = entity.object3D;
    if (week == null || object == null || !entity.hasComponent(Choice) || !this.open(week)) return;
    const index = entity.getValue(Choice, 'index') ?? 0;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const basket = week.object3D?.position;
    const p = object.position;
    const moved = start == null ? Infinity : Math.hypot(p.x - start.x, p.y - start.y, p.z - start.z);
    const tapped = start != null && this.elapsed - start.time < TAP_SECONDS && moved < TAP_TRAVEL;
    let inBasket: boolean;
    if (tapped) {
      inBasket = chosen !== index;
    } else {
      inBasket = basket != null && Math.hypot(p.x - basket.x, p.y - (basket.y + SLOT_HEIGHT), p.z - basket.z) < DROP_RADIUS;
    }
    if (inBasket && chosen !== index) this.choose(week, index);
    else if (!inBasket && chosen === index) week.setValue(Week, 'chosen', -1);
  }
}

function captureHome(entity: Entity): void {
  const p = entity.object3D?.position;
  if (p == null) return;
  const home = entity.getVectorView(Choice, 'home');
  home[0] = p.x;
  home[1] = p.y;
  home[2] = p.z;
}
