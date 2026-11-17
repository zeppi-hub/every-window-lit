import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { sharpText, TEXT_ANISOTROPY } from '../station/sharp-text.js';
import { CARD_PAPER, CARD_TYPE, type CardStyle, layoutPolicyCard, type PolicyCardText } from './policy-card-layout.js';

/** The card's size (m): an official paper's proportions, large enough to read held at arm's length. */
export const POLICY_CARD_SIZE = { w: 0.24, h: (0.24 * CARD_PAPER.h) / CARD_PAPER.w } as const;

const FONTS: Readonly<Record<CardStyle, string>> = {
  kicker: `700 ${CARD_TYPE.kicker.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  title: `700 ${CARD_TYPE.title.size}px Georgia, "Times New Roman", "Noto Serif", serif`,
  label: `700 ${CARD_TYPE.label.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  body: `500 ${CARD_TYPE.body.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
};
const INK: Readonly<Record<CardStyle, string>> = { kicker: '#8a1c1c', title: '#1d1a17', label: '#6b5f50', body: '#24201c' };

export interface PolicyCardParts {
  card: Group;
  texture: CanvasTexture;
}

/** A blank policy card: one plane, its words drawn crisp (sharp-text.ts); drawPolicyCard writes it. */
export function createPolicyCard(): PolicyCardParts {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_PAPER.w;
  canvas.height = CARD_PAPER.h;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = TEXT_ANISOTROPY;
  const card = new Group();
  card.name = 'PolicyCard';
  const face = new Mesh(new PlaneGeometry(POLICY_CARD_SIZE.w, POLICY_CARD_SIZE.h), sharpText(new MeshBasicMaterial({ map: texture, side: DoubleSide })));
  face.name = 'PolicyCardFace';
  card.add(face);
  return { card, texture };
}

/**
 * Writes `text` on the card: cream paper with a ruled head, the red
 * kicker, the heading in a serif, each section under a small grey label.
 * Returns whether it all fits (a text too long should be shortened, not
 * squeezed).
 */
export function drawPolicyCard(texture: CanvasTexture, text: PolicyCardText): boolean {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return false;
  const { w, h, margin } = CARD_PAPER;
  g.fillStyle = '#f5f0e4';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2a2420';
  g.lineWidth = 6;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.lineWidth = 2;
  g.strokeRect(36, 36, w - 72, h - 72);
  const measure = (row: string, style: CardStyle) => {
    g.font = FONTS[style];
    return g.measureText(row).width;
  };
  const layout = layoutPolicyCard(text, measure);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let titleFoot = 0;
  for (const line of layout.lines) {
    g.font = FONTS[line.style];
    g.fillStyle = INK[line.style];
    g.fillText(line.text, margin, line.y, w - 2 * margin);
    if (line.style === 'title') titleFoot = line.y;
  }
  // A rule under the heading, as on an official paper.
  g.fillStyle = '#2a2420';
  g.fillRect(margin, titleFoot + 26, w - 2 * margin, 3);
  if (import.meta.env.DEV && !layout.fits) console.info(`[policy card] "${text.title}" runs past the paper's foot (${layout.bottom} px of ${h})`);
  texture.needsUpdate = true;
  return layout.fits;
}
