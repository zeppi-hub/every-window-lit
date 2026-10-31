import { createSystem, type InstancedMesh, Matrix4, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import type { Weather } from '../season/model.js';
import { weatherOf } from '../season/store.js';
import { setShutShare, weatherSky } from '../station/materials.js';
import { CHIMNEYS, PUFF_RISE, PUFFS, RAIN } from '../station/weather.js';
import { townTime } from '../timeflow.js';

/** Weather comes and goes at this rate (per second, exponential): a few seconds. */
const RATE = 0.8;
/** Rain falls this fast, metres per second; a puff takes this long to rise and fade. */
const FALL = 9;
const PUFF_SECONDS = 4.2;
/** Share of the row's windows shuttered against the midday sun in a heat wave. */
const SHUT = 0.5;

/**
 * Lays a weather week over the island (META_VR_FIKIR.md §19): a storm
 * greys the sky and rains over the sea, a cold snap cools the light
 * and sets the row's chimneys smoking, a heat wave closes half the
 * shutters by day. Nothing is shown of the mainland's side. Only weeks
 * checked for loss of life and reviewed carry weather; the dev build also
 * previews pending ones (season/store.ts weatherOf).
 */
export class WeatherSystem extends createSystem({
  week: { required: [Week] },
}) {
  private rain: Object3D | null = null;
  private smoke: InstancedMesh | null = null;
  private amount = 0;
  private kind: Weather['kind'] | null = null;
  private elapsed = 0;
  private matrix = new Matrix4();
  private position = new Vector3();
  private scale = new Vector3();
  private turn = new Quaternion();

  init(): void {
    this.rain = this.world.scene.getObjectByName('Rain') ?? null;
    this.smoke = (this.world.scene.getObjectByName('ChimneySmoke') as InstancedMesh | undefined) ?? null;
  }

  update(delta: number): void {
    this.elapsed += delta * townTime(); // rain and smoke hang still with the town
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    // The week's weather holds from its morning to the shutters closing on Sunday.
    const weather = week.getValue(Week, 'phase') === Phase.Shut ? null : weatherOf(week.getValue(Week, 'week') ?? 1);
    if (weather != null) this.kind = weather.kind;
    const target = weather != null ? 1 : 0;
    this.amount += (target - this.amount) * (1 - Math.exp(-RATE * delta));
    if (Math.abs(target - this.amount) < 0.002) this.amount = target;
    const a = this.amount;
    const kind = a > 0 ? this.kind : null;

    weatherSky.overcast = kind === 'storm' ? a : kind === 'cold' ? 0.3 * a : 0;
    weatherSky.chill = kind === 'cold' ? a : 0;
    setShutShare(kind === 'heat' ? SHUT * a : 0);

    if (this.rain != null) {
      this.rain.visible = kind === 'storm' && a > 0.3;
      if (this.rain.visible) this.rain.position.y = -((this.elapsed * FALL) % RAIN.height);
    }
    const smoke = this.smoke;
    if (smoke != null) {
      smoke.visible = kind === 'cold' && a > 0.3;
      if (smoke.visible) this.puffs(smoke);
    }
  }

  /** Each chimney's puffs rise, swell and thin out on staggered clocks. */
  private puffs(smoke: InstancedMesh): void {
    for (let c = 0; c < CHIMNEYS.length; c += 1) {
      const [x, y, z] = CHIMNEYS[c];
      for (let k = 0; k < PUFFS; k += 1) {
        const t = ((this.elapsed / PUFF_SECONDS + k / PUFFS + c * 0.37) % 1 + 1) % 1;
        // Swells as it rises, then thins away to nothing before the next puff takes its place.
        const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        const size = (0.35 + 1.1 * t) * fade * fade;
        this.position.set(x + 0.9 * t * t, y + 1.4 + PUFF_RISE * t, z + 0.3 * t);
        this.scale.setScalar(size);
        this.matrix.compose(this.position, this.turn, this.scale);
        smoke.setMatrixAt(c * PUFFS + k, this.matrix);
      }
    }
    smoke.instanceMatrix.needsUpdate = true;
  }
}
