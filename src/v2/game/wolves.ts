import { BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, PointLight, Points, PointsMaterial, Vector3 } from '@iwsdk/core';
import { devParam } from '../dev-param.js';
import { setGoal, setWindows } from '../goal.js';
import { wordBadge } from '../icons.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { setListener, stowWing } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { eased, type ValleyStage, wolvesDown } from '../valley-rules.js';
import type { DirectorSystem } from './director.js';
import { Fence, GOLD, type Loss, playRing } from './fence-kit.js';
import { makeGlow, mergeByMaterial } from './fx.js';
import { BOSSES, HEADLINES, WORDS } from './lines.js';
import { CITY, type CityCast, type Keepers } from './opening.js';
import type { Person } from './people.js';
import { showCard } from './run.js';
import type { Weather } from './stage.js';
import { buildWolf, driverCopy, malletParts, rammerFrom, type Wolf, wolfModel } from './valley-world.js';

/**
 * The sixth problem (S24, S26, S27): evening, the lamps lit; the bank's back
 * room is bright and loud, and out of it come wolves, low shapes with eyes,
 * that go nosing at the jars the town keeps its savings in. The bankers have
 * Gray by both ears, so the word goes into the microphone instead (S26),
 * and the whole square hears it before he says it. Then the same ring as in
 * the valley, in gold, round the jars (S27).
 */

/** The evening of 2008, and the night once the ring is up. */
export const EVENING: Weather = { sky: 0x232644, fog: 0x34365a, density: 0.012, light: 0.45 };
const NIGHT: Weather = { sky: 0x0b0e24, fog: 0x1a1d3a, density: 0.011, light: 0.42 };
/** The savings jars on the square, and the door of the bank's back room the wolves come from (m). */
const JARS = new Vector3(-2.6, 0.15, -14.2);
const SALON = new Vector3(4.6, 0.15, -19.8);
/** After this many losses the fight is made gentler. */
const MERCY = 3;
/** The museum's keeper among the six (opening.ts KEEPERS). */
const WAITING = 5;
/** The trouble's name on the goal plate (the sixth of the day's six), and the share of the square's windows it puts out. */
const WHERE = 'TROUBLE 6 OF 6 · THE WOLVES';
const TROUBLED = 0.16;

const corner = (degrees: number): { x: number; z: number } => ({ x: +(2.3 * Math.cos((degrees * Math.PI) / 180)).toFixed(3), z: +(2.3 * Math.sin((degrees * Math.PI) / 180)).toFixed(3) });

/** The ring round the jars, in the valley's own terms: five holes, the first two either side of where the wolves come from. */
const RING: ValleyStage = {
  name: 'the wolves',
  holes: [286, 358, 70, 142, 214].map(corner),
  herd: [0, 1, 2, 3, 4].map((k) => ({ kind: 'calf' as const, x: +(0.7 * Math.cos(k * 1.2566)).toFixed(3), z: +(0.7 * Math.sin(k * 1.2566)).toFixed(3), yaw: 0, core: true })),
  rope: 22,
  slack: 0.55,
  dusk: 72,
  ground: 1.3,
  gust: 0.1,
  gustEvery: 3.5,
  drift: 0,
  wolvesFrom: 0.9,
  answer: [0, 1, 2, 3, 4],
};

export interface Evening {
  /** Where the bird lands on the lectern, the microphone it drops the word into, and its seat there. */
  micPerch: Group;
  mic: Group;
  micEye: Vector3;
  atMic: boolean;
  bankers: Person[];
  cats: Object3D[];
  wolves: Wolf[];
  door: Mesh;
  doorLight: PointLight;
  jarLight: PointLight;
  /** The windows the wolves have put out (they come back on when the ring holds). */
  troubled: number;
}

let evening: Evening | null = null;

/** Whether the day has reached its evening (the weather the city comes back to after the valley). */
export function isEvening(): boolean {
  return evening != null;
}

function own<T extends Object3D>(d: DirectorSystem, object: T): T {
  d.world.createTransformEntity(object, { persistent: true });
  d.stage.own('city', object);
  return object;
}

