import { setGoal } from '../goal.js';
import { hideHands } from '../wing-hands-system.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AdditiveBlending, AnimationClip, AnimationMixer, AssetManager, BoxGeometry, BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, OneHandGrabbable, PlaneGeometry, Quaternion, SphereGeometry, SRGBColorSpace, Texture, Vector3 , Raycaster, SpotLight, Color, ConeGeometry, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4 } from '@iwsdk/core';
import { wordBadge } from '../icons.js';
import { MemoryOrb, PathHandle, PathKindEnum } from '../components.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import type { DirectorSystem } from './director.js';
import { makeGlow, makeSign, Windows } from './fx.js';
import { HEADLINES, PERSONAS, type PersonaId, WORDS } from './lines.js';
import type { Person } from './people.js';
import { WEATHER } from './stage.js';

/**
 * The first five scenes (S01-S05): the cold open on
 * Gray's shoulder ("fresh bread"), thirty-three years in a few seconds, the
 * three arms of 2041, the old man's stopped watch, and the second chance
 * with the six memory keepers round the square.
 */

/** Grey, then the words' feather colours (net, brick). */
export const FEATHER = { freshBread: 0x9a9a9a, safetyNet: 0xe8c45a, firewall: 0xb4532a, bailOut: 0x4a86c0, primeThePump: 0x5aa04a } as const;

/** Places in the neighbourhood (art/v2/mahalle/README.md; metres, y up, north is -z). */
export const CITY = {
  /** At the front of the portico, clear of its columns (they are behind the bird): the whole square lies open before him. setUpCity() stands him on whatever floor is there. */
  grayAt: new Vector3(0.32, 1.19, -21.9),
  /** The parrot on Gray's right shoulder (Gray faces the square, +z; his right is -x): a little behind it, so his cheek and ear are in the left of the view. */
  shoulder: new Vector3(-0.16, 2.72, -21.98),
  ear: new Vector3(0.22, 2.79, -21.9),
  /** Where Gray's own lines are shown: in front of the bird and a little toward him. */
  graySays: new Vector3(0.22, 2.72, -21.15),
  benchPerch: new Vector3(0.82, 1.1, -3.3),
  stairsFoot: new Vector3(-0.6, 0.15, -18.8),
} as const;

/** The six memory keepers, where they stand in 2008, and whether their memory is in this build. */
export const KEEPERS = [
  { key: 'catcher', model: 'walt', memory: 'circus', at: [-1.3, 1.19, -22.6], colour: 0xf4c27a, open: true },
  // The others in front of the bank, within the gap Gray looks through (about 20 degrees either side), 7 to 15 m off, on its left (only the nearest one inside the 9 m where people are drawn in full):
  // the right is the glass sections' pavement, the sharks' circle and the lamp's line of sight. The farmer is nearest the bench (the afternoon).
  { key: 'ranger', model: 'june', memory: 'forest', at: [1.8, 0.15, -17.0], colour: 0xff8a3c, open: true },
  { key: 'sailor', model: 'ben', memory: 'ship', at: [2.8, 0.15, -14.4], colour: 0x6aa8e8, open: true },
  { key: 'guide', model: 'helen', memory: 'mountain', at: [3.8, 0.15, -12.2], colour: 0xe8f0ff, open: false },
  { key: 'farmer', model: 'edna', memory: 'farm', at: [2.6, 0.15, -9.0], colour: 0xc8a050, open: true },
  { key: 'keeper', model: 'george', memory: 'valley', at: [4.8, 0.15, -9.8], colour: 0xa0c8a0, open: false },
] as const;

/** Which word each memory teaches. */
const MEMORY_WORD: Readonly<Record<string, string>> = { circus: 'Safety net', forest: 'Firewall', ship: 'Bail out', mountain: 'Stress test', farm: 'Prime the pump', valley: 'Ring-fence' };

/** How many of the queue (from the door) are realistic people, and the four townsfolk they are drawn from. */
const FRONT_OF_QUEUE = 10;
const TOWNSFOLK = ['crowd_man_suit', 'crowd_woman_b', 'crowd_man_casual', 'crowd_woman_a'] as const;

/** A memory orb's radius (m): a small world held in a palm, large enough to be seen across the steps. */
export const ORB_R = 0.08;

/** The posts under the 2041 signs (S03). */
const POST = new MeshStandardMaterial({ color: 0x3a3631, roughness: 0.8 });

