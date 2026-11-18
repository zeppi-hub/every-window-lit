import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { onV2 } from '../events.js';
import { setGoal, setWindows } from '../goal.js';
import { placeGoal, setRingTargets } from '../goal-system.js';
import { leaveMemory } from '../memory-portal-system.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { s06 } from './circus-show.js';
import { wordBadge } from '../icons.js';
import type { DirectorSystem } from './director.js';
import { s08, s09, s10, stringWires } from './fire.js';
import { dressForestOrb, featherLands, flyToPerch } from './flight.js';
import { FOGGY, type FogSet, s17, s19, s20 } from './fog.js';
import { type LineId, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, KEEPERS, type Keepers } from './opening.js';
import { ORB_R, SEAT_TURN } from '../square-keepers.js';
import { firstCredits, s11 } from './noon.js';
import { devAt, type Flood, s12, s13, s14, s15, s16 } from './ship.js';
import { BENCH_EYE, s21, s22, s23, type Afternoon } from './farm.js';
import { s28, s29, s30 } from './end.js';
import { s18 } from './mountain.js';
import { magpie, s07 } from './run.js';
import { s25 } from './valley.js';
import { EVENING, type Evening, isEvening, s24, s26, s27, toMicrophone } from './wolves.js';
import { WEATHER } from './stage.js';

/**
 * The day in the city between the memories (the design's order and wrong-word rules): on Gray's shoulder the player either
 * gives him a word (a feather to his ear) or lands on a keeper's palm and
 * goes into their memory. The problems come in a fixed order, the memories
 * in any; the right word starts the fight, a wrong one puts out a window.
 */

/** Each problem's word, the keeper whose memory holds it, and its fight. */
const PROBLEMS = [
  { word: WORDS.safetyNet, keeper: 0, name: 'THE RUN' },
  { word: WORDS.firewall, keeper: 1, name: 'THE COLD FIRE' },
  { word: WORDS.bailOut, keeper: 2, name: 'THE SINKING BANK' },
  { word: WORDS.stressTest, keeper: 3, name: 'THE FOG' },
  { word: WORDS.primeThePump, keeper: 4, name: 'THE DROUGHT' },
  { word: WORDS.ringFence, keeper: 5, name: 'THE WOLVES' },
] as const;

/** The day has six troubles (the game's promise from its first line), however many of them this build has wired in. */
const TROUBLES = 6;

/** The plate's top row for the trouble now. */
function trouble(d: DirectorSystem): string {
  const n = Math.min(d.day.problem, PROBLEMS.length);
  return `TROUBLE ${n} OF ${TROUBLES} · ${PROBLEMS[n - 1].name}`;
}

/** Whether the day goes on past noon (S12 on); off, the first part ends at noon with its credits. */
export const SECOND_PART = true;

/** Memories built so far (the others send the player back, as a closed one does). */
const BUILT = new Set<string>(['circus', 'forest', 'ship', 'mountain', 'farm', 'valley']);

/** Where the bird sits between turns, and the ear it gives words to: Gray's shoulder (turned to the middle of the keepers' arc), and from S21 the bench by him. */
const home = { eye: CITY.shoulder.clone(), yaw: Math.PI + SEAT_TURN, ear: null as Object3D | null };

/** The seat on Gray's shoulder, as the city has it once it is set up (he is stood on the floor that is there). */
export function rehome(): void {
  home.eye.copy(CITY.shoulder);
  home.yaw = Math.PI + SEAT_TURN;
}

type Turn = { kind: 'word'; word: string } | { kind: 'perch'; keeper: number };

