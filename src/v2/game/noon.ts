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
 * S11, noon (S11): the rain stops and the sun gets
 * through the bear; the chosen person walks to their family's window, and
 * inside is their nine-year-old self with their young parents. The grey
 * feather taken to the glass makes the child laugh (optional). Then the
 * notebook, a groan from the big bank and water between its stones: where
 * the first part ends, with its credits (S31, as much of it as two words
 * allow).
 */

/** What the family's window gives the scene: the glass to bring a feather to, a way to warm its light, the child, and where the person stands. */
interface FamilyRoom {
  glass: Mesh;
  warm: () => void;
  child: Person;
  front: Vector3;
}

/**
 * The family's lit window. Maya's family is in their own bakery: the one
 * shop of the square with a room behind its glass (art/v2/mahalle: the
 * counter, the baker's spot), so the three are put in there, seen through
 * the real shop window. Leo's and Sam's homes have no room behind their
 * facades, so a window is built out from the wall: a frame, glazing bars,
 * curtains drawn back, a warm room behind.
 */
function familyWindow(d: DirectorSystem, w: Wires, persona: PersonaId): FamilyRoom {
  const glow = makeGlow(d.world, 0xffc878, 0.45);
  (glow.material as MeshBasicMaterial).opacity = 0.05;
  const warm = () => {
    (glow.material as MeshBasicMaterial).opacity = 0.16;
  };
  if (persona === 'maya') {
    const baker = d.stage.point('city', 'spot_baker', new Vector3());
    // Facing out to the square (east, +x).
    const east = Math.PI / 2;
    const child = d.people.add({ model: 'maya', size: 0.62 });
    // Behind the glass of the shop door, in full view.
    child.at(-21.75, 0.15, 1.55, east);
    const mother = d.people.add({ model: 'crowd_woman_b', size: 0.98 });
    mother.at(-22.6, 0.15, -0.8, east - 0.3);
    const father = d.people.add({ model: 'crowd_man_casual' });
    father.at(baker.x, baker.y, baker.z, east);
    glow.position.set(-22.6, 2.3, 0.6);
    const glass = new Mesh(new PlaneGeometry(1.6, 1.8), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    glass.name = 'FamilyGlass';
    glass.position.set(-21.15, 1.1, 1.3);
    glass.rotation.y = east;
    glass.pointerEvents = 'none';
    d.world.createTransformEntity(glass, { persistent: true });
    d.stage.own('city', glow, glass);
    family = { bay: glow, people: [child, mother, father] };
    return { glass, warm, child, front: new Vector3(-19.6, 0.15, 1.2) };
  }
  const bay = new Group();
  bay.name = 'FamilyWindow';
  const wall = new MeshStandardMaterial({ color: 0xc8a47c, emissive: 0xffb060, emissiveIntensity: 0.18, roughness: 0.9, side: DoubleSide });
  const frame = new MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.7 });
  const cloth = new MeshStandardMaterial({ color: 0x7a2a2a, roughness: 0.95, side: DoubleSide });
  const W = 2.4;
  const H = 2.1;
  const D = 1.4;
  const sillY = 0.7;
  const back = new Mesh(new PlaneGeometry(W, H + sillY), wall);
  back.position.set(0, (H + sillY) / 2, -D / 2);
  const left = new Mesh(new PlaneGeometry(D, H + sillY), wall);
  left.rotation.y = Math.PI / 2;
  left.position.set(-W / 2, (H + sillY) / 2, 0);
  const right = left.clone();
  right.position.x = W / 2;
  const ceiling = new Mesh(new PlaneGeometry(W, D), wall);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H + sillY, 0);
  const floor = new Mesh(new PlaneGeometry(W, D), new MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  // The window itself: the wall below the sill, the frame round the glass, two glazing bars, curtains drawn back.
  const apron = new Mesh(new BoxGeometry(W + 0.3, sillY, 0.12), new MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.9 }));
  apron.position.set(0, sillY / 2, D / 2);
  const sill = new Mesh(new BoxGeometry(W + 0.3, 0.08, 0.26), frame);
  sill.position.set(0, sillY, D / 2 + 0.04);
  const lintel = new Mesh(new BoxGeometry(W + 0.3, 0.14, 0.16), frame);
  lintel.position.set(0, sillY + H, D / 2);
  const postL = new Mesh(new BoxGeometry(0.12, H, 0.14), frame);
  postL.position.set(-W / 2 - 0.09, sillY + H / 2, D / 2);
  const postR = postL.clone();
  postR.position.x = W / 2 + 0.09;
  const barV = new Mesh(new BoxGeometry(0.05, H, 0.05), frame);
  barV.position.set(0, sillY + H / 2, D / 2 + 0.01);
  const barH = new Mesh(new BoxGeometry(W, 0.05, 0.05), frame);
  barH.position.set(0, sillY + H * 0.62, D / 2 + 0.01);
  const curtainL = new Mesh(new PlaneGeometry(0.42, H), cloth);
  curtainL.position.set(-W / 2 + 0.24, sillY + H / 2, D / 2 - 0.12);
  const curtainR = curtainL.clone();
  curtainR.position.x = W / 2 - 0.24;
  const table = new Mesh(new BoxGeometry(0.9, 0.06, 0.6), frame);
  table.position.set(0.4, 0.72, -0.25);
  const glass = new Mesh(new PlaneGeometry(W, H), new MeshBasicMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.14, depthWrite: false }));
  glass.name = 'FamilyGlass';
  glass.position.set(0, sillY + H / 2, D / 2);
  bay.add(back, left, right, ceiling, floor, apron, sill, lintel, postL, postR, barV, barH, curtainL, curtainR, table, glass);
  mergeByMaterial(bay);
  // Out from the facade, at the ground, facing the square.
  const at = w.family.clone().addScaledVector(w.facing, D / 2 + 0.05);
  bay.position.copy(at);
  bay.rotation.y = Math.atan2(w.facing.x, w.facing.z);
  bay.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(bay, { persistent: true });
  d.stage.own('city', bay, glow);
  glow.position.copy(at).add(new Vector3(0, 2.0, 0));
  // The child (the person at nine) and the young parents, looking out.
  const facing = Math.atan2(w.facing.x, w.facing.z);
  const place = (x: number, z: number) => at.clone().add(new Vector3(x, 0, z).applyAxisAngle(new Vector3(0, 1, 0), facing));
  const child = d.people.add({ model: persona, size: 0.62 });
  const p0 = place(0.1, 0.35);
  child.at(p0.x, p0.y, p0.z, facing);
  const mother = d.people.add({ model: 'crowd_woman_b', size: 0.98 });
  const p1 = place(0.5, -0.3);
  mother.at(p1.x, p1.y, p1.z, facing);
  const father = d.people.add({ model: 'crowd_man_casual' });
  const p2 = place(-0.4, -0.35);
  father.at(p2.x, p2.y, p2.z, facing);
  const front = w.family.clone().addScaledVector(w.facing, D + 1.7);
  family = { bay, people: [child, mother, father] };
  return { glass, warm, child, front };
}

/** The family's window and the three in it, made at noon (S11). */
let family: { bay: Object3D; people: Person[] } | null = null;

/** Show or hide the family's window and the three in it: seen only when the bird is there (S11, S16, S30), it is not drawn from across the square. */
export function showFamily(on: boolean): void {
  if (family == null) return;
  family.bay.visible = on;
  for (const p of family.people) p.pose = on ? 'idle' : 'hidden';
}

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
  const ear = d.marker(towardInReach(d.eyeAt, glassAt), 'FamilyGlassListener');
  setListener(ear, 0.3);
  setV2Targets([ear]);
  const word = await Promise.race([d.nextWord(WORDS.freshBread), d.wait(9).then(() => '')]);
  d.cancelWord();
  setV2Targets([]);
  if (word === WORDS.freshBread) {
    room.child.pose = 'wave';
    room.warm();
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
