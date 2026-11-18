import {
  AdditiveBlending,
  AssetManager,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  type Texture,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { setDeskMode } from '../desk-hands.js';
import { devParam } from '../dev-param.js';
import { setGoal, setWindows } from '../goal.js';
import { placeGoal } from '../goal-system.js';
import { newPump, type Pump, pull, startWall, stepWall, stepPump, WALLS, wallUp } from '../fire-line.js';
import { endMiniGame, MiniGame, type Phase, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { parrotWords } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { wordBadge } from '../icons.js';
import type { DirectorSystem } from './director.js';
import { fireProp, flyToPerch, handPoint, keyLight, loadFireProps, type Side, SIDES, takes } from './flight.js';
import { Flames, makeGlow, mergeByMaterial } from './fx.js';
import { BOSSES, HEADLINES, type PersonaId, WORDS } from './lines.js';
import { CITY, type CityCast, FEATHER, type Keepers, prop } from './opening.js';
import { showCard } from './run.js';
import { type Weather, WEATHER } from './stage.js';

export { s09 } from './forest-fire.js';

/**
 * The second problem and its word (S08-S10): a
 * little bank of playing cards falls and a cold blue fire leaps to the
 * wires strung between the buildings, putting out the bulbs one by one
 * (S08); in the forest memory the player digs a firebreak ahead of a fire
 * front (S09, forest-fire.ts); back in the city, Gray's "firewall" sends the bird
 * to a post beside each wire the fire is running: the gold stake there,
 * pulled up, raises a gold wall out of the street across the wire, and the
 * cold fire dies against it or runs on and puts out a home's windows
 * (S10). The rules are in v2/fire-line.ts.
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
  // Dev: begin the day with the first word already on the wing: at the cold fire ('fire'), or one turn before it ('s08': the word goes to Gray, and S07 and S08 play).
  if (import.meta.env.DEV && devFrom != null && d.day.problem === 1) {
    parrotWords.learn(WORDS.safetyNet, FEATHER.safetyNet);
    if (devFrom === 'fire' || devFrom === 'wall') {
      d.day.problem = 2;
      goal("Find the word: fly to a keeper's hand.");
    }
    // 'wall': the forest's word is on the wing too, so the feather to Gray's ear begins the cold fire.
    if (devFrom === 'wall') parrotWords.learn(WORDS.firewall, FEATHER.firewall);
    console.info(`[dev] the day begins from ${devFrom}`);
  }
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
  // The cold fire: a long tongue of pale blue flame running along the wire, large enough to read from the lamp across the square.
  const flames = new Flames(d.world, COLD_TONGUE, 0x5ab4ff);
  d.stage.own('city', bulbs, flames.mesh);
  // The cold fire's own light and the gold of a wall, in the square from the start (a light added later would make every surface be made again mid-play).
  coldLights = { blue: new PointLight(0x5ab4ff, 0, 14, 1.4), golden: new PointLight(0xffd27a, 0, 9, 1.5) };
  for (const light of [coldLights.blue, coldLights.golden]) {
    d.world.createTransformEntity(light, { persistent: true });
    d.stage.own('city', light);
  }
  const fire = { span: 0, t: 0, on: false };
  const at = new Vector3();
  const stop = d.each((delta) => {
    flames.burning = fire.on ? COLD_TONGUE : 0;
    if (fire.on) {
      // The tongue at the point, tallest there, and trailing back along the wire, smaller.
      for (let k = 0; k < COLD_TONGUE; k += 1) {
        spans[fire.span].getPointAt(Math.max(0, Math.min(1, fire.t - k * 0.01)), at);
        at.y -= 0.5;
        flames.place(k, at, 1.1 - k * 0.055);
      }
    }
    flames.update(delta, d.player.head);
  });
  return { family, facing, spans, bulbs, bulbAt, flames, stop, fire };
}

/** The trouble's name on the goal plate. */
const TROUBLE = 'TROUBLE 2 OF 4 · THE COLD FIRE';
/** Windows round the square that the cold fire puts out when it starts (S08); they come back on when it is contained (S10). */
const TROUBLE_WINDOWS = 4;
let troubleDark = 0;

function goal(now: string, steps?: readonly [number, number]): void {
  setGoal({ where: TROUBLE, now, steps });
  if (import.meta.env.DEV) console.info(`[goal] ${TROUBLE} | ${now}${steps != null ? ` | ${steps[0]}/${steps[1]}` : ''}`);
}

/** The square's windows as the day's count says, told to the plate. */
function countWindows(d: DirectorSystem, cast: CityCast): void {
  cast.windows.lit = cast.windows.total - d.day.darkWindows;
  setWindows(cast.windows.lit, cast.windows.total);
  if (import.meta.env.DEV) console.info(`[windows] ${cast.windows.lit} of ${cast.windows.total} lit`);
}

let coldLights: { blue: PointLight; golden: PointLight } | null = null;

/** Dev only: where the day begins. Set by VITE_V2_FROM when the dev server is started, or by a key during the opening (comma: 'fire', minus: 's08'; neither is an emulator key or a shortcut of the first game). */
/** Dev only: the timer that passes the morning on the way to the cold fire; stopped when it begins. */
let autoSkip: number | null = null;
let devFrom: string | undefined = import.meta.env.DEV ? (import.meta.env.VITE_V2_FROM as string | undefined) || undefined : undefined;
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Comma') devFrom = 'fire';
    if (event.code === 'Minus') devFrom = 's08';
    // 5 reloads straight to the cold fire (9 clears it, as for the circus and the forest).
    if (event.code === 'Digit5') {
      event.preventDefault();
      window.sessionStorage.setItem('v2jump', 'coldfire');
      window.location.reload();
    }
  });
  if (window.sessionStorage.getItem('v2jump') === 'coldfire') {
    // Both words on the wing, and the morning passed by itself (the skip key, pressed for her twice a second) until the cold fire begins.
    devFrom = 'wall';
    autoSkip = window.setInterval(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Period', key: '.', bubbles: true })), 500);
  }
}

/** How many flames make the cold fire's tongue. */
const COLD_TONGUE = 12;

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

