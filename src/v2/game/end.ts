import { AdditiveBlending, AssetManager, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, PointLight, Points, PointsMaterial, Quaternion, Raycaster, SphereGeometry, Vector3, VisibilityState } from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { onV2 } from '../events.js';
import { type Goal, setGoal, setWindows } from '../goal.js';
import { wordBadge } from '../icons.js';
import { featherMesh, parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { netTexture } from './circus.js';
import type { DirectorSystem } from './director.js';
import { enliven, familyDelight, familyFront, familyGlass, familyWindow, lightPoolTexture, showFamily } from './family.js';
import { stringWires, type Wires } from './fire.js';
import { makeGlow, makeSign, mergeByMaterial } from './fx.js';
import { CREDITS, LINES, type LineId, PERSONAS, type PersonaId, WORDS } from './lines.js';
import { towardInReach } from './noon.js';
import { CITY, type CityCast, type Keepers, mergeFlatParts, prop } from './opening.js';
import { type Person, shoulderEye } from './people.js';
import { WEATHER, type Weather } from './stage.js';
import { COUNTED, countLine, familyLine, squareVerdict, type Trace, traceOf } from '../tally.js';

/**
 * The end (S28-S31). Gray at the microphones counts the words the bird
 * lent him and finds his own; his stopped watch, hung on its stand beside
 * the lectern, starts again, and its hand turned forward winds the square
 * on thirty-three years. In 2041 the old man by the bench knows the bird;
 * the grey feather goes to the family's window one last time. Then, from the old man's
 * shoulder, night comes down and the day is counted: each word the bird
 * learned falls as a feather, with the gold words of the fight it won and
 * something in the square lit because of it; then the windows still lit
 * are counted aloud, the family's among them. Only the words that were
 * learned are named.
 */

/** The square's line by how many windows went dark. */
function squareLine(dark: number): LineId {
  if (dark <= 2) return 'E-1';
  if (dark <= 6) return 'E-2';
  if (dark <= 11) return 'E-3';
  return 'E-4';
}

const PERSONA_END: Readonly<Record<PersonaId, LineId>> = { maya: 'E-M', leo: 'E-L', sam: 'E-S' };
/** Night over the square in 2041, for the last scene: dark enough for every lamp to count. */
const NIGHT: Weather = { sky: 0x0b1026, fog: 0x10172e, density: 0.011, light: 0.17 };
/** Old Gray by the bench and the rusty pump (where the afternoon found him in 2008), facing the bank. */
const OLD_GRAY_AT = new Vector3(0.28, 0.15, -3.13);
const PUMP_SPOUT = new Vector3(0.62, 0.15 + 0.23 + 0.72, -4.15);
/** Where the credits' feathers come down, across the view from the old man's shoulder (m to the right of the eye): clear of the pump straight ahead. */
const LANDINGS = [-1.15, -0.85, -0.55, 0.3, 0.6, 0.9] as const;
/** The end's places in the day, for the goal plate. */
const DAY_END = 'THE END OF THE DAY';
const YEARS_ON = 'THIRTY-THREE YEARS ON';
const THE_COUNT = 'NIGHTFALL · THE COUNT';

/** The words the bird lent Gray, in the order it learned them (its own first word, the family's, is not one of them). */
function lentWords(): { text: string; colour: number }[] {
  return parrotWords.learned.filter((word) => word.text !== WORDS.freshBread);
}

/** A wait a dev skip can end (a plain wait cannot be skipped). */
function pause(d: DirectorSystem, seconds: number): Promise<void> {
  const end = d.now + seconds;
  return d.until(() => d.now >= end);
}

/** Dev only: whether a tester has asked for stops (window.v2Hold); then words stay up long enough to be photographed. */
function stops(): boolean {
  return import.meta.env.DEV && (window as { v2Hold?: boolean }).v2Hold === true;
}

/** Dev only: a tester who has asked for stops gets one here, ended by the skip key, to look round or take a picture. */
async function checkpoint(d: DirectorSystem, name: string): Promise<void> {
  if (!stops()) return;
  console.info(`[hold] ${name}`);
  await d.until(() => false);
}

/** Say what the player is to do now (the goal plate), and note it in the dev log. */
function goal(next: Goal | null): void {
  setGoal(next);
  if (import.meta.env.DEV) console.info(`[goal] ${next == null ? 'none' : `${next.where} | ${next.now}${next.steps != null ? ` (${next.steps[0]}/${next.steps[1]})` : ''}`}`);
}

/** The bird's eye on someone's right shoulder for a look straight ahead: far enough out and forward that their head and shoulder stay out of the view. */
function besideHead(p: Person): Vector3 {
  const s = Math.sin(p.yaw);
  const c = Math.cos(p.yaw);
  const top = p.head(new Vector3()).y;
  // Their right is (-cos, sin), their front (sin, cos).
  return new Vector3(p.position.x - c * 0.46 + s * 0.16, top - 0.14 * p.size, p.position.z + s * 0.46 + c * 0.16);
}

/** Tell the goal plate how the square stands. */
function tellWindows(cast: CityCast): void {
  setWindows(cast.windows.lit, cast.windows.total);
}

/** Dev only: the skip timer that hurries a jump to the last night past S28-S30; S31 stops it. */
let rush: number | null = null;

/** What the end keeps from one scene to the next (the day hands each scene only part of it). */
let city: CityCast | null = null;
interface HungWatch {
  watch: Object3D;
  stand: Object3D;
  hand: Object3D;
  turned: () => number;
}
let hung: HungWatch | null = null;
/** Whom Gray's head is turned to (null: the square in front of him). */
const grayLooks: { at: Vector3 | null } = { at: null };
let grayAlive = false;

/** A model's plainly coloured parts as one draw, both faces drawn as the model has them (an open pail, a thin hand). */
function oneDraw(root: Object3D): void {
  mergeFlatParts(root);
  root.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (material != null && !Array.isArray(material) && material.vertexColors) material.side = DoubleSide;
  });
}

/**
 * Gray's stopped watch, hung where the bird can reach it: on a slim brass stand on the portico floor at the bird's right
 * (the lectern's top is taken by the wing and its feathers). Its hour hand is a swing, one full turn forward.
 */
