import { Color, createSystem, DirectionalLight, type Fog, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { setPaperLight } from '../station/card.js';
import { setFarEvening } from '../station/far-city.js';
import { setSkyTime } from '../station/sky-dome.js';
import { evening, weatherSky } from '../station/materials.js';
import { festivalOn } from './festival.js';

/** Evening comes on and goes at this rate (per second, exponential): about 1.5 s. */
const RATE = 2.2;
/** Moving the sun to another evening passes through a short day: a dip this long. */
const DIP_SECONDS = 1.5;
const DIP = 0.7;
const SUN_DUSK = new Color(1.0, 0.62, 0.42);
const FOG_DUSK = new Color(0x7d7486);
/** A storm's sky and haze, and a cold snap's light. */
const SKY_GREY = new Color(0.62, 0.65, 0.7);
const FOG_GREY = new Color(0x8a9096);
const SUN_COLD = new Color(0.82, 0.9, 1.0);
/** The season's last night, after dusk: a deep blue haze, little light but the windows and bulbs (the sky's own shader darkens it). */
const FOG_NIGHT = new Color(0x2c2f45);
const NIGHT_RATE = 0.6;

/**
 * The week's evenings. While the sun on the sill stands on one of the
 * days, the town is at dusk: the sun low and warm, the sky and the haze
 * darker, less light from the sky, and about six windows in ten lit, in
 * the near streets and across the far city. Moving to another evening
 * passes through a short day. Before and after the week it is morning.
 * On the season's last night dusk deepens into night.
 */
export class EveningSystem extends createSystem({
  week: { required: [Week] },
}) {
  private amount = 0;
  private shown = -1;
  private overcast = 0;
  private chill = 0;
  private night = 0;
  private nightShown = -1;
  private lastDay = -1;
  private dip = Infinity;
  private sun: DirectionalLight | null = null;
  private sunIntensity = 1;
  private sunColor = new Color();
  private sky: MeshBasicMaterial | null = null;
  private fogColor = new Color();
  private environment = 1;
  /** The sky-light strength last written, -1 before the first; anything else found there was set by the scene. */
  private written = -1;

  init(): void {
    this.world.scene.traverse((object) => {
      if (this.sun == null && object instanceof DirectionalLight) this.sun = object;
    });
    if (this.sun != null) {
      this.sunIntensity = this.sun.intensity;
      this.sunColor.copy(this.sun.color);
    }
    this.sky = ((this.world.scene.getObjectByName('SkyDome') as Mesh | undefined)?.material as MeshBasicMaterial | undefined) ?? null;
    const fog = this.world.scene.fog as Fog | null;
    if (fog != null) this.fogColor.copy(fog.color);
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const phase = week.getValue(Week, 'phase');
    const day = week.getValue(Week, 'day') ?? -1;
    const target = phase === Phase.Days || phase === Phase.Sunday ? 1 : 0;
    if (day !== this.lastDay) {
      // One dip at a time: restarting it midway would step the light back up (a flicker while the sun slides).
      if (day >= 0 && this.lastDay >= 0 && this.dip >= DIP_SECONDS) this.dip = 0;
      this.lastDay = day;
    }
    this.amount += (target - this.amount) * (1 - Math.exp(-RATE * delta));
    if (Math.abs(target - this.amount) < 0.001) this.amount = target;
    let e = this.amount;
    if (this.dip < DIP_SECONDS) {
      this.dip += delta;
      e *= 1 - DIP * Math.sin((Math.PI * Math.min(1, this.dip / DIP_SECONDS)));
    }
    // The day's sky light comes from the scene (IWSDK applies the level's IBL, and again when its
    // HDR finishes loading). Take it as the base whenever the scene changed it since our last write.
    const current = this.world.scene.environmentIntensity;
    if (this.written < 0 || Math.abs(current - this.written) > 1e-4) {
      this.environment = current;
      this.shown = -1;
    }
    const nightTarget = festivalOn() ? 1 : 0;
    this.night += (nightTarget - this.night) * (1 - Math.exp(-NIGHT_RATE * delta));
    if (Math.abs(nightTarget - this.night) < 0.001) this.night = nightTarget;
    const { overcast, chill } = weatherSky;
    if (
      Math.abs(e - this.shown) < 0.0005 &&
      Math.abs(this.night - this.nightShown) < 0.0005 &&
      Math.abs(overcast - this.overcast) < 0.002 &&
      Math.abs(chill - this.chill) < 0.002
    )
      return;
    this.shown = e;
    this.nightShown = this.night;
    this.overcast = overcast;
    this.chill = chill;
    this.apply(e);
  }

  /** Evening `e`, under the week's weather: a storm's grey, a cold snap's cool light. */
  private apply(e: number): void {
    const { overcast, chill, night } = this;
    evening.value = e;
    setFarEvening(e);
    setPaperLight(e, night);
    if (this.sun != null) {
      this.sun.intensity = this.sunIntensity * (1 - 0.72 * e) * (1 - 0.6 * overcast) * (1 - 0.75 * night);
      this.sun.color.copy(this.sunColor).lerp(SUN_COLD, 0.6 * chill).lerp(SUN_DUSK, e);
    }
    this.written = this.environment * (1 - 0.6 * e) * (1 - 0.3 * overcast) * (1 - 0.55 * night);
    this.world.scene.environmentIntensity = this.written;
    // The sky's own shader turns the panorama to dusk and night (station/sky-dome.ts); a storm only greys it.
    this.sky?.color.setRGB(1, 1, 1).lerp(SKY_GREY, 0.75 * overcast);
    setSkyTime(e, night);
    const fog = this.world.scene.fog as Fog | null;
    fog?.color.copy(this.fogColor).lerp(FOG_GREY, 0.7 * overcast).lerp(FOG_DUSK, e).lerp(FOG_NIGHT, night);
  }
}
