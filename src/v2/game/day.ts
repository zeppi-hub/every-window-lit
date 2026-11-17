import { type Mesh, MeshBasicMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { onV2 } from '../events.js';
import { leaveMemory } from '../memory-portal-system.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { s06 } from './circus.js';
import { wordBadge } from '../icons.js';
import type { DirectorSystem } from './director.js';
import { s08, s09, s10, stringWires } from './fire.js';
import { type LineId, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, KEEPERS, type Keepers } from './opening.js';
import { firstCredits, s11 } from './noon.js';
import { type Flood, s12, s13, s14, s15, s16 } from './ship.js';
import { BENCH_EYE, s21, s22, s23, type Afternoon } from './farm.js';
import { s28, s29, s30 } from './end.js';
import { magpie, s07 } from './run.js';
import { WEATHER } from './stage.js';

/**
 * The day in the city between the memories (the design's order and wrong-word rules): on Gray's shoulder the player either
 * gives him a word (a feather to his ear) or lands on a keeper's palm and
 * goes into their memory. The problems come in a fixed order, the memories
 * in any; the right word starts the fight, a wrong one puts out a window.
 */

/** Each problem's word, the keeper whose memory holds it, and its fight. */
const PROBLEMS = [
  { word: WORDS.safetyNet, keeper: 0 },
  { word: WORDS.firewall, keeper: 1 },
  { word: WORDS.bailOut, keeper: 2 },
  { word: WORDS.primeThePump, keeper: 4 },
] as const;

/** Whether the day goes on past noon (S12 on); off, the first part ends at noon with its credits. */
export const SECOND_PART = true;

/** Memories built so far (the others send the player back, as a closed one does). */
const BUILT = new Set<string>(['circus', 'forest', 'ship', 'farm']);

/** Where the bird sits between turns, and the ear it gives words to: Gray's shoulder, and from S21 the bench by him. */
const home = { eye: CITY.shoulder.clone(), yaw: Math.PI, ear: null as Object3D | null };

type Turn = { kind: 'word'; word: string } | { kind: 'perch'; keeper: number };

/** S06 onward, to the end of the first part (S11). */
export async function firstPart(d: DirectorSystem, cast: CityCast, keepers: Keepers, persona: PersonaId): Promise<void> {
  const played = new Set<number>();
  let flood: Flood | null = null;
  let afternoon: Afternoon | null = null;
  home.ear = cast.ear;
  // An orb's picture is a few centimetres across: shown only within a few metres (on or near the keeper's palm), never from across the square.
  const at = new Vector3();
  d.each(() => {
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
  while (d.day.problem <= (SECOND_PART ? PROBLEMS.length : 2)) {
    const problem = PROBLEMS[d.day.problem - 1];
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
      // By the afternoon the water has gone.
      flood.bank.visible = false;
      flood.square.visible = false;
      afternoon = await s21(d, cast, keepers);
      home.eye.copy(BENCH_EYE);
      home.yaw = 0;
      home.ear = afternoon.ear;
    } else if (afternoon != null) {
      await s23(d, cast, afternoon);
    }
  }
  if (!SECOND_PART) {
    await firstCredits(d, cast);
    return;
  }
  // S17-S20 and S24-S27 are not in this build (scope 1a): from the farm straight to the end.
  await s28(d, cast);
  await s29(d, cast, keepers);
  await s30(d, keepers, wires, persona);
  await firstCredits(d, cast);
}

/** One turn on Gray's shoulder: a word to his ear, or a keeper's palm chosen. */
function cityTurn(d: DirectorSystem, cast: CityCast, keepers: Keepers, played: Set<number>, want: string, keeper: number): Promise<Turn> {
  const ear = home.ear ?? cast.ear;
  setListener(ear, 0.14);
  const hasWord = parrotWords.has(want);
  const open = KEEPERS.map((_, i) => i).filter((i) => !played.has(i));
  const palms = open.map((i) => keepers.palms[i]);
  // Two wrong words in a row: the right memory's orb beats, if the word is still to be found.
  const pulse = !hasWord && d.day.wrongStreak >= 2 ? keepers.glows[keeper] : null;
  const stopPulse = pulse == null ? () => {} : beat(d, pulse);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (turn: Turn) => {
      if (settled) return;
      settled = true;
      stopPulse();
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
  const toward = new Vector3(home.eye.x - palm.x, 0, home.eye.z - palm.z).normalize();
  await d.rig.move(palm.clone().add(new Vector3(0, 0.15, 0)).addScaledVector(toward, 0.25), keepers.people[i].yaw + Math.PI);
  if (!k.open || !BUILT.has(k.memory)) {
    await d.wait(1.2);
    await d.rig.move(home.eye, home.yaw);
    return null;
  }
  setV2Targets([keepers.orbs[i]]);
  const memory = await new Promise<string>((done) => {
    const off = onV2('memoryEnter', ({ memory }) => {
      off();
      done(memory);
    });
    d.onSkip(() => {
      off();
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
  const picture = keepers.pictures[i];
  if (picture != null) picture.visible = false;
  const glow = keepers.glows[i];
  if (glow != null) glow.visible = false;
  if (memory === 'circus') await s06(d);
  else if (memory === 'forest') await s09(d);
  else if (memory === 'ship') await s13(d);
  else if (memory === 'farm') await s22(d);
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
  // Back to the city as it was: rain until the afternoon (S21), dust after.
  d.rain.on = d.day.problem < 4;
  if (d.day.problem >= 4) d.stage.setWeather(WEATHER.dusty2008);
  d.rig.place(home.eye, home.yaw);
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
  const early: Record<string, LineId> = { [WORDS.firewall]: 'W-2', [WORDS.bailOut]: 'W-3', [WORDS.primeThePump]: 'W-5' };
  const line: LineId = old ? 'W-0' : (early[word] ?? 'W-0');
  await d.captions.say(line, mouth, 0);
  d.day.darkWindows += 1;
  d.day.wrongStreak += 1;
  cast.windows.lit = cast.windows.total - d.day.darkWindows;
  d.bear.steps += 1;
  if (import.meta.env.DEV) console.info(`[v2] wrong word "${word}": ${d.day.darkWindows} windows dark`);
}