export interface CityCast {
  gray: Person;
  ear: Group;
  crowd: Person[];
  reporter: Person;
  windows: Windows;
  shops: Windows;
  fountain: Object3D;
  sold: Mesh[];
  screen: Object3D;
}

const yawOf = (from: Vector3, to: Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

/** The small things made for the scenes (art/v2/nesne, art/v2/saksagan), loaded with the square. */
const PROPS = { microphones: 'v2/nesne/microphones.glb', broadcast_screen: 'v2/nesne/broadcast_screen.glb', pocket_watch: 'v2/nesne/pocket_watch.glb', card_bank: 'v2/nesne/card_bank.glb', magpie: 'v2/saksagan/magpie.glb', parrot: 'v2/papagan/parrot.glb', golden_parachute: 'v2/nesne/golden_parachute.glb', shark_fin: 'v2/nesne/shark_fin.glb', giant_bucket: 'v2/nesne/giant_bucket.glb', fat_cat: 'v2/nesne/fat_cat.glb', fountain: 'v2/nesne/fountain.glb', hatch_cover: 'v2/nesne/hatch_cover.glb' } as const;

export function loadProps(): Promise<unknown> {
  return Promise.all(Object.entries(PROPS).map(([name, url]) => AssetManager.loadGLTF(url, `v2_prop_${name}`)));
}

/** A fresh copy of a prop's scene, not to be touched by the pointer. */
export function prop(name: keyof typeof PROPS): Object3D {
  const gltf = AssetManager.getGLTF(`v2_prop_${name}`);
  const root = gltf?.scene ?? new Group();
  root.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return root;
}

/**
 * Merge a prop's untextured parts into one mesh with their colours per
 * vertex (one draw instead of one per colour); textured parts stay as they
 * are. For the microphones: nine flat colours and the grille.
 */
export function mergeFlatParts(root: Object3D): void {
  root.updateMatrixWorld(true);
  const flat: Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    const material = mesh.material as MeshStandardMaterial | undefined;
    if (mesh.isMesh === true && material != null && !Array.isArray(material) && material.map == null && (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh !== true) flat.push(mesh);
  });
  if (flat.length < 2) return;
  const inverse = root.matrixWorld.clone().invert();
  const parts = flat.map((mesh) => {
    const g = mesh.geometry.index != null ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(mesh.matrixWorld.clone().premultiply(inverse));
    const c = (mesh.material as MeshStandardMaterial).color;
    const colours = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colours.length; i += 3) colours.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new BufferAttribute(colours, 3));
    return g;
  });
  const merged = mergeGeometries(parts);
  if (merged == null) return;
  const first = flat[0].material as MeshStandardMaterial;
  const mesh = new Mesh(merged, new MeshStandardMaterial({ vertexColors: true, roughness: first.roughness, metalness: first.metalness }));
  mesh.name = `${root.name} merged`;
  mesh.pointerEvents = 'none';
  for (const m of flat) m.removeFromParent();
  root.add(mesh);
}

/** A prop with its clips (the magpie). */
export function propWithClips(name: keyof typeof PROPS): { root: Object3D; clips: AnimationClip[] } {
  const gltf = AssetManager.getGLTF(`v2_prop_${name}`);
  const root = gltf?.scene ?? new Group();
  root.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { root, clips: gltf?.animations ?? [] };
}

/** The queue's umbrellas: up while the queue stands in the rain of 2008, away in 2041. */
let umbrellas: Group | null = null;