/** S06 onward, to the end of the first part (S11). */
export async function firstPart(d: DirectorSystem, cast: CityCast, keepers: Keepers, persona: PersonaId, startAt = 1): Promise<void> {
  const played = new Set<number>();
  let flood: Flood | null = null;
  let fog: FogSet | null = null;
  let afternoon: Afternoon | null = null;
  let evening: Evening | null = null;
  home.ear = cast.ear;
  // An orb's picture is a few centimetres across: shown only within a few metres (on or near the keeper's palm), never from across the square.
  const at = new Vector3();
  d.each(() => {
    // The city's score is its lit windows, always in view on the plate.
    setWindows(cast.windows.lit, cast.windows.total);
    keepers.pictures.forEach((picture, i) => {
      if (picture == null) return;
      picture.visible = !played.has(i) && picture.getWorldPosition(at).distanceTo(d.eyeAt) < 6;
    });
  });
  // The wires and bulbs over the square are up from the start (the cold fire runs them in S08 and S10).
  const wires = stringWires(d, persona);
  const bird = magpie(d);
  bird.visible = false;
  d.stage.own('city', bird);
  // Dev: ?at=ship or ?at=bank plays that scene first (ship.ts).
  if (import.meta.env.DEV) await devAt(d, cast, keepers, wires);
  dressForestOrb(d, keepers);
  // Dev (?problem=4): the day from the fog on, the earlier words on the wing and their memories played.
  if (import.meta.env.DEV && startAt === 4) {
    PROBLEMS.slice(0, 3).forEach((p, i) => {
      played.add(p.keeper);
      parrotWords.learn(p.word, [0xe8c45a, 0xb4532a, 0x4a86c0][i]);
    });
    d.day.problem = 4;
    fog = await s17(d, cast, keepers, true);
  }
  while (d.day.problem <= (SECOND_PART ? PROBLEMS.length : 2)) {
    const problem = PROBLEMS[d.day.problem - 1];
    // The last problem comes with the evening (S24); once the parrot has its word, the bankers have Gray's ears and the bird goes to the microphone (S26).
    if (problem.word === WORDS.ringFence) {
      if (evening == null) {
        evening = await s24(d, cast, keepers);
        rehome();
        home.ear = cast.ear;
      }
      if (parrotWords.has(WORDS.ringFence) && !evening.atMic) {
        await toMicrophone(d, evening);
        home.eye.copy(evening.micEye);
        home.yaw = 0;
        home.ear = evening.mic;
      }
    }
    const turn = await cityTurn(d, cast, keepers, played, problem.word, problem.keeper);
    if (turn.kind === 'perch') {
      const memory = await visitKeeper(d, keepers, turn.keeper);
      if (memory == null) continue;
      played.add(turn.keeper);
      await playMemory(d, keepers, turn.keeper, memory);
      continue;
    }
    if (turn.word !== problem.word) {
      await wrongWord(d, cast, turn.word);
      continue;
    }
    d.day.wrongStreak = 0;
    // Beat 5: half a second of silence, then the big answer.
    await d.wait(0.5);
    if (d.day.problem === 1) {
      await s07(d, cast, persona, keepers.watcher);
      await s08(d, cast, keepers, wires, bird);
    } else if (d.day.problem === 2) {
      await s10(d, cast, wires, bird);
      await s11(d, cast, keepers, wires, persona);
      if (SECOND_PART) flood = await s12(d, cast, keepers);
    } else if (d.day.problem === 3 && flood != null) {
      await s14(d, cast);
      await s15(d, cast, flood);
      await s16(d, keepers, wires);
      // The water has gone by the time the fog comes down.
      flood.bank.visible = false;
      flood.square.visible = false;
      fog = await s17(d, cast, keepers);
    } else if (d.day.problem === 4 && fog != null) {
      await s19(d, wires, bird);
      await s20(d, cast, fog, bird);
      afternoon = await s21(d, cast, keepers);
      home.eye.copy(BENCH_EYE);
      home.yaw = 0;
      home.ear = afternoon.ear;
    } else if (problem.word === WORDS.ringFence && evening != null) {
      await s26(d, cast, evening);
      await s27(d, cast, evening);
      rehome();
      home.ear = cast.ear;
    } else if (afternoon != null) {
      await s23(d, cast, afternoon);
      // After the drought (the fifth trouble) comes the last, the wolves (farm.ts counts on from an older order).
      d.day.problem = PROBLEMS.findIndex((p) => p.word === WORDS.ringFence) + 1;
    }
  }
  if (!SECOND_PART) {
    await firstCredits(d, cast);
    return;
  }
  // From the wolves to the end.
  await s28(d, cast);
  await s29(d, cast, keepers);
  await s30(d, keepers, wires, persona);
  await firstCredits(d, cast);
}

