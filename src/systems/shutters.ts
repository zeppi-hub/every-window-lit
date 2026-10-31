import { createSystem, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';
import { ShutterLeaf, Side, Week } from '../components.js';
import { stance } from '../stance.js';
import { setRoomDaylight } from '../station/materials.js';

/** Fully open, a leaf lies almost flat against the facade. */
const OPEN_ANGLE = (165 * Math.PI) / 180;
const SWING_RATE = 2.4;
/** The light sheets through the closed slats, at full strength. */
const SLAT_LIGHT = 0.12;

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
  private shown = -1;

  init(): void {
    this.light = (this.world.scene.getObjectByName('ShutterLight') as Mesh | undefined) ?? null;
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
}
