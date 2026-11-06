// Lets `node --test` build the station's real meshes (src/station/*.ts) to measure them.
//
// The station's modules import each other as './x.js' (Vite resolves those to the .ts files) and use
// TypeScript that type stripping alone cannot run, so .ts files under src/ are loaded with Node's own
// type transform. The builders draw their labels on canvases: a stub canvas that draws nothing stands in
// (nothing here reads pixels). Import this file before any station module.
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith(SRC)) {
      const ts = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(ts))) return next(ts.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(SRC) && url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')}`, shortCircuit: true };
    if (url.startsWith(SRC) && url.endsWith('.ts')) {
      // Vite writes import.meta.env.DEV in at build time; node has no import.meta.env, so the dev-only logs are off, as when shipped.
      const source = readFileSync(fileURLToPath(url), 'utf8').replaceAll('import.meta.env.DEV', 'false');
      return { format: 'module', source: stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: url }), shortCircuit: true };
    }
    return next(url, context);
  },
});

const gradient = { addColorStop() {} };
const context2d = new Proxy(
  {},
  {
    get(_, key) {
      if (key === 'measureText') return (text) => ({ width: String(text).length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => gradient;
      if (key === 'getImageData' || key === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return typeof key === 'string' ? () => undefined : undefined;
    },
    set: () => true,
  },
);
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context2d }) };