/** A keeper's name and memory, shown over the one pointed at ("RANGER · the forest"). */
let keeperTag: { mesh: Mesh; texture: CanvasTexture; text: string } | null = null;

function tagFor(d: DirectorSystem): NonNullable<typeof keeperTag> {
  if (keeperTag != null) return keeperTag;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(0.92, 0.2), new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide, toneMapped: false }));
  mesh.name = 'KeeperTag';
  mesh.renderOrder = 9000;
  mesh.visible = false;
  mesh.pointerEvents = 'none';
  d.world.createTransformEntity(mesh, { persistent: true });
  d.stage.own('city', mesh);
  keeperTag = { mesh, texture, text: '' };
  return keeperTag;
}

function drawTag(tag: NonNullable<typeof keeperTag>, text: string): void {
  if (tag.text === text) return;
  tag.text = text;
  const canvas = tag.texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(11, 14, 20, 0.82)';
  g.beginPath();
  g.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 26);
  g.fill();
  g.font = "700 54px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffc83d';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 40);
  tag.texture.needsUpdate = true;
}

/** While a turn waits: the keeper pointed at holds their orb up and is named over it, so the player sees whom she is about to fly to. */
function lightAimed(d: DirectorSystem, keepers: Keepers, open: number[]): () => void {
  const tag = tagFor(d);
  const at = new Vector3();
  const eye = new Vector3();
  let lit = -1;
  const stop = d.each(() => {
    const k = d.perchAim >= 0 ? open[d.perchAim] : -1;
    if (k !== lit) {
      lit = k;
      keepers.square.aim(k);
      if (k >= 0) {
        drawTag(tag, `${KEEPERS[k].key.toUpperCase()} · the ${KEEPERS[k].memory}`);
        if (import.meta.env.DEV) console.info(`[v2] pointing at the ${KEEPERS[k].key}`);
      }
    }
    tag.mesh.visible = lit >= 0;
    if (lit < 0) return;
    keepers.palms[lit].getWorldPosition(at);
    d.player.head.getWorldPosition(eye);
    // The same size to the eye at any distance: as wide as at 3 m (about 17 degrees), raised over the orb held up in proportion.
    const grow = Math.max(1, at.distanceTo(eye) / 3);
    tag.mesh.scale.setScalar(grow);
    tag.mesh.position.copy(at).setY(at.y + 0.82 + 0.12 * (grow - 1));
    tag.mesh.lookAt(eye);
  });
  return () => {
    stop();
    keepers.square.aim(-1);
    tag.mesh.visible = false;
  };
}

/** One turn on Gray's shoulder: a word to his ear, or a keeper's palm chosen. */
function cityTurn(d: DirectorSystem, cast: CityCast, keepers: Keepers, played: Set<number>, want: string, keeper: number): Promise<Turn> {
  const ear = home.ear ?? cast.ear;
  setListener(ear, 0.14);
  const hasWord = parrotWords.has(want);
  setGoal({ where: trouble(d), now: hasWord ? 'Give Gray the word: carry the feather to his ear.' : 'Fly to the glowing hand.' });
  // The ring is on the one place to go: his ear when the bird has the word, else the hand of the keeper whose memory holds it.
  setRingTargets(hasWord ? [ear] : [keepers.palms[keeper]]);
  // That keeper calls (light, orb held up, the gold line, the bell); the others wait.
  keepers.square.call(hasWord || played.has(keeper) ? null : keeper);
  if (import.meta.env.DEV) console.info(`[v2] turn ${d.day.problem}: ${hasWord ? 'the word is on the wing' : `the ${KEEPERS[keeper].key} calls`}`);
  const open = KEEPERS.map((_, i) => i).filter((i) => !played.has(i));
  const palms = open.map((i) => keepers.palms[i]);
  // Two wrong words in a row: the right memory's orb beats, if the word is still to be found.
  const pulse = !hasWord && d.day.wrongStreak >= 2 ? keepers.glows[keeper] : null;
  const stopPulse = pulse == null ? () => {} : beat(d, pulse);
  // The plate keeps to the right and a little higher, clear of Gray's head and the keepers before him.
  placeGoal(-0.5, 0.2);
  const stopLight = lightAimed(d, keepers, open);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (turn: Turn) => {
      if (settled) return;
      settled = true;
      setRingTargets(null);
      stopPulse();
      stopLight();
      keepers.square.call(null);
      placeGoal();
      setV2Targets([]);
      resolve(turn);
    };
    const listen = () =>
      d.nextWord(hasWord ? want : '').then((word) => {
        if (word === '') return;
        d.cancelPerch();
        settle({ kind: 'word', word });
      });
    const perch = () =>
      d.choosePerch(palms, Math.max(0, open.indexOf(keeper))).then((i) => {
        d.cancelWord();
        settle({ kind: 'perch', keeper: open[i] });
      });
    // A dev skip takes the expected way: the word if the parrot has it, else the right memory.
    if (hasWord) {
      void listen();
      void perch();
    } else {
      void perch();
      void listen();
    }
    setV2Targets([...palms, ear]);
  });
}

