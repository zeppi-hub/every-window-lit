import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, Vector3, VisibilityState } from '@iwsdk/core';
import { parrotWords, setListener } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import type { DirectorSystem } from './director.js';
import type { Wires } from './fire.js';
import { makeGlow, mergeByMaterial } from './fx.js';
import { CREDITS, HEADLINES, LINES, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, type Keepers } from './opening.js';
import { type Person, shoulderEye } from './people.js';
import { WEATHER } from './stage.js';

/**
 * S11, noon (META_VR_V2_TASARIM.md, S11): the rain stops and the sun gets
 * through the bear; the chosen person walks to their family's window, and
 * inside is their nine-year-old self with their young parents. The grey
 * feather taken to the glass makes the child laugh (optional). Then the
 * notebook, a groan from the big bank and water between its stones: where
 * the first part ends, with its credits (S31, as much of it as two words
 * allow).
 */

/** The family's lit window: a bay standing out from their facade, warm inside, the three of them in it. */
function familyWindow(d: DirectorSystem, w: Wires, persona: PersonaId): { glass: Mesh; light: MeshStandardMaterial; child: ReturnType<DirectorSystem['people']['add']>; front: Vector3 } {
  const bay = new Group();
  bay.name = 'FamilyWindow';
  const light = new MeshStandardMaterial({ color: 0xf2dcb4, emissive: 0xffc878, emissiveIntensity: 0.35, roughness: 0.9, side: DoubleSide });
  const frame = new MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.7 });
  const W = 2.6;
  const H = 2.3;
  const D = 1.6;
  const back = new Mesh(new PlaneGeometry(W, H), light);
  back.position.set(0, H / 2, -D / 2);
  const left = new Mesh(new PlaneGeometry(D, H), light);
  left.rotation.y = Math.PI / 2;
  left.position.set(-W / 2, H / 2, 0);
  const right = left.clone();
  right.position.x = W / 2;
  const ceiling = new Mesh(new PlaneGeometry(W, D), light);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, 0);
  const floor = new Mesh(new PlaneGeometry(W, D), new MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  const table = new Mesh(new BoxGeometry(0.9, 0.06, 0.6), frame);
  table.position.set(0.4, 0.72, -0.2);
  const sill = new Mesh(new BoxGeometry(W + 0.2, 0.12, 0.2), frame);
  sill.position.set(0, 0.06, D / 2);
  const lintel = sill.clone();
  lintel.position.y = H + 0.06;
  const glass = new Mesh(new PlaneGeometry(W, H), new MeshBasicMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.16, depthWrite: false }));
  glass.name = 'FamilyGlass';
  glass.position.set(0, H / 2, D / 2);
  bay.add(back, left, right, ceiling, floor, table, sill, lintel, glass);
  mergeByMaterial(bay);
  // Out from the facade, at the ground, facing the square.
  const at = w.family.clone().addScaledVector(w.facing, D / 2 + 0.05);
  bay.position.copy(at);
  bay.rotation.y = Math.atan2(w.facing.x, w.facing.z);
  bay.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(bay, { persistent: true });
  d.stage.own('city', bay);
  // The child (the person at nine) and the young parents, looking out.
  const facing = Math.atan2(w.facing.x, w.facing.z);
  const place = (x: number, z: number) => at.clone().add(new Vector3(x, 0, z).applyAxisAngle(new Vector3(0, 1, 0), facing));
  const child = d.people.add({ model: persona, size: 0.62 });
  const p0 = place(-0.3, 0.35);
  child.at(p0.x, p0.y, p0.z, facing);
  const mother = d.people.add({ model: 'crowd_woman_b', size: 0.98 });
  const p1 = place(0.5, -0.35);
  mother.at(p1.x, p1.y, p1.z, facing);
  const father = d.people.add({ model: 'crowd_man_casual' });
  const p2 = place(-0.85, -0.45);
  father.at(p2.x, p2.y, p2.z, facing);
  const front = w.family.clone().addScaledVector(w.facing, D + 1.1);
  family = { bay, people: [child, mother, father] };
  return { glass, light, child, front };
}

/** The family's window and the three in it, made at noon (S11). */
let family: { bay: Object3D; people: Person[] } | null = null;

/** Show or hide the family's window and the three in it: seen only when the bird is there (S11, S16, S30), it is not drawn from across the square. */
export function showFamily(on: boolean): void {
  if (family == null) return;
  family.bay.visible = on;
  for (const p of family.people) p.pose = on ? 'idle' : 'hidden';
}

/** S11: noon; the family's window; the notebook; the groan of the bank. */
export async function s11(d: DirectorSystem, cast: CityCast, keepers: Keepers, w: Wires, persona: PersonaId): Promise<void> {
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
  const room = familyWindow(d, w, persona);
  const watcher = keepers.watcher;
  const toward = Math.atan2(-w.facing.x, -w.facing.z);
  await d.rig.fadeTo(1);
  watcher.at(room.front.x, 0.15, room.front.z, toward);
  watcher.pose = 'idle';
  d.notebook.mesh.visible = false;
  d.rig.place(shoulderEye(watcher, new Vector3()), toward + Math.PI);
  await d.rig.fadeTo(0);
  await d.captions.say('S11-1', watcher.head(new Vector3()), 0.25);
  // The grey feather to the glass (optional): the child laughs and the light grows warm.
  const glassAt = new Vector3();
  room.glass.getWorldPosition(glassAt);
  const ear = d.marker(glassAt, 'FamilyGlassListener');
  setListener(ear, 0.5);
  setV2Targets([room.glass]);
  const word = await Promise.race([d.nextWord(WORDS.freshBread), d.wait(9).then(() => '')]);
  d.cancelWord();
  setV2Targets([]);
  if (word === WORDS.freshBread) {
    room.child.pose = 'wave';
    room.light.emissiveIntensity = 0.75;
  }
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
  await d.rig.move(CITY.shoulder, Math.PI);
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
  const off = world.visibilityState.subscribe((state) => {
    if (state !== VisibilityState.NonImmersive) return;
    off();
    window.location.reload();
  });
  world.exitXR();
}
