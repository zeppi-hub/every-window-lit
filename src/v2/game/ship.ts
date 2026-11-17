import { Box3, type Entity, Group, Mesh, MeshStandardMaterial, type Object3D, PlaneGeometry, Vector3 } from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';
import { PathHandle, PathKindEnum } from '../components.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { parrotWords, setListener } from '../parrot-system.js';
import { shakeObject, startQuake } from '../quake-system.js';
import { setV2Targets } from '../step-targets.js';
import type { DirectorSystem } from './director.js';
import type { Wires } from './fire.js';
import { makeGlow } from './fx.js';
import { BOSSES, HEADLINES, WORDS } from './lines.js';
import { CITY, type CityCast, FEATHER, type Keepers, prop } from './opening.js';
import { magpie as makeMagpie, showCard } from './run.js';
import { WEATHER } from './stage.js';

/**
 * The third problem and its word (META_VR_V2_TASARIM.md, S12-S16): the big
 * bank groans and the street round it fills with dark water, gold
 * parachutes drift down from its top floor and fins circle (S12); on a
 * sailing ship in a storm the player bails the hold with a bucket and puts
 * back the hatch a wave tore off (S13); Gray covers the ear the feather
 * comes to, and the word must go round his head to the other one (S14);
 * from the lamp at the bank's door a giant gold bucket on a chain bails the
 * bank out onto the square, where the water rises round people's feet
 * (S15); and the bank is dry, the family is not (S16).
 */

/** The dark water round the bank (S12 on) and on the square (S15 on): its plane, and the level now. */
export interface Flood {
  bank: Mesh;
  square: Mesh;
  parachutes: Object3D[];
  fins: Object3D[];
  stop: () => void;
}

const BANK_WATER = { from: 0.12, risen: 0.55, sunk: 1.25 } as const;

function waterPlane(d: DirectorSystem, w: number, h: number, colour: number, name: string): Mesh {
  const mesh = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ color: colour, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.88 }));
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.pointerEvents = 'none';
  d.world.createTransformEntity(mesh, { persistent: true });
  d.stage.own('city', mesh);
  return mesh;
}

/** S12: the bank groans and leans in the sway; the street round it floods; three parachutes; fins; the notebook; the sailor's line. */
export async function s12(d: DirectorSystem, cast: CityCast, keepers: Keepers): Promise<Flood> {
  d.rain.on = true;
  d.stage.setWeather(WEATHER.rain2008);
  const bank = waterPlane(d, 26, 16, 0x1d2a33, 'BankWater');
  bank.position.set(-3, BANK_WATER.from, -20);
  const square = waterPlane(d, 30, 18, 0x2a3640, 'SquareWater');
  square.position.set(0, 0.1, -4);
  square.visible = false;
  // Slow sway: the square and the bank move, the bird's eye does not.
  const root = d.stage.root('city');
  if (root != null) shakeObject(root);
  startQuake({ kind: 'sway', strength: 'medium', seconds: 5 });
  d.sounds.play('bank_creak', 1);
  const parachutes = [0, 1, 2].map((i) => {
    const p = prop('golden_parachute');
    p.scale.setScalar(0.8);
    p.position.set(-4 + i * 3.5, 14, -26 + i * 0.6);
    d.world.createTransformEntity(p, { persistent: true });
    d.stage.own('city', p);
    return p;
  });
  const fins = [0, 1, 2].map(() => {
    const f = prop('shark_fin');
    d.world.createTransformEntity(f, { persistent: true });
    d.stage.own('city', f);
    return f;
  });
  let t = 0;
  const stop = d.each((delta) => {
    t += delta;
    fins.forEach((f, i) => {
      const a = t * 0.35 + (i * Math.PI * 2) / 3;
      f.position.set(-4 + Math.cos(a) * (3.5 + i), bank.position.y, -18.5 + Math.sin(a) * 1.6);
      f.rotation.y = -a;
    });
    parachutes.forEach((p, i) => {
      // Down slowly to just over the water, swaying.
      p.position.y = Math.max(bank.position.y + 0.3, p.position.y - delta * 0.6);
      p.rotation.z = Math.sin(t * 0.9 + i) * 0.12;
    });
  });
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 5);
    bank.position.y = BANK_WATER.from + (BANK_WATER.risen - BANK_WATER.from) * k;
    return k >= 1;
  });
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks },
  ]);
  // The person back at the foot of the steps, the notebook open.
  keepers.watcher.at(CITY.stairsFoot.x, CITY.stairsFoot.y, CITY.stairsFoot.z).face(CITY.grayAt.x, CITY.grayAt.z);
  d.notebook.mesh.position.set(CITY.stairsFoot.x, 1.45, CITY.stairsFoot.z + 0.35);
  d.notebook.mesh.lookAt(CITY.shoulder);
  d.sounds.play('paper', 0.6);
  await d.captions.say('S12-1', CITY.graySays, 0);
  await d.captions.say('S12-2', keepers.people[2].head(new Vector3()), 0.3);
  return { bank, square, parachutes, fins, stop };
}

