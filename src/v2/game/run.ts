import { type AnimationAction, AnimationClip, AnimationMixer, Color, Quaternion, Texture, CanvasTexture, CylinderGeometry, DoubleSide, type Entity, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, OneHandGrabbable, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { setDeskMode } from '../desk-hands.js';
import { setGoal, setWindows } from '../goal.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { createPolicyCard, drawPolicyCard, POLICY_CARD_SIZE } from '../policy-card.js';
import { broken, type Collapse, cracked, holds, mercyFor, type Net, netTarget, RUN, stepNet, warnOf } from '../run-rules.js';
import { setV2Targets } from '../step-targets.js';
import { netTexture } from './circus.js';
import { Vignette } from './circus-show.js';
import { mergeByMaterial } from './fx.js';
import { wordBadge } from '../icons.js';
import type { DirectorSystem } from './director.js';
import { BOSSES, CARDS, HEADLINES, PERSONAS, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, propWithClips } from './opening.js';
import type { Person } from './people.js';

/**
 * S07, the first fight: THE RUN. Gray has said "safety net"; the pavement in
 * front of the bank turns to six panes of glass over a deep drop, the queue
 * standing on them, and the crowd surges at the door while the windows round
 * the square go out. The player, put on a street lamp's arm, holds the gold
 * rope a gold net hangs from; pulling it sideways slides the net along under
 * the glass (the rules in src/v2/run-rules.ts). First a rehearsal: one pane
 * cracks and waits, with no clock, until the net is under it, and its people
 * drop into the net. Then the fight: one pane after another cracks, each
 * sooner than the last, and in the last wave (after the magpie's whisper)
 * two at once. A pane with the net under it when it drops holds its people
 * (its piece of net stays, gold); one without sends them running back from
 * the edge, and a window goes out. Two lost panes and the crowd breaks the
 * door: a window goes out for good and the fight is played again (after
 * three lost fights the panes crack longer and the net holds from further
 * off). Won: PANIC CALMED, the windows light again, the queue melts, the
 * card and the notebook.
 */

/**
 * The street lamp the player is put on, facing the bank front (north); the eye above its arm (m). A low lamp, 6 m from the
 * glass sections, so the fight on the pavement is about 25 degrees below the eye, not 40 (clear of the fountain and the sailor).
 */
const LAMP_FOOT = new Vector3(-4.0, 0.15, -9.6);
export const LAMP_EYE = new Vector3(-4.0, 2.9, -10.6);
/** The eye on the lamp's other arm, toward the square (S10): the post and lanterns stay behind it there too. */
export const LAMP_EYE_SOUTH = new Vector3(-4.0, 2.9, -8.6);
/** The panes lie along the bank-front pavement, where the queue stands (bank_queue_08 … _20): their row, and the ground. */
const SECTION_Z = -16.4;
const GROUND = 0.15;
/** The rope's slide in front of the eye (m, from the eye: left to right). */
const ROPE_HALF = 0.35;
const ROPE_DOWN = 0.32;
const ROPE_AHEAD = 0.42;
/** The pause between waves (s). */
const BETWEEN = 1.0;
/** How many windows round the square the run puts out while it lasts. */
const RUN_DARKENS = 3;
const WHERE = 'TROUBLE 1 OF 6 · THE RUN';
const UP = new Vector3(0, 1, 0);
const WHITE = new Color(1, 1, 1);
const RED = new Color(1, 0.25, 0.18);
/** The net drawn brighter while it is under a cracking pane (it is not tone mapped, so above 1 glows). */
const NET_ON = new Color(1.7, 1.45, 0.8);

interface Section {
  index: number;
  glass: Mesh;
  cracks: Mesh;
  hole: Mesh;
  /** The piece of gold net that stays under the pane once it has held. */
  kept: Mesh;
  people: Person[];
  home: Vector3[];
  /** Done in an earlier fight (the rehearsal pane), so a replay leaves it as it is. */
  settled: boolean;
}

/** A dark, deep-looking hole under the glass. */
function holeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(128, 128, 10, 128, 128, 180);
    r.addColorStop(0, '#000000');
    r.addColorStop(0.7, '#05070a');
    r.addColorStop(1, '#262b33');
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** White cracks across a pane, drawn once. */
function crackTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    const centres = [
      [128, 128],
      [70, 90],
      [190, 170],
    ];
    for (const [cx, cy] of centres)
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2 + cx * 0.01;
        g.beginPath();
        g.moveTo(cx, cy);
        let x = cx;
        let y = cy;
        for (let s = 0; s < 4; s += 1) {
          x += Math.cos(a + (s % 2 === 0 ? 0.2 : -0.25)) * 26;
          y += Math.sin(a + (s % 2 === 0 ? 0.2 : -0.25)) * 26;
          g.lineTo(x, y);
        }
        g.stroke();
      }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A plain street lamp: post, arm toward the bank, lantern. */
