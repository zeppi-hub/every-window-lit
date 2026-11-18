import { Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from '@iwsdk/core';
import { setWindows } from '../goal.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { shakeObject, startQuake } from '../quake-system.js';
import { setV2Targets } from '../step-targets.js';
import { dimSun, driftRipples, goal, OVERCAST, rippleTexture } from './bail-play.js';
import { buildSandbags, clearSquare, FLOOD, type Flood, leavesWithFlood, s15, TROUBLE, WALL } from './bank-bail.js';
import type { DirectorSystem } from './director.js';
import type { Wires } from './fire.js';
import { HEADLINES, WORDS } from './lines.js';
import { CITY, type CityCast, FEATHER, type Keepers, mergeFlatParts, prop } from './opening.js';
import { showFamily } from './noon.js';
import { shoulderEye } from './people.js';
import { LAMP_EYE } from './run.js';
import { s13 } from './ship-storm.js';
import { WEATHER } from './stage.js';

/**
 * The third problem and its word (S12-S16): the big bank groans, and the
 * flood round it climbs behind a line of sandbags across the square, gold
 * parachutes drifting down from its top floor and fins circling (S12); on
 * a sailing ship in a storm the player, one of the crew, bails the hold
 * with a bucket (S13, ship-storm.ts); Gray covers the ear the feather comes
 * to, and the word must go round his head to the other one (S14); from the
 * lamp a giant gold bucket on a chain bails the bank out over the sandbags,
 * onto the people (S15, bank-bail.ts); and the bank is dry, the family is
 * not (S16).
 */

function waterPlane(d: DirectorSystem, w: number, h: number, colour: number, name: string): Mesh {
  const map = rippleTexture().clone();
  map.repeat.set(w / 4, h / 4);
  // The clone keeps to the first one's drift.
  map.offset = rippleTexture().offset;
  map.needsUpdate = true;
  const mesh = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ color: colour, map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.1, metalness: 0.25, transparent: true, opacity: 0.93 }));
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.pointerEvents = 'none';
  d.world.createTransformEntity(mesh, { persistent: true });
  d.stage.own('city', mesh);
  return mesh;
}