/** The ship's frame to the world (the GLB's root sits at the origin; the `ship` node is rocked). */
const DECK_EYE_UP = 1.2;

/** S13, the storm ship: bail the hold with the bucket before the water reaches the painted line; a wave tears off the hatch in stage 2. */
export async function s13(d: DirectorSystem): Promise<void> {
  await d.stage.show('ship', WEATHER.storm);
  d.rain.on = true;
  const seat = d.stage.point('ship', 'seat_deck', new Vector3());
  const eye = seat.clone().add(new Vector3(0, DECK_EYE_UP, 0));
  // Facing the starboard rail (+z).
  d.rig.place(eye, Math.PI);
  const rootEntity = d.stage.entity('ship');
  const ship = d.stage.node('ship', 'ship');
  const sea = d.stage.node('ship', 'sea');
  if (rootEntity == null || ship == null) return;
  d.sounds.bed('waves_loop', 0.6);
  d.sounds.bed('wind_loop', 0.5);
  // The deck rolls gently under the bird (the world moves, the eye does not); less motion, less roll.
  const roll = lessMotion() ? 0.4 : 1;
  let t = 0;
  const rock = d.each((delta) => {
    t += delta;
    ship.rotation.x = Math.sin(t * 0.55) * 0.04 * roll;
    ship.rotation.z = Math.sin(t * 0.4 + 1) * 0.02 * roll;
    ship.position.y = Math.sin(t * 0.5) * 0.05 * roll;
    if (sea != null) sea.position.y = Math.sin(t * 0.5 + 1.4) * 0.12 * roll;
  });
  // The bucket: within a seated arm's reach, from low on the left (the well's side) to the rail ahead; a full stroke there and back is one bucket.
  const bucketNode = d.stage.node('ship', 'bucket');
  const gripUp = 0.56;
  const dip = eye.clone().add(new Vector3(0.28, -0.5, 0.22));
  const dump = eye.clone().add(new Vector3(-0.02, -0.18, 0.46));
  let bucket: Entity | null = null;
  if (bucketNode != null) {
    bucketNode.removeFromParent();
    bucket = d.world.createTransformEntity(bucketNode, { parent: rootEntity, persistent: true });
    bucket.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: dip.clone().setY(dip.y - gripUp).toArray(), b: dump.clone().setY(dump.y - gripUp).toArray(), grip: [0, gripUp, 0], reach: 0.1, progress: 0, rest: -1 });
  }
  // The hatch the wave tears off (stage 2): it lands to the right; slid back along its short path, it flies home over the well.
  const hatch = prop('hatch_cover');
  hatch.scale.setScalar(0.55);
  const hatchFrom = eye.clone().add(new Vector3(-0.38, -0.55, 0.18));
  const hatchTo = eye.clone().add(new Vector3(0.1, -0.5, 0.36));
  const hatchEntity = d.world.createTransformEntity(hatch, { parent: rootEntity, persistent: true });
  hatch.visible = false;
  const water = d.stage.node('ship', 'hold_water');
  const levels = { min: d.stage.point('ship', 'water_level_min', new Vector3()).y, line: d.stage.point('ship', d.stage.node('ship', 'water_line001') != null ? 'water_line001' : 'water_line', new Vector3()).y, max: d.stage.point('ship', 'water_level_max', new Vector3()).y };
  const mark = makeGlow(d.world, 0xffffff, 0.06);
  mark.visible = false;
  d.stage.own('ship', mark);
  if (bucketNode != null) setV2Targets([bucketNode]);

  const game = playMiniGame(new MiniGame(WORDS.bailOut, [{ name: 'five buckets' }, { name: 'seven buckets and the hatch' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const phase = () => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    if (phase() !== 'playing') continue;
    const stage = game.stage;
    const hint = game.failuresOf(stage) >= HINT_AFTER;
    const won = await bail(d, {
      need: stage === 0 ? 5 : 7,
      // Seconds for the water to reach the line from the bottom with nobody bailing.
      fill: stage === 0 ? 13 : 10,
      hatchAfter: stage === 0 ? -1 : 3,
      bucket,
      hatch,
      hatchEntity,
      hatchFrom,
      hatchTo,
      water,
      levels,
      mark,
      hint,
      paused: () => minis?.playPaused ?? false,
    });
    if (won) game.win();
    else game.lose('the water reached the line');
  }
  endMiniGame(game);
  setV2Targets([]);
  await d.captions.say('S13-1', d.stage.point('ship', 'spot_captain', new Vector3()).add(new Vector3(0, 1.8, 0)), 0);
  parrotWords.learn(WORDS.bailOut, FEATHER.bailOut);
  // The bucket's last swing, and the deck turns to the bank's marble steps: out through white.
  rock();
  d.sounds.bed('waves_loop', 0);
  d.sounds.bed('wind_loop', 0);
}

interface Bail {
  need: number;
  fill: number;
  hatchAfter: number;
  bucket: Entity | null;
  hatch: Object3D;
  hatchEntity: Entity;
  hatchFrom: Vector3;
  hatchTo: Vector3;
  water: Object3D | null;
  levels: { min: number; line: number; max: number };
  mark: Mesh;
  hint: boolean;
  paused: () => boolean;
}

/** One stage of bailing: the water comes in steadily, every full stroke of the bucket takes some out. */
function bail(d: DirectorSystem, b: Bail): Promise<boolean> {
  const rise = (b.levels.line - b.levels.min) / b.fill;
  const scoop = (b.levels.line - b.levels.min) * 0.22;
  let level = b.levels.min;
  let buckets = 0;
  let strokes = b.bucket?.getValue(PathHandle, 'strokes') ?? 0;
  let hatchOff = false;
  let hatchHandle = false;
  let t = 0;
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      b.mark.visible = false;
      b.hatch.visible = false;
      if (b.bucket != null && b.bucket.object3D != null) setV2Targets([b.bucket.object3D]);
      done(result);
    };
    const stop = d.each((delta) => {
      if (b.paused()) return;
      t += delta;
      // Through the torn-off hatch the sea comes in twice as fast.
      level = Math.min(b.levels.max, level + rise * delta * (hatchOff ? 2 : 1));
      if (b.water != null) b.water.position.y = level;
      // The losing line blinks as a hint.
      b.mark.visible = b.hint && Math.sin(t * 8) > 0;
      const now = b.bucket?.getValue(PathHandle, 'strokes') ?? 0;
      if (now > strokes && !hatchOff) {
        buckets += now - strokes;
        level = Math.max(b.levels.min, level - scoop * (now - strokes));
        d.sounds.play('bucket_splash', 0.7);
        if (import.meta.env.DEV) console.info(`[ship] bucket ${buckets}/${b.need} at ${t.toFixed(1)} s, water ${(level - b.levels.min).toFixed(2)} of ${(b.levels.line - b.levels.min).toFixed(2)}`);
        if (buckets === b.hatchAfter) {
          // A wave tears the hatch off; it lands beside the bird.
          hatchOff = true;
          d.sounds.play('ship_creak', 0.7);
          b.hatch.visible = true;
          if (!hatchHandle) {
            b.hatchEntity.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: b.hatchFrom.toArray(), b: b.hatchTo.toArray(), grip: [0, 0.05, 0], reach: 0.12, progress: 0, rest: -1 });
            hatchHandle = true;
          } else b.hatchEntity.setValue(PathHandle, 'progress', 0);
          setV2Targets([b.hatch]);
        }
      }
      strokes = now;
      if (hatchOff && (b.hatchEntity.getValue(PathHandle, 'progress') ?? 0) >= 0.95) {
        hatchOff = false;
        b.hatch.visible = false;
        if (import.meta.env.DEV) console.info('[ship] the hatch is back');
        if (b.bucket?.object3D != null) setV2Targets([b.bucket.object3D]);
      }
      if (buckets >= b.need && !hatchOff) {
        finish(true);
        return;
      }
      if (level >= b.levels.line) {
        if (import.meta.env.DEV) console.info(`[ship] the water reached the line with ${buckets}/${b.need}`);
        finish(false);
      }
    });
    d.onSkip(() => finish(true));
  });
}