/** A glow that beats until stopped. */
function beat(d: DirectorSystem, glow: Mesh): () => void {
  const material = glow.material as MeshBasicMaterial;
  const base = material.opacity;
  let t = 0;
  const stop = d.each((delta) => {
    t += delta;
    const k = 0.5 + 0.5 * Math.sin(t * 6);
    glow.scale.setScalar(1 + 0.6 * k);
    material.opacity = base + 0.45 * k;
  });
  return () => {
    stop();
    glow.scale.setScalar(1);
    material.opacity = base;
  };
}

/** Land on keeper `i`'s palm; a closed memory sends the player back; an open one waits for its orb at the face. */
async function visitKeeper(d: DirectorSystem, keepers: Keepers, i: number): Promise<string | null> {
  const k = KEEPERS[i];
  const palm = keepers.palms[i].position;
  const keeper = keepers.people[i];
  // On the keeper's wrist, behind the orb, facing the way they hold it out (toward Gray): the small world filling the view ahead, Gray beyond.
  const ahead = new Vector3(Math.sin(keeper.yaw), 0, Math.cos(keeper.yaw));
  const eye = palm.clone().add(new Vector3(0, 0.17, 0)).addScaledVector(ahead, -(ORB_R + 0.2));
  // Their orb comes to rest on the palm before the bird sets out for it.
  keepers.square.hold(i);
  await flyToPerch(d, eye, keeper.yaw + Math.PI);
  if (!k.open || !BUILT.has(k.memory)) {
    await d.wait(1.2);
    keepers.square.release();
    await d.rig.move(home.eye, home.yaw);
    return null;
  }
  // The orb's picture turns to the bird (it faced Gray's shoulder until now).
  const picture = keepers.pictures[i];
  if (picture != null) {
    const orb = keepers.orbs[i].position;
    picture.position.copy(orb).addScaledVector(new Vector3().subVectors(eye, orb).normalize(), ORB_R + 0.005);
    picture.lookAt(eye);
  }
  setV2Targets([keepers.orbs[i]]);
  setGoal({ where: trouble(d), now: 'The memory opens. Hold still.' });
  const landed = d.now;
  const memory = await new Promise<string>((done) => {
    const off = onV2('memoryEnter', ({ memory }) => {
      off();
      stopWait();
      done(memory);
    });
    // The orb opens by itself a moment after landing (bringing it to the face still opens it at once): nobody is left on a palm wondering what to do.
    const stopWait = d.each(() => {
      if (d.now - landed < 2.2) return;
      stopWait();
      off();
      done(k.memory);
    });
    d.onSkip(() => {
      off();
      stopWait();
      done(k.memory);
    });
  });
  setV2Targets([]);
  return memory;
}

