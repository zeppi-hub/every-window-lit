import { VisibilityState, type World } from '@iwsdk/core';
import { GripMarkSystem } from '../../systems/grip-marks.js';
import { PinchReachSystem } from '../../systems/pinch-reach.js';
import { registerV2 } from '../register.js';
import { DirectorSystem } from './director.js';
import { loadActors } from './actors.js';
import { s06 } from './circus-show.js';
import { firstPart, rehome } from './day.js';
import { s01, s02, s03, s04, s05, setUpCity } from './opening.js';

// Dev: the keys [ ] \\ reload straight into the circus at act 1, 2, 3; = clears.
if (import.meta.env.DEV) {
  window.addEventListener('keydown', (event) => {
    const act = ['[', ']', '\\'].indexOf(event.key);
    if (act < 0 && event.key !== '=') return;
    event.preventDefault();
    if (act < 0) window.sessionStorage.removeItem('v2jump');
    else window.sessionStorage.setItem('v2jump', `circus ${act + 1}`);
    window.location.reload();
  });
}

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
  // Those of the first minute before the way in opens; the memory keepers (first seen in S05) behind it.
  await loadActors(['gray', 'maya', 'leo', 'sam', 'crowd_man_suit', 'crowd_man_casual', 'crowd_woman_a', 'crowd_woman_b']);
  const cast = await setUpCity(d);
  rehome();
  // Only once the square is in, so they do not slow it down.
  const keepers = loadActors(['walt', 'june', 'ben', 'helen', 'edna', 'george']);
  void d.stage.load('circus');
  void d.stage.load('forest');
  void d.stage.load('ship');
  void d.stage.load('farm');
  await wireLanding(world);
  // English captions on or off, from the start page (kept for the next visit).
  const captions = document.getElementById('captions-on') as HTMLInputElement | null;
  if (captions != null) {
    try {
      captions.checked = localStorage.getItem('v2-captions') !== 'off';
    } catch {
      // No storage: on.
    }
    d.captions.enabled = captions.checked;
    captions.addEventListener('change', () => {
      d.captions.enabled = captions.checked;
      try {
        localStorage.setItem('v2-captions', captions.checked ? 'on' : 'off');
      } catch {
        // Not kept.
      }
    });
  }
  void play(world, d, cast, keepers).catch((error: unknown) => console.error(error));
}

/** The day, from S01, once the headset session begins. */
async function play(world: World, d: DirectorSystem, cast: Awaited<ReturnType<typeof setUpCity>>, keepersIn: Promise<void>): Promise<void> {
  // The session may already have begun while the city loaded (the signal calls back at once with its value then).
  if (world.visibilityState.peek() === VisibilityState.NonImmersive) {
    await new Promise<void>((done) => {
      const off = world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) return;
        off();
        done();
      });
    });
  }
  // Dev: ?memory=circus (or the keys [ ] \\: the circus at act 1, 2, 3; = clears) opens that memory at once, without the morning before it.
  if (import.meta.env.DEV) {
    if (new URLSearchParams(window.location.search).get('memory') === 'circus' || (window.sessionStorage.getItem('v2jump') ?? '').startsWith('circus')) {
      await s06(d);
      return;
    }
  }
  await s01(d, cast);
  await s02(d, cast);
  const persona = await s03(d, cast);
  d.day.persona = persona.id;
  await s04(d, cast, persona.person);
  await keepersIn;
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