/** S14: the feather comes near his ear and Gray covers it; the crowd boos; the word must go round his head to the other ear. */
export async function s14(d: DirectorSystem, cast: CityCast): Promise<void> {
  await d.captions.say('S14-1', CITY.graySays, 0);
  d.sounds.play('crowd_boo', 0.8);
  // The other ear: on his left side, round the back of his head from the bird.
  const head = cast.gray.head(new Vector3());
  const other = d.marker(head.clone().add(new Vector3(0.09, -0.13, 0.0)), 'GrayEar');
  setListener(other, 0.14);
  setV2Targets([other]);
  let word = '';
  while (word !== WORDS.bailOut) word = await d.nextWord(WORDS.bailOut);
  setV2Targets([]);
  setListener(cast.ear, 0.14);
}

/** The lamp at the bank's door (S15). */
const DOOR_LAMP_EYE = new Vector3(-2.6, 3.3, -21.2);

/** S15, THE SINKING BANK: the giant gold bucket on its chain bails the bank out onto the square; three rounds. */
export async function s15(d: DirectorSystem, cast: CityCast, flood: Flood): Promise<void> {
  const head = d.player.head;
  void d.gold.show(WORDS.bailOut.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head);
  await d.captions.say('S14-2', CITY.graySays, 0);
  // Onto the lamp by the bank's door, looking out over the steps and the square.
  const yaw = Math.PI - 0.35;
  await d.rig.move(DOOR_LAMP_EYE, yaw);
  void d.gold.show(BOSSES.sinkingBank.name, new Vector3(0, 6.5, -16), 3.6, 2.6, new Vector3(0, 0.15, 0), head);
  flood.square.visible = true;
  // The chain's handle, in reach: from toward the door (dip) to toward the square (pour); the giant bucket follows on its big path.
  // In the bird's own frame (forward and right from its heading): from low on the left, near (the dip), to ahead on the right (the pour).
  const eye = DOOR_LAMP_EYE;
  const forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const handleA = eye.clone().addScaledVector(right, -0.22).addScaledVector(forward, 0.3).add(new Vector3(0, -0.36, 0));
  const handleB = eye.clone().addScaledVector(right, 0.18).addScaledVector(forward, 0.46).add(new Vector3(0, -0.2, 0));
  const gripGroup = new Group();
  gripGroup.name = 'ChainHandle';
  const ring = prop('giant_bucket').getObjectByName('handle');
  if (ring != null) {
    ring.removeFromParent();
    ring.position.set(0, 0, 0);
    ring.scale.setScalar(0.25);
    gripGroup.add(ring);
    // Its middle on the grip point (the mesh is not centred on its node).
    ring.updateMatrixWorld(true);
    ring.position.sub(new Box3().setFromObject(ring).getCenter(new Vector3()));
  }
  const handle = d.world.createTransformEntity(gripGroup, { persistent: true });
  handle.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: handleA.toArray(), b: handleB.toArray(), grip: [0, 0, 0], reach: 0.1, progress: 0, rest: -1 });
  const bucket = prop('giant_bucket');
  const inside = new Vector3(0, 0.3, -24.2);
  const outside = new Vector3(-2.5, 1.0, -17.2);
  d.world.createTransformEntity(bucket, { persistent: true });
  d.stage.own('city', gripGroup, bucket);
  setV2Targets([gripGroup]);
  let t = 0;
  const swing = d.each((delta) => {
    t += delta;
    const p = handle.getValue(PathHandle, 'progress') ?? 0;
    bucket.position.lerpVectors(inside, outside, p);
    bucket.position.y += Math.sin(p * Math.PI) * 2.2;
    bucket.rotation.z = p > 0.85 ? -(p - 0.85) * 6 : 0;
  });
  const bird = makeMagpie(d);
  bird.visible = false;
  d.stage.own('city', bird);

  const game = playMiniGame(new MiniGame(WORDS.bailOut, [{ name: 'the sinking bank' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const phase = () => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    if (phase() !== 'playing') continue;
    const hint = game.failuresOf(0) >= HINT_AFTER;
    flood.bank.position.y = BANK_WATER.risen;
    flood.square.position.y = 0.1;
    let lost = false;
    let skipped = false;
    d.onSkip(() => {
      skipped = true;
    });
    const rounds = [
      { need: 4, seconds: 16 },
      { need: 5, seconds: 15 },
      { need: 6, seconds: 14 },
    ];
    for (let r = 0; r < rounds.length && !lost && !skipped; r += 1) {
      if (r === 2) {
        bird.position.set(-1.2, 1.25, -18.6);
        bird.lookAt(DOOR_LAMP_EYE);
        bird.visible = true;
        bird.userData.clip = 'talk';
        await d.captions.say('S15-1', bird, 0.25);
        bird.userData.clip = 'idle';
      }
      lost = !(await bailBank(d, flood, handle, rounds[r].need, rounds[r].seconds + (hint ? 3 : 0), () => minis?.playPaused ?? false));
    }
    bird.visible = false;
    if (skipped || !lost) game.win();
    else {
      // The bank goes under and its wires tear the family's sign: played again.
      const start = d.now;
      await d.until(() => {
        const k = Math.min(1, (d.now - start) / 1.2);
        flood.bank.position.y = flood.bank.position.y + (BANK_WATER.sunk - flood.bank.position.y) * k;
        return k >= 1;
      });
      game.lose('the bank went under');
    }
  }
  endMiniGame(game);
  swing();
  setV2Targets([]);
  // Won: the bank rights itself, the parachutes land safe, fat cats purr on the balcony; the treasury dims.
  d.sounds.play('applause', 0.6);
  await d.gold.show(BOSSES.sinkingBank.won, new Vector3(0, 4.5, -17), 2.8, 2.8, new Vector3(0, 0.2, 0), head);
  for (const x of [-3.2, 3.2]) {
    const cat = prop('fat_cat');
    cat.position.set(x, 1.19, -23.2);
    cat.rotation.y = Math.PI;
    d.world.createTransformEntity(cat, { persistent: true });
    d.stage.own('city', cat);
  }
  const fall = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - fall) / 2);
    flood.bank.position.y = BANK_WATER.risen + (BANK_WATER.from - BANK_WATER.risen) * k;
    return k >= 1;
  });
  for (const p of flood.parachutes) p.position.y = 0.15;
  flood.stop();
  for (const f of flood.fins) f.visible = false;
  bucket.visible = false;
  gripGroup.visible = false;
  await d.captions.say('S15-2', cast.crowd.find((p) => p.pose !== 'hidden')?.head(new Vector3()) ?? CITY.stairsFoot, 0.3);
  d.sounds.play('crowd_boo', 0.6);
  d.day.problem = 4;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;
  await d.rig.move(CITY.shoulder, Math.PI);
  await showCard(d, 'bailOut');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
  ]);
}

