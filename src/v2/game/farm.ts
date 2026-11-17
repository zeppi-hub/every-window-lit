import { BoxGeometry, CylinderGeometry, DoubleSide, type Entity, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, Vector3 } from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { parrotWords } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { wordBadge } from '../icons.js';
import type { DirectorSystem } from './director.js';
import { makeGlow, mergeByMaterial } from './fx.js';
import { BOSSES, HEADLINES, WORDS } from './lines.js';
import { type CityCast, FEATHER, type Keepers } from './opening.js';
import { magpie as makeMagpie, showCard } from './run.js';
import { WEATHER } from './stage.js';

/**
 * The fourth problem of this build (META_VR_V2_TASARIM.md, S21-S23; the
 * fog and the wolves are not in scope 1a): a hot, dusty afternoon, the
 * fountain dry, the podium empty; Gray is found on a bench by a rusty old
 * pump, out of words (S21). In the drought farm the player pours the last
 * jug into the pump, works the lever, and lifts the channel's three gates
 * as the water reaches them (S22). Back in the city the treasury's jug goes
 * into the old pump and gold water runs down three stone troughs toward
 * the bakery, the homes and the factory, while people block them with
 * sandbags after the magpie's whisper (S23).
 */

/** Where the bird sits from S21 on (the bench's back, by Gray), and the old pump in front of it. */
export const BENCH_EYE = new Vector3(0.6, 1.4, -3.15);
const GRAY_AT_BENCH = new Vector3(-0.35, 0.15, -3.9);
const OLD_PUMP = new Vector3(0.62, 0.15, -3.85);

export interface OldPump {
  group: Group;
  lever: Entity;
  spout: Vector3;
}

/** The rusty pump on the square (1930s), made in code: its lever is a swing in reach of the bench's back. */
function oldPump(d: DirectorSystem): OldPump {
  const group = new Group();
  group.name = 'OldPump';
  const rust = new MeshStandardMaterial({ color: 0x6a3e26, roughness: 0.85, metalness: 0.4 });
  const body = new Mesh(new CylinderGeometry(0.09, 0.12, 0.95, 12), rust);
  body.position.y = 0.48;
  const cap = new Mesh(new CylinderGeometry(0.11, 0.09, 0.08, 12), rust);
  cap.position.y = 0.98;
  const spout = new Mesh(new CylinderGeometry(0.03, 0.035, 0.28, 8), rust);
  spout.rotation.x = Math.PI / 2;
  spout.position.set(0, 0.72, -0.16);
  const plaque = new Mesh(new PlaneGeometry(0.12, 0.07), new MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.7 }));
  plaque.position.set(0, 0.55, 0.125);
  group.add(body, cap, spout, plaque);
  mergeByMaterial(group);
  group.position.copy(OLD_PUMP);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  const entity = d.world.createTransformEntity(group, { persistent: true });
  // The lever: from the cap toward the bench; pushed down and let go it is one stroke.
  const lever = new Group();
  lever.name = 'OldPumpLever';
  const bar = new Mesh(new CylinderGeometry(0.018, 0.018, 0.5, 8), rust);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, 0, 0.25);
  const knob = new Mesh(new CylinderGeometry(0.03, 0.03, 0.1, 10), rust);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0, 0, 0.5);
  lever.add(bar, knob);
  const leverEntity = d.world.createTransformEntity(lever, { parent: entity, persistent: true });
  leverEntity.addComponent(PathHandle, { kind: PathKindEnum.Swing, a: [0, 0.98, 0], axis: [1, 0, 0], from: -0.15, to: 0.45, grip: [0, 0, 0.5], reach: 0.1, progress: 0, rest: 0, returnSpeed: 2.2 });
  d.stage.own('city', group);
  return { group, lever: leverEntity, spout: OLD_PUMP.clone().add(new Vector3(0, 0.72, -0.3)) };
}

/** The fountain's water, shown or dried up. */
function fountainWater(cast: CityCast, on: boolean): void {
  for (const name of ['fountain_water', 'bowl_water', 'jet']) {
    const node = cast.fountain.getObjectByName(name);
    if (node != null) node.visible = on;
  }
}

