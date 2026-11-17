import { Group, Quaternion, Vector3 } from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import type { DirectorSystem } from './director.js';
import type { Wires } from './fire.js';
import { makeSign } from './fx.js';
import { type LineId, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, type Keepers, prop } from './opening.js';
import { showFamily } from './noon.js';
import { shoulderEye } from './people.js';
import { WEATHER } from './stage.js';

/**
 * The end of this build (META_VR_V2_TASARIM.md, S28-S30 and Bölüm 6, as
 * scope 1a simplifies it): Gray at the microphones finds his own words; the
 * person's stopped watch starts again, its hand turned forward winds the
 * square on thirty-three years; in 2041 the old man on the bench lifts his
 * hat to the bird; the grey feather goes to the family's place one last
 * time; and the person and a neighbour say how the square came through.
 */

/** The square's line by how many windows went dark (Bölüm 6, "Meydanın dört hali"). */
function squareLine(dark: number): LineId {
  if (dark <= 2) return 'E-1';
  if (dark <= 6) return 'E-2';
  if (dark <= 11) return 'E-3';
  return 'E-4';
}

const PERSONA_END: Readonly<Record<PersonaId, LineId>> = { maya: 'E-M', leo: 'E-L', sam: 'E-S' };

/** S28: Gray back at the microphones, no feather this time; the watch in the person's hand starts to tick. */
export async function s28(d: DirectorSystem, cast: CityCast): Promise<void> {
  await d.rig.fadeTo(1);
  cast.gray.at(CITY.grayAt.x, CITY.grayAt.y, CITY.grayAt.z, 0);
  cast.gray.pose = 'idle';
  d.rig.place(CITY.shoulder, Math.PI);
  await d.rig.fadeTo(0);
  cast.gray.pose = 'talk';
  await d.captions.say('S28-1', CITY.graySays, 0);
  // To the bird.
  await d.captions.say('S28-2', CITY.graySays, 0);
  cast.gray.pose = 'idle';
  d.sounds.bed('clock_tick_loop', 0.5);
}

/** S29: the watch's hand turned forward one turn (H3, clockwise) winds the square on to 2041. */
export async function s29(d: DirectorSystem, cast: CityCast, keepers: Keepers): Promise<void> {
  const eye = d.eyeAt.clone();
  const look = new Vector3(0, 0, -1).applyQuaternion(d.player.head.getWorldQuaternion(new Quaternion())).setY(0).normalize();
  const watch = prop('pocket_watch');
  watch.position.copy(eye).addScaledVector(look, 0.3).add(new Vector3(0, -0.08, 0));
  watch.lookAt(eye);
  const watchEntity = d.world.createTransformEntity(watch, { persistent: true });
  d.stage.own('city', watch);
  const hand = watch.getObjectByName('hour_hand') ?? new Group();
  const handEntity = d.world.createTransformEntity(hand, { parent: watchEntity, persistent: true });
  // Forward this time: one full turn clockwise (negative about the dial's z).
  handEntity.addComponent(PathHandle, { kind: PathKindEnum.Swing, a: hand.position.toArray(), axis: [0, 0, 1], from: 0, to: -Math.PI * 2, grip: [0, 0.032, 0], reach: 0.09 });
  setV2Targets([hand]);
  await d.until(() => (handEntity.getValue(PathHandle, 'progress') ?? 0) >= 0.97);
  setV2Targets([]);
  watch.visible = false;
  d.sounds.bed('clock_tick_loop', 0.5, 2.6);
  // Thirty-three years on: the crowd goes, the evening comes, as many windows dark as words went wrong, and SOLD on them.
  const start = d.now;
  const total = cast.windows.total;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 6);
    d.stage.blendWeather(WEATHER.dusty2008, WEATHER.evening2041, k);
    cast.windows.lit = Math.round(total - d.day.darkWindows * k);
    cast.crowd.forEach((p, i) => {
      if (k > (i + 1) / (cast.crowd.length + 2)) p.pose = 'hidden';
    });
    return k >= 1;
  });
  for (let i = 0; i < Math.min(8, d.day.darkWindows); i += 1) {
    const sign = makeSign(d.world, 'SOLD', { w: 1.4, h: 0.5 }, { paper: '#f2efe6', ink: '#8a1c1c' });
    const a = (i / 8) * Math.PI * 2 + 0.5;
    sign.position.set(Math.sin(a) * 13, 2.4, -6 + Math.cos(a) * 13);
    sign.lookAt(0, 2.4, -6);
    d.stage.own('city', sign);
  }
  // Every ending's cost: the water line plaque on the bank (Bölüm 6).
  const plaque = makeSign(d.world, 'PAID FOR BY THE PUBLIC', { w: 1.6, h: 0.32 }, { paper: '#2a3a44', ink: '#e8e0c8' });
  plaque.position.set(3.2, 1.9, -19.9);
  d.stage.own('city', plaque);
  d.sounds.bed('clock_tick_loop', 0);
  cast.gray.pose = 'hidden';
  cast.reporter.pose = 'hidden';
  for (const k of keepers.people) k.pose = 'hidden';
  d.rain.on = false;
  await d.captions.say('S29-1', keepers.watcher.head(new Vector3()), 0.25);
}

