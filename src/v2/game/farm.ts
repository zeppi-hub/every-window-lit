import { AssetManager, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { setDeskCarry, setDeskLook, setDeskMode, setDeskPump } from '../desk-hands.js';
import { type Goal, setGoal, setWindows } from '../goal.js';
import { placeGoal, setRingTargets } from '../goal-system.js';
import { endMiniGame, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { featherMesh, parrotWords, setListener, stowWing } from '../parrot-system.js';
import { CITY_STAGES, easeAfter, FARM_STAGES, type Field, fieldWon, GATES, type Gates, gateSpills, gatesLost, gatesWon, gateWanted, holdPressure, newField, newGates, PUMP, stepField, stepGates, valveBlows } from '../pump-rules.js';
import { setV2Targets } from '../step-targets.js';
import { wordBadge } from '../icons.js';
import { wristJoint } from '../wing-hands-system.js';
import { type BodyLook, PerformerBody } from './circus-body.js';
import { type Hands, readHands, wristOf } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { FarmGates } from './farm-gates.js';
import { ROWS, Yard } from './farm-yard.js';
import { makeGlow, mergeByMaterial } from './fx.js';
import { BOSSES, HEADLINES, WORDS } from './lines.js';
import { type CityCast, FEATHER, type Keepers } from './opening.js';
import { workCloth } from './pump-looks.js';
import { type PumpLook, PumpRig } from './pump-set.js';
import { STALLS, Street } from './pump-street.js';
import { magpie as makeMagpie, showCard } from './run.js';
import { type Weather, WEATHER } from './stage.js';

/** The made pump models (art/v2/ciftlik): the green one for the yard, the rusty one for the square, the jug's keg. Null where one did not load. */
interface MadeKit {
  pump: Object3D | null;
  rust: Object3D | null;
  keg: Object3D | null;
  tub: Object3D | null;
}
let madeKit: Promise<MadeKit> | null = null;
function loadKit(): Promise<MadeKit> {
  const one = (file: string): Promise<Object3D | null> =>
    AssetManager.loadGLTF(`v2/ciftlik/${file}.glb`, `v2_farm_${file}`).then(
      (gltf) => gltf.scene as Object3D,
      () => null,
    );
  return Promise.all([one('yoke_pump'), one('yoke_pump_rust'), one('keg'), one('tub')]).then(([pump, rust, keg, tub]) => ({ pump, rust, keg, tub }));
}

/** What stops the farmer's call across the square once her memory opens. */
let stopCall: (() => void) | null = null;

const TROUBLE = 'TROUBLE 5 OF 6 · THE DROUGHT';
const MEMORY = 'MEMORY · THE DRY FARM';
/** How many windows the drought puts out on the square (S21), lit again as the stalls open (S23). */
const DROUGHT_WINDOWS = 3;

/** Say what the player is to do now (goal.ts draws it); logged once per change in dev. */
let said = '';
function goal(next: Goal): void {
  setGoal(next);
  const text = `${next.where} | ${next.now}${next.steps != null ? ` | ${next.steps[0]}/${next.steps[1]}` : ''}`;
  if (import.meta.env.DEV && text !== said) console.info(`[goal] ${text}`);
  said = text;
}

/**
 * "Prime the pump" (S21-S23). A hot, dusty afternoon: the fountain dry, the
 * market stalls shuttered, Gray out of words at the bench by the square's
 * old pump (S21). In the farmer's memory the player is the farmer: water
 * poured into the pump first, then the bar worked with both hands, wide
 * and fast, to bring a dry field back row by row (S22). Back on the square
 * the same work with the treasury's gold opens the stalls one by one (S23).
 * The rules are pump-rules.ts; the pump itself is pump-set.ts, the yard
 * farm-yard.ts, the stalls pump-street.ts.
 */

/**
 * The afternoon (S21 on): Gray stands at the bench, facing north like the bird; the bird on his right shoulder, his ear as
 * near as on the bank's steps (a seated arm gives it the fifth word), and the old pump before them both, its bar across the bird's chest.
 */
export const BENCH_EYE = new Vector3(0.6, 1.63, -3.15);
const GRAY_AT_BENCH = new Vector3(0.28, 0.15, -3.13);
const GRAY_EAR_AT_BENCH = new Vector3(0.38, 1.75, -3.13);
const SQUARE_FLOOR = 0.15;
/** The square's pump: rusted, on a stone slab, its spout and gauge on Gray's side; the treasury's gold in it. */
const OLD_PUMP: PumpLook = { iron: 0x6a3e26, rough: 0.85, metal: 0.4, wood: 0x5a4632, water: 0xf2c14e, glow: 0.8, stand: 0x77706a, plinth: 0.3, jug: { x: 0.5, z: -0.44 }, side: -1, lamps: 0 };

/** The fountain's water, shown or dried up. */
function fountainWater(cast: CityCast, on: boolean): void {
  for (const name of ['fountain_water', 'bowl_water', 'jet']) {
    const node = cast.fountain.getObjectByName(name);
    if (node != null) node.visible = on;
  }
}

/** The treasury's jug: gold, with a neck and a handle; its origin at its base. */
function goldJug(): Group {
  const jug = new Group();
  jug.name = 'TreasuryJug';
  const gold = new MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.28, metalness: 0.85 });
  const belly = new Mesh(new CylinderGeometry(0.062, 0.078, 0.15, 16), gold);
  belly.position.y = 0.075;
  const shoulder = new Mesh(new CylinderGeometry(0.036, 0.062, 0.05, 16), gold);
  shoulder.position.y = 0.175;
  const neck = new Mesh(new CylinderGeometry(0.044, 0.036, 0.045, 16, 1, true), gold);
  neck.position.y = 0.222;
  const handle = new Mesh(new TorusGeometry(0.05, 0.009, 8, 16, Math.PI), gold);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.07, 0.14, 0);
  jug.add(belly, shoulder, neck, handle);
  return jug;
}

export interface Afternoon {
  rig: PumpRig;
  street: Street;
  ear: Group;
  /** The windows the drought put out. */
  out: number;
}

/** A light over the farmer's palm and a dotted line of flight to it from the bird, until her memory opens: where to go for the word. */
function callTo(d: DirectorSystem, palm: Vector3): () => void {
  const glow = makeGlow(d.world, 0xc8a050, 0.11);
  glow.position.copy(palm).add(new Vector3(0, 0.3, 0));
  const dots = [0, 1, 2, 3, 4, 5, 6].map(() => makeGlow(d.world, 0xffe2a0, 0.035));
  d.stage.own('city', glow, ...dots);
  const from = new Vector3();
  const stop = d.each(() => {
    const t = d.now;
    glow.scale.setScalar(1 + 0.35 * Math.sin(t * 4));
    // The dots run from before the bird's eye up and over to the palm, again and again.
    from.copy(d.eyeAt).add(new Vector3(0.15, -0.2, -0.5));
    dots.forEach((dot, k) => {
      const u = (t * 0.35 + k / dots.length) % 1;
      dot.position.copy(from).lerp(palm, u);
      dot.position.y += Math.sin(u * Math.PI) * 0.9;
      (dot.material as MeshBasicMaterial).opacity = 0.75 * Math.sin(u * Math.PI);
    });
  });
  return () => {
    stop();
    glow.visible = false;
    for (const dot of dots) dot.visible = false;
  };
}

