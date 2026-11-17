import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  type Entity,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Raycaster,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { parrotWords } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { wordBadge } from '../icons.js';
import type { DirectorSystem } from './director.js';
import { Flames, makeGlow, mergeByMaterial } from './fx.js';
import { BOSSES, HEADLINES, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, FEATHER, type Keepers, prop } from './opening.js';
import { LAMP_EYE_SOUTH, showCard } from './run.js';
import { WEATHER } from './stage.js';

/**
 * The second problem and its word (S08-S10): a
 * little bank of playing cards falls and a cold blue fire leaps to the
 * wires strung between the buildings, putting out the bulbs one by one
 * (S08); in the forest memory the player digs a firebreak with a spade
 * (H6, full strokes) and smothers sparks with a wet sack (S09); back in the
 * city, "firewall" lets the player draw lines down the street, and a gold
 * wall rises along each to stop the fire before it reaches the family (S10).
 */

const spot = new Vector3();

/** Where the card bank stands on the square, and where each person's family lives (a facade found from the square). */
const CARD_BANK = new Vector3(1.0, 0.15, -9.4);
const FAMILY_LOOK: Readonly<Record<PersonaId, { from: [number, number, number]; dir: [number, number, number]; fallback: [number, number, number] }>> = {
  maya: { from: [-12, 2.2, 0.6], dir: [-1, 0, 0], fallback: [-21.1, 0.15, 0.6] },
  leo: { from: [10, 2.2, -2.0], dir: [1, 0, 0.05], fallback: [20.5, 0.15, -2.0] },
  sam: { from: [-3, 2.2, 6.0], dir: [0, 0, 1], fallback: [-3, 0.15, 12.5] },
};

/** The fire's road: the wires from the card bank to the family's facade, and the bulbs hung on them. */
export interface Wires {
  /** Where the family lives: on the facade at the ground (its outward normal in `facing`). */
  family: Vector3;
  facing: Vector3;
  spans: CatmullRomCurve3[];
  bulbs: InstancedMesh;
  /** Each bulb's span and place along it (0..1). */
  bulbAt: { span: number; t: number }[];
  flames: Flames;
  stop: () => void;
  /** Where the fire is: which span and how far along (0..1); the scenes move it. */
  fire: { span: number; t: number; on: boolean };
}

/** The family's facade: a ray from the square at shop-window height; the hit and its outward normal. */
function familyFacade(d: DirectorSystem, persona: PersonaId): { at: Vector3; normal: Vector3 } {
  const look = FAMILY_LOOK[persona];
  const root = d.stage.root('city');
  const caster = new Raycaster(new Vector3(...look.from), new Vector3(...look.dir).normalize(), 0, 40);
  const hit = root == null ? undefined : caster.intersectObject(root, true).find((h) => h.face != null && Math.abs(h.face.normal.y) < 0.3);
  if (hit?.face == null) return { at: new Vector3(...look.fallback), normal: new Vector3(...look.dir).negate().normalize() };
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).setY(0).normalize();
  return { at: hit.point.clone().setY(0.15), normal };
}

