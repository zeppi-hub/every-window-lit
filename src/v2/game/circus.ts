import { AdditiveBlending, CanvasTexture, CylinderGeometry, DoubleSide, type Entity, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { parrotWords } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import type { DirectorSystem } from './director.js';
import { makeGlow } from './fx.js';
import { WORDS } from './lines.js';
import { FEATHER } from './opening.js';
import type { Person } from './people.js';
import { WEATHER } from './stage.js';

/**
 * S06, the circus memory (S06): the
 * player is the catcher, seated ringside with the net's rope in hand (H5:
 * hold it, slide it sideways; the net follows). Stage 1, one acrobat falls
 * slowly, three times; stage 2, two acrobats from either side, one after
 * the other, two rounds. Two misses lose the stage (the acrobat drops into
 * the low spare net, unhurt) and only that stage is played again; from the
 * second loss on, her shadow shows where she will land (H-1). Won, the
 * ringmaster calls the word and the parrot has it.
 */

/** The net's travel (sirk README: net_limit_left/right) and its half width, with a little give for a catch (m). */
const NET_LIMIT = 4.6;
const CATCH_HALF = 1.8 + 0.15;
/** The net's surface where a falling acrobat is judged (m; the sag is 1.03-1.45). */
const NET_TOP = 1.35;
/** The low spare net under the wire (m). */
const SPARE_Y = 0.55;
/** The rope's slide in front of the seated eye (1.2 m over seat_ringside at z 7.6), within a seated arm's easy reach: 0.42 m ahead, 0.32 m down, 0.3 m to either side. */
const ROPE_FROM = new Vector3(-0.3, 0.88, 7.18);
const ROPE_TO = new Vector3(0.3, 0.88, 7.18);
/** The ropes' rest lengths in the file (sirk README). */
const LINE_LENGTH = 6.42;
const ROPE_LENGTH = 8.41;

/** One fall: who, where she walks to on the wire, and how long she walks, wobbles and falls (s). */
interface Fall {
  who: 0 | 1;
  to: number;
  walk: number;
  wobble: number;
  fall: number;
}

/** Stage 1: one acrobat, slow. Stage 2: two acrobats from either side, quicker, two rounds. */
const STAGES: readonly (readonly Fall[])[] = [
  [
    { who: 0, to: -2.6, walk: 2.2, wobble: 0.7, fall: 2.4 },
    { who: 0, to: 2.8, walk: 2.4, wobble: 0.7, fall: 2.3 },
    { who: 0, to: -0.6, walk: 2.0, wobble: 0.6, fall: 2.2 },
  ],
  [
    { who: 0, to: -3.2, walk: 1.2, wobble: 0.4, fall: 1.6 },
    { who: 1, to: 3.4, walk: 1.2, wobble: 0.4, fall: 1.6 },
    { who: 0, to: -1.2, walk: 1.1, wobble: 0.35, fall: 1.5 },
    { who: 1, to: 2.0, walk: 1.1, wobble: 0.35, fall: 1.5 },
  ],
];

const up = new Vector3(0, 1, 0);

/** Point a rope (pivot at its pulley, the mesh along local +Y, `length` long at scale 1) at `target`. */
function aimRope(rope: Object3D | null, target: Vector3, length: number, dir: Vector3): void {
  if (rope == null) return;
  dir.copy(target).sub(rope.position);
  const distance = dir.length();
  rope.quaternion.setFromUnitVectors(up, dir.normalize());
  rope.scale.set(1, distance / length, 1);
}

/** A cord grid on a transparent canvas: the spare net and the safety net of the city (gold). */
export function netTexture(colour: string, cells: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = colour;
    g.lineWidth = 5;
    const step = 256 / cells;
    for (let i = 0; i <= cells; i += 1) {
      g.beginPath();
      g.moveTo(i * step, 0);
      g.lineTo(i * step, 256);
      g.moveTo(0, i * step);
      g.lineTo(256, i * step);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A soft round shadow (the hint: where she will land). */
function shadowDisc(d: DirectorSystem): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    r.addColorStop(0, 'rgba(0,0,0,0.85)');
    r.addColorStop(0.6, 'rgba(0,0,0,0.55)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  const mesh = new Mesh(new PlaneGeometry(1.1, 1.1), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'AcrobatShadow';
  mesh.pointerEvents = 'none';
  mesh.visible = false;
  d.world.createTransformEntity(mesh, { persistent: true });
  return mesh;
}

/** The follow spot that marks a stage's start (S06: a drum roll and a spot): a warm cone from the roof onto the acrobat. */
function spotCone(d: DirectorSystem): Mesh {
  const mesh = new Mesh(new CylinderGeometry(0.25, 1.1, 5.5, 24, 1, true), new MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  mesh.name = 'FollowSpot';
  mesh.pointerEvents = 'none';
  mesh.visible = false;
  d.world.createTransformEntity(mesh, { persistent: true });
  return mesh;
}

/** The circus memory, from the moment the orb has opened (full white) to the player back on Gray's shoulder. */
export async function s06(d: DirectorSystem): Promise<void> {
  d.chapter('S06');
  await d.stage.show('circus', WEATHER.circus);
  d.rain.on = false;
  const point = new Vector3();
  d.stage.point('circus', 'seat_ringside', point);
  d.rig.place(point.add(new Vector3(0, 1.2, 0)), 0);
  const root = d.stage.root('circus');
  const rootEntity = d.stage.entity('circus');
  if (root == null || rootEntity == null) return;

  // The rope: one T-grip slid sideways in front of the seat (the left grip is not used).
  const left = d.stage.node('circus', 'rope_handle_left');
  if (left != null) left.visible = false;
  const grip = d.stage.node('circus', 'rope_handle_right');
  let handle: Entity | null = null;
  if (grip != null) {
    handle = d.world.createTransformEntity(grip, { parent: rootEntity, persistent: true });
    handle.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: ROPE_FROM.toArray(), b: ROPE_TO.toArray(), grip: [0, 0, 0], reach: 0.09, progress: 0.5, rest: -1 });
    setV2Targets([grip]);
  }
  const net = d.stage.node('circus', 'safety_net');
  const ropes = [d.stage.node('circus', 'net_rope_left'), d.stage.node('circus', 'net_rope_right')];
  const lines = [d.stage.node('circus', 'net_line_left'), d.stage.node('circus', 'net_line_right')];
  const spare = new Mesh(new PlaneGeometry(13.4, 3.4), new MeshBasicMaterial({ map: netTexture('#e0d4b8', 26), transparent: true, alphaTest: 0.3, side: DoubleSide }));
  spare.name = 'SpareNet';
  spare.rotation.x = -Math.PI / 2;
  spare.position.set(0, SPARE_Y, 0);
  spare.pointerEvents = 'none';
  d.world.createTransformEntity(spare, { parent: rootEntity, persistent: true });
  const shadow = shadowDisc(d);
  const spot = spotCone(d);
  d.stage.own('circus', shadow, spot);

  // The acrobats on the wire, the partner at the player's side and the ringmaster in the ring.
  const starts = [new Vector3(), new Vector3()];
  d.stage.point('circus', 'acrobat_start_1', starts[0]);
  d.stage.point('circus', 'acrobat_start_3', starts[1]);
  const acrobats: Person[] = [
    d.people.add({ model: 'crowd_woman_a' }),
    d.people.add({ model: 'crowd_woman_a', size: 0.97 }),
  ];
  acrobats.forEach((a, i) => {
    a.at(starts[i].x, starts[i].y, starts[i].z, i === 0 ? Math.PI / 2 : -Math.PI / 2);
    a.pose = 'idle';
  });
  const partner = d.people.add({ model: 'crowd_man_casual' });
  partner.at(1.25, 0, 7.3).face(0, 0);
  const ringmaster = d.people.add({ model: 'crowd_man_suit' });
  ringmaster.at(-5.2, 0, 3.2).face(0, 7.6);

  // The net follows the rope, a little behind it, and the ropes follow both.
  let netX = 0;
  const target = new Vector3();
  const dir = new Vector3();
  const tie = new Vector3();
  const follow = d.each((delta) => {
    const progress = handle?.getValue(PathHandle, 'progress') ?? 0.5;
    const want = (progress * 2 - 1) * NET_LIMIT;
    netX += (want - netX) * Math.min(1, delta * 9);
    if (net != null) net.position.x = netX;
    if (grip != null) for (const rope of ropes) aimRope(rope, grip.getWorldPosition(target), ROPE_LENGTH, dir);
    aimRope(lines[0], tie.set(netX - 1.8, 1.45, 0), LINE_LENGTH, dir);
    aimRope(lines[1], tie.set(netX + 1.8, 1.45, 0), LINE_LENGTH, dir);
  });

  const game = playMiniGame(new MiniGame(WORDS.safetyNet, [{ name: 'one acrobat' }, { name: 'two acrobats' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  let hinted = -1;
  const phase = () => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    // A dev skip ends the wait early; play only once the stage has really begun.
    if (phase() !== 'playing') continue;
    const stage = game.stage;
    const hint = game.failuresOf(stage) >= HINT_AFTER;
    if (stage === 0 && game.attemptsOf(0) === 1) void d.captions.say('S06-1', partner.head(new Vector3()), 0.3);
    if (hint && hinted !== stage) {
      hinted = stage;
      void d.captions.say('H-1', partner.head(new Vector3()), 0.3);
    }
    const won = await playStage(d, STAGES[stage], acrobats, starts, () => netX, shadow, spot, hint, () => minis?.playPaused ?? false);
    if (won) game.win();
    else game.lose('two misses');
  }
  endMiniGame(game);
  follow();
  setV2Targets([]);

  // The word, called out; the parrot learns it by hearing it.
  await d.captions.say('S06-2', ringmaster.head(new Vector3()), 0.3);
  parrotWords.learn(WORDS.safetyNet, FEATHER.safetyNet);
  // The tent turns to rain; the rope in the palm gathers into a gold feather.
  if (grip != null) {
    const glow = makeGlow(d.world, FEATHER.safetyNet, 0.12);
    glow.position.copy(grip.getWorldPosition(target));
    d.stage.own('circus', glow);
  }
  d.rain.on = true;
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 1.6);
    d.stage.blendWeather(WEATHER.circus, WEATHER.rain2008, k);
    return k >= 1;
  });
  for (const p of [...acrobats, partner, ringmaster]) p.pose = 'hidden';
}

/** One stage's falls, one after the other; resolves false at the second miss, true when all are done. */
async function playStage(
  d: DirectorSystem,
  falls: readonly Fall[],
  acrobats: Person[],
  starts: Vector3[],
  netX: () => number,
  shadow: Mesh,
  spot: Mesh,
  hint: boolean,
  paused: () => boolean,
): Promise<boolean> {
  // Everyone back on the wire, the spot up for a moment on the first to go.
  acrobats.forEach((a, i) => {
    a.at(starts[i].x, starts[i].y, starts[i].z, i === 0 ? Math.PI / 2 : -Math.PI / 2);
    a.pose = 'idle';
  });
  let misses = 0;
  let skipped = false;
  d.onSkip(() => {
    skipped = true;
  });
  for (let n = 0; n < falls.length; n += 1) {
    const caught = await playFall(d, falls[n], acrobats[falls[n].who], netX, shadow, n === 0 ? spot : null, hint, paused);
    // Dev only: a skip wins the whole stage.
    if (skipped) return true;
    if (!caught) misses += 1;
    if (misses >= 2) return false;
  }
  return true;
}

/** One acrobat walks the wire, wobbles, falls; true if the net was under her. */
function playFall(d: DirectorSystem, fall: Fall, a: Person, netX: () => number, shadow: Mesh, spot: Mesh | null, hint: boolean, paused: () => boolean): Promise<boolean> {
  const from = a.position.x;
  const wireY = a.position.y;
  const spotFor = spot == null ? 0 : 1.4;
  let t = 0;
  let caught: boolean | null = null;
  let settle = 0;
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      shadow.visible = false;
      if (spot != null) spot.visible = false;
      done(result);
    };
    const stop = d.each((delta) => {
      if (paused()) return;
      t += delta;
      if (spot != null) {
        spot.visible = t < spotFor;
        (spot.material as MeshBasicMaterial).opacity = 0.28 * Math.max(0, 1 - t / spotFor);
        spot.position.set(a.position.x, a.position.y + 3.2, a.position.z);
      }
      const walkEnd = fall.walk;
      const wobbleEnd = walkEnd + fall.wobble;
      if (t < walkEnd) {
        const k = t / walkEnd;
        a.position.x = from + (fall.to - from) * (k * k * (3 - 2 * k));
        a.yaw = fall.to > from ? Math.PI / 2 : -Math.PI / 2;
        a.pose = 'walk';
        a.stride += delta * 1.4;
      } else if (t < wobbleEnd) {
        a.position.x = fall.to + Math.sin(t * 22) * 0.04;
        a.pose = 'arm';
      } else if (caught == null) {
        // Falling, slowly at first: the eye has time to read where she will land.
        const k = Math.min(1, (t - wobbleEnd) / fall.fall);
        a.position.x = fall.to;
        a.position.y = wireY - (wireY - NET_TOP) * k * k;
        a.pose = 'wave';
        if (k >= 1) {
          caught = Math.abs(a.position.x - netX()) <= CATCH_HALF;
          if (import.meta.env.DEV) console.info(`[circus] ${caught ? 'caught' : 'missed'} at ${a.position.x.toFixed(2)}, net ${netX().toFixed(2)}`);
          settle = 0;
        }
      } else {
        // Caught: a bounce on the net, riding it; missed: down into the spare net, a small bounce, unhurt.
        settle += delta;
        const k = Math.min(1, settle / 0.9);
        const bounce = Math.sin(k * Math.PI * 2) * (1 - k) * 0.35;
        a.pose = 'idle';
        if (caught) {
          a.position.x = netX();
          a.position.y = 1.15 + bounce;
        } else {
          const drop = Math.min(1, settle / 0.35);
          a.position.y = NET_TOP - (NET_TOP - SPARE_Y) * drop + (drop >= 1 ? bounce * 0.5 : 0);
        }
        if (k >= 1) {
          // Back up the ladder, out of sight, then on the wire again.
          a.pose = 'hidden';
          a.position.set(fall.to, wireY, a.position.z);
          if (settle > 1.4) {
            a.pose = 'idle';
            finish(caught);
          }
        }
      }
      shadow.visible = hint && t >= walkEnd * 0.6 && caught == null;
      shadow.position.set(fall.to, 0.02, a.position.z);
    });
    d.onSkip(() => finish(true));
  });
}
