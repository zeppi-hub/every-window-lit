import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OneHandGrabbable, PlaneGeometry, Quaternion, SphereGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { MemoryOrb, PathHandle, PathKindEnum } from '../components.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import type { DirectorSystem } from './director.js';
import { makeGlow, makeSign, Windows } from './fx.js';
import { HEADLINES, PERSONAS, type PersonaId, WORDS } from './lines.js';
import type { Person } from './people.js';
import { WEATHER } from './stage.js';

/**
 * The first five scenes (META_VR_V2_TASARIM.md, S01-S05): the cold open on
 * Gray's shoulder ("fresh bread"), thirty-three years in a few seconds, the
 * three arms of 2041, the old man's stopped watch, and the second chance
 * with the six memory keepers round the square.
 */

/** Grey, then the words' feather colours (Bölüm 8: net, brick). */
export const FEATHER = { freshBread: 0x9a9a9a, safetyNet: 0xe8c45a, firewall: 0xb4532a } as const;

/** Places in the neighbourhood (art/v2/mahalle/README.md; metres, y up, north is -z). */
export const CITY = {
  grayAt: new Vector3(1.2, 1.19, -23.6),
  /** The parrot on Gray's right shoulder (Gray faces the square, +z; his right is -x). */
  shoulder: new Vector3(0.88, 2.67, -23.58),
  ear: new Vector3(1.1, 2.79, -23.6),
  /** Where Gray's own lines are shown: in front of the bird and a little toward him. */
  graySays: new Vector3(1.1, 2.72, -22.85),
  benchPerch: new Vector3(0.82, 1.1, -3.3),
  stairsFoot: new Vector3(-0.6, 0.15, -18.8),
} as const;

/** The six memory keepers (Bölüm 3), where they stand in 2008, and whether their memory is in this build. */
export const KEEPERS = [
  { key: 'catcher', memory: 'circus', at: [-1.3, 1.19, -22.6], colour: 0xf4c27a, open: true, look: { model: 'suit', cloth: 0x7a2e2e, hair: 0xd8d4cc } },
  { key: 'ranger', memory: 'forest', at: [5.0, 0.15, -6.2], colour: 0xff8a3c, open: true, look: { model: 'dress', cloth: 0x4a5a3a, hair: 0xb0aaa0 } },
  { key: 'sailor', memory: 'ship', at: [-4.2, 0.15, -8.2], colour: 0x6aa8e8, open: false, look: { model: 'suit', cloth: 0x2a3a5a, hair: 0xc8c4bc } },
  { key: 'guide', memory: 'mountain', at: [3.8, 0.15, -13.2], colour: 0xe8f0ff, open: false, look: { model: 'dress', cloth: 0x8a3a2a, hair: 0x9a948c } },
  { key: 'farmer', memory: 'farm', at: [-5.2, 0.15, -14.0], colour: 0xc8a050, open: false, look: { model: 'dress', cloth: 0x6a5a3a, hair: 0xd0ccc4 } },
  { key: 'keeper', memory: 'valley', at: [7.0, 0.15, -10.0], colour: 0xa0c8a0, open: false, look: { model: 'suit', cloth: 0x3a3a3a, hair: 0xe0dcd4 } },
] as const;

export interface CityCast {
  gray: Person;
  ear: Group;
  crowd: Person[];
  reporter: Person;
  windows: Windows;
  shops: Windows;
  sold: Mesh[];
  screen: Mesh;
}