/** S30: 2041; the old man on the bench lifts his hat; the grey feather to the family's place; how it came through. */
export async function s30(d: DirectorSystem, keepers: Keepers, w: Wires, persona: PersonaId): Promise<void> {
  const old = d.people.add({ model: 'gray', size: 0.97 });
  old.at(-0.35, 0.15, -3.9).face(CITY.benchPerch.x, CITY.benchPerch.z);
  await d.rig.move(CITY.benchPerch.clone().add(new Vector3(0, 0.3, 0)), 0);
  await d.captions.say('E-G', old.head(new Vector3()), 0.25);
  // The family's place, its window lit (always the thirteenth), and the bird on the person's shoulder.
  const watcher = keepers.watcher;
  const front = w.family.clone().addScaledVector(w.facing, 2.6);
  await d.rig.fadeTo(1);
  showFamily(true);
  watcher.at(front.x, 0.15, front.z, Math.atan2(-w.facing.x, -w.facing.z));
  watcher.pose = 'idle';
  if (persona === 'maya') {
    // "BROOKS BAKERY & DAUGHTER" (Bölüm 6, S30).
    const sign = makeSign(d.world, 'BROOKS BAKERY & DAUGHTER', { w: 2.4, h: 0.4 }, { paper: '#f4efe4', ink: '#2a2420' });
    sign.position.copy(w.family).addScaledVector(w.facing, 0.3).setY(2.8);
    sign.rotation.y = Math.atan2(w.facing.x, w.facing.z);
    d.stage.own('city', sign);
  }
  d.rig.place(shoulderEye(watcher, new Vector3()), Math.atan2(-w.facing.x, -w.facing.z) + Math.PI);
  await d.rig.fadeTo(0);
  // The family's word, one last time: the grey feather to their window.
  const glass = d.marker(w.family.clone().addScaledVector(w.facing, 1.6).setY(1.4), 'FamilyGlass');
  setListener(glass, 0.5);
  setV2Targets([glass]);
  const word = await Promise.race([d.nextWord(WORDS.freshBread), d.wait(10).then(() => '')]);
  d.cancelWord();
  setV2Targets([]);
  if (word === WORDS.freshBread) void d.gold.show(WORDS.freshBread.toUpperCase(), glass.position.clone().add(new Vector3(0, 0.6, 0)), 1.2, 2.6, new Vector3(0, 0.3, 0), d.player.head);
  await d.captions.say(PERSONA_END[persona], watcher.head(new Vector3()), 0.25);
  await d.captions.say(squareLine(d.day.darkWindows), watcher.head(new Vector3()), 0.25);
  const neighbour = d.people.add({ model: 'crowd_man_casual' });
  const at = front.clone().addScaledVector(w.facing, 1.5).add(new Vector3(1.2, 0, 0));
  neighbour.at(at.x, 0.15, at.z).face(front.x, front.z);
  await d.captions.say('E-N', neighbour.head(new Vector3()), 0.25);
}