function hangWatch(d: DirectorSystem): HungWatch {
  const eye = CITY.shoulder;
  // To the bird's right (it faces the square, +z; its right is -x), a little below the eye, an easy reach ahead.
  const at = new Vector3(eye.x - 0.26, eye.y - 0.13, eye.z + 0.32);
  const floor = CITY.grayAt.y;
  const stand = new Group();
  stand.name = 'WatchStand';
  const brass = new MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.6 });
  const top = at.y + 0.085;
  // The stand itself is the press microphones' own slim stand (art/v2/nesne: 1.2 m, three feet), stretched to the watch's height.
  const real = prop('microphones').getObjectByName('mic_stand');
  if (real != null) {
    real.removeFromParent();
    real.position.set(at.x, top, at.z + 0.06);
    real.scale.set(1, (top - floor) / 1.2, 1);
    real.visible = true;
    stand.add(real);
  }
  // The pole behind the watch as the bird sees it (toward the square), its hook's arm reaching back over it, a short chain down to the ring.
  const pole = new Mesh(new CylinderGeometry(0.009, 0.012, top - floor, 10), brass);
  pole.position.set(at.x, floor + (top - floor) / 2, at.z + 0.06);
  const foot = new Mesh(new CylinderGeometry(0.11, 0.13, 0.03, 20), brass);
  foot.position.set(at.x, floor + 0.015, at.z + 0.06);
  const arm = new Mesh(new CylinderGeometry(0.006, 0.006, 0.07, 8), brass);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(at.x, top, at.z + 0.03);
  const chain = new Mesh(new CylinderGeometry(0.003, 0.003, 0.035, 6), brass);
  chain.position.set(at.x, top - 0.0175, at.z);
  // Without the model (it did not load), a plain pole and foot stand in.
  stand.add(arm, chain);
  if (real == null) stand.add(pole, foot);
  mergeByMaterial(stand);
  stand.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(stand, { persistent: true });
  const watch = prop('pocket_watch');
  watch.name = 'PocketWatch';
  // The parts nobody reads from a shoulder away are left out: each is a draw the headset can do without.
  for (const name of ['glass', 'seconds_hand', 'hub']) watch.getObjectByName(name)?.removeFromParent();
  // The hour hand is the bird's to turn, so it stays its own; case, bow and minute hand become one draw beside the printed dial.
  const hand = watch.getObjectByName('hour_hand') ?? new Group();
  const face = hand.parent;
  hand.removeFromParent();
  oneDraw(watch);
  face?.add(hand);
  watch.position.copy(at);
  // Its dial turned to the bird.
  watch.lookAt(eye);
  const watchEntity = d.world.createTransformEntity(watch, { persistent: true });
  d.stage.own('city', stand, watch);
  hand.name = 'WatchHand';
  const handEntity = d.world.createTransformEntity(hand, { parent: watchEntity, persistent: true });
  // Forward this time: one full turn clockwise (negative about the dial's z).
  handEntity.addComponent(PathHandle, { kind: PathKindEnum.Swing, a: hand.position.toArray(), axis: [0, 0, 1], from: 0, to: -Math.PI * 2, grip: [0, 0.032, 0], reach: 0.09 });
  return { watch, stand, hand, turned: () => handEntity.getValue(PathHandle, 'progress') ?? 0 };
}

/** S28: Gray back at the microphones, no feather this time: he counts what the bird lent him, and thanks it. */
export async function s28(d: DirectorSystem, cast: CityCast): Promise<void> {
  d.chapter('S28');
  city = cast;
  goal({ where: DAY_END, now: 'Listen: Gray counts the words you lent him.' });
  tellWindows(cast);
  await d.rig.fadeTo(1);
  cast.gray.at(CITY.grayAt.x, CITY.grayAt.y, CITY.grayAt.z, 0);
  cast.gray.pose = 'idle';
  if (!grayAlive) {
    grayAlive = true;
    enliven(cast.gray, () => grayLooks.at, 0.3);
  }
  // The queue went hours ago and took its umbrellas; the notebook is put away.
  const umbrellas = d.world.scene.getObjectByName('QueueUmbrellas');
  if (umbrellas != null) umbrellas.visible = false;
  d.notebook.mesh.visible = false;
  // His watch, stopped at nine, hangs on its stand at the bird's side from now on.
  if (hung == null) groundShadows(d, [{ x: CITY.shoulder.x - 0.26, z: CITY.shoulder.z + 0.38, r: 0.3, y: CITY.grayAt.y }]);
  hung ??= hangWatch(d);
  // As on the first morning: his cheek and ear in the left of the view, the square ahead.
  d.rig.place(CITY.shoulder, Math.PI + 0.12);
  grayLooks.at = d.eyeAt;
  await d.rig.fadeTo(0);
  // He looks at the bird, then out at the square, and speaks.
  await pause(d, 1.4);
  await checkpoint(d, 'S28 Gray looks at the bird');
  grayLooks.at = null;
  cast.gray.pose = 'talk';
  const lent = lentWords();
  const counted = `I had no words this morning. A bird lent me ${COUNTED[lent.length] ?? String(lent.length)}.`;
  if (import.meta.env.DEV) console.info(`[say] S28-1 Gray: ${counted} (${lent.map((word) => word.text).join(', ')})`);
  await d.captions.show(`Gray: ${counted}`, CITY.graySays, 0, counted.length);
  // Each one rises gold from the lectern, with its picture, in the order it was learned.
  const over = CITY.grayAt.clone().add(new Vector3(0.05, 1.45, 0.8));
  for (const word of lent) {
    d.sounds.play('feather_rustle', 0.5);
    void d.gold.show(word.text.toUpperCase(), over, 0.62, 1.35, new Vector3(0, 0.2, 0.08), d.player.head, wordBadge(word.text));
    await pause(d, 1.1);
  }
  const own = "Tomorrow I'll have to find my own.";
  await d.captions.show(`Gray: ${own}`, CITY.graySays, 0, own.length);
  // To the bird.
  grayLooks.at = d.eyeAt;
  await pause(d, 0.8);
  await d.captions.say('S28-2', CITY.graySays, 0);
  cast.gray.pose = 'idle';
  grayLooks.at = null;
  d.sounds.bed('clock_tick_loop', 0.5);
}

/** A shop front or house front straight out from the square's middle along `angle`, at `height`: where to hang a sign so it lies on a wall. */
function onAFront(d: DirectorSystem, angle: number, height: number): { at: Vector3; out: Vector3 } | null {
  const root = d.stage.root('city');
  if (root == null) return null;
  const caster = new Raycaster(new Vector3(0, height, -6), new Vector3(Math.sin(angle), 0, Math.cos(angle)), 0, 60);
  const hit = caster.intersectObject(root, true).find((h) => h.face != null && Math.abs(h.face.normal.y) < 0.3);
  if (hit?.face == null || !hit.object.name.includes('facade')) return null;
  const out = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).setY(0).normalize();
  return { at: hit.point.clone().addScaledVector(out, 0.05), out };
}

