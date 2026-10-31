// Writes public/third-party-notices.txt: the licence notice of every open-source
// package bundled into the build (found from the build's source maps on
// 31 Oct 2026), plus the Basis Universal transcoder served from public/basis.
// Run with `node scripts/notices.mjs` after changing dependencies.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLED = [
  '@drawcall/uikitml', '@iwsdk/core', '@iwsdk/locomotor', '@iwsdk/scene-composition', '@iwsdk/xr-input',
  '@pmndrs/handle', '@pmndrs/pointer-events', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide',
  '@pmndrs/uikit-pub-sub', '@preact/signals-core', '@zappar/msdf-generator', 'comlink', 'elics', 'entities',
  'lucide', 'three', 'three-mesh-bvh', 'yoga-layout', 'zod',
];

/** Packages published without a licence file: what their package.json and repository say. */
const NO_FILE = {
  'yoga-layout': 'MIT License\n\nCopyright (c) Meta Platforms, Inc. and affiliates.\n\n' + 'MIT_TEXT',
  '@drawcall/uikitml':
    'The npm package publishes no licence file and no licence field (repository: https://github.com/drawcall-ai/uikitml).\nIt is bundled only as a dependency of @iwsdk/core (MIT), which uses it to read UI markup.',
};

const root = new URL('..', import.meta.url).pathname;
// The MIT text as three.js ships it, without its copyright line.
const MIT = readFileSync(join(root, 'node_modules', 'three', 'LICENSE'), 'utf8').split('\n').filter((l) => !/^copyright/i.test(l.trim())).join('\n').replace(/^The MIT License\s*/i, '').trim();
const parts = [
  'Every Window Lit: third-party software notices',
  '',
  'The game bundles the open-source packages below. Each keeps its own licence, reproduced here.',
  'Game data, sounds and textures are credited separately in credits.html.',
];

for (const name of BUNDLED) {
  const dir = join(root, 'node_modules', name);
  if (!existsSync(dir)) throw new Error(`missing package ${name}`);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  const text = file != null ? readFileSync(join(dir, file), 'utf8').trim() : NO_FILE[name]?.replace('MIT_TEXT', MIT);
  if (text == null) throw new Error(`no licence file in ${name}`);
  parts.push('', '='.repeat(72), `${name} ${pkg.version} (${pkg.license ?? 'no licence field'})`, '='.repeat(72), '', text);
}

parts.push(
  '', '='.repeat(72), 'Basis Universal transcoder (public/basis), Apache License 2.0', '='.repeat(72), '',
  'Copyright 2019-2024 Binomial LLC. https://github.com/BinomialLLC/basis_universal',
  'Shipped unmodified as distributed with three.js (examples/jsm/libs/basis).',
  '',
  readFileSync(join(root, 'node_modules', 'playwright-core', 'LICENSE'), 'utf8').trim().split('\n').filter((l) => !/Portions Copyright|Modifications copyright/i.test(l)).join('\n'),
);

writeFileSync(join(root, 'public', 'third-party-notices.txt'), `${parts.join('\n')}\n`);
console.log(`wrote public/third-party-notices.txt (${BUNDLED.length + 1} entries)`);
