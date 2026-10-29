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
  material.envMapIntensity = 0.6;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      ShaderChunk.lights_fragment_begin.replace(sunLoop, '#if 0'),
    );
  };
  material.customProgramCacheKey = () => 'interior';
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
      .replace('void main() {', 'uniform float uEvening;\nvarying vec2 vStreet;\nvarying vec3 vLit;\nvoid main() {')
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
      // Evenings: about six windows in ten light up, curtained panes glowing warmest.
      shader.uniforms.uEvening = evening;
      shader.fragmentShader = shader.fragmentShader.replace(
        emissiveAnchor,
        `${emissiveAnchor}
        #ifdef USE_COLOR
        {
          vec3 cell = floor( vLit / vec3( 2.2, 3.1, 2.2 ) );
          float on = step( 0.38, fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) );
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
