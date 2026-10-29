import { OneHandGrabbable, PokeInteractable, RayInteractable, type World } from '@iwsdk/core';
import { Axis, Choice, PokeButton, PullHandle, ShutterLeaf, Side, Week } from '../components.js';
import { createBasket, ROPE_REST, ROPE_THRESHOLD, ROPE_TRAVEL } from './basket.js';
import { createLife } from './life.js';
import { skyTexture } from './materials.js';
import { createRoom, LATCH_REST, LATCH_THRESHOLD, LATCH_TRAVEL } from './room.js';
import { enableStaticShadows } from './shadows.js';
import { createSkyDome } from './sky-dome.js';
import { createFarCity } from './far-city.js';
import { createDoorRing } from './tower.js';
import { createTown } from './town.js';

/**
 * Creates the Keeper's station: the tower room with its window and shutters,
 * the latch, the recenter nail and the key to go down, the town below and
 * the ring on the tower door to come back up. Entities are persistent so a
 * level reload does not clear them.
 */
export function buildStation(world: World): void {
  const persistent = { persistent: true };
  const parts = createRoom();
  world.createTransformEntity(parts.room, persistent);
  const town = createTown().town;
  world.createTransformEntity(town, persistent);
  if (import.meta.env.DEV) console.info('[station] town triangles', town.userData.triangles);
  const far = createFarCity();
  world.createTransformEntity(far, persistent);
  if (import.meta.env.DEV) console.info('[station] far city triangles', far.userData.triangles);
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

  // The key on the sill takes the Keeper down to the square; the door ring brings them back.
  world
    .createTransformEntity(parts.key, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'descend' });
  world
    .createTransformEntity(createDoorRing(), persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'ascend' });

  buildWeek(world);

  // The tower and the near houses shade the square; drawn once, never again.
  enableStaticShadows(world, [town, parts.room], [town]);
  // Last: life reads the finished town to find open paving, roof edges and free wall.
  createLife(world);
}

/**
 * The week's machinery: the basket (which carries the Week state), its
 * hoist and rope, the rope's toggle inside the right jamb, the brake lever
 * on the left jamb and the three objects on the sill.
 */
function buildWeek(world: World): void {
  const persistent = { persistent: true };
  const parts = createBasket();
  world.createTransformEntity(parts.basket, persistent).addComponent(Week);
  world.createTransformEntity(parts.hoist, persistent);
  world.createTransformEntity(parts.rope, persistent);

  // The toggle slides only down, 15 cm; each pull past 10 cm is one haul on the rope.
  const { x, y, z } = ROPE_REST;
  world
    .createTransformEntity(parts.toggle, persistent)
    .addComponent(OneHandGrabbable, { rotate: false, translate: true, translateMin: [x, y + ROPE_TRAVEL, z], translateMax: [x, y, z] })
    .addComponent(PullHandle, { axis: Axis.Y, travel: ROPE_TRAVEL, threshold: ROPE_THRESHOLD, signal: 'rope' })
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'rope' });
  parts.toggle.pointerEventsType = 'all';

  world
    .createTransformEntity(parts.lever, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'lower' });

  parts.choices.forEach((mesh, index) => {
    world
      .createTransformEntity(mesh, persistent)
      .addComponent(Choice, { index })
      .addComponent(OneHandGrabbable, { rotate: true, translate: true })
      .addComponent(PokeInteractable);
    mesh.pointerEventsType = 'all';
  });
}
