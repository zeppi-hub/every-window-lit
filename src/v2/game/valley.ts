import { type Entity, Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D, type PointLight, Quaternion, type SpotLight, Vector3 } from '@iwsdk/core';
import { devParam } from '../dev-param.js';
import { setGoal } from '../goal.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { parrotWords, stowWing } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { eased, gap, type Herd, hintFor, newHerd, type Spot, STAGES, stepHerd, type ValleyStage, wolvesDown } from '../valley-rules.js';
import type { DirectorSystem } from './director.js';
import { type BodyLook, PerformerBody } from './circus-body.js';
import { Vignette } from './circus-show.js';
import { buildSledge, Fence, type Loss, type Outcome, playRing, ropeLeft, WOOD } from './fence-kit.js';
import { makeGlow } from './fx.js';
import { WORDS } from './lines.js';
import { FEATHER } from './opening.js';
import type { Person } from './people.js';
import { adoptValleyFile, buildFireLight, buildFlame, peltTexture, type KeeperKit, loadKeeperKit, buildTorch, rammerFrom, type Torch, buildElder, buildShadows, type Shadows, buildHoles, buildMammoth, buildRingLight, buildRocks, buildSky, buildSkyLight, buildSnowfall, buildStandard, buildTerrain, buildWolf, DUSK, type Elder, groundAt, type Mammoth, NIGHT, type Snowfall, type Standard, stirMammoth, type Wolf } from './valley-world.js';

/**
 * S25, the valley memory: the last herd, the keeper of it on a sledge, and
 * the wolves coming down with the dark. The player rings the herd with a
 * line of rags on stakes (fence-kit.ts; the rules are v2/valley-rules.ts):
 * a small ring with all the time in the world; then two herds and one coil,
 * so some must be left to the hills; then the herd walking away from the
 * wolves as the light goes. A ring that holds stays lit, and the wolves
 * turn at the rags; a ring that does not, and the herd is gone over the
 * ridge (nothing is caught: they run).
 *
 * This is the one memory that is not its keeper's own: it is the story the
 * museum's keepers hand down with the bones.
 */

/** After this many losses of a stage it is made gentler (valley-rules.ts eased()). */
const MERCY = 3;
const WOLVES = 5;
/** How far off the wolves start, and how near the ring they come (m from its middle). */
const WOLF_FAR = 46;
/** Use the valley's own file for the animals, stakes and floor (false: everything built in code). */
const USE_MODELS = true;
const WOLF_NEAR = 8.2;
/** Where the story's teller stands (within the 9 m inside which a person is drawn in full from every seat). */
const TELLER = { x: 0.1, z: -2.95 } as const;
/** The small fire, a step from him and clear of the herd. */
const FIRE = { x: 0.9, z: -2.75 } as const;
/** The keeper: a pelt coat with a dark trim, fur leggings, boots (the colours the shared body is dressed in). */
const KEEPER_LOOK: BodyLook = { suit: 0x5a4030, trim: 0x2c1e14, tights: 0x4a3a2c, shoes: 0x1f1610, skin: 0xb98a68, head: false };

interface ValleySet {
  add<T extends Object3D>(object: T): T;
  fence: Fence;
  sledge: Group;
  lantern: PointLight;
  coil: Object3D;
  cows: Mammoth[];
  calf: Mammoth;
  bulls: Mammoth[];
  wolves: Wolf[];
  elder: Elder;
  /** The torch in the teller's hand, when the story's teller is a real person (the museum's keeper). */
  torch: Torch;
  fire: PointLight;
  flames: Mesh;
  standard: Standard;
  snow: Snowfall;
  ringLight: SpotLight;
  hintGlow: Mesh;
  /** The keeper's own body, seen when the player looks down: a long pelt coat, fur leggings, boots. */
  body: PerformerBody;
  shadows: Shadows;
  holes: Group | null;
  holesEntity: Entity | null;
}

let built: ValleySet | null = null;
/** The herd's elder (art/v2/insan, elder.glb), made once; null if that model is not in the game. */
let elderPerson: Person | null | undefined;