const yawOf = (from: Vector3, to: Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

/** The 2008 square with its queue, Gray at the bank's door, the reporter, the broadcast screen and the windows. */
export async function setUpCity(d: DirectorSystem): Promise<CityCast> {
  const world = d.world;
  await d.stage.show('city', WEATHER.rain2008);
  const root = d.stage.root('city');
  const gray = d.people.add({ model: 'suit', cloth: 0x252a33, hair: 0x5a5450, skin: 0xe0b394 });
  gray.at(CITY.grayAt.x, CITY.grayAt.y, CITY.grayAt.z, 0);
  const ear = d.marker(CITY.ear, 'GrayEar');
  // The microphones in front of him.
  const mics = new Group();
  mics.name = 'Microphones';
  const metal = new MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i < 5; i += 1) {
    const stick = new Mesh(new CylinderGeometry(0.008, 0.008, 0.35, 6), metal);
    stick.position.set(-0.12 + i * 0.06, -0.15, (i % 2) * 0.03);
    stick.rotation.x = -0.4;
    const head = new Mesh(new SphereGeometry(0.03, 10, 8), metal);
    head.position.set(stick.position.x, 0.02, stick.position.z - 0.07);
    mics.add(stick, head);
  }
  mics.position.set(CITY.grayAt.x + 0.05, CITY.grayAt.y + 1.12, CITY.grayAt.z + 0.62);
  mics.scale.setScalar(0.7);
  world.createTransformEntity(mics, { persistent: true });
  // The queue on its points, each facing the next toward the door.
  const crowd: Person[] = [];
  const coats = [0x3a3a3c, 0x2c3a55, 0xa8865a, 0x5c6040, 0x6a2e33, 0x6f6f6c, 0x5a4433, 0xcfc4ab, 0x5b6f86, 0x46403a];
  const point = new Vector3();
  const next = new Vector3();
  // From the third point on: the first two stand on the portico at the bird's elbow.
  for (let i = 2; i < 34; i += 1) {
    const name = `bank_queue_${String(i).padStart(2, '0')}`;
    if (d.stage.node('city', name) == null) continue;
    d.stage.point('city', name, point);
    d.stage.point('city', `bank_queue_${String(Math.max(0, i - 1)).padStart(2, '0')}`, next);
    const person = d.people.add({ model: i % 2 === 0 ? 'suit' : 'dress', cloth: coats[(i * 7) % coats.length], hair: [0x1f1712, 0x3b2a1e, 0x5a2e1a, 0xa8865a, 0x8a8580][i % 5], skin: [0xe0b394, 0xc99a7a, 0xa8755a, 0x8a5a42][i % 4] });
    person.at(point.x, point.y, point.z, i === 0 ? Math.PI : yawOf(point, next));
    crowd.push(person);
  }
  const reporter = d.people.add({ model: 'dress', cloth: 0x8a6a3a, hair: 0x3b2a1e });
  reporter.at(1.6, 0.15, -18.2).face(CITY.grayAt.x, CITY.grayAt.z);
  // The neighbours' windows and the shopfronts round the square.
  const centre = new Vector3(0, 0, -6);
  const windows = new Windows(world, root ?? world.scene, centre, 12, 6.5);
  const shops = new Windows(world, root ?? world.scene, centre, 10, 2.2);
  shops.lit = 0;
  const sold: Mesh[] = [];
  // The broadcast screen on the square: the prime minister with a parrot on his shoulder (the player's mirror).
  const screen = broadcastScreen(d);
  screen.position.set(5.5, 3.6, -12.5);
  screen.lookAt(CITY.shoulder);
  d.stage.own('city', mics, screen, windows.mesh, shops.mesh, d.notebook.mesh, d.bear.group);
  return { gray, ear, crowd, reporter, windows, shops, sold, screen };
}

