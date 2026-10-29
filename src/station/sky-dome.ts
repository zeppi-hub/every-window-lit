import {
  BackSide,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Texture,
} from '@iwsdk/core';
import { SEAT_EYE } from './layout.js';

/**
 * The sky, the far mountains and the open sea to the horizon: the Cycles
 * render ombrisa_sky on the inside of a sphere. Everything nearer is real
 * 3D (the near town and the far city), so nothing in the sky has parallax
 * to keep, and SkySystem moves the sphere with the viewer: the horizon is
 * at eye level wherever the Keeper stands. A scene background would be
 * converted to a cube map the size of the image's height, plus depth
 * buffers, which costs several hundred MB of GPU memory on Quest; a plain
 * textured sphere costs only the texture.
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
    // Inside the camera's far plane (1500 m), outside everything in the city.
    new SphereGeometry(1000, 64, 32),
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