/** The jars: glass, each with its stack of coins, on a low round table with a light over them. */
function buildJars(): Group {
  const jars = new Group();
  jars.name = 'SavingsJars';
  const wood = new MeshStandardMaterial({ color: 0x3b2416, roughness: 0.6 });
  const glass = new MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false });
  const gold = new MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.35, metalness: 0.55, emissive: 0x9a6a14, emissiveIntensity: 0.7 });
  // The lids are brass, of a piece with the coins (one draw fewer in a square that has few to spare).
  const lid = gold;
  const top = new Mesh(new CylinderGeometry(1.05, 1.05, 0.06, 28), wood);
  top.position.y = 0.52;
  const foot = new Mesh(new CylinderGeometry(0.18, 0.45, 0.5, 14), wood);
  foot.position.y = 0.25;
  jars.add(top, foot);
  const places = [...RING.herd.map((b) => [b.x, b.z] as const), [0, 0] as const];
  places.forEach(([x, z], k) => {
    const tall = 0.3 + 0.05 * (k % 3);
    const coins = new Mesh(new CylinderGeometry(0.085, 0.085, tall * (0.45 + 0.1 * (k % 4)), 12), gold);
    coins.position.set(x, 0.56 + coins.geometry.parameters.height / 2, z);
    const jar = new Mesh(new CylinderGeometry(0.12, 0.12, tall, 14), glass);
    jar.position.set(x, 0.55 + tall / 2, z);
    const cap = new Mesh(new CylinderGeometry(0.125, 0.125, 0.03, 14), lid);
    cap.position.set(x, 0.56 + tall, z);
    jars.add(coins, jar, cap);
  });
  mergeByMaterial(jars);
  jars.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return jars;
}

/** The first stars over the roofs. */
function buildStars(): Points {
  const count = 260;
  const places = new Float32Array(count * 3);
  let seed = 31;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < count; k += 1) {
    const a = random() * Math.PI * 2;
    const up = 0.25 + 0.75 * Math.sqrt(random());
    const flat = Math.sqrt(1 - up * up);
    places.set([Math.cos(a) * flat * 600, up * 600, Math.sin(a) * flat * 600 - 6], k * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(places, 3));
  const stars = new Points(geometry, new PointsMaterial({ color: 0xe2e8ff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.name = 'CityStars';
  stars.frustumCulled = false;
  stars.pointerEvents = 'none';
  return stars;
}

/** S24: evening; the back room lit, the wolves out of it, the bankers round Gray; the keeper's line. */
export async function s24(d: DirectorSystem, cast: CityCast, keepers: Keepers): Promise<Evening> {
  d.chapter('S24');
  d.rain.on = false;
  await d.rig.fadeTo(1);
  // Gray is back at the lectern, the bird on his shoulder.
  cast.gray.at(CITY.grayAt.x, CITY.grayAt.y, CITY.grayAt.z, 0);
  cast.gray.pose = 'idle';
  d.rig.place(CITY.shoulder, Math.PI);
  d.stage.setWeather(EVENING);
  // The lamp on the square, the bright door of the back room, the jars under their own light.
  const lamp = own(d, new PointLight(0xffc98a, 46, 22, 1.6));
  lamp.position.set(-4.0, 3.5, -10.4);
  const door = own(d, new Mesh(new PlaneGeometry(1.7, 2.7), new MeshBasicMaterial({ color: 0xffc76a, toneMapped: false })));
  door.name = 'BackRoomDoor';
  door.position.set(SALON.x, SALON.y + 1.35, SALON.z);
  door.pointerEvents = 'none';
  const doorLight = own(d, new PointLight(0xffb45a, 30, 14, 1.6));
  doorLight.position.set(SALON.x, SALON.y + 1.8, SALON.z + 1.2);
  const jars = own(d, buildJars());
  jars.position.copy(JARS);
  const jarLight = own(d, new PointLight(0xffd88a, 7, 7, 1.5));
  jarLight.position.copy(JARS).add(new Vector3(0, 2.1, 0));
  const model = wolfModel(d.stage.root('valley'));
  const wolves = [0, 1, 2].map(() => {
    const wolf = buildWolf(model);
    own(d, wolf.group);
    return wolf;
  });
  // By evening the square has emptied: nobody is left of the morning's queue.
  for (const p of cast.crowd) p.pose = 'hidden';
  cast.reporter.pose = 'hidden';
  // The bankers, one at each of Gray's shoulders and a step behind him (seen whole from the bird's seat, and later from the microphones), and their cats on the steps.
  const bankers = [0, 1].map((k) => {
    const banker = d.people.add({ model: 'crowd_man_suit', size: 1 + 0.03 * k });
    banker.at(CITY.grayAt.x + (k === 0 ? 0.82 : -0.8), CITY.grayAt.y, CITY.grayAt.z - 0.5).face(CITY.grayAt.x, CITY.grayAt.z + 0.4);
    banker.pose = 'talk';
    return banker;
  });
  // The keepers whose memories are told have gone home with the light: only the museum's keeper still waits (and the square is that much lighter to draw).
  keepers.people.forEach((keeper, k) => {
    if (k === WAITING) return;
    keeper.pose = 'hidden';
    keepers.orbs[k].visible = false;
    const picture = keepers.pictures[k];
    if (picture != null) picture.visible = false;
    const glow = keepers.glows[k];
    if (glow != null) glow.visible = false;
  });
  const cats: Object3D[] = [];
  // The microphones on the lectern (opening.ts): the bird lands in front of them, facing Gray.
  const mics = new Vector3(CITY.grayAt.x + 0.04, CITY.grayAt.y + 1.2, CITY.grayAt.z + 0.5);
  const micPerch = d.marker(mics.clone().add(new Vector3(0, 0.14, 0.26)), 'MicPerch');
  const mic = d.marker(mics.clone().add(new Vector3(0, 0.07, -0.02)), 'Microphone');
  const micEye = mics.clone().add(new Vector3(0, 0.3, 0.42));
  evening = { micPerch, mic, micEye, atMic: false, bankers, cats, wolves, door, doorLight, jarLight, troubled: 0 };
  // Two come out at first; the third joins when the fight begins (S27).
  wolves[2].group.visible = false;
  placeWolves(evening, 0, d.now, 0);
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.shut, struck: HEADLINES.runs },
    { text: HEADLINES.again },
  ]);
  await d.rig.fadeTo(0);
  d.sounds.play('paper', 0.6);
  d.sounds.play('wolf_howl', 0.3);
  // The wolves come out of the door toward the jars while the banker talks.
  const start = d.now;
  // As they come, windows go out round the square, one after another: the trouble, seen.
  const troubled = Math.round(cast.windows.total * TROUBLED);
  const out = d.each(() => {
    if (evening == null) return;
    const k = Math.min(1, (d.now - start) / 8);
    placeWolves(evening, 0.25 * k, d.now, 0);
    evening.troubled = Math.round(troubled * k);
    showWindows(d, cast, evening);
  });
  setGoal({ where: WHERE, now: 'Watch the wolves come for the savings.' });
  await d.captions.say('S24-1', bankers[0].head(new Vector3()), 0.25);
  await d.captions.say('S24-2', keepers.people[WAITING].head(new Vector3()), 0.3);
  out();
  evening.troubled = troubled;
  showWindows(d, cast, evening);
  setGoal({ where: WHERE, now: "Find the word: fly to a keeper's hand." });
  return evening;
}