function buildSet(d: DirectorSystem, rootEntity: Entity, kit: KeeperKit | null): ValleySet {
  if (built != null) return built;
  const add = <T extends Object3D>(object: T): T => {
    d.world.createTransformEntity(object, { parent: rootEntity, persistent: true });
    return object;
  };
  // The valley's own file, if it is in: its mammoths, wolves, stakes, snow floor, rocks and glacier walls. Without it, the world built here.
  let models: ReturnType<typeof adoptValleyFile> = null;
  try {
    const root = d.stage.root('valley');
    models = USE_MODELS && root != null ? adoptValleyFile(root) : null;
  } catch (error) {
    console.warn('[valley] the valley file could not be used', error);
  }
  if (import.meta.env.DEV) console.info(`[valley] ${models != null ? `the file's models: ${models.mammoths.length} mammoths, wolf ${models.wolf != null}, stake ${models.stake != null}` : 'built in code'}`);
  if (models == null) {
    add(buildTerrain());
    add(buildRocks());
  }
  add(buildSky());
  add(buildSkyLight());
  const ringLight = add(buildRingLight());
  add(ringLight.target);
  const driver = new Group();
  if (kit?.driver != null) driver.add(kit.driver);
  const fence = new Fence(add, WOOD, { stake: models?.stake ?? null, driver: kit?.driver != null ? driver : models?.mallet != null ? rammerFrom(models.mallet) : null });
  const { sledge, lantern, coil } = buildSledge(WOOD, models?.wood ?? null, kit);
  add(sledge);
  const cows = [0, 1, 2].map((k) => buildMammoth('cow', k + 1, models?.mammoths[k] ?? null));
  const calf = buildMammoth('calf', 5, models?.mammoths[5] ?? null);
  const bulls = [0, 1].map((k) => buildMammoth('bull', k + 7, models?.mammoths[3 + k] ?? null));
  for (const m of [...cows, calf, ...bulls]) add(m.group);
  const wolves = Array.from({ length: WOLVES }, () => buildWolf(models?.wolf ?? null));
  for (const w of wolves) add(w.group);
  const elder = buildElder();
  add(elder.group);
  // The teller's torch stands planted in the snow beside him; the small fire has its own light.
  const torch = buildTorch(models?.wood ?? null, 1.55);
  torch.group.visible = false;
  torch.group.position.set(TELLER.x - 0.55, 0, TELLER.z + 0.1);
  add(torch.group);
  const fire = add(buildFireLight());
  fire.position.set(FIRE.x, 0.45, FIRE.z);
  // Its flames, over the embers (without them the lit ash reads as a pale plate).
  const flames = add(buildFlame(0.7, 1.0));
  flames.position.set(FIRE.x, 0.5, FIRE.z);
  (flames.material as MeshBasicMaterial).color.setRGB(2.2, 1.7, 1.2);
  // The file's small fire burns at the elder's feet.
  for (const part of models?.fire ?? []) {
    part.position.x += FIRE.x - 0.4;
    part.position.z += FIRE.z - (4.4 + 8.5);
    // Coals, not a pale plate: dark, with their own glow.
    part.traverse((o) => {
      const coal = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (coal == null || Array.isArray(coal) || coal.emissive == null) return;
      coal.color.setHex(0x30180e);
      coal.emissive.setHex(0xff5a14);
      coal.emissiveIntensity = 0.9;
    });
  }
  // The word's feather over the herd from the first second, and a lantern for each of the three stages.
  const standard = buildStandard(FEATHER.ringFence, models?.stake?.material ?? null);
  standard.group.position.set(-1.4, 0, -3.2);
  add(standard.group);
  const snow = buildSnowfall(520);
  add(snow.points);
  const body = new PerformerBody(KEEPER_LOOK);
  // The shared body is dressed for the circus: here every part of it is fur (a pelt coat, fur leggings).
  const pelt = peltTexture();
  body.root.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (material == null || Array.isArray(material) || material.map == null) return;
    material.map = pelt;
    material.color.setHex(0xc9b29a);
    material.roughness = 1;
    material.metalness = 0;
    material.needsUpdate = true;
  });
  add(body.root);
  const shadows = buildShadows(24);
  add(shadows.mesh);
  const hintGlow = makeGlow(d.world, 0xffd27a, 0.3);
  hintGlow.visible = false;
  d.stage.own('valley', hintGlow);
  built = { add, fence, sledge, lantern, coil, cows, calf, bulls, wolves, elder, torch, fire, flames, standard, snow, ringLight, hintGlow, body, shadows, holes: null, holesEntity: null };
  return built;
}

/** Which mammoth plays each of the stage's herd. */
function castHerd(set: ValleySet, stage: ValleyStage): Mammoth[] {
  let cow = 0;
  let bull = 0;
  return stage.herd.map((b) => (b.kind === 'calf' ? set.calf : b.kind === 'bull' ? set.bulls[bull++] : set.cows[cow++]));
}

interface Scene {
  stage: ValleyStage;
  cast: Mammoth[];
  herd: Herd;
  /** Each beast's heading now, and whether it is walking (0..1). */
  yaws: number[];
  walking: number;
  /** How far down the wolves are (0..1), and an extra pull toward a point when they break in. */
  down: number;
  /** The bulls of the second stage, once they have gone to the hills. */
  gone: number;
  /** The hole the keeper sits at, and how much the wolf that prowls there keeps to it (1) or runs with the others (0). */
  seat: Spot | null;
  /** The next hole to stake: the gap between it and the seat is where that wolf waits. */
  gap: Spot | null;
  prowl: number;
  /** When that wolf's place was last moved (seconds; -1 before it has one). */
  lairAt: number;
}