/** S29: the watch on its stand ticks again; its hand turned forward one turn (H3) winds the square on to 2041, seen from Gray's shoulder. */
export async function s29(d: DirectorSystem, cast: CityCast, keepers: Keepers): Promise<void> {
  d.chapter('S29');
  city = cast;
  goal({ where: DAY_END, now: "Turn the watch's hand forward one full turn." });
  const watcher = keepers.watcher;
  hung ??= hangWatch(d);
  const watch = hung;
  // Turned a little to the watch; the person back at the foot of the steps, where the morning began.
  await d.rig.fadeTo(1);
  d.notebook.mesh.visible = false;
  watcher.at(CITY.stairsFoot.x, CITY.stairsFoot.y, CITY.stairsFoot.z).face(CITY.grayAt.x, CITY.grayAt.z);
  watcher.pose = 'idle';
  d.rig.place(CITY.shoulder, Math.PI - 0.1);
  await d.rig.fadeTo(0);
  await checkpoint(d, 'S29 the watch on its stand');
  setV2Targets([watch.hand]);
  // One touch is enough: taken in a pinch (or a click), or pushed a little way round, the hand runs on by itself; left alone
  // for half a minute, the watch starts without help. Nobody is kept here.
  let touched = false;
  const off = onV2('handleTaken', ({ name }) => {
    if (name === 'WatchHand') touched = true;
  });
  const since = d.now;
  await d.until(() => touched || watch.turned() >= 0.1 || d.now - since > 30);
  off();
  if (import.meta.env.DEV) console.info(`[end] watch after ${(d.now - since).toFixed(1)} s: ${touched ? 'taken in a hand' : watch.turned() >= 0.1 ? 'pushed round' : 'left alone (or skipped), it runs by itself'}`);
  setV2Targets([]);
  // A second hand of the same make runs the rest of the turn (the first stays in whatever hand holds it, unseen).
  const running = watch.hand.clone();
  running.name = 'WatchHandRunning';
  watch.hand.parent?.add(running);
  watch.hand.visible = false;
  const from = running.rotation.z;
  const left = -Math.PI * 2 * (1 - Math.min(1, watch.turned()));
  const wound = d.now;
  d.sounds.play('ear_click', 0.5);
  await d.until(() => {
    const k = Math.min(1, (d.now - wound) / 1.8);
    running.rotation.z = from + left * k * k * (3 - 2 * k);
    return k >= 1;
  });
  d.sounds.bed('clock_tick_loop', 0.5, 2.6);
  goal({ where: YEARS_ON, now: 'Watch the square: lit windows are homes saved.' });
  // Thirty-three years on: the reporter and the keepers go, one after another; the evening comes; as many windows dark as words went wrong.
  const leaving: Person[] = [cast.reporter, ...keepers.people];
  const start = d.now;
  const total = cast.windows.total;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 6);
    d.stage.blendWeather(WEATHER.dusty2008, WEATHER.evening2041, k);
    cast.windows.lit = Math.round(total - d.day.darkWindows * k);
    tellWindows(cast);
    cast.crowd.forEach((p, i) => {
      if (k > (i + 1) / (cast.crowd.length + 2)) p.pose = 'hidden';
    });
    leaving.forEach((p, i) => {
      if (k > (i + 1) / (leaving.length + 1)) p.pose = 'hidden';
    });
    return k >= 1;
  });
  for (const p of [...cast.crowd, ...leaving]) p.pose = 'hidden';
  // The queue's umbrellas went with the queue.
  const umbrellas = d.world.scene.getObjectByName('QueueUmbrellas');
  if (umbrellas != null) umbrellas.visible = false;
  // What the keepers held goes with them.
  for (const held of [...keepers.orbs, ...keepers.glows, ...keepers.pictures]) if (held != null) held.visible = false;
  cast.screen.visible = false;
  // SOLD on a wall for every window that went dark (no company's name), each board flat on a front.
  for (let i = 0; i < Math.min(8, d.day.darkWindows); i += 1) {
    const front = onAFront(d, (i / 8) * Math.PI * 2 + 0.5, 2.4);
    if (front == null) continue;
    const sign = makeSign(d.world, 'SOLD', { w: 1.4, h: 0.5 }, { paper: '#f2efe6', ink: '#8a1c1c' });
    sign.position.copy(front.at);
    sign.lookAt(front.at.clone().add(front.out));
    d.stage.own('city', sign);
  }
  // Every ending's cost: the water line plaque on the bank.
  const plaque = makeSign(d.world, 'PAID FOR BY THE PUBLIC', { w: 1.6, h: 0.32 }, { paper: '#2a3a44', ink: '#e8e0c8' });
  plaque.position.set(3.2, 1.9, -19.9);
  d.stage.own('city', plaque);
  d.sounds.bed('clock_tick_loop', 0);
  d.rain.on = false;
  await checkpoint(d, 'S29 the square in 2041');
  await d.captions.say('S29-1', watcher.head(new Vector3()), 0.25);
}

interface BenchLamp {
  lantern: MeshStandardMaterial;
  light: PointLight;
}

/**
 * A street lamp by the bench, and the real light in its lantern: off until night. The lamp is the modelled one
 * (art/v2/nesne, street_lamp.glb: cast iron, its arm 0.5 m to the side, the lantern's glass its own material);
 * if it cannot be had, a plain post and lantern stand in.
 */
async function benchLamp(d: DirectorSystem): Promise<BenchLamp> {
  // At the player's right hand by the bench and a little behind, its arm reaching over them: out of the way of the square, and the light they sit in.
  const at = new Vector3(2.3, 0.15, -2.6);
  let model: Object3D | null = null;
  try {
    await AssetManager.loadGLTF('v2/nesne/street_lamp.glb', 'v2_prop_street_lamp');
    model = AssetManager.getGLTF('v2_prop_street_lamp')?.scene ?? null;
  } catch {
    model = null;
  }
  let lantern = new MeshStandardMaterial({ color: 0x8a8272, emissive: 0xffd08a, emissiveIntensity: 0, roughness: 0.3 });
  const lamp = new Group();
  lamp.name = 'BenchLamp';
  const glassOf = model?.getObjectByName('lamp_glass') as Mesh | undefined;
  if (model != null && glassOf != null && !Array.isArray(glassOf.material)) {
    lantern = glassOf.material as MeshStandardMaterial;
    lantern.emissiveIntensity = 0;
    lamp.add(model);
  } else {
    const iron = new MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.5, metalness: 0.6 });
    const post = new Mesh(new CylinderGeometry(0.05, 0.08, 2.7, 12), iron);
    post.position.y = 1.35;
    const foot = new Mesh(new CylinderGeometry(0.13, 0.16, 0.18, 12), iron);
    foot.position.y = 0.09;
    const arm = new Mesh(new CylinderGeometry(0.02, 0.02, 0.5, 8), iron);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.25, 2.62, 0);
    const cap = new Mesh(new CylinderGeometry(0.03, 0.15, 0.1, 10), iron);
    cap.position.set(0.5, 2.6, 0);
    const glass = new Mesh(new CylinderGeometry(0.12, 0.08, 0.26, 10), lantern);
    glass.position.set(0.5, 2.42, 0);
    lamp.add(post, foot, arm, cap, glass);
    mergeByMaterial(lamp);
  }
  lamp.position.copy(at);
  // The arm (out along +x as made) turned to reach back over the bench.
  lamp.rotation.y = Math.PI;
  lamp.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(lamp, { persistent: true });
  d.stage.own('city', lamp);
  const light = new PointLight(0xffd29a, 0, 10, 1.5);
  light.position.set(1.8, 2.36, -2.6);
  d.world.createTransformEntity(light, { persistent: true });
  return { lantern, light };
}

