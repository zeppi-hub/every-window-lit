import { Fog, VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { buildStation } from './station/build.js';
import { DebugHudSystem } from './systems/debug-hud.js';
import { PokeButtonSystem } from './systems/poke-button.js';
import { PullHandleSystem } from './systems/pull-handle.js';
import { SeatSystem } from './systems/seat.js';
import { ShutterSystem } from './systems/shutters.js';

/** Matches the sky's horizon colour so the far plane dissolves into haze. */
const HAZE = 0xcfd9e2;

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.scene.fog = new Fog(HAZE, 90, 158);
  buildStation(world);

  world.registerSystem(SeatSystem);
  world.registerSystem(PullHandleSystem);
  world.registerSystem(PokeButtonSystem);
  world.registerSystem(ShutterSystem);
  world.registerSystem(DebugHudSystem);

  wireLanding(world);
});

/** The 2D page before VR: one Enter VR button, hidden while immersive. */
function wireLanding(world: World): void {
  const landing = document.getElementById('landing');
  const enter = document.getElementById('enter-vr') as HTMLButtonElement | null;
  const note = document.getElementById('landing-note');
  if (landing == null || enter == null || note == null) return;

  if (!world.xrEnabled) {
    enter.disabled = true;
    note.textContent = 'Open this page in the Meta Quest browser to play.';
  }
  enter.addEventListener('click', () => world.launchXR());
  world.visibilityState.subscribe((state) => {
    landing.hidden = state !== VisibilityState.NonImmersive;
  });
}