/** The 2008 square with its queue, Gray at the bank's door, the reporter, the broadcast screen and the windows. */
export async function setUpCity(d: DirectorSystem): Promise<CityCast> {
  const world = d.world;
  await Promise.all([d.stage.show('city', WEATHER.rain2008), loadProps()]);
  const root = d.stage.root('city');
  // Stand him on the floor that is really there (the top step, or the portico).
  if (root != null) {
    const drop = new Raycaster(new Vector3(CITY.grayAt.x, CITY.grayAt.y + 1.2, CITY.grayAt.z), new Vector3(0, -1, 0), 0, 4);
    const floor = drop.intersectObject(root, true)[0];
    const by = floor != null ? floor.point.y - CITY.grayAt.y : 0;
    if (import.meta.env.DEV) console.info(`[city] the floor under Gray is ${by.toFixed(2)} m from the portico's`);
    if (Math.abs(by) > 0.01 && Math.abs(by) < 1.2) for (const v of [CITY.grayAt, CITY.shoulder, CITY.ear, CITY.graySays]) v.y += by;
  }
  // The light he speaks in: warm, from the front and above, in a dim wet afternoon.
  const key = new SpotLight(0xffe0b4, 38, 14, 0.55, 0.7, 1.4);
  key.position.set(CITY.grayAt.x + 0.9, CITY.grayAt.y + 3.4, CITY.grayAt.z + 2.6);
  key.target.position.set(CITY.grayAt.x, CITY.grayAt.y + 1.3, CITY.grayAt.z + 0.2);
  world.createTransformEntity(key, { persistent: true });
  world.createTransformEntity(key.target, { persistent: true });
  d.stage.own('city', key, key.target);
  const gray = d.people.add({ model: 'gray' });
  gray.at(CITY.grayAt.x, CITY.grayAt.y, CITY.grayAt.z, 0);
  // His ear, from his head: a little below the top and toward the bird's side (his right, -x).
  const ear = d.marker(gray.head(new Vector3()).add(new Vector3(-0.08, -0.13, 0.02)), 'GrayEar');
  // The press microphones on their stand in front of him, heads toward his mouth (art/v2/nesne: heads along -z, the stand's feet 1.2 m below the clamp).
  // The lectern he speaks from, the microphones clamped along its front edge; its top is just under the bird's wing, so the feathers lie over it.
  const wood = new MeshStandardMaterial({ color: 0x3b2416, roughness: 0.55 });
  const lectern = new Group();
  lectern.name = 'Lectern';
  const column = new Mesh(new BoxGeometry(0.62, 1.1, 0.4), wood);
  column.position.set(0, 0.55, 0);
  const desk = new Mesh(new BoxGeometry(0.78, 0.05, 0.56), wood);
  desk.position.set(0, 1.15, 0.02);
  desk.rotation.x = 0.12;
  const crest = new Mesh(new BoxGeometry(0.3, 0.3, 0.012), new MeshStandardMaterial({ color: 0xc9a23f, roughness: 0.35, metalness: 0.8 }));
  crest.position.set(0, 0.72, 0.207);
  const foot = new Mesh(new BoxGeometry(0.74, 0.06, 0.5), wood);
  foot.position.set(0, 0.03, 0);
  lectern.add(column, desk, crest, foot);
  lectern.position.set(CITY.grayAt.x, CITY.grayAt.y, CITY.grayAt.z + 0.5);
  lectern.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(lectern, { persistent: true });
  d.stage.own('city', lectern);
  const mics = prop('microphones');
  mergeFlatParts(mics);
  mics.position.set(CITY.grayAt.x + 0.04, CITY.grayAt.y + 1.2, CITY.grayAt.z + 0.5);
  world.createTransformEntity(mics, { persistent: true });
  // The queue on its points, each facing the next toward the door.
  const crowd: Person[] = [];
  const coats = [0x3a3a3c, 0x2c3a55, 0xa8865a, 0x5c6040, 0x6a2e33, 0x6f6f6c, 0x5a4433, 0xcfc4ab, 0x5b6f86, 0x46403a];
  const point = new Vector3();
  const next = new Vector3();
  // From the fifth point on: the first four stand on the portico, right beside the bird, and would fill its view.
  for (let i = 4; i < 34; i += 1) {
    const name = `bank_queue_${String(i).padStart(2, '0')}`;
    if (d.stage.node('city', name) == null) continue;
    d.stage.point('city', name, point);
    d.stage.point('city', `bank_queue_${String(Math.max(0, i - 1)).padStart(2, '0')}`, next);
    // The front of the queue (the portico, the steps, the bank front) realistic; the far end up the side street stylized, for the headset's budget.
    const person =
      i < FRONT_OF_QUEUE
        ? d.people.add({ model: TOWNSFOLK[i % TOWNSFOLK.length], size: 0.96 + ((i * 37) % 9) / 100 })
        : d.people.add({ model: i % 2 === 0 ? 'suit' : 'dress', cloth: coats[(i * 7) % coats.length], hair: [0x1f1712, 0x3b2a1e, 0x5a2e1a, 0xa8865a, 0x8a8580][i % 5], skin: [0xe0b394, 0xc99a7a, 0xa8755a, 0x8a5a42][i % 4] });
    // Nobody in a queue stands square to the one ahead: each is turned a little their own way, and every third one watches the Prime Minister.
    person.at(point.x, point.y, point.z, i === 0 ? Math.PI : yawOf(point, next) + (((i * 53) % 7) - 3) * 0.1);
    if (i % 3 === 0) person.gaze = new Vector3(CITY.grayAt.x, CITY.grayAt.y + 1.6, CITY.grayAt.z);
    crowd.push(person);
  }
  // It is raining: everyone in the queue under an umbrella (two draws for all of them).
  const canopies = new InstancedMesh(new ConeGeometry(0.52, 0.2, 12, 1, true), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: DoubleSide }), crowd.length);
  const sticks = new InstancedMesh(new CylinderGeometry(0.008, 0.008, 0.75, 5), new MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }), crowd.length);
  const cloths = [0x1f2a3a, 0x3a1c22, 0x23302a, 0x2c2c2e, 0x4a3a22, 0x5a1f24].map((c) => new Color(c));
  const put = new Matrix4();
  crowd.forEach((person, k) => {
    put.makeTranslation(person.position.x + 0.12, person.position.y + 2.05, person.position.z + 0.08);
    canopies.setMatrixAt(k, put);
    canopies.setColorAt(k, cloths[k % cloths.length]);
    put.makeTranslation(person.position.x + 0.12, person.position.y + 1.68, person.position.z + 0.08);
    sticks.setMatrixAt(k, put);
  });
  umbrellas = new Group();
  umbrellas.name = 'QueueUmbrellas';
  umbrellas.add(canopies, sticks);
  umbrellas.traverse((o) => {
    o.pointerEvents = 'none';
  });
  world.createTransformEntity(umbrellas, { persistent: true });
  d.stage.own('city', umbrellas);
  const reporter = d.people.add({ model: 'crowd_woman_b' });
  reporter.at(1.6, 0.15, -18.2).face(CITY.grayAt.x, CITY.grayAt.z);
  // The neighbours' windows and the shopfronts round the square.
  const centre = new Vector3(0, 0, -6);
  const windows = new Windows(world, root ?? world.scene, centre, 12, 6.5);
  const shops = new Windows(world, root ?? world.scene, centre, 10, 2.2);
  shops.lit = 0;
  const sold: Mesh[] = [];
  // The broadcast screen on the square: the prime minister with a parrot on his shoulder (the player's mirror).
  const screen = prop('broadcast_screen');
  screen.position.set(5.5, 0.15, -12.5);
  screen.rotation.y = Math.atan2(CITY.shoulder.x - 5.5, CITY.shoulder.z + 12.5);
  world.createTransformEntity(screen, { persistent: true });
  // The square's fountain, the old sailor beside it (S05, S12).
  const fountain = prop('fountain');
  fountain.position.set(-6.6, 0.15, -9.6);
  world.createTransformEntity(fountain, { persistent: true });
  d.stage.own('city', mics, screen, fountain, windows.mesh, shops.mesh, d.notebook.mesh, d.bear.group);
  return { gray, ear, crowd, reporter, windows, shops, sold, screen, fountain };
}

