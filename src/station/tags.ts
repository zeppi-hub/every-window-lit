import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, MeshBasicMaterial, Object3D, SRGBColorSpace } from '@iwsdk/core';
import { CHOICE_HOMES } from './basket.js';
import { JAR_COINS, JAR_POSITION } from './card.js';
import { LARGE_FONT, NORMAL_FONT } from './caption.js';
import { SEAT_EYE, SILL } from './layout.js';
import { faceSeat } from './tocco.js';

/**
 * The tags over the sill's three things while the Keeper chooses, and the
 * coin dots over the jar (Devir 1b item 7): each tag says who the thing is
 * for ("Everyone", "One family", "Later") with one coin dot for each coin
 * it costs, and the dots over the jar are its balance; the coins a choice
 * costs drop away from them as it goes into the basket. All of it is one
 * mesh with one material on one small canvas (the tags' three cells and a
 * coin), so it adds one draw call, and only while it shows. Each tag and
 * the row of dots face the seat. A tag stands just over the top of its
 * thing (the things differ from week to week), sized to its distance from
 * the seat so all three look the same size; Larger captions (comfort.ts)
 * draw the tags bigger by the captions' own ratio (the dots keep theirs).
 */

/** The canvas: three tag cells side by side and below, and one coin. */
export const TAG_CANVAS = { w: 1024, h: 512 } as const;
export const TAG_CELL = { w: 400, h: 256 } as const;
const CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [400, 0],
  [0, 256],
];
const COIN_CELL = { x: 832, y: 0, s: 96 } as const;
/**
 * A tag's height for each metre between it and the seated eye, at the
 * normal caption size (about 6 degrees: 6.4 cm on the furthest, 4.5 cm on
 * the nearest); its width follows its cell's shape.
 */
export const TAG_SPAN = 0.104;
export const TAG_ASPECT = TAG_CELL.w / TAG_CELL.h;
/**
 * How far a tag stands behind its thing's back (m), and how much of its
 * height may stand behind the thing below its top: only its dark margin
 * under the coin dots, so the thing in front never hides its word or dots
 * (tests/tags.test.mjs), and the tags stay low, clear of Tocco's line.
 */
export const TAG_BEHIND = 0.008;
export const TAG_TUCK = 0.1;
/**
 * How far each tag stands to the side of its thing's middle (m): the left
 * one a little further left, so at the larger size its corner keeps clear
 * of the middle tag (the far tag looks higher and the near one lower).
 */
export const TAG_SHIFT: readonly number[] = [-0.04, 0, 0];
/** How much bigger the tags and dots are drawn with Larger captions: as the captions' text grows. */
export const TAG_LARGE = LARGE_FONT / NORMAL_FONT;
/** The word's type (px on the canvas), and its capital height as a share of it (a sans serif's caps stand about 0.7 em). */
export const TAG_FONT = 80;
export const TAG_CAP = 0.7;
/** Where the word and the coin dots sit in a cell (px from its top), and a coin dot's size and spacing there. */
const WORD_Y = 92;
const DOTS_Y = 194;
const DOT_PX = 40;
const DOT_GAP = 16;
/** The coin dots over the jar: their size, spacing, and how high the row's middle is over the jar's foot (its mouth is at 9 cm). */
export const DOT_SIZE = 0.012;
export const DOT_PITCH = 0.016;
export const DOT_LIFT = 0.125;
/** A dropped coin falls this far as it fades (m). */
export const DOT_FALL = 0.05;

/** Quads in the mesh: the three tags, then the jar's dots. */
export const TAG_QUADS = 3 + JAR_COINS;

/**
 * How tall a thing stands over the sill and how far it reaches back from
 * its middle, away from the Keeper (m), from its geometry (built with its
 * base on y = 0 round its own middle) turned by `yaw` as it lies on the sill.
 */
