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
    load('env/ombrisa_pano', true, false).then((texture) => {
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

export function scanned(id: TextureId, options: { interior?: boolean } = {}): Material {
  const key = `${id}:${options.interior ? 'in' : 'out'}`;
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
    if (options.interior) keepOutOfSun(standard);
    material = standard;
    cache.set(key, material);
  }
  return material;
}

/** Untextured PBR surface for things too far or too plain to need a scan. */
export function plain(roughness = 0.9, metalness = 0, interior = false): Material {
  const key = `plain:${roughness}:${metalness}:${interior}`;
  let material = cache.get(key);
  if (material == null) {
    const standard = new MeshStandardMaterial({ roughness, metalness, vertexColors: true });
    if (interior) keepOutOfSun(standard);
    material = standard;
    cache.set(key, material);
  }
  return material;
}
