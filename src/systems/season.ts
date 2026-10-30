import { type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { Choice, Phase, Week } from '../components.js';
import type { Kind, RealWeek } from '../season/model.js';
import { canChoose, coinsShown, realWeek, weatherOf } from '../season/store.js';
import { CARD_IN_BASKET, CARD_ON_SILL, drawCard } from '../station/card.js';
import { drawSlip, SLIP_OFFSET } from '../station/weather.js';

/** What the card says moved, by kind. */
const TITLES: Readonly<Record<Kind, string>> = {
  fuel: 'Mainland pump prices',
  power: 'Mainland wholesale power',
  food: 'Mainland grocery prices',
};

/** Phases in which the sill's objects are home and can change to the week's kind. */
const HOME: ReadonlySet<string> = new Set([Phase.Shut, Phase.Morning, Phase.Bell]);
/** Phases after the basket has left with the choice: the coins are paid, the card is on the sill. */
const PAID: ReadonlySet<string> = new Set([Phase.Lowering, Phase.Landed, Phase.Days, Phase.Sunday]);

/** "+4.1%" with a true minus sign for falls. */
export function signed(change: number): string {
  const size = Math.abs(change).toFixed(1);
  return change > 0 ? `+${size}%` : change < 0 ? `−${size}%` : `${size}%`;
}

/**
 * The week's real data on the sill: the three objects take the shape of the
 * week's kind (fuel, power, food), the card in the basket carries the real
 * number, and the jar shows the coins left. An option the jar cannot pay
 * for, or a kind already built, stays dim; ChoiceSystem refuses it.
 */
export class SeasonSystem extends createSystem({
  week: { required: [Week] },
  choices: { required: [Choice] },
}) {
  private card: Object3D | null = null;
  private cardTexture: CanvasTexture | null = null;
  private slip: Object3D | null = null;
  private slipTexture: CanvasTexture | null = null;
  private coins: Object3D[] = [];
  private kind: Kind | null = null;
  private drawnFor = -1;
  private shownCoins = -1;
  private dim: boolean[] = [false, false, false];

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.card = find('WeekCard');
    const face = find('WeekCardFace') as Mesh | null;
    this.cardTexture = ((face?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | undefined) ?? null;
    this.slip = find('WeatherSlip');
    const slipFace = this.slip?.children[0] as Mesh | undefined;
    this.slipTexture = ((slipFace?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | undefined) ?? null;
    for (let k = 0; ; k += 1) {
      const coin = find(`Coin${k}`);
      if (coin == null) break;
      this.coins.push(coin);
    }
  }

  update(): void {
    const week = this.weekEntity();
    const basket = week?.object3D;
    if (week == null || basket == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const real = realWeek(n);
    if (real == null) return;

    if (HOME.has(phase) && real.kind !== this.kind) this.shape(real.kind);
    if (n !== this.drawnFor) this.draw(real, n);
    this.placeCard(phase, basket);
    this.placeSlip(n);

    const coins = coinsShown(chosen, PAID.has(phase));
    if (coins !== this.shownCoins) {
      this.shownCoins = coins;
      this.coins.forEach((coin, index) => {
        coin.visible = index < coins;
      });
    }
    for (const entity of this.queries.choices.entities) {
      const index = entity.getValue(Choice, 'index') ?? 0;
      const dim = !canChoose(index) && chosen !== index;
      if (dim === this.dim[index]) continue;
      this.dim[index] = dim;
      const material = (entity.object3D as Mesh | undefined)?.material as MeshStandardMaterial | undefined;
      material?.color.setScalar(dim ? 0.42 : 1);
    }
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  /** The three objects take the shapes of this kind's options. */
  private shape(kind: Kind): void {
    this.kind = kind;
    for (const entity of this.queries.choices.entities) {
      const mesh = entity.object3D as Mesh | undefined;
      const variants = mesh?.userData.variants as Record<Kind, Mesh> | undefined;
      const variant = variants?.[kind];
      if (mesh == null || variant == null) continue;
      mesh.geometry = variant.geometry;
      mesh.material = variant.material;
      mesh.rotation.y = variant.rotation.y;
      const index = entity.getValue(Choice, 'index') ?? 0;
      this.dim[index] = false;
      (variant.material as MeshStandardMaterial).color.setScalar(1);
    }
  }

  private draw(real: RealWeek, n: number): void {
    this.drawnFor = n;
    if (this.cardTexture == null) return;
    const when = real.monthly ? 'this month' : 'this week';
    const tag = `${real.monthly ? 'Real month' : 'Real week'} · Italy · ${real.month}`;
    drawCard(this.cardTexture, TITLES[real.kind], `${signed(real.change)} ${when}`, tag);
    const weather = weatherOf(n);
    if (weather != null && this.slipTexture != null) drawSlip(this.slipTexture, weather.label.replace('-', '\u2212'), weather.month);
  }

  /** A weather week's slip rides beside the card, wherever the card is. */
  private placeSlip(n: number): void {
    const slip = this.slip;
    const card = this.card;
    if (slip == null || card == null) return;
    slip.visible = card.visible && weatherOf(n) != null;
    if (!slip.visible) return;
    slip.rotation.copy(card.rotation);
    slip.position.set(SLIP_OFFSET.x, SLIP_OFFSET.y, 0).applyEuler(card.rotation).add(card.position);
  }

  /** Up with the basket, then propped on the sill once the basket goes back down; put away when the week ends. */
  private placeCard(phase: string, basket: Object3D): void {
    const card = this.card;
    if (card == null) return;
    if (phase === Phase.Rising || phase === Phase.Choosing) {
      card.visible = true;
      card.position.set(basket.position.x, basket.position.y + CARD_IN_BASKET.y, basket.position.z + CARD_IN_BASKET.z);
      card.rotation.set(CARD_IN_BASKET.tilt, CARD_IN_BASKET.yaw, 0, 'YXZ');
    } else if (PAID.has(phase)) {
      card.visible = true;
      card.position.set(CARD_ON_SILL.x, CARD_ON_SILL.y, CARD_ON_SILL.z);
      card.rotation.set(CARD_ON_SILL.tilt, CARD_ON_SILL.yaw, 0, 'YXZ');
    } else {
      card.visible = false;
    }
  }
}