/** The wires and bulbs (S08), made once; the fire's flames ride them. */
export function stringWires(d: DirectorSystem, persona: PersonaId): Wires {
  const { at: family, normal: facing } = familyFacade(d, persona);
  const high = family.clone().addScaledVector(facing, 0.2).setY(4.2);
  const start = CARD_BANK.clone().setY(4.6);
  const across = new Vector3().subVectors(high, start);
  const side = new Vector3(-across.z, 0, across.x).normalize();
  // Span 0 straight across (sagging), span 1 round by the south of the square.
  const mid0 = start.clone().lerp(high, 0.5).setY(3.6);
  const mid1 = start.clone().lerp(high, 0.5).addScaledVector(side, 6).setY(3.4);
  const spans = [new CatmullRomCurve3([start, start.clone().lerp(mid0, 0.5).setY(4.0), mid0, mid0.clone().lerp(high, 0.5).setY(3.8), high]), new CatmullRomCurve3([start, mid1, high])];
  const wire = new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  for (const span of spans) {
    const tube = new Mesh(new TubeGeometry(span, 48, 0.015, 5, false), wire);
    tube.name = 'Wire';
    tube.pointerEvents = 'none';
    d.world.createTransformEntity(tube, { persistent: true });
    d.stage.own('city', tube);
  }
  const bulbAt: { span: number; t: number }[] = [];
  spans.forEach((_, s) => {
    for (let i = 1; i < 14; i += 1) bulbAt.push({ span: s, t: i / 14 });
  });
  const bulbs = new InstancedMesh(new SphereGeometry(0.07, 8, 6), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), bulbAt.length);
  bulbs.name = 'Bulbs';
  bulbs.pointerEvents = 'none';
  const m = new Matrix4();
  const p = new Vector3();
  bulbAt.forEach((b, i) => {
    spans[b.span].getPointAt(b.t, p);
    p.y -= 0.08;
    bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    bulbs.setColorAt(i, LIT);
  });
  d.world.createTransformEntity(bulbs, { persistent: true });
  const flames = new Flames(d.world, 6, 0x5ab4ff);
  d.stage.own('city', bulbs, flames.mesh);
  const fire = { span: 0, t: 0, on: false };
  const at = new Vector3();
  const stop = d.each((delta) => {
    flames.burning = fire.on ? 6 : 0;
    if (fire.on) {
      // A tongue of cold fire at the point and a few trailing behind it along the wire.
      for (let k = 0; k < 6; k += 1) {
        spans[fire.span].getPointAt(Math.max(0, Math.min(1, fire.t - k * 0.012)), at);
        at.y -= 0.25;
        flames.place(k, at, 0.55 - k * 0.06);
      }
    }
    flames.update(delta, d.player.head);
  });
  return { family, facing, spans, bulbs, bulbAt, flames, stop, fire };
}

const LIT = new Color(1, 0.86, 0.55);
const DARK = new Color(0.08, 0.08, 0.1);

/** Bulbs behind the fire on its span go dark; `relight` lights them all again. */
function darkenBehind(w: Wires, relight = false): void {
  w.bulbAt.forEach((b, i) => {
    const dark = !relight && b.span === w.fire.span && b.t <= w.fire.t;
    if (dark || relight) w.bulbs.setColorAt(i, dark ? DARK : LIT);
  });
  if (w.bulbs.instanceColor != null) w.bulbs.instanceColor.needsUpdate = true;
}

/** The bank of playing cards (art/v2/nesne/card_bank.glb): standing as one mesh, then every card falling flat on cue. */
function cardBank(d: DirectorSystem): { group: Object3D; fall: (k: number) => void; settle: () => void } {
  const group = prop('card_bank');
  group.name = 'CardBank';
  group.position.copy(CARD_BANK);
  group.rotation.y = Math.atan2(CITY.grayAt.x - CARD_BANK.x, CITY.grayAt.z - CARD_BANK.z);
  const standing = group.getObjectByName('card_bank_standing');
  const loose = group.getObjectByName('cards');
  if (loose != null) loose.visible = false;
  const cards = (loose?.children ?? []).map((card, i) => {
    const flat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, ((i * 2.3) % 6.28) - 3.14, 0));
    const to = card.position.clone().add(new Vector3(Math.sin(i * 1.7) * 0.5, 0, Math.cos(i * 2.1) * 0.5));
    to.y = 0.01 + i * 0.002;
    return { card, from: card.position.clone(), to, start: card.quaternion.clone(), flat, lag: (card.position.y / 1.8) * 0.5 };
  });
  d.world.createTransformEntity(group, { persistent: true });
  d.stage.own('city', group);
  return {
    group,
    settle: () => {
      // Fallen flat, the 26 cards are drawn as one pile (one draw per material).
      if (loose != null) mergeByMaterial(loose);
    },
    fall: (k) => {
      if (standing != null) standing.visible = k <= 0;
      if (loose != null) loose.visible = k > 0;
      // The top cards go first and the house folds down.
      for (const c of cards) {
        const kk = Math.max(0, Math.min(1, (k - (0.5 - c.lag)) * 2));
        c.card.position.lerpVectors(c.from, c.to, kk * kk);
        c.card.quaternion.slerpQuaternions(c.start, c.flat, kk);
      }
    },
  };
}