/** S12: the bank groans and leans in the sway; the street round it floods; three parachutes; fins; the notebook; the sailor's line. */
export async function s12(d: DirectorSystem, cast: CityCast, keepers: Keepers): Promise<Flood> {
  d.chapter('S12');
  d.rain.on = true;
  d.stage.setWeather(WEATHER.rain2008);
  // A day of rain: the sun is behind cloud until the trouble is over (S16).
  dimSun(d, OVERCAST);
  // The flood is the bank's: from its walls out to a line of sandbags across the square. The people's side of them is still dry.
  const bank = waterPlane(d, 26, WALL.z + 28, 0x7fa8a0, 'BankWater');
  bank.position.set(-3, FLOOD.from, (WALL.z - 28) / 2);
  const square = waterPlane(d, 30, 5 - WALL.z, 0xb8a98c, 'SquareWater');
  square.position.set(0, 0.1, (WALL.z + 5) / 2);
  square.visible = false;
  bank.visible = false;
  const sandbags = await buildSandbags(d);
  sandbags.visible = false;
  // The queue went home after the run; its umbrellas go with it.
  const umbrellas = d.world.scene.getObjectByName('QueueUmbrellas');
  // From the street lamp in front of the bank (the run's), facing it: the bank itself is what sinks. The sandbags are up when the view opens.
  await d.rig.fadeTo(1);
  sandbags.visible = true;
  bank.visible = true;
  if (umbrellas != null) umbrellas.visible = false;
  d.rig.place(LAMP_EYE, 0);
  await d.rig.fadeTo(0);
  // Slow sway: the square and the bank move, the bird's eye does not.
  const root = d.stage.root('city');
  if (root != null) shakeObject(root);
  startQuake({ kind: 'sway', strength: 'medium', seconds: 5 });
  d.sounds.play('bank_creak', 1);
  const parachutes = [0, 1, 2].map((i) => {
    const p = prop('golden_parachute');
    // Its cords and its bag are one plain finish: drawn as one. The gold canopy stays its own.
    const cords = p.getObjectByName('cords');
    const bag = p.getObjectByName('money_bag');
    if (cords?.parent != null && bag != null && bag.parent === cords.parent) {
      const load = new Group();
      load.name = 'ParachuteLoad';
      cords.parent.add(load);
      load.add(cords, bag);
      mergeFlatParts(load);
    }
    p.scale.setScalar(0.8);
    // Down in front of the portico, over the water (not behind the bank's front).
    // (The third comes down beyond the keepers' row, not onto it.)
    p.position.set([-4, -0.5, 4.8][i] ?? -4, 14, -20.5 + i * 0.8);
    d.world.createTransformEntity(p, { persistent: true });
    d.stage.own('city', p);
    return p;
  });
  const fins = [0, 1, 2].map(() => {
    const f = prop('shark_fin');
    d.world.createTransformEntity(f, { persistent: true });
    d.stage.own('city', f);
    return f;
  });
  // They came with the flood and go with it (after S16): the square is not left with them for the rest of the day.
  leavesWithFlood(...parachutes, ...fins);
  let t = 0;
  const stop = d.each((delta) => {
    t += delta;
    driftRipples(delta);
    fins.forEach((f, i) => {
      const a = t * 0.35 + (i * Math.PI * 2) / 3;
      // Their circle keeps to the bank's right front: the memory keepers stand on their crates in the water to its left (square-keepers.ts).
      f.position.set(-6.3 + Math.cos(a) * (2 + 0.7 * i), bank.position.y, -18.5 + Math.sin(a) * 1.5);
      f.rotation.y = -a;
    });
    parachutes.forEach((p, i) => {
      // Down slowly to just over the water, swaying.
      p.position.y = Math.max(bank.position.y + 0.3, p.position.y - delta * 0.6);
      p.rotation.z = Math.sin(t * 0.9 + i) * 0.12;
    });
  });
  // As the flood climbs, windows go out all round the square: everyone is tied to this bank.
  const lit = cast.windows.lit;
  goal({ where: TROUBLE.where, now: 'Watch the bank: the flood is climbing.' });
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 5);
    bank.position.y = FLOOD.from + (FLOOD.risen - FLOOD.from) * k;
    cast.windows.lit = lit - Math.round(TROUBLE.windows * k);
    setWindows(cast.windows.lit, cast.windows.total);
    return k >= 1;
  });
  // They stay out until the bank is afloat (S15), and the day's count knows it.
  const dark = lit - cast.windows.lit;
  d.day.darkWindows += dark;
  await d.wait(1.5);
  // Back on Gray's shoulder for the notebook and the lines.
  await d.rig.move(CITY.shoulder, Math.PI);
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks },
  ]);
  // The person back at the foot of the steps, the notebook open.
  keepers.watcher.at(CITY.stairsFoot.x, CITY.stairsFoot.y, CITY.stairsFoot.z).face(CITY.grayAt.x, CITY.grayAt.z);
  d.notebook.mesh.position.set(CITY.stairsFoot.x, 1.45, CITY.stairsFoot.z + 0.35);
  d.notebook.mesh.lookAt(CITY.shoulder);
  d.sounds.play('paper', 0.6);
  await d.captions.say('S12-1', CITY.graySays, 0);
  await d.captions.say('S12-2', keepers.people[2].head(new Vector3()), 0.3);
  goal({ where: TROUBLE.where, now: "Find the word: fly to a keeper's hand." });
  return { bank, square, wall: sandbags, dark, parachutes, fins, stop };
}

export { s13, s15 };
export type { Flood };

/** S14: the feather comes near his ear and Gray covers it; the crowd boos; the word must go round his head to the other ear. */
export async function s14(d: DirectorSystem, cast: CityCast): Promise<void> {
  d.chapter('S14');
  // Back from the storm's night to the day of rain.
  dimSun(d, OVERCAST);
  // What the ship's lost squalls cost is counted here, where the windows can be seen.
  cast.windows.lit = cast.windows.total - d.day.darkWindows;
  setWindows(cast.windows.lit, cast.windows.total);
  goal({ where: TROUBLE.where, now: 'Carry the feather round to his other ear.' });
  await d.captions.say('S14-1', CITY.graySays, 0);
  d.sounds.play('crowd_boo', 0.8);
  // The other ear: on his left side, round the back of his head from the bird.
  const head = cast.gray.head(new Vector3());
  const other = d.marker(head.clone().add(new Vector3(0.09, -0.13, 0.0)), 'GrayEar');
  setListener(other, 0.14);
  setV2Targets([other]);
  let word = '';
  while (word !== WORDS.bailOut) word = await d.nextWord(WORDS.bailOut);
  setV2Targets([]);
  setListener(cast.ear, 0.14);
}


