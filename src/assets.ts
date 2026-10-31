import { AssetType, defineAssets } from '@iwsdk/core';

/**
 * The station (room, window, town) is mostly generated in code at runtime.
 * The prepared realistic models (public/models, see art/models/process.py
 * and CREDITS.md) are loaded before it is built; textures and sounds load
 * on their own.
 */
export default defineAssets({
  lantern: { url: 'models/lantern.glb', type: AssetType.GLTF, priority: 'critical', name: 'Sunday lamp (Poly Haven Lantern_01)' },
  car_cord: { url: 'models/car_cord.glb', type: AssetType.GLTF, priority: 'critical', name: 'Parked car (1936 Cord 812 look-alike, Libau Media)' },
  car_model_a: { url: 'models/car_model_a.glb', type: AssetType.GLTF, priority: 'critical', name: 'Parked car (Model A V2, Libau Media)' },
  car_pv: { url: 'models/car_pv.glb', type: AssetType.GLTF, priority: 'critical', name: 'Parked car (PV654 sedan, Libau Media)' },
  bicycle: { url: 'models/bicycle.glb', type: AssetType.GLTF, priority: 'critical', name: 'Bicycle (wasabicats)' },
  bench: { url: 'models/bench.glb', type: AssetType.GLTF, priority: 'critical', name: 'Bench (Poly Haven modular_street_seating)' },
  fountain: { url: 'models/fountain.glb', type: AssetType.GLTF, priority: 'critical', name: 'Fountain (Barenbrunnen scan, noe-3d.at)' },
  tower_key: { url: 'models/tower_key.glb', type: AssetType.GLTF, priority: 'critical', name: 'Tower key (Zakrzowek key scan, Virtual Museums of Malopolska)' },
  basket: { url: 'models/basket.glb', type: AssetType.GLTF, priority: 'critical', name: 'Basket (Poly Haven wicker_basket_01)' },
  folk_suit: { url: 'models/folk_suit.glb', type: AssetType.GLTF, priority: 'critical', name: 'Townsman (Quaternius, Man in Suit)' },
  folk_dress: { url: 'models/folk_dress.glb', type: AssetType.GLTF, priority: 'critical', name: 'Townswoman (Quaternius, Woman in Dress)' },
});