export function thingReach(geometry: BufferGeometry, yaw: number, out: { top: number; back: number } = { top: 0, back: 0 }): { top: number; back: number } {
  if (geometry.boundingBox == null) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box == null) return out;
  out.top = box.max.y;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  out.back = 0;
  for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) out.back = Math.max(out.back, x * sin - z * cos);
  return out;
}

/**
 * Where tag `i` stands and how big it is: just behind its thing (`back` m
 * behind its home, like a place card), rising from just under the thing's
 * top (`top` m over the sill), so from the seat it shows above the thing.
 */
export interface TagPlace {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

export function tagPlace(i: number, top: number, back: number, large: boolean, out: TagPlace = { x: 0, y: 0, z: 0, w: 0, h: 0 }): TagPlace {
  const [x, , home] = CHOICE_HOMES[i];
  const z = home - back - TAG_BEHIND;
  // Sized by its distance from the eye (to about its middle), so each looks as big as the others.
  const distance = Math.hypot(x - SEAT_EYE.x, SILL.top + top + 0.03 - SEAT_EYE.y, z - SEAT_EYE.z);
  out.h = TAG_SPAN * distance * (large ? TAG_LARGE : 1);
  const foot = SILL.top + top - TAG_TUCK * out.h;
  out.w = out.h * TAG_ASPECT;
  out.x = x + (TAG_SHIFT[i] ?? 0);
  out.y = foot + out.h / 2;
  out.z = z;
  return out;
}

/** The middle of the jar's row of dots. */
export const DOT_ROW = { x: JAR_POSITION.x, y: JAR_POSITION.y + DOT_LIFT, z: JAR_POSITION.z } as const;

/** The capital height of the word on a tag `h` tall (m). */
export function tagCap(h: number): number {
  return (TAG_CAP * TAG_FONT * h) / TAG_CELL.h;
}

export interface TagParts {
  mesh: Mesh;
  texture: CanvasTexture;
}

/** The tags' and dots' mesh, laid out at the normal size, everything hidden (SeasonSystem shows what the moment needs). */
export function createTags(words: readonly string[], costs: readonly number[]): TagParts {
  const canvas = document.createElement('canvas');
  canvas.width = TAG_CANVAS.w;
  canvas.height = TAG_CANVAS.h;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  drawTags(texture, words, costs);
  const geometry = new BufferGeometry();
  const count = TAG_QUADS * 4;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2), 2));
  // Each quad's colour multiplies its texture: dimmed for a thing the jar cannot pay for; its alpha shows or hides it.
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 4), 4));
  const index: number[] = [];
  for (let q = 0; q < TAG_QUADS; q += 1) index.push(4 * q, 4 * q + 2, 4 * q + 1, 4 * q + 2, 4 * q + 3, 4 * q + 1);
  geometry.setIndex(index);
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  for (let q = 0; q < TAG_QUADS; q += 1) {
    const cell = q < 3 ? { x: CELLS[q][0], y: CELLS[q][1], w: TAG_CELL.w, h: TAG_CELL.h } : { x: COIN_CELL.x, y: COIN_CELL.y, w: COIN_CELL.s, h: COIN_CELL.s };
    const u0 = cell.x / TAG_CANVAS.w;
    const u1 = (cell.x + cell.w) / TAG_CANVAS.w;
    const v0 = 1 - cell.y / TAG_CANVAS.h;
    const v1 = 1 - (cell.y + cell.h) / TAG_CANVAS.h;
    uv.setXY(4 * q, u0, v0);
    uv.setXY(4 * q + 1, u1, v0);
    uv.setXY(4 * q + 2, u0, v1);
    uv.setXY(4 * q + 3, u1, v1);
  }
  layoutTags(geometry, false, [0.05, 0.05, 0.05], [0.03, 0.03, 0.03]);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ map: texture, transparent: true, vertexColors: true, depthWrite: false }));
  mesh.name = 'ChoiceTags';
  // Its quads move (the dots drop), so its bounds are never stale: it is never culled; hidden, it costs nothing.
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  return { mesh, texture };
}

const turn = new Object3D();

