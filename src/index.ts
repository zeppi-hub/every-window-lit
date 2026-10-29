import { Fog, VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { emitSignal } from './signals.js';
import { stance } from './stance.js';
import { buildStation } from './station/build.js';
import { preloadTextures } from './station/materials.js';
import { BasketSystem } from './systems/basket.js';
import { ChoiceSystem } from './systems/choice.js';
import { DebugHudSystem } from './systems/debug-hud.js';
import { EveningSystem } from './systems/evening.js';
import { FamilySystem } from './systems/family.js';
import { OutcomeSystem } from './systems/outcomes.js';
import { LifeSystem } from './systems/life.js';
import { PokeButtonSystem } from './systems/poke-button.js';
import { PullHandleSystem } from './systems/pull-handle.js';
import { SeatSystem } from './systems/seat.js';
import { ShutterSystem } from './systems/shutters.js';
import { SkySystem } from './systems/sky.js';
import { SunSystem } from './systems/sun.js';
import { ToccoSystem } from './systems/tocco.js';
import { WalkSystem } from './systems/walk.js';

/** The panorama's distance-haze colour, so live and painted haze agree. */
const HAZE = 0xb3bdd0;

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
)
  .then(async (world) => {
    // Aerial perspective over the far city, reaching full haze near the far plane.
    world.scene.fog = new Fog(HAZE, 150, 1300);
    // Every texture is on the GPU before anything is built or entered.
    await preloadTextures(world);
    buildStation(world);

    world.registerSystem(SeatSystem);
    world.registerSystem(PullHandleSystem);
    world.registerSystem(PokeButtonSystem);
    world.registerSystem(ShutterSystem);
    world.registerSystem(BasketSystem);
    world.registerSystem(ChoiceSystem);
    world.registerSystem(FamilySystem);
    world.registerSystem(SunSystem);
    world.registerSystem(EveningSystem);
    world.registerSystem(OutcomeSystem);
    world.registerSystem(ToccoSystem);
    world.registerSystem(SkySystem);
    world.registerSystem(LifeSystem);
    world.registerSystem(WalkSystem);
    world.registerSystem(DebugHudSystem);

    await wireLanding(world);
    if (import.meta.env.DEV) wireDevKeys(world);
  })
  .catch((error: unknown) => {
    console.error(error);
    const note = document.getElementById('landing-note');
    if (note) note.textContent = 'Something went wrong while loading. Please reload the page.';
  });

/**
 * The 2D page before VR: one Enter VR button, enabled only once the station
 * is loaded and the browser can actually start an immersive session.
 */
async function wireLanding(world: World): Promise<void> {
  const landing = document.getElementById('landing');
  const enter = document.getElementById('enter-vr') as HTMLButtonElement | null;
  const note = document.getElementById('landing-note');
  if (landing == null || enter == null || note == null) return;

  const supported = (await navigator.xr?.isSessionSupported('immersive-vr')) ?? false;
  if (!supported) {
    note.textContent = 'Open this page in the Meta Quest browser to play.';
    enter.textContent = 'VR not available here';
    return;
  }
  enter.addEventListener('click', () => world.launchXR());
  enter.textContent = 'Enter VR';
  enter.disabled = false;
  world.visibilityState.subscribe((state) => {
    landing.hidden = state !== VisibilityState.NonImmersive;
  });
}

/**
 * Dev server only: keyboard shortcuts for testing in the desktop emulator,
 * where reaching the latch with an emulated hand is slow. O opens or closes
 * the shutters, C recenters the seat, G goes down to the square or back up,
 * J and L turn left and right while walking, R pulls the basket rope once,
 * B releases the brake, F calls Tessa's window over or sends it home, K
 * knocks on its glass, N moves the sun on to the next evening, U and V call
 * next week's prices up or down and M lights the Sunday lamp. None is bound by the emulator.
 */
function wireDevKeys(world: World): void {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyO') emitSignal('latch');
    if (event.code === 'KeyC') emitSignal('recenter');
    if (event.code === 'KeyG') emitSignal(stance() === 'seat' ? 'descend' : 'ascend');
    if (event.code === 'KeyJ') world.getSystem(WalkSystem)?.snapTurn(-1);
    if (event.code === 'KeyL') world.getSystem(WalkSystem)?.snapTurn(1);
    if (event.code === 'KeyR') emitSignal('rope');
    if (event.code === 'KeyB') emitSignal('lower');
    if (event.code === 'KeyF') emitSignal('window');
    if (event.code === 'KeyK') emitSignal('knock');
    if (event.code === 'KeyN') emitSignal('sun');
    if (event.code === 'KeyU') emitSignal('up');
    if (event.code === 'KeyV') emitSignal('down');
    if (event.code === 'KeyM') emitSignal('lamp');
  });
}
