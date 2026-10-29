/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { rm } from 'node:fs/promises';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';

/** The scaffold's agent notes live in public/ but must not ship in dist/. */
function stripAgentNotes(): Plugin {
  return {
    name: 'strip-agent-notes',
    apply: 'build',
    async closeBundle() {
      await Promise.all(
        ['dist/scenes/AGENTS.md', 'dist/ui/AGENTS.md'].map((file) =>
          rm(file, { force: true }),
        ),
      );
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), stripAgentNotes()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      // Bundled with three in one pass, or the dev server serves two copies.
      'three/examples/jsm/loaders/KTX2Loader.js',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