/** Set a stage out: the herd where it stands, the holes, the wolves back on their ridge, the elder with the herd. */
function layOut(d: DirectorSystem, set: ValleySet, stage: ValleyStage): Scene {
  for (const m of [...set.cows, set.calf, ...set.bulls]) m.group.visible = false;
  const cast = castHerd(set, stage);
  const herd = newHerd(stage);
  cast.forEach((m, i) => {
    m.group.visible = true;
    m.group.position.set(stage.herd[i].x, 0, stage.herd[i].z);
    m.group.rotation.y = stage.herd[i].yaw;
  });
  if (set.holesEntity != null) set.holesEntity.dispose();
  const holes = buildHoles(stage.holes.map((h) => new Vector3(h.x, 0, h.z)));
  set.holesEntity = d.world.createTransformEntity(holes, { parent: d.stage.entity('valley') ?? undefined, persistent: true });
  set.holes = holes;
  // The elder stands by the standard on the herd's north side, clear of every seat's view of the herd.
  set.elder.group.position.set(TELLER.x, 0, TELLER.z);
  set.elder.group.rotation.y = Math.atan2(stage.holes[stage.answer[0]].x - TELLER.x, stage.holes[stage.answer[0]].z - TELLER.z);
  set.ringLight.intensity = 0;
  set.fence.reset();
  const scene: Scene = { stage, cast, herd, yaws: stage.herd.map((b) => b.yaw), walking: 0, down: 0, gone: 0, seat: null, gap: null, prowl: 1, lairAt: -1 };
  placeWolves(set, scene, 0, null, 0);
  return scene;
}

const wolfAt = new Vector3();
const turn = new Quaternion();

/** The wolves, `down` (0..1) of the way from their ridge to the ring; `toward`, a point they all run for instead (`pull` 0..1). */
function placeWolves(set: ValleySet, scene: Scene, time: number, toward: Vector3 | null, pull: number): void {
  const from = scene.stage.wolvesFrom;
  set.wolves.forEach((wolf, i) => {
    const bearing = from + (i - (WOLVES - 1) / 2) * (0.17 + 0.25 * scene.down);
    const far = WOLF_FAR + i * 3 + (WOLF_NEAR + (i % 2) * 1.2 - WOLF_FAR - i * 3) * scene.down;
    // They come down in a line that wanders, and pace along the rags once they are there.
    const wander = Math.sin(time * 0.45 + i * 2.1) * (2.5 + 2 * scene.down);
    wolfAt.set(Math.sin(bearing) * far + Math.cos(bearing) * wander, 0, -Math.cos(bearing) * far + Math.sin(bearing) * wander);
    if (toward != null) wolfAt.lerp(toward, pull * (0.82 + 0.04 * i));
    const before = wolf.group.position;
    const dx = wolfAt.x - before.x;
    const dz = wolfAt.z - before.z;
    // Facing the way it moves; standing, it faces the herd.
    const moving = Math.hypot(dx, dz) > 0.004;
    const want = moving ? Math.atan2(dx, dz) : Math.atan2(-wolfAt.x, -wolfAt.z);
    let turn = want - wolf.group.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    wolf.group.rotation.y += turn * 0.15;
    wolf.group.position.set(wolfAt.x, groundAt(wolfAt.x, wolfAt.z) + (moving ? 0.035 * Math.abs(Math.sin(time * 8 + i)) : 0), wolfAt.z);
  });
}

/**
 * S25: the valley memory. `teller` is the museum's keeper as the day has him: the story is his to tell, so he stands in it by
 * the fire with a torch (without him, a cloaked figure built here).
 */