/** One round: the bank fills; each full stroke of the chain's handle bails a bucket out onto the square. */
function bailBank(d: DirectorSystem, flood: Flood, handle: Entity, need: number, seconds: number, paused: () => boolean): Promise<boolean> {
  let buckets = 0;
  let strokes = handle.getValue(PathHandle, 'strokes') ?? 0;
  let t = 0;
  const rise = (BANK_WATER.sunk - BANK_WATER.risen) / seconds;
  const scoop = ((BANK_WATER.sunk - BANK_WATER.risen) * 1.3) / need;
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
      flood.bank.position.y = Math.min(BANK_WATER.sunk, flood.bank.position.y + rise * delta);
      const now = handle.getValue(PathHandle, 'strokes') ?? 0;
      if (now > strokes) {
        buckets += now - strokes;
        flood.bank.position.y = Math.max(BANK_WATER.from, flood.bank.position.y - scoop * (now - strokes));
        // The cost, in the fight itself: every bucket lands on the square, round people's feet.
        flood.square.position.y = Math.min(0.42, flood.square.position.y + 0.025);
        d.sounds.play('bucket_splash', 0.9, 0.8);
        if (import.meta.env.DEV) console.info(`[sinking bank] bucket ${buckets}/${need} at ${t.toFixed(1)} s`);
      }
      strokes = now;
      if (buckets >= need) {
        finish(true);
        return;
      }
      if (flood.bank.position.y >= BANK_WATER.sunk) {
        if (import.meta.env.DEV) console.info(`[sinking bank] the bank went under with ${buckets}/${need}`);
        finish(false);
      }
    });
    d.onSkip(() => finish(true));
  });
}

/** S16: the person looks at the family's place, in water to the sill; the grey feather there (optional) keeps their lights on. */
export async function s16(d: DirectorSystem, keepers: Keepers, w: Wires): Promise<void> {
  const watcher = keepers.watcher;
  const front = w.family.clone().addScaledVector(w.facing, 2.7);
  await d.rig.fadeTo(1);
  watcher.at(front.x, 0.15, front.z, Math.atan2(-w.facing.x, -w.facing.z));
  watcher.pose = 'idle';
  const shoulder = front.clone().add(new Vector3(0, 1.62, 0)).addScaledVector(w.facing, 0.2);
  d.rig.place(shoulder, Math.atan2(-w.facing.x, -w.facing.z) + Math.PI);
  // Water at the family's door.
  const pool = new Mesh(new PlaneGeometry(4, 3), new MeshStandardMaterial({ color: 0x2a3640, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.85 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.copy(w.family).addScaledVector(w.facing, 1.2).setY(0.45);
  pool.pointerEvents = 'none';
  d.world.createTransformEntity(pool, { persistent: true });
  d.stage.own('city', pool);
  await d.rig.fadeTo(0);
  await d.captions.say('S16-1', watcher.head(new Vector3()), 0.25);
}
