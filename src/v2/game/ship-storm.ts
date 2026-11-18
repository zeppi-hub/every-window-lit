import {
  AdditiveBlending,
  AssetManager,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';
import { setDeskLook, setDeskMode } from '../desk-hands.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { featherMesh, parrotWords, stowWing } from '../parrot-system.js';
import { type BailStage, ease, SHIP, surface, tideAt } from '../ship-bail.js';
import { easeHelm, HELM, type Helm, type HelmStage, type HelmStep, helmOf, newHelm, safeArc, stepHelm } from '../ship-helm.js';
import { setV2Targets } from '../step-targets.js';
import { wristJoint } from '../wing-hands-system.js';
import { BailPlay, type BailSet, dimSun, driftRipples, Droplets, goal, rippleTexture, Seat } from './bail-play.js';
import { type BodyLook, PerformerBody } from './circus-body.js';
import { type Hands, readHands, standard, Vignette } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { makeGlow } from './fx.js';
import { WORDS } from './lines.js';
import { FEATHER, prop } from './opening.js';
import { WEATHER, type Weather } from './stage.js';

/**
 * S13, the storm ship. Inside the memory the player is one of the crew,
 * seated at an open hatch on the waist deck with a bucket: the hold is
 * filling, a red line is painted round the inside of the hatch, and the
 * water at that line founders her. The bucket is plunged, lifted and heaved
 * over the rail; a sea shooting in through a wash port lands on the
 * hatch's sliding cover, which works itself open and has to be shoved shut;
 * a plank springs (stage 2); green water breaks over the rail (stage 3).
 * Bailed down to the brass mark, a stage is won, the ship's bell rings and
 * one of three small lamps on the hatch is lit; the word's feather hangs
 * by the bell from the first moment, and comes to the wing at the end.
 *
 * The rules are v2/ship-bail.ts, the hands v2/game/bail-play.ts. The camera
 * is never turned or moved by the game. The sea and the sky stay level, as
 * the body says they are, and the ship rolls under the player about the
 * point where her eye is: the deck, the hatch, its cover and the rail tip
 * toward her and away, the lanterns and the bell swing on their hooks, and
 * the water in the hatch and the bucket in her hand keep to the true
 * level. Less motion rolls her a third as far.
 */

/** The eye above the step the player sits on (m). */
const EYE_UP = 0.92;
/** The hatch's opening from the eye: from left to right, and from its near edge to its far one (m). */
const HATCH = { left: -0.55, right: 0.5, near: 0.2, far: 0.74, wall: 0.05, floor: -0.64 } as const;
/** The sliding cover: its width, how far it slides open (to the left), and its handle with the cover shut. */
const COVER = { wide: 0.52, travel: 0.36, handle: { right: -0.07, up: SHIP.brim + 0.07, ahead: 0.38 } } as const;
/** The float gauge by the hatch: how much of its board is red (top) and brass (bottom), its size (m) and where it stands (right of the eye). */
const GAUGE = { red: 0.22, brass: 0.14, wide: 0.11, tall: 0.46, right: -0.3 } as const;
/** Rain driven on the wind: how many streaks, and how they fall (m/s: right, up, ahead; the wind is off the starboard bow). */
const RAIN = { count: 320, fall: new Vector3(0.8, -9.5, -4.2) } as const;
/** One of the crew: a navy jersey, dark oilskin trousers, sea boots (her own body, seen when she looks down). */
const SAILOR: BodyLook = { suit: 0x1c2a44, trim: 0x31456a, tights: 0x2a2e35, shoes: 0x14120f, skin: 0xd9a983, head: false };
/** The bucket's lane over the hatch: to the right of the eye, and ahead of it (m). */
const LANE = { right: 0.27, ahead: 0.42 } as const;
/** The last seconds before a sea breaks, when a hand on the cover (or a pinch, or a click) holds it through: as long as the play braces it for (bail-play.ts). */
const BRACE_WINDOW = 1.2;
/** Where the player is, and what she is here for (v2/goal.ts). */
const WHERE = 'MEMORY · THE SHIP';
const EARN = 'Earn the word BAIL OUT: keep the water under the red line.';
const HOLD = 'Hold the cover at green; bail between the waves.';
const STEER = 'Turn the wheel toward the dot: keep it in the green as each sea hits.';
/** The wheel (the middle stage): her eye above the deck there, how far inboard of the hatch seat she sits, and the way she faces (the bow). */
const HELM_SEAT = { up: 1.02, inboard: 0.75, yaw: -Math.PI / 2 } as const;
/** The wheel from her eye (m): its hub, the circle the hands hold, how far the spokes' handles reach, and the most it turns either way. */
const WHEEL = { down: 0.46, ahead: 0.38, rim: 0.29, handle: 0.33, most: Math.PI / 3 } as const;
/** The binnacle's dial from her eye (m): its middle, its size, the circle the bead rides, and how far it leans back to face her. */
const DIAL = { down: 0, ahead: 0.62, wide: 0.08, bead: 0.06, lean: -0.45 } as const;
/** The big seas of the wheel's stage: how fast they come on (m/s) and how high they stand (m). */
const SEAS = { speed: 9, high: 3 } as const;
/** How far the sea rolls in each stage (degrees): the rehearsal, then the three stages; and after the storm. */
const ROLL = [3, 5.5, 7.5, 9.5] as const;
const ROLL_AFTER = 1.5;
/** The storm's sky, a flash of lightning, and the sky once it has blown over. */
const STORM: Weather = { sky: 0x0e141c, fog: 0x1a222c, density: 0.018, light: 0.22 };
const FLASH: Weather = { sky: 0x93a6ba, fog: 0x5c6c7c, density: 0.018, light: 1.7 };
const AFTER: Weather = { sky: 0x5b6672, fog: 0x6c7682, density: 0.009, light: 0.8 };
/** The scene's sun in the storm (a share of its daylight strength, cold): the night, a flash of lightning, and the moon once it has blown over. The lanterns are the light on deck. */
const NIGHT = { storm: 0.14, flash: 1.5, after: 0.4, colour: 0x8ea8d0 } as const;

/** The gauge on the hatch's far inner wall: wet planks, a tick every 4.5 cm, the brass mark low down and the red line near the brim. */
function gaugeTexture(wide: number, top: number, bottom: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 840;
  canvas.height = 224;
  const g = canvas.getContext('2d');
  const y = (up: number): number => ((top - up) / (top - bottom)) * canvas.height;
  if (g != null) {
    g.fillStyle = '#1b1410';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#0e0a08';
    g.lineWidth = 3;
    for (let k = 1; k < 4; k += 1) {
      g.beginPath();
      g.moveTo(0, (k * canvas.height) / 4);
      g.lineTo(canvas.width, (k * canvas.height) / 4);
      g.stroke();
    }
    g.fillStyle = '#b9b2a4';
    for (let up = SHIP.line - 0.045; up > SHIP.dry + 0.01; up -= 0.045) {
      for (let x = 60; x < canvas.width; x += 120) g.fillRect(x - 14, y(up) - 2, 28, 4);
    }
    // The brass mark: bailed down to here, she is safe.
    g.fillStyle = '#d6ae52';
    g.fillRect(0, y(SHIP.dry) - 5, canvas.width, 10);
    // The red line.
    g.fillStyle = '#d8212c';
    g.fillRect(0, y(SHIP.line) - 9, canvas.width, 18);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  void wide;
  return texture;
}

/** The float gauge's board: red at the top (she founders), brass at the bottom (she is safe), a tick for every tenth between. */
function boardTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#6a5a44';
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#3f3324';
    for (let y = 9; y < 256; y += 23) g.fillRect(0, y, 64, 2);
    g.fillStyle = '#a4222a';
    g.fillRect(0, 0, 64, 256 * GAUGE.red);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, 256 * (1 - GAUGE.brass), 64, 256 * GAUGE.brass);
    g.fillStyle = '#d9d0b8';
    for (let k = 1; k < 10; k += 1) {
      const y = 256 * (GAUGE.red + ((1 - GAUGE.red - GAUGE.brass) * k) / 10);
      g.fillRect(k === 5 ? 20 : 34, y - 1.5, k === 5 ? 44 : 30, 3);
    }
    g.strokeStyle = '#2a211a';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 60, 252);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Storm cloud all round, drawn once: black-blue overhead, torn paler rags lower down, a band of dim light along the horizon so the sea's edge is seen. */
function cloudTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  if (g != null) {
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#05070b');
    sky.addColorStop(0.38, '#0d141d');
    sky.addColorStop(0.5, '#3a4856');
    sky.addColorStop(0.53, '#0b1218');
    sky.addColorStop(1, '#05080b');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1024, 512);
    let seed = 11;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 150; k += 1) {
      const x = random() * 1024;
      const y = 40 + random() * 215;
      const r = 30 + random() * 90;
      const pale = random() < 0.45;
      for (const dx of [-1024, 0, 1024]) {
        // A flattened round rag, soft to its very edge (a clipped one shows as a tile).
        g.save();
        g.translate(x + dx, y);
        g.scale(1, 0.45);
        const blob = g.createRadialGradient(0, 0, 2, 0, 0, r);
        blob.addColorStop(0, pale ? 'rgba(96,112,130,0.3)' : 'rgba(2,4,7,0.5)');
        blob.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = blob;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A seaman's jersey, drawn once: dark wool in ribs, each rib a column of small stitches. */
function knitTexture(wool: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = `#${wool.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.fillRect(x, 0, 2, 64);
      g.strokeStyle = 'rgba(150,170,205,0.2)';
      g.lineWidth = 1;
      for (let y = 0; y < 64; y += 4) {
        g.beginPath();
        g.moveTo(x + 2.5, y);
        g.lineTo(x + 5, y + 2);
        g.lineTo(x + 7.5, y);
        g.stroke();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

/** A lantern on a hook: its pivot at the hook, the lamp hanging below with its own light. */
function buildLantern(light: number): { pivot: Group; lamp: PointLight; glass: Mesh } {
  const pivot = new Group();
  pivot.name = 'Lantern';
  const iron = standard(0x1a1714, 0.6, 0.6);
  const hang = new Mesh(new CylinderGeometry(0.004, 0.004, 0.1, 5), iron);
  hang.position.y = -0.05;
  const glass = new Mesh(new CylinderGeometry(0.036, 0.042, 0.1, 10), new MeshBasicMaterial({ color: 0xffc777, fog: false }));
  glass.position.y = -0.16;
  const cap = new Mesh(new ConeGeometry(0.055, 0.04, 10), iron);
  cap.position.y = -0.09;
  const foot = new Mesh(new CylinderGeometry(0.048, 0.048, 0.015, 10), iron);
  foot.position.y = -0.215;
  const lamp = new PointLight(0xffb463, light, 9, 1.7);
  lamp.position.y = -0.16;
  pivot.add(hang, glass, cap, foot, lamp);
  return { pivot, lamp, glass };
}

/** The ship's bell: brass, hung from its crown. */
function buildBell(): Group {
  const pivot = new Group();
  pivot.name = 'ShipBell';
  const profile = [[0.0, 0], [0.025, 0], [0.035, -0.02], [0.04, -0.06], [0.05, -0.09], [0.066, -0.105]].map(([r, y]) => new Vector2(r, y));
  const bell = new Mesh(new LatheGeometry(profile, 16), new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.6, side: DoubleSide, emissive: 0xffc24a, emissiveIntensity: 0 }));
  bell.name = 'BellBrass';
  bell.position.y = -0.03;
  pivot.add(bell);
  return pivot;
}

/** The open sea: how many cells across, how far it reaches from her (m), and how much finer the cells are near her than far off. */
const SEA = { cells: 64, reach: 190, pack: 1.8, steep: 0.62, heave: 0.9, comberHeave: 0.55, comberWide: 6 } as const;
/** The swells of a gale, coming on at the starboard beam (ahead of her is +z; they travel toward -z): length and height (m), the way each runs, where it starts in its beat. */
const SWELLS = [
  { long: 78, high: 2.4, x: 0.25, z: -0.97, at: 0.4 },
  { long: 44, high: 1.2, x: -0.45, z: -0.89, at: 2.1 },
  { long: 26, high: 0.6, x: 0.6, z: -0.8, at: 4.4 },
] as const;

/** The binnacle's face, drawn once: dark enamel, a tick every thirty degrees, and her own hull in the middle with its bow up. */
function dialTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#0c1620';
    g.fillRect(0, 0, 256, 256);
    g.translate(128, 128);
    g.strokeStyle = '#8f8a78';
    g.lineCap = 'round';
    for (let k = 0; k < 12; k += 1) {
      g.save();
      g.rotate((k * Math.PI) / 6);
      g.lineWidth = k % 3 === 0 ? 5 : 2.5;
      g.beginPath();
      g.moveTo(0, -122);
      g.lineTo(0, k % 3 === 0 ? -104 : -110);
      g.stroke();
      g.restore();
    }
    // The hull, seen from above, bow to the top.
    g.fillStyle = '#d9c48a';
    g.beginPath();
    g.moveTo(0, -46);
    g.quadraticCurveTo(22, -16, 17, 34);
    g.lineTo(-17, 34);
    g.quadraticCurveTo(-22, -16, 0, -46);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Wind-streaked chop, drawn once in greys: laid over the sea so its long backs are not smooth. */
function chopTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#c4c4c4';
    g.fillRect(0, 0, 256, 256);
    let seed = 23;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    g.lineCap = 'round';
    for (let k = 0; k < 260; k += 1) {
      const x = random() * 256;
      const y = random() * 256;
      const long = 6 + random() * 22;
      g.strokeStyle = k % 2 === 0 ? `rgba(255,255,255,${(0.1 + random() * 0.25).toFixed(2)})` : `rgba(70,70,70,${(0.1 + random() * 0.25).toFixed(2)})`;
      g.lineWidth = 1 + random() * 3;
      // Drawn again a tile away wherever it crosses an edge, so the tiles meet.
      for (const dx of [-256, 0, 256]) {
        for (const dy of [-256, 0, 256]) {
          g.beginPath();
          g.moveTo(x + dx, y + dy);
          g.quadraticCurveTo(x + dx + long / 2, y + dy - 2 + random() * 4, x + dx + long, y + dy + 1);
          g.stroke();
        }
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * The storm sea, moved every frame: long swells heap up, sharpen at their tops,
 * whiten there and pass under her. No lamp reaches it, so it is shaded here,
 * point by point: a face turned toward her is dark water, a back turned away
 * carries the pale band of sky, a pinched crest is foam.
 * `state` is how high the sea runs (0 flat, 1 the full gale).
 */
/** One big sea, marching in over the swells: how far off its crest still is along the way the seas come from (m; negative once it has passed under her), and how high it stands (m). */
interface Comber {
  at: number;
  high: number;
}

function buildSea(eye: Vector3): { mesh: Mesh; update: (clock: number, state: number, delta: number, combers?: readonly Comber[]) => void; heightAt: (clock: number, state: number, combers?: readonly Comber[]) => number } {
  const n = SEA.cells + 1;
  const rest = new Float32Array(n * n * 2);
  const at = new Float32Array(n * n * 3);
  const colour = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const line = (i: number): number => {
    const u = (i / SEA.cells) * 2 - 1;
    return Math.sign(u) * Math.abs(u) ** SEA.pack * SEA.reach;
  };
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const v = j * n + i;
      // In the sea's own frame: she is at its middle, the seas come from its +z. Turning the frame turns the sea round her.
      rest[v * 2] = line(i);
      rest[v * 2 + 1] = line(j);
      uv[v * 2] = rest[v * 2] / 9;
      uv[v * 2 + 1] = rest[v * 2 + 1] / 9;
    }
  }
  const index = new Uint16Array(SEA.cells * SEA.cells * 6);
  let o = 0;
  for (let j = 0; j < SEA.cells; j += 1) {
    for (let i = 0; i < SEA.cells; i += 1) {
      const a = j * n + i;
      index.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], o);
      o += 6;
    }
  }
  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(at, 3);
  const colours = new BufferAttribute(colour, 3);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', colours);
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  const chop = chopTexture();
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, map: chop }));
  mesh.name = 'StormSea';
  mesh.frustumCulled = false;
  mesh.pointerEvents = 'none';
  mesh.position.set(eye.x, 0, eye.z);
  // Each swell's beat: its wave number, how fast it turns (deep water), and how far it draws the water toward its crest.
  const swells = SWELLS.map((s) => {
    const k = (Math.PI * 2) / s.long;
    return { ...s, k, turn: Math.sqrt(9.81 * k), draw: SEA.steep / (k * s.high * SWELLS.length) };
  });
  const update = (clock: number, state: number, delta: number, combers: readonly Comber[] = []): void => {
    chop.offset.x += delta * 0.03;
    chop.offset.y -= delta * 0.05;
    const foamy = Math.min(1, state * 1.5);
    for (let v = 0; v < n * n; v += 1) {
      const x0 = rest[v * 2];
      const z0 = rest[v * 2 + 1];
      let x = x0;
      let y = 0;
      let z = z0;
      let nx = 0;
      let nz = 0;
      let pinch = 0;
      for (const s of swells) {
        const beat = s.k * (s.x * x0 + s.z * z0) - s.turn * clock + s.at;
        const sin = Math.sin(beat);
        const cos = Math.cos(beat);
        const high = s.high * state;
        x += s.draw * high * s.x * cos;
        z += s.draw * high * s.z * cos;
        y += high * sin;
        nx -= s.x * s.k * high * cos;
        nz -= s.z * s.k * high * cos;
        pinch += s.draw * s.k * s.high * sin;
      }
      // A big sea: one long hump across the way it comes, white along its top.
      let top = 0;
      for (const comber of combers) {
        if (comber.high <= 0) continue;
        const from = (z0 - comber.at) / SEA.comberWide;
        if (from > 3 || from < -3) continue;
        const hump = comber.high * Math.exp(-from * from);
        y += hump;
        nz += (2 * from * hump) / SEA.comberWide;
        top = Math.max(top, hump / 3);
      }
      at[v * 3] = x;
      at[v * 3 + 1] = y;
      at[v * 3 + 2] = z;
      // How much this point's face is turned toward her (seen from where she sits).
      const dx = -x;
      const dz = -z;
      const far = Math.max(2, Math.hypot(dx, dz));
      const facing = (nx * dx + nz * dz) / far;
      const pale = Math.min(1, Math.max(0, 0.4 - 1.5 * facing));
      const edge = (pinch / SEA.steep - 0.45) / 0.4;
      const foam = Math.min(1, foamy * Math.min(1, Math.max(0, edge)) ** 2 + Math.min(1, top) ** 14);
      colour[v * 3] = 0.007 + 0.045 * pale + 0.3 * foam;
      colour[v * 3 + 1] = 0.015 + 0.065 * pale + 0.34 * foam;
      colour[v * 3 + 2] = 0.02 + 0.075 * pale + 0.36 * foam;
    }
    positions.needsUpdate = true;
    colours.needsUpdate = true;
  };
  const heightAt = (clock: number, state: number, combers: readonly Comber[] = []): number => {
    let y = 0;
    for (const s of swells) y += s.high * state * Math.sin(-s.turn * clock + s.at);
    // She rides only part of a big sea: the rest of it stands up her bow.
    for (const comber of combers) if (comber.high > 0) y += SEA.comberHeave * comber.high * Math.exp(-((comber.at / SEA.comberWide) ** 2));
    return y;
  };
  return { mesh, update, heightAt };
}

/** S13: the storm ship. */
export async function s13(d: DirectorSystem): Promise<void> {
  d.chapter('S13');
  await d.stage.show('ship', STORM);
  // The hatch set (art/v2/gemi, ambar.glb): loaded while the view is still white. Without it the plain timbers below stand in.
  let kit: Object3D | null = null;
  try {
    kit = (await AssetManager.loadGLTF('v2/gemi/ambar.glb', 'v2_ship_hatch')).scene.getObjectByName('ambar') ?? null;
  } catch {
    kit = null;
  }
  // The wheel (art/v2/gemi, dumen.glb), when it is there: asked for first, so a missing file is not waited on. Without it a plain wheel stands in.
  let helmKit: Object3D | null = null;
  try {
    const there = await fetch('v2/gemi/dumen.glb', { method: 'HEAD' }).then(
      (r) => r.ok && !(r.headers.get('content-type') ?? '').includes('html'),
      () => false,
    );
    if (there) helmKit = (await AssetManager.loadGLTF('v2/gemi/dumen.glb', 'v2_ship_wheel')).scene.getObjectByName('dumen') ?? null;
  } catch {
    helmKit = null;
  }
  stowWing(true);
  dimSun(d, { share: NIGHT.storm, colour: NIGHT.colour });
  d.rain.on = true;
  const rootEntity = d.stage.entity('ship');
  const sea = d.stage.node('ship', 'sea');
  const hull = d.stage.node('ship', 'ship');
  if (rootEntity == null) return;
  const eye = d.stage.point('ship', 'seat_deck', new Vector3()).add(new Vector3(0, EYE_UP, 0));
  // Facing the starboard rail (+z).
  const yaw = Math.PI;
  const seat = new Seat(eye, yaw);
  d.rig.place(eye, yaw);
  // The sweep and the rope's coil lie where the bucket is swung; the drum stands where the wheel is.
  for (const name of ['oar', 'sail_rope_handle', 'hold_water', 'drum']) {
    const node = d.stage.node('ship', name);
    if (node != null) node.visible = false;
  }

  // Everything this game adds, in the seat's own frame: x to the right, y up, -z ahead.
  const set = new Group();
  set.name = 'ShipHatch';
  set.position.copy(eye);
  set.rotation.y = yaw;
  // The seat is the deck's: where things are on it follows the roll.
  seat.frame = set;
  const yawTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const rollTurn = new Quaternion();
  const fore = new Vector3(1, 0, 0);
  d.world.createTransformEntity(set, { parent: rootEntity, persistent: true });
  d.stage.own('ship', set);
  const P = (right: number, up: number, ahead: number): Vector3 => new Vector3(right, up, -ahead);
  // The same, into one vector kept for the frame's work.
  const scratch = new Vector3();
  const Q = (right: number, up: number, ahead: number): Vector3 => scratch.set(right, up, -ahead);
  // The set's fixed timbers and ironwork are many small boxes: they are gathered by material and drawn as one mesh each.
  const batches = new Map<Material, { at: number[]; normal: number[]; uv: number[] }>();
  const slab = (r0: number, r1: number, u0: number, u1: number, a0: number, a1: number, material: Material): void => {
    const geometry = new BoxGeometry(r1 - r0, u1 - u0, a1 - a0).toNonIndexed();
    geometry.translate((r0 + r1) / 2, (u0 + u1) / 2, -(a0 + a1) / 2);
    let batch = batches.get(material);
    if (batch == null) {
      batch = { at: [], normal: [], uv: [] };
      batches.set(material, batch);
    }
    batch.at.push(...geometry.getAttribute('position').array);
    batch.normal.push(...geometry.getAttribute('normal').array);
    batch.uv.push(...geometry.getAttribute('uv').array);
    geometry.dispose();
  };
  const timbers: Mesh[] = [];
  const bake = (): void => {
    for (const [material, batch] of batches) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(batch.at), 3));
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(batch.normal), 3));
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(batch.uv), 2));
      const mesh = new Mesh(geometry, material);
      mesh.name = 'HatchTimbers';
      mesh.pointerEvents = 'none';
      set.add(mesh);
      timbers.push(mesh);
    }
    batches.clear();
  };
  const box = (r0: number, r1: number, u0: number, u1: number, a0: number, a1: number, material: Material): Mesh => {
    const mesh = new Mesh(new BoxGeometry(r1 - r0, u1 - u0, a1 - a0), material);
    mesh.position.copy(P((r0 + r1) / 2, (u0 + u1) / 2, (a0 + a1) / 2));
    mesh.pointerEvents = 'none';
    set.add(mesh);
    return mesh;
  };
  // The ship's own deck planks, if they are one plain material.
  const planks = (d.stage.node('ship', 'ship_deck_wood') as Mesh | null)?.material;
  const wood = planks != null && !Array.isArray(planks) ? planks.clone() : standard(0x5a4030, 0.85);
  const dark = standard(0x1b1410, 0.85);
  const iron = standard(0x1a1714, 0.6, 0.6);
  const red = new MeshStandardMaterial({ color: 0xd8212c, emissive: 0xd8212c, emissiveIntensity: 0.55, roughness: 0.5 });
  const brass = new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.6, emissive: 0xffc24a, emissiveIntensity: 0 });
  const H = HATCH;
  const brim = SHIP.brim;
  // The coaming: four walls of deck planks round the opening, standing on the step (the far one down to the deck).
  slab(H.left - H.wall, H.right + H.wall, -EYE_UP - 0.02, brim, H.near - H.wall, H.near, wood);
  slab(H.left - H.wall, H.right + H.wall, -EYE_UP - 0.55, brim, H.far, H.far + H.wall, wood);
  slab(H.left - H.wall, H.left, -EYE_UP - 0.55, brim, H.near, H.far, wood);
  slab(H.right, H.right + H.wall, -EYE_UP - 0.55, brim, H.near, H.far, wood);
  // Inside: dark wet planks, the red line all round, and the gauge on the far wall.
  slab(H.left, H.right, H.floor - 0.02, H.floor, H.near, H.far, dark);
  slab(H.left, H.left + 0.004, H.floor, brim - 0.002, H.near, H.far, dark);
  slab(H.right - 0.004, H.right, H.floor, brim - 0.002, H.near, H.far, dark);
  slab(H.left, H.right, H.floor, brim - 0.002, H.near, H.near + 0.004, dark);
  slab(H.left + 0.004, H.left + 0.008, SHIP.line - 0.011, SHIP.line + 0.011, H.near, H.far, red);
  slab(H.right - 0.008, H.right - 0.004, SHIP.line - 0.011, SHIP.line + 0.011, H.near, H.far, red);
  slab(H.left, H.right, SHIP.line - 0.011, SHIP.line + 0.011, H.near + 0.004, H.near + 0.008, red);
  const gaugeMap = gaugeTexture(H.right - H.left, brim, H.floor);
  const gauge = new Mesh(new PlaneGeometry(H.right - H.left, brim - H.floor), new MeshStandardMaterial({ map: gaugeMap, emissiveMap: gaugeMap, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.7 }));
  gauge.name = 'HatchGauge';
  gauge.position.copy(P((H.left + H.right) / 2, (brim + H.floor) / 2, H.far - 0.003));
  gauge.pointerEvents = 'none';
  set.add(gauge);
  const plate = box(-0.09, 0.09, SHIP.dry - 0.014, SHIP.dry + 0.014, H.far - 0.012, H.far - 0.004, brass);
  plate.name = 'DryMark';
  // Rain and spray on the deck: the ship's planks shine wet.
  d.stage.root('ship')?.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (material != null && !Array.isArray(material) && material.roughness != null && material.userData.wet !== true && o.name !== 'sea') {
      material.roughness = Math.min(material.roughness, 0.42);
      material.userData.wet = true;
    }
  });

  // The water: a real surface that rises, leans with the roll and slops.
  const waterGeometry = new PlaneGeometry(H.right - H.left - 0.008, H.far - H.near - 0.008, 14, 8);
  const waterMap = rippleTexture().clone();
  waterMap.repeat.set(1.6, 0.8);
  waterMap.offset = rippleTexture().offset;
  waterMap.needsUpdate = true;
  const water = new Mesh(waterGeometry, new MeshStandardMaterial({ color: 0x8aa6ac, map: waterMap, roughness: 0.28, metalness: 0.2, transparent: true, opacity: 0.96 }));
  water.name = 'HoldWater';
  water.pointerEvents = 'none';
  set.add(water);
  const waterRest = Float32Array.from(waterGeometry.getAttribute('position').array);
  // Foam where the water meets the wood, all round: the line that is seen climbing.
  const froth = new MeshBasicMaterial({ color: 0xcfe0e2, transparent: true, opacity: 0.55, depthWrite: false });
  const wide = H.right - H.left - 0.008;
  const deep = H.far - H.near - 0.008;
  for (const [x, y, w, h] of [[0, deep / 2 - 0.008, wide, 0.016], [0, -deep / 2 + 0.008, wide, 0.016], [wide / 2 - 0.008, 0, 0.016, deep], [-wide / 2 + 0.008, 0, 0.016, deep]] as const) {
    const edge = new Mesh(new PlaneGeometry(w, h), froth);
    edge.position.set(x, y, 0.004);
    edge.pointerEvents = 'none';
    water.add(edge);
  }

  // The sliding cover over the left half, on two runners, with a cleat and a rope's loop to shove it by.
  const cover = new Group();
  cover.name = 'HatchCover';
  // The ship's own hatch grating (art/v2/nesne), cut down to this hatch's left half.
  const grating = prop('hatch_cover');
  grating.position.set(0, -0.015, 0);
  grating.scale.set(COVER.wide / 0.92, 0.7, (H.far - H.near + 0.12) / 0.82);
  cover.add(grating);
  const coverMid = (H.near + H.far) / 2;
  const handle = new Group();
  handle.name = 'CoverHandle';
  handle.position.set(COVER.wide / 2 - 0.02, COVER.handle.up - brim - 0.015, coverMid - COVER.handle.ahead);
  // A becket of rope to shove it by, standing up from its edge.
  const loop = new Mesh(new TorusGeometry(0.04, 0.009, 6, 16), standard(0xcbb98a, 0.9));
  loop.rotation.y = Math.PI / 2;
  loop.position.y = 0.012;
  handle.add(loop);
  // When a sea is coming the becket is ringed: red while it comes on, green when it is time to hold the cover (the same green as a full bucket's rim).
  const coverMark = new Mesh(new TorusGeometry(0.06, 0.008, 6, 22), new MeshBasicMaterial({ color: 0xc8323a, fog: false }));
  coverMark.name = 'HoldCoverNow';
  coverMark.rotation.x = Math.PI / 2;
  coverMark.position.y = 0.03;
  coverMark.visible = false;
  handle.add(coverMark);
  let holdNow = false;
  cover.add(handle);
  cover.traverse((o) => {
    o.pointerEvents = 'none';
  });
  set.add(cover);
  for (const a of [H.near - 0.055, H.far + 0.015]) {
    slab(H.left - COVER.travel - 0.08, H.right + H.wall, brim - 0.002, brim + 0.012, a, a + 0.04, wood);
    slab(H.left - COVER.travel - 0.08, H.left - COVER.travel - 0.04, -EYE_UP - 0.02, brim, a, a + 0.04, wood);
  }
  // The wash port in the bulwark the sea shoots in through, and the sprung plank in the hatch's far wall (stage 2 on).
  const port = P(-0.2, -0.36, 0.9);
  const portBlack = standard(0x050607, 1);
  slab(-0.36, -0.04, -0.42, -0.3, 0.9, 0.93, portBlack);
  const crack = box(0.2, 0.42, brim - 0.035, brim - 0.02, H.far - 0.008, H.far - 0.002, standard(0x030303, 1));
  crack.rotation.z = 0.09;
  crack.visible = false;

  // Light: two lanterns on iron hooks (the near one lights the hatch and the hands), and the bell beside it.
  // (The lanterns' plain brackets and the step lamps' plain feet have irons of their own, so the real set can take their place.)
  const postIron = standard(0x1a1714, 0.6, 0.6);
  const lampIron = standard(0x1a1714, 0.6, 0.6);
  const post = (right: number, ahead: number, foot: number, top: number, reach: number, metal: Material): void => {
    slab(right - 0.01, right + 0.01, foot, top, ahead - 0.01, ahead + 0.01, metal);
    slab(Math.min(right, right + reach), Math.max(right, right + reach), top - 0.012, top + 0.008, ahead - 0.01, ahead + 0.01, metal);
  };
  post(H.left - 0.02, H.far + 0.025, brim, 0.2, 0.16, postIron);
  const bellIron = standard(0x1a1714, 0.6, 0.6);
  const hookRope = standard(0xcbb98a, 0.9);
  post(H.right + 0.02, H.far + 0.025, brim, 0.1, -0.12, bellIron);
  post(1.0, 0.93, -0.3, 0.5, -0.16, postIron);
  const lanterns = [buildLantern(1.6), buildLantern(2.4)];
  lanterns[0].pivot.position.copy(P(H.left + 0.14, 0.19, H.far + 0.025));
  lanterns[1].pivot.position.copy(P(0.84, 0.49, 0.93));
  const bell = buildBell();
  bell.position.copy(P(H.right - 0.1, 0.09, H.far + 0.025));
  set.add(lanterns[0].pivot, lanterns[1].pivot, bell);
  const bellBrass = bell.getObjectByName('BellBrass') as Mesh;
  // Three small lamps along the hatch's far edge: one is lit for each squall weathered.
  const steps = [-0.16, 0, 0.16].map((right) => {
    slab(right - 0.012, right + 0.012, brim, brim + 0.03, H.far + 0.015, H.far + 0.039, lampIron);
    const lamp = new Mesh(new SphereGeometry(0.024, 14, 10), new MeshBasicMaterial({ color: 0x4a3d24, fog: false }));
    lamp.name = 'StepLamp';
    lamp.position.copy(P(right, brim + 0.055, H.far + 0.027));
    lamp.pointerEvents = 'none';
    set.add(lamp);
    return lamp;
  });
  // (With the real set each step lamp is the set's own oil lamp, and it is its glass that is lit.)
  const stepGlass: MeshStandardMaterial[] = [];
  const lightStep = (n: number): void => {
    for (let k = 0; k < steps.length; k += 1) (steps[k].material as MeshBasicMaterial).color.setHex(k < n ? 0xffc777 : 0x4a3d24);
    for (let k = 0; k < stepGlass.length; k += 1) {
      stepGlass[k].emissiveIntensity = k < n ? 2.4 : 0.03;
      stepGlass[k].color.setHex(k < n ? 0xffffff : 0x3a3328);
    }
  };
  // What all this is for: the word's feather, tied by the bell from the first moment, in its own small light.
  const feather = new Group();
  feather.name = 'WordFeather';
  // Stood up to be seen from the seat (on the wing a feather lies flat), and bright enough for a dark deck.
  const plume = featherMesh(FEATHER.bailOut, 0.24, 0.06);
  plume.rotation.set(0, 0, 0);
  const plumage = plume.material as MeshStandardMaterial;
  plumage.emissive.setHex(FEATHER.bailOut);
  plumage.emissiveIntensity = 0.7;
  feather.add(plume);
  feather.traverse((o) => {
    o.pointerEvents = 'none';
  });
  set.add(feather);
  slab(H.right + 0.01, H.right + 0.03, 0.1, 0.33, H.far + 0.015, H.far + 0.035, bellIron);
  slab(H.right - 0.04, H.right + 0.03, 0.318, 0.332, H.far + 0.015, H.far + 0.035, bellIron);
  slab(H.right - 0.032, H.right - 0.028, 0.262, 0.32, H.far + 0.023, H.far + 0.027, hookRope);
  const featherHome = P(H.right - 0.03, 0.262, H.far + 0.025);
  const glow = makeGlow(d.world, FEATHER.bailOut, 0.022);
  // (Seen only as the feather joins the wing.)
  glow.visible = false;
  d.stage.own('ship', glow);

  // The float gauge, at the eye's own height: a board on a post by the hatch, red at the top and brass at the bottom, and a pointer on a rod that rides the water.
  slab(GAUGE.right - 0.012, GAUGE.right + 0.012, brim, brim + 0.08 + GAUGE.tall, H.far + 0.05, H.far + 0.07, iron);
  const boardMap = boardTexture();
  const gaugeBoard = new Mesh(new PlaneGeometry(GAUGE.wide, GAUGE.tall), new MeshStandardMaterial({ map: boardMap, emissiveMap: boardMap, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.75 }));
  gaugeBoard.name = 'FloatGauge';
  gaugeBoard.position.copy(P(GAUGE.right, brim + 0.08 + GAUGE.tall / 2, H.far + 0.045));
  gaugeBoard.pointerEvents = 'none';
  set.add(gaugeBoard);
  const pointer = new Mesh(new ConeGeometry(0.03, 0.08, 4), new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.6, emissive: 0xffc24a, emissiveIntensity: 0.35 }));
  pointer.name = 'GaugePointer';
  pointer.rotation.z = Math.PI / 2;
  pointer.pointerEvents = 'none';
  const rod = new Mesh(new CylinderGeometry(0.005, 0.005, 1, 5), standard(0x8a7a5a, 0.6, 0.4));
  rod.pointerEvents = 'none';
  set.add(pointer, rod);
  let needle: Object3D = pointer;
  let needleAt = GAUGE.right + GAUGE.wide / 2 + 0.05;
  // Shown: one physical gauge read at a glance, at the eye's own height (the real board and needle when the hatch set is there).
  const GAUGE_SHOWN = true;
  gaugeBoard.visible = GAUGE_SHOWN;
  pointer.visible = GAUGE_SHOWN;
  rod.visible = GAUGE_SHOWN;
  const gaugeFoot = brim + 0.08 + GAUGE.tall * GAUGE.brass;
  const gaugeRun = GAUGE.tall * (1 - GAUGE.red - GAUGE.brass);

  // How it is done, shown without a word: a pale ghost of the bucket plunges, lifts and heaves over the rail, again and again, until the player has done it; and a pale ring slides along the cover's way shut.
  const ghost = new Group();
  ghost.name = 'GhostBucket';
  const pale = new MeshBasicMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.4, depthWrite: false, side: DoubleSide, fog: false });
  const ghostSide = new Mesh(new CylinderGeometry(0.078, 0.062, 0.17, 14, 1, true), pale);
  ghostSide.position.y = 0.085;
  const ghostBail = new Mesh(new TorusGeometry(0.076, 0.006, 5, 14, Math.PI), pale);
  ghostBail.position.y = 0.165;
  ghost.add(ghostSide, ghostBail);
  const ghostRing = new Mesh(new TorusGeometry(0.045, 0.008, 6, 18), pale);
  ghostRing.name = 'GhostShove';
  for (const o of [ghost, ghostRing]) {
    o.visible = false;
    o.traverse((c) => {
      c.pointerEvents = 'none';
    });
    set.add(o);
  }

  // The storm itself: cloud all round, a running sea, rain on the wind, and a sheet of water over the deck when a sea comes aboard.
  const cloud = new Mesh(new SphereGeometry(420, 32, 16), new MeshBasicMaterial({ map: cloudTexture(), side: BackSide, fog: false, depthWrite: false }));
  cloud.name = 'StormCloud';
  cloud.renderOrder = -0.5;
  cloud.pointerEvents = 'none';
  set.add(cloud);
  const moon = new Mesh(new SphereGeometry(11, 20, 14), new MeshBasicMaterial({ color: 0xe9eef2, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  moon.name = 'Moon';
  moon.position.copy(P(-120, 150, 330));
  moon.pointerEvents = 'none';
  cloud.add(moon);
  let cleared = 0;
  // The sea itself (the stage's own still one is put away while this one runs).
  const root = d.stage.root('ship');
  root?.getObjectByName('StormSea')?.removeFromParent();
  const ocean = buildSea(eye);
  if (root != null) root.add(ocean.mesh);
  if (sea != null) sea.visible = false;
  let seaState = 0.4;
  // Rain on the water in the hatch: rings that open and are gone.
  const RINGS = 14;
  const rainRings = new InstancedMesh(new RingGeometry(0.8, 1, 18), new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }), RINGS);
  rainRings.name = 'RainRings';
  rainRings.frustumCulled = false;
  rainRings.pointerEvents = 'none';
  const ringAt = new Float32Array(RINGS * 4);
  const ringM = new Matrix4();
  const ringP = new Vector3();
  const ringS = new Vector3();
  const ringQ = new Quaternion();
  const ringC = new Color();
  for (let k = 0; k < RINGS; k += 1) {
    ringAt[k * 4 + 2] = Math.random();
    ringAt[k * 4 + 3] = 0.3 + Math.random() * 0.3;
    rainRings.setColorAt(k, ringC.setScalar(0));
    rainRings.setMatrixAt(k, ringM.makeScale(0, 0, 0));
  }
  water.add(rainRings);
  const rain = new InstancedMesh(new BoxGeometry(0.004, 0.55, 0.004), new MeshBasicMaterial({ color: 0xb9c8d4, transparent: true, opacity: 0.42, depthWrite: false }), RAIN.count);
  rain.name = 'DrivenRain';
  rain.frustumCulled = false;
  rain.pointerEvents = 'none';
  set.add(rain);
  const rainAt = new Float32Array(RAIN.count * 3);
  for (let k = 0; k < RAIN.count; k += 1) {
    rainAt[k * 3] = -4 + Math.random() * 8;
    rainAt[k * 3 + 1] = -1.5 + Math.random() * 5;
    rainAt[k * 3 + 2] = -1.5 + Math.random() * 7.5;
  }
  // Each streak lies along the way it falls (in the set's frame, ahead is -z).
  const rainWay = new Vector3(RAIN.fall.x, RAIN.fall.y, -RAIN.fall.z);
  const rainTurn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), rainWay.clone().normalize().negate());
  const rainM = new Matrix4();
  const rainP = new Vector3();
  const one = new Vector3(1, 1, 1);
  // The city's own rain falls straight: here it leans the same way.
  const cityRain = d.world.scene.getObjectByName('Rain');
  if (cityRain != null) cityRain.rotation.x = 0.35;
  const washMap = rippleTexture().clone();
  washMap.repeat.set(3, 1.5);
  washMap.offset = rippleTexture().offset;
  washMap.needsUpdate = true;
  const wash = new Mesh(new PlaneGeometry(5, 2.2), new MeshStandardMaterial({ color: 0xb9d2d8, map: washMap, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0, depthWrite: false }));
  wash.name = 'DeckWash';
  wash.rotation.x = -Math.PI / 2;
  wash.position.copy(P(0, brim + 0.02, 0.45));
  wash.visible = false;
  wash.pointerEvents = 'none';
  set.add(wash);

  // Green water: a wave that rises beyond the rail and breaks over it (stage 3).
  const wave = new Group();
  wave.name = 'GreenWater';
  const swell = new Mesh(new CylinderGeometry(3.2, 3.2, 40, 26, 1, true), new MeshStandardMaterial({ color: 0x1b4a4e, roughness: 0.12, metalness: 0.4, side: DoubleSide, emissive: 0x0a2226, emissiveIntensity: 0.6 }));
  swell.rotation.z = Math.PI / 2;
  const crest = new Mesh(new CylinderGeometry(0.28, 0.28, 40, 8), new MeshBasicMaterial({ color: 0xe6f2f3, transparent: true, opacity: 0.9, fog: false }));
  crest.rotation.z = Math.PI / 2;
  crest.position.set(0, 3.1, 0.6);
  wave.add(swell, crest);
  wave.traverse((o) => {
    o.pointerEvents = 'none';
  });
  wave.visible = false;
  set.add(wave);
  // Spray in the face as it breaks: a pale card just ahead of the eye, gone in half a second.
  const veil = new Mesh(new PlaneGeometry(1.2, 1.2), new MeshBasicMaterial({ color: 0xd9e8ec, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  veil.name = 'SprayVeil';
  veil.renderOrder = 9300;
  veil.position.set(0, 0, -0.3);
  veil.visible = false;
  veil.pointerEvents = 'none';
  d.player.head.add(veil);

  // The bucket (the ship's own, small enough for one hand), afloat in the hatch until it is taken, and the water in it.
  const bucket = new Group();
  bucket.name = 'BailBucket';
  const bucketNode = d.stage.node('ship', 'bucket');
  if (bucketNode != null) {
    bucketNode.removeFromParent();
    bucketNode.position.set(0, 0, 0);
    bucketNode.scale.setScalar(0.44);
    bucket.add(bucketNode);
  }
  const bucketWater = new Mesh(new CylinderGeometry(0.066, 0.066, 0.004, 14), new MeshStandardMaterial({ color: 0x4f7f88, roughness: 0.2, metalness: 0.2, emissive: 0x0e2a30, emissiveIntensity: 0.8 }));
  bucketWater.visible = false;
  const grip = new Group();
  grip.name = 'BucketGrip';
  grip.position.y = SHIP.bottom;
  // The rim's ring: the bucket's own gauge (red empty, amber filling, green full).
  const fillRing = new Mesh(new TorusGeometry(0.088, 0.007, 6, 24), new MeshBasicMaterial({ color: 0xc8323a, fog: false }));
  fillRing.name = 'BucketFull';
  fillRing.rotation.x = Math.PI / 2;
  fillRing.position.y = SHIP.bottom - SHIP.rim;
  fillRing.visible = false;
  bucket.add(bucketWater, grip, fillRing);
  bucket.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(bucket, { persistent: true });
  d.stage.own('ship', bucket);
  const spray = new Droplets();
  d.world.createTransformEntity(spray.mesh, { persistent: true });
  d.stage.own('ship', spray.mesh);
  // Where the rings show the moves in the rehearsal: the water to plunge in, and the air to heave through.
  const dipMark = new Group();
  dipMark.name = 'BailDip';
  const heaveMark = new Group();
  heaveMark.name = 'BailHeave';
  heaveMark.position.copy(P(LANE.right, -0.1, LANE.ahead + 0.08));
  set.add(dipMark, heaveMark);

  bake();
  // The real hatch set takes the place of the plain timbers, part for part, where it loaded whole; the lights, the water and the way things move stay as they are.
  if (kit != null) {
    const part = (name: string): Object3D | null => kit?.getObjectByName(name) ?? null;
    const realCoaming = part('coaming');
    const realCover = part('cover');
    const realRunners = part('runners');
    const realGauge = part('gauge');
    const realNeedle = part('gauge_pointer');
    const realBell = part('bell');
    const realLantern = part('lantern');
    if (realCoaming != null && realCover != null && realRunners != null && realGauge != null && realNeedle != null && realBell != null && realLantern != null) {
      try {
      kit.traverse((o) => {
        o.pointerEvents = 'none';
      });
      // The coaming, its paint (red line, brass mark, notches) and the runners.
      for (const mesh of timbers) if (mesh.material === wood || mesh.material === dark || mesh.material === red) mesh.visible = false;
      gauge.visible = false;
      plate.visible = false;
      // The cover rides this game's own cover, which slides.
      grating.visible = false;
      loop.visible = false;
      realCover.removeFromParent();
      realCover.position.set(0, 0, 0);
      cover.add(realCover);
      // The float gauge: its board where the plain one stood, its needle moved by the water.
      gaugeBoard.visible = false;
      pointer.visible = false;
      realNeedle.removeFromParent();
      realGauge.position.copy(gaugeBoard.position);
      realGauge.visible = GAUGE_SHOWN;
      realNeedle.visible = GAUGE_SHOWN;
      needle = realNeedle;
      needleAt = GAUGE.right + GAUGE.wide / 2 + 0.01;
      // The bell and the lanterns hang from this game's own pivots, which swing.
      bellBrass.visible = false;
      realBell.removeFromParent();
      realBell.position.set(0, 0, 0);
      bell.add(realBell);
      realLantern.removeFromParent();
      for (const lantern of lanterns) {
        for (const child of lantern.pivot.children) if ((child as Mesh).isMesh === true) child.visible = false;
        lantern.glass.visible = false;
        // (Its own place on the set's post is left behind: it hangs from this pivot.)
        const hung = realLantern.clone(true);
        hung.position.set(0, 0, 0);
        lantern.pivot.add(hung);
      }
      // The bell's post with the feather's hook on it, and the wash port in the bulwark: the set's own where it has them (they stand where the plain ones stood).
      if (part('bell_post') != null && part('feather_hook') != null) {
        for (const mesh of timbers) if (mesh.material === bellIron || mesh.material === hookRope) mesh.visible = false;
        bell.position.y = 0.07;
      }
      if (part('wash_port') != null) for (const mesh of timbers) if (mesh.material === portBlack) mesh.visible = false;
      // The lanterns' brackets: the set's own, one on the coaming's far left corner (mirrored, its arm reaching inboard), one on the rail to the right; each lantern hangs from its arm's end.
      const realPost = part('lantern_post');
      if (realPost != null) {
        for (const mesh of timbers) if (mesh.material === postIron) mesh.visible = false;
        const second = realPost.clone(true);
        realPost.removeFromParent();
        realPost.scale.x = -1;
        realPost.position.copy(P(H.left - 0.06, brim, H.far + 0.025));
        lanterns[0].pivot.position.copy(P(H.left + 0.14, brim + 0.51, H.far + 0.025));
        second.position.copy(P(1.04, -0.12, 0.93));
        lanterns[1].pivot.position.copy(P(0.84, 0.39, 0.93));
        set.add(realPost, second);
      }
      // The three step lamps: the set's own oil lamp, three times; lit by its glass.
      const realLamp = part('step_lamp');
      if (realLamp != null) {
        for (const mesh of timbers) if (mesh.material === lampIron) mesh.visible = false;
        realLamp.removeFromParent();
        steps.forEach((plain, k) => {
          const lamp = realLamp.clone(true);
          lamp.position.copy(plain.position);
          lamp.position.y = brim;
          lamp.traverse((o) => {
            const glass = (o as Mesh).material as MeshStandardMaterial | undefined;
            if (glass != null && !Array.isArray(glass) && glass.name === 'ambar_lantern_glass') {
              stepGlass[k] = glass.clone();
              (o as Mesh).material = stepGlass[k];
            }
          });
          plain.visible = false;
          set.add(lamp);
        });
        lightStep(0);
      }
      set.add(kit, realNeedle);
      if (import.meta.env.DEV) console.info('[ship] the hatch set is the real one');
      } catch (error) {
        // Anything amiss with the set: back to the plain timbers, whole.
        console.warn('[ship] the hatch set could not be dressed', error);
        kit.removeFromParent();
        realNeedle.removeFromParent();
        realCover.removeFromParent();
        for (const mesh of timbers) mesh.visible = true;
        for (const plain of [gauge, plate, grating, loop, gaugeBoard, pointer, bellBrass]) plain.visible = true;
        needle = pointer;
        needleAt = GAUGE.right + GAUGE.wide / 2 + 0.05;
      }
    } else if (import.meta.env.DEV) console.warn('[ship] ambar.glb is missing a part: the plain timbers stand in');
  }

  // The wheel (the middle stage): she sits at it on a sea chest, facing the bow; beyond it the binnacle, whose dial shows where the sea comes from.
  const helmEye = new Vector3(eye.x, eye.y - EYE_UP + HELM_SEAT.up, eye.z - HELM_SEAT.inboard);
  const helmSeat = new Seat(helmEye, HELM_SEAT.yaw);
  const helmSet = new Group();
  helmSet.name = 'ShipHelm';
  helmSet.position.copy(helmEye);
  helmSet.rotation.y = HELM_SEAT.yaw;
  helmSet.visible = false;
  helmSeat.frame = helmSet;
  const upAxis = new Vector3(0, 1, 0);
  const helmYawTurn = new Quaternion().setFromAxisAngle(upAxis, HELM_SEAT.yaw);
  d.world.createTransformEntity(helmSet, { parent: rootEntity, persistent: true });
  d.stage.own('ship', helmSet);
  const helmBox = (r0: number, r1: number, u0: number, u1: number, a0: number, a1: number, material: Material): Mesh => {
    const mesh = new Mesh(new BoxGeometry(r1 - r0, u1 - u0, a1 - a0), material);
    mesh.position.copy(P((r0 + r1) / 2, (u0 + u1) / 2, (a0 + a1) / 2));
    mesh.pointerEvents = 'none';
    helmSet.add(mesh);
    return mesh;
  };
  const wheel = new Group();
  wheel.name = 'HelmWheel';
  wheel.position.copy(P(0, -WHEEL.down, WHEEL.ahead));
  helmSet.add(wheel);
  // A plain wheel: rim, eight spokes with their handles, a brass hub, and a brass ring on the king spoke (the one that is up when the rudder is amidships).
  const wheelRim = new Mesh(new TorusGeometry(WHEEL.rim, 0.017, 8, 40), wood);
  const spokeLong = WHEEL.handle - 0.03;
  const wheelSpokes = new InstancedMesh(new CylinderGeometry(0.011, 0.015, spokeLong, 8), wood, 8);
  {
    const m = new Matrix4();
    const q = new Quaternion();
    const zAxis = new Vector3(0, 0, 1);
    const at = new Vector3();
    for (let k = 0; k < 8; k += 1) {
      q.setFromAxisAngle(zAxis, (k * Math.PI) / 4);
      at.set(0, 0.03 + spokeLong / 2, 0).applyQuaternion(q);
      wheelSpokes.setMatrixAt(k, m.compose(at, q, new Vector3(1, 1, 1)));
    }
  }
  const wheelHub = new Mesh(new CylinderGeometry(0.045, 0.045, 0.06, 16), brass);
  wheelHub.rotation.x = Math.PI / 2;
  const wheelKing = new Mesh(new TorusGeometry(0.02, 0.006, 6, 14), brass);
  wheelKing.rotation.x = Math.PI / 2;
  wheelKing.position.y = WHEEL.rim + 0.022;
  const wheelParts: Object3D[] = [wheelRim, wheelSpokes, wheelHub, wheelKing];
  wheel.add(...wheelParts);
  const pedestal = helmBox(-0.06, 0.06, -HELM_SEAT.up, -WHEEL.down + 0.03, WHEEL.ahead + 0.035, WHEEL.ahead + 0.15, dark);
  const dialPost = helmBox(-0.02, 0.02, -HELM_SEAT.up, -DIAL.down - 0.03, DIAL.ahead + 0.03, DIAL.ahead + 0.07, dark);
  helmBox(-0.24, 0.24, -HELM_SEAT.up, -0.66, -0.46, -0.04, dark).name = 'SeaChest';
  const dial = new Group();
  dial.name = 'HelmDial';
  dial.position.copy(P(0, -DIAL.down, DIAL.ahead));
  dial.rotation.x = DIAL.lean;
  helmSet.add(dial);
  const dialFace = new Mesh(new CircleGeometry(DIAL.wide, 40), new MeshBasicMaterial({ map: dialTexture(), fog: false }));
  const dialBezel = new Mesh(new TorusGeometry(DIAL.wide, 0.007, 8, 40), brass);
  // The arc at the top that counts as the bow (made afresh when a stage is eased), and the bead: where the sea comes from, red wide of the bow, green on it.
  const arcMaterial = new MeshBasicMaterial({ color: 0x35d07f, transparent: true, opacity: 0.8, fog: false, depthWrite: false });
  const arcOf = (safe: number): RingGeometry => new RingGeometry(DIAL.wide * 0.62, DIAL.wide * 0.9, 24, 1, Math.PI / 2 - safe, safe * 2);
  const dialArc = new Mesh(arcOf(HELM.safe), arcMaterial);
  dialArc.position.z = 0.002;
  const beadMaterial = new MeshBasicMaterial({ color: 0xc8323a, fog: false });
  const bead = new Mesh(new SphereGeometry(0.012, 14, 10), beadMaterial);
  bead.name = 'SeaBead';
  // Three lamps under the dial: one goes out for each sea that comes aboard.
  const helmLamps: MeshBasicMaterial[] = [];
  for (let k = 0; k < HELM.lives; k += 1) {
    const material = new MeshBasicMaterial({ color: 0xffc777, fog: false });
    const lamp = new Mesh(new SphereGeometry(0.011, 12, 8), material);
    // (Over the dial: under it they are behind the wheel's king spoke.)
    lamp.position.set((k - (HELM.lives - 1) / 2) * 0.04, DIAL.wide + 0.028, 0.004);
    dial.add(lamp);
    helmLamps.push(material);
  }
  dial.add(dialFace, dialBezel, dialArc, bead);
  // The binnacle's own lamp: in the storm's dark it is what the wheel and her hands are seen by.
  const helmLamp = new PointLight(0xffc777, 1.4, 3.2, 2);
  helmLamp.position.copy(P(0.12, -DIAL.down + 0.1, DIAL.ahead - 0.1));
  helmSet.add(helmLamp);
  // Where the two hands take the wheel (ten and two): marked in the rehearsal.
  const wheelGrips: Object3D[] = [];
  for (const side of [-1, 1]) {
    const grip = new Group();
    grip.name = side < 0 ? 'WheelGrip left' : 'WheelGrip right';
    grip.position.copy(P(side * 0.25, -0.3, WHEEL.ahead));
    helmSet.add(grip);
    wheelGrips.push(grip);
  }
  if (helmKit != null) {
    const realWheel = helmKit.getObjectByName('wheel');
    const realPedestal = helmKit.getObjectByName('pedestal');
    const realBinnacle = helmKit.getObjectByName('binnacle');
    if (realWheel != null) {
      for (const plain of wheelParts) plain.visible = false;
      realWheel.position.set(0, 0, 0);
      realWheel.rotation.set(0, 0, 0);
      // The set's wheel is held on a 0.27 m circle.
      realWheel.scale.setScalar(WHEEL.rim / 0.27);
      wheel.add(realWheel);
    }
    if (realPedestal != null) {
      pedestal.visible = false;
      realPedestal.position.copy(wheel.position);
      realPedestal.rotation.set(0, 0, 0);
      helmSet.add(realPedestal);
    }
    if (realBinnacle != null) {
      dialPost.visible = false;
      realBinnacle.position.copy(dial.position);
      // Its bowl opens upward: leaned back with the dial, so the bowl is round the face she reads.
      realBinnacle.rotation.set(Math.PI / 2 + DIAL.lean, 0, 0);
      helmSet.add(realBinnacle);
    }
  }
  helmSet.traverse((o) => {
    o.pointerEvents = 'none';
  });
  /** Whether she is at the wheel now (else at the hatch), and the point the ship rolls about: her eye, wherever she sits. */
  let atHelm = false;
  const pivot = eye.clone();

  // Her own body, seen when she looks down: kneeling at the coaming, sleeves to her real hands.
  const wool = knitTexture(SAILOR.suit);
  const body = new PerformerBody(SAILOR);
  body.root.traverse((o) => {
    o.pointerEvents = 'none';
    // A sailor's jersey is knitted wool: the performer's sequins come off.
    const cloth = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (cloth != null && !Array.isArray(cloth) && cloth.map != null) {
      cloth.map = wool;
      cloth.color.setHex(0xffffff);
      cloth.roughness = 0.95;
      cloth.metalness = 0;
      cloth.needsUpdate = true;
    }
  });
  d.world.createTransformEntity(body.root, { persistent: true });
  d.stage.own('ship', body.root);
  const neck = new Vector3();
  const hips = new Vector3();
  const limb = new Vector3();
  const kneeWay = new Vector3();
  const pose = (): void => {
    const here = atHelm ? helmSeat : seat;
    d.player.head.getWorldPosition(neck);
    neck.y -= 0.17;
    // The neck sits a hand's breadth behind the eye: nearer, and the chest fills the view.
    neck.addScaledVector(here.ahead, -0.1);
    // At the hatch: hips back over her heels, knees on the step against the coaming. At the wheel: sitting on the chest, feet on the deck ahead.
    hips.copy(neck).addScaledVector(here.ahead, atHelm ? -0.1 : -0.14);
    hips.y -= atHelm ? 0.5 : 0.45;
    body.spine(neck, hips, here.ahead);
    for (const side of ['left', 'right'] as const) {
      const out = side === 'left' ? -0.11 : 0.11;
      if (atHelm) {
        here.at(out * 1.2, -HELM_SEAT.up + 0.04, 0.3, limb);
        body.leg(side, limb, here.turn(0, 0.5, 1, kneeWay));
      } else {
        seat.at(out, -EYE_UP + 0.04, -0.52, limb);
        body.leg(side, limb, seat.turn(0, -0.25, 1, kneeWay));
      }
      // The sleeve ends at the drawn hand's own wrist joint, so arm and hand meet (with no hand model, at the grip).
      d.player.gripSpaces[side].getWorldPosition(limb);
      const joint = wristJoint(limb);
      body.arm(side, joint == null ? limb : joint.localToWorld(limb.set(0, 0, 0.025)));
    }
  };

  const bail: BailSet = {
    rules: SHIP,
    tag: 'ship',
    seat,
    bucket,
    bucketWater,
    grip,
    fillMarks: [fillRing],
    lid: { right: COVER.handle.right, up: COVER.handle.up, ahead: COVER.handle.ahead, travel: COVER.travel },
    // Over the opening, and not over the cover.
    overWater: (right, ahead, lid) => right > H.left + COVER.wide - COVER.travel * lid + 0.02 && right < H.right - 0.02 && ahead > H.near + 0.02 && ahead < H.far - 0.02,
    // The water piles toward the side she rolls to: high at the hatch's far edge as the rail goes down.
    tide: (_right, ahead) => tideAt(play.stage, phase, (ahead - (H.near + H.far) / 2) / ((H.far - H.near) / 2)),
    // Heaved as the rail goes down, the water has less to climb.
    lean: () => phase,
    spray,
    // Over the rail: up and ahead; a weak heave falls short, on the deck.
    fling: (share, out) => seat.turn((Math.random() - 0.5) * 0.3, 1.6 + 1.3 * share, 1.1 + 2.4 * share, out),
    sound: (what, strength) => {
      if (what === 'take') d.sounds.play('grab_soft', 0.6);
      else if (what === 'plunge') d.sounds.play('bucket_splash', 0.25 + 0.3 * strength, 1.5);
      else if (what === 'throw') {
        d.sounds.play('swing_whoosh', 0.5);
        d.sounds.play('bucket_splash', 0.3 + 0.4 * strength, 0.85, 0.55);
      } else if (what === 'slop') d.sounds.play('water_pour', 0.6);
      else if (what === 'lid') d.sounds.play('rope_creak', 0.45);
      else if (what === 'full') d.sounds.play('ear_click', 0.6);
      else d.sounds.play('catch_slap', 0.7, 0.8);
    },
  };
  const play = new BailPlay(d, bail);
  const minis = d.world.getSystem(MiniGameSystem);
  const paused = (): boolean => minis?.playPaused ?? false;

  // --- what is drawn every frame, whether a stage is being played or not
  // Felt in the body: as the water nears the line the view closes in from its edges; a sea that comes aboard throws the ship over for a moment.
  const vignette = new Vignette(d.player.head);
  let lurch = 0;
  let clock = 0;
  let roll = 0;
  /** Where she is in her roll: 1 with the starboard rail right down, -1 with it right up. */
  let phase = 0;
  let demo = 0;
  let demoOn = false;
  let shoveOn = false;
  let washed = 0;
  let amp = (ROLL[0] * Math.PI) / 180;
  let ampWant = amp;
  let shown = play.hold.level;
  let coverShown = play.hold.lid;
  let storm = 0.3;
  let sprung = false;
  let jet = 0;
  let leak = 0;
  let flash = 0;
  let nextFlash = 5;
  let creaked = 0;
  let ring = 0;
  let glint = 0;
  let lamps = 1;
  let lampsWant = 1;
  let weather: Weather = STORM;
  let breaking = 0;
  let playing = false;
  let flown = false;
  let verdict: 'won' | 'lost' | null = null;
  const v = new Vector3();
  const w = new Vector3();
  const position = waterGeometry.getAttribute('position');
  const motion = (): number => (lessMotion() ? 0.35 : 1);

  // Steering: the rules' state, the wheel as the hands have turned it, and the big seas as they are drawn.
  let steerStage: HelmStage = HELM.rehearsal;
  let steer: Helm = newHelm(HELM.rehearsal);
  let steerEased = 1;
  let steering = false;
  let helmVerdict: 'won' | 'lost' | null = null;
  const helmStep: HelmStep = { struck: false, rode: false, won: false, lost: false };
  /** The wheel's turn (radians; clockwise as she sees it is starboard helm). */
  let wheelTurn = 0;
  let sinceSea = 99;
  let pitchKick = 0;
  let helmLog = 0;
  let onBow = false;
  let wheelCreak = 0;
  let seaWarned = false;
  const helmHands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  const onWheel = { left: new Vector3(), right: new Vector3() };
  const held = { left: false, right: false };
  const heldFrom = { left: 0, right: 0 };
  const wheelFrom = { left: 0, right: 0 };
  const combers: Comber[] = [
    { at: 0, high: 0 },
    { at: 0, high: 0 },
  ];
  const beam = new Vector3(0, 0, 1);
  const pitchTurn = new Quaternion();
  const drift = new Quaternion();
  /** A sea has met her at the wheel: ridden, her bow climbs it and spray flies; taken wide, she is thrown over and a lamp goes out. */
  const met = (rode: boolean): void => {
    sinceSea = 0;
    const face = veil.material as MeshBasicMaterial;
    veil.visible = true;
    if (rode) {
      pitchKick = 1;
      face.opacity = 0.2;
      d.sounds.play('bucket_splash', 0.7, 0.6);
      d.sounds.play('ship_creak', 0.5, 1.1);
      goal({ where: WHERE, now: STEER, steps: [steer.ridden, steerStage.seas] });
      // Her bow goes into it: white water thrown up ahead, blown back along the deck.
      for (let k = 0; k < 5; k += 1) spray.emit(helmSeat.at(-1.2 + k * 0.6, 0.1, 7.5, v), helmSeat.turn(0, 5, -3.5, w), 1.6, 20, 0.035, 1.5, 0.4);
    } else {
      pitchKick = 0.4;
      // Thrown over, away from the sea.
      lurch = -0.11 * Math.sign(steer.off || 1);
      face.opacity = 0.7;
      d.sounds.play('bucket_splash', 1, 0.5);
      d.sounds.play('wind_gust', 0.8, 0.8);
      d.sounds.play('sandbag_drop', 0.8, 0.8, 0.1);
      // It comes in over the side it struck, across her.
      const from = Math.sign(steer.off || 1);
      for (let k = 0; k < 5; k += 1) spray.emit(helmSeat.at(from * 1.7, 0.2, 0.2 + k * 0.5, v), helmSeat.turn(-from * 4.5, 1.6, 0, w), 1.2, 24, 0.012, 1, 0.3);
    }
    if (import.meta.env.DEV) console.info(`[ship] sea ${rode ? 'ridden' : 'aboard'} at ${((steer.off * 180) / Math.PI).toFixed(0)} degrees: ${steer.ridden} ridden, ${steer.shipped} aboard`);
  };
  /** One frame at the wheel: the hands turn it, the rules answer. */
  const steerFrame = (delta: number): void => {
    readHands(d, helmHands);
    let both = true;
    let any = false;
    for (const side of ['left', 'right'] as const) {
      const at = helmSeat.local(helmHands[side], onWheel[side]);
      const up = at.y + WHEEL.down;
      const far = Math.hypot(at.x, up);
      // A closed hand on or near the wheel has it.
      const holds = helmHands.pinching[side] && Math.abs(at.z - WHEEL.ahead) < 0.22 && far > 0.1 && far < 0.48;
      if (holds && !held[side]) {
        heldFrom[side] = Math.atan2(at.x, up);
        wheelFrom[side] = wheelTurn;
      }
      held[side] = holds;
      both = both && holds;
      any = any || holds;
    }
    // Both hands: the wheel lies as the line between them does. One hand: it turns as far as that hand has gone round the hub. None: it runs back amidships.
    let want = 0;
    if (both) want = Math.atan2(onWheel.left.y - onWheel.right.y, Math.max(0.05, onWheel.right.x - onWheel.left.x));
    else if (any) {
      const side = held.left ? 'left' : 'right';
      const gone = Math.atan2(onWheel[side].x, onWheel[side].y + WHEEL.down) - heldFrom[side];
      want = wheelFrom[side] + Math.atan2(Math.sin(gone), Math.cos(gone));
    }
    want = Math.max(-WHEEL.most, Math.min(WHEEL.most, want));
    const before = wheelTurn;
    wheelTurn += (want - wheelTurn) * Math.min(1, delta * (any ? 20 : 3));
    // The tiller ropes complain when the wheel is put over hard.
    wheelCreak -= delta;
    if (wheelCreak <= 0 && delta > 0 && Math.abs(wheelTurn - before) / delta > 0.7) {
      d.sounds.play('rope_creak', 0.3, 0.9 + Math.random() * 0.3);
      wheelCreak = 1.1;
    }
    if (!steering || paused()) return;
    stepHelm(HELM, steerStage, steer, helmOf(HELM, wheelTurn), delta, steerEased, helmStep);
    // A big sea is heard before it is on her.
    const near = steerStage.rehearsal == null && steer.seaIn <= HELM.warning;
    if (near && !seaWarned) d.sounds.play('wind_gust', 0.5, 1.1);
    seaWarned = near;
    if (helmStep.struck) met(helmStep.rode);
    if (helmStep.won) helmVerdict = 'won';
    else if (helmStep.lost) helmVerdict = 'lost';
    if (helmVerdict != null) steering = false;
    helmLog -= delta;
    if (import.meta.env.DEV && helmLog <= 0) {
      helmLog = 0.25;
      console.info(`[ship] helm off ${((steer.off * 180) / Math.PI).toFixed(1)} turn ${((steer.turn * 180) / Math.PI).toFixed(1)} wheel ${((wheelTurn * 180) / Math.PI).toFixed(1)} sea ${Number.isFinite(steer.seaIn) ? steer.seaIn.toFixed(1) : '-'} ridden ${steer.ridden} aboard ${steer.shipped} hands ${held.left ? 'L' : '-'}${held.right ? 'R' : '-'}`);
    }
  };

  const draw = (delta: number): void => {
    clock += delta;
    pose();
    // The roll: the sea leans and heaves, the lanterns and the bell swing on their hooks, the water in the hatch leans with them.
    amp += (ampWant - amp) * Math.min(1, delta * 0.7);
    const before = roll;
    phase = 0.75 * Math.sin(clock * 0.9) + 0.25 * Math.sin(clock * 0.37 + 1.3);
    lurch *= Math.exp(-delta * 2.2);
    roll = amp * motion() * phase + lurch * motion();
    // The ship rolls under her, about the point where her eye is (starboard, ahead of her, down as `roll` grows); the sea only heaves.
    rollTurn.setFromAxisAngle(fore, roll);
    // At the wheel she pitches too: her bow lifts to a sea and comes down after it.
    sinceSea += delta;
    const pitch = atHelm ? motion() * (0.018 * Math.sin(clock * 0.8 + 0.6) * (amp / 0.1) + 0.11 * pitchKick * Math.sin(2.6 * sinceSea) * Math.exp(-1.4 * sinceSea)) : 0;
    rollTurn.multiply(pitchTurn.setFromAxisAngle(beam, pitch));
    if (hull != null) {
      hull.quaternion.copy(rollTurn);
      hull.position.copy(pivot).sub(v.copy(pivot).applyQuaternion(rollTurn));
      hull.updateMatrixWorld(true);
    }
    // The hatch and the wheel are the deck's: they turn with it about the same point.
    set.quaternion.copy(rollTurn).multiply(yawTurn);
    set.position.copy(pivot).add(v.copy(eye).sub(pivot).applyQuaternion(rollTurn));
    set.updateMatrixWorld(true);
    helmSet.quaternion.copy(rollTurn).multiply(helmYawTurn);
    helmSet.position.copy(pivot).add(v.copy(helmEye).sub(pivot).applyQuaternion(rollTurn));
    helmSet.updateMatrixWorld(true);
    // The sea runs as high as the storm; she rides most of each swell, so the water about her stays near her waterline while the hills beyond stand over the rail.
    seaState += (0.25 + 0.75 * storm - seaState) * Math.min(1, delta * 0.4);
    const running = seaState * (lessMotion() ? 0.5 : 1);
    // At the wheel the sea lies where the rules say it comes from: as she turns her bow, sea and sky swing round her. A big sea marches in at the beat, and runs on astern once it has met her.
    const seaTurn = atHelm ? Math.PI / 2 - steer.off : 0;
    ocean.mesh.rotation.y = seaTurn;
    const seaComing = atHelm && steering && steerStage.rehearsal == null;
    combers[0].at = seaComing ? Math.max(0, steer.seaIn) * SEAS.speed : 0;
    combers[0].high = seaComing ? SEAS.high * Math.min(1, Math.max(0, (steer.clock - HELM.grace) / 1.5)) : 0;
    combers[1].at = -sinceSea * SEAS.speed;
    combers[1].high = atHelm ? SEAS.high * Math.max(0, 1 - sinceSea / 2.5) : 0;
    ocean.update(clock, running, delta, combers);
    ocean.mesh.position.y = -0.1 - SEA.heave * ocean.heightAt(clock, running, combers);
    // The cloud stays level with the horizon, drifts, and turns with the sea.
    cloud.quaternion.copy(set.quaternion).invert().multiply(drift.setFromAxisAngle(upAxis, Math.PI + clock * 0.004 + seaTurn));
    if (atHelm) {
      wheel.rotation.z = -wheelTurn;
      bead.position.set(DIAL.bead * Math.sin(steer.off), DIAL.bead * Math.cos(steer.off), 0.01);
      const bow = Math.abs(steer.off) <= safeArc(HELM, steerEased);
      beadMaterial.color.setHex(bow ? 0x35d07f : 0xc8323a);
      if (bow && !onBow && steering) d.sounds.play('ear_click', 0.4);
      onBow = bow;
      // In a sea's last seconds the bead beats.
      bead.scale.setScalar(seaComing && steer.seaIn <= HELM.warning ? 1.3 + 0.35 * Math.sin(clock * 14) : 1);
      for (let k = 0; k < helmLamps.length; k += 1) helmLamps[k].color.setHex(k < HELM.lives - steer.shipped ? 0xffc777 : 0x2a2218);
    }
    // Lightning whitens the cloud for an instant; once the storm is over it thins and the moon is out.
    const struck = flash > 0.24 || (flash > 0.06 && flash < 0.16);
    (cloud.material as MeshBasicMaterial).color.setScalar(struck ? 2.6 : 0.8 + 0.9 * cleared);
    (ocean.mesh.material as MeshBasicMaterial).color.setScalar(struck ? 1.9 : 1 + 2.4 * cleared);
    (moon.material as MeshBasicMaterial).opacity = 0.9 * cleared;
    moon.visible = cleared > 0.01;
    for (let k = 0; k < RINGS; k += 1) {
      ringAt[k * 4 + 2] += delta / ringAt[k * 4 + 3];
      if (ringAt[k * 4 + 2] >= 1) {
        ringAt[k * 4] = (Math.random() - 0.5) * (wide - 0.1);
        ringAt[k * 4 + 1] = (Math.random() - 0.5) * (deep - 0.1);
        ringAt[k * 4 + 2] = 0;
        ringAt[k * 4 + 3] = 0.3 + Math.random() * 0.3;
      }
      const age = ringAt[k * 4 + 2];
      const size = 0.005 + 0.028 * age;
      rainRings.setMatrixAt(k, ringM.compose(ringP.set(ringAt[k * 4], ringAt[k * 4 + 1], 0.004), ringQ, ringS.set(size, size, 1)));
      rainRings.setColorAt(k, ringC.setScalar(0.2 * (1 - age) ** 2));
    }
    rainRings.instanceMatrix.needsUpdate = true;
    if (rainRings.instanceColor != null) rainRings.instanceColor.needsUpdate = true;
    rainRings.visible = storm > 0.2;
    driftRipples(delta);
    for (let k = 0; k < RAIN.count; k += 1) {
      rainAt[k * 3] += rainWay.x * delta;
      rainAt[k * 3 + 1] += rainWay.y * delta;
      rainAt[k * 3 + 2] += rainWay.z * delta;
      if (rainAt[k * 3 + 1] < -1.6) {
        rainAt[k * 3] = -4.5 + Math.random() * 8;
        rainAt[k * 3 + 1] = 3.2 + Math.random() * 0.6;
        rainAt[k * 3 + 2] = -5.5 + Math.random() * 7.5;
      }
      rainM.compose(rainP.set(rainAt[k * 3], rainAt[k * 3 + 1], rainAt[k * 3 + 2]), rainTurn, one);
      rain.setMatrixAt(k, rainM);
    }
    rain.instanceMatrix.needsUpdate = true;
    rain.visible = storm > 0.2;
    lanterns[0].pivot.rotation.x = roll * 1.6 + 0.03 * Math.sin(clock * 3.1);
    lanterns[1].pivot.rotation.x = roll * 1.6 + 0.04 * Math.sin(clock * 2.6 + 1);
    bell.rotation.x = roll * 1.2 + ring * 0.5 * Math.sin(clock * 22);
    ring = Math.max(0, ring - delta * 1.2);
    if (!flown) {
      feather.position.copy(featherHome);
      // Facing the seat, hung by its quill, turning a little in the wind.
      feather.rotation.set(0, yaw + Math.PI + 0.35 * Math.sin(clock * 1.3), Math.PI / 2 + 0.2 * Math.sin(clock * 2.2) + roll);
      feather.getWorldPosition(glow.position);
      glow.scale.setScalar(1 + 0.25 * Math.sin(clock * 3));
    }
    // The timbers groan as she comes to the end of each roll.
    creaked -= delta;
    if (creaked <= 0 && Math.abs(roll) > amp * motion() * 0.82 && Math.abs(roll) > Math.abs(before) && amp > 0.07) {
      d.sounds.play('ship_creak', 0.35 + storm * 0.3, 0.9 + Math.random() * 0.2);
      creaked = 4;
    }
    lamps += (lampsWant - lamps) * Math.min(1, delta * 4);
    lanterns[0].lamp.intensity = 1.6 * lamps * (0.9 + 0.1 * Math.sin(clock * 13));
    lanterns[1].lamp.intensity = 2.4 * lamps * (0.9 + 0.1 * Math.sin(clock * 11 + 2));
    if (needle === pointer) for (const l of lanterns) l.glass.visible = lamps > 0.1;

    // The water in the hatch.
    shown += (play.hold.level - shown) * Math.min(1, delta * 9);
    const height = Math.min(brim + 0.012, surface(SHIP, shown));
    water.position.copy(Q((H.left + H.right) / 2, height, (H.near + H.far) / 2));
    // It leans as far as the rules say it stands at the far edge.
    water.rotation.x = -Math.PI / 2 + Math.atan2(tideAt(play.stage, phase, 1), (H.far - H.near) / 2);
    // The float rides it, and the pointer with the float.
    const mark = gaugeFoot + gaugeRun * Math.min(1.15, Math.max(-0.1, shown));
    needle.position.copy(Q(needleAt, mark, H.far + 0.045));
    rod.scale.y = Math.max(0.05, mark - height);
    rod.position.copy(Q(GAUGE.right + GAUGE.wide / 2 + 0.085, (mark + height) / 2, H.far + 0.045));
    (pointer.material as MeshStandardMaterial).emissive.setHex(shown > 0.7 && Math.sin(clock * 9) > 0 ? 0xff3a2a : 0xffc24a);
    const chop = 0.004 + 0.006 * storm;
    for (let i = 0; i < position.count; i += 1) {
      const x = waterRest[i * 3];
      const y = waterRest[i * 3 + 1];
      position.setZ(i, chop * (Math.sin(x * 14 + clock * 5.2) + Math.sin(y * 19 - clock * 4.1 + x * 6)));
    }
    position.needsUpdate = true;
    dipMark.position.copy(Q(LANE.right, height + 0.03, LANE.ahead));
    if (play.taken == null) {
      // The bucket bobs in the hatch.
      seat.at(LANE.right, height - 0.06 + 0.01 * Math.sin(clock * 2.3), LANE.ahead, bucket.position);
      bucket.rotation.set(0.08 * Math.sin(clock * 1.7), 0, 0.06 * Math.sin(clock * 2.1));
    }
    // The ghost bucket's lesson: down into the water, a moment under, up, and over the rail (3.2 s, round and round).
    ghost.visible = demoOn;
    if (demoOn) {
      demo = (demo + delta) % 3.2;
      const lane = 0.1;
      const deep = height - 0.2;
      let up = brim + 0.02;
      let ahead = LANE.ahead;
      let tip = 0;
      if (demo < 0.7) up += (deep - up) * (demo / 0.7);
      else if (demo < 1.2) up = deep;
      else if (demo < 1.5) up = deep + (brim + 0.02 - deep) * ((demo - 1.2) / 0.3);
      else {
        const k = Math.min(1, (demo - 1.5) / 0.25);
        up = brim + 0.02 + 0.22 * k;
        ahead = LANE.ahead + 0.2 * k;
        tip = 1.2 * k;
        if (demo - delta < 1.75 && demo >= 1.75) spray.emit(seat.at(lane, up + 0.17, ahead, v), seat.turn(0, 2.4, 3.2, w), 0.3, 10, 0.018, 1.2, 0.03);
      }
      ghost.position.copy(Q(lane, up, ahead));
      ghost.rotation.set(-tip, 0, 0);
      pale.opacity = demo > 2.3 ? 0.4 * Math.max(0, 1 - (demo - 2.3) / 0.5) : 0.4;
    }
    ghostRing.visible = shoveOn && play.hold.lid > 0.05;
    if (ghostRing.visible) {
      const k = (clock % 1.4) / 1.4;
      ghostRing.position.copy(Q(COVER.handle.right - COVER.travel * coverShown * (1 - k), COVER.handle.up + 0.03, COVER.handle.ahead));
    }
    // A sea that came aboard runs off the deck.
    if (washed > 0) {
      washed -= delta;
      wash.visible = true;
      (wash.material as MeshStandardMaterial).opacity = 0.55 * Math.max(0, washed / 2.2);
      wash.position.z += delta * 0.5;
      if (washed <= 0) wash.visible = false;
    }
    // Near the line the red burns brighter and a heart is heard.
    const danger = Math.max(0, (shown - 0.7) / 0.3);
    red.emissiveIntensity = 0.55 + danger * (0.9 + 0.5 * Math.sin(clock * 9));
    vignette.set(playing && play.stage.rehearsal == null ? 1 - 0.38 * danger : 1);
    vignette.update(delta);
    d.sounds.bed('heartbeat_loop', playing && play.stage.rehearsal == null ? Math.min(0.9, danger) : 0);
    brass.emissiveIntensity = glint;
    (bellBrass.material as MeshStandardMaterial).emissiveIntensity = glint * 0.6;
    glint = Math.max(0, glint - delta * 0.5);

    // The cover on its runners.
    coverShown += (play.hold.lid - coverShown) * Math.min(1, delta * 14);
    cover.position.copy(Q(H.left + COVER.wide / 2 - COVER.travel * coverShown, brim + 0.015, coverMid));
    // The sea through the wash port, in gulps as the rail dips: onto the cover while it is shut, into the hold where it is open.
    jet += delta * 34 * storm * (0.45 + 0.55 * Math.max(0, phase));
    while (jet >= 1) {
      jet -= 1;
      const right = -0.34 + Math.random() * 0.3;
      const covered = right < H.left + COVER.wide - COVER.travel * coverShown;
      v.copy(port).setX(right).applyMatrix4(set.matrixWorld);
      spray.emit(v, seat.turn(0, 1.2, -1.3, w), 0.12, 1, 0.008, covered ? 0.21 : 0.42, 0.01);
      // What lands on the cover leaps off it.
      if (covered && Math.random() < 0.4) spray.emit(seat.at(right, brim + 0.05, 0.62, v), seat.turn(0, 0.7, -0.5, w), 0.5, 1, 0.005, 0.3, 0.02);
    }
    d.sounds.bed('pump_water_loop', playing ? 0.12 + 0.5 * coverShown * storm : 0);
    // The sprung plank spouts.
    if (sprung) {
      leak += delta * 30;
      while (leak >= 1) {
        leak -= 1;
        spray.emit(seat.at(0.31, brim - 0.03, H.far - 0.01, v), seat.turn(-0.05, 0.25, -0.9, w), 0.1, 1, 0.012, 0.36, 0.008);
      }
    }
    // Green water: seen coming over the warning, breaking as it hits.
    const stage = play.stage;
    const coming = playing && stage.waveEvery > 0 && play.hold.waveIn <= stage.waveWarning;
    const now = coming && play.hold.waveIn <= BRACE_WINDOW;
    coverMark.visible = coming;
    (coverMark.material as MeshBasicMaterial).color.setHex(now ? 0x35d07f : 0xc8323a);
    if (now && !holdNow) d.sounds.play('ear_click', 0.6);
    holdNow = now;
    if (playing && stage.waveEvery > 0 && play.hold.waveIn <= stage.waveWarning) {
      const k = 1 - play.hold.waveIn / stage.waveWarning;
      wave.visible = true;
      // Its crest climbs from under the horizon to a metre over the eye as it comes on.
      wave.position.copy(Q(0, -5.4 + 3.2 * k, 16 - 12.8 * k));
    } else if (breaking > 0) {
      breaking -= delta;
      const k = 1 - Math.max(0, breaking) / 0.5;
      wave.position.copy(Q(0, -2.2 - 3 * k, 3.2 - 1.4 * k));
      if (breaking <= 0) wave.visible = false;
    } else wave.visible = false;
    const fog = veil.material as MeshBasicMaterial;
    fog.opacity = Math.max(0, fog.opacity - delta * 0.7);
    veil.visible = fog.opacity > 0.01;

    // Lightning, and its thunder a moment after.
    nextFlash -= delta;
    if (nextFlash <= 0 && storm > 0.35) {
      nextFlash = (5 + Math.random() * 7) / storm;
      flash = 0.34;
      d.sounds.play('thunder', 0.45 + 0.35 * storm, 0.9 + Math.random() * 0.2, 0.5 + Math.random() * 0.6);
    }
    if (flash > 0) {
      flash -= delta;
      const on = flash > 0.24 || (flash > 0.06 && flash < 0.16);
      d.stage.setWeather(on ? FLASH : weather);
      // Lightning is the one moment the whole deck is seen.
      dimSun(d, { share: on ? NIGHT.flash : NIGHT.storm + (NIGHT.after - NIGHT.storm) * cleared });
    } else if (cleared > 0 && cleared < 1) dimSun(d, { share: NIGHT.storm + (NIGHT.after - NIGHT.storm) * cleared });
    spray.floor = eye.y + H.floor;
    spray.update(delta);
  };

  // A wave has broken over the rail: spray everywhere, the cover (if nobody held it) flung open.
  const broke = (): void => {
    breaking = 0.5;
    d.sounds.play('bucket_splash', 1, 0.5);
    d.sounds.play('wind_gust', 0.8, 0.8);
    for (let k = 0; k < 6; k += 1) spray.emit(seat.at(-1.5 + k * 0.6, 0.25, 1.05, v), seat.turn(0, 0.8, -3.1, w), 1.1, 22, 0.03, 0.95, 0.25);
    (veil.material as MeshBasicMaterial).opacity = 0.34;
    lurch = 0.075;
    washed = 2.2;
    wash.position.copy(P(0, brim + 0.02, 0.45));
    if (play.hold.lid >= 1 && play.lidHand == null) d.sounds.play('sandbag_drop', 0.8, 0.9, 0.1);
  };

  const frames = d.each((delta) => {
    if (playing && !paused()) {
      play.frame(delta);
      if (play.step.hit > 0) broke();
      if (play.step.won) verdict = 'won';
      else if (play.step.lost) verdict = 'lost';
      if (verdict != null) playing = false;
    } else if (!atHelm) play.carry(delta);
    if (atHelm) steerFrame(delta);
    draw(delta);
  });

  // Dev: a skip ends the game. The director forgets its skips whenever a wait ends, so each wait is armed afresh.
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  const run = async (stage: BailStage, eased: number): Promise<'won' | 'lost'> => {
    play.begin(stage, eased);
    shown = play.hold.level;
    verdict = null;
    playing = true;
    arm();
    await d.until(() => verdict != null || skipped);
    playing = false;
    return skipped ? 'won' : (verdict ?? 'won');
  };
  /** To the wheel, or back to the hatch: only ever while the view is black. She is moved first and turned a moment after, so the two are never one sweep. */
  const toHelm = async (on: boolean): Promise<void> => {
    atHelm = on;
    helmSet.visible = on;
    pivot.copy(on ? helmEye : eye);
    d.rig.place(on ? helmEye : eye, on ? yaw : HELM_SEAT.yaw);
    arm();
    await d.wait(0.06);
    d.rig.place(on ? helmEye : eye, on ? HELM_SEAT.yaw : yaw);
    setDeskMode(on ? 'pole' : 'bail');
    // (The emulator's view looks a little down, at the dial and the hands; a headset's wearer does that herself.)
    setDeskLook(on ? -0.3 : -0.4);
    bucket.visible = !on;
    wheelTurn = 0;
    sinceSea = 99;
    pitchKick = 0;
    lurch = 0;
  };
  /** The wheel's stage: a short rehearsal the first time, then the seas. Ends back at the hatch when won; lost, she is left at the wheel for the next try. */
  const helmStage = async (losses: number): Promise<'won' | 'lost'> => {
    steerEased = easeHelm(HELM, losses);
    dialArc.geometry.dispose();
    dialArc.geometry = arcOf(safeArc(HELM, steerEased));
    steerStage = HELM.rehearsal;
    steer = newHelm(HELM.rehearsal);
    if (!atHelm) {
      arm();
      await d.rig.fadeTo(1);
      await toHelm(true);
      goal({ where: WHERE, now: 'Take the wheel: turn it toward the red dot until the dot is green.', steps: [1, 3] });
      void d.captions.show('Captain: Take the wheel! Meet the seas head on!', helmSeat.at(0.55, 0.3, 1.6), 0);
      arm();
      await d.rig.fadeTo(0);
    }
    if (losses === 0 && !skipped) {
      // The rehearsal: nothing can be lost; bring the bead to the top once.
      helmVerdict = null;
      steering = true;
      setV2Targets(wheelGrips);
      arm();
      await d.until(() => helmVerdict != null || skipped);
      setV2Targets([]);
      if (import.meta.env.DEV) console.info('[ship] helm rehearsal done');
      if (!skipped) d.sounds.play('ship_bell', 0.5, 1.2);
    }
    if (!skipped) {
      const from = steer.off;
      steerStage = HELM.stage;
      steer = newHelm(HELM.stage, 3 + losses * 11);
      // The seas begin from where she lies now.
      if (losses === 0) steer.off = from;
      goal({ where: WHERE, now: STEER, steps: [0, steerStage.seas] });
      helmVerdict = null;
      steering = true;
      arm();
      await d.until(() => helmVerdict != null || skipped);
    }
    steering = false;
    const result = skipped ? 'won' : (helmVerdict ?? 'won');
    if (result === 'won') {
      arm();
      await d.wait(skipped ? 0.1 : 1.4);
      arm();
      await d.rig.fadeTo(1);
      await toHelm(false);
      arm();
      await d.rig.fadeTo(0);
    }
    return result;
  };
  const storms = (n: number): void => {
    ampWant = (ROLL[n] * Math.PI) / 180;
    storm = [0.3, 0.6, 0.8, 1][n];
    d.sounds.bed('waves_loop', 0.3 + 0.17 * n);
    d.sounds.bed('wind_loop', 0.2 + 0.17 * n);
  };
  const rings = (): void => {
    bell.rotation.x = 0;
    ring = 1;
    glint = 1;
    d.sounds.play('ship_bell', 0.8);
  };

  setDeskMode('bail');
  // (The emulator's view looks down at the hatch; a headset's wearer does that herself.)
  setDeskLook(-0.4);
  storms(0);
  // The first two seconds say what this is for.
  goal({ where: WHERE, now: 'Plunge the bucket: at green, heave it overboard.' });
  void d.captions.show('Captain: Three squalls coming. Keep the water under the red line, and the word is yours.', seat.at(0.45, 0.25, 1.1), 0);

  // The rehearsal, before the squall: the water does not climb. Take the bucket, plunge it, heave it over the rail; shove the cover shut. No clock.
  play.begin(SHIP.rehearsal, 1);
  shown = play.hold.level;
  playing = true;
  // (One frame first, so the bucket is where it floats before it is rung.)
  draw(0);
  setV2Targets([grip]);
  demoOn = true;
  const guide = d.each(() => {
    if (play.taken == null) return;
    const cover = play.hold.thrown >= 0.5 && !play.hold.shutOnce;
    goal({ where: WHERE, now: cover ? 'Shove the hatch cover shut.' : 'Plunge the bucket: at green, heave it overboard.' });
    setV2Targets([cover ? handle : play.bucket.fill < 0.5 ? dipMark : heaveMark]);
    demoOn = !cover && play.hold.thrown < 1;
    shoveOn = cover;
  });
  // (Dev: a skip still on its way from the scene before is not this game's.)
  const began = d.now;
  // Dev: `?stage=helm` goes straight to the wheel.
  const devHelm = import.meta.env.DEV && new URLSearchParams(location.search).get('stage') === 'helm';
  if (devHelm) verdict = 'won';
  while (verdict == null && !skipped) {
    arm();
    await d.until(() => verdict != null || skipped);
    if (skipped && d.now - began < 6) skipped = false;
  }
  guide();
  demoOn = false;
  shoveOn = false;
  playing = false;
  setV2Targets([]);
  if (import.meta.env.DEV) console.info('[ship] rehearsal done');
  if (!skipped) {
    rings();
    arm();
    await d.wait(1.6);
  }

  // The squall comes down, and the captain's order with it: the word.
  flash = 0.34;
  d.sounds.play('thunder', 0.8, 1, 0.3);
  d.sounds.play('wind_gust', 0.8);
  void d.captions.say('S13-1', seat.at(0.5, 0.2, 1.1), 0);
  // Three stages: the squall at the hatch, the wheel, and green water at the hatch again.
  const game = playMiniGame(new MiniGame(WORDS.bailOut, SHIP.stages.map((s, k) => ({ name: k === 1 ? HELM.stage.name : s.name }))));
  while (game.phase !== 'won' && !skipped) {
    arm();
    await d.until(() => game.phase === 'playing' || game.phase === 'won' || skipped);
    if (game.phase !== 'playing' || skipped) break;
    const n = game.stage;
    const losses = game.failuresOf(n);
    // From the second squall on there are seas to hold the cover against: the task says so, in the mark's own colour.
    if (devHelm && n === 0) {
      // Dev: straight to the wheel.
      lightStep(1);
      game.win();
      continue;
    }
    if (n !== 1) goal({ where: WHERE, now: n === 0 ? EARN : HOLD, steps: [n, 3] });
    storms(n + 1);
    if (n >= 2 && !sprung) {
      // A plank springs in the hatch's wall.
      sprung = true;
      crack.visible = true;
      d.sounds.play('sandbag_drop', 0.9, 0.7);
      d.sounds.play('ship_creak', 0.8, 0.7);
    }
    if (import.meta.env.DEV) console.info(`[ship] stage ${n + 1} (${n === 1 ? HELM.stage.name : SHIP.stages[n].name}) begins, losses ${losses}, eased ${n === 1 ? easeHelm(HELM, losses) : ease(SHIP, losses)}`);
    // From the second loss of a stage on, the rings come back: the water, and the cover's handle once it has slid.
    const hint =
      n !== 1 && losses >= HINT_AFTER
        ? d.each(() => {
            setV2Targets(play.hold.lid > 0.5 ? [handle] : [play.bucket.fill < 0.5 ? dipMark : heaveMark]);
            demoOn = play.hold.lid <= 0.5;
            shoveOn = play.hold.lid > 0.5;
          })
        : (): boolean => false;
    const result = n === 1 ? await helmStage(losses) : await run(SHIP.stages[n], ease(SHIP, losses));
    hint();
    demoOn = false;
    shoveOn = false;
    setV2Targets([]);
    if (skipped) break;
    if (import.meta.env.DEV) console.info(n === 1 ? `[ship] stage 2 ${result} after ${steer.clock.toFixed(1)} s, ${steer.ridden} seas ridden, ${steer.shipped} aboard` : `[ship] stage ${n + 1} ${result} after ${play.hold.clock.toFixed(1)} s, ${play.hold.thrown.toFixed(1)} buckets over the side`);
    if (result === 'won') {
      // Down to the brass: the bell, a cheer from the crew, and a lull before the next blow.
      rings();
      lightStep(n + 1);
      goal({ where: WHERE, now: EARN, steps: [n + 1, 3] });
      d.sounds.play('cheer', 0.35, 1, 0.3);
      ampWant *= 0.6;
      game.win();
    } else if (n === 1) {
      // Three seas aboard: the lamps drown, she broaches. Then the wheel again (she is still at it).
      lampsWant = 0;
      d.sounds.play('bank_creak', 1, 0.8);
      d.sounds.play('ship_creak', 1, 0.6);
      arm();
      await d.wait(0.9);
      arm();
      await d.rig.fadeTo(1);
      steerStage = HELM.rehearsal;
      steer = newHelm(HELM.rehearsal);
      steer.off = 0;
      lampsWant = 1;
      lurch = 0;
      d.day.darkWindows += 1;
      game.lose('three seas came aboard');
      arm();
      await d.rig.fadeTo(0);
    } else {
      // Over the red line: the water comes up through the hatch, the lanterns drown, she founders. Then the stage again.
      shown = 1;
      play.hold.level = 1.3;
      lampsWant = 0;
      d.sounds.play('bank_creak', 1, 0.8);
      d.sounds.play('ship_creak', 1, 0.6);
      d.sounds.play('bucket_splash', 0.9, 0.6, 0.2);
      arm();
      await d.wait(0.9);
      arm();
      await d.rig.fadeTo(1);
      play.begin(SHIP.stages[n], 1);
      shown = play.hold.level;
      lampsWant = 1;
      // A squall lost costs the city a window (counted when the bird is back).
      d.day.darkWindows += 1;
      game.lose('the water reached the red line');
      arm();
      await d.rig.fadeTo(0);
    }
  }
  endMiniGame(game);
  setV2Targets([]);
  // (A dev skip can leave her at the wheel.)
  if (atHelm) await toHelm(false);
  steering = false;
  setDeskMode('one');
  setDeskLook(0);
  if (import.meta.env.DEV) console.info('[ship] done');

  // The storm blows over: the sea lies down, the rain stops, the sky lifts.
  ampWant = (ROLL_AFTER * Math.PI) / 180;
  storm = 0.15;
  sprung = false;
  d.rain.on = false;
  d.sounds.bed('heartbeat_loop', 0);
  d.sounds.bed('waves_loop', 0.3);
  d.sounds.bed('wind_loop', 0.1);
  const start = d.now;
  arm();
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 2.5);
    d.stage.blendWeather(STORM, AFTER, k);
    cleared = k;
    return k >= 1 || skipped;
  });
  weather = AFTER;

  // The word, said aloud, and its feather: it leaves the bell and comes to the wing, where the bird's own feathers are (the wing shows only as the feather reaches it).
  lightStep(3);
  goal({ where: WHERE, now: 'Take the word BAIL OUT home on your wing.', steps: [3, 3] });
  play.hold.level = -0.25;
  void d.captions.show('Captain: Bailed out! The word is yours.', seat.at(0.45, 0.25, 1.1), 0);
  flown = true;
  const from = featherHome.clone();
  // The wing sits low on the left, a little ahead of the eye (parrot-system.ts); in the set's own places, as the feather is.
  const to = P(-0.02, -0.25, 0.34);
  const took = lessMotion() ? 0.01 : 1.5;
  const flight = d.now;
  d.sounds.play('wing_flap', 0.4);
  arm();
  await d.until(() => {
    const k = Math.min(1, (d.now - flight) / took);
    const e = k * k * (3 - 2 * k);
    feather.position.lerpVectors(from, to, e);
    feather.position.y += 0.22 * Math.sin(Math.PI * e);
    feather.rotation.set(0, yaw + Math.PI + e * Math.PI * 4, (Math.PI / 2) * (1 - e) + 0.3 * Math.sin(e * 9));
    feather.getWorldPosition(glow.position);
    if (k > 0.7) stowWing(false);
    return k >= 1 || skipped;
  });
  stowWing(false);
  feather.visible = false;
  glow.visible = true;
  parrotWords.learn(WORDS.bailOut, FEATHER.bailOut);
  d.sounds.play('feather_rustle', 0.7);
  if (import.meta.env.DEV) console.info('[ship] the feather is on the wing');
  // The glow opens round the place it joined and fades.
  const joined = d.now;
  const halo = glow.material as MeshBasicMaterial;
  arm();
  await d.until(() => {
    const k = Math.min(1, (d.now - joined) / 0.9);
    set.localToWorld(glow.position.copy(to));
    glow.scale.setScalar(1 + 3 * k);
    halo.opacity = 0.7 * (1 - k);
    return k >= 1 || skipped;
  });
  glow.visible = false;
  arm();
  await d.wait(1.2);

  // Back in the city the word is to be given.
  goal({ where: 'TROUBLE 3 OF 6 · THE SINKING BANK', now: 'Give Gray the word: carry the feather to his ear.' });
  frames();
  vignette.dispose();
  // The ship is left on an even keel.
  if (hull != null) {
    hull.quaternion.identity();
    hull.position.set(0, 0, 0);
  }
  set.quaternion.copy(yawTurn);
  set.position.copy(eye);
  helmSet.visible = false;
  ocean.mesh.rotation.y = 0;
  if (cityRain != null) cityRain.rotation.x = 0;
  veil.removeFromParent();
  d.stage.setWeather(WEATHER.storm);
  dimSun(d, null);
  d.sounds.bed('pump_water_loop', 0);
  d.sounds.bed('waves_loop', 0);
  d.sounds.bed('wind_loop', 0);
}