export async function s25(d: DirectorSystem, teller: Person | null = null): Promise<void> {
  d.chapter('S25');
  await d.stage.show('valley', DUSK);
  d.rain.on = false;
  stowWing(true);
  const rootEntity = d.stage.entity('valley');
  if (rootEntity == null) return;
  const set = buildSet(d, rootEntity, built == null ? await loadKeeperKit() : null);
  const minis = d.world.getSystem(MiniGameSystem);
  const paused = (): boolean => minis?.playPaused ?? false;
  const game = playMiniGame(new MiniGame(WORDS.ringFence, STAGES.map((s) => ({ name: s.name }))));
  d.sounds.bed('wind_loop', 0.3);
  // The story's teller, in the valley: the herd's elder in his furs (the museum's keeper himself, if the elder is not in the game),
  // by the fire on the herd's north side, his torch arm out.
  const guest = teller;
  if (elderPerson === undefined) {
    try {
      elderPerson = d.people.add({ model: 'elder' });
    } catch {
      elderPerson = null;
    }
  }
  teller = elderPerson ?? guest;
  if (import.meta.env.DEV) console.info(`[valley] the teller: ${elderPerson != null ? 'the elder' : guest != null ? 'the keeper' : 'a figure built here'}`);
  const home = teller == null || teller !== guest ? null : { at: teller.position.clone(), yaw: teller.yaw, pose: teller.pose };
  const tellerHead = new Vector3();
  const tellerHand = new Vector3();
  set.elder.group.visible = teller == null;
  set.elder.torch.visible = teller == null;
  set.torch.group.visible = teller != null;
  if (teller != null) {
    teller.at(TELLER.x, 0, TELLER.z);
    teller.pose = 'idle';
  }
  // The teller's words are shown between the keeper and him, a little to his side of straight ahead: whole, and near the middle of the view.
  const saidAt = new Vector3();
  const says = (): Vector3 => {
    if (teller != null) teller.head(tellerHead);
    else set.elder.group.localToWorld(tellerHead.copy(set.elder.head));
    saidAt.copy(tellerHead).sub(d.eyeAt).setY(0).normalize().multiplyScalar(0.45);
    saidAt.x -= Math.sin(seatYaw);
    saidAt.z -= Math.cos(seatYaw);
    return saidAt.normalize().multiplyScalar(2.4).add(d.eyeAt).setY(d.eyeAt.y + 0.1).clone();
  };
  let scene: Scene | null = null;
  let dark = -1;
  let taken = false;
  let seatYaw = 0;
  const vignette = new Vignette(d.player.head);
  const neck = new Vector3();
  const hipsAt = new Vector3();
  const ahead = new Vector3();
  const across = new Vector3();
  const foot = new Vector3();
  const wrist = new Vector3();
  let spoken = false;
  const coached = new Set<string>();
  const WHERE = 'MEMORY · THE VALLEY';
  set.standard.light(0);
  const eyeAt = new Vector3();
  const everyBeast = [...set.cows, set.calf, ...set.bulls];
  // What goes on whether or not a stage is being played: the snow, the herd breathing, the torch, the wolves' eyes.
  const ambient = d.each((delta) => {
    set.snow.update(delta, d.eyeAt);
    const t = d.now;
    set.elder.torch.intensity = 6.5 + 1.5 * Math.sin(t * 11) + Math.sin(t * 23);
    set.elder.flame.scale.set(1 + 0.1 * Math.sin(t * 17), 1 + 0.18 * Math.sin(t * 13 + 1), 1);
    set.elder.flame.rotation.y = Math.atan2(d.eyeAt.x - set.elder.group.position.x, d.eyeAt.z - set.elder.group.position.z) - set.elder.group.rotation.y;
    // The feather turns to the keeper wherever the sledge is, and hangs breathing.
    const feather = set.standard.feather;
    if (!taken) {
      feather.rotation.y = Math.atan2(d.eyeAt.x - set.standard.group.position.x, d.eyeAt.z - set.standard.group.position.z);
      feather.position.y = 4.75 + 0.06 * Math.sin(t * 1.3);
    }
    // The keeper's own body: seated on the sledge's bench, knees either side of the stake, sleeves to the real hands.
    ahead.set(-Math.sin(seatYaw), 0, -Math.cos(seatYaw));
    across.set(Math.cos(seatYaw), 0, -Math.sin(seatYaw));
    neck.copy(d.eyeAt).addScaledVector(ahead, -0.06);
    neck.y -= 0.17;
    hipsAt.copy(neck).addScaledVector(ahead, -0.1);
    hipsAt.y -= 0.5;
    set.body.spine(neck, hipsAt, ahead);
    for (const side of ['left', 'right'] as const) {
      const s = side === 'left' ? -1 : 1;
      foot.copy(set.sledge.position).addScaledVector(ahead, 0.3).addScaledVector(across, s * 0.24);
      foot.y = 0.06;
      set.body.leg(side, foot);
      set.body.arm(side, d.player.gripSpaces[side].getWorldPosition(wrist));
    }
    if (teller != null) {
      // The teller keeps the keeper in sight; his torch burns beside him.
      teller.face(d.eyeAt.x, d.eyeAt.z);
      tellerHand.copy(set.torch.group.position);
      set.torch.light.intensity = 9 + 1.8 * Math.sin(t * 11) + 1.2 * Math.sin(t * 23);
      set.torch.flame.scale.set(1 + 0.1 * Math.sin(t * 17), 1 + 0.18 * Math.sin(t * 13 + 1), 1);
      set.torch.flame.rotation.y = Math.atan2(d.eyeAt.x - tellerHand.x, d.eyeAt.z - tellerHand.z);
    }
    // The elder turns to keep the keeper in sight.
    let face = Math.atan2(d.eyeAt.x - set.elder.group.position.x, d.eyeAt.z - set.elder.group.position.z) - set.elder.group.rotation.y;
    face = Math.atan2(Math.sin(face), Math.cos(face));
    set.elder.group.rotation.y += face * Math.min(1, delta * 2);
    set.elder.group.scale.y = 1 + 0.008 * Math.sin(t * 1.7);
    // Everything that stands on the snow has its patch of shadow under it.
    let shade = 0;
    set.shadows.lay(shade++, set.sledge.position.x - ahead.x * 0.2, 0, set.sledge.position.z - ahead.z * 0.2, 1.5);
    set.shadows.lay(shade++, teller != null ? TELLER.x : set.elder.group.position.x, 0, teller != null ? TELLER.z : set.elder.group.position.z, 1.1);
    set.shadows.lay(shade++, set.standard.group.position.x, 0, set.standard.group.position.z, 0.5);
    for (const m of everyBeast) if (m.group.visible) set.shadows.lay(shade++, m.group.position.x, 0, m.group.position.z, 4.6 * m.size);
    for (const wolf of set.wolves) set.shadows.lay(shade++, wolf.group.position.x, wolf.group.position.y - 0.03, wolf.group.position.z, 1.1);
    set.shadows.done(shade);
    vignette.update(delta);
    set.lantern.intensity = 10.5 + 0.9 * Math.sin(t * 7) + 0.6 * Math.sin(t * 19);
    set.fire.intensity = 13 + 2.5 * Math.sin(t * 9) + 1.5 * Math.sin(t * 21 + 2);
    set.flames.rotation.y = Math.atan2(d.eyeAt.x - FIRE.x, d.eyeAt.z - FIRE.z);
    set.flames.scale.set(1 + 0.12 * Math.sin(t * 15), 1 + 0.2 * Math.sin(t * 11 + 2), 1);
    for (const wolf of set.wolves) wolf.eyes.scale.setScalar(Math.min(10, Math.max(1, wolf.eyes.getWorldPosition(eyeAt).distanceTo(d.eyeAt) / 4.5)));
    if (scene == null) return;
    scene.cast.forEach((m, i) => {
      stirMammoth(m, delta, scene?.walking ?? 0);
      let turn = (scene?.yaws[i] ?? 0) - m.group.rotation.y;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      m.group.rotation.y += turn * Math.min(1, delta * 1.6);
    });
    // The dark comes down with the wolves.
    const k = Math.min(1, 0.22 * game.stage + 0.6 * scene.down);
    if (Math.abs(k - dark) > 0.01) {
      dark = k;
      d.stage.blendWeather(DUSK, NIGHT, k);
    }
  });
  // Dev: ?stage=2 or ?stage=3 starts at that stage.
  const patience = Math.max(1, Number(devParam('patience') ?? 1));
  const from = Math.max(1, Math.min(STAGES.length, Number(devParam('stage') ?? 1))) - 1;
  while (game.phase !== 'won') {
    await d.until(() => game.phase === 'playing' || game.phase === 'won');
    if (game.phase !== 'playing') continue;
    const n = game.stage;
    if (n < from) {
      set.standard.light(n + 1);
      game.win();
      continue;
    }
    const fails = game.failuresOf(n);
    const rules = fails >= MERCY ? eased(STAGES[n]) : STAGES[n];
    // Dev: ?patience=8 stretches the dusk and slows the herd (a test bot's hands are slow on a loaded machine).
    const stage: ValleyStage = patience === 1 ? rules : { ...rules, dusk: rules.dusk * patience, drift: rules.drift / patience };
    const now: Scene = layOut(d, set, stage);
    scene = now;
    if (import.meta.env.DEV) console.info(`[valley] stage ${n + 1}: ${stage.name}${fails >= MERCY ? ' (eased)' : ''}${fails >= HINT_AFTER ? ' (hint)' : ''}, attempt ${fails + 1}`);
    void d.rig.fadeTo(0);
    // The memory's first words: what is to be done, and what is won.
    if (!spoken) {
      spoken = true;
      d.onSkip(() => {});
      if (teller != null) teller.pose = 'talk';
      await d.captions.say('S25-0', says(), 0.3);
      if (teller != null) teller.pose = 'idle';
    }
    let howls = 0;
    const strayedAt = new Vector3();
    const outcome = await playRing(d, set.fence, {
      stage,
      origin: new Vector3(0, 0, 0),
      // The very first stake and span are a rehearsal: nothing moves until the first span is tied.
      patient: n === 0 && fails === 0,
      hint: fails >= HINT_AFTER,
      paused,
      seat: (eye, yaw) => {
        set.sledge.position.set(eye.x, 0, eye.z);
        set.sledge.rotation.y = yaw;
        seatYaw = yaw;
      },
      tick: (delta, state): Loss | null => {
        now.down = wolvesDown(stage, state.clock);
        placeWolves(set, now, d.now, null, 0);
        now.seat = stage.holes[state.at];
        // The gap still open in front of the keeper: to the hole to stake next (from a hole not yet staked, the one after it).
        const next = hintFor(stage, state.ring);
        const after = stage.answer[(stage.answer.indexOf(state.at) + 1) % stage.answer.length];
        const staked = state.ring.order;
        // Back at the first stake to close the ring, the open gap is the last one, behind the last stake.
        const closing = staked.length >= 3 && state.at === staked[0];
        now.gap = stage.holes[closing ? staked[staked.length - 1] : next === state.at ? after : next];
        nearWolf(set, now, d.now);
        if (import.meta.env.DEV && now.down >= 0.1 && d.now - wolfLog > 5) {
          // For the bot: is that wolf where a seated look finds it.
          wolfLog = d.now;
          set.wolves[0].group.getWorldPosition(wolfSeen).sub(d.eyeAt);
          const far = Math.hypot(wolfSeen.x, wolfSeen.z) || 1;
          const off = Math.acos(Math.max(-1, Math.min(1, -(wolfSeen.x * Math.sin(seatYaw) + wolfSeen.z * Math.cos(seatYaw)) / far)));
          console.info(`[valley] wolf ${far.toFixed(1)} m from the keeper, ${((off * 180) / Math.PI).toFixed(0)} deg off the seat's heading`);
        }
        set.coil.scale.setScalar(0.45 + 0.55 * (ropeLeft(stage, state.ring) / stage.rope));
        // The wolves' voices come nearer.
        if (now.down > [0.02, 0.5, 0.82][howls]) {
          d.sounds.play('wolf_howl', 0.25 + 0.22 * howls, 1 - 0.04 * howls);
          howls += 1;
          if (import.meta.env.DEV) console.info(`[valley] wolves ${(now.down * 100).toFixed(0)}% down`);
        }
        // The second stage's bulls do not wait for the wolves: they go for the hills.
        if (now.down > 0.72) leaveForHills(now, delta);
        const walk = state.running ? stepHerd(now.herd, stage, state.fenced, delta) : { strayed: -1, turned: false };
        now.walking = stage.drift > 0 && state.running ? 1 : 0;
        now.cast.forEach((m, i) => {
          if (stage.herd[i].core || now.gone === 0) m.group.position.set(now.herd.at[i].x, m.group.position.y, now.herd.at[i].z);
          if (stage.drift > 0) now.yaws[i] = (now.herd.way * Math.PI) / 2;
        });
        if (walk.turned) {
          d.sounds.play('mammoth_call', 0.45, 1.1);
          if (import.meta.env.DEV) console.info(`[valley] the herd turns at the line, ${state.clock.toFixed(1)} s`);
        }
        if (walk.strayed >= 0) {
          strayedAt.set(now.herd.at[walk.strayed].x, 0, now.herd.at[walk.strayed].z);
          return 'strayed';
        }
        if (state.clock >= stage.dusk && !state.ring.closed) return 'open';
        return null;
      },
      herd: () => now.herd.at,
      // The ring is dotted on the snow, except where choosing it is the stage.
      plan: n !== 1,
      phase: (kind, _staked, closing) => {
        // The elder talks the keeper through each move the first time it comes.
        if (!coached.has(kind) && n === 0) {
          coached.add(kind);
          if (teller != null) teller.pose = 'talk';
          void d.captions.say(kind === 'drive' ? 'S25-a' : kind === 'haul' ? 'S25-b' : 'S25-c', says(), 0.3).then(() => {
            if (teller != null && teller.pose === 'talk') teller.pose = 'idle';
          });
        }
        const now2 = kind === 'drive' ? 'slam the band green.' : kind === 'haul' ? 'haul till the rags fly.' : closing ? 'point at the first stake.' : 'point at the next hole.';
        setGoal({ where: WHERE, now: `Earn the word RING-FENCE: ${now2}`, steps: [n, STAGES.length] });
      },
      hintGlow: set.hintGlow,
      tag: 'valley',
    });
    if (outcome.won) {
      // The knot is tied: half a second of nothing but the wind, then the wolves come down to try it.
      d.onSkip(() => {});
      await d.wait(0.5);
      await holdsScene(d, set, now, outcome);
      // The stage's lantern on the standard.
      set.standard.light(n + 1);
      setGoal({ where: WHERE, now: 'Earn the word RING-FENCE: the ring holds.', steps: [n + 1, STAGES.length] });
      d.sounds.play('ear_click', 0.8, 0.8);
      game.win();
      if (n < STAGES.length - 1) await d.rig.fadeTo(1);
    } else {
      // The loss, in the keeper's own body: the view closes in, every sound falls away but the heart.
      vignette.set(0.55);
      d.sounds.bed('heartbeat_loop', 0.8);
      d.sounds.bed('wind_loop', 0.08);
      await breaksScene(d, set, now, outcome, strayedAt);
      vignette.set(1);
      d.sounds.bed('heartbeat_loop', 0);
      d.sounds.bed('wind_loop', 0.3);
      game.lose(outcome.reason);
    }
  }
  endMiniGame(game);
  setV2Targets([]);
  stowWing(false);
  // Won: the feather comes down from the standard into the keeper's hands, and the elder says the word aloud; the parrot learns it by hearing it.
  taken = true;
  const feather = set.standard.feather;
  const start = feather.position.clone();
  const hand = new Vector3();
  await over(d, 1.5, (k) => {
    const front = new Vector3(0, 0, -1).applyQuaternion(d.player.head.getWorldQuaternion(turn)).setY(0).normalize();
    hand.copy(d.eyeAt).addScaledVector(front, 0.45).setY(d.eyeAt.y - 0.18).sub(set.standard.group.position);
    const ease = k * k * (3 - 2 * k);
    feather.position.copy(start).lerp(hand, ease);
    feather.position.y += 0.8 * Math.sin(Math.PI * k) * (1 - k);
    feather.scale.setScalar(1 - 0.72 * ease);
    // Its halo, a beacon over the herd, draws in as it comes to hand (or it would fill the view).
    feather.getObjectByName('FeatherGlow')?.scale.setScalar(1 - 0.8 * ease);
    feather.rotation.y = Math.atan2(d.eyeAt.x - set.standard.group.position.x - feather.position.x, d.eyeAt.z - set.standard.group.position.z - feather.position.z);
  });
  d.sounds.play('feather_rustle', 0.7);
  setGoal({ where: WHERE, now: 'Carry the word RING-FENCE back to Gray.', steps: [STAGES.length, STAGES.length] });
  if (teller != null) teller.pose = 'talk';
  await d.captions.say('S25-1', says(), 0.3);
  parrotWords.learn(WORDS.ringFence, FEATHER.ringFence);
  ambient();
  // The teller goes back to the square as he stood.
  if (teller != null) teller.pose = 'hidden';
  if (teller != null && home != null) teller.at(home.at.x, home.at.y, home.at.z, home.yaw);
  vignette.dispose();
  d.sounds.bed('wind_loop', 0);
}

