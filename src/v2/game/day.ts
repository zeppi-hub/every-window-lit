import { type Mesh, MeshBasicMaterial, Vector3 } from '@iwsdk/core';
import { onV2 } from '../events.js';
import { leaveMemory } from '../memory-portal-system.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { s06 } from './circus.js';
import type { DirectorSystem } from './director.js';
import { type LineId, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, KEEPERS, type Keepers } from './opening.js';
import { s07 } from './run.js';
import { WEATHER } from './stage.js';

/**
 * The day in the city between the memories (META_VR_V2_TASARIM.md, "Sıra
 * kuralı" and "Yanlış kelime akışı"): on Gray's shoulder the player either
 * gives him a word (a feather to his ear) or lands on a keeper's palm and
 * goes into their memory. The problems come in a fixed order, the memories
 * in any; the right word starts the fight, a wrong one puts out a window.
 */

/** Each problem's word, the keeper whose memory holds it, and its fight. */
const PROBLEMS = [
  { word: WORDS.safetyNet, keeper: 0 },
  { word: WORDS.firewall, keeper: 1 },
] as const;

/** Memories built so far (the others send the player back, as a closed one does). */
const BUILT = new Set<string>(['circus']);

type Turn = { kind: 'word'; word: string } | { kind: 'perch'; keeper: number };

/** S06 onward, to the end of the first part (S11). */
export async function firstPart(d: DirectorSystem, cast: CityCast, keepers: Keepers, persona: PersonaId): Promise<void> {
  const played = new Set<number>();
  while (d.day.problem <= PROBLEMS.length) {
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
    if (d.day.problem === 1) {
      await s07(d, cast, persona, keepers.watcher);
      if (import.meta.env.DEV) console.info('[v2] S07 won; S08 onward is not built yet');
      return;
    }
  }
}

/** One turn on Gray's shoulder: a word to his ear, or a keeper's palm chosen. */
function cityTurn(d: DirectorSystem, cast: CityCast, keepers: Keepers, played: Set<number>, want: string, keeper: number): Promise<Turn> {
  setListener(cast.ear, 0.14);
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
    setV2Targets([...palms, cast.ear]);
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
  const toward = new Vector3(CITY.grayAt.x - palm.x, 0, CITY.grayAt.z - palm.z).normalize();
  await d.rig.move(palm.clone().add(new Vector3(0, 0.15, 0)).addScaledVector(toward, 0.25), keepers.people[i].yaw + Math.PI);
  if (!k.open || !BUILT.has(k.memory)) {
    await d.wait(1.2);
    await d.rig.move(CITY.shoulder, Math.PI);
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
  keepers.orbs[i].visible = false;
  const glow = keepers.glows[i];
  if (glow != null) glow.visible = false;
  if (memory === 'circus') await s06(d);
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
  keepers.people[i].pose = 'idle';
  d.rain.on = true;
  d.rig.place(CITY.shoulder, Math.PI);
}

/** A word that does not fit the problem: Gray says it, it does not hold, a window goes out and the bear comes nearer. */
async function wrongWord(d: DirectorSystem, cast: CityCast, word: string): Promise<void> {
  void d.gold.show(word.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 2.2, new Vector3(0, 0.3, 0.5), d.player.head);
  // The word's own small failure: bread falls again; a wall goes up and is walked round; a net that holds nothing.
  if (word === WORDS.freshBread) d.loaves.rain(12, new Vector3(-3, 0.15, -19), { x: 6, z: 7 }, 9, 1.4);
  const old = word === WORDS.freshBread || (word === WORDS.safetyNet && d.day.problem > 1);
  const line: LineId = old ? 'W-0' : 'W-2';
  await d.captions.say(line, CITY.graySays, 0);
  d.day.darkWindows += 1;
  d.day.wrongStreak += 1;
  cast.windows.lit = cast.windows.total - d.day.darkWindows;
  d.bear.steps += 1;
  if (import.meta.env.DEV) console.info(`[v2] wrong word "${word}": ${d.day.darkWindows} windows dark`);
}
