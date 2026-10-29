import { createSystem, NeutralToneMapping, type Object3D, Vector3 } from '@iwsdk/core';
import { animateWater } from '../station/far-city.js';

/**
 * Keeps the sky with the viewer and the lighting consistent with it.
 *
 * The sky, far mountains and open sea are a Cycles render
 * (art/panorama/build_far_town.py --sky) on the sky dome, which this system
 * centres on the head every frame so the horizon stays at eye level from
 * the seat and the square alike; it also moves the sea's waves. The
 * image-based light is a small render of the city from the square
 * (build_far_town.py --sky --ibl-only). Two things need care:
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
  private dome: Object3D | null = null;
  private eye = new Vector3();

  init(): void {
    this.dome = this.world.scene.getObjectByName('SkyDome') ?? null;
  }

  update(delta: number): void {
    const { scene, renderer } = this.world;
    if (this.dome != null) {
      this.player.head.getWorldPosition(this.eye);
      this.dome.position.copy(this.eye);
    }
    animateWater(delta);
    if (renderer.toneMapping !== NeutralToneMapping) {
      renderer.toneMapping = NeutralToneMapping;
    }
    const light = scene.environmentRotation;
    if (light.x !== 0 || light.y !== 0 || light.z !== 0) light.set(0, 0, 0);
  }
}
