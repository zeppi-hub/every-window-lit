import { createSystem, NeutralToneMapping } from '@iwsdk/core';

/**
 * Keeps the live town's lighting consistent with the painted far town.
 *
 * The far town is a Cycles panorama rendered from the seat by
 * art/panorama/build_far_town.py (shown by the sky dome), and the
 * image-based light is a small render of the same scene. Two things need care:
 *
 * - Blender renders with the Khronos PBR Neutral view transform; the live
 *   scene uses the same curve so near and far match. The scene JSON can only
 *   name older curves, so the renderer is set here.
 * - IWSDK turns the image-based light by the user's yaw when the headset
 *   recenters, to keep it fixed to the room. SeatSystem turns the whole
 *   station instead, so that compensation would light the town from the
 *   wrong side; it is undone every frame.
 */
export class SkySystem extends createSystem({}) {
  update(): void {
    const { scene, renderer } = this.world;
    if (renderer.toneMapping !== NeutralToneMapping) {
      renderer.toneMapping = NeutralToneMapping;
    }
    const light = scene.environmentRotation;
    if (light.x !== 0 || light.y !== 0 || light.z !== 0) light.set(0, 0, 0);
  }
}
