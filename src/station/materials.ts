import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  Color,
  type Material,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  ShaderChunk,
  SRGBColorSpace,
  type Texture,
  Vector3,
  type World,
} from '@iwsdk/core';
import { PLAZA_Y } from './layout.js';

/**
 * Photo-scanned PBR materials from Poly Haven (CC0), stored as KTX2 in
 * public/textures/<id>/{diff,nor,rough}.ktx2 (see art/textures/encode_ktx2.sh).
 * Geometry carries world-scale UVs (see MeshBuilder), so one repeat of a
 * texture covers its real size. Vertex colours tint the albedo, which is how
 * one plaster scan becomes a street of differently painted houses.
 *
 * Everything is loaded before the station is built, so no surface is ever
 * drawn with a missing texture (black albedo, mirror-smooth roughness).
 */
export type TextureId =
  | 'painted_plaster_wall'
  | 'roof_09'
  | 'cobblestone_floor_08'
  | 'large_sandstone_blocks_01'
  | 'medieval_blocks_02'
  | 'wood_shutter'
  | 'terracotta_floor_tiles'
  | 'roof_planks'
  | 'red_brick_03'
  | 'white_sandstone_blocks_02'
  | 'concrete_floor_02';

/**
 * Surfaces within arm's reach keep normal and roughness maps. Since the
 * Keeper walks the streets, that now includes the town's walls and paving.
 */
const DETAILED: TextureId[] = [
  'medieval_blocks_02',
  'terracotta_floor_tiles',
  'roof_planks',
  'large_sandstone_blocks_01',
  'wood_shutter',
  'painted_plaster_wall',
  'cobblestone_floor_08',
  'red_brick_03',
  'white_sandstone_blocks_02',
  'concrete_floor_02',
];
/** Seen from 9 m or more: albedo only, at half resolution. */
const ALBEDO_ONLY: TextureId[] = ['roof_09'];

/**
 * Plaster comes out a shade too dark from the mid-grey scan, so it is lifted
 * by the same gain the panorama's Blender material uses; near and far walls
 * then match.
 */
const GAIN: Partial<Record<TextureId, number>> = { painted_plaster_wall: 1.45, concrete_floor_02: 1.7, white_sandstone_blocks_02: 1.05 };
/** Scans whose relief reads too rough at their size get a softer normal map. */
const NORMAL_SCALE: Partial<Record<TextureId, number>> = { white_sandstone_blocks_02: 0.5 };

const scans = new Map<string, Texture>();
let sky: Texture | null = null;
const cache = new Map<string, Material>();

/** Loads every scan and the sky panorama, and uploads them to the GPU now. */
export async function preloadTextures(world: World): Promise<void> {
  const loader = new KTX2Loader()
    .setTranscoderPath(`${import.meta.env.BASE_URL}basis/`)
    .setWorkerLimit(2)
    .detectSupport(world.renderer);
  // Sampler settings must be set before initTexture uploads the texture;
  // changed afterwards they are ignored (the scans then clamp and streak).
  const load = async (path: string, colour: boolean, tiled: boolean): Promise<Texture> => {
    const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}${path}.ktx2`);
    texture.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
    if (tiled) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.anisotropy = colour ? 4 : 1;
    }
    world.renderer.initTexture(texture);
    return texture;
  };
  const files = [
    ...DETAILED.flatMap((id) => [`${id}/diff`, `${id}/nor`, `${id}/rough`]),
    ...ALBEDO_ONLY.map((id) => `${id}/diff`),
  ];
  await Promise.all([
    ...files.map(async (file) => {
      scans.set(file, await load(`textures/${file}`, file.endsWith('/diff'), true));
    }),
    load('env/ombrisa_sky', true, false).then((texture) => {
      sky = texture;
    }),
  ]);
  loader.dispose();
}

export function skyTexture(): Texture {
  if (sky == null) throw new Error('preloadTextures() must finish before the sky is built');
  return sky;
}

function scan(id: TextureId, map: 'diff' | 'nor' | 'rough'): Texture | null {
  return scans.get(`${id}/${map}`) ?? null;
}

/**
 * Inside the tower the only light is what comes through the window: the sky,
 * not the sun, which sits behind the tower. Shadows are off, so the direct
 * sun term is removed from interior shaders instead; without it the sill and
 * jambs glowed as bright as the square outside.
 */
function keepOutOfSun(material: MeshStandardMaterial): void {
  const sunLoop = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
  if (!ShaderChunk.lights_fragment_begin.includes(sunLoop)) {
    console.warn('[materials] three changed lights_fragment_begin; interior sun stays on');
    return;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRoomSky = ROOM_LIGHT.uRoomSky;
    shader.uniforms.uLamp = ROOM_LIGHT.uLamp;
    shader.uniforms.uLampPos = ROOM_LIGHT.uLampPos;
    shader.uniforms.uLampColor = ROOM_LIGHT.uLampColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoomWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vec4 roomWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    roomWorld = instanceMatrix * roomWorld;
  #endif
  vRoomWorld = ( modelMatrix * roomWorld ).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoomWorld;\nuniform float uRoomSky;\nuniform float uLamp;\nuniform vec3 uLampPos;\nuniform vec3 uLampColor;')
      .replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin.replace(sunLoop, '#if 0'))
      // The sky light through the window, less of it behind closed shutters. (A material's envMapIntensity
      // is ignored while the scene's environment lights it, so the shutters scale it here.)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  irradiance *= uRoomSky;\n  iblIrradiance *= uRoomSky;\n  radiance *= uRoomSky;')
      // The Sunday lamp's pool: it warms each surface's own colour, strongest beside the lamp.
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  vec3 toLamp = vRoomWorld - uLampPos;
  totalEmissiveRadiance += diffuseColor.rgb * uLampColor * ( uLamp * 0.9 / ( 1.0 + 8.0 * dot( toLamp, toLamp ) ) );`,
      );
  };
  material.customProgramCacheKey = () => 'interior';
}