/** S08: the card bank falls; the cold fire leaps to the wires and runs; the bulbs go out; the shutters bang down; the magpie on the wire. */
export async function s08(d: DirectorSystem, cast: CityCast, keepers: Keepers, w: Wires, magpie: Group): Promise<void> {
  d.chapter('S08');
  const bank = cardBank(d);
  await d.wait(0.6);
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 1.4);
    bank.fall(k);
    return k >= 1;
  });
  bank.fall(1);
  bank.settle();
  // The fire jumps up to the wire and runs a third of the way, the bulbs dying behind it; the shutters come down one by one.
  w.fire.span = 0;
  w.fire.t = 0;
  w.fire.on = true;
  d.sounds.bed('fire_loop', 0.3, 0.8);
  const shops = cast.shops.lit;
  const run = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - run) / 4);
    w.fire.t = 0.32 * k;
    darkenBehind(w);
    cast.shops.lit = Math.round(shops * (1 - k));
    return k >= 1;
  });
  const perch = w.spans[0].getPointAt(0.38, new Vector3());
  magpie.position.copy(perch).add(new Vector3(0, 0.02, 0));
  magpie.lookAt(CITY.shoulder);
  magpie.visible = true;
  d.notebook.write([{ text: HEADLINES.run, struck: HEADLINES.runSolved }, { text: HEADLINES.spreads }]);
  await d.captions.say('S08-1', CITY.graySays, 0);
  await d.captions.say('S08-2', keepers.people[1].head(new Vector3()), 0.3);
}

/** S09, the forest memory: dig the firebreak (full strokes of the spade), smother the sparks (the wet sack); then the chief's call. */
export async function s09(d: DirectorSystem): Promise<void> {
  d.chapter('S09');
  await d.stage.show('forest', WEATHER.forest);
  d.rain.on = false;
  const seat = new Vector3();
  d.stage.point('forest', 'seat_clearing', seat);
  d.rig.place(seat.clone().add(new Vector3(0, 1.2, 0)), 0);
  const rootEntity = d.stage.entity('forest');
  if (rootEntity == null) return;
  for (const name of ['shovel', 'wet_sack']) {
    const node = d.stage.node('forest', name);
    if (node != null) node.visible = false;
  }
  // The spade, standing in front to the right: its blade in the ground, the handle's top in reach; a full stroke back and forth digs.
  const spade = new Group();
  spade.name = 'Spade';
  const wood = new MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8 });
  const iron = new MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.6, metalness: 0.5 });
  const shaft = new Mesh(new CylinderGeometry(0.018, 0.02, 0.86, 8), wood);
  shaft.position.y = 0.47;
  const top = new Mesh(new CylinderGeometry(0.016, 0.016, 0.14, 8), wood);
  top.rotation.z = Math.PI / 2;
  top.position.y = 0.9;
  const blade = new Mesh(new BoxGeometry(0.2, 0.26, 0.015), iron);
  blade.position.y = 0.0;
  spade.add(shaft, top, blade);
  const spadeEntity: Entity = d.world.createTransformEntity(spade, { parent: rootEntity, persistent: true });
  // Pivot at the blade, 0.36 m ahead: the handle's top starts 0.45 m from the eye (a seated arm's easy reach) and comes back to 0.1 m.
  const pivot = seat.clone().add(new Vector3(0.24, 0.12, -0.36));
  spadeEntity.addComponent(PathHandle, { kind: PathKindEnum.Swing, a: pivot.toArray(), axis: [1, 0, 0], from: -0.1, to: 0.3, grip: [0, 0.9, 0], reach: 0.09, progress: 0, rest: 0, returnSpeed: 1.6 });
  // The wet sack, lifted from the bucket on the left: carried forward to the end of its short path, it is thrown onto the spark.
  const sack = new Mesh(new BoxGeometry(0.22, 0.1, 0.16), new MeshStandardMaterial({ color: 0x6a5434, roughness: 1 }));
  sack.name = 'WetSack';
  const sackEntity: Entity = d.world.createTransformEntity(sack, { parent: rootEntity, persistent: true });
  const sackFrom = seat.clone().add(new Vector3(-0.42, 0.72, -0.3));
  const sackTo = seat.clone().add(new Vector3(-0.02, 0.8, -0.5));
  sackEntity.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: sackFrom.toArray(), b: sackTo.toArray(), grip: [0, 0, 0], reach: 0.1, progress: 0, rest: 0, returnSpeed: 2 });
  const thrown = new Mesh(sack.geometry, sack.material);
  thrown.visible = false;
  thrown.pointerEvents = 'none';
  d.world.createTransformEntity(thrown, { parent: rootEntity, persistent: true });

  const front = new Flames(d.world, 14, 0xff8a3c);
  const sparkFlame = new Flames(d.world, 2, 0xffb04a);
  const mark = makeGlow(d.world, 0xffb04a, 0.25);
  mark.visible = false;
  d.stage.own('forest', front.mesh, sparkFlame.mesh, mark);
  const flicker = d.each((delta) => {
    front.update(delta, d.player.head);
    sparkFlame.update(delta, d.player.head);
  });
  setV2Targets([spade]);
  d.sounds.bed('fire_loop', 0.7);

  const game = playMiniGame(new MiniGame(WORDS.firewall, [{ name: 'three segments' }, { name: 'two more and sparks' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const covers = Array.from({ length: 8 }, (_, i) => d.stage.node('forest', `strip1_cover_${String(i + 1).padStart(2, '0')}`));
  const digAt = Array.from({ length: 8 }, (_, i) => d.stage.point('forest', `strip1_dig_${String(i + 1).padStart(2, '0')}`, new Vector3()));
  const sparks = [d.stage.point('forest', 'spark_spot_04', new Vector3()), d.stage.point('forest', 'spark_spot_08', new Vector3())];
  const phase = () => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    if (phase() !== 'playing') continue;
    const stage = game.stage;
    const hint = game.failuresOf(stage) >= HINT_AFTER;
    // Stage 1 digs the middle three; stage 2 the two beside them, with a spark after each.
    const plan = stage === 0 ? [3, 4, 2] : [1, 5];
    for (const c of covers) if (c != null) c.visible = true;
    if (stage === 1) for (const i of [3, 4, 2]) if (covers[i] != null) covers[i].visible = false;
    const won = await forestStage(d, {
      plan,
      sparks: stage === 1 ? sparks : [],
      // Paced for human hands: stage 2 is two digs, each with a spark to put out with the sack, the tools changed between.
      arrive: stage === 0 ? 16 : 26,
      covers,
      digAt,
      front,
      sparkFlame,
      mark,
      thrown,
      spade: spadeEntity,
      sack: sackEntity,
      sackTo,
      hint,
      paused: () => minis?.playPaused ?? false,
    });
    if (won) game.win();
    else game.lose('the fire crossed');
  }
  endMiniGame(game);
  setV2Targets([]);
  front.burning = 0;
  sparkFlame.burning = 0;
  flicker();
  d.sounds.bed('fire_loop', 0);
  await d.captions.say('S09-1', seat.clone().add(new Vector3(-0.7, 1.45, -1.3)), 0);
  parrotWords.learn(WORDS.firewall, FEATHER.firewall);
  // The last stroke still going, the earth turns to paving: out through the rain to the city.
  d.rain.on = true;
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 1.6);
    d.stage.blendWeather(WEATHER.forest, WEATHER.rain2008, k);
    return k >= 1;
  });
}

