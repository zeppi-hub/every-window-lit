import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/**
 * The model loaders' decoders (Draco meshes, Basis textures) from the game's
 * own folder, not from a public CDN: the engine points them at unpkg.com,
 * and when that cannot be reached the textures never load. The files in
 * public/decoders are three r185's own (examples/jsm/libs). Imported before
 * the world is made, so the loaders are pointed here when they are set up.
 */
const BASE = import.meta.env.BASE_URL;
const fromCdn = (path: string): boolean => /^https?:\/\//.test(path);

const setDecoderPath = DRACOLoader.prototype.setDecoderPath;
DRACOLoader.prototype.setDecoderPath = function (path: string) {
  return setDecoderPath.call(this, fromCdn(path) ? `${BASE}decoders/draco/` : path);
};

const setTranscoderPath = KTX2Loader.prototype.setTranscoderPath;
KTX2Loader.prototype.setTranscoderPath = function (path: string) {
  return setTranscoderPath.call(this, fromCdn(path) ? `${BASE}decoders/basis/` : path);
};