/** Ease `set` from 0 to 1 over `seconds` (the lamps do not snap on). */
function ease(d: DirectorSystem, seconds: number, set: (k: number) => void): void {
  let t = 0;
  const stop = d.each((delta) => {
    t += delta;
    const k = Math.min(1, t / seconds);
    set(k * k * (3 - 2 * k));
    if (k >= 1) stop();
  });
}

/** Stars and a moon for the last night, far out past the fog; `show(k)` brings them up (0..1). */
function nightSky(d: DirectorSystem): (k: number) => void {
  const COUNT = 420;
  const places = new Float32Array(COUNT * 3);
  let seed = 2041;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < COUNT; i += 1) {
    // Over the upper half of the sky, thinner toward the roofs.
    const up = 0.12 + 0.88 * Math.sqrt(random());
    const round = random() * Math.PI * 2;
    const flat = Math.sqrt(1 - up * up);
    places.set([Math.cos(round) * flat * 820, up * 820, Math.sin(round) * flat * 820], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(places, 3));
  const stars = new Points(geometry, new PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.name = 'Stars';
  stars.frustumCulled = false;
  const moon = new Mesh(new SphereGeometry(16, 20, 14), new MeshBasicMaterial({ color: 0xf4f0dc, transparent: true, opacity: 0, fog: false, toneMapped: false }));
  moon.name = 'Moon';
  moon.position.set(-250, 420, -640);
  const halo = new Mesh(new PlaneGeometry(190, 190), new MeshBasicMaterial({ map: lightPoolTexture(), color: 0x9fb4e8, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  halo.position.copy(moon.position);
  halo.lookAt(0, 0, 0);
  // Kept for a headset with draws to spare; off, the moon is a plain bright disc.
  halo.visible = false;
  for (const o of [stars, moon, halo]) {
    o.pointerEvents = 'none';
    d.world.createTransformEntity(o, { persistent: true });
  }
  d.stage.own('city', stars, moon, halo);
  return (k) => {
    (stars.material as PointsMaterial).opacity = 0.95 * k;
    (moon.material as MeshBasicMaterial).opacity = k;
    (halo.material as MeshBasicMaterial).opacity = 0.5 * k;
  };
}

/**
 * The homes round the square: a warm pane on every house front the square can see, at three storeys, each a little
 * different in tone, all dark until the count. `show(share)` lights that share of them (0..1), in an order of their own.
 */
function cityPanes(d: DirectorSystem): (share: number) => void {
  const root = d.stage.root('city');
  const places: Matrix4[] = [];
  const taken: Vector3[] = [];
  if (root != null) {
    const caster = new Raycaster();
    const from = new Vector3();
    const way = new Vector3();
    const turn = new Quaternion();
    const size = new Vector3(1, 1, 1);
    const front = new Vector3(0, 0, 1);
    for (let i = 0; i < 56; i += 1) {
      const a = (i / 56) * Math.PI * 2 + 0.06;
      for (const height of [4.4, 7.6, 10.8]) {
        caster.set(from.set(0, height, -6), way.set(Math.sin(a), 0, Math.cos(a)));
        caster.far = 70;
        const hit = caster.intersectObject(root, true).find((h) => h.face != null && Math.abs(h.face.normal.y) < 0.3);
        if (hit?.face == null || !hit.object.name.includes('facade')) continue;
        const out = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).setY(0).normalize();
        const at = hit.point.clone().addScaledVector(out, 0.07);
        // Not two panes on top of each other where a near wall takes several rays.
        if (taken.some((other) => Math.abs(other.y - at.y) < 1.2 && Math.hypot(other.x - at.x, other.z - at.z) < 1.9)) continue;
        taken.push(at);
        turn.setFromUnitVectors(front, out);
        places.push(new Matrix4().compose(at, turn, size));
      }
    }
  }
  const mesh = new InstancedMesh(new PlaneGeometry(0.95, 1.45), new MeshBasicMaterial({ toneMapped: false, side: DoubleSide }), Math.max(1, places.length));
  mesh.name = 'HomesLit';
  mesh.frustumCulled = false;
  mesh.pointerEvents = 'none';
  // Lit in an order that jumps about the square, not round it.
  const order = places.map((_, i) => i).sort((x, y) => ((x * 37) % 101) - ((y * 37) % 101));
  const tones = [0xffc878, 0xffb45e, 0xffd9a0, 0xf7c26b, 0xffe2b8];
  const tone = new Color();
  order.forEach((at, slot) => {
    mesh.setMatrixAt(slot, places[at]);
    mesh.setColorAt(slot, tone.setHex(tones[at % tones.length]));
  });
  mesh.count = 0;
  d.world.createTransformEntity(mesh, { persistent: true });
  d.stage.own('city', mesh);
  return (share) => {
    mesh.count = Math.round(places.length * Math.max(0, Math.min(1, share)));
  };
}

/** Where things touch the ground: a soft dark patch under each (people, posts, the fence), one draw for all. */
function groundShadows(d: DirectorSystem, spots: readonly { x: number; z: number; r: number; y?: number }[]): Object3D {
  const mesh = new InstancedMesh(new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: lightPoolTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), spots.length);
  mesh.name = 'ShadowsOnTheGround';
  mesh.frustumCulled = false;
  mesh.pointerEvents = 'none';
  const put = new Matrix4();
  spots.forEach((spot, i) => mesh.setMatrixAt(i, put.makeScale(spot.r, 1, spot.r).setPosition(spot.x, (spot.y ?? 0.15) + 0.012, spot.z)));
  d.world.createTransformEntity(mesh, { persistent: true });
  d.stage.own('city', mesh);
  return mesh;
}

/** Pools of lamplight lying on the cobbles: one draw for all of them, each brought up by itself (`set(i, k)`). */
function lightPools(d: DirectorSystem, pools: readonly { x: number; z: number; r: number; colour: number }[]): (i: number, k: number) => void {
  const mesh = new InstancedMesh(new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), pools.length);
  mesh.name = 'LightOnTheCobbles';
  mesh.frustumCulled = false;
  mesh.pointerEvents = 'none';
  const put = new Matrix4();
  const dark = new Color(0);
  pools.forEach((pool, i) => {
    put.makeScale(pool.r, 1, pool.r).setPosition(pool.x, 0.168 + (i % 5) * 0.0015, pool.z);
    mesh.setMatrixAt(i, put);
    mesh.setColorAt(i, dark);
  });
  d.world.createTransformEntity(mesh, { persistent: true });
  d.stage.own('city', mesh);
  const tint = new Color();
  return (i, k) => {
    mesh.setColorAt(i, tint.setHex(pools[i].colour).multiplyScalar(k));
    if (mesh.instanceColor != null) mesh.instanceColor.needsUpdate = true;
  };
}

/** The things a word leaves standing in the square, all built dark under the fade; `light(trace)` turns one on. */
function squareTraces(d: DirectorSystem, cast: CityCast, w: Wires): (trace: Trace) => void {
  // Safety net: the gold net still under the bank's pavement, and the bank's portico lit from within.
  const net = new Mesh(new PlaneGeometry(9.6, 2.1), new MeshBasicMaterial({ map: netTexture('#f2c14e', 18), transparent: true, opacity: 0, alphaTest: 0.02, side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  net.name = 'NetInThePavement';
  net.rotation.x = -Math.PI / 2;
  net.position.set(-5.2, 0.158, -16.4);
  net.pointerEvents = 'none';
  net.visible = false;
  d.world.createTransformEntity(net, { persistent: true });
  const portico = new PointLight(0xffd9a0, 0, 20, 1.4);
  portico.position.set(CITY.grayAt.x, CITY.grayAt.y + 3.2, CITY.grayAt.z + 0.9);
  d.world.createTransformEntity(portico, { persistent: true });
  // Firewall: the string of bulbs over the square, dark until its word.
  const dark = new Color(0.07, 0.07, 0.09);
  const warm = new Color(1, 0.86, 0.55);
  w.bulbAt.forEach((_, i) => w.bulbs.setColorAt(i, dark));
  if (w.bulbs.instanceColor != null) w.bulbs.instanceColor.needsUpdate = true;
  w.fire.on = false;
  // Bail out: the fountain, dry since the afternoon, runs again under a blue light.
  const water = ['fountain_water', 'bowl_water', 'jet'].map((name) => cast.fountain.getObjectByName(name)).filter((node) => node != null);
  for (const node of water) node.visible = false;
  const spray = makeGlow(d.world, 0x8fd0ff, 1.5);
  spray.position.copy(cast.fountain.position).add(new Vector3(0, 1.3, 0));
  (spray.material as MeshBasicMaterial).opacity = 0;
  // Stress test: the shop windows round the square.
  cast.shops.lit = 0;
  // Prime the pump: the old pump runs gold into a bucket standing under its spout.
  const bucket = new Group();
  bucket.name = 'PumpBucket';
  // The treasury's gold bucket (art/v2/nesne, 1 m tall), here a pail's size, without its chain.
  const pail = prop('giant_bucket');
  for (const name of ['chain', 'chain_top', 'handle']) pail.getObjectByName(name)?.removeFromParent();
  // The pail and its bands in one draw.
  oneDraw(pail);
  pail.scale.setScalar(0.3);
  const gold = new MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false, transparent: true, opacity: 0 });
  const stream = new Mesh(new CylinderGeometry(0.012, 0.018, 1, 8), gold);
  const fall = PUMP_SPOUT.y - 0.15 - 0.2;
  stream.scale.y = fall;
  stream.position.y = 0.2 + fall / 2;
  bucket.add(pail, stream);
  bucket.position.set(PUMP_SPOUT.x, 0.15, PUMP_SPOUT.z);
  bucket.traverse((o) => {
    o.pointerEvents = 'none';
  });
  // Only where the pump itself stands (it is put up in the afternoon, S21).
  bucket.visible = d.world.scene.getObjectByName('OldPump') != null;
  d.world.createTransformEntity(bucket, { persistent: true });
  const shine = makeGlow(d.world, 0xf2c14e, 0.3);
  shine.position.set(PUMP_SPOUT.x, 0.4, PUMP_SPOUT.z);
  (shine.material as MeshBasicMaterial).opacity = 0;
  // Ring-fence: a jar of savings on a stone plinth, a low fence round it, a lantern on every other post.
  const ring = new Group();
  ring.name = 'RingFence';
  const stone = new MeshStandardMaterial({ color: 0x8a857c, roughness: 0.9 });
  const timber = new MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.8 });
  const lanterns = new MeshStandardMaterial({ color: 0x6f6858, emissive: 0xffc46a, emissiveIntensity: 0, roughness: 0.4 });
  const coins = new MeshStandardMaterial({ color: 0x9a7a2a, emissive: 0xf2c14e, emissiveIntensity: 0, roughness: 0.35, metalness: 0.6 });
  const plinth = new Mesh(new CylinderGeometry(0.34, 0.4, 0.5, 16), stone);
  plinth.position.y = 0.25;
  const jar = new Mesh(new CylinderGeometry(0.2, 0.2, 0.42, 18), coins);
  jar.position.y = 0.71;
  const lid = new Mesh(new CylinderGeometry(0.16, 0.2, 0.06, 18), stone);
  lid.position.y = 0.95;
  // Two draws for all of it: what stays cold (stone, timber) and what comes alight (the jar, the lanterns).
  const cold = new Group();
  cold.name = 'RingFenceCold';
  const alight = new Group();
  alight.name = 'RingFenceAlight';
  cold.add(plinth, lid);
  alight.add(jar);
  ring.add(cold, alight);
  const POSTS = 14;
  const RADIUS = 1.15;
  for (let i = 0; i < POSTS; i += 1) {
    const a = (i / POSTS) * Math.PI * 2;
    const post = new Mesh(new BoxGeometry(0.07, 0.8, 0.07), timber);
    post.position.set(Math.sin(a) * RADIUS, 0.4, Math.cos(a) * RADIUS);
    post.rotation.y = a;
    cold.add(post);
    // Two rails to the next post.
    const b = ((i + 1) / POSTS) * Math.PI * 2;
    const from = new Vector3(Math.sin(a) * RADIUS, 0, Math.cos(a) * RADIUS);
    const to = new Vector3(Math.sin(b) * RADIUS, 0, Math.cos(b) * RADIUS);
    for (const height of [0.3, 0.62]) {
      const rail = new Mesh(new BoxGeometry(from.distanceTo(to), 0.06, 0.025), timber);
      rail.position.copy(from).lerp(to, 0.5).setY(height);
      rail.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
      cold.add(rail);
    }
    if (i % 2 === 0) {
      const lantern = new Mesh(new BoxGeometry(0.1, 0.13, 0.1), lanterns);
      lantern.position.set(Math.sin(a) * RADIUS, 0.865, Math.cos(a) * RADIUS);
      lantern.rotation.y = a;
      alight.add(lantern);
    }
  }
  mergeFlatParts(cold);
  mergeFlatParts(alight);
  // Whatever glows there now (the one merged mesh; the jar and the lanterns themselves if the merge did not happen).
  const glowing = new Set<MeshStandardMaterial>();
  alight.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (material == null || Array.isArray(material)) return;
    if (material.vertexColors) material.emissive.set(0xffc46a);
    material.emissiveIntensity = 0;
    glowing.add(material);
  });
  ring.position.set(3.3, 0.15, -8.4);
  ring.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(ring, { persistent: true });
  const hearth = makeGlow(d.world, 0xffc46a, 1.3);
  hearth.position.copy(ring.position).add(new Vector3(0, 0.75, 0));
  (hearth.material as MeshBasicMaterial).opacity = 0;
  // The three soft glows are left out of the picture: their light is shown on the ground instead, and each was a draw the headset can do without.
  spray.visible = shine.visible = hearth.visible = false;
  d.stage.own('city', net, spray, bucket, shine, ring, hearth);
  // What each of them throws on the ground: under every bulb, at the bank's steps, round the fountain, the bucket and the fence.
  const spot = new Vector3();
  const grounds = [
    ...w.bulbAt.map((b) => {
      w.spans[b.span].getPointAt(b.t, spot);
      return { x: spot.x, z: spot.z, r: 2.3, colour: 0xffc98f };
    }),
    { x: CITY.grayAt.x, z: CITY.grayAt.z + 5.2, r: 5.5, colour: 0xffd9a0 },
    { x: cast.fountain.position.x, z: cast.fountain.position.z, r: 3.4, colour: 0x7fb8f0 },
    { x: PUMP_SPOUT.x, z: PUMP_SPOUT.z, r: 0.9, colour: 0xf2c14e },
    { x: ring.position.x, z: ring.position.z, r: 3.0, colour: 0xffc46a },
  ];
  const pool = lightPools(d, grounds);
  const bulbs = w.bulbAt.length;
  return (trace) => {
    if (trace === 'net') {
      net.visible = true;
      ease(d, 1.6, (k) => {
        (net.material as MeshBasicMaterial).opacity = 0.95 * k;
        portico.intensity = 30 * k;
        pool(bulbs, 0.8 * k);
      });
    } else if (trace === 'bulbs') {
      // One after another along the wires.
      let lit = 0;
      ease(d, 2.2, (k) => {
        const upTo = Math.round(k * w.bulbAt.length);
        for (; lit < upTo; lit += 1) {
          w.bulbs.setColorAt(lit, warm);
          pool(lit, 0.55);
        }
        if (w.bulbs.instanceColor != null) w.bulbs.instanceColor.needsUpdate = true;
      });
    } else if (trace === 'fountain') {
      for (const node of water) node.visible = true;
      d.sounds.play('water_pour', 0.5);
      ease(d, 1.6, (k) => {
        (spray.material as MeshBasicMaterial).opacity = 0.07 * k;
        pool(bulbs + 1, 0.8 * k);
      });
    } else if (trace === 'shops') {
      const all = cast.shops.total;
      ease(d, 2, (k) => {
        cast.shops.lit = Math.round(all * k);
      });
    } else if (trace === 'pump') {
      d.sounds.play('pump_stroke', 0.6);
      ease(d, 1.2, (k) => {
        gold.opacity = 0.9 * k;
        (shine.material as MeshBasicMaterial).opacity = 0.1 * k;
        pool(bulbs + 2, 0.9 * k);
      });
    } else {
      ease(d, 1.6, (k) => {
        for (const material of glowing) material.emissiveIntensity = 1.9 * k;
        (hearth.material as MeshBasicMaterial).opacity = 0.04 * k;
        pool(bulbs + 3, 0.8 * k);
      });
    }
  };
}