/** The live picture: a dark-suited figure at microphones, a green parrot on his shoulder, LIVE in the corner. */
function broadcastScreen(d: DirectorSystem): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#1c232c';
    g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#5a6470';
    g.fillRect(0, 200, 512, 88);
    g.fillStyle = '#252a33';
    g.beginPath();
    g.ellipse(256, 290, 120, 110, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#e0b394';
    g.beginPath();
    g.arc(256, 120, 52, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3f8f4a';
    g.beginPath();
    g.ellipse(340, 176, 24, 34, -0.3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(352, 140, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8c45a';
    g.beginPath();
    g.moveTo(366, 138);
    g.lineTo(380, 144);
    g.lineTo(366, 148);
    g.fill();
    g.fillStyle = '#c0202a';
    g.fillRect(20, 20, 96, 40);
    g.fillStyle = '#ffffff';
    g.font = '800 30px system-ui, sans-serif';
    g.fillText('LIVE', 34, 51);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(3.2, 1.8), new MeshBasicMaterial({ map: texture, toneMapped: false }));
  mesh.name = 'BroadcastScreen';
  mesh.pointerEvents = 'none';
  d.world.createTransformEntity(mesh, { persistent: true });
  return mesh;
}

/** S01: on Gray's shoulder in the rain; the grey feather to his ear; "fresh bread" falls on the umbrellas. */
export async function s01(d: DirectorSystem, cast: CityCast): Promise<void> {
  d.rig.place(CITY.shoulder, Math.PI);
  d.rain.on = true;
  d.bear.steps = 0;
  parrotWords.reset();
  parrotWords.learn(WORDS.freshBread, FEATHER.freshBread);
  setListener(cast.ear, 0.14);
  await d.wait(1.5);
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
  for (const p of cast.crowd) p.pose = 'wave';
  await d.captions.say('S01-3', cast.reporter.head(new Vector3()), 0.3);
  await d.wait(1);
}

/** S02: thirty-three years go by; windows go dark, shops close, the crowd melts, the rain stops; then 2041 on a bench's back. */
export async function s02(d: DirectorSystem, cast: CityCast): Promise<void> {
  const seconds = 7;
  const start = d.now;
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
      const sign = makeSign(d.world, shown % 3 === 0 ? 'SOLD' : 'ROOST HOLDINGS', { w: 1.4, h: 0.5 }, { paper: '#f2efe6', ink: '#8a1c1c' });
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
  const spots: Record<PersonaId, { at: [number, number, number] }> = {
    maya: { at: [-4.6, 0.15, -2.2] },
    leo: { at: [5.4, 0.15, -2.4] },
    sam: { at: [0.6, 0.15, -9.4] },
  };
  const looks: Record<PersonaId, { model: 'suit' | 'dress'; cloth: number; hair: number; skin: number }> = {
    maya: { model: 'dress', cloth: 0xb0603a, hair: 0x3b2a1e, skin: 0xc99a7a },
    leo: { model: 'suit', cloth: 0x3a4a5a, hair: 0x1f1712, skin: 0xe0b394 },
    sam: { model: 'suit', cloth: 0x5a4a32, hair: 0x2a1e16, skin: 0x8a5a42 },
  };
  const ids = ['maya', 'leo', 'sam'] as const;
  const people = {} as Record<PersonaId, Person>;
  const perches: Group[] = [];
  const hand = new Vector3();
  for (const id of ids) {
    const p = d.people.add(looks[id]);
    p.at(...spots[id].at).face(CITY.benchPerch.x, CITY.benchPerch.z);
    p.pose = 'arm';
    people[id] = p;
    const sign = makeSign(d.world, PERSONAS[id].place, { w: 2.2, h: 0.5 }, { paper: '#f4efe4', ink: '#2a2420' });
    // Behind the person, up on the wall of what they lost.
    const away = new Vector3(p.position.x - CITY.benchPerch.x, 0, p.position.z - CITY.benchPerch.z).normalize();
    sign.position.copy(p.position).addScaledVector(away, 2.6).setY(2.6);
    sign.lookAt(CITY.benchPerch);
    // What they lost is gone again once the square winds back to 2008 (s04).
    cast.sold.push(sign);
    d.stage.own('city', sign);
    perches.push(d.marker(p.hand(hand), `Perch ${id}`));
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
  const old = d.people.add({ model: 'suit', cloth: 0x5a5a52, hair: 0xe8e4dc, skin: 0xd9a585 });
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
  const watch = new Group();
  watch.name = 'PocketWatch';
  const gold = new MeshStandardMaterial({ color: 0xc9a349, roughness: 0.35, metalness: 0.8 });
  const face = new Mesh(new CylinderGeometry(0.06, 0.06, 0.012, 32), new MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.5 }));
  face.rotation.x = Math.PI / 2;
  const rim = new Mesh(new CylinderGeometry(0.068, 0.068, 0.016, 32, 1, true), gold);
  rim.rotation.x = Math.PI / 2;
  const minute = new Mesh(new PlaneGeometry(0.005, 0.05), new MeshBasicMaterial({ color: 0x2a2420 }));
  minute.position.set(0, 0.025, 0.007);
  watch.add(face, rim, minute);
  watch.position.copy(eye).addScaledVector(look, 0.3).add(new Vector3(0, -0.08, 0));
  watch.lookAt(eye);
  const watchEntity = d.world.createTransformEntity(watch, { persistent: true });
  // The hour hand, at nine o'clock: H3, a swing about the watch's own z (toward the eye), one full turn counter-clockwise.
  const hand = new Group();
  hand.name = 'WatchHand';
  const blade = new Mesh(new PlaneGeometry(0.009, 0.04), new MeshBasicMaterial({ color: 0xc9a349, toneMapped: false }));
  blade.position.y = 0.02;
  hand.add(blade);
  hand.position.set(0, 0, 0.009);
  hand.rotation.z = Math.PI / 2;
  const pathEntity = d.world.createTransformEntity(hand, { parent: watchEntity, persistent: true });
  pathEntity.addComponent(PathHandle, { kind: PathKindEnum.Swing, a: [0, 0, 0.009], axis: [0, 0, 1], from: 0, to: Math.PI * 2, grip: [0, 0.038, 0], reach: 0.09 });
  await d.until(() => (pathEntity.getValue(PathHandle, 'progress') ?? 0) >= 0.97);
  watch.visible = false;
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
}

export interface Keepers {
  people: Person[];
  orbs: Mesh[];
  palms: Group[];
  /** The open memories' glow round their orb (null for the closed ones). */
  glows: (Mesh | null)[];
  /** The chosen person at the foot of the steps with the notebook. */
  watcher: Person;
}

/** S05: back on Gray's shoulder, the same moment; the person watches with the clippings notebook; six keepers hold out their memories. */
export async function s05(d: DirectorSystem, cast: CityCast, persona: PersonaId): Promise<Keepers> {
  for (const p of cast.crowd) p.pose = 'idle';
  cast.gray.pose = 'idle';
  cast.reporter.pose = 'idle';
  cast.screen.visible = true;
  d.rain.on = true;
  d.stage.setWeather(WEATHER.rain2008);
  await d.rig.move(CITY.shoulder, Math.PI);
  // The chosen person at the foot of the steps, unseen by all, the notebook open on the first headline.
  const look = PERSONAS[persona].model === 'dress' ? { model: 'dress' as const, cloth: 0xb0603a, hair: 0x3b2a1e } : { model: 'suit' as const, cloth: persona === 'leo' ? 0x3a4a5a : 0x5a4a32, hair: 0x1f1712 };
  const watcher = d.people.add(look);
  watcher.at(CITY.stairsFoot.x, CITY.stairsFoot.y, CITY.stairsFoot.z).face(CITY.grayAt.x, CITY.grayAt.z);
  d.notebook.write([{ text: HEADLINES.run }]);
  d.notebook.mesh.position.set(CITY.stairsFoot.x, 1.45, CITY.stairsFoot.z + 0.35);
  d.notebook.mesh.lookAt(CITY.shoulder);
  const people: Person[] = [];
  const orbs: Mesh[] = [];
  const palms: Group[] = [];
  const glows: (Mesh | null)[] = KEEPERS.map(() => null);
  const hand = new Vector3();
  for (const k of KEEPERS) {
    const p = d.people.add({ ...k.look, skin: 0xd9a585 });
    p.at(k.at[0], k.at[1], k.at[2]).face(CITY.grayAt.x, CITY.grayAt.z);
    p.pose = 'arm';
    people.push(p);
    p.hand(hand);
    const orb = new Mesh(new SphereGeometry(0.06, 20, 14), new MeshBasicMaterial({ color: k.open ? k.colour : 0x6a6a6a, toneMapped: false, transparent: true, opacity: k.open ? 1 : 0.6 }));
    orb.name = `Orb ${k.memory}`;
    orb.position.copy(hand).add(new Vector3(0, 0.08, 0));
    const entity = d.world.createTransformEntity(orb, { persistent: true });
    if (k.open) {
      entity.addComponent(OneHandGrabbable, { rotate: true, translate: true }).addComponent(MemoryOrb, { memory: k.memory });
      const glow = makeGlow(d.world, k.colour, 0.09);
      glow.position.copy(orb.position);
      (glow.material as MeshBasicMaterial).opacity = 0.25;
      d.stage.own('city', glow);
      glows[KEEPERS.indexOf(k)] = glow;
    }
    orbs.push(orb);
    d.stage.own('city', orb);
    palms.push(d.marker(hand.clone().add(new Vector3(0, 0.02, 0)), `Palm ${k.key}`));
  }
  await d.captions.say('S05-1', CITY.shoulder.clone().add(new Vector3(0.3, -0.1, 0.6)), 0);
  await d.captions.say('S05-2', CITY.graySays, 0);
  await d.captions.say('S05-3', people[0].head(new Vector3()), 0.3);
  return { people, orbs, palms, glows, watcher };
}
