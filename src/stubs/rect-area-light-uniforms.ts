/**
 * Stands in for three's RectAreaLightUniformsLib, whose lookup tables are
 * about 246 KB of the bundle (100 KB gzipped). IWSDK imports it for
 * rect-area lights, and only initialises it when one is added; this app
 * never adds one (vite.config.ts aliases the import here). Fails loudly if
 * that ever changes, rather than drawing the light wrong.
 */
export const RectAreaLightUniformsLib = {
  init(): void {
    throw new Error('Rect-area lights are left out of this build (src/stubs/rect-area-light-uniforms.ts)');
  },
};
