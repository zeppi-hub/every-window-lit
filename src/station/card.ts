import { CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { annulus, PartBuilder, prism, WORLD } from './facade.js';
import { SILL } from './layout.js';
import { glowing } from './materials.js';

/**
 * The week's card and the Keeper's jar of coins.
 *
 * The card comes up in the basket with the real number for the week: what
 * moved on the mainland, by how much, and which real week (or month) it
 * was. When the basket goes back down the Keeper keeps it, propped on the
 * sill in front of where the basket stood, until the week is over.
 *
 * The jar on the near right of the sill holds the coins the options are
 * paid with: five at first, one more each week, eight at most.
 */

/** The card, 17 by 10 cm. */
export const CARD_SIZE = { w: 0.17, h: 0.1 } as const;
/**
 * Where the Keeper props the card once the basket has gone: on the sill
 * just in front of where the basket stood, leaning well back, turned to
 * the seat. Its lower edge rests on the stone.
 */
export const CARD_ON_SILL = { x: 0.2, y: SILL.top + 0.03, z: -0.28, tilt: -0.95, yaw: -0.45 } as const;
/** How the card stands in the basket: above its floor, toward the Keeper, leaning back on the handle. */
export const CARD_IN_BASKET = { y: 0.2, z: 0.06, tilt: -0.3, yaw: -0.45 } as const;

/** The jar, right of the sun rail's end post and clear of the tower key; and the most coins it holds. */
export const JAR_POSITION = { x: 0.37, y: SILL.top, z: -0.2 } as const;
export const JAR_COINS = 8;

export interface CardParts {
  card: Group;
  texture: CanvasTexture;
  jar: Group;
  /** One mesh per coin, bottom first; JarSystem shows as many as the jar holds. */
  coins: Mesh[];
}

/**
 * The solidarity week's letter: a folded sheet of its own, never the
 * week's card, so the letter and the price never share an object.
 */
/** The card's and letter's unlit faces, dimmed and warmed with the evening so they never glow in the dusk. */
const PAPERS: MeshBasicMaterial[] = [];
const DUSK_PAPER = new Color(0.8, 0.72, 0.6);

/** Evening `e` (0 day, 1 dusk) and the last night's dark (0 to 1): paper stays readable, just no brighter than the room. */
export function setPaperLight(e: number, night: number): void {
  for (const material of PAPERS) material.color.setRGB(1, 1, 1).lerp(DUSK_PAPER, e).multiplyScalar(1 - 0.3 * night);
}

export function createLetter(): { letter: Group; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 680;
  canvas.height = 400;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const letter = new Group();
  letter.name = 'AidLetter';
  // Two halves of the sheet, opened a little along the fold.
  const half = (top: boolean) => {
    const g = new PlaneGeometry(CARD_SIZE.w, CARD_SIZE.h / 2);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) uv.setY(i, top ? 0.5 + uv.getY(i) / 2 : uv.getY(i) / 2);
    const paper = new MeshBasicMaterial({ map: texture, side: DoubleSide });
    PAPERS.push(paper);
    const mesh = new Mesh(g, paper);
    mesh.position.y = (top ? 1 : -1) * (CARD_SIZE.h / 4);
    return mesh;
  };
  const upper = half(true);
  const lower = half(false);
  const hinge = new Group();
  hinge.add(upper);
  upper.position.y = CARD_SIZE.h / 4;
  hinge.rotation.x = -0.25;
  letter.add(hinge, lower);
  lower.position.y = -CARD_SIZE.h / 4;
  letter.visible = false;
  return { letter, texture };
}

