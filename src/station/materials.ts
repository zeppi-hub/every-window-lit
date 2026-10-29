import {
  Color,
  type Material,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from '@iwsdk/core';

/**
 * Photo-scanned PBR materials from Poly Haven (CC0), served from
 * public/textures/<id>/{diff,nor,rough}.jpg. Geometry carries world-scale
 * UVs (see MeshBuilder), so one repeat of a texture covers `metres` metres.
 * Vertex colours tint the albedo, which is how one plaster scan becomes a
 * street of differently painted houses.
 */
export type TextureId =
  | 'painted_plaster_wall'
  | 'roof_09'
  | 'cobblestone_floor_08'
  | 'large_sandstone_blocks_01'
  | 'medieval_blocks_02'
  | 'wood_shutter'
  | 'terracotta_floor_tiles'
  | 'roof_planks';

const loader = new TextureLoader();
const cache = new Map<string, Material>();

function load(id: TextureId, map: 'diff' | 'nor' | 'rough'): Texture {
  const texture = loader.load(`${import.meta.env.BASE_URL}textures/${id}/${map}.jpg`);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  if (map === 'diff') texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Plaster comes out a shade too dark from the mid-grey scan, so it is lifted
 * by the same gain the panorama's Blender material uses; near and far walls
 * then match.
 */
const GAIN: Partial<Record<TextureId, number>> = { painted_plaster_wall: 1.45 };

export function scanned(id: TextureId, options: { roughness?: number } = {}): Material {
  const key = `${id}:${options.roughness ?? 1}`;
  let material = cache.get(key);
  if (material == null) {
    material = new MeshStandardMaterial({
      color: new Color().setScalar(GAIN[id] ?? 1),
      map: load(id, 'diff'),
      normalMap: load(id, 'nor'),
      roughnessMap: load(id, 'rough'),
      roughness: options.roughness ?? 1,
      metalness: 0,
      vertexColors: true,
    });
    cache.set(key, material);
  }
  return material;
}

/** Untextured PBR surface for things too far or too plain to need a scan. */
export function plain(roughness = 0.9, metalness = 0): Material {
  const key = `plain:${roughness}:${metalness}`;
  let material = cache.get(key);
  if (material == null) {
    material = new MeshStandardMaterial({ roughness, metalness, vertexColors: true });
    cache.set(key, material);
  }
  return material;
}
