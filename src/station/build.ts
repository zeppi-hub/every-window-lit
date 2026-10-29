import { OneHandGrabbable, PokeInteractable, RayInteractable, type World } from '@iwsdk/core';
import { Axis, PokeButton, PullHandle, ShutterLeaf, Side } from '../components.js';
import { skyTexture } from './materials.js';
import { createRoom, LATCH_REST, LATCH_THRESHOLD, LATCH_TRAVEL } from './room.js';
import { createSkyDome } from './sky-dome.js';
import { createTown } from './town.js';

/**
 * Creates the Keeper's station: the tower room with its window and shutters,
 * the latch and the recenter nail, and the town below. Entities are
 * persistent so a level reload does not clear them.
 */
export function buildStation(world: World): void {
  const persistent = { persistent: true };
  const parts = createRoom();
  world.createTransformEntity(parts.room, persistent);
  world.createTransformEntity(createTown().town, persistent);
  world.createTransformEntity(createSkyDome(skyTexture()), persistent);

  world
    .createTransformEntity(parts.shutterLeft, persistent)
    .addComponent(ShutterLeaf, { side: Side.Left });
  world
    .createTransformEntity(parts.shutterRight, persistent)
    .addComponent(ShutterLeaf, { side: Side.Right });

  // The latch slides only along +X, between its rest point and full travel.
  world
    .createTransformEntity(parts.latch, persistent)
    .addComponent(OneHandGrabbable, {
      rotate: false,
      translate: true,
      translateMin: [LATCH_REST.x, LATCH_REST.y, LATCH_REST.z],
      translateMax: [LATCH_REST.x + LATCH_TRAVEL, LATCH_REST.y, LATCH_REST.z],
    })
    .addComponent(PullHandle, {
      axis: Axis.X,
      travel: LATCH_TRAVEL,
      threshold: LATCH_THRESHOLD,
      signal: 'latch',
    })
    // A fingertip poke grabs briefly; PullHandleSystem counts it as a tap.
    // A mouse click in the browser presses it instead; PokeButtonSystem
    // fires on release.
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'latch' });
  // GrabSystem denies ray pointers on grabbables; let a hand ray pinch the
  // latch from further away too, so a reach that falls short still works.
  parts.latch.pointerEventsType = 'all';

  world
    .createTransformEntity(parts.nail, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'recenter' });
}