/** S21: a dusty afternoon; the fountain dry, the stalls shuttered, their keepers idle outside them; Gray at the bench by the old pump; the farmer's line. */
export async function s21(d: DirectorSystem, cast: CityCast, keepers: Keepers): Promise<Afternoon> {
  d.chapter('S21');
  d.rain.on = false;
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 3);
    d.stage.blendWeather(WEATHER.rain2008, WEATHER.dusty2008, k);
    return k >= 1;
  });
  fountainWater(cast, false);
  cast.gray.pose = 'hidden';
  goal({ where: TROUBLE, now: 'Watch the square: the windows are going out.' });
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.shut },
  ]);
  d.sounds.play('paper', 0.6);
  // The trouble shows as windows: three more go out, one after another, each with a flicker.
  const out = Math.min(DROUGHT_WINDOWS, cast.windows.lit);
  for (let k = 0; k < out; k += 1) {
    const slot = cast.windows.lit - 1;
    for (let f = 0; f < 2; f += 1) {
      cast.windows.flicker(slot, false);
      await d.wait(0.12);
      cast.windows.flicker(slot, true);
      await d.wait(0.12);
    }
    cast.windows.lit -= 1;
    setWindows(cast.windows.lit, cast.windows.total);
  }
  d.day.darkWindows += out;
  if (import.meta.env.DEV) console.info(`[drought] ${out} windows out: ${cast.windows.lit} of ${cast.windows.total} lit`);
  // The old pump before the bench, dry; the shut stalls in an arc beyond it.
  // The treasury's jug: the made model (art/v2/nesne, 0.63 m tall as made, here a jug for one hand), or the drawn one if it does not load.
  let jug: Object3D = goldJug();
  try {
    const gltf = await AssetManager.loadGLTF('v2/nesne/treasury_jug.glb', 'v2_prop_treasury_jug');
    const model = gltf.scene;
    model.scale.setScalar(0.45);
    const holder = new Group();
    holder.name = 'TreasuryJug';
    holder.add(model);
    jug = holder;
  } catch {
    if (import.meta.env.DEV) console.warn('[drought] the treasury jug did not load: the drawn one stands in');
  }
  // The made pump models are fetched here, in the afternoon's change of weather, so the memory finds them ready.
  madeKit ??= loadKit();
  const made = await madeKit;
  const rig = new PumpRig(d, BENCH_EYE, 0, SQUARE_FLOOR, OLD_PUMP, jug, 'OldPump', { pump: made.rust });
  d.stage.own('city', rig.group);
  rig.jug.visible = false;
  rig.fall = rig.spout.y - (SQUARE_FLOOR + 0.3);
  rig.setMark(holdPressure(CITY_STAGES[0]));
  const street = new Street(d, BENCH_EYE, SQUARE_FLOOR, rig.spout);
  cast.gray.at(GRAY_AT_BENCH.x, GRAY_AT_BENCH.y, GRAY_AT_BENCH.z, Math.PI);
  cast.gray.pose = 'idle';
  // The bird turns to him from wherever the morning left it, then lands on his shoulder.
  const from = d.eyeAt.clone();
  await d.rig.move(from, Math.atan2(-(BENCH_EYE.x - from.x), -(BENCH_EYE.z - from.z)));
  const perch = d.marker(BENCH_EYE.clone().add(new Vector3(0, -0.15, 0)), 'GrayShoulder');
  goal({ where: TROUBLE, now: "Land on Gray's shoulder by the old pump." });
  await d.choosePerch([perch]);
  await d.rig.move(BENCH_EYE, 0);
  const ear = d.marker(GRAY_EAR_AT_BENCH, 'GrayEar');
  if (import.meta.env.DEV) console.info(`[drought] ear ${GRAY_EAR_AT_BENCH.distanceTo(BENCH_EYE).toFixed(2)} m from the eye`);
  const still = d.each((delta) => street.draw(delta, 0, false));
  await d.captions.say('S21-1', cast.gray.head(new Vector3()), 0.25);
  await d.captions.say('S21-2', keepers.people[4].head(new Vector3()), 0.3);
  still();
  // Her palm calls: the word is in her memory.
  if (!parrotWords.has(WORDS.primeThePump)) {
    stopCall = callTo(d, keepers.palms[4].position);
    goal({ where: TROUBLE, now: "Find the word: fly to the farmer's hand." });
  } else goal({ where: TROUBLE, now: 'Give Gray the word: carry the feather to his ear.' });
  return { rig, street, ear, out };
}

/** The seat in the yard: over the stool by the pump, facing the field (north); the plank platform's top. */
const FARM_EYE = new Vector3(0, 1.3, 1.3);
/** The second act: the other bed is "the drier one" once it is this many rows behind, and where the arrow hangs over a bed (the right one; the left is its mirror). */
const SWAP_BY = 0.3;
const BED_SIGN = new Vector3(2.45, 1.45, -3.4);
const PLATFORM = 0.12;
const FARM_PUMP: PumpLook = { iron: 0x1f4a2e, rough: 0.5, metal: 0.55, wood: 0x9a6f3f, water: 0x4d9fd6, glow: 0.2, stand: 0x7a5a38, plinth: 0, jug: { x: -0.5, z: -0.45 }, side: 1, lamps: 0 };
/** The yard's light: a clear hot morning, and the white noon of the third stage. */
const MORNING: Weather = { sky: 0xbfd3e4, fog: 0xd9cdb4, density: 0.004, light: 0.7 };
const NOON: Weather = { sky: 0xf7efd8, fog: 0xeadfc4, density: 0.008, light: 1.0 };

/** The farm's three acts: the pump and one bed, two beds and the sluice, and sharing the water out (pump-rules.ts; the third is farm-gates.ts). */
const ACT_NAMES = ['the pump', 'the sluice', 'the gates'] as const;
const ACT_STAGES = [FARM_STAGES[0], FARM_STAGES[1], FARM_STAGES[1]] as const;
/** Whether the third act is played. Off until it has been seen played through in the game: the memory then ends, as it did, when both beds are wet. In dev, ?act=3 plays it all the same. */
const SHARE_OUT = true;
/** What the pumping acts ask, in the goal plate's words: the same for a hand and for the desk's mouse (which moves the bar up and down, and whose click throws the lever). */
const ACT_GOALS = ['Keep the needle in the green: water six rows.', 'Keep pumping. Throw the lever to the drier bed.'] as const;
/** The same, for the desk's mouse (dev, in the emulator): what the mouse itself is to do. */
const MOUSE_GOALS = ['Keep moving the mouse up and down: water six rows.', 'Keep pumping. Click to send the water to the dry bed.'] as const;
/** In the yard the pump loses its pressure this much slower than the rules' own (the square's pump is the hard one). */
const FARM_LEAK = 0.7;

/** The farmer the player is, seen when she looks down: faded blue overalls, work boots. */
const FARMER: BodyLook = { suit: 0x41597a, trim: 0x41597a, tights: 0x3a5070, shoes: 0x3a2a1c, skin: 0xd9a983, head: false };

