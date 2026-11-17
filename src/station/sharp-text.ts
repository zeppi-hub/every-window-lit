import type { Material, WebGLProgramParametersWithUniforms } from '@iwsdk/core';

/**
 * Crisper words on the canvas-drawn panels (Tocco's and the family's lines,
 * the question panel, the week card and letter, the tags, the note, the
 * slip): their map is read four times per pixel, a little apart in a
 * rotated grid and one mip level sharper than three would pick, and
 * averaged. Text seen smaller than its canvas (the lines are drawn at about
 * 3000 texels a metre, read from half a metre, and much smaller still in
 * the desktop emulator) otherwise comes from a blurred mip level; the four
 * reads keep its edges without the shimmer a plain negative bias brings.
 * Only these materials; one program for all of them.
 */
const SHARP_MAP = /* glsl */ `
#ifdef USE_MAP
	vec2 sharpDx = dFdx( vMapUv );
	vec2 sharpDy = dFdy( vMapUv );
	vec2 sharpA = 0.125 * sharpDx + 0.375 * sharpDy;
	vec2 sharpB = 0.375 * sharpDx - 0.125 * sharpDy;
	vec4 sampledDiffuseColor = 0.25 * (
		texture( map, vMapUv + sharpA, -1.0 ) + texture( map, vMapUv - sharpA, -1.0 ) +
		texture( map, vMapUv + sharpB, -1.0 ) + texture( map, vMapUv - sharpB, -1.0 ) );
	diffuseColor *= sampledDiffuseColor;
#endif
`;

/** The text textures' anisotropy: three clamps it to what the device allows (16 on a Quest 3). */
export const TEXT_ANISOTROPY = 16;

function sharpenMap(shader: WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', SHARP_MAP);
}

const cacheKey = (): string => 'sharp-text';

/** `material`, its map read the crisp way (above). */
export function sharpText<M extends Material>(material: M): M {
  material.onBeforeCompile = sharpenMap;
  material.customProgramCacheKey = cacheKey;
  return material;
}
