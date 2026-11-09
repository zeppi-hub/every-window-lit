import { createSystem, type Mesh, type MeshBasicMaterial, type Object3D, type Points, type PointsMaterial, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { endingLights } from '../globe.js';
import { CLIMAX_WEEK, festivalLights } from '../season/model.js';
import { currentTown, globeChoice, SEASON_WEEKS } from '../season/store.js';
import { setFarLitShare } from '../station/far-city.js';
import { litShare, setLitShare } from '../station/materials.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';

/** In the climax's week the empty frame comes down this far while the days run, to be cleaned, and goes back up by Sunday (m), at this speed (m/s). */
const FRAME_DROP = 5.5;
const FRAME_SPEED = 1.4;
/** How much brighter the bulbs flare on a beat, and how long the flare lasts (s). */
const FLARE = 0.7;
const FLARE_SECONDS = 0.45;
/** From this week the strings hang over the square, unlit, until the last night. */
const STRUNG_WEEK = 10;
/** Beats it takes to light the night's windows; the shortest gap between two (slow, like a waltz); seconds without one before the rest light by themselves. */
const BEATS = 6;
/** The share of windows still lit while the town waits for the first beat. */
const WAITING = 0.08;
const MIN_BEAT = 0.6;
const ON_THEIR_OWN = 12;
/** How far a hand comes down, then back up, for a beat (m): a gentle wrist and forearm, never a fast arm. */
const BEAT_DOWN = 0.06;
const BEAT_UP = 0.03;

let night = false;
let lit = false;

/** Whether the season's last night is on (the last Sunday, lamp lit): the sound plays Dario's tune if the town earned it. */
export function festivalOn(): boolean {
  return night;
}

/** Whether the last night's windows have all come on (conducted, or lit by themselves). */
export function festivalLit(): boolean {
  return night && lit;
}

let beatsGiven = 0;

/** Beats given so far tonight: the hand that shows the beat goes with the first. */
export function conductBeats(): number {
  return beatsGiven;
}

/** Whether the Keeper is conducting the last night's windows now (Tocco shows the beat). */
export function conducting(): boolean {
  return night && !lit;
}

/** The share of windows lit on the last night, from the season's model. */
export function festivalShare(): number {
  return festivalLights(currentTown());
}

/**
 * The season's last night (META_VR_FIKIR.md §10): on the last Sunday,
 * once the lamp is lit, strings of bulbs light over the square and as many
 * of the town's windows light up as the season earned (hard weeks answered,
 * builds working). As the lamp lights, the
 * town's windows go dark, waiting; the Keeper conducts them on
 * (META_VR_DINAMIKLER.md item 4): each slow beat of a hand, down then up,
 * lights the next part of them with a note; left alone, the rest come on
 * by themselves. Closing the shutters keeps the season; the next
 * morning starts it again.
 */
export class FestivalSystem extends createSystem({
  week: { required: [Week] },
}) {
  private festival: Object3D | null = null;
  private bulbs: Mesh | null = null;
  private halos: Points | null = null;
  private pools: Mesh | null = null;
  private beam: Object3D | null = null;
  /** How far the night's lights have come up (0 to 1), over a couple of seconds. */
  private amount = 0;
  private beamTime = 0;
  /** The town's own share of lit windows before the night, given back after it. */
  private before = 0.8;
  /** The share the night ends on, and the beats given so far. */
  private target = 0.8;
  private beats = 0;
  /** A beat's flare on the bulbs, 1 down to 0. */
  private flare = 0;
  private sinceBeat = 0;
  /** Per tracked hand point (left and right index tips, then grips): its highest point since the last beat, and its lowest after coming down. */
  private top = [0, 0, 0, 0];
  private low = [0, 0, 0, 0];
  private down = [false, false, false, false];
  private point = new Vector3();
  /** The shutters were tried: the rest of the windows come on now, a little faster. */
  private hurried = false;
  private stanceWas = '';
  private harbour: Object3D | null = null;
  private frame: Object3D | null = null;
  private frameLine: Object3D | null = null;
  private frameHome = 0;
  private frameDown = 0;
  private townGlass: Object3D | null = null;
  private townFlame: Object3D | null = null;
  private townHalo: Object3D | null = null;
  private smallLamps: Object3D | null = null;
  private candle: Object3D | null = null;
  /** Whether the strings hang over the square yet, and the week the ending's glass was last placed for. */
  private strung = false;
  private glassWeek = 0;

  init(): void {
    this.cleanupFuncs.push(
      onSignal('hurry', () => {
        this.hurried = true;
      }),
      onSignal('restart', () => this.restart()),
    );
    this.festival = this.world.scene.getObjectByName('Festival') ?? null;
    const find = (name: string) => this.festival?.getObjectByName(name) ?? null;
    this.bulbs = find('FestivalBulbs') as Mesh | null;
    this.halos = find('FestivalHalos') as Points | null;
    this.pools = find('FestivalPools') as Mesh | null;
    this.beam = find('HarbourBeam');
    this.harbour = find('HarbourLight');
    this.frame = this.world.scene.getObjectByName('TownLampFrame') ?? null;
    this.frameLine = this.world.scene.getObjectByName('TownLampLine') ?? null;
    this.frameHome = this.frame?.position.y ?? 0;
    (this.bulbs?.material as MeshBasicMaterial | undefined)?.color.setScalar(0.25);
    // Only the strings go up from week 10: the glow, the pools and the harbour's light wait for the night.
    for (const part of [this.halos, this.pools, this.harbour]) if (part != null) part.visible = false;
    const scene = this.world.scene;
    this.townGlass = scene.getObjectByName('TownLampGlass') ?? null;
    this.townFlame = scene.getObjectByName('TownLampFlame') ?? null;
    this.townHalo = scene.getObjectByName('TownLampHalo') ?? null;
    this.smallLamps = scene.getObjectByName('SmallLamps') ?? null;
    this.candle = scene.getObjectByName('LinaCandle') ?? null;
    // Lina's candle stands in her window, toward the tower.
    if (this.candle != null) {
      scene.getObjectByName('TessaWindow')?.getWorldPosition(this.point);
      this.candle.position.set(this.point.x, this.point.y - 0.3, this.point.z + 0.2);
    }
  }

  update(delta: number): void {
    this.fade(delta);
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const strung = n >= STRUNG_WEEK;
    if (strung !== this.strung) {
      this.strung = strung;
      if (this.festival != null) this.festival.visible = strung || this.amount > 0;
    }
    // The glass the town was sent stands in its frame all through the last week.
    if (n !== this.glassWeek) {
      this.glassWeek = n;
      if (this.townGlass != null) this.townGlass.visible = n === SEASON_WEEKS && globeChoice() === 'sent';
    }
    this.lowerFrame(n, week.getValue(Week, 'phase') ?? Phase.Shut, delta);
    const on =
      (week.getValue(Week, 'week') ?? 1) === SEASON_WEEKS && week.getValue(Week, 'phase') === Phase.Sunday && (week.getValue(Week, 'lamp') ?? false);
    if (on !== night) {
      night = on;
      lit = false;
      if (on) {
        // The picture is what the line says: the same share (the bulbs and the crowd are the same in every season).
        this.before = litShare.value;
        this.target = festivalShare();
        this.beats = 0;
        beatsGiven = 0;
        this.sinceBeat = 0;
        this.hurried = false;
        this.resetHands();
        this.show(WAITING);
        this.showEnding();
      } else {
        this.hideEnding();
        setLitShare(this.before);
        setFarLitShare(this.before);
      }
    }
    if (night && !lit) this.conduct(delta);
  }

  /**
   * The season starts over from the start page: a last night still on (the
   * Keeper left before closing its shutters) is over at once, the town's
   * windows back to their share before it, its lights out.
   */
  restart(): void {
    if (night) {
      setLitShare(this.before);
      setFarLitShare(this.before);
    }
    night = false;
    lit = false;
    this.hurried = false;
    this.beats = 0;
    beatsGiven = 0;
    this.sinceBeat = 0;
    this.flare = 0;
    this.fade(10);
    this.hideEnding();
    this.glassWeek = 0;
  }

  /** Down for its cleaning through the climax's days, up again for Sunday; it stands by week and phase alone, so a reload shows it right. */
  private lowerFrame(n: number, phase: string, delta: number): void {
    const target = n === CLIMAX_WEEK && (phase === Phase.Landed || phase === Phase.Days) ? FRAME_DROP : 0;
    if (this.frameDown === target || this.frame == null) return;
    const step = FRAME_SPEED * delta;
    this.frameDown = Math.abs(target - this.frameDown) <= step ? target : this.frameDown + Math.sign(target - this.frameDown) * step;
    this.frame.position.y = this.frameHome - this.frameDown;
    if (this.frameLine != null) {
      this.frameLine.visible = this.frameDown > 0;
      this.frameLine.scale.y = Math.max(0.01, this.frameDown);
      this.frameLine.position.y = this.frameHome - this.frameDown / 2;
    }
  }

  /** The last night's own lights, for what the season answered (globe.ts). */
  private showEnding(): void {
    const town = currentTown();
    const lights = endingLights(town.answer ?? 'window', town.globe === 'sent', lit);
    if (this.townFlame != null) this.townFlame.visible = lights.frame;
    if (this.townHalo != null) this.townHalo.visible = lights.frame;
    if (this.candle != null) this.candle.visible = lights.candle;
    if (this.smallLamps != null) this.smallLamps.visible = lights.lamps;
  }

  private hideEnding(): void {
    for (const light of [this.townFlame, this.townHalo, this.candle, this.smallLamps]) if (light != null) light.visible = false;
  }

  /** Beats light the windows a part at a time; with no beat for a while, the rest come on by themselves. */
  private conduct(delta: number): void {
    this.sinceBeat += delta;
    // Going down to the square or back moves the whole rig: start the beat afresh rather than count the jump.
    const now = stance();
    if (now !== this.stanceWas) {
      this.stanceWas = now;
      this.resetHands();
    }
    if (!this.hurried && this.sinceBeat > MIN_BEAT && this.beat()) {
      this.beats += 1;
      beatsGiven = this.beats;
      // The bulbs flare a moment with each beat.
      this.flare = 1;
      this.sinceBeat = 0;
      emitSignal('beat');
      if (import.meta.env.DEV) console.info('[festival] beat', this.beats, 'of', BEATS);
      // Each beat lights another sixth, on from wherever the windows are (never fewer).
      const share = Math.min(this.target, litShare.value + (this.target - WAITING) / BEATS);
      this.show(share);
      if (this.target - share < 0.005) this.finish();
      return;
    }
    if (this.sinceBeat < ON_THEIR_OWN && !this.hurried) return;
    // Left alone (or hurried by the shutters): the rest of the windows come up over a few seconds.
    const share = litShare.value + (this.target - litShare.value) * Math.min(1, delta * (this.hurried ? 2.5 : 0.8));
    this.show(share);
    if (this.target - share < 0.005) this.finish();
  }

  private show(share: number): void {
    setLitShare(share);
    setFarLitShare(share);
  }

  private finish(): void {
    this.show(this.target);
    lit = true;
    this.showEnding();
    emitSignal('lit');
    if (import.meta.env.DEV) console.info('[festival] lit', this.target.toFixed(2), 'after', this.beats, 'beats');
  }

  /** A slow beat from any hand: down by BEAT_DOWN from its highest point, then back up by BEAT_UP. */
  private beat(): boolean {
    let struck = false;
    const spaces = this.player;
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 === 0 ? 'left' : 'right';
      // Heights in the rig's own frame, so a move of the whole rig is never a beat.
      (i < 2 ? spaces.indexTipSpaces[side] : spaces.gripSpaces[side]).getWorldPosition(this.point);
      const y = this.player.worldToLocal(this.point).y;
      if (!this.down[i]) {
        if (y > this.top[i]) this.top[i] = y;
        else if (this.top[i] - y >= BEAT_DOWN) {
          this.down[i] = true;
          this.low[i] = y;
        }
      } else if (y < this.low[i]) {
        this.low[i] = y;
      } else if (y - this.low[i] >= BEAT_UP) {
        struck = true;
      }
    }
    if (struck) this.resetHands();
    return struck;
  }

  private resetHands(): void {
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 === 0 ? 'left' : 'right';
      (i < 2 ? this.player.indexTipSpaces[side] : this.player.gripSpaces[side]).getWorldPosition(this.point);
      this.top[i] = this.player.worldToLocal(this.point).y;
      this.down[i] = false;
    }
  }

  /** The bulbs, their glow and the pools of light come up together over about two seconds; the harbour beam turns. */
  private fade(delta: number): void {
    const target = night ? 1 : 0;
    if (this.amount === target && !night) return;
    this.amount += (target - this.amount) * Math.min(1, delta * 1.6);
    if (Math.abs(target - this.amount) < 0.003) this.amount = target;
    const a = this.amount;
    if (this.flare > 0) this.flare = Math.max(0, this.flare - delta / FLARE_SECONDS);
    if (this.festival != null) this.festival.visible = a > 0 || this.strung;
    // The strings hang from week 10; their glow, pools and the harbour's light only on the night.
    if (this.halos != null) this.halos.visible = a > 0;
    if (this.pools != null) this.pools.visible = a > 0;
    if (this.harbour != null) this.harbour.visible = a > 0;
    (this.bulbs?.material as MeshBasicMaterial | undefined)?.color.setScalar((0.25 + 0.75 * a) * (1 + FLARE * this.flare));
    const halos = this.halos?.material as PointsMaterial | undefined;
    if (halos != null) halos.opacity = Math.min(1, 0.8 * a * (1 + FLARE * this.flare));
    const pools = this.pools?.material as MeshBasicMaterial | undefined;
    if (pools != null) pools.opacity = 0.32 * a;
    // Back and forth over the open sea to the west, never over the town or toward the tower.
    this.beamTime += delta;
    if (this.beam != null) this.beam.rotation.y = Math.PI + 0.9 * Math.sin(this.beamTime * 0.3);
  }
}