/** One stroke's sound: a dry clank from an unprimed pump, a wet heave from a primed one, deeper on the way down. */
function strokeSound(d: DirectorSystem, rig: PumpRig, down: boolean): void {
  if (rig.pump.primed) d.sounds.play('pump_stroke', down ? 0.8 : 0.5, down ? 0.95 : 1.15);
  else d.sounds.play('pump_stroke', 0.3, 1.7);
}

/** The water's sound follows the pressure: full and bright when it is high, thin and low as it falls. */
function waterSound(d: DirectorSystem, rig: PumpRig): void {
  const flow = rig.flow;
  d.sounds.bed('pump_water_loop', flow > 0 ? 0.12 + 0.6 * flow : 0, 0.7 + 0.5 * flow);
}

/** A feather for the word rises from `from`, flies to the wing and joins it; the word is learned as it lands. */
// The memory lets go: the wing is back (the player is the bird again) as the feather sets off.
async function featherToWing(d: DirectorSystem, from: Vector3, word: string, colour: number): Promise<void> {
  const holder = new Group();
  holder.name = 'NewFeather';
  const feather = featherMesh(colour, 0.2, 0.055);
  feather.pointerEvents = 'none';
  holder.add(feather);
  const glow = makeGlow(d.world, colour, 0.07);
  holder.position.copy(from);
  d.world.createTransformEntity(holder, { persistent: true });
  stowWing(false);
  d.sounds.play('feather_rustle', 0.7);
  const start = d.now;
  const rise = from.clone().add(new Vector3(0, 0.45, 0));
  const at = new Vector3();
  // From across a field it flies longer and starts larger than from an arm's length.
  const far = from.distanceTo(d.eyeAt);
  const big = Math.max(1, Math.min(6, far / 1.8));
  const flight = 1.3 + Math.min(1.2, far * 0.1);
  let done = false;
  const stop = d.each(() => {
    const t = d.now - start;
    // Up out of the water, a turn in the air before the eyes, then down to the wing.
    const wing = d.ghost.wingFrom?.() ?? d.eyeAt;
    // Far off it is drawn large, so it is seen coming; it is its own size as it lands.
    let size = big;
    if (t < 0.9) at.copy(from).lerp(rise, 1 - (1 - t / 0.9) ** 2);
    else {
      const k = Math.min(1, (t - 0.9) / flight);
      const e = k * k * (3 - 2 * k);
      at.copy(rise).lerp(wing, e);
      at.y += Math.sin(e * Math.PI) * 0.12;
      size = big + (1 - big) * e;
      if (k >= 1) done = true;
    }
    holder.position.copy(at);
    holder.rotation.y = t * 3.2;
    holder.scale.setScalar(size);
    glow.position.copy(at);
    glow.scale.setScalar(size * (1 + 0.25 * Math.sin(t * 9)));
  });
  d.onSkip(() => {
    done = true;
  });
  await d.until(() => done);
  stop();
  holder.visible = false;
  glow.visible = false;
  parrotWords.learn(word, colour);
  d.sounds.play('ear_click', 0.6);
  d.sounds.play('wing_flap', 0.5);
  if (import.meta.env.DEV) console.info(`[feather] ${word} joins the wing`);
}

/**
 * S22, the drought farm. The player is the farmer, at her pump: the last
 * jug of water goes into its cup (a dry pump gives nothing), then the bar
 * is worked with both hands, wide and fast; the gauge and the stream show
 * the pressure, and it falls the moment the strokes slow. Three stages: one
 * bed of six rows; two beds and the sluice between them; the same at noon,
 * when the far rows dry as fast as they are reached. The pump run dry, or a
 * bed dried right out, loses the stage; the rules are pump-rules.ts.
 */