/** S01: on Gray's shoulder in the rain; the grey feather to his ear; "fresh bread" falls on the umbrellas. */
export async function s01(d: DirectorSystem, cast: CityCast): Promise<void> {
  d.chapter('S01');
  // The first seconds are seen from outside: a parrot on the Prime Minister's right shoulder, looking out at the square. Then the view is the parrot's own.
  const outside = propWithClips('parrot');
  const bird = new Group();
  bird.name = 'ParrotOnShoulder';
  outside.root.scale.setScalar(0.72);
  bird.add(outside.root);
  bird.position.set(CITY.grayAt.x - 0.25, CITY.grayAt.y + 1.46, CITY.grayAt.z + 0.1);
  d.world.createTransformEntity(bird, { persistent: true });
  d.stage.own('city', bird);
  const mixer = new AnimationMixer(outside.root);
  const idle = AnimationClip.findByName(outside.clips, 'idle');
  if (idle != null) mixer.clipAction(idle).play();
  const breathe = d.each((delta) => mixer.update(delta));
  hideHands(true);
  setGoal({ where: 'YOU ARE THE PARROT', now: "Keep the city's windows lit until night." });
  d.rig.place(new Vector3(CITY.grayAt.x - 0.32, CITY.grayAt.y + 1.6, CITY.grayAt.z + 1.12), 0);
  d.rain.on = true;
  d.sounds.bed('crowd_murmur_loop', 0.4);
  await d.wait(4);
  // Turned a little toward him: his cheek and ear in the left of the view, the lectern and the square ahead.
  await d.rig.move(CITY.shoulder, Math.PI + 0.36);
  // He turns to the bird on his shoulder for a moment (his face, not only his ear), and his name hangs by him once.
  cast.gray.gaze = CITY.shoulder.clone().add(new Vector3(-0.25, 0, 0.35));
  void d.gold.show('GRAY \u00b7 PRIME MINISTER', new Vector3(CITY.grayAt.x - 0.02, CITY.grayAt.y + 1.42, CITY.grayAt.z + 0.42), 0.5, 4.2, new Vector3(0, 0.02, 0), d.player.head);
  void d.wait(2.8).then(() => {
    cast.gray.gaze = null;
  });
  breathe();
  bird.visible = false;
  hideHands(false);
  setGoal({ where: 'THE MORNING', now: 'Give Gray a word: carry a feather to his ear.' });
  d.rain.on = true;
  d.bear.steps = 0;
  // The press: camera flashes going off here and there in the crowd.
  const flashes = [0, 1, 2, 3, 4, 5].map((k) => {
    const flash = new Mesh(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }));
    flash.position.set(-3.2 + k * 1.3 + (k % 2) * 0.4, 1.75 + (k % 3) * 0.12, CITY.grayAt.z + 3.6 + (k % 3) * 0.9);
    flash.pointerEvents = 'none';
    d.world.createTransformEntity(flash, { persistent: true });
    d.stage.own('city', flash);
    return flash;
  });
  let flashIn = 0.6;
  const stopFlashes = d.each((delta) => {
    flashIn -= delta;
    if (flashIn <= 0) {
      flashIn = 0.25 + Math.random() * 0.9;
      const flash = flashes[Math.floor(Math.random() * flashes.length)];
      (flash.material as MeshBasicMaterial).opacity = 1;
      flash.scale.setScalar(1 + Math.random() * 1.5);
    }
    for (const flash of flashes) {
      const m = flash.material as MeshBasicMaterial;
      m.opacity = Math.max(0, m.opacity - delta * 9);
      flash.visible = m.opacity > 0.01;
    }
  });
  parrotWords.reset();
  parrotWords.learn(WORDS.freshBread, FEATHER.freshBread);
  setListener(cast.ear, 0.14);
  d.sounds.bed('crowd_murmur_loop', 0.4);
  await d.wait(1.2);
  d.sounds.play('mic_tap', 0.6);
  await d.wait(0.3);
  void d.captions.say('S01-1', CITY.graySays, 0);
  setV2Targets([cast.ear]);
  let word = '';
  while (word !== WORDS.freshBread) word = await d.nextWord(WORDS.freshBread);
  setV2Targets([]);
  d.captions.hide();
  void d.gold.show(WORDS.freshBread.toUpperCase(), cast.ear.position.clone().add(new Vector3(0, 0.1, 0.4)), 1.2, 3.2, new Vector3(0, 0.5, 1.2), d.player.head);
  await d.captions.say('S01-2', CITY.graySays, 0);
  // Loaves of bread on the umbrellas of the queue; the crowd boos.
  d.loaves.rain(40, new Vector3(-3, 0.15, -19), { x: 6, z: 7 }, 9, 1.7);
  for (let k = 0; k < 6; k += 1) d.sounds.play('loaf_drop', 0.6, 0.9 + 0.04 * k, 1.2 + k * 0.17);
  d.sounds.play('crowd_boo', 0.8, 1, 1.4);
  for (const p of cast.crowd) p.pose = 'wave';
  await d.captions.say('S01-3', cast.reporter.head(new Vector3()), 0.3);
  await d.wait(1);
  stopFlashes();
  for (const flash of flashes) flash.visible = false;
}

