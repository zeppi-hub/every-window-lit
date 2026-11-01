import { CanvasTexture, Mesh, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { WINDOW } from './layout.js';
import { interiorPaint } from './materials.js';

/**
 * A postcard from last summer (META_VR_FIKIR.md §3, 1:00) tucked on the
 * right jamb, showing the same row with every car at the kerb, so a quiet
 * road has something to be quieter than. Painted on a canvas, with no
 * words: a blank strip below the picture where a caption would go.
 */
const SIZE = { w: 0.15, h: 0.1 } as const;

export function createPostcard(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  const g = canvas.getContext('2d');
  if (g != null) paint(g, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = interiorPaint(texture);
  material.transparent = false;
  material.depthWrite = true;
  const card = new Mesh(new PlaneGeometry(SIZE.w, SIZE.h), material);
  card.name = 'Postcard';
  // On the right jamb's inner face, above the rope's handle, facing the seat; tucked a little crooked.
  card.position.set(WINDOW.halfWidth - 0.002, 1.42, -0.26);
  card.rotation.set(0, -Math.PI / 2, 0.05);
  return card;
}

function paint(g: CanvasRenderingContext2D, w: number, h: number): void {
  // The card and its picture.
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, w, h);
  const px = 26;
  const py = 24;
  const pw = w - 2 * px;
  const ph = h - 110;
  g.save();
  g.beginPath();
  g.rect(px, py, pw, ph);
  g.clip();
  const sky = g.createLinearGradient(0, py, 0, py + ph);
  sky.addColorStop(0, '#8fbbe0');
  sky.addColorStop(1, '#e4ecef');
  g.fillStyle = sky;
  g.fillRect(px, py, pw, ph);

  // The row: six fronts of different heights, windows in a grid.
  const fronts = ['#c9a37b', '#9b5a45', '#e2d2ae', '#b98c5f', '#8c503d', '#d8c299'];
  const street = py + ph - 92;
  const fw = pw / fronts.length;
  fronts.forEach((colour, i) => {
    const top = py + 26 + ((i * 37) % 5) * 14;
    const x = px + i * fw;
    g.fillStyle = colour;
    g.fillRect(x, top, fw + 1, street - top);
    g.fillStyle = 'rgba(40, 34, 30, 0.75)';
    for (let wy = top + 18; wy < street - 40; wy += 34) {
      for (let k = 0; k < 3; k += 1) g.fillRect(x + 14 + k * (fw - 28) / 3, wy, (fw - 28) / 3 - 12, 20);
    }
    // A striped awning over every other shop.
    if (i % 2 === 0) {
      for (let s = 0; s < 6; s += 1) {
        g.fillStyle = s % 2 === 0 ? '#b8423a' : '#f1e7d4';
        g.fillRect(x + 8 + (s * (fw - 16)) / 6, street - 34, (fw - 16) / 6 + 1, 12);
      }
    }
  });

  // Pavement, kerb and road.
  g.fillStyle = '#b3aca2';
  g.fillRect(px, street, pw, 22);
  g.fillStyle = '#8e8780';
  g.fillRect(px, street + 22, pw, 4);
  g.fillStyle = '#6d6863';
  g.fillRect(px, street + 26, pw, ph);

  // Every car at the kerb.
  const cars = ['#b2382f', '#2f5d8a', '#e7dbbf', '#3f6b48', '#2a2726', '#d9a63a'];
  const cw = pw / cars.length;
  cars.forEach((colour, i) => {
    const x = px + i * cw + 10;
    const y = street + 30;
    const len = cw - 20;
    g.fillStyle = colour;
    g.beginPath();
    g.roundRect(x, y + 10, len, 22, 8);
    g.roundRect(x + len * 0.22, y, len * 0.5, 16, 7);
    g.fill();
    g.fillStyle = 'rgba(200, 220, 235, 0.9)';
    g.fillRect(x + len * 0.27, y + 3, len * 0.18, 9);
    g.fillRect(x + len * 0.49, y + 3, len * 0.18, 9);
    g.fillStyle = '#1d1b1a';
    for (const wx of [x + len * 0.22, x + len * 0.78]) {
      g.beginPath();
      g.arc(wx, y + 33, 7, 0, Math.PI * 2);
      g.fill();
    }
  });
  g.restore();

  // A thin white frame round the picture.
  g.strokeStyle = '#fbf7ee';
  g.lineWidth = 6;
  g.strokeRect(px, py, pw, ph);
}
