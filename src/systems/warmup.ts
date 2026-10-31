import { createSystem, type Material, type Mesh, type Texture } from '@iwsdk/core';

/** The texture slots of the standard materials the scene uses. */
const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap'] as const;

/**
 * Compiles every material in the scene once the headset session starts,
 * hidden things included (three's compile walks the whole scene): the last
 * night's bulbs, glows, pools and harbour light, the stars, the lamp's
 * flame, the morning glow. Otherwise their shaders would be built in the
 * very frame they first appear, a visible hitch at the season's climax.
 * Done in the session, so the headset's own shader variants are the ones
 * built; asynchronously where the browser can. The prepared models'
 * textures are uploaded then too (the scans already are, at load).
 */
export class WarmupSystem extends createSystem({}) {
  private done = false;

  update(): void {
    if (this.done || !this.renderer.xr.isPresenting) return;
    this.done = true;
    if (import.meta.env.DEV) console.info(`[load] first headset frame at ${(performance.now() / 1000).toFixed(2)} s`);
    void this.renderer.compileAsync(this.world.scene, this.world.camera);
    const textures = new Set<Texture>();
    this.world.scene.traverse((object) => {
      const material = (object as Mesh).material as Material | Material[] | undefined;
      if (material == null) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        for (const slot of SLOTS) {
          const texture = (m as unknown as Record<string, Texture | null | undefined>)[slot];
          if (texture != null) textures.add(texture);
        }
      }
    });
    for (const texture of textures) this.renderer.initTexture(texture);
  }
}