const prowl = new Vector3();
const lair = new Vector3();
const wolfSeen = new Vector3();
let wolfLog = 0;
/** How fast that wolf trots round to the next gap (m/s). */
const TROT = 3.2;

/**
 * As the wolves start down, one of them leaves the others and comes for the
 * gap the keeper has still to close: it waits in front of the keeper, between
 * the stake and the next hole, nearer as the dark comes, its eyes on the
 * keeper. When that gap is closed it trots round to the next one.
 */
function nearWolf(set: ValleySet, scene: Scene, time: number): void {
  const hole = scene.seat;
  if (hole == null || scene.down < 0.1 || scene.prowl <= 0) return;
  const wolf = set.wolves[0];
  // A third of the way to the next hole (half way is past the edge of a seated look), outside the line at first and a step
  // inside it once the dark has come: the keeper faces the middle, so only at the line is the wolf well inside the view.
  const gapTo = scene.gap ?? hole;
  const mx = hole.x + (gapTo.x - hole.x) * 0.35;
  const mz = hole.z + (gapTo.z - hole.z) * 0.35;
  const out = Math.hypot(mx, mz) || 1;
  const near = 1.2 - 1.4 * Math.min(1, (scene.down - 0.1) / 0.4);
  const along = Math.sin(time * 0.7) * 0.4;
  prowl.set(mx + (mx / out) * near - (mz / out) * along, 0, mz + (mz / out) * near + (mx / out) * along);
  const far = lair.distanceTo(prowl);
  if (scene.lairAt < 0) lair.copy(prowl);
  else if (far > 1e-4) lair.lerp(prowl, Math.min(1, (TROT * Math.max(0, time - scene.lairAt)) / far));
  scene.lairAt = time;
  const k = Math.min(1, (scene.down - 0.1) / 0.12) * scene.prowl;
  wolf.group.position.lerp(lair, k);
  wolf.group.position.y = groundAt(wolf.group.position.x, wolf.group.position.z) + 0.03 * Math.abs(Math.sin(time * 7));
  // It keeps its face to the keeper.
  wolf.group.rotation.y = Math.atan2(hole.x - wolf.group.position.x, hole.z - wolf.group.position.z);
}

