import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { KEEPER_MARK } from './keeper-mark.js';
import { SILL } from './layout.js';

/** Lina's drawing: its size, how it stands in the basket beside the card, and where it lies on the sill beside the card after. */
export const DRAWING_SIZE = { w: 0.15, h: 0.11 } as const;
export const DRAWING_IN_BASKET = { x: 0.07, y: 0.16, z: 0.07, tilt: -0.35, yaw: -0.35 } as const;
export const DRAWING_ON_SILL = { x: 0.375, y: SILL.top + 0.02, z: -0.3, tilt: -1.2, yaw: -0.4 } as const;

const W = 512;
const H = 376;

/** A child's drawing in wax crayon, every stroke drawn twice a little apart: a man with an accordion in a tower window, a lamp with its globe, the mark. */
function draw(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, W, H);
  // The fold across the middle.
  g.strokeStyle = 'rgba(120,100,70,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  g.stroke();
  const crayon = (colour: string, width: number, stroke: () => void) => {
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [dx, dy] of [[0, 0], [2, -1]]) {
      g.save();
      g.translate(dx, dy);
      g.beginPath();
      stroke();
      g.stroke();
      g.restore();
    }
  };
  // The tower's window.
  crayon('#7a5a3a', 7, () => g.rect(40, 50, 240, 290));
  crayon('#7a5a3a', 5, () => {
    g.moveTo(40, 245);
    g.lineTo(280, 245);
  });
  // The man: head, cap, body and arms.
  crayon('#3a4a6a', 6, () => g.arc(160, 120, 30, 0, Math.PI * 2));
  crayon('#3a4a6a', 6, () => {
    g.moveTo(160, 150);
    g.lineTo(160, 240);
    g.moveTo(160, 175);
    g.lineTo(105, 195);
    g.moveTo(160, 175);
    g.lineTo(215, 195);
  });
  crayon('#b04a3a', 6, () => {
    g.moveTo(128, 104);
    g.lineTo(192, 104);
    g.lineTo(178, 84);
    g.lineTo(142, 84);
    g.closePath();
  });
  // The accordion, its folds.
  crayon('#b07a2a', 6, () => {
    g.rect(100, 185, 120, 52);
    for (let x = 118; x < 216; x += 18) {
      g.moveTo(x, 185);
      g.lineTo(x, 237);
    }
  });
  // The lamp with its globe, on the sill of the window.
  crayon('#c9962e', 6, () => {
    g.arc(385, 150, 44, 0, Math.PI * 2);
    g.moveTo(385, 194);
    g.lineTo(385, 262);
    g.moveTo(345, 262);
    g.lineTo(425, 262);
  });
  crayon('#d9602a', 7, () => {
    g.moveTo(372, 165);
    g.lineTo(385, 128);
    g.lineTo(398, 165);
    g.closePath();
  });
  // The mark, small, in the corner, as it is cut in the stone.
  crayon('#2c2418', 4, () => {
    const size = 62;
    for (const stroke of KEEPER_MARK) {
      stroke.forEach(([x, y], i) => {
        const px = 442 + x * size;
        const py = 322 - y * size;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
    }
  });
}

/** The drawing as one small canvas plane. */
export function createDrawing(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (g != null) draw(g);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(DRAWING_SIZE.w, DRAWING_SIZE.h), new MeshBasicMaterial({ map: texture, side: DoubleSide }));
  mesh.name = 'LinaDrawing';
  mesh.visible = false;
  return mesh;
}
