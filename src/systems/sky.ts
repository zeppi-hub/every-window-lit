import {
  createSystem,
  NeutralToneMapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from '@iwsdk/core';

/**
 * Keeps the painted sky consistent with the live town around it.
 *
 * The sky is not just sky here: it is a Cycles panorama of the far town,
 * rendered from the seat by art/panorama/build_far_town.py, so it has to stay
 * locked to the near geometry and match its colours. Three things need care:
 *
 * - The panorama is an sRGB JPEG, but the dome loader leaves its colour space
 *   unset, so three.js would treat it as linear and tone-map it, washing it
 *   out. Marking it sRGB shows it exactly as Blender rendered it.
 * - Blender renders with the Khronos PBR Neutral view transform; the live
 *   scene uses the same curve so near and far match. The scene JSON can only
 *   name older curves, so the renderer is set here.
 * - IWSDK turns the dome and the image-based lighting by the user's yaw when
 *   the headset recenters, to keep a sky fixed to the room. SeatSystem turns
 *   the whole station instead, so that compensation would slide the far town
 *   away from the near one; it is undone every frame.
 */
export class SkySystem extends createSystem({}) {
  private fixedBackground: Texture | null = null;

  update(): void {
    const { scene, renderer } = this.world;
    const background = scene.background;
    if (background instanceof Texture && background !== this.fixedBackground) {
      if (background.type === UnsignedByteType && background.colorSpace !== SRGBColorSpace) {
        background.colorSpace = SRGBColorSpace;
        background.needsUpdate = true;
      }
      this.fixedBackground = background;
    }
    if (renderer.toneMapping !== NeutralToneMapping) {
      renderer.toneMapping = NeutralToneMapping;
    }
    const sky = scene.backgroundRotation;
    if (sky.x !== 0 || sky.y !== 0 || sky.z !== 0) sky.set(0, 0, 0);
    const light = scene.environmentRotation;
    if (light.x !== 0 || light.y !== 0 || light.z !== 0) light.set(0, 0, 0);
  }
}