export function createCard(): CardParts {
  const canvas = document.createElement('canvas');
  canvas.width = 680;
  canvas.height = 400;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const card = new Group();
  card.name = 'WeekCard';
  const paper = new MeshBasicMaterial({ map: texture });
  PAPERS.push(paper);
  const face = new Mesh(new PlaneGeometry(CARD_SIZE.w, CARD_SIZE.h), paper);
  face.name = 'WeekCardFace';
  const back = new Mesh(
    new PlaneGeometry(CARD_SIZE.w, CARD_SIZE.h),
    new MeshStandardMaterial({ color: 0xe9dfc9, roughness: 0.95, side: DoubleSide }),
  );
  back.position.z = -0.0008;
  card.add(face, back);
  card.visible = false;

  const jar = new Group();
  jar.name = 'CoinJar';
  jar.position.set(JAR_POSITION.x, JAR_POSITION.y, JAR_POSITION.z);
  const glass = new PartBuilder();
  glass.color(0xe4efec);
  prism(glass, WORLD, 0, 0, 0, 0.005, 0.034, 0.037, 22, { smooth: true, bottom: true });
  prism(glass, WORLD, 0, 0, 0.005, 0.078, 0.037, 0.037, 22, { smooth: true });
  prism(glass, WORLD, 0, 0, 0.078, 0.088, 0.037, 0.03, 22, { smooth: true });
  annulus(glass, WORLD.at(0, 0.088, 0), 0, 0, 0, 0.026, 0.03, 22, true);
  const jarMaterial = new MeshStandardMaterial({ roughness: 0.05, metalness: 0, vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false });
  const jarMesh = glass.mesh(jarMaterial, 'CoinJarGlass');
  jarMesh.renderOrder = 3;
  jar.add(jarMesh);
  // A brass band round the neck, so it reads as a jar and not a glass.
  const band = new PartBuilder();
  band.color(0xb8933f);
  prism(band, WORLD, 0, 0, 0.08, 0.087, 0.0345, 0.0315, 22, { smooth: true });
  jar.add(band.mesh(glowing(0.35, 0.85), 'CoinJarBand'));

  // Large brass coins in two staggered piles, so a missing one shows.
  const coinMaterial = glowing(0.3, 0.95);
  const coins: Mesh[] = [];
  for (let k = 0; k < JAR_COINS; k += 1) {
    const c = new PartBuilder();
    c.color(k % 2 === 0 ? 0xe2bb52 : 0xd6ad47);
    prism(c, WORLD, 0, 0, 0, 0.0042, 0.0165, 0.0165, 20, { smooth: true, top: true, bottom: true });
    c.color(0xb38e3a);
    annulus(c, WORLD.at(0, 0.0043, 0), 0, 0, 0, 0.0128, 0.0146, 20, true);
    const coin = c.mesh(coinMaterial, `Coin${k}`);
    const pile = k % 2;
    const level = Math.floor(k / 2);
    coin.position.set(pile === 0 ? -0.0175 : 0.0175, 0.005 + level * 0.0045 + (pile === 1 ? 0.0015 : 0), pile === 0 ? 0.005 : -0.005);
    coin.rotation.z = pile === 0 ? 0.03 : -0.05;
    coins.push(coin);
    jar.add(coin);
  }
  return { card, texture, jar, coins };
}

/** The card's face: what moved, the number in large type, and the real week it was. */
export function drawCard(texture: CanvasTexture, title: string, figure: string, tag: string): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  const { width: w, height: h } = canvas;
  g.fillStyle = '#f3ead8';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b4a27f';
  g.lineWidth = 6;
  g.strokeRect(16, 16, w - 32, h - 32);
  g.fillStyle = '#2e2620';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 50px Georgia, "Times New Roman", serif';
  g.fillText(title, w / 2, 92, w - 70);
  g.font = '700 92px Georgia, "Times New Roman", serif';
  g.fillText(figure, w / 2, 196, w - 70);
  g.fillStyle = '#4a3f34';
  g.font = '600 44px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.fillText(tag, w / 2, 304, w - 70);
  texture.needsUpdate = true;
}

/** A letter on the same card: plain paper, a fold across the middle, its lines as written. */
export function drawLetter(texture: CanvasTexture, lines: readonly string[]): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  const { width: w, height: h } = canvas;
  g.fillStyle = '#f6f2ea';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120, 104, 84, 0.25)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  g.fillStyle = '#2e2620';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const sizes = [46, 54, 46];
  lines.forEach((line, i) => {
    g.font = `${i === 1 ? 700 : 500} ${sizes[i] ?? 46}px Georgia, "Times New Roman", serif`;
    g.fillText(line, w / 2, 96 + i * 104, w - 70);
  });
  texture.needsUpdate = true;
}