/** S02: thirty-three years go by; windows go dark, shops close, the crowd melts, the rain stops; then 2041 on a bench's back. */
export async function s02(d: DirectorSystem, cast: CityCast): Promise<void> {
  if (umbrellas != null) umbrellas.visible = false;
  d.chapter('S02');
  setGoal({ where: 'THE MORNING', now: 'Give Gray a word: carry a feather to his ear.' });
  const seconds = 7;
  const start = d.now;
  d.sounds.bed('crowd_murmur_loop', 0);
  const signs: Mesh[] = [];
  let shown = 0;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / seconds);
    d.stage.blendWeather(WEATHER.rain2008, WEATHER.evening2041, k);
    cast.windows.lit = Math.round(cast.windows.total * (1 - k));
    cast.crowd.forEach((p, i) => {
      if (k > (i + 1) / (cast.crowd.length + 4)) p.pose = 'hidden';
    });
    if (k > 0.7) d.rain.on = false;
    const want = Math.floor(k * 8);
    while (shown < want) {
      // Only SOLD on the shutters: no company name.
      const sign = makeSign(d.world, 'SOLD', { w: 1.4, h: 0.5 }, { paper: '#f2efe6', ink: '#8a1c1c' });
      const a = (shown / 8) * Math.PI * 2 + 0.5;
      sign.position.set(Math.sin(a) * 13, 2.4, -6 + Math.cos(a) * 13);
      sign.lookAt(0, 2.4, -6);
      signs.push(sign);
      d.stage.own('city', sign);
      shown += 1;
    }
    return k >= 1;
  });
  cast.gray.pose = 'hidden';
  cast.reporter.pose = 'hidden';
  cast.screen.visible = false;
  d.loaves.clear();
  d.newspaper.write([{ text: HEADLINES.timeLapse }]);
  d.sounds.play('paper', 0.7);
  d.newspaper.mesh.position.copy(CITY.shoulder).add(new Vector3(0.25, -0.25, 0.35));
  d.newspaper.mesh.lookAt(CITY.shoulder);
  await d.wait(2.5);
  d.newspaper.mesh.visible = false;
  await d.rig.move(CITY.benchPerch, 0);
  cast.sold.push(...signs);
}