/** S16: the person looks at the family's place, in water to the sill; the grey feather there (optional) keeps their lights on. */
export async function s16(d: DirectorSystem, keepers: Keepers, w: Wires): Promise<void> {
  d.chapter('S16');
  goal({ where: TROUBLE.where, now: 'See who was left standing in the water.' });
  const watcher = keepers.watcher;
  const front = w.family.clone().addScaledVector(w.facing, 2.7);
  await d.rig.fadeTo(1);
  showFamily(true);
  watcher.at(front.x, 0.15, front.z, Math.atan2(-w.facing.x, -w.facing.z));
  watcher.pose = 'idle';
  d.rig.place(shoulderEye(watcher, new Vector3()), Math.atan2(-w.facing.x, -w.facing.z) + Math.PI);
  // Water at the family's door: lying on the pavement (it stood 30 cm up, like a table top), along the shopfront, out to the kerb.
  const pool = new Mesh(new PlaneGeometry(7, 3.4), new MeshStandardMaterial({ color: 0x27322f, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.8 }));
  pool.rotation.set(-Math.PI / 2, Math.atan2(w.facing.x, w.facing.z), 0, 'YXZ');
  pool.position.copy(w.family).addScaledVector(w.facing, 1.2).setY(0.17);
  pool.pointerEvents = 'none';
  d.world.createTransformEntity(pool, { persistent: true });
  d.stage.own('city', pool);
  await d.rig.fadeTo(0);
  await d.captions.say('S16-1', watcher.head(new Vector3()), 0.25);
  showFamily(false);
  clearSquare();
  dimSun(d, null);
}

/** Dev only: the scene asked for with 7 (the ship) or 8 (the bank), before the day begins. */
let devWant: string | null = null;
let devSkipping: ReturnType<typeof setInterval> | null = null;

/** Dev only: press the skip key (dev-keys.ts, the full stop) again and again from inside the page, until stopped: the scenes before the one asked for go by without anyone at the keys. */
function devSkipOn(): void {
  if (devSkipping != null) return;
  devSkipping = setInterval(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Period', key: '.' })), 600);
}
function devSkipOff(): void {
  if (devSkipping != null) clearInterval(devSkipping);
  devSkipping = null;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    // The number row is on every keyboard: 7 the ship, 8 the bank. (1 2 3 the circus, 4 the forest, 5 the cold fire, 6 the run, 9 clears; F9 switches the desktop emulator's mouse hands off and on.)
    const ship = event.code === 'Digit7';
    const bank = event.code === 'Digit8';
    if ((!ship && !bank) || devWant != null) return;
    devWant = ship ? 'ship' : 'bank';
    devSkipOn();
    console.info(`[dev] at=${devWant}`);
  });
  if (new URLSearchParams(window.location.search).get('at') != null) devSkipOn();
}

/** Dev only: `?at=ship` (or 7 pressed before the day begins) plays the storm ship as soon as the day begins, `?at=bank` (or 8) the sinking bank (S12, S14-S16); the scenes before it are skipped by themselves. */
export async function devAt(d: DirectorSystem, cast: CityCast, keepers: Keepers, w: Wires): Promise<void> {
  if (!import.meta.env.DEV) return;
  devSkipOff();
  const at = devWant ?? new URLSearchParams(window.location.search).get('at');
  if (at === 'ship') {
    const restore = d.people.stash();
    await s13(d);
    await d.stage.show('city', WEATHER.rain2008);
    restore();
    d.rig.place(CITY.shoulder, Math.PI);
  } else if (at === 'bank') {
    // As the real day has it by now: the queue has gone home.
    for (const p of cast.crowd) p.pose = 'hidden';
    parrotWords.learn(WORDS.bailOut, FEATHER.bailOut);
    const flood = await s12(d, cast, keepers);
    // S14 (the feather round to the other ear) is skipped here; it is played from the day itself.
    devSkipOn();
    await s14(d, cast);
    devSkipOff();
    await s15(d, cast, flood);
    await s16(d, keepers, w);
  }
}