export async function s22(d: DirectorSystem): Promise<void> {
  d.chapter('S22');
  stopCall?.();
  await d.stage.show('farm', MORNING);
  d.rain.on = false;
  stowWing(true);
  // No ear to carry anything to in here (the desk hands would take the jug to it).
  setListener(null);
  const jug = d.stage.node('farm', 'pitcher');
  if (d.stage.entity('farm') == null || jug == null) return;
  // The file's own pump stood out of a seated reach: it and what was in the new one's way leave the yard.
  for (const name of ['ciftlik_pump_iron', 'ciftlik_dark_iron', 'pump_handle', 'pump_water_stream', 'basin_water', 'ciftlik_dry_branches_medium_01', 'channel_water_main', 'channel_water_left', 'channel_water_right']) {
    const node = d.stage.node('farm', name);
    if (node != null) node.visible = false;
  }
  const can = d.stage.node('farm', 'ciftlik_watering_can_metal_01');
  if (can != null) can.position.x = -1.2;
  const bucket = d.stage.node('farm', 'ciftlik_wooden_bucket_02');
  if (bucket != null) bucket.position.set(0.6, -0.12, 0.9);
  madeKit ??= loadKit();
  const made = await madeKit;
  const mud = d.stage.node('farm', 'ciftlik_dry_ground') as Mesh | null;
  const yard = new Yard(d, mud != null && !Array.isArray(mud.material) ? (mud.material as MeshStandardMaterial) : null, FEATHER.primeThePump, FARM_EYE, made.tub);
  const rig = new PumpRig(d, FARM_EYE, 0, PLATFORM, FARM_PUMP, jug, 'FarmPump', { pump: made.pump, keg: made.keg });
  d.stage.own('farm', rig.group);
  rig.fall = rig.spout.y - yard.tubWater;
  d.rig.place(FARM_EYE, 0);
  // Her own body under her eyes: seated on the stool, her boots on the planks, her sleeves ending at the player's real hands.
  const body = new PerformerBody(FARMER);
  // The body's own cloth is a performer's (sequins, satin piping): hers is plain worn twill, and nothing on it shines.
  const twill = workCloth(FARMER.suit);
  body.root.traverse((o) => {
    o.pointerEvents = 'none';
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (material == null || Array.isArray(material) || material.map == null) return;
    material.map = twill;
    material.color.setRGB(1, 1, 1);
    material.metalness = 0;
    material.roughness = 0.95;
  });
  d.world.createTransformEntity(body.root, { persistent: true });
  d.stage.own('farm', body.root);
  const neck = new Vector3();
  const seat = new Vector3();
  const foot = new Vector3();
  const AHEAD = new Vector3(0, 0, -1);
  const valveAt = rig.group.localToWorld(rig.valveMark.position.clone()).toArray();
  const cupAt = rig.group.localToWorld(rig.cupMark.position.clone()).toArray();
  const jugAt = new Vector3();
  const knobs: [[number, number, number], [number, number, number]] = [yard.knobEnds[0].toArray(), yard.knobEnds[1].toArray()];
  // The second act's sign: a gold arrow that hangs over the bed the water is to be sent to, and only while it is to be sent there.
  const thirsty = new Mesh(new CylinderGeometry(0.3, 0, 0.6, 4), new MeshBasicMaterial({ color: 0xf2c14e }));
  thirsty.visible = false;
  d.world.createTransformEntity(thirsty, { persistent: true });
  d.stage.own('farm', thirsty);
  let bob = 0;
  let offer = 0;
  let deskWas = -1;
  d.sounds.bed('wind_loop', 0.18);
  d.sounds.bed('cicadas_loop', 0.14);

  // Dev: ?act=2 or 3 (or the dev server started with VITE_FARM_ACT) starts at that act; 3 plays the third act whatever the switch says.
  const devAct = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('act') ?? import.meta.env.VITE_FARM_ACT ?? 1) || 1 : 1;
  const acts = SHARE_OUT || devAct === 3 ? 3 : 2;
  const game = playMiniGame(new MiniGame(WORDS.primeThePump, ACT_NAMES.slice(0, acts).map((name) => ({ name }))));
  const minis = d.world.getSystem(MiniGameSystem);
  const paused = () => minis?.playPaused ?? false;
  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  // Dev: a skip ends the game. The director forgets its skips whenever a wait ends, so each wait is armed afresh.
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });

  let stageAt = -1;
  let field: Field | null = null;
  /** After a loss the beds wait for the water to come again before they dry. */
  let held = false;
  let elapsed = 0;
  let lost: string | null = null;
  let won = false;
  let needsJug: boolean | null = null;
  let logAt = 0;
  let ring: Object3D | null = null;
  let showKnob = false;
  let ended = false;
  let goalWas = -1;
  /** The relief valve: seconds of this attempt's water, and since a hand last shut it. */
  let sinceShut = Infinity;
  let markNow: number = PUMP.rehearsalMark;
  let wasGreen = false;
  let strokesAtPrime = -1;
  let handsWas = -1;
  let jugWas: 'left' | 'right' | null = null;
  let heat = 0;
  const wantHeat = 0;
  /** Her own hands: the drawn hands (white as they come) wear her skin while the memory lasts. */
  const skinned = new Map<MeshStandardMaterial, number>();
  let skinAt = 0;
  const skinHands = (): void => {
    for (const side of ['left', 'right'] as const) {
      let node: Object3D | null = wristJoint(hands[side]);
      let mesh: Object3D | undefined;
      for (let up = 0; node != null && mesh == null && up < 6; up += 1) {
        mesh = node.getObjectByProperty('type', 'SkinnedMesh');
        node = node.parent;
      }
      const material = (mesh as Mesh | undefined)?.material as MeshStandardMaterial | undefined;
      if (material == null || Array.isArray(material) || material.color == null || skinned.has(material)) continue;
      skinned.set(material, material.color.getHex());
      material.color.setHex(FARMER.skin);
      if (import.meta.env.DEV) console.info(`[farm] the ${side} hand wears her skin`);
    }
  };
  /** Dev: the desk's mouse plays (the emulator is there): the plate says what the mouse does. */
  const mouse = import.meta.env.DEV && (window as { IWER_DEVICE?: unknown }).IWER_DEVICE != null;
  /** The third act: sharing the water out. Its lever frame, lanes and places wait hidden until then. */
  const share = new FarmGates(d, FARM_EYE, PLATFORM);
  d.stage.own('farm', share.root);
  let gates: Gates | null = null;
  let countWas = -1;
  let wastingWas = false;
  let ringsSet = false;
  /** Dev: the desk's mouse. A press while its hand is on a lever throws that lever. */
  const onDown = (): void => share.press();
  if (import.meta.env.DEV) window.addEventListener('mousedown', onDown, true);
  // The plate stands in the sky over the beds, a little left of straight ahead: the pump, the jug and the gauge are never behind it, and all of it is inside a narrow view.
  placeGoal(0.2, -0.3);
  const tick = d.each((delta) => {
    const live = !paused();
    readHands(d, hands);
    if (skinned.size < 2 && d.now >= skinAt) {
      skinAt = d.now + 1;
      skinHands();
    }
    // The body follows the head and the hands: the neck under the eye, the hips on the stool, the boots where they stand.
    neck.copy(d.eyeAt).add(seat.set(0, -0.17, 0.07));
    body.spine(neck, seat.set(neck.x, PLATFORM + 0.5, neck.z + 0.06), AHEAD);
    for (const side of ['left', 'right'] as const) {
      body.leg(side, foot.set(FARM_EYE.x + (side === 'left' ? -0.13 : 0.13), PLATFORM + 0.04, FARM_EYE.z - 0.36));
      // A free hand held up at the face (the mouse's hand rides the pointer there) would lay its whole sleeve across the view, over the field and the gauge: that arm rests by the side until the hand comes down or takes something.
      const wrist = wristOf(d, side);
      body.arm(side, rig.hands === 0 && rig.jugHeld == null && wrist.y > d.eyeAt.y - 0.14 ? null : wrist);
    }
    const stage = stageAt >= 0 ? ACT_STAGES[stageAt] : null;
    const playing = stage != null && field != null && game.phase === 'playing' && lost == null && !won;
    // The mouse's pump: where the bar is, the sluice (once there are two beds) and which way it stands, the valve while it is open.
    // The other bed is the drier one: the water is to be sent over. (A third of a row between them, so the two do not trade places at every click.)
    const swap = stage != null && stage.beds === 2 && field != null && gates == null && field.fronts[1 - yard.fed] < field.fronts[yard.fed] - SWAP_BY;
    // The lever stays the mouse's for a moment after the beds change places, so the hand that is throwing it finishes its throw.
    offer = swap ? 0.3 : Math.max(0, offer - delta);
    const deskNow = (rig.valveOpen ? 1 : 0) + 2 * yard.fed + 4 * (offer > 0 ? 1 : 0) + 8 * (rig.pump.primed ? 0 : 1);
    if (deskNow !== deskWas) {
      deskWas = deskNow;
      // The mouse's click throws the lever only while the other bed is the drier: a click too many never sends the water back to the full bed.
      setDeskPump({ up: rig.barUp.toArray(), down: rig.barDown.toArray(), sluice: offer > 0 ? knobs : null, fed: yard.fed, valve: rig.valveOpen ? valveAt : null, jug: rig.pump.primed ? null : { at: rig.jugMark.getWorldPosition(jugAt).toArray(), cup: cupAt } });
    }
    thirsty.visible = swap && playing && rig.pump.primed;
    if (thirsty.visible) {
      bob += delta;
      thirsty.position.set(yard.fed === 0 ? BED_SIGN.x : -BED_SIGN.x, BED_SIGN.y + Math.abs(Math.sin(bob * 4)) * 0.25, BED_SIGN.z);
      thirsty.rotation.y += delta * 2;
    }
    const thrown = yard.hand(delta, hands, stage != null && stage.beds === 2 && gates == null);
    if (thrown) {
      showKnob = false;
      d.sounds.play('loaf_drop', 0.5, 1.3);
      if (import.meta.env.DEV) console.info(`[farm] sluice to the ${yard.fed === 0 ? 'left' : 'right'}`);
    }
    const f = rig.frame(delta, hands, stageAt < 0 ? PUMP.rehearsalLeak : FARM_LEAK, live, yard.busy);
    if (f.stroke) strokeSound(d, rig, f.down);
    if (f.shut) {
      sinceShut = 0;
      d.sounds.play('loaf_drop', 0.7, 1.6);
      d.sounds.play('ear_click', 0.6);
      if (import.meta.env.DEV) console.info('[farm] the valve is shut');
    }
    d.sounds.bed('valve_hiss_loop', rig.valveOpen ? 0.7 : 0);
    if (f.primed) {
      strokesAtPrime = rig.pump.strokes;
      d.sounds.play('water_pour', 0.8);
      if (import.meta.env.DEV) console.info('[farm] primed');
    }
    if (f.dry) {
      // The pump sucks air: a gurgle, the gauge flashes, and the jug is wanted again.
      d.sounds.play('pump_gurgle', 0.9);
      rig.alarm();
      rig.jugHome();
      // In the yard that costs only the jug again: an act is lost by a bed drying out, never by a pause at the bar.
      if (import.meta.env.DEV) console.info('[farm] the pump ran dry: the jug again');
    }
    // Every change of what the hands hold is written down, so a player who is stuck can be read from the log.
    if (rig.hands !== handsWas || rig.jugHeld !== jugWas) {
      handsWas = rig.hands;
      jugWas = rig.jugHeld;
      if (import.meta.env.DEV) console.info(`[farm] hands on the bar ${rig.hands}, the jug ${rig.jugHeld == null ? 'on its stand' : `in the ${rig.jugHeld} hand`}`);
    }
    waterSound(d, rig);
    // The needle coming into the green is heard: a small click each time the pressure reaches the stage's mark.
    const green = rig.pump.primed && rig.pump.pressure >= markNow;
    if (green && !wasGreen) {
      d.sounds.play('ear_click', 0.55, 1.2);
      if (import.meta.env.DEV) console.info(`[farm] in the green (${rig.pump.pressure.toFixed(2)} over ${markNow.toFixed(2)})`);
    }
    wasGreen = green;
    if (playing && live && gates != null) {
      // Sharing the water out: the pump runs by itself; the levers send its water down the lanes.
      elapsed += delta;
      const losses = game.failuresOf(stageAt);
      const lever = share.frame(delta, hands);
      if (lever >= 0) {
        d.sounds.play('loaf_drop', 0.6, share.open[lever] ? 1.5 : 1.1);
        if (import.meta.env.DEV) console.info(`[farm] the ${GATES.places[lever]} gate ${share.open[lever] ? 'opens' : 'shuts'}`);
      }
      for (let k = 0; k < 3; k += 1) gates.open[k] = share.open[k];
      const step = stepGates(gates, delta, losses);
      if (step.lit >= 0) {
        // A place is full: its lamps come on, a bell for each (higher each time).
        d.sounds.play('farm_bell', 0.7, 1 + 0.15 * step.lit);
        d.sounds.play('bucket_splash', 0.6);
        yard.cheer();
        if (import.meta.env.DEV) console.info(`[farm] the ${GATES.places[step.lit]} is lit at ${elapsed.toFixed(1)} s`);
      }
      if (step.wasting && !wastingWas) {
        d.sounds.play('pump_gurgle', 0.6);
        if (import.meta.env.DEV) console.info(`[farm] water is going to waste (wanted: the ${GATES.places[Math.max(0, gateWanted(gates))]})`);
      }
      wastingWas = step.wasting;
      if (step.spilled) {
        d.sounds.play('sand_pour', 0.7);
        rig.alarm();
        if (import.meta.env.DEV) console.info(`[farm] spill ${gateSpills(gates)} of ${GATES.spills}`);
      }
      if (gatesWon(gates)) won = true;
      else if (gatesLost(gates)) lost = 'three spills';
    } else if (playing && live && stage != null && field != null) {
      if (held) held = rig.flow <= 0;
      else {
        elapsed += delta;
        // The first second and a half of an attempt nothing dries: time to find the rhythm.
        const ease = elapsed < PUMP.grace ? 0 : easeAfter(game.failuresOf(stageAt), elapsed);
        // The relief valve blows: the pressure pours away until a hand slaps it shut.
        if (!rig.valveOpen) {
          sinceShut += delta;
          if (valveBlows(stage, elapsed, sinceShut, ease)) {
            rig.blow();
            d.sounds.play('wind_gust', 0.6, 1.8);
            if (import.meta.env.DEV) console.info('[farm] the valve blows');
          }
        }
        const dead = stepField(field, stage, rig.flow, stage.beds === 2 ? yard.fed : 0, delta, ease);
        if (dead >= 0) lost = `the ${dead === 0 ? 'left' : 'right'} bed dried out`;
        else if (fieldWon(field, stage)) won = true;
      }
    }
    // The task in words: the jug while the pump is dry, then the stage's own.
    // The plate counts what the act is won by: the rows wet through (of one bed; of the drier of two), the places lit.
    const wetLeft = field == null ? 0 : Math.floor(Math.min(ROWS, field.fronts[0]) + 1e-6);
    const wetRight = field == null || stageAt !== 1 ? ROWS : Math.floor(Math.min(ROWS, field.fronts[1]) + 1e-6);
    // In the third act it says which lever, and why: a gate open on a place that is not to have water is shut first; then the next place's is opened; then the water is watched.
    let say = 0;
    let about = -1;
    let count = Math.min(wetLeft, wetRight);
    if (gates != null) {
      count = (gates.litFor[0] >= 0 ? 1 : 0) + (gates.litFor[1] >= 0 ? 1 : 0) + (gates.litFor[2] >= 0 ? 1 : 0);
      const wanted = gateWanted(gates);
      for (let k = 0; k < 3 && about < 0; k += 1) if (gates.open[k] && k !== wanted) about = k;
      say = about >= 0 ? 1 : wanted >= 0 && !gates.open[wanted] ? 2 : 3;
      if (about < 0) about = wanted;
    }
    const beds = stageAt === 1 && gates == null ? (swap ? 1 : 2) + 2 * yard.fed : 0;
    const goalKey = (rig.pump.primed ? 1 : 0) + 10 * (stageAt + 1) + 100 * count + 1000 * say + 10000 * (about + 1) + 100000 * beds;
    if (!ended && goalKey !== goalWas) {
      goalWas = goalKey;
      const where = `${MEMORY} · ACT ${Math.max(1, stageAt + 1)} OF ${acts}`;
      if (gates != null) {
        const name = GATES.places[Math.max(0, about)];
        const now = say === 1 ? (gates.litFor[Math.max(0, about)] >= 0 ? `Shut the ${name} gate: it is full.` : `Shut the ${name} gate: not its turn yet.`) : say === 2 ? `Open the ${name} gate.` : `Watch the water run to the ${name}.`;
        goal({ where, now, steps: [count, GATES.places.length] });
      } else if (!rig.pump.primed) goal({ where, now: mouse ? 'Click the jug: it pours into the pump.' : 'Take the jug. Pour it into the pump.', steps: [count, ROWS] });
      else if (stageAt < 0) goal({ where, now: mouse ? 'Move the mouse up and down, fast: pump!' : 'Pump: move up and down, wide and fast.', steps: [count, ROWS] });
      else if (beds > 0) {
        // The second act names the bed: the one to send the water to (the arrow hangs over it), or the one that is filling.
        const fedName = yard.fed === 0 ? 'left' : 'right';
        const otherName = yard.fed === 0 ? 'right' : 'left';
        goal({ where, now: swap ? (mouse ? `Click: send the water to the ${otherName} bed.` : `Throw the lever: water the ${otherName} bed.`) : `Keep pumping: the ${fedName} bed is filling.`, steps: [count, ROWS] });
      } else goal({ where, now: (mouse ? MOUSE_GOALS : ACT_GOALS)[Math.min(1, stageAt)], steps: [count, ROWS] });
      if (import.meta.env.DEV && count !== countWas && stageAt >= 0) console.info(`[farm] act ${stageAt + 1}: ${count} of ${gates != null ? GATES.places.length : ROWS}`);
      countWas = count;
    }
    heat += (wantHeat - heat) * Math.min(1, delta * 0.8);
    yard.setHeat(heat);
    if (heat > 0.01 && heat < 0.99) d.stage.blendWeather(MORNING, NOON, heat);
    yard.draw(delta, field, stage, rig.flow, rig.gush);
    // What the rings show, and how the desk's mouse plays: the jug to the cup while the pump is dry, then the bar; in the second stage the sluice's knob until it is first thrown.
    const dry = !rig.pump.primed;
    if (dry !== needsJug) {
      needsJug = dry;
      // With the mouse both hands stay on the bar all along; while the pump is dry any click fetches the jug and pours it (setDeskPump's `jug`).
      setDeskMode('pump');
      setDeskCarry(null);
    }
    // In the second act the sluice's lever is ringed whenever the other bed is the drier by a row.
    const drier = stageAt === 1 && swap;
    // In the third act every lever can be taken, and the one to throw now is the only one ringed.
    const want = ended ? null : gates != null ? (playing && say !== 3 && about >= 0 ? share.marks[about] : null) : dry ? (rig.jugHeld != null ? rig.cupMark : rig.jugMark) : rig.valveOpen ? rig.valveMark : rig.hands === 0 ? rig.barMark : showKnob || drier ? yard.knob : null;
    if (want !== ring || (gates != null) !== ringsSet) {
      ring = want;
      ringsSet = gates != null;
      if (gates != null) {
        setV2Targets(share.marks);
        setRingTargets(want == null ? [] : [want]);
      } else {
        setRingTargets(null);
        setV2Targets(want == null ? [] : [want]);
      }
    }
    if (gates != null) share.draw(delta, gates);
    if (import.meta.env.DEV && d.now >= logAt) {
      logAt = d.now + 0.25;
      console.info(`[farm] stage ${stageAt + 1} p ${rig.pump.pressure.toFixed(2)} flow ${rig.flow.toFixed(2)} hands ${rig.hands} primed ${rig.pump.primed ? 1 : 0} fed ${yard.fed} fronts ${field == null ? '-' : field.fronts.map((v) => v.toFixed(2)).join('/')}${held ? ' held' : ''}${rig.valveOpen ? ' valve' : ''}${gates != null ? ` gates ${gates.open.map((o) => (o ? 1 : 0)).join('')} level ${gates.level.map((v) => v.toFixed(2)).join('/')} wasted ${gates.wasted.toFixed(1)}` : ''}`);
    }
  });
  const firstAct = Math.max(1, Math.min(acts, devAct)) - 1;
  if (firstAct > 0) {
    rig.pump.primed = true;
    rig.runs = true;
    strokesAtPrime = 0;
  }
  // The first two seconds say what there is to do and what it wins: her own thought, over the pump.
  void d.captions.say('S22-0', rig.group.localToWorld(rig.cupMark.position.clone()), 0.25);
  // The rehearsal: no clock. The jug to the cup, then the bar until the first water comes.
  // It is over once the pump is primed and three strokes down and up have been made (or the needle is in the green sooner): it cannot be lost.
  arm();
  await d.until(() => (rig.pump.primed && strokesAtPrime >= 0 && (rig.pump.strokes - strokesAtPrime >= PUMP.rehearsalStrokes || rig.pump.pressure >= PUMP.rehearsalMark)) || skipped);
  if (!skipped) {
    rig.pump.pressure = Math.max(rig.pump.pressure, PUMP.rehearsalMark);
    d.sounds.play('bucket_splash', 0.6);
    if (import.meta.env.DEV) console.info(`[farm] the first water, after ${rig.pump.strokes - strokesAtPrime} half strokes`);
  }
  if (firstAct === 1) rig.runs = false;
  for (let n = 0; n < acts && !skipped; n += 1) {
    if (n < firstAct) {
      arm();
      await d.until(() => (game.phase === 'playing' && game.stage === n) || skipped);
      if (!skipped) game.win();
      continue;
    }
    for (;;) {
      arm();
      await d.until(() => (game.phase === 'playing' && game.stage === n) || skipped);
      if (skipped) break;
      const stage = ACT_STAGES[n];
      // In the third act both beds stay as the second left them: wet through.
      field = n === 2 ? { fronts: [ROWS, ROWS], wetted: [true, true] } : newField(stage);
      elapsed = 0;
      lost = null;
      won = false;
      stageAt = n;
      // The plate says the act's own task afresh (it may still say how the last attempt ended).
      goalWas = -1;
      sinceShut = Infinity;
      rig.valveOpen = false;
      if (n === 2) {
        // The pump runs by itself from here on; the hands are for the levers. The desk's mouse drives one hand, and its view looks down far enough to have the levers and the places in it together.
        gates = newGates();
        share.reset();
        share.show(true);
        rig.runs = true;
        markNow = 2;
        wastingWas = false;
        setDeskMode('one');
        setDeskPump(null);
        setDeskLook(-0.5);
        // The eyes are down at the levers now: the plate comes down with them, over the left bed (nothing happens there in this act), between the levers and the three places.
        placeGoal(0.45, 0.5);
      } else {
        markNow = holdPressure(stage, easeAfter(game.failuresOf(n), 0));
        rig.setMark(markNow);
      }
      if (stage.beds === 1) yard.setFed(0);
      else if (game.attemptsOf(n) === 1 && n === 1) {
        // The second bed: its lever is shown until it is first thrown.
        showKnob = true;
      }
      if (import.meta.env.DEV) console.info(`[farm] act ${n + 1} begins (${ACT_NAMES[n]}), attempt ${game.attemptsOf(n)}${n === 2 ? '' : `, mark ${markNow.toFixed(2)}`}`);
      arm();
      await d.until(() => won || lost != null || skipped);
      if (skipped) break;
      if (won) {
        // The act is won: the bell, a great gush from the spout, the beds leap up green.
        yard.cheer();
        rig.gush = 1;
        d.sounds.play('farm_bell', 0.8);
        d.sounds.play('bucket_splash', 0.7);
        if (import.meta.env.DEV) console.info(`[farm] act ${n + 1} won (${ACT_NAMES[n]}) in ${elapsed.toFixed(1)} s, after ${game.failuresOf(n)} lost attempts`);
        game.win();
        // Said on the plate too, with what comes next.
        if (n + 1 < acts) goal({ where: `${MEMORY} · ACT ${n + 1} OF ${acts}`, now: `Act ${n + 1} won. Next: ${ACT_NAMES[n + 1]}.`, steps: [ROWS, ROWS] });
        break;
      }
      // Lost: the rows crack back to where the stage began, and it is played again once the water runs.
      if (import.meta.env.DEV) console.info(`[farm] act ${n + 1} lost: ${lost}`);
      if (lost !== 'the pump ran dry') {
        d.sounds.play('sand_pour', 0.8);
        rig.alarm();
      }
      held = true;
      game.lose(lost ?? '');
      // Why it was lost, in a line, until the act starts over.
      if (lost !== 'the pump ran dry') goal({ where: `${MEMORY} · ACT ${n + 1} OF ${acts}`, now: n === 2 ? 'Three spills. Open only the ringed gate.' : 'A bed dried out. Pump faster this time.', steps: [0, n === 2 ? GATES.places.length : ROWS] });
    }
  }
  // Won (or skipped): she runs all day now.
  ended = true;
  rig.runs = true;
  rig.valveOpen = false;
  gates = null;
  setRingTargets(null);
  setDeskLook(0);
  placeGoal(0.2, -0.3);
  if (import.meta.env.DEV) window.removeEventListener('mousedown', onDown, true);
  goal({ where: MEMORY, now: 'Take the feather: PRIME THE PUMP is yours.' });
  endMiniGame(game);
  setV2Targets([]);
  setDeskMode('one');
  setDeskPump(null);
  if (skipped) {
    stageAt = acts - 1;
    field = { fronts: [ROWS, ROWS], wetted: [true, true] };
  }
  d.sounds.bed('cicadas_loop', 0.1);
  await d.captions.say('S22-1', d.stage.point('farm', 'spot_farmer', new Vector3()).add(new Vector3(0, 1.8, 0)), 0);
  // The feather that hung past the last row all along comes down the field to the wing: the bird again, with the word.
  await featherToWing(d, yard.takePrize(new Vector3()), WORDS.primeThePump, FEATHER.primeThePump);
  await d.wait(0.6);
  tick();
  body.visible = false;
  for (const [material, colour] of skinned) material.color.setHex(colour);
  share.show(false);
  thirsty.visible = false;
  placeGoal();
  setDeskCarry(null);
  stowWing(false);
  d.sounds.bed('wind_loop', 0);
  d.sounds.bed('cicadas_loop', 0);
  d.sounds.bed('pump_water_loop', 0);
  d.sounds.bed('valve_hiss_loop', 0);
}