function streetLamp(d: DirectorSystem): Group {
  const lamp = new Group();
  lamp.name = 'StreetLamp';
  const iron = new MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.5, metalness: 0.6 });
  const post = new Mesh(new CylinderGeometry(0.07, 0.1, 2.6, 12), iron);
  post.position.set(0, 1.3, 0);
  // The arm reaches toward the bank; the bird sits at its tip, the lantern hangs behind, near the post, out of the way of the view.
  const arm = new Mesh(new CylinderGeometry(0.03, 0.03, 1.0, 8), iron);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 2.55, -0.5);
  const lantern = new Mesh(new CylinderGeometry(0.16, 0.1, 0.34, 8), new MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 1.4, roughness: 0.3 }));
  lantern.position.set(0, 2.3, -0.15);
  // The other arm, toward the square, with its own lantern near the post.
  const arm2 = arm.clone();
  arm2.position.z = 0.5;
  const lantern2 = lantern.clone();
  lantern2.position.z = 0.15;
  lamp.add(post, arm, lantern, arm2, lantern2);
  mergeByMaterial(lamp);
  lamp.position.copy(LAMP_FOOT);
  lamp.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(lamp, { persistent: true });
  return lamp;
}

type MagpieClip = 'idle' | 'talk' | 'flap';

/** The magpie (art/v2/saksagan): idle on a perch, talk while it whispers, flap as it flies; a little larger than life, to be seen from the lamp. */
export function magpie(d: DirectorSystem): Group {
  const bird = new Group();
  bird.name = 'Magpie';
  const { root, clips } = propWithClips('magpie');
  root.scale.setScalar(1.5);
  bird.add(root);
  const mixer = new AnimationMixer(root);
  const actions = new Map<MagpieClip, AnimationAction>();
  for (const name of ['idle', 'talk', 'flap'] as const) {
    const clip = AnimationClip.findByName(clips, name);
    if (clip != null) actions.set(name, mixer.clipAction(clip));
  }
  let playing: MagpieClip | null = null;
  bird.userData.clip = 'idle';
  d.each((delta) => {
    if (!bird.visible) return;
    const want = bird.userData.clip as MagpieClip;
    if (want !== playing) {
      const next = actions.get(want);
      const before = playing == null ? null : actions.get(playing);
      if (next != null) {
        next.reset().play();
        if (before != null) next.crossFadeFrom(before, 0.15, false);
      }
      playing = want;
    }
    mixer.update(delta);
  });
  d.world.createTransformEntity(bird, { persistent: true });
  return bird;
}