/**
 * S31, the count and the credits, from old Gray's shoulder by the bench.
 * Night comes down and the lamp beside them comes on. The player lets
 * each learned word go, a feather from the wing into the night air: it
 * flies out and lies on the cobbles, and with it come the gold words of
 * the fight it won, what it left in the square lighting up behind, and
 * its line from the cards. Then the windows are counted one by one and the number
 * is said, the family's window with it, and how the square came through.
 * The two closing lines, the dark, and young Gray's voice.
 */
async function s31(d: DirectorSystem, cast: CityCast, w: Wires, old: Person, lamp: BenchLamp): Promise<void> {
  d.chapter('S31');
  if (rush != null) {
    window.clearInterval(rush);
    rush = null;
  }
  const lent = lentWords();
  const watching = 'Let each feather go: it lights what it saved.';
  goal({ where: THE_COUNT, now: watching, steps: [0, Math.max(1, lent.length)] });
  // All of it is built in the dark of the fade the scene opens behind.
  const light = squareTraces(d, cast, w);
  const sky = nightSky(d);
  groundShadows(d, [
    { x: OLD_GRAY_AT.x, z: OLD_GRAY_AT.z, r: 0.5 },
    { x: 2.3, z: -2.6, r: 0.38 },
    { x: 3.3, z: -8.4, r: 1.7 },
    { x: PUMP_SPOUT.x, z: PUMP_SPOUT.z, r: 0.26 },
  ]);
  const underLamp = lightPools(d, [{ x: 1.8, z: -2.9, r: 3.6, colour: 0xffd29a }]);
  const homes = cityPanes(d);
  old.at(OLD_GRAY_AT.x, OLD_GRAY_AT.y, OLD_GRAY_AT.z, Math.PI);
  old.pose = 'idle';
  const seat = shoulderEye(old, new Vector3());
  d.rig.place(seat, 0);
  // The windows wait for their count.
  const litWindows = cast.windows.lit;
  const total = cast.windows.total;
  cast.windows.lit = 0;
  tellWindows(cast);
  await d.rig.fadeTo(0);
  // Night, and the lamp by the bench.
  const dusk = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - dusk) / 3.5);
    d.stage.blendWeather(WEATHER.evening2041, NIGHT, k);
    lamp.lantern.emissiveIntensity = 2.6 * k;
    lamp.light.intensity = 14 * k;
    underLamp(0, 0.9 * k);
    sky(k);
    return k >= 1;
  });
  d.stage.setWeather(NIGHT);
  // The night's own sound: a little wind across the square.
  d.sounds.bed('wind_loop', 0.14);
  await checkpoint(d, 'S31 night');
  // The lines come up low in front, so the square stays in view over them; the gold words above them.
  const ahead = new Vector3(0, 0, -1);
  const spot = seat.clone().addScaledVector(ahead, 1.5).add(new Vector3(0, -0.42, 0));
  const high = seat.clone().addScaledVector(ahead, 2.4).add(new Vector3(0, 0.34, 0));
  // The player lets the words go, one feather at a time, in any order: taken from the wing and let go in the night air in front,
  // each flies out over the square. A feather nobody lets go follows by itself after a while, so the night never waits for ever.
  const air = d.marker(seat.clone().addScaledVector(ahead, 0.42).add(new Vector3(0.04, -0.16, 0)), 'NightAir');
  const waiting = [...lent];
  for (let i = 0; waiting.length > 0; i += 1) {
    setListener(air, 0.24);
    setV2Targets([air]);
    const next = waiting[0].text;
    const asked = d.now;
    const given = await Promise.race([d.nextWord(next).then((text) => ({ text, by: 'the player' })), pause(d, i === 0 ? 20 : 12).then(() => ({ text: next, by: 'itself' }))]);
    d.cancelWord();
    setV2Targets([]);
    const at = Math.max(0, waiting.findIndex((one) => one.text === given.text));
    const word = waiting.splice(at, 1)[0];
    if (import.meta.env.DEV) console.info(`[end] feather ${i + 1} of ${lent.length} after ${(d.now - asked).toFixed(1)} s: "${given.text}" let go by ${given.by}, counted as "${word.text}"`);
    const known = traceOf(word.text);
    // The feather leaves the hand, comes down turning, and lies on the cobbles.
    const feather = new Group();
    feather.name = `Fallen ${word.text}`;
    feather.add(featherMesh(word.colour, 0.2, 0.06));
    feather.traverse((o) => {
      o.pointerEvents = 'none';
    });
    const land = new Vector3(seat.x + LANDINGS[i % LANDINGS.length], 0.172, seat.z - 1.9 - 0.12 * (i % 2));
    feather.position.copy(air.position);
    d.world.createTransformEntity(feather, { persistent: true });
    d.stage.own('city', feather);
    d.sounds.play('feather_rustle', 0.5);
    const from = d.now;
    const start = air.position;
    await d.until(() => {
      const k = Math.min(1, (d.now - from) / 1.9);
      // Out and up a little on the air first, then down in a slow sway.
      const out = 1 - (1 - k) * (1 - k);
      feather.position.set(start.x + (land.x - start.x) * out + Math.sin(k * 9) * 0.1 * (1 - k), start.y + (land.y - start.y) * k * k + Math.sin(k * Math.PI) * 0.35, start.z + (land.z - start.z) * out + Math.cos(k * 7) * 0.07 * (1 - k));
      feather.rotation.y = 0.6 * i + k * 5;
      return k >= 1;
    });
    feather.position.copy(land);
    goal({ where: THE_COUNT, now: watching, steps: [lent.length - waiting.length, lent.length] });
    if (known != null) {
      light(known.trace);
      // The fight this word won, in its gold words.
      void d.gold.show(known.won, high, 1.5, stops() ? 12 : 3.4, new Vector3(0, stops() ? 0 : 0.06, 0), d.player.head, wordBadge(word.text));
    }
    const line = known?.line ?? `${word.text}.`;
    if (import.meta.env.DEV) console.info(`[credits] ${known?.won ?? ''} | ${line}`);
    const read = d.captions.show(line, spot, 0, stops() ? 200 : line.length);
    await pause(d, 1.2);
    await checkpoint(d, `S31 word ${i + 1}`);
    await read;
  }
  setListener(null);
  // The count: the windows come on one by one, each with a tick, and the number is said.
  goal({ where: THE_COUNT, now: 'Count the windows still lit tonight.' });
  for (let n = 1; n <= litWindows; n += 1) {
    cast.windows.lit = n;
    homes(n / Math.max(1, total));
    tellWindows(cast);
    d.sounds.play('ear_click', 0.35, 1 + n * 0.02);
    await pause(d, 0.3);
  }
  if (import.meta.env.DEV) console.info(`[end] count: ${litWindows} of ${total} windows, ${d.day.darkWindows} went dark in the day`);
  const count = countLine(litWindows, total);
  const verdict = squareVerdict(litWindows, total);
  if (import.meta.env.DEV) console.info(`[count] ${count} | ${familyLine(true)} | ${verdict}`);
  void d.gold.show(count.toUpperCase(), high, 1.9, stops() ? 30 : 9, new Vector3(0, 0.02, 0), d.player.head);
  // The family's window is the one that is always kept; then how the square came through.
  // The number stands in gold over the square; under it, only what it means.
  await pause(d, 1.6);
  await checkpoint(d, 'S31 count 1');
  for (const [n, line] of [familyLine(true), verdict].entries()) {
    const read = d.captions.show(line, spot, 0, stops() ? 200 : line.length);
    await pause(d, 1.0);
    await checkpoint(d, `S31 count ${n + 2}`);
    await read;
  }
  await d.captions.show(CREDITS.secondTry, spot, 0);
  // Too long for one plate at a readable size: in two.
  await d.captions.show('Simplified. Based mainly on the United States, 2008–2010.', spot, 0);
  if (lent.some((word) => traceOf(word.text)?.trace === 'fence')) await d.captions.show('Ring-fencing is British.', spot, 0);
  // A last look at the square from his shoulder, the wing at the player's side.
  await checkpoint(d, 'S31 the last look');
  await pause(d, 2.5);
  // Last, in the dark, young Gray's voice.
  goal(null);
  d.sounds.bed('wind_loop', 0);
  await d.rig.fadeTo(1);
  const last = LINES['E-T'];
  if (import.meta.env.DEV) console.info(`[say] E-T ${last.speaker}: ${last.text}`);
  // Short as it is, it stays up long enough to be read in the dark.
  await d.captions.show(`${last.speaker}: ${last.text}`, spot, 0, 60, true);
  await d.wait(2.5);
  // Out of the headset: back on the start page, one press plays again from the start.
  const world = d.world;
  // Already out (the headset was taken off during the last line): the signal would call back at once, before `off` exists.
  if (world.visibilityState.peek() === VisibilityState.NonImmersive) {
    window.location.reload();
    return;
  }
  const off = world.visibilityState.subscribe((state) => {
    if (state !== VisibilityState.NonImmersive) return;
    off();
    window.location.reload();
  });
  world.exitXR();
}

