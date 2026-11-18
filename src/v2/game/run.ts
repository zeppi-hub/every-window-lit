import { AdditiveBlending, type AnimationAction, AnimationClip, AnimationMixer, BufferAttribute, Color, Quaternion, Texture, CanvasTexture, CylinderGeometry, DoubleSide, type Entity, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, OneHandGrabbable, PlaneGeometry, RepeatWrapping, SRGBColorSpace, TextureLoader, TorusGeometry, Vector3, NoColorSpace } from '@iwsdk/core';
import { PathHandle, PathKindEnum } from '../components.js';
import { setDeskMode } from '../desk-hands.js';
import { setListener, stowWing } from '../parrot-system.js';
import { setGoal, setWindows } from '../goal.js';
import { placeGoal } from '../goal-system.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { createPolicyCard, drawPolicyCard, POLICY_CARD_SIZE } from '../policy-card.js';
import { broken, type Collapse, cracked, holds, mercyFor, type Net, netTarget, patientFor, RUN, stepNet, warnOf } from '../run-rules.js';
import { setV2Targets } from '../step-targets.js';
import { type Hands, readHands, Vignette, wristOf } from './circus-show.js';
import { PerformerBody } from './circus-body.js';
import { Iris } from './iris.js';
import { devParam } from '../dev-param.js';
import { crackFor, crackOf, INSIDE, ringOffset, swingFor } from '../run-inside-rules.js';
import { mergeByMaterial } from './fx.js';
import { keepersAway } from './square.js';
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
/** The panes lie along the bank-front pavement, where the queue stands (bank_queue_08 … _20): their row, set back a little so the litter bin at the kerb (x -1.8, z -15.6) stands on paving, and the ground. */
const SECTION_Z = -16.65;
const GROUND = 0.15;
/** The rope's slide in front of the eye (m, from the eye: left to right). */
const ROPE_HALF = 0.35;
const ROPE_DOWN = 0.32;
const ROPE_AHEAD = 0.42;
/** The pause between waves (s). */
const BETWEEN = 1.0;
/** How far the rope's lines sag under the net at rest (m); hauled fast they pull straight. */
const ROPE_SAG = 0.35;
/** How far back from the edge the people of a lost pane run: toward the lamp (m). */
const RUN_BACK = 4.2;
/** How many windows round the square the run puts out while it lasts. */
const RUN_DARKENS = 3;
/** At most this many windows go out for good however often the door is broken (the rest of the day still has its own costs). */
const RUN_COST_MAX = 3;
const WHERE = 'TROUBLE 1 OF 4 · THE RUN';
const UP = new Vector3(0, 1, 0);
const WHITE = new Color(1, 1, 1);
const RED = new Color(1, 0.25, 0.18);
/** A cracking pane's cracks with the net under it: green, the same 'now you are right' as in the circus. */
const GREEN = new Color(0.35, 1, 0.45);
/** The glass of a cracking pane: red while the net is away from it, green while it is under it (tints of its picture; the glass is not tone mapped, so above 1 glows). */
const PANE_RED = new Color(1.6, 0.25, 0.2);
const PANE_GREEN = new Color(0.45, 1.7, 0.55);
const paneTint = new Color();
/** The net drawn bright enough to read through the rain from the lamp, and brighter while it is under a cracking pane (it is not tone mapped, so above 1 glows). */
const NET_IDLE = new Color(1.35, 1.2, 0.75);
const NET_ON = new Color(2.4, 2.0, 1.05);

interface Section {
  index: number;
  /** The six panes' glass, cracks, holes and kept nets, drawn together. */
  panes: Panes;
  people: Person[];
  home: Vector3[];
  /** Done in an earlier fight (the rehearsal pane), so a replay leaves it as it is. */
  settled: boolean;
}

/** An open column of light standing on a pane (1.1 m across, 3 m tall), bright at the foot and fading to nothing at the top. */
function beamGeometry(): CylinderGeometry {
  const g = new CylinderGeometry(0.55, 0.55, 3, 20, 1, true);
  g.translate(0, 1.5, 0);
  const at = g.getAttribute('position');
  const colours = new Float32Array(at.count * 3);
  for (let k = 0; k < at.count; k += 1) {
    const fade = Math.pow(1 - at.getY(k) / 3, 1.6);
    colours.set([fade, fade, fade], k * 3);
  }
  g.setAttribute('color', new BufferAttribute(colours, 3));
  return g;
}

/**
 * The void under the glass, painted as a deep shaft seen from above: four
 * stone walls running down from the rim to a small, far floor, lit from the
 * square's side and darkening with depth, their courses closing up as they
 * go down. It reads as a drop under the people's feet, not a black mat.
 */
function holeTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, size, size);
    const inset = 88;
    const lo = inset;
    const hi = size - inset;
    // Each wall from the rim (its outer edge) to the floor's edge, lit by how it faces the light.
    const walls: [number[], string][] = [
      [[0, 0, size, 0, hi, lo, lo, lo], '#3a3733'],
      [[size, 0, size, size, hi, hi, hi, lo], '#2a2826'],
      [[size, size, 0, size, lo, hi, hi, hi], '#6a645c'],
      [[0, size, 0, 0, lo, lo, lo, hi], '#4a4641'],
    ];
    for (const [q, lit] of walls) {
      const grad = g.createLinearGradient((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, (q[4] + q[6]) / 2, (q[5] + q[7]) / 2);
      grad.addColorStop(0, lit);
      grad.addColorStop(1, '#030304');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(q[0], q[1]);
      g.lineTo(q[2], q[3]);
      g.lineTo(q[4], q[5]);
      g.lineTo(q[6], q[7]);
      g.closePath();
      g.fill();
    }
    // The stone courses, closer together the deeper they are.
    for (let k = 1; k < 9; k += 1) {
      const f = 1 - Math.pow(0.74, k);
      const at = f * inset;
      g.strokeStyle = `rgba(0, 0, 0, ${0.55 * (1 - f) + 0.15})`;
      g.lineWidth = Math.max(1, 3 * (1 - f));
      g.strokeRect(at, at, size - 2 * at, size - 2 * at);
    }
    // The corners where the walls meet.
    g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    g.lineWidth = 2;
    for (const [x0, y0, x1, y1] of [[0, 0, lo, lo], [size, 0, hi, lo], [size, size, hi, hi], [0, size, lo, hi]]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    // The far floor is the bank's vault: its round steel door lying below, lit by one warm lamp, bars of gold stacked in two corners.
    const floor = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, (hi - lo) * 0.7);
    floor.addColorStop(0, '#2a2418');
    floor.addColorStop(1, '#050505');
    g.fillStyle = floor;
    g.fillRect(lo, lo, hi - lo, hi - lo);
    const cx = size / 2;
    const door = g.createRadialGradient(cx - 6, cx - 6, 2, cx, cx, 27);
    door.addColorStop(0, '#8d99a6');
    door.addColorStop(0.7, '#3b4652');
    door.addColorStop(1, '#161b21');
    g.fillStyle = door;
    g.beginPath();
    g.arc(cx, cx, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#aab4bf';
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = '#1a1f25';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cx, 19, 0, Math.PI * 2);
    g.stroke();
    // The door's wheel: five spokes and a brass hub.
    g.strokeStyle = '#c9a44a';
    g.lineWidth = 2;
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(cx, cx);
      g.lineTo(cx + Math.cos(a) * 12, cx + Math.sin(a) * 12);
      g.stroke();
    }
    g.fillStyle = '#e2c063';
    g.beginPath();
    g.arc(cx, cx, 3.5, 0, Math.PI * 2);
    g.fill();
    for (const [x, y] of [[lo + 5, lo + 5], [hi - 21, hi - 13]] as const) {
      for (let r = 0; r < 3; r += 1) {
        g.fillStyle = r % 2 === 0 ? '#d6b04a' : '#a8842c';
        g.fillRect(x + r * 1.5, y + r * 3, 15 - r * 3, 2.6);
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * A net of knotted rope, drawn once (pale, so the net's own colour tints it):
 * each cord a twisted rope (a dark edge, a light core, the lay of its strands
 * across it), a knot where two cords cross.
 */
function ropeNetTexture(cells: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.clearRect(0, 0, 512, 512);
    const step = 512 / cells;
    const cord = (x0: number, y0: number, x1: number, y1: number): void => {
      g.lineCap = 'butt';
      g.strokeStyle = 'rgba(92,70,34,1)';
      g.lineWidth = 13;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = 'rgba(248,236,200,1)';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      // The lay of the strands: short slanted ticks along the cord.
      g.strokeStyle = 'rgba(150,118,60,0.9)';
      g.lineWidth = 2;
      const along = x0 === x1;
      for (let t = 3; t < 512; t += 7) {
        g.beginPath();
        if (along) {
          g.moveTo(x0 - 4, t);
          g.lineTo(x0 + 4, t + 5);
        } else {
          g.moveTo(t, y0 - 4);
          g.lineTo(t + 5, y0 + 4);
        }
        g.stroke();
      }
    };
    for (let i = 0; i <= cells; i += 1) {
      const at = Math.min(505, Math.max(7, i * step));
      cord(at, 0, at, 512);
      cord(0, at, 512, at);
    }
    // The knots.
    for (let i = 0; i <= cells; i += 1)
      for (let j = 0; j <= cells; j += 1) {
        const x = Math.min(505, Math.max(7, i * step));
        const y = Math.min(505, Math.max(7, j * step));
        g.fillStyle = 'rgba(92,70,34,1)';
        g.beginPath();
        g.arc(x, y, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(236,220,176,1)';
        g.beginPath();
        g.arc(x - 1.5, y - 1.5, 7.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,250,232,1)';
        g.beginPath();
        g.arc(x - 3.5, y - 3.5, 2.6, 0, Math.PI * 2);
        g.fill();
      }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A length of three-strand rope, drawn once (pale, tinted by the rope's own colour): the strands lie slantwise round it, each lit along its back. */
function ropeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#b89a5a';
    g.fillRect(0, 0, 64, 64);
    for (let k = -2; k < 6; k += 1) {
      const y = k * 16;
      g.strokeStyle = '#6e5424';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(64, y + 32);
      g.stroke();
      g.strokeStyle = '#fff3cf';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, y + 8);
      g.lineTo(64, y + 40);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 9);
  return texture;
}

/** A pane of thick glass seen from above: a green-blue sheet, its ground edge bright outside and deep green within (the thickness of it), a brass stud at each corner, two streaks of reflected light. */
function glassTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = 'rgba(168,214,222,0.22)';
    g.fillRect(0, 0, 256, 256);
    // The edge: seen through its own thickness it is green, and its arris catches the light.
    g.strokeStyle = 'rgba(46,120,104,0.75)';
    g.lineWidth = 16;
    g.strokeRect(10, 10, 236, 236);
    g.strokeStyle = 'rgba(235,250,255,0.95)';
    g.lineWidth = 5;
    g.strokeRect(3, 3, 250, 250);
    g.strokeStyle = 'rgba(200,240,236,0.6)';
    g.lineWidth = 2;
    g.strokeRect(19, 19, 218, 218);
    g.strokeStyle = 'rgba(255,255,255,0.26)';
    for (const [w, off] of [[26, 46], [10, 104]] as const) {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(off, 236);
      g.lineTo(off + 120, 20);
      g.stroke();
    }
    for (const [x, y] of [[26, 26], [230, 26], [26, 230], [230, 230]] as const) {
      g.fillStyle = 'rgba(70,52,20,0.95)';
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(222,184,96,1)';
      g.beginPath();
      g.arc(x - 1, y - 1, 5.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Cracks across a pane, drawn once: from three blows the glass has starred (a frosted bruise at each), long cracks run out and fork, each with its shadow in the thickness of the glass. */
function crackTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.clearRect(0, 0, 256, 256);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const centres = [
      [128, 128],
      [70, 90],
      [190, 170],
    ];
    for (const [cx, cy] of centres) {
      const bruise = g.createRadialGradient(cx, cy, 1, cx, cy, 22);
      bruise.addColorStop(0, 'rgba(255,255,255,0.85)');
      bruise.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = bruise;
      g.beginPath();
      g.arc(cx, cy, 22, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2 + cx * 0.01;
        const points: [number, number][] = [[cx, cy]];
        let x = cx;
        let y = cy;
        for (let s = 0; s < 4; s += 1) {
          x += Math.cos(a + (s % 2 === 0 ? 0.2 : -0.25)) * 26;
          y += Math.sin(a + (s % 2 === 0 ? 0.2 : -0.25)) * 26;
          points.push([x, y]);
        }
        // A fork from the second joint of every other crack.
        const fork: [number, number][] = i % 2 === 0 ? [points[2], [points[2][0] + Math.cos(a + 0.9) * 22, points[2][1] + Math.sin(a + 0.9) * 22]] : [];
        for (const [line, shift, style, wide] of [
          [points, 1.5, 'rgba(20,40,44,0.55)', 3],
          [fork, 1.5, 'rgba(20,40,44,0.55)', 2],
          [points, 0, 'rgba(255,255,255,0.97)', 2.2],
          [fork, 0, 'rgba(255,255,255,0.9)', 1.4],
        ] as const) {
          if (line.length < 2) continue;
          g.strokeStyle = style;
          g.lineWidth = wide;
          g.beginPath();
          g.moveTo(line[0][0] + shift, line[0][1] + shift);
          for (let k = 1; k < line.length; k += 1) g.lineTo(line[k][0] + shift, line[k][1] + shift);
          g.stroke();
        }
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The bank's forecourt as paving of pale veined marble, wet: four slabs to the picture, their joints dark, grey veins wandering across each. */
function marbleTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g != null) {
    let seed = 41;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    g.fillStyle = '#d6d0c4';
    g.fillRect(0, 0, size, size);
    // Clouds of warmer and cooler stone.
    for (let k = 0; k < 60; k += 1) {
      const x = random() * size;
      const y = random() * size;
      const r = 30 + random() * 70;
      const cloud = g.createRadialGradient(x, y, 2, x, y, r);
      cloud.addColorStop(0, k % 2 === 0 ? 'rgba(236,230,218,0.5)' : 'rgba(176,172,166,0.4)');
      cloud.addColorStop(1, 'rgba(210,205,196,0)');
      g.fillStyle = cloud;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Veins: long wandering grey lines, a fine dark one inside the broad pale one, drawn again a tile away so the picture repeats.
    g.lineCap = 'round';
    for (let k = 0; k < 16; k += 1) {
      let x = random() * size;
      let y = random() * size;
      let a = random() * Math.PI * 2;
      const points: [number, number][] = [[x, y]];
      for (let step = 0; step < 14; step += 1) {
        a += (random() - 0.5) * 0.9;
        x += Math.cos(a) * 26;
        y += Math.sin(a) * 26;
        points.push([x, y]);
      }
      for (const [style, wide] of [['rgba(120,118,116,0.28)', 5], ['rgba(70,70,74,0.5)', 1.3]] as const) {
        g.strokeStyle = style;
        g.lineWidth = wide;
        for (const dx of [-size, 0, size])
          for (const dy of [-size, 0, size]) {
            g.beginPath();
            g.moveTo(points[0][0] + dx, points[0][1] + dy);
            for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0] + dx, points[i][1] + dy);
            g.stroke();
          }
      }
    }
    // The joints between the slabs.
    g.strokeStyle = 'rgba(52,50,48,0.85)';
    g.lineWidth = 3;
    for (const at of [1.5, size / 2]) {
      g.beginPath();
      g.moveTo(at, 0);
      g.lineTo(at, size);
      g.moveTo(0, at);
      g.lineTo(size, at);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** The light inside the bank, seen through a door's glass: warm, brightest at the middle of the leaf, fading to its frame. */
function doorLightTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const glow = g.createRadialGradient(32, 70, 4, 32, 70, 70);
    glow.addColorStop(0, 'rgba(255,226,170,1)');
    glow.addColorStop(0.55, 'rgba(255,190,110,0.6)');
    glow.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 64, 128);
    // The glazing bars across the leaf.
    g.fillStyle = 'rgba(40,24,10,0.55)';
    for (const y of [40, 84]) g.fillRect(4, y, 56, 3);
    g.fillRect(30.5, 6, 3, 116);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * What the run is played on and in front of: the bank's forecourt paved in
 * wet marble round the panes, and the light of the banking hall in the two
 * door leaves. Two draws; both go when the run is over.
 */
function dressBankFront(d: DirectorSystem): Object3D[] {
  const made: Object3D[] = [];
  const marble = marbleTexture();
  // (About a metre to a slab.)
  marble.repeat.set(5.6, 1.25);
  const forecourt = new Mesh(new PlaneGeometry(11.2, 2.5), new MeshStandardMaterial({ map: marble, roughness: 0.22, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 }));
  forecourt.name = 'BankForecourt';
  forecourt.rotation.x = -Math.PI / 2;
  forecourt.position.set(-4.8, GROUND + 0.001, SECTION_Z - 0.35);
  forecourt.pointerEvents = 'none';
  d.world.createTransformEntity(forecourt, { persistent: true });
  made.push(forecourt);
  // The real stone (public/v2/doku/marble_01: Poly Haven's Marble 01, CC0; one picture is 1.5 m square) takes the drawn marble's place as soon as it is in; should it not come, the drawn one stays.
  const stone = new TextureLoader();
  const scan = (file: string, colour: boolean): Promise<Texture> =>
    stone.loadAsync(`./v2/doku/marble_01/${file}`).then((texture) => {
      texture.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(11.2 / 1.5, 2.5 / 1.5);
      texture.anisotropy = 8;
      return texture;
    });
  void Promise.all([scan('diff.jpg', true), scan('nor.jpg', false), scan('rough.jpg', false)])
    .then(([diff, nor, rough]) => {
      const paving = forecourt.material as MeshStandardMaterial;
      paving.map = diff;
      paving.normalMap = nor;
      paving.roughnessMap = rough;
      // Wet: half as rough as the dry stone was scanned.
      paving.roughness = 0.5;
      paving.needsUpdate = true;
      if (import.meta.env.DEV) console.info('[run] the forecourt is the scanned marble');
    })
    .catch(() => {
      if (import.meta.env.DEV) console.info('[run] the scanned marble did not load: the drawn one stays');
    });
  const doors = ['bank_door_left', 'bank_door_right'].map((name) => d.stage.node('city', name)).filter((o): o is Object3D => o != null);
  if (doors.length > 0) {
    const light = new InstancedMesh(new PlaneGeometry(1.4, 3.5), new MeshBasicMaterial({ map: doorLightTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false }), doors.length);
    light.name = 'BankDoorLight';
    light.frustumCulled = false;
    light.pointerEvents = 'none';
    const at = new Vector3();
    const turn = new Quaternion();
    const put = new Matrix4();
    doors.forEach((door, k) => {
      // Along the leaf from its hinge line (the left leaf's free edge is +x, the right's -x), a hand's breadth in front of it.
      door.localToWorld(at.set(k === 0 ? 0.75 : -0.75, 1.9, 0.1));
      door.getWorldQuaternion(turn);
      light.setMatrixAt(k, put.compose(at, turn, new Vector3(1, 1, 1)));
    });
    d.world.createTransformEntity(light, { persistent: true });
    made.push(light);
  }
  d.stage.own('city', ...made);
  return made;
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
  if (insideRun()) {
    await s07Inside(d, cast, persona, watcher);
    return;
  }
  d.chapter('S07');
  const head = d.player.head;
  // The word unwinds from his mouth into a gold rope; the boss's name over the bank.
  void d.gold.show(WORDS.safetyNet.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head, wordBadge(WORDS.safetyNet));
  await d.captions.say('S07-1', CITY.graySays, 0);

  // The pavement in front of the bank turns to glass over a drop; the crowd surges at the door, and the windows round the square go out.
  const sections = buildSections(d, cast);
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
  // The fight is on the pavement below, the panes across the whole view (the rehearsal's on the right): the task plate sits straight ahead
  // at the eye's height, over the bank's door and above the people's heads, clear of every pane and of the rope in the hands.
  placeGoal(0, 0);
  void d.gold.show(BOSSES.run.name, new Vector3(-5.2, 4.6, -20.5), 3.2, 2.6, new Vector3(0, 0.15, 0), head);

  // The gold rope in the claws, and the gold net under the glass that hangs from it.
  const netMaterial = new MeshBasicMaterial({ map: ropeNetTexture(10), transparent: true, alphaTest: 0.3, side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const net = new Mesh(new PlaneGeometry(RUN.netWidth, RUN.sectionDepth + 0.1), netMaterial);
  netMaterial.color.copy(NET_IDLE);
  net.name = 'GoldNet';
  net.rotation.x = -Math.PI / 2;
  net.position.set(netTarget(0.5), GROUND + 0.008, SECTION_Z);
  net.pointerEvents = 'none';
  d.world.createTransformEntity(net, { persistent: true });
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, emissive: 0x8a6418, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.8 });
  const grip = new Mesh(new CylinderGeometry(0.022, 0.022, 0.16, 10), gold);
  grip.name = 'GoldRopeGrip';
  grip.rotation.z = Math.PI / 2;
  // Two lines from the grip to the net's near corners, each in two lengths that sag under the net's weight and pull straight when it is hauled fast: the net plainly hangs from what the hand holds.
  // (Three-strand rope: the lay of it is drawn on.)
  const rope = new InstancedMesh(new CylinderGeometry(0.016, 0.016, 1, 8), new MeshBasicMaterial({ color: 0xffd97a, map: ropeTexture(), toneMapped: false }), 4);
  rope.name = 'GoldRope';
  rope.frustumCulled = false;
  rope.pointerEvents = 'none';
  d.world.createTransformEntity(rope, { persistent: true });
  const lines = [rope];
  const a = LAMP_EYE.clone().add(new Vector3(-ROPE_HALF, -ROPE_DOWN, -ROPE_AHEAD));
  const b = LAMP_EYE.clone().add(new Vector3(ROPE_HALF, -ROPE_DOWN, -ROPE_AHEAD));
  const handle: Entity = d.world.createTransformEntity(grip, { persistent: true });
  handle.addComponent(PathHandle, { kind: PathKindEnum.Slide, a: a.toArray(), b: b.toArray(), grip: [0, 0, 0], reach: 0.09, progress: 0.5, rest: -1 });
  d.stage.own('city', net, grip, ...lines);
  setV2Targets([grip]);
  setDeskMode('one');
  // No ear is waiting for a feather during the fight: a rope taken with one click stays in the hand (the desktop emulator's hands carry what is clicked to a waiting ear).
  setListener(null);
  const state: Net = { x: net.position.x, v: 0 };
  const at = new Vector3();
  const tie = new Vector3();
  const bend = new Vector3();
  const shards = new Shards(d);
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
    const sag = ROPE_SAG / (1 + Math.abs(state.v));
    for (let i = 0; i < 2; i += 1) {
      tie.set(state.x + (i === 0 ? -1 : 1) * RUN.netWidth * 0.5, GROUND + 0.01, SECTION_Z + RUN.sectionDepth * 0.5);
      bend.copy(at).lerp(tie, 0.5);
      bend.y -= sag;
      segment(rope, i * 2, at, bend);
      segment(rope, i * 2 + 1, bend, tie);
    }
    rope.instanceMatrix.needsUpdate = true;
    shards.update(delta);
  });
  const vignette = new Vignette(head);
  const dim = d.each((delta) => vignette.update(delta));

  const game = playMiniGame(new MiniGame(WORDS.safetyNet, [{ name: 'the run' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const doors = [d.stage.node('city', 'bank_door_left'), d.stage.node('city', 'bank_door_right')];
  const phase = () => game.phase;
  let rehearsed = false;
  let costed = 0;
  while (phase() !== 'won') {
    await d.until(() => phase() === 'playing' || phase() === 'won');
    if (phase() === 'won') break;
    // A dev skip ends the wait early; play only once the stage has really begun.
    if (phase() !== 'playing') continue;
    resetSections(sections, doors);
    const losses = game.failuresOf(0);
    const play: Play = { sections, net: state, netMaterial, bird, shards, hint: losses >= HINT_AFTER, mercy: mercyFor(losses), patient: patientFor(losses), paused: () => minis?.playPaused ?? false, held: sections.filter((s) => s.settled).length, lost: 0, dimOne: () => {
        cast.windows.lit = Math.max(0, cast.windows.lit - 1);
        setWindows(cast.windows.lit, cast.windows.total);
      } };
    if (play.mercy && import.meta.env.DEV) console.info(`[run] after ${losses} lost fights: the panes crack longer, the net holds from further off${play.patient ? ', and every pane waits for the net' : ''}`);
    if (!rehearsed) {
      tellGoal('Pull the rope: net under the red pane.', play.held);
      // The first move is shown at once: the soft hand takes the gold rope and slides it, until the player first pinches.
      d.ghost.soon(1.2);
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
    if (costed < RUN_COST_MAX) {
      d.day.darkWindows += 1;
      costed += 1;
    }
    await windowsTo(running(), 0.8);
    if (import.meta.env.DEV) console.info(`[run] the door broke: ${play.lost} panes lost; ${d.day.darkWindows} windows dark for good`);
    await d.wait(0.6);
    vignette.set(1);
    d.sounds.bed('heartbeat_loop', 0);
    tellGoal('Try again: slide the net under each red pane.', play.held);
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
  dim();
  vignette.dispose();
  d.sounds.bed('crowd_murmur_loop', 0.15);
  sections[0].panes.hide();
  net.visible = false;
  for (const line of lines) line.visible = false;
  grip.visible = false;
  shards.dispose();
  // The reporter has no part after the run.
  cast.reporter.pose = 'hidden';
  d.day.problem = 2;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;

  // Back on Gray's shoulder: the card floats up to be read, then lies on the steps; the notebook is rewritten.
  placeGoal();
  await d.rig.move(CITY.shoulder, Math.PI);
  setGoal({ where: WHERE, now: 'Read the card: what the word did.' });
  if (import.meta.env.DEV) console.info('[goal] Read the card: what the word did.');
  await showCard(d, 'safetyNet');
  d.notebook.write([{ text: HEADLINES.run, struck: HEADLINES.runSolved }]);
  await d.captions.say(PERSONAS[persona].firstRun, watcher.head(new Vector3()), 0.3);
}

const segmentAt = new Matrix4();
const segmentMid = new Vector3();
const segmentDir = new Vector3();
const segmentTurn = new Quaternion();
const segmentSize = new Vector3();

/** Instance `i` of a unit cylinder laid from `from` to `to`. */
function segment(mesh: InstancedMesh, i: number, from: Vector3, to: Vector3): void {
  segmentDir.subVectors(to, from);
  segmentMid.copy(from).addScaledVector(segmentDir, 0.5);
  segmentSize.set(1, segmentDir.length(), 1);
  segmentTurn.setFromUnitVectors(UP, segmentDir.normalize());
  mesh.setMatrixAt(i, segmentAt.compose(segmentMid, segmentTurn, segmentSize));
}

const SHARDS = 28;

/** Glass breaking: shards thrown up from a pane and toward the lamp, tumbling and falling back (one draw for all). */
class Shards {
  private readonly mesh: InstancedMesh;
  private readonly at: Vector3[] = [];
  private readonly v: Vector3[] = [];
  private readonly spin: Vector3[] = [];
  private age = 9;
  private readonly put = new Matrix4();
  private readonly turn = new Quaternion();
  private readonly euler = new Vector3();
  private readonly size = new Vector3();

  constructor(d: DirectorSystem) {
    const shard = new PlaneGeometry(0.09, 0.14);
    this.mesh = new InstancedMesh(shard, new MeshBasicMaterial({ color: 0xd8eef8, transparent: true, opacity: 0.75, side: DoubleSide, depthWrite: false }), SHARDS);
    this.mesh.name = 'GlassShards';
    this.mesh.frustumCulled = false;
    this.mesh.pointerEvents = 'none';
    this.mesh.visible = false;
    for (let i = 0; i < SHARDS; i += 1) {
      this.at.push(new Vector3());
      this.v.push(new Vector3());
      this.spin.push(new Vector3());
    }
    d.world.createTransformEntity(this.mesh, { persistent: true });
    d.stage.own('city', this.mesh);
  }

  /** Break the pane whose middle is at `x`; `under` when she sits on it herself: the pieces start up a hand's breadth all over the pane and go down with it. */
  burst(x: number, under = false): void {
    this.age = 0;
    this.mesh.visible = true;
    if (under) {
      for (let i = 0; i < SHARDS; i += 1) {
        const a = (i / SHARDS) * Math.PI * 2 + i;
        const far = 0.22 + 0.45 * (((i * 5) % 7) / 7);
        this.at[i].set(x + Math.cos(a) * far, GROUND + 0.03, SECTION_Z + Math.sin(a) * far * 0.85);
        this.v[i].set(Math.cos(a) * 0.6, 1.0 + ((i * 7) % 5) * 0.28, Math.sin(a) * 0.6);
        this.spin[i].set(4 + (i % 4), 6 - (i % 3), 3 + (i % 5));
      }
      return;
    }
    for (let i = 0; i < SHARDS; i += 1) {
      const a = (i / SHARDS) * Math.PI * 2;
      this.at[i].set(x + Math.cos(a) * 0.5, GROUND + 0.05, SECTION_Z + Math.sin(a) * 0.6);
      // Up, and out toward the lamp the most.
      this.v[i].set(Math.cos(a) * 0.9, 2.6 + ((i * 7) % 5) * 0.45, 1.2 + ((i * 11) % 6) * 0.45);
      this.spin[i].set(3 + (i % 4), 5 - (i % 3), 2 + (i % 5));
    }
  }

  update(delta: number): void {
    if (!this.mesh.visible) return;
    this.age += delta;
    if (this.age > 1.6) {
      this.mesh.visible = false;
      return;
    }
    for (let i = 0; i < SHARDS; i += 1) {
      this.v[i].y -= 9.81 * delta;
      this.at[i].addScaledVector(this.v[i], delta);
      // Back down through the hole: gone.
      const gone = this.at[i].y < GROUND - 0.2;
      this.euler.copy(this.spin[i]).multiplyScalar(this.age);
      this.turn.setFromAxisAngle(UP, this.euler.y).multiply(segmentTurn.setFromAxisAngle(segmentDir.set(1, 0, 0), this.euler.x));
      this.size.setScalar(gone ? 0 : 1);
      this.mesh.setMatrixAt(i, this.put.compose(this.at[i], this.turn, this.size));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.visible = false;
  }
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
  const word: Record<keyof typeof CARDS, string> = { safetyNet: WORDS.safetyNet, firewall: WORDS.firewall, bailOut: WORDS.bailOut, stressTest: WORDS.stressTest, primeThePump: WORDS.primeThePump, ringFence: WORDS.ringFence };
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

/**
 * The six panes as four draws in all: the dark holes, the glass, the cracks
 * and the pieces of net kept under the panes that held, each an instance per
 * pane. A pane's glass and cracks shake and fall by its instance; the cracks
 * spread by growing from the middle and redden by their colour.
 */
class Panes {
  private readonly holes: InstancedMesh;
  private readonly glass: InstancedMesh;
  private readonly cracks: InstancedMesh;
  private readonly kept: InstancedMesh;
  private readonly beams: InstancedMesh;
  /** The columns of light over cracking panes (off when the player sits on the glass herself). */
  beamsOn = true;
  private readonly put = new Matrix4();
  private readonly upright = new Quaternion();
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly at = new Vector3();
  private readonly size = new Vector3();
  private readonly tint = new Color();

  constructor(d: DirectorSystem) {
    const plane = new PlaneGeometry(RUN.sectionWidth - 0.04, RUN.sectionDepth);
    const make = (material: MeshBasicMaterial, name: string): InstancedMesh => {
      const mesh = new InstancedMesh(plane, material, RUN.sections.length);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.pointerEvents = 'none';
      d.world.createTransformEntity(mesh, { persistent: true });
      d.stage.own('city', mesh);
      return mesh;
    };
    this.holes = make(new MeshBasicMaterial({ map: holeTexture(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'GlassHoles');
    // Over the dark of the hole, under the glass: seen once the glass has gone.
    this.kept = make(new MeshBasicMaterial({ map: ropeNetTexture(10), color: 0xb89a4a, transparent: true, alphaTest: 0.3, side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'KeptNets');
    this.glass = make(new MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, toneMapped: false }), 'GlassPanes');
    this.cracks = make(new MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false }), 'GlassCracks');
    // One column of light over the pane that is cracking, seen from the lamp at a glance: red until the net is under it, then green.
    this.beams = new InstancedMesh(beamGeometry(), new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false }), RUN.sections.length);
    this.beams.name = 'PaneBeams';
    this.beams.frustumCulled = false;
    this.beams.pointerEvents = 'none';
    d.world.createTransformEntity(this.beams, { persistent: true });
    d.stage.own('city', this.beams);
    RUN.sections.forEach((_, i) => {
      this.place(this.holes, i, 0.003, 1);
      this.setGlass(i, 0, true);
      this.setCracks(i, 0, 0, 0);
      this.setKept(i, false);
      this.setBeam(i, false);
    });
    this.commit();
  }

  private place(mesh: InstancedMesh, i: number, lift: number, scale: number): void {
    this.at.set(RUN.sections[i], GROUND + lift, SECTION_Z);
    this.size.set(scale, scale, scale);
    mesh.setMatrixAt(i, this.put.compose(this.at, this.flat, this.size));
  }

  /** A pane's glass, `drop` m above (shaking) or below (falling) its place; gone when not shown; tinted (white for none). */
  setGlass(i: number, drop: number, shown: boolean, tint: Color = WHITE): void {
    this.place(this.glass, i, 0.012 + drop, shown ? 1 : 0);
    this.glass.setColorAt(i, tint);
  }

  /** A pane's cracks: spread `spread` of the way (0 none), `red` of the way to red (or green while the net is under it), `drop` m with the glass. */
  setCracks(i: number, spread: number, red: number, drop: number, netUnder = false): void {
    this.place(this.cracks, i, 0.015 + drop, spread <= 0 ? 0 : 0.3 + 0.7 * spread);
    this.cracks.setColorAt(i, netUnder ? this.tint.copy(GREEN) : this.tint.copy(WHITE).lerp(RED, red));
    // The beam stands while the pane cracks and goes when the glass falls; red pulses, green holds.
    this.setBeam(i, spread > 0 && drop > -0.05, netUnder);
  }

  /** The column of light over a pane. */
  private setBeam(i: number, shown: boolean, netUnder = false): void {
    this.at.set(RUN.sections[i], GROUND, SECTION_Z);
    shown = shown && this.beamsOn;
    this.size.set(shown ? 1 : 0, shown ? 1 : 0, shown ? 1 : 0);
    this.beams.setMatrixAt(i, this.put.compose(this.at, this.upright, this.size));
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 160));
    this.beams.setColorAt(i, netUnder ? this.tint.copy(GREEN).multiplyScalar(0.8) : this.tint.copy(RED).multiplyScalar(pulse));
  }

  /** The piece of net kept under a pane that held. */
  setKept(i: number, shown: boolean): void {
    this.place(this.kept, i, 0.006, shown ? 1 : 0);
  }

  /** Send this frame's changes to the GPU. */
  commit(): void {
    for (const mesh of [this.glass, this.cracks, this.kept, this.beams]) mesh.instanceMatrix.needsUpdate = true;
    this.holes.instanceMatrix.needsUpdate = true;
    for (const mesh of [this.glass, this.cracks, this.beams]) if (mesh.instanceColor != null) mesh.instanceColor.needsUpdate = true;
  }

  hide(): void {
    for (const mesh of [this.holes, this.glass, this.cracks, this.kept, this.beams]) mesh.visible = false;
  }
}

function buildSections(d: DirectorSystem, cast: CityCast): Section[] {
  const panes = new Panes(d);
  const sections = RUN.sections.map((x, index) => {
    const people = cast.crowd.filter((p) => Math.abs(p.position.z - SECTION_Z) < RUN.sectionDepth / 2 && Math.abs(p.position.x - x) <= RUN.sectionWidth / 2);
    return { index, panes, people, home: people.map((p) => p.position.clone()), settled: false };
  });
  if (import.meta.env.DEV) console.info(`[run] people on the panes: ${sections.map((s) => s.people.length).join(' ')}`);
  return sections;
}

/** The queue's umbrellas (made with the city, one per person in the queue) go where their people go, and away with them, all day (started once the city is set up). */
export function followUmbrellas(d: DirectorSystem, cast: CityCast): () => void {
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
    s.panes.setGlass(s.index, 0, true);
    s.panes.setCracks(s.index, 0, 0, 0);
    s.panes.setKept(s.index, false);
    s.people.forEach((p, i) => {
      p.position.copy(s.home[i]);
      p.pose = 'wave';
    });
  }
  sections[0]?.panes.commit();
  for (const door of doors) if (door != null) door.rotation.y = 0;
}

/** What one fight needs and keeps count of. */
interface Play {
  sections: Section[];
  net: Net;
  netMaterial: MeshBasicMaterial;
  bird: Group;
  shards: Shards;
  hint: boolean;
  mercy: boolean;
  /** Every pane waits for the net (after many lost fights): this fight cannot be lost. */
  patient: boolean;
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
  play.netMaterial.color.copy(under ? NET_ON : NET_IDLE);
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
  tellGoal('Slide the net under the red pane.', play.held);
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
      tellGoal('Two red panes: catch the first, then the second.', play.held);
      // Half a second of quiet before the worst of it.
      d.sounds.bed('crowd_murmur_loop', 0);
      arm();
      await d.wait(0.5);
      d.sounds.bed('crowd_murmur_loop', 0.3);
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
    tellGoal(n === RUN.waves.length - 2 ? 'Get ready: the magpie is coming.' : 'Slide the net under the red pane.', play.held);
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
  let wasUnder = false;
  let held: boolean | null = null;
  let after = 0;
  d.sounds.play('glass_crack', 0.45, 1.35);
  d.sounds.play('bank_creak', 0.5, 1.2, 0.15);
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
      if (result) play.netMaterial.color.copy(NET_IDLE);
      done(result);
    };
    const stop = d.each((delta) => {
      if (play.paused()) return;
      t += delta;
      if (held == null) {
        // The cracks spread and the pane trembles, faster toward the end, going from white to red.
        const waits = c == null || play.patient;
        const k = c == null ? 0.5 + 0.08 * Math.sin(t * 5) : Math.min(cracked(t, warn), waits ? 0.85 : 1);
        cracking.set(s.index, k);
        tension(d, play);
        const shake = Math.sin(t * (20 + 40 * k)) * 0.005 * k;
        const under = holds(play.net.x, s.index, play.mercy);
        // The whole pane says it at a glance: red and pulsing faster as its drop comes, green while the net is under it.
        if (under) paneTint.copy(PANE_GREEN);
        else paneTint.copy(WHITE).lerp(PANE_RED, 0.55 + 0.45 * Math.abs(Math.sin(t * (4 + 8 * k))));
        s.panes.setGlass(s.index, shake, true, paneTint);
        s.panes.setCracks(s.index, 0.2 + 0.8 * k, Math.max(0, (k - 0.4) / 0.6), shake, under);
        if (under && !wasUnder) d.sounds.play('ear_click', 0.6, 1.4);
        wasUnder = under;
        s.panes.commit();
        for (const p of s.people) p.position.y = GROUND + Math.sin(t * 30 + p.position.x) * 0.012 * k;
        if (skipped()) held = true;
        else if (waits && (c == null || t >= warn * 0.85)) {
          settle = under ? settle + delta : 0;
          if (settle >= RUN.rehearsalSettle) held = true;
        } else if (t >= warn) held = under;
        if (held != null) {
          cracking.delete(s.index);
          tension(d, play);
          d.sounds.play('glass_crack', 1, 0.75);
          d.sounds.play('fall_whoosh', 0.6, 1, 0.05);
          play.shards.burst(RUN.sections[s.index]);
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
      s.panes.setGlass(s.index, -k * 1.5, k < 1, held ? PANE_GREEN : PANE_RED);
      s.panes.setCracks(s.index, k < 1 ? 1 : 0, 1, -k * 1.5);
      // The net under them stays: a gold piece of it under the pane.
      if (held) s.panes.setKept(s.index, true);
      s.panes.commit();
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
          p.position.set(s.home[i].x, GROUND, s.home[i].z + RUN_BACK * Math.min(1, after / 0.9));
        }
      });
      if (after > 0.9) finish(held);
    });
  });
}

/** The run from inside the queue (run-inside-rules.ts) is the run: INSIDE_RUN. The run from the lamp stays in the code beside it. */
const INSIDE_RUN = true;
function insideRun(): boolean {
  return INSIDE_RUN || (import.meta.env.DEV && (devParam('run') === 'inside' || import.meta.env.VITE_RUN_INSIDE === '1'));
}

/** The depositor's hands: the drawn hands' own colour changed to skin while she is one of the queue (white, they read as gloves). */
function depositorHands(d: DirectorSystem, on: boolean): void {
  d.player.traverse((o) => {
    const mesh = o as Mesh;
    if ((mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh !== true || Array.isArray(mesh.material)) return;
    const material = mesh.material as MeshStandardMaterial;
    if (material.color == null) return;
    const kept = mesh.userData as { depositorSkin?: number };
    if (on) {
      kept.depositorSkin ??= material.color.getHex();
      material.color.setHex(0xc99a78);
    } else if (kept.depositorSkin != null) {
      material.color.setHex(kept.depositorSkin);
      delete kept.depositorSkin;
    }
  });
}

/** How high a depositor's eye is over the glass, sitting on it with the knees up (m). */
const SEAT_EYE = 0.95;
/** The depositor's own body under the eye: a dark coat and trousers, bare hands. */
const DEPOSITOR = { suit: 0x2c3340, trim: 0x2c3340, tights: 0x3b3a38, shoes: 0x16130f, skin: 0xd9a983, head: false } as const;
/** The panes she sits on: the rehearsal's, then one for each round (the middle and right ones, clear of the stone wall on the left). */
const INSIDE_SEATS = [3, 4, 5, 4] as const;

/**
 * S07 from inside the queue: the bird settles on a depositor and the view opens
 * behind his eyes, seated on the glass among the others. The pane under him
 * cracks; a gold rope (the safety net's) swings in front of him, a ring at its
 * end; taken before the glass gives, he is lowered gently into the net, and
 * the people round him are caught too. Late, the view darkens a moment, the
 * net still catches him and a window goes out. A rehearsal that waits for the
 * rope, then three rounds, each crack quicker; after three late rounds slower.
 * No fall is ever shown: only the dark and a slow lowering, the head left free.
 */
async function s07Inside(d: DirectorSystem, cast: CityCast, persona: PersonaId, watcher: Person): Promise<void> {
  d.chapter('S07');
  const head = d.player.head;
  void d.gold.show(WORDS.safetyNet.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head, wordBadge(WORDS.safetyNet));
  await d.captions.say('S07-1', CITY.graySays, 0);

  const sections = buildSections(d, cast);
  const panes = sections[0].panes;
  panes.beamsOn = false;
  const bankFront = dressBankFront(d);
  const shards = new Shards(d);
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
  void d.gold.show(BOSSES.run.name, new Vector3(-5.2, 4.6, -20.5), 3.2, 2.6, new Vector3(0, 0.15, 0), head);

  const seatEye = (k: number): Vector3 => new Vector3(RUN.sections[k], GROUND + SEAT_EYE, SECTION_Z + 0.15);
  // Nobody stands where she sits: the people of that pane within a step of the seat step out of the way.
  const clearSeat = (k: number): void => {
    for (const p of sections[k].people) if (Math.abs(p.position.x - RUN.sections[k]) < 0.6) p.pose = 'hidden';
  };

  // Into one of them: the dark closes round a depositor's head on the first pane and opens behind his eyes.
  const someone = sections[INSIDE_SEATS[0]].people[0] ?? null;
  const mark = new Object3D();
  if (someone != null) someone.head(mark.position);
  else mark.position.copy(seatEye(INSIDE_SEATS[0]));
  const iris = new Iris(head);
  await iris.close(d, mark);
  if (someone != null) someone.pose = 'hidden';
  // The memory keepers stand on their crates right in front of where she sits: out of sight while the run is seen from the pavement.
  keepersAway(true);
  // A person's hands now, not the bird's wing tips.
  stowWing(true);
  clearSeat(INSIDE_SEATS[0]);
  let eye = seatEye(INSIDE_SEATS[0]);
  d.rig.place(eye, 0);
  await d.wait(0.25);
  await iris.open(d);
  iris.dispose();

  // The safety net's gold rope, hanging from high over the queue, a ring at its end swinging in front of her.
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, emissive: 0x8a6418, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.8 });
  const ring = new Mesh(new TorusGeometry(0.075, 0.016, 10, 28), gold);
  ring.name = 'SafetyRing';
  d.world.createTransformEntity(ring, { persistent: true });
  const rope = new InstancedMesh(new CylinderGeometry(0.014, 0.014, 1, 8), new MeshBasicMaterial({ color: 0xffd97a, map: ropeTexture(), toneMapped: false }), 1);
  rope.name = 'SafetyRope';
  rope.frustumCulled = false;
  rope.pointerEvents = 'none';
  d.world.createTransformEntity(rope, { persistent: true });
  d.stage.own('city', ring, rope);
  setV2Targets([ring]);
  setDeskMode('one');
  setListener(null);

  // Her own body under the eye: sitting on the glass, knees up, the arms going to the hands.
  const body = new PerformerBody(DEPOSITOR);
  // A depositor's coat and trousers are plain wool: the performer's sequins and piping come off (the skin keeps its colour).
  body.root.traverse((o) => {
    o.pointerEvents = 'none';
    const cloth = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (cloth != null && !Array.isArray(cloth) && cloth.map != null) {
      cloth.map = null;
      cloth.color.setHex(DEPOSITOR.suit);
      cloth.roughness = 0.95;
      cloth.metalness = 0;
      cloth.needsUpdate = true;
    }
  });
  d.world.createTransformEntity(body.root, { persistent: true });
  d.stage.own('city', body.root);
  const neck = new Vector3();
  const hips = new Vector3();
  const foot = new Vector3();
  const ahead = new Vector3(0, 0, -1);
  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  const was = { left: false, right: false };
  const began = { left: -1, right: -1 };
  let held: 'left' | 'right' | null = null;
  let roundStart = d.now;
  let swingT = 0;
  let swing = swingFor(0, 0);
  let alarm = 0;
  const anchor = new Vector3();
  const ringAt = new Vector3();
  const seatRope = (): void => {
    anchor.set(eye.x, 6.5, eye.z - INSIDE.ringAhead);
    ringAt.set(eye.x, eye.y - INSIDE.ringBelow, eye.z - INSIDE.ringAhead);
  };
  seatRope();
  let handsAt = 0;
  const tick = d.each((delta) => {
    shards.update(delta);
    // A drawn hand may arrive late (its model loads when the hand is first tracked): its colour is set again every second.
    if (d.now >= handsAt) {
      handsAt = d.now + 1;
      depositorHands(d, true);
    }
    readHands(d, hands);
    for (const side of ['left', 'right'] as const) {
      if (hands.pinching[side] && !was[side]) began[side] = d.now;
      was[side] = hands.pinching[side];
    }
    // Once taken, the rope stays in her hand until the pane gives (the round's start lets it go): a pinch let go a moment after, or a mouse's single click, still holds it.
    if (held == null) {
      swingT += delta;
      ringAt.set(anchor.x + ringOffset(swingT, swing.period, swing.reach), eye.y - INSIDE.ringBelow, anchor.z);
      for (const side of ['left', 'right'] as const) {
        if (hands.pinching[side] && began[side] >= roundStart && hands[side].distanceTo(ringAt) < INSIDE.holdWithin) {
          held = side;
          d.sounds.play('rope_creak', 0.5);
          if (import.meta.env.DEV) console.info(`[run] the ${side} hand took the rope ${(d.now - roundStart).toFixed(1)} s into the round`);
          break;
        }
      }
    } else ringAt.lerp(hands[held], Math.min(1, delta * 12));
    ring.position.copy(ringAt);
    ring.lookAt(head.getWorldPosition(mark.position));
    segment(rope, 0, anchor, ringAt);
    rope.instanceMatrix.needsUpdate = true;
    // The neck a little behind and under the eye, so looking down shows the coat's front and the knees, not the inside of the shoulders.
    neck.set(eye.x, eye.y - 0.22, eye.z + 0.14);
    body.spine(neck, hips.set(eye.x, eye.y - SEAT_EYE + 0.12, eye.z + 0.2), ahead);
    for (const side of ['left', 'right'] as const) {
      body.leg(side, foot.set(eye.x + (side === 'left' ? -0.16 : 0.16), eye.y - SEAT_EYE + 0.06, eye.z - 0.5));
      // An arm whose hand is up before her (at the rope) would lie along the line of sight and fill the picture with sleeve: it hangs by her side instead, and is her own arm again when the hand is down by her lap.
      const wrist = wristOf(d, side);
      body.arm(side, wrist.y < eye.y - 0.3 ? wrist : null);
    }
    // The ring says now: gold at rest, red as the glass is about to give, green once it is held.
    gold.emissive.setHex(held != null ? 0x2f9a3a : alarm > 0.5 ? 0xb3261e : 0x8a6418);
    gold.emissiveIntensity = held != null ? 0.9 : 0.6 + (alarm > 0.5 ? 0.4 * Math.abs(Math.sin(d.now * 9)) : 0);
  });
  const vignette = new Vignette(head);
  const dim = d.each((delta) => vignette.update(delta));

  /** Dev only: a skip counts as the rope held, so a test can take the day through without hands. */
  let skippedHeld = false;
  /** One pane under her: cracks for `crack` seconds (null: the rehearsal, which waits for the rope), gives, and the net lowers her; true if she held the rope. */
  const crackUnder = async (k: number, crack: number | null): Promise<boolean> => {
    skippedHeld = false;
    if (import.meta.env.DEV) {
      d.onSkip(() => {
        skippedHeld = true;
      });
    }
    const start = d.now;
    let last = d.now;
    let heldFor = 0;
    let creak = 0;
    d.sounds.play('glass_crack', 0.5, 1.3);
    d.sounds.bed('heartbeat_loop', 0.35);
    await d.until(() => {
      const now = d.now;
      const dt = now - last;
      last = now;
      const t = now - start;
      if (crack == null) {
        const c = crackOf(Math.min(t, 2.4), 4.8);
        alarm = held != null ? 0 : 0.6;
        panes.setCracks(k, c.spread, c.red, 0, held != null);
        panes.commit();
        heldFor = held != null ? heldFor + dt : 0;
        return heldFor >= INSIDE.rehearsalHold;
      }
      const c = crackOf(t, crack);
      alarm = c.red;
      panes.setCracks(k, c.spread, c.red, 0, held != null);
      panes.commit();
      creak -= dt;
      if (creak <= 0) {
        d.sounds.play('glass_crack', 0.3 + 0.4 * c.red, 1 + 0.5 * c.red);
        creak = 0.9 - 0.6 * c.red;
      }
      return t >= crack;
    });
    alarm = 0;
    d.sounds.bed('heartbeat_loop', 0);
    const safe = held != null || skippedHeld;
    if (import.meta.env.DEV) console.info(`[run] pane ${k + 1} gave ${safe ? 'with the rope held' : 'before the rope was taken'}`);
    d.sounds.play('glass_crack', 0.9, 0.8);
    d.sounds.play(safe ? 'net_twang' : 'crowd_gasp', 0.7);
    if (!safe) vignette.set(0.15);
    // The pane goes in pieces, not as one sheet.
    shards.burst(RUN.sections[k], true);
    // The glass drops into the shaft; the net is under her; she is lowered into it slowly, and the people round her too.
    const from = eye.clone();
    const neighbours = sections.filter((s) => Math.abs(s.index - k) <= 1).flatMap((s) => s.people.filter((p) => p.pose !== 'hidden'));
    const homes = neighbours.map((p) => p.position.clone());
    const lower = d.now;
    await d.until(() => {
      const f = Math.min(1, (d.now - lower) / INSIDE.lowerFor);
      const e = f * f * (3 - 2 * f);
      panes.setGlass(k, -1.6 * Math.min(1, f * 3), f < 0.34);
      panes.setCracks(k, f < 0.34 ? 1 : 0, 1, -1.6 * Math.min(1, f * 3));
      panes.setKept(k, true);
      panes.commit();
      eye = new Vector3(from.x, from.y - INSIDE.lowerBy * e, from.z);
      d.rig.ride(eye, 0);
      neighbours.forEach((p, i) => {
        // Into the net, which gives under them and lifts them once before it holds.
        p.position.set(homes[i].x, homes[i].y - 0.3 * e + (f > 0.55 ? 0.05 * Math.sin(((f - 0.55) / 0.45) * Math.PI * 2) * (1 - f) * 2.2 : 0), homes[i].z);
        if (f > 0.6) p.pose = 'wave';
      });
      return f >= 1;
    });
    vignette.set(1);
    return safe;
  };

  const game = playMiniGame(new MiniGame(WORDS.safetyNet, [{ name: 'the run' }]));
  await d.until(() => game.phase === 'playing' || game.phase === 'won');
  setGoal({ where: `${WHERE} · IN THE QUEUE`, now: 'Grab the rope before the glass gives.' });
  if (import.meta.env.DEV) console.info('[run] inside the queue: the rehearsal pane cracks and waits for the rope');
  d.ghost.soon(1.2);
  roundStart = d.now;
  await crackUnder(INSIDE_SEATS[0], null);
  let done = 0;
  let late = 0;
  let costed = 0;
  while (done < INSIDE.rounds && game.phase !== 'won') {
    const k = INSIDE_SEATS[1 + (done % (INSIDE_SEATS.length - 1))];
    // The queue moves up: she is on the next pane, the glass whole again under her.
    panes.setKept(k, false);
    panes.setGlass(k, 0, true);
    panes.setCracks(k, 0, 0, 0);
    panes.commit();
    clearSeat(k);
    eye = seatEye(k);
    await d.rig.move(eye, 0);
    seatRope();
    held = null;
    swing = swingFor(done, late);
    swingT = 0;
    roundStart = d.now;
    setGoal({ where: `${WHERE} · IN THE QUEUE`, now: done === 0 ? 'Grab the rope before the glass gives.' : 'Again: the rope, before the glass gives.', steps: [done, INSIDE.rounds] });
    if (done === INSIDE.rounds - 1) {
      // Before the last: someone near her whispers what the magpie said, and the whole queue takes it up.
      const near = sections[k].people.find((p) => p.pose !== 'hidden') ?? cast.crowd.find((p) => p.pose !== 'hidden');
      if (near != null) await d.captions.say('S07-2', near.head(new Vector3()), 0.25);
    }
    await d.wait(0.6);
    const crack = crackFor(done, late);
    if (import.meta.env.DEV) console.info(`[run] round ${done + 1}: the pane cracks for ${crack.toFixed(1)} s, the rope swings ${swing.reach.toFixed(2)} m every ${swing.period.toFixed(1)} s${late >= INSIDE.mercyAfter ? ' (slower after three late rounds)' : ''}`);
    const safe = await crackUnder(k, crack);
    if (safe) done += 1;
    else {
      late += 1;
      if (costed < RUN_COST_MAX) {
        d.day.darkWindows += 1;
        costed += 1;
      }
      await windowsTo(running(), 0.8);
    }
  }
  game.win();
  endMiniGame(game);
  tick();
  setV2Targets([]);
  d.sounds.bed('heartbeat_loop', 0);

  // Won: the queue climbs out of the nets and goes home; the windows light again.
  d.sounds.play('cymbal_hit', 0.7);
  d.sounds.play('cheer', 0.8);
  d.sounds.play('applause', 0.8, 1, 0.3);
  if (import.meta.env.DEV) console.info(`[run] won: panic calmed (${late} late)`);
  setGoal({ where: WHERE, now: 'Watch the queue melt away.', steps: [INSIDE.rounds, INSIDE.rounds] });
  void windowsTo(cast.windows.total - d.day.darkWindows, 2.0);
  await d.gold.show(BOSSES.run.won, new Vector3(eye.x, 2.6, SECTION_Z - 2.4), 2.6, 2.8, new Vector3(0, 0.2, 0), head);
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
  dim();
  vignette.dispose();
  d.sounds.bed('crowd_murmur_loop', 0.15);
  panes.hide();
  shards.dispose();
  ring.visible = false;
  rope.visible = false;
  body.root.visible = false;
  cast.reporter.pose = 'hidden';
  d.day.problem = 2;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;

  // Back on Gray's shoulder (the bird again): the card floats up to be read, then lies on the steps; the notebook is rewritten.
  placeGoal();
  // Behind the blink: the forecourt as it was, the keepers back on their stands, the bird's own wing.
  await d.rig.fadeTo(1);
  for (const o of bankFront) o.visible = false;
  keepersAway(false);
  depositorHands(d, false);
  d.rig.place(CITY.shoulder, Math.PI);
  await d.rig.fadeTo(0);
  stowWing(false);
  setGoal({ where: WHERE, now: 'Read the card: what the word did.' });
  await showCard(d, 'safetyNet');
  d.notebook.write([{ text: HEADLINES.run, struck: HEADLINES.runSolved }]);
  await d.captions.say(PERSONAS[persona].firstRun, watcher.head(new Vector3()), 0.3);
}
