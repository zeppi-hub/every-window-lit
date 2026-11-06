import { type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { type ChoiceStep, choiceStep, jarDots, jarShown, tagsUp } from '../choice-moment.js';
import { largerCaptions, lessMotion } from '../comfort.js';
import { DOT_FALL, layoutTags, placeDot, thingReach, tintQuad } from '../station/tags.js';
import { JAR_COINS } from '../station/card.js';
import { Choice, Phase, Week } from '../components.js';
import type { Kind, RealWeek } from '../season/model.js';
import { cardCredit, cardPriceLine, cardWeekLine } from '../season/lines.js';
import { canChoose, coinsShown, realWeek, SEASON_WEEKS, seasonCountry, weatherOf } from '../season/store.js';
import { COST } from '../season/model.js';
import { weekCoinPending } from '../coin.js';
import { type AidCard, aidCard } from '../aid.js';
import { CARD_ON_SILL, drawCard, drawLetter } from '../station/card.js';
import { CARD_IN_BASKET } from '../station/layout.js';
import { drawSlip, SLIP_OFFSET } from '../station/weather.js';

/** Phases in which the sill's objects are home and can change to the week's kind. */
const HOME: ReadonlySet<string> = new Set([Phase.Shut, Phase.Morning, Phase.Bell]);
/** Phases after the basket has left with the choice: the coins are paid, the card is on the sill. */
const PAID: ReadonlySet<string> = new Set([Phase.Lowering, Phase.Landed, Phase.Days, Phase.Sunday]);

/** How long the coins a choice costs take to drop away from the jar's dots. */
const DROP_SECONDS = 0.6;

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
  private letter: Object3D | null = null;
  private letterTexture: CanvasTexture | null = null;
  private letterFor: RealWeek | null = null;
  private slipTexture: CanvasTexture | null = null;
  private coins: Object3D[] = [];
  private coinY: number[] = [];
  private elapsed = 0;
  private bobbing = false;
  private kind: Kind | 'aid' | null = null;
  private drawnFor: RealWeek | null = null;
  private shownCoins = -1;
  private dim: boolean[] = [false, false, false];
  /** The tags over the three things and the dots over the jar (station/tags.ts), and the jar's brass band. */
  private tags: Mesh | null = null;
  private jarBand: Mesh | null = null;
  /** As last drawn: the size the tags are laid out at, each tag's state (-1 unknown, 0 hidden, 1 shown, 2 dimmed), the dots' balance. */
  private tagsLarge = false;
  /** How tall the week's three things stand (m), and whether the tags have been laid over them since they last changed. */
  private tops: number[] = [0.05, 0.05, 0.05];
  private backs: number[] = [0.03, 0.03, 0.03];
  private reach = { top: 0, back: 0 };
  private tagsLaid = false;
  private tagState: number[] = [-1, -1, -1];
  private dotsFor = -1;
  /** The choice whose coins drop from the dots, and how far they have dropped (0 to 1). */
  private dropChosen = -1;
  private drop = 1;

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.card = find('WeekCard');
    const face = find('WeekCardFace') as Mesh | null;
    this.cardTexture = ((face?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | undefined) ?? null;
    this.letter = find('AidLetter');
    this.letter?.traverse((object) => {
      const map = ((object as Mesh).material as MeshBasicMaterial | undefined)?.map as CanvasTexture | undefined;
      if (this.letterTexture == null && map != null) this.letterTexture = map;
    });
    this.slip = find('WeatherSlip');
    const slipFace = this.slip?.children[0] as Mesh | undefined;
    this.slipTexture = ((slipFace?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | undefined) ?? null;
    this.tags = find('ChoiceTags') as Mesh | null;
    this.jarBand = find('CoinJarBand') as Mesh | null;
    for (let k = 0; ; k += 1) {
      const coin = find(`Coin${k}`);
      if (coin == null) break;
      this.coins.push(coin);
      this.coinY.push(coin.position.y);
    }
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    const basket = week?.object3D;
    if (week == null || basket == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const real = realWeek(n);
    if (real == null) return;

    const aid = real.solidarity != null;
    const shape = aid ? 'aid' : real.kind;
    if (HOME.has(phase) && shape !== this.kind) this.shape(shape);
    if (real !== this.drawnFor) this.draw(real, n);
    // In a solidarity week the basket brings the letter, and the price card comes on a second basket later.
    this.placeLetter(aid ? real : null, phase, basket);
    this.placeCard(aid ? aidCard() : null, phase, basket);
    this.placeSlip(n);

    // The week's coin still in the basket is not in the jar yet (systems/coin.ts).
    const coins = Math.max(0, coinsShown(chosen, PAID.has(phase)) - (weekCoinPending() ? 1 : 0));
    if (coins !== this.shownCoins) {
      this.shownCoins = coins;
      this.coins.forEach((coin, index) => {
        coin.visible = index < coins;
      });
    }
    // While a choice sits in the basket, the coins it will cost rise and fall at the top of the jar.
    const cost = phase === Phase.Choosing && chosen >= 0 && !aid ? (COST[chosen] ?? 0) : 0;
    if (cost > 0 || this.bobbing) {
      const lift = 0.006 * (0.5 + 0.5 * Math.sin(this.elapsed * 5));
      for (let index = 0; index < this.coins.length; index += 1) {
        const paying = index < coins && index >= coins - cost;
        this.coins[index].position.y = (this.coinY[index] ?? 0) + (paying ? lift : 0);
      }
      // One last pass after the preview ends puts every coin back.
      this.bobbing = cost > 0;
    }
    // The choice, one step at a time in the first week (choice-moment.ts): the jar glows as its step comes.
    const step = choiceStep(n, phase, week.getValue(Week, 'timer') ?? 0, chosen, aid);
    shine(this.jarBand, step === 'jar' ? 0.5 + 0.5 * Math.sin(this.elapsed * 3.2) : 0);
    // The tags and the jar's dots only in the first week's choice, counted from the coins the jar shows.
    this.showTags(tagsUp(n, phase, aid), step, chosen, coins, delta);
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

  /** The three objects take the shapes of this kind's options, or of the Keeper's own things for the boat. */
  private shape(kind: Kind | 'aid'): void {
    this.kind = kind;
    for (const entity of this.queries.choices.entities) {
      const mesh = entity.object3D as Mesh | undefined;
      const variants = mesh?.userData.variants as Record<Kind | 'aid', Mesh> | undefined;
      const variant = variants?.[kind];
      if (mesh == null || variant == null) continue;
      mesh.geometry = variant.geometry;
      mesh.material = variant.material;
      mesh.rotation.y = variant.rotation.y;
      const index = entity.getValue(Choice, 'index') ?? 0;
      // Its tag stands just behind it, its foot just over its top.
      thingReach(variant.geometry, variant.rotation.y, this.reach);
      this.tops[index] = this.reach.top;
      this.backs[index] = this.reach.back;
      this.tagsLaid = false;
      this.dim[index] = false;
      (variant.material as MeshStandardMaterial).color.setScalar(1);
    }
  }

  /**
   * While the first week's choice is on (not a solidarity week): each
   * thing's tag from the choice's third step (none for the thing in the
   * basket; dim for one the jar cannot pay for), and from the jar's step
   * its `balance` (the coins the jar shows) in dots over it, the coins the
   * thing in the basket costs dropping away (fading only, with less
   * motion). Drawn bigger with Larger captions.
   */
  private showTags(choosing: boolean, step: ChoiceStep, chosen: number, balance: number, delta: number): void {
    const mesh = this.tags;
    if (mesh == null) return;
    const tagsOn = choosing && step === 'choose';
    mesh.visible = tagsOn || (choosing && jarShown(step));
    if (!mesh.visible) {
      // Shown again, everything is drawn afresh.
      this.tagState.fill(-1);
      this.dotsFor = -1;
      this.dropChosen = -1;
      this.drop = 1;
      return;
    }
    const geometry = mesh.geometry;
    const large = largerCaptions();
    if (large !== this.tagsLarge || !this.tagsLaid) {
      this.tagsLarge = large;
      this.tagsLaid = true;
      layoutTags(geometry, large, this.tops, this.backs);
      this.dotsFor = -1;
    }
    for (let i = 0; i < 3; i += 1) {
      const state = !tagsOn || chosen === i ? 0 : canChoose(i) ? 1 : 2;
      if (state === this.tagState[i]) continue;
      this.tagState[i] = state;
      tintQuad(geometry, i, state === 2 ? 0.45 : 1, state === 0 ? 0 : 1);
    }
    const cost = chosen >= 0 ? (COST[chosen] ?? 0) : 0;
    if (chosen !== this.dropChosen) {
      this.dropChosen = chosen;
      this.drop = 0;
      this.dotsFor = -1;
    }
    const dropping = cost > 0 && this.drop < 1;
    if (dropping) this.drop = Math.min(1, this.drop + delta / DROP_SECONDS);
    if (!dropping && balance === this.dotsFor) return;
    this.dotsFor = balance;
    const keep = jarDots(balance, cost);
    const t = cost > 0 ? ease(this.drop) : 0;
    const fall = lessMotion() ? 0 : DOT_FALL * t;
    for (let k = 0; k < JAR_COINS; k += 1) {
      const paid = k >= keep && k < balance;
      placeDot(geometry, k, balance, paid ? fall : 0);
      tintQuad(geometry, 3 + k, 1, k >= balance ? 0 : paid ? 1 - t : 1);
    }
  }

  private draw(real: RealWeek, n: number): void {
    this.drawnFor = real;
    if (this.cardTexture == null) return;
    // The week in the season, the price, and the real period and country: the one place in the game that says the price is real.
    drawCard(this.cardTexture, cardWeekLine(n, SEASON_WEEKS), cardPriceLine(real.kind, real.change), cardCredit(real, seasonCountry()));
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

  /** The solidarity week's letter rides up in the basket and goes back down in it; it never stays on the sill. */
  private placeLetter(real: RealWeek | null, phase: string, basket: Object3D): void {
    const letter = this.letter;
    if (letter == null) return;
    const riding = real != null && (phase === Phase.Rising || phase === Phase.Choosing || phase === Phase.Lowering);
    letter.visible = riding;
    if (!riding || real?.solidarity == null) return;
    if (real !== this.letterFor && this.letterTexture != null) {
      this.letterFor = real;
      drawLetter(this.letterTexture, real.solidarity.letter);
    }
    letter.position.set(basket.position.x + CARD_IN_BASKET.x, basket.position.y + CARD_IN_BASKET.y, basket.position.z + CARD_IN_BASKET.z);
    letter.rotation.set(CARD_IN_BASKET.tilt, CARD_IN_BASKET.yaw, 0, 'YXZ');
  }

  /**
   * Up with the basket, then propped on the sill once the basket goes back
   * down; put away when the week ends. In a solidarity week (`aid` given)
   * the card comes only with the second basket and stays once taken out.
   */
  private placeCard(aid: AidCard | null, phase: string, basket: Object3D): void {
    const card = this.card;
    if (card == null) return;
    const inBasket = aid != null ? aid === 'basket' : phase === Phase.Rising || phase === Phase.Choosing;
    const onSill = aid != null ? aid === 'sill' && phase !== Phase.Shut : PAID.has(phase);
    card.visible = inBasket || onSill;
    if (inBasket) {
      card.position.set(basket.position.x + CARD_IN_BASKET.x, basket.position.y + CARD_IN_BASKET.y, basket.position.z + CARD_IN_BASKET.z);
      card.rotation.set(CARD_IN_BASKET.tilt, CARD_IN_BASKET.yaw, 0, 'YXZ');
    } else if (onSill) {
      card.position.set(CARD_ON_SILL.x, CARD_ON_SILL.y, CARD_ON_SILL.z);
      card.rotation.set(CARD_ON_SILL.tilt, CARD_ON_SILL.yaw, 0, 'YXZ');
    }
  }
}

function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function shine(mesh: Mesh | null, amount: number): void {
  const material = mesh?.material as MeshStandardMaterial | undefined;
  if (material?.emissive == null) return;
  material.emissive.setRGB(0.32 * amount, 0.24 * amount, 0.1 * amount);
}