/** The fight, from Gray's "safety net" to the card on the steps; the player ends on Gray's shoulder. */
export async function s07(d: DirectorSystem, cast: CityCast, persona: PersonaId, watcher: Person): Promise<void> {
  d.chapter('S07');
  const head = d.player.head;
  // The word unwinds from his mouth into a gold rope; the boss's name over the bank.
  void d.gold.show(WORDS.safetyNet.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head, wordBadge(WORDS.safetyNet));
  await d.captions.say('S07-1', CITY.graySays, 0);

  // The pavement in front of the bank turns to glass over a drop; the crowd surges at the door, and the windows round the square go out.
  const sections = buildSections(d, cast);
  const umbrellas = umbrellasFollow(d, cast);
  for (const p of cast.crowd) p.pose = 'wave';
  const windowsTo = (lit: number, seconds: number): Promise<void> => {
    const from = cast.windows.lit;
    const start = d.now;
    return d.until(() => {
      const k = Math.min(1, (d.now - start) / seconds);
      cast.windows.lit = Math.round(from + (lit - from) * k);
      setWindows(cast.windows.lit, cast.windows.total);
      return k >= 1;
    });
  };
  const running = () => Math.max(0, cast.windows.total - d.day.darkWindows - RUN_DARKENS);
  void windowsTo(running(), 2.5);
  const lamp = streetLamp(d);
  const bird = magpie(d);
  bird.position.set(-9.9, 1.25, -15.3);
  bird.visible = false;
  d.stage.own('city', lamp, bird);
  await d.rig.move(LAMP_EYE, 0);
  void d.gold.show(BOSSES.run.name, new Vector3(-5.2, 4.6, -20.5), 3.2, 2.6, new Vector3(0, 0.15, 0), head);

  // The gold rope in the claws, and the gold net under the glass that hangs from it.
  const netMaterial = new MeshBasicMaterial({ map: netTexture('#f2c14e', 10), transparent: true, alphaTest: 0.3, side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const net = new Mesh(new PlaneGeometry(RUN.netWidth, RUN.sectionDepth + 0.1), netMaterial);
  net.name = 'GoldNet';
  net.rotation.x = -Math.PI / 2;
  net.position.set(netTarget(0.5), GROUND + 0.008, SECTION_Z);
  net.pointerEvents = 'none';
  d.world.createTransformEntity(net, { persistent: true });
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, emissive: 0x8a6418, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.8 });
  const grip = new Mesh(new CylinderGeometry(0.022, 0.022, 0.16, 10), gold);
  grip.name = 'GoldRopeGrip';
  grip.rotation.z = Math.PI / 2;
  // Two lines from the grip to the net's near corners: the net plainly hangs from what the hand holds.
  const lines = [0, 1].map(() => {
    const line = new Mesh(new CylinderGeometry(0.01, 0.01, 1, 6), gold);
    line.name = 'GoldRope';
    line.pointerEvents = 'none';
    d.world.createTransformEntity(line, { persistent: true });
    return line;
  });
  const a = LAMP_EYE.clone().add(new Vector3(-ROPE_HALF, -ROPE_DOWN, -ROPE_AHEAD));
  const b = LAMP_EYE.clone().add(new Vector3(ROPE_HALF, -ROPE_DOWN, -ROPE_AHEAD));
  const handle: Entity = d.world.createTransformEntity(grip, { persistent: true });
  handle.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: a.toArray(), b: b.toArray(), grip: [0, 0, 0], reach: 0.09, progress: 0.5, rest: -1 });
  d.stage.own('city', net, grip, ...lines);
  setV2Targets([grip]);
  setDeskMode('one');
  const state: Net = { x: net.position.x, v: 0 };
  const at = new Vector3();
  const tie = new Vector3();
  let creakIn = 0;
  const follow = d.each((delta) => {
    const progress = handle.getValue(PathHandle, 'progress') ?? 0.5;
    stepNet(state, netTarget(progress), delta);
    net.position.x = state.x;
    // The rope creaks while the net is pulled along fast.
    creakIn -= delta;
    if (Math.abs(state.v) > 2 && creakIn <= 0) {
      d.sounds.play('rope_creak', 0.35, 0.9 + Math.random() * 0.2);
      creakIn = 0.7;
    }
    grip.getWorldPosition(at);
    lines.forEach((line, i) => {
      tie.set(state.x + (i === 0 ? -1 : 1) * RUN.netWidth * 0.5, GROUND + 0.01, SECTION_Z + RUN.sectionDepth * 0.5).sub(at);
      line.position.copy(at).addScaledVector(tie, 0.5);
      line.scale.set(1, tie.length(), 1);
      line.quaternion.setFromUnitVectors(UP, tie.normalize());
    });
  });
  const vignette = new Vignette(head);
  const dim = d.each((delta) => vignette.update(delta));

  const game = playMiniGame(new MiniGame(WORDS.safetyNet, [{ name: 'the run' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const doors = [d.stage.node('city', 'bank_door_left'), d.stage.node('city', 'bank_door_right')];
  const phase = () => game.phase;
  let rehearsed = false;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    // A dev skip ends the wait early; play only once the stage has really begun.
    if (phase() !== 'playing') continue;
    resetSections(sections, doors);
    const losses = game.failuresOf(0);
    const play: Play = { sections, net: state, netMaterial, bird, hint: losses >= HINT_AFTER, mercy: mercyFor(losses), paused: () => minis?.playPaused ?? false, held: sections.filter((s) => s.settled).length, lost: 0, dimOne: () => {
        cast.windows.lit = Math.max(0, cast.windows.lit - 1);
        setWindows(cast.windows.lit, cast.windows.total);
      } };
    if (play.mercy && import.meta.env.DEV) console.info(`[run] after ${losses} lost fights: the panes crack longer, the net holds from further off`);
    if (!rehearsed) {
      tellGoal('Pull the rope: put the net under the crack.', play.held);
      await rehearse(d, sections[RUN.rehearsal], play);
      rehearsed = true;
      play.held += 1;
    }
    const won = await fight(d, play);
    if (won) {
      game.win();
      break;
    }
    // The crowd breaks the door; a window goes out for good.
    d.sounds.play('crowd_boo', 0.8);
    d.sounds.play('crowd_gasp', 0.7);
    d.sounds.bed('heartbeat_loop', 0.7);
    vignette.set(0.6);
    const start = d.now;
    for (const s of sections) for (const p of s.people) if (p.pose !== 'hidden') p.pose = 'wave';
    await d.until(() => {
      const k = Math.min(1, (d.now - start) / 0.8);
      if (doors[0] != null) doors[0].rotation.y = 1.3 * k;
      if (doors[1] != null) doors[1].rotation.y = -1.3 * k;
      return k >= 1;
    });
    d.day.darkWindows += 1;
    await windowsTo(running(), 0.8);
    if (import.meta.env.DEV) console.info(`[run] the door broke: ${play.lost} panes lost; ${d.day.darkWindows} windows dark for good`);
    await d.wait(0.6);
    vignette.set(1);
    d.sounds.bed('heartbeat_loop', 0);
    tellGoal('Try again: keep the net under each crack.', play.held);
    game.lose('two panes');
  }
  endMiniGame(game);
  follow();
  setV2Targets([]);
  d.sounds.bed('drum_roll_loop', 0);
  d.sounds.bed('heartbeat_loop', 0);

  // Won: they look down, see the net, and leave the queue; the windows light again.
  d.sounds.play('cymbal_hit', 0.7);
  d.sounds.play('cheer', 0.8);
  d.sounds.play('applause', 0.8, 1, 0.3);
  if (import.meta.env.DEV) console.info('[run] won: panic calmed');
  setGoal({ where: WHERE, now: 'Watch the queue melt away.', steps: [RUN.sections.length, RUN.sections.length] });
  if (import.meta.env.DEV) console.info('[goal] Watch the queue melt away.');
  void windowsTo(cast.windows.total - d.day.darkWindows, 2.0);
  await d.gold.show(BOSSES.run.won, new Vector3(-5.2, 2.6, -16.0), 2.6, 2.8, new Vector3(0, 0.2, 0), head);
  const leaving = cast.crowd.filter((p) => p.pose !== 'hidden');
  const start = d.now;
  const homes = leaving.map((p) => p.position.clone());
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 3.2);
    leaving.forEach((p, i) => {
      p.pose = 'walk';
      p.yaw = 0;
      p.stride += 0.02;
      p.position.set(homes[i].x, homes[i].y, homes[i].z + k * 5);
      if (k > 0.35 + (i % 5) * 0.12) p.pose = 'hidden';
    });
    return k >= 1;
  });
  umbrellas();
  dim();
  vignette.dispose();
  d.sounds.bed('crowd_murmur_loop', 0.15);
  for (const s of sections) for (const m of [s.glass, s.cracks, s.hole, s.kept]) m.visible = false;
  net.visible = false;
  for (const line of lines) line.visible = false;
  grip.visible = false;
  // The reporter has no part after the run.
  cast.reporter.pose = 'hidden';
  d.day.problem = 2;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;

  // Back on Gray's shoulder: the card floats up to be read, then lies on the steps; the notebook is rewritten.
  await d.rig.move(CITY.shoulder, Math.PI);
  setGoal({ where: WHERE, now: 'Read the card: what the word did.' });
  if (import.meta.env.DEV) console.info('[goal] Read the card: what the word did.');
  await showCard(d, 'safetyNet');
  d.notebook.write([{ text: HEADLINES.run, struck: HEADLINES.runSolved }]);
  await d.captions.say(PERSONAS[persona].firstRun, watcher.head(new Vector3()), 0.3);
}

