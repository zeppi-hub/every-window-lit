import { createSystem } from '@iwsdk/core';

/**
 * Compiles every material in the scene once the headset session starts,
 * hidden things included (three's compile walks the whole scene): the last
 * night's bulbs, glows, pools and harbour light, the stars, the lamp's
 * flame, the morning glow. Otherwise their shaders would be built in the
 * very frame they first appear, a visible hitch at the season's climax.
 * Done in the session, so the headset's own shader variants are the ones
 * built; asynchronously where the browser can.
 */
export class WarmupSystem extends createSystem({}) {
  private done = false;

  update(): void {
    if (this.done || !this.renderer.xr.isPresenting) return;
    this.done = true;
    void this.renderer.compileAsync(this.world.scene, this.world.camera);
  }
}
