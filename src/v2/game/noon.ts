import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, Vector3, VisibilityState } from '@iwsdk/core';
import { setGoal, setWindows } from '../goal.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import type { DirectorSystem } from './director.js';
import type { Wires } from './fire.js';
import { familyWindow, showFamily } from './family.js';
import { flyToPerch } from './flight.js';
import { makeGlow, mergeByMaterial } from './fx.js';
import { CREDITS, HEADLINES, LINES, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, type Keepers } from './opening.js';
import { shoulderEye } from './people.js';
import { WEATHER } from './stage.js';

/**
 * S11, noon (S11): the rain stops and the sun gets
 * through the bear; the chosen person walks to their family's window, and
 * inside is their nine-year-old self with their young parents. The grey
 * feather taken to the glass makes the child laugh (optional). Then the
 * notebook, a groan from the big bank and water between its stones: where
 * the first part ends, with its credits (S31, as much of it as two words
 * allow).
 */

export { showFamily };

/**
 * A point toward a far target (a window across the street) but within a seated arm's reach of the eye: where the feather is
 * given; from there it goes on by itself.
 */
export function towardInReach(eye: Vector3, target: Vector3): Vector3 {
  const way = target.clone().sub(eye);
  const far = way.length();
  return eye.clone().addScaledVector(way.normalize(), Math.min(0.55, far)).add(new Vector3(0, -0.12, 0));
}

/** S11: noon; the family's window; the notebook; the groan of the bank. */
export async function s11(d: DirectorSystem, cast: CityCast, keepers: Keepers, w: Wires, persona: PersonaId): Promise<void> {
  d.chapter('S11');
  // The rain stops; the first sun through the bear's side; it backs off two steps.
  d.rain.on = false;
  const sun = makeGlow(d.world, 0xfff0c0, 6);
  sun.position.set(-4, 30, 60);
  (sun.material as MeshBasicMaterial).opacity = 0;
  d.stage.own('city', sun);
  d.bear.steps -= 2;
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 3);
    d.stage.blendWeather(WEATHER.rain2008, WEATHER.noon2008, k);
    (sun.material as MeshBasicMaterial).opacity = 0.6 * k;
    return k >= 1;
  });
  // The person walks to their family's window, the bird on their shoulder.
  // Their room and its lamp are made in the dark of the fade (a light added in plain view would stall a frame).
  await d.rig.fadeTo(1);
  const room = await familyWindow(d, w, persona);
  const watcher = keepers.watcher;
  const NOON = 'NOON · THE FAMILY WINDOW';
  setWindows(cast.windows.lit, cast.windows.total);
  setGoal({ where: NOON, now: 'Ride to the window you are keeping lit.' });
  const toward = Math.atan2(-w.facing.x, -w.facing.z);
  watcher.at(room.front.x, 0.15, room.front.z, toward);
  watcher.pose = 'idle';
  d.notebook.mesh.visible = false;
  // The room is alive before anyone looks in (family.ts: the three breathe, look and nod).
  // The bird takes off across the square toward the window, and lands on the person's shoulder.
  await flyToPerch(d, shoulderEye(watcher, new Vector3()), toward + Math.PI);
  await d.captions.say('S11-1', watcher.head(new Vector3()), 0.25);
  // The grey feather to the glass (optional): the child laughs and the light grows warm.
  const glassAt = new Vector3();
  room.glass.getWorldPosition(glassAt);
  const ear = d.marker(towardInReach(d.eyeAt, glassAt), 'FamilyGlassListener');
  setListener(ear, 0.3);
  setV2Targets([ear]);
  setGoal({ where: NOON, now: 'Carry the grey feather to the glass.' });
  const word = await Promise.race([d.nextWord(WORDS.freshBread), d.wait(9).then(() => '')]);
  d.cancelWord();
  setV2Targets([]);
  setGoal({ where: NOON, now: 'Look: the windows you kept are still lit.' });
  if (word === WORDS.freshBread) {
    room.child.pose = 'wave';
    room.warm();
  }
  if (room.child.pose !== 'wave') room.child.pose = 'talk';
  await d.captions.say('S11-2', room.child.head(new Vector3()), 0.25);
  room.child.pose = 'idle';
  await d.captions.say('S11-3', watcher.head(new Vector3()), 0.25);
  // The notebook: both headlines rewritten.
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
  ]);
  d.sounds.play('paper', 0.7);
  const eye = d.eyeAt.clone();
  const ahead = new Vector3(0, 0, -1).applyQuaternion(d.player.head.quaternion).setY(0).normalize();
  d.notebook.mesh.position.copy(eye).addScaledVector(ahead, 0.45).add(new Vector3(0, -0.15, 0));
  d.notebook.mesh.lookAt(eye);
  await d.wait(3.5);
  d.notebook.mesh.visible = false;
  // A deep groan from the big bank; water seeps between its stones.
  await flyToPerch(d, CITY.shoulder.clone(), Math.PI);
  showFamily(false);
  const water = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0x4a6a80, transparent: true, opacity: 0.55, depthWrite: false }));
  water.name = 'Seep';
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.95, -20.2);
  water.pointerEvents = 'none';
  d.world.createTransformEntity(water, { persistent: true });
  d.stage.own('city', water);
  const doors = [d.stage.node('city', 'bank_door_left'), d.stage.node('city', 'bank_door_right')];
  d.sounds.play('bank_creak', 1.0);
  const seep = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - seep) / 3.5);
    water.scale.set(1 + 5 * k, 1 + 3 * k, 1);
    for (const door of doors) if (door != null) door.position.y = 1.19 + Math.sin((d.now - seep) * 40) * 0.006 * (1 - k);
    return k >= 1;
  });
  void cast;
}

/** The first part's credits (S31's order, with what two words allow), then out of the headset. */
export async function firstCredits(d: DirectorSystem, cast: CityCast): Promise<void> {
  d.chapter('firstCredits');
  const head = d.player.head;
  const before = d.eyeAt.clone();
  const ahead = new Vector3(0, 0, -1).applyQuaternion(head.quaternion).setY(0).normalize();
  const spot = before.clone().addScaledVector(ahead, 1.1);
  d.stage.blendWeather(WEATHER.noon2008, WEATHER.evening2041, 0.6);
  // The evening square: the two feathers fall, one line each.
  for (const [word, line] of [
    [WORDS.safetyNet, CREDITS.safetyNet],
    [WORDS.firewall, CREDITS.firewall],
    [WORDS.bailOut, CREDITS.bailOut],
    [WORDS.primeThePump, CREDITS.primeThePump],
  ] as const) {
    if (!parrotWords.has(word)) continue;
    await d.captions.show(line, spot, 0, line.length);
  }
  const lit = cast.windows.lit + 1;
  await d.captions.show(`Windows lit: ${lit} of 13.`, spot, 0);
  await d.captions.show(CREDITS.secondTry, spot, 0);
  await d.captions.show(CREDITS.simplified, spot, 0);
  // Last, in the dark, young Gray's voice.
  await d.rig.fadeTo(1);
  const last = LINES['E-T'];
  if (import.meta.env.DEV) console.info(`[say] E-T ${last.speaker}: ${last.text}`);
  await d.captions.show(`${last.speaker}: ${last.text}`, spot, 0, last.text.length, true);
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