/** Say what to do now in the fight, with the panes held so far of six. */
function tellGoal(now: string, held: number): void {
  setGoal({ where: WHERE, now, steps: [held, RUN.sections.length] });
  if (import.meta.env.DEV) console.info(`[goal] ${now} (${held}/${RUN.sections.length})`);
}

/** The card now lying on the steps. */
let lastCard: Object3D | null = null;

/** The card: in front of the eye long enough to read (and to take in the hand), then down on the steps. */
export async function showCard(d: DirectorSystem, which: keyof typeof CARDS): Promise<void> {
  // Only the newest card lies on the steps; the one before is picked up.
  if (lastCard != null) lastCard.visible = false;
  const { card, texture } = createPolicyCard();
  lastCard = card;
  const word: Record<keyof typeof CARDS, string> = { safetyNet: WORDS.safetyNet, firewall: WORDS.firewall, bailOut: WORDS.bailOut, primeThePump: WORDS.primeThePump };
  drawPolicyCard(texture, CARDS[which]);
  // The word's picture as a seal over the card's top edge (the card read without words).
  const badge = wordBadge(word[which]);
  if (badge != null) {
    const seal = new Texture(badge);
    seal.colorSpace = SRGBColorSpace;
    seal.needsUpdate = true;
    const mark = new Mesh(new PlaneGeometry(0.09, 0.09), new MeshBasicMaterial({ map: seal, transparent: true, depthWrite: false }));
    mark.name = 'CardSeal';
    mark.position.set(0, POLICY_CARD_SIZE.h / 2 + 0.01, 0.002);
    mark.pointerEvents = 'none';
    card.add(mark);
  }
  // In front of the eye wherever the bird is, a little low.
  const eye = d.eyeAt.clone();
  const ahead = new Vector3(0, 0, -1).applyQuaternion(d.player.head.getWorldQuaternion(new Quaternion())).setY(0).normalize();
  card.position.copy(eye).addScaledVector(ahead, 0.42).add(new Vector3(0, -0.12, 0));
  card.lookAt(eye);
  card.scale.setScalar(1.25);
  const entity = d.world.createTransformEntity(card, { persistent: true });
  entity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
  d.stage.own('city', card);
  setV2Targets([card]);
  d.sounds.play('paper', 0.7);
  await d.wait(9);
  setV2Targets([]);
  entity.removeComponent(OneHandGrabbable);
  card.position.set(CITY.grayAt.x - 0.6, 1.2, -21.0);
  card.rotation.set(-Math.PI / 2 + 0.25, 0, 0.3);
}

