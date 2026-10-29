import {
  BackSide,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Texture,
} from '@iwsdk/core';
import { SEAT_EYE } from './layout.js';

/**
 * The far town and sky: the Cycles panorama on the inside of a sphere around
 * the seat. A scene background would be converted to a cube map the size of
 * the image's height, plus depth buffers, which costs several hundred MB of
 * GPU memory on Quest; a plain textured sphere costs only the texture.
 *
 * The panorama follows three.js's equirectangular convention (u = 0.5 looks
 * along +x, u = 0.25 along -z); SphereGeometry runs u the other way round,
 * so the texture is mirrored horizontally to line up. The mirrored u stays
 * inside 0..1, so the default clamped sampling is enough.
 */
export function createSkyDome(texture: Texture): Mesh {
  texture.repeat.x = -1;
  texture.offset.x = 1;
  const dome = new Mesh(
    new SphereGeometry(150, 64, 32),
    new MeshBasicMaterial({
      map: texture,
      side: BackSide,
      toneMapped: false,
      fog: false,
      depthWrite: false,
      depthTest: false,
    }),
  );
  dome.name = 'SkyDome';
  dome.position.set(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}