/** The bank of playing cards (art/v2/nesne/card_bank.glb): standing as one mesh, then every card falling flat on cue, still as one mesh. */
function cardBank(d: DirectorSystem): { group: Object3D; fall: (k: number) => void } {
  const group = prop('card_bank');
  group.name = 'CardBank';
  group.position.copy(CARD_BANK);
  group.rotation.y = Math.atan2(CITY.grayAt.x - CARD_BANK.x, CITY.grayAt.z - CARD_BANK.z);
  const standing = group.getObjectByName('card_bank_standing');
  const loose = group.getObjectByName('cards');
  if (loose != null) loose.visible = false;
  const parts = (loose?.children ?? []).filter((o) => (o as Mesh).isMesh === true) as Mesh[];
  // The loose cards are one mesh whose corners are moved card by card (26 cards, 624 corners): one draw while they fall and after.
  let corners = 0;
  let points = 0;
  for (const part of parts) {
    const n = part.geometry.getAttribute('position').count;
    corners += n;
    points += part.geometry.index?.count ?? n;
  }
  const rest = new Float32Array(corners * 3);
  const restNormal = new Float32Array(corners * 3);
  const at = new Float32Array(corners * 3);
  const normal = new Float32Array(corners * 3);
  const uv = new Float32Array(corners * 2);
  const index = new Uint16Array(points);
  let corner = 0;
  let point = 0;
  const middle = new Vector3();
  const cards = parts.map((card, i) => {
    const g = card.geometry;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    const first = corner;
    for (let v = 0; v < p.count; v++) {
      rest.set([p.getX(v) * card.scale.x, p.getY(v) * card.scale.y, p.getZ(v) * card.scale.z], (first + v) * 3);
      if (n != null) restNormal.set([n.getX(v), n.getY(v), n.getZ(v)], (first + v) * 3);
      if (t != null) uv.set([t.getX(v), t.getY(v)], (first + v) * 2);
    }
    if (g.index != null) for (let v = 0; v < g.index.count; v++) index[point++] = first + g.index.getX(v);
    else for (let v = 0; v < p.count; v++) index[point++] = first + v;
    corner += p.count;
    const flat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, ((i * 2.3) % 6.28) - 3.14, 0));
    const to = card.position.clone().add(new Vector3(Math.sin(i * 1.7) * 0.5, 0, Math.cos(i * 2.1) * 0.5));
    to.y = 0.01 + i * 0.002;
    middle.add(card.position).add(to);
    return { first, count: p.count, from: card.position.clone(), to, start: card.quaternion.clone(), flat, lag: (card.position.y / 1.8) * 0.5 };
  });
  let pile: Mesh | null = null;
  if (loose != null && parts.length > 0) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(at, 3));
    geometry.setAttribute('normal', new BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    geometry.setIndex(new BufferAttribute(index, 1));
    // Its bounds hold both the standing house and the fallen pile, so they need no recount as the cards move.
    middle.multiplyScalar(1 / (2 * cards.length));
    let reach = 0;
    for (const c of cards) reach = Math.max(reach, c.from.distanceTo(middle), c.to.distanceTo(middle));
    geometry.boundingSphere = new Sphere(middle.clone(), reach + 0.4);
    pile = new Mesh(geometry, parts[0].material);
    pile.name = 'CardPile';
    pile.pointerEvents = 'none';
    for (const part of parts) part.removeFromParent();
    loose.add(pile);
  }
  const cardAt = new Vector3();
  const cardTurn = new Quaternion();
  const spot = new Vector3();
  const place = (k: number): void => {
    if (pile == null) return;
    // The top cards go first and the house folds down.
    for (const c of cards) {
      const kk = Math.max(0, Math.min(1, (k - (0.5 - c.lag)) * 2));
      cardAt.lerpVectors(c.from, c.to, kk * kk);
      cardTurn.slerpQuaternions(c.start, c.flat, kk);
      for (let i = c.first * 3; i < (c.first + c.count) * 3; i += 3) {
        spot.fromArray(rest, i).applyQuaternion(cardTurn).add(cardAt).toArray(at, i);
        spot.fromArray(restNormal, i).applyQuaternion(cardTurn).toArray(normal, i);
      }
    }
    pile.geometry.getAttribute('position').needsUpdate = true;
    pile.geometry.getAttribute('normal').needsUpdate = true;
  };
  place(0);
  d.world.createTransformEntity(group, { persistent: true });
  d.stage.own('city', group);
  return {
    group,
    fall: (k) => {
      if (standing != null) standing.visible = k <= 0;
      if (loose != null) loose.visible = k > 0;
      place(k);
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
  // The fire jumps up to the wire and runs a third of the way, the bulbs dying behind it; the shutters come down one by one.
  w.fire.span = 0;
  w.fire.t = 0;
  w.fire.on = true;
  d.sounds.bed('fire_loop', 0.3, 0.8);
  const shops = cast.shops.lit;
  const run = d.now;
  // The trouble is seen in the windows: as the fire runs, the neighbours' windows the bird is looking at go out, one after another.
  // Counted afresh first: the scene before may have left the windows' own count behind the day's.
  countWindows(d, cast);
  const toGo = Math.max(0, Math.min(TROUBLE_WINDOWS, cast.windows.lit - 1));
  const look = new Vector3();
  await d.until(() => {
    const k = Math.min(1, (d.now - run) / 4);
    w.fire.t = 0.32 * k;
    darkenBehind(w);
    cast.shops.lit = Math.round(shops * (1 - k));
    if (troubleDark < toGo && k >= (troubleDark + 1) / (toGo + 0.5)) {
      look.set(0, 0, -1).applyQuaternion(d.player.head.getWorldQuaternion(new Quaternion())).setY(0).normalize();
      cast.windows.nextOutInView(d.eyeAt, look);
      troubleDark += 1;
      d.day.darkWindows += 1;
      countWindows(d, cast);
      d.sounds.play('ear_click', 0.35, 0.6);
      if (import.meta.env.DEV) console.info(`[cold fire] S08: a window goes dark (${troubleDark} of ${toGo}), ${cast.windows.lit} still lit`);
    }
    return k >= 1;
  });
  const perch = w.spans[0].getPointAt(0.38, new Vector3());
  magpie.position.copy(perch).add(new Vector3(0, 0.02, 0));
  magpie.lookAt(CITY.shoulder);
  magpie.visible = true;
  d.notebook.write([{ text: HEADLINES.run, struck: HEADLINES.runSolved }, { text: HEADLINES.spreads }]);
  await d.captions.say('S08-1', CITY.graySays, 0);
  goal(parrotWords.has(WORDS.firewall) ? 'Give Gray the word: carry the feather to his ear.' : "Find the word: fly to a keeper's hand.");
  await d.captions.say('S08-2', keepers.people[1].head(new Vector3()), 0.3);
}


/** Where the three walls go: across a wire at `t` along it; the fire comes to each from `from`. */
interface Site {
  span: number;
  t: number;
  from: number;
}
const SITES: readonly Site[] = [
  { span: 0, t: 0.5, from: 0.22 },
  { span: 1, t: 0.5, from: 0.08 },
  { span: 0, t: 0.8, from: 0.56 },
];
/** A wall: this wide across the wire, this thick, and this far over the wire when whole (m). */
const WALL = { wide: 4.6, thick: 0.34, over: 0.9 } as const;
/** The bird's post beside a wall: this far back along the wire from it, this far to the side, this far under the wire (m). */
const PERCH = { back: 1.6, aside: 2.8, under: 0.45 } as const;
/**
 * The wall straight ahead of the bird, not beside her: her post stands in the
 * wire's own line just past the wall, the fire comes along the wire at her,
 * and the wall she raises is what keeps it off her. `false` keeps the post
 * beside the wall; in dev, ?wall=front tries this and ?wall=side the other.
 */
const WALL_AHEAD = true;
/** Ahead: the post this far past the wall (m) and never nearer the wire's end than `clear`; the eye this far under the wire; the wall's foot already standing to this far under the eye; and once the wall is whole the fire comes on this many times faster (nobody waits behind a finished wall). */
const AHEAD = { back: 1.5, clear: 1.0, under: 0.45, foot: 1.3, hurry: 3 } as const;
/** How far the stake comes up with the hand, and how far the hand must rise for one pull (m). */
const STAKE_PULL = 0.2;
const PULL_TRAVEL = 0.15;
/** The square while the cold fire is fought: the day gone dim, so the fire's blue and the walls' gold are what is seen. */
const DIM: Weather = { sky: 0x12161d, fog: 0x1a2028, density: 0.026, light: 0.16 };

/** The cold fire seen close: tongues in its pale core and in the dim mantle about it, sparks alive at once, puffs of vapour and how long one lasts (s). */
const DRESS = { core: 8, mantle: 6, sparks: 48, puffs: 10, puffLife: 1.6 } as const;

/** A soft round dot: a spark, and a puff of vapour. */
function softDot(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A worn surface to multiply a colour by, so iron and gold are not one flat tone. */
function worn(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#dcdcdc';
    g.fillRect(0, 0, 64, 64);
    let seed = 9;
    for (let i = 0; i < 600; i += 1) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 64;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 64;
      g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.28)';
      g.fillRect(x, y, 1 + (i % 4), 1);
    }
    // Courses of block, for the wall.
    g.strokeStyle = 'rgba(60,40,0,0.5)';
    g.lineWidth = 1;
    for (let row = 0; row < 4; row += 1) {
      g.strokeRect(-1, row * 16, 66, 16);
      for (let col = 0; col < 2; col += 1) g.strokeRect(col * 32 + (row % 2) * 16, row * 16, 32, 16);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** One wall's place and everything the game stands there: the wall, the bird's post, the stake on it, its lantern. */
interface WallSite {
  site: Site;
  at: Vector3;
  /** Across the wire, level. */
  across: Vector3;
  eye: Vector3;
  yaw: number;
  wall: Mesh;
  tall: number;
  /** How much of the wall stands before the first pull (0..1): nothing beside the bird, its foot when it is ahead of her. */
  low: number;
  /** The wall's own pictures (of the modelled brick or stone), kept to their own size as it rises: `grain` of them to a metre. */
  skins: Texture[];
  grain: number;
  post: Group;
  stake: Group;
  /** Where the stake's ring is taken (a marker on the post), and the stake's height at rest. */
  ring: Group;
  rest: number;
  lantern: MeshStandardMaterial;
  shown: number;
  /** Dev: where the sign lamp is from the perch, in words. */
  signs: string;
}

/** S10, THE COLD FIRE: a wall across each wire the fire runs, raised from a post beside it before the fire gets there. */
export async function s10(d: DirectorSystem, cast: CityCast, w: Wires, magpie: Group): Promise<void> {
  d.chapter('S10');
  if (autoSkip != null) {
    window.clearInterval(autoSkip);
    autoSkip = null;
  }
  const head = d.player.head;
  void d.gold.show(WORDS.firewall.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head, wordBadge(WORDS.firewall));
  await d.captions.say('S10-1', CITY.graySays, 0);
  const mid = w.spans[0].getPointAt(0.5, new Vector3());
  setDeskMode('one');
  // The task plate to the left and low, whole in the view looking straight ahead: clear of the stake, its lamp and the wall.
  placeGoal(0.42, 0.42);
  // The cast-iron street lamp the bird lands on (art/v2/nesne); without the file, a plain post.
  await loadFireProps();
  // A dressed stone wall's pictures (stone_wall.glb), when the file is there: then the wall is stone, not gold brick.
  await AssetManager.loadGLTF('v2/nesne/stone_wall.glb', 'v2_fire_stone_wall').catch(() => null);
  const stone = AssetManager.getGLTF('v2_fire_stone_wall')?.scene ?? null;
  if (import.meta.env.DEV) console.info(`[cold fire] the wall is of ${stone != null ? 'stone' : 'gold brick (no stone_wall.glb)'}`);
  const lampPost = fireProp('street_lamp');
  const asked = devParam('wall');
  const front = asked === 'front' || (WALL_AHEAD && asked !== 'side');
  if (import.meta.env.DEV) console.info(`[cold fire] the wall is ${front ? 'ahead of the bird (the fire comes at her)' : 'beside the bird'}`);

  const grainy = worn();
  const iron = new MeshStandardMaterial({ color: 0x2b2a2c, roughness: 0.6, metalness: 0.6, map: grainy });
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, emissive: 0x8a6418, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.7, map: grainy });
  const own = <T extends Object3D>(object: T): T => {
    d.world.createTransformEntity(object, { persistent: true });
    d.stage.own('city', object);
    return object;
  };
  const sites: WallSite[] = SITES.map((site, n) => {
    const road = w.spans[site.span];
    const at = road.getPointAt(site.t, new Vector3());
    const ahead = road.getTangentAt(site.t, new Vector3()).setY(0).normalize();
    const across = new Vector3(-ahead.z, 0, ahead.x);
    // The post stands on the side of the wire nearer the middle of the square, a little back toward where the fire comes from.
    const middle = new Vector3(0, 0, -6);
    const side = at.clone().addScaledVector(across, 1).distanceTo(middle) < at.clone().addScaledVector(across, -1).distanceTo(middle) ? 1 : -1;
    const eye = at.clone().addScaledVector(ahead, -PERCH.back).addScaledVector(across, side * PERCH.aside);
    eye.y = at.y - PERCH.under;
    // Looking across at the wall where the wire meets it: the wall fills the middle of the view, the fire comes in along the wire from one side.
    const look = at.clone().addScaledVector(across, side * 0.6).sub(eye).setY(0).normalize();
    if (front) {
      // Her post in the wire's own line, just past the wall: she looks back up the wire, the fire comes along it straight at her, and the wall rises between.
      const room = road.getLength() * (1 - site.t) - AHEAD.clear;
      eye.copy(at).addScaledVector(ahead, Math.max(0.9, Math.min(AHEAD.back, room)));
      eye.y = at.y - AHEAD.under;
      look.copy(ahead).negate();
    }
    const yaw = Math.atan2(-look.x, -look.z);
    const tall = at.y + WALL.over - 0.15;
    const low = front ? Math.max(0, Math.min(0.8, (eye.y - AHEAD.foot - 0.15) / tall)) : 0;
    const wall = own(new Mesh(new BoxGeometry(WALL.wide, 1, WALL.thick), gold.clone()));
    wall.name = `GoldWall ${n}`;
    (wall.material as MeshStandardMaterial).map = grainy.clone();
    ((wall.material as MeshStandardMaterial).map as CanvasTexture).repeat.set(5, 6);
    ((wall.material as MeshStandardMaterial).map as CanvasTexture).needsUpdate = true;
    // The modelled gold brick (gold_brick_wall.glb): its pictures a metre to a metre of wall, whatever height the wall stands at, and glowing a little.
    // The stone was scanned a metre and a half across: its pictures are laid that much larger, so a stone is its own size.
    const grain = stone != null ? 0.66 : 1;
    const skins: Texture[] = [];
    const bricks: MeshStandardMaterial[] = [];
    (stone ?? fireProp('gold_brick_wall'))?.traverse((o) => {
      const m = (o as Mesh).material;
      if (m != null && !Array.isArray(m)) bricks.push(m as MeshStandardMaterial);
    });
    if (bricks.length > 0) {
      const skin = bricks[0].clone();
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
        const picture = skin[key];
        if (picture == null) continue;
        const mine = picture.clone();
        mine.wrapS = RepeatWrapping;
        mine.wrapT = RepeatWrapping;
        mine.repeat.set(WALL.wide * grain, 1);
        mine.needsUpdate = true;
        skin[key] = mine;
        skins.push(mine);
      }
      skin.emissiveMap = skin.map;
      skin.emissive.setHex(0xffffff);
      // Stone glows only enough to be read in the dimmed square: the fire's blue is what lights it.
      skin.emissiveIntensity = stone != null ? 0.14 : 0.45;
      wall.material = skin;
    }
    wall.position.set(at.x, 0.15, at.z);
    wall.rotation.y = Math.atan2(across.x, across.z) - Math.PI / 2;
    wall.visible = false;
    wall.pointerEvents = 'none';
    // The post the bird sits on, with a gold arm that carries the stake before it, and a lantern that is lit when this wall has held.
    const post = new Group();
    post.name = `WallPost ${n}`;
    // Its top is where the bird's own feet are (0.28 m under the eye): looking down, they stand on it.
    const top = eye.y - 0.28;
    const shaft = new Mesh(new CylinderGeometry(0.055, 0.08, top - 0.15, 10), iron);
    shaft.position.set(0, (top - 0.15) / 2 + 0.15, 0);
    const cap = new Mesh(new CylinderGeometry(0.16, 0.12, 0.05, 12), iron);
    cap.position.y = top;
    const arm = new Mesh(new BoxGeometry(0.04, 0.03, 0.4), gold);
    arm.position.set(0, top - 0.05, -0.2);
    const sleeve = new Mesh(new CylinderGeometry(0.028, 0.028, 0.14, 10), gold);
    sleeve.position.set(0, top - 0.02, -0.38);
    const lantern = new MeshStandardMaterial({ color: 0x4a4030, roughness: 0.3, emissive: 0xffc24a, emissiveIntensity: 0 });
    const lamp = new Mesh(new SphereGeometry(0.05, 12, 8), lantern);
    // The sign lamp stands on a gold stem by the stake, a little under the eye's line.
    lamp.position.set(0.12, top + 0.2, -0.42);
    const stem = new Mesh(new CylinderGeometry(0.006, 0.006, 0.24, 6), gold);
    stem.position.set(0.12, top + 0.07, -0.42);
    const realStake = fireProp('pull_stake', 'stake');
    const realGuide = fireProp('pull_stake', 'bracket');
    post.add(arm, stem, lamp);
    if (realStake == null || realGuide == null) post.add(sleeve);
    if (lampPost == null) post.add(shaft, cap);
    // One draw for its iron and one for its gold; and it is shown only while the bird is on it.
    mergeByMaterial(post);
    if (lampPost != null) {
      // As modelled it is 2.7 m to its top, its arm and lantern out to +x: the bird sits on its top, the lantern hangs out to her right.
      const real = lampPost.clone(true);
      real.scale.setScalar(top / 2.7);
      post.add(real);
    }
    const signFlat = Math.hypot(lamp.position.x, lamp.position.z);
    const signs = `the sign lamp ${signFlat.toFixed(2)} m off, ${Math.round((Math.atan2(eye.y - lamp.position.y, signFlat) * 180) / Math.PI)} deg below and ${Math.round((Math.atan2(lamp.position.x, -lamp.position.z) * 180) / Math.PI)} deg aside of straight ahead`;
    post.visible = false;
    post.position.set(eye.x, 0, eye.z);
    post.rotation.y = yaw;
    post.traverse((o) => {
      o.pointerEvents = 'none';
    });
    d.world.createTransformEntity(post, { persistent: true });
    d.stage.own('city', post);
    const stake = new Group();
    stake.name = `WallStake ${n}`;
    const peg = new Mesh(new CylinderGeometry(0.014, 0.011, 0.3, 8), gold);
    peg.position.y = -0.1;
    const knob = new Mesh(new SphereGeometry(0.026, 12, 8), gold);
    knob.position.y = 0.06;
    const ring = new Mesh(new TorusGeometry(0.04, 0.008, 6, 16), gold);
    ring.position.y = 0.12;
    if (realStake != null && realGuide != null) {
      // The modelled brass stake in its cast-iron guide: the ring's middle where the hand takes it, the guide's foot 0.26 under that, clamped on the arm.
      realStake.position.set(0, 0.12, 0);
      realStake.traverse((o) => {
        const m = (o as Mesh).material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
        if (m == null || Array.isArray(m) || m.userData.lit === true) return;
        // Brass that still reads in the dimmed square.
        m.userData.lit = true;
        if (m.map != null) {
          m.emissiveMap = m.map;
          m.emissive.setScalar(0.35);
        } else m.emissive.copy(m.color).multiplyScalar(0.35);
      });
      stake.add(realStake);
      realGuide.position.set(0, top + 0.14 - 0.26, -0.38);
      post.add(realGuide);
    } else {
      stake.add(peg, knob, ring);
      mergeByMaterial(stake);
    }
    stake.traverse((o) => {
      o.pointerEvents = 'none';
    });
    stake.position.set(0, top + 0.02, -0.38);
    stake.visible = false;
    post.add(stake);
    const grip = new Group();
    grip.name = `WallStake ${n}`;
    grip.position.set(0, top + 0.14, -0.38);
    post.add(grip);
    return { site, at, across, eye, yaw, wall, tall, low, skins, grain, post, stake, ring: grip, rest: top + 0.02, lantern, shown: 0, signs };
  });
  // The splash where the fire meets a wall, and the light it carries along the wire.
  const splash = new Flames(d.world, 6, 0x8ad0ff);
  splash.burning = 0;
  const blue = coldLights?.blue ?? own(new PointLight(0x5ab4ff, 0, 14, 1.4));
  const golden = coldLights?.golden ?? own(new PointLight(0xffd27a, 0, 9, 1.5));
  const ember = makeGlow(d.world, 0x9ad4ff, 0.06);
  ember.visible = false;
  d.stage.own('city', splash.mesh, ember);

  // The cold fire seen close: a pale core inside the tongue and a wide dim mantle about it, sparks thrown off it, and a cold vapour that wavers up behind it.
  const core = new Flames(d.world, DRESS.core, 0xe6f6ff);
  const mantle = new Flames(d.world, DRESS.mantle, 0x1a30b0);
  core.burning = 0;
  mantle.burning = 0;
  d.stage.own('city', core.mesh, mantle.mesh);
  const dot = softDot();
  const sparkAt = new Float32Array(DRESS.sparks * 3).fill(-100);
  const sparkGo = new Float32Array(DRESS.sparks * 3);
  const sparkLife = new Float32Array(DRESS.sparks);
  const sparkGeometry = new BufferGeometry();
  const sparkPlaces = new BufferAttribute(sparkAt, 3);
  sparkGeometry.setAttribute('position', sparkPlaces);
  const sparks = own(new Points(sparkGeometry, new PointsMaterial({ map: dot, color: 0xc8eaff, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })));
  sparks.name = 'ColdSparks';
  sparks.frustumCulled = false;
  sparks.pointerEvents = 'none';
  const vapour = own(new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: dot, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: DoubleSide }), DRESS.puffs));
  vapour.name = 'ColdVapour';
  vapour.frustumCulled = false;
  vapour.pointerEvents = 'none';
  const puffAt: Vector3[] = [];
  const puffAge = new Float32Array(DRESS.puffs).fill(99);
  const gone = new Matrix4().makeScale(0, 0, 0);
  const tint = new Color(0, 0, 0);
  for (let i = 0; i < DRESS.puffs; i += 1) {
    puffAt.push(new Vector3(0, -100, 0));
    vapour.setMatrixAt(i, gone);
    vapour.setColorAt(i, tint);
  }
  const layerAt = new Vector3();
  const sourceAt = new Vector3();
  const eyeAt = new Vector3();
  const puffTurn = new Quaternion();
  const puffSize = new Vector3();
  const puffPlace = new Matrix4();
  const upward = new Vector3(0, 1, 0);
  let sparkNext = 0;
  let sparkDue = 0;
  let puffNext = 0;
  let puffDue = 0;
  let chance = 11;
  const rnd = (): number => {
    chance = (chance * 16807) % 2147483647;
    return chance / 2147483647;
  };

  let held = 0;
  // The square's people watch it: they cheer a wall that holds, and stand as they were again after.
  const crowdWas = cast.crowd.map((p) => p.pose);
  let cheering = 0;
  const cheer = (seconds: number): void => {
    cheering = seconds;
    for (const p of cast.crowd) if (p.pose !== 'hidden') p.pose = 'wave';
    d.sounds.play('cheer', 0.45);
  };
  const PULL = front ? 'Pull the stake up: wall up before the fire reaches you.' : 'Pull the stake up till the lamp is green.';
  const FLY = front ? "Ride to the post in the fire's way." : 'Ride to the post where the fire is heading.';
  const LATE = 'Too late: it got past. Again.';
  const ringAt = new Vector3();
  const handAt = new Vector3();
  const spread = new Vector3();
  const firePoint = new Vector3();
  let splashLeft = 0;
  let clock = 0;
  // The moment it gets past her wall: the blue flares once before the dark.
  let flash = 0;
  let active: WallSite | null = null;
  /** A frame of the fire's dress: the core and mantle ride the tongue; sparks and vapour leave it, and burst from the wall where it is cut. */
  const dress = (delta: number): void => {
    const on = w.fire.on;
    const burst = splashLeft > 0 && active != null;
    if (on) {
      const road = w.spans[w.fire.span];
      for (let k = 0; k < DRESS.core; k += 1) {
        road.getPointAt(Math.max(0, Math.min(1, w.fire.t - k * 0.008)), layerAt);
        layerAt.y -= 0.4;
        core.place(k, layerAt, 0.5 - k * 0.045);
      }
      for (let k = 0; k < DRESS.mantle; k += 1) {
        road.getPointAt(Math.max(0, Math.min(1, w.fire.t - k * 0.02)), layerAt);
        layerAt.y -= 0.62;
        mantle.place(k, layerAt, 1.5 - k * 0.12);
      }
    }
    core.burning = on ? DRESS.core : 0;
    mantle.burning = on ? DRESS.mantle : 0;
    core.update(delta, head);
    mantle.update(delta, head);
    // Where they leave from: the wall's top (ahead) or the wire at the wall (beside) as it is cut, else the fire's point.
    const wide = burst && front ? 3 : 0.3;
    if (burst && active != null) sourceAt.copy(active.at).setY(front ? active.tall : active.at.y - 0.4);
    else sourceAt.copy(firePoint).setY(firePoint.y - 0.3);
    if (on || burst) {
      sparkDue += delta * (burst ? 80 : 26);
      while (sparkDue >= 1) {
        sparkDue -= 1;
        const i = sparkNext * 3;
        sparkNext = (sparkNext + 1) % DRESS.sparks;
        const aside = (rnd() - 0.5) * wide;
        sparkAt[i] = sourceAt.x + (active?.across.x ?? 1) * aside + (rnd() - 0.5) * 0.2;
        sparkAt[i + 1] = sourceAt.y + (rnd() - 0.5) * 0.3;
        sparkAt[i + 2] = sourceAt.z + (active?.across.z ?? 0) * aside + (rnd() - 0.5) * 0.2;
        sparkGo[i] = (rnd() - 0.5) * 1.4;
        sparkGo[i + 1] = 0.5 + rnd() * 1.6;
        sparkGo[i + 2] = (rnd() - 0.5) * 1.4;
        sparkLife[i / 3] = 0.4 + rnd() * 0.7;
      }
      puffDue += delta * 6;
      if (puffDue >= 1) {
        puffDue = 0;
        const aside = (rnd() - 0.5) * wide;
        puffAt[puffNext].copy(sourceAt).addScaledVector(active?.across ?? upward, active == null ? 0 : aside);
        puffAge[puffNext] = 0;
        puffNext = (puffNext + 1) % DRESS.puffs;
      }
    }
    for (let n = 0; n < DRESS.sparks; n += 1) {
      if (sparkLife[n] <= 0) continue;
      const i = n * 3;
      sparkLife[n] -= delta;
      sparkGo[i + 1] -= 2 * delta;
      sparkAt[i] += sparkGo[i] * delta;
      sparkAt[i + 1] += sparkGo[i + 1] * delta;
      sparkAt[i + 2] += sparkGo[i + 2] * delta;
      if (sparkLife[n] <= 0) sparkAt[i + 1] = -100;
    }
    sparkPlaces.needsUpdate = true;
    head.getWorldPosition(eyeAt);
    for (let n = 0; n < DRESS.puffs; n += 1) {
      const k = puffAge[n] / DRESS.puffLife;
      if (k >= 1) {
        vapour.setMatrixAt(n, gone);
        continue;
      }
      puffAge[n] += delta;
      const p = puffAt[n];
      p.y += 0.4 * delta;
      // It wavers as it rises: the air over the fire is not still.
      layerAt.copy(p);
      layerAt.x += Math.sin(clock * 4 + n * 1.7) * 0.06;
      layerAt.z += Math.cos(clock * 3.3 + n * 2.3) * 0.06;
      const size = 0.5 + 1.3 * k;
      puffTurn.setFromAxisAngle(upward, Math.atan2(eyeAt.x - layerAt.x, eyeAt.z - layerAt.z));
      vapour.setMatrixAt(n, puffPlace.compose(layerAt, puffTurn, puffSize.set(size, size * (1 + 0.15 * Math.sin(clock * 7 + n)), 1)));
      const bright = Math.sin(Math.PI * k) * 0.16;
      vapour.setColorAt(n, tint.setRGB(0.55 * bright, 0.78 * bright, bright));
    }
    vapour.instanceMatrix.needsUpdate = true;
    if (vapour.instanceColor != null) vapour.instanceColor.needsUpdate = true;
  };
  // Always: the walls rise to what they should be, the blue light rides the fire, the splash burns out.
  const alive = d.each((delta) => {
    clock += delta;
    if (cheering > 0) {
      cheering -= delta;
      if (cheering <= 0) cast.crowd.forEach((p, i) => {
        if (p.pose === 'wave') p.pose = crowdWas[i];
      });
    }
    for (const s of sites) {
      // Ahead of her, the wall she is at already stands to its foot; a wall never worked at is not there at all.
      const want = s === active || s.shown > 0 ? s.low + (1 - s.low) * s.shown : 0;
      const now = s.wall.scale.y / s.tall;
      const next = now + (want - now) * Math.min(1, delta * 7);
      s.wall.visible = next > 0.01;
      s.wall.scale.y = Math.max(0.01, next * s.tall);
      for (const picture of s.skins) picture.repeat.y = s.wall.scale.y * s.grain;
      s.wall.position.y = 0.15 + (next * s.tall) / 2;
    }
    if (w.fire.on) {
      w.spans[w.fire.span].getPointAt(Math.max(0, Math.min(1, w.fire.t)), firePoint);
      blue.position.copy(firePoint);
      // Coming at her, its light is strong enough to lie cold on the wall's face and on her hands.
      blue.intensity = (7 + 2 * Math.sin(clock * 17)) * (front ? 1.6 : 1) + flash * 30;
    } else blue.intensity = Math.max(0, blue.intensity - delta * 20);
    flash = Math.max(0, flash - delta * 4);
    dress(delta);
    if (splashLeft > 0 && active != null) {
      splashLeft -= delta;
      const k = Math.max(0, splashLeft / 0.7);
      // Met by the wall ahead of her, it spills along the wall's top to both sides and is gone; beside her, it splashes where the wire meets the wall.
      if (front) for (let i = 0; i < 6; i += 1) splash.place(i, firePoint.copy(active.at).setY(active.tall - 0.05).addScaledVector(active.across, (i - 2.5) * 0.45 * (2.2 - 1.2 * k)), 0.9 * k);
      else for (let i = 0; i < 6; i += 1) splash.place(i, firePoint.copy(active.at).setY(active.at.y - 0.9 + (i % 3) * 0.5).addScaledVector(spread.set(Math.sin(i * 2.1), 0, Math.cos(i * 2.1)), 0.25), 1.6 * k);
      splash.burning = 6;
    } else splash.burning = 0;
    splash.update(delta, head);
    golden.intensity = Math.max(0, golden.intensity - delta * 1.5);
  });

  // The day goes dim as the fire is fought.
  d.sounds.bed('fire_loop', 0.3, 1.5);
  // The scene's sun goes down with it to a third (the blue fire and the gold walls are seen by their own light), and comes back with the day.
  const sun = keyLight(d);
  const sunWas = sun?.intensity ?? 0;
  // Its colour goes cold with it: a night lit by the fire's blue, and the day's own colour back after.
  const warm = new Color(sun?.color.getHex() ?? 0xffffff);
  const cold = new Color(0x8ea8d0);
  if (import.meta.env.DEV) console.info(`[cold fire] the key light ${sun == null ? 'was not found' : `${sunWas} -> ${(sunWas * 0.3).toFixed(2)}`}`);
  const dusk = d.now;
  void d.until(() => {
    const k = Math.min(1, (d.now - dusk) / 1.2);
    if (sun != null) {
      sun.intensity = sunWas * (1 - 0.7 * k);
      sun.color.copy(warm).lerp(cold, k);
    }
    d.stage.blendWeather(WEATHER.rain2008, DIM, k);
    return k >= 1;
  });
  void d.gold.show(BOSSES.coldFire.name, mid.clone().setY(6.5), 4, 2.6, new Vector3(0, 0.15, 0), head);

  /** The magpie brings an ember over the first wall and lets it fall on the wire beyond. */
  const magpieDrops = async (to: WallSite): Promise<void> => {
    const start = sites[0].at.clone().setY(sites[0].at.y + 1.6);
    const over = w.spans[to.site.span].getPointAt(to.site.from, new Vector3()).add(new Vector3(0, 0.5, 0));
    const fly = async (a: Vector3, b: Vector3, seconds: number, lift: number): Promise<void> => {
      const began = d.now;
      magpie.lookAt(b.x, a.y, b.z);
      await d.until(() => {
        const k = Math.min(1, (d.now - began) / seconds);
        magpie.position.lerpVectors(a, b, k);
        magpie.position.y += Math.sin(k * Math.PI) * lift;
        ember.position.copy(magpie.position).setY(magpie.position.y - 0.12);
        return k >= 1;
      });
    };
    magpie.position.copy(start);
    magpie.visible = true;
    magpie.userData.clip = 'flap';
    ember.visible = true;
    d.sounds.play('wing_flaps', 0.6, 1.2);
    if (import.meta.env.DEV) console.info('[cold fire] the magpie carries an ember over the first wall');
    await fly(start, over, 1.6, 1.2);
    ember.visible = false;
    d.sounds.play('fuse_burn', 0.6, 1.4);
    void fly(over, over.clone().add(new Vector3(-6, 5, 4)), 1.4, 0).then(() => {
      magpie.visible = false;
      magpie.userData.clip = 'idle';
    });
  };

  const game = playMiniGame(new MiniGame(WORDS.firewall, WALLS.stages.map((s) => ({ name: s.name }))));
  const minis = d.world.getSystem(MiniGameSystem);
  const phase = (): Phase => game.phase;
  const charged = new Set<number>();
  let perched = -1;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() !== 'playing') continue;
    const n = game.stage;
    const stage = WALLS.stages[n];
    const here = sites[n];
    active = here;
    for (const s of sites) s.post.visible = s === here;
    // The wire is whole and lit again up to where this fire starts; this wall is down.
    w.fire.on = false;
    darkenBehind(w, true);
    here.shown = 0;
    if (perched !== n) {
      // To the post beside this wall.
      goal(FLY, [held, WALLS.stages.length]);
      await flyToPerch(d, here.eye, here.yaw);
      perched = n;
    }
    if (n === 2 && game.failuresOf(n) === 0) await magpieDrops(here);
    const run = startWall(stage, game.failuresOf(n));
    w.fire.span = here.site.span;
    w.fire.t = here.site.from;
    w.fire.on = true;
    here.stake.position.y = here.rest;
    here.stake.visible = true;
    here.lantern.emissive.setHex(0xff3020);
    here.lantern.emissiveIntensity = 2.4;
    here.lantern.color.setHex(0xff7a60);
    setDeskMode('one');
    setV2Targets([here.ring]);
    goal(PULL, [held, WALLS.stages.length]);
    let taken: Side | null = null;
    let pump: Pump | null = null;
    let lift = 0;
    let skipped = false;
    let waited = 0;
    if (import.meta.env.DEV) {
      const p = d.player.worldToLocal(here.ring.getWorldPosition(new Vector3()));
      console.info(`[cold fire] stage ${n + 1} (${stage.name}): ${stage.pulls} pulls in ${run.seconds.toFixed(1)} s; ${front ? `the wall ${Math.hypot(here.eye.x - here.at.x, here.eye.z - here.at.z).toFixed(2)} m ahead, its foot ${(here.eye.y - 0.15 - here.low * here.tall).toFixed(2)} m under the eye; ` : ''}the stake at ${p.toArray().map((v) => v.toFixed(2))} (player space); ${here.signs}`);
    }
    await new Promise<void>((done) => {
      const stop = d.each((delta) => {
        if (minis?.playPaused ?? false) return;
        if (skipped) while (wallUp(run) < 1) pull(run);
        // The stake: one reach takes it; then every rise of that hand is a pull, and it drops back as the hand comes down.
        let pulledNow = false;
        if (taken == null) {
          here.ring.getWorldPosition(ringAt);
          for (const side of SIDES) {
            if (taken != null || !takes(d, side, ringAt, 0.12)) continue;
            taken = side;
            pump = newPump(handPoint(d, side, handAt).y);
            d.sounds.play('grab_soft', 0.7);
            setV2Targets([]);
            // The emulator's mouse now works the hands up and down.
            setDeskMode('handles');
            if (import.meta.env.DEV) console.info(`[cold fire] stake taken by ${side}`);
          }
        } else if (pump != null) {
          const y = handPoint(d, taken, handAt).y;
          pulledNow = stepPump(pump, y, PULL_TRAVEL) === 'up';
          lift = pump.up ? 1 : Math.max(0, Math.min(1, (y - pump.low) / PULL_TRAVEL));
          here.stake.position.y = here.rest + STAKE_PULL * lift;
        }
        if (pulledNow) {
          here.shown = pull(run);
          if (here.shown >= 1) {
            here.lantern.emissive.setHex(0x30ff60);
            here.lantern.color.setHex(0x9affb0);
            d.sounds.play('ear_click', 0.6, 1.7);
          }
          golden.position.copy(here.at);
          golden.intensity = 6;
          d.sounds.play('sandbag_drop', 0.7, 0.75);
          d.sounds.play('rope_creak', 0.4, 1.3);
          if (import.meta.env.DEV) console.info(`[cold fire] pull ${run.pulls}/${stage.pulls}: the wall is ${Math.round(here.shown * 100)}% up at ${Math.round(run.t * 100)}% of the fire's way`);
        }
        if (skipped) here.shown = 1;
        // Before the wall is whole, a pull part done shows as the wall stirring.
        if (here.shown < 1) here.shown = Math.max(here.shown, (run.pulls + (pump?.up === true ? 0 : 0.5 * lift)) / stage.pulls);
        // The fire leaves when the stake is in a hand (or after a few seconds): the wall's time is all for pulling.
        // A wall ahead of her hides the fire once it is whole: then the fire comes on fast, so she is not left waiting behind it.
        if (taken != null || skipped || waited >= WALLS.grace) stepWall(run, delta * (front && !stage.held && wallUp(run) >= 1 ? AHEAD.hurry : 1));
        else waited += delta;
        w.fire.t = here.site.from + (here.site.t - here.site.from) * run.t;
        darkenBehind(w);
        if (run.result === 'playing') return;
        stop();
        done();
      });
      d.onSkip(() => {
        skipped = true;
      });
    });
    setV2Targets([]);
    setDeskMode('one');
    here.stake.visible = false;
    if (import.meta.env.DEV) console.info(`[cold fire] stage ${n + 1}: ${run.result}`);
    if (run.result === 'cut') {
      // The fire dies against the wall.
      here.shown = 1;
      w.fire.on = false;
      splashLeft = 0.7;
      d.sounds.play('bucket_splash', 0.8, 1.5);
      d.sounds.play('ear_click', 0.6, 0.8);
      here.lantern.emissive.setHex(0x30ff60);
      here.lantern.emissiveIntensity = 2.6;
      here.lantern.color.setHex(0x9affb0);
      held = n + 1;
      goal(PULL, [held, WALLS.stages.length]);
      cheer(2.4);
      await d.wait(1.4);
      game.win();
      continue;
    }
    // It ran on past the unfinished wall to the homes at the wire's end: a window goes dark there, and the wall is tried again.
    const from = w.fire.t;
    const ran = d.now;
    // Ahead of her, it comes over the unfinished wall at her: the view goes dark before it arrives (nobody is shown burning).
    const dark = front ? d.rig.fadeTo(1) : null;
    if (front) {
      flash = 1;
      goal(LATE, [held, WALLS.stages.length]);
      d.sounds.play('wind_gust', 0.9, 1.2);
    }
    await d.until(() => {
      const k = Math.min(1, (d.now - ran) / (front ? 0.6 : 1.3));
      w.fire.t = from + (1 - from) * k;
      darkenBehind(w);
      return k >= 1;
    });
    if (dark != null) {
      await dark;
      w.fire.on = false;
      await d.wait(0.5);
      await d.rig.fadeTo(0);
    }
    if (!charged.has(n)) {
      charged.add(n);
      d.day.darkWindows += 1;
      countWindows(d, cast);
    }
    d.sounds.play('bank_creak', 0.7, 1.3);
    d.sounds.play('crowd_gasp', 0.5);
    d.sounds.play('crowd_boo', 0.3);
    w.fire.on = false;
    await d.wait(0.6);
    game.lose('the fire passed the wall');
  }
  endMiniGame(game);
  active = null;
  for (const s of sites) s.post.visible = false;
  if (import.meta.env.DEV) console.info(`[cold fire] won, ${charged.size} windows lost on the way`);
  setV2Targets([]);
  w.fire.on = false;
  magpie.visible = false;
  d.sounds.bed('fire_loop', 0);
  d.sounds.play('applause', 0.8);
  void d.gold.show(BOSSES.coldFire.won, mid.clone().setY(3.5), 3, 2.8, new Vector3(0, 0.2, 0), head);
  // Contained: the day comes back, and the windows the cold fire put out come on again, one by one. A window lost for want of a wall stays dark.
  goal('Watch the windows come back on.', [held, WALLS.stages.length]);
  darkenBehind(w, true);
  const dawn = d.now;
  void d.until(() => {
    const k = Math.min(1, (d.now - dawn) / 1.6);
    if (sun != null) {
      sun.intensity = sunWas * (0.3 + 0.7 * k);
      sun.color.copy(cold).lerp(warm, k);
    }
    d.stage.blendWeather(DIM, WEATHER.rain2008, k);
    return k >= 1;
  });
  for (; troubleDark > 0; troubleDark -= 1) {
    d.day.darkWindows = Math.max(0, d.day.darkWindows - 1);
    countWindows(d, cast);
    d.sounds.play('ear_click', 0.35, 1.2);
    await d.wait(0.45);
  }
  await d.wait(1.0);
  alive();
  placeGoal();
  blue.intensity = 0;
  golden.intensity = 0;
  splash.burning = 0;
  splash.update(0, head);
  core.burning = 0;
  mantle.burning = 0;
  core.update(0, head);
  mantle.update(0, head);
  sparks.visible = false;
  vapour.visible = false;
  cast.shops.lit = cast.shops.total;
  d.day.problem = 3;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;
  await flyToPerch(d, CITY.shoulder.clone(), Math.PI);
  await showCard(d, 'firewall');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
  ]);
}