interface ForestPlay {
  plan: number[];
  sparks: Vector3[];
  arrive: number;
  covers: (Object3D | null)[];
  digAt: Vector3[];
  front: Flames;
  sparkFlame: Flames;
  mark: Mesh;
  thrown: Mesh;
  spade: Entity;
  sack: Entity;
  sackTo: Vector3;
  hint: boolean;
  paused: () => boolean;
}

/** One forest stage: the fire comes on from the north while the spade digs the planned segments, a spark after each in stage 2. */
function forestStage(d: DirectorSystem, p: ForestPlay): Promise<boolean> {
  const segX = p.plan.map((i) => p.digAt[i].x);
  const minX = Math.min(...segX) - 0.7;
  const maxX = Math.max(...segX) + 0.7;
  let t = 0;
  let dug = 0;
  let strokes = p.spade.getValue(PathHandle, 'strokes') ?? 0;
  let spark: { at: Vector3; left: number; flying: number } | null = null;
  let sparksDone = 0;
  let wasAtEnd = false;
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      p.mark.visible = false;
      p.sparkFlame.burning = 0;
      p.thrown.visible = false;
      done(result);
    };
    const stop = d.each((delta) => {
      if (p.paused()) return;
      t += delta;
      // The front: a row of flames from the forest toward the strip (z -3.5), arriving at `arrive` s.
      const z = -14 + (14 - 3.9) * Math.min(1, t / p.arrive);
      for (let i = 0; i < 14; i += 1) p.front.place(i, spot.set(minX + ((maxX - minX) * i) / 13, 0, z + Math.sin(i * 1.7) * 0.4), 1.1 + (i % 3) * 0.25);
      p.front.burning = 14;
      // The next segment to dig glows over its tape (more brightly as a hint).
      const next = dug < p.plan.length ? p.plan[dug] : -1;
      if (next >= 0 && spark == null) {
        p.mark.visible = true;
        p.mark.position.copy(p.digAt[next]).setY(0.3);
        p.mark.scale.setScalar(p.hint ? 1.8 + 0.3 * Math.sin(t * 6) : 1);
      }
      // A full stroke of the spade digs it.
      const now = p.spade.getValue(PathHandle, 'strokes') ?? 0;
      if (now > strokes && next >= 0 && spark == null) {
        const cover = p.covers[next];
        if (cover != null) cover.visible = false;
        dug += 1;
        if (import.meta.env.DEV) console.info(`[forest] dug segment ${next + 1} (${dug}/${p.plan.length}) at ${t.toFixed(1)} s`);
        if (sparksDone < p.sparks.length) spark = { at: p.sparks[sparksDone], left: 8 + (p.hint ? 2 : 0), flying: -1 };
      }
      strokes = now;
      // A spark over the strip: it smoulders where it landed till the wet sack, carried to the end of its path, is thrown on it.
      if (spark != null) {
        p.mark.visible = true;
        p.mark.position.copy(spark.at).setY(0.15);
        p.mark.scale.setScalar(0.8);
        p.sparkFlame.place(0, spark.at, 0.45);
        p.sparkFlame.burning = spark.flying >= 1 ? 0 : 1;
        const atEnd = (p.sack.getValue(PathHandle, 'progress') ?? 0) >= 0.93;
        if (atEnd && !wasAtEnd && spark.flying < 0) spark.flying = 0;
        wasAtEnd = atEnd;
        if (spark.flying >= 0) {
          spark.flying += delta / 0.5;
          const k = Math.min(1, spark.flying);
          p.thrown.visible = k < 1;
          p.thrown.position.lerpVectors(p.sackTo, spark.at, k);
          p.thrown.position.y += Math.sin(k * Math.PI) * 0.6;
          if (k >= 1) {
            d.sounds.play('bucket_splash', 0.8);
            if (import.meta.env.DEV) console.info(`[forest] spark ${sparksDone + 1} smothered`);
            sparksDone += 1;
            spark = null;
            p.sparkFlame.burning = 0;
          }
        } else {
          spark.left -= delta;
          if (spark.left <= 0) {
            if (import.meta.env.DEV) console.info('[forest] a spark caught');
            finish(false);
            return;
          }
        }
      }
      if (dug >= p.plan.length && spark == null) {
        finish(true);
        return;
      }
      if (t >= p.arrive) {
        if (import.meta.env.DEV) console.info(`[forest] the fire reached the strip with ${dug}/${p.plan.length} dug`);
        finish(false);
      }
    });
    d.onSkip(() => finish(true));
  });
}