export interface Afternoon {
  pump: OldPump;
  ear: Group;
}

/** S21: a dusty afternoon; the fountain dry, the podium empty; Gray on a bench by the old pump; the farmer's line. */
export async function s21(d: DirectorSystem, cast: CityCast, keepers: Keepers): Promise<Afternoon> {
  d.chapter('S21');
  d.rain.on = false;
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 3);
    d.stage.blendWeather(WEATHER.rain2008, WEATHER.dusty2008, k);
    return k >= 1;
  });
  fountainWater(cast, false);
  cast.gray.pose = 'hidden';
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.shut },
  ]);
  d.sounds.play('paper', 0.6);
  // Gray, found where the old man will sit in 2041: on the bench by the rusty pump, his head down.
  const pump = oldPump(d);
  cast.gray.at(GRAY_AT_BENCH.x, GRAY_AT_BENCH.y, GRAY_AT_BENCH.z).face(OLD_PUMP.x, OLD_PUMP.z);
  cast.gray.pose = 'idle';
  const perch = d.marker(BENCH_EYE.clone().add(new Vector3(0, -0.15, 0)), 'BenchBack');
  await d.choosePerch([perch]);
  await d.rig.move(BENCH_EYE, 0);
  const ear = d.marker(cast.gray.head(new Vector3()).add(new Vector3(0.05, -0.13, -0.06)), 'GrayEar');
  await d.captions.say('S21-1', cast.gray.head(new Vector3()), 0.25);
  await d.captions.say('S21-2', keepers.people[4].head(new Vector3()), 0.3);
  return { pump, ear };
}