/** The beasts the ring was not for trot off east into the dark before the wolves arrive (the second stage's bulls). */
function leaveForHills(scene: Scene, delta: number): void {
  scene.stage.herd.forEach((b, i) => {
    if (b.core) return;
    const m = scene.cast[i];
    scene.gone += delta;
    scene.yaws[i] = 0.9;
    m.group.position.x += 2.6 * delta * Math.sin(0.9);
    m.group.position.z += 2.6 * delta * Math.cos(0.9);
    stirMammoth(m, delta, 1);
    if (m.group.position.x > 60) m.group.visible = false;
  });
}

/** Run `fn` with k going 0..1 over `seconds`. */
function over(d: DirectorSystem, seconds: number, fn: (k: number, delta: number) => void): Promise<void> {
  const start = d.now;
  return new Promise((done) => {
    const stop = d.each((delta) => {
      const k = Math.min(1, (d.now - start) / seconds);
      fn(k, delta);
      if (k >= 1) {
        stop();
        done();
      }
    });
    d.onSkip(() => {
      stop();
      fn(1, 0);
      done();
    });
  });
}

/** The ring holds: the wolves come down to the rags and stop; the stakes' lamps light one by one and the inside stays lit; the wolves go. */
async function holdsScene(d: DirectorSystem, set: ValleySet, scene: Scene, outcome: Outcome): Promise<void> {
  const from = scene.down;
  d.sounds.play('wolf_howl', 0.7);
  await over(d, 1.8, (k, delta) => {
    scene.down = from + (1 - from) * k;
    placeWolves(set, scene, d.now, null, 0);
    nearWolf(set, scene, d.now);
    if (scene.down > 0.72) leaveForHills(scene, delta);
  });
  const stakes = outcome.ring.order.length;
  set.fence.light(stakes);
  d.sounds.play('mammoth_call', 0.65);
  await over(d, 1.6, (k, delta) => {
    set.ringLight.intensity = 620 * k;
    placeWolves(set, scene, d.now, null, 0);
    nearWolf(set, scene, d.now);
    leaveForHills(scene, delta);
  });
  // The wolves turn at the rags and go back up.
  d.sounds.play('wolf_howl', 0.3, 0.9);
  await over(d, 2.6, (k, delta) => {
    scene.down = 1 - 0.75 * k;
    scene.prowl = 1 - k;
    placeWolves(set, scene, d.now, null, 0);
    nearWolf(set, scene, d.now);
    leaveForHills(scene, delta);
  });
  if (import.meta.env.DEV) console.info(`[valley] the ring holds: ${stakes} stakes, ${outcome.clock.toFixed(1)} s`);
}

