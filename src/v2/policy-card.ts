import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { sharpText, TEXT_ANISOTROPY } from '../station/sharp-text.js';
import { CARD_PAPER, CARD_TYPE, type CardStyle, layoutPolicyCard, type PolicyCardText } from './policy-card-layout.js';

/** The card's size (m): an official paper's proportions, large enough to read held at arm's length. */
export const POLICY_CARD_SIZE = { w: 0.24, h: (0.24 * CARD_PAPER.h) / CARD_PAPER.w } as const;

const FONTS: Readonly<Record<CardStyle, string>> = {
  title: `700 ${CARD_TYPE.title.size}px Georgia, "Times New Roman", "Noto Serif", serif`,
  body: `500 ${CARD_TYPE.body.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  quote: `italic 500 ${CARD_TYPE.quote.size}px Georgia, "Times New Roman", "Noto Serif", serif`,
};
const INK: Readonly<Record<CardStyle, string>> = { title: '#1d1a17', body: '#24201c', quote: '#4a3f34' };

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
 * Writes `text` on the card: cream paper with a double frame, the
 * headline in a serif with a rule under it, then what was done, when, the
 * effect, the cost and the objection (in italics), as the design writes them.
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
  for (const line of layout.lines) {
    g.font = FONTS[line.style];
    g.fillStyle = INK[line.style];
    g.fillText(line.text, margin, line.y, w - 2 * margin);
  }
  // A rule under the headline, as on an official paper.
  g.fillStyle = '#2a2420';
  g.fillRect(margin, layout.titleFoot + 26, w - 2 * margin, 3);
  // Bölüm 8b: a small sign before each field, read without words: a calendar (when), a tick (it worked),
  // a coin (the price), a speech balloon (the objection). The word's picture is a seal over the top edge (showCard).
  let field: FieldSign | null = null;
  for (const line of layout.lines) {
    const next: FieldSign | null = line.text.startsWith('In real life') ? 'when' : line.text.startsWith('It worked') || line.text.startsWith('Has it worked') ? 'effect' : line.text.startsWith('The price') ? 'cost' : line.style === 'quote' && field !== 'quote' ? 'quote' : null;
    if (next == null) continue;
    field = next;
    drawFieldSign(g, next, margin / 2, line.y - 16);
  }
  if (import.meta.env.DEV && !layout.fits) console.info(`[policy card] "${text.title}" runs past the paper's foot (${layout.bottom} px of ${h})`);
  texture.needsUpdate = true;
  return layout.fits;
}

type FieldSign = 'when' | 'effect' | 'cost' | 'quote';

/** A small sign drawn in the margin before a field (centre x, y; about 40 px). */
function drawFieldSign(g: CanvasRenderingContext2D, kind: FieldSign, x: number, y: number): void {
  g.save();
  g.strokeStyle = '#4a3f34';
  g.fillStyle = '#4a3f34';
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (kind === 'when') {
    g.strokeRect(x - 18, y - 14, 36, 32);
    g.fillRect(x - 18, y - 14, 36, 9);
    g.beginPath();
    g.moveTo(x - 9, y - 20);
    g.lineTo(x - 9, y - 10);
    g.moveTo(x + 9, y - 20);
    g.lineTo(x + 9, y - 10);
    g.stroke();
  } else if (kind === 'effect') {
    g.beginPath();
    g.moveTo(x - 16, y);
    g.lineTo(x - 4, y + 12);
    g.lineTo(x + 18, y - 14);
    g.lineWidth = 7;
    g.stroke();
  } else if (kind === 'cost') {
    g.beginPath();
    g.arc(x, y, 17, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.beginPath();
    g.ellipse(x, y - 2, 20, 14, 0, 0, Math.PI * 2);
    g.moveTo(x - 8, y + 10);
    g.lineTo(x - 14, y + 20);
    g.lineTo(x + 2, y + 11);
    g.stroke();
  }
  g.restore();
}