/** The square's windows as they stand: all but those lost for good and those the wolves have out now. */
function showWindows(d: DirectorSystem, cast: CityCast, e: Evening): void {
  const lit = Math.max(0, cast.windows.total - d.day.darkWindows - e.troubled);
  if (lit !== cast.windows.lit) cast.windows.lit = lit;
  setWindows(cast.windows.lit, cast.windows.total);
}

const at = new Vector3();
const edge = new Vector3();
const side = new Vector3();
const inside = new Vector3();

/** The wolves, `down` (0..1) of the way from the back room's door to the ring round the jars; `inside` (0..1) takes them on to the jars. */
function placeWolves(e: Evening, down: number, time: number, within: number): void {
  e.wolves.forEach((wolf, i) => {
    edge.copy(SALON).sub(JARS).setY(0).normalize();
    side.set(-edge.z, 0, edge.x);
    // To just outside the ring, spread along it, pacing.
    const pace = Math.sin(time * 0.6 + i * 2.2) * (0.3 + 1.3 * down);
    edge.multiplyScalar(3.5 + 0.5 * (i % 2)).addScaledVector(side, (i - 1) * 1.5 + pace).add(JARS);
    at.copy(SALON).setY(JARS.y).lerp(edge, Math.min(1, down * 1.02 + 0.02 * i));
    at.lerp(inside.set(JARS.x + 0.5 * (i - 1), JARS.y, JARS.z + 0.3), within);
    const before = wolf.group.position;
    const dx = at.x - before.x;
    const dz = at.z - before.z;
    const moving = Math.hypot(dx, dz) > 0.003;
    const want = moving ? Math.atan2(dx, dz) : Math.atan2(JARS.x - at.x, JARS.z - at.z);
    let turn = want - wolf.group.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    wolf.group.rotation.y += turn * 0.15;
    wolf.group.position.set(at.x, JARS.y + (moving ? 0.03 * Math.abs(Math.sin(time * 8 + i)) : 0), at.z);
  });
}

