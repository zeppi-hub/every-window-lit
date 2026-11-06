import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { blob, Frame, PartBuilder, prism, WORLD } from './facade.js';
import { carveMark, KEEPER_MARK } from './keeper-mark.js';
import { SILL } from './layout.js';
import { modelMesh } from './models.js';

/** Where a globe not yet on the lamp waits once the morning's basket has gone (m): on the sill in front of the lamp, in easy reach. */
export const GLOBE_ON_SILL = { x: 0.53, y: SILL.top - 0.054, z: -0.29 } as const;
/** How the globe stands in a basket, from the middle of its floor. */
export const GLOBE_IN_BASKET = { x: 0.08, y: -0.024, z: 0 } as const;
/** How the note leans in the basket, from the middle of its floor. */
export const NOTE_IN_BASKET = { x: -0.07, y: 0.15, z: 0.08, tilt: -0.5, yaw: -0.45 } as const;
export const NOTE_SIZE = { w: 0.17, h: 0.075 } as const;

export interface GlobeParts {
  globe: Mesh;
  note: Mesh;
  noteTexture: CanvasTexture;
}

/**
 * The loose glass globe, the same shape as the lantern's, with the lamp mark
 * cut into its near side; and the paper note that rides with it. The lamp
 * keeps its own glass (the flame's parent): the loose one stands in for it
 * only while it is off the lamp, or may be lifted.
 */
export function createGlobe(): GlobeParts {
  const material = new MeshBasicMaterial({ color: 0xb4c0c4, transparent: true, opacity: 0.5, depthWrite: false });
  const shape = modelMesh('lantern', 'Lantern_glass');
  let globe: Mesh;
  if (shape != null) {
    globe = new Mesh(shape.geometry, material);
  } else {
    const b = new PartBuilder();
    b.color(0xffffff);
    prism(b, WORLD.at(0, 0.079, 0), 0, 0, 0, 0.11, 0.019, 0.019, 16, { smooth: true });
    globe = b.mesh(material, 'LooseGlobeShape');
  }
  globe.name = 'LooseGlobe';
  globe.visible = false;
  // A soft bead inside, so a hand finds something to take hold of through the clear glass.
  const bead = new PartBuilder();
  bead.color(0xdfe7ea);
  blob(bead, [0, 0.084, 0], 0.006, 1);
  carveMark(bead, new Frame([-0.0184, 0.084, 0.0268], [0.825, 0, 0.565], [-0.565, 0, 0.825], [0, -1, 0]), KEEPER_MARK, 0.024, 0.0016);
  globe.add(bead.mesh(new MeshBasicMaterial({ vertexColors: true }), 'LooseGlobeMark'));

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 226;
  const noteTexture = new CanvasTexture(canvas);
  noteTexture.colorSpace = SRGBColorSpace;
  const note = new Mesh(new PlaneGeometry(NOTE_SIZE.w, NOTE_SIZE.h), new MeshBasicMaterial({ map: noteTexture }));
  note.name = 'BasketNote';
  note.visible = false;
  return { globe, note, noteTexture };
}

/** Writes the note: handwritten-looking ink on old paper, one line, or two if it is long. */
export function drawNote(texture: CanvasTexture, text: string): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  g.fillStyle = '#ece1c8';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#c9b78f';
  g.lineWidth = 3;
  g.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  g.fillStyle = '#2c2418';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '500 52px Georgia, serif';
  const words = text.split(' ');
  if (g.measureText(text).width <= canvas.width - 56) {
    g.fillText(text, canvas.width / 2, canvas.height / 2);
  } else {
    const half = Math.ceil(words.length / 2);
    g.fillText(words.slice(0, half).join(' '), canvas.width / 2, canvas.height / 2 - 34);
    g.fillText(words.slice(half).join(' '), canvas.width / 2, canvas.height / 2 + 34);
  }
  texture.needsUpdate = true;
}