export interface Arms {
  people: Record<PersonaId, Person>;
}

/** S03: three grown-ups of 2041 hold out an arm in front of what they lost; look at one and they speak; land on one. */
export async function s03(d: DirectorSystem, cast: CityCast): Promise<{ id: PersonaId; person: Person }> {
  d.chapter('S03');
  setGoal({ where: 'THE MORNING', now: 'Choose whose window you will keep lit.' });
  // A wide arc ahead of the bench (the bird faces -z there): left, middle and right, all three in view without turning the head.
  const spots: Record<PersonaId, { at: [number, number, number] }> = {
    maya: { at: [-2.2, 0.15, -8.0] },
    leo: { at: [3.9, 0.15, -8.0] },
    sam: { at: [0.8, 0.15, -9.2] },
  };
  const ids = ['maya', 'leo', 'sam'] as const;
  const people = {} as Record<PersonaId, Person>;
  const perches: Group[] = [];
  const hand = new Vector3();
  for (const id of ids) {
    const p = d.people.add({ model: id });
    p.at(...spots[id].at).face(CITY.benchPerch.x, CITY.benchPerch.z);
    p.pose = 'arm';
    people[id] = p;
    const sign = makeSign(d.world, PERSONAS[id].place, { w: 2.2, h: 0.5 }, { paper: '#f4efe4', ink: '#2a2420' });
    // What they lost, on its own board on two posts a step behind them (not floating against whatever building is behind), upright and turned to the bench.
    const away = new Vector3(p.position.x - CITY.benchPerch.x, 0, p.position.z - CITY.benchPerch.z).normalize();
    sign.position.copy(p.position).addScaledVector(away, 0.9).setY(2.45);
    sign.rotation.set(0, Math.atan2(-away.x, -away.z), 0);
    const postHeight = 2.45 - 0.25 - p.position.y;
    const posts = [-0.95, 0.95].map((x) => new BoxGeometry(0.06, postHeight, 0.06).translate(x, -0.25 - postHeight / 2, -0.03));
    sign.add(new Mesh(mergeGeometries(posts), POST));
    // What they lost is gone again once the square winds back to 2008 (s04).
    cast.sold.push(sign);
    d.stage.own('city', sign);
    perches.push(d.marker(p.hand(hand), `Perch ${id}`));
    if (import.meta.env.DEV) {
      const local = d.player.worldToLocal(p.hand(new Vector3()));
      console.info(`[perch] ${id}'s hand at ${local.toArray().map((v) => v.toFixed(2))} (player space)`);
    }
  }
  // Looking at one, they say what they lost (once each), while the player chooses.
  const said = new Set<PersonaId>();
  let speaking = false;
  let chosen = -1;
  const choice = d.choosePerch(perches).then((i) => {
    chosen = i;
  });
  while (chosen < 0) {
    if (!speaking) {
      for (const id of ids) {
        if (said.has(id) || !d.looksAt(people[id].head(hand), 14)) continue;
        said.add(id);
        speaking = true;
        void d.captions.say(PERSONAS[id].line, people[id].head(new Vector3()), 0.3).then(() => {
          speaking = false;
        });
        break;
      }
    }
    await Promise.race([choice, d.wait(0.2)]);
  }
  const persona = ids[chosen];
  d.captions.persona = PERSONAS[persona].name;
  d.captions.hide();
  await d.rig.move(people[persona].hand(hand).clone().add(new Vector3(0, 0.12, 0)), people[persona].yaw + Math.PI);
  await d.captions.say('S03-4', people[persona].head(new Vector3()), 0.3);
  for (const id of ids) if (id !== persona) people[id].pose = 'hidden';
  people[persona].pose = 'idle';
  return { id: persona, person: people[persona] };
}