/** S26, first half: the bankers have both his ears; the bird flies down to the microphones instead. */
export async function toMicrophone(d: DirectorSystem, e: Evening): Promise<void> {
  d.chapter('S26');
  // The bankers are at both of Gray's ears: there is no room for a feather.
  for (const banker of e.bankers) banker.pose = 'talk';
  setListener(null);
  setGoal({ where: WHERE, now: 'Give the word: fly down to the microphones.' });
  await d.choosePerch([e.micPerch]);
  await d.rig.move(e.micEye, 0);
  e.atMic = true;
  setGoal({ where: WHERE, now: 'Give the word: drop the feather in the microphone.' });
  if (import.meta.env.DEV) console.info('[wolves] on the microphone');
}

/** S26, second half: the word has gone into the microphone; the square hears it, and then Gray says it himself. */
export async function s26(d: DirectorSystem, cast: CityCast, e: Evening): Promise<void> {
  const head = d.player.head;
  d.sounds.play('mic_tap', 0.7);
  void d.gold.show(WORDS.ringFence.toUpperCase(), new Vector3(0, 6.2, -11), 3.4, 3.2, new Vector3(0, 0.2, 0), head, wordBadge(WORDS.ringFence));
  await d.captions.say('S26-1', cast.screen.position.clone().add(new Vector3(0, 2.6, 0)), 0.2);
  for (const banker of e.bankers) banker.pose = 'idle';
  await d.wait(0.9);
  await d.captions.say('S26-2', cast.gray.head(new Vector3()), 0.25);
}