/** S22, the drought farm: the jug into the pump, five strokes of the lever; then lift the channel's gates as the water reaches them. */
export async function s22(d: DirectorSystem): Promise<void> {
  d.chapter('S22');
  await d.stage.show('farm', WEATHER.drought);
  d.rain.on = false;
  // A little nearer the pump than the stool, so the lever's grip is in a seated arm's reach.
  const eye = d.stage.point('farm', 'seat_pump', new Vector3()).add(new Vector3(0, 1.2, -0.3));
  d.rig.place(eye, 0);
  const rootEntity = d.stage.entity('farm');
  if (rootEntity == null) return;
  d.sounds.bed('wind_loop', 0.3);
  // The pump's lever (its fulcrum the node's pivot; pushed down, let go, one stroke).
  const handleNode = d.stage.node('farm', 'pump_handle');
  let lever: Entity | null = null;
  if (handleNode != null) {
    handleNode.removeFromParent();
    lever = d.world.createTransformEntity(handleNode, { parent: rootEntity, persistent: true });
    const gripAt = d.stage.point('farm', 'pump_handle_grip', new Vector3());
    lever.addComponent(PathHandle, { kind: PathKindEnum.Swing, a: handleNode.position.toArray(), axis: [1, 0, 0], from: 0, to: 0.5, grip: gripAt.sub(handleNode.position).toArray(), reach: 0.1, rayReach: 0.6, progress: 0, rest: 0, returnSpeed: 2.2 });
  }
  // The jug: from the shade on the left, carried in reach to over the priming cup; at the end it pours.
  const jugNode = d.stage.node('farm', 'pitcher');
  let jug: Entity | null = null;
  const jugFrom = eye.clone().add(new Vector3(-0.34, -0.48, -0.22));
  const jugTo = eye.clone().add(new Vector3(-0.04, -0.3, -0.48));
  if (jugNode != null) {
    jugNode.removeFromParent();
    jug = d.world.createTransformEntity(jugNode, { parent: rootEntity, persistent: true });
    jug.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: jugFrom.toArray(), b: jugTo.toArray(), grip: [0, 0.2, 0], reach: 0.12, rayReach: 0.6, progress: 0, rest: 0, returnSpeed: 1.6 });
  }
  const stream = d.stage.node('farm', 'pump_water_stream');
  if (stream != null) stream.visible = false;
  const channels = ['channel_water_main', 'channel_water_left', 'channel_water_right'].map((n) => d.stage.node('farm', n));
  for (const c of channels) if (c != null) c.scale.z = 0.001;
  // Three plank gates along the main channel, lifted from the stool by ray as the water reaches each.
  const plank = new MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 });
  const gates = [-3.8, -7.4, -11.0].map((z, i) => {
    const gate = new Mesh(new BoxGeometry(0.9, 0.55, 0.08), plank);
    gate.name = `ChannelGate ${i + 1}`;
    const reachBox = new Mesh(new BoxGeometry(1.4, 1.4, 1.0), new MeshBasicMaterial());
    reachBox.visible = false;
    reachBox.pointerEvents = 'none';
    gate.add(reachBox);
    const entity = d.world.createTransformEntity(gate, { parent: rootEntity, persistent: true });
    entity.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: [0, 0.1, z], b: [0, 0.65, z], grip: [0, 0.25, 0], reach: 0.12, rayReach: 16, progress: 0, rest: -1 });
    return { gate, entity, z };
  });
  const glow = makeGlow(d.world, 0x9ad0ff, 0.3);
  glow.visible = false;
  d.stage.own('farm', glow);

  const game = playMiniGame(new MiniGame(WORDS.primeThePump, [{ name: 'prime and pump' }, { name: 'three gates' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const phase = () => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    if (phase() !== 'playing') continue;
    const stage = game.stage;
    const hint = game.failuresOf(stage) >= HINT_AFTER;
    const paused = () => minis?.playPaused ?? false;
    const won = stage === 0 ? await primeAndPump(d, jug, lever, stream, paused) : await threeGates(d, gates, channels, glow, hint, paused);
    if (won) game.win();
    else game.lose(stage === 0 ? 'time' : 'the water ran into the sand');
  }
  endMiniGame(game);
  setV2Targets([]);
  await d.captions.say('S22-1', d.stage.point('farm', 'spot_farmer', new Vector3()).add(new Vector3(0, 1.8, 0)), 0);
  parrotWords.learn(WORDS.primeThePump, FEATHER.primeThePump);
  d.sounds.bed('wind_loop', 0);
  d.sounds.bed('pump_water_loop', 0);
}

/** Stage 1: the jug carried over the cup pours; then five full strokes of the lever bring the water. */
function primeAndPump(d: DirectorSystem, jug: Entity | null, lever: Entity | null, stream: Object3D | null, paused: () => boolean): Promise<boolean> {
  let primed = false;
  let strokes = lever?.getValue(PathHandle, 'strokes') ?? 0;
  let pumped = 0;
  let t = 0;
  jug?.setValue(PathHandle, 'progress', 0);
  if (jug?.object3D != null) setV2Targets([jug.object3D]);
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
      if (!primed && (jug?.getValue(PathHandle, 'progress') ?? 0) >= 0.85) {
        primed = true;
        d.sounds.play('water_pour', 0.7);
        if (jug?.object3D != null) jug.object3D.rotation.z = -1.1;
        if (lever?.object3D != null) setV2Targets([lever.object3D]);
        if (import.meta.env.DEV) console.info(`[farm] primed at ${t.toFixed(1)} s`);
      }
      const now = lever?.getValue(PathHandle, 'strokes') ?? 0;
      if (primed && now > strokes) {
        pumped += now - strokes;
        d.sounds.play('pump_stroke', 0.8);
        if (import.meta.env.DEV) console.info(`[farm] stroke ${pumped}/5`);
      }
      strokes = now;
      if (pumped >= 5) {
        if (stream != null) stream.visible = true;
        d.sounds.bed('pump_water_loop', 0.6);
        finish(true);
        return;
      }
      if (t > 40) finish(false);
    });
    d.onSkip(() => {
      if (stream != null) stream.visible = true;
      finish(true);
    });
  });
}