/** Writes the four corners of quad `q`, `w` by `h` (m), its middle at `at`, facing the seat; `fall` lowers it (m). */
export function placeQuad(position: BufferAttribute, q: number, at: { x: number; y: number; z: number }, w: number, h: number, fall = 0, across = 0): void {
  faceSeat(turn, at);
  turn.updateMatrix();
  const e = turn.matrix.elements;
  // The quad's own right and up, from its turn toward the seat.
  const rx = e[0];
  const ry = e[1];
  const rz = e[2];
  const ux = e[4];
  const uy = e[5];
  const uz = e[6];
  for (let c = 0; c < 4; c += 1) {
    const sx = (c % 2 === 0 ? -0.5 : 0.5) * w + across;
    const sy = (c < 2 ? 0.5 : -0.5) * h;
    position.setXYZ(4 * q + c, at.x + rx * sx + ux * sy, at.y + ry * sx + uy * sy - fall, at.z + rz * sx + uz * sy);
  }
}

const place: TagPlace = { x: 0, y: 0, z: 0, w: 0, h: 0 };

/**
 * Lays the three tags out over their things, whose tops stand `tops` (m)
 * over the sill and which reach `backs` (m) behind their homes, at either
 * size (the dots are laid out by SeasonSystem, by the balance).
 */
export function layoutTags(geometry: BufferGeometry, large: boolean, tops: readonly number[], backs: readonly number[]): void {
  const position = geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < 3; i += 1) {
    tagPlace(i, tops[i] ?? 0, backs[i] ?? 0, large, place);
    placeQuad(position, i, place, place.w, place.h);
  }
  position.needsUpdate = true;
}

/** Lays out dot `k` of a row of `count` over the jar, centred on the jar; `fall` drops it (a coin paid away). */
export function placeDot(geometry: BufferGeometry, k: number, count: number, fall: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute;
  // The dots carry no words: they keep their size with Larger captions, clear of the basket.
  placeQuad(position, 3 + k, DOT_ROW, DOT_SIZE, DOT_SIZE, fall, (k - (count - 1) / 2) * DOT_PITCH);
  position.needsUpdate = true;
}

/** Sets quad `q`'s colour (a dim for a thing out of reach) and alpha (0 hides it). */
export function tintQuad(geometry: BufferGeometry, q: number, shade: number, alpha: number): void {
  const color = geometry.getAttribute('color') as BufferAttribute;
  for (let c = 0; c < 4; c += 1) color.setXYZW(4 * q + c, shade, shade, shade, alpha);
  color.needsUpdate = true;
}

/** Draws the three tags (a dark rounded label, its word in white, a brass coin dot for each coin it costs) and the coin. */
export function drawTags(texture: CanvasTexture, words: readonly string[], costs: readonly number[]): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const coin = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#e2bb52';
    g.fill();
    g.lineWidth = Math.max(3, r * 0.16);
    g.strokeStyle = '#8d6b25';
    g.stroke();
  };
  words.forEach((word, i) => {
    const [x, y] = CELLS[i];
    g.fillStyle = 'rgba(24, 19, 15, 0.82)';
    g.beginPath();
    g.roundRect(x + 10, y + 10, TAG_CELL.w - 20, TAG_CELL.h - 20, 40);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${TAG_FONT}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.fillText(word, x + TAG_CELL.w / 2, y + WORD_Y, TAG_CELL.w - 56);
    const n = costs[i] ?? 0;
    const row = n * DOT_PX + (n - 1) * DOT_GAP;
    for (let k = 0; k < n; k += 1) coin(x + TAG_CELL.w / 2 - row / 2 + DOT_PX / 2 + k * (DOT_PX + DOT_GAP), y + DOTS_Y, DOT_PX / 2);
  });
  coin(COIN_CELL.x + COIN_CELL.s / 2, COIN_CELL.y + COIN_CELL.s / 2, COIN_CELL.s / 2 - 6);
  texture.needsUpdate = true;
}