/** Into the memory (the orb has opened), its game, and out through white to Gray's shoulder. */
async function playMemory(d: DirectorSystem, keepers: Keepers, i: number, memory: string): Promise<void> {
  if (import.meta.env.DEV) console.info(`[v2] into the memory: ${memory}`);
  const restore = d.people.stash();
  const murmur = d.day.problem === 1 ? 0.4 : 0.15;
  d.sounds.bed('crowd_murmur_loop', 0);
  keepers.orbs[i].visible = false;
  keepers.square.release();
  const picture = keepers.pictures[i];
  if (picture != null) picture.visible = false;
  const glow = keepers.glows[i];
  if (glow != null) glow.visible = false;
  if (memory === 'circus') await s06(d);
  else if (memory === 'forest') await s09(d);
  else if (memory === 'ship') await s13(d);
  else if (memory === 'mountain') await s18(d);
  else if (memory === 'farm') await s22(d);
  else if (memory === 'valley') await s25(d, keepers.people[i]);
  const back = new Promise<void>((done) => {
    const off = onV2('memoryLeave', () => {
      off();
      done();
    });
    d.onSkip(() => {
      off();
      done();
    });
  });
  leaveMemory(memory, 'fade');
  await back;
  await d.stage.show('city', WEATHER.rain2008);
  restore();
  d.sounds.bed('crowd_murmur_loop', murmur);
  keepers.people[i].pose = 'idle';
  // Back to the city as it was: rain until the fog (S17), fog until the afternoon (S21), dust after.
  d.rain.on = d.day.problem < 4;
  if (d.day.problem === 4) d.stage.setWeather(FOGGY);
  if (d.day.problem >= 5) d.stage.setWeather(WEATHER.dusty2008);
  if (isEvening()) d.stage.setWeather(EVENING);
  d.rig.place(home.eye, home.yaw);
  // A word learned in there: its feather comes down onto the wing here, where the wing is seen.
  await featherLands(d);
}

/** A word that does not fit the problem: Gray says it, it does not hold, a window goes out and the bear comes nearer. */
async function wrongWord(d: DirectorSystem, cast: CityCast, word: string): Promise<void> {
  const mouth = cast.gray.head(new Vector3()).add(new Vector3(0, -0.05, 0.3));
  void d.gold.show(word.toUpperCase(), mouth.clone().add(new Vector3(0, 0.15, 0)), 1.1, 2.2, new Vector3(0, 0.3, 0.5), d.player.head, wordBadge(word));
  // The word's own small failure: bread falls again; a wall goes up and is walked round; a net that holds nothing.
  if (word === WORDS.freshBread) d.loaves.rain(12, new Vector3(-3, 0.15, -19), { x: 6, z: 7 }, 9, 1.4);
  // An old word: "We already have one". A word said before its problem: its own line.
  const order: string[] = PROBLEMS.map((p) => p.word);
  const old = word === WORDS.freshBread || order.indexOf(word) < d.day.problem - 1;
  const early: Record<string, LineId> = { [WORDS.firewall]: 'W-2', [WORDS.bailOut]: 'W-3', [WORDS.stressTest]: 'W-4', [WORDS.primeThePump]: 'W-5', [WORDS.ringFence]: 'W-6' };
  const line: LineId = old ? 'W-0' : (early[word] ?? 'W-0');
  await d.captions.say(line, mouth, 0);
  // The cost where the bird is looking: the lit window most in view flickers and goes out, and the crowd groans.
  const look = new Vector3(0, 0, -1).applyQuaternion(d.player.head.getWorldQuaternion(new Quaternion())).setY(0).normalize();
  const slot = cast.windows.nextOutInView(d.eyeAt, look);
  for (let f = 0; f < 3 && slot >= 0; f += 1) {
    cast.windows.flicker(slot, false);
    await d.wait(0.15);
    cast.windows.flicker(slot, true);
    await d.wait(0.15);
  }
  d.day.darkWindows += 1;
  d.day.wrongStreak += 1;
  cast.windows.lit = cast.windows.total - d.day.darkWindows;
  d.sounds.play('crowd_boo', 0.35);
  d.bear.steps += 1;
  if (import.meta.env.DEV) console.info(`[v2] wrong word "${word}": ${d.day.darkWindows} windows dark`);
}