/** Where the walls go: across a span's road on the ground, at `t` along it, `length` long. */
interface Line {
  span: number;
  t: number;
  /** Seconds for the fire to get there from where it starts. */
  seconds: number;
  /** Where the fire starts for this line (span, t). */
  from: { span: number; t: number };
}

const LINES: readonly Line[] = [
  { span: 0, t: 0.5, seconds: 9, from: { span: 0, t: 0.32 } },
  { span: 1, t: 0.5, seconds: 7.5, from: { span: 1, t: 0.05 } },
  { span: 0, t: 0.8, seconds: 6, from: { span: 0, t: 0.56 } },
];
const LINE_LENGTH = 3.6;

/** S10, THE COLD FIRE: three lines drawn down the street, a gold wall rising along each; the fire stopped before the family. */
export async function s10(d: DirectorSystem, cast: CityCast, w: Wires, magpie: Group): Promise<void> {
  d.chapter('S10');
  const head = d.player.head;
  void d.gold.show(WORDS.firewall.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head, wordBadge(WORDS.firewall));
  await d.captions.say('S10-1', CITY.graySays, 0);
  const mid = w.spans[0].getPointAt(0.5, new Vector3());
  // Onto the street lamp again, turned toward the square where the lines will go.
  await d.rig.move(LAMP_EYE_SOUTH, Math.atan2(-(mid.x - LAMP_EYE_SOUTH.x), -(mid.z - LAMP_EYE_SOUTH.z)));
  void d.gold.show(BOSSES.coldFire.name, mid.clone().setY(6.5), 4, 2.6, new Vector3(0, 0.15, 0), head);

  // Each line: a row of gold studs on the street and a stake at its start; dragged along (by ray, from the shoulder) it raises the wall.
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, emissive: 0x8a6418, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.7, transparent: true, opacity: 0.9 });
  const parts = LINES.map((line) => {
    const road = w.spans[line.span];
    const at = road.getPointAt(line.t, new Vector3());
    const ahead = road.getTangentAt(line.t, new Vector3()).setY(0).normalize();
    const across = new Vector3(-ahead.z, 0, ahead.x);
    // Start at the end nearer the player, so the drag goes away across the street.
    const a = at.clone().setY(0.15).addScaledVector(across, -LINE_LENGTH / 2);
    const b = at.clone().setY(0.15).addScaledVector(across, LINE_LENGTH / 2);
    if (a.distanceTo(CITY.shoulder) > b.distanceTo(CITY.shoulder)) [a.x, a.z, b.x, b.z] = [b.x, b.z, a.x, a.z];
    const studs = new Group();
    for (let i = 0; i <= 8; i += 1) {
      const stud = new Mesh(new SphereGeometry(0.06, 8, 6), new MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false }));
      stud.position.lerpVectors(a, b, i / 8).setY(0.2);
      studs.add(stud);
    }
    studs.visible = false;
    studs.traverse((o) => {
      o.pointerEvents = 'none';
    });
    d.world.createTransformEntity(studs, { persistent: true });
    const stake = new Mesh(new CylinderGeometry(0.09, 0.09, 1.1, 10), gold);
    stake.name = 'WallStake';
    stake.visible = false;
    // A larger, unseen box round it, so a ray from across the square finds it.
    const reachBox = new Mesh(new BoxGeometry(1.2, 2.2, 1.2), new MeshBasicMaterial());
    reachBox.visible = false;
    reachBox.pointerEvents = 'none';
    stake.add(reachBox);
    const stakeEntity = d.world.createTransformEntity(stake, { persistent: true });
    const wireY = at.y;
    const wall = new Mesh(new BoxGeometry(1, 1, 0.3), gold);
    wall.name = 'GoldWall';
    wall.visible = false;
    wall.pointerEvents = 'none';
    d.world.createTransformEntity(wall, { persistent: true });
    d.stage.own('city', studs, stake, wall);
    return { line, a, b, studs, stake, stakeEntity, wall, wireY, handle: null as Entity | null };
  });

  d.sounds.bed('fire_loop', 0.35, 0.8);
  const game = playMiniGame(new MiniGame(WORDS.firewall, [{ name: 'the cold fire' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const phase = () => game.phase;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    if (phase() !== 'playing') continue;
    const hint = game.failuresOf(0) >= HINT_AFTER;
    for (const part of parts) {
      part.wall.visible = false;
      part.studs.visible = false;
      part.stake.visible = false;
      if (part.handle != null) part.handle.setValue(PathHandle, 'progress', 0);
    }
    darkenBehind(w, true);
    let lost = false;
    let skipped = false;
    d.onSkip(() => {
      skipped = true;
    });
    for (let n = 0; n < parts.length && !lost && !skipped; n += 1) {
      const part = parts[n];
      if (n === 2) {
        // The magpie carries a spark over the wall in its beak and drops it further down the wire.
        magpie.visible = true;
        const over = w.spans[0].getPointAt(part.line.from.t, new Vector3());
        const startAt = magpie.position.clone();
        magpie.userData.clip = 'flap';
        magpie.lookAt(over.x, magpie.position.y, over.z);
        const fly = d.now;
        await d.until(() => {
          const k = Math.min(1, (d.now - fly) / 1.2);
          magpie.position.lerpVectors(startAt, over, k);
          magpie.position.y += Math.sin(k * Math.PI) * 1.2;
          return k >= 1;
        });
        magpie.userData.clip = 'idle';
      }
      lost = !(await fireToLine(d, w, part, hint, () => minis?.playPaused ?? false));
    }
    if (skipped || !lost) game.win();
    else {
      // The fire reaches the family's place.
      const at = w.fire.t;
      const run = d.now;
      await d.until(() => {
        const k = Math.min(1, (d.now - run) / 1.5);
        w.fire.t = at + (1 - at) * k;
        darkenBehind(w);
        return k >= 1;
      });
      game.lose('the fire reached the family');
    }
  }
  endMiniGame(game);
  if (import.meta.env.DEV) console.info('[cold fire] won');
  setV2Targets([]);
  w.fire.on = false;
  magpie.visible = false;
  d.sounds.bed('fire_loop', 0);
  d.sounds.play('applause', 0.8);
  await d.gold.show(BOSSES.coldFire.won, mid.clone().setY(3.5), 3, 2.8, new Vector3(0, 0.2, 0), head);
  darkenBehind(w, true);
  cast.shops.lit = cast.shops.total;
  for (const part of parts) {
    part.studs.visible = false;
    part.stake.visible = false;
  }
  // The three walls stand for the rest of the day: drawn as one.
  const walls = new Group();
  walls.name = 'GoldWalls';
  for (const part of parts) {
    const copy = new Mesh(part.wall.geometry, part.wall.material);
    part.wall.updateMatrixWorld(true);
    copy.applyMatrix4(part.wall.matrixWorld);
    walls.add(copy);
    part.wall.visible = false;
  }
  mergeByMaterial(walls);
  walls.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(walls, { persistent: true });
  d.stage.own('city', walls);
  d.day.problem = 3;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;
  await d.rig.move(CITY.shoulder, Math.PI);
  await showCard(d, 'firewall');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
  ]);
}