/**
 * S23, THE DROUGHT. The same pump, the same hands' work, on the square: the
 * treasury's gold goes into the old pump's cup, and the gold it gives runs
 * down the channel past the shut stalls. Each one it reaches opens: the
 * shutter up, the lamp on, its keeper in at the counter. First three
 * stalls; then the magpie's whisper, people hide what reaches them, and the
 * whole street of six must be held open against it. Let the bar slow and
 * the far stalls shut again; let it stop and the pump sucks air.
 */
export async function s23(d: DirectorSystem, cast: CityCast, after: Afternoon): Promise<void> {
  d.chapter('S23');
  stopCall?.();
  goal({ where: TROUBLE, now: 'Listen: Gray has the word now.' });
  const head = d.player.head;
  const { rig, street } = after;
  void d.gold.show(WORDS.primeThePump.toUpperCase(), cast.gray.head(new Vector3()).add(new Vector3(0, 0.2, 0.3)), 1.3, 3.0, new Vector3(0, 0.25, 0.4), head, wordBadge(WORDS.primeThePump));
  const idle = d.each((delta) => street.draw(delta, 0, false));
  await d.captions.say('S23-1', cast.gray.head(new Vector3()), 0.25);
  idle();
  void d.gold.show(BOSSES.drought.name, new Vector3(0.6, 4.6, -11), 3.2, 2.6, new Vector3(0, 0.15, 0), head);
  // The treasury's jug on its stand; no ear to carry it to (the desk hands would).
  rig.jug.visible = true;
  rig.jugHome();
  setListener(null);
  const valveAt = rig.group.localToWorld(rig.valveMark.position.clone()).toArray();
  const cupAt = rig.group.localToWorld(rig.cupMark.position.clone()).toArray();
  const jugAt = new Vector3();
  let deskWas = -1;
  const bird = makeMagpie(d);
  bird.visible = false;
  d.stage.own('city', bird);

  const game = playMiniGame(new MiniGame(WORDS.primeThePump, CITY_STAGES.map((s) => ({ name: s.name }))));
  const minis = d.world.getSystem(MiniGameSystem);
  const paused = () => minis?.playPaused ?? false;
  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  let stageAt = 0;
  let field: Field | null = null;
  /** The street waits for the gold to come (the first priming, and after a loss) before it can go dark. */
  let held = true;
  /** While someone speaks the rules stand still. */
  let frozen = false;
  let elapsed = 0;
  let lost: string | null = null;
  let won = false;
  let needsJug: boolean | null = null;
  let ring: Object3D | null = null;
  let ended = false;
  let goalWas = -1;
  let sinceShut = Infinity;
  let markNow = holdPressure(CITY_STAGES[0]);
  let handsWas = -1;
  let jugWas: 'left' | 'right' | null = null;
  let wasGreen = false;
  let logAt = 0;
  rig.setLamps(0, 0);
  const tick = d.each((delta) => {
    const live = !paused() && !frozen;
    readHands(d, hands);
    const deskNow = (rig.valveOpen ? 1 : 0) + 2 * (rig.pump.primed ? 0 : 1);
    if (deskNow !== deskWas) {
      deskWas = deskNow;
      setDeskPump({ up: rig.barUp.toArray(), down: rig.barDown.toArray(), sluice: null, valve: rig.valveOpen ? valveAt : null, jug: rig.pump.primed ? null : { at: rig.jugMark.getWorldPosition(jugAt).toArray(), cup: cupAt } });
    }
    const stage = CITY_STAGES[stageAt];
    const playing = field != null && game.phase === 'playing' && lost == null && !won;
    const f = rig.frame(delta, hands, 1, live);
    if (f.stroke) strokeSound(d, rig, f.down);
    if (f.shut) {
      sinceShut = 0;
      d.sounds.play('loaf_drop', 0.7, 1.6);
      d.sounds.play('ear_click', 0.6);
      if (import.meta.env.DEV) console.info('[drought] the valve is shut');
    }
    d.sounds.bed('valve_hiss_loop', rig.valveOpen ? 0.7 : 0);
    if (f.primed) {
      d.sounds.play('water_pour', 0.8);
      if (import.meta.env.DEV) console.info('[drought] primed');
    }
    if (f.dry) {
      d.sounds.play('pump_gurgle', 0.9);
      rig.alarm();
      rig.jugHome();
      if (import.meta.env.DEV) console.info('[drought] the pump ran dry');
      if (playing && !held) lost = 'the pump ran dry';
    }
    if (rig.hands !== handsWas || rig.jugHeld !== jugWas) {
      handsWas = rig.hands;
      jugWas = rig.jugHeld;
      if (import.meta.env.DEV) console.info(`[drought] hands on the bar ${rig.hands}, the jug ${rig.jugHeld == null ? 'on its stand' : `in the ${rig.jugHeld} hand`}`);
    }
    waterSound(d, rig);
    const green = rig.pump.primed && rig.pump.pressure >= markNow;
    if (green && !wasGreen) {
      d.sounds.play('ear_click', 0.55, 1.2);
      if (import.meta.env.DEV) console.info(`[drought] in the green (${rig.pump.pressure.toFixed(2)} over ${markNow.toFixed(2)})`);
    }
    wasGreen = green;
    if (playing && live && field != null) {
      if (held) held = rig.flow <= 0;
      else {
        elapsed += delta;
        const ease = elapsed < PUMP.grace ? 0 : easeAfter(game.failuresOf(stageAt), elapsed);
        if (!rig.valveOpen) {
          sinceShut += delta;
          if (valveBlows(stage, elapsed, sinceShut, ease)) {
            rig.blow();
            d.sounds.play('wind_gust', 0.6, 1.8);
            if (import.meta.env.DEV) console.info('[drought] the valve blows');
          }
        }
        const dead = stepField(field, stage, rig.flow, 0, delta, ease);
        if (dead >= 0) lost = 'the street went dark';
        else if (fieldWon(field, stage)) won = true;
      }
    }
    const front = field == null ? 0 : Math.min(field.fronts[0], stage.rows);
    street.draw(delta, front, rig.flow > 0);
    // The real shopfronts round the square light with the stalls, and the windows the drought put out come back with them.
    const lit = Math.round((front / STALLS) * cast.shops.total);
    if (lit !== cast.shops.lit) cast.shops.lit = lit;
    const back = Math.floor((front / STALLS) * after.out + 0.001);
    const windows = cast.windows.total - d.day.darkWindows + back;
    if (windows !== cast.windows.lit) {
      cast.windows.lit = windows;
      setWindows(cast.windows.lit, cast.windows.total);
    }
    const open = Math.floor(front + 0.001);
    const goalKey = (rig.pump.primed ? 1 : 0) + 10 * stageAt + 100 * open + (rig.valveOpen ? 1000 : 0);
    if (!ended && goalKey !== goalWas) {
      goalWas = goalKey;
      if (!rig.pump.primed) goal({ where: TROUBLE, now: "Pour the treasury's gold into the old pump.", steps: [open, STALLS] });
      else if (rig.valveOpen) goal({ where: TROUBLE, now: 'Slap the hissing valve shut, then pump on.', steps: [open, STALLS] });
      else goal({ where: TROUBLE, now: stageAt === 0 ? 'Pump hard: open the first three stalls.' : 'Pump harder: hold all six stalls open.', steps: [open, STALLS] });
    }
    const dry = !rig.pump.primed;
    if (dry !== needsJug) {
      needsJug = dry;
      setDeskMode('pump');
      setDeskCarry(null);
    }
    const want = dry ? (rig.jugHeld != null ? rig.cupMark : rig.jugMark) : rig.valveOpen ? rig.valveMark : rig.hands === 0 ? rig.barMark : null;
    if (want !== ring) {
      ring = want;
      setV2Targets(want == null ? [] : [want]);
    }
    if (import.meta.env.DEV && d.now >= logAt) {
      logAt = d.now + 0.25;
      console.info(`[drought] stage ${stageAt + 1} p ${rig.pump.pressure.toFixed(2)} flow ${rig.flow.toFixed(2)} hands ${rig.hands} primed ${rig.pump.primed ? 1 : 0} front ${front.toFixed(2)}${held ? ' held' : ''}${rig.valveOpen ? ' valve' : ''}`);
    }
  });

  for (let n = 0; n < CITY_STAGES.length && !skipped; n += 1) {
    for (;;) {
      arm();
      await d.until(() => (game.phase === 'playing' && game.stage === n) || skipped);
      if (skipped) break;
      const stage = CITY_STAGES[n];
      if (n === 1 && game.attemptsOf(1) === 1) {
        // The magpie's whisper, and the keepers nearest the far end pull their shutters down again.
        frozen = true;
        // On the bench's east armrest, beside the bird (nothing is left hanging in the air).
        bird.position.set(0.92, 0.83, -3.42);
        bird.lookAt(BENCH_EYE);
        bird.visible = true;
        bird.userData.clip = 'talk';
        arm();
        await d.captions.say('S23-2', bird, 0.25);
        bird.userData.clip = 'idle';
        bird.visible = false;
        frozen = false;
        if (skipped) break;
      }
      field = newField(stage);
      elapsed = 0;
      lost = null;
      won = false;
      stageAt = n;
      sinceShut = Infinity;
      rig.valveOpen = false;
      markNow = holdPressure(stage, easeAfter(game.failuresOf(n), 0));
      rig.setMark(markNow);
      rig.setLamps(n, n);
      if (import.meta.env.DEV) console.info(`[drought] stage ${n + 1} begins (${stage.name}), mark ${holdPressure(stage, easeAfter(game.failuresOf(n), 0)).toFixed(2)}`);
      arm();
      await d.until(() => won || lost != null || skipped);
      if (skipped) break;
      if (won) {
        street.cheer();
        d.sounds.play('farm_bell', 0.8);
        if (import.meta.env.DEV) console.info(`[drought] stage ${n + 1} won in ${elapsed.toFixed(1)} s`);
        rig.setLamps(n + 1, -1);
        game.win();
        break;
      }
      if (import.meta.env.DEV) console.info(`[drought] stage ${n + 1} lost: ${lost}`);
      if (lost !== 'the pump ran dry') {
        d.sounds.play('crowd_boo', 0.4);
        rig.alarm();
      }
      held = true;
      game.lose(lost ?? '');
    }
  }
  // Won (or skipped): the pump runs by itself, every stall open, every shopfront lit.
  rig.runs = true;
  endMiniGame(game);
  setV2Targets([]);
  setDeskMode('one');
  setDeskPump(null);
  stageAt = CITY_STAGES.length - 1;
  field = { fronts: [STALLS], wetted: [true] };
  ended = true;
  rig.valveOpen = false;
  setDeskCarry(null);
  d.sounds.bed('valve_hiss_loop', 0);
  rig.setLamps(CITY_STAGES.length, -1);
  d.sounds.play('applause', 0.6);
  // The drought's windows are lit again (those a wrong word put out stay out: that was its price).
  d.day.darkWindows -= after.out;
  after.out = 0;
  cast.windows.lit = cast.windows.total - d.day.darkWindows;
  setWindows(cast.windows.lit, cast.windows.total);
  goal({ where: TROUBLE, now: 'Look round: the stalls are open again.', steps: [STALLS, STALLS] });
  await d.gold.show(BOSSES.drought.won, new Vector3(0.6, 3.6, -9), 2.8, 2.8, new Vector3(0, 0.2, 0), head);
  // Green shoots between the cobbles, drawn as one.
  const shoot = new MeshBasicMaterial({ color: 0x5aa04a, side: DoubleSide });
  const shoots = new Group();
  shoots.name = 'Shoots';
  for (let i = 0; i < 40; i += 1) {
    const s = new Mesh(new PlaneGeometry(0.06, 0.12), shoot);
    s.position.set(Math.sin(i * 2.4) * (2 + (i % 7)), 0.2, -4 + Math.cos(i * 1.7) * (2 + (i % 5)));
    s.rotation.y = i;
    shoots.add(s);
  }
  mergeByMaterial(shoots);
  shoots.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(shoots, { persistent: true });
  d.stage.own('city', shoots);
  fountainWater(cast, true);
  d.day.problem = 5;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;
  await showCard(d, 'primeThePump');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.shut, struck: HEADLINES.runs },
  ]);
  // The stalls stay open and the water runs for the rest of the day (the frame work goes on). The pump and the street stand as they are from
  // here to the last night, so each is joined into a few drawings: the square is drawn with everything the day has built on it.
  rig.still();
  street.still();
  void tick;
}
