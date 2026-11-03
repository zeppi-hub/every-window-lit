import { Fog, VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { type ComfortOption, loadComfort, setComfort } from './comfort.js';
import { CONTROLLERS_NOTE, landing as landingFor, sourceLine } from './restart.js';
import { forget } from './save.js';
import { currentTown, hardWeeksOn, hasHardWeeks, restartSeason, SEASON_WEEKS, seasonCountry, seasonWeeksPlayed, setHardWeeks } from './season/store.js';
import { emitSignal } from './signals.js';
import { buildStation } from './station/build.js';
import { preloadTextures, streamTextures } from './station/materials.js';
import { AidSystem } from './systems/aid.js';
import { BasketSystem } from './systems/basket.js';
import { BuildSystem } from './systems/builds.js';
import { ChoiceSystem } from './systems/choice.js';
import { ControllerPinchSystem } from './systems/controller-pinch.js';
import { DebugHudSystem } from './systems/debug-hud.js';
import { EveningSystem } from './systems/evening.js';
import { FamilySystem } from './systems/family.js';
import { FestivalSystem } from './systems/festival.js';
import { FocusSystem } from './systems/focus.js';
import { FolkSystem } from './systems/folk.js';
import { HapticsSystem } from './systems/haptics.js';
import { HintSystem } from './systems/hint.js';
import { OutcomeSystem } from './systems/outcomes.js';
import { LifeSystem } from './systems/life.js';
import { PokeButtonSystem } from './systems/poke-button.js';
import { PullHandleSystem } from './systems/pull-handle.js';
import { SeasonSystem } from './systems/season.js';
import { SeatSystem } from './systems/seat.js';
import { ShutterSystem } from './systems/shutters.js';
import { SkySystem } from './systems/sky.js';
import { SoundSystem } from './systems/sound.js';
import { SunSystem } from './systems/sun.js';
import { TownSystem } from './systems/town.js';
import { ToccoSystem } from './systems/tocco.js';
import { WalkSystem } from './systems/walk.js';
import { RevealSystem } from './systems/reveal.js';
import { CoinSystem } from './systems/coin.js';
import { GaugeSystem } from './systems/gauges.js';
import { CrumbsSystem } from './systems/crumbs.js';
import { SpyglassSystem } from './systems/spyglass.js';
import { KeeperHandsSystem } from './systems/keeper-hands.js';
import { WarmupSystem } from './systems/warmup.js';
import { WeatherSystem } from './systems/weather.js';

// The start page's switch for weeks that overlap a real disaster, and its two comfort options, work from the first
// moment, while the town loads.
wireHardWeeks();
wireComfort();
wireSource();
// Dev server only: the 2D page's "Emulator controls" card (dev-tools.ts, which never ships).
if (import.meta.env.DEV) void import('./dev-tools.js').then((dev) => dev.showEmulatorCard());

/** The panorama's distance-haze colour, so live and painted haze agree. */
const HAZE = 0xb3bdd0;

/**
 * The page's own Enter VR button, enabled once the town has loaded, is the
 * only way in (iwsdk.config.json offers no session). The browser's own
 * prompt would come before the town loads and drop the player into empty
 * sky. The dev emulator's `xr enter` still needs an offered session.
 */
const options =
  import.meta.env.DEV && projectOptions.xr !== false && projectOptions.xr != null
    ? { ...projectOptions, xr: { ...projectOptions.xr, offer: 'always' as const } }
    : projectOptions;

World.create(document.getElementById('scene-container') as HTMLDivElement, options)
  .then(async (world) => {
    // Load timeline in the dev server's console (seconds since the page started): models in, textures in, town built.
    const mark = (step: string) => {
      if (import.meta.env.DEV) console.info(`[load] ${step} at ${(performance.now() / 1000).toFixed(2)} s`);
    };
    mark('world and models ready');
    // Aerial perspective over the far city, reaching full haze near the far plane.
    world.scene.fog = new Fog(HAZE, 150, 1300);
    // Every texture is on the GPU before anything is built or entered.
    await preloadTextures(world);
    mark('textures on the GPU');
    buildStation(world);
    mark('station built');

    world.registerSystem(SeatSystem);
    world.registerSystem(PullHandleSystem);
    world.registerSystem(PokeButtonSystem);
    world.registerSystem(ControllerPinchSystem);
    world.registerSystem(ShutterSystem);
    world.registerSystem(BasketSystem);
    world.registerSystem(ChoiceSystem);
    world.registerSystem(SeasonSystem);
    world.registerSystem(FamilySystem);
    world.registerSystem(SunSystem);
    world.registerSystem(EveningSystem);
    world.registerSystem(OutcomeSystem);
    world.registerSystem(TownSystem);
    world.registerSystem(BuildSystem);
    world.registerSystem(FestivalSystem);
    world.registerSystem(FocusSystem);
    world.registerSystem(FolkSystem);
    world.registerSystem(WeatherSystem);
    world.registerSystem(AidSystem);
    world.registerSystem(HintSystem);
    world.registerSystem(HapticsSystem);
    world.registerSystem(SoundSystem);
    world.registerSystem(ToccoSystem);
    world.registerSystem(SkySystem);
    world.registerSystem(LifeSystem);
    world.registerSystem(WalkSystem);
    world.registerSystem(DebugHudSystem);
    world.registerSystem(WarmupSystem);
    world.registerSystem(RevealSystem);
    world.registerSystem(CoinSystem);
    world.registerSystem(GaugeSystem);
    world.registerSystem(CrumbsSystem);
    world.registerSystem(SpyglassSystem);
    world.registerSystem(KeeperHandsSystem);

    // The sky light (IBL) loads on its own. It is waited for here: arriving after the first headset frame, it would have every lit shader built again.
    await sceneLight(world);
    mark('sky light in');
    await wireLanding(world);
    // The town-only scans' full files, now that the way in is open (materials.ts STREAMED).
    void streamTextures(world).catch((error: unknown) => console.warn(error));
    if (import.meta.env.DEV) void import('./dev-tools.js').then((dev) => dev.wireDevKeys(world));
  })
  .catch((error: unknown) => {
    console.error(error);
    const note = document.getElementById('landing-note');
    if (note) note.textContent = 'Something went wrong while loading. Please reload the page.';
  });

/** Weeks that overlap a real disaster on the mainland can be switched off before playing (season/store.ts). */
function wireHardWeeks(): void {
  const hard = document.getElementById('hard-weeks') as HTMLInputElement | null;
  if (hard == null) return;
  // With no such week in this build, neither the switch nor the note about it shows.
  if (!hasHardWeeks()) {
    hard.closest('label')?.remove();
    const note = document.getElementById('landing-note');
    if (note != null) note.textContent = `${CONTROLLERS_NOTE} Made for ages 13 and up, gentle enough to play with family.`;
    return;
  }
  hard.checked = hardWeeksOn();
  hard.addEventListener('change', () => {
    setHardWeeks(hard.checked);
    wireSource();
  });
}

/** Under the start page's last point, in small type: the country the prices come from and the span of the season's weeks. */
function wireSource(): void {
  const source = document.getElementById('data-source');
  if (source != null) source.textContent = sourceLine(seasonCountry(), seasonWeeksPlayed());
}

/**
 * The start page's two comfort options (comfort.ts): off unless this viewer
 * turned them on before. Larger captions and less motion are read by the
 * systems as they draw and move, so a change here shows on entering VR.
 */
function wireComfort(): void {
  const storage = () => window.localStorage;
  const shown = loadComfort(storage);
  const boxes: Array<[ComfortOption, string]> = [
    ['largerCaptions', 'larger-captions'],
    ['lessMotion', 'less-motion'],
  ];
  for (const [option, id] of boxes) {
    const box = document.getElementById(id) as HTMLInputElement | null;
    if (box == null) continue;
    box.checked = shown[option];
    box.addEventListener('change', () => setComfort(option, box.checked, storage));
  }
}

/** Resolves once the scene's sky light (IBL) is in, or after 10 s at most, so the page can never stay closed. */
function sceneLight(world: World): Promise<void> {
  const started = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (world.scene.environment != null || performance.now() - started > 10_000) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

/**
 * The 2D page before VR, its buttons enabled only once the station is
 * loaded and the browser can actually start an immersive session. With no
 * season saved past its first week there is one: Enter VR. With one, the
 * big button starts the season over at week 1 and enters VR in the same
 * tap (another player on the same headset), and a small one goes on where
 * it was (restart.ts).
 */
async function wireLanding(world: World): Promise<void> {
  const landing = document.getElementById('landing');
  const enter = document.getElementById('enter-vr') as HTMLButtonElement | null;
  const resume = document.getElementById('continue') as HTMLButtonElement | null;
  const note = document.getElementById('landing-note');
  if (landing == null || enter == null || resume == null || note == null) return;

  const supported = (await navigator.xr?.isSessionSupported('immersive-vr')) ?? false;
  if (!supported) {
    note.textContent = 'Open this page in the Meta Quest browser to play.';
    enter.textContent = 'VR not available here';
    return;
  }
  // Worked out again whenever the page shows, so it is right after a session too.
  let restarts = false;
  const refresh = () => {
    const offer = landingFor(currentTown().week, SEASON_WEEKS);
    restarts = offer.restarts;
    enter.textContent = offer.main;
    resume.textContent = offer.resume ?? '';
    resume.hidden = offer.resume == null;
  };
  refresh();
  enter.addEventListener('click', () => {
    if (restarts) {
      startOver();
      // The page is right at once, even if the headset session never opens: the season is at week 1 now.
      refresh();
    }
    world.launchXR();
  });
  resume.addEventListener('click', () => world.launchXR());
  enter.disabled = false;
  world.visibilityState.subscribe((state) => {
    landing.hidden = state !== VisibilityState.NonImmersive;
    if (state === VisibilityState.NonImmersive) refresh();
  });
}

/**
 * The season starts over in this page, before the headset session begins:
 * the save is forgotten, the season replayed from nothing, and every system
 * that keeps something of the week or the season sets itself back on the
 * one 'restart' signal (BasketSystem puts the week back to restart.ts
 * RESTART_WEEK first). The Keeper comes in to the closed room of week 1,
 * as on a first visit.
 */
function startOver(): void {
  forget();
  restartSeason();
  emitSignal('restart');
  if (import.meta.env.DEV) console.info(`[restart] the season starts over at week ${currentTown().week} at ${(performance.now() / 1000).toFixed(2)} s`);
}