/** S04: the old man feeding sparrows knows the bird; he gives the stopped watch; one turn back of its hand rewinds the square. */
export async function s04(d: DirectorSystem, cast: CityCast, persona: Person): Promise<void> {
  d.chapter('S04');
  setGoal({ where: 'THE MORNING', now: 'Turn the watch hand to see the day ahead.' });
  // The old man is Gray, thirty-three years on.
  const old = d.people.add({ model: 'gray', size: 0.97 });
  const by = persona.position.clone().add(new Vector3(1.0, 0, 0.6));
  old.at(by.x, 0.15, by.z).face(persona.position.x, persona.position.z);
  await d.captions.say('S04-1', old.head(new Vector3()), 0.3);
  await d.captions.say('S04-2', old.head(new Vector3()), 0.3);
  await d.captions.say('S04-3', persona.head(new Vector3()), 0.3);
  // The watch, held up in front of the bird (09:00, stopped); its hour hand turns one full turn back.
  const eye = d.eyeAt.clone();
  const look = new Vector3(0, 0, -1).applyQuaternion(d.player.head.getWorldQuaternion(new Quaternion()));
  look.y = 0;
  look.normalize();
  const watch = prop('pocket_watch');
  watch.name = 'PocketWatch';
  watch.position.copy(eye).addScaledVector(look, 0.3).add(new Vector3(0, -0.08, 0));
  watch.lookAt(eye);
  const watchEntity = d.world.createTransformEntity(watch, { persistent: true });
  // The hour hand, at nine o'clock: H3, a swing about the dial's own z (toward the eye), one full turn counter-clockwise.
  const hand = watch.getObjectByName('hour_hand') ?? new Group();
  hand.name = 'WatchHand';
  const pathEntity = d.world.createTransformEntity(hand, { parent: watchEntity, persistent: true });
  d.sounds.bed('clock_tick_loop', 0.5);
  pathEntity.addComponent(PathHandle, { kind: PathKindEnum.Swing, a: hand.position.toArray(), axis: [0, 0, 1], from: 0, to: Math.PI * 2, grip: [0, 0.032, 0], reach: 0.09 });
  await d.until(() => (pathEntity.getValue(PathHandle, 'progress') ?? 0) >= 0.97);
  watch.visible = false;
  d.sounds.bed('clock_tick_loop', 0.5, 2.6);
  old.pose = 'hidden';
  persona.pose = 'hidden';
  // The square winds back, faster than it went forward.
  const start = d.now;
  const seconds = 2.8;
  for (const sign of cast.sold) sign.visible = false;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / seconds);
    d.stage.blendWeather(WEATHER.evening2041, WEATHER.rain2008, k);
    cast.windows.lit = Math.round(cast.windows.total * k);
    return k >= 1;
  });
  d.sounds.bed('clock_tick_loop', 0);
}

export interface Keepers {
  people: Person[];
  orbs: Mesh[];
  palms: Group[];
  /** The open memories' glow round their orb (null for the closed ones). */
  glows: (Mesh | null)[];
  /** Each orb's word picture (hidden with the orb once its memory is played). */
  pictures: (Mesh | null)[];
  /** The chosen person at the foot of the steps with the notebook. */
  watcher: Person;
}

