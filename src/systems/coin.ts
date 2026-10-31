import { createSystem, Grabbed, GrabSystem, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { setWeekCoinPending } from '../coin.js';
import { Phase, Week } from '../components.js';
import { emitSignal } from '../signals.js';
import { JAR_MOUTH } from '../station/card.js';

/** Dropped this close to the jar's mouth, the coin goes in. */
const DROP_RADIUS = 0.12;
/** A pinch shorter than this that hardly moved it is a tap: the coin goes to the jar by itself. */
const TAP_SECONDS = 0.6;
const TAP_TRAVEL = 0.06;
/** Where it lies in the basket, from the basket's origin. */
const IN_BASKET = new Vector3(0.07, 0.03, 0.03);
const FLY_SECONDS = 0.55;

type State = 'off' | 'riding' | 'held' | 'flying' | 'in';

/**
 * The week's coin (src/coin.ts): from the second week it rides up in the
 * basket. Picked up and let go over the jar, or pinched and let go at once, it drops in
 * with a clink; left alone, it goes in by itself as the basket leaves.
 * While it waits in the basket on the sill it glows softly.
 */
export class CoinSystem extends createSystem({
  week: { required: [Week] },
  held: { required: [Grabbed] },
}) {
  private coin: Mesh | null = null;
  private state: State = 'off';
  private phase = '';
  private elapsed = 0;
  private fly = 0;
  private grabbedAt = 0;
  private from = new Vector3();
  private start = new Vector3();
  private to = new Vector3(JAR_MOUTH.x, JAR_MOUTH.y, JAR_MOUTH.z);

  init(): void {
    this.coin = (this.world.scene.getObjectByName('WeekCoin') as Mesh | undefined) ?? null;
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', (entity) => {
        if (entity.object3D !== this.coin || this.coin == null) return;
        this.state = 'held';
        this.grabbedAt = this.elapsed;
        this.start.copy(this.coin.position);
      }),
      this.queries.held.subscribe('disqualify', (entity) => {
        if (entity.object3D !== this.coin || this.coin == null || this.state !== 'held') return;
        const quick = this.elapsed - this.grabbedAt < TAP_SECONDS && this.coin.position.distanceTo(this.start) < TAP_TRAVEL;
        // Over the jar, or a quick tap: in it goes. Anywhere else: back to the basket.
        this.state = quick || this.coin.position.distanceTo(this.to) < DROP_RADIUS ? this.flyIn() : 'riding';
      }),
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    const coin = this.coin;
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (coin == null || week == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const basket = week.object3D as Object3D | null;
    if (phase !== this.phase) {
      // A new week: from the second, the town's coin comes up in the basket.
      if (phase === Phase.Morning && this.phase === Phase.Shut) {
        this.state = (week.getValue(Week, 'week') ?? 1) > 1 ? 'riding' : 'off';
      }
      // The basket is leaving: whatever the Keeper did, the coin goes in.
      if (phase === Phase.Lowering && (this.state === 'riding' || this.state === 'held')) {
        if (this.state === 'held') {
          for (const entity of this.queries.held.entities) if (entity.object3D === coin) this.world.getSystem(GrabSystem)?.forceRelease(entity);
        }
        this.state = this.flyIn();
      }
      this.phase = phase;
    }
    setWeekCoinPending(this.state === 'riding' || this.state === 'held' || this.state === 'flying');
    coin.visible = this.state === 'riding' || this.state === 'held' || this.state === 'flying';
    if (this.state === 'riding' && basket != null) {
      coin.position.copy(basket.position).add(IN_BASKET);
      coin.rotation.set(0, 0, 0);
    }
    if (this.state === 'flying') {
      this.fly += delta;
      const t = Math.min(1, this.fly / FLY_SECONDS);
      const e = t * t * (3 - 2 * t);
      coin.position.lerpVectors(this.from, this.to, e);
      coin.position.y += 0.08 * Math.sin(Math.PI * t);
      if (t >= 1) {
        this.state = 'in';
        emitSignal('coin');
      }
    }
    const material = coin.material as MeshStandardMaterial;
    const glow = this.state === 'riding' && phase === Phase.Choosing ? 0.5 + 0.5 * Math.sin(this.elapsed * 3.2) : 0;
    material.emissive.setRGB(0.32 * glow, 0.24 * glow, 0.1 * glow);
  }

  private flyIn(): State {
    if (this.coin != null) this.from.copy(this.coin.position);
    this.fly = 0;
    return 'flying';
  }
}
