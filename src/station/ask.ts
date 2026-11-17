import { BoxGeometry, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { largerCaptions } from '../comfort.js';
import { askSize } from './caption.js';
import { sharpText, TEXT_ANISOTROPY } from './sharp-text.js';

/**
 * The three questions the Keeper can put to Tocco: poke him and they show
 * on a small panel just above his line, one row each; poke a row to ask.
 * The rows are thin invisible slabs over the panel for the fingertip (and
 * a pointing ray) to find; ToccoSystem places them with the panel and
 * parks them far below the town while it is closed, since pointer rays
 * ignore visibility.
 */

/** The panel, 30 by 11 cm, in three rows. */
export const ASK_SIZE = { w: 0.3, h: 0.1125 } as const;
export const ASK_ROWS = 3;

export interface AskParts {
  panel: Mesh;
  texture: CanvasTexture;
  rows: Mesh[];
}

export function createAsk(): AskParts {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 240;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = TEXT_ANISOTROPY;
  const panel = new Mesh(new PlaneGeometry(ASK_SIZE.w, ASK_SIZE.h), sharpText(new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })));
  panel.name = 'AskPanel';
  panel.renderOrder = 2;
  panel.visible = false;
  const rowMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const rows = Array.from({ length: ASK_ROWS }, (_, i) => {
    const row = new Mesh(new BoxGeometry(ASK_SIZE.w * 0.94, (ASK_SIZE.h / ASK_ROWS) * 0.9, 0.012), rowMaterial);
    row.name = `AskRow${i}`;
    return row;
  });
  return { panel, texture, rows };
}

/** The questions as rows, white on dark bands like his line; larger at the larger caption size (comfort.ts). */
export function drawAsk(texture: CanvasTexture, questions: readonly string[], large = largerCaptions()): void {
  const size = askSize(large);
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  const rowH = h / ASK_ROWS;
  questions.forEach((question, i) => {
    g.fillStyle = 'rgba(20, 18, 16, 0.9)';
    g.beginPath();
    g.roundRect(10, i * rowH + size.inset, w - 20, rowH - 2 * size.inset, size.radius);
    g.fill();
    g.fillStyle = '#f6f1e6';
    g.font = `600 ${size.font}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(question, w / 2, i * rowH + rowH / 2, w - 60);
  });
  texture.needsUpdate = true;
}