/** S05: back on Gray's shoulder, the same moment; the person watches with the clippings notebook; six keepers hold out their memories. */
export async function s05(d: DirectorSystem, cast: CityCast, persona: PersonaId): Promise<Keepers> {
  if (umbrellas != null) umbrellas.visible = true;
  d.chapter('S05');
  setGoal({ where: 'TROUBLE 1 OF 6 · THE RUN', now: 'Find the word: fly to a keeper\'s hand.' });
  for (const p of cast.crowd) p.pose = 'idle';
  cast.gray.pose = 'idle';
  cast.reporter.pose = 'idle';
  cast.screen.visible = true;
  d.rain.on = true;
  d.stage.setWeather(WEATHER.rain2008);
  await d.rig.move(CITY.shoulder, Math.PI);
  // The chosen person at the foot of the steps, unseen by all, the notebook open on the first headline.
  const watcher = d.people.add({ model: persona });
  watcher.at(CITY.stairsFoot.x, CITY.stairsFoot.y, CITY.stairsFoot.z).face(CITY.grayAt.x, CITY.grayAt.z);
  d.notebook.write([{ text: HEADLINES.run }]);
  d.sounds.bed('crowd_murmur_loop', 0.4);
  d.sounds.play('paper', 0.6);
  d.notebook.mesh.position.set(CITY.stairsFoot.x, 1.45, CITY.stairsFoot.z + 0.35);
  d.notebook.mesh.lookAt(CITY.shoulder);
  const people: Person[] = [];
  const orbs: Mesh[] = [];
  const palms: Group[] = [];
  const glows: (Mesh | null)[] = KEEPERS.map(() => null);
  const pictures: (Mesh | null)[] = KEEPERS.map(() => null);
  const hand = new Vector3();
  for (const k of KEEPERS) {
    const p = d.people.add({ model: k.model });
    p.at(k.at[0], k.at[1], k.at[2]).face(CITY.grayAt.x, CITY.grayAt.z);
    p.pose = 'arm';
    people.push(p);
    p.hand(hand);
    const orb = new Mesh(new SphereGeometry(ORB_R, 20, 14), new MeshBasicMaterial({ color: k.open ? k.colour : 0x6a6a6a, toneMapped: false, transparent: true, opacity: k.open ? 1 : 0.6 }));
    orb.name = `Orb ${k.memory}`;
    orb.position.copy(hand).add(new Vector3(0, ORB_R + 0.02, 0));
    const entity = d.world.createTransformEntity(orb, { persistent: true });
    if (k.open) {
      entity.addComponent(OneHandGrabbable, { rotate: true, translate: true }).addComponent(MemoryOrb, { memory: k.memory });
      const glow = makeGlow(d.world, k.colour, ORB_R * 1.6);
      glow.position.copy(orb.position);
      (glow.material as MeshBasicMaterial).opacity = 0.25;
      d.stage.own('city', glow);
      glows[KEEPERS.indexOf(k)] = glow;
    }
    orbs.push(orb);
    d.stage.own('city', orb);
    // The memory's word, as its picture on the orb (the same picture as on the feather it gives).
    const badge = wordBadge(MEMORY_WORD[k.memory]);
    if (badge != null) {
      const picture = new Texture(badge);
      picture.colorSpace = SRGBColorSpace;
      picture.needsUpdate = true;
      const mark = new Mesh(new PlaneGeometry(ORB_R * 1.3, ORB_R * 1.3), new MeshBasicMaterial({ map: picture, transparent: true, depthWrite: false, opacity: k.open ? 1 : 0.45 }));
      mark.name = `Orb picture ${k.memory}`;
      mark.position.copy(orb.position).addScaledVector(new Vector3().subVectors(CITY.shoulder, orb.position).normalize(), ORB_R + 0.005);
      mark.lookAt(CITY.shoulder);
      mark.pointerEvents = 'none';
      d.world.createTransformEntity(mark, { persistent: true });
      d.stage.own('city', mark);
      pictures[KEEPERS.indexOf(k)] = mark;
    }
    palms.push(d.marker(hand.clone().add(new Vector3(0, 0.02, 0)), `Palm ${k.key}`));
  }
  await d.captions.say('S05-1', CITY.shoulder.clone().add(new Vector3(0.3, -0.1, 0.6)), 0);
  // "Bird. Please." is said to the bird: he looks at it.
  cast.gray.gaze = CITY.shoulder.clone().add(new Vector3(-0.25, 0, 0.35));
  await d.captions.say('S05-2', CITY.graySays, 0);
  cast.gray.gaze = null;
  await d.captions.say('S05-2b', CITY.graySays, 0);
  await d.captions.say('S05-3', people[0].head(new Vector3()), 0.3);
  return { people, orbs, palms, glows, pictures, watcher };
}