/** One line: the fire runs toward it; the wall must be up (the stake dragged to the far end) before the fire gets there. */
function fireToLine(d: DirectorSystem, w: Wires, part: { line: Line; a: Vector3; b: Vector3; studs: Group; stake: Mesh; stakeEntity: Entity; wall: Mesh; wireY: number; handle: Entity | null }, hint: boolean, paused: () => boolean): Promise<boolean> {
  const { line, a, b } = part;
  part.studs.visible = true;
  part.stake.visible = true;
  if (part.handle == null) {
    part.stakeEntity.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: [a.x, 0.7, a.z], b: [b.x, 0.7, b.z], grip: [0, 0.4, 0], reach: 0.12, rayReach: 25, progress: 0, rest: -1 });
    part.handle = part.stakeEntity;
  }
  setV2Targets([part.stake]);
  if (import.meta.env.DEV) {
    const la = d.player.worldToLocal(a.clone().setY(0.7));
    const lb = d.player.worldToLocal(b.clone().setY(0.7));
    console.info(`[cold fire] line ${line.span}/${line.t}: from ${la.toArray().map((v) => v.toFixed(2))} to ${lb.toArray().map((v) => v.toFixed(2))} (player space)`);
  }
  w.fire.on = true;
  w.fire.span = line.from.span;
  w.fire.t = line.from.t;
  const seconds = line.seconds + (hint ? 2 : 0);
  const length = a.distanceTo(b);
  const height = part.wireY + 0.4;
  let t = 0;
  return new Promise((done) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      stop();
      setV2Targets([]);
      done(result);
    };
    const stop = d.each((delta) => {
      if (paused()) return;
      t += delta;
      const progress = part.handle?.getValue(PathHandle, 'progress') ?? 0;
      // The wall rises along the drawn part of the line, up to the wire.
      part.wall.visible = progress > 0.02;
      part.wall.scale.set(Math.max(0.01, length * progress), height, 0.3);
      part.wall.position.lerpVectors(a, b, progress / 2).setY(0.15 + height / 2);
      part.wall.rotation.set(0, Math.atan2(-(b.z - a.z), b.x - a.x), 0);
      const k = Math.min(1, t / seconds);
      w.fire.t = line.from.t + (line.t - line.from.t) * k;
      darkenBehind(w);
      if (progress >= 0.95) {
        if (import.meta.env.DEV) console.info(`[cold fire] wall up at ${t.toFixed(1)} of ${seconds} s`);
        // The fire dies against the wall.
        w.fire.on = false;
        part.stake.visible = false;
        finish(true);
        return;
      }
      if (k >= 1) {
        if (import.meta.env.DEV) console.info(`[cold fire] the fire passed line ${line.span}/${line.t} at ${t.toFixed(1)} of ${seconds} s (wall ${Math.round(progress * 100)}%)`);
        finish(false);
      }
    });
    d.onSkip(() => {
      part.handle?.setValue(PathHandle, 'progress', 1);
      finish(true);
    });
  });
}
