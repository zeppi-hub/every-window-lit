import {
  DirectionalLight,
  type Object3D,
  PCFShadowMap,
  type World,
} from '@iwsdk/core';
import { PLAZA_Y } from './layout.js';

/** Direction to the sun in the panorama (art/panorama/sun_direction.py). */
const SUN = { x: -0.593, y: 0.743, z: 0.31 } as const;
/** Centre of the shadowed area: the square and the row of houses across it. */
const FOCUS = { x: 4, y: PLAZA_Y, z: -16 } as const;

/**
 * Sun shadows for the live near town, drawn once.
 *
 * Nothing near the square moves except birds and laundry, so the shadow map
 * is rendered a single time after the station is built and never updated:
 * houses, the tower and the fountain shade the paving at the cost of one
 * shadow lookup per fragment, with no per-frame shadow pass. The far town
 * already has Cycles shadows baked into the panorama.
 */
export function enableStaticShadows(world: World, casters: Object3D[], receivers: Object3D[]): void {
  let sun: DirectionalLight | null = null;
  world.scene.traverse((object) => {
    if (sun == null && object instanceof DirectionalLight) sun = object;
  });
  if (sun == null) return;
  const light: DirectionalLight = sun;

  const renderer = world.renderer;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  // Aim the shadow camera along the panorama's sun at the square.
  light.target.position.set(FOCUS.x, FOCUS.y, FOCUS.z);
  light.position.set(FOCUS.x + SUN.x * 70, FOCUS.y + SUN.y * 70, FOCUS.z + SUN.z * 70);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.03;
  const camera = light.shadow.camera;
  camera.left = -36;
  camera.right = 36;
  camera.top = 30;
  camera.bottom = -30;
  camera.near = 20;
  camera.far = 140;
  camera.updateProjectionMatrix();

  for (const root of casters) {
    root.traverse((object) => {
      object.castShadow = true;
    });
  }
  for (const root of receivers) {
    root.traverse((object) => {
      object.receiveShadow = true;
    });
  }
  renderer.shadowMap.needsUpdate = true;
}
