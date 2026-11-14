import { type Object3D, OneHandGrabbable, PokeInteractable, RayInteractable, type Vector3, type World } from '@iwsdk/core';
import type { SignalName } from '../signals.js';
import { Axis, Choice, Drawing, Globe, PokeButton, PullHandle, ShutterLeaf, Side, SunDial, Spyglass, Week } from '../components.js';
import { createAsk } from './ask.js';
import { BASKET_ON_SQUARE, createBasket, LEVER_GRIP, LEVER_PULL, LEVER_PULL_THRESHOLD, ROPE_REST, ROPE_THRESHOLD, ROPE_TRAVEL } from './basket.js';
import { createCard, createLetter, createWeekCoin } from './card.js';
import { createCrumbs } from './crumbs.js';
import { createMaquette } from './maquette.js';
import { createGauges } from './gauges.js';
import { createMatch, createMatchbox, MATCH_REST, MATCH_THRESHOLD, MATCH_TRAVEL } from './matches.js';
import { createDrawing } from './drawing.js';
import { createGlobe } from './globe.js';
import { createSpyglass } from './spyglass.js';
import { createTags } from './tags.js';
import { TAGS } from '../season/lines.js';
import { COST } from '../season/model.js';
import { createHint } from './hint.js';
import { BOX_DISPLAY, BOX_PUSH, BOX_SCALE, createFamily, createKeepsakes, ROOM_BOX } from './family.js';
import { createBuilds } from './builds.js';
import { createFestival } from './festival.js';
import { createFocusGlow } from './focus.js';
import { createFolk } from './folk.js';
import { createOutcomes } from './outcomes.js';
import { createReactions, RACK_SOLID, STALL_SOLIDS } from './reactions.js';
import { createSolidarity } from './solidarity.js';
import { createSun, SUN_RAIL } from './sun.js';
import { createTocco } from './tocco.js';
import { createLife } from './life.js';
import { skyTexture } from './materials.js';
import { createRoom, LATCH_REST, LATCH_THRESHOLD, LATCH_TRAVEL } from './room.js';
import { enableStaticShadows } from './shadows.js';
import { createSkyDome } from './sky-dome.js';
import { createFarCity } from './far-city.js';
import { createDoorRing, createDoorTarget } from './tower.js';
import { createTown, SOLID } from './town.js';
import { createEndingLights, createTownLamp } from './town-lamp.js';
import { createWeather } from './weather.js';
import { LATCH_TAP_TRAVEL } from '../tap-gate.js';

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
  const townParts = createTown();
  const town = townParts.town;
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
      // A fingertip pressing it pushes it a few centimetres: still a tap.
      tapTravel: LATCH_TAP_TRAVEL,
    })
    // A fingertip poke grabs briefly; PullHandleSystem counts it as a tap.
    // A ray's pinch, or a short mouse click in the browser (the emulator's
    // Play mode, as for every lit thing), presses it instead;
    // PokeButtonSystem fires on release.
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

  // The key on the sill takes the Keeper down to the square; the door ring brings them back. The key waits out a
  // brush (it lies 11 cm from the match, and a hand reaching for that must not send the Keeper down), answering the
  // touch at once with a tick and a glow; the ring has nothing beside it to reach for, so it goes at the touch.
  world
    .createTransformEntity(parts.key, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'descend', waits: true });
  const ring = createDoorRing();
  world.createTransformEntity(ring, persistent).addComponent(PokeInteractable).addComponent(RayInteractable).addComponent(PokeButton, { signal: 'ascend' });
  // Its door leaf takes a hand's ray too, on the square only (BasketSystem): the ring alone is a few degrees wide.
  world.createTransformEntity(createDoorTarget(ring), persistent).addComponent(RayInteractable).addComponent(PokeButton, { signal: 'ascend' });

  const drawing = buildWeek(world);
  buildFamily(world, townParts.tessaWindow, drawing);
  // Tessa's door is under the middle window of her building, two bays right of hers.
  world.createTransformEntity(createOutcomes(townParts.tessaWindow.x + 1.93).group, persistent);
  // The square's reading of the week (cars, bicycles, market stalls) and what the Keeper's builds become.
  world.createTransformEntity(createReactions().group, persistent);
  SOLID.push(RACK_SOLID, ...STALL_SOLIDS);
  world.createTransformEntity(createBuilds().group, persistent);
  // Lina's paper boats kept on the sill.
  world.createTransformEntity(createKeepsakes(), persistent);
  // The townsfolk on the square and the row's sidewalk.
  world.createTransformEntity(createFolk().group, persistent);
  // The morning's soft "look there" on the ground.
  world.createTransformEntity(createFocusGlow(), persistent);
  // The town's lamp over the square: an empty iron frame on a wire across it.
  world.createTransformEntity(createTownLamp().group, persistent);
  world.createTransformEntity(createEndingLights(), persistent);
  // The season's last night: strings of bulbs over the square.
  world.createTransformEntity(createFestival(), persistent);
  // The weather weeks' rain, chimney smoke and the slip that rides with the week's card.
  const weather = createWeather();
  world.createTransformEntity(weather.group, persistent);
  world.createTransformEntity(weather.slip, persistent);

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
function buildWeek(world: World): Object3D {
  const persistent = { persistent: true };
  const parts = createBasket();
  world.createTransformEntity(parts.basket, persistent).addComponent(Week);
  // Where it waits on the square, the Keeper cannot land on it.
  const b = BASKET_ON_SQUARE;
  SOLID.push([b.x - 0.25, b.y - 1, b.z - 0.2, b.x + 0.25, b.y + 0.6, b.z + 0.2]);
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

  // The lever lowers the basket: the week's choice can no longer be taken back, and in the climax's week a glass in the
  // basket goes with it. So a touch on it waits out a brush, as the key's does (PokeButtonSystem): a press elsewhere, a
  // grab or a pinch of that hand meanwhile, and it was the hand passing.
  world
    .createTransformEntity(parts.lever, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'lower', waits: true });
  // Its knob is pulled down, like a real brake handle; a poke still works, and waits out a brush as the lever does.
  const { x: gx, y: gy, z: gz } = LEVER_GRIP;
  world
    .createTransformEntity(parts.grip, persistent)
    .addComponent(OneHandGrabbable, { rotate: false, translate: true, translateMin: [gx - 0.01, gy + LEVER_PULL, gz], translateMax: [gx + 0.07, gy, gz] })
    .addComponent(PullHandle, { axis: Axis.Y, travel: LEVER_PULL, threshold: LEVER_PULL_THRESHOLD, signal: 'lower' })
    .addComponent(PokeInteractable)
    .addComponent(PokeButton, { signal: 'lower', waits: true });
  parts.grip.pointerEventsType = 'all';

  // The sun slides only along its rod; a fingertip poke is a tap that moves it on. A controller's trigger on the ray, a
  // hand's pinch from further off, or a short mouse click in the browser (the emulator's Play mode, as for every lit
  // thing) taps it on too: PokeButtonSystem fires on release, and a press that turned into a hold is the hold's.
  const sun = createSun();
  world.createTransformEntity(sun.rail, persistent);
  const { x0, x1, y: ry, z: rz } = SUN_RAIL;
  world
    .createTransformEntity(sun.sun, persistent)
    .addComponent(SunDial, { x0, x1 })
    .addComponent(OneHandGrabbable, { rotate: false, translate: true, translateMin: [x0, ry, rz], translateMax: [x1, ry, rz] })
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'sun' });
  sun.sun.pointerEventsType = 'all';

  // Tocco and his door, the Sunday arrows and lamp, the notches on the jamb.
  const tocco = createTocco();
  world.createTransformEntity(tocco.fixtures, persistent);
  world.createTransformEntity(tocco.door, persistent);
  world.createTransformEntity(tocco.flame, persistent);
  world.createTransformEntity(tocco.line, persistent);
  for (const notch of tocco.notches) world.createTransformEntity(notch, persistent);
  const pokeable: Array<[Object3D, SignalName]> = [
    [tocco.tocco, 'tocco'],
    [tocco.up, 'up'],
    [tocco.down, 'down'],
    [tocco.lamp, 'lamp'],
  ];
  // The questions he can be asked: a panel over his line, a pokeable row for each (ToccoSystem places them).
  const ask = createAsk();
  world.createTransformEntity(ask.panel, persistent);
  ask.rows.forEach((row, i) => pokeable.push([row, `ask${i}` as SignalName]));
  for (const [object, signal] of pokeable) {
    world
      .createTransformEntity(object, persistent)
      .addComponent(PokeInteractable)
      .addComponent(RayInteractable)
      .addComponent(PokeButton, { signal });
  }

  // The solidarity week: the Keeper's own things for the harbour, the crates at the tower's foot and their van, Lina's drawing.
  const aid = createSolidarity(ROOM_BOX.d / 2);
  world.createTransformEntity(aid.crates, persistent);
  world.createTransformEntity(aid.van, persistent);
  parts.choices.forEach((mesh, index) => {
    // The shapes this place on the sill takes in each kind of week, and in the solidarity week (SeasonSystem).
    mesh.userData.variants = { fuel: parts.options.fuel[index], power: parts.options.power[index], food: parts.options.food[index], aid: aid.items[index] };
    world
      .createTransformEntity(mesh, persistent)
      .addComponent(Choice, { index })
      .addComponent(OneHandGrabbable, { rotate: true, translate: true })
      .addComponent(PokeInteractable)
      // A controller's trigger on the ray, or a hand's pinch from further off, taps it into the basket too.
      .addComponent(RayInteractable);
    mesh.pointerEventsType = 'all';
  });

  // The week's card (it comes up in the basket) and the jar of coins on the near right of the sill.
  const card = createCard();
  world.createTransformEntity(card.card, persistent);
  world.createTransformEntity(createLetter().letter, persistent);
  // The ghost hand that shows the next gesture after a while of stillness.
  world.createTransformEntity(createHint().hand, persistent);
  world.createTransformEntity(card.jar, persistent);
  // The three things' tags (who each is for, and its cost in coin dots) and the jar's dots, shown while choosing.
  world.createTransformEntity(createTags(TAGS, [0, 1, 2].map((i) => COST[i] ?? 0)).mesh, persistent);
  // A box of matches beside the lamp: draw the match across it to light the lamp.
  world.createTransformEntity(createMatchbox(), persistent);
  const match = createMatch();
  const { x: mx, y: my, z: mz } = MATCH_REST;
  world
    .createTransformEntity(match, persistent)
    .addComponent(OneHandGrabbable, { rotate: false, translate: true, translateMin: [mx, my, mz], translateMax: [mx + MATCH_TRAVEL, my, mz] })
    .addComponent(PullHandle, { axis: Axis.X, travel: MATCH_TRAVEL, threshold: MATCH_THRESHOLD, signal: 'strike' });
  match.pointerEventsType = 'all';
  // A small model of the square: touching Tessa's house in it brings their window over.
  const maquette = createMaquette();
  world.createTransformEntity(maquette.group, persistent);
  world
    .createTransformEntity(maquette.house, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'window' });
  // A bag of crumbs for the pigeons on the far edge of the sill.
  const crumbs = createCrumbs();
  world.createTransformEntity(crumbs.group, persistent);
  world
    .createTransformEntity(crumbs.bag, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'crumbs' });
  // The spyglass across the middle of the sill: lifted to the eye, the town shows twice as near. No poke, like the coin.
  // The loose glass globe, and the note that comes up with it.
  const globe = createGlobe();
  world.createTransformEntity(globe.note, persistent);
  world.createTransformEntity(globe.globe, persistent).addComponent(OneHandGrabbable, { rotate: true, translate: true }).addComponent(Globe);
  globe.globe.pointerEventsType = 'all';
  const drawing = createDrawing();
  // A fingertip on Lina's drawing presses it (Tocco reads it, DrawingSystem); a pinch takes it.
  world.createTransformEntity(drawing, persistent).addComponent(OneHandGrabbable, { rotate: true, translate: true }).addComponent(PokeInteractable).addComponent(Drawing);
  drawing.pointerEventsType = 'all';
  const spyglass = createSpyglass();
  world.createTransformEntity(spyglass, persistent).addComponent(OneHandGrabbable, { rotate: true, translate: true }).addComponent(Spyglass);
  spyglass.pointerEventsType = 'all';
  // The three brass dials on the near edge of the sill.
  world.createTransformEntity(createGauges(), persistent);
  // The week's coin, in the basket from the second week: picked up and dropped into the jar. No poke: on
  // something this small a fingertip press turns into a grab that drags it with the finger.
  const coin = createWeekCoin();
  world.createTransformEntity(coin, persistent).addComponent(OneHandGrabbable, { rotate: true, translate: true });
  coin.pointerEventsType = 'all';
  return aid.drawing;
}

/**
 * Tessa's family: the room box their window becomes (pushed away, it flies
 * home), its glass to knock on, a hook to send it home, the line of what
 * they say, and an invisible pane over their window across the square to
 * point at.
 */
function buildFamily(world: World, tessaWindow: Vector3, drawing: Object3D): void {
  const persistent = { persistent: true };
  const parts = createFamily(tessaWindow);
  parts.box.add(drawing);
  const { x, y, z } = BOX_DISPLAY;
  parts.box.position.set(x, y, z);
  parts.box.scale.setScalar(BOX_SCALE);
  world
    .createTransformEntity(parts.box, persistent)
    .addComponent(OneHandGrabbable, { rotate: false, translate: true, translateMin: [x, y, z + BOX_PUSH], translateMax: [x, y, z] });
  world
    .createTransformEntity(parts.glass, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'knock' });
  world
    .createTransformEntity(parts.hook, persistent)
    .addComponent(PokeInteractable)
    .addComponent(RayInteractable)
    .addComponent(PokeButton, { signal: 'window' });
  world.createTransformEntity(parts.line, persistent);
  world.createTransformEntity(parts.target, persistent).addComponent(RayInteractable).addComponent(PokeButton, { signal: 'window' });
}