/** S27, THE WOLVES: the ring of the valley, in gold, round the savings jars, before the wolves get from the back room to them. */
export async function s27(d: DirectorSystem, cast: CityCast, e: Evening): Promise<void> {
  d.chapter('S27');
  const head = d.player.head;
  void d.gold.show(BOSSES.wolves.name, JARS.clone().add(new Vector3(0, 4.4, 0)), 3.2, 2.6, new Vector3(0, 0.15, 0), head);
  setListener(null);
  // The driver's handles are where the wing lies: the wing is put away for the fight.
  stowWing(true);
  // The valley's rammer, in gold (if the valley's file is in; else the plain driver).
  const mallet = malletParts(d.stage.root('valley'));
  const goldTool = new MeshStandardMaterial({ color: 0xe8c45a, roughness: 0.35, metalness: 0.55, emissive: 0x8a6418, emissiveIntensity: 0.5 });
  const fence = new Fence((object) => own(d, object), GOLD, { driver: driverCopy(goldTool) ?? (mallet != null ? rammerFrom(mallet, goldTool) : null) });
  // The bird's perch by each hole: a gold stand.
  const stand = new Group();
  stand.name = 'GoldPerch';
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, roughness: 0.35, metalness: 0.55, emissive: 0x8a6418, emissiveIntensity: 0.5 });
  const pole = new Mesh(new CylinderGeometry(0.018, 0.024, 1.05, 8), gold);
  pole.position.set(0, 0.525, 0.3);
  const bar = new Mesh(new CylinderGeometry(0.016, 0.016, 0.4, 8), gold);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.05, 0.3);
  stand.add(pole, bar);
  stand.traverse((o) => {
    o.pointerEvents = 'none';
  });
  own(d, stand);
  const hintGlow = makeGlow(d.world, 0xffd27a, 0.25);
  hintGlow.visible = false;
  d.stage.own('city', hintGlow);
  const stars = own(d, buildStars());
  e.wolves[2].group.visible = true;

  const game = playMiniGame(new MiniGame(WORDS.ringFence, [{ name: 'the wolves' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  let stakes = RING.answer.length;
  // The bird leaves the microphones for the jars behind the same fade as every change of seat.
  await d.rig.fadeTo(1);
  while (game.phase !== 'won') {
    await d.until(() => game.phase === 'playing' || game.phase === 'won');
    if (game.phase !== 'playing') continue;
    const fails = game.failuresOf(0);
    const rules = fails >= MERCY ? eased(RING) : RING;
    // Dev: ?patience=8 gives a slow test bot time.
    const patience = Math.max(1, Number(devParam('patience') ?? 1));
    const stage: ValleyStage = patience === 1 ? rules : { ...rules, dusk: rules.dusk * patience };
    e.jarLight.intensity = 7;
    placeWolves(e, 0.25, d.now, 0);
    void d.rig.fadeTo(0);
    if (import.meta.env.DEV) console.info(`[wolves] the ring round the jars${fails >= MERCY ? ' (eased)' : ''}, attempt ${fails + 1}`);
    let down = 0.25;
    const outcome = await playRing(d, fence, {
      stage,
      origin: JARS,
      patient: false,
      hint: fails >= HINT_AFTER,
      paused: () => minis?.playPaused ?? false,
      seat: (eye, yaw) => {
        stand.position.set(eye.x, JARS.y, eye.z);
        stand.rotation.y = yaw;
      },
      tick: (_delta, state): Loss | null => {
        down = 0.25 + 0.75 * wolvesDown(stage, state.clock);
        placeWolves(e, down, d.now, 0);
        return state.clock >= stage.dusk && !state.ring.closed ? 'open' : null;
      },
      plan: true,
      phase: (kind, staked, closing) => {
        const what = kind === 'drive' ? 'slam the band green.' : kind === 'haul' ? 'haul till the pennants fly.' : closing ? 'point at the first stake.' : 'point at the next hole.';
        setGoal({ where: WHERE, now: `Fence the savings: ${what}`, steps: [staked, stage.answer.length] });
      },
      hintGlow,
      tag: 'wolves',
    });
    if (outcome.won) {
      stakes = outcome.ring.order.length;
      game.win();
      break;
    }
    // A wolf gets to the jars: their light goes out, and the square groans.
    d.sounds.play('wolf_howl', 0.8);
    d.sounds.play('crowd_boo', 0.5, 1, 0.8);
    const start = d.now;
    const fading = d.wait(1.4).then(() => d.rig.fadeTo(1));
    d.onSkip(() => {});
    await d.until(() => {
      const k = Math.min(1, (d.now - start) / 1.8);
      placeWolves(e, 1, d.now, k);
      e.jarLight.intensity = 7 * (1 - k);
      return k >= 1;
    });
    await fading;
    // The price of a lost round: one more window dark for good.
    d.day.darkWindows += 1;
    showWindows(d, cast, e);
    game.lose(outcome.reason);
  }
  endMiniGame(game);
  setV2Targets([]);
  stowWing(false);
  hintGlow.visible = false;

  // Won: the stakes' lamps light one by one; the wolves go back to their door, and it dims; the stars come out.
  fence.light(stakes);
  d.sounds.play('applause', 0.7);
  void d.gold.show(BOSSES.wolves.won, JARS.clone().add(new Vector3(0, 3.2, 0)), 2.8, 2.8, new Vector3(0, 0.2, 0), head);
  const start = d.now;
  const troubledAtStart = e.troubled;
  setGoal({ where: WHERE, now: 'Watch the windows come back on.', steps: [stakes, stakes] });
  d.onSkip(() => {});
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 2.6);
    placeWolves(e, 1 - k, d.now, 0);
    (e.door.material as MeshBasicMaterial).color.setHex(0xffc76a).multiplyScalar(1 - 0.8 * k);
    e.doorLight.intensity = 30 * (1 - 0.85 * k);
    d.stage.blendWeather(EVENING, NIGHT, k);
    (stars.material as PointsMaterial).opacity = 0.9 * k;
    // The windows the wolves had out come back on.
    e.troubled = Math.round(troubledAtStart * (1 - k));
    showWindows(d, cast, e);
    return k >= 1;
  });
  for (const wolf of e.wolves) wolf.group.visible = false;
  for (const cat of e.cats) cat.visible = false;
  // The bear lies down over the city.
  d.bear.steps = Math.min(d.bear.steps, 0) - 1;
  d.day.problem += 1;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  // Back on Gray's shoulder; the banker has the last word, and the card is read.
  await d.rig.move(CITY.shoulder, Math.PI);
  e.atMic = false;
  await d.captions.say('S27-1', e.bankers[0].head(new Vector3()), 0.25);
  await showCard(d, 'ringFence');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.shut, struck: HEADLINES.runs },
    { text: HEADLINES.again, struck: HEADLINES.fenced },
  ]);
}
