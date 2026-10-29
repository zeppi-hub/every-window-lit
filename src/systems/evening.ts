import { Color, createSystem, DirectionalLight, type Fog, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { setFarEvening } from '../station/far-city.js';
import { evening } from '../station/materials.js';

/** Evening comes on and goes at this rate (per second, exponential): about 1.5 s. */
const RATE = 2.2;
/** Moving the sun to another evening passes through a short day: a dip this long. */
const DIP_SECONDS = 1.5;
const DIP = 0.7;
const SUN_DUSK = new Color(1.0, 0.62, 0.42);
const SKY_DUSK = new Color(0.62, 0.5, 0.58);
const FOG_DUSK = new Color(0x7d7486);

/**
 * The week's evenings. While the sun on the sill stands on one of the
 * days, the town is at dusk: the sun low and warm, the sky and the haze
 * darker, less light from the sky, and about six windows in ten lit, in
 * the near streets and across the far city. Moving to another evening
 * passes through a short day. Before and after the week it is morning.
 */
export class EveningSystem extends createSystem({
  week: { required: [Week] },
}) {
  private amount = 0;
  private shown = -1;
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
      if (day >= 0 && this.lastDay >= 0) this.dip = 0;
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
    if (Math.abs(e - this.shown) < 0.0005) return;
    this.shown = e;
    this.apply(e);
  }

  private apply(e: number): void {
    evening.value = e;
    setFarEvening(e);
    if (this.sun != null) {
      this.sun.intensity = this.sunIntensity * (1 - 0.72 * e);
      this.sun.color.copy(this.sunColor).lerp(SUN_DUSK, e);
    }
    this.written = this.environment * (1 - 0.6 * e);
    this.world.scene.environmentIntensity = this.written;
    this.sky?.color.setRGB(1, 1, 1).lerp(SKY_DUSK, e);
    const fog = this.world.scene.fog as Fog | null;
    fog?.color.copy(this.fogColor).lerp(FOG_DUSK, e);
  }
}