/** The tower room's light, shared by all its shaders: the sky through the window (the shutters), and the Sunday lamp. */
const ROOM_LIGHT = {
  uRoomSky: { value: 1 },
  uLamp: { value: 0 },
  uLampPos: { value: new Vector3() },
  uLampColor: { value: new Color(1.0, 0.62, 0.3) },
};

/**
 * Daylight in the tower room by how far the shutters are open (0 to 1):
 * behind closed shutters only a little sky comes through the slats, never
 * so little that the stone turns black.
 */
export function setRoomDaylight(open: number): void {
  ROOM_LIGHT.uRoomSky.value = 0.22 + 0.78 * open;
}

/** A painted, partly transparent decal for the tower room: lit like its stone and wood, with a little light of its own so it reads in the dim. */
export function interiorPaint(map: Texture): MeshStandardMaterial {
  const standard = new MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  standard.emissive.setRGB(0.22, 0.2, 0.17);
  standard.emissiveMap = map;
  keepOutOfSun(standard);
  return standard;
}

/**
 * Street-level shading for everything outdoors. A wall sees less sky the
 * nearer it is to the ground and to the street canyon's floor, so the sky
 * and bounce light on vertical surfaces fades towards their foot: softly
 * over the lowest metre, where they meet the paving, and slightly over the
 * lower floors. The sun is left alone; a sunlit wall shows no such
 * darkening. Ground, roofs and anything well below the square (the quay
 * wall over the sea) are untouched. Per fragment, so a single quad from
 * the paving to the cornice still gets it.
 */
