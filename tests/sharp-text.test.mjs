// Crisper words on the canvas panels (17 Nov): their map read four times a pixel, one mip sharper, and the
// text textures at the device's top anisotropy; the line bands nearly opaque. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const { MeshBasicMaterial } = await import('@iwsdk/core');
const { sharpText, TEXT_ANISOTROPY } = await import('../src/station/sharp-text.ts');

test('the map is read four times, a mip sharper, in place of the plain read; one program for every text material', () => {
  const a = sharpText(new MeshBasicMaterial());
  const b = sharpText(new MeshBasicMaterial({ transparent: true }));
  const shader = { fragmentShader: 'void main() {\n#include <map_fragment>\n}', vertexShader: '', uniforms: {} };
  a.onBeforeCompile(shader);
  assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'));
  assert.equal(shader.fragmentShader.match(/texture\( map, vMapUv [+-] sharp[AB], -1\.0 \)/g)?.length, 4);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.equal(a.onBeforeCompile, b.onBeforeCompile);
  assert.equal(TEXT_ANISOTROPY, 16);
});

test('every panel with words uses it, and the line bands are nearly opaque', () => {
  for (const file of ['tocco', 'family', 'ask', 'card', 'tags', 'globe', 'weather']) {
    const source = readFileSync(new URL(`../src/station/${file}.ts`, import.meta.url), 'utf8');
    assert.match(source, /sharpText\(new MeshBasicMaterial/, file);
    assert.match(source, /anisotropy = TEXT_ANISOTROPY/, file);
  }
  assert.match(readFileSync(new URL('../src/station/family.ts', import.meta.url), 'utf8'), /rgba\(20, 18, 16, 0\.9\)/);
  assert.match(readFileSync(new URL('../src/station/ask.ts', import.meta.url), 'utf8'), /rgba\(20, 18, 16, 0\.9\)/);
});
