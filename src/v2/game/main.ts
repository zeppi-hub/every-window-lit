import { VisibilityState, type World } from '@iwsdk/core';
import { GripMarkSystem } from '../../systems/grip-marks.js';
import { PinchReachSystem } from '../../systems/pinch-reach.js';
import { registerV2 } from '../register.js';
import { DirectorSystem } from './director.js';
import { firstPart } from './day.js';
import { s01, s02, s03, s04, s05, setUpCity } from './opening.js';

/**
 * Repeat After Me (the new version): the systems it needs (the pinch, the
 * rings, the new version's parts and its director), the 2008 square loaded
 * before the way in opens, the memories' places loading behind it, and the
 * day played from S01 once the headset session begins.
 */
export async function startV2(world: World): Promise<void> {
  world.registerSystem(PinchReachSystem);
  world.registerSystem(GripMarkSystem);
  registerV2(world);
  world.registerSystem(DirectorSystem);
  const d = world.getSystem(DirectorSystem);
  if (d == null) return;
  const cast = await setUpCity(d);
  void d.stage.load('circus');
  void d.stage.load('forest');
  await wireLanding(world);
  void play(world, d, cast).catch((error: unknown) => console.error(error));
}

/** The day, from S01, once the headset session begins. */
async function play(world: World, d: DirectorSystem, cast: Awaited<ReturnType<typeof setUpCity>>): Promise<void> {
  await new Promise<void>((done) => {
    const off = world.visibilityState.subscribe((state) => {
      if (state === VisibilityState.NonImmersive) return;
      off();
      done();
    });
  });
  await s01(d, cast);
  await s02(d, cast);
  const persona = await s03(d, cast);
  d.day.persona = persona.id;
  await s04(d, cast, persona.person);
  const keepers = await s05(d, cast, persona.id);
  await firstPart(d, cast, keepers, persona.id);
}

/** The start page: one button, enabled once the square is in and the browser can open a headset session. */
async function wireLanding(world: World): Promise<void> {
  const landing = document.getElementById('landing');
  const enter = document.getElementById('enter-vr') as HTMLButtonElement | null;
  const note = document.getElementById('landing-note');
  if (landing == null || enter == null) return;
  const supported = (await navigator.xr?.isSessionSupported('immersive-vr')) ?? false;
  if (!supported) {
    enter.textContent = 'Enter VR';
    if (note != null) note.textContent = 'Open this page in the Meta Quest browser to play.';
    return;
  }
  enter.textContent = 'Enter VR';
  enter.disabled = false;
  enter.addEventListener('click', () => world.launchXR());
  world.visibilityState.subscribe((state) => {
    landing.hidden = state !== VisibilityState.NonImmersive;
  });
}