/** Stage 2: the water runs down the main channel; each gate must be up before the water gets there, then it fills the fields. */
function threeGates(d: DirectorSystem, gates: { gate: Mesh; entity: Entity; z: number }[], channels: (Object3D | null)[], glow: Mesh, hint: boolean, paused: () => boolean): Promise<boolean> {
  const start = -0.85;
  const length = 11.15;
  // Seconds for the water to get from one gate to the next: each shorter.
  const legs = [6, 5, 4].map((s) => s + (hint ? 2 : 0));
  for (const g of gates) {
    g.entity.setValue(PathHandle, 'progress', 0);
    g.entity.setValue(PathHandle, 'rayReach', 16);
  }
  if (channels[0] != null) channels[0].scale.z = 0.001;
  for (const c of channels.slice(1)) if (c != null) c.scale.z = 0.001;
  let leg = 0;
  let t = 0;
  let at = start;
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      glow.visible = false;
      setV2Targets([]);
      done(result);
    };
    setV2Targets([gates[0].gate]);
    const stop = d.each((delta) => {
      if (paused()) return;
      if (leg >= gates.length) {
        // Through the last gate: both fields fill.
        t += delta;
        const k = Math.min(1, t / 2);
        for (const c of channels.slice(1)) if (c != null) c.scale.z = Math.max(0.001, k);
        if (k >= 1) finish(true);
        return;
      }
      const gate = gates[leg];
      const from = leg === 0 ? start : gates[leg - 1].z;
      t += delta;
      const k = Math.min(1, t / legs[leg]);
      at = from + (gate.z - from) * k;
      if (channels[0] != null) channels[0].scale.z = Math.max(0.001, (start - at) / length);
      // The next gate glows, more brightly as a hint.
      glow.visible = true;
      glow.position.set(0, 0.6, gate.z);
      glow.scale.setScalar(hint ? 1.6 + 0.3 * Math.sin(t * 6) : 1);
      const up = (gate.entity.getValue(PathHandle, 'progress') ?? 0) >= 0.9;
      if (k >= 1) {
        if (!up) {
          if (import.meta.env.DEV) console.info(`[farm] the water reached gate ${leg + 1} shut`);
          finish(false);
          return;
        }
        if (import.meta.env.DEV) console.info(`[farm] through gate ${leg + 1}`);
        // A gate the water is through can no longer be taken: the ray goes past it to the next.
        gate.entity.setValue(PathHandle, 'rayReach', 0);
        leg += 1;
        t = 0;
        if (leg < gates.length) setV2Targets([gates[leg].gate]);
      }
    });
    d.onSkip(() => finish(true));
  });
}

