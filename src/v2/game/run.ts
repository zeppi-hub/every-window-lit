import { type AnimationAction, AnimationClip, AnimationMixer, Quaternion, Texture, CanvasTexture, CylinderGeometry, DoubleSide, type Entity, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, OneHandGrabbable, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { createPolicyCard, drawPolicyCard, POLICY_CARD_SIZE } from '../policy-card.js';
import { setV2Targets } from '../step-targets.js';
import { netTexture } from './circus.js';
import { mergeByMaterial } from './fx.js';
import { wordBadge } from '../icons.js';
import type { DirectorSystem } from './director.js';
import { BOSSES, CARDS, HEADLINES, PERSONAS, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, propWithClips } from './opening.js';
import type { Person } from './people.js';

/**
 * S07, the first fight: THE RUN (S07). Gray has
 * said "safety net"; the pavement in front of the bank turns to glass over
 * a deep drop, and the crowd surges at the door. The player, put on a
 * street lamp's arm, holds a gold rope (H5) that slides a gold net along
 * under the glass. Four sections give way, each sooner than the last, the
 * fourth after the magpie's whisper; a section with the net under it holds
 * its people, one without sends them running back. Two lost sections and
 * the crowd breaks the door: the fight is played again. Won: PANIC CALMED,
 * the queue melts, the card and the notebook.
 */

/** The street lamp the player is put on, facing the bank front (north); the eye above its arm (m). */
const LAMP_FOOT = new Vector3(-5.2, 0.15, -10.6);
export const LAMP_EYE = new Vector3(-5.2, 4.35, -11.6);
/** The eye on the lamp's other arm, toward the square (S10): the post and lanterns stay behind it there too. */
export const LAMP_EYE_SOUTH = new Vector3(-5.2, 4.35, -9.6);
/** The four glass sections on the bank-front pavement, where the queue stands (bank_queue_08 … _20). */
const SECTION_Z = -16.4;
const SECTION_X = [-1.6, -4.0, -6.4, -8.8] as const;
const SECTION = { w: 2.4, d: 2.0 } as const;
/** The gold net's travel along the front, its size, and how near a section's middle it must be to hold it (m). */
const NET_FROM = -9.4;
const NET_TO = -1.0;
const NET = { w: 2.6, d: 2.1 } as const;
const HOLD_HALF = 0.8;
/** The rope's slide in front of the eye (m, from the eye: left to right). */
const ROPE_HALF = 0.3;
const ROPE_DOWN = 0.32;
const ROPE_AHEAD = 0.42;

/** Which section gives way, in order, and how long its glass cracks first (s): each quicker than the last. */
const COLLAPSES = [
  { section: 1, warn: 3.4 },
  { section: 3, warn: 2.8 },
  { section: 0, warn: 2.2 },
  { section: 2, warn: 1.7 },
] as const;
/** The pause between sections (s). */
const BETWEEN = 1.2;
const UP = new Vector3(0, 1, 0);

interface Section {
  glass: Mesh;
  cracks: Mesh;
  hole: Mesh;
  people: Person[];
  home: Vector3[];
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
  const post = new Mesh(new CylinderGeometry(0.07, 0.1, 4.0, 12), iron);
  post.position.set(0, 2.0, 0);
  // The arm reaches toward the bank; the bird sits at its tip, the lantern hangs behind, near the post, out of the way of the view.
  const arm = new Mesh(new CylinderGeometry(0.03, 0.03, 1.0, 8), iron);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 3.95, -0.5);
  const lantern = new Mesh(new CylinderGeometry(0.16, 0.1, 0.34, 8), new MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 1.4, roughness: 0.3 }));
  lantern.position.set(0, 3.7, -0.15);
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

  // The pavement in front of the bank turns to glass over a drop; the crowd surges at the door.
  const sections = buildSections(d, cast);
  for (const p of cast.crowd) p.pose = 'wave';
  const lamp = streetLamp(d);
  const bird = magpie(d);
  bird.position.set(-9.9, 1.25, -15.3);
  bird.visible = false;
  d.stage.own('city', lamp, bird);
  await d.rig.move(LAMP_EYE, 0);
  void d.gold.show(BOSSES.run.name, new Vector3(-5.2, 4.6, -20.5), 3.2, 2.6, new Vector3(0, 0.15, 0), head);

  // The gold rope in the claws, and the gold net under the glass that follows it.
  const net = new Mesh(new PlaneGeometry(NET.w, NET.d), new MeshBasicMaterial({ map: netTexture('#f2c14e', 10), transparent: true, alphaTest: 0.3, side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  net.name = 'GoldNet';
  net.rotation.x = -Math.PI / 2;
  net.position.set((NET_FROM + NET_TO) / 2, 0.158, SECTION_Z);
  net.pointerEvents = 'none';
  d.world.createTransformEntity(net, { persistent: true });
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, emissive: 0x8a6418, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.8 });
  const grip = new Mesh(new CylinderGeometry(0.02, 0.02, 0.14, 10), gold);
  grip.name = 'GoldRopeGrip';
  grip.rotation.z = Math.PI / 2;
  const rope = new Mesh(new CylinderGeometry(0.008, 0.008, 1, 6), gold);
  rope.name = 'GoldRope';
  rope.pointerEvents = 'none';
  d.world.createTransformEntity(rope, { persistent: true });
  const a = LAMP_EYE.clone().add(new Vector3(-ROPE_HALF, -ROPE_DOWN, -ROPE_AHEAD));
  const b = LAMP_EYE.clone().add(new Vector3(ROPE_HALF, -ROPE_DOWN, -ROPE_AHEAD));
  const handle: Entity = d.world.createTransformEntity(grip, { persistent: true });
  handle.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: a.toArray(), b: b.toArray(), grip: [0, 0, 0], reach: 0.09, progress: 0.5, rest: -1 });
  d.stage.own('city', net, grip, rope);
  setV2Targets([grip]);
  let netX = net.position.x;
  const at = new Vector3();
  const tie = new Vector3();
  const follow = d.each((delta) => {
    const progress = handle.getValue(PathHandle, 'progress') ?? 0.5;
    netX += (NET_FROM + (NET_TO - NET_FROM) * progress - netX) * Math.min(1, delta * 9);
    net.position.x = netX;
    // The rope from the grip down to the net's middle.
    grip.getWorldPosition(at);
    tie.set(netX, 0.16, SECTION_Z).sub(at);
    rope.position.copy(at).addScaledVector(tie, 0.5);
    rope.scale.set(1, tie.length(), 1);
    rope.quaternion.setFromUnitVectors(UP, tie.normalize());
  });

  const game = playMiniGame(new MiniGame(WORDS.safetyNet, [{ name: 'the run' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const doors = [d.stage.node('city', 'bank_door_left'), d.stage.node('city', 'bank_door_right')];
  const phase = () => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    // A dev skip ends the wait early; play only once the stage has really begun.
    if (phase() !== 'playing') continue;
    resetSections(sections, doors);
    const hint = game.failuresOf(0) >= HINT_AFTER;
    const won = await fight(d, sections, () => netX, bird, hint, () => minis?.playPaused ?? false);
    if (won) game.win();
    else {
      // The crowd breaks the door.
      const start = d.now;
      for (const s of sections) for (const p of s.people) p.pose = 'wave';
      await d.until(() => {
        const k = Math.min(1, (d.now - start) / 0.8);
        if (doors[0] != null) doors[0].rotation.y = 1.3 * k;
        if (doors[1] != null) doors[1].rotation.y = -1.3 * k;
        return k >= 1;
      });
      game.lose('two sections');
    }
  }
  endMiniGame(game);
  follow();
  setV2Targets([]);

  // Won: they look down, see the net, and leave the queue.
  d.sounds.play('applause', 0.8);
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
  d.sounds.bed('crowd_murmur_loop', 0.15);
  for (const s of sections) for (const m of [s.glass, s.cracks, s.hole]) m.visible = false;
  net.visible = false;
  rope.visible = false;
  grip.visible = false;
  // The reporter has no part after the run.
  cast.reporter.pose = 'hidden';
  d.day.problem = 2;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;

  // Back on Gray's shoulder: the card floats up to be read, then lies on the steps; the notebook is rewritten.
  await d.rig.move(CITY.shoulder, Math.PI);
  await showCard(d, 'safetyNet');
  d.notebook.write([{ text: HEADLINES.run, struck: HEADLINES.runSolved }]);
  await d.captions.say(PERSONAS[persona].firstRun, watcher.head(new Vector3()), 0.3);
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
  return SECTION_X.map((x) => {
    const make = (material: MeshBasicMaterial, y: number, name: string) => {
      const mesh = new Mesh(new PlaneGeometry(SECTION.w, SECTION.d), material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, SECTION_Z);
      mesh.pointerEvents = 'none';
      d.world.createTransformEntity(mesh, { persistent: true });
      d.stage.own('city', mesh);
      return mesh;
    };
    const holeMesh = make(new MeshBasicMaterial({ map: hole, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 0.153, 'GlassHole');
    const glass = make(new MeshBasicMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.32, depthWrite: false }), 0.162, 'GlassPane');
    const crackMesh = make(new MeshBasicMaterial({ map: cracks, transparent: true, opacity: 0, depthWrite: false }), 0.165, 'GlassCracks');
    const people = cast.crowd.filter((p) => Math.abs(p.position.z - SECTION_Z) < SECTION.d / 2 && Math.abs(p.position.x - x) <= SECTION.w / 2);
    return { glass, cracks: crackMesh, hole: holeMesh, people, home: people.map((p) => p.position.clone()) };
  });
}

function resetSections(sections: Section[], doors: (Object3D | null)[]): void {
  for (const s of sections) {
    s.glass.visible = true;
    s.glass.position.y = 0.162;
    (s.glass.material as MeshBasicMaterial).opacity = 0.32;
    s.cracks.visible = true;
    (s.cracks.material as MeshBasicMaterial).opacity = 0;
    s.hole.visible = true;
    s.people.forEach((p, i) => {
      p.position.copy(s.home[i]);
      p.pose = 'wave';
    });
  }
  for (const door of doors) if (door != null) door.rotation.y = 0;
}

/** Four sections give way in turn; false at the second lost one. */
async function fight(d: DirectorSystem, sections: Section[], netX: () => number, bird: Group, hint: boolean, paused: () => boolean): Promise<boolean> {
  let lost = 0;
  let skipped = false;
  d.onSkip(() => {
    skipped = true;
  });
  for (let n = 0; n < COLLAPSES.length; n += 1) {
    // Dev only: a skip wins the whole fight.
    if (skipped) break;
    const { section, warn } = COLLAPSES[n];
    if (n === COLLAPSES.length - 1) {
      // The fourth: the magpie lands by the queue and whispers; the crowd takes it up.
      bird.position.set(SECTION_X[section] - 0.9, 1.25, SECTION_Z + 1.2);
      bird.lookAt(LAMP_EYE);
      bird.visible = true;
      bird.userData.clip = 'talk';
      await d.captions.say('S07-2', bird, 0.25);
      bird.userData.clip = 'idle';
    }
    const held = await collapse(d, sections[section], SECTION_X[section], warn + (hint ? 0.8 : 0), netX, paused);
    if (!held) lost += 1;
    if (lost >= 2) {
      bird.visible = false;
      return false;
    }
    await d.wait(BETWEEN);
  }
  bird.visible = false;
  return true;
}

/** One section cracks for `warn` seconds, then the glass drops; true if the net was under it. */
function collapse(d: DirectorSystem, s: Section, x: number, warn: number, netX: () => number, paused: () => boolean): Promise<boolean> {
  let t = 0;
  let held: boolean | null = null;
  let after = 0;
  const glass = s.glass.material as MeshBasicMaterial;
  const cracks = s.cracks.material as MeshBasicMaterial;
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      done(result);
    };
    const stop = d.each((delta) => {
      if (paused()) return;
      t += delta;
      if (held == null) {
        const k = Math.min(1, t / warn);
        // The cracks spread and the pane trembles, faster toward the end.
        cracks.opacity = 0.25 + 0.75 * k;
        s.glass.position.y = 0.162 + Math.sin(t * (20 + 40 * k)) * 0.004 * k;
        for (const p of s.people) p.position.y = 0.15 + Math.sin(t * 30) * 0.01 * k;
        if (k >= 1) {
          held = Math.abs(netX() - x) <= HOLD_HALF;
          if (import.meta.env.DEV) console.info(`[run] section at ${x}: ${held ? 'held' : 'lost'} (net ${netX().toFixed(2)})`);
        }
        return;
      }
      // The glass falls away into the dark.
      after += delta;
      const k = Math.min(1, after / 0.5);
      s.glass.position.y = 0.162 - k * 1.5;
      glass.opacity = 0.32 * (1 - k);
      cracks.opacity = 1 - k;
      if (k >= 1) {
        s.glass.visible = false;
        s.cracks.visible = false;
      }
      s.people.forEach((p, i) => {
        if (held) {
          // On the net, a little lower, still: they look down and see it.
          p.position.y = 0.15 - 0.1 * k;
          p.pose = 'idle';
        } else {
          // They run back from the edge.
          p.pose = 'walk';
          p.yaw = 0;
          p.stride += delta * 2.2;
          p.position.set(s.home[i].x, 0.15, s.home[i].z + 2.4 * k);
        }
      });
      if (after > 0.9) finish(held);
    });
    d.onSkip(() => finish(true));
  });
}
