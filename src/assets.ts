import { AssetType, defineAssets } from '@iwsdk/core';

/**
 * The station (room, window, town) is mostly generated in code at runtime.
 * The prepared realistic models (public/models, see art/models/process.py
 * and CREDITS.md) are loaded before it is built; textures and sounds load
 * on their own.
 */
export default defineAssets({
  lantern: { url: 'models/lantern.glb', type: AssetType.GLTF, priority: 'critical', name: 'Sunday lamp (Poly Haven Lantern_01)' },
  car_a: { url: 'models/car_a.glb', type: AssetType.GLTF, priority: 'critical', name: 'Parked car (Historical Car, coffeecat)' },
  car_b: { url: 'models/car_b.glb', type: AssetType.GLTF, priority: 'critical', name: 'Parked car (SM Retro Car 01 A, sanyabeast)' },
  car_c: { url: 'models/car_c.glb', type: AssetType.GLTF, priority: 'critical', name: 'Parked light truck (sipabyss)' },
  bicycle: { url: 'models/bicycle.glb', type: AssetType.GLTF, priority: 'critical', name: 'Bicycle (wasabicats)' },
  bench: { url: 'models/bench.glb', type: AssetType.GLTF, priority: 'critical', name: 'Bench (Poly Haven modular_street_seating)' },
  fountain: { url: 'models/fountain2.glb', type: AssetType.GLTF, priority: 'critical', name: 'Fountain (The Old Fountain, Shaddy)' },
  tower_key: { url: 'models/tower_key.glb', type: AssetType.GLTF, priority: 'critical', name: 'Tower key (Zakrzowek key scan, Virtual Museums of Malopolska)' },
  basket: { url: 'models/basket.glb', type: AssetType.GLTF, priority: 'critical', name: 'Basket (Poly Haven wicker_basket_01)' },
  folk_suit: { url: 'models/folk_suit.glb', type: AssetType.GLTF, priority: 'critical', name: 'Townsman (Quaternius, Man in Suit)' },
  folk_dress: { url: 'models/folk_dress.glb', type: AssetType.GLTF, priority: 'critical', name: 'Townswoman (Quaternius, Woman in Dress)' },
});