function buildSections(d: DirectorSystem, cast: CityCast): Section[] {
  const hole = holeTexture();
  const cracks = crackTexture();
  const keptMaterial = new MeshBasicMaterial({ map: netTexture('#f2c14e', 10), color: 0xb89a4a, transparent: true, alphaTest: 0.3, side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const sections = RUN.sections.map((x, index) => {
    const make = (material: MeshBasicMaterial, y: number, name: string) => {
      const mesh = new Mesh(new PlaneGeometry(RUN.sectionWidth - 0.04, RUN.sectionDepth), material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, SECTION_Z);
      mesh.pointerEvents = 'none';
      d.world.createTransformEntity(mesh, { persistent: true });
      d.stage.own('city', mesh);
      return mesh;
    };
    const holeMesh = make(new MeshBasicMaterial({ map: hole, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), GROUND + 0.003, 'GlassHole');
    const kept = make(keptMaterial, GROUND - 0.1, 'KeptNet');
    kept.visible = false;
    const glass = make(new MeshBasicMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.3, depthWrite: false }), GROUND + 0.012, 'GlassPane');
    const crackMesh = make(new MeshBasicMaterial({ map: cracks, transparent: true, opacity: 0, depthWrite: false }), GROUND + 0.015, 'GlassCracks');
    const people = cast.crowd.filter((p) => Math.abs(p.position.z - SECTION_Z) < RUN.sectionDepth / 2 && Math.abs(p.position.x - x) <= RUN.sectionWidth / 2);
    return { index, glass, cracks: crackMesh, hole: holeMesh, kept, people, home: people.map((p) => p.position.clone()), settled: false };
  });
  if (import.meta.env.DEV) console.info(`[run] people on the panes: ${sections.map((s) => s.people.length).join(' ')}`);
  return sections;
}

/** The queue's umbrellas (made with the city, one per person in the queue) go where their people go, and away with them. */
function umbrellasFollow(d: DirectorSystem, cast: CityCast): () => void {
  const group = d.world.scene.getObjectByName('QueueUmbrellas');
  const [canopies, sticks] = (group?.children ?? []) as InstancedMesh[];
  if (canopies == null || sticks == null) return () => {};
  const put = new Matrix4();
  const none = new Matrix4().makeScale(0, 0, 0);
  const place = (): void => {
    cast.crowd.forEach((p, k) => {
      if (k >= canopies.count) return;
      if (p.pose === 'hidden') {
        canopies.setMatrixAt(k, none);
        sticks.setMatrixAt(k, none);
        return;
      }
      canopies.setMatrixAt(k, put.makeTranslation(p.position.x + 0.12, p.position.y + 2.05, p.position.z + 0.08));
      sticks.setMatrixAt(k, put.makeTranslation(p.position.x + 0.12, p.position.y + 1.68, p.position.z + 0.08));
    });
    canopies.instanceMatrix.needsUpdate = true;
    sticks.instanceMatrix.needsUpdate = true;
  };
  const stop = d.each(place);
  return () => {
    stop();
    place();
  };
}

function resetSections(sections: Section[], doors: (Object3D | null)[]): void {
  for (const s of sections) {
    if (s.settled) continue;
    s.glass.visible = true;
    s.glass.position.y = GROUND + 0.012;
    (s.glass.material as MeshBasicMaterial).opacity = 0.3;
    s.cracks.visible = true;
    (s.cracks.material as MeshBasicMaterial).opacity = 0;
    (s.cracks.material as MeshBasicMaterial).color.copy(WHITE);
    s.hole.visible = true;
    s.kept.visible = false;
    s.people.forEach((p, i) => {
      p.position.copy(s.home[i]);
      p.pose = 'wave';
    });
  }
  for (const door of doors) if (door != null) door.rotation.y = 0;
}

/** What one fight needs and keeps count of. */
interface Play {
  sections: Section[];
  net: Net;
  netMaterial: MeshBasicMaterial;
  bird: Group;
  hint: boolean;
  mercy: boolean;
  paused: () => boolean;
  held: number;
  lost: number;
  /** A window round the square goes out (a pane lost). */
  dimOne: () => void;
}

/** The panes cracking now, so the drum and the net's glow follow the worst of them. */
const cracking = new Map<number, number>();

/** The drum rolls harder as the nearest drop comes; the net glows while it is under a cracking pane. */
function tension(d: DirectorSystem, play: Play): void {
  let worst = 0;
  let under = false;
  for (const [section, k] of cracking) {
    worst = Math.max(worst, k);
    if (holds(play.net.x, section, play.mercy)) under = true;
  }
  d.sounds.bed('drum_roll_loop', cracking.size === 0 ? 0 : 0.15 + 0.55 * worst);
  play.netMaterial.color.copy(under ? NET_ON : WHITE);
}

/** The rehearsal: the pane cracks halfway and waits, with no clock, for the net; held under it a moment, the glass drops into it. */
async function rehearse(d: DirectorSystem, s: Section, play: Play): Promise<void> {
  if (import.meta.env.DEV) console.info(`[run] rehearsal: pane ${s.index + 1} cracks and waits for the net`);
  // Dev only: a skip drops it into the net.
  let skipped = false;
  d.onSkip(() => {
    skipped = true;
  });
  await collapse(d, s, null, play, () => skipped);
  s.settled = true;
}

/** The waves after the rehearsal; false once two panes are lost. */
async function fight(d: DirectorSystem, play: Play): Promise<boolean> {
  let skipped = false;
  // Dev only: a skip wins the whole fight. The director forgets its skips whenever a wait ends, so each wait is armed afresh.
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  tellGoal('Keep the net under each crack before it drops.', play.held);
  arm();
  await d.wait(BETWEEN);
  for (let n = 0; n < RUN.waves.length && !skipped; n += 1) {
    const wave = RUN.waves[n];
    if (n === RUN.waves.length - 1) {
      // The last: the magpie lands by the queue and whispers; the crowd takes it up, and two panes crack at once.
      const first = RUN.sections[wave[0].section];
      play.bird.position.set(first - 0.6, 1.25, SECTION_Z + 1.2);
      play.bird.lookAt(LAMP_EYE);
      play.bird.visible = true;
      play.bird.userData.clip = 'talk';
      arm();
      await d.captions.say('S07-2', play.bird, 0.25);
      play.bird.userData.clip = 'idle';
      tellGoal('Two cracks: catch the first, then the second.', play.held);
    }
    arm();
    const results = await Promise.all(wave.map((c) => collapse(d, play.sections[c.section], c, play, () => skipped)));
    for (const held of results) {
      if (held) play.held += 1;
      else play.lost += 1;
    }
    if (broken(play.lost)) {
      play.bird.visible = false;
      return false;
    }
    tellGoal(n === RUN.waves.length - 2 ? 'Get ready: the magpie is coming.' : 'Keep the net under each crack before it drops.', play.held);
    arm();
    await d.wait(BETWEEN);
  }
  play.bird.visible = false;
  return true;
}

/**
 * One pane cracks, then the glass drops; true if the net was under it. With
 * no collapse given it is the rehearsal: the cracks stop halfway, and the
 * glass drops only once the net has been under it for a moment.
 */
function collapse(d: DirectorSystem, s: Section, c: Collapse | null, play: Play, skipped: () => boolean = () => false): Promise<boolean> {
  const warn = c == null ? Infinity : warnOf(c, play.mercy) + (play.hint ? 0.4 : 0);
  let t = 0;
  let settle = 0;
  let held: boolean | null = null;
  let after = 0;
  const glass = s.glass.material as MeshBasicMaterial;
  const cracks = s.cracks.material as MeshBasicMaterial;
  d.sounds.play('bank_creak', 0.7, 1.2);
  for (const p of s.people) p.pose = 'wave';
  if (import.meta.env.DEV) console.info(`[run] pane ${s.index + 1} cracks at x ${RUN.sections[s.index]}${c == null ? ', no clock' : `, drops in ${warn.toFixed(1)} s`}`);
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      cracking.delete(s.index);
      tension(d, play);
      if (result) play.netMaterial.color.copy(WHITE);
      done(result);
    };
    const stop = d.each((delta) => {
      if (play.paused()) return;
      t += delta;
      if (held == null) {
        // The cracks spread and the pane trembles, faster toward the end, going from white to red.
        const k = c == null ? 0.5 + 0.08 * Math.sin(t * 5) : cracked(t, warn);
        cracking.set(s.index, k);
        tension(d, play);
        cracks.opacity = 0.25 + 0.75 * k;
        cracks.color.copy(WHITE).lerp(RED, Math.max(0, (k - 0.4) / 0.6));
        s.glass.position.y = GROUND + 0.012 + Math.sin(t * (20 + 40 * k)) * 0.005 * k;
        for (const p of s.people) p.position.y = GROUND + Math.sin(t * 30 + p.position.x) * 0.012 * k;
        const under = holds(play.net.x, s.index, play.mercy);
        if (skipped()) held = true;
        else if (c == null) {
          settle = under ? settle + delta : 0;
          if (settle >= RUN.rehearsalSettle) held = true;
        }
        else if (t >= warn) held = under;
        if (held != null) {
          cracking.delete(s.index);
          tension(d, play);
          d.sounds.play('fall_whoosh', 0.6);
          if (held) {
            d.sounds.play('net_twang', 1, 1, 0.25);
            d.sounds.play('cheer', 0.5, 1, 0.35);
          } else {
            d.sounds.play('crowd_gasp', 0.9, 1, 0.2);
            play.dimOne();
          }
          if (import.meta.env.DEV) console.info(`[run] pane ${s.index + 1}: ${held ? 'held' : 'lost'} (net at ${play.net.x.toFixed(2)}, pane at ${RUN.sections[s.index]}, ${c == null ? 'rehearsal' : `${warn.toFixed(1)} s`})`);
        }
        return;
      }
      // The glass falls away into the dark; the people land in the net, or run back from the edge.
      after += delta;
      const k = Math.min(1, after / 0.5);
      s.glass.position.y = GROUND + 0.012 - k * 1.5;
      glass.opacity = 0.3 * (1 - k);
      cracks.opacity = 1 - k;
      if (k >= 1) {
        s.glass.visible = false;
        s.cracks.visible = false;
      }
      if (held) {
        // The net under them stays: a gold piece of it under the pane, the net dipping and springing back once.
        s.kept.visible = true;
        s.kept.position.x = RUN.sections[s.index];
      }
      s.people.forEach((p, i) => {
        if (held) {
          // In the net, a little lower, still: they look down and see it.
          p.position.y = GROUND - 0.1 * k - Math.sin(Math.min(1, after / 0.9) * Math.PI) * 0.12;
          p.pose = 'idle';
        } else {
          // They run back from the edge.
          p.pose = 'walk';
          p.yaw = 0;
          p.stride += delta * 2.2;
          p.position.set(s.home[i].x, GROUND, s.home[i].z + 2.4 * k);
        }
      });
      if (after > 0.9) finish(held);
    });
  });
}