/** S23, THE DROUGHT: the treasury's jug into the old pump, the lever, and gold water down three troughs, each longer; sandbags to clear. */
export async function s23(d: DirectorSystem, cast: CityCast, after: Afternoon): Promise<void> {
  d.chapter('S23');
  const head = d.player.head;
  void d.gold.show(WORDS.primeThePump.toUpperCase(), cast.gray.head(new Vector3()).add(new Vector3(0, 0.2, 0.3)), 1.3, 3.0, new Vector3(0, 0.25, 0.4), head, wordBadge(WORDS.primeThePump));
  await d.captions.say('S23-1', cast.gray.head(new Vector3()), 0.25);
  void d.gold.show(BOSSES.drought.name, new Vector3(0.6, 4.5, -9), 3.2, 2.6, new Vector3(0, 0.15, 0), head);
  // Three stone troughs from the pump: toward the bakery, the homes and the factory; each longer than the last.
  const stone = new MeshStandardMaterial({ color: 0x77706a, roughness: 0.95 });
  const goldWater = new MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false, transparent: true, opacity: 0.9 });
  // All three ahead of the bench (east, west, north: toward the homes, the bakery and the factory), each longer than the last.
  const ends = [new Vector3(7.6, 0.15, -9.0), new Vector3(-7.6, 0.15, -10.0), new Vector3(0.6, 0.15, -15.8)];
  const beds = new Group();
  beds.name = 'Troughs';
  const troughs = ends.map((end) => {
    const from = OLD_PUMP.clone().setY(0.15);
    const along = end.clone().sub(from);
    const length = along.length();
    const yaw = Math.atan2(along.x, along.z);
    const bed = new Mesh(new BoxGeometry(0.42, 0.14, length), stone);
    bed.position.copy(from).addScaledVector(along, 0.5).setY(0.2);
    bed.rotation.y = yaw;
    // The gold water: a strip lying in the trough from the pump, along its local -z, as long as its z scale.
    const strip = new PlaneGeometry(0.3, 1);
    strip.translate(0, 0.5, 0);
    strip.rotateX(-Math.PI / 2);
    const water = new Mesh(strip, goldWater);
    water.position.copy(from).setY(0.28);
    water.rotation.y = yaw + Math.PI;
    water.scale.z = 0.01;
    water.visible = false;
    bed.pointerEvents = 'none';
    water.pointerEvents = 'none';
    beds.add(bed);
    d.world.createTransformEntity(water, { persistent: true });
    d.stage.own('city', water);
    return { from, end, along, length, yaw, water };
  });
  // The three stone beds, drawn as one.
  mergeByMaterial(beds);
  d.world.createTransformEntity(beds, { persistent: true });
  d.stage.own('city', beds);
  const jug = new Mesh(new CylinderGeometry(0.07, 0.09, 0.24, 12), new MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.3, metalness: 0.8 }));
  jug.name = 'TreasuryJug';
  const jugFrom = BENCH_EYE.clone().add(new Vector3(-0.3, -0.45, -0.15));
  const jugTo = BENCH_EYE.clone().add(new Vector3(0.02, -0.32, -0.55));
  const jugEntity = d.world.createTransformEntity(jug, { persistent: true });
  jugEntity.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: jugFrom.toArray(), b: jugTo.toArray(), grip: [0, 0.12, 0], reach: 0.12, progress: 0, rest: 0, returnSpeed: 1.6 });
  d.stage.own('city', jug);
  const bird = makeMagpie(d);
  bird.visible = false;
  d.stage.own('city', bird);
  const bag = new Mesh(new BoxGeometry(0.55, 0.3, 0.4), new MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }));
  bag.name = 'Sandbag';
  const reachBox = new Mesh(new BoxGeometry(1.2, 1.2, 1.2), new MeshBasicMaterial());
  reachBox.visible = false;
  reachBox.pointerEvents = 'none';
  bag.add(reachBox);
  bag.visible = false;
  const bagEntity = d.world.createTransformEntity(bag, { persistent: true });
  d.stage.own('city', bag);

  const game = playMiniGame(new MiniGame(WORDS.primeThePump, [{ name: 'the drought' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const phase = () => game.phase;
  let primed = false;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    if (phase() !== 'playing') continue;
    const hint = game.failuresOf(0) >= HINT_AFTER;
    for (const tr of troughs) tr.water.visible = false;
    // The treasury's jug into the pump (once).
    if (!primed) {
      setV2Targets([jug]);
      await d.until(() => (jugEntity.getValue(PathHandle, 'progress') ?? 0) >= 0.85);
      primed = true;
      jug.visible = false;
      d.sounds.play('water_pour', 0.7);
    }
    let lost = false;
    let skipped = false;
    d.onSkip(() => {
      skipped = true;
    });
    for (let r = 0; r < troughs.length && !lost && !skipped; r += 1) {
      if (r === 1) {
        bird.position.set(-1.5, 0.95, -4.6);
        bird.lookAt(BENCH_EYE);
        bird.visible = true;
        bird.userData.clip = 'talk';
        await d.captions.say('S23-2', bird, 0.25);
        bird.userData.clip = 'idle';
        bird.visible = false;
      }
      lost = !(await runTrough(d, troughs[r], after.pump.lever, r > 0 ? { bag, entity: bagEntity } : null, 15 - r + (hint ? 3 : 0), () => minis?.playPaused ?? false));
    }
    if (skipped || !lost) game.win();
    else game.lose('the water stopped short');
  }
  endMiniGame(game);
  setV2Targets([]);
  // Won: the troughs run, green shoots between the cobbles; the treasury nearly empty.
  for (const tr of troughs) {
    tr.water.visible = true;
    tr.water.scale.z = tr.length;
  }
  d.sounds.play('applause', 0.6);
  await d.gold.show(BOSSES.drought.won, new Vector3(0.6, 3.5, -8), 2.8, 2.8, new Vector3(0, 0.2, 0), head);
  // Forty shoots, drawn as one.
  const shoot = new MeshBasicMaterial({ color: 0x5aa04a, side: DoubleSide });
  const shoots = new Group();
  shoots.name = 'Shoots';
  for (let i = 0; i < 40; i += 1) {
    const s = new Mesh(new PlaneGeometry(0.06, 0.12), shoot);
    s.position.set(Math.sin(i * 2.4) * (2 + (i % 7)), 0.2, -4 + Math.cos(i * 1.7) * (2 + (i % 5)));
    s.rotation.y = i;
    shoots.add(s);
  }
  mergeByMaterial(shoots);
  shoots.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(shoots, { persistent: true });
  d.stage.own('city', shoots);
  fountainWater(cast, true);
  d.day.problem = 5;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;
  await showCard(d, 'primeThePump');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.shut, struck: HEADLINES.runs },
  ]);
}