/** The ring does not hold: the wolves come through where it is open, and the herd runs for the ridge (nothing is caught). */
async function breaksScene(d: DirectorSystem, set: ValleySet, scene: Scene, outcome: Outcome, strayedAt: Vector3): Promise<void> {
  const stage = scene.stage;
  const breach = new Vector3();
  const ring = outcome.ring;
  const hole = (i: number): Spot => stage.holes[ring.order[i]];
  if (!outcome.won && outcome.verdict?.kind === 'slack') {
    const a = hole(outcome.verdict.span);
    const b = hole((outcome.verdict.span + 1) % ring.order.length);
    breach.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  } else if (!outcome.won && outcome.verdict?.kind === 'left out') {
    breach.set(stage.herd[outcome.verdict.beast].x, 0, stage.herd[outcome.verdict.beast].z);
  } else if (!outcome.won && outcome.reason === 'strayed') {
    breach.copy(strayedAt);
  } else if (ring.order.length >= 2) {
    // The open side: between the last stake and the first.
    const a = hole(ring.order.length - 1);
    const b = hole(0);
    const wide = gap(a, b) < 0.5 ? 0 : 1;
    breach.set(((a.x + b.x) / 2) * wide, 0, ((a.z + b.z) / 2) * wide);
  } else breach.set(Math.sin(stage.wolvesFrom) * 5, 0, -Math.cos(stage.wolvesFrom) * 5);
  if (import.meta.env.DEV) console.info(`[valley] the ring breaks (${outcome.won ? '' : outcome.reason}) at ${breach.x.toFixed(1)}, ${breach.z.toFixed(1)}`);
  d.sounds.play('wolf_howl', 0.95);
  d.sounds.play('mammoth_call', 0.9, 1, 0.7);
  d.sounds.play('mammoth_call', 0.7, 0.85, 1.6);
  const away = new Vector3();
  const goal = new Vector3();
  const homes = scene.cast.map((m) => m.group.position.clone());
  const fading = d.wait(2.2).then(() => d.rig.fadeTo(1));
  await over(d, 3.0, (k) => {
    // The wolves: to the breach, then in.
    scene.down = Math.max(scene.down, Math.min(1, scene.down + 0.03));
    goal.copy(breach).multiplyScalar(k < 0.55 ? 1 : 1 - 0.85 * ((k - 0.55) / 0.45));
    placeWolves(set, scene, d.now, goal, Math.min(1, k / 0.55));
    scene.prowl = Math.max(0, 1 - k / 0.3);
    nearWolf(set, scene, d.now);
    // The herd: away from the breach, over the snow and out of the light.
    scene.walking = 1;
    const run = Math.max(0, k - 0.3) / 0.7;
    scene.cast.forEach((m, i) => {
      away.copy(homes[i]).sub(breach).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize();
      scene.yaws[i] = Math.atan2(away.x, away.z);
      m.group.position.set(homes[i].x + away.x * 22 * run * run, m.group.position.y, homes[i].z + away.z * 22 * run * run);
    });
  });
  await fading;
  scene.walking = 0;
}
