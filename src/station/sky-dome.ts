import {
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  type Texture,
} from '@iwsdk/core';
import { SEAT_EYE } from './layout.js';

/** The time of day the sky shows, shared with its shader: dusk (0 to 1) and the last night's dark (0 to 1). */
const SKY_TIME = { uDusk: { value: 0 }, uNight: { value: 0 } };
let stars: Points | null = null;

/** Called by EveningSystem: the panorama's daylight turns to dusk, then to night with stars. */
export function setSkyTime(dusk: number, night: number): void {
  SKY_TIME.uDusk.value = dusk;
  SKY_TIME.uNight.value = night;
  if (stars != null) {
    stars.visible = night > 0.02;
    (stars.material as PointsMaterial).opacity = night;
  }
}

/**
 * The panorama by day, re-lit by height for dusk and night: at dusk a warm
 * band along the horizon under a deepening blue, the clouds turning rose;
 * at night a deep blue sky with the clouds faint and grey. Below the
 * horizon (sea and mountains) it only darkens.
 */
function relight(material: MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDusk = SKY_TIME.uDusk;
    shader.uniforms.uNight = SKY_TIME.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkyDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSkyDir = normalize( position );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkyDir;\nuniform float uDusk;\nuniform float uNight;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  {
    vec3 c = diffuseColor.rgb;
    float elev = normalize( vSkyDir ).y;
    float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
    float sat = max( c.r, max( c.g, c.b ) ) - min( c.r, min( c.g, c.b ) );
    float cloud = smoothstep( 0.5, 0.82, lum ) * ( 1.0 - smoothstep( 0.1, 0.28, sat ) );
    float up = smoothstep( 0.0, 0.55, elev );
    vec3 band = mix( vec3( 1.0, 0.6, 0.38 ), vec3( 0.2, 0.25, 0.5 ), pow( up, 0.55 ) );
    vec3 dusk = mix( band * ( 0.55 + 0.6 * lum ), mix( vec3( 1.0, 0.7, 0.6 ), vec3( 0.6, 0.48, 0.58 ), up ) * ( 0.4 + 0.75 * lum ), cloud );
    vec3 night = mix( vec3( 0.06, 0.075, 0.15 ), vec3( 0.025, 0.035, 0.09 ), up ) + cloud * lum * vec3( 0.07, 0.08, 0.12 );
    if ( elev < 0.0 ) {
      dusk = c * vec3( 0.62, 0.55, 0.6 );
      night = c * vec3( 0.12, 0.13, 0.2 );
    }
    diffuseColor.rgb = mix( mix( c, dusk, uDusk ), night, uNight );
  }`,
      );
  };
  material.customProgramCacheKey = () => 'sky-relit';
}

/** About three hundred stars above 15° elevation, as one draw call, shown only on the last night. */
function createStars(): Points {
  const positions: number[] = [];
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  while (positions.length < 320 * 3) {
    const y = 0.26 + random() * 0.74;
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    positions.push(Math.cos(a) * r * 990, y * 990, Math.sin(a) * r * 990);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const points = new Points(
    geometry,
    new PointsMaterial({ color: 0xfff4e0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }),
  );
  points.name = 'Stars';
  points.frustumCulled = false;
  points.visible = false;
  return points;
}

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
  relight(dome.material as MeshBasicMaterial);
  dome.name = 'SkyDome';
  dome.position.set(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  stars = createStars();
  dome.add(stars);
  return dome;
}