/** One trough: strokes of the lever push the gold water along it; a sandbag on it (rounds 2 and 3) must be dragged aside. */
function runTrough(
  d: DirectorSystem,
  trough: { from: Vector3; along: Vector3; length: number; water: Mesh },
  lever: Entity,
  block: { bag: Mesh; entity: Entity } | null,
  seconds: number,
  paused: () => boolean,
): Promise<boolean> {
  let reach = 0;
  let moved = false;
  let strokes = lever.getValue(PathHandle, 'strokes') ?? 0;
  let t = 0;
  const step = trough.length / 5;
  const side = new Vector3(-trough.along.z, 0, trough.along.x).normalize();
  const bagAt = trough.from.clone().addScaledVector(trough.along, 0.55).setY(0.32);
  if (block != null) {
    block.bag.visible = true;
    if (!block.entity.hasComponent(PathHandle)) block.entity.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: bagAt.toArray(), b: bagAt.clone().addScaledVector(side, 1.2).toArray(), grip: [0, 0.15, 0], reach: 0.12, rayReach: 16, progress: 0, rest: -1 });
    else {
      block.entity.setValue(PathHandle, 'progress', 0);
      const a = block.entity.getVectorView(PathHandle, 'a');
      a[0] = bagAt.x;
      a[1] = bagAt.y;
      a[2] = bagAt.z;
    }
  }
  setV2Targets(block != null ? [lever.object3D as Object3D, block.bag] : [lever.object3D as Object3D]);
  if (import.meta.env.DEV) {
    const local = d.player.worldToLocal(bagAt.clone());
    console.info(`[drought] round on a ${trough.length.toFixed(1)} m trough${block != null ? `, sandbag at ${local.toArray().map((v) => v.toFixed(2))} (player space)` : ''}`);
  }
  trough.water.visible = true;
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      if (block != null) block.bag.visible = false;
      done(result);
    };
    const stop = d.each((delta) => {
      if (paused()) return;
      t += delta;
      // The sandbag dragged off the trough: set down with a thump, its sand shifting.
      if (block != null && !moved && (block.entity.getValue(PathHandle, 'progress') ?? 0) >= 0.8) {
        moved = true;
        d.sounds.play('sandbag_drop', 0.7);
        d.sounds.play('sand_pour', 0.4);
      }
      const now = lever.getValue(PathHandle, 'strokes') ?? 0;
      if (now > strokes) {
        d.sounds.play('pump_stroke', 0.8);
        const blocked = block != null && (block.entity.getValue(PathHandle, 'progress') ?? 0) < 0.8;
        const limit = blocked ? trough.length * 0.5 : trough.length;
        reach = Math.min(limit, reach + step * (now - strokes));
        if (import.meta.env.DEV) console.info(`[drought] water ${reach.toFixed(1)} of ${trough.length.toFixed(1)} m${blocked ? ' (sandbag)' : ''}`);
      }
      strokes = now;
      trough.water.scale.z = Math.max(0.01, reach);
      if (reach >= trough.length - 0.01) {
        finish(true);
        return;
      }
      if (t >= seconds) {
        if (import.meta.env.DEV) console.info(`[drought] the water stopped at ${reach.toFixed(1)} of ${trough.length.toFixed(1)} m`);
        finish(false);
      }
    });
    d.onSkip(() => finish(true));
  });
}