function shadeStreetLevel(material: MeshStandardMaterial, lit = false): void {
  const vertexAnchor = '#include <project_vertex>';
  const fragmentAnchor = '#include <aomap_fragment>';
  const emissiveAnchor = '#include <emissivemap_fragment>';
  if (
    !ShaderChunk.meshphysical_vert.includes(vertexAnchor) ||
    !ShaderChunk.meshphysical_frag.includes(fragmentAnchor) ||
    !ShaderChunk.meshphysical_frag.includes(emissiveAnchor)
  ) {
    console.warn('[materials] three changed the standard shader; street-level shading is off');
    return;
  }
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vStreet;\nvarying vec3 vLit;\nvoid main() {')
      .replace(
        vertexAnchor,
        `${vertexAnchor}
        vec4 streetPosition = vec4( transformed, 1.0 );
        vec3 streetNormal = objectNormal;
        #ifdef USE_INSTANCING
          streetPosition = instanceMatrix * streetPosition;
          streetNormal = mat3( instanceMatrix ) * streetNormal;
        #endif
        vLit = ( modelMatrix * streetPosition ).xyz;
        vStreet = vec2( vLit.y, normalize( mat3( modelMatrix ) * streetNormal ).y );`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uEvening;\nuniform float uLitShare;\nuniform float uShut;\nvarying vec2 vStreet;\nvarying vec3 vLit;\nvoid main() {')
      .replace(
        fragmentAnchor,
        `${fragmentAnchor}
        {
          float height = vStreet.x - ${PLAZA_Y.toFixed(3)};
          float foot = mix( 0.5, 1.0, smoothstep( 0.0, 1.1, height ) );
          float canyon = mix( 0.85, 1.0, smoothstep( 0.0, 14.0, height ) );
          float wall = ( 1.0 - abs( vStreet.y ) ) * smoothstep( -0.9, -0.5, height );
          float street = mix( 1.0, foot * canyon, wall );
          reflectedLight.indirectDiffuse *= street;
          reflectedLight.indirectSpecular *= street;
        }`,
      );
    if (lit) {
      // Evenings: a share of the windows light up (about eight in ten in a calm week), curtained panes glowing warmest.
      shader.uniforms.uEvening = evening;
      shader.uniforms.uLitShare = litShare;
      shader.uniforms.uShut = shutShare;
      // A heat wave: by day a share of the panes show closed green shutters instead of glass.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef USE_COLOR
        {
          vec3 pane = floor( vLit / vec3( 2.2, 3.1, 2.2 ) );
          float shut = step( 1.0 - uShut, fract( sin( dot( pane, vec3( 39.346, 11.135, 83.155 ) ) ) * 24634.6345 ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.16, 0.24, 0.19 ), shut * ( 1.0 - uEvening ) );
        }
        #endif`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        emissiveAnchor,
        `${emissiveAnchor}
        #ifdef USE_COLOR
        {
          vec3 cell = floor( vLit / vec3( 2.2, 3.1, 2.2 ) );
          float on = step( 1.0 - uLitShare, fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) );
          float curtain = smoothstep( 0.04, 0.2, dot( vColor.rgb, vec3( 0.333 ) ) );
          totalEmissiveRadiance += vec3( 1.0, 0.7, 0.36 ) * uEvening * on * ( 0.3 + 1.5 * curtain );
        }
        #endif`,
      );
    }
  };
  material.customProgramCacheKey = () => (lit ? 'street-lit' : 'street');
}

/**
 * How far into the evening the town is, 0 by day to 1 at dusk; the
 * evening system eases it. Shared as a shader uniform by the lit window glass.
 */
export const evening = { value: 0 };

/**
 * Share of the town's windows that light up in the evening: about eight in
 * ten in a calm week, fewer when power prices bite (TownSystem). Shared as
 * a shader uniform; each window keeps its own place in the order, so a
 * lower share turns off windows rather than shuffling them.
 */
export const litShare = { value: 0.8 };

export function setLitShare(share: number): void {
  litShare.value = share;
}

/** Share of the town's panes behind closed shutters by day: none, except in a heat wave (WeatherSystem). */
export const shutShare = { value: 0 };

export function setShutShare(share: number): void {
  shutShare.value = share;
}

/**
 * The weather's tone over the sky and light, eased by WeatherSystem and
 * applied by EveningSystem with the evening's own: `overcast` greys and
 * dims a storm, `chill` cools a cold snap's light. Both 0 to 1.
 */
export const weatherSky = { overcast: 0, chill: 0 };

/** The town's window glass: like plain(0.12), but its windows light up in the evening. */
export function windowGlass(): Material {
  let material = cache.get('window-glass');
  if (material == null) {
    const standard = new MeshStandardMaterial({ roughness: 0.12, metalness: 0, vertexColors: true });
    shadeStreetLevel(standard, true);
    material = standard;
    cache.set('window-glass', material);
  }
  return material;
}

/**
 * Options: `interior` for the tower room (no direct sun); `street: false`
 * for outdoor things that do not stand on the square, such as boats at sea
 * level, which street-level shading would wrongly darken.
 */
export function scanned(id: TextureId, options: { interior?: boolean; street?: boolean } = {}): Material {
  const street = options.street ?? true;
  const key = `${id}:${options.interior ? 'in' : 'out'}:${street}`;
  let material = cache.get(key);
  if (material == null) {
    const standard = new MeshStandardMaterial({
      color: new Color().setScalar(GAIN[id] ?? 1),
      map: scan(id, 'diff'),
      normalMap: scan(id, 'nor'),
      roughnessMap: scan(id, 'rough'),
      roughness: scan(id, 'rough') ? 1 : 0.9,
      metalness: 0,
      vertexColors: true,
    });
    const relief = NORMAL_SCALE[id];
    if (relief != null) standard.normalScale.set(relief, relief);
    if (options.interior) keepOutOfSun(standard);
    else if (street) shadeStreetLevel(standard);
    material = standard;
    cache.set(key, material);
  }
  return material;
}

/**
 * An untextured interior surface of its own, never shared: for the few
 * things the Keeper handles, whose emissive is pulsed to point them out.
 */
export function glowing(roughness: number, metalness = 0): MeshStandardMaterial {
  const standard = new MeshStandardMaterial({ roughness, metalness, vertexColors: true });
  keepOutOfSun(standard);
  return standard;
}

/**
 * The Sunday lamp's warm light on the tower room, by `amount` (0 to 1), from
 * the flame at `at` (world): every interior shader adds a pool of it that
 * falls off with distance and takes each surface's own colour, so the stone
 * keeps its texture. Cheaper than a point light, which would cost a
 * lighting term on every surface in the town.
 */
export function setRoomGlow(amount: number, at: Vector3): void {
  ROOM_LIGHT.uLamp.value = amount;
  ROOM_LIGHT.uLampPos.value.copy(at);
}

/** Untextured PBR surface for things too far or too plain to need a scan. */
export function plain(roughness = 0.9, metalness = 0, interior = false, street = true): Material {
  const key = `plain:${roughness}:${metalness}:${interior}:${street}`;
  let material = cache.get(key);
  if (material == null) {
    const standard = new MeshStandardMaterial({ roughness, metalness, vertexColors: true });
    if (interior) keepOutOfSun(standard);
    else if (street) shadeStreetLevel(standard);
    material = standard;
    cache.set(key, material);
  }
  return material;
}
