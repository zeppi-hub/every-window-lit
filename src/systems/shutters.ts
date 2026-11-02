import { createSystem, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';
import { ShutterLeaf, Side, Week } from '../components.js';
import { onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { setRoomDaylight } from '../station/materials.js';
import { windowLight } from '../talk.js';

/** Fully open, a leaf lies almost flat against the facade. */
const OPEN_ANGLE = (165 * Math.PI) / 180;
/** Eased swing (1/s); the room's light follows it, reaching 95% in about 1.9 s, never a sudden white frame. */
const SWING_RATE = 1.6;
/** The light sheets through the closed slats, at full strength. */
const SLAT_LIGHT = 0.12;
/** The patch of lamplight that swings across the closed shutters: its strength, how far it swings each way (m), one swing there and back (s). */
const SWAY_LIGHT = 0.6;
const SWAY_REACH = 0.32;
const SWAY_SECONDS = 3.5;

/**
 * Swings the shutters to match the week's `shuttersOpen`, which the latch
 * toggles (BasketSystem decides, and keeps them open while the basket is
 * on its way or on the sill). The left leaf turns positive about Y and the
 * right one negative, so both swing out over the square, away from the
 * seated player. The room's daylight follows them: dim behind closed
 * shutters, with thin sheets of light through the slats, full once open.
 */
export class ShutterSystem extends createSystem({
  leaves: { required: [ShutterLeaf] },
  week: { required: [Week] },
}) {
  private light: Mesh | null = null;
  private sway: Mesh | null = null;
  private shown = -1;
  private elapsed = 0;
  /** The week was just kept: the patch no longer swings, it blinks Lina's goodbye; until the shutters open again. */
  private kept = false;
  /** Dev build: what the patch was doing last frame, so each change is logged once. */
  private swayWas = '';

  init(): void {
    this.light = (this.world.scene.getObjectByName('ShutterLight') as Mesh | undefined) ?? null;
    this.sway = (this.world.scene.getObjectByName('ShutterSway') as Mesh | undefined) ?? null;
    this.cleanupFuncs.push(
      onSignal('kept', () => {
        this.kept = true;
      }),
    );
  }

  update(delta: number): void {
    let shuttersOpen = false;
    for (const week of this.queries.week.entities) shuttersOpen = week.getValue(Week, 'shuttersOpen') ?? false;
    const target = shuttersOpen ? 1 : 0;
    const blend = 1 - Math.exp(-SWING_RATE * delta);
    let sum = 0;
    let leaves = 0;
    for (const entity of this.queries.leaves.entities) {
      const object = entity.object3D;
      if (object == null) continue;
      entity.setValue(ShutterLeaf, 'target', target);
      let open = entity.getValue(ShutterLeaf, 'open') ?? 0;
      sum += open;
      leaves += 1;
      if (Math.abs(target - open) < 0.0005) continue;
      open += (target - open) * blend;
      if (Math.abs(target - open) < 0.001) open = target;
      entity.setValue(ShutterLeaf, 'open', open);
      const sign = entity.getValue(ShutterLeaf, 'side') === Side.Left ? 1 : -1;
      object.rotation.y = sign * open * OPEN_ANGLE;
    }
    const open = leaves > 0 ? sum / leaves : 0;
    if (shuttersOpen) this.kept = false;
    this.elapsed += delta;
    this.swing(open);
    // Interior materials also go outdoors (the basket, its objects, the shutters' outer faces): down on the
    // square they take the full sky. The stance changes under the walk's fade, so the jump is never seen.
    const daylight = stance() === 'walk' ? 1 : open;
    if (Math.abs(daylight - this.shown) < 0.001) return;
    this.shown = daylight;
    setRoomDaylight(daylight);
    if (this.light != null) {
      // Gone well before the leaves are fully open: the slats stop facing the room.
      const strength = Math.max(0, 1 - open * 2.5);
      this.light.visible = strength > 0.01;
      (this.light.material as MeshBasicMaterial).opacity = SLAT_LIGHT * strength;
    }
  }

  /**
   * The patch of lamplight through the lowest slats: while the room is shut
   * it swings from side to side, every 3.5 s, as if someone outside carried
   * a lamp past; it fades as the shutters open with the other sheets. Once
   * the week is kept it stops swinging and only blinks the goodbye from
   * Lina's window (season/window-light.ts), still, in the middle.
   */
  private swing(open: number): void {
    const sway = this.sway;
    if (sway == null) return;
    const strength = Math.max(0, 1 - open * 2.5);
    const lina = windowLight();
    const farewell = this.kept && lina.state === 'farewell';
    const amount = strength * (this.kept ? (farewell ? lina.level : 0) : 1);
    sway.visible = amount > 0.01;
    if (import.meta.env.DEV) {
      const now = !sway.visible ? 'dark' : this.kept ? 'blinks goodbye' : 'swings';
      if (now !== this.swayWas) {
        this.swayWas = now;
        console.info(`[strip] ${now}`);
      }
    }
    if (!sway.visible) return;
    sway.position.x = this.kept ? 0 : SWAY_REACH * Math.sin((2 * Math.PI * this.elapsed) / SWAY_SECONDS);
    // A carried flame is never quite steady.
    const flicker = this.kept ? 1 : 0.9 + 0.1 * Math.sin(this.elapsed * 7.1) * Math.sin(this.elapsed * 3.3);
    (sway.material as MeshBasicMaterial).opacity = SWAY_LIGHT * amount * flicker;
  }
}