/** S30: 2041; the old man by the bench knows the bird; the grey feather to the family's window; a last look through its glass; then the count and the credits (S31). */
export async function s30(d: DirectorSystem, keepers: Keepers, w: Wires, persona: PersonaId): Promise<void> {
  d.chapter('S30');
  goal({ where: YEARS_ON, now: 'Look: the old man knows you.' });
  const watcher = keepers.watcher;
  await d.rig.fadeTo(1);
  // Gray and his watch are thirty-three years behind; the person walks on ahead to their family's place.
  if (hung != null) hung.watch.visible = hung.stand.visible = false;
  if (city != null) city.gray.pose = 'hidden';
  watcher.pose = 'hidden';
  // The street lamp by the bench is there from the first look at 2041, unlit until night.
  const lamp = await benchLamp(d);
  const old = d.people.add({ model: 'gray', size: 0.97 });
  // Ahead and a little to the left of the bench's back, in plain view, turned to the bird.
  old.at(-0.55, 0.15, -5.3).face(CITY.benchPerch.x, CITY.benchPerch.z);
  const oldLooks: { at: Vector3 | null } = { at: d.eyeAt };
  enliven(old, () => oldLooks.at, 0.6);
  // A neighbour has stopped by him, his eye on the bank across the square: every ending's grumble.
  const neighbour = d.people.add({ model: 'crowd_man_suit' });
  neighbour.at(1.95, 0.15, -5.7).face(old.position.x, old.position.z);
  neighbour.pose = 'idle';
  enliven(neighbour, () => old.position, 0.2);
  const underThem = groundShadows(d, [
    { x: old.position.x, z: old.position.z, r: 0.5 },
    { x: neighbour.position.x, z: neighbour.position.z, r: 0.5 },
    { x: 2.3, z: -2.6, r: 0.38 },
  ]);
  d.rig.place(CITY.benchPerch.clone().add(new Vector3(0, 0.3, 0)), 0);
  await d.rig.fadeTo(0);
  await checkpoint(d, 'S30 the old man by the bench');
  old.pose = 'talk';
  await d.captions.say('E-G', old.head(new Vector3()), 0.25);
  old.pose = 'idle';
  neighbour.pose = 'talk';
  await d.captions.say('E-N', neighbour.head(new Vector3()), 0.25);
  neighbour.pose = 'idle';
  // The family's place, its window lit (always the thirteenth), and the bird on the person's shoulder.
  goal({ where: YEARS_ON, now: "Carry the grey feather to the family's window." });
  const toward = Math.atan2(-w.facing.x, -w.facing.z);
  const front = familyFront()?.clone() ?? w.family.clone().addScaledVector(w.facing, 2.6);
  await d.rig.fadeTo(1);
  neighbour.pose = 'hidden';
  underThem.visible = false;
  showFamily(true);
  watcher.at(front.x, 0.15, front.z, toward);
  watcher.pose = 'idle';
  if (persona === 'maya') {
    // "BROOKS BAKERY & DAUGHTER" (S30), on the shop's front over its window.
    const sign = makeSign(d.world, 'BROOKS BAKERY & DAUGHTER', { w: 2.4, h: 0.4 }, { paper: '#f4efe4', ink: '#2a2420' });
    sign.position.copy(w.family).addScaledVector(w.facing, 0.06).setY(2.8);
    sign.rotation.y = Math.atan2(w.facing.x, w.facing.z);
    d.stage.own('city', sign);
  }
  d.rig.place(besideHead(watcher), toward + Math.PI);
  await d.rig.fadeTo(0);
  const glassAt = familyGlass();
  const pane = glassAt?.at.clone() ?? w.family.clone().addScaledVector(w.facing, 1.6).setY(1.4);
  await checkpoint(d, 'S30 the family window');
  // The family's word, one last time: the grey feather to their window.
  const glass = d.marker(towardInReach(d.eyeAt, pane), 'FamilyGlass');
  setListener(glass, 0.3);
  setV2Targets([glass]);
  const word = await Promise.race([d.nextWord(WORDS.freshBread), d.wait(10).then(() => '')]);
  d.cancelWord();
  setV2Targets([]);
  if (import.meta.env.DEV) console.info(`[end] family glass: ${word === WORDS.freshBread ? 'the grey feather given' : word === '' ? 'no feather in 10 s, the scene goes on' : `another word given (${word}), no laugh`}`);
  if (word === WORDS.freshBread) {
    // They turn to the window and laugh; the child's arms go up.
    familyDelight();
    void d.gold.show(WORDS.freshBread.toUpperCase(), pane.clone().add(new Vector3(0, 0.6, 0)), 1.2, 2.6, new Vector3(0, 0.3, 0), d.player.head);
    await pause(d, 1.2);
    await checkpoint(d, 'S30 the family hears the word');
  }
  // The person's own lines come up low at the bird's left, where they stand (their head is beside the view, not in it).
  const ahead = new Vector3(-w.facing.x, 0, -w.facing.z).normalize();
  const leftward = new Vector3(ahead.z, 0, -ahead.x);
  const says = () => d.eyeAt.clone().addScaledVector(ahead, 0.95).addScaledVector(leftward, 0.3).add(new Vector3(0, -0.2, 0));
  await d.captions.say(PERSONA_END[persona], says(), 0);
  await d.captions.say(squareLine(d.day.darkWindows), says(), 0);
  // A step nearer the glass for a last look at them, close enough to see them breathe.
  if (glassAt != null) {
    await d.rig.fadeTo(1);
    const near = glassAt.at.clone().addScaledVector(glassAt.facing, 1.05);
    watcher.at(near.x, 0.15, near.z, toward);
    d.rig.place(besideHead(watcher), toward + Math.PI);
    await d.rig.fadeTo(0);
    await checkpoint(d, 'S30 close to the glass');
    await pause(d, 4);
  }
  // The count and the credits, from the old man's shoulder.
  await d.rig.fadeTo(1);
  showFamily(false);
  watcher.pose = 'hidden';
  oldLooks.at = null;
  // Reached by the day's own order of scenes without the square's cast in hand (S28 keeps it).
  if (city == null) return;
  await s31(d, city, w, old, lamp);
  // The day's older, shorter credits are not to follow these: the page is on its way back to the start.
  await new Promise<void>(() => {});
}

/**
 * Dev only: the end from a standing start, without the day before it (main.ts: ?memory=end, or ?memory=night for the
 * last night alone). Every word is put on the wing, `who` is the chosen person, their family's room is made, and what
 * belongs to the skipped day is put away (the queue, the reporter, the rain), so neither the picture nor a measurement
 * carries things the real day would have cleared.
 */
export async function endAlone(d: DirectorSystem, cast: CityCast, from: 'S28' | 'S31', who: PersonaId): Promise<void> {
  if (!import.meta.env.DEV) return;
  const colours: Readonly<Record<string, number>> = { 'Safety net': 0xe8c45a, Firewall: 0xb4532a, 'Bail out': 0x4a86c0, 'Stress test': 0xe8f0ff, 'Prime the pump': 0x5aa04a, 'Ring-fence': 0xa0c8a0 };
  parrotWords.learn(WORDS.freshBread, 0x9a9a9a);
  for (const [text, colour] of Object.entries(colours)) parrotWords.learn(text, colour);
  d.day.persona = who;
  d.captions.persona = PERSONAS[who].name;
  d.rain.on = false;
  d.stage.setWeather(WEATHER.dusty2008);
  for (const p of cast.crowd) p.pose = 'hidden';
  cast.reporter.pose = 'hidden';
  const watcher = d.people.add({ model: who });
  watcher.pose = 'hidden';
  const keepers: Keepers = { people: [], orbs: [], palms: [], glows: [], pictures: [], watcher };
  const wires = stringWires(d, who);
  await d.rig.fadeTo(1);
  await familyWindow(d, wires, who);
  showFamily(false);
  if (import.meta.env.DEV) console.info(`[end] jumped to ${from} as ${who}, six words on the wing`);
  if (from === 'S31') rush = window.setInterval(() => d.skip(), 300);
  await s28(d, cast);
  await s29(d, cast, keepers);
  await s30(d, keepers, wires, who);
}
